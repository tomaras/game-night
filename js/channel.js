// Stable / Nightly: two versions of the app on ONE site. Stable lives at the site root, Nightly in its /nightly/ folder.
// Every change goes to Nightly first; when it has proven itself it is promoted to Stable. This module lets a person
// flip between them from the menu and remembers the choice (the two share the browser's storage, so name, avatar,
// favourites and matches carry over). Stable and Nightly use separate room numbers, so a rough Nightly can never
// break a real game night.
import { CFG } from './net.js';

const KEY = 'gn.channel';
export const CHANNELS = [{ value: 'stable', label: 'Stable', icon: 'verified' }, { value: 'nightly', label: 'Nightly', icon: 'bolt' }];

const dirOf = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const current = () => (CFG.env === 'prod' ? 'stable' : CFG.env === 'nightly' ? 'nightly' : null);

/** { current, canSwitch, stableUrl, nightlyUrl } — switching only exists on the deployed site (not when running from source). */
export function channelInfo() {
  const cur = current();
  if (!cur) return { current: null, canSwitch: false };
  const here = dirOf();
  return { current: cur, canSwitch: true, stableUrl: cur === 'stable' ? here : here.replace(/nightly\/$/, ''), nightlyUrl: cur === 'nightly' ? here : here + 'nightly/' };
}
export const channelLabel = (c) => (c === 'nightly' ? 'Nightly' : 'Stable');
export const otherChannel = () => (current() === 'nightly' ? 'stable' : 'nightly');

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };
const exists = (url) => fetch(url + 'build.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok).catch(() => false);

/** Go to the other channel (remembering the choice). Resolves false if it isn't reachable. */
export async function switchChannel(to) {
  const info = channelInfo();
  if (!info.canSwitch || to === info.current) return true;
  const url = to === 'nightly' ? info.nightlyUrl : info.stableUrl;
  if (!(await exists(url))) return false;
  write(to);
  location.href = url + location.search; // (keeps test/debug query flags)
  return true;
}

/**
 * Called first thing at start-up. Returns true if we are leaving for another page.
 *  • ?channel=stable|nightly       explicit choice (also fixes a bad state: …/?channel=stable always gets you back to Stable)
 *  • Stable + remembered Nightly   open Nightly instead — but only for the plain home screen (never hijack an invite or match
 *    link) and only if Nightly is really there, so a broken Nightly can never lock anybody out of Stable.
 */
export async function maybeRedirect() {
  const info = channelInfo();
  if (!info.canSwitch) return false;
  const q = new URLSearchParams(location.search);
  const forced = q.get('channel');
  if (forced === 'stable' || forced === 'nightly') {
    write(forced);
    q.delete('channel');
    const rest = (q.toString() ? '?' + q : '') + location.hash;
    if (forced !== info.current) { const url = forced === 'nightly' ? info.nightlyUrl : info.stableUrl; if (await exists(url)) { location.replace(url + rest); return true; } return false; }
    history.replaceState(null, '', location.pathname + rest);
    return false;
  }
  if (info.current === 'stable' && read() === 'nightly' && /^(#\/?|#\/(games|rooms|matches|lounge)?)?$/.test(location.hash) && await exists(info.nightlyUrl)) {
    location.replace(info.nightlyUrl + location.search + location.hash);
    return true;
  }
  return false;
}
