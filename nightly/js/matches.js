// Turn-by-turn matches (like iMessage games): the whole position travels inside a link. After your move the app
// offers to text it to your opponent; when they open it they see your move and play theirs, and send a link back.
// There is no server: matches are remembered on each phone (localStorage) and everything needed to continue lives in the link.
import { sanitizeAvatar } from './avatar.js';

const KEY = 'gn.matches';
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

// ------------------------------------------------------------------ storage
export function loadMatches() {
  try { const m = JSON.parse(localStorage.getItem(KEY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; }
}
function saveAll(all) {
  // keep it tidy: at most 40 matches, newest first
  const arr = Object.values(all).sort((a, b) => b.updated - a.updated).slice(0, 40);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(arr.map((m) => [m.id, m])))); } catch { /* storage full */ }
}
export const getMatch = (id) => loadMatches()[id] || null;
export function putMatch(m) { const all = loadMatches(); m.updated = Date.now(); all[m.id] = m; saveAll(all); return m; }
export function deleteMatch(id) { const all = loadMatches(); delete all[id]; saveAll(all); }
export const listMatches = () => Object.values(loadMatches()).sort((a, b) => b.updated - a.updated);
/** How many matches are waiting for ME to move (shown as the badge on the Matches tab). */
export const myTurnCount = () => listMatches().filter((m) => !m.over && m.turn && m.turn === m.mine && m.mode === 'link').length;

export const newMatchId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

// ------------------------------------------------------------------ link codec
const b64 = {
  enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
/** What goes in a link: just enough to continue the game (no photos, no history we can't use). */
const slim = (m) => ({
  i: m.id, g: m.game, o: m.opts, s: m.seed, c: m.created,
  p: m.players.map((p) => ({ n: p.name, a: { c: p.avatar?.c, e: p.avatar?.e, m: p.avatar?.m, a: p.avatar?.a } })),
  x: m.snap, t: m.turn, v: m.over ? 1 : 0, u: m.summary || '', k: m.moves || 0,
});
export async function encodeMatch(m) {
  const json = new TextEncoder().encode(JSON.stringify(slim(m)));
  try {
    if (typeof CompressionStream === 'function') return 'z' + b64.enc(await pipe(json, new CompressionStream('deflate-raw')));
  } catch { /* fall through */ }
  return 'j' + b64.enc(json);
}
export async function decodeMatch(token) {
  const kind = token[0], raw = b64.dec(token.slice(1));
  const bytes = kind === 'z' ? await pipe(raw, new DecompressionStream('deflate-raw')) : raw;
  const o = JSON.parse(new TextDecoder().decode(bytes));
  if (!o || typeof o.i !== 'string' || typeof o.g !== 'string' || !Array.isArray(o.p) || o.p.length !== 2) throw new Error('This match link is not valid.');
  const players = o.p.map((p, i) => ({ id: 'p' + (i + 1), name: cleanName(p.n) || 'Player ' + (i + 1), avatar: sanitizeAvatar(p.a) }));
  return { id: String(o.i).slice(0, 16), game: o.g, opts: o.o && typeof o.o === 'object' ? o.o : {}, seed: o.s >>> 0, created: +o.c || Date.now(), players, snap: o.x ?? null, turn: o.t || null, over: !!o.v, summary: String(o.u || '').slice(0, 120), moves: +o.k || 0 };
}
export const matchLink = (token) => location.origin + location.pathname + '#/m/' + token;

// ------------------------------------------------------------------ sharing
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const smsUrl = (text) => `sms:${ios() ? '&' : '?'}body=${encodeURIComponent(text)}`;
export function shareText(m, def, link, myName) {
  const them = m.players.find((p) => p.id === m.turn);
  const note = m.over ? `The game is over — ${m.summary || 'see the result'}.` : `${them && them.name !== myName ? them.name + ', i' : 'I'}t’s your turn!`;
  return `${def.emoji} ${def.name} vs ${myName}: ${note} ${link}`;
}
/** Open the phone's share sheet (Messages, WhatsApp, …). Resolves true if a sheet was shown. */
export async function nativeShare(m, def, link, myName) {
  if (!navigator.share) return false;
  try { await navigator.share({ title: `${def.name} — your turn`, text: shareText(m, def, link, myName).replace(' ' + link, ''), url: link }); return true; } catch (e) { return e && e.name === 'AbortError' ? 'cancelled' : false; }
}
