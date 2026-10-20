// Rules test for the court bluffing game (js/games/coup-engine.js): node tests/coup-rules.mjs
import assert from 'node:assert/strict';
import * as E from '../js/games/coup-engine.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('  ok  ' + name); } catch (e) { console.log('  FAIL ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };

// small seeded rng
const mk = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const IDS = (k) => Array.from({ length: k }, (_, i) => 'p' + i);
/** A fresh game with chosen hands (first player = p0). hands: { p0: ['duchess','shade'], … } */
function game(k, hands = {}, opts = {}) {
  const S = E.newGame(IDS(k), { first: 0, ...opts }, mk(7));
  for (const [id, h] of Object.entries(hands)) {
    const p = E.P(S, id);
    // put the old cards back in the deck and take the wanted ones out of it
    for (const c of p.cards) S.deck.push(c.r);
    p.cards = h.map((r) => ({ r, dead: false }));
    for (const r of h) { const i = S.deck.indexOf(r); if (i >= 0) S.deck.splice(i, 1); else S.deck.pop(); }
  }
  S.events = [];
  return S;
}
const total = (S) => S.deck.length + S.players.reduce((a, p) => a + p.cards.length, 0);
const expectTotal = (k, opts = {}) => k * 0 + E.copiesFor(k) * E.rolesInPlay(opts).length;
const coins = (S, id) => E.P(S, id).coins;
const hand = (S, id) => E.P(S, id).cards.map((c) => (c.dead ? '(' + c.r + ')' : c.r));
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const bad = (r) => { assert.equal(r.ok, false); return r; };
const lose = (S, id, idx) => ok(E.chooseLose(S, id, idx));
const evs = (S, tt) => S.events.filter((e) => e.t === tt);
/** Everyone eligible answers allow, then the window closes. */
function allAllow(S, except = []) {
  for (const id of Object.keys(S.win.elig)) if (!except.includes(id) && !S.win.resp[id]) ok(E.respond(S, id, 'allow'));
}
const pass = (S) => { allAllow(S); E.closeWindow(S); };

t('setup: deck, coins, hands for 2-10 players', () => {
  for (let k = 2; k <= 10; k++) {
    const S = E.newGame(IDS(k), {}, mk(k));
    assert.equal(total(S), expectTotal(k), 'cards ' + k);
    assert.equal(S.deck.length, expectTotal(k) - 2 * k);
    const per = k <= 6 ? 3 : k <= 8 ? 4 : 5;
    const cnt = {}; for (const p of S.players) for (const c of p.cards) cnt[c.r] = (cnt[c.r] || 0) + 1; for (const r of S.deck) cnt[r] = (cnt[r] || 0) + 1;
    for (const r of E.rolesInPlay()) assert.equal(cnt[r], per, `${k}p ${r}`);
    const cs = S.players.map((p) => p.coins).sort();
    if (k === 2) assert.deepEqual(cs, [1, 2]); else assert.ok(cs.every((c) => c === 2));
    if (k === 2) assert.equal(E.curPlayer(S).coins, 1);
  }
  const S = E.newGame(IDS(3), { oracle: true }, mk(3));
  assert.equal(total(S), 15);
  assert.ok(!S.deck.includes('envoy') && S.players.every((p) => p.cards.every((c) => c.r !== 'envoy')));
});

t('income, foreign aid and tax, then the turn passes', () => {
  let S = game(3);
  ok(E.declare(S, 'p0', { type: 'income' }));
  assert.equal(coins(S, 'p0'), 3); assert.equal(E.curPlayer(S).id, 'p1');
  bad(E.declare(S, 'p0', { type: 'income' })); // not your turn
  ok(E.declare(S, 'p1', { type: 'aid' }));
  assert.equal(S.phase, 'window'); assert.deepEqual(Object.keys(S.win.elig).sort(), ['p0', 'p2']);
  assert.equal(S.win.elig.p0.ch, false); // foreign aid is not a claim
  pass(S);
  assert.equal(coins(S, 'p1'), 4);
  ok(E.declare(S, 'p2', { type: 'tax' }));
  assert.ok(Object.values(S.win.elig).every((e) => e.ch && !e.bl.length));
  pass(S); assert.equal(coins(S, 'p2'), 5);
});

t('coup: costs 7, cannot be answered, target chooses the card; mandatory at 10', () => {
  const S = game(3, { p1: ['duchess', 'shade'] });
  E.P(S, 'p0').coins = 7;
  ok(E.declare(S, 'p0', { type: 'coup', target: 'p1' }));
  assert.equal(coins(S, 'p0'), 0);
  assert.equal(S.phase, 'lose');
  bad(E.chooseLose(S, 'p0', 0));
  lose(S, 'p1', 1);
  assert.deepEqual(hand(S, 'p1'), ['duchess', '(shade)']);
  assert.equal(E.curPlayer(S).id, 'p1');
  const S2 = game(3); E.P(S2, 'p0').coins = 10;
  bad(E.declare(S2, 'p0', { type: 'income' })); bad(E.declare(S2, 'p0', { type: 'tax' }));
  assert.ok(E.legalActions(S2, 'p0').filter((a) => a.ok).every((a) => a.type === 'coup'));
  ok(E.declare(S2, 'p0', { type: 'coup', target: 'p2' }));
  const S3 = game(3); E.P(S3, 'p0').coins = 6; bad(E.declare(S3, 'p0', { type: 'coup', target: 'p1' }));
});

t('last influence: auto-reveal, elimination, coins return, last standing wins', () => {
  const S = game(2, { p1: ['duchess', 'shade'] });
  E.P(S, 'p0').coins = 7;
  ok(E.declare(S, 'p0', { type: 'coup', target: 'p1' }));
  lose(S, 'p1', 0);
  E.P(S, 'p1').coins = 4; // (rest of the turn)
  E.timeoutStep(S); // p1 acts (income)
  E.P(S, 'p1').coins = 7;
  S.events = [];
  E.P(S, 'p0').coins = 7;
  // p0's turn again
  ok(E.declare(S, 'p0', { type: 'coup', target: 'p1' })); // only one card left: auto
  assert.equal(S.phase, 'over'); assert.equal(S.winner, 'p0');
  assert.equal(coins(S, 'p1'), 0);
  assert.equal(evs(S, 'out').length, 1);
});

t('foreign aid: Duchess block, unchallenged, then a bluffed block', () => {
  let S = game(3, { p0: ['shade', 'shade'], p1: ['duchess', 'corsair'] });
  ok(E.declare(S, 'p0', { type: 'aid' }));
  ok(E.respond(S, 'p1', 'block', 'duchess'));
  E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  assert.equal(S.phase, 'window'); assert.equal(S.win.kind, 'block');
  assert.ok(!S.win.elig.p1 && S.win.elig.p0 && S.win.elig.p2); // everyone except the blocker may challenge
  pass(S);
  assert.equal(coins(S, 'p0'), 2); assert.equal(E.curPlayer(S).id, 'p1'); // aid failed
  // bluffed block, challenged by the actor: blocker loses, aid goes through
  S = game(3, { p0: ['shade', 'shade'], p1: ['corsair', 'corsair'] });
  ok(E.declare(S, 'p0', { type: 'aid' }));
  ok(E.respond(S, 'p1', 'block', 'duchess')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  ok(E.respond(S, 'p0', 'challenge')); E.closeWindow(S);
  assert.equal(S.phase, 'lose'); lose(S, 'p1', 0);
  assert.equal(coins(S, 'p0'), 4); assert.equal(evs(S, 'reveal')[0].proved, false);
});

t('challenge: truthful claim proves, card is shuffled back and replaced, challenger loses', () => {
  const S = game(3, { p0: ['duchess', 'shade'], p1: ['corsair', 'warden'] });
  ok(E.declare(S, 'p0', { type: 'tax' }));
  ok(E.respond(S, 'p1', 'challenge')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  assert.equal(S.phase, 'lose'); assert.equal(S.wait.who[0], 'p1');
  const deckBefore = S.deck.length;
  lose(S, 'p1', 0);
  assert.equal(S.deck.length, deckBefore); assert.equal(total(S), 15);
  assert.equal(coins(S, 'p0'), 5, 'tax still happens');
  assert.equal(hand(S, 'p1')[0], '(corsair)');
  const rv = evs(S, 'reveal')[0]; assert.equal(rv.proved, true); assert.equal(rv.role, 'duchess');
  assert.equal(evs(S, 'replace').length, 1);
  assert.equal(S.claims.p0.duchess.ok, 1);
});

t('challenge: a bluff loses an influence and the action fails', () => {
  const S = game(3, { p0: ['shade', 'corsair'] });
  ok(E.declare(S, 'p0', { type: 'tax' }));
  ok(E.respond(S, 'p2', 'challenge')); E.respond(S, 'p1', 'allow'); E.closeWindow(S);
  assert.equal(S.wait.who[0], 'p0'); lose(S, 'p0', 1);
  assert.equal(coins(S, 'p0'), 2); assert.equal(E.curPlayer(S).id, 'p1');
  assert.equal(S.claims.p0.duchess.bad, 1);
});

t('challenge goes to the first challenger; challenges outrank blocks', () => {
  const S = game(4, { p0: ['shade', 'corsair'], p1: ['duchess', 'warden'], p2: ['warden', 'warden'] });
  E.P(S, 'p0').coins = 3;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  ok(E.respond(S, 'p1', 'block', 'warden'));
  ok(E.respond(S, 'p3', 'challenge'));
  ok(E.respond(S, 'p2', 'challenge'));
  E.closeWindow(S);
  assert.equal(evs(S, 'challenge')[0].by, 'p3'); assert.equal(evs(S, 'challenge')[0].on, 'action');
  bad(E.respond(S, 'p1', 'allow')); // window is gone
});

t('assassination: pays 3, target loses a card; unchallenged Warden block keeps coins spent', () => {
  let S = game(3, { p0: ['shade', 'duchess'], p1: ['warden', 'corsair'] });
  E.P(S, 'p0').coins = 4;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  assert.equal(coins(S, 'p0'), 1);
  assert.deepEqual(Object.keys(S.win.elig).sort(), ['p1', 'p2']);
  assert.deepEqual(S.win.elig.p2.bl, [], 'only the target may block');
  assert.deepEqual(S.win.elig.p1.bl, ['warden']);
  pass(S); assert.equal(S.phase, 'lose'); lose(S, 'p1', 1);
  assert.deepEqual(hand(S, 'p1'), ['warden', '(corsair)']);
  S = game(3, { p0: ['shade', 'duchess'], p1: ['warden', 'corsair'] });
  E.P(S, 'p0').coins = 3;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  ok(E.respond(S, 'p1', 'block', 'warden')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  pass(S);
  assert.equal(coins(S, 'p0'), 0, 'fee stays spent'); assert.deepEqual(hand(S, 'p1'), ['warden', 'corsair']); assert.equal(E.curPlayer(S).id, 'p1');
});

t('assassination bluff caught: the fee is refunded', () => {
  const S = game(3, { p0: ['duchess', 'duchess'] });
  E.P(S, 'p0').coins = 3;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  ok(E.respond(S, 'p2', 'challenge')); E.respond(S, 'p1', 'allow'); E.closeWindow(S);
  lose(S, 'p0', 0);
  assert.equal(coins(S, 'p0'), 3); assert.equal(hand(S, 'p1').filter((c) => c[0] === '(').length, 0);
});

t('DOUBLE LOSS: target challenges the real assassin, loses, then the assassination kills the second card', () => {
  const S = game(3, { p0: ['shade', 'duchess'], p1: ['corsair', 'envoy'] });
  E.P(S, 'p0').coins = 3;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  ok(E.respond(S, 'p1', 'challenge')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  assert.equal(S.wait.who[0], 'p1'); lose(S, 'p1', 0);          // lost the challenge
  assert.equal(S.phase, 'window'); assert.equal(S.win.blockOnly, true); // may still block (with a real Warden)
  pass(S);                                                      // …but cannot, so allows
  assert.equal(E.P(S, 'p1').alive, false, 'eliminated by one assassination');
  assert.equal(evs(S, 'lose').length, 2);
  assert.equal(coins(S, 'p0'), 0);
  assert.equal(E.curPlayer(S).id, 'p2');
});

t('DOUBLE LOSS: bluffed Warden, challenged — blocker loses the challenge, then the assassination lands', () => {
  const S = game(3, { p0: ['shade', 'duchess'], p1: ['corsair', 'envoy'] });
  E.P(S, 'p0').coins = 3;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  ok(E.respond(S, 'p1', 'block', 'warden')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  ok(E.respond(S, 'p0', 'challenge')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  lose(S, 'p1', 0);
  // the second loss is forced (one card left) and resolves by itself
  assert.equal(E.P(S, 'p1').alive, false); assert.equal(evs(S, 'lose').length, 2); assert.equal(S.phase, 'turn');
});

t('after a lost challenge the target can still block with a REAL Warden', () => {
  const S = game(3, { p0: ['shade', 'duchess'], p1: ['warden', 'envoy'] });
  E.P(S, 'p0').coins = 3;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  ok(E.respond(S, 'p1', 'challenge')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  lose(S, 'p1', 1);
  ok(E.respond(S, 'p1', 'block', 'warden')); E.closeWindow(S);
  assert.equal(S.win.kind, 'block'); ok(E.respond(S, 'p0', 'allow')); ok(E.respond(S, 'p2', 'allow')); E.closeWindow(S);
  assert.equal(E.P(S, 'p1').alive, true); assert.deepEqual(hand(S, 'p1'), ['warden', '(envoy)']);
});

t('Warden block challenged and proven: challenger loses, assassination fails', () => {
  const S = game(3, { p0: ['shade', 'duchess'], p1: ['warden', 'envoy'] });
  E.P(S, 'p0').coins = 3;
  ok(E.declare(S, 'p0', { type: 'assassinate', target: 'p1' }));
  ok(E.respond(S, 'p1', 'block', 'warden')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  ok(E.respond(S, 'p0', 'challenge')); E.respond(S, 'p2', 'allow'); E.closeWindow(S);
  lose(S, 'p0', 0);
  assert.deepEqual(hand(S, 'p1').filter((c) => c[0] === '('), []);
  assert.equal(E.curPlayer(S).id, 'p1');
});

t('steal: takes up to 2, blocked by Corsair or Envoy (Oracle instead of Envoy in that variant)', () => {
  let S = game(3, { p1: ['corsair', 'duchess'] });
  E.P(S, 'p1').coins = 1;
  ok(E.declare(S, 'p0', { type: 'steal', target: 'p1' })); pass(S);
  assert.equal(coins(S, 'p0'), 3); assert.equal(coins(S, 'p1'), 0);
  S = game(3, { p1: ['envoy', 'duchess'] }); // p1 has 2 coins
  ok(E.declare(S, 'p0', { type: 'steal', target: 'p1' }));
  assert.deepEqual(S.win.elig.p1.bl, ['corsair', 'envoy']); assert.deepEqual(S.win.elig.p2.bl, []);
  ok(E.respond(S, 'p1', 'block', 'envoy')); E.respond(S, 'p2', 'allow'); E.closeWindow(S); pass(S);
  assert.equal(coins(S, 'p0'), 2); assert.equal(coins(S, 'p1'), 2);
  S = game(3, { p1: ['oracle', 'duchess'] }, { oracle: true });
  ok(E.declare(S, 'p0', { type: 'steal', target: 'p1' }));
  assert.deepEqual(S.win.elig.p1.bl, ['corsair', 'oracle']);
  bad(E.declare(game(3), 'p0', { type: 'steal', target: 'p0' }));
  const S0 = game(3); E.P(S0, 'p1').coins = 0; bad(E.declare(S0, 'p0', { type: 'steal', target: 'p1' }));
});

t('exchange (2 cards): keeps the chosen cards, returns the rest, validates the pick', () => {
  const S = game(3, { p0: ['shade', 'duchess'] });
  S.deck.splice(S.deck.length - 2, 2, 'warden', 'corsair'); // top of deck
  ok(E.declare(S, 'p0', { type: 'exchange' })); pass(S);
  assert.equal(S.phase, 'xch');
  const pool = S.xch.pool; assert.deepEqual(pool, ['shade', 'duchess', 'corsair', 'warden']);
  bad(E.chooseExchange(S, 'p0', [0])); bad(E.chooseExchange(S, 'p0', [0, 0])); bad(E.chooseExchange(S, 'p1', [0, 1])); bad(E.chooseExchange(S, 'p0', [0, 9]));
  ok(E.chooseExchange(S, 'p0', [2, 3]));
  assert.deepEqual(hand(S, 'p0').sort(), ['corsair', 'warden']);
  assert.equal(total(S), 15); assert.equal(E.curPlayer(S).id, 'p1');
  const pe = E.publicEvent(evs(S, 'exchange')[0]);
  assert.equal(pe.drawn, undefined); assert.equal(pe.priv, undefined);
});

t('exchange with one influence left keeps one card', () => {
  const S = game(3, { p0: ['shade', 'duchess'] });
  E.P(S, 'p0').cards[1].dead = true;
  ok(E.declare(S, 'p0', { type: 'exchange' })); pass(S);
  assert.equal(S.xch.keep, 1); assert.equal(S.xch.pool.length, 3);
  ok(E.chooseExchange(S, 'p0', [1]));
  assert.equal(total(S), 15);
});

t('Oracle variant: swap one / examine (keep or force a swap), privacy of the shown card', () => {
  let S = game(3, { p0: ['oracle', 'duchess'], p1: ['shade', 'warden'] }, { oracle: true });
  ok(E.declare(S, 'p0', { type: 'swap' })); pass(S);
  assert.equal(S.xch.pool.length, 3); assert.equal(S.xch.keep, 2);
  ok(E.chooseExchange(S, 'p0', [0, 1])); assert.equal(total(S), 15);
  S = game(3, { p0: ['oracle', 'duchess'], p1: ['shade', 'warden'] }, { oracle: true });
  ok(E.declare(S, 'p0', { type: 'examine', target: 'p1' })); pass(S);
  assert.equal(S.phase, 'exm'); assert.equal(S.wait.who[0], 'p1');
  bad(E.chooseExamine(S, 'p0', 0)); ok(E.chooseExamine(S, 'p1', 1));
  const shown = evs(S, 'examine')[0]; assert.equal(shown.role, 'warden'); assert.equal(shown.priv, 'p0');
  assert.equal(E.publicEvent(shown).role, undefined);
  assert.equal(S.phase, 'exd');
  ok(E.chooseExamineVerdict(S, 'p0', true));
  assert.equal(total(S), 15); assert.equal(E.curPlayer(S).id, 'p1');
  S = game(3, { p0: ['oracle', 'duchess'], p1: ['shade', 'warden'] }, { oracle: true });
  ok(E.declare(S, 'p0', { type: 'examine', target: 'p1' })); pass(S); ok(E.chooseExamine(S, 'p1', 0)); ok(E.chooseExamineVerdict(S, 'p0', false));
  assert.deepEqual(hand(S, 'p1'), ['shade', 'warden']);
});

t('timeouts: silence allows; the safe defaults run', () => {
  let S = game(3);
  ok(E.declare(S, 'p0', { type: 'tax' })); E.timeoutStep(S);
  assert.equal(coins(S, 'p0'), 5);
  S = game(3, { p1: ['duchess', 'shade'] }); E.P(S, 'p0').coins = 7;
  ok(E.declare(S, 'p0', { type: 'coup', target: 'p1' })); E.timeoutStep(S);
  assert.equal(E.liveCardsOf?.(S, 'p1') ?? E.liveCards(E.P(S, 'p1')).length, 1);
  S = game(3); E.timeoutStep(S); assert.equal(coins(S, 'p0'), 3);
  S = game(3); E.P(S, 'p0').coins = 11; E.timeoutStep(S); assert.equal(S.phase, 'lose');
});

t('leaving: cards revealed, windows and choices unblock', () => {
  let S = game(3);
  ok(E.declare(S, 'p0', { type: 'tax' }));
  E.forfeit(S, 'p1'); assert.ok(!S.win.elig.p1); assert.equal(E.P(S, 'p1').alive, false);
  ok(E.respond(S, 'p2', 'allow')); E.closeWindow(S); assert.equal(coins(S, 'p0'), 5);
  assert.equal(E.curPlayer(S).id, 'p2');
  E.forfeit(S, 'p2'); assert.equal(S.phase, 'over'); assert.equal(S.winner, 'p0');
  S = game(3); E.forfeit(S, 'p0'); assert.equal(E.curPlayer(S).id, 'p1');
});

// ------------------------------------------------------------------ Reformation (teams)
t('teams: alternate allegiance, no targeting teammates, convert and embezzle', () => {
  let S = game(4, { p1: ['duchess', 'warden'], p2: ['shade', 'corsair'] }, { teams: true });
  assert.deepEqual(S.players.map((p) => p.team), [0, 1, 0, 1]);
  const lg = (id, type) => E.legalActions(S, id).find((a) => a.type === type);
  assert.deepEqual(lg('p0', 'assassinate').targets.sort(), ['p1', 'p3']);
  bad(E.declare(S, 'p0', { type: 'steal', target: 'p2' }));
  assert.deepEqual(lg('p0', 'convert').targets.sort(), ['p0', 'p1', 'p2', 'p3']);
  assert.equal(lg('p0', 'embezzle').ok, false);
  // convert another player: 2 coins to the reserve, the card flips
  ok(E.declare(S, 'p0', { type: 'convert', target: 'p1' }));
  assert.equal(coins(S, 'p0'), 0); assert.equal(S.reserve, 2); assert.equal(E.P(S, 'p1').team, 0);
  assert.equal(S.phase, 'turn');
  // embezzle (p1 holds a Duchess): a challenge catches them
  S.players[S.cur].coins = 2;
  E.P(S, 'p2').coins = 2;
  ok(E.declare(S, 'p1', { type: 'income' }));
  ok(E.declare(S, 'p2', { type: 'embezzle' }));
  ok(E.respond(S, 'p3', 'challenge')); E.respond(S, 'p0', 'allow'); E.respond(S, 'p1', 'allow'); E.closeWindow(S);
  assert.equal(evs(S, 'reveal')[0].proved, true, 'no Duchess: the claim is true');
  assert.equal(S.wait.who[0], 'p3'); lose(S, 'p3', 0);
  assert.equal(S.reserve, 0); assert.equal(coins(S, 'p2'), 4);
});

t('teams: embezzling while holding a Duchess loses an influence', () => {
  const S = game(4, { p0: ['duchess', 'shade'] }, { teams: true });
  E.P(S, 'p0').coins = 2; S.reserve = 3;
  ok(E.declare(S, 'p0', { type: 'embezzle' }));
  ok(E.respond(S, 'p1', 'challenge')); E.closeWindow(S);
  assert.equal(S.wait.who[0], 'p0'); lose(S, 'p0', 0);
  assert.equal(S.reserve, 3); assert.equal(coins(S, 'p0'), 2);
});

t('teams: win when every survivor shares an allegiance; foreign aid cannot be blocked by a teammate', () => {
  let S = game(4, { p1: ['duchess', 'warden'] }, { teams: true });
  ok(E.declare(S, 'p0', { type: 'aid' }));
  assert.deepEqual(Object.keys(S.win.elig).sort(), ['p1', 'p3'], 'teammate p2 may not block');
  S = game(4, { p1: ['duchess', 'warden'], p3: ['duchess', 'warden'] }, { teams: true });
  for (const id of ['p1', 'p3']) { E.P(S, id).cards[0].dead = true; }
  E.P(S, 'p0').coins = 7;
  ok(E.declare(S, 'p0', { type: 'coup', target: 'p1' }));
  assert.equal(S.phase, 'turn', 'one team still has a survivor');
  E.P(S, 'p1').team = 1; // it is p1's turn? advance to p3's elimination
  S = game(4, {}, { teams: true });
  for (const id of ['p1', 'p3']) E.P(S, id).cards.forEach((c, i) => { c.dead = i === 0; });
  E.P(S, 'p3').cards[1].dead = true; E.P(S, 'p3').alive = false; // p3 already out; p1 has one card
  E.P(S, 'p0').coins = 7;
  ok(E.declare(S, 'p0', { type: 'coup', target: 'p1' }));
  assert.equal(S.phase, 'over'); assert.deepEqual(S.winners.sort(), ['p0', 'p2']);
});

// ------------------------------------------------------------------ fuzz
t('fuzz: random legal play never throws, conserves cards, always finishes', () => {
  const rng = mk(99);
  const R = (n) => Math.floor(rng() * n);
  let games = 0, steps = 0;
  for (let g = 0; g < 600; g++) {
    const k = 2 + R(9), opts = { oracle: rng() < 0.4, teams: rng() < 0.3 };
    const S = E.newGame(IDS(k), opts, mk(g + 1));
    const want = E.copiesFor(k) * 5;
    let guard = 0;
    while (S.phase !== 'over' && guard++ < 3000) {
      steps++;
      const w = S.wait;
      if (S.phase === 'turn') {
        const who = w.who[0], lg = E.legalActions(S, who).filter((a) => a.ok);
        const a = lg[R(lg.length)];
        const r = E.declare(S, who, { type: a.type, target: a.targets ? a.targets[R(a.targets.length)] : undefined });
        assert.ok(r.ok, JSON.stringify([a, r]));
      } else if (S.phase === 'window') {
        for (const [id, e] of Object.entries(S.win.elig)) {
          const roll = rng(); let r = 'allow', role;
          if (e.ch && roll < 0.25) r = 'challenge'; else if (e.bl.length && roll < 0.5) { r = 'block'; role = e.bl[R(e.bl.length)]; }
          assert.ok(E.respond(S, id, r, role).ok);
        }
        E.closeWindow(S);
      } else if (S.phase === 'lose') {
        const p = E.P(S, w.who[0]), live = p.cards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
        assert.ok(E.chooseLose(S, p.id, live[R(live.length)]).ok);
      } else if (S.phase === 'xch') {
        const idx = S.xch.pool.map((_, i) => i).sort(() => rng() - 0.5).slice(0, S.xch.keep);
        assert.ok(E.chooseExchange(S, w.who[0], idx).ok);
      } else if (S.phase === 'exm') {
        const p = E.P(S, w.who[0]), live = p.cards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
        assert.ok(E.chooseExamine(S, p.id, live[R(live.length)]).ok);
      } else if (S.phase === 'exd') assert.ok(E.chooseExamineVerdict(S, w.who[0], rng() < 0.5).ok);
      else assert.fail('stuck in ' + S.phase);
      const inHands = S.players.reduce((a, p) => a + p.cards.length, 0);
      assert.equal(S.deck.length + inHands + (S.xch ? S.xch.pool.length - S.xch.keep : 0), want, 'cards conserved');
      for (const p of S.players) { assert.ok(p.coins >= 0); if (!p.alive) assert.equal(p.coins, 0); assert.equal(p.alive, E.liveCards(p).length > 0); }
      S.events.length = 0;
    }
    assert.equal(S.phase, 'over', 'game ' + g + ' finished'); games++;
    const al = E.alive(S); assert.ok(opts.teams ? al.every((p) => p.team === al[0].team) : al.length === 1);
  }
  console.log(`      ${games} random games, ${steps} steps`);
});

console.log(`\n${n} checks passed` + (process.exitCode ? ' (with failures)' : ''));
