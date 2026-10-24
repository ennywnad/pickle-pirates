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
// court -> screen; after the ends switch the court is drawn from the other end, so you always play from the bottom
let FLIP = false;
const sx = x => OX + (FLIP ? CW - x : x)*scale, sy = (y, z = 0) => OY + (FLIP ? CL - y : y)*scale - z*scale*0.55;
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
// the shoulder height each crew's swing heights are drawn for (matches the 3D rigs)
const SHOULDER = { pickle:3.0, crab:1.95, skeleton:3.3, monkey:2.75, magma:2.95, squid:2.35, ghost:3.1, deep:2.65 };
function drawPlayer(pl, t){
  const sp = pl.pal ? { ...(SPECIES[pl.species] || SPECIES.pickle), ...pl.pal } : SPECIES[pl.species] || SPECIES.pickle, r = PL_R*scale, hand = handOf(pl), sh = SHOULDER[pl.species] || 3.0;
  const pose = paddlePose(pl, G.time, sh);
  // the lunge is a court-x direction (forehand side = handOf), drawn mirrored when the view is from the other end
  const lean = pl.lunge > 0 ? pl.lungeSide*hand*(FLIP ? -1 : 1)*(pl.lunge/0.45)*0.6*r : 0, hop = (pl.split > 0 ? Math.sin(pl.split/0.18*Math.PI)*r*0.35 : 0) + pose.hop*scale*0.5 - pose.crouch*scale*0.3;
  const x = sx(pl.x) + lean, y = sy(pl.y) - hop;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(sx(pl.x), sy(pl.y) + r*0.3, r*1.1, r*0.5, 0, 0, 7); ctx.fill();
  // the paddle where swings.js puts it (so it meets the ball on the contact frame), on an arm from the shoulder
  const px = sx(pose.head[0]), py = sy(pose.head[1], pose.head[2]), shx = x, shy = y - r*0.9;
  const drawArm = (hx, hy, col) => { ctx.save(); ctx.strokeStyle = '#150e1c'; ctx.lineWidth = Math.max(3, r*0.32); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, r*0.2); ctx.stroke(); ctx.restore(); };
  const armCol = { crab:sp.leg || '#b8432c', skeleton:sp.body, ghost:'rgba(200,250,240,.75)' }[pl.species] || sp.body;
  const behind = py < shy - r*0.2;   // a raised paddle is drawn behind the head
  const drawPaddle = () => { drawArm(px, py, armCol); ctx.fillStyle = '#3a2a1a'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py, r*0.42, r*0.52, Math.atan2(py - shy, px - shx) + Math.PI/2, 0, 7); ctx.fill(); ctx.stroke(); };
  if (behind) drawPaddle();
  drawCrew(pl, sp, x, y, r, t);
  if (!behind) drawPaddle();
  if (pose.mood === 'cheer') { const ox = sx(pose.off[0]), oy = sy(pose.off[1], pose.off[2]); drawArm(ox, oy, armCol); }
}
// each crew's shape from above
function drawCrew(pl, sp, x, y, r, t){
  const ink = '#150e1c', moving = Math.hypot(pl.vx, pl.vy) > 1;
  ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
  const eyes = (ey, dx = 0.3, er = 0.18, white = '#f4f0e4') => { for (const s of [-1, 1]) { ctx.fillStyle = white; ctx.beginPath(); ctx.arc(x + s*r*dx, ey, r*er, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#0b0710'; ctx.beginPath(); ctx.arc(x + s*r*dx, ey, r*er*0.45, 0, 7); ctx.fill(); } };
  const blob = (cx, cy, rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke(); };
  switch (pl.species) {
    case 'crab': {
      ctx.save(); ctx.strokeStyle = sp.leg || '#b8432c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const kx = x + s*r*0.8, ky = y - r*0.5 + k*r*0.18, step = Math.sin(t*14 + k*2)*(moving ? r*0.15 : 0);
        ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + s*r*0.55, ky - r*0.35 + step); ctx.lineTo(kx + s*r*0.85, ky + r*0.45); ctx.stroke(); }
      ctx.restore();
      blob(x, y - r*0.55, r*1.05, r*0.62, sp.body);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s*r*0.3, y - r*1.05); ctx.lineTo(x + s*r*0.35, y - r*1.45); ctx.stroke(); }
      eyes(y - r*1.55, 0.36, 0.2);
      ctx.fillStyle = '#1f3a6a'; ctx.beginPath(); ctx.ellipse(x, y - r*0.95, r*0.6, r*0.18, 0, Math.PI, 0); ctx.fill();
      return;
    }
    case 'skeleton': {
      ctx.save(); ctx.strokeStyle = sp.body; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x, y - r*(0.45 + k*0.28), r*(0.55 - k*0.06), r*0.14, 0, 0, 7); ctx.stroke(); } ctx.restore();
      blob(x, y - r*1.45, r*0.55, r*0.5, sp.body);
      eyes(y - r*1.5, 0.22, 0.16, '#0b0710');
      ctx.fillStyle = '#ff6a3c'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s*r*0.22, y - r*1.5, r*0.05, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#2a2226'; ctx.beginPath(); ctx.moveTo(x - r*0.8, y - r*1.8); ctx.quadraticCurveTo(x, y - r*2.6, x + r*0.8, y - r*1.8); ctx.quadraticCurveTo(x, y - r*2.0, x - r*0.8, y - r*1.8); ctx.fill();
      return;
    }
    case 'monkey': {
      ctx.save(); ctx.strokeStyle = sp.body; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - r*0.3); ctx.quadraticCurveTo(x + r*1.2, y + r*0.1 + Math.sin(t*2.5)*r*0.2, x + r*1.0, y - r*0.8); ctx.stroke(); ctx.restore();
      blob(x, y - r*0.6, r*0.7, r*0.8, sp.body);
      for (const s of [-1, 1]) blob(x + s*r*0.55, y - r*1.45, r*0.2, r*0.2, sp.acc);
      blob(x, y - r*1.4, r*0.5, r*0.48, sp.body); blob(x, y - r*1.3, r*0.32, r*0.26, sp.acc);
      eyes(y - r*1.48, 0.16, 0.11);
      ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.ellipse(x, y - r*1.72, r*0.45, r*0.15, 0, Math.PI, 0); ctx.fill();
      return;
    }
    case 'magma': {
      const k = 0.6 + 0.4*Math.sin(t*3.1);
      ctx.fillStyle = sp.acc; ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i/7*Math.PI*2, rr = r*(0.85 + (i % 2)*0.15); ctx.lineTo(x + Math.cos(a)*rr, y - r*0.8 + Math.sin(a)*rr*1.1); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.strokeStyle = `rgba(255,${120 + 60*k},40,${0.7 + 0.3*k})`; ctx.lineWidth = 2; for (const dy of [-0.4, 0.1]) { ctx.beginPath(); ctx.moveTo(x - r*0.6, y - r*(0.8 + dy)); ctx.lineTo(x - r*0.1, y - r*(0.6 + dy)); ctx.lineTo(x + r*0.6, y - r*(0.85 + dy)); ctx.stroke(); } ctx.restore();
      ctx.fillStyle = '#ffd860'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s*r*0.22, y - r*1.35, r*0.1, 0, 7); ctx.fill(); }
      return;
    }
    case 'squid': {
      ctx.save(); ctx.strokeStyle = sp.body; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let k = 0; k < 6; k++) { const a = (k/5 - 0.5)*1.6, w = Math.sin(t*3 + k)*r*0.15; ctx.beginPath(); ctx.moveTo(x + Math.sin(a)*r*0.4, y - r*0.5); ctx.quadraticCurveTo(x + Math.sin(a)*r*0.9 + w, y - r*0.1, x + Math.sin(a)*r*1.05, y + r*0.3); ctx.stroke(); }
      ctx.restore();
      blob(x, y - r*1.2, r*0.62, r*1.0, sp.body);
      eyes(y - r*0.75, 0.28, 0.2);
      ctx.fillStyle = '#0b0710'; ctx.beginPath(); ctx.arc(x - r*0.28, y - r*0.75, r*0.21, 0, 7); ctx.fill();
      return;
    }
    case 'ghost': {
      const fy = Math.sin(t*2 + pl.slot)*r*0.15;
      ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = sp.body; ctx.beginPath(); ctx.moveTo(x - r*0.8, y - r*0.1 + fy);
      ctx.quadraticCurveTo(x - r*0.85, y - r*2.0 + fy, x, y - r*2.0 + fy); ctx.quadraticCurveTo(x + r*0.85, y - r*2.0 + fy, x + r*0.8, y - r*0.1 + fy);
      for (let i = 0; i < 4; i++) { const x0 = x + r*0.8 - (i + 0.5)*r*0.4; ctx.quadraticCurveTo(x0, y - r*0.4 + fy + Math.sin(t*4 + i)*r*0.08, x0 - r*0.2, y - r*0.1 + fy); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#0b0710'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s*r*0.26, y - r*1.45 + fy, r*0.12, r*0.18, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = sp.acc; ctx.beginPath(); ctx.moveTo(x - r*0.8, y - r*1.85 + fy); ctx.quadraticCurveTo(x, y - r*2.7 + fy, x + r*0.8, y - r*1.85 + fy); ctx.quadraticCurveTo(x, y - r*2.05 + fy, x - r*0.8, y - r*1.85 + fy); ctx.fill();
      return;
    }
    case 'deep': {
      blob(x, y - r*0.85, r*0.95, r*0.85, sp.body);
      ctx.fillStyle = '#0b0710'; ctx.beginPath(); ctx.ellipse(x, y - r*0.6, r*0.55, r*0.25, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#f4f0e4'; for (let i = 0; i < 5; i++) { const tx = x - r*0.4 + i*r*0.2; ctx.beginPath(); ctx.moveTo(tx - r*0.06, y - r*0.6); ctx.lineTo(tx, y - r*0.45); ctx.lineTo(tx + r*0.06, y - r*0.6); ctx.fill(); }
      eyes(y - r*1.15, 0.35, 0.12);
      const k = 0.6 + 0.4*Math.sin(t*4); ctx.save(); ctx.strokeStyle = sp.body; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - r*1.65); ctx.quadraticCurveTo(x + r*0.2, y - r*2.4, x + r*0.55, y - r*2.1); ctx.stroke();
      ctx.fillStyle = `rgba(95,208,255,${0.6 + 0.4*k})`; ctx.shadowColor = '#5fd0ff'; ctx.shadowBlur = 10*k; ctx.beginPath(); ctx.arc(x + r*0.55, y - r*2.05, r*0.16, 0, 7); ctx.fill(); ctx.restore();
      return;
    }
  }
  // the Pickle Pirates: a cucumber in a tricorn
  blob(x, y - r*0.7, r*0.75, r*1.05, sp.body);
  ctx.fillStyle = sp.stripe || '#c8302a'; ctx.fillRect(x - r*0.72, y - r*0.55, r*1.44, r*0.2);
  ctx.fillStyle = sp.hat || '#1b1410'; ctx.beginPath(); ctx.moveTo(x - r*0.95, y - r*1.55); ctx.quadraticCurveTo(x, y - r*2.5, x + r*0.95, y - r*1.55); ctx.quadraticCurveTo(x, y - r*1.75, x - r*0.95, y - r*1.55); ctx.fill();
}
// two humans on the court: a P1 / P2 tag over each, in their own color
const TAG_COL = ['#ffc23a', '#5fd0ff'];
function drawTag(pl, x, y){
  if (G.attract || humansAll().length < 2 || pl.queue) return;
  ctx.save(); ctx.font = '11px Bungee, "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(11,20,24,.85)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 15, y - 9, 30, 18, 5) : ctx.rect(x - 15, y - 9, 30, 18); ctx.fill();
  ctx.fillStyle = TAG_COL[pl.pad] || TAG_COL[0]; ctx.fillText('P' + (pl.pad + 1), x, y + 1); ctx.restore();
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
// island hazards from above: rings, vents and tentacles on the court; fog and the gull over everything
function drawHazardsUnder(t){
  drawBootyUnder(t);
  const H = G.haz; if (!H) return;
  ctx.save();
  const sea = H.sea;
  if (H.kind === 'cannon') for (const z of H.zones) { const k = Math.min(1, z.t/z.warn), rx = z.r*scale, ry = z.r*scale*(sy(1) - sy(0) || scale)/scale;
    ctx.fillStyle = sea ? `rgba(40,110,220,${0.15 + 0.25*k})` : `rgba(255,70,50,${0.15 + 0.25*k})`; ctx.strokeStyle = sea ? `rgba(120,210,255,${0.6 + 0.4*Math.abs(Math.sin(t*10))})` : `rgba(255,90,60,${0.6 + 0.4*Math.abs(Math.sin(t*10))})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(sx(z.x), sy(z.y), rx, Math.abs(ry), 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(sx(z.x), sy(z.y), rx*k, Math.abs(ry)*k, 0, 0, 7); ctx.fill();
    if (sea && !z.hit) { ctx.font = `${Math.round(scale*(0.8 + k*1.2))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1a1e26'; ctx.fillText('⚓', sx(z.x), sy(z.y, (1 - k)*8)); } }
  if (H.kind === 'vents') for (const v of H.vents) { const on = ventOn(v, G.time), warn = ventWarn(v, G.time), x = sx(v.x), y = sy(v.y), R = v.r*scale*0.7;
    // a glowing grate (orange on the volcano, blue on the seabed) that flickers as it rumbles, then the plume
    const glow = on ? 0.95 : warn ? 0.45 + 0.5*Math.abs(Math.sin(t*16)) : 0.25, jx = warn ? Math.sin(t*61)*1.5 : 0;
    ctx.fillStyle = sea ? `rgba(90,200,255,${glow})` : `rgba(255,120,30,${glow})`; ctx.beginPath(); ctx.arc(x + jx, y, R*1.15, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2a30'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + jx, y, R*0.85, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = sea ? `rgba(90,200,255,${glow})` : `rgba(255,140,40,${glow})`; ctx.lineWidth = 2; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + jx + k*R*0.35, y - R*0.6); ctx.lineTo(x + jx + k*R*0.35, y + R*0.6); ctx.stroke(); }
    if (on || warn) { const n = on ? 7 : 3;
      for (let k = 0; k < n; k++) { const u = (t*(on ? 1.2 : 0.9) + k/n) % 1, px = x + Math.sin(t*3 + k*2.1)*R*0.5*(1 + u), py = sy(v.y, u*(on ? 8 : 1.4));
        if (sea) { ctx.strokeStyle = 'rgba(200,240,255,.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, scale*(0.15 + (k % 3)*0.08), 0, 7); ctx.stroke(); }
        else { ctx.fillStyle = `rgba(240,242,245,${(on ? 0.75 : 0.4)*(1 - u*0.6)})`; ctx.beginPath(); ctx.arc(px, py, R*(0.3 + u*(on ? 0.6 : 0.1)), 0, 7); ctx.fill(); } } } }
  if (H.kind === 'tentacles') for (const T of H.tents) { const x = sx(T.x), y = sy(T.y);
    if (T.h < 1) { ctx.strokeStyle = 'rgba(200,140,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, scale*(0.9 + (T.t % 0.5)*2), 0, 7); ctx.stroke(); }
    else { ctx.fillStyle = '#8a4ab0'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - T.r*scale, y); ctx.quadraticCurveTo(x - T.r*scale*0.3, sy(T.y, T.h*0.6), x + Math.sin(t*2)*scale*0.4, sy(T.y, T.h)); ctx.quadraticCurveTo(x + T.r*scale*0.5, sy(T.y, T.h*0.5), x + T.r*scale, y); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
  if (H.kind === 'tilt') { const right = sea ? (H.current > 0) !== !!FLIP : !FLIP;
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '12px Bungee, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(sea ? (right ? 'CURRENT ▶' : '◀ CURRENT') : right ? 'DOWNHILL ▶' : '◀ DOWNHILL', sx(CW/2), sy(NETY + (FLIP ? -1 : 1)*KD*0.5));
    if (sea) { ctx.strokeStyle = 'rgba(200,240,255,.6)'; ctx.lineWidth = 1.2; const span = CW + 8, d = Math.sign(H.current);
      for (let k = 0; k < 40; k++) { const bx = ((((k*0.618) % 1)*span + d*t*(7 + (k % 5)*2)) % span + span) % span - 4, by = ((k*0.381) % 1)*CL, bz = 0.5 + (k % 7);
        ctx.beginPath(); ctx.arc(sx(bx), sy(by, bz), 1.5 + (k % 3), 0, 7); ctx.stroke(); } } }
  ctx.restore();
}
// the Treasure Map's X, and the deck swabber's wet stripe
function drawBootyUnder(t){
  const Y = G.booty, z = Y && Y.zone, S = G.swab;
  ctx.save();
  if (z) { const x = sx(z.x), y = sy(z.y), r = z.r*scale; ctx.strokeStyle = `rgba(255,216,96,${0.65 + 0.3*Math.sin(t*6)})`; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 5; ctx.strokeStyle = '#c8302a'; ctx.beginPath(); ctx.moveTo(x - r*0.45, y - r*0.45); ctx.lineTo(x + r*0.45, y + r*0.45); ctx.moveTo(x + r*0.45, y - r*0.45); ctx.lineTo(x - r*0.45, y + r*0.45); ctx.stroke(); }
  if (S) { const k = S.t/1.6, x = sx(S.dir > 0 ? -4 + k*(CW + 8) : CW + 4 - k*(CW + 8)), y = sy(S.y), x0 = sx(S.dir > 0 ? -4 : CW + 4), fade = Math.max(0, 1 - Math.max(0, S.t - 1.2)/1.2);
    ctx.fillStyle = `rgba(190,230,255,${0.35*fade})`; ctx.fillRect(Math.min(x0, x), y - scale*0.8, Math.abs(x - x0), scale*1.6);
    if (k <= 1) { ctx.fillStyle = '#5aa83e'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - scale*0.8, scale*0.45, scale*0.65, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - scale*0.6); ctx.lineTo(x - S.dir*scale*1.2, y + scale*0.3); ctx.stroke(); } }
  ctx.restore();
}
// Kraken Ink: blots over the screen while your crew is inked
function drawInk(){
  const Y = G && G.booty; if (!Y) return;
  const tm = humansAll().map(h => h.team).find(t => fxOn(t, 'ink')); if (!tm) return;
  const until = Y.fx[tm].ink, left = until - G.time, a = Math.min(1, left/0.6)*0.92;
  let s = Math.floor(until*1000) % 9973; const r = () => (s = (s*16807) % 2147483647)/2147483647;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = `rgba(28,10,40,${a})`;
  for (let i = 0; i < 6; i++) { const x = r()*cw, y = ch*0.15 + r()*ch*0.75, R = Math.min(cw, ch)*(0.12 + r()*0.12);
    ctx.beginPath(); for (let k = 0; k <= 14; k++) { const ang = k/14*Math.PI*2, rr = R*(0.75 + 0.35*Math.sin(k*2.7 + i)); ctx.lineTo(x + Math.cos(ang)*rr, y + Math.sin(ang)*rr); } ctx.fill();
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + (r() - 0.5)*R*3, y + (r() - 0.5)*R*3, R*0.15*r() + 3, 0, 7); ctx.fill(); } }
  ctx.restore();
}
function drawHazardsOver(t){
  const H = G.haz; if (!H) return;
  ctx.save();
  if (H.kind === 'fog' && H.sea) for (const [n, f] of H.fog.entries()) { const dir = f.vx > 0 ? 1 : -1; ctx.fillStyle = n % 2 ? '#bfe0e8' : '#e8d27a';
    for (let k = 0; k < 70; k++) { const r = 0.25 + ((k*0.618) % 1)*0.75, a = dir*t*(0.7 + (k % 5)*0.1) + k*2.39, px = sx(f.x + Math.cos(a)*f.w*r), py = sy(f.y + Math.sin(a)*f.h*r, 0.6 + (k % 9)*0.7);
      ctx.beginPath(); ctx.ellipse(px, py, scale*0.28, scale*0.11, a*dir + Math.PI/2, 0, 7); ctx.fill(); } }
  else if (H.kind === 'fog') for (const f of H.fog) { ctx.fillStyle = 'rgba(225,240,236,.55)'; for (const [dx, dy, k] of [[0, 0, 1], [0.4, -0.3, 0.7], [-0.45, 0.25, 0.75]]) { ctx.beginPath(); ctx.ellipse(sx(f.x + dx*f.w), sy(f.y + dy*f.h), f.w*scale*k, f.h*scale*k*0.9, 0, 0, 7); ctx.fill(); } }
  if (H.gull && H.sea) { const B = G.ball, x = sx(B.x), y = sy(B.y, B.z + 0.6), f = Math.sin(t*5)*5;   // the manta
    ctx.fillStyle = '#2c4a6e'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.quadraticCurveTo(x + 14, y - 6 - f, x + 24, y + f); ctx.quadraticCurveTo(x + 10, y + 3, x, y + 8);
    ctx.quadraticCurveTo(x - 10, y + 3, x - 24, y + f); ctx.quadraticCurveTo(x - 14, y - 6 - f, x, y - 9); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 22); ctx.stroke(); }
  else if (H.gull) { const B = G.ball, x = sx(B.x), y = sy(B.y, B.z + 0.8), f = Math.sin(t*16)*6; ctx.strokeStyle = '#f4f2ec'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 16, y - f); ctx.quadraticCurveTo(x - 7, y - 8, x, y); ctx.quadraticCurveTo(x + 7, y - 8, x + 16, y - f); ctx.stroke(); }
  ctx.restore();
}
function drawBall(){
  const B = G.ball; if (B.z < -0.5 || ballHidden()) return;   // lost in the fog (Ghost Galleon)
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
  if (G.mode === 'game') return;   // stowed for games
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
  FLIP = viewFlip();
  const sh = A11Y.rm ? 0 : G.shake*4;
  ctx.save(); if (sh) ctx.translate((Math.random()-0.5)*sh, (Math.random()-0.5)*sh);
  ctx.drawImage(courtC, 0, 0, cw, ch);
  // the kitchen glows red when a volley from where you stand would fault
  for (const a of G.aids || []) if (a.warn) { const y0 = isNear(a.pl.team) ? NETY : NETY - KD; ctx.fillStyle = `rgba(255,70,50,${0.22 + 0.12*Math.sin(t*14)})`; const ya = sy(y0), yb = sy(y0 + KD); ctx.fillRect(sx(FLIP ? CW : 0), Math.min(ya, yb), CW*scale, Math.abs(yb - ya)); }
  for (const p of G.parts) { ctx.fillStyle = p.c; ctx.globalAlpha = p.life/p.max; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y, p.z), Math.max(1, p.s*scale), 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
  // far side first, then the net, then the near side, so overlaps read right
  const top = y => FLIP ? y > NETY : y <= NETY, far = G.players.filter(p => top(p.y)), near = G.players.filter(p => !top(p.y)), ballFar = top(G.ball.y);
  drawCannon();
  drawHazardsUnder(t);
  for (const a of G.aids || []) { drawReach(a.pl, t); if (a.aim) drawReticle(sx(a.aim.x), sy(a.aim.y), scale*0.9); }
  for (const p of far) drawPlayer(p, t);
  if (ballFar) drawBall();
  drawNet();
  if (!ballFar) drawBall();
  for (const p of near) drawPlayer(p, t);
  drawHazardsOver(t);
  for (const p of G.pops) drawPop(p, sx(p.x), sy(p.y, p.lift || 4));
  for (const h of humansAll()) { drawQueue(h, sx(h.x), sy(h.y) - PL_R*scale*3.2); drawTag(h, sx(h.x), sy(h.y) - PL_R*scale*2.6); }
  ctx.restore();
  drawInk();
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
const setH = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } };
function updateHud(){
  if (!G || G.attract) return;
  // booty held by each crew, and the touch button for P1's crew
  { const Y = G.booty, hb = Y && Y.held.home, ab = Y && Y.held.away, me = humanPl(), mine = Y && me && Y.held[me.team];
    const chip = k => k ? svg('bt_' + k) + BOOTY_SHORT[k].toUpperCase() : '';
    setH('hBooty', chip(hb)); $('hBooty').hidden = !hb; $('hBooty').title = hb ? BOOTY[hb].name + ': ' + BOOTY[hb].desc : '';
    setH('aBooty', chip(ab)); $('aBooty').hidden = !ab; $('aBooty').title = ab ? BOOTY[ab].name + ': ' + BOOTY[ab].desc : '';
    const bb = $('bBooty'); if (bb) { bb.hidden = !mine; if (mine) bb.firstElementChild.textContent = BOOTY_SHORT[mine].toUpperCase(); } }
  setT('sH', String(G.score.home)); setT('sA', String(G.score.away));
  if (G.mode !== 'game') { setT('clk', `RALLY ${G.rally}`); setT('objProg', `Best rally ${G.best}`); return; }
  const S = G.match, gp = gamePoint(S), srv = serverPl(), two = humansAll().length > 1, vs = G.view === 'side';
  setT('clk', scoreCall(S));
  const who = vs ? 'P1 VS P2' : tierOf(awayLead()).name.toUpperCase();
  setT('arenaShort', `TO ${S.to}${S.scoring === 'rally' ? ' · RALLY' : ''}${S.doubles ? ' · DOUBLES' : ''} · ${who}`);
  const mark = S.doubles && S.scoring === 'sideout' ? `● SERVING · ${S.serverNum}` : '● SERVING';
  setT('hSub', S.server === 'home' ? mark : teamName('home').toUpperCase());
  setT('aSub', S.server === 'away' ? mark : teamName('away').toUpperCase());
  const yours = G.state === 'serve' && srv && srv.human;
  const whose = !yours ? '' : two ? `P${srv.pad + 1} to serve` : 'Your serve';
  setT('objText', yours ? `${whose} · press Drive, Soft or Lob` : gp ? `Game point · ${teamName(gp)}` : G.voyage && Math.floor(G.time/7) % 2 === 0 ? `★ ${G.voyage.obj.text} · ${voyProgressText()}` : G.haz ? `${G.island.name} · ${HAZ_NAME[G.haz.kind]}: ${HAZ_TIP[G.haz.kind].toLowerCase()}` : `${G.island.name} · ${S.scoring === 'rally' ? 'rally scoring' : 'side-out scoring'}`);
  const srvName = srv ? (srv.human ? (two ? `P${srv.pad + 1}` : 'you') : `${teamAbbr(srv.team)}${S.doubles ? ' ' + (srv.slot + 1) : ''}`) : '';
  setT('objProg', G.state === 'play' ? `Rally ${G.rally}` : `Server ${srvName} · ${serverCourt(S)} court`);
}
