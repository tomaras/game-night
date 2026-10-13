// Champ Draw — draw a champion, then watch the champions battle! In every match-up both players plead
// their case and the room votes who would win. Two rounds plus a grand final. 3–10 players.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { createDrawPad } from '../drawpad.js';
import { makeClock, waiting, scorePills, shuffled } from '../kit.js';

const TITLES = ['The Snack Destroyer', 'Captain Cuddles', 'Sir Sleeps-a-Lot', 'The Midnight Moth', 'Lady Thunderpants', 'Doctor Doom Scroll', 'Baron Von Burrito', 'The Wobbling Wizard', 'Grandmaster Gloop', 'Professor Pancake', 'The Unstoppable Sock', 'Queen of the Couch', 'Mighty Mr. Moustache', 'The Dancing Dumpling', 'Lord of the Lunchbox', 'Agent Awkward', 'The Cosmic Chicken', 'Princess Pickle', 'The Laughing Landlord', 'Big Bad Bubbles', 'Sergeant Sparkles', 'The Sneaky Spaghetti', 'Count Cupcake', 'The Grumpy Goblin'];
const CATS = ['Who would win a staring contest?', 'Who is the better karaoke singer?', 'Who would survive longer on a desert island?', 'Who would make the better roommate?', 'Who would win a dance battle?', 'Who would you trust to babysit?', 'Who is the better cook?', 'Who would win at hide and seek?', 'Who would throw the best party?', 'Who would win a tug of war?', 'Who would win a pie-eating contest?', 'Who is more likely to become president?', 'Who would win a race to the moon?', 'Who tells the best bedtime stories?'];

const CSS = `
.cd-duel { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.cd-opt { border:4px solid transparent; border-radius:24px; background:var(--surface); box-shadow:var(--e1); padding:10px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; font:700 14px/1.25 var(--font); color:var(--on); text-align:center; transition:transform .12s; }
.cd-opt:hover:not(:disabled) { transform:translateY(-3px); } .cd-opt.sel { border-color:var(--blue); background:var(--blue-c); } .cd-opt.win { border-color:var(--green); background:var(--green-c); }
.cd-opt img, .cd-opt .ph { width:100%; aspect-ratio:4/3; border-radius:14px; background:#fff; object-fit:cover; display:block; } .cd-opt .ph { display:grid; place-items:center; font-size:40px; }
.cd-opt .ttl { font:800 15px var(--font); } .cd-opt .plea { font:600 14px/1.3 var(--font); color:var(--on2); font-style:italic; } .cd-opt .pct { font:800 24px var(--font); } .cd-opt .who { font:600 12px var(--font); color:var(--on2); display:flex; align-items:center; gap:4px; justify-content:center; }
.cd-task { background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:12px; display:flex; flex-direction:column; gap:8px; }
.cd-vs { display:flex; align-items:center; gap:10px; justify-content:center; font:800 14px var(--font); } .cd-vs img { width:64px; height:48px; object-fit:cover; border-radius:10px; background:#fff; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const rounds = +api.opts.rounds || 2;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, title: '', champs: {}, tasks: [], scores: {}, duel: null, res: null, voted: null, submitted: false, done: new Set(), final: false };
  let pad = null, inputs = [];

  api.on('ph', (p) => { for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k]; Object.assign(S, p); S.done = new Set(p.done || []); if (p.ms !== undefined) clock.set(p.ms); if (p.fresh) { S.submitted = false; pad = null; inputs = []; S.voted = null; } S.phase = p.name; if (p.sfx) api.sfx(p.sfx); render(); });
  api.on('duel', (d) => { S.duel = d; S.res = null; S.voted = null; S.phase = 'duel'; clock.set(d.ms); render(); });
  api.on('res', (r) => { S.res = r; S.scores = r.scores; S.phase = 'reveal'; api.sfx('win'); render(); });
  api.onPlayersChanged(render);
  const send = (type, data) => { if (S.submitted) return; S.submitted = true; api.toHost(type, data); api.sfx('good'); render(); };

  function render() {
    const me = api.me;
    const head = h('div.kt-row', { style: 'justify-content:center' }, ['plea', 'duel', 'draw'].includes(S.phase) ? h('span.chip.blue', S.final ? 'Grand final' : S.phase === 'draw' ? 'Draw your champion' : `Round ${S.round}/${rounds}`) : null, ['draw', 'plea', 'duel'].includes(S.phase) ? clock.el() : null);
    if (S.phase === 'draw') {
      if (!pad) pad = createDrawPad({ w: 480, h: 360 });
      return root.replaceChildren(head, h('div.kt-prompt', { style: '--pc:#e65100' }, h('small', 'Draw your champion'), S.title), S.submitted ? h('div.kt-card', { style: 'text-align:center' }, '✅ Champion ready!', waiting(api, ids.filter((i) => !S.done.has(i)))) : [pad.el, h('div.kt-sticky', h('button.btn.primary.big.block', { onclick: () => send('champ', { url: pad.toDataURL(380, 0.55) }) }, icon('check'), 'Done'))]);
    }
    if (S.phase === 'plea') {
      if (!S.tasks.length) return root.replaceChildren(head, h('div.kt-prompt', { style: '--pc:#6a1b9a' }, h('small', 'Champions are preparing'), 'Hang tight…'), h('div.kt-hint', 'The champions are writing their pleas…'), waiting(api, ids.filter((i) => !S.done.has(i) && S.pleaers?.includes(i))));
      if (!inputs.length) inputs = S.tasks.map(() => h('input.txt', { placeholder: 'Why does your champion win? (short!)', maxlength: 70, autocomplete: 'off' }));
      return root.replaceChildren(head, S.submitted ? h('div.kt-card', { style: 'text-align:center' }, '✅ Pleas sent!', waiting(api, ids.filter((i) => !S.done.has(i) && S.pleaers?.includes(i)))) : [
        ...S.tasks.map((t, k) => h('div.cd-task', h('div.cd-vs', h('img', { src: S.champs[me]?.url || '', alt: '' }), 'VS', h('img', { src: S.champs[t.opp]?.url || '', alt: '' })), h('div.kt-prompt', { style: '--pc:#6a1b9a;padding:14px' }, h('small', `${S.champs[me]?.title} vs ${S.champs[t.opp]?.title}`), t.cat), inputs[k])),
        h('div.kt-sticky', h('button.btn.primary.big.block', { onclick: () => send('plea', { texts: inputs.map((i) => i.value.trim() || 'Because I said so!') }) }, icon('send'), 'Send'))]);
    }
    if (S.phase === 'duel' && S.duel) {
      const d = S.duel, inDuel = d.by.includes(me);
      const opt = (k) => { const id = d.by[k === 'a' ? 0 : 1]; const c = S.champs[id] || {}; return h('button.cd-opt' + (S.voted === k ? '.sel' : ''), { disabled: inDuel || S.voted !== null, onclick: () => { S.voted = k; api.toHost('vote', { k }); api.sfx('pop'); render(); } }, c.url ? h('img', { src: c.url, alt: '' }) : h('div.ph', '❓'), h('div.ttl', c.title), h('div.plea', `“${d[k === 'a' ? 'pa' : 'pb']}”`), inDuel ? null : S.voted === k ? 'Your vote ✓' : 'Vote'); };
      return root.replaceChildren(head, h('div.kt-prompt', { style: `--pc:${S.final ? '#f9a825' : '#fb8c00'}` }, h('small', `${S.final ? 'Grand final' : 'Battle ' + (d.i + 1) + ' of ' + d.n}`), d.cat), h('div.cd-duel', opt('a'), opt('b')), h('div.kt-hint', inDuel ? 'Your champion is fighting! You can’t vote.' : S.voted ? 'Vote locked. Waiting…' : 'Tap who would win.'));
    }
    if (S.phase === 'reveal' && S.res) {
      const r = S.res, d = S.duel, tot = r.va + r.vb || 1;
      const opt = (k) => { const id = d.by[k === 'a' ? 0 : 1]; const v = k === 'a' ? r.va : r.vb, o = k === 'a' ? r.vb : r.va, c = S.champs[id] || {}; return h('div.cd-opt' + (v > o ? '.win' : ''), c.url ? h('img', { src: c.url, alt: '' }) : h('div.ph', '❓'), h('div.ttl', c.title), h('div.pct', Math.round((v / tot) * 100) + '%'), h('div.who', avatarEl(api.player(id), 'xs', { still: true }), nameOf(id), `+${k === 'a' ? r.pa : r.pb}`)); };
      return root.replaceChildren(h('div.kt-prompt', { style: '--pc:#43a047' }, h('small', S.final ? 'Grand final' : `Battle ${d.i + 1} of ${d.n}`), r.va === r.vb ? 'A draw!' : `${S.champs[d.by[r.va > r.vb ? 0 : 1]]?.title} wins!`), h('div.cd-duel', opt('a'), opt('b')), scorePills(api, S.scores));
    }
    root.replaceChildren(h('div.kt-center', 'Warming up the arena…'));
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { phase: 'wait', round: 0, champs: {}, scores: {}, subs: {}, timer: 0, battles: [], bi: 0, votes: {}, pleas: {}, titles: shuffled(TITLES, rng), cats: shuffled(CATS, rng), final: false };
    ids.forEach((id, i) => { H.scores[id] = 0; H.champs[id] = { title: H.titles[i % H.titles.length], url: '' }; });
    api.cleanup(() => clearTimeout(H.timer));
    const pubChamps = () => Object.fromEntries(ids.map((id) => [id, H.champs[id]]));
    const ph = (name, extra = {}) => { H.phase = name; api.broadcast('ph', { name, round: H.round, final: H.final, scores: H.scores, done: Object.keys(H.subs), ...extra }); };
    function startDraw() {
      H.subs = {};
      ids.forEach((id) => api.sendTo(id, 'ph', { name: 'draw', round: 0, title: H.champs[id].title, ms: 60000, fresh: true, done: [], scores: H.scores }));
      H.phase = 'draw';
      H.timer = setTimeout(endDraw, 61000);
    }
    api.on('champ', ({ url }, from) => {
      if (H.phase !== 'draw' || H.subs[from] || typeof url !== 'string' || !url.startsWith('data:image/') || url.length > 120000) return;
      H.subs[from] = 1; H.champs[from].url = url;
      if (ids.every((i) => H.subs[i] || api.player(i).left)) { clearTimeout(H.timer); H.timer = setTimeout(endDraw, 600); } else ph('draw');
    });
    function endDraw() { clearTimeout(H.timer); if (H.phase !== 'draw') return; startRound(); }
    function startRound() {
      H.round++; H.final = false; H.subs = {};
      const order = rng.shuffle(ids.slice());
      H.battles = [];
      for (let k = 0; k + 1 < order.length; k += 2) H.battles.push({ a: order[k], b: order[k + 1], cat: H.cats[H.battles.length + (H.round - 1) * 5] || CATS[0] });
      if (order.length % 2) H.battles.push({ a: order[order.length - 1], b: order[0], cat: H.cats[H.battles.length + (H.round - 1) * 5] || CATS[1] });
      startPleas();
    }
    function startPleas() {
      H.pleas = {}; H.subs = {}; H.phase = 'plea';
      const involved = [...new Set(H.battles.flatMap((b) => [b.a, b.b]))];
      H.pleaers = involved;
      const champs = pubChamps();
      involved.forEach((id) => {
        const tasks = H.battles.map((b, bi) => ({ b, bi })).filter((x) => x.b.a === id || x.b.b === id).map(({ b, bi }) => ({ bi, cat: b.cat, opp: b.a === id ? b.b : b.a }));
        api.sendTo(id, 'ph', { name: 'plea', round: H.round, final: H.final, tasks, champs, pleaers: involved, ms: 35000, fresh: true, done: [], scores: H.scores });
      });
      ids.filter((i) => !involved.includes(i)).forEach((id) => api.sendTo(id, 'ph', { name: 'plea', round: H.round, final: H.final, tasks: [], champs, pleaers: involved, ms: 35000, fresh: true, done: [], scores: H.scores }));
      H.timer = setTimeout(endPleas, 36000);
    }
    api.on('plea', ({ texts }, from) => {
      if (H.phase !== 'plea' || H.subs[from] || !Array.isArray(texts)) return;
      H.subs[from] = 1;
      const mine = H.battles.map((b, bi) => ({ b, bi })).filter((x) => x.b.a === from || x.b.b === from);
      mine.forEach(({ b, bi }, k) => { (H.pleas[bi] = H.pleas[bi] || {})[from] = String(texts[k] || 'Because I said so!').slice(0, 70); });
      if (H.pleaers.every((i) => H.subs[i] || api.player(i).left)) { clearTimeout(H.timer); H.timer = setTimeout(endPleas, 600); } else api.broadcast('ph', { name: 'plea', done: Object.keys(H.subs), ms: undefined });
    });
    function endPleas() {
      clearTimeout(H.timer);
      if (H.phase !== 'plea') return;
      H.bi = 0; nextBattle();
    }
    function nextBattle() {
      const b = H.battles[H.bi];
      H.votes = {}; H.phase = 'duel';
      const pl = H.pleas[H.bi] || {};
      api.broadcast('duel', { i: H.bi, n: H.battles.length, by: [b.a, b.b], cat: b.cat, pa: pl[b.a] || 'Because I said so!', pb: pl[b.b] || 'Because I said so!', ms: 25000, final: H.final });
      clearTimeout(H.timer);
      H.timer = setTimeout(reveal, 25500);
    }
    api.on('vote', ({ k }, from) => {
      if (H.phase !== 'duel' || (k !== 'a' && k !== 'b')) return;
      const b = H.battles[H.bi];
      if (from === b.a || from === b.b) return;
      H.votes[from] = k;
      const voters = ids.filter((i) => i !== b.a && i !== b.b && !api.player(i).left);
      if (voters.every((i) => H.votes[i])) { clearTimeout(H.timer); H.timer = setTimeout(reveal, 600); }
    });
    function reveal() {
      clearTimeout(H.timer);
      if (H.phase !== 'duel') return;
      H.phase = 'reveal';
      const b = H.battles[H.bi], mult = H.final ? 2 : 1;
      const va = Object.values(H.votes).filter((v) => v === 'a').length, vb = Object.values(H.votes).filter((v) => v === 'b').length;
      const pa = (va * 100 + (va > vb ? 100 : 0)) * mult, pb = (vb * 100 + (vb > va ? 100 : 0)) * mult;
      H.scores[b.a] += pa; H.scores[b.b] += pb;
      api.broadcast('res', { va, vb, pa, pb, scores: H.scores });
      H.timer = setTimeout(() => {
        H.bi++;
        if (H.bi < H.battles.length) return nextBattle();
        if (H.final) return finish();
        if (H.round < rounds) return startRound();
        startFinal();
      }, 6500);
    }
    function startFinal() {
      H.final = true; H.round++;
      const top = ids.slice().sort((a, b) => H.scores[b] - H.scores[a] || rng.next() - 0.5).slice(0, 2);
      H.battles = [{ a: top[0], b: top[1], cat: 'Who is the ULTIMATE champion?' }];
      startPleas();
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: H.champs[id].title }));
      const top = ranking[0].score;
      api.endGame({ title: `${ranking.filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} crowned champion!`, subtitle: ranking[0].note, ranking, winners: ranking.filter((r) => r.score === top).map((r) => r.id) });
    }
    api.onRejoin(() => {});
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 3 && H.phase !== 'wait') finish(); });
    api.timeout(startDraw, 800);
  }
  render();
}
