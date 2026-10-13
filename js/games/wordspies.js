// Word Spies — a Codenames-style team word game (4–10 players). Spymasters see the secret colour key and give
// one-word clues; operatives guess cards. Find all your agents first — and never touch the assassin.
import { h } from '../util.js';
import { avatarEl } from '../avatar.js';
import { WORDS } from '../words.js';



const CSS = `
.ws { flex:1; display:flex; gap:12px; padding:10px; min-height:0; overflow-y:auto; justify-content:center; flex-wrap:wrap; align-content:flex-start; }
.ws-main { display:flex; flex-direction:column; gap:10px; width:min(100%, 720px); }
.ws-grid { display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; }
.ws-card { position:relative; min-height:clamp(52px, 11vw, 82px); border-radius:10px; background:#efe3c8; color:#2b2113; font-weight:900; display:grid; place-items:center; text-align:center; padding:4px; font-size:clamp(11px, 2.6vw, 17px); text-transform:uppercase; cursor:pointer; border:3px solid transparent; box-shadow:0 3px 0 #b9a77c; word-break:break-word; }
.ws-card:hover:not(.rev) { transform:translateY(-2px); }
.ws-card.k-r { box-shadow:0 3px 0 #b9a77c, inset 0 0 0 3px #e5383b; } .ws-card.k-b { box-shadow:0 3px 0 #b9a77c, inset 0 0 0 3px #2f6fed; }
.ws-card.k-n { box-shadow:0 3px 0 #b9a77c, inset 0 0 0 3px #8a8575; } .ws-card.k-a { box-shadow:0 3px 0 #000, inset 0 0 0 3px #000; background:#c9bb98; }
.ws-card.rev { cursor:default; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.5); box-shadow:none; }
.ws-card.rev.r { background:#e5383b; } .ws-card.rev.b { background:#2f6fed; } .ws-card.rev.n { background:#8a8575; } .ws-card.rev.a { background:#111; }
.ws-card.sel { border-color:#ffc857; transform:translateY(-3px) scale(1.04); z-index:2; }
.ws-card.rev span.x { opacity:.9; }
.ws-card .tag { position:absolute; top:-6px; right:-4px; background:#ffc857; color:#3b2b00; border-radius:8px; font-size:10px; padding:0 5px; font-weight:900; }
.ws-bar { display:flex; gap:10px; flex-wrap:wrap; }
.ws-team { flex:1; min-width:150px; background:var(--panel); border:3px solid transparent; box-shadow:var(--e1); border-radius:22px; padding:10px 12px; }
.ws-team.r { background:#fff1f0; } .ws-team.b { background:#eef4ff; }
.ws-team.turn { border-color:var(--yellow); }
.ws-team h4 { margin:0 0 4px; display:flex; justify-content:space-between; font-size:15px; } .ws-team.r h4 { color:#ff6b6b; } .ws-team.b h4 { color:#6ea0ff; }
.ws-mem { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; padding:1px 0; }
.ws-clue { background:var(--panel); box-shadow:var(--e1); border-radius:24px; padding:10px 14px; text-align:center; }
.ws-clue .big { font-size:26px; font-weight:900; }
.ws-form { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:6px; }
.ws-form input[type=text] { width:180px; } .ws-form select { width:80px; }
@media (max-width:640px) { .ws { padding:6px; } .ws-grid { gap:4px; } }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const nameOf = (id) => api.player(id)?.name || '?';
  const TEAM = { r: 'Red', b: 'Blue' };

  // ============================================================ HOST
  if (api.isHost) {
    const rng = api.rng;
    const order = rng.shuffle(ids);
    const teams = { r: [], b: [] };
    order.forEach((id, i) => teams[i % 2 ? 'b' : 'r'].push(id));
    const spies = { r: teams.r[0], b: teams.b[0] };
    const first = rng.next() < 0.5 ? 'r' : 'b';
    const words = rng.shuffle(WORDS).slice(0, 25);
    const key = rng.shuffle([...'r'.repeat(first === 'r' ? 9 : 8), ...'b'.repeat(first === 'b' ? 9 : 8), ...'n'.repeat(7), 'a']);
    const H = { rev: new Array(25).fill(0), turn: first, phase: 'clue', clue: null, left: 0, sel: null, winner: null, log: [], over: false };
    const remaining = (t) => key.filter((k, i) => k === t && !H.rev[i]).length;
    const teamOf = (id) => (teams.r.includes(id) ? 'r' : teams.b.includes(id) ? 'b' : null);
    const log = (t) => { H.log.push(t); if (H.log.length > 8) H.log.shift(); };
    const publish = (to) => {
      for (const id of to ? [to] : ids) {
        if (api.player(id).left) continue;
        const spy = spies.r === id || spies.b === id;
        api.sendTo(id, 'state', {
          words, rev: H.rev, key: spy || H.phase === 'over' ? key : null, turn: H.turn, phase: H.phase, clue: H.clue, left: H.left, sel: H.sel, winner: H.winner,
          teams, spies, rem: { r: remaining('r'), b: remaining('b') }, log: H.log, first,
        });
      }
    };
    function endTurn(why) {
      if (why) log(why);
      H.turn = H.turn === 'r' ? 'b' : 'r'; H.phase = 'clue'; H.clue = null; H.left = 0; H.sel = null;
      publish();
    }
    function win(t, why) {
      H.winner = t; H.phase = 'over'; H.over = true;
      log(why);
      publish();
      const members = [...teams[t], ...teams[t === 'r' ? 'b' : 'r']];
      api.timeout(() => api.endGame({ title: `${TEAM[t]} team wins!`, subtitle: why, ranking: members.map((id) => ({ id, score: teams[t].includes(id) ? 'win' : 'loss' })), winners: teams[t] }), 3500);
    }
    api.on('clue', ({ w, n }, from) => {
      if (H.phase !== 'clue' || from !== spies[H.turn]) return;
      w = String(w || '').trim().split(/\s+/)[0]?.slice(0, 20);
      n = Math.max(0, Math.min(9, Math.floor(+n)));
      if (!w) return;
      if (words.some((x, i) => !H.rev[i] && (x === w.toLowerCase() || (w.length > 3 && (x.includes(w.toLowerCase()) || w.toLowerCase().includes(x)))))) return api.sendTo(from, 'err', 'A clue can’t be (part of) a word on the board.');
      H.clue = { w, n }; H.left = n + 1; H.phase = 'guess'; H.sel = null;
      log(`${TEAM[H.turn]} spymaster: “${w}” — ${n}`);
      publish();
    });
    api.on('pick', ({ i }, from) => {
      if (H.phase !== 'guess' || teamOf(from) !== H.turn || from === spies[H.turn] || !(i >= 0 && i < 25) || H.rev[i]) return;
      if (H.sel !== i) { H.sel = i; publish(); return; }
      H.rev[i] = key[i]; H.sel = null;
      const t = key[i];
      log(`${nameOf(from)} flipped “${words[i]}” (${t === 'a' ? 'ASSASSIN' : t === 'n' ? 'neutral' : TEAM[t]})`);
      if (t === 'a') return win(H.turn === 'r' ? 'b' : 'r', `${TEAM[H.turn]} hit the assassin!`);
      if (remaining('r') === 0) return win('r', 'Red found all their agents!');
      if (remaining('b') === 0) return win('b', 'Blue found all their agents!');
      if (t === H.turn) { H.left--; if (H.left <= 0) return endTurn(`${TEAM[H.turn]} used all their guesses.`); publish(); }
      else endTurn(t === 'n' ? 'Neutral bystander — turn over.' : `That was ${TEAM[t]}’s agent! Turn over.`);
    });
    api.on('end', (_, from) => { if (H.phase === 'guess' && teamOf(from) === H.turn && from !== spies[H.turn]) endTurn(`${nameOf(from)} ended the turn.`); });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (H.over) return;
      const t = teamOf(id);
      if (!t) return;
      const left = teams[t].filter((x) => !api.player(x).left);
      if (!left.length) return win(t === 'r' ? 'b' : 'r', `${TEAM[t]} team left the game.`);
      if (spies[t] === id) { spies[t] = left[0]; log(`${nameOf(left[0])} is now the ${TEAM[t]} spymaster.`); }
      if (H.turn === t && H.phase === 'guess' && left.length === 1 && left[0] === spies[t]) endTurn();
      else publish();
    });
    api.timeout(() => { log(`${TEAM[first]} goes first (9 agents).`); publish(); }, 500);
  }

  // ============================================================ CLIENT
  let st = null;
  const clueIn = h('input.txt', { type: 'text', maxlength: 20, placeholder: 'One-word clue', autocomplete: 'off' });
  const numIn = h('select.txt', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('option', { value: n, selected: n === 1 }, String(n))));
  const root = h('div.ws');
  api.root.append(h('style', CSS), root);
  api.on('state', (s) => {
    const prev = st;
    st = s;
    if (prev && prev.rev.some((v, i) => v !== s.rev[i])) { const i = s.rev.findIndex((v, k) => v !== prev.rev[k]); api.sfx(s.rev[i] === 'a' ? 'boom' : s.rev[i] === prev.turn ? 'good' : 'bad'); }
    else if (prev && prev.turn !== s.turn) api.sfx('turn');
    render();
  });
  api.on('err', (t) => { api.toast(t); api.sfx('bad'); });
  api.onPlayersChanged(() => st && render());

  function render() {
    if (!st) return;
    const me = api.me;
    const myTeam = st.teams.r.includes(me) ? 'r' : 'b';
    const amSpy = st.spies.r === me || st.spies.b === me;
    const myTurn = st.turn === myTeam && st.phase !== 'over';
    const grid = h('div.ws-grid', st.words.map((w, i) => {
      const rv = st.rev[i];
      const cls = ['ws-card'];
      if (rv) cls.push('rev', rv);
      else if (st.key) cls.push('k-' + st.key[i]);
      if (st.sel === i && !rv) cls.push('sel');
      return h('div.' + cls.join('.'), { style: w.length > 9 ? { fontSize: 'clamp(9px, 2vw, 13px)' } : '', onclick: () => { if (st.phase === 'guess' && myTurn && !amSpy && !rv) { api.sfx('click'); api.toHost('pick', { i }); } } },
        h('span', w), st.sel === i && !rv ? h('span.tag', 'tap again') : null, rv && st.key && rv === 'a' ? h('span.x', ' ☠') : null);
    }));
    const teamBox = (t) => h('div.ws-team.' + t + (st.turn === t && st.phase !== 'over' ? '.turn' : ''), [
      h('h4', h('span', `${TEAM[t]} team`), h('span', `${st.rem[t]} left`)),
      ...st.teams[t].map((id) => h('div.ws-mem', avatarEl({ ...api.player(id), online: api.player(id).online && !api.player(id).left }, 'xs', { still: true }), nameOf(id) + (id === me ? ' (you)' : ''), st.spies[t] === id ? h('span.chip', '🕵️ spymaster') : null)),
    ]);
    let panel;
    if (st.phase === 'over') panel = h('div.ws-clue', h('div.big', `${TEAM[st.winner]} team wins! 🎉`), h('div.muted', st.log[st.log.length - 1]));
    else if (st.phase === 'clue') {
      panel = st.spies[st.turn] === me
        ? h('div.ws-clue', [h('b', `You are the ${TEAM[st.turn]} spymaster — give your team a clue`), h('form.ws-form', { onsubmit: (e) => { e.preventDefault(); api.toHost('clue', { w: clueIn.value, n: numIn.value }); clueIn.value = ''; } }, clueIn, numIn, h('button.btn.primary', { type: 'submit' }, 'Give clue')), h('div.muted', { style: 'font-size:12px;margin-top:4px' }, 'One word + how many cards it relates to.')])
        : h('div.ws-clue', h('b', `${TEAM[st.turn]} spymaster ${nameOf(st.spies[st.turn])} is thinking of a clue…`));
    } else {
      panel = h('div.ws-clue', [
        h('div.big', { style: { color: st.turn === 'r' ? '#ff6b6b' : '#6ea0ff' } }, `${st.clue.w.toUpperCase()} · ${st.clue.n}`),
        h('div.muted', myTurn && !amSpy ? `${st.left} guess${st.left === 1 ? '' : 'es'} left — tap a card to select it, tap again to flip it` : amSpy && myTurn ? 'Your operatives are guessing…' : `${TEAM[st.turn]} team is guessing…`),
        myTurn && !amSpy ? h('button.btn.small', { style: 'margin-top:6px', onclick: () => api.toHost('end') }, 'End turn') : null,
      ]);
    }
    root.replaceChildren(h('div.ws-main', [h('div.ws-bar', teamBox('r'), teamBox('b')), panel, grid,
      h('div.muted', { style: 'font-size:12.5px;line-height:1.5' }, [amSpy ? '🕵️ You can see the key: red/blue borders show your team’s agents; black = assassin. ' : '', ...st.log.slice(-3).map((l) => h('div', l))])]));
  }
}
