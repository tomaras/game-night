// Temple Treasure — an Incan-Gold-style push-your-luck game. Explore the temple together, split the gems,
// and decide every step: keep going for more, or run to the camp before the hazards strike!
import { h } from '../util.js';
import { avatarEl } from '../avatar.js';
import { makeClock } from '../kit.js';

const HAZ = { spider: ['🕷️', '#7b1fa2', 'Spiders'], snake: ['🐍', '#2e7d32', 'Snakes'], fire: ['🔥', '#e65100', 'Fire'], rock: ['🪨', '#6d4c41', 'Rockfall'], mummy: ['🧟', '#00838f', 'Mummies'] };
const TREASURES = [1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17];
const ARTIFACTS = [5, 7, 8, 10, 12];

const CSS = `
.tp { gap:10px; }
.tp-haz { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; }
.tp-h { display:flex; align-items:center; gap:4px; border-radius:999px; padding:3px 10px 3px 6px; background:var(--surface); box-shadow:var(--e1); font:800 13px var(--font); }
.tp-h .pip { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--s3); } .tp-h .pip.on { background:#ea4335; } .tp-h.hot { background:#ffebee; box-shadow:0 0 0 2px #ea4335; animation:pulse .8s infinite; }
.tp-path { display:flex; gap:8px; overflow-x:auto; padding:10px 6px 8px; background:linear-gradient(180deg,#ffe0b2,#ffcc80); border-radius:24px; min-height:112px; align-items:center; scrollbar-width:none; box-shadow:inset 0 2px 8px rgba(0,0,0,.1); }
.tp-c { flex:none; width:64px; height:88px; border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; color:#fff; font:800 26px var(--font); box-shadow:0 4px 10px rgba(0,0,0,.2); background:linear-gradient(145deg,#ffca28,#f57f17); animation:tpin .45s cubic-bezier(.3,1.4,.5,1); }
.tp-c .em { font-size:30px; line-height:1; } .tp-c small { font:700 10px var(--font); opacity:.9; } .tp-c.haz { background:var(--hc); } .tp-c.art { background:linear-gradient(145deg,#26c6da,#00838f); }
.tp-c.boom { box-shadow:0 0 0 4px #ea4335, 0 4px 10px rgba(0,0,0,.2); }
@keyframes tpin { from { transform:translateX(60px) scale(.6); opacity:0; } }
.tp-pot { text-align:center; font:800 18px var(--font); color:var(--on); }
.tp-pl { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:8px; }
.tp-p { background:var(--surface); box-shadow:var(--e1); border-radius:20px; padding:8px 10px; display:flex; align-items:center; gap:8px; border:3px solid transparent; }
.tp-p.left { background:var(--green-c); } .tp-p.dead { background:var(--red-c); opacity:.75; } .tp-p.locked { border-color:var(--blue); }
.tp-p .nm { font:700 13px var(--font); } .tp-p .st { font:600 11px var(--font); color:var(--on2); } .tp-p .gm { font:800 15px var(--font); color:var(--blue); margin-left:auto; text-align:right; } .tp-p .gm small { display:block; font:600 10px var(--font); color:var(--on3); }
.tp-dec { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.tp-dec button { height:84px; border-radius:24px; border:0; font:800 18px var(--font); color:#fff; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; box-shadow:var(--e2); transition:transform .1s; }
.tp-dec button small { font:600 12px var(--font); opacity:.9; } .tp-dec button:active { transform:scale(.97); } .tp-dec .go { background:linear-gradient(145deg,#43a047,#1b5e20); } .tp-dec .out { background:linear-gradient(145deg,#ef5350,#b71c1c); } .tp-dec button.dim { opacity:.4; } .tp-dec button.pick { outline:5px solid var(--yellow); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const rounds = +api.opts.rounds || 5;
  const root = h('div.kt.wide.tp');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, path: [], pot: 0, deck: 0, haz: {}, ps: {}, locked: new Set(), choice: null, boom: null, end: null, log: '', arts: [] };

  api.on('state', (s) => {
    const prevStep = S.path.length, prevPhase = S.phase;
    Object.assign(S, s);
    S.locked = new Set(s.locked || []);
    if (s.ms !== undefined) clock.set(s.ms);
    if (s.phase === 'decide' && (prevPhase !== 'decide' || S.path.length !== prevStep)) S.choice = null;
    if (s.sfx) api.sfx(s.sfx);
    render();
    const pt = root.querySelector('.tp-path'); if (pt) pt.scrollLeft = pt.scrollWidth;
  });
  api.onPlayersChanged(render);

  function cardEl(c, last, boom) {
    if (c.t === 'tr') return h('div.tp-c', h('span.em.emo', '💎'), c.v);
    if (c.t === 'art') return h('div.tp-c.art', h('span.em.emo', '🏺'), h('small', 'artifact ' + c.v));
    const [em, col, nm] = HAZ[c.hz];
    return h('div.tp-c.haz' + (boom ? '.boom' : ''), { style: `--hc:${col}` }, h('span.em.emo', em), h('small', nm));
  }

  function render() {
    const me = api.me, mine = S.ps[me] || {};
    if (S.phase === 'roundEnd' && S.end) {
      const e = S.end;
      root.replaceChildren(
        h('div.kt-prompt', { style: `--pc:${e.boom ? '#ea4335' : '#34a853'}` }, h('small', `Round ${S.round} of ${rounds}`), e.boom ? `${HAZ[e.boom][0]} ${HAZ[e.boom][2]} strike twice! The explorers still inside lose their gems.` : 'Everyone made it out of the temple.'),
        h('div.tp-pl', ids.map((id) => { const p = S.ps[id], g = e.gain[id] || 0; return h('div.tp-p' + (g > 0 ? '.left' : p.dead ? '.dead' : ''), avatarEl(api.player(id), 'sm', { still: true }), h('div', h('div.nm', nameOf(id) + (id === me ? ' (you)' : '')), h('div.st', g > 0 ? `+${g} 💎${e.arts[id] ? ' + artifact' : ''}` : p.dead ? 'lost the loot' : 'nothing')), h('div.gm', p.chest, h('small', 'in chest'))); })),
        h('div.kt-hint', S.round < rounds ? 'Next expedition starting soon…' : 'Counting the treasure…'));
      return;
    }
    const hz = h('div.tp-haz', Object.entries(HAZ).map(([k, [em]]) => h('div.tp-h' + (S.haz[k] === 1 ? '.hot' : ''), h('span.emo', em), h('span.pip' + (S.haz[k] >= 1 ? '.on' : '')), h('span.pip' + (S.haz[k] >= 2 ? '.on' : '')))));
    const head = h('div.kt-row', { style: 'justify-content:center' }, h('span.chip.blue', `Expedition ${S.round}/${rounds}`), h('span.chip.yellow', `${S.deck} cards left`), S.phase === 'decide' ? clock.el() : null);
    const path = h('div.tp-path', S.path.length ? S.path.map((c, i) => cardEl(c, i === S.path.length - 1, S.boom && i === S.path.length - 1)) : h('div', { style: 'color:#8d6e63;font:700 15px var(--font);padding:0 10px' }, 'The temple entrance…'));
    const pot = h('div.tp-pot', S.pot ? `💎 ${S.pot} on the path` : '', S.arts.length ? `  🏺 ${S.arts.length} artifact${S.arts.length > 1 ? 's' : ''}` : '');
    const pl = h('div.tp-pl', ids.map((id) => {
      const p = S.ps[id] || {};
      const st = p.dead ? '☠️ lost it all' : p.left ? '⛺ safe at camp' : p.in ? (S.locked.has(id) ? '✅ decided' : '🔦 exploring') : '';
      return h('div.tp-p' + (p.left ? '.left' : p.dead ? '.dead' : '') + (S.locked.has(id) && p.in ? '.locked' : ''), avatarEl(api.player(id), 'sm', { still: !p.in }), h('div', h('div.nm', nameOf(id) + (id === me ? ' (you)' : '')), h('div.st', st)), h('div.gm', `💎${p.carry || 0}`, h('small', `🏆 ${p.chest || 0}${p.arts ? ' · 🏺' + p.arts : ''}`)));
    }));
    let dec = null;
    if (S.phase === 'decide' && mine.in) {
      const lock = S.choice !== null;
      dec = h('div.tp-dec', h('button.go' + (S.choice === true ? '.pick' : lock ? '.dim' : ''), { onclick: () => choose(true) }, h('span.emo', { style: 'font-size:28px' }, '🔦'), 'Keep exploring', h('small', 'risk it for more')),
        h('button.out' + (S.choice === false ? '.pick' : lock ? '.dim' : ''), { onclick: () => choose(false) }, h('span.emo', { style: 'font-size:28px' }, '⛺'), 'Return to camp', h('small', `bank 💎${mine.carry || 0} + share of the path`)));
    } else if (S.phase === 'decide') dec = h('div.kt-hint', mine.dead ? 'You lost everything this round…' : 'You’re safe at camp — watching the others.');
    else if (S.phase === 'flip') dec = h('div.kt-hint', 'Exploring deeper…');
    root.replaceChildren(head, hz, path, pot, S.log ? h('div.kt-hint', { style: 'font-weight:700;color:var(--on)' }, S.log) : '', dec || '', pl);
  }
  function choose(stay) { if (S.phase !== 'decide') return; S.choice = stay; api.toHost('choice', { stay }); api.sfx('pop'); render(); }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, deck: [], path: [], pot: 0, haz: {}, ps: {}, phase: 'wait', timer: 0, choices: {}, log: '', held: [], roundArts: {}, boom: null, sfx: null };
    ids.forEach((id) => (H.ps[id] = { in: false, left: false, dead: false, carry: 0, chest: 0, arts: 0, artVal: 0 }));
    api.cleanup(() => clearTimeout(H.timer));
    const inside = () => ids.filter((id) => H.ps[id].in && !api.player(id).left);
    const pub = (extra = {}) => { api.broadcast('state', { phase: H.phase, round: H.round, path: H.path, pot: H.pot, deck: H.deck.length, haz: H.haz, ps: Object.fromEntries(ids.map((id) => [id, { ...H.ps[id], arts: H.ps[id].arts }])), locked: Object.keys(H.choices), log: H.log, boom: H.boom, arts: H.path.filter((c) => c.t === 'art'), sfx: H.sfx, ...extra }); H.sfx = null; };
    function newRound() {
      H.round++;
      const deck = TREASURES.map((v) => ({ t: 'tr', v }));
      for (const hz of Object.keys(HAZ)) for (let i = 0; i < 3; i++) deck.push({ t: 'hz', hz });
      // artifacts: one new per round plus any still unclaimed from earlier rounds
      H.held.push(ARTIFACTS[H.round - 1] || 12);
      H.held.forEach((v) => deck.push({ t: 'art', v }));
      H.deck = rng.shuffle(deck);
      H.path = []; H.pot = 0; H.haz = {}; H.choices = {}; H.boom = null; H.log = ''; H.roundArts = {};
      ids.forEach((id) => { Object.assign(H.ps[id], { in: !api.player(id).left, left: false, dead: false, carry: 0 }); });
      H.phase = 'flip';
      pub();
      H.timer = setTimeout(flip, 1300);
    }
    function flip() {
      if (!inside().length || !H.deck.length) return endRound(null);
      const c = H.deck.pop();
      H.path.push(c);
      const act = inside();
      if (c.t === 'tr') {
        const share = Math.floor(c.v / act.length);
        act.forEach((id) => (H.ps[id].carry += share));
        H.pot += c.v - share * act.length;
        H.log = share ? `+${share} 💎 each${c.v % act.length ? ` (${c.v % act.length} left on the path)` : ''}` : `${c.v} 💎 can’t be split — it stays on the path`;
        H.sfx = 'pop';
      } else if (c.t === 'art') { H.log = 'An ancient artifact!'; H.sfx = 'good'; }
      else {
        H.haz[c.hz] = (H.haz[c.hz] || 0) + 1;
        if (H.haz[c.hz] >= 2) { H.boom = c.hz; H.log = `${HAZ[c.hz][2]} again!`; H.sfx = 'boom'; return endRound(c.hz); }
        H.log = `${HAZ[c.hz][2]}! One more and the temple strikes…`; H.sfx = 'bad';
      }
      H.phase = 'decide'; H.choices = {};
      pub({ ms: 10000 });
      clearTimeout(H.timer);
      H.timer = setTimeout(() => resolve(true), 10500);
    }
    api.on('choice', ({ stay }, from) => {
      if (H.phase !== 'decide' || !H.ps[from].in) return;
      H.choices[from] = !!stay;
      if (inside().every((id) => id in H.choices)) { clearTimeout(H.timer); H.timer = setTimeout(() => resolve(false), 700); } else pub({ ms: undefined });
    });
    function resolve() {
      if (H.phase !== 'decide') return;
      clearTimeout(H.timer);
      const act = inside();
      const leavers = act.filter((id) => H.choices[id] === false);
      if (leavers.length) {
        const potAll = H.pot + 0;
        const share = Math.floor(potAll / leavers.length);
        const arts = H.path.filter((c) => c.t === 'art');
        leavers.forEach((id) => {
          const p = H.ps[id];
          const g = p.carry + share;
          p.chest += g; p.gain = g; p.carry = 0; p.in = false; p.left = true;
        });
        H.pot = potAll - share * leavers.length;
        if (leavers.length === 1 && arts.length) {
          const p = H.ps[leavers[0]];
          H.roundArts[leavers[0]] = true;
          arts.forEach((a) => { p.arts++; p.artVal += a.v; p.chest += a.v; H.held.splice(H.held.indexOf(a.v), 1); });
          H.path = H.path.filter((c) => c.t !== 'art');
          H.log = `${nameOf(leavers[0])} escaped alone with the artifact${arts.length > 1 ? 's' : ''}!`;
        } else H.log = leavers.map(nameOf).join(', ') + ' returned to camp.';
        H.sfx = 'good';
      } else H.log = '';
      if (!inside().length) return endRound(null);
      H.phase = 'flip';
      pub();
      H.timer = setTimeout(flip, 1500);
    }
    function endRound(boom) {
      clearTimeout(H.timer);
      const gain = {}, arts = H.roundArts;
      ids.forEach((id) => { const p = H.ps[id]; gain[id] = p.gain || 0; if (p.in) { p.dead = true; p.in = false; } });
      // if the temple struck, stayers lose their carried gems; art cards stay in the deck for later rounds
      H.phase = 'roundEnd';
      H.sfx = boom ? 'lose' : 'win';
      pub({ end: { boom, gain, arts } });
      ids.forEach((id) => delete H.ps[id].gain);
      H.timer = setTimeout(() => { if (H.round >= rounds) finish(); else newRound(); }, 7000);
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.ps[b].chest - H.ps[a].chest).map((id) => ({ id, score: H.ps[id].chest, note: `💎${H.ps[id].chest - H.ps[id].artVal}${H.ps[id].arts ? ` + 🏺${H.ps[id].arts}` : ''}` }));
      const top = ranking[0].score;
      api.endGame({ title: `${ranking.filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} found the most treasure!`, subtitle: `${top} points`, ranking, winners: ranking.filter((r) => r.score === top).map((r) => r.id) });
    }
    api.onRejoin(() => pub());
    api.onLeave((id) => { H.ps[id].in = false; if (H.phase === 'decide') { if (inside().every((i) => i in H.choices)) resolve(); else pub(); } if (ids.filter((i) => !api.player(i).left).length < 2 && H.phase !== 'roundEnd') finish(); });
    api.timeout(newRound, 800);
  }
  render();
}
