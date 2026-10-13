// Tunnel Traitors — a Saboteur-style mining game. Dig a tunnel to the hidden gold while secret traitors
// break tools and block the way. Three rounds, new secret roles each round; most gold wins.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock } from '../kit.js';

const ROWS = 9, COLS = 13, START = [4, 2], GOALS = [[2, 10], [4, 10], [6, 10]];
const DIRS = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // [bit, dr, dc, opposite]
const bits = (s) => [...s].reduce((a, ch) => a | { N: 1, E: 2, S: 4, W: 8 }[ch], 0);
const rot = (m) => ((m & 1) << 2) | ((m & 4) >> 2) | ((m & 2) << 2) | ((m & 8) >> 2);
const TOOLS = { pick: ['⛏️', 'pickaxe'], lamp: ['🏮', 'lamp'], cart: ['🛒', 'cart'] };
const OPEN = [['NS', 4], ['EW', 3], ['NESW', 5], ['NES', 5], ['ESW', 5], ['NE', 4], ['ES', 5]];
const DEAD = ['N', 'E', 'NS', 'EW', 'NE', 'ES', 'NES', 'ESW', 'NESW'];
const key = (r, c) => r + ',' + c;

function reach(cells) {
  const seen = new Set([key(...START)]);
  const q = [key(...START)];
  while (q.length) {
    const k = q.pop();
    const [r, c] = k.split(',').map(Number);
    const u = cells[k];
    if (!u || u.b) continue;
    for (const [bit, dr, dc, opp] of DIRS) {
      if (!(u.m & bit)) continue;
      const nk = key(r + dr, c + dc), v = cells[nk];
      if (v && v.m !== undefined && (v.m & opp) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
    }
  }
  return seen;
}
function canPlace(cells, m, r, c, rs = reach(cells)) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS || cells[key(r, c)]) return false;
  let conn = false;
  for (const [bit, dr, dc, opp] of DIRS) {
    const nk = key(r + dr, c + dc), v = cells[nk];
    if (!v || v.m === undefined) continue; // empty or still-hidden goal
    const a = !!(m & bit), b = !!(v.m & opp);
    if (a !== b) return false;
    if (a && !v.b && rs.has(nk)) conn = true;
  }
  return conn;
}
function placements(cells, m) {
  const rs = reach(cells), out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (canPlace(cells, m, r, c, rs)) out.push(key(r, c));
  return new Set(out);
}

const ROCK = '#8d6e63', ROCK_D = '#5d4037', CORR = '#ffeccc';
function tileSvg(m, blocked, kind, hint) {
  const bar = { 1: [31, 0, 38, 50], 2: [50, 31, 50, 38], 4: [31, 50, 38, 50], 8: [0, 31, 50, 38] };
  const stub = { 1: [31, 0, 38, 25], 2: [75, 31, 25, 38], 4: [31, 75, 38, 25], 8: [0, 31, 25, 38] };
  let s = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="13" fill="${kind === 'stone' ? '#90a4ae' : ROCK}"/><rect x="2" y="2" width="96" height="96" rx="11" fill="none" stroke="${ROCK_D}" stroke-opacity=".5" stroke-width="3"/>`;
  for (const b of [1, 2, 4, 8]) if (m & b) { const [x, y, w, hh] = (blocked ? stub : bar)[b]; s += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${CORR}"/>`; }
  if (m && !blocked) s += `<rect x="31" y="31" width="38" height="38" fill="${CORR}"/>`;
  if (blocked) s += `<circle cx="50" cy="50" r="19" fill="${ROCK_D}"/><circle cx="43" cy="43" r="6" fill="#8d6e63"/><circle cx="58" cy="57" r="4" fill="#795548"/>`;
  if (kind === 'start') s += `<text x="50" y="63" font-size="36" text-anchor="middle">🏁</text>`;
  if (kind === 'gold') s += `<text x="50" y="63" font-size="36" text-anchor="middle">💎</text>`;
  if (kind === 'stone') s += `<text x="50" y="63" font-size="30" text-anchor="middle">🪨</text>`;
  return s + '</svg>';
}
function hiddenGoalSvg(hint) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="13" fill="#3949ab"/><rect x="5" y="5" width="90" height="90" rx="10" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-dasharray="8 6"/><text x="50" y="66" font-size="48" font-weight="800" fill="#fff" text-anchor="middle" font-family="Outfit,sans-serif">?</text>${hint ? `<text x="82" y="26" font-size="24" text-anchor="middle">${hint === 'gold' ? '💎' : '🪨'}</text>` : ''}</svg>`;
}
const svgEl = (html, cls) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

const CSS = `
.tt { gap:8px; }
.tt-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.tt-role { flex:1; min-width:180px; border-radius:20px; padding:8px 14px; display:flex; align-items:center; gap:10px; cursor:pointer; color:#fff; background:linear-gradient(135deg,#f9a825,#ef6c00); font:800 15px var(--font); user-select:none; box-shadow:var(--e1); }
.tt-role.sab { background:linear-gradient(135deg,#5e35b1,#311b92); } .tt-role.cov { background:var(--s3); color:var(--on2); }
.tt-top .kt-timer { flex:1 1 100px; min-width:100px; }
.tt-role small { font:500 12px var(--font); opacity:.9; display:block; } .tt-role .em { font-size:26px; }
.tt-pl { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scrollbar-width:none; }
.tt-p { flex:none; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:6px 10px 6px 6px; display:flex; align-items:center; gap:8px; border:3px solid transparent; }
.tt-p.turn { border-color:var(--yellow); background:var(--yellow-c); } .tt-p.pick { border-color:var(--blue); cursor:pointer; animation:pulse 1s infinite; } .tt-p.gone { opacity:.4; }
.tt-p .nm { font:700 13px var(--font); max-width:84px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .tt-p .sub { font:600 11px var(--font); color:var(--on3); }
.tt-tools { display:flex; gap:2px; } .tt-tool { font-size:15px; width:22px; height:22px; border-radius:7px; display:grid; place-items:center; background:var(--s2); }
.tt-tool.br { background:var(--red-c); position:relative; filter:grayscale(.6); } .tt-tool.br::after { content:''; position:absolute; left:2px; right:2px; top:50%; height:2px; background:var(--red); transform:rotate(-35deg); }
.tt-board { --cs:clamp(38px, min(11.5vw, 6.4dvh), 58px); flex:none; overflow:auto; border-radius:22px; background:#efebe9; box-shadow:inset 0 2px 8px rgba(0,0,0,.08); max-height:calc(var(--cs)*9 + 26px); -webkit-overflow-scrolling:touch; }
.tt-grid { display:grid; grid-template-columns:repeat(${COLS}, var(--cs)); grid-auto-rows:var(--cs); gap:2px; padding:8px; width:max-content; }
.tt-c { border-radius:9px; background:rgba(121,85,72,.07); position:relative; }
.tt-c > div, .tt-c svg { width:100%; height:100%; display:block; } .tt-c.last > div { animation:tt-pop .4s cubic-bezier(.3,1.5,.5,1); }
.tt-c.can { background:rgba(52,168,83,.28); outline:2px dashed var(--green); outline-offset:-2px; cursor:pointer; } .tt-c.can:hover { background:rgba(52,168,83,.5); }
.tt-c.tgt { outline:3px solid var(--red); outline-offset:-3px; cursor:pointer; animation:pulse 1s infinite; }
@keyframes tt-pop { from { transform:scale(.4) rotate(-12deg); opacity:0; } }
.tt-hint { text-align:center; font:700 14px var(--font); color:var(--on); min-height:20px; }
.tt-hand { display:flex; gap:10px; overflow-x:auto; padding:10px 6px 8px; justify-content:safe center; scrollbar-width:none; }
.tt-card { flex:none; width:78px; height:104px; border-radius:16px; padding:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; cursor:pointer; box-shadow:var(--e2); border:3px solid transparent; transition:transform .15s; position:relative; text-align:center; color:#fff; font:800 11px/1.15 var(--font); }
.tt-card .big { font-size:34px; line-height:1; } .tt-card.sel { transform:translateY(-14px) scale(1.06); border-color:var(--yellow); } .tt-card.dim { opacity:.55; }
.tt-card.path { background:var(--surface); } .tt-card.path > div { width:100%; aspect-ratio:1; }
.tt-card.brk { background:linear-gradient(145deg,#ef5350,#b71c1c); } .tt-card.fix { background:linear-gradient(145deg,#43a047,#1b5e20); } .tt-card.rock { background:linear-gradient(145deg,#8d6e63,#4e342e); } .tt-card.map { background:linear-gradient(145deg,#1e88e5,#0d47a1); }
.tt-acts { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; min-height:44px; }
.tt-end { text-align:center; display:flex; flex-direction:column; gap:10px; }
.tt-rl { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const totalRounds = +api.opts.rounds || 3;
  const root = h('div.kt.wide.tt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, cells: {}, tools: {}, hc: {}, deck: 0, turn: null, log: '', scores: {}, hand: [], role: null, known: {}, sel: null, rot: false, last: null, showRole: true, end: null, gone: [] };
  let boardScroll = null, shownLast = null;

  api.on('role', (r) => { S.role = r.role; S.known = {}; S.showRole = true; api.sfx('pop'); render(); api.timeout(() => { S.showRole = false; render(); }, 4500); });
  api.on('peek', (p) => { S.known[p.g] = p.gold ? 'gold' : 'stone'; api.toast(p.gold ? '💎 That one has the gold!' : '🪨 That one is just rocks.'); render(); });
  api.on('state', (s) => {
    const was = S.turn;
    Object.assign(S, s);
    if (s.ms !== undefined) clock.set(s.ms);
    if (!S.hand.find((c) => c.id === S.sel)) { S.sel = null; S.rot = false; }
    if (S.turn === api.me && was !== api.me && s.phase === 'play') api.sfx('ding');
    else if (s.lastSfx) api.sfx(s.lastSfx);
    render();
  });
  api.onPlayersChanged(render);

  const brokenAny = (id) => Object.values(S.tools[id] || {}).some(Boolean);
  const card = () => S.hand.find((c) => c.id === S.sel);

  function render() {
    const me = api.me, myTurn = S.turn === me && S.phase === 'play';
    if (S.phase === 'end' && S.end) return renderEnd();
    const c = card();
    const top = h('div.tt-top',
      h('div.tt-role' + (S.role === 'sab' ? '.sab' : '') + (S.showRole ? '' : '.cov'), { onclick: () => { S.showRole = !S.showRole; render(); } },
        S.showRole ? h('span.em.emo', S.role === 'sab' ? '😈' : '⛏️') : icon('visibility'),
        S.showRole ? h('div', S.role === 'sab' ? 'You are a Saboteur' : S.role ? 'You are a Gold Digger' : '…', h('small', S.role === 'sab' ? 'Stop the diggers from reaching the gold. Stay sneaky.' : 'Dig to the gold. Beware of saboteurs!')) : h('div', 'Tap to reveal your role')),
      h('span.chip.blue', `Round ${S.round}/${totalRounds}`), h('span.chip.yellow', icon('layers', 'sm'), `${S.deck} cards`), clock.el());
    // players
    const strip = h('div.tt-pl', ids.map((id) => {
      const gone = S.gone.includes(id) || api.player(id)?.left;
      const pick = c && myTurn && ((c.a === 'brk' && id !== me) || c.a === 'fix') && !gone && targetOk(c, id);
      return h('div.tt-p' + (S.turn === id && S.phase === 'play' ? '.turn' : '') + (pick ? '.pick' : '') + (gone ? '.gone' : ''), { onclick: pick ? () => playOnPlayer(id) : null },
        avatarEl({ ...api.player(id) }, 'sm', { still: S.turn !== id }),
        h('div', h('div.nm', nameOf(id) + (id === me ? ' (you)' : '')), h('div.sub', `✋${S.hc[id] ?? 0} · 💰${S.scores[id] || 0}`)),
        h('div.tt-tools', Object.keys(TOOLS).map((t) => h('div.tt-tool' + (S.tools[id]?.[t] ? '.br' : '.emo'), { title: TOOLS[t][1] }, TOOLS[t][0]))));
    }));
    // board
    const valid = c && c.t === 'p' && myTurn && !brokenAny(me) ? placements(S.cells, S.rot ? rot(c.m) : c.m) : new Set();
    const rock = c && c.a === 'rock' && myTurn;
    const grid = h('div.tt-grid');
    for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
      const k = key(r, cc), cell = S.cells[k];
      let inner = null;
      const gi = GOALS.findIndex((g) => g[0] === r && g[1] === cc);
      if (cell) {
        if (cell.k === 'goal' && !cell.rev) inner = svgEl(hiddenGoalSvg(S.known[gi]));
        else inner = svgEl(tileSvg(cell.m, cell.b, cell.k === 'start' ? 'start' : cell.k === 'goal' ? (cell.gold ? 'gold' : 'stone') : 'path'));
      }
      const isG = cell?.k === 'goal' && !cell.rev;
      const cls = 'tt-c' + (valid.has(k) ? '.can' : '') + (S.last === k ? '.last' : '') + (rock && cell?.k === 'path' ? '.tgt' : '') + (c?.a === 'map' && myTurn && isG ? '.tgt' : '');
      const d = h('div.' + cls, { onclick: () => onCell(r, cc, k, cell, gi) });
      if (inner) d.append(inner);
      grid.append(d);
    }
    const board = h('div.tt-board', grid);
    board.addEventListener('scroll', () => { boardScroll = [board.scrollLeft, board.scrollTop]; });
    requestAnimationFrame(() => {
      if (boardScroll) { board.scrollLeft = boardScroll[0]; board.scrollTop = boardScroll[1]; }
      const l = board.querySelector('.tt-c.last');
      if (l && S.last !== shownLast) {
        shownLast = S.last;
        const x = l.offsetLeft - board.clientWidth / 2 + l.offsetWidth / 2;
        board.scrollTo({ left: Math.max(0, x), behavior: 'smooth' });
      }
    });
    // hint + actions
    let hint;
    if (S.phase === 'between') hint = 'Next round starting…';
    else if (!myTurn) hint = `${nameOf(S.turn)}${S.log ? '' : ' is playing'}…`;
    else if (!c) hint = brokenAny(me) ? 'Your tools are broken — repair them to dig!' : 'Your turn — pick a card';
    else if (c.t === 'p') hint = brokenAny(me) ? 'Broken tools: you can’t dig. Repair, or discard this card.' : valid.size ? 'Tap a green spot to place the tunnel (⟳ rotates)' : 'No spot fits — rotate it, or discard';
    else if (c.a === 'brk') hint = `Tap a player to break their ${TOOLS[c.tool][1]}`;
    else if (c.a === 'fix') hint = 'Tap a player (or yourself) to repair a tool';
    else if (c.a === 'rock') hint = 'Tap a tunnel card to collapse it (not the start/goals)';
    else hint = 'Tap a ? card to secretly peek at it';
    const acts = h('div.tt-acts', c && myTurn ? [
      c.t === 'p' ? h('button.btn.tonal', { onclick: () => { S.rot = !S.rot; render(); } }, icon('rotate_right'), 'Rotate') : null,
      h('button.btn.tonal', { onclick: () => submit({ id: c.id, discard: true }) }, icon('delete'), 'Discard'),
    ] : []);
    const hand = h('div.tt-hand', S.hand.map((cd) => cardEl(cd, cd.id === S.sel, myTurn)));
    root.replaceChildren(top, strip, board, h('div.tt-hint', hint), acts, hand);
    const lg = S.log ? h('div.kt-hint', S.log) : null;
    if (lg) root.insertBefore(lg, acts);
  }

  function cardEl(cd, sel, myTurn) {
    const dim = !myTurn || (cd.t === 'p' && brokenAny(api.me));
    const click = () => { if (!myTurn) return; S.sel = S.sel === cd.id ? null : cd.id; S.rot = false; render(); };
    if (cd.t === 'p') {
      const m = sel && S.rot ? rot(cd.m) : cd.m;
      const el = h('div.tt-card.path' + (sel ? '.sel' : '') + (dim ? '.dim' : ''), { onclick: click }, svgEl(tileSvg(m, cd.b, 'path'), ''));
      el.append(h('span', { style: 'color:var(--on3)' }, cd.b ? 'dead end' : 'tunnel'));
      return el;
    }
    const [cls, em, label] = cd.a === 'brk' ? ['brk', TOOLS[cd.tool][0], `Break ${TOOLS[cd.tool][1]}`] : cd.a === 'fix' ? ['fix', cd.tools.map((t) => TOOLS[t][0]).join(''), `Repair ${cd.tools.map((t) => TOOLS[t][1]).join(' / ')}`] : cd.a === 'rock' ? ['rock', '🌋', 'Rockfall'] : ['map', '🗺️', 'Peek at a goal'];
    return h('div.tt-card.' + cls + (sel ? '.sel' : '') + (!myTurn ? '.dim' : ''), { onclick: click }, h('div.big.emo', em), label);
  }

  const targetOk = (c, id) => c.a === 'brk' ? !S.tools[id]?.[c.tool] : c.tools.some((t) => S.tools[id]?.[t]);
  function playOnPlayer(id) { const c = card(); if (!c) return; if (!targetOk(c, id)) return api.toast(c.a === 'brk' ? 'That tool is already broken' : 'Nothing to repair there'); submit({ id: c.id, target: id, tool: c.a === 'fix' ? c.tools.find((t) => S.tools[id]?.[t]) : c.tool }); }
  function onCell(r, c, k, cell, gi) {
    const cd = card();
    if (!cd || S.turn !== api.me || S.phase !== 'play') return;
    if (cd.t === 'p') { if (brokenAny(api.me)) return api.toast('Repair your tools first'); const m = S.rot ? rot(cd.m) : cd.m; if (canPlace(S.cells, m, r, c)) submit({ id: cd.id, rot: S.rot, r, c }); }
    else if (cd.a === 'rock' && cell?.k === 'path') submit({ id: cd.id, r, c });
    else if (cd.a === 'map' && cell?.k === 'goal' && !cell.rev) submit({ id: cd.id, g: gi });
  }
  function submit(m) { S.sel = null; S.rot = false; api.toHost('play', m); render(); }

  function renderEnd() {
    const e = S.end;
    const board = h('div.tt-board', h('div.tt-grid', (() => { const out = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const cell = S.cells[key(r, c)]; const d = h('div.tt-c'); if (cell) d.append(svgEl(cell.k === 'goal' && !cell.rev ? hiddenGoalSvg() : tileSvg(cell.m, cell.b, cell.k === 'start' ? 'start' : cell.k === 'goal' ? (cell.gold ? 'gold' : 'stone') : 'path'))); out.push(d); } return out; })()));
    root.replaceChildren(
      h('div.kt-prompt', { style: `--pc:${e.win === 'dig' ? '#f9a825' : '#5e35b1'}` }, h('small', `Round ${S.round} over`), e.win === 'dig' ? `⛏️ The diggers found the gold!` : `😈 The saboteurs win — the gold is lost!`),
      h('div.kt-card', h('div.kt-title', 'Secret roles'), h('div.tt-rl', ids.map((id) => h('div.kt-pill', avatarEl(api.player(id), 'sm', { still: true }), nameOf(id), h('span.emo', e.roles[id] === 'sab' ? '😈' : '⛏️'), e.gain[id] ? h('b', '+' + e.gain[id]) : null)))),
      board, h('div.kt-hint', S.round < totalRounds ? 'Next round starting soon…' : 'Final scores coming up…'));
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, deck: [], hands: {}, roles: {}, tools: {}, cells: {}, goals: [], turn: 0, phase: 'wait', log: '', timer: 0, scores: {}, nid: 0, lastKey: null, gone: [] };
    ids.forEach((i) => (H.scores[i] = 0));
    api.cleanup(() => clearTimeout(H.timer));
    const mkDeck = () => {
      const d = [];
      const id = () => 'c' + H.nid++;
      for (const [m, n] of OPEN) for (let i = 0; i < n; i++) d.push({ id: id(), t: 'p', m: bits(m), b: false });
      for (const m of DEAD) d.push({ id: id(), t: 'p', m: bits(m), b: true });
      for (const t of Object.keys(TOOLS)) {
        for (let i = 0; i < 3; i++) d.push({ id: id(), t: 'a', a: 'brk', tool: t });
        for (let i = 0; i < 2; i++) d.push({ id: id(), t: 'a', a: 'fix', tools: [t] });
      }
      d.push({ id: id(), t: 'a', a: 'fix', tools: ['pick', 'lamp'] }, { id: id(), t: 'a', a: 'fix', tools: ['pick', 'cart'] }, { id: id(), t: 'a', a: 'fix', tools: ['lamp', 'cart'] });
      for (let i = 0; i < 3; i++) d.push({ id: id(), t: 'a', a: 'rock' });
      for (let i = 0; i < 6; i++) d.push({ id: id(), t: 'a', a: 'map' });
      return rng.shuffle(d);
    };
    const active = () => ids.filter((i) => !api.player(i).left);
    const pub = (extra = {}) => {
      const pubCells = H.cells;
      const base = { phase: H.phase, round: H.round, cells: pubCells, tools: H.tools, hc: Object.fromEntries(ids.map((i) => [i, (H.hands[i] || []).length])), deck: H.deck.length, turn: ids[H.turn], log: H.log, scores: H.scores, last: H.lastKey, gone: ids.filter((i) => api.player(i).left), ms: H.phase === 'play' ? 60000 : 0, ...extra };
      ids.forEach((id) => { if (!api.player(id).left) api.sendTo(id, 'state', { ...base, hand: H.hands[id] || [] }); });
    };
    function newRound() {
      H.round++;
      H.deck = mkDeck();
      H.cells = { [key(...START)]: { k: 'start', m: 15, b: false } };
      const gold = rng.int(3);
      H.goals = GOALS.map(([r, c], i) => ({ r, c, gold: i === gold, rev: false }));
      GOALS.forEach(([r, c]) => (H.cells[key(r, c)] = { k: 'goal', rev: false }));
      const sab = { 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 }[N] || 1;
      const pile = rng.shuffle([...Array(sab).fill('sab'), ...Array(N + 1 - sab).fill('dig')]);
      const per = N <= 5 ? 6 : N <= 7 ? 5 : 4;
      ids.forEach((id, i) => { H.roles[id] = pile[i]; H.tools[id] = { pick: false, lamp: false, cart: false }; H.hands[id] = H.deck.splice(0, per); });
      H.turn = rng.int(N);
      while (api.player(ids[H.turn]).left) H.turn = (H.turn + 1) % N;
      H.log = ''; H.phase = 'play'; H.lastKey = null;
      ids.forEach((id) => api.sendTo(id, 'role', { role: H.roles[id] }));
      pub();
      arm();
    }
    function arm() {
      clearTimeout(H.timer);
      H.timer = setTimeout(() => {
        const id = ids[H.turn], hand = H.hands[id];
        if (H.phase !== 'play' || !hand?.length) return;
        H.log = `${nameOf(id)} ran out of time and discarded.`;
        hand.splice(rng.int(hand.length), 1);
        afterTurn(id);
      }, 61000);
    }
    function settle(finisher) {
      for (;;) {
        const rs = reach(H.cells);
        let changed = false;
        for (const g of H.goals) {
          if (g.rev) continue;
          for (const [bit, dr, dc, opp] of DIRS) {
            const v = H.cells[key(g.r + dr, g.c + dc)];
            if (!v || v.m === undefined || v.b || !rs.has(key(g.r + dr, g.c + dc)) || !(v.m & opp)) continue;
            g.rev = true; changed = true;
            let m = 15;
            if (!g.gold) { let ex = g.r < 4 ? 4 : 1; if (ex === bit) ex = ex === 4 ? 1 : 4; m = bit | ex; }
            H.cells[key(g.r, g.c)] = { k: 'goal', rev: true, gold: g.gold, m, b: false };
            if (g.gold) return finisher;
            break;
          }
          if (changed) break;
        }
        if (!changed) return null;
      }
    }
    api.on('play', (m, from) => {
      if (H.phase !== 'play' || ids[H.turn] !== from) return;
      const hand = H.hands[from];
      const i = hand.findIndex((c) => c.id === m.id);
      if (i < 0) return;
      const cd = hand[i];
      let log = '', sfx = 'pop', fin = null;
      const broke = (id) => Object.values(H.tools[id]).some(Boolean);
      if (m.discard) log = `${nameOf(from)} discards a card.`;
      else if (cd.t === 'p') {
        if (broke(from)) return;
        const mk = m.rot ? rot(cd.m) : cd.m;
        if (!canPlace(H.cells, mk, m.r, m.c)) return;
        H.cells[key(m.r, m.c)] = { k: 'path', m: mk, b: cd.b };
        H.lastKey = key(m.r, m.c);
        log = `${nameOf(from)} ${cd.b ? 'places a dead end' : 'digs onward'}.`;
        sfx = 'card';
        fin = settle(from);
      } else if (cd.a === 'brk') {
        if (!ids.includes(m.target) || m.target === from || H.tools[m.target][cd.tool] || api.player(m.target).left) return;
        H.tools[m.target][cd.tool] = true; log = `${nameOf(from)} breaks ${nameOf(m.target)}’s ${TOOLS[cd.tool][1]}!`; sfx = 'bad';
      } else if (cd.a === 'fix') {
        if (!ids.includes(m.target) || !cd.tools.includes(m.tool) || !H.tools[m.target][m.tool]) return;
        H.tools[m.target][m.tool] = false; log = `${nameOf(from)} repairs ${m.target === from ? 'their own' : nameOf(m.target) + '’s'} ${TOOLS[m.tool][1]}.`; sfx = 'good';
      } else if (cd.a === 'rock') {
        const cell = H.cells[key(m.r, m.c)];
        if (!cell || cell.k !== 'path') return;
        delete H.cells[key(m.r, m.c)]; log = `${nameOf(from)} causes a rockfall!`; sfx = 'boom'; H.lastKey = null;
      } else if (cd.a === 'map') {
        const g = H.goals[m.g];
        if (!g || g.rev) return;
        api.sendTo(from, 'peek', { g: m.g, gold: g.gold }); log = `${nameOf(from)} studies a map.`;
      }
      hand.splice(i, 1);
      if (fin) return endRound('dig', fin, log);
      H.lastSfx = sfx;
      afterTurn(from);
    });
    function afterTurn(from) {
      const hand = H.hands[from];
      if (H.deck.length && hand) hand.push(H.deck.pop());
      for (let k = 1; k <= N; k++) {
        const j = (H.turn + k) % N;
        if (H.hands[ids[j]].length && !api.player(ids[j]).left) { H.turn = j; pub({ lastSfx: H.lastSfx }); H.lastSfx = null; return arm(); }
      }
      endRound('sab', null, H.log);
    }
    function endRound(win, finisher, log) {
      clearTimeout(H.timer);
      const gain = {};
      const diggers = ids.filter((i) => H.roles[i] === 'dig'), sabs = ids.filter((i) => H.roles[i] === 'sab');
      if (win === 'dig') {
        const g = [];
        for (let v = 1; v <= 3; v++) for (let k = 0; k < { 1: 16, 2: 8, 3: 4 }[v]; k++) g.push(v);
        const cards = rng.shuffle(g).slice(0, N).sort((a, b) => b - a);
        const order = []; const st = Math.max(0, diggers.indexOf(finisher));
        for (let k = 0; k < diggers.length; k++) order.push(diggers[(st + k) % diggers.length]);
        let k = 0;
        while (cards.length) { const id = order[k++ % order.length]; gain[id] = (gain[id] || 0) + cards.shift(); }
      } else sabs.forEach((id) => (gain[id] = sabs.length === 1 ? 4 : sabs.length <= 3 ? 3 : 2));
      ids.forEach((id) => (H.scores[id] += gain[id] || 0));
      H.phase = 'end'; H.log = log || '';
      for (const g of H.goals) if (!g.rev) H.cells[key(g.r, g.c)] = { k: 'goal', rev: true, gold: g.gold, m: 15, b: false };
      pub({ end: { win, roles: { ...H.roles }, gain }, lastSfx: win === 'dig' ? 'win' : 'lose' });
      if (H.round >= totalRounds) H.timer = setTimeout(finish, 9000);
      else H.timer = setTimeout(newRound, 9000);
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: 'gold' }));
      const top = ranking[0].score;
      api.endGame({ title: `${ranking.map((r) => r).filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} struck it rich!`, subtitle: `${top} gold nuggets`, ranking, winners: ranking.filter((r) => r.score === top).map((r) => r.id) });
    }
    api.onRejoin((id) => { pub(); if (H.roles[id]) api.sendTo(id, 'role', { role: H.roles[id] }); });
    api.onLeave((id) => {
      if (active().length < 3) return finish();
      H.hands[id] = [];
      if (ids[H.turn] === id && H.phase === 'play') afterTurn(id); else pub();
    });
    api.timeout(newRound, 800);
  }
  render();
}
