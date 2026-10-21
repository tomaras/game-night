// Game Night sound engine.
//
//   sfx(name, v = 1, { pan, x })   play a named sound. v is how hard / how much (0..1); pan -1..1 or x 0..1 (screen position)
//
// Physical sounds (cards, chips, dice, wood, impacts, pencil, keys…) are real CC0 recordings in assets/sfx/<pack>/
// (see the LICENSE.txt next to each pack). Musical cues (good, turn, win…) are mallet instruments synthesised once
// into buffers. Every sound gets natural variation: several takes chosen without immediate repeats, a little
// random pitch and level, and intensity that drives level, brightness and which take is used. Rapid repeats are
// thinned so they never machine-gun, each name has a voice limit, and everything runs through a limiter so stacks
// never clip.
//
// The recordings are fetched and decoded after the first tap (the service worker precaches them with the app).
// Until a sound's recordings are ready — or if they can't load — a synthesised version plays instead.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('gn.muted') === '1'; } catch { /* ignore */ }
let uiSounds = true;
try { uiSounds = localStorage.getItem('gn.uisfx') !== '0'; } catch { /* ignore */ }

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
function ac() {
  if (!ctx) {
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { return null; } }
  }
  if (ctx.state === 'suspended' && !offline) ctx.resume().catch(() => {});
  return ctx;
}

// ------------------------------------------------------------------ master bus
// voices → bus → limiter → master → speakers (+ the recording tap).
// (A DynamicsCompressorNode adds automatic make-up gain; the master gain takes it back off so the ceiling sits
// at about -2 dBFS and quieter sounds pass through unchanged.)
let bus = null, master = null, tap = null;
function buildChain(c) {
  const b = c.createGain();
  b.gain.value = 1;
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -2.5; lim.knee.value = 1; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  const m = c.createGain();
  m.gain.value = MAKEUP;
  b.connect(lim).connect(m);
  return { bus: b, master: m };
}
const MAKEUP = 0.865; // -1.26 dB: measured make-up of this limiter (unity below threshold, ceiling ≈ -2 dBFS)
function out(c) {
  if (offline) return offline.bus;
  if (!bus) { ({ bus, master } = buildChain(c)); master.connect(c.destination); }
  return bus;
}
/** A MediaStream carrying the app's sound effects (for recordings). */
export function recordingTap() {
  const c = ac();
  if (!c) return null;
  out(c);
  if (!tap) { tap = c.createMediaStreamDestination(); master.connect(tap); }
  return tap.stream;
}

// ------------------------------------------------------------------ samples
const BASE = new URL('../assets/sfx/', import.meta.url).href;
const SETS = {}; // key -> { files, bufs, last, state: 0 idle | 1 loading | 2 ready | 3 failed }
const set = (key, path, n) => { SETS[key] = { files: n ? Array.from({ length: n }, (_, i) => `${path}${i + 1}.mp3`) : [path + '.mp3'], bufs: [], last: -1, state: 0 }; };
set('cardPlace', 'cards/place', 4); set('cardSlide', 'cards/slide', 5); set('cardShove', 'cards/shove', 4);
set('shuffle', 'cards/shuffle'); set('fan', 'cards/fan');
set('chipLay', 'chips/lay', 3); set('chipCollide', 'chips/collide', 4); set('chipStack', 'chips/stack', 6); set('chipHandle', 'chips/handle', 4);
set('dice', 'dice/throw', 3); set('die', 'dice/die', 4); set('shake', 'dice/shake', 3);
set('wood', 'impact/wood', 5); set('woodMed', 'impact/woodmed', 5); set('soft', 'impact/soft', 5); set('softHeavy', 'impact/softheavy', 3);
set('punch', 'impact/punch', 5); set('punchHeavy', 'impact/punchheavy', 3); set('generic', 'impact/generic', 5);
set('metal', 'impact/metal', 3); set('rock', 'impact/rock', 3);
set('uiClick', 'ui/click', 5); set('uiSwitch', 'ui/switch', 5); set('uiTick', 'ui/tick', 3); set('uiPop', 'ui/pop', 3);
set('flip', 'paper/flip', 3); set('pencil', 'paper/pencil'); set('erase', 'paper/erase');
set('key', 'keys/key', 12); set('bell', 'bell/ding', 3);
set('explode', 'fx/explode', 3); set('lowboom', 'fx/lowboom', 2); set('laser', 'fx/laser', 3); set('power', 'fx/power', 4);

/** Fetch + decode a sound file (cached). Resolves to an AudioBuffer (or rejects). */
const fileCache = new Map();
export function loadSample(url) {
  const c = ac();
  if (!c) return Promise.reject(new Error('no audio'));
  const abs = new URL(url, BASE).href;
  if (!fileCache.has(abs)) {
    fileCache.set(abs, fetch(abs).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + abs); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); }))
      .then(trimLead)
      .catch((e) => { fileCache.delete(abs); throw e; }));
  }
  return fileCache.get(abs);
}
// MP3/AAC decoders may add a few ms of encoder delay; the files are cut tight, so drop any leading silence.
function trimLead(b) {
  const d = b.getChannelData(0);
  let i = 0; const lim = Math.min(d.length, Math.round(b.sampleRate * 0.08));
  while (i < lim && Math.abs(d[i]) < 0.003) i++;
  i = Math.max(0, i - Math.round(b.sampleRate * 0.001));
  if (i < 8 || !ctx) return b;
  const nb = ctx.createBuffer(b.numberOfChannels, b.length - i, b.sampleRate);
  for (let ch = 0; ch < b.numberOfChannels; ch++) nb.getChannelData(ch).set(b.getChannelData(ch).subarray(i));
  return nb;
}
function loadSet(key) {
  const s = SETS[key];
  if (!s || s.state === 1 || s.state === 2) return s?.promise || Promise.resolve();
  s.state = 1;
  s.promise = Promise.allSettled(s.files.map((f) => loadSample(f))).then((rs) => {
    s.bufs = rs.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    s.state = s.bufs.length ? 2 : 3;
    if (s.state === 3) setTimeout(() => { if (s.state === 3) s.state = 0; }, 15000); // retry later (e.g. back online)
  });
  return s.promise;
}
let warming = null;
/** Start loading every sound (called on the first user gesture). Resolves when all are decoded. */
export function warmUp() {
  if (warming) return warming;
  if (!ac()) return Promise.resolve();
  const keys = Object.keys(SETS);
  // most common first, a few at a time so the first tap isn't janky
  const first = ['uiClick', 'uiSwitch', 'uiPop', 'uiTick', 'cardPlace', 'cardSlide', 'flip', 'bell', 'chipLay', 'chipCollide', 'wood', 'dice', 'die'];
  const order = [...first, ...keys.filter((k) => !first.includes(k))];
  warming = (async () => {
    for (let i = 0; i < order.length; i += 4) await Promise.all(order.slice(i, i + 4).map(loadSet));
  })();
  return warming;
}
export const sfxReady = () => warmUp();
const ready = (...keys) => keys.every((k) => SETS[k]?.state === 2);

// ------------------------------------------------------------------ voices
const rnd = (a, b) => a + Math.random() * (b - a);
const dB = (x) => Math.pow(10, x / 20);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
let voice = null; // the voice the current recipe plays into
let T0 = 0; // its start time
const live = []; // { name, g, srcs, end }
const lastByName = new Map();
let lastAny = 0;

function newVoice(c, name, gainDb, pan) {
  const g = c.createGain();
  g.gain.value = dB(gainDb);
  let node = g;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
  node.connect(out(c));
  return { name, g, srcs: [], end: c.currentTime };
}
function stopVoice(v, c, fade = 0.015) {
  const t = c.currentTime;
  try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + fade); } catch { /* ignore */ }
  for (const s of v.srcs) try { s.stop(t + fade + 0.01); } catch { /* ignore */ }
  v.end = t;
}
function prune(c) {
  const t = c.currentTime;
  for (let i = live.length - 1; i >= 0; i--) if (live[i].end < t - 0.05) live.splice(i, 1);
}

/** Play one take from a sample set into the current voice. Options:
 *  g   level in dB          r    playback rate (pitch)        vary  random pitch spread (fraction, default .04)
 *  at  delay (s)            lp   low-pass cut-off (Hz)        hp    high-pass cut-off (Hz)
 *  off start offset (s)     dur  play only this long (fades out) pick  index of the take to use
 *  loop                     returns the source node (or null). */
function S(key, o = {}) {
  const s = SETS[key];
  if (!s || s.state !== 2 || !voice) return null;
  const c = ctx;
  let i = o.pick;
  if (i == null) { i = Math.floor(Math.random() * s.bufs.length); if (s.bufs.length > 1 && i === s.last) i = (i + 1) % s.bufs.length; }
  i = Math.max(0, Math.min(s.bufs.length - 1, i));
  s.last = i;
  return playBufferInto(s.bufs[i], o);
}
function playBufferInto(buf, o = {}) {
  const c = ctx;
  const src = c.createBufferSource();
  src.buffer = buf;
  const vary = o.vary ?? 0.04;
  const rate = (o.r || 1) * (1 + rnd(-vary, vary));
  src.playbackRate.value = rate;
  if (o.loop) { src.loop = true; src.loopStart = 0; src.loopEnd = Math.max(0.05, buf.duration - 0.03); }
  let node = src;
  if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; f.Q.value = 0.6; node.connect(f); node = f; }
  if (o.lp && o.lp < 18000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; node.connect(f); node = f; }
  const g = c.createGain();
  const t = T0 + (o.at || 0);
  const lvl = dB((o.g || 0) + rnd(-1.2, 1.2));
  g.gain.value = lvl;
  const off = Math.min(o.off || 0, Math.max(0, buf.duration - 0.05));
  const content = o.dur ? Math.min(buf.duration - off, o.dur * rate) : buf.duration - off; // seconds of the buffer
  const len = content / rate; // seconds of output
  if (o.dur && !o.loop) { const fo = Math.min(0.08, len * 0.4); g.gain.setValueAtTime(lvl, t + len - fo); g.gain.linearRampToValueAtTime(0, t + len); }
  node.connect(g).connect(voice.g);
  if (o.loop) src.start(t, off); else src.start(t, off, content);
  voice.srcs.push(src);
  voice.end = Math.max(voice.end, t + (o.loop ? 3600 : len));
  return src;
}

// ------------------------------------------------------------------ synthesis
// Mallet instruments (marimba, glockenspiel), modelled as a struck bar: a few inharmonic partials with their own
// decay, a soft mallet attack and a short contact noise. Rendered once per note into a buffer.
const notes = new Map();
function mallet(kind, midi) {
  const k = kind + midi;
  if (notes.has(k)) return notes.get(k);
  const c = ctx, sr = c.sampleRate;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const P = kind === 'glock'
    ? { r: [1, 2.756, 5.404, 8.933], a: [1, 0.32, 0.16, 0.05], t60: 2.2, hard: 0.0007, noise: 0.05 }
    : kind === 'bell'
      ? { r: [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662], a: [0.35, 1, 0.45, 0.3, 0.25, 0.12, 0.08], t60: 3, hard: 0.0006, noise: 0.03 }
      : kind === 'mute'
        ? { r: [1, 3.932, 9.538], a: [1, 0.22, 0.05], t60: 0.4, hard: 0.002, noise: 0.16 } // dead-stroke marimba
        : { r: [1, 3.932, 9.538], a: [1, 0.26, 0.07], t60: 1.3, hard: 0.0016, noise: 0.12 }; // marimba
  const t60 = Math.min(3, P.t60 * Math.pow(523 / f, 0.55));
  const len = Math.min(3.2, t60 * 0.9) + 0.02;
  const n = Math.ceil(len * sr);
  const b = c.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  P.r.forEach((r, i) => {
    const fr = f * r;
    if (fr > sr * 0.45) return;
    const tau = t60 / 6.9 / (1 + i * (kind === 'marimba' || kind === 'mute' ? 2.2 : 0.9));
    const w = 2 * Math.PI * fr / sr, ph = Math.random() * 0.3;
    const a = P.a[i] * (kind === 'marimba' || kind === 'mute' ? 1 : 1 - i * 0.04);
    const dec = Math.exp(-1 / (tau * sr));
    let e = a;
    for (let j = 0; j < n; j++) { d[j] += e * Math.sin(w * j + ph); e *= dec; }
  });
  // mallet: soft onset + a little contact noise (low-passed)
  let lp = 0;
  const kc = Math.exp(-2 * Math.PI * Math.min(6000, f * 6) / sr);
  for (let j = 0; j < n; j++) {
    const t = j / sr;
    const att = 1 - Math.exp(-t / P.hard);
    let nz = 0;
    if (t < 0.012) { lp = lp * kc + (1 - kc) * (Math.random() * 2 - 1); nz = lp * P.noise * 4 * Math.exp(-t / 0.002); }
    d[j] = d[j] * att + nz;
  }
  const fade = Math.round(0.02 * sr);
  for (let j = 0; j < fade; j++) d[n - 1 - j] *= j / fade;
  let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(d[j]));
  for (let j = 0; j < n; j++) d[j] *= 0.9 / pk;
  notes.set(k, b);
  return b;
}
/** Play a mallet note into the current voice. */
function N(kind, midi, o = {}) { if (!voice) return; playBufferInto(mallet(kind, midi), { vary: 0.002, ...o }); }

// noise burst / sweep, used for whooshes and fallbacks
let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function whooshInto({ dur = 0.3, f0 = 500, f1 = 2400, g = -10, q = 1.2, at = 0 } = {}) {
  const c = ctx, t = T0 + at;
  const src = c.createBufferSource(); src.buffer = noiseBuffer();
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
  const e = c.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(dB(g), t + dur * 0.45); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(e).connect(voice.g);
  src.start(t, Math.random()); src.stop(t + dur + 0.02);
  voice.srcs.push(src); voice.end = Math.max(voice.end, t + dur);
}
function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
  const c = ctx, t0 = T0 + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(voice.g);
  o.start(t0); o.stop(t0 + dur + 0.02);
  voice.srcs.push(o); voice.end = Math.max(voice.end, t0 + dur);
}
function noise(dur, vol = 0.08, delay = 0) {
  const c = ctx, t = T0 + delay;
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = noiseBuffer();
  g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(g).connect(voice.g);
  s.start(t, Math.random()); s.stop(t + dur + 0.01);
  voice.srcs.push(s); voice.end = Math.max(voice.end, t + dur);
}

// The original synthesised effects: fallbacks while recordings load (or if they can't), and the pool sounds.
const SYNTH = {
  click: () => tone(660, 0.05, { type: 'triangle' }),
  pop: () => tone(520, 0.09, { type: 'sine', slide: 380, vol: 0.09 }),
  tick: () => tone(900, 0.03, { type: 'square', vol: 0.03 }),
  card: () => { noise(0.05, 0.05); tone(300, 0.04, { type: 'triangle', vol: 0.04 }); },
  coin: () => { tone(988, 0.06, { type: 'square', vol: 0.05 }); tone(1319, 0.2, { type: 'square', vol: 0.05, delay: 0.06 }); },
  boom: () => { noise(0.35, 0.18); tone(110, 0.3, { type: 'sawtooth', slide: -80, vol: 0.08 }); },
  shoot: () => tone(800, 0.1, { type: 'square', slide: -500, vol: 0.04 }),
  hit: () => { noise(0.12, 0.1); tone(180, 0.1, { type: 'square', vol: 0.05 }); },
  bump: () => tone(140, 0.08, { type: 'triangle', vol: 0.1 }),
  clack: () => { noise(0.04, 0.12); tone(1200, 0.03, { type: 'triangle', vol: 0.05 }); },
  drop: () => tone(200, 0.05, { type: 'square', vol: 0.04 }),
  ball: (v = 1) => { noise(0.03, 0.05 + 0.13 * v); tone(2300 + 700 * v, 0.045, { type: 'sine', vol: 0.03 + 0.08 * v }); tone(3600, 0.03, { type: 'sine', vol: 0.015 + 0.04 * v }); },
  rail: (v = 1) => { noise(0.07, 0.03 + 0.1 * v); tone(150 + 40 * v, 0.1, { type: 'sine', vol: 0.05 + 0.1 * v, slide: -50 }); },
  pocket: () => { tone(180, 0.16, { type: 'sine', vol: 0.12, slide: -90 }); noise(0.1, 0.05, 0.03); tone(90, 0.22, { type: 'sine', vol: 0.09, delay: 0.14, slide: -40 }); },
  cue: (v = 1) => { noise(0.02, 0.07 + 0.12 * v); tone(1500, 0.035, { type: 'triangle', vol: 0.05 + 0.08 * v }); tone(380, 0.05, { type: 'sine', vol: 0.06 + 0.06 * v }); },
  wood: () => { noise(0.025, 0.05); tone(520, 0.07, { type: 'sine', vol: 0.09, slide: -120 }); tone(210, 0.09, { type: 'sine', vol: 0.07 }); },
  woodcap: () => { noise(0.04, 0.1); tone(640, 0.08, { type: 'sine', vol: 0.1, slide: -160 }); tone(240, 0.12, { type: 'sine', vol: 0.09 }); tone(900, 0.04, { type: 'triangle', vol: 0.04 }); },
  thud: (v = 1) => { tone(110, 0.12, { type: 'sine', vol: 0.06 + 0.08 * v, slide: -40 }); noise(0.05, 0.03 + 0.05 * v); },
  scratch: () => noise(0.08, 0.03),
};
// names whose fallback borrows another synth
const FALLBACK = { deal: 'card', flip: 'card', slide: 'card', shuffle: 'card', fan: 'card', chip: 'coin', chips: 'coin', bet: 'coin', dice: 'clack', die: 'clack', shake: 'clack', place: 'wood', disc: 'thud', move: 'tick', type: 'tick', paddle: 'clack', puck: 'bump', kick: 'hit', crash: 'hit', break: 'hit', cannon: 'boom', laser: 'shoot', dash: 'shoot', eat: 'pop', pickup: 'coin', powerup: 'coin', plant: 'drop', page: 'card', erase: 'scratch', pencil: 'scratch' };

// ------------------------------------------------------------------ the sounds
// Each recipe plays into the current voice. v is the intensity (0..1). `L` is the level of the whole voice (dB),
// tuned by rendering every sound offline and measuring it, so sounds sit at consistent loudness.
// `gap`: repeats closer than this are thinned; `max`: simultaneous voices of this name.
const hard = (v) => -20 * (1 - v) * (1 - v) - 4 * (1 - v); // intensity → dB (0 at v=1, about -24 at v=0)
const bright = (v, lo = 1800) => (v >= 0.95 ? 20000 : lo + (16000 - lo) * Math.pow(v, 1.6)); // intensity → low-pass
const M = 60; // C4 in MIDI = 60; notes below are written relative to it
const R = {
  // --- UI -----------------------------------------------------------------------------------------------
  tap: { L: -7.8, gap: 0.04, max: 2, sets: ['uiClick'], play: () => S('uiClick', { g: 0, pick: Math.random() < 0.5 ? 0 : 2, hp: 300, lp: 9000, vary: 0.05 }) },
  toggle: { L: -10.2, gap: 0.05, max: 2, sets: ['uiSwitch'], play: () => S('uiSwitch', { pick: Math.random() < 0.5 ? 0 : 1, hp: 200, vary: 0.04 }) },
  sheet: { L: -13.6, gap: 0.2, max: 1, sets: ['flip'], play: () => { S('flip', { g: 0, lp: 7000, hp: 400, r: 1.05 }); } },
  click: { L: 0, gap: 0.035, max: 3, sets: ['uiClick'], play: (v) => S('uiClick', { g: hard(v), lp: bright(v, 3000), vary: 0.05 }) },
  tick: { L: -3.2, gap: 0.05, max: 2, sets: ['uiTick', 'wood'], play: (v) => { S('uiTick', { pick: 2, g: hard(v) }); S('wood', { g: -10 + hard(v), r: 2.2, hp: 600, vary: 0.02 }); } },
  move: { L: -10.4, gap: 0.03, max: 2, sets: ['uiTick'], play: (v) => S('uiTick', { pick: 2, g: hard(v), r: 0.9, lp: 6000 }) },
  pop: { L: -4.2, gap: 0.04, max: 3, sets: ['uiPop'], play: (v) => S('uiPop', { g: hard(v), vary: 0.06, lp: bright(v, 2500) }) },
  msg: { L: -16.9, gap: 0.12, max: 2, play: () => { N('marimba', M + 21, { g: 0 }); N('glock', M + 33, { g: -14, at: 0.004 }); } },
  join: { L: -17.3, gap: 0.3, max: 1, play: () => { N('marimba', M + 19, { g: -2 }); N('marimba', M + 24, { g: 0, at: 0.085 }); N('glock', M + 36, { g: -16, at: 0.085 }); } },
  turn: { L: -9, gap: 0.4, max: 1, sets: ['bell'], play: () => { S('bell', { pick: 0, g: -1, r: 0.84, vary: 0.005, dur: 1.0 }); N('marimba', M + 19, { g: -9 }); N('marimba', M + 24, { g: -7, at: 0.1 }); } },
  ding: { L: -3.3, gap: 0.15, max: 2, sets: ['bell'], play: (v) => S('bell', { g: hard(v), vary: 0.01, lp: bright(v, 3000) }) },
  good: { L: -16.6, gap: 0.12, max: 2, play: () => { N('marimba', M + 24, { g: -1 }); N('marimba', M + 28, { g: 0, at: 0.075 }); N('glock', M + 40, { g: -15, at: 0.075 }); } },
  bad: { L: -15.9, gap: 0.15, max: 2, sets: ['generic'], play: () => { N('mute', M + 3, { g: 0, lp: 2400 }); N('mute', M - 3, { g: 0, at: 0.11, lp: 2000 }); S('generic', { g: -14, r: 0.8 }); } },
  win: {
    L: -16.4, gap: 1, max: 1, play: () => {
      const seq = [[M + 12, 0], [M + 16, 0.11], [M + 19, 0.22], [M + 24, 0.36]];
      seq.forEach(([m, at], i) => { N('marimba', m, { at, g: -2 + i * 0.6 }); N('glock', m + 12, { at, g: -14 }); });
      [M + 24, M + 28, M + 31].forEach((m, i) => N('marimba', m, { at: 0.36 + i * 0.012, g: -5 }));
      [M + 36, M + 40, M + 43, M + 48].forEach((m, i) => N('glock', m, { at: 0.5 + i * 0.06, g: -18 - i }));
    },
  },
  lose: {
    L: -14.3, gap: 1, max: 1, play: () => {
      [[M + 7, 0], [M + 6, 0.2], [M + 5, 0.4], [M + 4, 0.62]].forEach(([m, at], i) => N('marimba', m, { at, g: -i * 1.2, lp: 2600 }));
      N('marimba', M - 8, { at: 0.62, g: -6, lp: 1500 });
    },
  },
  line: { L: -17, gap: 0.2, max: 1, play: () => { [M + 24, M + 28, M + 31, M + 36].forEach((m, i) => { N('glock', m, { at: i * 0.045, g: -2 - i }); N('marimba', m - 12, { at: i * 0.045, g: -8 }); }); whooshInto({ dur: 0.35, f0: 1200, f1: 6000, g: -20 }); } },
  powerup: { L: -8.5, gap: 0.1, max: 2, sets: ['power'], play: () => S('power', { vary: 0.03 }) },
  pickup: { L: -19.4, gap: 0.06, max: 3, play: () => { N('glock', M + 31, { g: -2 }); N('glock', M + 36, { at: 0.05, g: 0 }); } },
  coin: { L: -1.9, gap: 0.05, max: 3, sets: ['chipCollide', 'chipStack'], play: (v) => { S('chipCollide', { g: hard(v), lp: bright(v) }); if (v > 0.5) S('chipStack', { g: -6 + hard(v), at: rnd(0.03, 0.06) }); } },
  eat: { L: -4.8, gap: 0.05, max: 3, sets: ['uiPop'], play: () => { S('uiPop', { r: 1.25, vary: 0.08 }); N('glock', M + 31 + Math.floor(Math.random() * 3) * 2, { g: -16 }); } },
  // --- cards --------------------------------------------------------------------------------------------
  card: { L: -3, gap: 0.04, max: 4, sets: ['cardPlace', 'cardSlide'], play: (v) => (Math.random() < 0.6 ? S('cardPlace', { g: hard(v), lp: bright(v) }) : S('cardSlide', { g: -1 + hard(v), lp: bright(v) })) },
  deal: { L: -1.7, gap: 0.035, max: 5, sets: ['cardSlide'], play: (v) => S('cardSlide', { g: hard(v), lp: bright(v), vary: 0.05 }) },
  flip: { L: -2.2, gap: 0.04, max: 4, sets: ['cardPlace'], play: (v) => S('cardPlace', { g: hard(v), r: 1.08, lp: bright(v) }) },
  slide: { L: -2.8, gap: 0.06, max: 3, sets: ['cardShove'], play: (v) => S('cardShove', { g: hard(v), lp: bright(v) }) },
  shuffle: { L: -3.1, gap: 0.6, max: 1, sets: ['shuffle'], play: (v) => S('shuffle', { g: hard(v), vary: 0.03, dur: 0.6 + 1.0 * v }) },
  fan: { L: -5.7, gap: 0.3, max: 1, sets: ['fan'], play: (v) => S('fan', { g: hard(v), vary: 0.03 }) },
  page: { L: -2, gap: 0.08, max: 2, sets: ['flip'], play: (v) => S('flip', { g: hard(v), lp: bright(v) }) },
  snap: { L: -3.4, gap: 0.05, max: 3, sets: ['cardPlace', 'uiTick'], play: (v) => { S('cardPlace', { g: hard(v), r: 1.25 }); S('uiTick', { pick: 2, g: -4 + hard(v), at: 0.006 }); N('glock', M + 31 + Math.floor(Math.random() * 3) * 2, { g: -22, at: 0.02 }); } },
  out: { L: -14.9, gap: 0.3, max: 1, sets: ['cardShove'], play: () => { S('cardShove', { g: -2 }); N('mute', M - 2, { g: -2, at: 0.05 }); N('mute', M - 7, { g: 0, at: 0.2, lp: 1800 }); } },
  // --- chips --------------------------------------------------------------------------------------------
  chip: { L: -3.1, gap: 0.04, max: 4, sets: ['chipLay', 'chipCollide'], play: (v) => (Math.random() < 0.5 ? S('chipLay', { g: hard(v), lp: bright(v) }) : S('chipCollide', { g: hard(v), lp: bright(v) })) },
  chips: { L: 1, gap: 0.08, max: 3, sets: ['chipStack', 'chipHandle'], play: (v) => { S('chipHandle', { g: hard(v), lp: bright(v), pick: v > 0.7 ? 3 : undefined }); S('chipStack', { g: -4 + hard(v), at: rnd(0.05, 0.12) }); } },
  bet: { L: -2.1, gap: 0.08, max: 3, sets: ['chipStack', 'chipLay'], play: (v) => { S('chipLay', { g: hard(v) }); if (v > 0.35) S('chipStack', { g: -3 + hard(v), at: rnd(0.04, 0.08) }); } },
  // --- dice ---------------------------------------------------------------------------------------------
  dice: { L: -3.7, gap: 0.15, max: 2, sets: ['dice'], play: (v) => S('dice', { g: hard(v), lp: bright(v, 2500) }) },
  die: { L: -2.8, gap: 0.12, max: 2, sets: ['die'], play: (v) => S('die', { g: hard(v), lp: bright(v, 2500) }) },
  shake: { L: -0.9, gap: 0.4, max: 1, sets: ['shake'], play: (v) => S('shake', { g: hard(v), dur: 0.5 + 0.5 * v }) },
  clack: { L: -2.6, gap: 0.08, max: 2, sets: ['die'], play: (v) => S('die', { g: hard(v), pick: Math.random() < 0.5 ? 0 : 3, lp: bright(v, 2500) }) },
  // --- wood / board pieces -----------------------------------------------------------------------------
  wood: { L: -2.8, gap: 0.04, max: 3, sets: ['wood', 'chipLay'], play: (v) => { S('wood', { g: hard(v), r: 1.15, lp: bright(v, 2500) }); S('chipLay', { g: -11 + hard(v), r: 0.7, hp: 1500, vary: 0.03 }); } },
  woodcap: { L: -2.7, gap: 0.04, max: 3, sets: ['woodMed', 'chipCollide'], play: (v) => { S('woodMed', { g: hard(v), r: 1.25, lp: bright(v, 2500) }); S('chipCollide', { g: -9 + hard(v), r: 0.65, hp: 1200 }); } },
  place: { L: -3.7, gap: 0.04, max: 3, sets: ['wood', 'chipLay'], play: (v) => { S('wood', { g: hard(v), r: 1.3, lp: bright(v, 2500) }); S('chipLay', { g: -14 + hard(v), r: 0.8, hp: 1500 }); } },
  thud: { L: -3.3, gap: 0.05, max: 3, sets: ['chipCollide', 'generic', 'soft'], play: (v) => { S('chipCollide', { g: hard(v), r: 0.62, lp: bright(v, 2200) }); S('generic', { g: -4 + hard(v), r: 1.2 }); if (v > 0.6) S('soft', { g: -8 + hard(v) }); } },
  disc: { L: -4.4, gap: 0.05, max: 3, sets: ['chipCollide', 'generic'], play: (v) => { S('chipCollide', { g: hard(v), r: 0.62, lp: bright(v, 2200) }); S('generic', { g: -4 + hard(v), r: 1.2 }); } },
  // --- typing / drawing ---------------------------------------------------------------------------------
  type: { L: -6.7, gap: 0.02, max: 4, sets: ['key'], play: (v) => S('key', { g: hard(v), vary: 0.05, lp: bright(v, 3500) }) },
  typo: { L: -9.3, gap: 0.04, max: 2, sets: ['key'], play: () => { S('key', { r: 0.8 }); N('mute', M - 6, { g: -12, lp: 1500 }); } },
  pencil: { L: -4.9, gap: 0.08, max: 2, sets: ['pencil'], play: (v) => S('pencil', { g: hard(v), off: rnd(0, 0.75), dur: 0.12 + 0.25 * v }) },
  erase: { L: -6, gap: 0.08, max: 2, sets: ['erase'], play: (v) => S('erase', { g: hard(v), off: rnd(0, 0.6), dur: 0.15 + 0.3 * v }) },
  // --- arcade / impacts ---------------------------------------------------------------------------------
  bump: { L: -0.2, gap: 0.06, max: 3, sets: ['soft', 'generic'], play: (v) => { S('soft', { g: hard(v), lp: bright(v, 1500) }); S('generic', { g: -10 + hard(v), r: 0.9 }); } },
  hit: { L: 0.5, gap: 0.06, max: 3, sets: ['punch', 'punchHeavy'], play: (v) => S(v > 0.7 ? 'punchHeavy' : 'punch', { g: hard(v), lp: bright(v, 2000) }) },
  crash: { L: 0.9, gap: 0.1, max: 2, sets: ['punchHeavy', 'metal'], play: (v) => { S('punchHeavy', { g: hard(v) }); S('metal', { g: -6 + hard(v), r: 0.8 }); } },
  kick: { L: 0.7, gap: 0.06, max: 3, sets: ['punch'], play: (v) => S('punch', { g: hard(v), r: 1.15, lp: bright(v, 2500) }) },
  puck: { L: -3.4, gap: 0.05, max: 3, sets: ['generic', 'wood'], play: (v) => { S('generic', { g: hard(v), r: 0.9 }); S('wood', { g: -6 + hard(v), r: 1.6 }); } },
  paddle: { L: -2.4, gap: 0.04, max: 3, sets: ['wood', 'generic'], play: (v) => { S('wood', { g: hard(v), r: 1.8, hp: 300 }); S('generic', { g: -6 + hard(v), r: 1.5 }); } },
  drop: { L: -0.9, gap: 0.05, max: 2, sets: ['soft', 'wood'], play: (v) => { S('soft', { g: hard(v) }); S('wood', { g: -6 + hard(v), r: 0.9 }); } },
  break: { L: 0.2, gap: 0.05, max: 3, sets: ['rock'], play: (v) => S('rock', { g: hard(v), dur: 0.3, lp: bright(v, 2500) }) },
  plant: { L: 0.4, gap: 0.05, max: 2, sets: ['metal', 'soft'], play: () => { S('soft', { g: -2 }); S('metal', { g: -10, r: 1.3 }); } },
  shoot: { L: -2.2, gap: 0.05, max: 3, sets: ['lowboom', 'punch'], play: (v) => { S('punch', { g: hard(v), r: 1.2 }); S('lowboom', { g: -3 + hard(v), dur: 0.35, r: 1.3 }); } },
  cannon: { L: -2, gap: 0.05, max: 3, sets: ['lowboom', 'punch'], play: (v) => { S('punch', { g: hard(v), r: 1.1 }); S('lowboom', { g: -2 + hard(v), dur: 0.45, r: 1.15 }); } },
  laser: { L: -6.3, gap: 0.04, max: 3, sets: ['laser'], play: (v) => S('laser', { g: hard(v) }) },
  dash: { L: -2.9, gap: 0.08, max: 2, play: (v) => whooshInto({ dur: 0.22, f0: 300, f1: 1800, g: hard(v), q: 0.9 }) },
  whoosh: { L: -4.3, gap: 0.06, max: 2, play: (v) => whooshInto({ dur: 0.18 + 0.12 * v, f0: 400, f1: 2400, g: hard(v) }) },
  boom: {
    L: -0.3, gap: 0.12, max: 2, sets: ['explode', 'lowboom'], play: (v) => {
      if (v > 0.45) S('explode', { g: hard(v), lp: bright(v, 1500), dur: 0.5 + 0.8 * v });
      S('lowboom', { g: -2 + hard(v), dur: 0.4 + 0.6 * v, r: v > 0.45 ? 1 : 1.25 });
    },
  },
  // pool (pool agent's sounds may replace these via defineSfx)
  ball: { L: 0, gap: 0.012, max: 6, play: (v) => SYNTH.ball(v) },
  rail: { L: 0, gap: 0.02, max: 4, play: (v) => SYNTH.rail(v) },
  pocket: { L: 0, gap: 0.05, max: 3, play: (v) => SYNTH.pocket(v) },
  cue: { L: 0, gap: 0.05, max: 2, play: (v) => SYNTH.cue(v) },
};
// fallbacks for the musical cues use the old synth when there's no AudioContext-made buffer (never happens)
Object.assign(SYNTH, {
  turn: () => { tone(523, 0.08, { type: 'triangle' }); tone(784, 0.12, { type: 'triangle', delay: 0.08 }); },
  ding: () => { tone(1568, 0.5, { type: 'sine', vol: 0.06 }); tone(3136, 0.2, { type: 'sine', vol: 0.02 }); },
  dice: () => { for (let i = 0; i < 4; i++) { noise(0.03, 0.08, i * 0.06); tone(900 + i * 130, 0.03, { type: 'triangle', vol: 0.04, delay: i * 0.06 }); } },
});

/** Add or replace a named sound. spec: a function (v, opts) that calls playBuffer(), or
 *  { files: [url…] (relative to assets/sfx/), L: level dB, gap, max, vary, intensity: true }. */
export function defineSfx(name, spec) {
  if (typeof spec === 'function') { R[name] = { L: 0, gap: 0.02, max: 4, play: spec }; return; }
  const key = 'x:' + name;
  SETS[key] = { files: spec.files, bufs: [], last: -1, state: 0 };
  if (warming || ctx) loadSet(key);
  R[name] = { L: spec.L ?? -10, gap: spec.gap ?? 0.03, max: spec.max ?? 4, sets: [key], play: (v) => S(key, { g: spec.intensity === false ? 0 : hard(v), lp: spec.intensity === false ? 0 : bright(v), vary: spec.vary ?? 0.04 }) };
}

/** Play an AudioBuffer through the sfx bus (respects mute). o: { gain (dB), rate, pan, x, lp, at } */
export function playBuffer(buf, o = {}) {
  if (muted || !buf) return;
  const c = ac();
  if (!c) return;
  const pan = o.pan ?? (o.x != null ? (o.x * 2 - 1) * 0.8 : 0);
  const prev = voice, prevT = T0;
  voice = newVoice(c, 'buffer', o.gain || 0, pan); T0 = c.currentTime;
  playBufferInto(buf, { r: o.rate || 1, lp: o.lp, at: o.at, vary: o.vary ?? 0 });
  live.push(voice);
  voice = prev; T0 = prevT;
}

// ------------------------------------------------------------------ play
/** Play a named sound effect. v: intensity 0..1 (default 1). o: { pan: -1..1 | x: 0..1 } */
export function sfx(name, v, o) {
  if (muted) return;
  try {
    const c = ac();
    if (!c) return;
    if (!offline && !warming) warmUp();
    if (name === 'scribble' || name === 'rub') { scribble(v, name === 'rub'); return; }
    v = v == null || isNaN(v) ? 1 : clamp01(+v);
    const r = R[name];
    const syn = SYNTH[name] || SYNTH[FALLBACK[name]];
    if (!r && !syn) return;
    const now = c.currentTime;
    // thin rapid repeats: a repeat inside the gap only plays if it's clearly harder
    const lr = lastByName.get(name);
    const gap = r ? r.gap : 0.03;
    if (lr && now - lr.t < gap && v <= lr.v * 1.25) return;
    lastByName.set(name, { t: now, v });
    lastAny = performance.now();
    prune(c);
    const mine = live.filter((x) => x.name === name && x.end > now);
    if (r && mine.length >= r.max) stopVoice(mine[0], c);
    if (live.length > 28) stopVoice(live.shift(), c, 0.03);
    const pan = o ? (o.pan ?? (o.x != null ? (o.x * 2 - 1) * 0.8 : 0)) : 0;
    const useSamples = r && (!r.sets || ready(...r.sets));
    if (r && r.sets && !useSamples) r.sets.forEach(loadSet);
    const prev = voice, prevT = T0;
    voice = newVoice(c, name, useSamples ? r.L : 0, pan); T0 = offline ? 0.1 : now; // (offline: leave the compressors a moment to settle)
    if (useSamples) r.play(v, o || {}); else syn?.(v);
    live.push(voice);
    voice = prev; T0 = prevT;
  } catch { /* audio unavailable */ }
}

// ------------------------------------------------------------------ continuous pencil / eraser
// sfx('scribble', d) on every pointer move while drawing (d = distance moved in CSS px); it fades out by itself.
const pen = { src: null, g: null, f: null, t: 0, acc: 0, speed: 0, kind: '', idle: null };
function scribble(d, erase) {
  const c = ctx, key = erase ? 'erase' : 'pencil';
  if (!ready(key)) { loadSet(key); return; }
  const now = performance.now();
  pen.acc += +d || 0;
  const dt = now - pen.t;
  if (pen.src && pen.kind === key && dt < 16) return; // pointer events come in bursts: measure speed per frame
  const sp = Math.min(3000, pen.acc / (Math.max(16, Math.min(100, dt)) / 1000)); // px/s
  pen.t = now; pen.acc = 0;
  pen.speed = pen.speed * 0.5 + sp * 0.5;
  if (!pen.src || pen.kind !== key) {
    stopPen(0.02);
    pen.kind = key;
    pen.g = c.createGain(); pen.g.gain.value = 0;
    pen.f = c.createBiquadFilter(); pen.f.type = 'lowpass'; pen.f.frequency.value = 6000;
    pen.f.connect(pen.g).connect(out(c));
    const s = SETS[key];
    pen.src = c.createBufferSource(); pen.src.buffer = s.bufs[0]; pen.src.loop = true; pen.src.loopEnd = s.bufs[0].duration - 0.03;
    pen.src.connect(pen.f);
    pen.src.start(c.currentTime, Math.random() * (s.bufs[0].duration - 0.1));
  }
  const k = Math.min(1, pen.speed / 900);
  const t = c.currentTime;
  pen.g.gain.setTargetAtTime(k < 0.02 ? 0 : dB(-15) * Math.pow(k, 0.6), t, 0.025);
  pen.src.playbackRate.setTargetAtTime(0.8 + 0.4 * k, t, 0.05);
  pen.f.frequency.setTargetAtTime(2500 + 9000 * k, t, 0.05);
  clearTimeout(pen.idle);
  pen.idle = setTimeout(() => { if (pen.g) pen.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); pen.speed = 0; pen.idle = setTimeout(() => stopPen(0.05), 1500); }, 70);
}
function stopPen(fade) {
  if (!pen.src) return;
  const t = ctx.currentTime;
  try { pen.g.gain.setTargetAtTime(0, t, fade / 3); pen.src.stop(t + fade + 0.05); } catch { /* ignore */ }
  pen.src = null;
}

// ------------------------------------------------------------------ settings + misc exports
export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('gn.muted', muted ? '1' : '0'); } catch { /* ignore */ }
  if (muted && ctx) { live.forEach((v) => stopVoice(v, ctx)); live.length = 0; stopPen(0.02); }
}
export const uiSoundsOn = () => uiSounds;
export function setUiSounds(on) { uiSounds = !!on; try { localStorage.setItem('gn.uisfx', uiSounds ? '1' : '0'); } catch { /* ignore */ } }
/** Shared AudioContext for games that need raw audio (NES). */
export function audioContext() { return ac(); }
/** Every sound name sfx() knows. */
export const sfxNames = () => [...new Set([...Object.keys(R), ...Object.keys(SYNTH).filter((k) => k !== 'scratch'), 'scribble', 'rub'])];

// ------------------------------------------------------------------ offline rendering (tests / level checks)
let offline = null;
/** Render one sound into an AudioBuffer through the same bus (used by the sound test page). */
export async function renderSfx(name, v = 1, o = {}, seconds = 2.5, sr = 44100) {
  await warmUp();
  const oc = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const saved = { ctx, bus, master, voice, T0 }, savedMuted = muted;
  const chain = buildChain(oc);
  chain.master.connect(oc.destination);
  offline = { bus: chain.bus };
  ctx = oc; muted = false;
  const lb = new Map(lastByName); lastByName.clear();
  const liveSaved = live.splice(0);
  notes.clear();
  try { sfx(name === 'scribble' ? 'pencil' : name === 'rub' ? 'erase' : name, v, o); } finally {
    ctx = saved.ctx; offline = null; muted = savedMuted; voice = saved.voice; T0 = saved.T0;
    live.splice(0, live.length, ...liveSaved);
    lastByName.clear(); lb.forEach((val, k) => lastByName.set(k, val));
    notes.clear(); noiseBuf = null;
  }
  return oc.startRendering();
}

// ------------------------------------------------------------------ UI sounds
// A soft tap for buttons, a switch click for toggles and a paper slide when a sheet opens. Skipped when the
// game already made a sound for the same tap.
if (typeof document !== 'undefined') {
  const unlock = () => { ac(); warmUp(); };
  addEventListener('pointerdown', unlock, { once: true, capture: true, passive: true });
  addEventListener('keydown', unlock, { once: true, capture: true, passive: true });
  const BTN = 'button, [role="button"], a[href], .gcard, .rcard, .mcard, .fchip, .cchip, .numchip, .kt-choice, .navitem, .ditem, .seg button, [data-ink]';
  const TOGGLE = 'label.switch, input[type="checkbox"], input[type="radio"], [role="switch"]';
  addEventListener('click', (e) => {
    if (muted || !uiSounds || !e.isTrusted) return;
    const el = e.target?.closest?.(TOGGLE + ', ' + BTN);
    if (!el || el.disabled || el.closest('[data-nosfx]')) return;
    if (performance.now() - lastAny < 120) return;
    const x = e.clientX && innerWidth ? e.clientX / innerWidth : null;
    sfx(el.matches(TOGGLE) ? 'toggle' : 'tap', 1, x != null ? { x: 0.5 + (x - 0.5) * 0.4 } : undefined);
  }, { passive: true });
  const watch = () => {
    new MutationObserver((ms) => {
      if (muted || !uiSounds || !ctx) return;
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('scrim') && !n.classList.contains('center')) { if (performance.now() - lastAny > 60) sfx('sheet'); return; }
    }).observe(document.body, { childList: true });
  };
  if (document.body) watch(); else addEventListener('DOMContentLoaded', watch, { once: true });
}
