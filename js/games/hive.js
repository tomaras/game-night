// Hive — a host-authoritative, boardless insect strategy game, refined by OpenAI Codex.
// Original presentation and artwork; rules logic lives in ../engines/hive-rules.js.
import { h, clamp } from '../util.js';
import { avatarEl } from '../avatar.js';
import { iconBtn, openSheet, confirmDialog } from '../ui.js';
import {
  Position, replay, K_PLACE, K_MOVE, K_PASS,
  typeOfPiece, colorOfPiece, qOf, rOf, cellOf,
} from '../engines/hive-rules.js';
import { chooseMoveAsync, stopHiveWorker } from '../engines/hive-ai.js';
import { glyphDefs, GLYPH_CSS, tileInner, tileSVG } from './hive-art.js';
import { webglAvailable } from '../table3d.js';

const LABEL = {
  Q: 'Queen Bee', S: 'Spider', B: 'Beetle', G: 'Grasshopper', A: 'Soldier Ant',
  M: 'Mosquito', L: 'Ladybug', P: 'Pillbug',
};
const SHORT_RULE = {
  Q: 'Slides one space.', S: 'Slides exactly three spaces.', B: 'Steps one space and may climb.',
  G: 'Jumps over a straight occupied line.', A: 'Slides any distance around the edge.',
  M: 'Copies adjacent insects; climbs like a Beetle.', L: 'Travels over two pieces, then down.',
  P: 'Slides one space or relocates an adjacent insect.',
};
const RULE_DETAILS = {
  Q: ['Moves exactly one space.', 'Must stay in contact with the hive.', 'Must be placed by your fourth turn.'],
  S: ['Slides exactly three spaces.', 'Cannot backtrack during the move.', 'Must obey freedom to move.'],
  B: ['Moves one space.', 'May climb onto the hive.', 'A covered piece cannot move.'],
  G: ['Jumps in a straight line.', 'Must cross at least one piece.', 'Lands in the first empty space.'],
  A: ['Slides any number of spaces.', 'Travels only around the hive edge.', 'Must obey freedom to move.'],
  M: ['Copies an adjacent insect.', 'Copies a Beetle while on top.', 'Cannot copy a Mosquito.'],
  L: ['Moves exactly three spaces.', 'First two steps are over the hive.', 'Final step lands on the ground.'],
  P: ['Slides one space.', 'May relocate a neighbouring piece.', 'Cannot move a just-moved piece.'],
};
const PIECE_SETS = {
  base: { mosquito: false, ladybug: false, pillbug: false },
  complete: { mosquito: true, ladybug: true, pillbug: true },
  mobility: { mosquito: true, ladybug: true, pillbug: false },
};
const SQ3 = Math.sqrt(3);
// Logical cell radius and rendered tile radius are intentionally identical.
// Adjacent pieces therefore touch, as physical Hive pieces do.
const STEP = 37;
const xyOf = (cell) => ({ x: STEP * SQ3 * (qOf(cell) + rOf(cell) / 2), y: STEP * 1.5 * rOf(cell) });
const cellKey = (cell) => `${qOf(cell)},${rOf(cell)}`;

const CSS = `
.hv { flex:1; min-height:0; width:100%; display:grid; grid-template-columns:190px minmax(340px,1fr) 220px; grid-template-rows:minmax(0,1fr) auto auto; grid-template-areas:"rail arena info" "rail tray info" "rail command info"; overflow:hidden; background:#100d09; color:#f7efe3; --hv-board:#442816; --hv-board2:#1f130c; }
.hv * { box-sizing:border-box; }
.hv-defs { pointer-events:none; }
${GLYPH_CSS}
.hv-rail { grid-area:rail; min-width:0; display:grid; grid-template-rows:1fr 1fr; gap:1px; padding:8px; background:#0e0c09; border-right:1px solid #6d4a22; }
.hv-player { min-width:0; min-height:0; display:flex; flex-direction:column; gap:8px; align-items:stretch; padding:10px 8px; background:#171512;color:#f7efe3;border:1px solid #5d452c; box-shadow:inset 0 0 0 1px #070605,var(--z1); z-index:4; overflow:hidden; }
.hv-player.bottom { border-color:#bc812e; }
.hv-who { min-width:0; display:flex; align-items:center; gap:7px; font:700 13px var(--font); }
.hv-who .name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hv-who small { display:block; color:#bca98c; font:600 10px var(--font); text-transform:uppercase; letter-spacing:.06em; }
.hv-player.turn { box-shadow:inset 3px 0 0 var(--m-yellow),inset 0 0 18px rgba(251,188,5,.09),var(--z1); }
.hv-danger { display:grid; grid-template-columns:repeat(6,7px); gap:4px; justify-content:start; }
.hv-danger i { width:6px; height:6px; border-radius:50%; background:var(--line2); }
.hv-danger i.on { background:var(--m-red); }
.hv-reserve { min-width:0; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); align-content:start; justify-items:center; gap:4px 0; overflow:auto; scrollbar-width:none; padding:2px; }
.hv-reserve::-webkit-scrollbar { display:none; }
.hv-rpiece { position:relative; width:42px; height:46px; border:0; padding:0; background:transparent; cursor:pointer; filter:drop-shadow(0 3px 2px rgba(0,0,0,.34)); transition:transform .16s var(--std),filter .16s; }
.hv-rpiece svg { width:42px; height:46px; display:block; }
.hv-rpiece:hover:not(:disabled),.hv-rpiece.sel { transform:translateY(-4px); filter:drop-shadow(0 6px 4px rgba(0,0,0,.23)); }
.hv-rpiece.sel { outline:none; filter:drop-shadow(0 0 7px #ffc84a) drop-shadow(0 5px 3px rgba(0,0,0,.4)); }
.hv-rpiece:disabled { cursor:default; opacity:.52; }
.hv-rpiece.empty { display:none; }
.hv-count { position:absolute; right:-1px; bottom:0; width:19px; height:19px; border-radius:50%; display:grid; place-items:center; background:var(--m-blue); color:#fff; border:2px solid var(--surface); font:800 10px var(--font); }
.hv-arena.d3 { background:#1c2216; }
.hv-arena.d3 .hv-board,.hv-arena.d3 .hv-zoom { display:none; }
.hv-arena.d3::before { box-shadow:inset 0 0 90px rgba(10,8,3,.5); }
.hv.d3 .hv-tray { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); padding:0; }
.hv.d3 .hv-bag { display:none; }
.hv-tray { grid-area:tray; display:flex; justify-content:center; padding:6px 10px 4px; background:#120f0b; min-width:0; }
.hv-trayrow { position:relative; width:min(100%, calc(var(--n) * 104px)); aspect-ratio:var(--ratio); background-size:100% 100%; background-repeat:no-repeat; filter:drop-shadow(0 4px 5px rgba(0,0,0,.55)); }
.hv-trayrow .hv-rpiece { position:absolute; top:46%; width:var(--tw); height:auto; aspect-ratio:1; transform:translate(-50%,-50%); filter:drop-shadow(0 3px 2px rgba(0,0,0,.45)); }
.hv-trayrow .hv-rpiece svg { width:100%; height:auto; }
.hv-trayrow .hv-rpiece:hover:not(:disabled),.hv-trayrow .hv-rpiece.sel { transform:translate(-50%,-62%); }
.hv-trayrow .hv-rpiece.empty { display:block; visibility:hidden; }
.hv-trayrow .hv-count { right:2%; bottom:-6%; }
.hv-bag { position:relative; width:100%; max-width:150px; margin:auto auto 0; aspect-ratio:3/2; pointer-events:none; }
.hv-bag img.bag { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; filter:drop-shadow(0 5px 5px rgba(0,0,0,.55)); }
.hv-bag .peek { position:absolute; width:34%; height:auto; aspect-ratio:1; filter:drop-shadow(0 3px 3px rgba(0,0,0,.5)); }
.hv-bag .peek.a { right:8%; top:2%; transform:rotate(14deg); }
.hv-bag .peek.b { right:27%; top:-9%; transform:rotate(-12deg); }
.hv-bag b { position:absolute; left:4%; bottom:4%; min-width:22px; height:22px; padding:0 6px; border-radius:11px; background:var(--m-blue); color:#fff; font:800 11px/22px var(--font); text-align:center; border:2px solid #120f0b; }
.hv-timg { width:100%; height:auto; aspect-ratio:1; display:block; pointer-events:none; filter:drop-shadow(0 3px 3px rgba(0,0,0,.4)); }
.hv-seg { display:flex; gap:0; margin:6px 0 14px; border:1px solid var(--line2); }
.hv-seg button { flex:1; border:0; border-right:1px solid var(--line2); background:var(--surface); color:var(--on); padding:10px 6px; font:700 13px var(--font); cursor:pointer; }
.hv-seg button:last-child { border-right:0; }
.hv-seg button.on { background:var(--blue); color:#fff; }
.hv-set small { display:block; color:var(--on2); font:500 12px/1.4 var(--font); margin:-2px 0 4px; }
.hv-arena { grid-area:arena; position:relative; min-height:0; overflow:hidden; background:var(--hv-board) url("assets/hive/walnut-table-v2.png") center/cover no-repeat; border:1px solid #25170e; touch-action:none; user-select:none; }
.hv-arena::before { content:''; position:absolute; inset:0; pointer-events:none; box-shadow:inset 0 0 70px rgba(15,8,3,.42); }
.hv-board { position:absolute; inset:0; width:100%; height:100%; overflow:visible; touch-action:none; }
.hv-world { transform-origin:0 0; }
.hv-grid polygon { fill:rgba(68,38,19,.035); stroke:rgba(40,21,11,.46); stroke-width:1.35; vector-effect:non-scaling-stroke; pointer-events:all; }
.hv-grid .major { fill:rgba(251,188,5,.018); stroke:rgba(80,42,18,.62); }
.hv-piece { cursor:default; filter:drop-shadow(3px 7px 3px rgba(0,0,0,.48)); }
.hv .t-material { pointer-events:none; }.hv .t-insect { filter:drop-shadow(1.3px 2px 1px rgba(0,0,0,.5)); }
.hv-piece.can { cursor:pointer; }
.hv-piece.can .t-face { stroke:var(--m-yellow); stroke-width:6; }
.hv-piece.sel .t-face { stroke:#fff; stroke-width:7; }
.hv-piece.last .t-face { stroke:#ffc84a; stroke-width:5; }
.hv-piece.covered { opacity:.96; }
.hv-stack { pointer-events:none; }
.hv-stack circle { fill:var(--m-purple); stroke:#fff; stroke-width:2; }
.hv-stack text { fill:#fff; font:800 11px var(--font); text-anchor:middle; dominant-baseline:middle; }
.hv-target { cursor:pointer; }
.hv-target polygon { fill:rgba(251,188,5,.28); stroke:#ffd468; stroke-width:4; stroke-dasharray:8 5; filter:drop-shadow(0 0 7px rgba(255,190,40,.95)); animation:hvPulse .9s ease-in-out infinite alternate; pointer-events:all; }
.hv-target.hint polygon { stroke:var(--m-yellow); stroke-width:7; stroke-dasharray:none; }
.hv-target.pending polygon { fill:rgba(255,196,49,.42); stroke:#fff0ae; stroke-width:6; stroke-dasharray:none; }
.hv-preview { opacity:.74; pointer-events:none; filter:drop-shadow(5px 11px 4px rgba(0,0,0,.5)); }
.hv-path { fill:none; stroke:var(--m-yellow); stroke-width:5; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:8 7; pointer-events:none; }
@keyframes hvPulse { to { stroke-width:7; opacity:.72; } }
@keyframes hvArrive { 0% { opacity:.25; transform:translateY(-20px) scale(1.18); } 70% { transform:translateY(2px) scale(.98); } 100% { opacity:1; transform:none; } }
.hv-arrive { animation:hvArrive .34s cubic-bezier(.2,.8,.2,1) both; transform-box:fill-box; transform-origin:center; }
.hv-float { position:absolute; top:10px; right:10px; display:flex; flex-direction:column; gap:7px; z-index:3; }
.hv-float .iconbtn { background:var(--surface); color:var(--on); box-shadow:var(--z2); }
.hv-zoom { position:absolute; left:10px; bottom:9px; padding:5px 9px; background:var(--surface); color:var(--on2); box-shadow:var(--z1); border-radius:2px; font:700 10px var(--font); pointer-events:none; }
.hv-command { grid-area:command; display:grid; grid-template-columns:minmax(150px,1fr) auto auto; gap:8px; align-items:center; min-height:64px; padding:7px 10px; background:#171512;color:#f7efe3;border-top:2px solid #b47b2d; z-index:4; }
.hv-status { min-width:0; }
.hv-status b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:800 14px var(--font); }
.hv-status span { display:block; color:#bca98c; font:500 12px var(--font); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hv-actions { display:flex; gap:3px; align-items:center; }
.hv-actions .iconbtn { width:40px; height:40px; }
.hv-confirm { min-width:116px; height:42px; border:1px solid #f4c562; border-radius:2px; background:#e6a72a; color:#211407; font:800 13px var(--font); box-shadow:inset 0 1px 0 #ffe7a7,0 3px 8px #0008; cursor:pointer; }
.hv-confirm:disabled { opacity:.38; cursor:default; filter:saturate(.25); }
.hv-inspector { grid-area:info; min-width:0; padding:8px; background:#0e0c09; border-left:1px solid #6d4a22; overflow:auto; }
.hv-info-card { border:1px solid #6f522f; background:#171512; box-shadow:inset 0 0 0 1px #050403; padding:10px; }
.hv-info-head { display:grid; grid-template-columns:58px 1fr; gap:8px; align-items:center; padding-bottom:8px; border-bottom:1px solid #443422; }
.hv-info-head svg { width:56px; height:61px; }
.hv-info-head small,.hv-history-title { color:#d5a64c; font:700 10px var(--font); text-transform:uppercase; letter-spacing:.08em; }
.hv-info-head h3 { margin:2px 0 0; font:800 18px Georgia,serif; }
.hv-rules { margin:9px 0 12px; padding-left:17px; color:#d8cdbd; font:500 12px/1.4 var(--font); }
.hv-rules li { margin:5px 0; }
.hv-history-title { padding:9px 0 6px; border-top:1px solid #443422; }
.hv-history { display:grid; gap:0; }
.hv-history-row { display:grid; grid-template-columns:24px 1fr; gap:5px; padding:6px 0; border-top:1px solid #2b251e; font:500 11px/1.25 var(--font); color:#c8baa7; }
.hv-history-row b { color:#8d806f; text-align:right; }
.hv-result-card { margin-bottom:8px; border:1px solid #f1b83f; padding:10px; background:#21170d; color:#ffe29a; }
.hv-result-card strong { display:block; font:800 20px Georgia,serif; }
.hv-thinking { color:var(--m-blue)!important; }
.hv-sheet { min-width:min(520px,90vw); }
.hv-sheet h3 { margin:0 0 12px; }
.hv-guide { display:grid; gap:8px; }
.hv-guide-row { display:grid; grid-template-columns:56px 90px 1fr; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); }
.hv-guide-row:last-child { border:0; }
.hv-guide-row b { color:var(--on); }
.hv-guide-row span { color:var(--on2); font-size:13px; }
.hv-log { max-height:56vh; overflow:auto; display:grid; gap:0; border:1px solid var(--line); }
.hv-log-row { display:grid; grid-template-columns:34px 1fr; gap:8px; padding:9px 10px; border-bottom:1px solid var(--line); font-size:13px; }
.hv-log-row:last-child { border:0; }
.hv-log-row b { color:var(--on3); text-align:right; }
.hv-empty { padding:20px; text-align:center; color:var(--on2); }
:root[data-theme="dark"] .hv { --hv-board:#2d1b10; --hv-board2:#100a06; }
@media (max-width:900px) {
  .hv { grid-template-columns:1fr; grid-template-rows:auto minmax(220px,1fr) auto auto auto; grid-template-areas:"top" "arena" "bottom" "tray" "command"; }
  .hv-bag { max-width:72px; margin:0 0 0 auto; }
  .hv-player.bottom { grid-template-columns:minmax(110px,auto) 1fr 76px; }
  .hv-player.bottom .hv-bag { margin-top:-6px; }
  .hv-rail { display:contents; }
  .hv-player { min-height:64px; display:grid; grid-template-columns:minmax(110px,auto) 1fr auto; gap:7px; align-items:center; padding:6px 8px; border-inline:0; overflow:visible; }
  .hv-player.top { grid-area:top; }
  .hv-player.bottom { grid-area:bottom; }
  .hv-reserve { display:flex; align-items:center; justify-content:flex-start; gap:1px; overflow-x:auto; }
  .hv-danger { grid-template-columns:repeat(3,6px); width:30px; }
  .hv-inspector { display:none; }
}
@media (max-width:480px) {
  .hv-player { grid-template-columns:112px 1fr 28px; padding-inline:7px; min-height:62px; }
  .hv-player.bottom { grid-template-columns:112px 1fr 72px; }
  .hv-who { gap:5px; font-size:11px; }
  .hv-who .avatar { transform:scale(.88); margin:-2px; }
  .hv-rpiece { width:43px; height:47px; }
  .hv-rpiece svg { width:42px; height:46px; }
  .hv-count { width:18px; height:18px; }
  .hv-danger { width:28px; }
  .hv-command { grid-template-columns:1fr auto; min-height:50px; padding:5px 7px; }
  .hv-actions { display:none; }
  .hv-confirm { min-width:100px; height:38px; }
  .hv-status b { font-size:13px; }
  .hv-actions .iconbtn { width:38px; height:38px; }
}
@media (prefers-reduced-motion:reduce) { .hv-target polygon,.hv-arrive { animation:none; } }
`;

function optionsOf(value) {
  return { ...(PIECE_SETS[value] || PIECE_SETS.complete) };
}

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const otb = !!api.opts.otb;
  const white = ids[0];
  const black = ids[1];
  const idOf = (color) => color === 0 ? white : black;
  const colorOfId = (id) => id === white ? 0 : id === black ? 1 : -1;
  const nameOf = (id) => api.player(id)?.name || 'Player';
  const myColor = colorOfId(api.me);
  const viewColor = myColor < 0 ? 0 : myColor;
  const opts = optionsOf(api.opts.pieces);

  const root = h('div.hv');
  root.insertAdjacentHTML('afterbegin', glyphDefs());
  const rail = h('div.hv-rail');
  const topBar = h('div.hv-player.top');
  const arena = h('div.hv-arena');
  const board = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  board.setAttribute('class', 'hv-board');
  board.setAttribute('role', 'application');
  board.setAttribute('aria-label', 'Hive board. Drag to pan and pinch or scroll to zoom.');
  const world = document.createElementNS(board.namespaceURI, 'g');
  world.setAttribute('class', 'hv-world');
  board.append(world);
  const floatTools = h('div.hv-float');
  const zoomLabel = h('div.hv-zoom', '100%');
  arena.append(board, floatTools, zoomLabel);
  const bottomBar = h('div.hv-player.bottom');
  const trayEl = h('div.hv-tray');
  rail.append(topBar, bottomBar);
  const inspector = h('aside.hv-inspector', { 'aria-label': 'Piece rules and move history' });
  const statusEl = h('div.hv-status');
  const actions = h('div.hv-actions');
  const confirmMove = h('button.hv-confirm', { disabled: true, onclick: () => commitPending() }, 'Confirm move');
  const command = h('div.hv-command', statusEl, actions, confirmMove);
  root.append(rail, arena, trayEl, inspector, command);
  api.root.append(h('style', CSS), root);

  // ---- 3D table (falls back to the flat SVG board if WebGL or the art cannot load)
  const PREF_KEY = 'gn.hive3d';
  const prefs = { hints: 2, rotation: 'natural', routeColors: 0 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch {}
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} };
  let view3d = null, hoverTarget = null, targetMoves = [], firstState = true, pendingAnim = null;
  if (webglAvailable() && !/[?&]flat\b/.test(location.href)) {
    import('./hive3d.js').then((m) => m.createHive3D(arena, {
      onPiece: (piece) => { const cell = pos.occ.find((c) => pos.stack(c).includes(piece)); if (cell != null) selectCell(cell); },
      onTarget: (id) => { const mv = targetMoves[id]; if (mv) stageMove(mv); },
      onCell: (q, r) => tapCell(cellOf(q, r)),
      onReserve: (type) => { const color = otb ? pos.turn : viewColor; const btn = trayEl.querySelector(`[aria-label^="${LABEL[type]},"]`); if (btn && !btn.disabled) btn.click(); },
      onEmpty: () => { if (selected || pendingMove) { selected = null; pendingMove = null; hintMove = null; render(); } },
      onHover: (id) => { hoverTarget = id; pushModel(); },
    })).then((v) => { view3d = v; arena.classList.add('d3'); root.classList.add('d3'); render(); })
      .catch((e) => console.warn('[hive] 3D table unavailable, using the flat board', e));
  }

  let S = { moves: [], logs: [], result: null, version: 0 };
  let pos = new Position(opts);
  let selected = null;
  let pendingMove = null;
  let hintMove = null;
  let hintBusy = false;
  let botBusy = false;
  let ended = false;
  let freshBoard = true;
  let lastAnimatedVersion = -1;
  const view = { w: 800, h: 520, scale: 1, x: 0, y: 0 };

  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS(board.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const canAct = () => !S.result && (otb || (myColor >= 0 && pos.turn === myColor));
  const legal = () => canAct() ? pos.legalMoves() : [];

  function worldTransform() {
    world.setAttribute('transform', `translate(${view.w / 2 + view.x} ${view.h / 2 + view.y}) scale(${view.scale})`);
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
  }

  /** A piece picture for trays and the guide: rendered by the 3D scene when it is up, drawn flat otherwise. */
  function tileArt(type, color, size) {
    if (view3d) { try { return `<img class="hv-timg" src="${view3d.thumb(type, color)}" width="${size}" height="${size}" alt="">`; } catch (e) { console.warn('[hive] thumb', e); } }
    return tileSVG(type, color === 0 ? 'w' : 'b', size);
  }
  const SHAPE_NAMES = ['circle', 'diamond', 'triangle', 'square', 'star', 'hex', 'plus', 'ring'];
  const DEST_COLORS = ['#FBBC05', '#4285F4', '#EA4335', '#34A853', '#A142F4', '#12B5CB', '#FF6D00', '#F538A0'];
  const lvl = (c) => pos.H[c];

  /** Ply at which each piece last moved, so its resting rotation changes every time it is moved or placed. */
  function plyMap(moves) {
    const p = new Position(opts), out = new Map();
    moves.forEach((j, i) => {
      const mv = p.fromJSON(j); if (!mv) return;
      const piece = mv.k === K_PLACE ? mv.p : mv.k === K_MOVE ? p.top(mv.from) : -1;
      if (piece >= 0) out.set(piece, i + 1);
      p.play(mv);
    });
    return out;
  }
  /** Path of the most recent real move, for the slide / hop / drop animation. */
  function lastMoveAnim(moves) {
    let idx = moves.length - 1;
    while (idx >= 0 && moves[idx].k === 'pass') idx--;
    if (idx < 0) return null;
    const before = replay(opts, moves.slice(0, idx));
    const mv = before.fromJSON(moves[idx]);
    if (!mv) return null;
    if (mv.k === K_PLACE) return { piece: mv.p, path: [[qOf(mv.to), rOf(mv.to), before.H[mv.to]]] };
    const cells = before.pathOf(mv);
    return { piece: before.top(mv.from), path: cells.map((c, i) => [qOf(c), rOf(c), i === 0 ? before.H[c] - 1 : before.H[c]]) };
  }

  function ghostFor(move) {
    if (!move) return null;
    const piece = move.p !== undefined ? move.p : pos.top(move.from);
    return { type: typeOfPiece(piece), color: colorOfPiece(piece), q: qOf(move.to), r: rOf(move.to), height: pos.H[move.to] };
  }

  /** Arrow segments for a set of moves: one tree, shared stretches drawn once, the final step of each route carries the head. */
  function buildArrows(moves) {
    const out = [];
    if (prefs.hints < 2) return out;
    const edges = new Map();
    moves.forEach((m, i) => {
      if (m.k !== K_MOVE) return;
      const path = pos.pathOf(m);
      for (let j = 1; j < path.length; j++) {
        const key = `${path[j - 1]}>${path[j]}`;
        const e = edges.get(key) || { a: path[j - 1], b: path[j], dests: [], final: -1 };
        e.dests.push(i); if (j === path.length - 1) e.final = i;
        edges.set(key, e);
      }
    });
    for (const e of edges.values()) {
      const colour = prefs.routeColors ? (e.final >= 0 ? DEST_COLORS[e.final % 8] : e.dests.length > 1 ? '#FFD978' : DEST_COLORS[e.dests[0] % 8]) : '#FBBC05';
      out.push({ cells: [[qOf(e.a), rOf(e.a), lvl(e.a)], [qOf(e.b), rOf(e.b), lvl(e.b)]], color: colour, head: e.final >= 0, width: 0.017, opacity: 0.96, dests: e.dests });
    }
    return out;
  }

  /** The stone whose moves are on show: the selected one, or (hints "All pieces") the one currently in the spotlight. */
  const focusPiece = () => (selected?.kind === 'board' ? pos.top(selected.cell) : prefs.hints >= 3 && spotPiece != null && !selected && !pendingMove ? spotPiece : null);
  function focusMoves() {
    if (selected) return chosenMoves();
    const fp = focusPiece();
    return fp == null ? [] : legal().filter((m) => m.k === K_MOVE && pos.top(m.from) === fp);
  }

  function pushModel(anim = null, instant = false) {
    if (!view3d) return;
    const plies = plyMap(S.moves || []);
    const tiles = [];
    for (const cell of pos.occ) pos.stack(cell).forEach((piece, level) => tiles.push({ piece, q: qOf(cell), r: rOf(cell), level, type: typeOfPiece(piece), color: colorOfPiece(piece), ply: plies.get(piece) || 0 }));
    const moves = legal();
    const fp = focusPiece();
    const chosen = focusMoves();
    targetMoves = prefs.hints >= 1 ? chosen : [];
    const pendingKey = pendingMove ? JSON.stringify(pos.toJSON(pendingMove)) : null;
    const hintKey = hintMove ? JSON.stringify(hintMove) : null;
    const targets = targetMoves.map((m, i) => {
      const key = JSON.stringify(pos.toJSON(m));
      return { id: i, q: qOf(m.to), r: rOf(m.to), height: pos.H[m.to], kind: m.k === K_PLACE ? 'place' : 'move', pending: key === pendingKey, hint: key === hintKey,
        color: m.k !== K_MOVE ? '#34A853' : prefs.routeColors ? DEST_COLORS[i % 8] : '#FBBC05', shape: prefs.routeColors ? SHAPE_NAMES[i % 8] : 'circle' };
    });
    let arrows = prefs.hints >= 2 && fp != null ? buildArrows(chosen) : [];
    if (prefs.hints >= 3 && fp != null && !selected && !pendingMove) {
      // "All pieces": every move of every stone is on the board at once; the stone in the spotlight is bright, the rest quiet
      const seen = new Set(targets.map((t) => `${t.q},${t.r},${t.height}`));
      for (const m of moves) {
        if (m.k !== K_MOVE || pos.top(m.from) === fp) continue;
        const key = `${qOf(m.to)},${rOf(m.to)},${pos.H[m.to]}`;
        if (!seen.has(key)) { seen.add(key); targets.push({ id: null, faint: true, q: qOf(m.to), r: rOf(m.to), height: pos.H[m.to], kind: 'move', color: '#FBBC05', shape: 'circle' }); }
      }
      const others = new Map();
      for (const m of moves) if (m.k === K_MOVE && pos.top(m.from) !== fp) { const p = pos.top(m.from); (others.get(p) || others.set(p, []).get(p)).push(m); }
      for (const list of others.values()) for (const a of buildArrows(list)) arrows.push({ ...a, opacity: 0.2, width: 0.012, head: a.head });
    }
    const ghostMove = pendingMove || (hoverTarget != null ? targetMoves[hoverTarget] : null);
    const last = [...(S.moves || [])].reverse().find((m) => m.to);
    const lastCell = last?.to ? cellOf(last.to[0], last.to[1]) : -1;
    view3d.update({
      tiles, targets, arrows, ghost: ghostFor(ghostMove), moveAnim: anim, instant,
      selectable: new Set(prefs.hints > 0 && canAct() ? moves.filter((m) => m.k === K_MOVE).map((m) => pos.top(m.from)) : []),
      selected: selected?.kind === 'board' ? pos.top(selected.cell) : null, focus: fp != null ? [fp] : [],
      reserve: { color: otb ? pos.turn : viewColor, items: pos.types.map((t) => ({ type: t, count: pos.handCount(otb ? pos.turn : viewColor, t), active: moves.some((m) => m.k === K_PLACE && typeOfPiece(m.p) === t), selected: selected?.kind === 'reserve' && selected.type === t })) },
      last: lastCell >= 0 ? pos.top(lastCell) : null,
      settings: { rotation: prefs.rotation }, keepView: false,
    });
  }

  // ---- "All pieces" hints: step through the movable stones one at a time, dimming the rest
  let spotPiece = null, spotTimer = null, spotList = [], spotI = 0, spotVersion = -1;
  function stopSpot() { if (spotTimer) { clearInterval(spotTimer); spotTimer = null; } if (spotPiece != null) { spotPiece = null; return true; } return false; }
  function syncSpot() {
    const want = view3d && prefs.hints >= 3 && canAct() && !selected && !pendingMove && !hintMove && !S.result && !hintBusy;
    if (!want) { if (stopSpot()) pushModel(); return; }
    const list = [...new Set(legal().filter((m) => m.k === K_MOVE).map((m) => pos.top(m.from)))];
    if (!list.length) { if (stopSpot()) pushModel(); return; }
    if (spotTimer && spotVersion === S.version) return;
    stopSpot(); spotList = list; spotI = 0; spotVersion = S.version; spotPiece = list[0];
    pushModel();
    spotTimer = setInterval(() => { if (document.hidden) return; spotI = (spotI + 1) % spotList.length; spotPiece = spotList[spotI]; pushModel(); }, 1500);
  }

  function tapCell(cell) {
    if (!canAct()) return;
    if (selected) {
      const mv = chosenMoves().find((m) => m.to === cell);
      if (mv) return stageMove(mv);
    }
    if (legal().some((m) => m.k === K_MOVE && m.from === cell)) return selectCell(cell);
    if (selected || pendingMove) { selected = null; pendingMove = null; hintMove = null; render(); }
  }

  function fitBoard() {
    if (view3d) return view3d.refit();
    if (!pos.occ.length) {
      view.scale = 1.06;
      view.x = 0;
      view.y = 0;
      worldTransform();
      return;
    }
    const cells = pos.occ.length ? pos.occ : [cellOf(0, 0)];
    const pts = cells.map(xyOf);
    const minX = Math.min(...pts.map((p) => p.x)) - 62;
    const maxX = Math.max(...pts.map((p) => p.x)) + 62;
    const minY = Math.min(...pts.map((p) => p.y)) - 64;
    const maxY = Math.max(...pts.map((p) => p.y)) + 74;
    const s = clamp(Math.min((view.w - 36) / (maxX - minX), (view.h - 34) / (maxY - minY)), .48, 1.22);
    view.scale = s;
    view.x = -((minX + maxX) / 2) * s;
    view.y = -((minY + maxY) / 2) * s;
    worldTransform();
  }

  function reserveButton(color, type, bottom) {
    const count = pos.handCount(color, type);
    const moves = legal().filter((m) => m.k === K_PLACE && typeOfPiece(m.p) === type);
    const active = moves.length > 0;
    const sel = selected?.kind === 'reserve' && selected.type === type && selected.color === color;
    const btn = h('button.hv-rpiece' + (sel ? '.sel' : '') + (!count ? '.empty' : ''), {
      disabled: !active,
      title: `${LABEL[type]} — ${SHORT_RULE[type]} ${count} left`,
      'aria-label': `${LABEL[type]}, ${count} left`,
      onclick: () => {
        if (!active) return;
        selected = sel ? null : { kind: 'reserve', type, color };
        pendingMove = null;
        hintMove = null;
        api.sfx(sel ? 'click' : 'pop', .55);
        render();
      },
    });
    btn.innerHTML = tileArt(type, color, 46) + `<span class="hv-count">${count}</span>`;
    if (!bottom) btn.tabIndex = active ? 0 : -1;
    return btn;
  }

  // ---- the reserve tray (one well per insect, built from the artwork's end caps and middle) and the bag of pieces still to come
  const trayPieces = ['tray-l', 'tray-m', 'tray-r'].map((n) => { const im = new Image(); im.src = `assets/hive3d/${n}.webp`; return im; });
  const trayLoaded = Promise.all(trayPieces.map((im) => im.decode().catch(() => null)));
  const TRAY = { L: 384, M: 280, R: 376, H: 347, CENTRE: 244 }; // artwork geometry (px): left cap, one well, right cap, height, first well centre
  const trayUrls = new Map();
  async function trayImage(n) {
    if (trayUrls.has(n)) return trayUrls.get(n);
    await trayLoaded;
    const [l, m, r] = trayPieces;
    if (!l.naturalWidth) return null;
    const W = TRAY.L + TRAY.M * (n - 2) + TRAY.R, c = document.createElement('canvas'); c.width = W; c.height = TRAY.H;
    const g = c.getContext('2d');
    const piece = (im, x, w) => { // feather the left edge so the joins vanish
      const t = document.createElement('canvas'); t.width = w; t.height = TRAY.H; const tg = t.getContext('2d');
      tg.drawImage(im, 0, 0);
      if (x > 0) { tg.globalCompositeOperation = 'destination-in'; const gr = tg.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(16 / w, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); tg.fillStyle = gr; tg.fillRect(0, 0, w, TRAY.H); }
      g.drawImage(t, x, 0);
    };
    piece(l, 0, TRAY.L);
    for (let i = 0; i < n - 2; i++) piece(m, TRAY.L + TRAY.M * i, TRAY.M);
    piece(r, TRAY.L + TRAY.M * (n - 2), TRAY.R);
    const url = c.toDataURL('image/webp', 0.92);
    trayUrls.set(n, url); return url;
  }
  function renderTray(color) {
    const types = pos.types, n = Math.max(2, types.length);
    const W = TRAY.L + TRAY.M * (n - 2) + TRAY.R;
    const row = h('div.hv-trayrow', { style: `--n:${n};--ratio:${W}/${TRAY.H};--tw:${(TRAY.M * 0.84 / W * 100).toFixed(2)}%`, 'aria-label': 'Your reserve' });
    types.forEach((t, i) => { const b = reserveButton(color, t, true); b.style.left = `${((TRAY.CENTRE + TRAY.M * i) / W * 100).toFixed(2)}%`; row.append(b); });
    trayEl.replaceChildren(row);
    trayImage(n).then((url) => { if (url && row.isConnected) row.style.backgroundImage = `url(${url})`; });
  }
  function bagEl(color) {
    const left = pos.types.filter((t) => pos.handCount(color, t) > 0);
    const total = pos.types.reduce((a, t) => a + pos.handCount(color, t), 0);
    const bag = h('div.hv-bag', { 'aria-label': `${total} pieces still in the bag` }, h('img.bag', { src: 'assets/hive3d/bag.webp', alt: '' }));
    if (view3d) left.slice(-2).forEach((t, i) => bag.append(h('img.peek.' + (i ? 'a' : 'b'), { src: view3d.thumb(t, color), alt: '' })));
    bag.append(h('b', String(total)));
    return bag;
  }

  function playerBar(color, bottom) {
    const id = idOf(color);
    const player = api.player(id);
    const danger = Math.max(0, pos.queenNeighbours(color));
    const reserve = h('div.hv-reserve', { 'aria-label': `${nameOf(id)} reserve` }, pos.types.map((t) => reserveButton(color, t, bottom)));
    const who = h('div.hv-who', avatarEl(player, 'sm', { still: true }), h('div.name', nameOf(id), h('small', color === 0 ? 'White pieces' : 'Black pieces')));
    const pips = h('div.hv-danger', { title: `${danger} of 6 sides closed`, 'aria-label': `${danger} of 6 sides closed` }, Array.from({ length: 6 }, (_, i) => h('i' + (i < danger ? '.on' : ''))));
    const el = bottom ? bottomBar : topBar;
    el.classList.toggle('turn', pos.turn === color && !S.result);
    el.replaceChildren(who, bottom ? pips : reserve, bottom ? bagEl(color) : pips);
  }

  function chosenMoves() {
    if (!selected) return [];
    return legal().filter((m) => selected.kind === 'reserve'
      ? m.k === K_PLACE && colorOfPiece(m.p) === selected.color && typeOfPiece(m.p) === selected.type
      : m.k === K_MOVE && m.from === selected.cell);
  }

  function selectCell(cell) {
    if (!canAct()) return;
    const moves = legal().filter((m) => m.k === K_MOVE && m.from === cell);
    if (!moves.length) return;
    if (selected?.kind === 'board' && selected.cell === cell) selected = null;
    else selected = { kind: 'board', cell };
    pendingMove = null;
    hintMove = null;
    api.sfx('pop', .5);
    render();
  }

  function submit(move) {
    if (!move || !canAct()) return;
    selected = null;
    hintMove = null;
    api.toHost('move', pos.toJSON(move));
  }

  function stageMove(move) {
    if (!move || !canAct()) return;
    pendingMove = move;
    hintMove = null;
    api.sfx('wood', .46);
    render();
  }

  function commitPending() {
    if (!pendingMove) return;
    const move = pendingMove;
    pendingMove = null;
    submit(move);
  }

  function drawGrid() {
    const grid = svg('g', { class: 'hv-grid', 'aria-hidden': 'true' });
    const radius = 9;
    for (let q = -radius; q <= radius; q++) {
      const r1 = Math.max(-radius, -q - radius);
      const r2 = Math.min(radius, -q + radius);
      for (let r = r1; r <= r2; r++) {
        const at = xyOf(cellOf(q, r));
        grid.append(svg('polygon', {
          class: Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) % 3 === 0 ? 'major' : '',
          points: Array.from({ length: 6 }, (_, i) => { const a = (i * 60 + 30) * Math.PI / 180; return `${(37 * Math.cos(a)).toFixed(2)},${(37 * Math.sin(a)).toFixed(2)}`; }).join(' '),
          transform: `translate(${at.x} ${at.y})`,
        }));
      }
    }
    world.append(grid);
  }

  function drawBoard() {
    world.replaceChildren();
    drawGrid();
    const moves = legal();
    const selectable = new Set(moves.filter((m) => m.k === K_MOVE).map((m) => m.from));
    const targets = chosenMoves();
    const last = [...S.moves].reverse().find((m) => m.to);
    const lastTo = last?.to ? cellOf(last.to[0], last.to[1]) : -1;

    if (hintMove?.k === 'move' && hintMove.from && hintMove.to) {
      const temp = pos.fromJSON(hintMove);
      if (temp) {
        const points = pos.pathOf(temp).map((c) => { const p = xyOf(c); return `${p.x},${p.y - 5}`; }).join(' ');
        world.append(svg('polyline', { class: 'hv-path', points }));
      }
    }

    const ordered = pos.occ.slice().sort((a, b) => {
      const aa = xyOf(a), bb = xyOf(b);
      return aa.y - bb.y || aa.x - bb.x;
    });
    for (const cell of ordered) {
      const at = xyOf(cell);
      const stack = pos.stack(cell);
      stack.forEach((piece, level) => {
        const color = colorOfPiece(piece);
        const type = typeOfPiece(piece);
        const top = level === stack.length - 1;
        const classes = ['hv-piece'];
        if (top && selectable.has(cell)) classes.push('can');
        if (top && selected?.kind === 'board' && selected.cell === cell) classes.push('sel');
        if (top && lastTo === cell) classes.push('last');
        if (!top) classes.push('covered');
        const g = svg('g', { class: classes.join(' '), transform: `translate(${at.x} ${at.y - level * 9})`, role: top && selectable.has(cell) ? 'button' : 'img', tabindex: top && selectable.has(cell) ? '0' : '-1', 'aria-label': `${LABEL[type]} at ${cellKey(cell)}${stack.length > 1 ? `, level ${level + 1} of ${stack.length}` : ''}` });
        g.innerHTML = tileInner(type, color === 0 ? 'w' : 'b', { thick: 5 });
        if (top && selectable.has(cell)) {
          g.addEventListener('click', (e) => { e.stopPropagation(); selectCell(cell); });
          g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCell(cell); } });
        }
        if (top && lastTo === cell && S.version !== lastAnimatedVersion) g.classList.add('hv-arrive');
        world.append(g);
      });
      if (stack.length > 1) {
        const badge = svg('g', { class: 'hv-stack', transform: `translate(${at.x + 28} ${at.y - (stack.length - 1) * 9 - 29})` });
        badge.innerHTML = `<circle r="11"/><text y="1">${stack.length}</text>`;
        world.append(badge);
      }
    }

    for (const move of targets) {
      const at = xyOf(move.to);
      const isHint = hintMove && JSON.stringify(pos.toJSON(move)) === JSON.stringify(hintMove);
      const isPending = pendingMove && JSON.stringify(pos.toJSON(move)) === JSON.stringify(pos.toJSON(pendingMove));
      const g = svg('g', { class: `hv-target${isHint ? ' hint' : ''}${isPending ? ' pending' : ''}`, transform: `translate(${at.x} ${at.y - pos.H[move.to] * 9})`, role: 'button', tabindex: '0', 'aria-label': `Move to ${cellKey(move.to)}` });
      g.innerHTML = `<polygon points="${Array.from({ length: 6 }, (_, i) => { const a = (i * 60 + 30) * Math.PI / 180; return `${(37 * Math.cos(a)).toFixed(2)},${(37 * Math.sin(a)).toFixed(2)}`; }).join(' ')}"/>`;
      g.addEventListener('click', (e) => { e.stopPropagation(); stageMove(move); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stageMove(move); } });
      world.append(g);
    }
    if (pendingMove) {
      const at = xyOf(pendingMove.to);
      const piece = pendingMove.p;
      const preview = svg('g', { class: 'hv-preview', transform: `translate(${at.x} ${at.y - pos.H[pendingMove.to] * 9 - 7})` });
      preview.innerHTML = tileInner(typeOfPiece(piece), colorOfPiece(piece) === 0 ? 'w' : 'b', { thick: 5 });
      world.append(preview);
    }
    lastAnimatedVersion = S.version;
    worldTransform();
  }

  function statusText() {
    if (S.result) return S.result.text;
    const current = idOf(pos.turn);
    if (hintBusy) return 'Studying the hive…';
    if (api.isBot(current) && botBusy) return `${nameOf(current)} is thinking…`;
    if (!canAct()) return `${nameOf(current)} is choosing`;
    if (pos.mustPlaceQueen()) return 'Place your Queen Bee now';
    if (selected?.kind === 'reserve') return `Choose a space for ${LABEL[selected.type]}`;
    if (selected?.kind === 'board') return `Choose a destination for ${LABEL[typeOfPiece(pos.top(selected.cell))]}`;
    return pos.ply < 2 ? 'Place any insect' : 'Place or move one insect';
  }

  function canUndo() {
    if (!S.moves.length || S.result || (myColor < 0 && !otb)) return false;
    if (otb) return true;
    if (api.players.some((p) => api.isBot(p.id))) return true;
    return pos.turn !== myColor;
  }

  function renderActions() {
    const buttons = [
      iconBtn('undo', 'Undo last turn', () => api.toHost('undo')),
      iconBtn('lightbulb', 'Hint', requestHint),
      iconBtn('history', 'Move log', showLog),
      iconBtn('info', 'Insect guide', showGuide),
      iconBtn('flag', 'Resign', resign),
    ];
    buttons[0].disabled = !canUndo();
    buttons[1].disabled = !canAct() || hintBusy || pos.legalMoves().every((m) => m.k === K_PASS);
    buttons[4].disabled = !!S.result || (myColor < 0 && !otb);
    actions.replaceChildren(...buttons);
    confirmMove.disabled = !pendingMove || !canAct();
    confirmMove.textContent = pendingMove ? 'Confirm move' : 'Select a space';
  }

  function activeType() {
    if (selected?.kind === 'reserve') return selected.type;
    if (selected?.kind === 'board') return typeOfPiece(pos.top(selected.cell));
    const last = [...S.moves].reverse().find((move) => move.p !== undefined);
    return last ? typeOfPiece(last.p) : 'Q';
  }

  function renderInspector() {
    const type = activeType();
    const art = h('div');
    art.innerHTML = tileArt(type, pos.turn, 58);
    const heading = h('div.hv-info-head', art, h('div', h('small', selected ? 'Selected insect' : 'Movement rules'), h('h3', LABEL[type])));
    const rules = h('ul.hv-rules', RULE_DETAILS[type].map((line) => h('li', line)));
    const history = h('div.hv-history', S.logs.length
      ? S.logs.slice(-7).reverse().map((line, i) => h('div.hv-history-row', h('b', `${S.logs.length - i}.`), h('span', line)))
      : h('div.hv-empty', 'Moves will appear here.'));
    const card = h('div.hv-info-card', heading, rules, h('div.hv-history-title', 'Move history'), history);
    const result = S.result ? h('div.hv-result-card', h('strong', S.result.winner === 2 ? 'Draw' : 'Hive complete'), h('span', S.result.text), h('small', `${pos.ply} turns · ${pos.occ.length} occupied spaces`)) : null;
    inspector.replaceChildren(...(result ? [result, card] : [card]));
  }

  function render() {
    const bottomColor = otb ? 0 : viewColor;
    playerBar(1 - bottomColor, false);
    playerBar(bottomColor, true);
    renderTray(otb ? pos.turn : viewColor);
    const current = idOf(pos.turn);
    statusEl.replaceChildren(
      h('b', statusText()),
      h('span' + (api.isBot(current) && botBusy ? '.hv-thinking' : ''), S.result ? `Finished after ${pos.ply} turns` : `${pos.ply + 1}. ${pos.turn === 0 ? 'White' : 'Black'} to act`),
    );
    if (view3d) { pushModel(pendingAnim); pendingAnim = null; } else drawBoard();
    syncSpot();
    renderActions();
    renderInspector();
    if (freshBoard) { freshBoard = false; requestAnimationFrame(fitBoard); }
  }

  function showSettings() {
    const seg = (key, opts2) => h('div.hv-seg', opts2.map(([v, label]) => h('button' + (prefs[key] === v ? '.on' : ''), { onclick: (e) => { prefs[key] = v; savePrefs(); [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); render(); } }, label)));
    openSheet(h('div.hv-sheet.hv-set',
      h('h3', 'Display and hints'),
      h('b', 'Move hints'), h('small', 'Off shows nothing; destinations shows where a piece can go; paths adds an arrow route to every destination; all pieces shows every move at once and spotlights one stone at a time.'),
      seg('hints', [[0, 'Off'], [1, 'Destinations'], [2, 'Paths'], [3, 'All pieces']]),
      h('b', 'Piece rotation'), h('small', 'How each stone lies after it is placed or moved. Natural adds a tiny hand-set tilt.'),
      seg('rotation', [['off', 'Upright'], ['neat', 'Neat'], ['natural', 'Natural']]),
      h('b', 'Route colours'), h('small', 'Off keeps every route amber and highlights one when you point at its destination. On gives each route its own colour and shape.'),
      seg('routeColors', [[0, 'Off'], [1, 'On']]),
    ), { wide: true });
  }

  function showGuide() {
    const content = h('div.hv-sheet', h('h3', 'Insect guide'), h('div.hv-guide', pos.types.map((type) => {
      const art = h('div'); art.innerHTML = tileArt(type, 0, 48);
      return h('div.hv-guide-row', art, h('b', LABEL[type]), h('span', SHORT_RULE[type]));
    })), h('p.muted', 'Keep every piece connected. Ground insects must slide through open gaps. Surround all six sides of the opposing Queen Bee to win.'));
    openSheet(content, { wide: true });
  }

  function showLog() {
    const content = h('div.hv-sheet', h('h3', 'Move log'), S.logs.length
      ? h('div.hv-log', S.logs.map((line, i) => h('div.hv-log-row', h('b', `${i + 1}.`), h('span', line))))
      : h('div.hv-empty', 'No moves yet.'));
    openSheet(content, { wide: true });
  }

  async function requestHint() {
    if (!canAct() || hintBusy) return;
    hintBusy = true; selected = null; render();
    const token = S.version;
    const move = await chooseMoveAsync(opts, S.moves, 'normal');
    hintBusy = false;
    if (token !== S.version || !move || !canAct()) return render();
    hintMove = move;
    if (move.k === 'place') selected = { kind: 'reserve', type: move.t, color: pos.turn };
    else if (move.k === 'move') selected = { kind: 'board', cell: cellOf(move.from[0], move.from[1]) };
    api.sfx('ding', .55);
    render();
  }

  async function resign() {
    if (S.result || (myColor < 0 && !otb)) return;
    if (await confirmDialog('Concede this match?', 'The other colony wins.', { ok: 'Concede', danger: true })) api.toHost('resign');
  }

  function applyState(next) {
    const before = S.version;
    S = { ...S, ...next };
    const rebuilt = replay(opts, S.moves || []);
    if (rebuilt.badAt !== undefined) {
      console.error('[hive] rejected state at move', rebuilt.badAt);
      return;
    }
    pos = rebuilt;
    pendingAnim = !firstState && S.version > before && S.version - before <= 3 ? lastMoveAnim(S.moves || []) : null;
    firstState = false;
    selected = null;
    pendingMove = null;
    hintMove = null;
    botBusy = false;
    if (next.sfx === 'result') api.sfx(S.result?.winner === 2 || myColor < 0 ? 'ding' : S.result?.winner === myColor ? 'win' : 'lose', .82);
    else if (next.sfx) api.sfx(next.sfx, .72);
    if (S.version > before && pos.occ.length && (pos.occ.length < 3 || pos.ply % 7 === 0)) requestAnimationFrame(() => {
      const cells = pos.occ.map(xyOf);
      const far = cells.some((p) => Math.abs(p.x * view.scale + view.x) > view.w * .45 || Math.abs(p.y * view.scale + view.y) > view.h * .45);
      if (far) fitBoard();
    });
    render();
    maybeBot();
  }

  const pointers = new Map();
  let gesture = null;
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  board.addEventListener('pointerdown', (e) => {
    // Let interactive SVG groups retain the click. Panning begins on the open play mat.
    if (e.target.closest?.('.hv-target,.hv-piece')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    board.setPointerCapture(e.pointerId);
    if (pointers.size === 1) gesture = { mode: 'pan', x: e.clientX, y: e.clientY, px: view.x, py: view.y };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale, px: view.x, py: view.y, mid: midpoint(a, b) };
    }
  });
  board.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && gesture?.mode === 'pan') {
      const p = [...pointers.values()][0];
      view.x = gesture.px + p.x - gesture.x;
      view.y = gesture.py + p.y - gesture.y;
      worldTransform();
    } else if (pointers.size === 2 && gesture?.mode === 'pinch') {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      view.scale = clamp(gesture.scale * d / Math.max(10, gesture.dist), .42, 2.2);
      const mid = midpoint(a, b);
      view.x = gesture.px + mid.x - gesture.mid.x;
      view.y = gesture.py + mid.y - gesture.mid.y;
      worldTransform();
    }
  });
  const pointerEnd = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      gesture = { mode: 'pan', x: p.x, y: p.y, px: view.x, py: view.y };
    } else if (!pointers.size) gesture = null;
  };
  board.addEventListener('pointerup', pointerEnd);
  board.addEventListener('pointercancel', pointerEnd);
  board.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = board.getBoundingClientRect();
    const cx = e.clientX - rect.left - view.w / 2;
    const cy = e.clientY - rect.top - view.h / 2;
    const old = view.scale;
    const next = clamp(old * Math.exp(-e.deltaY * .0012), .42, 2.2);
    const ratio = next / old;
    view.x = cx - (cx - view.x) * ratio;
    view.y = cy - (cy - view.y) * ratio;
    view.scale = next;
    worldTransform();
  }, { passive: false });
  board.addEventListener('click', (e) => { if (e.target === board || e.target.closest?.('.hv-grid')) { selected = null; pendingMove = null; hintMove = null; render(); } });
  const resize = new ResizeObserver(() => {
    const rect = arena.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const first = view.w === 800 && view.h === 520;
    view.w = rect.width; view.h = rect.height;
    board.setAttribute('viewBox', `0 0 ${view.w} ${view.h}`);
    if (first) fitBoard(); else worldTransform();
  });
  resize.observe(arena);
  floatTools.append(iconBtn('gps_fixed', 'Recenter hive', fitBoard), iconBtn('tune', 'Display and hints', showSettings));

  let maybeBot = () => {};
  if (api.isHost) {
    const H = { moves: [], logs: [], pos: new Position(opts), version: 0, result: null };
    if (api.restore?.moves && Array.isArray(api.restore.moves)) {
      const loaded = replay(opts, api.restore.moves);
      if (loaded.badAt === undefined) {
        H.moves = api.restore.moves.slice();
        H.logs = Array.isArray(api.restore.logs) ? api.restore.logs.slice() : [];
        H.pos = loaded;
        H.version = H.moves.length;
        H.result = api.restore.result || null;
      }
    }
    const snapshot = (extra = {}) => ({ moves: H.moves, logs: H.logs, result: H.result, version: H.version, ...extra });
    const publish = (to, extra = {}) => {
      const snap = snapshot(extra);
      if (to) api.sendTo(to, 'state', snap); else api.broadcast('state', snap);
      if (!to) applyState(snap);
    };
    const save = () => api.save({ moves: H.moves, logs: H.logs, result: H.result }, { turn: H.result ? null : idOf(H.pos.turn), over: !!H.result, moves: H.moves.length, summary: H.result?.text || '' });
    const finish = (winner, why) => {
      if (H.result) return;
      const draw = winner === 2 || winner == null;
      H.result = { winner, text: draw ? 'Both Queen Bees are surrounded — draw' : `${nameOf(idOf(winner))} surrounds the Queen Bee` };
      H.version++;
      publish(null, { sfx: 'result' });
      save();
      if (!ended) {
        ended = true;
        api.timeout(() => api.endGame({
          title: draw ? 'Hive ends in a draw' : `${nameOf(idOf(winner))} wins Hive!`,
          subtitle: why || (draw ? `${H.moves.length} turns · both queens surrounded` : `Queen Bee surrounded in ${H.moves.length} turns`),
          ranking: draw ? ids.map((id) => ({ id, score: 'draw' })) : [winner, 1 - winner].map((c) => ({ id: idOf(c), score: c === winner ? 'victory' : 'defeat', note: `${H.pos.queenNeighbours(c)} spaces around their Queen Bee` })),
          winners: draw ? ids.slice() : [idOf(winner)],
        }), 1450);
      }
    };
    const moveText = (move, actor) => {
      if (move.k === K_PASS) return `${nameOf(actor)} has no legal move and passes.`;
      const type = typeOfPiece(move.p);
      if (move.k === K_PLACE) return `${nameOf(actor)} deploys ${LABEL[type]}.`;
      if (move.via >= 0) return `${nameOf(actor)} carries ${LABEL[type]} to a new edge.`;
      return `${nameOf(actor)} moves ${LABEL[type]}.`;
    };
    api.on('move', (json, from) => {
      if (H.result) return;
      const actor = idOf(H.pos.turn);
      if (!otb && from !== actor) return;
      const move = H.pos.fromJSON(json);
      if (!move) { if (from === api.me) api.toast('That move is not legal now.'); return; }
      const clean = H.pos.toJSON(move);
      H.logs.push(moveText(move, actor));
      H.pos.play(move);
      H.moves.push(clean);
      H.version++;
      // Passing is bookkeeping, not a decision. Resolve it immediately so a blocked player can never stall a match.
      while (H.pos.winner < 0) {
        const forced = H.pos.legalMoves();
        if (forced.length !== 1 || forced[0].k !== K_PASS) break;
        const blocked = idOf(H.pos.turn);
        H.logs.push(moveText(forced[0], blocked));
        H.moves.push(H.pos.toJSON(forced[0]));
        H.pos.play(forced[0]);
        H.version++;
      }
      const sound = move.k === K_PLACE ? 'place' : move.k === K_PASS ? 'turn' : move.via >= 0 || H.pos.H[move.to] > 1 ? 'wood' : 'slide';
      publish(null, { sfx: sound });
      save();
      if (H.pos.winner >= 0) finish(H.pos.winner);
    });
    api.on('undo', (_, from) => {
      if (H.result || !H.moves.length || (!otb && colorOfId(from) < 0)) return;
      const requester = otb ? H.pos.turn : colorOfId(from);
      let count = 1;
      if (!otb && api.players.some((p) => api.isBot(p.id)) && H.pos.turn === requester && H.moves.length > 1) count = 2;
      else if (!otb && H.pos.turn === requester) return;
      H.moves.splice(Math.max(0, H.moves.length - count), count);
      H.logs.splice(Math.max(0, H.logs.length - count), count);
      H.pos = replay(opts, H.moves);
      H.version++;
      publish(null, { sfx: 'rub' });
      save();
    });
    api.on('resign', (_, from) => {
      if (H.result) return;
      const loser = otb ? H.pos.turn : colorOfId(from);
      if (loser < 0) return;
      H.logs.push(`${nameOf(idOf(loser))} concedes.`);
      finish(1 - loser, 'Opponent conceded');
    });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (!H.result && ids.includes(id) && !api.isBot(id) && !otb) finish(1 - colorOfId(id), 'Opponent left the match');
    });
    maybeBot = () => {
      if (H.result || botBusy || !api.isBot(idOf(H.pos.turn))) return;
      botBusy = true;
      render();
      const version = H.version;
      api.timeout(async () => {
        try {
          const move = await chooseMoveAsync(opts, H.moves, api.level);
          if (!H.result && H.version === version && move) api.botDo(idOf(H.pos.turn), 'move', move);
        } catch (e) {
          console.error('[swarmfront] bot', e);
        } finally {
          botBusy = false;
          render();
          if (!H.result && api.isBot(idOf(H.pos.turn))) api.timeout(maybeBot, 220);
        }
      }, api.level === 'easy' ? 900 : api.level === 'hard' ? 420 : 650);
    };
    api.timeout(() => { publish(); maybeBot(); }, 120);
  }

  api.on('state', applyState);
  api.onPlayersChanged(render);
  Object.defineProperty(arena, '__hv', { value: { get view() { return view3d; }, get targets() { return targetMoves; }, get pos() { return pos; }, prefs, load(list, turn = 0) { pos = Position.setup(opts, list, turn); S = { ...S, moves: [], result: null }; selected = null; pendingMove = null; render(); } }, enumerable: false });
  api.cleanup(() => { resize.disconnect(); stopHiveWorker(); stopSpot(); view3d?.dispose(); });
  render();

  return { destroy() { resize.disconnect(); stopHiveWorker(); stopSpot(); view3d?.dispose(); } };
}
