// Bohnanza — the rules engine (pure: no DOM, no network). The host owns one Game; everyone else only ever sees view(id).
// Rules follow the classic bean-trading card game: plant from the FRONT of a fixed-order hand, turn up two cards, trade and
// donate (the active player is in every deal), plant everything received, draw three to the back of the hand.

export const TYPES = {
  coffee: { n: 'Coffee', c: '#FF6D00', cnt: 24, v: [[4, 1], [7, 2], [10, 3], [12, 4]] },
  wax: { n: 'Wax', c: '#FBBC05', cnt: 22, v: [[4, 1], [7, 2], [9, 3], [11, 4]] },
  blue: { n: 'Blue', c: '#4285F4', cnt: 20, v: [[4, 1], [6, 2], [8, 3], [10, 4]] },
  chili: { n: 'Chili', c: '#EA4335', cnt: 18, v: [[3, 1], [6, 2], [8, 3], [9, 4]] },
  stink: { n: 'Stink', c: '#8BC34A', cnt: 16, v: [[3, 1], [5, 2], [7, 3], [8, 4]] },
  green: { n: 'Green', c: '#34A853', cnt: 14, v: [[3, 1], [5, 2], [6, 3], [7, 4]] },
  soy: { n: 'Soy', c: '#12B5CB', cnt: 12, v: [[2, 1], [4, 2], [6, 3], [7, 4]] },
  eye: { n: 'Black-eyed', c: '#A142F4', cnt: 10, v: [[2, 1], [4, 2], [5, 3], [6, 4]] },
  red: { n: 'Red', c: '#E91E8C', cnt: 8, v: [[2, 1], [3, 2], [4, 3], [5, 4]] },
  garden: { n: 'Garden', c: '#5E5CE6', cnt: 6, v: [[2, 2], [3, 3]] },
  cocoa: { n: 'Cocoa', c: '#E65100', cnt: 4, v: [[2, 2], [3, 3], [4, 4]] },
};
export const TYPE_ORDER = Object.keys(TYPES);

/** Coins paid for n beans of type t (the highest bean-o-meter step reached; may be 0). */
export function coinsFor(t, n) { let c = 0; for (const [b, co] of TYPES[t].v) if (n >= b) c = co; return c; }

/** Setup for a player count. `hands` is by seat from the starting player. */
export function configFor(n) {
  const base = { remove: [], hands: Array(n).fill(5), fields: 2, cost: 3, passes: 3, draw: 3, drawAll: false, duel: false };
  if (n <= 2) return { ...base, remove: ['garden', 'cocoa'], passes: 1, draw: 2, duel: true };
  if (n === 3) return { ...base, remove: ['cocoa'], fields: 3, cost: null, passes: 2 };
  if (n <= 5) return { ...base, remove: ['coffee'] };
  return { ...base, remove: ['cocoa', 'garden'], hands: [3, 4, 5, 6, 6, 6, 6].slice(0, n), cost: 2, draw: 1, drawAll: true };
}

export class Game {
  /** ids: seat ids; rng: {shuffle(arr), int(n)} */
  constructor(ids, rng) {
    this.rng = rng;
    this.ids = ids.slice();
    const n = ids.length;
    this.cfg = configFor(n);
    this.types = TYPE_ORDER.filter((t) => !this.cfg.remove.includes(t));
    this.type = [];
    this.deck = [];
    this.types.forEach((t) => { for (let i = 0; i < TYPES[t].cnt; i++) { this.type.push(t); this.deck.push(this.type.length - 1); } });
    this.total = this.deck.length;
    this.deck = rng.shuffle(this.deck);
    this.discard = [];
    this.hidden = new Set(); // face-down coin cards sitting in the discard pile
    this.box = 0; // coin cards removed from play (2-player)
    this.exhausted = 0;
    this.endPending = false;
    this.over = false;
    this.order = rng.shuffle(ids.slice());
    this.turn = 0;
    this.phase = 'wait';
    this.planted = 0;
    this.faceUp = [];
    this.offers = [];
    this.oid = 0;
    this.evs = [];
    this.evn = 0;
    this.tradeAt = 0;
    this.left = new Set();
    this.P = {};
    this.turnNo = 0;
    this.result = null;
    this.order.forEach((id) => { this.P[id] = { hand: [], coins: [], fields: Array.from({ length: this.cfg.fields }, () => ({ cards: [] })), pending: [], offered: [], bought: false }; });
    this.order.forEach((id, i) => { for (let k = 0; k < this.cfg.hands[i]; k++) this.P[id].hand.push(this.deck.pop()); });
  }

  // ---------------------------------------------------------------- helpers
  C(id) { return { id, t: this.type[id] }; }
  get active() { return this.order[this.turn]; }
  live() { return this.order.filter((id) => !this.left.has(id)); }
  ev(e) { e.n = ++this.evn; this.evs.push(e); if (this.evs.length > 60) this.evs.shift(); return e; }
  nf(p) { return p.fields.length; }
  fieldOk(p, f, card) { const fl = p.fields[f]; return !!fl && (fl.cards.length === 0 || this.type[fl.cards[0]] === this.type[card]); }
  canPlantAnywhere(p, card) { return p.fields.some((_, f) => this.fieldOk(p, f, card)); }
  canHarvest(id, f) {
    const p = this.P[id], fl = p.fields[f];
    if (!fl || !fl.cards.length) return false;
    if (this.cfg.duel && (id !== this.active || this.phase === 'over')) return false;
    return fl.cards.length > 1 || p.fields.every((x) => x.cards.length <= 1);
  }
  buyCost() { return this.cfg.cost; }
  canBuy(id) {
    const p = this.P[id];
    return this.cfg.cost != null && !p.bought && p.fields.length < 3 && p.coins.length >= this.cfg.cost && !this.over && !(this.cfg.duel && id !== this.active);
  }

  /** Draw one card. Returns null if none could be drawn (game is ending). */
  drawCard() {
    if (!this.deck.length) {
      if (!this.discard.length || this.exhausted >= this.cfg.passes) { this.endPending = true; return null; }
      this.deck = this.rng.shuffle(this.discard);
      this.discard = [];
      this.hidden.clear();
      this.ev({ k: 'reshuffle', pass: this.exhausted + 1, size: this.deck.length });
    }
    const c = this.deck.pop();
    if (!this.deck.length) {
      this.exhausted++;
      if (this.exhausted >= this.cfg.passes) this.endPending = true;
      else this.ev({ k: 'empty', pass: this.exhausted });
    }
    return c;
  }

  // ---------------------------------------------------------------- turn flow
  start() { this.beginTurn(true); }

  beginTurn(first = false) {
    this.turnNo++;
    this.planted = 0; this.faceUp = []; this.offers = []; this.tradeAt = 0;
    this.ev({ k: 'turn', who: this.active });
    const p = this.P[this.active];
    if (this.cfg.duel && !first && p.offered.length) { this.phase = 'offered'; return; }
    this.startPlanting();
  }
  startPlanting() {
    const p = this.P[this.active];
    this.phase = 'plant1';
    if (!p.hand.length) return this.afterPlant();
  }
  afterPlant() {
    if (this.cfg.duel) return this.duelAfterPlant();
    for (let i = 0; i < 2; i++) { const c = this.drawCard(); if (c === null) break; this.faceUp.push(c); }
    if (this.faceUp.length) this.ev({ k: 'faceup', who: this.active, cards: this.faceUp.map((c) => this.C(c)) });
    if (!this.faceUp.length) return this.turnEnd();
    this.phase = 'trade';
    this.tradeAt = Date.now();
  }
  checkPending() {
    if (this.phase !== 'plant3') return;
    if (this.live().some((id) => this.P[id].pending.length)) return;
    this.turnEnd();
  }
  turnEnd() {
    if (this.endPending) return this.finish();
    let drawn = 0;
    const recipients = this.cfg.drawAll ? this.order.slice(this.turn).concat(this.order.slice(0, this.turn)) : [this.active];
    for (const id of recipients) {
      if (this.left.has(id)) continue;
      for (let i = 0; i < this.cfg.draw; i++) {
        const c = this.drawCard();
        if (c === null) break;
        this.P[id].hand.push(c); drawn++;
        if (this.endPending) break;
      }
      if (this.endPending) break;
    }
    if (drawn) this.ev({ k: 'draw', who: this.cfg.drawAll ? 'all' : this.active, n: drawn });
    if (this.endPending) return this.finish();
    this.nextTurn();
  }
  nextTurn() {
    let guard = 0;
    do { this.turn = (this.turn + 1) % this.order.length; } while (this.left.has(this.active) && ++guard < 20);
    this.beginTurn();
  }

  // 2-player duel: after planting, optional discard, then draw 3, take matching discards, plant some, offer the rest.
  duelAfterPlant() {
    this.phase = 'discard';
    if (!this.P[this.active].hand.length) this.duelDraw3();
  }
  duelDraw3() {
    for (let i = 0; i < 3; i++) { const c = this.drawCard(); if (c === null) break; this.faceUp.push(c); }
    for (;;) {
      const top = this.discard[this.discard.length - 1];
      if (top === undefined || this.hidden.has(top) || !this.faceUp.some((c) => this.type[c] === this.type[top])) break;
      this.discard.pop(); this.faceUp.push(top);
    }
    if (this.faceUp.length) this.ev({ k: 'faceup', who: this.active, cards: this.faceUp.map((c) => this.C(c)) });
    this.phase = 'draw3';
    this.duelCheckDone();
  }
  duelCheckDone() {
    if (this.phase !== 'draw3') return;
    if (this.faceUp.length) return;
    this.duelEnd();
  }
  duelEnd() {
    const me = this.active, other = this.order.find((i) => i !== me);
    const p = this.P[me];
    if (this.endPending) return this.finish();
    for (let i = 0; i < 2; i++) { const c = this.drawCard(); if (c === null) break; p.hand.push(c); }
    this.ev({ k: 'draw', who: me, n: 2 });
    if (this.endPending) return this.finish();
    if (!other) return this.finish();
    this.nextTurn();
  }

  finish() {
    if (this.over) return;
    this.over = true; this.phase = 'over'; this.offers = [];
    const rows = [];
    for (const id of this.order) {
      const p = this.P[id];
      const fields = [];
      p.fields.forEach((fl, f) => {
        if (!fl.cards.length) { fields.push({ t: null, n: 0, coins: 0 }); return; }
        const t = this.type[fl.cards[0]], n = fl.cards.length, coins = coinsFor(t, n);
        const cards = fl.cards.splice(0);
        p.coins.push(...cards.slice(0, coins));
        this.discard.push(...cards.slice(coins));
        fields.push({ t, n, coins, cards: cards.map((c) => this.C(c)) });
      });
      rows.push({ id, before: p.coins.length - fields.reduce((a, x) => a + x.coins, 0), fields, total: p.coins.length, hand: p.hand.length });
    }
    // Official tie-break: among equal purses, the seat furthest clockwise from the starting player wins.
    rows.sort((a, b) => b.total - a.total || this.order.indexOf(b.id) - this.order.indexOf(a.id));
    const top = rows[0];
    this.result = { rows, winners: [top.id] };
    this.ev({ k: 'end' });
  }

  // ---------------------------------------------------------------- actions
  act(id, m) {
    if (this.over) return { err: 'The game is over.' };
    const p = this.P[id];
    if (!p || this.left.has(id)) return { err: 'Not in the game.' };
    const fn = this['do_' + m.a];
    if (!fn) return { err: 'Unknown action.' };
    return fn.call(this, id, p, m) || { ok: true };
  }

  do_plant(id, p, m) {
    const f = +m.f;
    if (!Number.isInteger(f) || !p.fields[f]) return { err: 'Pick a field.' };
    const planting = (this.phase === 'plant1' || this.phase === 'plant2') && id === this.active;
    if (planting) {
      const card = p.hand[0];
      if (card === undefined) return { err: 'Your hand is empty.' };
      if (!this.fieldOk(p, f, card)) return { err: this.canPlantAnywhere(p, card) ? 'A field only holds one kind of bean.' : 'No room: harvest a field first.' };
      p.hand.shift();
      p.fields[f].cards.push(card);
      this.planted++;
      this.ev({ k: 'plant', who: id, card: this.C(card), f, from: 'hand' });
      if (this.planted >= 2 || !p.hand.length) this.afterPlant();
      else this.phase = 'plant2';
      return;
    }
    if (this.phase === 'plant3' || (this.phase === 'offered' && id === this.active)) {
      const list = this.phase === 'offered' ? p.offered : p.pending;
      const card = +m.card;
      if (!list.includes(card)) return { err: 'That card is not waiting to be planted.' };
      if (!this.fieldOk(p, f, card)) return { err: this.canPlantAnywhere(p, card) ? 'A field only holds one kind of bean.' : 'No room: harvest a field or buy one.' };
      list.splice(list.indexOf(card), 1);
      p.fields[f].cards.push(card);
      this.ev({ k: 'plant', who: id, card: this.C(card), f, from: this.phase === 'offered' ? 'offered' : 'pending' });
      if (this.phase === 'offered') { if (!p.offered.length) this.startPlanting(); } else this.checkPending();
      return;
    }
    if (this.phase === 'draw3' && id === this.active) {
      const card = +m.card;
      if (!this.faceUp.includes(card)) return { err: 'That card is not available.' };
      if (!this.fieldOk(p, f, card)) return { err: 'A field only holds one kind of bean.' };
      this.faceUp.splice(this.faceUp.indexOf(card), 1);
      p.fields[f].cards.push(card);
      this.ev({ k: 'plant', who: id, card: this.C(card), f, from: 'faceup' });
      this.duelCheckDone();
      return;
    }
    return { err: 'Not now.' };
  }

  do_skip(id) {
    if (this.phase === 'plant2' && id === this.active) { this.afterPlant(); return; }
    if (this.phase === 'discard' && id === this.active) { this.duelDraw3(); return; }
    if (this.phase === 'draw3' && id === this.active) { this.duelOffer(); return; }
    return { err: 'Not now.' };
  }

  do_discard(id, p, m) {
    const card = +m.card;
    if (this.phase === 'discard' && id === this.active) {
      const i = p.hand.indexOf(card);
      if (i < 0) return { err: 'Pick a card from your hand.' };
      p.hand.splice(i, 1); this.discard.push(card);
      this.ev({ k: 'discard', who: id, card: this.C(card) });
      this.duelDraw3();
      return;
    }
    if (this.phase === 'offered' && id === this.active) {
      const i = p.offered.indexOf(card);
      if (i < 0) return { err: 'Pick an offered card.' };
      p.offered.splice(i, 1); this.discard.push(card);
      this.ev({ k: 'discard', who: id, card: this.C(card) });
      if (!p.offered.length) this.startPlanting();
      return;
    }
    return { err: 'Not now.' };
  }

  // duel: everything left face-up is offered to the opponent (they may plant or discard it on their turn)
  duelOffer() {
    const me = this.active, other = this.order.find((i) => i !== me);
    const rest = this.faceUp.splice(0);
    if (other && !this.left.has(other)) { this.P[other].offered.push(...rest); this.ev({ k: 'offer2', from: me, cards: rest.map((c) => this.C(c)) }); }
    else this.discard.push(...rest);
    this.duelEnd();
  }

  do_harvest(id, p, m) {
    const f = +m.f;
    if (!this.canHarvest(id, f)) {
      const fl = p.fields[f];
      if (!fl || !fl.cards.length) return { err: 'Nothing planted there.' };
      if (this.cfg.duel && id !== this.active) return { err: 'You can only harvest on your own turn.' };
      return { err: 'A single bean can only be harvested when every field has just one.' };
    }
    this.harvest(id, f);
    this.pruneOffers();
  }
  harvest(id, f) {
    const p = this.P[id], fl = p.fields[f];
    const t = this.type[fl.cards[0]], n = fl.cards.length, coins = coinsFor(t, n);
    const cards = fl.cards.splice(0);
    p.coins.push(...cards.slice(0, coins));
    this.discard.push(...cards.slice(coins));
    this.ev({ k: 'harvest', who: id, f, t, n, coins, cards: cards.map((c) => this.C(c)) });
  }

  do_buy(id, p) {
    if (this.cfg.cost == null) return { err: 'This table already starts with three fields.' };
    if (p.bought || p.fields.length >= 3) return { err: 'You already have a third field.' };
    if (p.coins.length < this.cfg.cost) return { err: `A third field costs ${this.cfg.cost} coins.` };
    if (this.cfg.duel && id !== this.active) return { err: 'Only on your own turn.' };
    const paid = p.coins.splice(0, this.cfg.cost);
    if (this.cfg.duel) this.box += paid.length; else { this.discard.push(...paid); paid.forEach((c) => this.hidden.add(c)); }
    p.fields.push({ cards: [] });
    p.bought = true;
    this.ev({ k: 'buy', who: id, cost: this.cfg.cost });
  }

  // ---------------------------------------------------------------- trading
  owns(id, card) { return this.P[id].hand.includes(card) || (id === this.active && this.faceUp.includes(card)); }
  offerValid(o) { return o.give.every((c) => this.owns(o.from, c)) && o.want.every((w) => w.id === undefined || (this.faceUp.includes(w.id) && o.from !== this.active)); }
  pruneOffers() { this.offers = this.offers.filter((o) => this.offerValid(o)); }

  do_offer(id, p, m) {
    if (this.phase !== 'trade') return { err: 'Trading is closed.' };
    const isAct = id === this.active;
    let to = m.to;
    if (!isAct) to = this.active;
    else if (to !== 'all' && !(this.P[to] && !this.left.has(to) && to !== id)) return { err: 'Pick who to trade with.' };
    const give = [...new Set((m.give || []).map(Number))].filter((c) => this.owns(id, c)).slice(0, 8);
    const want = [];
    for (const w of (m.want || []).slice(0, 8)) {
      if (w.id !== undefined) { if (!isAct && this.faceUp.includes(+w.id) && !want.some((x) => x.id === +w.id)) want.push({ id: +w.id }); }
      else if (TYPES[w.t] && this.types.includes(w.t) && !want.some((x) => x.t === w.t)) want.push({ t: w.t, n: Math.min(6, Math.max(1, Math.floor(+w.n) || 1)) });
    }
    if (!give.length && !want.length) return { err: 'Add a card to the offer.' };
    if (this.offers.filter((o) => o.from === id).length >= 3) return { err: 'You already have three open offers: withdraw one first.' };
    const o = { id: ++this.oid, from: id, to, give, want, at: Date.now() };
    this.offers.push(o);
    this.ev({ k: 'offer', id: o.id, from: id, to, give: give.map((c) => this.C(c)), want });
    this.tradeAt = Date.now();
    return { ok: true, id: o.id };
  }

  do_cancel(id, p, m) {
    const o = this.offers.find((x) => x.id === +m.id);
    if (!o || !(o.from === id || o.to === id)) return;
    this.offers = this.offers.filter((x) => x !== o);
    if (o.to === id && o.from !== id) this.ev({ k: 'decline', id: o.id, from: o.from, by: id });
    else this.ev({ k: 'withdraw', id: o.id, from: o.from });
  }

  /** For offer o and acceptor B: the card ids B could hand over for each wanted item. */
  candidates(o, B) {
    const P = this.P[B];
    return o.want.map((w) => {
      if (w.id !== undefined) return { need: 1, ids: B === this.active && this.faceUp.includes(w.id) ? [w.id] : [], fixed: true };
      const ids = [];
      if (B === this.active) for (const c of this.faceUp) if (this.type[c] === w.t) ids.push(c);
      for (const c of P.hand) if (this.type[c] === w.t) ids.push(c);
      return { need: w.n, ids, t: w.t };
    });
  }
  autoPick(o, B) {
    const cs = this.candidates(o, B), pick = [];
    for (const c of cs) {
      if (c.ids.length < c.need) return null;
      // prefer face-up cards (they would have to be planted anyway), then cards from the back of the hand
      const face = c.ids.filter((x) => this.faceUp.includes(x));
      const hand = c.ids.filter((x) => !this.faceUp.includes(x)).reverse();
      pick.push(...[...face, ...hand].slice(0, c.need));
    }
    return pick;
  }
  do_accept(id, p, m) {
    if (this.phase !== 'trade') return { err: 'Trading is closed.' };
    const o = this.offers.find((x) => x.id === +m.id);
    if (!o || o.from === id || (o.to !== 'all' && o.to !== id)) return { err: 'That offer is gone.' };
    const A = o.from, B = id;
    if (A !== this.active && B !== this.active) return { err: 'Every deal includes the player whose turn it is.' };
    if (!this.offerValid(o)) { this.pruneOffers(); return { err: 'That offer is no longer valid.' }; }
    let take;
    const cs = this.candidates(o, B);
    if (Array.isArray(m.pick)) {
      take = [...new Set(m.pick.map(Number))];
      const pool = new Set(cs.flatMap((c) => c.ids));
      if (!take.every((c) => pool.has(c))) return { err: 'You can only give cards you hold.' };
      for (const w of o.want) {
        const cnt = w.id !== undefined ? (take.includes(w.id) ? 1 : 0) : take.filter((c) => this.type[c] === w.t).length;
        if (cnt !== (w.id !== undefined ? 1 : w.n)) return { err: 'That does not match the offer.' };
      }
      if (take.length !== o.want.reduce((a, w) => a + (w.id !== undefined ? 1 : w.n), 0)) return { err: 'That does not match the offer.' };
    } else {
      take = this.autoPick(o, B);
      if (!take) return { err: 'You do not have the beans this offer asks for.' };
    }
    const strip = (pid, card) => {
      const q = this.P[pid]; let i = q.hand.indexOf(card);
      if (i >= 0) { q.hand.splice(i, 1); return; }
      i = this.faceUp.indexOf(card);
      if (i >= 0) this.faceUp.splice(i, 1);
    };
    o.give.forEach((c) => strip(A, c));
    take.forEach((c) => strip(B, c));
    this.P[B].pending.push(...o.give);
    this.P[A].pending.push(...take);
    this.offers = this.offers.filter((x) => x !== o);
    this.pruneOffers();
    this.ev({ k: 'trade', a: A, b: B, ga: o.give.map((c) => this.C(c)), gb: take.map((c) => this.C(c)) });
    this.tradeAt = Date.now();
  }

  do_endtrade(id, p) {
    if (this.phase !== 'trade' || id !== this.active) return { err: 'Not now.' };
    this.closeTrade();
  }
  closeTrade() {
    const p = this.P[this.active];
    p.pending.push(...this.faceUp);
    this.faceUp = []; this.offers = [];
    this.phase = 'plant3';
    this.ev({ k: 'plant3' });
    this.checkPending();
  }

  // ---------------------------------------------------------------- leaving
  leave(id) {
    if (this.over || this.left.has(id)) return;
    const p = this.P[id];
    this.left.add(id);
    this.discard.push(...p.hand, ...p.pending, ...p.offered, ...p.fields.flatMap((f) => f.cards));
    p.hand = []; p.pending = []; p.offered = []; p.fields.forEach((f) => (f.cards = []));
    this.offers = this.offers.filter((o) => o.from !== id && o.to !== id);
    if (this.live().length < 2) return this.finish();
    if (id === this.active) {
      this.discard.push(...this.faceUp); this.faceUp = [];
      this.nextTurn();
    } else if (this.phase === 'plant3') this.checkPending();
  }

  // ---------------------------------------------------------------- what a player may see
  view(id) {
    const P = this.P;
    const pub = {};
    for (const pid of this.order) {
      const q = P[pid];
      pub[pid] = {
        hand: q.hand.length, coins: q.coins.length, left: this.left.has(pid), bought: q.bought,
        fields: q.fields.map((f) => f.cards.map((c) => this.C(c))),
        pending: q.pending.map((c) => this.C(c)),
        offered: q.offered.map((c) => this.C(c)),
      };
    }
    const dcounts = {};
    for (const c of this.discard) if (!this.hidden.has(c)) dcounts[this.type[c]] = (dcounts[this.type[c]] || 0) + 1;
    return {
      phase: this.phase, turn: this.active, order: this.order, planted: this.planted, over: this.over, types: this.types,
      cfg: { cost: this.cfg.cost, passes: this.cfg.passes, draw: this.cfg.draw, drawAll: this.cfg.drawAll, duel: this.cfg.duel, nf0: this.cfg.fields },
      deck: this.deck.length, total: this.total, discard: this.discard.length,
      dtop: this.discard.length && !this.hidden.has(this.discard[this.discard.length - 1]) ? this.C(this.discard[this.discard.length - 1]) : null,
      dcounts, exhausted: this.exhausted, endPending: this.endPending, box: this.box,
      faceUp: this.faceUp.map((c) => this.C(c)),
      offers: this.offers.map((o) => ({ id: o.id, from: o.from, to: o.to, give: o.give.map((c) => this.C(c)), want: o.want })),
      players: pub,
      hand: P[id] ? P[id].hand.map((c) => this.C(c)) : [],
      evs: this.evs.slice(-40),
      turnNo: this.turnNo,
      result: this.result,
    };
  }
}
