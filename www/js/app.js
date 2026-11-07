/* App controller: trading actions, tick pipeline, alerts, notifications, live DOM painting, routing, sheets. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const S = () => Store.s;
  const acts = {};
  const App = { $, $$, acts, overlays: [], tab: 'home' };
  window.App = App;

  App.px = (sym) => { const p = Market.prices[sym]; return p ? p.price : null; };
  App.pmap = () => Rewards.pricesMap();
  App.equity = () => Engine.equity(S().acct, App.pmap());
  App.unreal = () => S().acct.positions.reduce((s, p) => s + Engine.pnlOf(p, App.px(p.symbol) || p.entry), 0);
  App.dayPnl = () => { const d = S().dayStart; return d ? App.equity() - d.eq : 0; };

  /* ---------- feedback ---------- */
  App.haptic = (k) => {
    if (!S().settings.haptics) return;
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) { try { H.impact({ style: k === 'heavy' ? 'HEAVY' : k === 'light' ? 'LIGHT' : 'MEDIUM' }); } catch (e) { /* ignore */ } return; }
    if (navigator.vibrate) navigator.vibrate(k === 'heavy' ? 30 : k === 'success' ? [12, 40, 12] : k === 'error' ? [40, 30, 40] : 10);
  };
  App.toast = (msg, kind, ms = 3200) => {
    const box = $('#toasts'); const el = document.createElement('div'); el.className = 'toast glass ' + (kind || ''); el.textContent = msg; box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
  };
  App.confetti = () => {
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const cv = document.createElement('canvas'); cv.className = 'confetti'; cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
    const c = cv.getContext('2d'); const cols = ['#2ee6a6', '#8b7bff', '#22d3ee', '#ffc857', '#ff5fd2'];
    const ps = Array.from({ length: 90 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 14 - 4, s: 4 + Math.random() * 5, c: cols[(Math.random() * 5) | 0], r: Math.random() * 6, l: 1 }));
    let f = 0; (function step() { c.clearRect(0, 0, cv.width, cv.height); ps.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.38; p.r += 0.2; p.l -= 0.011; c.globalAlpha = Math.max(0, p.l); c.fillStyle = p.c; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); c.restore(); }); if (++f < 100) requestAnimationFrame(step); else cv.remove(); })();
  };

  /* ---------- notifications ---------- */
  App.notify = (title, body, extra) => {
    const st = S(); const n = Object.assign({ id: Store.uid(), t: Date.now(), title, body, read: false }, extra || {});
    st.notifs.unshift(n); if (st.notifs.length > 200) st.notifs.length = 200; Store.save(); Store.emit('notifs');
    App.toast(title + (body ? ' — ' + body : ''), extra && extra.kind === 'bad' ? 'err' : 'ok', 4500); App.haptic(extra && extra.kind === 'bad' ? 'error' : 'success');
    if (!st.settings.notify) return;
    try {
      const LN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
      if (LN) { LN.schedule({ notifications: [{ id: Math.floor(Math.random() * 2e9), title, body: body || '' }] }); return; }
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, icon: 'icons/icon-192.png', tag: n.id }));
        else new Notification(title, { body });
      }
    } catch (e) { /* notifications are best effort */ }
  };
  App.askNotify = async () => {
    try {
      const LN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
      if (LN) { const r = await LN.requestPermissions(); return r.display === 'granted'; }
      if ('Notification' in window) { const r = await Notification.requestPermission(); return r === 'granted'; }
    } catch (e) { /* ignore */ }
    return false;
  };
  App.unread = () => S().notifs.filter((n) => !n.read).length;

  /* ---------- equity series ---------- */
  let lastEq = 0;
  App.recordEquity = (force) => {
    const st = S(), now = Date.now(), eq = App.equity(); const last = st.equity[st.equity.length - 1];
    if (!st.dayStart || st.dayStart.k !== F.dayKey()) st.dayStart = { k: F.dayKey(), eq };
    if (!force && last && now - last[0] < 30000) return;
    if (!force && last && Math.abs(eq - last[1]) < 0.005) return;
    st.equity.push([now, +eq.toFixed(2)]);
    if (st.equity.length > 3000) st.equity = st.equity.filter((_, i) => i % 2 === 0 || i > 2000);
    lastEq = eq; Store.save();
  };

  /* ---------- trading actions ---------- */
  App.guard = (sym) => {
    if (!Market.sim && Market.stale(sym) && App.px(sym) == null) return 'No live price yet for ' + F.base(sym);
    if (!Market.sim && Market.stale(sym)) return 'Price feed is stale. Wait for it to reconnect before trading.';
    const m = Market.marketOpen(sym); if (!m.open) return F.base(sym) + ' market is closed (' + m.label + ')';
    return null;
  };
  App.place = (o) => {
    const g = App.guard(o.symbol); if (g) return { ok: false, error: g };
    const r = Engine.placeOrder(S().acct, Store.eng(), o, App.px(o.symbol), Date.now(), App.equity());
    if (r.ok) { Market.reconcile(); App.afterTrade(); }
    return r;
  };
  App.close = (id, frac) => {
    const p = S().acct.positions.find((x) => x.id === id); if (!p) return null;
    const g = App.guard(p.symbol); if (g) { App.toast(g, 'err'); return null; }
    const t = Engine.closePosition(S().acct, Store.eng(), id, App.px(p.symbol), frac, Date.now(), 'manual');
    if (t) { App.afterTrade(); App.toast(`Closed ${F.base(t.symbol)} ${t.pnl >= 0 ? '+' : ''}${F.money(t.pnl)}`, t.pnl >= 0 ? 'ok' : 'err'); if (t.pnl > 0) App.confetti(); }
    return t;
  };
  App.cancel = (id) => { Engine.cancelOrder(S().acct, id); Market.reconcile(); App.afterTrade(); };
  App.afterTrade = () => {
    App.recordEquity(true); Store.save(true);
    Rewards.checkAchievements().forEach((a) => { App.notify('Achievement unlocked: ' + a.t, a.d, { kind: 'good', sym: null }); App.confetti(); });
    Store.emit('account'); Market.reconcile();
  };

  /* ---------- tick pipeline ---------- */
  const EV_TEXT = {
    sl: (e) => ['Stop-loss hit', `${F.base(e.symbol)} closed ${F.smoney(e.trade.pnl)}`, 'bad'],
    tp: (e) => ['Take-profit hit', `${F.base(e.symbol)} closed ${F.smoney(e.trade.pnl)}`, 'good'],
    trail: (e) => ['Trailing stop triggered', `${F.base(e.symbol)} closed ${F.smoney(e.trade.pnl)}`, e.trade.pnl >= 0 ? 'good' : 'bad'],
    liq: (e) => ['Position liquidated', `${F.base(e.symbol)} lost its margin`, 'bad'],
    liqwarn: (e) => ['Liquidation warning', `${F.base(e.symbol)} is close to liquidation at ${F.price(e.liq)}`, 'bad'],
    filled: (e) => ['Limit order filled', `${F.base(e.symbol)} ${e.order.side} @ ${F.price(e.price)}`, 'good'],
    rejected: (e) => ['Order rejected', e.error, 'bad'],
  };
  Market.on('tick', (sym) => {
    const st = S(); const px = App.px(sym);
    const ev = Engine.onTick(st.acct, Store.eng(), sym, px, Date.now());
    if (ev.length) {
      ev.forEach((e) => { const t = EV_TEXT[e.type]; if (t) { const [a, b, k] = t(e); App.notify(a, b, { sym, kind: k, pos: true }); } });
      App.afterTrade(); if (ev.some((e) => e.type === 'tp' || (e.type === 'trail' && e.trade.pnl > 0))) App.confetti();
    }
    checkPriceAlerts(sym, px); App.recordEquity(); paintSoon();
  });

  /* ---------- alerts ---------- */
  function fire(a, msg) {
    a.lastFired = Date.now(); a.count = (a.count || 0) + 1; if (!a.repeat) a.on = false;
    App.notify(`${F.base(a.symbol)} alert`, msg, { sym: a.symbol, alertId: a.id, kind: 'good' }); Store.save(); Store.emit('alerts');
  }
  const live = (a) => a.on && !(a.snoozeUntil > Date.now());
  function checkPriceAlerts(sym, px) {
    S().alerts.forEach((a) => {
      if (a.symbol !== sym || !live(a) || a.ind) return;
      if (a.type === 'above' && px >= a.value) fire(a, `Price rose to ${F.price(px)} (target ${F.price(a.value)})`);
      else if (a.type === 'below' && px <= a.value) fire(a, `Price fell to ${F.price(px)} (target ${F.price(a.value)})`);
      else if (a.type === 'pct') { const ch = (px / a.base - 1) * 100; if (Math.abs(ch) >= a.value) fire(a, `Moved ${F.pct(ch)} since the alert was set`); }
      else if (a.type === 'newhigh' || a.type === 'newlow') {
        const p = Market.prices[sym]; if (!p) return; if (a.ref == null) a.ref = a.type === 'newhigh' ? p.high : p.low;
        const cool = Date.now() - (a.lastFired || 0) > 600000;
        if (a.type === 'newhigh' && px > a.ref && cool) { a.ref = px; fire(a, `New 24h high at ${F.price(px)}`); }
        if (a.type === 'newlow' && px < a.ref && cool) { a.ref = px; fire(a, `New 24h low at ${F.price(px)}`); }
      }
    });
  }
  async function evalIndicators() {
    const list = S().alerts.filter((a) => a.ind && live(a)); if (!list.length) return;
    for (const a of list) {
      try {
        const c = await Market.recent(a.symbol, a.iv || '15m', 160); if (c.length < 40) continue;
        const closed = c.slice(0, -1), cl = closed.map((x) => x.c), n = cl.length - 1; a.state = a.state || {};
        if (a.type === 'rsi_ob' || a.type === 'rsi_os') {
          const r = Ind.rsi(cl)[n]; const hit = a.type === 'rsi_ob' ? r >= (a.value || 70) : r <= (a.value || 30);
          if (hit && a.state.hit === false) fire(a, `RSI(14) ${r.toFixed(1)} on ${a.iv} — ${a.type === 'rsi_ob' ? 'overbought' : 'oversold'}`); a.state.hit = hit;
        } else if (a.type === 'ema_cross') {
          const f = Ind.ema(cl, 9)[n], s = Ind.ema(cl, 21)[n]; const sign = f > s;
          if (a.state.sign != null && sign !== a.state.sign) fire(a, `EMA 9 crossed ${sign ? 'above' : 'below'} EMA 21 on ${a.iv}`); a.state.sign = sign;
        } else if (a.type === 'macd_cross') {
          const m = Ind.macd(cl); const sign = m.line[n] > m.signal[n];
          if (a.state.sign != null && sign !== a.state.sign) fire(a, `MACD crossed ${sign ? 'above' : 'below'} signal on ${a.iv}`); a.state.sign = sign;
        } else if (a.type === 'vol_spike') {
          const last = closed[closed.length - 1]; const avg = closed.slice(-21, -1).reduce((s, x) => s + x.v, 0) / 20;
          if (a.state.t !== last.t) { if (a.state.t != null && last.v > avg * (a.value || 2.5)) fire(a, `Volume spike ${(last.v / avg).toFixed(1)}× average on ${a.iv}`); a.state.t = last.t; }
        }
      } catch (e) { /* retry next minute */ }
    }
    Store.save();
  }
  App.evalIndicators = evalIndicators;
  setInterval(evalIndicators, 60000);

  /* ---------- live DOM painting (no re-render on ticks) ---------- */
  let painting = false;
  function paintSoon() { if (painting) return; painting = true; requestAnimationFrame(() => { painting = false; App.paint(); }); }
  function setText(el, v, cls) {
    if (el._v === v) return; const old = el._v; el._v = v; el.textContent = v;
    if (cls) { el.classList.remove('up', 'down'); el.classList.add(cls); }
    return old;
  }
  App.paint = () => {
    const st = S(); const pm = App.pmap();
    $$('[data-live]').forEach((el) => {
      const [k, a, b] = el.dataset.live.split(':'); const p = Market.prices[a];
      switch (k) {
        case 'price': { if (!p) break; const old = el._p; if (setText(el, F.price(p.price)) !== undefined && old != null && p.price !== old) { el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(p.price > old ? 'flash-up' : 'flash-down'); } el._p = p.price; break; }
        case 'chg': if (p && p.chg != null) setText(el, F.pct(p.chg), p.chg >= 0 ? 'up' : 'down'); break;
        case 'chgpill': if (p && p.chg != null) { setText(el, F.pct(p.chg)); el.className = 'pillchg ' + (p.chg >= 0 ? 'up' : 'down'); } break;
        case 'high': if (p) setText(el, F.price(p.high)); break;
        case 'low': if (p) setText(el, F.price(p.low)); break;
        case 'vol': if (p) setText(el, p.vol ? '$' + F.compact(p.vol) : '—'); break;
        case 'stale': { const s = Market.stale(a) && !Market.sim; el.classList.toggle('hide', !s); break; }
        case 'eq': { const v = Engine.equity(st.acct, pm); const old = el._p; setText(el, F.money(v)); if (old != null && Math.abs(v - old) > 0.004) { el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(v > old ? 'flash-up' : 'flash-down'); } el._p = v; break; }
        case 'dpnl': { const v = App.dayPnl(); setText(el, F.smoney(v), v >= 0 ? 'up' : 'down'); break; }
        case 'dpct': { const d = st.dayStart; const v = d && d.eq ? (App.dayPnl() / d.eq) * 100 : 0; setText(el, F.pct(v), v >= 0 ? 'up' : 'down'); break; }
        case 'ret': { const v = Rewards.ret(); setText(el, F.pct(v), v >= 0 ? 'up' : 'down'); break; }
        case 'cash': setText(el, F.money(st.acct.cash - Engine.reserved(st.acct))); break;
        case 'unreal': { const v = App.unreal(); setText(el, F.smoney(v), v >= 0 ? 'up' : 'down'); break; }
        case 'pos': {
          const pos = st.acct.positions.find((x) => x.id === a); if (!pos) break; const px = App.px(pos.symbol) || pos.entry; const pnl = Engine.pnlOf(pos, px);
          if (b === 'pnl') setText(el, F.smoney(pnl), pnl >= 0 ? 'up' : 'down');
          if (b === 'pct') setText(el, F.pct(pnl / pos.margin * 100), pnl >= 0 ? 'up' : 'down');
          if (b === 'px') setText(el, F.price(px));
          if (b === 'val') setText(el, F.money(px * pos.qty));
          if (b === 'rail') { const lo = pos.sl || pos.entry * (pos.side === 'long' ? 0.95 : 1.0), hi = pos.tp || pos.entry * (pos.side === 'long' ? 1.0 : 1.05); const a1 = pos.side === 'long' ? (pos.sl || pos.entry * 0.95) : (pos.tp || pos.entry * 0.95), a2 = pos.side === 'long' ? (pos.tp || pos.entry * 1.05) : (pos.sl || pos.entry * 1.05); void lo; void hi; el.style.left = Math.max(0, Math.min(100, ((px - a1) / (a2 - a1)) * 100)) + '%'; }
          break;
        }
        case 'spark': { const arr = Market.spark[a]; if (arr && arr.length > 1 && el._n !== arr.length + ':' + Math.round(arr[arr.length - 1] * 1e4)) { el._n = arr.length + ':' + Math.round(arr[arr.length - 1] * 1e4); Draw.spark(el, arr, arr[arr.length - 1] >= arr[0]); } break; }
        case 'status': break;
        default: break;
      }
    });
    App.paintStatus();
  };
  App.paintStatus = () => {
    const el = $('#status'); if (!el) return; const s = Market.status; const map = { live: ['LIVE', 'live'], connecting: ['CONNECTING', 'warn'], stale: ['STALE', 'warn'], offline: ['OFFLINE', 'off'], demo: ['DEMO DATA', 'warn'] };
    const m = map[Market.sim ? 'demo' : s] || map.offline; el.innerHTML = `<span class="dot ${m[1]}"></span>${m[0]}`; el.title = Market.sim ? 'Binance is unreachable, showing simulated demo prices' : 'Binance public market-data stream';
  };
  Market.on('status', App.paintStatus); Market.on('spark', paintSoon); Market.on('recovered', () => { App.toast('Back online, live data restored', 'ok'); Store.emit('account'); });
  setInterval(() => { App.paint(); }, 2000);

  /* ---------- sheets, modals, routing ---------- */
  let sheetEl = null;
  App.sheet = (html, mount, opts = {}) => {
    App.closeSheet(true);
    const el = document.createElement('div'); el.className = 'sheet glass'; el.innerHTML = `<div class="grab"></div><div class="body">${html}</div>`; document.body.appendChild(el); sheetEl = el;
    $('#scrim').classList.add('on'); requestAnimationFrame(() => el.classList.add('on')); App.haptic('light');
    if (mount) mount(el); el._onClose = opts.onClose;
    history.pushState({ sheet: 1 }, ''); el._pushed = true;
    return el;
  };
  App.closeSheet = (silent) => {
    if (!sheetEl) return; const el = sheetEl; sheetEl = null; el.classList.remove('on'); $('#scrim').classList.remove('on');
    setTimeout(() => el.remove(), 480); if (el._onClose) el._onClose();
    if (!silent && el._pushed && history.state && history.state.sheet) { el._pushed = false; ignorePop++; history.back(); }
  };
  App.confirm = (title, msg, ok = 'Confirm', danger) => new Promise((res) => {
    const m = document.createElement('div'); m.className = 'modal glass'; m.innerHTML = `<h2 style="margin:0 0 8px">${F.esc(title)}</h2><p class="muted" style="margin:0 0 18px;line-height:1.5">${msg}</p><div class="row"><button class="btn sp" data-r="0">Cancel</button><button class="btn sp ${danger ? 'sell' : 'primary'}" data-r="1">${F.esc(ok)}</button></div>`;
    document.body.appendChild(m); $('#scrim').classList.add('on'); requestAnimationFrame(() => m.classList.add('on'));
    const done = (v) => { m.classList.remove('on'); if (!sheetEl) $('#scrim').classList.remove('on'); setTimeout(() => m.remove(), 400); res(v); };
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); });
  });
  $('#scrim').addEventListener('click', () => App.closeSheet());

  let ignorePop = 0;
  App.openPage = (name, html, mount) => {
    const el = document.createElement('div'); el.className = 'page'; el.dataset.page = name; el.innerHTML = html; $('#pages').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on'))); App.overlays.push(el); history.pushState({ page: name }, '');
    if (mount) mount(el); return el;
  };
  App.closePage = (el, fromPop) => {
    el = el || App.overlays[App.overlays.length - 1]; if (!el) return; App.overlays = App.overlays.filter((x) => x !== el); el.classList.remove('on');
    if (el._destroy) el._destroy(); setTimeout(() => el.remove(), 480);
    if (!fromPop) { ignorePop++; history.back(); }
  };
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    if (sheetEl) { App.closeSheet(true); return; }
    if (App.overlays.length) App.closePage(null, true);
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const f = acts[el.dataset.act]; if (f) { App.haptic('light'); f(el, e); }
  });
  App.go = (tab) => { App.tab = tab; Store.emit('route', tab); };

  /* ---------- boot ---------- */
  App.start = () => {
    document.documentElement.dataset.theme = S().settings.theme === 'light' ? 'light' : 'dark'; document.documentElement.classList.toggle('lowfx', !!S().settings.lowfx);
    const old = /Android (\d+)/.exec(navigator.userAgent); if (old && +old[1] < 13) document.documentElement.classList.add('lowfx');   // graceful fallback: cheaper blur on older Android
    Market.boot(); setTimeout(evalIndicators, 4000);
    Store.on('storagefull', () => App.toast('Storage is full. Export a backup and clear old journal screenshots.', 'err', 6000));
    window.addEventListener('beforeunload', () => Store.save(true)); document.addEventListener('visibilitychange', () => { if (document.hidden) Store.save(true); });
  };
})();
