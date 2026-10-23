// Pickle Pirates · Classic top-down view and the scoreboard
'use strict';
let cw = 1, ch = 1, dpr = 1, scale = 10, OX = 0, OY = 0;
const courtC = document.createElement('canvas');
const PAD = 7;   // feet of deck drawn around the court
function resize(){
  const r = stage.getBoundingClientRect();
  cw = Math.max(1, r.width); ch = Math.max(1, r.height);
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(cw*dpr); cv.height = Math.round(ch*dpr);
  scale = Math.min(cw/(CW + PAD*2), ch/(CL + PAD*1.4));
  OX = cw/2 - CW/2*scale; OY = ch/2 - CL/2*scale;
  buildCourt();
}
const sx = x => OX + x*scale, sy = (y, z = 0) => OY + y*scale - z*scale*0.55;
// static layer: water, deck, court, kitchen, lines
function buildCourt(){
  const T = (G && G.theme) || THEMES.brine;
  courtC.width = cv.width; courtC.height = cv.height;
  const g = courtC.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle = T.water; g.fillRect(0, 0, cw, ch);
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2;
  for (let y = 10; y < ch; y += 22) { g.beginPath(); for (let x = 0; x <= cw; x += 12) g.lineTo(x, y + Math.sin(x*0.05 + y)*3); g.stroke(); }
  // deck planks
  const dx0 = sx(-PAD + 1.5), dy0 = sy(-PAD*0.6), dw = (CW + PAD*2 - 3)*scale, dh = (CL + PAD*1.2)*scale;
  g.fillStyle = T.deck; g.fillRect(dx0, dy0, dw, dh);
  g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
  for (let x = dx0; x < dx0 + dw; x += scale*0.9) { g.beginPath(); g.moveTo(x, dy0); g.lineTo(x, dy0 + dh); g.stroke(); }
  g.lineWidth = 3; g.strokeStyle = '#150e1c'; g.strokeRect(dx0, dy0, dw, dh);
  // court and kitchens
  g.fillStyle = T.court; g.fillRect(sx(0), sy(0), CW*scale, CL*scale);
  g.fillStyle = T.kitchen; g.fillRect(sx(0), sy(NETY - KD), CW*scale, KD*2*scale);
  g.strokeStyle = T.line; g.lineWidth = Math.max(1.5, scale*0.17);
  g.strokeRect(sx(0), sy(0), CW*scale, CL*scale);
  g.beginPath();
  g.moveTo(sx(0), sy(NETY - KD)); g.lineTo(sx(CW), sy(NETY - KD));
  g.moveTo(sx(0), sy(NETY + KD)); g.lineTo(sx(CW), sy(NETY + KD));
  g.moveTo(sx(CW/2), sy(0)); g.lineTo(sx(CW/2), sy(NETY - KD));
  g.moveTo(sx(CW/2), sy(NETY + KD)); g.lineTo(sx(CW/2), sy(CL));
  g.stroke();
}
function drawNet(){
  const y = sy(NETY), x0 = sx(-POST_OUT), x1 = sx(CW + POST_OUT), top = scale*NET_H_MID*0.55;
  ctx.fillStyle = 'rgba(20,16,24,.35)'; ctx.fillRect(x0, y - top, x1 - x0, top);
  ctx.strokeStyle = 'rgba(240,240,240,.5)'; ctx.lineWidth = 1;
  for (let x = x0; x < x1; x += 5) { ctx.beginPath(); ctx.moveTo(x, y - top); ctx.lineTo(x, y); ctx.stroke(); }
  ctx.strokeStyle = '#f4f0e4'; ctx.lineWidth = Math.max(2, scale*0.18);
  ctx.beginPath(); ctx.moveTo(x0, sy(NETY, NET_H_SIDE)); ctx.quadraticCurveTo(sx(CW/2), sy(NETY, NET_H_MID*2 - NET_H_SIDE), x1, sy(NETY, NET_H_SIDE)); ctx.stroke();
  ctx.fillStyle = '#150e1c'; for (const x of [x0, x1]) { ctx.fillRect(x - 3, sy(NETY, NET_H_SIDE + 0.4), 6, scale*(NET_H_SIDE + 0.4)*0.55); }
}
function drawPlayer(pl, t){
  const sp = SPECIES[pl.species] || SPECIES.pickle, r = PL_R*scale, hand = handOf(pl);
  const lean = pl.lunge > 0 ? pl.lungeSide*hand*(pl.lunge/0.45)*0.6*r : 0, hop = pl.split > 0 ? Math.sin(pl.split/0.18*Math.PI)*r*0.35 : 0;
  const x = sx(pl.x) + lean, y = sy(pl.y) - hop;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(sx(pl.x), sy(pl.y) + r*0.3, r*1.1, r*0.5, 0, 0, 7); ctx.fill();
  // paddle: ready in front, swinging across on the side the ball was on
  const sw = pl.swing > 0 ? (1 - pl.swing/0.28) : 0, side = (pl.swing > 0 ? pl.swingSide : 1)*hand*(pl.team === 'home' ? 1 : -1);
  const pa = pl.face + side*(0.9 - sw*1.8), px = x + Math.cos(pa)*r*1.5, py = y - r*0.6 + Math.sin(pa)*r*1.5*0.6;
  ctx.fillStyle = '#3a2a1a'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(px, py, r*0.45, r*0.55, pa, 0, 7); ctx.fill(); ctx.stroke();
  // body
  ctx.fillStyle = sp.body; ctx.beginPath(); ctx.ellipse(x, y - r*0.7, r*0.75, r*1.05, 0, 0, 7); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
  // tricorn hat for the pirates, a band for everyone else
  if (pl.species === 'pickle') { ctx.fillStyle = '#1b1410'; ctx.beginPath(); ctx.moveTo(x - r*0.95, y - r*1.55); ctx.quadraticCurveTo(x, y - r*2.5, x + r*0.95, y - r*1.55); ctx.quadraticCurveTo(x, y - r*1.75, x - r*0.95, y - r*1.55); ctx.fill(); }
  else { ctx.fillStyle = sp.acc; ctx.fillRect(x - r*0.7, y - r*1.25, r*1.4, r*0.3); }
}
// the human's reach: a ring at the feet that lights up when the ball can be hit
function drawReach(pl, t){
  const B = G.ball, live = ballFor(pl, B) && contactQ(pl, B.x, B.y, B.z, B.bounces > 0), rr = TUNE.reach*scale;
  ctx.save(); ctx.lineWidth = live ? 3 : 1.5;
  ctx.strokeStyle = live ? '#ffc23a' : pl.queue ? `rgba(255,194,58,${0.45 + 0.25*Math.sin(t*12)})` : 'rgba(243,234,210,.3)';
  ctx.beginPath(); ctx.ellipse(sx(pl.x), sy(pl.y), rr, rr*0.55, 0, 0, 7); ctx.stroke(); ctx.restore();
}
// a pending shot over the player's head, with the drive's power filling as you hold
function drawQueue(pl, x, y){
  const Q = pl.queue; if (!Q || !pl.human || G.attract) return;
  const label = { drive:'DRIVE', soft:'SOFT', lob:'LOB' }[Q.kind] || Q.kind.toUpperCase();
  ctx.save(); ctx.font = '12px Bungee, "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(label).width + 16, h = 20;
  ctx.fillStyle = 'rgba(11,20,24,.88)'; ctx.strokeStyle = '#ffc23a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w/2, y - h/2, w, h, 6) : ctx.rect(x - w/2, y - h/2, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffc23a'; ctx.fillText(label, x, y + 1);
  if (Q.kind === 'drive' && Q.power > 0) { ctx.fillStyle = '#ff6a3c'; ctx.fillRect(x - w/2 + 3, y + h/2 - 4, (w - 6)*Q.power, 2.5); }
  ctx.restore();
}
// where a manually aimed shot is headed
function drawReticle(x, y, r){
  ctx.save(); ctx.strokeStyle = 'rgba(95,208,255,.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, r, r*0.55, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r*1.4, y); ctx.lineTo(x - r*0.5, y); ctx.moveTo(x + r*0.5, y); ctx.lineTo(x + r*1.4, y); ctx.moveTo(x, y - r*0.8); ctx.lineTo(x, y - r*0.3); ctx.moveTo(x, y + r*0.3); ctx.lineTo(x, y + r*0.8); ctx.stroke(); ctx.restore();
}
function drawBall(){
  const B = G.ball; if (B.z < -0.5) return;
  const r = Math.max(3, BALL_R*scale*2.2);
  if (G.landing) { const lx = sx(G.landing.x), ly = sy(G.landing.y); ctx.strokeStyle = G.landing.in ? 'rgba(255,194,58,.9)' : 'rgba(255,90,60,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(lx, ly, r*1.8, r*0.9, 0, 0, 7); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sx(B.x), sy(B.y), r*0.9, r*0.45, 0, 0, 7); ctx.fill();
  if (G.cfg.height && B.z > 0.4) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx(B.x), sy(B.y)); ctx.lineTo(sx(B.x), sy(B.y, B.z)); ctx.stroke(); }
  if (B.trail.length > 2 && hyp(B.vx, B.vy, B.vz) > 45) { ctx.strokeStyle = 'rgba(255,240,140,.35)'; ctx.lineWidth = r; ctx.lineCap = 'round'; ctx.beginPath(); B.trail.forEach(([x, y, z], i) => i ? ctx.lineTo(sx(x), sy(y, z)) : ctx.moveTo(sx(x), sy(y, z))); ctx.stroke(); }
  const bx = sx(B.x), by = sy(B.y, B.z);
  ctx.fillStyle = '#f4e23a'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(80,70,10,.55)'; for (const [ox, oy] of [[-0.35,-0.3],[0.3,-0.25],[0,0.2],[-0.3,0.35],[0.35,0.3]]) { ctx.beginPath(); ctx.arc(bx + ox*r, by + oy*r, r*0.13, 0, 7); ctx.fill(); }
}
function drawCannon(){
  const C = G.cannon, x = sx(C.x), y = sy(C.y), r = scale*0.9, dir = C.y < NETY ? 1 : -1, k = C.kick*scale*0.4;
  ctx.fillStyle = '#6b4520'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(x - r, y - r*0.7 - dir*k, r*2, r*1.4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.rect(x - r*0.35, y - dir*k, r*0.7, dir*r*1.6); ctx.fill(); ctx.stroke();
}
function drawPop(p, x, y){
  const k = p.life/p.max, a = Math.min(1, k*3), s = Math.round(p.size*(k > 0.85 ? 1 + (k - 0.85)*3 : 1));
  ctx.save(); ctx.globalAlpha = a; ctx.font = `${s}px Bungee, "Arial Black", Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = '#150e1c'; ctx.strokeText(p.text, x, y); ctx.fillStyle = p.color; ctx.fillText(p.text, x, y); ctx.restore();
}
function render(now){
  const t = now/1000;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (!courtC.width || courtC.width !== cv.width) buildCourt();
  ctx.clearRect(0, 0, cw, ch);
  if (!G) return;
  const sh = A11Y.rm ? 0 : G.shake*4;
  ctx.save(); if (sh) ctx.translate((Math.random()-0.5)*sh, (Math.random()-0.5)*sh);
  ctx.drawImage(courtC, 0, 0, cw, ch);
  for (const p of G.parts) { ctx.fillStyle = p.c; ctx.globalAlpha = p.life/p.max; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y, p.z), Math.max(1, p.s*scale), 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
  // far side first, then the net, then the near side, so overlaps read right
  const far = G.players.filter(p => p.y <= NETY), near = G.players.filter(p => p.y > NETY), ballFar = G.ball.y <= NETY;
  drawCannon();
  { const h = humanPl(); if (h) drawReach(h, t); if (G.aimPreview) drawReticle(sx(G.aimPreview.x), sy(G.aimPreview.y), scale*0.9); }
  for (const p of far) drawPlayer(p, t);
  if (ballFar) drawBall();
  drawNet();
  if (!ballFar) drawBall();
  for (const p of near) drawPlayer(p, t);
  for (const p of G.pops) drawPop(p, sx(p.x), sy(p.y, p.lift || 4));
  { const h = humanPl(); if (h) drawQueue(h, sx(h.x), sy(h.y) - PL_R*scale*3.2); }
  ctx.restore();
  drawJoy();
}
function drawJoy(){
  if (joy.id === null) return;
  let dx = joy.x - joy.bx, dy = joy.y - joy.by; const m = hyp(dx, dy); if (m > JR) { dx = dx/m*JR; dy = dy/m*JR; }
  ctx.strokeStyle = 'rgba(241,231,208,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(joy.bx, joy.by, JR, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,194,58,.6)'; ctx.beginPath(); ctx.arc(joy.bx+dx, joy.by+dy, 20, 0, 7); ctx.fill();
}

// ---------------- scoreboard
const hudCache = {};
const setT = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
function updateHud(){
  if (!G || G.attract) return;
  setT('sH', String(G.score.home)); setT('sA', String(G.score.away));
  setT('clk', `RALLY ${G.rally}`);
  setT('objProg', `Best rally ${G.best}`);
}
