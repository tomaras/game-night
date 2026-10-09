// Code Crackers — two teams, each with four secret numbered words. Each turn an encryptor gets a secret 3-digit
// code and gives three clues to guide teammates to it — while the other team tries to intercept the pattern.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { WORDS } from '../words.js';
import { makeClock, hostPhase, waiting, sample } from '../kit.js';

const TEAMS = [['Blue', '#1a73e8', '#d3e3fd'], ['Red', '#ea4335', '#fcdad6']];
const CSS = `
.cc2-words { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
.cc2-w { border-radius:18px; padding:10px 4px; text-align:center; background:var(--tc); color:var(--tf); font:800 clamp(13px, 3.6vw, 18px)/1.1 var(--font); display:flex; flex-direction:column; gap:4px; align-items:center; }
.cc2-w i { font:900 22px var(--font); font-style:normal; opacity:.55; }
.cc2-hist { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; }
.cc2-col { background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:6px 6px 8px; min-height:60px; }
.cc2-col b { display:block; text-align:center; font:800 13px var(--font); color:var(--on3); margin-bottom:4px; }
.cc2-col span { display:block; font:600 13px/1.3 var(--font); text-align:center; padding:1px 0; overflow-wrap:anywhere; }
.cc2-code { display:flex; gap:10px; justify-content:center; }
.cc2-code b { width:62px; height:74px; border-radius:20px; display:grid; place-items:center; font:900 40px var(--font); background:var(--tc); color:var(--tf); }
.cc2-in { display:flex; flex-direction:column; gap:8px; }
.cc2-in .r { display:flex; gap:8px; align-items:center; } .cc2-in .r b { width:38px; height:38px; border-radius:12px; background:var(--tc); color:var(--tf); display:grid; place-items:center; font:800 18px var(--font); flex:none; }
.cc2-guess { display:flex; gap:8px; justify-content:center; }
.cc2-guess button { width:58px; height:66px; border-radius:18px; border:0; background:var(--s2); font:900 28px var(--font); cursor:pointer; }
.cc2-guess button.on { background:var(--tc); color:var(--tf); }
.cc2-tok { display:flex; gap:6px; align-items:center; font:700 13px var(--font); }
.cc2-tok i { width:14px; height:14px; border-radius:50%; background:var(--s3); display:inline-block; } .cc2-tok i.w { background:#fff; box-shadow:inset 0 0 0 2px #444; } .cc2-tok i.b { background:#222; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const teamOf = (id) => ids.indexOf(id) % 2;
  const mates = (t) => ids.filter((i) => teamOf(i) === t);
  const clock = makeClock(api);
  const root = h('div.kt.wide');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', turn: 0, team: 0, enc: null, myCode: null, words: [], clues: null, hist: [[[], [], [], []], [[], [], [], []]], tok: [{ w: 0, b: 0 }, { w: 0, b: 0 }], sent: false, guessSent: false, guess: [], res: null, round: 1, done: new Set() };
  const myTeam = teamOf(api.me);
  const style = (t) => ({ '--tc': TEAMS[t][2], '--tf': TEAMS[t][1] });

  api.on('words', (w) => { S.words = w.words; render(); });
  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms);
    if (p.hist) S.hist = p.hist; if (p.tok) S.tok = p.tok;
    if (p.name === 'clue') { S.team = p.team; S.enc = p.enc; S.round = p.round; S.myCode = null; S.sent = false; S.guessSent = false; S.guess = []; S.clues = null; S.res = null; S.done = new Set(); }
    if (p.name === 'guess') { S.clues = p.clues; S.guessSent = false; S.guess = []; S.done = new Set(); }
    if (p.name === 'reveal') { S.res = p.res; api.sfx(p.res.ok ? 'good' : 'bad'); }
    render();
  });
  api.on('code', (c) => { S.myCode = c.code; render(); });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  const tokens = (t) => h('div.cc2-tok', h('span', TEAMS[t][0] + ' team'), ...Array.from({ length: 2 }, (_, i) => h('i' + (i < S.tok[t].w ? '.w' : ''))), h('span', { style: 'opacity:.6' }, '·'), ...Array.from({ length: 2 }, (_, i) => h('i' + (i < S.tok[t].b ? '.b' : ''))));

  function histView(t) {
    return h('div', h('div.kt-title', `${TEAMS[t][0]} team’s clue history${t === myTeam ? ' (your team)' : ' (spy on them!)'}`), h('div.cc2-hist', [0, 1, 2, 3].map((n) => h('div.cc2-col', { style: style(t) }, h('b', `#${n + 1}`), ...S.hist[t][n].map((c) => h('span', c))))));
  }

  function guessPad(label, onSend) {
    const sel = S.guess;
    return h('div.col', h('div.kt-hint', label), h('div.cc2-guess', { style: style(myTeam) }, [1, 2, 3, 4].map((n) => h('button' + (sel.includes(n) ? '.on' : ''), { onclick: () => { if (sel.includes(n)) S.guess = sel.filter((x) => x !== n); else if (sel.length < 3) S.guess = [...sel, n]; render(); } }, n))), h('div.cc2-code', { style: style(myTeam) }, [0, 1, 2].map((i) => h('b', { style: 'width:54px;height:60px;font-size:30px' }, sel[i] || '·'))), h('button.btn.primary.big.block', { disabled: sel.length < 3, onclick: () => { S.guessSent = true; api.toHost('guess', { g: S.guess }); api.sfx('good'); render(); } }, icon('check'), 'Submit code'));
  }

  function render() {
    const me = api.me;
    const t = S.team;
    const parts = [h('div.kt-card', { style: 'display:flex;flex-direction:column;gap:6px;padding:10px' }, h('div.row', { style: 'justify-content:space-between;flex-wrap:wrap' }, tokens(0), tokens(1)), h('div.kt-hint', { style: 'font-size:12px' }, 'White tokens = interceptions (2 wins) · Black tokens = miscommunications (2 loses)'))];
    // my team's words
    parts.push(h('div.kt-title', `Your secret words — ${TEAMS[myTeam][0]} team`), h('div.cc2-words', S.words.map((w, i) => h('div.cc2-w', { style: style(myTeam) }, h('i', i + 1), w))));
    if (S.phase === 'clue') {
      parts.push(clock.el(), h('div.kt-prompt', { style: { '--pc': TEAMS[t][1] } }, h('small', `${TEAMS[t][0]} team · round ${S.round}`), S.enc === me ? 'You are the encryptor — give three clues!' : `${nameOf(S.enc)} is writing clues for ${TEAMS[t][0]}…`));
      if (S.enc === me && S.myCode) {
        parts.push(h('div.kt-card', h('div.kt-hint', 'Your secret code — give a clue for each number'), h('div.cc2-code', { style: style(myTeam) }, S.myCode.map((n) => h('b', n)))));
        if (S.sent) parts.push(h('div.kt-hint', 'Clues sent!'));
        else {
          const ins = S.myCode.map(() => h('input.txt', { maxlength: 24, placeholder: 'clue…', autocomplete: 'off' }));
          parts.push(h('div.cc2-in', { style: style(myTeam) }, S.myCode.map((n, i) => h('div.r', h('b', n), ins[i]))), h('button.btn.primary.big.block', { onclick: () => { api.toHost('clues', { c: ins.map((x) => x.value.trim()) }); S.sent = true; render(); } }, icon('send'), 'Send clues'), h('div.kt-hint', 'No words from the list, no rhymes or spelling tricks!'));
        }
      }
    } else if (S.phase === 'guess') {
      parts.push(clock.el(), h('div.kt-prompt', { style: { '--pc': TEAMS[t][1] } }, h('small', `${TEAMS[t][0]} team’s clues`), h('div', S.clues.map((c, i) => h('div', `${i + 1}. ${c}`)))));
      const mine = teamOf(S.enc) === myTeam;
      const interceptNow = !mine && S.round > 1;
      if (S.enc === me) parts.push(h('div.kt-hint', 'Your team is decoding your clues…'));
      else if (mine || interceptNow) {
        if (S.guessSent) parts.push(h('div.kt-hint', 'Guess locked in'), waiting(api, ids.filter((i) => !S.done.has(i) && i !== S.enc), 'Waiting for'));
        else parts.push(guessPad(mine ? 'Decode the code (3 different numbers 1–4, in order):' : 'Intercept! Guess THEIR code from the clue history:', null));
      } else parts.push(h('div.kt-hint', 'No interception in round 1 — study the clues!'));
    } else if (S.phase === 'reveal' && S.res) {
      const r = S.res;
      parts.push(h('div.kt-card', h('div.kt-title', `The ${TEAMS[t][0]} code was`), h('div.cc2-code', { style: style(t) }, r.code.map((n) => h('b', n))), h('div.kt-hint', { style: 'margin-top:10px;font-weight:700;color:var(--on)' }, r.msg)));
    }
    parts.push(histView(0), histView(1));
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const pool = sample(WORDS, 8, rng);
    const W = [pool.slice(0, 4), pool.slice(4, 8)];
    const H = { turn: 0, round: 1, hist: [[[], [], [], []], [[], [], [], []]], tok: [{ w: 0, b: 0 }, { w: 0, b: 0 }], enc: [0, 0], code: null, clues: null, guesses: {}, timer: 0, phase: 'wait', deadline: 0, teamNow: 0 };
    const alive = (t) => mates(t).filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    ids.forEach((id) => api.sendTo(id, 'words', { words: W[teamOf(id)] }));
    const base = () => ({ hist: H.hist, tok: H.tok });
    function turn() {
      const t = H.teamNow;
      if (!alive(t).length || !alive(1 - t).length) return finish(1 - t, 'The other team left.');
      const team = mates(t);
      let enc = team[(H.enc[t]++) % team.length]; while (api.player(enc).left) enc = team[(H.enc[t]++) % team.length];
      H.encId = enc;
      H.code = rng.shuffle([1, 2, 3, 4]).slice(0, 3);
      api.sendTo(enc, 'code', { code: H.code });
      H.guesses = {};
      hostPhase(api, H, 'clue', 75000, () => { H.clues = H.code.map(() => '…'); toGuess(); }, { team: t, enc, round: H.round, ...base() });
      api.sendTo(enc, 'code', { code: H.code });
    }
    function toGuess() {
      clearTimeout(H.timer);
      hostPhase(api, H, 'guess', 70000, resolve, { team: H.teamNow, enc: H.encId, round: H.round, clues: H.clues, ...base() });
    }
    const plurality = (list) => { const c = new Map(); list.forEach((g) => c.set(g.join(''), (c.get(g.join('')) || 0) + 1)); const best = [...c.entries()].sort((a, b) => b[1] - a[1])[0]; return best ? best[0] : null; };
    function resolve() {
      clearTimeout(H.timer);
      const t = H.teamNow, opp = 1 - t;
      const codeStr = H.code.join('');
      const own = plurality(alive(t).filter((i) => i !== H.encId).map((i) => H.guesses[i]).filter(Boolean));
      const icpt = H.round > 1 ? plurality(alive(opp).map((i) => H.guesses[i]).filter(Boolean)) : null;
      const ownOk = own === codeStr, intercepted = icpt === codeStr;
      let msg = ownOk ? `${TEAMS[t][0]} decoded it!` : `${TEAMS[t][0]} miscommunicated — black token!`;
      if (!ownOk) H.tok[t].b++;
      if (intercepted) { H.tok[opp].w++; msg += ` ${TEAMS[opp][0]} intercepted — white token!`; }
      H.code.forEach((n, i) => H.hist[t][n - 1].push(H.clues[i]));
      api.broadcast('phase', { name: 'reveal', ms: 0, team: t, res: { code: H.code, ok: ownOk && !intercepted, msg }, ...base() });
      H.phase = 'reveal';
      H.timer = setTimeout(afterReveal, 7000);
    }
    function afterReveal() {
      for (const t of [0, 1]) { if (H.tok[t].w >= 2) return finish(t, `${TEAMS[t][0]} intercepted twice!`); if (H.tok[t].b >= 2) return finish(1 - t, `${TEAMS[t][0]} miscommunicated twice!`); }
      if (H.teamNow === 0) H.teamNow = 1; else { H.teamNow = 0; H.round++; }
      if (H.round > 8) { const sc = (t) => H.tok[t].w - H.tok[t].b; return finish(sc(0) >= sc(1) ? 0 : 1, 'After 8 rounds, the best token balance wins.'); }
      turn();
    }
    function finish(winT, why) {
      clearTimeout(H.timer);
      const order = [...mates(winT), ...mates(1 - winT)];
      api.endGame({ title: `${TEAMS[winT][0]} team wins!`, subtitle: why, ranking: order.map((id) => ({ id, score: teamOf(id) === winT ? 'win' : 'loss' })), winners: mates(winT) });
    }
    api.on('clues', ({ c }, from) => {
      if (H.phase !== 'clue' || from !== H.encId) return;
      H.clues = (Array.isArray(c) ? c : []).slice(0, 3).map((x) => String(x || '…').trim().slice(0, 24) || '…');
      toGuess();
    });
    api.on('guess', ({ g }, from) => {
      if (H.phase !== 'guess' || H.guesses[from] || from === H.encId) return;
      g = (Array.isArray(g) ? g : []).map(Number);
      if (g.length !== 3 || new Set(g).size !== 3 || g.some((n) => n < 1 || n > 4)) return;
      const t = H.teamNow;
      if (teamOf(from) !== t && H.round === 1) return;
      H.guesses[from] = g;
      api.broadcast('done', { ids: Object.keys(H.guesses) });
      const need = [...alive(t).filter((i) => i !== H.encId), ...(H.round > 1 ? alive(1 - t) : [])];
      if (need.every((i) => H.guesses[i])) { clearTimeout(H.timer); api.timeout(resolve, 600); }
    });
    api.onRejoin((id) => { api.sendTo(id, 'words', { words: W[teamOf(id)] }); if (H.phase === 'clue' && id === H.encId) api.sendTo(id, 'code', { code: H.code }); });
    api.timeout(turn, 900);
  }
  render();
}
