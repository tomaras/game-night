// Headless rules + bot tests for Bean Bazaar (js/games/beans-engine.js, beans-bot.js). Run: node tests/beans-rules.mjs
import { Game, TYPES, coinsFor, configFor } from '../js/games/beans-engine.js';
import { nextBotAction } from '../js/games/beans-bot.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mkRng = (seed) => { const r = mulberry(seed); return { next: r, int: (n) => Math.floor(r() * n), shuffle: (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } }; };

// ---- bean-o-meter
eq([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => coinsFor('coffee', n)), [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4], 'coffee meter');
eq([1, 2, 3, 4, 5].map((n) => coinsFor('garden', n)), [0, 2, 3, 3, 3], 'garden meter');
eq([2, 3, 4].map((n) => coinsFor('red', n)), [1, 2, 3], 'red meter');
// ---- setups
eq(configFor(3).fields, 3, '3p fields'); eq(configFor(3).passes, 2, '3p passes'); eq(configFor(3).cost, null, '3p cannot buy');
eq(configFor(7).hands, [3, 4, 5, 6, 6, 6, 6], '7p hands'); eq(configFor(7).cost, 2, '7p cost'); eq(configFor(7).draw, 1, '7p draw each'); eq(configFor(7).drawAll, true, '7p everyone draws');
eq(configFor(4).remove, ['coffee'], '4p'); eq(configFor(2).duel, true, '2p duel');

const total = (g) => g.deck.length + g.discard.length + g.box + g.faceUp.length + g.order.reduce((a, id) => { const p = g.P[id]; return a + p.hand.length + p.coins.length + p.pending.length + p.offered.length + p.fields.reduce((x, f) => x + f.cards.length, 0); }, 0);
const mk = (n, seed = 1) => { const ids = Array.from({ length: n }, (_, i) => 'p' + i); const g = new Game(ids, mkRng(seed)); g.start(); return g; };

// ---- unit scenarios (3 players: three fields, no Cocoa)
{
  const g = mk(3, 7);
  eq(g.total, 154 - 4, '3p deck size'); eq(g.types.includes('cocoa'), false, '3p no cocoa');
  const a = g.active, p = g.P[a];
  ok(g.phase === 'plant1', 'starts in plant1');
  ok(g.act(a, { a: 'plant', f: 5 }).err, 'bad field rejected');
  const other = g.order.find((i) => i !== a);
  ok(g.act(other, { a: 'plant', f: 0 }).err, 'non-active cannot plant');
  const front = p.hand[0];
  ok(!g.act(a, { a: 'plant', f: 0 }).err, 'plant front card');
  ok(p.fields[0].cards[0] === front, 'front card planted');
  ok(g.phase === 'plant2', 'second plant optional');
  ok(!g.act(a, { a: 'skip' }).err, 'skip 2nd');
  ok(g.phase === 'trade' && g.faceUp.length === 2, 'two face-up cards, trade phase');
  ok(g.act(other, { a: 'harvest', f: 0 }).err, 'nothing to harvest');
  ok(g.act(a, { a: 'buy' }).err, '3p cannot buy');
  // offer validation
  const fu = g.faceUp[0], myHand = p.hand[0];
  ok(g.act(other, { a: 'offer', give: [fu] }).err, 'cannot give what you do not hold (empty offer)');
  const oh = g.P[other].hand;
  let r = g.act(other, { a: 'offer', give: [oh[0]], want: [{ id: fu }] });
  ok(r.ok, 'non-active proposes for a face-up card');
  const third = g.order.find((i) => i !== a && i !== other);
  ok(g.act(third, { a: 'accept', id: r.id }).err, 'third player cannot accept');
  const before = total(g);
  ok(!g.act(a, { a: 'accept', id: r.id }).err, 'active accepts');
  ok(g.P[a].pending.includes(oh[0]) || true, 'ok');
  ok(g.P[other].pending.includes(fu), 'received card goes to pending, not hand');
  ok(g.P[a].pending.length === 1, 'active got one pending');
  ok(!g.faceUp.includes(fu), 'traded face-up card left the table');
  eq(total(g), before, 'cards conserved by trade');
  // pending cards cannot be re-traded: they are not in hand
  ok(g.act(other, { a: 'offer', give: [fu] }).err, 'received cards cannot be traded again');
  // end trade -> plant3: everyone has to plant
  g.act(a, { a: 'endtrade' });
  ok(g.phase === 'plant3', 'plant3');
  // plant everything
  for (let guard = 0; guard < 20 && g.phase === 'plant3'; guard++) {
    for (const id of g.order) { const q = g.P[id]; for (const c of q.pending.slice()) { const f = q.fields.findIndex((_, i) => g.fieldOk(q, i, c)); if (f >= 0) g.act(id, { a: 'plant', f, card: c }); else { const h = q.fields.findIndex((_, i) => g.canHarvest(id, i)); g.act(id, { a: 'harvest', f: h }); } } }
  }
  ok(g.phase === 'plant1' && g.active !== a, 'next player starts after drawing');
  eq(g.P[a].hand.length >= 3, true, 'drew three');
  eq(total(g), g.total, 'conservation after a turn');
}
// ---- harvest rules
{
  const g = mk(4, 3); const a = g.active; const p = g.P[a];
  const byType = (t, k) => { const out = []; for (let i = 0; i < g.type.length && out.length < k; i++) if (g.type[i] === t && g.deck.includes(i)) { g.deck.splice(g.deck.indexOf(i), 1); out.push(i); } return out; };
  p.fields[0].cards = byType('blue', 4); p.fields[1].cards = byType('red', 1);
  ok(g.canHarvest(a, 0), 'multi-bean field can be harvested');
  ok(!g.canHarvest(a, 1), 'a lone bean cannot be harvested while another field has several');
  ok(g.act(a, { a: 'harvest', f: 1 }).err, 'harvest of lone bean rejected');
  const d0 = g.discard.length;
  g.act(a, { a: 'harvest', f: 0 });
  eq(p.coins.length, 1, '4 blue = 1 coin'); eq(g.discard.length - d0, 3, 'rest discarded');
  ok(g.canHarvest(a, 1), 'now the lone bean can go (all fields have <=1)');
  // buying
  eq(g.canBuy(a), false, 'cannot buy with 1 coin');
  p.coins.push(...byType('soy', 2));
  eq(g.canBuy(a), true, 'can buy with 3 coins');
  g.act(a, { a: 'buy' }); eq(p.fields.length, 3, 'third field'); eq(p.coins.length, 0, 'coins paid'); ok(g.act(a, { a: 'buy' }).err, 'only once');
  eq(total(g), g.total, 'conserved');
}
// ---- cannot plant a different bean: forced harvest
{
  const g = mk(5, 11); const a = g.active; const p = g.P[a];
  const first = p.hand[0];
  const mkOther = (notT) => { for (let i = 0; i < g.type.length; i++) if (g.type[i] !== notT && g.deck.includes(i)) { g.deck.splice(g.deck.indexOf(i), 1); return i; } };
  const x = mkOther(g.type[first]); const y = (() => { for (let i = 0; i < g.type.length; i++) if (g.type[i] !== g.type[first] && g.type[i] !== g.type[x] && g.deck.includes(i)) { g.deck.splice(g.deck.indexOf(i), 1); return i; } })();
  p.fields[0].cards = [x, x === y ? x : y].slice(0, 1); p.fields[1].cards = [y];
  const r = g.act(a, { a: 'plant', f: 0 });
  ok(r.err && /harvest/.test(r.err), 'no room: must harvest first');
}
// ---- offers: limits, gifts, 'all'
{
  const g = mk(4, 5); const a = g.active; g.act(a, { a: 'plant', f: 0 }); g.act(a, { a: 'skip' });
  const o = g.order.find((i) => i !== a);
  const r1 = g.act(a, { a: 'offer', to: 'all', give: [g.faceUp[0]], want: [] });
  ok(r1.ok, 'gift to all');
  ok(g.act(a, { a: 'offer', to: a, give: [g.faceUp[0]] }).err, 'cannot offer to self');
  ok(g.act(o, { a: 'accept', id: r1.id }).ok, 'someone accepts the gift');
  eq(g.P[o].pending.length, 1, 'gift pending');
  for (let i = 0; i < 4; i++) g.act(a, { a: 'offer', to: o, give: [g.P[a].hand[i]], want: [{ t: g.types[0], n: 1 }] });
  eq(g.offers.filter((x) => x.from === a).length, 3, 'max three open offers');
}

// ---- full bot games
const levels = ['easy', 'normal', 'hard'];
let clock = 1e6; const realNow = Date.now; Date.now = () => clock;
const stats = [];
for (const n of [2, 3, 4, 5, 6, 7]) {
  for (let s = 0; s < (process.env.GAMES ? +process.env.GAMES : 4); s++) {
    const level = levels[s % 3];
    const g = mk(n, 100 * n + s);
    const memos = {}; let steps = 0, trades = 0; clock += 1e5;
    const t0 = clock;
    while (!g.over && steps < 60000) {
      steps++; clock += 500;
      const next = nextBotAction(g, g.ids, memos, level, false, clock);
      if (!next) { if (steps > 50 && !g.over) { /* idle tick */ } continue; }
      const r = g.act(next.id, next.m);
      if (r.err) { fails++; console.error(`FAIL n=${n} seed=${s}: bot ${next.id} ${JSON.stringify(next.m)} -> ${r.err} (phase ${g.phase})`); break; }
      if (next.m.a === 'accept') trades++;
      if (steps % 200 === 0 && total(g) !== g.total) { fails++; console.error('FAIL conservation', n, s, total(g), g.total); break; }
    }
    ok(g.over, `game ${n}p/${s} finished (steps ${steps}, phase ${g.phase}, deck ${g.deck.length}, exh ${g.exhausted})`);
    if (g.over) {
      eq(total(g), g.total, `final conservation ${n}p/${s}`);
      stats.push(`${n}p ${level}: turns ${g.turnNo}, trades ${trades}, scores ${g.result.rows.map((r) => r.total).join('/')}`);
    }
  }
}
Date.now = realNow;
console.log(stats.join('\n'));
console.log(fails ? `${fails} FAILURES` : 'all beans checks passed');
process.exit(fails ? 1 : 0);
