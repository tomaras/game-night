// Sushi Train — a Sushi-Go-style card drafting game. Pick a dish, pass the plate, and build the best set.
// 2–8 players, three rounds. Everyone picks at the same time!
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock } from '../kit.js';

const T = {
  tempura: ['Tempura', '🍤', '#ff7043', '2 tempura = 5 pts'],
  sashimi: ['Sashimi', '🐟', '#ec407a', '3 sashimi = 10 pts'],
  dumpling: ['Dumpling', '🥟', '#7e57c2', '1,3,6,10,15 pts for 1–5 dumplings'],
  maki1: ['Maki ×1', '🍙', '#ef5350', 'Most maki icons: 6 pts, second: 3'],
  maki2: ['Maki ×2', '🍙', '#e53935', 'Most maki icons: 6 pts, second: 3'],
  maki3: ['Maki ×3', '🍙', '#c62828', 'Most maki icons: 6 pts, second: 3'],
  egg: ['Egg nigiri', '🥚', '#fbc02d', '1 point (×3 on wasabi)'],
  salmon: ['Salmon nigiri', '🍣', '#ff8a65', '2 points (×3 on wasabi)'],
  squid: ['Squid nigiri', '🦑', '#26a69a', '3 points (×3 on wasabi)'],
  wasabi: ['Wasabi', '🥬', '#66bb6a', 'Triples the value of the next nigiri you play'],
  pudding: ['Pudding', '🍮', '#8d6e63', 'End of game: most +6, fewest −6'],
  chop: ['Chopsticks', '🥢', '#78909c', 'Later: take 2 cards in one turn (returns to hand)'],
};
const NIGIRI = { egg: 1, salmon: 2, squid: 3 };
const COUNTS = { tempura: 14, sashimi: 14, dumpling: 14, maki1: 6, maki2: 12, maki3: 8, egg: 5, salmon: 10, squid: 5, wasabi: 6, pudding: 10, chop: 4 };
const DUMP = [0, 1, 3, 6, 10, 15];

export function scoreRound(tabs) {
  const out = {};
  const maki = {};
  for (const [id, t] of Object.entries(tabs)) {
    const c = (k) => t.filter((x) => x === k).length;
    let pts = 0; const parts = [];
    const tp = Math.floor(c('tempura') / 2) * 5; if (tp) parts.push(`🍤${tp}`);
    const sa = Math.floor(c('sashimi') / 3) * 10; if (sa) parts.push(`🐟${sa}`);
    const du = DUMP[Math.min(5, c('dumpling'))]; if (du) parts.push(`🥟${du}`);
    let ng = 0, wasabi = 0;
    for (const x of t) { if (x === 'wasabi') wasabi++; else if (NIGIRI[x]) { if (wasabi > 0) { ng += NIGIRI[x] * 3; wasabi--; } else ng += NIGIRI[x]; } }
    if (ng) parts.push(`🍣${ng}`);
    pts = tp + sa + du + ng;
    maki[id] = c('maki1') + 2 * c('maki2') + 3 * c('maki3');
    out[id] = { pts, parts };
  }
  const vals = [...new Set(Object.values(maki))].filter((v) => v > 0).sort((a, b) => b - a);
  if (vals.length) {
    const first = Object.keys(maki).filter((id) => maki[id] === vals[0]);
    const g1 = Math.floor(6 / first.length);
    first.forEach((id) => { out[id].pts += g1; out[id].parts.push(`🍙${g1}`); });
    if (first.length === 1 && vals[1]) { const second = Object.keys(maki).filter((id) => maki[id] === vals[1]); const g2 = Math.floor(3 / second.length); second.forEach((id) => { out[id].pts += g2; out[id].parts.push(`🍙${g2}`); }); }
  }
  return out;
}

const CSS = `
.sg { gap:8px; }
.sg-others { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scrollbar-width:none; }
.sg-o { flex:none; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:8px 10px; min-width:130px; display:flex; flex-direction:column; gap:4px; border:3px solid transparent; font:700 12px var(--font); }
.sg-o.locked { border-color:var(--green); } .sg-o .hd { display:flex; align-items:center; gap:6px; } .sg-o .sc { margin-left:auto; color:var(--blue); font:800 14px var(--font); }
.sg-tab { display:flex; gap:3px; flex-wrap:wrap; min-height:26px; } .sg-mini { font-size:16px; line-height:1; position:relative; } .sg-mini b { position:absolute; right:-4px; bottom:-4px; font:800 9px var(--font); background:var(--on); color:#fff; border-radius:6px; padding:0 3px; }
.sg-belt { background:linear-gradient(180deg,#eceff1,#cfd8dc); border-radius:20px; padding:8px; display:flex; flex-direction:column; gap:6px; box-shadow:inset 0 2px 8px rgba(0,0,0,.08); }
.sg-tabs { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; min-height:44px; }
.sg-tc { display:flex; align-items:center; gap:3px; background:#fff; border-radius:12px; padding:3px 8px; font:800 13px var(--font); box-shadow:var(--e1); } .sg-tc .emo { font-size:18px; }
.sg-hand { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; padding:10px 0 4px; }
.sg-c { width:clamp(68px,21vw,92px); height:clamp(92px,28vw,124px); border-radius:18px; background:linear-gradient(160deg,var(--cc),color-mix(in srgb, var(--cc) 72%, #000)); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font:800 12px/1.1 var(--font); text-align:center; cursor:pointer; box-shadow:var(--e2); border:4px solid transparent; transition:transform .12s; padding:4px; }
.sg-c .em { font-size:clamp(30px,9vw,40px); line-height:1; } .sg-c small { font:600 9px/1.15 var(--font); opacity:.85; } .sg-c.sel { transform:translateY(-14px); border-color:var(--yellow); } .sg-c.locked { opacity:.5; cursor:default; }
.sg-end { text-align:center; display:flex; flex-direction:column; gap:10px; }
.sg-row { display:flex; align-items:center; gap:8px; background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:8px 12px; font:700 14px var(--font); } .sg-row .pts { margin-left:auto; color:var(--blue); font:800 18px var(--font); } .sg-row small { color:var(--on2); font:600 12px var(--font); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt.wide.sg');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, turn: 1, hands: 0, tabs: {}, hand: [], locked: new Set(), scores: {}, pud: {}, sel: [], chop: false, end: null, log: '', total: 0 };

  api.on('state', (s) => { Object.assign(S, s); S.locked = new Set(s.locked || []); if (s.ms !== undefined) clock.set(s.ms); if (s.phase === 'pick' && (!s.keep)) { S.sel = []; S.chop = false; } if (s.sfx) api.sfx(s.sfx); render(); });
  api.onPlayersChanged(render);

  const group = (arr) => { const m = new Map(); arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()]; };
  function render() {
    const me = api.me;
    if (S.phase === 'roundEnd' && S.end) {
      const e = S.end;
      root.replaceChildren(h('div.kt-prompt', { style: '--pc:#ff7043' }, h('small', e.final ? 'Final round scores' : `Round ${S.round} scores`), e.final ? 'Pudding time! 🍮' : '🍣 Tasty!'),
        ...ids.slice().sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)).map((id) => h('div.sg-row', avatarEl(api.player(id), 'sm', { still: true }), h('div', nameOf(id) + (id === me ? ' (you)' : ''), h('div', h('small', (e.parts[id] || []).join(' ') + (e.pud?.[id] ? ` · 🍮${e.pud[id] > 0 ? '+' : ''}${e.pud[id]}` : '')))), h('span.pts', S.scores[id] || 0, e.gain[id] ? h('small', ` (+${e.gain[id]})`) : null))),
        h('div.kt-hint', e.final ? 'Calculating the winner…' : 'Next round starting soon…'));
      return;
    }
    const me_tab = S.tabs[me] || [];
    const prev = scoreRound(S.tabs);
    const head = h('div.kt-row', { style: 'justify-content:center' }, h('span.chip.blue', `Round ${S.round}/3`), h('span.chip.yellow', `Pick ${S.turn}/${S.total}`), S.phase === 'pick' ? clock.el() : null);
    const others = h('div.sg-others', ids.filter((id) => id !== me).map((id) => h('div.sg-o' + (S.locked.has(id) && S.phase === 'pick' ? '.locked' : ''),
      h('div.hd', avatarEl(api.player(id), 'sm', { still: true }), nameOf(id).slice(0, 10), h('span.sc', `${S.scores[id] || 0}`)),
      h('div.sg-tab', group(S.tabs[id] || []).map(([k, n]) => h('span.sg-mini.emo', { title: T[k][0] }, T[k][1], n > 1 ? h('b', n) : null))),
      h('small', { style: 'color:var(--on3)' }, `+${prev[id]?.pts || 0} this round${S.pud[id] ? ` · 🍮${S.pud[id]}` : ''}`))));
    const mine = h('div.sg-belt', h('div.kt-title', { style: 'text-align:center' }, `Your plate · +${prev[me]?.pts || 0} this round${S.pud[me] ? ` · 🍮${S.pud[me]}` : ''}`), h('div.sg-tabs', me_tab.length ? group(me_tab).map(([k, n]) => h('div.sg-tc', { title: T[k][3] }, h('span.emo', T[k][1]), T[k][0].split(' ')[0], n > 1 ? '×' + n : '')) : h('span.muted', 'Nothing yet')));
    const locked = S.locked.has(me);
    const hasChop = me_tab.includes('chop') && S.hand.length >= 2;
    const need = S.chop ? 2 : 1;
    const hand = h('div.sg-hand', S.hand.map((c) => h('div.sg-c' + (S.sel.includes(c.id) ? '.sel' : '') + (locked ? '.locked' : ''), { style: `--cc:${T[c.t][2]}`, title: T[c.t][3], onclick: () => { if (locked || S.phase !== 'pick') return; if (S.sel.includes(c.id)) S.sel = S.sel.filter((x) => x !== c.id); else S.sel = S.sel.length >= need ? [...S.sel.slice(1), c.id] : [...S.sel, c.id]; render(); } }, h('span.em.emo', T[c.t][1]), T[c.t][0], h('small', T[c.t][3]))));
    const acts = h('div.kt-row', { style: 'justify-content:center' },
      hasChop && !locked ? h('button.btn.small' + (S.chop ? '.primary' : '.tonal'), { onclick: () => { S.chop = !S.chop; S.sel = S.sel.slice(0, S.chop ? 2 : 1); render(); } }, '🥢 Use chopsticks') : null,
      !locked ? h('button.btn.primary', { disabled: S.sel.length !== need || S.phase !== 'pick', onclick: () => { api.toHost('pick', { ids: S.sel, chop: S.chop }); api.sfx('card'); } }, icon('check'), 'Pick') : h('span.muted', S.phase === 'pick' ? 'Waiting for the others…' : ''));
    root.replaceChildren(head, others, mine, h('div.kt-hint', { style: 'font-weight:700;color:var(--on)' }, S.chop ? 'Chopsticks: choose 2 cards' : 'Pick a card — then the plate gets passed on!'), hand, acts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, turn: 0, hands: {}, tabs: {}, scores: {}, pud: {}, picks: {}, phase: 'wait', timer: 0, nid: 0, deck: [], total: 0, sfx: null, log: '' };
    ids.forEach((id) => { H.scores[id] = 0; H.pud[id] = 0; H.tabs[id] = []; H.hands[id] = []; });
    api.cleanup(() => clearTimeout(H.timer));
    const pub = (extra = {}) => ids.forEach((id) => { if (!api.player(id).left) api.sendTo(id, 'state', { phase: H.phase, round: H.round, turn: H.turn, total: H.total, tabs: H.tabs, hand: H.hands[id], locked: Object.keys(H.picks), scores: H.scores, pud: H.pud, sfx: H.sfx, ...extra }); });
    function newRound() {
      H.round++;
      if (H.round === 1) { const d = []; for (const [t, n] of Object.entries(COUNTS)) for (let i = 0; i < n; i++) d.push({ id: 'c' + H.nid++, t }); H.deck = rng.shuffle(d); }
      const per = 12 - N;
      H.total = per;
      ids.forEach((id) => { H.hands[id] = H.deck.splice(0, per); H.tabs[id] = []; });
      H.turn = 0;
      nextPick();
    }
    function nextPick() {
      H.turn++; H.picks = {}; H.phase = 'pick';
      pub({ ms: 30000 }); H.sfx = null;
      clearTimeout(H.timer);
      H.timer = setTimeout(resolve, 30500);
    }
    api.on('pick', (m, from) => {
      if (H.phase !== 'pick' || H.picks[from]) return;
      const hand = H.hands[from];
      const sel = (m.ids || []).filter((x, i, a) => a.indexOf(x) === i).map((cid) => hand.find((c) => c.id === cid));
      if (sel.some((c) => !c)) return;
      if (m.chop) { if (sel.length !== 2 || !H.tabs[from].includes('chop')) return; } else if (sel.length !== 1) return;
      H.picks[from] = { ids: sel.map((c) => c.id), chop: !!m.chop };
      if (ids.filter((i) => !api.player(i).left).every((i) => H.picks[i])) { clearTimeout(H.timer); H.timer = setTimeout(resolve, 400); } else pub({ keep: true });
    });
    function resolve() {
      clearTimeout(H.timer);
      if (H.phase !== 'pick') return;
      ids.forEach((id) => { if (!H.picks[id]) { const c = rng.pick(H.hands[id]); if (c) H.picks[id] = { ids: [c.id], chop: false }; } });
      ids.forEach((id) => {
        const pk = H.picks[id]; if (!pk) return;
        pk.ids.forEach((cid) => { const i = H.hands[id].findIndex((c) => c.id === cid); if (i >= 0) H.tabs[id].push(H.hands[id].splice(i, 1)[0].t); });
        if (pk.chop) { const ci = H.tabs[id].indexOf('chop'); if (ci >= 0) { H.tabs[id].splice(ci, 1); H.hands[id].push({ id: 'c' + H.nid++, t: 'chop' }); } }
      });
      // pass hands to the left
      const hs = ids.map((id) => H.hands[id]);
      ids.forEach((id, i) => (H.hands[id] = hs[(i + 1) % N]));
      H.picks = {};
      H.sfx = 'pop';
      if (H.hands[ids[0]].length === 0) return endRound();
      H.phase = 'reveal';
      pub({ keep: false });
      H.timer = setTimeout(nextPick, 900);
    }
    function endRound() {
      const res = scoreRound(H.tabs);
      const gain = {}, parts = {};
      ids.forEach((id) => { gain[id] = res[id].pts; parts[id] = res[id].parts; H.scores[id] += res[id].pts; H.pud[id] += H.tabs[id].filter((x) => x === 'pudding').length; });
      const final = H.round >= 3;
      let pud = null;
      if (final) {
        pud = {};
        const mx = Math.max(...ids.map((i) => H.pud[i])), mn = Math.min(...ids.map((i) => H.pud[i]));
        const top = ids.filter((i) => H.pud[i] === mx), bot = ids.filter((i) => H.pud[i] === mn);
        if (mx > 0 || mn !== mx) { top.forEach((i) => (pud[i] = Math.floor(6 / top.length))); if (N > 2 && mn !== mx) bot.forEach((i) => (pud[i] = -Math.floor(6 / bot.length))); }
        ids.forEach((i) => { if (pud[i]) { H.scores[i] += pud[i]; gain[i] += pud[i]; } });
      }
      H.phase = 'roundEnd'; H.sfx = 'win';
      pub({ end: { gain, parts, final, pud } });
      H.timer = setTimeout(() => { if (final) finish(); else newRound(); }, final ? 9000 : 8000);
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: 'pts' }));
      const top = ranking[0].score;
      api.endGame({ title: `${ranking.filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} wins the feast!`, subtitle: `${top} points`, ranking, winners: ranking.filter((r) => r.score === top).map((r) => r.id) });
    }
    api.onRejoin(() => pub({ keep: true }));
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 2) { clearTimeout(H.timer); finish(); } else if (H.phase === 'pick' && ids.filter((i) => !api.player(i).left).every((i) => H.picks[i])) resolve(); });
    api.timeout(newRound, 800);
  }
  render();
}
