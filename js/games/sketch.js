// Sketch & Guess — a skribbl.io-style drawing game.
// Host runs the turns/scores; the drawer streams drawing ops through the host to everyone.
import { h, canvasPoint, clamp } from '../util.js';
import { avatarEl } from '../avatar.js';

const W = 800, H = 600;
const COLORS = ['#000000', '#7f7f7f', '#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#d37caa', '#a0522d', '#ffb6a0', '#3a2a12'];
const SIZES = [4, 10, 20, 38];
const WORDS = `apple,banana,pizza,burger,ice cream,cake,cookie,donut,popcorn,sandwich,spaghetti,sushi,taco,watermelon,pineapple,carrot,broccoli,egg,cheese,bread,
cat,dog,horse,cow,pig,sheep,rabbit,elephant,giraffe,lion,tiger,monkey,penguin,dolphin,shark,whale,octopus,crab,fish,turtle,snake,frog,butterfly,bee,spider,ant,snail,owl,eagle,duck,chicken,bat,kangaroo,panda,bear,zebra,crocodile,dinosaur,unicorn,dragon,
house,castle,bridge,tower,tent,igloo,lighthouse,windmill,barn,church,pyramid,skyscraper,treehouse,
car,bus,train,airplane,helicopter,rocket,boat,submarine,bicycle,motorcycle,tractor,ambulance,fire truck,hot air balloon,sailboat,skateboard,scooter,
sun,moon,star,cloud,rainbow,lightning,snowman,volcano,mountain,waterfall,island,desert,beach,forest,cactus,flower,tree,mushroom,leaf,rose,sunflower,
chair,table,bed,lamp,door,window,clock,mirror,couch,bookshelf,toilet,bathtub,umbrella,candle,key,lock,scissors,hammer,saw,ladder,broom,bucket,
phone,computer,keyboard,camera,television,headphones,microphone,robot,battery,lightbulb,magnet,telescope,microscope,calculator,
guitar,piano,drum,violin,trumpet,saxophone,flute,harp,
football,basketball,tennis,golf,bowling,hockey,surfing,skiing,boxing,archery,swimming,juggling,yoga,
hat,shoe,sock,glasses,crown,ring,necklace,backpack,tie,scarf,glove,jacket,sunglasses,
pirate,ninja,wizard,vampire,ghost,zombie,witch,mermaid,astronaut,cowboy,clown,king,fairy,alien,snowflake,
pencil,book,paper airplane,balloon,gift,trophy,medal,flag,map,compass,anchor,treasure,sword,shield,bow and arrow,
bone,tooth,eye,nose,ear,hand,foot,heart,brain,skeleton,
fire,water,ice,tornado,earthquake,sandcastle,campfire,fireworks,
traffic light,stop sign,mailbox,fire hydrant,swing,slide,seesaw,carousel,ferris wheel,roller coaster,
shower,toothbrush,soap,towel,diaper,bandage,thermometer,
sleeping,running,dancing,laughing,crying,fishing,climbing,painting,cooking,reading,singing,eating,
snowboard,parachute,jetpack,bubble,spiderweb,beehive,nest,cave,garden,fence,
santa claus,pumpkin,christmas tree,easter egg,turkey,candy cane,gingerbread man,
lollipop,cupcake,pretzel,hot dog,french fries,coffee,teapot,milk,pancake,waffle,
paint brush,easel,globe,trampoline,piggy bank,vending machine,washing machine,vacuum cleaner,
bowling pin,dartboard,chess,dice,puzzle,yo-yo,kite,teddy bear,doll,lego`
  .split(/\s*,\s*/).map((w) => w.trim()).filter(Boolean);

const CSS = `
.sk-wrap { flex:1; min-height:0; container-type:inline-size; display:flex; flex-direction:column; }
.sk { flex:1; display:grid; grid-template-columns: 190px minmax(0,1fr) 270px; grid-template-rows: auto minmax(0,1fr); gap:10px; padding:10px; min-height:0; }
.sk-info { grid-column:1/-1; display:flex; align-items:center; gap:12px; background:var(--panel); box-shadow:var(--e1); border-radius:22px; padding:8px 16px; min-height:58px; }
.sk-timer { width:46px; height:46px; border-radius:50%; background:var(--blue-c); color:var(--blue-d); display:grid; place-items:center; font-weight:900; font-size:18px; flex:none; }
.sk-timer.low { background:var(--red); color:#fff; animation:pulse .6s infinite; }
.sk-hint { color:var(--on); flex:1; text-align:center; font-weight:900; font-size:clamp(20px,3.4vw,34px); letter-spacing:.18em; font-family: ui-monospace, Menlo, monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sk-hint small { display:block; font-size:12px; letter-spacing:.05em; color:var(--muted); font-family:var(--font); font-weight:700; }
.sk-round { font-size:13px; color:var(--muted); font-weight:700; text-align:right; min-width:70px; }
.sk-players { display:flex; flex-direction:column; gap:6px; overflow-y:auto; min-height:0; }
.sk-p { display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:16px; background:var(--panel); box-shadow:var(--e1); font-size:14px; }
.sk-p.g { background:var(--green-c); }
.sk-p.d { box-shadow:0 0 0 2px var(--yellow); }
.sk-p .nm { font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.sk-p .pt { font-weight:900; font-variant-numeric:tabular-nums; }
.sk-p .tag { font-size:15px; }
.sk-center { display:flex; flex-direction:column; gap:8px; min-height:0; min-width:0; align-items:center; }
.sk-canvaswrap { position:relative; flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; }
.sk-canvaswrap canvas { background:#fff; border-radius:12px; box-shadow:0 8px 24px rgba(31,41,55,.22); touch-action:none; max-width:100%; max-height:100%; aspect-ratio:${W}/${H}; width:auto; height:auto; cursor:crosshair; }
.sk-overlay { position:absolute; inset:0; display:grid; place-items:center; background:rgba(255,255,255,.93); backdrop-filter:blur(6px); border-radius:16px; text-align:center; padding:14px; z-index:3; }
.sk-words { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-top:12px; }
.sk-tools { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:center; background:var(--panel); box-shadow:var(--e1); padding:8px 12px; border-radius:22px; }
.sk-colors { display:grid; grid-template-columns:repeat(8, 24px); gap:4px; }
.sk-sw { width:26px; height:26px; border-radius:50%; border:2px solid rgba(0,0,0,.14); cursor:pointer; padding:0; }
.sk-sw.on { border-color:#fff; transform:scale(1.18); box-shadow:0 0 0 3px var(--blue); }
.sk-size { width:34px; height:34px; border-radius:10px; border:2px solid transparent; background:var(--bg2); display:grid; place-items:center; cursor:pointer; padding:0; }
.sk-size.on { border-color:var(--accent); }
.sk-size i { display:block; border-radius:50%; background:#fff; }
.sk-tool { width:38px; height:34px; border-radius:10px; border:2px solid transparent; background:var(--bg2); cursor:pointer; font-size:17px; padding:0; }
.sk-tool.on { border-color:var(--accent); background:var(--panel3); }
.sk-chat { display:flex; flex-direction:column; min-height:0; background:var(--panel); box-shadow:var(--e1); border-radius:22px; padding:10px; }
.sk-msgs { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:3px; font-size:14px; min-height:0; }
.sk-msgs .m b { font-weight:800; }
.sk-msgs .ok { color:var(--green); font-weight:800; }
.sk-msgs .close { color:#b07d00; font-weight:700; }
.sk-msgs .sys { color:var(--muted); font-style:italic; }
.sk-msgs .priv { color:var(--blue); }
.sk-chat form { display:flex; gap:6px; margin-top:6px; }
.sk-chat form input { flex:1; min-width:0; }
.sk-rv { display:flex; flex-direction:column; gap:4px; margin-top:10px; text-align:left; }
.sk-rv div { display:flex; gap:8px; align-items:center; justify-content:space-between; font-weight:700; }
@container (max-width: 900px) {
  .sk { grid-template-columns: minmax(0,1fr); grid-template-rows: auto auto minmax(0,1fr) 190px; }
  .sk-players { flex-direction:row; overflow-x:auto; overflow-y:hidden; }
  .sk-p { flex:none; }
  .sk-chat { min-height:0; }
  .sk-colors { grid-template-columns:repeat(16, 20px); }
  .sk-sw { width:20px; height:20px; }
}
`;

const lev1 = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function floodFill(ctx, sx, sy, hex) {
  const x0 = clamp(Math.round(sx), 0, W - 1), y0 = clamp(Math.round(sy), 0, H - 1);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const i0 = (y0 * W + x0) * 4;
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  if (Math.abs(tr - r) + Math.abs(tg - g) + Math.abs(tb - b) < 6) return;
  const ok = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) < 70;
  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    let xl = x;
    while (xl >= 0 && ok((y * W + xl) * 4)) xl--;
    xl++;
    let up = false, down = false;
    for (let xx = xl; xx < W && ok((y * W + xx) * 4); xx++) {
      const i = (y * W + xx) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      if (y > 0) {
        const o = ok(((y - 1) * W + xx) * 4);
        if (o && !up) { stack.push(xx, y - 1); up = true; } else if (!o) up = false;
      }
      if (y < H - 1) {
        const o = ok(((y + 1) * W + xx) * 4);
        if (o && !down) { stack.push(xx, y + 1); down = true; } else if (!o) down = false;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function start(api) {
  const rounds = +api.opts.rounds || 3;
  const teamMode = api.opts.teams === 'on';
  const TEAM = [['Blue', '#1a73e8'], ['Red', '#ea4335']];
  const teamIdx = (id) => api.players.findIndex((p) => p.id === id) % 2;
  const teamScore = (sc, t) => api.players.reduce((a, p) => a + (teamIdx(p.id) === t ? sc[p.id] || 0 : 0), 0);
  const drawMs = (+api.opts.time || 60) * 1000;
  const useHints = api.opts.hints !== 'off';

  // ---------------------------------------------------------------- shared client state
  const S = { phase: 'wait', drawer: null, turn: 0, of: 0, round: 1, hint: [], scores: {}, guessed: [], word: null, gained: {}, deadline: 0, total: 1 };
  api.players.forEach((p) => (S.scores[p.id] = 0));
  const amDrawer = () => S.drawer === api.me;

  // ---------------------------------------------------------------- DOM
  const canvas = h('canvas', { width: W, height: H });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const overlay = h('div');
  const hintEl = h('div.sk-hint');
  const timerEl = h('div.sk-timer', '–');
  const roundEl = h('div.sk-round');
  const playersEl = h('div.sk-players');
  const msgs = h('div.sk-msgs');
  const guessInput = h('input.txt', { placeholder: 'Type your guess…', maxlength: 60, autocomplete: 'off' });
  const tools = h('div.sk-tools');
  const wrap = h('div.sk-canvaswrap', canvas, overlay);
  const chat = h('div.sk-chat', msgs, h('form', {
    onsubmit: (e) => {
      e.preventDefault();
      const t = guessInput.value.trim();
      guessInput.value = '';
      if (t) api.toHost('guess', { t });
    },
  }, guessInput, h('button.btn.primary.small', { type: 'submit' }, 'Send')));
  api.root.append(h('style', CSS), h('div.sk-wrap', h('div.sk', [
    h('div.sk-info', timerEl, hintEl, roundEl),
    playersEl,
    h('div.sk-center', wrap, tools),
    chat,
  ])));

  // ---------------------------------------------------------------- canvas ops
  let ops = [];
  let color = '#000000', size = SIZES[1], tool = 'pen';

  function clearCanvas() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  function drawSeg(c, w, x1, y1, x2, y2) {
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (x1 === x2 && y1 === y2) { ctx.beginPath(); ctx.arc(x1, y1, w / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function drawStroke(op) {
    const p = op.p;
    if (p.length === 2) drawSeg(op.c, op.w, p[0], p[1], p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) drawSeg(op.c, op.w, p[i - 2], p[i - 1], p[i], p[i + 1]);
  }
  function redraw() {
    clearCanvas();
    for (const op of ops) {
      if (op.k === 's') drawStroke(op);
      else if (op.k === 'f') floodFill(ctx, op.x, op.y, op.c);
    }
  }
  function applyOp(op) {
    switch (op.k) {
      case 's': { const o = { k: 's', c: op.c, w: op.w, p: op.p.slice() }; ops.push(o); drawStroke(o); break; }
      case 'p': {
        const o = ops[ops.length - 1];
        if (!o || o.k !== 's') break;
        let lx = o.p[o.p.length - 2], ly = o.p[o.p.length - 1];
        for (let i = 0; i < op.p.length; i += 2) { drawSeg(o.c, o.w, lx, ly, op.p[i], op.p[i + 1]); lx = op.p[i]; ly = op.p[i + 1]; }
        o.p.push(...op.p);
        break;
      }
      case 'f': ops.push({ k: 'f', x: op.x, y: op.y, c: op.c }); floodFill(ctx, op.x, op.y, op.c); break;
      case 'u': ops.pop(); redraw(); break;
      case 'c': ops = []; clearCanvas(); break;
      default: break;
    }
  }
  function sendOp(op) {
    applyOp(op);
    if (api.isHost) api.broadcast('d', op, api.me);
    else api.toHost('u', op);
  }

  // ---------------------------------------------------------------- drawing input (drawer only)
  let drawing = false, pend = [], flushT = 0, lastPt = null;
  const flush = () => {
    flushT = 0;
    if (pend.length) {
      const p = pend; pend = [];
      if (api.isHost) api.broadcast('d', { k: 'p', p }, api.me); else api.toHost('u', { k: 'p', p });
    }
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (S.phase !== 'drawing' || !amDrawer()) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pt = canvasPoint(canvas, e);
    const x = Math.round(pt.x), y = Math.round(pt.y);
    if (tool === 'fill') { sendOp({ k: 'f', x, y, c: color }); api.sfx('pop'); return; }
    drawing = true;
    lastPt = [x, y];
    const c = tool === 'eraser' ? '#ffffff' : color;
    const op = { k: 's', c, w: tool === 'eraser' ? Math.max(size, 14) : size, p: [x, y] };
    applyOp(op);
    if (api.isHost) api.broadcast('d', op, api.me); else api.toHost('u', op);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const pt = canvasPoint(canvas, ev);
      const x = Math.round(pt.x), y = Math.round(pt.y);
      if (Math.abs(x - lastPt[0]) + Math.abs(y - lastPt[1]) < 2) continue;
      lastPt = [x, y];
      const o = ops[ops.length - 1];
      drawSeg(o.c, o.w, o.p[o.p.length - 2], o.p[o.p.length - 1], x, y);
      o.p.push(x, y);
      pend.push(x, y);
    }
    if (!flushT) flushT = setTimeout(flush, 35);
  });
  const endStroke = () => { if (drawing) { drawing = false; flush(); } };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  api.cleanup(() => clearTimeout(flushT));

  function renderTools() {
    if (!(S.phase === 'drawing' && amDrawer())) { tools.replaceChildren(); tools.style.display = 'none'; return; }
    tools.style.display = '';
    const sw = COLORS.map((c) => h('button.sk-sw' + (c === color && tool !== 'eraser' ? '.on' : ''), { style: { background: c }, 'aria-label': c, onclick: () => { color = c; if (tool === 'eraser') tool = 'pen'; renderTools(); } }));
    const sz = SIZES.map((s) => h('button.sk-size' + (s === size ? '.on' : ''), { onclick: () => { size = s; renderTools(); } }, h('i', { style: { width: Math.max(4, s / 2 + 2) + 'px', height: Math.max(4, s / 2 + 2) + 'px' } })));
    const tl = [['pen', '✏️'], ['fill', '🪣'], ['eraser', '🧽']].map(([t, e]) => h('button.sk-tool' + (tool === t ? '.on' : ''), { title: t, onclick: () => { tool = t; renderTools(); } }, e));
    tools.replaceChildren(h('div.sk-colors', sw), h('div.row', { style: 'gap:4px' }, sz), h('div.row', { style: 'gap:4px' }, tl),
      h('button.sk-tool', { title: 'Undo', onclick: () => sendOp({ k: 'u' }) }, '↩️'),
      h('button.sk-tool', { title: 'Clear', onclick: () => sendOp({ k: 'c' }) }, '🗑️'));
  }

  // ---------------------------------------------------------------- rendering state
  let choices = null;
  function renderHint() {
    if (S.phase === 'drawing' || S.phase === 'reveal') {
      if (amDrawer() && S.word) hintEl.replaceChildren(h('small', 'Draw this'), S.word.toUpperCase());
      else if (S.phase === 'reveal') hintEl.replaceChildren(h('small', 'The word was'), (S.word || '').toUpperCase());
      else hintEl.replaceChildren(h('small', 'Guess the word'), S.hint.join(' '));
    } else if (S.phase === 'choosing') {
      hintEl.replaceChildren(h('small', 'Get ready'), '…');
    } else hintEl.textContent = '';
  }
  function renderPlayers() {
    const list = api.players.slice().sort((a, b) => (S.scores[b.id] || 0) - (S.scores[a.id] || 0));
    playersEl.replaceChildren(...list.map((p) => h('div.sk-p' + (S.guessed.includes(p.id) ? '.g' : '') + (S.drawer === p.id ? '.d' : ''), [
      avatarEl({ ...p, online: p.online && !p.left }, 'sm' + (S.drawer === p.id ? ' bounce' : '')),
      h('div.nm', p.name + (p.id === api.me ? ' (you)' : '')),
      teamMode ? h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: TEAM[teamIdx(p.id)][1], flex: 'none' } }) : null,
      S.drawer === p.id ? h('span.tag', '✏️') : S.guessed.includes(p.id) ? h('span.tag', '✅') : null,
      h('div.pt', S.scores[p.id] || 0),
    ])));
  }
  function renderOverlay() {
    overlay.replaceChildren();
    overlay.className = '';
    if (S.phase === 'choosing') {
      const d = api.player(S.drawer);
      overlay.className = 'sk-overlay';
      if (amDrawer() && choices) {
        overlay.append(h('div', [h('h2', 'Pick a word to draw'), h('div.sk-words', choices.map((w, i) => h('button.btn.primary.big', { onclick: () => { api.toHost('pick', { i }); choices = null; renderOverlay(); } }, w)))]));
      } else {
        overlay.append(h('div', [h('div', { style: 'display:grid;place-items:center;margin-bottom:8px' }, d ? avatarEl(d, 'xl bounce') : null), h('h2', `${d?.name || 'Someone'} is choosing a word…`)]));
      }
    } else if (S.phase === 'reveal') {
      overlay.className = 'sk-overlay';
      const rows = api.players.filter((p) => S.gained[p.id] !== undefined).sort((a, b) => S.gained[b.id] - S.gained[a.id])
        .map((p) => h('div', [h('span.row', { style: 'gap:6px' }, avatarEl(p, 'xs', { still: true }), p.name), h('span', { style: S.gained[p.id] > 0 ? 'color:#38d996' : 'color:var(--muted)' }, (S.gained[p.id] > 0 ? '+' : '') + S.gained[p.id])]));
      overlay.append(h('div', { style: 'min-width:220px' }, [h('div', { style: 'color:var(--muted);font-weight:700' }, 'The word was'), h('h2', { style: 'font-size:34px' }, (S.word || '').toUpperCase()), h('div.sk-rv', rows)]));
    }
  }
  function renderInfo() {
    roundEl.replaceChildren(`Round ${Math.min(S.round, rounds)}/${rounds}`, h('br'), `Turn ${Math.min(S.turn + 1, S.of)}/${S.of}`, teamMode ? [h('br'), h('b', { style: { color: TEAM[0][1] } }, `Blue ${teamScore(S.scores, 0)}`), ' · ', h('b', { style: { color: TEAM[1][1] } }, `Red ${teamScore(S.scores, 1)}`)] : null);
    guessInput.disabled = amDrawer() && S.phase === 'drawing';
    guessInput.placeholder = amDrawer() && S.phase === 'drawing' ? 'You are drawing!' : S.guessed.includes(api.me) ? 'You got it! Chat with other guessers…' : 'Type your guess…';
  }
  function renderAll() { renderHint(); renderPlayers(); renderOverlay(); renderInfo(); renderTools(); }

  function addMsg(kind, name, text, color) {
    const near = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 50;
    msgs.append(
      kind === 'ok' ? h('div.m.ok', `✅ ${name} guessed the word!`)
        : kind === 'sys' ? h('div.m.sys', text)
          : kind === 'close' ? h('div.m.close', `🔥 "${text}" is very close!`)
            : kind === 'priv' ? h('div.m.priv', h('b', { style: { color } }, name), ': ', text)
              : h('div.m', h('b', { style: { color } }, name), ': ', text)
    );
    while (msgs.childNodes.length > 150) msgs.firstChild.remove();
    if (near) msgs.scrollTop = msgs.scrollHeight;
  }

  // timer
  api.interval(() => {
    if (S.phase === 'drawing' || S.phase === 'choosing') {
      const left = Math.max(0, Math.ceil((S.deadline - performance.now()) / 1000));
      timerEl.textContent = left;
      timerEl.classList.toggle('low', left <= 10 && S.phase === 'drawing');
      if (S.phase === 'drawing' && left <= 5 && left > 0) api.sfx('tick');
    } else { timerEl.textContent = S.phase === 'reveal' ? '⏱' : '–'; timerEl.classList.remove('low'); }
  }, 250);

  // ---------------------------------------------------------------- client handlers
  api.on('state', (s) => {
    const prevPhase = S.phase, prevTurn = S.turn;
    Object.assign(S, s);
    S.deadline = performance.now() + (s.ms || 0);
    if (s.phase === 'choosing' && (prevPhase !== 'choosing' || prevTurn !== s.turn)) {
      ops = []; clearCanvas(); choices = null;
      addMsg('sys', '', `— ${api.player(s.drawer)?.name} is drawing —`);
      api.sfx('turn');
    }
    if (s.phase === 'reveal' && prevPhase !== 'reveal') api.sfx(S.guessed.length ? 'good' : 'bad');
    renderAll();
  });
  api.on('words', (w) => { choices = w.words; renderOverlay(); });
  api.on('d', (op) => { if (!amDrawer()) applyOp(op); });
  api.on('canvas', (c) => { ops = c.ops; redraw(); });
  api.on('msg', (m) => {
    const p = api.player(m.id);
    if (m.kind === 'ok') { addMsg('ok', p?.name); if (m.id !== api.me) api.sfx('coin'); else api.sfx('good'); }
    else addMsg(m.kind, p?.name || '', m.text, p?.color);
  });
  api.onPlayersChanged(() => renderPlayers());

  // ---------------------------------------------------------------- host logic
  if (api.isHost) {
    const H = { turns: [], idx: -1, word: '', choices: [], guessed: new Map(), phase: 'wait', drawer: null, timer: 0, tick: 0, shown: new Set(), hintsShown: 0, mask: [], deadline: 0, gained: {}, scores: {} };
    api.players.forEach((p) => (H.scores[p.id] = 0));
    if (teamMode) {
      const A = api.players.filter((p) => teamIdx(p.id) === 0), B = api.players.filter((p) => teamIdx(p.id) === 1);
      const per = Math.max(A.length, B.length);
      for (let r = 0; r < rounds; r++) for (let i = 0; i < per; i++) { if (A.length) H.turns.push({ id: A[i % A.length].id, round: r + 1 }); if (B.length) H.turns.push({ id: B[i % B.length].id, round: r + 1 }); }
    } else for (let r = 0; r < rounds; r++) api.players.forEach((p) => H.turns.push({ id: p.id, round: r + 1 }));
    const live = () => api.players.filter((p) => !p.left);
    const guessers = () => live().filter((p) => p.id !== H.drawer);
    const msLeft = () => Math.max(0, H.deadline - performance.now());
    api.cleanup(() => { clearTimeout(H.timer); clearInterval(H.tick); });

    const snapshot = () => ({
      phase: H.phase, drawer: H.drawer, turn: H.idx, of: H.turns.length, round: H.turns[H.idx]?.round || 1,
      hint: H.mask, scores: H.scores, guessed: [...H.guessed.keys()], ms: msLeft(), gained: H.gained,
    });
    // the drawer always sees the word; everyone else only during the reveal
    const publish = (to) => {
      const base = snapshot();
      const pub = { ...base, word: H.phase === 'reveal' ? H.word : null };
      const priv = { ...base, word: H.word || null };
      if (to) return api.sendTo(to, 'state', to === H.drawer ? priv : pub);
      api.broadcast('state', pub, H.drawer || undefined);
      if (H.drawer) api.sendTo(H.drawer, 'state', priv);
    };
    const maskOf = (word, shown) => word.split('').map((ch, i) => (ch === ' ' ? ' ' : /[a-z0-9]/i.test(ch) ? (shown.has(i) ? ch : '_') : ch));

    function nextTurn() {
      clearTimeout(H.timer); clearInterval(H.tick);
      H.idx++;
      while (H.idx < H.turns.length && api.player(H.turns[H.idx].id).left) H.idx++;
      if (H.idx >= H.turns.length || live().length < 2) return finish();
      H.drawer = H.turns[H.idx].id;
      H.phase = 'choosing';
      H.guessed = new Map();
      H.gained = {};
      H.mask = [];
      H.word = '';
      H.shown = new Set();
      H.choices = api.rng.shuffle(WORDS).slice(0, 3);
      H.deadline = performance.now() + 15000;
      publish();
      api.sendTo(H.drawer, 'words', { words: H.choices });
      H.timer = setTimeout(() => pick(Math.floor(Math.random() * 3)), 15500);
    }
    function pick(i) {
      if (H.phase !== 'choosing') return;
      clearTimeout(H.timer);
      H.word = H.choices[i] || H.choices[0];
      H.phase = 'drawing';
      H.hintsShown = 0;
      H.mask = maskOf(H.word, H.shown);
      H.deadline = performance.now() + drawMs;
      publish();
      H.tick = setInterval(tick, 500);
    }
    function tick() {
      if (H.phase !== 'drawing') return clearInterval(H.tick);
      const frac = msLeft() / drawMs;
      const letters = H.word.split('').map((c, i) => (/[a-z0-9]/i.test(c) ? i : -1)).filter((i) => i >= 0);
      const want = useHints && letters.length >= 4 ? (frac < 0.35 ? 2 : frac < 0.6 ? 1 : 0) : 0;
      while (H.hintsShown < want) {
        const hidden = letters.filter((i) => !H.shown.has(i));
        if (hidden.length <= 2) break;
        H.shown.add(hidden[Math.floor(Math.random() * hidden.length)]);
        H.hintsShown++;
        H.mask = maskOf(H.word, H.shown);
        publish();
      }
      if (msLeft() <= 0) endTurn();
    }
    function toReveal(ms) {
      clearInterval(H.tick); clearTimeout(H.timer);
      H.phase = 'reveal';
      H.deadline = performance.now() + ms;
      publish();
      H.timer = setTimeout(nextTurn, ms + 200);
    }
    function endTurn() {
      if (H.phase !== 'drawing') return;
      const pts = [...H.guessed.values()];
      H.gained = {};
      for (const [id, p] of H.guessed) { H.scores[id] = (H.scores[id] || 0) + p; H.gained[id] = p; }
      const drawer = api.player(H.drawer);
      if (drawer && !drawer.left) {
        const dp = pts.length ? Math.round((pts.reduce((a, b) => a + b, 0) / Math.max(1, guessers().length)) * 1.2) : 0;
        H.scores[H.drawer] += dp;
        H.gained[H.drawer] = dp;
      }
      for (const p of guessers()) if (H.gained[p.id] === undefined) H.gained[p.id] = 0;
      toReveal(5000);
    }
    function finish() {
      clearTimeout(H.timer); clearInterval(H.tick);
      if (teamMode) {
        const ts = [teamScore(H.scores, 0), teamScore(H.scores, 1)];
        const win = ts[0] === ts[1] ? 0 : ts[0] > ts[1] ? 0 : 1;
        const order = api.players.slice().sort((a, b) => ((teamIdx(a.id) === win ? 0 : 1) - (teamIdx(b.id) === win ? 0 : 1)) || H.scores[b.id] - H.scores[a.id]);
        return api.endGame({ title: ts[0] === ts[1] ? 'It’s a tie!' : `${TEAM[win][0]} team wins!`, subtitle: `Blue ${ts[0]} – Red ${ts[1]}`, ranking: order.map((p) => ({ id: p.id, score: H.scores[p.id], note: TEAM[teamIdx(p.id)][0] })), winners: order.filter((p) => ts[0] === ts[1] || teamIdx(p.id) === win).map((p) => p.id) });
      }
      const ranking = api.players.slice().sort((a, b) => H.scores[b.id] - H.scores[a.id]).map((p) => ({ id: p.id, score: H.scores[p.id] }));
      api.endGame({ title: `${api.player(ranking[0].id).name} wins!`, subtitle: 'Master of the doodle', ranking });
    }

    api.on('pick', ({ i }, from) => { if (from === H.drawer && H.phase === 'choosing') pick(+i || 0); });
    api.on('u', (op, from) => { if (from === H.drawer && H.phase === 'drawing') api.broadcast('d', op, from); });
    api.on('guess', ({ t }, from) => {
      t = String(t || '').slice(0, 60).trim();
      const p = api.player(from);
      if (!t || !p || p.left) return;
      if (H.phase !== 'drawing' || from === H.drawer) {
        if (from === H.drawer && H.phase === 'drawing') return; // drawer can't chat during the turn (no spoilers)
        return api.broadcast('msg', { kind: 'chat', id: from, text: t });
      }
      if (H.guessed.has(from)) {
        [...H.guessed.keys(), H.drawer].forEach((id) => api.sendTo(id, 'msg', { kind: 'priv', id: from, text: t }));
        return;
      }
      if (norm(t) === norm(H.word)) {
        const pts = Math.round(60 + 440 * (msLeft() / drawMs) * (1 - 0.06 * H.guessed.size));
        H.guessed.set(from, Math.max(40, pts));
        api.broadcast('msg', { kind: 'ok', id: from });
        publish();
        if (H.guessed.size >= guessers().length) endTurn();
        return;
      }
      if (norm(t).length > 3 && lev1(norm(t), norm(H.word))) api.sendTo(from, 'msg', { kind: 'close', id: from, text: t });
      api.broadcast('msg', { kind: 'chat', id: from, text: t });
    });
    api.onLeave((id) => {
      if (H.phase === 'wait') return;
      if (live().length < 2) return finish();
      if (id === H.drawer && (H.phase === 'drawing' || H.phase === 'choosing')) { H.gained = {}; H.guessed = new Map(); toReveal(3000); }
      else if (H.phase === 'drawing' && guessers().length && H.guessed.size >= guessers().length) endTurn();
    });
    api.onRejoin((id) => {
      publish(id);
      if (id === H.drawer && H.phase === 'choosing') api.sendTo(id, 'words', { words: H.choices });
      api.sendTo(id, 'canvas', { ops }); // the host's own op list is authoritative
    });
    api.timeout(nextTurn, 600);
  }

  clearCanvas();
  renderAll();
}
