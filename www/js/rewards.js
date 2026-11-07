/* Achievements, streaks, daily challenges, insights, leaderboard. All derived from the account state. */
(function () {
  'use strict';
  const today = () => F.dayKey();
  const isToday = (t) => F.dayKey(t) === today();

  function tradingDays() {
    const a = Store.s.acct, set = new Set();
    a.txs.forEach((t) => set.add(F.dayKey(t.t)));
    return set;
  }
  function streak() {
    const set = tradingDays(); let n = 0; const d = new Date();
    if (!set.has(F.dayKey(d))) d.setDate(d.getDate() - 1);   // today may not have a trade yet
    while (set.has(F.dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function dayPnl() {
    const m = {}; Store.s.acct.history.forEach((t) => { const k = F.dayKey(t.closedAt); m[k] = (m[k] || 0) + t.pnl; }); return m;
  }
  function ret() { const a = Store.s.acct; return ((Engine.equity(a, pricesMap()) - a.start) / a.start) * 100; }
  function pricesMap() { const o = {}; Object.keys(Market.prices).forEach((k) => (o[k] = Market.prices[k].price)); return o; }

  const ACH = [
    { id: 'first', ic: '🚀', t: 'First Trade', d: 'Place your first paper trade', f: (a) => a.txs.some((t) => t.kind === 'open') },
    { id: 'win', ic: '🏆', t: 'In the Green', d: 'Close a trade in profit', f: (a) => a.history.some((t) => t.pnl > 0) },
    { id: 'pday', ic: '☀️', t: 'Profitable Day', d: 'End a day with positive realised PnL', f: () => Object.values(dayPnl()).some((v) => v > 0) },
    { id: 'streak5', ic: '🔥', t: '5-Day Streak', d: 'Trade 5 days in a row', f: () => streak() >= 5 },
    { id: 'risk', ic: '🛡️', t: 'Risk-Controlled', d: '5 trades closed that had a stop-loss', f: (a) => a.history.filter((t) => t.hadSL).length >= 5 },
    { id: 'diverse', ic: '🌈', t: 'Diversified', d: 'Hold 3+ different assets at once', f: (a) => new Set(a.positions.map((p) => p.symbol)).size >= 3 },
    { id: 'ten', ic: '🔟', t: 'Getting Reps', d: 'Complete 10 trades', f: (a) => a.history.length >= 10 },
    { id: 'tp', ic: '🎯', t: 'Sniper', d: 'Close a trade at its take-profit', f: (a) => a.history.some((t) => t.reason === 'tp') },
    { id: 'plus10', ic: '📈', t: '+10% Club', d: 'Reach +10% total return', f: () => ret() >= 10 },
    { id: 'short', ic: '🐻', t: 'Bear Hunter', d: 'Close a profitable short', f: (a) => a.history.some((t) => t.side === 'short' && t.pnl > 0) },
    { id: 'journal', ic: '📓', t: 'Reflective', d: 'Write 3 journal entries', f: () => Store.s.journal.length >= 3 },
    { id: 'metals', ic: '🥇', t: 'Metal Head', d: 'Trade gold or silver', f: (a) => a.txs.some((t) => t.symbol === 'XAU' || t.symbol === 'XAG') },
  ];
  function checkAchievements() {
    const st = Store.s, a = st.acct, fresh = [];
    ACH.forEach((x) => { if (!st.achv[x.id] && x.f(a)) { st.achv[x.id] = Date.now(); fresh.push(x); } });
    if (fresh.length) Store.save();
    return fresh;
  }

  /* ---------- daily challenges ---------- */
  const POOL = [
    { id: 'sl3', t: 'Make 3 trades using stop-losses', goal: 3, cur: (a) => a.positions.filter((p) => isToday(p.openedAt) && (p.sl || p.trail)).length + a.history.filter((h) => isToday(h.openedAt) && h.hadSL && !h.partial).length },
    { id: 'win1', t: 'Close a trade in profit', goal: 1, cur: (a) => a.history.filter((h) => isToday(h.closedAt) && h.pnl > 0).length },
    { id: 'div2', t: 'Trade 2 different assets', goal: 2, cur: (a) => new Set(a.txs.filter((t) => isToday(t.t) && t.kind === 'open').map((t) => t.symbol)).size },
    { id: 'tp1', t: 'Open a trade with a take-profit', goal: 1, cur: (a) => a.positions.filter((p) => isToday(p.openedAt) && p.tp).length + a.history.filter((h) => isToday(h.openedAt) && h.hadTP && !h.partial).length },
    { id: 'dd5', t: 'Keep max drawdown under 5% today', goal: 2, note: 'Make 2 trades and stay under 5%', cur: (a) => (ddToday() < 5 ? Math.min(2, a.txs.filter((t) => isToday(t.t) && t.kind === 'open').length) : 0), failed: () => ddToday() >= 5 },
    { id: 'journ', t: 'Journal a trade', goal: 1, cur: () => Store.s.journal.filter((j) => isToday(j.t)).length },
  ];
  function ddToday() { const s = Store.s.equity.filter((p) => isToday(p[0])); return s.length > 1 ? Engine.maxDrawdown(s) : 0; }
  function challenges() {
    const st = Store.s; const k = today();
    if (st.challenges.day !== k) {
      let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const ids = []; const pool = POOL.map((p) => p.id);
      while (ids.length < 3) { const i = h % pool.length; ids.push(pool.splice(i, 1)[0]); h = (h * 1103515245 + 12345) >>> 0; }
      st.challenges = { day: k, list: ids, done: {} }; Store.save();
    }
    return st.challenges.list.map((id) => {
      const p = POOL.find((x) => x.id === id); const cur = Math.min(p.goal, p.cur(st.acct)); const failed = p.failed ? p.failed() : false;
      return { id, title: p.t, note: p.note, cur, goal: p.goal, done: cur >= p.goal && !failed, failed };
    });
  }

  /* ---------- insights ---------- */
  function insights() {
    const a = Store.s.acct, h = a.history, out = [];
    const st = Engine.stats(a, Store.s.equity);
    if (h.length < 3) return [{ ic: '🧭', t: 'Place a few trades and I will start spotting patterns in how you trade.' }];
    if (st.avgWin && st.avgLoss) out.push(st.avgWin > st.avgLoss ? { ic: '💪', t: `Your average winner (${F.money(st.avgWin)}) is larger than your average loser (${F.money(st.avgLoss)}). That is the shape of a durable edge.` } : { ic: '⚖️', t: `Your average loser (${F.money(st.avgLoss)}) is bigger than your average winner (${F.money(st.avgWin)}). Try tighter risk or letting winners run to a take-profit.` });
    const cnt = {}; h.forEach((t) => (cnt[t.symbol] = (cnt[t.symbol] || 0) + 1));
    const top = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]; if (top && top[1] >= 3 && top[1] / h.length > 0.4) out.push({ ic: '🔁', t: `You frequently trade ${F.base(top[0])} (${Math.round(top[1] / h.length * 100)}% of trades). Make sure that is conviction, not habit.` });
    const sl = h.filter((t) => t.reason === 'sl'); const losses = h.filter((t) => t.pnl <= 0);
    if (sl.length >= 3 && losses.length && sl.length / losses.length > 0.6 && sl.reduce((s, t) => s + Math.abs(t.retPct), 0) / sl.length < 1) out.push({ ic: '✂️', t: 'Your stop-losses are too tight: most losses are stop-outs under 1% from entry. Give the trade room, or size down and widen the stop.' });
    const noSL = h.filter((t) => !t.hadSL).length; if (noSL / h.length > 0.5) out.push({ ic: '🛡️', t: `${Math.round(noSL / h.length * 100)}% of your trades had no stop-loss. Adding one is the single biggest risk upgrade.` });
    const lev = h.filter((t) => t.leverage > 5).length; if (lev / h.length > 0.3) out.push({ ic: '⚡', t: 'You use high leverage on many trades. Smaller size with the same stop usually gives smoother equity.' });
    const perDay = {}; h.forEach((t) => { const k = F.dayKey(t.closedAt); perDay[k] = (perDay[k] || 0) + 1; }); if (Math.max(...Object.values(perDay)) >= 10) out.push({ ic: '🌀', t: 'On some days you took 10+ trades. Overtrading usually costs more in fees than it earns.' });
    if (st.profitFactor !== Infinity && st.profitFactor < 1 && h.length >= 5) out.push({ ic: '📉', t: `Profit factor is ${st.profitFactor.toFixed(2)}. Review your last losers in the journal and look for a repeated mistake.` });
    if (st.winRate >= 55) out.push({ ic: '🎯', t: `Win rate ${st.winRate.toFixed(0)}%. Consistency is showing.` });
    return out.slice(0, 5);
  }

  /* ---------- leaderboard (sample data until a backend is connected) ---------- */
  function leaderboard() {
    const wk = Math.floor(Date.now() / (7 * 86400e3)); let h = wk;
    const r = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
    const names = ['NovaTrader', 'Satoshi_Jr', 'AlphaFox', 'OrbitDesk', 'KiteRunner', 'LumenFX', 'PaperHands', 'DeltaDawn', 'GridMonk'];
    const rows = names.map((n) => ({ n, v: (r() - 0.35) * 28, sample: true }));
    const me = Store.s.settings; const mine = ret();
    rows.push({ n: me.leaderboard ? (me.nickname || 'You') : 'You (private)', v: mine, me: true, hidden: !me.leaderboard });
    return rows.sort((a, b) => b.v - a.v).map((x, i) => Object.assign(x, { rank: i + 1 }));
  }

  window.Rewards = { ACH, checkAchievements, challenges, insights, leaderboard, streak, ret, pricesMap, tradingDays };
})();
