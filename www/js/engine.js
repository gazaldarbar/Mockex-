/* Mockex paper-trading engine. Pure functions over a plain-object account, so it is
 * trivially testable and persistable as JSON. Nothing here touches the network or any
 * real exchange: every balance, fill and fee is simulated. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MMR = 0.005; // maintenance margin, share of entry notional
  const DUP_WINDOW_MS = 2000;
  const EPS = 1e-9;

  const DEFAULT_SETTINGS = {
    fee: 0.001,        // 0.1% per side
    slippage: 0.0005,  // 0.05% adverse fill
    maxLev: 20,
    maxPosPct: 60,     // max margin per position, % of equity
    maxOpen: 10,
    maxRiskPct: 10,    // max loss at stop, % of equity
  };

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const dirOf = (side) => (side === 'long' ? 1 : -1);

  function newAccount(startBalance = 10000) {
    return {
      cash: startBalance, start: startBalance, realized: 0,
      positions: [], orders: [], history: [], txs: [],
      seq: 1, lastSig: null, lastSigT: 0,
    };
  }

  function slipPrice(price, action, slipPct) {
    return action === 'buy' ? price * (1 + slipPct) : price * (1 - slipPct);
  }

  function pnlOf(p, price) { return dirOf(p.side) * (price - p.entry) * p.qty; }

  function liqPrice(p) {
    // position is liquidated when margin + pnl <= maintenance
    const d = dirOf(p.side);
    return p.entry - d * (p.margin - MMR * p.entry * p.qty) / p.qty;
  }

  function reserved(a) {
    return a.orders.reduce((s, o) => s + o.reserve, 0);
  }

  function equity(a, prices) {
    return a.cash + a.positions.reduce((s, p) => {
      const px = prices && prices[p.symbol] != null ? prices[p.symbol] : p.entry;
      return s + p.margin + pnlOf(p, px);
    }, 0);
  }

  /* ---------- sizing ---------- */
  // mode: 'usd' (margin amount) | 'pct' (% of free cash as margin) | 'risk' (% of equity risked to stop)
  function sizeQty({ mode, value, price, equity: eq, cash, leverage = 1, sl, side = 'long' }) {
    if (!(price > 0) || !(value > 0)) return 0;
    let qty = 0;
    if (mode === 'usd') qty = (value * leverage) / price;
    else if (mode === 'pct') qty = (cash * (value / 100) * leverage) / price;
    else if (mode === 'risk') {
      if (!(sl > 0)) return 0;
      const dist = side === 'long' ? price - sl : sl - price;
      if (!(dist > 0)) return 0;
      qty = (eq * (value / 100)) / dist;
      const maxQty = (cash * leverage) / price * 0.999; // cannot exceed what free cash can margin
      qty = Math.min(qty, maxQty);
    }
    return qty > 0 && isFinite(qty) ? qty : 0;
  }

  /* ---------- estimates for the confirmation sheet ---------- */
  function estimate(st, o, price, eq) {
    const action = o.side === 'long' ? 'buy' : 'sell';
    const ref = o.limit > 0 ? o.limit : price;
    const slip = o.limit > 0 ? 0 : st.slippage;
    const px = slipPrice(ref, action, slip);
    const notional = px * o.qty;
    const margin = notional / (o.leverage || 1);
    const fee = notional * st.fee;
    const d = dirOf(o.side);
    const exitFee = (x) => x * o.qty * st.fee;
    const out = {
      px, notional, margin, fee, slipCost: Math.abs(px - ref) * o.qty,
      liq: liqPrice({ side: o.side, entry: px, qty: o.qty, margin }),
    };
    if (o.tp > 0) out.profitAtTP = d * (o.tp - px) * o.qty - fee - exitFee(o.tp);
    if (o.sl > 0) out.lossAtSL = d * (o.sl - px) * o.qty - fee - exitFee(o.sl);
    if (out.profitAtTP != null && out.lossAtSL != null && out.lossAtSL < 0) out.rr = out.profitAtTP / -out.lossAtSL;
    if (eq > 0 && out.lossAtSL != null) out.riskPct = (-out.lossAtSL / eq) * 100;
    return out;
  }

  /* ---------- validation ---------- */
  function validate(a, st, o, price, eq) {
    if (!o || !o.symbol) return 'Missing symbol';
    if (o.side !== 'long' && o.side !== 'short') return 'Invalid side';
    if (!['market', 'limit', 'bracket'].includes(o.type)) return 'Invalid order type';
    if (!(o.qty > 0) || !isFinite(o.qty)) return 'Quantity must be greater than zero';
    if (!(price > 0)) return 'No live price available yet';
    const lev = o.leverage || 1;
    if (!(lev >= 1) || lev > st.maxLev) return `Leverage must be between 1x and ${st.maxLev}x`;
    if (o.type === 'limit' && !(o.limit > 0)) return 'Limit price is required';
    const entry = o.limit > 0 ? o.limit : price;
    const d = dirOf(o.side);
    if (o.sl != null && o.sl !== '' && o.sl > 0 && d * (entry - o.sl) <= 0)
      return o.side === 'long' ? 'Stop-loss must be below entry' : 'Stop-loss must be above entry';
    if (o.tp != null && o.tp !== '' && o.tp > 0 && d * (o.tp - entry) <= 0)
      return o.side === 'long' ? 'Take-profit must be above entry' : 'Take-profit must be below entry';
    if (o.trail != null && o.trail !== '' && (o.trail <= 0 || o.trail >= 50)) return 'Trailing stop must be between 0 and 50%';
    if (o.type === 'bracket' && !(o.sl > 0 && o.tp > 0)) return 'Bracket orders need both stop-loss and take-profit';
    const existing = a.positions.find((p) => p.symbol === o.symbol);
    if (existing && existing.side !== o.side) return 'Close your opposite position on this asset first';
    if (!existing && a.positions.length + a.orders.length >= st.maxOpen) return `Open position limit reached (${st.maxOpen})`;
    const e = estimate(st, o, price, eq);
    if (e.margin + e.fee > a.cash - reserved(a) + EPS) return 'Insufficient balance';
    if (e.margin > eq * (st.maxPosPct / 100) + EPS) return `Exceeds max position size (${st.maxPosPct}% of equity)`;
    if (e.riskPct != null && e.riskPct > st.maxRiskPct + 1e-6) return `Risk ${e.riskPct.toFixed(1)}% exceeds your limit of ${st.maxRiskPct}%`;
    return null;
  }

  /* ---------- fills ---------- */
  function openFill(a, st, o, refPrice, slipPct, now) {
    const px = slipPrice(refPrice, o.side === 'long' ? 'buy' : 'sell', slipPct);
    const notional = px * o.qty;
    const margin = notional / (o.leverage || 1);
    const fee = notional * st.fee;
    if (margin + fee > a.cash + EPS) return { ok: false, error: 'Insufficient balance' };
    a.cash -= margin + fee;
    let p = a.positions.find((x) => x.symbol === o.symbol && x.side === o.side);
    if (p) {
      const q = p.qty + o.qty;
      p.entry = (p.entry * p.qty + px * o.qty) / q;
      p.qty = q; p.margin += margin; p.feesPaid += fee;
      p.leverage = (p.qty * p.entry) / p.margin;
      if (o.sl > 0) p.sl = o.sl;
      if (o.tp > 0) p.tp = o.tp;
      if (o.trail > 0) p.trail = o.trail;
      if (o.tags && o.tags.length) p.tags = Array.from(new Set([...(p.tags || []), ...o.tags]));
    } else {
      p = {
        id: 'P' + a.seq++, symbol: o.symbol, side: o.side, qty: o.qty, entry: px,
        leverage: o.leverage || 1, margin, feesPaid: fee,
        sl: o.sl > 0 ? o.sl : null, tp: o.tp > 0 ? o.tp : null, trail: o.trail > 0 ? o.trail : null,
        trailBest: px, openedAt: now, tags: o.tags || [], note: o.note || '', liqWarned: false,
        type: o.type,
      };
      a.positions.push(p);
    }
    a.txs.push({ id: 'T' + a.seq++, t: now, kind: 'open', symbol: o.symbol, side: o.side, qty: o.qty, price: px, fee });
    return { ok: true, position: p, fillPrice: px, fee };
  }

  function closeFill(a, st, p, refPrice, fraction, reason, now) {
    fraction = clamp(fraction == null ? 1 : fraction, 0, 1);
    if (!(fraction > 0)) return null;
    const full = fraction > 0.9999;
    const f = full ? 1 : fraction;
    const qty = p.qty * f;
    const liq = reason === 'liq';
    const px = liq ? refPrice : slipPrice(refPrice, p.side === 'long' ? 'sell' : 'buy', st.slippage);
    const d = dirOf(p.side);
    const gross = d * (px - p.entry) * qty;
    const exitFee = px * qty * st.fee;
    const marginPart = p.margin * f;
    const entryFeePart = p.feesPaid * f;
    const net = gross - exitFee - entryFeePart;
    a.cash += Math.max(0, marginPart + gross - exitFee);
    a.realized += net;
    const trade = {
      id: 'H' + a.seq++, symbol: p.symbol, side: p.side, qty, entry: p.entry, exit: px,
      pnl: net, pnlGross: gross, fees: exitFee + entryFeePart,
      retPct: d * (px / p.entry - 1) * 100, marginPct: marginPart > 0 ? (net / marginPart) * 100 : 0,
      leverage: p.leverage, openedAt: p.openedAt, closedAt: now, reason: reason || 'manual',
      hadSL: !!(p.sl || p.trail), hadTP: !!p.tp, tags: (p.tags || []).slice(), note: p.note || '',
      partial: !full,
    };
    a.history.push(trade);
    a.txs.push({ id: 'T' + a.seq++, t: now, kind: 'close', symbol: p.symbol, side: p.side, qty, price: px, fee: exitFee, pnl: net, reason: reason || 'manual' });
    if (full) a.positions = a.positions.filter((x) => x.id !== p.id);
    else { p.qty -= qty; p.margin -= marginPart; p.feesPaid -= entryFeePart; }
    return trade;
  }

  /* ---------- public order API ---------- */
  function placeOrder(a, st, o, price, now = Date.now(), eq) {
    if (eq == null) eq = equity(a, { [o.symbol]: price });
    const err = validate(a, st, o, price, eq);
    if (err) return { ok: false, error: err };
    const sig = [o.symbol, o.side, o.type, o.qty, o.limit || 0, o.leverage || 1].join('|');
    if (a.lastSig === sig && now - a.lastSigT < DUP_WINDOW_MS) return { ok: false, error: 'Duplicate submission ignored' };
    a.lastSig = sig; a.lastSigT = now;

    if (o.limit > 0 && o.type !== 'market') {
      // marketable limit orders fill immediately at the limit or better
      const crosses = o.side === 'long' ? price <= o.limit : price >= o.limit;
      if (!crosses) {
        const e = estimate(st, o, price, eq);
        const ord = Object.assign({}, o, { id: 'O' + a.seq++, createdAt: now, reserve: e.margin + e.fee, status: 'open' });
        a.orders.push(ord);
        return { ok: true, order: ord, pending: true };
      }
      const ref = o.side === 'long' ? Math.min(price, o.limit) : Math.max(price, o.limit);
      return openFill(a, st, o, ref, 0, now);
    }
    return openFill(a, st, o, price, st.slippage, now);
  }

  function cancelOrder(a, id) {
    const i = a.orders.findIndex((o) => o.id === id);
    if (i < 0) return false;
    a.orders.splice(i, 1);
    return true;
  }

  function closePosition(a, st, id, price, fraction = 1, now = Date.now(), reason = 'manual') {
    const p = a.positions.find((x) => x.id === id);
    if (!p) return null;
    return closeFill(a, st, p, price, fraction, reason, now);
  }

  function modifyPosition(a, id, { sl, tp, trail }) {
    const p = a.positions.find((x) => x.id === id);
    if (!p) return 'Position not found';
    const d = dirOf(p.side);
    if (sl > 0 && d * (p.entry - sl) <= 0) return 'Stop-loss is on the wrong side of entry';
    if (tp > 0 && d * (tp - p.entry) <= 0) return 'Take-profit is on the wrong side of entry';
    if (trail != null && trail !== '' && (trail < 0 || trail >= 50)) return 'Trailing stop must be between 0 and 50%';
    if (sl !== undefined) p.sl = sl > 0 ? sl : null;
    if (tp !== undefined) p.tp = tp > 0 ? tp : null;
    if (trail !== undefined) { p.trail = trail > 0 ? trail : null; p.trailBest = p.trailBest || p.entry; }
    return null;
  }

  function trailStop(p) {
    if (!(p.trail > 0)) return null;
    const t = p.trail / 100;
    return p.side === 'long' ? p.trailBest * (1 - t) : p.trailBest * (1 + t);
  }

  /* Feed every live price through here. Returns the events it caused. */
  function onTick(a, st, symbol, price, now = Date.now()) {
    const events = [];
    if (!(price > 0)) return events;

    for (const o of a.orders.slice()) {
      if (o.symbol !== symbol) continue;
      const hit = o.side === 'long' ? price <= o.limit : price >= o.limit;
      if (!hit) continue;
      a.orders = a.orders.filter((x) => x.id !== o.id);
      const res = openFill(a, st, o, o.limit, 0, now);
      if (res.ok) events.push({ type: 'filled', symbol, order: o, position: res.position, price: res.fillPrice });
      else events.push({ type: 'rejected', symbol, order: o, error: res.error });
    }

    for (const p of a.positions.slice()) {
      if (p.symbol !== symbol) continue;
      if (p.side === 'long') p.trailBest = Math.max(p.trailBest || p.entry, price);
      else p.trailBest = Math.min(p.trailBest || p.entry, price);
      const d = dirOf(p.side);
      const liq = liqPrice(p);

      if (d * (price - liq) <= 0) {
        const t = closeFill(a, st, p, price, 1, 'liq', now);
        events.push({ type: 'liq', symbol, trade: t });
        continue;
      }
      const ts = trailStop(p);
      const slHit = p.sl > 0 && d * (price - p.sl) <= 0;
      const trHit = ts != null && d * (price - ts) <= 0;
      if (slHit || trHit) {
        const reason = trHit && !slHit ? 'trail' : 'sl';
        const t = closeFill(a, st, p, price, 1, reason, now);
        events.push({ type: reason, symbol, trade: t });
        continue;
      }
      if (p.tp > 0 && d * (price - p.tp) >= 0) {
        const t = closeFill(a, st, p, price, 1, 'tp', now);
        events.push({ type: 'tp', symbol, trade: t });
        continue;
      }
      // warn once when 80% of the way from entry to liquidation
      const span = Math.abs(p.entry - liq);
      if (!p.liqWarned && span > 0 && d * (p.entry - price) >= span * 0.8) {
        p.liqWarned = true;
        events.push({ type: 'liqwarn', symbol, position: p, liq });
      }
    }
    return events;
  }

  /* ---------- statistics ---------- */
  function maxDrawdown(series) {
    let peak = -Infinity, dd = 0;
    for (const pt of series) {
      const v = Array.isArray(pt) ? pt[1] : pt;
      if (v > peak) peak = v;
      if (peak > 0) dd = Math.max(dd, (peak - v) / peak);
    }
    return dd * 100;
  }

  function stats(a, series) {
    const h = a.history;
    const wins = h.filter((t) => t.pnl > 0), losses = h.filter((t) => t.pnl <= 0);
    const sum = (arr) => arr.reduce((s, t) => s + t.pnl, 0);
    const gw = sum(wins), gl = -sum(losses);
    const n = h.length;
    return {
      trades: n, wins: wins.length, losses: losses.length,
      winRate: n ? (wins.length / n) * 100 : 0,
      total: sum(h),
      avgWin: wins.length ? gw / wins.length : 0,
      avgLoss: losses.length ? -gl / losses.length : 0,
      profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      expectancy: n ? sum(h) / n : 0,
      best: n ? h.reduce((b, t) => (t.pnl > b.pnl ? t : b), h[0]) : null,
      worst: n ? h.reduce((b, t) => (t.pnl < b.pnl ? t : b), h[0]) : null,
      maxDD: series && series.length ? maxDrawdown(series) : 0,
    };
  }

  return {
    DEFAULT_SETTINGS, MMR, newAccount, slipPrice, pnlOf, liqPrice, equity, reserved, sizeQty,
    estimate, validate, placeOrder, cancelOrder, closePosition, modifyPosition, trailStop,
    onTick, stats, maxDrawdown,
  };
});
