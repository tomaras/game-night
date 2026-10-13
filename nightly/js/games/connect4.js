// Connect Four — 2 players. Host validates moves; everyone renders the broadcast state.
import { h } from '../util.js';
import { thinkMs } from '../bots.js';
import { avatarEl } from '../avatar.js';
import { icon } from '../ui.js';

const R = 6, C = 7;
const CSS = `
.c4 { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:10px 12px 14px; min-height:0; --bw:min(94%, calc((100dvh - 330px) * ${C} / ${R + 1}), 520px); }
.c4-pl { display:flex; gap:8px; width:var(--bw); }
.c4-p { flex:1; min-width:0; display:flex; align-items:center; gap:8px; padding:6px 10px 6px 6px; border-radius:var(--r); background:var(--surface); box-shadow:var(--e1); border:2.5px solid transparent; transition:border-color .2s, box-shadow .2s, transform .2s; }
.c4-p.turn { border-color:var(--c); box-shadow:0 0 0 3px color-mix(in srgb, var(--c) 28%, transparent), var(--e1); transform:translateY(-2px); }
.c4-p .nm { font-weight:800; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .c4-p small { display:block; font:600 11px var(--font); color:var(--on2); }
.c4-p .c4-disc { margin-left:auto; flex:none; }
.c4-status { font-weight:800; font-size:17px; min-height:26px; text-align:center; }
.c4-disc { width:24px; height:24px; border-radius:50%; display:inline-block; box-shadow:inset 0 -3px 0 rgba(0,0,0,.25), inset 0 3px 4px rgba(255,255,255,.35); }
.c4-disc.p1 { background:#ea4335; } .c4-disc.p2 { background:#fbbc04; }
.c4-wrap { width:var(--bw); display:flex; flex-direction:column; gap:4px; }
.c4-ghosts { display:grid; grid-template-columns:repeat(${C},1fr); gap:8px; padding:0 10px; }
.c4-g { aspect-ratio:1; border-radius:50%; opacity:0; transform:translateY(6px) scale(.85); transition:opacity .12s, transform .12s; }
.c4-g.on { opacity:.55; transform:none; } .c4-g.p1 { background:#ea4335; } .c4-g.p2 { background:#fbbc04; }
.c4-g.hint { opacity:1; transform:none; background:#34a853; animation:pulse .6s infinite; box-shadow:0 0 0 4px rgba(52,168,83,.35); }
.c4-board { position:relative; background:linear-gradient(150deg,#3b86f5,#1558b0 70%,#0f4a98); border-radius:20px; padding:10px; display:grid; grid-template-columns:repeat(${C},1fr); gap:8px; width:100%; box-shadow:0 14px 30px rgba(21,88,176,.4), inset 0 2px 0 rgba(255,255,255,.35), inset 0 -6px 0 rgba(0,0,0,.22); }
.c4-board::after { content:''; position:absolute; left:6%; right:6%; bottom:-14px; height:14px; border-radius:0 0 12px 12px; background:linear-gradient(#0f3f84,#0b2f63); z-index:-1; }
.c4-col { display:grid; grid-template-rows:repeat(${R},1fr); gap:8px; cursor:pointer; border-radius:12px; transition:background .12s; }
.c4-col.can:hover { background:rgba(255,255,255,.1); }
.c4-cell { aspect-ratio:1; border-radius:50%; background:var(--c4hole, #dfe9fb); box-shadow:inset 0 5px 9px rgba(0,0,0,.34), 0 1px 0 rgba(255,255,255,.3); position:relative; }
.c4-d { position:absolute; inset:0; border-radius:50%; z-index:1; box-shadow:inset 0 -5px 0 rgba(0,0,0,.25), inset 0 4px 6px rgba(255,255,255,.4), 0 2px 3px rgba(0,0,0,.25); }
.c4-d::before { content:''; position:absolute; inset:17%; border-radius:50%; box-shadow:inset 0 3px 5px rgba(0,0,0,.2), 0 1px 0 rgba(255,255,255,.28); }
.c4-d.p1 { background:radial-gradient(circle at 35% 30%, #ff7a6c, #ea4335 55%, #c62a1f); } .c4-d.p2 { background:radial-gradient(circle at 35% 30%, #ffe27a, #fbbc04 55%, #e09a00); }
:root[data-theme=dark] .c4-cell { --c4hole:#16233d; }
.c4-cell.lastm::before { content:''; position:absolute; left:50%; top:50%; width:22%; height:22%; margin:-11% 0 0 -11%; border-radius:50%; background:rgba(255,255,255,.85); z-index:3; box-shadow:0 0 4px rgba(0,0,0,.3); }
.c4-cell[data-falling]::before { display:none; }
.c4-cell.win::before { content:''; position:absolute; inset:-4px; border-radius:50%; border:4px solid #fff; animation:pulse .8s infinite; z-index:2; box-shadow:0 0 14px #fff; }
.c4-ctl { display:flex; gap:8px; }
.c4-ctl button { height:42px; padding:0 16px; border:0; border-radius:var(--r); background:var(--s2); color:var(--on); font:700 13px var(--font); display:flex; align-items:center; gap:6px; cursor:pointer; } .c4-ctl button:disabled { opacity:.4; } .c4-ctl .ic { width:19px; height:19px; }
@keyframes c4hop { 0%, 55%, 100% { transform:none; } 25% { transform:translateY(-16%) scale(1.06); } }
.c4-cell.win .c4-d { animation:c4hop 1s ease-in-out infinite; animation-delay:calc(var(--k, 0) * .12s); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const first = api.seed % 2;
  const order = first ? [ids[1], ids[0]] : ids; // order[0] = red (moves first)
  const st = { board: Array(R * C).fill(0), turn: 0, winner: -1, line: [], draw: false };
  if (api.restore) Object.assign(st, api.restore); // resuming a turn-by-turn match

  const status = h('div.c4-status');
  const boardEl = h('div.c4-board');
  const ghosts = h('div.c4-ghosts', Array.from({ length: C }, () => h('div.c4-g')));
  const plEl = h('div.c4-pl');
  const ctl = h('div.c4-ctl');
  api.root.append(h('style', CSS), h('div.c4', plEl, h('div.c4-wrap', ghosts, boardEl), status, ctl));
  const vsBot = api.players.some((p) => p.bot);

  const cols = [];
  for (let c = 0; c < C; c++) {
    const col = h('div.c4-col', { onclick: () => play(c), onpointerenter: () => ghost(c), onpointerdown: () => ghost(c), onpointerleave: () => ghost(-1) });
    const cells = [];
    for (let r = 0; r < R; r++) { const cell = h('div.c4-cell'); cells.push(cell); col.append(cell); }
    cols.push({ col, cells });
    boardEl.append(col);
  }

  let hintCol = -1, lastIdx = -1;
  function ghost(c) {
    const myTurn = st.winner < 0 && !st.draw && order[st.turn] === api.me;
    [...ghosts.children].forEach((g, i) => { g.className = 'c4-g' + (i === c && myTurn && st.board[c] === 0 ? ' on p' + (st.turn + 1) : '') + (i === hintCol ? ' hint' : ''); });
  }
  function play(c) {
    hintCol = -1;
    if (st.winner >= 0 || st.draw) return;
    if (order[st.turn] !== api.me) return api.toast("It's not your turn");
    api.toHost('drop', { c });
  }

  const dropMs = (r) => (0.3 + 0.1 * Math.sqrt(r + 1.6)) * 1000;
  // a disc falls the height of the column above it, hits the slot, squashes and bounces twice
  function dropDisc(d, r) {
    const dist = (r + 1.7) * 108, T = dropMs(r);
    d.animate([
      { transform: `translateY(${-dist}%)`, easing: 'cubic-bezier(.5,0,.9,.55)', offset: 0 },
      { transform: 'translateY(0) scale(1,1)', easing: 'ease-out', offset: 0.62 },
      { transform: 'translateY(0) scale(1.08,.88)', easing: 'ease-out', offset: 0.67 },
      { transform: 'translateY(-13%) scale(1,1)', easing: 'cubic-bezier(.45,0,.9,.6)', offset: 0.79 },
      { transform: 'translateY(0)', easing: 'ease-out', offset: 0.9 },
      { transform: 'translateY(-3.5%)', easing: 'cubic-bezier(.45,0,.9,.6)', offset: 0.95 },
      { transform: 'translateY(0)', offset: 1 },
    ], { duration: T });
    const cell = d.parentElement; cell.style.zIndex = 2; cell.dataset.falling = '1';
    setTimeout(() => { cell.style.zIndex = ''; delete cell.dataset.falling; }, T);
  }
  function render(prevBoard) {
    const mine = order.indexOf(api.me);
    const newDiscs = prevBoard ? st.board.filter((v, i) => v && !prevBoard[i]).length : 0;
    for (let c = 0; c < C; c++) {
      cols[c].col.classList.toggle('can', st.winner < 0 && !st.draw && order[st.turn] === api.me && st.board[c] === 0);
      for (let r = 0; r < R; r++) {
        const v = st.board[r * C + c];
        const cell = cols[c].cells[r];
        const was = prevBoard ? prevBoard[r * C + c] : -1;
        if (was !== v) {
          cell.className = 'c4-cell';
          cell.replaceChildren();
          if (v) {
            const d = h('div.c4-d.p' + v); cell.append(d);
            if (prevBoard && was === 0 && newDiscs === 1) dropDisc(d, r);
          }
        }
        const li = st.line.indexOf(r * C + c);
        cell.classList.toggle('win', li >= 0);
        if (li >= 0) cell.style.setProperty('--k', li); else cell.style.removeProperty('--k');
      }
    }
    // players
    plEl.replaceChildren(...[0, 1].map((i) => { const p = api.player(order[i]); return h('div.c4-p' + (st.turn === i && st.winner < 0 && !st.draw ? '.turn' : ''), { style: { '--c': i === 0 ? '#ea4335' : '#fbbc04' } }, avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: true }), h('div', h('div.nm', p.name + (p.id === api.me ? ' (you)' : '')), h('small', i === 0 ? 'Red' : 'Yellow')), h('span.c4-disc.p' + (i + 1))); }));
    // last move marker
    for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) cols[c].cells[r].classList.toggle('lastm', r * C + c === lastIdx);
    ghost(-1);
    // controls: take back / hint when playing the computer
    ctl.replaceChildren();
    if (vsBot && order.includes(api.me) && st.winner < 0 && !st.draw) {
      ctl.append(h('button', { disabled: !st.board.some(Boolean), onclick: () => api.toHost('undo') }, icon('undo'), 'Undo'),
        h('button', { disabled: order[st.turn] !== api.me, onclick: () => { hintCol = bestColumn(st.board, order.indexOf(api.me) + 1, 'hard'); ghost(-1); setTimeout(() => { hintCol = -1; ghost(-1); }, 2200); } }, icon('lightbulb'), 'Hint'));
    }
    const who = api.player(order[st.turn]);
    if (st.winner >= 0) {
      const w = api.player(order[st.winner]);
      status.replaceChildren(`${w.name} wins!`);
    } else if (st.draw) {
      status.replaceChildren('Draw — the board is full');
    } else {
      status.replaceChildren(
        order[st.turn] === api.me ? 'Your turn!' : `${who.name}'s turn`,
        mine >= 0 ? h('span.muted', { style: 'font-size:13px;font-weight:600' }, ` (you are ${mine === 0 ? 'red' : 'yellow'})`) : null
      );
    }
  }

  // `st` is shared with the host logic below (the host is also a player), so changes are detected against what is DRAWN, not against `st`.
  const shown = Array(R * C).fill(0);
  api.on('state', (s) => {
    Object.assign(st, s);
    const placed = st.board.some((v, i) => v && v !== shown[i]);
    if (placed) { lastIdx = st.board.findIndex((v, i) => v && v !== shown[i]); const T = dropMs(Math.floor(lastIdx / C)); api.timeout(() => api.sfx('thud', 0.8), T * 0.62); api.timeout(() => api.sfx('thud', 0.35), T * 0.79); }
    if (!st.board.some(Boolean)) lastIdx = -1;
    render(shown);
    shown.splice(0, shown.length, ...st.board);
    if (s.winner >= 0) api.sfx(order[s.winner] === api.me ? 'win' : 'lose');
  });

  if (api.isHost) {
    const send = () => api.broadcast('state', st);
    // report the position after every move (the shell turns it into a shareable turn-by-turn match)
    const save = () => {
      const over = st.winner >= 0 || st.draw;
      api.save({ board: st.board.slice(), turn: st.turn, winner: st.winner, line: st.line, draw: st.draw },
        { turn: over ? null : order[st.turn], over, summary: st.draw ? 'Draw' : st.winner >= 0 ? `${api.player(order[st.winner]).name} won` : '', moves: st.board.filter(Boolean).length });
    };
    // ---- computer player
    let botEpoch = 0;
    const c4hist = []; // cells in the order discs were dropped (for taking moves back)
    const maybeBot = () => {
      if (st.winner >= 0 || st.draw) return;
      const id = order[st.turn];
      if (!api.isBot(id)) return;
      const ep = ++botEpoch;
      api.timeout(() => {
        if (ep !== botEpoch || order[st.turn] !== id || st.winner >= 0 || st.draw) return;
        api.botDo(id, 'drop', { c: bestColumn(st.board, st.turn + 1, api.level) });
      }, thinkMs(api.level, 500, 700));
    };
    api.on('drop', ({ c }, from) => {
      if (st.winner >= 0 || st.draw || order[st.turn] !== from || !(c >= 0 && c < C)) return;
      let r = R - 1;
      while (r >= 0 && st.board[r * C + c]) r--;
      if (r < 0) return;
      st.board[r * C + c] = st.turn + 1;
      c4hist.push(r * C + c);
      const line = findLine(st.board, r, c);
      if (line) { st.winner = st.turn; st.line = line; }
      else if (st.board.every(Boolean)) st.draw = true;
      else st.turn ^= 1;
      send();
      save();
      maybeBot();
      if (st.winner >= 0 || st.draw) {
        api.timeout(() => {
          const rank = st.draw ? order : [order[st.winner], order[1 - st.winner]];
          api.endGame({
            title: st.draw ? "It's a draw!" : `${api.player(order[st.winner]).name} wins!`,
            ranking: rank.map((id, i) => ({ id, score: st.draw ? 'draw' : i === 0 ? 'win' : 'loss' })),
            winners: st.draw ? [] : [order[st.winner]],
          });
        }, 1800);
      }
    });
    api.on('undo', (_, from) => { // against the computer: take back my last move (and its reply)
      if (st.winner >= 0 || st.draw || !api.players.some((p) => p.bot)) return;
      const mineN = order.indexOf(from) + 1;
      const idxs = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (st.board[r * C + c]) idxs.push(r * C + c);
      if (!idxs.length) return;
      let n = order[st.turn] === from ? 2 : 1;
      while (n-- > 0 && c4hist.length) st.board[c4hist.pop()] = 0;
      st.turn = mineN - 1; st.winner = -1; st.line = []; st.draw = false;
      botEpoch++;
      send(); save();
    });
    api.onRejoin(() => send());
    api.onLeave(() => {
      if (st.winner < 0 && !st.draw) {
        const stay = order.find((id) => !api.player(id).left);
        api.endGame({ title: 'Opponent left', ranking: stay ? [{ id: stay, score: 'win' }] : [], winners: stay ? [stay] : [] });
      }
    });
    send();
    maybeBot();
  }
  render();
  shown.splice(0, shown.length, ...st.board);
}

function findLine(b, r, c) {
  const v = b[r * C + c];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [r * C + c];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < R && cc >= 0 && cc < C && b[rr * C + cc] === v) {
        line.push(rr * C + cc);
        rr += dr * s; cc += dc * s;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

// ---------------------------------------------------------------- the computer's brain: alpha-beta search
const ORDER = [3, 2, 4, 1, 5, 0, 6]; // look at the centre first (better pruning, better play)
function windowScore(a, b, c, d, me) {
  const opp = 3 - me;
  let m = 0, o = 0, e = 0;
  for (const v of [a, b, c, d]) { if (v === me) m++; else if (v === opp) o++; else e++; }
  if (m && o) return 0;
  if (m === 4) return 10000; if (o === 4) return -10000;
  if (m === 3) return 60; if (m === 2) return 10; if (o === 3) return -70; if (o === 2) return -8;
  return 0;
}
function evaluate(b, me) {
  let sc = 0;
  for (let r = 0; r < R; r++) if (b[r * C + 3] === me) sc += 6; else if (b[r * C + 3]) sc -= 6;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (c + 3 < C) sc += windowScore(b[r * C + c], b[r * C + c + 1], b[r * C + c + 2], b[r * C + c + 3], me);
    if (r + 3 < R) sc += windowScore(b[r * C + c], b[(r + 1) * C + c], b[(r + 2) * C + c], b[(r + 3) * C + c], me);
    if (r + 3 < R && c + 3 < C) sc += windowScore(b[r * C + c], b[(r + 1) * C + c + 1], b[(r + 2) * C + c + 2], b[(r + 3) * C + c + 3], me);
    if (r + 3 < R && c - 3 >= 0) sc += windowScore(b[r * C + c], b[(r + 1) * C + c - 1], b[(r + 2) * C + c - 2], b[(r + 3) * C + c - 3], me);
  }
  return sc;
}
const dropRow = (b, c) => { for (let r = R - 1; r >= 0; r--) if (!b[r * C + c]) return r; return -1; };
function search(b, depth, alpha, beta, turn, me) {
  // returns the score from `me`'s point of view
  const cols = ORDER.filter((c) => !b[c]);
  if (!cols.length) return 0;
  if (depth === 0) return evaluate(b, me);
  let best = turn === me ? -Infinity : Infinity;
  for (const c of cols) {
    const r = dropRow(b, c);
    b[r * C + c] = turn;
    let v;
    if (findLine(b, r, c)) v = (turn === me ? 1 : -1) * (100000 + depth); // faster wins score higher
    else v = search(b, depth - 1, alpha, beta, 3 - turn, me);
    b[r * C + c] = 0;
    if (turn === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return best;
}
export function bestColumn(board, me, level = 'normal') {
  const b = board.slice();
  const cols = ORDER.filter((c) => !b[c]);
  if (level === 'easy' && Math.random() < 0.35) return cols[Math.floor(Math.random() * cols.length)];
  const depth = level === 'easy' ? 2 : level === 'hard' ? 7 : 5;
  let bestC = cols[0], bestV = -Infinity;
  for (const c of cols) {
    const r = dropRow(b, c);
    b[r * C + c] = me;
    const v = findLine(b, r, c) ? 1e6 : search(b, depth - 1, -Infinity, Infinity, 3 - me, me) + (level === 'easy' ? Math.random() * 40 : 0);
    b[r * C + c] = 0;
    if (v > bestV) { bestV = v; bestC = c; }
  }
  return bestC;
}
