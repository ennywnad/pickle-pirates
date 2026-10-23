// Pickle Pirates · The referee: runs points under js/rules.js, makes the calls, and restarts play.
// Games: serve setup, serving, faults, side outs, game point, switching ends, game over.
// Practice: the ball cannon restarts every rally, with the same fault calls.
'use strict';
const CALL_COL = { out:'#ff5a3c', net:'#ff5a3c', short:'#ff5a3c', fault:'#ff5a3c', kitchen:'#ff5a3c', 'two bounce':'#ff5a3c', post:'#ff5a3c', 'double bounce':'#ffc23a', in:'#74d38f', winner:'#74d38f', close:'#74d38f', ace:'#74d38f' };
const CALL_TEXT = { out:'Out!', net:'Net!', short:'Short!', fault:'Fault!', kitchen:'Kitchen!', 'two bounce':'Two bounce!', post:'Post!', 'double bounce':'Double bounce!', in:'In!', winner:'Winner!', close:'In!', ace:'Ace!', smash:'Smash!' };
function call(kind, x, y, kindCol, small){
  const text = (CALL_TEXT[kind] || kind + '!').toUpperCase();
  G.pops.push({ text, x, y, life:small ? 0.8 : 1.2, max:small ? 0.8 : 1.2, size:small ? 14 : 18, color:CALL_COL[kindCol || kind] || '#ffc23a' });
  if (!small) G.lastCall = kind;
}
// a banner across the screen for big moments (side out, game point, switch ends, game)
function announce(text, sub, ms = 1400){ if (G.attract) return; G.banner = { text, sub:sub || '', t:0, ms }; if (typeof toast === 'function') toast(text, sub || '', ms, 'small'); }

// the rally ends; `loser` made the error (or failed to return the ball)
function endRally(loser, kind, x, y){
  const B = G.ball;
  if (!B.live) return;
  B.live = false;
  const winner = other(loser);
  // an unreturned serve that landed in is an ace
  if (G.mode === 'game' && G.hits === 1 && kind === 'double bounce') kind = 'ace';
  call(kind, x, y);
  G.stats.rallies++; G.stats.longest = Math.max(G.stats.longest, G.rally);
  if (kind === 'ace') G.stats.aces++;
  G.stats.faults[kind] = (G.stats.faults[kind] || 0) + 1;
  G.stats.faultBy[loser][kind] = (G.stats.faultBy[loser][kind] || 0) + 1;
  for (const pl of G.players) pl.queue = null;
  if (G.mode === 'game') return endPoint(winner, kind);
  // practice
  G.score[winner]++;
  if (!G.attract) { if (winner === 'home') { sfx('cheer'); if (kind !== 'in') band('won', 0.3); } else { sfx('aww'); } }
  G.state = 'dead'; G.stT = FEED_DELAY[G.cfg.rate] + 0.6;
  G.feedTo = 'home';
  G.rally = 0;
}
function endPoint(winner, kind){
  const S = G.match, wasServer = S.server, res = awardRally(S, winner);
  if (!G.attract) {
    const mine = G.players.find(p => p.human);
    if (mine && winner === mine.team) { sfx('cheer'); if (res.scored) band('won', 0.4); } else sfx('aww');
  }
  G.state = 'dead'; G.stT = 1.7; G.pendingSwitch = res.switchEnds;
  if (res.gameOver) { G.state = 'over'; G.stT = 2.2; announce('Game!', `${teamName(winner)} win ${S.pts[winner]}–${S.pts[other(winner)]}`, 2200); return; }
  if (res.sideOut) announce('Side out', `${teamName(S.server)} to serve`, 1200);
  else if (res.scored) { const gp = gamePoint(S); if (gp) announce('Game point', `${teamName(gp)} · ${scoreCall(S)}`, 1400); }
  if (res.switchEnds) { G.stT = 2.4; announce('Switch ends', `First to ${S.switchAt}`, 1600); }
  void wasServer;
}
const teamName = tm => tm === 'home' ? HOME.name : G.island.opp.name;

// ---------------- serving
// stand the server and receiver for the next serve; the ball goes to the server
function startPoint(){
  const S = G.match, server = S.server, pos = servePositions(isNear(server), serverCourt(S));
  G.state = 'set'; G.stT = 0.9; G.hits = 0; G.rally = 0; G.serveT = 0;
  Object.assign(G.ball, { live:false, z:-5, bounces:0, lastBy:null, lastKind:null, serve:null, trail:[] });
  for (const pl of G.players) { const p = pl.team === server ? pos.server : pos.receiver; pl.setTo = { x:p.x, y:p.y }; pl.queue = null; pl.momentum = 0; pl.spot = null; if (!pl.human) aiNewPoint(pl); }
}
// glide everyone to their spots, then wait for the serve
function serveSetup(dt){
  G.stT -= dt;
  const k = 1 - Math.exp(-dt*7);
  for (const pl of G.players) if (pl.setTo) {
    const dx = pl.setTo.x - pl.x, dy = pl.setTo.y - pl.y;
    pl.vx = dx*k/dt*0.5; pl.vy = dy*k/dt*0.5; pl.x += dx*k; pl.y += dy*k;
    pl.face = Math.atan2(NETY - pl.y, 0);
  }
  if (G.stT <= 0) {
    for (const pl of G.players) if (pl.setTo) { pl.x = pl.setTo.x; pl.y = pl.setTo.y; pl.vx = pl.vy = 0; pl.setTo = null; }
    G.state = 'serve'; G.serveT = 0;
    const srv = G.players.find(p => p.team === G.match.server);
    if (srv && srv.human) G.yourServe = true;
  }
}
// hold the ball at the server's hip until they serve
function holdServe(dt){
  const srv = G.players.find(p => p.team === G.match.server), B = G.ball;
  G.serveT += dt;
  Object.assign(B, { x:srv.x + handOf(srv)*0.5, y:srv.y - backDir(srv.team)*0.6, z:1.6 + Math.sin(G.serveT*5)*0.05, vx:0, vy:0, vz:0, sx:0, sy:0, sz:0 });
  if (!srv.human && G.serveT > (G.attract ? 0.9 : 1.2)) aiServe(srv);
}
// serve: drive = a hard serve, soft = a slower deep one, lob = a high lob serve. aim picks the spot inside the service court.
function doServe(pl, kind, aim, place){
  if (G.state !== 'serve' || pl.team !== G.match.server) return false;
  const S = G.match, court = serverCourt(S), recNear = !isNear(pl.team), box = serviceBox(recNear, court), B = G.ball;
  const deepY = recNear ? box.y1 : box.y0, dir = recNear ? -1 : 1;   // dir: from the receiver's baseline toward the net
  let tx = (box.x0 + box.x1)/2 + rand(-2.6, 2.6), depth = rand(2, 7);
  if (place) { tx = (box.x0 + box.x1)/2 + place.xk*4; depth = place.depth; }   // the CPU's chosen spot: across the box, feet from the baseline
  else if (aim && (aim[0] || aim[1])) {
    tx = (box.x0 + box.x1)/2 + aim[0]*5;
    depth = 4.5 + aim[1]*(recNear ? -4 : 4);   // stick toward the receiver's baseline = deeper
    const safeX = clamp(tx, box.x0 + 1.2, box.x1 - 1.2), safeD = clamp(depth, 1.2, 12);
    tx += (safeX - tx)*TUNE.aimAssist; depth += (safeD - depth)*TUNE.aimAssist;
  }
  // a little spray: the human serves near-perfectly, the CPU by its skill
  const q = pl.human ? 0.92 : tierOf(pl).serve, spread = (1 - q)*(1 - 0.6*TUNE.forgive);
  tx += gauss()*(0.2 + 4*spread); depth += gauss()*(0.2 + 4*spread);
  const ty = deepY + dir*depth;
  const from = { x:pl.x + handOf(pl)*0.5, y:pl.y - backDir(pl.team)*0.6, z:1.5 };   // from the server's hand, wherever the ball was last drawn
  const v = kind === 'lob' ? launchFor('lob', from, tx, ty, { arcK:0.7 }) : launchFor('serve', from, tx, ty, { speedK: kind === 'soft' ? 0.78 : 1 });
  Object.assign(B, from, v, { live:true, bounces:0, lastBy:pl.team, lastKind:'serve', serve:{ court, recNear }, still:0, trail:[] });
  pl.swing = 0.28; pl.swingKind = 'serve'; pl.swingSide = 1;
  const rec = G.players.find(p => p.team !== pl.team); if (rec) { rec.split = 0.18; rec.burst = 0.5; }
  G.hits = 1; G.rally = 1; G.shotN++; G.state = 'play'; G.yourServe = false; G.stats.strokes++;
  sfx('drive', 0.9);
  return true;
}

// ---------------- ball events: bounces, the net, the posts
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
      if (B.serve) {   // the serve has to land in the diagonal service court, past the kitchen line
        const r = serveResult(B.x, B.y, B.serve.recNear, B.serve.court); B.serve = null;
        if (r === 'short') return endRally(hitter, 'short', B.x, B.y);
        if (r !== 'in') return endRally(hitter, landedIn(B.x, B.y) ? 'fault' : 'out', B.x, B.y);
      } else if (!landedIn(B.x, B.y)) return endRally(hitter, 'out', B.x, B.y);
      if (G.mode === 'practice' && G.cfg.opp === 'none' && side === 'away') return endRally('away', 'in', B.x, B.y);   // cannon only: a return that lands in scores
      if (lineMargin(B.x, B.y) < 0.3) call('close', B.x, B.y, 'close', true);   // close to a line: show the call
    }
    if (B.bounces >= 2) return endRally(side, 'double bounce', B.x, B.y);
  } else if (e === 'net') { sfx('net'); G.shake = Math.max(G.shake, 0.3); }
  else if (e === 'tape') sfx('net', 0.5);
  else if (e === 'post') { sfx('bounce', 1); if (B.live && B.lastBy) endRally(B.lastBy, 'post', B.x, B.y); }
}
// a stroke was just made: check it against the two-bounce and kitchen rules
function strokeRules(pl, c){
  if (!c.volley) return;
  if (G.cfg.twoBounce !== false && twoBounceFault(G.hits - 1, true)) return endRally(pl.team, 'two bounce', pl.x, pl.y);
  if (G.cfg.kitchen !== false && inKitchenZone(pl.x, pl.y)) return endRally(pl.team, 'kitchen', pl.x, pl.y);
  pl.momentum = MOMENTUM_T;   // a volley's momentum: stepping into the kitchen right after still faults
}
// per frame: momentum faults
function kitchenWatch(dt){
  for (const pl of G.players) {
    if (!(pl.momentum > 0)) continue;
    pl.momentum -= dt;
    const towardNet = (pl.vy*backDir(pl.team)) < -0.5;
    if (G.cfg.kitchen !== false && G.ball.live && towardNet && inKitchenZone(pl.x, pl.y)) { pl.momentum = 0; endRally(pl.team, 'kitchen', pl.x, pl.y); }
  }
}
// would a volley by this player right now be a kitchen fault? (the kitchen glows to warn you)
function kitchenWarn(pl){
  const B = G.ball;
  return G.cfg.kitchen !== false && B.live && ballFor(pl, B) && B.bounces === 0 && inKitchenZone(pl.x, pl.y) && sideOf(B.y) === pl.team;
}

// ---------------- ball cannon (practice): feeds the receiving side a serve, drive, drop, dink or lob
const FEED_MIX = [['serve', 2], ['drive', 3], ['drop', 2], ['dink', 2], ['lob', 1]];
function pickFeed(){ const tot = FEED_MIX.reduce((a, f) => a + f[1], 0); let r = Math.random()*tot; for (const [k, w] of FEED_MIX) { if ((r -= w) < 0) return k; } return 'drive'; }
function feedBall(to){
  const B = G.ball, cfg = G.cfg, kind = cfg.feed === 'mix' || !cfg.feed ? pickFeed() : cfg.feed;
  const near = isNear(to);
  const yFar = d => near ? d : CL - d;           // depth from the cannon's baseline
  const yNear = d => near ? CL - d : d;          // depth from the receiver's baseline
  const pl = G.players.find(p => p.team === to);
  let from;
  if (kind === 'serve') { const sx = Math.random() < 0.5 ? 4 : CW - 4; from = { x:sx, y:yFar(-0.8), z:1.6 }; }
  else if (kind === 'dink') from = { x:clamp(pl.x + rand(-3, 3), 3, CW - 3), y:yFar(NETY - KD - 0.6), z:1.2 };
  else from = { x:CW/2 + rand(-5, 5), y:yFar(0.6), z:2.5 };
  let tx = rand(2, CW - 2), ty;
  if (kind === 'serve') { tx = from.x < CW/2 ? rand(CW/2 + 1.5, CW - 1.5) : rand(1.5, CW/2 - 1.5); ty = yNear(rand(2, 9)); }
  else if (kind === 'drive') ty = yNear(rand(3, 10));
  else if (kind === 'lob') ty = yNear(rand(1.5, 5));
  else ty = yNear(rand(NETY - KD + 0.6, NETY - 1.5));   // drops and dinks: into the receiver's kitchen
  if (pl && kind !== 'serve') {
    const hand = handOf(pl);
    if (cfg.place === 'fore') tx = pl.x + hand*rand(2.2, 3.6);
    else if (cfg.place === 'back') tx = pl.x - hand*rand(2.2, 3.6);
    else if (cfg.place === 'body') tx = pl.x + rand(-0.6, 0.6);
    tx = clamp(tx, 0.8, CW - 0.8);
  }
  const spin = cfg.spin === 'none' || !cfg.spin ? 0 : cfg.spin === 'top' ? 1 : cfg.spin === 'slice' ? -1 : pick([-1, 0, 1]);
  const spinAmt = spin > 0 ? { serve:600, drive:TUNE.driveSpin, drop:500, dink:300, lob:800 }[kind] : spin < 0 ? TUNE.sliceSpin : 0;
  const v = launchFor(kind, from, tx, ty, { speedK:PACE[cfg.pace] || 1, spin:spin*spinAmt*RPM });
  Object.assign(B, from, v, { live:true, bounces:0, lastBy:null, lastKind:'feed:' + kind, serve:null, still:0, trail:[] });
  Object.assign(G.cannon, from, { kick:1, kind });
  G.shotN++; G.hits = 1; G.rally = 0; sfx('drive', 0.7);
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
// ---------------- the game's own clock: what happens between points
function refereeStep(dt){
  if (G.mode !== 'game') {
    if (G.state === 'dead' || G.state === 'feed') { G.stT -= dt; if (G.stT <= 0) { feedBall(G.feedTo); G.state = 'play'; } }
    return;
  }
  if (G.state === 'set') return serveSetup(dt);
  if (G.state === 'serve') return holdServe(dt);
  if (G.state === 'dead') {
    G.stT -= dt;
    if (G.stT <= 0) {
      if (G.pendingSwitch) { switchEnds(); G.pendingSwitch = false; }
      startPoint();
    }
  } else if (G.state === 'over') {
    G.stT -= dt;
    if (G.stT <= 0) { G.state = 'end'; if (G.attract) startAttract(); else if (typeof showResults === 'function') showResults(); }
  }
}
// change ends: the teams swap halves, everyone mirrors across the net
function switchEnds(){
  G.near = other(G.near);
  for (const pl of G.players) { pl.x = CW - pl.x; pl.y = CL - pl.y; pl.vx = -pl.vx; pl.vy = -pl.vy; pl.face += Math.PI; }
  G.flipT = 0;   // the views cut to the new end
}
