// Pickle Pirates · Footwork: running, the split step, lunges, the move-to-ball assist (the CPU is in js/ai.js)
'use strict';
const BOUNDS = { near:{ y0:NETY + 0.6, y1:CL + 8 }, far:{ y0:-8, y1:NETY - 0.6 } };
function movePlayer(pl, ix, iy, dt){
  for (const k of ['split', 'burst', 'lunge']) if (pl[k] > 0) pl[k] = Math.max(0, pl[k] - dt);
  if (pl.stun > 0) { ix = 0; iy = 0; pl.vx *= Math.exp(-4*dt); pl.vy *= Math.exp(-4*dt); }   // knocked down by a cannonball
  // a split step lands into a quick first step; a lunge has to recover before you can run again
  const top = TUNE.runSpeed*(pl.speedK || 1)*bootySlow(pl.team)*(pl.lunge > 0 ? 0.35 : 1), acc = TUNE.runAccel*(pl.burst > 0 && pl.split <= 0 ? 1.8 : 1)*(pl.split > 0 ? 0.3 : 1);
  const tvx = ix*top, tvy = iy*top, a = acc*dt;
  const dvx = tvx - pl.vx, dvy = tvy - pl.vy, dm = hyp(dvx, dvy);
  if (dm > a) { pl.vx += dvx/dm*a; pl.vy += dvy/dm*a; } else { pl.vx = tvx; pl.vy = tvy; }
  pl.x = clamp(pl.x + pl.vx*dt, -6, CW + 6);
  const b = BOUNDS[isNear(pl.team) ? 'near' : 'far']; pl.y = clamp(pl.y + pl.vy*dt, b.y0, b.y1);
  if (pl.y === b.y0 || pl.y === b.y1) pl.vy = 0;
  hazardPlayer(pl, dt);
  if (hyp(pl.vx, pl.vy) > 2 && pl.swing <= 0) pl.face = Math.atan2(pl.vy, pl.vx);
  else if (pl.swing <= 0 && hyp(pl.vx, pl.vy) < 1) pl.face += (Math.atan2(NETY - pl.y, 0) - pl.face)*Math.min(1, dt*4);   // ready position: face the net
}
// how long to cover d feet from a standstill: accelerate to top speed, then run
function runTime(pl, d){
  if (d <= 0) return 0;
  const v = TUNE.runSpeed*(pl.speedK || 1), a = TUNE.runAccel, da = v*v/(2*a);
  return d <= da ? Math.sqrt(2*d/a) : v/a + (d - da)/v;
}
// where to stand to take the incoming ball: the earliest point on its path that's at a good height, follows the
// two-bounce rule, and that the player can get to in time. Returns { x, y (body), bx, by, bz (ball), t } or null.
function contactSpot(pl, B){
  const pr = predict(B, 2.6, BALL_DT, 6), hand = handOf(pl), back = backDir(pl.team);
  let fallback = null;
  for (const p of pr.pts) {
    if (sideOf(p.y) !== pl.team) continue;
    const bounced = B.bounces > 0 || p.bounced;
    if (!bounced && mustBounce()) continue;
    if (p.z < 0.5 || p.z > (bounced ? 6 : 8.2)) continue;   // up to an overhead reach on the volley (contactQ allows 8.6)
    // stand a little to the side of the ball and a touch behind it: the forehand side, unless the ball is coming to the
    // backhand and taking it there is clearly quicker
    const sy = p.y + back*0.5, fx = p.x - hand*1.5, bx = p.x + hand*1.5;
    const tF = runTime(pl, hyp(fx - pl.x, sy - pl.y) - 0.3), tB = runTime(pl, hyp(bx - pl.x, sy - pl.y) - 0.3);
    const sx = tB + 0.3 < tF ? bx : fx;
    if (!bounced && G.cfg.kitchen !== false && inKitchenZone(sx, sy)) continue;   // never plan a volley from the kitchen
    const reachT = Math.min(tF, tB + 0.3) + 0.08;
    // waist-high is best; up at the net, a high ball is a volley or a smash, not a reason to back off to the baseline
    const good = p.z >= 1.1 && (p.z <= 4.2 || (!bounced && Math.abs(pl.y - NETY) <= KD + 4));
    const spot = { x:clamp(sx, -5, CW + 5), y:sy, bx:p.x, by:p.y, bz:p.z, t:p.t };
    if (good && reachT <= p.t) return spot;
    if (!fallback && reachT <= p.t + 0.25) fallback = spot;
  }
  return fallback;
}
// ---------------- doubles: lanes and who takes the ball
// the middle of the court half this player holds (singles: the whole width)
function laneX(pl){
  if (G.format !== 'doubles') return CW/2;
  return (pl.lane === 'right') === isNear(pl.team) ? CW*0.73 : CW*0.27;   // a near player's right is +x, a far player's is −x
}
// is this ball this player's to chase? In doubles one partner takes each ball (G.taker); the other covers.
function mine(pl, B){ return ballFor(pl, B) && (!G.taker || G.taker.team !== pl.team || G.taker.pl === pl); }
// a new ball is coming to `team`: the partner who can get to a good contact spot with the least running takes it,
// with a nudge toward whoever's lane the ball is in
function takerCost(pl, B){
  const sp = contactSpot(pl, B);
  if (!sp) return { cost:99, sp:null };
  return { cost: runTime(pl, hyp(sp.x - pl.x, sp.y - pl.y)) + Math.abs(sp.bx - laneX(pl))*0.035, sp };
}
function assignTaker(team){
  const crew = crewOf(team);
  if (crew.length < 2) { G.taker = { team, pl:crew[0], shotN:G.shotN, t:0 }; return; }
  const B = G.ball, [a, b] = crew.map(p => takerCost(p, B));
  let pick = a.cost <= b.cost ? crew[0] : crew[1];
  if (a.cost >= 99 && b.cost >= 99) {   // nobody can get there cleanly: whoever is nearer where it lands
    const pr = predict(B, 2.5, BALL_DT, 1e4), L = pr.first || B;
    pick = hyp(crew[0].x - L.x, crew[0].y - L.y) <= hyp(crew[1].x - L.x, crew[1].y - L.y) ? crew[0] : crew[1];
  }
  G.taker = { team, pl:pick, shotN:G.shotN, t:0 };
}
// while the ball comes, look again a few times a second; hand it over only if the partner is clearly better placed
function refreshTaker(dt){
  const T = G.taker, B = G.ball;
  if (!T || !B.live || B.lastBy === T.team || G.format !== 'doubles' || G.hits === 1) return;
  T.t += dt; if (T.t < 0.25) return; T.t = 0;
  const mate = mateOf(T.pl); if (!mate) return;
  const cur = takerCost(T.pl, B).cost, alt = takerCost(mate, B).cost;
  if (alt < cur - 0.25) T.pl = mate;
}
// keep assisted and CPU footwork out of the kitchen while a volley is coming or a volley's momentum is still on:
// stop at the line, and back out if already in
function kitchenGuard(pl, ix, iy){
  if (G.cfg.kitchen === false) return [ix, iy];
  const B = G.ball, risky = pl.momentum > 0 || (B.live && ballFor(pl, B) && B.bounces === 0);
  if (!risky) return [ix, iy];
  const back = backDir(pl.team), out = (pl.y - NETY)*back - (KD + FOOT_R + 0.1);   // feet beyond the kitchen line (negative = in)
  if (out < 0) return [ix*0.5, back*0.9];
  if (out < 0.5 && iy*back < 0) iy = 0;
  return [ix, iy];
}
// the human: stick movement, blended with the move-to-ball assist unless Plant is held
function humanMove(pl, dt){
  let [ix, iy] = readInput(pl.pad);
  const plant = actionHeld(pl.pad, 'plant'), B = G.ball;
  if (plant) { ix = 0; iy = 0; }
  else if (TUNE.assist > 0 && mine(pl, B)) {
    pl.spotT -= dt;
    if (pl.spotT <= 0 || !pl.spot) { pl.spotT = 0.1; pl.spot = contactSpot(pl, B); }
    const sp = pl.spot;
    if (sp) {
      const [gx, gy] = hazardAvoid(sp.x, sp.y), dx = gx - pl.x, dy = gy - pl.y, d = hyp(dx, dy);
      if (d > 0.3) {
        // stick centered: the assist runs you there (near full speed at the default strength); with the stick, it nudges
        const own = hyp(ix, iy), k = (own > 0.2 ? 0.5*TUNE.assist : Math.min(1, 0.35 + TUNE.assist))*Math.min(1, d/1.5);
        ix += dx/d*k; iy += dy/d*k;
        const m = hyp(ix, iy); if (m > 1) { ix /= m; iy /= m; }
      }
    }
    if (hyp(...readInput(pl.pad)) < 0.2) [ix, iy] = kitchenGuard(pl, ix, iy);   // the assist never walks you into a kitchen fault (the stick can)
  } else {
    pl.spot = null;
    // between shots: with the stick centered, drift back to a ready spot (kitchen line if you're up, else the baseline)
    if (!plant && TUNE.assist > 0 && hyp(ix, iy) < 0.15) {
      // between points the receiver waits at the baseline (serves and returns must bounce); mid-rally, hold the kitchen line if you're up
      const up = B.live && !!B.lastBy && G.hits >= 3 && Math.abs(pl.y - NETY) <= KD + 3, rx = laneX(pl) + (B.live ? (B.x - CW/2)*0.25 : 0), ry = isNear(pl.team) ? (up ? NETY + KD + 0.6 : CL - 1.2) : (up ? NETY - KD - 0.6 : 1.2);
      const dx = rx - pl.x, dy = ry - pl.y, d = hyp(dx, dy);
      if (d > 0.6) { const k = TUNE.assist*0.7*Math.min(1, d/3); ix = dx/d*k; iy = dy/d*k; }
    }
  }
  movePlayer(pl, ix, iy, dt);
}
