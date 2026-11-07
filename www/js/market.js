/* Market controller: Binance public WS + REST, cached candles, metals provider, offline demo feed. */
(function () {
  'use strict';
  const IV = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3 };
  const METALS = {
    XAU: { name: 'Gold', unit: 'troy oz', binance: 'PAXGUSDT' },
    XAG: { name: 'Silver', unit: 'troy oz', binance: null },
  };
  const SEEDS = { BTCUSDT: 68000, ETHUSDT: 3400, XRPUSDT: 0.62, SOLUSDT: 165, BNBUSDT: 590, ADAUSDT: 0.46, DOGEUSDT: 0.16, AVAXUSDT: 36, DOTUSDT: 7.1, LINKUSDT: 15.5, LTCUSDT: 84, TRXUSDT: 0.12, ATOMUSDT: 8.4, UNIUSDT: 9.8, NEARUSDT: 5.6, SUIUSDT: 1.7, ARBUSDT: 1.05, OPUSDT: 2.3, INJUSDT: 24, AAVEUSDT: 160, PEPEUSDT: 0.0000115, SHIBUSDT: 0.0000185, FILUSDT: 5.2, TIAUSDT: 7.4, XAU: 2650, XAG: 31.4 };
  const CKEY = 'tradelab.candles.v1';

  const rest = Feed.createRest();
  const M = {
    IV, METALS, prices: {}, spark: {}, universe: [], books: {}, trades: {},
    status: 'offline', sim: false, lastRest: 0, universeAt: 0, metalFetchOk: true,
    isMetal: (s) => !!METALS[s],
  };
  Store.on; // ensure Store loaded
  const cb = {};
  M.on = (e, f) => { (cb[e] = cb[e] || []).push(f); };
  const emit = (e, a, b) => (cb[e] || []).forEach((f) => { try { f(a, b); } catch (x) { console.error(x); } });
  const S = () => Store.s;

  /* ----- candle cache ----- */
  let cache = {}; try { cache = JSON.parse(localStorage.getItem(CKEY) || '{}'); } catch (e) { cache = {}; }
  let cTimer = null;
  function persistCache() {
    clearTimeout(cTimer);
    cTimer = setTimeout(() => {
      try {
        const keys = Object.keys(cache);
        if (keys.length > 40) keys.sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0)).slice(0, keys.length - 40).forEach((k) => delete cache[k]);
        localStorage.setItem(CKEY, JSON.stringify(cache));
      } catch (e) { cache = {}; }
    }, 2000);
  }
  const ckey = (s, i) => s + '|' + i;
  function putCache(s, i, arr) { cache[ckey(s, i)] = { at: Date.now(), c: arr.slice(-400).map((x) => [x.t, x.o, x.h, x.l, x.c, x.v]) }; persistCache(); }
  function getCache(s, i) { const e = cache[ckey(s, i)]; return e ? e.c.map((k) => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5] })) : null; }

  /* ----- price plumbing ----- */
  function setPrice(sym, price, extra) {
    if (!(price > 0)) return;
    const p = M.prices[sym] || (M.prices[sym] = {});
    const old = p.price;
    p.price = price; p.t = Date.now();
    if (extra) Object.assign(p, extra);
    p.flash = old != null && price !== old ? (price > old ? 1 : -1) : 0;
    const sp = M.spark[sym]; if (sp && sp.length) sp[sp.length - 1] = price;
    if (M.isMetal(sym)) recordMetalTick(sym, price);
    emit('tick', sym, old);
  }
  const aliasOf = () => (S().settings.metalsProvider === 'paxg' ? { PAXGUSDT: 'XAU' } : {});
  const streamSym = (s) => (M.isMetal(s) ? (S().settings.metalsProvider === 'paxg' && METALS[s].binance ? METALS[s].binance : null) : s);

  function onWs(stream, d) {
    const [name, kind] = stream.split('@');
    const raw = name.toUpperCase();
    if (kind === 'ticker') {
      const sym = aliasOf()[raw] || raw;
      setPrice(sym, +d.c, { chg: +d.P, high: +d.h, low: +d.l, vol: +d.q, open: +d.o });
      if (aliasOf()[raw] && !S().watch.includes(raw)) { /* PAXG is only an alias */ }
    } else if (kind && kind.startsWith('kline')) {
      const k = Feed.parseWsKline(d.k); const sym = aliasOf()[raw] || raw;
      const arr = live[ckey(sym, d.k.i)]; if (arr) { Feed.mergeCandle(arr, k); emit('candle', sym, d.k.i); }
    } else if (kind && kind.startsWith('depth')) {
      const sym = aliasOf()[raw] || raw;
      M.books[sym] = { bids: (d.bids || []).map((x) => [+x[0], +x[1]]), asks: (d.asks || []).map((x) => [+x[0], +x[1]]) };
      emit('book', sym);
    } else if (kind === 'trade') {
      const sym = aliasOf()[raw] || raw;
      const a = M.trades[sym] || (M.trades[sym] = []);
      a.unshift({ p: +d.p, q: +d.q, t: d.T, sell: !!d.m }); if (a.length > 40) a.length = 40;
      emit('trades', sym);
    }
  }

  /* ----- sockets ----- */
  let sock = null; const live = {}; let active = null; let subSet = new Set();
  function setStatus(s) { if (s !== M.status) { M.status = s; emit('status', s); } }

  function wantedStreams() {
    const st = S(); const syms = new Set(st.watch);
    st.acct.positions.forEach((p) => syms.add(p.symbol)); st.acct.orders.forEach((o) => syms.add(o.symbol));
    st.alerts.forEach((a) => { if (a.on) syms.add(a.symbol); });
    if (active) syms.add(active.sym);
    const out = new Set();
    syms.forEach((s) => { const b = streamSym(s); if (b) out.add(b.toLowerCase() + '@ticker'); });
    if (active) {
      const b = streamSym(active.sym);
      if (b) { out.add(`${b.toLowerCase()}@kline_${active.iv}`); out.add(`${b.toLowerCase()}@depth10@1000ms`); out.add(`${b.toLowerCase()}@trade`); }
    }
    return out;
  }
  M.reconcile = function () {
    if (M.sim) return;
    const want = wantedStreams();
    if (!sock) return;
    const add = [...want].filter((x) => !subSet.has(x)); const del = [...subSet].filter((x) => !want.has(x));
    sock.subscribe(add); sock.unsubscribe(del); subSet = want;
    pollMetals();
  };
  function startSocket() {
    if (sock || M.sim) return;
    subSet = wantedStreams();
    sock = new Feed.MarketSocket({ onMessage: onWs, onStatus: (s) => setStatus(M.sim ? 'demo' : s) });
    subSet.forEach((s) => sock.streams.add(s));
    sock.connect();
  }
  window.addEventListener('online', () => { if (sock) sock.reconnectNow(); else boot(); });
  window.addEventListener('offline', () => setStatus('offline'));

  /* ----- REST helpers ----- */
  const binSym = (s) => (M.isMetal(s) ? streamSym(s) : s);
  async function loadTickers(syms) {
    const real = [...new Set(syms.map(binSym).filter(Boolean))];
    if (!real.length) return;
    const data = await rest.get('/api/v3/ticker/24hr', { symbols: JSON.stringify(real) });
    data.forEach((t) => {
      const sym = aliasOf()[t.symbol] || t.symbol;
      setPrice(sym, +t.lastPrice, { chg: +t.priceChangePercent, high: +t.highPrice, low: +t.lowPrice, vol: +t.quoteVolume, open: +t.openPrice });
    });
    M.lastRest = Date.now();
  }
  async function loadSparks(syms) {
    await Promise.all(syms.map(async (s) => {
      const b = binSym(s); if (!b) return;
      try {
        const k = await rest.get('/api/v3/klines', { symbol: b, interval: '1h', limit: 48 });
        M.spark[s] = k.map((x) => +x[4]); emit('spark', s);
      } catch (e) { /* sparkline is optional */ }
    }));
  }
  M.loadUniverse = async function (force) {
    if (!force && Date.now() - M.universeAt < 30000 && M.universe.length) return M.universe;
    if (M.sim) { M.universe = Object.keys(SEEDS).filter((s) => !M.isMetal(s)).map((s) => simRow(s)); M.universeAt = Date.now(); return M.universe; }
    const d = await rest.get('/api/v3/ticker/24hr');
    M.universe = d.filter((t) => t.symbol.endsWith('USDT') && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) && +t.quoteVolume > 0)
      .map((t) => ({ s: t.symbol, price: +t.lastPrice, chg: +t.priceChangePercent, vol: +t.quoteVolume, high: +t.highPrice, low: +t.lowPrice }))
      .sort((a, b) => b.vol - a.vol);
    M.universeAt = Date.now();
    return M.universe;
  };
  M.validSymbol = async function (sym) {
    if (M.isMetal(sym)) return true;
    if (M.universe.some((u) => u.s === sym)) return true;
    if (M.sim) return !!SEEDS[sym];
    try { const d = await rest.get('/api/v3/ticker/24hr', { symbol: sym }); return !!d.symbol; } catch (e) { return false; }
  };

  /* ----- candles ----- */
  M.candles = async function (sym, iv, opts = {}) {
    const key = ckey(sym, iv);
    if (live[key] && !opts.force) return live[key];
    const cached = getCache(sym, iv);
    if (M.sim) { live[key] = simCandles(sym, iv); return live[key]; }
    if (M.isMetal(sym)) { const mc = metalCandles(sym, iv); live[key] = mc; return mc; }
    let arr = cached || [];
    try {
      const params = { symbol: binSym(sym), interval: iv, limit: arr.length > 20 ? Math.min(1000, Math.ceil((Date.now() - arr[arr.length - 1].t) / IV[iv]) + 2) : 500 };
      if (arr.length > 20) params.startTime = arr[arr.length - 1].t;   // incremental refresh: only what we are missing
      const k = (await rest.get('/api/v3/klines', params)).map(Feed.parseKline);
      if (arr.length > 20) { k.forEach((c) => Feed.mergeCandle(arr, c)); } else arr = k;
      if (arr.length < 20) throw new Error('short');
      putCache(sym, iv, arr);
    } catch (e) {
      if (!arr.length) { live[key] = []; throw e; }
      M.staleCandles = true;
    }
    live[key] = arr; return arr;
  };
  // Fresh recent candles for indicator alerts on symbols that are not on screen (not cached in `live`).
  M.recent = async function (sym, iv, limit = 150) {
    if (M.sim || M.isMetal(sym) && !binSym(sym)) { const a = await M.candles(sym, iv); return a.slice(-limit); }
    const k = await rest.get('/api/v3/klines', { symbol: binSym(sym), interval: iv, limit });
    return k.map(Feed.parseKline);
  };
  M.setActive = function (sym, iv) { active = sym ? { sym, iv } : null; M.reconcile(); };
  M.liveCandles = (sym, iv) => live[ckey(sym, iv)];
  M.saveCandles = (sym, iv) => { const a = live[ckey(sym, iv)]; if (a && a.length > 20 && !M.sim && !M.isMetal(sym)) putCache(sym, iv, a); };

  /* ----- metals ----- */
  const mticks = (() => { try { return JSON.parse(localStorage.getItem('tradelab.mt') || '{}'); } catch (e) { return {}; } })();
  function recordMetalTick(sym, price) {
    const a = mticks[sym] || (mticks[sym] = []); const t = Math.floor(Date.now() / 60e3) * 60e3; const l = a[a.length - 1];
    if (l && l[0] === t) { l[2] = Math.max(l[2], price); l[3] = Math.min(l[3], price); l[4] = price; l[5]++; } else { a.push([t, price, price, price, price, 1]); if (a.length > 1500) a.shift(); }
  }
  setInterval(() => { try { localStorage.setItem('tradelab.mt', JSON.stringify(mticks)); } catch (e) { /* ignore */ } }, 20000);
  function metalCandles(sym, iv) {
    const base = (mticks[sym] || []).map((k) => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5] }));
    const ms = IV[iv]; const out = [];
    base.forEach((c) => { const t = Math.floor(c.t / ms) * ms; const l = out[out.length - 1]; if (l && l.t === t) { l.h = Math.max(l.h, c.h); l.l = Math.min(l.l, c.l); l.c = c.c; l.v += c.v; } else out.push({ t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }); });
    return out;
  }
  function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  let metalTimer = null;
  async function fetchMetal(sym) {
    const st = S().settings; let url;
    if (st.metalsProvider === 'custom') url = st.metalsUrl.replace('{sym}', sym);
    else url = 'https://api.gold-api.com/price/' + sym;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); const p = +getPath(j, st.metalsProvider === 'custom' ? st.metalsPath : 'price');
      if (!(p > 0)) throw new Error('bad price'); M.metalFetchOk = true;
      const prev = M.prices[sym]; const open = prev && prev.open ? prev.open : p;
      setPrice(sym, p, { open, chg: ((p - open) / open) * 100, high: Math.max(prev && prev.high || p, p), low: Math.min(prev && prev.low || p, p), vol: null });
    } catch (e) { M.metalFetchOk = false; } finally { clearTimeout(to); }
  }
  function pollMetals() {
    clearInterval(metalTimer);
    const need = () => S().watch.concat(S().acct.positions.map((p) => p.symbol), S().alerts.map((a) => a.symbol), active ? [active.sym] : []).filter((s) => M.isMetal(s));
    const run = () => {
      if (M.sim) return;
      [...new Set(need())].forEach((s) => { if (!(S().settings.metalsProvider === 'paxg' && METALS[s].binance)) fetchMetal(s); });
    };
    run(); metalTimer = setInterval(run, 15000);
  }
  M.metalSource = (sym) => {
    const p = S().settings.metalsProvider;
    if (M.sim) return 'Demo simulation';
    if (p === 'paxg' && METALS[sym].binance) return 'Binance PAXG/USDT (tokenized gold, 1 PAXG = 1 troy oz)';
    if (p === 'custom') return 'Custom provider: ' + S().settings.metalsUrl;
    return 'gold-api.com spot price (polled every 15s)';
  };

  /* ----- offline demo feed (clearly labelled in the UI) ----- */
  function rnd(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  const simState = {};
  function simRow(s) { const p = M.prices[s] || { price: SEEDS[s] || 1, chg: 0 }; return { s, price: p.price, chg: p.chg || 0, vol: (SEEDS[s] || 1) * 1e6 * (1 + (hash(s) % 50)), high: p.price * 1.02, low: p.price * 0.98 }; }
  function simCandles(sym, iv) {
    const ms = IV[iv], n = 400, end = Math.floor(Date.now() / ms) * ms, r = rnd(hash(sym + iv)); const seed = SEEDS[sym] || 1;
    const vol = { '1m': 0.0006, '5m': 0.0013, '15m': 0.0022, '1h': 0.0045, '4h': 0.009, '1d': 0.02 }[iv];
    const arr = []; let px = seed * (0.9 + r() * 0.2);
    for (let i = n - 1; i >= 0; i--) {
      const o = px; const drift = (r() - 0.5) * 2 * vol * px; const c = Math.max(o + drift, o * 0.5); const h = Math.max(o, c) * (1 + r() * vol * 0.6); const l = Math.min(o, c) * (1 - r() * vol * 0.6);
      arr.push({ t: end - i * ms, o, h, l, c, v: 50 + r() * 400 }); px = c;
    }
    const k = arr[arr.length - 1]; const target = (M.prices[sym] && M.prices[sym].price) || seed; const f = target / k.c;
    arr.forEach((c) => { c.o *= f; c.h *= f; c.l *= f; c.c *= f; });
    return arr;
  }
  function startSim() {
    if (M.sim) return; M.sim = true; setStatus('demo');
    const tick = () => {
      const syms = new Set(S().watch); S().acct.positions.forEach((p) => syms.add(p.symbol)); S().acct.orders.forEach((o) => syms.add(o.symbol)); S().alerts.forEach((a) => syms.add(a.symbol)); if (active) syms.add(active.sym);
      syms.forEach((s) => {
        const st = simState[s] || (simState[s] = { p: SEEDS[s] || 1, open: SEEDS[s] || 1, hi: 0, lo: 1e18, r: rnd(hash(s) ^ Date.now()) });
        const step = (st.r() - 0.5) * 0.0016; st.p = Math.max(st.p * (1 + step), 1e-9); st.hi = Math.max(st.hi, st.p); st.lo = Math.min(st.lo, st.p);
        setPrice(s, st.p, { open: st.open, chg: ((st.p - st.open) / st.open) * 100, high: Math.max(st.hi, st.p), low: Math.min(st.lo, st.p), vol: (SEEDS[s] || 1) * 2e6 });
        if (active && active.sym === s) {
          const arr = live[ckey(s, active.iv)];
          if (arr && arr.length) { const l = arr[arr.length - 1]; const t = Math.floor(Date.now() / IV[active.iv]) * IV[active.iv]; Feed.mergeCandle(arr, l.t === t ? { t, o: l.o, h: Math.max(l.h, st.p), l: Math.min(l.l, st.p), c: st.p, v: l.v + 1 } : { t, o: l.c, h: st.p, l: st.p, c: st.p, v: 1 }); emit('candle', s, active.iv); }
          const spread = st.p * 0.0002; M.books[s] = { bids: Array.from({ length: 10 }, (_, i) => [st.p - spread * (i + 1), 0.2 + st.r() * 3]), asks: Array.from({ length: 10 }, (_, i) => [st.p + spread * (i + 1), 0.2 + st.r() * 3]) }; emit('book', s);
          const a = M.trades[s] || (M.trades[s] = []); a.unshift({ p: st.p, q: 0.01 + st.r(), t: Date.now(), sell: st.r() > 0.5 }); if (a.length > 40) a.length = 40; emit('trades', s);
        }
      });
    };
    tick(); M.simTimer = setInterval(tick, 1000);
    S().watch.forEach((s) => { M.spark[s] = simCandles(s, '1h').slice(-48).map((c) => c.c); });
    emit('spark');
  }
  M.stopSim = function () { clearInterval(M.simTimer); M.sim = false; Object.keys(live).forEach((k) => delete live[k]); };

  /* ----- boot / health ----- */
  async function boot() {
    const watch = S().watch.slice();
    try {
      await loadTickers(watch);
      M.live = true; startSocket(); loadSparks(watch); pollMetals();
    } catch (e) {
      M.live = false;
      const haveCache = watch.some((s) => M.prices[s]);
      if (!haveCache) startSim(); else setStatus('offline');
      // keep trying in the background
      setTimeout(recover, 15000);
    }
  }
  async function recover() {
    if (M.live) return;
    try {
      await loadTickers(S().watch);
      if (M.sim) { M.stopSim(); M.prices = {}; await loadTickers(S().watch); }
      M.live = true; M.sim = false; startSocket(); loadSparks(S().watch); pollMetals(); emit('recovered');
    } catch (e) { setTimeout(recover, 20000); }
  }
  M.boot = boot;
  M.refresh = async function () {
    if (M.sim) { await recover(); return; }
    await loadTickers(S().watch.concat(S().acct.positions.map((p) => p.symbol)));
    await M.loadUniverse(true).catch(() => {});
    loadSparks(S().watch);
  };
  M.addWatch = async function (sym) {
    if (!S().watch.includes(sym)) { S().watch.push(sym); Store.save(); }
    if (!M.sim && !M.isMetal(sym)) { try { await loadTickers([sym]); loadSparks([sym]); } catch (e) { /* ws will fill it */ } }
    M.reconcile();
  };
  M.stale = (sym) => { const p = M.prices[sym]; return !p || Date.now() - p.t > 20000; };
  M.marketOpen = (sym) => {
    if (!M.isMetal(sym)) return { open: true, label: 'Open 24/7' };
    const d = new Date(); const day = d.getUTCDay(), h = d.getUTCHours();
    const closed = day === 6 || (day === 5 && h >= 22) || (day === 0 && h < 22);
    return { open: !closed, label: closed ? 'Closed (weekend)' : 'Open' };
  };
  window.Market = M;
})();
