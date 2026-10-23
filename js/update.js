// Pickle Pirates · The per-frame simulation step: the referee, players, ball, rules
'use strict';
const SUB = 4;   // ball substeps per frame
function update(dt){
  if (!G) return;
  G.time += dt;
  G.shake = Math.max(0, G.shake - dt*3);
  if (G.banner) { G.banner.t += dt*1000; if (G.banner.t > G.banner.ms) G.banner = null; }
  for (let i=G.parts.length-1;i>=0;i--){ const p = G.parts[i]; p.life -= dt; if (p.life <= 0) { G.parts.splice(i,1); continue; } p.vz -= 18*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.z = Math.max(0.05, p.z + p.vz*dt); }
  for (let i=G.pops.length-1;i>=0;i--){ G.pops[i].life -= dt; if (G.pops[i].life <= 0) G.pops.splice(i,1); }

  // between points: serve setup, the serve, the cannon, game over
  refereeStep(dt);
  if (G.state === 'end') return;

  // players: everyone stands still while the serve is set up; the server waits with the ball
  const setting = G.state === 'set', serving = G.state === 'serve';
  for (let p = 0; p < G.players.length; p++) {
    const pl = G.players[p];
    if (pl.swing > 0) pl.swing = Math.max(0, pl.swing - dt);
    if (setting || (serving && G.match && (pl.team === G.match.server || !pl.human))) { pl.vx *= 0.8; pl.vy *= 0.8; continue; }   // a CPU receiver waits in place too
    if (pl.human) { humanMove(pl, dt); if (pl.queue) { const a = readAim(0); if (a[0] || a[1]) pl.queue.aim = a; } }
    else cpuPlayer(pl, dt);
    shotTick(pl, dt);
  }
  { const h = humanPl(); G.aimPreview = h ? aimPreview(h) : null; G.kitchenWarn = h ? kitchenWarn(h) : false; }
  kitchenWatch(dt);

  // ball
  const B = G.ball;
  if (B.z > -1 && !serving) {
    const h = dt/SUB;
    for (let i = 0; i < SUB; i++) ballStep(B, h, onBallEvent);
    if (B.live) { B.trail.push([B.x, B.y, B.z]); if (B.trail.length > 14) B.trail.shift(); } else if (B.trail.length) B.trail.shift();
    rallyWatch(dt);
  }
  // landing marker for the live ball (where it bounces next)
  G.landing = null;
  if (G.cfg.marker && B.live && B.z > 0.3) { const pr = predict(B, 2.5, 1/120, 1000); if (pr.first) { G.landing = pr.first; G.landing.in = landedIn(pr.first.x, pr.first.y); } }
  G.cannon.kick = Math.max(0, G.cannon.kick - dt*3);
}
