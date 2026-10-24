// Pickle Pirates · Island hazards: each island bends one part of the game, and none of them changes the rules.
//   Brine Bay        gulls snatch high lobs and drop them somewhere else on the far side (still in play)
//   Shipwreck Shoals the deck tilts: every bounce kicks the ball downhill (toward +x), and rolling balls run that way
//   Cannon Cove      cannonballs splash marked zones: anyone caught inside is knocked back and stunned for a moment
//   Volcano Isle     steam vents puff on a timer: a ball that bounces on a live vent is launched high
//   Kraken's Reach   tentacles rise through the court for a few seconds: the ball bounces off them, players can't pass
//   Ghost Galleon    fog banks drift across: the ball vanishes inside them (and the CPU reads it worse)
//   Davy's Locker    the same six, done the way the seabed would: a manta ray, a sea current, sinking anchors, bubble
//                    vents, tentacles and schools of tiny fish; one at a time, changing every three rallies
// The ball physics parts (tilt, vents, tentacles) live in ball.js through HZ, so predictions (the landing marker, the
// CPU's reads, the move-to-ball assist) see them too.
'use strict';
const ISLAND_HAZ = { brine:'gulls', wreck:'tilt', cannon:'cannon', volcano:'vents', kraken:'tentacles', ghost:'fog', locker:'rotate' };
const HAZ_ROTATION = ['gulls', 'tilt', 'cannon', 'vents', 'tentacles', 'fog'];
// what each hazard is called and does, on the surface and (for Davy's Locker) under the sea: name, a short tip for the
// scoreboard, and the full description for the island card and the Logbook
const HAZ_INFO = {
  gulls:[{ name:'Gulls', tip:'High balls get snatched', desc:'A gull may swoop on any ball higher than about 11 ft, carry it off and drop it somewhere else on the far side. It\'s still in play and still your shot, so keep the ball low here.' },
         { name:'Manta ray', tip:'High balls get carried off', desc:'A manta ray glides over the court and scoops up any ball higher than about 11 ft, then lets it go somewhere else on the far side. It\'s still in play and still your shot.' }],
  tilt:[{ name:'Tilted deck', tip:'Bounces kick downhill', desc:'The wreck lies on its side. Every bounce kicks the ball toward the low side of the court, and loose balls roll that way. Stand a step downhill of where you\'d normally wait.' },
        { name:'Sea current', tip:'The current pushes the ball sideways', desc:'A current sweeps across the court and pushes the ball sideways all the time it\'s in the air; the streaming bubbles show which way. Shots curve with it, so wait a step down-current.' }],
  cannon:[{ name:'Cannon fire', tip:'Stay out of the red rings', desc:'Red rings appear on the court, often near a player. About a second and a half later a cannonball lands: anyone inside is knocked back and stunned for a moment.' },
          { name:'Sinking anchors', tip:'Stay out of the rings', desc:'Rings of shadow mark where anchors are sinking from the surface. About a second and a half later one lands: anyone inside is knocked back and stunned for a moment.' }],
  vents:[{ name:'Steam vents', tip:'A bounce on a blowing vent flies high', desc:'Iron grates in the court rumble and glow, puff a warning, then blast steam for about a second. A ball that bounces on a vent while it\'s blowing is launched high into the air.' },
         { name:'Bubble vents', tip:'A bounce on a gushing vent flies high', desc:'Cracks in the seabed rumble and glow, fizz a warning, then gush bubbles for about a second. A ball that bounces on one while it\'s gushing is launched high into the air.' }],
  tentacles:[{ name:'Tentacles', tip:'Tentacles block the ball', desc:'A ripple shows where a tentacle is about to burst up through the court. It stands for a few seconds: the ball bounces off it and nobody can run through it.' },
             { name:'Tentacles', tip:'Tentacles block the ball', desc:'A ripple shows where a tentacle is about to burst up through the seabed. It stands for a few seconds: the ball bounces off it and nobody can run through it.' }],
  fog:[{ name:'Fog', tip:'The ball hides in the fog', desc:'Fog banks drift across the court and the ball vanishes while it\'s inside one. Watch where it goes in and guess where it comes out.' },
       { name:'Fish schools', tip:'The ball hides in the fish', desc:'Schools of tiny fish swirl across the court and the ball disappears inside them. Watch where it goes in and guess where it comes out.' }],
};
const HAZ_ICON = { gulls:['hz_gull', 'hz_manta'], tilt:['hz_tilt', 'hz_current'], cannon:['hz_cannon', 'anchor'], vents:['hz_steam', 'hz_bubbles'], tentacles:['hz_tentacle', 'hz_tentacle'], fog:['hz_fog', 'hz_fish'] };
const hazInfo = (kind, sea) => ({ ...HAZ_INFO[kind][sea ? 1 : 0], icon:HAZ_ICON[kind][sea ? 1 : 0] });
const HAZ_NAME = new Proxy({}, { get:(o, k) => HAZ_INFO[k] ? hazInfo(k, G && G.haz && G.haz.sea).name : k });   // by the current game's theme
const HAZ_TIP = new Proxy({}, { get:(o, k) => HAZ_INFO[k] ? hazInfo(k, G && G.haz && G.haz.sea).tip : '' });
const hazardsOn = () => !!G && G.cfg.hazards !== false && !!G.island && (G.mode === 'game' || G.cfg.hazards === true);
function newHazards(){
  G.haz = null; HZ = null;
  if (!hazardsOn()) return;
  const island = ISLAND_HAZ[G.island.id] || 'gulls';
  G.haz = { island, sea: island === 'rotate', kind:null, t:0, ev:{}, told:{}, gull:null, gullFor:-1, zones:[], vents:[], tents:[], fog:[], next:{ cannon:3, tent:3 }, round:0 };
  setHazard(island === 'rotate' ? HAZ_ROTATION[0] : island);
}
function setHazard(kind){
  const H = G.haz; H.kind = kind; H.zones = []; H.tents = []; H.gull = null; H.next = { cannon:rand(3, 5), tent:rand(2.5, 4) };
  if (G.ball.carried) G.ball.carried = false;
  // vents: two each side, outside the kitchens, puffing on staggered timers
  H.vents = kind !== 'vents' ? [] : [[0.3, 12.5], [0.72, 17], [0.68, 12.5], [0.28, 17]].map(([xk, d], i) => ({ x:CW*xk, y: i < 2 ? NETY + d : NETY - d, r:2.2, period:5.5, on:1.4, phase:i*1.35 }));
  // fog: three banks drifting across the court at different speeds
  H.fog = kind !== 'fog' ? [] : [[-4, NETY - 12, 1.6], [CW + 2, NETY + 2, -1.2], [8, NETY + 13, 1.9]].map(([x, y, vx]) => ({ x, y, w:5.5, h:4.2, vx }));
  // the tilted deck kicks bounces downhill; under the sea it's a current pushing the ball sideways in the air instead
  H.current = kind === 'tilt' && H.sea ? (Math.random() < 0.5 ? -1 : 1)*5 : 0;
  HZ = { tilt: kind === 'tilt' && !H.sea ? 5.5 : 0, current:H.current, vents:H.vents, tents:[], ventKick:24 };
}
const ventOn = (v, t) => ((t + v.phase) % v.period + v.period) % v.period < v.on;
const ventWarn = (v, t) => { const u = ((t + v.phase) % v.period + v.period) % v.period; return u >= v.period - 0.9; };
const count = (k, n = 1) => { if (G.haz) G.haz.ev[k] = (G.haz.ev[k] || 0) + n; };
// the first time a hazard shows itself in a game, name it and say what it does
function tell(kind){
  const H = G.haz; if (!H || H.told[kind] || G.attract) return;
  H.told[kind] = true;
  if (typeof announce === 'function') announce(HAZ_NAME[kind] + '!', HAZ_TIP[kind], 1800);
}
// a new point: Davy's Locker changes hazard every three rallies
function hazardNewPoint(){
  const H = G.haz; if (!H) return;
  if (H.island === 'rotate' && G.match && G.match.rallies > 0 && G.match.rallies % 3 === 0 && H.round !== G.match.rallies) {
    H.round = G.match.rallies;
    const next = HAZ_ROTATION[(HAZ_ROTATION.indexOf(H.kind) + 1) % HAZ_ROTATION.length];
    setHazard(next); count('rotate'); H.told[next] = true;
    if (typeof announce === 'function') announce(`The Locker shifts: ${HAZ_NAME[next]}`, HAZ_TIP[next], 1600);
  }
  H.zones = []; H.tents = []; HZ.tents = []; H.gull = null; G.ball.carried = false;
}
function hazardStep(dt){
  const H = G.haz; if (!H) return;
  H.t += dt;
  const B = G.ball, live = G.state === 'play' && B.live;
  if (H.current && live) count('current', dt);
  switch (H.kind) {
    case 'gulls': {
      // a high ball near the top of its flight: a gull may take it (once per shot)
      if (!H.gull && live && B.lastBy && B.z > 11 && B.vz < 6 && H.gullFor !== G.shotN) {
        H.gullFor = G.shotN;
        if (Math.random() < 0.65) {
          const to = other(B.lastBy), d = rand(KD + 2, 16);
          H.gull = { t:0, dur:1.0, from:{ x:B.x, y:B.y, z:B.z }, to:{ x:rand(3, CW - 3), y: isNear(to) ? NETY + d : NETY - d, z:9.5 }, team:to };
          B.carried = true; B.vx = B.vy = B.vz = 0; B.sx = B.sy = B.sz = 0; count('gulls'); tell('gulls');
          if (typeof sfx === 'function') sfx(H.sea ? 'whoosh' : 'gull');
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
    case 'tilt': if (live) tell('tilt'); break;
    case 'vents':
      // each vent rumbles (or bubbles, on the Locker) as its warning starts, so you hear it coming
      for (const v of H.vents) { const w = ventWarn(v, G.time); if (w && !v.warned && !G.attract && typeof sfx === 'function') sfx(H.sea ? 'bubbles' : 'vent', 0.7); v.warned = w; }
      if (G.state === 'play' && H.vents.some(v => ventWarn(v, G.time))) tell('vents'); break;
    case 'cannon': {
      if (G.state === 'play') H.next.cannon -= dt;
      if (H.next.cannon <= 0) {
        H.next.cannon = rand(4, 7);
        // aim at someone more often than not, so the rings matter
        const who = Math.random() < 0.65 ? pick(G.players) : null;
        const x = clamp(who ? who.x + rand(-2.5, 2.5) : rand(2, CW - 2), 1, CW - 1), y = who ? clamp(who.y + rand(-2.5, 2.5), 1, CL - 1) : rand(2, CL - 2);
        H.zones.push({ x, y, r:2.4, t:0, warn:1.5, hit:false }); tell('cannon');
      }
      for (let i = H.zones.length - 1; i >= 0; i--) {
        const z = H.zones[i]; z.t += dt;
        if (!z.hit && z.t >= z.warn) {
          z.hit = true; count('cannon');
          if (typeof sfx === 'function') { if (H.sea) sfx('anchor'); else { sfx('cannon'); sfx('splash', 0.8); } }
          G.shake = Math.max(G.shake || 0, 0.5);
          for (const pl of G.players) { const dx = pl.x - z.x, dy = pl.y - z.y, d = hyp(dx, dy);
            if (d < z.r + 0.4) { pl.stun = 0.8; const k = 9/(d || 1); pl.vx = dx*k; pl.vy = dy*k; count('stunned'); statAdd(pl.team, 'stunned'); } }
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
          if (G.players.every(p => hyp(p.x - x, p.y - y) > 3) && hyp(B.x - x, B.y - y) > 3) { H.tents.push({ x, y, r:0.85, h:0, t:0, rise:1.0, up:3.4 }); tell('tentacles'); break; }
        }
      }
      for (let i = H.tents.length - 1; i >= 0; i--) {
        const T = H.tents[i]; T.t += dt;
        const a = T.t - T.rise;   // ripple first, then up, then back down
        T.h = a < 0 ? 0 : a < 0.3 ? 6.5*a/0.3 : a < T.up ? 6.5 : a < T.up + 0.4 ? 6.5*(1 - (a - T.up)/0.4) : 0;
        if (a >= 0 && !T.heard) { T.heard = true; if (typeof sfx === 'function' && !G.attract) sfx('tentacle', 0.8); }   // it bursts up
        if (a > T.up + 0.4) H.tents.splice(i, 1);
      }
      HZ.tents = H.tents.filter(T => T.h > 1);
      break;
    }
    case 'fog': {
      for (const f of H.fog) { f.x += f.vx*dt; if (f.x > CW + 9) f.x = -9; if (f.x < -9) f.x = CW + 9; }
      const hid = ballHidden();
      if (hid && !H.wasHidden && live) { count('fog'); tell('fog'); }
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
