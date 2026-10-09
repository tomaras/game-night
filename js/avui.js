// UI for the voice/video call: the mic / camera buttons in the app bar and the dock of participant tiles.
import { h } from './util.js';
import { avatarEl } from './avatar.js';
import { icon, iconBtn } from './ui.js';

export function createAvUI(room, av, { toast }) {
  const dock = h('aside.avdock');
  const tilesEl = h('div.avtiles');
  const joinCard = h('div.avjoin');
  const barEl = h('div.avbar');
  const gestureBtn = h('button.btn.small.primary.hide', { onclick: () => { tiles.forEach((t) => t.video.play().catch(() => {})); gestureBtn.classList.add('hide'); } }, icon('volume_up'), 'Tap to hear');
  dock.append(joinCard, tilesEl, barEl, gestureBtn);
  const tiles = new Map();

  const micBtn = iconBtn('mic', 'Microphone — join the voice call and talk', () => guard(() => av.toggleMic()));
  const camBtn = iconBtn('videocam', 'Camera — let everyone see you', () => guard(() => av.toggleCam()));

  function guard(fn) {
    if (!av.supported) return toast('Voice & video need a secure (https) page and a browser with WebRTC support.', 'bad');
    fn();
  }
  const offErr = av.on('error', (e) => {
    const n = e && e.name;
    toast(n === 'NotAllowedError' || n === 'SecurityError' ? 'Permission blocked — allow the microphone/camera in your browser, then try again.' : n === 'NotFoundError' ? 'No microphone/camera was found on this device.' : 'Could not start your microphone/camera: ' + (e && e.message), 'bad');
  });

  function tileFor(id) {
    let t = tiles.get(id);
    if (t) return t;
    const video = h('video', { autoplay: true, playsinline: true });
    video.muted = id === room.me;
    const lbl = h('div.lbl');
    const wait = h('div.wait');
    const el = h('div.avtile' + (id === room.me ? '.me' : ''), { onclick: () => el.classList.toggle('big') }, video, wait, lbl);
    t = { el, video, lbl, wait, stream: null, key: '' };
    tiles.set(id, t);
    tilesEl.append(el);
    return t;
  }

  function setIcon(btn, name) { btn.replaceChildren(icon(name)); }

  function render() {
    const me = room.me;
    const members = room.players.filter((p) => (p.id === me ? av.local.on : p.av && p.av.on));
    const others = members.filter((p) => p.id !== me);
    dock.classList.toggle('show', members.length > 0);
    // app-bar buttons
    micBtn.classList.toggle('live', av.local.on && av.local.mic);
    micBtn.classList.toggle('muted', av.local.on && !av.local.mic);
    setIcon(micBtn, av.local.on && !av.local.mic ? 'mic_off' : 'mic');
    camBtn.classList.toggle('live', av.local.cam);
    setIcon(camBtn, av.local.cam ? 'videocam' : 'videocam_off');
    // join card when others are talking and I'm not in yet
    if (!av.local.on && others.length) {
      joinCard.classList.remove('hide');
      joinCard.replaceChildren(
        h('div', { style: 'font:700 13px var(--font)' }, `${others.length} in the call`),
        h('div.row', { style: 'gap:2px;flex-wrap:wrap' }, others.map((p) => avatarEl(p, 'xs', { still: true }))),
        h('button.btn.small.good', { onclick: () => guard(() => av.join().then(() => av.setMic(false))) }, icon('headset'), 'Join call')
      );
    } else joinCard.classList.add('hide');
    barEl.classList.toggle('hide', !av.local.on);
    barEl.replaceChildren(av.local.on ? h('button.btn.small.bad', { onclick: () => av.leave() }, icon('call_end'), 'Leave call') : null);
    tilesEl.classList.toggle('hide', !av.local.on);
    // tiles
    const ids = new Set();
    if (av.local.on) {
      for (const p of members) {
        ids.add(p.id);
        const t = tileFor(p.id);
        const isMe = p.id === me;
        const stream = isMe ? null : av.remote.get(p.id) || null;
        if (isMe) {
          const key = av.camTrack ? 'cam' + av.camTrack.id : 'ph';
          if (t.key !== key) { t.key = key; t.video.srcObject = av.previewStream(); t.video.play().catch(() => {}); }
          t.el.classList.toggle('mirror', !!av.camTrack);
        } else if (stream !== t.stream) {
          t.stream = stream;
          t.video.srcObject = stream;
          if (stream) t.video.play().catch(() => gestureBtn.classList.remove('hide'));
        }
        t.wait.textContent = !isMe && !stream ? 'connecting…' : '';
        t.wait.style.display = !isMe && !stream ? '' : 'none';
        const mic = isMe ? av.local.mic : p.av.mic, cam = isMe ? av.local.cam : p.av.cam;
        t.lbl.replaceChildren(h('span.nm', p.name + (isMe ? ' (you)' : '')), h('span.row', { style: 'gap:2px' }, mic ? null : icon('mic_off'), cam ? icon('videocam') : null));
      }
    }
    for (const [id, t] of [...tiles]) if (!ids.has(id)) { t.video.srcObject = null; t.el.remove(); tiles.delete(id); }
    updateSpeaking();
  }
  function updateSpeaking() { for (const [id, t] of tiles) t.el.classList.toggle('speaking', av.speaking.has(id)); }

  const offs = [av.on('change', render), av.on('speak', updateSpeaking), room.on('state', render)];
  render();
  return {
    dock,
    buttons: [micBtn, camBtn],
    destroy() { offs.forEach((f) => f()); offErr(); tiles.forEach((t) => { t.video.srcObject = null; }); dock.remove(); },
  };
}
