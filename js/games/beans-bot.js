// Bean Bazaar — the computer players' brain. Pure functions over what a player may see (Game.view): every bot plays
// with exactly the information a person has. A position is scored as  coins + the field "potential" (bean-o-meter,
// copies still unseen, how much of the game is left) + a small hand term (is the front card plantable?).
// Trades are judged by how much they change that score for me and for the partner.
import { TYPES, coinsFor } from './beans-engine.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rnd = () => Math.random() - 0.5;

const LV = {
  easy: { noise: 0.9, accept: -0.1, props: 1, propP: 0.55, quiet: 3600, minWin: 4500, leader: 0, buy: 0 },
  normal: { noise: 0.3, accept: 0.15, props: 2, propP: 0.9, quiet: 3600, minWin: 4500, leader: 0.12, buy: 1 },
  hard: { noise: 0.06, accept: 0.3, props: 3, propP: 1, quiet: 3200, minWin: 4000, leader: 0.35, buy: 2 },
};
export const lv = (level) => LV[level] || LV.normal;

// ------------------------------------------------------------------ context
function supplyMap(v) {
  const s = {};
  for (const t of v.types) s[t] = TYPES[t].cnt - (v.dcounts[t] || 0);
  const sub = (c) => { if (s[c.t] !== undefined) s[c.t]--; };
  for (const pid of v.order) { const p = v.players[pid]; p.fields.forEach((f) => f.forEach(sub)); p.pending.forEach(sub); p.offered.forEach(sub); }
  v.faceUp.forEach(sub);
  for (const t in s) s[t] = Math.max(0, s[t]);
  return s;
}
export function makeCtx(v, me, level) {
  const passes = v.cfg.passes;
  const h = clamp(((passes - v.exhausted) - 1 + v.deck / Math.max(1, v.total)) / passes, 0, 1);
  return { v, me, level, L: lv(level), sup: supplyMap(v), h, emptyVal: 0.5 * (0.25 + 0.75 * h), cost: v.cfg.cost };
}
function stateOf(X, pid) {
  const p = X.v.players[pid];
  return {
    fields: p.fields.map((cs) => (cs.length ? { t: cs[0].t, n: cs.length } : { t: null, n: 0 })),
    coins: p.coins, bought: p.bought,
    pending: p.pending.map((c) => c.t),
    hand: pid === X.me ? X.v.hand.map((c) => c.t) : null,
  };
}
const copy = (st) => ({ fields: st.fields.map((f) => ({ ...f })), coins: st.coins, bought: st.bought, pending: st.pending, hand: st.hand });

// ------------------------------------------------------------------ valuation
function pot(X, t, n) {
  const cur = coinsFor(t, n);
  let best = cur;
  const sup = X.sup[t] ?? 0;
  for (const [b, c] of TYPES[t].v) {
    if (b <= n) continue;
    const need = b - n;
    const p = Math.min(1, sup / (need * 1.6 + 1)) * Math.max(0, 1 - 0.17 * need) * (0.25 + 0.75 * X.h);
    best = Math.max(best, cur + (c - cur) * p);
  }
  return best;
}
function handTerm(X, st) {
  let s = 0;
  const has = new Set(st.fields.filter((f) => f.n).map((f) => f.t));
  const empty = st.fields.some((f) => !f.n);
  st.hand.forEach((t, i) => {
    const w = i === 0 ? 1 : 0.5 / i;
    s += has.has(t) ? 0.2 * w : empty ? 0.05 * w : -0.4 * w;
  });
  return s;
}
function score(X, st) {
  let s = st.coins;
  for (const f of st.fields) s += f.n ? pot(X, f.t, f.n) : X.emptyVal;
  if (st.hand) s += handTerm(X, st);
  return s;
}
function harvestable(st, f) { const fl = st.fields[f]; return fl.n > 0 && (fl.n > 1 || st.fields.every((x) => x.n <= 1)); }
function bestHarvest(X, st) {
  let best = -1, bl = 1e9;
  st.fields.forEach((f, i) => {
    if (!harvestable(st, i)) return;
    const loss = pot(X, f.t, f.n) - coinsFor(f.t, f.n) + (f.n === 1 ? 0.1 : 0);
    if (loss < bl) { bl = loss; best = i; }
  });
  return { f: best, loss: bl };
}
function canBuyNow(X, st) { return X.cost != null && !st.bought && st.fields.length < 3 && st.coins >= X.cost && !X.v.cfg.duel; }
/** Plant these bean types (matching fields first); when there is no room harvest the cheapest field (or buy one). */
function simPlant(X, st0, types) {
  const st = copy(st0);
  const rest = types.slice().sort((a, b) => (st.fields.some((f) => f.t === a) ? 0 : 1) - (st.fields.some((f) => f.t === b) ? 0 : 1));
  for (const t of rest) {
    let f = st.fields.find((x) => x.t === t && x.n);
    if (f) { f.n++; continue; }
    f = st.fields.find((x) => !x.n);
    if (!f) {
      const hv = bestHarvest(X, st);
      const buy = canBuyNow(X, st) ? X.cost - 0.7 : 1e9;
      if (buy < hv.loss) { st.coins -= X.cost; st.bought = true; st.fields.push({ t: null, n: 0 }); }
      else if (hv.f >= 0) { const hf = st.fields[hv.f]; st.coins += coinsFor(hf.t, hf.n); hf.t = null; hf.n = 0; }
      else continue;
      f = st.fields.find((x) => !x.n);
    }
    f.t = t; f.n = 1;
  }
  return st;
}

/** Score change for ME if I hand over `give` (card objects, from hand or face-up) and receive beans of types `recv`. */
function evalMe(X, give, recv) {
  const v = X.v, st = stateOf(X, X.me), act = v.turn === X.me;
  const base = [...st.pending, ...(act ? v.faceUp.map((c) => c.t) : [])];
  const s0 = score(X, simPlant(X, st, base));
  const gone = new Set(give.map((c) => c.id));
  const st1 = copy(st);
  st1.hand = v.hand.filter((c) => !gone.has(c.id)).map((c) => c.t);
  const kept = act ? v.faceUp.filter((c) => !gone.has(c.id)).map((c) => c.t) : [];
  const s1 = score(X, simPlant(X, st1, [...st.pending, ...kept, ...recv]));
  return s1 - s0;
}
/** Same for another player, whose hand I cannot see (cards they give from hand cost a flat amount). */
function evalOther(X, pid, give, recv, handGive = 0, wantTypes = []) {
  const v = X.v, st = stateOf(X, pid), act = v.turn === pid;
  const base = [...st.pending, ...(act ? v.faceUp.map((c) => c.t) : [])];
  const s0 = score(X, simPlant(X, st, base));
  const gone = new Set(give.map((c) => c.id));
  const kept = act ? v.faceUp.filter((c) => !gone.has(c.id)).map((c) => c.t) : [];
  const s1 = score(X, simPlant(X, st, [...st.pending, ...kept, ...recv]));
  let cost = 0.25 * handGive;
  for (const t of wantTypes) cost += 0.3 + (st.fields.some((f) => f.t === t) ? 0.25 : 0);
  return s1 - s0 - cost;
}

// ------------------------------------------------------------------ picking what to hand over
function myCands(v, me, w) {
  if (w.id !== undefined) return v.turn === me && v.faceUp.some((c) => c.id === w.id) ? [v.faceUp.find((c) => c.id === w.id)] : [];
  const out = [];
  if (v.turn === me) for (const c of v.faceUp) if (c.t === w.t) out.push(c);
  for (const c of v.hand) if (c.t === w.t) out.push(c);
  return out;
}
function bestPick(X, o) {
  const v = X.v, me = X.me;
  const picked = [];
  for (const w of o.want) {
    const need = w.id !== undefined ? 1 : w.n;
    const cs = myCands(v, me, w).filter((c) => !picked.some((p) => p.id === c.id));
    if (cs.length < need) return null;
    const ranked = cs.map((c) => ({ c, d: evalMe(X, [c], []) })).sort((a, b) => b.d - a.d);
    picked.push(...ranked.slice(0, need).map((r) => r.c));
  }
  return picked;
}
/** My view of an offer made to me: {pick, dMe, dThem} or null if I cannot pay. */
export function judgeOffer(X, o) {
  const pick = bestPick(X, o);
  if (!pick) return null;
  const dMe = evalMe(X, pick, o.give.map((c) => c.t));
  const fromHand = o.give.filter((c) => !X.v.faceUp.some((f) => f.id === c.id)).length;
  const dThem = evalOther(X, o.from, o.give, pick.map((c) => c.t), fromHand, []);
  return { pick, dMe, dThem };
}
function wouldAccept(X, j) {
  const L = X.L, v = X.v;
  const noise = rnd() * 2 * L.noise;
  if (X.level === 'easy') return j.dMe + noise > L.accept;
  const rival = Math.max(0, (v.players[X.rivalOf]?.coins || 0) - v.players[X.me].coins);
  const thr = L.accept + L.leader * Math.max(0, j.dThem) * (1 + rival * 0.3);
  return j.dMe + noise > thr;
}

// ------------------------------------------------------------------ decisions
function plantField(st, t) {
  let f = st.fields.findIndex((x) => x.t === t && x.n);
  if (f < 0) f = st.fields.findIndex((x) => !x.n);
  return f;
}
function stuckAction(X, st) {
  const hv = bestHarvest(X, st);
  const buy = canBuyNow(X, st) ? X.cost - 0.7 : 1e9;
  if (buy < hv.loss) return { a: 'buy' };
  return hv.f >= 0 ? { a: 'harvest', f: hv.f } : null;
}
function planOwnPlant(X) {
  const v = X.v, me = X.me, st = stateOf(X, me);
  const front = v.hand[0];
  if (!front) return null;
  const f = plantField(st, front.t);
  if (v.phase === 'plant1') return f >= 0 ? { a: 'plant', f } : stuckAction(X, st);
  // second planting is optional
  if (f < 0) return { a: 'skip' };
  const st1 = copy(st); st1.hand = v.hand.slice(1).map((c) => c.t);
  const after = score(X, simPlant(X, st1, [front.t, ...st.pending]));
  const stay = score(X, simPlant(X, st, st.pending));
  return after - stay + rnd() * 2 * X.L.noise > -0.02 ? { a: 'plant', f } : { a: 'skip' };
}
function planPending(X) {
  const v = X.v, me = X.me, st = stateOf(X, me);
  const P = v.players[me];
  let best = null;
  for (const c of P.pending) {
    const f = plantField(st, c.t);
    if (f < 0) continue;
    const after = copy(st); const fl = after.fields[f]; if (fl.n) fl.n++; else { fl.t = c.t; fl.n = 1; }
    const d = score(X, after);
    if (!best || d > best.d) best = { d, a: 'plant', f, card: c.id };
  }
  if (best) return { a: 'plant', f: best.f, card: best.card };
  return stuckAction(X, st);
}
/** Cash a field in when waiting for more beans no longer pays (frees a field and banks the coins). */
function planCash(X, memo) {
  const v = X.v, me = X.me, st = stateOf(X, me);
  if (v.cfg.duel && v.turn !== me) return null;
  let best = null;
  st.fields.forEach((f, i) => {
    if (!f.n || !harvestable(st, i)) return;
    const coins = coinsFor(f.t, f.n);
    if (coins <= 0) return;
    const gain = X.emptyVal * (f.n === 1 ? 0.5 : 1) + 0.12 - (pot(X, f.t, f.n) - coins) + (X.level === 'easy' ? rnd() * 0.5 : 0);
    if (gain > 0 && (!best || gain > best.gain)) best = { gain, a: 'harvest', f: i };
  });
  if (best) return { a: 'harvest', f: best.f };
  if (X.L.buy && canBuyNow(X, st) && X.h > 0.3 && (X.L.buy > 1 || st.coins > X.cost)) return { a: 'buy' };
  return null;
}

// ------------------------------------------------------------------ trading
function dumpCards(X) {
  // my hand cards ordered by how little I would miss them
  const v = X.v;
  return v.hand.map((c) => ({ c, d: evalMe(X, [c], []) })).sort((a, b) => b.d - a.d).slice(0, 5).map((r) => r.c);
}
function pairs(arr) { const out = arr.map((c) => [c]); for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (arr[i].t === arr[j].t) out.push([arr[i], arr[j]]); return out; }

function buildQueue(X) {
  const v = X.v, me = X.me, L = X.L;
  const q = [];
  const others = v.order.filter((id) => id !== me && !v.players[id].left);
  const act = v.turn === me;
  if (act) {
    const givers = pairs([...v.faceUp, ...dumpCards(X).slice(0, 3)]);
    const wants = [null, ...v.types.map((t) => ({ t, n: 1 }))];
    for (const g of givers) for (const w of wants) {
      const n = w ? (g.length === 2 && g[0].t === g[1].t ? 2 : 1) : 0;
      const recv = w ? Array(n).fill(w.t) : [];
      const dMe = evalMe(X, g, recv);
      if (dMe < Math.max(0.25, L.accept + 0.1)) continue;
      let bestP = null;
      for (const p of others) {
        if (w && v.players[p].hand < n) continue;
        const dP = evalOtherGive(X, p, g, recv);
        if (L.noise < 0.5 && dP < -0.05) continue;
        const sc = dMe + 0.7 * Math.min(dP, 2);
        if (!bestP || sc > bestP.sc) bestP = { p, sc, dP };
      }
      if (bestP) q.push({ to: bestP.p, give: g.map((c) => c.id), want: w ? [{ t: w.t, n }] : [], sc: bestP.sc });
    }
  } else {
    const a = v.turn;
    if (v.players[a].left) return q;
    const dump = dumpCards(X);
    for (const fc of v.faceUp) {
      for (const g of pairs(dump)) {
        const dMe = evalMe(X, g, [fc.t]);
        if (dMe < Math.max(0.25, L.accept + 0.1)) continue;
        const dA = evalOtherGive(X, a, [fc], g.map((c) => c.t), true);
        if (L.noise < 0.5 && dA < -0.05) continue;
        q.push({ to: a, give: g.map((c) => c.id), want: [{ id: fc.id }], sc: dMe + 0.7 * Math.min(dA, 2) });
      }
    }
  }
  // best first, at most one per partner and give set
  q.sort((x, y) => y.sc - x.sc);
  const seen = new Set(), out = [];
  for (const o of q) {
    const key = o.to + ':' + o.give.join(',');
    const pk = o.to + ':' + o.want.map((w) => w.id ?? w.t).join(',');
    if (seen.has(key) || seen.has(pk)) continue;
    seen.add(key); seen.add(pk); out.push(o);
  }
  return out;
}
/** Partner's score change when it receives `give` cards (known) and hands back cards of types `back` (from hand unless `known`). */
function evalOtherGive(X, pid, give, back, known = false) {
  const v = X.v, st = stateOf(X, pid), act = v.turn === pid;
  const base = [...st.pending, ...(act ? v.faceUp.map((c) => c.t) : [])];
  const s0 = score(X, simPlant(X, st, base));
  const gone = new Set(give.map((c) => c.id));
  const keptFace = act ? v.faceUp.filter((c) => !gone.has(c.id)).map((c) => c.t) : [];
  const recv = act ? give.filter((c) => !v.faceUp.some((f) => f.id === c.id)).map((c) => c.t) : give.map((c) => c.t);
  const s1 = score(X, simPlant(X, st, [...st.pending, ...keptFace, ...recv, ...(act ? back : [])]));
  let cost = 0;
  if (!act || !known) for (const t of back) cost += 0.3 + (st.fields.some((f) => f.t === t) ? 0.25 : 0);
  return s1 - s0 - (act ? cost * 0.5 : cost);
}

function planTrade(X, memo, now) {
  const v = X.v, me = X.me, L = X.L, act = v.turn === me;
  if (memo.turn !== v.turnNo) Object.assign(memo, { turn: v.turnNo, handled: new Set(), sent: 0, startAt: now, queue: null, sig: '', sentKeys: new Set(), rivalAt: 0 });
  // rival = the strongest opponent (used for "do not help the leader")
  X.rivalOf = v.order.filter((id) => id !== me).sort((a, b) => v.players[b].coins - v.players[a].coins)[0];
  // 1. answer offers made to me
  for (const o of v.offers) {
    if (o.from === me || memo.handled.has(o.id)) continue;
    if (o.to !== me && o.to !== 'all') continue;
    memo.handled.add(o.id);
    const j = judgeOffer(X, o);
    if (j && wouldAccept(X, j)) return { a: 'accept', id: o.id, pick: j.pick.map((c) => c.id), ms: 900 };
    return { a: 'cancel', id: o.id, ms: 700 };
  }
  // 2. make offers
  const sig = v.faceUp.map((c) => c.id).join() + '|' + v.hand.map((c) => c.id).join();
  if (memo.sig !== sig) { memo.sig = sig; memo.queue = null; }
  const mine = v.offers.filter((o) => o.from === me);
  const age = now - memo.startAt;
  if (mine.length < 3 && memo.sent < L.props && age > (act ? 1400 : 2200 + Math.random() * 1800) && Math.random() < L.propP) {
    if (!memo.queue) memo.queue = buildQueue(X);
    while (memo.queue.length) {
      const o = memo.queue.shift();
      const key = o.to + ':' + o.give.join(',') + ':' + o.want.map((w) => w.id ?? w.t).join(',');
      if (memo.sentKeys.has(key)) continue;
      if (!o.give.every((id) => v.hand.some((c) => c.id === id) || (act && v.faceUp.some((c) => c.id === id)))) continue;
      if (o.want.some((w) => w.id !== undefined && !v.faceUp.some((c) => c.id === w.id))) continue;
      memo.sentKeys.add(key); memo.sent++;
      return { a: 'offer', to: o.to, give: o.give, want: o.want, ms: 1100 };
    }
  }
  return null; // the active bot closes the window by itself (see closeAt)
}

/** When the active bot will call time on trading (ms epoch) — also shown to people as a countdown. */
export function closeAt(v, me, level, memo, hasHumans, tradeAt) {
  const L = lv(level);
  const start = memo.startAt || tradeAt || Date.now();
  const t1 = start + (hasHumans ? L.minWin + 3500 : 1800);
  const t2 = (tradeAt || start) + (hasHumans ? L.quiet + 1200 : 1500);
  return Math.max(t1, t2);
}
function waitingOnMe(v, me) { return v.offers.some((o) => (o.to === me || o.to === 'all') && o.from !== me); }

// ------------------------------------------------------------------ duel (2 players)
function planDuel(X) {
  const v = X.v, me = X.me, st = stateOf(X, me), P = v.players[me];
  if (v.phase === 'offered') {
    let best = null;
    for (const c of P.offered) {
      const f = plantField(st, c.t);
      if (f < 0) { const alt = bestHarvest(X, st); const gain = pot(X, c.t, 1) - alt.loss; best = best && best.gain > gain ? best : { gain, a: gain > 0.4 && alt.f >= 0 ? 'harvest' : 'discard', f: alt.f, card: c.id }; continue; }
      const after = copy(st); const fl = after.fields[f]; if (fl.n) fl.n++; else { fl.t = c.t; fl.n = 1; }
      const d = score(X, after) - score(X, st);
      if (d >= -0.05) return { a: 'plant', f, card: c.id };
      if (!best || d > best.gain) best = { gain: d, a: 'discard', card: c.id };
    }
    if (!best) return null;
    return best.a === 'harvest' ? { a: 'harvest', f: best.f } : { a: 'discard', card: best.card };
  }
  if (v.phase === 'discard') {
    const worst = v.hand.map((c) => ({ c, d: evalMe(X, [c], []) })).sort((a, b) => b.d - a.d)[0];
    if (worst && worst.d > 0.15) return { a: 'discard', card: worst.c.id };
    return { a: 'skip' };
  }
  if (v.phase === 'draw3') {
    let best = null;
    for (const c of v.faceUp) {
      const f = plantField(st, c.t);
      if (f < 0) continue;
      const after = copy(st); const fl = after.fields[f]; if (fl.n) fl.n++; else { fl.t = c.t; fl.n = 1; }
      const d = score(X, after) - score(X, st);
      if (d > 0.1 && (!best || d > best.d)) best = { d, f, card: c.id };
    }
    if (best) return { a: 'plant', f: best.f, card: best.card };
    return { a: 'skip' };
  }
  return null;
}

// ------------------------------------------------------------------ entry point
/** Next action for bot `me`, or null. Returns {a, ..., ms?}. */
export function plan(v, me, memo, level, now = Date.now()) {
  if (v.over || v.players[me].left) return null;
  const X = makeCtx(v, me, level);
  X.rivalOf = v.order.filter((id) => id !== me)[0];
  const P = v.players[me], act = v.turn === me;
  let a = null;
  if (v.cfg.duel && act && ['offered', 'discard', 'draw3'].includes(v.phase)) a = planDuel(X);
  else if (v.phase === 'plant3' && P.pending.length) a = planPending(X);
  else if (act && (v.phase === 'plant1' || v.phase === 'plant2')) a = planOwnPlant(X);
  else if (v.phase === 'trade' && !v.cfg.duel) a = planTrade(X, memo, now);
  if (!a && v.phase !== 'over' && !(act && ['plant1', 'plant2', 'offered', 'discard', 'draw3'].includes(v.phase))) a = planCash(X, memo);
  return a;
}
export { waitingOnMe };

/** The next thing any computer player wants to do right now: {id, m} or null. Shared by the host and the headless tests. */
export function nextBotAction(g, bots, memos, level, hasHumans, now = Date.now()) {
  for (const id of bots) {
    if (g.left.has(id) || g.over) continue;
    const v = g.view(id);
    const memo = (memos[id] = memos[id] || {});
    let a = plan(v, id, memo, level, now);
    if (!a && v.phase === 'trade' && v.turn === id && memo.turn === v.turnNo && now >= closeAt(v, id, level, memo, hasHumans, g.tradeAt) && !waitingOnMe(v, id)) a = { a: 'endtrade' };
    if (a) { const { ms, ...m } = a; return { id, m, ms }; }
  }
  return null;
}
