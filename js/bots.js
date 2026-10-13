// Computer players. A bot is just a player with `bot: true`; the host runs its brain (see each game's `isHost`
// section) and "presses its buttons" through api.botDo(), so a bot goes through exactly the same rules checks as a human.
import { randomAvatar, BODY_COLORS } from './avatar.js';

export const BOT_NAMES = ['Ada', 'Byte', 'Pixel', 'Turbo', 'Nova', 'Sprocket', 'Gizmo', 'Zippy', 'Chip', 'Bolt', 'Echo', 'Orbit', 'Widget', 'Cog', 'Ziggy', 'Blip'];
export const LEVELS = [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }];

/** Make a new bot player record for a room's player list. `taken` = names/colours already used. */
export function makeBot(players, id, level = 'normal') {
  const names = new Set(players.map((p) => p.name));
  const free = BOT_NAMES.filter((n) => !names.has('Robo ' + n));
  const name = 'Robo ' + (free[Math.floor(Math.random() * free.length)] || 'Bot ' + id);
  const av = randomAvatar();
  av.r = 1; // drawn as a square-headed robot (see avatar.js)
  av.a = 0;
  return { id, name, avatar: av, color: BODY_COLORS[av.c], online: true, pid: '', av: { on: 0, mic: 0, cam: 0 }, bot: true, level };
}

/** Seeded-per-call helpers for bot "thinking": a human-ish delay that depends on difficulty. */
export const thinkMs = (level, base = 700, spread = 900) => {
  const k = level === 'easy' ? 1.4 : level === 'hard' ? 0.6 : 1;
  return Math.round((base + Math.random() * spread) * k);
};
export const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Drive the computer players of a game. `plan()` is called a few times a second on the host; it returns null when no
 * bot needs to act, or `{ delay, run }`. After the (human-like) delay `run()` performs the action via api.botDo().
 * Only one planned action is ever pending, so bots take their turns one after another like people do.
 */
export function botLoop(api, plan, every = 400) {
  if (!api.isHost) return;
  let busy = false;
  api.interval(() => {
    if (busy) return;
    const a = plan();
    if (!a) return;
    busy = true;
    api.timeout(() => { try { a.run(); } catch (e) { console.error('[bot]', e); } finally { busy = false; } }, a.delay ?? thinkMs(api.level));
  }, every);
}
export const chance = (level, easy, normal, hard) => Math.random() < (level === 'easy' ? easy : level === 'hard' ? hard : normal);
