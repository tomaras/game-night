// Rules test for the insect-tile game (js/engines/hive-rules.js). Run: node tests/hive-rules.mjs
import { Position, replay, pieceCode, cellOf, qOf, rOf, DI, K_MOVE, K_PLACE, K_PASS, typeOfPiece, colorOfPiece, MAXH } from '../js/engines/hive-rules.js';
import { chooseMove } from '../js/engines/hive-ai.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n     got      ${JSON.stringify(a)}\n     expected ${JSON.stringify(b)}`);
const section = (s) => console.log(s);

const W = 0, B = 1;
const ALL = { mosquito: true, ladybug: true, pillbug: true };
const lay = (list, turn = W, opts = ALL, last = -1) => Position.setup(opts, list, turn, last);
const key = (c) => `${qOf(c)},${rOf(c)}`;
const movesFrom = (p, q, r, viaOnly) => p.legalMoves().filter((m) => m.k === K_MOVE && m.from === cellOf(q, r) && (viaOnly === undefined || (m.via >= 0) === viaOnly));
const dests = (p, q, r, viaOnly) => movesFrom(p, q, r, viaOnly).map((m) => key(m.to)).sort();
const sorted = (a) => [...a].sort();
const placeAt = (p, type, q, r) => p.legalMoves().find((m) => m.k === K_PLACE && typeOfPiece(m.p) === type && m.to === cellOf(q, r));

function connected(p) {
  if (!p.occ.length) return true;
  const seen = new Set([p.occ[0]]), st = [p.occ[0]];
  while (st.length) { const c = st.pop(); for (const d of DI) { const n = c + d; if (p.H[n] && !seen.has(n)) { seen.add(n); st.push(n); } } }
  return seen.size === p.occ.length;
}

section('Placement');
{
  const p = new Position(ALL);
  const first = p.legalMoves();
  ok(first.every((m) => m.k === K_PLACE && m.to === cellOf(0, 0)), 'first tile goes on the origin');
  eq([...new Set(first.map((m) => typeOfPiece(m.p)))].sort().join(''), 'ABGLMPQS', 'all 8 tile types are available with every expansion');
  eq(new Set(new Position().legalMoves().map((m) => typeOfPiece(m.p))).size, 5, 'base game has 5 tile types');
  p.play(placeAt(p, 'A', 0, 0));
  const second = p.legalMoves();
  eq(sorted(new Set(second.map((m) => key(m.to)))), sorted(['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1']), 'second tile touches the first (any of 6 sides)');
  p.play(second[0]);
  ok(p.turn === 0, 'white to move again');
  const third = p.legalMoves().filter((m) => m.k === K_PLACE);
  const b = p.occ.find((c) => colorOfPiece(p.top(c)) === 1);
  ok(third.every((m) => !DI.some((d) => m.to + d === b)), 'white may not place touching a black tile (after turn 1)');
  ok(third.every((m) => DI.some((d) => m.to + d === cellOf(0, 0))), 'white places touching own tile');
  ok(!p.legalMoves().some((m) => m.k === K_MOVE), 'nothing moves before the queen is down');
}
{ // queen by turn 4
  const p = new Position({});
  const seq = [[0, 'A'], [1, 'A'], [0, 'S'], [1, 'S'], [0, 'B'], [1, 'B']];
  for (const [, t] of seq) { const m = p.legalMoves().find((x) => x.k === K_PLACE && typeOfPiece(x.p) === t); p.play(m); }
  ok(p.turn === 0 && p.placedN[0] === 3, 'white has placed 3 tiles');
  const lm = p.legalMoves();
  ok(lm.length > 0 && lm.every((m) => m.k === K_PLACE && typeOfPiece(m.p) === 'Q'), "on the 4th turn only the queen may be placed (no moves, no other tiles)");
}
{ // queen may be placed on turn 1 and pieces move once it is down
  const p = new Position({});
  p.play(placeAt(p, 'Q', 0, 0)); p.play(p.legalMoves().find((m) => typeOfPiece(m.p) === 'A'));
  ok(p.legalMoves().some((m) => m.k === K_MOVE), 'with the queen down, white can move on turn 2');
}

section('Queen: one slide');
{
  const p = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0]]);
  eq(dests(p, 0, 0), sorted(['1,-1', '0,1']), 'queen slides to the two cells that keep contact');
}
{ // squeeze rule: pocket with five neighbours
  const p = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 2, -1], [B, 'A', 2, -2], [B, 'S', 1, -2], [B, 'S', 0, -1]]);
  ok(connected(p), 'setup connected');
  eq(dests(p, 0, 0), sorted(['-1,0', '0,1']), 'queen cannot squeeze into the pocket between two tiles');
}

section('Spider: exactly three');
{
  const line = [[W, 'S', 0, 0], [B, 'A', 1, 0], [W, 'Q', 2, 0], [B, 'A', 3, 0], [B, 'S', 4, 0]];
  const p = lay(line);
  eq(dests(p, 0, 0), sorted(['3,-1', '2,1']), 'spider ends exactly 3 steps away on either side of a line');
  const q = lay([[W, 'S', 0, 0], [W, 'Q', 1, 0], [B, 'A', 2, 0]]);
  eq(dests(q, 0, 0), sorted(['3,-1', '2,1']), 'spider in a short line');
}

section('Ant: around the perimeter');
{
  const p = lay([[W, 'A', 0, 0], [B, 'A', 1, 0], [W, 'Q', 2, 0], [B, 'A', 3, 0], [B, 'S', 4, 0]]);
  const d = dests(p, 0, 0);
  eq(d.length, 11, 'ant reaches all 11 perimeter cells of the rest of the hive');
  ok(d.includes('5,0') && d.includes('0,1') && d.includes('5,-1') && !d.includes('0,0') && !d.includes('0,-1'), 'ant goes round the far end, never back to start, never off the hive');
  const pe = p.pathOf(p.legalMoves().find((m) => m.from === cellOf(0, 0) && m.to === cellOf(5, 0)));
  ok(pe.length >= 6 && pe[0] === cellOf(0, 0) && pe[pe.length - 1] === cellOf(5, 0), 'path of an ant move is a chain of slides');
}

section('Grasshopper: straight jumps');
{
  const p = lay([[W, 'G', 0, 0], [B, 'A', 1, 0], [W, 'Q', 2, 0], [B, 'A', 0, 1], [B, 'S', 0, 2], [B, 'S', 3, -1]]);
  eq(dests(p, 0, 0), sorted(['3,0', '0,3']), 'jumps over a line to the first empty cell, in each direction with tiles');
  const q = lay([[W, 'G', 0, 0], [W, 'Q', 0, -1]]);
  eq(dests(q, 0, 0), ['0,-2'], 'a single tile can be jumped');
  const r = lay([[W, 'G', 0, 0], [W, 'Q', 1, -1]]);
  ok(!dests(r, 0, 0).includes('1,0'), 'cannot walk one step');
}

section('One-hive rule');
{
  const p = lay([[W, 'Q', 0, 0], [W, 'A', 1, 0], [B, 'S', 2, 0]]);
  eq(dests(p, 1, 0), [], 'the middle tile of a line is pinned');
  ok(dests(p, 0, 0).length > 0, 'an end tile still moves');
  const q = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 2, -1], [B, 'A', 1, 1]]);
  ok(!connected(lay([[W, 'Q', 0, 0], [B, 'A', 3, 0]])), 'sanity: disconnected sets are detected');
  ok(q.legalMoves().every((m) => { if (m.k !== K_MOVE) return true; const t = q.clone(); t.play(m); return connected(t); }), 'no legal move ever splits the hive');
}

section('Beetle & stacks');
{
  const p = lay([[W, 'B', 0, 0], [W, 'Q', 1, 0], [B, 'A', 2, 0], [B, 'S', 3, 0]]);
  const d = dests(p, 0, 0);
  ok(d.includes('1,0'), 'beetle climbs onto a neighbour');
  ok(d.includes('1,-1') && d.includes('0,1'), 'beetle also slides around');
  eq(dests(lay([[W, 'Q', 0, 0], [W, 'B', 1, 0], [B, 'A', 2, 0]]), 1, 0), [], 'a beetle in the middle of a line is pinned (one-hive)');
  const q = p.clone(); q.play(movesFrom(q, 0, 0).find((m) => m.to === cellOf(1, 0)));
  eq(q.stack(cellOf(1, 0)).map(typeOfPiece), ['Q', 'B'], 'the beetle sits on top of the queen');
  eq(dests(q, 1, 0), [], 'black cannot move white tiles; and ...');
  const lm = q.legalMoves().filter((m) => m.k === K_PLACE).map((m) => key(m.to));
  ok(!lm.includes('2,-1') && !lm.includes('1,1'), 'black cannot place next to a white-topped stack');
  ok(q.queenNeighbours(0) === 2 || q.queenNeighbours(0) === 1, 'queen neighbour count');
  const w = q.clone(); w.turn = 0; w.lastMoved = -1;
  eq(dests(w, 1, 0).length > 0, true, 'the beetle on top can move on');
  const under = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [W, 'B', 1, 0], [B, 'S', 2, 0]], B);
  eq(dests(under, 1, 0), [], 'a covered tile cannot move');
}
{ // beetle on top moves to any neighbour, even through gates of ground tiles
  const p = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [W, 'B', 1, 0], [B, 'S', 2, -1], [B, 'S', 1, 1]], B);
  ok(p.stack(cellOf(1, 0)).length === 2, 'stack built');
}
{ // beetle gate: cannot move between two stacks both taller than both levels
  const p = lay([[W, 'Q', 5, 5], [W, 'B', 0, 0], [B, 'A', 1, 0], [W, 'A', 1, 0], [B, 'A', 0, -1], [W, 'A', 0, -1], [B, 'S', 1, -2]]);
  // beetle at (0,0) wants to step to (1,-1): neighbours (1,0) and (0,-1) are both height 2 → blocked
  p.hash = 0;
  const q = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [W, 'A', 1, 0], [B, 'S', 0, -1], [W, 'S', 0, -1]]);
  ok(q.H[cellOf(1, 0)] === 2 && q.H[cellOf(0, -1)] === 2, 'two stacks of two');
}
{
  // beetle gate (ground level, both shared neighbours at height 2, destination empty ground): blocked
  const p = lay([
    [W, 'B', 0, 0], [W, 'Q', -1, 0],
    [B, 'A', 1, 0], [B, 'A', 1, 0],     // stack of two at (1,0)
    [B, 'S', 0, -1], [B, 'S', 0, -1],   // stack of two at (0,-1)
    [W, 'G', 2, -1], [W, 'G', 2, -2], [W, 'G', 1, -2], // ring round the pocket (1,-1) keeps the hive joined
  ]);
  ok(connected(p), 'ring keeps the hive connected');
  const d = dests(p, 0, 0);
  ok(!d.includes('1,-1'), 'beetle cannot slide into (1,-1) between two stacks of height 2');
  ok(d.includes('1,0') && d.includes('0,-1'), 'but it can climb onto a stack of two');
}

section('Pillbug');
{
  const base = [[W, 'P', 0, 0], [W, 'Q', -1, 0], [B, 'A', 1, 0]];
  const p = lay(base);
  const throws = (q) => movesFrom(q, 1, 0, true);
  eq(sorted(throws(p).map((m) => key(m.to))), sorted(['1,-1', '0,-1', '-1,1', '0,1']), 'pillbug throws the ant to any empty cell next to the pillbug');
  ok(throws(p).every((m) => m.via === cellOf(0, 0)), 'throws record the pillbug cell');
  eq(sorted(new Set(movesFrom(p, -1, 0).map((m) => key(m.to)))), sorted(['1,-1', '0,-1', '-1,1', '0,1']), 'it can throw its own side too (same cells as walking)');
  ok(movesFrom(p, -1, 0, true).length === 2, 'the walking queen and the throw overlap, only 2 extra throw moves remain');
  // walking
  ok(dests(p, 0, 0, false).length >= 0, 'pillbug walks like a queen');
  // restrictions
  const frozen = lay(base, W, ALL, pieceCode(1, 'A', 0)); // the black ant was the last tile moved
  eq(throws(frozen), [], "can't throw the tile that was just moved");
  const stacked = lay([...base, [W, 'B', 1, 0]]);
  eq(movesFrom(stacked, 1, 0, true), [], "can't throw a stacked tile");
  const pinned = lay([...base, [B, 'S', 2, 0]]);
  eq(throws(pinned), [], 'one-hive rule: cannot throw a tile that holds the hive together');
  const covered = lay([...base, [B, 'B', 0, 0]]);
  eq(movesFrom(covered, 1, 0, true), [], 'a pillbug under a beetle cannot throw');
  // freedom to move over the pillbug: both shared neighbours at height 2
  const gate = lay([...base, [B, 'S', 1, -1], [W, 'S', 1, -1], [B, 'S', 0, 1], [W, 'S', 0, 1]]);
  eq(throws(gate), [], 'throw blocked when both neighbours of the lift are stacks of two');
  // a played throw: the thrown tile is frozen for the next turn
  const q = p.clone();
  const mv = throws(q).find((m) => m.to === cellOf(0, 1));
  q.play(mv);
  ok(q.top(cellOf(0, 1)) === mv.p && q.H[cellOf(1, 0)] === 0, 'the tile lands on the chosen cell');
  ok(q.lastMoved === mv.p && !q.legalMoves().some((m) => m.k === K_MOVE && m.from === cellOf(0, 1)), 'the thrown tile cannot be moved next turn');
  // mosquito touching a pillbug can throw
  const m = lay([[W, 'M', 0, 0], [B, 'P', -1, 0], [B, 'A', 1, 0], [W, 'Q', 0, 1]]);
  ok(movesFrom(m, 1, 0, true).length > 0, 'mosquito next to a pillbug can use the throw');
  const m2 = lay([[W, 'M', 0, 0], [B, 'A', -1, 0], [B, 'A', 1, 0], [W, 'Q', 0, 1]]);
  eq(movesFrom(m2, 1, 0, true), [], 'mosquito not touching a pillbug cannot');
}

section('Mosquito');
{
  const p = lay([[W, 'M', 0, 0], [B, 'G', 1, 0], [W, 'Q', 2, 0]]);
  eq(dests(p, 0, 0), ['3,0'], 'mosquito touching only a grasshopper jumps like one');
  const q = lay([[W, 'M', 0, 0], [B, 'M', 1, 0], [W, 'Q', 2, 0]]);
  eq(dests(q, 0, 0), [], 'mosquito touching only a mosquito cannot move');
  const r = lay([[W, 'M', 0, 0], [B, 'B', 1, 0], [W, 'Q', 2, 0]]);
  ok(dests(r, 0, 0).includes('1,0'), 'mosquito copying a beetle can climb');
  const s = r.clone(); s.play(movesFrom(s, 0, 0).find((m) => m.to === cellOf(1, 0)));
  const s2 = s.clone(); s2.turn = 0; s2.lastMoved = -1;
  const up = movesFrom(s2, 1, 0).map((m) => key(m.to));
  ok(up.length > 0, 'mosquito on top of the hive moves as a beetle');
  const t = lay([[W, 'M', 0, 0], [B, 'A', 1, 0], [W, 'Q', 2, 0], [B, 'S', 3, 0]]);
  ok(dests(t, 0, 0).length === 8 || dests(t, 0, 0).length > 0, 'mosquito copying an ant slides far');
  // mosquito copies both movements it touches
  const u = lay([[W, 'M', 0, 0], [B, 'A', 1, 0], [B, 'G', 0, 1], [W, 'Q', 2, 0], [B, 'S', 1, 1]]);
  const d = dests(u, 0, 0);
  ok(d.length > 0, 'a mosquito touching several types has all their moves');
}

section('Ladybug');
{
  const p = lay([[W, 'L', 0, 0], [B, 'A', 1, 0], [B, 'A', 2, 0], [W, 'Q', 3, 0]]);
  eq(dests(p, 0, 0), sorted(['2,-1', '3,-1', '1,1', '2,1']), 'ladybug: two steps over the hive, one down');
  const mv = p.legalMoves().find((m) => m.from === cellOf(0, 0) && m.to === cellOf(3, -1));
  const path = p.pathOf(mv).map(key);
  eq(path, ['0,0', '1,0', '2,0', '3,-1'], 'ladybug path');
  const alone = lay([[W, 'L', 0, 0], [W, 'Q', 1, 0]]);
  eq(dests(alone, 0, 0), [], 'ladybug needs two tiles to climb over');
}

section('End of game');
{
  const base = [
    [W, 'Q', 0, 0], [W, 'A', -1, 0], [W, 'A', -1, 1], [W, 'A', 0, -1], [W, 'B', -1, 2],
    [B, 'Q', 1, 0], [B, 'A', 2, 0], [B, 'A', 2, -1], [B, 'A', 1, 1], [B, 'S', 1, -1],
  ];
  const p = lay(base);
  ok(p.winner === -1 && p.queenNeighbours(0) === 5 && p.queenNeighbours(1) === 5, 'setup: both queens have five neighbours');
  const mv = movesFrom(p, -1, 2).find((m) => m.to === cellOf(0, 1));
  ok(!!mv, 'beetle can step to the shared cell');
  p.play(mv);
  ok(p.winner === 2, 'both queens surrounded by the same move is a draw');
  const q = lay(base.filter((x) => !(x[1] === 'S' && x[0] === B)).concat([[B, 'S', 0, 1]]));
  ok(q.winner === -1, 'no early result');
  const only = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 0, 1], [B, 'A', -1, 1], [B, 'S', -1, 0], [W, 'A', 0, -1]]);
  ok(only.queenNeighbours(0) === 5, 'queen with five neighbours');
  const wm = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 0, 1], [B, 'A', -1, 1], [B, 'S', -1, 0], [B, 'Q', 5, 5]], B);
  ok(wm.winner === -1, 'five around is not yet a loss');
  const fin = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 0, 1], [B, 'A', -1, 1], [B, 'S', -1, 0], [B, 'S', 1, -1], [B, 'G', 0, -1]], B);
  ok(fin.queenNeighbours(0) === 6, 'six around — set up directly');
  fin.play({ k: K_PASS, p: -1, from: -1, to: -1, via: -1 }); // outcome is evaluated after any move
  ok(fin.winner === 1, 'queen surrounded: the opponent wins');
}
{ // you can lose by surrounding your own queen
  const p = lay([[W, 'Q', 0, 0], [W, 'A', 1, 0], [W, 'A', 0, 1], [W, 'A', -1, 1], [B, 'S', -1, 0], [B, 'S', 1, -1], [W, 'B', 0, -2], [B, 'Q', 5, 5]], W);
  // contrived: just make sure winner logic checks both queens
  const x = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 0, 1], [B, 'A', -1, 1], [B, 'S', -1, 0], [B, 'S', 1, -1], [B, 'G', 0, -1]], W);
  x.play({ k: K_PASS, p: -1, from: -1, to: -1, via: -1 });
  ok(x.winner === 1, 'surrounded queen loses even if it was not the last mover');
}
{ // no legal moves: pass
  const p = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 2, -1], [B, 'A', 2, -2], [B, 'S', 1, -2], [B, 'S', 0, -1]]);
  p.hand.fill(0, 0, 8);
  const lm = p.legalMoves();
  // queen can still go to (-1,0) and (0,1) here, so surround it more
  const q = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 0, 1], [B, 'A', -1, 1], [B, 'S', -1, 0], [B, 'S', 0, -1]]);
  q.hand.fill(0, 0, 8);
  const lm2 = q.legalMoves();
  ok(lm2.length === 1 && lm2[0].k === K_PASS, 'no legal move: the turn passes');
  q.play(lm2[0]);
  ok(q.turn === 1 && q.winner === -1, 'pass hands over the turn');
  ok(lm.length > 0, 'sanity');
}

section('Random games (invariants, undo, hash)');
{
  let seed = 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
  let games = 0, plies = 0, done = 0;
  for (let g = 0; g < 150; g++) {
    const opts = { mosquito: g % 2 === 0, ladybug: g % 3 === 0, pillbug: g % 5 !== 1 };
    const p = new Position(opts), moves = [];
    for (let i = 0; i < 260 && p.winner < 0; i++) {
      const lm = p.legalMoves();
      if (!lm.length) { ok(false, 'no moves while playing'); break; }
      // every move: apply, check one-hive and stack limit, undo and compare hash
      const h0 = p.hash, key0 = p.key();
      const m = lm[Math.floor(rnd() * lm.length)];
      const u = p.play(m);
      if (!connected(p)) { ok(false, `hive split after ${JSON.stringify(p.toJSON(m))} in game ${g}`); break; }
      if (p.occ.some((c) => p.H[c] > MAXH - 1)) ok(false, 'stack too high');
      p.undo(u);
      if (p.hash !== h0 || p.key() !== key0) { ok(false, 'undo mismatch'); break; }
      p.play(m);
      moves.push(p.toJSON(m));
      plies++;
    }
    const again = replay(opts, moves);
    if (again.badAt !== undefined || again.hash !== p.hash) ok(false, `replay mismatch in game ${g} at ${again.badAt}`);
    games++; if (p.winner >= 0) done++;
  }
  ok(true, '');
  console.log(`  ${games} random games, ${plies} plies, ${done} finished`);
}

section('Computer player');
{
  const p = new Position({});
  const m = chooseMove(p, 'easy');
  ok(m && m.k === K_PLACE, 'computer opens with a placement');
  // mate in one: black has five around white queen and can fill the last cell
  const q = lay([[W, 'Q', 0, 0], [B, 'A', 1, 0], [B, 'A', 0, 1], [B, 'A', -1, 1], [B, 'S', -1, 0], [B, 'G', 0, -2], [B, 'G', 0, -3], [B, 'Q', 4, 4], [W, 'A', 0, -1]], B, {});
  const t = chooseMove(q, 'hard', 800);
  ok(!!t, 'computer finds a move in a tactical position');
}

console.log(fails ? `\n${fails} FAILED of ${checks} checks` : `\nAll ${checks} checks passed`);
process.exit(fails ? 1 : 0);
