const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../www/js/feed.js');

/* Fake WebSocket + manual clock so reconnect behaviour is deterministic. */
function harness(opts = {}) {
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(m) { this.sent.push(m); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
    open() { this.readyState = 1; this.onopen && this.onopen(); }
    msg(o) { this.onmessage({ data: JSON.stringify(o) }); }
  }
  let t = 0; let timers = []; let id = 1;
  const clock = {
    now: () => t,
    setTimeout: (f, ms) => { const h = id++; timers.push({ h, at: t + ms, f, every: null }); return h; },
    clearTimeout: (h) => { timers = timers.filter((x) => x.h !== h); },
    setInterval: (f, ms) => { const h = id++; timers.push({ h, at: t + ms, f, every: ms }); return h; },
    clearInterval: (h) => { timers = timers.filter((x) => x.h !== h); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        t = due.at;
        if (due.every) due.at += due.every; else timers = timers.filter((x) => x.h !== due.h);
        due.f();
      }
      t = end;
    },
  };
  const statuses = []; const msgs = [];
  const sock = new F.MarketSocket(Object.assign({
    WS: FakeWS, hosts: ['wss://a', 'wss://b'], staleMs: 15000, ...clock,
    onStatus: (s) => statuses.push(s), onMessage: (s, d) => msgs.push([s, d]),
  }, opts));
  return { sock, sockets, clock, statuses, msgs };
}

test('connects with initial streams and goes live on first message', () => {
  const h = harness(); h.sock.subscribe(['btcusdt@ticker', 'ethusdt@ticker']); h.sock.connect();
  assert.match(h.sockets[0].url, /^wss:\/\/a\/stream\?streams=btcusdt@ticker\/ethusdt@ticker$/);
  h.sockets[0].open(); h.sockets[0].msg({ stream: 'btcusdt@ticker', data: { c: '1' } });
  assert.equal(h.sock.status, 'live'); assert.equal(h.msgs.length, 1);
});

test('subscribing while connected sends SUBSCRIBE; unsubscribe sends UNSUBSCRIBE', () => {
  const h = harness(); h.sock.connect(); h.sockets[0].open();
  h.sock.subscribe(['solusdt@ticker']); h.sock.unsubscribe(['solusdt@ticker']);
  assert.equal(JSON.parse(h.sockets[0].sent[0]).method, 'SUBSCRIBE');
  assert.equal(JSON.parse(h.sockets[0].sent[1]).method, 'UNSUBSCRIBE');
});

test('drop -> exponential backoff -> reconnect, resubscribing everything', () => {
  const h = harness(); h.sock.subscribe(['btcusdt@ticker']); h.sock.connect();
  h.sockets[0].open(); h.sockets[0].close();
  assert.equal(h.sock.status, 'offline'); assert.equal(h.sockets.length, 1);
  h.clock.advance(999); assert.equal(h.sockets.length, 1);
  h.clock.advance(2); assert.equal(h.sockets.length, 2);       // 1s
  h.sock.subscribe(['xrpusdt@ticker']);                        // added while down
  h.sockets[1].close();                                         // second failure
  assert.equal(h.sock.lastDelay, 2000);
  h.clock.advance(2001); assert.equal(h.sockets.length, 3);
  assert.match(h.sockets[2].url, /^wss:\/\/b\//);              // fell back to the second host
  assert.match(h.sockets[2].url, /btcusdt@ticker\/xrpusdt@ticker/);
  h.sockets[2].open(); h.sockets[2].msg({ stream: 'btcusdt@ticker', data: {} });
  assert.equal(h.sock.status, 'live');
});

test('backoff is capped and resets after a successful connection', () => {
  const h = harness({ maxBackoff: 4000 }); h.sock.connect();
  for (let i = 0; i < 6; i++) { h.sockets[h.sockets.length - 1].close(); h.clock.advance(5000); }
  assert.equal(h.sock.lastDelay, 4000);
  const s = h.sockets[h.sockets.length - 1]; s.open();
  s.close(); assert.equal(h.sock.lastDelay, 1000);
});

test('stale-data detection: silent socket is torn down and reconnected', () => {
  const h = harness(); h.sock.subscribe(['btcusdt@ticker']); h.sock.connect();
  h.sockets[0].open(); h.sockets[0].msg({ stream: 'btcusdt@ticker', data: {} });
  h.clock.advance(14000); assert.equal(h.sock.status, 'live');
  h.clock.advance(7000);
  assert.ok(h.statuses.includes('stale'));
  assert.equal(h.sockets[0].readyState, 3);
  h.clock.advance(1500); assert.equal(h.sockets.length, 2);
});

test('reconnectNow (e.g. browser came back online) skips the backoff', () => {
  const h = harness(); h.sock.connect(); h.sockets[0].close();
  h.sock.reconnectNow(); assert.equal(h.sockets.length, 2);
});

test('close() stops reconnecting', () => {
  const h = harness(); h.sock.connect(); h.sockets[0].open(); h.sock.close();
  h.clock.advance(60000); assert.equal(h.sockets.length, 1); assert.equal(h.sock.status, 'offline');
});

test('REST falls back to the second host and parses klines', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://one')) throw new Error('blocked');
    return { ok: true, json: async () => [[1700000000000, '1', '2', '0.5', '1.5', '10']] };
  };
  const rest = F.createRest({ hosts: ['https://one', 'https://two'], fetch: fetchImpl });
  const k = await rest.get('/api/v3/klines', { symbol: 'BTCUSDT', interval: '1m', limit: 1 });
  assert.equal(calls.length, 2);
  assert.deepEqual(F.parseKline(k[0]), { t: 1700000000000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });
  await rest.get('/x'); assert.ok(calls[calls.length - 1].startsWith('https://two'));  // remembers good host
});

test('mergeCandle updates the live candle and appends new ones', () => {
  const a = [{ t: 1, c: 1 }];
  F.mergeCandle(a, { t: 1, c: 2 }); F.mergeCandle(a, { t: 2, c: 3 });
  assert.deepEqual(a, [{ t: 1, c: 2 }, { t: 2, c: 3 }]);
});
