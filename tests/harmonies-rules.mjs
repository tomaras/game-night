// Rules checks for Harmonies on hand-built boards: stacking legality, every kind of scoring, animal habitats,
// the turn engine and end-of-game conditions, plus bot-vs-bot games that must never make an illegal move.
// Run: node tests/harmonies-rules.mjs
import assert from 'node:assert/strict';
import { BLUE, GREY, BROWN, GREEN, YELLOW, RED, CELLS, emptyCells, canPlace, kindOf, scoreBoard, riverPts, findHabitats, cubeTargets, scorePlayer, spiritScore, sunsOf, orientations, cardPts } from '../js/games/harmonies-rules.js';
import { ANIMALS, SPIRITS, cardOf } from '../js/games/harmonies-cards.js';
import { createGame, applyTurn, chooseSpirit, standings, currentId } from '../js/games/harmonies-engine.js';
import { botTurn, botSpirit } from '../js/games/harmonies-bot.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('  ok  ' + name); } catch (e) { console.log('  FAIL ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };
const rngOf = (seed) => { let a = seed >>> 0; const next = () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; return { next, shuffle: (arr) => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; } }; };
// a board from {cellIndex: [colours...]}
const board = (m) => { const c = emptyCells(); for (const [i, s] of Object.entries(m)) c[+i].s = s.slice(); return c; };
const at = (q, r) => CELLS.find((c) => c.q === q && c.r === r)?.i;
const centre = at(2, 0 - 1 + 1 - 1 + 1 - 0); // some middle cell
const mid = CELLS.find((c) => c.nb.length === 6);

console.log('geometry');
t('23 spaces, symmetric neighbours, 3 degree classes', () => {
  assert.equal(CELLS.length, 23);
  for (const c of CELLS) for (const j of c.nb) assert.ok(CELLS[j].nb.includes(c.i));
  assert.ok(mid.nb.length === 6);
  assert.equal(CELLS.filter((c) => c.nb.length === 6).length, 7);
});

console.log('stacking');
const can = (stack, k) => { const c = board({ 0: stack }); return canPlace(c, 0, k); };
t('anything on a bare space', () => { for (let k = 0; k < 6; k++) assert.ok(can([], k)); });
t('blue and yellow never stack, and nothing goes on them', () => {
  for (let k = 0; k < 6; k++) { assert.ok(!can([BLUE], k)); assert.ok(!can([YELLOW], k)); }
  for (const s of [[GREY], [BROWN], [RED], [GREY, GREY], [BROWN, BROWN]]) { assert.ok(!can(s, BLUE)); assert.ok(!can(s, YELLOW)); }
});
t('grey stacks on grey up to three', () => {
  assert.ok(can([GREY], GREY)); assert.ok(can([GREY, GREY], GREY)); assert.ok(!can([GREY, GREY, GREY], GREY));
  assert.ok(!can([BROWN], GREY)); assert.ok(!can([RED], GREY)); assert.ok(!can([GREEN], GREY));
});
t('brown stacks on brown only, two high', () => {
  assert.ok(can([BROWN], BROWN)); assert.ok(!can([BROWN, BROWN], BROWN)); assert.ok(!can([GREY], BROWN)); assert.ok(!can([RED], BROWN));
});
t('green goes on one or two trunks only', () => {
  assert.ok(can([BROWN], GREEN)); assert.ok(can([BROWN, BROWN], GREEN));
  assert.ok(!can([GREY], GREEN)); assert.ok(!can([GREEN], GREEN)); assert.ok(!can([RED], GREEN)); assert.ok(!can([BROWN, GREEN], GREEN));
});
t('red goes on exactly one grey / brown / red', () => {
  assert.ok(can([GREY], RED)); assert.ok(can([BROWN], RED)); assert.ok(can([RED], RED));
  assert.ok(!can([GREY, GREY], RED)); assert.ok(!can([BROWN, BROWN], RED)); assert.ok(!can([RED, RED], RED));
  assert.ok(!can([GREEN], RED)); assert.ok(!can([BLUE], RED)); assert.ok(!can([YELLOW], RED));
});
t('nothing goes on a top of a tree, a building, or a space with a cube', () => {
  for (let k = 0; k < 6; k++) { assert.ok(!can([BROWN, GREEN], k)); assert.ok(!can([GREY, RED], k)); }
  const c = board({ 0: [GREY] }); c[0].c = 1;
  for (let k = 0; k < 6; k++) assert.ok(!canPlace(c, 0, k));
  const d = emptyCells(); d[0].c = 1; assert.ok(!canPlace(d, 0, BLUE));
});
t('kinds', () => {
  assert.deepEqual(kindOf([BROWN, BROWN, GREEN]), { t: 'tree', h: 3 });
  assert.deepEqual(kindOf([GREEN]), { t: 'tree', h: 1 });
  assert.deepEqual(kindOf([GREY, GREY]), { t: 'mountain', h: 2 });
  assert.deepEqual(kindOf([BROWN, RED]), { t: 'building', h: 2 });
  assert.deepEqual(kindOf([RED]), { t: 'roof', h: 1 });
  assert.deepEqual(kindOf([BROWN, BROWN]), { t: 'trunk', h: 2 });
});

console.log('scoring');
const tri = (i) => CELLS[i].nb; // neighbours
t('trees 1 / 3 / 7, a bare trunk scores 0', () => {
  const m = mid.i, nb = mid.nb.filter((x) => !CELLS[m].nb.some((y) => y !== x && CELLS[y].nb.includes(x) && false));
  const far = CELLS.filter((c) => c.i !== m && !mid.nb.includes(c.i)).map((c) => c.i);
  const s = scoreBoard(board({ [m]: [GREEN], [mid.nb[0]]: [BROWN, GREEN] }));
  assert.equal(s.trees, 4);
  assert.equal(scoreBoard(board({ [m]: [BROWN, BROWN, GREEN] })).trees, 7);
  assert.equal(scoreBoard(board({ [m]: [BROWN, BROWN] })).trees, 0);
  void nb; void far;
});
t('mountains need a mountain neighbour; heights 1 / 3 / 7', () => {
  assert.equal(scoreBoard(board({ [mid.i]: [GREY, GREY, GREY] })).mountains, 0);
  const a = mid.i, b = mid.nb[0];
  assert.equal(scoreBoard(board({ [a]: [GREY, GREY, GREY], [b]: [GREY] })).mountains, 8);
  assert.equal(scoreBoard(board({ [a]: [GREY, GREY], [b]: [GREY, GREY] })).mountains, 6);
  // a building on grey is not a mountain
  assert.equal(scoreBoard(board({ [a]: [GREY], [b]: [GREY, RED] })).mountains, 0);
});
t('fields: 5 per group of two or more, any size', () => {
  const a = mid.i, b = mid.nb[0], c = mid.nb[1];
  assert.equal(scoreBoard(board({ [a]: [YELLOW] })).fields, 0);
  assert.equal(scoreBoard(board({ [a]: [YELLOW], [b]: [YELLOW] })).fields, 5);
  assert.equal(scoreBoard(board({ [a]: [YELLOW], [b]: [YELLOW], [c]: [YELLOW] })).fields, 5);
  const cells = board({ [a]: [YELLOW], [b]: [YELLOW] });
  const far = CELLS.filter((x) => ![a, b].includes(x.i) && !CELLS[a].nb.includes(x.i) && !CELLS[b].nb.includes(x.i)).map((x) => x.i);
  const f1 = far.find((x) => CELLS[x].nb.some((y) => far.includes(y))), f2 = CELLS[f1].nb.find((x) => far.includes(x));
  cells[f1].s = [YELLOW]; cells[f2].s = [YELLOW];
  assert.equal(scoreBoard(cells).fields, 10);
});
t('buildings: 5 with three different neighbouring colours (top tokens only)', () => {
  const m = mid.i, [n0, n1, n2, n3] = mid.nb;
  const b = (extra) => scoreBoard(board({ [m]: [GREY, RED], ...extra })).buildings;
  assert.equal(b({}), 0);
  assert.equal(b({ [n0]: [BLUE], [n1]: [YELLOW] }), 0);
  assert.equal(b({ [n0]: [BLUE], [n1]: [YELLOW], [n2]: [BROWN, GREEN] }), 5);
  assert.equal(b({ [n0]: [BLUE], [n1]: [BLUE], [n2]: [BLUE] }), 0);
  // buried colours do not count: grey under red is a RED top
  assert.equal(b({ [n0]: [BLUE], [n1]: [RED], [n2]: [YELLOW] }), 5); // blue, red, yellow
  assert.equal(b({ [n0]: [BLUE], [n1]: [BROWN, GREEN], [n2]: [BROWN, BROWN, GREEN], [n3]: [YELLOW] }), 5);
  assert.equal(b({ [n0]: [BLUE], [n1]: [BROWN, GREEN], [n2]: [BROWN, BROWN, GREEN] }), 0); // blue + green only
  // a lone red is no building
  assert.equal(scoreBoard(board({ [m]: [RED], [n0]: [BLUE], [n1]: [YELLOW], [n2]: [GREY] })).buildings, 0);
});
t('river table 0,2,5,8,11,15 then +4', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(riverPts), [0, 2, 5, 8, 11, 15, 19, 23]);
});
t('side A scores only the longest river, branches do not add length', () => {
  const col2 = CELLS.filter((c) => c.col === 2).map((c) => c.i); // a straight column of 5
  assert.equal(scoreBoard(board(Object.fromEntries(col2.slice(0, 4).map((i) => [i, [BLUE]])))).water, 8);
  assert.equal(scoreBoard(board(Object.fromEntries(col2.map((i) => [i, [BLUE]])))).water, 11);
  // two separate rivers: 3 and 2 -> only the 3
  const col0 = CELLS.filter((c) => c.col === 0).map((c) => c.i);
  const m = board({ [col2[0]]: [BLUE], [col2[1]]: [BLUE], [col2[2]]: [BLUE], [col0[0]]: [BLUE], [col0[1]]: [BLUE] });
  assert.equal(scoreBoard(m).water, 5);
  // a Y shape: stem 3 + two arms of 1 -> the longest path is 4
  const c = mid.i, nb = mid.nb;
  const stem = nb[0];
  const y = board({ [c]: [BLUE], [nb[0]]: [BLUE], [nb[2]]: [BLUE], [nb[4]]: [BLUE] });
  const r = scoreBoard(y);
  assert.equal(r.river, 3); void stem;
  // Six water tokens around a dry centre form a loop. Its opposite banks are
  // four tokens apart when both ends are included; the entire loop is not scored.
  const loop = board(Object.fromEntries(nb.map((i) => [i, [BLUE]])));
  assert.equal(scoreBoard(loop).river, 4);
  assert.equal(scoreBoard(loop).water, 8);
});
t('side B: 5 per island, always at least one', () => {
  assert.equal(scoreBoard(emptyCells(), 'B').water, 5);
  // a full column of water splits the board in two
  const col2 = CELLS.filter((c) => c.col === 2).map((c) => c.i);
  const wall = board(Object.fromEntries(col2.map((i) => [i, [BLUE]])));
  const s = scoreBoard(wall, 'B');
  assert.equal(s.islands, 2); assert.equal(s.water, 10);
  // one gap in the wall joins them again
  const gap = board(Object.fromEntries(col2.slice(1).map((i) => [i, [BLUE]])));
  assert.equal(scoreBoard(gap, 'B').islands, 1);
});

console.log('animals');
const buildFor = (card, o = orientations(card)[0]) => {
  for (const base of CELLS) {
    const idx = o.map((c) => CELLS.find((x) => x.q === base.q + c.dq && x.r === base.r + c.dr)?.i);
    if (idx.some((i) => i === undefined)) continue;
    const cells = emptyCells();
    o.forEach((c, j) => {
      const s = c.t === 'water' ? [BLUE] : c.t === 'field' ? [YELLOW] : c.t === 'mountain' ? Array(c.h).fill(GREY) : c.t === 'tree' ? [...Array(c.h - 1).fill(BROWN), GREEN] : [GREY, RED];
      cells[idx[j]].s = s;
    });
    return { cells, idx, mk: o.findIndex((c) => c.mk) };
  }
  return null;
};
t('every card habitat is buildable with legal stacks, and is found in every orientation', () => {
  for (const card of [...ANIMALS, ...SPIRITS]) {
    const os = orientations(card);
    assert.ok(os.length >= 1 && os.length <= 6, card.name);
    for (const o of os) {
      const b = buildFor(card, o);
      assert.ok(b, card.name + ' fits on the board in some orientation');
      const found = findHabitats(b.cells, card);
      assert.ok(found.length >= 1, card.name + ' found');
      assert.ok(found.some((f) => f.target === b.idx[b.mk]), card.name + ' targets marker');
    }
  }
});
t('base habitats rotate but do not mirror', () => {
  const card = { id: 999, cells: [
    { k: 'w', q: 0, r: 0, mk: true }, { k: 'f', q: 1, r: 0 },
    { k: 'm1', q: 1, r: 1 }, { k: 't1', q: 0, r: 1 },
  ] };
  const key = (o) => o.map((x) => `${x.t}:${x.dq},${x.dr}`).sort().join('|');
  const mirrored = [
    { t: 'water', dq: 0, dr: 0 }, { t: 'field', dq: 0, dr: 1 },
    { t: 'mountain', dq: 1, dr: 1 }, { t: 'tree', dq: 1, dr: 0 },
  ];
  assert.equal(orientations(card).length, 6);
  assert.ok(!orientations(card).some((o) => key(o) === key(mirrored)));
});
t('card data is sane', () => {
  assert.equal(ANIMALS.length, 32); assert.equal(SPIRITS.length, 10);
  for (const c of ANIMALS) { assert.equal(c.cells.filter((x) => x.mk).length, 1, c.name); assert.equal(c.vals.length, c.k); for (let i = 1; i < c.k; i++) assert.ok(c.vals[i] > c.vals[i - 1], c.name); }
  assert.equal(new Set(ANIMALS.map((c) => c.name)).size, 32);
});
t('exact heights: a tree of 2 is not a tree of 3, a lone red is no building', () => {
  const fox = ANIMALS.find((c) => c.name === 'Ember Fox'); // t2 + building + field
  const b = buildFor(fox);
  assert.ok(findHabitats(b.cells, fox).length);
  const i = b.idx[0]; const bad = b.cells.map((c) => ({ s: c.s.slice(), c: c.c }));
  bad[i].s = [BROWN, BROWN, GREEN]; assert.equal(findHabitats(bad, fox).length, 0);
  const bad2 = b.cells.map((c) => ({ s: c.s.slice(), c: c.c })); bad2[b.idx[1]].s = [RED]; assert.equal(findHabitats(bad2, fox).length, 0);
  const ok2 = b.cells.map((c) => ({ s: c.s.slice(), c: c.c })); ok2[b.idx[1]].s = [BROWN, RED]; assert.ok(findHabitats(ok2, fox).length); // building may sit on brown
});
t('a cube on the target removes that spot; a cube elsewhere in the pattern does not', () => {
  const duck = ANIMALS.find((c) => c.name === 'Reed Duck');
  const b = buildFor(duck);
  assert.ok(cubeTargets(b.cells, duck).includes(b.idx[b.mk])); // mirrored, the other water space can also take the cube
  const other = b.cells.map((c) => ({ s: c.s.slice(), c: c.c })); other[b.idx[0]].c = 1;
  assert.ok(cubeTargets(other, duck).length >= 1);
  for (const i of cubeTargets(b.cells, duck)) b.cells[i].c = 1;
  assert.equal(cubeTargets(b.cells, duck).length, 0);
});
t('card points: the number revealed after the last cube placed (0 before any)', () => {
  const c = ANIMALS[0];
  assert.equal(cardPts(c, 0), 0); assert.equal(cardPts(c, 1), c.vals[0]); assert.equal(cardPts(c, c.k), c.T);
});
t('spirit rules count only with their cube placed', () => {
  const sp = SPIRITS.find((c) => c.key === 'grove');
  const cells = board({ [mid.i]: [BROWN, BROWN, GREEN], [mid.nb[0]]: [BROWN, GREEN], [mid.nb[1]]: [GREEN] });
  assert.equal(spiritScore(sp, cells), 3 + 1 + 1);
  const withCube = scorePlayer({ cells, hand: [{ id: sp.id, p: 1 }], done: [] });
  const without = scorePlayer({ cells, hand: [{ id: sp.id, p: 0 }], done: [] });
  assert.equal(withCube.spirit, 5); assert.equal(without.spirit, 0);
  assert.equal(withCube.total - without.total, 5);
});
t('solo suns', () => {
  assert.equal(sunsOf(39, 'B', cardOf(100 + 4)).base, 0);
  assert.equal(sunsOf(40, 'A', null).total, 1 + 1 + 2);
  assert.equal(sunsOf(160, 'A', cardOf(100)).base, 8);
  assert.equal(sunsOf(95, 'B', cardOf(100 + 2)).total, 3 + 0 + 1);
});

console.log('engine');
const fresh = (ids = ['a', 'b'], o = {}) => createGame({ ids, rng: rngOf(7), ...o });
t('setup: bag of 120 minus the board, five spaces of three, five cards', () => {
  const G = fresh();
  assert.equal(G.bag.length + 15, 120); assert.ok(G.central.every((s) => s.length === 3)); assert.equal(G.row.length, 5); assert.equal(G.deck.length, 27);
  const S = createGame({ ids: ['a'], rng: rngOf(1) });
  assert.equal(S.central.length, 3); assert.equal(S.row.length, 3); assert.equal(S.bag.length, 111);
});
const legalPlan = (G, id, s) => { const cells = G.P[id].cells.map((c) => ({ s: c.s.slice(), c: c.c })); const acts = [{ t: 'take', s }]; for (const k of G.central[s]) { const c = CELLS.find((x) => canPlace(cells, x.i, k)).i; cells[c].s.push(k); acts.push({ t: 'tok', k, c }); } return acts; };
t('a turn: take 3, place 3, refill the space, pass the turn', () => {
  const G = fresh(); const acts = legalPlan(G, 'a', 2);
  const r = applyTurn(G, 'a', acts, rngOf(1));
  assert.ok(r.ok, r.err);
  assert.equal(r.G.central[2].length, 3); assert.equal(r.G.bag.length, G.bag.length - 3); assert.equal(currentId(r.G), 'b');
  assert.equal(r.G.P.a.cells.reduce((a, c) => a + c.s.length, 0), 3);
});
t('refusals: out of turn, wrong colour, illegal stack, leftover token, two cards', () => {
  const G = fresh(); const acts = legalPlan(G, 'a', 0);
  assert.ok(!applyTurn(G, 'b', acts, rngOf(1)).ok);
  assert.ok(!applyTurn(G, 'a', acts.slice(0, 3), rngOf(1)).ok); // a token left in hand
  const bad = acts.map((a) => ({ ...a })); bad[1].k = (bad[1].k + 1) % 6; if (G.central[0].includes(bad[1].k)) bad[1].k = (bad[1].k + 1) % 6;
  assert.ok(!applyTurn(G, 'a', bad, rngOf(1)).ok || G.central[0].includes(bad[1].k));
  const two = [...acts, { t: 'card', id: G.row[0] }, { t: 'card', id: G.row[1] }];
  assert.ok(!applyTurn(G, 'a', two, rngOf(1)).ok);
  assert.ok(!applyTurn(G, 'a', [{ t: 'tok', k: 0, c: 0 }], rngOf(1)).ok);
});
t('stacking a trunk and leaf in one turn works, in the order given', () => {
  const G = fresh(); G.central[0] = [BROWN, GREEN, RED];
  const ok = applyTurn(G, 'a', [{ t: 'take', s: 0 }, { t: 'tok', k: BROWN, c: 5 }, { t: 'tok', k: GREEN, c: 5 }, { t: 'tok', k: RED, c: 6 }], rngOf(1));
  assert.ok(ok.ok, ok.err); assert.deepEqual(ok.G.P.a.cells[5].s, [BROWN, GREEN]);
  assert.ok(!applyTurn(G, 'a', [{ t: 'take', s: 0 }, { t: 'tok', k: GREEN, c: 5 }, { t: 'tok', k: BROWN, c: 5 }, { t: 'tok', k: RED, c: 6 }], rngOf(1)).ok);
});
t('taking a card, hand limit of four, cubes only where the habitat stands', () => {
  const G = fresh();
  const duck = ANIMALS.find((c) => c.name === 'Reed Duck'); const b = buildFor(duck);
  G.P.a.cells = b.cells; G.row[0] = duck.id; G.P.a.hand = [{ id: 3, p: 0 }];
  G.central[0] = [BLUE, BLUE, BLUE];
  const free = CELLS.filter((c) => !b.cells[c.i].s.length).map((c) => c.i);
  const base = [{ t: 'take', s: 0 }, ...free.slice(0, 3).map((c) => ({ t: 'tok', k: BLUE, c }))];
  const r = applyTurn(G, 'a', [...base, { t: 'card', id: duck.id }, { t: 'cube', card: duck.id, c: b.idx[b.mk] }], rngOf(1));
  assert.ok(r.ok, r.err);
  assert.equal(r.G.P.a.cubes, 1); assert.equal(r.G.P.a.cells[b.idx[b.mk]].c, 1);
  assert.equal(r.G.P.a.hand.find((e) => e.id === duck.id).p, 1);
  assert.ok(!applyTurn(G, 'a', [...base, { t: 'card', id: duck.id }, { t: 'cube', card: duck.id, c: free[5] }], rngOf(1)).ok);
  assert.ok(!applyTurn(G, 'a', [...base, { t: 'cube', card: duck.id, c: b.idx[b.mk] }], rngOf(1)).ok); // not taken yet
  G.P.a.hand = [{ id: 1, p: 0 }, { id: 2, p: 0 }, { id: 3, p: 0 }, { id: 4, p: 0 }];
  assert.ok(!applyTurn(G, 'a', [...base, { t: 'card', id: duck.id }], rngOf(1)).ok);
  // finishing a card moves it aside, freeing a slot
  G.P.a.hand = [{ id: duck.id, p: duck.k - 1 }, { id: 1, p: 0 }, { id: 2, p: 0 }, { id: 4, p: 0 }];
  const r2 = applyTurn(G, 'a', [...base, { t: 'cube', card: duck.id, c: b.idx[b.mk] }, { t: 'card', id: G.row[1] }], rngOf(1));
  assert.ok(r2.ok, r2.err); assert.equal(r2.G.P.a.done.length, 1); assert.equal(r2.G.P.a.hand.length, 4);
});
t('the game ends after the round when a board has two or fewer empty spaces', () => {
  const G = fresh(['a', 'b', 'c']);
  // fill a's board to 3 empty with single field tokens (no cheating on legality: bare ground)
  CELLS.slice(0, 20).forEach((c) => { G.P.a.cells[c.i].s = [YELLOW]; });
  G.central[0] = [BLUE, BLUE, BLUE];
  const free = CELLS.slice(20).map((c) => c.i);
  const r = applyTurn(G, 'a', [{ t: 'take', s: 0 }, ...free.map((c) => ({ t: 'tok', k: BLUE, c }))], rngOf(1));
  assert.ok(r.ok, r.err); assert.ok(r.G.ending); assert.ok(!r.G.over); assert.equal(currentId(r.G), 'b');
  // b and c still get their turns (a started, so c is last)
  const r2 = applyTurn(r.G, 'b', legalPlan(r.G, 'b', 1), rngOf(1)); assert.ok(r2.ok && !r2.G.over);
  const r3 = applyTurn(r2.G, 'c', legalPlan(r2.G, 'c', 1), rngOf(1)); assert.ok(r3.ok && r3.G.over && r3.G.phase === 'over');
});
t('the game ends when the pouch cannot refill a space', () => {
  const G = fresh(); G.bag = [YELLOW, YELLOW];
  const r = applyTurn(G, 'a', legalPlan(G, 'a', 0), rngOf(1));
  assert.ok(r.ok && r.G.ending && r.G.central[0] === null);
  const r2 = applyTurn(r.G, 'b', legalPlan(r.G, 'b', 1), rngOf(1)); assert.ok(r2.ok && r2.G.over);
});
t('solo: the other two spaces are discarded and all three refilled; ends when the pouch runs dry', () => {
  const G = createGame({ ids: ['x'], rng: rngOf(3) });
  const before = G.bag.length;
  const r = applyTurn(G, 'x', legalPlan(G, 'x', 1), rngOf(1));
  assert.ok(r.ok); assert.equal(r.G.bag.length, before - 9); assert.equal(r.G.discard.length, 6); assert.ok(r.G.central.every((s) => s.length === 3));
  G.bag = G.bag.slice(0, 8);
  const r2 = applyTurn(G, 'x', legalPlan(G, 'x', 0), rngOf(1)); assert.ok(r2.ok && r2.G.over);
});
t('solo: swapping a card only when none was taken', () => {
  const G = createGame({ ids: ['x'], rng: rngOf(3) });
  const acts = legalPlan(G, 'x', 0); const gone = G.row[1];
  const r = applyTurn(G, 'x', [...acts, { t: 'swap', id: gone }], rngOf(1)); assert.ok(r.ok, r.err); assert.ok(!r.G.row.includes(gone)); assert.equal(r.G.row.length, 3);
  assert.ok(!applyTurn(G, 'x', [...acts, { t: 'card', id: G.row[0] }, { t: 'swap', id: gone }], rngOf(1)).ok);
  const G2 = fresh(); assert.ok(!applyTurn(G2, 'a', [...legalPlan(G2, 'a', 0), { t: 'swap', id: G2.row[0] }], rngOf(1)).ok);
});
t('a token with nowhere to go is discarded (only then)', () => {
  const G = fresh();
  CELLS.forEach((c) => { G.P.a.cells[c.i].s = [GREEN]; }); // nothing can be placed anywhere
  G.central[0] = [BLUE, GREY, RED];
  const r = applyTurn(G, 'a', [{ t: 'take', s: 0 }, { t: 'drop', k: BLUE }, { t: 'drop', k: GREY }, { t: 'drop', k: RED }], rngOf(1));
  assert.ok(r.ok, r.err);
  const H = fresh(); H.central[0] = [BLUE, GREY, RED];
  assert.ok(!applyTurn(H, 'a', [{ t: 'take', s: 0 }, { t: 'drop', k: BLUE }, { t: 'drop', k: GREY }, { t: 'drop', k: RED }], rngOf(1)).ok);
});
t('spirit phase: pick one of two, it takes a hand slot', () => {
  const G = fresh(['a', 'b'], { spirits: true });
  assert.equal(G.phase, 'spirit');
  assert.ok(!chooseSpirit(G, 'a', 5)); const o = G.P.a.offer;
  assert.ok(chooseSpirit(G, 'a', o[1])); assert.ok(!chooseSpirit(G, 'a', o[0]));
  assert.equal(G.phase, 'spirit'); assert.ok(chooseSpirit(G, 'b', botSpirit(G, 'b'))); assert.equal(G.phase, 'play');
  assert.equal(G.P.a.hand.length, 1); assert.ok(cardOf(G.P.a.hand[0].id).spirit);
});
t('standings: higher total wins, then more cubes, then shared', () => {
  const G = fresh();
  G.P.a.cells = board({ 0: [BROWN, GREEN] }); G.P.b.cells = board({ 0: [BROWN, GREEN] });
  let s = standings(G); assert.equal(s.length, 2); assert.ok(s[0].winner && s[1].winner);
  G.P.b.cubes = 3; s = standings(G); assert.equal(s[0].id, 'b'); assert.ok(s[0].winner && !s[1].winner);
  G.P.a.cells[1].s = [GREEN]; s = standings(G); assert.equal(s[0].id, 'a');
});

console.log('bots');
for (const [players, levels, side, spirits] of [[2, ['easy', 'normal'], 'A', false], [3, ['hard', 'normal', 'easy'], 'B', true], [4, ['normal'], 'A', false], [1, ['hard'], 'A', true], [1, ['normal'], 'B', false]]) {
  t(`${players} players (${levels.join('/')}, side ${side}${spirits ? ', spirits' : ''}): full games with no illegal move`, () => {
    for (let g = 0; g < 3; g++) {
      const rng = rngOf(50 + g); const ids = Array.from({ length: players }, (_, i) => 'p' + i);
      let G = createGame({ ids, side, spirits, rng });
      if (G.phase === 'spirit') ids.forEach((id) => chooseSpirit(G, id, botSpirit(G, id)));
      let guard = 0;
      while (!G.over) {
        const id = currentId(G);
        const r = applyTurn(G, id, botTurn(G, id, levels[ids.indexOf(id) % levels.length], rng.next), rng);
        assert.ok(r.ok, `bot turn refused: ${r.err}`);
        G = r.G; assert.ok(++guard < 150, 'game never ended');
      }
      const st = standings(G); assert.ok(st[0].total > 20, 'scored something');
      if (players === 1) assert.ok(st[0].suns.total >= 0);
    }
  });
}
console.log(`\n${n} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
void centre; void tri;
