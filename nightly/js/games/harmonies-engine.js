// Harmonies — game flow (pure, no DOM). The host owns one state object `G`; every turn arrives as a list of acts
// that is replayed against a copy and either accepted whole or refused.
//
// acts: {t:'take', s}            take the three tokens of central space s (always first)
//       {t:'tok', k, c}          put one of them (colour k) on cell c
//       {t:'drop', k}            discard a token that has nowhere legal to go
//       {t:'card', id}           take an animal card from the row (once per turn)
//       {t:'swap', id}           solo only: instead of taking a card, replace one in the row
//       {t:'cube', card, c}      settle an animal: put a cube from `card` on cell c (its habitat must be built there)
import { cardOf, ANIMALS, SPIRITS } from './harmonies-cards.js';
import { BAG_COUNTS, HAND_MAX, canPlace, legalCells, place, emptyCells, emptyCount, cloneCells, findHabitats, scorePlayer, sunsOf } from './harmonies-rules.js';

export const ROW_SIZE = (solo) => (solo ? 3 : 5);
export const SPACES = (solo) => (solo ? 3 : 5);

export function createGame({ ids, side = 'A', spirits = false, rng }) {
  const n = ids.length, solo = n === 1;
  const bag = [];
  BAG_COUNTS.forEach((cnt, k) => { for (let i = 0; i < cnt; i++) bag.push(k); });
  const G = {
    n, ids: ids.slice(), side, solo, spirits: !!spirits, phase: spirits ? 'spirit' : 'play', seat: 0, start: 0, turnNo: 0, ending: false, over: false,
    bag: rng.shuffle(bag), discard: [], central: [], row: [], deck: rng.shuffle(ANIMALS.map((c) => c.id)), P: {}, last: null,
  };
  for (let s = 0; s < SPACES(solo); s++) G.central.push(G.bag.splice(-3));
  G.row = G.deck.splice(0, ROW_SIZE(solo));
  const sp = rng.shuffle(SPIRITS.map((c) => c.id));
  ids.forEach((id, i) => {
    G.P[id] = { cells: emptyCells(), hand: [], done: [], cubes: 0, spirit: null, offer: spirits ? [sp[i * 2], sp[i * 2 + 1]] : [], turns: 0 };
  });
  return G;
}

export function chooseSpirit(G, id, cardId) {
  const p = G.P[id];
  if (G.phase !== 'spirit' || !p || p.spirit !== null || !p.offer.includes(cardId)) return false;
  p.spirit = cardId; p.hand.push({ id: cardId, p: 0 });
  if (G.ids.every((i) => G.P[i].spirit !== null)) G.phase = 'play';
  return true;
}

export const currentId = (G) => G.ids[G.seat];
export const handCount = (pl) => pl.hand.length;
export const clone = (G) => JSON.parse(JSON.stringify(G));

/** Replay a turn on a copy. Returns {ok, G?, err?, ev?} — ev lists what happened for the animation / log. */
export function applyTurn(G0, id, acts, rng) {
  if (G0.over || G0.phase !== 'play') return { ok: false, err: 'not playing' };
  if (currentId(G0) !== id) return { ok: false, err: 'not your turn' };
  const G = clone(G0);
  const pl = G.P[id];
  const ev = { id, take: -1, toks: [], cubes: [], card: null, swap: null, drops: 0, taken: [] };
  let pool = null, took = false, usedCard = false;
  if (!Array.isArray(acts) || acts.length > 40) return { ok: false, err: 'bad acts' };
  for (const a of acts) {
    if (!a || typeof a !== 'object') return { ok: false, err: 'bad act' };
    if (a.t === 'take') {
      if (took || !Number.isInteger(a.s) || !G.central[a.s]) return { ok: false, err: 'bad take' };
      took = true; ev.take = a.s; pool = G.central[a.s].slice(); ev.taken = pool.slice();
    } else if (a.t === 'tok') {
      if (!pool) return { ok: false, err: 'take first' };
      const at = pool.indexOf(a.k);
      if (at < 0 || !Number.isInteger(a.c) || !canPlace(pl.cells, a.c, a.k)) return { ok: false, err: 'illegal placement' };
      pool.splice(at, 1); place(pl.cells, a.c, a.k); ev.toks.push({ k: a.k, c: a.c });
    } else if (a.t === 'drop') {
      if (!pool) return { ok: false, err: 'take first' };
      const at = pool.indexOf(a.k);
      if (at < 0 || legalCells(pl.cells, a.k).length) return { ok: false, err: 'cannot drop' };
      pool.splice(at, 1); G.discard.push(a.k); ev.drops++;
    } else if (a.t === 'card') {
      const at = G.row.indexOf(a.id);
      if (usedCard || at < 0 || pl.hand.length >= HAND_MAX || ev.swap !== null) return { ok: false, err: 'cannot take card' };
      usedCard = true; G.row.splice(at, 1); pl.hand.push({ id: a.id, p: 0 }); ev.card = { id: a.id, at };
    } else if (a.t === 'swap') {
      const at = G.row.indexOf(a.id);
      if (!G.solo || usedCard || ev.swap !== null || at < 0) return { ok: false, err: 'cannot swap' };
      ev.swap = { id: a.id, at };
      G.discard_cards = (G.discard_cards || 0) + 1;
      G.row.splice(at, 1);
      if (G.deck.length) G.row.splice(at, 0, G.deck.shift());
    } else if (a.t === 'cube') {
      const e = pl.hand.find((x) => x.id === a.card);
      if (!e) return { ok: false, err: 'no such card' };
      const card = cardOf(e.id);
      if (e.p >= card.k || !findHabitats(pl.cells, card).some((m) => m.target === a.c)) return { ok: false, err: 'habitat not built' };
      pl.cells[a.c].c = 1; e.p++; pl.cubes++; ev.cubes.push({ card: e.id, c: a.c, n: e.p });
      if (e.p >= card.k) { pl.hand.splice(pl.hand.indexOf(e), 1); pl.done.push(e); ev.cubes[ev.cubes.length - 1].done = true; }
    } else return { ok: false, err: 'unknown act' };
  }
  if (!took) return { ok: false, err: 'must take tokens' };
  if (pool.length) return { ok: false, err: 'place all tokens' };
  pl.turns++;
  // ---- end of turn: refill the central board and the animal row, look for the end of the game
  G.turnNo++;
  let short = false;
  if (G.solo) {
    for (let s = 0; s < G.central.length; s++) if (s !== ev.take && G.central[s]) { G.discard.push(...G.central[s]); }
    for (let s = 0; s < G.central.length; s++) { if (G.bag.length >= 3) G.central[s] = G.bag.splice(-3); else { G.central[s] = null; short = true; } }
  } else if (G.bag.length >= 3) G.central[ev.take] = G.bag.splice(-3);
  else { G.central[ev.take] = null; short = true; }
  while (G.row.length < ROW_SIZE(G.solo) && G.deck.length) G.row.push(G.deck.shift());
  if (short || emptyCount(pl.cells) <= 2) G.ending = true;
  const lastSeat = (G.start + G.n - 1) % G.n;
  const wasLast = G.seat === lastSeat;
  G.seat = (G.seat + 1) % G.n;
  if (G.ending && wasLast) G.over = true;
  else if (!G.central.some((x) => x && x.length)) G.over = true;
  if (G.over) G.phase = 'over';
  G.last = ev;
  return { ok: true, G, ev };
}

/** Final standings: [{id, total, cubes, ...breakdown}] best first (ties: more cubes placed; still tied = shared). */
export function standings(G) {
  const rows = G.ids.map((id) => ({ id, ...scorePlayer(G.P[id], G.side), cubes: G.P[id].cubes }));
  rows.sort((a, b) => b.total - a.total || b.cubes - a.cubes);
  const top = rows[0];
  rows.forEach((r) => { r.winner = r.total === top.total && r.cubes === top.cubes; });
  if (G.solo) { const sp = G.P[G.ids[0]].spirit; rows[0].suns = sunsOf(rows[0].total, G.side, sp === null ? null : cardOf(sp)); }
  return rows;
}
