// Tiny WebAudio sound-effect synth. No asset files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('gn.muted') === '1'; } catch { /* ignore */ }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Every sound effect goes through one master bus, so the recorder can tap "what the app sounds like".
let bus = null, tap = null;
function out(c) {
  if (!bus) { bus = c.createGain(); bus.connect(c.destination); }
  return bus;
}
/** A MediaStream carrying the app's sound effects (for recordings). */
export function recordingTap() {
  const c = ac();
  if (!c) return null;
  if (!tap) { tap = c.createMediaStreamDestination(); out(c).connect(tap); }
  return tap.stream;
}

function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out(c));
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.08, delay = 0) {
  const c = ac();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(out(c));
  s.start(c.currentTime + delay);
}

const SFX = {
  click: () => tone(660, 0.05, { type: 'triangle' }),
  pop: () => tone(520, 0.09, { type: 'sine', slide: 380, vol: 0.09 }),
  tick: () => tone(900, 0.03, { type: 'square', vol: 0.03 }),
  turn: () => { tone(523, 0.08, { type: 'triangle' }); tone(784, 0.12, { type: 'triangle', delay: 0.08 }); },
  good: () => { tone(660, 0.08, { type: 'triangle' }); tone(880, 0.14, { type: 'triangle', delay: 0.08 }); },
  bad: () => { tone(220, 0.18, { type: 'sawtooth', slide: -80, vol: 0.05 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.1, vol: 0.08 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, { type: 'sawtooth', delay: i * 0.13, vol: 0.05 })),
  card: () => { noise(0.05, 0.05); tone(300, 0.04, { type: 'triangle', vol: 0.04 }); },
  coin: () => { tone(988, 0.06, { type: 'square', vol: 0.05 }); tone(1319, 0.2, { type: 'square', vol: 0.05, delay: 0.06 }); },
  boom: () => { noise(0.35, 0.18); tone(110, 0.3, { type: 'sawtooth', slide: -80, vol: 0.08 }); },
  shoot: () => tone(800, 0.1, { type: 'square', slide: -500, vol: 0.04 }),
  hit: () => { noise(0.12, 0.1); tone(180, 0.1, { type: 'square', vol: 0.05 }); },
  bump: () => tone(140, 0.08, { type: 'triangle', vol: 0.1 }),
  clack: () => { noise(0.04, 0.12); tone(1200, 0.03, { type: 'triangle', vol: 0.05 }); },
  join: () => { tone(440, 0.07, { type: 'sine' }); tone(660, 0.1, { type: 'sine', delay: 0.07 }); },
  msg: () => tone(740, 0.06, { type: 'sine', vol: 0.05 }),
  line: () => [523, 659, 784].forEach((f, i) => tone(f, 0.07, { type: 'square', vol: 0.04, delay: i * 0.05 })),
  drop: () => tone(200, 0.05, { type: 'square', vol: 0.04 }),
  // physical sounds: the argument is how hard the thing was hit (0..1)
  ball: (v = 1) => { noise(0.03, 0.05 + 0.13 * v); tone(2300 + 700 * v, 0.045, { type: 'sine', vol: 0.03 + 0.08 * v }); tone(3600, 0.03, { type: 'sine', vol: 0.015 + 0.04 * v }); },
  rail: (v = 1) => { noise(0.07, 0.03 + 0.1 * v); tone(150 + 40 * v, 0.1, { type: 'sine', vol: 0.05 + 0.1 * v, slide: -50 }); },
  pocket: () => { tone(180, 0.16, { type: 'sine', vol: 0.12, slide: -90 }); noise(0.1, 0.05, 0.03); tone(90, 0.22, { type: 'sine', vol: 0.09, delay: 0.14, slide: -40 }); },
  cue: (v = 1) => { noise(0.02, 0.07 + 0.12 * v); tone(1500, 0.035, { type: 'triangle', vol: 0.05 + 0.08 * v }); tone(380, 0.05, { type: 'sine', vol: 0.06 + 0.06 * v }); },
  wood: () => { noise(0.025, 0.05); tone(520, 0.07, { type: 'sine', vol: 0.09, slide: -120 }); tone(210, 0.09, { type: 'sine', vol: 0.07 }); },
  woodcap: () => { noise(0.04, 0.1); tone(640, 0.08, { type: 'sine', vol: 0.1, slide: -160 }); tone(240, 0.12, { type: 'sine', vol: 0.09 }); tone(900, 0.04, { type: 'triangle', vol: 0.04 }); },
  thud: (v = 1) => { tone(110, 0.12, { type: 'sine', vol: 0.06 + 0.08 * v, slide: -40 }); noise(0.05, 0.03 + 0.05 * v); },
  whoosh: () => { noise(0.16, 0.05); tone(300, 0.14, { type: 'sine', vol: 0.025, slide: 500 }); },
};

export function sfx(name, v) {
  if (muted) return;
  try { SFX[name]?.(v); } catch { /* audio unavailable */ }
}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('gn.muted', muted ? '1' : '0'); } catch { /* ignore */ }
}
/** Shared AudioContext for games that need raw audio (NES). */
export function audioContext() { return ac(); }
