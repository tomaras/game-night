// Who's the Spy? — everyone knows the secret location except the spy. Ask each other questions to spot the spy
// without giving the location away. The spy tries to work out where you all are.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, scorePills, hostPhase, rankingFrom, sample, waiting } from '../kit.js';

const PLACES = [
  ['Airplane', '✈️'], ['Bank', '🏦'], ['Beach', '🏖️'], ['Casino', '🎰'], ['Circus', '🎪'], ['Cruise ship', '🚢'], ['Hospital', '🏥'], ['Hotel', '🏨'], ['Library', '📚'], ['Movie studio', '🎬'],
  ['Museum', '🏛️'], ['Pirate ship', '🏴‍☠️'], ['Polar station', '🧊'], ['Restaurant', '🍽️'], ['School', '🏫'], ['Space station', '🛰️'], ['Supermarket', '🛒'], ['Theatre', '🎭'], ['Train', '🚆'], ['University', '🎓'],
  ['Zoo', '🦁'], ['Amusement park', '🎢'], ['Bakery', '🥐'], ['Camping site', '⛺'], ['Farm', '🚜'], ['Gym', '🏋️'], ['Police station', '🚓'], ['Spa', '🧖'], ['Stadium', '🏟️'], ['Wedding', '💒'],
];

const CSS = `
.sp-place { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:8px; }
.sp-place button { border:0; background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:10px 8px; font:600 13px var(--font); display:flex; flex-direction:column; align-items:center; gap:2px; cursor:pointer; color:var(--on); }
.sp-place button .e { font-size:24px; } .sp-place button.out { opacity:.35; text-decoration:line-through; }
.sp-place.pick button:hover { background:var(--blue-c); }
.sp-card { border-radius:28px; padding:20px; text-align:center; color:#fff; background:linear-gradient(145deg, #1a73e8, #0b3f8f); box-shadow:var(--e2); }
.sp-card.spy { background:linear-gradient(145deg, #ea4335, #8c1d18); }
.sp-card .big { font:800 32px var(--font); margin:4px 0; } .sp-card .em { font-size:54px; line-height:1; }
.sp-turn { display:flex; align-items:center; gap:10px; justify-content:center; flex-wrap:wrap; background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:12px; font:600 16px var(--font); }
.sp-pl { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.sp-pl button { border:0; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:8px 14px 8px 8px; display:flex; align-items:center; gap:8px; font:600 14px var(--font); cursor:pointer; color:var(--on); }
.sp-pl button:disabled { opacity:.5; cursor:default; } .sp-pl button.on { background:var(--blue-c); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const rounds = +api.opts.rounds || 3;
  const roundMs = (+api.opts.time || 6) * 60000;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', role: null, place: null, asker: null, target: null, round: 0, scores: {}, vote: null, voted: false, res: null, accusedBy: new Set(), myAccused: false, done: new Set(), outPlaces: new Set(), final: false };
  ids.forEach((i) => (S.scores[i] = 0));

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms); if (p.scores) S.scores = p.scores;
    if (p.name === 'ask') { if (p.role) { S.role = p.role; S.place = p.place; S.round = p.round; S.outPlaces = new Set(); } S.asker = p.asker; S.target = p.target; S.lastAsker = p.lastAsker; S.vote = null; S.myAccused = (p.used || []).includes(api.me); }
    if (p.name === 'vote') { S.vote = p; S.voted = false; S.done = new Set(); }
    if (p.name === 'guess') { S.vote = p; }
    if (p.name === 'result') { S.res = p.res; api.sfx(p.res.crewWon === (S.role !== 'spy') ? 'win' : 'lose'); }
    render();
  });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  const playerBtns = (filter, onPick) => h('div.sp-pl', api.players.filter(filter).map((p) => h('button', { onclick: () => onPick(p.id) }, avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: true }), p.name)));

  function render() {
    const me = api.me;
    const spy = S.role === 'spy';
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Round ${S.round}/${rounds}`))];
    const roleCard = () => (S.role ? h('div.sp-card' + (spy ? '.spy' : ''), spy ? [h('div.em.emo', '🕵️'), h('div.big', 'You are the SPY'), h('div', { style: 'opacity:.9' }, 'Work out the location from the questions. Blend in!')] : [h('div.em.emo', PLACES.find((p) => p[0] === S.place)?.[1] || '📍'), h('div.big', S.place), h('div', { style: 'opacity:.9' }, 'Find the spy — without naming the place too clearly.')]) : null);
    if (S.phase === 'ask') {
      parts.push(clock.el(), roleCard());
      parts.push(h('div.sp-turn', avatarEl(api.player(S.asker) || {}, 'sm'), h('b', nameOf(S.asker)), ' asks ', S.target ? [avatarEl(api.player(S.target) || {}, 'sm'), h('b', nameOf(S.target))] : 'someone…'));
      if (S.asker === me && !S.target) parts.push(h('div.kt-hint', 'Ask any player a question (out loud or in chat). Pick who you asked:'), playerBtns((p) => p.id !== me && !p.left && p.id !== S.lastAsker, (id) => api.toHost('target', { id })));
      else if (S.target === me) parts.push(h('div.kt-hint', 'Answer the question — then ask someone else!'), h('button.btn.primary', { onclick: () => api.toHost('answered') }, icon('check'), 'I answered — my turn to ask'));
      else parts.push(h('div.kt-hint', S.target ? `${nameOf(S.target)} is answering…` : `${nameOf(S.asker)} is thinking of a question…`));
      parts.push(h('div.row.wrap', { style: 'justify-content:center' }, !S.myAccused ? h('button.btn.bad', { onclick: () => { const f = playerBtns((p) => p.id !== me && !p.left, (id) => { api.toHost('accuse', { id }); dlg.remove(); }); const dlg = h('div.scrim.center', { onclick: (e) => { if (e.target === dlg) dlg.remove(); } }, h('div.dialog', h('h3', 'Who do you accuse?'), f, h('div.actions', h('button.btn.ghost', { onclick: () => dlg.remove() }, 'Cancel')))); document.body.append(dlg); } }, icon('gavel'), 'Accuse someone') : h('span.chip', 'You already accused'), spy ? h('button.btn.primary', { onclick: () => api.toHost('revealspy') }, icon('visibility'), 'I know the location!') : null));
      if (!spy) parts.push(h('div.kt-title', 'Possible locations (tap to cross off)'), h('div.sp-place', PLACES.map((p) => h('button' + (S.outPlaces.has(p[0]) ? '.out' : ''), { onclick: () => { S.outPlaces.has(p[0]) ? S.outPlaces.delete(p[0]) : S.outPlaces.add(p[0]); render(); } }, h('span.e.emo', p[1]), p[0]))));
    } else if (S.phase === 'vote' && S.vote) {
      const v = S.vote;
      parts.push(clock.el());
      if (v.kind === 'accuse') {
        parts.push(h('div.kt-prompt', { style: '--pc:#ea4335' }, h('small', `${nameOf(v.by)} accuses`), nameOf(v.target)));
        if (v.target === me) parts.push(h('div.kt-hint', 'Everyone is voting on whether you’re the spy…'));
        else if (S.voted) parts.push(h('div.kt-hint', 'Vote cast'), waiting(api, ids.filter((i) => i !== v.target && !S.done.has(i))));
        else parts.push(h('div.row', { style: 'justify-content:center' }, h('button.btn.bad.big', { onclick: () => { S.voted = true; api.toHost('vote', { yes: true }); render(); } }, 'Guilty'), h('button.btn.good.big', { onclick: () => { S.voted = true; api.toHost('vote', { yes: false }); render(); } }, 'Innocent')), h('div.kt-hint', 'All others must agree for the accusation to stick.'));
      } else {
        parts.push(h('div.kt-prompt', { style: '--pc:#1a73e8' }, h('small', 'Time is up!'), 'Who is the spy?'));
        if (S.voted) parts.push(h('div.kt-hint', 'Vote cast'), waiting(api, ids.filter((i) => !S.done.has(i))));
        else parts.push(playerBtns((p) => p.id !== me && !p.left, (id) => { S.voted = true; api.toHost('vote', { id }); render(); }));
      }
    } else if (S.phase === 'guess') {
      parts.push(clock.el());
      if (spy) parts.push(h('div.kt-prompt', { style: '--pc:#ea4335' }, 'Where are we?'), h('div.sp-place.pick', PLACES.map((p) => h('button', { onclick: () => api.toHost('guessplace', { p: p[0] }) }, h('span.e.emo', p[1]), p[0]))));
      else parts.push(h('div.kt-prompt', { style: '--pc:#ea4335' }, h('small', 'The spy was caught!'), `${nameOf(S.vote?.spy)} gets one guess at the location…`));
    } else if (S.phase === 'result' && S.res) {
      const r = S.res;
      parts.push(h('div.sp-card' + (r.crewWon ? '' : '.spy'), h('div.em.emo', r.crewWon ? '🎉' : '🕵️'), h('div.big', r.crewWon ? 'The crew wins!' : 'The spy wins!'), h('div', { style: 'opacity:.95' }, r.why)), h('div.kt-card', { style: 'text-align:center' }, `The spy was `, h('b', nameOf(r.spy)), ` · the place was `, h('b', r.place + ' ' + (PLACES.find((p) => p[0] === r.place)?.[1] || ''))), scorePills(api, S.scores));
    }
    root.replaceChildren(...parts.filter(Boolean));
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, places: sample(PLACES.map((p) => p[0]), rounds, rng), spy: null, place: '', asker: null, target: null, last: null, timer: 0, phase: 'wait', deadline: 0, scores: {}, used: new Set(), votes: {}, acc: null };
    ids.forEach((i) => (H.scores[i] = 0));
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    function start1() {
      H.round++; H.used = new Set();
      H.spy = ids[Math.floor(rng.next() * N)];
      while (api.player(H.spy).left) H.spy = ids[Math.floor(rng.next() * N)];
      H.place = H.places[H.round - 1];
      H.asker = alive()[Math.floor(rng.next() * alive().length)]; H.target = null; H.last = null;
      ids.forEach((id) => api.sendTo(id, 'phase', { name: 'ask', ms: roundMs, role: id === H.spy ? 'spy' : 'crew', place: id === H.spy ? null : H.place, round: H.round, asker: H.asker, target: null, used: [], scores: H.scores }));
      H.phase = 'ask'; H.deadline = performance.now() + roundMs; clearTimeout(H.timer); H.timer = setTimeout(finalVote, roundMs + 300);
    }
    const turnInfo = () => ({ asker: H.asker, target: H.target, used: [...H.used], lastAsker: H.last });
    function pubAsk() { api.broadcast('phase', { name: 'ask', ms: Math.max(0, H.deadline - performance.now()), ...turnInfo(), scores: H.scores }); }
    function finalVote() {
      clearTimeout(H.timer); H.votes = {}; H.acc = { kind: 'final' };
      hostPhase(api, H, 'vote', 40000, tallyFinal, { kind: 'final' });
    }
    function tallyFinal() {
      clearTimeout(H.timer);
      const c = {}; Object.values(H.votes).forEach((v) => { c[v] = (c[v] || 0) + 1; });
      const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
      const caught = top.length && (top.length === 1 || top[0][1] > top[1][1]) && top[0][0] === H.spy;
      if (caught) return spyGuess(); // caught spies still get a guess
      end(false, top.length ? `${nameOf(top[0][0])} was wrongly accused — the spy slipped away!` : 'Nobody was caught in time!');
    }
    function spyGuess() { H.phase = 'guess'; hostPhase(api, H, 'guess', 25000, () => end(true, 'The spy was caught and guessed wrong!'), { spy: H.spy }); }
    function end(crewWon, why) {
      clearTimeout(H.timer);
      if (crewWon) alive().forEach((i) => { if (i !== H.spy) H.scores[i] += 1; }); else H.scores[H.spy] += 2;
      hostPhase(api, H, 'result', 9000, next, { res: { crewWon, why, spy: H.spy, place: H.place }, scores: H.scores });
    }
    function next() { if (H.round >= rounds) { const ranking = rankingFrom(api, H.scores); return api.endGame({ title: `${nameOf(ranking[0].id)} is the master of disguise!`, ranking, winners: [ranking[0].id] }); } start1(); }
    api.on('target', ({ id }, from) => { if (H.phase === 'ask' && from === H.asker && !H.target && id !== from && ids.includes(id) && !api.player(id).left) { H.target = id; pubAsk(); } });
    api.on('answered', (_, from) => { if (H.phase === 'ask' && from === H.target) { H.last = H.asker; H.asker = from; H.target = null; pubAsk(); } });
    api.on('accuse', ({ id }, from) => {
      if (H.phase !== 'ask' || H.used.has(from) || id === from || !ids.includes(id)) return;
      H.used.add(from); H.votes = {}; H.acc = { kind: 'accuse', by: from, target: id };
      const remain = Math.max(0, H.deadline - performance.now());
      H.remain = remain; clearTimeout(H.timer);
      hostPhase(api, H, 'vote', 25000, () => tallyAccuse(), { kind: 'accuse', by: from, target: id });
    });
    function tallyAccuse() {
      clearTimeout(H.timer);
      const voters = alive().filter((i) => i !== H.acc.target);
      const yes = voters.filter((i) => H.votes[i] === true).length;
      if (voters.length && yes === voters.length) { if (H.acc.target === H.spy) return spyGuess(); return end(false, `${nameOf(H.acc.target)} was innocent! The spy wins.`); }
      // back to the questions
      H.deadline = performance.now() + Math.max(15000, H.remain || 60000);
      clearTimeout(H.timer); H.timer = setTimeout(finalVote, Math.max(15000, H.remain || 60000) + 300);
      H.phase = 'ask'; pubAsk();
    }
    api.on('vote', (v, from) => {
      if (H.phase !== 'vote') return;
      if (H.acc.kind === 'accuse') {
        if (from === H.acc.target || H.votes[from] !== undefined) return;
        H.votes[from] = !!v.yes; api.broadcast('done', { ids: Object.keys(H.votes) });
        if (alive().filter((i) => i !== H.acc.target).every((i) => H.votes[i] !== undefined)) { clearTimeout(H.timer); api.timeout(tallyAccuse, 500); }
      } else {
        if (H.votes[from] !== undefined || v.id === from || !ids.includes(v.id)) return;
        H.votes[from] = v.id; api.broadcast('done', { ids: Object.keys(H.votes) });
        if (alive().every((i) => H.votes[i] !== undefined)) { clearTimeout(H.timer); api.timeout(tallyFinal, 500); }
      }
    });
    api.on('revealspy', (_, from) => { if (H.phase === 'ask' && from === H.spy) spyGuess(); });
    api.on('guessplace', ({ p }, from) => { if (H.phase === 'guess' && from === H.spy) { const right = p === H.place; end(!right, right ? 'The spy guessed the location!' : `The spy guessed “${p}” — wrong!`); } });
    api.onRejoin(() => {});
    api.timeout(start1, 800);
  }
  render();
}
