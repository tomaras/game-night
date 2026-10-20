// Manual bot soak: node tests/cascadia-ai.mjs
// OpenAI Codex verification for every difficulty and player count, including solo market flow.
import { makeRng } from '../js/util.js';
import * as R from '../js/games/cascadia-rules.js';
import { planTurn } from '../js/games/cascadia-ai.js';

let games = 0;
for (const level of ['easy', 'normal', 'hard']) {
  for (let n = 1; n <= 4; n++) {
    const rng = makeRng(7000 + games * 97);
    const cards = Array.from({ length: 5 }, (_, i) => R.VARIANTS[(i + games) % 4]);
    const G = R.newGame(n, rng, { cards, solo: n === 1 });
    let guard = 0;
    while (!G.over && guard++ < 20 * n * 4) {
      const pi = G.turn;
      const plan = planTurn(G, pi, level, rng, true);
      if (plan.wipe) {
        const err = R.doWipe(G, rng, pi, plan.wipe.kind, plan.wipe.idx);
        if (err) throw new Error(`${level}/${n} illegal wipe: ${err}`);
      } else {
        const out = R.doTake(G, rng, pi, plan.move);
        if (out.err) throw new Error(`${level}/${n} illegal move: ${out.err} ${JSON.stringify(plan.move)}`);
      }
    }
    if (!G.over || G.turnNo !== 20 * n) throw new Error(`${level}/${n} stalled after ${G.turnNo} turns`);
    const scores = R.finalScores(G.boards.map((x, i) => R.boardFromList(x, G.nature[i])), cards, { n });
    if (scores.some((s) => !Number.isFinite(s.total))) throw new Error(`${level}/${n} produced a bad score`);
    games++;
  }
}
console.log(`cascadia AI: ${games} complete games, all legal`);
