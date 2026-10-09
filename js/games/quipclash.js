// Quip Clash — answer funny prompts; every prompt is answered by two players and the rest vote on the funnier answer.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, scorePills, waiting, hostPhase, rankingFrom, sample, promptCard, answerBox } from '../kit.js';

const PROMPTS = [
  'The worst name for a pet goldfish', 'A terrible slogan for a funeral home', 'What the dog is really thinking', 'The worst thing to hear from your pilot', 'A rejected ice cream flavor',
  'Something you should never say to a police officer', 'The real reason the chicken crossed the road', 'A bad title for a children’s book', 'What aliens would say about Earth after one day here', 'The worst superpower',
  'A surprising use for a spatula', 'Something you shouldn’t put in a microwave but someone did', 'The worst thing to find in your sandwich', 'A bad name for a new colour', 'What your cat does when you leave',
  'The worst advice for a first date', 'A strange rule at a very fancy restaurant', 'What a ghost hates most about haunting', 'The least helpful tip for a job interview', 'A bad theme for a wedding',
  'Something you would find in a wizard’s fridge', 'The worst reason to be late to work', 'A rejected Olympic sport', 'What the moon whispers to the sun', 'The worst thing to yell in a library',
  'A very honest greeting card', 'An unexpected side effect of eating too much cheese', 'The worst name for a boat', 'What two clouds argue about', 'The secret ingredient in grandma’s soup',
  'A bad password hint', 'A weird thing to collect', 'What the GPS says when it gives up', 'The worst place to take a nap', 'A rejected name for a rollercoaster',
  'What a robot butler complains about', 'The least scary monster under the bed', 'A superhero whose power is very specific', 'Something you shouldn’t bring to a funeral', 'What the squirrel is plotting',
  'The worst thing to say on the first day at school', 'A new, terrible emoji', 'What cows do when nobody is looking', 'The worst place to hide during hide and seek', 'A very unhelpful instruction manual line',
  'What the wifi router dreams about', 'A rejected Disney movie title', 'The worst gift for a ten-year-old', 'What your phone secretly judges you for', 'A bad warning label for a banana',
];

const CSS = `
.qc-duel { display:grid; gap:12px; }
.qc-ans { display:block; width:100%; text-align:left; border:3px solid transparent; background:var(--surface); box-shadow:var(--e2); border-radius:26px; padding:20px 20px; font:700 clamp(18px, 4.6vw, 24px)/1.3 var(--font); cursor:pointer; transition:.15s; color:var(--on); }
.qc-ans:hover:not(:disabled) { border-color:var(--blue); }
.qc-ans.sel { border-color:var(--blue); background:var(--blue-c); }
.qc-ans.win { border-color:var(--yellow); background:var(--yellow-c); }
.qc-ans:disabled { cursor:default; }
.qc-meta { display:flex; align-items:center; gap:8px; margin-top:10px; font:600 14px var(--font); color:var(--on2); }
.qc-meta b { margin-left:auto; font:800 18px var(--font); color:var(--blue); }
.qc-vs { text-align:center; font:800 14px var(--font); color:var(--on3); letter-spacing:2px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const rounds = +api.opts.rounds || 2;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 0, tasks: [], answered: new Set(), duel: null, voted: false, scores: {}, ans: {}, done: new Set(), res: null };
  ids.forEach((i) => (S.scores[i] = 0));

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms);
    if (p.name === 'answer') { S.round = p.round; S.tasks = p.tasks || S.tasks; S.ans = {}; S.done = new Set(); }
    if (p.name === 'duel') { S.duel = p.duel; S.voted = false; S.res = null; }
    if (p.name === 'reveal') { S.res = p.res; S.scores = p.scores; api.sfx(p.res.flawless ? 'win' : 'good'); }
    render();
  });
  api.on('tasks', (t) => { S.tasks = t.tasks; render(); });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  function render() {
    const parts = [];
    if (S.phase === 'answer') {
      parts.push(h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Round ${S.round}/${rounds}`), ' · answer your prompts'), clock.el());
      if (!S.tasks.length) parts.push(h('div.kt-center', h('div.spinner')));
      S.tasks.forEach((t, i) => {
        parts.push(promptCard(t.prompt, { label: `Prompt ${i + 1} of ${S.tasks.length}`, color: i ? '#8e4de8' : '#e5399b' }));
        if (S.ans[t.pid] !== undefined) parts.push(h('div.kt-card', { style: 'text-align:center;font-weight:700' }, icon('check_circle'), ' “', S.ans[t.pid], '”'));
        else parts.push(answerBox({ placeholder: 'Your funniest answer…', max: 70, onSubmit: (txt) => { S.ans[t.pid] = txt; api.toHost('ans', { pid: t.pid, t: txt }); api.sfx('good'); render(); } }).el);
      });
      parts.push(waiting(api, ids.filter((i) => !S.done.has(i)), 'Still writing:'));
    } else if (S.phase === 'duel' && S.duel) {
      const d = S.duel;
      const mine = d.authors.includes(api.me);
      parts.push(clock.el(), promptCard(d.prompt, { label: 'Which answer is funnier?', color: '#1a73e8' }));
      parts.push(h('div.qc-duel', d.answers.map((a, i) => [i ? h('div.qc-vs', 'VS') : null, h('button.qc-ans' + (S.voted === i ? '.sel' : ''), { disabled: mine || S.voted !== false, onclick: () => { S.voted = i; api.toHost('vote', { i }); api.sfx('click'); render(); } }, a)]).flat()));
      parts.push(h('div.kt-hint', mine ? 'This is your duel — sit tight and wait for the votes!' : S.voted !== false ? 'Vote locked in!' : 'Tap the funnier answer.'));
    } else if (S.phase === 'reveal' && S.res) {
      const r = S.res;
      parts.push(promptCard(r.prompt, { label: r.flawless ? 'QUIPCLASH! Everyone agreed' : 'The votes are in', color: '#34a853' }));
      parts.push(h('div.qc-duel', r.entries.map((e) => h('div.qc-ans' + (e.win ? '.win' : ''), e.text, h('div.qc-meta', avatarEl(api.player(e.by) || {}, 'sm', { still: true }), nameOf(e.by), e.win ? h('span.chip.yellow', icon('emoji_events'), 'Winner') : null, h('b', `+${e.pts}`), h('span', `${e.votes} vote${e.votes === 1 ? '' : 's'}`))))));
      parts.push(scorePills(api, S.scores));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, subs: {}, duels: [], di: 0, votes: {}, timer: 0, phase: 'wait', scores: {}, deadline: 0, used: new Set(), assign: {} };
    ids.forEach((i) => (H.scores[i] = 0));
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    function startRound() {
      H.round++; H.subs = {};
      const prompts = sample(PROMPTS.filter((p) => !H.used.has(p)), N, rng);
      prompts.forEach((p) => H.used.add(p));
      // prompt k is answered by players k and k+1
      H.duels = prompts.map((prompt, k) => ({ pid: k, prompt, authors: [ids[k], ids[(k + 1) % N]] }));
      hostPhase(api, H, 'answer', 80000, toDuels, { round: H.round });
      ids.forEach((id, idx) => api.sendTo(id, 'tasks', { tasks: [H.duels[idx], H.duels[(idx - 1 + N) % N]].map((d) => ({ pid: d.pid, prompt: d.prompt })) }));
    }
    const doneMap = () => { const set = new Set(); ids.forEach((id, idx) => { const a = idx, b = (idx - 1 + N) % N; if (H.subs[`${a}:${id}`] !== undefined && H.subs[`${b}:${id}`] !== undefined) set.add(id); }); return set; };
    function toDuels() {
      clearTimeout(H.timer);
      H.di = 0;
      nextDuel();
    }
    function nextDuel() {
      if (H.di >= H.duels.length) return endRound();
      const d = H.duels[H.di];
      const answers = d.authors.map((a) => H.subs[`${d.pid}:${a}`] ?? '(no answer)');
      d.shown = d.authors.map((a, i) => ({ by: a, text: answers[i] }));
      // randomise on-screen order
      d.flip = rng.next() < 0.5;
      const order = d.flip ? [1, 0] : [0, 1];
      d.order = order;
      H.votes = {};
      hostPhase(api, H, 'duel', 22000, endDuel, { duel: { prompt: d.prompt, authors: d.authors, answers: order.map((o) => answers[o]) } });
    }
    function endDuel() {
      clearTimeout(H.timer);
      const d = H.duels[H.di];
      const tally = [0, 0];
      Object.values(H.votes).forEach((i) => { tally[d.order[i]]++; });
      const voters = alive().filter((i) => !d.authors.includes(i)).length;
      const flawless = voters >= 2 && (tally[0] === voters || tally[1] === voters);
      const max = Math.max(...tally);
      const entries = d.authors.map((a, i) => { const win = tally[i] === max && max > 0 && tally[0] !== tally[1]; const pts = tally[i] * 100 + (flawless && win ? 100 : 0); H.scores[a] += pts; return { by: a, text: d.shown[i].text, votes: tally[i], win, pts }; });
      api.broadcast('phase', { name: 'reveal', ms: 0, res: { prompt: d.prompt, entries, flawless }, scores: H.scores });
      H.phase = 'reveal';
      H.di++;
      H.timer = setTimeout(nextDuel, 6500);
    }
    function endRound() {
      if (H.round >= rounds) {
        const ranking = rankingFrom(api, H.scores);
        return api.endGame({ title: `${nameOf(ranking[0].id)} is the funniest!`, subtitle: 'Quip Clash champion', ranking, winners: [ranking[0].id] });
      }
      startRound();
    }
    api.on('ans', ({ pid, t }, from) => {
      if (H.phase !== 'answer') return;
      const d = H.duels[pid];
      if (!d || !d.authors.includes(from) || H.subs[`${pid}:${from}`] !== undefined) return;
      H.subs[`${pid}:${from}`] = String(t || '').slice(0, 70);
      api.broadcast('done', { ids: [...doneMap()] });
      if (alive().every((i) => doneMap().has(i))) { clearTimeout(H.timer); api.timeout(toDuels, 600); }
    });
    api.on('vote', ({ i }, from) => {
      if (H.phase !== 'duel' || H.votes[from] !== undefined) return;
      const d = H.duels[H.di];
      if (d.authors.includes(from) || !(i === 0 || i === 1)) return;
      H.votes[from] = i;
      if (alive().filter((p) => !d.authors.includes(p)).every((p) => H.votes[p] !== undefined)) api.timeout(endDuel, 500);
    });
    api.onRejoin((id) => api.sendTo(id, 'phase', { name: 'reveal', ms: 0, res: { prompt: '…', entries: [], flawless: false }, scores: H.scores }));
    api.timeout(startRound, 700);
  }
  render();
}
