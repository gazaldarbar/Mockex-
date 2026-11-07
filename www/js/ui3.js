/* UI part 3: Alerts, Journal, Rewards, Profile/Settings, Onboarding. */
(function () {
  'use strict';
  const { $, $$, acts } = App; const S = () => Store.s; const esc = F.esc; const coin = UI.coin; const num = F.num;

  /* ---------- ALERTS ---------- */
  const AL = { tab: 'center' };
  const ATYPES = [
    ['above', 'Price rises above', 'price'], ['below', 'Price falls below', 'price'], ['pct', '% move from now', 'pct'], ['newhigh', 'New 24h high', ''], ['newlow', 'New 24h low', ''],
    ['rsi_ob', 'RSI overbought (≥70)', 'ind'], ['rsi_os', 'RSI oversold (≤30)', 'ind'], ['ema_cross', 'EMA 9/21 crossover', 'ind'], ['macd_cross', 'MACD signal crossover', 'ind'], ['vol_spike', 'Volume spike (2.5× avg)', 'ind'],
  ];
  const alabel = (a) => ({ above: `Price ≥ ${F.price(a.value)}`, below: `Price ≤ ${F.price(a.value)}`, pct: `±${a.value}% move`, newhigh: 'New 24h high', newlow: 'New 24h low', rsi_ob: `RSI overbought · ${a.iv}`, rsi_os: `RSI oversold · ${a.iv}`, ema_cross: `EMA 9/21 cross · ${a.iv}`, macd_cross: `MACD cross · ${a.iv}`, vol_spike: `Volume spike · ${a.iv}` })[a.type];
  UI.screens.alerts = {
    html() {
      const st = S(); const tabs = [['center', `Center${App.unread() ? ' (' + App.unread() + ')' : ''}`], ['rules', `Rules (${st.alerts.filter((a) => a.on).length})`], ['settings', 'Settings']];
      let body = '';
      if (AL.tab === 'center') {
        body = st.notifs.length ? `<div class="row" style="padding:0 20px 10px"><span class="sp muted">${App.unread()} unread</span><button class="link" data-act="al-readall">Mark all read</button><button class="link" style="color:var(--down);margin-left:14px" data-act="al-clear">Clear</button></div>` + st.notifs.slice(0, 60).map((n) => `<div class="card glass tight" style="${n.read ? 'opacity:.7' : ''}"><div class="row" style="align-items:flex-start"><span class="dot ${n.read ? '' : 'live'}" style="margin-top:6px;flex:none"></span><div class="col sp" style="gap:2px"><b>${esc(n.title)}</b><span class="sub muted">${esc(n.body || '')}</span><span class="sub faint">${F.ago(n.t)}</span></div></div>
          <div class="row" style="margin-top:10px;flex-wrap:wrap">${n.sym ? `<button class="btn sm" data-act="open-asset" data-sym="${n.sym}">Open ${esc(F.base(n.sym))}</button>` : ''}${n.alertId ? `<button class="btn sm" data-act="al-snooze-n" data-id="${n.alertId}">Snooze 1h</button>` : ''}${n.read ? '' : `<button class="btn sm" data-act="al-read" data-id="${n.id}">Mark read</button>`}<button class="btn sm" data-act="al-del-n" data-id="${n.id}">Delete</button></div></div>`).join('')
          : '<div class="card glass empty"><div class="em">🔔</div>No notifications yet.<br>Stop-loss and take-profit hits, price alerts and achievements land here.</div>';
      } else if (AL.tab === 'rules') {
        body = `<div style="padding:0 16px 12px"><button class="btn primary block" data-act="al-new">＋ New alert</button></div>` + (st.alerts.length ? st.alerts.map((a) => { const snz = a.snoozeUntil > Date.now(); return `<div class="card glass tight"><div class="row">${coin(a.symbol, 38)}<div class="col sp" style="gap:2px"><b>${esc(F.base(a.symbol))}</b><span class="sub muted">${esc(alabel(a))}${a.repeat ? ' · repeating' : ''}${snz ? ' · snoozed' : ''}</span></div><button class="chip ${a.on ? 'on' : ''}" data-act="al-toggle" data-id="${a.id}">${a.on ? 'On' : 'Off'}</button></div>
          <div class="row" style="margin-top:10px"><button class="btn sm sp" data-act="al-snooze" data-id="${a.id}">${snz ? 'Unsnooze' : 'Snooze 1h'}</button><button class="btn sm sp" data-act="al-del" data-id="${a.id}">Delete</button></div></div>`; }).join('') : '<div class="card glass empty"><div class="em">🎯</div>No alerts yet. Create a price or indicator alert.</div>');
      } else {
        const perm = 'Notification' in window ? Notification.permission : 'unsupported';
        body = `<div class="card glass"><div class="row between" style="min-height:48px"><div><b>Local notifications</b><div class="sub muted">Alert when stop-loss, take-profit or alerts trigger</div></div><button class="chip ${S().settings.notify ? 'on' : ''}" data-act="set-notify">${S().settings.notify ? 'On' : 'Off'}</button></div>
          <div class="kv"><span>System permission</span><span>${perm}</span></div><div class="row" style="margin-top:10px"><button class="btn sm sp" data-act="al-perm">Enable system notifications</button><button class="btn sm sp" data-act="al-test">Send test</button></div>
          <p class="sub muted" style="margin:12px 0 0">Alerts are checked while the app is open or running in the background. Optional push delivery needs a backend (see README).</p></div>`;
      }
      return `<div class="chips" style="padding-top:6px">${tabs.map(([k, l]) => `<button class="chip ${AL.tab === k ? 'on' : ''}" data-act="al-tab" data-k="${k}">${l}</button>`).join('')}</div>${body}`;
    },
  };
  acts['al-tab'] = (b) => { AL.tab = b.dataset.k; UI.render(true); };
  acts['al-readall'] = () => { S().notifs.forEach((n) => (n.read = true)); Store.save(); UI.render(true); UI.badge(); };
  acts['al-clear'] = async () => { if (await App.confirm('Clear all notifications?', 'This removes the whole alert history.', 'Clear', true)) { S().notifs = []; Store.save(); UI.render(true); UI.badge(); } };
  acts['al-read'] = (b) => { const n = S().notifs.find((x) => x.id === b.dataset.id); if (n) n.read = true; Store.save(); UI.render(true); UI.badge(); };
  acts['al-del-n'] = (b) => { S().notifs = S().notifs.filter((x) => x.id !== b.dataset.id); Store.save(); UI.render(true); UI.badge(); };
  acts['al-snooze-n'] = (b) => { const a = S().alerts.find((x) => x.id === b.dataset.id); if (a) { a.snoozeUntil = Date.now() + 36e5; Store.save(); App.toast('Alert snoozed for 1 hour'); } else App.toast('That alert no longer exists'); };
  acts['al-toggle'] = (b) => { const a = S().alerts.find((x) => x.id === b.dataset.id); a.on = !a.on; if (a.on) { a.state = {}; a.base = App.px(a.symbol) || a.base; } Store.save(); Market.reconcile(); UI.render(true); };
  acts['al-snooze'] = (b) => { const a = S().alerts.find((x) => x.id === b.dataset.id); a.snoozeUntil = a.snoozeUntil > Date.now() ? 0 : Date.now() + 36e5; Store.save(); UI.render(true); };
  acts['al-del'] = (b) => { S().alerts = S().alerts.filter((x) => x.id !== b.dataset.id); Store.save(); Market.reconcile(); UI.render(true); };
  acts['set-notify'] = () => { S().settings.notify = !S().settings.notify; Store.save(); UI.render(true); };
  acts['al-perm'] = async () => { const ok = await App.askNotify(); App.toast(ok ? 'System notifications enabled' : 'Permission not granted', ok ? 'ok' : 'err'); UI.render(true); };
  acts['al-test'] = () => App.notify('Mockex test', 'Notifications are working.', { kind: 'good' });
  acts['al-new'] = (b, e, pre) => {
    const syms = [...new Set(S().watch.concat(S().acct.positions.map((p) => p.symbol)))]; const sel = (pre && pre.sym) || syms[0];
    const sh = App.sheet(`<h2>New alert</h2><div class="col" style="gap:12px">
      <label class="field"><span>Asset</span><select class="inp" id="alsym">${syms.map((s) => `<option ${s === sel ? 'selected' : ''} value="${s}">${F.base(s)}</option>`).join('')}</select></label>
      <label class="field"><span>Condition</span><select class="inp" id="altype">${ATYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="field" id="alvalf"><span id="alvall">Target price</span><input class="inp num" id="alval" inputmode="decimal" autocomplete="off"></label>
      <label class="field hide" id="aliv"><span>Candle interval</span><select class="inp" id="alivs">${['5m', '15m', '1h', '4h', '1d'].map((i) => `<option ${i === '15m' ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
      <div class="row between"><span>Repeat after triggering</span><button class="chip" id="alrep" data-act="al-rep">Off</button></div>
      <div class="sub" id="alerr" style="color:var(--down);min-height:18px"></div>
      <div class="row"><button class="btn sp" data-act="closesheet">Cancel</button><button class="btn primary sp" data-act="al-save">Create alert</button></div></div>`);
    const sync = () => {
      const t = $('#altype', sh).value, k = ATYPES.find((x) => x[0] === t)[2], sym = $('#alsym', sh).value, px = App.px(sym);
      $('#alvalf', sh).classList.toggle('hide', !(k === 'price' || k === 'pct')); $('#aliv', sh).classList.toggle('hide', k !== 'ind');
      $('#alvall', sh).textContent = k === 'pct' ? 'Move size (%)' : 'Target price'; const v = $('#alval', sh);
      if (k === 'price' && px) v.value = String(+(px * (t === 'above' ? 1.02 : 0.98)).toPrecision(7)); if (k === 'pct') v.value = '5';
    };
    $('#altype', sh).addEventListener('change', sync); $('#alsym', sh).addEventListener('change', sync); sync();
  };
  acts['al-rep'] = (b) => { b.classList.toggle('on'); b.textContent = b.classList.contains('on') ? 'On' : 'Off'; };
  acts['al-save'] = () => {
    const sym = $('#alsym').value, type = $('#altype').value, kind = ATYPES.find((x) => x[0] === type)[2], px = App.px(sym), err = $('#alerr'); const val = num($('#alval').value);
    if ((kind === 'price' || kind === 'pct') && !(val > 0)) { err.textContent = 'Enter a value greater than zero.'; return; }
    if (type === 'above' && px && val <= px) { err.textContent = 'Target must be above the current price (' + F.price(px) + ').'; return; }
    if (type === 'below' && px && val >= px) { err.textContent = 'Target must be below the current price (' + F.price(px) + ').'; return; }
    if (type === 'pct' && val > 90) { err.textContent = 'Use a move under 90%.'; return; }
    S().alerts.push({ id: Store.uid(), symbol: sym, type, value: kind === 'ind' || !kind ? undefined : val, iv: kind === 'ind' ? $('#alivs').value : undefined, ind: kind === 'ind', on: true, repeat: $('#alrep').classList.contains('on'), base: px, created: Date.now(), state: {} });
    Store.save(); Market.reconcile(); App.closeSheet(); App.toast('Alert created', 'ok'); AL.tab = 'rules'; UI.render(true);
  };

  /* ---------- JOURNAL ---------- */
  const EMO = [['😎', 'Confident'], ['😌', 'Calm'], ['😐', 'Neutral'], ['😰', 'Anxious'], ['😤', 'Frustrated'], ['🤑', 'FOMO']];
  const MIS = ['Chased entry', 'No stop-loss', 'Oversized', 'Moved my stop', 'Revenge trade', 'Exited early', 'No mistake'];
  const JF = { tag: '' };
  acts['open-journal'] = () => {
    const el = App.openPage('journal', `<div class="hd"><button class="icon-btn" data-act="back">${UI.IC.back}</button><h2 class="sp">Trade journal</h2><button class="btn primary sm" data-act="jr-new">＋ Entry</button></div><div class="bd" id="jbd"></div>`);
    jrender(el);
  };
  function jrender(el) {
    el = el || App.overlays.find((p) => p.dataset.page === 'journal'); if (!el) return; const j = S().journal.slice().sort((a, b) => b.t - a.t).filter((x) => !JF.tag || (x.tags || []).includes(JF.tag)); const tags = [...new Set(S().journal.flatMap((x) => x.tags || []))];
    $('#jbd', el).innerHTML = (tags.length ? `<div class="chips">${tags.map((t) => `<button class="chip ${JF.tag === t ? 'on' : ''}" data-act="jr-tag" data-k="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : '') + (j.length ? j.map((x) => {
      const tr = x.tradeId && S().acct.history.find((h) => h.id === x.tradeId);
      return `<div class="card glass" data-act="jr-edit" data-id="${x.id}"><div class="row between"><b>${esc(x.title || 'Untitled')}</b><span class="sub muted">${F.date(x.t)}</span></div>${tr ? `<div class="sub" style="margin-top:4px">${esc(F.base(tr.symbol))} ${tr.side} · <span class="${tr.pnl >= 0 ? 'up' : 'down'}">${F.smoney(tr.pnl)}</span></div>` : ''}<div class="sub muted" style="margin:6px 0">${x.emotion ? esc(x.emotion) + ' · ' : ''}${(x.mistakes || []).map(esc).join(', ')}</div>${x.lesson ? `<div style="margin:6px 0">💡 ${esc(x.lesson)}</div>` : ''}${x.note ? `<div class="muted" style="font-size:14px">${esc(x.note.slice(0, 140))}${x.note.length > 140 ? '…' : ''}</div>` : ''}<div class="row" style="margin-top:8px;flex-wrap:wrap">${(x.tags || []).map((t) => `<span class="badge">#${esc(t)}</span>`).join('')}${(x.shots || []).length ? `<span class="badge">📷 ${x.shots.length}</span>` : ''}</div></div>`;
    }).join('') : '<div class="card glass empty"><div class="em">📓</div>Write down why you took a trade, how you felt and what you learned.<br>Reviewing it is how paper trading becomes skill.<br><button class="btn primary sm" style="margin-top:14px" data-act="jr-new">Write first entry</button></div>');
  }
  acts['jr-tag'] = (b) => { JF.tag = JF.tag === b.dataset.k ? '' : b.dataset.k; jrender(); };
  acts['jr-new'] = () => UI.editJournal(null);
  acts['jr-edit'] = (b) => UI.editJournal(b.dataset.id);
  UI.editJournal = (id, tradeId) => {
    const ex = id ? S().journal.find((x) => x.id === id) : null; const e = ex ? JSON.parse(JSON.stringify(ex)) : { id: Store.uid(), t: Date.now(), title: '', tradeId: tradeId || '', emotion: '', mistakes: [], tags: [], lesson: '', note: '', shots: [] };
    if (!ex && tradeId) { const t = S().acct.history.find((h) => h.id === tradeId); if (t) { e.title = `${F.base(t.symbol)} ${t.side} review`; e.note = t.note || ''; e.tags = (t.tags || []).slice(); } }
    UI._je = e; const trades = S().acct.history.slice().reverse().slice(0, 30);
    const sh = App.sheet(`<h2>${ex ? 'Edit entry' : 'New journal entry'}</h2><div class="col" style="gap:12px">
      <label class="field"><span>Title</span><input class="inp" id="jtitle" maxlength="80" value="${esc(e.title)}" placeholder="e.g. BTC breakout retest"></label>
      <label class="field"><span>Linked trade (optional)</span><select class="inp" id="jtrade"><option value="">None</option>${trades.map((t) => `<option value="${t.id}" ${t.id === e.tradeId ? 'selected' : ''}>${esc(F.base(t.symbol))} ${t.side} ${F.smoney(t.pnl)} · ${F.date(t.closedAt)}</option>`).join('')}</select></label>
      <div><div class="lbl">How did you feel?</div><div class="chips" style="padding:6px 0" id="jemo">${EMO.map(([i, l]) => `<button class="chip ${e.emotion === i + ' ' + l ? 'on' : ''}" data-act="jr-emo" data-v="${i} ${l}">${i} ${l}</button>`).join('')}</div></div>
      <div><div class="lbl">Mistakes</div><div class="chips" style="padding:6px 0;flex-wrap:wrap" id="jmis">${MIS.map((m) => `<button class="chip ${e.mistakes.includes(m) ? 'on' : ''}" data-act="jr-mis" data-v="${m}">${m}</button>`).join('')}</div></div>
      <div><div class="lbl">Tags</div><div class="chips" style="padding:6px 0;flex-wrap:wrap" id="jtags">${S().tags.map((t) => `<button class="chip ${e.tags.includes(t) ? 'on' : ''}" data-act="jr-tg" data-v="${esc(t)}">#${esc(t)}</button>`).join('')}</div></div>
      <label class="field"><span>Lesson learned</span><input class="inp" id="jlesson" maxlength="200" value="${esc(e.lesson)}" placeholder="One sentence you want to remember"></label>
      <label class="field"><span>Notes</span><textarea class="inp" id="jnote" maxlength="2000" placeholder="Setup, thesis, what happened…">${esc(e.note)}</textarea></label>
      <div class="row" style="flex-wrap:wrap" id="jshots">${e.shots.map((s) => `<img src="${s}" alt="" style="width:76px;height:76px;object-fit:cover;border-radius:14px;border:1px solid var(--edge)">`).join('')}<label class="chip" style="height:76px;width:76px;justify-content:center;border-radius:14px;font-size:24px">＋<input type="file" accept="image/*" id="jfile" hidden></label></div>
      <div class="row">${ex ? '<button class="btn sm" data-act="jr-del" style="color:var(--down)">Delete</button>' : ''}<span class="sp"></span><button class="btn sm" data-act="closesheet">Cancel</button><button class="btn primary" data-act="jr-save">Save entry</button></div></div>`);
    const f = $('#jfile', sh); f.addEventListener('change', async () => { if (!f.files[0]) return; if (e.shots.length >= 3) { App.toast('Up to 3 screenshots per entry', 'err'); return; } try { e.shots.push(await UI.compress(f.files[0])); $('#jshots').insertAdjacentHTML('afterbegin', `<img src="${e.shots[e.shots.length - 1]}" alt="" style="width:76px;height:76px;object-fit:cover;border-radius:14px;border:1px solid var(--edge)">`); } catch (x) { App.toast('Could not read that image', 'err'); } });
  };
  const tg = (arr, v, b) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); b.classList.toggle('on', i < 0); };
  acts['jr-emo'] = (b) => { UI._je.emotion = UI._je.emotion === b.dataset.v ? '' : b.dataset.v; $$('#jemo .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === UI._je.emotion)); };
  acts['jr-mis'] = (b) => tg(UI._je.mistakes, b.dataset.v, b);
  acts['jr-tg'] = (b) => tg(UI._je.tags, b.dataset.v, b);
  acts['jr-save'] = () => {
    const e = UI._je; e.title = $('#jtitle').value.trim().slice(0, 80); e.tradeId = $('#jtrade').value; e.lesson = $('#jlesson').value.trim().slice(0, 200); e.note = $('#jnote').value.slice(0, 2000);
    if (!e.title && !e.note && !e.lesson) { App.toast('Write something first', 'err'); return; }
    const i = S().journal.findIndex((x) => x.id === e.id); if (i >= 0) S().journal[i] = e; else S().journal.push(e);
    Store.save(true); App.closeSheet(); App.toast('Journal saved', 'ok'); jrender(); App.afterTrade();
  };
  acts['jr-del'] = async () => { if (!(await App.confirm('Delete entry?', 'This cannot be undone.', 'Delete', true))) return; S().journal = S().journal.filter((x) => x.id !== UI._je.id); Store.save(true); App.closeSheet(); jrender(); };

  /* ---------- REWARDS ---------- */
  UI.openRewards = () => {
    const ch = Rewards.challenges(), got = S().achv, ins = Rewards.insights(), lb = Rewards.leaderboard(), streak = Rewards.streak();
    App.openPage('rewards', `<div class="hd"><button class="icon-btn" data-act="back">${UI.IC.back}</button><h2 class="sp">Rewards</h2></div><div class="bd">
      <div class="card glass"><div class="row"><div style="font-size:42px">🔥</div><div class="sp"><div class="big" style="font-size:32px;font-weight:800">${streak}-day streak</div><div class="sub muted">Trade on consecutive days to keep it alive</div></div></div></div>
      <div class="sec"><h3>Daily challenges</h3><span class="sub muted">resets at midnight</span></div>
      ${ch.map((c) => `<div class="card glass tight"><div class="row between"><b>${c.done ? '✅' : c.failed ? '❌' : '🎯'} ${esc(c.title)}</b><span class="badge ${c.done ? 'up' : c.failed ? 'down' : ''}">${c.cur}/${c.goal}</span></div>${c.note ? `<div class="sub muted">${esc(c.note)}</div>` : ''}<div class="bar" style="margin-top:10px"><i style="width:${c.cur / c.goal * 100}%"></i></div></div>`).join('')}
      <div class="sec"><h3>Insights</h3></div>${ins.map((i) => `<div class="card glass tight row" style="align-items:flex-start"><span style="font-size:24px">${i.ic}</span><div>${esc(i.t)}</div></div>`).join('')}
      <div class="sec"><h3>Achievements</h3><span class="sub muted">${Object.keys(got).length}/${Rewards.ACH.length}</span></div>
      <div class="grid3" style="padding:0 16px 14px">${Rewards.ACH.map((a) => `<div class="ach glass ${got[a.id] ? 'got' : ''}"><div class="ai">${a.ic}</div><b>${esc(a.t)}</b><small>${esc(a.d)}</small></div>`).join('')}</div>
      <div class="sec"><h3>Leaderboard</h3><span class="sub muted">this week · return %</span></div>
      <div class="card glass" style="padding:4px 14px">${lb.map((r) => `<div class="item" style="min-height:52px;${r.me ? 'background:rgba(139,123,255,.14);border-radius:14px;padding:0 8px' : ''}"><b style="width:26px">${r.rank}</b><span class="sp">${esc(r.n)}${r.sample ? ' <span class="badge">SAMPLE</span>' : ''}</span><b class="num ${r.v >= 0 ? 'up' : 'down'}">${F.pct(r.v, 1)}</b></div>`).join('')}</div>
      <p class="disc">Sample traders are generated locally for illustration. Real rankings need the optional backend (README). Opt in to share a nickname in Profile; your balance is never shown.</p></div>`);
  };

  /* ---------- PROFILE / SETTINGS ---------- */
  const nf = (id, key, scale, min, max, label, hint) => `<label class="field"><span>${label}</span><input class="inp num" data-set="${key}" data-scale="${scale}" data-min="${min}" data-max="${max}" inputmode="decimal" value="${+(S().settings[key] * scale).toPrecision(6)}">${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
  UI.screens.me = {
    html() {
      const st = S(), s = st.settings, a = st.acct; const mp = s.metalsProvider;
      return `<div class="card glass"><div class="row"><div class="coin" style="width:56px;height:56px;border-radius:20px;font-size:22px;background:linear-gradient(135deg,var(--accent),var(--accent2))">${esc((st.user.name || 'T').slice(0, 1).toUpperCase())}</div><div class="sp"><b style="font-size:19px">${esc(st.user.name || 'Paper trader')}</b><div class="sub muted">${esc(st.user.email || 'Local profile · data stays on this device')}</div></div><button class="btn sm" data-act="me-edit">Edit</button></div>
        <div class="grid3" style="margin-top:14px"><div class="stat"><span class="lbl">Equity</span><b class="num" data-live="eq">${F.money(App.equity())}</b></div><div class="stat"><span class="lbl">Return</span><b class="num" data-live="ret">0%</b></div><div class="stat"><span class="lbl">Streak</span><b>🔥 ${Rewards.streak()}</b></div></div></div>
      <div class="row" style="padding:0 16px 14px"><button class="btn sp" data-act="open-rewards">🏆 Rewards</button><button class="btn sp" data-act="open-journal">📓 Journal</button><button class="btn sp" data-act="open-history">🧾 History</button></div>
      <div class="sec"><h3>Appearance</h3></div><div class="card glass"><div class="seg" id="thm"><button class="${s.theme === 'dark' ? 'on' : ''}" data-act="set-theme" data-v="dark">🌙 Dark</button><button class="${s.theme === 'light' ? 'on' : ''}" data-act="set-theme" data-v="light">☀️ Light</button></div>
        <div class="row between" style="margin-top:12px;min-height:44px"><div><b>Reduce glass effects</b><div class="sub muted">Lighter blur for older phones</div></div><button class="chip ${s.lowfx ? 'on' : ''}" data-act="set-lowfx">${s.lowfx ? 'On' : 'Off'}</button></div>
        <div class="row between" style="min-height:44px"><div><b>Haptics</b></div><button class="chip ${s.haptics ? 'on' : ''}" data-act="set-haptics">${s.haptics ? 'On' : 'Off'}</button></div></div>
      <div class="sec"><h3>Trading defaults</h3></div><div class="card glass"><div class="grid2">${nf('', 'fee', 100, 0, 2, 'Fee per side (%)')}${nf('', 'slippage', 100, 0, 2, 'Slippage (%)')}${nf('', 'maxLev', 1, 1, 50, 'Max leverage (×)')}${nf('', 'maxOpen', 1, 1, 50, 'Max open positions')}${nf('', 'maxPosPct', 1, 1, 100, 'Max position (% equity)')}${nf('', 'maxRiskPct', 1, 0.1, 100, 'Max risk / trade (%)')}</div><p class="sub muted" style="margin:10px 0 0">Orders that break these limits are blocked. Changes apply to new orders.</p></div>
      <div class="sec"><h3>Virtual account</h3></div><div class="card glass"><div class="kv"><span>Starting balance</span><span class="num">${F.money(a.start)}</span></div><div class="kv"><span>Cash</span><span class="num" data-live="cash">${F.money(a.cash)}</span></div><div class="kv"><span>Realised PnL</span><span class="num ${a.realized >= 0 ? 'up' : 'down'}">${F.smoney(a.realized)}</span></div><button class="btn sell block" style="margin-top:12px" data-act="reset-bal">Reset virtual balance…</button></div>
      <div class="sec"><h3>Data sources</h3></div><div class="card glass"><div class="kv"><span>Crypto</span><span style="text-align:right">Binance public spot data${Market.sim ? ' (offline → demo)' : ''}</span></div><div class="kv"><span>Feed status</span><span>${Market.sim ? 'DEMO' : Market.status.toUpperCase()}</span></div>
        <div class="lbl" style="margin:12px 0 6px">Metals provider</div><div class="seg" id="mprov" style="flex-wrap:wrap">${[['paxg', 'Gold: PAXG'], ['goldapi', 'gold-api.com'], ['custom', 'Custom']].map(([k, l]) => `<button class="${mp === k ? 'on' : ''}" data-act="set-mprov" data-v="${k}" style="font-size:13px">${l}</button>`).join('')}</div>
        <p class="sub muted" style="margin:8px 0">${mp === 'paxg' ? 'Gold uses Binance PAXG/USDT (tokenized gold, 1 token = 1 troy oz) over WebSocket. Silver uses gold-api.com spot polling.' : mp === 'goldapi' ? 'Gold and silver use gold-api.com spot prices, polled every 15 seconds.' : 'Your own JSON endpoint. Use {sym} for XAU/XAG and set the JSON path to the price field.'}</p>
        ${mp === 'custom' ? `<label class="field"><span>URL template</span><input class="inp" data-setstr="metalsUrl" value="${esc(s.metalsUrl)}" placeholder="https://host/price/{sym}"></label><label class="field" style="margin-top:8px"><span>JSON path to price</span><input class="inp" data-setstr="metalsPath" value="${esc(s.metalsPath)}" placeholder="price"></label>` : ''}</div>
      <div class="sec"><h3>Leaderboard & privacy</h3></div><div class="card glass"><div class="row between" style="min-height:48px"><div><b>Appear on leaderboard</b><div class="sub muted">Opt-in. Shares only your nickname and return %.</div></div><button class="chip ${s.leaderboard ? 'on' : ''}" data-act="set-lb">${s.leaderboard ? 'On' : 'Off'}</button></div>${s.leaderboard ? `<label class="field" style="margin-top:8px"><span>Nickname</span><input class="inp" data-setstr="nickname" maxlength="20" value="${esc(s.nickname)}" placeholder="Pick a nickname"></label>` : ''}</div>
      <div class="sec"><h3>Your data</h3></div><div class="card glass"><div class="row"><button class="btn sp sm" data-act="data-export">⬇ Export backup</button><label class="btn sp sm">⬆ Import<input type="file" accept="application/json" id="impf" hidden></label></div><p class="sub muted" style="margin:10px 0 0">Everything lives on this device. Export a backup before clearing app data.</p></div>
      <div class="card glass"><img class="wm d" src="brand/wordmark.png" alt="Mockex" style="height:24px"><img class="wm l" src="brand/wordmark-dark.png" alt="Mockex" style="height:24px"><p class="sub muted" style="margin:6px 0">Version 1.0 · Creator: Nishan<br>Market data: Binance public API · Metals: see data sources.<br><b>Paper trading is for education and practice only. Simulated results do not guarantee future performance.</b> No real exchange, broker or money is connected.</p><button class="btn sm" data-act="replay-intro">Replay intro</button></div>`;
    },
    mount(v) {
      $$('[data-set]', v).forEach((i) => i.addEventListener('change', () => {
        const k = i.dataset.set, sc = +i.dataset.scale, lo = +i.dataset.min, hi = +i.dataset.max; let x = num(i.value); if (!(x >= lo && x <= hi)) { App.toast(`Enter a value from ${lo} to ${hi}`, 'err'); i.value = +(S().settings[k] * sc).toPrecision(6); return; }
        S().settings[k] = x / sc; Store.save(); App.toast('Saved', 'ok', 1200);
      }));
      $$('[data-setstr]', v).forEach((i) => i.addEventListener('change', () => { S().settings[i.dataset.setstr] = i.value.trim().slice(0, 300); Store.save(); if (i.dataset.setstr.startsWith('metals')) Market.reconcile(); }));
      const f = $('#impf', v); if (f) f.addEventListener('change', () => importData(f));
    },
  };
  acts['set-theme'] = (b) => { S().settings.theme = b.dataset.v; document.documentElement.dataset.theme = b.dataset.v; Store.save(); UI.render(true); };
  acts['set-lowfx'] = () => { const s = S().settings; s.lowfx = !s.lowfx; document.documentElement.classList.toggle('lowfx', s.lowfx); Store.save(); UI.render(true); };
  acts['set-haptics'] = () => { const s = S().settings; s.haptics = !s.haptics; Store.save(); UI.render(true); };
  acts['set-lb'] = () => { const s = S().settings; s.leaderboard = !s.leaderboard; Store.save(); UI.render(true); };
  acts['set-mprov'] = (b) => { S().settings.metalsProvider = b.dataset.v; Store.save(); Market.reconcile(); UI.render(true); App.toast('Metals provider updated', 'ok'); };
  acts['me-edit'] = () => {
    App.sheet(`<h2>Profile</h2><div class="col" style="gap:12px"><label class="field"><span>Name</span><input class="inp" id="pn" maxlength="40" value="${esc(S().user.name)}"></label><label class="field"><span>Email (optional)</span><input class="inp" id="pe" type="email" maxlength="80" value="${esc(S().user.email)}"></label><p class="sub muted" style="margin:0">Stored on this device only. Cloud accounts need the optional backend (see README).</p><div class="row"><button class="btn sp" data-act="closesheet">Cancel</button><button class="btn primary sp" data-act="me-save">Save</button></div></div>`);
  };
  acts['me-save'] = () => { const e = $('#pe').value.trim(); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { App.toast('That email does not look valid', 'err'); return; } S().user.name = $('#pn').value.trim().slice(0, 40); S().user.email = e; Store.save(); App.closeSheet(); UI.render(true); };
  acts['reset-bal'] = () => {
    App.sheet(`<h2>Reset virtual balance</h2><p class="muted" style="line-height:1.5">This closes everything and starts a fresh account. Journal entries, alerts and settings are kept; trades and equity history are cleared.</p><div class="chips" style="padding:6px 0 12px;flex-wrap:wrap" id="rb">${[1000, 10000, 50000, 100000].map((n) => `<button class="chip ${n === 10000 ? 'on' : ''}" data-act="rb-pick" data-v="${n}">$${n.toLocaleString()}</button>`).join('')}</div><label class="field"><span>Custom amount (USD)</span><input class="inp num" id="rbc" inputmode="decimal" value="10000"></label><div class="row" style="margin-top:16px"><button class="btn sp" data-act="closesheet">Cancel</button><button class="btn sell sp" data-act="rb-go">Reset account</button></div>`);
  };
  acts['rb-pick'] = (b) => { $('#rbc').value = b.dataset.v; $$('#rb .chip').forEach((c) => c.classList.toggle('on', c === b)); };
  acts['rb-go'] = async () => { const v = num($('#rbc').value); if (!(v >= 100 && v <= 1e9)) { App.toast('Choose a balance between $100 and $1,000,000,000', 'err'); return; } App.closeSheet(); if (!(await App.confirm('Reset account?', 'All open positions, orders and trade history will be cleared.', 'Reset', true))) return; Store.reset(v); App.recordEquity(true); App.toast('Account reset to ' + F.money(v, 0), 'ok'); Market.reconcile(); UI.render(); };
  acts['data-export'] = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S())], { type: 'application/json' })); a.download = 'mockex-backup-' + F.dayKey() + '.json'; document.body.appendChild(a); a.click(); a.remove(); App.toast('Backup exported', 'ok'); };
  async function importData(f) {
    try {
      const o = JSON.parse(await f.files[0].text()); if (!o || typeof o !== 'object' || !o.acct || !Array.isArray(o.acct.positions) || !Array.isArray(o.acct.history) || typeof o.acct.cash !== 'number' || !o.settings) throw new Error('shape');
      if (!(await App.confirm('Replace current data?', 'Importing overwrites everything on this device with the backup.', 'Import', true))) return; Store.replaceAll(o); location.reload();
    } catch (e) { App.toast('That file is not a valid Mockex backup', 'err'); }
  }
  acts['replay-intro'] = () => UI.onboarding(() => { UI.render(); }, true);

  /* ---------- ONBOARDING ---------- */
  UI.onboarding = (done, replay) => {
    const root = document.createElement('div'); root.id = 'onb'; root.innerHTML = '<canvas></canvas><div id="onbs"></div>'; document.body.appendChild(root);
    const cv = $('canvas', root), ctx = cv.getContext('2d'); let raf, run = true;
    const fit = () => { cv.width = innerWidth * Math.min(devicePixelRatio, 2); cv.height = innerHeight * Math.min(devicePixelRatio, 2); }; fit(); addEventListener('resize', fit);
    const cs = []; let px0 = 100, t0 = 0; for (let i = 0; i < 80; i++) { const o = px0, c = o + (Math.random() - 0.48) * 6; cs.push({ o, c, h: Math.max(o, c) + Math.random() * 3, l: Math.min(o, c) - Math.random() * 3 }); px0 = c; }
    let off = 0;
    const draw = (t) => {
      if (!run) return; if (t - t0 > 33) { t0 = t; const d = cv.width / 40, k = devicePixelRatio > 1 ? Math.min(devicePixelRatio, 2) : 1; off += 0.4 * k; if (off >= d) { off -= d; const l = cs[cs.length - 1], o = l.c, c = o + (Math.random() - 0.48) * 6; cs.push({ o, c, h: Math.max(o, c) + Math.random() * 3, l: Math.min(o, c) - Math.random() * 3 }); cs.shift(); }
        ctx.clearRect(0, 0, cv.width, cv.height); const mn = Math.min(...cs.map((x) => x.l)), mx = Math.max(...cs.map((x) => x.h)); const Y = (v) => cv.height * 0.12 + (1 - (v - mn) / (mx - mn)) * cv.height * 0.42;
        cs.forEach((c, i) => { const x = i * d - off; const up = c.c >= c.o; ctx.globalAlpha = 0.55; ctx.fillStyle = ctx.strokeStyle = up ? '#2ee6a6' : '#ff5c7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + d * 0.4, Y(c.h)); ctx.lineTo(x + d * 0.4, Y(c.l)); ctx.stroke(); ctx.fillRect(x + d * 0.1, Y(Math.max(c.o, c.c)), d * 0.6, Math.max(2, Math.abs(Y(c.o) - Y(c.c)))); }); ctx.globalAlpha = 1; }
      raf = requestAnimationFrame(draw);
    }; raf = requestAnimationFrame(draw);
    const data = { name: S().user.name, email: S().user.email, bal: 10000, ack: false }; let step = 0;
    const slides = [
      () => `<div class="slide"><img class="hero-icon" src="brand/app-icon.png" alt="Mockex"><div class="badge" style="align-self:flex-start">PAPER TRADING · NO REAL MONEY</div><h1>Trade the market.<br><span class="hl">Risk nothing.</span></h1><p class="muted" style="font-size:17px;line-height:1.5;margin:0">Practise with live crypto and metals prices, real order types and honest fees, using a virtual balance.</p><div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div><button class="btn primary block" data-act="ob-next">Get started</button></div>`,
      () => `<div class="slide"><h1>Everything a<br><span class="hl">real desk</span> has</h1><div class="glass card" style="margin:0;padding:6px 16px">${[['📈', 'Live charts', 'Candles, indicators, drawing tools'], ['🎯', 'Smart orders', 'Limit, stop, take-profit, trailing, bracket'], ['🛡️', 'Risk tools', 'Position sizing, limits, liquidation warnings'], ['🏆', 'Get better', 'Journal, challenges, insights, streaks']].map(([i, t, d]) => `<div class="item"><span style="font-size:26px">${i}</span><div><b>${t}</b><div class="sub muted">${d}</div></div></div>`).join('')}</div><div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === 1 ? 'on' : ''}"></i>`).join('')}</div><button class="btn primary block" data-act="ob-next">Continue</button></div>`,
      () => `<div class="slide"><h1>Before you start</h1><div class="glass card" style="margin:0"><b>⚠️ Please read</b><p class="muted" style="line-height:1.55;margin:8px 0 0">Mockex is a <b>simulator</b>. No real trades are placed and no real money is used or at risk. Fills, fees and slippage are estimates and real markets behave differently. <b>Paper trading is for education and practice only. Simulated results do not guarantee future performance.</b> This is not financial advice.</p></div><label class="row" style="gap:12px;padding:6px 4px"><input type="checkbox" id="ack" style="width:24px;height:24px;accent-color:var(--accent2)" ${data.ack ? 'checked' : ''}><span>I understand this is practice only</span></label><div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === 2 ? 'on' : ''}"></i>`).join('')}</div><button class="btn primary block" id="ackbtn" data-act="ob-next" ${data.ack ? '' : 'disabled'}>I understand</button></div>`,
      () => `<div class="slide"><h1>Fund your<br><span class="hl">virtual account</span></h1><label class="field"><span>Your name (optional)</span><input class="inp" id="obn" maxlength="40" value="${esc(data.name)}" placeholder="Trader"></label><div class="lbl">Starting balance</div><div class="chips" style="padding:0;flex-wrap:wrap" id="obb">${[1000, 10000, 50000, 100000].map((n) => `<button class="chip ${data.bal === n ? 'on' : ''}" data-act="ob-bal" data-v="${n}">$${n.toLocaleString()}</button>`).join('')}</div><label class="field"><span>Or enter an amount (USD)</span><input class="inp num" id="obc" inputmode="decimal" value="${data.bal}"></label><div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === 3 ? 'on' : ''}"></i>`).join('')}</div><button class="btn primary block" data-act="ob-finish">Start trading</button></div>`,
    ];
    const show = () => { $('#onbs', root).innerHTML = slides[step](); const a = $('#ack', root); if (a) a.addEventListener('change', () => { data.ack = a.checked; $('#ackbtn', root).disabled = !a.checked; }); const c = $('#obc', root); if (c) c.addEventListener('input', () => { data.bal = num(c.value); $$('#obb .chip', root).forEach((x) => x.classList.toggle('on', +x.dataset.v === data.bal)); }); const n = $('#obn', root); if (n) n.addEventListener('input', () => (data.name = n.value)); };
    show();
    acts['ob-next'] = () => { if (step === 2 && !data.ack) return; step = Math.min(3, step + 1); show(); };
    acts['ob-bal'] = (b) => { data.bal = +b.dataset.v; $('#obc', root).value = data.bal; $$('#obb .chip', root).forEach((x) => x.classList.toggle('on', x === b)); };
    acts['ob-finish'] = () => {
      if (replay) { run = false; cancelAnimationFrame(raf); root.remove(); done(); return; }
      const v = num($('#obc', root).value); if (!(v >= 100 && v <= 1e9)) { App.toast('Choose a balance between $100 and $1,000,000,000', 'err'); return; }
      S().user.name = (data.name || '').trim().slice(0, 40); Store.reset(v); S().onboarded = true; Store.save(true); run = false; cancelAnimationFrame(raf); root.style.transition = 'opacity .5s'; root.style.opacity = 0; setTimeout(() => root.remove(), 520); done();
    };
  };
})();
