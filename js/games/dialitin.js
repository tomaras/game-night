// Dial It In — the psychic sees a hidden spot on a spectrum (e.g. Hot ↔ Cold) and gives a clue.
// Everybody else slides the dial to where they think it is. Closer guesses score more.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, scorePills, hostPhase, rankingFrom, sample, waiting, answerBox, promptCard } from '../kit.js';

const SPECTRA = [
  ['Cold', 'Hot'], ['Ordinary', 'Extraordinary'], ['Bad movie', 'Good movie'], ['Useless', 'Useful'], ['Underrated', 'Overrated'], ['Easy to pronounce', 'Hard to pronounce'], ['Scary', 'Cute'],
  ['Safe', 'Dangerous'], ['Cheap', 'Expensive'], ['Boring', 'Exciting'], ['Soft', 'Hard'], ['Fast', 'Slow'], ['Rare', 'Common'], ['Old-fashioned', 'Futuristic'], ['Forgettable', 'Memorable'],
  ['Weird', 'Normal'], ['Healthy', 'Unhealthy'], ['Quiet', 'Loud'], ['Tiny', 'Enormous'], ['Fancy', 'Casual'], ['Awkward', 'Smooth'], ['Lucky', 'Unlucky'], ['Sweet', 'Sour'],
  ['Messy', 'Tidy'], ['Weak', 'Strong'], ['Beginner skill', 'Expert skill'], ['Sad song', 'Happy song'], ['Morning thing', 'Night thing'], ['Cringe', 'Cool'], ['Dry', 'Wet'],
  ['Lazy', 'Energetic'], ['Dull', 'Colourful'], ['Natural', 'Artificial'], ['Hated', 'Loved'], ['Simple', 'Complicated'], ['Believable', 'Unbelievable'], ['Smells bad', 'Smells good'],
  ['Heavy', 'Light'], ['Round', 'Pointy'], ['Polite', 'Rude'], ['Serious job', 'Fun job'], ['Short film', 'Epic film'], ['Beginner’s luck', 'Pure skill'], ['Winter', 'Summer'], ['Good pizza topping', 'Bad pizza topping'],
];
const ZONES = [[4, 4, '#34a853'], [9, 3, '#fbbc04'], [15, 2, '#f57c00']]; // half-width, points, colour
const pointsFor = (d) => (d <= 4 ? 4 : d <= 9 ? 3 : d <= 15 ? 2 : 0);

const CSS = `
.dl-gauge { position:relative; width:100%; max-width:560px; margin:0 auto; }
.dl-gauge svg { width:100%; display:block; overflow:visible; touch-action:none; }
.dl-ends { display:flex; justify-content:space-between; font:800 clamp(15px, 4vw, 20px) var(--font); margin-top:4px; }
.dl-ends span:first-child { color:var(--blue); } .dl-ends span:last-child { color:var(--red); }
.dl-slider { width:100%; accent-color:var(--blue); height:34px; }
.dl-res { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
`;

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
const arc = (cx, cy, r0, r1, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1), [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
};
const val2ang = (v) => Math.PI * (1 - v / 100);

function gauge({ target, needles = [], guess = null, hide = true }) {
  const cx = 250, cy = 240, R = 220, r0 = 70;
  const NS = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 500 260');
  let inner = `<defs><linearGradient id="dlg" x1="0" x2="1"><stop offset="0" stop-color="#d3e3fd"/><stop offset="1" stop-color="#fcdad6"/></linearGradient></defs>
    <path d="${arc(cx, cy, r0, R, Math.PI, 0)}" fill="url(#dlg)" stroke="#fff" stroke-width="3"/>`;
  if (target !== null && !hide) {
    for (const [hw, , c] of [...ZONES].reverse()) inner += `<path d="${arc(cx, cy, r0, R, val2ang(Math.max(0, target - hw)), val2ang(Math.min(100, target + hw)))}" fill="${c}" opacity="0.92"/>`;
  }
  if (target !== null && hide) inner += `<path d="${arc(cx, cy, r0, R, val2ang(Math.max(0, target - 15)), val2ang(Math.min(100, target + 15)))}" fill="#9aa0a6" opacity="0.22"/>`;
  for (const n of needles) { const [x, y] = polar(cx, cy, R + 4, val2ang(n.v)); const [x0, y0] = polar(cx, cy, r0 - 4, val2ang(n.v)); inner += `<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" stroke="${n.color || '#202124'}" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="7" fill="${n.color || '#202124'}"/>`; }
  if (guess !== null) { const [x, y] = polar(cx, cy, R + 6, val2ang(guess)); const [x0, y0] = polar(cx, cy, r0 - 6, val2ang(guess)); inner += `<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" stroke="#1a73e8" stroke-width="7" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="14" fill="#1a73e8"/>`; }
  el.innerHTML = inner;
  return h('div.dl-gauge', el);
}

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const laps = +api.opts.laps || 1;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', psychic: null, spec: ['', ''], target: null, clue: '', guess: 50, locked: false, round: 0, of: N * laps, done: new Set(), res: null, scores: {} };
  ids.forEach((i) => (S.scores[i] = 0));

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms);
    if (p.name === 'clue') { S.psychic = p.psychic; S.spec = p.spec; S.round = p.round; S.of = p.of; S.clue = ''; S.guess = 50; S.locked = false; S.done = new Set(); S.res = null; if (p.target !== undefined) S.target = p.target; }
    if (p.name === 'guess') { S.clue = p.clue; S.done = new Set(); }
    if (p.name === 'reveal') { S.res = p.res; S.scores = p.scores; S.target = p.res.target; api.sfx('good'); }
    render();
  });
  api.on('target', (t) => { S.target = t.v; render(); });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  function render() {
    const me = api.me;
    const psy = S.psychic === me;
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Round ${S.round}/${S.of}`), ' · psychic: ', h('b', nameOf(S.psychic)))];
    const ends = h('div.dl-ends', h('span', S.spec[0]), h('span', S.spec[1]));
    if (S.phase === 'clue') {
      parts.push(clock.el());
      if (psy) {
        parts.push(h('div.kt-card', gauge({ target: S.target, hide: false }), ends), h('div.kt-hint', 'You’re the psychic! The dial hides the green zone from everyone else. Give a clue that points at it.'),
          answerBox({ placeholder: `A clue between “${S.spec[0]}” and “${S.spec[1]}”`, max: 50, button: 'Send clue', onSubmit: (t) => { api.toHost('clue', { t }); api.sfx('good'); } }).el);
      } else parts.push(h('div.kt-card', gauge({ target: null }), ends), h('div.kt-center', h('div', [h('div.spinner'), h('div.kt-hint', `${nameOf(S.psychic)} is thinking of a clue…`)])));
    } else if (S.phase === 'guess') {
      parts.push(clock.el(), promptCard(`“${S.clue}”`, { label: `${nameOf(S.psychic)}’s clue`, color: '#1a73e8' }));
      if (psy) parts.push(h('div.kt-card', gauge({ target: S.target, hide: false }), ends), h('div.kt-hint', 'Say nothing! The others are guessing…'), waiting(api, ids.filter((i) => i !== me && !S.done.has(i)), 'Waiting for'));
      else {
        parts.push(h('div.kt-card', gauge({ target: null, guess: S.guess }), ends));
        if (S.locked) parts.push(h('div.kt-hint', 'Guess locked in!'), waiting(api, ids.filter((i) => i !== S.psychic && !S.done.has(i)), 'Waiting for'));
        else parts.push(h('input.dl-slider', { type: 'range', min: 0, max: 100, value: S.guess, oninput: (e) => { S.guess = +e.target.value; const g = root.querySelector('.dl-gauge'); if (g) g.replaceWith(gauge({ target: null, guess: S.guess })); } }), h('button.btn.primary.big.block', { onclick: () => { S.locked = true; api.toHost('guess', { v: S.guess }); api.sfx('good'); render(); } }, icon('check'), 'Lock in guess'));
      }
    } else if (S.phase === 'reveal' && S.res) {
      const r = S.res;
      parts.push(h('div.kt-card', gauge({ target: r.target, hide: false, needles: r.guesses.map((g) => ({ v: g.v, color: api.player(g.id)?.color })) }), ends),
        h('div.dl-res', r.guesses.map((g) => h('span.kt-pill', avatarEl(api.player(g.id) || {}, 'sm', { still: true }), nameOf(g.id), h('b', `+${g.pts}`)))),
        h('div.kt-hint', `${nameOf(S.psychic)} earns +${r.psychicPts} as psychic`), scorePills(api, S.scores));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const total = N * laps;
    const H = { round: 0, specs: sample(SPECTRA, total, rng), target: 50, clue: '', guesses: {}, timer: 0, phase: 'wait', scores: {}, deadline: 0 };
    ids.forEach((i) => (H.scores[i] = 0));
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    const psychic = () => ids[(H.round - 1) % N];
    function clue() {
      H.round++; H.guesses = {}; H.target = 8 + Math.floor(rng.next() * 85);
      if (api.player(psychic()).left) return H.round >= total ? finish() : clue();
      const spec = H.specs[H.round - 1];
      for (const id of ids) api.sendTo(id, 'phase', { name: 'clue', ms: 60000, psychic: psychic(), spec, round: H.round, of: total, target: id === psychic() ? H.target : undefined });
      H.phase = 'clue'; H.deadline = performance.now() + 60000; clearTimeout(H.timer);
      H.timer = setTimeout(() => { H.clue = '(no clue given)'; guess(); }, 60300);
    }
    function guess() {
      clearTimeout(H.timer);
      hostPhase(api, H, 'guess', 40000, reveal, { clue: H.clue, psychic: psychic() });
    }
    function reveal() {
      clearTimeout(H.timer);
      const guesses = Object.entries(H.guesses).map(([id, v]) => ({ id, v, pts: pointsFor(Math.abs(v - H.target)) }));
      guesses.forEach((g) => { H.scores[g.id] += g.pts; });
      const psychicPts = guesses.length ? Math.round(guesses.reduce((a, g) => a + g.pts, 0) / guesses.length) : 0;
      H.scores[psychic()] += psychicPts;
      api.broadcast('phase', { name: 'reveal', ms: 0, res: { target: H.target, guesses, psychicPts }, scores: H.scores });
      H.phase = 'reveal';
      H.timer = setTimeout(() => (H.round >= total ? finish() : clue()), 8000);
    }
    function finish() {
      const ranking = rankingFrom(api, H.scores);
      api.endGame({ title: `${nameOf(ranking[0].id)} is on everyone’s wavelength!`, subtitle: 'Most points wins', ranking, winners: [ranking[0].id] });
    }
    api.on('clue', ({ t }, from) => { if (H.phase === 'clue' && from === psychic() && String(t).trim()) { H.clue = String(t).trim().slice(0, 50); guess(); } });
    api.on('guess', ({ v }, from) => {
      if (H.phase !== 'guess' || from === psychic() || H.guesses[from] !== undefined) return;
      H.guesses[from] = Math.max(0, Math.min(100, Math.round(+v || 0)));
      api.broadcast('done', { ids: Object.keys(H.guesses) });
      if (alive().filter((i) => i !== psychic()).every((i) => H.guesses[i] !== undefined)) { clearTimeout(H.timer); api.timeout(reveal, 600); }
    });
    api.timeout(clue, 700);
  }
  render();
}
