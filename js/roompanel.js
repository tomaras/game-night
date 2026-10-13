// The in-room side panel: Chat · People · Room. On wide screens it lives in the right-hand column, on phones it is the
// bottom sheet that the chat / people buttons open. People = players, the audience, join requests and an
// "invite someone from the lounge" list; Room = invite code, link, QR and the host's room settings.
import { h, mount, copyText } from './util.js';
import { icon, iconBtn, openSheet, segmented, switchEl, confirmDialog } from './ui.js';
import { avatarEl } from './avatar.js';
import { qrSvg } from './qr.js';
import { roomLink, CFG } from './net.js';
import { GAME_BY_ID } from './games/index.js';

const TABS = [['chat', 'chat_bubble', 'Chat'], ['people', 'group', 'People'], ['room', 'tune', 'Room']];
export const watchLink = (n) => roomLink(n) + '/watch';

export function createRoomPanel({ room, chatEl, plaza, toast, copyInvite, onRecord, openComms }) {
  let active = 'chat';
  let qrOpen = false;
  const offs = [];
  const bar = h('div.ptabs', { role: 'tablist' });
  const body = h('div.pbody');
  const el = h('div.rpanel', bar, body);
  const cbs = new Set();
  const badge = { people: 0 };

  const copy = async (text, msg) => { const ok = await copyText(text); toast(ok ? msg : 'Copy failed — select the text manually', ok ? 'good' : 'bad'); };

  // ------------------------------------------------------------ People
  function personRow(p, kind) {
    const host = room.isHost, st = room.state, me = p.id === room.me;
    const tags = [];
    if (p.id === st.hostId && kind === 'player') tags.push(h('span.chip.blue', 'Host'));
    if (p.bot) tags.push(h('span.chip', 'Computer'));
    if (!p.online) tags.push(h('span.chip.yellow', 'Reconnecting'));
    if (p.av?.on) tags.push(h('span.chip.green', icon(p.av.mic ? 'mic' : 'mic_off', 'sm')));
    const acts = [];
    if (host && kind === 'aud') acts.push(h('button.btn.small.tonal', { onclick: () => room.promote(p.id) }, icon('person_add', 'sm'), 'Play'));
    if (host && !me && !p.bot) acts.push(iconBtn('person_remove', 'Remove ' + p.name, async () => { if (await confirmDialog(`Remove ${p.name}?`, 'They can’t come back unless you restart the room.', { ok: 'Remove', danger: true })) room.kick(p.id); }, 'sm'));
    if (host && p.bot) acts.push(iconBtn('close', 'Remove computer', () => room.removeBot(p.id), 'sm'));
    return h('div.pp-row', avatarEl(p, 'sm'), h('div.pp-name', h('b', p.name + (me ? ' (you)' : '')), tags.length ? h('div.pp-tags', tags) : null), h('span.spacer'), ...acts);
  }

  function requestsBlock() {
    if (!room.isHost || !room.requests.length) return null;
    return h('div.pp-sec', h('div.kt-title', 'Wants in'), room.requests.map((r) => h('div.pp-row.req', avatarEl({ avatar: r.avatar, name: r.name }, 'sm'),
      h('div.pp-name', h('b', r.name), h('div.pp-tags', h('span.muted', r.kind === 'play' ? 'wants to play' : 'wants to join'))), h('span.spacer'),
      h('button.btn.small.primary', { onclick: () => room.approve(r.key) }, 'Let in'), iconBtn('close', 'Decline', () => room.deny(r.key), 'sm'))));
  }

  function inviteBlock() {
    if (room.isAudience) return null;
    return h('div.pp-sec', h('button.btn.tonal.block', { onclick: openInvite }, icon('person_search'), 'Invite someone who’s online'));
  }

  function openInvite() {
    const list = h('div.col', { style: 'gap:6px' });
    const paint = () => {
      const inThis = new Set(room.people.map((p) => p.name));
      const people = plaza.online.filter((p) => !p.room);
      mount(list, people.length ? people.map((p) => h('div.pp-row', avatarEl(p, 'sm'), h('div.pp-name', h('b', p.name), h('div.pp-tags', h('span.muted', p.ch ? 'in the Lounge' : 'browsing'))), h('span.spacer'),
        h('button.btn.small.tonal', { disabled: inThis.has(p.name) && false, onclick: (e) => { plaza.invite(p.cid, room.number, room.state.gameId); e.currentTarget.textContent = 'Sent ✓'; e.currentTarget.disabled = true; } }, 'Invite')))
        : h('div.empty', plaza.connected ? 'Nobody else is around right now. Share the link instead!' : 'Connecting to the lounge…'));
    };
    paint();
    const off = plaza.on('people', paint);
    openSheet(h('div.col', { style: 'gap:12px' }, h('h2', 'Invite someone'), h('div.muted', 'They get a pop-up with a button to join your room.'), list), { onClose: off });
  }

  function peopleView() {
    const st = room.state;
    return h('div.pp', requestsBlock(),
      h('div.pp-sec', h('div.kt-title', `Players · ${st.players.length}`), st.players.map((p) => personRow(p, 'player'))),
      st.aud ? h('div.pp-sec', h('div.kt-title', `Watching · ${st.audience.length}`), st.audience.length ? st.audience.map((p) => personRow(p, 'aud')) : h('div.muted', { style: 'font-size:13px' }, 'Nobody is watching yet. People can watch from the room list or your watch link.')) : null,
      inviteBlock(),
      room.isAudience ? h('div.pp-sec', h('button.btn.primary.block', { onclick: () => { room.askToPlay(); toast('Asked the host for a seat', 'good'); } }, icon('sports_esports'), 'Ask to play')) : null);
  }

  // ------------------------------------------------------------ Room
  function roomView() {
    const st = room.state, host = room.isHost;
    const link = roomLink(room.number);
    const setting = (label, sub, control) => h('div.pp-set', h('div', h('b', label), sub ? h('div.muted', { style: 'font-size:12.5px;line-height:1.35' }, sub) : null), control);
    return h('div.pp',
      h('div.pp-sec.invite2',
        h('div.lbl', 'Room code'), h('div.bignum.sm', room.number), h('div.pp-link', link.replace(/^https?:\/\//, '')),
        h('div.row.wrap', { style: 'gap:6px;justify-content:center' },
          h('button.btn.small.primary', { onclick: copyInvite }, icon('link'), 'Copy link'),
          navigator.share ? h('button.btn.small.tonal', { onclick: () => navigator.share({ title: 'Game Night', text: `Join my game room ${room.number}!`, url: link }).catch(() => {}) }, icon('share'), 'Share') : null,
          h('button.btn.small.tonal', { onclick: () => { qrOpen = !qrOpen; paint(); } }, icon('qr_code_2'), qrOpen ? 'Hide QR' : 'QR code')),
        qrOpen ? h('div.qrbox', { innerHTML: qrSvg(link) }) : null,
        qrOpen ? h('div.muted', { style: 'font-size:12.5px;text-align:center' }, 'Point a phone camera at it to join.') : null),
      st.aud ? h('div.pp-sec', h('button.btn.tonal.block', { onclick: () => copy(watchLink(room.number), 'Watch link copied') }, icon('visibility'), 'Copy a watch-only link')) : null,
      h('div.pp-sec', h('div.kt-title', host ? 'Room settings' : 'Room settings (set by the host)'),
        setting('Show in the room list', 'Anyone online can see this room and its players.', host ? switchEl(st.pub, (v) => room.setSetting('pub', v)) : h('span.chip', st.pub ? 'Listed' : 'Hidden')),
        setting('Who can join', st.access === 'ask' ? 'People from the room list ask first. Friends with the code walk right in.' : st.access === 'open' ? 'Anyone can come in.' : 'Nobody new can join.',
          host ? segmented([{ value: 'open', label: 'Open' }, { value: 'ask', label: 'Ask' }, { value: 'locked', label: 'Locked' }], st.access, (v) => room.setSetting('access', v)) : h('span.chip', { open: 'Open', ask: 'Ask first', locked: 'Locked' }[st.access])),
        setting('Allow watching', 'People can sit in the audience: they see the game and chat, but don’t play.', host ? switchEl(st.aud, (v) => room.setSetting('aud', v)) : h('span.chip', st.aud ? 'Yes' : 'No'))),
      h('div.pp-sec', openComms ? h('button.btn.tonal.block', { onclick: openComms }, icon('headset'), 'Voice, video & chat…') : null, onRecord ? h('button.btn.tonal.block', { onclick: onRecord }, icon('fiber_manual_record'), 'Record…') : null),
      h('div.muted', { style: 'font-size:12px;text-align:center;margin-top:8px' }, `${CFG.env === 'prod' ? '' : CFG.env + ' · '}${CFG.build}`));
  }

  // ------------------------------------------------------------ frame
  function paint() {
    badge.people = (room.isHost ? room.requests.length : 0);
    mount(bar, TABS.map(([id, ic, label]) => h('button.ptab' + (id === active ? '.on' : ''), { role: 'tab', 'aria-selected': String(id === active), onclick: () => show(id) },
      icon(ic, 'sm'), h('span', label), id === 'people' && badge.people ? h('span.dot.static', badge.people) : null)));
    if (active === 'chat') { if (body.firstChild !== chatEl || body.childNodes.length !== 1) mount(body, chatEl); }
    else mount(body, active === 'people' ? peopleView() : roomView());
    cbs.forEach((f) => f(active, badge));
  }
  function show(id) { active = id; paint(); if (id === 'chat') setTimeout(() => chatEl.querySelector('input')?.focus(), 0); }

  offs.push(room.on('state', () => { if (active !== 'chat' || true) paint(); }), room.on('requests', paint));
  paint();
  return {
    el, show, paint,
    get active() { return active; },
    get pending() { return badge.people; },
    onChange(fn) { cbs.add(fn); return () => cbs.delete(fn); },
    destroy() { offs.forEach((f) => f()); },
  };
}

export const gameName = (id) => GAME_BY_ID[id]?.name || 'a game';
