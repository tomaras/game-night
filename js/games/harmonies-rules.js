// Harmonies — pure rules: board geometry, stacking, pattern matching and scoring. No DOM; runs in node for tests.
import { cardOf } from './harmonies-cards.js';

// Token colours (indices): blue = water, grey = mountain stone, brown = trunk, green = foliage, yellow = field, red = roof
export const BLUE = 0, GREY = 1, BROWN = 2, GREEN = 3, YELLOW = 4, RED = 5;
export const COLOR_NAMES = ['water', 'stone', 'trunk', 'foliage', 'grain', 'roof'];
export const BAG_COUNTS = [23, 23, 21, 19, 19, 15];
export const TREE_PTS = [1, 3, 7];
export const MOUNTAIN_PTS = [1, 3, 7];
export const RIVER_PTS = [0, 0, 2, 5, 8, 11, 15];
export const FIELD_PTS = 5, BUILDING_PTS = 5, ISLAND_PTS = 5;
export const HAND_MAX = 4;
export const SUN_STEPS = [40, 70, 90, 110, 130, 140, 150, 160];

// ---------------------------------------------------------------- the personal board: 23 hexes in columns of 5,4,5,4,5
const COLS = [5, 4, 5, 4, 5];
const CELL_AT = new Map();
export const CELLS = (() => {
  const out = [];
  COLS.forEach((n, c) => { for (let i = 0; i < n; i++) { const y = i + (c % 2 ? 0.5 : 0); out.push({ i: out.length, q: c, r: y - c / 2, col: c, row: i, y }); } });
  const map = CELL_AT;
  out.forEach((c) => map.set(c.q + ',' + c.r, c.i));
  const D = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const c of out) c.nb = D.map(([a, b]) => map.get(c.q + a + ',' + (c.r + b))).filter((x) => x !== undefined);
  return out;
})();
export const N_CELLS = CELLS.length;
const AT = (q, r) => CELL_AT.get(q + ',' + r);

export const emptyCells = () => CELLS.map(() => ({ s: [], c: 0 }));
export const cloneCells = (cells) => cells.map((c) => ({ s: c.s.slice(), c: c.c }));
export const emptyCount = (cells) => cells.reduce((a, c) => a + (c.s.length ? 0 : 1), 0);

// ---------------------------------------------------------------- stacking
/** Can a token of colour k be put on cell i? (Blue and yellow only on bare ground; nothing goes on them, on leaves, or on a cube.) */
export function canPlace(cells, i, k) {
  const c = cells[i];
  if (!c || c.c) return false;
  const s = c.s, n = s.length;
  if (!n) return true;
  if (k === BLUE || k === YELLOW) return false;
  const top = s[n - 1];
  if (top === BLUE || top === YELLOW || top === GREEN) return false;
  if (k === GREY) return n < 3 && s.every((x) => x === GREY);
  if (k === BROWN) return n < 2 && s.every((x) => x === BROWN);
  if (k === GREEN) return s.every((x) => x === BROWN); // on one or two trunks
  if (k === RED) return n === 1 && (top === GREY || top === BROWN || top === RED);
  return false;
}
export const legalCells = (cells, k) => { const o = []; for (let i = 0; i < cells.length; i++) if (canPlace(cells, i, k)) o.push(i); return o; };
export function place(cells, i, k) { cells[i].s.push(k); }

/** What a stack is: water, field, mountain h, tree h (green on 0-2 trunks), trunk h, building (red on one token), roof (a lone red). */
export function kindOf(s) {
  const n = s.length;
  if (!n) return { t: 'empty', h: 0 };
  const top = s[n - 1];
  if (n === 1) return { t: ['water', 'mountain', 'trunk', 'tree', 'field', 'roof'][top], h: 1 };
  if (s.every((x) => x === GREY)) return { t: 'mountain', h: n };
  if (top === GREEN && s.slice(0, -1).every((x) => x === BROWN)) return { t: 'tree', h: n };
  if (s.every((x) => x === BROWN)) return { t: 'trunk', h: n };
  if (top === RED && n === 2 && (s[0] === GREY || s[0] === BROWN || s[0] === RED)) return { t: 'building', h: 2 };
  return { t: 'other', h: n };
}

// ---------------------------------------------------------------- patterns
const TCODE = { w: ['water', 1], f: ['field', 1], b: ['building', 2] };
const specOf = (k) => (TCODE[k] ? { t: TCODE[k][0], h: TCODE[k][1] } : { t: k[0] === 'm' ? 'mountain' : 'tree', h: +k[1] });
const rot = ([q, r]) => [-r, q + r];
const compiled = new Map();
/** All distinct base-game orientations (up to 6 rotations, never mirrored) of a card's habitat. */
export function orientations(card) {
  if (compiled.has(card.id)) return compiled.get(card.id);
  const out = [], seen = new Set();
  let cur = card.cells.map((c) => [c.q, c.r]);
  for (let k = 0; k < 6; k++) {
    const cells = cur.map(([q, r], j) => ({ dq: q - cur[0][0], dr: r - cur[0][1], ...specOf(card.cells[j].k), mk: card.cells[j].mk }));
    const key = cells.map((c) => `${c.t}${c.h}:${c.dq},${c.dr}${c.mk ? '*' : ''}`).sort().join('|');
    if (!seen.has(key)) { seen.add(key); out.push(cells); }
    cur = cur.map(rot);
  }
  compiled.set(card.id, out);
  return out;
}
const kindMatch = (spec, k) => k.t === spec.t && (spec.t === 'water' || spec.t === 'field' || spec.t === 'building' || k.h === spec.h);

/** Every place a card's habitat is currently built: [{target, cells:[...]}] (target = cell that would receive the cube; no cube there yet). */
export function findHabitats(cells, card) {
  const found = [], seen = new Set();
  const kinds = cells.map((c) => kindOf(c.s));
  for (const o of orientations(card)) {
    const a0 = o[0];
    for (const base of CELLS) {
      const idxs = [];
      let ok = true;
      for (const c of o) {
        const i = AT(base.q + c.dq, base.r + c.dr);
        if (i === undefined || !kindMatch(c, kinds[i])) { ok = false; break; }
        idxs.push(i);
      }
      if (!ok) continue;
      const mk = o.findIndex((c) => c.mk);
      const target = idxs[mk];
      if (cells[target].c) continue;
      const key = target + ':' + idxs.slice().sort((x, y) => x - y).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ target, cells: idxs });
      void a0;
    }
  }
  return found;
}
/** Cells (token slots) that currently could take a cube for this card. */
export const cubeTargets = (cells, card) => [...new Set(findHabitats(cells, card).map((m) => m.target))];

/**
 * How close is the board to a card's habitat? Best partial fit over all orientations: {have, need, ok, missing:[{i,spec}]}
 * `ok` means every missing cell can still be built (empty, or a stack that can grow into the wanted one).
 */
export function bestFit(cells, card) {
  let best = null;
  const kinds = cells.map((c) => kindOf(c.s));
  for (const o of orientations(card)) {
    for (const base of CELLS) {
      let have = 0, ok = true;
      const missing = [];
      for (const c of o) {
        const i = AT(base.q + c.dq, base.r + c.dr);
        if (i === undefined) { ok = false; break; }
        if (kindMatch(c, kinds[i])) { have++; continue; }
        if (!growsInto(cells[i], c)) { ok = false; break; }
        missing.push({ i, spec: c });
      }
      if (!ok) continue;
      if (!best || have > best.have) { best = { have, need: o.length, missing, ok: true }; if (have === o.length) return best; }
    }
  }
  return best || { have: 0, need: card.cells.length, missing: [], ok: false };
}
function growsInto(cell, spec) {
  if (cell.c) return false;
  const s = cell.s, n = s.length;
  if (!n) return true;
  const top = s[n - 1];
  if (spec.t === 'tree') return s.every((x) => x === BROWN) && n < spec.h;
  if (spec.t === 'mountain') return s.every((x) => x === GREY) && n < spec.h;
  if (spec.t === 'building') return n === 1 && (top === GREY || top === BROWN || top === RED);
  return false;
}

// ---------------------------------------------------------------- scoring
const topColor = (c) => (c.s.length ? c.s[c.s.length - 1] : -1);
function components(cells, pred) {
  const seen = new Set(), out = [];
  for (const c of CELLS) {
    if (seen.has(c.i) || !pred(c.i)) continue;
    const comp = [], st = [c.i];
    seen.add(c.i);
    while (st.length) { const u = st.pop(); comp.push(u); for (const v of CELLS[u].nb) if (!seen.has(v) && pred(v)) { seen.add(v); st.push(v); } }
    out.push(comp);
  }
  return out;
}
export function longestRiver(cells, comp) {
  const inC = new Set(comp);
  if (!comp.length) return 0;
  // A river is measured along the shortest route between its ends. For a branch,
  // choose the pair of ends with the longest such route. A loop has no ends, so
  // compare every pair; this makes an even loop score only to its opposite bank.
  const ends = comp.filter((u) => CELLS[u].nb.filter((v) => inC.has(v)).length <= 1);
  const starts = ends.length >= 2 ? ends : comp;
  const targets = new Set(starts);
  let best = 1;
  for (const s of starts) {
    const dist = new Map([[s, 1]]), queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi];
      for (const v of CELLS[u].nb) if (inC.has(v) && !dist.has(v)) { dist.set(v, dist.get(u) + 1); queue.push(v); }
    }
    for (const [u, d] of dist) if (u !== s && targets.has(u)) best = Math.max(best, d);
  }
  return best;
}
export const riverPts = (len) => (len <= 6 ? RIVER_PTS[len] : RIVER_PTS[6] + 4 * (len - 6));

/** Landscape score of a board. side 'A' scores the longest river, 'B' scores islands. Returns totals plus `marks` for the UI. */
export function scoreBoard(cells, side = 'A') {
  const kinds = cells.map((c) => kindOf(c.s));
  const r = { trees: 0, mountains: 0, fields: 0, buildings: 0, water: 0, total: 0, marks: [], river: 0, islands: 0, nFields: 0, nBuildings: 0 };
  for (const c of CELLS) {
    const k = kinds[c.i];
    if (k.t === 'tree') { const p = TREE_PTS[k.h - 1]; r.trees += p; r.marks.push({ i: c.i, pts: p, t: 'tree' }); }
    else if (k.t === 'mountain') {
      const touch = c.nb.some((v) => kinds[v].t === 'mountain');
      const p = touch ? MOUNTAIN_PTS[k.h - 1] : 0;
      r.mountains += p; r.marks.push({ i: c.i, pts: p, t: 'mountain', lonely: !touch });
    } else if (k.t === 'building') {
      const cols = new Set(c.nb.map((v) => topColor(cells[v])).filter((x) => x >= 0));
      const ok = cols.size >= 3;
      if (ok) { r.buildings += BUILDING_PTS; r.nBuildings++; }
      r.marks.push({ i: c.i, pts: ok ? BUILDING_PTS : 0, t: 'building', colors: cols.size });
    }
  }
  for (const comp of components(cells, (i) => kinds[i].t === 'field')) {
    if (comp.length < 2) continue;
    r.fields += FIELD_PTS; r.nFields++;
    r.marks.push({ i: comp[0], pts: FIELD_PTS, t: 'field', group: comp });
  }
  if (side === 'A') {
    let bestLen = 0, bestComp = null;
    for (const comp of components(cells, (i) => kinds[i].t === 'water')) { const len = longestRiver(cells, comp); if (len > bestLen) { bestLen = len; bestComp = comp; } }
    r.river = bestLen; r.water = riverPts(bestLen);
    if (bestComp) r.marks.push({ i: bestComp[0], pts: r.water, t: 'river', group: bestComp, len: bestLen });
  } else {
    const isl = components(cells, (i) => kinds[i].t !== 'water');
    r.islands = Math.max(1, isl.length); r.water = r.islands * ISLAND_PTS;
    r.islandGroups = isl;
  }
  r.total = r.trees + r.mountains + r.fields + r.buildings + r.water;
  return r;
}

// ---------------------------------------------------------------- animal cards & spirits
export const cardPts = (card, placed) => (placed > 0 ? card.vals[Math.min(placed, card.k) - 1] : 0);

/** End-of-game bonus of a nature spirit whose cube has been placed. */
export function spiritScore(card, cells, side = 'A') {
  const kinds = cells.map((c) => kindOf(c.s));
  const sc = scoreBoard(cells, side);
  let p = 0;
  switch (card.key) {
    case 'grove': for (const k of kinds) if (k.t === 'tree') p += k.h === 3 ? 3 : 1; break;
    case 'peaks': for (const k of kinds) if (k.t === 'mountain' && k.h >= 2) p += 3; break;
    case 'meadow': for (const comp of components(cells, (i) => kinds[i].t === 'field')) p += 3 + (comp.length >= 3 ? 3 : 0); break;
    case 'hearth': for (const k of kinds) if (k.t === 'building') p += 2; p += 3 * sc.nBuildings; break;
    case 'waters': for (const comp of components(cells, (i) => kinds[i].t === 'water')) p += comp.length >= 3 ? 6 : comp.length === 2 ? 3 : 1; break;
    case 'harvest': for (const c of CELLS) if (kinds[c.i].t === 'field' && c.nb.some((v) => kinds[v].t === 'building')) p += 2; break;
    case 'seasons': for (const t of ['water', 'mountain', 'tree', 'field', 'building']) if (kinds.some((k) => k.t === t)) p += 4; break;
    case 'oldwood': for (const k of kinds) if ((k.t === 'tree' && k.h >= 2) || k.t === 'trunk') p += 2; break;
    case 'steppes': for (const comp of components(cells, (i) => cells[i].s.length > 0 && cells[i].s.every((x) => x === GREY))) if (comp.length >= 3) p += 6; break;
    case 'stillness': {
      const isl = components(cells, (i) => kinds[i].t !== 'water');
      for (const comp of isl) p += 4 + (comp.some((i) => kinds[i].t === 'tree' && kinds[i].h === 3) ? 4 : 0);
      break;
    }
    default: break;
  }
  return p;
}

/** Everything a player scores: landscape + animals + spirit. `pl` = {cells, hand:[{id,p}], done:[{id,p}]} */
export function scorePlayer(pl, side = 'A') {
  const land = scoreBoard(pl.cells, side);
  const cards = [];
  let animals = 0, spirit = 0;
  for (const e of [...pl.hand, ...pl.done]) {
    const card = cardOf(e.id);
    if (card.spirit) {
      const p = e.p > 0 ? spiritScore(card, pl.cells, side) : 0;
      spirit += p; cards.push({ id: e.id, pts: p, placed: e.p, k: card.k, spirit: true });
    } else {
      const p = cardPts(card, e.p);
      animals += p; cards.push({ id: e.id, pts: p, placed: e.p, k: card.k });
    }
  }
  return { ...land, land: land.total, animals, spirit, cards, total: land.total + animals + spirit };
}

/** Solo rating: suns from the final score, plus the bonus suns for board side and spirit. */
export function sunsOf(total, side, spiritCard) {
  let base = 0;
  for (const t of SUN_STEPS) if (total >= t) base++;
  const bonusSide = side === 'A' ? 1 : 0;
  const bonusSpirit = !spiritCard ? 2 : spiritCard.kind === 'group' ? 1 : 0;
  return { base, bonusSide, bonusSpirit, total: base + bonusSide + bonusSpirit };
}
