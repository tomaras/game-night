// Petals & Thorns — everybody has three petals and one thorn. Secretly stack discs face-down, then bid on how many
// discs you can flip without finding a thorn. Succeed twice to win; a failed challenge costs a disc.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const CSS = `
.pt { gap:12px; }
.pt-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
.pt-p { background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:6px; position:relative; border:3px solid transparent; }
.pt-p.turn { border-color:var(--yellow); } .pt-p.out { opacity:.4; } .pt-p.chal { border-color:var(--red); }
.pt-p .nm { font:700 14px var(--font); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pt-p .meta { display:flex; gap:6px; font:700 12px var(--font); color:var(--on2); align-items:center; }
.pt-stack { display:flex; gap:4px; flex-wrap:wrap; justify-content:center; min-height:38px; }
.pt-disc { width:34px; height:34px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #8d6e63, #4e342e); box-shadow:0 2px 4px rgba(0,0,0,.3); display:grid; place-items:center; color:#fff; font-size:18px; }
.pt-disc.f { background:radial-gradient(circle at 35% 30%, #ff8fab, #e5399b); } .pt-disc.s { background:radial-gradient(circle at 35% 30%, #455a64, #111); }
.pt-disc.mine { outline:2px dashed var(--blue); outline-offset:2px; }
.pt-disc.flip { cursor:pointer; outline:3px solid var(--blue); animation:pulse 1s infinite; }
.pt-act { background:var(--surface); box-shadow:var(--e2); border-radius:26px; padding:14px; display:flex; flex-direction:column; gap:10px; align-items:center; }
.pt-act .row { flex-wrap:wrap; justify-content:center; }
.pt-step { display:flex; align-items:center; gap:14px; font:800 30px var(--font); }
.pt-step button { width:46px; height:46px; border-radius:50%; border:0; background:var(--s2); font:800 22px var(--font); cursor:pointer; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const WIN = +api.opts.points || 2;
  const nameOf = (id) => api.player(id)?.name || '?';
  const root = h('div.kt.pt');
  api.root.append(h('style', CSS), root);
  let S = null, myBid = 1;

  api.on('state', (s) => { S = s; if (s.bid && myBid <= s.bid.n) myBid = s.bid.n + 1; render(); });
  api.on('note', (n) => { api.sfx(n.k); });
  api.onPlayersChanged(() => S && render());

  const disc = (t, cls = '') => h('div.pt-disc' + (t ? '.' + t.toLowerCase() : '') + (cls ? '.' + cls : ''), t === 'F' ? '✿' : t === 'S' ? '☠' : '');

  function render() {
    if (!S) return;
    const me = api.me, mine = S.players[me];
    const myTurn = S.turn === me;
    const parts = [];
    const msg = { place: 'Everyone secretly places one disc face-down', turns: myTurn ? 'Your turn: add a disc — or start the bidding' : `${nameOf(S.turn)} is deciding…`, bidding: S.bid ? `${nameOf(S.bid.id)} bids ${S.bid.n}. ${myTurn ? 'Raise or pass' : `${nameOf(S.turn)} is thinking…`}` : '', flip: S.chal === me ? `Flip ${S.bid.n - S.flipped.length} more disc${S.bid.n - S.flipped.length === 1 ? '' : 's'} — avoid thorns!` : `${nameOf(S.chal)} is flipping…`, lose: S.chal === me ? 'You hit your own thorn — pick a disc to lose' : `${nameOf(S.chal)} is choosing what to lose…`, result: S.msg }[S.phase] || '';
    parts.push(h('div.kt-prompt', { style: '--pc:#e5399b' }, h('small', S.phase === 'flip' || S.phase === 'result' ? 'Challenge' : 'Petals & Thorns'), msg));
    parts.push(h('div.pt-grid', S.order.map((id) => {
      const p = S.players[id];
      const own = id === me;
      const revealed = p.rev || [];
      const discs = [];
      for (let i = 0; i < p.n; i++) {
        const top = p.n - 1 - i;
        const rv = (p.rev || []).includes(top) ? p.faces[top] : null;
        const flippable = S.phase === 'flip' && S.chal === me && !rv && top === (p.rev || []).length && (id === me ? !S.ownDone : S.ownDone);
        const el = rv ? disc(rv) : own ? disc(mine.stack[i], 'mine') : h('div.pt-disc');
        if (flippable) { el.classList.add('flip'); el.onclick = () => api.toHost('flip', { o: id }); }
        discs.push(el);
      }
      return h('div.pt-p' + (S.turn === id && ['turns', 'bidding', 'place'].includes(S.phase) ? '.turn' : '') + (!p.alive ? '.out' : '') + (S.chal === id ? '.chal' : ''),
        avatarEl({ ...api.player(id), online: api.player(id)?.online }, 'lg', { still: !(S.turn === id) }),
        h('div.nm', nameOf(id) + (own ? ' (you)' : '')),
        h('div.pt-stack', discs),
        h('div.meta', icon('star', 'sm'), `${p.pts}/${WIN}`, ' · ', `${p.total} discs`, p.passed ? h('span.chip', 'passed') : null, S.bid?.id === id ? h('span.chip.red', `bid ${S.bid.n}`) : null));
    })));

    if (mine.alive) {
      const act = h('div.pt-act');
      if (S.phase === 'place' && !mine.stack.length) act.append(h('div.kt-hint', 'Place your first disc (only you can see it)'), placeRow(mine));
      else if (S.phase === 'place') act.append(h('div.kt-hint', 'Waiting for the others…'));
      else if (S.phase === 'turns' && myTurn) {
        const total = S.tableTotal;
        act.append(placeRow(mine), h('div.kt-hint', '— or —'), bidRow(1, total, 'Start the bidding'));
      } else if (S.phase === 'bidding' && myTurn) act.append(bidRow(S.bid.n + 1, S.tableTotal, 'Raise'), h('button.btn.outline', { onclick: () => api.toHost('pass') }, 'Pass'));
      else if (S.phase === 'lose' && S.chal === me) act.append(h('div.kt-hint', 'Which disc do you give up?'), h('div.row', [mine.hand.F + countIn(mine.stack, 'F') > 0 ? h('button.btn.primary', { onclick: () => api.toHost('lose', { t: 'F' }) }, '✿ A petal') : null, mine.hand.S + countIn(mine.stack, 'S') > 0 ? h('button.btn.bad', { onclick: () => api.toHost('lose', { t: 'S' }) }, '☠ The thorn') : null]));
      else if (S.phase === 'flip' && S.chal === me) act.append(h('div.kt-hint', S.ownDone ? 'Now tap a rival’s stack to flip their top disc.' : 'Tap your own stack to flip your discs first.'));
      if (act.childNodes.length) parts.push(act);
      parts.push(h('div.kt-hint', `Your hand: ${mine.hand.F} petal${mine.hand.F === 1 ? '' : 's'}, ${mine.hand.S} thorn${mine.hand.S === 1 ? '' : 's'}`));
    } else parts.push(h('div.kt-hint', 'You’re out — enjoy the show!'));
    root.replaceChildren(...parts);
  }
  const countIn = (a, t) => a.filter((x) => x === t).length;
  const placeRow = (mine) => h('div.row', [
    mine.hand.F ? h('button.btn.tonal', { onclick: () => { api.toHost('place', { t: 'F' }); api.sfx('card'); } }, '✿ Place petal (' + mine.hand.F + ')') : null,
    mine.hand.S ? h('button.btn.tonal', { onclick: () => { api.toHost('place', { t: 'S' }); api.sfx('card'); } }, '☠ Place thorn (' + mine.hand.S + ')') : null,
  ]);
  const bidRow = (min, max, label) => {
    myBid = Math.max(min, Math.min(max, myBid));
    const num = h('span', myBid);
    const btn = h('button.btn.primary', { onclick: () => { api.toHost('bid', { n: myBid }); api.sfx('click'); } }, `${label}: ${myBid}`);
    const upd = () => { num.textContent = myBid; btn.textContent = `${label}: ${myBid}`; };
    return h('div.col', { style: 'align-items:center' }, h('div.kt-hint', 'How many discs can you flip without hitting a thorn?'), h('div.pt-step', h('button', { onclick: () => { myBid = Math.max(min, myBid - 1); upd(); } }, '−'), num, h('button', { onclick: () => { myBid = Math.min(max, myBid + 1); upd(); } }, '+')), btn);
  };

  // ============================================================ host
  if (api.isHost) {
    const rng = api.rng;
    const P = {};
    ids.forEach((id) => (P[id] = { hand: { F: 3, S: 1 }, stack: [], total: 4, pts: 0, alive: true, passed: false, rev: [] }));
    const H = { phase: 'place', turn: ids[0], bid: null, chal: null, flipped: [], starter: 0, order: ids, timer: 0, msg: '', ownDone: false };
    api.cleanup(() => clearTimeout(H.timer));
    const live = () => ids.filter((i) => P[i].alive && !api.player(i).left);
    const onTable = () => live().reduce((a, i) => a + P[i].stack.length, 0);
    const nextLive = (id) => { const l = live(); const i = l.indexOf(id); return l[(i + 1) % l.length]; };
    const publish = (to) => {
      for (const id of to ? [to] : ids) {
        if (api.player(id).left) continue;
        api.sendTo(id, 'state', {
          phase: H.phase, turn: H.turn, bid: H.bid, chal: H.chal, flipped: H.flipped, order: ids, msg: H.msg, tableTotal: onTable(), ownDone: H.ownDone,
          players: Object.fromEntries(ids.map((i) => [i, { n: P[i].stack.length, total: P[i].total, pts: P[i].pts, alive: P[i].alive, passed: P[i].passed, rev: P[i].rev, faces: Object.fromEntries(P[i].rev.map((r) => [r, P[i].stack[P[i].stack.length - 1 - r]])), ...(i === id ? { stack: P[i].stack, hand: P[i].hand } : { stack: [], hand: { F: 0, S: 0 } }) }])),
        });
      }
    };
    function newRound() {
      live().forEach((i) => { const p = P[i]; p.hand = { F: p.total - (p.skull ?? 1), S: p.skull ?? 1 }; });
      ids.forEach((i) => { P[i].stack = []; P[i].passed = false; P[i].rev = []; });
      H.phase = 'place'; H.bid = null; H.chal = null; H.flipped = []; H.ownDone = false; H.msg = '';
      H.turn = live()[H.starter % live().length];
      publish();
    }
    // keep per-player disc composition: p.skull = number of thorns still owned (0 or 1)
    ids.forEach((i) => { P[i].skull = 1; });
    function afterPlace() { if (live().every((i) => P[i].stack.length >= 1)) { H.phase = 'turns'; H.turn = live()[H.starter % live().length]; } }
    api.on('place', ({ t }, from) => {
      const p = P[from];
      if (!p?.alive || (t !== 'F' && t !== 'S') || !p.hand[t]) return;
      if (H.phase === 'place') { if (p.stack.length >= 1) return; }
      else if (!(H.phase === 'turns' && H.turn === from)) return;
      p.hand[t]--; p.stack.push(t);
      if (H.phase === 'place') afterPlace(); else H.turn = nextLive(from);
      publish();
    });
    api.on('bid', ({ n }, from) => {
      n = Math.floor(+n);
      if (!(H.phase === 'turns' || H.phase === 'bidding') || H.turn !== from) return;
      if (n < 1 || n > onTable() || (H.bid && n <= H.bid.n)) return;
      H.bid = { id: from, n }; H.phase = 'bidding';
      live().forEach((i) => { P[i].passed = false; });
      if (n === onTable()) return startFlip();
      H.turn = nextLive(from);
      publish();
    });
    api.on('pass', (_, from) => {
      if (H.phase !== 'bidding' || H.turn !== from) return;
      P[from].passed = true;
      const rem = live().filter((i) => !P[i].passed);
      if (rem.length === 1) return startFlip();
      let nx = nextLive(from);
      for (let k = 0; k < ids.length && P[nx].passed; k++) nx = nextLive(nx);
      if (nx === H.bid.id) return startFlip();
      H.turn = nx;
      publish();
    });
    function startFlip() { H.phase = 'flip'; H.chal = H.bid.id; H.turn = H.chal; H.flipped = []; H.ownDone = P[H.chal].stack.length === 0; publish(); }
    api.on('flip', ({ o }, from) => {
      if (H.phase !== 'flip' || from !== H.chal || !P[o]) return;
      const own = o === H.chal;
      if (!own && !H.ownDone) return;
      if (own && H.ownDone) return;
      const p = P[o];
      const idxFromTop = p.rev.length;
      if (idxFromTop >= p.stack.length) return;
      p.rev.push(idxFromTop);
      const face = p.stack[p.stack.length - 1 - idxFromTop];
      H.flipped.push({ o, face });
      api.broadcast('note', { k: face === 'S' ? 'boom' : 'pop' });
      if (own && P[H.chal].rev.length >= P[H.chal].stack.length) H.ownDone = true;
      if (face === 'S') return fail(o);
      if (H.flipped.length >= H.bid.n) return success();
      publish();
    });
    function success() {
      P[H.chal].pts++;
      H.msg = `${nameOf(H.chal)} succeeded! (${P[H.chal].pts}/${WIN})`;
      H.phase = 'result'; publish();
      if (P[H.chal].pts >= WIN) { H.timer = setTimeout(finish, 2500); return; }
      H.starter = ids.indexOf(H.chal); H.timer = setTimeout(newRound, 3500);
    }
    function fail(owner) {
      H.msg = `${nameOf(H.chal)} found ${owner === H.chal ? 'their own' : nameOf(owner) + '’s'} thorn!`;
      if (owner === H.chal && P[H.chal].total > 1 && P[H.chal].skull) { H.phase = 'lose'; publish(); return; }
      lose(H.chal, owner === H.chal ? 'F' : (Math.random() < 0.25 && P[H.chal].skull ? 'S' : 'F'));
    }
    function lose(id, t) {
      const p = P[id];
      if (t === 'S' && p.skull) p.skull = 0; else if (p.total - p.skull > 0) { /* lose a petal */ } else p.skull = 0;
      p.total--;
      if (p.total <= 0) { p.alive = false; H.msg += ` ${nameOf(id)} is out!`; }
      H.phase = 'result'; publish();
      if (live().length <= 1) { H.timer = setTimeout(finish, 2500); return; }
      H.starter = p.alive ? ids.indexOf(id) : ids.indexOf(nextLive(id)); H.timer = setTimeout(newRound, 3500);
    }
    api.on('lose', ({ t }, from) => { if (H.phase === 'lose' && from === H.chal && (t === 'F' || t === 'S')) lose(from, t); });
    function finish() {
      const ranking = ids.slice().sort((a, b) => (P[b].alive - P[a].alive) || (P[b].pts - P[a].pts) || (P[b].total - P[a].total)).map((id) => ({ id, score: P[id].pts, note: P[id].alive ? `${P[id].total} discs` : 'out' }));
      api.endGame({ title: `${nameOf(ranking[0].id)} wins the bluff!`, ranking, winners: [ranking[0].id] });
    }
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => { P[id].alive = false; if (live().length <= 1) return finish(); if (H.turn === id) { H.turn = nextLive(id); } publish(); });
    api.timeout(newRound, 600);
  }
  render();
}
