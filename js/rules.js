// Pickle Pirates · Rally referee (placeholder) and the ball cannon that restarts rallies
// Milestone 4 replaces the referee with the full rules engine (serving order, two-bounce rule, kitchen, scoring, ends).
'use strict';
const CALL_COL = { out:'#ff5a3c', net:'#ff5a3c', 'double bounce':'#ffc23a', in:'#74d38f', winner:'#74d38f', close:'#74d38f' };
function call(text, x, y, kind, small){
  G.pops.push({ text:text.toUpperCase() + '!', x, y, life:small ? 0.8 : 1.1, max:small ? 0.8 : 1.1, size:small ? 14 : 18, color:CALL_COL[kind] || '#ffc23a' });
  if (!small) G.lastCall = kind;
}
// the rally ends; `loser` made the error
function endRally(loser, kind, x, y){
  const B = G.ball;
  if (!B.live) return;
  B.live = false;
  call(kind, x, y, kind);
  const winner = other(loser);
  G.score[winner]++;
  if (!G.attract) { if (winner === 'home') { sfx('cheer'); if (kind !== 'in') band('won', 0.3); } else { sfx('aww'); } }
  G.state = 'dead'; G.stT = FEED_DELAY[G.cfg.rate] + 0.6;
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
    if (B.bounces === 1) {
      if (!landedIn(B.x, B.y)) return endRally(hitter, 'out', B.x, B.y);
      if (G.cfg.opp === 'none' && side === 'away') return endRally('away', 'in', B.x, B.y);   // cannon only: a return that lands in scores
      if (lineMargin(B.x, B.y) < 0.3) call('in', B.x, B.y, 'close', true);   // close to a line: show the call
    }
    if (B.bounces >= 2) return endRally(side, 'double bounce', B.x, B.y);
  } else if (e === 'net') { sfx('net'); G.shake = Math.max(G.shake, 0.3); }
  else if (e === 'tape') sfx('net', 0.5);
  else if (e === 'post') sfx('bounce', 1);
}

// ---------------- ball cannon: feeds the receiving side a serve, drive, drop, dink or lob
const FEED_MIX = [['serve', 2], ['drive', 3], ['drop', 2], ['dink', 2], ['lob', 1]];
function pickFeed(){ const tot = FEED_MIX.reduce((a, f) => a + f[1], 0); let r = Math.random()*tot; for (const [k, w] of FEED_MIX) { if ((r -= w) < 0) return k; } return 'drive'; }
function feedBall(to){
  const B = G.ball, cfg = G.cfg, kind = cfg.feed === 'mix' ? pickFeed() : cfg.feed;
  const far = to === 'home' ? 1 : -1;                     // +1: the cannon sits on the far (away) side
  const yFar = d => to === 'home' ? d : CL - d;           // depth from the cannon's baseline
  const yNear = d => to === 'home' ? CL - d : d;          // depth from the receiver's baseline
  const pl = G.players.find(p => p.team === to);
  // where the cannon fires from
  let from;
  if (kind === 'serve') { const sx = Math.random() < 0.5 ? 4 : CW - 4; from = { x:sx, y:yFar(-0.8), z:1.6 }; }
  else if (kind === 'dink') from = { x:clamp(pl.x + rand(-3, 3), 3, CW - 3), y:yFar(NETY - KD - 0.6), z:1.2 };
  else from = { x:CW/2 + rand(-5, 5), y:yFar(0.6), z:2.5 };
  // where it lands
  let tx = rand(2, CW - 2), ty;
  if (kind === 'serve') { tx = from.x < CW/2 ? rand(CW/2 + 1.5, CW - 1.5) : rand(1.5, CW/2 - 1.5); ty = yNear(rand(2, 9)); }
  else if (kind === 'drive') ty = yNear(rand(3, 10));
  else if (kind === 'lob') ty = yNear(rand(1.5, 5));
  else ty = yNear(rand(NETY - KD + 0.6, NETY - 1.5));   // drops and dinks: into the receiver's kitchen
  if (pl && kind !== 'serve') {
    const hand = to === 'home' ? 1 : -1;                  // the home player's forehand is +x (facing the net)
    if (cfg.place === 'fore') tx = pl.x + hand*rand(2.2, 3.6);
    else if (cfg.place === 'back') tx = pl.x - hand*rand(2.2, 3.6);
    else if (cfg.place === 'body') tx = pl.x + rand(-0.6, 0.6);
    tx = clamp(tx, 0.8, CW - 0.8);
  }
  const spin = cfg.spin === 'none' ? 0 : cfg.spin === 'top' ? 1 : cfg.spin === 'slice' ? -1 : pick([-1, 0, 1]);
  const spinAmt = spin > 0 ? { serve:600, drive:TUNE.driveSpin, drop:500, dink:300, lob:800 }[kind] : spin < 0 ? TUNE.sliceSpin : 0;
  const v = launchFor(kind, from, tx, ty, { speedK:PACE[cfg.pace], spin:spin*spinAmt*RPM });
  Object.assign(B, from, v, { live:true, bounces:0, lastBy:null, lastKind:'feed:' + kind, still:0, trail:[] });
  Object.assign(G.cannon, from, { kick:1, kind });
  G.shotN++; sfx('drive', 0.7);
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
