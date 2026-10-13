// Voice, video and chat each have a SCOPE: "room" (the room you're in) or "global" (the Lounge: everyone online).
// This controller owns both calls — the room's and the Lounge channel's — and moves your microphone and camera between
// them with one tap, without ever dropping either call.
import { Emitter } from './util.js';
import { AV } from './av.js';
import { prime } from './media.js';
import { LoungeRoom, channelName } from './lounge.js';
import { LOUNGE_CHANNELS, CHANNEL_CAP } from './plaza.js';

const KEY = 'gn.scope';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

export class Comms extends Emitter {
  constructor({ plaza, toast }) {
    super();
    this.plaza = plaza;
    this.toast = toast;
    const saved = read();
    const ok = (v) => (v === 'global' ? 'global' : 'room');
    this.scope = { mic: ok(saved.mic), cam: ok(saved.cam), chat: ok(saved.chat) };
    this.lastChannel = saved.ch && LOUNGE_CHANNELS.some((c) => c.id === saved.ch) ? saved.ch : null;
    this.micWant = false;
    this.camWant = false;
    this.roomAV = null;
    this.loungeAV = null;
    this.lounge = null;
    this.channel = null;
    this._busy = Promise.resolve();
    this._gen = 0;
  }

  get supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }
  avFor(scope) { return scope === 'global' ? this.loungeAV : this.roomAV; }
  _save() { try { localStorage.setItem(KEY, JSON.stringify({ ...this.scope, ch: this.lastChannel })); } catch { /* */ } }
  _err(e) {
    const n = e && e.name;
    this.toast(n === 'NotAllowedError' || n === 'SecurityError' ? 'Permission blocked — allow the microphone/camera in your browser, then try again.' : n === 'NotFoundError' ? 'No microphone/camera was found on this device.' : 'Could not start your microphone/camera: ' + (e && e.message), 'bad');
  }
  _wire(av) { av.on('error', (e) => { this._err(e); this._dropWant(); }); av.on('change', () => this.emit('change')); }
  _dropWant() { this.micWant = this.micWant && !!(this.roomAV?.local.mic || this.loungeAV?.local.mic); this.camWant = this.camWant && !!(this.roomAV?.local.cam || this.loungeAV?.local.cam); this.emit('change'); }

  // ---------------------------------------------------------------- rooms
  attachRoom(room) {
    this.detachRoom();
    if (room.local) return null;
    this.roomAV = new AV(room);
    this._wire(this.roomAV);
    this.emit('avs');
    return this.roomAV;
  }
  detachRoom() {
    if (!this.roomAV) return;
    this.roomAV.dispose();
    this.roomAV = null;
    if (this.scope.mic === 'room') this.micWant = false;
    if (this.scope.cam === 'room') this.camWant = false;
    this.emit('avs');
    this._apply();
  }

  // ---------------------------------------------------------------- the Lounge channels
  async joinChannel(id) {
    if (this.channel === id) return true;
    if (this.plaza.channelMembers(id).length >= CHANNEL_CAP) { this.toast(`${channelName(id)} is full (${CHANNEL_CAP} people)`, 'bad'); return false; }
    if (!this.supported) { this.toast('Voice & video need a secure (https) page and a browser with WebRTC support.', 'bad'); return false; }
    await this.leaveChannel();
    try {
      const lounge = new LoungeRoom(this.plaza, id);
      await lounge.open();
      this.lounge = lounge;
      this.channel = id;
      this.loungeAV = new AV(lounge);
      this._wire(this.loungeAV);
      await this.loungeAV.join();
    } catch (e) {
      this.toast('Could not reach the Lounge: ' + (e.message || e), 'bad');
      await this.leaveChannel();
      return false;
    }
    this.lastChannel = id;
    this._save();
    this.emit('avs');
    await this._apply();
    return true;
  }
  async leaveChannel() {
    if (!this.loungeAV && !this.lounge) return;
    try { this.loungeAV?.dispose(); } catch { /* */ }
    try { this.lounge?.close(); } catch { /* */ }
    this.loungeAV = this.lounge = null;
    this.channel = null;
    if (this.scope.mic === 'global') this.micWant = false;
    if (this.scope.cam === 'global') this.camWant = false;
    this.emit('avs');
    this.emit('change');
  }
  firstFreeChannel() { return (this.lastChannel && this.plaza.channelMembers(this.lastChannel).length < CHANNEL_CAP ? this.lastChannel : LOUNGE_CHANNELS.find((c) => this.plaza.channelMembers(c.id).length < CHANNEL_CAP)?.id) || null; }

  // ---------------------------------------------------------------- controls
  get state() { return { mic: this.micWant, cam: this.camWant, scope: { ...this.scope } }; }

  async _ensureTarget(kind) {
    const scope = this.scope[kind];
    if (scope === 'room' && !this.roomAV) { this.scope[kind] = 'global'; this._save(); this.emit('scope', kind); } // no room to talk to: use the Lounge instead
    if (this.scope[kind] === 'global' && !this.loungeAV) {
      const ch = this.firstFreeChannel();
      if (!ch) { this.toast('All Lounge channels are full right now', 'bad'); return false; }
      if (!(await this.joinChannel(ch))) return false;
      this.toast(`Joined ${channelName(ch)}`, 'good');
    }
    return true;
  }
  async toggle(kind) {
    const key = kind + 'Want';
    if (!this[key]) prime(kind === 'mic' ? 'audio' : 'video'); // permission prompt straight from the tap
    if (!this[key]) { if (!(await this._ensureTarget(kind))) return; this[key] = true; } else this[key] = false;
    await this._apply();
  }
  toggleMic() { return this.toggle('mic'); }
  toggleCam() { return this.toggle('cam'); }

  /** Move the microphone / camera / chat between 'room' and 'global'. */
  async setScope(kind, scope) {
    if (this.scope[kind] === scope) return;
    if (kind !== 'chat' && (kind === 'mic' ? this.micWant : this.camWant)) {
      const prev = this.scope[kind];
      this.scope[kind] = scope;
      if (!(await this._ensureTarget(kind))) { this.scope[kind] = prev; this.emit('change'); return; }
    } else this.scope[kind] = scope;
    this._save();
    this.emit('scope', kind);
    await this._apply();
  }
  flipScope(kind) { return this.setScope(kind, this.scope[kind] === 'room' ? 'global' : 'room'); }

  /** Make every call match what's wanted: turn things ON first, then OFF, so the device never blinks when moving between calls. */
  _apply() {
    const gen = ++this._gen;
    this._busy = this._busy.then(async () => {
      const jobs = [];
      for (const kind of ['mic', 'cam']) {
        const want = kind === 'mic' ? this.micWant : this.camWant;
        for (const name of ['room', 'global']) {
          const av = this.avFor(name);
          if (!av) continue;
          const on = want && this.scope[kind] === name;
          if ((kind === 'mic' ? av.local.mic : av.local.cam) !== on) jobs.push({ av, kind, on });
        }
      }
      for (const j of jobs.filter((x) => x.on).concat(jobs.filter((x) => !x.on))) {
        try { if (j.on && !j.av.local.on) await j.av.join(); await (j.kind === 'mic' ? j.av.setMic(j.on) : j.av.setCam(j.on)); } catch (e) { this._err(e); }
      }
      if (gen === this._gen) this._dropWant(); // only when nothing newer is queued
      else this.emit('change');
    });
    return this._busy;
  }
}
