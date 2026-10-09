// Island Settlers — a Catan-style resource and building game on a hex island. 2–4 players.
// Roll for resources, build roads, settlements and cities, trade, and race to the target score.
import { h, makeRng } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const R = 38, SQ = Math.sqrt(3);
const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const EM = { wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛰️' };
const RC = { wood: '#2e7d32', brick: '#d84315', sheep: '#7cb342', wheat: '#f9a825', ore: '#607d8b' };
const TC = { wood: '#43a047', brick: '#e2724b', sheep: '#a5d65d', wheat: '#f7d44a', ore: '#8aa0ab', desert: '#ead8b0' };
const COST = { road: { wood: 1, brick: 1 }, settle: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, dev: { sheep: 1, wheat: 1, ore: 1 } };
const PCOL = ['#e53935', '#1e88e5', '#fb8c00', '#8e24aa'];
const DEV = { knight: ['Knight', '🗡️', 'Move the robber and steal a card.'], vp: ['Victory point', '🏆', 'Worth 1 point (kept secret).'], road: ['Road building', '🛣️', 'Build 2 roads for free.'], yop: ['Year of plenty', '🎁', 'Take any 2 resources from the bank.'], mono: ['Monopoly', '💰', 'Name a resource: everyone gives you all of theirs.'] };
const zero = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
const total = (r) => RES.reduce((a, k) => a + (r[k] || 0), 0);
const can = (res, cost) => Object.entries(cost).every(([k, n]) => (res[k] || 0) >= n);
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ---------------------------------------------------------------- topology (identical on every client)
function topology() {
  const hexes = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) hexes.push({ q, r, x: R * SQ * (q + r / 2), y: R * 1.5 * r });
  const vmap = new Map(), emap = new Map(), V = [], E = [];
  const vid = (x, y) => { const k = Math.round(x * 10) + ',' + Math.round(y * 10); if (!vmap.has(k)) { vmap.set(k, V.length); V.push({ x, y, adj: [], edges: [], hexes: [] }); } return vmap.get(k); };
  hexes.forEach((hx, i) => {
    hx.v = [];
    for (let k = 0; k < 6; k++) { const a = ((60 * k - 90) * Math.PI) / 180; hx.v.push(vid(hx.x + R * Math.cos(a), hx.y + R * Math.sin(a))); }
    hx.v.forEach((v) => V[v].hexes.push(i));
    for (let k = 0; k < 6; k++) {
      const a = hx.v[k], b = hx.v[(k + 1) % 6], ek = Math.min(a, b) + ',' + Math.max(a, b);
      if (!emap.has(ek)) { emap.set(ek, E.length); E.push({ a, b, hexes: [] }); V[a].adj.push(b); V[b].adj.push(a); }
      const e = emap.get(ek);
      E[e].hexes.push(i); V[a].edges.push(e); V[b].edges.push(e);
    }
  });
  return { hexes, V, E };
}
const T = topology();

function genBoard(rng) {
  const types = rng.shuffle([...Array(4).fill('wood'), ...Array(4).fill('sheep'), ...Array(4).fill('wheat'), ...Array(3).fill('brick'), ...Array(3).fill('ore'), 'desert']);
  const adj = T.E.filter((e) => e.hexes.length === 2).map((e) => e.hexes);
  let nums;
  for (let tries = 0; tries < 80; tries++) {
    nums = rng.shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    const at = []; let k = 0;
    types.forEach((t, i) => (at[i] = t === 'desert' ? 0 : nums[k++]));
    if (!adj.some(([a, b]) => [6, 8].includes(at[a]) && [6, 8].includes(at[b]))) { nums = at; break; }
    if (tries === 79) { const at2 = []; let kk = 0; types.forEach((t, i) => (at2[i] = t === 'desert' ? 0 : nums[kk++])); nums = at2; }
  }
  const hexes = types.map((t, i) => ({ t, n: nums[i] }));
  const coast = T.E.map((e, i) => i).filter((i) => T.E[i].hexes.length === 1).sort((a, b) => ang(a) - ang(b));
  function ang(i) { const e = T.E[i], mx = (T.V[e.a].x + T.V[e.b].x) / 2, my = (T.V[e.a].y + T.V[e.b].y) / 2; return Math.atan2(my, mx); }
  const kinds = rng.shuffle(['any', 'any', 'any', 'any', ...RES]);
  const ports = [0, 3, 7, 10, 13, 17, 20, 23, 27].map((idx, i) => ({ e: coast[idx % coast.length], t: kinds[i] }));
  return { hexes, ports, desert: types.indexOf('desert') };
}

// ---------------------------------------------------------------- rules shared by host and clients
const settleFree = (b, v) => !b[v] && T.V[v].adj.every((w) => !b[w]);
function canRoad(b, r, oi, e) {
  if (r[e] !== undefined) return false;
  const { a, b: c } = T.E[e];
  return [a, c].some((v) => (b[v] && b[v][0] === oi) || (!(b[v] && b[v][0] !== oi) && T.V[v].edges.some((x) => x !== e && r[x] === oi)));
}
const canSettle = (b, r, oi, v) => settleFree(b, v) && T.V[v].edges.some((e) => r[e] === oi);
function rateFor(b, ports, oi, give) {
  let rate = 4;
  for (const p of ports) {
    const { a, b: c } = T.E[p.e];
    if ([a, c].some((v) => b[v] && b[v][0] === oi)) { if (p.t === 'any') rate = Math.min(rate, 3); else if (p.t === give) rate = Math.min(rate, 2); }
  }
  return rate;
}

const CSS = `
.is { gap:8px; max-width:720px; }
.is-pl { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scrollbar-width:none; }
.is-p { flex:1 0 auto; min-width:118px; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:6px 10px 6px 6px; display:flex; align-items:center; gap:8px; border:3px solid transparent; border-left:6px solid var(--pc); }
.is-p.turn { border-color:var(--pc); background:color-mix(in srgb, var(--pc) 12%, #fff); }
.is-p .nm { font:700 13px var(--font); max-width:78px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .is-p .st { font:600 11px var(--font); color:var(--on2); display:flex; gap:6px; flex-wrap:wrap; }
.is-p .vp { font:800 18px var(--font); color:var(--pc); }
.is-board { background:linear-gradient(160deg,#b3e5fc,#81d4fa); border-radius:26px; padding:6px; box-shadow:var(--e1); }
.is-svg { width:100%; height:auto; max-height:50dvh; display:block; touch-action:manipulation; }
.is-svg text { font-family:Outfit, 'Noto Color Emoji', sans-serif; user-select:none; pointer-events:none; }
.is-cand { fill:#fff; stroke:#00c853; stroke-width:3; cursor:pointer; transform-box:fill-box; transform-origin:center; animation:ispulse .8s infinite alternate; }
.is-cande { stroke:#00e676; stroke-width:9; stroke-linecap:round; cursor:pointer; opacity:.85; animation:isfade .8s infinite alternate; }
.is-hexpick { fill:rgba(0,0,0,.2); stroke:#fff; stroke-width:3; cursor:pointer; animation:isfade .8s infinite alternate; }
@keyframes ispulse { to { transform:scale(1.35); } } @keyframes isfade { to { opacity:.35; } }
.is-res { display:flex; gap:6px; justify-content:center; }
.is-r { width:62px; height:64px; border-radius:16px; background:var(--rc); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; font:800 22px var(--font); box-shadow:0 3px 8px color-mix(in srgb, var(--rc) 40%, transparent); position:relative; user-select:none; }
.is-r .em { font-size:20px; line-height:1; } .is-r.z { opacity:.35; } .is-r.btn2 { cursor:pointer; } .is-r.sel { outline:4px solid var(--yellow); }
.is-dock { display:flex; flex-direction:column; gap:8px; }
.is-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; }
.is-b { display:flex; flex-direction:column; align-items:center; gap:2px; border:0; background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:8px 10px; cursor:pointer; font:700 13px var(--font); color:var(--on); min-width:74px; }
.is-b small { font:600 11px var(--font); color:var(--on2); } .is-b:disabled { opacity:.45; cursor:not-allowed; } .is-b.on { background:var(--blue-c); box-shadow:0 0 0 3px var(--blue); }
.is-dice { font-size:46px; line-height:1; letter-spacing:4px; color:var(--on); }
.is-tr { background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:12px; display:flex; flex-direction:column; gap:10px; }
.is-cnt { display:flex; gap:6px; align-items:center; justify-content:center; flex-wrap:wrap; }
.is-cnt > div { display:flex; flex-direction:column; align-items:center; gap:2px; font:700 12px var(--font); }
.is-cnt .n { font:800 18px var(--font); min-width:22px; text-align:center; }
.is-offer { background:var(--yellow-c); border-radius:20px; padding:10px 14px; font:600 14px var(--font); display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:center; }
.is-dev { display:flex; gap:8px; overflow-x:auto; justify-content:center; flex-wrap:wrap; }
.is-card { width:104px; padding:8px; border-radius:16px; background:linear-gradient(145deg,#ffd54f,#ff8f00); color:#3e2723; font:700 12px/1.2 var(--font); text-align:center; cursor:pointer; box-shadow:var(--e1); } .is-card .em { font-size:26px; display:block; } .is-card.fresh { opacity:.55; } .is-card.vp { background:linear-gradient(145deg,#aed581,#558b2f); cursor:default; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const goal = +api.opts.vp || 10;
  const nameOf = (id) => api.player(id)?.name || '?';
  const board = genBoard(makeRng((api.seed ^ 0x9e3779b9) >>> 0));
  const root = h('div.kt.is');
  api.root.append(h('style', CSS), root);
  const myIdx = ids.indexOf(api.me);
  const S = { phase: 'setup', turn: 0, step: 'settle', dice: null, robber: board.desert, b: {}, r: {}, pl: ids.map(() => ({ vp: 0, nres: 0, ndev: 0, kn: 0, lr: false, la: false, roads: 0 })), offer: null, need: {}, log: '', free: 0, victims: [], longest: 0, devLeft: 25, res: zero(), dev: [], vpc: 0, mode: null, panel: null, tg: { give: null, get: null }, og: zero(), ob: zero(), dc: zero(), yop: [], last: null };

  api.on('pub', (s) => { const was = S.turn; Object.assign(S, s); if (s.phase !== 'discard') S.dc = zero(); if (s.phase === 'roll' && was !== S.turn && S.turn === myIdx) api.sfx('ding'); if (s.sfx) api.sfx(s.sfx); if (S.phase !== 'main') S.panel = S.panel === 'trade' ? null : S.panel; render(); });
  api.on('priv', (p) => { Object.assign(S, p); render(); });
  api.onPlayersChanged(render);
  const mine = () => S.turn === myIdx;
  const act = (m) => api.toHost('act', m);

  // ---------------------------------------------------------------- SVG board
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) { if (typeof v === 'function') el.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined) el.setAttribute(k, v); } kids.forEach((c) => c != null && el.append(c)); return el; };
  const hexPts = (hx) => hx.v.map((v) => `${T.V[v].x},${T.V[v].y}`).join(' ');

  function drawBoard() {
    const svg = sv('svg', { class: 'is-svg', viewBox: '-205 -192 410 384' });
    const g = sv('g');
    svg.append(g);
    // ports
    board.ports.forEach((p) => {
      const e = T.E[p.e], A = T.V[e.a], B = T.V[e.b];
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, d = Math.hypot(mx, my) || 1, px = mx + (mx / d) * 24, py = my + (my / d) * 24;
      g.append(sv('line', { x1: A.x, y1: A.y, x2: px, y2: py, stroke: '#8d6e63', 'stroke-width': 2, 'stroke-dasharray': '3 3' }), sv('line', { x1: B.x, y1: B.y, x2: px, y2: py, stroke: '#8d6e63', 'stroke-width': 2, 'stroke-dasharray': '3 3' }));
      g.append(sv('rect', { x: px - 17, y: py - 13, width: 34, height: 26, rx: 9, fill: '#fff', stroke: p.t === 'any' ? '#90a4ae' : RC[p.t], 'stroke-width': 2.5 }));
      g.append(sv('text', { x: px, y: py - 1, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: '#37474f' }, p.t === 'any' ? '3:1' : '2:1'));
      g.append(sv('text', { x: px, y: py + 10, 'text-anchor': 'middle', 'font-size': 10 }, p.t === 'any' ? '❓' : EM[p.t]));
    });
    // hexes
    const pickHex = mine() && S.phase === 'robber';
    T.hexes.forEach((hx, i) => {
      const bh = board.hexes[i];
      g.append(sv('polygon', { points: hexPts(hx), fill: TC[bh.t], stroke: '#fff', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
      g.append(sv('text', { x: hx.x, y: hx.y - (bh.n ? 12 : -6), 'text-anchor': 'middle', 'font-size': bh.n ? 19 : 26 }, bh.t === 'desert' ? '🏜️' : EM[bh.t]));
      if (bh.n) {
        g.append(sv('circle', { cx: hx.x, cy: hx.y + 9, r: 12, fill: '#fffaf0', stroke: '#d7ccc8', 'stroke-width': 1.5 }));
        g.append(sv('text', { x: hx.x, y: hx.y + 14, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: bh.n === 6 || bh.n === 8 ? '#d32f2f' : '#37474f' }, bh.n));
      }
      if (S.robber === i) {
        g.append(sv('circle', { cx: hx.x + 14, cy: hx.y - 14, r: 12, fill: '#263238', opacity: 0.9 }), sv('text', { x: hx.x + 14, y: hx.y - 8, 'text-anchor': 'middle', 'font-size': 15 }, '🥷'));
      }
      if (pickHex && S.robber !== i) g.append(sv('polygon', { points: hexPts(hx), class: 'is-hexpick', onclick: () => act({ k: 'robber', hex: i }) }));
    });
    // roads
    for (const [e, o] of Object.entries(S.r)) {
      const { a, b } = T.E[e], A = T.V[a], B = T.V[b];
      g.append(sv('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: '#fff', 'stroke-width': 12, 'stroke-linecap': 'round' }), sv('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: PCOL[o], 'stroke-width': 8, 'stroke-linecap': 'round' }));
    }
    // candidates
    const me = myIdx;
    if (mine()) {
      if (S.phase === 'setup' && S.step === 'settle') T.V.forEach((v, i) => { if (settleFree(S.b, i)) cand(g, v, i); });
      else if (S.phase === 'setup' && S.step === 'road') T.E.forEach((e, i) => { if (S.r[i] === undefined && (e.a === S.last || e.b === S.last)) candE(g, e, i); });
      else if (S.phase === 'main' && (S.mode === 'road' || S.free > 0)) T.E.forEach((e, i) => { if (canRoad(S.b, S.r, me, i)) candE(g, e, i); });
      else if (S.phase === 'main' && S.mode === 'settle') T.V.forEach((v, i) => { if (canSettle(S.b, S.r, me, i)) cand(g, v, i); });
      else if (S.phase === 'main' && S.mode === 'city') T.V.forEach((v, i) => { if (S.b[i] && S.b[i][0] === me && S.b[i][1] === 'S') cand(g, v, i); });
    }
    // buildings
    for (const [v, [o, t]] of Object.entries(S.b)) {
      const { x, y } = T.V[v];
      const pts = t === 'S' ? '-8,7 -8,-2 0,-10 8,-2 8,7' : '-12,8 -12,-3 -4,-3 -4,-9 2,-14 8,-9 8,-3 12,-3 12,8';
      g.append(sv('polygon', { points: pts, transform: `translate(${x} ${y}) scale(1.25)`, fill: PCOL[o], stroke: '#fff', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    }
    return svg;
    function cand(gg, v, i) { gg.append(sv('circle', { cx: v.x, cy: v.y, r: 8, class: 'is-cand', onclick: () => placeAt('v', i) })); }
    function candE(gg, e, i) { const A = T.V[e.a], B = T.V[e.b]; gg.append(sv('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'is-cande', onclick: () => placeAt('e', i) })); }
  }

  function placeAt(kind, i) {
    if (S.phase === 'setup') return act({ k: 'setup', at: i });
    if (S.free > 0) return act({ k: 'build', t: 'road', at: i });
    const t = S.mode;
    S.mode = null;
    act({ k: 'build', t, at: i });
  }

  // ---------------------------------------------------------------- UI
  const cnt = (obj, key, set, max) => h('div.is-cnt', RES.map((r) => h('div', h('span.emo', EM[r]), h('div', { style: 'display:flex;align-items:center;gap:4px' },
    h('button.iconbtn', { style: 'width:28px;height:28px', onclick: () => { obj[r] = Math.max(0, obj[r] - 1); render(); } }, icon('remove', 'sm')),
    h('span.n', obj[r]),
    h('button.iconbtn', { style: 'width:28px;height:28px', onclick: () => { if (max === undefined || obj[r] < (max[r] ?? 99)) obj[r]++; render(); } }, icon('add', 'sm'))))));
  const resStr = (r) => RES.filter((k) => r[k]).map((k) => `${r[k]}${EM[k]}`).join(' ') || '–';

  function render() {
    const me = myIdx, myTurn = mine();
    const pls = h('div.is-pl', ids.map((id, i) => {
      const p = S.pl[i];
      return h('div.is-p' + (S.turn === i && S.phase !== 'end' ? '.turn' : ''), { style: `--pc:${PCOL[i]}` },
        avatarEl(api.player(id), 'sm', { still: S.turn !== i }),
        h('div', h('div.nm', nameOf(id) + (i === me ? ' (you)' : '')), h('div.st', h('span', '🃏' + p.nres), h('span', '🎴' + p.ndev), p.kn ? h('span', '🗡️' + p.kn) : null, p.lr ? h('span', '🛣️') : null, p.la ? h('span', '⚔️') : null)),
        h('div.vp', i === me ? p.vp + (S.vpc || 0) : p.vp));
    }));
    const board$ = h('div.is-board', drawBoard());
    const res = h('div.is-res', RES.map((r) => h('div.is-r' + (S.res[r] ? '' : '.z'), { style: `--rc:${RC[r]}` }, h('span.em.emo', EM[r]), S.res[r] || 0)));
    const dock = h('div.is-dock');
    // status line
    let hint = '';
    if (S.phase === 'setup') hint = myTurn ? (S.step === 'settle' ? 'Place a settlement on any green spot' : 'Now place a road next to it') : `${nameOf(ids[S.turn])} is placing a ${S.step === 'settle' ? 'settlement' : 'road'}…`;
    else if (S.phase === 'roll') hint = myTurn ? 'Your turn — roll the dice!' : `${nameOf(ids[S.turn])} is about to roll…`;
    else if (S.phase === 'discard') hint = S.need[api.me] ? `A 7 was rolled — discard ${S.need[api.me]} cards` : 'Players with more than 7 cards must discard half…';
    else if (S.phase === 'robber') hint = myTurn ? 'Move the robber — tap a hex' : `${nameOf(ids[S.turn])} is moving the robber…`;
    else if (S.phase === 'steal') hint = myTurn ? 'Choose who to steal from' : `${nameOf(ids[S.turn])} is stealing…`;
    else if (S.phase === 'main') hint = myTurn ? (S.free > 0 ? `Road Building — place ${S.free} free road${S.free > 1 ? 's' : ''}` : S.mode ? `Tap a highlighted spot to build a ${S.mode === 'settle' ? 'settlement' : S.mode}` : 'Build, trade, or end your turn') : `${nameOf(ids[S.turn])}’s turn`;
    dock.append(h('div.kt-hint', { style: 'font-weight:700;color:var(--on)' }, hint));
    if (S.log) dock.append(h('div.kt-hint', S.log));
    if (S.dice) dock.append(h('div.is-dice', { style: 'text-align:center' }, FACES[S.dice[0] - 1] + FACES[S.dice[1] - 1], h('span', { style: 'font:800 20px var(--font);margin-left:8px' }, '= ' + (S.dice[0] + S.dice[1]))));
    // offers
    if (S.offer && S.phase === 'main') {
      const o = S.offer;
      if (o.from === me) dock.append(h('div.is-offer', `You offer ${resStr(o.give)} for ${resStr(o.get)}`, h('button.btn.ghost', { onclick: () => act({ k: 'cancel' }) }, 'Cancel')));
      else dock.append(h('div.is-offer', `${nameOf(ids[o.from])} offers ${resStr(o.give)} for your ${resStr(o.get)}`, h('button.btn.good', { disabled: !can(S.res, o.get), onclick: () => act({ k: 'accept' }) }, 'Accept')));
    }
    if (S.phase === 'roll' && myTurn) dock.append(h('button.btn.primary.big.block', { onclick: () => act({ k: 'roll' }) }, icon('casino'), 'Roll dice'));
    if (S.phase === 'discard' && S.need[api.me]) {
      const n = total(S.dc), need = S.need[api.me];
      dock.append(h('div.is-tr', h('div.kt-title', `Select ${need} cards to discard (${n}/${need})`), cnt(S.dc, 'dc', null, S.res), h('button.btn.primary', { disabled: n !== need, onclick: () => act({ k: 'discard', res: { ...S.dc } }) }, 'Discard')));
    }
    if (S.phase === 'steal' && myTurn) dock.append(h('div.is-row', S.victims.map((v) => h('button.btn.tonal', { onclick: () => act({ k: 'steal', victim: v }) }, avatarEl(api.player(ids[v]), 'sm', { still: true }), nameOf(ids[v])))));
    if (S.phase === 'main' && myTurn) {
      if (S.panel === 'yop') dock.append(h('div.is-tr', h('div.kt-title', `Year of Plenty — pick 2 resources (${S.yop.length}/2)`), h('div.is-res', RES.map((r) => h('div.is-r.btn2', { style: `--rc:${RC[r]}`, onclick: () => { S.yop.push(r); if (S.yop.length === 2) { act({ k: 'dev', d: 'yop', a: S.yop[0], b: S.yop[1] }); S.yop = []; S.panel = null; } render(); } }, h('span.em.emo', EM[r]))))));
      else if (S.panel === 'mono') dock.append(h('div.is-tr', h('div.kt-title', 'Monopoly — pick a resource to collect'), h('div.is-res', RES.map((r) => h('div.is-r.btn2', { style: `--rc:${RC[r]}`, onclick: () => { act({ k: 'dev', d: 'mono', a: r }); S.panel = null; render(); } }, h('span.em.emo', EM[r]))))));
      else {
        if (S.free === 0) {
          const bt = (t, label, em) => h('button.is-b' + (S.mode === t ? '.on' : ''), { disabled: !can(S.res, COST[t]), onclick: () => { S.mode = S.mode === t ? null : t; S.panel = null; render(); } }, h('span.emo', { style: 'font-size:22px' }, em), label, h('small', Object.entries(COST[t]).map(([k, n]) => n + EM[k]).join('')));
          dock.append(h('div.is-row', bt('road', 'Road', '🛣️'), bt('settle', 'Settlement', '🏠'), bt('city', 'City', '🏙️'),
            h('button.is-b', { disabled: !can(S.res, COST.dev) || S.devLeft < 1, onclick: () => act({ k: 'buyDev' }) }, h('span.emo', { style: 'font-size:22px' }, '🎴'), 'Dev card', h('small', '1🐑1🌾1⛰️ · ' + S.devLeft + ' left')),
            h('button.is-b' + (S.panel === 'trade' ? '.on' : ''), { onclick: () => { S.panel = S.panel === 'trade' ? null : 'trade'; S.mode = null; render(); } }, icon('swap_horiz'), 'Trade', h('small', 'bank / players'))));
          if (S.panel === 'trade') dock.append(tradePanel());
          dock.append(h('button.btn.primary.block', { onclick: () => { S.mode = null; act({ k: 'end' }); } }, icon('skip_next'), 'End turn'));
        }
      }
    }
    // dev cards
    if (S.dev.length) {
      dock.append(h('div.kt-title', { style: 'text-align:center' }, 'Your development cards'), h('div.is-dev', S.dev.map((d) => {
        const [nm, em, desc] = DEV[d.k];
        const playable = d.k !== 'vp' && !d.fresh && myTurn && !S.devPlayed && ((S.phase === 'main' && S.free === 0) || (S.phase === 'roll' && d.k === 'knight'));
        return h('div.is-card' + (d.fresh ? '.fresh' : '') + (d.k === 'vp' ? '.vp' : ''), { title: desc, onclick: () => { if (!playable) return api.toast(d.k === 'vp' ? 'Victory point cards count automatically.' : d.fresh ? 'You can’t play a card the turn you buy it.' : myTurn ? (S.devPlayed ? 'Only one development card per turn.' : 'Not now.') : 'Wait for your turn.'); if (d.k === 'yop') { S.panel = 'yop'; S.yop = []; render(); } else if (d.k === 'mono') { S.panel = 'mono'; render(); } else act({ k: 'dev', d: d.k }); } }, h('span.em.emo', em), nm, h('div', { style: 'font-weight:500;font-size:10px;margin-top:2px' }, d.fresh ? '(new)' : desc));
      })));
    }
    root.replaceChildren(pls, board$, res, dock);
  }

  function tradePanel() {
    const T_ = S.tg;
    const rate = T_.give ? rateFor(S.b, board.ports, myIdx, T_.give) : 4;
    const okBank = T_.give && T_.get && T_.give !== T_.get && S.res[T_.give] >= rate;
    const pick = (key) => h('div.is-res', RES.map((r) => h('div.is-r.btn2' + (T_[key] === r ? '.sel' : ''), { style: `--rc:${RC[r]}`, onclick: () => { T_[key] = T_[key] === r ? null : r; render(); } }, h('span.em.emo', EM[r]))));
    return h('div.is-tr',
      h('div.kt-title', 'Trade with the bank'), h('div.kt-hint', 'Give'), pick('give'), h('div.kt-hint', 'Get'), pick('get'),
      h('button.btn.tonal', { disabled: !okBank, onclick: () => { act({ k: 'bank', give: T_.give, get: T_.get }); S.tg = { give: null, get: null }; } }, icon('swap_horiz'), T_.give ? `Trade ${rate}${EM[T_.give]} → 1${T_.get ? EM[T_.get] : '?'}` : 'Pick resources'),
      h('div.kt-title', 'Offer to players'), h('div.kt-hint', 'You give'), cnt(S.og, 'og', null, S.res), h('div.kt-hint', 'You want'), cnt(S.ob, 'ob', null),
      h('button.btn.primary', { disabled: !total(S.og) || !total(S.ob) || !can(S.res, S.og), onclick: () => { act({ k: 'offer', give: { ...S.og }, get: { ...S.ob } }); S.og = zero(); S.ob = zero(); S.panel = null; render(); } }, icon('handshake'), 'Offer to everyone'));
  }

  // ---------------------------------------------------------------- host
  if (api.isHost) {
    const rng = api.rng;
    const P = ids.map((id) => ({ id, res: zero(), dev: [], vpc: 0, kn: 0 }));
    const H = { b: {}, r: {}, robber: board.desert, phase: 'setup', turn: 0, step: 'settle', last: null, seq: [...ids.keys(), ...[...ids.keys()].reverse()], si: 0, dice: null, need: {}, victims: [], offer: null, free: 0, devPlayed: false, after: 'main', lr: -1, lrLen: 0, la: -1, log: '', deck: rng.shuffle([...Array(14).fill('knight'), ...Array(5).fill('vp'), 'road', 'road', 'yop', 'yop', 'mono', 'mono']), timer: 0, sfx: null };
    api.cleanup(() => clearTimeout(H.timer));
    const left = (i) => api.player(ids[i]).left;
    const piece = (i, t) => Object.values(H.b).filter(([o, k]) => o === i && k === t).length;
    const roads = (i) => Object.values(H.r).filter((o) => o === i).length;
    const vpPub = (i) => piece(i, 'S') + 2 * piece(i, 'C') + (H.lr === i ? 2 : 0) + (H.la === i ? 2 : 0);
    const vpAll = (i) => vpPub(i) + P[i].vpc;

    function longestFor(oi) {
      const es = Object.keys(H.r).filter((e) => H.r[e] === oi).map(Number);
      if (!es.length) return 0;
      const byV = new Map();
      es.forEach((e) => [T.E[e].a, T.E[e].b].forEach((v) => { if (!byV.has(v)) byV.set(v, []); byV.get(v).push(e); }));
      let best = 0;
      const blocked = (v) => H.b[v] && H.b[v][0] !== oi;
      const dfs = (v, used, len) => {
        best = Math.max(best, len);
        for (const e of byV.get(v) || []) {
          if (used.has(e)) continue;
          const w = T.E[e].a === v ? T.E[e].b : T.E[e].a;
          used.add(e);
          if (blocked(w)) best = Math.max(best, len + 1); else dfs(w, used, len + 1);
          used.delete(e);
        }
      };
      for (const v of byV.keys()) dfs(v, new Set(), 0);
      return best;
    }
    function updateRecords() {
      const lens = ids.map((_, i) => longestFor(i));
      const max = Math.max(...lens);
      if (!(H.lr >= 0 && lens[H.lr] >= 5 && lens[H.lr] === max)) {
        const top = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
        H.lr = max >= 5 && top.length === 1 ? top[0] : -1;
      }
      H.lens = lens;
      H.lrLen = H.lr >= 0 ? lens[H.lr] : 0;
      const most = Math.max(...P.map((p) => p.kn));
      if (most >= 3 && (H.la < 0 || P[H.la].kn < most)) H.la = P.findIndex((p) => p.kn === most);
    }
    const pub = () => {
      updateRecords();
      const pl = P.map((p, i) => ({ vp: vpPub(i), nres: total(p.res), ndev: p.dev.length, kn: p.kn, lr: H.lr === i, la: H.la === i }));
      const base = { phase: H.phase, turn: H.turn, step: H.step, last: H.last, dice: H.dice, robber: H.robber, b: H.b, r: H.r, pl, offer: H.offer, need: H.need, log: H.log, free: H.free, victims: H.victims, devLeft: H.deck.length, devPlayed: H.devPlayed, sfx: H.sfx };
      H.sfx = null;
      ids.forEach((id, i) => { if (!left(i)) { api.sendTo(id, 'pub', base); api.sendTo(id, 'priv', { res: { ...P[i].res }, dev: P[i].dev.map((d) => ({ k: d.k, fresh: d.fresh })), vpc: P[i].vpc }); } });
    };
    const give = (i, r, n = 1) => (P[i].res[r] += n);
    const pay = (i, cost) => Object.entries(cost).forEach(([k, n]) => (P[i].res[k] -= n));
    const checkWin = (i) => { if (vpAll(i) >= goal) { finish(i); return true; } return false; };

    function nextTurn() {
      H.offer = null; H.free = 0; H.devPlayed = false;
      P[H.turn].dev.forEach((d) => (d.fresh = false));
      let t = H.turn;
      for (let k = 0; k < N; k++) { t = (t + 1) % N; if (!left(t)) break; }
      H.turn = t; H.phase = 'roll'; H.dice = null; H.log = '';
    }
    api.on('act', (m, from) => {
      const me = ids.indexOf(from);
      if (me < 0) return;
      const mineTurn = me === H.turn;
      switch (m.k) {
        case 'setup': {
          if (H.phase !== 'setup' || !mineTurn) return;
          if (H.step === 'settle') {
            if (!(m.at >= 0 && m.at < T.V.length) || !settleFree(H.b, m.at)) return;
            H.b[m.at] = [me, 'S']; H.last = m.at; H.step = 'road'; H.sfx = 'pop';
            if (H.si >= N) T.V[m.at].hexes.forEach((hi) => { const t = board.hexes[hi].t; if (t !== 'desert') give(me, t); });
          } else {
            const e = T.E[m.at];
            if (!e || H.r[m.at] !== undefined || (e.a !== H.last && e.b !== H.last)) return;
            H.r[m.at] = me; H.sfx = 'pop'; H.si++;
            if (H.si >= 2 * N) { H.phase = 'roll'; H.turn = ids.findIndex((_, i) => !left(i)); H.step = ''; H.log = 'Setup complete — let the game begin!'; }
            else { H.turn = H.seq[H.si]; H.step = 'settle'; }
          }
          return pub();
        }
        case 'roll': {
          if (H.phase !== 'roll' || !mineTurn) return;
          H.dice = [rng.int(6) + 1, rng.int(6) + 1];
          const s = H.dice[0] + H.dice[1];
          H.log = `${nameOf(from)} rolled ${s}.`;
          H.sfx = 'dice';
          if (s === 7) {
            H.need = {};
            P.forEach((p, i) => { const n = total(p.res); if (n > 7 && !left(i)) H.need[ids[i]] = Math.floor(n / 2); });
            H.after = 'main';
            if (Object.keys(H.need).length) { H.phase = 'discard'; clearTimeout(H.timer); H.timer = setTimeout(autoDiscard, 45000); } else H.phase = 'robber';
          } else {
            const got = P.map(() => zero());
            board.hexes.forEach((bh, hi) => {
              if (bh.n !== s || H.robber === hi) return;
              T.hexes[hi].v.forEach((v) => { if (H.b[v]) got[H.b[v][0]][bh.t] += H.b[v][1] === 'C' ? 2 : 1; });
            });
            got.forEach((g, i) => RES.forEach((r) => give(i, r, g[r])));
            const parts = got.map((g, i) => (total(g) ? `${nameOf(ids[i])} +${resStr(g)}` : '')).filter(Boolean);
            H.log += parts.length ? ' ' + parts.join(' · ') : ' Nobody gets anything.';
            H.phase = 'main';
          }
          return pub();
        }
        case 'discard': {
          if (H.phase !== 'discard' || !H.need[from]) return;
          const d = m.res || {};
          if (total(d) !== H.need[from] || !RES.every((r) => (d[r] || 0) >= 0 && (d[r] || 0) <= P[me].res[r])) return;
          RES.forEach((r) => (P[me].res[r] -= d[r] || 0));
          delete H.need[from];
          H.log = `${nameOf(from)} discards ${total(d)} cards.`;
          if (!Object.keys(H.need).length) { clearTimeout(H.timer); H.phase = 'robber'; }
          return pub();
        }
        case 'robber': {
          if (H.phase !== 'robber' || !mineTurn || !(m.hex >= 0 && m.hex < 19) || m.hex === H.robber) return;
          H.robber = m.hex;
          const victims = [...new Set(T.hexes[m.hex].v.map((v) => H.b[v]?.[0]).filter((o) => o !== undefined && o !== me && total(P[o].res) > 0))];
          if (!victims.length) { H.phase = H.after; H.log = `${nameOf(from)} moves the robber.`; }
          else if (victims.length === 1) steal(me, victims[0]);
          else { H.victims = victims; H.phase = 'steal'; }
          return pub();
        }
        case 'steal': {
          if (H.phase !== 'steal' || !mineTurn || !H.victims.includes(m.victim)) return;
          steal(me, m.victim);
          return pub();
        }
        case 'build': {
          if (H.phase !== 'main' || !mineTurn) return;
          const at = m.at;
          if (m.t === 'road') {
            if (!(at >= 0 && at < T.E.length) || !canRoad(H.b, H.r, me, at) || roads(me) >= 15) return;
            if (H.free > 0) H.free--; else { if (!can(P[me].res, COST.road)) return; pay(me, COST.road); }
            H.r[at] = me; H.log = `${nameOf(from)} builds a road.`;
          } else if (m.t === 'settle') {
            if (H.free > 0 || !(at >= 0 && at < T.V.length) || !canSettle(H.b, H.r, me, at) || !can(P[me].res, COST.settle) || piece(me, 'S') >= 5) return;
            pay(me, COST.settle); H.b[at] = [me, 'S']; H.log = `${nameOf(from)} builds a settlement.`;
          } else if (m.t === 'city') {
            if (H.free > 0 || !H.b[at] || H.b[at][0] !== me || H.b[at][1] !== 'S' || !can(P[me].res, COST.city) || piece(me, 'C') >= 4) return;
            pay(me, COST.city); H.b[at] = [me, 'C']; H.log = `${nameOf(from)} upgrades to a city!`;
          } else return;
          H.sfx = 'card';
          pub();
          checkWin(me);
          return;
        }
        case 'buyDev': {
          if (H.phase !== 'main' || !mineTurn || H.free > 0 || !H.deck.length || !can(P[me].res, COST.dev)) return;
          pay(me, COST.dev);
          P[me].dev.push({ k: H.deck.pop(), fresh: true });
          H.log = `${nameOf(from)} buys a development card.`;
          pub();
          return;
        }
        case 'dev': {
          const d = P[me].dev.findIndex((c) => c.k === m.d && !c.fresh);
          if (d < 0 || !mineTurn || H.devPlayed || m.d === 'vp' || H.free > 0) return;
          if (!(H.phase === 'main' || (H.phase === 'roll' && m.d === 'knight'))) return;
          if (m.d === 'yop') { if (!RES.includes(m.a) || !RES.includes(m.b)) return; give(me, m.a); give(me, m.b); H.log = `${nameOf(from)} plays Year of Plenty.`; }
          else if (m.d === 'mono') {
            if (!RES.includes(m.a)) return;
            let n = 0;
            P.forEach((p, i) => { if (i !== me) { n += p.res[m.a]; p.res[m.a] = 0; } });
            give(me, m.a, n); H.log = `${nameOf(from)} plays Monopoly on ${EM[m.a]} and collects ${n}!`;
          } else if (m.d === 'road') { H.free = Math.min(2, 15 - roads(me)); H.log = `${nameOf(from)} plays Road Building.`; if (!T.E.some((_, e) => canRoad(H.b, H.r, me, e))) H.free = 0; }
          else if (m.d === 'knight') { P[me].kn++; H.after = H.phase; H.phase = 'robber'; H.log = `${nameOf(from)} plays a Knight!`; }
          else return;
          P[me].dev.splice(d, 1);
          H.devPlayed = true; H.sfx = 'pop';
          pub();
          return;
        }
        case 'bank': {
          if (H.phase !== 'main' || !mineTurn || H.free > 0 || !RES.includes(m.give) || !RES.includes(m.get) || m.give === m.get) return;
          const rate = rateFor(H.b, board.ports, me, m.give);
          if (P[me].res[m.give] < rate) return;
          P[me].res[m.give] -= rate; P[me].res[m.get]++;
          H.log = `${nameOf(from)} trades ${rate}${EM[m.give]} with the bank for 1${EM[m.get]}.`; H.sfx = 'pop';
          return pub();
        }
        case 'offer': {
          if (H.phase !== 'main' || !mineTurn || !m.give || !m.get) return;
          const g = zero(), w = zero();
          RES.forEach((r) => { g[r] = Math.max(0, m.give[r] | 0); w[r] = Math.max(0, m.get[r] | 0); });
          if (!total(g) || !total(w) || !can(P[me].res, g)) return;
          H.offer = { from: me, give: g, get: w }; H.log = '';
          return pub();
        }
        case 'cancel': { if (H.offer && H.offer.from === me) { H.offer = null; pub(); } return; }
        case 'accept': {
          const o = H.offer;
          if (!o || H.phase !== 'main' || o.from === me || !can(P[me].res, o.get) || !can(P[o.from].res, o.give)) return;
          RES.forEach((r) => { P[o.from].res[r] += o.get[r] - o.give[r]; P[me].res[r] += o.give[r] - o.get[r]; });
          H.log = `${nameOf(ids[o.from])} and ${nameOf(from)} trade!`; H.offer = null; H.sfx = 'good';
          return pub();
        }
        case 'end': {
          if (H.phase !== 'main' || !mineTurn || H.free > 0) return;
          nextTurn();
          return pub();
        }
        default:
      }
    });
    function steal(me, victim) {
      const pool = RES.flatMap((r) => Array(P[victim].res[r]).fill(r));
      const r = rng.pick(pool);
      P[victim].res[r]--; P[me].res[r]++;
      H.log = `${nameOf(ids[me])} steals a card from ${nameOf(ids[victim])}.`;
      H.phase = H.after; H.victims = [];
    }
    function autoDiscard() {
      if (H.phase !== 'discard') return;
      for (const [id, n] of Object.entries(H.need)) {
        const i = ids.indexOf(id);
        for (let k = 0; k < n; k++) { const pool = RES.flatMap((r) => Array(P[i].res[r]).fill(r)); if (pool.length) P[i].res[rng.pick(pool)]--; }
      }
      H.need = {}; H.phase = 'robber'; H.log = 'Time’s up — cards were discarded at random.';
      pub();
    }
    function finish(w) {
      updateRecords();
      const ranking = ids.map((id, i) => ({ id, score: vpAll(i), note: 'VP' })).sort((a, b) => b.score - a.score);
      api.endGame({ title: `${nameOf(ids[w])} rules the island!`, subtitle: `${vpAll(w)} victory points`, ranking, winners: [ids[w]] });
    }
    // random auto-play for players who leave on their turn
    function autoplay() {
      const i = H.turn;
      if (!left(i)) return;
      if (H.phase === 'setup') {
        if (H.step === 'settle') { const c = T.V.map((_, v) => v).filter((v) => settleFree(H.b, v)); H.b[rng.pick(c)] = [i, 'S']; const v = Object.keys(H.b).filter((k) => H.b[k][0] === i).map(Number).pop(); H.last = v; H.step = 'road'; if (H.si >= N) T.V[v].hexes.forEach((hi) => { const t = board.hexes[hi].t; if (t !== 'desert') give(i, t); }); }
        else { const c = T.E.map((_, e) => e).filter((e) => H.r[e] === undefined && (T.E[e].a === H.last || T.E[e].b === H.last)); H.r[rng.pick(c)] = i; H.si++; if (H.si >= 2 * N) { H.phase = 'roll'; H.turn = ids.findIndex((_, k) => !left(k)); H.step = ''; } else { H.turn = H.seq[H.si]; H.step = 'settle'; } }
        pub();
        return api.timeout(autoplay, 50);
      }
      if (H.phase === 'roll') { H.dice = [1, 2]; H.phase = 'main'; }
      if (H.phase === 'robber' || H.phase === 'steal') { H.phase = H.after; H.victims = []; }
      if (H.phase === 'discard') { autoDiscard(); return; }
      nextTurn();
      pub();
      api.timeout(autoplay, 50);
    }
    if (window.__gnDebug) window.__isl = { H, P, pub, checkWin, vpAll, T };
    api.onRejoin(() => pub());
    api.onLeave((id) => {
      const i = ids.indexOf(id);
      if (ids.filter((_, k) => !left(k)).length < 2) return finish(ids.findIndex((_, k) => !left(k)) >= 0 ? ids.findIndex((_, k) => !left(k)) : 0);
      if (H.need[id]) { delete H.need[id]; if (H.phase === 'discard' && !Object.keys(H.need).length) H.phase = 'robber'; }
      if (H.turn === i) autoplay(); else pub();
    });
    api.timeout(pub, 500);
  }
  render();
}
