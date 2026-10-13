// Turns a game's rules (the same text as the in-app "How to play") into a spoken walkthrough: a list of sentences, each
// with the section it belongs to. The sentences become the voiceover AND the captions.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The game registry, loaded in plain Node. */
export async function loadGames() {
  globalThis.window = globalThis;
  globalThis.document = { createElement: () => ({}), head: { append() {} } };
  globalThis.localStorage = { getItem() { return null; } };
  const m = await import(path.join(ROOT, 'js/games/index.js'));
  return { GAMES: m.GAMES, GAME_BY_ID: m.GAME_BY_ID };
}

// What is NOT in the basic rules text: features worth pointing out.
const EXTRA = {
  chess: [
    'Pick a time control before you start, from one minute bullet all the way to thirty minute classical, with increments.',
    'Move by tapping a piece and then a highlighted square, or by dragging and dropping. Legal moves are shown as dots.',
    'When it is your opponent’s turn you can still queue a premove, and it plays the instant they move.',
    'Tap any move in the list to step back through the game, or use the arrows. Against the computer, or over the board, you can ask for a hint and switch on the evaluation bar to see who is better.',
    'Made a mistake? Tap undo to take your move back. Against a person, they have to agree first.',
    'There is also a same device mode for two people sitting opposite each other: black’s pieces face the other player, and both clocks run on the one screen.',
    'In the more menu you can change the board colours, copy the game as a P G N, or copy the position.',
  ],
  pool: [
    'Drag anywhere on the table to aim. The dashed line shows where the cue ball goes, the yellow line shows where the ball you hit will travel, and a short white line shows where the cue ball goes afterwards.',
    'Use the power slider to set how hard to hit, and the small cue ball to choose where you strike it. Hit the top to follow through, the bottom to draw the ball back, and the sides to put English on the shot.',
    'The little arrows nudge your aim in tiny steps, and the eye button changes how much of the aim guide you see.',
  ],
  connect4: [
    'When you play the computer you can tap hint to see a good column, or undo to take your last move back.',
    'You can also play it by message: make a move, send the link in a text, and your friend answers whenever they like.',
  ],
  poker: [
    'Your two private cards are shown at the bottom. The five shared cards go in the middle as the hand goes on.',
    'On your turn use the buttons to fold, check or call, or drag the slider to choose how much to raise.',
  ],
  colorrush: [
    'Your playable cards pop up when you hover or tap them, and cards you cannot play are dimmed.',
  ],
};

const clean = (t) => String(t || '')
  .replace(/♥|♡/g, 'heart')
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
  .replace(/×/g, ' times ').replace(/&/g, ' and ').replace(/\s*[—–]\s*/g, ', ').replace(/…/g, '...')
  .replace(/\bUNO\b/g, 'Uno').replace(/\bvs\.?\b/gi, 'versus').replace(/\+(\d)/g, 'plus $1').replace(/\s+/g, ' ').trim();
const sentence = (t) => { t = clean(t); if (!t) return ''; return /[.!?]$/.test(t) ? t : t + '.'; };
const ORD = ['First', 'Next', 'Then', 'After that', 'Then', 'Finally'];
const range = (g) => { const lo = g.bots || g.solo ? 1 : g.min; return lo === g.max ? `${lo}` : `${lo} to ${g.max}`; };

/** @returns {{section: string, text: string}[]} */
export function buildScript(g) {
  const out = [];
  const add = (section, ...texts) => { for (const t of texts.flat()) { const s = sentence(t); if (s) out.push({ section, text: s }); } };
  add('Intro', `Welcome to ${g.name}.`, g.tagline, `It's a ${String(g.cat).toLowerCase()} game for ${range(g)} players${g.bots ? ', and you can play it against the computer when nobody else is around' : g.solo ? ', and it works great on your own too' : ''}.`);
  add('Overview', g.desc);
  const help = g.help || {};
  if (help.goal) add('The goal', 'Here is the goal.', help.goal);
  const steps = help.steps || g.howto || [];
  if (steps.length) {
    add('How to play', 'Let us go through how it works.');
    steps.forEach((s, i) => {
      let t = String(s).replace(/^step \d+\s*[:.-]\s*/i, '').trim();
      if (/^[A-Z][a-z]/.test(t) && !/^(I|Uno|UNO)\b/.test(t)) t = t[0].toLowerCase() + t.slice(1); // read as one flowing sentence after "First,"
      add('How to play', `${ORD[Math.min(i, ORD.length - 1)]}, ${t}`);
    });
  }
  if (EXTRA[g.id]) add('Features', 'A few things worth knowing.', EXTRA[g.id]);
  const ctl = (help.controls || []).filter(([k]) => k && k.length < 40);
  if (ctl.length) {
    add('Controls', 'The controls are simple.');
    for (const [k, a] of ctl.slice(0, 4)) add('Controls', /^(tap|click|drag|press|hold|swipe|use|hit|double|arrow|space|enter)/i.test(k.trim()) ? `${k} to ${a}` : `${k}: ${a}`);
  }
  if ((help.tips || []).length) { add('Tips', 'And a few tips.'); add('Tips', ...help.tips); }
  const opts = (g.options || []).map((o) => o.label).filter(Boolean);
  if (opts.length) add('Setup', `Before you start, the host can choose ${opts.length > 1 ? opts.slice(0, -1).join(', ') + ' and ' + opts.at(-1) : opts[0]}.`);
  add('Outro', `That is ${g.name}. Make a room, invite your friends, and have fun.`);
  return out;
}
