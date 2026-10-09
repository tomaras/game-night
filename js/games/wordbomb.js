// Word Bomb — a bomb with a fuse of unknown length gets passed around. Type a real word containing
// the letters shown before it blows up in your hands. Words can't be reused. Last player standing wins.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const CSS = `
.wb { align-items:center; }
.wb-bomb { position:relative; width:min(62vw, 240px); aspect-ratio:1; margin:6px auto; display:grid; place-items:center; }
.wb-ball { position:absolute; inset:8% 8% 0 8%; border-radius:50%; background:radial-gradient(circle at 35% 30%, #5f6368, #202124 70%); box-shadow:0 14px 30px rgba(0,0,0,.35); }
.wb-bomb.hot .wb-ball { animation:wbshake .12s infinite; background:radial-gradient(circle at 35% 30%, #f57c00, #7a1c00 70%); }
.wb-fuse { position:absolute; top:-2%; right:22%; width:8px; height:22%; background:#8d6e63; border-radius:4px; transform:rotate(25deg); transform-origin:bottom; }
.wb-fuse::after { content:''; position:absolute; top:-12px; left:-8px; width:24px; height:24px; border-radius:50%; background:radial-gradient(circle, #fff 0, #fbbc04 40%, transparent 70%); animation:pulse .25s infinite; }
.wb-syl { position:relative; font:900 clamp(44px, 14vw, 76px)/1 var(--font); color:#fff; letter-spacing:2px; text-shadow:0 3px 0 rgba(0,0,0,.4); margin-top:6%; }
@keyframes wbshake { 0%, 100% { transform:translate(0,0); } 25% { transform:translate(-2px, 1px); } 75% { transform:translate(2px, -1px); } }
.wb-ring { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; }
.wb-p { background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:8px 10px; min-width:96px; display:flex; flex-direction:column; align-items:center; gap:2px; border:3px solid transparent; transition:.15s; }
.wb-p.turn { border-color:var(--red); transform:scale(1.06); }
.wb-p.out { opacity:.35; }
.wb-p .nm { font:700 13px var(--font); max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wb-p .ty { font:700 13px var(--font); color:var(--blue); min-height:18px; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wb-p .hp { display:flex; gap:2px; color:var(--red); }
.wb-p .hp .ic { width:16px; height:16px; } .wb-p .hp .ic.off { color:var(--line2); }
.wb-in { width:100%; max-width:420px; font-size:22px; text-align:center; text-transform:lowercase; font-weight:700; }
.wb-in.bad { animation:shake .3s; border-color:var(--red); }
.wb-used { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; max-height:90px; overflow:hidden; }
.wb-used span { background:var(--s2); border-radius:999px; padding:2px 10px; font:600 12px var(--font); color:var(--on2); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const LIVES = +api.opts.lives || 2;
  const diff = api.opts.level || 'normal';
  const nameOf = (id) => api.player(id)?.name || '?';
  const root = h('div.kt.wb');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'loading', turn: null, syl: '', lives: {}, typing: '', used: [], hot: false, msg: '' };
  ids.forEach((i) => (S.lives[i] = LIVES));
  let input = null;

  api.on('state', (s) => { const was = S.turn; Object.assign(S, s); if (S.turn !== was && S.turn === api.me) { api.sfx('turn'); setTimeout(() => input?.focus(), 60); } render(); });
  api.on('typing', (t) => { if (S.turn !== api.me) { S.typing = t.t; const el = root.querySelector('.wb-p.turn .ty'); if (el) el.textContent = t.t; } });
  api.on('boom', (b) => { api.sfx('boom'); S.msg = `${nameOf(b.id)}’s bomb exploded! 💥`; });
  api.on('ok', (o) => { api.sfx('pop'); });
  api.on('rej', (r) => { api.sfx('bad'); if (input) { input.classList.remove('bad'); void input.offsetWidth; input.classList.add('bad'); } S.msg = r.msg; const m = root.querySelector('.kt-hint.msg'); if (m) m.textContent = r.msg; });
  api.onPlayersChanged(() => S.phase !== 'loading' && render());

  const hearts = (n) => h('span.hp', Array.from({ length: LIVES }, (_, i) => icon('favorite', i < n ? '' : 'off')));
  let lastTy = 0;

  function render() {
    const me = api.me;
    const parts = [];
    if (S.phase === 'loading') { root.replaceChildren(h('div.kt-center', h('div', [h('div.spinner'), h('div.kt-hint', 'Loading the dictionary…')]))); return; }
    parts.push(h('div.wb-bomb' + (S.hot ? '.hot' : ''), h('div.wb-ball'), h('div.wb-fuse'), h('div.wb-syl', S.syl.toUpperCase())));
    parts.push(h('div.kt-hint.msg', { style: 'font-weight:700;color:var(--on)' }, S.phase === 'over' ? '' : S.turn === me ? 'Your turn — type a word containing these letters!' : `${nameOf(S.turn)} has the bomb…`));
    if (S.turn === me && S.phase === 'play') {
      input = h('input.txt.wb-in', { placeholder: 'type a word…', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send',
        oninput: (e) => { const n = performance.now(); if (n - lastTy > 100) { lastTy = n; api.toHost('typing', { t: e.target.value.slice(0, 24) }); } },
        onkeydown: (e) => { if (e.key === 'Enter') { api.toHost('word', { w: e.target.value }); e.target.value = ''; } } });
      parts.push(input, h('button.btn.primary', { onclick: () => { api.toHost('word', { w: input.value }); input.value = ''; input.focus(); } }, icon('send'), 'Send'));
    } else input = null;
    parts.push(h('div.wb-ring', api.players.map((p) => h('div.wb-p' + (S.turn === p.id ? '.turn' : '') + (S.lives[p.id] <= 0 ? '.out' : ''), avatarEl({ ...p, online: p.online && !p.left }, 'lg', { still: S.turn !== p.id }), h('div.nm', p.name + (p.id === me ? ' (you)' : '')), hearts(S.lives[p.id]), h('div.ty', S.turn === p.id && p.id !== me ? S.typing : '')))));
    if (S.used.length) parts.push(h('div.wb-used', S.used.slice(-14).map((w) => h('span', w))));
    root.replaceChildren(...parts);
    if (input) setTimeout(() => input && input.focus(), 30);
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { dict: null, syls: [], lives: {}, turn: null, syl: '', used: new Set(), fuseEnd: 0, timer: 0, out: [], phase: 'loading' };
    ids.forEach((i) => (H.lives[i] = LIVES));
    const alive = () => ids.filter((i) => H.lives[i] > 0 && !api.player(i).left);
    api.cleanup(() => clearTimeout(H.timer));
    const pub = (extra = {}) => api.broadcast('state', { phase: H.phase, turn: H.turn, syl: H.syl, lives: H.lives, used: [...H.used], hot: H.fuseEnd - performance.now() < 3500, typing: '', ...extra });
    async function load() {
      const txt = await (await fetch(new URL('../../vendor/words.txt', import.meta.url))).text();
      const words = txt.split(/\s+/).filter((w) => /^[a-z]{3,}$/.test(w));
      H.dict = new Set(words);
      const cnt = new Map();
      for (const w of words) { const seen = new Set(); for (let L = 2; L <= 3; L++) for (let i = 0; i + L <= w.length; i++) seen.add(w.slice(i, i + L)); for (const s of seen) cnt.set(s, (cnt.get(s) || 0) + 1); }
      const [lo2, lo3] = diff === 'easy' ? [1800, 700] : diff === 'hard' ? [150, 60] : [500, 220];
      const hi = diff === 'easy' ? 99999 : diff === 'hard' ? 700 : 2400;
      H.syls = [...cnt.entries()].filter(([s, c]) => (s.length === 2 ? c >= lo2 && c <= hi : c >= lo3 && c <= hi)).map(([s]) => s);
      begin();
    }
    function begin() { H.turn = alive()[0]; newBomb(true); }
    function newSyl() { H.syl = H.syls[Math.floor(rng.next() * H.syls.length)]; }
    function newBomb(first) {
      clearTimeout(H.timer);
      newSyl();
      const fuse = 9000 + Math.floor(rng.next() * 12000);
      H.fuseEnd = performance.now() + fuse;
      H.phase = 'play';
      pub();
      H.timer = setTimeout(explode, fuse);
      void first;
    }
    function explode() {
      clearTimeout(H.timer);
      const id = H.turn;
      H.lives[id]--;
      api.broadcast('boom', { id });
      if (H.lives[id] <= 0) H.out.push(id);
      if (alive().length <= 1) { H.phase = 'over'; pub(); return api.timeout(finish, 1800); }
      H.turn = nextAlive(id);
      newSyl();
      H.phase = 'play';
      H.used = new Set();
      const fuse = 9000 + Math.floor(rng.next() * 12000);
      H.fuseEnd = performance.now() + fuse;
      pub();
      H.timer = setTimeout(explode, fuse);
    }
    const nextAlive = (id) => { const l = alive(); if (!l.length) return id; const k = ids.indexOf(id); for (let i = 1; i <= ids.length; i++) { const c = ids[(k + i) % ids.length]; if (l.includes(c)) return c; } return l[0]; };
    function finish() {
      const w = alive()[0];
      const ranking = [...(w ? [w] : []), ...H.out.slice().reverse().filter((i) => i !== w)].map((id) => ({ id, score: H.lives[id], note: 'lives left' }));
      api.endGame({ title: w ? `${nameOf(w)} defused them all!` : 'Boom — nobody left!', subtitle: 'Last one standing', ranking, winners: w ? [w] : [] });
    }
    api.on('typing', (t, from) => { if (from === H.turn) api.broadcast('typing', t, from); });
    api.on('word', ({ w }, from) => {
      if (H.phase !== 'play' || from !== H.turn) return;
      w = String(w || '').trim().toLowerCase();
      if (!w.includes(H.syl)) return api.sendTo(from, 'rej', { msg: `Must contain “${H.syl.toUpperCase()}”` });
      if (H.used.has(w)) return api.sendTo(from, 'rej', { msg: 'Already used!' });
      if (!H.dict.has(w)) return api.sendTo(from, 'rej', { msg: 'Not in my dictionary' });
      H.used.add(w);
      api.broadcast('ok', { w });
      H.turn = nextAlive(from);
      newSyl();
      pub();
    });
    api.onRejoin(() => pub());
    api.onLeave((id) => { if (H.phase === 'play' && H.turn === id) { H.turn = nextAlive(id); newSyl(); } if (alive().length <= 1 && H.phase !== 'over') { H.phase = 'over'; clearTimeout(H.timer); pub(); api.timeout(finish, 1200); } else pub(); });
    load().catch((e) => { console.error(e); api.toast('Could not load the dictionary'); });
  }
  render();
}
