// Pickle Pirates · Shot model (placeholder): who can reach the ball, where each shot type aims, and the hit itself
// Milestone 3 replaces this with the contact window, timing, power and error model.
'use strict';
const SHOTS = {
  drive:{ apexOver:1.0, depth:[3, 8],  spin:28, sound:'drive' },   // low and deep
  soft: { apexOver:1.8, depth:[NaN, NaN], spin:0, sound:'paddle' }, // dink at the kitchen, drop from the back
  lob:  { apexOver:13,  depth:[1, 4],  spin:8,  sound:'paddle' }    // high over the kitchen line
};
// can this player hit the ball right now?
function canReach(pl, B){
  if (!B.live || B.lastBy === pl.team) return false;
  if (sideOf(B.y) !== pl.team) return false;
  return hyp(B.x - pl.x, B.y - pl.y) <= TUNE.reach && B.z <= 7.5;
}
// target on the other side: depth = feet in front of the far baseline. aim = [x, y] stick, screen-relative for the home side
function shotTarget(pl, kind, aim){
  const far = other(pl.team), fromNet = Math.abs(pl.y - NETY);
  let depth;
  if (kind === 'soft') depth = fromNet < KD + 3 ? rand(16, 20) : rand(15, 19);          // into the kitchen: 15–22 ft from the far baseline
  else { const [a, b] = SHOTS[kind].depth; depth = rand(a, b); }
  let x = clamp(CW/2 + (CW/2 - pl.x)*0.4 + rand(-5, 5), 2, CW - 2);
  if (aim && (aim[0] || aim[1])) {
    const s = pl.team === 'home' ? 1 : -1;
    x = clamp(CW/2 + aim[0]*s*8, 1.5, CW - 1.5);
    depth = clamp(depth + aim[1]*s*4, 1, NETY - 1);
  }
  const y = far === 'away' ? depth : CL - depth;
  return { x, y };
}
function hitBall(pl, kind, aim){
  const B = G.ball;
  pl.swing = 0.28; pl.swingKind = kind;
  if (!canReach(pl, B)) return false;
  const S = SHOTS[kind], t = shotTarget(pl, kind, aim);
  // contact point: the ball where it is, never below the court
  const from = { x:B.x, y:B.y, z:Math.max(B.z, 0.6) };
  let apex = netH(B.x) + S.apexOver + (kind === 'soft' && Math.abs(pl.y - NETY) > KD + 4 ? 1.5 : 0), v;
  // stand-in for real skill: raise the arc until the shot clears the net (milestone 3 brings errors back on purpose)
  for (let i = 0; i < 4; i++) {
    v = aimShot(from, t.x, t.y, apex, S.spin);
    const pr = predict({ ...from, ...v }, 3, 1/120, 1000);
    if (pr.first && sideOf(pr.first.y) !== pl.team) break;
    apex += 0.9;
  }
  Object.assign(B, v, { z:from.z, bounces:0, lastBy:pl.team, lastKind:kind, still:0 });
  B.vx += rand(-0.4, 0.4); B.vy *= rand(0.98, 1.02);
  pl.face = Math.atan2(t.y - pl.y, t.x - pl.x);
  G.rally++; G.best = Math.max(G.best, G.rally); G.shotN++;
  sfx(S.sound, 1);
  return true;
}
