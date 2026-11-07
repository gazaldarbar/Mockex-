const { chromium } = require('playwright');
const OUT = (process.env.SHOTS || './shots') + '/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 892 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; let restHits = {}; let wsConns = 0; const sockets = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const PX = { BTCUSDT: 70000, ETHUSDT: 3500, XRPUSDT: 0.6, SOLUSDT: 170, PAXGUSDT: 2650 };
  const t24 = (s) => ({ symbol: s, lastPrice: String(PX[s] || 1), priceChangePercent: '1.5', highPrice: String((PX[s] || 1) * 1.02), lowPrice: String((PX[s] || 1) * .98), quoteVolume: '123456789', openPrice: String(PX[s] || 1) });
  await ctx.route(/binance\.(com|vision)\/api\/v3\//, async (route) => {
    const u = new URL(route.request().url()); restHits[u.pathname] = (restHits[u.pathname] || 0) + 1;
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (u.pathname.endsWith('/ticker/24hr')) {
      const sy = u.searchParams.get('symbols'); const one = u.searchParams.get('symbol');
      const body = sy ? JSON.parse(sy).map(t24) : one ? t24(one) : Object.keys(PX).concat(['DOGEUSDT', 'BTCUPUSDT', 'ETHBTC']).map(t24);
      return route.fulfill({ headers: cors, body: JSON.stringify(body) });
    }
    if (u.pathname.endsWith('/klines')) {
      const sym = u.searchParams.get('symbol'), lim = +u.searchParams.get('limit') || 500, iv = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 }[u.searchParams.get('interval')];
      const end = Math.floor(Date.now() / iv) * iv; let px = PX[sym] || 1; const k = [];
      for (let i = lim - 1; i >= 0; i--) { const o = px, c = o * (1 + Math.sin(i / 5) * 0.002); k.unshift([end - i * iv, String(o), String(Math.max(o, c) * 1.001), String(Math.min(o, c) * .999), String(c), '10']); px = c; }
      return route.fulfill({ headers: cors, body: JSON.stringify(k) });
    }
    route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  await ctx.routeWebSocket(/binance\.(com|vision)/, (ws) => { wsConns++; sockets.push(ws); ws.onMessage((m) => {}); });
  await p.goto((process.env.BASE||'http://localhost:8123')+'/index.html'); await p.waitForTimeout(500);
  await p.click('[data-act=ob-next]'); await p.click('[data-act=ob-next]'); await p.check('#ack'); await p.click('#ackbtn'); await p.click('[data-act=ob-finish]'); await p.waitForTimeout(2500);
  const st1 = await p.evaluate(() => ({ status: Market.status, sim: Market.sim, btc: Market.prices.BTCUSDT && Market.prices.BTCUSDT.price, spark: (Market.spark.BTCUSDT || []).length }));
  console.log('boot:', JSON.stringify(st1), 'ws conns:', wsConns, 'url:', sockets[0] && sockets[0].url());
  const send = (stream, data) => sockets.forEach((s) => { try { s.send(JSON.stringify({ stream, data })); } catch (e) {} });
  send('btcusdt@ticker', { c: '71000', P: '2.9', h: '71500', l: '69000', q: '9e9', o: '69000' }); await p.waitForTimeout(500);
  console.log('live tick -> status:', await p.evaluate(() => Market.status), 'price:', await p.evaluate(() => Market.prices.BTCUSDT.price));
  // open trade with SL/TP and let the live feed trigger them
  await p.evaluate(() => { const r = App.place({ symbol: 'BTCUSDT', side: 'long', type: 'bracket', qty: 0.05, leverage: 1, sl: 70000, tp: 73000 }); window.__r = r.ok || r.error; });
  console.log('bracket placed:', await p.evaluate(() => window.__r));
  send('btcusdt@ticker', { c: '73100', P: '5', h: '73100', l: '69000', q: '9e9', o: '69000' }); await p.waitForTimeout(600);
  console.log('after price>TP -> positions:', await p.evaluate(() => Store.s.acct.positions.length), 'history reason:', await p.evaluate(() => (Store.s.acct.history[0] || {}).reason), 'pnl:', await p.evaluate(() => (Store.s.acct.history[0] || {}).pnl));
  console.log('notifs:', await p.evaluate(() => Store.s.notifs.map((n) => n.title)));
  // kline + depth + trade streams for the open asset
  await p.evaluate(() => UI.openAsset('BTCUSDT')); await p.waitForTimeout(1500);
  const now = Math.floor(Date.now() / 9e5) * 9e5;
  send('btcusdt@kline_15m', { k: { t: now, o: '73000', h: '73500', l: '72900', c: '73400', v: '5', x: false, i: '15m' } });
  send('btcusdt@depth10@1000ms', { bids: [['73390', '1.5'], ['73380', '2']], asks: [['73410', '1'], ['73420', '3']] });
  send('btcusdt@trade', { p: '73400', q: '0.2', T: Date.now(), m: true }); await p.waitForTimeout(700);
  console.log('chart last close:', await p.evaluate(() => { const c = App.overlays[0]._chart; return c.data[c.data.length - 1].c; }), 'book:', await p.evaluate(() => !!Market.books.BTCUSDT));
  await p.screenshot({ path: OUT + '20-live-asset.png' });
  console.log('subscribed streams:', await p.evaluate(() => Market.sim));
  // cache: klines request count then reopen -> incremental
  const before = restHits['/api/v3/klines'];
  await p.evaluate(() => { App.closePage(App.overlays[0]); }); await p.waitForTimeout(600);
  await p.evaluate(() => UI.openAsset('BTCUSDT')); await p.waitForTimeout(1200);
  console.log('klines REST hits before/after reopen:', before, restHits['/api/v3/klines'], '(cached or incremental)');
  // stale + reconnect: close socket from server side
  const c0 = wsConns; sockets.forEach((s) => s.close()); await p.waitForTimeout(1600);
  console.log('reconnect after drop: new ws conns', wsConns - c0, 'status', await p.evaluate(() => Market.status));
  // markets universe search incl non-USDT filtering
  await p.evaluate(() => { while (App.overlays.length) App.closePage(App.overlays[0]); }); await p.waitForTimeout(500);
  await p.click('#tabbar [data-tab=markets]'); await p.click('[data-act=mcat][data-k=all]'); await p.waitForTimeout(900);
  console.log('universe:', await p.evaluate(() => Market.universe.map((u) => u.s).join(',')));
  await p.screenshot({ path: OUT + '21-markets-live.png' });
  console.log('JS errors:', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
