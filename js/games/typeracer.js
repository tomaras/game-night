// Type Racer — 2–8 players race to type the same passage. Typing is checked locally; progress is shared live.
import { h } from '../util.js';
import { avatarEl } from '../avatar.js';

const TEXTS = [
  'The quick brown fox jumps over the lazy dog while the sun sets slowly behind the mountains and the evening air fills with the sound of crickets.',
  'Learning to cook is mostly about patience. Start with simple recipes, taste as you go, and never be afraid to add a little more garlic.',
  'A good friend is someone who laughs at your worst jokes, remembers your favorite snack, and shows up with a pizza when your day has gone sideways.',
  'On a clear night far from the city lights you can see thousands of stars, and every one of them is a sun with its own story to tell.',
  'The old lighthouse stood at the edge of the cliff, its beam sweeping across the dark water to guide the little fishing boats safely back to harbor.',
  'To build a great team you need people who disagree politely, share credit generously, and still enjoy a cup of coffee together on a Monday morning.',
  'Rain tapped softly on the window while the cat stretched out on the warm blanket, and for a moment the whole world felt calm and quiet.',
  'Every great journey begins with a single step, but it also helps to pack snacks, charge your phone, and check that you actually know where you are going.',
  'The market was full of color: bright oranges stacked in pyramids, baskets of fresh herbs, and a baker calling out that the bread was still warm.',
  'Practice does not make perfect, but it does make progress. Keep showing up, keep trying again, and one day the hard thing will feel easy.',
  'When the power went out the whole family gathered around the table, lit a few candles, and played card games until the lights flickered back on.',
  'Space is big, quiet, and cold, yet astronauts say that looking back at our small blue planet is the most beautiful sight in the universe.',
  'He opened the dusty book and found a map drawn in faded ink, with a tiny red cross marking a spot somewhere deep inside the forest.',
  'Music has a funny way of bringing people together. One song comes on and suddenly strangers are singing the chorus at the top of their voices.',
  'The robot beeped twice, rolled across the kitchen floor, and carefully placed a single slice of toast on the plate before beeping a third time.',
  'Mountains teach patience. You climb slowly, rest often, and when you finally reach the top the view makes every tired step completely worth it.',
  'My grandmother always said that a house is not a home until it smells like something delicious and someone is humming happily in the kitchen.',
  'Sometimes the best ideas arrive in the shower, on a long walk, or just before falling asleep, which is why you should always keep a notebook nearby.',
  'The festival lasted three days, with parades in the street, lanterns floating on the river, and fireworks that lit up the sky until midnight.',
  'A tiny seed can become a giant tree if you give it sunshine, water, and enough time, and the same is true for almost every big dream.',
  'We raced down the hill on our bikes, wind in our hair, shouting at the top of our lungs, completely certain that summer would never end.',
  'The detective looked at the clues again: a muddy footprint, a half eaten sandwich, and a note that simply said meet me by the clock tower.',
  'Whenever I feel stuck I take a deep breath, make a list of small steps, and do the easiest one first. Momentum is surprisingly powerful.',
  'The ocean is endless and mysterious. Beneath the waves live glowing jellyfish, giant squid, and creatures that scientists have not even named yet.',
];

const CSS = `
.tr { flex:1; display:flex; flex-direction:column; gap:12px; padding:12px; min-height:0; overflow-y:auto; max-width:900px; width:100%; margin:0 auto; }
.tr-lanes { display:flex; flex-direction:column; gap:6px; }
.tr-lane { display:flex; align-items:center; gap:10px; background:var(--panel); box-shadow:var(--e1); border-radius:20px; padding:6px 12px; }
.tr-lane.me { box-shadow:0 0 0 2px var(--blue), var(--e1); }
.tr-lane .nm { width:96px; font-weight:800; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tr-track { flex:1; height:30px; position:relative; background:linear-gradient(90deg, transparent 0, transparent calc(100% - 3px), #fff calc(100% - 3px)), repeating-linear-gradient(90deg, rgba(0,0,0,.08) 0 2px, transparent 2px 40px), var(--bg2); border-radius:8px; }
.tr-car { position:absolute; top:-2px; transform:translateX(-50%); transition:left .2s linear; }
.tr-lane .st { width:92px; text-align:right; font-weight:800; font-size:13px; font-variant-numeric:tabular-nums; }
.tr-text { background:var(--panel); box-shadow:var(--e1); border-radius:24px; padding:18px 20px; font-size:clamp(17px, 2.4vw, 24px); line-height:1.65; font-family:ui-monospace, Menlo, Consolas, monospace; user-select:none; }
.tr-text .ok { color:var(--green); } .tr-text .bad { color:#fff; background:var(--red); border-radius:3px; } .tr-text .cur { border-bottom:3px solid var(--blue); color:var(--on); background:var(--blue-c); } .tr-text .rest { color:var(--on3); }
.tr-input { font-size:20px; padding:14px 16px; font-family:ui-monospace, Menlo, Consolas, monospace; }
.tr-input.err { border-color:#d94452; box-shadow:0 0 0 3px rgba(217,68,82,.3); }
.tr-info { text-align:center; font-weight:800; font-size:24px; min-height:32px; color:var(--blue); }
.tr-board { display:flex; flex-direction:column; gap:6px; }
.tr-board .r { display:flex; align-items:center; gap:10px; background:var(--panel); box-shadow:var(--e1); border-radius:16px; padding:6px 12px; font-weight:800; }
.tr-board .r span.sp { margin-left:auto; color:var(--muted); font-size:13px; }
@media (max-width:640px) { .tr-lane .nm { width:60px; } .tr-lane .st { width:60px; font-size:11px; } .tr-text { padding:12px; } }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const rounds = +api.opts.rounds || 3;
  const nameOf = (id) => api.player(id)?.name || '?';

  // ------------------------------------------------------------ client
  const S = { text: '', phase: 'wait', round: 0, prog: {}, wpm: {}, done: {}, startAt: 0, points: {}, board: null, cd: 0 };
  ids.forEach((id) => { S.prog[id] = 0; S.points[id] = 0; });
  const info = h('div.tr-info');
  const lanes = h('div.tr-lanes');
  const textEl = h('div.tr-text');
  const input = h('input.txt.tr-input', { placeholder: 'Wait for the start…', disabled: true, autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done' });
  const board = h('div.tr-board');
  api.root.append(h('style', CSS), h('div.tr', info, lanes, textEl, input, board));
  let good = 0, bad = 0, lastLen = 0, startT = 0, finished = false, lastSend = 0;

  input.addEventListener('paste', (e) => e.preventDefault());
  input.addEventListener('drop', (e) => e.preventDefault());
  input.addEventListener('input', () => {
    if (S.phase !== 'race' || finished) return;
    const v = input.value, t = S.text;
    if (v.length > lastLen) { if (t.startsWith(v)) good += v.length - lastLen; else bad += v.length - lastLen; }
    lastLen = v.length;
    let c = 0;
    while (c < v.length && v[c] === t[c]) c++;
    S.prog[api.me] = c;
    input.classList.toggle('err', c < v.length);
    renderText(c, v.length);
    const elapsed = (performance.now() - startT) / 60000;
    const wpm = Math.round(c / 5 / Math.max(elapsed, 0.01));
    S.wpm[api.me] = wpm;
    const now = performance.now();
    if (now - lastSend > 120 || c === t.length) { lastSend = now; api.toHost('p', { c, wpm }); }
    if (c === t.length && v.length === t.length) {
      finished = true; input.disabled = true;
      api.toHost('done', { wpm, acc: Math.round((good / Math.max(1, good + bad)) * 100), ms: Math.round(performance.now() - startT) });
      api.sfx('win');
    }
    renderLanes();
  });

  function renderText(c = 0, typed = 0) {
    const t = S.text;
    textEl.replaceChildren(
      h('span.ok', t.slice(0, c)),
      typed > c ? h('span.bad', t.slice(c, typed)) : null,
      h('span.cur', t[Math.max(c, typed)] || ''),
      h('span.rest', t.slice(Math.max(c, typed) + 1))
    );
  }
  function renderLanes() {
    lanes.replaceChildren(...ids.map((id) => {
      const p = api.player(id);
      const pct = S.text ? (S.prog[id] / S.text.length) * 100 : 0;
      const d = S.done[id];
      return h('div.tr-lane' + (id === api.me ? '.me' : ''), [
        h('div.nm', p.name), h('div.tr-track', h('div.tr-car', { style: { left: Math.min(97, Math.max(2, pct)) + '%' } }, avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: d ? false : true }))),
        h('div.st', d ? `🏁 #${d.rank} · ${d.wpm}` : S.wpm[id] ? S.wpm[id] + ' wpm' : '—'),
      ]);
    }));
  }
  function renderBoard() {
    if (!S.board) { board.replaceChildren(); return; }
    board.replaceChildren(h('div.muted.center', { style: 'font-weight:800' }, `Round ${S.round} results`), ...S.board.map((r, i) => h('div.r', [h('span', i + 1 + '.'), nameOf(r.id), h('span.sp', `${r.wpm ? r.wpm + ' wpm · ' + r.acc + '% acc · ' : 'did not finish · '}+${r.pts} pts (total ${S.points[r.id]})`)])));
  }

  api.on('round', (r) => {
    S.text = r.text; S.round = r.n; S.phase = 'count'; S.board = null; S.done = {}; S.wpm = {};
    ids.forEach((id) => (S.prog[id] = 0));
    good = bad = lastLen = 0; finished = false;
    input.value = ''; input.disabled = true; input.classList.remove('err'); input.placeholder = 'Get ready…';
    renderText(); renderLanes(); renderBoard();
    info.textContent = `Round ${r.n} of ${rounds}`;
  });
  api.on('cd', (m) => { info.textContent = m.n > 0 ? String(m.n) : 'GO!'; api.sfx(m.n > 0 ? 'tick' : 'good'); });
  api.on('go', () => {
    S.phase = 'race'; startT = performance.now();
    input.disabled = false; input.placeholder = 'Type here…'; input.focus();
    setTimeout(() => { if (S.phase === 'race') info.textContent = 'Type!'; }, 600);
  });
  api.on('prog', (p) => { Object.assign(S.prog, p.prog); Object.assign(S.wpm, p.wpm); Object.assign(S.done, p.done); renderLanes(); });
  api.on('end', (e) => {
    S.phase = 'between'; S.board = e.board; Object.assign(S.points, e.points);
    input.disabled = true; input.blur();
    info.textContent = e.last ? 'Final results coming…' : 'Next round soon…';
    renderBoard(); renderLanes();
    api.sfx('good');
  });
  api.onPlayersChanged(renderLanes);

  // ------------------------------------------------------------ host
  if (api.isHost) {
    const rng = api.rng;
    const texts = rng.shuffle(TEXTS).slice(0, rounds);
    const H = { round: 0, prog: {}, wpm: {}, done: {}, order: [], points: {}, totalWpm: {}, nWpm: {}, timer: 0, state: 'wait', over: false, goAt: 0 };
    ids.forEach((id) => { H.points[id] = 0; H.totalWpm[id] = 0; H.nWpm[id] = 0; });
    const live = () => ids.filter((id) => !api.player(id).left);
    function relay() { api.broadcast('prog', { prog: H.prog, wpm: H.wpm, done: H.done }); }
    function newRound() {
      H.round++; H.state = 'count'; H.prog = {}; H.wpm = {}; H.done = {}; H.order = [];
      ids.forEach((id) => (H.prog[id] = 0));
      api.broadcast('round', { text: texts[H.round - 1], n: H.round });
      let n = 3;
      api.timeout(function cd() {
        api.broadcast('cd', { n });
        if (n-- > 0) api.timeout(cd, 900); else { H.state = 'race'; H.goAt = performance.now(); api.broadcast('go', {}); H.timer = setTimeout(endRound, 130000); }
      }, 900);
    }
    function endRound() {
      if (H.state !== 'race') return;
      clearTimeout(H.timer);
      H.state = 'between';
      const text = texts[H.round - 1];
      const unfinished = ids.filter((id) => !H.done[id]).sort((a, b) => (H.prog[b] || 0) - (H.prog[a] || 0));
      const ordered = [...H.order, ...unfinished];
      const n = ids.length;
      const board = ordered.map((id, i) => {
        const pts = H.done[id] ? n - i : 0;
        H.points[id] += pts;
        if (H.done[id]) { H.totalWpm[id] += H.done[id].wpm; H.nWpm[id]++; }
        return { id, pts, wpm: H.done[id]?.wpm || 0, acc: H.done[id]?.acc || 0 };
      });
      void text;
      const last = H.round >= rounds;
      api.broadcast('end', { board, points: H.points, last });
      api.timeout(() => {
        if (!last) return newRound();
        H.over = true;
        const avg = (id) => (H.nWpm[id] ? H.totalWpm[id] / H.nWpm[id] : 0);
        const ranking = ids.slice().sort((a, b) => H.points[b] - H.points[a] || avg(b) - avg(a)).map((id) => ({ id, score: H.points[id], note: H.nWpm[id] ? `${Math.round(avg(id))} avg wpm` : '' }));
        api.endGame({ title: `${nameOf(ranking[0].id)} is the fastest fingers!`, subtitle: `${rounds} round${rounds > 1 ? 's' : ''}`, ranking, winners: [ranking[0].id] });
      }, 6000);
    }
    let lastRelay = 0;
    api.on('p', ({ c, wpm }, from) => {
      if (H.state !== 'race' || H.done[from]) return;
      H.prog[from] = Math.max(0, Math.min(texts[H.round - 1].length, +c || 0));
      H.wpm[from] = Math.min(400, +wpm || 0);
      const now = performance.now();
      if (now - lastRelay > 100) { lastRelay = now; relay(); }
    });
    api.on('done', ({ wpm, acc, ms }, from) => {
      if (H.state !== 'race' || H.done[from]) return;
      const minMs = (texts[H.round - 1].length / 5 / 220) * 60000; // sanity: nobody types 220+ wpm
      H.done[from] = { rank: H.order.length + 1, wpm: Math.min(250, Math.max(1, Math.round(+wpm || 0))), acc: Math.min(100, Math.max(0, +acc || 0)), ms: Math.max(minMs, +ms || 0) };
      H.order.push(from);
      H.prog[from] = texts[H.round - 1].length;
      relay();
      if (live().every((id) => H.done[id])) api.timeout(endRound, 600);
      else if (H.order.length === 1) { clearTimeout(H.timer); H.timer = setTimeout(endRound, 30000); }
    });
    api.onLeave((id) => { if (H.state === 'race' && live().every((i) => H.done[i])) endRound(); });
    api.onRejoin((id) => { if (H.round) { api.sendTo(id, 'round', { text: texts[H.round - 1], n: H.round }); if (H.state === 'race') api.sendTo(id, 'go', {}); relay(); } });
    api.cleanup(() => clearTimeout(H.timer));
    api.timeout(newRound, 700);
  }
}
