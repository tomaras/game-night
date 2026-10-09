// Block Battle — 2–6 players, falling-block versus. Everyone plays their own board locally; clearing lines
// sends garbage to a random opponent via the host. Last board standing wins.
import { h, dpad, makeRng } from '../util.js';
import { avatarEl } from '../avatar.js';

const COLS = 10, ROWS = 22, VIS = 20; // 2 hidden rows on top
const PIECES = {
  I: { c: 1, m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  O: { c: 2, m: [[1, 1], [1, 1]] },
  T: { c: 3, m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  S: { c: 4, m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  Z: { c: 5, m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  J: { c: 6, m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  L: { c: 7, m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
};
const COLORS = ['', '#22d3ee', '#facc15', '#a855f7', '#4ade80', '#f87171', '#3b82f6', '#fb923c', '#6b7280'];
const rot = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
const ATTACK = [0, 0, 1, 2, 4];

const CSS = `
.bk { flex:1; display:flex; gap:14px; padding:8px; min-height:0; justify-content:center; align-items:flex-start; flex-wrap:wrap; overflow-y:auto; }
.bk-me { display:flex; gap:10px; align-items:flex-start; }
.bk-board { position:relative; }
.bk canvas { display:block; border-radius:8px; background:#0c0e18; box-shadow:0 8px 22px rgba(31,41,55,.22); }
.bk-side { display:flex; flex-direction:column; gap:8px; width:96px; }
.bk-box { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:6px; text-align:center; font-size:12px; font-weight:800; color:var(--muted); }
.bk-box b { display:block; color:#fff; font-size:18px; font-variant-numeric:tabular-nums; }
.bk-garb { position:absolute; left:-9px; bottom:0; width:6px; background:#ef4444; border-radius:3px; transition:height .15s; }
.bk-opps { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; max-width:560px; }
.bk-opp { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:5px; display:flex; flex-direction:column; align-items:center; gap:3px; position:relative; }
.bk-opp.dead { opacity:.4; }
.bk-opp .nm { font-size:12px; font-weight:800; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center; gap:4px; }
.bk-banner { position:absolute; inset:0; display:grid; place-items:center; font-size:64px; font-weight:900; text-shadow:0 4px 14px rgba(0,0,0,.8); pointer-events:none; }
.bk-box canvas { max-width:100%; height:auto; }
@media (max-width:640px) {
  .bk { flex-wrap:nowrap; gap:8px; justify-content:flex-start; padding:6px; }
  .bk-side { width:62px; gap:5px; } .bk-box { padding:3px; font-size:10px; } .bk-box b { font-size:14px; }
  .bk-opps { width:112px; max-width:112px; gap:6px; align-content:flex-start; justify-content:flex-start; }
  .bk-opp { padding:3px; gap:2px; } .bk-opp canvas { width:48px; height:96px; }
  .bk-opp .nm { max-width:50px; font-size:10px; } .bk-opp .nm .av { display:none; }
}
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const others = ids.filter((id) => id !== api.me);

  // ------------------------------------------------------------ my board
  const rb = api.root.getBoundingClientRect();
  const touchH = matchMedia('(pointer: coarse)').matches ? 170 : 0;
  const availH = (rb.height || window.innerHeight - 160) - touchH - 24;
  const narrow = (rb.width || window.innerWidth) < 640;
  const availW = (rb.width || window.innerWidth) - (narrow ? 62 + (others.length ? 112 : 0) + 40 : 150);
  const CELL = Math.max(12, Math.min(30, Math.floor(Math.min(availH / VIS, availW / COLS))));
  const bcv = h('canvas', { width: COLS * CELL, height: VIS * CELL });
  const bctx = bcv.getContext('2d');
  const holdCv = h('canvas', { width: 80, height: 56 });
  const nextCv = h('canvas', { width: 80, height: 3 * 52 });
  const garbEl = h('div.bk-garb', { style: 'height:0' });
  const stats = { lines: h('b', '0'), level: h('b', '1'), score: h('b', '0') };
  const banner = h('div.bk-banner');
  const oppEls = {};
  const oppCv = {};
  for (const id of others) {
    const cv = h('canvas', { width: 80, height: 160 });
    oppCv[id] = cv;
    const p = api.player(id);
    oppEls[id] = h('div.bk-opp', h('div.nm', avatarEl(p, 'xs', { still: true }), p.name), cv);
  }
  const touch = dpad((k, d) => keyEvent(k, d), { actions: [{ label: '⤓', key: ' ' }, { label: '↺', key: 'z' }, { label: '⎘', key: 'c' }] });
  api.root.append(h('style', CSS), h('div.bk', [
    h('div.bk-me', [
      h('div.bk-board', bcv, garbEl, banner),
      h('div.bk-side', [h('div.bk-box', 'HOLD', holdCv), h('div.bk-box', 'NEXT', nextCv), h('div.bk-box', 'Lines', stats.lines), h('div.bk-box', 'Level', stats.level)]),
    ]),
    h('div.bk-opps', Object.values(oppEls)),
  ]), touch);

  const B = { grid: Array.from({ length: ROWS }, () => new Array(COLS).fill(0)), cur: null, hold: null, canHold: true, queue: [], bag: [], lines: 0, score: 0, pending: 0, combo: -1, alive: false, started: false, last: 0, grav: 0, lock: 0, resets: 0 };
  const rng = makeRng(api.seed ^ (api.me.charCodeAt(1) * 7919));
  const nextType = () => { if (!B.bag.length) B.bag = rng.shuffle(Object.keys(PIECES)); return B.bag.pop(); };
  const fits = (m, px, py) => {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) if (m[y][x]) {
      const gx = px + x, gy = py + y;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
      if (gy >= 0 && B.grid[gy][gx]) return false;
    }
    return true;
  };
  function spawn(type) {
    const m = PIECES[type].m.map((r) => r.slice());
    B.cur = { t: type, m, x: Math.floor((COLS - m[0].length) / 2), y: type === 'I' ? -1 : 0 };
    B.canHold = true; B.lock = 0; B.resets = 0;
    if (!fits(m, B.cur.x, B.cur.y)) die();
  }
  function nextPiece() {
    while (B.queue.length < 5) B.queue.push(nextType());
    spawn(B.queue.shift());
    drawSide();
  }
  const ghostY = () => { let y = B.cur.y; while (fits(B.cur.m, B.cur.x, y + 1)) y++; return y; };
  function move(dx) { if (B.cur && fits(B.cur.m, B.cur.x + dx, B.cur.y)) { B.cur.x += dx; touchLock(); return true; } return false; }
  function touchLock() { if (B.resets < 15) { B.lock = 0; B.resets++; } }
  function rotate(dir) {
    if (!B.cur || B.cur.t === 'O') return;
    let m = B.cur.m;
    m = dir > 0 ? rot(m) : rot(rot(rot(m)));
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]) {
      if (fits(m, B.cur.x + dx, B.cur.y + dy)) { B.cur.m = m; B.cur.x += dx; B.cur.y += dy; touchLock(); api.sfx('click'); return; }
    }
  }
  function softDrop() { if (B.cur && fits(B.cur.m, B.cur.x, B.cur.y + 1)) { B.cur.y++; B.score += 1; return true; } return false; }
  function hardDrop() { if (!B.cur) return; const y = ghostY(); B.score += (y - B.cur.y) * 2; B.cur.y = y; lockPiece(); api.sfx('drop'); }
  function doHold() {
    if (!B.cur || !B.canHold) return;
    const t = B.cur.t;
    if (B.hold) { const h2 = B.hold; B.hold = t; spawn(h2); } else { B.hold = t; nextPiece(); }
    B.canHold = false; drawSide();
  }
  function lockPiece() {
    const { m, x, y, t } = B.cur;
    let over = true;
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c]) {
      if (y + r >= 0) B.grid[y + r][x + c] = PIECES[t].c;
      if (y + r >= 2) over = false;
    }
    B.cur = null;
    // clear lines
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (B.grid[r].every(Boolean)) { B.grid.splice(r, 1); B.grid.unshift(new Array(COLS).fill(0)); cleared++; r++; }
    }
    if (cleared) {
      B.combo++;
      B.lines += cleared;
      B.score += [0, 100, 300, 500, 800][cleared] * (1 + Math.floor(B.lines / 10));
      let atk = ATTACK[cleared] + (B.combo >= 2 ? 1 : 0);
      if (cleared === 4) api.sfx('win'); else api.sfx('line');
      // cancel incoming garbage first
      const cancel = Math.min(B.pending, atk);
      B.pending -= cancel; atk -= cancel;
      if (atk > 0) api.toHost('atk', { n: atk });
    } else {
      B.combo = -1;
      if (B.pending > 0) {
        addGarbage(B.pending);
        B.pending = 0;
      }
    }
    stats.lines.textContent = B.lines; stats.level.textContent = Math.floor(B.lines / 10) + 1;
    garbEl.style.height = B.pending * CELL + 'px';
    if (over || B.grid[0].some(Boolean) || B.grid[1].some(Boolean)) { die(); return; }
    sendBoard(true);
    if (B.alive) nextPiece();
  }
  function addGarbage(n) {
    const hole = Math.floor(Math.random() * COLS);
    for (let i = 0; i < n; i++) {
      B.grid.shift();
      B.grid.push(Array.from({ length: COLS }, (_, c) => (c === hole ? 0 : 8)));
    }
    if (B.grid.slice(0, 2).some((r) => r.some(Boolean))) die();
    api.sfx('bump');
  }
  function die() {
    if (!B.alive) return;
    B.alive = false; B.cur = null;
    api.sfx('lose');
    banner.textContent = '💀';
    api.toHost('dead', { lines: B.lines, score: B.score });
    sendBoard(true);
  }

  // ------------------------------------------------------------ drawing
  function cell(ctx, x, y, s, col, a = 1) {
    ctx.globalAlpha = a;
    ctx.fillStyle = col; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x, y, s, Math.max(2, s * 0.14)); ctx.fillRect(x, y, Math.max(2, s * 0.14), s);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + s - Math.max(2, s * 0.14), s, Math.max(2, s * 0.14)); ctx.fillRect(x + s - Math.max(2, s * 0.14), y, Math.max(2, s * 0.14), s);
    ctx.globalAlpha = 1;
  }
  function drawBoard() {
    const c = bctx;
    c.fillStyle = '#0c0e18'; c.fillRect(0, 0, bcv.width, bcv.height);
    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { c.beginPath(); c.moveTo(x * CELL, 0); c.lineTo(x * CELL, VIS * CELL); c.stroke(); }
    for (let y = 1; y < VIS; y++) { c.beginPath(); c.moveTo(0, y * CELL); c.lineTo(COLS * CELL, y * CELL); c.stroke(); }
    for (let r = 2; r < ROWS; r++) for (let q = 0; q < COLS; q++) if (B.grid[r][q]) cell(c, q * CELL, (r - 2) * CELL, CELL, COLORS[B.grid[r][q]], B.alive ? 1 : 0.5);
    if (B.cur) {
      const gy = ghostY();
      B.cur.m.forEach((row, r) => row.forEach((v, q) => { if (v) { if (gy + r >= 2) cell(c, (B.cur.x + q) * CELL, (gy + r - 2) * CELL, CELL, COLORS[PIECES[B.cur.t].c], 0.22); } }));
      B.cur.m.forEach((row, r) => row.forEach((v, q) => { if (v && B.cur.y + r >= 2) cell(c, (B.cur.x + q) * CELL, (B.cur.y + r - 2) * CELL, CELL, COLORS[PIECES[B.cur.t].c]); }));
    }
  }
  function miniPiece(ctx, t, ox, oy, s) {
    const m = PIECES[t].m;
    m.forEach((row, r) => row.forEach((v, q) => { if (v) cell(ctx, ox + q * s, oy + r * s, s, COLORS[PIECES[t].c]); }));
  }
  function drawSide() {
    const hc = holdCv.getContext('2d'); hc.clearRect(0, 0, 80, 56);
    if (B.hold) miniPiece(hc, B.hold, 40 - PIECES[B.hold].m[0].length * 7, 10, 14);
    const nc = nextCv.getContext('2d'); nc.clearRect(0, 0, 80, 160);
    B.queue.slice(0, 3).forEach((t, i) => miniPiece(nc, t, 40 - PIECES[t].m[0].length * 7, 4 + i * 50, 14));
  }
  const oppBoards = {};
  api.on('b', (m) => { oppBoards[m.id] = m; if (oppEls[m.id]) oppEls[m.id].classList.toggle('dead', !m.a); });
  function drawOpps() {
    for (const id of others) {
      const m = oppBoards[id];
      const c = oppCv[id].getContext('2d');
      c.fillStyle = '#0c0e18'; c.fillRect(0, 0, 80, 160);
      if (!m) continue;
      const s = 8;
      for (let r = 0; r < VIS; r++) for (let q = 0; q < COLS; q++) { const v = +m.b[r * COLS + q]; if (v) cell(c, q * s, r * s, s, COLORS[v], m.a ? 1 : 0.4); }
      if (!m.a) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, 80, 160); c.font = '30px sans-serif'; c.textAlign = 'center'; c.fillText('💀', 40, 90); }
    }
  }
  let lastSend = 0;
  function sendBoard(force) {
    const now = performance.now();
    if (!force && now - lastSend < 200) return;
    lastSend = now;
    const rows = B.grid.slice(2);
    const cells = rows.map((r) => r.join('')).join('');
    const withCur = B.cur ? cells.split('') : null;
    if (withCur) B.cur.m.forEach((row, r) => row.forEach((v, q) => { const y = B.cur.y + r - 2; if (v && y >= 0 && y < VIS) withCur[y * COLS + B.cur.x + q] = PIECES[B.cur.t].c; }));
    api.toHost('board', { b: withCur ? withCur.join('') : cells, a: B.alive ? 1 : 0 });
  }

  // ------------------------------------------------------------ input (DAS/ARR)
  const held = new Set();
  const hk = { left: 0, right: 0, dir: 0 };
  function keyEvent(k, down) {
    if (k === null) { held.clear(); return; }
    if (down) {
      if (!held.has(k)) {
        held.add(k);
        if (!B.alive || !B.cur) return;
        if (k === 'ArrowLeft' || k === 'a') { move(-1); hk.left = performance.now() + 150; hk.dir = -1; }
        else if (k === 'ArrowRight' || k === 'd') { move(1); hk.right = performance.now() + 150; hk.dir = 1; }
        else if (k === 'ArrowUp' || k === 'x' || k === 'w') rotate(1);
        else if (k === 'z') rotate(-1);
        else if (k === ' ') hardDrop();
        else if (k === 'c' || k === 'Shift') doHold();
      }
    } else { held.delete(k); }
  }
  api.listen(window, 'keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    keyEvent(k, true);
  });
  api.listen(window, 'keyup', (e) => keyEvent(e.key.length === 1 ? e.key.toLowerCase() : e.key, false));
  api.listen(window, 'blur', () => keyEvent(null));

  // ------------------------------------------------------------ main loop
  api.raf((dt, now) => {
    if (B.started && B.alive && B.cur) {
      const t = performance.now();
      // horizontal auto-repeat
      const left = held.has('ArrowLeft') || held.has('a'), right = held.has('ArrowRight') || held.has('d');
      if (left && !right && t > hk.left) { move(-1); hk.left = t + 45; }
      if (right && !left && t > hk.right) { move(1); hk.right = t + 45; }
      const soft = held.has('ArrowDown') || held.has('s');
      const level = Math.floor(B.lines / 10);
      const interval = soft ? 35 : Math.max(70, 780 - level * 65);
      B.grav += dt * 1000;
      while (B.grav >= interval) {
        B.grav -= interval;
        if (!softDrop()) break;
        if (soft) B.score += 0;
      }
      if (B.cur && !fits(B.cur.m, B.cur.x, B.cur.y + 1)) {
        B.lock += dt * 1000;
        if (B.lock > 450) lockPiece();
      } else B.lock = 0;
      sendBoard(false);
    }
    stats.score.textContent = B.score;
    drawBoard(); drawOpps();
  });

  // ------------------------------------------------------------ messages
  api.on('cd', (m) => { banner.textContent = m.n > 0 ? String(m.n) : 'GO!'; api.sfx(m.n > 0 ? 'tick' : 'good'); if (m.n === 0) api.timeout(() => { if (B.alive) banner.textContent = ''; }, 700); });
  api.on('go', () => { B.alive = true; B.started = true; B.last = performance.now(); nextPiece(); });
  api.on('garb', (g) => {
    if (!B.alive) return;
    B.pending += g.n;
    garbEl.style.height = Math.min(VIS, B.pending) * CELL + 'px';
    api.sfx('bad');
  });
  api.on('over', () => { B.alive = false; });

  // ------------------------------------------------------------ host
  if (api.isHost) {
    const G = { alive: new Set(ids), order: [], over: false, stats: {} };
    api.on('board', (m, from) => { api.broadcast('b', { id: from, b: m.b, a: m.a }, from); });
    api.on('atk', ({ n }, from) => {
      if (G.over || !G.alive.has(from)) return;
      const targets = [...G.alive].filter((id) => id !== from);
      if (!targets.length) return;
      const t = targets[Math.floor(Math.random() * targets.length)];
      api.sendTo(t, 'garb', { n: Math.min(8, Math.max(0, Math.floor(+n))) });
    });
    function out(id, st) {
      if (!G.alive.delete(id)) return;
      G.order.push(id);
      if (st) G.stats[id] = st;
      if (G.alive.size <= 1 && ids.length > 1 && !G.over) {
        G.over = true;
        const w = [...G.alive][0];
        const ranking = [...(w ? [w] : []), ...G.order.slice().reverse()].map((id2) => ({ id: id2, score: G.stats[id2]?.lines ?? '—', note: 'lines' }));
        api.broadcast('over', {});
        api.timeout(() => api.endGame({ title: w ? `${api.player(w).name} is the last one standing!` : 'Everyone topped out!', ranking, winners: w ? [w] : [] }), 1800);
      }
    }
    api.on('dead', (st, from) => out(from, st));
    api.onLeave((id) => out(id));
    let n = 3;
    api.timeout(function cd() {
      api.broadcast('cd', { n });
      if (n-- > 0) api.timeout(cd, 900); else api.broadcast('go', {});
    }, 700);
  }
}
