/* App state, persistence (localStorage, with try/catch everywhere) and formatting helpers. */
(function () {
  'use strict';
  const KEY = 'tradelab.v1';
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const DEFAULT_WATCH = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT'];

  function defaults() {
    return {
      v: 1, onboarded: false,
      user: { id: uid(), name: '', email: '' },
      settings: Object.assign({
        theme: 'dark', currency: 'USD', startBalance: 10000, haptics: true, notify: true,
        metalsProvider: 'paxg', metalsUrl: 'https://api.gold-api.com/price/{sym}', metalsPath: 'price',
        leaderboard: false, nickname: '', lowfx: false, sizeMode: 'usd',
      }, window.Engine.DEFAULT_SETTINGS),
      acct: window.Engine.newAccount(10000),
      watch: DEFAULT_WATCH.slice(), favs: [], alerts: [], notifs: [], journal: [],
      layouts: {}, drawings: {},
      // default strategy presets (indicator sets), editable and deletable
      presets: {
        'Trend: EMA50 + MACD': { sma: { on: false, p: 20 }, ema: { on: true, p: 50 }, ema2: { on: true, p: 21 }, bb: { on: false }, vwap: { on: false }, sr: { on: false }, subs: ['macd', 'adx'] },
        'Mean reversion: BB + RSI': { sma: { on: true, p: 20 }, ema: { on: false, p: 50 }, ema2: { on: false, p: 21 }, bb: { on: true }, vwap: { on: false }, sr: { on: true }, subs: ['rsi'] },
        'Momentum: EMA 9/21 + StochRSI': { sma: { on: false, p: 20 }, ema: { on: true, p: 9 }, ema2: { on: true, p: 21 }, bb: { on: false }, vwap: { on: true }, sr: { on: false }, subs: ['stoch'] },
      }, equity: [], dayStart: null,
      achv: {}, streakDays: [], challenges: { day: '', list: [] }, tags: ['breakout', 'trend', 'scalp', 'news', 'revenge', 'plan'],
    };
  }

  let S;
  try {
    const raw = localStorage.getItem(KEY);
    const d = defaults();
    if (raw) { const o = JSON.parse(raw); S = Object.assign(d, o, { settings: Object.assign(d.settings, o.settings || {}) }); } else S = d;
  } catch (e) { S = defaults(); }

  const subs = {};
  let timer = null;
  const Store = {
    get s() { return S; },
    saveFailed: false,
    on(evt, fn) { (subs[evt] = subs[evt] || []).push(fn); },
    emit(evt, a, b) { (subs[evt] || []).forEach((f) => { try { f(a, b); } catch (e) { console.error(e); } }); },
    save(now) {
      if (now) return Store._write();
      clearTimeout(timer); timer = setTimeout(Store._write, 500);
    },
    _write() {
      try { localStorage.setItem(KEY, JSON.stringify(S)); Store.saveFailed = false; }
      catch (e) { if (!Store.saveFailed) { Store.saveFailed = true; Store.emit('storagefull'); } }
    },
    uid,
    reset(balance) {
      const keep = { user: S.user, settings: S.settings, watch: S.watch, favs: S.favs, layouts: S.layouts, presets: S.presets, tags: S.tags, onboarded: true };
      const d = defaults();
      S = Object.assign(d, keep);
      S.settings.startBalance = balance;
      S.acct = window.Engine.newAccount(balance);
      Store._write();
    },
    replaceAll(obj) { const d = defaults(); S = Object.assign(d, obj, { settings: Object.assign(d.settings, obj.settings || {}) }); Store._write(); },
    eng() { const s = S.settings; return { fee: s.fee, slippage: s.slippage, maxLev: s.maxLev, maxPosPct: s.maxPosPct, maxOpen: s.maxOpen, maxRiskPct: s.maxRiskPct }; },
  };
  window.Store = Store;

  /* ---------- formatting ---------- */
  const F = {
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    price(p) {
      if (p == null || !isFinite(p)) return '—';
      const a = Math.abs(p);
      const d = a >= 1000 ? 2 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.1 ? 4 : a >= 0.01 ? 5 : 7;
      return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    money(x, d = 2) { if (x == null || !isFinite(x)) return '—'; return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
    smoney(x, d = 2) { if (x == null || !isFinite(x)) return '—'; return (x >= 0 ? '+' : '-') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
    pct(x, d = 2) { if (x == null || !isFinite(x)) return '—'; return (x >= 0 ? '+' : '') + x.toFixed(d) + '%'; },
    compact(n) { if (n == null || !isFinite(n)) return '—'; const a = Math.abs(n); if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T'; if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return n.toFixed(2); },
    qty(q) { if (!isFinite(q)) return '—'; const a = Math.abs(q); const d = a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 7; return (+q.toFixed(d)).toString(); },
    ago(t) { const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; },
    date(t) { const d = new Date(t); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); },
    dur(ms) { const m = Math.round(ms / 60000); if (m < 60) return m + 'm'; if (m < 1440) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; return Math.floor(m / 1440) + 'd ' + Math.floor((m % 1440) / 60) + 'h'; },
    base(sym) { return sym === 'XAU' ? 'XAU' : sym === 'XAG' ? 'XAG' : sym.replace(/USDT$/, ''); },
    dayKey(t) { const d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    hue(sym) { let h = 0; for (const c of sym) h = (h * 31 + c.charCodeAt(0)) % 360; return h; },
    num(v) { const x = parseFloat(String(v).replace(/,/g, '')); return isFinite(x) ? x : 0; },
  };
  window.F = F;
})();
