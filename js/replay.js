// Pickle Pirates · Instant replay: after a great point, the last few seconds play back at half speed from the side.
// The sim records a light snapshot every frame of a game rally (the ball, each player's position, facing and swing, and
// the hazards). A replay freezes the sim, lays each recorded frame over the live state for the views to draw, and puts
// everything back when it's done. Any shot button, A, Enter or a tap skips it. Replays can be switched off (A11Y.replay).
'use strict';
const REPLAY_SECS = 5, REPLAY_SPEED = 0.5, REPLAY_MAX = 60*40, REPLAY_GAP = 4;   // seconds shown, speed, frames kept, rallies between replays
let replayRec = [];
const PL_KEYS = ['x', 'y', 'face', 'vx', 'vy', 'hit', 'wind', 'lunge', 'lungeSide', 'split', 'stun', 'swing', 'queue'];
const BALL_KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'live', 'bounces', 'carried', 'lastBy', 'lastKind', 'cannonShot', 'fogShot'];
const pickKeys = (o, keys) => { const r = {}; for (const k of keys) r[k] = o[k]; return r; };
function hazSnap(){
  const H = G.haz; if (!H) return null;
  return { kind:H.kind, gull:H.gull && { ...H.gull }, zones:H.zones.map(z => ({ ...z })), tents:H.tents.map(t => ({ ...t })), fog:H.fog.map(f => ({ ...f })) };
}
function snapshot(){
  return { t:G.time, ball:pickKeys(G.ball, BALL_KEYS), pl:G.players.map(p => pickKeys(p, PL_KEYS)), haz:hazSnap(), rally:G.rally, landing:null };
}
function applySnap(s){
  G.time = s.t; Object.assign(G.ball, s.ball); G.players.forEach((p, i) => Object.assign(p, s.pl[i]));
  if (s.haz && G.haz) { const H = G.haz; H.gull = s.haz.gull; H.zones = s.haz.zones; H.tents = s.haz.tents; H.fog = s.haz.fog; }
  G.rally = s.rally;
}
// every frame of a game: keep the rally (and a moment after it ends)
function replayRecord(){
  if (!G || G.attract || G.mode !== 'game' || G.replay) return;
  if (G.state === 'set') { replayRec = []; return; }
  if (G.state !== 'play' && G.state !== 'serve' && !((G.state === 'dead' || G.state === 'over') && G.lastPoint && G.time - G.lastPoint.t < 0.9)) return;   // a beat after the point
  replayRec.push(snapshot()); if (replayRec.length > REPLAY_MAX) replayRec.shift();
}
// a point just ended: is it worth a replay? (a long rally, or a smash that wasn't returned)
function replayWorth(winner, kind){
  if (!G || G.attract || G.mode !== 'game' || A11Y.replay === false) return null;
  const S = G.match; if (!S || S.rallies - (G.replayLast ?? -99) < REPLAY_GAP) return null;   // spaced out, per match
  if (G.rally >= 12) return { title:'What a rally!', sub:`${G.rally} shots` };
  if (kind === 'double bounce' && G.lastShot && G.lastShot.kind === 'smash' && G.lastShot.team === winner) return { title:'Smash!', sub:`${teamName(winner)} put it away` };
  return null;
}
function replayQueue(winner, kind){
  const w = replayWorth(winner, kind); if (!w) return;
  G.replayWant = { ...w, at:G.time + 0.9 }; G.replayLast = G.match.rallies;
}
// called by the frame loop before the sim: start a queued replay, or run the one playing. Returns true while one plays.
function replayTick(dt){
  if (!G || G.attract) return false;
  if (!G.replay && G.replayWant && G.time >= G.replayWant.at && replayRec.length > 30 && (G.state === 'dead' || G.state === 'over')) startReplay();
  const R = G.replay; if (!R) return false;
  R.f += dt*60*REPLAY_SPEED;
  const i = Math.floor(R.f);
  if (i >= R.frames.length - 1) { endReplay(); return false; }
  applySnap(R.frames[i]);
  G.ball.trail = R.frames.slice(Math.max(0, i - 13), i + 1).map(s => [s.ball.x, s.ball.y, s.ball.z]);
  return true;
}
function startReplay(){
  const W = G.replayWant; G.replayWant = null;
  const n = Math.min(replayRec.length, Math.round(REPLAY_SECS*60));
  G.replay = { frames:replayRec.slice(-n), f:0, live:snapshot(), liveTrail:G.ball.trail, liveState:G.state, title:W.title, sub:W.sub, banner:G.banner };
  G.banner = null;
  if (typeof band === 'function') band('rally', 0.3);
}
function endReplay(){
  const R = G.replay; if (!R) return;
  applySnap(R.live); G.ball.trail = R.liveTrail || []; G.replay = null; replayRec = [];
}
// skip: any shot button, A, Enter or a tap
function skipReplay(){ if (G && G.replay) { endReplay(); return true; } return false; }
