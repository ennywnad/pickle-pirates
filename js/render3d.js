// Pickle Pirates: comic-book 3D broadcast renderer (three.js WebGPU / WebGL2)
// The engine, cel shading, ink outlines, post-processing, quality tiers and self-check come from Rink Rat Mayhem;
// the court, dock, water, net, ball and the stand-in crew figures are new placeholders for milestone 1.
(() => {
'use strict';
const S = window.__sim;
if (!S) return;
const { CW, CL, NETY, KD, NET_H_SIDE, NET_H_MID, POST_OUT, BALL_R, netH } = S.C;
const DEBUG = /[?&]debug\b/.test(location.search);
const R3 = window.__r3d = { active:false, ok:false, status:'loading', tier:'med', basis:null, pref:'auto' };
let booted = false;
R3.boot = () => {
  if (booted) return; booted = true;
  init().catch(e => { console.warn('[3D] unavailable, using classic view:', e); R3.status = 'failed'; R3.ok = false; R3.active = false; const c = document.getElementById('gl'); if (c) c.hidden = true; if (S.on3DStatus) S.on3DStatus(); });
};
R3.pref = S.gfxPref();
if (R3.pref !== 'classic') R3.boot();

async function init(){
  R3.pref = S.gfxPref() === 'classic' ? 'auto' : S.gfxPref();
  const [THREE, TSL, BloomMod] = await Promise.all([
    import('three/webgpu'), import('three/tsl'), import('three/addons/tsl/display/BloomNode.js')
  ]);
  const { normalWorld, normalView, positionViewDirection, positionWorld, fract, luminance, abs: tAbs, screenCoordinate, vec2, vec3, vec4, float, mix, time, sin, screenUV, smoothstep, pass, step, uniform, oneMinus, length } = TSL;
  const bloomFn = BloomMod.bloom;

  // ------------------------------------------------ renderer
  const engine = S.gfxEngine();
  R3.engine = engine;
  const canvas = document.getElementById('gl');
  canvas.hidden = false;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias:true, powerPreference:'high-performance', forceWebGL: engine !== 'webgpu' });
  await renderer.init();
  renderer.onDeviceLost = info => { console.warn('[3D] GPU device lost:', info && info.message); if (R3.recover) R3.recover('device lost'); };
  R3.restart = () => {
    R3.active = false; R3.ok = false; R3.status = 'loading'; R3.recover = null;
    try { renderer.dispose(); } catch(e) {}
    const old = document.getElementById('gl'), c = document.createElement('canvas'); c.id = 'gl'; c.setAttribute('aria-hidden', 'true'); old.replaceWith(c);
    if (S.on3DStatus) S.on3DStatus();
    booted = false; setTimeout(() => R3.boot(), 50);
  };
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  R3.gpuErrors = [];
  const dev = renderer.backend && renderer.backend.device;
  if (dev && dev.addEventListener) dev.addEventListener('uncapturederror', e => { const m = (e.error && e.error.message || String(e)).slice(0, 400); if (R3.gpuErrors.length < 20) R3.gpuErrors.push(m); console.error('[3D] GPU error:', m); });

  const scene = new THREE.Scene();
  const BG = new THREE.Color(0x0b1418);
  scene.background = BG;
  scene.fog = new THREE.Fog(0x0b1418, 90, 260);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
  cam.position.set(0, 30, 60); cam.lookAt(0, 0, 0);
  if (DEBUG) R3._dbg = { renderer, scene, cam, THREE };

  // court feet -> world: x across, y = height, z down the court (the near baseline is +z, toward the camera)
  const W = (x, y, h = 0, v = new THREE.Vector3()) => v.set(x - CW/2, h, y - NETY);
  const isTouch = matchMedia('(pointer:coarse)').matches;

  // ------------------------------------------------ helpers
  function canvasTex(cvs, srgb = true){ const t = new THREE.CanvasTexture(cvs); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  // comic cel shading: three hard light bands
  function celMat(hex, emis = 0){
    const m = new THREE.MeshBasicNodeMaterial(), c = new THREE.Color(hex);
    const ndl = normalWorld.dot(vec3(0.36, 0.86, 0.36).normalize());
    const tone = mix(float(0.45), mix(float(0.78), float(1.06), step(0.45, ndl)), step(0.03, ndl));
    m.colorNode = vec3(c.r, c.g, c.b).mul(tone.add(emis));
    return m;
  }
  // same bands plus a bright rim, for the characters
  function charMat(hex){
    const m = new THREE.MeshBasicNodeMaterial(), c = new THREE.Color(hex);
    const ndl = normalWorld.dot(vec3(0.36, 0.86, 0.36).normalize());
    const tone = mix(float(0.4), mix(float(0.74), float(1.05), step(0.46, ndl)), step(0.04, ndl));
    const facing = normalView.dot(positionViewDirection).abs();
    const rim = step(0.76, oneMinus(facing)).mul(step(0.0, ndl));
    m.colorNode = vec3(c.r, c.g, c.b).mul(tone).add(vec3(1.0, 0.85, 0.55).mul(rim.mul(0.28)));
    return m;
  }
  const recolor = (m, hex) => { const c = new THREE.Color(hex); m.userData.col.value.set(c.r, c.g, c.b); };
  // a cel material whose color can change per island
  function celVar(hex){ const m = new THREE.MeshBasicNodeMaterial(), c = new THREE.Color(hex), col = uniform(new THREE.Vector3(c.r, c.g, c.b)); const ndl = normalWorld.dot(vec3(0.36, 0.86, 0.36).normalize()); m.colorNode = col.mul(mix(float(0.55), mix(float(0.82), float(1.04), step(0.45, ndl)), step(0.03, ndl))); m.userData.col = col; return m; }
  const inkMat = new THREE.MeshBasicNodeMaterial({ color:0x0b0710, side:THREE.BackSide });
  const withInk = (mesh, k = 1.1) => { const h = new THREE.Mesh(mesh.geometry, inkMat); h.scale.setScalar(k); mesh.add(h); return mesh; };
  // tubes are built in place, so their ink is a fatter tube along the same curve rather than a scaled copy
  const inkTube = (curve, segs, r, mat, k = 1.7) => { const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 6), mat); m.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r*k, 6), inkMat)); return m; };

  // ------------------------------------------------ lights + environment
  const hemi = new THREE.HemisphereLight(0xdde6ff, 0x16181e, 0.55); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0015; key.shadow.normalBias = 0.05;
  Object.assign(key.shadow.camera, { left:-34, right:34, top:34, bottom:-34, near:5, far:160 });
  key.position.set(18, 70, 30); scene.add(key, key.target);

  // sky dome: horizon glow fading to night overhead, tinted per island
  const skyTop = uniform(new THREE.Vector3(0.02, 0.05, 0.08)), skyHz = uniform(new THREE.Vector3(0.4, 0.6, 0.7));
  const skyMat = new THREE.MeshBasicNodeMaterial({ side:THREE.BackSide, fog:false, depthWrite:false });
  { const h = positionWorld.y.div(220).clamp(0, 1); skyMat.colorNode = mix(skyHz, skyTop, smoothstep(0.0, 0.55, h)); }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat); scene.add(sky);

  // water: cel-banded swell with drifting highlight streaks
  const waterCol = uniform(new THREE.Vector3(0.06, 0.3, 0.42));
  const waterMat = new THREE.MeshBasicNodeMaterial();
  { const p = positionWorld, w1 = sin(p.x.mul(0.21).add(time.mul(0.7)).add(sin(p.z.mul(0.13).add(time.mul(0.3))).mul(2.2))), w2 = sin(p.z.mul(0.27).sub(time.mul(0.9)).add(p.x.mul(0.05)));
    const band = step(0.55, w1.mul(0.6).add(w2.mul(0.4))), streak = step(0.93, w1.mul(w2));
    waterMat.colorNode = waterCol.mul(mix(float(0.78), float(1.12), band)).add(vec3(0.55, 0.75, 0.8).mul(streak.mul(0.45))); }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI/2), waterMat); water.position.y = -1.6; scene.add(water);

  // ------------------------------------------------ the dock and the court
  const world = new THREE.Group(); scene.add(world);
  const DECK_W = CW + 16, DECK_L = CL + 18;
  const deckTexC = document.createElement('canvas'); deckTexC.width = 512; deckTexC.height = 1024;
  const deckTex = canvasTex(deckTexC);
  function paintDeck(T){
    const g = deckTexC.getContext('2d'), w = deckTexC.width, h = deckTexC.height, base = new THREE.Color(T.deck);
    g.fillStyle = T.deck; g.fillRect(0, 0, w, h);
    const n = 30, pw = w/n;
    for (let i = 0; i < n; i++) {
      const k = 0.86 + ((i*37) % 11)/11*0.24; g.fillStyle = '#' + base.clone().multiplyScalar(k).getHexString(); g.fillRect(i*pw, 0, pw, h);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i*pw, 0, 2, h);
      for (let j = 0; j < 4; j++) { const y = ((i*131 + j*257) % h); g.fillRect(i*pw, y, pw, 2); g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(i*pw + 4, y + 6, 1.6, 0, 7); g.arc(i*pw + pw - 4, y + 6, 1.6, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,.35)'; }
    }
    deckTex.needsUpdate = true;
  }
  const deckMat = new THREE.MeshBasicNodeMaterial({ map:deckTex });
  { const ndl = normalWorld.dot(vec3(0.36, 0.86, 0.36).normalize()); deckMat.colorNode = TSL.texture(deckTex).rgb.mul(mix(float(0.55), float(1.0), step(0.3, ndl))); }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, 1.2, DECK_L), deckMat); deck.position.y = -0.6; deck.receiveShadow = true; world.add(deck);
  withInk(deck, 1.004);
  // pilings around the edge, a rope rail on posts
  const pileMat = celVar('#5a3e24'), ropeMat = celMat('#d8b878');
  const pileGeo = new THREE.CylinderGeometry(0.7, 0.8, 5, 10);
  for (const sx of [-1, 1]) for (let i = 0; i <= 6; i++) { const m = new THREE.Mesh(pileGeo, pileMat); m.position.set(sx*(DECK_W/2 + 0.3), -1.6, -DECK_L/2 + i*DECK_L/6); withInk(m, 1.08); world.add(m); }
  for (const sz of [-1, 1]) for (let i = 1; i < 4; i++) { const m = new THREE.Mesh(pileGeo, pileMat); m.position.set(-DECK_W/2 + i*DECK_W/4, -1.6, sz*(DECK_L/2 + 0.3)); withInk(m, 1.08); world.add(m); }
  const postGeo = new THREE.CylinderGeometry(0.22, 0.25, 3.4, 8);
  const railPts = [];
  for (const sx of [-1, 1]) for (let i = 0; i <= 8; i++) { const z = -DECK_L/2 + 1 + i*(DECK_L - 2)/8, x = sx*(DECK_W/2 - 0.6); const p = new THREE.Mesh(postGeo, pileMat); p.position.set(x, 1.7, z); world.add(p); railPts.push([x, z, sx]); }
  for (const sx of [-1, 1]) { const pts = railPts.filter(r => r[2] === sx).map(([x, z]) => new THREE.Vector3(x, 3.1, z)); const sag = []; for (let i = 0; i < pts.length - 1; i++) { sag.push(pts[i]); sag.push(pts[i].clone().lerp(pts[i+1], 0.5).add(new THREE.Vector3(0, -0.45, 0))); } sag.push(pts[pts.length-1]); world.add(inkTube(new THREE.CatmullRomCurve3(sag), 64, 0.1, ropeMat)); }
  // barrels and crates on the corners
  const barrelMat = celVar('#8a5a2e'), hoopMat = celMat('#3a3a3a'), crateMat = celVar('#a87a44');
  const barrelGeo = new THREE.CylinderGeometry(1.1, 1.1, 2.6, 14), hoopGeo = new THREE.TorusGeometry(1.14, 0.08, 6, 20).rotateX(Math.PI/2);
  for (const [x, z] of [[-DECK_W/2 + 2.2, -DECK_L/2 + 2.4], [-DECK_W/2 + 4.4, -DECK_L/2 + 2], [DECK_W/2 - 2.4, DECK_L/2 - 2.6], [DECK_W/2 - 2.2, -DECK_L/2 + 3]]) {
    const b = withInk(new THREE.Mesh(barrelGeo, barrelMat), 1.06); b.position.set(x, 1.3, z); b.castShadow = true;
    for (const y of [-0.8, 0.8]) { const h = new THREE.Mesh(hoopGeo, hoopMat); h.position.y = y; b.add(h); }
    world.add(b);
  }
  for (const [x, z, s] of [[DECK_W/2 - 2.2, DECK_L/2 - 5.6, 1.6], [-DECK_W/2 + 2.2, DECK_L/2 - 2.4, 2], [-DECK_W/2 + 2.4, DECK_L/2 - 5, 1.4]]) { const c = withInk(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat), 1.06); c.position.set(x, s/2, z); c.rotation.y = x*0.3; c.castShadow = true; world.add(c); }
  // the ball cannon behind the far baseline
  const cannon = new THREE.Group();
  { const brass = celMat('#c9a24a', 0.08), iron = celMat('#2a2a30'), wood = celMat('#6b4520');
    const barrel = withInk(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 3.6, 16), iron), 1.08); barrel.rotation.x = Math.PI/2 - 0.35; barrel.position.y = 1.9; cannon.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.12, 8, 18), brass); ring.position.set(0, 2.5, 1.55); ring.rotation.x = -0.35; cannon.add(ring);
    const base = withInk(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.6), wood), 1.06); base.position.y = 0.8; cannon.add(base);
    for (const sx of [-1.15, 1.15]) for (const sz of [-0.8, 0.8]) { const w = withInk(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 14), wood), 1.1); w.rotation.z = Math.PI/2; w.position.set(sx, 0.55, sz); cannon.add(w); } }
  W(CW/2, -3.4, 0, cannon.position); world.add(cannon);

  // court surface with lines and kitchens, painted per island
  const PX = 52;   // texture pixels per foot
  const courtTexC = document.createElement('canvas'); courtTexC.width = (CW + 4)*PX; courtTexC.height = (CL + 4)*PX;
  const courtTex = canvasTex(courtTexC);
  function paintCourt(T){
    const g = courtTexC.getContext('2d'), m = 2*PX;
    g.fillStyle = T.out; g.fillRect(0, 0, courtTexC.width, courtTexC.height);
    g.fillStyle = T.court; g.fillRect(m, m, CW*PX, CL*PX);
    g.fillStyle = T.kitchen; g.fillRect(m, m + (NETY - KD)*PX, CW*PX, KD*2*PX);
    // faint paint texture
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()*0.04})`; g.fillRect(Math.random()*courtTexC.width, Math.random()*courtTexC.height, 3, 3); }
    const lw = PX*2/12;
    g.fillStyle = T.line;
    const hl = (y) => g.fillRect(m - lw/2, m + y*PX - lw/2, CW*PX + lw, lw), vl = (x, y0, y1) => g.fillRect(m + x*PX - lw/2, m + y0*PX, lw, (y1 - y0)*PX);
    hl(0); hl(CL); hl(NETY - KD); hl(NETY + KD); vl(0, 0, CL); vl(CW, 0, CL); vl(CW/2, 0, NETY - KD); vl(CW/2, NETY + KD, CL);
    courtTex.needsUpdate = true;
  }
  const courtMat = new THREE.MeshBasicNodeMaterial();
  courtMat.colorNode = TSL.texture(courtTex).rgb;
  const court = new THREE.Mesh(new THREE.PlaneGeometry(CW + 4, CL + 4).rotateX(-Math.PI/2), courtMat); court.position.y = 0.01; court.receiveShadow = true; world.add(court);
  // court shadow catcher: shadows darken the painted court
  const shadowMat = new THREE.ShadowNodeMaterial ? new THREE.ShadowNodeMaterial({ opacity:0.35 }) : null;
  if (shadowMat) { const sc = new THREE.Mesh(new THREE.PlaneGeometry(DECK_W, DECK_L).rotateX(-Math.PI/2), shadowMat); sc.position.y = 0.03; sc.receiveShadow = true; world.add(sc); }

  // net: sagging mesh between two posts, white tape across the top
  const netTexC = document.createElement('canvas'); netTexC.width = 64; netTexC.height = 64;
  { const g = netTexC.getContext('2d'); g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(20,20,24,1)'; g.lineWidth = 6; g.strokeRect(0, 0, 64, 64); }
  const netTex = canvasTex(netTexC); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set((CW + 2*POST_OUT)/0.3, NET_H_SIDE/0.3);
  const netMat = new THREE.MeshBasicNodeMaterial({ map:netTex, transparent:true, side:THREE.DoubleSide, alphaTest:0.4, depthWrite:false });
  const netGeo = new THREE.PlaneGeometry(CW + 2*POST_OUT, 1, 40, 1);
  { const p = netGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + CW/2, top = p.getY(i) > 0; p.setY(i, top ? netH(x) - 0.08 : 0.12); } p.needsUpdate = true; }
  const net = new THREE.Mesh(netGeo, netMat); net.position.set(0, 0, 0); world.add(net);
  const tapePts = []; for (let i = 0; i <= 24; i++) { const x = -POST_OUT + i/24*(CW + 2*POST_OUT); tapePts.push(new THREE.Vector3(x - CW/2, netH(x), 0)); }
  world.add(inkTube(new THREE.CatmullRomCurve3(tapePts), 48, 0.09, celMat('#f4f0e4', 0.15), 1.5));
  const netPostMat = celMat('#26262c');
  for (const x of [-POST_OUT, CW + POST_OUT]) { const p = withInk(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, NET_H_SIDE + 0.3, 10), netPostMat), 1.25); W(x, NETY, (NET_H_SIDE + 0.3)/2, p.position); p.castShadow = true; world.add(p); }

  // ------------------------------------------------ the ball
  const dyn = new THREE.Group(); scene.add(dyn);
  const ballTexC = document.createElement('canvas'); ballTexC.width = 256; ballTexC.height = 128;
  { const g = ballTexC.getContext('2d'); g.fillStyle = '#f4e23a'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#5a5208'; for (let r = 0; r < 4; r++) for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(i*32 + (r % 2)*16 + 8, 20 + r*28, 6.5, 0, 7); g.fill(); } }
  const ballMat = new THREE.MeshBasicNodeMaterial();
  { const ndl = normalWorld.dot(vec3(0.36, 0.86, 0.36).normalize()); ballMat.colorNode = TSL.texture(canvasTex(ballTexC)).rgb.mul(mix(float(0.62), float(1.12), step(0.25, ndl))); }
  const BALL_VIS = BALL_R*1.7;   // a little bigger than life so it reads from the baseline camera
  const ball = withInk(new THREE.Mesh(new THREE.SphereGeometry(BALL_VIS, 20, 14), ballMat), 1.22); ball.castShadow = true; dyn.add(ball);
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const rg = g.createRadialGradient(32,32,0,32,32,32); rg.addColorStop(0,'rgba(0,0,0,.6)'); rg.addColorStop(0.6,'rgba(0,0,0,.3)'); rg.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0,0,64,64); return canvasTex(c, false); })();
  const blobMat = new THREE.MeshBasicNodeMaterial({ map:blobTex, transparent:true, depthWrite:false, color:0x000000 });
  const ballBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI/2), blobMat); ballBlob.renderOrder = 1; dyn.add(ballBlob);
  const landU = uniform(0), landCol = uniform(new THREE.Vector3(2.2, 1.5, 0.25));
  const landMat = new THREE.MeshBasicNodeMaterial({ transparent:true, depthWrite:false }); landMat.colorNode = landCol; landMat.opacityNode = landU;
  // height line: ball down to its shadow
  const hLine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.6, 1.6, 1.5), transparent:true, opacity:0.45, depthWrite:false })); dyn.add(hLine);
  const landing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 32).rotateX(-Math.PI/2), landMat); landing.renderOrder = 2; dyn.add(landing);
  // the human's reach ring (lights up when the ball can be hit) and the aim reticle for a manually aimed shot
  const reachCol = uniform(new THREE.Vector3(1, 1, 1)), reachA = uniform(0.3);
  const reachMat = new THREE.MeshBasicNodeMaterial({ transparent:true, depthWrite:false }); reachMat.colorNode = reachCol; reachMat.opacityNode = reachA;
  const reachRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 48).rotateX(-Math.PI/2), reachMat); reachRing.renderOrder = 2; dyn.add(reachRing);
  const retMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(0.5, 1.9, 2.6), transparent:true, opacity:0.9, depthWrite:false });
  const reticle = new THREE.Group();
  reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 32).rotateX(-Math.PI/2), retMat));
  for (const a of [0, Math.PI/2, Math.PI, Math.PI*1.5]) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12).rotateX(-Math.PI/2), retMat); bar.position.set(Math.cos(a)*1.25, 0, Math.sin(a)*1.25); bar.rotation.y = -a; reticle.add(bar); }
  reticle.renderOrder = 2; dyn.add(reticle);
  const TRAIL_N = 14;
  const trailMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(BALL_VIS*0.8, 0), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(2.0, 1.85, 0.6), transparent:true, opacity:0.45, depthWrite:false }), TRAIL_N); trailMesh.frustumCulled = false; trailMesh.count = 0; dyn.add(trailMesh);
  const PART_MAX = 80;
  const partMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.6, 1.5, 1.3) }), PART_MAX); partMesh.frustumCulled = false; partMesh.count = 0; dyn.add(partMesh);

  // ------------------------------------------------ crew figures (stand-ins until milestone 8's rigged crews)
  const SPEC = S.SPECIES;
  const eyeW = celMat('#f4f0e4', 0.1), eyeB = new THREE.MeshBasicNodeMaterial({ color:0x0b0710 }), hatMat = celMat('#1b1410'), goldMat = celMat('#e0b030', 0.1), paddleMat = celMat('#3a2a1a'), faceMat = celMat('#c8452c');
  function mkFigure(pl){
    const sp = SPEC[pl.species] || SPEC.pickle, pickle = pl.species === 'pickle';
    const root = new THREE.Group(), bob = new THREE.Group(); root.add(bob);
    const bodyH = pickle ? 2.6 : 2.0, bodyR = pickle ? 0.72 : 0.8;
    const body = withInk(new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyH, 6, 14), charMat(sp.body)), 1.07); body.position.y = bodyR + bodyH/2 + 0.55; body.castShadow = true; bob.add(body);
    if (pickle) for (let i = 0; i < 9; i++) { const a = i*2.4, y = -bodyH/2 + 0.3 + (i % 5)*bodyH/5; const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), charMat(sp.acc)); w.position.set(Math.cos(a)*bodyR*0.98, y, Math.sin(a)*bodyR*0.98); body.add(w); }
    // shirt band in the crew's colors
    const shirt = withInk(new THREE.Mesh(new THREE.CylinderGeometry(bodyR*1.06, bodyR*1.1, 0.9, 16, 1, true), charMat(pl.team === 'home' ? '#e8e0c8' : sp.acc)), 1.04); shirt.position.y = -bodyH*0.12; body.add(shirt);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(bodyR*1.08, bodyR*1.08, 0.18, 16, 1, true), charMat(pl.team === 'home' ? '#c8302a' : '#1b1410')); stripe.position.y = -bodyH*0.12; body.add(stripe);
    // eyes (one under a patch for the pirates)
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), eyeW); e.position.set(sx*0.3, bodyH*0.3, bodyR*0.86); const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeB); p.position.z = 0.14; e.add(p); body.add(e); }
    if (pickle) { const patch = new THREE.Mesh(new THREE.CircleGeometry(0.26, 14), eyeB); patch.position.set(0.3, bodyH*0.3, bodyR*0.86 + 0.22); body.add(patch); const strap = new THREE.Mesh(new THREE.TorusGeometry(bodyR*1.01, 0.04, 4, 24), eyeB); strap.position.y = bodyH*0.33; strap.rotation.set(Math.PI/2 - 0.25, 0, 0); body.add(strap); }
    // tricorn hat for the pirates, a bandana for the rest
    if (pickle) { const hat = withInk(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.1, 0.35, 3), hatMat), 1.08); hat.position.y = bodyH/2 + bodyR*0.75; hat.rotation.y = Math.PI/6; body.add(hat); const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.55, 12), hatMat); crown.position.y = 0.35; hat.add(crown); const trim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 4, 16).rotateX(Math.PI/2), goldMat); trim.position.y = 0.08; crown.add(trim); }
    else { const band = withInk(new THREE.Mesh(new THREE.TorusGeometry(bodyR*0.98, 0.13, 6, 20).rotateX(Math.PI/2), faceMat), 1.1); band.position.y = bodyH*0.42; body.add(band); }
    // feet
    for (const sx of [-1, 1]) { const f = withInk(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), charMat('#2a1a10')), 1.1); f.scale.set(1, 0.6, 1.4); f.position.set(sx*0.4, 0.2, 0.15); bob.add(f); }
    // paddle on a pivot at the shoulder: swings forehand
    const pivot = new THREE.Group(); pivot.position.set(pl.team === 'home' ? 0.9 : -0.9, bodyR + bodyH*0.55, 0); bob.add(pivot);
    const paddle = withInk(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 18), paddleMat), 1.15); paddle.scale.set(1, 1, 1.25); paddle.rotation.z = Math.PI/2; paddle.position.set(0.35, -0.2, 0.75); pivot.add(paddle);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), celMat('#1b1410')); handle.position.set(0.2, -0.2, 0.2); handle.rotation.x = Math.PI/2; pivot.add(handle);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI/2), blobMat); blob.scale.set(2.6, 1, 2.6); blob.position.y = 0.04; blob.renderOrder = 1; root.add(blob);
    dyn.add(root);
    return { root, bob, pivot, v:{ x:pl.x, z:pl.y, yaw:0 } };
  }
  let figs = [];
  function buildFigures(G){ for (const f of figs) dyn.remove(f.root); figs = G.players.map(mkFigure); }

  // ------------------------------------------------ post: ink edges, bloom, halftone, vignette
  let post = null, bloomNode = null;
  const vignetteU = uniform(1);
  const texelU = uniform(new THREE.Vector2(1/1000, 1/1000)), shakeU = uniform(0);
  function buildPost(){
    post = post || new THREE.PostProcessing(renderer);
    const sp = pass(scene, cam);
    const tex = sp.getTextureNode('output');
    const off = vec2(texelU.x.mul(shakeU.mul(3.5)), texelU.y.mul(shakeU.mul(1.5)));
    const cR = tex.sample(screenUV.add(off)).r, cB = tex.sample(screenUV.sub(off)).b;
    let col = vec3(cR, tex.g, cB);
    const L = q => { const l = luminance(tex.sample(q).rgb); return l.div(l.add(1)); };
    const o = texelU.mul(1.35);
    const edge = tAbs(L(screenUV.add(vec2(o.x, 0))).sub(L(screenUV.sub(vec2(o.x, 0))))).add(tAbs(L(screenUV.add(vec2(0, o.y))).sub(L(screenUV.sub(vec2(0, o.y))))));
    col = col.mul(oneMinus(smoothstep(0.07, 0.2, edge).mul(0.6)));
    if (R3.tier !== 'low') { bloomNode = bloomFn(tex, 0.35, 0.35, 0.9); col = col.add(bloomNode.rgb); } else bloomNode = null;
    const lc = luminance(col); const lcn = lc.div(lc.add(1));
    const hs = screenCoordinate.xy.div(4.2), hr = vec2(hs.x.add(hs.y), hs.x.sub(hs.y)).mul(0.7071);
    const hd = step(length(fract(hr).sub(0.5)), oneMinus(lcn).mul(0.5));
    col = col.mul(oneMinus(hd.mul(0.08)));
    const d = length(screenUV.sub(0.5));
    const vig = oneMinus(smoothstep(0.38, 0.9, d).mul(0.3).mul(vignetteU));
    post.outputNode = vec4(col.mul(vig), 1);
    post.needsUpdate = true;
  }

  // ------------------------------------------------ tiers
  const TIERS = { low:{ dpr:1.5, shadow:1024 }, med:{ dpr:2, shadow:2048 }, high:{ dpr:2, shadow:2048 } };
  let autoTier = null; try { autoTier = localStorage.getItem('pickle-gfx-auto'); } catch(e) {}
  function pickTier(){ if (R3.pref === 'low' || R3.pref === 'med' || R3.pref === 'high') return R3.pref; if (autoTier && TIERS[autoTier]) return autoTier; return isTouch ? 'med' : 'high'; }
  let curDims = [0, 0, 0];
  function applyTier(t){
    R3.tier = t; const T = TIERS[t];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.dpr)); curDims = [0,0,0];
    key.shadow.mapSize.set(T.shadow, T.shadow); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    buildPost();
    perf.n = 0; perf.sum = 0; perf.skip = 90;
    if (lastG && !lastG.attract) checkPlan.push(performance.now() + 1500);
    if (S.on3DStatus) S.on3DStatus();
  }
  const perf = { n:0, sum:0, skip:90 };
  R3.setPref = p => {
    R3.pref = p;
    if (p === 'classic') { R3.active = false; canvas.hidden = true; return; }
    canvas.hidden = false; R3.active = R3.ok;
    applyTier(pickTier());
  };

  // ------------------------------------------------ camera: behind the near baseline, like TV tennis
  const camS = { px:0, py:30, pz:60, vx:0, vy:0, vz:0, tx:0, ty:0, tz:0, wx:0, wy:0, wz:0 };
  let orbitA = 0, aspect = 1, camCut = true;
  function spring(cur, vel, target, k, dt){ const c = 2*Math.sqrt(k); const a = k*(target - cur) - c*vel; vel += a*dt; return [cur + vel*dt, vel]; }
  const _cf = new THREE.Vector3(), _cr = new THREE.Vector3();
  function updateCamera(G, dt){
    const B = G.ball, bx = B.z > -1 ? B.x - CW/2 : 0, bz = B.z > -1 ? B.y - NETY : 0;
    let tx, ty, tz, px, py, pz;
    if (G.attract) {
      orbitA += dt*0.06; const R = 44;
      tx = 0; ty = 1; tz = 0; px = Math.sin(orbitA)*R; py = 15; pz = Math.cos(orbitA)*R*1.15; cam.fov = 40;
    } else {
      const portrait = aspect < 1.05;
      const pitch = (portrait ? 38 : 25)*Math.PI/180; cam.fov = portrait ? 50 : 36;
      // fit the court's width (plus a margin) across the screen
      const halfW = portrait ? 13 : 19, tanH = Math.tan(cam.fov*Math.PI/360)*aspect;
      const d = clampN(halfW/tanH/Math.cos(pitch)*1.0 + 26, 50, 110);
      tx = clampN(bx*0.25, -4, 4); ty = 0; tz = clampN(bz*0.12, -3, 3) - (portrait ? 1 : 3);
      px = tx*0.6; py = d*Math.sin(pitch); pz = tz + d*Math.cos(pitch);
    }
    const kk = G.attract ? 6 : 14;
    if (camCut) { camCut = false; Object.assign(camS, { tx, ty, tz, px, py, pz, wx:0, wy:0, wz:0, vx:0, vy:0, vz:0 }); }
    [camS.tx, camS.wx] = spring(camS.tx, camS.wx, tx, kk, dt); [camS.ty, camS.wy] = spring(camS.ty, camS.wy, ty, kk, dt); [camS.tz, camS.wz] = spring(camS.tz, camS.wz, tz, kk, dt);
    [camS.px, camS.vx] = spring(camS.px, camS.vx, px, kk, dt); [camS.py, camS.vy] = spring(camS.py, camS.vy, py, kk, dt); [camS.pz, camS.vz] = spring(camS.pz, camS.vz, pz, kk, dt);
    const sh = S.reducedMotion() ? 0 : (G.shake || 0)*0.5;
    cam.position.set(camS.px + (Math.random()-0.5)*sh, camS.py + (Math.random()-0.5)*sh, camS.pz + (Math.random()-0.5)*sh);
    cam.lookAt(camS.tx, camS.ty, camS.tz);
    if (DEBUG && R3.debugCam) { const dd = R3.debugCam(); cam.position.set(...dd.p); cam.lookAt(...dd.t); if (dd.fov) cam.fov = dd.fov; }
    cam.updateProjectionMatrix();
    // input basis (screen right / screen up on the court, in court coords)
    cam.updateMatrixWorld();
    _cr.setFromMatrixColumn(cam.matrixWorld, 0); _cr.y = 0; _cr.normalize();
    _cf.set(0, 0, -1).applyQuaternion(cam.quaternion); _cf.y = 0; _cf.normalize();
    R3.basis = { rx:_cr.x, ry:_cr.z, fx:_cf.x, fy:_cf.z };
    key.position.set(camS.tx + 18, 70, camS.tz + 26); key.target.position.set(camS.tx, 0, camS.tz); key.target.updateMatrixWorld();
  }
  const clampN = (v, a, b) => v < a ? a : v > b ? b : v;
  const _pv = new THREE.Vector3();
  R3.project = (x, y, h) => { _pv.set(x - CW/2, h, y - NETY).project(cam); return [(_pv.x + 1)/2*R3.cw, (1 - _pv.y)/2*R3.ch, _pv.z < 1]; };

  // ------------------------------------------------ per-match sync
  let lastG = null, lastTheme = null, frameN = 0;
  const v3 = hex => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };
  function applyTheme(G){
    const T = G.theme; lastTheme = G.island.id;
    paintCourt(T); paintDeck(T);
    waterCol.value.copy(v3(T.water)); skyHz.value.copy(v3(T.sky)).multiplyScalar(0.8); skyTop.value.copy(v3(T.water)).multiplyScalar(0.25);
    const fog = new THREE.Color(T.sky).multiplyScalar(0.35); scene.fog.color.copy(fog); BG.copy(fog);
    recolor(pileMat, '#' + new THREE.Color(T.deck).multiplyScalar(0.7).getHexString());
  }
  function onNewMatch(G){
    lastG = G; camCut = true;
    if (!G.attract) checkPlan = [2500, 8000, 20000].map(ms => performance.now() + ms);
    if (G.island.id !== lastTheme) applyTheme(G);
    buildFigures(G);
  }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();

  // ------------------------------------------------ self-check: catch static/black output and fall back
  let checkPlan = [], checking = false, recovering = false, pendingFail = false;
  async function selfCheck(){
    checking = true;
    try {
      const Wd = 128, Ht = 224, rt = new THREE.RenderTarget(Wd, Ht);
      renderer.setRenderTarget(rt); post.render(); renderer.setRenderTarget(null);
      const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, Wd, Ht); rt.dispose();
      let diff = 0, lum = 0, n = 0;
      for (let y = Math.floor(Ht*0.3); y < Math.floor(Ht*0.75); y++) for (let x = 12; x < Wd - 13; x++) {
        const i = (y*Wd + x)*4, j = i + 4, q = i + Wd*4;
        const a = px[i] + px[i+1] + px[i+2], b = px[j] + px[j+1] + px[j+2], c = px[q] + px[q+1] + px[q+2];
        diff += Math.abs(a - b) + Math.abs(a - c); lum += a; n++;
      }
      const noise = diff/n/6, L = lum/n/3;
      R3.lastCheck = { noise: Math.round(noise*10)/10, lum: Math.round(L), engine, tier: R3.tier };
      const bad = !(noise < 65) || !(L > 18);
      if (bad && !(DEBUG && R3.debugCam)) {
        if (pendingFail) { pendingFail = false; R3.recover('self-check ' + JSON.stringify(R3.lastCheck)); }
        else { pendingFail = true; checkPlan.unshift(performance.now() + 1200); }
      } else pendingFail = false;
    } catch (e) { console.warn('[3D] self-check skipped:', e); }
    checking = false;
  }
  R3.recover = why => {
    if (recovering) return; recovering = true;
    console.warn('[3D] output problem (' + why + '), engine ' + engine + ', tier ' + R3.tier);
    if (why !== 'device lost' && R3.tier !== 'low') { applyTier('low'); recovering = false; if (S.notice) S.notice('Lowered graphics quality to keep the 3D view working.'); return; }
    if (engine === 'webgpu') { try { localStorage.setItem('pickle-gfx-engine', 'webgl'); } catch(e) {} if (S.notice) S.notice('Switched the 3D engine to WebGL2.'); R3.restart(); return; }
    R3.active = false; R3.status = 'failed'; canvas.hidden = true;
    if (S.forceClassic) S.forceClassic('3D had trouble on this device, so the game switched to the classic view.');
  };

  // ------------------------------------------------ frame
  R3.frame = (dt, tms) => {
    const G = S.G; if (!G) return;
    if (G !== lastG) onNewMatch(G);
    frameN++;
    const t = G.time;
    const cw = R3.cw = S.stageW(), ch = R3.ch = S.stageH(), dpr = renderer.getPixelRatio();
    if (curDims[0] !== cw || curDims[1] !== ch || curDims[2] !== dpr) { renderer.setSize(cw, ch, false); curDims = [cw, ch, dpr]; aspect = cw/ch; cam.aspect = aspect; }
    // crew figures: glide to the sim position, face the way they move, swing the paddle
    G.players.forEach((pl, i) => {
      const f = figs[i]; if (!f) return;
      const v = f.v, k = 1 - Math.exp(-dt*30);
      v.x += (pl.x - v.x)*k; v.z += (pl.y - v.z)*k;
      W(v.x, v.z, 0, f.root.position);
      const fx = Math.cos(pl.face), fz = Math.sin(pl.face);
      let yaw = Math.atan2(fx, fz); let dy = yaw - v.yaw; while (dy > Math.PI) dy -= 2*Math.PI; while (dy < -Math.PI) dy += 2*Math.PI; v.yaw += dy*Math.min(1, dt*12);
      f.root.rotation.y = v.yaw;
      const sp = Math.hypot(pl.vx, pl.vy), hop = pl.split > 0 ? Math.sin(pl.split/0.18*Math.PI)*0.5 : 0;
      f.bob.position.y = hop + (sp > 1 ? Math.abs(Math.sin(t*14 + i))*0.22 : Math.sin(t*3 + i)*0.04);
      // a lunge leans the whole body toward the ball
      const lk = pl.lunge > 0 ? pl.lunge/0.45 : 0;
      f.bob.rotation.z = (sp > 1 ? Math.sin(t*14 + i)*0.06 : 0) - pl.lungeSide*0.45*lk;
      f.bob.position.x = 0;
      // the paddle: ready in front, then a swing across on whichever side the ball was (forehand or backhand)
      const s = pl.swing > 0 ? 1 - pl.swing/0.28 : 0, side = pl.swing > 0 ? pl.swingSide : 1;
      // forehand is the figure's local −x for both crews (each faces the net)
      f.pivot.position.x = -side*0.9;
      f.pivot.rotation.y = -side*(s > 0 ? 1.2 - s*2.6 : 0.9);
      f.pivot.rotation.x = (pl.swingKind === 'lob' || pl.swingKind === 'drop' || pl.swingKind === 'dink') && s > 0 ? -s*0.9 : pl.swingKind === 'smash' && s > 0 ? 1.4 - s*2.2 : 0;
    });
    { const h = !G.attract && G.players.find(p => p.human);
      reachRing.visible = !!h;
      if (h) { const v = figs[G.players.indexOf(h)].v; W(v.x, v.z, 0.05, reachRing.position); reachRing.scale.setScalar(TUNE.reach);
        const live = ballFor(h, G.ball) && contactQ(h, G.ball.x, G.ball.y, G.ball.z, G.ball.bounces > 0);
        if (live) { reachCol.value.set(2.2, 1.5, 0.25); reachA.value = 0.9; } else if (h.queue) { reachCol.value.set(2.2, 1.5, 0.25); reachA.value = 0.45 + 0.25*Math.sin(t*12); } else { reachCol.value.set(1.4, 1.35, 1.2); reachA.value = 0.28; } }
      reticle.visible = !!G.aimPreview;
      if (G.aimPreview) { W(G.aimPreview.x, G.aimPreview.y, 0.07, reticle.position); reticle.rotation.y = t*0.8; } }
    // ball, its shadow, trail and landing marker
    const B = G.ball;
    ball.visible = ballBlob.visible = B.z > -0.5;
    if (ball.visible) {
      W(B.x, B.y, B.z, ball.position);
      ball.rotation.x += B.vy*dt*0.6; ball.rotation.z -= B.vx*dt*0.6;
      W(B.x, B.y, 0.05, ballBlob.position); const sc = Math.max(0.25, 0.9 - B.z*0.06); ballBlob.scale.set(sc, 1, sc);
    }
    { const tr = B.trail, n = Math.min(TRAIL_N, tr.length), fast = Math.hypot(B.vx, B.vy, B.vz) > 45; let c = 0;
      if (fast) for (let i = 0; i < n; i++) { const [x, y, z] = tr[tr.length - 1 - i]; tmpM.compose(W(x, y, z, tmpV), tmpQ.identity(), tmpS.setScalar(Math.max(0.05, 1 - i/n))); trailMesh.setMatrixAt(c++, tmpM); }
      trailMesh.count = c; trailMesh.instanceMatrix.needsUpdate = true; }
    landing.visible = !!G.landing;
    if (G.landing) { W(G.landing.x, G.landing.y, 0.06, landing.position); landU.value = 0.55 + 0.35*Math.sin(t*10); if (G.landing.in) landCol.value.set(2.2, 1.5, 0.25); else landCol.value.set(2.6, 0.5, 0.3); }
    hLine.visible = ball.visible && !!G.cfg.height && B.z > 0.4;
    if (hLine.visible) { W(B.x, B.y, 0.05, hLine.position); hLine.scale.set(1, Math.max(0.01, B.z - BALL_VIS - 0.05), 1); }
    // the cannon moves to wherever it fires from, and kicks back on each shot
    { const C = G.cannon, dir = C.y < NETY ? 1 : -1; W(C.x, C.y - dir*(1.4 + C.kick*0.6), 0, cannon.position); cannon.rotation.y = dir > 0 ? 0 : Math.PI; }
    { let n = 0; for (const p of G.parts) { if (n >= PART_MAX) break; tmpM.compose(W(p.x, p.y, p.z, tmpV), tmpQ.identity(), tmpS.setScalar(p.s*(p.life/p.max))); partMesh.setMatrixAt(n++, tmpM); } partMesh.count = n; partMesh.instanceMatrix.needsUpdate = true; }
    if (R3.cut) { R3.cut = false; camCut = true; }
    updateCamera(G, dt);
    { const db = renderer.getDrawingBufferSize(new THREE.Vector2()); texelU.value.set(1/Math.max(1, db.x), 1/Math.max(1, db.y)); }
    shakeU.value = S.reducedMotion() ? 0 : Math.min(1.2, G.shake || 0);
    post.render();
    if (checkPlan.length && !checking && performance.now() > checkPlan[0]) { checkPlan.shift(); selfCheck(); }
    // perf monitor for the auto tier
    if (R3.pref === 'auto') {
      if (perf.skip > 0) perf.skip--; else { perf.sum += dt; perf.n++; if (perf.n >= 120) { const avg = perf.sum/perf.n; perf.n = 0; perf.sum = 0; if (avg > 0.026 && R3.tier !== 'low') { const nt = R3.tier === 'high' ? 'med' : 'low'; autoTier = nt; try { localStorage.setItem('pickle-gfx-auto', nt); } catch(e) {} applyTier(nt); } } }
    }
  };

  // ------------------------------------------------ go
  if (document.fonts && document.fonts.ready) { try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch(e) {} }
  applyTier(pickTier());
  if (S.G) onNewMatch(S.G);
  R3.ok = true; R3.status = backend; R3.backend = backend;
  R3.pref = S.gfxPref();
  if (R3.pref === 'classic') { R3.active = false; canvas.hidden = true; }
  else { if (pickTier() !== R3.tier) applyTier(pickTier()); R3.active = true; canvas.hidden = false; }
  if (S.on3DStatus) S.on3DStatus();
}
})();
