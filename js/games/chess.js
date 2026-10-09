// Chess — 2 players. Rules are enforced by the vendored chess.js on the host; clients render the FEN they get.
// Piece artwork: "Cburnett" set from Wikimedia Commons (BSD / GPL / GFDL), see assets/chess/.
import { h } from '../util.js';
import { avatarEl } from '../avatar.js';
import { icon, confirmDialog } from '../ui.js';
import { Chess } from '../../vendor/chess.js';

const START = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const piece = (color, type) => `assets/chess/${color === 'w' ? 'l' : 'd'}${type}.svg`;

const CSS = `
.ch { flex:1; min-height:0; display:flex; gap:18px; padding:8px 12px 12px; justify-content:center; align-items:flex-start; overflow-y:auto; }
.ch-main { display:flex; flex-direction:column; gap:10px; align-items:center; width:min(100%, var(--bs)); --bs: min(calc(100cqw - 24px), calc(100cqh - 236px), 640px); }
.ch-pl { display:flex; align-items:center; gap:10px; width:100%; padding:2px 4px; }
.ch-pl .who { display:flex; flex-direction:column; min-width:0; flex:1; }
.ch-pl .nm { font-weight:700; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; gap:6px; align-items:center; }
.ch-pl .nm i { width:12px; height:12px; border-radius:50%; display:inline-block; box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.35); }
.ch-cap { display:flex; align-items:center; height:20px; margin-top:2px; }
.ch-cap img { width:18px; height:18px; margin-right:-7px; }
.ch-cap b { margin-left:12px; font-size:12px; color:var(--on2); font-weight:700; }
.ch-clock { font:800 20px var(--font); font-variant-numeric:tabular-nums; background:var(--surface); box-shadow:var(--e1); border-radius:12px; padding:6px 12px; min-width:84px; text-align:center; color:var(--on); }
.ch-clock.turn { background:#263238; color:#fff; }
.ch-clock.low { background:var(--red); color:#fff; animation:pulse .7s infinite; }
.ch-boardwrap { width:var(--bs); height:var(--bs); position:relative; border-radius:14px; padding:0; box-shadow:0 14px 34px rgba(60,40,10,.25), 0 0 0 6px #6b4a2b, 0 0 0 7px #4a3219; }
.ch-board { width:100%; height:100%; display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr); border-radius:8px; overflow:hidden; user-select:none; }
.ch-sq { position:relative; cursor:pointer; display:grid; place-items:center; }
.ch-sq.l { background:#f0d9b5; } .ch-sq.d { background:#b58863; }
.ch-sq.last::before { content:''; position:absolute; inset:0; background:rgba(255,230,60,.5); }
.ch-sq.sel::before { content:''; position:absolute; inset:0; background:rgba(110,190,60,.6); }
.ch-sq.chk::before { content:''; position:absolute; inset:0; background:radial-gradient(circle, rgba(255,40,40,.95) 0%, rgba(255,40,40,.55) 40%, transparent 72%); }
.ch-sq .mv { position:absolute; width:30%; height:30%; border-radius:50%; background:rgba(40,60,20,.38); }
.ch-sq .cp { position:absolute; inset:3%; border-radius:50%; border:calc(var(--bs) / 100) solid rgba(40,60,20,.4); }
.ch-sq img { position:relative; z-index:1; width:92%; height:92%; pointer-events:none; filter:drop-shadow(0 2px 2px rgba(0,0,0,.28)); }
.ch-sq img.slide { animation:chslide .22s ease-out; }
@keyframes chslide { from { transform:translate(var(--dx), var(--dy)); } }
.ch-sq small { position:absolute; z-index:0; font:700 calc(var(--bs) / 48)/1 var(--font); opacity:.8; }
.ch-sq.l small { color:#b58863; } .ch-sq.d small { color:#f0d9b5; }
.ch-sq small.f { right:3%; bottom:2%; } .ch-sq small.rk { left:4%; top:3%; }
.ch-promo { position:absolute; inset:0; z-index:9; background:rgba(20,24,35,.55); border-radius:8px; display:grid; place-items:center; }
.ch-promo div { display:flex; gap:8px; background:var(--surface); padding:12px; border-radius:20px; box-shadow:var(--e3); }
.ch-promo button { width:calc(var(--bs) / 6); height:calc(var(--bs) / 6); border-radius:14px; border:0; background:var(--s2); cursor:pointer; display:grid; place-items:center; }
.ch-promo button:hover { background:var(--blue-c); }
.ch-promo img { width:90%; height:90%; }
.ch-status { font:600 15px var(--font); text-align:center; min-height:22px; color:var(--on2); }
.ch-status.big { color:var(--on); font-weight:800; font-size:17px; }
.ch-side { width:250px; display:flex; flex-direction:column; gap:10px; align-self:stretch; max-height:var(--bs); }
.ch-moves { flex:1; overflow-y:auto; background:var(--surface); border-radius:20px; padding:12px; display:grid; grid-template-columns:32px 1fr 1fr; gap:4px 8px; align-content:start; min-height:120px; box-shadow:var(--e1); font-weight:600; font-size:14.5px; }
.ch-moves b { color:var(--on3); font-weight:600; }
.ch-acts { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
@container (max-width: 760px) { .ch { flex-direction:column; align-items:center; gap:8px; } .ch-side { width:var(--bs); max-height:none; flex-direction:row; align-self:center; } .ch-moves { display:none; } .ch-side .ch-acts { width:100%; } }
`;

const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const white = ids[api.seed % 2];
  const black = ids.find((i) => i !== white);
  const myColor = api.me === white ? 'w' : api.me === black ? 'b' : null;
  const timed = +api.opts.time || 0;
  const INC = 2000;
  const idOf = (c) => (c === 'w' ? white : black);

  const game = new Chess();
  let S = { fen: game.fen(), last: null, san: [], turn: 'w', over: null, clock: { w: timed * 60000, b: timed * 60000 }, drawOffer: null, stamp: performance.now() };
  let sel = null, targets = [], promo = null, prevFen = null;

  const boardEl = h('div.ch-board');
  const wrapEl = h('div.ch-boardwrap', boardEl);
  const statusEl = h('div.ch-status');
  const movesEl = h('div.ch-moves');
  const topPl = h('div.ch-pl'), botPl = h('div.ch-pl');
  const btns = h('div.ch-acts');
  api.root.append(h('style', CSS), h('div.ch', [
    h('div.ch-main', topPl, wrapEl, botPl, statusEl),
    h('div.ch-side', btns, movesEl),
  ]));
  api.root.style.containerType = 'size';

  const flip = myColor === 'b';
  const clockNow = (c) => (timed && !S.over && S.turn === c && S.san.length > 0 ? Math.max(0, S.clock[c] - (performance.now() - S.stamp)) : S.clock[c]);

  function captured(board) {
    const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const row of board) for (const p of row) if (p && p.type !== 'k') have[p.color][p.type]++;
    const lost = (c) => { const out = []; for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = 0; i < START[t] - have[c][t]; i++) out.push(t); return out; };
    return { w: lost('w'), b: lost('b') }; // pieces each colour has LOST
  }
  const material = (c, cap) => cap[c === 'w' ? 'b' : 'w'].reduce((a, t) => a + VAL[t], 0) - cap[c].reduce((a, t) => a + VAL[t], 0);

  function renderPlayers(board) {
    const cap = captured(board);
    const mk = (c, el) => {
      const p = api.player(idOf(c));
      const lostByOpp = cap[c === 'w' ? 'b' : 'w']; // pieces c has captured
      const adv = material(c, cap);
      el.replaceChildren(
        avatarEl({ ...p, online: p.online && !p.left }, 'lg', { still: true }),
        h('div.who', [
          h('div.nm', h('i', { style: { background: c === 'w' ? '#fff' : '#222' } }), p.name + (p.id === api.me ? ' (you)' : '')),
          h('div.ch-cap', lostByOpp.map((t) => h('img', { src: piece(c === 'w' ? 'b' : 'w', t), alt: '' })), adv > 0 ? h('b', '+' + adv) : null),
        ]),
        timed ? h('div.ch-clock' + (S.turn === c && !S.over ? '.turn' : '') + (clockNow(c) < 20000 ? '.low' : ''), { 'data-c': c }, fmt(clockNow(c))) : null
      );
    };
    mk(flip ? 'w' : 'b', topPl);
    mk(flip ? 'b' : 'w', botPl);
  }

  function render() {
    game.load(S.fen);
    const board = game.board();
    const kingSq = game.isCheck() ? findKing(board, game.turn()) : null;
    const cells = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rr = flip ? 7 - r : r, ff = flip ? 7 - f : f;
        const sq = 'abcdefgh'[ff] + (8 - rr);
        const pc = board[rr][ff];
        const light = (rr + ff) % 2 === 0;
        const tgt = targets.find((m) => m.to === sq);
        let slide = null;
        if (pc && S.last && S.last[1] === sq && prevFen !== S.fen) {
          const fs = S.last[0];
          const fx = 'abcdefgh'.indexOf(fs[0]), fy = 8 - +fs[1];
          const dx = (flip ? -1 : 1) * (fx - ff) * 100, dy = (flip ? -1 : 1) * (fy - rr) * 100;
          slide = { '--dx': dx + '%', '--dy': dy + '%' };
        }
        cells.push(h('div.ch-sq.' + (light ? 'l' : 'd') + (S.last && (S.last[0] === sq || S.last[1] === sq) ? '.last' : '') + (sel === sq ? '.sel' : '') + (kingSq === sq ? '.chk' : ''), { onclick: () => click(sq), 'data-sq': sq }, [
          f === 0 ? h('small.rk', String(8 - rr)) : null,
          r === 7 ? h('small.f', 'abcdefgh'[ff]) : null,
          tgt ? h(pc ? 'div.cp' : 'div.mv') : null,
          pc ? h('img' + (slide ? '.slide' : ''), { src: piece(pc.color, pc.type), alt: pc.color + pc.type, style: slide || '' }) : null,
        ]));
      }
    }
    prevFen = S.fen;
    boardEl.replaceChildren(...cells);
    wrapEl.querySelector('.ch-promo')?.remove();
    if (promo) {
      wrapEl.append(h('div.ch-promo', h('div', ['q', 'r', 'b', 'n'].map((t) => h('button', { 'aria-label': 'Promote to ' + t, onclick: () => { const m = promo; promo = null; api.toHost('move', { ...m, promotion: t }); sel = null; targets = []; render(); } }, h('img', { src: piece(myColor, t), alt: t }))))));
    }
    // moves list
    const rows = [];
    S.san.forEach((m, i) => { if (i % 2 === 0) rows.push(h('b', i / 2 + 1 + '.')); rows.push(h('span', m)); });
    movesEl.replaceChildren(...rows);
    movesEl.scrollTop = movesEl.scrollHeight;
    // status
    let msg = '';
    statusEl.classList.toggle('big', !!S.over || game.isCheck());
    if (S.over) msg = S.over.text;
    else if (game.isCheck()) msg = S.turn === myColor ? 'You are in check!' : 'Check!';
    else msg = myColor ? (S.turn === myColor ? 'Your move' : 'Waiting for ' + api.player(idOf(S.turn)).name + '…') : 'Spectating';
    if (S.drawOffer && S.drawOffer !== myColor && !S.over) msg = 'Your opponent offers a draw';
    statusEl.textContent = msg;
    // buttons
    btns.replaceChildren();
    if (myColor && !S.over) {
      if (S.drawOffer && S.drawOffer !== myColor) btns.append(h('button.btn.small.good', { onclick: () => api.toHost('drawans', { yes: true }) }, icon('check'), 'Accept draw'), h('button.btn.small.outline', { onclick: () => api.toHost('drawans', { yes: false }) }, 'Decline'));
      else if (S.drawOffer === myColor) btns.append(h('span.chip', 'Draw offered…'));
      else btns.append(h('button.btn.small.outline', { onclick: () => api.toHost('drawoffer') }, icon('swap_horiz'), 'Offer draw'));
      btns.append(h('button.btn.small.outline', { style: 'color:var(--red)', onclick: async () => { if (await confirmDialog('Resign this game?', 'Your opponent wins.', { ok: 'Resign', danger: true })) api.toHost('resign'); } }, icon('flag'), 'Resign'));
    }
    renderPlayers(board);
  }
  function findKing(board, color) {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = board[r][f]; if (p && p.type === 'k' && p.color === color) return 'abcdefgh'[f] + (8 - r); }
    return null;
  }

  function click(sq) {
    if (S.over || !myColor || S.turn !== myColor || promo) return;
    const m = targets.find((t) => t.to === sq);
    if (sel && m) {
      if (m.promotion) { promo = { from: sel, to: sq }; render(); return; }
      api.toHost('move', { from: sel, to: sq });
      sel = null; targets = []; render();
      return;
    }
    const pc = game.get(sq);
    if (pc && pc.color === myColor) {
      sel = sq;
      targets = game.moves({ square: sq, verbose: true });
      api.sfx('click');
    } else { sel = null; targets = []; }
    render();
  }

  api.on('state', (s) => {
    const was = S.san.length;
    S = { ...s, stamp: performance.now() };
    sel = null; targets = []; promo = null;
    if (s.san.length > was) api.sfx(/x/.test(s.san[s.san.length - 1]) ? 'hit' : 'clack');
    render();
    if (s.over && s.over.winner) api.sfx(s.over.winner === myColor ? 'win' : 'lose');
  });
  api.interval(() => { if (timed && !S.over) { for (const el of api.root.querySelectorAll('.ch-clock')) { const c = el.dataset.c; el.textContent = fmt(clockNow(c)); el.classList.toggle('low', clockNow(c) < 20000); } } }, 250);

  // ---------------------------------------------------------------- host
  if (api.isHost) {
    const g = new Chess();
    let flag = 0;
    const H = { last: null, san: [], over: null, clock: { w: timed * 60000, b: timed * 60000 }, drawOffer: null, t0: 0 };
    const snap = () => ({ fen: g.fen(), last: H.last, san: H.san, turn: g.turn(), over: H.over, clock: H.clock, drawOffer: H.drawOffer });
    const publish = (to) => (to ? api.sendTo(to, 'state', snap()) : api.broadcast('state', snap()));
    const finish = (winner, text) => {
      if (H.over) return;
      clearTimeout(flag);
      H.over = { winner, text };
      publish();
      api.timeout(() => {
        const w = winner ? idOf(winner) : null;
        api.endGame({
          title: w ? `${api.player(w).name} wins!` : 'Draw!', subtitle: text,
          ranking: (w ? [w, idOf(winner === 'w' ? 'b' : 'w')] : ids).map((id, i) => ({ id, score: w ? (i === 0 ? '1' : '0') : '½' })), winners: w ? [w] : [],
        });
      }, 2200);
    };
    const armFlag = () => {
      clearTimeout(flag);
      if (!timed || H.over || H.san.length === 0) return;
      const c = g.turn();
      flag = setTimeout(() => finish(c === 'w' ? 'b' : 'w', `${api.player(idOf(c)).name} ran out of time`), H.clock[c] + 100);
    };
    api.cleanup(() => clearTimeout(flag));
    api.on('move', ({ from, to, promotion }, pid) => {
      if (H.over || pid !== idOf(g.turn())) return;
      const c = g.turn();
      let mv;
      try { mv = g.move({ from, to, promotion }); } catch { return; }
      if (!mv) return;
      if (timed && H.san.length > 0) H.clock[c] = Math.max(0, H.clock[c] - (performance.now() - H.t0)) + INC;
      H.t0 = performance.now();
      H.san.push(mv.san);
      H.last = [mv.from, mv.to];
      H.drawOffer = null;
      publish();
      if (g.isCheckmate()) return finish(c, `Checkmate — ${api.player(idOf(c)).name} wins`);
      if (g.isStalemate()) return finish(null, 'Stalemate');
      if (g.isInsufficientMaterial()) return finish(null, 'Draw by insufficient material');
      if (g.isThreefoldRepetition()) return finish(null, 'Draw by repetition');
      if (g.isDraw()) return finish(null, 'Draw (50-move rule)');
      armFlag();
    });
    api.on('resign', (_, pid) => { if (!H.over && (pid === white || pid === black)) finish(pid === white ? 'b' : 'w', `${api.player(pid).name} resigned`); });
    api.on('drawoffer', (_, pid) => { if (!H.over && (pid === white || pid === black)) { H.drawOffer = pid === white ? 'w' : 'b'; publish(); } });
    api.on('drawans', ({ yes }, pid) => {
      if (H.over || !H.drawOffer || idOf(H.drawOffer) === pid) return;
      if (yes) finish(null, 'Draw agreed'); else { H.drawOffer = null; publish(); }
    });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => { if (!H.over && (id === white || id === black)) finish(id === white ? 'b' : 'w', 'Opponent left the game'); });
    api.timeout(() => publish(), 300);
  }
  render();
}
