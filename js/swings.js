// Pickle Pirates · Swings: where the paddle is, for every shot type, at every moment. Shared by both views and the tests.
// Each swing is three points for the paddle head: a backswing, the contact (the real ball position, so the paddle
// meets the ball exactly when the sim strikes it), and a follow-through. Backswings and follow-throughs are set in the
// player's own frame (right, up, forward) and turned into court coordinates with the way the player faces.
// The windup starts from the planned contact (shots.js records it while a shot press waits), so the forward swing
// arrives at the ball on the frame the shot is struck.
'use strict';
// paddle-head points in the player's frame: [right, up, forward] in feet. fh = forehand side, bh = backhand.
const SWINGS = {
  //               backswing            follow-through        body: twist at back/follow (rad), crouch, hop (ft)
  drive_fh:  { back:[ 1.9, 2.9, -1.0], follow:[-1.2, 3.8,  1.0], twist:[ 0.6, -0.5], crouch:0.1,  hop:0 },
  drive_bh:  { back:[-1.8, 2.9, -0.8], follow:[ 1.4, 3.8,  0.9], twist:[-0.6,  0.4], crouch:0.1,  hop:0 },
  volley_fh: { back:[ 1.2, 3.1,  0.3], follow:[ 0.7, 3.0,  1.9], twist:[ 0.25, -0.1], crouch:0.15, hop:0 },
  volley_bh: { back:[-1.1, 3.1,  0.3], follow:[-0.4, 3.0,  1.9], twist:[-0.25, 0.1], crouch:0.15, hop:0 },
  dink_fh:   { back:[ 0.9, 1.3,  0.3], follow:[ 0.6, 2.0,  2.0], twist:[ 0.15, 0.0], crouch:0.4,  hop:0 },
  dink_bh:   { back:[-0.7, 1.3,  0.3], follow:[-0.2, 2.0,  2.0], twist:[-0.15, 0.0], crouch:0.4,  hop:0 },
  drop_fh:   { back:[ 1.3, 0.9, -0.6], follow:[ 0.7, 3.4,  1.8], twist:[ 0.35, -0.1], crouch:0.3,  hop:0 },
  drop_bh:   { back:[-1.2, 0.9, -0.5], follow:[-0.3, 3.4,  1.8], twist:[-0.35, 0.1], crouch:0.3,  hop:0 },
  lob_fh:    { back:[ 1.3, 0.7, -0.9], follow:[ 0.5, 5.4,  1.0], twist:[ 0.4, -0.2], crouch:0.35, hop:0.15 },
  lob_bh:    { back:[-1.2, 0.7, -0.8], follow:[ 0.0, 5.4,  1.0], twist:[-0.4,  0.2], crouch:0.35, hop:0.15 },
  smash:     { back:[ 0.9, 6.3, -1.3], follow:[-0.8, 1.6,  1.6], twist:[ 0.5, -0.6], crouch:0,    hop:0.55 },
  serve:     { back:[ 1.2, 1.2, -1.9], follow:[ 0.4, 4.4,  1.8], twist:[ 0.45, -0.3], crouch:0.15, hop:0 },
  pop:       { back:[ 1.2, 2.4, -0.2], follow:[ 0.3, 1.6,  1.0], twist:[ 0.2,  0.1], crouch:0.1,  hop:0 },
};
const READY = [0.9, 2.4, 1.2];                      // paddle up in front, between shots
const WIND = 0.28, FORWARD = 0.1, THROUGH = 0.3, RECOVER = 0.22;   // seconds: backswing starts WIND before contact
const SMASH_WIND = 0.36;
// which swing a stroke uses: by the shot, which side the ball was on, and whether it was a volley
function swingName(kind, side, volley){
  const s = side < 0 ? 'bh' : 'fh';
  if (kind === 'serve' || kind === 'smash' || kind === 'pop') return kind;
  if (kind === 'drive') return (volley ? 'volley_' : 'drive_') + s;
  if (kind === 'dink' || kind === 'drop' || kind === 'lob') return kind + '_' + s;
  return 'drive_' + s;
}
// the player's frame in court coordinates: forward along the facing, right 90° clockwise of it (a near player facing
// the net has +x on the right; a far player, −x)
function frameOf(pl){ const fx = Math.cos(pl.face), fy = Math.sin(pl.face); return { fx, fy, rx:-fy, ry:fx }; }
// heights in SWINGS are for a 3 ft shoulder; a shorter or taller crew (the views pass their own) shifts them
let SH = 0;
function toCourt(pl, p, F = frameOf(pl)){ return [pl.x + F.rx*p[0] + F.fx*p[2], pl.y + F.ry*p[0] + F.fy*p[2], Math.max(0.3, p[1] + SH)]; }
const easeIO = u => u <= 0 ? 0 : u >= 1 ? 1 : u*u*(3 - 2*u);
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0])*u, a[1] + (b[1] - a[1])*u, a[2] + (b[2] - a[2])*u];
// celebrations between points: the winners raise their paddles and hop, the losers drop theirs
function celebration(pl, now){
  const P = G && G.lastPoint; if (!P || !G.match || !(G.state === 'dead' || G.state === 'over' || G.state === 'end')) return null;
  const u = now - P.t; if (u < 0.15 || u > 3.2) return null;
  const big = G.state !== 'dead';   // the game's over: a bigger party
  if (pl.team === P.winner) {
    const bounce = Math.abs(Math.sin(u*(big ? 9 : 7)));
    return { head:[0.5 + Math.sin(u*6)*0.3, 5.6 + bounce*0.3, 0.4], off:[-0.7, 5.0 + bounce*0.3, 0.3], hop:(big ? 0.7 : 0.35)*bounce, twist:Math.sin(u*5)*0.3, crouch:0, lean:0, mood:'cheer' };
  }
  return { head:[0.7, 0.9, 0.9], off:[-0.7, 1.2, 0.3], hop:0, twist:0, crouch:0.15, lean:0.3, mood:'slump' };
}
// where the paddle head is now (court x, y and height z), and what the body is doing
function paddlePose(pl, now, shoulder = 3.0){
  SH = shoulder - 3.0;
  const F = frameOf(pl), ready = toCourt(pl, READY, F);
  const out = { head:ready, phase:'ready', sw:null, twist:0, crouch:0, hop:0, lean:0, off:toCourt(pl, [-0.9, 1.9, 0.5], F), mood:null };
  const H = pl.hit;
  if (H && now - H.t < THROUGH + RECOVER && now >= H.t) {
    // after contact: through to the follow-through, then back to ready
    const S = SWINGS[H.sw] || SWINGS.drive_fh, u = now - H.t, fol = toCourt(pl, S.follow, F);
    out.sw = H.sw;
    if (u < THROUGH) { const k = easeIO(u/THROUGH); out.head = lerp3([H.x, H.y, H.z], fol, k); out.phase = 'follow'; out.twist = S.twist[1]*k; }
    else { const k = easeIO((u - THROUGH)/RECOVER); out.head = lerp3(fol, ready, k); out.phase = 'recover'; out.twist = S.twist[1]*(1 - k); }
    out.crouch = S.crouch*(u < THROUGH ? 1 - u/THROUGH*0.5 : 0.5*(1 - (u - THROUGH)/RECOVER));
    out.hop = S.hop*Math.max(0, Math.sin(Math.min(1, u/THROUGH)*Math.PI*0.5 + Math.PI*0.5));
    return out;
  }
  const Wd = pl.wind;
  if (Wd) {
    const S = SWINGS[Wd.sw] || SWINGS.drive_fh, wind = Wd.sw === 'smash' ? SMASH_WIND : WIND, t0 = Wd.at - wind, tb = Wd.at - FORWARD;
    if (now >= t0 && now <= Wd.at + 0.05) {
      const back = toCourt(pl, S.back, F), contact = [Wd.x, Wd.y, Wd.z];
      out.sw = Wd.sw;
      if (now < tb) { const k = easeIO((now - t0)/(tb - t0)); out.head = lerp3(ready, back, k); out.phase = 'wind'; out.twist = S.twist[0]*k; out.crouch = S.crouch*k; }
      else { const k = Math.min(1, (now - tb)/FORWARD); out.head = lerp3(back, contact, k*k); out.phase = 'forward'; out.twist = S.twist[0]*(1 - k); out.crouch = S.crouch; out.hop = S.hop*k; }
      return out;
    }
  }
  const C = celebration(pl, now);
  if (C) { out.head = toCourt(pl, C.head, F); out.off = toCourt(pl, C.off, F); out.phase = C.mood; out.mood = C.mood; out.hop = C.hop; out.twist = C.twist; out.crouch = C.crouch; out.lean = C.lean; }
  return out;
}
// the sim's side: a shot press is waiting and the best contact is `ahead` (from bestAhead): plan the windup to it
function planSwing(pl, kind, ahead){
  if (!ahead) { pl.wind = null; return; }
  const k = kind === 'soft' ? (Math.abs(pl.y - NETY) <= KD + 3 ? 'dink' : 'drop') : kind === 'drive' && ahead.pz > 5.2 && Math.abs(ahead.py - NETY) < 20 ? 'smash' : kind;
  pl.wind = { at:G.time + ahead.t, x:ahead.px, y:ahead.py, z:ahead.pz, sw:swingName(k, ahead.side, ahead.volley) };
}
// the moment of contact: the paddle is at the ball
function recordHit(pl, kind, side, volley, B){
  pl.hit = { t:G.time, x:B.x, y:B.y, z:B.z, sw:swingName(kind, side, volley) };
  pl.wind = null;
}
