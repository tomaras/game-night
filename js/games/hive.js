// Swarmfront — a host-authoritative, boardless colony strategy game.
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

const LABEL = {
  Q: 'Monarch', S: 'Weaver', B: 'Shell', G: 'Leaper', A: 'Scout',
  M: 'Mimic', L: 'Glider', P: 'Porter',
};
const SHORT_RULE = {
  Q: 'Slides one space.', S: 'Slides exactly three spaces.', B: 'Steps one space and may climb.',
  G: 'Jumps over a straight occupied line.', A: 'Slides any distance around the edge.',
  M: 'Copies adjacent creatures; climbs like a Shell.', L: 'Travels over two pieces, then down.',
  P: 'Slides one space or carries a neighbour across itself.',
};
const PIECE_SETS = {
  base: { mosquito: false, ladybug: false, pillbug: false },
  complete: { mosquito: true, ladybug: true, pillbug: true },
  mobility: { mosquito: true, ladybug: true, pillbug: false },
};
const SQ3 = Math.sqrt(3);
const STEP = 43;
const xyOf = (cell) => ({ x: STEP * SQ3 * (qOf(cell) + rOf(cell) / 2), y: STEP * 1.5 * rOf(cell) });
const cellKey = (cell) => `${qOf(cell)},${rOf(cell)}`;

const CSS = `
.hv { flex:1; min-height:0; width:100%; display:grid; grid-template-rows:auto minmax(240px,1fr) auto auto; overflow:hidden; background:var(--bg); --hv-board:#08775c; --hv-board2:#075f4a; }
.hv * { box-sizing:border-box; }
.hv-defs { pointer-events:none; }
${GLYPH_CSS}
.hv-player { min-width:0; min-height:66px; display:grid; grid-template-columns:minmax(104px,auto) 1fr auto; gap:8px; align-items:center; padding:6px 10px; background:var(--surface); border-bottom:1px solid var(--line); box-shadow:var(--z1); z-index:4; }
.hv-player.bottom { border-top:1px solid var(--line); border-bottom:0; }
.hv-who { min-width:0; display:flex; align-items:center; gap:7px; font:700 13px var(--font); }
.hv-who .name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hv-who small { display:block; color:var(--on3); font:600 10px var(--font); text-transform:uppercase; letter-spacing:.06em; }
.hv-player.turn { box-shadow:inset 4px 0 0 var(--m-yellow),var(--z1); }
.hv-danger { width:34px; display:grid; grid-template-columns:repeat(3,6px); gap:3px; justify-content:end; }
.hv-danger i { width:6px; height:6px; border-radius:50%; background:var(--line2); }
.hv-danger i.on { background:var(--m-red); }
.hv-reserve { min-width:0; display:flex; align-items:center; justify-content:flex-start; gap:1px; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; padding:2px; }
.hv-reserve::-webkit-scrollbar { display:none; }
.hv-rpiece { position:relative; flex:none; width:48px; height:51px; border:0; padding:0; background:transparent; cursor:pointer; filter:drop-shadow(0 2px 1px rgba(0,0,0,.18)); transition:transform .16s var(--std),filter .16s; }
.hv-rpiece svg { width:46px; height:50px; display:block; }
.hv-rpiece:hover:not(:disabled),.hv-rpiece.sel { transform:translateY(-4px); filter:drop-shadow(0 6px 4px rgba(0,0,0,.23)); }
.hv-rpiece.sel { outline:3px solid var(--m-yellow); outline-offset:0; clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%); }
.hv-rpiece:disabled { cursor:default; opacity:.52; }
.hv-rpiece.empty { display:none; }
.hv-count { position:absolute; right:-1px; bottom:0; width:19px; height:19px; border-radius:50%; display:grid; place-items:center; background:var(--m-blue); color:#fff; border:2px solid var(--surface); font:800 10px var(--font); }
.hv-arena { position:relative; min-height:0; overflow:hidden; background:var(--hv-board); border-block:4px solid var(--hv-board2); touch-action:none; user-select:none; }
.hv-arena::before { content:''; position:absolute; inset:0; pointer-events:none; opacity:.16; background-size:38px 66px; background-image:linear-gradient(30deg,transparent 47%,#fff 48%,#fff 50%,transparent 51%),linear-gradient(150deg,transparent 47%,#fff 48%,#fff 50%,transparent 51%); }
.hv-board { position:absolute; inset:0; width:100%; height:100%; overflow:visible; touch-action:none; }
.hv-world { transform-origin:0 0; }
.hv-piece { cursor:default; filter:drop-shadow(0 4px 2px rgba(0,0,0,.27)); }
.hv-piece.can { cursor:pointer; }
.hv-piece.can .t-face { stroke:var(--m-yellow); stroke-width:6; }
.hv-piece.sel .t-face { stroke:#fff; stroke-width:7; }
.hv-piece.last .t-face { stroke:var(--m-blue); stroke-width:5; }
.hv-piece.covered { opacity:.96; }
.hv-stack { pointer-events:none; }
.hv-stack circle { fill:var(--m-purple); stroke:#fff; stroke-width:2; }
.hv-stack text { fill:#fff; font:800 11px var(--font); text-anchor:middle; dominant-baseline:middle; }
.hv-target { cursor:pointer; }
.hv-target polygon { fill:transparent; stroke:#fff; stroke-width:4; stroke-dasharray:8 5; filter:drop-shadow(0 2px 1px rgba(0,0,0,.35)); animation:hvPulse .9s ease-in-out infinite alternate; pointer-events:all; }
.hv-target.hint polygon { stroke:var(--m-yellow); stroke-width:7; stroke-dasharray:none; }
.hv-path { fill:none; stroke:var(--m-yellow); stroke-width:5; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:8 7; pointer-events:none; }
@keyframes hvPulse { to { stroke-width:7; opacity:.72; } }
@keyframes hvArrive { 0% { opacity:.25; transform:translateY(-20px) scale(1.18); } 70% { transform:translateY(2px) scale(.98); } 100% { opacity:1; transform:none; } }
.hv-arrive { animation:hvArrive .34s cubic-bezier(.2,.8,.2,1) both; transform-box:fill-box; transform-origin:center; }
.hv-float { position:absolute; top:10px; right:10px; display:flex; flex-direction:column; gap:7px; z-index:3; }
.hv-float .iconbtn { background:var(--surface); color:var(--on); box-shadow:var(--z2); }
.hv-zoom { position:absolute; left:10px; bottom:9px; padding:5px 9px; background:var(--surface); color:var(--on2); box-shadow:var(--z1); border-radius:2px; font:700 10px var(--font); pointer-events:none; }
.hv-command { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; min-height:54px; padding:7px 10px; background:var(--surface); border-top:1px solid var(--line); z-index:4; }
.hv-status { min-width:0; }
.hv-status b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:800 14px var(--font); }
.hv-status span { display:block; color:var(--on2); font:500 12px var(--font); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hv-actions { display:flex; gap:3px; align-items:center; }
.hv-actions .iconbtn { width:40px; height:40px; }
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
:root[data-theme="dark"] .hv { --hv-board:#075941; --hv-board2:#043f30; }
@media (max-width:480px) {
  .hv-player { grid-template-columns:112px 1fr 28px; padding-inline:7px; min-height:62px; }
  .hv-who { gap:5px; font-size:11px; }
  .hv-who .avatar { transform:scale(.88); margin:-2px; }
  .hv-rpiece { width:43px; height:47px; }
  .hv-rpiece svg { width:42px; height:46px; }
  .hv-count { width:18px; height:18px; }
  .hv-danger { width:28px; }
  .hv-command { min-height:50px; padding:5px 7px; }
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
  const topBar = h('div.hv-player.top');
  const arena = h('div.hv-arena');
  const board = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  board.setAttribute('class', 'hv-board');
  board.setAttribute('role', 'application');
  board.setAttribute('aria-label', 'Swarmfront colony. Drag to pan and pinch or scroll to zoom.');
  const world = document.createElementNS(board.namespaceURI, 'g');
  world.setAttribute('class', 'hv-world');
  board.append(world);
  const floatTools = h('div.hv-float');
  const zoomLabel = h('div.hv-zoom', '100%');
  arena.append(board, floatTools, zoomLabel);
  const bottomBar = h('div.hv-player.bottom');
  const statusEl = h('div.hv-status');
  const actions = h('div.hv-actions');
  const command = h('div.hv-command', statusEl, actions);
  root.append(topBar, arena, bottomBar, command);
  api.root.append(h('style', CSS), root);

  let S = { moves: [], logs: [], result: null, version: 0 };
  let pos = new Position(opts);
  let selected = null;
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

  function fitBoard() {
    const cells = pos.occ.length ? pos.occ : [cellOf(0, 0)];
    const pts = cells.map(xyOf);
    const minX = Math.min(...pts.map((p) => p.x)) - 62;
    const maxX = Math.max(...pts.map((p) => p.x)) + 62;
    const minY = Math.min(...pts.map((p) => p.y)) - 64;
    const maxY = Math.max(...pts.map((p) => p.y)) + 74;
    const s = clamp(Math.min((view.w - 36) / (maxX - minX), (view.h - 34) / (maxY - minY)), .48, 1.42);
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
        hintMove = null;
        api.sfx(sel ? 'click' : 'pop', .55);
        render();
      },
    });
    btn.innerHTML = tileSVG(type, color === 0 ? 'w' : 'b', 46) + `<span class="hv-count">${count}</span>`;
    if (!bottom) btn.tabIndex = active ? 0 : -1;
    return btn;
  }

  function playerBar(color, bottom) {
    const id = idOf(color);
    const player = api.player(id);
    const danger = Math.max(0, pos.queenNeighbours(color));
    const reserve = h('div.hv-reserve', { 'aria-label': `${nameOf(id)} reserve` }, pos.types.map((t) => reserveButton(color, t, bottom)));
    const who = h('div.hv-who', avatarEl(player, 'sm', { still: true }), h('div.name', nameOf(id), h('small', color === 0 ? 'Ivory colony' : 'Onyx colony')));
    const pips = h('div.hv-danger', { title: `${danger} of 6 sides closed`, 'aria-label': `${danger} of 6 sides closed` }, Array.from({ length: 6 }, (_, i) => h('i' + (i < danger ? '.on' : ''))));
    const el = bottom ? bottomBar : topBar;
    el.classList.toggle('turn', pos.turn === color && !S.result);
    el.replaceChildren(who, reserve, pips);
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

  function drawBoard() {
    world.replaceChildren();
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
      const g = svg('g', { class: `hv-target${isHint ? ' hint' : ''}`, transform: `translate(${at.x} ${at.y - pos.H[move.to] * 9})`, role: 'button', tabindex: '0', 'aria-label': `Move to ${cellKey(move.to)}` });
      g.innerHTML = `<polygon points="${Array.from({ length: 6 }, (_, i) => { const a = (i * 60 + 30) * Math.PI / 180; return `${(37 * Math.cos(a)).toFixed(2)},${(37 * Math.sin(a)).toFixed(2)}`; }).join(' ')}"/>`;
      g.addEventListener('click', (e) => { e.stopPropagation(); submit(move); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); submit(move); } });
      world.append(g);
    }
    lastAnimatedVersion = S.version;
    worldTransform();
  }

  function statusText() {
    if (S.result) return S.result.text;
    const current = idOf(pos.turn);
    if (hintBusy) return 'Studying the colony…';
    if (api.isBot(current) && botBusy) return `${nameOf(current)} is thinking…`;
    if (!canAct()) return `${nameOf(current)} is choosing`;
    if (pos.mustPlaceQueen()) return 'Place your Monarch now';
    if (selected?.kind === 'reserve') return `Choose a space for ${LABEL[selected.type]}`;
    if (selected?.kind === 'board') return `Choose a destination for ${LABEL[typeOfPiece(pos.top(selected.cell))]}`;
    return pos.ply < 2 ? 'Deploy any creature' : 'Deploy or move one creature';
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
      iconBtn('info', 'Creature guide', showGuide),
      iconBtn('flag', 'Resign', resign),
    ];
    buttons[0].disabled = !canUndo();
    buttons[1].disabled = !canAct() || hintBusy || pos.legalMoves().every((m) => m.k === K_PASS);
    buttons[4].disabled = !!S.result || (myColor < 0 && !otb);
    actions.replaceChildren(...buttons);
  }

  function render() {
    const bottomColor = otb ? 0 : viewColor;
    playerBar(1 - bottomColor, false);
    playerBar(bottomColor, true);
    const current = idOf(pos.turn);
    statusEl.replaceChildren(
      h('b', statusText()),
      h('span' + (api.isBot(current) && botBusy ? '.hv-thinking' : ''), S.result ? `Finished after ${pos.ply} turns` : `${pos.ply + 1}. ${pos.turn === 0 ? 'Ivory' : 'Onyx'} to act`),
    );
    drawBoard();
    renderActions();
    if (freshBoard) { freshBoard = false; requestAnimationFrame(fitBoard); }
  }

  function showGuide() {
    const content = h('div.hv-sheet', h('h3', 'Creature guide'), h('div.hv-guide', pos.types.map((type) => {
      const art = h('div'); art.innerHTML = tileSVG(type, 'w', 48);
      return h('div.hv-guide-row', art, h('b', LABEL[type]), h('span', SHORT_RULE[type]));
    })), h('p.muted', 'Keep every piece connected. Ground creatures must slide through open gaps. Surround all six sides of the opposing Monarch to win.'));
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
      console.error('[swarmfront] rejected state at move', rebuilt.badAt);
      return;
    }
    pos = rebuilt;
    selected = null;
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
  board.addEventListener('click', (e) => { if (e.target === board) { selected = null; hintMove = null; render(); } });
  const resize = new ResizeObserver(() => {
    const rect = arena.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const first = view.w === 800 && view.h === 520;
    view.w = rect.width; view.h = rect.height;
    board.setAttribute('viewBox', `0 0 ${view.w} ${view.h}`);
    if (first) fitBoard(); else worldTransform();
  });
  resize.observe(arena);
  floatTools.append(iconBtn('gps_fixed', 'Recenter colony', fitBoard));

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
      H.result = { winner, text: draw ? 'The colonies are locked in a draw' : `${nameOf(idOf(winner))} surrounds the Monarch` };
      H.version++;
      publish(null, { sfx: 'result' });
      save();
      if (!ended) {
        ended = true;
        api.timeout(() => api.endGame({
          title: draw ? 'The colonies stand even' : `${nameOf(idOf(winner))} commands the swarm!`,
          subtitle: why || (draw ? `${H.moves.length} turns · simultaneous enclosure` : `Monarch surrounded in ${H.moves.length} turns`),
          ranking: draw ? ids.map((id) => ({ id, score: 'draw' })) : [winner, 1 - winner].map((c) => ({ id: idOf(c), score: c === winner ? 'victory' : 'defeat', note: `${H.pos.queenNeighbours(c)} around their Monarch` })),
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
  api.cleanup(() => { resize.disconnect(); stopHiveWorker(); });
  render();

  return { destroy() { resize.disconnect(); stopHiveWorker(); } };
}
