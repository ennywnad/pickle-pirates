// Pickle Pirates · Rally referee (placeholder): in/out, net, double bounce, and the ball cannon that restarts rallies
// Milestone 4 replaces this with the full rules engine (serving order, two-bounce rule, kitchen, scoring, ends).
'use strict';
const CALL_COL = { out:'#ff5a3c', net:'#ff5a3c', 'double bounce':'#ffc23a', in:'#74d38f', winner:'#74d38f' };
function call(text, x, y, kind){
  G.pops.push({ text:text.toUpperCase() + '!', x, y, life:1.1, max:1.1, size:18, color:CALL_COL[kind] || '#ffc23a' });
  G.lastCall = kind;
}
// the rally ends; `loser` made the error
function endRally(loser, kind, x, y){
  const B = G.ball;
  if (!B.live) return;
  B.live = false;
  call(kind, x, y, kind);
  const winner = other(loser);
  G.score[winner]++;
  if (!G.attract) { if (winner === 'home') { sfx('cheer'); band('won', 0.3); } else { sfx('aww'); } }
  G.state = 'dead'; G.stT = TUNE.cannonRate + 0.6;
  G.feedTo = G.attract ? other(G.feedTo) : 'home';
  G.rally = 0;
}
// ball event hook for the live ball
function onBallEvent(e, B, vin){
  if (e === 'bounce') {
    sfx('bounce', clamp(vin/20, 0.2, 1));
    for (let i=0;i<5;i++) G.parts.push({ x:B.x, y:B.y, z:0.1, vx:rand(-3,3), vy:rand(-3,3), vz:rand(1,3), life:0.4, max:0.4, s:rand(0.15,0.3), c:'#e8e0c8' });
    if (!B.live) return;
    const side = sideOf(B.y), hitter = B.lastBy;
    if (!hitter) { if (++B.bounces >= 2) endRally(side, 'double bounce', B.x, B.y); return; }   // a feed from the cannon: one free bounce
    if (side === hitter) return endRally(hitter, 'net', B.x, B.y);           // never got over
    B.bounces++;
    if (B.bounces === 1 && !inCourt(B.x, B.y, BALL_R)) return endRally(hitter, 'out', B.x, B.y);
    if (B.bounces >= 2) return endRally(side, 'double bounce', B.x, B.y);
  } else if (e === 'net') { sfx('net'); G.shake = Math.max(G.shake, 0.3); }
}
function feedBall(to){
  const B = G.ball, fromY = to === 'home' ? 0.5 : CL - 0.5;
  const from = { x:CW/2 + rand(-3, 3), y:fromY, z:3 };
  const tx = rand(3, CW - 3), ty = to === 'home' ? rand(NETY + 9, CL - 3) : rand(3, NETY - 9);
  const v = aimShot(from, tx, ty, rand(8, 12), 0);
  Object.assign(B, from, v, { live:true, bounces:0, lastBy:null, lastKind:'feed', still:0, trail:[] });
  G.shotN++; sfx('pickup');
}
// called every frame while the rally is live
function rallyWatch(dt){
  const B = G.ball;
  if (!B.live) return;
  if (Math.abs(B.x - CW/2) > 40 || B.y < -24 || B.y > CL + 24) {
    const cx = clamp(B.x, 0, CW), cy = clamp(B.y, 0, CL);
    if (B.bounces) return endRally(B.lastBy ? other(B.lastBy) : G.feedTo, 'winner', cx, cy);   // bounced in, then got away
    return endRally(B.lastBy || G.feedTo, 'out', cx, cy);
  }
  const slow = hyp(B.vx, B.vy, B.vz) < 2 && B.z < 0.5;
  B.still = slow ? B.still + dt : 0;
  if (B.still > 0.5) endRally(B.lastBy ? sideOf(B.y) : G.feedTo, sideOf(B.y) === B.lastBy ? 'net' : 'double bounce', B.x, B.y);
}
