// Pickle Pirates · Booty: power-ups. Win a long rally (6+ shots) and your crew gets a booty crate (one held at a time);
// press Booty (E, B on a controller) to use it. None of them breaks a rule: every ball is still called where it lands,
// and only the rules move the score.
//   Cannonball Shot  your next drive, smash or serve leaves a smoke trail and skids low and fast off the bounce
//   Peg-Leg Spin     your next shot kicks sideways when it bounces (after the bounce, so the call doesn't change)
//   Kraken Ink       blots the other crew's view for 4 s (the CPU reads the ball far worse)
//   Parrot Spotter   for 8 s your crew sees where every ball will land (the CPU reads it perfectly)
//   Anchor Drop      the other crew runs at 65% speed for 5 s
//   Fog Bank         your next shot vanishes once it crosses the net, until it bounces or is hit
//   Treasure Map     an X on the other side's court: land a shot in it and you get another booty
'use strict';
const BOOTY_ORDER = ['cannonball', 'pegleg', 'ink', 'parrot', 'anchor', 'fog', 'treasure'];
const BOOTY_SHORT = { cannonball:'Cannonball', pegleg:'Peg-Leg', ink:'Ink', parrot:'Parrot', anchor:'Anchor', fog:'Fog Bank', treasure:'Treasure' };
const BOOTY_RALLY = 6;   // shots in a rally to earn a crate
// the key or button that uses booty, for the crew's first human (shown in the toasts)
function bootyKey(team){
  const h = crewOf(team).find(p => p.human); if (!h || typeof devicesFor !== 'function' || typeof binds === 'undefined') return 'E';
  const d = devicesFor(h.pad || 0); if (d.pads && d.pads.length) return 'B';
  const k = d.kb && binds[d.kb] && binds[d.kb].booty && binds[d.kb].booty[0]; return k ? (typeof KEY_NAMES !== 'undefined' && KEY_NAMES[k]) || k.replace(/^Key/, '') : 'E';
}
const bootyOn = () => !!G && G.mode === 'game' && G.cfg.booty !== false && !G.attract;
function newBooty(){
  G.booty = bootyOn() ? { held:{ home:null, away:null }, fx:{ home:{}, away:{} }, zone:null, ev:{ earned:0, used:{}, treasure:0 }, always:false } : null;
}
const bfx = tm => (G.booty && G.booty.fx[tm]) || {};
const fxOn = (tm, k) => { const v = bfx(tm)[k]; return v === true || (typeof v === 'number' && v > G.time); };
function earnBooty(team, kind){
  const Y = G.booty; if (!Y || Y.held[team]) return false;
  Y.held[team] = kind || BOOTY_ORDER[Math.floor(Math.random()*BOOTY_ORDER.length)]; Y.ev.earned++;
  const pl = crewOf(team)[0];
  if (pl) G.pops.push({ text:'BOOTY: ' + BOOTY_SHORT[Y.held[team]].toUpperCase(), x:pl.x, y:pl.y, life:1.4, max:1.4, size:14, color:'#ffc23a', lift:4 });
  const mine = crewOf(team).some(p => p.human), B = BOOTY[Y.held[team]];
  if (mine && typeof toast === 'function') toast(`Booty: ${B.name}!`, `${B.desc} Press Booty (${bootyKey(team)}) to use it.`, 3200, 'small booty');
  if (typeof sfx === 'function') sfx('pickup');
  return true;
}
// a rally ended: a long one earns the winners a crate
function bootyRally(winner, len){
  const Y = G.booty; if (!Y) return;
  Y.zone = null;
  if (len >= BOOTY_RALLY || Y.always) earnBooty(winner);
}
function useBooty(team){
  const Y = G.booty; if (!Y || !Y.held[team]) return false;
  const kind = Y.held[team], opp = other(team), fx = Y.fx[team], ofx = Y.fx[opp];
  Y.held[team] = null; Y.ev.used[kind] = (Y.ev.used[kind] || 0) + 1;
  switch (kind) {
    case 'cannonball': fx.cannonball = true; break;
    case 'pegleg': fx.pegleg = true; break;
    case 'ink': ofx.ink = G.time + 4; break;
    case 'parrot': fx.parrot = G.time + 8; break;
    case 'anchor': ofx.anchor = G.time + 5; break;
    case 'fog': fx.fogshot = true; break;
    case 'treasure': { const d = rand(4, 16), y = isNear(opp) ? NETY + KD + d*0.6 + 1 : NETY - KD - d*0.6 - 1; Y.zone = { team, x:rand(4, CW - 4), y:clamp(y, 2, CL - 2), r:2.6 }; break; }
  }
  const pl = crewOf(team)[0];
  if (pl) G.pops.push({ text:BOOTY_SHORT[kind].toUpperCase() + '!', x:pl.x, y:pl.y, life:1.1, max:1.1, size:16, color:'#ffc23a', lift:5 });
  if (typeof sfx === 'function') sfx('pickup');
  // say what just happened: to the crew that used it, and (more importantly) to the human it was used against
  if (typeof toast === 'function' && !G.attract) {
    const mine = crewOf(team).some(p => p.human), theirs = crewOf(opp).some(p => p.human), B = BOOTY[kind];
    if (theirs && !mine) toast(`${teamName(team)} use ${B.name}!`, B.desc.replace(/^Your next/, 'Their next').replace(/your crew/g, 'their crew').replace(/the other crew/gi, 'your crew').replace('Land a shot in it and you get', 'If they land a shot in it they get'), 2600, 'small booty');
    else if (mine) toast(B.name + '!', B.desc, 1800, 'small booty');
  }
  return true;
}
// a stroke (or serve) by `pl`: the shot-shaping booty its crew has waiting. Returns the launch speed factor.
function bootyStroke(pl, kind, B){
  const fx = bfx(pl.team); let speedK = 1;
  B.kick = 0; B.skid = false; B.fogShot = false; B.cannonShot = false;
  if (!G.booty) return speedK;
  if (fx.cannonball && (kind === 'drive' || kind === 'smash' || kind === 'serve')) { speedK = 1.1; fx.cannonball = false; B.cannonShot = true; B.skid = true; }
  if (fx.pegleg) { fx.pegleg = false; B.kick = (Math.random() < 0.5 ? -1 : 1)*7.5; }
  if (fx.fogshot) { fx.fogshot = false; B.fogShot = true; }
  return speedK;
}
// the first bounce of a shot: Treasure Map pays out when it lands in the X
function bootyBounce(B){
  const Y = G.booty; if (!Y || !Y.zone || !B.live || B.bounces !== 1 || B.lastBy !== Y.zone.team) return;
  const z = Y.zone;
  if (hyp(B.x - z.x, B.y - z.y) <= z.r) { Y.zone = null; Y.ev.treasure++; Y.held[z.team] = null; earnBooty(z.team);
    G.pops.push({ text:'TREASURE!', x:B.x, y:B.y, life:1.3, max:1.3, size:18, color:'#ffd860', lift:3 });
    for (let i = 0; i < 14; i++) G.parts.push({ x:B.x, y:B.y, z:0.3, vx:rand(-4, 4), vy:rand(-4, 4), vz:rand(5, 10), life:0.9, max:0.9, s:rand(0.15, 0.3), c:'#ffd860' }); }
}
// how much worse (or better) a CPU on this crew reads the ball right now
const bootyRead = tm => (fxOn(tm, 'ink') ? 3 : 1)*(fxOn(tm, 'parrot') ? 0.2 : 1);
const bootySlow = tm => fxOn(tm, 'anchor') ? 0.65 : 1;
// a fog-bank shot: hidden over the other side until it bounces or is hit
const fogShotHidden = B => !!B.fogShot && B.live && !!B.lastBy && sideOf(B.y) !== B.lastBy && B.bounces === 0 && B.z < 14;
// the CPU uses its crew's booty when it's about to hit (crews with a human leave it to them)
function aiBooty(pl){
  const Y = G.booty; if (!Y || !Y.held[pl.team] || crewOf(pl.team).some(p => p.human)) return;
  if (Y.always || Math.random() < 0.35) useBooty(pl.team);
}
