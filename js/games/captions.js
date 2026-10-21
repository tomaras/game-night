// Caption Clash — caption the picture, then vote for the funniest caption (not your own!).
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, scorePills, waiting, hostPhase, rankingFrom, sample } from '../kit.js';

const TPL = [
  ['#ffd89b', '#ff9a8b', '😴☕'], ['#a1c4fd', '#c2e9fb', '🐶💻'], ['#fbc2eb', '#a6c1ee', '😱🍕'], ['#84fab0', '#8fd3f4', '🐸☂️'], ['#ffecd2', '#fcb69f', '🧓📱'],
  ['#f6d365', '#fda085', '🔥🏠🐕'], ['#a8edea', '#fed6e3', '🐱🥛'], ['#d299c2', '#fef9d7', '🕺🪩'], ['#89f7fe', '#66a6ff', '🐧🧊'], ['#fddb92', '#d1fdff', '🦖🎂'],
  ['#cfd9df', '#e2ebf0', '🤖❤️'], ['#fad0c4', '#ffd1ff', '🥶⛄'], ['#a3bded', '#6991c7', '🌧️🧑‍💻'], ['#ffeaa7', '#fab1a0', '🐔🏃'], ['#c1dfc4', '#deecdd', '🧘‍♂️🐍'],
  ['#e0c3fc', '#8ec5fc', '👻📺'], ['#f5f7fa', '#c3cfe2', '🧑‍🍳🔥'], ['#fdcbf1', '#e6dee9', '🦄💸'], ['#9be15d', '#00e3ae', '🚀🐹'], ['#ff9a9e', '#fecfef', '🙈📚'],
  ['#43e97b', '#38f9d7', '🏖️😬'], ['#fa709a', '#fee140', '🎤🐔'], ['#667eea', '#764ba2', '🌙🐺'], ['#ffd1ff', '#fad0c4', '🍔🧍'], ['#96fbc4', '#f9f586', '🧃🐻'],
  ['#c2e59c', '#64b3f4', '🏄‍♂️🦈'], ['#e6b980', '#eacda3', '🎻🐭'], ['#ffc3a0', '#ffafbd', '🐷✈️'], ['#8ec5fc', '#e0c3fc', '👽🌽'], ['#f093fb', '#f5576c', '💃🦀'],
  ['#4facfe', '#00f2fe', '🛁🦆'], ['#fccb90', '#d57eeb', '🦥🏁'], ['#a1ffce', '#faffd1', '🎈🌵'], ['#ffdde1', '#ee9ca7', '🫠🌡️'], ['#c9d6ff', '#e2e2e2', '👔🦁'], ['#fbab7e', '#f7ce68', '🏆🐢'],
];

const CSS = `
.cc-meme { position:relative; border-radius:24px; overflow:hidden; aspect-ratio:4/3; width:100%; display:grid; place-items:center; box-shadow:var(--e2); background:linear-gradient(145deg, var(--a), var(--b)); }
.cc-art { font-size:clamp(70px, 22vw, 130px); letter-spacing:-6px; line-height:1; filter:drop-shadow(0 6px 8px rgba(0,0,0,.2)); }
.cc-t { position:absolute; left:6px; right:6px; text-align:center; font:900 clamp(17px, 5.2vw, 30px)/1.05 'Impact','Anton','Outfit',sans-serif; color:#fff; text-transform:uppercase; -webkit-text-stroke:1.5px #000; paint-order:stroke fill; text-shadow:0 2px 0 #000; word-break:break-word; letter-spacing:.5px; }
.cc-t.top { top:8px; } .cc-t.bot { bottom:8px; }
.cc-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; }
.cc-card { display:flex; flex-direction:column; gap:8px; cursor:pointer; border-radius:28px; padding:6px; border:3px solid transparent; transition:.15s; background:var(--surface); box-shadow:var(--e1); }
.cc-card.sel { border-color:var(--blue); }
.cc-card.win { border-color:var(--yellow); box-shadow:0 0 0 4px rgba(251,188,4,.3), var(--e2); }
.cc-by { display:flex; gap:8px; align-items:center; padding:2px 8px 6px; font-weight:600; }
.cc-by b { margin-left:auto; font-weight:800; color:var(--blue); }
`;

export function meme(tpl, top, bottom) {
  const [a, b, art] = TPL[tpl % TPL.length];
  return h('div.cc-meme', { style: { '--a': a, '--b': b } }, h('div.cc-art.emo', art), h('div.cc-t.top', top || ''), h('div.cc-t.bot', bottom || ''));
}

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const rounds = +api.opts.rounds || 3;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt.wide');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 0, tpl: 0, memes: [], myVote: null, submitted: false, done: new Set(), scores: {}, result: null };
  ids.forEach((i) => (S.scores[i] = 0));
  let topIn, botIn, prev;

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms);
    if (p.name === 'write') { S.round = p.round; S.tpl = p.tpl; S.submitted = false; S.done = new Set(); S.myVote = null; topIn = botIn = null; }
    if (p.name === 'vote') { S.memes = p.memes; S.myVote = null; S.done = new Set(); }
    if (p.name === 'result') { S.result = p.result; S.scores = p.scores; api.sfx('good'); }
    render();
  });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  function render() {
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Round ${S.round}/${rounds}`), ' · ', S.phase === 'write' ? 'write a caption' : S.phase === 'vote' ? 'vote for the funniest' : S.phase === 'result' ? 'results' : '…')];
    if (S.phase === 'write') {
      parts.push(clock.el());
      const live = () => { prev && prev.replaceWith((prev = meme(S.tpl, topIn?.value, botIn?.value))); };
      prev = meme(S.tpl, topIn?.value, botIn?.value);
      parts.push(prev);
      if (S.submitted) parts.push(h('div.kt-hint', 'Caption sent!'), waiting(api, ids.filter((i) => !S.done.has(i))));
      else {
        topIn = topIn || h('input.txt', { placeholder: 'Top text', maxlength: 40, oninput: live, autocomplete: 'off' });
        botIn = botIn || h('input.txt', { placeholder: 'Bottom text', maxlength: 40, oninput: live, autocomplete: 'off' });
        parts.push(h('div.col', topIn, botIn, h('button.btn.primary.big.block', { onclick: () => { api.toHost('cap', { top: topIn.value.trim(), bottom: botIn.value.trim() }); S.submitted = true; render(); } }, icon('send'), 'Submit caption')));
      }
    } else if (S.phase === 'vote') {
      parts.push(clock.el(), h('div.kt-hint', S.myVote !== null ? 'Vote cast!' : 'Tap the funniest caption — you can’t vote for your own.'));
      parts.push(h('div.cc-grid', S.memes.map((m) => h('div.cc-card' + (S.myVote === m.i ? '.sel' : ''), { onclick: () => { if (m.mine) return api.toast('That one’s yours!'); S.myVote = m.i; api.toHost('vote', { i: m.i }); api.sfx('click'); render(); } }, meme(S.tpl, m.top, m.bottom), m.mine ? h('div.cc-by', h('span.chip', 'Your caption')) : null))));
      parts.push(waiting(api, ids.filter((i) => !S.done.has(i)), 'Waiting for votes from'));
    } else if (S.phase === 'result' && S.result) {
      parts.push(h('div.cc-grid', S.result.map((m) => h('div.cc-card' + (m.win ? '.win' : ''), meme(S.tpl, m.top, m.bottom), h('div.cc-by', avatarEl(api.player(m.by) || {}, 'sm', { still: true }), nameOf(m.by), m.win ? h('span.chip.yellow', icon('emoji_events'), 'Winner') : null, h('b', `${m.votes} vote${m.votes === 1 ? '' : 's'}`))))));
      parts.push(scorePills(api, S.scores));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, tpls: sample([...TPL.keys()], rounds, rng), subs: {}, votes: {}, timer: 0, phase: 'wait', scores: {}, deadline: 0 };
    ids.forEach((i) => (H.scores[i] = 0));
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    function write() {
      H.round++; H.subs = {}; H.votes = {};
      hostPhase(api, H, 'write', 60000, toVote, { round: H.round, tpl: H.tpls[H.round - 1] });
    }
    function toVote() {
      const authors = Object.keys(H.subs).filter((a) => H.subs[a].top || H.subs[a].bottom);
      if (authors.length < 2) { api.broadcast('phase', { name: 'result', ms: 0, result: authors.map((a) => ({ by: a, ...H.subs[a], votes: 0, win: false })), scores: H.scores }); H.timer = setTimeout(nextRound, 5000); H.phase = 'result'; return; }
      H.order = sample(authors, authors.length, rng);
      const base = H.order.map((a, i) => ({ i, top: H.subs[a].top, bottom: H.subs[a].bottom }));
      for (const id of ids) api.sendTo(id, 'phase', { name: 'vote', ms: 30000, memes: base.map((m) => ({ ...m, mine: H.order[m.i] === id })) });
      clearTimeout(H.timer); H.phase = 'vote'; H.deadline = performance.now() + 30000;
      H.timer = setTimeout(toResult, 30300);
    }
    function toResult() {
      clearTimeout(H.timer);
      const tally = H.order.map(() => 0);
      Object.values(H.votes).forEach((i) => { tally[i]++; });
      const max = Math.max(...tally);
      const res = H.order.map((a, i) => ({ by: a, top: H.subs[a].top, bottom: H.subs[a].bottom, votes: tally[i], win: tally[i] === max && max > 0 }));
      res.forEach((r) => { H.scores[r.by] += r.votes * 100 + (r.win ? 100 : 0); });
      api.broadcast('phase', { name: 'result', ms: 0, result: res, scores: H.scores });
      H.phase = 'result';
      H.timer = setTimeout(nextRound, 8000);
    }
    function nextRound() {
      if (H.round >= rounds) {
        const ranking = rankingFrom(api, H.scores);
        return api.endGame({ title: `${nameOf(ranking[0].id)} is the funniest!`, subtitle: 'Most laughs wins', ranking, winners: [ranking[0].id] });
      }
      write();
    }
    api.on('cap', ({ top, bottom }, from) => {
      if (H.phase !== 'write' || H.subs[from]) return;
      H.subs[from] = { top: String(top || '').slice(0, 40), bottom: String(bottom || '').slice(0, 40) };
      api.broadcast('done', { ids: Object.keys(H.subs) });
      if (alive().every((i) => H.subs[i])) { clearTimeout(H.timer); api.timeout(toVote, 500); }
    });
    api.on('vote', ({ i }, from) => {
      if (H.phase !== 'vote' || H.votes[from] !== undefined || H.order[i] === from || !(i >= 0 && i < H.order.length)) return;
      H.votes[from] = i;
      api.broadcast('done', { ids: Object.keys(H.votes) });
      if (alive().every((p) => H.votes[p] !== undefined)) api.timeout(toResult, 500);
    });
    api.onRejoin((id) => api.sendTo(id, 'phase', { name: H.phase === 'result' ? 'write' : H.phase, ms: 10000, round: H.round, tpl: H.tpls[H.round - 1], memes: [] }));
    api.timeout(write, 700);
  }
  render();
}
