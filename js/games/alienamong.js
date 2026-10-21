// Alien Among Us — a deduction game for the whole spaceship. Everyone answers a question — but the aliens got a
// slightly different one! Compare answers, argue, and vote suspects out of the airlock. 4–10 players.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, shuffled } from '../kit.js';

// [question for the crew, question for the aliens]
const PAIRS = [
  ['What’s your favourite thing to do on a rainy day?', 'What’s your favourite thing to do on a very sunny day?'],
  ['Name something you’d bring on a picnic.', 'Name something you’d bring on a spaceship.'],
  ['What’s the best thing about the weekend?', 'What’s the best thing about Mondays?'],
  ['Describe your perfect breakfast.', 'Describe your perfect midnight snack.'],
  ['What would you do if you won the lottery?', 'What would you do if you lost your wallet?'],
  ['Name a place you’d love to visit.', 'Name a place you’d never want to visit.'],
  ['What’s a good name for a pet dog?', 'What’s a good name for a pet dragon?'],
  ['What do you do when you can’t sleep?', 'What do you do when you wake up too early?'],
  ['Name a skill you wish you had.', 'Name a skill you’re proud of.'],
  ['What’s something you do every morning?', 'What’s something you do every night?'],
  ['What’s your favourite season, and why?', 'What’s your least favourite season, and why?'],
  ['Describe your ideal holiday.', 'Describe your worst holiday ever.'],
  ['Name a song that makes you happy.', 'Name a song that makes you cry.'],
  ['What’s the best gift you ever received?', 'What’s the worst gift you ever received?'],
  ['What would you grab in a fire?', 'What would you grab on the way out of the house?'],
  ['What’s a food you could eat every day?', 'What’s a food you could never eat again?'],
  ['What’s your dream job?', 'What’s your least favourite chore?'],
  ['How do you like to celebrate your birthday?', 'How do you like to spend a lazy Sunday?'],
  ['Name a movie everyone should watch.', 'Name a movie you walked out of.'],
  ['What’s the first thing you do when you get home?', 'What’s the first thing you do when you arrive at a party?'],
];

const CSS = `
.al-role { border-radius:28px; padding:16px; text-align:center; color:#fff; cursor:pointer; user-select:none; box-shadow:var(--e2); background:linear-gradient(150deg,#1e88e5,#0d47a1); } .al-role.alien { background:linear-gradient(150deg,#43a047,#1b5e20); } .al-role.cover { background:linear-gradient(150deg,#5c6bc0,#283593); }
.al-role .em { font-size:48px; line-height:1; display:block; } .al-role b { font:800 22px var(--font); display:block; margin:2px 0; } .al-role small { opacity:.9; font:500 13px/1.35 var(--font); display:block; }
.al-ans { display:flex; flex-direction:column; gap:8px; }
.al-a { display:flex; gap:10px; align-items:flex-start; background:var(--surface); box-shadow:var(--e1); border-radius:20px; padding:10px 14px; animation:ktpop .35s both; } .al-a .nm { font:800 13px var(--font); color:var(--on2); } .al-a .tx { font:600 16px/1.35 var(--font); word-break:break-word; } .al-a.out { opacity:.5; }
.al-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr)); gap:8px; }
.al-p { border:3px solid transparent; background:var(--surface); box-shadow:var(--e1); border-radius:20px; padding:10px 6px; display:flex; flex-direction:column; align-items:center; gap:4px; font:700 13px var(--font); color:var(--on); cursor:pointer; position:relative; } .al-p.sel { border-color:var(--red); background:var(--red-c); } .al-p.out { opacity:.4; cursor:default; } .al-p .cnt { position:absolute; top:-8px; right:-4px; background:var(--red); color:#fff; border-radius:12px; padding:2px 8px; font:800 12px var(--font); }
.al-eject { text-align:center; display:flex; flex-direction:column; align-items:center; gap:10px; padding:10px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, role: null, mates: [], q: '', alive: ids.slice(), answers: {}, votes: null, myVote: null, ready: new Set(), voted: new Set(), eject: null, show: true, submitted: false, done: new Set(), end: null, tally: {} };
  let input = null;

  api.on('role', (r) => { S.role = r.role; S.mates = r.mates || []; S.show = true; api.sfx('pop'); render(); });
  api.on('ph', (p) => {
    for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
    Object.assign(S, p); S.done = new Set(p.done || S.done); S.ready = new Set(p.ready || []); S.voted = new Set(p.voted || []);
    if (p.ms !== undefined) clock.set(p.ms);
    if (p.fresh) { S.submitted = false; input = null; S.myVote = null; }
    S.phase = p.name; if (p.sfx) api.sfx(p.sfx);
    render();
  });
  api.on('q', (m) => { S.q = m.q; render(); });
  api.onPlayersChanged(render);

  function roleCard() {
    const a = S.role === 'alien';
    if (!S.role) return h('div');
    return h('div.al-role' + (a ? '.alien' : '') + (S.show ? '' : '.cover'), { onclick: () => { S.show = !S.show; render(); } }, S.show ? [h('span.em.emo', a ? '👽' : '🧑‍🚀'), h('b', a ? 'You are an ALIEN' : 'You are a HUMAN'), h('small', a ? `Blend in! Your question is slightly different.${S.mates.length ? ' Fellow aliens: ' + S.mates.map(nameOf).join(', ') + '.' : ' You’re the only alien.'}` : 'Find the aliens. Their answers will be a little “off”.'), h('small', { style: 'margin-top:4px;opacity:.7' }, '(tap to hide)')] : [h('span.em', icon('visibility')), h('b', 'Tap to see your role')]);
  }
  const iAlive = () => S.alive.includes(api.me);

  function render() {
    const me = api.me;
    const head = h('div.kt-row', { style: 'justify-content:center' }, h('span.chip.blue', `Day ${S.round}`), h('span.chip.green', `${S.alive.length} aboard`), ['answer', 'discuss', 'vote'].includes(S.phase) ? clock.el() : null);
    const ans = () => h('div.al-ans', Object.keys(S.answers).filter((id) => S.answers[id] !== undefined).map((id) => h('div.al-a' + (S.alive.includes(id) ? '' : '.out'), avatarEl(api.player(id), 'sm', { still: true }), h('div', h('div.nm', nameOf(id) + (id === me ? ' (you)' : '')), h('div.tx', S.answers[id])))));
    if (S.phase === 'answer') {
      input = input || h('input.txt', { placeholder: 'Your answer…', maxlength: 60, autocomplete: 'off' });
      if (!iAlive()) return root.replaceChildren(head, h('div.kt-card', { style: 'text-align:center' }, '🚪 You were ejected. Watch and cheer from the airlock!'));
      return root.replaceChildren(head, roleCard(), h('div.kt-prompt', { style: `--pc:${S.role === 'alien' ? '#2e7d32' : '#1565c0'}` }, h('small', 'Your question'), S.q),
        S.submitted ? h('div.kt-card', { style: 'text-align:center' }, '✅ Answer sent! Waiting for the crew…') : h('div.kt-field', input, h('button.btn.primary', { onclick: () => { const t = input.value.trim(); if (!t) return; S.submitted = true; api.toHost('ans', { t }); api.sfx('good'); render(); } }, icon('send'), 'Send')));
    }
    if (S.phase === 'discuss') {
      const rd = S.ready.has(me);
      return root.replaceChildren(head, roleCard(), h('div.kt-title', 'Everyone’s answers'), ans(), h('div.kt-hint', 'Discuss in chat or by voice: whose answer sounds off? Different questions were asked…'), iAlive() ? h('button.btn.' + (rd ? 'tonal' : 'primary') + '.block', { onclick: () => api.toHost('ready', {}) }, icon('check'), rd ? 'Ready to vote ✓' : 'Ready to vote') : '');
    }
    if (S.phase === 'vote') {
      if (!iAlive()) return root.replaceChildren(head, h('div.kt-card', { style: 'text-align:center' }, '🚪 You were ejected — watching the vote.'), ans());
      return root.replaceChildren(head, h('div.kt-prompt', { style: '--pc:#c62828' }, h('small', 'Emergency meeting'), 'Who is the alien?'), roleCard(), ans(), h('div.al-grid', S.alive.filter((id) => id !== me).map((id) => h('button.al-p' + (S.myVote === id ? '.sel' : ''), { onclick: () => { S.myVote = id; api.toHost('vote', { id }); api.sfx('pop'); render(); } }, avatarEl(api.player(id), 'lg', { still: true }), nameOf(id), S.voted.has(id) ? h('span.chip.green', { style: 'height:20px;font-size:11px' }, 'voted') : null))), h('div.kt-hint', S.myVote ? 'Vote locked — you can still change it.' : 'Tap a suspect.'));
    }
    if (S.phase === 'eject' && S.eject) {
      const e = S.eject;
      return root.replaceChildren(h('div.kt-prompt', { style: `--pc:${e.id ? (e.alien ? '#2e7d32' : '#1565c0') : '#546e7a'}` }, h('small', 'The votes are in'), e.id ? `${nameOf(e.id)} was ejected!` : 'Nobody was ejected'),
        h('div.al-eject', e.id ? [avatarEl(api.player(e.id), 'xl', { still: false }), h('div', { style: 'font:800 22px var(--font)' }, e.alien ? '👽 …and they WERE an alien!' : '🧑‍🚀 …but they were a human.')] : h('div.kt-hint', 'The votes were tied or too scattered.'), h('div.kt-hint', Object.entries(S.tally).map(([id, n]) => `${nameOf(id)}: ${n}`).join(' · '))),
        h('div.kt-hint', e.left ? `${e.left} alien${e.left > 1 ? 's' : ''} still hiding…` : ''));
    }
    if (S.phase === 'end' && S.end) {
      const e = S.end;
      return root.replaceChildren(h('div.kt-prompt', { style: `--pc:${e.humans ? '#1565c0' : '#2e7d32'}` }, h('small', 'Game over'), e.humans ? '🧑‍🚀 The humans win!' : '👽 The aliens win!'), h('div.kt-card', { style: 'text-align:center' }, 'The aliens were: ', h('b', e.aliens.map(nameOf).join(', '))));
    }
    root.replaceChildren(head, h('div.kt-hint', 'Preparing the ship…'));
  }

  if (api.isHost) {
    const rng = api.rng;
    const nAl = N <= 5 ? 1 : N <= 8 ? 2 : 3;
    const aliens = new Set(rng.shuffle(ids.slice()).slice(0, nAl));
    const H = { round: 0, alive: ids.slice(), answers: {}, votes: {}, ready: new Set(), phase: 'wait', timer: 0, pairs: shuffled(PAIRS, rng), pair: null, tally: {} };
    api.cleanup(() => clearTimeout(H.timer));
    const live = () => H.alive.filter((i) => !api.player(i).left);
    const ph = (name, extra = {}) => { H.phase = name; api.broadcast('ph', { name, round: H.round, alive: H.alive, answers: H.answers, done: Object.keys(H.answers), ready: [...H.ready], voted: Object.keys(H.votes), ...extra }); };
    ids.forEach((id) => api.sendTo(id, 'role', { role: aliens.has(id) ? 'alien' : 'human', mates: aliens.has(id) ? [...aliens].filter((x) => x !== id) : [] }));
    function newRound() {
      H.round++; H.answers = {}; H.votes = {}; H.ready = new Set();
      H.pair = H.pairs[(H.round - 1) % H.pairs.length];
      ids.forEach((id) => { if (H.alive.includes(id)) api.sendTo(id, 'q', { q: aliens.has(id) ? H.pair[1] : H.pair[0] }); });
      ph('answer', { ms: 40000, fresh: true, answers: {} });
      clearTimeout(H.timer);
      H.timer = setTimeout(startDiscuss, 41000);
    }
    api.on('ans', ({ t }, from) => {
      if (H.phase !== 'answer' || !H.alive.includes(from) || H.answers[from] !== undefined) return;
      H.answers[from] = String(t || '…').slice(0, 60);
      if (live().every((i) => H.answers[i] !== undefined)) { clearTimeout(H.timer); H.timer = setTimeout(startDiscuss, 600); } else api.broadcast('ph', { name: 'answer', done: Object.keys(H.answers) });
    });
    function startDiscuss() {
      clearTimeout(H.timer);
      if (H.phase !== 'answer') return;
      live().forEach((i) => { if (H.answers[i] === undefined) H.answers[i] = '(no answer)'; });
      const show = {}; rng.shuffle(H.alive.slice()).forEach((i) => (show[i] = H.answers[i]));
      H.ready = new Set();
      ph('discuss', { answers: show, ms: 75000, sfx: 'good' });
      H.timer = setTimeout(startVote, 76000);
    }
    api.on('ready', (_, from) => {
      if (H.phase !== 'discuss' || !H.alive.includes(from) || H.ready.has(from)) return;
      H.ready.add(from);
      ph('discuss');
      if (live().every((i) => H.ready.has(i))) { clearTimeout(H.timer); H.timer = setTimeout(startVote, 1000); }
    });
    function startVote() {
      clearTimeout(H.timer);
      if (H.phase !== 'discuss') return;
      H.votes = {};
      ph('vote', { ms: 30000, fresh: true });
      H.timer = setTimeout(tally, 30500);
    }
    api.on('vote', ({ id }, from) => {
      if (H.phase !== 'vote' || !H.alive.includes(from) || !H.alive.includes(id) || id === from) return;
      H.votes[from] = id;
      if (live().every((i) => H.votes[i])) { clearTimeout(H.timer); H.timer = setTimeout(tally, 1000); } else api.broadcast('ph', { name: 'vote', voted: Object.keys(H.votes) });
    });
    function tally() {
      clearTimeout(H.timer);
      if (H.phase !== 'vote') return;
      const t = {};
      Object.values(H.votes).forEach((id) => (t[id] = (t[id] || 0) + 1));
      const max = Math.max(0, ...Object.values(t));
      const top = Object.keys(t).filter((id) => t[id] === max);
      const out = max >= 2 && top.length === 1 ? top[0] : null;
      if (out) H.alive = H.alive.filter((i) => i !== out);
      const left = H.alive.filter((i) => aliens.has(i)).length;
      H.phase = 'eject';
      api.broadcast('ph', { name: 'eject', alive: H.alive, eject: { id: out, alien: out ? aliens.has(out) : false, left }, tally: t, sfx: out ? (aliens.has(out) ? 'win' : 'lose') : 'pop' });
      H.timer = setTimeout(() => {
        const humans = H.alive.length - left;
        if (left === 0) return end(true);
        if (left >= humans) return end(false);
        newRound();
      }, 7000);
    }
    function end(humansWin) {
      H.phase = 'end';
      api.broadcast('ph', { name: 'end', end: { humans: humansWin, aliens: [...aliens] }, alive: H.alive, sfx: 'win' });
      H.timer = setTimeout(() => {
        const winners = ids.filter((id) => aliens.has(id) !== humansWin);
        const ranking = [...winners, ...ids.filter((i) => !winners.includes(i))].map((id) => ({ id, score: winners.includes(id) ? 'win' : 'loss', note: aliens.has(id) ? '👽 alien' : '🧑‍🚀 human' }));
        api.endGame({ title: humansWin ? 'The humans saved the ship!' : 'The aliens took over!', subtitle: `Aliens: ${[...aliens].map(nameOf).join(', ')}`, ranking, winners });
      }, 5500);
    }
    api.onRejoin((id) => { api.sendTo(id, 'role', { role: aliens.has(id) ? 'alien' : 'human', mates: aliens.has(id) ? [...aliens].filter((x) => x !== id) : [] }); });
    api.onLeave((id) => { if (H.phase === 'wait') return; const left = H.alive.filter((i) => aliens.has(i) && !api.player(i).left).length, humans = H.alive.filter((i) => !aliens.has(i) && !api.player(i).left).length; if (left === 0) end(true); else if (left >= humans) end(false); });
    api.timeout(newRound, 1500);
  }
  render();
}
