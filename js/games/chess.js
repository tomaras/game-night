// Chess — 2 players, or over the board on one device. Rules are enforced by the vendored chess.js on the host;
// clients render the position they are sent. Piece artwork: "Cburnett" set from Wikimedia Commons (BSD / GPL / GFDL).
//
// Features: time controls with increments · drag-and-drop or tap · legal-move dots, last move, check · premoves ·
// move list you can step through (and keyboard arrows) · captured pieces & material · flip board · takebacks ·
// draw offers / resign / abort · hints and an evaluation bar (against the computer, over the board, or after a game) ·
// over-the-board mode (black's pieces face the other player) · board colours, coordinates, sounds · copy PGN / FEN.
import { glide, popIn, popOut, shake } from '../motion.js';
import { h, copyText } from '../util.js';
import { avatarEl } from '../avatar.js';
import { icon, confirmDialog, openPopover, openMenu, switchEl, toast } from '../ui.js';
import { Chess } from '../../vendor/chess.js';
import { chooseMoveAsync, analyzeAsync, stopChessWorker } from '../engines/chessai.js';
import { thinkMs } from '../bots.js';

const FILES = 'abcdefgh';
const START = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const piece = (color, type) => `assets/chess/${color === 'w' ? 'l' : 'd'}${type}.svg`;
const THEMES = { green: ['#ebecd0', '#739552', '#4b4847', 'Green'], classic: ['#f0d9b5', '#b58863', '#6b4a2b', 'Wood'], blue: ['#dee3e6', '#8ca2ad', '#4a5d68', 'Ice'], slate: ['#cfd4dc', '#6b7a8f', '#394456', 'Slate'], rose: ['#f6e0e6', '#c58a9d', '#7a4a5a', 'Rose'], night: ['#9aa3b8', '#4b5573', '#272d42', 'Night'] };
const tcOf = (v) => { if (typeof v === 'number') return v ? { min: v, inc: 2 } : { min: 0, inc: 0 }; const m = /^(\d+)\+(\d+)$/.exec(String(v)); return m ? { min: +m[1], inc: +m[2] } : { min: 0, inc: 0 }; };
const loadPrefs = () => { try { return { theme: 'green', coords: true, sound: true, eval: false, rotate: true, premove: true, dots: true, ...JSON.parse(localStorage.getItem('gn.chess2') || '{}') }; } catch { return { theme: 'green', coords: true, sound: true, eval: false, rotate: true, premove: true, dots: true }; } };
const fmt = (ms) => { if (ms < 10000) return (Math.max(0, ms) / 1000).toFixed(1); const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const CSS = `
.ch { flex:1; min-height:0; display:flex; gap:16px; padding:4px 0 8px; justify-content:center; align-items:center; overflow-y:auto; background:#302e2b; color:#fff; --bs:min(100cqw, calc(100cqh - 214px), 660px); --sqL:#ebecd0; --sqD:#739552; --frame:#4b4847; }
.ch-main { display:flex; flex-direction:column; gap:6px; align-items:center; }
.ch-pl { display:flex; align-items:center; gap:10px; width:var(--bs); padding:0 8px; min-height:48px; }
.ch-pl.rot { transform:rotate(180deg); }
.ch-pl .av { flex:none; }
.ch-pl .who { display:flex; flex-direction:column; min-width:0; flex:1; }
.ch-pl .nm { font-weight:500; font-size:14.5px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; gap:6px; align-items:center; }
.ch-pl .nm i { display:none; }
.ch-cap { display:flex; align-items:center; height:18px; }
.ch-cap img { width:16px; height:16px; margin-right:-6px; }
.ch-cap img { filter:brightness(1.05); } .ch-cap b { margin-left:10px; font-size:12px; color:rgba(255,255,255,.6); font-weight:500; }
.ch-clock { font:500 22px var(--font); font-variant-numeric:tabular-nums; background:#262421; border-radius:var(--r); padding:6px 12px; min-width:104px; text-align:right; color:rgba(255,255,255,.55); transition:background-color .2s, color .2s; }
.ch-clock.turn { background:#fff; color:#262421; }
.ch-clock.low.turn { background:#e53935; color:#fff; }
.ch-pl.active .nm { color:#fff; }
.ch-row { display:flex; gap:6px; align-items:stretch; }
.ch-eval { width:14px; border-radius:7px; overflow:hidden; background:#262b33; position:relative; flex:none; }
.ch-eval .ew { position:absolute; left:0; right:0; bottom:0; background:#f4f4f4; transition:height .45s ease; }
.ch-eval small { position:absolute; left:0; right:0; font:800 8px var(--font); text-align:center; color:#888; }
.ch-boardwrap { width:var(--bs); height:var(--bs); position:relative; touch-action:none; }
.ch-board { width:100%; height:100%; display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr); overflow:hidden; user-select:none; -webkit-user-select:none; }
.ch-sq { position:relative; cursor:pointer; display:grid; place-items:center; }
.ch-sq.l { background:var(--sqL); } .ch-sq.d { background:var(--sqD); }
.ch-sq.last::before { content:''; position:absolute; inset:0; background:rgba(255,255,51,.5); }
.ch-sq.sel::before { content:''; position:absolute; inset:0; background:rgba(255,255,51,.5); }
.ch-sq.mark::after { content:''; position:absolute; inset:0; background:rgba(235,97,80,.8); }
.ch-sq.pre::before { content:''; position:absolute; inset:0; background:rgba(235,90,40,.5); }
.ch-sq.chk::before { content:''; position:absolute; inset:0; background:radial-gradient(circle, rgba(255,40,40,.95) 0%, rgba(255,40,40,.55) 40%, transparent 72%); }
.ch-sq.over::after { content:''; position:absolute; inset:0; box-shadow:inset 0 0 0 calc(var(--bs) / 90) rgba(255,255,255,.85); }
.ch-sq .mv { position:absolute; width:32%; height:32%; border-radius:50%; background:rgba(0,0,0,.14); }
.ch-sq .cp { position:absolute; inset:0; border-radius:50%; border:calc(var(--bs) / 64) solid rgba(0,0,0,.14); }
.ch-pcs { position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; }
.ch-pc { position:absolute; left:0; top:0; width:12.5%; height:12.5%; display:grid; place-items:center; will-change:translate; }
.ch-pc img { width:100%; height:100%; filter:drop-shadow(0 1px 1px rgba(0,0,0,.25)); transition:filter .2s, opacity .15s; transform-origin:50% 60%; }
.ch-pc.flying { z-index:6; } .ch-pc.flying img { filter:drop-shadow(0 11px 7px rgba(0,0,0,.34)); }
.ch-pc img.rot { transform:rotate(180deg); }
.ch-pc.ghost img { opacity:.25; }
.ch-pc.fallen img { filter:drop-shadow(0 1px 1px rgba(0,0,0,.2)); }
.ch-sq small { position:absolute; z-index:3; font-weight:700; font-size:calc(var(--bs) / 34); line-height:1; opacity:.95; pointer-events:none; }
.ch-sq.l small { color:var(--sqD); } .ch-sq.d small { color:var(--sqL); }
.ch-sq small.f { right:4%; bottom:2%; } .ch-sq small.rk { left:4%; top:3%; }
.ch-arrows { position:absolute; inset:0; z-index:5; pointer-events:none; }
.ch-promo { position:absolute; inset:0; z-index:9; background:rgba(16,20,30,.55); border-radius:6px; display:grid; place-items:center; }
.ch-promo div { display:flex; gap:8px; background:var(--surface); padding:12px; border-radius:var(--r); box-shadow:var(--e3); }
.ch-promo button { width:calc(var(--bs) / 6); height:calc(var(--bs) / 6); border-radius:var(--r); border:0; background:var(--s2); cursor:pointer; display:grid; place-items:center; }
.ch-promo button:hover { background:var(--blue-c); } .ch-promo img { width:90%; height:90%; }
.ch-dragimg { position:fixed; z-index:200; pointer-events:none; filter:drop-shadow(0 8px 10px rgba(0,0,0,.35)); transform:translate(-50%,-62%) scale(1.15); }
.ch-status { font:400 14px var(--font); text-align:center; min-height:20px; color:rgba(255,255,255,.7); width:var(--bs); }
.ch-status.big { color:#fff; font-weight:500; font-size:16px; }
.ch-ctl { display:flex; gap:2px; width:var(--bs); justify-content:space-between; padding:0 4px; }
.ch-ctl button { position:relative; overflow:hidden; flex:1; min-width:0; height:52px; border:0; border-radius:var(--r); background:transparent; color:rgba(255,255,255,.75); cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font:500 11px var(--font); }
.ch-ctl button:hover:not(:disabled) { background:rgba(255,255,255,.07); color:#fff; }
.ch-ctl button .ic { width:22px; height:22px; } .ch-ctl button:disabled { opacity:.3; cursor:default; } .ch-ctl button.on { color:#81b64c; }
.ch-ctl button.bad { color:#ef7a6e; } .ch-ctl button.good { background:#81b64c; color:#fff; }
.ch-strip { display:flex; gap:2px; align-items:center; width:var(--bs); padding:2px 8px !important; background:#262421; overflow-x:auto; scrollbar-width:none; white-space:nowrap; min-height:30px; padding:2px 0; font:600 13px var(--font); }
.ch-strip::-webkit-scrollbar { display:none; }
.ch-strip b { color:rgba(255,255,255,.4); font-weight:600; margin:0 2px 0 8px; font-size:12px; }
.ch-strip button, .ch-side button.mvb { border:0; background:transparent; color:rgba(255,255,255,.85); font:inherit; padding:3px 6px; border-radius:8px; cursor:pointer; }
.ch-strip button.cur, .ch-side button.mvb.cur { background:rgba(255,255,255,.16); color:#fff; }
.ch-side { display:none; width:240px; flex-direction:column; gap:8px; max-height:calc(var(--bs) + 130px); }
.ch-moves { flex:1; overflow-y:auto; background:#262421; color:#fff; border-radius:var(--r); padding:10px; display:grid; grid-template-columns:30px 1fr 1fr; gap:2px 4px; align-content:start; min-height:120px; font:500 14px var(--font); }
.ch-moves b { color:rgba(255,255,255,.4); font-weight:600; padding:3px 0; }
.ch-nav { display:flex; gap:6px; justify-content:center; } .ch-nav button { width:44px; height:38px; border:0; border-radius:var(--r); background:#3c3a37; color:#fff; cursor:pointer; display:grid; place-items:center; } .ch-nav button:disabled { opacity:.35; }
@container (min-width: 860px) { .ch { --bs:min(calc(100cqh - 196px), calc(100cqw - 400px), 720px); padding-top:10px; } .ch-boardwrap { box-shadow:0 6px 18px rgba(0,0,0,.45); } .ch-board { border-radius:3px; } .ch-side { display:flex; } .ch-strip { display:none; } }
.ch-set { display:flex; flex-direction:column; gap:10px; min-width:230px; }
.ch-set h4 { margin:0 0 2px; font:700 13px var(--font); text-transform:uppercase; letter-spacing:.8px; color:var(--on3); }
.ch-swatches { display:flex; gap:8px; flex-wrap:wrap; } .ch-swatches button { width:42px; height:42px; border-radius:var(--r); border:3px solid transparent; padding:0; overflow:hidden; cursor:pointer; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; } .ch-swatches button.on { border-color:var(--blue); }
.ch-swatches i { display:block; }
.ch-set .sw-row { margin:0; font-size:14px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const otb = !!api.opts.otb; // two people, one device: both sides are played on this screen
  const side = api.opts.side; // the room creator's colour (ids[0]); anything else is random
  const white = otb ? ids[0] : side === 'white' ? ids[0] : side === 'black' ? ids[1] : ids[api.seed % 2];
  const black = ids.find((i) => i !== white);
  const idOf = (c) => (c === 'w' ? white : black);
  const colorOf = (id) => (id === white ? 'w' : id === black ? 'b' : null);
  const myFixed = colorOf(api.me); // null for someone watching
  const tc = api.async ? { min: 0, inc: 0 } : tcOf(api.opts.time);
  const timed = tc.min > 0;
  const INC = tc.inc * 1000;
  const vsBot = api.players.some((p) => p.bot);
  const prefs = loadPrefs();
  const savePrefs = () => { try { localStorage.setItem('gn.chess2', JSON.stringify(prefs)); } catch { /* */ } };
  const sfx = (n) => { if (prefs.sound) api.sfx(n); };

  const game = new Chess(); // the live position
  let S = { fen: game.fen(), last: null, san: [], turn: 'w', over: null, clock: { w: tc.min * 60000, b: tc.min * 60000 }, drawOffer: null, tb: null, stamp: performance.now() };
  let hist = { fens: [game.fen()], mv: [] }; // every position of the game, so any move can be reviewed
  let view = null; // null = live, otherwise the number of half-moves shown
  let opt = null, dropAt = null; // opt: my move shown before the host confirms it; dropAt: where a dragged piece was let go
  let marks = new Set(), arrows = [], rdown = null; // right-click annotations: marked squares and arrows ('e2e4')
  let sel = null, targets = [], promo = null, premove = null, hint = null, userFlip = false, evalCp = null, drag = null, evalToken = 0;
  const mySide = () => (otb ? S.turn : myFixed);
  const canAnalyze = () => otb || vsBot || !!S.over;
  const flipped = () => (myFixed === 'b') !== userFlip;

  // ---------------------------------------------------------------- DOM
  const boardEl = h('div.ch-board');
  const arrowEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrowEl.setAttribute('class', 'ch-arrows'); arrowEl.setAttribute('viewBox', '0 0 8 8');
  const pcLayer = h('div.ch-pcs');
  const wrapEl = h('div.ch-boardwrap', boardEl, pcLayer, arrowEl);
  const evalEl = h('div.ch-eval', h('div.ew'));
  const rowEl = h('div.ch-row', evalEl, wrapEl);
  const topPl = h('div.ch-pl'), botPl = h('div.ch-pl');
  const statusEl = h('div.ch-status');
  const strip = h('div.ch-strip');
  const ctl = h('div.ch-ctl');
  const movesEl = h('div.ch-moves');
  const nav = h('div.ch-nav');
  const rootEl = h('div.ch', [h('div.ch-main', topPl, rowEl, botPl, statusEl, ctl, strip), h('div.ch-side', nav, movesEl)]);
  api.root.append(h('style', CSS), rootEl);
  api.root.style.containerType = 'size';

  function applyTheme() { const t = THEMES[prefs.theme] || THEMES.green; rootEl.style.setProperty('--sqL', t[0]); rootEl.style.setProperty('--sqD', t[1]); rootEl.style.setProperty('--frame', t[2]); }
  applyTheme();

  // ---------------------------------------------------------------- state
  function rebuild() {
    const g = new Chess();
    const fens = [g.fen()], mv = [];
    for (const s of S.san) { const m = g.move(s); if (!m) break; mv.push({ from: m.from, to: m.to, san: m.san, cap: m.captured, color: m.color }); fens.push(g.fen()); }
    hist = { fens, mv };
  }
  const shownFen = () => (view === null ? (opt ? opt.fen : S.fen) : hist.fens[Math.min(view, hist.fens.length - 1)]);
  const shownMove = () => { if (view === null && opt) return opt; const i = view === null ? hist.mv.length : view; const m = hist.mv[i - 1]; return m ? { from: m.from, to: m.to, promo: /=/.test(m.san) } : null; };
  const shownLast = () => { const i = view === null ? hist.mv.length : view; const m = hist.mv[i - 1]; return m ? [m.from, m.to] : null; };
  const clockNow = (c) => (timed && !S.over && S.turn === c && S.san.length > 0 ? Math.max(0, S.clock[c] - (performance.now() - S.stamp)) : S.clock[c]);

  function captured(board) {
    const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const row of board) for (const p of row) if (p && p.type !== 'k') have[p.color][p.type]++;
    const lost = (c) => { const out = []; for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = 0; i < START[t] - have[c][t]; i++) out.push(t); return out; };
    return { w: lost('w'), b: lost('b') };
  }
  const material = (c, cap) => cap[c === 'w' ? 'b' : 'w'].reduce((a, t) => a + VAL[t], 0) - cap[c].reduce((a, t) => a + VAL[t], 0);
  const findKing = (board, color) => { for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = board[r][f]; if (p && p.type === 'k' && p.color === color) return FILES[f] + (8 - r); } return null; };

  // ---------------------------------------------------------------- rendering
  function renderPlayers(board) {
    const cap = captured(board);
    const topC = flipped() ? 'w' : 'b', botC = flipped() ? 'b' : 'w';
    const mk = (c, el) => {
      const p = api.player(idOf(c));
      const got = cap[c === 'w' ? 'b' : 'w'];
      const adv = material(c, cap);
      el.className = 'ch-pl' + (S.turn === c && !S.over ? ' active' : '') + (otb && prefs.rotate && c === topC ? ' rot' : '');
      const name = otb ? (c === 'w' ? 'White' : 'Black') + ' · ' + p.name : p.name + (p.id === api.me ? ' (you)' : '');
      el.replaceChildren(
        avatarEl({ ...p, online: p.online && !p.left }, 'lg', { still: true }),
        h('div.who', [h('div.nm', h('i', { style: { background: c === 'w' ? '#fff' : '#222' } }), name), h('div.ch-cap', got.map((t) => h('img', { src: piece(c === 'w' ? 'b' : 'w', t), alt: '' })), adv > 0 ? h('b', '+' + adv) : null)]),
        timed ? h('div.ch-clock' + (S.turn === c && !S.over ? '.turn' : '') + (clockNow(c) < 20000 ? '.low' : ''), { 'data-c': c }, fmt(clockNow(c))) : null
      );
    };
    mk(topC, topPl);
    mk(botC, botPl);
  }

  function drawArrows() {
    arrowEl.replaceChildren();
    const arrow = (a, b, color) => {
      const fl = flipped();
      const pt = (sq) => { const f = FILES.indexOf(sq[0]), r = 8 - +sq[1]; return [(fl ? 7 - f : f) + 0.5, (fl ? 7 - r : r) + 0.5]; };
      const [x1, y1] = pt(a), [x2, y2] = pt(b);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const hx = x2 - ux * 0.32, hy = y2 - uy * 0.32;
      const ns = 'http://www.w3.org/2000/svg';
      const line = document.createElementNS(ns, 'line');
      for (const [k, v] of Object.entries({ x1, y1, x2: hx, y2: hy, stroke: color, 'stroke-width': 0.17, 'stroke-linecap': 'round', opacity: 0.85 })) line.setAttribute(k, v);
      const head = document.createElementNS(ns, 'polygon');
      head.setAttribute('points', `${x2},${y2} ${hx - uy * 0.22},${hy + ux * 0.22} ${hx + uy * 0.22},${hy - ux * 0.22}`);
      head.setAttribute('fill', color); head.setAttribute('opacity', 0.85);
      arrowEl.append(line, head);
    };
    for (const a of arrows) arrow(a.slice(0, 2), a.slice(2, 4), '#ffaa00');
    if (hint && view === null) arrow(hint.from, hint.to, '#2e9e4f');
    if (premove) arrow(premove.from, premove.to, '#eb5a28');
  }

  function render() {
    const g = new Chess(shownFen());
    const board = g.board();
    const live = view === null;
    const kingSq = g.isCheck() ? findKing(board, g.turn()) : null;
    const last = shownLast();
    const fl = flipped();
    const topC = fl ? 'w' : 'b';
    const cells = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rr = fl ? 7 - r : r, ff = fl ? 7 - f : f;
        const sq = FILES[ff] + (8 - rr);
        const pc = board[rr][ff];
        const light = (rr + ff) % 2 === 0;
        const tgt = live && prefs.dots && targets.find((m) => m.to === sq);
        const cls = 'div.ch-sq.' + (light ? 'l' : 'd') + (last && (last[0] === sq || last[1] === sq) ? '.last' : '') + (live && sel === sq ? '.sel' : '') + (kingSq === sq ? '.chk' : '') + (live && premove && (premove.from === sq || premove.to === sq) ? '.pre' : '') + (marks.has(sq) ? '.mark' : '');
        cells.push(h(cls, { 'data-sq': sq }, [
          f === 0 && prefs.coords ? h('small.rk', String(8 - rr)) : null,
          r === 7 && prefs.coords ? h('small.f', FILES[ff]) : null,
          tgt ? h(pc ? 'div.cp' : 'div.mv') : null,
        ]));
      }
    }
    boardEl.replaceChildren(...cells);
    syncPieces(board, fl, g);
    wrapEl.querySelector('.ch-promo')?.remove();
    if (promo) {
      const col = mySide();
      wrapEl.append(h('div.ch-promo', h('div', ['q', 'r', 'b', 'n'].map((t) => h('button', { 'aria-label': 'Promote to ' + t, onclick: () => { const m = promo; promo = null; submit({ ...m, promotion: t }); } }, h('img', { src: piece(col, t), alt: t }))))));
    }
    drawArrows();
    renderMoves();
    renderStatus(g);
    renderControls();
    renderPlayers(game.board());
    renderEval();
  }


  // ---------------------------------------------------------------- pieces (persistent elements that glide between squares)
  const pcs = new Map(); // square -> { el, color, type, sq }
  const sqXY = (sq, fl) => { const f = FILES.indexOf(sq[0]), r = 8 - +sq[1]; return { x: (fl ? 7 - f : f) * 100, y: (fl ? 7 - r : r) * 100 }; };
  let lastFl = null;
  function syncPieces(board, fl, g) {
    const lm = shownMove();
    const topC = fl ? 'w' : 'b';
    const next = [];
    for (let rr = 0; rr < 8; rr++) for (let ff = 0; ff < 8; ff++) { const p = board[rr][ff]; if (p) next.push({ sq: FILES[ff] + (8 - rr), color: p.color, type: p.type }); }
    const old = [...pcs.values()];
    const taken = new Set();
    const claim = (n, o) => { n.o = o; taken.add(o); };
    for (const n of next) { const o = pcs.get(n.sq); if (o && o.color === n.color && o.type === n.type) claim(n, o); }
    const free = () => old.filter((o) => !taken.has(o));
    if (lm) for (const n of next) if (!n.o && n.sq === lm.to) { const o = free().find((o) => o.sq === lm.from && o.color === n.color && (o.type === n.type || o.type === 'p')); if (o) claim(n, o); }
    const dist = (a, b) => Math.hypot(FILES.indexOf(a[0]) - FILES.indexOf(b[0]), +a[1] - +b[1]);
    for (const n of next) if (!n.o) { const cand = free().filter((o) => o.color === n.color && o.type === n.type).sort((a, b) => dist(a.sq, n.sq) - dist(b.sq, n.sq)); if (cand[0]) claim(n, cand[0]); }
    const flipping = lastFl !== null && lastFl !== fl; lastFl = fl;
    const first = old.length === 0;
    let usedDrop = false;
    // the moving piece's travel time sets when a captured piece disappears
    let moverMs = 0;
    for (const n of next) if (n.o && n.o.sq !== n.sq) { const d = dist(n.o.sq, n.sq); moverMs = Math.max(moverMs, 240 + Math.min(d, 7) * 42); }
    const kingSqChecked = g.isCheck() ? findKing(board, g.turn()) : null;
    pcs.clear();
    for (const n of next) {
      let o = n.o;
      const to = sqXY(n.sq, fl);
      if (!o) {
        const el = h('div.ch-pc', h('img', { src: piece(n.color, n.type), alt: n.color + n.type }));
        el.style.translate = `${to.x}% ${to.y}%`;
        pcLayer.append(el);
        if (!first) popIn(el, { delay: moverMs * 0.5 });
        o = { el, color: n.color, type: n.type, sq: n.sq };
      } else {
        if (o.sq !== n.sq || flipping) {
          let start = sqXY(o.sq, flipping ? !fl : fl);
          if (dropAt && lm && n.sq === lm.to) { start = { x: dropAt.x * 100 - 50, y: dropAt.y * 100 - 62 }; usedDrop = true; }
          const d = flipping ? 0 : dist(o.sq, n.sq);
          const knight = n.type === 'n';
          glide(o.el, start, to, { ms: flipping ? 520 : 250 + Math.min(d, 7) * 46 + (dropAt ? -60 : 0), lift: flipping ? 0 : knight ? 1.3 : 1.15 });
        } else o.el.style.translate = `${to.x}% ${to.y}%`;
        if (o.type !== n.type) { const img = o.el.firstChild; setTimeout(() => { img.src = piece(n.color, n.type); }, 160); }
        o.type = n.type; o.sq = n.sq; o.color = n.color;
      }
      o.el.firstChild.classList.toggle('rot', !!(otb && prefs.rotate && n.color === topC));
      o.el.classList.toggle('ghost', !!(drag && drag.moved && drag.from === n.sq));
      o.el.style.rotate = '';
      pcs.set(n.sq, o);
    }
    if (usedDrop) dropAt = null;
    for (const o of old) if (!taken.has(o)) popOut(o.el, { delay: moverMs * 0.7, ms: 200 });
    if (kingSqChecked && view === null && pcs.get(kingSqChecked)) shake(pcs.get(kingSqChecked).el, { delay: moverMs + 60 });
    if (S.over && view === null && /^Checkmate/.test(S.over.text || '')) { const loser = S.over.winner === 'w' ? 'b' : 'w'; const k = [...pcs.values()].find((o) => o.type === 'k' && o.color === loser); if (k) { k.el.style.rotate = '82deg'; k.el.animate([{ rotate: '0deg' }, { rotate: '82deg' }], { duration: 650, delay: moverMs + 250, easing: 'cubic-bezier(.5,0,1,.6)', fill: 'backwards' }); k.el.classList.add('fallen'); } }
  }

  function renderMoves() {
    const items = hist.mv.map((m, i) => ({ san: m.san, ply: i + 1 }));
    const cur = view === null ? hist.mv.length : view;
    const fillStrip = [];
    const fillList = [];
    items.forEach((it, i) => {
      const btn = (cls) => h('button' + cls + (it.ply === cur ? '.cur' : ''), { onclick: () => goto(it.ply) }, it.san);
      if (i % 2 === 0) { fillStrip.push(h('b', i / 2 + 1 + '.')); fillList.push(h('b', i / 2 + 1 + '.')); }
      fillStrip.push(btn('')); fillList.push(btn('.mvb'));
    });
    strip.replaceChildren(...fillStrip);
    movesEl.replaceChildren(...fillList);
    const curEl = strip.querySelector('.cur') || strip.lastElementChild;
    if (curEl && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = curEl.offsetLeft - strip.clientWidth / 2;
    movesEl.scrollTop = view === null ? movesEl.scrollHeight : movesEl.scrollTop;
    const n = hist.mv.length;
    nav.replaceChildren(...[['first_page', 'First move', () => goto(0), cur === 0], ['chevron_left', 'Back', () => goto(cur - 1), cur === 0], ['chevron_right', 'Forward', () => goto(cur + 1), cur >= n], ['last_page', 'Latest', () => goto(null), view === null]].map(([ic, t, fn, dis]) => h('button', { 'aria-label': t, title: t, disabled: dis, onclick: fn }, icon(ic))));
  }
  function goto(ply) {
    if (ply === null || ply >= hist.mv.length) { view = null; } else view = Math.max(0, ply);
    sel = null; targets = []; promo = null;
    render();
    if (prefs.eval && canAnalyze()) refreshEval();
  }

  function renderStatus(g) {
    let msg = '';
    statusEl.classList.toggle('big', !!S.over || (view === null && game.isCheck()));
    if (view !== null) msg = `Reviewing move ${view} of ${hist.mv.length}`;
    else if (S.over) msg = S.over.text;
    else if (game.isCheck()) msg = !otb && S.turn === myFixed ? 'You are in check!' : 'Check!';
    else if (otb) msg = (S.turn === 'w' ? 'White' : 'Black') + ' to move';
    else msg = myFixed ? (S.turn === myFixed ? 'Your move' : 'Waiting for ' + api.player(idOf(S.turn)).name + '…') : 'Watching';
    if (S.drawOffer && !S.over && view === null && (otb || S.drawOffer !== myFixed)) msg = otb ? 'Draw offered' : 'Your opponent offers a draw';
    if (S.tb && !S.over && view === null && S.tb !== myFixed) msg = 'Your opponent asks to take back a move';
    statusEl.textContent = msg;
  }

  function cbtn(ic, label, onclick, { cls = '', disabled = false } = {}) { return h('button' + (cls ? '.' + cls : ''), { type: 'button', onclick, disabled, title: label }, icon(ic), h('span', label)); }
  function renderControls() {
    const live = view === null && !S.over;
    const players = myFixed || otb;
    const items = [cbtn('swap_vert', 'Flip', () => { userFlip = !userFlip; render(); })];
    if (canAnalyze() && !api.async) items.push(cbtn('lightbulb', 'Hint', showHint, { disabled: !!S.over && false }));
    if (players && !S.over && !api.async && (otb || vsBot || S.san.length > 0)) {
      const canTb = (otb || vsBot) ? S.san.length > 0 : (S.san.length > 0 && !S.tb);
      items.push(cbtn('undo', 'Undo', takeback, { disabled: !canTb }));
    }
    if (players && live) {
      if (S.drawOffer && !otb && S.drawOffer !== myFixed) items.push(cbtn('check', 'Accept ½', () => api.toHost('drawans', { yes: true }), { cls: 'good' }), cbtn('close', 'Decline', () => api.toHost('drawans', { yes: false })));
      else if (S.tb && S.tb !== myFixed && !otb) items.push(cbtn('check', 'Allow undo', () => api.toHost('tbans', { yes: true }), { cls: 'good' }), cbtn('close', 'Decline', () => api.toHost('tbans', { yes: false })));
      else {
        if (!vsBot) items.push(cbtn('handshake', otb ? 'Draw' : S.drawOffer === myFixed ? 'Offered' : 'Draw', offerDraw, { disabled: !otb && S.drawOffer === myFixed }));
        items.push(S.san.length < 2 ? cbtn('block', 'Abort', abortGame) : cbtn('flag', 'Resign', resign, { cls: 'bad' }));
      }
    }
    items.push(cbtn('tune', 'More', (e) => openSettings(e.currentTarget)));
    ctl.replaceChildren(...items);
  }

  // ---------------------------------------------------------------- evaluation bar & hints
  function renderEval() {
    const show = prefs.eval && canAnalyze();
    evalEl.style.display = show ? '' : 'none';
    if (!show) return;
    const cp = evalCp ?? 0;
    const p = 1 / (1 + Math.exp(-cp / 220)); // white's share of the bar
    const wh = flipped() ? 100 - p * 100 : p * 100;
    const ew = evalEl.firstChild;
    evalEl.style.background = flipped() ? '#f4f4f4' : '#262b33';
    ew.style.background = flipped() ? '#262b33' : '#f4f4f4';
    ew.style.height = (flipped() ? 100 - wh : wh) + '%';
    evalEl.title = Math.abs(cp) > 90000 ? 'Mate' : (cp / 100 > 0 ? '+' : '') + (cp / 100).toFixed(1);
  }
  function refreshEval() {
    const my = ++evalToken, fen = shownFen();
    analyzeAsync(fen, 350).then((r) => { if (my === evalToken && r) { evalCp = r.cp; renderEval(); } });
  }
  async function showHint() {
    if (S.over || view !== null) return;
    toast('Thinking…');
    const r = await analyzeAsync(S.fen, 900);
    if (r && r.move) { hint = r.move; drawArrows(); statusEl.textContent = `Hint: ${new Chess(S.fen).move(r.move)?.san || ''}`; }
  }

  // ---------------------------------------------------------------- moving
  function legalFrom(sq) {
    if (view !== null || S.over) return [];
    const side = mySide();
    if (!side) return [];
    if (S.turn === side) return game.moves({ square: sq, verbose: true });
    if (!prefs.premove || otb) return [];
    const parts = S.fen.split(' '); parts[1] = side; parts[3] = '-'; // pretend it is our turn (for premoves)
    try { return new Chess(parts.join(' ')).moves({ square: sq, verbose: true }); } catch { return []; }
  }
  function submit(m) {
    hint = null;
    if (S.turn === mySide()) {
      try { const gg = new Chess(S.fen); const mv = gg.move({ from: m.from, to: m.to, promotion: m.promotion }); if (mv) opt = { fen: gg.fen(), from: mv.from, to: mv.to, promo: !!mv.promotion }; } catch { /* */ }
      api.toHost('move', m); premove = null; sel = null; targets = []; render();
    }
    else { premove = { from: m.from, to: m.to, promotion: m.promotion }; sel = null; targets = []; sfx('click'); render(); }
  }
  function attempt(from, to) {
    const m = targets.find((t) => t.to === to);
    if (!m) return false;
    if (m.promotion) { promo = { from, to }; render(); return true; }
    submit({ from, to });
    return true;
  }
  const sqAt = (e) => {
    const r = boardEl.getBoundingClientRect();
    const fx = Math.floor(((e.clientX - r.left) / r.width) * 8), fy = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
    const fl = flipped();
    return FILES[fl ? 7 - fx : fx] + (8 - (fl ? 7 - fy : fy));
  };
  function select(sq) { sel = sq; targets = legalFrom(sq); if (targets.length) sfx('click'); else sel = null; }

  // right button: press and release on one square marks it, drag to another square draws an arrow (again removes it)
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button === 2) { rdown = sqAt(e); if (premove || sel) { premove = null; sel = null; targets = []; render(); } return; }
    if (e.button === 0 && (marks.size || arrows.length)) { marks.clear(); arrows = []; }
    if (promo || S.over || view !== null) return;
    const sq = sqAt(e);
    if (!sq) return;
    const side = mySide();
    if (!side) return;
    hint = null;
    if (sel && targets.some((t) => t.to === sq)) { attempt(sel, sq); return; }
    const pc = game.get(sq);
    if (pc && pc.color === side) {
      select(sq);
      if (sel) {
        drag = { from: sq, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, img: null, pc };
        try { boardEl.setPointerCapture(e.pointerId); } catch { /* */ }
      }
    } else { sel = null; targets = []; if (premove) premove = null; }
    render();
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
    if (!drag.moved) {
      drag.moved = true;
      const size = boardEl.getBoundingClientRect().width / 8;
      drag.img = h('img.ch-dragimg', { src: piece(drag.pc.color, drag.pc.type), style: { width: size + 'px', height: size + 'px' } });
      document.body.append(drag.img);
      render();
    }
    drag.img.style.left = e.clientX + 'px'; drag.img.style.top = e.clientY + 'px';
  });
  const endDrag = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    d.img?.remove();
    if (d.moved && !cancel) { const r = boardEl.getBoundingClientRect(); dropAt = { x: ((e.clientX - r.left) / r.width) * 8, y: ((e.clientY - r.top) / r.height) * 8 }; const to = sqAt(e); if (to && to !== d.from && attempt(d.from, to)) return; sel = d.from; targets = legalFrom(d.from); }
    render();
  };
  boardEl.addEventListener('pointerup', (e) => {
    if (e.button === 2 && rdown) {
      const to = sqAt(e), from = rdown; rdown = null;
      if (!to) return;
      if (to === from) { if (marks.has(to)) marks.delete(to); else marks.add(to); }
      else { const k = from + to, i = arrows.indexOf(k); if (i >= 0) arrows.splice(i, 1); else arrows.push(k); }
      render(); return;
    }
    endDrag(e, false);
  });
  boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
  api.listen(window, 'keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    const cur = view === null ? hist.mv.length : view;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goto(cur - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goto(cur + 1); }
    else if (e.key === 'Home') goto(0); else if (e.key === 'End') goto(null);
  });

  // ---------------------------------------------------------------- game actions
  async function resign() {
    if (otb) {
      openMenu(ctl, [{ icon: 'flag', label: 'White resigns', onClick: () => api.toHost('resign', { c: 'w' }) }, { icon: 'flag', label: 'Black resigns', onClick: () => api.toHost('resign', { c: 'b' }) }]);
      return;
    }
    if (await confirmDialog('Resign this game?', 'Your opponent wins.', { ok: 'Resign', danger: true })) api.toHost('resign', {});
  }
  async function abortGame() { if (await confirmDialog('Abort the game?', 'No result is recorded.', { ok: 'Abort' })) api.toHost('abort'); }
  async function offerDraw() { if (otb) { if (await confirmDialog('Agree a draw?', 'Both players accept.', { ok: 'Draw' })) api.toHost('drawans', { yes: true, force: true }); } else api.toHost('drawoffer'); }
  function takeback() { api.toHost('tbreq'); if (!otb && !vsBot) toast('Asked your opponent'); }
  function openSettings(anchor) {
    const set = (k, v) => { prefs[k] = v; savePrefs(); applyTheme(); if (k === 'eval' && v && canAnalyze()) refreshEval(); render(); };
    const box = h('div.ch-set',
      h('div', h('h4', 'Board'), h('div.ch-swatches', Object.entries(THEMES).map(([k, t]) => h('button' + (prefs.theme === k ? '.on' : ''), { title: t[3], 'aria-label': t[3], onclick: (e) => { set('theme', k); box.querySelectorAll('.ch-swatches button').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, h('i', { style: { background: t[0] } }), h('i', { style: { background: t[1] } }), h('i', { style: { background: t[1] } }), h('i', { style: { background: t[0] } }))))),
      h('div.sw-row', h('span', 'Coordinates'), switchEl(prefs.coords, (v) => set('coords', v))),
      h('div.sw-row', h('span', 'Show legal moves'), switchEl(prefs.dots, (v) => set('dots', v))),
      h('div.sw-row', h('span', 'Sounds'), switchEl(prefs.sound, (v) => set('sound', v))),
      !otb ? h('div.sw-row', h('span', 'Premoves'), switchEl(prefs.premove, (v) => set('premove', v))) : h('div.sw-row', h('span', 'Face black’s pieces away'), switchEl(prefs.rotate, (v) => set('rotate', v))),
      canAnalyze() ? h('div.sw-row', h('span', 'Evaluation bar'), switchEl(prefs.eval, (v) => set('eval', v))) : null,
      h('div.row.wrap', { style: 'gap:6px' },
        h('button.btn.small.tonal', { onclick: async () => { const ok = await copyText(pgn()); toast(ok ? 'PGN copied' : 'Copy failed', ok ? 'good' : 'bad'); } }, icon('content_copy'), 'Copy PGN'),
        h('button.btn.small.tonal', { onclick: async () => { const ok = await copyText(S.fen); toast(ok ? 'Position (FEN) copied' : 'Copy failed', ok ? 'good' : 'bad'); } }, icon('content_copy'), 'Copy FEN')));
    openPopover(anchor, box, { align: 'right', width: 280 });
  }
  function pgn() {
    const g = new Chess();
    for (const s of S.san) g.move(s);
    const w = api.player(white).name, b = api.player(black).name;
    g.setHeader('Event', 'Game Night'); g.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    g.setHeader('White', w); g.setHeader('Black', b);
    g.setHeader('Result', S.over ? (S.over.winner === 'w' ? '1-0' : S.over.winner === 'b' ? '0-1' : '1/2-1/2') : '*');
    if (timed) g.setHeader('TimeControl', `${tc.min * 60}+${tc.inc}`);
    return g.pgn();
  }

  // ---------------------------------------------------------------- incoming state
  api.on('state', (s) => {
    const was = S.san.length;
    const same = s.fen === S.fen && s.san.length === S.san.length; // a re-send of the same position (e.g. a clock tick) must not drop a half-made move
    S = { ...s, stamp: performance.now() };
    opt = null; dropAt = null;
    try { game.load(S.fen); } catch { /* */ }
    if (S.san.length !== hist.mv.length || S.san[S.san.length - 1] !== hist.mv[hist.mv.length - 1]?.san) rebuild();
    if (!same) { sel = null; targets = []; promo = null; hint = null; evalCp = null; if (S.san.length > was) { marks.clear(); arrows = []; } }
    if (S.san.length > was && view === null) {
      const last = S.san[S.san.length - 1];
      sfx(/x/.test(last) ? 'woodcap' : 'wood');
      if (/[+#]/.test(last)) setTimeout(() => sfx('bad'), 200); else if (/=/.test(last)) setTimeout(() => sfx('good'), 200);
    }
    if (view !== null && S.san.length < view) view = null;
    // a premove waits for our turn
    if (premove && S.turn === myFixed && !S.over) {
      const ok = game.moves({ square: premove.from, verbose: true }).find((m) => m.to === premove.to && (!m.promotion || m.promotion === (premove.promotion || 'q')));
      const m = premove; premove = null;
      if (ok) { api.toHost('move', { from: m.from, to: m.to, promotion: m.promotion || (ok.promotion ? 'q' : undefined) }); }
    } else if (S.over) premove = null;
    render();
    if (prefs.eval && canAnalyze()) refreshEval();
    if (S.over && S.over.winner && (myFixed || otb)) sfx(otb || S.over.winner === myFixed ? 'win' : 'lose');
  });
  api.interval(() => { if (!timed || S.over) return; for (const el of api.root.querySelectorAll('.ch-clock')) { const c = el.dataset.c; const ms = clockNow(c); el.textContent = fmt(ms); el.classList.toggle('low', ms < 20000); } }, 100);
  api.cleanup(() => { drag?.img?.remove(); });

  // ---------------------------------------------------------------- host
  if (api.isHost) {
    const g = new Chess();
    let flag = 0, botSeq = 0;
    const H = { last: null, san: [], over: null, clock: { w: tc.min * 60000, b: tc.min * 60000 }, drawOffer: null, tb: null, t0: 0 };
    const refreshLast = () => { const hv = g.history({ verbose: true }); H.last = hv.length ? [hv[hv.length - 1].from, hv[hv.length - 1].to] : null; };
    if (api.restore) { // resuming a turn-by-turn match
      try { g.loadPgn(api.restore.pgn || ''); H.san = g.history(); refreshLast(); H.over = api.restore.over || null; H.drawOffer = api.restore.drawOffer || null; } catch (e) { console.error('bad chess snapshot', e); }
    }
    const saveNow = () => api.save({ pgn: g.pgn(), over: H.over, drawOffer: H.drawOffer }, { turn: H.over ? null : idOf(g.turn()), over: !!H.over, summary: H.over ? H.over.text : '', moves: H.san.length });
    const snap = () => ({ fen: g.fen(), last: H.last, san: H.san, turn: g.turn(), over: H.over, clock: H.clock, drawOffer: H.drawOffer, tb: H.tb });
    const publish = (to) => (to ? api.sendTo(to, 'state', snap()) : api.broadcast('state', snap()));
    const finish = (winner, text, aborted) => {
      if (H.over) return;
      clearTimeout(flag);
      H.over = { winner, text };
      publish();
      saveNow();
      api.timeout(() => {
        const w = winner ? idOf(winner) : null;
        api.endGame({
          title: aborted ? 'Game aborted' : w ? (otb ? (winner === 'w' ? 'White' : 'Black') + ' wins!' : `${api.player(w).name} wins!`) : 'Draw!', subtitle: text,
          ranking: (w ? [w, idOf(winner === 'w' ? 'b' : 'w')] : ids).map((id, i) => ({ id, score: aborted ? '–' : w ? (i === 0 ? '1' : '0') : '½' })), winners: w ? [w] : [],
        });
      }, 2200);
    };
    const armFlag = () => {
      clearTimeout(flag);
      if (!timed || H.over || H.san.length === 0) return;
      const c = g.turn();
      flag = setTimeout(() => finish(c === 'w' ? 'b' : 'w', `${otb ? (c === 'w' ? 'White' : 'Black') : api.player(idOf(c)).name} ran out of time`), H.clock[c] + 100);
    };
    api.cleanup(() => { clearTimeout(flag); stopChessWorker(); });
    // ---- computer player: search, then play through the normal 'move' handler
    const maybeBot = () => {
      if (H.over) return;
      const c = g.turn(), id = idOf(c), seq = ++botSeq;
      if (!api.isBot(id)) return;
      api.timeout(async () => {
        if (H.over || g.turn() !== c || seq !== botSeq) return;
        const m = await chooseMoveAsync(g.fen(), api.level);
        if (m && !H.over && g.turn() === c && seq === botSeq) api.botDo(id, 'move', m);
      }, thinkMs(api.level, 300, 400));
    };
    api.on('move', ({ from, to, promotion }, pid) => {
      if (H.over || (!otb && pid !== idOf(g.turn()))) return;
      const c = g.turn();
      let mv;
      try { mv = g.move({ from, to, promotion }); } catch { return; }
      if (!mv) return;
      if (timed && H.san.length > 0) H.clock[c] = Math.max(0, H.clock[c] - (performance.now() - H.t0)) + INC;
      H.t0 = performance.now();
      H.san.push(mv.san);
      H.last = [mv.from, mv.to];
      H.drawOffer = null; H.tb = null;
      publish();
      const nm = otb ? (c === 'w' ? 'White' : 'Black') : api.player(idOf(c)).name;
      if (g.isCheckmate()) return finish(c, `Checkmate — ${nm} wins`);
      if (g.isStalemate()) return finish(null, 'Stalemate');
      if (g.isInsufficientMaterial()) return finish(null, 'Draw by insufficient material');
      if (g.isThreefoldRepetition()) return finish(null, 'Draw by repetition');
      if (g.isDraw()) return finish(null, 'Draw (50-move rule)');
      saveNow();
      armFlag();
      maybeBot();
    });
    api.on('resign', (d, pid) => {
      if (H.over) return;
      const c = otb ? (d && d.c) : colorOf(pid);
      if (c === 'w' || c === 'b') finish(c === 'w' ? 'b' : 'w', `${otb ? (c === 'w' ? 'White' : 'Black') : api.player(idOf(c)).name} resigned`);
    });
    api.on('abort', (_, pid) => { if (!H.over && H.san.length < 2 && (otb || colorOf(pid))) finish(null, 'The game was aborted', true); });
    api.on('drawoffer', (_, pid) => { const c = colorOf(pid); if (!H.over && c && !otb) { H.drawOffer = c; publish(); saveNow(); } });
    api.on('drawans', ({ yes, force }, pid) => {
      if (H.over) return;
      if (otb && force) return finish(null, 'Draw agreed');
      if (!H.drawOffer || idOf(H.drawOffer) === pid) return;
      if (yes) finish(null, 'Draw agreed'); else { H.drawOffer = null; publish(); saveNow(); }
    });
    // ---- takebacks: instant against the computer / over the board, by agreement between people
    const undoPlies = (n) => {
      for (let i = 0; i < n && g.history().length; i++) { g.undo(); H.san.pop(); }
      refreshLast(); H.drawOffer = null; H.tb = null; botSeq++;
      H.t0 = performance.now();
      publish(); saveNow(); armFlag();
    };
    api.on('tbreq', (_, pid) => {
      if (H.over || !H.san.length) return;
      if (otb) return undoPlies(1);
      const c = colorOf(pid);
      if (!c) return;
      const botGame = api.players.some((p) => p.bot);
      const plies = g.turn() === c ? 2 : 1; // take back my last move (and their reply, if they already made one)
      if (botGame) return undoPlies(Math.min(plies, H.san.length));
      if (H.san.length >= plies) { H.tb = c; publish(); }
    });
    api.on('tbans', ({ yes }, pid) => {
      if (H.over || !H.tb || idOf(H.tb) === pid) return;
      if (yes) undoPlies(Math.min(g.turn() === H.tb ? 2 : 1, H.san.length)); else { H.tb = null; publish(); }
    });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => { if (!H.over && (id === white || id === black) && !otb) finish(id === white ? 'b' : 'w', 'Opponent left the game'); });
    api.timeout(() => { publish(); maybeBot(); }, 300);
  }
  rebuild();
  render();
}
