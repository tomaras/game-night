// Bean Trader — a bean-planting, card-trading game (2–7 players), inspired by classic bean-farming card games.
// The HOST holds every hidden card and sends each player only what they may see.
//
// Turn: 1) plant your first hand card (and optionally the next)  2) two cards go face-up — trade/donate them
// and any cards from your hands with others  3) everybody plants what they received  4) draw 3 cards to the back of your hand.
// Harvest fields any time to turn beans into coins. Game ends when the draw pile runs out the third time.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const TYPES = {
  coffee: { n: 'Coffee', e: '☕', c: '#7a4a21', v: [[4, 1], [7, 2], [10, 3], [12, 4]], cnt: 24 },
  wax: { n: 'Wax', e: '🕯️', c: '#c9a227', v: [[4, 1], [7, 2], [9, 3], [11, 4]], cnt: 22 },
  blue: { n: 'Blue', e: '🫐', c: '#3b5bdb', v: [[4, 1], [6, 2], [8, 3], [10, 4]], cnt: 20 },
  chili: { n: 'Chili', e: '🌶️', c: '#d6336c', v: [[3, 1], [6, 2], [8, 3], [9, 4]], cnt: 18 },
  stink: { n: 'Stink', e: '🧄', c: '#8a8a4f', v: [[3, 1], [5, 2], [7, 3], [8, 4]], cnt: 16 },
  green: { n: 'Green', e: '🥬', c: '#2f9e44', v: [[3, 1], [5, 2], [6, 3], [7, 4]], cnt: 14 },
  soy: { n: 'Soy', e: '🫘', c: '#a98467', v: [[2, 1], [4, 2], [6, 3], [7, 4]], cnt: 12 },
  eye: { n: 'Eyed', e: '👁️', c: '#495057', v: [[2, 1], [4, 2], [5, 3], [6, 4]], cnt: 10 },
  red: { n: 'Red', e: '🍅', c: '#e03131', v: [[2, 1], [3, 2], [4, 3], [5, 4]], cnt: 8 },
  garden: { n: 'Garden', e: '🌻', c: '#f08c00', v: [[2, 2], [3, 3]], cnt: 6 },
  cocoa: { n: 'Cocoa', e: '🍫', c: '#6b4332', v: [[2, 2], [3, 3], [4, 4]], cnt: 4 },
};
const coinsFor = (t, n) => { let c = 0; for (const [b, co] of TYPES[t].v) if (n >= b) c = co; return c; };
const tip = (t) => `${TYPES[t].n}: ` + TYPES[t].v.map(([b, c]) => `${b} beans = ${c}💰`).join(', ');

const CSS = `
.bt { flex:1; display:flex; flex-direction:column; min-height:0; padding:8px; gap:8px; overflow-y:auto; }
.bt-status { background:var(--panel); box-shadow:var(--e1); border-radius:22px; padding:8px 14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.bt-status .msg { font-weight:800; font-size:16px; flex:1; min-width:220px; }
.bt-status .chips { display:flex; gap:6px; flex-wrap:wrap; }
.bt-others { display:flex; gap:8px; flex-wrap:wrap; }
.bt-op { background:var(--panel); box-shadow:var(--e1); border-radius:20px; padding:8px 10px; flex:1; min-width:210px; max-width:360px; }
.bt-op.turn { border-color:#ffc857; box-shadow:0 0 0 2px rgba(255,200,87,.25); }
.bt-op .hd { display:flex; align-items:center; gap:8px; font-weight:800; margin-bottom:6px; font-size:14px; }
.bt-op .hd .ct { margin-left:auto; display:flex; gap:8px; font-size:13px; color:var(--muted); }
.bt-fields { display:flex; gap:8px; }
.bt-field { position:relative; flex:1; min-height:92px; min-width:0; border-radius:12px; background:var(--bg2); border:2px dashed var(--line2); padding:6px 6px 22px; display:flex; align-items:flex-start; justify-content:center; }
.bt-field.empty::before { content:'empty'; color:var(--muted); font-size:12px; margin-top:26px; }
.bt-field .lbl { position:absolute; bottom:3px; left:0; right:0; text-align:center; font-size:11px; font-weight:700; color:var(--on2); }
.bt-field.hl { border-color:#38d996; border-style:solid; cursor:pointer; animation:pulse 1s infinite; }
.bt-field.locked { opacity:.55; }
.bt-stack { position:relative; height:76px; flex:none; }
.bt-stack .bt-card { position:absolute; top:0; }
.bt-card { width:50px; height:70px; border-radius:9px; background:linear-gradient(160deg, color-mix(in srgb, var(--bc) 80%, #fff 20%), var(--bc)); display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:25px; border:2px solid rgba(255,255,255,.4); box-shadow:0 2px 5px rgba(31,41,55,.22); flex:none; position:relative; user-select:none; color:#fff; line-height:1.05; }
.bt-card small { font-size:9px; font-weight:800; text-shadow:0 1px 2px rgba(0,0,0,.7); letter-spacing:.2px; }
.bt-card.sm { width:34px; height:47px; font-size:16px; border-radius:7px; }
.bt-card.sm small { font-size:7px; }
.bt-card.click { cursor:pointer; }
.bt-card.sel { outline:3px solid #fff; transform:translateY(-8px); }
.bt-card.top::after { content:'NEXT'; position:absolute; bottom:-9px; left:50%; transform:translateX(-50%); font-size:8px; font-weight:900; background:#ffc857; color:#3b2b00; padding:1px 5px; border-radius:6px; }
.bt-card.dim { opacity:.45; }
.bt-mid { background:var(--panel); box-shadow:var(--e1); border-radius:22px; padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.bt-row { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; }
.bt-sec { font-size:12px; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:.8px; margin-bottom:4px; }
.bt-offer { display:flex; gap:10px; align-items:center; flex-wrap:wrap; background:var(--bg2); border-radius:12px; padding:8px 10px; }
.bt-offer .who { font-weight:800; font-size:13px; min-width:100px; }
.bt-arrow { font-size:20px; color:var(--muted); }
.bt-me { background:var(--panel); box-shadow:var(--e1); border-radius:22px; padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.bt-me.turn { border-color:#ffc857; box-shadow:0 0 0 2px rgba(255,200,87,.25); }
.bt-me .fields .bt-field { min-height:112px; }
.bt-hand { display:flex; gap:6px; flex-wrap:wrap; padding-bottom:10px; }
.bt-log { font-size:12px; color:var(--muted); display:flex; flex-direction:column; gap:1px; max-height:64px; overflow:hidden; }
.bt-prices { position:absolute; inset:0; background:rgba(248,250,253,.96); z-index:20; display:grid; place-items:center; padding:12px; overflow:auto; }
.bt-prices table { border-collapse:collapse; background:var(--panel); border-radius:16px; overflow:hidden; box-shadow:var(--e2); }
.bt-prices td, .bt-prices th { padding:6px 12px; border-bottom:1px solid var(--line); text-align:center; font-size:14px; }
.bt-chip { display:inline-flex; align-items:center; gap:4px; background:var(--panel3); border-radius:999px; padding:3px 6px 3px 10px; font-weight:800; font-size:13px; }
.bt-chip button { width:22px; height:22px; border-radius:50%; border:none; background:rgba(0,0,0,.1); color:var(--on); font-weight:900; cursor:pointer; }
@media (max-width:640px) { .bt-card { width:42px; height:60px; font-size:21px; } .bt-card.sm { width:30px; height:42px; } .bt-stack { height:64px; } .bt-field { min-height:80px; } .bt-me .fields .bt-field { min-height:96px; } }
`;

export function start(api) {
  const n = api.players.length;
  const ids = api.players.map((p) => p.id);
  const typesInUse = Object.keys(TYPES).filter((t) => (n <= 3 ? !['coffee', 'garden', 'cocoa'].includes(t) : n <= 5 ? !['garden', 'cocoa'].includes(t) : true));
  const nameOf = (id) => api.player(id)?.name || '?';

  // ================================================================ HOST
  let G = null;
  let publish = () => {};
  if (api.isHost) {
    const rng = api.rng;
    G = { type: [], deck: [], discard: [], resh: 0, P: {}, order: [], turn: 0, phase: 'plant1', planted: 0, faceUp: [], offers: [], oid: 0, over: false };
    typesInUse.forEach((t) => { for (let i = 0; i < TYPES[t].cnt; i++) { G.type.push(t); G.deck.push(G.type.length - 1); } });
    G.deck = rng.shuffle(G.deck);
    const startHand = n <= 3 ? 7 : n === 4 ? 6 : n === 5 ? 5 : 3;
    const nf = n <= 3 ? 3 : 2;
    G.order = rng.shuffle(ids);
    ids.forEach((id) => { G.P[id] = { hand: [], coins: [], fields: Array.from({ length: nf }, () => ({ cards: [] })), pending: [] }; });
    const log = (text) => api.broadcast('log', text);
    const C = (id) => ({ id, t: G.type[id] });
    const active = () => G.order[G.turn];
    const P = (id) => G.P[id];
    const live = () => G.order.filter((id) => !api.player(id).left);

    const draw = () => {
      if (!G.deck.length) {
        if (G.resh >= 2 || !G.discard.length) { G.over = true; return null; }
        G.deck = rng.shuffle(G.discard); G.discard = []; G.resh++;
        log(`♻️ Draw pile reshuffled (${G.resh}/2)`);
      }
      return G.deck.pop();
    };
    ids.forEach((id) => { for (let i = 0; i < startHand; i++) P(id).hand.push(draw()); });

    publish = (to) => {
      const targets = to ? [to] : ids;
      for (const id of targets) {
        if (api.player(id).left) continue;
        api.sendTo(id, 'state', {
          phase: G.phase, turn: active(), planted: G.planted, deck: G.deck.length, discard: G.discard.length, resh: G.resh, over: G.over,
          faceUp: G.faceUp.map(C),
          offers: G.offers.map((o) => ({ id: o.id, from: o.from, to: o.to, give: o.give.map(C), want: o.want })),
          order: G.order,
          players: Object.fromEntries(G.order.map((pid) => [pid, {
            hand: P(pid).hand.length, coins: P(pid).coins.length, nf: P(pid).fields.length,
            fields: P(pid).fields.map((f) => ({ t: f.cards.length ? G.type[f.cards[0]] : null, n: f.cards.length })),
            pending: P(pid).pending.map(C),
          }])),
          hand: P(id).hand.map(C),
        });
      }
    };

    const fieldOk = (p, f, card) => {
      const fld = p.fields[f];
      return !!fld && (fld.cards.length === 0 || G.type[fld.cards[0]] === G.type[card]);
    };
    const canHarvest = (p, f) => {
      const fld = p.fields[f];
      return !!fld && fld.cards.length > 0 && (fld.cards.length > 1 || p.fields.every((x) => x.cards.length <= 1));
    };
    const harvest = (id, f) => {
      const p = P(id), fld = p.fields[f];
      const t = G.type[fld.cards[0]], cnt = fld.cards.length, coins = coinsFor(t, cnt);
      const cards = fld.cards.splice(0);
      p.coins.push(...cards.slice(0, coins));
      G.discard.push(...cards.slice(coins));
      log(`💰 ${nameOf(id)} harvested ${cnt} ${TYPES[t].n} for ${coins} coin${coins === 1 ? '' : 's'}`);
    };

    const owns = (id, card) => P(id).hand.includes(card) || (id === active() && G.faceUp.includes(card));
    const removeCard = (id, card) => {
      const p = P(id);
      let i = p.hand.indexOf(card);
      if (i >= 0) return p.hand.splice(i, 1);
      i = G.faceUp.indexOf(card);
      if (i >= 0 && id === active()) return G.faceUp.splice(i, 1);
      return null;
    };
    const offerValid = (o) => {
      if (!o.give.every((c) => owns(o.from, c))) return false;
      return true;
    };
    const pruneOffers = () => { G.offers = G.offers.filter(offerValid); };

    const beginTurn = () => {
      G.phase = 'plant1'; G.planted = 0; G.faceUp = []; G.offers = [];
      if (!P(active()).hand.length) return afterPlant();
      publish();
    };
    const afterPlant = () => {
      // draw two face-up cards
      for (let i = 0; i < 2; i++) { const c = draw(); if (c === null) return finish(); G.faceUp.push(c); }
      G.phase = 'trade';
      log(`🃏 ${nameOf(active())} turns up ${G.faceUp.map((c) => TYPES[G.type[c]].e).join(' ')}`);
      publish();
    };
    const checkPending = () => {
      if (G.phase !== 'plantTraded') return;
      if (live().some((id) => P(id).pending.length)) return publish();
      // draw three to the back of the hand
      for (let i = 0; i < 3; i++) { const c = draw(); if (c === null) return finish(); P(active()).hand.push(c); }
      nextTurn();
    };
    const nextTurn = () => {
      do { G.turn = (G.turn + 1) % G.order.length; } while (api.player(active()).left);
      beginTurn();
    };
    const finish = () => {
      G.over = true;
      for (const id of ids) {
        const p = P(id);
        for (let f = 0; f < p.fields.length; f++) if (p.fields[f].cards.length) harvest(id, f);
      }
      publish();
      const ranking = ids.slice().sort((a, b) => P(b).coins.length - P(a).coins.length).map((id) => ({ id, score: P(id).coins.length, note: 'coins' }));
      const top = ranking[0].score;
      api.timeout(() => api.endGame({ title: `${nameOf(ranking[0].id)} is the bean baron!`, subtitle: 'Most coins wins', ranking, winners: ranking.filter((r) => r.score === top).map((r) => r.id) }), 1500);
    };

    api.on('act', (m, from) => {
      if (G.over || !G.P[from] || api.player(from).left) return;
      const p = P(from);
      const err = (t) => api.sendTo(from, 'err', t);
      switch (m.a) {
        case 'plant': {
          if ((G.phase === 'plant1' || G.phase === 'plant2') && from === active()) {
            const card = p.hand[0];
            if (card === undefined) return;
            if (!fieldOk(p, m.f, card)) return err('That field has a different kind of bean. Plant in an empty or matching field — or harvest one first.');
            p.hand.shift();
            p.fields[m.f].cards.push(card);
            G.planted++;
            if (G.planted >= 2 || !p.hand.length) afterPlant();
            else { G.phase = 'plant2'; publish(); }
          } else if (G.phase === 'plantTraded') {
            const card = m.card;
            if (!p.pending.includes(card)) return;
            if (!fieldOk(p, m.f, card)) return err('That field has a different kind of bean. Harvest a field first to make room.');
            p.pending.splice(p.pending.indexOf(card), 1);
            p.fields[m.f].cards.push(card);
            checkPending();
          }
          break;
        }
        case 'skip': if (G.phase === 'plant2' && from === active()) afterPlant(); break;
        case 'harvest': {
          if (!canHarvest(p, m.f)) return err('You can’t harvest that field: a single bean can only be harvested if all your fields have one bean.');
          harvest(from, m.f);
          pruneOffers();
          publish();
          break;
        }
        case 'buy': {
          if (p.coins.length < 3 || p.fields.length >= 3 || n <= 3) return err('You need 3 coins to buy a third field.');
          G.discard.push(...p.coins.splice(0, 3));
          p.fields.push({ cards: [] });
          log(`🌱 ${nameOf(from)} bought a third field`);
          publish();
          break;
        }
        case 'offer': {
          if (G.phase !== 'trade') return;
          const isAct = from === active();
          let to = m.to;
          if (!isAct) to = active();
          else if (to !== 'all' && !G.P[to]) return;
          if (to === from) return;
          const give = [...new Set((m.give || []).map(Number))].filter((c) => owns(from, c)).slice(0, 8);
          const want = [];
          for (const w of (m.want || []).slice(0, 8)) {
            if (w.id !== undefined) { if (!isAct && G.faceUp.includes(+w.id)) want.push({ id: +w.id }); }
            else if (TYPES[w.t] && typesInUse.includes(w.t)) want.push({ t: w.t, n: Math.min(4, Math.max(1, +w.n || 1)) });
          }
          if (!give.length && !want.length) return;
          if (G.offers.filter((o) => o.from === from).length >= 3) return err('You already have 3 open offers — cancel one first.');
          G.offers.push({ id: ++G.oid, from, to, give, want });
          publish();
          break;
        }
        case 'cancel': G.offers = G.offers.filter((o) => !(o.id === m.id && (o.from === from || o.to === from))); publish(); break;
        case 'accept': {
          if (G.phase !== 'trade') return;
          const o = G.offers.find((x) => x.id === m.id);
          if (!o || o.from === from || (o.to !== 'all' && o.to !== from)) return;
          const A = o.from, B = from;
          if (A !== active() && B !== active()) return;
          if (!offerValid(o)) { pruneOffers(); publish(); return err('That offer is no longer valid.'); }
          // gather what B must hand over
          const take = [];
          const handLeft = P(B).hand.slice();
          for (const w of o.want) {
            if (w.id !== undefined) {
              if (B === active() && G.faceUp.includes(w.id)) take.push(w.id);
              else return err('That card is gone.');
            } else {
              for (let k = 0; k < w.n; k++) {
                let idx = -1;
                for (let i = handLeft.length - 1; i >= 0; i--) if (G.type[handLeft[i]] === w.t && !take.includes(handLeft[i])) { idx = i; break; }
                if (idx < 0) return err(`You don’t have enough ${TYPES[w.t].n} beans for that offer.`);
                take.push(handLeft[idx]);
                handLeft.splice(idx, 1);
              }
            }
          }
          o.give.forEach((c) => removeCard(A, c));
          take.forEach((c) => removeCard(B, c));
          P(B).pending.push(...o.give);
          P(A).pending.push(...take);
          const fmt = (cs) => cs.length ? cs.map((c) => TYPES[G.type[c]].e).join('') : 'nothing';
          log(`🤝 ${nameOf(A)} ⇄ ${nameOf(B)}: ${fmt(o.give)} for ${fmt(take)}`);
          G.offers = G.offers.filter((x) => x.id !== o.id);
          pruneOffers();
          publish();
          break;
        }
        case 'endtrade': {
          if (G.phase !== 'trade' || from !== active()) return;
          P(from).pending.push(...G.faceUp);
          G.faceUp = [];
          G.offers = [];
          G.phase = 'plantTraded';
          checkPending();
          break;
        }
        default: break;
      }
    });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (G.over) return;
      const p = P(id);
      G.discard.push(...p.hand, ...p.coins, ...p.pending, ...p.fields.flatMap((f) => f.cards));
      p.hand = []; p.coins = []; p.pending = []; p.fields.forEach((f) => (f.cards = []));
      G.offers = G.offers.filter((o) => o.from !== id && o.to !== id);
      if (live().length < 2) return finish();
      if (id === active()) {
        G.faceUp.forEach((c) => G.discard.push(c)); G.faceUp = [];
        nextTurn();
      } else {
        if (G.phase === 'plantTraded') checkPending(); else publish();
      }
    });
    api.timeout(() => { log('🫘 Game on! Plant your first card.'); beginTurn(); }, 500);
  }

  // ================================================================ CLIENT
  let st = null;
  const logLines = [];
  let draft = null; // offer under construction {to, give:Set, wantTypes:{t:n}, wantIds:Set}
  let selPending = null;
  let showPrices = false;
  const root = h('div.bt');
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:0;display:flex;flex-direction:column' }, root);
  api.root.append(h('style', CSS), wrap);

  const card = (c, opts = {}) => {
    const T = TYPES[c.t];
    return h('div.bt-card' + (opts.sm ? '.sm' : '') + (opts.click ? '.click' : '') + (opts.sel ? '.sel' : '') + (opts.top ? '.top' : '') + (opts.dim ? '.dim' : ''), {
      style: { '--bc': T.c }, title: tip(c.t), onclick: opts.onclick,
    }, T.e, h('small', T.n));
  };
  const stackEl = (t, cnt, sm) => {
    const step = sm ? 7 : 9;
    return h('div.bt-stack', { style: { width: (sm ? 34 : 50) + (cnt - 1) * step + 'px', height: sm ? '48px' : '' } },
      Array.from({ length: cnt }, (_, i) => { const e = card({ t }, { sm }); e.style.left = i * step + 'px'; return e; }));
  };

  api.on('state', (s) => { st = s; if (s.phase !== 'trade') draft = null; render(); });
  api.on('log', (t) => { logLines.push(t); if (logLines.length > 40) logLines.shift(); if (st) render(); });
  api.on('err', (t) => { api.toast(t); api.sfx('bad'); });
  api.onPlayersChanged(() => st && render());

  const act = (a, extra) => api.toHost('act', { a, ...extra });
  const isMyTurn = () => st.turn === api.me;

  function myPending() { return st.players[api.me].pending; }
  function plantTarget() {
    // what card would I plant if I clicked a field now?
    if ((st.phase === 'plant1' || st.phase === 'plant2') && isMyTurn() && st.hand.length) return { c: st.hand[0], pending: false };
    if (st.phase === 'plantTraded' && myPending().length) {
      const pend = myPending();
      const c = pend.find((x) => x.id === selPending) || pend[0];
      return { c, pending: true };
    }
    return null;
  }

  function statusText() {
    const t = nameOf(st.turn);
    const me = isMyTurn();
    if (st.over) return 'Game over — counting coins…';
    switch (st.phase) {
      case 'plant1': return me ? '🌱 Your turn: plant the first card of your hand (click a field).' : `🌱 ${t} is planting…`;
      case 'plant2': return me ? '🌱 Plant your next card too — or skip.' : `🌱 ${t} is planting…`;
      case 'trade': return me ? '🤝 Trade! Offer cards, accept offers — then press “Done trading”.' : `🤝 ${t} is trading. Make an offer for the face-up cards or swap from your hand!`;
      case 'plantTraded': return myPending().length ? '🌱 Plant the beans you received (click a field). Harvest first if you have no room.' : '⏳ Waiting for others to plant…';
      default: return '';
    }
  }

  function render() {
    if (!st) return;
    const me = st.players[api.me];
    const target = plantTarget();
    const others = st.order.filter((id) => id !== api.me);
    const turnId = st.turn;
    const wantCoins = (f) => coinsFor(f.t, f.n);
    const canHarvestLocal = (fi) => me.fields[fi].n > 0 && (me.fields[fi].n > 1 || me.fields.every((x) => x.n <= 1));

    const statusBar = h('div.bt-status', [
      h('div.msg', statusText()),
      h('div.chips', [
        h('span.chip', `🂠 Deck ${st.deck}`), h('span.chip', `♻️ Discard ${st.discard}`), h('span.chip', `Reshuffles ${st.resh}/2`),
        h('button.btn.small', { onclick: () => { showPrices = !showPrices; render(); } }, icon('menu_book'), 'Prices'),
      ]),
    ]);

    const oppEls = others.map((id) => {
      const p = st.players[id];
      const info = api.player(id);
      return h('div.bt-op' + (turnId === id ? '.turn' : ''), [
        h('div.hd', [avatarEl({ ...info, online: info.online && !info.left }, 'sm' + (turnId === id ? ' bounce' : '')), info.name, turnId === id ? '⭐' : '',
          h('div.ct', [`✋${p.hand}`, `💰${p.coins}`])]),
        h('div.bt-fields', p.fields.map((f) => h('div.bt-field' + (f.n ? '' : '.empty'), [f.n ? stackEl(f.t, f.n, true) : null, h('div.lbl', f.n ? `${f.n}× ${TYPES[f.t].n} → 💰${wantCoins(f)}` : '')]))),
        p.pending.length ? h('div.bt-row', { style: 'margin-top:6px;align-items:center' }, [h('span.muted', { style: 'font-size:12px' }, 'to plant:'), ...p.pending.map((c) => card(c, { sm: true }))]) : null,
      ]);
    });

    // ---- middle: face-up + offers
    let mid = null;
    if (st.phase === 'trade') mid = renderTrade();

    // ---- me
    const fieldsEl = h('div.bt-fields.fields', me.fields.map((f, fi) => {
      const valid = target && (f.n === 0 || f.t === target.c.t);
      return h('div.bt-field' + (f.n ? '' : '.empty') + (valid ? '.hl' : '') + (target && !valid ? '.locked' : ''), {
        onclick: () => {
          if (!target) return;
          if (!valid) return api.toast('Different bean in that field — harvest it first, or pick another field.');
          api.sfx('card');
          act('plant', { f: fi, card: target.pending ? target.c.id : undefined });
          selPending = null;
        },
      }, [
        f.n ? stackEl(f.t, f.n, false) : null,
        h('div.lbl', f.n ? `${f.n}× ${TYPES[f.t].n} → 💰${wantCoins(f)}` : 'Empty field'),
        f.n ? h('button.btn.small', {
          style: 'position:absolute;top:4px;right:4px;padding:2px 8px;font-size:11px', title: 'Harvest this field',
          disabled: !canHarvestLocal(fi),
          onclick: (e) => { e.stopPropagation(); api.sfx('coin'); act('harvest', { f: fi }); },
        }, `Harvest 💰${wantCoins(f)}`) : null,
      ]);
    }));
    const canBuy = n > 3 && me.nf < 3 && me.coins >= 3;
    const hand = h('div.bt-hand', st.hand.length ? st.hand.map((c, i) => {
      const inDraft = draft?.give.has(c.id);
      const selectable = st.phase === 'trade' && draft;
      return card(c, { top: i === 0 && st.phase.startsWith('plant') && isMyTurn() && st.phase !== 'plantTraded', click: selectable, sel: inDraft, onclick: selectable ? () => { toggle(draft.give, c.id); render(); } : undefined });
    }) : [h('span.muted', 'Your hand is empty')]);

    const pend = myPending();
    const pendEl = pend.length ? h('div', [h('div.bt-sec', 'Beans to plant now'), h('div.bt-row', pend.map((c) => card(c, { click: pend.length > 1, sel: target && target.pending && target.c.id === c.id, onclick: () => { selPending = c.id; render(); } })))]) : null;

    const actions = [];
    if (st.phase === 'plant2' && isMyTurn()) actions.push(h('button.btn', { onclick: () => act('skip') }, 'Skip 2nd planting'));
    if (st.phase === 'trade' && isMyTurn()) actions.push(h('button.btn.primary', { onclick: () => act('endtrade') }, icon('check'), 'Done trading'));
    if (n > 3 && me.nf < 3) actions.push(h('button.btn', { disabled: !canBuy, onclick: () => act('buy'), title: 'Pay 3 coins for a third field' }, icon('add'), 'Buy 3rd field (3 coins)'));

    const meEl = h('div.bt-me' + (turnId === api.me ? '.turn' : ''), [
      h('div.row', [
        avatarEl(api.player(api.me), 'sm'),
        h('b', 'Your farm'), h('span.chip', `💰 ${me.coins}`), h('span.chip', `✋ ${st.hand.length}`),
        h('div.spacer'), ...actions,
      ]),
      fieldsEl,
      pendEl,
      h('div', [h('div.bt-sec', 'Your hand (in order — you must plant from the front)'), hand]),
    ]);

    const logEl = h('div.bt-log', logLines.slice(-4).map((l) => h('div', l)));
    root.replaceChildren(...[statusBar, mid, meEl, h('div.bt-others', oppEls), logEl].filter(Boolean));

    // prices overlay
    wrap.querySelector('.bt-prices')?.remove();
    if (showPrices) {
      wrap.append(h('div.bt-prices', { onclick: () => { showPrices = false; render(); } },
        h('table', [
          h('tr', [h('th', 'Bean'), h('th', 'Cards'), h('th', 'Beans needed → coins')]),
          ...typesInUse.map((t) => h('tr', [h('td', `${TYPES[t].e} ${TYPES[t].n}`), h('td', TYPES[t].cnt), h('td', TYPES[t].v.map(([b, c]) => `${b}→${c}💰`).join('   '))])),
          h('tr', [h('td', { colspan: 3, style: 'color:var(--muted);font-size:12px' }, 'Tap anywhere to close')]),
        ])));
    }
  }

  const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); };

  function renderTrade() {
    const iAmActive = isMyTurn();
    const offers = st.offers;
    const offerEls = offers.map((o) => {
      const mine = o.from === api.me;
      const forMe = o.to === api.me || (o.to === 'all' && !mine);
      const wantEls = o.want.map((w) => (w.id !== undefined ? card(st.faceUp.find((c) => c.id === w.id) || { t: 'red' }, { sm: true }) : h('span.bt-chip', `${w.n}× ${TYPES[w.t].e} ${TYPES[w.t].n}`)));
      return h('div.bt-offer', [
        h('div.who', `${nameOf(o.from)} → ${o.to === 'all' ? 'everyone' : nameOf(o.to)}`),
        h('div.bt-row', { style: 'align-items:center' }, o.give.length ? o.give.map((c) => card(c, { sm: true })) : [h('span.muted', 'nothing')]),
        h('span.bt-arrow', '⇄'),
        h('div.bt-row', { style: 'align-items:center' }, wantEls.length ? wantEls : [h('span.muted', 'nothing (a gift!)')]),
        h('div.spacer'),
        forMe ? h('button.btn.good.small', { onclick: () => { api.sfx('card'); act('accept', { id: o.id }); } }, icon('check'), 'Accept') : null,
        forMe || mine ? h('button.btn.small', { onclick: () => act('cancel', { id: o.id }) }, mine ? 'Cancel' : icon('close'), 'Decline') : null,
      ]);
    });

    let builder;
    if (!draft) {
      builder = h('button.btn.primary', { onclick: () => { draft = { to: iAmActive ? 'all' : st.turn, give: new Set(), wantTypes: {}, wantIds: new Set() }; render(); } }, icon('add'), 'Make an offer');
    } else {
      const d = draft;
      const toSel = iAmActive
        ? h('select.txt', { onchange: (e) => { d.to = e.target.value; } }, [h('option', { value: 'all', selected: d.to === 'all' }, 'Everyone'), ...st.order.filter((id) => id !== api.me).map((id) => h('option', { value: id, selected: d.to === id }, nameOf(id)))])
        : h('b', nameOf(st.turn));
      const faceUpPick = iAmActive
        ? st.faceUp.map((c) => card(c, { click: true, sel: d.give.has(c.id), onclick: () => { toggle(d.give, c.id); render(); } }))
        : st.faceUp.map((c) => card(c, { click: true, sel: d.wantIds.has(c.id), onclick: () => { toggle(d.wantIds, c.id); render(); } }));
      const typePick = h('div.bt-row', { style: 'align-items:center' }, [
        ...Object.entries(d.wantTypes).filter(([, k]) => k > 0).map(([t, k]) => h('span.bt-chip', `${k}× ${TYPES[t].e} ${TYPES[t].n}`, h('button', { onclick: () => { d.wantTypes[t] = Math.max(0, k - 1); render(); } }, '−'), h('button', { onclick: () => { d.wantTypes[t] = Math.min(4, k + 1); render(); } }, '+'))),
        h('select.txt', { onchange: (e) => { if (e.target.value) { d.wantTypes[e.target.value] = (d.wantTypes[e.target.value] || 0) + 1; render(); } } }, [h('option', { value: '' }, '+ ask for a bean type…'), ...typesInUse.map((t) => h('option', { value: t }, `${TYPES[t].e} ${TYPES[t].n}`))]),
      ]);
      builder = h('div.bt-offer', { style: 'flex-direction:column;align-items:stretch;gap:10px' }, [
        h('div.row', [h('b', 'New offer to'), toSel, h('div.spacer'), h('button.btn.small', { onclick: () => { draft = null; render(); } }, 'Close')]),
        h('div', [h('div.bt-sec', iAmActive ? 'I give — pick face-up cards here and/or cards from your hand below' : 'I give — pick cards from your hand below'), iAmActive ? h('div.bt-row', faceUpPick) : null]),
        h('div', [h('div.bt-sec', 'I want'), !iAmActive ? h('div.bt-row', { style: 'margin-bottom:6px' }, faceUpPick) : null, typePick, h('div.muted', { style: 'font-size:12px;margin-top:4px' }, 'Leave empty to donate (give a gift). Beans you receive must be planted.')]),
        h('button.btn.primary', {
          disabled: !d.give.size && !d.wantIds.size && !Object.values(d.wantTypes).some((k) => k > 0),
          onclick: () => {
            act('offer', { to: d.to, give: [...d.give], want: [...[...d.wantIds].map((id) => ({ id })), ...Object.entries(d.wantTypes).filter(([, k]) => k > 0).map(([t, k]) => ({ t, n: k }))] });
            draft = null;
            api.sfx('click');
          },
        }, 'Send offer'),
      ]);
    }

    return h('div.bt-mid', [
      h('div', [
        h('div.bt-sec', `Face-up cards from ${nameOf(st.turn)}'s draw`),
        h('div.bt-row', st.faceUp.length ? st.faceUp.map((c) => card(c)) : [h('span.muted', 'none left')]),
      ]),
      h('div', [h('div.bt-sec', 'Offers on the table'), h('div.col', { style: 'gap:6px' }, offerEls.length ? offerEls : [h('span.muted', 'No offers yet.')])]),
      builder,
    ]);
  }

  // ---- tiny autopilot used by automated tests (and handy for debugging)
  const autopilot = () => {
    if (!st || st.over) return false;
    const me = st.players[api.me];
    const target = plantTarget();
    if (target) {
      const fi = me.fields.findIndex((f) => f.n === 0 || f.t === target.c.t);
      if (fi >= 0) { act('plant', { f: fi, card: target.pending ? target.c.id : undefined }); return true; }
      const hv = me.fields.findIndex((f, i) => f.n > 0 && (f.n > 1 || me.fields.every((x) => x.n <= 1)) && i >= 0);
      if (hv >= 0) { act('harvest', { f: hv }); return true; }
    }
    if (st.phase === 'plant2' && isMyTurn()) { act('skip'); return true; }
    if (st.phase === 'trade') {
      if (isMyTurn() && Math.random() < 0.12) { act('endtrade'); return true; }
      const mine = st.offers.filter((o) => o.from === api.me);
      if (mine.length >= 2) { act('cancel', { id: mine[0].id }); return true; }
      for (const o of st.offers) if ((o.to === api.me || o.to === 'all') && o.from !== api.me && Math.random() < 0.2) { act('accept', { id: o.id }); return true; }
      if (Math.random() < 0.3) {
        if (isMyTurn()) act('offer', { to: 'all', give: st.faceUp.slice(0, 1).map((c) => c.id), want: [{ t: typesInUse[Math.floor(Math.random() * typesInUse.length)], n: 1 }] });
        else act('offer', { to: st.turn, give: st.hand.slice(-1).map((c) => c.id), want: st.faceUp.slice(0, 1).map((c) => ({ id: c.id })) });
        return true;
      }
    }
    return false;
  };

  return { autopilot, get state() { return st; } };
}
