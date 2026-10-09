// Unique Clues — a co-op word game. Everyone but the guesser writes a one-word clue for a secret word;
// identical clues cancel each other out. The guesser sees what's left and tries to name the word.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { WORDS } from '../words.js';
import { makeClock, hostPhase, waiting, answerBox, promptCard, sample } from '../kit.js';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const stem = (s) => norm(s).replace(/(ies|es|s|ing|ed)$/, '');

const CSS = `
.uc-clues { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; }
.uc-clue { background:var(--surface); box-shadow:var(--e1); border-radius:20px; padding:12px 18px; font:800 clamp(18px, 5vw, 26px) var(--font); display:flex; flex-direction:column; align-items:center; gap:4px; animation:ktpop .3s both; }
.uc-clue small { font:600 11px var(--font); color:var(--on3); }
.uc-clue.dead { background:var(--red-c); color:var(--red-d); text-decoration:line-through; box-shadow:none; opacity:.8; }
.uc-clue.dead small { text-decoration:none; }
.uc-clue button { margin-top:4px; border:0; background:var(--s2); border-radius:999px; padding:4px 10px; font:700 11px var(--font); color:var(--on2); cursor:pointer; }
.uc-clue button.on { background:var(--red-c); color:var(--red-d); }
.uc-score { display:flex; justify-content:center; gap:4px; flex-wrap:wrap; }
.uc-score i { width:18px; height:26px; border-radius:5px; background:var(--s3); display:block; }
.uc-score i.ok { background:var(--green); } .uc-score i.bad { background:var(--red); } .uc-score i.skip { background:var(--yellow); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const cards = +api.opts.cards || 8;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', guesser: null, word: null, clues: [], sent: false, done: new Set(), n: 0, log: [], res: null, myFlags: new Set(), guessed: false };

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms);
    if (p.name === 'clue') { S.guesser = p.guesser; S.word = p.word; S.n = p.n; S.sent = false; S.done = new Set(); S.clues = []; S.res = null; S.myFlags = new Set(); S.guessed = false; S.log = p.log || S.log; }
    if (p.name === 'review') { S.clues = p.clues; S.myFlags = new Set(); }
    if (p.name === 'guess') { S.clues = p.clues; S.guessed = false; }
    if (p.name === 'result') { S.res = p.res; S.log = p.log; api.sfx(p.res.ok ? 'win' : p.res.pass ? 'tick' : 'bad'); }
    render();
  });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  function render() {
    const me = api.me;
    const isG = S.guesser === me;
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Card ${Math.min(S.n, cards)}/${cards}`), ' · guesser: ', h('b', nameOf(S.guesser))), h('div.uc-score', Array.from({ length: cards }, (_, i) => h('i' + (S.log[i] === 'ok' ? '.ok' : S.log[i] === 'bad' ? '.bad' : S.log[i] === 'skip' ? '.skip' : ''))))];
    if (S.phase === 'clue') {
      parts.push(clock.el());
      if (isG) parts.push(h('div.kt-center', h('div', [h('div.spinner'), h('div.kt-hint', 'Your friends are writing clues.\nLook away if you’re near their screens!'), waiting(api, ids.filter((i) => i !== me && !S.done.has(i)), 'Still writing:')])));
      else {
        parts.push(promptCard(S.word, { label: 'The secret word is', color: '#34a853' }));
        if (S.sent) parts.push(h('div.kt-hint', 'Clue sent!'), waiting(api, ids.filter((i) => i !== S.guesser && !S.done.has(i)), 'Still writing:'));
        else parts.push(h('div.kt-hint', 'Write ONE word that helps. If someone writes the same word, both clues vanish!'), answerBox({ placeholder: 'One-word clue', max: 20, button: 'Send', onSubmit: (t) => { S.sent = true; api.toHost('clue', { t }); api.sfx('good'); render(); } }).el);
      }
    } else if (S.phase === 'review') {
      parts.push(clock.el());
      parts.push(promptCard(isG ? '???' : S.word, { label: isG ? 'Guesser — look away for a moment' : 'Check the clues', color: '#8e4de8' }));
      if (!isG) {
        parts.push(h('div.uc-clues', S.clues.map((c, i) => h('div.uc-clue' + (c.dead ? '.dead' : ''), c.text, h('small', c.dead ? c.why : 'by ' + nameOf(c.by)), !c.dead && c.by !== me ? h('button' + (S.myFlags.has(i) ? '.on' : ''), { onclick: () => { api.toHost('flag', { i }); S.myFlags.has(i) ? S.myFlags.delete(i) : S.myFlags.add(i); render(); } }, S.myFlags.has(i) ? 'Flagged' : 'Flag as illegal') : null))));
        parts.push(h('div.kt-hint', 'Flag clues that contain the word, are made up, or are spelled the same in another language.'));
      } else parts.push(h('div.kt-center', h('div.spinner')));
    } else if (S.phase === 'guess') {
      parts.push(clock.el());
      const live = S.clues.filter((c) => !c.dead);
      parts.push(h('div.uc-clues', live.length ? live.map((c) => h('div.uc-clue', c.text)) : [h('div.kt-hint', 'Every clue cancelled out! You’re on your own…')]));
      if (isG) {
        if (S.guessed) parts.push(h('div.kt-hint', 'Guess sent…'));
        else parts.push(answerBox({ placeholder: 'Your guess…', max: 30, button: 'Guess', onSubmit: (t) => { S.guessed = true; api.toHost('guess', { t }); render(); } }).el, h('button.btn.outline.block', { onclick: () => { S.guessed = true; api.toHost('guess', { t: '' }); render(); } }, 'Pass (skip this card)'));
      } else parts.push(promptCard(S.word, { label: 'The word (shh!)', color: '#34a853' }), h('div.kt-hint', `${nameOf(S.guesser)} is guessing…`));
    } else if (S.phase === 'result' && S.res) {
      const r = S.res;
      parts.push(promptCard(r.word, { label: r.ok ? 'Correct! 🎉' : r.pass ? 'Passed' : `${nameOf(S.guesser)} guessed “${r.guess}”`, color: r.ok ? '#34a853' : r.pass ? '#f57c00' : '#ea4335' }));
      parts.push(h('div.uc-clues', S.clues.map((c) => h('div.uc-clue' + (c.dead ? '.dead' : ''), c.text, h('small', c.by ? nameOf(c.by) : '')))));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { n: 0, words: sample(WORDS, cards + 6, rng), subs: {}, clues: [], timer: 0, phase: 'wait', deadline: 0, log: [], flags: {}, wi: 0 };
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    const guesser = () => ids[(H.n - 1) % N];
    function card() {
      H.n++;
      if (H.n > cards) return finish();
      H.subs = {}; H.flags = {};
      if (api.player(guesser()).left) { H.log.push('skip'); return card(); }
      const word = H.words[H.wi++];
      H.word = word;
      for (const id of ids) api.sendTo(id, 'phase', { name: 'clue', ms: 40000, guesser: guesser(), word: id === guesser() ? '???' : word, n: H.n, log: H.log });
      H.phase = 'clue'; H.deadline = performance.now() + 40000; clearTimeout(H.timer);
      H.timer = setTimeout(review, 40300);
    }
    function review() {
      clearTimeout(H.timer);
      const entries = Object.entries(H.subs).map(([by, text]) => ({ by, text, k: stem(text) }));
      const count = {};
      entries.forEach((e) => { count[e.k] = (count[e.k] || 0) + 1; });
      const w = norm(H.word), ws = stem(H.word);
      H.clues = entries.map((e) => {
        const bad = !e.k || e.k === ws || norm(e.text).includes(w) || w.includes(norm(e.text)) && norm(e.text).length > 2;
        const dupe = count[e.k] > 1;
        return { by: e.by, text: e.text, dead: bad || dupe, why: bad ? 'illegal clue' : dupe ? 'duplicate' : '' };
      });
      H.clues.sort(() => rng.next() - 0.5);
      for (const id of ids) api.sendTo(id, 'phase', { name: 'review', ms: 18000, clues: id === guesser() ? [] : H.clues });
      H.phase = 'review'; H.deadline = performance.now() + 18000;
      H.timer = setTimeout(toGuess, 18300);
    }
    function toGuess() {
      clearTimeout(H.timer);
      const others = alive().filter((i) => i !== guesser()).length;
      H.clues.forEach((c, i) => { const f = H.flags[i]?.size || 0; if (!c.dead && f >= Math.max(1, Math.ceil(others / 2)) && others > 1) { c.dead = true; c.why = 'flagged'; } });
      hostPhase(api, H, 'guess', 40000, () => result('', false), { clues: H.clues.filter((c) => !c.dead).map((c) => ({ text: c.text, dead: false })) });
      for (const id of ids) if (id !== guesser()) api.sendTo(id, 'phase', { name: 'guess', ms: 40000, clues: H.clues.filter((c) => !c.dead).map((c) => ({ text: c.text, by: c.by })) });
    }
    function result(guess, pass) {
      clearTimeout(H.timer);
      const ok = !pass && guess && (norm(guess) === norm(H.word) || stem(guess) === stem(H.word));
      H.log.push(ok ? 'ok' : pass ? 'skip' : 'bad');
      api.broadcast('phase', { name: 'result', ms: 0, res: { ok: !!ok, word: H.word, guess, pass }, log: H.log });
      H.phase = 'result';
      H.timer = setTimeout(card, 6500);
    }
    function finish() {
      const score = H.log.filter((x) => x === 'ok').length;
      const msg = score >= cards ? 'Perfect! Are you cheating?' : score >= cards * 0.75 ? 'Awesome — great minds think alike!' : score >= cards * 0.5 ? 'Solid teamwork!' : score >= cards * 0.25 ? 'Not bad — you’ll get there!' : 'Hmm… maybe write clearer clues?';
      api.endGame({ title: `${score} out of ${cards}!`, subtitle: msg, ranking: ids.map((id) => ({ id, score, note: 'team score' })), winners: ids });
    }
    api.on('clue', ({ t }, from) => {
      if (H.phase !== 'clue' || from === guesser() || H.subs[from]) return;
      t = String(t || '').trim().split(/\s+/)[0]?.slice(0, 20);
      if (!t) return;
      H.subs[from] = t;
      api.broadcast('done', { ids: Object.keys(H.subs) });
      if (alive().filter((i) => i !== guesser()).every((i) => H.subs[i])) { clearTimeout(H.timer); api.timeout(review, 600); }
    });
    api.on('flag', ({ i }, from) => { if (H.phase !== 'review') return; const set = (H.flags[i] = H.flags[i] || new Set()); if (set.has(from)) set.delete(from); else set.add(from); });
    api.on('guess', ({ t }, from) => { if (H.phase === 'guess' && from === guesser()) result(String(t || '').slice(0, 30), !String(t || '').trim()); });
    api.timeout(card, 800);
  }
  render();
}
