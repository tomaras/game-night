#!/usr/bin/env node
// Builds the "how to play" video for a game: voiceover (neural TTS) + a title card + the captured gameplay + captions.
//   node videos/build.mjs <gameId...> [--seconds 110] [--out .video-out] [--keep]
// Needs: ffmpeg on PATH, Piper (PIPER_PYTHON = a python with piper-tts installed, PIPER_VOICE = path to a .onnx voice).
// Writes <out>/<id>.mp4, <id>.vtt (captions) and <id>.jpg (poster).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { loadGames, buildScript } from './script.mjs';
import { captureGame } from './capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PIPER_PYTHON, VOICE = process.env.PIPER_VOICE;
const W = 480, H = 1038, FPS = 30, TITLE = 3.4, LEAD = 0.7, GAP = 0.32, SECTION_GAP = 0.75, TAIL = 1.2;
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...opts });
const vttTime = (t) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`; };

async function titleCard(def, file, browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.0 });
  const font = 'file://' + path.join(ROOT, 'assets/fonts/outfit-latin.woff2');
  await page.setContent(`<style>@font-face{font-family:Outfit;src:url(${font});font-weight:100 900}
    body{margin:0;width:390px;height:844px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Outfit,system-ui;color:#fff;
    background:radial-gradient(520px 420px at 50% 28%, color-mix(in srgb, ${def.color} 70%, #fff) 0%, ${def.color} 55%, color-mix(in srgb, ${def.color} 55%, #000) 100%)}
    .e{font-size:132px;line-height:1;filter:drop-shadow(0 12px 18px rgba(0,0,0,.35))} h1{font-size:44px;margin:22px 28px 6px;font-weight:800;letter-spacing:-1px;text-shadow:0 3px 14px rgba(0,0,0,.35)}
    p{font-size:20px;margin:0 36px;opacity:.95;font-weight:500} .k{margin-top:34px;padding:9px 22px;border-radius:999px;background:rgba(255,255,255,.22);font-size:17px;font-weight:700;letter-spacing:.5px;backdrop-filter:blur(6px)}
    .l{position:absolute;bottom:34px;font-size:15px;font-weight:700;opacity:.8;letter-spacing:1px}</style>
    <div class=e>${def.emoji}</div><h1>${def.name}</h1><p>${def.tagline}</p><div class=k>HOW TO PLAY</div><div class=l>GAME NIGHT</div>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  await page.close();
}

export async function buildVideo(id, { seconds = 110, out = path.join(ROOT, '.video-out'), work = path.join(ROOT, '.video-work'), keep = false, recapture = true } = {}) {
  const { GAME_BY_ID } = await loadGames();
  const def = GAME_BY_ID[id];
  const script = buildScript(def);
  const dir = path.join(work, id);
  fs.mkdirSync(out, { recursive: true });

  // 1. voiceover, sentence by sentence (so we know exactly when each one is spoken)
  const wavDir = path.join(dir, 'wav');
  fs.rmSync(wavDir, { recursive: true, force: true });
  const job = { model: VOICE, outdir: wavDir, length_scale: 1.04, items: script.map((s, i) => ({ id: String(i).padStart(3, '0'), text: s.text })) };
  const durs = JSON.parse(sh(PY, [path.join(ROOT, 'videos/tts.py')], { input: JSON.stringify(job), maxBuffer: 1 << 26 }).toString());
  // timeline
  const cues = [];
  let t = TITLE > 0 ? LEAD : 0;
  const parts = [];
  const silence = (sec, name) => { const f = path.join(wavDir, name + '.wav'); if (!fs.existsSync(f)) sh('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', String(sec), '-c:a', 'pcm_s16le', f]); return f; };
  parts.push(silence(LEAD, 'lead'));
  script.forEach((s, i) => {
    const k = String(i).padStart(3, '0');
    cues.push({ start: t, end: t + durs[k], text: s.text });
    parts.push(path.join(wavDir, k + '.wav'));
    t += durs[k];
    const next = script[i + 1];
    const gap = next && next.section !== s.section ? SECTION_GAP : GAP;
    parts.push(silence(gap, 'gap' + Math.round(gap * 100)));
    t += gap;
  });
  parts.push(silence(TAIL, 'tail'));
  t += TAIL;
  const total = t;
  fs.writeFileSync(path.join(wavDir, 'list.txt'), parts.map((p) => `file '${p}'`).join('\n'));
  const voice = path.join(dir, 'voice.wav');
  sh('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(wavDir, 'list.txt'), '-af', 'loudnorm=I=-17:TP=-1.5:LRA=9,aresample=44100', '-ac', '1', voice]);
  fs.writeFileSync(path.join(out, id + '.vtt'), 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end + 0.15)}\n${c.text}\n`).join('\n'));

  // 2. gameplay footage long enough for the narration
  const need = Math.ceil(total - TITLE + 1);
  let meta = fs.existsSync(path.join(dir, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) : null;
  if (!meta || recapture) { fs.rmSync(dir + '/frames', { recursive: true, force: true }); meta = await captureGame(id, { seconds: Math.max(seconds, need + 2), work }); }
  const base = meta.frameList[0][1];
  const frames = meta.frameList.map(([f, ts]) => ({ file: path.join(dir, 'frames', f), ts }));
  const list = [];
  const startAt = Math.min(1.0, meta.span * 0.1), endAt = startAt + need;
  frames.forEach((f, i) => { const a = f.ts - base, b = (frames[i + 1] ? frames[i + 1].ts : f.ts + 0.3) - base; if (b > startAt && a < endAt) list.push(`file '${f.file}'`, `duration ${(Math.min(b, endAt) - Math.max(a, startAt)).toFixed(4)}`); });
  list.push(list[list.length - 2]); // ffmpeg quirk: repeat the last file
  fs.writeFileSync(path.join(dir, 'frames.txt'), list.join('\n'));
  const play = path.join(dir, 'play.mp4');
  sh('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'frames.txt'), '-vf', `fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-t', String(need), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', play]);

  // 3. title card, then crossfade into the gameplay, with the voiceover underneath
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true });
  const card = path.join(dir, 'title.png');
  await titleCard(def, card, browser);
  await browser.close();
  sh('ffmpeg', ['-v', 'error', '-y', '-i', card, '-vf', `scale=${W}:${H}:flags=lanczos`, '-q:v', '4', path.join(out, id + '.jpg')]);
  const final = path.join(out, id + '.mp4');
  sh('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-framerate', String(FPS), '-t', String(TITLE + 0.6), '-i', card, '-i', play, '-i', voice,
    '-filter_complex', `[0:v]scale=${W}:${H}:flags=lanczos,format=yuv420p,fps=${FPS}[a];[1:v]fps=${FPS},format=yuv420p[b];[a][b]xfade=transition=fade:duration=0.6:offset=${TITLE},format=yuv420p[v]`,
    '-map', '[v]', '-map', '2:a', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-maxrate', '650k', '-bufsize', '1300k', '-profile:v', 'main', '-c:a', 'aac', '-b:a', '56k', '-ar', '44100', '-movflags', '+faststart', final]);
  if (!keep) fs.rmSync(path.join(dir, 'frames'), { recursive: true, force: true });
  const mb = fs.statSync(final).size / 1e6;
  return { id, seconds: total, mb, words: script.map((s) => s.text).join(' ').split(' ').length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!PY || !VOICE) { console.error('Set PIPER_PYTHON and PIPER_VOICE (see videos/README.md)'); process.exit(1); }
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
  const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && /^--(seconds|out|work)$/.test(args[i - 1])));
  for (const id of ids) {
    const t0 = Date.now();
    try { const r = await buildVideo(id, { seconds: +opt('seconds', 110), out: opt('out', path.join(ROOT, '.video-out')), keep: args.includes('--keep') }); console.log(`✔ ${id}: ${r.seconds.toFixed(0)} s, ${r.mb.toFixed(1)} MB, ${r.words} words (${((Date.now() - t0) / 1000).toFixed(0)} s to make)`); }
    catch (e) { console.log(`✗ ${id}: ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' | ')}`); process.exitCode = 1; }
  }
  process.exit(process.exitCode || 0);
}
