// Pickle Pirates · The per-frame simulation step: the referee, players, ball, rules
'use strict';
// the ball runs on its own fixed clock (BALL_DT, four steps a frame at 60 fps), whatever the frame rate
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
    if (pl.human) { humanMove(pl, dt); if (pl.queue) { const a = readAim(pl.pad); if (a[0] || a[1]) pl.queue.aim = a; } }
    else aiPlayer(pl, dt);
    shotTick(pl, dt);
  }
  refreshTaker(dt);
  hazardStep(dt);
  if (G.voyage) voyWatch();
  // reading aids for each human: the aim reticle and the kitchen warning
  G.aids = humansAll().map(h => ({ pl:h, aim:aimPreview(h), warn:kitchenWarn(h) }));
  G.aimPreview = G.aids[0] ? G.aids[0].aim : null; G.kitchenWarn = G.aids[0] ? G.aids[0].warn : false;
  kitchenWatch(dt);

  // ball
  const B = G.ball;
  if (B.z > -1 && !serving && !B.carried) {   // a gull carrying the ball moves it itself (hazards.js)
    G.ballAcc = (G.ballAcc || 0) + dt; B.clock = G.time - G.ballAcc;
    while (G.ballAcc >= BALL_DT - 1e-9) { G.ballAcc -= BALL_DT; ballStep(B, BALL_DT, onBallEvent); }
    if (B.live) { B.trail.push([B.x, B.y, B.z]); if (B.trail.length > 14) B.trail.shift(); } else if (B.trail.length) B.trail.shift();
    rallyWatch(dt);
  }
  // landing marker for the live ball (where it bounces next)
  G.landing = null;
  const parrot = G.booty && humansAll().some(h => fxOn(h.team, 'parrot'));   // Parrot Spotter shows the landing for its crew
  if (B.cannonShot && B.live && !B.bounces && Math.random() < 0.6) G.parts.push({ x:B.x, y:B.y, z:B.z, vx:rand(-1, 1), vy:rand(-1, 1), vz:rand(0, 1), life:0.5, max:0.5, s:rand(0.25, 0.45), c:'#6a6470' });
  if (G.swab) { G.swab.t += dt; if (G.swab.t > 2.4) G.swab = null; }
  if ((G.cfg.marker || parrot) && B.live && B.z > 0.3) { const pr = predict(B, 2.5, BALL_DT, 1e4); if (pr.first) { G.landing = pr.first; G.landing.in = landedIn(pr.first.x, pr.first.y); } }
  G.cannon.kick = Math.max(0, G.cannon.kick - dt*3);
}
