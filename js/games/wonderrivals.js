// Wonder Rivals — a two-player civilisation duel (7-Wonders-Duel-style). Draft cards from a pyramid across three ages
// to grow your city, then win by military, science or the most victory points. Build wonders for special powers!
import { h } from '../util.js';
import { icon, openSheet } from '../ui.js';
import { avatarEl } from '../avatar.js';

const RES = ['wood', 'stone', 'clay', 'glass', 'papyrus'];
const EM = { wood: '🪵', stone: '🪨', clay: '🧱', glass: '🔮', papyrus: '📜', coin: '🪙' };
const TYPE = { r: ['Raw', '#8d6e63'], m: ['Goods', '#78909c'], c: ['Civil', '#1e88e5'], s: ['Science', '#43a047'], y: ['Trade', '#f9a825'], w: ['Military', '#e53935'], g: ['Guild', '#8e24aa'] };
const SYM = { mortar: '🧪', compass: '🧭', quill: '🪶', wheel: '⚙️', sundial: '⏳', globe: '🌐' };
const LAYOUT = { 1: [2, 3, 4, 5, 6], 2: [6, 5, 4, 3, 2], 3: [2, 3, 4, 2, 4, 3, 2] };
const DOWN = { 1: [1, 3], 2: [1, 3], 3: [1, 3, 5] }; // face-down row indexes

const CARDS = {
  1: [['Lumber Yard', 'r', {}, { p: { wood: 1 } }], ['Quarry', 'r', {}, { p: { stone: 1 } }], ['Clay Pit', 'r', {}, { p: { clay: 1 } }], ['Logging Camp', 'r', { coin: 1 }, { p: { wood: 1 } }], ['Excavation', 'r', { coin: 1 }, { p: { stone: 1 } }], ['Brickyard', 'r', { coin: 1 }, { p: { clay: 1 } }],
    ['Glassworks', 'm', { coin: 1 }, { p: { glass: 1 } }], ['Press', 'm', { coin: 1 }, { p: { papyrus: 1 } }], ['Altar', 'c', {}, { vp: 3 }], ['Theater', 'c', {}, { vp: 3 }], ['Baths', 'c', { stone: 1 }, { vp: 3 }],
    ['Apothecary', 's', { glass: 1 }, { sym: 'mortar', vp: 1 }], ['Workshop', 's', { papyrus: 1 }, { sym: 'compass', vp: 1 }], ['Scriptorium', 's', { coin: 2 }, { sym: 'quill' }],
    ['Tavern', 'y', {}, { coin: 4 }], ['Stone Reserve', 'y', { coin: 3 }, { trade: ['stone'] }], ['Wood Reserve', 'y', { coin: 3 }, { trade: ['wood'] }], ['Clay Reserve', 'y', { coin: 3 }, { trade: ['clay'] }],
    ['Stable', 'w', { wood: 1 }, { sh: 1 }], ['Garrison', 'w', { clay: 1 }, { sh: 1 }]],
  2: [['Sawmill', 'r', { coin: 2 }, { p: { wood: 2 } }], ['Stone Mine', 'r', { coin: 2 }, { p: { stone: 2 } }], ['Brickworks', 'r', { coin: 2 }, { p: { clay: 2 } }], ['Glass Blower', 'm', {}, { p: { glass: 1 } }], ['Drying Room', 'm', {}, { p: { papyrus: 1 } }],
    ['Aqueduct', 'c', { stone: 3 }, { vp: 5 }], ['Temple', 'c', { wood: 1, papyrus: 1 }, { vp: 4 }], ['Statue', 'c', { clay: 2 }, { vp: 4 }], ['Rostrum', 'c', { stone: 1, wood: 1 }, { vp: 4 }],
    ['Library', 's', { glass: 1, wood: 1 }, { sym: 'quill', vp: 2 }], ['School', 's', { papyrus: 1, wood: 1 }, { sym: 'wheel', vp: 1 }], ['Laboratory', 's', { glass: 1, wood: 1 }, { sym: 'compass', vp: 2 }], ['Dispensary', 's', { stone: 2, clay: 1 }, { sym: 'mortar', vp: 2 }],
    ['Forum', 'y', { coin: 3, clay: 1 }, { wild: 'm' }], ['Caravansery', 'y', { coin: 2, glass: 1 }, { wild: 'r' }], ['Customs House', 'y', { coin: 4 }, { trade: ['glass', 'papyrus'] }], ['Brewery', 'y', {}, { coin: 6 }],
    ['Horse Breeders', 'w', { clay: 1, wood: 1 }, { sh: 2 }], ['Archery Range', 'w', { stone: 1, wood: 1, papyrus: 1 }, { sh: 2 }], ['Barracks', 'w', { coin: 3 }, { sh: 1 }]],
  3: [['Palace', 'c', { stone: 1, clay: 1, wood: 1, glass: 2 }, { vp: 7 }], ['Town Hall', 'c', { stone: 3, wood: 1, glass: 1 }, { vp: 7 }], ['Obelisk', 'c', { stone: 2, glass: 1 }, { vp: 5 }], ['Gardens', 'c', { clay: 2, wood: 2 }, { vp: 6 }], ['Pantheon', 'c', { clay: 1, wood: 1, papyrus: 2 }, { vp: 6 }], ['Senate', 'c', { clay: 2, stone: 1, papyrus: 1 }, { vp: 5 }],
    ['Academy', 's', { stone: 1, wood: 1, glass: 2 }, { sym: 'sundial', vp: 3 }], ['Study', 's', { wood: 2, glass: 1, papyrus: 1 }, { sym: 'wheel', vp: 3 }], ['Observatory', 's', { stone: 1, papyrus: 2 }, { sym: 'globe', vp: 2 }], ['University', 's', { clay: 1, glass: 1, papyrus: 1 }, { sym: 'globe', vp: 2 }],
    ['Arena', 'y', { clay: 1, stone: 1, wood: 1 }, { coinPer: 'wonder', n: 2, vp: 3 }], ['Lighthouse', 'y', { clay: 2, glass: 1 }, { coinPer: 'y', n: 1, vp: 3 }], ['Chamber of Commerce', 'y', { papyrus: 2 }, { coinPer: 'm', n: 3, vp: 3 }],
    ['Fortifications', 'w', { stone: 2, clay: 1, papyrus: 1 }, { sh: 2 }], ['Siege Workshop', 'w', { wood: 3, glass: 1 }, { sh: 2 }], ['Arsenal', 'w', { clay: 3, wood: 2 }, { sh: 3 }], ['Circus', 'w', { clay: 2, stone: 2 }, { sh: 2 }],
    ['Builders Guild', 'g', { stone: 2, clay: 1, glass: 1, papyrus: 1 }, { guild: 'wonder' }], ['Merchants Guild', 'g', { clay: 1, wood: 1, glass: 1, papyrus: 1 }, { guild: 'y' }], ['Magistrates Guild', 'g', { wood: 2, clay: 1, papyrus: 1 }, { guild: 'c' }]],
};
const WONDERS = [
  ['Pyramids', '🔺', { stone: 3, papyrus: 1 }, { vp: 9 }, '9 victory points'],
  ['Colossus', '🗿', { clay: 3, glass: 1 }, { vp: 3, sh: 2 }, '3 VP · 2 shields'],
  ['Temple of Artemis', '🏛️', { papyrus: 1, wood: 1, stone: 1, glass: 2 }, { coin: 12, extra: 1 }, '12 coins · play again'],
  ['Great Lighthouse', '🗼', { papyrus: 2, stone: 1, wood: 1 }, { vp: 4, wild: 'r' }, '4 VP · makes any raw material'],
  ['Hanging Gardens', '🌿', { wood: 2, glass: 1, papyrus: 1 }, { vp: 3, coin: 6, extra: 1 }, '3 VP · 6 coins · play again'],
  ['Mausoleum', '⚱️', { glass: 2, papyrus: 1, clay: 2 }, { vp: 2, revive: 1 }, '2 VP · build any discarded card free'],
  ['Piraeus', '⚓', { clay: 2, stone: 1, wood: 1 }, { vp: 2, wild: 'm', extra: 1 }, '2 VP · makes any goods · play again'],
  ['Sphinx', '🦁', { stone: 2, clay: 1, glass: 1 }, { vp: 6, extra: 1 }, '6 VP · play again'],
  ['Statue of Zeus', '⚡', { stone: 2, wood: 1, papyrus: 1, clay: 1 }, { vp: 3, sh: 1, destroy: 'r' }, '3 VP · 1 shield · destroy a rival raw card'],
  ['Appian Way', '🛣️', { papyrus: 2, stone: 2, clay: 1 }, { vp: 3, coin: 3, steal: 3, extra: 1 }, '3 VP · 3 coins · rival loses 3 · play again'],
  ['Circus Maximus', '🎪', { stone: 2, clay: 1, glass: 1 }, { vp: 3, sh: 1, destroy: 'm' }, '3 VP · 1 shield · destroy a rival goods card'],
  ['Great Library', '📚', { wood: 3, glass: 1, papyrus: 1 }, { vp: 4, coin: 4 }, '4 VP · 4 coins'],
];

// ---- shared helpers (host + client) ------------------------------------------------------
const prodOf = (cards, wonders) => {
  const p = { wood: 0, stone: 0, clay: 0, glass: 0, papyrus: 0 }; let wildR = 0, wildM = 0; const trade = new Set();
  const fx = [...cards.map((c) => c.fx), ...wonders.filter((w) => w.built).map((w) => w.fx)];
  for (const f of fx) { if (f.p) for (const [k, n] of Object.entries(f.p)) p[k] += n; if (f.wild === 'r') wildR++; if (f.wild === 'm') wildM++; if (f.trade) f.trade.forEach((t) => trade.add(t)); }
  return { p, wildR, wildM, trade };
};
/** coins needed for `me` to pay `cost`, or null if impossible. */
function priceFor(meCards, meWon, opCards, opWon, cost, coins) {
  const mine = prodOf(meCards, meWon), theirs = prodOf(opCards, opWon);
  let price = cost.coin || 0;
  const missing = [];
  for (const r of RES) { const need = (cost[r] || 0) - mine.p[r]; for (let i = 0; i < need; i++) missing.push(r); }
  const unit = (r) => (mine.trade.has(r) ? 1 : 2 + theirs.p[r]);
  missing.sort((a, b) => unit(b) - unit(a));
  let wr = mine.wildR, wm = mine.wildM;
  for (const r of missing) {
    const raw = r === 'wood' || r === 'stone' || r === 'clay';
    if (raw && wr > 0) { wr--; continue; }
    if (!raw && wm > 0) { wm--; continue; }
    price += unit(r);
  }
  return price <= coins ? price : null;
}
const symbolsOf = (cards) => { const s = {}; cards.forEach((c) => { if (c.fx.sym) s[c.fx.sym] = (s[c.fx.sym] || 0) + 1; }); return s; };

const CSS = `
.wd { gap:8px; max-width:720px; }
.wd-top { display:grid; grid-template-columns:1fr auto 1fr; gap:6px; align-items:center; }
.wd-pl { background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:6px 10px; display:flex; align-items:center; gap:8px; font:700 13px var(--font); border:3px solid transparent; } .wd-pl.turn { border-color:var(--yellow); background:var(--yellow-c); } .wd-pl .co { margin-left:auto; font:800 15px var(--font); } .wd-pl.r { flex-direction:row-reverse; } .wd-pl.r .co { margin-left:0; margin-right:auto; }
.wd-age { font:800 14px var(--font); text-align:center; color:var(--on2); }
.wd-mil { display:flex; gap:2px; justify-content:center; align-items:center; } .wd-m { width:calc((100% - 36px) / 19); max-width:26px; height:20px; border-radius:5px; background:var(--s3); display:grid; place-items:center; font-size:12px; position:relative; } .wd-m.z3 { background:#ffe0b2; } .wd-m.z6 { background:#ffccbc; } .wd-m.z9 { background:#ef9a9a; } .wd-m.pawn::after { content:'●'; position:absolute; font-size:16px; color:#212121; }
.wd-city { background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:6px 8px; display:flex; flex-wrap:wrap; gap:4px; align-items:center; font:700 12px var(--font); min-height:40px; }
.wd-chip { display:inline-flex; align-items:center; gap:3px; border-radius:10px; padding:2px 7px; background:var(--cc); color:#fff; font:800 12px var(--font); } .wd-chip.res { background:var(--s2); color:var(--on); } .wd-chip.sym { background:var(--green-c); color:var(--green-d); }
.wd-won { display:flex; gap:5px; flex-wrap:wrap; } .wd-w { border-radius:12px; padding:3px 8px; background:var(--s2); font:700 11px var(--font); display:inline-flex; gap:4px; align-items:center; cursor:pointer; } .wd-w.built { background:linear-gradient(135deg,#ffe082,#ffca28); } .wd-w.gone { opacity:.35; text-decoration:line-through; }
.wd-pyr { display:flex; flex-direction:column; align-items:center; padding:6px 0 18px; }
.wd-row { display:flex; gap:6px; justify-content:center; margin-top:-26px; } .wd-row:first-child { margin-top:0; }
.wd-c { width:clamp(46px,12.4vw,66px); height:clamp(64px,17vw,90px); border-radius:11px; background:var(--cc); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font:800 10px/1.05 var(--font); text-align:center; box-shadow:0 3px 8px rgba(0,0,0,.25); position:relative; padding:3px; border:3px solid transparent; transition:transform .12s; }
.wd-c .em { font-size:clamp(16px,4.6vw,24px); line-height:1; } .wd-c .cost { font-size:9px; opacity:.95; display:flex; flex-wrap:wrap; gap:1px; justify-content:center; line-height:1; }
.wd-c.back { background:linear-gradient(145deg,#546e7a,#37474f); } .wd-c.back .em { font-size:22px; opacity:.5; }
.wd-c.cov { filter:brightness(.78); } .wd-c.ok { cursor:pointer; border-color:#fff; box-shadow:0 0 0 3px var(--yellow), 0 3px 8px rgba(0,0,0,.25); } .wd-c.ok:hover { transform:translateY(-4px); } .wd-c.gone { visibility:hidden; }
.wd-hint { text-align:center; font:700 14px var(--font); min-height:20px; } .wd-log { text-align:center; font:600 12px var(--font); color:var(--on2); }
.wd-sheet h3 { margin:0 0 4px; font:800 20px var(--font); } .wd-sheet p { color:var(--on2); font:500 14px/1.4 var(--font); margin:4px 0 10px; } .wd-sheet .btn { width:100%; margin-top:8px; justify-content:flex-start; }
.wd-opt { display:flex; align-items:center; gap:10px; width:100%; text-align:left; border:0; border-radius:16px; padding:10px 12px; background:var(--s2); margin-top:8px; font:600 14px var(--font); cursor:pointer; color:var(--on); } .wd-opt:disabled { opacity:.45; cursor:not-allowed; } .wd-opt b { display:block; font:800 15px var(--font); }
`;

export function start(api) {
  const ids = api.players.slice(0, 2).map((p) => p.id);
  const me = ids.indexOf(api.me);
  const nameOf = (id) => api.player(id)?.name || '?';
  const root = h('div.kt.wide.wd');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', age: 1, layout: [], coins: [7, 7], cities: [[], []], wonders: [[], []], mil: 0, turn: 0, log: '', pend: null, end: null, discard: 0, sheet: null };

  api.on('state', (s) => { Object.assign(S, s); if (S.sheet) { S.sheet.close(); S.sheet = null; } if (s.sfx) api.sfx(s.sfx); render(); });
  api.onPlayersChanged(render);

  const fxText = (f) => [f.p && Object.entries(f.p).map(([k, n]) => `${n}${EM[k]}`).join(' '), f.vp && `${f.vp}★`, f.coin && `+${f.coin}🪙`, f.sh && `${f.sh}⚔️`, f.sym && SYM[f.sym], f.trade && 'trade ' + f.trade.map((t) => EM[t]).join(''), f.wild && `any ${f.wild === 'r' ? 'raw' : 'goods'}`, f.coinPer && 'coins/card', f.guild && 'guild'].filter(Boolean).join(' ');
  const costEls = (cost) => Object.entries(cost).map(([k, n]) => h('span', `${n}${EM[k] || EM.coin}`));
  const covered = (c) => S.layout.some((o) => !o.taken && o.r === c.r + 1 && Math.abs(o.x - c.x) < 1);
  const price = (cost) => priceFor(S.cities[me], S.wonders[me], S.cities[1 - me], S.wonders[1 - me], cost, S.coins[me]);
  const myTurn = () => S.turn === me && S.phase === 'play';

  function cardEl(c) {
    if (c.taken) return h('div.wd-c.gone');
    if (!c.card) return h('div.wd-c.back', h('span.em.emo', '🏺'));
    const cov = covered(c);
    const ok = !cov && myTurn() && !S.pend;
    const [nm, t, cost, fx] = c.card;
    return h('div.wd-c' + (cov ? '.cov' : '') + (ok ? '.ok' : ''), { style: `--cc:${TYPE[t][1]}`, title: nm, onclick: ok ? () => openCard(c) : () => api.toast(cov ? 'Covered by other cards' : `${nm}: ${fxText(fx) || '—'}`) },
      h('span', nm.length > 11 ? nm.slice(0, 10) + '…' : nm), h('span.em.emo', fx.sym ? SYM[fx.sym] : fx.sh ? '⚔️' : fx.p ? EM[Object.keys(fx.p)[0]] : fx.vp && t === 'c' ? '🏛️' : fx.coin || fx.coinPer ? '🪙' : fx.trade ? '🤝' : fx.wild ? '✨' : fx.guild ? '👑' : '❖'), h('span.cost', costEls(cost)));
  }
  function openCard(c) {
    const [nm, t, cost, fx] = c.card;
    const p = price(cost);
    const sellGain = 2 + S.cities[me].filter((x) => x.type === 'y').length;
    const wl = S.wonders[me].map((w, i) => ({ w, i })).filter((x) => !x.w.built && !x.w.gone);
    const sh = openSheet(h('div.wd-sheet', h('h3', `${nm} `, h('span.chip', { style: `background:${TYPE[t][1]};color:#fff` }, TYPE[t][0])), h('p', fxText(fx) || '—'),
      h('button.wd-opt', { disabled: p === null, onclick: () => { sh.close(); act({ k: 'build', id: c.id }); } }, h('span.emo', { style: 'font-size:24px' }, '🏗️'), h('div', h('b', 'Construct'), p === null ? (Object.keys(cost).length ? 'Can’t afford it' : '') : p ? `Pay ${p} 🪙` : 'Free!'), h('span', { style: 'margin-left:auto' }, costEls(cost))),
      h('div.kt-title', { style: 'margin:12px 0 0' }, 'Or use it for a wonder'),
      ...wl.map(({ w, i }) => { const wp = price(w.cost); const maxed = S.wonders.flat().filter((x) => x.built).length >= 7; return h('button.wd-opt', { disabled: wp === null || maxed, onclick: () => { sh.close(); act({ k: 'wonder', id: c.id, w: i }); } }, h('span.emo', { style: 'font-size:24px' }, w.em), h('div', h('b', w.name), w.text, h('div', { style: 'font-size:12px;color:var(--on2)' }, wp === null ? 'Can’t afford it' : wp ? `Pay ${wp} 🪙` : 'Free!')), h('span', { style: 'margin-left:auto' }, costEls(w.cost))); }),
      h('button.wd-opt', { onclick: () => { sh.close(); act({ k: 'discard', id: c.id }); } }, h('span.emo', { style: 'font-size:24px' }, '🪙'), h('div', h('b', 'Sell for coins'), `Discard it and gain ${sellGain} 🪙`))), { onClose: () => (S.sheet = null) });
    S.sheet = sh;
  }
  const act = (m) => { api.toHost('act', m); api.sfx('card'); };

  const vpOf = (i) => {
    const cards = S.cities[i], op = S.cities[1 - i];
    let vp = 0;
    cards.forEach((c) => { vp += c.fx.vp || 0; });
    S.wonders[i].filter((w) => w.built).forEach((w) => (vp += w.fx.vp || 0));
    const sy = symbolsOf(cards); vp += Object.values(sy).filter((n) => n >= 2).length * 4;
    vp += Math.floor(S.coins[i] / 3);
    const lead = i === 0 ? S.mil : -S.mil;
    if (lead > 0) vp += lead >= 6 ? 10 : lead >= 3 ? 5 : 2;
    cards.filter((c) => c.fx.guild).forEach((c) => { const g = c.fx.guild; const cnt = (cs, ws) => g === 'wonder' ? ws.filter((w) => w.built).length * 2 : cs.filter((x) => x.type === g).length; vp += Math.max(cnt(cards, S.wonders[i]), cnt(op, S.wonders[1 - i])); });
    return vp;
  };
  function cityEl(i) {
    const cards = S.cities[i], pr = prodOf(cards, S.wonders[i]), sy = symbolsOf(cards);
    const counts = Object.keys(TYPE).map((t) => [t, cards.filter((c) => c.type === t).length]).filter(([, n]) => n);
    return [h('div.wd-city', counts.map(([t, n]) => h('span.wd-chip', { style: `--cc:${TYPE[t][1]}` }, TYPE[t][0], n)), RES.filter((r) => pr.p[r]).map((r) => h('span.wd-chip.res', `${pr.p[r]}${EM[r]}`)), pr.wildR ? h('span.wd-chip.res', '✨raw') : null, pr.wildM ? h('span.wd-chip.res', '✨goods') : null, Object.keys(sy).map((k) => h('span.wd-chip.sym', SYM[k], sy[k] > 1 ? '×' + sy[k] : '')), !counts.length ? h('span.muted', 'No cards yet') : null),
      h('div.wd-won', S.wonders[i].map((w) => h('div.wd-w' + (w.built ? '.built' : w.gone ? '.gone' : ''), { onclick: () => api.toast(`${w.name}: ${w.text}${w.built ? '' : ' · cost ' + Object.entries(w.cost).map(([k, n]) => n + EM[k]).join(' ')}`) }, h('span.emo', w.em), w.name)))];
  }
  function milBar() {
    return h('div.wd-mil', Array.from({ length: 19 }, (_, k) => { const p = k - 9; return h('div.wd-m' + (p === S.mil ? '.pawn' : '') + (Math.abs(p) >= 9 ? '.z9' : Math.abs(p) >= 6 ? '.z6' : Math.abs(p) >= 3 ? '.z3' : ''), p === -9 ? '🏰' : p === 9 ? '🏰' : ''); }));
  }
  function render() {
    if (S.phase === 'end' && S.end) {
      const e = S.end;
      root.replaceChildren(h('div.kt-prompt', { style: '--pc:#f9a825' }, h('small', e.how), `${nameOf(ids[e.winner])} wins!`),
        h('div.kt-card', ...[0, 1].map((i) => h('div', { style: 'display:flex;align-items:center;gap:8px;margin:4px 0;font:700 14px var(--font)' }, avatarEl(api.player(ids[i]), 'sm', { still: true }), nameOf(ids[i]), h('span', { style: 'margin-left:auto;font:800 18px var(--font)' }, e.vp ? `${e.vp[i]} ★` : '—')))),
        h('div.kt-hint', e.note || ''));
      return;
    }
    const opp = 1 - me;
    const pl = (i, right) => h('div.wd-pl' + (right ? '.r' : '') + (S.turn === i && S.phase === 'play' ? '.turn' : ''), avatarEl(api.player(ids[i]), 'sm', { still: S.turn !== i }), nameOf(ids[i]).slice(0, 9) + (i === me ? ' (you)' : ''), h('span.co', `${S.coins[i]}🪙 ${vpOf(i)}★`));
    const top = h('div.wd-top', pl(opp, false), h('div.wd-age', `Age ${S.age}`), pl(me, true));
    const mil = S.mil;
    const milTxt = mil === 0 ? 'Military is balanced' : `${nameOf(ids[mil > 0 ? 0 : 1])} leads militarily (${Math.abs(mil)})`;
    const rows = [];
    const L = S.layout;
    const nRows = Math.max(...L.map((c) => c.r)) + 1;
    for (let r = 0; r < nRows; r++) rows.push(h('div.wd-row', L.filter((c) => c.r === r).sort((a, b) => a.x - b.x).map(cardEl)));
    let hint = '';
    if (S.phase === 'play') hint = S.pend ? (S.pend.who === me ? (S.pend.k === 'destroy' ? 'Choose a rival card to destroy' : 'Pick a discarded card to build for free') : `${nameOf(ids[S.pend.who])} is choosing…`) : myTurn() ? 'Your turn — tap a glowing card' : `${nameOf(ids[S.turn])} is choosing…`;
    const pend = S.pend && S.pend.who === me ? h('div.wd-city', { style: 'justify-content:center' }, S.pend.opts.map((o) => h('button.wd-c.ok', { style: `--cc:${TYPE[o.type][1]}`, onclick: () => act({ k: 'pend', id: o.id }) }, h('span', o.name.slice(0, 10)), h('span.em.emo', o.fx.sym ? SYM[o.fx.sym] : o.fx.p ? EM[Object.keys(o.fx.p)[0]] : '❖')))) : null;
    root.replaceChildren(top, milBar(), h('div.wd-log', milTxt), ...cityEl(opp), h('div.wd-pyr', rows), h('div.wd-hint', hint), pend || '', S.log ? h('div.wd-log', S.log) : '', ...cityEl(me));
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { age: 0, layout: [], coins: [7, 7], cities: [[], []], wonders: [[], []], mil: 0, turn: 0, discard: [], pend: null, phase: 'wait', log: '', timer: 0, lastTaker: 0, tri: [{}, {}], sfx: null, nid: 0 };
    api.cleanup(() => clearTimeout(H.timer));
    const wl = rng.shuffle(WONDERS.map((w, i) => i));
    [0, 1].forEach((p) => (H.wonders[p] = wl.slice(p * 4, p * 4 + 4).map((i) => ({ name: WONDERS[i][0], em: WONDERS[i][1], cost: WONDERS[i][2], fx: WONDERS[i][3], text: WONDERS[i][4], built: false, gone: false }))));
    const pubCity = (p) => H.cities[p].map((c) => ({ name: c.name, type: c.type, fx: c.fx }));
    function exposed() {
      const free = (c) => !H.layout.some((o) => !o.taken && o.r === c.r + 1 && Math.abs(o.x - c.x) < 1);
      return H.layout.map((c) => ({ id: c.id, r: c.r, x: c.x, taken: c.taken, up: c.up, card: c.taken ? undefined : (c.up || free(c)) ? c.card : undefined }));
    }
    const pub = (extra = {}) => { api.broadcast('state', { phase: H.phase, age: H.age, layout: exposed(), coins: H.coins, cities: [pubCity(0), pubCity(1)], wonders: H.wonders, mil: H.mil, turn: H.turn, log: H.log, pend: H.pend ? { who: H.pend.who, k: H.pend.k, opts: H.pend.opts } : null, sfx: H.sfx, ...extra }); H.sfx = null; };
    function newAge() {
      H.age++;
      const cards = rng.shuffle(CARDS[H.age].slice());
      const rows = LAYOUT[H.age];
      H.layout = [];
      let k = 0;
      rows.forEach((n, r) => { for (let i = 0; i < n; i++) H.layout.push({ id: 'k' + H.age + '_' + k, r, x: i - (n - 1) / 2, card: cards[k++], taken: false, up: !DOWN[H.age].includes(r) }); });
      if (H.age === 1) H.turn = rng.int(2);
      else { const lead = H.mil; H.turn = lead > 0 ? 1 : lead < 0 ? 0 : 1 - H.lastTaker; }
      H.phase = 'play'; H.log = `Age ${H.age} begins!`;
      pub();
    }
    const uncovered = (c) => !H.layout.some((o) => !o.taken && o.r === c.r + 1 && Math.abs(o.x - c.x) < 1);
    function shield(p, n) {
      H.mil = Math.max(-9, Math.min(9, H.mil + (p === 0 ? n : -n)));
      const a = Math.abs(H.mil), loser = H.mil > 0 ? 1 : 0, T = H.tri[loser];
      if (a >= 3 && !T[3]) { T[3] = true; H.coins[loser] = Math.max(0, H.coins[loser] - 2); H.log += ` ${nameOf(ids[loser])} loses 2 coins to the war!`; }
      if (a >= 6 && !T[6]) { T[6] = true; H.coins[loser] = Math.max(0, H.coins[loser] - 5); H.log += ` ${nameOf(ids[loser])} loses 5 coins to the war!`; }
      if (a >= 9) return win(H.mil > 0 ? 0 : 1, 'Military supremacy!');
    }
    function applyFx(p, fx) {
      if (fx.coin) H.coins[p] += fx.coin;
      if (fx.coinPer) { const n = fx.coinPer === 'wonder' ? H.wonders[p].filter((w) => w.built).length : H.cities[p].filter((c) => c.type === fx.coinPer).length; H.coins[p] += n * fx.n; }
      if (fx.steal) H.coins[1 - p] = Math.max(0, H.coins[1 - p] - fx.steal);
      if (fx.sh && shield(p, fx.sh) === 'over') return;
      if (fx.sym) { const sy = symbolsOf(H.cities[p]); if (Object.keys(sy).length >= 6) win(p, 'Scientific supremacy!'); }
    }
    function win(p, how) {
      if (H.phase === 'end') return 'over';
      H.phase = 'end'; clearTimeout(H.timer);
      H.sfx = 'win';
      pub({ end: { winner: p, how, vp: null, note: '' } });
      H.timer = setTimeout(() => finish(p, how), 5000);
      return 'over';
    }
    api.on('act', (m, from) => {
      const p = ids.indexOf(from);
      if (H.phase !== 'play' || p !== H.turn) return;
      if (H.pend) {
        if (H.pend.who !== p || m.k !== 'pend') return;
        const o = H.pend.opts.find((x) => x.id === m.id);
        if (!o) return;
        if (H.pend.k === 'destroy') { const v = 1 - p; const i = H.cities[v].findIndex((c) => c.id === o.id); if (i >= 0) { H.discard.push(H.cities[v].splice(i, 1)[0]); H.log += ` ${nameOf(ids[p])} destroys the ${o.name}!`; } }
        else { const i = H.discard.findIndex((c) => c.id === o.id); if (i >= 0) { const c = H.discard.splice(i, 1)[0]; H.cities[p].push(c); applyFx(p, c.fx); H.log += ` ${nameOf(ids[p])} revives the ${c.name}!`; } }
        const extra = H.pend.extra; H.pend = null; H.sfx = 'boom';
        return endTurn(p, extra);
      }
      const cell = H.layout.find((c) => c.id === m.id);
      if (!cell || cell.taken || !uncovered(cell)) return;
      const [name, type, cost, fx] = cell.card;
      const mk = () => ({ id: cell.id, name, type, fx });
      if (m.k === 'build') {
        const pr = priceFor(H.cities[p], H.wonders[p], H.cities[1 - p], H.wonders[1 - p], cost, H.coins[p]);
        if (pr === null) return;
        H.coins[p] -= pr;
        cell.taken = true; H.lastTaker = p;
        H.cities[p].push(mk());
        H.log = `${nameOf(ids[p])} builds the ${name}${pr ? ` (−${pr}🪙)` : ''}.`;
        H.sfx = 'card';
        applyFx(p, fx);
        if (fx.sym) { const sy = symbolsOf(H.cities[p]); if (sy[fx.sym] === 2) H.log += ' Science pair! +4★'; }
        if (H.phase === 'end') return;
        return endTurn(p, 0);
      }
      if (m.k === 'discard') {
        const gain = 2 + H.cities[p].filter((c) => c.type === 'y').length;
        H.coins[p] += gain; cell.taken = true; H.lastTaker = p;
        H.discard.push(mk());
        H.log = `${nameOf(ids[p])} sells a card for ${gain}🪙.`; H.sfx = 'pop';
        return endTurn(p, 0);
      }
      if (m.k === 'wonder') {
        const w = H.wonders[p][m.w];
        if (!w || w.built || w.gone || H.wonders.flat().filter((x) => x.built).length >= 7) return;
        const pr = priceFor(H.cities[p], H.wonders[p], H.cities[1 - p], H.wonders[1 - p], w.cost, H.coins[p]);
        if (pr === null) return;
        H.coins[p] -= pr; w.built = true; cell.taken = true; H.lastTaker = p;
        if (H.wonders.flat().filter((x) => x.built).length >= 7) H.wonders.flat().forEach((x) => { if (!x.built) x.gone = true; });
        H.log = `${nameOf(ids[p])} builds ${w.name}!`; H.sfx = 'win';
        applyFx(p, w.fx);
        if (H.phase === 'end') return;
        const extra = w.fx.extra ? 1 : 0;
        if (w.fx.destroy) { const opts = H.cities[1 - p].filter((c) => c.type === w.fx.destroy).map((c) => ({ ...c })); if (opts.length) { H.pend = { who: p, k: 'destroy', opts, extra }; return pub(); } }
        if (w.fx.revive && H.discard.length) { H.pend = { who: p, k: 'revive', opts: H.discard.map((c) => ({ ...c })), extra }; return pub(); }
        return endTurn(p, extra);
      }
    });
    function endTurn(p, extra) {
      if (H.phase === 'end') return;
      if (H.layout.every((c) => c.taken)) {
        if (H.age >= 3) return finishByPoints();
        H.phase = 'between'; pub(); H.timer = setTimeout(newAge, 2500); return;
      }
      H.turn = extra ? p : 1 - p;
      if (extra) H.log += ' Play again!';
      pub();
    }
    function totals() {
      return [0, 1].map((i) => {
        let vp = 0; const cards = H.cities[i], op = H.cities[1 - i];
        cards.forEach((c) => (vp += c.fx.vp || 0));
        H.wonders[i].filter((w) => w.built).forEach((w) => (vp += w.fx.vp || 0));
        vp += Object.values(symbolsOf(cards)).filter((n) => n >= 2).length * 4;
        vp += Math.floor(H.coins[i] / 3);
        const lead = i === 0 ? H.mil : -H.mil; if (lead > 0) vp += lead >= 6 ? 10 : lead >= 3 ? 5 : 2;
        cards.filter((c) => c.fx.guild).forEach((c) => { const g = c.fx.guild; const cnt = (cs, ws) => (g === 'wonder' ? ws.filter((w) => w.built).length * 2 : cs.filter((x) => x.type === g).length); vp += Math.max(cnt(cards, H.wonders[i]), cnt(op, H.wonders[1 - i])); });
        return vp;
      });
    }
    function finishByPoints() {
      const vp = totals();
      const w = vp[0] === vp[1] ? (H.cities[0].filter((c) => c.type === 'c').reduce((a, c) => a + c.fx.vp, 0) >= H.cities[1].filter((c) => c.type === 'c').reduce((a, c) => a + c.fx.vp, 0) ? 0 : 1) : vp[0] > vp[1] ? 0 : 1;
      H.phase = 'end'; H.sfx = 'win';
      pub({ end: { winner: w, how: 'Civilisation victory — most points', vp, note: vp[0] === vp[1] ? 'Tie broken by civil points' : '' } });
      H.timer = setTimeout(() => finish(w, 'points', vp), 7000);
    }
    function finish(w, how, vp) {
      const v = vp || totals();
      api.endGame({ title: `${nameOf(ids[w])} wins!`, subtitle: how === 'points' ? `${v[w]} ★ to ${v[1 - w]} ★` : how, ranking: [w, 1 - w].map((i, k) => ({ id: ids[i], score: k === 0 ? 'victory' : 'defeat', note: `${v[i]} ★` })), winners: [ids[w]] });
    }
    api.onRejoin(() => pub());
    api.onLeave((id) => { clearTimeout(H.timer); const w = 1 - ids.indexOf(id); if (H.phase !== 'end') { H.phase = 'end'; api.endGame({ title: 'Your rival left', ranking: [{ id: ids[w], score: 'win' }], winners: [ids[w]] }); } });
    api.timeout(newAge, 800);
  }
  render();
}
