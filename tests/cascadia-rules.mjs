// node tests/cascadia-rules.mjs — rules & scoring checks for Timberline (the Cascadia-style game), on hand-built boards.
import * as R from '../js/games/cascadia-rules.js';
import { makeRng } from '../js/util.js';

let fails = 0, passes = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) === JSON.stringify(want)) passes++; else { fails++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const ok = (cond, msg) => eq(!!cond, true, msg);

// a board from [q, r, animal] triples on single-habitat forest tiles (slot animal does not matter for scoring tests)
const T = (h, a = 0) => h * 5 + a;
const animalBoard = (list) => R.boardFromList(list.map(([q, r, a]) => ({ q, r, t: T(0, a), rot: 0, tok: a })));
const score = (list, animal, v) => R.scoreAnimal(animalBoard(list), animal, v).pts;
const B = 0, E = 1, S = 2, H = 3, F = 4;

// ---- tile set
eq(R.TILES.length, 85, '85 habitat tiles');
eq(R.TILES.filter((t) => t.key).length, 25, '25 keystones');
for (let h = 0; h < 5; h++) eq(R.TILES.filter((t) => t.key && t.h[0] === h).length, 5, `5 keystones in habitat ${h}`);
for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) eq(R.TILES.filter((t) => t.h[1] >= 0 && t.h[0] === a && t.h[1] === b).length, 6, `6 tiles for habitats ${a}/${b}`);
ok(R.TILES.every((t) => t.slots.length === (t.key ? 1 : 2) || t.slots.length === 3), 'slot counts');
ok(R.TILES.every((t) => new Set(t.slots).size === t.slots.length), 'distinct slots');
eq(R.STARTERS.length, 5, '5 starter triples');
for (const s of R.STARTERS) {
  const b = R.boardFromList(s.cells);
  ok(s.cells.every((c) => R.DIRS.some(([dq, dr]) => b.cells.has(R.key(c.q + dq, c.r + dr)))), 'starter triple is connected');
  eq(s.cells.length, 3, 'starter has 3 tiles');
}

// ---- bears
eq(score([[0, 0, B], [1, 0, B], [4, 0, B], [5, 0, B], [8, 0, B]], B, 'A'), 11, 'bear A: two pairs = 11');
eq(score([[0, 0, B], [1, 0, B], [2, 0, B]], B, 'A'), 0, 'bear A: a trio is not a pair');
eq(score([[0, 0, B], [1, 0, B], [2, 0, B], [5, 0, B], [6, 0, B], [7, 0, B]], B, 'B'), 20, 'bear B: two trios = 20');
eq(score([[0, 0, B], [4, 0, B], [5, 0, B], [8, 0, B], [9, 0, B], [10, 0, B]], B, 'C'), 2 + 5 + 8 + 3, 'bear C: 1+2+3 with bonus');
eq(score([[0, 0, B], [4, 0, B], [5, 0, B]], B, 'C'), 2 + 5, 'bear C without bonus');
eq(score([[0, 0, B], [1, 0, B], [4, 0, B], [5, 0, B], [6, 0, B], [9, 0, B], [10, 0, B], [11, 0, B], [12, 0, B]], B, 'D'), 5 + 8 + 13, 'bear D: 2+3+4');

// ---- salmon
const line = (n, a = S, q0 = 0, r0 = 0) => Array.from({ length: n }, (_, i) => [q0 + i, r0, a]);
eq(score(line(4), S, 'A'), 12, 'salmon A run of 4');
eq(score([...line(3), ...line(2, S, 5, 0)], S, 'A'), 8 + 5, 'salmon A two separate runs');
eq(score([[0, 0, S], [1, 0, S], [-1, 0, S], [0, 1, S]], S, 'A'), 0, 'salmon A: a salmon touching three others breaks the run');
eq(score(line(7), S, 'A'), 25, 'salmon A: run of 7');
eq(score(line(4), S, 'C'), 12, 'salmon C run of 4');
eq(score(line(2), S, 'C'), 0, 'salmon C run of 2 scores nothing');
eq(score([...line(3), [0, 1, B], [1, -1, E]], S, 'D'), 3 + 2, 'salmon D: 3 salmon + 2 neighbouring animals');
eq(score([[0, 0, S], [1, 0, S], [0, 1, S]], S, 'A'), 8, 'salmon: a triangle counts as a run');

// ---- elk
eq(score([[0, 0, E], [1, 0, E], [2, 0, E]], E, 'A'), 9, 'elk A: line of 3');
eq(score([[0, 0, E], [1, 0, E], [2, 0, E], [3, 0, E], [4, 0, E]], E, 'A'), 13 + 2, 'elk A: line of 5 = 4 + 1');
eq(score([[0, 0, E], [1, 0, E], [0, 1, E]], E, 'A'), 5 + 2, 'elk A: a bent trio is a pair and a single');
eq(score([[0, 0, E], [1, 0, E], [0, 1, E], [1, -1, E]], E, 'B'), 13, 'elk B: diamond = 13');
eq(score([[0, 0, E], [1, 0, E], [0, 1, E]], E, 'B'), 9, 'elk B: triangle = 9');
eq(score([[0, 0, E], [2, 0, E]], E, 'B'), 4, 'elk B: two singles');
eq(score([[0, 0, E], [1, 0, E], [2, 0, E], [2, 1, E]], E, 'C'), 10, 'elk C: herd of 4 = 10');
eq(score([[0, 0, E], [3, 0, E]], E, 'C'), 4, 'elk C: two singles');
eq(score([[1, 0, E], [-1, 0, E], [0, 1, E], [0, -1, E], [1, -1, E], [-1, 1, E]], E, 'D'), 21, 'elk D: ring of 6 around an empty hex');

// ---- hawks
eq(score([[0, 0, H], [2, 0, H], [0, 3, H]], H, 'A'), 8, 'hawk A: three lone hawks');
eq(score([[0, 0, H], [1, 0, H], [0, 3, H]], H, 'A'), 2, 'hawk A: touching hawks do not count');
eq(score([[0, 0, H], [2, 0, H], [0, 2, H]], H, 'C'), 9, 'hawk C: triangle of sight lines = 9');
eq(score([[0, 0, H], [3, 0, H], [6, 0, H]], H, 'C'), 6, 'hawk C: the middle hawk blocks the long line');
eq(score([[0, 0, H], [2, 0, H], [0, 2, H]], H, 'B'), 9, 'hawk B: three watchful hawks');
eq(score([[0, 0, H], [3, 0, H], [1, 0, B], [2, 0, E]], H, 'D'), 7, 'hawk D: two kinds between a pair');
eq(score([[0, 0, H], [2, 0, H], [0, 2, H], [2, 2, H], [1, 0, B]], H, 'D'), 4, 'hawk D: only the pair with a kind between scores');

// ---- foxes
eq(score([[0, 0, F], [1, 0, B], [-1, 0, E], [0, 1, S]], F, 'A'), 3, 'fox A: three kinds');
eq(score([[0, 0, F], [1, 0, F], [-1, 0, E]], F, 'A'), 2 + 1, 'fox A: foxes count as a kind (one fox sees fox + elk, the other only a fox)');
eq(score([[0, 0, F], [1, 0, B], [-1, 0, B], [0, 1, E], [0, -1, E]], F, 'B'), 5, 'fox B: two kinds touched twice');
eq(score([[0, 0, F], [1, 0, B], [-1, 0, B], [0, 1, B]], F, 'C'), 3, 'fox C: three bears');
eq(score([[0, 0, F], [1, 0, F], [0, -1, B], [0, 1, B], [-1, 0, E], [-1, 1, E]], F, 'D'), 7, 'fox D: two kinds touched twice around the pair');
eq(score([[0, 0, F], [1, 0, F], [3, 0, F], [4, 0, F]], F, 'D'), 0, 'fox D: pairs with nothing around score nothing');

// ---- family / intermediate cards
eq(R.scoreAnimal(animalBoard([[0, 0, B], [1, 0, B], [2, 0, B], [5, 0, B], [8, 0, B], [9, 0, B]]), B, 'F').pts, 9 + 2 + 5, 'family card: 3+, 1, 2');
eq(R.scoreAnimal(animalBoard([[0, 0, B], [1, 0, B], [2, 0, B], [5, 0, B], [8, 0, B], [9, 0, B]]), B, 'I').pts, 8 + 5, 'intermediate card: 3, 2 (singles score 0)');

// ---- corridors: five forest tiles in a row, plus two separate; tiles with two habitats connect only through matching edges
{
  const cells = [0, 1, 2, 3, 4].map((q) => ({ q, r: 0, t: T(0), rot: 0 })).concat([{ q: 0, r: 3, t: T(0), rot: 0 }, { q: 1, r: 3, t: T(0), rot: 0 }, { q: 0, r: 1, t: T(2), rot: 0 }]);
  const c = R.corridors(R.boardFromList(cells));
  eq(c[0].size, 5, 'forest corridor = 5 (largest of 5 and 2)');
  eq(c[2].size, 1, 'prairie corridor = 1');
  eq(c[1].size, 0, 'no mountains');
}
{
  // forest/river dual tile at (1,0): rot 0 puts forest on edges 0,1,2 (E, NE, NW) and river on edges 3,4,5 (W, SW, SE)
  const dual = R.TILES.find((t) => t.h[0] === 0 && t.h[1] === 4);
  const cells = [{ q: 0, r: 0, t: T(0), rot: 0 }, { q: 1, r: 0, t: dual.id, rot: 0 }, { q: 2, r: 0, t: T(0), rot: 0 }, { q: 1, r: 1, t: T(4), rot: 0 }, { q: 2, r: -1, t: T(0), rot: 0 }];
  const c = R.corridors(R.boardFromList(cells));
  // dual tile: its W edge is river, facing the forest tile at (0,0): no forest link. Its E edge is forest facing (2,0): link. NE edge forest -> (2,-1) none. NW edge forest -> (1,-1) none
  eq(c[0].size, 3, 'forest: (2,0) + dual + (2,-1) connect through forest edges; (0,0) does not');
  eq(c[4].size, 2, 'river: dual + river tile at (1,1) connect via the SE edge');
  eq(R.edgeHab(dual, 0, 3), 4, 'edge habitats follow rotation');
  eq(R.edgeHab(dual, 3, 0), 4, 'rotated dual tile flips halves');
}

// ---- majority bonuses
eq(R.majorityBonus([[5, 0, 0, 0, 0], [3, 0, 0, 0, 0]], 2).map((x) => x[0]), [2, 0], '2p: largest gets 2');
eq(R.majorityBonus([[4, 0, 0, 0, 0], [4, 0, 0, 0, 0]], 2).map((x) => x[0]), [1, 1], '2p: tie gives 1 each');
eq(R.majorityBonus([[5, 0, 0, 0, 0], [3, 0, 0, 0, 0], [2, 0, 0, 0, 0]], 3).map((x) => x[0]), [3, 1, 0], '3p: 3 / 1 / 0');
eq(R.majorityBonus([[5, 0, 0, 0, 0], [5, 0, 0, 0, 0], [2, 0, 0, 0, 0]], 3).map((x) => x[0]), [2, 2, 0], '3p: two tied for largest get 2 each, no second place');
eq(R.majorityBonus([[5, 0, 0, 0, 0], [5, 0, 0, 0, 0], [5, 0, 0, 0, 0], [2, 0, 0, 0, 0]], 4).map((x) => x[0]), [1, 1, 1, 0], '4p: three tied get 1 each');
eq(R.majorityBonus([[7, 6, 8, 0, 3]], 1)[0], [2, 0, 2, 0, 0], 'solo: 2 per habitat with 7+');

// ---- final scores
{
  const b = R.boardFromList([{ q: 0, r: 0, t: T(0), rot: 0, tok: B }, { q: 1, r: 0, t: T(0), rot: 0, tok: B }, { q: 2, r: 0, t: T(0), rot: 0 }], 3);
  const [s] = R.finalScores([b], ['A', 'A', 'A', 'A', 'A'], { n: 1 });
  eq([s.wild, s.hab, s.maj, s.nature, s.total], [4, 3, 0, 3, 10], 'total = wildlife + habitat + bonus + pinecones');
}
eq(R.soloRank(95), 'Excellent', 'solo rank');
eq(R.soloRank(40), 'Keep exploring', 'solo rank below 60');

// ---- engine: fuzz full games with random legal play for every player count
const cards = ['A', 'B', 'C', 'D', 'A'];
for (let n = 1; n <= 4; n++) {
  for (let g = 0; g < 12; g++) {
    const rng = makeRng(1000 * n + g);
    const G = R.newGame(n, rng, { cards });
    ok(G.stack.length === 20 * Math.max(n, 2) + 3 - 4, `stack size n=${n}`);
    let guard = 0, wipes = 0;
    while (!G.over && guard++ < 400) {
      const pi = G.turn;
      // sometimes wipe
      const o = R.overpop(G);
      if (o && o.n === 3 && rng.next() < 0.5) { eq(R.doWipe(G, rng, pi, 'free', o.idx), null, 'free wipe'); wipes++; }
      ok(!R.overpop(G) || R.overpop(G).n < 4, 'never 4 identical tokens showing');
      if (G.nature[pi] > 0 && rng.next() < 0.3) { R.doWipe(G, rng, pi, 'nature', [rng.int(4)]); }
      const b = R.boardFromList(G.boards[pi]);
      b.nature = G.nature[pi];
      const open = R.openHexes(b);
      const spots = open[rng.int(open.length)];
      let i = rng.int(4), j = i;
      if (G.nature[pi] > 0 && rng.next() < 0.3) j = rng.int(4);
      const tok = G.market.tokens[j];
      const nb = R.withTile(b, G.market.tiles[i], spots.q, spots.r, rng.int(6));
      const ts = R.tokenSpots(nb, tok);
      const mv = { i, j, q: spots.q, r: spots.r, rot: rng.int(6) };
      if (ts.length && rng.next() < 0.8) { const t = ts[rng.int(ts.length)]; mv.tq = t.q; mv.tr = t.r; }
      const nat = G.nature[pi];
      const out = R.doTake(G, rng, pi, mv);
      if (out.err) { ok(false, 'legal move rejected: ' + out.err); break; }
      ok(G.nature[pi] >= 0, 'pinecones never negative');
      ok(G.nature[pi] === nat - (i !== j ? 1 : 0) + out.res.gained, 'pinecone bookkeeping');
    }
    ok(G.over, `game over n=${n}`);
    eq(G.turnNo, 20 * n, `20 turns each n=${n}`);
    eq(G.turns, Array(n).fill(20), `every player takes 20 turns n=${n}`);
    ok(G.boards.every((l) => l.length === 23), `23 tiles each n=${n}`);
    const tokensOnBoards = G.boards.reduce((s, l) => s + l.filter((c) => c.tok >= 0).length, 0);
    const inBag = G.bag.reduce((a, c) => a + c, 0), inMarket = G.market.tokens.filter((a) => a >= 0).length;
    eq(tokensOnBoards + inBag + inMarket, 100, `token conservation n=${n}`);
    const sc = R.finalScores(G.boards.map((l, k) => { const b = R.boardFromList(l); b.nature = G.nature[k]; return b; }), cards, { n, majority: true });
    ok(sc.every((s) => s.total >= 0 && Number.isFinite(s.total)), 'scores finite');
  }
}
// rejected moves
{
  const rng = makeRng(5);
  const G = R.newGame(2, rng);
  const wrong = (G.turn + 1) % 2;
  eq(R.doTake(G, rng, wrong, { i: 0, j: 0, q: 5, r: 5, rot: 0 }).err, 'not your turn', 'out-of-turn move is refused');
  eq(R.doTake(G, rng, G.turn, { i: 0, j: 1, q: 1, r: 1, rot: 0 }).err, 'no pinecone', 'split pick needs a pinecone');
  eq(R.doTake(G, rng, G.turn, { i: 0, j: 0, q: 9, r: 9, rot: 0 }).err, 'tile must touch your habitat', 'tile must touch');
}

console.log(`cascadia rules: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
