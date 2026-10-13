// Canvas effects for the arcade games: particles, shockwave rings, floating text, screen shake and flashes.
// Usage:  const fx = new Fx();  fx.burst(x, y, { color });  fx.shake(8);
//   each frame:  fx.update(dt); ctx.save(); fx.begin(ctx); ...draw the world...; fx.draw(ctx); ctx.restore(); fx.overlay(ctx, w, h);
export class Fx {
  constructor() { this.parts = []; this.rings = []; this.texts = []; this.shakeAmp = 0; this.shakeLeft = 0; this.shakeDur = 1; this.flashA = 0; this.flashColor = '#fff'; }
  burst(x, y, { n = 14, color = '#fff', colors, speed = 220, life = 0.55, size = 3.2, gravity = 0, angle = 0, spread = Math.PI * 2, drag = 2.2, glow = true } = {}) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.35 + Math.random() * 0.75);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), age: 0, size: size * (0.6 + Math.random() * 0.9), color: colors ? colors[i % colors.length] : color, g: gravity, drag, glow });
    }
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
  }
  ring(x, y, { r = 46, color = '#fff', life = 0.4, width = 3 } = {}) { this.rings.push({ x, y, r, color, life, age: 0, width }); }
  text(x, y, str, { color = '#fff', size = 18, life = 0.9, rise = 44 } = {}) { this.texts.push({ x, y, str, color, size, life, age: 0, rise }); }
  shake(amp = 8, dur = 0.25) { if (amp >= this.shakeAmp * (this.shakeLeft / this.shakeDur)) { this.shakeAmp = amp; this.shakeLeft = dur; this.shakeDur = dur; } }
  flash(color = '#fff', a = 0.35) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  update(dt) {
    for (const p of this.parts) { p.age += dt; p.vy += p.g * dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dt; this.rings = this.rings.filter((r) => r.age < r.life);
    for (const t of this.texts) t.age += dt; this.texts = this.texts.filter((t) => t.age < t.life);
    if (this.shakeLeft > 0) this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    this.flashA = Math.max(0, this.flashA - dt * 1.8);
  }
  /** Current shake as an {x, y} pixel offset (for canvases that are moved with CSS instead of ctx.translate). */
  offset() { if (this.shakeLeft <= 0) return { x: 0, y: 0 }; const k = this.shakeAmp * (this.shakeLeft / this.shakeDur); return { x: (Math.random() - 0.5) * 2 * k, y: (Math.random() - 0.5) * 2 * k }; }
  /** Call after ctx.save(): moves the world by the current shake. */
  begin(ctx) {
    if (this.shakeLeft > 0) { const k = this.shakeAmp * (this.shakeLeft / this.shakeDur); ctx.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k); }
  }
  draw(ctx) {
    ctx.save();
    for (const p of this.parts) {
      const t = p.age / p.life;
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      ctx.fillStyle = p.color;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const r of this.rings) {
      const t = r.age / r.life, e = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = (1 - t) * 0.9; ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - t * 0.7);
      ctx.beginPath(); ctx.arc(r.x, r.y, 6 + r.r * e, 0, 7); ctx.stroke();
    }
    for (const tx of this.texts) {
      const t = tx.age / tx.life, e = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.fillStyle = tx.color; ctx.font = `900 ${tx.size * (0.8 + 0.3 * Math.min(1, t * 6))}px sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(tx.str, tx.x, tx.y - tx.rise * e); ctx.fillText(tx.str, tx.x, tx.y - tx.rise * e);
    }
    ctx.restore();
  }
  /** After ctx.restore(): a full-canvas flash. */
  overlay(ctx, w, h) { if (this.flashA > 0.01) { ctx.save(); ctx.globalAlpha = this.flashA; ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, w, h); ctx.restore(); } }
}
