// Computer players for the court game. A Brain only ever sees what a person at the table sees: the public state, its own
// cards and the public event stream. Easy brains bluff and challenge at random; normal brains count the cards still unseen;
// hard brains also remember every claim, notice who bluffs, weigh the stakes and bluff selectively.
import { ROLES, ACTIONS, copiesFor, rolesInPlay, blockRoles } from './coup-engine.js';

export const PERSONALITIES = [
  { name: 'Reckless', bluff: 1.5, aggro: 1.35, caution: 0.7, think: 0.8 },
  { name: 'Cautious', bluff: 0.55, aggro: 0.8, caution: 1.4, think: 1.15 },
  { name: 'Schemer', bluff: 1.25, aggro: 1.0, caution: 1.0, think: 1.3 },
  { name: 'Hawk', bluff: 0.9, aggro: 1.5, caution: 0.9, think: 0.9 },
  { name: 'Steady', bluff: 1.0, aggro: 1.0, caution: 1.0, think: 1.0 },
  { name: 'Gambler', bluff: 1.4, aggro: 1.1, caution: 0.6, think: 0.7 },
];

const INF = 4.5; // what one influence card is worth, in coins
const BASE_VAL = { duchess: 3.2, shade: 3.1, corsair: 2.6, warden: 2.7, envoy: 2.0, oracle: 2.3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Brain {
  constructor(id, level, traits, rng = Math.random) {
    this.id = id; this.level = level; this.t = traits; this.rnd = rng;
    this.w = {}; // w[opponent][role]: how much a claim made us believe they hold it
    this.rate = {}; // rate[opponent]: how often they challenge
    this.hostile = {};
    this.claimsOf = {};
  }
  get hard() { return this.level === 'hard'; }
  get easy() { return this.level === 'easy'; }
  r() { return this.rnd(); }

  // ------------------------------------------------------------ memory (public events only)
  W(o) { return (this.w[o] = this.w[o] || {}); }
  R(o) { return (this.rate[o] = this.rate[o] || { c: 0, n: 0 }); }
  observe(e) {
    const mult = this.hard ? 2.6 : 1.5;
    switch (e.t) {
      case 'declare':
        if (e.claim && !e.inverse) { const w = this.W(e.who); w[e.claim] = (w[e.claim] || 1) * mult; this.noteClaim(e.who, e.claim, e.who); }
        if (e.target === this.id && (e.act === 'assassinate' || e.act === 'steal' || e.act === 'coup')) this.hostile[e.who] = (this.hostile[e.who] || 0) + 1;
        break;
      case 'block': { const w = this.W(e.who); w[e.role] = (w[e.role] || 1) * mult; this.noteClaim(e.who, e.role, e.who); break; }
      case 'challenge': this.R(e.by).c++; break;
      case 'reveal': if (e.role) { const w = this.W(e.who); w[e.role] = e.proved ? 1 : 0.4; } break;
      case 'lose': { const w = this.W(e.who); w[e.role] = 1; break; }
      case 'exchanged': case 'examined': { const o = e.who === this.id ? e.target : e.who; if (o) { const w = this.W(o); for (const k of Object.keys(w)) w[k] = Math.pow(w[k], 0.55); } break; }
      default:
    }
  }
  noteClaim(who, role, claimant) { // every claim is a chance for the others to challenge
    for (const o of Object.keys(this.rate)) if (o !== claimant) this.rate[o].n++;
    this.R(who); this.claimsOf[who] = (this.claimsOf[who] || 0) + 1;
    for (const k of Object.keys(this.rate)) if (!this.rate[k].init) { this.rate[k].init = 1; }
  }
  /** Chance that `o` challenges a given claim (their history, smoothed). */
  chRate(o) {
    if (this.easy) return 0.12;
    const r = this.R(o);
    return clamp((r.c + 1.2) / (r.n + 5.5), 0.05, 0.6);
  }

  // ------------------------------------------------------------ beliefs
  unseen(pub, priv) {
    const per = copiesFor(pub.players.length), u = {};
    for (const r of rolesInPlay(pub.opts)) u[r] = per;
    for (const p of pub.players) for (const r of p.dead) u[r]--;
    for (const c of priv.cards) if (!c.dead) u[c.r]--;
    let total = 0; for (const r in u) { u[r] = Math.max(0, u[r]); total += u[r]; }
    return { u, total };
  }
  pHold(pub, priv, o, role, un = this.unseen(pub, priv)) {
    const P = pub.players.find((p) => p.id === o);
    if (!P || !P.alive) return 0;
    const k = P.hidden, u = un.u[role] || 0;
    if (!u) return 0;
    let none = 1;
    for (let i = 0; i < k; i++) none *= 1 - u / Math.max(1, un.total - i);
    const base = 1 - none;
    if (this.easy) return base;
    const w = Math.min(this.hard ? 6 : 1.8, (this.W(o)[role] || 1));
    const odds = (base / Math.max(1e-6, 1 - base)) * w;
    return clamp(odds / (1 + odds), 0, 0.985);
  }
  me(pub) { return pub.players.find((p) => p.id === this.id); }
  myRoles(priv) { return priv.cards.filter((c) => !c.dead).map((c) => c.r); }
  foes(pub) { return pub.players.filter((p) => p.alive && p.id !== this.id); }

  // ------------------------------------------------------------ own turn
  chooseAction(pub, priv, legal) {
    const me = this.me(pub), ok = legal.filter((a) => a.ok);
    const forced = me.coins >= 10;
    const mine = this.myRoles(priv), un = this.unseen(pub, priv);
    const has = (r) => mine.includes(r);
    if (this.easy) return this.easyAction(pub, priv, ok, me, forced, has);
    const foes = this.foes(pub);
    // how likely is a bluff to be called, and how likely are blocks?
    const noise = () => (this.r() - 0.5) * (this.level === 'normal' ? 1.6 : 0.5);
    const pCall = (role) => {
      let q = 1;
      for (const f of foes) {
        let c = this.chRate(f.id);
        const seen = pub.players.reduce((a, p) => a + p.dead.filter((x) => x === role).length, 0);
        c *= 1 + seen * 0.5; // the more copies are gone, the more suspicious
        const mc = this.claimsOf[this.id] || 0; void mc;
        q *= 1 - clamp(c, 0.03, 0.85);
      }
      return 1 - q;
    };
    const pBlk = (f, type) => {
      const def = ACTIONS[type];
      const roles = blockRoles(type, pub.opts);
      let none = 1;
      const hold = Math.max(...roles.map((r) => this.pHold(pub, priv, f.id, r, un)));
      none = 1 - clamp(hold * 0.92 + (this.hard ? 0.04 : 0.1), 0, 0.97);
      if (def.blockBy === 'any') return null;
      return 1 - none;
    };
    const blockAny = () => { // foreign aid: anyone may block it
      let none = 1;
      for (const f of foes) none *= 1 - clamp(this.pHold(pub, priv, f.id, 'duchess', un) * 0.9 + 0.05, 0, 0.95);
      return 1 - none;
    };
    const threat = (f, kind) => {
      let s = f.coins * 0.55 + (f.hidden === 1 ? (kind === 'coup' ? 1.5 : 2.2) : 0);
      s += (this.hostile[f.id] || 0) * 1.1;
      s += (this.claimsOf[f.id] || 0) * 0.15;
      if (kind === 'coup') s += f.coins >= 6 ? 2 : 0;
      return s + this.r() * (this.hard ? 0.6 : 2.4);
    };
    const cands = [];
    const push = (a, score) => cands.push({ a, score });
    for (const L of ok) {
      const t = L.type;
      if (t === 'income') push({ type: t }, 1.0 + (me.coins >= 8 ? 0.8 : 0));
      else if (t === 'aid') push({ type: t }, 2 * (1 - blockAny()) + 0.05);
      else if (t === 'coup') {
        const best = L.targets.map((id) => pub.players.find((p) => p.id === id)).sort((a, b) => threat(b, 'coup') - threat(a, 'coup'))[0];
        const must = forced || me.coins >= 8;
        push({ type: t, target: best.id }, must ? 99 : 3.2 + 0.7 * this.t.aggro + (me.coins >= 7 ? 0.6 : 0) + noise());
      } else if (t === 'tax') {
        const bluff = !has('duchess');
        const pc = pCall('duchess');
        push({ type: t }, bluff ? (3 * (1 - pc) - pc * INF * 0.9 + 0.6 * (this.t.bluff - 1) + 0.8) : (3 + pc * 2 + 0.3), bluff);
      } else if (t === 'assassinate') {
        const bluff = !has('shade');
        const pc = pCall('shade');
        const opts = L.targets.map((id) => pub.players.find((p) => p.id === id)).map((f) => {
          const pb = pBlk(f, 'assassinate');
          const kill = INF * (1 - pb) + (f.hidden === 1 ? 2.2 * (1 - pb) : 0);
          const s = kill - 3 + threat(f, 'as') * 0.2 + (bluff ? -pc * (INF + 3) * 0.8 + 0.5 * (this.t.bluff - 1) : pc * 2.5) + 0.7 * (this.t.aggro - 1) + 1.6;
          return { f, s };
        }).sort((a, b) => b.s - a.s)[0];
        push({ type: t, target: opts.f.id }, opts.s + noise(), bluff);
      } else if (t === 'steal') {
        const bluff = !has('corsair');
        const pc = pCall('corsair');
        const opts = L.targets.map((id) => pub.players.find((p) => p.id === id)).map((f) => {
          const pb = pBlk(f, 'steal'), amt = Math.min(2, f.coins);
          const s = amt * (1 - pb) * (bluff ? 1 - pc : 1) + (bluff ? -pc * INF * 0.9 + 0.6 * (this.t.bluff - 1) : pc * 1.5) + 0.5 + (this.hostile[f.id] || 0) * 0.4 + 0.2 * (this.t.aggro - 1);
          return { f, s };
        }).sort((a, b) => b.s - a.s)[0];
        push({ type: t, target: opts.f.id }, opts.s + noise(), bluff);
      } else if (t === 'exchange' || t === 'swap') {
        const role = t === 'exchange' ? 'envoy' : 'oracle';
        const bluff = !has(role), pc = pCall(role);
        const want = mine.length === 2 && BASE_VAL[mine[0]] + BASE_VAL[mine[1]] < 5.2 ? 1.6 : 0.5;
        push({ type: t }, want + 0.6 - (bluff ? pc * INF * 0.9 - 0.4 * (this.t.bluff - 1) : 0) + noise() * 0.5, bluff);
      } else if (t === 'examine') {
        const bluff = !has('oracle'), pc = pCall('oracle');
        const f = L.targets.map((id) => pub.players.find((p) => p.id === id)).sort((a, b) => threat(b, 'ex') - threat(a, 'ex'))[0];
        push({ type: t, target: f.id }, 1.4 - (bluff ? pc * INF * 0.9 - 0.4 * (this.t.bluff - 1) : -0.5) + noise());
      } else if (t === 'convert') {
        // team game: convert a rival who is about to threaten us, or flip ourselves rarely
        const foesT = L.targets.map((id) => pub.players.find((p) => p.id === id));
        const me2 = pub.players.find((p) => p.id === this.id);
        const best = foesT.filter((f) => f.id !== this.id && f.team !== me2.team).sort((a, b) => b.coins - a.coins)[0];
        if (best && me.coins >= 3 && pub.reserve < 4) push({ type: t, target: best.id }, 1.2 + noise());
      } else if (t === 'embezzle') {
        const holdD = has('duchess');
        const pc = pCall('duchess');
        if (!holdD) push({ type: t }, pub.reserve * (1 - pc * 0.6) * 0.9 - 0.5);
      }
    }
    // bluff-selection: normal bots pick the best score, hard bots too but only gamble when behind
    cands.sort((a, b) => b.score - a.score);
    const top = cands.slice(0, 3);
    const pick = this.level === 'hard' ? (this.r() < 0.9 ? top[0] : top[1] || top[0]) : (this.r() < 0.72 ? top[0] : top[Math.floor(this.r() * top.length)]);
    return pick.a;
  }
  easyAction(pub, priv, ok, me, forced, has) {
    const pickT = (L) => { const t = L.targets; return t[Math.floor(this.r() * t.length)]; };
    if (forced || (me.coins >= 7 && this.r() < 0.7)) { const c = ok.find((x) => x.type === 'coup'); if (c) return { type: 'coup', target: pickT(c) }; }
    const choices = ok.filter((x) => x.type !== 'coup' || me.coins >= 7);
    const weights = choices.map((L) => ({ income: 2, aid: 2.2, tax: 2.2, assassinate: 1.8, steal: 1.8, exchange: 1.2, swap: 1.2, examine: 1.2, coup: 3, convert: 0.3, embezzle: 0.5 }[L.type] || 1) * (L.type !== 'income' && L.type !== 'aid' && L.type !== 'coup' && this.r() < 0.25 ? 0 : 1));
    let tot = weights.reduce((a, b) => a + b, 0), x = this.r() * (tot || 1);
    let pick = choices[0];
    for (let i = 0; i < choices.length; i++) { x -= weights[i]; if (x <= 0) { pick = choices[i]; break; } }
    return { type: pick.type, target: pick.targets ? pickT(pick) : undefined };
  }

  // ------------------------------------------------------------ responding to a claim, a block, or a foreign aid
  respond(pub, priv) {
    const w = pub.win, e = w.elig[this.id];
    const mine = this.myRoles(priv), me = this.me(pub), un = this.unseen(pub, priv);
    const cards = mine.length;
    const act = pub.act;
    const noise = (this.r() - 0.5) * (this.easy ? 3 : this.level === 'normal' ? 1.5 : 0.5);
    let claimant, role, preventValue = 0, inverse = false;
    if (w.kind === 'block') { claimant = pub.blk.by; role = pub.blk.role; if (act.actor === this.id) preventValue = this.actVal(act); }
    else if (act.claim) {
      claimant = act.actor; role = act.claim;
      if (act.type === 'embezzle') { inverse = true; }
      if (act.target === this.id) preventValue = act.type === 'assassinate' ? INF * 0.9 : act.type === 'steal' ? 1.6 : act.type === 'examine' ? 0.6 : 0;
      else preventValue = act.type === 'tax' ? 1.2 : act.type === 'embezzle' ? 0.8 : 0.2;
    }
    const cl = pub.players.find((p) => p.id === claimant);
    // ---- challenge?
    if (e.ch && cl) {
      let pB;
      if (inverse) pB = this.pHold(pub, priv, claimant, 'duchess', un) * 0.9 + 0.02; // claim: "I hold no Duchess"
      else pB = 1 - this.pHold(pub, priv, claimant, role, un);
      if (this.easy) pB = clamp(pB * 0.6 + 0.2, 0, 1);
      const certain = !inverse && !this.easy && (un.u[role] || 0) === 0;
      const succ = INF + (cl.hidden === 1 ? 3 : 0) + preventValue;
      const fail = INF + (cards === 1 ? 4.5 : 0);
      const ev = pB * succ - (1 - pB) * fail;
      let go = certain || ev > (this.easy ? 99 : (this.hard ? 2.1 : 2.8) * this.t.caution) - noise;
      if (this.easy) go = certain ? false : this.r() < 0.07 + (pB > 0.85 ? 0.25 : 0);
      if (!this.easy && certain) go = true;
      if (go) return { r: 'challenge' };
    }
    // ---- block?
    if (e.bl.length) {
      const held = e.bl.filter((r) => mine.includes(r));
      if (held.length) return { r: 'block', role: held[Math.floor(this.r() * held.length)] };
      // bluff-block: worth it when what we would lose is bigger than what a caught bluff costs
      const type = act.type;
      let value = 0, pcall;
      const actor = pub.players.find((p) => p.id === act.actor);
      const rolesB = e.bl;
      pcall = 1;
      for (const f of pub.players.filter((p) => p.alive && p.id !== this.id)) {
        const hold = Math.max(...rolesB.map((r) => this.pHold(pub, priv, this.id === f.id ? '' : f.id, r, un) * 0 + 0));
        void hold;
      }
      // chance somebody calls the bluff (the actor has the most reason to)
      let q = 1 - clamp(this.chRate(act.actor) + 0.18 + (type === 'assassinate' ? 0.15 : 0), 0, 0.9);
      for (const f of pub.players.filter((p) => p.alive && p.id !== this.id && p.id !== act.actor)) q *= 1 - this.chRate(f.id) * 0.5;
      pcall = 1 - q;
      if (rolesB.some((r) => (un.u[r] || 0) === 0 && !this.easy)) pcall = Math.max(pcall, 0.9); // every copy is accounted for
      if (type === 'assassinate') {
        const lossIfAllowed = INF + (cards === 1 ? 4.5 : 0);
        const lossIfCaught = INF + (cards === 1 ? 4.5 : INF + 2); // lose the challenge card, then the assassination
        const lossBluff = pcall * lossIfCaught;
        value = lossIfAllowed - lossBluff;
        void actor;
      } else if (type === 'steal') {
        const amt = Math.min(2, me.coins);
        value = amt - pcall * (INF * 0.9 + (cards === 1 ? 3 : 0)) + 0.6 * (this.t.bluff - 1);
        if (me.coins === 0) value = -9;
      } else if (type === 'aid') {
        value = 0.9 + (actor?.coins >= 6 ? 1.4 : 0) - pcall * INF * 0.9 * 0.35 + 0.7 * (this.t.bluff - 1);
        value -= this.hard ? 0.4 : 0;
        if (act.actor === this.id) value = -9;
      }
      if (this.easy) { value = type === 'assassinate' ? (this.r() < 0.5 ? 1 : -1) : this.r() < 0.12 ? 1 : -1; }
      if (value + noise * 0.5 > 0) return { r: 'block', role: rolesB[Math.floor(this.r() * rolesB.length)] };
    }
    return { r: 'allow' };
  }
  actVal(act) { return act.type === 'assassinate' ? INF : act.type === 'steal' ? 2 : act.type === 'aid' ? 2 : 1; }

  // ------------------------------------------------------------ card choices
  roleValue(pub, role, mine, i) {
    let v = BASE_VAL[role] || 2;
    if (mine.indexOf(role) !== i && mine.includes(role)) v *= 0.6; // a duplicate is worth less
    // against assassins a Warden matters more; with plenty of coin a Shade matters
    if (role === 'warden') v += pub.players.some((p) => p.alive && p.id !== this.id && (this.W(p.id).shade || 1) > 1.5) ? 0.6 : 0;
    return v;
  }
  chooseLose(pub, priv) {
    const live = priv.cards.map((c, i) => ({ c, i })).filter((x) => !x.c.dead);
    if (this.easy) return live[Math.floor(this.r() * live.length)].i;
    const mine = live.map((x) => x.c.r);
    const sc = live.map((x, k) => ({ i: x.i, v: this.roleValue(pub, x.c.r, mine, k) + this.r() * 0.2 }));
    sc.sort((a, b) => a.v - b.v);
    return sc[0].i;
  }
  chooseExchange(pub, priv) {
    const pool = priv.pool, keep = priv.keep;
    const idx = pool.map((_, i) => i);
    if (this.easy) { for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, keep); }
    let best = null;
    const combos = keep === 1 ? idx.map((i) => [i]) : idx.flatMap((a) => idx.filter((b) => b > a).map((b) => [a, b]));
    for (const c of combos) {
      const rs = c.map((i) => pool[i]);
      const v = rs.reduce((s, r, k) => s + this.roleValue(pub, r, rs, k), 0) + this.r() * 0.15;
      if (!best || v > best.v) best = { c, v };
    }
    return best.c;
  }
  chooseExamine(pub, priv) { // show the card we would mind losing least
    return this.chooseLose(pub, priv);
  }
  examineVerdict(pub, priv, role) { // force a swap when the card we saw is better than an average unseen one
    if (this.easy) return this.r() < 0.5;
    const un = this.unseen(pub, priv);
    let avg = 0, tot = 0; for (const r in un.u) { avg += un.u[r] * (BASE_VAL[r] || 2); tot += un.u[r]; }
    avg = tot ? avg / tot : 2.5;
    return (BASE_VAL[role] || 2) > avg + 0.15 + (this.r() - 0.5) * 0.4;
  }
}

/** A little thinking time, in ms, that depends on the situation and the player's character. */
export function thinkTime(level, traits, kind) {
  const k = (level === 'easy' ? 1.25 : level === 'hard' ? 0.85 : 1) * (traits?.think || 1);
  const base = { act: [900, 1500], resp: [500, 2600], pick: [700, 1200], quick: [300, 800] }[kind] || [700, 1000];
  return Math.round((base[0] + Math.random() * base[1]) * k);
}
export { ROLES };
