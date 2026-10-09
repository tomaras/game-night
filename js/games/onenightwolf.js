// One Night Wolf — a fast social-deduction game (One-Night-Ultimate-Werewolf style).
// One secret night where roles act and swap, one day of arguing, one vote. 3–10 players.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock } from '../kit.js';

const ROLES = {
  wolf: ['Werewolf', '🐺', '#c62828', 'Wolves', 'Wake up and see the other werewolves. A lone wolf may peek at one center card. You win if no werewolf dies.'],
  minion: ['Minion', '🦹', '#ad1457', 'Wolves', 'You see the werewolves (they don’t know you). You win with them — even if you die.'],
  mason: ['Mason', '🧱', '#5d4037', 'Village', 'You see the other Mason. Together you know you’re villagers.'],
  seer: ['Seer', '🔮', '#6a1b9a', 'Village', 'Look at one player’s card, or two of the center cards.'],
  robber: ['Robber', '🥷', '#37474f', 'Village', 'Swap cards with another player and look at your new card.'],
  troublemaker: ['Troublemaker', '🃏', '#ef6c00', 'Village', 'Swap two other players’ cards without looking.'],
  drunk: ['Drunk', '🍺', '#f9a825', 'Village', 'Swap your card with a center card — without looking!'],
  insomniac: ['Insomniac', '🌙', '#3949ab', 'Village', 'At the end of the night you look at your own card to see if it changed.'],
  hunter: ['Hunter', '🏹', '#2e7d32', 'Village', 'If you die, the player you voted for dies with you.'],
  villager: ['Villager', '🧑‍🌾', '#1e88e5', 'Village', 'No special power. Find the werewolves!'],
  tanner: ['Tanner', '👺', '#795548', 'Tanner', 'You hate your job. You only win if YOU are killed.'],
};
const BASE = ['wolf', 'wolf', 'seer', 'robber', 'troublemaker', 'villager', 'drunk', 'insomniac', 'hunter', 'mason', 'mason', 'minion', 'tanner', 'villager', 'villager'];

const CSS = `
.ow { gap:10px; background:transparent; }
.ow.night { background:radial-gradient(circle at 50% 0%, #283593, #0d1033 70%); color:#e8eaf6; border-radius:0; }
.ow.night .kt-card { background:rgba(255,255,255,.08); color:#e8eaf6; box-shadow:none; } .ow.night .kt-hint { color:#9fa8da; } .ow.night .kt-title { color:#9fa8da; }
.ow-role { border-radius:28px; padding:18px; text-align:center; color:#fff; background:linear-gradient(150deg, var(--rc), color-mix(in srgb, var(--rc) 55%, #000)); box-shadow:var(--e2); cursor:pointer; user-select:none; }
.ow-role .em { font-size:60px; line-height:1; display:block; } .ow-role b { font:800 24px var(--font); display:block; margin:4px 0; } .ow-role small { opacity:.9; font:500 14px/1.35 var(--font); display:block; }
.ow-role.cover { background:linear-gradient(150deg,#5c6bc0,#283593); } .ow-role.cover .em { font-size:44px; }
.ow-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(104px,1fr)); gap:8px; }
.ow-p { border:3px solid transparent; background:var(--surface); box-shadow:var(--e1); border-radius:20px; padding:10px 6px; display:flex; flex-direction:column; align-items:center; gap:4px; font:700 13px var(--font); color:var(--on); cursor:pointer; position:relative; }
.ow.night .ow-p { background:rgba(255,255,255,.1); color:#fff; box-shadow:none; } .ow-p.sel { border-color:var(--yellow); background:var(--yellow-c); color:var(--on); } .ow-p.dead { opacity:.5; } .ow-p .vc { position:absolute; top:-8px; right:-4px; background:var(--red); color:#fff; border-radius:12px; font:800 12px var(--font); padding:2px 8px; }
.ow-ctr { display:flex; gap:10px; justify-content:center; } .ow-cc { width:70px; height:96px; border-radius:14px; background:linear-gradient(145deg,#5c6bc0,#283593); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; font:800 12px var(--font); cursor:pointer; border:3px solid transparent; box-shadow:var(--e1); } .ow-cc.sel { border-color:var(--yellow); } .ow-cc .em { font-size:28px; }
.ow-info { background:var(--blue-c); color:var(--blue-d); border-radius:18px; padding:12px 14px; font:600 14px/1.45 var(--font); } .ow.night .ow-info { background:rgba(255,255,255,.12); color:#e8eaf6; }
.ow-res { display:flex; align-items:center; gap:8px; background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:8px 10px; font:700 13px var(--font); } .ow-res.win { background:var(--green-c); } .ow-res .r { margin-left:auto; text-align:right; } .ow-res .r small { display:block; color:var(--on2); font:600 11px var(--font); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const dayMin = +api.opts.day || 5;
  const totalRounds = +api.opts.rounds || 1;
  const root = h('div.kt.wide.ow');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, role: null, info: [], act: null, sel: [], mode: 'p', done: new Set(), ready: new Set(), voted: new Set(), myVote: null, res: null, show: true, scores: {}, set: [] };

  api.on('phase', (p) => { Object.assign(S, p); S.done = new Set(p.done || []); S.ready = new Set(p.ready || []); S.voted = new Set(p.voted || []); if (p.ms !== undefined) clock.set(p.ms); if (p.name === 'night' || p.name === 'day' || p.name === 'vote') { if (p.fresh) { S.sel = []; S.mode = 'p'; S.myVote = null; } } S.phase = p.name; if (p.sfx) api.sfx(p.sfx); render(); });
  api.on('role', (r) => { S.role = r.role; S.info = r.info || []; S.act = r.act || null; S.show = true; S.sel = []; api.sfx('pop'); render(); });
  api.on('info', (r) => { S.info = [...S.info, ...r.lines]; if (r.role) S.role = r.role; api.sfx('good'); render(); });
  api.onPlayersChanged(render);

  const sendAct = () => { api.toHost('night', { kind: S.act.kind === 'seer' ? S.mode : S.act.kind, sel: S.sel.slice() }); S.act = { ...S.act, sent: true }; render(); };
  function roleCard() {
    const r = S.role ? ROLES[S.role] : null;
    if (!r) return h('div');
    return h('div.ow-role' + (S.show ? '' : '.cover'), { style: `--rc:${r[2]}`, onclick: () => { S.show = !S.show; render(); } }, S.show ? [h('span.em.emo', r[1]), h('b', 'You are the ' + r[0]), h('small', r[4]), h('small', { style: 'margin-top:6px;opacity:.7' }, '(tap to hide)')] : [h('span.em', icon('visibility')), h('b', 'Tap to see your role')]);
  }
  const playerBtn = (id, pick, selected, extra) => h('button.ow-p' + (selected ? '.sel' : ''), { onclick: () => pick(id) }, avatarEl(api.player(id), 'lg', { still: true }), nameOf(id) + (id === api.me ? ' (you)' : ''), extra || null);

  function render() {
    const me = api.me;
    root.classList.toggle('night', S.phase === 'night');
    const infoCard = S.info.length ? h('div.ow-info', S.info.map((l) => h('div', l))) : null;
    const head = h('div.kt-row', { style: 'justify-content:center' }, S.rounds > 1 ? h('span.chip.blue', `Round ${S.round}/${totalRounds}`) : null, ['night', 'day', 'vote'].includes(S.phase) ? clock.el() : null);
    if (S.phase === 'night') {
      const a = S.act, parts = [head, roleCard()];
      parts.push(h('div.kt-hint', '🌙 Night falls. Everyone keeps their eyes closed…'));
      if (infoCard) parts.push(infoCard);
      if (a && !a.sent) {
        const act = a.kind;
        const pickP = (id) => { if (act === 'robber') S.sel = [id]; else if (act === 'troublemaker') { S.sel = S.sel.includes(id) ? S.sel.filter((x) => x !== id) : [...S.sel, id].slice(-2); } else if (act === 'seer' && S.mode === 'p') S.sel = [id]; render(); };
        const pickC = (i) => { if (act === 'seer') S.sel = S.sel.includes(i) ? S.sel.filter((x) => x !== i) : [...S.sel, i].slice(-2); else S.sel = [i]; render(); };
        const box = h('div.kt-card', h('div.kt-title', a.title));
        if (act === 'seer') box.append(h('div.kt-row', { style: 'justify-content:center' }, h('button.btn.small' + (S.mode === 'p' ? '.primary' : '.tonal'), { onclick: () => { S.mode = 'p'; S.sel = []; render(); } }, 'A player'), h('button.btn.small' + (S.mode === 'c' ? '.primary' : '.tonal'), { onclick: () => { S.mode = 'c'; S.sel = []; render(); } }, '2 center cards')));
        const wantsP = act === 'robber' || act === 'troublemaker' || (act === 'seer' && S.mode === 'p');
        if (wantsP) box.append(h('div.ow-grid', { style: 'margin-top:8px' }, ids.filter((id) => id !== me).map((id) => playerBtn(id, pickP, S.sel.includes(id)))));
        else box.append(h('div.ow-ctr', { style: 'margin-top:8px' }, [0, 1, 2].map((i) => h('div.ow-cc' + (S.sel.includes(i) ? '.sel' : ''), { onclick: () => pickC(i) }, h('span.em.emo', '🂠'), 'Center ' + (i + 1)))));
        const need = act === 'troublemaker' ? 2 : act === 'seer' && S.mode === 'c' ? 2 : 1;
        box.append(h('div.kt-row', { style: 'justify-content:center;margin-top:10px' }, h('button.btn.primary', { disabled: S.sel.length !== need, onclick: sendAct }, icon('check'), 'Confirm'), a.optional ? h('button.btn.ghost', { onclick: () => { S.sel = []; api.toHost('night', { kind: 'skip', sel: [] }); S.act = { ...a, sent: true }; render(); } }, 'Skip') : null));
        parts.push(box);
      } else if (a?.sent) parts.push(h('div.kt-hint', 'Action done. Waiting for the night to end…'));
      else parts.push(h('div.kt-hint', 'You sleep soundly… (waiting for the night to end)'));
      return root.replaceChildren(...parts);
    }
    if (S.phase === 'day') {
      const readyMe = S.ready.has(me);
      return root.replaceChildren(head, h('div.kt-prompt', { style: '--pc:#f9a825' }, h('small', 'The sun rises'), 'Discuss! Who is lying?'), roleCard(), infoCard || '',
        h('div.kt-card', h('div.kt-title', 'Players'), h('div.ow-grid', { style: 'margin-top:8px' }, ids.map((id) => h('div.ow-p', { style: 'cursor:default' }, avatarEl(api.player(id), 'lg', { still: true }), nameOf(id) + (id === me ? ' (you)' : ''), S.ready.has(id) ? h('span.chip.green', { style: 'height:20px;font-size:11px' }, 'ready') : null)))),
        h('button.btn.' + (readyMe ? 'tonal' : 'primary') + '.block', { onclick: () => { api.toHost('ready', {}); } }, icon('check'), readyMe ? 'Ready to vote ✓' : 'I’m ready to vote'),
        h('div.kt-hint', 'Use the chat or voice/video to argue it out. Voting starts when the timer ends or everyone is ready.'));
    }
    if (S.phase === 'vote') {
      return root.replaceChildren(head, h('div.kt-prompt', { style: '--pc:#c62828' }, h('small', 'Time to vote'), 'Who is a werewolf?'), roleCard(),
        h('div.ow-grid', ids.filter((id) => id !== me).map((id) => playerBtn(id, (x) => { S.myVote = x; api.toHost('vote', { id: x }); api.sfx('pop'); render(); }, S.myVote === id, S.voted.has(id) ? h('span.chip.green', { style: 'height:20px;font-size:11px' }, 'voted') : null))),
        h('div.kt-hint', S.myVote ? 'Vote locked — you can still change it until time runs out.' : 'Tap a player to vote for them.'));
    }
    if (S.phase === 'result' && S.res) {
      const r = S.res;
      const teams = { Village: '🏘️ The village wins!', Wolves: '🐺 The werewolves win!', Tanner: '👺 The Tanner wins!' };
      return root.replaceChildren(h('div.kt-prompt', { style: `--pc:${r.winTeams.includes('Wolves') ? '#c62828' : r.winTeams.includes('Tanner') ? '#795548' : '#2e7d32'}` }, h('small', 'Results'), r.winTeams.map((t) => teams[t]).join(' ') || 'Nobody wins…'),
        h('div.kt-hint', r.note),
        ...ids.map((id) => { const o = ROLES[r.orig[id]], f = ROLES[r.fin[id]]; return h('div.ow-res' + (r.winners.includes(id) ? '.win' : ''), avatarEl(api.player(id), 'sm', { still: true }), h('div', nameOf(id) + (id === me ? ' (you)' : ''), r.dead.includes(id) ? ' ☠️' : ''), h('div.r', `${o[1]} ${o[0]}${r.orig[id] !== r.fin[id] ? ` → ${f[1]} ${f[0]}` : ''}`, h('small', `${r.votes[id] || 0} vote${(r.votes[id] || 0) === 1 ? '' : 's'}${r.votedFor[id] ? ` · voted ${nameOf(r.votedFor[id])}` : ''}`))); }),
        h('div.kt-card', h('div.kt-title', 'Center cards'), h('div.ow-ctr', r.center.map((c) => h('div.ow-cc', { style: `background:${ROLES[c][2]}` }, h('span.em.emo', ROLES[c][1]), ROLES[c][0])))),
        h('div.kt-hint', S.round < totalRounds ? 'Next round starting soon…' : 'Final scores coming up…'));
    }
    root.replaceChildren(head, h('div.kt-hint', 'Dealing the cards…'));
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, orig: {}, cards: {}, center: [], phase: 'wait', timer: 0, acts: {}, lines: {}, ready: new Set(), votes: {}, scores: {}, minNight: 0, set: [] };
    ids.forEach((id) => (H.scores[id] = 0));
    api.cleanup(() => clearTimeout(H.timer));
    const pub = (name, extra = {}) => { H.phase = name; api.broadcast('phase', { name, round: H.round, rounds: totalRounds, done: Object.keys(H.acts), ready: [...H.ready], voted: Object.keys(H.votes), ...extra }); };
    const actors = () => ids.filter((id) => ['seer', 'robber', 'troublemaker', 'drunk'].includes(H.orig[id]) || (H.orig[id] === 'wolf' && lonewolf()));
    const lonewolf = () => ids.filter((id) => H.orig[id] === 'wolf').length === 1;
    function newRound() {
      H.round++;
      const set = rng.shuffle(BASE.slice(0, N + 3));
      ids.forEach((id, i) => { H.orig[id] = set[i]; H.cards[id] = set[i]; });
      H.center = set.slice(N, N + 3);
      H.acts = {}; H.ready = new Set(); H.votes = {}; H.lines = {};
      const wolves = ids.filter((id) => H.orig[id] === 'wolf');
      ids.forEach((id) => {
        const r = H.orig[id], info = [];
        if (r === 'wolf') info.push(wolves.length > 1 ? `🐺 The werewolves are: ${wolves.map(nameOf).join(' & ')}.` : '🐺 You are the lone werewolf.');
        if (r === 'minion') info.push(wolves.length ? `🦹 The werewolves are: ${wolves.map(nameOf).join(', ')}.` : '🦹 There are no werewolves among the players!');
        if (r === 'mason') { const m = ids.filter((x) => H.orig[x] === 'mason' && x !== id); info.push(m.length ? `🧱 The other Mason is ${m.map(nameOf).join(' & ')}.` : '🧱 You are the only Mason.'); }
        let act = null;
        if (r === 'seer') act = { kind: 'seer', title: 'Seer: look at one player’s card, or two center cards' };
        if (r === 'robber') act = { kind: 'robber', title: 'Robber: choose a player to swap cards with' };
        if (r === 'troublemaker') act = { kind: 'troublemaker', title: 'Troublemaker: choose two players to swap' };
        if (r === 'drunk') act = { kind: 'drunk', title: 'Drunk: choose a center card to swap with' };
        if (r === 'wolf' && wolves.length === 1) act = { kind: 'wolf', title: 'Lone wolf: peek at one center card?', optional: true };
        api.sendTo(id, 'role', { role: r, info, act });
      });
      H.minNight = performance.now() + 9000 + rng.int(3000);
      pub('night', { ms: 45000, fresh: true });
      clearTimeout(H.timer);
      H.timer = setTimeout(resolveNight, 45500);
    }
    api.on('night', (m, from) => {
      if (H.phase !== 'night' || H.acts[from] || !actors().includes(from)) return;
      H.acts[from] = m;
      if (actors().every((id) => H.acts[id])) { clearTimeout(H.timer); H.timer = setTimeout(resolveNight, Math.max(500, H.minNight - performance.now())); }
    });
    function resolveNight() {
      if (H.phase !== 'night') return;
      clearTimeout(H.timer);
      const say = (id, ...lines) => api.sendTo(id, 'info', { lines });
      const nm = (r) => `${ROLES[r][1]} ${ROLES[r][0]}`;
      const find = (r) => ids.filter((id) => H.orig[id] === r);
      const A = (id) => H.acts[id] || {};
      const okP = (x) => ids.includes(x);
      // lone wolf
      for (const id of find('wolf')) if (lonewolf() && A(id).kind === 'wolf' && A(id).sel?.length === 1) say(id, `🐺 Center card ${A(id).sel[0] + 1} is the ${nm(H.center[A(id).sel[0]])}.`);
      // seer
      for (const id of find('seer')) { const a = A(id); if (a.kind === 'p' && okP(a.sel?.[0])) say(id, `🔮 ${nameOf(a.sel[0])} is the ${nm(H.cards[a.sel[0]])}.`); else if (a.kind === 'c' && a.sel?.length === 2) say(id, `🔮 Center ${a.sel[0] + 1} is the ${nm(H.center[a.sel[0]])}, center ${a.sel[1] + 1} is the ${nm(H.center[a.sel[1]])}.`); }
      // robber
      for (const id of find('robber')) { const a = A(id); const t = a.sel?.[0]; if (okP(t) && t !== id) { [H.cards[id], H.cards[t]] = [H.cards[t], H.cards[id]]; say(id, `🥷 You robbed ${nameOf(t)} and are now the ${nm(H.cards[id])}.`); } }
      // troublemaker
      for (const id of find('troublemaker')) { const a = A(id); const [x, y] = a.sel || []; if (okP(x) && okP(y) && x !== y && x !== id && y !== id) { [H.cards[x], H.cards[y]] = [H.cards[y], H.cards[x]]; say(id, `🃏 You swapped ${nameOf(x)} and ${nameOf(y)}.`); } }
      // drunk
      for (const id of find('drunk')) { const a = A(id); const c = a.sel?.[0]; if (c >= 0 && c < 3) { [H.cards[id], H.center[c]] = [H.center[c], H.cards[id]]; say(id, `🍺 You swapped with center card ${c + 1}. You have no idea what you are now!`); } }
      // insomniac
      for (const id of find('insomniac')) say(id, `🌙 Your card at the end of the night: the ${nm(H.cards[id])}.`);
      H.ready = new Set();
      pub('day', { ms: dayMin * 60000, sfx: 'good' });
      H.timer = setTimeout(startVote, dayMin * 60000 + 500);
    }
    api.on('ready', (_, from) => {
      if (H.phase !== 'day' || H.ready.has(from)) return;
      H.ready.add(from);
      pub('day', { ms: undefined });
      if (ids.filter((i) => !api.player(i).left).every((i) => H.ready.has(i))) { clearTimeout(H.timer); H.timer = setTimeout(startVote, 1200); }
    });
    function startVote() {
      clearTimeout(H.timer);
      if (H.phase !== 'day') return;
      H.votes = {};
      pub('vote', { ms: 45000, fresh: true });
      H.timer = setTimeout(reveal, 45500);
    }
    api.on('vote', ({ id }, from) => {
      if (H.phase !== 'vote' || !ids.includes(id) || id === from) return;
      H.votes[from] = id;
      if (ids.filter((i) => !api.player(i).left).every((i) => H.votes[i])) { clearTimeout(H.timer); H.timer = setTimeout(reveal, 1200); } else pub('vote', { ms: undefined });
    });
    function reveal() {
      clearTimeout(H.timer);
      if (H.phase !== 'vote') return;
      const tally = {};
      Object.values(H.votes).forEach((t) => (tally[t] = (tally[t] || 0) + 1));
      const max = Math.max(0, ...Object.values(tally));
      let dead = max > 1 ? ids.filter((id) => tally[id] === max) : [];
      // Hunter takes his vote with him
      const extra = dead.filter((id) => H.cards[id] === 'hunter' && H.votes[id]).map((id) => H.votes[id]);
      dead = [...new Set([...dead, ...extra])];
      const wolves = ids.filter((id) => H.cards[id] === 'wolf');
      const wolfDead = wolves.some((id) => dead.includes(id));
      const tannerDead = ids.some((id) => H.cards[id] === 'tanner' && dead.includes(id));
      const winTeams = [];
      let note = dead.length ? `${dead.map(nameOf).join(' & ')} ${dead.length > 1 ? 'were' : 'was'} killed.` : 'Nobody was killed.';
      if (tannerDead) winTeams.push('Tanner');
      if (wolves.length) { if (wolfDead) winTeams.push('Village'); else if (!tannerDead) winTeams.push('Wolves'); }
      else { if (!dead.length) winTeams.push('Village'); else if (!tannerDead && ids.some((id) => H.cards[id] === 'minion' && !dead.includes(id)) && dead.some((d) => H.cards[d] !== 'minion')) winTeams.push('Wolves'); }
      const team = (r) => (r === 'wolf' || r === 'minion' ? 'Wolves' : r === 'tanner' ? 'Tanner' : 'Village');
      const winners = ids.filter((id) => winTeams.includes(team(H.cards[id])) && !(H.cards[id] === 'minion' && wolves.length && wolfDead));
      winners.forEach((id) => H.scores[id]++);
      H.lastTitle = winTeams.map((t) => ({ Village: 'The village wins!', Wolves: 'The werewolves win!', Tanner: 'The Tanner wins!' })[t]).join(' ');
      const fin = {}; ids.forEach((id) => (fin[id] = H.cards[id]));
      H.phase = 'result';
      pub('result', { res: { orig: { ...H.orig }, fin, center: H.center.slice(), votes: tally, votedFor: { ...H.votes }, dead, winTeams, winners, note }, sfx: winners.length ? 'win' : 'lose' });
      H.timer = setTimeout(() => { if (H.round >= totalRounds) finish(); else newRound(); }, 12000);
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: H.scores[id] === 1 ? 'win' : 'wins' }));
      const top = ranking[0].score;
      api.endGame({ title: totalRounds === 1 ? H.lastTitle || 'Nobody wins…' : `${ranking.filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} won the most rounds!`, subtitle: totalRounds === 1 ? '' : `${top} round win${top === 1 ? '' : 's'}`, ranking, winners: top > 0 ? ranking.filter((r) => r.score === top).map((r) => r.id) : [] });
    }
    api.onRejoin((id) => { pub(H.phase === 'wait' ? 'night' : H.phase, { ms: undefined }); if (H.orig[id]) api.sendTo(id, 'role', { role: H.orig[id], info: [], act: null }); });
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 3) { clearTimeout(H.timer); finish(); } });
    api.timeout(newRound, 800);
  }
  render();
}
