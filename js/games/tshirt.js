// T-Shirt Showdown — draw pictures, write slogans, then mix and match them into the funniest T-shirts.
// Shirts battle head-to-head and the room votes. 3–10 players.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { createDrawPad } from '../drawpad.js';
import { makeClock, waiting, scorePills, shuffled } from '../kit.js';

const DRAW_IDEAS = ['A grumpy cloud', 'A taco with a cape', 'A cat astronaut', 'A dancing banana', 'A sleepy dragon', 'A robot eating pizza', 'A wizard on a skateboard', 'A penguin in sunglasses', 'A giant cupcake monster', 'A dog doing yoga', 'A ghost at the beach', 'An angry avocado', 'A llama in a tuxedo', 'A shark with a mustache', 'A smiling volcano', 'A pirate cow', 'A hamburger on a bike', 'A koala rock star', 'A unicorn chef', 'An alien with a balloon', 'A fox detective', 'A dinosaur with a briefcase', 'A tiny elephant superhero', 'A snowman at the gym'];
const SLOGAN_HINTS = ['Something a grandparent would wear', 'A motto for the world’s worst superhero', 'A cheesy gym slogan', 'What a dog would print on a shirt', 'A shirt for a very tired person', 'A fake band tour name', 'A shirt a villain would wear', 'Something you’d say right before a disaster', 'A shirt for a pizza lover', 'A slogan for a very lazy cat'];
const COLORS = [['White', '#f5f5f5'], ['Black', '#263238'], ['Red', '#e53935'], ['Blue', '#1e88e5'], ['Yellow', '#fdd835'], ['Green', '#43a047'], ['Pink', '#ec407a']];
const SHIRT_PATH = 'M92 18 L58 32 L8 78 L44 116 L72 98 L72 282 L228 282 L228 98 L256 116 L292 78 L242 32 L208 18 C190 52 110 52 92 18 Z';
const dark = (hex) => { const v = parseInt(hex.slice(1), 16); return ((v >> 16) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11) < 140; };

function wrapText(t, max = 13) {
  const words = String(t || '').trim().split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}
function shirt({ art, slo, color }, cls = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const col = COLORS[color]?.[1] || '#f5f5f5';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 300 300'); svg.setAttribute('class', 'ts-shirt ' + cls);
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; svg.append(e); return e; };
  el('path', { d: SHIRT_PATH, fill: col, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 3, 'stroke-linejoin': 'round' });
  el('path', { d: 'M92 18 C110 52 190 52 208 18', fill: 'none', stroke: 'rgba(0,0,0,.2)', 'stroke-width': 6 });
  if (art) { const im = el('image', { x: 98, y: 66, width: 104, height: 78, preserveAspectRatio: 'xMidYMid slice' }); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', art); im.setAttribute('href', art); el('rect', { x: 98, y: 66, width: 104, height: 78, rx: 6, fill: 'none', stroke: 'rgba(0,0,0,.2)', 'stroke-width': 1.5 }); }
  const lines = wrapText(slo), size = lines.length > 2 || lines.some((l) => l.length > 11) ? 15 : 19;
  const fill = dark(col) ? '#ffffff' : '#212121';
  lines.forEach((l, i) => el('text', { x: 150, y: (art ? 172 : 130) + i * (size + 2), 'text-anchor': 'middle', 'font-size': size, 'font-weight': 800, fill, 'font-family': 'Outfit, Noto Color Emoji, sans-serif' }, l));
  return svg;
}

const CSS = `
.ts-shirt { width:100%; height:auto; display:block; filter:drop-shadow(0 6px 10px rgba(0,0,0,.18)); }
.ts-pick { display:flex; gap:8px; overflow-x:auto; padding:6px 2px; scrollbar-width:none; }
.ts-art { flex:none; width:96px; height:72px; border-radius:12px; overflow:hidden; background:#fff; border:3px solid transparent; box-shadow:var(--e1); cursor:pointer; padding:0; } .ts-art img { width:100%; height:100%; object-fit:cover; display:block; } .ts-art.sel, .ts-slo.sel, .ts-col.sel { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-c); }
.ts-slo { flex:none; max-width:170px; border-radius:14px; background:var(--surface); box-shadow:var(--e1); border:3px solid transparent; padding:8px 12px; font:700 14px/1.2 var(--font); cursor:pointer; text-align:left; color:var(--on); }
.ts-cols { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; } .ts-col { width:38px; height:38px; border-radius:50%; border:3px solid #fff; box-shadow:var(--e1); cursor:pointer; padding:0; }
.ts-mix { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; max-width:420px; margin:0 auto; width:100%; }
.ts-duel { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ts-opt { border:4px solid transparent; border-radius:24px; background:var(--surface); box-shadow:var(--e1); padding:10px 6px 12px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; font:800 16px var(--font); color:var(--on); position:relative; transition:transform .12s; }
.ts-opt:hover:not(:disabled) { transform:translateY(-3px); } .ts-opt.sel { border-color:var(--blue); background:var(--blue-c); } .ts-opt.win { border-color:var(--green); background:var(--green-c); } .ts-opt .pct { font:800 22px var(--font); }
.ts-opt .who { font:600 12px var(--font); color:var(--on2); display:flex; align-items:center; gap:4px; flex-wrap:wrap; justify-content:center; }
.ts-done { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const per = +api.opts.shirts || 2;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, prompt: '', arts: [], slos: [], done: new Set(), scores: {}, my: { art: null, slo: null, color: 0 }, mixN: 0, duel: null, res: null, voted: null, submitted: false, shirtsMade: 0, total: 0 };
  let pad = null, sloInput = null;

  api.on('ph', (p) => {
    Object.assign(S, p); S.done = new Set(p.done || []);
    if (p.ms !== undefined) clock.set(p.ms);
    if (p.fresh) { S.submitted = false; S.voted = null; pad = null; sloInput = null; if (p.name === 'mix') { S.my = { art: null, slo: null, color: 0 }; S.shirtsMade = 0; } }
    S.phase = p.name;
    if (p.sfx) api.sfx(p.sfx);
    render();
  });
  api.on('duel', (d) => { S.duel = d; S.res = null; S.voted = null; S.phase = 'duel'; clock.set(d.ms); render(); });
  api.on('res', (r) => { S.res = r; S.scores = r.scores; S.phase = 'reveal'; api.sfx(r.sfx || 'win'); render(); });
  api.onPlayersChanged(render);

  const send = (type, data) => { if (S.submitted) return; S.submitted = true; api.toHost(type, data); api.sfx('good'); render(); };
  const prompt = (label, text, color) => h('div.kt-prompt', { style: `--pc:${color}` }, h('small', label), text);

  function render() {
    const me = api.me;
    const head = h('div.kt-row', { style: 'justify-content:center' }, S.phase === 'draw' || S.phase === 'slogan' ? h('span.chip.blue', `${S.phase === 'draw' ? 'Drawing' : 'Slogan'} ${S.round}/${per}`) : null, ['draw', 'slogan', 'mix', 'duel'].includes(S.phase) ? clock.el() : null);
    if (S.phase === 'draw') {
      if (!pad) pad = createDrawPad({ w: 480, h: 360 });
      return root.replaceChildren(head, prompt('Draw something for a T-shirt', S.prompt, '#1e88e5'), S.submitted ? h('div.kt-card', { style: 'text-align:center' }, '✅ Drawing sent!', waiting(api, ids.filter((i) => !S.done.has(i)))) : [pad.el, h('div.kt-sticky', h('button.btn.primary.big.block', { onclick: () => send('art', { url: pad.toDataURL(360, 0.55) }) }, icon('check'), 'Done'))]);
    }
    if (S.phase === 'slogan') {
      sloInput = sloInput || h('input.txt', { placeholder: 'Write a funny slogan…', maxlength: 36, autocomplete: 'off' });
      const preview = h('div.ts-mix', h('div', { style: 'max-width:230px;margin:0 auto;width:60%' }));
      const upd = () => preview.replaceChildren(h('div', { style: 'max-width:230px;margin:0 auto;width:60%' }, shirt({ art: null, slo: sloInput.value || 'Your slogan here', color: 0 })));
      sloInput.oninput = upd; upd();
      return root.replaceChildren(head, prompt('Write a slogan', S.prompt, '#e5399b'), S.submitted ? h('div.kt-card', { style: 'text-align:center' }, '✅ Slogan sent!', waiting(api, ids.filter((i) => !S.done.has(i)))) : [preview, h('div.kt-field', sloInput, h('button.btn.primary', { onclick: () => send('slo', { text: sloInput.value.trim() || 'No comment' }) }, icon('send'), 'Send'))]);
    }
    if (S.phase === 'mix') {
      const my = S.my;
      const prev = shirt({ art: S.arts.find((a) => a.id === my.art)?.url, slo: S.slos.find((s) => s.id === my.slo)?.text || (my.slo === null ? 'Pick a slogan' : ''), color: my.color });
      const can = my.art !== null && my.slo !== null;
      return root.replaceChildren(head, h('div.kt-prompt', { style: '--pc:#8e24aa' }, h('small', `Mix & match — make ${per} shirt${per > 1 ? 's' : ''}`), `Shirt ${Math.min(S.shirtsMade + 1, per)} of ${per}`),
        S.shirtsMade >= per ? h('div.kt-card', { style: 'text-align:center' }, '✅ Shirts are ready!', waiting(api, ids.filter((i) => !S.done.has(i)))) : h('div.ts-mix',
          h('div', { style: 'max-width:260px;margin:0 auto;width:70%' }, prev),
          h('div.kt-title', 'Pick a drawing'), h('div.ts-pick', S.arts.map((a) => h('button.ts-art' + (my.art === a.id ? '.sel' : ''), { onclick: () => { my.art = a.id; render(); } }, h('img', { src: a.url, alt: '' })))),
          h('div.kt-title', 'Pick a slogan'), h('div.ts-pick', S.slos.map((s) => h('button.ts-slo' + (my.slo === s.id ? '.sel' : ''), { onclick: () => { my.slo = s.id; render(); } }, s.text))),
          h('div.ts-cols', COLORS.map(([n, c], i) => h('button.ts-col' + (my.color === i ? '.sel' : ''), { style: `background:${c}`, 'aria-label': n, onclick: () => { my.color = i; render(); } }))),
          h('button.btn.primary.big.block', { disabled: !can, onclick: () => { api.toHost('shirt', { art: my.art, slo: my.slo, color: my.color }); S.shirtsMade++; S.my = { art: null, slo: null, color: my.color }; api.sfx('good'); render(); } }, icon('check'), 'Make this shirt')));
    }
    if (S.phase === 'duel' && S.duel) {
      const d = S.duel, mineDuel = d.by.includes(me);
      const opt = (k) => h('button.ts-opt' + (S.voted === k ? '.sel' : ''), { disabled: mineDuel || S.voted !== null, onclick: () => { S.voted = k; api.toHost('vote', { k }); api.sfx('pop'); render(); } }, shirt(d[k]), mineDuel ? '' : S.voted === k ? 'Your vote ✓' : 'Vote');
      return root.replaceChildren(head, h('div.kt-prompt', { style: '--pc:#fb8c00' }, h('small', `Battle ${d.i + 1} of ${d.n}`), mineDuel ? 'Your shirt is in this battle!' : 'Which shirt is better?'), h('div.ts-duel', opt('a'), opt('b')), h('div.kt-hint', mineDuel ? 'You can’t vote in your own battle — cross your fingers…' : S.voted ? 'Vote locked. Waiting for the others…' : 'Tap your favourite.'));
    }
    if (S.phase === 'reveal' && S.res) {
      const r = S.res, d = S.duel;
      const tot = r.a.votes + r.b.votes || 1;
      const opt = (k) => h('div.ts-opt' + (r[k].votes > r[k === 'a' ? 'b' : 'a'].votes ? '.win' : ''), shirt(d[k]), h('div.pct', Math.round((r[k].votes / tot) * 100) + '%'), h('div.who', avatarEl(api.player(r[k].by), 'xs', { still: true }), nameOf(r[k].by), r[k].pts ? `+${r[k].pts}` : ''), h('div.who', `🎨 ${nameOf(r[k].artBy)} · ✍️ ${nameOf(r[k].sloBy)}`));
      return root.replaceChildren(h('div.kt-prompt', { style: '--pc:#43a047' }, h('small', `Battle ${d.i + 1} of ${d.n}`), r.a.votes === r.b.votes ? 'It’s a tie!' : `${nameOf(r[r.a.votes > r.b.votes ? 'a' : 'b'].by)}’s shirt wins!`), h('div.ts-duel', opt('a'), opt('b')), scorePills(api, S.scores));
    }
    root.replaceChildren(h('div.kt-center', 'Getting the studio ready…'));
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { phase: 'wait', round: 0, arts: [], slos: [], shirts: [], scores: {}, subs: {}, timer: 0, duels: [], di: 0, votes: {}, nid: 0, prompts: [] };
    ids.forEach((id) => (H.scores[id] = 0));
    api.cleanup(() => clearTimeout(H.timer));
    const drawPrompts = shuffled(DRAW_IDEAS, rng), sloHints = shuffled(SLOGAN_HINTS, rng);
    const ph = (name, extra = {}) => { H.phase = name; api.broadcast('ph', { name, round: H.round, per, scores: H.scores, done: Object.keys(H.subs), ...extra }); };
    function startDraw() {
      H.round++; H.subs = {};
      ph('draw', { prompt: drawPrompts[H.round - 1] || 'Anything!', ms: 55000, fresh: true });
      H.timer = setTimeout(endDraw, 56000);
    }
    function endDraw() {
      clearTimeout(H.timer);
      ids.forEach((id) => { if (!H.subs[id]) H.arts.push({ id: 'a' + H.nid++, by: id, url: '' }); });
      H.subs = {}; ph('slogan', { prompt: sloHints[H.round - 1] || 'Be funny!', ms: 35000, fresh: true });
      H.timer = setTimeout(endSlogan, 36000);
    }
    function endSlogan() {
      clearTimeout(H.timer);
      ids.forEach((id) => { if (!H.subs[id]) H.slos.push({ id: 's' + H.nid++, by: id, text: 'No comment' }); });
      if (H.round < per) return startDraw();
      startMix();
    }
    api.on('art', ({ url }, from) => {
      if (H.phase !== 'draw' || H.subs[from] || typeof url !== 'string' || !url.startsWith('data:image/') || url.length > 120000) return;
      H.subs[from] = 1; H.arts.push({ id: 'a' + H.nid++, by: from, url });
      if (ids.every((i) => H.subs[i] || api.player(i).left)) { clearTimeout(H.timer); H.timer = setTimeout(endDraw, 600); } else ph('draw', { ms: undefined });
    });
    api.on('slo', ({ text }, from) => {
      if (H.phase !== 'slogan' || H.subs[from]) return;
      H.subs[from] = 1; H.slos.push({ id: 's' + H.nid++, by: from, text: String(text || 'No comment').slice(0, 36) });
      if (ids.every((i) => H.subs[i] || api.player(i).left)) { clearTimeout(H.timer); H.timer = setTimeout(endSlogan, 600); } else ph('slogan', { ms: undefined });
    });
    function startMix() {
      H.subs = {}; H.made = {};
      const arts = shuffled(H.arts.filter((a) => a.url), rng), slos = shuffled(H.slos, rng);
      H.pool = { arts, slos };
      ph('mix', { arts: arts.map((a) => ({ id: a.id, url: a.url })), slos: slos.map((s) => ({ id: s.id, text: s.text })), ms: 60000, fresh: true });
      H.timer = setTimeout(endMix, 61000);
    }
    api.on('shirt', ({ art, slo, color }, from) => {
      if (H.phase !== 'mix' || (H.made[from] || 0) >= per) return;
      const a = H.arts.find((x) => x.id === art), s = H.slos.find((x) => x.id === slo);
      if (!a || !s || !(color >= 0 && color < COLORS.length)) return;
      H.shirts.push({ by: from, art: a, slo: s, color });
      H.made[from] = (H.made[from] || 0) + 1;
      if (H.made[from] >= per) H.subs[from] = 1;
      if (ids.every((i) => (H.made[i] || 0) >= per || api.player(i).left)) { clearTimeout(H.timer); H.timer = setTimeout(endMix, 700); } else ph('mix', { ms: undefined });
    });
    function endMix() {
      clearTimeout(H.timer);
      if (H.phase !== 'mix') return;
      // fill any missing shirts randomly
      ids.forEach((id) => { while ((H.made[id] || 0) < per) { const arts = H.arts.filter((a) => a.url); if (!arts.length || !H.slos.length) break; H.shirts.push({ by: id, art: rng.pick(arts), slo: rng.pick(H.slos), color: rng.int(COLORS.length) }); H.made[id] = (H.made[id] || 0) + 1; } });
      // pair shirts into duels, avoiding same-maker pairs where possible
      let order = rng.shuffle(H.shirts.map((_, i) => i));
      for (let t = 0; t < 30; t++) { if (order.every((v, k) => k % 2 || order[k + 1] === undefined || H.shirts[v].by !== H.shirts[order[k + 1]].by)) break; order = rng.shuffle(order); }
      H.duels = [];
      for (let k = 0; k + 1 < order.length; k += 2) H.duels.push([order[k], order[k + 1]]);
      H.di = 0;
      if (!H.duels.length) return finish();
      nextDuel();
    }
    const view = (s) => ({ art: s.art.url, slo: s.slo.text, color: s.color });
    function nextDuel() {
      const [a, b] = H.duels[H.di];
      H.votes = {}; H.phase = 'duel';
      const A = H.shirts[a], B = H.shirts[b];
      api.broadcast('duel', { i: H.di, n: H.duels.length, a: view(A), b: view(B), by: [A.by, B.by], ms: 20000 });
      clearTimeout(H.timer);
      H.timer = setTimeout(revealDuel, 20500);
    }
    api.on('vote', ({ k }, from) => {
      if (H.phase !== 'duel' || (k !== 'a' && k !== 'b')) return;
      const [a, b] = H.duels[H.di];
      if (from === H.shirts[a].by || from === H.shirts[b].by) return;
      H.votes[from] = k;
      const voters = ids.filter((i) => i !== H.shirts[a].by && i !== H.shirts[b].by && !api.player(i).left);
      if (voters.every((i) => H.votes[i])) { clearTimeout(H.timer); H.timer = setTimeout(revealDuel, 600); }
    });
    function revealDuel() {
      clearTimeout(H.timer);
      if (H.phase !== 'duel') return;
      H.phase = 'reveal';
      const [ai, bi] = H.duels[H.di], A = H.shirts[ai], B = H.shirts[bi];
      const va = Object.values(H.votes).filter((v) => v === 'a').length, vb = Object.values(H.votes).filter((v) => v === 'b').length;
      const award = (s, v, win) => { const pts = v * 100 + (win ? 100 : 0); if (pts) { H.scores[s.by] += pts; const rest = Math.floor(pts / 2); if (s.art.by !== s.by) H.scores[s.art.by] += rest; if (s.slo.by !== s.by) H.scores[s.slo.by] += rest; } return pts; };
      const pa = award(A, va, va > vb), pb = award(B, vb, vb > va);
      const info = (s, v, p) => ({ votes: v, pts: p, by: s.by, artBy: s.art.by, sloBy: s.slo.by });
      api.broadcast('res', { a: info(A, va, pa), b: info(B, vb, pb), scores: H.scores, sfx: 'win' });
      H.timer = setTimeout(() => { H.di++; if (H.di >= H.duels.length) finish(); else nextDuel(); }, 6500);
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: 'pts' }));
      const top = ranking[0].score;
      api.endGame({ title: `${ranking.filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} is the fashion king!`, subtitle: `${top} points`, ranking, winners: ranking.filter((r) => r.score === top).map((r) => r.id) });
    }
    api.onRejoin(() => ph(H.phase === 'wait' ? 'draw' : H.phase, { ms: undefined }));
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 3 && H.phase !== 'wait') finish(); });
    api.timeout(startDraw, 800);
  }
  render();
}
