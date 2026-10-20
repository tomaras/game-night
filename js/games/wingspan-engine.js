// Wingspan rules engine — pure JS, no DOM (runs in the browser host and in node tests).
// The whole game is one generator: it yields "beats" (publish + pause, for animation), prompts for a player's
// decision, and finishes at the end of round 4. The host holds the Game; clients only ever see view(pid).
import { BIRDS, BONUS, GOALS, GOAL_RANK, FOODS, HAB_KEY } from './wingspan-data.js';

export const EGG_COST = [0, 1, 1, 2, 2];
const ROW_BASE = [[1, 1, 2, 2, 3, 3], [2, 2, 3, 3, 4, 4], [1, 1, 2, 2, 3, 3]]; // food / eggs / cards by birds in the row
/** What the action in habitat `hab` gives when it holds `n` birds: n = base amount; trade = the optional extra (card→food, food→egg, egg→card). */
export const rowReward = (hab, n) => ({ n: ROW_BASE[hab][Math.min(n, 5)], trade: n % 2 === 1 });
export const DIE_FACES = ['i', 'u', 's', 'f', 'r', 'is'];
export const faceFoods = (f) => (f === 'is' ? ['i', 's'] : [f]);
export const AUTOMA = 'automa';
const nestOk = (n, t) => n === t || n === '*';
export const bird = (id) => BIRDS[id];
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
export const foodTotal = (f) => FOODS.reduce((a, t) => a + (f[t] || 0), 0);

export function mkRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n) => Math.floor(next() * n), pick: (x) => x[Math.floor(next() * x.length)], shuffle: (arr) => { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; } };
}

// ------------------------------------------------------------------ paying for birds
function cover(req, spend) {
  const R = {}; req.forEach((x) => { R[x] = (R[x] || 0) + 1; });
  const S = { ...spend };
  let need = 0;
  for (const t of FOODS) { const m = Math.min(R[t] || 0, S[t] || 0); S[t] = (S[t] || 0) - m; need += (R[t] || 0) - m; }
  return FOODS.reduce((a, t) => a + (S[t] || 0), 0) === need * 2 + (R.w || 0);
}
/** Does `spend` (food counts) exactly pay `cost`? Any 2 food tokens may stand in for 1 specific food. */
export function costCovered(cost, spend) {
  if (!cost.n.length) return foodTotal(spend) === 0;
  return (cost.or ? cost.n.map((x) => [x]) : [cost.n]).some((req) => cover(req, spend));
}
function payFor(food, req) {
  const S = { ...food }, pay = { i: 0, s: 0, f: 0, u: 0, r: 0 }, need = []; let wild = 0;
  for (const x of req) { if (x === 'w') wild++; else if (S[x] > 0) { S[x]--; pay[x]++; } else need.push(x); }
  const take = () => { let t = null; for (const f of FOODS) if (S[f] > 0 && (!t || S[f] > S[t])) t = f; return t; };
  for (let k = 0; k < wild; k++) { const t = take(); if (!t) return null; S[t]--; pay[t]++; }
  for (let k = 0; k < need.length * 2; k++) { const t = take(); if (!t) return null; S[t]--; pay[t]++; }
  return pay;
}
/** Cheapest way to pay for a bird's food cost from `food`, or null. */
export function autoPay(food, cost) {
  if (!cost.n.length) return { i: 0, s: 0, f: 0, u: 0, r: 0 };
  let best = null;
  for (const req of cost.or ? cost.n.map((x) => [x]) : [cost.n]) {
    const p = payFor(food, req);
    if (p && (!best || foodTotal(p) < foodTotal(best))) best = p;
  }
  return best;
}
/** Every distinct way to pay (used by bots and by the pay sheet) — small, since costs are ≤ 4 tokens. */
export function allPayments(food, cost) {
  const out = [], seen = new Set();
  const types = FOODS.filter((t) => food[t] > 0);
  const max = Math.min(foodTotal(food), cost.n.length * 2 + 1);
  const cur = { i: 0, s: 0, f: 0, u: 0, r: 0 };
  (function rec(k, left) {
    if (k === types.length) { if (costCovered(cost, cur)) { const key = FOODS.map((t) => cur[t]).join(','); if (!seen.has(key)) { seen.add(key); out.push({ ...cur }); } } return; }
    const t = types[k];
    for (let n = 0; n <= Math.min(food[t], left); n++) { cur[t] = n; rec(k + 1, left - n); }
    cur[t] = 0;
  })(0, max);
  return out;
}

// ------------------------------------------------------------------ counting for goals and bonus cards
export const entries = (P) => P.board.flatMap((row, h) => row.map((e, i) => ({ e, h, i, b: BIRDS[e.id] })));
export const eggsOnMat = (P) => P.board.reduce((a, row) => a + row.reduce((x, e) => x + e.eggs, 0), 0);
export function goalCount(k, board) {
  const eg = (row) => row.reduce((a, e) => a + e.eggs, 0);
  switch (k) {
    case 'bF': return board[0].length; case 'bG': return board[1].length; case 'bW': return board[2].length;
    case 'eF': return eg(board[0]); case 'eG': return eg(board[1]); case 'eW': return eg(board[2]);
    case 'tot': return board[0].length + board[1].length + board[2].length;
    case 'sets': return Math.min(eg(board[0]), eg(board[1]), eg(board[2]));
    default: {
      const t = k[1], all = board.flat();
      return k[0] === 'n' ? all.filter((e) => nestOk(BIRDS[e.id].nest, t) && e.eggs > 0).length : all.filter((e) => nestOk(BIRDS[e.id].nest, t)).reduce((a, e) => a + e.eggs, 0);
    }
  }
}
/** Does a bird (with its mat entry, when scoring a live mat) count for a bonus filter code? */
export function qualifies(f, b, e) {
  if (f.startsWith('nest:')) return nestOk(b.nest, f[5]);
  if (f.startsWith('tag:')) return !!b.tag[f.slice(4)];
  if (f.startsWith('diet:')) return b.diet.includes(f[5]);
  if (f === 'ws>=100') return b.ws >= 100;
  if (f === 'ws<=30') return b.ws <= 30;
  if (f === 'pts>=5') return b.pts >= 5;
  if (f === 'full') return !!e && b.eggs > 0 && e.eggs >= b.eggs;
  return false;
}
export const isStaticBonus = (id) => !['full', 'row'].includes(BONUS[id].f);
export function bonusCount(id, P) {
  const f = BONUS[id].f;
  if (f === 'row') return Math.max(...P.board.map((r) => r.length));
  return entries(P).filter(({ e, b }) => qualifies(f, b, e)).length;
}
export function bonusPoints(id, P) {
  const n = bonusCount(id, P), s = BONUS[id].s;
  if (s.per) return Math.min(n, s.per[1]) * s.per[0];
  let pts = 0;
  for (const [min, p] of s.t) if (n >= min) pts = p;
  return pts;
}

// ------------------------------------------------------------------ automa deck (solo)
// Each card: one string of actions per round. P play · D draw · L1..L3 lay eggs · F food · C1/C2 add goal cubes · C0 remove one
const AUTOMA_CARDS = [
  ['D L1 C1', 'P L1 C1', 'P L2 C2', 'D L2 C2'],
  ['P L1 C1', 'D L1 C1', 'P L2 C1', 'P L2 C2'],
  ['L2 C1 F', 'P L1 C1', 'D L2 C2', 'P L3 C2'],
  ['D C1', 'P L2 C1', 'P L1 C2', 'D L2 C2'],
  ['P L1 C1', 'L2 F C1', 'P L2 C2', 'D L3 C2'],
  ['D L1 F', 'P L1 C1', 'P C2', 'P L3 C1'],
  ['P C1', 'D L2 C1', 'L3 F C2', 'P L2 C2'],
  ['L1 D C1', 'P L2 C1', 'P L2 C1', 'D L2 C2'],
  ['P L2 C1', 'D L1 C1', 'L2 P C2', 'P L2 C2'],
  ['D L1 C1', 'L2 F C1', 'P L1 C2', 'P L3 C2'],
];

// ------------------------------------------------------------------ the game
const TILE_PAIRS = [['bF', 'eF'], ['bG', 'eG'], ['bW', 'eW'], ['nb', 'Eb'], ['nc', 'Ec'], ['ng', 'Eg'], ['np', 'Ep'], ['sets', 'tot']];

export class Game {
  /** o: { players:[{id,name,bot}], rng, goals:'green'|'blue'|'none', automa:'easy'|'normal'|'hard'|null } */
  constructor(o) {
    this.rng = o.rng || mkRng(o.seed || 1);
    this.names = {};
    this.bots = {};
    o.players.forEach((p) => { this.names[p.id] = p.name; this.bots[p.id] = !!p.bot; });
    this.humans = o.players.map((p) => p.id);
    const solo = this.humans.length === 1 && !!o.automa;
    if (solo) this.names[AUTOMA] = 'Automa';
    this.order = solo ? [this.humans[0], AUTOMA] : this.humans.slice();
    const goalMode = o.goals || 'green';
    this.s = {
      round: 0, first: 0, cur: null, turnNo: 0, phase: 'setup', goalMode, solo,
      players: {}, feeder: [], out: [], deck: [], disc: [], tray: [null, null, null], bonusDeck: [], goals: [], goalRes: [], log: [], over: null, automa: null,
    };
    this.evq = []; this.prompt = null; this.done = false; this._resume = undefined;
    this.trig = { play: [], lay: false, feed: null, draw: false, pred: false }; this.endDiscard = 0;
    this.gen = this.main(o);
  }

  // ---------------------------------------------------------------- plumbing
  P(pid) { return this.s.players[pid]; }
  name(pid) { return this.names[pid] || '?'; }
  ev(e) { this.evq.push(e); }
  say(text) { this.s.log.push(text); if (this.s.log.length > 400) this.s.log.shift(); this.ev({ k: 'log', text }); }
  isBot(pid) { return !!this.bots[pid]; }
  /** Run until the next beat / prompt / end. */
  step() {
    if (this.done) return { t: 'done', evs: [] };
    if (this.prompt) return { t: 'ask', evs: [] };
    const r = this.gen.next(this._resume);
    this._resume = undefined;
    const evs = this.evq; this.evq = [];
    if (r.done) { this.done = true; return { t: 'done', evs }; }
    const y = r.value;
    if (y.beat !== undefined) return { t: 'beat', ms: y.beat, evs };
    this.prompt = y; this.answers = {};
    return { t: 'ask', evs };
  }
  /** Give the prompted player's answer. Returns false if invalid, 'wait' if more players still owe an answer, true if accepted. */
  answer(pid, val) {
    const p = this.prompt;
    if (!p) return false;
    try {
      if (p.all) {
        if (!p.pids.includes(pid) || pid in this.answers || !p.check(pid, val)) return false;
        this.answers[pid] = val;
        if (Object.keys(this.answers).length < p.pids.length) return 'wait';
        this._resume = this.answers;
      } else {
        if (p.pid !== pid || !p.check(val)) return false;
        this._resume = val;
      }
    } catch { return false; }
    this.prompt = null;
    return true;
  }
  /** Is this player expected to answer the current prompt? */
  waitingFor(pid) {
    const p = this.prompt;
    return !!p && (p.all ? p.pids.includes(pid) && !(pid in this.answers) : p.pid === pid);
  }
  /** Headless driver: `decide(game, prompt, pid)` returns an answer. */
  run(decide, maxSteps = 200000) {
    for (let n = 0; n < maxSteps; n++) {
      const r = this.step();
      if (r.t === 'done') return true;
      if (r.t === 'ask') {
        const p = this.prompt;
        for (const pid of p.all ? p.pids : [p.pid]) {
          const ans = decide(this, p, pid);
          const ok = this.answer(pid, ans);
          if (!ok) throw new Error(`bad answer for ${p.kind} from ${pid}: ${JSON.stringify(ans)}`);
        }
      }
    }
    throw new Error('step limit');
  }
  *ask(pid, spec, check) { return yield { pid, ...spec, check }; }
  *askAll(pids, spec, check) { return yield { all: true, pids, ...spec, check }; }
  *beat(ms = 300) { yield { beat: ms }; }

  // ---------------------------------------------------------------- cards and dice
  rollDie() { return DIE_FACES[this.rng.int(6)]; }
  ensureDeck() {
    const s = this.s;
    if (!s.deck.length && s.disc.length) { s.deck = this.rng.shuffle(s.disc); s.disc = []; this.ev({ k: 'reshuffle' }); this.say('The bird deck was reshuffled.'); }
    return s.deck.length > 0;
  }
  topCard() { return this.ensureDeck() ? this.s.deck.pop() : null; }
  deckCount() { return this.s.deck.length + this.s.disc.length; }
  refillTray() {
    const s = this.s; let changed = false;
    for (let i = 0; i < 3; i++) if (s.tray[i] == null) { const c = this.topCard(); if (c != null) { s.tray[i] = c; changed = true; } }
    if (changed) this.ev({ k: 'tray' });
  }
  rerollFeeder(why) {
    const s = this.s;
    s.feeder = [...s.feeder, ...s.out].map(() => this.rollDie()); s.out = [];
    this.ev({ k: 'reroll', faces: s.feeder.slice(), why });
    if (why !== 'quiet') this.say(why === 'empty' ? 'The birdfeeder was empty: all dice were thrown back in.' : 'The birdfeeder was re-rolled.');
  }
  addFood(pid, t, n = 1) { const P = this.P(pid); P.food[t] = (P.food[t] || 0) + n; }

  // ---------------------------------------------------------------- setup
  *main(o) {
    const s = this.s, rng = this.rng;
    s.deck = rng.shuffle(BIRDS.map((b) => b.id));
    s.bonusDeck = rng.shuffle(BONUS.map((b) => b.id));
    s.first = this.humans.length > 1 ? rng.int(this.humans.length) : 0;
    for (const pid of this.humans) {
      s.players[pid] = { id: pid, hand: [], bonus: [], food: { i: 1, s: 1, f: 1, u: 1, r: 1 }, board: [[], [], []], pink: {}, goalPts: [0, 0, 0, 0], kept: false };
      for (let k = 0; k < 5; k++) s.players[pid].hand.push(s.deck.pop());
      for (let k = 0; k < 2; k++) s.players[pid].bonus.push(s.bonusDeck.pop());
    }
    if (s.solo) {
      let b = s.bonusDeck.pop(); while (!isStaticBonus(b)) b = s.bonusDeck.pop();
      const lvl = o.automa;
      s.automa = { level: lvl, bonus: b, up: [], down: 0, eggs: 0, tokens: 0, cubes: 0, deck: rng.shuffle(AUTOMA_CARDS.map((_, i) => i)), disc: [], last: null, goalPts: [0, 0, 0, 0], faceDown: { easy: 3, normal: 4, hard: 5 }[lvl] || 4 };
    }
    // goal tiles: 4 of 8 double-sided tiles, random side up
    const tiles = rng.shuffle(TILE_PAIRS).slice(0, 4);
    s.goals = tiles.map((t) => t[rng.int(2)]);
    for (let i = 0; i < 3; i++) s.tray[i] = s.deck.pop();
    s.feeder = Array.from({ length: 5 }, () => this.rollDie());
    this.ev({ k: 'setup' });
    this.say('Game on. Choose which birds, food and bonus card to keep.');
    // everyone chooses at once which birds/food/bonus to keep
    const ans = yield* this.askAll(this.humans, { kind: 'setup', priv: true }, (pid, v) => this.checkSetup(pid, v));
    for (const pid of this.humans) {
      const P = this.P(pid), v = ans[pid];
      const kept = P.hand.filter((c) => v.keep.includes(c));
      s.disc.push(...P.hand.filter((c) => !kept.includes(c)));
      P.hand = kept;
      for (const t of FOODS) P.food[t] = v.foods.includes(t) ? 1 : 0;
      s.bonusDeck.push(...P.bonus.filter((c) => c !== v.bonus));
      P.bonus = [v.bonus]; P.kept = true;
    }
    yield* this.beat(500);
    for (let r = 1; r <= 4; r++) yield* this.playRound(r);
    this.finish();
    yield* this.beat(200);
  }
  checkSetup(pid, v) {
    const P = this.P(pid);
    if (!v || !Array.isArray(v.keep) || typeof v.foods !== 'string') return false;
    if (new Set(v.keep).size !== v.keep.length || !v.keep.every((c) => P.hand.includes(c))) return false;
    if (new Set(v.foods).size !== v.foods.length || ![...v.foods].every((t) => FOODS.includes(t))) return false;
    return v.keep.length + v.foods.length === 5 && P.bonus.includes(v.bonus);
  }

  // ---------------------------------------------------------------- rounds
  turnsIn(r) { return this.s.goalMode === 'none' ? 8 : 9 - r; }
  *playRound(r) {
    const s = this.s;
    s.round = r; s.phase = 'play';
    this.ev({ k: 'round', n: r });
    this.say(`Round ${r} begins. ${this.turnsIn(r)} turns each.`);
    if (s.automa) s.automa.cubes = 0;
    yield* this.beat(600);
    const n = this.turnsIn(r);
    for (let t = 0; t < n; t++) {
      for (let k = 0; k < this.order.length; k++) {
        const pid = this.order[(s.first + k) % this.order.length];
        s.cur = pid; s.turnNo++;
        yield* this.turn(pid, n - t);
      }
    }
    yield* this.endRound(r);
  }
  roundOrderFrom(pid) { const i = this.order.indexOf(pid); return this.order.map((_, k) => this.order[(i + k) % this.order.length]); }

  *endRound(r) {
    const s = this.s;
    s.cur = null;
    this.ev({ k: 'roundEnd', n: r });
    const res = {};
    if (s.goalMode !== 'none') {
      const key = s.goals[r - 1];
      const counts = {};
      for (const pid of this.humans) counts[pid] = goalCount(key, this.P(pid).board);
      if (s.automa) counts[AUTOMA] = s.automa.cubes;
      const ids = Object.keys(counts);
      const pts = {}, place = {};
      if (s.goalMode === 'blue') for (const id of ids) { pts[id] = Math.min(counts[id], 5); place[id] = null; }
      else {
        const sorted = ids.slice().sort((a, b) => counts[b] - counts[a]);
        let p = 0;
        while (p < sorted.length) {
          let q = p; while (q < sorted.length && counts[sorted[q]] === counts[sorted[p]]) q++;
          let total = 0; for (let k = p; k < q; k++) total += GOAL_RANK[r - 1][k] || 0;
          const each = Math.floor(total / (q - p));
          for (let k = p; k < q; k++) { const id = sorted[k]; pts[id] = counts[id] >= 1 ? each : 0; place[id] = p + 1; }
          p = q;
        }
      }
      for (const id of ids) {
        res[id] = { count: counts[id], pts: pts[id], place: place[id] };
        if (id === AUTOMA) s.automa.goalPts[r - 1] = pts[id]; else this.P(id).goalPts[r - 1] = pts[id];
      }
      s.goalRes[r - 1] = res;
      this.say(`Round ${r} goal scored: ` + ids.map((id) => `${this.name(id)} ${counts[id]} (+${pts[id]})`).join(', ') + '.');
    }
    this.ev({ k: 'goal', n: r, res });
    yield* this.beat(1800);
    // new tray, first player token moves on
    for (let i = 0; i < 3; i++) if (s.tray[i] != null) { s.disc.push(s.tray[i]); s.tray[i] = null; }
    this.refillTray();
    if (this.humans.length > 1) s.first = (s.first + 1) % this.order.length;
    for (const pid of this.humans) this.P(pid).pink = {};
    if (r < 4) yield* this.beat(500);
  }

  // ---------------------------------------------------------------- one turn
  *turn(pid, left) {
    if (pid === AUTOMA) { yield* this.automaTurn(left); return; }
    const P = this.P(pid);
    P.pink = {};
    this.trig = { play: [], lay: false, feed: null, draw: false, pred: false }; this.endDiscard = 0;
    this.ev({ k: 'turn', pid, left });
    yield* this.beat(250);
    const act = yield* this.ask(pid, { kind: 'turn', left }, (a) => this.checkTurn(pid, a));
    yield* this.doAction(pid, act);
    if (this.endDiscard > 0 && P.hand.length) {
      const c = yield* this.ask(pid, { kind: 'handcard', purpose: 'endDiscard', text: 'Discard 1 card from your hand' }, (v) => P.hand.includes(v));
      this.discardCard(pid, c);
    }
    this.refillTray();
    yield* this.pinks(pid);
    if (!this.s.feeder.length) this.rerollFeeder('empty');
    yield* this.beat(200);
  }
  checkTurn(pid, a) {
    if (!a) return false;
    if (a.a === 'food' || a.a === 'eggs' || a.a === 'cards') return true;
    return a.a === 'play' && this.checkPlay(pid, a, null);
  }
  /** Validate a "play a bird" payload: { card, hab, food:{i:n…}, eggs:[[h,i]…] } */
  checkPlay(pid, a, forceHab) {
    const P = this.P(pid);
    if (!P.hand.includes(a.card)) return false;
    const b = BIRDS[a.card];
    if (!b.hab.includes(a.hab) || (forceHab != null && a.hab !== forceHab)) return false;
    const row = P.board[a.hab];
    if (row.length >= 5) return false;
    const eggCost = EGG_COST[row.length];
    const eggs = a.eggs || [];
    if (eggs.length !== eggCost) return false;
    const use = {};
    for (const [h, i] of eggs) { const e = P.board[h]?.[i]; if (!e) return false; const k = h * 10 + i; use[k] = (use[k] || 0) + 1; if (use[k] > e.eggs) return false; }
    const food = a.food || {};
    for (const t of FOODS) if (!(food[t] >= 0) || food[t] > (P.food[t] || 0) || !Number.isInteger(food[t] || 0)) return false;
    return costCovered(b.cost, food);
  }
  /** Which birds could this player play right now? [{card, hab, pay, eggs}] with a default payment. */
  legalPlays(pid, forceHab = null) {
    const P = this.P(pid), out = [];
    const eggPlaces = P.board.flatMap((row, h) => row.flatMap((e, i) => Array(e.eggs).fill([h, i])));
    for (const card of P.hand) {
      const b = BIRDS[card];
      for (const hab of b.hab) {
        if (forceHab != null && hab !== forceHab) continue;
        const row = P.board[hab];
        if (row.length >= 5 || eggPlaces.length < EGG_COST[row.length]) continue;
        const pay = autoPay(P.food, b.cost);
        if (pay) out.push({ card, hab, food: pay, eggs: eggPlaces.slice(0, EGG_COST[row.length]) });
      }
    }
    return out;
  }
  discardCard(pid, c) {
    const P = this.P(pid);
    P.hand.splice(P.hand.indexOf(c), 1); this.s.disc.push(c);
    this.ev({ k: 'discard', pid, id: c });
  }

  *doAction(pid, a) {
    const P = this.P(pid);
    if (a.a === 'play') { yield* this.doPlay(pid, a); return; }
    const hab = { food: 0, eggs: 1, cards: 2 }[a.a];
    const n = P.board[hab].length, rw = rowReward(hab, n);
    this.ev({ k: 'act', pid, act: a.a, hab, n: rw.n, trade: rw.trade });
    this.say(`${this.name(pid)} takes the ${['gain food', 'lay eggs', 'draw cards'][hab]} action.`);
    yield* this.beat(450);
    if (a.a === 'food') {
      const got = [];
      this.trig.feed = got;
      for (let k = 0; k < rw.n; k++) { const f = yield* this.takeFeeder(pid, {}); if (f) got.push(f); }
      if (rw.trade && P.hand.length && this.s.feeder.length) {
        const c = yield* this.ask(pid, { kind: 'handcard', purpose: 'tradeFood', skip: true, text: 'Discard a card to gain 1 more food?' }, (v) => v === null || P.hand.includes(v));
        if (c !== null) { this.discardCard(pid, c); const f = yield* this.takeFeeder(pid, {}); if (f) got.push(f); }
      }
    } else if (a.a === 'eggs') {
      this.trig.lay = true;
      yield* this.layEggs(pid, rw.n, {});
      if (rw.trade && foodTotal(P.food) > 0 && P.board.flat().some((e) => e.eggs < BIRDS[e.id].eggs)) {
        const t = yield* this.ask(pid, { kind: 'payfood', purpose: 'tradeEgg', skip: true, text: 'Pay 1 food to lay 1 more egg?' }, (v) => v === null || (FOODS.includes(v) && P.food[v] > 0));
        if (t !== null) { P.food[t]--; this.ev({ k: 'spend', pid, food: { [t]: 1 } }); yield* this.layEggs(pid, 1, {}); }
      }
    } else {
      this.trig.draw = true;
      yield* this.drawCards(pid, rw.n);
      if (rw.trade && eggsOnMat(P) > 0) {
        const t = yield* this.ask(pid, { kind: 'eggfrom', purpose: 'tradeCard', skip: true, text: 'Discard an egg to draw 1 more card?' }, (v) => v === null || this.hasEgg(pid, v));
        if (t !== null) { this.removeEgg(pid, t); yield* this.drawCards(pid, 1); }
      }
    }
    yield* this.activateRow(pid, hab);
  }
  hasEgg(pid, v) { const e = this.P(pid).board[v?.[0]]?.[v?.[1]]; return !!e && e.eggs > 0; }
  removeEgg(pid, [h, i]) { const e = this.P(pid).board[h][i]; e.eggs--; this.ev({ k: 'eggx', pid, hab: h, idx: i }); }

  *doPlay(pid, a) {
    const P = this.P(pid), b = BIRDS[a.card];
    const row = P.board[a.hab];
    const spend = {}; for (const t of FOODS) if (a.food?.[t]) spend[t] = a.food[t];
    for (const t in spend) P.food[t] -= spend[t];
    for (const [h, i] of a.eggs || []) this.removeEgg(pid, [h, i]);
    P.hand.splice(P.hand.indexOf(a.card), 1);
    const entry = { id: a.card, eggs: 0, cache: 0, tuck: 0 };
    row.push(entry);
    const idx = row.length - 1;
    this.ev({ k: 'act', pid, act: 'play', hab: a.hab });
    this.ev({ k: 'play', pid, hab: a.hab, idx, id: a.card, spend, eggs: (a.eggs || []).length });
    this.say(`${this.name(pid)} plays ${b.name} in their ${['forest', 'grassland', 'wetland'][a.hab]}.`);
    this.trig.play.push({ hab: a.hab, nest: b.nest });
    yield* this.beat(800);
    if (b.pw?.c === 'w') {
      this.ev({ k: 'power', pid, hab: a.hab, idx, name: b.name });
      yield* this.beat(500);
      yield* this.runEffect(pid, b.pw.e, { hab: a.hab, idx, entry, b });
    }
  }

  // ---------------------------------------------------------------- feeder, eggs, cards
  /** Take one die from the feeder. filter = foods allowed (string), cache = put the food on ctx.entry instead. Returns the food letter or null. */
  *takeFeeder(pid, { filter = null, cache = null } = {}) {
    const s = this.s;
    if (!s.feeder.length) this.rerollFeeder('empty');
    const same = s.feeder.length > 0 && s.feeder.every((f) => f === s.feeder[0]);
    if (same && !filter) {
      const yes = yield* this.ask(pid, { kind: 'reroll', text: 'All the dice match. Re-roll the birdfeeder?', faces: s.feeder.slice() }, (v) => typeof v === 'boolean');
      if (yes) this.rerollFeeder('player');
      if (yes) yield* this.beat(600);
    }
    const ok = (f) => !filter || faceFoods(f).some((t) => filter.includes(t));
    const opts = s.feeder.map((f, i) => (ok(f) ? i : -1)).filter((i) => i >= 0);
    if (!opts.length) { this.say(`There is no ${filter ? [...filter].map((t) => ({ i: 'invertebrate', s: 'seed', f: 'fish', u: 'fruit', r: 'rodent' }[t])).join('/') : 'food'} in the feeder.`); return null; }
    const faces = new Set(opts.map((i) => s.feeder[i]));
    let die, food;
    if (faces.size === 1 && !faces.has('is')) { die = opts[0]; food = s.feeder[die]; if (filter && !filter.includes(food)) return null; }
    else {
      const v = yield* this.ask(pid, { kind: 'dice', opts, filter, text: 'Take a die from the birdfeeder' }, (r) => r && opts.includes(r.die) && faceFoods(s.feeder[r.die]).includes(r.food) && (!filter || filter.includes(r.food)));
      die = v.die; food = v.food;
    }
    const face = s.feeder[die];
    s.feeder.splice(die, 1); s.out.push(face);
    if (cache) { cache.cache++; this.ev({ k: 'cache', pid, hab: cache.hab, idx: cache.idx, t: food, n: 1, from: 'feeder', face }); } else { this.addFood(pid, food); this.ev({ k: 'gain', pid, t: food, n: 1, src: 'feeder', face }); }
    this.say(`${this.name(pid)} ${cache ? 'caches' : 'takes'} ${({ i: 'an invertebrate', s: 'a seed', f: 'a fish', u: 'a fruit', r: 'a rodent' })[food]}.`);
    yield* this.beat(380);
    if (!s.feeder.length) { this.rerollFeeder('empty'); yield* this.beat(500); }
    return food;
  }
  *gainSupply(pid, letters, n, cacheEntry) {
    const opts = letters === 'x' || letters === 'w' ? FOODS : [...letters];
    for (let k = 0; k < n; k++) {
      const t = opts.length === 1 ? opts[0] : yield* this.ask(pid, { kind: 'food', opts, text: cacheEntry ? 'Choose the food to cache' : 'Choose a food to gain' }, (v) => opts.includes(v));
      if (cacheEntry) { cacheEntry.cache++; this.ev({ k: 'cache', pid, hab: cacheEntry.hab, idx: cacheEntry.idx, t, n: 1, from: 'supply' }); } else { this.addFood(pid, t); this.ev({ k: 'gain', pid, t, n: 1, src: 'supply' }); }
      yield* this.beat(300);
    }
  }
  layCands(pid, f, only) {
    const P = this.P(pid), out = [];
    P.board.forEach((row, h) => row.forEach((e, i) => {
      const b = BIRDS[e.id];
      if (e.eggs >= b.eggs) return;
      if (only && only !== e) return;
      if (f && f !== '*') { if (/[A-Z]/.test(f)) { if (HAB_KEY.indexOf(f) !== h) return; } else if (!nestOk(b.nest, f)) return; }
      out.push([h, i]);
    }));
    return out;
  }
  *layEggs(pid, n, { f = null, only = null } = {}) {
    let laid = 0;
    for (let k = 0; k < n; k++) {
      const cands = this.layCands(pid, f, only);
      if (!cands.length) break;
      const [h, i] = cands.length === 1 ? cands[0] : yield* this.ask(pid, { kind: 'egg', cands, text: n > 1 ? `Lay an egg (${k + 1} of ${n})` : 'Lay an egg on a bird' }, (v) => Array.isArray(v) && cands.some((c) => c[0] === v[0] && c[1] === v[1]));
      this.P(pid).board[h][i].eggs++;
      this.ev({ k: 'egg', pid, hab: h, idx: i });
      laid++;
      yield* this.beat(300);
    }
    if (laid) this.say(`${this.name(pid)} lays ${laid} egg${laid > 1 ? 's' : ''}.`);
    return laid;
  }
  *drawCards(pid, n) {
    const s = this.s, P = this.P(pid); let got = 0;
    for (let k = 0; k < n; k++) {
      const trayIdx = s.tray.map((c, i) => (c == null ? -1 : i)).filter((i) => i >= 0);
      const deckOk = s.deck.length + s.disc.length > 0;
      if (!deckOk && !trayIdx.length) break;
      let src;
      if (!trayIdx.length) src = 'd';
      else src = yield* this.ask(pid, { kind: 'draw', left: n - k, deckOk, text: n > 1 ? `Draw a card (${k + 1} of ${n})` : 'Draw a card' }, (v) => (v === 'd' && deckOk) || (Number.isInteger(v) && s.tray[v] != null));
      let card, slot = null;
      if (src === 'd') card = this.topCard(); else { slot = src; card = s.tray[slot]; s.tray[slot] = null; }
      if (card == null) break;
      P.hand.push(card); got++;
      this.ev({ k: 'draw', pid, src: src === 'd' ? 'deck' : 'tray', slot, id: card });
      yield* this.beat(300);
    }
    if (got) this.say(`${this.name(pid)} draws ${got} card${got > 1 ? 's' : ''}.`);
    return got;
  }

  // ---------------------------------------------------------------- powers
  *activateRow(pid, hab) {
    const P = this.P(pid), row = P.board[hab];
    for (let i = row.length - 1; i >= 0; i--) {
      const e = row[i], b = BIRDS[e.id];
      this.ev({ k: 'cube', pid, hab, idx: i });
      if (b.pw?.c !== 'b') { yield* this.beat(140); continue; }
      this.ev({ k: 'power', pid, hab, idx: i, name: b.name });
      yield* this.beat(550);
      yield* this.runEffect(pid, b.pw.e, { hab, idx: i, entry: e, b });
    }
    this.ev({ k: 'cube', pid, hab, idx: -1 });
  }
  trigPred() { this.trig.pred = true; }
  /** The activation order for "every player" powers: starting with the owner. */
  *runEffect(pid, e, ctx) {
    const s = this.s, P = this.P(pid);
    const [k, a, b, c] = e;
    ctx.entry && (ctx.entry.hab = ctx.hab, ctx.entry.idx = ctx.idx);
    const optional = (text) => this.ask(pid, { kind: 'use', text }, (v) => typeof v === 'boolean');
    switch (k) {
      case 'gain': yield* this.gainSupply(pid, a, b); break;
      case 'feed': for (let n = 0; n < a; n++) yield* this.takeFeeder(pid, { filter: b || null }); break;
      case 'draw': yield* this.drawCards(pid, a); break;
      case 'layThis': yield* this.layEggs(pid, a, { only: ctx.entry }); break;
      case 'layAny': yield* this.layEggs(pid, a, { f: b }); break;
      case 'layEach': {
        let n = 0;
        P.board.forEach((row, h) => row.forEach((x) => { const bb = BIRDS[x.id]; if (x.eggs >= bb.eggs) return; if (a === 'row' ? h !== ctx.hab : !nestOk(bb.nest, a)) return; x.eggs++; n++; this.ev({ k: 'egg', pid, hab: h, idx: row.indexOf(x) }); }));
        if (n) { this.say(`${this.name(pid)} lays ${n} egg${n > 1 ? 's' : ''}.`); yield* this.beat(500); }
        break;
      }
      case 'cacheThis': yield* this.gainSupply(pid, a, b, ctx.entry); break;
      case 'tuckHand': {
        let tucked = 0;
        for (let n = 0; n < a && P.hand.length; n++) {
          const card = yield* this.ask(pid, { kind: 'handcard', purpose: 'tuck', skip: true, text: 'Tuck a card behind the bird?' }, (v) => v === null || P.hand.includes(v));
          if (card === null) break;
          P.hand.splice(P.hand.indexOf(card), 1); ctx.entry.tuck++; tucked++;
          this.ev({ k: 'tuck', pid, hab: ctx.hab, idx: ctx.idx, src: 'hand' });
          yield* this.beat(350);
        }
        if (tucked && b) yield* this.drawCards(pid, tucked * b);
        break;
      }
      case 'tuckDeck': for (let n = 0; n < a; n++) { const card = this.topCard(); if (card == null) break; ctx.entry.tuck++; this.ev({ k: 'tuck', pid, hab: ctx.hab, idx: ctx.idx, src: 'deck' }); yield* this.beat(350); } break;
      case 'eachFeed': {
        if (this.humans.length > 1 && !(yield* optional('Everyone takes a die from the feeder, starting with you. Use it?'))) break;
        for (const q of this.roundOrderFrom(pid)) { if (q === AUTOMA) this.automaToken(1); else yield* this.takeFeeder(q, {}); }
        break;
      }
      case 'eachDraw': {
        if (this.humans.length > 1 && !(yield* optional(`Everyone draws ${a} from the deck, starting with you. Use it?`))) break;
        for (const q of this.roundOrderFrom(pid)) {
          if (q === AUTOMA) { this.automaToken(1); continue; }
          for (let n = 0; n < a; n++) { const card = this.topCard(); if (card == null) break; this.P(q).hand.push(card); this.ev({ k: 'draw', pid: q, src: 'deck', slot: null, id: card }); }
          yield* this.beat(300);
        }
        break;
      }
      case 'eachLay': {
        for (const q of this.roundOrderFrom(pid)) { if (q === AUTOMA) this.automaToken(1); else yield* this.layEggs(q, 1, { f: a }); }
        yield* this.layEggs(pid, 1, { f: a });
        break;
      }
      case 'resetFeeder': this.rerollFeeder('player'); yield* this.beat(600); for (let n = 0; n < a; n++) yield* this.takeFeeder(pid, {}); break;
      case 'roll': {
        if (!s.out.length) { this.say('No dice outside the birdfeeder to roll.'); break; }
        s.out = s.out.map(() => this.rollDie());
        const hit = s.out.some((f) => faceFoods(f).includes(a));
        this.ev({ k: 'roll', pid, faces: s.out.slice(), hit, hab: ctx.hab, idx: ctx.idx });
        yield* this.beat(900);
        if (hit) { ctx.entry.cache++; this.trigPred(); this.ev({ k: 'cache', pid, hab: ctx.hab, idx: ctx.idx, t: a, n: 1, from: 'hunt' }); this.say(`${this.name(pid)}'s ${ctx.b.name} catches ${({ i: 'an invertebrate', s: 'a seed', f: 'a fish', u: 'a fruit', r: 'a rodent' })[a]}.`); yield* this.beat(500); } else this.say(`${ctx.b.name} hunts without luck.`);
        break;
      }
      case 'hunt': {
        const card = this.topCard();
        if (card == null) break;
        const ok = BIRDS[card].ws < a;
        this.ev({ k: 'hunt', pid, hab: ctx.hab, idx: ctx.idx, id: card, hit: ok });
        yield* this.beat(1100);
        if (ok) { ctx.entry.tuck++; this.trigPred(); this.ev({ k: 'tuck', pid, hab: ctx.hab, idx: ctx.idx, src: 'hunt' }); this.say(`${ctx.b.name} catches a ${BIRDS[card].name}!`); } else { s.disc.push(card); this.say(`${ctx.b.name} lets the ${BIRDS[card].name} go.`); }
        yield* this.beat(400);
        break;
      }
      case 'tradeCF': {
        if (!P.hand.length) break;
        const card = yield* this.ask(pid, { kind: 'handcard', purpose: 'trade', skip: true, text: 'Discard a card to gain a food?' }, (v) => v === null || P.hand.includes(v));
        if (card === null) break;
        this.discardCard(pid, card); yield* this.gainSupply(pid, a, 1);
        break;
      }
      case 'tradeEF': {
        if (!eggsOnMat(P)) break;
        const t = yield* this.ask(pid, { kind: 'eggfrom', purpose: 'tradeFood', skip: true, text: 'Discard an egg to gain food?' }, (v) => v === null || this.hasEgg(pid, v));
        if (t === null) break;
        this.removeEgg(pid, t); yield* this.gainSupply(pid, a, b);
        break;
      }
      case 'tradeFE': {
        if (!(P.food[a] > 0) || !P.board.flat().some((x) => x.eggs < BIRDS[x.id].eggs)) break;
        if (!(yield* optional(`Discard 1 ${({ i: 'invertebrate', s: 'seed', f: 'fish', u: 'fruit', r: 'rodent' })[a]} to lay ${b} eggs?`))) break;
        P.food[a]--; this.ev({ k: 'spend', pid, food: { [a]: 1 } });
        yield* this.layEggs(pid, b, {});
        break;
      }
      case 'tradeFCache': {
        if (!(P.food[a] > 0)) break;
        if (!(yield* optional(`Discard 1 ${({ i: 'invertebrate', s: 'seed', f: 'fish', u: 'fruit', r: 'rodent' })[a]} to cache ${b} on this bird?`))) break;
        P.food[a]--; this.ev({ k: 'spend', pid, food: { [a]: 1 } });
        for (let n = 0; n < b; n++) { ctx.entry.cache++; this.ev({ k: 'cache', pid, hab: ctx.hab, idx: ctx.idx, t: a, n: 1, from: 'supply' }); }
        yield* this.beat(400);
        break;
      }
      case 'feedCache': yield* this.takeFeeder(pid, { filter: a, cache: ctx.entry }); break;
      case 'drawDiscard': { const n = yield* this.drawCards(pid, a); if (n) this.endDiscard++; break; }
      case 'bonus': {
        const cards = [s.bonusDeck.pop(), s.bonusDeck.pop()].filter((x) => x != null);
        if (!cards.length) break;
        const keep = yield* this.ask(pid, { kind: 'bonus', cards, priv: true, text: 'Keep one bonus card' }, (v) => cards.includes(v));
        P.bonus.push(keep);
        s.bonusDeck.unshift(...cards.filter((x) => x !== keep));
        this.ev({ k: 'bonus', pid });
        this.say(`${this.name(pid)} takes a bonus card.`);
        yield* this.beat(400);
        break;
      }
      case 'playSecond': {
        const hab = HAB_KEY.indexOf(a);
        if (!this.legalPlays(pid, hab).length) { this.say('No second bird could be played.'); break; }
        const act = yield* this.ask(pid, { kind: 'play2', hab, text: `Play a second bird in your ${['forest', 'grassland', 'wetland'][hab]}` }, (v) => v === null || (v.a === 'play' && this.checkPlay(pid, v, hab)));
        if (act) yield* this.doPlay(pid, act);
        break;
      }
      case 'fewest': {
        const hab = HAB_KEY.indexOf(a);
        const pids = this.humans;
        const least = Math.min(...pids.map((q) => this.P(q).board[hab].length));
        for (const q of this.roundOrderFrom(pid)) {
          if (q === AUTOMA) { this.automaToken(1); continue; }
          if (this.P(q).board[hab].length !== least) continue;
          if (b === 'draw') yield* this.drawCards(q, c); else yield* this.gainSupply(q, 'x', c);
        }
        break;
      }
      case 'repeat': {
        const cands = P.board[ctx.hab].map((x, i) => [x, i]).filter(([x, i]) => i !== ctx.idx && BIRDS[x.id].pw?.c === 'b' && BIRDS[x.id].pw.e[0] !== 'repeat');
        if (!cands.length) break;
        const pick = cands.length === 1 ? cands[0][1] : yield* this.ask(pid, { kind: 'pickbird', hab: ctx.hab, cands: cands.map((x) => [ctx.hab, x[1]]), text: 'Repeat which bird’s power?' }, (v) => Array.isArray(v) && v[0] === ctx.hab && cands.some((x) => x[1] === v[1]));
        const idx = Array.isArray(pick) ? pick[1] : pick, x = P.board[ctx.hab][idx], bb = BIRDS[x.id];
        this.ev({ k: 'power', pid, hab: ctx.hab, idx, name: bb.name });
        yield* this.beat(500);
        yield* this.runEffect(pid, bb.pw.e, { hab: ctx.hab, idx, entry: x, b: bb });
        break;
      }
      default: throw new Error('unknown power ' + k);
    }
  }

  // pink powers: after a turn, everyone else's matching birds fire once between their own turns
  pinkTriggered(pw) {
    const t = this.trig;
    switch (pw.tr) {
      case 'play': return t.play.some((p) => pw.ta === '*' || (/[A-Z]/.test(pw.ta) ? HAB_KEY[p.hab] === pw.ta : nestOk(p.nest, pw.ta)));
      case 'lay': return t.lay;
      case 'draw': return t.draw;
      case 'feed': return !!t.feed && t.feed.length > 0 && (!pw.ta || pw.ta === '*' || t.feed.includes(pw.ta));
      case 'pred': return t.pred;
      default: return false;
    }
  }
  *pinks(active) {
    for (const q of this.roundOrderFrom(active).slice(1)) {
      if (q === AUTOMA) continue;
      const P = this.P(q);
      for (let h = 0; h < 3; h++) for (let i = 0; i < P.board[h].length; i++) {
        const e = P.board[h][i], b = BIRDS[e.id], pw = b.pw;
        if (!pw || pw.c !== 'p' || P.pink[e.id] || !this.pinkTriggered(pw)) continue;
        P.pink[e.id] = true;
        this.ev({ k: 'power', pid: q, hab: h, idx: i, name: b.name, pink: true });
        yield* this.beat(550);
        yield* this.runEffect(q, pw.e, { hab: h, idx: i, entry: e, b });
      }
    }
    this.refillTray();
  }

  // ---------------------------------------------------------------- the automa (solo opponent)
  automaToken(n) { if (this.s.automa) { this.s.automa.tokens += n; this.ev({ k: 'automaGain', n }); } }
  *automaTurn(left) {
    const s = this.s, A = s.automa;
    this.trig = { play: [], lay: false, feed: null, draw: false, pred: false };
    if (!A.deck.length) { A.deck = this.rng.shuffle(A.disc); A.disc = []; }
    const ci = A.deck.pop(); A.disc.push(ci); A.last = ci;
    const acts = AUTOMA_CARDS[ci][s.round - 1].split(' ');
    this.ev({ k: 'turn', pid: AUTOMA, left });
    this.ev({ k: 'automa', card: ci, acts });
    yield* this.beat(700);
    for (const act of acts) { yield* this.automaAct(act); yield* this.beat(650); }
    this.refillTray();
    yield* this.pinks(AUTOMA);
    if (!s.feeder.length) this.rerollFeeder('empty');
    yield* this.beat(200);
  }
  *automaAct(act) {
    const s = this.s, A = s.automa, f = BONUS[A.bonus].f;
    const lvl = { easy: -1, normal: 0, hard: 1 }[A.level] || 0;
    if (act === 'P' || act === 'D') {
      if (act === 'P') {
        const match = s.tray.map((c, i) => [c, i]).filter(([c]) => c != null && qualifies(f, BIRDS[c], null));
        if (match.length) {
          match.sort((x, y) => BIRDS[y[0]].pts - BIRDS[x[0]].pts);
          const [best] = match[0];
          for (const [c, i] of match) { s.tray[i] = null; if (c === best) A.up.push(c); else s.disc.push(c); }
          this.ev({ k: 'automaPlay', id: best });
          this.say(`Automa plays ${BIRDS[best].name} (${BIRDS[best].pts} pts).`);
          const bb = BIRDS[best];
          this.trig.play.push({ hab: bb.hab[this.rng.int(bb.hab.length)], nest: bb.nest });
          this.refillTray();
          return;
        }
      }
      // draw: flush the tray, take one face-down card
      for (let i = 0; i < 3; i++) if (s.tray[i] != null) { s.disc.push(s.tray[i]); s.tray[i] = null; }
      this.refillTray();
      const c = this.topCard(); if (c != null) A.down++;
      this.trig.draw = true;
      this.ev({ k: 'automaDraw' });
      this.say(`Automa draws a card face-down (${A.faceDown} pts).`);
    } else if (act[0] === 'L') {
      const n = +act[1]; A.eggs += n; this.trig.lay = true;
      this.ev({ k: 'automaEggs', n }); this.say(`Automa lays ${n} egg${n > 1 ? 's' : ''}.`);
    } else if (act === 'F') {
      if (s.feeder.length && s.feeder.every((x) => x === s.feeder[0])) this.rerollFeeder('quiet');
      const got = [];
      for (let k = 0; k < 2 && s.feeder.length; k++) { const i = this.rng.int(s.feeder.length); const face = s.feeder.splice(i, 1)[0]; s.out.push(face); got.push(faceFoods(face)[0]); }
      this.trig.feed = got;
      this.ev({ k: 'automaFood', n: got.length });
      this.say('Automa takes ' + got.length + ' dice from the birdfeeder.');
      if (!s.feeder.length) this.rerollFeeder('empty');
    } else if (act[0] === 'C') {
      const n = +act[1] === 0 ? -1 : +act[1];
      A.cubes = Math.max(0, A.cubes + n + (n > 0 ? lvl * 0 : 0));
      this.ev({ k: 'automaCube', n: A.cubes });
    }
  }

  // ---------------------------------------------------------------- scoring
  scoreOf(pid) {
    const s = this.s;
    if (pid === AUTOMA) {
      const A = s.automa;
      const birds = A.up.reduce((a, c) => a + BIRDS[c].pts, 0), down = A.down * A.faceDown, goals = A.goalPts.reduce((a, b) => a + b, 0);
      return { birds, down, eggs: A.eggs, tokens: A.tokens, goals, bonus: 0, cache: 0, tuck: 0, total: birds + down + A.eggs + A.tokens + goals };
    }
    const P = this.P(pid), ents = entries(P);
    const birds = ents.reduce((a, { b }) => a + b.pts, 0);
    const eggs = ents.reduce((a, { e }) => a + e.eggs, 0), cache = ents.reduce((a, { e }) => a + e.cache, 0), tuck = ents.reduce((a, { e }) => a + e.tuck, 0);
    const bonusList = P.bonus.map((id) => ({ id, n: bonusCount(id, P), pts: bonusPoints(id, P) }));
    const bonus = bonusList.reduce((a, x) => a + x.pts, 0), goals = P.goalPts.reduce((a, b) => a + b, 0);
    return { birds, eggs, cache, tuck, bonus, bonusList, goals, total: birds + eggs + cache + tuck + bonus + goals, food: foodTotal(P.food) };
  }
  /** Public score (no bonus cards) — shown during the game. */
  publicScore(pid) { const x = this.scoreOf(pid); return x.total - (x.bonus || 0); }
  finish() {
    const s = this.s;
    s.phase = 'over'; s.cur = null;
    const rows = this.order.map((pid) => ({ pid, ...this.scoreOf(pid), food: pid === AUTOMA ? 0 : foodTotal(this.P(pid).food) }));
    rows.sort((a, b) => b.total - a.total || b.food - a.food);
    const top = rows[0];
    const winners = rows.filter((r) => r.total === top.total && r.food === top.food).map((r) => r.pid);
    s.over = { rows, winners };
    this.ev({ k: 'over' });
    this.say('The game is over.');
  }

  // ---------------------------------------------------------------- what each player may see
  view(me) {
    const s = this.s, pl = {};
    for (const pid of this.humans) {
      const P = s.players[pid];
      pl[pid] = { id: pid, hand: pid === me ? P.hand : null, handN: P.hand.length, bonus: pid === me ? P.bonus : null, bonusN: P.bonus.length, food: P.food, board: P.board, pink: P.pink, goalPts: P.goalPts, kept: P.kept, score: this.publicScore(pid) };
    }
    let prompt = null;
    if (this.prompt) {
      const p = this.prompt, mine = p.all ? p.pids.includes(me) : p.pid === me;
      prompt = { kind: p.kind, pid: p.pid, pids: p.pids, all: p.all, waiting: p.all ? p.pids.filter((x) => !(x in this.answers)) : null };
      if (mine && !(p.all && me in this.answers)) for (const k of Object.keys(p)) if (k !== 'check' && !(k in prompt)) prompt[k] = p[k];
      else if (!p.priv) for (const k of ['left', 'purpose', 'text', 'hab']) if (k in p) prompt[k] = p[k];
      if (p.kind === 'setup' && mine) { const P = s.players[me]; prompt.birds = P.hand; prompt.bonus = P.bonus; prompt.food = P.food; }
    }
    const A = s.automa ? { level: s.automa.level, up: s.automa.up, down: s.automa.down, eggs: s.automa.eggs, tokens: s.automa.tokens, cubes: s.automa.cubes, goalPts: s.automa.goalPts, faceDown: s.automa.faceDown, bonus: s.phase === 'over' ? s.automa.bonus : null, last: s.automa.last, score: this.publicScore(AUTOMA) } : null;
    return {
      round: s.round, first: s.first, cur: s.cur, phase: s.phase, goalMode: s.goalMode, solo: s.solo, order: this.order, names: this.names,
      players: pl, feeder: s.feeder, out: s.out, deckN: s.deck.length, discN: s.disc.length, tray: s.tray, goals: s.goals, goalRes: s.goalRes, bonusN: s.bonusDeck.length,
      automa: A, over: s.over, prompt, log: s.log.slice(-80), turnsIn: s.round ? this.turnsIn(s.round) : 0,
    };
  }
}

// ------------------------------------------------------------------ computer decisions
// The UI host uses this same chooser for every computer seat. Keeping it beside the
// validators means bots go through exactly the same legal-move checks as people.
const birdValue = (b) => b.pts + b.eggs * 0.22 + (b.pw ? 1.1 : 0) + (b.hab.length > 1 ? 0.55 : 0) - b.cost.n.length * 0.18;
const lowestCard = (P) => P.hand.slice().sort((a, b) => birdValue(BIRDS[a]) - birdValue(BIRDS[b]))[0];

/** Return a legal, level-sensitive answer for the current prompt. Exported for UI bots and headless tests. */
export function chooseBotAnswer(game, prompt, pid, level = 'normal') {
  const P = game.P(pid);
  const random = (xs) => xs[game.rng.int(xs.length)];
  if (prompt.kind === 'setup') {
    const ranked = P.hand.slice().sort((a, b) => birdValue(BIRDS[b]) - birdValue(BIRDS[a]));
    const keepN = level === 'easy' ? 1 + game.rng.int(3) : 2;
    const keep = ranked.slice(0, keepN);
    const wants = [];
    keep.forEach((id) => BIRDS[id].cost.n.forEach((t) => { if (FOODS.includes(t) && !wants.includes(t)) wants.push(t); }));
    FOODS.forEach((t) => { if (!wants.includes(t)) wants.push(t); });
    const foods = wants.slice(0, 5 - keep.length).join('');
    return { keep, foods, bonus: level === 'easy' ? random(P.bonus) : P.bonus[0] };
  }
  if (prompt.kind === 'turn') {
    const plays = game.legalPlays(pid);
    if (plays.length) {
      const ranked = plays.map((x) => ({ ...x, v: birdValue(BIRDS[x.card]) + game.bonusAffinity(pid, x.card) + game.rowAffinity(pid, x.hab) })).sort((a, b) => b.v - a.v);
      const chanceToPlay = level === 'easy' ? 0.48 : level === 'hard' ? 0.82 : 0.68;
      if (game.rng.next() < chanceToPlay || P.board.flat().length === 0) {
        const x = level === 'easy' ? random(ranked.slice(0, Math.min(4, ranked.length))) : ranked[0];
        return { a: 'play', card: x.card, hab: x.hab, food: x.food, eggs: x.eggs };
      }
    }
    const capacity = P.board.flat().reduce((n, e) => n + Math.max(0, BIRDS[e.id].eggs - e.eggs), 0);
    const actions = [];
    if (P.board[0].length || foodTotal(P.food) < 3) actions.push({ a: 'food', v: 3.2 + P.board[0].length * 0.7 - foodTotal(P.food) * 0.3 });
    if (capacity > 0) actions.push({ a: 'eggs', v: 2.4 + P.board[1].length * 0.65 + (game.s.round > 2 ? 1.3 : 0) });
    actions.push({ a: 'cards', v: 2.2 + P.board[2].length * 0.7 + (P.hand.length < 3 ? 1.6 : 0) });
    actions.sort((a, b) => b.v - a.v);
    return level === 'easy' ? random(actions) : actions[0];
  }
  if (prompt.kind === 'dice') {
    const die = level === 'easy' ? random(prompt.opts) : prompt.opts[0];
    const choices = faceFoods(game.s.feeder[die]).filter((t) => !prompt.filter || prompt.filter.includes(t));
    const food = choices.slice().sort((a, b) => (P.food[a] || 0) - (P.food[b] || 0))[0];
    return { die, food };
  }
  if (prompt.kind === 'draw') {
    const choices = game.s.tray.map((id, i) => id == null ? null : { i, v: birdValue(BIRDS[id]) }).filter(Boolean).sort((a, b) => b.v - a.v);
    if (!choices.length) return 'd';
    if (level === 'easy' && prompt.deckOk && game.rng.next() < 0.45) return 'd';
    return choices[0].i;
  }
  if (prompt.kind === 'egg') {
    const c = prompt.cands.slice().sort((a, b) => {
      const ea = P.board[a[0]][a[1]], eb = P.board[b[0]][b[1]];
      return (BIRDS[eb.id].eggs - eb.eggs) - (BIRDS[ea.id].eggs - ea.eggs);
    });
    return level === 'easy' ? random(c) : c[0];
  }
  if (prompt.kind === 'eggfrom') {
    if (prompt.skip && level !== 'hard' && game.rng.next() < 0.35) return null;
    const eggs = P.board.flatMap((row, h) => row.flatMap((e, i) => Array(e.eggs).fill([h, i])));
    return eggs[0] || null;
  }
  if (prompt.kind === 'handcard') {
    if (prompt.skip && prompt.purpose !== 'endDiscard' && (level === 'easy' || game.rng.next() < 0.25)) return null;
    return lowestCard(P);
  }
  if (prompt.kind === 'payfood') {
    if (prompt.skip && level === 'easy') return null;
    return FOODS.find((t) => P.food[t] > 0) ?? null;
  }
  if (prompt.kind === 'food') return prompt.opts.slice().sort((a, b) => (P.food[a] || 0) - (P.food[b] || 0))[0];
  if (prompt.kind === 'bonus') return level === 'easy' ? random(prompt.cards) : prompt.cards[0];
  if (prompt.kind === 'use') return level !== 'easy' || game.rng.next() > 0.45;
  if (prompt.kind === 'reroll') return true;
  if (prompt.kind === 'play2') {
    const plays = game.legalPlays(pid, prompt.hab);
    if (!plays.length || (level === 'easy' && game.rng.next() < 0.5)) return null;
    const x = plays.slice().sort((a, b) => birdValue(BIRDS[b.card]) - birdValue(BIRDS[a.card]))[0];
    return { a: 'play', card: x.card, hab: x.hab, food: x.food, eggs: x.eggs };
  }
  if (prompt.kind === 'pickbird') return prompt.cands[0];
  throw new Error(`No bot answer for ${prompt.kind}`);
}

Game.prototype.bonusAffinity = function bonusAffinity(pid, card) {
  const b = BIRDS[card];
  return this.P(pid).bonus.reduce((n, id) => n + (qualifies(BONUS[id].f, b, null) ? 0.9 : 0), 0);
};

Game.prototype.rowAffinity = function rowAffinity(pid, hab) {
  const n = this.P(pid).board[hab].length;
  return n < 5 ? rowReward(hab, n + 1).n - rowReward(hab, n).n + n * 0.08 : -9;
};

export { BIRDS, BONUS, GOALS };
