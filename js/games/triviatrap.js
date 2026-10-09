// Trivia Trap — survival trivia. Wrong answers cost a heart; every few questions you must choose a trap door.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock, hostPhase, sample, shuffled } from '../kit.js';

const Q = [
  ['What is the capital of Australia?', ['Canberra', 'Sydney', 'Melbourne', 'Perth'], 0], ['Which is the largest planet in our solar system?', ['Jupiter', 'Saturn', 'Neptune', 'Earth'], 0],
  ['How many continents are there?', ['5', '6', '7', '8'], 2], ['Which element has the symbol “O”?', ['Gold', 'Oxygen', 'Osmium', 'Oganesson'], 1], ['Who painted the Mona Lisa?', ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Van Gogh'], 0],
  ['What is the hardest natural substance?', ['Quartz', 'Steel', 'Diamond', 'Granite'], 2], ['Which is the largest ocean?', ['Atlantic', 'Pacific', 'Indian', 'Arctic'], 1], ['In which country is the Great Pyramid of Giza?', ['Mexico', 'Peru', 'Sudan', 'Egypt'], 3],
  ['How many strings does a standard guitar have?', ['4', '5', '6', '7'], 2], ['What is the smallest prime number?', ['0', '1', '2', '3'], 2], ['Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Mercury', 'Saturn'], 1],
  ['Which gas do plants absorb from the air?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], 2], ['Who wrote “Romeo and Juliet”?', ['Dickens', 'Austen', 'Twain', 'Shakespeare'], 3], ['Which animal is the tallest?', ['Elephant', 'Giraffe', 'Ostrich', 'Camel'], 1],
  ['How many players per side are on a soccer pitch?', ['9', '10', '11', '12'], 2], ['What is the currency of Japan?', ['Yen', 'Won', 'Yuan', 'Peso'], 0], ['What is the chemical formula for water?', ['CO2', 'H2O', 'NaCl', 'O2'], 1],
  ['What is the largest mammal?', ['Elephant', 'Giraffe', 'Blue whale', 'Hippo'], 2], ['Which is the fastest land animal?', ['Cheetah', 'Lion', 'Horse', 'Greyhound'], 0], ['What is the capital of Canada?', ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'], 3],
  ['At sea level, water boils at how many °C?', ['90', '100', '110', '120'], 1], ['Which is the highest mountain above sea level?', ['K2', 'Kilimanjaro', 'Everest', 'Denali'], 2], ['What is the chemical symbol for gold?', ['Au', 'Ag', 'Gd', 'Go'], 0],
  ['How many bones are in an adult human body?', ['186', '206', '226', '256'], 1], ['Which planet is famous for its rings?', ['Jupiter', 'Uranus', 'Saturn', 'Mars'], 2], ['Who is credited with formulating the laws of gravity?', ['Einstein', 'Newton', 'Tesla', 'Edison'], 1],
  ['Which country is the home of pizza?', ['Greece', 'France', 'Italy', 'Spain'], 2], ['Which gas makes up most of Earth’s atmosphere?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], 1], ['What is the smallest country in the world?', ['Monaco', 'Malta', 'Vatican City', 'San Marino'], 2],
  ['How many days are in a leap year?', ['364', '365', '366', '367'], 2], ['In which sport is a shuttlecock used?', ['Tennis', 'Badminton', 'Squash', 'Golf'], 1], ['Who was the first person to walk on the Moon?', ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'Michael Collins'], 2],
  ['Which famous ship sank in 1912?', ['Lusitania', 'Titanic', 'Bismarck', 'Endeavour'], 1], ['How many sides does a hexagon have?', ['5', '6', '7', '8'], 1], ['Which monument is in Agra, India?', ['Taj Mahal', 'Red Fort', 'Gateway of India', 'Qutub Minar'], 0],
  ['At what temperature does water freeze in Fahrenheit?', ['0', '32', '100', '212'], 1], ['Who painted “The Starry Night”?', ['Monet', 'Picasso', 'Van Gogh', 'Dalí'], 2], ['Which planet is closest to the Sun?', ['Venus', 'Mercury', 'Earth', 'Mars'], 1],
  ['What is the main ingredient of guacamole?', ['Tomato', 'Avocado', 'Lime', 'Pepper'], 1], ['How many minutes are there in a day?', ['1240', '1440', '1640', '1840'], 1], ['Which country hosted the 2016 Summer Olympics?', ['China', 'UK', 'Brazil', 'Japan'], 2],
  ['What is the capital of Japan?', ['Kyoto', 'Tokyo', 'Osaka', 'Nagoya'], 1], ['Who wrote the Harry Potter books?', ['Tolkien', 'C. S. Lewis', 'J. K. Rowling', 'Pullman'], 2], ['What is the square root of 81?', ['7', '8', '9', '10'], 2],
  ['Which vitamin does your skin make from sunlight?', ['A', 'B12', 'C', 'D'], 3], ['Which of these is a mammal?', ['Shark', 'Trout', 'Dolphin', 'Eel'], 2], ['How many hearts does an octopus have?', ['1', '2', '3', '4'], 2],
  ['Which metal is liquid at room temperature?', ['Iron', 'Mercury', 'Tin', 'Lead'], 1], ['What is the largest organ of the human body?', ['Liver', 'Heart', 'Skin', 'Lungs'], 2], ['Which planet has a Great Red Spot?', ['Mars', 'Jupiter', 'Saturn', 'Neptune'], 1],
  ['How many keys does a standard piano have?', ['66', '76', '88', '98'], 2], ['At which tournament would you see tennis on grass in London?', ['Wimbledon', 'Roland Garros', 'US Open', 'Davis Cup'], 0], ['What is the capital of Italy?', ['Milan', 'Rome', 'Venice', 'Naples'], 1],
  ['In which year did humans first land on the Moon?', ['1959', '1969', '1979', '1989'], 1], ['Which country is home to the kangaroo?', ['New Zealand', 'South Africa', 'Australia', 'Brazil'], 2], ['Which fruit is dried to make raisins?', ['Plums', 'Dates', 'Grapes', 'Figs'], 2],
  ['What is the name of Batman’s butler?', ['Jeeves', 'Alfred', 'Gordon', 'Lucius'], 1], ['Who is the Greek god of the sea?', ['Zeus', 'Hades', 'Apollo', 'Poseidon'], 3], ['What is the largest hot desert in the world?', ['Gobi', 'Kalahari', 'Sahara', 'Arabian'], 2],
  ['What colour do you get by mixing blue and yellow?', ['Purple', 'Green', 'Orange', 'Brown'], 1], ['Which animal is known to have a pouch for its young?', ['Koala', 'Wolf', 'Otter', 'Rabbit'], 0], ['How many players are on a basketball team on court?', ['4', '5', '6', '7'], 1],
];

const CSS = `
.tt-hearts { display:flex; gap:3px; }
.tt-hearts .ic { width:18px; height:18px; color:var(--red); }
.tt-hearts .ic.off { color:var(--line2); }
.tt-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; }
.tt-door { aspect-ratio:3/4; max-height:200px; border:0; border-radius:20px; cursor:pointer; background:linear-gradient(160deg, #a0522d, #5d2f10); color:#fff; font:800 44px var(--font); box-shadow:var(--e2); position:relative; }
.tt-door.sel { outline:5px solid var(--blue); }
.tt-door.dead { background:linear-gradient(160deg, #ea4335, #7d0e06); }
.tt-door.safe { background:linear-gradient(160deg, #34a853, #0b5a28); }
.tt-doors { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; }
.tt-room { display:flex; flex-direction:column; gap:8px; }
.tt-row { display:flex; align-items:center; gap:10px; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:8px 12px; }
.tt-row.out { opacity:.45; }
.tt-row .st { margin-left:auto; display:flex; gap:10px; align-items:center; font-weight:800; }
.tt-tag { font:700 12px var(--font); padding:2px 10px; border-radius:10px; }
.tt-tag.ok { background:var(--green-c); color:var(--green-d); } .tt-tag.no { background:var(--red-c); color:var(--red-d); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const total = +api.opts.questions || 12;
  const LIVES = +api.opts.lives || 3;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', n: 0, q: null, picked: null, door: null, res: null, lives: {}, scores: {}, done: new Set() };
  ids.forEach((i) => { S.lives[i] = LIVES; S.scores[i] = 0; });

  api.on('phase', (p) => {
    S.phase = p.name; clock.set(p.ms); if (p.lives) S.lives = p.lives; if (p.scores) S.scores = p.scores;
    if (p.name === 'q') { S.n = p.n; S.q = p.q; S.picked = null; S.res = null; S.done = new Set(); }
    if (p.name === 'door') { S.n = p.n; S.door = null; S.res = null; S.done = new Set(); S.q = null; }
    if (p.name === 'reveal') { S.res = p.res; const me = p.res.byId?.[api.me]; if (me) api.sfx(me.ok ? 'good' : 'bad'); }
    render();
  });
  api.on('done', (d) => { S.done = new Set(d.ids); render(); });
  api.onPlayersChanged(render);

  const hearts = (n) => h('span.tt-hearts', Array.from({ length: LIVES }, (_, i) => icon('favorite', i < n ? '' : 'off')));
  const roster = (res) => h('div.tt-room', api.players.slice().sort((a, b) => (S.lives[b.id] > 0) - (S.lives[a.id] > 0) || S.scores[b.id] - S.scores[a.id]).map((p) => {
    const r = res?.byId?.[p.id];
    return h('div.tt-row' + (S.lives[p.id] <= 0 ? '.out' : ''), avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: true }), h('span.pname', p.name + (p.id === api.me ? ' (you)' : '')), h('div.st', r ? h('span.tt-tag' + (r.ok ? '.ok' : '.no'), r.ok ? (r.bonus ? `+${r.pts} ⚡` : `+${r.pts}`) : r.text) : (S.done.has(p.id) ? h('span.tt-tag.ok', 'locked in') : null), hearts(S.lives[p.id]), h('span', { style: 'min-width:44px;text-align:right;color:var(--blue)' }, S.scores[p.id])));
  }));

  function render() {
    const dead = S.lives[api.me] <= 0;
    const parts = [h('div.kt-card', { style: 'text-align:center;padding:10px;display:flex;justify-content:center;gap:14px;align-items:center' }, h('b', `Question ${S.n}/${total}`), hearts(S.lives[api.me]), dead ? h('span.chip.red', 'Out — spectating') : null)];
    if (S.phase === 'q' && S.q) {
      parts.push(clock.el(), h('div.kt-prompt', { style: '--pc:#e5399b' }, S.q.q));
      parts.push(h('div.tt-grid', S.q.o.map((t, i) => h('button.kt-choice' + (S.picked === i ? '.sel' : ''), { disabled: dead || S.picked !== null, onclick: () => { S.picked = i; api.toHost('ans', { i }); api.sfx('click'); render(); } }, t))));
      parts.push(roster());
    } else if (S.phase === 'door') {
      parts.push(clock.el(), h('div.kt-prompt', { style: '--pc:#a0522d' }, h('small', 'Trap doors!'), 'One door is a trap. Pick a door and hope you’re safe.'));
      parts.push(h('div.tt-doors', [0, 1, 2].map((i) => h('button.tt-door' + (S.door === i ? '.sel' : ''), { disabled: dead || S.door !== null, onclick: () => { S.door = i; api.toHost('door', { i }); api.sfx('click'); render(); } }, i + 1))));
      parts.push(roster());
    } else if (S.phase === 'reveal' && S.res) {
      const r = S.res;
      if (r.door !== undefined) parts.push(h('div.tt-doors', [0, 1, 2].map((i) => h('div.tt-door' + (i === r.door ? '.dead' : '.safe'), { style: 'display:grid;place-items:center' }, i === r.door ? 'TRAP' : 'safe'))));
      else parts.push(h('div.kt-prompt', { style: '--pc:#34a853' }, h('small', 'The answer'), r.answer));
      parts.push(roster(r));
    }
    root.replaceChildren(...parts);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { n: 0, qs: sample(Q, total, rng), cur: null, ans: {}, lives: {}, scores: {}, out: [], timer: 0, phase: 'wait', deadline: 0, doorPicks: {}, t0: 0 };
    ids.forEach((i) => { H.lives[i] = LIVES; H.scores[i] = 0; });
    const live = () => ids.filter((i) => H.lives[i] > 0 && !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    function question() {
      H.n++;
      if (H.n > total || live().length <= 1) return finish();
      if (H.n % 4 === 0) return doors();
      const [q, opts, a] = H.qs[H.n - 1];
      const order = shuffled([0, 1, 2, 3], rng);
      H.cur = { q, o: order.map((i) => opts[i]), a: order.indexOf(a) };
      H.ans = {}; H.t0 = performance.now();
      hostPhase(api, H, 'q', 15000, reveal, { n: H.n, q: { q: H.cur.q, o: H.cur.o }, lives: H.lives, scores: H.scores });
    }
    function reveal() {
      clearTimeout(H.timer);
      const byId = {};
      live().forEach((id) => {
        const a = H.ans[id];
        if (a && a.i === H.cur.a) { const bonus = Math.round(100 * Math.max(0, 1 - a.t / 15000)); const pts = 100 + bonus; H.scores[id] += pts; byId[id] = { ok: true, pts, bonus: bonus > 70 }; }
        else { H.lives[id]--; if (H.lives[id] <= 0) H.out.push(id); byId[id] = { ok: false, text: a ? '✗ ' + H.cur.o[a.i] : 'too slow' }; }
      });
      api.broadcast('phase', { name: 'reveal', ms: 0, res: { answer: H.cur.o[H.cur.a], byId }, lives: H.lives, scores: H.scores });
      H.phase = 'reveal'; H.timer = setTimeout(question, 6000);
    }
    function doors() {
      H.doorPicks = {};
      hostPhase(api, H, 'door', 10000, revealDoors, { n: H.n, lives: H.lives, scores: H.scores });
    }
    function revealDoors() {
      clearTimeout(H.timer);
      const door = Math.floor(rng.next() * 3);
      const byId = {};
      live().forEach((id) => { const p = H.doorPicks[id] ?? Math.floor(rng.next() * 3); if (p === door) { H.lives[id]--; if (H.lives[id] <= 0) H.out.push(id); byId[id] = { ok: false, text: 'trapped!' }; } else { H.scores[id] += 50; byId[id] = { ok: true, pts: 50 }; } });
      api.broadcast('phase', { name: 'reveal', ms: 0, res: { door, byId }, lives: H.lives, scores: H.scores });
      H.phase = 'reveal'; H.timer = setTimeout(question, 5000);
    }
    function finish() {
      clearTimeout(H.timer);
      const alive = ids.filter((i) => H.lives[i] > 0);
      const ranking = [...alive.sort((a, b) => H.scores[b] - H.scores[a]), ...H.out.slice().reverse()].filter((v, i, arr) => arr.indexOf(v) === i).map((id) => ({ id, score: H.scores[id], note: H.lives[id] > 0 ? `${H.lives[id]} ♥ left` : 'out' }));
      api.endGame({ title: alive.length ? `${nameOf(ranking[0].id)} survived the trap!` : 'Nobody survived the trap!', subtitle: `${total} questions`, ranking, winners: [ranking[0].id] });
    }
    api.on('ans', ({ i }, from) => {
      if (H.phase !== 'q' || H.ans[from] || H.lives[from] <= 0) return;
      H.ans[from] = { i, t: performance.now() - H.t0 };
      api.broadcast('done', { ids: Object.keys(H.ans) });
      if (live().every((p) => H.ans[p])) { clearTimeout(H.timer); api.timeout(reveal, 500); }
    });
    api.on('door', ({ i }, from) => {
      if (H.phase !== 'door' || H.doorPicks[from] !== undefined || H.lives[from] <= 0) return;
      H.doorPicks[from] = i;
      api.broadcast('done', { ids: Object.keys(H.doorPicks) });
      if (live().every((p) => H.doorPicks[p] !== undefined)) { clearTimeout(H.timer); api.timeout(revealDoors, 500); }
    });
    api.timeout(question, 800);
  }
  render();
}
