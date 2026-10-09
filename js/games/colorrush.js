// Color Rush — an UNO-style shedding card game for 2–8 players. Host deals & enforces rules.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const COLS = { r: '#e5383b', y: '#f6b400', g: '#2b9348', b: '#2f6fed', w: '#23233a' };
const COLNAME = { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue' };
const SYM = { S: '🚫', R: '🔁', D: '+2', W: '🌈', F: '+4' };
const pts = (c) => (c.v >= '0' && c.v <= '9' ? +c.v : c.v === 'W' || c.v === 'F' ? 50 : 20);

const CSS = `
.cr { flex:1; display:flex; flex-direction:column; gap:8px; padding:8px; min-height:0; overflow-y:auto; }
.cr-opps { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.cr-opp { display:flex; align-items:center; gap:8px; background:var(--panel); box-shadow:var(--e1); border-radius:20px; padding:6px 12px; min-width:130px; }
.cr-opp.turn { box-shadow:0 0 0 3px var(--yellow); }
.cr-opp .nm { font-weight:800; font-size:13px; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cr-opp .ct { margin-left:auto; font-weight:800; font-size:17px; background:var(--blue-c); color:var(--blue-d); border-radius:12px; padding:2px 10px; }
.cr-opp .sc { font-size:11px; color:var(--muted); }
.cr-mid { background:radial-gradient(ellipse at 50% 40%, #2fa66a, #14754a 75%); border-radius:32px; box-shadow:inset 0 0 0 6px rgba(255,255,255,.18), var(--e1); flex:1; min-height:150px; display:flex; align-items:center; justify-content:center; gap:26px; position:relative; }
.cr-card { width:72px; height:106px; border-radius:11px; background:var(--cc); border:4px solid #fff; box-shadow:0 3px 8px rgba(31,41,55,.22); display:grid; place-items:center; font-weight:900; font-size:34px; color:#fff; position:relative; flex:none; user-select:none; text-shadow:0 2px 3px rgba(0,0,0,.4); }
.cr-card::before { content:''; position:absolute; inset:9px 6px; border-radius:50%; background:rgba(0,0,0,.08); transform:rotate(25deg); }
.cr-card i { position:absolute; font-style:normal; font-size:13px; }
.cr-card i.tl { top:3px; left:6px; } .cr-card i.br { bottom:3px; right:6px; transform:rotate(180deg); }
.cr-card.w { background:conic-gradient(#e5383b 0 25%, #2f6fed 0 50%, #2b9348 0 75%, #f6b400 0); }
.cr-card.back { background:#1b1b2f; font-size:15px; color:#fff; }
.cr-card > span { position:relative; z-index:1; }
.cr-card.back::before { background:#e5383b; inset:30px 8px; border-radius:50%; }
.cr-card.pile { cursor:pointer; }
.cr-card.pile.can { box-shadow:0 0 0 4px #ffc857, 0 3px 8px rgba(0,0,0,.5); animation:pulse 1s infinite; }
.cr-hand { display:flex; gap:0; padding:20px 10px 8px; overflow-x:auto; min-height:140px; align-items:flex-end; justify-content:safe center; }
.cr-hand .cr-card { margin-left:-22px; transition:transform .12s; cursor:pointer; }
.cr-hand .cr-card:first-child { margin-left:0; }
.cr-hand .cr-card.ok:hover, .cr-hand .cr-card.ok.sel { transform:translateY(-16px); z-index:2; }
.cr-hand .cr-card.no { filter:brightness(.5) saturate(.6); cursor:not-allowed; }
.cr-msg { text-align:center; font-weight:800; min-height:22px; }
.cr-actions { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
.cr-dot { width:34px; height:34px; border-radius:50%; border:4px solid #fff; background:var(--cc); box-shadow:0 0 14px var(--cc); }
.cr-dir { font-size:26px; color:#fff; }
.cr-pick { position:absolute; inset:0; z-index:15; border-radius:32px; background:rgba(15,23,42,.8); display:grid; place-items:center; }
.cr-pick .opts { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.cr-pick button { width:110px; height:84px; border-radius:16px; border:4px solid #fff; color:#fff; font-weight:900; font-size:17px; cursor:pointer; text-shadow:0 2px 3px rgba(0,0,0,.4); }
.cr-log { font-size:12px; color:var(--muted); text-align:center; min-height:16px; }
@media (max-width:640px) { .cr-card { width:58px; height:86px; font-size:28px; } .cr-hand .cr-card { margin-left:-26px; } .cr-mid { gap:16px; min-height:120px; } .cr-opp { min-width:0; padding:5px 8px; } .cr-opp .nm { max-width:60px; } }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const target = +api.opts.target || 0;
  const nameOf = (id) => api.player(id)?.name || '?';

  // ============================================================ HOST
  let publish = () => {};
  if (api.isHost) {
    const rng = api.rng;
    const H = { deck: [], discard: [], hands: {}, turn: 0, dir: 1, color: 'r', drawn: null, unoRisk: null, riskTurns: 0, called: {}, scores: {}, round: 0, over: false, between: false, nid: 0 };
    ids.forEach((id) => (H.scores[id] = 0));
    const live = () => ids.filter((id) => !api.player(id).left);
    const cur = () => ids[H.turn];
    const top = () => H.discard[H.discard.length - 1];
    const log = (t) => api.broadcast('log', t);
    const mk = (c, v) => ({ id: ++H.nid, c, v });
    function newDeck() {
      const d = [];
      for (const c of 'rygb') {
        d.push(mk(c, '0'));
        for (let n = 1; n <= 9; n++) { d.push(mk(c, String(n))); d.push(mk(c, String(n))); }
        for (const v of 'SRD') { d.push(mk(c, v)); d.push(mk(c, v)); }
      }
      for (let i = 0; i < 4; i++) { d.push(mk('w', 'W')); d.push(mk('w', 'F')); }
      return rng.shuffle(d);
    }
    function draw() {
      if (!H.deck.length) {
        const keep = H.discard.pop();
        H.deck = rng.shuffle(H.discard); H.discard = [keep];
        if (H.deck.length) log('♻️ Reshuffled the discard pile');
      }
      return H.deck.pop() || null;
    }
    function deal() {
      H.round++;
      H.deck = newDeck(); H.discard = []; H.dir = 1; H.drawn = null; H.unoRisk = null; H.called = {}; H.between = false;
      ids.forEach((id) => { H.hands[id] = []; });
      for (let i = 0; i < 7; i++) ids.forEach((id) => { if (!api.player(id).left) H.hands[id].push(draw()); });
      let c;
      do { c = H.deck.pop(); if (c.c === 'w' || !/\d/.test(c.v)) { H.deck.unshift(c); c = null; } } while (!c);
      H.discard.push(c); H.color = c.c;
      H.turn = (H.round - 1) % ids.length;
      while (api.player(cur()).left) H.turn = (H.turn + 1) % ids.length;
      log(`🃏 Round ${H.round}: ${nameOf(cur())} starts`);
      publish();
    }
    publish = (to) => {
      const base = (id) => ({
        order: ids, turn: cur(), dir: H.dir, color: H.color, top: top(), deck: H.deck.length,
        counts: Object.fromEntries(ids.map((i) => [i, (H.hands[i] || []).length])), hand: H.hands[id] || [], drawn: cur() === id ? H.drawn : null,
        unoRisk: H.unoRisk, scores: H.scores, round: H.round, between: H.between, over: H.over, target,
      });
      for (const id of to ? [to] : ids) if (!api.player(id).left) api.sendTo(id, 'state', base(id));
    };
    const playable = (c) => c.c === 'w' || c.c === H.color || c.v === top().v;
    function advance(skip = 0) {
      H.drawn = null;
      for (let k = 0; k <= skip; k++) {
        do { H.turn = (H.turn + H.dir + ids.length) % ids.length; } while (api.player(cur()).left);
      }
      if (H.unoRisk && --H.riskTurns < 0) H.unoRisk = null;
      publish();
    }
    function giveCards(id, n) { for (let i = 0; i < n; i++) { const c = draw(); if (c) H.hands[id].push(c); } }
    function roundWin(winner) {
      let gain = 0;
      for (const id of ids) if (id !== winner) gain += (H.hands[id] || []).reduce((a, c) => a + pts(c), 0);
      H.scores[winner] += target ? gain : 0;
      H.between = true;
      log(`🏁 ${nameOf(winner)} wins round ${H.round}${target ? ` (+${gain})` : ''}`);
      const done = !target || H.scores[winner] >= target;
      publish();
      api.timeout(() => {
        if (done) {
          const left = (id) => (H.hands[id] || []).reduce((a, c) => a + pts(c), 0);
          const ranking = ids.slice().sort((a, b) => (a === winner ? -1 : b === winner ? 1 : target ? H.scores[b] - H.scores[a] : left(a) - left(b))).map((id) => ({ id, score: target ? H.scores[id] : id === winner ? 'WIN' : left(id), note: target ? 'points' : id === winner ? '' : 'pts in hand' }));
          H.over = true; publish();
          api.endGame({ title: `${nameOf(winner)} wins!`, subtitle: target ? `First to ${target} points` : 'First to empty their hand', ranking, winners: [winner] });
        } else deal();
      }, 4500);
    }

    api.on('play', ({ id, color }, from) => {
      if (H.over || H.between || from !== cur()) return;
      const hand = H.hands[from];
      const card = hand.find((c) => c.id === id);
      if (!card || (H.drawn !== null && H.drawn !== id)) return;
      if (!playable(card)) return api.sendTo(from, 'err', "You can't play that card.");
      if (card.c === 'w' && !'rygb'.includes(color)) return;
      hand.splice(hand.indexOf(card), 1);
      H.discard.push(card);
      H.color = card.c === 'w' ? color : card.c;
      let skip = 0;
      const nxt = () => { let i = H.turn; do { i = (i + H.dir + ids.length) % ids.length; } while (api.player(ids[i]).left); return ids[i]; };
      if (card.v === 'S') { skip = 1; log(`🚫 ${nameOf(nxt())} is skipped`); }
      else if (card.v === 'R') { H.dir *= -1; if (live().length === 2) skip = 1; log('🔁 Direction reversed'); }
      else if (card.v === 'D') { const t = nxt(); giveCards(t, 2); skip = 1; log(`➕ ${nameOf(t)} draws 2`); }
      else if (card.v === 'F') { const t = nxt(); giveCards(t, 4); skip = 1; log(`➕ ${nameOf(t)} draws 4 — color is ${COLNAME[color]}`); }
      else if (card.v === 'W') log(`🌈 Color is now ${COLNAME[color]}`);
      if (!hand.length) return roundWin(from);
      if (hand.length === 1) {
        if (H.called[from]) { log(`🔔 ${nameOf(from)}: UNO!`); H.called[from] = false; }
        else { H.unoRisk = from; H.riskTurns = 1; }
      }
      advance(skip);
    });
    api.on('draw', (_, from) => {
      if (H.over || H.between || from !== cur() || H.drawn !== null) return;
      const c = draw();
      if (!c) { log('No cards left to draw'); return advance(); }
      H.hands[from].push(c);
      if (playable(c)) { H.drawn = c.id; publish(); } else { log(`${nameOf(from)} drew a card and passes`); advance(); }
    });
    api.on('pass', (_, from) => { if (!H.over && !H.between && from === cur() && H.drawn !== null) advance(); });
    api.on('uno', (_, from) => {
      if (H.hands[from]?.length <= 2) {
        if (H.unoRisk === from) { H.unoRisk = null; log(`🔔 ${nameOf(from)}: UNO!`); } else H.called[from] = true;
        publish();
      }
    });
    api.on('catch', (_, from) => {
      if (!H.unoRisk || H.unoRisk === from) return;
      const t = H.unoRisk;
      H.unoRisk = null;
      giveCards(t, 2);
      log(`🚨 ${nameOf(from)} caught ${nameOf(t)} without calling UNO — draws 2!`);
      publish();
    });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (H.over) return;
      if (live().length < 2) {
        const w = live()[0];
        H.over = true;
        return api.endGame({ title: w ? `${nameOf(w)} wins!` : 'Game over', subtitle: 'Everyone else left', ranking: w ? [{ id: w, score: 'WIN' }] : [], winners: w ? [w] : [] });
      }
      H.deck.push(...(H.hands[id] || [])); H.hands[id] = [];
      H.deck = rng.shuffle(H.deck);
      if (cur() === id) advance(); else publish();
    });
    api.timeout(deal, 500);
  }

  // ============================================================ CLIENT
  let st = null;
  let pendingWild = null;
  const logEl = h('div.cr-log');
  const root = h('div.cr');
  api.root.append(h('style', CSS), root);

  api.on('state', (s) => {
    const was = st;
    st = s;
    if (was && was.top && s.top && was.top.id !== s.top.id) api.sfx('card');
    if (s.turn === api.me && (!was || was.turn !== api.me) && !s.between) api.sfx('turn');
    pendingWild = null;
    render();
  });
  api.on('log', (t) => { logEl.textContent = t; });
  api.on('err', (t) => { api.toast(t); api.sfx('bad'); });
  api.onPlayersChanged(() => st && render());

  const cardEl = (c, opts = {}) => {
    const sym = SYM[c.v] || c.v;
    return h('div.cr-card' + (c.c === 'w' ? '.w' : '') + (opts.cls ? '.' + opts.cls : ''), { style: { '--cc': COLS[c.c] }, onclick: opts.onclick, title: c.c === 'w' ? 'Wild' : COLNAME[c.c] + ' ' + sym }, h('i.tl', sym), sym, h('i.br', sym));
  };
  const playableLocal = (c) => c.c === 'w' || c.c === st.color || c.v === st.top.v;

  function playCard(c) {
    if (st.turn !== api.me || st.between) return;
    if (st.drawn !== null && st.drawn !== c.id) return api.toast('You drew that card — play it or pass.');
    if (!playableLocal(c)) return api.toast("That card doesn't match the color or number.");
    if (c.c === 'w') { pendingWild = c; return render(); }
    api.toHost('play', { id: c.id });
  }

  function render() {
    if (!st) return;
    const me = api.me;
    const myTurn = st.turn === me && !st.between;
    const others = st.order.filter((id) => id !== me);
    const opps = h('div.cr-opps', others.map((id) => {
      const p = api.player(id);
      return h('div.cr-opp' + (st.turn === id && !st.between ? '.turn' : ''), [
        avatarEl({ ...p, online: p.online && !p.left }, 'sm' + (st.turn === id ? ' bounce' : '')),
        h('div', [h('div.nm', p.name), st.target ? h('div.sc', `${st.scores[id]} pts`) : null]),
        h('div.ct', st.counts[id]),
        st.unoRisk === id ? h('button.btn.bad.small', { onclick: () => api.toHost('catch') }, 'Catch!') : null,
      ]);
    }));

    const mid = h('div.cr-mid', [
      h('div.cr-card.back.pile' + (myTurn && st.drawn === null ? '.can' : ''), { onclick: () => { if (myTurn && st.drawn === null) api.toHost('draw'); }, title: 'Draw a card' }, h('span', 'DRAW')),
      cardEl(st.top),
      h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:8px;color:#fff' }, [
        h('div.cr-dot', { style: { '--cc': COLS[st.color] }, title: COLNAME[st.color] }),
        h('div.cr-dir', st.dir === 1 ? '↻' : '↺'),
        h('div', { style: 'font-size:12px;opacity:.85' }, `deck ${st.deck}`),
      ]),
      pendingWild
        ? h('div.cr-pick', h('div', [h('h3.center', { style: 'margin-bottom:12px' }, 'Choose a color'), h('div.opts', 'rygb'.split('').map((c) => h('button', { style: { background: COLS[c] }, onclick: () => { api.toHost('play', { id: pendingWild.id, color: c }); pendingWild = null; } }, COLNAME[c])))]))
        : null,
    ]);

    const hand = st.hand.slice().sort((a, b) => (a.c === b.c ? (a.v < b.v ? -1 : 1) : a.c < b.c ? -1 : 1));
    const handEl = h('div.cr-hand', hand.map((c) => cardEl(c, { cls: myTurn && playableLocal(c) && (st.drawn === null || st.drawn === c.id) ? 'ok' : 'no', onclick: () => playCard(c) })));
    const msg = st.between ? '🏁 Round over — next round starting…' : myTurn ? (st.drawn !== null ? 'You drew a playable card — play it or pass.' : '👉 Your turn! Play a card or tap the pile to draw.') : `${nameOf(st.turn)}'s turn`;
    const showUno = st.hand.length <= 2 && st.hand.length > 0;
    const actions = h('div.cr-actions', [
      st.drawn !== null && myTurn ? h('button.btn', { onclick: () => api.toHost('pass') }, 'Pass') : null,
      showUno ? h('button.btn.primary' + (st.unoRisk === me ? '.big' : ''), { onclick: () => { api.toHost('uno'); api.sfx('good'); } }, icon('notifications'), 'UNO!') : null,
    ].filter(Boolean));
    root.replaceChildren(opps, mid, h('div.cr-msg', msg), logEl, actions, handEl);
  }
}
