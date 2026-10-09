// Trick Crew — a cooperative trick-taking space mission (The Crew-style). 3–5 players, no table talk about your hand!
// Each mission gives the crew task cards: the named player must win a trick containing that card.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const SUITS = { b: ['Blue', '#1a73e8'], g: ['Green', '#2e9e4f'], p: ['Pink', '#e5399b'], y: ['Yellow', '#f9ab00'], r: ['Rocket', '#37474f'] };
const SUIT_ORDER = ['b', 'g', 'p', 'y', 'r'];
const MISSIONS = [{ t: 1 }, { t: 2 }, { t: 3 }, { t: 3, o: 2 }, { t: 4 }, { t: 4, o: 3 }, { t: 5, o: 2 }, { t: 5, o: 3 }, { t: 6, o: 3 }, { t: 7, o: 4 }];
const SYM = { b: '◆', g: '▲', p: '♥', y: '★', r: '🚀' };
const suitOf = (c) => c[0], numOf = (c) => +c.slice(1);
const ORD = ['①', '②', '③', '④', '⑤'];
const sortHand = (hand) => hand.slice().sort((a, b) => SUIT_ORDER.indexOf(suitOf(a)) - SUIT_ORDER.indexOf(suitOf(b)) || numOf(a) - numOf(b));
const beats = (a, b, lead) => {
  const sa = suitOf(a), sb = suitOf(b);
  if (sa === sb) return numOf(a) > numOf(b);
  if (sa === 'r') return true;
  if (sb === 'r') return false;
  return sa === lead;
};

const CSS = `
.tc { gap:10px; }
.tc-card { width:50px; height:72px; border-radius:11px; background:#fff; border:3px solid var(--cc); color:var(--cc); display:flex; flex-direction:column; align-items:center; justify-content:center; font:800 24px var(--font); box-shadow:0 3px 8px rgba(0,0,0,.15); position:relative; flex:none; user-select:none; }
.tc-card::before { content:attr(data-s); font-size:13px; position:absolute; top:2px; left:5px; } .tc-card.r { background:var(--cc); color:#fff; } .tc-card.r .n { font-size:24px; }
.tc-card small { font-size:15px; line-height:1; } .tc-card.mini { width:36px; height:52px; font-size:17px; border-width:2px; border-radius:8px; } .tc-card.mini::before { font-size:10px; top:1px; left:3px; }
.tc-card.hand { width:clamp(46px, 14vw, 64px); height:clamp(66px, 20vw, 92px); font-size:clamp(22px,7vw,30px); cursor:pointer; transition:transform .15s; }
.tc-card.hand.ok { box-shadow:0 0 0 3px color-mix(in srgb, var(--green) 70%, transparent), 0 4px 10px rgba(0,0,0,.2); } .tc-card.hand.no { opacity:.4; } .tc-card.hand.sel { transform:translateY(-16px); }
.tc-tasks { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.tc-t { display:flex; flex-direction:column; align-items:center; gap:3px; background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:6px 8px; position:relative; font:700 11px var(--font); }
.tc-t.done { background:var(--green-c); } .tc-t.done::after { content:'✓'; position:absolute; top:-6px; right:-4px; background:var(--green); color:#fff; width:20px; height:20px; border-radius:50%; display:grid; place-items:center; font-size:12px; }
.tc-t .o { position:absolute; top:-8px; left:-4px; font-size:20px; color:var(--on); background:var(--yellow); border-radius:50%; width:22px; height:22px; display:grid; place-items:center; line-height:1; }
.tc-pl { display:flex; gap:8px; overflow-x:auto; justify-content:safe center; padding:2px 2px 6px; scrollbar-width:none; }
.tc-p { flex:none; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:6px 10px; display:flex; flex-direction:column; align-items:center; gap:2px; border:3px solid transparent; min-width:84px; font:700 12px var(--font); }
.tc-p.turn { border-color:var(--yellow); background:var(--yellow-c); } .tc-p .sig { display:flex; align-items:center; gap:4px; min-height:56px; font-size:11px; color:var(--on2); }
.tc-p .cm { font:600 11px var(--font); color:var(--on3); }
.tc-trick { display:flex; gap:12px; justify-content:center; align-items:flex-end; min-height:112px; flex-wrap:wrap; background:radial-gradient(circle at 50% 50%, #e8eaf6, #c5cae9); border-radius:26px; padding:14px; box-shadow:inset 0 2px 10px rgba(0,0,0,.08); }
.tc-trick > div { display:flex; flex-direction:column; align-items:center; gap:4px; font:700 11px var(--font); color:var(--on2); } .tc-trick .win .tc-card { box-shadow:0 0 0 4px var(--yellow); }
.tc-hand { display:flex; gap:6px; justify-content:safe center; flex-wrap:wrap; padding:18px 4px 6px; }
.tc-acts { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; min-height:44px; }
`;

const cardEl = (c, cls = '', extra = {}) => h('div.tc-card' + (suitOf(c) === 'r' ? '.r' : '') + (cls ? '.' + cls.split(' ').filter(Boolean).join('.') : ''), { style: `--cc:${SUITS[suitOf(c)][1]}`, 'data-s': SYM[suitOf(c)], ...extra }, h('span.n', numOf(c)));

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const maxMissions = +api.opts.missions || 6;
  const attemptsMax = +api.opts.tries || 3;
  const root = h('div.kt.wide.tc');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', mission: 1, attempt: 1, tasks: [], trick: [], turn: null, leader: null, hc: {}, comm: {}, last: null, log: '', hand: [], sel: null, result: null, lead: null, winner: null };

  api.on('state', (s) => { const was = S.turn; Object.assign(S, s); if (!S.hand.includes(S.sel)) S.sel = null; if (S.turn === api.me && was !== api.me && S.phase === 'play') api.sfx('ding'); if (s.sfx) api.sfx(s.sfx); render(); });
  api.onPlayersChanged(render);

  const legal = (c) => {
    if (!S.trick.length) return true;
    const lead = suitOf(S.trick[0].c);
    return suitOf(c) === lead || !S.hand.some((x) => suitOf(x) === lead);
  };
  const sigOptions = (c) => {
    const s = suitOf(c);
    if (s === 'r') return [];
    const same = S.hand.filter((x) => suitOf(x) === s).map(numOf), n = numOf(c);
    const o = [];
    if (same.length === 1) o.push(['only', 'Only one', '•']);
    else { if (n === Math.max(...same)) o.push(['high', 'Highest', '⬆']); if (n === Math.min(...same)) o.push(['low', 'Lowest', '⬇']); }
    return o;
  };

  function render() {
    const me = api.me, myTurn = S.turn === me && S.phase === 'play';
    if (S.phase === 'result' && S.result) {
      const r = S.result;
      root.replaceChildren(
        h('div.kt-prompt', { style: `--pc:${r.ok ? '#34a853' : '#ea4335'}` }, h('small', `Mission ${S.mission} · attempt ${S.attempt}`), r.ok ? '🚀 Mission complete!' : '💥 Mission failed'),
        h('div.kt-card', { style: 'text-align:center' }, r.msg, h('div.kt-hint', r.next)),
        h('div.tc-tasks', S.tasks.map(taskEl)));
      return;
    }
    const top = h('div.kt-row', { style: 'justify-content:center' }, h('span.chip.blue', `Mission ${S.mission}/${maxMissions}`), h('span.chip.yellow', `Attempt ${S.attempt}/${attemptsMax}`), S.log ? h('span.chip.pink', S.log) : null);
    const tasks = h('div.tc-tasks', S.tasks.map(taskEl));
    const players = h('div.tc-pl', ids.map((id) => {
      const cm = S.comm[id] || {};
      return h('div.tc-p' + (S.turn === id && S.phase === 'play' ? '.turn' : ''), avatarEl(api.player(id), 'sm', { still: S.turn !== id }), nameOf(id) + (id === me ? ' (you)' : ''),
        h('div.sig', cm.c ? [cardEl(cm.c, 'mini'), h('span', cm.k === 'high' ? '⬆ highest' : cm.k === 'low' ? '⬇ lowest' : '• only')] : h('span', cm.used ? 'signal used' : '📡 signal ready')),
        h('div.cm', `${S.hc[id] ?? 0} cards`));
    }));
    const trick = h('div.tc-trick', S.trick.length ? S.trick.map((t) => h('div' + (S.winner === t.p ? '.win' : ''), cardEl(t.c), nameOf(t.p))) : h('span.muted', S.phase === 'play' ? `${nameOf(S.turn)} leads the trick` : ''));
    const sel = S.sel;
    const hint = myTurn ? (S.trick.length ? `Follow ${SUITS[suitOf(S.trick[0].c)][0].toLowerCase()} if you can` : 'You lead — play any card') : S.phase === 'play' ? `${nameOf(S.turn)} to play…` : '';
    const acts = h('div.tc-acts');
    if (sel) {
      if (myTurn) acts.append(h('button.btn.primary', { disabled: !legal(sel), onclick: () => { api.toHost('play', { c: sel }); S.sel = null; render(); } }, icon('play_arrow'), 'Play'));
      const cm = S.comm[me] || {};
      if (!cm.used && !S.trick.length && S.phase === 'play') for (const [k, label, sym] of sigOptions(sel)) acts.append(h('button.btn.tonal', { onclick: () => { api.toHost('signal', { c: sel, k }); S.sel = null; render(); } }, sym + ' Signal: ' + label));
    }
    const hand = h('div.tc-hand', sortHand(S.hand).map((c) => cardEl(c, 'hand ' + (S.sel === c ? 'sel ' : '') + (myTurn ? (legal(c) ? 'ok' : 'no') : ''), { onclick: () => { S.sel = S.sel === c ? null : c; render(); } })));
    root.replaceChildren(top, tasks, players, trick, h('div.kt-hint', { style: 'font-weight:700;color:var(--on)' }, hint), acts, hand);
  }
  function taskEl(t) {
    return h('div.tc-t' + (t.done ? '.done' : ''), t.o ? h('span.o', ORD[t.o - 1]) : null, cardEl(t.c, 'mini'), avatarEl(api.player(t.owner), 'sm', { still: true }), nameOf(t.owner).slice(0, 9));
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { mission: 1, attempt: 1, hands: {}, tasks: [], trick: [], turn: 0, leader: 0, comm: {}, phase: 'wait', timer: 0, log: '', winner: null, sfx: null };
    api.cleanup(() => clearTimeout(H.timer));
    const pub = (extra = {}) => ids.forEach((id) => { if (!api.player(id).left) api.sendTo(id, 'state', { phase: H.phase, mission: H.mission, attempt: H.attempt, tasks: H.tasks, trick: H.trick, turn: ids[H.turn], leader: ids[H.leader], hc: Object.fromEntries(ids.map((i) => [i, H.hands[i].length])), comm: H.comm, log: H.log, hand: H.hands[id], winner: H.winner, sfx: H.sfx, ...extra }); H.sfx = null; });
    function deal() {
      const deck = [];
      for (const s of 'bgpy') for (let n = 1; n <= 9; n++) deck.push(s + n);
      for (let n = 1; n <= 4; n++) deck.push('r' + n);
      let d = rng.shuffle(deck);
      const per = Math.floor(40 / N);
      if (40 % N) { const i = d.findIndex((c) => c !== 'r4'); d.splice(i, 1); }
      ids.forEach((id, i) => (H.hands[id] = d.slice(i * per, (i + 1) * per)));
      H.leader = H.turn = ids.findIndex((id) => H.hands[id].includes('r4'));
      // tasks: random non-rocket cards, handed out round-robin starting with the commander
      const spec = MISSIONS[Math.min(H.mission, MISSIONS.length) - 1];
      const pool = rng.shuffle(d.filter((c) => suitOf(c) !== 'r' && d.indexOf(c) < per * N));
      H.tasks = [];
      for (let k = 0; k < spec.t; k++) H.tasks.push({ c: pool[k], owner: ids[(H.leader + k) % N], done: false, o: spec.o && k < spec.o ? k + 1 : 0 });
      H.comm = Object.fromEntries(ids.map((id) => [id, { used: false }]));
      H.trick = []; H.phase = 'play'; H.winner = null; H.log = '';
    }
    function begin() { clearTimeout(H.timer); deal(); pub(); }
    api.on('play', ({ c }, from) => {
      if (H.phase !== 'play' || ids[H.turn] !== from) return;
      const hand = H.hands[from];
      if (!hand.includes(c)) return;
      if (H.trick.length) { const lead = suitOf(H.trick[0].c); if (suitOf(c) !== lead && hand.some((x) => suitOf(x) === lead)) return; }
      hand.splice(hand.indexOf(c), 1);
      H.trick.push({ p: from, c });
      if (H.comm[from]?.c === c) H.comm[from] = { used: true };
      H.sfx = 'card';
      if (H.trick.length < N) { H.turn = (H.turn + 1) % N; return pub(); }
      H.phase = 'resolve';
      const lead = suitOf(H.trick[0].c);
      let win = H.trick[0];
      for (const t of H.trick.slice(1)) if (beats(t.c, win.c, lead)) win = t;
      H.winner = win.p;
      pub();
      H.timer = setTimeout(() => resolve(win), 1700);
    });
    function resolve(win) {
      let fail = null;
      for (const t of H.tasks) {
        if (t.done || !H.trick.some((x) => x.c === t.c)) continue;
        if (t.owner !== win.p) { fail = `${cardWord(t.c)} was won by ${nameOf(win.p)} instead of ${nameOf(t.owner)}.`; break; }
        if (t.o && H.tasks.some((u) => u.o && u.o < t.o && !u.done && !H.trick.some((x) => x.c === u.c))) { fail = `${cardWord(t.c)} was won out of order!`; break; }
        t.done = true;
      }
      const ok = !fail && H.tasks.every((t) => t.done);
      const hands0 = ids.every((id) => !H.hands[id].length);
      if (ok) return endMission(true, 'Every task is complete. Great flying, crew!');
      if (fail) return endMission(false, fail);
      if (hands0) return endMission(false, 'The cards ran out with tasks still open.');
      H.leader = H.turn = ids.indexOf(win.p);
      H.trick = []; H.winner = null; H.phase = 'play'; H.log = `${nameOf(win.p)} won the trick`;
      pub();
    }
    const cardWord = (c) => `${SUITS[suitOf(c)][0]} ${numOf(c)}`;
    api.on('signal', ({ c, k }, from) => {
      if (H.phase !== 'play' || H.trick.length || H.comm[from].used) return;
      if (!H.hands[from].includes(c) || suitOf(c) === 'r') return;
      const same = H.hands[from].filter((x) => suitOf(x) === suitOf(c)).map(numOf), n = numOf(c);
      const okk = k === 'only' ? same.length === 1 : k === 'high' ? n === Math.max(...same) && same.length > 1 : k === 'low' ? n === Math.min(...same) && same.length > 1 : false;
      if (!okk) return;
      H.comm[from] = { used: true, c, k };
      H.sfx = 'pop'; H.log = `${nameOf(from)} shares a signal`;
      pub();
    });
    function endMission(ok, msg) {
      H.phase = 'result';
      let next;
      if (ok) {
        if (H.mission >= maxMissions) next = 'You finished the whole campaign!';
        else next = `Next: mission ${H.mission + 1}…`;
      } else if (H.attempt >= attemptsMax) next = 'No attempts left — the crew is grounded.';
      else next = `Trying again (attempt ${H.attempt + 1})…`;
      H.sfx = ok ? 'win' : 'lose';
      pub({ result: { ok, msg, next } });
      H.timer = setTimeout(() => {
        if (ok) { if (H.mission >= maxMissions) return finish(true); H.mission++; H.attempt = 1; } else { if (H.attempt >= attemptsMax) return finish(false); H.attempt++; }
        begin();
      }, 5200);
    }
    function finish(win) {
      const done = win ? H.mission : H.mission - 1;
      api.endGame({ title: win ? '🚀 Mission accomplished!' : 'Mission failed', subtitle: win ? `All ${maxMissions} missions completed` : `Reached mission ${H.mission} — ${done} completed`, ranking: ids.map((id) => ({ id, score: win ? 'crew win' : `${done} missions`, note: '' })), winners: win ? ids.slice() : [] });
    }
    api.onRejoin(() => pub());
    api.onLeave(() => { clearTimeout(H.timer); api.endGame({ title: 'A crew member left', subtitle: `Reached mission ${H.mission}`, ranking: ids.filter((id) => !api.player(id).left).map((id) => ({ id, score: '' })), winners: [] }); });
    api.timeout(begin, 800);
  }
  render();
}
