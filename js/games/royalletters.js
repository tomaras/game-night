// Royal Letters — draw one card, play one card, and use its power to deduce or eliminate rivals.
// Win rounds by holding the highest card (or being the last one standing) to collect tokens of affection.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const CARDS = {
  1: ['Guard', '🛡️', 'Name a card (not Guard). If your target holds it, they’re out.', '#34a853', 5],
  2: ['Priest', '📖', 'Secretly look at another player’s hand.', '#1a73e8', 2],
  3: ['Baron', '⚔️', 'Compare hands privately: the lower card is out.', '#f57c00', 2],
  4: ['Handmaid', '🧹', 'You’re protected until your next turn.', '#12b5cb', 2],
  5: ['Prince', '🤴', 'A player (you may pick yourself) discards their hand and draws a new card.', '#8e4de8', 2],
  6: ['King', '👑', 'Swap hands with another player.', '#fbbc04', 1],
  7: ['Countess', '💃', 'Discard this if you hold the King or the Prince.', '#e5399b', 1],
  8: ['Princess', '👸', 'If you ever discard this card, you’re out!', '#ea4335', 1],
};

const CSS = `
.rl { gap:10px; }
.rl-hand { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; padding:6px 0; }
.rl-card { width:clamp(120px, 38vw, 160px); border-radius:22px; padding:12px; background:linear-gradient(160deg, color-mix(in srgb, var(--cc) 26%, #fff), #fff 70%); box-shadow:0 6px 18px color-mix(in srgb, var(--cc) 28%, transparent); border:3px solid var(--cc); display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; cursor:pointer; transition:transform .12s; }
.rl-card:hover { transform:translateY(-6px); } .rl-card.dim { opacity:.5; cursor:not-allowed; }
.rl-card .n { font:800 30px var(--font); color:var(--cc); } .rl-card .em { font-size:42px; line-height:1; } .rl-card b { font:800 17px var(--font); } .rl-card small { font:500 12px/1.3 var(--font); color:var(--on2); }
.rl-card.mini { width:46px; padding:4px 0; border-radius:12px; border-width:2px; gap:0; cursor:default; } .rl-card.mini .n { font-size:17px; } .rl-card.mini .em { font-size:16px; }
.rl-pl { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
.rl-p { background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:6px; border:3px solid transparent; position:relative; }
.rl-p.turn { border-color:var(--yellow); } .rl-p.out { opacity:.45; } .rl-p.pick { cursor:pointer; border-color:var(--blue); animation:pulse 1s infinite; }
.rl-p .nm { font:700 14px var(--font); } .rl-p .tk { color:var(--pink); font:800 13px var(--font); } .rl-p .badge { position:absolute; top:6px; right:8px; }
.rl-disc { display:flex; gap:3px; flex-wrap:wrap; justify-content:center; min-height:30px; }
.rl-log { font:600 14px/1.4 var(--font); text-align:center; color:var(--on); background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:10px 14px; }
.rl-guess { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const goal = api.opts.length === 'short' ? 2 : { 2: 7, 3: 5, 4: 4 }[N] || 4;
  const nameOf = (id) => api.player(id)?.name || '?';
  const root = h('div.kt.wide.rl');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', hand: [], turn: null, players: {}, log: '', deck: 0, removed: [], peek: null, round: 1, step: null };
  const color = (n) => ({ '--cc': CARDS[n][3] });
  const full = (n, onclick, dim) => h('div.rl-card' + (dim ? '.dim' : ''), { style: color(n), onclick, title: CARDS[n][2] }, h('div.n', n), h('div.em.emo', CARDS[n][1]), h('b', CARDS[n][0]), h('small', CARDS[n][2]));
  const mini = (n) => h('div.rl-card.mini', { style: color(n), title: CARDS[n][0] }, h('div.n', n), h('div.em.emo', CARDS[n][1]));

  api.on('state', (s) => { Object.assign(S, s); render(); });
  api.on('peek', (p) => { S.peek = p; api.sfx('pop'); render(); });
  api.on('sfx', (m) => api.sfx(m.k));
  api.onPlayersChanged(render);

  function render() {
    const me = api.me;
    const myTurn = S.turn === me && S.phase === 'play';
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px' }, h('b', `Round ${S.round}`), ` · first to ${goal} tokens · deck ${S.deck}`, S.removed.length ? ` · set aside: ${S.removed.map((n) => CARDS[n][0]).join(', ')}` : '')];
    parts.push(h('div.rl-pl', ids.map((id) => {
      const p = S.players[id] || { disc: [], alive: true, prot: false, tokens: 0 };
      const pickable = S.step && S.step.t === 'target' && S.step.opts.includes(id);
      return h('div.rl-p' + (S.turn === id && S.phase === 'play' ? '.turn' : '') + (!p.alive ? '.out' : '') + (pickable ? '.pick' : ''), { onclick: pickable ? () => pickTarget(id) : null },
        avatarEl({ ...api.player(id), online: api.player(id)?.online }, 'lg', { still: S.turn !== id }),
        h('div.nm', nameOf(id) + (id === me ? ' (you)' : '')),
        h('div.tk', '♥'.repeat(p.tokens) || '–'),
        p.prot ? h('span.chip.blue.badge', icon('shield', 'sm'), 'safe') : null, !p.alive ? h('span.chip.red.badge', 'out') : null,
        h('div.rl-disc', p.disc.map(mini)));
    })));
    if (S.log) parts.push(h('div.rl-log', S.log));
    if (S.peek) parts.push(h('div.kt-card', { style: 'text-align:center' }, h('div.kt-title', `${nameOf(S.peek.who)} holds`), h('div.rl-hand', full(S.peek.card, null))));
    if (S.phase === 'play') {
      if (S.step && S.step.t === 'guess') {
        parts.push(h('div.kt-prompt', { style: '--pc:#34a853' }, h('small', 'Guard'), `What is ${nameOf(S.step.target)} holding?`), h('div.rl-guess', [2, 3, 4, 5, 6, 7, 8].map((n) => h('button.btn.tonal', { onclick: () => submit({ c: 1, target: S.step.target, guess: n }) }, `${n} · ${CARDS[n][0]}`))), h('button.btn.ghost', { onclick: () => { S.step = null; render(); } }, 'Cancel'));
      } else if (S.step && S.step.t === 'target') parts.push(h('div.kt-hint', { style: 'font-weight:700;color:var(--on)' }, `Tap a player to target with the ${CARDS[S.step.card][0]}`), h('button.btn.ghost', { onclick: () => { S.step = null; render(); } }, 'Cancel'));
      else parts.push(myTurn ? h('div.kt-hint', { style: 'font-weight:700;color:var(--on)' }, 'Your turn — choose a card to play') : h('div.kt-hint', `${nameOf(S.turn)} is thinking…`));
    }
    if (S.phase === 'between') parts.push(h('div.kt-hint', 'Next round starting…'));
    const mustCountess = S.hand.includes(7) && (S.hand.includes(5) || S.hand.includes(6));
    parts.push(h('div.rl-hand', S.hand.map((n) => full(n, () => { if (!myTurn || S.step) return; if (mustCountess && n !== 7) return api.toast('You must play the Countess!'); play(n); }, !myTurn || (mustCountess && n !== 7)))));
    root.replaceChildren(...parts);
  }

  const targetsFor = (c) => ids.filter((i) => S.players[i]?.alive && !S.players[i].prot && (i !== api.me || c === 5));
  function play(c) {
    if ([1, 2, 3, 5, 6].includes(c)) {
      const opts = targetsFor(c);
      if (!opts.length) return submit({ c });
      if (opts.length === 1) return pickTarget(opts[0], c);
      S.step = { t: 'target', card: c, opts }; render();
    } else submit({ c });
  }
  function pickTarget(id, cc) {
    const c = cc || S.step.card;
    if (c === 1) { S.step = { t: 'guess', card: 1, target: id }; render(); } else submit({ c, target: id });
  }
  function submit(m) { S.step = null; S.peek = null; api.toHost('play', m); api.sfx('card'); render(); }

  if (api.isHost) {
    const rng = api.rng;
    const H = { deck: [], hands: {}, disc: {}, alive: {}, prot: {}, tokens: {}, set: null, removed: [], turn: 0, round: 0, phase: 'wait', log: '', timer: 0 };
    ids.forEach((i) => (H.tokens[i] = 0));
    const live = () => ids.filter((i) => H.alive[i] && !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    const pub = () => ids.forEach((id) => {
      if (api.player(id).left) return;
      api.sendTo(id, 'state', { phase: H.phase, turn: ids[H.turn], round: H.round, deck: H.deck.length, removed: H.removed, log: H.log, hand: H.hands[id] || [], players: Object.fromEntries(ids.map((i) => [i, { disc: H.disc[i] || [], alive: !!H.alive[i], prot: !!H.prot[i], tokens: H.tokens[i] }])) });
    });
    const nextAlive = (k) => { for (let i = 1; i <= N; i++) { const j = (k + i) % N; if (H.alive[ids[j]] && !api.player(ids[j]).left) return j; } return k; };
    function newRound() {
      H.round++;
      const deck = [];
      for (const [n, v] of Object.entries(CARDS)) for (let k = 0; k < v[4]; k++) deck.push(+n);
      H.deck = rng.shuffle(deck);
      H.set = H.deck.pop();
      H.removed = N === 2 ? [H.deck.pop(), H.deck.pop(), H.deck.pop()] : [];
      ids.forEach((i) => { H.hands[i] = [H.deck.pop()]; H.disc[i] = []; H.alive[i] = !api.player(i).left; H.prot[i] = false; });
      H.turn = H.turnStart ?? 0;
      if (!H.alive[ids[H.turn]]) H.turn = nextAlive(H.turn);
      H.log = `Round ${H.round} begins!`;
      beginTurn();
    }
    function beginTurn() {
      const id = ids[H.turn];
      H.prot[id] = false;
      if (!H.deck.length) return endRound();
      H.hands[id].push(H.deck.pop());
      H.phase = 'play';
      pub();
    }
    function out(id, why) { H.alive[id] = false; H.disc[id].push(...H.hands[id]); H.hands[id] = []; H.log += ` ${nameOf(id)} is out${why ? ' (' + why + ')' : ''}!`; api.broadcast('sfx', { k: 'boom' }); }
    function finishTurn() {
      if (live().length <= 1 || !H.deck.length) return endRound();
      H.turn = nextAlive(H.turn);
      beginTurn();
    }
    api.on('play', ({ c, target, guess }, from) => {
      if (H.phase !== 'play' || from !== ids[H.turn]) return;
      const hand = H.hands[from];
      if (!hand.includes(c)) return;
      if (hand.includes(7) && (hand.includes(5) || hand.includes(6)) && c !== 7) return;
      hand.splice(hand.indexOf(c), 1);
      H.disc[from].push(c);
      const t = target && H.alive[target] && !H.prot[target] && (target !== from || c === 5) ? target : null;
      H.log = `${nameOf(from)} plays ${CARDS[c][0]}.`;
      let peekCard = null;
      if (c === 8) out(from, 'discarded the Princess');
      else if (c === 1 && t && guess >= 2 && guess <= 8) { if (H.hands[t][0] === guess) { H.log += ` Right! ${nameOf(t)} held the ${CARDS[guess][0]}.`; out(t); } else H.log += ` ${nameOf(from)} guessed ${CARDS[guess][0]} for ${nameOf(t)} — wrong.`; }
      else if (c === 2 && t) { H.log += ` ${nameOf(from)} peeks at ${nameOf(t)}’s hand.`; peekCard = { who: t, card: H.hands[t][0] }; }
      else if (c === 3 && t) { const a = hand[0], b = H.hands[t][0]; H.log += ` ${nameOf(from)} and ${nameOf(t)} compare hands.`; if (a > b) { H.log += ` ${nameOf(t)} had the ${CARDS[b][0]}.`; out(t); } else if (b > a) { H.log += ` ${nameOf(from)} had the ${CARDS[a][0]}.`; out(from); } else H.log += ' Tie!'; }
      else if (c === 4) H.prot[from] = true;
      else if (c === 5 && t) { const d = H.hands[t][0]; H.disc[t].push(d); H.log += ` ${nameOf(t)} discards the ${CARDS[d][0]}.`; if (d === 8) out(t, 'discarded the Princess'); else H.hands[t] = [H.deck.length ? H.deck.pop() : H.set]; }
      else if (c === 6 && t) { [hand[0], H.hands[t][0]] = [H.hands[t][0], hand[0]]; H.log += ` ${nameOf(from)} swaps hands with ${nameOf(t)}.`; }
      else if (c !== 7 && c !== 4 && !t) H.log += ' (no valid target)';
      H.phase = 'wait2';
      pub();
      if (peekCard) api.sendTo(from, 'peek', peekCard);
      H.timer = setTimeout(finishTurn, peekCard ? 3800 : 2000);
    });
    function endRound() {
      clearTimeout(H.timer);
      const al = live();
      let winner;
      if (al.length === 1) winner = al[0];
      else winner = al.slice().sort((a, b) => (H.hands[b][0] - H.hands[a][0]) || (H.disc[b].reduce((x, y) => x + y, 0) - H.disc[a].reduce((x, y) => x + y, 0)))[0];
      H.tokens[winner]++;
      H.log = `${nameOf(winner)} wins the round${al.length > 1 ? ` with the ${CARDS[H.hands[winner][0]][0]}` : ''}! ` + (al.length > 1 ? al.map((i) => `${nameOf(i)}: ${CARDS[H.hands[i][0]]?.[0] || '—'}`).join(', ') : '');
      H.phase = 'between'; H.turnStart = ids.indexOf(winner);
      pub();
      api.broadcast('sfx', { k: 'good' });
      if (H.tokens[winner] >= goal) { H.timer = setTimeout(() => finish(winner), 3500); return; }
      H.timer = setTimeout(newRound, 5500);
    }
    function finish(w) {
      const ranking = ids.slice().sort((a, b) => H.tokens[b] - H.tokens[a]).map((id) => ({ id, score: H.tokens[id], note: 'tokens' }));
      api.endGame({ title: `${nameOf(w)} wins the princess’s heart!`, subtitle: `First to ${goal} tokens`, ranking, winners: [w] });
    }
    api.onRejoin(() => pub());
    api.onLeave((id) => { if (H.alive[id]) { H.alive[id] = false; if (live().length <= 1) endRound(); else if (ids[H.turn] === id && H.phase === 'play') { H.turn = nextAlive(H.turn); beginTurn(); } else pub(); } });
    api.timeout(newRound, 800);
  }
  render();
}
