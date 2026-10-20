// Bean Bazaar — host-authoritative bean planting, trading and harvesting for 2–7 players.
// Original game name, writing and SVG art. Mechanics follow the classic fixed-order-hand trading game.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { botLoop, thinkMs } from '../bots.js';
import { Game, TYPES, coinsFor } from './beans-engine.js';
import { nextBotAction } from './beans-bot.js';
import { beanSvg, coinSvg, backSvg, colorOf, inkOf } from './beans-art.js';
import { CSS } from './beans-css.js';

const html = (tag, cls, markup) => { const e = h(tag, { class: cls }); e.innerHTML = markup; return e; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const nameOf = (id) => api.player(id)?.name || 'A player';
  const isBot = (id) => api.isBot(id);

  // ---------------------------------------------------------------- host
  let G = null;
  let finished = false;
  let publish = () => {};
  if (api.isHost) {
    G = new Game(ids, api.rng);
    if (api.restore?.beanBazaar === 1) {
      try {
        const s = api.restore;
        for (const k of ['type', 'deck', 'discard', 'box', 'exhausted', 'endPending', 'over', 'order', 'turn', 'phase', 'planted', 'faceUp', 'offers', 'oid', 'evs', 'evn', 'tradeAt', 'P', 'turnNo', 'result']) {
          if (s[k] !== undefined) G[k] = structuredClone(s[k]);
        }
        G.hidden = new Set(s.hidden || []);
        G.left = new Set(s.left || []);
      } catch (e) { console.error('[beans] bad saved position', e); G = new Game(ids, api.rng); }
    }

    const snapshot = () => ({
      beanBazaar: 1, type: G.type, deck: G.deck, discard: G.discard, hidden: [...G.hidden], box: G.box,
      exhausted: G.exhausted, endPending: G.endPending, over: G.over, order: G.order, turn: G.turn,
      phase: G.phase, planted: G.planted, faceUp: G.faceUp, offers: G.offers, oid: G.oid, evs: G.evs,
      evn: G.evn, tradeAt: G.tradeAt, left: [...G.left], P: G.P, turnNo: G.turnNo, result: G.result,
    });
    const finishRoom = () => {
      if (!G.over || finished) return;
      finished = true;
      const ranking = G.result.rows.map((r) => ({ id: r.id, score: r.total, note: `${r.before} saved + ${r.fields.reduce((a, f) => a + f.coins, 0)} harvested` }));
      const winner = G.result.winners[0];
      api.timeout(() => api.endGame({
        title: `${nameOf(winner)} rules the bazaar!`, subtitle: 'The fullest coin purse wins.', ranking, winners: [winner],
      }), 1800);
    };
    publish = (to) => {
      for (const id of (to ? [to] : ids)) if (!G.left.has(id)) api.sendTo(id, 'state', G.view(id));
      api.save(snapshot(), { turn: G.over ? null : G.active, over: G.over, moves: G.turnNo, summary: G.over ? `${nameOf(G.result.winners[0])} won with ${G.result.rows[0].total} coins` : '' });
      finishRoom();
    };
    api.on('act', (m, from) => {
      const r = G.act(from, m || {});
      if (r?.err) { api.sendTo(from, 'err', r.err); return; }
      publish();
    });
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => { G.leave(id); publish(); });

    const memos = {};
    botLoop(api, () => {
      if (!G || G.over) return null;
      const next = nextBotAction(G, api.bots, memos, api.level, ids.some((id) => !isBot(id)));
      if (!next) return null;
      return { delay: next.ms ?? thinkMs(api.level, 360, 560), run: () => api.botDo(next.id, 'act', next.m) };
    }, 180);
    api.timeout(() => { if (G.phase === 'wait') G.start(); publish(); }, 320);
  }

  // ---------------------------------------------------------------- client state and DOM
  let st = null;
  let lastEvent = 0;
  let selectedPending = null;
  let builder = null; // {to,give:Set,want:Object}
  let sheet = null;
  let tradeSeconds = 0;
  const root = h('div.bz');
  api.root.append(h('style', CSS), root);

  const act = (a, data = {}) => { api.toHost('act', { a, ...data }); };
  const me = () => st?.players[api.me];
  const active = () => st?.turn === api.me;
  const canHarvestView = (pid, f) => {
    const p = st.players[pid], fl = p.fields[f];
    if (!fl?.length) return false;
    if (st.cfg.duel && (pid !== st.turn || st.phase === 'over')) return false;
    return fl.length > 1 || p.fields.every((x) => x.length <= 1);
  };
  const canPlant = (f, c) => { const fl = me().fields[f]; return !!fl && (!fl.length || fl[0].t === c.t); };
  const targetCard = () => {
    if (!st) return null;
    if (active() && ['plant1', 'plant2'].includes(st.phase)) return st.hand[0] || null;
    if (st.phase === 'plant3' && me().pending.length) return me().pending.find((c) => c.id === selectedPending) || me().pending[0];
    if (active() && st.phase === 'offered' && me().offered.length) return me().offered.find((c) => c.id === selectedPending) || me().offered[0];
    if (active() && st.phase === 'draw3') return st.faceUp.find((c) => c.id === selectedPending) || null;
    return null;
  };

  function coin(label = '') { return html('span', 'bz-coin', coinSvg(label)); }
  function tag(t, text = TYPES[t].n) {
    const e = html('span', 'bz-tag', `<i>${beanSvg(t)}</i>${text}`);
    e.style.setProperty('--bc', colorOf(t)); return e;
  }
  function cardEl(c, opt = {}) {
    if (!c) return null;
    const T = TYPES[c.t], meter = T.v.map(([b, n]) => `<i><b>${b}</b><s>${n}</s></i>`).join('');
    const e = html('div', `bz-card ${opt.size || 'md'}${opt.hand ? ' hand' : ''}${opt.sel ? ' sel' : ''}${opt.next ? ' nextc' : ''}${opt.dim ? ' dim' : ''}${opt.click ? ' click' : ''}${opt.fresh ? ' new' : ''}`,
      `<div class="t">${T.n} · ${T.cnt}</div><div class="a">${beanSvg(c.t)}</div><div class="m">${meter}</div>` +
      `<div class="ci">${beanSvg(c.t)}</div><div class="vn">${T.n} · ${T.cnt}</div><div class="vm">${meter}</div>`);
    e.style.setProperty('--bc', colorOf(c.t)); e.style.setProperty('--ink', inkOf(c.t));
    e.title = `${T.n}: ${T.v.map(([b, n]) => `${b}→${n}`).join(', ')} coins`;
    if (opt.onclick) { e.onclick = opt.onclick; e.tabIndex = 0; e.setAttribute('role', 'button'); e.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opt.onclick(ev); } }; }
    return e;
  }
  function iconButton(name, title, fn, cls = '') { return h('button', { class: cls || 'bz-ib', title, 'aria-label': title, onclick: fn }, icon(name)); }

  function statusCopy() {
    if (st.over) return ['Harvest complete', 'Counting every coin in the bazaar.'];
    const who = active() ? 'Your turn' : `${nameOf(st.turn)}’s turn`;
    const copy = {
      offered: active() ? ['Resolve the offer', 'Plant or discard every card left for you.'] : [who, 'They are resolving the previous offer.'],
      plant1: active() ? ['Plant your front card', 'Hand order is fixed. Tap a glowing field.'] : [who, 'Planting the first card in hand.'],
      plant2: active() ? ['Plant again?', 'Plant the next card, or continue to the market.'] : [who, 'Choosing whether to plant a second card.'],
      discard: active() ? ['Optional discard', 'Discard any one hand card, or reveal three.'] : [who, 'May discard one card before the reveal.'],
      trade: active() ? ['Trade at the bazaar', 'Make deals, then close trading when ready.'] : [who, 'Offer a trade or accept one involving them.'],
      plant3: me().pending.length ? ['Plant your deliveries', 'Every traded or kept card must go into a field.'] : [who, 'Waiting for everyone to plant their deliveries.'],
      draw3: active() ? ['Choose from the market', 'Plant any you want, then offer the rest.'] : [who, 'Planting from the revealed market.'],
    };
    return copy[st.phase] || [who, 'The market is moving.'];
  }

  function renderOpponent(id) {
    const p = st.players[id], person = api.player(id);
    const el = h(`button.bz-op${id === st.turn ? '.turn' : ''}${p.left ? '.left' : ''}`, { onclick: () => { if (st.phase === 'trade' && active() && !p.left) openBuilder(id); } });
    el.append(h('div.hd', avatarEl(person, 'sm', { still: true }), h('div.nm', person.name), p.left ? h('small', 'Left') : null));
    el.append(h('div.st', h('span', h('i.hc'), p.hand), h('span', coin(), p.coins), p.pending.length ? h('span', `${p.pending.length} to plant`) : null));
    const fields = h('div.fl');
    p.fields.forEach((fl) => {
      if (!fl.length) fields.append(h('div.bz-mf.empty', 'Empty'));
      else {
        const t = fl[0].t, f = html('div', 'bz-mf has', `<div class="bn">${beanSvg(t)}</div><em>${fl.length}</em><div class="cv">${coinsFor(t, fl.length)} coin${coinsFor(t, fl.length) === 1 ? '' : 's'}</div>`);
        f.style.setProperty('--bc', colorOf(t)); f.style.setProperty('--ink', inkOf(t)); fields.append(f);
      }
    });
    el.append(fields);
    if (id === st.turn) el.append(h('span.bz-turnchip', 'Turn'));
    return el;
  }

  function wantChip(t, n = 1, remove) {
    const e = html('span', 'bz-wchip', `<span class="bn">${beanSvg(t)}</span>${n > 1 ? `${n}× ` : ''}${TYPES[t].n}`);
    e.style.setProperty('--bc', colorOf(t));
    if (remove) e.append(h('button', { title: 'Remove', onclick: remove }, '×'));
    return e;
  }
  function renderOffer(o) {
    const forMe = o.to === api.me || o.to === 'all', mine = o.from === api.me;
    const side = (items, wants = false) => h('div.side', items.length ? items.map((x) => wants && x.id === undefined ? wantChip(x.t, x.n) : cardEl(x, { size: 'xs' })) : h('span.none', 'gift'));
    const row = h(`div.bz-offer${forMe && !mine ? '.forme' : ''}${mine ? '.mine' : ''}`);
    row.append(h('div.who', icon('swap_horiz'), h('b', nameOf(o.from)), ' offers ', o.to === 'all' ? 'anyone' : nameOf(o.to)));
    const wants = o.want.map((w) => w.id !== undefined ? (st.faceUp.find((c) => c.id === w.id) || { id: w.id, t: st.types[0] }) : w);
    row.append(h('div.sw', side(o.give), h('span.ar', '⇄'), side(wants, true)));
    const buttons = h('div.acts');
    if (forMe && !mine) buttons.append(iconButton('check', 'Accept offer', () => act('accept', { id: o.id }), 'bz-cb ok'), iconButton('close', 'Decline offer', () => act('cancel', { id: o.id }), 'bz-cb no'));
    if (mine) buttons.append(iconButton('close', 'Withdraw offer', () => act('cancel', { id: o.id }), 'bz-cb no sm'));
    row.append(buttons); return row;
  }

  function renderField(fl, f) {
    const target = targetCard(), legal = target && canPlant(f, target), t = fl[0]?.t;
    const forced = target && !me().fields.some((_, i) => canPlant(i, target));
    const e = h(`div.bz-field${fl.length ? '' : '.empty'}${target ? (legal ? '.target' : '.no') : ''}${forced && canHarvestView(api.me, f) ? '.make' : ''}`, { onclick: legal ? () => act('plant', { f, card: target.id }) : null });
    const value = fl.length ? coinsFor(t, fl.length) : 0;
    const hv = h(`button.bz-hv${canHarvestView(api.me, f) ? (forced ? '.must' : '') : '.off'}`, { disabled: !canHarvestView(api.me, f), onclick: (ev) => { ev.stopPropagation(); act('harvest', { f }); } }, icon('paid'), fl.length ? `Harvest ${value}` : 'Empty');
    e.append(h('div.fh', h('span.fn', `Field ${f + 1}`), h('div.fv', fl.length ? [h('b', TYPES[t].n, ' · ', plural(fl.length, 'bean')), h('span', `${value} now · next coin at ${TYPES[t].v.find(([b]) => b > fl.length)?.[0] || 'max'}`)] : [h('b', 'Open soil'), h('span', legal ? `Plant ${TYPES[target.t].n} here` : 'Ready for any bean')]), hv));
    if (fl.length) {
      const stack = h('div.bz-stack'), recent = fl.slice(-7);
      recent.forEach((c, i) => { const ce = cardEl(c, { size: 'sm', fresh: i === recent.length - 1 }); ce.style.left = `${i * 28}px`; stack.append(ce); });
      e.append(stack);
      const max = TYPES[t].v.at(-1)[0], meter = h('div.bz-meter', h('div.tr', h('i', { style: `width:${Math.min(100, fl.length / max * 100)}%;--bc:${colorOf(t)}` })));
      TYPES[t].v.forEach(([b, c], i, a) => meter.append(h(`span.tk${fl.length >= b ? '.got' : ''}${i === a.length - 1 ? '.last' : ''}`, { style: `left:${b / max * 100}%` }, b, h('s', c))));
      e.append(meter);
    }
    return e;
  }

  function renderCenter() {
    const center = h('div.bz-center');
    if (st.faceUp.length || ['trade', 'draw3'].includes(st.phase)) {
      const cards = h('div.cards', st.faceUp.map((c) => {
        const marketPick = active() && st.phase === 'draw3';
        const tradePick = !!builder && active() && st.phase === 'trade';
        return cardEl(c, {
          size: 'md', click: marketPick || tradePick, sel: c.id === selectedPending || !!builder?.give.has(c.id),
          onclick: tradePick ? () => toggleGive(c.id) : marketPick ? () => { selectedPending = selectedPending === c.id ? null : c.id; render(); } : null,
        });
      }));
      const label = h('div.lbl', h('b', st.cfg.duel ? 'Market reveal' : 'Two on the table'), st.cfg.duel ? 'Plant any cards you want. Everything left becomes an offer.' : 'These must be traded, donated, or planted by the active player.');
      center.append(h('div.bz-panel.bz-fu', cards, label));
    }
    if (st.phase === 'trade' || st.offers.length) {
      const board = h('div.bz-panel', h('div.bz-board-h', h('b', 'Offer ledger'), h('span', `${st.offers.length} open`)));
      if (st.phase === 'trade') board.append(h('div.bz-timer', h('i', { style: `transform:scaleX(${Math.max(0, Math.min(1, tradeSeconds / 45))})` })), h('div.bz-timer-t', active() ? 'Trading stays open until you close it.' : 'Make an offer — the active player is part of every deal.'));
      board.append(h('div.bz-offers', st.offers.length ? st.offers.map(renderOffer) : h('div.bz-empty', 'No offers yet. Gifts are allowed — generosity can clear a blocked hand.')));
      center.append(board);
    }
    return center;
  }

  function renderHand() {
    const wrap = h('div.bz-handw', h('span.bz-hand-lb', 'Fixed-order hand'));
    const scroller = h('div.bz-hand'), inside = h('div.bz-hand-in');
    inside.style.width = `${Math.max(330, 64 + Math.max(0, st.hand.length - 1) * 40)}px`;
    st.hand.forEach((c, i) => {
      const give = builder?.give.has(c.id), selectable = builder || (active() && st.phase === 'discard');
      const ce = cardEl(c, { hand: true, next: i === 0 && ['plant1', 'plant2'].includes(st.phase), sel: give, click: !!selectable, onclick: selectable ? () => { if (builder) toggleGive(c.id); else act('discard', { card: c.id }); } : null });
      ce.style.left = `${i * 40}px`; ce.style.zIndex = String(i + 1); inside.append(ce);
    });
    if (!st.hand.length) inside.append(h('div.bz-handempty', 'Your hand is empty.'));
    scroller.append(inside); wrap.append(scroller); return wrap;
  }

  function renderDock() {
    const dock = h('div.bz-dock');
    const pending = st.phase === 'offered' ? me().offered : me().pending;
    if (pending.length) dock.append(h('div.bz-pending', h('span.lb', st.phase === 'offered' ? 'Offered' : 'To plant'), h('div.cs', pending.map((c) => cardEl(c, { size: 'sm', click: true, sel: c.id === selectedPending, onclick: () => { selectedPending = selectedPending === c.id ? null : c.id; render(); } })))));
    const actions = h('div.bz-act');
    if (st.phase === 'plant2' && active()) actions.append(h('button.bz-btn.pri', { onclick: () => act('skip') }, icon('arrow_forward'), 'Reveal market'));
    if (st.phase === 'discard' && active()) actions.append(h('button.bz-btn.pri', { onclick: () => act('skip') }, icon('style'), 'Reveal 3'));
    if (st.phase === 'offered' && active() && me().offered.length) actions.append(h('button.bz-btn', { onclick: () => { const c = me().offered.find((x) => x.id === selectedPending) || me().offered[0]; act('discard', { card: c.id }); } }, icon('delete'), 'Discard selected'));
    if (st.phase === 'draw3' && active()) actions.append(h('button.bz-btn.pri', { onclick: () => act('skip') }, icon('redeem'), 'Offer the rest'));
    if (st.phase === 'trade') actions.append(h('button.bz-btn.good', { onclick: () => openBuilder(active() ? 'all' : st.turn) }, icon('swap_horiz'), 'Make offer'));
    actions.append(h('span.sp'));
    if (st.phase === 'trade' && active()) actions.append(h('button.bz-btn.pri', { onclick: () => act('endtrade') }, icon('done_all'), 'Close trading'));
    dock.append(actions, renderHand()); return dock;
  }

  function renderBuilder() {
    const e = h('div.bz-builder');
    e.append(h('div.row1', h('b', 'Build an offer'), iconButton('close', 'Close offer builder', () => { builder = null; render(); })));
    const to = h('div.bz-to'), targets = active() ? ['all', ...st.order.filter((id) => id !== api.me && !st.players[id].left)] : [st.turn];
    targets.forEach((id) => to.append(h(`button${builder.to === id ? '.on' : ''}${id === 'all' ? '.pad' : ''}`, { onclick: () => { builder.to = id; render(); } }, id === 'all' ? 'Anyone' : [avatarEl(api.player(id), 'xs', { still: true }), nameOf(id)])));
    e.append(to);
    const giveCards = [...builder.give].map((id) => st.hand.find((c) => c.id === id) || st.faceUp.find((c) => c.id === id)).filter(Boolean);
    const give = h('div.bz-tray', h('h6', 'You give'), h('div.in', giveCards.length ? giveCards.map((c) => cardEl(c, { size: 'sm', click: true, onclick: () => toggleGive(c.id) })) : h('span.hint', 'Tap cards in your hand or on the table.')));
    const wants = Object.entries(builder.want).filter(([, n]) => n > 0);
    const get = h('div.bz-tray', h('h6', 'You receive'), h('div.in', wants.length ? wants.map(([t, n]) => wantChip(t, n, () => { builder.want[t]--; render(); })) : h('span.hint', 'Choose bean types below.')));
    e.append(h('div.bz-two', give, get));
    const types = h('div.bz-types');
    st.types.forEach((t) => { const b = html('button', `bz-tp${builder.want[t] ? ' on' : ''}`, `<span class="bn">${beanSvg(t)}</span>${builder.want[t] ? builder.want[t] + '× ' : ''}${TYPES[t].n}`); b.style.setProperty('--bc', colorOf(t)); b.onclick = () => { builder.want[t] = Math.min(6, (builder.want[t] || 0) + 1); render(); }; types.append(b); });
    e.append(types, h('button.bz-btn.pri', { disabled: !giveCards.length && !wants.length, onclick: submitOffer }, icon('send'), giveCards.length || wants.length ? 'Post offer' : 'Add something first'));
    return e;
  }

  function toggleGive(id) { if (!builder) return; builder.give.has(id) ? builder.give.delete(id) : builder.give.add(id); render(); }
  function openBuilder(to) { builder = { to, give: new Set(), want: {} }; render(); }
  function submitOffer() { const want = Object.entries(builder.want).filter(([, n]) => n > 0).map(([t, n]) => ({ t, n })); act('offer', { to: builder.to, give: [...builder.give], want }); builder = null; }

  function showSheet(kind) { sheet = kind; render(); }
  function renderSheet() {
    if (!sheet) return null;
    const close = () => { sheet = null; render(); };
    let body;
    if (sheet === 'prices') body = h('div.bz-sheet', h('h3', h('span', 'Bean price board'), iconButton('close', 'Close', close)), h('table.bz-chart', h('tbody', st.types.map((t) => h('tr', h('td.nm', TYPES[t].n, h('small', `${TYPES[t].cnt} cards`)), h('td.mt', TYPES[t].v.map(([b, c]) => h('span', b, '→', coin(c)))), h('td.rm', `${TYPES[t].v[0][0]} for first coin`))))));
    else body = h('div.bz-sheet', h('h3', h('span', 'Market log'), iconButton('close', 'Close', close)), h('div.bz-log', st.evs.slice().reverse().map(eventLine)));
    return h('div.bz-scrim', { onclick: (ev) => { if (ev.target === ev.currentTarget) close(); } }, body);
  }

  function eventLine(ev) {
    let text = '';
    if (ev.k === 'turn') text = `Turn ${st.turnNo} · ${nameOf(ev.who)}`;
    if (ev.k === 'plant') text = `${nameOf(ev.who)} planted ${TYPES[ev.card.t].n}.`;
    if (ev.k === 'harvest') text = `${nameOf(ev.who)} harvested ${ev.n} ${TYPES[ev.t].n} for ${plural(ev.coins, 'coin')}.`;
    if (ev.k === 'trade') text = `${nameOf(ev.a)} and ${nameOf(ev.b)} completed a trade.`;
    if (ev.k === 'offer') text = `${nameOf(ev.from)} posted an offer.`;
    if (ev.k === 'decline') text = `${nameOf(ev.by)} declined ${nameOf(ev.from)}’s offer.`;
    if (ev.k === 'withdraw') text = `${nameOf(ev.from)} withdrew an offer.`;
    if (ev.k === 'faceup') text = `${nameOf(ev.who)} revealed ${ev.cards.map((c) => TYPES[c.t].n).join(' and ')}.`;
    if (ev.k === 'draw') text = ev.who === 'all' ? 'Everyone drew one card.' : `${nameOf(ev.who)} drew ${ev.n}.`;
    if (ev.k === 'reshuffle') text = `Discard pile became draw pile ${ev.pass}.`;
    if (ev.k === 'buy') text = `${nameOf(ev.who)} bought a third field.`;
    if (ev.k === 'discard') text = `${nameOf(ev.who)} discarded ${TYPES[ev.card.t].n}.`;
    return h(`div${ev.k === 'turn' ? '.turn' : ''}`, text || 'The bazaar moved on.');
  }

  function renderFinal() {
    const box = h('div.bz-final', h('h2', `${nameOf(st.result.winners[0])} rules the bazaar!`), h('div.sub', 'Fields are harvested automatically. Cards still in hand do not score.'));
    st.result.rows.forEach((r) => {
      const row = h(`div.bz-score${st.result.winners.includes(r.id) ? '.win' : ''}`, h('div.h', avatarEl(api.player(r.id), 'md', { still: true }), h('b', nameOf(r.id)), h('span.tot', coin(), r.total)));
      row.append(h('div.ln', 'Coins saved during play', h('span.g', coin(), r.before)));
      r.fields.filter((f) => f.t).forEach((f) => row.append(h('div.ln', tag(f.t, `${f.n} ${TYPES[f.t].n}`), h('span.g', coin(), f.coins))));
      row.append(h('div.note', `${plural(r.hand, 'card')} left in hand · no value`)); box.append(row);
    });
    return box;
  }

  function processEvents() {
    for (const ev of st.evs) {
      if (ev.n <= lastEvent) continue;
      if (lastEvent) {
        if (ev.k === 'plant') api.sfx('place', 0.55);
        else if (ev.k === 'harvest') api.sfx(ev.coins ? 'coin' : 'slide', 0.65);
        else if (ev.k === 'trade') api.sfx('deal', 0.6);
        else if (ev.k === 'faceup') api.sfx('flip', 0.55);
        else if (ev.k === 'draw') api.sfx('fan', 0.45);
        else if (ev.k === 'reshuffle') api.sfx('shuffle', 0.55);
        else if (ev.k === 'turn' && ev.who === api.me) api.sfx('turn', 0.6);
        else if (ev.k === 'buy') api.sfx('chips', 0.6);
        else if (ev.k === 'end') api.sfx(st.result.winners.includes(api.me) ? 'win' : 'ding', 0.7);
      }
      lastEvent = ev.n;
    }
  }

  function render() {
    if (!st) return;
    const [title, sub] = statusCopy();
    const top = h('div.bz-top', h(`div.bz-status${active() ? '.mine' : ''}`, h('b', title), h('span', sub)));
    const drawPile = h('div.bz-pile', html('div', 'bz-pcard', backSvg()), h('b', st.deck));
    const disc = h('div.bz-pile.disc', st.dtop ? h('div.bz-pcard', cardEl(st.dtop, { size: 'xs' })) : h('div.bz-pcard'), h('b', st.discard));
    top.append(h('div.bz-piles', drawPile, disc, h('div.bz-pass', `${st.exhausted}/${st.cfg.passes} passes`)), iconButton('menu_book', 'Price board', () => showSheet('prices')), iconButton('history', 'Market log', () => showSheet('log')));
    const opponents = st.order.filter((id) => id !== api.me);
    const myFields = h('div.bz-fields', me().fields.map(renderField));
    const buy = st.cfg.cost != null && me().fields.length < 3 ? h(`button.bz-buy${me().coins >= st.cfg.cost ? '.ready' : ''}`, { disabled: me().coins < st.cfg.cost || (st.cfg.duel && !active()), onclick: () => act('buy') }, icon('add'), `Third field · ${st.cfg.cost}`, coin()) : null;
    const farm = h('div.bz-col', h('div.bz-farmhd', h('div.bz-sec', 'Your farm', h('i')), h('div.bz-purse', coin(), me().coins), buy), myFields);
    const table = h('div.bz-col', opponents.length ? h('div', h('div.bz-sec', 'Other farmers', h('i')), h('div.bz-opps', opponents.map(renderOpponent))) : null, h('div.bz-sec', 'Bazaar table', h('i')), renderCenter());
    root.replaceChildren(top, h('div.bz-main', table, farm), builder ? renderBuilder() : renderDock());
    const overlay = renderSheet(); if (overlay) root.append(overlay);
    if (st.over && st.result) root.append(renderFinal());
  }

  api.on('state', (s) => {
    st = s;
    if (!['plant3', 'offered', 'draw3'].includes(st.phase)) selectedPending = null;
    if (st.phase !== 'trade') builder = null;
    if (!st.evs.some((e) => e.k === 'turn' && e.n > lastEvent)) tradeSeconds = 0;
    processEvents(); render();
  });
  api.on('err', (msg) => { api.toast(msg); api.sfx('bad', 0.55); });
  api.onPlayersChanged(() => st && render());
  api.interval(() => { if (!st || st.phase !== 'trade') return; tradeSeconds = Math.min(45, tradeSeconds + 1); const bar = root.querySelector('.bz-timer i'); if (bar) bar.style.transform = `scaleX(${tradeSeconds / 45})`; }, 1000);
}
