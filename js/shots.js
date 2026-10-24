// Pickle Pirates · Shot model: the contact window, the auto-timed swing, shot quality, errors and aim
// You pick the shot (drive, soft, lob) and where it goes; the game swings at the best moment.
// How early you pressed, how high and how far away the ball is, how fast it's coming and how fast you're running
// set the shot's quality, and quality sets how far the shot strays from where you aimed.
'use strict';
const SHOT_SOUND = { drive:'drive', smash:'smash', dink:'paddle', drop:'paddle', lob:'paddle', serve:'drive', pop:'paddle' };
const SHOT_NAME = { drive:'Drive', smash:'Smash', dink:'Dink', drop:'Drop', lob:'Lob', pop:'Mishit' };
// the first two shots of a rally (serve and return) must bounce before they're hit
const mustBounce = () => G.cfg.twoBounce !== false && G.hits <= 2;
const handOf = pl => isNear(pl.team) ? 1 : -1;   // the forehand side, in court x, for a player facing the net

// how well can `pl` hit a ball at (x, y, z)? 0 = out of reach. bounced: has it bounced on this side yet?
function contactQ(pl, x, y, z, bounced, px = pl.x, py = pl.y){
  if (sideOf(y) !== pl.team) return null;
  if (!bounced && mustBounce()) return null;
  const d = hyp(x - px, y - py), R = TUNE.reach, RL = R + TUNE.lungeReach;
  if (d > RL || z < 0.22 || z > 8.6) return null;
  // distance: jammed up close, comfortable, stretched, lunging
  const dq = d < 0.5 ? 0.6 : d <= R*0.8 ? 1 : d <= R ? 1 - 0.35*(d - R*0.8)/(R*0.2) : 0.5 - 0.2*(d - R)/Math.max(0.01, RL - R);
  // height: dug off the court, waist-high sweet spot, high, overhead
  const hq = z < 0.8 ? 0.45 + 0.4*(z - 0.22)/0.58 : z <= 4 ? 1 : z <= 6 ? 1 - 0.2*(z - 4)/2 : 0.8 - 0.25*(z - 6)/2.6;
  return { q:dq*hq, d, lunge: d > R, side: (x - px)*handOf(pl) >= 0 ? 1 : -1, volley:!bounced };
}
// timing: pressed tau seconds before contact
function timingQ(tau){
  if (tau >= TUNE.sweetLate && tau <= TUNE.sweetEarly) return { k:1, grade:'perfect' };
  if (tau < TUNE.sweetLate) return { k:0.55 + 0.45*tau/Math.max(0.01, TUNE.sweetLate), grade:'late' };
  return { k:Math.max(0.4, 1 - 0.6*(tau - TUNE.sweetEarly)/0.5), grade:'early' };
}
// press a shot button: the shot waits (up to queueTime) for the best moment to swing
function queueShot(pl, kind, opt = {}){
  pl.queue = { kind, t:0, hold:!!opt.hold, power:0, aim:opt.aim || null, mod:opt.mod || null, skill:opt.skill ?? 1, target:opt.target || null, arcK:opt.arcK || 1 };
}
function releaseShot(pl){ if (pl.queue) pl.queue.hold = false; }
// the ball can be hit by this player right now (and isn't theirs to leave)
function ballFor(pl, B){ return B.live && B.lastBy !== pl.team && (B.lastBy || G.feedTo === pl.team); }
// best contact over the next half second, from where the player is (and drifting the way they're moving)
function bestAhead(pl, B){
  const pr = predict(B, 0.55, BALL_DT, 4); let best = null;
  for (const p of pr.pts) {
    if (p.t < 1/60) continue;
    const k = Math.min(p.t, 0.25), c = contactQ(pl, p.x, p.y, p.z, B.bounces > 0 || p.bounced, pl.x + pl.vx*k, pl.y + pl.vy*k);
    if (c && (!best || c.q > best.q + 0.02)) best = { ...c, t:p.t };
  }
  return best;
}
// per frame, for each player holding a queued shot
function shotTick(pl, dt){
  const Q = pl.queue; if (!Q) return;
  Q.t += dt;
  if (Q.hold && Q.kind === 'drive') Q.power = Math.min(1, Q.power + dt/TUNE.holdTime);
  const B = G.ball;
  if (ballFor(pl, B)) {
    let now = contactQ(pl, B.x, B.y, B.z, B.bounces > 0);
    if (now && now.volley && !pl.human && G.cfg.kitchen !== false && inKitchenZone(pl.x, pl.y)) now = null;   // the CPU lets it bounce rather than fault
    if (now) {
      const ahead = bestAhead(pl, B);
      // swing now unless a clearly better contact is coming before the press runs out
      if (!ahead || now.q >= ahead.q - 0.04 || Q.t + ahead.t > TUNE.queueTime) { strike(pl, Q, now); return; }
    }
  }
  if (Q.t > TUNE.queueTime) { pl.queue = null; pl.swing = 0.28; pl.swingKind = Q.kind; if (pl.human && ballFor(pl, B)) grade(pl, 'early', 'TOO EARLY'); }
}
function grade(pl, g, text){
  if (!pl.human || G.attract) return;
  const col = { perfect:'#74d38f', early:'#ffc23a', late:'#ffc23a', stretch:'#ff9a50', mishit:'#ff5a3c' }[g] || '#ffc23a';
  G.pops.push({ text:text || g.toUpperCase(), x:pl.x, y:pl.y, life:0.75, max:0.75, size:13, color:col, lift:3 });
  G.lastGrade = g;
}
// the hit itself
function strike(pl, Q, c){
  const B = G.ball, opp = G.players.find(p => p.team !== pl.team);
  pl.queue = null;
  // an illegal stroke (two-bounce or kitchen volley) is a fault on contact: the rally ends there and doesn't count it
  if (strokeRules(pl, c)) { pl.swing = 0.28; pl.swingKind = Q.kind === 'soft' ? 'dink' : Q.kind; pl.swingSide = c.side; return true; }
  // what the button becomes here: high balls near the net get smashed, soft is a dink up close and a drop from back
  let kind = Q.kind;
  const fromNet = Math.abs(B.y - NETY);
  if (kind === 'drive' && B.z > 5.2 && fromNet < 20) kind = 'smash';
  if (kind === 'soft') kind = fromNet <= KD + 3 ? 'dink' : 'drop';
  // quality
  const tq = timingQ(Q.t), inSpeed = hyp(B.vx, B.vy, B.vz)/MPH;
  const paceQ = inSpeed < 30 ? 1 : Math.max(0.55, 1 - 0.45*(inSpeed - 30)/30);
  const moveQ = hyp(pl.vx, pl.vy) > 10 ? 0.85 : 1;
  const powerK = kind === 'drive' ? 0.92 + 0.22*Q.power : 1;
  let q = clamp(c.q*tq.k*paceQ*moveQ*Q.skill, 0, 1);
  if (kind === 'drive') q *= 1 - 0.25*Q.power;   // swinging harder is riskier
  // aim, then stray from it
  const t = Q.target && kind !== 'smash' ? Q.target : shotTarget(pl, kind, Q.aim, opp);   // the CPU picks its own spot
  const spread = (1 - q)*(1 - 0.6*TUNE.forgive);
  let tx = t.x + gauss()*(0.35 + 7*spread), ty = t.y + gauss()*(0.35 + 6*spread);
  // soft shots off poor contact float up (an attackable ball) or dump short
  const softSpray = (kind === 'dink' || kind === 'drop') ? Math.max(0.4, 1 + gauss()*2.2*spread) : 1;
  const from = { x:B.x, y:B.y, z:Math.max(B.z, 0.3) };
  if (q < 0.25 && Math.random() < 0.6) {   // mishit: frames it into the net or floats a sitter
    kind = 'pop';
    if (Math.random() < 0.45) { tx = B.x + rand(-2, 2); ty = NETY + backDir(pl.team)*1.5; }
    else { tx = rand(3, CW - 3); ty = isNear(pl.team) ? rand(NETY - 12, NETY - 5) : rand(NETY + 5, NETY + 12); }
  }
  const v = launchFor(kind, from, tx, ty, { spin:spinFor(kind, Q.mod), speedK:powerK*(1 + gauss()*0.04*spread), arcK:(Q.arcK || 1)*softSpray });
  Object.assign(B, v, { z:from.z, bounces:0, lastBy:pl.team, lastKind:kind, still:0 });
  // body: face the shot, swing on the side the ball was on, lunge if stretched
  pl.face = Math.atan2(ty - pl.y, tx - pl.x); pl.swing = 0.28; pl.swingKind = kind; pl.swingSide = c.side;
  if (c.lunge) { pl.lunge = 0.45; pl.lungeSide = c.side; }
  // the other side split-steps as the ball is struck
  if (opp) { opp.split = 0.18; opp.burst = 0.5; }
  G.rally++; G.best = Math.max(G.best, G.rally);
  if (G.rally === 14 && G.mode === 'game') band('rally');   // a long rally: the band picks up
  G.shotN++; G.hits++; G.stats.strokes++;
  G.lastShot = { team:pl.team, kind, q, grade:tq.grade, volley:c.volley, power:Q.power };
  sfx(SHOT_SOUND[kind] || 'paddle', kind === 'pop' ? 0.5 : 1);
  if (kind === 'pop') grade(pl, 'mishit');
  else if (c.lunge) grade(pl, 'stretch', 'STRETCH');
  else grade(pl, tq.grade);
  if (kind === 'smash' && !G.attract) call('smash', B.x, B.y, 'winner', true);
  return true;
}
// spin modifiers held while hitting: 'top' rolls it over, 'slice' cuts under
function spinFor(kind, mod){
  if (kind === 'pop') return 0;
  if (mod === 'slice') return -TUNE.sliceSpin*RPM;
  if (mod === 'top') return ({ drive:TUNE.driveSpin*1.5, smash:900, dink:400, drop:600, lob:900 }[kind] || 0)*RPM;
  return undefined;   // the shape's own default
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
// where the shot goes. depth = feet in front of the far baseline. aim = [x, y] in court directions; centered = auto-aim
function shotTarget(pl, kind, aim, opp){
  const s = isNear(pl.team) ? 1 : -1;   // +1: shooting at the far half
  const base = { drive:[3, 7], smash:[6, 13], dink:[16, 20.5], drop:[15.6, 18.6], lob:[1.8, 4.5], serve:[3, 9], pop:[8, 14] }[kind] || [4, 8];
  let d = rand(base[0], base[1]), x;
  if (aim && (aim[0] || aim[1])) {
    // manual: the stick picks the spot; aim assist pulls it back inside the lines
    x = CW/2 + aim[0]*(CW/2);
    d = d + aim[1]*s*(kind === 'dink' || kind === 'drop' ? 2.5 : 5);
    const safeX = clamp(x, 2, CW - 2), safeD = clamp(d, kind === 'dink' || kind === 'drop' ? NETY - KD + 0.8 : 1.8, NETY - 1.2);
    x += (safeX - x)*TUNE.aimAssist; d += (safeD - d)*TUNE.aimAssist;
  } else {
    // auto: away from the opponent, inside the lines
    const ox = opp ? opp.x : CW/2;
    x = ox < CW/2 ? rand(CW/2 + 1.5, CW - 2) : rand(2, CW/2 - 1.5);
    if (kind === 'dink') x = clamp(pl.x + rand(-6, 6), 2.5, CW - 2.5);
  }
  return { x, y: isNear(pl.team) ? d : CL - d };
}
// where the shot would go if struck now (for the aim reticle)
function aimPreview(pl){
  const Q = pl.queue, aim = Q ? Q.aim : null;
  if (!aim || !(aim[0] || aim[1])) return null;
  const kind = Q ? (Q.kind === 'soft' ? (Math.abs(pl.y - NETY) <= KD + 3 ? 'dink' : 'drop') : Q.kind) : 'drive';
  const mid = { drive:5, smash:9.5, dink:18.2, drop:17.1, lob:3.1 }[kind] || 5, s = isNear(pl.team) ? 1 : -1;
  let x = CW/2 + aim[0]*(CW/2), d = mid + aim[1]*s*(kind === 'dink' || kind === 'drop' ? 2.5 : 5);
  const safeX = clamp(x, 2, CW - 2), safeD = clamp(d, kind === 'dink' || kind === 'drop' ? NETY - KD + 0.8 : 1.8, NETY - 1.2);
  x += (safeX - x)*TUNE.aimAssist; d += (safeD - d)*TUNE.aimAssist;
  return { x, y: isNear(pl.team) ? d : CL - d };
}
// for the old callers: hit right now if the ball is in reach (tests and debug)
function hitBall(pl, kind, aim, mod){
  const B = G.ball; if (!ballFor(pl, B)) return false;
  const c = contactQ(pl, B.x, B.y, B.z, B.bounces > 0); if (!c) return false;
  return strike(pl, { kind, t:0.3, hold:false, power:0, aim, mod, skill:1 }, c);
}
