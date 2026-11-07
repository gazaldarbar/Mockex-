/* UI part 1: shell, shared components, Home, Markets, Asset detail. */
(function () {
  'use strict';
  const { $, $$, acts } = App; const S = () => Store.s; const esc = F.esc;
  const UI = (window.UI = { screens: {}, c: {} });

  const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', XRP: 'XRP', SOL: 'Solana', BNB: 'BNB', ADA: 'Cardano', DOGE: 'Dogecoin', AVAX: 'Avalanche', DOT: 'Polkadot', LINK: 'Chainlink', LTC: 'Litecoin', TRX: 'TRON', ATOM: 'Cosmos', UNI: 'Uniswap', NEAR: 'NEAR', SUI: 'Sui', ARB: 'Arbitrum', OP: 'Optimism', INJ: 'Injective', AAVE: 'Aave', PEPE: 'Pepe', SHIB: 'Shiba Inu', FIL: 'Filecoin', TIA: 'Celestia', XAU: 'Gold', XAG: 'Silver' };
  const nameOf = (s) => NAMES[F.base(s)] || F.base(s);
  UI.nameOf = nameOf;
  const coin = (s, sz) => {
    const bg = s === 'XAU' ? 'linear-gradient(135deg,#ffe08a,#c9921e)' : s === 'XAG' ? 'linear-gradient(135deg,#f1f4ff,#8d97b5)' : `linear-gradient(135deg,hsl(${F.hue(s)} 80% 58%),hsl(${(F.hue(s) + 55) % 360} 80% 44%))`;
    const st = sz ? `width:${sz}px;height:${sz}px;font-size:${Math.round(sz / 3.2)}px;` : '';
    return `<div class="coin" style="background:${bg};${st}${s === 'XAG' ? 'color:#2b3150' : s === 'XAU' ? 'color:#4a3200' : ''}">${esc(F.base(s).slice(0, 4))}</div>`;
  };
  UI.coin = coin;
  const IC = {
    home: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    markets: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    portfolio: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18"/></svg>',
    alerts: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1112 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 004 0"/></svg>',
    me: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  };
  UI.IC = IC;
  const TABS = [['home', 'Home'], ['markets', 'Markets'], ['portfolio', 'Portfolio'], ['alerts', 'Alerts'], ['me', 'Me']];
  const TITLES = { home: 'Mockex', markets: 'Markets', portfolio: 'Portfolio', alerts: 'Alerts', me: 'Profile' };

  function skeletonRows(n = 6) { return Array.from({ length: n }, () => '<div class="item"><div class="skel" style="width:42px;height:42px;border-radius:14px"></div><div class="col sp"><div class="skel" style="height:14px;width:40%"></div><div class="skel" style="height:11px;width:25%"></div></div><div class="skel" style="height:18px;width:22%"></div></div>').join(''); }
  UI.skeletonRows = skeletonRows;

  function assetRow(sym, o = {}) {
    const p = Market.prices[sym] || {};
    return `<div class="item" data-act="open-asset" data-sym="${sym}">
      ${coin(sym)}
      <div class="col sp" style="gap:2px;min-width:0"><div class="nm">${esc(F.base(sym))}${Market.isMetal(sym) ? ' <span class="badge warn">METAL</span>' : ''}</div><div class="sub">${esc(nameOf(sym))}</div></div>
      ${o.spark === false ? '' : `<canvas class="spark" data-live="spark:${sym}"></canvas>`}
      <div class="col" style="align-items:flex-end;gap:4px"><div class="px num" data-live="price:${sym}">${p.price ? F.price(p.price) : '—'}</div><div class="pillchg ${p.chg >= 0 ? 'up' : 'down'} num" data-live="chgpill:${sym}">${p.chg != null ? F.pct(p.chg) : '—'}</div></div>
      ${o.trail || ''}
    </div>`;
  }
  UI.assetRow = assetRow;

  /* ---------- shell ---------- */
  UI.shell = () => {
    $('#tabbar').innerHTML = '<div class="blob"></div>' + TABS.map(([k, l]) => `<button data-act="tab" data-tab="${k}" aria-label="${l}"><span class="ic">${IC[k]}</span>${l}</button>`).join('');
    $('#top').innerHTML = `<img class="logo-mark" src="brand/mark.png" alt="" width="34" height="23"><div class="title" id="ttl"></div><div class="sp"></div><div class="pill" id="status"></div><button class="icon-btn" data-act="tab" data-tab="alerts" aria-label="Notifications" style="position:relative">${IC.alerts}<span class="nb hide" id="nbadge"></span></button>`;
    App.paintStatus();
  };
  UI.render = (keepScroll) => {
    const v = $('#view'); const tab = App.tab; const sc = UI.screens[tab]; if (!sc) return; const y = keepScroll ? v.scrollTop : 0;
    v.classList.remove('enter'); if (!keepScroll) { void v.offsetWidth; v.classList.add('enter'); }
    v.innerHTML = '<div class="pull" id="pull">Release to refresh…</div>' + sc.html(); if (sc.mount) sc.mount(v);
    v.scrollTop = y;
    $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const on = $('#tabbar button.on'), blob = $('#tabbar .blob'); if (on && blob) blob.style.transform = `translateX(${on.offsetLeft}px)`;
    $('#ttl').innerHTML = tab === 'home' ? '<img class="wm d" src="brand/wordmark.png" alt="Mockex"><img class="wm l" src="brand/wordmark-dark.png" alt="Mockex">' : esc(TITLES[tab]); UI.badge(); App.paint();
  };
  UI.badge = () => { const n = App.unread(), b = $('#nbadge'); if (!b) return; b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hide', !n); };
  acts.tab = (el) => { if (App.overlays.length) { while (App.overlays.length) App.closePage(App.overlays[0]); } App.closeSheet(true); App.go(el.dataset.tab); };
  Store.on('route', () => UI.render());
  let rt = null; const soft = () => { clearTimeout(rt); rt = setTimeout(() => { if (!UI.noSoft) UI.render(true); }, 250); };
  Store.on('account', soft); Store.on('notifs', () => { UI.badge(); if (App.tab === 'alerts') soft(); });
  Store.on('alerts', soft);

  /* pull-to-refresh */
  (function () {
    const v = $('#view'); let y0 = null, d = 0;
    v.addEventListener('touchstart', (e) => { y0 = v.scrollTop <= 0 ? e.touches[0].clientY : null; d = 0; }, { passive: true });
    v.addEventListener('touchmove', (e) => { if (y0 == null) return; d = e.touches[0].clientY - y0; const p = $('#pull'); if (p && d > 0) p.style.height = Math.min(54, d * 0.45) + 'px'; }, { passive: true });
    v.addEventListener('touchend', async () => { const p = $('#pull'); if (y0 != null && d > 110) { if (p) { p.style.height = '40px'; p.textContent = 'Refreshing…'; } App.haptic('medium'); try { await Market.refresh(); App.toast('Updated', 'ok', 1200); } catch (e) { App.toast('Could not refresh. Showing last known data.', 'err'); } } if (p) { p.style.height = '0'; } y0 = null; UI.render(true); }, { passive: true });
  })();

  /* ---------- HOME ---------- */
  function statTile(l, v, cls) { return `<div class="stat"><span class="lbl">${l}</span><b class="num ${cls || ''}">${v}</b></div>`; }
  function posCardMini(p) {
    const px = App.px(p.symbol) || p.entry;
    return `<div class="card glass tight" data-act="open-asset" data-sym="${p.symbol}" style="margin:0 16px 10px"><div class="row">${coin(p.symbol)}<div class="col sp" style="gap:2px"><div class="nm" style="font-weight:700">${esc(F.base(p.symbol))} <span class="badge ${p.side === 'long' ? 'up' : 'down'}">${p.side.toUpperCase()}${p.leverage > 1 ? ' ' + p.leverage.toFixed(1) + '×' : ''}</span></div><div class="sub muted">${F.qty(p.qty)} @ ${F.price(p.entry)}</div></div><div class="col" style="align-items:flex-end;gap:2px"><b class="num" data-live="pos:${p.id}:pnl">${F.smoney(Engine.pnlOf(p, px))}</b><span class="num" style="font-size:13px" data-live="pos:${p.id}:pct">${F.pct(Engine.pnlOf(p, px) / p.margin * 100)}</span></div></div></div>`;
  }
  UI.screens.home = {
    html() {
      const st = S(), a = st.acct, stats = Engine.stats(a, st.equity); const first = (st.user.name || '').split(' ')[0];
      const ch = Rewards.challenges()[0]; const unread = st.notifs.filter((n) => !n.read).slice(0, 2);
      const watch = st.watch;
      return `
      ${Market.sim ? '<div class="offline-banner">⚠️ Binance is unreachable, so you are seeing simulated DEMO prices. Trading is still practice-only. Live data returns automatically.</div>' : ''}
      <div class="hero"><div class="lbl">${first ? 'Hi ' + esc(first) + ' · ' : ''}Total equity</div>
        <div class="big num" data-live="eq">${F.money(App.equity())}</div>
        <div class="row" style="margin-top:8px;gap:14px"><span class="num" style="font-weight:700" data-live="dpnl">${F.smoney(App.dayPnl())}</span><span class="num" data-live="dpct">0.00%</span><span class="muted" style="font-size:13px">today</span><span class="sp"></span><span class="pill">Return <b class="num" data-live="ret">0.00%</b></span></div></div>
      <div class="card glass" style="padding:10px 6px 4px"><canvas id="eqc" style="width:100%;height:120px;display:block"></canvas></div>
      <div class="card glass"><div class="grid3">
        ${statTile('Open', a.positions.length)}${statTile('Win rate', stats.trades ? stats.winRate.toFixed(0) + '%' : '—')}${statTile('Free cash', '<span data-live="cash">' + F.money(a.cash - Engine.reserved(a)) + '</span>')}
        ${statTile('Best', stats.best ? F.smoney(stats.best.pnl) : '—', 'up')}${statTile('Worst', stats.worst ? F.smoney(stats.worst.pnl) : '—', 'down')}${statTile('Trades', stats.trades)}</div></div>
      <div class="sec"><h3>Market overview</h3><button class="link" data-act="tab" data-tab="markets">All markets</button></div>
      <div class="hscroll">${watch.map((s) => { const p = Market.prices[s] || {}; return `<div class="mini glass" data-act="open-asset" data-sym="${s}"><div class="row">${coin(s, 32)}<b>${esc(F.base(s))}</b></div><div class="num" style="font-size:19px;font-weight:800;margin:10px 0 2px;display:inline-block" data-live="price:${s}">${p.price ? F.price(p.price) : '—'}</div><div class="num" style="font-size:13px;font-weight:700" data-live="chg:${s}">${p.chg != null ? F.pct(p.chg) : '—'}</div><canvas class="spark" style="width:100%;height:34px;margin-top:6px" data-live="spark:${s}"></canvas></div>`; }).join('')}</div>
      <div class="sec"><h3>Open positions</h3><button class="link" data-act="tab" data-tab="portfolio">${a.positions.length ? 'Manage' : ''}</button></div>
      ${a.positions.length ? a.positions.slice(0, 3).map(posCardMini).join('') : `<div class="card glass empty" style="padding:26px"><div class="em">🌊</div>No open positions yet.<br><button class="btn primary sm" style="margin-top:14px" data-act="tab" data-tab="markets">Find a market</button></div>`}
      <div class="sec"><h3>Watchlist</h3><button class="link" data-act="tab" data-tab="markets">Edit</button></div>
      <div class="card glass" style="padding:4px 14px">${watch.map((s) => assetRow(s)).join('') || '<div class="empty">Add assets from Markets</div>'}</div>
      <div class="sec"><h3>Today</h3><button class="link" data-act="open-rewards">Rewards</button></div>
      <div class="card glass" data-act="open-rewards"><div class="row between"><b>🎯 ${esc(ch.title)}</b><span class="badge ${ch.done ? 'up' : ''}">${ch.cur}/${ch.goal}</span></div><div class="bar" style="margin-top:12px"><i style="width:${ch.cur / ch.goal * 100}%"></i></div><div class="sub muted" style="margin-top:8px">🔥 ${Rewards.streak()}-day trading streak</div></div>
      ${unread.length ? `<div class="sec"><h3>Alerts</h3><button class="link" data-act="tab" data-tab="alerts">${st.notifs.filter((n) => !n.read).length} unread</button></div><div class="card glass tight">${unread.map((n) => `<div class="item" style="min-height:52px"><div class="col sp"><b>${esc(n.title)}</b><span class="sub">${esc(n.body || '')}</span></div><span class="sub faint">${F.ago(n.t)}</span></div>`).join('')}</div>` : ''}
      <p class="disc">Paper trading is for education and practice only. Simulated results do not guarantee future performance. No real money is used.</p>`;
    },
    mount(v) {
      const c = $('#eqc', v); if (c) Draw.curve(c, S().equity.slice(-400), S().acct.start);
      Market.loadUniverse().catch(() => {});
    },
  };
  acts['open-rewards'] = () => UI.openRewards && UI.openRewards();

  /* ---------- MARKETS ---------- */
  const MK = { cat: 'watch', sort: 'vol', q: '', limit: 60, loading: false, err: false };
  UI.screens.markets = {
    html() {
      const cats = [['watch', 'Watchlist'], ['fav', 'Favorites'], ['all', 'All USDT'], ['gain', 'Gainers'], ['lose', 'Losers'], ['metal', 'Metals']];
      const sorts = [['vol', 'Volume'], ['chg', '24h %'], ['price', 'Price'], ['az', 'A–Z']];
      return `<div class="search glass">${IC.search}<input id="mq" placeholder="Search any Binance USDT pair…" value="${esc(MK.q)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Search markets"><button class="icon-btn ${MK.q ? '' : 'hide'}" id="mclr" style="width:32px;height:32px;font-size:14px">✕</button></div>
      <div class="chips" id="mcats">${cats.map(([k, l]) => `<button class="chip ${MK.cat === k ? 'on' : ''}" data-act="mcat" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="chips" id="msort" style="padding-top:0">${sorts.map(([k, l]) => `<button class="chip ${MK.sort === k ? 'on' : ''}" data-act="msort" data-k="${k}" style="height:30px;font-size:12.5px">${l}</button>`).join('')}</div>
      <div class="card glass" style="padding:4px 14px" id="mlist">${UI.marketList()}</div>
      <p class="disc">Crypto pairs: Binance spot USDT markets (USDT ≈ USD). Metals show their data source on each asset page.</p>`;
    },
    mount(v) {
      const i = $('#mq', v);
      i.addEventListener('input', () => { MK.q = i.value.trim(); MK.limit = 60; $('#mclr').classList.toggle('hide', !MK.q); $('#mlist').innerHTML = UI.marketList(); App.paint(); lookup(); });
      $('#mclr').addEventListener('click', () => { MK.q = ''; i.value = ''; $('#mclr').classList.add('hide'); $('#mlist').innerHTML = UI.marketList(); App.paint(); });
      if (!Market.universe.length || Date.now() - Market.universeAt > 30000) { MK.loading = !Market.universe.length; MK.err = false; Market.loadUniverse().then(() => { MK.loading = false; refreshList(); }).catch(() => { MK.loading = false; MK.err = true; refreshList(); }); }
    },
  };
  function refreshList() { const l = $('#mlist'); if (l && App.tab === 'markets') { l.innerHTML = UI.marketList(); App.paint(); } }
  let lt = null; function lookup() {
    clearTimeout(lt); if (!/^[A-Z0-9]{5,20}$/.test(MK.q.toUpperCase()) || MK.q.length < 3) return;
    lt = setTimeout(async () => { const sym = qSym(MK.q); if (Market.universe.some((u) => u.s === sym) || Market.isMetal(sym)) return; if (await Market.validSymbol(sym)) { MK.extra = sym; try { const d = await Market.loadUniverse(); void d; } catch (e) { /* ignore */ } refreshList(); } }, 450);
  }
  const qSym = (q) => { q = q.toUpperCase().replace(/[^A-Z0-9]/g, ''); return q.endsWith('USDT') ? q : q + 'USDT'; };
  UI.marketList = () => {
    const st = S(); let rows = [];
    const uni = Market.universe; const byS = {}; uni.forEach((u) => (byS[u.s] = u));
    const mk = (s) => { const p = Market.prices[s] || byS[s] || {}; return { s, price: p.price, chg: p.chg, vol: p.vol }; };
    const q = MK.q.toUpperCase();
    if (q) {
      rows = uni.filter((u) => u.s.includes(q)).map((u) => mk(u.s));
      ['XAU', 'XAG'].forEach((m) => { if (m.includes(q) || nameOf(m).toUpperCase().includes(q)) rows.unshift(mk(m)); });
      if (!rows.length && MK.extra) rows.push(mk(MK.extra));
    } else if (MK.cat === 'watch') rows = st.watch.map(mk);
    else if (MK.cat === 'fav') rows = st.favs.map(mk);
    else if (MK.cat === 'metal') rows = ['XAU', 'XAG'].map(mk);
    else if (MK.cat === 'gain') rows = uni.filter((u) => u.vol > 5e6).map((u) => mk(u.s)).sort((a, b) => b.chg - a.chg).slice(0, 40);
    else if (MK.cat === 'lose') rows = uni.filter((u) => u.vol > 5e6).map((u) => mk(u.s)).sort((a, b) => a.chg - b.chg).slice(0, 40);
    else rows = uni.map((u) => mk(u.s));
    if (MK.cat !== 'gain' && MK.cat !== 'lose' || q) {
      const k = MK.sort; rows.sort((a, b) => k === 'az' ? a.s.localeCompare(b.s) : k === 'chg' ? (b.chg || 0) - (a.chg || 0) : k === 'price' ? (b.price || 0) - (a.price || 0) : (b.vol || 0) - (a.vol || 0));
    }
    if (MK.loading && ['all', 'gain', 'lose'].includes(MK.cat)) return skeletonRows(8);
    if (MK.err && !rows.length) return `<div class="empty"><div class="em">📡</div>Could not load markets.<br>Check your connection and pull down to retry.<br><button class="btn sm" style="margin-top:12px" data-act="mretry">Retry</button></div>`;
    if (!rows.length) return `<div class="empty"><div class="em">${MK.cat === 'fav' ? '⭐' : '🔍'}</div>${MK.cat === 'fav' ? 'Star assets to see them here.' : q ? 'No match. Try a symbol like <b>DOGE</b> or <b>ARBUSDT</b>.' : 'Nothing here yet.'}</div>`;
    const shown = rows.slice(0, MK.limit);
    return shown.map((r) => {
      const inW = st.watch.includes(r.s);
      const trail = `<button class="icon-btn" style="width:38px;height:38px;flex:none" data-act="${inW ? 'fav' : 'watch-add'}" data-sym="${r.s}" aria-label="${inW ? 'Favorite' : 'Add to watchlist'}">${inW ? (st.favs.includes(r.s) ? '★' : '☆') : '＋'}</button>`;
      return assetRow(r.s, { spark: inW, trail });
    }).join('') + (rows.length > MK.limit ? `<div style="text-align:center;padding:12px"><button class="btn sm" data-act="mmore">Show more (${rows.length - MK.limit})</button></div>` : '');
  };
  acts.mcat = (el) => { MK.cat = el.dataset.k; MK.q = ''; MK.limit = 60; UI.render(true); };
  acts.msort = (el) => { MK.sort = el.dataset.k; UI.render(true); };
  acts.mmore = () => { MK.limit += 60; refreshList(); };
  acts.mretry = () => { MK.err = false; MK.loading = true; refreshList(); Market.loadUniverse(true).then(() => { MK.loading = false; refreshList(); }).catch(() => { MK.loading = false; MK.err = true; refreshList(); }); };
  acts.fav = (el, e) => { e.stopPropagation(); const s = el.dataset.sym, f = S().favs; const i = f.indexOf(s); if (i >= 0) f.splice(i, 1); else f.push(s); Store.save(); el.textContent = i >= 0 ? '☆' : '★'; };
  acts['watch-add'] = async (el, e) => { e.stopPropagation(); await Market.addWatch(el.dataset.sym); App.toast(F.base(el.dataset.sym) + ' added to watchlist', 'ok'); el.textContent = '☆'; el.dataset.act = 'fav'; };
  acts['open-asset'] = (el) => UI.openAsset(el.dataset.sym);

  /* ---------- ASSET DETAIL ---------- */
  const IVS = ['1m', '5m', '15m', '1h', '4h', '1d'];
  const SUBS = [['rsi', 'RSI'], ['macd', 'MACD'], ['stoch', 'StochRSI'], ['atr', 'ATR'], ['adx', 'ADX']];
  const defInd = () => ({ sma: { on: false, p: 20 }, ema: { on: true, p: 50 }, ema2: { on: false, p: 21 }, bb: { on: false }, vwap: { on: false }, sr: { on: false }, subs: [] });
  UI.openAsset = (sym) => {
    const lay = S().layouts[sym] || {};
    const state = { sym, iv: lay.iv || '15m', type: lay.type || 'candle', ind: Object.assign(defInd(), lay.ind || {}), tab: 'book', tools: false };
    const p = Market.prices[sym] || {};
    const el = App.openPage('asset', `
      <div class="hd"><button class="icon-btn" data-act="back" aria-label="Back">${IC.back}</button>${coin(sym, 40)}<div class="col sp" style="gap:0"><b style="font-size:18px">${esc(F.base(sym))}${Market.isMetal(sym) ? '' : '<span class="muted" style="font-weight:500">/USDT</span>'}</b><span class="sub muted">${esc(nameOf(sym))}</span></div>
        <button class="icon-btn" data-act="fav" data-sym="${sym}" aria-label="Favorite">${S().favs.includes(sym) ? '★' : '☆'}</button></div>
      <div class="bd" id="abd">
        <div class="hero" style="padding-top:6px"><div class="row" style="gap:12px;align-items:flex-end"><div class="big num" style="font-size:38px" data-live="price:${sym}">${p.price ? F.price(p.price) : '—'}</div><div class="pillchg num" data-live="chgpill:${sym}" style="margin-bottom:6px">${p.chg != null ? F.pct(p.chg) : '—'}</div><span class="badge warn hide" data-live="stale:${sym}">STALE</span></div></div>
        <div class="chips" id="aiv">${IVS.map((i) => `<button class="chip ${state.iv === i ? 'on' : ''}" data-act="aiv" data-iv="${i}">${i}</button>`).join('')}<span style="width:6px;flex:none"></span>
          ${[['candle', '🕯️'], ['line', '〰️'], ['area', '▤']].map(([k, l]) => `<button class="chip ${state.type === k ? 'on' : ''}" data-act="atype" data-k="${k}" aria-label="${k} chart">${l}</button>`).join('')}</div>
        <div class="chips" style="padding-top:0"><button class="chip" data-act="aind">📐 Indicators</button><button class="chip" id="atoolbtn" data-act="atools">✏️ Draw</button><button class="chip" data-act="alayout">💾 Layout</button></div>
        <div class="tools hide" id="atoolrow">${[['trend', '╱ Trend'], ['hline', '— Level'], ['rect', '▭ Box'], ['fib', 'ϕ Fib']].map(([k, l]) => `<button class="chip" data-act="atool" data-k="${k}">${l}</button>`).join('')}<button class="chip" data-act="aundo">↶ Undo</button><button class="chip" data-act="aclear">🗑 Clear</button></div>
        <div class="glass chartwrap" id="achart" style="min-height:330px"><div class="skel" style="position:absolute;inset:0;border-radius:0"></div></div>
        <div class="card glass" style="margin-top:14px"><div class="grid2">
          <div class="stat"><span class="lbl">24h High</span><b class="num" data-live="high:${sym}">—</b></div><div class="stat"><span class="lbl">24h Low</span><b class="num" data-live="low:${sym}">—</b></div>
          <div class="stat"><span class="lbl">Volume (24h)</span><b class="num" data-live="vol:${sym}">—</b></div><div class="stat"><span class="lbl">Market</span><b>${Market.marketOpen(sym).open ? '🟢 ' : '🔴 '}${Market.marketOpen(sym).label}</b></div></div></div>
        <div id="apos"></div>
        <div class="chips" id="atabs" style="padding-top:4px">${[['book', 'Order book'], ['trades', 'Recent trades'], ['info', 'Data source']].map(([k, l]) => `<button class="chip ${state.tab === k ? 'on' : ''}" data-act="atab" data-k="${k}">${l}</button>`).join('')}</div>
        <div class="card glass" id="apanel" style="min-height:120px"></div>
        <p class="disc">Paper trading is for education and practice only. Simulated results do not guarantee future performance.</p>
      </div>
      <div class="ft"><button class="btn buy sp" data-act="trade" data-sym="${sym}" data-side="long">Buy / Long</button><button class="btn sell sp" data-act="trade" data-sym="${sym}" data-side="short">Sell / Short</button></div>`);
    el._st = state; UI.mountAsset(el, state);
  };
  acts.back = () => App.closePage();
  acts.trade = (el) => UI.openTrade && UI.openTrade(el.dataset.sym, el.dataset.side);

  UI.mountAsset = (el, state) => {
    const sym = state.sym; let chart, alive = true, load = 0;
    const holder = $('#achart', el);
    const apply = () => { chart.setInd(state.ind); chart.set({ type: state.type }); };
    const lines = () => {
      const L = [], a = S().acct;
      a.positions.filter((p) => p.symbol === sym).forEach((p) => { L.push({ p: p.entry, color: '#8b7bff', label: `ENTRY ${p.side}` }); if (p.sl) L.push({ p: p.sl, color: '#ff5c7a', label: 'STOP' }); if (p.tp) L.push({ p: p.tp, color: '#2ee6a6', label: 'TARGET' }); L.push({ p: Engine.liqPrice(p), color: '#ffc857', label: 'LIQ' }); });
      a.orders.filter((o) => o.symbol === sym).forEach((o) => L.push({ p: o.limit, color: '#22d3ee', label: `LIMIT ${o.side}` }));
      return L;
    };
    const loadData = async () => {
      const my = ++load; holder.querySelector('.skel') || holder.insertAdjacentHTML('afterbegin', '<div class="skel" id="csk" style="position:absolute;inset:0;border-radius:0;z-index:2"></div>');
      Market.setActive(sym, state.iv);
      try {
        const d = await Market.candles(sym, state.iv); if (!alive || my !== load) return; $$('.skel', holder).forEach((x) => x.remove());
        if (!chart) { chart = new CandleChart(holder, { onChange: () => { S().drawings[sym] = chart.drawings; Store.save(); } }); chart.drawings = S().drawings[sym] || []; }
        chart.type = state.type; chart.ind = state.ind; chart.lines = lines(); chart.resize(); chart.setData(d, Market.IV[state.iv]); el._chart = chart;
        if (!d.length) holder.insertAdjacentHTML('beforeend', `<div class="empty" id="cempty" style="position:absolute;inset:0;display:grid;place-content:center">${Market.isMetal(sym) ? 'History builds as you use the app.<br>Live ticks are being recorded.' : 'No candles yet.'}</div>`);
      } catch (e) {
        if (!alive || my !== load) return; $$('.skel', holder).forEach((x) => x.remove());
        holder.innerHTML = `<div class="empty"><div class="em">📡</div>Couldn't load candles.<br><button class="btn sm" style="margin-top:12px" data-act="aretry">Retry</button></div>`; chart = null;
      }
    };
    state.reload = loadData; state.apply = () => { if (chart) apply(); }; state.chart = () => chart;
    state.lines = () => { if (chart) { chart.lines = lines(); chart.draw(); } };
    loadData();
    const onCandle = (s, iv) => { if (s === sym && chart && iv === state.iv) { chart.data = Market.liveCandles(sym, state.iv) || chart.data; chart.update(); } };
    let mt = 0;
    const onTick = async (s) => { if (s !== sym || !chart) return; const now = Date.now(); if (Market.isMetal(sym) && !Market.sim && now - mt > 2000) { mt = now; try { chart.data = await Market.candles(sym, state.iv, { force: true }); chart.update(); } catch (e) { /* ignore */ } } chart.lines = lines(); };
    Market.on('candle', onCandle); Market.on('tick', onTick);
    const unsubs = [];
    const posPanel = () => {
      const box = $('#apos', el); if (!box) return; const ps = S().acct.positions.filter((p) => p.symbol === sym), os = S().acct.orders.filter((o) => o.symbol === sym);
      box.innerHTML = ps.map((p) => { const px = App.px(sym) || p.entry; const pnl = Engine.pnlOf(p, px); return `<div class="card glass"><div class="row between"><b>Your position <span class="badge ${p.side === 'long' ? 'up' : 'down'}">${p.side.toUpperCase()}</span></b><b class="num" data-live="pos:${p.id}:pnl">${F.smoney(pnl)}</b></div><div class="kv"><span>Size</span><span class="num">${F.qty(p.qty)} ${F.base(sym)}</span></div><div class="kv"><span>Entry</span><span class="num">${F.price(p.entry)}</span></div><div class="kv"><span>Stop / Target</span><span class="num">${p.sl ? F.price(p.sl) : '—'} / ${p.tp ? F.price(p.tp) : '—'}</span></div><div class="row" style="margin-top:10px"><button class="btn sm sp" data-act="pos-close" data-id="${p.id}" data-f="0.5">Close 50%</button><button class="btn sm sp sell" data-act="pos-close" data-id="${p.id}" data-f="1">Close all</button></div></div>`; }).join('')
        + os.map((o) => `<div class="card glass tight row"><div class="sp"><b>Pending ${o.side} limit</b><div class="sub muted">${F.qty(o.qty)} @ ${F.price(o.limit)}</div></div><button class="btn sm" data-act="ord-cancel" data-id="${o.id}">Cancel</button></div>`).join('');
      App.paint();
    };
    const panel = () => {
      const box = $('#apanel', el); if (!box) return; const t = state.tab;
      if (t === 'book') {
        const b = Market.books[sym]; if (!b) { box.innerHTML = '<div class="empty" style="padding:24px">Loading order book…</div>'; return; }
        const mx = Math.max(...b.bids.concat(b.asks).map((x) => x[1]), 1e-9); const row = (x, c) => `<div class="r num"><i style="width:${x[1] / mx * 100}%"></i><span class="${c}">${F.price(x[0])}</span><span>${F.qty(x[1])}</span></div>`;
        box.innerHTML = `<div class="book"><div class="bids"><div class="lbl" style="padding:0 6px 4px">Bids</div>${b.bids.slice(0, 8).map((x) => row(x, 'up')).join('')}</div><div class="asks"><div class="lbl" style="padding:0 6px 4px">Asks</div>${b.asks.slice(0, 8).map((x) => row(x, 'down')).join('')}</div></div>`;
      } else if (t === 'trades') {
        const a = Market.trades[sym] || []; box.innerHTML = a.length ? `<div class="book" style="grid-template-columns:1fr">${a.slice(0, 14).map((x) => `<div class="r num"><span class="${x.sell ? 'down' : 'up'}">${F.price(x.p)}</span><span>${F.qty(x.q)}</span><span class="muted">${new Date(x.t).toLocaleTimeString('en-GB')}</span></div>`).join('')}</div>` : '<div class="empty" style="padding:24px">Waiting for trades…</div>';
      } else {
        box.innerHTML = `<div class="kv"><span>Source</span><span style="text-align:right;max-width:60%">${esc(Market.isMetal(sym) ? Market.metalSource(sym) : Market.sim ? 'Demo simulation (offline)' : 'Binance public spot market data (WebSocket + REST)')}</span></div><div class="kv"><span>Feed</span><span>${Market.sim ? 'DEMO' : Market.status.toUpperCase()}</span></div><div class="kv"><span>Candles</span><span>${Market.isMetal(sym) ? 'Built from live ticks' : Market.staleCandles ? 'Cached (refresh failed)' : 'Binance klines, cached locally'}</span></div>${Market.isMetal(sym) ? '<p class="sub muted" style="margin:8px 0 0">Change the provider in Profile → Data sources.</p>' : ''}`;
      }
    };
    posPanel(); panel();
    const pi = setInterval(() => { if (state.tab !== 'info') panel(); }, 1000);
    const onAcc = () => { posPanel(); state.lines(); }; Store.on('account', onAcc);
    el._destroy = () => { alive = false; clearInterval(pi); if (chart) { Market.saveCandles(sym, state.iv); chart.destroy(); } Market.setActive(null); const i = App.overlays.indexOf(el); if (i >= 0) App.overlays.splice(i, 1); unsubs.forEach((f) => f()); };
    el._panel = panel;
  };
  const cur = () => { const p = App.overlays[App.overlays.length - 1]; return p && p._st ? p : null; };
  acts.aiv = (el) => { const p = cur(); if (!p) return; Market.saveCandles(p._st.sym, p._st.iv); p._st.iv = el.dataset.iv; $$('#aiv [data-iv]', p).forEach((b) => b.classList.toggle('on', b === el)); p._st.reload(); };
  acts.atype = (el) => { const p = cur(); if (!p) return; p._st.type = el.dataset.k; $$('#aiv [data-k]', p).forEach((b) => b.classList.toggle('on', b === el)); p._st.apply(); };
  acts.atab = (el) => { const p = cur(); if (!p) return; p._st.tab = el.dataset.k; $$('#atabs .chip', p).forEach((b) => b.classList.toggle('on', b === el)); p._panel(); };
  acts.aretry = () => { const p = cur(); if (p) { $('#achart', p).innerHTML = ''; p._st.reload(); } };
  acts.atools = () => { const p = cur(); if (!p) return; const r = $('#atoolrow', p); r.classList.toggle('hide'); $('#atoolbtn', p).classList.toggle('on', !r.classList.contains('hide')); if (r.classList.contains('hide') && p._chart) { p._chart.tool = null; p._chart.draw(); } };
  acts.atool = (el) => { const p = cur(); if (!p || !p._chart) return; const t = p._chart.setTool(el.dataset.k); $$('#atoolrow [data-k]', p).forEach((b) => b.classList.toggle('on', b.dataset.k === t)); };
  acts.aundo = () => { const p = cur(); if (p && p._chart) p._chart.undo(); };
  acts.aclear = () => { const p = cur(); if (p && p._chart) { p._chart.clearDrawings(); App.toast('Drawings cleared'); } };
  acts['pos-close'] = async (el) => { const f = +el.dataset.f; if (f === 1 && !(await App.confirm('Close position?', 'This closes the whole position at the current simulated price.', 'Close all', true))) return; App.close(el.dataset.id, f); };
  acts['ord-cancel'] = (el) => { App.cancel(el.dataset.id); App.toast('Order cancelled'); };

  acts.alayout = () => {
    const p = cur(); if (!p) return; const st = p._st; const sym = st.sym; const presets = Object.keys(S().presets);
    App.sheet(`<h2>Layouts & presets</h2>
      <div class="card glass tight" style="margin:0 0 12px"><b>${esc(F.base(sym))} layout</b><div class="sub muted" style="margin:4px 0 10px">Saves interval, chart type and indicators for this asset. It loads automatically next time.</div><button class="btn primary sm" data-act="lay-save">Save layout for ${esc(F.base(sym))}</button> ${S().layouts[sym] ? '<button class="btn sm" data-act="lay-clear">Reset</button>' : ''}</div>
      <div class="card glass tight" style="margin:0"><b>Indicator presets</b><div class="sub muted" style="margin:4px 0 10px">Reusable across every asset.</div>
        <div class="row" style="margin-bottom:10px"><input class="inp" id="prn" placeholder="Preset name" maxlength="24"><button class="btn sm" data-act="pre-save">Save</button></div>
        ${presets.length ? presets.map((n) => `<div class="row" style="margin:6px 0"><button class="chip sp" data-act="pre-apply" data-n="${esc(n)}" style="justify-content:flex-start">${esc(n)}</button><button class="icon-btn" style="width:36px;height:36px;font-size:14px" data-act="pre-del" data-n="${esc(n)}">🗑</button></div>`).join('') : '<div class="sub muted">No presets yet.</div>'}</div>`);
  };
  acts['lay-save'] = () => { const p = cur(); if (!p) return; const st = p._st; S().layouts[st.sym] = { iv: st.iv, type: st.type, ind: JSON.parse(JSON.stringify(st.ind)) }; Store.save(); App.closeSheet(); App.toast('Layout saved', 'ok'); };
  acts['lay-clear'] = () => { const p = cur(); if (!p) return; delete S().layouts[p._st.sym]; Store.save(); App.closeSheet(); App.toast('Layout reset'); };
  acts['pre-save'] = () => { const p = cur(); const n = ($('#prn').value || '').trim(); if (!p || !n) { App.toast('Name your preset', 'err'); return; } S().presets[n] = JSON.parse(JSON.stringify(p._st.ind)); Store.save(); App.closeSheet(); App.toast('Preset saved', 'ok'); };
  acts['pre-apply'] = (el) => { const p = cur(); if (!p) return; p._st.ind = Object.assign(defInd(), JSON.parse(JSON.stringify(S().presets[el.dataset.n]))); p._st.apply(); App.closeSheet(); App.toast('Preset applied'); };
  acts['pre-del'] = (el) => { delete S().presets[el.dataset.n]; Store.save(); acts.alayout(); };

  acts.aind = () => {
    const p = cur(); if (!p) return; const st = p._st;
    const render = () => {
      const g = st.ind; const tog = (k, l, step) => `<div class="row" style="min-height:48px"><button class="chip ${g[k].on ? 'on' : ''}" data-act="ind-t" data-k="${k}" style="min-width:110px">${l}${step ? ' ' + g[k].p : ''}</button>${step ? `<button class="icon-btn" style="width:36px;height:36px" data-act="ind-p" data-k="${k}" data-d="-1">−</button><button class="icon-btn" style="width:36px;height:36px" data-act="ind-p" data-k="${k}" data-d="1">+</button>` : ''}</div>`;
      return `<h2>Indicators</h2><div class="lbl">On the chart</div>${tog('sma', 'SMA', 1)}${tog('ema', 'EMA', 1)}${tog('ema2', 'EMA 2', 1)}${tog('bb', 'Bollinger Bands')}${tog('vwap', 'VWAP')}${tog('sr', 'Support / Resistance')}
        <div class="lbl" style="margin-top:12px">Panels (max 2)</div><div class="chips" style="padding:8px 0">${SUBS.map(([k, l]) => `<button class="chip ${g.subs.includes(k) ? 'on' : ''}" data-act="ind-s" data-k="${k}">${l}</button>`).join('')}</div>
        <button class="btn primary block" data-act="ind-done" style="margin-top:12px">Done</button>`;
    };
    const sh = App.sheet(render()); const redraw = () => { $('.body', sh).innerHTML = render(); st.apply(); }; sh._redraw = redraw;
  };
  const shEl = () => document.querySelector('.sheet');
  acts['ind-t'] = (el) => { const p = cur(), g = p._st.ind[el.dataset.k]; g.on = !g.on; shEl()._redraw(); };
  acts['ind-p'] = (el) => { const p = cur(), g = p._st.ind[el.dataset.k]; g.p = Math.max(2, Math.min(300, g.p + (+el.dataset.d) * (g.p >= 50 ? 5 : 1))); shEl()._redraw(); };
  acts['ind-s'] = (el) => { const p = cur(), s = p._st.ind.subs, k = el.dataset.k, i = s.indexOf(k); if (i >= 0) s.splice(i, 1); else { if (s.length >= 2) s.shift(); s.push(k); } shEl()._redraw(); };
  acts['ind-done'] = () => App.closeSheet();
})();
