// Pickle Pirates · The CPU: reads the ball, picks a spot on the court, picks a shot, and serves.
// Three tiers that lose in believable ways: slower reads and first steps, rushed or early swings, popped-up dinks,
// attacking balls that are too low, staying back when they should come in.
'use strict';
// react: seconds before the first step after the other side hits · speed: share of top run speed
// read: feet of error in where it thinks the ball will be (shrinks as the ball arrives) · press/pressSd: when it presses the shot
// skill: shot quality multiplier · iq: chance of the right shot for the situation · attack: goes after high balls
// net: comes in to the kitchen line · popup: dinks float up · lob: lobs a net player · whiff: misreads the ball entirely
// serve: serve quality · deep: how deep it aims (feet in from the baseline)
const AI_TIERS = {
  deckhand:{ name:'Deckhand', react:0.2,  speed:0.92, read:0.8, press:[0.08, 0.65], pressSd:0.18, skill:0.88, iq:0.55, attack:0.5,  net:0.35, popup:0.25, lob:0.12, whiff:0.02,  serve:0.88, deep:[4, 9] },
  bosun:   { name:'Bosun',    react:0.15, speed:0.97, read:0.45, press:[0.12, 0.5], pressSd:0.1,  skill:0.93, iq:0.78, attack:0.7,  net:0.75, popup:0.1,  lob:0.09, whiff:0.008, serve:0.94, deep:[3, 7] },
  captain: { name:'Captain',  react:0.1,  speed:1.0,  read:0.2, press:[0.15, 0.42], pressSd:0.05, skill:0.98, iq:0.93, attack:0.85, net:0.9,  popup:0.03, lob:0.06, whiff:0.003, serve:0.97, deep:[2, 5] },
};
const AI_ORDER = ['deckhand', 'bosun', 'captain'];
const tierOf = pl => AI_TIERS[pl.tier] || AI_TIERS.bosun;
// court helpers from this player's point of view: depth = feet from their own baseline toward the net
const ownY = (pl, depth) => isNear(pl.team) ? CL - depth : depth;
const oppY = (pl, depth) => isNear(pl.team) ? depth : CL - depth;          // depth from the other baseline
const depthOf = (tm, y) => isNear(tm) ? CL - y : y;
const atNet = (tm, y) => Math.abs(y - NETY) <= KD + 3;

function aiPlayer(pl, dt){
  const B = G.ball, ai = pl.ai, T = tierOf(pl);
  pl.speedK = T.speed;
  if (G.mode === 'practice' && G.cfg.opp === 'none' && pl.team === 'away') {   // cannon only: lean on the far post and watch
    const dx = -3.2 - pl.x, dy = NETY + backDir(pl.team)*3 - pl.y, d = hyp(dx, dy);
    movePlayer(pl, d > 0.3 ? dx/d : 0, d > 0.3 ? dy/d : 0, dt);
    if (d < 0.5) pl.face = Math.atan2(B.y - pl.y, B.x - pl.x);
    return;
  }
  const incoming = ballFor(pl, B);
  // a new ball on its way: roll this ball's read error, reaction and press timing
  if (incoming && ai.rollFor !== G.shotN) {
    ai.rollFor = G.shotN;
    ai.react = T.react*(0.75 + Math.random()*0.5) + (hyp(B.vx, B.vy) > 60 ? 0.05 : 0);
    const a = Math.random()*Math.PI*2, e = T.read*(0.4 + Math.random()*0.6);
    ai.err = [Math.cos(a)*e, Math.sin(a)*e];
    ai.pressAt = Math.random() < T.whiff ? -1 : clamp(rand(T.press[0], T.press[1]) + gauss()*T.pressSd, 0.02, 1.0);
    ai.plan = null; ai.think = 0;
  }
  ai.think -= dt;
  if (ai.react > 0) ai.react -= dt;
  if (ai.think <= 0) {
    ai.think = 0.1;
    if (incoming) {
      pl.spot = contactSpot(pl, B); pl.spotAt = G.time;
      if (pl.spot) { const k = Math.min(1, pl.spot.t/0.8); ai.tx = pl.spot.x + ai.err[0]*k; ai.ty = pl.spot.y + ai.err[1]*k; }
    } else { pl.spot = null; const p = readySpot(pl); ai.tx = p.x; ai.ty = p.y; }
  }
  // move: hold still through the reaction time, then go
  let ix = 0, iy = 0;
  if (!(incoming && ai.react > 0)) {
    const dx = ai.tx - pl.x, dy = ai.ty - pl.y, d = hyp(dx, dy);
    const k = d > 0.3 ? Math.min(1, d/1.5) : 0;
    if (d) { ix = dx/d*k; iy = dy/d*k; }
  }
  [ix, iy] = kitchenGuard(pl, ix, iy);
  movePlayer(pl, ix, iy, dt);
  // press the shot a little before the ball arrives
  if (incoming && !pl.queue && pl.spot && ai.pressAt > 0 && pl.spot.t - (G.time - pl.spotAt) <= ai.pressAt) {
    const plan = chooseShot(pl, pl.spot);
    const tired = clamp((G.hits - 24)/50, 0, 0.2);   // a very long rally wears on the crew: shots get looser
    queueShot(pl, plan.kind, { skill:T.skill*(1 - tired), target:plan.target, mod:plan.mod, arcK:plan.arcK });
    ai.lastPlan = plan;
  }
}
// where to wait while the ball is on the other side: baseline or kitchen line, bisecting the other player's angles
function readySpot(pl){
  const ai = pl.ai, opp = G.players.find(p => p.team !== pl.team), B = G.ball;
  // the server stays back until the return has bounced (two-bounce rule); otherwise come in when the plan says so
  const serving = G.mode === 'game' && G.match && G.match.server === pl.team && G.hits <= 2;
  const up = ai.goNet && !serving;
  const depth = up ? KD + 0.8 : -1.0;
  const ref = B.live && B.lastBy === pl.team ? B.x : opp ? opp.x : CW/2;   // the ball's heading over there: shade toward it
  return { x: clamp(CW/2 + (ref - CW/2)*0.38, 2, CW - 2), y: ownY(pl, depth) };
}
// the shot for this ball: by contact height, where everyone is, and the tier's judgment
function chooseShot(pl, spot){
  const T = tierOf(pl), ai = pl.ai, opp = G.players.find(p => p.team !== pl.team);
  const h = spot.bz, fromNet = Math.abs(spot.by - NETY), oppUp = opp && atNet(opp.team, opp.y);
  const smart = Math.random() < T.iq, r = Math.random();
  const open = () => opp && opp.x > CW/2 ? rand(1.8, 6.5) : rand(CW - 6.5, CW - 1.8);   // away from the other player
  const feet = () => clamp((opp ? opp.x : CW/2) + rand(-1.5, 1.5), 1.5, CW - 1.5);
  const T_ = (x, depth) => ({ x: clamp(x, 1.2, CW - 1.2), y: oppY(pl, clamp(depth, 1, NETY - 0.8)) });
  let kind, target, mod = null, arcK = 1;
  const returnOfServe = G.mode === 'game' && G.hits === 1, third = G.mode === 'game' && G.hits === 2;
  if (h > NET_H_MID + 1.8 && fromNet < 18 && Math.random() < T.attack) {
    // put it away: at the feet of a net player, else into the open court
    kind = 'drive'; target = oppUp ? T_(feet(), NETY - KD - rand(0.5, 2.5)) : T_(open(), rand(3, 9)); mod = 'top';
  } else if (fromNet <= KD + 2) {
    // at the kitchen line: the longer the dink rally, the more tempting a speed-up gets
    const pressure = clamp((G.rally - 6)/12, 0, 0.6);
    ai.goNet = Math.random() < 0.4 + T.net*0.6;   // up here already: the better crews hold the line, the deckhand sometimes drifts back
    if (h > NET_H_MID + 0.4 - pressure*0.6 && Math.random() < T.attack*(0.5 + pressure)) { kind = 'drive'; target = T_(feet(), NETY - KD - rand(0, 3)); }   // speed-up
    else if (oppUp && Math.random() < T.lob*0.6) { kind = 'lob'; target = T_(open(), rand(1.5, 4)); }
    else { kind = 'soft'; target = T_(smart ? (r < 0.6 ? (pl.x < CW/2 ? rand(13, 18) : rand(2, 7)) : open()) : rand(3, 17), rand(16, 20.5)); arcK = Math.random() < T.popup ? 2.4 : 1; }
    if (!smart && Math.random() < 0.3) { kind = 'drive'; target = T_(rand(3, 17), rand(4, 10)); }   // a speed-up off a ball that's too low
  } else if (returnOfServe) {
    // the return: deep, then come in
    kind = 'drive'; target = T_(rand(3, 17), rand(T.deep[0], T.deep[1]));
    ai.goNet = Math.random() < T.net;
  } else if (oppUp) {
    // they're at the net and we're back: drop it in, lob over, or try to pass
    if (smart && (third || r < 0.7)) { kind = 'soft'; target = T_(rand(3, 17), rand(15.6, 18.6)); arcK = Math.random() < T.popup ? 1.8 : 1; ai.goNet = Math.random() < T.net; }
    else if (Math.random() < T.lob*2) { kind = 'lob'; target = T_(open(), rand(1.5, 4)); }
    else { kind = 'drive'; target = T_(open(), rand(2, 8)); }
  } else {
    // both back: drive deep, or drop and come in
    if (smart && r < 0.4) { kind = 'soft'; target = T_(rand(3, 17), rand(15.6, 18.6)); ai.goNet = Math.random() < T.net; }
    else { kind = 'drive'; target = T_(open(), rand(T.deep[0], T.deep[1] + 2)); if (Math.random() < T.net*0.5) ai.goNet = true; }
  }
  // lobbed or pushed back deep: give up the net for now
  if (fromNet > 14 && G.ball.lastKind === 'lob') ai.goNet = false;
  return { kind, target, mod, arcK };
}
// the CPU's serve: deep, mostly to the backhand side for the better tiers
function aiServe(pl){
  const T = tierOf(pl), r = Math.random();
  const kind = pl.tier === 'deckhand' ? (r < 0.6 ? 'soft' : r < 0.9 ? 'drive' : 'lob') : r < 0.65 ? 'drive' : r < 0.92 ? 'soft' : 'lob';
  const rec = G.players.find(p => p.team !== pl.team);
  // the better tiers go deep to the backhand; the deckhand just gets it in
  const xk = T.iq > 0.8 ? -handOf(rec)*rand(0.3, 0.9) : rand(-0.6, 0.6), depth = rand(T.deep[0], T.deep[1]);
  pl.ai.goNet = false;
  return doServe(pl, kind, null, { xk, depth });
}
// a new point: forget the old plan
function aiNewPoint(pl){ pl.ai.goNet = false; pl.ai.rollFor = -1; pl.ai.plan = null; }
