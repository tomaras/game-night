// Fib Quiz — invent a believable fake answer to a strange true fact, then try to spot the real one.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, scorePills, waiting, hostPhase, rankingFrom, sample, shuffled, answerBox } from '../kit.js';

const FACTS = [
  ['The national animal of Scotland is the ___.', 'unicorn'], ['A group of crows is called a ___.', 'murder'], ['A group of owls is called a ___.', 'parliament'], ['A group of flamingos is called a ___.', 'flamboyance'],
  ['A group of jellyfish is called a ___.', 'smack'], ['Bananas are technically a kind of ___.', 'berry'], ['The shortest war in history, between Britain and Zanzibar, lasted about ___ minutes.', '38'],
  ['The inventor of the Pringles can was buried in a ___ can.', 'Pringles'], ['An octopus has ___ hearts.', 'three'], ['Wombat droppings are shaped like ___.', 'cubes'], ['Sea otters hold hands while they sleep so they don’t ___.', 'drift apart'],
  ['In Switzerland it is illegal to own just one ___.', 'guinea pig'], ['Cleopatra lived closer in time to the Moon landing than to the building of the ___.', 'Great Pyramid'],
  ['Venus is the only planet in our solar system that spins ___.', 'backwards'], ['The only letter that does not appear in any US state name is ___.', 'Q'],
  ['The first item ever scanned with a barcode was a pack of ___.', 'chewing gum'], ['The inventor of the frisbee was cremated and made into a ___.', 'frisbee'],
  ['A snail can sleep for up to ___ years.', 'three'], ['Koalas have fingerprints that are almost identical to those of ___.', 'humans'], ['The little dot over a lowercase “i” is called a ___.', 'tittle'],
  ['The # symbol is technically called an ___.', 'octothorpe'], ['A group of pandas is called an ___.', 'embarrassment'], ['Bubble wrap was originally invented to be ___.', 'wallpaper'],
  ['Coca-Cola was first sold as a ___.', 'medicine'], ['Nintendo was founded in 1889 to make ___.', 'playing cards'], ['The Twitter bird logo was officially named ___.', 'Larry'],
  ['The Mona Lisa has no ___.', 'eyebrows'], ['In 1932, the Australian army lost a “war” against ___.', 'emus'], ['The microwave oven was invented after a ___ melted in an engineer’s pocket.', 'chocolate bar'],
  ['Sloths can hold their breath longer than ___.', 'dolphins'], ['Humans share about 60% of their DNA with ___.', 'bananas'], ['The longest English word with no vowels (a, e, i, o, u) is ___.', 'rhythms'],
  ['“Spaghetti” comes from the Italian word for little ___.', 'strings'], ['“Quarantine” comes from the Italian for ___ days.', 'forty'], ['Hawaiian pizza was invented in ___.', 'Canada'],
  ['The fortune cookie was invented in ___, not China.', 'California'], ['The first email was sent in the year ___.', '1971'], ['Butterflies taste with their ___.', 'feet'], ['Crocodiles cannot stick out their ___.', 'tongues'],
  ['Peanuts are not nuts — they are ___.', 'legumes'], ['The inventor of the cotton candy machine was a ___.', 'dentist'], ['Antarctica is the largest ___ on Earth.', 'desert'], ['Mount Everest grows about ___ millimetres every year.', '4'],
  ['A day on Venus is longer than its ___.', 'year'], ['Honey is made by bees from flower ___.', 'nectar'], ['The Statue of Liberty is made mostly of ___.', 'copper'], ['The Eiffel Tower grows taller in summer because of ___.', 'heat'],
  ['The hamburger was named after the city of ___.', 'Hamburg'], ['“Goodbye” is a contraction of “God be with ___.”', 'ye'], ['The first living creature in orbit was a dog named ___.', 'Laika'],
];

const CSS = `
.fq-q { font:700 clamp(20px, 5vw, 28px)/1.3 var(--font); }
.fq-q u { text-decoration:none; background:rgba(255,255,255,.35); border-radius:8px; padding:0 14px; }
.fq-opt { position:relative; }
.fq-who { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; align-items:center; }
.fq-who .tag { font:700 12px var(--font); color:var(--on2); margin-right:4px; }
`;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const rounds = +api.opts.rounds || 6;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 0, q: '', mineSent: false, opts: [], picked: null, res: null, scores: {}, done: new Set(), err: '' };
  ids.forEach((i) => (S.scores[i] = 0));
  const blank = (q) => q.split('___').flatMap((t, i, a) => (i < a.length - 1 ? [t, h('u', '     ')] : [t]));

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms);
    if (p.name === 'lie') { S.round = p.round; S.q = p.q; S.mineSent = false; S.err = ''; S.done = new Set(); }
    if (p.name === 'pick') { S.opts = p.opts; S.picked = null; S.done = new Set(); }
    if (p.name === 'reveal') { S.res = p.res; S.scores = p.scores; api.sfx(p.res.fooledMe ? 'bad' : 'good'); }
    render();
  });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.on('rej', (r) => { S.err = r.msg; S.mineSent = false; api.sfx('bad'); render(); });
  api.onPlayersChanged(render);

  function render() {
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Question ${S.round}/${rounds}`))];
    if (S.phase === 'lie') {
      parts.push(clock.el(), h('div.kt-prompt', { style: '--pc:#8e4de8' }, h('small', 'Make up a believable fake answer'), h('div.fq-q', ...blank(S.q))));
      if (S.err) parts.push(h('div.warnbox', icon('warning'), S.err));
      if (S.mineSent) parts.push(h('div.kt-hint', 'Fib submitted!'), waiting(api, ids.filter((i) => !S.done.has(i))));
      else parts.push(answerBox({ placeholder: 'Your fake answer…', max: 40, button: 'Submit fib', onSubmit: (t) => { S.mineSent = true; api.toHost('lie', { t }); render(); } }).el);
    } else if (S.phase === 'pick') {
      parts.push(clock.el(), h('div.kt-prompt', { style: '--pc:#1a73e8' }, h('small', 'Which one is TRUE?'), h('div.fq-q', ...blank(S.q))));
      parts.push(...S.opts.map((o) => h('button.kt-choice.fq-opt' + (S.picked === o.i ? '.sel' : ''), { disabled: o.mine || S.picked !== null, onclick: () => { S.picked = o.i; api.toHost('pick', { i: o.i }); api.sfx('click'); render(); } }, o.text, o.mine ? h('small', 'Your own fib') : null)));
      parts.push(waiting(api, ids.filter((i) => !S.done.has(i)), 'Waiting for'));
    } else if (S.phase === 'reveal' && S.res) {
      const r = S.res;
      parts.push(h('div.kt-prompt', { style: '--pc:#34a853' }, h('small', 'The truth is'), h('div.fq-q', r.truth)));
      parts.push(...r.opts.map((o) => h('div.kt-choice' + (o.truth ? '.win' : ''), { style: 'cursor:default' }, o.text,
        h('div.fq-who', o.truth ? h('span.chip.green', icon('check'), 'TRUE') : h('span.tag', 'Fib by ' + o.authors.map(nameOf).join(' & ')), ...o.pickers.map((p) => avatarEl(api.player(p) || {}, 'xs', { still: true })), o.pickers.length ? h('span.tag', `${o.pickers.length} fooled`.replace('fooled', o.truth ? 'knew it' : 'fooled')) : null))));
      parts.push(scorePills(api, S.scores));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, facts: sample(FACTS, rounds, rng), lies: {}, opts: [], picks: {}, timer: 0, phase: 'wait', scores: {}, deadline: 0 };
    ids.forEach((i) => (H.scores[i] = 0));
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    function lie() {
      H.round++; H.lies = {}; H.picks = {};
      hostPhase(api, H, 'lie', 50000, toPick, { round: H.round, q: H.facts[H.round - 1][0] });
    }
    function toPick() {
      clearTimeout(H.timer);
      const truth = H.facts[H.round - 1][1];
      const map = new Map();
      for (const [a, t] of Object.entries(H.lies)) { const k = norm(t); if (!map.has(k)) map.set(k, { text: t, authors: [] }); map.get(k).authors.push(a); }
      H.opts = shuffled([{ text: truth, truth: true, authors: [] }, ...map.values()].map((o) => ({ ...o, pickers: [] })), rng).map((o, i) => ({ ...o, i }));
      for (const id of ids) api.sendTo(id, 'phase', { name: 'pick', ms: 28000, opts: H.opts.map((o) => ({ i: o.i, text: o.text, mine: o.authors.includes(id) })) });
      H.phase = 'pick'; H.deadline = performance.now() + 28000;
      H.timer = setTimeout(reveal, 28300);
    }
    function reveal() {
      clearTimeout(H.timer);
      const truthOpt = H.opts.find((o) => o.truth);
      for (const [p, i] of Object.entries(H.picks)) {
        const o = H.opts[i];
        o.pickers.push(p);
        if (o.truth) H.scores[p] += 500;
        else o.authors.forEach((a) => { H.scores[a] += 250; });
      }
      ids.forEach((id) => api.sendTo(id, 'phase', { name: 'reveal', ms: 0, res: { truth: truthOpt.text, opts: H.opts.map((o) => ({ text: o.text, truth: !!o.truth, authors: o.authors, pickers: o.pickers })), fooledMe: H.picks[id] !== undefined && !H.opts[H.picks[id]].truth }, scores: H.scores }));
      H.phase = 'reveal';
      H.timer = setTimeout(next, 9000);
    }
    function next() {
      if (H.round >= rounds) {
        const ranking = rankingFrom(api, H.scores);
        return api.endGame({ title: `${nameOf(ranking[0].id)} is the best fibber!`, subtitle: 'Hard to fool, easy to trust', ranking, winners: [ranking[0].id] });
      }
      lie();
    }
    api.on('lie', ({ t }, from) => {
      if (H.phase !== 'lie' || H.lies[from]) return;
      t = String(t || '').trim().slice(0, 40);
      if (!t) return;
      if (norm(t) === norm(H.facts[H.round - 1][1])) return api.sendTo(from, 'rej', { msg: 'Too close to the real answer! Try a different fib.' });
      H.lies[from] = t;
      api.broadcast('done', { ids: Object.keys(H.lies) });
      if (alive().every((i) => H.lies[i])) { clearTimeout(H.timer); api.timeout(toPick, 600); }
    });
    api.on('pick', ({ i }, from) => {
      if (H.phase !== 'pick' || H.picks[from] !== undefined) return;
      const o = H.opts[i];
      if (!o || o.authors.includes(from)) return;
      H.picks[from] = i;
      api.broadcast('done', { ids: Object.keys(H.picks) });
      if (alive().every((p) => H.picks[p] !== undefined)) { clearTimeout(H.timer); api.timeout(reveal, 600); }
    });
    api.timeout(lie, 700);
  }
  render();
}
