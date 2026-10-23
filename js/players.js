// Pickle Pirates · Footwork: running, the split step, lunges, the move-to-ball assist, and the stand-in CPU
// The real CPU (positioning, shot choice, difficulty tiers) arrives with milestone 5 in js/ai.js.
'use strict';
const BOUNDS = { near:{ y0:NETY + 0.6, y1:CL + 8 }, far:{ y0:-8, y1:NETY - 0.6 } };
function movePlayer(pl, ix, iy, dt){
  for (const k of ['split', 'burst', 'lunge']) if (pl[k] > 0) pl[k] = Math.max(0, pl[k] - dt);
  // a split step lands into a quick first step; a lunge has to recover before you can run again
  const top = TUNE.runSpeed*(pl.lunge > 0 ? 0.35 : 1), acc = TUNE.runAccel*(pl.burst > 0 && pl.split <= 0 ? 1.8 : 1)*(pl.split > 0 ? 0.3 : 1);
  const tvx = ix*top, tvy = iy*top, a = acc*dt;
  const dvx = tvx - pl.vx, dvy = tvy - pl.vy, dm = hyp(dvx, dvy);
  if (dm > a) { pl.vx += dvx/dm*a; pl.vy += dvy/dm*a; } else { pl.vx = tvx; pl.vy = tvy; }
  pl.x = clamp(pl.x + pl.vx*dt, -6, CW + 6);
  const b = BOUNDS[isNear(pl.team) ? 'near' : 'far']; pl.y = clamp(pl.y + pl.vy*dt, b.y0, b.y1);
  if (pl.y === b.y0 || pl.y === b.y1) pl.vy = 0;
  if (hyp(pl.vx, pl.vy) > 2 && pl.swing <= 0) pl.face = Math.atan2(pl.vy, pl.vx);
  else if (pl.swing <= 0 && hyp(pl.vx, pl.vy) < 1) pl.face += (Math.atan2(NETY - pl.y, 0) - pl.face)*Math.min(1, dt*4);   // ready position: face the net
}
// how long to cover d feet from a standstill: accelerate to top speed, then run
function runTime(pl, d){
  if (d <= 0) return 0;
  const v = TUNE.runSpeed, a = TUNE.runAccel, da = v*v/(2*a);
  return d <= da ? Math.sqrt(2*d/a) : v/a + (d - da)/v;
}
// where to stand to take the incoming ball: the earliest point on its path that's at a good height, follows the
// two-bounce rule, and that the player can get to in time. Returns { x, y (body), bx, by, bz (ball), t } or null.
function contactSpot(pl, B){
  const pr = predict(B, 2.6, 1/120, 3), hand = handOf(pl), back = backDir(pl.team);
  let fallback = null;
  for (const p of pr.pts) {
    if (sideOf(p.y) !== pl.team) continue;
    const bounced = B.bounces > 0 || p.bounced;
    if (!bounced && mustBounce()) continue;
    if (p.z < 0.5 || p.z > 6) continue;
    // stand a little to the side of the ball (forehand) and a touch behind it
    const sx = p.x - hand*1.5, sy = p.y + back*0.5;
    if (!bounced && G.cfg.kitchen !== false && inKitchenZone(sx, sy)) continue;   // never plan a volley from the kitchen
    const reachT = runTime(pl, hyp(sx - pl.x, sy - pl.y) - 0.3) + 0.08;
    const good = p.z >= 1.1 && p.z <= 4.2;
    const spot = { x:clamp(sx, -5, CW + 5), y:sy, bx:p.x, by:p.y, bz:p.z, t:p.t };
    if (good && reachT <= p.t) return spot;
    if (!fallback && reachT <= p.t + 0.25) fallback = spot;
  }
  return fallback;
}
// the human: stick movement, blended with the move-to-ball assist unless Plant is held
function humanMove(pl, dt){
  let [ix, iy] = readInput(0);
  const plant = actionHeld(0, 'plant'), B = G.ball;
  if (plant) { ix = 0; iy = 0; }
  else if (TUNE.assist > 0 && ballFor(pl, B)) {
    pl.spotT -= dt;
    if (pl.spotT <= 0 || !pl.spot) { pl.spotT = 0.1; pl.spot = contactSpot(pl, B); }
    const sp = pl.spot;
    if (sp) {
      const dx = sp.x - pl.x, dy = sp.y - pl.y, d = hyp(dx, dy);
      if (d > 0.3) {
        const own = hyp(ix, iy), k = TUNE.assist*(own > 0.2 ? 0.5 : 1)*Math.min(1, d/1.5);
        ix += dx/d*k; iy += dy/d*k;
        const m = hyp(ix, iy); if (m > 1) { ix /= m; iy /= m; }
      }
    }
  } else {
    pl.spot = null;
    // between shots: with the stick centered, drift back to a ready spot (kitchen line if you're up, else the baseline)
    if (!plant && TUNE.assist > 0 && hyp(ix, iy) < 0.15) {
      // between points the receiver waits at the baseline (serves and returns must bounce); mid-rally, hold the kitchen line if you're up
      const up = B.live && !!B.lastBy && G.hits >= 3 && Math.abs(pl.y - NETY) <= KD + 3, rx = CW/2 + (B.live ? (B.x - CW/2)*0.25 : 0), ry = isNear(pl.team) ? (up ? NETY + KD + 0.6 : CL - 1.2) : (up ? NETY - KD - 0.6 : 1.2);
      const dx = rx - pl.x, dy = ry - pl.y, d = hyp(dx, dy);
      if (d > 0.6) { const k = TUNE.assist*0.7*Math.min(1, d/3); ix = dx/d*k; iy = dy/d*k; }
    }
  }
  movePlayer(pl, ix, iy, dt);
}
// the stand-in CPU: runs to the contact spot, presses a shot at a slightly random moment, recovers toward the middle
function cpuPlayer(pl, dt){
  const B = G.ball, ai = pl.ai, back = backDir(pl.team);
  if (G.cfg.opp === 'none' && !pl.human && pl.team === 'away') {   // cannon only: the stand-in leans on the far post and watches
    const dx = -3.2 - pl.x, dy = NETY + backDir(pl.team)*3 - pl.y, d = hyp(dx, dy);
    movePlayer(pl, d > 0.3 ? dx/d : 0, d > 0.3 ? dy/d : 0, dt);
    if (d < 0.5) pl.face = Math.atan2(B.y - pl.y, B.x - pl.x);
    return;
  }
  ai.think -= dt;
  const incoming = ballFor(pl, B);
  if (ai.think <= 0) {
    ai.think = 0.1;
    if (incoming) { pl.spot = contactSpot(pl, B); pl.spotAt = G.time; if (pl.spot) { ai.tx = pl.spot.x; ai.ty = pl.spot.y; } }
    else { pl.spot = null; ai.tx = CW/2 + (B.live ? (B.x - CW/2)*0.3 : 0); ai.ty = baseY(pl.team) - back*3; }
  }
  const dx = ai.tx - pl.x, dy = ai.ty - pl.y, d = hyp(dx, dy);
  const k = d > 0.3 ? Math.min(1, d/1.5) : 0;
  movePlayer(pl, d ? dx/d*k : 0, d ? dy/d*k : 0, dt);
  // press a shot a little before the ball arrives; how close to the sweet spot depends on skill
  if (incoming && !pl.queue && pl.spot) {
    if (ai.rollFor !== G.shotN) { ai.rollFor = G.shotN; const sk = G.cpuSkill; ai.pressAt = Math.random() < 0.06*(1.5 - sk) ? -1 : clamp(rand(0.12, 0.45) + gauss()*0.25*(1 - sk), 0.02, 1.0); }
    if (ai.pressAt > 0 && pl.spot.t - (G.time - pl.spotAt) <= ai.pressAt) {
      const fromNet = Math.abs(pl.y - NETY), r = Math.random();
      const kind = pl.spot.bz > 5 && fromNet < 16 ? 'drive' : fromNet <= KD + 3 ? (r < 0.65 ? 'soft' : r < 0.9 ? 'drive' : 'lob') : (r < 0.5 ? 'drive' : r < 0.85 ? 'soft' : 'lob');
      queueShot(pl, kind, { skill: 0.75 + 0.25*G.cpuSkill });
    }
  }
}
