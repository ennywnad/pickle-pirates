// Pickle Pirates · Ball flight: gravity, air drag, spin lift, spin-aware bounces, the net and in/out calls
// Units are feet, seconds and radians. Spin (sx, sy, sz) is the ball's angular velocity in rad/s.
// Targets (see README): outdoor ball Cd ≈ 0.31, lift CL ≈ 0.195·S with S = Rω/v, rebound 30–34 in from a 78 in drop.
'use strict';
const MPH = 1.46667, RPM = Math.PI/30;               // mph -> ft/s, rpm -> rad/s
// ½ρA/m for a 26 g, 2.92 in ball at sea level, per foot of travel
const AERO = 0.5*1.21*Math.PI*0.0371*0.0371/0.026*0.3048;
const TAPE_R = 0.055;                                 // net cord radius
const POST_R = 0.14, POST_H = NET_H_SIDE + 0.25;
const SHELL_K = 2/3;                                  // I/(mR²) for a thin hollow ball

// one integration step. ev(name, ball, info) is told about 'bounce', 'net', 'tape' and 'post'. Returns the event name or null.
function ballStep(B, dt, ev){
  const py = B.y, pz = B.z;
  const v = hyp(B.vx, B.vy, B.vz);
  // drag opposes motion; lift is perpendicular to both spin axis and velocity: a = AERO·CL·v², CL = lift·Rω/v  ->  a = AERO·lift·R·(ω × v)
  const kd = AERO*TUNE.cd*v, kl = AERO*TUNE.lift*BALL_R;
  B.vx += (-kd*B.vx + kl*(B.sy*B.vz - B.sz*B.vy))*dt;
  B.vy += (-kd*B.vy + kl*(B.sz*B.vx - B.sx*B.vz))*dt;
  B.vz += (-kd*B.vz + kl*(B.sx*B.vy - B.sy*B.vx) - TUNE.gravity)*dt;
  B.x += B.vx*dt; B.y += B.vy*dt; B.z += B.vz*dt;
  const decay = Math.exp(-TUNE.spinDecay*dt); B.sx *= decay; B.sy *= decay; B.sz *= decay;
  let hit = null;
  if (!B.ghost) {   // ghost balls (used by the aim solvers) fly through the net
    if (B.x > -POST_OUT - 0.5 && B.x < CW + POST_OUT + 0.5) hit = netContact(B, py, pz, ev);
    if (!hit) hit = postContact(B, ev);
  }
  if (B.z < BALL_R && B.vz < 0) {
    if (-B.vz < 1.0) { B.z = BALL_R; B.vz = 0; ballRoll(B, dt); return hit; }   // settled: rolling, not bouncing
    courtBounce(B, ev); return 'bounce';
  }
  if (B.vz === 0 && B.z <= BALL_R + 1e-3) ballRoll(B, dt);
  return hit;
}
// the net: a cord along the top (the ball can roll over it) and the mesh below it, which stops the ball dead
function netContact(B, py, pz, ev){
  const top = netH(clamp(B.x, -POST_OUT, CW + POST_OUT)), inside = B.x >= -POST_OUT && B.x <= CW + POST_OUT;
  if (!inside) return null;
  // cord: a cylinder along x at (NETY, top)
  const dy = B.y - NETY, dz = B.z - top, d = hyp(dy, dz), R = BALL_R + TAPE_R;
  if (d < R) {
    const ny = d > 1e-6 ? dy/d : Math.sign(py - NETY) || 1, nz = d > 1e-6 ? dz/d : 0;
    const vn = B.vy*ny + B.vz*nz;
    if (vn < 0) {
      const e = TUNE.tape, ty = -nz, tz = ny, vt = B.vy*ty + B.vz*tz;
      const vt2 = vt*0.8, vn2 = -vn*e;
      B.vy = vn2*ny + vt2*ty; B.vz = vn2*nz + vt2*tz; B.vx *= 0.85;
      B.sx *= 0.4; B.sy *= 0.4; B.sz *= 0.4;
    }
    B.y = NETY + ny*R; B.z = top + nz*R;
    if (ev) ev('tape', B, Math.abs(vn)); return 'tape';
  }
  // mesh: crossing the net plane below the cord
  if ((py - NETY)*(B.y - NETY) < 0 || Math.abs(B.y - NETY) < BALL_R*0.9) {
    const crossZ = pz + (B.z - pz)*clamp((NETY - py)/((B.y - py) || 1e-9), 0, 1);
    if (crossZ < top) {
      const side = Math.sign(py - NETY) || 1;
      const vin = Math.abs(B.vy);
      B.y = NETY + side*(BALL_R + 0.02); B.vy = side*vin*0.12; B.vx *= 0.4; B.vz = Math.min(B.vz, 0)*0.3;
      B.sx = B.sy = B.sz = 0;
      if (ev) ev('net', B, vin); return 'net';
    }
  }
  return null;
}
function postContact(B, ev){
  if (B.z > POST_H + BALL_R) return null;
  for (const px of [-POST_OUT, CW + POST_OUT]) {
    const dx = B.x - px, dy = B.y - NETY, d = hyp(dx, dy), R = BALL_R + POST_R;
    if (d < R && d > 1e-6) {
      const nx = dx/d, ny = dy/d, vn = B.vx*nx + B.vy*ny;
      if (vn < 0) { B.vx -= 1.5*vn*nx; B.vy -= 1.5*vn*ny; }
      B.x = px + nx*R; B.y = NETY + ny*R;
      if (ev) ev('post', B, Math.abs(vn)); return 'post';
    }
  }
  return null;
}
// court bounce with friction: the contact point either grips (the ball leaves rolling) or slides.
// Topspin grabs and kicks forward; backspin checks up.
function courtBounce(B, ev){
  B.z = BALL_R;
  const vin = -B.vz;
  B.vz = vin*TUNE.bounce;
  if (B.vz < 0.8) B.vz = 0;
  // contact-point velocity u = v + ω × r, r = (0, 0, -R)
  const R = BALL_R, ux = B.vx - R*B.sy, uy = B.vy + R*B.sx, u = hyp(ux, uy);
  const need = u/(1 + 1/SHELL_K), cap = TUNE.grip*(1 + TUNE.bounce)*vin;   // impulse per mass to stop the slip vs friction limit
  let dx = 0, dy = 0;
  if (u > 1e-6) { const j = Math.min(need, cap); dx = -ux/u*j; dy = -uy/u*j; }
  B.vx += dx; B.vy += dy;
  B.sx += dy/(SHELL_K*R); B.sy += -dx/(SHELL_K*R);
  B.sz *= 0.7;
  if (ev) ev('bounce', B, vin);
}
// rolling: when the ball is down and not bouncing it rolls to a stop
function ballRoll(B, dt){
  const k = Math.exp(-1.2*dt); B.vx *= k; B.vy *= k;
  B.sx = -B.vy/BALL_R; B.sy = B.vx/BALL_R;
}

// line calls: lines are in. The contact patch counts, so allow a sliver past the outside edge.
const LINE_GRACE = 0.02;
const landedIn = (x, y) => inCourt(x, y, LINE_GRACE);
const lineMargin = (x, y) => Math.min(x, CW - x, y, CL - y);   // negative = out, by that many feet

// copy of the parts of the ball the simulation needs
const ballCopy = B => ({ x:B.x, y:B.y, z:B.z, vx:B.vx, vy:B.vy, vz:B.vz, sx:B.sx, sy:B.sy, sz:B.sz });
// simulate forward; returns samples (every `every` steps), the first bounce, and whether the net stopped it
function predict(B, T = 3, dt = 1/120, every = 4){
  const b = ballCopy(B), pts = []; let first = null, netted = false, apex = b.z, netZ = null;
  for (let i = 0, n = Math.round(T/dt); i < n; i++) {
    const py = b.y;
    const e = ballStep(b, dt);
    if (netZ === null && (py - NETY)*(b.y - NETY) <= 0 && py !== b.y) netZ = b.z;
    if (!first) apex = Math.max(apex, b.z);
    if (e === 'bounce' && !first) first = { x:b.x, y:b.y, t:(i + 1)*dt, vh:hyp(b.vx, b.vy) };
    if (e === 'net') { netted = true; break; }
    if (i % every === 0) pts.push({ x:b.x, y:b.y, z:b.z, vz:b.vz, t:i*dt, bounced:!!first });
    if (first && every >= 1000) break;
    if (b.z <= BALL_R && b.vz === 0) break;
  }
  return { pts, first, netted, apex, netZ };
}

// ---------------- launch solvers (shared by the ball cannon and the shot model)
// spin: + topspin, − backspin, in rad/s about the axis that makes it topspin for this direction of travel
function spinVec(dx, dy, spin){ const d = hyp(dx, dy) || 1; return { sx:-dy/d*spin, sy:dx/d*spin, sz:0 }; }
// land at (tx, ty) after rising to `apex` feet; corrects for drag and lift by re-simulating
function aimByApex(from, tx, ty, apex, spin = 0){
  const g = TUNE.gravity, z0 = from.z;
  apex = Math.max(apex, z0 + 0.3);
  const up = Math.sqrt(2*g*(apex - z0)), T = up/g + Math.sqrt(2*apex/g);
  const dx = tx - from.x, dy = ty - from.y, sv = spinVec(dx, dy, spin);
  let v = { vx:dx/T, vy:dy/T, vz:up };
  const dist = hyp(dx, dy) || 1, ux = dx/dist, uy = dy/dist;
  for (let it = 0; it < 6; it++) {
    const land = landingOf({ ...from, ...v, ...sv });
    if (!land) break;
    const rx = land.x - from.x, ry = land.y - from.y, along = rx*ux + ry*uy, across = -rx*uy + ry*ux;
    if (Math.abs(along - dist) < 0.05 && Math.abs(across) < 0.05) break;
    // scale the horizontal speed along the shot, take out the sideways drift
    const kf = clamp(dist/(along || 0.1), 0.6, 1.8), va = (v.vx*ux + v.vy*uy)*kf, vc = (-v.vx*uy + v.vy*ux) - across/T;
    v.vx = va*ux - vc*uy; v.vy = va*uy + vc*ux;
  }
  return { ...v, ...sv };
}
// launch at `speed` (ft/s) and find the low elevation that lands at (tx, ty). Returns null if that speed can't get there.
function aimBySpeed(from, tx, ty, speed, spin = 0){
  const dx = tx - from.x, dy = ty - from.y, dist = hyp(dx, dy), sv = spinVec(dx, dy, spin);
  const mk = (a, yaw) => { const c = Math.cos(a); return { vx:speed*c*Math.cos(yaw), vy:speed*c*Math.sin(yaw), vz:speed*Math.sin(a) }; };
  let yaw = Math.atan2(dy, dx), lo = -0.45, hi = 0.75, best = null;
  const reach = a => { const l = landingOf({ ...from, ...mk(a, yaw), ...sv }); return l ? hyp(l.x - from.x, l.y - from.y) : 0; };
  if (reach(hi) < dist) return null;
  for (let i = 0; i < 22; i++) { const m = (lo + hi)/2; if (reach(m) < dist) lo = m; else hi = m; }
  best = (lo + hi)/2;
  // aim correction for sideways drift (lift isn't purely vertical once the ball is angled); small by nature, so clamp it
  const l = landingOf({ ...from, ...mk(best, yaw), ...sv });
  if (!l || Math.abs(hyp(l.x - from.x, l.y - from.y) - dist) > 1.5) return null;   // the net is in the way at this speed
  let ang = Math.atan2(l.y - from.y, l.x - from.x) - Math.atan2(dy, dx); while (ang > Math.PI) ang -= 2*Math.PI; while (ang < -Math.PI) ang += 2*Math.PI; yaw -= clamp(ang, -0.15, 0.15);
  return { ...mk(best, yaw), ...sv };
}
// pass over the net at `clearZ` feet and land at (tx, ty): the shape of dinks and drops.
// Nested bisection: for each elevation find the speed that lands at the target (net ignored), then pick the elevation whose arc crosses the net at clearZ.
function aimThrough(from, tx, ty, clearZ, spin = 0){
  const dx = tx - from.x, dy = ty - from.y, D = hyp(dx, dy) || 1, ux = dx/D, uy = dy/D, sv = spinVec(dx, dy, spin);
  const fly = (a, sp) => { const c = Math.cos(a), b = { ...from, vx:ux*sp*c, vy:uy*sp*c, vz:sp*Math.sin(a), ...sv, ghost:true }; let netZ = null;
    for (let i = 0; i < 500; i++) { const py = b.y, e = ballStep(b, 1/120); if (netZ === null && (py - NETY)*(b.y - NETY) <= 0) netZ = b.z; if (e === 'bounce') return { s:(b.x - from.x)*ux + (b.y - from.y)*uy, netZ: netZ ?? b.z }; }
    return { s:1e3, netZ: netZ ?? 0 }; };
  const speedFor = a => { let lo = 3, hi = 140; for (let i = 0; i < 16; i++) { const m = (lo + hi)/2; if (fly(a, m).s < D) lo = m; else hi = m; } return (lo + hi)/2; };
  let alo = -0.2, ahi = 1.25, a = 0.4, sp = speedFor(a);
  for (let i = 0; i < 14; i++) { a = (alo + ahi)/2; sp = speedFor(a); if (fly(a, sp).netZ < clearZ) alo = a; else ahi = a; }
  const c = Math.cos(a);
  return { vx:ux*sp*c, vy:uy*sp*c, vz:sp*Math.sin(a), ...sv };
}
function landingOf(b){
  b = { ...b };
  for (let i = 0; i < 720; i++) { const e = ballStep(b, 1/240); if (e === 'bounce') return b; if (e === 'net' || e === 'tape' || e === 'post') return null; }   // aim for clean flights only: a tape clip lands anywhere
  return null;
}
// net height where the line from `from` to the target crosses it
function netAt(from, tx, ty){ const f = clamp((NETY - from.y)/((ty - from.y) || 1e-9), 0, 1); return netH(clamp(from.x + (tx - from.x)*f, 0, CW)); }
// the shapes every shot and feed is built from. Returns velocity + spin for the ball at `from`.
function launchFor(kind, from, tx, ty, opt = {}){
  const sp = opt.speedK || 1, spin = opt.spin;
  switch (kind) {
    case 'serve': return aimBySpeed(from, tx, ty, TUNE.serveSpeed*MPH*sp, spin ?? 300*RPM) || aimByApex(from, tx, ty, 8, 0);
    case 'drive': {
      for (let k = 1; k > 0.5; k -= 0.08) {   // too hard to keep in? take a little off until it lands and clears the net
        const v = aimBySpeed(from, tx, ty, TUNE.driveSpeed*MPH*sp*k, spin ?? TUNE.driveSpin*RPM);
        if (v) { const pr = predict({ ...from, ...v }, 2.5, 1/120, 1000); if (!pr.netted && pr.first) return v; }
      }
      return aimByApex(from, tx, ty, netH(from.x) + 1.5, spin ?? TUNE.driveSpin*RPM*0.5);
    }
    case 'dink': return aimThrough(from, tx, ty, netAt(from, tx, ty) + TUNE.dinkClear*(opt.arcK || 1), spin ?? 0);
    case 'drop': return aimThrough(from, tx, ty, netAt(from, tx, ty) + TUNE.dropClear*(opt.arcK || 1), spin ?? 150*RPM);
    case 'lob':  return aimByApex(from, tx, ty, TUNE.lobApex*(opt.arcK || 1), spin ?? 400*RPM);
  }
  return aimByApex(from, tx, ty, 6, 0);
}
