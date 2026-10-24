// Pickle Pirates · HUD drawn over the 3D view, graphics settings and the bridge object the 3D renderer reads
'use strict';
function renderOverlay3D(R3){
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,cw,ch);
  if (!G) return;
  for (const p of G.pops) { const [px, py, ok] = R3.project(p.x, p.y, p.lift ? p.lift + 2.5 : 5); if (ok) drawPop(p, px, py); }
  for (const h of humansAll()) { const [px, py, ok] = R3.project(h.x, h.y, 6.4); if (ok) { if (h.queue) drawQueue(h, px, py); else drawTag(h, px, py); } }
  // off-screen arrow for each human player
  for (const pl of humansAll()) {
    const [px, py] = R3.project(pl.x, pl.y, 0);
    if (py < 8 || py > ch - 8 || px < 4 || px > cw - 4) { const ex = clamp(px, 16, cw - 16), ey = clamp(py, 16, ch - 16), a = Math.atan2(py - ey, px - ex); ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = '#ffc23a'; ctx.strokeStyle = '#150e1c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -9); ctx.lineTo(-7, 9); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore(); }
  }
  drawInk();
  drawJoy();
}
// ---------------- graphics setting
let gfxPref = 'auto';
try { gfxPref = localStorage.getItem('pickle-gfx') || 'auto'; } catch(e) {}
const GFX_OPTS = [['auto','Auto'],['high','High'],['med','Medium'],['low','Low'],['classic','Classic 2D']];
function gfxStatusText(){
  const R3 = window.__r3d, names = { high:'High', med:'Medium', low:'Low' };
  if (gfxPref === 'classic') return 'Classic top-down view.';
  if (!R3 || R3.status === 'loading') return 'Loading the 3D court…';
  if (R3.status === 'failed') return '3D isn\'t available on this device, so the game is using the classic view.';
  return `3D court running on ${names[R3.tier] || R3.tier} quality (${R3.backend}).${gfxPref === 'auto' ? ' Auto lowers quality if the frame rate drops.' : ''}`;
}
function gfxEngine(){ try { return localStorage.getItem('pickle-gfx-engine') || 'webgpu'; } catch(e) { return 'webgpu'; } }
function refreshGfx(){ const el = $('gfxNote'); if (el) el.textContent = gfxStatusText(); document.querySelectorAll('#gfxSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === gfxPref))); const eng = gfxEngine(); document.querySelectorAll('#engSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.e === eng))); }
function setGfx(p){
  gfxPref = p; try { localStorage.setItem('pickle-gfx', p); } catch(e) {}
  const R3 = window.__r3d;
  if (R3) { if (R3.ok && R3.setPref) R3.setPref(p); else if (p !== 'classic') R3.boot(); }
  if (p === 'classic') $('gl').hidden = true;
  refreshGfx();
}
function setEngine(e){
  try { localStorage.setItem('pickle-gfx-engine', e); } catch(err) {}
  const R3 = window.__r3d;
  if (gfxPref !== 'classic' && R3) { if (R3.ok && R3.restart) R3.restart(); else R3.boot(); }
  refreshGfx();
}
window.__sim = {
  humans, reducedMotion: () => !!A11Y.rm,
  audio: () => ({ ctx: AC ? AC.state : null, loaded: Object.values(sfxBuf).reduce((n, l) => n + l.length, 0), crowd: !!crowdSrc, muted, volume, crowdVol, musicVol, music: cueOn() ? musCue.name : null, loop: !!musLoop }),
  get G(){ return G; }, HOME, SPECIES, THEMES,
  C:{ CW, CL, NETY, KD, NET_H_SIDE, NET_H_MID, POST_OUT, BALL_R, PL_R, netH },
  stageW: () => cw, stageH: () => ch,
  gfxPref: () => gfxPref, gfxEngine, on3DStatus: () => refreshGfx(), viewFlip,
  notice: m => { if (G && !G.attract) toast('3D view', m, 2600, 'small'); },
  forceClassic: m => { gfxPref = 'classic'; $('gl').hidden = true; refreshGfx(); if (G && !G.attract) toast('Classic view', m, 3200, 'small'); }
};
// test-only hooks (?debug): fast-forward the simulation and drive the keyboard
if (/[?&]debug\b/.test(location.search)) Object.assign(window.__sim, {
  step(n, dt = 1/60, each){ for (let i = 0; i < n; i++) { if (each) each(i); update(dt); } },
  keys, startPractice: id => startPractice(id), feedBall, predict, launchFor, landedIn, practice,
});
