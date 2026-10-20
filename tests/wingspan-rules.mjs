import assert from 'node:assert/strict';
import {
  Game, BIRDS, BONUS, GOALS, chooseBotAnswer, mkRng,
  autoPay, costCovered, rowReward,
} from '../js/games/wingspan-engine.js';

assert.equal(BIRDS.length, 185, 'expected the full original bird roster');
assert.equal(BONUS.length, 26);
assert.equal(GOALS.length, 16);
assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => rowReward(1, n).n), [2, 2, 3, 3, 4, 4]);

const pantry = { i: 1, s: 2, f: 0, u: 0, r: 0 };
assert(costCovered({ n: ['i', 's'], or: false }, { i: 1, s: 1, f: 0, u: 0, r: 0 }));
assert(costCovered({ n: ['f'], or: false }, { i: 1, s: 1, f: 0, u: 0, r: 0 }), 'two-for-one food substitution');
assert(!costCovered({ n: ['f'], or: false }, { i: 1, s: 0, f: 0, u: 0, r: 0 }));
assert.deepEqual(autoPay(pantry, { n: ['i', 's'], or: false }), { i: 1, s: 1, f: 0, u: 0, r: 0 });

let finished = 0;
for (const count of [1, 2, 3, 5]) {
  for (const level of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 12; seed++) {
      const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i + 1}`, bot: true }));
      const game = new Game({ players, rng: mkRng(seed), goals: seed % 2 ? 'green' : 'blue', automa: count === 1 ? level : null });
      assert(game.run((g, p, id) => chooseBotAnswer(g, p, id, level)), `game ${count}/${level}/${seed} stalled`);
      assert.equal(game.s.phase, 'over');
      assert.equal(game.s.round, 4);
      assert.equal(game.s.over.rows.length, count === 1 ? 2 : count);
      assert(game.s.over.rows.every((r) => Number.isFinite(r.total) && r.total >= 0));
      finished++;
    }
  }
}

console.log(`Wingspan rules: ${finished} complete games passed`);
