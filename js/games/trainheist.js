// Train Heist — a Colt-Express-style programming game. Plan your moves in secret, then watch the chaos unfold
// as every bandit's action plays out in order along a speeding train. Most loot wins!
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock } from '../kit.js';

const CARDS = {
  move: ['Move', '➡️', '#1e88e5', 'Walk to a neighbouring car (up to 3 cars on the roof).'],
  floor: ['Climb', '🪜', '#8e24aa', 'Climb between the roof and the inside of your car.'],
  shoot: ['Shoot', '🔫', '#e53935', 'Hit a bandit next door (inside) or in line of sight (roof). They get a useless bullet card.'],
  punch: ['Punch', '👊', '#fb8c00', 'Punch someone in your car: they drop loot and get knocked back.'],
  rob: ['Rob', '💰', '#43a047', 'Grab loot in your car and level.'],
  marshal: ['Marshal', '⭐', '#00897b', 'Move the marshal one car. Bandits inside his car get shot and flee to the roof.'],
  bullet: ['Bullet', '🔹', '#90a4ae', 'A useless bullet. Clogs your hand.'],
};
const START_DECK = ['move', 'move', 'floor', 'floor', 'shoot', 'shoot', 'punch', 'rob', 'rob', 'marshal'];
const TURNS = { std: ['Standard', 'Everyone plays 1 card'], speed: ['Speeding up', 'Everyone plays 2 cards'], switch: ['Switching', 'Order is reversed'] };
const LOOT = { purse: '💰', jewel: '💎', box: '🔒' };

const CSS = `
.th { gap:8px; }
.th-train { display:flex; gap:5px; overflow-x:auto; padding:10px 8px 8px; background:linear-gradient(180deg,#e1f5fe,#b3e5fc 60%,#a5d6a7 60%); border-radius:24px; scrollbar-width:none; box-shadow:inset 0 2px 8px rgba(0,0,0,.08); }
.th-car { flex:none; width:104px; display:flex; flex-direction:column; gap:3px; }
.th-roof, .th-in { position:relative; display:flex; flex-wrap:wrap; align-content:flex-start; gap:2px; padding:4px; }
.th-roof { height:68px; background:#bcaaa4; border-radius:12px 12px 3px 3px; } .th-in { height:84px; background:linear-gradient(180deg,#ef5350,#c62828); border-radius:3px 3px 12px 12px; box-shadow:inset 0 0 0 3px rgba(255,255,255,.25); }
.th-car.loco .th-roof { background:#78909c; } .th-car.loco .th-in { background:linear-gradient(180deg,#455a64,#263238); } .th-in::before { content:''; position:absolute; inset:6px 8px auto 8px; height:20px; background:repeating-linear-gradient(90deg,rgba(255,255,255,.4) 0 16px,transparent 16px 26px); border-radius:6px; pointer-events:none; }
.th-b.me::after { content:''; position:absolute; inset:-3px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 2px #1a73e8; }
.th-wheels { height:8px; background:repeating-linear-gradient(90deg,#37474f 0 14px,transparent 14px 26px); border-radius:4px; margin:0 8px; }
.th-lbl { position:absolute; right:5px; bottom:2px; font:700 9px var(--font); color:rgba(255,255,255,.75); } .th-roof .th-lbl { color:rgba(0,0,0,.35); }
.th-loot { position:absolute; left:4px; bottom:3px; font:700 12px var(--font); color:#fff; display:flex; gap:3px; flex-wrap:wrap; }
.th-roof .th-loot { color:#4e342e; }
.th-m { font-size:22px; line-height:1; } .th-b { position:relative; } .th-b.acting { animation:pulse .6s infinite; z-index:2; filter:drop-shadow(0 0 6px #ffeb3b); }
.th-pl { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scrollbar-width:none; justify-content:safe center; }
.th-p { flex:none; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:6px 10px 6px 6px; display:flex; align-items:center; gap:7px; border:3px solid transparent; font:700 12px var(--font); }
.th-p.locked { border-color:var(--green); } .th-p small { display:block; font:600 11px var(--font); color:var(--on2); }
.th-hand { display:flex; gap:8px; overflow-x:auto; padding:14px 4px 6px; justify-content:safe center; scrollbar-width:none; }
.th-card { flex:none; width:76px; height:100px; border-radius:16px; background:var(--cc); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font:800 12px var(--font); cursor:pointer; box-shadow:var(--e2); border:3px solid transparent; transition:transform .15s; }
.th-card .em { font-size:34px; line-height:1; } .th-card.sel { transform:translateY(-14px); border-color:var(--yellow); } .th-card.dead { opacity:.45; cursor:not-allowed; filter:grayscale(.5); }
.th-opt { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; min-height:44px; }
.th-log { text-align:center; font:700 15px var(--font); min-height:22px; color:var(--on); } .th-step { text-align:center; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const rounds = +api.opts.rounds || 3;
  const C = Math.max(4, N + 1);
  const root = h('div.kt.wide.th');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, turn: 0, turns: 4, kind: 'std', pick: 1, cars: [], pos: {}, marshal: C - 1, wal: {}, bul: {}, shots: {}, locked: new Set(), hand: [], deckN: {}, log: '', acting: null, sel: null, opt: {} };

  api.on('state', (s) => { Object.assign(S, s); S.locked = new Set(s.locked || []); if (s.ms !== undefined) clock.set(s.ms); if (s.phase === 'plan' && !s.keep) { S.sel = null; S.opt = {}; } if (s.sfx) api.sfx(s.sfx); render(); });
  api.onPlayersChanged(render);

  const needs = (k) => ({ move: ['dir', 'dist'], shoot: ['dir'], punch: ['target', 'dir'], marshal: ['dir'] }[k] || []);
  function render() {
    const me = api.me, myPos = S.pos[me] || {};
    const trainEl = h('div.th-train', Array.from({ length: C }, (_, i) => {
      const loco = i === C - 1;
      const lootRow = (items) => items.length ? h('div.th-loot', ['purse', 'jewel', 'box'].map((t) => { const n = items.filter((x) => x === t).length; return n ? h('span', h('span.emo', LOOT[t]), n > 1 ? '×' + n : '') : null; })) : null;
      const here = (roof) => ids.filter((id) => S.pos[id] && S.pos[id].car === i && S.pos[id].roof === roof).map((id) => h('div.th-b' + (S.acting === id ? '.acting' : '') + (id === me ? '.me' : ''), avatarEl(api.player(id), 'xs', { still: S.acting !== id })));
      return h('div.th-car' + (loco ? '.loco' : ''), h('div.th-roof', here(true), lootRow(S.cars[i]?.roof || []), h('span.th-lbl', 'roof')),
        h('div.th-in', here(false), S.marshal === i ? h('span.th-m.emo', { title: 'Marshal' }, '👮') : null, lootRow(S.cars[i]?.in || []), h('span.th-lbl', loco ? 'engine 🚂' : 'car ' + (i + 1))), h('div.th-wheels'));
    }));
    const pl = h('div.th-pl', ids.map((id) => {
      const w = S.wal[id] || [];
      return h('div.th-p' + (S.locked.has(id) && S.phase === 'plan' ? '.locked' : ''), avatarEl(api.player(id), 'sm', { still: true }), h('div', nameOf(id) + (id === me ? ' (you)' : ''), h('small', `${w.filter((x) => x === 'purse').length}💰 ${w.filter((x) => x === 'jewel').length}💎 ${w.filter((x) => x === 'box').length}🔒 · 🔫${S.bul[id] ?? 6}${S.locked.has(id) && S.phase === 'plan' ? ' · ✅' : ''}`)));
    }));
    const head = h('div.kt-row', { style: 'justify-content:center' }, h('span.chip.blue', `Round ${S.round}/${rounds}`), h('span.chip.yellow', `Turn ${S.turn + 1}/${S.turns} · ${TURNS[S.kind][0]}${S.kind === 'speed' ? ` (${S.pick}/2)` : ''}`), S.phase === 'plan' ? clock.el() : null);
    const parts = [head, trainEl, pl];
    if (S.phase === 'plan') {
      const sel = S.hand.find((c) => c.id === S.sel);
      const locked = S.locked.has(me);
      const opt = h('div.th-opt');
      if (locked) opt.append(h('span.muted', 'Locked in — waiting for the others…'));
      else if (sel) {
        for (const n of needs(sel.k)) {
          if (n === 'dir') opt.append(h('button.btn.small' + (S.opt.dir === -1 ? '.primary' : '.tonal'), { onclick: () => { S.opt.dir = -1; render(); } }, icon('arrow_back'), 'Rear'), h('button.btn.small' + (S.opt.dir === 1 ? '.primary' : '.tonal'), { onclick: () => { S.opt.dir = 1; render(); } }, 'Front', icon('arrow_forward')));
          if (n === 'dist' && myPos.roof) opt.append(...[1, 2, 3].map((d) => h('button.btn.small' + (S.opt.dist === d ? '.primary' : '.tonal'), { onclick: () => { S.opt.dist = d; render(); } }, `${d} car${d > 1 ? 's' : ''}`)));
          if (n === 'target') opt.append(...ids.filter((id) => id !== me).map((id) => h('button.btn.small' + (S.opt.target === id ? '.primary' : '.tonal'), { onclick: () => { S.opt.target = id; render(); } }, nameOf(id))));
        }
        const ok = sel.k !== 'bullet' && needs(sel.k).every((n) => n === 'dist' ? (!myPos.roof || S.opt.dist) : S.opt[n] !== undefined);
        opt.append(h('button.btn.primary', { disabled: !ok, onclick: () => submit({ c: sel.id, ...S.opt }) }, icon('check'), 'Lock in'));
      }
      if (!locked) opt.append(h('button.btn.tonal', { onclick: () => submit({ draw: true }) }, icon('add'), 'Draw 3 cards instead'));
      parts.push(h('div.th-step', h('div.kt-hint', 'Pick a card for this step — everyone reveals at once!')), opt, h('div.th-hand', S.hand.map((c) => {
        const [nm, em, col] = CARDS[c.k];
        return h('div.th-card' + (S.sel === c.id ? '.sel' : '') + (c.k === 'bullet' || locked ? '.dead' : ''), { style: `--cc:${col}`, title: CARDS[c.k][3], onclick: () => { if (locked || c.k === 'bullet') return; S.sel = S.sel === c.id ? null : c.id; S.opt = {}; render(); } }, h('span.em.emo', em), nm);
      })));
    } else parts.push(h('div.th-log', S.log || ''));
    root.replaceChildren(...parts);
    const mc = S.pos[me];
    if (mc) requestAnimationFrame(() => { const tr = root.querySelector('.th-train'); if (tr) tr.scrollLeft = Math.max(0, mc.car * 109 - tr.clientWidth / 2 + 52); });
  }
  function submit(m) { api.toHost('pick', m); S.sel = null; S.opt = {}; api.sfx('card'); render(); }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, turn: 0, kind: 'std', plan: [], pick: 1, cars: [], pos: {}, marshal: C - 1, wal: {}, bul: {}, shots: {}, decks: {}, picks: {}, phase: 'wait', timer: 0, log: '', acting: null, order0: 0, nid: 0, sfx: null };
    ids.forEach((id) => { H.wal[id] = []; H.bul[id] = 6; H.shots[id] = 0; H.decks[id] = { deck: rng.shuffle(START_DECK.map((k) => ({ id: 'c' + H.nid++, k }))), hand: [], disc: [] }; });
    api.cleanup(() => clearTimeout(H.timer));
    const wallVal = (id) => H.wal[id].reduce((a, x) => a + x.v, 0);
    const pubCars = () => H.cars.map((c) => ({ in: c.in.map((x) => x.t), roof: c.roof.map((x) => x.t) }));
    const pub = (extra = {}) => {
      ids.forEach((id) => {
        if (api.player(id).left) return;
        api.sendTo(id, 'state', { phase: H.phase, round: H.round, turn: H.turn, turns: 4, kind: H.kind, pick: H.pick, cars: pubCars(), pos: H.pos, marshal: H.marshal, wal: Object.fromEntries(ids.map((i) => [i, H.wal[i].map((x) => x.t)])), bul: H.bul, shots: H.shots, locked: Object.keys(H.picks), hand: H.decks[id].hand, log: H.log, acting: H.acting, sfx: H.sfx, ...extra });
      });
      H.sfx = null;
    };
    const draw = (id, n) => {
      const d = H.decks[id];
      for (let i = 0; i < n; i++) { if (!d.deck.length) { d.deck = rng.shuffle(d.disc); d.disc = []; } if (d.deck.length) d.hand.push(d.deck.pop()); }
    };
    function newRound() {
      H.round++;
      H.cars = Array.from({ length: C }, (_, i) => {
        const inn = [];
        if (i === C - 1) inn.push({ t: 'box', v: 1000 });
        else { const np = 2 + (i > 0 ? rng.int(2) : 0); for (let k = 0; k < np; k++) inn.push({ t: 'purse', v: 250 + 250 * rng.int(2) }); if (i > 0 && rng.next() < 0.5) inn.push({ t: 'jewel', v: 500 }); }
        return { in: inn, roof: [] };
      });
      if (H.round > 1) { /* loot stays with players across rounds; train is refilled */ }
      H.marshal = C - 1;
      ids.forEach((id, i) => { H.pos[id] = { car: i % 2, roof: false }; });
      ids.forEach((id) => { const d = H.decks[id]; d.disc.push(...d.hand); d.hand = []; if (H.round === 1) draw(id, 6); else draw(id, 6); });
      H.plan = rng.shuffle(['std', 'std', 'speed', 'switch']);
      H.turn = -1; H.order0 = (H.round - 1) % N;
      nextTurn();
    }
    function nextTurn() {
      H.turn++;
      if (H.turn >= 4) return endRound();
      H.kind = H.plan[H.turn]; H.pick = 1;
      startPick();
    }
    function startPick() {
      H.picks = {}; H.phase = 'plan'; H.log = ''; H.acting = null;
      pub({ ms: 28000 });
      clearTimeout(H.timer);
      H.timer = setTimeout(reveal, 28500);
    }
    api.on('pick', (m, from) => {
      if (H.phase !== 'plan' || H.picks[from]) return;
      const d = H.decks[from];
      if (m.draw) H.picks[from] = { draw: true };
      else {
        const c = d.hand.find((x) => x.id === m.c);
        if (!c || c.k === 'bullet') return;
        const p = { c: c.id, k: c.k };
        if (['move', 'shoot', 'marshal', 'punch'].includes(c.k)) { if (m.dir !== -1 && m.dir !== 1) return; p.dir = m.dir; }
        if (c.k === 'move') p.dist = H.pos[from].roof ? Math.min(3, Math.max(1, m.dist | 0)) : 1;
        if (c.k === 'punch') { if (!ids.includes(m.target) || m.target === from) return; p.target = m.target; }
        H.picks[from] = p;
      }
      const need = ids.filter((id) => !api.player(id).left);
      if (need.every((id) => H.picks[id])) { clearTimeout(H.timer); H.timer = setTimeout(reveal, 500); } else pub({ keep: true });
    });
    function reveal() {
      clearTimeout(H.timer);
      if (H.phase !== 'plan') return;
      ids.forEach((id) => { if (!H.picks[id]) H.picks[id] = { draw: true }; });
      H.phase = 'act';
      let order = ids.map((_, i) => ids[(i + H.order0 + H.turn + H.pick - 1) % N]);
      if (H.kind === 'switch') order.reverse();
      const steps = order;
      let i = 0;
      const next = () => {
        if (i >= steps.length) { H.acting = null; return after(); }
        const id = steps[i++];
        act(id, H.picks[id]);
        H.timer = setTimeout(next, 1250);
      };
      H.log = 'Cards revealed!'; pub();
      H.timer = setTimeout(next, 900);
    }
    function after() {
      if (H.kind === 'speed' && H.pick === 1) { H.pick = 2; return startPick(); }
      H.timer = setTimeout(nextTurn, 600);
    }
    function discardCard(id, cid) { const d = H.decks[id]; const i = d.hand.findIndex((c) => c.id === cid); if (i >= 0) d.disc.push(...d.hand.splice(i, 1)); }
    const bulletTo = (id) => H.decks[id].disc.push({ id: 'b' + H.nid++, k: 'bullet' });
    const clampCar = (n) => Math.max(0, Math.min(C - 1, n));
    function marshalCheck(id) { // bandit ended inside the marshal's car
      const p = H.pos[id];
      if (!p.roof && p.car === H.marshal) { bulletTo(id); p.roof = true; H.log += ` ${nameOf(id)} is shot by the marshal and flees to the roof!`; H.sfx = 'boom'; }
    }
    function act(id, pk) {
      H.acting = id; H.sfx = null;
      const me = H.pos[id], who = nameOf(id);
      if (pk.draw) { draw(id, 3); H.log = `${who} draws 3 cards.`; return pub(); }
      discardCard(id, pk.c);
      switch (pk.k) {
        case 'move': { const n = clampCar(me.car + pk.dir * pk.dist); H.log = `${who} moves ${n === me.car ? 'nowhere' : pk.dir > 0 ? 'towards the engine' : 'towards the back'}.`; me.car = n; marshalCheck(id); H.sfx = 'pop'; break; }
        case 'floor': { me.roof = !me.roof; H.log = `${who} climbs ${me.roof ? 'up to the roof' : 'down inside'}.`; marshalCheck(id); H.sfx = 'pop'; break; }
        case 'shoot': {
          if (H.bul[id] <= 0) { H.log = `${who} is out of bullets!`; break; }
          let tgt = null;
          const others = ids.filter((o) => o !== id && H.pos[o].roof === me.roof);
          if (me.roof) { for (let c = me.car + pk.dir; c >= 0 && c < C && !tgt; c += pk.dir) { const f = others.filter((o) => H.pos[o].car === c); if (f.length) tgt = rng.pick(f); } }
          else { const f = others.filter((o) => H.pos[o].car === me.car + pk.dir); if (f.length) tgt = rng.pick(f); }
          if (tgt) { bulletTo(tgt); H.bul[id]--; H.shots[id]++; H.log = `${who} shoots ${nameOf(tgt)}!`; H.sfx = 'boom'; } else H.log = `${who} fires at nothing.`;
          break;
        }
        case 'punch': {
          const t = pk.target, tp = H.pos[t];
          if (tp && tp.car === me.car && tp.roof === me.roof) {
            const loot = H.wal[t];
            let msg = `${who} punches ${nameOf(t)}!`;
            if (loot.length) { const it = loot.splice(rng.int(loot.length), 1)[0]; H.cars[me.car][me.roof ? 'roof' : 'in'].push(it); msg += ` They drop ${LOOT[it.t]}.`; }
            tp.car = clampCar(tp.car + pk.dir * (me.roof ? 2 : 1)); marshalCheck(t);
            H.log = msg; H.sfx = 'bad';
          } else H.log = `${who} punches the air.`;
          break;
        }
        case 'rob': {
          const here = H.cars[me.car][me.roof ? 'roof' : 'in'];
          if (!here.length) { H.log = `${who} finds nothing to grab.`; break; }
          const rank = { box: 3, jewel: 2, purse: 1 };
          const best = Math.max(...here.map((x) => rank[x.t]));
          const pool = here.filter((x) => rank[x.t] === best);
          const it = rng.pick(pool);
          here.splice(here.indexOf(it), 1); H.wal[id].push(it);
          H.log = `${who} grabs ${LOOT[it.t]}!`; H.sfx = 'good';
          break;
        }
        case 'marshal': {
          H.marshal = clampCar(H.marshal + pk.dir);
          H.log = `${who} moves the marshal.`;
          ids.forEach((o) => { const p = H.pos[o]; if (!p.roof && p.car === H.marshal) { bulletTo(o); p.roof = true; H.log += ` ${nameOf(o)} is shot and flees to the roof!`; H.sfx = 'boom'; } });
          break;
        }
        default:
      }
      pub();
    }
    function endRound() {
      H.phase = 'roundEnd'; H.acting = null; H.log = H.round < rounds ? 'Round over — the train rolls on!' : 'The train pulls into the station…';
      pub();
      H.timer = setTimeout(() => { if (H.round >= rounds) finish(); else newRound(); }, 3500);
    }
    function finish() {
      const best = Math.max(...ids.map((id) => H.shots[id]));
      const bonus = (id) => (best > 0 && H.shots[id] === best ? 1000 : 0);
      const ranking = ids.map((id) => ({ id, score: wallVal(id) + bonus(id), note: `$${wallVal(id)}${bonus(id) ? ' + $1000 gunslinger' : ''}` })).sort((a, b) => b.score - a.score);
      const top = ranking[0].score;
      api.endGame({ title: `${ranking.filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} got away with the loot!`, subtitle: `$${top}`, ranking: ranking.map((r) => ({ ...r, score: '$' + r.score })), winners: ranking.filter((r) => r.score === top).map((r) => r.id) });
    }
    api.onRejoin(() => pub({ keep: true }));
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 2) { clearTimeout(H.timer); finish(); } else if (H.phase === 'plan') { if (ids.filter((i) => !api.player(i).left).every((i) => H.picks[i])) reveal(); else pub({ keep: true }); } });
    api.timeout(newRound, 800);
  }
  render();
}
