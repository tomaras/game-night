// One shared microphone / camera for the whole app. Every call (the room's and the Lounge's) takes its own
// *clone* of the track, so both calls can use the same device at once, switching a control from one call to the other
// never blinks the camera light, and the hardware is released the moment nobody is using it.
const master = { audio: null, video: null };
const refs = { audio: 0, video: 0 };
const pending = { audio: null, video: null };

const CONSTRAINTS = {
  audio: { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
  video: { video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 20 } } },
};

const start = (kind) => (pending[kind] = pending[kind] || navigator.mediaDevices.getUserMedia(CONSTRAINTS[kind]).then((s) => { master[kind] = s.getTracks()[0]; return master[kind]; }).finally(() => { pending[kind] = null; }));

/** Ask the browser for the device RIGHT NOW. Call it synchronously inside the tap that turns the mic/camera on — phones
 *  (iOS Safari especially) only show the permission prompt for requests made straight from a tap, not after awaits. */
export function prime(kind) {
  if (!navigator.mediaDevices?.getUserMedia || (master[kind] && master[kind].readyState !== 'ended')) return;
  start(kind).catch(() => {}); // the real error is reported when acquire() awaits the same request
  setTimeout(() => { if (!refs[kind] && master[kind]) { try { master[kind].stop(); } catch { /* */ } master[kind] = null; } }, 20000); // nobody took it: switch the device back off
}

/** Get a live track of `kind` ('audio' | 'video'). Throws the browser's error if permission is refused. */
export async function acquire(kind) {
  if (!master[kind] || master[kind].readyState === 'ended') {
    await start(kind);
  }
  refs[kind]++;
  return master[kind].clone();
}

/** Give a track from acquire() back. The device is switched off once the last one is released. */
export function release(track, kind) {
  if (!track) return;
  try { track.stop(); } catch { /* */ }
  refs[kind] = Math.max(0, refs[kind] - 1);
  if (refs[kind] === 0 && master[kind]) { try { master[kind].stop(); } catch { /* */ } master[kind] = null; }
}

export const inUse = (kind) => refs[kind] > 0;
