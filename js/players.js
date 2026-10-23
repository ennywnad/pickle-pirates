// Pickle Pirates · Footwork (placeholder) and a stand-in CPU that chases the bounce and hits it back
// Milestone 3 brings the real footwork (split step, lunge, ready position); milestone 5 the real CPU in js/ai.js.
'use strict';
const BOUNDS = { home:{ y0:NETY + 0.6, y1:CL + 8 }, away:{ y0:-8, y1:NETY - 0.6 } };
function movePlayer(pl, ix, iy, dt){
  const tvx = ix*TUNE.runSpeed, tvy = iy*TUNE.runSpeed, a = TUNE.runAccel*dt;
  const dvx = tvx - pl.vx, dvy = tvy - pl.vy, dm = hyp(dvx, dvy);
  if (dm > a) { pl.vx += dvx/dm*a; pl.vy += dvy/dm*a; } else { pl.vx = tvx; pl.vy = tvy; }
  pl.x = clamp(pl.x + pl.vx*dt, -6, CW + 6);
  const b = BOUNDS[pl.team]; pl.y = clamp(pl.y + pl.vy*dt, b.y0, b.y1);
  if (hyp(pl.vx, pl.vy) > 2 && pl.swing <= 0) pl.face = Math.atan2(pl.vy, pl.vx);
}
// where should this player stand to take the ball after it bounces on their side?
function interceptFor(pl, B){
  const pr = predict(B, 3);
  for (const p of pr.pts) if (p.bounced && sideOf(p.y) === pl.team && (p.vz < 0 || p.z > 1.6)) return p;
  return pr.first ? { x:pr.first.x, y:pr.first.y + (pl.team === 'home' ? 2.5 : -2.5) } : null;
}
function cpuPlayer(pl, dt){
  const B = G.ball, ai = pl.ai, back = pl.team === 'home' ? 1 : -1;
  if (G.cfg.opp === 'none' && !pl.human && pl.team === 'away') {   // cannon only: the stand-in leans on the far post and watches
    const dx = -3.2 - pl.x, dy = NETY - 3 - pl.y, d = hyp(dx, dy);
    movePlayer(pl, d > 0.3 ? dx/d : 0, d > 0.3 ? dy/d : 0, dt);
    if (d < 0.5) pl.face = Math.atan2(G.ball.y - pl.y, G.ball.x - pl.x);
    return;
  }
  ai.think -= dt;
  const incoming = B.live && B.lastBy !== pl.team && (B.lastBy || G.feedTo === pl.team);   // a shot from the other side, or the cannon's feed
  if (ai.think <= 0) {
    ai.think = 0.12;
    if (incoming) { const p = interceptFor(pl, B); if (p) { ai.tx = clamp(p.x, -4, CW + 4); ai.ty = p.y + back*0.6; } }
    else { ai.tx = CW/2 + (B.live ? (B.x - CW/2)*0.3 : 0); ai.ty = baseY(pl.team) - back*3; }
  }
  const dx = ai.tx - pl.x, dy = ai.ty - pl.y, d = hyp(dx, dy);
  const k = d > 0.4 ? Math.min(1, d/2.5) : 0;
  movePlayer(pl, d ? dx/d*k : 0, d ? dy/d*k : 0, dt);
  if (pl.cool > 0) pl.cool -= dt;
  // hit once the ball has bounced on this side (the stand-in never volleys)
  if (incoming && B.bounces >= 1 && pl.cool <= 0 && canReach(pl, B) && B.z < 4.5) {
    // decide once per incoming ball whether the stand-in fluffs it, so rallies end
    if (ai.rollFor !== G.shotN) { ai.rollFor = G.shotN; ai.fluff = Math.random() < 0.1; }
    if (ai.fluff) { pl.swing = 0.28; pl.cool = 2; return; }
    const r = Math.random(), kind = r < 0.5 ? 'drive' : r < 0.78 ? 'soft' : 'lob';
    if (hitBall(pl, kind, null)) pl.cool = 0.4;
  }
}
