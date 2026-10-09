// Texas Hold'em — 2–8 players, no-limit, with blinds, side pots and action timers.
// Host deals and enforces all rules; hole cards are only ever sent to their owner (until showdown).
import { h, clamp } from '../util.js';
import { avatarEl } from '../avatar.js';

const RANKS = '23456789TJQKA';
const SUITS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const ACT_MS = 40000;

// ---------------------------------------------------------------- hand evaluation
function evalFive(cs) {
  const r = cs.map((c) => RANKS.indexOf(c[0])).sort((a, b) => b - a);
  const flush = cs.every((c) => c[1] === cs[0][1]);
  const cnt = {};
  r.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1));
  const groups = Object.entries(cnt).map(([k, v]) => [+k, v]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let straightHigh = -1;
  const uniq = [...new Set(r)];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3; // wheel
  }
  const kick = groups.map((g) => g[0]);
  if (straightHigh >= 0 && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, ...kick];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...kick];
  if (flush) return [5, ...r];
  if (straightHigh >= 0) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, ...kick];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...kick];
  if (groups[0][1] === 2) return [1, ...kick];
  return [0, ...r];
}
const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function bestHand(cards) {
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++) for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
    const v = evalFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || cmp(v, best) > 0) best = v;
  }
  return best;
}

const CSS = `
.pk { flex:1; display:flex; flex-direction:column; min-height:0; padding:6px 8px 8px; gap:6px; overflow-y:auto; }
.pk-table { position:relative; width:100%; max-width:980px; margin:0 auto; aspect-ratio:1.85; min-height:300px; flex:none; }
.pk-felt { position:absolute; inset:9% 5%; border-radius:50%; background:radial-gradient(ellipse at center, #2fa66a 0%, #14754a 72%); border:10px solid #7a4e2a; box-shadow:0 10px 30px rgba(31,41,55,.22), inset 0 0 40px rgba(0,0,0,.35); }
.pk-center { position:absolute; left:50%; top:46%; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:6px; z-index:2; }
.pk-board { display:flex; gap:5px; min-height:70px; }
.pk-pot { background:rgba(0,0,0,.4); color:#ffe9a8; border-radius:999px; padding:3px 14px; font-weight:900; font-size:15px; }
.pk-card { width:46px; height:66px; border-radius:7px; background:#fff; color:#111; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; font-size:19px; line-height:1; box-shadow:0 2px 5px rgba(31,41,55,.22); position:relative; flex:none; }
.pk-card.r { color:#d4202e; }
.pk-card small { font-size:21px; margin-top:1px; }
.pk-card.back { background:repeating-linear-gradient(45deg, #2a3fa8 0 6px, #1c2b7c 6px 12px); border:3px solid #fff; }
.pk-card.sm { width:34px; height:49px; font-size:14px; border-radius:6px; } .pk-card.sm small { font-size:15px; }
.pk-card.win { box-shadow:0 0 0 3px #ffc857, 0 0 16px #ffc857; transform:translateY(-4px); }
.pk-card.dim { opacity:.45; }
.pk-seat { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:2px; z-index:3; width:96px; }
.pk-box { background:#fff; color:var(--on); box-shadow:var(--e1); border:2px solid transparent; border-radius:12px; padding:3px 8px; text-align:center; width:100%; position:relative; }
.pk-seat.turn .pk-box { border-color:var(--yellow); box-shadow:0 0 0 3px rgba(251,188,4,.45), var(--e2); }
.pk-seat.fold { opacity:.45; }
.pk-seat.win .pk-box { border-color:var(--green); box-shadow:0 0 0 3px rgba(30,158,75,.4), var(--e2); }
.pk-nm { font-weight:800; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pk-ch { font-weight:800; font-size:13px; color:#b06a00; }
.pk-tag { position:absolute; top:-9px; right:-6px; background:#e63946; color:#fff; font-size:10px; font-weight:900; padding:1px 6px; border-radius:8px; }
.pk-d { position:absolute; width:22px; height:22px; border-radius:50%; background:#fff; color:#111; font-weight:900; font-size:12px; display:grid; place-items:center; box-shadow:0 1px 4px rgba(31,41,55,.22); z-index:4; }
.pk-hole { display:flex; gap:2px; margin-top:-2px; }
.pk-bet { position:absolute; background:rgba(0,0,0,.55); color:#fff; border-radius:999px; font-weight:900; font-size:12px; padding:1px 9px; z-index:3; transform:translate(-50%,-50%); white-space:nowrap; }
.pk-bar { height:4px; border-radius:2px; background:#ffc857; margin-top:2px; transition:width .25s linear; }
.pk-me { display:flex; flex-direction:column; align-items:center; gap:8px; }
.pk-mycards { display:flex; gap:8px; }
.pk-mycards .pk-card { width:62px; height:90px; font-size:26px; } .pk-mycards .pk-card small { font-size:28px; }
.pk-act { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; background:var(--panel); box-shadow:var(--e2); border-radius:26px; padding:10px 12px; width:100%; max-width:760px; margin:0 auto; }
.pk-act input[type=range] { flex:1; min-width:140px; accent-color:#ffc857; }
.pk-msg { text-align:center; font-weight:800; min-height:22px; }
.pk-hn { font-size:12px; color:var(--on2); text-align:center; }
@media (max-width:640px) {
  .pk-table { aspect-ratio:.82; }
  .pk-felt { inset:7% 6%; border-width:7px; }
  .pk-card { width:38px; height:55px; font-size:16px; } .pk-card small { font-size:17px; }
  .pk-seat { width:82px; }
  .pk-mycards .pk-card { width:54px; height:78px; font-size:22px; }
}
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const startChips = +api.opts.chips || 1000;
  const maxHands = +api.opts.hands || 0;
  const rising = api.opts.blinds === 'rising';
  const baseSB = Math.max(1, Math.round(startChips / 100));
  const nameOf = (id) => api.player(id)?.name || '?';

  // ============================================================ HOST
  if (api.isHost) {
    const rng = api.rng;
    const H = { chips: {}, bet: {}, total: {}, folded: {}, allin: {}, dealt: new Set(), hole: {}, board: [], deck: [], dealer: -1, turn: -1, cur: 0, minRaise: 0, phase: 'wait', acted: new Set(), handNo: 0, out: [], reveal: {}, result: null, sb: baseSB, bb: baseSB * 2, deadline: 0, timer: 0, over: false, winSeats: new Set(), winCards: [] };
    ids.forEach((id) => { H.chips[id] = startChips; });
    const seatOk = (id) => !api.player(id).left;
    const alive = () => ids.filter((id) => H.chips[id] > 0 && seatOk(id));
    const inHand = () => ids.filter((id) => H.dealt.has(id) && !H.folded[id]);
    const canAct = (id) => H.dealt.has(id) && !H.folded[id] && !H.allin[id] && H.chips[id] > 0;
    const log = (t) => api.broadcast('log', t);
    const potTotal = () => ids.reduce((a, id) => a + (H.total[id] || 0), 0);
    const nextIdx = (i, pred) => { for (let k = 1; k <= ids.length; k++) { const j = (i + k) % ids.length; if (pred(ids[j])) return j; } return -1; };

    const publish = (to) => {
      for (const id of to ? [to] : ids) {
        if (!seatOk(id)) continue;
        api.sendTo(id, 'state', {
          phase: H.phase, board: H.board, pot: potTotal(), chips: H.chips, bet: H.bet, folded: H.folded, allin: H.allin, dealt: [...H.dealt],
          turn: H.turn >= 0 ? ids[H.turn] : null, dealer: H.dealer >= 0 ? ids[H.dealer] : null, cur: H.cur, minRaise: H.minRaise, handNo: H.handNo, sb: H.sb, bb: H.bb,
          hole: H.hole[id] || [], reveal: H.reveal, result: H.result, ms: Math.max(0, H.deadline - performance.now()), out: H.out, ids,
        });
      }
    };

    function startTimer() {
      clearTimeout(H.timer);
      H.deadline = performance.now() + ACT_MS;
      H.timer = setTimeout(() => {
        const id = ids[H.turn];
        if (!id || !['preflop', 'flop', 'turn', 'river'].includes(H.phase)) return;
        const toCall = H.cur - (H.bet[id] || 0);
        log(`⏰ ${nameOf(id)} ran out of time`);
        act(id, toCall > 0 ? { a: 'fold' } : { a: 'check' });
      }, ACT_MS + 300);
    }

    function startHand() {
      clearTimeout(H.timer);
      const al = alive();
      if (al.length < 2 || (maxHands && H.handNo >= maxHands)) return finish();
      H.handNo++;
      if (rising) { const lvl = Math.floor((H.handNo - 1) / 5); H.sb = baseSB * 2 ** lvl; H.bb = H.sb * 2; }
      const suits = 'shdc';
      H.deck = rng.shuffle([...RANKS].flatMap((r) => [...suits].map((s) => r + s)));
      H.board = []; H.bet = {}; H.total = {}; H.folded = {}; H.allin = {}; H.hole = {}; H.reveal = {}; H.result = null; H.winSeats = new Set();
      H.dealt = new Set(al);
      H.dealer = H.dealer < 0 ? ids.indexOf(al[0]) : nextIdx(H.dealer, (id) => H.chips[id] > 0 && seatOk(id));
      const heads = al.length === 2;
      const sbI = heads ? H.dealer : nextIdx(H.dealer, (id) => H.dealt.has(id));
      const bbI = nextIdx(sbI, (id) => H.dealt.has(id));
      const post = (i, amt) => { const id = ids[i]; const a = Math.min(amt, H.chips[id]); H.chips[id] -= a; H.bet[id] = (H.bet[id] || 0) + a; H.total[id] = (H.total[id] || 0) + a; if (!H.chips[id]) H.allin[id] = true; };
      post(sbI, H.sb); post(bbI, H.bb);
      H.cur = H.bb; H.minRaise = H.bb;
      for (const id of al) H.hole[id] = [H.deck.pop(), H.deck.pop()];
      H.phase = 'preflop';
      H.acted = new Set();
      H.turn = heads ? sbI : nextIdx(bbI, canAct);
      if (H.turn < 0 || !canAct(ids[H.turn])) return afterAction(true);
      log(`🃏 Hand ${H.handNo} — blinds ${H.sb}/${H.bb}`);
      publish(); startTimer();
    }

    function act(id, m) {
      if (id !== ids[H.turn] || !['preflop', 'flop', 'turn', 'river'].includes(H.phase)) return;
      const toCall = H.cur - (H.bet[id] || 0);
      const put = (amt) => { amt = Math.min(amt, H.chips[id]); H.chips[id] -= amt; H.bet[id] = (H.bet[id] || 0) + amt; H.total[id] = (H.total[id] || 0) + amt; if (!H.chips[id]) H.allin[id] = true; return amt; };
      if (m.a === 'fold') { H.folded[id] = true; log(`${nameOf(id)} folds`); H.acted.add(id); }
      else if (m.a === 'check') { if (toCall > 0) return; H.acted.add(id); log(`${nameOf(id)} checks`); }
      else if (m.a === 'call') { if (toCall <= 0) return; const a = put(toCall); H.acted.add(id); log(`${nameOf(id)} calls ${a}${H.allin[id] ? ' (all-in)' : ''}`); }
      else if (m.a === 'raise') {
        let to = Math.floor(+m.to);
        const maxTo = (H.bet[id] || 0) + H.chips[id];
        if (!(to > H.cur)) return;
        to = Math.min(to, maxTo);
        if (to < H.cur + H.minRaise && to < maxTo) to = Math.min(H.cur + H.minRaise, maxTo);
        const prev = H.cur;
        put(to - (H.bet[id] || 0));
        if (to > prev) { if (to - prev >= H.minRaise) H.minRaise = to - prev; H.cur = to; H.acted = new Set([id]); }
        else H.acted.add(id);
        log(`${nameOf(id)} ${prev === 0 ? 'bets' : 'raises to'} ${to}${H.allin[id] ? ' (all-in!)' : ''}`);
      } else return;
      afterAction();
    }

    function afterAction() {
      clearTimeout(H.timer);
      const live = inHand();
      if (live.length === 1) return awardByFold(live[0]);
      const actors = live.filter(canAct);
      const done = actors.every((id) => H.acted.has(id) && (H.bet[id] || 0) === H.cur);
      if (done) return nextPhase();
      const next = nextIdx(H.turn < 0 ? 0 : H.turn, (id) => canAct(id) && !(H.acted.has(id) && (H.bet[id] || 0) === H.cur));
      H.turn = next;
      publish(); startTimer();
    }

    function nextPhase() {
      H.bet = {}; H.cur = 0; H.minRaise = H.bb; H.acted = new Set();
      const order = ['preflop', 'flop', 'turn', 'river'];
      const i = order.indexOf(H.phase);
      if (i >= 3) return showdown();
      H.phase = order[i + 1];
      H.deck.pop(); // burn
      const n = H.phase === 'flop' ? 3 : 1;
      for (let k = 0; k < n; k++) H.board.push(H.deck.pop());
      const actors = inHand().filter(canAct);
      if (actors.length <= 1) {
        H.turn = -1;
        publish();
        return void api.timeout(nextPhase, 1300);
      }
      H.turn = nextIdx(H.dealer, canAct);
      publish(); startTimer();
    }

    function payout(winners, amt) {
      const share = Math.floor(amt / winners.length);
      let rem = amt - share * winners.length;
      for (const id of winners) { H.chips[id] += share; }
      // odd chips go to the first winner left of the dealer
      const sorted = winners.slice().sort((a, b) => ((ids.indexOf(a) - H.dealer + ids.length) % ids.length) - ((ids.indexOf(b) - H.dealer + ids.length) % ids.length));
      for (let k = 0; rem > 0; k++, rem--) H.chips[sorted[k % sorted.length]]++;
    }

    function endHand() {
      H.turn = -1; H.phase = 'showdown';
      for (const id of ids) if (H.chips[id] <= 0 && !H.out.includes(id) && H.dealt.has(id)) H.out.push(id);
      publish();
      clearTimeout(H.timer);
      api.timeout(startHand, 6500);
    }

    function awardByFold(w) {
      const amt = potTotal();
      payout([w], amt);
      H.result = { pots: [{ amt, winners: [w], hand: '' }], fold: true };
      log(`🏆 ${nameOf(w)} wins ${amt} (everyone else folded)`);
      endHand();
    }

    function showdown() {
      const live = inHand();
      const vals = {};
      for (const id of live) { vals[id] = bestHand([...H.hole[id], ...H.board]); H.reveal[id] = H.hole[id]; }
      // side pots
      const levels = [...new Set(ids.filter((id) => H.total[id] > 0).map((id) => H.total[id]))].sort((a, b) => a - b);
      let prev = 0;
      const pots = [];
      for (const lv of levels) {
        const lo = prev;
        prev = lv;
        const contributors = ids.filter((id) => (H.total[id] || 0) > lo);
        const amt = contributors.reduce((a, id) => a + Math.min(H.total[id], lv) - lo, 0);
        const elig = live.filter((id) => H.total[id] >= lv);
        if (!amt) continue;
        if (!elig.length) { contributors.forEach((id) => { H.chips[id] += Math.min(H.total[id], lv) - lo; }); continue; } // nobody left to win it: refund
        let best = null, winners = [];
        for (const id of elig) { const c = best ? cmp(vals[id], best) : 1; if (c > 0) { best = vals[id]; winners = [id]; } else if (c === 0) winners.push(id); }
        payout(winners, amt);
        pots.push({ amt, winners, hand: HAND_NAMES[best[0]] });
      }
      H.result = { pots, hands: Object.fromEntries(live.map((id) => [id, HAND_NAMES[vals[id][0]]])) };
      for (const p of pots) log(`🏆 ${p.winners.map(nameOf).join(' & ')} win${p.winners.length > 1 ? '' : 's'} ${p.amt} with ${p.hand}`);
      endHand();
    }

    function finish() {
      clearTimeout(H.timer);
      H.over = true;
      const rank = ids.slice().sort((a, b) => (H.chips[b] - H.chips[a]) || (H.out.indexOf(b) - H.out.indexOf(a)));
      const ranking = rank.map((id) => ({ id, score: H.chips[id], note: 'chips' }));
      api.endGame({ title: `${nameOf(rank[0])} wins the table!`, subtitle: `After ${H.handNo} hand${H.handNo === 1 ? '' : 's'}`, ranking, winners: [rank[0]] });
    }

    api.on('act', (m, from) => { if (!H.over) act(from, m || {}); });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (H.over) return;
      if (H.dealt.has(id) && !H.folded[id] && ['preflop', 'flop', 'turn', 'river'].includes(H.phase)) {
        if (ids[H.turn] === id) act(id, { a: 'fold' });
        else { H.folded[id] = true; afterAction(); }
      }
      if (alive().length < 2 && H.phase === 'showdown') { /* next startHand will finish */ }
    });
    api.timeout(startHand, 700);
  }

  // ============================================================ CLIENT
  let st = null;
  let raiseTo = 0;
  let deadline = 0;
  const logEl = h('div.pk-hn');
  const tableEl = h('div.pk-table');
  const msgEl = h('div.pk-msg');
  const meEl = h('div.pk-me');
  const actEl = h('div.pk-act');
  api.root.append(h('style', CSS), h('div.pk', h('div.pk-hn', 'No-limit Texas Hold’em'), tableEl, msgEl, meEl, actEl, logEl));

  api.on('state', (s) => {
    const prev = st;
    st = s;
    deadline = performance.now() + (s.ms || 0);
    if (!prev || prev.turn !== s.turn) { raiseTo = 0; if (s.turn === api.me) api.sfx('turn'); }
    if (prev && s.board.length > prev.board.length) api.sfx('card');
    if (s.phase === 'showdown' && (!prev || prev.phase !== 'showdown')) {
      const won = s.result?.pots?.some((p) => p.winners.includes(api.me));
      api.sfx(won ? 'win' : 'coin');
    }
    render();
  });
  api.on('log', (t) => { logEl.textContent = t; });
  api.onPlayersChanged(() => st && render());
  api.interval(() => {
    const bar = tableEl.querySelector('.pk-bar');
    if (bar && st) bar.style.width = clamp(((deadline - performance.now()) / ACT_MS) * 100, 0, 100) + '%';
  }, 250);

  const cardEl = (c, cls = '') => {
    if (!c) return h('div.pk-card.back' + (cls ? '.' + cls.split(' ').join('.') : ''));
    const red = c[1] === 'h' || c[1] === 'd';
    return h('div.pk-card' + (red ? '.r' : '') + (cls ? '.' + cls.split(' ').join('.') : ''), c[0] === 'T' ? '10' : c[0], h('small', SUITS[c[1]]));
  };

  function render() {
    if (!st) return;
    const n = st.ids.length;
    const narrow = api.root.clientWidth < 600;
    const myIdx = st.ids.indexOf(api.me);
    const winners = new Set((st.result?.pots || []).flatMap((p) => p.winners));
    const seats = [];
    st.ids.forEach((id, i) => {
      const rel = (i - myIdx + n) % n;
      const ang = Math.PI / 2 + (rel * 2 * Math.PI) / n;
      const x = 50 + (narrow ? 33 : 44) * Math.cos(ang), y = 50 + (narrow ? 42 : 41) * Math.sin(ang);
      const p = api.player(id);
      const folded = st.folded[id] || !st.dealt.includes(id);
      const showCards = st.reveal[id] || null;
      const inHandNow = st.dealt.includes(id) && !st.folded[id];
      const cards = id === api.me ? null : inHandNow ? h('div.pk-hole', showCards ? showCards.map((c) => cardEl(c, 'sm')) : [cardEl(null, 'sm'), cardEl(null, 'sm')]) : null;
      seats.push(h('div.pk-seat' + (st.turn === id ? '.turn' : '') + (folded && st.phase !== 'wait' ? '.fold' : '') + (st.phase === 'showdown' && winners.has(id) ? '.win' : ''), { style: { left: x + '%', top: y + '%' } }, [
        avatarEl({ ...p, online: p.online && !p.left }, 'sm' + (st.turn === id ? ' bounce' : '')),
        h('div.pk-box', [
          h('div.pk-nm', p.name + (id === api.me ? ' (you)' : '')),
          h('div.pk-ch', st.out.includes(id) && st.chips[id] === 0 ? 'out' : '💰 ' + st.chips[id]),
          st.allin[id] && inHandNow ? h('span.pk-tag', 'ALL-IN') : null,
          st.turn === id ? h('div.pk-bar', { style: { width: '100%' } }) : null,
        ]),
        cards,
        st.result?.hands?.[id] && st.phase === 'showdown' ? h('div.pk-hn', { style: 'color:#ffe9a8;font-weight:800' }, st.result.hands[id]) : null,
      ]));
      if (st.dealer === id) {
        const dx = 50 + (narrow ? 24 : 34) * Math.cos(ang + 0.35), dy = 50 + 31 * Math.sin(ang + 0.35);
        seats.push(h('div.pk-d', { style: { left: dx + '%', top: dy + '%', transform: 'translate(-50%,-50%)' } }, 'D'));
      }
      if (st.bet[id]) {
        const bx = 50 + (narrow ? 19 : 27) * Math.cos(ang), by = 50 + 25 * Math.sin(ang);
        seats.push(h('div.pk-bet', { style: { left: bx + '%', top: by + '%' } }, st.bet[id]));
      }
    });
    tableEl.replaceChildren(
      h('div.pk-felt'),
      h('div.pk-center', [
        h('div.pk-board', Array.from({ length: 5 }, (_, i) => (st.board[i] ? cardEl(st.board[i]) : h('div.pk-card', { style: 'background:rgba(255,255,255,.08);box-shadow:none' })))),
        h('div.pk-pot', `Pot ${st.pot}`),
        h('div.pk-hn', { style: 'color:rgba(255,255,255,.85)' }, `Hand ${st.handNo} · blinds ${st.sb}/${st.bb}`),
      ]),
      ...seats
    );

    // me
    const hole = st.hole;
    const imIn = st.dealt.includes(api.me) && !st.folded[api.me];
    meEl.replaceChildren(h('div.pk-mycards', hole.length ? hole.map((c) => cardEl(c, st.folded[api.me] ? 'dim' : '')) : []));

    // action bar
    const myTurn = st.turn === api.me && ['preflop', 'flop', 'turn', 'river'].includes(st.phase);
    const chips = st.chips[api.me] || 0, myBet = st.bet[api.me] || 0;
    const toCall = Math.max(0, st.cur - myBet);
    const maxTo = myBet + chips;
    const minTo = Math.min(maxTo, st.cur + st.minRaise);
    if (!raiseTo || raiseTo < minTo) raiseTo = minTo;
    raiseTo = Math.min(raiseTo, maxTo);
    const pot = st.pot;
    let msg;
    if (st.phase === 'showdown') {
      const pots = st.result?.pots || [];
      msg = st.result?.fold ? `🏆 ${pots.map((p) => p.winners.map(nameOf).join(' & ')).join(', ')} wins ${pots.map((p) => p.amt).join('+')} — everyone folded` : '🏆 ' + pots.map((p) => `${p.winners.map(nameOf).join(' & ')} win${p.winners.length > 1 ? '' : 's'} ${p.amt} (${p.hand})`).join(' · ');
    } else if (myTurn) msg = toCall ? `👉 Your turn — ${toCall} to call` : '👉 Your turn — check or bet';
    else if (st.turn) msg = `${nameOf(st.turn)} is thinking…`;
    else msg = '';
    if (st.chips[api.me] === 0 && st.out.includes(api.me)) msg = '💀 You are out of chips — stay and watch!';
    msgEl.textContent = msg;
    if (!myTurn || !imIn) { actEl.style.display = 'none'; return; }
    actEl.style.display = '';
    const raiseLabel = st.cur === 0 ? 'Bet' : 'Raise to';
    const set = (v) => { raiseTo = clamp(Math.round(v), minTo, maxTo); render(); };
    actEl.replaceChildren(
      h('button.btn.bad', { onclick: () => api.toHost('act', { a: 'fold' }) }, 'Fold'),
      toCall === 0
        ? h('button.btn', { onclick: () => api.toHost('act', { a: 'check' }) }, 'Check')
        : h('button.btn.good', { onclick: () => api.toHost('act', { a: 'call' }) }, toCall >= chips ? `Call ${chips} (all-in)` : `Call ${toCall}`),
      chips > toCall
        ? h('div.row', { style: 'flex:1;min-width:240px;flex-wrap:wrap;justify-content:center' }, [
          h('input', { type: 'range', min: minTo, max: maxTo, value: raiseTo, step: 1, oninput: (e) => { raiseTo = +e.target.value; const b = actEl.querySelector('.rbtn'); if (b) b.textContent = `${raiseLabel} ${raiseTo}`; } }),
          h('button.btn.small', { onclick: () => set(minTo) }, 'Min'),
          h('button.btn.small', { onclick: () => set(myBet + toCall + pot / 2) }, '½ pot'),
          h('button.btn.small', { onclick: () => set(myBet + toCall + pot) }, 'Pot'),
          h('button.btn.small', { onclick: () => set(maxTo) }, 'All-in'),
          h('button.btn.primary.rbtn', { onclick: () => api.toHost('act', { a: 'raise', to: raiseTo }) }, `${raiseLabel} ${raiseTo}`),
        ])
        : null
    );
  }

  return {
    get state() { return st; },
    // test helper: play a random legal action when it is my turn
    bot() {
      if (!st || st.turn !== api.me || !['preflop', 'flop', 'turn', 'river'].includes(st.phase)) return false;
      const chips = st.chips[api.me], myBet = st.bet[api.me] || 0, toCall = Math.max(0, st.cur - myBet);
      const r = Math.random();
      if (toCall === 0) {
        if (r < 0.25 && chips > st.minRaise) api.toHost('act', { a: 'raise', to: st.cur + st.minRaise * (1 + Math.floor(Math.random() * 3)) });
        else api.toHost('act', { a: 'check' });
      } else if (r < 0.15) api.toHost('act', { a: 'fold' });
      else if (r < 0.25 && chips > toCall) api.toHost('act', { a: 'raise', to: myBet + chips });
      else api.toHost('act', { a: 'call' });
      return true;
    },
  };
}

export { evalFive, bestHand, cmp, HAND_NAMES };
