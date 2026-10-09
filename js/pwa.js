// Installable-app + silent-update layer. See sw.js for the other half.
//
// Update policy: a new version downloads in the background and WAITS. It is applied (one quick reload) only at a
// quiet moment — on the home screen, outside any room, with no sheet/dialog open and nothing being typed.
// So nobody is ever kicked out of a game by a deploy; they simply get the new version next time they are idle.
import { CFG } from './net.js';

const listeners = new Set();
export const pwa = { ready: false, installEvent: null, standalone: false, supported: 'serviceWorker' in navigator, reg: null };
const emit = () => listeners.forEach((fn) => { try { fn(pwa); } catch { /* ignore */ } });
export const onPwaChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

pwa.standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pwa.installEvent = e; emit(); });
addEventListener('appinstalled', () => { pwa.installEvent = null; pwa.standalone = true; emit(); });

/** Android/desktop Chrome: show the native install dialog. Returns true if the user accepted. */
export async function promptInstall() {
  const ev = pwa.installEvent;
  if (!ev) return false;
  ev.prompt();
  const r = await ev.userChoice.catch(() => ({ outcome: 'dismissed' }));
  pwa.installEvent = null;
  emit();
  return r.outcome === 'accepted';
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Wipe the service worker and every cache (the ?reset escape hatch). */
export async function resetApp() {
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* ignore */ }
  try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignore */ }
}

/**
 * @param {() => boolean} isQuiet  true when it is safe to reload the page (home screen, nothing open)
 */
export async function initPwa(isQuiet) {
  const q = new URLSearchParams(location.search);
  if (q.has('reset')) {
    await resetApp();
    q.delete('reset');
    location.replace(location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    return;
  }
  if (!pwa.supported || CFG.env === 'local' || q.has('nosw')) return;

  let hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // first install claiming the page — no reload needed
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  let reg;
  try { reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }); } catch (e) { console.warn('[pwa] register failed', e); return; }
  pwa.reg = reg;

  const check = () => { reg.update().catch(() => {}); };
  const markReady = () => { if (reg.waiting && navigator.serviceWorker.controller && !pwa.ready) { pwa.ready = true; emit(); apply(false); } };
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') markReady(); });
  });
  markReady();

  /** Take the update now (force) or only if it's a quiet moment. */
  function apply(force) {
    if (!pwa.ready || !reg.waiting) return false;
    if (!force && !isQuiet()) return false;
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }
  pwa.applyUpdate = (force = true) => apply(force);
  pwa.checkNow = () => { check(); return new Promise((res) => setTimeout(() => res(pwa.ready), 2500)); };

  // look for updates on launch, whenever the app comes back to the front, and every 20 minutes
  let last = Date.now();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > 5 * 60000) { last = Date.now(); check(); } });
  setInterval(() => { last = Date.now(); check(); }, 20 * 60000);
  setInterval(() => { if (pwa.ready) apply(false); }, 4000); // keep trying until a quiet moment comes
  check();
}
