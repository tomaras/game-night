// Court bluffing rules engine (pure logic, no DOM) — the host runs this; clients only see `publicState` + their own cards.
// A turn: the active player names an action; character actions are claims (true or not). Anyone may challenge a claim;
// some actions can be blocked, and the block is itself a claim that anyone may challenge. Lose both influence cards and you are out.
//
// Flow control is a tiny continuation machine: every function runs until it needs a decision from a player, parks in
// S.wait (who / what) with S.cont, and the matching input function resumes it. Events (S.events) describe what happened,
// for the log and for the animations; `d` is a suggested display time in ms.

export const ROLES = {
  duchess: { id: 'duchess', name: 'Duchess', short: 'D', color: '#A142F4', power: 'Tax: take 3 coins.', blocks: 'Blocks Foreign Aid.' },
  shade: { id: 'shade', name: 'Shade', short: 'S', color: '#EA4335', power: 'Assassinate: pay 3 coins, a rival loses an influence.', blocks: '' },
  corsair: { id: 'corsair', name: 'Corsair', short: 'C', color: '#4285F4', power: 'Steal: take 2 coins from a rival.', blocks: 'Blocks stealing.' },
  envoy: { id: 'envoy', name: 'Envoy', short: 'E', color: '#34A853', power: 'Exchange: draw 2 court cards, keep what you like.', blocks: 'Blocks stealing.' },
  warden: { id: 'warden', name: 'Warden', short: 'W', color: '#F9AB00', power: '', blocks: 'Blocks assassination.' },
  oracle: { id: 'oracle', name: 'Oracle', short: 'O', color: '#12B5CB', power: 'Swap one court card, or examine a rival’s card.', blocks: 'Blocks stealing.' },
};
export const ROLE_ORDER = ['duchess', 'shade', 'corsair', 'envoy', 'warden', 'oracle'];

/** Action table. claim: the role you claim; block: roles that can block (blockBy: 'any' | 'target'). */
export const ACTIONS = {
  income: { name: 'Income', gen: true },
  aid: { name: 'Foreign Aid', gen: true, block: ['duchess'], blockBy: 'any' },
  coup: { name: 'Coup', gen: true, cost: 7, target: true },
  tax: { name: 'Tax', claim: 'duchess' },
  assassinate: { name: 'Assassinate', claim: 'shade', cost: 3, target: true, block: ['warden'], blockBy: 'target' },
  steal: { name: 'Steal', claim: 'corsair', target: true, block: ['corsair', 'envoy'], blockBy: 'target' },
  exchange: { name: 'Exchange', claim: 'envoy' },
  swap: { name: 'Swap', claim: 'oracle' },
  examine: { name: 'Examine', claim: 'oracle', target: true },
  convert: { name: 'Convert', target: true, rf: true },
  embezzle: { name: 'Embezzle', claim: 'duchess', inverse: true, rf: true },
};

const rngNext = (rng) => (typeof rng === 'function' ? rng() : rng.next());
export function shuffleIn(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rngNext(rng) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export const copiesFor = (n) => (n <= 6 ? 3 : n <= 8 ? 4 : 5);
export const rolesInPlay = (opts = {}) => ['duchess', 'shade', 'corsair', opts.oracle ? 'oracle' : 'envoy', 'warden'];
export const blockRoles = (actionType, opts = {}) => {
  const d = ACTIONS[actionType];
  if (!d?.block) return [];
  return d.block.map((r) => (r === 'envoy' && opts.oracle ? 'oracle' : r));
};

export function newGame(ids, opts = {}, rng = Math.random) {
  const N = ids.length;
  const deck = [];
  for (const r of rolesInPlay(opts)) for (let k = 0; k < copiesFor(N); k++) deck.push(r);
  shuffleIn(deck, rng);
  const first = opts.first != null ? opts.first : Math.floor(rngNext(rng) * N);
  const S = {
    opts: { oracle: !!opts.oracle, teams: !!opts.teams },
    rng, deck, reserve: 0, cur: first, first, phase: 'turn', winner: null, winners: null,
    players: ids.map((id, i) => ({ id, coins: 2, alive: true, left: false, team: opts.teams ? ((i - first + N) % N) % 2 : 0, cards: [{ r: deck.pop(), dead: false }, { r: deck.pop(), dead: false }] })),
    claims: {}, events: [], act: null, blk: null, win: null, wait: null, cont: null, round: 1, winId: 0,
  };
  if (N === 2) S.players[first].coins = 1;
  for (const p of S.players) S.claims[p.id] = {};
  startTurn(S);
  return S;
}

// ---------------------------------------------------------------- helpers
export const P = (S, id) => S.players.find((p) => p.id === id);
const ev = (S, e, d = 0) => { S.events.push({ ...e, d }); };
export const alive = (S) => S.players.filter((p) => p.alive);
export const liveCards = (p) => p.cards.filter((c) => !c.dead);
export const holds = (p, role) => p.cards.some((c) => !c.dead && c.r === role);
export const allSameTeam = (S) => { const a = alive(S); return a.every((p) => p.team === a[0].team); };
export function canTarget(S, aId, bId) {
  const a = P(S, aId), b = P(S, bId);
  if (!a || !b || !b.alive || aId === bId) return false;
  if (S.opts.teams && a.team === b.team && !allSameTeam(S)) return false;
  return true;
}
const claimNote = (S, id, role, key) => { const c = (S.claims[id] = S.claims[id] || {}); const e = (c[role] = c[role] || { n: 0, ok: 0, bad: 0 }); e[key]++; };

function nextCur(S) {
  const N = S.players.length;
  for (let i = 1; i <= N; i++) { const p = S.players[(S.cur + i) % N]; if (p.alive) { S.cur = (S.cur + i) % N; return; } }
}
export const curPlayer = (S) => S.players[S.cur];

function checkWin(S) {
  if (S.phase === 'over') return true;
  const a = alive(S);
  if (a.length === 0) { S.phase = 'over'; S.winners = []; S.winner = null; return true; }
  if (a.length === 1 || (S.opts.teams && a.every((p) => p.team === a[0].team))) {
    S.phase = 'over'; S.wait = null; S.win = null; S.cont = null;
    S.winner = a.length === 1 && !S.opts.teams ? a[0].id : a[0].id;
    S.winners = S.opts.teams ? S.players.filter((p) => p.team === a[0].team).map((p) => p.id) : [a[0].id];
    ev(S, { t: 'win', who: S.winner, winners: S.winners }, 1200);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- losing influence
function doLose(S, who, idx) {
  const p = P(S, who);
  const c = p.cards[idx];
  c.dead = true;
  ev(S, { t: 'lose', who, role: c.r, idx }, 1100);
  if (!liveCards(p).length) {
    p.alive = false;
    if (p.coins) { ev(S, { t: 'coins', who, d: -p.coins, why: 'out' }); p.coins = 0; }
    ev(S, { t: 'out', who }, 700);
    checkWin(S);
  }
}
/** `who` must lose an influence (their choice). Runs `then` afterwards unless the game ended. */
function loseTask(S, who, then) {
  const p = P(S, who);
  const after = () => { if (S.phase !== 'over') then(); };
  if (!p || !p.alive) return after();
  const live = p.cards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
  if (live.length === 1) { doLose(S, who, live[0]); return after(); }
  S.phase = 'lose';
  S.wait = { kind: 'lose', who: [who] };
  S.cont = (idx) => { doLose(S, who, idx); after(); };
}
export function chooseLose(S, who, idx) {
  const w = S.wait;
  if (S.phase !== 'lose' || !w || w.kind !== 'lose' || w.who[0] !== who) return { ok: false, err: 'not your choice' };
  const p = P(S, who);
  if (!(idx >= 0 && idx < p.cards.length) || p.cards[idx].dead) return { ok: false, err: 'bad card' };
  const k = S.cont; S.wait = null; S.cont = null; S.events = S.events || [];
  k(idx);
  return { ok: true };
}

// ---------------------------------------------------------------- turn
function startTurn(S) {
  if (S.phase === 'over') return;
  S.phase = 'turn'; S.act = null; S.blk = null; S.win = null; S.cont = null;
  const p = curPlayer(S);
  S.wait = { kind: 'turn', who: [p.id] };
  ev(S, { t: 'turn', who: p.id, forced: p.coins >= 10 });
}
function endTurn(S) {
  if (checkWin(S)) return;
  nextCur(S);
  startTurn(S);
}

/** What `id` may do right now: [{type, targets?, ok, why}] */
export function legalActions(S, id) {
  const p = P(S, id);
  if (!p || !p.alive || S.phase !== 'turn' || curPlayer(S).id !== id) return [];
  const foes = S.players.filter((q) => canTarget(S, id, q.id)).map((q) => q.id);
  const forced = p.coins >= 10;
  const list = [];
  const add = (type, ok, why, targets) => list.push({ type, ok: ok && (!forced || type === 'coup'), why: forced && type !== 'coup' ? 'Coup is mandatory' : ok ? '' : why, targets });
  add('income', true);
  add('aid', true);
  add('coup', p.coins >= 7 && foes.length > 0, p.coins < 7 ? 'Needs 7 coins' : 'No target', foes);
  add('tax', true);
  add('assassinate', p.coins >= 3 && foes.length > 0, p.coins < 3 ? 'Needs 3 coins' : 'No target', foes);
  const rich = foes.filter((f) => P(S, f).coins > 0);
  add('steal', rich.length > 0, 'Nobody to rob', rich);
  if (S.opts.oracle) {
    add('swap', true);
    add('examine', foes.length > 0, 'No target', foes);
  } else add('exchange', true);
  if (S.opts.teams) {
    const conv = S.players.filter((q) => q.alive && (q.id === id ? p.coins >= 1 : p.coins >= 2)).map((q) => q.id);
    add('convert', conv.length > 0, 'Needs 1 coin', conv);
    add('embezzle', S.reserve > 0, 'The reserve is empty');
  }
  return list;
}

export const costOf = (S, type, who, target) => {
  if (type === 'convert') return who === target ? 1 : 2;
  return ACTIONS[type].cost || 0;
};

export function declare(S, who, a) {
  const type = a?.type, def = ACTIONS[type];
  if (S.phase !== 'turn' || curPlayer(S).id !== who) return { ok: false, err: 'not your turn' };
  if (!def) return { ok: false, err: 'unknown action' };
  const lg = legalActions(S, who).find((x) => x.type === type);
  if (!lg || !lg.ok) return { ok: false, err: lg?.why || 'not allowed' };
  let target = null;
  if (def.target) {
    target = a.target;
    if (!lg.targets.includes(target)) return { ok: false, err: 'bad target' };
  }
  const p = P(S, who);
  const cost = costOf(S, type, who, target);
  if (p.coins < cost) return { ok: false, err: 'not enough coins' };
  p.coins -= cost;
  if (type === 'convert') S.reserve += cost;
  S.act = { type, actor: who, target, claim: def.claim || null, paid: type === 'assassinate' ? cost : 0, cost };
  S.wait = null;
  ev(S, { t: 'declare', who, act: type, target, cost, claim: def.claim || null, inverse: !!def.inverse }, 750);
  if (def.claim) { if (!def.inverse) claimNote(S, who, def.claim, 'n'); }
  if (!def.claim && !def.block) return execute(S), { ok: true };
  openWindow(S, 'action');
  return { ok: true };
}

// ---------------------------------------------------------------- response window
function blockersFor(S, q) {
  const a = S.act, def = ACTIONS[a.type];
  if (!def.block || !P(S, q).alive || q === a.actor) return [];
  if (def.blockBy === 'target' && q !== a.target) return [];
  if (a.type === 'aid' && S.opts.teams && P(S, q).team === P(S, a.actor).team && !allSameTeam(S)) return [];
  return blockRoles(a.type, S.opts);
}
function openWindow(S, kind, { blockOnly = false } = {}) {
  const elig = {};
  if (kind === 'action') {
    for (const q of alive(S)) {
      if (q.id === S.act.actor) continue;
      const ch = !!S.act.claim && !blockOnly;
      const bl = blockersFor(S, q.id);
      if (ch || bl.length) elig[q.id] = { ch, bl };
    }
  } else {
    for (const q of alive(S)) if (q.id !== S.blk.by) elig[q.id] = { ch: true, bl: [] };
  }
  if (!Object.keys(elig).length) { S.win = { kind, elig, resp: {}, seq: 0, id: ++S.winId, blockOnly }; return closeWindow(S); }
  S.phase = 'window';
  S.win = { kind, elig, resp: {}, seq: 0, id: ++S.winId, blockOnly };
  S.wait = { kind: 'window', who: Object.keys(elig) };
}
/** r: 'allow' | 'challenge' | 'block' (role = which character you claim for the block) */
export function respond(S, who, r, role) {
  const w = S.win;
  if (S.phase !== 'window' || !w || !w.elig[who] || w.resp[who]) return { ok: false, err: 'cannot respond' };
  const e = w.elig[who];
  if (r === 'challenge' && !e.ch) return { ok: false, err: 'cannot challenge' };
  if (r === 'block') { if (!e.bl.length) return { ok: false, err: 'cannot block' }; if (!e.bl.includes(role)) role = e.bl[0]; }
  if (!['allow', 'challenge', 'block'].includes(r)) return { ok: false, err: 'bad response' };
  w.resp[who] = { r, role: r === 'block' ? role : null, seq: ++w.seq };
  return { ok: true, interrupt: r !== 'allow', done: Object.keys(w.elig).every((k) => w.resp[k]) };
}
export const windowDone = (S) => !!S.win && Object.keys(S.win.elig).every((k) => S.win.resp[k]);
export const windowInterrupted = (S) => !!S.win && Object.values(S.win.resp).some((r) => r.r !== 'allow');

/** Close the window (everyone answered, or the clock ran out — silence means allow). Challenges outrank blocks. */
export function closeWindow(S) {
  const w = S.win;
  if (!w) return;
  S.wait = null; S.win = null;
  const rs = Object.entries(w.resp).map(([id, r]) => ({ id, ...r })).sort((a, b) => a.seq - b.seq);
  const chal = rs.find((r) => r.r === 'challenge'), blk = rs.find((r) => r.r === 'block');
  if (w.kind === 'action') {
    if (chal) return challengeAction(S, chal.id);
    if (blk) return startBlock(S, blk.id, blk.role);
    return execute(S);
  }
  if (chal) return challengeBlock(S, chal.id);
  ev(S, { t: 'blockstands', who: S.blk.by, role: S.blk.role }, 500);
  endTurn(S);
}

function startBlock(S, by, role) {
  S.blk = { by, role };
  claimNote(S, by, role, 'n');
  ev(S, { t: 'block', who: by, role, vs: S.act.actor, act: S.act.type }, 750);
  openWindow(S, 'block');
}

// ---------------------------------------------------------------- challenges
function replaceCard(S, who, idx) {
  const p = P(S, who), c = p.cards[idx];
  S.deck.push(c.r); shuffleIn(S.deck, S.rng);
  c.r = S.deck.pop();
  ev(S, { t: 'replace', who, idx }, 500);
}
function proveRole(S, who, role) {
  const p = P(S, who);
  const idx = p.cards.findIndex((c) => !c.dead && c.r === role);
  claimNote(S, who, role, 'ok');
  ev(S, { t: 'reveal', who, role, proved: true, idx }, 2000);
  replaceCard(S, who, idx);
}
function caughtRole(S, who, role) {
  claimNote(S, who, role, 'bad');
  ev(S, { t: 'reveal', who, role, proved: false, idx: -1 }, 2000);
}

function challengeAction(S, challenger) {
  const a = S.act, claimant = a.actor, role = a.claim, def = ACTIONS[a.type];
  ev(S, { t: 'challenge', by: challenger, who: claimant, role, on: 'action', inverse: !!def.inverse }, 800);
  const p = P(S, claimant);
  const truthful = def.inverse ? !holds(p, 'duchess') : holds(p, role);
  if (def.inverse) {
    if (truthful) {
      // no Duchess: show the whole hand as proof, shuffle it back, the challenger pays
      ev(S, { t: 'reveal', who: claimant, role: null, proved: true, idx: -1, all: p.cards.filter((c) => !c.dead).map((c) => c.r), inverse: true }, 2200);
      p.cards.forEach((c, i) => { if (!c.dead) replaceCard(S, claimant, i); });
      return loseTask(S, challenger, () => afterProvedAction(S));
    }
    ev(S, { t: 'reveal', who: claimant, role: 'duchess', proved: false, idx: -1, inverse: true }, 2000);
    return loseTask(S, claimant, () => { ev(S, { t: 'fail', who: claimant, act: a.type }, 500); endTurn(S); });
  }
  if (truthful) {
    proveRole(S, claimant, role);
    return loseTask(S, challenger, () => afterProvedAction(S));
  }
  caughtRole(S, claimant, role);
  loseTask(S, claimant, () => {
    if (a.paid && P(S, claimant).alive) { P(S, claimant).coins += a.paid; ev(S, { t: 'coins', who: claimant, d: a.paid, why: 'refund' }); }
    ev(S, { t: 'fail', who: claimant, act: a.type }, 500);
    endTurn(S);
  });
}
function afterProvedAction(S) {
  const a = S.act;
  if (a.target && !P(S, a.target).alive) { ev(S, { t: 'fizzle', act: a.type }, 400); return endTurn(S); }
  const hasBlocker = alive(S).some((q) => blockersFor(S, q.id).length);
  if (hasBlocker) return openWindow(S, 'action', { blockOnly: true });
  execute(S);
}
function challengeBlock(S, challenger) {
  const { by, role } = S.blk, p = P(S, by);
  ev(S, { t: 'challenge', by: challenger, who: by, role, on: 'block' }, 800);
  if (holds(p, role)) {
    proveRole(S, by, role);
    return loseTask(S, challenger, () => { ev(S, { t: 'blockstands', who: by, role }, 500); endTurn(S); });
  }
  caughtRole(S, by, role);
  loseTask(S, by, () => { ev(S, { t: 'blockfails', who: by, role }, 500); S.blk = null; execute(S); });
}

// ---------------------------------------------------------------- effects
const gain = (S, who, n, why) => { P(S, who).coins += n; ev(S, { t: 'coins', who, d: n, why }, 350); };
function draw(S, n) { const out = []; for (let i = 0; i < n; i++) if (S.deck.length) out.push(S.deck.pop()); return out; }

function execute(S) {
  const a = S.act;
  if (!a) return endTurn(S);
  const me = P(S, a.actor);
  if (!me.alive) return endTurn(S);
  const tgt = a.target ? P(S, a.target) : null;
  switch (a.type) {
    case 'income': gain(S, a.actor, 1, 'income'); return endTurn(S);
    case 'aid': gain(S, a.actor, 2, 'aid'); return endTurn(S);
    case 'tax': gain(S, a.actor, 3, 'tax'); return endTurn(S);
    case 'embezzle': { const n = S.reserve; S.reserve = 0; if (n) gain(S, a.actor, n, 'embezzle'); return endTurn(S); }
    case 'convert': { tgt.team = 1 - tgt.team; ev(S, { t: 'convert', who: a.actor, target: a.target, team: tgt.team }, 800); return endTurn(S); }
    case 'coup': case 'assassinate':
      if (!tgt.alive) { ev(S, { t: 'fizzle', act: a.type }, 400); return endTurn(S); }
      ev(S, { t: 'strike', who: a.actor, target: a.target, act: a.type }, 600);
      return loseTask(S, a.target, () => endTurn(S));
    case 'steal': {
      if (!tgt.alive) { ev(S, { t: 'fizzle', act: a.type }, 400); return endTurn(S); }
      const n = Math.min(2, tgt.coins);
      tgt.coins -= n; me.coins += n;
      ev(S, { t: 'steal', who: a.actor, target: a.target, n }, 700);
      return endTurn(S);
    }
    case 'exchange': case 'swap': return startExchange(S, a.type === 'exchange' ? 2 : 1);
    case 'examine': {
      if (!tgt.alive) { ev(S, { t: 'fizzle', act: a.type }, 400); return endTurn(S); }
      S.phase = 'exm';
      S.wait = { kind: 'exm', who: [a.target] };
      S.cont = (idx) => {
        const role = tgt.cards[idx].r;
        ev(S, { t: 'examine', who: a.actor, target: a.target, idx, role, priv: a.actor }, 800); // `role` is private to the Oracle (see publicEvent)
        S.phase = 'exd';
        S.wait = { kind: 'exd', who: [a.actor], idx };
        S.cont = (swap) => {
          if (swap) {
            S.deck.push(tgt.cards[idx].r); shuffleIn(S.deck, S.rng);
            tgt.cards[idx].r = S.deck.pop();
            ev(S, { t: 'examined', who: a.actor, target: a.target, swap: true }, 700);
          } else ev(S, { t: 'examined', who: a.actor, target: a.target, swap: false }, 600);
          endTurn(S);
        };
      };
      return;
    }
    default: return endTurn(S);
  }
}

function startExchange(S, n) {
  const me = P(S, S.act.actor);
  const live = me.cards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
  const drawn = draw(S, n);
  const pool = [...live.map((i) => me.cards[i].r), ...drawn];
  ev(S, { t: 'exchange', who: me.id, n: drawn.length, priv: me.id, drawn }, 600);
  S.phase = 'xch';
  S.xch = { pool, keep: live.length, live };
  S.wait = { kind: 'xch', who: [me.id] };
  S.cont = (keepIdx) => {
    const kept = keepIdx.map((i) => pool[i]);
    const rest = pool.filter((_, i) => !keepIdx.includes(i));
    live.forEach((ci, k) => { me.cards[ci].r = kept[k]; });
    for (const r of rest) S.deck.push(r);
    shuffleIn(S.deck, S.rng);
    S.xch = null;
    ev(S, { t: 'exchanged', who: me.id, n: rest.length }, 500);
    endTurn(S);
  };
}
export function chooseExchange(S, who, keepIdx) {
  if (S.phase !== 'xch' || S.wait?.who[0] !== who) return { ok: false, err: 'not now' };
  const x = S.xch;
  if (!Array.isArray(keepIdx) || keepIdx.length !== x.keep) return { ok: false, err: 'keep ' + x.keep };
  const set = new Set(keepIdx);
  if (set.size !== keepIdx.length || keepIdx.some((i) => !(i >= 0 && i < x.pool.length))) return { ok: false, err: 'bad pick' };
  const k = S.cont; S.wait = null; S.cont = null;
  k(keepIdx);
  return { ok: true };
}
export function chooseExamine(S, who, idx) {
  if (S.phase !== 'exm' || S.wait?.who[0] !== who) return { ok: false, err: 'not now' };
  const p = P(S, who);
  if (!(idx >= 0 && idx < p.cards.length) || p.cards[idx].dead) return { ok: false, err: 'bad card' };
  const k = S.cont; S.wait = null; S.cont = null;
  k(idx);
  return { ok: true };
}
export function chooseExamineVerdict(S, who, swap) {
  if (S.phase !== 'exd' || S.wait?.who[0] !== who) return { ok: false, err: 'not now' };
  const k = S.cont; S.wait = null; S.cont = null;
  k(!!swap);
  return { ok: true };
}

// ---------------------------------------------------------------- clocks & leaving
/** The waiting player(s) ran out of time: do the safe default. */
export function timeoutStep(S) {
  const w = S.wait;
  if (!w || S.phase === 'over') return;
  if (S.phase === 'window') return closeWindow(S);
  const who = w.who[0], p = P(S, who);
  const rnd = (n) => Math.floor(rngNext(S.rng) * n);
  if (S.phase === 'turn') {
    const lg = legalActions(S, who);
    if (p.coins >= 10) { const c = lg.find((x) => x.type === 'coup'); return declare(S, who, { type: 'coup', target: c.targets[rnd(c.targets.length)] }); }
    return declare(S, who, { type: 'income' });
  }
  if (S.phase === 'lose') { const live = p.cards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0); return chooseLose(S, who, live[rnd(live.length)]); }
  if (S.phase === 'xch') return chooseExchange(S, who, S.xch.pool.map((_, i) => i).slice(0, S.xch.keep));
  if (S.phase === 'exm') { const live = p.cards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0); return chooseExamine(S, who, live[rnd(live.length)]); }
  if (S.phase === 'exd') return chooseExamineVerdict(S, who, false);
}

/** A player left the room: their cards are revealed and they are out; whatever was waiting on them resolves. */
export function forfeit(S, id) {
  const p = P(S, id);
  if (!p || !p.alive || S.phase === 'over') return;
  if (S.phase !== 'window' && S.phase !== 'turn' && S.wait?.who.includes(id)) timeoutStep(S); // settle a pending choice first
  if (S.phase === 'over' || !p.alive) return;
  const wasWaiting = S.wait?.who.includes(id);
  const wasPhase = S.phase;
  p.left = true;
  for (const [i, c] of p.cards.entries()) if (!c.dead) { c.dead = true; ev(S, { t: 'lose', who: id, role: c.r, idx: i, left: true }, 300); }
  p.alive = false;
  if (p.coins) { ev(S, { t: 'coins', who: id, d: -p.coins, why: 'out' }); p.coins = 0; }
  ev(S, { t: 'out', who: id, left: true }, 600);
  if (checkWin(S)) return;
  if (wasPhase === 'window') {
    delete S.win.elig[id];
    if (S.act?.actor === id || S.blk?.by === id) { S.win = null; S.wait = null; ev(S, { t: 'fizzle', act: S.act?.type }, 300); return endTurn(S); }
    if (!Object.keys(S.win.elig).length || windowDone(S)) closeWindow(S); else S.wait = { kind: 'window', who: Object.keys(S.win.elig) };
    return;
  }
  if (S.act && S.act.actor === id) { S.wait = null; S.cont = null; S.win = null; return endTurn(S); }
  if (wasPhase === 'turn' && curPlayer(S).id === id) return endTurn(S);
  if (wasWaiting) {
    // someone else was waiting on this player (e.g. their card choice): resolve with a safe default
    S.wait = null; S.cont = null;
    return endTurn(S);
  }
}

// ---------------------------------------------------------------- views
export function publicState(S) {
  const a = S.act;
  return {
    phase: S.phase, turn: curPlayer(S).id, opts: S.opts, deck: S.deck.length, reserve: S.reserve, winner: S.winner, winners: S.winners,
    players: S.players.map((p) => ({ id: p.id, coins: p.coins, alive: p.alive, left: p.left, team: p.team, hidden: liveCards(p).length, dead: p.cards.filter((c) => c.dead).map((c) => c.r) })),
    act: a ? { type: a.type, actor: a.actor, target: a.target, claim: a.claim, cost: a.cost } : null,
    blk: S.blk ? { by: S.blk.by, role: S.blk.role } : null,
    win: S.win ? { kind: S.win.kind, id: S.win.id, blockOnly: !!S.win.blockOnly, elig: Object.fromEntries(Object.entries(S.win.elig).map(([k, v]) => [k, { ch: v.ch, bl: v.bl, done: !!S.win.resp[k] }])) } : null,
    wait: S.wait ? { kind: S.wait.kind, who: S.wait.who.slice(), idx: S.wait.idx } : null,
    claims: S.claims,
  };
}
export function privateState(S, id) {
  const p = P(S, id);
  if (!p) return null;
  return { cards: p.cards.map((c) => ({ r: c.r, dead: c.dead })), pool: S.phase === 'xch' && S.wait?.who[0] === id ? S.xch.pool.slice() : null, keep: S.phase === 'xch' && S.wait?.who[0] === id ? S.xch.keep : 0 };
}
/** Event as everyone may see it (private details removed). */
export function publicEvent(e) {
  if (!e.priv) return e;
  const { priv, role, drawn, ...rest } = e; // eslint-disable-line no-unused-vars
  return rest;
}
