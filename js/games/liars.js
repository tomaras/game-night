// Liar's Dice (Perudo-style) — 2–6 players. Everyone rolls secretly, bids on how many dice of a face
// exist across the whole table (ones are wild), or calls the previous bidder a liar. Lose a die per lost challenge.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const PIPS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const TURN_MS = 45000;

/** Perudo bidding order: is `next` a legal raise over `prev`? */
function validBid(prev, next, wild) {
  if (!(next.q >= 1 && next.f >= 1 && next.f <= 6)) return false;
  if (!prev) return true;
  if (!wild) return next.q > prev.q || (next.q === prev.q && next.f > prev.f);
  if (prev.f !== 1 && next.f === 1) return next.q >= Math.ceil(prev.q / 2);
  if (prev.f === 1 && next.f !== 1) return next.q >= prev.q * 2 + 1;
  if (prev.f === 1 && next.f === 1) return next.q > prev.q;
  return next.q > prev.q || (next.q === prev.q && next.f > prev.f);
}

const CSS = `
.ld { flex:1; display:flex; flex-direction:column; gap:10px; padding:10px; min-height:0; overflow-y:auto; max-width:900px; width:100%; margin:0 auto; }
.ld-opps { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.ld-opp { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:8px 10px; min-width:140px; text-align:center; }
.ld-opp.turn { border-color:#ffc857; box-shadow:0 0 0 2px rgba(255,200,87,.3); }
.ld-opp.dead { opacity:.4; }
.ld-opp .nm { font-weight:800; font-size:13px; display:flex; gap:6px; align-items:center; justify-content:center; }
.ld-cups { display:flex; gap:4px; justify-content:center; margin-top:6px; flex-wrap:wrap; min-height:30px; }
.ld-cup { width:26px; height:30px; border-radius:6px 6px 10px 10px; background:linear-gradient(#b0462c,#8a2f1a); border:2px solid rgba(255,255,255,.3); }
.ld-die { width:44px; height:44px; border-radius:9px; background:#fff; color:#111; display:grid; place-items:center; font-size:40px; line-height:1; box-shadow:0 2px 5px rgba(31,41,55,.22); }
.ld-die.sm { width:28px; height:28px; font-size:25px; border-radius:6px; }
.ld-die.hit { background:#ffe27a; box-shadow:0 0 0 3px #ffc857; }
.ld-die.dim { opacity:.4; }
.ld-mid { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px; text-align:center; display:flex; flex-direction:column; gap:10px; align-items:center; }
.ld-bid { font-size:30px; font-weight:900; display:flex; align-items:center; gap:10px; }
.ld-bid .ld-die { width:48px; height:48px; font-size:44px; }
.ld-hist { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; font-size:13px; color:var(--muted); }
.ld-hist span { background:var(--bg2); border-radius:999px; padding:2px 10px; }
.ld-me { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:12px; display:flex; flex-direction:column; align-items:center; gap:10px; }
.ld-me.turn { border-color:#ffc857; box-shadow:0 0 0 2px rgba(255,200,87,.3); }
.ld-dice { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.ld-pick { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:center; }
.ld-pick .qty { display:flex; align-items:center; gap:8px; font-size:24px; font-weight:900; }
.ld-pick .qty button { width:38px; height:38px; border-radius:50%; border:none; background:var(--s3); color:var(--on); font-size:20px; font-weight:900; cursor:pointer; }
.ld-faces { display:flex; gap:6px; }
.ld-faces button { padding:0; border:3px solid transparent; border-radius:11px; cursor:pointer; background:none; }
.ld-faces button.on { border-color:#ffc857; }
.ld-faces button:disabled { opacity:.3; cursor:not-allowed; }
.ld-rv { display:flex; flex-direction:column; gap:6px; width:100%; }
.ld-rv .r { display:flex; align-items:center; gap:10px; background:var(--bg2); border-radius:12px; padding:6px 10px; }
.ld-rv .r .nm { width:90px; font-weight:800; text-align:left; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ld-timer { height:4px; background:#ffc857; border-radius:2px; transition:width .25s linear; }
@media (max-width:640px) { .ld-die { width:38px; height:38px; font-size:34px; } .ld-bid { font-size:24px; } .ld-opp { min-width:110px; } }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const startDice = +api.opts.dice || 5;
  const wild = api.opts.wild !== 'off';
  const nameOf = (id) => api.player(id)?.name || '?';

  // ============================================================ HOST
  if (api.isHost) {
    const rng = api.rng;
    const H = { dice: {}, counts: {}, turn: 0, bid: null, hist: [], phase: 'bid', round: 0, reveal: null, deadline: 0, timer: 0, over: false, starter: 0 };
    ids.forEach((id) => { H.counts[id] = startDice; });
    const order = []; // elimination order
    const alive = () => ids.filter((id) => H.counts[id] > 0 && !api.player(id).left);
    const cur = () => ids[H.turn];
    const nextAlive = (i) => { for (let k = 1; k <= ids.length; k++) { const j = (i + k) % ids.length; if (alive().includes(ids[j])) return j; } return i; };
    const log = (t) => api.broadcast('log', t);

    const publish = (to) => {
      for (const id of to ? [to] : ids) {
        if (api.player(id).left) continue;
        api.sendTo(id, 'state', {
          phase: H.phase, round: H.round, turn: cur(), bid: H.bid, hist: H.hist, counts: H.counts, mine: H.dice[id] || [], total: ids.reduce((a, i) => a + H.counts[i], 0),
          reveal: H.reveal, ms: Math.max(0, H.deadline - performance.now()), ids,
        });
      }
    };
    function roll() {
      H.round++; H.phase = 'bid'; H.bid = null; H.hist = []; H.reveal = null;
      for (const id of ids) H.dice[id] = Array.from({ length: H.counts[id] }, () => 1 + Math.floor(rng.next() * 6));
      if (!alive().includes(cur())) H.turn = nextAlive(H.turn);
      startTimer();
      publish();
    }
    function startTimer() {
      clearTimeout(H.timer);
      H.deadline = performance.now() + TURN_MS;
      H.timer = setTimeout(() => {
        if (H.phase !== 'bid') return;
        log(`⏰ ${nameOf(cur())} took too long`);
        if (!H.bid) bid(cur(), { q: 1, f: 2 }); else liar(cur());
      }, TURN_MS + 300);
    }
    function bid(id, b) {
      if (H.phase !== 'bid' || id !== cur()) return;
      const nb = { q: Math.floor(+b.q), f: Math.floor(+b.f) };
      if (!validBid(H.bid, nb, wild) || nb.q > ids.reduce((a, i) => a + H.counts[i], 0)) return api.sendTo(id, 'err', 'That bid is not high enough.');
      H.bid = { ...nb, by: id };
      H.hist.push({ id, q: nb.q, f: nb.f });
      H.turn = nextAlive(H.turn);
      startTimer();
      publish();
    }
    function liar(id) {
      if (H.phase !== 'bid' || id !== cur() || !H.bid) return;
      clearTimeout(H.timer);
      const { q, f, by } = H.bid;
      let actual = 0;
      for (const i of ids) for (const d of H.dice[i]) if (d === f || (wild && d === 1 && f !== 1)) actual++;
      const bidderRight = actual >= q;
      const loser = bidderRight ? id : by;
      H.counts[loser]--;
      if (H.counts[loser] === 0) order.push(loser);
      H.phase = 'reveal';
      H.reveal = { dice: { ...H.dice }, actual, loser, caller: id, bid: H.bid, bidderRight, eliminated: H.counts[loser] === 0 };
      log(`${nameOf(id)} calls LIAR on ${nameOf(by)}'s ${q}×${PIPS[f]} — there were ${actual}. ${nameOf(loser)} loses a die${H.counts[loser] === 0 ? ' and is out!' : '.'}`);
      H.deadline = performance.now() + 6500;
      publish();
      const left = alive();
      api.timeout(() => {
        if (left.length <= 1) return finish();
        H.turn = H.counts[loser] > 0 && !api.player(loser).left ? ids.indexOf(loser) : nextAlive(ids.indexOf(loser));
        roll();
      }, 6500);
    }
    function finish() {
      clearTimeout(H.timer);
      H.over = true;
      const w = alive()[0] || ids[0];
      const rank = [w, ...order.slice().reverse().filter((i) => i !== w), ...ids.filter((i) => i !== w && !order.includes(i))];
      api.endGame({ title: `${nameOf(w)} wins!`, subtitle: 'Last one with dice', ranking: rank.map((id) => ({ id, score: H.counts[id], note: 'dice left' })), winners: [w] });
    }
    api.on('bid', (b, from) => { if (!H.over) bid(from, b); });
    api.on('liar', (_, from) => { if (!H.over) liar(from); });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (H.over) return;
      if (H.counts[id] > 0) order.push(id);
      H.counts[id] = 0;
      if (alive().length <= 1) return finish();
      if (cur() === id && H.phase === 'bid') { H.turn = nextAlive(H.turn); startTimer(); publish(); }
    });
    api.timeout(roll, 600);
  }

  // ============================================================ CLIENT
  let st = null;
  let pick = { q: 1, f: 2 };
  let deadline = 0;
  const root = h('div.ld');
  const logEl = h('div.muted.center', { style: 'font-size:13px;min-height:18px' });
  api.root.append(h('style', CSS), root);
  api.on('state', (s) => {
    const prev = st;
    st = s;
    deadline = performance.now() + (s.ms || 0);
    if (!prev || prev.round !== s.round || prev.turn !== s.turn || (prev.bid?.q !== s.bid?.q)) {
      // default pick = smallest valid raise
      pick = defaultPick();
    }
    if (prev && s.phase === 'bid' && s.turn === api.me && prev.turn !== api.me) api.sfx('turn');
    if (prev && prev.phase !== 'reveal' && s.phase === 'reveal') api.sfx(s.reveal.loser === api.me ? 'lose' : 'good');
    if (prev && s.round !== prev.round) api.sfx('clack');
    render();
  });
  api.on('log', (t) => { logEl.textContent = t; });
  api.on('err', (t) => { api.toast(t); api.sfx('bad'); });
  api.onPlayersChanged(() => st && render());
  api.interval(() => { const t = root.querySelector('.ld-timer'); if (t && st) t.style.width = Math.max(0, Math.min(100, ((deadline - performance.now()) / TURN_MS) * 100)) + '%'; }, 250);

  function defaultPick() {
    const prev = st.bid;
    if (!prev) return { q: 1, f: 2 };
    for (let q = prev.q; q <= st.total; q++) for (let f = 1; f <= 6; f++) if (validBid(prev, { q, f }, wild)) return { q, f };
    return { q: prev.q, f: prev.f };
  }
  const die = (v, cls = '') => h('div.ld-die' + (cls ? '.' + cls.split(' ').join('.') : ''), PIPS[v]);

  function render() {
    if (!st) return;
    const me = api.me;
    const myTurn = st.phase === 'bid' && st.turn === me;
    const others = st.ids.filter((id) => id !== me);
    const opps = h('div.ld-opps', others.map((id) => {
      const p = api.player(id);
      const dead = st.counts[id] <= 0;
      return h('div.ld-opp' + (st.turn === id && st.phase === 'bid' ? '.turn' : '') + (dead ? '.dead' : ''), [
        h('div.nm', avatarEl({ ...p, online: p.online && !p.left }, 'sm'), p.name),
        h('div.ld-cups', dead ? [h('span.muted', 'out')] : Array.from({ length: st.counts[id] }, () => h('div.ld-cup'))),
        st.turn === id && st.phase === 'bid' ? h('div.ld-timer') : null,
      ]);
    }));

    let mid;
    if (st.phase === 'reveal') {
      const r = st.reveal;
      mid = h('div.ld-mid', [
        h('div', { style: 'font-weight:900;font-size:20px' }, `${nameOf(r.caller)} called LIAR on ${r.bid.q} × `, die(r.bid.f, 'sm')),
        h('div.ld-rv', st.ids.filter((id) => (r.dice[id] || []).length).map((id) => h('div.r', [
          h('div.nm', nameOf(id)),
          h('div.ld-dice', r.dice[id].map((d) => die(d, 'sm' + (d === r.bid.f || (wild && d === 1 && r.bid.f !== 1) ? ' hit' : ' dim')))),
        ]))),
        h('div', { style: 'font-weight:900;font-size:18px' }, `Found ${r.actual} — ${r.bidderRight ? nameOf(r.bid.by) + ' was telling the truth' : nameOf(r.bid.by) + ' was bluffing'}!  ${nameOf(r.loser)} loses a die${r.eliminated ? ' and is OUT' : ''}.`),
      ]);
    } else {
      mid = h('div.ld-mid', [
        st.bid
          ? h('div.ld-bid', [h('span.muted', { style: 'font-size:14px' }, `${nameOf(st.bid.by)} bids`), `${st.bid.q} ×`, die(st.bid.f)])
          : h('div.muted', myTurn ? 'You open the bidding!' : `${nameOf(st.turn)} opens the bidding…`),
        h('div.muted', { style: 'font-size:13px' }, `${st.total} dice on the table${wild ? ' · 1s are wild' : ''} · round ${st.round}`),
        st.hist.length ? h('div.ld-hist', st.hist.slice(-8).map((x) => h('span', `${nameOf(x.id)}: ${x.q}×${PIPS[x.f]}`))) : null,
      ]);
    }

    const dead = st.counts[me] <= 0;
    const meEl = h('div.ld-me' + (myTurn ? '.turn' : ''), [
      h('div.row', avatarEl(api.player(me), 'sm'), h('b', dead ? 'You are out — watch the rest!' : 'Your dice (secret)')),
      h('div.ld-dice', dead ? [] : st.mine.map((d) => die(d, st.phase === 'reveal' && st.reveal && (d === st.reveal.bid.f || (wild && d === 1 && st.reveal.bid.f !== 1)) ? 'hit' : ''))),
      myTurn ? h('div.ld-timer', { style: 'width:100%' }) : null,
      myTurn ? bidControls() : st.phase === 'bid' && !dead ? h('div.muted', `Waiting for ${nameOf(st.turn)}…`) : null,
    ]);
    root.replaceChildren(opps, mid, logEl, meEl);
  }

  function bidControls() {
    const ok = validBid(st.bid, pick, wild) && pick.q <= st.total;
    const set = (q, f) => { pick = { q: Math.max(1, Math.min(st.total, q)), f }; render(); };
    return h('div.ld-pick', [
      h('div.qty', h('button', { onclick: () => set(pick.q - 1, pick.f) }, '−'), h('span', pick.q), h('button', { onclick: () => set(pick.q + 1, pick.f) }, '+')),
      h('div.ld-faces', [1, 2, 3, 4, 5, 6].map((f) => h('button' + (pick.f === f ? '.on' : ''), { onclick: () => set(pick.q, f) }, die(f, 'sm')))),
      h('button.btn.primary', { disabled: !ok, onclick: () => { api.sfx('click'); api.toHost('bid', pick); } }, `Bid ${pick.q} × ${PIPS[pick.f]}`),
      st.bid ? h('button.btn.bad', { onclick: () => api.toHost('liar') }, icon('flag'), 'Liar!') : null,
    ]);
  }
}
