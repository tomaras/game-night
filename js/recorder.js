// "Instant replay" recorder: while it is on, the last few minutes of the app are kept in short rolling segments;
// "Save" turns the last N minutes into a clip. If a new clip would overlap an earlier one that was recorded with
// the same settings, the two are stitched into a single longer clip instead of making a duplicate.
//
// What is captured (each is an option):
//   screen video   getDisplayMedia on this tab (desktop browsers; phones can't, so they record sound only)
//   screen sound   the tab's audio — or, where the browser can't give us that, the app's sound effects + everyone's voices
//   microphone     your own voice
//   taps / cursor  a visible dot + ripples drawn on the page, so they appear in the video
import { Emitter, h } from './util.js';
import { acquire, release } from './media.js';
import { audioContext, recordingTap } from './audio.js';
import { putClip, listClips, deleteClip } from './clips.js';

const SEG_MS = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('recseg') && +new URLSearchParams(location.search).get('recseg') >= 500 && window.GAME_NIGHT_CONFIG?.env !== 'prod' && +new URLSearchParams(location.search).get('recseg')) || 8000; // ?recseg=2000 shortens segments (tests only)
export const MINUTES = [1, 2, 5, 10];
export const DEFAULTS = { minutes: 2, video: true, screen: true, mic: false, taps: true };

const pickMime = (video) => (video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']).find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
export const canCaptureScreen = () => !!navigator.mediaDevices?.getDisplayMedia && !!window.MediaRecorder;
export const canRecordAudio = () => !!window.MediaRecorder && !!(window.AudioContext || window.webkitAudioContext);
export const settingsKey = (s, mime) => [s.video ? 'v' : '-', s.screen ? 's' : '-', s.mic ? 'm' : '-', s.taps ? 't' : '-', mime.split(';')[0]].join('');

function pointerFx() {
  const layer = h('div.ptrfx', { 'aria-hidden': 'true' });
  const dot = h('div.ptrdot');
  layer.append(dot);
  document.body.append(layer);
  const place = (e) => { dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; dot.classList.add('on'); };
  const ripple = (e) => { const r = h('div.ptrrip', { style: { left: e.clientX + 'px', top: e.clientY + 'px' } }); layer.append(r); setTimeout(() => r.remove(), 650); };
  const on = {
    pointermove: place,
    pointerdown: (e) => { place(e); dot.classList.add('down'); ripple(e); },
    pointerup: (e) => { dot.classList.remove('down'); if (e.pointerType === 'touch') dot.classList.remove('on'); },
    pointercancel: () => dot.classList.remove('on', 'down'),
  };
  for (const [k, f] of Object.entries(on)) addEventListener(k, f, true);
  return { destroy() { for (const [k, f] of Object.entries(on)) removeEventListener(k, f, true); layer.remove(); } };
}

export class Recorder extends Emitter {
  /** `remoteStreams()` returns the MediaStreams of everyone you're hearing in calls (used when tab audio isn't available). */
  constructor({ remoteStreams = () => [] } = {}) {
    super();
    this.remoteStreams = remoteStreams;
    this.settings = { ...DEFAULTS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('gn.rec') || '{}')); } catch { /* */ }
    this.active = false;
    this.segs = [];
    this.note = '';
  }

  /** How many seconds are buffered right now. */
  get buffered() { return this.segs.length ? Math.round((Date.now() - this.segs[0].t0) / 1000) : this.active ? Math.round((Date.now() - this.startedAt) / 1000) : 0; }
  set(patch) { Object.assign(this.settings, patch); try { localStorage.setItem('gn.rec', JSON.stringify(this.settings)); } catch { /* */ } this.emit('state'); }

  async start() {
    if (this.active) return;
    const s = this.settings;
    this.note = '';
    let display = null;
    if (s.video && canCaptureScreen()) {
      try {
        display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: !!s.screen, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
      } catch (e) { console.warn('[rec] screen capture:', e && (e.name + ': ' + e.message)); this.note = e && e.name === 'NotAllowedError' ? 'Screen capture was declined — recording sound only.' : 'Screen capture isn’t available here — recording sound only.'; }
    } else if (s.video) this.note = 'This device can’t record the screen — recording sound only.';
    const ac = audioContext();
    const dest = ac ? ac.createMediaStreamDestination() : null;
    const nodes = [];
    const feed = (stream) => { try { const n = ac.createMediaStreamSource(stream); n.connect(dest); nodes.push(n); return n; } catch { return null; } };
    this._remoteNodes = new Map();
    const tabAudio = display && display.getAudioTracks().length > 0;
    if (dest) {
      if (tabAudio) feed(new MediaStream(display.getAudioTracks()));
      else if (s.screen) {
        const tap = recordingTap();
        if (tap) feed(tap);
        this._syncRemote = () => { // everybody's voices (they play in <video> elements, so tap their streams too)
          const live = new Set();
          for (const st of this.remoteStreams()) { live.add(st.id); if (!this._remoteNodes.has(st.id) && st.getAudioTracks().length) this._remoteNodes.set(st.id, feed(st)); }
          for (const [id, n] of this._remoteNodes) if (!live.has(id)) { try { n?.disconnect(); } catch { /* */ } this._remoteNodes.delete(id); }
        };
        this._syncRemote();
        this._remoteTimer = setInterval(() => this._syncRemote(), 2000);
      }
      if (s.mic) {
        try { this.micTrack = await acquire('audio'); feed(new MediaStream([this.micTrack])); } catch { this.note = (this.note ? this.note + ' ' : '') + 'The microphone isn’t available.'; }
      }
    }
    const tracks = [...(display ? display.getVideoTracks() : []), ...(dest && (tabAudio || s.screen || this.micTrack) ? dest.stream.getAudioTracks() : [])];
    if (!tracks.length) { this._cleanupSources(); throw new Error(this.note || 'Nothing to record — turn on at least one option.'); }
    this.hasVideo = !!display;
    this.display = display;
    this.stream = new MediaStream(tracks);
    this.mime = pickMime(this.hasVideo);
    this.segs = [];
    this.startedAt = Date.now();
    this.active = true;
    if (display) {
      display.getVideoTracks()[0].addEventListener('ended', () => this.stop());
    }
    if (s.taps && this.hasVideo) this.fx = pointerFx();
    this._begin();
    this._timer = setInterval(() => this._rotate(), SEG_MS);
    this.emit('state');
  }

  _make() {
    const rec = new MediaRecorder(this.stream, { ...(this.mime ? { mimeType: this.mime } : {}), videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 });
    const seg = { t0: Date.now(), chunks: [], rec };
    seg.done = new Promise((resolve) => {
      rec.ondataavailable = (e) => { if (e.data && e.data.size) seg.chunks.push(e.data); };
      rec.onstop = () => {
        seg.t1 = Date.now();
        if (seg.chunks.length && this.active) this.segs.push({ t0: seg.t0, t1: seg.t1, blob: new Blob(seg.chunks, { type: this.mime || 'video/webm' }) });
        this._prune();
        this.emit('buffer');
        resolve();
      };
    });
    rec.start();
    return seg;
  }
  _begin() { this.cur = this._make(); }
  /** Start the next segment first, then stop the old one, so nothing is lost between them. */
  _rotate() {
    if (!this.active) return Promise.resolve();
    const old = this.cur;
    this.cur = this._make();
    try { old.rec.state !== 'inactive' && old.rec.stop(); } catch { /* */ }
    return old.done;
  }
  _prune() {
    const keep = Date.now() - (this.settings.minutes * 60000 + SEG_MS * 2);
    while (this.segs.length && this.segs[0].t1 < keep) this.segs.shift();
  }

  /** Turn the last `minutes` into a clip (stitching onto an earlier overlapping one with the same settings). Returns {clip, stitched}. */
  async save(minutes = this.settings.minutes) {
    if (!this.active) throw new Error('Recording isn’t on.');
    await this._rotate(); // finish the segment in progress so the very latest seconds are included
    const now = Date.now(), winStart = now - minutes * 60000;
    const take = this.segs.filter((x) => x.t1 > winStart);
    if (!take.length) throw new Error('Nothing recorded yet — give it a few seconds.');
    const settings = { ...this.settings, video: this.hasVideo };
    const key = settingsKey(settings, this.mime || '');
    const all = await listClips();
    const overlapping = all.filter((c) => c.key === key && c.start <= now && winStart <= c.end);
    const bySt = new Map();
    for (const c of overlapping) for (const sg of c.segs) bySt.set(sg.t0, sg);
    for (const sg of take) bySt.set(sg.t0, sg);
    const segs = [...bySt.values()].sort((a, b) => a.t0 - b.t0);
    const base = overlapping.sort((a, b) => a.created - b.created)[0];
    const clip = {
      id: base?.id || Math.random().toString(36).slice(2, 10), key, settings, mime: this.mime || 'video/webm', created: base?.created || now, updated: now,
      start: segs[0].t0, end: segs[segs.length - 1].t1, segs, thumb: base?.thumb || null, name: base?.name || '',
    };
    await putClip(clip);
    for (const c of overlapping) if (c.id !== clip.id) await deleteClip(c.id);
    this.emit('saved', clip);
    return { clip, stitched: overlapping.length > 0 };
  }

  _cleanupSources() {
    clearInterval(this._remoteTimer);
    if (this.micTrack) { release(this.micTrack, 'audio'); this.micTrack = null; }
    this.display?.getTracks().forEach((t) => { try { t.stop(); } catch { /* */ } });
    this.display = null;
  }
  async stop() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this._timer);
    try { this.cur?.rec.state !== 'inactive' && this.cur.rec.stop(); } catch { /* */ }
    this.fx?.destroy(); this.fx = null;
    this._cleanupSources();
    this.segs = [];
    this.emit('state');
  }
}
