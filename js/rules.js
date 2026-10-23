// Pickle Pirates · Rules engine: scoring, serving, the two-bounce rule, the kitchen and ends.
// Pure functions over a score object and court positions, so tests/rules.mjs can check every rule without a page.
// Follows the 2026 official rulebook (USA Pickleball text): traditional side-out scoring by default (4.A, 4.B),
// rally scoring as an option (14.A, provisional). Singles for now; doubles' server rotation arrives with milestone 7.
'use strict';
const GAME_TO = [11, 15, 21];
const SWITCH_AT = { 11:6, 15:8, 21:11 };          // ends change when the first side reaches this score (21.B)
const RULE_GRACE = 0.02;                          // the contact patch: touching a line counts as touching it
const FOOT_R = 0.35;                              // a foot touching the kitchen line is in the kitchen
const MOMENTUM_T = 0.5;                           // after a volley, carried into the kitchen within this long = fault

function newScore(opt = {}){
  const to = GAME_TO.includes(opt.to) ? opt.to : 11;
  return { to, winBy:2, scoring: opt.scoring === 'rally' ? 'rally' : 'sideout', server: opt.server || 'home',
    pts:{ home:0, away:0 }, switchAt:SWITCH_AT[to], switched:false, over:false, winner:null, rallies:0, sideOuts:0 };
}
const otherTeam = tm => tm === 'home' ? 'away' : 'home';
// singles: the server serves from the right court when their own score is even, the left when it's odd (4.B)
const serverCourt = S => S.pts[S.server] % 2 === 0 ? 'right' : 'left';
// the score call: server's score first (singles: two numbers)
const scoreCall = S => `${S.pts[S.server]}–${S.pts[otherTeam(S.server)]}`;
// a rally is over: who won it. Returns what happened, for the referee to announce.
function awardRally(S, winner){
  if (S.over) return { scored:false, sideOut:false, switchEnds:false, gameOver:true };
  S.rallies++;
  let scored = false, sideOut = false;
  if (S.scoring === 'rally') { S.pts[winner]++; scored = true; if (winner !== S.server) { S.server = winner; sideOut = true; } }
  else if (winner === S.server) { S.pts[winner]++; scored = true; }   // side-out scoring: only the serving side scores
  else { S.server = winner; sideOut = true; }
  if (sideOut) S.sideOuts++;
  const lead = S.pts[winner] - S.pts[otherTeam(winner)];
  const gameOver = scored && S.pts[winner] >= S.to && lead >= S.winBy;
  if (gameOver) { S.over = true; S.winner = winner; }
  let switchEnds = false;
  if (!gameOver && !S.switched && Math.max(S.pts.home, S.pts.away) >= S.switchAt) { S.switched = true; switchEnds = true; }
  return { scored, sideOut, switchEnds, gameOver };
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
// the two-bounce rule (10.A): the serve and the return must bounce. strokeIdx counts the serve as 0.
const twoBounceFault = (strokeIdx, volley) => volley && strokeIdx <= 2;
// standing in (or on the line of) the kitchen, within the sidelines
const inKitchenZone = (x, y) => Math.abs(y - NETY) < KD + FOOT_R && x > -FOOT_R && x < CW + FOOT_R;
// a volley while touching the kitchen, or carried into it by the volley's momentum (11.A)
const kitchenFault = (volley, inKitchen) => !!volley && !!inKitchen;
