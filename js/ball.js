// Pickle Pirates · Ball flight: gravity, air drag, spin, bounces, the net and in/out calls
// Placeholder physics for the skeleton; milestone 2 tunes it against a real pickleball.
'use strict';
// one integration step. Returns an event when something happens: 'bounce', 'net' or null.
function ballStep(B, dt, ev){
  const px = B.x, py = B.y, pz = B.z;
  const sp = hyp(B.vx, B.vy, B.vz), k = TUNE.drag*sp, m = TUNE.magnus;
  // drag + magnus (spin × velocity); spin decays slowly in flight
  const ax = -k*B.vx + m*(B.sy*B.vz - B.sz*B.vy);
  const ay = -k*B.vy + m*(B.sz*B.vx - B.sx*B.vz);
  const az = -k*B.vz + m*(B.sx*B.vy - B.sy*B.vx) - TUNE.gravity;
  B.vx += ax*dt; B.vy += ay*dt; B.vz += az*dt;
  B.x += B.vx*dt; B.y += B.vy*dt; B.z += B.vz*dt;
  const decay = Math.exp(-0.25*dt); B.sx *= decay; B.sy *= decay; B.sz *= decay;
  // net: a sagging plane at y = NETY between the posts
  if ((py - NETY)*(B.y - NETY) < 0 && B.x > -POST_OUT && B.x < CW + POST_OUT) {
    const f = (NETY - py)/(B.y - py), zx = pz + (B.z - pz)*f, xx = px + (B.x - px)*f, h = netH(xx);
    if (zx < h - BALL_R*0.3) {
      B.y = NETY + Math.sign(py - NETY)*(BALL_R + 0.05); B.vy *= -0.18; B.vx *= 0.5; B.vz = Math.min(B.vz, 0)*0.4; B.sx = B.sy = B.sz = 0;
      if (ev) ev('net', B); return 'net';
    } else if (zx < h + BALL_R) { B.vz += 2.5; B.vy *= 0.8; if (ev) ev('cord', B); }   // clips the tape and pops over
  }
  // court bounce
  if (B.z < BALL_R && B.vz < 0) {
    B.z = BALL_R;
    const vin = -B.vz;
    B.vz = vin*TUNE.bounce;
    if (B.vz < 1.2) B.vz = 0;
    const skid = TUNE.skid;
    // topspin (rotation about +x carrying the ball toward -y for a home hitter) kicks forward; slice holds up
    B.vx = B.vx*skid + B.sy*0.03; B.vy = B.vy*skid - B.sx*0.03;
    B.sx *= 0.5; B.sy *= 0.5;
    if (ev) ev('bounce', B, vin); return 'bounce';
  }
  return null;
}
// copy of the parts of the ball the simulation needs
const ballCopy = B => ({ x:B.x, y:B.y, z:B.z, vx:B.vx, vy:B.vy, vz:B.vz, sx:B.sx, sy:B.sy, sz:B.sz });
// simulate forward and return the samples (every `every` steps) plus the first bounce point
function predict(B, T = 3, dt = 1/120, every = 4){
  const b = ballCopy(B), pts = []; let first = null;
  for (let i = 0, n = Math.round(T/dt); i < n; i++) {
    const e = ballStep(b, dt);
    if (e === 'bounce' && !first) first = { x:b.x, y:b.y, t:i*dt };
    if (e === 'net') break;
    if (i % every === 0) pts.push({ x:b.x, y:b.y, z:b.z, vz:b.vz, t:i*dt, bounced:!!first });
    if (b.z <= BALL_R && b.vz === 0) break;
  }
  return { pts, first };
}
// launch velocity that lands the ball at (tx, ty) after rising to roughly `apex` feet; corrects for drag by re-simulating
function aimShot(from, tx, ty, apex, spin = 0){
  const g = TUNE.gravity, z0 = from.z;
  apex = Math.max(apex, z0 + 0.3);
  const up = Math.sqrt(2*g*(apex - z0)), tUp = up/g, tDown = Math.sqrt(2*apex/g), T = tUp + tDown;
  let dx = tx - from.x, dy = ty - from.y;
  let v = { vx:dx/T, vy:dy/T, vz:up };
  const dir = Math.sign(dy) || 1;
  for (let it = 0; it < 4; it++) {
    const b = { x:from.x, y:from.y, z:z0, ...v, sx:-spin*dir, sy:0, sz:0 };
    let land = null;
    for (let i = 0; i < 600; i++) { if (ballStep(b, 1/120) === 'bounce') { land = b; break; } }
    if (!land) break;
    const ax = land.x - from.x, ay = land.y - from.y, want = hyp(dx, dy), got = hyp(ax, ay);
    if (got < 0.1) break;
    const kf = clamp(want/got, 0.7, 1.6);
    v.vx *= kf; v.vy *= kf;
    v.vx += (tx - land.x)/T*0.3;
  }
  return { ...v, sx:-spin*dir, sy:0, sz:0 };   // positive spin = topspin for either side
}
