// Pickle Pirates · Island hazards: each island bends one part of the game, and none of them changes the rules.
//   Brine Bay        gulls snatch high lobs and drop them somewhere else on the far side (still in play)
//   Shipwreck Shoals the deck tilts: every bounce kicks the ball downhill (toward +x), and rolling balls run that way
//   Cannon Cove      cannonballs splash marked zones: anyone caught inside is knocked back and stunned for a moment
//   Volcano Isle     steam vents puff on a timer: a ball that bounces on a live vent is launched high
//   Kraken's Reach   tentacles rise through the court for a few seconds: the ball bounces off them, players can't pass
//   Ghost Galleon    fog banks drift across: the ball vanishes inside them (and the CPU reads it worse)
//   Davy's Locker    all of the above, one at a time, changing every three rallies
// The ball physics parts (tilt, vents, tentacles) live in ball.js through HZ, so predictions (the landing marker, the
// CPU's reads, the move-to-ball assist) see them too.
'use strict';
const ISLAND_HAZ = { brine:'gulls', wreck:'tilt', cannon:'cannon', volcano:'vents', kraken:'tentacles', ghost:'fog', locker:'rotate' };
const HAZ_ROTATION = ['gulls', 'tilt', 'cannon', 'vents', 'tentacles', 'fog'];
const HAZ_NAME = { gulls:'Gulls', tilt:'Tilted deck', cannon:'Cannon fire', vents:'Steam vents', tentacles:'Tentacles', fog:'Fog' };
const HAZ_TIP = { gulls:'High balls get snatched', tilt:'Bounces kick downhill', cannon:'Stay out of the red rings', vents:'Bounces on a vent fly high', tentacles:'Tentacles block the ball', fog:'The ball hides in the fog' };
const hazardsOn = () => !!G && G.cfg.hazards !== false && !!G.island && (G.mode === 'game' || G.cfg.hazards === true);
function newHazards(){
  G.haz = null; HZ = null;
  if (!hazardsOn()) return;
  const island = ISLAND_HAZ[G.island.id] || 'gulls';
  G.haz = { island, kind:null, t:0, ev:{}, gull:null, gullFor:-1, zones:[], vents:[], tents:[], fog:[], next:{ cannon:3, tent:3 }, round:0 };
  setHazard(island === 'rotate' ? HAZ_ROTATION[0] : island);
}
function setHazard(kind){
  const H = G.haz; H.kind = kind; H.zones = []; H.tents = []; H.gull = null; H.next = { cannon:rand(3, 5), tent:rand(2.5, 4) };
  if (G.ball.carried) G.ball.carried = false;
  // vents: two each side, outside the kitchens, puffing on staggered timers
  H.vents = kind !== 'vents' ? [] : [[0.3, 12.5], [0.72, 17], [0.68, 12.5], [0.28, 17]].map(([xk, d], i) => ({ x:CW*xk, y: i < 2 ? NETY + d : NETY - d, r:2.2, period:5.5, on:1.4, phase:i*1.35 }));
  // fog: three banks drifting across the court at different speeds
  H.fog = kind !== 'fog' ? [] : [[-4, NETY - 12, 1.6], [CW + 2, NETY + 2, -1.2], [8, NETY + 13, 1.9]].map(([x, y, vx]) => ({ x, y, w:5.5, h:4.2, vx }));
  HZ = { tilt: kind === 'tilt' ? 5.5 : 0, vents:H.vents, tents:[], ventKick:24 };
}
const ventOn = (v, t) => ((t + v.phase) % v.period + v.period) % v.period < v.on;
const ventWarn = (v, t) => { const u = ((t + v.phase) % v.period + v.period) % v.period; return u >= v.period - 0.9; };
const count = (k, n = 1) => { if (G.haz) G.haz.ev[k] = (G.haz.ev[k] || 0) + n; };
// a new point: Davy's Locker changes hazard every three rallies
function hazardNewPoint(){
  const H = G.haz; if (!H) return;
  if (H.island === 'rotate' && G.match && G.match.rallies > 0 && G.match.rallies % 3 === 0 && H.round !== G.match.rallies) {
    H.round = G.match.rallies;
    const next = HAZ_ROTATION[(HAZ_ROTATION.indexOf(H.kind) + 1) % HAZ_ROTATION.length];
    setHazard(next); count('rotate');
    if (typeof announce === 'function') announce(`The Locker shifts: ${HAZ_NAME[next]}`, HAZ_TIP[next], 1600);
  }
  H.zones = []; H.tents = []; HZ.tents = []; H.gull = null; G.ball.carried = false;
}
function hazardStep(dt){
  const H = G.haz; if (!H) return;
  H.t += dt;
  const B = G.ball, live = G.state === 'play' && B.live;
  switch (H.kind) {
    case 'gulls': {
      // a high ball near the top of its flight: a gull may take it (once per shot)
      if (!H.gull && live && B.lastBy && B.z > 11 && B.vz < 6 && H.gullFor !== G.shotN) {
        H.gullFor = G.shotN;
        if (Math.random() < 0.65) {
          const to = other(B.lastBy), d = rand(KD + 2, 16);
          H.gull = { t:0, dur:1.0, from:{ x:B.x, y:B.y, z:B.z }, to:{ x:rand(3, CW - 3), y: isNear(to) ? NETY + d : NETY - d, z:9.5 }, team:to };
          B.carried = true; B.vx = B.vy = B.vz = 0; B.sx = B.sy = B.sz = 0; count('gulls');
          if (typeof sfx === 'function') sfx('call');
        }
      }
      if (H.gull) {
        const g = H.gull; g.t += dt; const k = Math.min(1, g.t/g.dur), e = k*k*(3 - 2*k);
        B.x = g.from.x + (g.to.x - g.from.x)*e; B.y = g.from.y + (g.to.y - g.from.y)*e; B.z = g.from.z + (g.to.z - g.from.z)*e + Math.sin(k*Math.PI)*2.5;
        if (!B.live) { B.carried = false; H.gull = null; }
        else if (k >= 1) {   // dropped: it falls from here, still the hitter's shot, still in play
          B.carried = false; B.vx = rand(-1.5, 1.5); B.vy = (isNear(g.team) ? 1 : -1)*rand(0, 2); B.vz = -1; H.gull = null; H.lastDrop = { x:B.x, y:B.y, t:G.time };
          assignTaker(g.team);
        }
      }
      break;
    }
    case 'cannon': {
      if (G.state === 'play') H.next.cannon -= dt;
      if (H.next.cannon <= 0) {
        H.next.cannon = rand(4, 7);
        // aim at someone more often than not, so the rings matter
        const who = Math.random() < 0.65 ? pick(G.players) : null;
        const x = clamp(who ? who.x + rand(-2.5, 2.5) : rand(2, CW - 2), 1, CW - 1), y = who ? clamp(who.y + rand(-2.5, 2.5), 1, CL - 1) : rand(2, CL - 2);
        H.zones.push({ x, y, r:2.4, t:0, warn:1.5, hit:false });
      }
      for (let i = H.zones.length - 1; i >= 0; i--) {
        const z = H.zones[i]; z.t += dt;
        if (!z.hit && z.t >= z.warn) {
          z.hit = true; count('cannon');
          if (typeof sfx === 'function') sfx('cannon'), sfx('splash', 0.8);
          G.shake = Math.max(G.shake || 0, 0.5);
          for (const pl of G.players) { const dx = pl.x - z.x, dy = pl.y - z.y, d = hyp(dx, dy);
            if (d < z.r + 0.4) { pl.stun = 0.8; const k = 9/(d || 1); pl.vx = dx*k; pl.vy = dy*k; count('stunned'); } }
          for (let k = 0; k < 18; k++) G.parts.push({ x:z.x + rand(-1, 1), y:z.y + rand(-1, 1), z:0.3, vx:rand(-5, 5), vy:rand(-5, 5), vz:rand(8, 16), life:0.9, max:0.9, s:rand(0.3, 0.7), c:'#dff3ff' });
        }
        if (z.t > z.warn + 0.6) H.zones.splice(i, 1);
      }
      break;
    }
    case 'tentacles': {
      if (G.state === 'play') H.next.tent -= dt;
      if (H.next.tent <= 0 && H.tents.length < 3) {
        H.next.tent = rand(2.8, 4.5);
        for (let tries = 0; tries < 12; tries++) {
          const near = Math.random() < 0.5, x = rand(2, CW - 2), y = near ? rand(NETY + KD + 1, CL - 1) : rand(1, NETY - KD - 1);
          if (G.players.every(p => hyp(p.x - x, p.y - y) > 3) && hyp(B.x - x, B.y - y) > 3) { H.tents.push({ x, y, r:0.85, h:0, t:0, rise:1.0, up:3.4 }); break; }
        }
      }
      for (let i = H.tents.length - 1; i >= 0; i--) {
        const T = H.tents[i]; T.t += dt;
        const a = T.t - T.rise;   // ripple first, then up, then back down
        T.h = a < 0 ? 0 : a < 0.3 ? 6.5*a/0.3 : a < T.up ? 6.5 : a < T.up + 0.4 ? 6.5*(1 - (a - T.up)/0.4) : 0;
        if (a > T.up + 0.4) H.tents.splice(i, 1);
      }
      HZ.tents = H.tents.filter(T => T.h > 1);
      break;
    }
    case 'fog': {
      for (const f of H.fog) { f.x += f.vx*dt; if (f.x > CW + 9) f.x = -9; if (f.x < -9) f.x = CW + 9; }
      const hid = ballHidden();
      if (hid && !H.wasHidden && live) count('fog');
      H.wasHidden = hid;
      break;
    }
  }
}
// the ball is inside a fog bank (low enough to be in it)
function ballHidden(){
  const H = G.haz, B = G.ball;
  if (fogShotHidden(B)) return true;   // a Fog Bank shot (booty.js)
  if (!H || H.kind !== 'fog' || B.z > 9 || B.z < -1) return false;
  return H.fog.some(f => ((B.x - f.x)/f.w)**2 + ((B.y - f.y)/f.h)**2 < 1);
}
// players: a stun from a cannonball, and tentacles you can't walk through
function hazardPlayer(pl, dt){
  if (pl.stun > 0) pl.stun -= dt;
  const H = G.haz; if (!H || H.kind !== 'tentacles') return;
  for (const T of HZ.tents) { const dx = pl.x - T.x, dy = pl.y - T.y, d = hyp(dx, dy), R = T.r + 0.8;
    if (d < R) { const k = (R - d)/(d || 1); pl.x += dx*k; pl.y += dy*k; count('blocked', dt); } }
}
// a spot to run to, nudged out of any cannon ring that's about to land (the CPU and the move-to-ball assist use this)
function hazardAvoid(x, y){
  const H = G.haz; if (!H || H.kind !== 'cannon') return [x, y];
  for (const z of H.zones) { if (z.hit) continue; const dx = x - z.x, dy = y - z.y, d = hyp(dx, dy), R = z.r + 0.9;
    if (d < R) { const k = R/(d || 1); x = z.x + (d ? dx : 1)*k; y = z.y + dy*k; } }
  return [x, y];
}
// the CPU reads a hidden ball worse
const fogPenalty = () => ballHidden() ? 2.5 : 1;
