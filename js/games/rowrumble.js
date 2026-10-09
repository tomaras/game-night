// Row Rumble — everyone secretly picks a card, cards are placed in ascending order onto four rows,
// and whoever places the 6th card in a row (or can't fit) takes the row — and its bull heads. Fewest bulls wins.
import { h } from '../util.js';
import { avatarEl } from '../avatar.js';
import { makeClock, waiting } from '../kit.js';

const bulls = (n) => (n === 55 ? 7 : n % 11 === 0 ? 5 : n % 10 === 0 ? 3 : n % 5 === 0 ? 2 : 1);
const COL = { 1: ['#ffffff', '#1b1c20'], 2: ['#ffe9a8', '#5b4300'], 3: ['#ffc58a', '#6b2f00'], 5: ['#ff9e94', '#6b100a'], 7: ['#c9a3ff', '#3b0f8a'] };

const CSS = `
.rr-rows { display:flex; flex-direction:column; gap:8px; }
.rr-row { display:flex; align-items:center; gap:6px; background:var(--surface); box-shadow:var(--e1); border-radius:20px; padding:8px 10px; }
.rr-row.pickable { outline:3px solid var(--blue); cursor:pointer; animation:pulse 1s infinite; }
.rr-row .cnt { margin-left:auto; font:700 12px var(--font); color:var(--on3); }
.rr-slot { width:clamp(44px, 14vw, 62px); aspect-ratio:3/4; border-radius:12px; border:2px dashed var(--line2); flex:none; }
.rr-card { width:clamp(44px, 14vw, 62px); aspect-ratio:3/4; border-radius:12px; flex:none; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:4px 2px 5px; background:var(--cb); color:var(--cf); box-shadow:0 2px 6px rgba(31,41,55,.25), inset 0 0 0 2px rgba(0,0,0,.08); font:800 clamp(16px, 5vw, 22px)/1 var(--font); position:relative; user-select:none; }
.rr-card .b { display:flex; gap:2px; flex-wrap:wrap; justify-content:center; font-size:9px; line-height:1; }
.rr-card .b i { width:6px; height:6px; border-radius:50%; background:var(--cf); opacity:.7; display:block; }
.rr-card.big { width:72px; }
.rr-hand { display:flex; gap:8px; overflow-x:auto; padding:10px 4px 14px; scrollbar-width:none; }
.rr-hand .rr-card { cursor:pointer; transition:transform .12s; }
.rr-hand .rr-card:hover, .rr-hand .rr-card.sel { transform:translateY(-10px); }
.rr-hand .rr-card.sel { box-shadow:0 0 0 3px var(--blue), 0 6px 14px rgba(26,115,232,.4); }
.rr-played { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; }
.rr-played .it { display:flex; flex-direction:column; align-items:center; gap:4px; font:600 12px var(--font); animation:ktpop .35s both; }
.rr-played .it.fresh .rr-card { box-shadow:0 0 0 3px var(--yellow), var(--e2); }
.rr-take { color:var(--red); font:800 13px var(--font); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const target = api.opts.length === 'short' ? 0 : 66;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt.wide');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', rows: [[], [], [], []], hand: [], picked: null, played: [], bullsTotal: {}, round: 1, turn: 1, done: new Set(), chooser: null, log: '', fresh: null };
  ids.forEach((i) => (S.bullsTotal[i] = 0));

  const cardEl = (n, cls = '', onclick) => {
    const [bg, fg] = COL[bulls(n)];
    return h('div.rr-card' + (cls ? '.' + cls : ''), { style: { '--cb': bg, '--cf': fg }, onclick }, h('div.b', Array.from({ length: Math.min(bulls(n), 7) }, () => h('i'))), n, h('div.b', Array.from({ length: Math.min(bulls(n), 7) }, () => h('i'))));
  };

  api.on('state', (s) => { Object.assign(S, s); S.done = new Set(s.done || []); clock.set(s.ms || 0); if (s.fresh) api.sfx('card'); render(); });
  api.on('hand', (m) => { S.hand = m.hand; S.picked = null; render(); });
  api.onPlayersChanged(render);

  function render() {
    const me = api.me;
    const parts = [h('div.kt-card', { style: 'display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px' }, h('b', `Round ${S.round} · Turn ${S.turn}/10`), ...api.players.map((p) => h('span.kt-pill', avatarEl({ ...p, online: p.online && !p.left }, 'xs', { still: true }), p.name === api.player(me)?.name ? 'You' : p.name.split(' ')[0], h('b', { style: 'color:var(--red)' }, S.bullsTotal[p.id] || 0, ' 🐂'))))];
    if (S.phase === 'pick' || S.phase === 'resolve' || S.phase === 'choose') parts.push(clock.el());
    parts.push(h('div.rr-rows', S.rows.map((row, ri) => h('div.rr-row' + (S.phase === 'choose' && S.chooser === me ? '.pickable' : ''), { onclick: () => { if (S.phase === 'choose' && S.chooser === me) { api.toHost('row', { r: ri }); api.sfx('click'); } } },
      ...row.map((n) => cardEl(n)), ...Array.from({ length: 5 - row.length }, () => h('div.rr-slot')), h('span.cnt', row.reduce((a, n) => a + bulls(n), 0) + ' 🐂')))));
    if (S.played.length) parts.push(h('div.rr-played', S.played.map((p) => h('div.it' + (S.fresh === p.id ? '.fresh' : ''), cardEl(p.n, 'big'), h('span', nameOf(p.id))))));
    if (S.log) parts.push(h('div.kt-hint', { style: 'font-weight:700;color:var(--on)' }, S.log));
    if (S.phase === 'choose') parts.push(h('div.kt-hint', S.chooser === me ? 'Your card is lower than every row — tap a row to take it!' : `${nameOf(S.chooser)} must take a row…`));
    if (S.phase === 'pick') {
      parts.push(S.picked === null ? h('div.kt-hint', 'Pick a card (tap) — everyone reveals at once.') : h('div.kt-hint', 'Locked in.'), waiting(api, ids.filter((i) => !S.done.has(i))));
    }
    parts.push(h('div.rr-hand', S.hand.map((n) => cardEl(n, S.picked === n ? 'sel' : '', () => { if (S.phase !== 'pick' || S.picked !== null) return; S.picked = n; api.toHost('pick', { n }); api.sfx('card'); render(); }))));
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { rows: [], hands: {}, picks: {}, bulls: {}, timer: 0, phase: 'wait', deadline: 0, round: 0, turn: 0, played: [], queue: [], chooser: null, log: '' };
    ids.forEach((i) => (H.bulls[i] = 0));
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    const st = (extra = {}) => ({ phase: H.phase, rows: H.rows, bullsTotal: H.bulls, round: H.round, turn: H.turn, played: H.played, log: H.log, chooser: H.chooser, done: Object.keys(H.picks), ms: Math.max(0, H.deadline - performance.now()), ...extra });
    const publish = (extra) => api.broadcast('state', st(extra));
    function deal() {
      H.round++; H.turn = 0;
      const deck = rng.shuffle(Array.from({ length: 104 }, (_, i) => i + 1));
      alive().forEach((id) => { H.hands[id] = deck.splice(0, 10).sort((a, b) => a - b); api.sendTo(id, 'hand', { hand: H.hands[id] }); });
      H.rows = [0, 1, 2, 3].map(() => [deck.pop()]);
      nextTurn();
    }
    function nextTurn() {
      H.turn++;
      if (H.turn > 10) return endRound();
      H.picks = {}; H.played = []; H.log = ''; H.chooser = null;
      alive().forEach((id) => api.sendTo(id, 'hand', { hand: H.hands[id] }));
      H.phase = 'pick'; H.deadline = performance.now() + 35000;
      publish();
      H.timer = setTimeout(resolve, 35300);
    }
    function resolve() {
      clearTimeout(H.timer);
      alive().forEach((id) => { if (H.picks[id] === undefined) { H.picks[id] = H.hands[id][0]; } });
      H.queue = Object.entries(H.picks).map(([id, n]) => ({ id, n })).sort((a, b) => a.n - b.n);
      H.played = H.queue.slice();
      H.phase = 'resolve';
      step();
    }
    function step() {
      clearTimeout(H.timer);
      const c = H.queue.shift();
      if (!c) { H.log = ''; return setTimeout(() => nextTurn(), 900); }
      const ends = H.rows.map((r) => r[r.length - 1]);
      let best = -1;
      ends.forEach((e, i) => { if (e < c.n && (best < 0 || e > ends[best])) best = i; });
      H.hands[c.id] = H.hands[c.id].filter((x) => x !== c.n);
      if (best < 0) { // lower than every row: player must take a row
        H.phase = 'choose'; H.chooser = c.id; H.pending = c; H.deadline = performance.now() + 15000;
        H.log = `${nameOf(c.id)}'s ${c.n} is too low — choose a row`;
        publish({ fresh: c.id });
        H.timer = setTimeout(() => takeRow(c, H.rows.map((r, i) => [r.reduce((a, n) => a + bulls(n), 0), i]).sort((a, b) => a[0] - b[0])[0][1]), 15300);
        return;
      }
      if (H.rows[best].length >= 5) { takeRow(c, best); return; }
      H.rows[best].push(c.n);
      H.phase = 'resolve'; H.log = '';
      publish({ fresh: c.id });
      H.timer = setTimeout(step, 1100);
    }
    function takeRow(c, ri) {
      clearTimeout(H.timer);
      const taken = H.rows[ri];
      const b = taken.reduce((a, n) => a + bulls(n), 0);
      H.bulls[c.id] += b;
      H.rows[ri] = [c.n];
      H.phase = 'resolve'; H.chooser = null;
      H.log = `${nameOf(c.id)} takes ${taken.length} cards: +${b} 🐂`;
      publish({ fresh: c.id });
      H.timer = setTimeout(step, 1700);
    }
    function endRound() {
      const over = target === 0 || Object.values(H.bulls).some((b) => b >= target);
      if (over) {
        const ranking = ids.slice().sort((a, b) => H.bulls[a] - H.bulls[b]).map((id) => ({ id, score: H.bulls[id], note: 'bulls (lower is better)' }));
        return api.endGame({ title: `${nameOf(ranking[0].id)} dodged the bulls!`, subtitle: 'Fewest bull heads wins', ranking, winners: [ranking[0].id] });
      }
      H.log = `New round! (first to ${target} bulls loses)`; deal();
    }
    api.on('pick', ({ n }, from) => {
      if (H.phase !== 'pick' || H.picks[from] !== undefined || !H.hands[from]?.includes(n)) return;
      H.picks[from] = n;
      publish();
      if (alive().every((i) => H.picks[i] !== undefined)) { clearTimeout(H.timer); api.timeout(resolve, 500); }
    });
    api.on('row', ({ r }, from) => { if (H.phase === 'choose' && H.chooser === from && r >= 0 && r < 4) takeRow(H.pending, r); });
    api.onRejoin((id) => { api.sendTo(id, 'hand', { hand: H.hands[id] || [] }); api.sendTo(id, 'state', st()); });
    api.onLeave((id) => { if (H.phase === 'pick' && alive().every((i) => H.picks[i] !== undefined)) resolve(); });
    api.timeout(deal, 700);
  }
  render();
}
