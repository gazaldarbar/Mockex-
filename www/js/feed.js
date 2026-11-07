/* Market-data layer: a resilient Binance WebSocket client and a REST client with host
 * fallback. Only PUBLIC market-data endpoints are used, no API keys anywhere.
 * Timers, clock and socket class are injectable so reconnect logic is unit-testable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Feed = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WS_HOSTS = ['wss://stream.binance.com:9443', 'wss://data-stream.binance.vision'];
  const REST_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

  /* ---------------- WebSocket manager ---------------- */
  class MarketSocket {
    constructor(opts = {}) {
      this.hosts = opts.hosts || WS_HOSTS;
      this.WS = opts.WS || (typeof WebSocket !== 'undefined' ? WebSocket : null);
      this.setT = opts.setTimeout || ((f, ms) => setTimeout(f, ms));
      this.clearT = opts.clearTimeout || ((h) => clearTimeout(h));
      this.setI = opts.setInterval || ((f, ms) => setInterval(f, ms));
      this.clearI = opts.clearInterval || ((h) => clearInterval(h));
      this.now = opts.now || (() => Date.now());
      this.staleMs = opts.staleMs || 15000;
      this.maxBackoff = opts.maxBackoff || 30000;
      this.onMessage = opts.onMessage || (() => {});
      this.onStatus = opts.onStatus || (() => {});
      this.streams = new Set();
      this.status = 'offline';
      this.attempt = 0;
      this.hostIdx = 0;
      this.lastMsg = null;
      this.ws = null;
      this.closedByUser = false;
      this.reqId = 1;
      this.reconnects = 0;
    }

    _set(s) { if (s !== this.status) { this.status = s; this.onStatus(s); } }

    connect() {
      this.closedByUser = false;
      if (!this.WS) return;
      this._open();
      if (!this.watchdog) this.watchdog = this.setI(() => this._check(), Math.min(5000, this.staleMs / 3));
    }

    _url() {
      const list = Array.from(this.streams);
      return `${this.hosts[this.hostIdx % this.hosts.length]}/stream?streams=${list.join('/')}`;
    }

    _open() {
      if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) { /* ignore */ } }
      this._set('connecting');
      let ws;
      try { ws = new this.WS(this._url()); } catch (e) { this._scheduleReconnect(); return; }
      this.ws = ws;
      ws.onopen = () => { this.attempt = 0; this.lastMsg = this.now(); };
      ws.onmessage = (ev) => {
        this.lastMsg = this.now();
        if (this.status !== 'live') this._set('live');
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m && m.stream && m.data) this.onMessage(m.stream, m.data);
      };
      ws.onerror = () => { /* onclose follows */ };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; if (!this.closedByUser) this._scheduleReconnect(); } };
    }

    _scheduleReconnect(status = 'offline') {
      if (this.closedByUser) return;
      this._set(status);
      if (this.retryTimer) return;
      const delay = Math.min(this.maxBackoff, 1000 * 2 ** this.attempt);
      this.attempt++;
      if (this.attempt > 1) this.hostIdx++; // try the fallback host after a repeat failure
      this.retryTimer = this.setT(() => { this.retryTimer = null; this.reconnects++; this._open(); }, delay);
      this.lastDelay = delay;
    }

    _check() {
      if (this.closedByUser || !this.ws) return;
      if (this.lastMsg != null && this.now() - this.lastMsg > this.staleMs) {
        // the socket looks alive but is silent: force a clean reconnect
        try { this.ws.onclose = null; this.ws.close(); } catch (e) { /* ignore */ }
        this.ws = null;
        this._scheduleReconnect('stale');
      }
    }

    reconnectNow() {
      if (this.retryTimer) { this.clearT(this.retryTimer); this.retryTimer = null; }
      this.attempt = 0;
      this._open();
    }

    _send(method, streams) {
      if (this.ws && this.ws.readyState === 1 && streams.length) {
        try { this.ws.send(JSON.stringify({ method, params: streams, id: this.reqId++ })); } catch (e) { /* ignore */ }
      }
    }

    subscribe(streams) {
      const fresh = streams.filter((s) => !this.streams.has(s));
      fresh.forEach((s) => this.streams.add(s));
      this._send('SUBSCRIBE', fresh);
    }

    unsubscribe(streams) {
      const had = streams.filter((s) => this.streams.has(s));
      had.forEach((s) => this.streams.delete(s));
      this._send('UNSUBSCRIBE', had);
    }

    close() {
      this.closedByUser = true;
      if (this.retryTimer) this.clearT(this.retryTimer);
      if (this.watchdog) this.clearI(this.watchdog);
      this.retryTimer = null; this.watchdog = null;
      if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } }
      this.ws = null;
      this._set('offline');
    }
  }

  /* ---------------- REST ---------------- */
  function createRest(opts = {}) {
    const hosts = opts.hosts || REST_HOSTS;
    const f = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const timeout = opts.timeout || 8000;
    let good = 0;
    async function get(path, params) {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      let lastErr;
      for (let k = 0; k < hosts.length; k++) {
        const i = (good + k) % hosts.length;
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
        try {
          const r = await f(hosts[i] + path + qs, ctl ? { signal: ctl.signal } : undefined);
          if (timer) clearTimeout(timer);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          good = i;
          return await r.json();
        } catch (e) { if (timer) clearTimeout(timer); lastErr = e; }
      }
      throw lastErr || new Error('Network error');
    }
    return { get, hosts };
  }

  const parseKline = (k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
  const parseWsKline = (k) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, closed: !!k.x });

  /* Merge a streamed candle into an ascending candle array (in place). */
  function mergeCandle(arr, c) {
    const last = arr[arr.length - 1];
    if (last && last.t === c.t) arr[arr.length - 1] = c;
    else if (!last || c.t > last.t) arr.push(c);
    return arr;
  }

  return { MarketSocket, createRest, parseKline, parseWsKline, mergeCandle, WS_HOSTS, REST_HOSTS };
});
