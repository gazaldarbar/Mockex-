/* Canvas chart: candles/line/area, volume, overlays (SMA/EMA/BB/VWAP/S&R), sub-panes (RSI/MACD/StochRSI/ATR/ADX),
 * drawings (trend line, rectangle, horizontal line, Fibonacci), pan/pinch/crosshair, position lines. */
(function () {
  'use strict';
  const UP = '#2ee6a6', DN = '#ff5c7a';
  const SUBH = 84;
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  class CandleChart {
    constructor(el, opts = {}) {
      this.el = el; this.cv = document.createElement('canvas'); el.appendChild(this.cv); this.ctx = this.cv.getContext('2d');
      this.tip = document.createElement('div'); this.tip.className = 'cross-tip'; el.appendChild(this.tip);
      this.data = []; this.ims = 60000; this.type = 'candle';
      this.ind = { sma: { on: false, p: 20 }, ema: { on: true, p: 50 }, ema2: { on: false, p: 21 }, bb: { on: false }, vwap: { on: false }, sr: { on: false }, subs: [] };
      this.drawings = []; this.tool = null; this.pending = []; this.lines = []; this.cross = null;
      this.bw = 9; this.right = 0; this.follow = true; this.mainH = opts.height || 330; this.onChange = opts.onChange || (() => {});
      this.padR = 60; this.padB = 20; this.pointers = new Map(); this.raf = 0; this.dirty = true;
      this._bind();
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
      this.resize();
    }
    destroy() { this.ro.disconnect(); cancelAnimationFrame(this.raf); this.el.innerHTML = ''; }

    setData(data, ims) {
      this.data = data; this.ims = ims || this.ims; this._ind = null;
      const w = this.W - this.padR; this.right = data.length + 2; this.follow = true;
      this.bw = Math.min(14, Math.max(4, w / Math.min(data.length || 1, 90)));
      this.draw();
    }
    update() { const n = this.data.length; if (this.follow) this.right = n + 2; this._ind = null; this.draw(); }
    set(o) { Object.assign(this, o); this._ind = null; this.resize(); }
    setInd(ind) { this.ind = ind; this._ind = null; this.resize(); }
    height() { return this.mainH + this.ind.subs.length * SUBH + this.padB; }
    resize() {
      const w = this.el.clientWidth || 320, h = this.height(), dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.W = w; this.H = h; this.dpr = dpr; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.cv.style.height = h + 'px';
      this.draw();
    }
    draw() { if (this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this._draw(); }); }

    /* ---- geometry ---- */
    xOf(i) { return this.W - this.padR - (this.right - i) * this.bw - this.bw / 2; }
    iOf(x) { return this.right - (this.W - this.padR - x) / this.bw - 0.5; }
    tOf(i) { return this.data.length ? this.data[0].t + i * this.ims : 0; }
    idxOf(t) { return this.data.length ? (t - this.data[0].t) / this.ims : 0; }

    _compute() {
      if (this._ind) return this._ind;
      const d = this.data, cl = d.map((c) => c.c), I = window.Ind, o = {}; const g = this.ind;
      if (g.sma.on) o.sma = I.sma(cl, g.sma.p);
      if (g.ema.on) o.ema = I.ema(cl, g.ema.p);
      if (g.ema2.on) o.ema2 = I.ema(cl, g.ema2.p);
      if (g.bb.on) o.bb = I.bollinger(cl);
      if (g.vwap.on) o.vwap = I.vwap(d);
      if (g.sr.on) o.sr = I.supportResistance(d);
      g.subs.forEach((s) => {
        if (s === 'rsi') o.rsi = I.rsi(cl); if (s === 'macd') o.macd = I.macd(cl); if (s === 'stoch') o.stoch = I.stochRsi(cl);
        if (s === 'atr') o.atr = I.atr(d); if (s === 'adx') o.adx = I.adx(d);
      });
      this.ind_ = o; this._ind = o; return o;
    }

    _draw() {
      const ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const cs = getComputedStyle(document.documentElement); const muted = cs.getPropertyValue('--faint').trim() || '#889'; const text = cs.getPropertyValue('--text').trim() || '#fff';
      const grid = 'rgba(160,170,210,.12)';
      const d = this.data; const n = d.length; const plotW = W - this.padR;
      if (!n) { ctx.fillStyle = muted; ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Waiting for market data…', W / 2, this.mainH / 2); return; }
      const maxRight = n + 40, minRight = Math.min(n + 2, plotW / this.bw * 0.4); this.right = Math.min(maxRight, Math.max(minRight, this.right));
      const i0 = Math.max(0, Math.floor(this.iOf(0))), i1 = Math.min(n - 1, Math.ceil(this.iOf(plotW)));
      if (i1 < i0) return;
      const ind = this._compute();
      let hi = -Infinity, lo = Infinity;
      for (let i = i0; i <= i1; i++) { if (d[i].h > hi) hi = d[i].h; if (d[i].l < lo) lo = d[i].l; }
      [ind.sma, ind.ema, ind.ema2].forEach((a) => { if (a) for (let i = i0; i <= i1; i++) if (a[i] != null) { hi = Math.max(hi, a[i]); lo = Math.min(lo, a[i]); } });
      if (ind.bb) for (let i = i0; i <= i1; i++) if (ind.bb.up[i] != null) { hi = Math.max(hi, ind.bb.up[i]); lo = Math.min(lo, ind.bb.lo[i]); }
      const padv = (hi - lo || hi * 0.01) * 0.08; hi += padv; lo -= padv * 3.2; // leave room for volume bars at the bottom
      const top = 8, mh = this.mainH - top - 4;
      const yOf = (p) => top + (hi - p) / (hi - lo) * mh;
      const pOf = (y) => hi - (y - top) / mh * (hi - lo);
      this._y = yOf; this._p = pOf;

      // grid + price axis
      ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const steps = 5;
      for (let s = 0; s <= steps; s++) {
        const p = lo + (hi - lo) * (s / steps), y = yOf(p);
        ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
        ctx.fillStyle = muted; ctx.fillText(F.price(p), plotW + 6, y);
      }
      // time axis
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const every = Math.max(1, Math.round(90 / this.bw)); const baseY = this.H - this.padB + 4;
      for (let i = i0 - (i0 % every); i <= i1; i += every) {
        if (i < 0) continue; const x = this.xOf(i); const dt = new Date(d[i].t);
        const lab = this.ims >= 86400e3 ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : (dt.getHours() === 0 && dt.getMinutes() === 0 ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        ctx.fillStyle = muted; ctx.fillText(lab, x, baseY);
        ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.mainH); ctx.stroke();
      }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, plotW, this.H - this.padB); ctx.clip();

      // volume
      let vmax = 0; for (let i = i0; i <= i1; i++) vmax = Math.max(vmax, d[i].v);
      const vh = mh * 0.18; const bw = this.bw;
      for (let i = i0; i <= i1; i++) {
        const c = d[i], x = this.xOf(i), h = vmax ? (c.v / vmax) * vh : 0;
        ctx.fillStyle = c.c >= c.o ? 'rgba(46,230,166,.25)' : 'rgba(255,92,122,.25)'; ctx.fillRect(x - bw * 0.35, top + mh - h, bw * 0.7, h);
      }
      // bollinger fill
      if (ind.bb) {
        ctx.beginPath(); let started = false;
        for (let i = i0; i <= i1; i++) if (ind.bb.up[i] != null) { const x = this.xOf(i), y = yOf(ind.bb.up[i]); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
        for (let i = i1; i >= i0; i--) if (ind.bb.lo[i] != null) ctx.lineTo(this.xOf(i), yOf(ind.bb.lo[i]));
        ctx.closePath(); ctx.fillStyle = 'rgba(139,123,255,.10)'; ctx.fill();
        this._line(ind.bb.up, i0, i1, yOf, 'rgba(139,123,255,.8)', 1); this._line(ind.bb.lo, i0, i1, yOf, 'rgba(139,123,255,.8)', 1); this._line(ind.bb.mid, i0, i1, yOf, 'rgba(139,123,255,.5)', 1);
      }
      // series
      if (this.type === 'candle') {
        for (let i = i0; i <= i1; i++) {
          const c = d[i], x = this.xOf(i), up = c.c >= c.o; ctx.strokeStyle = ctx.fillStyle = up ? UP : DN; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, yOf(c.h)); ctx.lineTo(x, yOf(c.l)); ctx.stroke();
          const y1 = yOf(c.o), y2 = yOf(c.c); const bh = Math.max(1, Math.abs(y2 - y1)); ctx.fillRect(x - bw * 0.36, Math.min(y1, y2), bw * 0.72, bh);
        }
      } else {
        ctx.beginPath(); for (let i = i0; i <= i1; i++) { const x = this.xOf(i), y = yOf(d[i].c); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        const up = d[i1].c >= d[i0].c; const col = up ? UP : DN;
        if (this.type === 'area') {
          ctx.save(); ctx.lineTo(this.xOf(i1), top + mh); ctx.lineTo(this.xOf(i0), top + mh); ctx.closePath();
          const gr = ctx.createLinearGradient(0, top, 0, top + mh); gr.addColorStop(0, up ? 'rgba(46,230,166,.38)' : 'rgba(255,92,122,.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
          ctx.beginPath(); for (let i = i0; i <= i1; i++) { const x = this.xOf(i), y = yOf(d[i].c); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        }
        ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();
      }
      // overlays
      this._line(ind.sma, i0, i1, yOf, '#ffc857', 1.5); this._line(ind.ema, i0, i1, yOf, '#22d3ee', 1.5); this._line(ind.ema2, i0, i1, yOf, '#ff5fd2', 1.5); this._line(ind.vwap, i0, i1, yOf, '#ffffff', 1.3, [4, 3]);
      if (ind.sr) ind.sr.forEach((p) => { if (p > lo && p < hi) { const y = yOf(p); ctx.strokeStyle = 'rgba(255,200,87,.6)'; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,200,87,.9)'; ctx.textAlign = 'left'; ctx.fillText('S/R', 4, y - 6); } });

      // drawings
      this._drawings(ctx, yOf, plotW);
      // position / order lines
      this.lines.forEach((l) => { if (l.p > lo && l.p < hi) { const y = yOf(l.p); ctx.strokeStyle = l.color; ctx.lineWidth = 1.2; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = l.color; ctx.font = 'bold 10.5px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(l.label, 6, y - 2); } });
      ctx.restore();

      // last price tag
      const last = d[n - 1]; const ly = yOf(last.c); const lc = last.c >= last.o ? UP : DN;
      if (ly > 0 && ly < this.mainH) {
        ctx.strokeStyle = lc; ctx.globalAlpha = .6; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW, ly); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = lc; this._round(ctx, plotW + 1, ly - 10, this.padR - 2, 20, 6); ctx.fill(); ctx.fillStyle = '#04120c'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(F.price(last.c), plotW + 5, ly);
      }
      // sub panes
      let y0 = this.mainH; const subs = this.ind.subs;
      subs.forEach((s) => { this._sub(ctx, s, y0, plotW, i0, i1, muted, text, grid); y0 += SUBH; });

      // crosshair
      if (this.cross) {
        const i = Math.max(0, Math.min(n - 1, Math.round(this.iOf(this.cross.x)))); const c = d[i]; const x = this.xOf(i);
        ctx.strokeStyle = 'rgba(200,210,255,.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H - this.padB); ctx.stroke();
        const cy = Math.max(0, Math.min(this.mainH, this.cross.y)); ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(plotW, cy); ctx.stroke(); ctx.setLineDash([]);
        if (cy <= this.mainH) { ctx.fillStyle = 'rgba(30,36,70,.95)'; this._round(ctx, plotW + 1, cy - 10, this.padR - 2, 20, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(F.price(pOf(cy)), plotW + 5, cy); }
        const ch = ((c.c / c.o - 1) * 100);
        this.tip.innerHTML = `<b style="color:var(--text)">${new Date(c.t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</b> &nbsp;O ${F.price(c.o)} H ${F.price(c.h)} L ${F.price(c.l)} C <b class="${ch >= 0 ? 'up' : 'down'}">${F.price(c.c)} (${F.pct(ch)})</b> V ${F.compact(c.v)}`;
      } else this.tip.innerHTML = this.tool ? `<b style="color:var(--accent2)">${this._toolHint()}</b>` : '';
      // legend
      let lx = 10, ly2 = this.mainH - 8; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      [['sma', 'SMA' + this.ind.sma.p, '#ffc857'], ['ema', 'EMA' + this.ind.ema.p, '#22d3ee'], ['ema2', 'EMA' + this.ind.ema2.p, '#ff5fd2'], ['bb', 'BB', '#8b7bff'], ['vwap', 'VWAP', '#fff']].forEach(([k, lab, col]) => { if (ind[k]) { ctx.fillStyle = col; ctx.fillText('● ' + lab, lx, ly2); lx += ctx.measureText('● ' + lab).width + 10; } });
    }
    _toolHint() { const t = this.tool, k = this.pending.length; return t === 'hline' ? 'Tap to place a horizontal line' : (k === 0 ? 'Tap the first point' : 'Tap the second point'); }
    _round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    _line(a, i0, i1, yOf, col, w, dash) {
      if (!a) return; const ctx = this.ctx; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); let s = false;
      for (let i = i0; i <= i1; i++) { if (a[i] == null) { s = false; continue; } const x = this.xOf(i), y = yOf(a[i]); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); s = true; }
      ctx.stroke(); ctx.setLineDash([]);
    }
    _drawings(ctx, yOf, plotW) {
      const all = this.drawings.concat(this.pending.length && this.tool ? [{ k: this.tool, pts: this.pending, tmp: true }] : []);
      all.forEach((dr) => {
        const pts = dr.pts.map((p) => ({ x: this.xOf(this.idxOf(p.t)), y: yOf(p.p), p: p.p }));
        ctx.strokeStyle = dr.tmp ? '#fff' : '#8b7bff'; ctx.fillStyle = 'rgba(139,123,255,.14)'; ctx.lineWidth = 1.6;
        if (dr.k === 'hline' && pts[0]) { ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(plotW, pts[0].y); ctx.stroke(); ctx.fillStyle = '#8b7bff'; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left'; ctx.fillText(F.price(pts[0].p), 6, pts[0].y - 5); }
        if (dr.k === 'trend' && pts.length) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); if (pts[1]) { const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y; const ext = dx !== 0 ? (plotW - pts[0].x) / dx : 0; ctx.lineTo(pts[0].x + dx * Math.max(1, ext), pts[0].y + dy * Math.max(1, ext)); } ctx.stroke(); pts.forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); }); }
        if (dr.k === 'rect' && pts.length === 2) { const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y), w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y); ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
        if (dr.k === 'fib' && pts.length === 2) {
          const a = pts[0].p, b = pts[1].p; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left';
          FIB.forEach((f) => { const p = b + (a - b) * f, y = yOf(p); ctx.strokeStyle = f === 0.618 ? '#ffc857' : 'rgba(139,123,255,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.min(pts[0].x, pts[1].x), y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.fillStyle = '#d8dcff'; ctx.fillText((f * 100).toFixed(1) + '%  ' + F.price(p), Math.min(pts[0].x, pts[1].x) + 4, y - 4); });
          ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); ctx.setLineDash([]);
        }
      });
    }
    _sub(ctx, kind, y0, plotW, i0, i1, muted, text, grid) {
      const ind = this._ind, h = SUBH - 8, top = y0 + 6, d = this.data;
      ctx.strokeStyle = 'rgba(160,170,210,.2)'; ctx.beginPath(); ctx.moveTo(0, y0 + 2); ctx.lineTo(this.W, y0 + 2); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0 + 3, plotW, SUBH - 3); ctx.clip();
      const draw = (arr, col, lo, hi, w = 1.4) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); let s = false; for (let i = i0; i <= i1; i++) { if (arr[i] == null) { s = false; continue; } const x = this.xOf(i), y = top + (hi - arr[i]) / (hi - lo) * h; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); s = true; } ctx.stroke(); };
      const band = (v, lo, hi, col) => { const y = top + (hi - v) / (hi - lo) * h; ctx.strokeStyle = col; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.setLineDash([]); };
      let label = '', val = '';
      const lastOf = (a) => { for (let i = Math.min(i1, a.length - 1); i >= 0; i--) if (a[i] != null) return a[i]; return null; };
      if (kind === 'rsi') { band(70, 0, 100, 'rgba(255,92,122,.5)'); band(30, 0, 100, 'rgba(46,230,166,.5)'); draw(ind.rsi, '#8b7bff', 0, 100, 1.6); label = 'RSI 14'; val = (lastOf(ind.rsi) || 0).toFixed(1); }
      if (kind === 'stoch') { band(80, 0, 100, 'rgba(255,92,122,.5)'); band(20, 0, 100, 'rgba(46,230,166,.5)'); draw(ind.stoch.k, '#22d3ee', 0, 100); draw(ind.stoch.d, '#ff5fd2', 0, 100); label = 'StochRSI'; val = (lastOf(ind.stoch.k) || 0).toFixed(1); }
      if (kind === 'macd') {
        let m = 1e-12; for (let i = i0; i <= i1; i++) ['line', 'signal', 'hist'].forEach((k) => { const v = ind.macd[k][i]; if (v != null) m = Math.max(m, Math.abs(v)); });
        const lo = -m * 1.1, hi = m * 1.1; band(0, lo, hi, 'rgba(160,170,210,.4)');
        for (let i = i0; i <= i1; i++) { const v = ind.macd.hist[i]; if (v == null) continue; const x = this.xOf(i), y = top + (hi - v) / (hi - lo) * h, y0b = top + hi / (hi - lo) * h; ctx.fillStyle = v >= 0 ? 'rgba(46,230,166,.55)' : 'rgba(255,92,122,.55)'; ctx.fillRect(x - this.bw * 0.3, Math.min(y, y0b), this.bw * 0.6, Math.abs(y - y0b)); }
        draw(ind.macd.line, '#22d3ee', lo, hi); draw(ind.macd.signal, '#ffc857', lo, hi); label = 'MACD'; val = (lastOf(ind.macd.hist) || 0).toPrecision(3);
      }
      if (kind === 'atr') { let m = 0, l = 1e18; for (let i = i0; i <= i1; i++) if (ind.atr[i] != null) { m = Math.max(m, ind.atr[i]); l = Math.min(l, ind.atr[i]); } const pad = (m - l || m) * 0.1; draw(ind.atr, '#ffc857', l - pad, m + pad, 1.6); label = 'ATR 14'; val = F.price(lastOf(ind.atr)); }
      if (kind === 'adx') { band(25, 0, 60, 'rgba(160,170,210,.5)'); draw(ind.adx.adx, '#ffffff', 0, 60, 1.8); draw(ind.adx.pdi, UP, 0, 60, 1); draw(ind.adx.mdi, DN, 0, 60, 1); label = 'ADX 14'; val = (lastOf(ind.adx.adx) || 0).toFixed(1); }
      ctx.restore();
      ctx.fillStyle = muted; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, 8, y0 + 16); ctx.fillStyle = text; ctx.textAlign = 'left'; ctx.fillText(val, plotW + 6, y0 + 16);
    }

    /* ---- interaction ---- */
    _bind() {
      const el = this.el; let moved = 0, startX = 0, startY = 0, lastX = 0, pinch = 0;
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId); const r = el.getBoundingClientRect(); this.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
        moved = 0; startX = lastX = e.clientX - r.left; startY = e.clientY - r.top;
        if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      });
      el.addEventListener('pointermove', (e) => {
        if (!this.pointers.has(e.pointerId)) return; const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; this.pointers.set(e.pointerId, { x, y });
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) { const f = dist / pinch; this._zoom(f, (a.x + b.x) / 2); } pinch = dist; moved = 99; return;
        }
        moved += Math.abs(x - lastX); const dx = x - lastX; lastX = x;
        if (moved > 6 && !(this.tool && this.cross)) { this.right -= dx / this.bw; this.follow = this.right >= this.data.length + 1.5; if (this.cross) this.cross = null; this.draw(); }
      });
      const up = (e) => {
        if (!this.pointers.has(e.pointerId)) return; const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; this.pointers.delete(e.pointerId);
        if (moved <= 6 && this.pointers.size === 0) this._tap(x, y);
        if (this.pointers.size < 2) pinch = 0;
      };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); this._zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left); }, { passive: false });
    }
    _zoom(f, cx) {
      const before = this.iOf(cx); this.bw = Math.min(40, Math.max(2.5, this.bw * f)); const after = this.iOf(cx); this.right += before - after;
      this.follow = this.right >= this.data.length + 1.5; this.draw();
    }
    _tap(x, y) {
      if (y > this.mainH + 0 && !this.tool) { this.cross = { x, y }; this.draw(); return; }
      if (this.tool && this._p) {
        const idx = this.iOf(x), pr = this._p(Math.min(y, this.mainH)); this.pending.push({ t: this.tOf(idx), p: pr });
        const need = this.tool === 'hline' ? 1 : 2;
        if (this.pending.length >= need) { this.drawings.push({ k: this.tool, pts: this.pending.slice(0, need) }); this.pending = []; this.onChange('drawings'); }
        this.draw(); return;
      }
      this.cross = this.cross ? null : { x, y }; this.draw();
    }
    undo() { if (this.pending.length) this.pending = []; else this.drawings.pop(); this.onChange('drawings'); this.draw(); }
    clearDrawings() { this.drawings = []; this.pending = []; this.onChange('drawings'); this.draw(); }
    setTool(t) { this.tool = this.tool === t ? null : t; this.pending = []; this.cross = null; this.draw(); return this.tool; }
  }
  window.CandleChart = CandleChart;

  /* ---------- small chart helpers (sparkline, line/area, donut) ---------- */
  window.Draw = {
    spark(canvas, vals, up) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth || 64, h = canvas.clientHeight || 28; canvas.width = w * dpr; canvas.height = h * dpr;
      const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); if (!vals || vals.length < 2) return;
      const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1; const col = up ? UP : DN;
      c.beginPath(); vals.forEach((v, i) => { const x = (i / (vals.length - 1)) * w, y = h - 3 - ((v - mn) / r) * (h - 6); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.strokeStyle = col; c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke(); c.lineTo(w, h); c.lineTo(0, h); c.closePath();
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, up ? 'rgba(46,230,166,.3)' : 'rgba(255,92,122,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fill();
    },
    curve(canvas, pts, base) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr;
      const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      if (!pts || pts.length < 2) { c.fillStyle = 'rgba(200,205,240,.5)'; c.font = '13px system-ui'; c.textAlign = 'center'; c.fillText('Your equity curve appears as you trade', w / 2, h / 2); return; }
      const vs = pts.map((p) => p[1]); let mn = Math.min(...vs, base), mx = Math.max(...vs, base); const pad = (mx - mn || 1) * 0.15; mn -= pad; mx += pad;
      const X = (i) => 8 + (i / (pts.length - 1)) * (w - 16), Y = (v) => 10 + (mx - v) / (mx - mn) * (h - 20); const up = vs[vs.length - 1] >= base; const col = up ? UP : DN;
      c.setLineDash([4, 5]); c.strokeStyle = 'rgba(200,205,240,.3)'; c.beginPath(); c.moveTo(0, Y(base)); c.lineTo(w, Y(base)); c.stroke(); c.setLineDash([]);
      let prog = 0; const t0 = performance.now(); const dur = 900;
      const paint = (k) => {
        c.clearRect(0, 0, w, h); c.setLineDash([4, 5]); c.strokeStyle = 'rgba(200,205,240,.3)'; c.beginPath(); c.moveTo(0, Y(base)); c.lineTo(w, Y(base)); c.stroke(); c.setLineDash([]);
        const n = Math.max(2, Math.floor(pts.length * k)); c.beginPath(); for (let i = 0; i < n; i++) i ? c.lineTo(X(i), Y(vs[i])) : c.moveTo(X(i), Y(vs[i]));
        c.strokeStyle = col; c.lineWidth = 2.6; c.lineJoin = 'round'; c.shadowColor = col; c.shadowBlur = 12; c.stroke(); c.shadowBlur = 0;
        c.lineTo(X(n - 1), h); c.lineTo(X(0), h); c.closePath(); const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, up ? 'rgba(46,230,166,.32)' : 'rgba(255,92,122,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fill();
        c.beginPath(); c.arc(X(n - 1), Y(vs[n - 1]), 4.5, 0, 7); c.fillStyle = '#fff'; c.fill();
      };
      const step = (now) => { prog = Math.min(1, (now - t0) / dur); paint(1 - Math.pow(1 - prog, 3)); if (prog < 1 && canvas.isConnected) requestAnimationFrame(step); };
      if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) paint(1); else requestAnimationFrame(step);
    },
    donut(canvas, parts) {
      const s = canvas.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = s * dpr; canvas.height = s * dpr; const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tot = parts.reduce((a, p) => a + p.v, 0) || 1; const R = s / 2 - 8, r = R * 0.64; let a0 = -Math.PI / 2; const t0 = performance.now();
      const paint = (k) => {
        c.clearRect(0, 0, s, s); let a = a0;
        parts.forEach((p) => { const sw = (p.v / tot) * Math.PI * 2 * k; c.beginPath(); c.arc(s / 2, s / 2, (R + r) / 2, a + 0.02, a + Math.max(0.03, sw) - 0.02); c.strokeStyle = p.c; c.lineWidth = R - r; c.lineCap = 'round'; c.stroke(); a += sw; });
      };
      const step = (now) => { const k = Math.min(1, (now - t0) / 800); paint(1 - Math.pow(1 - k, 3)); if (k < 1 && canvas.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    },
  };
})();
