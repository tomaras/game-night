// Letter Dash — one letter, six categories, 75 seconds. Unique answers score big; duplicates share less.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, scorePills, hostPhase, rankingFrom, sample, waiting } from '../kit.js';

const CATS = [
  'Animals', 'Boy’s names', 'Girl’s names', 'Countries', 'Cities', 'Fruits', 'Vegetables', 'Things in a kitchen', 'Things in a bathroom', 'Clothing', 'Sports', 'Jobs', 'Movies', 'Songs', 'Superheroes', 'Foods', 'Drinks',
  'Things that are cold', 'Things that are hot', 'Things you can ride', 'Things in the sky', 'Things at the beach', 'Things at a party', 'Brands', 'Candy / sweets', 'Pizza toppings', 'Musical instruments', 'Parts of the body', 'Tools',
  'Things in a school', 'Famous people', 'Cartoon characters', 'Board games', 'Video games', 'Flowers & plants', 'Birds', 'Sea creatures', 'Furniture', 'Cars / vehicles', 'Things you wear on your feet', 'Reasons to be late', 'Things in a pocket',
  'Things in a garden', 'Words that rhyme with “cat”', 'Things that make noise', 'Things that are round', 'Things that are sticky', 'Hobbies', 'Holidays & festivals', 'Languages', 'Things in a hospital', 'Things at the zoo', 'Dessert flavours', 'Hotel items',
  'Things in a toolbox', 'Cheeses', 'Pets', 'Insects', 'Bodies of water', 'Things in a supermarket', 'Types of weather', 'Things that fly', 'Things in a bedroom', 'TV shows', 'Metals & gems', 'Book titles', 'Magic words', 'Scary things',
];
const LETTERS = 'ABCDEFGHIJKLMNOPRSTW'.split('');
const norm = (s) => String(s).toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');

const CSS = `
.ld2-letter { width:104px; height:104px; margin:0 auto; border-radius:34px; display:grid; place-items:center; font:800 64px var(--font); color:#fff; background:linear-gradient(145deg, var(--blue), var(--purple)); box-shadow:0 12px 28px rgba(26,115,232,.35); animation:ktpop .5s both; }
.ld2-list { display:flex; flex-direction:column; gap:10px; }
.ld2-cat { display:flex; flex-direction:column; gap:4px; }
.ld2-cat label { font:700 13px var(--font); color:var(--on2); padding-left: 6px; }
.ld2-cat input { font-weight:600; }
.ld2-rev { background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:12px 14px; }
.ld2-rev h4 { margin:0 0 8px; font:700 15px var(--font); }
.ld2-ans { display:flex; align-items:center; gap:8px; padding:4px 0; }
.ld2-ans button { margin-left:auto; border:0; background:var(--s2); border-radius:999px; padding:6px 12px; font:700 12px var(--font); cursor:pointer; color:var(--on2); display:flex; gap:4px; align-items:center; }
.ld2-ans button.on { background:var(--red-c); color:var(--red-d); }
.ld2-ans .t { font-weight:600; } .ld2-ans .t.bad { text-decoration:line-through; color:var(--on3); }
.ld2-ans .pts { margin-left:auto; font-weight:800; color:var(--blue); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const rounds = +api.opts.rounds || 3;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 0, letter: '', cats: [], sent: false, done: new Set(), sheet: null, res: null, scores: {}, myFlags: new Set(), inputs: [] };
  ids.forEach((i) => (S.scores[i] = 0));

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms);
    if (p.name === 'play') { S.round = p.round; S.letter = p.letter; S.cats = p.cats; S.sent = false; S.done = new Set(); S.inputs = []; }
    if (p.name === 'review') { S.sheet = p.sheet; S.myFlags = new Set(); S.done = new Set(); }
    if (p.name === 'result') { S.res = p.res; S.scores = p.scores; api.sfx('good'); }
    render();
  });
  api.on('done', (d) => { S.done = new Set(d.ids); if (S.phase === 'play') render(); });
  api.onPlayersChanged(render);
  const send = () => { if (S.sent) return; S.sent = true; api.toHost('answers', { a: S.cats.map((_, i) => (S.inputs[i] ? S.inputs[i].value.trim() : '')) }); api.sfx('good'); render(); };
  api.interval(() => { if (S.phase === 'play' && !S.sent && S.cats.length && clock.left() <= 0) send(); }, 400);

  function render() {
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Round ${S.round}/${rounds}`))];
    if (S.phase === 'play') {
      parts.push(h('div.ld2-letter', S.letter), clock.el());
      if (S.sent) parts.push(h('div.kt-hint', 'Answers sent!'), waiting(api, ids.filter((i) => !S.done.has(i))));
      else {
        const keep = S.inputs.map((x) => x?.value || '');
        S.inputs = S.cats.map((c, i) => { const el = h('input.txt', { placeholder: `${S.letter}…`, maxlength: 30, autocomplete: 'off', autocapitalize: 'words', value: keep[i] || '' }); return el; });
        parts.push(h('div.ld2-list', S.cats.map((c, i) => h('div.ld2-cat', h('label', `${i + 1}. ${c}`), S.inputs[i]))), h('div.kt-sticky', h('button.btn.primary.big.block', { onclick: send }, icon('check'), 'Done')));
      }
    } else if (S.phase === 'review' && S.sheet) {
      parts.push(clock.el(), h('div.kt-hint', 'Check everyone’s answers — tap “Flag” on anything that doesn’t fit.'));
      S.sheet.forEach((c, ci) => parts.push(h('div.ld2-rev', h('h4', `${ci + 1}. ${c.cat}`), ...c.rows.map((r) => {
        const key = ci + ':' + r.id;
        const bad = !r.ok;
        return h('div.ld2-ans', avatarEl(api.player(r.id) || {}, 'xs', { still: true }), h('span.t' + (bad ? '.bad' : ''), r.text || '—'), r.id === api.me || !r.text || bad ? (bad && r.text ? h('span.chip', 'wrong letter') : null) : h('button' + (S.myFlags.has(key) ? '.on' : ''), { onclick: () => { api.toHost('flag', { c: ci, p: r.id }); S.myFlags.has(key) ? S.myFlags.delete(key) : S.myFlags.add(key); api.sfx('click'); render(); } }, icon('flag', 'sm'), S.myFlags.has(key) ? 'Flagged' : 'Flag'));
      }))));
    } else if (S.phase === 'result' && S.res) {
      parts.push(h('div.ld2-rev', h('h4', 'Round points'), ...S.res.map((r) => h('div.ld2-ans', avatarEl(api.player(r.id) || {}, 'sm', { still: true }), h('span.t', nameOf(r.id)), h('span.pts', `+${r.pts}`)))), scorePills(api, S.scores));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, letters: sample(LETTERS, rounds, rng), subs: {}, flags: {}, timer: 0, phase: 'wait', scores: {}, deadline: 0, cats: [], sheet: [] };
    ids.forEach((i) => (H.scores[i] = 0));
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    function play() {
      H.round++; H.subs = {}; H.flags = {};
      H.cats = sample(CATS, 6, rng);
      hostPhase(api, H, 'play', 75000, review, { round: H.round, letter: H.letters[H.round - 1], cats: H.cats });
    }
    function review() {
      clearTimeout(H.timer);
      const L = H.letters[H.round - 1].toLowerCase();
      H.sheet = H.cats.map((cat, ci) => ({ cat, rows: ids.map((id) => { const t = (H.subs[id]?.[ci] || '').trim(); return { id, text: t, ok: !t || t.toLowerCase().replace(/^(the|a|an)\s+/, '')[0] === L || t.toLowerCase()[0] === L }; }) }));
      hostPhase(api, H, 'review', 40000, score, { sheet: H.sheet });
    }
    function score() {
      clearTimeout(H.timer);
      const others = (id) => Math.max(1, alive().filter((p) => p !== id).length);
      const pts = Object.fromEntries(ids.map((i) => [i, 0]));
      H.sheet.forEach((c, ci) => {
        const valid = c.rows.filter((r) => {
          if (!r.text || !r.ok) return false;
          const flags = H.flags[ci + ':' + r.id]?.size || 0;
          return flags < Math.ceil(others(r.id) / 2) || others(r.id) === 1 && flags === 0;
        });
        const counts = {};
        valid.forEach((r) => { const k = norm(r.text); counts[k] = (counts[k] || 0) + 1; });
        valid.forEach((r) => { pts[r.id] += counts[norm(r.text)] === 1 ? 10 : 5; });
      });
      ids.forEach((i) => { H.scores[i] += pts[i]; });
      hostPhase(api, H, 'result', 9000, next, { res: ids.map((id) => ({ id, pts: pts[id] })).sort((a, b) => b.pts - a.pts), scores: H.scores });
    }
    function next() {
      if (H.round >= rounds) {
        const ranking = rankingFrom(api, H.scores);
        return api.endGame({ title: `${nameOf(ranking[0].id)} is the word champion!`, subtitle: 'Fastest brain in the room', ranking, winners: [ranking[0].id] });
      }
      play();
    }
    api.on('answers', ({ a }, from) => {
      if (H.phase !== 'play' || H.subs[from]) return;
      H.subs[from] = (Array.isArray(a) ? a : []).slice(0, 6).map((x) => String(x || '').slice(0, 30));
      api.broadcast('done', { ids: Object.keys(H.subs) });
      if (alive().every((i) => H.subs[i])) { clearTimeout(H.timer); api.timeout(review, 600); }
    });
    api.on('flag', ({ c, p }, from) => {
      if (H.phase !== 'review' || from === p) return;
      const set = (H.flags[c + ':' + p] = H.flags[c + ':' + p] || new Set());
      if (set.has(from)) set.delete(from); else set.add(from);
    });
    api.timeout(play, 700);
  }
  render();
}
