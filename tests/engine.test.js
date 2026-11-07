const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../www/js/engine.js');
const I = require('../www/js/indicators.js');

const st = Object.assign({}, E.DEFAULT_SETTINGS, { slippage: 0, fee: 0.001, maxPosPct: 100, maxRiskPct: 100 });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const mk = () => E.newAccount(10000);
const long = (o = {}) => Object.assign({ symbol: 'BTCUSDT', side: 'long', type: 'market', qty: 0.1, leverage: 1 }, o);

test('market buy applies fee and slippage, deducts cash', () => {
  const a = mk(); const s = Object.assign({}, st, { slippage: 0.001 });
  const r = E.placeOrder(a, s, long(), 50000, 1000);
  assert.ok(r.ok);
  near(r.fillPrice, 50050);                 // 0.1% adverse
  near(r.fee, 50050 * 0.1 * 0.001);          // 5.005
  near(a.cash, 10000 - 5005 - 5.005);
});

test('equity and unrealized PnL track live price (long)', () => {
  const a = mk(); E.placeOrder(a, st, long(), 50000, 1000);
  const eq = E.equity(a, { BTCUSDT: 52000 });
  near(eq, 10000 - 5 + 200);                 // +$200 gross, -$5 entry fee already paid
});

test('simulated short profits when price falls', () => {
  const a = mk(); E.placeOrder(a, st, long({ side: 'short' }), 50000, 1000);
  near(E.equity(a, { BTCUSDT: 48000 }), 10000 - 5 + 200);
  const t = E.closePosition(a, st, a.positions[0].id, 48000, 1, 2000);
  near(t.pnlGross, 200); near(t.pnl, 200 - 5 - 4.8);
});

test('full close realises PnL net of both fees and returns margin', () => {
  const a = mk(); E.placeOrder(a, st, long(), 50000, 1000);
  const t = E.closePosition(a, st, a.positions[0].id, 51000, 1, 2000);
  near(t.pnl, 100 - 5 - 5.1);
  near(a.cash, 10000 + t.pnl);
  assert.equal(a.positions.length, 0);
  near(a.realized, t.pnl);
});

test('partial close keeps remainder and scales margin and fees', () => {
  const a = mk(); E.placeOrder(a, st, long(), 50000, 1000);
  const t = E.closePosition(a, st, a.positions[0].id, 51000, 0.5, 2000);
  assert.ok(t.partial);
  near(a.positions[0].qty, 0.05);
  near(a.positions[0].margin, 2500);
  near(t.pnlGross, 50);
});

test('adding to a position averages the entry price', () => {
  const a = mk();
  E.placeOrder(a, st, long({ qty: 0.05 }), 50000, 1000);
  E.placeOrder(a, st, long({ qty: 0.05 }), 60000, 4000);
  near(a.positions[0].entry, 55000); near(a.positions[0].qty, 0.1);
});

test('stop-loss triggers on a falling price', () => {
  const a = mk(); E.placeOrder(a, st, long({ sl: 49000 }), 50000, 1000);
  assert.equal(E.onTick(a, st, 'BTCUSDT', 49500, 2000).length, 0);
  const ev = E.onTick(a, st, 'BTCUSDT', 48900, 3000);
  assert.equal(ev[0].type, 'sl'); assert.equal(a.positions.length, 0);
  assert.ok(a.history[0].pnl < 0);
});

test('take-profit triggers on a rising price; short TP triggers on a fall', () => {
  const a = mk(); E.placeOrder(a, st, long({ tp: 52000 }), 50000, 1000);
  assert.equal(E.onTick(a, st, 'BTCUSDT', 52100, 2000)[0].type, 'tp');
  const b = mk(); E.placeOrder(b, st, long({ side: 'short', tp: 48000 }), 50000, 1000);
  assert.equal(E.onTick(b, st, 'BTCUSDT', 47900, 2000)[0].type, 'tp');
});

test('trailing stop ratchets up and never down', () => {
  const a = mk(); E.placeOrder(a, st, long({ trail: 2 }), 50000, 1000);
  E.onTick(a, st, 'BTCUSDT', 55000, 2000);                  // stop now 53900
  near(E.trailStop(a.positions[0]), 53900);
  assert.equal(E.onTick(a, st, 'BTCUSDT', 54000, 3000).length, 0);
  near(E.trailStop(a.positions[0]), 53900);
  const ev = E.onTick(a, st, 'BTCUSDT', 53800, 4000);
  assert.equal(ev[0].type, 'trail');
  assert.ok(a.history[0].pnl > 0);
});

test('limit order rests, then fills at the limit price when touched', () => {
  const a = mk();
  const r = E.placeOrder(a, st, long({ type: 'limit', limit: 49000, sl: 48000, tp: 52000 }), 50000, 1000);
  assert.ok(r.pending); assert.equal(a.orders.length, 1);
  assert.ok(E.reserved(a) > 4900);
  near(E.equity(a, { BTCUSDT: 50000 }), 10000);              // reservation is not lost equity
  const ev = E.onTick(a, st, 'BTCUSDT', 48950, 2000);
  assert.equal(ev[0].type, 'filled');
  near(a.positions[0].entry, 49000); assert.equal(a.orders.length, 0);
  assert.equal(a.positions[0].sl, 48000);
});

test('order lifecycle: bracket entry -> take-profit exit -> stats', () => {
  const a = mk();
  const r = E.placeOrder(a, st, long({ type: 'bracket', sl: 49000, tp: 52000 }), 50000, 1000);
  assert.ok(r.ok);
  E.onTick(a, st, 'BTCUSDT', 51000, 2000);
  const ev = E.onTick(a, st, 'BTCUSDT', 52500, 3000);
  assert.equal(ev[0].type, 'tp');
  const s = E.stats(a, [[1, 10000], [2, 10200], [3, 9900]]);
  assert.equal(s.trades, 1); assert.equal(s.wins, 1); near(s.winRate, 100);
  near(s.maxDD, (10200 - 9900) / 10200 * 100);
  assert.equal(a.txs.filter((t) => t.kind === 'open').length, 1);
  assert.equal(a.txs.filter((t) => t.kind === 'close').length, 1);
});

test('validation: insufficient balance, bad qty, wrong-side stops, duplicates, limits', () => {
  const a = mk();
  assert.match(E.placeOrder(a, st, long({ qty: 0 }), 50000).error, /greater than zero/);
  assert.match(E.placeOrder(a, st, long({ qty: 1 }), 50000).error, /Insufficient/);
  assert.match(E.placeOrder(a, st, long({ sl: 51000 }), 50000).error, /below entry/);
  assert.match(E.placeOrder(a, st, long({ tp: 49000 }), 50000).error, /above entry/);
  assert.match(E.placeOrder(a, st, long({ type: 'bracket', sl: 49000 }), 50000).error, /both/);
  assert.match(E.placeOrder(a, st, long({ leverage: 99 }), 50000).error, /Leverage/);
  assert.match(E.placeOrder(a, Object.assign({}, st, { maxPosPct: 10 }), long(), 50000).error, /max position/);
  assert.match(E.placeOrder(a, Object.assign({}, st, { maxRiskPct: 1 }), long({ sl: 40000 }), 50000).error, /exceeds your limit/);
  assert.ok(E.placeOrder(a, st, long({ qty: 0.01 }), 50000, 1000).ok);
  assert.match(E.placeOrder(a, st, long({ qty: 0.01 }), 50000, 1500).error, /Duplicate/);
  assert.ok(E.placeOrder(a, st, long({ qty: 0.01 }), 50000, 4000).ok);
  assert.match(E.placeOrder(a, st, long({ side: 'short', qty: 0.01 }), 50000, 9000).error, /opposite/);
});

test('position sizing: usd, percent, and risk-based', () => {
  near(E.sizeQty({ mode: 'usd', value: 1000, price: 50000, leverage: 1 }), 0.02);
  near(E.sizeQty({ mode: 'usd', value: 1000, price: 50000, leverage: 5 }), 0.1);
  near(E.sizeQty({ mode: 'pct', value: 25, price: 50000, cash: 10000, leverage: 1 }), 0.05);
  // risk 1% of $10k = $100 over a $1000 stop distance -> 0.1 BTC
  near(E.sizeQty({ mode: 'risk', value: 1, price: 50000, sl: 49000, equity: 10000, cash: 10000, leverage: 1 }), 0.1);
  assert.equal(E.sizeQty({ mode: 'risk', value: 1, price: 50000, equity: 10000, cash: 10000 }), 0);
  // capped by free cash
  const q = E.sizeQty({ mode: 'risk', value: 5, price: 50000, sl: 49950, equity: 10000, cash: 10000, leverage: 1 });
  assert.ok(q * 50000 <= 10000);
});

test('leveraged long is liquidated and loses at most its margin', () => {
  const a = mk(); E.placeOrder(a, st, long({ qty: 0.2, leverage: 10 }), 50000, 1000);
  const p = a.positions[0]; const liq = E.liqPrice(p);
  assert.ok(liq < 50000 && liq > 44000);
  const ev = E.onTick(a, st, 'BTCUSDT', liq - 10, 2000);
  assert.equal(ev[0].type, 'liq'); assert.equal(a.positions.length, 0);
  assert.ok(a.cash >= 10000 - 1000 - 10 - 1);               // never loses more than margin + fee
});

test('liquidation warning fires once at 80% of the distance', () => {
  const a = mk(); E.placeOrder(a, st, long({ qty: 0.2, leverage: 10 }), 50000, 1000);
  const liq = E.liqPrice(a.positions[0]);
  const warnAt = 50000 - (50000 - liq) * 0.85;
  assert.equal(E.onTick(a, st, 'BTCUSDT', warnAt, 2000)[0].type, 'liqwarn');
  assert.equal(E.onTick(a, st, 'BTCUSDT', warnAt - 1, 3000).length, 0);
});

test('estimate returns fees, slippage, P&L at TP/SL and R:R', () => {
  const s = Object.assign({}, st, { slippage: 0.001 });
  const e = E.estimate(s, long({ sl: 49000, tp: 53000 }), 50000, 10000);
  near(e.px, 50050); assert.ok(e.fee > 0 && e.slipCost > 0);
  assert.ok(e.profitAtTP > 0 && e.lossAtSL < 0 && e.rr > 2);
  assert.ok(e.riskPct > 0);
});

test('indicators: SMA/EMA/RSI/MACD/BB/ATR/ADX/StochRSI/VWAP sanity', () => {
  const c = Array.from({ length: 120 }, (_, i) => {
    const m = 100 + i * 0.5 + Math.sin(i / 4) * 3;
    return { t: i * 3600000, o: m - 0.3, h: m + 1, l: m - 1, c: m, v: 10 + (i % 7) };
  });
  const cl = c.map((x) => x.c);
  near(I.sma([1, 2, 3, 4, 5], 3)[4], 4);
  assert.equal(I.sma(cl, 20)[18], null); assert.ok(I.sma(cl, 20)[19] != null);
  assert.ok(I.ema(cl, 10)[9] != null);
  const r = I.rsi(cl, 14).filter((x) => x != null);
  assert.ok(r.every((x) => x >= 0 && x <= 100));
  assert.equal(I.rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14)[15], 100); // only gains
  const m = I.macd(cl); assert.ok(m.hist.some((x) => x != null));
  const b = I.bollinger(cl); assert.ok(b.up[50] > b.mid[50] && b.mid[50] > b.lo[50]);
  assert.ok(I.atr(c)[50] > 0);
  const ad = I.adx(c); assert.ok(ad.adx.some((x) => x != null && x >= 0 && x <= 100));
  const sr = I.stochRsi(cl); assert.ok(sr.k.some((x) => x != null));
  assert.ok(I.vwap(c).every((x) => x > 0));
  assert.ok(Array.isArray(I.supportResistance(c)));
});
