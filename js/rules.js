// Pickle Pirates · Rules engine: scoring, serving, the two-bounce rule, the kitchen and ends.
// Pure functions over a score object and court positions, so tests/rules.mjs can check every rule without a page.
// Follows the 2026 official rulebook (USA Pickleball text): traditional side-out scoring by default (4.A, 4.B),
// rally scoring as an option (14.A, provisional). Singles and doubles.
//
// Doubles positions follow the starting-server rule: each team has a starting server (team slot 0 here), who stands in
// the right court whenever the team's score is even and the left when it's odd. So the serving team swaps sides only
// when it scores, and the receiving team never swaps (it can't score in side-out scoring).
//   Side-out scoring: the game starts 0-0-2 (one server before the first side out). Losing a rally on serve passes the
//   serve to the partner (server 2), then over to the other team (a side out), where the player in the right court
//   serves first. The score call is three numbers: serving team, receiving team, server number.
//   Rally scoring: every rally scores, one server per side out: the team that wins the serve scores, and the player
//   then in its right court serves. Two-number call.
'use strict';
const GAME_TO = [11, 15, 21];
const SWITCH_AT = { 11:6, 15:8, 21:11 };          // ends change when the first side reaches this score (21.B)
const RULE_GRACE = 0.02;                          // the contact patch: touching a line counts as touching it
const FOOT_R = 0.35;                              // a foot touching the kitchen line is in the kitchen
const MOMENTUM_T = 0.5;                           // after a volley, carried into the kitchen within this long = fault

function newScore(opt = {}){
  const to = GAME_TO.includes(opt.to) ? opt.to : 11, scoring = opt.scoring === 'rally' ? 'rally' : 'sideout', doubles = !!opt.doubles;
  const S = { to, winBy:2, scoring, doubles, server: opt.server || 'home',
    pts:{ home:0, away:0 }, switchAt:SWITCH_AT[to], switched:false, over:false, winner:null, rallies:0, sideOuts:0 };
  if (doubles) { S.start = { home:0, away:0 }; S.srv = S.start[S.server]; S.serverNum = scoring === 'sideout' ? 2 : 1; }   // 0-0-2
  return S;
}
const otherTeam = tm => tm === 'home' ? 'away' : 'home';
// doubles: which team slot (0 or 1) stands in this team's right court: the starting server when the score is even
const rightSlot = (S, tm) => S.pts[tm] % 2 === 0 ? S.start[tm] : 1 - S.start[tm];
// the court the server serves from. Singles: right on an even score, left on odd (4.B). Doubles: wherever the server stands.
const serverCourt = S => !S.doubles ? (S.pts[S.server] % 2 === 0 ? 'right' : 'left') : S.srv === rightSlot(S, S.server) ? 'right' : 'left';
// doubles: the receiver is the player in the receiving team's court diagonally across, which has the same name
const receiverSlot = S => { const rec = otherTeam(S.server), r = rightSlot(S, rec); return serverCourt(S) === 'right' ? r : 1 - r; };
// the score call: serving side first; side-out doubles adds the server number
const scoreCall = S => `${S.pts[S.server]}–${S.pts[otherTeam(S.server)]}` + (S.doubles && S.scoring === 'sideout' ? `–${S.serverNum}` : '');
// a rally is over: who won it. Returns what happened, for the referee to announce.
function awardRally(S, winner){
  if (S.over) return { scored:false, sideOut:false, switchEnds:false, gameOver:true };
  S.rallies++;
  let scored = false, sideOut = false, secondServer = false;
  if (S.scoring === 'rally') { S.pts[winner]++; scored = true; if (winner !== S.server) { S.server = winner; sideOut = true; } }
  else if (winner === S.server) { S.pts[winner]++; scored = true; }   // side-out scoring: only the serving side scores
  else if (S.doubles && S.serverNum === 1) { S.serverNum = 2; S.srv = 1 - S.srv; secondServer = true; }   // the partner serves
  else { S.server = winner; sideOut = true; }
  if (sideOut) { S.sideOuts++; if (S.doubles) { S.srv = rightSlot(S, S.server); S.serverNum = 1; } }
  const lead = S.pts[winner] - S.pts[otherTeam(winner)];
  const gameOver = scored && S.pts[winner] >= S.to && lead >= S.winBy;
  if (gameOver) { S.over = true; S.winner = winner; }
  let switchEnds = false;
  if (!gameOver && !S.switched && Math.max(S.pts.home, S.pts.away) >= S.switchAt) { S.switched = true; switchEnds = true; }
  return { scored, sideOut, secondServer, switchEnds, gameOver };
}
// one point from winning (and it's theirs to win: in side-out scoring only the server can score)
function gamePoint(S){
  for (const tm of ['home', 'away']) {
    const a = S.pts[tm] + 1, b = S.pts[otherTeam(tm)];
    if (a >= S.to && a - b >= S.winBy && (S.scoring === 'rally' || S.server === tm)) return tm;
  }
  return null;
}

// ---------------- court geometry, with either team on either half (near = the half where y > NETY)
// a player facing the net from the near half has +x on their right; from the far half, −x.
// service courts by the receiver's own right/left: the receiver stands diagonally across from the server.
function serviceBox(receiverNear, court){
  const right = receiverNear ? court === 'right' : court === 'left';   // "right" for a near-side player is x > CW/2
  const x0 = right ? CW/2 : 0, x1 = right ? CW : CW/2;
  return receiverNear ? { x0, x1, y0:NETY + KD, y1:CL } : { x0, x1, y0:0, y1:NETY - KD };
}
// where a served ball first lands: 'in', 'short' (on or inside the kitchen line), or 'out' (long, wide, wrong court)
function serveResult(x, y, receiverNear, court){
  const b = serviceBox(receiverNear, court), g = RULE_GRACE;
  const pastKitchen = receiverNear ? y > b.y0 + g : y < b.y1 - g;       // the kitchen line is part of the kitchen
  const inBox = x >= b.x0 - g && x <= b.x1 + g && (receiverNear ? y <= b.y1 + g : y >= b.y0 - g);
  if (inBox && pastKitchen) return 'in';
  const inKitchenSide = x >= b.x0 - g && x <= b.x1 + g && (receiverNear ? y > NETY && y <= b.y0 + g : y < NETY && y >= b.y1 - g);
  return inKitchenSide ? 'short' : 'out';
}
// where the server and receiver stand for a serve from `court`
function servePositions(serverNear, court){
  const sRight = serverNear ? court === 'right' : court === 'left';
  const sx = sRight ? CW*0.75 : CW*0.25, rx = CW - sx;   // the receiver is diagonally across
  return { server:{ x:sx, y: serverNear ? CL + 0.9 : -0.9 }, receiver:{ x:rx, y: serverNear ? -1.2 : CL + 1.2 } };
}
// doubles: everyone's spot for a serve from `court`. The server's partner waits on the baseline (the return has to
// bounce), the receiver's partner at the kitchen line. Each player holds the lane (court half) they start the point in.
function servePositionsD(serverNear, court){
  const sRight = serverNear ? court === 'right' : court === 'left';
  const sx = sRight ? CW*0.75 : CW*0.25, ox = CW - sx;
  const sy = serverNear ? CL + 0.9 : -0.9, ry = serverNear ? -1.2 : CL + 1.2, ky = serverNear ? NETY - KD - 0.9 : NETY + KD + 0.9;
  return { server:{ x:sx, y:sy }, serverMate:{ x:ox, y:sy + (serverNear ? -0.4 : 0.4) }, receiver:{ x:ox, y:ry }, receiverMate:{ x:sx, y:ky } };
}
// the two-bounce rule (10.A): the serve and the return must bounce. strokeIdx counts the serve as 0.
const twoBounceFault = (strokeIdx, volley) => volley && strokeIdx <= 2;
// standing in (or on the line of) the kitchen, within the sidelines
const inKitchenZone = (x, y) => Math.abs(y - NETY) < KD + FOOT_R && x > -FOOT_R && x < CW + FOOT_R;
// a volley while touching the kitchen, or carried into it by the volley's momentum (11.A)
const kitchenFault = (volley, inKitchen) => !!volley && !!inKitchen;
