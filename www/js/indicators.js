/* Technical indicators. Every function takes arrays and returns arrays of the same
 * length (null where there is not enough history yet). Candle shape: {t,o,h,l,c,v}. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ind = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const nulls = (n) => new Array(n).fill(null);

  function sma(vals, period) {
    const out = nulls(vals.length);
    let sum = 0;
    for (let i = 0; i < vals.length; i++) {
      sum += vals[i];
      if (i >= period) sum -= vals[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(vals, period) {
    const out = nulls(vals.length);
    const k = 2 / (period + 1);
    let prev = null, seed = 0, cnt = 0;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v == null) continue;
      if (prev == null) {
        seed += v; cnt++;
        if (cnt === period) { prev = seed / period; out[i] = prev; }
      } else { prev = v * k + prev * (1 - k); out[i] = prev; }
    }
    return out;
  }

  // Wilder smoothing (RMA)
  function rma(vals, period) {
    const out = nulls(vals.length);
    let prev = null, seed = 0, cnt = 0;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v == null) continue;
      if (prev == null) {
        seed += v; cnt++;
        if (cnt === period) { prev = seed / period; out[i] = prev; }
      } else { prev = (prev * (period - 1) + v) / period; out[i] = prev; }
    }
    return out;
  }

  function rsi(closes, period = 14) {
    const gains = nulls(closes.length), losses = nulls(closes.length);
    for (let i = 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      gains[i] = Math.max(d, 0); losses[i] = Math.max(-d, 0);
    }
    const ag = rma(gains, period), al = rma(losses, period);
    return closes.map((_, i) => {
      if (ag[i] == null || al[i] == null) return null;
      if (al[i] === 0) return ag[i] === 0 ? 50 : 100;
      return 100 - 100 / (1 + ag[i] / al[i]);
    });
  }

  function macd(closes, fast = 12, slow = 26, signal = 9) {
    const ef = ema(closes, fast), es = ema(closes, slow);
    const line = closes.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
    const sig = ema(line, signal);
    const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
    return { line, signal: sig, hist };
  }

  function bollinger(closes, period = 20, mult = 2) {
    const mid = sma(closes, period);
    const up = nulls(closes.length), lo = nulls(closes.length);
    for (let i = period - 1; i < closes.length; i++) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / period);
      up[i] = mid[i] + mult * sd; lo[i] = mid[i] - mult * sd;
    }
    return { mid, up, lo };
  }

  function trueRange(c) {
    return c.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c))));
  }

  function atr(c, period = 14) { return rma(trueRange(c), period); }

  // Session VWAP that resets at each UTC day boundary
  function vwap(c) {
    const out = nulls(c.length);
    let pv = 0, vv = 0, day = null;
    for (let i = 0; i < c.length; i++) {
      const d = Math.floor(c[i].t / 86400000);
      if (d !== day) { day = d; pv = 0; vv = 0; }
      const tp = (c[i].h + c[i].l + c[i].c) / 3;
      pv += tp * c[i].v; vv += c[i].v;
      out[i] = vv > 0 ? pv / vv : tp;
    }
    return out;
  }

  function stochRsi(closes, rsiP = 14, stochP = 14, kP = 3, dP = 3) {
    const r = rsi(closes, rsiP);
    const raw = nulls(closes.length);
    for (let i = 0; i < r.length; i++) {
      if (i < stochP - 1 || r[i] == null) continue;
      let lo = Infinity, hi = -Infinity, ok = true;
      for (let j = i - stochP + 1; j <= i; j++) {
        if (r[j] == null) { ok = false; break; }
        lo = Math.min(lo, r[j]); hi = Math.max(hi, r[j]);
      }
      if (ok) raw[i] = hi === lo ? 0 : ((r[i] - lo) / (hi - lo)) * 100;
    }
    const k = smaNullable(raw, kP);
    const d = smaNullable(k, dP);
    return { k, d };
  }

  function smaNullable(vals, period) {
    const out = nulls(vals.length);
    for (let i = 0; i < vals.length; i++) {
      if (i < period - 1) continue;
      let s = 0, ok = true;
      for (let j = i - period + 1; j <= i; j++) { if (vals[j] == null) { ok = false; break; } s += vals[j]; }
      if (ok) out[i] = s / period;
    }
    return out;
  }

  function adx(c, period = 14) {
    const n = c.length;
    const pdm = nulls(n), mdm = nulls(n);
    for (let i = 1; i < n; i++) {
      const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
      pdm[i] = up > dn && up > 0 ? up : 0;
      mdm[i] = dn > up && dn > 0 ? dn : 0;
    }
    const tr = trueRange(c); tr[0] = null;
    const atrv = rma(tr, period), p = rma(pdm, period), m = rma(mdm, period);
    const pdi = nulls(n), mdi = nulls(n), dx = nulls(n);
    for (let i = 0; i < n; i++) {
      if (atrv[i] == null || p[i] == null || m[i] == null || atrv[i] === 0) continue;
      pdi[i] = (100 * p[i]) / atrv[i]; mdi[i] = (100 * m[i]) / atrv[i];
      const s = pdi[i] + mdi[i];
      dx[i] = s === 0 ? 0 : (100 * Math.abs(pdi[i] - mdi[i])) / s;
    }
    return { adx: rma(dx, period), pdi, mdi };
  }

  /* Swing-pivot support/resistance: cluster pivots that sit within `tol` of each other
   * and keep the levels touched most often. */
  function supportResistance(c, left = 5, right = 5, tol = 0.004, max = 6) {
    const pivots = [];
    for (let i = left; i < c.length - right; i++) {
      let isH = true, isL = true;
      for (let j = i - left; j <= i + right; j++) {
        if (c[j].h > c[i].h) isH = false;
        if (c[j].l < c[i].l) isL = false;
      }
      if (isH) pivots.push(c[i].h);
      if (isL) pivots.push(c[i].l);
    }
    const clusters = [];
    pivots.sort((a, b) => a - b).forEach((p) => {
      const cl = clusters.find((x) => Math.abs(x.price - p) / p <= tol);
      if (cl) { cl.price = (cl.price * cl.n + p) / (cl.n + 1); cl.n++; } else clusters.push({ price: p, n: 1 });
    });
    return clusters.sort((a, b) => b.n - a.n).slice(0, max).map((x) => x.price);
  }

  return { sma, ema, rma, rsi, macd, bollinger, atr, vwap, stochRsi, adx, supportResistance, trueRange };
});
