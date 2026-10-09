// Voice & video chat for a room: a full mesh of WebRTC calls between everyone who has joined the call.
//
// Every call is created with an audio track and a video track already present:
//   audio = your microphone, or a silent track while you're listening only / muted-before-first-use
//   video = your camera, or a canvas drawing of your avatar while the camera is off
// Switching mic/camera on and off then just swaps tracks with RTCRtpSender.replaceTrack — no renegotiation
// (which PeerJS doesn't support) and no dropped calls.
//
// "In the call" is published in the room state (player.av = {on, mic, cam}); the player with the lower id dials.
import { Emitter } from './util.js';
import { audioContext } from './audio.js';
import { drawAvatar } from './avatar.js';

const idNum = (id) => parseInt(String(id).slice(1), 10) || 0;

export class AV extends Emitter {
  constructor(room) {
    super();
    this.room = room;
    this.local = { on: false, mic: false, cam: false };
    this.calls = new Map(); // player id -> { call, pid }
    this.remote = new Map(); // player id -> MediaStream
    this.speaking = new Set();
    this.micTrack = null;
    this.camTrack = null;
    this.silentTrack = null;
    this.placeholder = null;
    this._an = new Map();
    this._offs = [room.on('state', () => this.reconcile()), room.onMediaCall((c) => this._incoming(c))];
    this._speakTimer = setInterval(() => this._pollSpeaking(), 160);
  }

  get supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }

  // ------------------------------------------------------------ local media
  _makeSilent() {
    const ac = audioContext();
    if (!ac) return;
    this.silentTrack = ac.createMediaStreamDestination().stream.getAudioTracks()[0];
  }
  _makePlaceholder() {
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 144;
    const ctx = cv.getContext('2d');
    const draw = () => {
      const me = this.room.player(this.room.me);
      const g = ctx.createLinearGradient(0, 0, 192, 144);
      g.addColorStop(0, '#2d3366'); g.addColorStop(1, '#14162e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 192, 144);
      if (me) {
        drawAvatar(ctx, me.avatar, 96, 62, 100);
      }
    };
    draw();
    this._phTimer = setInterval(draw, 700); // captureStream only emits when the canvas changes/redraws
    this.placeholder = cv.captureStream(3).getVideoTracks()[0];
  }
  currentStream() {
    return new MediaStream([this.micTrack || this.silentTrack, this.camTrack || this.placeholder].filter(Boolean));
  }
  /** A stream for my own preview tile (video only). */
  previewStream() { return new MediaStream([this.camTrack || this.placeholder].filter(Boolean)); }

  async join() {
    if (this.local.on) return true;
    this._makeSilent();
    this._makePlaceholder();
    this.local.on = true;
    this._announce();
    this.reconcile();
    return true;
  }
  async setMic(on) {
    if (on && !this.local.on) await this.join();
    if (on) {
      if (!this.micTrack) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          this.micTrack = s.getAudioTracks()[0];
          this._replaceAll('audio', this.micTrack);
          this._watch(this.room.me, s);
        } catch (e) { this.emit('error', e); return false; }
      }
      this.micTrack.enabled = true;
    } else if (this.micTrack) this.micTrack.enabled = false;
    this.local.mic = !!on;
    this._announce();
    this.emit('change');
    return true;
  }
  async setCam(on) {
    if (on && !this.local.on) await this.join();
    if (on) {
      if (!this.camTrack) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 20 } } });
          this.camTrack = s.getVideoTracks()[0];
          this._replaceAll('video', this.camTrack);
        } catch (e) { this.emit('error', e); return false; }
      }
    } else if (this.camTrack) {
      this.camTrack.stop();
      this.camTrack = null;
      this._replaceAll('video', this.placeholder);
    }
    this.local.cam = !!on;
    this._announce();
    this.emit('change');
    return true;
  }
  toggleMic() { return this.setMic(!this.local.mic); }
  toggleCam() { return this.setCam(!this.local.cam); }

  leave() {
    for (const { call } of this.calls.values()) { try { call.close(); } catch { /* */ } }
    this.calls.clear();
    this.remote.clear();
    this._an.clear();
    this.micTrack?.stop(); this.camTrack?.stop();
    this.micTrack = this.camTrack = null;
    clearInterval(this._phTimer);
    this.local = { on: false, mic: false, cam: false };
    this._announce();
    this.emit('change');
  }
  dispose() {
    this.leave();
    this._offs.forEach((f) => f());
    clearInterval(this._speakTimer);
  }

  _announce() { try { this.room.setAv({ ...this.local }); } catch { /* room closed */ } }
  _replaceAll(kind, track) {
    for (const { call } of this.calls.values()) {
      const pc = call.peerConnection;
      if (!pc) continue;
      for (const s of pc.getSenders()) if (s.track && s.track.kind === kind) s.replaceTrack(track).catch(() => {});
    }
  }

  // ------------------------------------------------------------ connections
  reconcile() {
    const room = this.room;
    const want = new Set();
    if (this.local.on) {
      for (const p of room.players) {
        if (p.id === room.me || !p.av || !p.av.on || !p.online || !p.pid) continue;
        want.add(p.id);
        const ex = this.calls.get(p.id);
        if (ex && ex.pid !== p.pid) this._drop(p.id); // they reloaded and have a new peer id
        if (!this.calls.has(p.id) && idNum(room.me) < idNum(p.id)) this._dial(p);
      }
    }
    for (const id of [...this.calls.keys()]) if (!want.has(id)) this._drop(id);
    this.emit('change');
  }
  _drop(id) {
    const rec = this.calls.get(id);
    if (rec) { try { rec.call.close(); } catch { /* */ } }
    this.calls.delete(id);
    this.remote.delete(id);
    this._an.delete(id);
  }
  _dial(p) {
    const call = this.room.callPeer(p.pid, this.currentStream(), 'av');
    if (!call) return;
    this._attach(call, p.id);
    setTimeout(() => { // the other side never answered: try again
      if (this.calls.get(p.id)?.call === call && !this.remote.has(p.id)) { this._drop(p.id); this.reconcile(); }
    }, 12000);
  }
  _incoming(call) {
    if (!call.metadata || call.metadata.kind !== 'av') return;
    const p = this.room.players.find((x) => x.pid === call.peer);
    if (!this.local.on || !p) return;
    call.answer(this.currentStream());
    this._attach(call, p.id);
  }
  _attach(call, id) {
    const old = this.calls.get(id);
    if (old && old.call !== call) { try { old.call.close(); } catch { /* */ } }
    this.calls.set(id, { call, pid: call.peer });
    call.on('stream', (s) => { this.remote.set(id, s); this._watch(id, s); this.emit('change'); });
    call.on('close', () => {
      if (this.calls.get(id)?.call !== call) return;
      this.calls.delete(id); this.remote.delete(id); this._an.delete(id);
      this.emit('change');
      setTimeout(() => this.reconcile(), 2500);
    });
    call.on('error', () => {});
  }

  // ------------------------------------------------------------ speaking detection
  _watch(id, stream) {
    const ac = audioContext();
    if (!ac || !stream.getAudioTracks().length) return;
    try {
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      this._an.set(id, { src, an, buf: new Uint8Array(an.fftSize) });
    } catch { /* ignore */ }
  }
  _pollSpeaking() {
    const next = new Set();
    for (const [id, a] of this._an) {
      a.an.getByteTimeDomainData(a.buf);
      let max = 0;
      for (let i = 0; i < a.buf.length; i++) max = Math.max(max, Math.abs(a.buf[i] - 128));
      if (max > 10 && (id !== this.room.me || this.local.mic)) next.add(id);
    }
    if (next.size !== this.speaking.size || [...next].some((x) => !this.speaking.has(x))) { this.speaking = next; this.emit('speak'); }
  }
}
