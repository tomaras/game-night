// Rules engine for the insect-tile game (pure logic, no DOM — used by the game screen, the computer player's worker
// and tests/hive-rules.mjs).
//
// Board: pointy-top hex grid in axial coordinates (q, r). Cells are stored as integers idx = (q+OFF)*W + (r+OFF) in
// typed arrays so search is fast. A cell holds a stack of tiles (bottom → top); the top tile's colour owns the cell.
//
// Tiles: 'Q' queen · 'S' spider · 'B' beetle · 'G' grasshopper · 'A' ant · 'M' mosquito · 'L' ladybug · 'P' pillbug.
// Tile code = colour*32 + typeIndex*4 + n (colour 0 = white, 1 = black).

export const TYPES = 'QSBGAMLP';
export const NAMES = { Q: 'Queen', S: 'Spider', B: 'Beetle', G: 'Grasshopper', A: 'Ant', M: 'Mosquito', L: 'Ladybug', P: 'Pillbug' };
export const BASE_COUNT = { Q: 1, S: 2, B: 2, G: 3, A: 3, M: 1, L: 1, P: 1 };
export const W = 160, OFF = 80, N = W * W, MAXH = 8, LIMIT = 66; // |q|,|r| beyond LIMIT are not playable (never reached in practice)
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const DI = [W, W - 1, -1, -W, -W + 1, 1];
export const cellOf = (q, r) => (q + OFF) * W + (r + OFF);
export const qOf = (c) => Math.floor(c / W) - OFF;
export const rOf = (c) => (c % W) - OFF;
export const colorOfPiece = (p) => p >> 5;
export const typeOfPiece = (p) => TYPES[(p >> 2) & 7];
export const pieceName = (p) => (p >> 5 ? 'b' : 'w') + typeOfPiece(p) + (BASE_COUNT[typeOfPiece(p)] > 1 ? (p & 3) + 1 : '');
export const pieceCode = (color, type, n = 0) => color * 32 + TYPES.indexOf(type) * 4 + n;
const T_Q = 0, T_S = 1, T_B = 2, T_G = 3, T_A = 4, T_M = 5, T_L = 6, T_P = 7;
const tIdx = (p) => (p >> 2) & 7;

const SAFE = new Uint8Array(N);
for (let q = -LIMIT; q <= LIMIT; q++) for (let r = -LIMIT; r <= LIMIT; r++) SAFE[cellOf(q, r)] = 1;

const mix = (a, b, c) => {
  let x = Math.imul(a + 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x9e3779b1);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return x | 0;
};
const TURN_KEY = mix(7, 7, 7);
const lastKey = (p) => (p < 0 ? 0 : mix(p, 99999, 3));

export const defaultOpts = () => ({ mosquito: false, ladybug: false, pillbug: false });
export function typesFor(opts) {
  return TYPES.split('').filter((t) => (t === 'M' ? opts.mosquito : t === 'L' ? opts.ladybug : t === 'P' ? opts.pillbug : true));
}

// Move: { k: 0 place | 1 move | 2 pass, p: piece code (place: the tile that will be placed), from, to, via (pillbug cell or -1) }
export const K_PLACE = 0, K_MOVE = 1, K_PASS = 2;

export class Position {
  constructor(opts = {}) {
    this.opts = { ...defaultOpts(), ...opts };
    this.types = typesFor(this.opts);
    this.H = new Uint8Array(N);
    this.S = new Int8Array(N * MAXH).fill(-1);
    this.pos = new Int32Array(64).fill(-1);
    this.hand = new Int8Array(16); // colour*8 + type → tiles left in hand
    for (const c of [0, 1]) for (const t of this.types) this.hand[c * 8 + TYPES.indexOf(t)] = BASE_COUNT[t];
    this.placedN = [0, 0]; // tiles each colour has placed (= turns taken, for the queen-by-turn-4 rule)
    this.occ = []; // occupied cells
    this.slot = new Int32Array(N).fill(-1);
    this.turn = 0;
    this.ply = 0;
    this.lastMoved = -1;
    this.passes = 0;
    this.winner = -1; // -1 playing · 0 white · 1 black · 2 draw
    this.hash = TURN_KEY * 0; // white to move = 0
    this._stamp = new Uint32Array(N); this._gen = 0;
    this._low = new Int32Array(N); this._disc = new Int32Array(N); this._artGen = new Uint32Array(N); this._ag = 0; this._dg = 0;
    this.total = 0; // tiles on the board
  }

  // ---- queries
  top(c) { return this.H[c] ? this.S[c * MAXH + this.H[c] - 1] : -1; }
  stack(c) { const o = []; for (let i = 0; i < this.H[c]; i++) o.push(this.S[c * MAXH + i]); return o; }
  handCount(color, type) { return this.hand[color * 8 + TYPES.indexOf(type)]; }
  queenCell(color) { return this.pos[color * 32 + T_Q * 4]; }
  /** Tiles around a queen (0–6) or -1 if it isn't placed. */
  queenNeighbours(color) {
    const q = this.queenCell(color);
    if (q < 0) return -1;
    let n = 0;
    for (let d = 0; d < 6; d++) if (this.H[q + DI[d]]) n++;
    return n;
  }
  mustPlaceQueen(color = this.turn) { return this.pos[color * 32] < 0 && this.placedN[color] >= 3; }
  queenPlaced(color = this.turn) { return this.pos[color * 32] >= 0; }

  _add(c, p) {
    this.S[c * MAXH + this.H[c]] = p;
    if (!this.H[c]) { this.slot[c] = this.occ.length; this.occ.push(c); }
    this.H[c]++;
    this.pos[p] = c;
  }
  _remove(c) {
    const i = --this.H[c];
    const p = this.S[c * MAXH + i];
    this.S[c * MAXH + i] = -1;
    if (!this.H[c]) {
      const s = this.slot[c], last = this.occ.pop();
      if (last !== c) { this.occ[s] = last; this.slot[last] = s; }
      this.slot[c] = -1;
    }
    return p;
  }

  /** Cells that are articulation points of the hive graph (removing a lone tile there would split it). Tarjan. */
  _articulation() {
    const ag = ++this._ag;
    const occ = this.occ, H = this.H, disc = this._disc, low = this._low, art = this._artGen, S = this._stamp;
    if (occ.length < 3) return ag;
    const g = ++this._gen;
    let time = 0;
    const dfs = (u, parent) => {
      S[u] = g; disc[u] = low[u] = ++time;
      let kids = 0;
      for (let d = 0; d < 6; d++) {
        const v = u + DI[d];
        if (!H[v] || v === parent) continue;
        if (S[v] === g) { if (disc[v] < low[u]) low[u] = disc[v]; continue; }
        kids++;
        dfs(v, u);
        if (low[v] < low[u]) low[u] = low[v];
        if (parent !== -1 && low[v] >= disc[u]) art[u] = ag;
      }
      if (parent === -1 && kids > 1) art[u] = ag;
    };
    dfs(occ[0], -1);
    return ag;
  }

  // ---- sliding helpers (operate on the board with the moving tile already lifted)
  /** May a tile standing at A (with H[A] tiles under it) step to adjacent B (direction d)? */
  _gate(A, B, d) {
    const H = this.H, h1 = H[A], h2 = H[B];
    const L = H[A + DI[(d + 5) % 6]], R = H[A + DI[(d + 1) % 6]];
    if (h1 === 0 && h2 === 0) return (L > 0) !== (R > 0); // ground slide: stay in contact, don't squeeze
    return Math.min(L, R) <= (h1 > h2 ? h1 : h2);
  }
  _groundSlides(A, cb) {
    const H = this.H;
    for (let d = 0; d < 6; d++) {
      const B = A + DI[d];
      if (H[B] || !SAFE[B]) continue;
      if ((H[A + DI[(d + 5) % 6]] > 0) !== (H[A + DI[(d + 1) % 6]] > 0)) cb(B);
    }
  }

  /** All destination cells for the tile of effective type `t` lifted from A (one-hive already checked by the caller). */
  _dests(t, A, out) {
    const H = this.H;
    if (t === T_Q || t === T_P) { this._groundSlides(A, (B) => out.push(B)); return; }
    if (t === T_B) {
      for (let d = 0; d < 6; d++) { const B = A + DI[d]; if (SAFE[B] && this._gate(A, B, d)) out.push(B); }
      return;
    }
    if (t === T_G) {
      for (let d = 0; d < 6; d++) {
        let B = A + DI[d];
        if (!H[B]) continue;
        while (H[B]) B += DI[d];
        if (SAFE[B]) out.push(B);
      }
      return;
    }
    if (t === T_S) {
      const seen = new Set(), path = [A];
      const walk = (c, n) => {
        this._groundSlides(c, (B) => {
          if (path.includes(B)) return;
          if (n === 2) { if (!seen.has(B)) { seen.add(B); out.push(B); } return; }
          path.push(B); walk(B, n + 1); path.pop();
        });
      };
      walk(A, 0);
      return;
    }
    if (t === T_A) {
      const g = ++this._gen, S = this._stamp, q = [A];
      S[A] = g;
      for (let i = 0; i < q.length; i++) {
        this._groundSlides(q[i], (B) => { if (S[B] !== g) { S[B] = g; q.push(B); out.push(B); } });
      }
      return;
    }
    if (t === T_L) {
      const seen = new Set();
      for (let d1 = 0; d1 < 6; d1++) {
        const B1 = A + DI[d1];
        if (!H[B1] || !this._gate(A, B1, d1)) continue;
        for (let d2 = 0; d2 < 6; d2++) {
          const B2 = B1 + DI[d2];
          if (B2 === A || !H[B2] || !this._gate(B1, B2, d2)) continue;
          for (let d3 = 0; d3 < 6; d3++) {
            const B3 = B2 + DI[d3];
            if (H[B3] || B3 === A || !SAFE[B3] || !this._gate(B2, B3, d3)) continue;
            if (!seen.has(B3)) { seen.add(B3); out.push(B3); }
          }
        }
      }
    }
  }

  /** Effective movement types of the tile on top of cell c (a mosquito copies the tiles it touches). */
  _effTypes(c, p) {
    const t = tIdx(p);
    if (t !== T_M) return [t];
    if (this.H[c] > 1) return [T_B]; // on top of the hive it moves like a beetle
    const o = [];
    for (let d = 0; d < 6; d++) {
      const n = c + DI[d];
      if (!this.H[n]) continue;
      const nt = tIdx(this.S[n * MAXH + this.H[n] - 1]);
      if (nt !== T_M && !o.includes(nt)) o.push(nt);
    }
    return o;
  }

  /** Placement cells for `color` (empty cells touching only that colour's top tiles). */
  placementCells(color = this.turn) {
    const out = [];
    if (this.total === 0) { out.push(cellOf(0, 0)); return out; }
    const H = this.H, g = ++this._gen, S = this._stamp;
    if (this.total === 1) {
      const c = this.occ[0];
      for (let d = 0; d < 6; d++) out.push(c + DI[d]);
      return out;
    }
    for (const c of this.occ) {
      if ((this.S[c * MAXH + H[c] - 1] >> 5) !== color) continue;
      for (let d = 0; d < 6; d++) {
        const b = c + DI[d];
        if (H[b] || S[b] === g || !SAFE[b]) continue;
        S[b] = g;
        let ok = true;
        for (let e = 0; e < 6; e++) {
          const n = b + DI[e];
          if (H[n] && (this.S[n * MAXH + H[n] - 1] >> 5) !== color) { ok = false; break; }
        }
        if (ok) out.push(b);
      }
    }
    return out;
  }

  /** The tile that placing `type` would put down (lowest unplaced number). */
  nextPiece(color, type) {
    const left = this.hand[color * 8 + TYPES.indexOf(type)];
    return left > 0 ? pieceCode(color, type, BASE_COUNT[type] - left) : -1;
  }

  /** Every legal move for the side to move ([pass] if it has none). Empty once the game is over. */
  legalMoves() {
    const out = [];
    if (this.winner >= 0) return out;
    const c = this.turn, H = this.H;
    const seenMv = new Set();
    const push = (m) => { const key = m.k === K_PLACE ? -1 - m.p * N - m.to : m.from * N + m.to; if (seenMv.has(key)) return; seenMv.add(key); out.push(m); };
    // placements
    const must = this.mustPlaceQueen(c);
    const cells = this.placementCells(c);
    for (const t of this.types) {
      if (must && t !== 'Q') continue;
      const p = this.nextPiece(c, t);
      if (p < 0) continue;
      for (const to of cells) push({ k: K_PLACE, p, from: -1, to, via: -1 });
    }
    // movement (only once your queen is down)
    if (this.queenPlaced(c)) {
      const ag = this._articulation();
      const occ = this.occ.slice();
      for (const A of occ) {
        const p = this.S[A * MAXH + H[A] - 1];
        if ((p >> 5) !== c) continue;
        if (p === this.lastMoved) continue;
        if (H[A] === 1 && this._artGen[A] === ag) continue; // lifting it would split the hive
        const types = this._effTypes(A, p);
        if (!types.length) continue;
        H[A]--;
        const dests = [];
        for (const t of types) this._dests(t, A, dests);
        H[A]++;
        for (const to of dests) push({ k: K_MOVE, p, from: A, to, via: -1 });
      }
      // pillbug throws (a real pillbug, or a mosquito touching one)
      for (const P of occ) {
        if (H[P] !== 1) continue;
        const hp = this.S[P * MAXH];
        if ((hp >> 5) !== c) continue;
        const ht = tIdx(hp);
        let can = false;
        if (hp === this.lastMoved) continue; // a tile that was just moved is frozen: it can't use its power either
        if (ht === T_P) can = true;
        else if (ht === T_M) { for (let d = 0; d < 6 && !can; d++) { const n = P + DI[d]; if (H[n] && tIdx(this.S[n * MAXH + H[n] - 1]) === T_P) can = true; } }
        if (!can) continue;
        for (let d = 0; d < 6; d++) {
          const T = P + DI[d];
          if (H[T] !== 1) continue; // un-stacked tiles only
          const tp = this.S[T * MAXH];
          if (tp === this.lastMoved) continue;
          if (this._artGen[T] === ag) continue;
          H[T] = 0; // lift it
          const L1 = H[T + DI[(d + 2) % 6]] , R1 = H[T + DI[(d + 4) % 6]]; // shared neighbours of T and P
          if (Math.min(L1, R1) <= 1) {
            for (let e = 0; e < 6; e++) {
              const D = P + DI[e];
              if (H[D] || D === T || !SAFE[D]) continue;
              const L2 = H[P + DI[(e + 5) % 6]], R2 = H[P + DI[(e + 1) % 6]]; // shared neighbours of P and D
              if (Math.min(L2, R2) <= 1) push({ k: K_MOVE, p: tp, from: T, to: D, via: P });
            }
          }
          H[T] = 1;
        }
      }
    }
    if (!out.length) out.push({ k: K_PASS, p: -1, from: -1, to: -1, via: -1 });
    return out;
  }

  // ---- making moves
  play(m) {
    const u = { m, lastMoved: this.lastMoved, winner: this.winner, passes: this.passes, hash: this.hash, turn: this.turn };
    const c = this.turn;
    this.hash ^= lastKey(this.lastMoved);
    if (m.k === K_PLACE) {
      this._add(m.to, m.p);
      this.hand[c * 8 + tIdx(m.p)]--;
      this.placedN[c]++;
      this.total++;
      this.hash ^= mix(m.p, m.to, 0);
      this.lastMoved = -1; this.passes = 0;
    } else if (m.k === K_MOVE) {
      const lv = this.H[m.from] - 1;
      this._remove(m.from);
      this.hash ^= mix(m.p, m.from, lv);
      this._add(m.to, m.p);
      this.hash ^= mix(m.p, m.to, this.H[m.to] - 1);
      this.lastMoved = m.p; this.passes = 0;
    } else { this.lastMoved = -1; this.passes++; }
    this.hash ^= lastKey(this.lastMoved) ^ TURN_KEY;
    this.turn = 1 - c;
    this.ply++;
    // outcome
    const s0 = this.queenNeighbours(0) === 6, s1 = this.queenNeighbours(1) === 6;
    if (s0 && s1) this.winner = 2; else if (s0) this.winner = 1; else if (s1) this.winner = 0;
    else if (this.passes >= 2) this.winner = 2;
    return u;
  }
  undo(u) {
    const m = u.m;
    this.turn = u.turn; this.ply--;
    if (m.k === K_PLACE) {
      this._remove(m.to);
      this.pos[m.p] = -1;
      this.hand[u.turn * 8 + tIdx(m.p)]++;
      this.placedN[u.turn]--; this.total--;
    } else if (m.k === K_MOVE) {
      this._remove(m.to);
      this._add(m.from, m.p);
    }
    this.lastMoved = u.lastMoved; this.winner = u.winner; this.passes = u.passes; this.hash = u.hash;
  }

  // ---- JSON (what the game stores and sends): {k:'place',t:'A',to:[q,r]} {k:'move',from:[q,r],to:[q,r],via?:[q,r]} {k:'pass'}
  toJSON(m) {
    const xy = (c) => [qOf(c), rOf(c)];
    if (m.k === K_PLACE) return { k: 'place', t: typeOfPiece(m.p), to: xy(m.to) };
    if (m.k === K_MOVE) { const o = { k: 'move', from: xy(m.from), to: xy(m.to) }; if (m.via >= 0) o.via = xy(m.via); return o; }
    return { k: 'pass' };
  }
  /** Find the legal move matching a JSON move (or null). */
  fromJSON(j, legal = this.legalMoves()) {
    if (!j || typeof j !== 'object') return null;
    const cell = (a) => (Array.isArray(a) && a.length === 2 && Number.isInteger(a[0]) && Number.isInteger(a[1]) && Math.abs(a[0]) <= LIMIT && Math.abs(a[1]) <= LIMIT ? cellOf(a[0], a[1]) : -2);
    if (j.k === 'pass') return legal.find((m) => m.k === K_PASS) || null;
    if (j.k === 'place') { const to = cell(j.to); return legal.find((m) => m.k === K_PLACE && typeOfPiece(m.p) === j.t && m.to === to) || null; }
    if (j.k === 'move') { const f = cell(j.from), to = cell(j.to); return legal.find((m) => m.k === K_MOVE && m.from === f && m.to === to) || null; }
    return null;
  }
  /** Apply a JSON move if it is legal. Returns the move or null. */
  playJSON(j) { const m = this.fromJSON(j); if (!m) return null; this.play(m); return m; }

  /** A translation-independent description of the position, for repetition detection. */
  key() {
    let mq = 1e9, mr = 1e9;
    for (const c of this.occ) { mq = Math.min(mq, qOf(c)); mr = Math.min(mr, rOf(c)); }
    const parts = this.occ.map((c) => `${qOf(c) - mq},${rOf(c) - mr}:${this.stack(c).join('.')}`).sort();
    return parts.join('|') + '#' + this.turn + '#' + this.lastMoved;
  }

  /** The cells a tile passes through for a JSON-style move (for animation): [from, …, to] as cell indices. */
  pathOf(m) {
    if (m.k !== K_MOVE) return [m.to];
    if (m.via >= 0) return [m.from, m.via, m.to];
    const A = m.from, H = this.H;
    const p = this.S[A * MAXH + H[A] - 1];
    const types = this._effTypes(A, p);
    H[A]--;
    let best = null;
    const tryPath = (path) => { if (!best || path.length < best.length) best = path; };
    for (const t of types) {
      if (t === T_G) { const dq = qOf(m.to) - qOf(A), dr = rOf(m.to) - rOf(A); if (dq === 0 || dr === 0 || dq + dr === 0) tryPath([A, m.to]); }
      else if (t === T_B || t === T_Q || t === T_P) { if (DI.includes(m.to - A)) tryPath([A, m.to]); }
      else if (t === T_L) {
        outer: for (let d1 = 0; d1 < 6; d1++) { const B1 = A + DI[d1]; if (!H[B1] || !this._gate(A, B1, d1)) continue;
          for (let d2 = 0; d2 < 6; d2++) { const B2 = B1 + DI[d2]; if (B2 === A || !H[B2] || !this._gate(B1, B2, d2)) continue;
            for (let d3 = 0; d3 < 6; d3++) if (B2 + DI[d3] === m.to && this._gate(B2, m.to, d3) && !H[m.to]) { tryPath([A, B1, B2, m.to]); break outer; } } }
      } else if (t === T_S) {
        const path = [A];
        const walk = (c, n) => { this._groundSlides(c, (B) => { if (best && best.length === 4) return; if (path.includes(B)) return; if (n === 2) { if (B === m.to) tryPath([...path, B]); return; } path.push(B); walk(B, n + 1); path.pop(); }); };
        walk(A, 0);
      } else if (t === T_A) {
        const prev = new Map([[A, -1]]), q = [A];
        for (let i = 0; i < q.length && !prev.has(m.to); i++) this._groundSlides(q[i], (B) => { if (!prev.has(B)) { prev.set(B, q[i]); q.push(B); } });
        if (prev.has(m.to)) { const path = []; for (let c = m.to; c !== -1; c = prev.get(c)) path.unshift(c); tryPath(path); }
      }
    }
    H[A]++;
    return best || [A, m.to];
  }

  /** Test / puzzle helper: lay out tiles directly. list = [[colour 0|1, 'A', q, r], …] in stacking order (bottom first). */
  static setup(opts, list, turn = 0, lastMoved = -1) {
    const p = new Position(opts);
    const used = {};
    for (const [color, type, q, r] of list) {
      const key = color + type;
      const n = used[key] = (used[key] ?? -1) + 1;
      const code = pieceCode(color, type, n);
      p._add(cellOf(q, r), code);
      p.hand[color * 8 + TYPES.indexOf(type)]--;
      p.placedN[color]++; p.total++;
    }
    p.turn = turn; p.lastMoved = lastMoved;
    return p;
  }

  clone() {
    const c = new Position(this.opts);
    c.H.set(this.H); c.S.set(this.S); c.pos.set(this.pos); c.hand.set(this.hand);
    c.placedN = this.placedN.slice(); c.occ = this.occ.slice(); c.slot.set(this.slot);
    c.turn = this.turn; c.ply = this.ply; c.lastMoved = this.lastMoved; c.passes = this.passes; c.winner = this.winner; c.hash = this.hash; c.total = this.total;
    return c;
  }
}

/** Build a position by replaying JSON moves. Stops (and reports) at the first illegal move. */
export function replay(opts, moves) {
  const p = new Position(opts);
  for (let i = 0; i < moves.length; i++) if (!p.playJSON(moves[i])) { p.badAt = i; break; }
  return p;
}

/** Coordinates → cell helpers for callers that think in (q, r). */
export const keyOf = (q, r) => q + ',' + r;
