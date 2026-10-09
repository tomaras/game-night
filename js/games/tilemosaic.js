// Tile Mosaic — an Azul-style tile-drafting game. Take tiles from the workshops, fill your pattern lines,
// and decorate your palace wall. 2–4 players. Careful: leftover tiles fall on the floor and cost points!
import { h } from '../util.js';
import { avatarEl } from '../avatar.js';

const COL = ['#1e88e5', '#fbc02d', '#e53935', '#8e24aa', '#26a69a'];
const SYM = ['●', '▲', '■', '◆', '★'];
const NAMES = ['blue', 'yellow', 'red', 'purple', 'teal'];
const PEN = [1, 1, 2, 2, 2, 3, 3];
const wallColor = (r, c) => (c - r + 5) % 5;
const wallCol = (r, color) => (color + r) % 5;

const CSS = `
.az { gap:8px; --ts:clamp(26px, 7.8vw, 40px); }
.az-pl { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scrollbar-width:none; }
.az-p { flex:none; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:5px 12px 5px 6px; display:flex; align-items:center; gap:8px; border:3px solid transparent; font:700 12px var(--font); cursor:pointer; }
.az-p.turn { border-color:var(--yellow); background:var(--yellow-c); } .az-p.view { box-shadow:0 0 0 3px var(--blue); } .az-p b { font:800 18px var(--font); color:var(--blue); }
.az-fac { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; background:linear-gradient(160deg,#e3f2fd,#bbdefb); border-radius:24px; padding:10px; }
.az-f { width:calc(var(--ts) * 2 + 18px); height:calc(var(--ts) * 2 + 18px); border-radius:50%; background:#fff; box-shadow:var(--e1); display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:8px; place-items:center; } .az-f.empty { opacity:.35; box-shadow:none; background:rgba(255,255,255,.4); }
.az-ctr { min-width:calc(var(--ts) * 2 + 18px); min-height:calc(var(--ts) * 2 + 18px); border-radius:26px; background:rgba(255,255,255,.7); padding:8px; display:flex; flex-wrap:wrap; gap:4px; align-content:flex-start; flex:1 1 140px; box-shadow:inset 0 2px 6px rgba(0,0,0,.08); }
.az-t { width:var(--ts); height:var(--ts); border-radius:20%; background:var(--tc); color:rgba(255,255,255,.9); display:grid; place-items:center; font:800 calc(var(--ts) * .5) var(--font); box-shadow:inset 0 -3px 0 rgba(0,0,0,.25); user-select:none; cursor:pointer; transition:transform .12s; }
.az-t.sel { outline:3px solid #212121; outline-offset:1px; transform:scale(1.1); } .az-t.dim { opacity:.35; } .az-t.noclick { cursor:default; } .az-t.mk { background:#fff; color:#212121; border:2px solid #212121; box-shadow:none; font-size:calc(var(--ts) * .4); }
.az-t.ghost { background:color-mix(in srgb, var(--tc) 22%, #f1f3f4); color:color-mix(in srgb, var(--tc) 60%, #fff); box-shadow:none; } .az-t.new { animation:pop .5s; }
.az-board { background:var(--surface); box-shadow:var(--e1); border-radius:24px; padding:10px; display:flex; flex-direction:column; gap:8px; align-items:center; }
.az-main { display:flex; gap:12px; align-items:flex-start; justify-content:center; }
.az-lines, .az-wall { display:flex; flex-direction:column; gap:4px; } .az-lines > div { display:flex; gap:4px; justify-content:flex-end; padding:2px; border-radius:12px; border:2px solid transparent; } .az-lines > div.can { border-color:var(--green); background:var(--green-c); cursor:pointer; animation:pulse 1s infinite; }
.az-wall > div { display:flex; gap:4px; }
.az-floor { display:flex; gap:4px; padding:4px 6px; border-radius:12px; border:2px solid transparent; align-items:flex-start; } .az-floor.can { border-color:var(--red); background:var(--red-c); cursor:pointer; }
.az-floor .slot { display:flex; flex-direction:column; align-items:center; font:700 10px var(--font); color:var(--red); gap:2px; } .az-floor .sq { width:var(--ts); height:var(--ts); border-radius:20%; background:var(--s2); display:grid; place-items:center; }
.az-score { font:800 15px var(--font); } .az-hint { text-align:center; font:700 14px var(--font); min-height:20px; }
.az-sum { background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:8px 12px; display:flex; align-items:center; gap:8px; font:700 14px var(--font); } .az-sum .d { margin-left:auto; text-align:right; font:800 16px var(--font); } .az-sum small { display:block; color:var(--on2); font:600 11px var(--font); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const root = h('div.kt.wide.az');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, facs: [], center: [], marker: true, bag: 0, turn: null, boards: {}, scores: {}, sel: null, view: null, log: '', sum: null };

  api.on('state', (s) => { Object.assign(S, s); if (s.phase !== 'play' || S.turn !== api.me) S.sel = null; if (!S.view || !ids.includes(S.view)) S.view = api.me; if (s.sfx) api.sfx(s.sfx); render(); });
  api.onPlayersChanged(render);

  const tile = (c, cls = '', click) => h('div.az-t' + (cls ? '.' + cls.split(' ').filter(Boolean).join('.') : ''), { style: `--tc:${COL[c]}`, title: NAMES[c], onclick: click || null }, SYM[c]);
  const myTurn = () => S.turn === api.me && S.phase === 'play';
  const pick = (src, idx, color) => { if (!myTurn()) return api.toast(S.phase === 'play' ? `It’s ${nameOf(S.turn)}’s turn` : ''); S.sel = S.sel && S.sel.src === src && S.sel.idx === idx && S.sel.color === color ? null : { src, idx, color }; api.sfx('pop'); render(); };
  const selCount = () => { const s = S.sel; if (!s) return 0; return (s.src === 'c' ? S.center : S.facs[s.idx] || []).filter((x) => x === s.color).length; };
  function place(line) { const s = S.sel; if (!s) return; api.toHost('take', { src: s.src, idx: s.idx, color: s.color, line }); S.sel = null; render(); }
  const canLine = (b, i) => { const s = S.sel; if (!s) return false; const L = b.lines[i]; if (L.length >= i + 1) return false; if (L.length && L[0] !== s.color) return false; return !b.wall[i][wallCol(i, s.color)]; };

  function boardEl(id, interactive) {
    const b = S.boards[id];
    if (!b) return h('div');
    const lines = h('div.az-lines', b.lines.map((L, i) => h('div' + (interactive && canLine(b, i) ? '.can' : ''), { onclick: interactive && canLine(b, i) ? () => place(i) : null },
      Array.from({ length: i + 1 }, (_, k) => { const slot = i - k; return L[slot] !== undefined ? tile(L[slot], 'noclick') : h('div.az-t.ghost.noclick', { style: '--tc:#9aa0a6' }); }))));
    const wall = h('div.az-wall', b.wall.map((row, r) => h('div', row.map((has, c) => (has ? tile(wallColor(r, c), 'noclick') : h('div.az-t.ghost.noclick', { style: `--tc:${COL[wallColor(r, c)]}` }, SYM[wallColor(r, c)]))))));
    const floorT = [...(b.marker ? ['m'] : []), ...b.floor];
    const floor = h('div.az-floor' + (interactive && S.sel ? '.can' : ''), { onclick: interactive && S.sel ? () => place('floor') : null }, PEN.map((p, i) => h('div.slot', h('div.sq', floorT[i] === 'm' ? h('div.az-t.mk.noclick', '1') : floorT[i] !== undefined ? tile(floorT[i], 'noclick') : ''), '−' + p)));
    return h('div.az-board', h('div.kt-row', { style: 'justify-content:center;gap:6px' }, avatarEl(api.player(id), 'sm', { still: true }), h('b', nameOf(id) + (id === api.me ? ' (you)' : '')), h('span.az-score', `${S.scores[id] || 0} pts`)), h('div.az-main', lines, wall), floor);
  }

  function render() {
    const me = api.me;
    if (S.phase === 'roundEnd' && S.sum) {
      root.replaceChildren(h('div.kt-prompt', { style: '--pc:#1e88e5' }, h('small', S.sum.final ? 'Final scoring' : `Round ${S.round} complete`), S.sum.final ? '🏛️ Palace complete!' : 'Tiling the wall…'),
        ...ids.slice().sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)).map((id) => h('div.az-sum', avatarEl(api.player(id), 'sm', { still: true }), h('div', nameOf(id) + (id === me ? ' (you)' : ''), h('small', S.sum.d[id].txt)), h('div.d', S.scores[id], h('small', (S.sum.d[id].gain >= 0 ? '+' : '') + S.sum.d[id].gain)))),
        h('div.az-hint', S.sum.final ? '' : 'Next round starting soon…'));
      return;
    }
    const pl = h('div.az-pl', ids.map((id) => h('div.az-p' + (S.turn === id && S.phase === 'play' ? '.turn' : '') + (S.view === id ? '.view' : ''), { onclick: () => { S.view = id; render(); } }, avatarEl(api.player(id), 'sm', { still: true }), nameOf(id).slice(0, 10), h('b', S.scores[id] || 0))));
    const s = S.sel;
    const facs = h('div.az-fac', S.facs.map((f, i) => h('div.az-f' + (f.length ? '' : '.empty'), f.map((c) => tile(c, s && s.src === 'f' && s.idx === i && s.color === c ? 'sel' : s && (s.src !== 'f' || s.idx !== i || s.color !== c) ? 'dim' : '', () => pick('f', i, c))))),
      h('div.az-ctr', S.marker ? h('div.az-t.mk.noclick', { title: 'First-player marker' }, '1') : null, [...S.center].sort().map((c) => tile(c, s && s.src === 'c' && s.color === c ? 'sel' : s && !(s.src === 'c' && s.color === c) ? 'dim' : '', () => pick('c', 0, c))), !S.center.length && !S.marker ? h('span.muted', { style: 'padding:6px' }, 'Center') : null));
    const head = h('div.kt-row', { style: 'justify-content:center' }, h('span.chip.blue', `Round ${S.round}`), h('span.chip.yellow', `Bag: ${S.bag}`));
    let hint = myTurn() ? (s ? `Place ${selCount()} ${NAMES[s.color]} tile${selCount() > 1 ? 's' : ''} on a green line (or the floor)` : 'Your turn — tap a tile to take every tile of that colour') : `${nameOf(S.turn)} is choosing…`;
    if (S.phase !== 'play') hint = '';
    root.replaceChildren(head, pl, facs, h('div.az-hint', hint), boardEl(S.view || me, (S.view || me) === me && myTurn()), S.view !== me ? h('button.btn.tonal', { onclick: () => { S.view = me; render(); } }, 'Back to my board') : '');
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, facs: [], center: [], marker: true, bag: [], lid: [], turn: 0, start: 0, boards: {}, scores: {}, phase: 'wait', timer: 0, sfx: null, log: '' };
    ids.forEach((id) => { H.scores[id] = 0; H.boards[id] = { lines: [[], [], [], [], []], wall: Array.from({ length: 5 }, () => Array(5).fill(false)), floor: [], marker: false }; });
    H.bag = rng.shuffle(Array.from({ length: 100 }, (_, i) => i % 5));
    H.start = rng.int(N);
    api.cleanup(() => clearTimeout(H.timer));
    const nf = { 2: 5, 3: 7, 4: 9 }[N] || 5;
    const pub = (extra = {}) => { api.broadcast('state', { phase: H.phase, round: H.round, facs: H.facs, center: H.center, marker: H.marker, bag: H.bag.length + H.lid.length, turn: ids[H.turn], boards: H.boards, scores: H.scores, sfx: H.sfx, ...extra }); H.sfx = null; };
    const drawTile = () => { if (!H.bag.length) { H.bag = rng.shuffle(H.lid); H.lid = []; } return H.bag.length ? H.bag.pop() : null; };
    function newRound() {
      H.round++;
      H.facs = Array.from({ length: nf }, () => { const f = []; for (let i = 0; i < 4; i++) { const t = drawTile(); if (t !== null) f.push(t); } return f.sort(); });
      H.center = []; H.marker = true; H.turn = H.start; H.phase = 'play';
      pub();
    }
    api.on('take', (m, from) => {
      if (H.phase !== 'play' || ids[H.turn] !== from) return;
      const b = H.boards[from], me = ids.indexOf(from);
      let pool;
      if (m.src === 'f') { pool = H.facs[m.idx]; if (!pool) return; } else if (m.src === 'c') pool = H.center; else return;
      if (!(m.color >= 0 && m.color < 5) || !pool.includes(m.color)) return;
      const line = m.line;
      if (line !== 'floor') {
        if (!(line >= 0 && line < 5)) return;
        const L = b.lines[line];
        if (L.length >= line + 1 || (L.length && L[0] !== m.color) || b.wall[line][wallCol(line, m.color)]) return;
      }
      const taken = pool.filter((c) => c === m.color), rest = pool.filter((c) => c !== m.color);
      if (m.src === 'f') { H.center.push(...rest); H.facs[m.idx] = []; } else { H.center = rest; if (H.marker) { H.marker = false; b.marker = true; H.start = me; } }
      if (line === 'floor') b.floor.push(...taken);
      else { const L = b.lines[line]; let k = 0; while (k < taken.length && L.length < line + 1) L.push(taken[k++]); b.floor.push(...taken.slice(k)); }
      H.sfx = 'card';
      if (H.facs.every((f) => !f.length) && !H.center.length) return endRound();
      H.turn = (H.turn + 1) % N;
      pub();
    });
    function endRound() {
      const d = {};
      let over = false;
      ids.forEach((id) => {
        const b = H.boards[id], before = H.scores[id];
        let gain = 0; const parts = [];
        b.lines.forEach((L, i) => {
          if (L.length !== i + 1) return;
          const color = L[0], c = wallCol(i, color);
          b.wall[i][c] = true;
          H.lid.push(...L.slice(1)); b.lines[i] = [];
          let hz = 1, vt = 1;
          for (let x = c - 1; x >= 0 && b.wall[i][x]; x--) hz++;
          for (let x = c + 1; x < 5 && b.wall[i][x]; x++) hz++;
          for (let y = i - 1; y >= 0 && b.wall[y][c]; y--) vt++;
          for (let y = i + 1; y < 5 && b.wall[y][c]; y++) vt++;
          gain += hz > 1 && vt > 1 ? hz + vt : Math.max(hz, vt);
        });
        const pen = [...(b.marker ? ['m'] : []), ...b.floor].slice(0, 7).reduce((a, _, i) => a + PEN[i], 0);
        H.lid.push(...b.floor); b.floor = []; b.marker = false;
        H.scores[id] = Math.max(0, before + gain - pen);
        parts.push(`+${gain} tiles`); if (pen) parts.push(`−${pen} floor`);
        d[id] = { gain: H.scores[id] - before, txt: parts.join(' · ') };
        if (b.wall.some((row) => row.every(Boolean))) over = true;
      });
      if (over) {
        ids.forEach((id) => {
          const b = H.boards[id]; let bonus = 0;
          const rows = b.wall.filter((row) => row.every(Boolean)).length;
          const cols = [0, 1, 2, 3, 4].filter((c) => b.wall.every((row) => row[c])).length;
          const sets = [0, 1, 2, 3, 4].filter((color) => b.wall.every((row, r) => row[wallCol(r, color)])).length;
          bonus = rows * 2 + cols * 7 + sets * 10;
          H.scores[id] += bonus; d[id].gain += bonus;
          d[id].txt += ` · bonus +${bonus} (${rows} rows, ${cols} cols, ${sets} colours)`;
        });
      }
      H.phase = 'roundEnd'; H.sfx = 'good';
      pub({ sum: { d, final: over } });
      H.timer = setTimeout(() => { if (over) finish(); else newRound(); }, over ? 8000 : 6500);
    }
    function finish() {
      const rowsOf = (id) => H.boards[id].wall.filter((row) => row.every(Boolean)).length;
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a] || rowsOf(b) - rowsOf(a)).map((id) => ({ id, score: H.scores[id], note: 'pts' }));
      const top = ranking[0];
      const winners = ranking.filter((r) => r.score === top.score && rowsOf(r.id) === rowsOf(top.id)).map((r) => r.id);
      api.endGame({ title: `${winners.map(nameOf).join(' & ')} built the finest palace!`, subtitle: `${top.score} points`, ranking, winners });
    }
    api.onRejoin(() => pub());
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 2) { clearTimeout(H.timer); finish(); } else if (H.phase === 'play' && api.player(ids[H.turn]).left) { H.turn = (H.turn + 1) % N; while (api.player(ids[H.turn]).left) H.turn = (H.turn + 1) % N; pub(); } });
    api.timeout(newRound, 800);
  }
  render();
}
