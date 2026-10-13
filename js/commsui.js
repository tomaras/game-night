// Buttons and sheets for voice / video / chat scopes: the mic + camera buttons (each with a tiny Room/Global badge you can
// tap to move it), the "Voice, video & chat" sheet, the Lounge channel list, and the mini call bar.
import { h, mount } from './util.js';
import { icon, iconBtn, openSheet, segmented } from './ui.js';
import { avatarEl } from './avatar.js';
import { LOUNGE_CHANNELS, CHANNEL_CAP, plaza } from './plaza.js';
import { channelName } from './lounge.js';

const SCOPES = [{ value: 'room', label: 'Room', icon: 'meeting_room' }, { value: 'global', label: 'Global', icon: 'public' }];

/** The two header buttons. They stay in sync with `comms` by themselves. */
export function createCommsButtons(comms, { toast, openTray }) {
  const mk = (kind, title) => {
    const badge = h('span.sbadge'); // just a label (R = room, G = global): a tap on the button ALWAYS turns it on/off
    let timer = 0, held = false;
    const btn = h('button.iconbtn.cbtn', { title: title + ' — hold for more options', 'aria-label': title,
      onclick: () => { if (held) { held = false; return; } if (!comms.supported) return toast('Voice & video need a secure (https) page and a browser with WebRTC support.', 'bad'); comms.toggle(kind); },
      oncontextmenu: (e) => e.preventDefault() });
    btn.addEventListener('pointerdown', () => { held = false; clearTimeout(timer); timer = setTimeout(() => { held = true; openTray?.(); }, 520); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => clearTimeout(timer));
    return { btn, badge, kind };
  };
  const mic = mk('mic', 'Microphone'), cam = mk('cam', 'Camera');
  function paint() {
    const st = comms.state;
    for (const x of [mic, cam]) {
      const on = x.kind === 'mic' ? st.mic : st.cam, scope = st.scope[x.kind];
      const inCall = !!(comms.roomAV?.local.on || comms.loungeAV?.local.on);
      x.btn.classList.toggle('live', on);
      x.btn.classList.toggle('muted', !on && inCall && x.kind === 'mic');
      const name = x.kind === 'mic' ? (on ? 'mic' : inCall ? 'mic_off' : 'mic') : on ? 'videocam' : 'videocam_off';
      x.btn.replaceChildren(icon(name), x.badge);
      x.badge.textContent = scope === 'room' ? 'R' : 'G';
      x.badge.classList.toggle('g', scope === 'global');
      x.btn.setAttribute('aria-label', `${x.kind === 'mic' ? 'Microphone' : 'Camera'} ${on ? 'on' : 'off'}, sending to ${scope === 'room' ? 'room' : 'global'}`);
    }
  }
  comms.on('change', paint); comms.on('scope', paint); comms.on('avs', paint);
  paint();
  return { buttons: [mic.btn, cam.btn], paint };
}

/** The "Voice, video & chat" sheet: one place to see and move everything. */
export function openCommsSheet(comms, { inRoom, roomNumber, goLounge }) {
  const body = h('div.col', { style: 'gap:14px' });
  const row = (ic, label, sub, control, extra) => h('div.crow', h('div.cic', icon(ic)), h('div.grow', h('b', label), sub ? h('div.muted', { style: 'font-size:12.5px' }, sub) : null), control, extra || null);
  const paint = () => {
    const st = comms.state;
    const where = (s) => (s === 'room' ? (inRoom ? `Room ${roomNumber}` : 'No room yet') : comms.channel ? channelName(comms.channel) : 'Lounge');
    const toggle = (kind, on) => h('button.btn.small' + (on ? '.bad' : '.primary'), { onclick: () => comms.toggle(kind) }, on ? 'Turn off' : 'Turn on');
    mount(body,
      h('h2', 'Voice, video & chat'),
      h('div.muted', { style: 'font-size:13.5px;margin-top:-6px' }, 'Each one can go to your room or to everybody in the Lounge. Move it any time — calls stay connected.'),
      h('div.crows',
        row('mic', 'Microphone', `Sends to ${where(st.scope.mic)}`, h('div.crctl', segmented(SCOPES, st.scope.mic, (v) => comms.setScope('mic', v)), toggle('mic', st.mic))),
        row('videocam', 'Camera', `Sends to ${where(st.scope.cam)}`, h('div.crctl', segmented(SCOPES, st.scope.cam, (v) => comms.setScope('cam', v)), toggle('cam', st.cam))),
        row('chat_bubble', 'Chat', `Typing goes to ${st.scope.chat === 'room' ? (inRoom ? 'your room' : 'no room yet') : 'everyone in the Lounge'}`, h('div.crctl', segmented(SCOPES, st.scope.chat, (v) => comms.setScope('chat', v))))),
      h('div.kt-title', 'Lounge voice channels'),
      channelList(comms, { toast: null }),
      goLounge ? h('button.btn.tonal.block', { onclick: () => { sheet.close(); goLounge(); } }, icon('forum'), 'Open the Lounge') : null);
  };
  const offs = [comms.on('change', paint), comms.on('scope', paint), comms.on('avs', paint), plaza.on('people', paint)];
  paint();
  const sheet = openSheet(body, { onClose: () => offs.forEach((f) => f()) });
  return sheet;
}

/** The list of Lounge channels with who is in each, and Join / Leave. */
export function channelList(comms) {
  const list = h('div.chlist');
  const paint = () => {
    mount(list, LOUNGE_CHANNELS.map((c) => {
      const members = plaza.channelMembers(c.id);
      const mine = comms.channel === c.id;
      const n = members.length + (mine ? 1 : 0);
      const full = !mine && n >= CHANNEL_CAP;
      return h('div.chrow' + (mine ? '.on' : ''),
        h('div.cic', icon(mine ? 'headset' : 'volume_up')),
        h('div.grow', h('b', c.name), h('div.row', { style: 'gap:2px;margin-top:3px;min-height:22px' }, members.slice(0, 6).map((p) => avatarEl(p, 'xs', { still: true })), n ? null : h('span.muted', { style: 'font-size:12.5px' }, 'Empty'))),
        h('span.chip' + (full ? '.red' : ''), `${n}/${CHANNEL_CAP}`),
        mine ? h('button.btn.small.bad', { onclick: () => comms.leaveChannel() }, 'Leave') : h('button.btn.small.tonal', { disabled: full, onclick: () => comms.joinChannel(c.id) }, 'Join'));
    }));
  };
  const offs = [plaza.on('people', paint), comms.on('avs', paint)];
  const watch = () => { if (!list.isConnected) { offs.forEach((f) => f()); return; } };
  paint();
  list.destroy = () => offs.forEach((f) => f());
  const iv = setInterval(() => { if (!list.isConnected) { clearInterval(iv); list.destroy(); } }, 4000);
  return list;
}

/** A slim bar shown above the bottom navigation while you're in a Lounge call and not looking at it. */
export function createMiniCall(comms, { go }) {
  const el = h('div.minicall.hide');
  function paint() {
    const av = comms.loungeAV;
    if (!av || !av.local.on || comms.hidden) { el.classList.add('hide'); return; }
    const n = plaza.channelMembers(comms.channel).length + 1;
    el.classList.remove('hide');
    const st = comms.state;
    mount(el,
      h('button.mc-main', { onclick: go }, icon('headset'), h('b', channelName(comms.channel)), h('span.muted', `${n} in call`)),
      h('button.iconbtn.sm' + (st.mic && st.scope.mic === 'global' ? '.live' : ''), { 'aria-label': 'Microphone', onclick: async () => { if (comms.scope.mic !== 'global') { await comms.setScope('mic', 'global'); if (!comms.micWant) await comms.toggle('mic'); } else await comms.toggle('mic'); } }, icon(st.mic && st.scope.mic === 'global' ? 'mic' : 'mic_off')),
      h('button.iconbtn.sm.bad', { 'aria-label': 'Leave the Lounge call', onclick: () => comms.leaveChannel() }, icon('call_end')));
  }
  comms.on('change', paint); comms.on('avs', paint); comms.on('scope', paint); plaza.on('people', paint);
  paint();
  return { el, paint };
}
