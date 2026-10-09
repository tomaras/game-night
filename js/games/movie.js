// Movie Night — Discord-style screen sharing. One presenter shares a screen / window / browser tab (with or
// without its sound) and everyone else watches. Use the 🎤 / 📹 buttons at the top for voice and video chat.
// The stream goes presenter → each viewer over WebRTC (peer-to-peer); the host only coordinates who is presenting.
import { h, clamp } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const QUALITY = {
  smooth: { label: '🎬 Movie — smooth 720p / 30 fps', w: 1280, h: 720, fps: 30, hint: 'motion', kbps: 2800 },
  hd: { label: '🍿 Movie HD — 1080p / 30 fps', w: 1920, h: 1080, fps: 30, hint: 'motion', kbps: 4500 },
  game: { label: '🎮 Gaming — 720p / 60 fps', w: 1280, h: 720, fps: 60, hint: 'motion', kbps: 4500 },
  sharp: { label: '🖥️ Slides & text — sharp 1080p / 10 fps', w: 1920, h: 1080, fps: 10, hint: 'detail', kbps: 2500 },
};

const CSS = `
.mv { flex:1; display:flex; flex-direction:column; gap:8px; padding:8px; min-height:0; }
.mv-stage { position:relative; flex:1; min-height:220px; background:#0b0d17; box-shadow:var(--e2); border-radius:28px; overflow:hidden; display:grid; place-items:center; }
.mv-stage > video { width:100%; height:100%; object-fit:contain; background:#000; }
.mv-idle { position:absolute; inset:0; display:grid; place-items:center; padding:14px; overflow-y:auto; background:radial-gradient(circle at 50% 20%, #e8dcfd, transparent 70%), radial-gradient(circle at 90% 90%, #ffd9ec, transparent 60%), #f6f2ff; }
.mv-card { width:min(520px, 100%); display:flex; flex-direction:column; gap:10px; text-align:center; }
.mv-card h2 { font-size:30px; font-weight:900; }
.mv-opts { display:grid; gap:10px; text-align:left; background:var(--panel); box-shadow:var(--e1); border-radius:22px; padding:14px; }
.mv-opts label { display:flex; gap:10px; align-items:center; font-weight:700; font-size:14px; }
.mv-opts select { flex:1; min-width:0; max-width:100%; }
.mv, .mv-stage, .mv-idle, .mv-card, .mv-opts { min-width:0; max-width:100%; }
.mv-opts label { flex-wrap:wrap; }
.mv-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:center; }
.mv-bar .who { display:flex; align-items:center; gap:8px; font-weight:800; margin-right:auto; }
.mv-bar input[type=range] { width:110px; accent-color:#ffc857; }
.mv-react { display:flex; gap:4px; }
.mv-react button { font-size:22px; width:44px; height:44px; border-radius:50%; border:0; box-shadow:var(--e1); background:var(--panel); cursor:pointer; }
.mv-react button:active { transform:scale(.85); }
.mv-float { position:absolute; bottom:10px; font-size:34px; pointer-events:none; animation:mvup 2.6s ease-out forwards; text-align:center; text-shadow:0 2px 6px rgba(0,0,0,.6); }
.mv-float small { display:block; font-size:11px; font-weight:800; color:#fff; }
@keyframes mvup { from { transform:translateY(0) scale(.6); opacity:1; } 80% { opacity:1; } to { transform:translateY(-260px) scale(1.25); opacity:0; } }
.mv-preview { position:absolute; right:10px; bottom:10px; width:170px; border:2px solid #38d996; border-radius:10px; overflow:hidden; background:#000; z-index:3; }
.mv-preview video { width:100%; display:block; }
.mv-preview span { position:absolute; left:4px; top:3px; font-size:10px; font-weight:900; background:#38d996; color:#04281c; padding:0 6px; border-radius:6px; }
.mv-unmute { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); z-index:3; }
.mv-live { position:absolute; left:10px; top:10px; background:#e63946; color:#fff; font-weight:900; font-size:12px; padding:2px 10px; border-radius:999px; z-index:3; display:flex; gap:6px; align-items:center; }
.mv-live i { width:8px; height:8px; border-radius:50%; background:#fff; animation:pulse 1s infinite; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const nameOf = (id) => api.player(id)?.name || '?';
  const canShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  // ------------------------------------------------------------ UI skeleton
  const video = h('video', { autoplay: true, playsinline: true });
  video.muted = true;
  const stage = h('div.mv-stage', video);
  const bar = h('div.mv-bar');
  const root = h('div.mv', stage, bar);
  api.root.append(h('style', CSS), root);

  const S = { presenter: null, wantAudio: true, quality: 'smooth', hasAudio: false, gotStream: false, pending: false };
  let shareStream = null;
  const calls = new Map();
  let volume = 1;

  // ------------------------------------------------------------ presenter side
  async function startShare() {
    if (!canShare) return api.toast('Screen sharing isn’t available in this browser — you can still watch!');
    const q = QUALITY[S.quality];
    let s;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } },
        audio: S.wantAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      });
    } catch (e) {
      if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') api.toast('Could not start screen sharing: ' + (e.message || e.name));
      return;
    }
    const vt = s.getVideoTracks()[0];
    try { vt.contentHint = q.hint; } catch { /* unsupported */ }
    vt.addEventListener('ended', () => stopShare());
    shareStream = s;
    S.hasAudio = s.getAudioTracks().length > 0;
    if (S.wantAudio && !S.hasAudio) api.toast('No sound was captured. In Chrome tick “Also share tab audio” (or “Share system audio”) in the picker.');
    S.pending = true;
    api.toHost('present', { on: true });
    render();
  }
  function stopShare(notify = true) {
    if (shareStream) { shareStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* */ } }); shareStream = null; }
    calls.forEach((c) => { try { c.close(); } catch { /* */ } });
    calls.clear();
    if (notify) api.toHost('present', { on: false });
    render();
  }
  function tune(call) {
    const pc = call && call.peerConnection;
    if (!pc) return;
    const n = Math.max(1, ids.filter((i) => !api.player(i).left).length - 1);
    const bps = clamp(Math.floor(9_000_000 / n), 700_000, QUALITY[S.quality].kbps * 1000);
    for (const sd of pc.getSenders()) {
      if (!sd.track || sd.track.kind !== 'video') continue;
      try {
        const p = sd.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = bps;
        sd.setParameters(p).catch(() => {});
      } catch { /* unsupported */ }
    }
  }
  function callPlayer(id) {
    if (!shareStream || id === api.me || api.player(id)?.left) return;
    const old = calls.get(id);
    if (old && old.open) return;
    try { old?.close(); } catch { /* */ }
    const c = api.streamTo(id, shareStream);
    if (c) { calls.set(id, c); setTimeout(() => tune(c), 1500); }
  }
  const callAll = () => ids.forEach(callPlayer);
  api.interval(() => { if (shareStream && S.presenter === api.me) callAll(); }, 4000); // keep every viewer connected
  api.cleanup(() => stopShare(false));

  // ------------------------------------------------------------ viewer side
  api.onStream((s) => {
    video.srcObject = s;
    S.gotStream = true;
    video.muted = false;
    video.volume = volume;
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); unmuteBtn.style.display = ''; });
    render();
  });
  const unmuteBtn = h('button.btn.primary.mv-unmute', { style: 'display:none', onclick: () => { video.muted = false; video.play().catch(() => {}); unmuteBtn.style.display = 'none'; } }, icon('volume_up'), 'Tap for sound');
  stage.append(unmuteBtn);
  api.interval(() => { if (S.presenter && S.presenter !== api.me && !S.gotStream) api.toHost('want'); }, 5000);

  api.on('who', ({ id }) => {
    if (shareStream && S.pending && id !== api.me) {
      if (!id) return; // a stale "nobody" from before the host heard my request
    }
    S.presenter = id;
    if (id === api.me) S.pending = false;
    if (shareStream) {
      if (id === api.me) callAll();
      else { stopShare(false); S.pending = false; if (id) api.toast(`${nameOf(id)} is already sharing`); }
    }
    if (!id || id === api.me) { video.srcObject = null; S.gotStream = false; }
    if (id && id !== api.me) { S.gotStream = false; api.toHost('want'); api.sfx('turn'); }
    render();
  });
  api.on('deny', ({ by }) => { stopShare(false); S.pending = false; api.toast(`${nameOf(by)} is already presenting`); });
  api.on('stop', () => { stopShare(false); api.toast('The host stopped your screen share'); });
  api.on('recall', ({ id }) => { if (shareStream) api.timeout(() => callPlayer(id), 700); });
  api.on('react', ({ e, id }) => {
    const f = h('div.mv-float', { style: { left: 8 + Math.random() * 84 + '%' } }, e, h('small', nameOf(id)));
    stage.append(f);
    setTimeout(() => f.remove(), 2700);
  });
  api.onPlayersChanged(() => render());

  // ------------------------------------------------------------ rendering
  const fsBtn = () => h('button.btn.small', { onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen?.().catch(() => {}); } }, icon('fullscreen'), 'Fullscreen');
  let idle = null, preview = null, live = null;
  function render() {
    const me = api.me;
    const pres = S.presenter;
    const iPresent = pres === me && !!shareStream;
    const watching = !!pres && pres !== me;
    video.style.display = watching && S.gotStream ? '' : 'none';

    idle?.remove(); preview?.remove(); live?.remove();
    idle = preview = live = null;
    if (iPresent) {
      const pv = h('video', { autoplay: true, playsinline: true });
      pv.muted = true;
      pv.srcObject = new MediaStream(shareStream.getVideoTracks());
      preview = h('div.mv-preview', pv, h('span', 'YOUR SCREEN'));
      stage.append(preview);
      live = h('div.mv-live', h('i'), 'LIVE');
      stage.append(live);
    } else if (watching && S.gotStream) {
      live = h('div.mv-live', h('i'), 'LIVE · ' + nameOf(pres));
      stage.append(live);
    }
    if (!iPresent && !(watching && S.gotStream)) {
      const p = watching ? api.player(pres) : null;
      idle = h('div.mv-idle', h('div.mv-card', watching
        ? [
          h('div', { style: 'display:grid;place-items:center' }, avatarEl(p, 'xl bounce')),
          h('h2', `${nameOf(pres)} is starting the show…`),
          h('div.muted', 'Connecting to their screen — this can take a few seconds.'),
          h('div.spinner'),
        ]
        : iPresent ? [] : [
          h('div', { style: 'font-size:64px' }, '🍿'),
          h('h2', 'Movie Night'),
          h('div.muted', pres ? '' : 'Nobody is sharing yet. Be the first — pick what to show and press the button!'),
          canShare
            ? h('div.mv-opts', [
              h('label', h('input', { type: 'checkbox', checked: S.wantAudio, onchange: (e) => { S.wantAudio = e.target.checked; } }), '🔊 Share sound too (tab / system audio)'),
              h('label', '🎞️ Quality', h('select.txt', { onchange: (e) => { S.quality = e.target.value; } }, Object.entries(QUALITY).map(([k, q]) => h('option', { value: k, selected: k === S.quality }, q.label)))),
              h('div.muted', { style: 'font-size:12px;line-height:1.5' }, 'Chrome/Edge: pick a Tab and tick “Also share tab audio” for the best sound. Wear headphones so your friends don’t hear an echo. Firefox/Safari can share video only.'),
            ])
            : h('div.warnbox', 'Screen sharing isn’t supported on this device (most phones). You can still watch and chat — and join the voice/video call with 🎤 / 📹.'),
          canShare ? h('button.btn.primary.big', { onclick: startShare }, icon('screen_share'), 'Share my screen') : null,
          h('div.muted', { style: 'font-size:12.5px' }, 'Everyone can talk and show their face with the 🎤 and 📹 buttons at the top.'),
        ]));
      stage.append(idle);
    }

    // controls
    const kids = [];
    kids.push(h('div.who', pres ? [avatarEl(api.player(pres), 'sm', { still: true }), iPresent ? `You are sharing${S.hasAudio ? ' (with sound 🔊)' : ' (no sound 🔇)'}` : `${nameOf(pres)} is sharing`] : [h('span.muted', 'No one is sharing')]));
    if (iPresent) kids.push(h('button.btn.bad', { onclick: () => stopShare() }, icon('stop_screen_share'), 'Stop sharing'));
    else if (!pres && canShare) kids.push(h('button.btn.primary', { onclick: startShare }, icon('screen_share'), 'Share screen'));
    if (api.isHost && pres && pres !== me) kids.push(h('button.btn.small', { onclick: () => api.toHost('present', { on: false }) }, icon('stop'), 'Stop their share'));
    if (watching) kids.push(h('label.row', { style: 'gap:6px;font-size:13px' }, '🔊', h('input', { type: 'range', min: 0, max: 100, value: volume * 100, oninput: (e) => { volume = e.target.value / 100; video.volume = volume; video.muted = volume === 0; } })));
    kids.push(fsBtn());
    kids.push(h('div.mv-react', ['😂', '❤️', '👏', '🔥', '😮', '🍿'].map((e) => h('button', { 'aria-label': 'React ' + e, onclick: () => api.toHost('reactReq', { e }) }, e))));
    bar.replaceChildren(...kids);
  }

  // ------------------------------------------------------------ host: who is presenting
  if (api.isHost) {
    let presenter = null;
    const set = (id) => { presenter = id; api.broadcast('who', { id }); };
    api.on('present', ({ on }, from) => {
      if (on) {
        if (!presenter || presenter === from) set(from);
        else api.sendTo(from, 'deny', { by: presenter });
      } else if (from === presenter || from === api.me) {
        const old = presenter;
        set(null);
        if (old && old !== from) api.sendTo(old, 'stop', {});
      }
    });
    api.on('want', (_, from) => { if (presenter && presenter !== from) api.sendTo(presenter, 'recall', { id: from }); });
    api.on('reactReq', ({ e }, from) => { if (typeof e === 'string' && e.length <= 8) api.broadcast('react', { e, id: from }); });
    api.onRejoin((id) => { api.sendTo(id, 'who', { id: presenter }); if (presenter && presenter !== id) api.sendTo(presenter, 'recall', { id }); });
    api.onLeave((id) => { if (id === presenter) set(null); });
  }

  render();
}
