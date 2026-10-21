// The Hive rule book: a dark, gold-ruled book that opens over the table (rules, every insect with worked examples, strategy,
// display settings and the move record). Every diagram is computed by the real rules engine, so what it shows is always legal.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { Position, K_MOVE, qOf, rOf, cellOf } from '../engines/hive-rules.js';

export const BOOK_CSS = `
.hvb { position:absolute; inset:0; z-index:20; display:grid; place-items:center; padding:14px; background:rgba(8,6,4,.72); }
.hvb-page { position:relative; width:min(980px,100%); max-height:100%; display:grid; grid-template-rows:auto auto minmax(0,1fr); background:#13100c; color:#efe5d1; border:1px solid #7a5c30; border-radius:4px; box-shadow:inset 0 0 0 4px #13100c, inset 0 0 0 5px #3a2c18, 0 18px 50px rgba(0,0,0,.7); }
.hvb-head { display:flex; align-items:center; gap:14px; padding:16px 18px 10px; }
.hvb-head img { height:30px; width:auto; }
.hvb-head h2 { flex:1; margin:0; font:400 24px Georgia,'Times New Roman',serif; color:#f4ead6; }
.hvb-x { width:40px; height:40px; border-radius:50%; border:1px solid #6e5430; background:#1b1610; color:#efe5d1; display:grid; place-items:center; cursor:pointer; }
.hvb-x:hover { border-color:#d69a35; }
.hvb-tabs { display:flex; gap:4px; padding:0 18px; border-bottom:1px solid #2e2417; overflow-x:auto; scrollbar-width:none; }
.hvb-tabs button { flex:none; border:0; background:transparent; color:#b9aa8f; padding:10px 14px 11px; font:400 16px Georgia,'Times New Roman',serif; cursor:pointer; border-bottom:2px solid transparent; }
.hvb-tabs button.on { color:#f0c060; border-bottom-color:#d69a35; }
.hvb-body { overflow:auto; padding:18px 20px 24px; scrollbar-width:thin; }
.hvb-body h3 { margin:18px 0 8px; font:400 20px Georgia,'Times New Roman',serif; color:#f0c060; }
.hvb-body h3:first-child { margin-top:0; }
.hvb-body p,.hvb-body li { font:400 15px/1.55 Georgia,'Times New Roman',serif; color:#e3d8c3; }
.hvb-body ul { padding-left:20px; margin:6px 0 10px; }
.hvb-body li { margin:4px 0; }
.hvb-body b { color:#f4ead6; font-weight:700; }
.hvb-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:14px; }
.hvb-card { background:#18130e; border:1px solid #3a2c18; border-radius:3px; padding:12px 14px; }
.hvb-card header { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
.hvb-card header img { width:44px; height:44px; }
.hvb-card header b { font:400 19px Georgia,'Times New Roman',serif; }
.hvb-card header small { display:block; font:400 13px Georgia,serif; color:#b9aa8f; }
.hvb-dia { display:block; width:100%; height:auto; margin:6px 0 4px; background:#21180f; border:1px solid #2e2417; border-radius:2px; }
.hvb-cap { font:400 12.5px/1.4 Georgia,serif; color:#a99a80; margin:0; }
.hvb-steps { counter-reset:s; list-style:none; padding:0; }
.hvb-steps li { position:relative; padding:6px 0 6px 46px; min-height:38px; }
.hvb-steps li::before { counter-increment:s; content:counter(s); position:absolute; left:0; top:4px; width:34px; height:30px; display:grid; place-items:center; background:#1c1710; color:#e6a72a; font:400 16px Georgia,serif; clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%); }
.hvb-seg { display:flex; flex-wrap:wrap; gap:0; margin:8px 0 18px; border:1px solid #4a3920; border-radius:3px; overflow:hidden; width:max-content; max-width:100%; }
.hvb-seg button { border:0; border-right:1px solid #4a3920; background:#18130e; color:#e3d8c3; padding:10px 14px; font:400 15px Georgia,serif; cursor:pointer; }
.hvb-seg button:last-child { border-right:0; }
.hvb-seg button.on { background:#d69a35; color:#1b1207; }
.hvb-log { display:grid; }
.hvb-log div { display:grid; grid-template-columns:38px 30px 1fr; gap:10px; align-items:center; padding:8px 0; border-top:1px solid #2a2117; font:400 14.5px Georgia,serif; color:#e3d8c3; }
.hvb-log div b { color:#8f8270; font-weight:400; text-align:right; }
.hvb-log img { width:28px; height:28px; }
@container hv (max-width:560px) { .hvb { padding:0; } .hvb-page { height:100%; border-radius:0; } .hvb-head h2 { font-size:20px; } .hvb-body { padding:14px 14px 22px; } }
`;

const OPTS = { mosquito: true, ladybug: true, pillbug: true };
const NAMES = { Q: 'Queen Bee', A: 'Soldier Ant', S: 'Spider', G: 'Grasshopper', B: 'Beetle', M: 'Mosquito', L: 'Ladybug', P: 'Pillbug' };
const COLOR = { Q: '#FBBC05', A: '#4285F4', S: '#EA4335', G: '#34A853', B: '#A142F4', M: '#12B5CB', L: '#FF6D00', P: '#F538A0' };

// A small, real position per insect (white to move); the highlighted stone is the first white piece of that type.
const EX = {
  Q: { list: [[0, 'A', 0, 0], [1, 'Q', 1, -1], [0, 'Q', -1, 1], [1, 'G', 1, 0]], at: [-1, 1], text: 'One step at a time, round the outside of the hive.' },
  A: { list: [[0, 'Q', 0, 0], [1, 'Q', 1, -1], [1, 'S', 2, -1], [0, 'B', 0, 1], [1, 'G', 1, 0], [0, 'A', -1, 0]], at: [-1, 0], text: 'Anywhere it can slide to around the edge: here, ten different spaces.' },
  S: { list: [[0, 'Q', 0, 0], [1, 'Q', 1, -1], [1, 'A', 2, -1], [0, 'B', 0, 1], [1, 'G', 1, 0], [0, 'S', -1, 0]], at: [-1, 0], text: 'Exactly three steps along the edge, never back on itself: only two endings.' },
  G: { list: [[0, 'Q', 0, 0], [1, 'Q', 1, -1], [1, 'S', 2, -1], [0, 'B', 0, 1], [1, 'A', 1, 0], [0, 'G', -1, 0]], at: [-1, 0], text: 'Leaps in a straight line over the row of pieces to the first gap.' },
  B: { list: [[0, 'Q', 0, 0], [1, 'Q', 1, -1], [1, 'S', 2, -1], [0, 'A', 0, 1], [1, 'G', 1, 0], [0, 'B', -1, 0]], at: [-1, 0], text: 'One step, but it may climb straight on top of the Queen beside it.' },
  M: { list: [[0, 'Q', 0, 0], [1, 'Q', 1, -1], [1, 'S', 2, -1], [0, 'A', 0, 1], [1, 'G', 1, 0], [0, 'M', -1, 0]], at: [-1, 0], text: 'Moves as any insect it touches: here it borrows the Queen’s single step.' },
  L: { list: [[0, 'Q', 0, 0], [1, 'Q', 1, -1], [1, 'S', 2, -1], [0, 'A', 0, 1], [1, 'G', 1, 0], [0, 'L', -1, 0]], at: [-1, 0], text: 'Two steps over the top of the hive, then one step down into a gap.' },
  P: { list: [[0, 'Q', 0, 0], [1, 'Q', 1, -1], [1, 'S', 2, -1], [0, 'A', 0, 1], [1, 'G', 1, 0], [0, 'P', -1, 0]], at: [-1, 0], text: 'Slides one step, or lifts a neighbour over itself to a free space.' },
};
const DETAIL = {
  Q: ['Moves exactly one space.', 'Must be placed by your fourth turn.', 'You cannot move any piece until she is on the table.', 'Surround her on all six sides and that player loses.'],
  A: ['Slides any number of spaces around the outside of the hive.', 'The most flexible piece: great for blocking and for filling the last gap.', 'Cannot squeeze through a gap too narrow to slide through.'],
  S: ['Slides exactly three spaces, no more, no less.', 'May not visit the same space twice in a move.', 'Great at slipping into tight spots the Queen cannot reach.'],
  G: ['Jumps in a straight line over one or more pieces.', 'Lands in the first empty space after the line.', 'Ignores the sliding rule: it can jump into a gap that is otherwise sealed.'],
  B: ['Moves one space, and may climb on top of the hive.', 'A piece with a Beetle on it cannot move, and takes on the Beetle’s colour for placing.', 'From on top it can step down into a gap that is sealed on the ground.'],
  M: ['Copies the movement of any insect it touches.', 'On top of the hive it can only move like a Beetle.', 'Touching only another Mosquito, it cannot move.'],
  L: ['Moves exactly three: two steps on top of the hive, then one down.', 'Can drop into enclosed gaps, but never ends on top.'],
  P: ['Moves one space like the Queen.', 'Or picks up an adjacent unstacked piece and sets it down in another empty space next to itself.', 'A piece that has just moved cannot be lifted, and the lifted piece is stuck for a turn.'],
};

const SQ3 = Math.sqrt(3);
/** An SVG diagram of an example position with every legal move of the highlighted piece. thumb(type, colour) gives a picture URL. */
export function exampleDiagram(type, thumb) {
  const ex = EX[type]; if (!ex) return null;
  const pos = Position.setup(OPTS, ex.list, 0);
  const from = cellOf(ex.at[0], ex.at[1]);
  const moves = pos.legalMoves().filter((m) => m.k === K_MOVE && m.from === from);
  const S = 26, xy = (q, r) => ({ x: S * 1.5 * q, y: S * SQ3 * (r + q / 2) });
  const pts = [...ex.list.map(([, , q, r]) => xy(q, r)), ...moves.map((m) => xy(qOf(m.to), rOf(m.to)))];
  const minX = Math.min(...pts.map((p) => p.x)) - S * 1.6, maxX = Math.max(...pts.map((p) => p.x)) + S * 1.6;
  const minY = Math.min(...pts.map((p) => p.y)) - S * 1.5, maxY = Math.max(...pts.map((p) => p.y)) + S * 1.5;
  const hexP = (x, y, r) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k; return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
  let out = `<svg class="hvb-dia" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" role="img" aria-label="${NAMES[type]} example: ${moves.length} legal moves">`;
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) { const p = xy(q, r); if (p.x > minX - S && p.x < maxX + S && p.y > minY - S && p.y < maxY + S) out += `<polygon points="${hexP(p.x, p.y, S - 1)}" fill="none" stroke="#3a2b19" stroke-width="1"/>`; }
  const col = COLOR[type];
  for (const m of moves) {
    const path = pos.pathOf(m).map((c) => xy(qOf(c), rOf(c)));
    const d = path.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-opacity=".75" stroke-linejoin="round"/>`;
  }
  for (const m of moves) { const p = xy(qOf(m.to), rOf(m.to)); out += `<polygon points="${hexP(p.x, p.y, S - 3)}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="2.4"/>`; }
  for (const [c, t, q, r] of ex.list) {
    const p = xy(q, r), sel = q === ex.at[0] && r === ex.at[1];
    out += `<image href="${thumb(t, c)}" x="${p.x - S * 1.12}" y="${p.y - S * 1.12 - (sel ? 4 : 0)}" width="${S * 2.24}" height="${S * 2.24}"/>`;
    if (sel) out += `<polygon points="${hexP(p.x, p.y - 4, S - 1)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity=".9"/>`;
  }
  return out + '</svg>';
}

/** Open the book over the table. ctx: { host, thumb, types, prefs, savePrefs, onPrefs, history(), close? } */
export function openBook(ctx, tab = 'rules') {
  const tabs = [['rules', 'Rules'], ['pieces', 'The Insects'], ['strategy', 'Strategy'], ['table', 'Using the Table'], ['display', 'Display'], ['moves', 'Moves']];
  const body = h('div.hvb-body');
  const tabBar = h('nav.hvb-tabs');
  const close = () => { veil.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', onKey);
  const veil = h('div.hvb', { onclick: (e) => { if (e.target === veil) close(); } },
    h('div.hvb-page', { role: 'dialog', 'aria-label': 'Hive rule book' },
      h('header.hvb-head', h('img', { src: 'assets/hive3d/logo.svg', alt: 'Hive' }), h('h2', 'Rule Book'), h('button.hvb-x', { 'aria-label': 'Close', onclick: close }, icon('close'))),
      tabBar, body));
  const P = (t) => h('p', t);
  const thumbImg = (t, c = 0) => h('img', { src: ctx.thumb(t, c), alt: '' });
  const pages = {
    rules: () => [
      h('h3', 'The goal'), P('Surround your opponent’s Queen Bee on all six sides, with pieces of either colour. If both Queens are surrounded by the same move, the game is a draw.'),
      h('h3', 'A turn'), h('ol.hvb-steps', h('li', h('b', 'Place'), ' a new piece from your tray, or'), h('li', h('b', 'move'), ' one of your pieces already on the table.')),
      h('h3', 'Placing'), h('ul', h('li', 'The very first piece goes anywhere; the second touches it.'), h('li', 'After that, a new piece must touch your own colour and must not touch your opponent’s.'), h('li', 'Your Queen Bee must be on the table by your fourth turn.'), h('li', 'You cannot move anything until your Queen is placed.')),
      h('h3', 'One hive'), P('All pieces must always form one connected group, including while a piece is in motion. A piece whose removal would split the hive is pinned and cannot move.'),
      h('h3', 'Freedom to move'), P('Pieces that slide (Queen, Ant, Spider, Pillbug) must physically fit: they cannot squeeze between two pieces that leave too narrow a gap, and they must stay in contact with the hive as they go. The Grasshopper, Beetle and Ladybug get around this by jumping or climbing.'),
      h('h3', 'Stacking'), P('Beetles (and a Mosquito next to a Beetle) can climb onto the hive. A covered piece cannot move. For placing, a stack counts as the colour of its top piece.'),
      h('h3', 'No legal move'), P('If you can neither place nor move, you pass. The table does this for you.'),
    ],
    pieces: () => [h('div.hvb-grid', ctx.types.map((t) => {
      const card = h('section.hvb-card', h('header', thumbImg(t), h('div', h('b', NAMES[t]), h('small', `${{ Q: 1, A: 3, S: 2, G: 3, B: 2, M: 1, L: 1, P: 1 }[t]} per player`))));
      const dia = h('div'); dia.innerHTML = exampleDiagram(t, ctx.thumb) || '';
      card.append(dia, h('p.hvb-cap', EX[t]?.text || ''), h('ul', DETAIL[t].map((l) => h('li', l))));
      return card;
    }))],
    strategy: () => [
      h('h3', 'Opening'), h('ul', h('li', 'Hold your Queen back for a turn or two, but never risk the fourth-turn deadline.'), h('li', 'Keep your Queen on the edge where it can still slide; a Queen with no room to move is half lost.'), h('li', 'Do not place your Ants early: they are your strongest pieces once the hive has a long edge to run along.')),
      h('h3', 'Pinning'), h('ul', h('li', 'A piece that holds the hive together cannot move. Count how many of your opponent’s pieces are pinned; every pinned piece is a piece they cannot use.'), h('li', 'An Ant dropped next to an enemy piece on the edge can freeze it in place.'), h('li', 'A Beetle on top of an enemy piece freezes it completely, Queen included.')),
      h('h3', 'Attacking the Queen'), h('ul', h('li', 'Pieces of either colour count towards the six sides, so your opponent’s own pieces help you.'), h('li', 'The last gap is usually filled by a Grasshopper jump, an Ant run or a Beetle drop: keep one of each ready.'), h('li', 'Before you commit, check you are not one move from losing yourself.')),
      h('h3', 'Defending'), h('ul', h('li', 'Keep at least one free space beside your Queen that only a slider can reach, and make sure it is sealed against sliding.'), h('li', 'A Beetle sitting on your own Queen’s neighbour can be lifted off a crowded side later.'), h('li', 'Use your Pillbug to throw attackers away from your Queen.')),
    ],
    table: () => [
      h('h3', 'Placing a piece'), h('ol.hvb-steps', h('li', 'Tap an insect in your tray (bottom of the table).'), h('li', 'Green outlines show every space it may go. Tap one: a ghost of the piece appears there.'), h('li', 'Tap the ', h('b', 'green check'), ' beside it to confirm, or the ', h('b', 'red cross'), ' to change your mind.')),
      h('h3', 'Moving a piece'), h('ol.hvb-steps', h('li', 'Tap one of your pieces on the table. It lifts, and its moves light up in its insect’s colour.'), h('li', 'With path hints on, arrows show the route it takes; jumps arc high over the hive.'), h('li', 'Tap a destination, then the green check.')),
      h('h3', 'Looking around'), h('ul', h('li', 'Drag to pan, pinch or scroll to zoom.'), h('li', 'The honeycomb button (top right) opens Undo, Hint, Frame (fit the whole hive), this book, Display and Resign.'), h('li', 'Enter confirms a pending move, Esc cancels.')),
    ],
    display: () => {
      const seg = (key, opts) => h('div.hvb-seg', opts.map(([v, label]) => h('button' + (ctx.prefs[key] === v ? '.on' : ''), { onclick: (e) => { ctx.prefs[key] = v; ctx.savePrefs(); [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); ctx.onPrefs(); } }, label)));
      return [
        h('h3', 'Move hints'), P('Off shows nothing. Destinations outlines where the chosen piece can go. Paths adds the route. All pieces shows every move on the table at once and lifts each of your pieces in turn.'),
        seg('hints', [[0, 'Off'], [1, 'Destinations'], [2, 'Paths'], [3, 'All pieces']]),
        h('h3', 'Piece rotation'), P('How each stone lies after it is placed or moved.'),
        seg('rotation', [['off', 'Upright'], ['neat', 'Neat'], ['natural', 'Natural']]),
      ];
    },
    moves: () => {
      const rows = ctx.history();
      return [rows.length ? h('div.hvb-log', rows.map((r) => { const d = h('div', h('b', String(r.n)), r.type ? thumbImg(r.type, r.color) : h('span'), h('span', `${r.color === 0 ? 'White' : 'Black'} · ${r.text}`)); return d; })) : P('No moves yet.')];
    },
  };
  const show = (k) => {
    tabBar.replaceChildren(...tabs.map(([id, label]) => h('button' + (id === k ? '.on' : ''), { onclick: () => show(id) }, label)));
    body.replaceChildren(...pages[k]()); body.scrollTop = 0;
  };
  show(tab);
  ctx.host.append(veil);
  return close;
}
