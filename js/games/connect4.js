// Connect Four — 2 players. Host validates moves; everyone renders the broadcast state.
import { h } from '../util.js';

const R = 6, C = 7;
const CSS = `
.c4 { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:12px; min-height:0; }
.c4-status { display:flex; align-items:center; gap:10px; font-weight:800; font-size:20px; min-height:44px; }
.c4-disc { width:26px; height:26px; border-radius:50%; display:inline-block; box-shadow: inset 0 -3px 0 rgba(0,0,0,.25); }
.c4-disc.p1 { background:#ea4335; } .c4-disc.p2 { background:#fbbc04; }
.c4-board { position:relative; background:linear-gradient(150deg,#2f7df0,#1558b0); border-radius:18px; padding:10px; display:grid; grid-template-columns:repeat(${C},1fr); gap:8px; width:min(94%, calc((100dvh - 240px) * ${C} / ${R})); box-shadow:0 10px 0 #0f428a, 0 22px 36px rgba(31,41,55,.28); }
.c4-col { display:grid; grid-template-rows:repeat(${R},1fr); gap:8px; cursor:pointer; border-radius:12px; transition:background .12s; }
.c4-col.can:hover { background:rgba(0,0,0,.08); }
.c4-cell { aspect-ratio:1; border-radius:50%; background:#e8f0fe; box-shadow: inset 0 4px 8px rgba(0,0,0,.28); position:relative; }
.c4-cell.p1::after, .c4-cell.p2::after { content:''; position:absolute; inset:0; border-radius:50%; box-shadow: inset 0 -5px 0 rgba(0,0,0,.25), inset 0 4px 6px rgba(255,255,255,.35); animation: c4drop .45s cubic-bezier(.3,1.3,.5,1); }
.c4-cell.p1::after { background:#ea4335; } .c4-cell.p2::after { background:#fbbc04; }
.c4-cell.win::before { content:''; position:absolute; inset:-4px; border-radius:50%; border:4px solid #fff; animation:pulse .8s infinite; z-index:2; }
@keyframes c4drop { from { transform: translateY(-380%); } }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const first = api.seed % 2;
  const order = first ? [ids[1], ids[0]] : ids; // order[0] = red (moves first)
  const st = { board: Array(R * C).fill(0), turn: 0, winner: -1, line: [], draw: false };

  const status = h('div.c4-status');
  const boardEl = h('div.c4-board');
  api.root.append(h('style', CSS), h('div.c4', status, boardEl));

  const cols = [];
  for (let c = 0; c < C; c++) {
    const col = h('div.c4-col', { onclick: () => play(c) });
    const cells = [];
    for (let r = 0; r < R; r++) { const cell = h('div.c4-cell'); cells.push(cell); col.append(cell); }
    cols.push({ col, cells });
    boardEl.append(col);
  }

  function play(c) {
    if (st.winner >= 0 || st.draw) return;
    if (order[st.turn] !== api.me) return api.toast("It's not your turn");
    api.toHost('drop', { c });
  }

  function render(prevBoard) {
    const mine = order.indexOf(api.me);
    for (let c = 0; c < C; c++) {
      cols[c].col.classList.toggle('can', st.winner < 0 && !st.draw && order[st.turn] === api.me && st.board[c] === 0);
      for (let r = 0; r < R; r++) {
        const v = st.board[r * C + c];
        const cell = cols[c].cells[r];
        const was = prevBoard ? prevBoard[r * C + c] : -1;
        if (was !== v) {
          cell.className = 'c4-cell' + (v ? ' p' + v : '');
        }
        cell.classList.toggle('win', st.line.includes(r * C + c));
      }
    }
    const who = api.player(order[st.turn]);
    if (st.winner >= 0) {
      const w = api.player(order[st.winner]);
      status.replaceChildren(h('span.c4-disc.p' + (st.winner + 1)), `${w.name} wins!`);
    } else if (st.draw) {
      status.replaceChildren('Draw — the board is full');
    } else {
      status.replaceChildren(
        h('span.c4-disc.p' + (st.turn + 1)),
        order[st.turn] === api.me ? 'Your turn!' : `${who.name}'s turn`,
        mine >= 0 ? h('span.muted', { style: 'font-size:13px;font-weight:600' }, ` (you are ${mine === 0 ? 'red' : 'yellow'})`) : null
      );
    }
  }

  api.on('state', (s) => {
    const prev = st.board.slice();
    const placed = s.board.some((v, i) => v !== prev[i]);
    Object.assign(st, s);
    if (placed) api.sfx('drop');
    render(prev);
    if (s.winner >= 0) api.sfx(order[s.winner] === api.me ? 'win' : 'lose');
  });

  if (api.isHost) {
    const send = () => api.broadcast('state', st);
    api.on('drop', ({ c }, from) => {
      if (st.winner >= 0 || st.draw || order[st.turn] !== from || !(c >= 0 && c < C)) return;
      let r = R - 1;
      while (r >= 0 && st.board[r * C + c]) r--;
      if (r < 0) return;
      st.board[r * C + c] = st.turn + 1;
      const line = findLine(st.board, r, c);
      if (line) { st.winner = st.turn; st.line = line; }
      else if (st.board.every(Boolean)) st.draw = true;
      else st.turn ^= 1;
      send();
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
    api.onRejoin(() => send());
    api.onLeave(() => {
      if (st.winner < 0 && !st.draw) {
        const stay = order.find((id) => !api.player(id).left);
        api.endGame({ title: 'Opponent left', ranking: stay ? [{ id: stay, score: 'win' }] : [], winners: stay ? [stay] : [] });
      }
    });
    send();
  }
  render();
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
