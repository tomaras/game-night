// Doodle Telephone — write a sentence, someone draws it, someone describes that drawing, and so on.
// Every player starts one "book"; books rotate each step. At the end each book is revealed step by step.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { createDrawPad } from '../drawpad.js';
import { makeClock, waiting, promptCard, answerBox, scorePills, sample } from '../kit.js';

const IDEAS = [
  'A penguin trying to catch a bus', 'Grandma winning an esports tournament', 'A cat DJing at a wedding', 'Two dinosaurs sharing an umbrella', 'A pirate who is scared of water',
  'A robot learning to dance', 'An octopus doing laundry', 'A king stuck in an elevator', 'Pizza falling in love with a pineapple', 'A snowman on a beach vacation',
  'A giraffe at the dentist', 'Aliens abducting a very confused cow', 'A shark riding a skateboard', 'A wizard ordering coffee', 'A dragon afraid of candles',
  'A bear attending yoga class', 'The moon wearing sunglasses', 'A chef made of spaghetti', 'A squirrel running for president', 'A ghost doing its taxes',
  'A flamingo giving a TED talk', 'A turtle winning a race', 'A superhero who can only make toast', 'A mermaid in a bathtub', 'A camel at the North Pole',
  'A sloth in a hurry', 'A unicorn stuck in traffic', 'A frog playing the violin', 'A sleepy volcano', 'A hamster driving a bulldozer',
  'A cowboy on a pogo stick', 'Kangaroos doing karaoke', 'A shy ninja at a party', 'An astronaut walking a dog on Mars', 'A talking tree giving advice',
  'A tiny elephant in a teacup', 'A zombie baking cookies', 'A knight fighting a vacuum cleaner', 'A penguin in a tuxedo ordering sushi', 'A cloud that is having a bad day',
];

const CSS = `
.tp-chain { display:flex; flex-direction:column; gap:12px; }
.tp-entry { display:flex; gap:10px; align-items:flex-start; animation:ktpop .4s both; }
.tp-entry .av { margin-top:2px; }
.tp-bub { background:var(--surface); box-shadow:var(--e1); border-radius:20px 20px 20px 6px; padding:12px 16px; font:600 17px/1.35 var(--font); flex:1; min-width:0; word-break:break-word; }
.tp-bub img { width:100%; border-radius:12px; display:block; background:#fff; }
.tp-bub .by { font:700 12px var(--font); color:var(--on3); margin-bottom:4px; text-transform:uppercase; letter-spacing:.6px; }
.tp-heart { border:0; background:var(--s2); border-radius:999px; height:34px; padding:0 12px; display:inline-flex; gap:6px; align-items:center; cursor:pointer; font:700 13px var(--font); color:var(--on2); margin-top:8px; }
.tp-heart.on { background:var(--pink-c); color:var(--pink-d); }
.tp-heart .ic { width:18px; height:18px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const steps = api.opts.steps === 'short' ? Math.min(N, 4) : Math.min(N, 8);
  const drawMs = (+api.opts.drawTime || 60) * 1000, writeMs = 40000;
  const nameOf = (id) => api.player(id)?.name || '?';

  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', step: 0, task: null, submitted: false, done: new Set(), rev: null, hearts: {}, mine: new Set() };
  let pad = null, idea = null;

  const submit = (data) => {
    if (S.submitted) return;
    S.submitted = true;
    api.toHost('sub', { d: data });
    api.sfx('good');
    render();
  };

  api.on('phase', (p) => {
    S.phase = p.phase; S.step = p.step || 0; S.of = p.of; S.submitted = false; S.done = new Set(); S.task = null; pad = null;
    clock.set(p.ms || 0);
    if (p.phase === 'end') return;
    render();
  });
  api.on('task', (t) => { S.task = t; render(); });
  api.on('done', (d) => { S.done = new Set(d.ids); if (S.phase !== 'reveal') render(); });
  api.on('revbook', (b) => { S.rev = { b: b.b, owner: b.owner, entries: [], total: b.total, last: false }; S.hearts = {}; S.mine = new Set(); render(); });
  api.on('revstep', (e) => { if (!S.rev) return; S.rev.entries[e.s] = e; S.rev.last = e.last; render(); api.sfx(e.type === 'draw' ? 'pop' : 'msg'); });
  api.on('hearts', (m) => { S.hearts[m.s] = m.n; if (S.phase === 'reveal') render(); });
  api.onPlayersChanged(() => render());
  api.interval(() => {
    // auto-submit what I have when the clock runs out
    if (S.phase === 'task' && S.task && !S.submitted && clock.left() <= 0) {
      if (S.task.type === 'draw') submit(pad ? pad.toDataURL() : '');
      else { const el = root.querySelector('input.txt, textarea.txt'); submit((el && el.value.trim()) || '…'); }
    }
    if (S.phase === 'write0' && !S.submitted && clock.left() <= 0) { const el = root.querySelector('textarea.txt'); submit((el && el.value.trim()) || sample(IDEAS, 1)[0]); }
  }, 400);

  function header(text, sub) { return h('div.kt-card', { style: 'text-align:center' }, h('div.kt-title', sub || ''), h('div', { style: 'font:800 22px var(--font);margin-top:2px' }, text)); }

  function render() {
    const parts = [];
    if (S.phase === 'write0') {
      parts.push(header('Write something fun to draw', `Step 1 of ${steps}`), clock.el());
      if (S.submitted) parts.push(h('div.kt-center', h('div', [h('div.kt-big', '✓'), waiting(api, ids.filter((i) => !S.done.has(i)))])));
      else {
        const ab = answerBox({ placeholder: 'e.g. A cat DJing at a wedding', max: 90, multiline: true, button: 'Send', onSubmit: submit, value: idea || '' });
        parts.push(h('div.kt-card', { style: 'display:flex;flex-direction:column;gap:10px' }, ab.el, h('button.btn.tonal.small', { style: 'align-self:flex-start', onclick: () => { idea = sample(IDEAS, 1)[0]; ab.input.value = idea; } }, icon('casino'), 'Surprise me')));
      }
    } else if (S.phase === 'task') {
      const t = S.task;
      if (!t) parts.push(h('div.kt-center', h('div.spinner')));
      else if (t.type === 'draw') {
        parts.push(header('Draw this!', `Step ${S.step + 1} of ${steps}`), promptCard(t.prompt, { label: 'Your prompt', color: '#e5399b' }), clock.el());
        if (S.submitted) parts.push(h('div.kt-center', h('div', [h('div.kt-big', '✓'), waiting(api, ids.filter((i) => !S.done.has(i)))])));
        else {
          pad = pad || createDrawPad({ w: 560, h: 420 });
          parts.push(pad.el, h('div.kt-sticky', h('button.btn.primary.big.block', { onclick: () => submit(pad.toDataURL()) }, icon('check'), 'Done')));
        }
      } else {
        parts.push(header('What is this?', `Step ${S.step + 1} of ${steps}`), clock.el(), h('img.kt-img', { src: t.prompt, alt: 'drawing' }));
        if (S.submitted) parts.push(h('div.kt-center', h('div', [h('div.kt-big', '✓'), waiting(api, ids.filter((i) => !S.done.has(i)))])));
        else parts.push(answerBox({ placeholder: 'Describe the drawing in a sentence', max: 90, onSubmit: submit }).el);
      }
    } else if (S.phase === 'reveal') {
      const r = S.rev;
      parts.push(h('div.kt-card', { style: 'text-align:center' }, h('div.kt-title', 'The reveal'), h('div', { style: 'font:800 20px var(--font)' }, r ? `${nameOf(r.owner)}’s story` : 'Get ready…')));
      if (r) {
        parts.push(h('div.tp-chain', r.entries.filter(Boolean).map((e) => {
          const heart = h('button.tp-heart' + (S.mine.has(e.s) ? '.on' : ''), { onclick: () => { api.toHost('heart', { s: e.s }); S.mine.has(e.s) ? S.mine.delete(e.s) : S.mine.add(e.s); api.sfx('click'); render(); } }, icon('favorite'), S.hearts[e.s] || 0);
          return h('div.tp-entry', avatarEl(api.player(e.by) || { avatar: null }, 'lg', { still: true }),
            h('div.tp-bub', h('div.by', nameOf(e.by) + (e.type === 'draw' ? ' drew' : e.s === 0 ? ' wrote' : ' guessed')), e.type === 'draw' ? h('img', { src: e.data, alt: 'drawing' }) : e.data, heart));
        })));
        if (api.isHost) parts.push(h('button.btn.primary.big.block', { onclick: () => api.toHost('next') }, icon('arrow_forward'), r.last ? 'Next story' : 'Next'));
        else parts.push(h('div.kt-hint', 'The host moves the story along — tap ♥ on your favourites!'));
      }
    }
    root.replaceChildren(...parts);
  }

  // ============================================================ host
  if (api.isHost) {
    const rng = api.rng;
    const H = { step: 0, books: ids.map(() => []), subs: {}, timer: 0, rb: 0, rs: 0, hearts: {}, loved: {}, phase: 'wait' };
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    const done = () => api.broadcast('done', { ids: Object.keys(H.subs) });
    const typeOf = (r) => (r === 0 ? 'write' : r % 2 === 1 ? 'draw' : 'write');

    function beginStep(r) {
      H.step = r; H.subs = {};
      const ms = r === 0 ? writeMs : typeOf(r) === 'draw' ? drawMs : writeMs;
      H.phase = r === 0 ? 'write0' : 'task';
      api.broadcast('phase', { phase: H.phase, step: r, of: steps, ms });
      if (r > 0) ids.forEach((id, idx) => {
        const b = (idx - r + N * 10) % N;
        const prev = H.books[b][r - 1];
        api.sendTo(id, 'task', { type: typeOf(r), prompt: prev ? prev.data : '', step: r });
      });
      clearTimeout(H.timer);
      H.timer = setTimeout(endStep, ms + 2500);
    }
    function endStep() {
      clearTimeout(H.timer);
      const r = H.step;
      ids.forEach((id, idx) => {
        const b = (idx - r + N * 10) % N;
        let d = H.subs[id];
        const type = typeOf(r);
        if (type === 'draw') { if (!(typeof d === 'string' && d.startsWith('data:image/'))) d = BLANK; } else if (!d) d = r === 0 ? sample(IDEAS, 1, rng)[0] : '…';
        H.books[b][r] = { by: id, type, data: d };
      });
      if (r + 1 < steps) beginStep(r + 1); else startReveal();
    }
    const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    function startReveal() {
      H.phase = 'reveal'; H.rb = 0; H.rs = -1;
      api.broadcast('phase', { phase: 'reveal', step: 0, of: steps, ms: 0 });
      showBook();
    }
    function showBook() {
      api.broadcast('revbook', { b: H.rb, owner: ids[H.rb], total: H.books[H.rb].length });
      H.rs = -1;
      nextEntry();
    }
    function nextEntry() {
      H.rs++;
      const book = H.books[H.rb];
      const e = book[H.rs];
      if (!e) return nextBook();
      api.broadcast('revstep', { s: H.rs, by: e.by, type: e.type, data: e.data, last: H.rs === book.length - 1 });
    }
    function nextBook() {
      if (H.rb + 1 < N) { H.rb++; showBook(); } else finish();
    }
    function finish() {
      clearTimeout(H.timer);
      const ranking = ids.slice().sort((a, b) => (H.loved[b] || 0) - (H.loved[a] || 0)).map((id) => ({ id, score: H.loved[id] || 0, note: 'hearts' }));
      api.endGame({ title: `${nameOf(ranking[0].id)}’s doodles stole the show!`, subtitle: 'Most hearts on the reveal', ranking, winners: [ranking[0].id] });
    }
    api.on('sub', ({ d }, from) => {
      if (!['write0', 'task'].includes(H.phase) || H.subs[from] !== undefined) return;
      d = String(d || '');
      if (typeOf(H.step) === 'draw') { if (!d.startsWith('data:image/') || d.length > 150000) d = ''; } else d = d.slice(0, 120);
      H.subs[from] = d;
      done();
      if (alive().every((i) => H.subs[i] !== undefined)) { clearTimeout(H.timer); api.timeout(endStep, 400); }
    });
    api.on('next', (_, from) => { if (from === api.me && H.phase === 'reveal') nextEntry(); });
    api.on('heart', ({ s }, from) => {
      if (H.phase !== 'reveal') return;
      const key = H.rb + ':' + s;
      const set = (H.hearts[key] = H.hearts[key] || new Set());
      const author = H.books[H.rb][s]?.by;
      if (!author || author === from) return;
      if (set.has(from)) { set.delete(from); H.loved[author] = (H.loved[author] || 1) - 1; } else { set.add(from); H.loved[author] = (H.loved[author] || 0) + 1; }
      api.broadcast('hearts', { s, n: set.size });
    });
    api.onRejoin((id) => {
      api.sendTo(id, 'phase', { phase: H.phase, step: H.step, of: steps, ms: 15000 });
      if (H.phase === 'task' && H.step > 0) { const idx = ids.indexOf(id); const b = (idx - H.step + N * 10) % N; const prev = H.books[b][H.step - 1]; api.sendTo(id, 'task', { type: typeOf(H.step), prompt: prev ? prev.data : '', step: H.step }); }
      if (H.phase === 'reveal') { api.sendTo(id, 'revbook', { b: H.rb, owner: ids[H.rb], total: H.books[H.rb].length }); H.books[H.rb].slice(0, H.rs + 1).forEach((e, s) => api.sendTo(id, 'revstep', { s, by: e.by, type: e.type, data: e.data, last: s === H.books[H.rb].length - 1 })); }
    });
    api.onLeave(() => { if (H.phase === 'task' || H.phase === 'write0') { if (alive().length && alive().every((i) => H.subs[i] !== undefined)) endStep(); } });
    void scorePills;
    api.timeout(() => beginStep(0), 700);
  }
  render();
}
