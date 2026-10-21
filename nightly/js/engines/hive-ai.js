// Computer player for the insect-tile game: iterative-deepening negamax with alpha-beta, a transposition table,
// killer/history move ordering and a hand-tuned evaluation (queen danger, queen liberties, pinned and covered tiles,
// mobility value of each insect, development, beetle pressure). Rules come from hive-rules.js so it can never cheat.
// The search runs in a Web Worker (hive.worker.js) so the page never freezes; chooseMove() is the synchronous core.
import { Position, replay, K_PLACE, K_MOVE, K_PASS, DI, MAXH, typeOfPiece, TYPES } from './hive-rules.js';

const MATE = 100000;
// value of having each insect free to move, indexed by type letter order Q S B G A M L P
const MOB = [3, 4, 7, 6, 14, 9, 8, 7];
const COVER = [60, 14, 12, 14, 34, 24, 18, 18]; // how bad it is to lie under an enemy beetle
const DEV = [0, 5, 7, 6, 12, 6, 6, 6]; // being on the board (and so able to act) beats waiting in the hand
const DANGER = [0, 4, 16, 50, 130, 360, 100000];
const BEETLE_TOP = 9;

export function evaluate(pos) {
  const H = pos.H, S = pos.S;
  const ag = pos._articulation();
  let s = 0;
  for (const c of pos.occ) {
    const h = H[c];
    for (let i = 0; i < h; i++) {
      const p = S[c * MAXH + i];
      const col = p >> 5, sign = col === 0 ? 1 : -1, t = (p >> 2) & 7;
      if (i < h - 1) {
        const topCol = S[c * MAXH + h - 1] >> 5;
        s -= sign * (topCol !== col ? COVER[t] : 3);
      } else {
        const pinned = h === 1 && pos._artGen[c] === ag;
        if (!pinned) s += sign * MOB[t];
        if (h > 1 && t === 2) s += sign * BEETLE_TOP * (h - 1);
        if (h > 1 && t === 5) s += sign * BEETLE_TOP * (h - 1) * 0.7;
        s += sign * DEV[t];
        if (p === pos.lastMoved) s += 0;
      }
    }
  }
  for (const col of [0, 1]) {
    const sign = col === 0 ? 1 : -1;
    const q = pos.queenCell(col);
    if (q < 0) { s -= sign * pos.placedN[col] * 5; continue; }
    let n = 0, lib = 0;
    for (let d = 0; d < 6; d++) {
      const b = q + DI[d];
      if (H[b]) { n++; continue; }
      if ((H[q + DI[(d + 5) % 6]] > 0) !== (H[q + DI[(d + 1) % 6]] > 0)) lib++;
    }
    let danger = DANGER[n];
    if (n >= 3 && lib === 0) danger += 40; // a queen that can't move can't run away
    s -= sign * danger;
    // enemy beetles/mosquitos perched next to the queen keep the pressure on
    for (let d = 0; d < 6; d++) {
      const b = q + DI[d];
      if (H[b] > 1) { const top = S[b * MAXH + H[b] - 1]; if ((top >> 5) !== col) s += sign * -12; }
    }
  }
  return s;
}

const adj = new Int8Array(0);
const isAdj = (a, b) => { const d = a - b; return d === DI[0] || d === DI[1] || d === DI[2] || d === DI[3] || d === DI[4] || d === DI[5]; };

class Searcher {
  constructor(pos, deadline, seen) {
    this.pos = pos; this.deadline = deadline; this.nodes = 0; this.tt = new Map(); this.killers = []; this.hist = new Map(); this.seen = seen || null;
  }
  stop() { return this.nodes > 0 && (this.nodes & 255) === 0 && performance.now() > this.deadline; }
  order(moves, ttMove, ply) {
    const pos = this.pos, c = pos.turn;
    const oq = pos.queenCell(1 - c), mq = pos.queenCell(c);
    const k = this.killers[ply];
    for (const m of moves) {
      let sc = 0;
      if (ttMove && m.k === ttMove.k && m.to === ttMove.to && m.from === ttMove.from && m.p === ttMove.p) sc += 1e6;
      if (m.k === K_PASS) { m.sc = sc; continue; }
      if (oq >= 0 && isAdj(m.to, oq)) sc += 500 + 60 * pos.queenNeighbours(1 - c);
      if (m.k === K_MOVE) {
        if (oq >= 0 && isAdj(m.from, oq)) sc -= 300; // leaving the enemy queen
        if (mq >= 0 && isAdj(m.from, mq) && pos.H[m.from] === 1) sc += 40 * Math.max(0, pos.queenNeighbours(c) - 2); // peel a defender off? only when crowded
        if (mq >= 0 && isAdj(m.to, mq)) sc -= 120;
        if (typeOfPiece(m.p) === 'A') sc += 30;
        if (m.via >= 0) sc += 20;
      } else {
        const t = typeOfPiece(m.p);
        if (t === 'Q') sc += 40; else if (t === 'A') sc += 60; else if (t === 'B') sc += 25;
        if (mq >= 0 && isAdj(m.to, mq)) sc -= 80;
      }
      if (k && ((k[0] && k[0].to === m.to && k[0].from === m.from && k[0].p === m.p) || (k[1] && k[1].to === m.to && k[1].from === m.from && k[1].p === m.p))) sc += 800;
      sc += (this.hist.get(m.from * 40000 + m.to) || 0) * 0.01;
      m.sc = sc;
    }
    moves.sort((a, b) => b.sc - a.sc);
    return moves;
  }
  search(depth, alpha, beta, ply, ext) {
    const pos = this.pos;
    this.nodes++;
    if (this.stop()) throw TIMEOUT;
    if (pos.winner >= 0) return pos.winner === 2 ? 0 : (pos.winner === pos.turn ? MATE - ply : -MATE + ply);
    if (depth <= 0) { const e = evaluate(pos); return pos.turn === 0 ? e : -e; }
    const a0 = alpha;
    const hash = pos.hash;
    const e = this.tt.get(hash);
    let ttMove = null;
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        if (e.flag === 0) return e.score;
        if (e.flag === 1 && e.score >= beta) return e.score;
        if (e.flag === 2 && e.score <= alpha) return e.score;
      }
    }
    const moves = this.order(pos.legalMoves(), ttMove, ply);
    let best = -Infinity, bestMove = null;
    for (const m of moves) {
      const u = pos.play(m);
      let d = depth - 1, x = ext;
      if (ext < 2 && d <= 0 && (pos.queenNeighbours(0) >= 5 || pos.queenNeighbours(1) >= 5)) { d = 1; x++; }
      let v;
      try { v = -this.search(d, -beta, -alpha, ply + 1, x); } finally { pos.undo(u); }
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        const k = this.killers[ply] || (this.killers[ply] = [null, null]);
        if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
        if (m.k !== K_PLACE) this.hist.set(m.from * 40000 + m.to, (this.hist.get(m.from * 40000 + m.to) || 0) + depth * depth);
        break;
      }
    }
    this.tt.set(hash, { depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0, move: bestMove });
    return best;
  }
}
const TIMEOUT = { timeout: true };

const LEVELS = {
  easy: { depth: 1, ms: 200 },
  normal: { depth: 3, ms: 1000 },
  hard: { depth: 9, ms: 3800 },
};

/** Pick a move for the side to move. `pos` is not modified. Returns a move object from pos.legalMoves() (or null if over). */
export function chooseMove(pos0, level = 'normal', opts = {}) {
  const ms = typeof opts === 'number' ? opts : opts.ms;
  const seen = (opts && opts.seen) || null;
  const cfg = LEVELS[level] || LEVELS.normal;
  const pos = pos0.clone();
  const legal = pos.legalMoves();
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];
  const me = pos.turn;
  // opening: a little variety
  if (pos.total <= 1 && level !== 'hard' || pos.total === 0) {
    const nonQ = legal.filter((m) => typeOfPiece(m.p) !== 'Q' || level === 'easy');
    const pool = nonQ.length ? nonQ : legal;
    const bag = pool.filter((m) => 'ABGS'.includes(typeOfPiece(m.p)));
    const from = bag.length ? bag : pool;
    return from[Math.floor(Math.random() * from.length)];
  }
  const root = (m) => {
    const u = pos.play(m);
    let v;
    if (pos.winner >= 0) v = pos.winner === 2 ? 0 : pos.winner === me ? MATE : -MATE;
    else { const e = evaluate(pos); v = me === 0 ? e : -e; }
    if (seen && seen.has(pos.hash) && pos.winner < 0) v -= 40;
    pos.undo(u);
    return v;
  };
  if (level === 'easy') {
    const scored = legal.map((m) => [root(m) + Math.random() * 25, m]).sort((a, b) => b[0] - a[0]);
    if (scored[0][0] > MATE / 2) return scored[0][1];
    const k = Math.max(1, Math.ceil(scored.length / 4));
    return scored[Math.floor(Math.random() * Math.random() * k)][1];
  }
  const budget = ms || cfg.ms;
  const start = performance.now();
  const sr = new Searcher(pos, start + budget, seen);
  let order = legal.slice();
  let bestMove = order[0], depthDone = 0;
  const noise = level === 'normal' ? 10 : 2;
  for (let d = 1; d <= cfg.depth; d++) {
    const round = [];
    let alpha = -Infinity;
    try {
      for (const m of order) {
        const u = pos.play(m);
        let v;
        try {
          if (pos.winner >= 0) v = pos.winner === 2 ? 0 : pos.winner === me ? MATE - 1 : -MATE + 1;
          else { v = -sr.search(d - 1, -Infinity, -alpha, 1, 0); if (seen && seen.has(pos.hash)) v -= 40; }
        } finally { pos.undo(u); }
        round.push([v, m]);
        if (v > alpha) alpha = v;
      }
    } catch (e) { if (e !== TIMEOUT) throw e; round.length = 0; }
    if (!round.length) break;
    round.sort((a, b) => b[0] - a[0]);
    depthDone = d;
    bestMove = round[0][1];
    // keep the order from this pass for the next, deeper one
    order = round.map((x) => x[1]);
    if (round[0][0] > MATE / 2) { bestMove = round[0][1]; break; } // forced win found
    if (round.length > 1 && d === cfg.depth) {
      // a little variety for the weaker level: any move within `noise` of the best
      const near = round.filter((x) => x[0] >= round[0][0] - noise);
      bestMove = near[Math.floor(Math.random() * near.length)][1];
    }
    if (performance.now() - start > budget * 0.5) break; // the next pass would not finish
  }
  void depthDone; void TYPES;
  return bestMove;
}

// ---- off the main thread
let worker = null, seq = 0;
const waiting = new Map();
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./hive.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { const r = waiting.get(e.data.id); if (r) { waiting.delete(e.data.id); r(e.data.move); } };
  worker.onerror = () => { const rs = [...waiting.values()]; waiting.clear(); worker = null; rs.forEach((r) => r(undefined)); };
  return worker;
}
/** The JSON move the computer picks for the position reached by replaying `moves`. Falls back to a short inline search. */
export function chooseMoveAsync(opts, moves, level) {
  const inline = () => {
    const pos = replay(opts, moves);
    const m = chooseMove(pos, level, { ms: 500 });
    return m ? pos.toJSON(m) : null;
  };
  if (typeof Worker === 'undefined') return Promise.resolve(inline());
  try {
    const w = ensureWorker();
    return new Promise((resolve) => { const id = ++seq; waiting.set(id, (m) => resolve(m === undefined ? inline() : m)); w.postMessage({ id, opts, moves, level }); });
  } catch { return Promise.resolve(inline()); }
}
export function stopHiveWorker() { try { worker?.terminate(); } catch { /* */ } worker = null; waiting.clear(); }

/** Search a replayed game: the helper the worker calls. */
export function chooseFromMoves(opts, moves, level) {
  const pos = new Position(opts);
  const seen = new Set([pos.hash]);
  for (const j of moves) { if (!pos.playJSON(j)) break; seen.add(pos.hash); }
  const m = chooseMove(pos, level, { seen });
  return m ? pos.toJSON(m) : null;
}
void adj;
