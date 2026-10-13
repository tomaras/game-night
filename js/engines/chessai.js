// A small chess engine for the computer opponent: negamax + alpha-beta, capture-first move ordering, a short
// quiescence search and "simplified evaluation" piece-square tables. Easy / Normal / Hard just change the depth
// (and how much the easy player blunders). Rules come from the vendored chess.js, so it can never cheat.
import { Chess } from '../../vendor/chess.js';

const V = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece-square tables from White's point of view, rank 8 → rank 1 (Michniewski's simplified evaluation function).
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

function evaluate(g) {
  const b = g.board();
  let s = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (!p) continue;
    const i = p.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
    const v = V[p.type] + PST[p.type][i];
    s += p.color === 'w' ? v : -v;
  }
  return g.turn() === 'w' ? s : -s; // from the side-to-move's point of view
}

const score = (m) => (m.captured ? 10 * V[m.captured] - V[m.piece] / 10 : 0) + (m.promotion ? 800 : 0) + (m.san.includes('+') ? 30 : 0);
const ordered = (g, capturesOnly) => {
  let ms = g.moves({ verbose: true });
  if (capturesOnly) ms = ms.filter((m) => m.captured || m.promotion);
  return ms.sort((a, b) => score(b) - score(a));
};

function quiesce(g, alpha, beta, depth) {
  const stand = evaluate(g);
  if (depth === 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  for (const m of ordered(g, true)) {
    g.move(m);
    const v = -quiesce(g, -beta, -alpha, depth - 1);
    g.undo();
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

const TIMEOUT = { timeout: true };
let nodes = 0, deadline = Infinity;
function negamax(g, depth, alpha, beta, ply) {
  if ((++nodes & 255) === 0 && performance.now() > deadline) throw TIMEOUT;
  const ms = ordered(g, false);
  if (!ms.length) return g.inCheck() ? -100000 + ply : 0; // mate (sooner is worse for the loser) or stalemate
  if (depth === 0) return quiesce(g, alpha, beta, 3);
  for (const m of ms) {
    g.move(m);
    const v = -negamax(g, depth - 1, -beta, -alpha, ply + 1);
    g.undo();
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

/** Pick a move for the side to move in `fen`. Returns {from,to,promotion?} or null.
 *  Normal/Hard search deeper and deeper until their time budget is used up, so the answer is always on time. */
export function chooseMove(fen, level = 'normal') {
  const g = new Chess(fen);
  const root = ordered(g, false);
  if (!root.length) return null;
  const out = (m) => ({ from: m.from, to: m.to, promotion: m.promotion || undefined });
  if (level === 'easy') { // one ply, then blunder-prone: choose among the better third with a random bias
    const scored = root.map((m) => { g.move(m); const v = -evaluate(g); g.undo(); return [v, m]; }).sort((a, b) => b[0] - a[0]);
    const pool = scored.slice(0, Math.max(3, Math.ceil(scored.length / 3)));
    return out(pool[Math.floor(Math.random() * Math.random() * pool.length)][1]);
  }
  const maxDepth = level === 'hard' ? 6 : 4;
  const budget = level === 'hard' ? 1800 : 600;
  const start = performance.now();
  nodes = 0;
  let order = root, scored = null;
  try {
    for (let d = 1; d <= maxDepth; d++) {
      deadline = d === 1 ? Infinity : start + budget; // the first (1-ply) pass always completes
      let alpha = -Infinity;
      const round = [];
      for (const m of order) {
        g.move(m);
        const v = -negamax(g, d - 1, -Infinity, -alpha, 1);
        g.undo();
        round.push([v, m]);
        if (v > alpha) alpha = v;
      }
      round.sort((a, b) => b[0] - a[0]);
      scored = round;
      order = round.map((x) => x[1]); // best-first for the next, deeper pass
      if (Math.abs(round[0][0]) > 90000 || performance.now() - start > budget * 0.55) break;
    }
  } catch (e) { if (e !== TIMEOUT) throw e; }
  deadline = Infinity;
  let pick = scored[0][1];
  if (level === 'normal' && scored.length > 1 && scored[0][0] - scored[1][0] < 25 && Math.random() < 0.3) pick = scored[1][1];
  return out(pick);
}

// ---- run the search off the main thread so the page never freezes (falls back to inline if workers are unavailable)
let worker = null, seq = 0;
const waiting = new Map();
export function chooseMoveAsync(fen, level) {
  if (typeof Worker === 'undefined') return Promise.resolve(chooseMove(fen, level));
  try {
    if (!worker) {
      worker = new Worker(new URL('./chess.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const r = waiting.get(e.data.id); if (r) { waiting.delete(e.data.id); r(e.data.move); } };
      worker.onerror = () => { const rs = [...waiting.values()]; waiting.clear(); worker = null; rs.forEach((r) => r(undefined)); };
    }
    return new Promise((resolve) => { const id = ++seq; waiting.set(id, (m) => resolve(m === undefined ? chooseMove(fen, level) : m)); worker.postMessage({ id, fen, level }); });
  } catch { return Promise.resolve(chooseMove(fen, level)); }
}
export function stopChessWorker() { try { worker?.terminate(); } catch { /* */ } worker = null; waiting.clear(); }
