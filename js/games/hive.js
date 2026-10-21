// Hive — a host-authoritative, boardless insect strategy game, refined by OpenAI Codex.
// Original presentation and artwork; rules logic lives in ../engines/hive-rules.js.
import { h, clamp } from '../util.js';
import { avatarEl } from '../avatar.js';
import { icon, iconBtn, openSheet, confirmDialog } from '../ui.js';
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
.hv { flex:1; min-height:0; width:100%; display:grid; grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr); grid-template-areas:"center"; overflow:hidden; background:#100d09; color:#f7efe3; }
.hv * { box-sizing:border-box; }
.hv-center { grid-area:center; display:flex; flex-direction:column; min-height:0; min-width:0; }
.hv-arena { flex:1; position:relative; min-height:0; overflow:hidden; background:#161a10; touch-action:none; user-select:none; }
.hv-arena.d3 .hv-board,.hv-arena.d3 .hv-zoom { display:none; }
.hv-zoom { position:absolute; left:10px; bottom:9px; padding:5px 9px; background:#14110d; color:#d8cdbd; border:1px solid #5d452c; font:700 10px var(--font); pointer-events:none; }
/* the reserve tray is drawn in the 3D scene; this copy only serves keyboards, screen readers and the flat fallback */
.hv-tray { display:flex; justify-content:center; padding:6px 10px 4px; background:#120f0b; min-width:0; }
.hv.d3 .hv-tray { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); padding:0; }
.hv-trayrow { position:relative; width:min(100%, calc(var(--n) * 104px)); aspect-ratio:var(--ratio); background-size:100% 100%; background-repeat:no-repeat; filter:drop-shadow(0 4px 5px rgba(0,0,0,.55)); }
.hv-trayrow .hv-rpiece { position:absolute; top:46%; width:var(--tw); height:auto; aspect-ratio:1; transform:translate(-50%,-50%); }
.hv-trayrow .hv-rpiece:hover:not(:disabled),.hv-trayrow .hv-rpiece.sel { transform:translate(-50%,-62%); }
.hv-trayrow .hv-rpiece.empty { display:block; visibility:hidden; }
.hv-count { position:absolute; right:2%; bottom:-6%; min-width:19px; height:19px; border-radius:50%; display:grid; place-items:center; background:var(--m-blue); color:#fff; border:2px solid #120f0b; font:800 10px var(--font); }
/* ---- player panels, after the design: near-black, a fine gold double rule, serif names, gold-ringed portrait ---- */
.hv-plaque { position:absolute; z-index:4; display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:6px 12px; align-items:center; padding:12px 14px 12px 12px; background:#13100c; border:1px solid #5e4729; border-radius:4px; box-shadow:inset 0 0 0 3px #13100c, inset 0 0 0 4px #2b2116, 0 10px 24px rgba(0,0,0,.55); color:#f4ead6; }
.hv-plaque.turn { border-color:#d69a35; box-shadow:inset 0 0 0 3px #13100c, inset 0 0 0 4px #5a4220, 0 0 0 1px rgba(214,154,53,.35), 0 0 22px rgba(214,154,53,.28), 0 10px 24px rgba(0,0,0,.55); }
.hv-plaque.opp { left:12px; top:12px; max-width:min(360px, calc(100% - 96px)); }
.hv-plaque.me { right:12px; bottom:12px; max-width:min(330px, calc(100% - 150px)); }
.hv-plaque .avatar { box-shadow:0 0 0 2px #13100c, 0 0 0 3.5px #c9973e; border-radius:50%; }
.hv-plaque .pt { min-width:0; }
.hv-plaque b { display:block; font:400 19px/1.15 Georgia,'Times New Roman',serif; letter-spacing:.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hv-plaque .ps { display:block; margin-top:3px; font:400 14px/1.3 Georgia,'Times New Roman',serif; color:#b3a58d; }
.hv-plaque.turn .ps { color:#e8b04a; }
.hv-plaque .ps i { display:inline-block; width:7px; height:7px; margin:0 7px 1px 0; border-radius:50%; background:#e8b04a; vertical-align:middle; }
.hv-plaque .qr { width:44px; height:44px; display:block; }
.hv-plaque .pc { grid-column:1 / -1; display:grid; grid-template-columns:repeat(4, auto); justify-content:start; gap:6px 14px; padding-top:8px; margin-top:2px; border-top:1px solid #2b2116; }
.hv-chip { position:relative; flex:none; display:flex; align-items:center; gap:4px; }
.hv-chip .hv-timg { width:38px; height:38px; }
.hv-chip .x { font:400 14px Georgia,'Times New Roman',serif; color:#cfc3ad; } .hv-chip .x u { text-decoration:none; }
.hv-chip.none { opacity:.32; }
button.hv-chip { border:0; background:transparent; padding:2px 4px 2px 2px; color:inherit; cursor:pointer; border-radius:3px; transition:transform .15s var(--std); }
button.hv-chip:disabled { cursor:default; }
button.hv-chip.can:hover { transform:translateY(-2px); }
button.hv-chip.sel { transform:translateY(-4px); background:#2a1f12; box-shadow:0 0 0 1px #d69a35, 0 0 14px rgba(214,154,53,.4); }
button.hv-chip:not(.can):not(.none) { opacity:.55; } .hv-chip.queen .hv-timg { filter:drop-shadow(0 0 6px rgba(232,176,74,.75)); }
.hv-wordmark { position:absolute; z-index:3; top:14px; left:50%; transform:translateX(-50%); height:40px; width:auto; pointer-events:none; filter:drop-shadow(0 3px 4px rgba(0,0,0,.7)); }
/* ---- the honeycomb menu: one hexagonal button that opens a cluster of labelled hexagons ---- */
.hv-comb { position:absolute; z-index:6; right:12px; top:12px; width:60px; height:54px; border:0; padding:0; background:transparent; cursor:pointer; filter:drop-shadow(0 4px 6px rgba(0,0,0,.6)); }
.hv-hex { position:relative; display:block; clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%); background:#a87a30; }
.hv-hex > span { position:absolute; inset:1.5px; clip-path:inherit; background:#13100c; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; color:#f6ecd8; transition:background .15s; }
.hv-comb .hv-hex { width:60px; height:54px; }
.hv-comb:hover .hv-hex > span,.hv-comb.open .hv-hex > span { background:#3a2610; }
.hv-comb svg { width:30px; height:30px; display:block; }
.hv-combmenu { position:absolute; z-index:6; right:12px; top:12px; width:60px; height:54px; pointer-events:none; }
.hv-combitem { position:absolute; left:0; top:0; width:88px; height:77px; margin:-11px 0 0 -14px; border:0; padding:0; background:transparent; cursor:pointer; pointer-events:auto; opacity:0; transform:translate(0,0) scale(.2); filter:drop-shadow(0 5px 7px rgba(0,0,0,.65)); transition:transform .22s cubic-bezier(.2,1.2,.3,1), opacity .15s; }
.hv-combmenu.open .hv-combitem { opacity:1; transform:translate(var(--dx),var(--dy)) scale(1); }
.hv-combitem .hv-hex { width:88px; height:77px; }
.hv-combitem .hv-hex > span { font:400 12.5px/1.1 Georgia,'Times New Roman',serif; color:#f1e6cf; }
.hv-combitem svg { width:25px; height:25px; display:block; }
.hv-combitem:hover:not(:disabled) .hv-hex > span { background:#3a2610; }
.hv-combitem:disabled { cursor:default; opacity:.4 !important; }
.hv-combitem.warn .hv-hex { background:#EA4335; }
.hv-scrim { position:absolute; inset:0; z-index:5; background:transparent; }
/* ---- victory banner ---- */
.hv-victory { position:absolute; left:50%; top:12px; transform:translateX(-50%); z-index:4; text-align:center; padding:8px 44px 10px; background:#0d0b08; border:1px solid #c28a2c; box-shadow:inset 0 0 0 3px #0d0b08,inset 0 0 0 4px #5d452c,0 6px 18px rgba(0,0,0,.6); clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,14px 100%,0 50%); pointer-events:none; }
.hv-victory b { display:block; font:700 32px/1 Georgia,'Times New Roman',serif; letter-spacing:.14em; color:#efbd4e; }
.hv-victory span { display:block; margin-top:4px; font:500 15px Georgia,serif; color:#f1e6cf; }
.hv-flatbar { position:absolute; z-index:4; left:12px; right:12px; bottom:70px; display:flex; justify-content:center; }
.hv-arena.d3 .hv-flatbar { display:none; }
.hv-confirm { height:46px; min-width:170px; padding:0 22px; background:#e6a72a; border:1px solid #f6cc6a; color:#1f1407; font:800 16px var(--font); cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
.hv-confirm:disabled { display:none; }
/* ---- wide screens: the rules and move history sit beside the table ---- */
.hv-inspector { grid-area:info; display:none; min-width:0; min-height:0; padding:10px; background:#0b0907; border-left:1px solid #6d4a22; flex-direction:column; gap:10px; overflow:auto; }
@container hv (min-width:700px) { .hv-plaque.me { right:auto; left:12px; bottom:auto; top:var(--hv-me-top, 150px); max-width:360px; } }
@container hv (max-width:699px) { .hv-plaque.me .pc { display:flex; justify-content:space-between; } .hv-plaque.me .hv-chip .hv-timg { width:36px; height:36px; } }
@container hv (min-width:1000px) { .hv { grid-template-columns:minmax(0,1fr) 300px; grid-template-areas:"center info"; } .hv-inspector { display:flex; } }
@container hv (max-width:560px) { .hv-wordmark { display:none; } .hv-plaque { padding:9px 10px; gap:4px 9px; } .hv-plaque b { font-size:16px; } .hv-plaque .ps { font-size:12.5px; } .hv-plaque .qr { width:38px; height:38px; } .hv-plaque .pc { display:flex; gap:0; overflow-x:auto; scrollbar-width:none; padding-top:6px; } .hv-chip .hv-timg { width:30px; height:30px; } .hv-chip .x { position:absolute; right:-3px; bottom:-3px; min-width:16px; height:16px; padding:0 3px; border-radius:8px; background:#13100c; border:1px solid #c9973e; color:#f4ead6; font:400 10px/14px Georgia,serif; text-align:center; } .hv-chip .x u { display:none; } }
@media (prefers-reduced-motion:reduce) { .hv-target polygon,.hv-arrive,.hv-plaque .ps i { animation:none; } .hv-combitem { transition:none; } }

.hv-defs { pointer-events:none; }
${GLYPH_CSS}
.hv-rpiece { position:relative; width:42px; height:46px; border:0; padding:0; background:transparent; cursor:pointer; filter:drop-shadow(0 3px 2px rgba(0,0,0,.34)); transition:transform .16s var(--std),filter .16s; }
.hv-rpiece svg { width:42px; height:46px; display:block; }
.hv-rpiece:hover:not(:disabled),.hv-rpiece.sel { transform:translateY(-4px); filter:drop-shadow(0 6px 4px rgba(0,0,0,.23)); }
.hv-rpiece.sel { outline:none; filter:drop-shadow(0 0 7px #ffc84a) drop-shadow(0 5px 3px rgba(0,0,0,.4)); }
.hv-rpiece:disabled { cursor:default; opacity:.52; }
.hv-rpiece.empty { display:none; }
.hv-timg { width:100%; height:auto; aspect-ratio:1; display:block; pointer-events:none; filter:drop-shadow(0 3px 3px rgba(0,0,0,.4)); }
.hv-seg { display:flex; gap:0; margin:6px 0 14px; border:1px solid var(--line2); }
.hv-seg button { flex:1; border:0; border-right:1px solid var(--line2); background:var(--surface); color:var(--on); padding:10px 6px; font:700 13px var(--font); cursor:pointer; }
.hv-seg button:last-child { border-right:0; }
.hv-seg button.on { background:var(--blue); color:#fff; }
.hv-set small { display:block; color:var(--on2); font:500 12px/1.4 var(--font); margin:-2px 0 4px; }
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
.hv-info-card,.hv-stats-card,.hv-hist-card { border:1px solid #6d4a22; background:#12100c; box-shadow:inset 0 0 0 1px #040302; padding:14px 16px; }
.hv-info-head { grid-template-columns:62px 1fr; gap:12px; border-bottom:0; padding-bottom:6px; }
.hv-info-head h3 { font:700 24px Georgia,'Times New Roman',serif; margin:0; }
.hv-info-head small { color:#e0a83a; font:600 17px Georgia,'Times New Roman',serif; text-transform:none; letter-spacing:0; }
.hv-rules { list-style:none; padding:0; margin:6px 0 0; font:500 14.5px/1.45 var(--font); color:#e5dbc8; }
.hv-rules li { position:relative; padding-left:18px; margin:7px 0; }
.hv-rules li::before { content:''; position:absolute; left:2px; top:.55em; width:7px; height:7px; border-radius:50%; background:#e6a72a; }
.hv-hist-card { flex:1; min-height:0; display:flex; flex-direction:column; padding:12px 14px; }
.hv-card-title { display:flex; align-items:center; justify-content:space-between; font:700 19px Georgia,'Times New Roman',serif; color:#f3e9d4; padding-bottom:8px; }
.hv-card-title button { border:0; background:transparent; color:#c9b58c; cursor:pointer; padding:2px; display:grid; place-items:center; }
.hv-hist { overflow:auto; min-height:0; scrollbar-width:thin; }
.hv-hrow { display:grid; grid-template-columns:20px 28px 52px 1fr; gap:8px; align-items:center; padding:7px 0; border-top:1px solid #2a231a; font:500 13px var(--font); color:#d6cab4; }
.hv-hrow:first-child { border-top:0; }
.hv-hrow b { color:#9d8f78; font-weight:500; text-align:right; }
.hv-hrow .hv-timg { width:26px; height:26px; }
.hv-hrow.last { background:#1d170e; }
.hv-stat { display:grid; grid-template-columns:34px 1fr auto; gap:10px; align-items:center; padding:10px 0; border-top:1px solid #2a231a; color:#e9dfca; font:500 15px var(--font); }
.hv-stat:first-of-type { border-top:0; }
.hv-stat i { color:#e0a83a; display:grid; place-items:center; }
.hv-stat b { font:700 17px var(--font); }
.hv-stat small { display:block; color:#a09076; font:500 12px var(--font); }
.hv-final { display:grid; grid-template-columns:30px 1fr; gap:10px; align-items:center; padding:8px 0; border-top:1px solid #2a231a; font:500 13.5px var(--font); color:#e5dbc8; }
.hv-final.win { color:#f3c85c; }
.hv-learn { display:flex; gap:10px; margin:12px 0; flex-wrap:wrap; }
.hv-lp { flex:1 1 92px; border:1px solid var(--line2); background:var(--surface); padding:10px 6px; cursor:pointer; text-align:center; font:700 14px Georgia,serif; color:var(--on); }
.hv-lp.on { border-color:#e6a72a; box-shadow:inset 0 0 0 1px #e6a72a; }
.hv-lp small { display:block; font:500 12px var(--font); color:var(--on2); margin-top:3px; }
.hv-lessons { display:grid; gap:2px; margin-top:8px; }
.hv-lesson { display:grid; grid-template-columns:44px 1fr; gap:12px; align-items:center; padding:10px 6px; border-bottom:1px solid var(--line); }
.hv-lesson i { width:40px; height:44px; display:grid; place-items:center; background:#1c1710; color:#e6a72a; font:700 18px Georgia,serif; clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%); font-style:normal; }
.hv-lesson b { display:block; font:700 16px Georgia,serif; }
.hv-lesson span { color:var(--on2); font-size:13.5px; }
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
  const arena = h('div.hv-arena');
  const board = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  board.setAttribute('class', 'hv-board');
  board.setAttribute('role', 'application');
  board.setAttribute('aria-label', 'Hive board. Drag to pan and pinch or scroll to zoom.');
  const world = document.createElementNS(board.namespaceURI, 'g');
  world.setAttribute('class', 'hv-world');
  board.append(world);
  const zoomLabel = h('div.hv-zoom', '100%');
  const topBar = h('div.hv-plaque.opp');
  const bottomBar = h('div.hv-plaque.me');
  const wordmark = h('img.hv-wordmark', { src: 'assets/hive3d/logo.svg', alt: 'Hive' });
  const victoryEl = h('div.hv-victory', { hidden: true });
  const confirmMove = h('button.hv-confirm', { disabled: true, onclick: () => commitPending() });
  const flatbar = h('div.hv-flatbar', confirmMove);
  const combBtn = h('button.hv-comb', { title: 'Menu', 'aria-label': 'Menu', 'aria-expanded': 'false', onclick: () => toggleComb() });
  combBtn.innerHTML = '<span class="hv-hex"><span><img src="assets/hive3d/mark.svg" alt="" style="width:28px;height:28px"></span></span>';
  const combMenu = h('div.hv-combmenu');
  const scrim = h('div.hv-scrim', { hidden: true, onclick: () => toggleComb(false) });
  arena.append(board, zoomLabel, wordmark, scrim, topBar, bottomBar, victoryEl, flatbar, combMenu, combBtn);
  const trayEl = h('div.hv-tray');
  const inspector = h('aside.hv-inspector', { 'aria-label': 'Piece rules and move history' });
  const center = h('div.hv-center', arena, trayEl);
  root.append(center, inspector);
  api.root.style.containerType = 'inline-size'; api.root.style.containerName = 'hv';   // panels adapt to the room the game is given (chat docked, split view…)
  api.root.append(h('style', CSS), root);

  // ---- honeycomb menu: a cluster of labelled hexagons instead of a row of unlabelled icons
  const COMB = [[-57, 33], [0, 66], [-114, 66], [-57, 99], [0, 132], [-114, 132]];
  let combOpen = false;
  function combItems() {
    return [
      ['undo', 'Undo', () => api.toHost('undo'), !canUndo(), false],
      ['lightbulb', 'Hint', requestHint, !canAct() || hintBusy || pos.legalMoves().every((m) => m.k === K_PASS), false],
      ['my_location', 'Frame', () => fitBoard(), false, false],
      ['menu_book', 'Rules', () => showRules(), false, false],
      ['tune', 'Display', () => showSettings(), false, false],
      ['flag', 'Resign', () => resign(), !!S.result || (myColor < 0 && !otb), true],
    ];
  }
  function renderComb() {
    combMenu.replaceChildren(...combItems().map(([ic, label, fn, off, warn], i) => {
      const b = h('button.hv-combitem' + (warn ? '.warn' : ''), { disabled: off, 'aria-label': label, style: `--dx:${COMB[i][0] * 1.04}px;--dy:${COMB[i][1] * 1.04}px;transition-delay:${i * 28}ms`, onclick: () => { toggleComb(false); fn(); } });
      const hex = h('span.hv-hex', h('span', icon(ic), label));
      b.append(hex); return b;
    }));
  }
  function toggleComb(force) {
    combOpen = force ?? !combOpen;
    if (combOpen) renderComb();
    combBtn.classList.toggle('open', combOpen); combBtn.setAttribute('aria-expanded', String(combOpen));
    scrim.hidden = !combOpen;
    requestAnimationFrame(() => combMenu.classList.toggle('open', combOpen));
    api.sfx(combOpen ? 'pop' : 'click', .4);
  }

  // ---- 3D table (falls back to the flat SVG board if WebGL or the art cannot load)
  const PREF_KEY = 'gn.hive3d';
  const prefs = { hints: 2, rotation: 'natural', routeColors: 0 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch {}
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} };
  let view3d = null, hoverTarget = null, targetMoves = [], firstState = true, pendingAnim = null;
  if (webglAvailable() && !/[?&]flat\b/.test(location.href)) {
    import('./hive3d.js').then((m) => m.createHive3D(arena, {
      onPiece: (piece) => { const cell = pos.occ.find((c) => pos.stack(c).includes(piece)); if (cell != null) selectCell(cell); },
      onTarget: (id) => { const mv = targetMoves[id]; if (mv) stageMove(mv); else if (id === -1) { api.toast('Pick an insect from the tray first'); view3d?.nudgeTray?.(); } },
      onConfirm: () => commitPending(),
      onCancel: () => { pendingMove = null; hintMove = null; selected = null; render(); },
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
  // every move of one insect shares its colour; each insect has its own
  const INSECT_COLOR = { Q: '#FBBC05', A: '#4285F4', S: '#EA4335', G: '#34A853', B: '#A142F4', M: '#12B5CB', L: '#FF6D00', P: '#F538A0' };
  const colourOfMove = (m) => INSECT_COLOR[typeOfPiece(m.k === K_PLACE ? m.p : pos.top(m.from))] || '#FBBC05';
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
      const colour = colourOfMove(moves[e.dests[0]]);
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
        color: m.k !== K_MOVE ? '#34A853' : colourOfMove(m), shape: 'circle' };
    });
    // At the very start nothing is selected yet, so show where the first stones may go; tapping one reminds you to pick an insect.
    if (!selected && !pendingMove && prefs.hints >= 1 && canAct() && pos.occ.length < 2 && !S.result) {
      const seenStart = new Set();
      for (const m of moves) if (m.k === K_PLACE && !seenStart.has(m.to)) { seenStart.add(m.to); targets.push({ id: -1, q: qOf(m.to), r: rOf(m.to), height: pos.H[m.to], kind: 'place', color: '#34A853', shape: 'plus' }); }
    }
    let arrows = prefs.hints >= 2 && fp != null ? buildArrows(chosen) : [];
    if (prefs.hints >= 3 && fp != null && !selected && !pendingMove) {
      // "All pieces": every move of every stone is on the board at once; the stone in the spotlight is bright, the rest quiet
      const seen = new Set(targets.map((t) => `${t.q},${t.r},${t.height}`));
      for (const m of moves) {
        if (m.k !== K_MOVE || pos.top(m.from) === fp) continue;
        const key = `${qOf(m.to)},${rOf(m.to)},${pos.H[m.to]}`;
        if (!seen.has(key)) { seen.add(key); targets.push({ id: null, faint: true, q: qOf(m.to), r: rOf(m.to), height: pos.H[m.to], kind: 'move', color: colourOfMove(m), shape: 'circle' }); }
      }
      const others = new Map();
      for (const m of moves) if (m.k === K_MOVE && pos.top(m.from) !== fp) { const p = pos.top(m.from); (others.get(p) || others.set(p, []).get(p)).push(m); }
      for (const list of others.values()) for (const a of buildArrows(list)) arrows.push({ ...a, opacity: 0.2, width: 0.012, head: a.head });
    }
    const ghostMove = pendingMove || (hoverTarget != null ? targetMoves[hoverTarget] : null);
    const last = [...(S.moves || [])].reverse().find((m) => m.to);
    const lastCell = last?.to ? cellOf(last.to[0], last.to[1]) : -1;
    view3d.update({
      tiles, targets, arrows, ghost: ghostFor(ghostMove), confirm: !!pendingMove, moveAnim: anim, instant,
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

  /** Seven hexagons: the Queen Bee in the middle and the six cells around her, filled red as the opposing hive closes in. */
  function queenRing(closed) {
    const R = 7.6, cx = 24, cy = 24, d = R * Math.sqrt(3) + 0.9;
    const hex = (x, y, r, fill, stroke) => `<polygon points="${Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k; return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`; }).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    let g = '';
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + Math.PI / 3 * k; g += hex(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R - 0.6, k < closed ? '#EA4335' : '#2a1d10', k < closed ? '#ff8b80' : '#7a5a2a'); }
    return `<svg class="qr" viewBox="0 0 48 48" role="img" aria-label="${closed} of 6 sides closed">${g}${hex(cx, cy, R - 0.6, '#FBBC05', '#fff3c4')}</svg>`;
  }
  function plaqueStatus(color) {
    const id = idOf(color), mine = !otb && color === myColor;
    if (S.result) return S.result.winner === 2 ? 'Draw' : S.result.winner === color ? 'Winner' : 'Surrounded';
    if (pos.turn !== color) return mine || otb ? 'Waiting' : 'Waiting for their move';
    if (hintBusy && (mine || otb)) return 'Studying the hive…';
    if (api.isBot(id) && botBusy) return 'Thinking…';
    if (mine || otb) return statusText();
    return 'Choosing…';
  }
  function playerBar(color, bottom) {
    const id = idOf(color);
    const player = api.player(id);
    const danger = Math.max(0, pos.queenNeighbours(color));
    const turn = pos.turn === color && !S.result;
    const el = bottom ? bottomBar : topBar;
    el.classList.toggle('turn', turn);
    const sub = h('span.ps'); if (turn) sub.append(h('i')); sub.append(plaqueStatus(color));
    const qr = h('div'); qr.innerHTML = queenRing(danger);
    const kids = [avatarEl(player, 'sm', { still: true }), h('div.pt', h('b', nameOf(id)), sub), qr.firstChild];
    // the reserve: your own insects are the buttons you place from; the opponent's are shown for reading the game
    const mine = otb ? pos.turn === color : color === myColor;
    const moves = mine ? legal() : [];
    const chips = h('div.pc', { 'aria-label': `${nameOf(id)} reserve` }, pos.types.map((t) => {
      const n = pos.handCount(color, t);
      const can = mine && moves.some((m) => m.k === K_PLACE && typeOfPiece(m.p) === t);
      const sel = selected?.kind === 'reserve' && selected.type === t && selected.color === color;
      const c = h((mine ? 'button' : 'div') + '.hv-chip' + (n ? '' : '.none') + (t === 'Q' ? '.queen' : '') + (sel ? '.sel' : '') + (can ? '.can' : ''), {
        title: `${LABEL[t]} — ${SHORT_RULE[t]} ${n} left`, 'aria-label': `${LABEL[t]}, ${n} left`,
        ...(mine ? { disabled: !can, onclick: () => { selected = sel ? null : { kind: 'reserve', type: t, color }; pendingMove = null; hintMove = null; api.sfx(sel ? 'click' : 'pop', .5); render(); } } : {}),
      });
      c.innerHTML = tileArt(t, color, 38) + `<span class="x"><u>×</u>${n}</span>`;
      return c;
    }));
    if (!(view3d && mine)) kids.push(chips);           // your own reserve lives in the tray on the table
    el.replaceChildren(...kids);
    if (!bottom) requestAnimationFrame(() => arena.style.setProperty('--hv-me-top', (topBar.offsetTop + topBar.offsetHeight + 10) + 'px'));
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
    if (pendingMove) return 'Tap the check to confirm, or tap another space';
    if (selected?.kind === 'reserve') return `Choose a space for ${LABEL[selected.type]}`;
    if (selected?.kind === 'board') return `Choose a destination for ${LABEL[typeOfPiece(pos.top(selected.cell))]}`;
    return pos.occ.length < 2 ? 'Pick an insect from the tray to place' : 'Place a piece from the tray, or tap one on the board to move it';
  }

  function canUndo() {
    if (!S.moves.length || S.result || (myColor < 0 && !otb)) return false;
    if (otb) return true;
    if (api.players.some((p) => api.isBot(p.id))) return true;
    return pos.turn !== myColor;
  }

  function renderActions() {
    confirmMove.disabled = !pendingMove || !canAct();
    confirmMove.replaceChildren(icon('check'), h('span', 'Confirm move'));
    if (combOpen) renderComb();
  }

  function activeType() {
    if (selected?.kind === 'reserve') return selected.type;
    if (selected?.kind === 'board') return typeOfPiece(pos.top(selected.cell));
    const last = [...S.moves].reverse().find((move) => move.p !== undefined);
    return last ? typeOfPiece(last.p) : 'Q';
  }

  function historyRows() {
    const p = new Position(opts), rows = [];
    (S.moves || []).forEach((j, i) => {
      const mv = p.fromJSON(j); if (!mv) return;
      if (mv.k === K_PASS) { rows.push({ n: i + 1, color: p.turn, type: null, text: 'No legal move — passes' }); p.play(mv); return; }
      const color = p.turn, piece = mv.k === K_PLACE ? mv.p : p.top(mv.from), type = typeOfPiece(piece);
      const text = mv.k === K_MOVE && p.H[mv.to] > 0 ? `${LABEL[type]} climbs on ${LABEL[typeOfPiece(p.top(mv.to))]}` : `${LABEL[type]} to (${qOf(mv.to)}, ${rOf(mv.to)})`;
      rows.push({ n: i + 1, color, type, text }); p.play(mv);
    });
    return rows;
  }
  const thumbHtml = (type, color, size) => (type ? tileArt(type, color, size) : '');

  function renderInspector() {
    const type = activeType();
    const art = h('div');
    art.innerHTML = tileArt(type, pos.turn, 62);
    const heading = h('div.hv-info-head', art, h('div', h('h3', LABEL[type]), h('small', selected ? 'Selected piece' : 'Movement Rules')));
    const rules = h('ul.hv-rules', RULE_DETAILS[type].map((line) => h('li', line)));
    const info = h('div.hv-info-card', heading, rules);
    const rows = historyRows();
    const histBody = h('div.hv-hist', rows.length ? rows.slice().reverse().map((r, idx) => {
      const row = h('div.hv-hrow' + (idx === 0 ? '.last' : ''), h('b', String(r.n)), h('span'), h('span', r.color === 0 ? 'White' : 'Black'), h('span', r.text));
      row.children[1].innerHTML = thumbHtml(r.type, r.color, 26);
      return row;
    }) : h('div.hv-empty', 'Moves will appear here.'));
    const hist = h('div.hv-hist-card', h('div.hv-card-title', 'Move History', h('button', { title: 'Full move log', 'aria-label': 'Full move log', onclick: showLog }, icon('keyboard_double_arrow_right'))), histBody);
    if (!S.result) return inspector.replaceChildren(info, hist);
    const placed = [0, 0]; let total = 0;
    (S.moves || []).forEach((j) => { if (j.k === 'place') { /* colour of the placer follows turn order */ } });
    const pp = new Position(opts);
    (S.moves || []).forEach((j) => { const mv = pp.fromJSON(j); if (!mv) return; if (mv.k !== K_PASS) total++; if (mv.k === K_PLACE) placed[pp.turn]++; pp.play(mv); });
    const draw = S.result.winner === 2;
    const stat = (ic, label, val, sub) => h('div.hv-stat', h('i', icon(ic)), h('div', label, sub ? h('small', sub) : null), h('b', val));
    const stats = h('div.hv-stats-card', h('div.hv-card-title', 'Match Statistics'),
      stat('swap_horiz', 'Total Moves', String(total)),
      stat('layers', 'Pieces Placed', String(placed[0] + placed[1]), `${nameOf(idOf(0))} ${placed[0]}  |  ${nameOf(idOf(1))} ${placed[1]}`),
      stat('check_circle', draw ? 'Both Queens Surrounded' : 'Queen Surrounded', draw ? '—' : 'Yes', `Move ${(S.moves || []).length}`));
    const finals = rows.slice(-3).map((r, k, a) => { const f = h('div.hv-final' + (k === a.length - 1 ? '.win' : ''), h('span'), h('span', `${r.n}. ${r.text}`)); f.children[0].innerHTML = thumbHtml(r.type, r.color, 28); return f; });
    const key = h('div.hv-stats-card', h('div.hv-card-title', 'Key Final Moves'), ...finals);
    inspector.replaceChildren(stats, key, hist);
  }

  function render() {
    const bottomColor = otb ? 0 : viewColor;
    playerBar(1 - bottomColor, false);
    playerBar(bottomColor, true);
    renderTray(otb ? pos.turn : viewColor);
    if (view3d) { pushModel(pendingAnim); pendingAnim = null; } else drawBoard();
    syncSpot();
    victoryEl.hidden = !S.result;
    if (S.result) { victoryEl.replaceChildren(h('b', S.result.winner === 2 ? 'DRAW' : 'VICTORY'), h('span', S.result.winner === 2 ? 'Both Queen Bees surrounded' : 'Queen Bee Surrounded')); }
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
    ), { wide: true });
  }

  function showGuide() {
    let cur = pos.types[0];
    const detail = h('div'), row = h('div.hv-learn');
    const draw = () => {
      row.replaceChildren(...pos.types.map((t) => { const b = h('button.hv-lp' + (t === cur ? '.on' : ''), { onclick: () => { cur = t; draw(); } }); b.innerHTML = tileArt(t, 0, 46); b.append(h('div', LABEL[t]), h('small', SHORT_RULE[t])); return b; }));
      const art = h('div'); art.innerHTML = tileArt(cur, 0, 56);
      detail.replaceChildren(h('div.hv-info-head', art, h('div', h('h3', LABEL[cur]), h('small', 'Piece Details'))), h('ul.hv-rules', RULE_DETAILS[cur].map((l) => h('li', l))));
    };
    draw();
    openSheet(h('div.hv-sheet', h('h3', 'How the Pieces Move'), h('p.muted', 'Each insect moves in a unique way. Select a piece to see its details.'), row, h('div.hv-info-card', { style: 'background:#12100c;color:#f4ead6' }, detail)), { wide: true });
  }
  function showRules() {
    const L = [['Basics', 'Meet the pieces and learn how they move. Each turn you place a piece from your reserve or move one already on the board.'], ['One Hive Rule', 'Your pieces must always stay connected in a single group. Never break the hive.'], ['Sliding', 'Ground insects move between pieces without breaking the hive, and must be able to squeeze through the gap.'], ['Jumping', 'The Grasshopper leaps in a straight line over at least one piece and lands in the first empty space.'], ['Stacking', 'The Beetle can climb on top of the hive. A covered piece cannot move, and a stacked Beetle still counts as part of the hive.'], ['Winning', "Surround your opponent's Queen Bee on all six sides. Place your own Queen by your fourth turn."]];
    openSheet(h('div.hv-sheet', h('h3', 'Rules'), h('div.hv-lessons', L.map(([t, d], i) => h('div.hv-lesson', h('i', String(i + 1)), h('div', h('b', t), h('span', d))))), h('div', { style: 'display:flex;gap:10px;margin-top:14px;flex-wrap:wrap' }, h('button.btn', { onclick: () => showGuide() }, 'How the pieces move'), h('button.btn', { onclick: () => showLog() }, 'Move log'))), { wide: true });
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
          subtitle: why || (draw ? `${H.moves.length} turns · both queens surrounded` : `Queen Bee surrounded in ${H.moves.length} turns · ${H.pos.occ.length} insects in the hive`),
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

  const onKey = (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    if (e.key === 'Enter' && pendingMove) { e.preventDefault(); commitPending(); }
    else if (e.key === 'Escape') { if (combOpen) toggleComb(false); else if (pendingMove || selected) { pendingMove = null; selected = null; hintMove = null; render(); } }
  };
  window.addEventListener('keydown', onKey);
  api.cleanup(() => window.removeEventListener('keydown', onKey));
  api.on('state', applyState);
  api.onPlayersChanged(render);
  Object.defineProperty(arena, '__hv', { value: { get view() { return view3d; }, get targets() { return targetMoves; }, get pos() { return pos; }, prefs, load(list, turn = 0) { pos = Position.setup(opts, list, turn); S = { ...S, moves: [], result: null }; selected = null; pendingMove = null; render(); } }, enumerable: false });
  api.cleanup(() => { resize.disconnect(); stopHiveWorker(); stopSpot(); view3d?.dispose(); });
  render();

  return { destroy() { resize.disconnect(); stopHiveWorker(); stopSpot(); view3d?.dispose(); } };
}
