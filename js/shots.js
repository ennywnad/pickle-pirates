// Pickle Pirates · Shot model (placeholder): who can reach the ball, where each shot type aims, and the hit itself
// The flight shapes come from launchFor() in ball.js. Milestone 3 adds the contact window, timing, power and errors.
'use strict';
const SHOT_SOUND = { drive:'drive', dink:'paddle', drop:'paddle', lob:'paddle', serve:'drive' };
// can this player hit the ball right now?
function canReach(pl, B){
  if (!B.live || B.lastBy === pl.team) return false;
  if (sideOf(B.y) !== pl.team) return false;
  return hyp(B.x - pl.x, B.y - pl.y) <= TUNE.reach && B.z <= 7.5;
}
// the soft button plays a dink near the kitchen and a drop from further back
const softKind = pl => Math.abs(pl.y - NETY) <= KD + 3 ? 'dink' : 'drop';
// target on the other side. depth = feet in front of the far baseline. aim = [x, y] in court directions (centered = auto)
function shotTarget(pl, kind, aim){
  const far = other(pl.team);
  const depth = { drive:rand(3, 8), dink:rand(16, 20.5), drop:rand(15.4, 18.5), lob:rand(1.5, 4.5), serve:rand(3, 9) }[kind];
  let x = clamp(CW/2 + (CW/2 - pl.x)*0.4 + rand(-5, 5), 2, CW - 2), d = depth;
  if (aim && (aim[0] || aim[1])) {
    const s = far === 'away' ? 1 : -1;
    x = clamp(CW/2 + aim[0]*8, 1.5, CW - 1.5);
    d = clamp(d + aim[1]*s*4, 1, NETY - 1);
  }
  return { x, y: far === 'away' ? d : CL - d };
}
// spin modifiers held while hitting: 'top' rolls it over, 'slice' cuts under
function spinFor(kind, mod){
  if (mod === 'slice') return -TUNE.sliceSpin*RPM;
  if (mod === 'top') return { drive:TUNE.driveSpin*1.5, dink:400, drop:600, lob:900 }[kind]*RPM;
  return undefined;   // the shape's own default
}
function hitBall(pl, kind, aim, mod){
  const B = G.ball;
  if (kind === 'soft') kind = softKind(pl);
  pl.swing = 0.28; pl.swingKind = kind;
  if (!canReach(pl, B)) return false;
  const t = shotTarget(pl, kind, aim);
  const from = { x:B.x, y:B.y, z:Math.max(B.z, 0.6) };   // contact where the ball is, never below the court
  const v = launchFor(kind, from, t.x, t.y, { spin:spinFor(kind, mod) });
  Object.assign(B, v, { z:from.z, bounces:0, lastBy:pl.team, lastKind:kind, still:0 });
  pl.face = Math.atan2(t.y - pl.y, t.x - pl.x);
  G.rally++; G.best = Math.max(G.best, G.rally); G.shotN++;
  sfx(SHOT_SOUND[kind] || 'paddle', 1);
  return true;
}
