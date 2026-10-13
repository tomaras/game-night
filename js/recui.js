// Recordings: the instant-replay controls and the library of saved clips.
import { h, mount } from './util.js';
import { icon, iconBtn, openSheet, switchEl, segmented, confirmDialog } from './ui.js';
import { MINUTES, canCaptureScreen, canRecordAudio } from './recorder.js';
import { listClips, deleteClip, putClip, clipBytes } from './clips.js';
import { joinWebm } from './webm.js';

const fmtDur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1000)) + ' KB');
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** One playable Blob for a clip: the parts joined into a single WebM when possible. Null if it needs part-by-part playback. */
export async function clipBlob(clip) {
  if (clip._blob) return clip._blob;
  if (clip.segs.length === 1) return (clip._blob = clip.segs[0].blob);
  if (!clip.mime.includes('webm')) return null;
  const joined = joinWebm(await Promise.all(clip.segs.map(async (s) => new Uint8Array(await s.blob.arrayBuffer()))));
  return joined ? (clip._blob = new Blob([joined], { type: clip.mime.split(';')[0] })) : null;
}

/** A small preview picture from the first seconds of a video clip. */
async function makeThumb(clip) {
  const url = URL.createObjectURL(clip.segs[0].blob);
  try {
    const v = h('video', { muted: true, playsinline: true, preload: 'auto' });
    v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 6000); });
    v.currentTime = 0.6;
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 1500); });
    const c = document.createElement('canvas');
    c.width = 168; c.height = Math.round((168 * v.videoHeight) / v.videoWidth) || 94;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

async function playClip(clip, toast) {
  const isVideo = clip.mime.startsWith('video/');
  const el = h(isVideo ? 'video' : 'audio', { controls: true, autoplay: true, playsinline: true, style: 'width:100%;max-height:60dvh;border-radius:16px;background:#000' });
  const note = h('div.muted', { style: 'font-size:12.5px' });
  const body = h('div.col', { style: 'gap:12px' }, h('h2', clip.name || 'Clip'), el, note);
  const urls = [];
  const sheet = openSheet(body, { onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)) });
  const blob = await clipBlob(clip).catch(() => null);
  if (blob) { const u = URL.createObjectURL(blob); urls.push(u); el.src = u; }
  else { // play the parts one after another
    let i = 0;
    const next = () => { if (i >= clip.segs.length) return; const u = URL.createObjectURL(clip.segs[i++].blob); urls.push(u); el.src = u; el.play().catch(() => {}); };
    el.addEventListener('ended', next);
    note.textContent = 'Plays in parts on this browser';
    next();
  }
}

export function openRecordings(rec, { toast }) {
  const body = h('div.col', { style: 'gap:14px' });
  let clips = [];
  const screenOk = canCaptureScreen();
  const paint = () => {
    const s = rec.settings, st = rec.active;
    const ctl = h('div.reccard' + (st ? '.live' : ''),
      h('div.row', { style: 'gap:10px' }, h('div.cic.rec', icon('fiber_manual_record')), h('div.grow', h('b', st ? `Recording · ${fmtDur(rec.buffered * 1000)} buffered` : 'Instant replay'), h('div.muted', { style: 'font-size:12.5px;line-height:1.35' }, st ? `Last ${s.minutes} min` : 'Save the last few minutes'))),
      rec.note ? h('div.warnbox', icon('info'), rec.note) : null,
      h('label.opt', 'How far back', segmented(MINUTES.map((m) => ({ value: m, label: m + ' min' })), s.minutes, (v) => rec.set({ minutes: v }))),
      h('div.pp-set', h('div', h('b', 'Screen video'), screenOk ? null : h('div.muted', { style: 'font-size:12.5px' }, 'Not supported here')), switchEl(s.video && screenOk, (v) => rec.set({ video: v }))),
      h('div.pp-set', h('b', 'Screen sound'), switchEl(s.screen, (v) => rec.set({ screen: v }))),
      h('div.pp-set', h('b', 'My microphone'), switchEl(s.mic, (v) => rec.set({ mic: v }))),
      h('div.pp-set', h('div', h('b', 'Taps & cursor'), h('div.muted', { style: 'font-size:12.5px' }, s.video && screenOk ? 'Show where you touch or point, so it appears in the video.' : 'Needs screen video.')), switchEl(s.taps, (v) => rec.set({ taps: v }))),
      !canRecordAudio() ? h('div.warnbox', icon('info'), 'This browser can’t record.') : null,
      h('div.row.wrap', { style: 'gap:8px;margin-top:4px' },
        st ? h('button.btn.primary.grow', { onclick: save }, icon('save_alt'), `Save last ${s.minutes} min`) : h('button.btn.primary.grow', { disabled: !canRecordAudio(), onclick: start }, icon('fiber_manual_record'), 'Start recording'),
        st ? h('button.btn.tonal', { onclick: () => rec.stop() }, icon('stop_circle'), 'Stop') : null));
    mount(body, h('h2', 'Recordings'), ctl,
      h('div.kt-title', `Saved clips · ${clips.length}`),
      clips.length ? h('div.clips', clips.map(card)) : h('div.muted', { style: 'text-align:center;padding:14px 0' }, 'Nothing saved yet.'));
  };
  async function start() { try { await rec.start(); toast('Recording is on — save any time', 'good'); } catch (e) { toast(e.message, 'bad'); } }
  async function save() {
    try {
      const { clip, stitched } = await rec.save();
      toast(stitched ? 'Stitched onto your earlier clip ✓' : 'Clip saved ✓', 'good');
      await load();
    } catch (e) { toast(e.message, 'bad'); }
  }
  const card = (c) => {
    const st = c.settings || {};
    return h('div.clip',
      h('button.cthumb', { onclick: () => playClip(c, toast), 'aria-label': 'Play' }, c.thumb ? h('img', { src: c.thumb, alt: '' }) : h('span', icon(c.mime.startsWith('video') ? 'movie' : 'volume_up')), h('span.play', icon('play_circle'))),
      h('div.grow', h('b', c.name || 'Clip · ' + when(c.start)), h('div.cmeta', h('span.chip', fmtDur(c.end - c.start)), h('span.chip', fmtSize(clipBytes(c))),
        st.video ? h('span.chip', icon('movie', 'sm')) : null, st.screen ? h('span.chip', icon('volume_up', 'sm')) : null, st.mic ? h('span.chip', icon('mic', 'sm')) : null, st.taps ? h('span.chip', icon('touch_app', 'sm')) : null)),
      iconBtn('download', 'Download', async () => {
        const blob = await clipBlob(c).catch(() => null);
        const ext = c.mime.includes('mp4') ? 'mp4' : 'webm';
        if (blob) download(blob, `game-night-${when(c.start).replace(/[^\w]+/g, '-')}.${ext}`);
        else c.segs.forEach((sg, i) => download(sg.blob, `game-night-part${i + 1}.${ext}`));
      }, 'sm'),
      iconBtn('edit', 'Rename', async () => { const n = prompt('Name this clip', c.name || ''); if (n !== null) { c.name = n.slice(0, 40); await putClip({ ...c, _blob: undefined }); load(); } }, 'sm'),
      iconBtn('delete', 'Delete', async () => { if (await confirmDialog('Delete this clip?', 'It only exists on this device.', { ok: 'Delete', danger: true })) { await deleteClip(c.id); load(); } }, 'sm'));
  };
  async function load() {
    try { clips = await listClips(); } catch { clips = []; }
    paint();
    for (const c of clips) { // give clips without a picture one (only the first time)
      if (c.thumb || !c.mime.startsWith('video/') || !c.segs.length) continue;
      const t = await makeThumb(c);
      if (t) { c.thumb = t; await putClip({ ...c, _blob: undefined }); if (body.isConnected) paint(); }
    }
  }
  const offs = [rec.on('state', paint), rec.on('buffer', () => { if (rec.active) paint(); })];
  load();
  const tick = setInterval(() => { if (rec.active && body.isConnected) paint(); }, 5000);
  return openSheet(body, { onClose: () => { offs.forEach((f) => f()); clearInterval(tick); } });
}
