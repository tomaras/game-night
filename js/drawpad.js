// A self-contained drawing pad (pen / fill / eraser / undo / clear) used by the drawing party games.
// Drawings leave the pad as small JPEG data-URLs (toDataURL) so they can be sent through the host.
import { h, canvasPoint, clamp } from './util.js';
import { icon } from './ui.js';

export const PAD_COLORS = ['#202124', '#5f6368', '#ffffff', '#bdc1c6', '#ea4335', '#f57c00', '#fbbc04', '#34a853', '#0f9d58', '#12b5cb', '#1a73e8', '#8e4de8', '#e5399b', '#a0522d', '#ffb6a0', '#3a2a12'];
const SIZES = [4, 10, 20, 38];

const CSS = `
.dp { display:flex; flex-direction:column; gap:10px; width:100%; }
.dp-wrap { position:relative; width:100%; background:#fff; border-radius:22px; box-shadow:var(--e2); overflow:hidden; aspect-ratio:var(--ar, 4/3); touch-action:none; }
.dp-wrap canvas { width:100%; height:100%; display:block; touch-action:none; cursor:crosshair; }
.dp-wrap.locked canvas { cursor:default; }
.dp-tools { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:8px 10px; }
.dp-tools .grp { display:flex; gap:4px; align-items:center; }
.dp-colors { display:grid; grid-template-columns:repeat(8, 28px); gap:5px; }
.dp-sw { width:28px; height:28px; border-radius:50%; border:2px solid rgba(0,0,0,.14); padding:0; cursor:pointer; }
.dp-sw.on { border-color:#fff; transform:scale(1.15); box-shadow:0 0 0 3px var(--blue); }
.dp-sz { width:38px; height:38px; border-radius:12px; border:0; background:var(--s2); display:grid; place-items:center; cursor:pointer; padding:0; }
.dp-sz.on { background:var(--blue-c); }
.dp-sz i { display:block; border-radius:50%; background:var(--on); }
.dp-tool { width:40px; height:40px; border-radius:12px; border:0; background:var(--s2); display:grid; place-items:center; cursor:pointer; color:var(--on2); padding:0; }
.dp-tool.on { background:var(--blue-c); color:var(--blue-d); }
@media (max-width: 520px) { .dp-colors { grid-template-columns:repeat(8, 1fr); width:100%; } .dp-sw { width:100%; aspect-ratio:1; height:auto; } }
`;
let styled = false;

function floodFill(ctx, sx, sy, hex) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x0 = clamp(Math.round(sx), 0, W - 1), y0 = clamp(Math.round(sy), 0, H - 1);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const i0 = (y0 * W + x0) * 4;
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  if (Math.abs(tr - r) + Math.abs(tg - g) + Math.abs(tb - b) < 6) return;
  const ok = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) < 70;
  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    let xl = x;
    while (xl >= 0 && ok((y * W + xl) * 4)) xl--;
    xl++;
    let up = false, down = false;
    for (let xx = xl; xx < W && ok((y * W + xx) * 4); xx++) {
      const i = (y * W + xx) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      if (y > 0) { const o = ok(((y - 1) * W + xx) * 4); if (o && !up) { stack.push(xx, y - 1); up = true; } else if (!o) up = false; }
      if (y < H - 1) { const o = ok(((y + 1) * W + xx) * 4); if (o && !down) { stack.push(xx, y + 1); down = true; } else if (!o) down = false; }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function createDrawPad({ w = 560, h: hh = 420, bg = '#ffffff', colors = PAD_COLORS, onChange } = {}) {
  if (!styled) { document.head.append(h('style', { id: 'dp-style' }, CSS)); styled = true; }
  const canvas = h('canvas', { width: w, height: hh });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const wrap = h('div.dp-wrap', { style: { '--ar': `${w} / ${hh}` } }, canvas);
  let ops = [], color = colors[0], size = SIZES[1], tool = 'pen', locked = false, drawing = false;

  const clearCv = () => { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hh); };
  const seg = (c, sz, x1, y1, x2, y2) => {
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = sz; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (x1 === x2 && y1 === y2) { ctx.beginPath(); ctx.arc(x1, y1, sz / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  const drawStroke = (op) => { const p = op.p; if (p.length === 2) seg(op.c, op.w, p[0], p[1], p[0], p[1]); for (let i = 2; i < p.length; i += 2) seg(op.c, op.w, p[i - 2], p[i - 1], p[i], p[i + 1]); };
  const redraw = () => { clearCv(); for (const op of ops) { if (op.k === 's') drawStroke(op); else if (op.k === 'f') floodFill(ctx, op.x, op.y, op.c); } };
  clearCv();

  canvas.addEventListener('pointerdown', (e) => {
    if (locked) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPoint(canvas, e);
    const x = Math.round(p.x), y = Math.round(p.y);
    if (tool === 'fill') { ops.push({ k: 'f', x, y, c: color }); floodFill(ctx, x, y, color); onChange?.(); return; }
    drawing = true;
    const op = { k: 's', c: tool === 'eraser' ? bg : color, w: tool === 'eraser' ? Math.max(size, 16) : size, p: [x, y] };
    ops.push(op);
    drawStroke(op);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const o = ops[ops.length - 1];
    for (const ev of evs.length ? evs : [e]) {
      const p = canvasPoint(canvas, ev);
      const x = Math.round(p.x), y = Math.round(p.y);
      const lx = o.p[o.p.length - 2], ly = o.p[o.p.length - 1];
      if (Math.abs(x - lx) + Math.abs(y - ly) < 2) continue;
      seg(o.c, o.w, lx, ly, x, y);
      o.p.push(x, y);
    }
  });
  const end = () => { if (drawing) { drawing = false; onChange?.(); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const tools = h('div.dp-tools');
  const render = () => {
    tools.replaceChildren(
      h('div.grp', [['pen', 'brush'], ['fill', 'format_color_fill'], ['eraser', 'eraser']].map(([t, ic]) => h('button.dp-tool' + (tool === t ? '.on' : ''), { title: t, 'aria-label': t, onclick: () => { tool = t; render(); } }, icon(ic)))),
      h('div.grp', SIZES.map((s) => h('button.dp-sz' + (s === size ? '.on' : ''), { 'aria-label': 'brush size ' + s, onclick: () => { size = s; render(); } }, h('i', { style: { width: Math.max(5, s / 2 + 3) + 'px', height: Math.max(5, s / 2 + 3) + 'px' } })))),
      h('div.grp', [
        h('button.dp-tool', { title: 'Undo', 'aria-label': 'Undo', onclick: () => { ops.pop(); redraw(); onChange?.(); } }, icon('undo')),
        h('button.dp-tool', { title: 'Clear', 'aria-label': 'Clear', onclick: () => { ops = []; redraw(); onChange?.(); } }, icon('delete')),
      ]),
      h('div.dp-colors', colors.map((c) => h('button.dp-sw' + (c === color && tool !== 'eraser' ? '.on' : ''), { style: { background: c }, 'aria-label': c, onclick: () => { color = c; if (tool === 'eraser') tool = 'pen'; render(); } })))
    );
  };
  render();

  return {
    el: h('div.dp', wrap, tools),
    canvas, ctx,
    isBlank: () => ops.length === 0,
    clear() { ops = []; clearCv(); },
    setLocked(b) { locked = b; wrap.classList.toggle('locked', b); tools.style.display = b ? 'none' : ''; },
    /** Small JPEG data-URL of the drawing (max width `maxW`). */
    toDataURL(maxW = 420, q = 0.6) {
      const s = Math.min(1, maxW / w);
      const t = document.createElement('canvas');
      t.width = Math.round(w * s); t.height = Math.round(hh * s);
      t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
      return t.toDataURL('image/jpeg', q);
    },
  };
}
