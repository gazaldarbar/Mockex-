/* UI part 2: Trade ticket, Portfolio, History + receipts + share cards. */
(function () {
  'use strict';
  const { $, $$, acts } = App; const S = () => Store.s; const esc = F.esc; const coin = UI.coin;
  const num = F.num;

  /* ---------- helpers ---------- */
  UI.compress = (file, max = 640) => new Promise((res, rej) => {
    const r = new FileReader(); r.onerror = rej;
    r.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.6)); }; im.src = r.result; };
    r.readAsDataURL(file);
  });
  UI.shareCanvas = async (cv, name) => {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const file = new File([blob], name + '.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Mockex', text: 'Paper trading result · TradeLab' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); App.toast('Card saved to downloads', 'ok');
  };
  const BR = { mark: new Image(), wm: new Image() }; BR.mark.src = 'brand/mark.png'; BR.wm.src = 'brand/wordmark.png';
  function drawBrand(c) {
    if (BR.mark.naturalWidth) { const h = 62, w = h * BR.mark.naturalWidth / BR.mark.naturalHeight; c.drawImage(BR.mark, 70, 56, w, h); if (BR.wm.naturalWidth) { const wh = 40; c.drawImage(BR.wm, 70 + w + 22, 56 + (h - wh) / 2, wh * BR.wm.naturalWidth / BR.wm.naturalHeight, wh); } }
    else { c.fillStyle = '#fff'; c.font = '700 44px system-ui'; c.fillText('Mockex', 70, 100); }
  }
  function cardBase(w, h) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0a0d1f'); g.addColorStop(1, '#1a0f33'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    [[w * 0.15, h * 0.1, 520, '#8b7bff'], [w * 0.95, h * 0.45, 480, '#22d3ee'], [w * 0.2, h * 0.95, 560, '#ff5fd2']].forEach(([x, y, r, col]) => { const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col + '88'); rg.addColorStop(1, col + '00'); c.fillStyle = rg; c.fillRect(0, 0, w, h); });
    c.fillStyle = 'rgba(255,255,255,.08)'; c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2; c.beginPath(); c.roundRect(60, 160, w - 120, h - 330, 56); c.fill(); c.stroke();
    return { cv, c };
  }
  UI.tradeCard = (t) => {
    const { cv, c } = cardBase(1080, 1350); const up = t.pnl >= 0; const col = up ? '#2ee6a6' : '#ff5c7a';
    drawBrand(c); c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '500 30px system-ui'; c.fillText('Paper trade · simulated', 70, 150);
    c.fillStyle = '#fff'; c.font = '800 96px system-ui'; c.fillText(F.base(t.symbol) + ' ' + t.side.toUpperCase() + (t.leverage > 1.05 ? ' ' + t.leverage.toFixed(1) + '×' : ''), 110, 340);
    c.fillStyle = col; c.font = '800 190px system-ui'; c.fillText(F.pct(t.marginPct, 1), 100, 570);
    c.font = '700 70px system-ui'; c.fillText(F.smoney(t.pnl), 110, 670);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '500 44px system-ui';
    [['Entry', F.price(t.entry)], ['Exit', F.price(t.exit)], ['Size', F.qty(t.qty) + ' ' + F.base(t.symbol)], ['Held', F.dur(t.closedAt - t.openedAt)], ['Closed by', ({ sl: 'Stop-loss', tp: 'Take-profit', trail: 'Trailing stop', liq: 'Liquidation', manual: 'Manual' })[t.reason] || t.reason]].forEach(([k, v], i) => { c.fillStyle = 'rgba(255,255,255,.5)'; c.fillText(k, 110, 790 + i * 92); c.fillStyle = '#fff'; c.textAlign = 'right'; c.fillText(v, 970, 790 + i * 92); c.textAlign = 'left'; });
    c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '500 28px system-ui'; c.fillText('Paper trading is for education and practice only.', 70, 1260); c.fillText(new Date(t.closedAt).toLocaleString('en-GB'), 70, 1300);
    return cv;
  };
  UI.perfCard = () => {
    const a = S().acct, st = Engine.stats(a, S().equity), { cv, c } = cardBase(1080, 1350), ret = Rewards.ret(), col = ret >= 0 ? '#2ee6a6' : '#ff5c7a';
    drawBrand(c); c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '500 30px system-ui'; c.fillText('Performance snapshot · simulated', 70, 150);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '500 40px system-ui'; c.fillText('Total return', 110, 290); c.fillStyle = col; c.font = '800 190px system-ui'; c.fillText(F.pct(ret, 1), 100, 480);
    c.fillStyle = '#fff'; c.font = '700 64px system-ui'; c.fillText(F.money(App.equity()), 110, 580);
    const pts = S().equity.slice(-120); if (pts.length > 2) { const vs = pts.map((p) => p[1]), mn = Math.min(...vs), mx = Math.max(...vs); c.beginPath(); pts.forEach((p, i) => { const x = 110 + (i / (pts.length - 1)) * 860, y = 780 - ((p[1] - mn) / (mx - mn || 1)) * 140; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.strokeStyle = col; c.lineWidth = 6; c.stroke(); }
    [['Trades', st.trades], ['Win rate', st.trades ? st.winRate.toFixed(0) + '%' : '—'], ['Profit factor', st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2)], ['Max drawdown', st.maxDD.toFixed(1) + '%']].forEach(([k, v], i) => { c.font = '500 40px system-ui'; c.fillStyle = 'rgba(255,255,255,.5)'; c.fillText(k, 110, 900 + i * 90); c.fillStyle = '#fff'; c.textAlign = 'right'; c.fillText(String(v), 970, 900 + i * 90); c.textAlign = 'left'; });
    c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '500 28px system-ui'; c.fillText('Paper trading is for education and practice only.', 70, 1260); c.fillText('Simulated results do not guarantee future performance.', 70, 1300);
    return cv;
  };

  /* ---------- TRADE TICKET ---------- */
  UI.openTrade = (sym, side) => {
    const st = { sym, side: side || 'long', type: 'market', mode: S().settings.sizeMode || 'usd', amt: '', lev: 1, limit: '', sl: '', tp: '', trail: '', tags: [], busy: false };
    const el = App.openPage('trade', `
      <div class="hd"><button class="icon-btn" data-act="back" aria-label="Back">${UI.IC.back}</button>${coin(sym, 40)}<div class="col sp" style="gap:0"><b style="font-size:18px">Trade ${esc(F.base(sym))}</b><span class="num sub muted" data-live="price:${sym}">—</span></div><span class="badge warn hide" data-live="stale:${sym}">STALE</span></div>
      <div class="bd">
        <div style="padding:0 16px 10px"><div class="seg" id="tside"><button class="long ${st.side === 'long' ? 'on' : ''}" data-act="t-side" data-v="long">Buy / Long</button><button class="short ${st.side === 'short' ? 'on' : ''}" data-act="t-side" data-v="short">Sell / Short</button></div></div>
        <div class="chips" id="ttype">${[['market', 'Market'], ['limit', 'Limit'], ['bracket', 'Bracket']].map(([k, l]) => `<button class="chip ${st.type === k ? 'on' : ''}" data-act="t-type" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="chips" id="tmode" style="padding-top:0">${[['usd', 'Amount $'], ['pct', '% of balance'], ['risk', 'Risk %']].map(([k, l]) => `<button class="chip ${st.mode === k ? 'on' : ''}" data-act="t-mode" data-v="${k}" style="height:32px;font-size:13px">${l}</button>`).join('')}</div>
        <div class="amt num"><span id="tamt">0</span><span id="tunit" class="muted" style="font-size:22px"></span></div>
        <div class="sub muted" id="tqty" style="text-align:center;margin-top:-4px;min-height:20px"></div>
        <div class="chips hide" id="tquick" style="justify-content:center">${[25, 50, 75, 100].map((n) => `<button class="chip" data-act="t-quick" data-v="${n}">${n}%</button>`).join('')}</div>
        <div style="padding:6px 16px"><div class="keypad" id="tkeys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => `<button data-act="t-key" data-k="${k}" aria-label="${k === '⌫' ? 'Backspace' : k}">${k}</button>`).join('')}</div></div>
        <div class="card glass" style="margin-top:14px"><div class="row between"><b>Leverage <span class="badge" id="tlevb">1×</span></b><span class="sub muted">simulated</span></div><input type="range" id="tlev" min="1" max="${S().settings.maxLev}" step="1" value="1" aria-label="Leverage"><div class="sub warn hide" id="tlevw" style="color:var(--warn)">Higher leverage brings liquidation closer. Practice with care.</div></div>
        <div class="card glass"><div class="grid2">
          <label class="field hide" id="flimit"><span>Limit price</span><input class="inp num" id="ilimit" inputmode="decimal" placeholder="Price" autocomplete="off"></label>
          <label class="field"><span>Stop-loss</span><input class="inp num" id="isl" inputmode="decimal" placeholder="Optional" autocomplete="off"></label>
          <label class="field"><span>Take-profit</span><input class="inp num" id="itp" inputmode="decimal" placeholder="Optional" autocomplete="off"></label>
          <label class="field"><span>Trailing stop %</span><input class="inp num" id="itr" inputmode="decimal" placeholder="Optional" autocomplete="off"></label></div>
          <div class="chips" style="padding:12px 0 0"><span class="sub muted" style="align-self:center;flex:none">SL</span>${[1, 2, 5].map((n) => `<button class="chip" data-act="t-slq" data-v="${n}" style="height:30px;font-size:12.5px">${n}%</button>`).join('')}<span class="sub muted" style="align-self:center;flex:none">TP</span>${[2, 4, 10].map((n) => `<button class="chip" data-act="t-tpq" data-v="${n}" style="height:30px;font-size:12.5px">${n}%</button>`).join('')}</div>
          <div class="chips" style="padding:6px 0 0">${S().tags.slice(0, 6).map((t) => `<button class="chip" data-act="t-tag" data-v="${esc(t)}" style="height:30px;font-size:12.5px">#${esc(t)}</button>`).join('')}</div></div>
        <div class="card glass" id="trisk"></div>
        <p class="disc">Simulated order. No real money, exchange or broker is involved.</p>
      </div>
      <div class="ft"><button class="btn primary sp block" id="treview" data-act="t-review">Review order</button></div>`);
    el._tr = st; $('#ilimit', el).addEventListener('input', (e) => { st.limit = e.target.value; calc(el); });
    ['sl:isl', 'tp:itp', 'trail:itr'].forEach((m) => { const [k, id] = m.split(':'); $('#' + id, el).addEventListener('input', (e) => { st[k] = e.target.value; calc(el); }); });
    $('#tlev', el).addEventListener('input', (e) => { st.lev = +e.target.value; $('#tlevb', el).textContent = st.lev + '×'; $('#tlevw', el).classList.toggle('hide', st.lev < 5); calc(el); });
    const iv = setInterval(() => calc(el), 1000); const old = el._destroy; el._destroy = () => { clearInterval(iv); if (old) old(); };
    paintMode(el); calc(el); Market.reconcile();
  };
  const trEl = () => App.overlays.slice().reverse().find((p) => p._tr);
  function paintMode(el) {
    const st = el._tr; $('#tunit', el).textContent = st.mode === 'usd' ? ' USD' : st.mode === 'pct' ? ' %' : ' % risk'; $('#tquick', el).classList.toggle('hide', st.mode !== 'pct');
    $('#flimit', el).classList.toggle('hide', st.type !== 'limit'); $('#tamt', el).textContent = st.amt || '0';
  }
  function order(el) {
    const st = el._tr, a = S().acct, eq = App.equity(), px = App.px(st.sym); const lim = st.type === 'limit' ? num(st.limit) : 0; const ref = lim > 0 ? lim : px;
    const free = a.cash - Engine.reserved(a); const sl = num(st.sl), tp = num(st.tp), trail = num(st.trail);
    const qty = Engine.sizeQty({ mode: st.mode, value: num(st.amt), price: ref, equity: eq, cash: free, leverage: st.lev, sl, side: st.side });
    return { symbol: st.sym, side: st.side, type: st.type, qty, leverage: st.lev, limit: lim || undefined, sl: sl || undefined, tp: tp || undefined, trail: trail || undefined, tags: st.tags.slice(), _px: px, _eq: eq };
  }
  function calc(el) {
    if (!el.isConnected) return; const st = el._tr, o = order(el); const box = $('#trisk', el); const px = o._px;
    if (!(px > 0)) { box.innerHTML = '<div class="skel" style="height:90px"></div>'; return; }
    $('#tamt', el).textContent = st.amt || '0'; $('#tqty', el).textContent = o.qty > 0 ? `≈ ${F.qty(o.qty)} ${F.base(st.sym)}` : (st.mode === 'risk' && !num(st.sl) ? 'Set a stop-loss to size by risk' : '');
    if (!(o.qty > 0)) { box.innerHTML = '<div class="empty" style="padding:18px">Enter an amount to see fees, risk and potential profit/loss.</div>'; return; }
    const e = Engine.estimate(Store.eng(), o, px, o._eq); const err = App.guard(st.sym) || Engine.validate(S().acct, Store.eng(), o, px, o._eq);
    box.innerHTML = `<div class="row between" style="margin-bottom:6px"><b>Risk calculator</b>${e.rr ? `<span class="badge ${e.rr >= 2 ? 'up' : e.rr < 1 ? 'down' : ''}">R:R ${e.rr.toFixed(2)}</span>` : ''}</div>
      <div class="kv"><span>Position value</span><span class="num">${F.money(e.notional)}</span></div><div class="kv"><span>Margin used</span><span class="num">${F.money(e.margin)}</span></div>
      <div class="kv"><span>Est. fee (entry)</span><span class="num">${F.money(e.fee)}</span></div><div class="kv"><span>Slippage cost</span><span class="num">${F.money(e.slipCost)}</span></div>
      <div class="kv"><span>Liquidation price</span><span class="num" style="color:var(--warn)">${st.lev > 1 || st.side === 'short' ? F.price(e.liq) : 'none (1×)'}</span></div>
      ${e.profitAtTP != null ? `<div class="kv"><span>Profit at target</span><span class="num up">${F.smoney(e.profitAtTP)}</span></div>` : ''}${e.lossAtSL != null ? `<div class="kv"><span>Loss at stop</span><span class="num down">${F.smoney(e.lossAtSL)} · ${e.riskPct.toFixed(2)}% of equity</span></div>` : ''}
      ${err ? `<div class="sub" style="color:var(--down);margin-top:8px;font-weight:600">⚠ ${esc(err)}</div>` : ''}`;
    el._err = err; $('#treview', el).disabled = !!err; $('#treview', el).className = 'btn sp block ' + (st.side === 'long' ? 'buy' : 'sell');
    $('#treview', el).textContent = (err ? 'Review order' : `Review ${st.side === 'long' ? 'Buy' : 'Sell short'} ${F.base(st.sym)}`);
  }
  acts['t-side'] = (b) => { const el = trEl(); el._tr.side = b.dataset.v; $$('#tside button', el).forEach((x) => x.classList.toggle('on', x === b)); calc(el); };
  acts['t-type'] = (b) => { const el = trEl(); el._tr.type = b.dataset.v; $$('#ttype .chip', el).forEach((x) => x.classList.toggle('on', x === b)); paintMode(el); calc(el); };
  acts['t-mode'] = (b) => { const el = trEl(); el._tr.mode = b.dataset.v; el._tr.amt = ''; S().settings.sizeMode = b.dataset.v; $$('#tmode .chip', el).forEach((x) => x.classList.toggle('on', x === b)); paintMode(el); calc(el); };
  acts['t-quick'] = (b) => { const el = trEl(); el._tr.amt = b.dataset.v; calc(el); };
  acts['t-key'] = (b) => { const el = trEl(), st = el._tr, k = b.dataset.k; if (k === '⌫') st.amt = st.amt.slice(0, -1); else if (k === '.') { if (!st.amt.includes('.')) st.amt = (st.amt || '0') + '.'; } else if (st.amt.length < 10) st.amt = (st.amt === '0' ? '' : st.amt) + k; calc(el); };
  const rel = (side, pct, kind) => { const px = App.px(trEl()._tr.sym); const long = side === 'long'; const dir = kind === 'sl' ? (long ? -1 : 1) : (long ? 1 : -1); return +(px * (1 + dir * pct / 100)).toPrecision(8); };
  acts['t-slq'] = (b) => { const el = trEl(); el._tr.sl = String(rel(el._tr.side, +b.dataset.v, 'sl')); $('#isl', el).value = el._tr.sl; calc(el); };
  acts['t-tpq'] = (b) => { const el = trEl(); el._tr.tp = String(rel(el._tr.side, +b.dataset.v, 'tp')); $('#itp', el).value = el._tr.tp; calc(el); };
  acts['t-tag'] = (b) => { const el = trEl(), t = b.dataset.v, a = el._tr.tags, i = a.indexOf(t); if (i >= 0) a.splice(i, 1); else a.push(t); b.classList.toggle('on', i < 0); };
  acts['t-review'] = () => {
    const el = trEl(), st = el._tr, o = order(el), px = o._px, e = Engine.estimate(Store.eng(), o, px, o._eq);
    const sh = App.sheet(`<h2>Confirm order</h2>
      <div class="row" style="margin-bottom:12px">${coin(st.sym, 44)}<div class="sp"><b style="font-size:18px">${esc(F.base(st.sym))} ${st.side === 'long' ? 'Long' : 'Short'}</b><div class="sub muted">${st.type === 'limit' ? 'Limit @ ' + F.price(o.limit) : st.type === 'bracket' ? 'Bracket (market + stop + target)' : 'Market order'}</div></div><span class="badge ${st.side === 'long' ? 'up' : 'down'}">${st.lev}×</span></div>
      <div class="card glass tight" style="margin:0 0 12px">
        <div class="kv"><span>Quantity</span><span class="num">${F.qty(o.qty)} ${esc(F.base(st.sym))}</span></div><div class="kv"><span>Est. fill price</span><span class="num">${F.price(e.px)}</span></div>
        <div class="kv"><span>Position value</span><span class="num">${F.money(e.notional)}</span></div><div class="kv"><span>Margin</span><span class="num">${F.money(e.margin)}</span></div>
        <div class="kv"><span>Fee (${(S().settings.fee * 100).toFixed(2)}%)</span><span class="num">${F.money(e.fee)}</span></div><div class="kv"><span>Slippage (est.)</span><span class="num">${F.money(e.slipCost)}</span></div>
        <div class="kv"><span><b>Total est. cost</b></span><span class="num"><b>${F.money(e.margin + e.fee)}</b></span></div>
        ${e.profitAtTP != null ? `<div class="kv"><span>If target hits</span><span class="num up">${F.smoney(e.profitAtTP)}</span></div>` : ''}${e.lossAtSL != null ? `<div class="kv"><span>If stop hits</span><span class="num down">${F.smoney(e.lossAtSL)}</span></div>` : ''}${o.trail ? `<div class="kv"><span>Trailing stop</span><span class="num">${o.trail}%</span></div>` : ''}</div>
      <div class="sub muted" style="margin-bottom:12px">Simulated trade with virtual money. Paper trading is for education and practice only.</div>
      <div class="row"><button class="btn sp" data-act="closesheet">Back</button><button class="btn sp ${st.side === 'long' ? 'buy' : 'sell'}" id="tconf" data-act="t-confirm">Place order</button></div>`);
    sh._o = o; sh._el = el;
  };
  acts.closesheet = () => App.closeSheet();
  acts['t-confirm'] = (btn) => {
    const sh = btn.closest('.sheet'), el = sh._el, st = el._tr; if (st.busy) return; st.busy = true; btn.disabled = true;
    const o = Object.assign({}, sh._o); delete o._px; delete o._eq; const r = App.place(o);
    if (!r.ok) { st.busy = false; btn.disabled = false; App.haptic('error'); App.toast(r.error, 'err'); return; }
    App.haptic('success'); App.closeSheet(); App.toast(r.pending ? `Limit order placed @ ${F.price(o.limit)}` : `${st.side === 'long' ? 'Bought' : 'Shorted'} ${F.qty(o.qty)} ${F.base(st.sym)} @ ${F.price(r.fillPrice)}`, 'ok');
    setTimeout(() => App.closePage(el), 250);
  };

  /* ---------- PORTFOLIO ---------- */
  const PF = { tab: 'pos', range: 'all' };
  const PAL = ['#8b7bff', '#22d3ee', '#2ee6a6', '#ff5fd2', '#ffc857', '#ff8a5c', '#5c8aff'];
  function posCard(p) {
    const px = App.px(p.symbol) || p.entry, pnl = Engine.pnlOf(p, px), ts = Engine.trailStop(p);
    return `<div class="card glass"><div class="row">${coin(p.symbol)}<div class="col sp" style="gap:2px"><div style="font-weight:800;font-size:17px">${esc(F.base(p.symbol))} <span class="badge ${p.side === 'long' ? 'up' : 'down'}">${p.side.toUpperCase()}${p.leverage > 1.05 ? ' ' + p.leverage.toFixed(1) + '×' : ''}</span></div><div class="sub muted">${F.qty(p.qty)} · opened ${F.ago(p.openedAt)}</div></div>
        <div class="col" style="align-items:flex-end;gap:0"><b class="num" style="font-size:19px" data-live="pos:${p.id}:pnl">${F.smoney(pnl)}</b><span class="num" style="font-size:13px" data-live="pos:${p.id}:pct">${F.pct(pnl / p.margin * 100)}</span></div></div>
      <div class="grid2" style="margin-top:12px"><div><span class="lbl">Entry</span><div class="num"><b>${F.price(p.entry)}</b></div></div><div><span class="lbl">Current</span><div class="num"><b data-live="pos:${p.id}:px">${F.price(px)}</b></div></div>
        <div><span class="lbl">Stop-loss</span><div class="num down"><b>${p.sl ? F.price(p.sl) : ts ? F.price(ts) + ' ⟲' : '—'}</b></div></div><div><span class="lbl">Take-profit</span><div class="num up"><b>${p.tp ? F.price(p.tp) : '—'}</b></div></div></div>
      <div style="margin:16px 4px 10px"><div class="rail"><i data-live="pos:${p.id}:rail" style="left:50%"></i></div><div class="row between sub muted" style="margin-top:6px"><span>${p.sl ? 'Stop' : 'Risk zone'}</span><span>Progress to target</span><span>${p.tp ? 'Target' : 'Upside'}</span></div></div>
      <div class="row" style="flex-wrap:wrap"><button class="btn sm sp" data-act="pos-edit" data-id="${p.id}">Edit SL/TP</button><button class="btn sm" data-act="pos-close" data-id="${p.id}" data-f="0.25">25%</button><button class="btn sm" data-act="pos-close" data-id="${p.id}" data-f="0.5">50%</button><button class="btn sm sell" data-act="pos-close" data-id="${p.id}" data-f="1">Close</button></div></div>`;
  }
  function closedRow(t) {
    return `<div class="item" data-act="receipt" data-id="${t.id}">${coin(t.symbol)}<div class="col sp" style="gap:2px"><b>${esc(F.base(t.symbol))} <span class="badge ${t.side === 'long' ? 'up' : 'down'}">${t.side.toUpperCase()}</span>${t.partial ? ' <span class="badge">PARTIAL</span>' : ''}</b><span class="sub muted">${F.date(t.closedAt)} · ${({ sl: 'Stop', tp: 'Target', trail: 'Trail', liq: 'Liquidated', manual: 'Manual' })[t.reason]}</span></div><div class="col" style="align-items:flex-end;gap:0"><b class="num ${t.pnl >= 0 ? 'up' : 'down'}">${F.smoney(t.pnl)}</b><span class="num sub ${t.pnl >= 0 ? 'up' : 'down'}">${F.pct(t.marginPct, 1)}</span></div></div>`;
  }
  UI.closedRow = closedRow;
  UI.screens.portfolio = {
    html() {
      const st = S(), a = st.acct, s = Engine.stats(a, st.equity);
      const parts = [{ n: 'Cash', v: Math.max(0, a.cash - 0), c: PAL[0] }].concat(a.positions.map((p, i) => ({ n: F.base(p.symbol), v: Math.max(0, p.margin + Engine.pnlOf(p, App.px(p.symbol) || p.entry)), c: PAL[(i + 1) % PAL.length] })));
      UI._parts = parts; const tot = parts.reduce((x, p) => x + p.v, 0) || 1;
      const tabs = [['pos', `Positions (${a.positions.length})`], ['ord', `Orders (${a.orders.length})`], ['closed', 'Closed']];
      let body = '';
      if (PF.tab === 'pos') body = a.positions.length ? a.positions.map(posCard).join('') : `<div class="card glass empty"><div class="em">🧊</div>No open positions.<br><button class="btn primary sm" style="margin-top:14px" data-act="tab" data-tab="markets">Browse markets</button></div>`;
      if (PF.tab === 'ord') body = a.orders.length ? a.orders.map((o) => `<div class="card glass tight row">${coin(o.symbol)}<div class="sp"><b>${esc(F.base(o.symbol))} ${o.side} limit</b><div class="sub muted">${F.qty(o.qty)} @ ${F.price(o.limit)} · reserved ${F.money(o.reserve)}</div></div><button class="btn sm" data-act="ord-cancel" data-id="${o.id}">Cancel</button></div>`).join('') : '<div class="card glass empty"><div class="em">⏳</div>No pending orders.</div>';
      if (PF.tab === 'closed') body = a.history.length ? `<div class="card glass" style="padding:4px 14px">${a.history.slice().reverse().slice(0, 15).map(closedRow).join('')}</div>${a.history.length > 15 ? '<div style="text-align:center"><button class="btn sm" data-act="open-history">All trades</button></div>' : ''}` : '<div class="card glass empty"><div class="em">📭</div>Closed trades appear here.</div>';
      return `<div class="hero"><div class="lbl">Account equity</div><div class="big num" data-live="eq">${F.money(App.equity())}</div>
        <div class="row" style="margin-top:6px;gap:12px"><span class="num" data-live="ret">0%</span><span class="muted">total return</span><span class="sp"></span><span class="num" data-live="unreal">${F.smoney(App.unreal())}</span><span class="muted" style="font-size:13px">unrealised</span></div></div>
      <div class="chips" id="prange">${[['1d', '1D'], ['1w', '1W'], ['all', 'All']].map(([k, l]) => `<button class="chip ${PF.range === k ? 'on' : ''}" data-act="prange" data-k="${k}" style="height:30px">${l}</button>`).join('')}<span class="sp"></span><button class="chip" data-act="open-history">🧾 History</button><button class="chip" data-act="open-journal">📓 Journal</button></div>
      <div class="card glass" style="padding:10px 6px 4px"><canvas id="pcurve" style="width:100%;height:150px;display:block"></canvas></div>
      <div class="card glass"><div class="row" style="gap:18px"><canvas id="pdonut" style="width:132px;height:132px;flex:none"></canvas><div class="col sp">${parts.map((p) => `<div class="row"><i style="width:10px;height:10px;border-radius:50%;background:${p.c};display:inline-block"></i><span class="sp">${esc(p.n)}</span><b class="num">${(p.v / tot * 100).toFixed(0)}%</b></div>`).join('')}</div></div></div>
      <div class="card glass"><div class="grid3">
        <div class="stat"><span class="lbl">Win rate</span><b>${s.trades ? s.winRate.toFixed(0) + '%' : '—'}</b></div><div class="stat"><span class="lbl">Profit factor</span><b>${s.trades ? (s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)) : '—'}</b></div><div class="stat"><span class="lbl">Expectancy</span><b class="num">${s.trades ? F.smoney(s.expectancy) : '—'}</b></div>
        <div class="stat"><span class="lbl">Avg win</span><b class="num up">${s.wins ? F.money(s.avgWin) : '—'}</b></div><div class="stat"><span class="lbl">Avg loss</span><b class="num down">${s.losses ? F.money(s.avgLoss) : '—'}</b></div><div class="stat"><span class="lbl">Max drawdown</span><b>${s.maxDD.toFixed(1)}%</b></div></div>
        <div class="row" style="margin-top:12px"><button class="btn sm sp" data-act="share-perf">📤 Share snapshot</button></div></div>
      <div class="chips" id="ptabs">${tabs.map(([k, l]) => `<button class="chip ${PF.tab === k ? 'on' : ''}" data-act="ptab" data-k="${k}">${l}</button>`).join('')}</div>${body}`;
    },
    mount(v) {
      const now = Date.now(), cut = PF.range === '1d' ? now - 864e5 : PF.range === '1w' ? now - 6048e5 : 0; let pts = S().equity.filter((p) => p[0] >= cut); if (pts.length < 2 && S().equity.length) pts = S().equity.slice(-2);
      Draw.curve($('#pcurve', v), pts.slice(-500), PF.range === 'all' ? S().acct.start : (pts[0] ? pts[0][1] : S().acct.start));
      const parts = UI._parts; Draw.donut($('#pdonut', v), parts.map((p) => ({ v: p.v || 0.0001, c: p.c })));
    },
  };
  acts.ptab = (b) => { PF.tab = b.dataset.k; UI.render(true); };
  acts.prange = (b) => { PF.range = b.dataset.k; UI.render(true); };
  acts['share-perf'] = () => UI.shareCanvas(UI.perfCard(), 'mockex-performance');
  acts['pos-edit'] = (b) => {
    const p = S().acct.positions.find((x) => x.id === b.dataset.id); if (!p) return;
    App.sheet(`<h2>${esc(F.base(p.symbol))} ${p.side} · exits</h2><div class="sub muted" style="margin-bottom:12px">Entry ${F.price(p.entry)} · now ${F.price(App.px(p.symbol) || p.entry)}</div>
      <div class="col" style="gap:12px"><label class="field"><span>Stop-loss</span><input class="inp num" id="esl" inputmode="decimal" value="${p.sl || ''}" placeholder="None"></label><label class="field"><span>Take-profit</span><input class="inp num" id="etp" inputmode="decimal" value="${p.tp || ''}" placeholder="None"></label><label class="field"><span>Trailing stop %</span><input class="inp num" id="etr" inputmode="decimal" value="${p.trail || ''}" placeholder="None"></label></div>
      <div class="row" style="margin-top:16px"><button class="btn sp" data-act="closesheet">Cancel</button><button class="btn primary sp" data-act="pos-edit-save" data-id="${p.id}">Save</button></div>`);
  };
  acts['pos-edit-save'] = (b) => { const err = Engine.modifyPosition(S().acct, b.dataset.id, { sl: num($('#esl').value), tp: num($('#etp').value), trail: num($('#etr').value) }); if (err) { App.toast(err, 'err'); return; } App.closeSheet(); App.toast('Exits updated', 'ok'); Store.save(); Store.emit('account'); };

  /* ---------- HISTORY ---------- */
  const HF = { f: 'all', q: '', tag: '' };
  function histList() {
    let h = S().acct.history.slice().reverse(); const q = HF.q.toLowerCase();
    if (HF.f === 'win') h = h.filter((t) => t.pnl > 0); if (HF.f === 'loss') h = h.filter((t) => t.pnl <= 0); if (HF.f === 'long' || HF.f === 'short') h = h.filter((t) => t.side === HF.f);
    if (HF.tag) h = h.filter((t) => (t.tags || []).includes(HF.tag)); if (q) h = h.filter((t) => t.symbol.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q) || (t.tags || []).some((x) => x.includes(q)));
    return h.length ? h.slice(0, 200).map(closedRow).join('') : `<div class="empty"><div class="em">🧾</div>${S().acct.history.length ? 'No trades match these filters.' : 'No closed trades yet. Your receipts will live here.'}</div>`;
  }
  acts['open-history'] = () => {
    const tags = [...new Set(S().acct.history.flatMap((t) => t.tags || []))];
    const el = App.openPage('history', `<div class="hd"><button class="icon-btn" data-act="back">${UI.IC.back}</button><h2 class="sp">Trade history</h2><button class="icon-btn" data-act="export-csv" aria-label="Export CSV">⬇</button></div>
      <div class="bd"><div class="search glass" style="margin-top:4px">${UI.IC.search}<input id="hq" placeholder="Search symbol, note or tag" value="${esc(HF.q)}"></div>
      <div class="chips">${[['all', 'All'], ['win', 'Winners'], ['loss', 'Losers'], ['long', 'Long'], ['short', 'Short']].map(([k, l]) => `<button class="chip ${HF.f === k ? 'on' : ''}" data-act="hf" data-k="${k}">${l}</button>`).join('')}${tags.map((t) => `<button class="chip ${HF.tag === t ? 'on' : ''}" data-act="htag" data-k="${esc(t)}">#${esc(t)}</button>`).join('')}</div>
      <div class="card glass" style="padding:4px 14px" id="hlist">${histList()}</div></div>`);
    $('#hq', el).addEventListener('input', (e) => { HF.q = e.target.value; $('#hlist', el).innerHTML = histList(); });
  };
  const hrefresh = () => { const el = App.overlays.find((p) => p.dataset.page === 'history'); if (!el) return; $('#hlist', el).innerHTML = histList(); $$('.chips .chip', el).forEach((c) => c.classList.toggle('on', (c.dataset.act === 'hf' && c.dataset.k === HF.f) || (c.dataset.act === 'htag' && c.dataset.k === HF.tag))); };
  acts.hf = (b) => { HF.f = b.dataset.k; hrefresh(); };
  acts.htag = (b) => { HF.tag = HF.tag === b.dataset.k ? '' : b.dataset.k; hrefresh(); };
  acts['export-csv'] = () => {
    const rows = [['closed', 'symbol', 'side', 'qty', 'entry', 'exit', 'pnl', 'fees', 'return_pct', 'reason', 'tags', 'note']].concat(S().acct.history.map((t) => [new Date(t.closedAt).toISOString(), t.symbol, t.side, t.qty, t.entry, t.exit, t.pnl.toFixed(4), t.fees.toFixed(4), t.marginPct.toFixed(2), t.reason, (t.tags || []).join('|'), (t.note || '').replace(/"/g, '""')]));
    const csv = rows.map((r) => r.map((c) => { let x = String(c); if (/^[=+\-@]/.test(x)) x = "'" + x; return /[",\n]/.test(x) ? '"' + x + '"' : x; }).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'tradelab-trades.csv'; document.body.appendChild(a); a.click(); a.remove(); App.toast('CSV exported', 'ok');
  };
  acts.receipt = (b) => {
    const t = S().acct.history.find((x) => x.id === b.dataset.id); if (!t) return; const up = t.pnl >= 0;
    const sh = App.sheet(`<div class="row" style="margin-bottom:6px">${coin(t.symbol, 46)}<div class="sp"><h2 style="margin:0">${esc(F.base(t.symbol))} ${t.side}</h2><div class="sub muted">Receipt ${esc(t.id)} · ${F.date(t.closedAt)}</div></div></div>
      <div class="hero" style="padding:8px 0"><div class="big num ${up ? 'up' : 'down'}" style="font-size:38px">${F.smoney(t.pnl)}</div><div class="num ${up ? 'up' : 'down'}">${F.pct(t.marginPct)} on margin · ${F.pct(t.retPct)} price</div></div>
      <div class="card glass tight" style="margin:0 0 12px"><div class="kv"><span>Entry → Exit</span><span class="num">${F.price(t.entry)} → ${F.price(t.exit)}</span></div><div class="kv"><span>Quantity</span><span class="num">${F.qty(t.qty)}</span></div><div class="kv"><span>Leverage</span><span class="num">${t.leverage.toFixed(1)}×</span></div><div class="kv"><span>Gross PnL</span><span class="num">${F.smoney(t.pnlGross)}</span></div><div class="kv"><span>Fees</span><span class="num">${F.money(t.fees)}</span></div><div class="kv"><span>Held</span><span>${F.dur(t.closedAt - t.openedAt)}</span></div><div class="kv"><span>Closed by</span><span>${({ sl: 'Stop-loss', tp: 'Take-profit', trail: 'Trailing stop', liq: 'Liquidation', manual: 'Manual' })[t.reason]}</span></div></div>
      <div class="lbl">Tags</div><div class="chips" style="padding:6px 0">${S().tags.map((x) => `<button class="chip ${(t.tags || []).includes(x) ? 'on' : ''}" data-act="rc-tag" data-id="${t.id}" data-k="${esc(x)}" style="height:32px">#${esc(x)}</button>`).join('')}</div>
      <label class="field" style="margin:6px 0 10px"><span>Notes</span><textarea class="inp" id="rcnote" placeholder="What was the thesis? What did you learn?" maxlength="1000">${esc(t.note || '')}</textarea></label>
      <div class="row" id="rcshots" style="flex-wrap:wrap;margin-bottom:10px">${(t.shots || []).map((s, i) => `<img src="${s}" alt="Screenshot ${i + 1}" style="width:76px;height:76px;object-fit:cover;border-radius:14px;border:1px solid var(--edge)">`).join('')}<label class="chip" style="height:76px;width:76px;justify-content:center;border-radius:14px;font-size:24px">＋<input type="file" accept="image/*" id="rcfile" hidden></label></div>
      <div class="row" style="flex-wrap:wrap"><button class="btn sm sp" data-act="rc-save" data-id="${t.id}">Save</button><button class="btn sm sp" data-act="rc-share" data-id="${t.id}">📤 Share card</button><button class="btn sm sp" data-act="rc-journal" data-id="${t.id}">📓 Journal</button></div>`);
    const f = $('#rcfile', sh); if (f) f.addEventListener('change', async () => { if (!f.files[0]) return; try { const d = await UI.compress(f.files[0]); t.shots = (t.shots || []).concat(d).slice(0, 3); Store.save(); App.closeSheet(); setTimeout(() => acts.receipt({ dataset: { id: t.id } }), 520); } catch (e) { App.toast('Could not read that image', 'err'); } });
  };
  acts['rc-tag'] = (b) => { const t = S().acct.history.find((x) => x.id === b.dataset.id), k = b.dataset.k; t.tags = t.tags || []; const i = t.tags.indexOf(k); if (i >= 0) t.tags.splice(i, 1); else t.tags.push(k); b.classList.toggle('on', i < 0); Store.save(); };
  acts['rc-save'] = (b) => { const t = S().acct.history.find((x) => x.id === b.dataset.id); t.note = $('#rcnote').value.slice(0, 1000); Store.save(true); App.closeSheet(); App.toast('Saved', 'ok'); hrefresh(); };
  acts['rc-share'] = (b) => { const t = S().acct.history.find((x) => x.id === b.dataset.id); UI.shareCanvas(UI.tradeCard(t), 'mockex-' + F.base(t.symbol).toLowerCase() + '-trade'); };
  acts['rc-journal'] = (b) => { const t = S().acct.history.find((x) => x.id === b.dataset.id); t.note = ($('#rcnote') || {}).value || t.note; Store.save(); App.closeSheet(); setTimeout(() => UI.editJournal && UI.editJournal(null, t.id), 520); };
})();
