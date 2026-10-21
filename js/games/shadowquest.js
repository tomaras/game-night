// Shadow Quest — a hidden-role quest game. Heroes try to complete three quests; secret Shadows sabotage them.
// Merlin knows the Shadows, but if the heroes win the Assassin gets one shot at finding Merlin.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, waiting, shuffled } from '../kit.js';

const SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
const EVIL = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
const ROLE = { merlin: ['Merlin', '🧙', 'You know who the Shadows are. Guide the heroes — quietly!'], hero: ['Loyal Hero', '🛡️', 'Help three quests succeed.'], assassin: ['Assassin', '🗡️', 'You’re a Shadow. If the heroes win, name Merlin to steal the victory.'], shadow: ['Shadow', '🌑', 'Sabotage quests — without getting caught.'] };

const CSS = `
.sq-role { border-radius:26px; padding:14px 16px; display:flex; gap:14px; align-items:center; cursor:pointer; color:#fff; background:linear-gradient(145deg, #1a73e8, #0b3f8f); box-shadow:var(--e2); user-select:none; }
.sq-role.evil { background:linear-gradient(145deg, #5e35b1, #1a0a3a); }
.sq-role .em { font-size:40px; } .sq-role b { font:800 20px var(--font); display:block; } .sq-role small { opacity:.9; line-height:1.3; display:block; }
.sq-track { display:flex; gap:8px; justify-content:center; }
.sq-q { width:54px; height:54px; border-radius:50%; display:grid; place-items:center; background:var(--s2); font:800 20px var(--font); color:var(--on2); position:relative; }
.sq-q.cur { box-shadow:0 0 0 3px var(--yellow); } .sq-q.ok { background:var(--green); color:#fff; } .sq-q.bad { background:var(--red); color:#fff; }
.sq-q small { position:absolute; bottom:-16px; font:600 10px var(--font); color:var(--on3); }
.sq-pl { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:10px; }
.sq-p { border:3px solid transparent; background:var(--surface); box-shadow:var(--e1); border-radius:20px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:4px; position:relative; font:600 14px var(--font); color:var(--on); cursor:default; }
.sq-p.sel { border-color:var(--blue); background:var(--blue-c); } .sq-p.leader::after { content:'👑'; position:absolute; top:-6px; right:-2px; font-size:20px; }
.sq-p.click { cursor:pointer; }
.sq-strip { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; } .sq-s { position:relative; display:flex; align-items:center; gap:6px; background:var(--surface); box-shadow:var(--e1); border-radius:999px; padding:3px 12px 3px 4px; font:600 13px var(--font); border:2px solid transparent; } .sq-s.sel { border-color:var(--blue); background:var(--blue-c); } .sq-s.leader::after { content:'👑'; position:absolute; top:-9px; right:-2px; font-size:16px; }
.sq-vote { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.sq-tag { font:700 11px var(--font); border-radius:8px; padding:2px 8px; } .sq-tag.y { background:var(--green-c); color:var(--green-d); } .sq-tag.n { background:var(--red-c); color:var(--red-d); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt.wide');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', role: null, knows: [], quests: [], qi: 0, leader: null, team: [], rejects: 0, votes: null, voted: false, mine: null, done: new Set(), sel: new Set(), peek: true, res: null, over: null };

  api.on('role', (r) => { S.role = r.role; S.knows = r.knows || []; render(); });
  api.on('state', (s) => { Object.assign(S, s); S.done = new Set(s.done || []); if (s.ms !== undefined) clock.set(s.ms); if (s.phase === 'team') S.sel = new Set(); if (s.phase !== 'vote') S.voted = false; if (s.phase !== 'quest') S.mine = null; render(); });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  function render() {
    const me = api.me;
    const evil = S.role === 'shadow' || S.role === 'assassin';
    const need = SIZES[N][S.qi] || 0;
    const twoFails = S.qi === 3 && N >= 7;
    const parts = [];
    if (S.role) {
      const [nm, em, desc] = ROLE[S.role];
      parts.push(h('div.sq-role' + (evil ? '.evil' : ''), { onclick: () => { S.peek = !S.peek; render(); } }, h('div.em.emo', S.peek ? em : '🎭'), h('div', h('b', S.peek ? nm : 'Your secret role (tap)'), S.peek ? h('small', desc + (S.knows.length ? ` ${S.role === 'merlin' ? 'Shadows' : 'Fellow shadows'}: ${S.knows.map(nameOf).join(', ')}.` : '')) : null)));
    }
    parts.push(h('div.sq-track', { style: 'margin-bottom:14px' }, SIZES[N].map((n, i) => h('div.sq-q' + (S.quests[i] === true ? '.ok' : S.quests[i] === false ? '.bad' : '') + (i === S.qi && !S.over ? '.cur' : ''), n, h('small', i === 3 && N >= 7 ? '2 fails' : 'quest ' + (i + 1))))));
    const strip = () => h('div.sq-strip', ids.map((id) => h('div.sq-s' + (id === S.leader ? '.leader' : '') + (S.team.includes(id) ? '.sel' : ''), avatarEl(api.player(id), 'sm', { still: true }), nameOf(id) + (id === me ? ' (you)' : ''))));
    if (S.rejects) parts.push(h('div.kt-hint', `Rejected teams in a row: ${S.rejects}/5`));
    if (S.phase === 'team') {
      parts.push(clock.el());
      if (S.leader === me) {
        parts.push(h('div.kt-prompt', { style: '--pc:#1a73e8' }, h('small', 'You are the leader'), `Choose ${need} players for this quest`));
        parts.push(h('div.sq-pl', ids.map((id) => h('button.sq-p.click' + (S.sel.has(id) ? '.sel' : ''), { onclick: () => { if (S.sel.has(id)) S.sel.delete(id); else if (S.sel.size < need) S.sel.add(id); render(); } }, avatarEl(api.player(id), 'lg', { still: true }), nameOf(id) + (id === me ? ' (you)' : '')))));
        parts.push(h('button.btn.primary.big.block', { disabled: S.sel.size !== need, onclick: () => api.toHost('team', { ids: [...S.sel] }) }, icon('check'), `Propose team (${S.sel.size}/${need})`));
      } else parts.push(h('div.kt-prompt', { style: '--pc:#1a73e8' }, h('small', `Quest ${S.qi + 1}`), `${nameOf(S.leader)} is choosing ${need} players…`), strip());
    } else if (S.phase === 'vote') {
      parts.push(clock.el(), h('div.kt-prompt', { style: '--pc:#8e4de8' }, h('small', `${nameOf(S.leader)} proposes`), S.team.map(nameOf).join(', ')), strip());
      if (S.voted) parts.push(h('div.kt-hint', 'Vote cast'), waiting(api, ids.filter((i) => !S.done.has(i)), 'Waiting for'));
      else parts.push(h('div.row', { style: 'justify-content:center' }, h('button.btn.good.big', { onclick: () => { S.voted = true; api.toHost('vote', { y: true }); render(); } }, icon('thumb_up'), 'Approve'), h('button.btn.bad.big', { onclick: () => { S.voted = true; api.toHost('vote', { y: false }); render(); } }, icon('thumb_down'), 'Reject')));
    } else if (S.phase === 'votes' && S.votes) {
      parts.push(h('div.kt-prompt', { style: { '--pc': S.res?.approved ? '#34a853' : '#ea4335' } }, h('small', 'The votes'), S.res?.approved ? 'Team approved!' : 'Team rejected'));
      parts.push(h('div.sq-pl', ids.map((id) => h('div.sq-p', avatarEl(api.player(id), 'lg', { still: true }), nameOf(id), h('span.sq-tag.' + (S.votes[id] ? 'y' : 'n'), S.votes[id] ? 'Approve' : 'Reject')))));
    } else if (S.phase === 'quest') {
      parts.push(clock.el(), strip());
      if (S.team.includes(me)) {
        parts.push(h('div.kt-prompt', { style: '--pc:#f57c00' }, h('small', 'You are on the quest'), 'Secretly choose the outcome'));
        if (S.mine !== null) parts.push(h('div.kt-hint', 'Card played'), waiting(api, S.team.filter((i) => !S.done.has(i)), 'Waiting for'));
        else parts.push(h('div.row', { style: 'justify-content:center' }, h('button.btn.good.big', { onclick: () => { S.mine = true; api.toHost('card', { s: true }); render(); } }, icon('check'), 'Success'), h('button.btn.bad.big', { disabled: !evil, onclick: () => { S.mine = false; api.toHost('card', { s: false }); render(); } }, icon('close'), 'Fail')), !evil ? h('div.kt-hint', 'Heroes must always choose Success.') : null);
      } else parts.push(h('div.kt-prompt', { style: '--pc:#f57c00' }, h('small', 'On the quest'), S.team.map(nameOf).join(', ')), h('div.kt-hint', 'Waiting for their secret cards…'));
    } else if (S.phase === 'qres' && S.res) {
      parts.push(h('div.kt-prompt', { style: { '--pc': S.res.ok ? '#34a853' : '#ea4335' } }, h('small', `Quest ${S.res.q}`), S.res.ok ? 'SUCCESS' : 'FAILED'), h('div.kt-hint', `${S.res.fails} fail card${S.res.fails === 1 ? '' : 's'}${twoFails ? ' (this quest needs 2 to fail)' : ''}`));
    } else if (S.phase === 'assassin') {
      parts.push(clock.el(), h('div.kt-prompt', { style: '--pc:#5e35b1' }, h('small', 'Heroes won three quests!'), S.role === 'assassin' ? 'Assassin: who is Merlin?' : 'The Assassin gets one guess at Merlin…'));
      if (S.role === 'assassin') parts.push(h('div.sq-pl', ids.filter((i) => i !== me && !S.knows.includes(i)).map((id) => h('button.sq-p.click', { onclick: () => api.toHost('assassinate', { id }) }, avatarEl(api.player(id), 'lg', { still: true }), nameOf(id)))));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const E = EVIL[N] || 2;
    const order = shuffled(ids, rng);
    const roles = {};
    order.forEach((id, i) => { roles[id] = i === 0 ? 'assassin' : i < E ? 'shadow' : i === E ? 'merlin' : 'hero'; });
    const evilIds = ids.filter((i) => roles[i] === 'shadow' || roles[i] === 'assassin');
    const H = { qi: 0, leader: 0, quests: [], rejects: 0, team: [], votes: {}, cards: {}, timer: 0, phase: 'wait', deadline: 0, wins: [0, 0] };
    const alive = () => ids.filter((i) => !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    ids.forEach((id) => api.sendTo(id, 'role', { role: roles[id], knows: roles[id] === 'merlin' ? evilIds : (roles[id] === 'shadow' || roles[id] === 'assassin') ? evilIds.filter((i) => i !== id) : [] }));
    const pub = (extra = {}) => api.broadcast('state', { phase: H.phase, qi: H.qi, leader: ids[H.leader], team: H.team, rejects: H.rejects, quests: H.quests, ms: Math.max(0, H.deadline - performance.now()), done: [], ...extra });
    const timer = (ms, fn) => { clearTimeout(H.timer); H.deadline = performance.now() + ms; H.timer = setTimeout(fn, ms + 300); };
    function team() {
      H.phase = 'team'; H.team = [];
      timer(90000, () => { H.team = shuffled(alive(), rng).slice(0, SIZES[N][H.qi]); toVote(); });
      pub({ votes: null, res: null });
    }
    function toVote() {
      H.phase = 'vote'; H.votes = {};
      timer(60000, tallyVotes);
      pub({ votes: null });
    }
    function tallyVotes() {
      clearTimeout(H.timer);
      alive().forEach((i) => { if (H.votes[i] === undefined) H.votes[i] = true; });
      const yes = Object.values(H.votes).filter(Boolean).length;
      const approved = yes > alive().length / 2;
      H.phase = 'votes';
      pub({ votes: H.votes, res: { approved } });
      H.timer = setTimeout(() => {
        if (approved) { H.rejects = 0; toQuest(); } else { H.rejects++; if (H.rejects >= 5) return end(false, 'Five teams were rejected in a row — the Shadows win!'); H.leader = (H.leader + 1) % N; team(); }
      }, 4500);
    }
    function toQuest() { H.phase = 'quest'; H.cards = {}; timer(45000, tallyQuest); pub({ votes: null }); }
    function tallyQuest() {
      clearTimeout(H.timer);
      H.team.forEach((i) => { if (H.cards[i] === undefined) H.cards[i] = true; });
      const fails = Object.values(H.cards).filter((c) => !c).length;
      const need = H.qi === 3 && N >= 7 ? 2 : 1;
      const ok = fails < need;
      H.quests.push(ok); H.wins[ok ? 0 : 1]++;
      H.phase = 'qres';
      pub({ res: { ok, fails, q: H.qi + 1 } });
      H.timer = setTimeout(() => {
        if (H.wins[1] >= 3) return end(false, 'Three quests failed — the Shadows win!');
        if (H.wins[0] >= 3) { if (!ids.some((i) => roles[i] === 'merlin') || !evilIds.some((i) => roles[i] === 'assassin')) return end(true, 'Three quests succeeded!'); return toAssassin(); }
        H.qi++; H.leader = (H.leader + 1) % N; team();
      }, 5000);
    }
    function toAssassin() { H.phase = 'assassin'; timer(60000, () => end(true, 'Three quests succeeded and the Assassin missed!')); pub(); }
    function end(heroesWin, why) {
      clearTimeout(H.timer);
      const winners = ids.filter((i) => ((roles[i] === 'shadow' || roles[i] === 'assassin') ? !heroesWin : heroesWin));
      const reveal = ids.map((i) => `${nameOf(i)}: ${ROLE[roles[i]][0]}`).join(' · ');
      api.endGame({ title: heroesWin ? 'The Heroes win!' : 'The Shadows win!', subtitle: why + ' — ' + reveal, ranking: [...winners, ...ids.filter((i) => !winners.includes(i))].map((id) => ({ id, score: winners.includes(id) ? 'win' : 'loss', note: ROLE[roles[id]][0] })), winners });
    }
    api.on('team', ({ ids: sel }, from) => {
      if (H.phase !== 'team' || from !== ids[H.leader]) return;
      const t = [...new Set(sel)].filter((i) => ids.includes(i));
      if (t.length !== SIZES[N][H.qi]) return;
      H.team = t; toVote();
    });
    api.on('vote', ({ y }, from) => {
      if (H.phase !== 'vote' || H.votes[from] !== undefined) return;
      H.votes[from] = !!y; api.broadcast('done', { ids: Object.keys(H.votes) });
      if (alive().every((i) => H.votes[i] !== undefined)) tallyVotes();
    });
    api.on('card', ({ s }, from) => {
      if (H.phase !== 'quest' || !H.team.includes(from) || H.cards[from] !== undefined) return;
      const evilP = roles[from] === 'shadow' || roles[from] === 'assassin';
      H.cards[from] = evilP ? !!s : true; api.broadcast('done', { ids: Object.keys(H.cards) });
      if (H.team.every((i) => H.cards[i] !== undefined)) tallyQuest();
    });
    api.on('assassinate', ({ id }, from) => { if (H.phase === 'assassin' && roles[from] === 'assassin' && ids.includes(id)) end(roles[id] !== 'merlin', roles[id] === 'merlin' ? `The Assassin found Merlin (${nameOf(id)})!` : 'The Assassin missed Merlin!'); });
    api.onRejoin((id) => { api.sendTo(id, 'role', { role: roles[id], knows: roles[id] === 'merlin' ? evilIds : (roles[id] === 'shadow' || roles[id] === 'assassin') ? evilIds.filter((i) => i !== id) : [] }); pub(); });
    api.onLeave(() => { if (H.phase === 'team' && api.player(ids[H.leader]).left) { H.leader = (H.leader + 1) % N; team(); } });
    api.timeout(team, 1000);
  }
  render();
}
