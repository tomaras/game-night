// Computer players for Cascadia. Pure (no DOM). planTurn() returns either a wipe to perform first or a full move.
//  easy   — greedy with big noise, ignores pinecones and corridor races, sometimes wastes a token
//  normal — scores every tile placement + token spot with the real scoring cards, adds a "future potential" term
//  hard   — as normal plus corridor-majority awareness, pinecone play, a one-turn lookahead on what stays in the
//           market for itself, and denial of the pair the next player wants most.
import * as R from './cascadia-rules.js';

const { DIRS, TILE_BY_ID } = R;
export const P = { wp: 0.7, wph: 0.95, pm: 1.6, supply: 0.2, slot: 0.3, key: 1.5, around: 0.05, tokenLook: 0.8, deny: 0.45, K1: 9, K1h: 20, lookN: 8, lookK: 6, topH: 16 };

function context(G, pi) {
  const board = R.boardFromList(G.boards[pi]);
  board.nature = G.nature[pi];
  const oppSizes = [];
  for (let k = 0; k < G.n; k++) if (k !== pi) oppSizes.push(R.corridors(R.boardFromList(G.boards[k])).map((c) => c.size));
  const cx = { G, pi, board, oppSizes, cards: G.cards, n: G.n, remaining: 20 - G.turns[pi], majority: !G.cards.some((c) => c === 'F' || c === 'I') };
  cx.baseAnimal = R.ANIMALS.map((_, a) => R.scoreAnimal(board, a, cx.cards[a]).pts);
  cx.baseHab = habValue(cx, board);
  return cx;
}
function habValue(cx, b, sizesIn) {
  const sizes = sizesIn || R.corridors(b).map((c) => c.size);
  let v = sizes.reduce((s, x) => s + x, 0);
  if (cx.majority) {
    const bonus = R.majorityBonus([sizes, ...cx.oppSizes], cx.n)[0];
    v += bonus.reduce((s, x) => s + x, 0);
    // a corridor that is close to catching up is worth planning for
    if (cx.n === 1) for (const x of sizes) if (x === 5 || x === 6) v += (x - 4) * 0.35;
  }
  return v;
}
const animalDelta = (cx, b, a) => R.scoreAnimal(b, a, cx.cards[a]).pts - cx.baseAnimal[a];

/** How much a board could gain next turn: best token spot per animal, averaged (we get roughly one random token). */
function potential(cx, b, w) {
  if (w <= 0) return 0;
  let sum = 0, supply = 0;
  for (let a = 0; a < 5; a++) {
    const spots = R.tokenSpots(b, a);
    if (!spots.length) continue;
    supply += Math.min(spots.length, 4) * P.supply;
    let best = 0;
    for (const s of spots) {
      const c = b.cells.get(R.key(s.q, s.r));
      c.tok = a;
      const d = R.scoreAnimal(b, a, cx.cards[a]).pts - cx.baseAnimal[a];
      c.tok = -1;
      if (d > best) best = d;
    }
    sum += best;
  }
  return w * (sum / 5 * P.pm + supply);
}

/** Candidate (placement, token) lists for one tile; returns top-K [{q,r,rot,tq,tr,value,place}] */
function enumerate(cx, board, tid, toks, K, noise = 0, rng = Math) {
  const tile = TILE_BY_ID[tid];
  const rots = tile.h[1] < 0 ? [0] : [0, 1, 2, 3, 4, 5];
  const open = R.openHexes(board);
  const placed = [];
  for (const { q, r } of open) {
    for (const rot of rots) {
      const nb = R.withTile(board, tid, q, r, rot);
      const hv = habValue(cx, nb) - cx.baseHab;
      const nr = open.length; // keep shapes compact: fewer new frontier hexes is slightly better
      let around = 0;
      for (const [dq, dr] of DIRS) if (board.cells.has(R.key(q + dq, r + dr))) around++;
      placed.push({ q, r, rot, nb, v: hv + tile.slots.length * P.slot + around * P.around + (noise ? (rng.random ? rng.random() : rng.next()) * noise : 0) });
    }
  }
  placed.sort((x, y) => y.v - x.v);
  const out = [];
  for (const p of placed.slice(0, K)) {
    for (const tok of toks) {
      if (tok.a < 0) continue;
      const base = p.v - tok.cost;
      out.push({ q: p.q, r: p.r, rot: p.rot, nb: p.nb, tok, value: base, tq: null, tr: null, pv: p.v });
      for (const s of R.tokenSpots(p.nb, tok.a)) {
        const c = p.nb.cells.get(R.key(s.q, s.r));
        c.tok = tok.a; c.si = s.si;
        const d = animalDelta(cx, p.nb, tok.a);
        c.tok = -1; c.si = -1;
        const key = TILE_BY_ID[c.t].key ? P.key : 0;
        out.push({ q: p.q, r: p.r, rot: p.rot, nb: p.nb, tok, value: base + d + key + (noise ? (rng.random ? rng.random() : rng.next()) * noise : 0), tq: s.q, tr: s.r, pv: p.v });
      }
    }
  }
  out.sort((x, y) => y.value - x.value);
  return out;
}
const finalBoard = (c) => {
  const nb = R.cloneBoard(c.nb);
  if (c.tq !== null) { const cell = nb.cells.get(R.key(c.tq, c.tr)); cell.tok = c.tok.a; cell.si = TILE_BY_ID[cell.t].slots.indexOf(c.tok.a); }
  return nb;
};

const rnd = (rng) => (rng && rng.next ? rng.next() : Math.random());

/** One decision for the player to move. level: easy | normal | hard. */
export function planTurn(G, pi, level, rng, allowWipe = true) {
  const cx = context(G, pi);
  const market = G.market;
  const hard = level === 'hard', easy = level === 'easy';
  const K1 = easy ? 5 : hard ? P.K1h : P.K1;
  const noise = easy ? 5.5 : 0;
  const splitCost = hard ? 1.6 : 2.4;
  const canSplit = !easy && G.nature[pi] > 0;
  const cands = [];
  for (let i = 0; i < 4; i++) {
    if (market.tiles[i] === null || market.tiles[i] === undefined) continue;
    const toks = [];
    for (let j = 0; j < 4; j++) {
      if (market.tokens[j] < 0) continue;
      if (j === i) toks.push({ a: market.tokens[j], j, cost: 0 });
      else if (canSplit) toks.push({ a: market.tokens[j], j, cost: splitCost });
    }
    if (!toks.length) continue;
    const list = enumerate(cx, cx.board, market.tiles[i], toks, K1, noise, { next: () => rnd(rng) });
    for (const c of list.slice(0, 14)) { c.i = i; c.j = c.tok.j; cands.push(c); }
  }
  if (!cands.length) return { move: fallbackMove(G, pi) };
  cands.sort((x, y) => y.value - x.value);
  const wp = easy ? 0 : Math.min(1, cx.remaining / 7) * (hard ? P.wph : P.wp);
  let top = cands.slice(0, easy ? 8 : hard ? P.topH : 7);
  if (!easy) {
    for (const c of top) { c.fb = finalBoard(c); c.value += potential(cx, c.fb, wp); }
    top.sort((x, y) => y.value - x.value);
  }
  if (hard && G.n > 0) {
    const nextP = (pi + 1) % G.n;
    let oppBest = null, oppMax = 0;
    if (G.n > 1 && cx.remaining > 1) {
      const ocx = context(G, nextP);
      oppBest = [];
      for (let p = 0; p < 4; p++) {
        if (market.tiles[p] === null || market.tokens[p] < 0) { oppBest.push(0); continue; }
        const l = enumerate(ocx, ocx.board, market.tiles[p], [{ a: market.tokens[p], j: p, cost: 0 }], 4);
        oppBest.push(l.length ? l[0].value : 0);
      }
      oppMax = Math.max(...oppBest);
    }
    for (const c of top.slice(0, P.lookN)) {
      // lookahead: what could I do next turn with what is left (one slot refills at random)
      if (cx.remaining > 1) {
        const rest = [];
        for (let p = 0; p < 4; p++) if (p !== c.i && p !== c.j && market.tiles[p] !== null && market.tokens[p] >= 0) rest.push(p);
        const fx = { ...cx, board: c.fb || finalBoard(c) };
        fx.baseAnimal = R.ANIMALS.map((_, a) => R.scoreAnimal(fx.board, a, cx.cards[a]).pts);
        fx.baseHab = habValue(cx, fx.board);
        const gains = rest.map((p) => { const l = enumerate(fx, fx.board, market.tiles[p], [{ a: market.tokens[p], j: p, cost: 0 }], P.lookK); return l.length ? l[0].value : 0; }).sort((x, y) => y - x);
        if (gains.length) c.value += P.tokenLook * ((gains[0] + (gains[1] ?? gains[0])) / 2);
      }
      if (oppBest && c.i === c.j) {
        const others = oppBest.filter((_, p) => p !== c.i);
        const second = others.length ? Math.max(...others) : 0;
        if (oppBest[c.i] >= oppMax) c.value += P.deny * Math.max(0, oppMax - second);
      }
    }
    top.sort((x, y) => y.value - x.value);
  }
  const best = top[0];
  // wipe decisions
  if (allowWipe) {
    const o = R.overpop(G);
    if (o && o.n === 3 && !G.freeWiped) {
      const thresh = easy ? -99 : hard ? 4.6 : 3.2;
      const chance = easy ? 0.3 : 1;
      if (best.value < thresh && rnd(rng) < chance) return { wipe: { kind: 'free', idx: o.idx } };
    }
    if (hard && G.nature[pi] >= 2 && cx.remaining > 4 && best.value < 1.5) {
      // spend a pinecone to wipe the tokens nobody (including me) can use well
      const bad = [];
      for (let j = 0; j < 4; j++) { const a = market.tokens[j]; if (a >= 0 && R.tokenSpots(cx.board, a).length === 0) bad.push(j); }
      if (bad.length >= 2) return { wipe: { kind: 'nature', idx: bad } };
    }
  }
  let pick = best;
  if (easy) {
    // easy sometimes forgets to place the token or picks something mediocre
    pick = top[Math.floor(Math.pow(rnd(rng), 2) * top.length)];
    if (rnd(rng) < 0.15 && pick.tq !== null) pick = { ...pick, tq: null, tr: null };
  }
  const mv = { i: pick.i, j: pick.j, q: pick.q, r: pick.r, rot: pick.rot };
  if (pick.tq !== null) { mv.tq = pick.tq; mv.tr = pick.tr; }
  return { move: mv };
}

function fallbackMove(G, pi) {
  const b = R.boardFromList(G.boards[pi]);
  const i = G.market.tiles.findIndex((t) => t !== null && t !== undefined);
  const j = G.market.tokens.findIndex((a) => a >= 0);
  const h = R.openHexes(b)[0];
  return { i, j: i >= 0 && G.market.tokens[i] >= 0 ? i : j, q: h.q, r: h.r, rot: 0 };
}
