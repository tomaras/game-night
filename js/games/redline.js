// Redline Racers — a Heat-style card-driven race. Pick a gear, play that many speed cards, and slam round the
// corners without blowing your engine. Overheating clogs your hand with Heat; cool down in low gears.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock } from '../kit.js';

const L = 36;
const CORNERS = [[5, 4], [11, 3], [17, 5], [22, 2], [28, 4], [33, 3]];
const HAND = 7;
const PCOL = ['#e53935', '#1e88e5', '#fb8c00', '#8e24aa', '#00897b', '#f9a825'];
const GEARS = [1, 2, 3, 4];
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) { if (typeof v === 'function') el.addEventListener(k.slice(2), v); else if (v != null) el.setAttribute(k, v); } kids.forEach((c) => c != null && el.append(c)); return el; };
const pt = (i, rx = 150, ry = 90) => { const a = (-90 + (360 * (((i % L) + L) % L)) / L) * (Math.PI / 180); return [200 + rx * Math.cos(a), 118 + ry * Math.sin(a), a]; };

const CSS = `
.rl2 { gap:8px; max-width:640px; }
.rl2-track { background:linear-gradient(160deg,#c8e6c9,#a5d6a7); border-radius:26px; padding:4px; box-shadow:var(--e1); }
.rl2-svg { width:100%; height:auto; display:block; } .rl2-svg text { font-family:Outfit,sans-serif; pointer-events:none; }
.rl2-pl { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:6px; }
.rl2-p { background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:6px 10px 6px 6px; display:flex; align-items:center; gap:8px; border-left:6px solid var(--pc); font:700 12px var(--font); }
.rl2-p small { display:block; font:600 11px var(--font); color:var(--on2); } .rl2-p.locked { background:var(--green-c); }
.rl2-gears { display:flex; gap:6px; justify-content:center; }
.rl2-g { flex:1; max-width:84px; height:58px; border-radius:16px; border:3px solid transparent; background:var(--surface); box-shadow:var(--e1); font:800 22px var(--font); color:var(--on); cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1; }
.rl2-g small { font:600 10px var(--font); color:var(--on3); margin-top:2px; } .rl2-g.sel { border-color:var(--blue); background:var(--blue-c); } .rl2-g.cur small { color:var(--blue); } .rl2-g:disabled { opacity:.35; cursor:not-allowed; }
.rl2-hand { display:flex; gap:7px; flex-wrap:wrap; justify-content:center; padding:6px 0; }
.rl2-c { width:clamp(46px,13vw,60px); height:clamp(66px,18vw,84px); border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; font:800 26px var(--font); color:#fff; cursor:pointer; box-shadow:var(--e2); border:3px solid transparent; transition:transform .12s; background:linear-gradient(145deg,var(--cc),color-mix(in srgb, var(--cc) 70%, #000)); }
.rl2-c small { font:700 9px var(--font); opacity:.85; } .rl2-c.sel { transform:translateY(-12px); border-color:var(--yellow); } .rl2-c.dead { background:#90a4ae; cursor:not-allowed; opacity:.8; } .rl2-c.x { background:#6d4c41; }
.rl2-info { text-align:center; font:700 14px var(--font); min-height:20px; } .rl2-info.warn { color:var(--red); }
.rl2-log { text-align:center; font:700 15px var(--font); min-height:22px; }
`;
const ALL = CORNERS.flatMap(([c, l]) => Array.from({ length: 5 }, (_, lap) => [c + lap * L, l])).sort((a, b) => a[0] - b[0]);
const VC = { 1: '#26a69a', 2: '#43a047', 3: '#fb8c00', 4: '#e53935' };

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const laps = +api.opts.laps || 2;
  const total = L * laps;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const root = h('div.kt.rl2');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', turn: 1, pl: {}, hand: [], locked: new Set(), log: '', acting: null, gear: null, sel: [], boost: false, over: false };

  api.on('state', (s) => { Object.assign(S, s); S.locked = new Set(s.locked || []); if (s.ms !== undefined) clock.set(s.ms); if (s.phase === 'plan' && !s.keep) { S.sel = []; S.gear = S.pl[api.me]?.gear || 1; S.boost = false; } if (s.sfx) api.sfx(s.sfx); render(); });
  api.onPlayersChanged(render);

  const cornersAhead = (d, speed) => CORNERS.flatMap(([p, lim]) => { const out = []; for (let lap = 0; lap < laps + 1; lap++) { const ap = p + lap * L; if (ap > d && ap <= d + speed) out.push([ap, lim]); } return out; });
  function drawTrack() {
    const svg = sv('svg', { class: 'rl2-svg', viewBox: '0 0 400 240' });
    svg.append(sv('ellipse', { cx: 200, cy: 118, rx: 150, ry: 90, fill: 'none', stroke: '#546e7a', 'stroke-width': 34 }), sv('ellipse', { cx: 200, cy: 118, rx: 150, ry: 90, fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '6 8', opacity: 0.6 }));
    for (let i = 0; i < L; i++) { const [x, y] = pt(i); svg.append(sv('circle', { cx: x, cy: y, r: 2.4, fill: '#b0bec5' })); }
    CORNERS.forEach(([p, lim]) => { const [x, y] = pt(p, 178, 114); const [x0, y0] = pt(p); svg.append(sv('line', { x1: x0, y1: y0, x2: x, y2: y, stroke: '#e53935', 'stroke-width': 2 }), sv('circle', { cx: x, cy: y, r: 10, fill: '#fff', stroke: '#e53935', 'stroke-width': 3 }), sv('text', { x, y: y + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: '#c62828' }, lim)); });
    const [fx, fy, fa] = pt(0);
    svg.append(sv('rect', { x: fx - 3, y: fy - 19, width: 6, height: 38, fill: 'url(#chk)', transform: `rotate(${(fa * 180) / Math.PI + 90} ${fx} ${fy})` }));
    const defs = sv('defs', {}, sv('pattern', { id: 'chk', width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, sv('rect', { width: 6, height: 6, fill: '#fff' }), sv('rect', { width: 3, height: 3, fill: '#000' }), sv('rect', { x: 3, y: 3, width: 3, height: 3, fill: '#000' })));
    svg.prepend(defs);
    svg.append(sv('text', { x: 200, y: 108, 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 800, fill: '#2e7d32', opacity: 0.35 }, 'REDLINE'), sv('text', { x: 200, y: 134, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#2e7d32', opacity: 0.5 }, `Turn ${S.turn} · ${laps} laps`));
    const byPos = {};
    ids.forEach((id, i) => {
      const d = Math.min(S.pl[id]?.dist || 0, total);
      const slot = (byPos[Math.round(d)] = (byPos[Math.round(d)] || 0) + 1) - 1;
      const [x, y, a] = pt(d);
      const ox = -Math.sin(a) * (slot % 2 ? 11 : -11) * 0.9, oy = Math.cos(a) * (slot % 2 ? 11 : -11) * 0.9;
      const g = sv('g', { transform: `translate(${x + ox} ${y + oy})` });
      g.append(sv('circle', { r: 11, fill: '#fff', stroke: PCOL[i], 'stroke-width': 4 }), sv('text', { y: 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: PCOL[i] }, nameOf(id)[0].toUpperCase()));
      if (S.acting === id) g.append(sv('circle', { r: 16, fill: 'none', stroke: '#fbc02d', 'stroke-width': 3 }));
      svg.append(g);
    });
    return svg;
  }

  function render() {
    const me = api.me, mine = S.pl[me] || {};
    const sorted = ids.slice().sort((a, b) => (S.pl[b]?.dist || 0) - (S.pl[a]?.dist || 0));
    const head = h('div.kt-row', { style: 'justify-content:center' }, h('span.chip.blue', `Turn ${S.turn}`), S.phase === 'plan' ? clock.el() : null);
    const pls = h('div.rl2-pl', sorted.map((id, rank) => {
      const p = S.pl[id] || {};
      const lap = Math.min(laps, Math.floor((p.dist || 0) / L) + 1);
      return h('div.rl2-p' + (S.locked.has(id) && S.phase === 'plan' ? '.locked' : ''), { style: `--pc:${PCOL[ids.indexOf(id)]}` }, h('b', '#' + (rank + 1)), avatarEl(api.player(id), 'sm', { still: true }),
        h('div', nameOf(id) + (id === me ? ' (you)' : ''), h('small', { style: 'white-space:nowrap' }, `L${lap}/${laps} · G${p.gear || 1} · 🔥${p.heat ?? 6}${S.locked.has(id) && S.phase === 'plan' ? ' ✅' : ''}`)));
    }));
    const parts = [head, h('div.rl2-track', drawTrack()), pls];
    if (S.phase === 'plan') {
      const locked = S.locked.has(me);
      const gear = S.gear || mine.gear || 1;
      const cur = mine.gear || 1;
      const playable = S.hand.filter((c) => c.k !== 'h');
      const need = Math.min(gear, playable.length);
      const shiftCost = Math.abs(gear - cur) >= 2 ? 1 : 0;
      const heatLeft = (mine.heat ?? 6) - shiftCost;
      const sum = S.sel.reduce((a, id) => a + (S.hand.find((c) => c.id === id)?.v || 0), 0);
      const speedEst = sum + (S.boost ? 2 : 0);
      const ahead = cornersAhead(mine.dist || 0, speedEst);
      let info = '', warn = false;
      if (ahead.length) { const lim = ahead[0][1]; if (speedEst > lim) { warn = true; info = `Speed ${speedEst}${S.boost ? '+' : ''} vs corner limit ${lim} → pay ${speedEst - lim}🔥${speedEst - lim > heatLeft ? ' (SPIN OUT!)' : ''}`; } else info = `Speed ${speedEst}${S.boost ? '+' : ''} — corner limit ${lim} ✓`; }
      else info = `Speed ${speedEst}${S.boost ? '+' : ''} — clear road`;
      if (gear === 1) info += ' · cooldown: return 2🔥 from hand'; else if (gear === 2) info += ' · cooldown 1🔥';
      parts.push(h('div.rl2-gears', GEARS.map((g) => h('button.rl2-g' + (g === gear ? '.sel' : '') + (g === cur ? '.cur' : ''), { disabled: locked || Math.abs(g - cur) > 2 || (Math.abs(g - cur) === 2 && (mine.heat ?? 6) < 1), onclick: () => { S.gear = g; S.sel = S.sel.slice(0, Math.min(g, playable.length)); render(); } }, g, h('small', g === cur ? 'current' : Math.abs(g - cur) === 2 ? '1🔥' : `${g} card${g > 1 ? 's' : ''}`)))));
      parts.push(h('div.rl2-info' + (warn ? '.warn' : ''), locked ? 'Locked in — waiting for the others…' : `Pick ${need} card${need === 1 ? '' : 's'} · ${info}`));
      parts.push(h('div.rl2-hand', S.hand.map((c) => {
        const sel = S.sel.includes(c.id);
        if (c.k === 'h') return h('div.rl2-c.dead', { title: 'Heat — a dead card' }, h('span.emo', '🔥'), h('small', 'HEAT'));
        if (c.k === 'x') return h('div.rl2-c.x' + (sel ? '.sel' : ''), { onclick: () => toggle(c.id, need) }, 0, h('small', 'STRESS'));
        return h('div.rl2-c' + (sel ? '.sel' : ''), { style: `--cc:${VC[c.v]}`, onclick: () => toggle(c.id, need) }, c.v, h('small', 'SPEED'));
      })));
      if (!locked) parts.push(h('div.kt-row', { style: 'justify-content:center' },
        h('button.btn.small' + (S.boost ? '.primary' : '.tonal'), { disabled: heatLeft < 1, onclick: () => { S.boost = !S.boost; render(); } }, icon('bolt'), 'Boost (+1🔥, bonus card)'),
        h('button.btn.primary', { disabled: S.sel.length !== need, onclick: () => { api.toHost('pick', { gear, cards: S.sel, boost: S.boost }); api.sfx('pop'); } }, icon('speed'), 'Go!')));
    } else parts.push(h('div.rl2-log', S.log || ''));
    root.replaceChildren(...parts);
  }
  function toggle(id, need) {
    if (S.locked.has(api.me)) return;
    if (S.sel.includes(id)) S.sel = S.sel.filter((x) => x !== id);
    else if (S.sel.length < need) S.sel = [...S.sel, id];
    else S.sel = [...S.sel.slice(1), id];
    render();
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { turn: 0, phase: 'wait', pl: {}, picks: {}, timer: 0, log: '', acting: null, nid: 0, sfx: null };
    ids.forEach((id) => {
      const deck = [];
      for (let v = 1; v <= 4; v++) for (let k = 0; k < 3; k++) deck.push({ id: 'c' + H.nid++, k: 's', v });
      for (let k = 0; k < 3; k++) deck.push({ id: 'c' + H.nid++, k: 'x', v: 0 });
      H.pl[id] = { dist: 0, gear: 1, heat: 6, deck: rng.shuffle(deck), hand: [], disc: [], done: false };
      draw(id, HAND);
    });
    api.cleanup(() => clearTimeout(H.timer));
    function draw(id, n) {
      const p = H.pl[id];
      for (let i = 0; i < n; i++) { if (!p.deck.length) { p.deck = rng.shuffle(p.disc); p.disc = []; } if (p.deck.length) p.hand.push(p.deck.pop()); }
    }
    const pub = (extra = {}) => {
      const pl = Object.fromEntries(ids.map((id) => [id, { dist: H.pl[id].dist, gear: H.pl[id].gear, heat: H.pl[id].heat }]));
      ids.forEach((id) => { if (!api.player(id).left) api.sendTo(id, 'state', { phase: H.phase, turn: H.turn, pl, hand: H.pl[id].hand, locked: Object.keys(H.picks), log: H.log, acting: H.acting, sfx: H.sfx, ...extra }); });
      H.sfx = null;
    };
    function startTurn() {
      H.turn++; H.picks = {}; H.phase = 'plan'; H.log = ''; H.acting = null;
      pub({ ms: 40000 });
      clearTimeout(H.timer);
      H.timer = setTimeout(reveal, 40500);
    }
    api.on('pick', (m, from) => {
      if (H.phase !== 'plan' || H.picks[from]) return;
      const p = H.pl[from];
      if (!GEARS.includes(m.gear) || Math.abs(m.gear - p.gear) > 2) return;
      const heatCost = (Math.abs(m.gear - p.gear) === 2 ? 1 : 0) + (m.boost ? 1 : 0);
      if (heatCost > p.heat) return;
      const cards = (m.cards || []).map((id) => p.hand.find((c) => c.id === id));
      if (cards.some((c) => !c || c.k === 'h') || new Set(m.cards).size !== cards.length) return;
      const playable = p.hand.filter((c) => c.k !== 'h').length;
      if (cards.length !== Math.min(m.gear, playable)) return;
      H.picks[from] = { gear: m.gear, cards: cards.map((c) => c.id), boost: !!m.boost };
      if (ids.filter((i) => !api.player(i).left).every((i) => H.picks[i])) { clearTimeout(H.timer); H.timer = setTimeout(reveal, 500); } else pub({ keep: true });
    });
    function autoPick(id) {
      const p = H.pl[id];
      const gear = p.gear;
      const playable = p.hand.filter((c) => c.k !== 'h').sort((a, b) => b.v - a.v);
      const n = Math.min(gear, playable.length);
      return { gear, cards: playable.slice(0, n).map((c) => c.id), boost: false };
    }
    function reveal() {
      clearTimeout(H.timer);
      if (H.phase !== 'plan') return;
      ids.forEach((id) => { if (!H.picks[id]) H.picks[id] = autoPick(id); });
      H.phase = 'act';
      const order = ids.slice().sort((a, b) => H.pl[b].dist - H.pl[a].dist);
      let i = 0;
      const next = () => {
        if (i >= order.length) { H.acting = null; return finishTurn(); }
        move(order[i++]);
        H.timer = setTimeout(next, 1400);
      };
      H.log = 'Engines roaring…'; H.acting = null; pub();
      H.timer = setTimeout(next, 800);
    }
    function pay(id, n) { const p = H.pl[id]; const k = Math.min(n, p.heat); p.heat -= k; for (let i = 0; i < k; i++) p.disc.push({ id: 'h' + H.nid++, k: 'h', v: 0 }); return k; }
    function move(id) {
      const p = H.pl[id], pk = H.picks[id], who = nameOf(id);
      H.acting = id; H.sfx = 'pop';
      if (Math.abs(pk.gear - p.gear) === 2) pay(id, 1);
      p.gear = pk.gear;
      const played = pk.cards.map((cid) => { const i = p.hand.findIndex((c) => c.id === cid); return p.hand.splice(i, 1)[0]; });
      p.disc.push(...played);
      let speed = played.reduce((a, c) => a + c.v, 0), boostTxt = '';
      if (pk.boost) { pay(id, 1); if (!p.deck.length) { p.deck = rng.shuffle(p.disc); p.disc = []; } const b = p.deck.pop(); if (b) { speed += b.v; p.disc.push(b); boostTxt = ` +${b.v} boost`; } }
      // cooldown
      const back = p.gear === 1 ? 2 : p.gear === 2 ? 1 : 0;
      let cooled = 0;
      for (let k = 0; k < back; k++) { const hi = p.hand.findIndex((c) => c.k === 'h'); if (hi >= 0) { p.hand.splice(hi, 1); p.heat++; cooled++; } }
      const start = p.dist;
      let end = start + speed, msg = `${who}: gear ${p.gear}, speed ${speed}${boostTxt}`;
      let spun = false;
      for (const [cp, lim] of ALL) {
        if (cp <= start || cp > end) continue;
        if (speed > lim) {
          const need = speed - lim, paid = pay(id, need);
          if (paid < need) { spun = true; end = cp; p.gear = 1; p.disc.push({ id: 'x' + H.nid++, k: 'x', v: 0 }, { id: 'x' + H.nid++, k: 'x', v: 0 }); msg += ` — SPINS OUT at the corner!`; H.sfx = 'boom'; break; }
          msg += ` — corner (${lim}) costs ${paid}🔥`; H.sfx = 'bad';
        }
      }
      if (!spun && !ALL.some(([cp]) => cp > end && cp <= end + 2) && ids.some((o) => o !== id && H.pl[o].dist > end && H.pl[o].dist <= end + 1)) { end += 2; msg += ' · slipstream +2'; }
      if (cooled) msg += ` · cooled ${cooled}🔥`;
      p.dist = Math.min(end, total + 8);
      draw(id, HAND - p.hand.length);
      H.log = msg;
      pub();
    }
    function finishTurn() {
      if (ids.some((id) => H.pl[id].dist >= total)) return finish();
      H.timer = setTimeout(startTurn, 500);
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.pl[b].dist - H.pl[a].dist).map((id, i) => ({ id, score: H.pl[id].dist >= total ? 'finished' : `${Math.round((H.pl[id].dist / total) * 100)}%`, note: '' }));
      api.endGame({ title: `${nameOf(ranking[0].id)} wins the race!`, subtitle: `${laps} laps · ${H.turn} turns`, ranking, winners: [ranking[0].id] });
    }
    api.onRejoin(() => pub({ keep: true }));
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 2) { clearTimeout(H.timer); finish(); } else if (H.phase === 'plan' && ids.filter((i) => !api.player(i).left).every((i) => H.picks[i])) reveal(); });
    api.timeout(startTurn, 800);
  }
  render();
}
