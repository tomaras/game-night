// Imposter — a social-deduction word game for 3–10 players. Everyone but the imposter knows a secret word.
// Give one-word clues, discuss, vote out the imposter — who still gets a chance to guess the word.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const CATS = {
  '🍕 Food': ['pizza', 'sushi', 'burger', 'taco', 'pasta', 'salad', 'pancake', 'ice cream', 'sandwich', 'curry', 'dumpling', 'popcorn', 'chocolate', 'cheese', 'noodles', 'omelette'],
  '🐾 Animals': ['elephant', 'penguin', 'dolphin', 'giraffe', 'octopus', 'kangaroo', 'panda', 'eagle', 'tiger', 'turtle', 'monkey', 'flamingo', 'hedgehog', 'shark', 'camel', 'owl'],
  '🏙️ Places': ['library', 'airport', 'beach', 'hospital', 'museum', 'circus', 'castle', 'cinema', 'farm', 'bakery', 'zoo', 'stadium', 'lighthouse', 'casino', 'submarine', 'volcano'],
  '🎬 Movies & TV': ['superhero', 'pirate', 'zombie', 'detective', 'wizard', 'robot', 'dragon', 'cowboy', 'vampire', 'astronaut', 'mermaid', 'ninja', 'alien', 'spy', 'princess', 'monster'],
  '🧰 Objects': ['umbrella', 'toothbrush', 'backpack', 'scissors', 'telescope', 'guitar', 'candle', 'ladder', 'mirror', 'compass', 'hammer', 'bicycle', 'camera', 'clock', 'lantern', 'balloon'],
  '⚽ Sports': ['soccer', 'tennis', 'basketball', 'swimming', 'skiing', 'boxing', 'surfing', 'archery', 'golf', 'cricket', 'bowling', 'gymnastics', 'hockey', 'rowing', 'skateboarding', 'baseball'],
  '👔 Jobs': ['chef', 'pilot', 'doctor', 'farmer', 'firefighter', 'teacher', 'astronaut', 'mechanic', 'dentist', 'artist', 'plumber', 'singer', 'lawyer', 'barber', 'detective', 'magician'],
  '🌍 Nature': ['volcano', 'waterfall', 'desert', 'glacier', 'rainbow', 'thunder', 'forest', 'island', 'canyon', 'jungle', 'swamp', 'meadow', 'cave', 'tornado', 'coral reef', 'sunrise'],
  '🎵 Music': ['piano', 'drums', 'violin', 'trumpet', 'karaoke', 'concert', 'orchestra', 'headphones', 'microphone', 'harmonica', 'choir', 'guitar solo', 'dj', 'lullaby', 'opera', 'ukulele'],
  '🚗 Transport': ['helicopter', 'submarine', 'tractor', 'rollercoaster', 'taxi', 'scooter', 'ferry', 'rocket', 'sled', 'train', 'hot air balloon', 'cable car', 'motorbike', 'canoe', 'ambulance', 'gondola'],
};

const CSS = `
.im { flex:1; display:flex; flex-direction:column; gap:12px; padding:12px; min-height:0; overflow-y:auto; max-width:820px; width:100%; margin:0 auto; }
.im-card { color:#fff; background:linear-gradient(145deg,#6a4ce0,#3b2aa8); box-shadow:var(--e2); border-radius:28px; padding:16px; text-align:center; cursor:pointer; user-select:none; }
.im-card .lbl { color:rgba(255,255,255,.8); font-weight:800; text-transform:uppercase; font-size:12px; letter-spacing:1px; }
.im-card .big { font-size:clamp(26px,6vw,40px); font-weight:900; margin:4px 0; }
.im-card.imp { background:linear-gradient(145deg,#ea4335,#a3201a); }
.im-status { text-align:center; font-weight:800; font-size:18px; }
.im-timer { height:6px; background:linear-gradient(90deg,var(--blue),var(--pink)); border-radius:3px; transition:width .25s linear; }
.im-clues { display:flex; flex-direction:column; gap:6px; }
.im-clue { display:flex; align-items:center; gap:10px; background:var(--panel); box-shadow:var(--e1); border-radius:18px; padding:8px 14px; }
.im-clue.turn { box-shadow:0 0 0 2px var(--yellow); }
.im-clue .nm { font-weight:800; width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; }
.im-clue .tx { font-size:18px; font-weight:800; }
.im-clue .pt { margin-left:auto; font-weight:800; color:#b06a00; }
.im-vote { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:8px; }
.im-vote button { display:flex; align-items:center; gap:8px; background:var(--panel); box-shadow:var(--e1); border:2px solid transparent; border-radius:18px; padding:8px 10px; cursor:pointer; color:var(--text); font-weight:800; }
.im-vote button:hover:not(:disabled) { border-color:var(--red); }
.im-vote button.on { border-color:var(--red); background:var(--red-c); }
.im-vote button:disabled { opacity:.5; cursor:default; }
.im-vote .ct { margin-left:auto; background:#e63946; border-radius:999px; padding:0 8px; font-size:12px; }
.im-row { display:flex; gap:8px; }
.im-row input { flex:1; font-size:18px; }
.im-reveal { background:var(--panel); box-shadow:var(--e1); border-radius:26px; padding:14px; display:flex; flex-direction:column; gap:8px; align-items:center; text-align:center; }
.im-score { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.im-score span { background:var(--bg2); border-radius:999px; padding:3px 12px; font-weight:800; font-size:13px; display:flex; align-items:center; gap:6px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const rounds = +api.opts.rounds || 3;
  const nImp = api.opts.imposters === '2' && ids.length >= 7 ? 2 : 1;
  const clueRounds = +api.opts.clues || 1;
  const catHint = api.opts.hint !== 'off';
  const nameOf = (id) => api.player(id)?.name || '?';

  // ============================================================ HOST
  let st = null;
  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, phase: 'wait', word: '', cat: '', imps: [], clues: [], turn: 0, order: [], ready: new Set(), votes: {}, scores: {}, deadline: 0, timer: 0, caught: null, guess: null, out: null, over: false, impOrder: rng.shuffle(ids), turnsLeft: 0 };
    ids.forEach((id) => (H.scores[id] = 0));
    const live = () => ids.filter((id) => !api.player(id).left);
    const cats = rng.shuffle(Object.keys(CATS));
    const setPhase = (phase, ms, next) => {
      clearTimeout(H.timer);
      H.phase = phase;
      H.deadline = performance.now() + (ms || 0);
      publish();
      if (ms && next) H.timer = setTimeout(next, ms + 200);
    };
    const publish = (to) => {
      for (const id of to ? [to] : ids) {
        if (api.player(id).left) continue;
        const isImp = H.imps.includes(id);
        api.sendTo(id, 'state', {
          phase: H.phase, round: H.round, rounds, clues: H.clues, turn: H.order[H.turn] ?? null, ms: Math.max(0, H.deadline - performance.now()),
          ready: [...H.ready], voted: Object.keys(H.votes), myVote: H.votes[id] || null, scores: H.scores, ids,
          role: H.phase === 'wait' ? null : { imp: isImp, word: isImp ? null : H.word, cat: isImp && !catHint ? '???' : H.cat },
          reveal: H.phase === 'reveal' ? H.out : H.phase === 'guess' ? { caught: H.caught } : null,
          tally: H.phase === 'reveal' ? tally() : null,
          nImp,
        });
      }
    };
    const tally = () => { const t = {}; Object.values(H.votes).forEach((v) => (t[v] = (t[v] || 0) + 1)); return t; };

    function newRound() {
      H.round++;
      H.cat = cats[(H.round - 1) % cats.length];
      H.word = rng.pick(CATS[H.cat]);
      H.imps = [];
      for (let k = 0; k < nImp; k++) {
        let c; let guard = 0;
        do { c = H.impOrder[((H.round - 1) * nImp + k + guard) % H.impOrder.length]; guard++; } while ((api.player(c).left || H.imps.includes(c)) && guard < 30);
        H.imps.push(c);
      }
      H.clues = []; H.votes = {}; H.ready = new Set(); H.out = null; H.caught = null;
      H.order = rng.shuffle(live());
      H.turn = 0; H.turnsLeft = H.order.length * clueRounds;
      setPhase('intro', 7000, startClues);
    }
    function startClues() { H.turn = 0; nextClue(true); }
    function nextClue(first) {
      if (!first) { H.turn = (H.turn + 1) % H.order.length; H.turnsLeft--; }
      if (H.turnsLeft <= 0 && !first) return startDiscuss();
      while (api.player(H.order[H.turn])?.left && H.turnsLeft > 0) { H.turn = (H.turn + 1) % H.order.length; H.turnsLeft--; }
      setPhase('clue', 30000, () => { H.clues.push({ id: H.order[H.turn], text: '—', skipped: true }); nextClue(); });
    }
    function startDiscuss() { H.ready = new Set(); setPhase('discuss', 80000, startVote); }
    function startVote() { H.votes = {}; setPhase('vote', 45000, resolveVote); }
    function resolveVote() {
      const t = tally();
      let max = 0, top = [];
      for (const [id, c] of Object.entries(t)) { if (c > max) { max = c; top = [id]; } else if (c === max) top.push(id); }
      const accused = top.length === 1 ? top[0] : null; // a tie means nobody is accused
      if (accused && H.imps.includes(accused)) { H.caught = accused; setPhase('guess', 25000, () => finishRound('wrong-guess')); }
      else finishRound('escaped', accused);
    }
    // outcome: 'escaped' (not caught) | 'right-guess' | 'wrong-guess'
    function finishRound(outcome, accused) {
      clearTimeout(H.timer);
      const impsWin = outcome !== 'wrong-guess';
      const gain = {};
      ids.forEach((id) => (gain[id] = 0));
      if (impsWin) H.imps.forEach((i) => (gain[i] += 3));
      else ids.filter((i) => !H.imps.includes(i)).forEach((i) => { gain[i] += 1 + (H.imps.includes(H.votes[i]) ? 1 : 0); });
      ids.forEach((id) => (H.scores[id] += gain[id]));
      H.out = { imps: H.imps, word: H.word, impsWin, caught: H.caught || accused || null, guess: H.guess, gain };
      H.guess = null;
      setPhase('reveal', 9000, () => { if (H.round >= rounds) finish(); else newRound(); });
    }
    function finish() {
      H.over = true;
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: 'points' }));
      api.endGame({ title: `${nameOf(ranking[0].id)} wins!`, subtitle: `${rounds} rounds`, ranking, winners: [ranking[0].id] });
    }

    api.on('clue', ({ t }, from) => {
      if (H.phase !== 'clue' || from !== H.order[H.turn]) return;
      t = String(t || '').trim().replace(/\s+/g, ' ').slice(0, 24);
      if (!t) return;
      if (t.toLowerCase() === H.word.toLowerCase() && !H.imps.includes(from)) return api.sendTo(from, 'err', 'You can’t say the secret word itself!');
      H.clues.push({ id: from, text: t });
      nextClue();
    });
    api.on('ready', (_, from) => { if (H.phase !== 'discuss') return; H.ready.add(from); if (live().every((i) => H.ready.has(i))) startVote(); else publish(); });
    api.on('vote', ({ id }, from) => {
      if (H.phase !== 'vote' || !ids.includes(id) || id === from || api.player(from).left) return;
      H.votes[from] = id;
      if (live().every((i) => H.votes[i])) { resolveVote(); } else publish();
    });
    api.on('guess', ({ t }, from) => {
      if (H.phase !== 'guess' || !H.imps.includes(from)) return;
      H.guess = String(t || '').trim().slice(0, 30);
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      finishRound(norm(H.guess) === norm(H.word) ? 'right-guess' : 'wrong-guess');
    });
    api.onRejoin((id) => publish(id));
    api.onLeave(() => { if (H.over) return; if (live().length < 3) { H.over = true; clearTimeout(H.timer); const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: 'points' })); api.endGame({ title: 'Not enough players left', ranking, winners: [ranking[0].id] }); } else if (H.phase === 'clue' && api.player(H.order[H.turn])?.left) { H.clues.push({ id: H.order[H.turn], text: '—', skipped: true }); nextClue(); } });
    api.cleanup(() => clearTimeout(H.timer));
    api.timeout(newRound, 600);
  }

  // ============================================================ CLIENT
  let peek = false, deadline = 0, total = 1;
  const root = h('div.im');
  api.root.append(h('style', CSS), root);
  const input = h('input.txt', { maxlength: 24, placeholder: 'One-word clue…', autocomplete: 'off', enterkeyhint: 'send' });
  const guessIn = h('input.txt', { maxlength: 30, placeholder: 'What was the word?', autocomplete: 'off' });
  api.on('state', (s) => {
    const prev = st;
    st = s;
    deadline = performance.now() + s.ms; total = Math.max(1, s.ms);
    if (!prev || prev.phase !== s.phase) { api.sfx(s.phase === 'reveal' ? (s.reveal && s.reveal.impsWin === (s.role && s.role.imp) ? 'win' : 'good') : 'turn'); if (s.phase === 'intro') peek = false; input.value = ''; guessIn.value = ''; }
    render();
    if (s.phase === 'clue' && s.turn === api.me) setTimeout(() => input.focus(), 50);
  });
  api.on('err', (t) => { api.toast(t); api.sfx('bad'); });
  api.onPlayersChanged(() => st && render());
  api.interval(() => { const t = root.querySelector('.im-timer'); if (t && st) t.style.width = Math.max(0, Math.min(100, ((deadline - performance.now()) / total) * 100)) + '%'; }, 250);

  function card() {
    const r = st.role;
    if (!r) return null;
    return h('div.im-card' + (r.imp ? '.imp' : ''), { onclick: () => { peek = !peek; render(); } }, [
      h('div.lbl', r.imp ? '🕵️ You are the IMPOSTER' : 'Your secret word'),
      peek || st.phase === 'intro' ? (r.imp ? h('div.big', 'Blend in!') : h('div.big', r.word.toUpperCase())) : h('div.big', '••••••'),
      h('div.muted', { style: 'font-size:13px' }, r.imp ? `Category: ${r.cat} — figure out the word from the clues` : `Category: ${r.cat}`),
      st.phase !== 'intro' ? h('div.muted', { style: 'font-size:11px;margin-top:4px' }, peek ? 'tap to hide' : 'tap to peek') : null,
    ]);
  }
  function scoreRow() { return h('div.im-score', st.ids.map((id) => h('span', avatarEl(api.player(id), 'xs', { still: true }), `${nameOf(id)}: ${st.scores[id]}`))); }

  function render() {
    if (!st) return;
    const me = api.me;
    const parts = [];
    parts.push(h('div.muted.center', { style: 'font-size:13px;font-weight:800' }, `Round ${st.round} of ${st.rounds}`));
    parts.push(card());
    if (['clue', 'discuss', 'vote', 'guess'].includes(st.phase) || st.phase === 'intro') parts.push(h('div.im-timer'));
    switch (st.phase) {
      case 'intro':
        parts.push(h('div.im-status', st.role.imp ? 'You don’t know the word — listen carefully and bluff!' : 'Remember your word. One of you doesn’t have it…'));
        break;
      case 'clue':
        parts.push(h('div.im-status', st.turn === me ? '✍️ Your turn — give a one-word clue' : `${nameOf(st.turn)} is thinking of a clue…`));
        if (st.turn === me) parts.push(h('form.im-row', { onsubmit: (e) => { e.preventDefault(); api.toHost('clue', { t: input.value }); input.value = ''; } }, input, h('button.btn.primary', { type: 'submit' }, 'Send')));
        break;
      case 'discuss':
        parts.push(h('div.im-status', '💬 Discuss! Who is faking it?'));
        parts.push(h('button.btn.primary', { disabled: st.ready.includes(me), onclick: () => api.toHost('ready') }, st.ready.includes(me) ? `Waiting… (${st.ready.length}/${st.ids.length} ready)` : icon('check'), 'Ready to vote'));
        break;
      case 'vote':
        parts.push(h('div.im-status', st.myVote ? 'Vote cast — waiting for the others…' : '🗳️ Vote for the imposter!'));
        parts.push(h('div.im-vote', st.ids.filter((id) => id !== me).map((id) => h('button' + (st.myVote === id ? '.on' : ''), { disabled: !!st.myVote, onclick: () => { api.toHost('vote', { id }); api.sfx('click'); } }, avatarEl(api.player(id), 'sm', { still: true }), nameOf(id)))));
        break;
      case 'guess':
        parts.push(h('div.im-status', `${nameOf(st.reveal.caught)} was caught!`));
        if (st.reveal.caught === me) parts.push(h('div.muted.center', 'Guess the secret word to steal the win!'), h('form.im-row', { onsubmit: (e) => { e.preventDefault(); api.toHost('guess', { t: guessIn.value }); } }, guessIn, h('button.btn.primary', { type: 'submit' }, 'Guess')));
        else parts.push(h('div.muted.center', 'The imposter gets one chance to guess the word…'));
        break;
      case 'reveal': {
        const o = st.reveal;
        parts.push(h('div.im-reveal', [
          h('div', { style: 'font-size:34px' }, o.impsWin ? '🕵️' : '🎉'),
          h('b', { style: 'font-size:20px' }, o.impsWin ? 'The imposter wins this round!' : 'The crew wins this round!'),
          h('div', `The imposter${o.imps.length > 1 ? 's were' : ' was'} ${o.imps.map(nameOf).join(' & ')}. The word was `, h('b', o.word.toUpperCase()), '.'),
          o.guess ? h('div.muted', `Imposter guessed “${o.guess}”`) : null,
          !o.caught ? h('div.muted', 'Nobody was caught by the vote.') : !o.imps.includes(o.caught) ? h('div.muted', `${nameOf(o.caught)} was wrongly accused!`) : null,
          h('div.muted', { style: 'font-size:13px' }, 'Votes: ' + (Object.entries(st.tally || {}).map(([id, c]) => `${nameOf(id)} ${c}`).join(', ') || 'none')),
          h('div.im-score', st.ids.filter((id) => o.gain[id]).map((id) => h('span', avatarEl(api.player(id), 'xs', { still: true }), `${nameOf(id)} +${o.gain[id]}`))),
        ]));
        break;
      }
      default: break;
    }
    // clues
    const clueEls = st.clues.map((c) => h('div.im-clue', avatarEl(api.player(c.id), 'sm', { still: true }), h('div.nm', nameOf(c.id)), h('div.tx', { style: c.skipped ? 'color:var(--muted)' : '' }, c.text)));
    if (st.phase === 'clue' && st.turn) clueEls.push(h('div.im-clue.turn', avatarEl(api.player(st.turn), 'sm'), h('div.nm', nameOf(st.turn)), h('div.tx.muted', '…')));
    if (clueEls.length) parts.push(h('div.im-clues', clueEls));
    parts.push(scoreRow());
    root.replaceChildren(...parts);
  }
}
