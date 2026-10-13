// Pool physics, host side. Every ball carries a velocity AND an angular velocity, so the classic effects come out of the model
// instead of being faked: a ball first slides, its spin drags it into a roll, follow/draw/stun are just different amounts of
// starting spin, side spin ("english") grips the cushion and bends the rebound, and balls transfer a little spin when they
// meet ("throw"). Units are table pixels and seconds (the table is 1000 px long and a ball 27 px across — a touch larger than life, as the best mobile tables do, so it reads on a phone).
export const W = 1000, HT = 500, R = 13.5;
// Cushion geometry, shared with the renderer: T = cushion depth, GC / GM = half the opening at a corner / middle pocket
// (measured along the cushion nose), JC / JM = how far each jaw leans towards its pocket as it goes back into the rail.
export const CUSH = { T: 19, GC: 44, GM: 31, JC: 17, JM: 9 };
const { T, GC, GM, JC, JM } = CUSH;
export const POCKETS = [
  { x: -9, y: -9, r: 31 }, { x: W / 2, y: -17, r: 24 }, { x: W + 9, y: -9, r: 31 },
  { x: -9, y: HT + 9, r: 31 }, { x: W / 2, y: HT + 17, r: 24 }, { x: W + 9, y: HT + 9, r: 31 },
];
// The cushions as line segments: six noses plus the twelve angled jaws that form the pocket mouths.
export const SEGS = (() => {
  const s = [];
  for (const [y, d] of [[0, -1], [HT, 1]]) {
    s.push([GC, y, W / 2 - GM, y], [W / 2 + GM, y, W - GC, y]);
    s.push([GC, y, GC - JC, y + d * T], [W - GC, y, W - GC + JC, y + d * T]);
    s.push([W / 2 - GM, y, W / 2 - GM + JM, y + d * T], [W / 2 + GM, y, W / 2 + GM - JM, y + d * T]);
  }
  for (const [x, d] of [[0, -1], [W, 1]]) {
    s.push([x, GC, x, HT - GC]);
    s.push([x, GC, x + d * T, GC - JC], [x, HT - GC, x + d * T, HT - GC + JC]);
  }
  return s;
})();
export const MAXV = 1900;

const SLIDE = 700; // friction while the ball skids (px/s²)
const ROLL = 120, ROLL_V = 0.34; // rolling resistance: constant + proportional to speed
const MINV = 8; // below this a rolling ball stops
const E_BALL = 0.96, MU_BALL = 0.05; // ball-ball restitution and friction ("throw")
const MU_RAIL = 0.14;
const SPIN_DECAY = 1.4; // side spin fades

export const newBall = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, in: false });
export const isMoving = (b) => !b.in && (b.vx !== 0 || b.vy !== 0 || Math.abs(b.wx) > 0.05 || Math.abs(b.wy) > 0.05);

/** Hit the cue ball: aim angle a, power p (0..1), strike point sx (right of centre) / sy (above centre = follow, below = draw). */
export function strike(cue, a, p, sx = 0, sy = 0) {
  const v0 = p * MAXV, dx = Math.cos(a), dy = Math.sin(a);
  cue.vx = dx * v0; cue.vy = dy * v0;
  const k = (v0 / R) * 1.9 * sy; // top / back spin about the axis across the shot
  cue.wx = -dy * k; cue.wy = dx * k;
  cue.wz = -(v0 / R) * 1.3 * sx;
}

/**
 * Advance every ball by dt. `hit(kind, power, ball)` is told about collisions: 'b' (ball on ball), 'r' (rail), 'p' (pocket);
 * `onFirst(cueId, otherId)` fires the first time the cue ball touches anything.
 */
export function step(balls, dt, hit, onFirst, pocketed) {
  const alive = balls.filter((b) => !b.in);
  for (const b of alive) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx; // velocity of the point touching the cloth
    const us = Math.hypot(ux, uy);
    if (us > 3) { // sliding: friction drags the ball and its spin towards a pure roll
      const tEnd = us / (3.5 * SLIDE);
      const t = Math.min(dt, tEnd);
      const ex = ux / us, ey = uy / us;
      b.vx -= SLIDE * ex * t; b.vy -= SLIDE * ey * t;
      b.wx -= (2.5 * SLIDE / R) * ey * t; b.wy += (2.5 * SLIDE / R) * ex * t;
      if (t < dt) { b.wx = -b.vy / R; b.wy = b.vx / R; }
    } else { // rolling
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const ns = Math.max(0, sp - (ROLL + sp * ROLL_V) * dt);
        if (ns < MINV) { b.vx = b.vy = 0; b.wx = b.wy = 0; } else { b.vx *= ns / sp; b.vy *= ns / sp; b.wx = -b.vy / R; b.wy = b.vx / R; }
      } else { b.wx = b.wy = 0; }
    }
    if (b.wz) { b.wz -= b.wz * SPIN_DECAY * dt; if (Math.abs(b.wz) < 0.4) b.wz = 0; }
    if (b.vx === 0 && b.vy === 0 && b.wx === 0 && b.wy === 0) b.wz = 0;
  }
  // ball on ball
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 >= 4 * R * R || d2 < 1e-4) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const ov = (2 * R - d) / 2;
      a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; // closing speed
      if (vn <= 0) continue;
      const jn = ((1 + E_BALL) / 2) * vn;
      a.vx -= jn * nx; a.vy -= jn * ny; b.vx += jn * nx; b.vy += jn * ny;
      // friction between the two surfaces (spin about the vertical axis): a little "throw" and spin hand-over
      const tx = -ny, ty = nx;
      const slip = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty + R * (a.wz + b.wz);
      const jt = Math.max(-MU_BALL * jn, Math.min(MU_BALL * jn, slip / 7));
      a.vx -= jt * tx; a.vy -= jt * ty; b.vx += jt * tx; b.vy += jt * ty;
      a.wz -= (2.5 * jt) / R; b.wz -= (2.5 * jt) / R;
      if (vn > 30) hit?.('b', Math.min(1, vn / 900), a);
      if (onFirst && (a.id === 0 || b.id === 0)) onFirst(a.id === 0 ? b.id : a.id);
    }
  }
  // pockets and cushions
  for (const b of alive) {
    let into = -1;
    for (let k = 0; k < POCKETS.length; k++) if (Math.hypot(b.x - POCKETS[k].x, b.y - POCKETS[k].y) < POCKETS[k].r) { into = k; break; }
    // a ball that got behind the cushions is down a pocket whatever happens: drop it in the nearest one
    if (into < 0 && (b.x < -T || b.x > W + T || b.y < -T || b.y > HT + T)) into = POCKETS.reduce((bi, p, k) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(b.x - POCKETS[bi].x, b.y - POCKETS[bi].y) ? k : bi), 0);
    if (into >= 0) { b.in = true; b.vx = b.vy = b.wx = b.wy = b.wz = 0; pocketed?.(b, into); hit?.('p', 1, b); continue; }
    if (b.x > R + 1 && b.x < W - R - 1 && b.y > R + 1 && b.y < HT - R - 1) continue; // nowhere near a cushion
    for (const sg of SEGS) {
      const ax = sg[0], ay = sg[1], dx = sg[2] - ax, dy = sg[3] - ay;
      const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy)));
      const px = ax + dx * t, py = ay + dy * t, ox = b.x - px, oy = b.y - py, d2 = ox * ox + oy * oy;
      if (d2 >= R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      rail(b, ox / d, oy / d, hit, R - d);
    }
  }
}

/** Bounce off a cushion whose inward normal is (nx, ny). Side spin grips the rubber and kicks the ball along the cushion. */
function rail(b, nx, ny, hit, push) {
  b.x += nx * push; b.y += ny * push;
  const vn = b.vx * nx + b.vy * ny; // negative = moving into the cushion
  if (vn >= 0) return;
  const e = Math.max(0.55, 0.86 - 0.00007 * -vn);
  const jn = -(1 + e) * vn;
  const tx = -ny, ty = nx;
  const slip = b.vx * tx + b.vy * ty - R * b.wz;
  const jt = Math.max(-MU_RAIL * jn, Math.min(MU_RAIL * jn, slip / 3.5));
  b.vx += jn * nx - jt * tx; b.vy += jn * ny - jt * ty;
  b.wz += (2.5 * jt) / R;
  if (-vn > 35) hit?.('r', Math.min(1, -vn / 900), b);
}
