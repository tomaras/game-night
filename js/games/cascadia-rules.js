// Timberline (Cascadia-style) — pure rules: tiles, hex geometry, scoring cards, corridor scoring, market engine.
// No DOM, no imports: used by the host, the clients (previews), the bots and tests/cascadia-rules.mjs.

export const HAB = ['forest', 'mountain', 'prairie', 'wetland', 'river'];
export const HAB_NAME = ['Forest', 'Mountain', 'Prairie', 'Wetland', 'River'];
export const ANIMALS = ['bear', 'elk', 'salmon', 'hawk', 'fox'];
export const ANIMAL_NAME = ['Bear', 'Elk', 'Salmon', 'Hawk', 'Fox'];
// Edge e of a pointy-top hex faces DIRS[e] (E, NE, NW, W, SW, SE); the opposite edge is (e + 3) % 6.
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const key = (q, r) => (q + 64) * 128 + (r + 64);
export const unkey = (k) => [Math.floor(k / 128) - 64, (k % 128) - 64];

// ------------------------------------------------------------------------------------------------ tiles
const comb = (n, k, start = 0, cur = [], out = []) => {
  if (cur.length === k) { out.push(cur.slice()); return out; }
  for (let i = start; i < n; i++) { cur.push(i); comb(n, k, i + 1, cur, out); cur.pop(); }
  return out;
};
function buildTiles() {
  const tiles = [];
  let id = 0;
  for (let h = 0; h < 5; h++) for (let a = 0; a < 5; a++) tiles.push({ id: id++, h: [h, -1], slots: [a], key: true });
  const pairs = comb(5, 2), trip = comb(5, 3), dbl = comb(5, 2);
  pairs.forEach((hp, p) => {
    const sets = [trip[p], trip[(p + 3) % 10], dbl[p], dbl[(p + 1) % 10], dbl[(p + 4) % 10], dbl[(p + 7) % 10]];
    sets.forEach((s, k) => tiles.push({ id: id++, h: hp.slice(), slots: s.slice(), key: false }));
  });
  return tiles;
}
export const TILES = buildTiles(); // 85
// Five starter triples: a single-habitat tile with one animal (no pinecone) and two double tiles.
function buildStarters() {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const a = (n) => (n + 5) % 5;
    const base = 100 + i * 3;
    const tiles = [
      { id: base, h: [i, -1], slots: [a(i + 2)], key: false, starter: true },
      { id: base + 1, h: [a(i + 1), a(i + 3)], slots: [a(i), a(i + 1), a(i + 2)], key: false, starter: true },
      { id: base + 2, h: [a(i + 2), a(i + 4)], slots: [a(i + 2), a(i + 3), a(i + 4)], key: false, starter: true },
    ];
    out.push({ tiles, cells: [{ q: 0, r: 0, t: base, rot: 0 }, { q: 1, r: 0, t: base + 1, rot: i % 6 }, { q: 0, r: 1, t: base + 2, rot: (i + 3) % 6 }] });
  }
  return out;
}
export const STARTERS = buildStarters();
export const TILE_BY_ID = {};
for (const t of TILES) TILE_BY_ID[t.id] = t;
for (const s of STARTERS) for (const t of s.tiles) TILE_BY_ID[t.id] = t;

/** Habitat on edge e of a tile placed with rotation rot (the first habitat covers edges rot..rot+2). */
export const edgeHab = (t, rot, e) => (t.h[1] < 0 ? t.h[0] : ((e - rot + 12) % 6 < 3 ? t.h[0] : t.h[1]));
export const tileHabs = (t) => (t.h[1] < 0 ? [t.h[0]] : t.h.slice());

// ------------------------------------------------------------------------------------------------ boards
// A board is { cells: Map<key, {q,r,t,rot,tok,si}> }. tok = animal index or -1; si = slot index the token sits on.
export const newBoard = () => ({ cells: new Map(), nature: 0 });
export function boardFromList(list, nature = 0) {
  const b = newBoard();
  b.nature = nature;
  for (const c of list) b.cells.set(key(c.q, c.r), { q: c.q, r: c.r, t: c.t, rot: c.rot || 0, tok: c.tok === undefined || c.tok === null ? -1 : c.tok, si: c.si === undefined ? -1 : c.si });
  return b;
}
export const boardToList = (b) => [...b.cells.values()].map((c) => ({ q: c.q, r: c.r, t: c.t, rot: c.rot, tok: c.tok, si: c.si }));
export function cloneBoard(b) {
  const n = newBoard();
  n.nature = b.nature;
  for (const [k, c] of b.cells) n.cells.set(k, { ...c });
  return n;
}
export function starterBoard(si) {
  return boardFromList(STARTERS[si].cells);
}

/** Empty hexes touching at least one placed tile. */
export function openHexes(b) {
  const seen = new Set(), out = [];
  for (const c of b.cells.values()) for (const [dq, dr] of DIRS) {
    const q = c.q + dq, r = c.r + dr, k = key(q, r);
    if (!b.cells.has(k) && !seen.has(k)) { seen.add(k); out.push({ q, r }); }
  }
  return out;
}
export const canPlaceTile = (b, q, r) => !b.cells.has(key(q, r)) && DIRS.some(([dq, dr]) => b.cells.has(key(q + dq, r + dr)));

/** Cells where a token of this animal could go right now. */
export function tokenSpots(b, animal) {
  const out = [];
  for (const c of b.cells.values()) {
    if (c.tok >= 0) continue;
    const i = TILE_BY_ID[c.t].slots.indexOf(animal);
    if (i >= 0) out.push({ q: c.q, r: c.r, si: i });
  }
  return out;
}
export function withTile(b, tileId, q, r, rot) {
  const n = cloneBoard(b);
  const t = TILE_BY_ID[tileId];
  n.cells.set(key(q, r), { q, r, t: tileId, rot: t.h[1] < 0 ? 0 : rot, tok: -1, si: -1 });
  return n;
}
export function withToken(b, q, r, animal) {
  const n = cloneBoard(b);
  const c = n.cells.get(key(q, r));
  const t = TILE_BY_ID[c.t];
  c.tok = animal; c.si = t.slots.indexOf(animal);
  if (t.key) n.nature++;
  return n;
}

// ------------------------------------------------------------------------------------------------ scoring helpers
const nbr = (c, e) => [c.q + DIRS[e][0], c.r + DIRS[e][1]];
function makeCtx(b) {
  const by = [[], [], [], [], []];
  const tokAt = new Map();
  for (const c of b.cells.values()) if (c.tok >= 0) { by[c.tok].push(c); tokAt.set(key(c.q, c.r), c.tok); }
  let minQ = 99, maxQ = -99, minR = 99, maxR = -99;
  for (const c of b.cells.values()) { minQ = Math.min(minQ, c.q); maxQ = Math.max(maxQ, c.q); minR = Math.min(minR, c.r); maxR = Math.max(maxR, c.r); }
  return { b, by, tokAt, span: Math.max(maxQ - minQ, maxR - minR, (maxQ + maxR) - (minQ + minR)) + 3 };
}
const tokAround = (ctx, c) => {
  const out = [];
  for (let e = 0; e < 6; e++) { const [q, r] = nbr(c, e); const a = ctx.tokAt.get(key(q, r)); if (a !== undefined) out.push(a); }
  return out;
};
/** Connected groups of tokens of one animal (adjacent hexes). */
function groupsOf(ctx, animal) {
  const cells = ctx.by[animal], seen = new Set(), out = [];
  for (const c of cells) {
    const k0 = key(c.q, c.r);
    if (seen.has(k0)) continue;
    const grp = [], st = [c];
    seen.add(k0);
    while (st.length) {
      const x = st.pop(); grp.push(x);
      for (let e = 0; e < 6; e++) {
        const [q, r] = nbr(x, e), k = key(q, r);
        if (!seen.has(k) && ctx.tokAt.get(k) === animal) { seen.add(k); st.push(ctx.b.cells.get(k)); }
      }
    }
    out.push(grp);
  }
  return out;
}
const tab = (t, n) => t[Math.min(n, t.length - 1)] || 0;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Best disjoint cover of items by candidate groups (each item must be in some group). groups: [{items:[idx], v}] */
function bestCover(n, groups) {
  // split into components that share items
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const g of groups) for (let i = 1; i < g.items.length; i++) parent[find(g.items[i])] = find(g.items[0]);
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); }
  let total = 0; const chosen = [];
  for (const items of comps.values()) {
    const loc = new Map(items.map((x, i) => [x, i]));
    const gs = groups.filter((g) => loc.has(g.items[0])).map((g) => ({ g, m: g.items.reduce((a, x) => a | (1 << loc.get(x)), 0) }));
    const by = items.map(() => []);
    for (const x of gs) for (const it of x.g.items) by[loc.get(it)].push(x);
    const full = (1 << items.length) - 1;
    const memo = new Map();
    const f = (done) => {
      if (done === full) return 0;
      if (memo.has(done)) return memo.get(done)[0];
      let i = 0; while (done & (1 << i)) i++;
      let best = -1, pick = null;
      for (const x of by[i]) {
        if (x.m & done) continue;
        const v = x.g.v + f(done | x.m);
        if (v > best) { best = v; pick = x; }
      }
      if (best < 0) { best = f(done | (1 << i)); pick = { m: 1 << i, g: null }; }
      memo.set(done, [best, pick]);
      return best;
    };
    total += f(0);
    let d = 0;
    while (d !== full) { const p = memo.get(d)[1]; if (p.g) chosen.push(p.g); d |= p.m; }
  }
  return { total, chosen };
}

// ------------------------------------------------------------------------------------------------ wildlife cards
// Every scorer returns { pts, used: [cell], text }.
const BEAR_A = [0, 4, 11, 19, 27];
const SALMON_A = [0, 2, 5, 8, 12, 16, 20, 25];
const SALMON_B = [0, 2, 4, 9, 11, 17];
const ELK_C = [0, 2, 4, 7, 10, 14, 18, 23, 28];
const ELK_D = [0, 2, 5, 8, 12, 16, 21];
const HAWK_A = [0, 2, 5, 8, 11, 14, 18, 22, 26];
const HAWK_B = [0, 0, 5, 9, 12, 16, 20, 24, 28];
const FOX_B = [0, 3, 5, 7];
const FOX_D = [0, 5, 7, 9, 11];

function bearScore(v, ctx) {
  const gs = groupsOf(ctx, 0);
  const used = [];
  if (v === 'A') {
    const pr = gs.filter((g) => g.length === 2); pr.forEach((g) => used.push(...g));
    return { pts: tab(BEAR_A, pr.length), used, text: pr.length ? plural(pr.length, 'pair') : 'no pairs' };
  }
  if (v === 'B') {
    const tr = gs.filter((g) => g.length === 3); tr.forEach((g) => used.push(...g));
    return { pts: tr.length * 10, used, text: tr.length ? plural(tr.length, 'trio') + ' × 10' : 'no trios' };
  }
  if (v === 'C') {
    const tb = [0, 2, 5, 8]; let pts = 0; const sizes = new Set(); const parts = [];
    for (const g of gs) if (g.length <= 3) { pts += tb[g.length]; sizes.add(g.length); used.push(...g); }
    for (const s of [1, 2, 3]) { const n = gs.filter((g) => g.length === s).length; if (n) parts.push(`${n}×${s}`); }
    if (sizes.size === 3) { pts += 3; parts.push('+3 set'); }
    return { pts, used, text: parts.join(' · ') || 'no groups of 1–3' };
  }
  const tb = { 2: 5, 3: 8, 4: 13 }; let pts = 0; const parts = [];
  for (const g of gs) if (tb[g.length]) { pts += tb[g.length]; used.push(...g); }
  for (const s of [2, 3, 4]) { const n = gs.filter((g) => g.length === s).length; if (n) parts.push(`${n}×${s}`); }
  return { pts, used, text: parts.join(' · ') || 'no groups of 2–4' };
}

function elkLines(cells) {
  const at = new Map(cells.map((c, i) => [key(c.q, c.r), i]));
  const groups = new Map();
  const add = (items, v) => { const m = items.slice().sort((a, b) => a - b).join(','); groups.set(m, { items: items.slice(), v }); };
  const LV = [0, 2, 5, 9, 13];
  cells.forEach((c, i) => {
    add([i], 2);
    for (let a = 0; a < 3; a++) {
      const items = [i];
      for (let L = 2; L <= 4; L++) {
        const j = at.get(key(c.q + DIRS[a][0] * (L - 1), c.r + DIRS[a][1] * (L - 1)));
        if (j === undefined) break;
        items.push(j); add(items, LV[L]);
      }
    }
  });
  return [...groups.values()];
}
const rot60 = ([q, r]) => [-r, q + r];
const SHAPES = (() => {
  const base = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [0, 1], [1, -1]]];
  const val = [2, 5, 9, 13];
  const out = [];
  base.forEach((s, bi) => {
    const seen = new Set(); let cur = s;
    for (let k = 0; k < 6; k++) {
      const mq = Math.min(...cur.map((p) => p[0])), mr = Math.min(...cur.map((p) => p[1]));
      const norm = cur.map((p) => [p[0] - mq, p[1] - mr]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const sig = norm.join('|');
      if (!seen.has(sig)) { seen.add(sig); out.push({ cells: cur, v: val[bi] }); }
      cur = cur.map(rot60);
    }
  });
  return out;
})();
function elkShapes(cells) {
  const at = new Map(cells.map((c, i) => [key(c.q, c.r), i]));
  const groups = new Map();
  cells.forEach((c, i) => {
    for (const sh of SHAPES) for (const [aq, ar] of sh.cells) {
      const items = [];
      let ok = true;
      for (const [sq, sr] of sh.cells) {
        const j = at.get(key(c.q + sq - aq, c.r + sr - ar));
        if (j === undefined) { ok = false; break; }
        items.push(j);
      }
      if (ok) groups.set(items.slice().sort((a, b) => a - b).join(','), { items, v: sh.v });
    }
  });
  return [...groups.values()];
}
function elkCircles(ctx) {
  const cells = ctx.by[1];
  const n = cells.length;
  if (!n) return { pts: 0, used: [], text: 'no elk' };
  const idxAt = new Map(cells.map((c, i) => [key(c.q, c.r), i]));
  // centres: any hex touching an elk; each centre's elk neighbours
  const nb = cells.map((c) => {
    const cs = [];
    for (let e = 0; e < 6; e++) {
      const cq = c.q + DIRS[e][0], cr = c.r + DIRS[e][1];
      const items = [];
      for (let f = 0; f < 6; f++) { const j = idxAt.get(key(cq + DIRS[f][0], cr + DIRS[f][1])); if (j !== undefined) items.push(j); }
      cs.push(items);
    }
    return cs;
  });
  // components: elk within hex distance 2 share possible centres
  const parent = cells.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  nb.forEach((cs) => cs.forEach((items) => { for (let i = 1; i < items.length; i++) parent[find(items[i])] = find(items[0]); }));
  const comps = new Map();
  cells.forEach((_, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); });
  let total = 0; const used = []; const ringsTxt = [];
  for (const items of comps.values()) {
    if (items.length > 20) { total += items.length * 2; continue; }
    const loc = new Map(items.map((x, i) => [x, i]));
    const full = (1 << items.length) - 1, memo = new Map();
    const opts = (i, done) => {
      const res = [];
      for (const grp of nb[items[i]]) {
        const m = grp.reduce((a, x) => ((done & (1 << loc.get(x))) ? a : a | (1 << loc.get(x))), 0);
        if (m & (1 << i)) res.push(m);
      }
      return res.length ? res : [1 << i];
    };
    const cnt = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
    const f = (done) => {
      if (done === full) return 0;
      if (memo.has(done)) return memo.get(done)[0];
      let i = 0; while (done & (1 << i)) i++;
      let best = -1, pick = 0;
      for (const m of opts(i, done)) { const v = tab(ELK_D, cnt(m)) + f(done | m); if (v > best) { best = v; pick = m; } }
      memo.set(done, [best, pick]);
      return best;
    };
    total += f(0);
    let d = 0;
    while (d !== full) {
      const m = memo.get(d)[1];
      const sz = cnt(m);
      ringsTxt.push(sz);
      items.forEach((it, k) => { if (m & (1 << k)) used.push(cells[it]); });
      d |= m;
    }
  }
  const counts = {}; ringsTxt.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
  const text = Object.keys(counts).sort((a, b) => b - a).map((s) => (s === '1' ? `${counts[s]} alone` : `${counts[s]}× ring of ${s}`)).join(' · ');
  return { pts: total, used, text };
}
function elkScore(v, ctx) {
  const cells = ctx.by[1];
  if (!cells.length) return { pts: 0, used: [], text: 'no elk' };
  if (v === 'A' || v === 'B') {
    const groups = v === 'A' ? elkLines(cells) : elkShapes(cells);
    const { total, chosen } = bestCover(cells.length, groups);
    const used = []; chosen.forEach((g) => g.items.forEach((i) => used.push(cells[i])));
    const names = v === 'A' ? ['', 'single', 'line of 2', 'line of 3', 'line of 4'] : ['', 'single', 'pair', 'trio', 'diamond'];
    const sizeIdx = (g) => (v === 'A' ? g.items.length : [0, 1, 2, 3, 4][g.items.length]);
    const cnt = {}; chosen.forEach((g) => { const n = names[sizeIdx(g)]; cnt[n] = (cnt[n] || 0) + 1; });
    return { pts: total, used, text: Object.entries(cnt).map(([n, c]) => `${c}× ${n}`).join(' · ') };
  }
  if (v === 'C') {
    const gs = groupsOf(ctx, 1); let pts = 0; const used = [];
    for (const g of gs) { pts += tab(ELK_C, g.length); used.push(...g); }
    return { pts, used, text: gs.map((g) => g.length).sort((a, b) => b - a).join(' + ') || 'no elk' };
  }
  return elkCircles(ctx);
}

/** Salmon runs: connected groups where every salmon touches at most two others in the group. */
function salmonRuns(ctx) {
  return groupsOf(ctx, 2).filter((g) => {
    const set = new Set(g.map((c) => key(c.q, c.r)));
    return g.every((c) => { let n = 0; for (let e = 0; e < 6; e++) { const [q, r] = nbr(c, e); if (set.has(key(q, r))) n++; } return n <= 2; });
  });
}
function salmonScore(v, ctx) {
  const runs = salmonRuns(ctx); let pts = 0; const used = [];
  for (const g of runs) {
    const n = g.length;
    if (v === 'A') pts += tab(SALMON_A, n);
    else if (v === 'B') pts += tab(SALMON_B, n);
    else if (v === 'C') pts += n >= 3 ? [0, 0, 0, 10, 12, 15][Math.min(n, 5)] : 0;
    else if (n >= 3) {
      const adj = new Set(); const mine = new Set(g.map((c) => key(c.q, c.r)));
      for (const c of g) for (let e = 0; e < 6; e++) { const [q, r] = nbr(c, e), k = key(q, r); if (!mine.has(k) && ctx.tokAt.has(k)) adj.add(k); }
      pts += n + adj.size;
    }
    const counted = v === 'C' || v === 'D' ? n >= 3 : true;
    if (counted) used.push(...g);
  }
  const text = runs.length ? runs.map((g) => g.length).sort((a, b) => b - a).join(' + ') : 'no runs';
  return { pts, used, text };
}

/** Hawk sight lines: first hawk met along each of the six directions (gaps and other animals do not block). */
function hawkSight(ctx) {
  const hawks = ctx.by[3], idx = new Map(hawks.map((c, i) => [key(c.q, c.r), i]));
  const adjacent = hawks.map(() => false), pairs = [];
  hawks.forEach((c, i) => {
    for (let e = 0; e < 6; e++) {
      for (let s = 1; s <= ctx.span; s++) {
        const q = c.q + DIRS[e][0] * s, r = c.r + DIRS[e][1] * s;
        const j = idx.get(key(q, r));
        if (j === undefined) continue;
        if (s === 1) adjacent[i] = true;
        else if (i < j) {
          const types = new Set();
          for (let t = 1; t < s; t++) { const a = ctx.tokAt.get(key(c.q + DIRS[e][0] * t, c.r + DIRS[e][1] * t)); if (a !== undefined) types.add(a); }
          pairs.push({ i, j, between: types.size });
        }
        break;
      }
    }
  });
  return { hawks, adjacent, pairs };
}
function hawkScore(v, ctx) {
  const { hawks, adjacent, pairs } = hawkSight(ctx);
  if (!hawks.length) return { pts: 0, used: [], text: 'no hawks' };
  const seesOther = hawks.map(() => false);
  pairs.forEach((p) => { seesOther[p.i] = seesOther[p.j] = true; });
  const alone = hawks.filter((_, i) => !adjacent[i]);
  if (v === 'A') return { pts: tab(HAWK_A, alone.length), used: alone, text: `${alone.length} on their own` };
  if (v === 'B') { const s = hawks.filter((_, i) => !adjacent[i] && seesOther[i]); return { pts: tab(HAWK_B, s.length), used: s, text: `${s.length} with a clear view` }; }
  if (v === 'C') {
    const used = []; pairs.forEach((p) => used.push(hawks[p.i], hawks[p.j]));
    return { pts: pairs.length * 3, used: [...new Set(used)], text: plural(pairs.length, 'sight line') + ' × 3' };
  }
  const groups = pairs.filter((p) => p.between > 0).map((p) => ({ items: [p.i, p.j], v: [0, 4, 7, 9, 9][p.between], p }));
  hawks.forEach((_, i) => groups.push({ items: [i], v: 0 }));
  const { total, chosen } = bestCover(hawks.length, groups);
  const used = []; let n = 0;
  chosen.forEach((g) => { if (g.items.length === 2) { n++; g.items.forEach((i) => used.push(hawks[i])); } });
  return { pts: total, used, text: n ? plural(n, 'pair') : 'no pairs' };
}

function foxScore(v, ctx) {
  const foxes = ctx.by[4];
  if (!foxes.length) return { pts: 0, used: [], text: 'no foxes' };
  const used = []; let pts = 0;
  if (v === 'A' || v === 'B' || v === 'C') {
    for (const f of foxes) {
      const around = tokAround(ctx, f);
      const cnt = [0, 0, 0, 0, 0]; around.forEach((a) => cnt[a]++);
      let p = 0;
      if (v === 'A') p = cnt.filter((x) => x > 0).length;
      else if (v === 'B') p = tab(FOX_B, cnt.slice(0, 4).filter((x) => x >= 2).length);
      else p = Math.max(...cnt.slice(0, 4));
      if (p > 0) { pts += p; used.push(f); }
    }
    return { pts, used, text: `${foxes.length} fox${foxes.length === 1 ? '' : 'es'}` };
  }
  // D: pairs of adjacent foxes
  const idx = new Map(foxes.map((c, i) => [key(c.q, c.r), i]));
  const groups = [];
  foxes.forEach((c, i) => {
    for (let e = 0; e < 6; e++) {
      const j = idx.get(key(c.q + DIRS[e][0], c.r + DIRS[e][1]));
      if (j === undefined || j < i) continue;
      const ring = new Set();
      for (const x of [c, foxes[j]]) for (let f = 0; f < 6; f++) ring.add(key(x.q + DIRS[f][0], x.r + DIRS[f][1]));
      ring.delete(key(c.q, c.r)); ring.delete(key(foxes[j].q, foxes[j].r));
      const cnt = [0, 0, 0, 0, 0];
      ring.forEach((k) => { const a = ctx.tokAt.get(k); if (a !== undefined) cnt[a]++; });
      groups.push({ items: [i, j], v: tab(FOX_D, cnt.slice(0, 4).filter((x) => x >= 2).length) });
    }
  });
  foxes.forEach((_, i) => groups.push({ items: [i], v: 0 }));
  const { total, chosen } = bestCover(foxes.length, groups);
  let n = 0;
  chosen.forEach((g) => { if (g.items.length === 2 && g.v > 0) { n++; g.items.forEach((i) => used.push(foxes[i])); } });
  return { pts: total, used, text: n ? plural(n, 'fox pair') : 'no scoring pairs' };
}

/** Family (F) and intermediate (I) cards: one scoring table for every animal, by size of each connected group. */
function simpleScore(v, a, ctx) {
  const gs = groupsOf(ctx, a); let pts = 0; const used = [];
  for (const g of gs) {
    const p = v === 'F' ? [0, 2, 5, 9][Math.min(g.length, 3)] : [0, 0, 5, 8, 12][Math.min(g.length, 4)];
    if (p) { pts += p; used.push(...g); }
  }
  return { pts, used, text: gs.map((g) => g.length).sort((x, y) => y - x).join(' + ') || 'none' };
}

const SCORERS = [bearScore, elkScore, salmonScore, hawkScore, foxScore];
export const VARIANTS = ['A', 'B', 'C', 'D'];

/** Score one animal under card `v` ('A'..'D', 'F' family, 'I' intermediate). */
export function scoreAnimal(b, animal, v, ctx = makeCtx(b)) {
  if (v === 'F' || v === 'I') return simpleScore(v, animal, ctx);
  return SCORERS[animal](v, ctx);
}
export function scoreAnimals(b, cards) {
  const ctx = makeCtx(b);
  return ANIMALS.map((_, a) => scoreAnimal(b, a, cards[a], ctx));
}

// ------------------------------------------------------------------------------------------------ habitat
/** Largest corridor per habitat: [{size, keys}] for the 5 habitats. */
export function corridors(b) {
  const out = [];
  for (let h = 0; h < 5; h++) {
    const mine = new Map();
    for (const c of b.cells.values()) if (tileHabs(TILE_BY_ID[c.t]).includes(h)) mine.set(key(c.q, c.r), c);
    const seen = new Set(); let best = { size: 0, keys: [] };
    for (const [k0, c0] of mine) {
      if (seen.has(k0)) continue;
      const comp = [k0], st = [c0]; seen.add(k0);
      while (st.length) {
        const c = st.pop(), t = TILE_BY_ID[c.t];
        for (let e = 0; e < 6; e++) {
          if (edgeHab(t, c.rot, e) !== h) continue;
          const [q, r] = nbr(c, e), k = key(q, r), o = mine.get(k);
          if (!o || seen.has(k)) continue;
          if (edgeHab(TILE_BY_ID[o.t], o.rot, (e + 3) % 6) !== h) continue;
          seen.add(k); comp.push(k); st.push(o);
        }
      }
      if (comp.length > best.size) best = { size: comp.length, keys: comp };
    }
    out.push(best);
  }
  return out;
}
/** Corridor majority bonuses. sizes[p][h] = largest corridor of player p; returns bonus[p][h]. */
export function majorityBonus(sizes, n = sizes.length) {
  const P = sizes.length, out = sizes.map(() => [0, 0, 0, 0, 0]);
  for (let h = 0; h < 5; h++) {
    if (P === 1 || n === 1) { if (sizes[0][h] >= 7) out[0][h] = 2; continue; }
    const vals = sizes.map((s) => s[h]);
    const top = Math.max(...vals);
    if (top <= 0) continue;
    const winners = vals.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
    if (n === 2) { winners.forEach((i) => { out[i][h] = winners.length === 1 ? 2 : 1; }); continue; }
    if (winners.length === 1) {
      out[winners[0]][h] = 3;
      const rest = vals.filter((v) => v < top), sec = rest.length ? Math.max(...rest) : 0;
      if (sec > 0) vals.forEach((v, i) => { if (v === sec) out[i][h] = 1; });
    } else winners.forEach((i) => { out[i][h] = winners.length === 2 ? 2 : 1; });
  }
  return out;
}

/** Full scoring for every player. boards: array of boards; cards: array of 5 variants; opts.majority false for family/intermediate. */
export function finalScores(boards, cards, { n = boards.length, majority = true } = {}) {
  const per = boards.map((b) => {
    const animals = scoreAnimals(b, cards);
    return { animals, cor: corridors(b), nature: b.nature };
  });
  const bonus = majority ? majorityBonus(per.map((p) => p.cor.map((c) => c.size)), n) : per.map(() => [0, 0, 0, 0, 0]);
  return per.map((p, i) => {
    const wild = p.animals.reduce((s, a) => s + a.pts, 0);
    const hab = p.cor.reduce((s, c) => s + c.size, 0);
    const maj = bonus[i].reduce((s, x) => s + x, 0);
    return { animals: p.animals, cor: p.cor, bonus: bonus[i], nature: p.nature, wild, hab, maj, total: wild + hab + maj + p.nature };
  });
}
/** Quick total for planning/bots (no majority bonus knowledge). */
export function quickTotal(b, cards) {
  const ctx = makeCtx(b);
  let s = 0;
  for (let a = 0; a < 5; a++) s += scoreAnimal(b, a, cards[a], ctx).pts;
  for (const c of corridors(b)) s += c.size;
  return s + b.nature;
}
export const SOLO_RANKS = [[110, 'Ascended'], [100, 'Elite'], [90, 'Excellent'], [80, 'Very good'], [70, 'Getting it'], [60, 'A good start']];
export const soloRank = (score) => (SOLO_RANKS.find(([t]) => score >= t) || [0, 'Keep exploring'])[1];

// ------------------------------------------------------------------------------------------------ cards (display text)
export const CARD_INFO = [
  { // bear
    A: { name: 'Bear pairs', text: 'Bears in groups of exactly two.', rows: [['1 pair', 4], ['2 pairs', 11], ['3 pairs', 19], ['4+ pairs', 27]] },
    B: { name: 'Bear trios', text: 'Bears in groups of exactly three.', rows: [['each trio', 10]] },
    C: { name: 'Bear groups', text: 'Groups of one, two or three. Bonus for having all three sizes.', rows: [['group of 1', 2], ['group of 2', 5], ['group of 3', 8], ['all three sizes', '+3']] },
    D: { name: 'Bear clans', text: 'Groups of two, three or four.', rows: [['group of 2', 5], ['group of 3', 8], ['group of 4', 13]] },
  },
  { // elk
    A: { name: 'Elk lines', text: 'Straight lines of elk, any direction. Each elk counts once.', rows: [['1', 2], ['line of 2', 5], ['line of 3', 9], ['line of 4', 13]] },
    B: { name: 'Elk shapes', text: 'Single, pair, triangle or diamond formations.', rows: [['single', 2], ['pair', 5], ['triangle', 9], ['diamond', 13]] },
    C: { name: 'Elk herds', text: 'Any connected herd, bigger is better.', rows: [['1', 2], ['2', 4], ['3', 7], ['4', 10], ['5', 14], ['6', 18], ['7', 23], ['8+', 28]] },
    D: { name: 'Elk rings', text: 'Elk touching a common hex (it may be empty). Each elk counts once.', rows: [['1', 2], ['2', 5], ['3', 8], ['4', 12], ['5', 16], ['6', 21]] },
  },
  { // salmon
    A: { name: 'Salmon runs', text: 'A run is a chain of salmon, each touching at most two others, with no other salmon next to it.', rows: [['1', 2], ['2', 5], ['3', 8], ['4', 12], ['5', 16], ['6', 20], ['7+', 25]] },
    B: { name: 'Salmon runs', text: 'Runs, scored by length (max 5).', rows: [['1', 2], ['2', 4], ['3', 9], ['4', 11], ['5+', 17]] },
    C: { name: 'Long runs', text: 'Only runs of three or more score.', rows: [['3', 10], ['4', 12], ['5+', 15]] },
    D: { name: 'Busy rivers', text: 'Runs of 3+: 1 per salmon, plus 1 per neighbouring animal.', rows: [['per salmon', 1], ['per neighbour', 1]] },
  },
  { // hawk
    A: { name: 'Lone hawks', text: 'Hawks with no hawk next to them.', rows: [['1', 2], ['2', 5], ['3', 8], ['4', 11], ['5', 14], ['6', 18], ['7', 22], ['8+', 26]] },
    B: { name: 'Watchful hawks', text: 'Lone hawks that can see another hawk in a straight line.', rows: [['2', 5], ['3', 9], ['4', 12], ['5', 16], ['6', 20], ['7', 24], ['8+', 28]] },
    C: { name: 'Sight lines', text: 'Each straight line between two hawks (not touching) scores.', rows: [['per line', 3]] },
    D: { name: 'Hawk pairs', text: 'Each hawk pairs once with a hawk in sight. Scores by animal kinds on the line between.', rows: [['1 kind', 4], ['2 kinds', 7], ['3+ kinds', 9]] },
  },
  { // fox
    A: { name: 'Curious foxes', text: 'Each fox scores one per different animal kind next to it (foxes count).', rows: [['per kind', 1]] },
    B: { name: 'Fox pairs', text: 'Each fox scores for kinds it touches twice or more.', rows: [['1 kind ×2', 3], ['2 kinds', 5], ['3 kinds', 7]] },
    C: { name: 'Fox favourites', text: 'Each fox scores the count of its most common neighbour (not fox).', rows: [['per animal', 1]] },
    D: { name: 'Fox duos', text: 'Two touching foxes score for kinds touched twice or more around them.', rows: [['1 kind', 5], ['2 kinds', 7], ['3 kinds', 9], ['4 kinds', 11]] },
  },
];
export const SIMPLE_CARD_INFO = {
  F: { name: 'Family card', text: 'Every animal: groups of the same kind score by size.', rows: [['1', 2], ['2', 5], ['3+', 9]] },
  I: { name: 'Intermediate card', text: 'Every animal: groups of two or more score by size.', rows: [['2', 5], ['3', 8], ['4+', 12]] },
};

// ------------------------------------------------------------------------------------------------ game engine
/** rng needs next/int/shuffle (util.js makeRng). */
export function newGame(n, rng, { cards = ['A', 'A', 'A', 'A', 'A'], solo = n === 1 } = {}) {
  const tiles = rng.shuffle(TILES.map((t) => t.id)).slice(0, 20 * Math.max(n, 2) + 3);
  const starters = rng.shuffle([0, 1, 2, 3, 4]).slice(0, n);
  const G = {
    n, solo, cards, turnNo: 0, turn: rng.int(n), over: false, freeWiped: false,
    stack: tiles, bag: [20, 20, 20, 20, 20], market: { tiles: [null, null, null, null], tokens: [-1, -1, -1, -1] },
    boards: starters.map((s) => boardToList(starterBoard(s))), nature: Array(n).fill(0), turns: Array(n).fill(0), last: Array(n).fill(null),
    wipes: 0, auto: 0, log: [],
  };
  for (let i = 0; i < 4; i++) { G.market.tiles[i] = G.stack.pop(); G.market.tokens[i] = drawToken(G, rng); }
  settle(G, rng);
  return G;
}
export function drawToken(G, rng) {
  const tot = G.bag.reduce((a, b) => a + b, 0);
  if (tot <= 0) return -1;
  let r = rng.int(tot);
  for (let a = 0; a < 5; a++) { if (r < G.bag[a]) { G.bag[a]--; return a; } r -= G.bag[a]; }
  return -1;
}
/** Overpopulation as seen by the player to move: indices of 3 identical tokens (or 4), or null. */
export function overpop(G) {
  const cnt = [0, 0, 0, 0, 0];
  G.market.tokens.forEach((a) => { if (a >= 0) cnt[a]++; });
  const a = cnt.findIndex((c) => c >= 3);
  if (a < 0) return null;
  return { animal: a, n: cnt[a], idx: G.market.tokens.map((x, i) => (x === a ? i : -1)).filter((i) => i >= 0) };
}
/** Keep wiping while 4 identical tokens show. */
export function settle(G, rng) {
  for (let guard = 0; guard < 30; guard++) {
    const o = overpop(G);
    if (!o || o.n < 4) return;
    G.auto++;
    replaceTokens(G, rng, o.idx);
  }
}
function replaceTokens(G, rng, idx) {
  const old = idx.map((i) => G.market.tokens[i]);
  idx.forEach((i) => { G.market.tokens[i] = drawToken(G, rng); });
  old.forEach((a) => { if (a >= 0) G.bag[a]++; });
}
/** Wipe tokens: kind 'free' (3 identical, once per turn) or 'nature' (spend a pinecone, any tokens). */
export function doWipe(G, rng, pi, kind, idx) {
  if (G.over || G.turn !== pi) return 'not your turn';
  if (!Array.isArray(idx) || !idx.length || new Set(idx).size !== idx.length || idx.some((i) => !(i >= 0 && i < 4) || G.market.tokens[i] < 0)) return 'bad tokens';
  if (kind === 'free') {
    const o = overpop(G);
    if (!o || G.freeWiped || o.idx.length !== idx.length || !o.idx.every((i) => idx.includes(i))) return 'no free wipe';
    G.freeWiped = true;
  } else {
    if (G.nature[pi] < 1) return 'no pinecone';
    G.nature[pi]--;
  }
  G.wipes++;
  replaceTokens(G, rng, idx);
  settle(G, rng);
  return null;
}
export function placeInfo(board, move, animal) {
  // validates a placement against a board; returns error text or null
  if (!canPlaceTile(board, move.q, move.r)) return 'tile must touch your habitat';
  return null;
}
/** Apply a whole turn. move: {i, j, q, r, rot, tq?, tr?} (token spot optional). Returns {err} or {res}. */
export function doTake(G, rng, pi, move) {
  if (G.over || G.turn !== pi) return { err: 'not your turn' };
  const { i, j } = move;
  if (!(i >= 0 && i < 4 && j >= 0 && j < 4)) return { err: 'bad pick' };
  const tid = G.market.tiles[i], tok = G.market.tokens[j];
  if (tid === null || tid === undefined || tok < 0) return { err: 'empty slot' };
  const spend = i !== j;
  if (spend && G.nature[pi] < 1) return { err: 'no pinecone' };
  const board = boardFromList(G.boards[pi]);
  if (!(move.rot >= 0 && move.rot < 6) || !Number.isInteger(move.q) || !Number.isInteger(move.r)) return { err: 'bad placement' };
  if (!canPlaceTile(board, move.q, move.r)) return { err: 'tile must touch your habitat' };
  let nb = withTile(board, tid, move.q, move.r, move.rot | 0);
  let gained = 0, placedTok = -1, tokAt = null;
  if (move.tq !== undefined && move.tq !== null) {
    const c = nb.cells.get(key(move.tq, move.tr));
    if (!c || c.tok >= 0 || TILE_BY_ID[c.t].slots.indexOf(tok) < 0) return { err: 'token cannot go there' };
    const was = nb.nature;
    nb = withToken(nb, move.tq, move.tr, tok);
    gained = nb.nature - was; placedTok = tok; tokAt = { q: move.tq, r: move.tr };
  }
  if (spend) G.nature[pi]--;
  G.nature[pi] += gained;
  G.boards[pi] = boardToList(nb);
  const placedCell = nb.cells.get(key(move.q, move.r));
  if (placedTok < 0) G.bag[tok]++;
  G.market.tiles[i] = null; G.market.tokens[j] = -1;
  if (G.solo) {
    for (const col of ['tiles', 'tokens']) {
      const arr = G.market[col], empty = col === 'tiles' ? null : -1;
      let far = 3; while (far >= 0 && arr[far] === empty) far--;
      if (far >= 0) { if (col === 'tokens') G.bag[arr[far]]++; arr[far] = empty; }
      const rest = arr.filter((x) => x !== empty);
      while (rest.length < 4) rest.push(empty);
      for (let k = 0; k < 4; k++) arr[k] = rest[k];
    }
  }
  G.turns[pi]++; G.turnNo++;
  const res = { pi, tile: tid, q: move.q, r: move.r, rot: placedCell.rot, tok: placedTok, tokAt, gained, spent: spend ? 1 : 0, i, j };
  G.last[pi] = { q: move.q, r: move.r, tokAt, turn: G.turns[pi] };
  G.freeWiped = false;
  if (G.turnNo >= 20 * G.n) { G.over = true; for (let k = 0; k < 4; k++) { if (G.market.tiles[k] === null && G.stack.length) G.market.tiles[k] = G.stack.pop(); } return { res }; }
  for (let k = 0; k < 4; k++) {
    if (G.market.tiles[k] === null && G.stack.length) G.market.tiles[k] = G.stack.pop();
    if (G.market.tokens[k] < 0) G.market.tokens[k] = drawToken(G, rng);
  }
  settle(G, rng);
  G.turn = (G.turn + 1) % G.n;
  return { res };
}
