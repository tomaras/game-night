// Day / System / Night theme. The choice is remembered; "system" follows the phone or computer setting live.
// (index.html has a tiny inline copy of resolve() so the right theme paints on the very first frame.)
const KEY = 'gn.theme';
const mq = matchMedia('(prefers-color-scheme: dark)');
export const THEMES = [['day', 'Day', 'light_mode'], ['system', 'System', 'brightness_auto'], ['night', 'Night', 'dark_mode']];
const listeners = new Set();

export function getThemePref() {
  try { const v = localStorage.getItem(KEY); return v === 'day' || v === 'night' || v === 'system' ? v : 'system'; } catch { return 'system'; }
}
export const resolveTheme = (pref = getThemePref()) => (pref === 'night' || (pref === 'system' && mq.matches) ? 'dark' : 'light');

export function applyTheme() {
  const t = resolveTheme();
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#0f1217' : '#f8fafd';
  const cs = document.querySelector('meta[name="color-scheme"]');
  if (cs) cs.content = t === 'dark' ? 'dark' : 'light';
  listeners.forEach((fn) => { try { fn(t); } catch { /* */ } });
}
export function setThemePref(v) {
  try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
  applyTheme();
}
export const onTheme = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function initTheme() {
  mq.addEventListener('change', () => { if (getThemePref() === 'system') applyTheme(); });
  applyTheme();
}
