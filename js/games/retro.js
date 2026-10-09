// Retro Console — real NES games with friends.
// The HOST runs a NES emulator (jsnes) and streams its video + audio to everyone over WebRTC; the first two
// players get controller 1 and 2 and send their button presses back to the host. Everyone else watches.
// Built-in demo cartridges are free homebrew; you can also load your own .nes file (only use games you own).
import { h, dpad, fitCanvas } from '../util.js';
import { icon } from '../ui.js';
import { audioContext } from '../audio.js';

const W = 256, HT = 240;
const BIT = { A: 0, B: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7 };
const KEYMAP = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
  x: 'A', k: 'A', z: 'B', j: 'B', Enter: 'START', c: 'SELECT', Shift: 'SELECT', Backspace: 'SELECT',
};
const DEMOS = [
  { id: 'croom', name: 'Concentration Room', file: 'roms/croom/croom.nes', desc: 'Card-matching memory game — 1 or 2 players, take turns.', by: 'Damian Yerrick (GPLv3)' },
  { id: 'lj65', name: 'LJ65', file: 'roms/lj65/lj65.nes', desc: 'Falling-block puzzle game with 1–2 player modes.', by: 'Damian Yerrick (zlib)' },
];

const CSS = `
.rt { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; padding:8px; min-height:0; overflow-y:auto; }
.rt-screen { position:relative; width:100%; flex:1; min-height:220px; display:flex; align-items:center; justify-content:center; }
.rt-screen canvas, .rt-screen video { image-rendering:pixelated; background:#000; border-radius:8px; box-shadow:0 10px 30px rgba(31,41,55,.22); }
.rt-screen.fs { background:#000; }
.rt-bar { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; }
.rt-info { color:var(--muted); font-size:13px; text-align:center; max-width:640px; }
.rt-picker { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; width:100%; max-width:760px; }
.rt-rom { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:12px; text-align:left; cursor:pointer; color:var(--text); }
.rt-rom:hover { border-color:var(--accent); background:var(--panel2); }
.rt-rom b { display:block; font-size:16px; } .rt-rom span { font-size:12.5px; color:var(--muted); }
.rt-unmute { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); }
.rt .touch-controls .acts { flex-wrap:wrap; width:156px; justify-content:flex-end; gap:8px; }
.rt .touch-controls .tbtn.act { width:58px; height:58px; font-size:13px; }
.rt-drop { outline:3px dashed var(--accent); outline-offset:-8px; }
`;

let jsnesLoading = null;
function loadJsnes() {
  if (window.jsnes) return Promise.resolve(window.jsnes);
  if (!jsnesLoading) {
    jsnesLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jsnes.min.js';
      s.onload = () => resolve(window.jsnes);
      s.onerror = () => reject(new Error('Could not load the emulator'));
      document.head.appendChild(s);
    });
  }
  return jsnesLoading;
}
const toBinaryString = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const myIdx = ids.indexOf(api.me);

  const screen = h('div.rt-screen');
  const info = h('div.rt-info');
  const bar = h('div.rt-bar');
  const picker = h('div.rt-picker');
  const keyBtn = (k, down) => keyEvent(k, down);
  const touch = myIdx >= 0 && myIdx < 2 ? dpad(keyBtn, { actions: [{ label: 'B', key: 'z' }, { label: 'A', key: 'x' }, { label: 'SEL', key: 'c' }, { label: 'START', key: 'Enter' }] }) : null;
  const root = h('div.rt', screen, info, bar, picker, touch);
  api.root.append(h('style', CSS), root);

  // ------------------------------------------------------------ local input → mask
  let mask = 0;
  const heldKeys = new Set();
  function setMask(m) {
    if (m === mask) return;
    mask = m;
    if (myIdx < 0 || myIdx > 1) return;
    if (api.isHost) host?.pad(myIdx, m); else api.toHost('pad', { m });
  }
  function keyEvent(k, down) {
    if (k === null) { heldKeys.clear(); return setMask(0); }
    const b = KEYMAP[k];
    if (!b) return;
    if (down) heldKeys.add(b); else heldKeys.delete(b);
    let m = 0;
    for (const x of heldKeys) m |= 1 << BIT[x];
    setMask(m | padMask);
  }
  api.listen(window, 'keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYMAP[k]) { e.preventDefault(); if (!e.repeat) keyEvent(k, true); }
  });
  api.listen(window, 'keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (KEYMAP[k]) keyEvent(k, false); });
  api.listen(window, 'blur', () => keyEvent(null));
  // physical gamepads
  let padMask = 0;
  api.raf(() => {
    const gp = (navigator.getGamepads?.() || []).find(Boolean);
    let m = 0;
    if (gp) {
      const b = (i) => gp.buttons[i]?.pressed;
      if (b(0) || b(2)) m |= 1 << BIT.B; if (b(1) || b(3)) m |= 1 << BIT.A; if (b(8)) m |= 1 << BIT.SELECT; if (b(9)) m |= 1 << BIT.START;
      if (b(12) || gp.axes[1] < -0.5) m |= 1 << BIT.UP; if (b(13) || gp.axes[1] > 0.5) m |= 1 << BIT.DOWN; if (b(14) || gp.axes[0] < -0.5) m |= 1 << BIT.LEFT; if (b(15) || gp.axes[0] > 0.5) m |= 1 << BIT.RIGHT;
    }
    if (m !== padMask) { padMask = m; let k = 0; for (const x of heldKeys) k |= 1 << BIT[x]; setMask(k | padMask); }
  });

  // ------------------------------------------------------------ host: emulator
  let host = null;
  if (api.isHost) host = createHost();

  function createHost() {
    const canvas = h('canvas', { width: W, height: HT });
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, HT);
    const buf32 = new Uint32Array(img.data.buffer);
    screen.append(canvas);
    api.cleanup(fitCanvas(canvas, screen, W / HT));
    const H = { nes: null, running: false, romName: '', timer: 0, pads: [0, 0], last: 0, acc: 0, calls: new Map(), actx: null, node: null, gain: null, dest: null, ringL: new Float32Array(16384), ringR: new Float32Array(16384), rp: 0, wp: 0, vol: 1 };

    function msg(lines) {
      ctx.fillStyle = '#10121f'; ctx.fillRect(0, 0, W, HT);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 15px sans-serif';
      lines.forEach((t, i) => { ctx.fillStyle = i === 0 ? '#ffd23f' : '#cfd3ff'; ctx.font = (i === 0 ? 'bold 18px' : '13px') + ' sans-serif'; ctx.fillText(t, W / 2, 100 + i * 24); });
    }
    msg(['🕹️ Retro Console', 'The host is picking a game…']);

    // --- audio: ring buffer -> ScriptProcessor -> speakers + stream destination
    function setupAudio() {
      if (H.actx) return;
      const ac = audioContext();
      if (!ac) return;
      H.actx = ac;
      H.dest = ac.createMediaStreamDestination();
      H.gain = ac.createGain();
      H.node = ac.createScriptProcessor(2048, 0, 2);
      H.node.onaudioprocess = (e) => {
        const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
        const size = H.ringL.length;
        for (let i = 0; i < L.length; i++) {
          if (H.rp !== H.wp) { L[i] = H.ringL[H.rp]; R[i] = H.ringR[H.rp]; H.rp = (H.rp + 1) % size; } else { L[i] = R[i] = 0; }
        }
      };
      H.node.connect(H.gain); H.gain.connect(ac.destination);
      H.node.connect(H.dest);
    }
    function pushSample(l, r) {
      const size = H.ringL.length;
      const next = (H.wp + 1) % size;
      if (next === H.rp) return; // full: drop
      H.ringL[H.wp] = l; H.ringR[H.wp] = r; H.wp = next;
    }

    // --- streaming to everyone
    let stream = null;
    function getStream() {
      if (stream) return stream;
      const tracks = [...canvas.captureStream(60).getVideoTracks()];
      if (H.dest) tracks.push(...H.dest.stream.getAudioTracks());
      stream = new MediaStream(tracks);
      return stream;
    }
    function callPlayer(id) {
      if (id === api.me || api.player(id)?.left) return;
      H.calls.get(id)?.close?.();
      const c = api.streamTo(id, getStream());
      if (c) H.calls.set(id, c);
    }
    function callAll() { ids.forEach(callPlayer); }

    async function loadRom(name, bytes) {
      setupAudio();
      let jsnes;
      try { jsnes = await loadJsnes(); } catch (e) { api.toast(e.message); return; }
      stop();
      const nes = new jsnes.NES({
        onFrame: (fb) => { for (let i = 0; i < fb.length; i++) buf32[i] = 0xff000000 | fb[i]; ctx.putImageData(img, 0, 0); },
        onAudioSample: pushSample,
        sampleRate: H.actx ? H.actx.sampleRate : 44100,
      });
      try { nes.loadROM(toBinaryString(bytes)); } catch (e) { console.error(e); api.toast('That ROM could not be loaded: ' + (e.message || e)); msg(['⚠️ Could not load that ROM', 'Try another .nes file']); return; }
      H.nes = nes; H.romName = name; H.bytes = bytes; H.pads = [0, 0];
      api.broadcast('rom', { name });
      H.last = performance.now(); H.acc = 0;
      H.timer = setInterval(() => {
        const now = performance.now();
        H.acc = Math.min(100, H.acc + now - H.last); H.last = now;
        let n = 0;
        while (H.acc >= 16.64 && n < 4) { try { nes.frame(); } catch (e) { console.error(e); stop(); return; } H.acc -= 16.64; n++; }
      }, 5);
      // (re)connect everyone to the stream now that audio+video exist
      stream = null;
      callAll();
      api.say?.(`🕹️ Now playing ${name}`);
    }
    function stop() { clearInterval(H.timer); H.timer = 0; if (H.nes) { for (let p = 0; p < 2; p++) for (let b = 0; b < 8; b++) H.nes.buttonUp(p + 1, b); } H.nes = null; H.rp = H.wp = 0; }
    function applyPad(idx, m) {
      if (!H.nes || idx > 1) return;
      const old = H.pads[idx];
      H.pads[idx] = m;
      for (let b = 0; b < 8; b++) {
        const was = old >> b & 1, now = m >> b & 1;
        if (was !== now) { if (now) H.nes.buttonDown(idx + 1, b); else H.nes.buttonUp(idx + 1, b); }
      }
    }

    api.on('pad', ({ m }, from) => { const i = ids.indexOf(from); if (i >= 0 && i < 2) applyPad(i, m | 0); });
    api.onRejoin((id) => { callPlayer(id); if (H.romName) api.sendTo(id, 'rom', { name: H.romName }); });
    api.cleanup(() => { stop(); try { H.node?.disconnect(); H.gain?.disconnect(); } catch { /* */ } stream?.getTracks().forEach((t) => t.stop()); H.calls.forEach((c) => c.close?.()); });
    // other players might still be connecting their media listeners — call a few times
    api.timeout(callAll, 800); api.timeout(callAll, 3000);

    return {
      pad: applyPad,
      load: loadRom,
      reset() { if (H.romName && H.bytes) loadRom(H.romName, H.bytes); },
      stop,
      canvas,
      get running() { return !!H.nes; },
      get romName() { return H.romName; },
      setVol(v) { H.vol = v; if (H.gain) H.gain.gain.value = v; },
      get vol() { return H.vol; },
      msg,
    };
  }

  // ------------------------------------------------------------ guests: video element
  let video = null;
  if (!api.isHost) {
    video = h('video', { autoplay: true, playsinline: true, muted: true });
    video.muted = true;
    screen.append(video);
    api.cleanup(fitCanvas(video, screen, W / HT));
    const unmute = h('button.btn.primary.rt-unmute', { style: 'display:none', onclick: () => { video.muted = false; video.play().catch(() => {}); unmute.style.display = 'none'; } }, icon('volume_up'), 'Tap for sound');
    screen.append(unmute);
    api.onStream((s) => {
      video.srcObject = s;
      video.muted = false;
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); unmute.style.display = ''; });
      if (video.muted) unmute.style.display = '';
    });
  }

  // ------------------------------------------------------------ UI state
  let romName = '';
  api.on('rom', (r) => { romName = r.name; renderInfo(); });
  function renderInfo() {
    const role = myIdx === 0 ? 'You are Player 1' : myIdx === 1 ? 'You are Player 2' : 'You are watching (only the first two players get a controller)';
    info.textContent = `${romName ? '▶ ' + romName + ' · ' : ''}${role}. Controls: arrows = D-pad · X = A · Z = B · Enter = Start · C/Shift = Select${api.isHost ? ' · Keep this tab visible — it runs the game for everyone.' : ''}`;
    bar.replaceChildren(
      api.isHost && romName ? h('button.btn.small', { onclick: () => host.reset() }, icon('refresh'), 'Reset') : null,
      api.isHost ? h('button.btn.small', { onclick: () => { host.stop(); host.msg(['🕹️ Retro Console', 'Pick a game…']); romName = ''; renderInfo(); picker.style.display = ''; } }, icon('swap_horiz'), 'Change game') : null,
      api.isHost ? h('button.btn.small', { onclick: () => { host.setVol(host.vol ? 0 : 1); renderInfo(); } }, icon(host.vol ? 'volume_up' : 'volume_off'), (host.vol ? 'Host sound on' : 'Host sound off')) : null,
      h('button.btn.small', { onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else screen.requestFullscreen?.().catch(() => {}); } }, icon('fullscreen'), 'Fullscreen')
    );
  }
  function renderPicker() {
    if (!api.isHost) { picker.style.display = 'none'; return; }
    const fileIn = h('input', { type: 'file', accept: '.nes', style: 'display:none', onchange: async () => { const f = fileIn.files?.[0]; if (f) pickFile(f); fileIn.value = ''; } });
    picker.replaceChildren(
      ...DEMOS.map((d) => h('button.rt-rom', { onclick: async () => { try { const r = await fetch(d.file); const b = new Uint8Array(await r.arrayBuffer()); picker.style.display = 'none'; await host.load(d.name, b); } catch (e) { api.toast('Could not load ' + d.name); } } }, h('b', '🎮 ' + d.name), h('span', d.desc), h('span', { style: 'display:block;margin-top:4px;font-size:11px' }, 'by ' + d.by))),
      h('button.rt-rom', { onclick: () => fileIn.click() }, h('b', '📂 Load your own .nes ROM'), h('span', 'Pick a ROM file you own (or drag & drop it here). It stays on your computer — only the picture and sound are streamed to your friends.')),
      fileIn
    );
  }
  async function pickFile(f) {
    if (!/\.nes$/i.test(f.name)) return api.toast('Please choose a .nes file');
    const b = new Uint8Array(await f.arrayBuffer());
    picker.style.display = 'none';
    await host.load(f.name.replace(/\.nes$/i, ''), b);
  }
  if (api.isHost) {
    api.listen(root, 'dragover', (e) => { e.preventDefault(); root.classList.add('rt-drop'); });
    api.listen(root, 'dragleave', () => root.classList.remove('rt-drop'));
    api.listen(root, 'drop', (e) => { e.preventDefault(); root.classList.remove('rt-drop'); const f = e.dataTransfer?.files?.[0]; if (f) pickFile(f); });
  }
  renderInfo();
  renderPicker();
  return { get host() { return host; } };
}
