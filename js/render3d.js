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

  // ------------------------------------------------ Brine Bay: the harbor around the dock (shown on Brine Bay only)
  // A quay with a row of houses and hills behind the far end, a lighthouse, moored boats and the crew's own ship,
  // buoys, and gulls wheeling overhead. Everything bobs or flaps in harbor.userData.tick(t).
  const harbor = new THREE.Group(); harbor.visible = false; scene.add(harbor);
  const bobbers = [], gulls = [];
  {
    const stone = celMat('#8d8577'), sand = celMat('#cdb88a'), hill = celVar('#4f7a3a'), hill2 = celVar('#3f6a33');
    // quay, beach and hills
    const quay = withInk(new THREE.Mesh(new THREE.BoxGeometry(280, 4, 26), stone), 1.002); quay.position.set(0, -0.4, -96); harbor.add(quay);
    const beach = new THREE.Mesh(new THREE.BoxGeometry(280, 1, 10), sand); beach.position.set(0, -1.6, -80); harbor.add(beach);
    for (const [x, z, sx, sy, sz, m] of [[-70, -150, 70, 30, 30, hill], [10, -165, 90, 42, 32, hill2], [90, -150, 70, 26, 30, hill], [-140, -140, 50, 20, 26, hill2]]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m); h.scale.set(sx, sy, sz); h.position.set(x, -6, z); harbor.add(h);
    }
    // houses along the quay: pastel walls, dark pitched roofs, a door and two windows each
    const walls = ['#e8d6b0', '#d98c6a', '#9cc4cc', '#e8c25a', '#c8d8a8', '#e0a8a0', '#a8b8d8'].map(c => celMat(c));
    const roofs = [celMat('#7a2e24'), celMat('#3a3030'), celMat('#5a4030')], dark = celMat('#2a2420');
    let x = -118;
    for (let i = 0; x < 118; i++) {
      const w = 7 + (i*5 % 6), h = 6 + (i*7 % 7), d = 8;
      if (Math.abs(x + w/2) > 6 || i % 3) {   // a gap at the middle for the street down to the water
        const house = new THREE.Group();
        const wall = withInk(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), walls[i % walls.length]), 1.02); wall.position.y = h/2; house.add(wall);
        const rr = d*0.62, roof = withInk(new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, w + 0.6, 3, 1).rotateZ(Math.PI/2).rotateX(-Math.PI/2), roofs[i % roofs.length]), 1.03);
        roof.position.y = h + rr*0.5; house.add(roof);   // a triangular prism along the house, ridge up
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.2), dark); door.position.set(-w*0.2, 1.3, d/2 + 0.05); house.add(door);
        for (const wx of [w*0.18, w*0.36]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.2), dark); win.position.set(wx - w*0.1, h*0.62, d/2 + 0.05); house.add(win); }
        house.position.set(x + w/2, 1.6, -100 + (i % 2)*2.5); harbor.add(house);
      }
      x += w + 0.8;
    }
    // the lighthouse on a rocky point, front left
    const rock = withInk(new THREE.Mesh(new THREE.DodecahedronGeometry(9, 0), celMat('#6e6a62')), 1.03); rock.scale.set(1.4, 0.6, 1.1); rock.position.set(-50, -1.5, -76); harbor.add(rock);
    const lh = new THREE.Group(); lh.position.set(-50, 2, -76); harbor.add(lh);
    const white = celMat('#f2ede0'), red = celMat('#c8302a');
    const tower = withInk(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.3, 22, 16), white), 1.04); tower.position.y = 11; lh.add(tower);
    for (const y of [6, 14]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(2.92 - y*0.047, 3.0 - y*0.047, 3, 16), red); b.position.y = y; lh.add(b); }
    const gallery = withInk(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.6, 16), celMat('#2a2a30')), 1.05); gallery.position.y = 22.3; lh.add(gallery);
    const lampMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(2.4, 2.0, 0.9) });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12), lampMat); lamp.position.y = 23.8; lh.add(lamp);
    const cap = withInk(new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.6, 12), red), 1.05); cap.position.y = 26.3; lh.add(cap);
    harbor.userData.lamp = lampMat;
    // boats: an extruded side profile reads as a hull in the cel style
    const hullGeo = (L, H, beam) => {
      const s = new THREE.Shape(); s.moveTo(-L/2, H); s.lineTo(L/2 + L*0.12, H*1.15); s.quadraticCurveTo(L/2, H*0.1, L*0.2, 0); s.lineTo(-L/2 + L*0.08, 0); s.quadraticCurveTo(-L/2, H*0.2, -L/2, H);
      const g = new THREE.ExtrudeGeometry(s, { depth:beam, bevelEnabled:true, bevelThickness:beam*0.18, bevelSize:H*0.12, bevelSegments:2, curveSegments:8 });
      g.translate(0, 0, -beam/2);
      // shape it: the beam narrows to a point at the bow and tucks in toward the keel
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), u = (x + L/2)/(L*1.12);
        const plan = u < 0.55 ? 1 : Math.max(0.08, Math.cos((u - 0.55)/0.45*Math.PI/2)), keel = 0.45 + 0.55*Math.min(1, Math.max(0, y/H));
        P.setZ(i, P.getZ(i)*plan*keel);
      }
      g.computeVertexNormals(); return g;
    };
    const deckWood = celMat('#6b4a2a');
    const sailMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color('#f2e8cc'), side:THREE.DoubleSide }), mastMat = celMat('#4a3420');
    function boat({ L, H, beam, hull, trim, masts = 0, sails = 'tri', flag = null }){
      const g = new THREE.Group();
      const h = withInk(new THREE.Mesh(hullGeo(L, H, beam), celMat(hull)), 1.03); g.add(h);
      // the deck, sunk a little below the gunwale so the hull reads as a boat, not a block
      const ds = new THREE.Shape(); ds.moveTo(-L/2 + 0.4, -beam*0.42); ds.lineTo(L*0.08, -beam*0.42); ds.quadraticCurveTo(L*0.42, -beam*0.3, L/2 + L*0.05, 0); ds.quadraticCurveTo(L*0.42, beam*0.3, L*0.08, beam*0.42); ds.lineTo(-L/2 + 0.4, beam*0.42); ds.lineTo(-L/2 + 0.4, -beam*0.42);
      const deckM = new THREE.Mesh(new THREE.ShapeGeometry(ds).rotateX(Math.PI/2), deckWood); deckM.position.y = H*0.92; g.add(deckM);
      // a painted band along the topsides in the trim color
      const band = new THREE.Mesh(hullGeo(L*0.999, H, beam*1.01), celMat(trim)); band.scale.set(1, 0.14, 1.02); band.position.y = H*0.74; g.add(band);
      for (let m = 0; m < masts; m++) {
        const mx = masts === 1 ? L*0.05 : -L*0.22 + m*L*0.42, mh = L*(m === 1 ? 0.95 : 0.8);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, mh, 8), mastMat); mast.position.set(mx, H + mh/2, 0); g.add(mast);
        if (sails === 'tri') {
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, mh*0.85); sh.lineTo(-L*0.42, 0.4); sh.lineTo(0, 0);
          const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), sailMat); sail.position.set(mx - 0.2, H + 1, 0); sail.rotation.y = 0.25; g.add(sail);
        } else {
          for (const [y, w] of [[0.38, 1.0], [0.68, 0.8]]) { const sq = new THREE.Mesh(new THREE.PlaneGeometry(beam*1.9*w, mh*0.26), sailMat); sq.position.set(mx + 0.3, H + mh*y, 0); sq.rotation.y = Math.PI/2 - 0.6; g.add(sq); }
        }
        if (flag && m === masts - 1) { const f = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), flag); f.position.set(mx - 1.6, H + mh + 0.6, 0); g.add(f); g.userData.flag = f; }
      }
      return g;
    }
    // the crew's ship: a black jolly roger with crossed paddles
    const flagC = document.createElement('canvas'); flagC.width = 128; flagC.height = 80;
    { const c = flagC.getContext('2d'); c.fillStyle = '#121014'; c.fillRect(0, 0, 128, 80); c.fillStyle = '#f2ede0';
      c.beginPath(); c.ellipse(64, 34, 15, 15, 0, 0, 7); c.fill(); c.fillRect(56, 44, 16, 9);
      c.fillStyle = '#121014'; c.beginPath(); c.arc(58, 34, 4.5, 0, 7); c.arc(70, 34, 4.5, 0, 7); c.fill();
      c.strokeStyle = '#f2ede0'; c.lineWidth = 5; c.lineCap = 'round';
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(64 - s*34, 70); c.lineTo(64 + s*26, 12); c.stroke(); c.beginPath(); c.ellipse(64 + s*28, 10, 7, 9, s*0.6, 0, 7); c.fillStyle = '#f2ede0'; c.fill(); } }
    const flagMat = new THREE.MeshBasicNodeMaterial({ map:canvasTex(flagC), side:THREE.DoubleSide });
    const fleet = [
      [boat({ L:9, H:1.6, beam:3.4, hull:'#8a5a34', trim:'#e8d6b0' }), DECK_W/2 + 5.5, 6, 0.3],                                    // rowboats tied to the dock
      [boat({ L:8, H:1.5, beam:3.2, hull:'#3f6f8a', trim:'#f2ede0' }), -(DECK_W/2 + 6), -14, -0.4],
      [boat({ L:20, H:3.2, beam:6, hull:'#c8452c', trim:'#f2ede0', masts:1 }), -36, -40, -0.7],                                      // a sloop
      [boat({ L:34, H:5.5, beam:10, hull:'#3a2a20', trim:'#c9a24a', masts:2, sails:'square', flag:flagMat }), 42, -52, 0.45],      // the Pickle Pirates' ship
      [boat({ L:16, H:2.6, beam:5, hull:'#e8c25a', trim:'#3a3030', masts:1 }), 70, -30, 1.4],
    ];
    for (const [b, bx, bz, yaw] of fleet) { b.position.set(bx, -1.7, bz); b.rotation.y = yaw; harbor.add(b); bobbers.push({ o:b, y:-1.7, ph:bx*0.37, amp:0.18 + 0.02*Math.abs(bx)/10, roll:0.035 }); }
    // buoys
    for (const [bx, bz, col] of [[24, -18, '#c8302a'], [-26, 4, '#2e8a4a'], [30, 14, '#2e8a4a'], [-34, -30, '#c8302a']]) {
      const b = new THREE.Group(); const cone = withInk(new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 10), celMat(col)), 1.08); cone.position.y = 1.3; b.add(cone);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 10), celMat('#f2ede0')); ring.position.y = 0.2; b.add(ring);
      b.position.set(bx, -1.8, bz); harbor.add(b); bobbers.push({ o:b, y:-1.8, ph:bx, amp:0.3, roll:0.12 });
    }
    // gulls: a white body, two wings that flap, wheeling on wide circles
    const gullW = celMat('#f4f2ec'), gullG = celMat('#9aa0a8');
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(), body = withInk(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), gullW), 1.12); body.scale.set(0.8, 0.7, 1.6); g.add(body);
      const wings = [];
      for (const s of [-1, 1]) { const w = new THREE.Group(); const m = withInk(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.7), s < 0 ? gullW : gullW), 1.1); m.position.x = s*1.1; w.add(m);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.6), gullG); tip.position.x = s*2.0; w.add(tip); g.add(w); wings.push(w); }
      harbor.add(g); gulls.push({ g, wings, r:20 + i*6, h:18 + (i % 3)*5, sp:0.12 + 0.03*(i % 3), ph:i*1.3, cx:(i % 2 ? -12 : 14), cz:-26 + (i % 3)*8 });
    }
    harbor.userData.tick = t => {
      for (const b of bobbers) { b.o.position.y = b.y + Math.sin(t*1.1 + b.ph)*b.amp; b.o.rotation.z = Math.sin(t*0.9 + b.ph)*b.roll; b.o.rotation.x = Math.sin(t*0.7 + b.ph*1.3)*b.roll*0.6; }
      for (const q of gulls) {
        const a = t*q.sp + q.ph; q.g.position.set(q.cx + Math.cos(a)*q.r, q.h + Math.sin(t*0.5 + q.ph)*1.5, q.cz + Math.sin(a)*q.r*0.6);
        q.g.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)*0.6); q.g.rotation.z = 0.25;   // nose along the circle
        const flap = Math.sin(t*7 + q.ph*3)*0.5*(0.5 + 0.5*Math.sin(t*0.6 + q.ph));
        q.wings[0].rotation.z = flap; q.wings[1].rotation.z = -flap;
      }
      lampMat.color.setRGB(2.4, 2.0 + 0.3*Math.sin(t*2), 0.9);
    };
  }

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
  // P2's ring (two-player games) in P2's color
  const reachCol2 = uniform(new THREE.Vector3(0.4, 1.6, 2.4)), reachA2 = uniform(0.3);
  const reachMat2 = new THREE.MeshBasicNodeMaterial({ transparent:true, depthWrite:false }); reachMat2.colorNode = reachCol2; reachMat2.opacityNode = reachA2;
  const reachRing2 = new THREE.Mesh(reachRing.geometry, reachMat2); reachRing2.renderOrder = 2; dyn.add(reachRing2);
  const retMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(0.5, 1.9, 2.6), transparent:true, opacity:0.9, depthWrite:false });
  const reticle = new THREE.Group();
  reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 32).rotateX(-Math.PI/2), retMat));
  for (const a of [0, Math.PI/2, Math.PI, Math.PI*1.5]) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12).rotateX(-Math.PI/2), retMat); bar.position.set(Math.cos(a)*1.25, 0, Math.sin(a)*1.25); bar.rotation.y = -a; reticle.add(bar); }
  reticle.renderOrder = 2; dyn.add(reticle);
  const reticle2 = reticle.clone(); dyn.add(reticle2);
  // kitchen warning: a red wash over your kitchen when a volley from there would fault
  const kwU = uniform(0);
  const kwMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(2.4, 0.35, 0.2), transparent:true, depthWrite:false }); kwMat.opacityNode = kwU;
  const kitchenWarn = new THREE.Mesh(new THREE.PlaneGeometry(CW, KD).rotateX(-Math.PI/2), kwMat); kitchenWarn.position.y = 0.04; kitchenWarn.renderOrder = 1; dyn.add(kitchenWarn);
  const kitchenWarn2 = kitchenWarn.clone(); dyn.add(kitchenWarn2);
  const TRAIL_N = 14;
  const trailMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(BALL_VIS*0.8, 0), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(2.0, 1.85, 0.6), transparent:true, opacity:0.45, depthWrite:false }), TRAIL_N); trailMesh.frustumCulled = false; trailMesh.count = 0; dyn.add(trailMesh);
  const PART_MAX = 80;
  const partMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.6, 1.5, 1.3) }), PART_MAX); partMesh.frustumCulled = false; partMesh.count = 0; dyn.add(partMesh);

  let figs = [];

  // ------------------------------------------------ hazards on the court (hazards.js decides; this draws)
  const hazG = new THREE.Group(); dyn.add(hazG);
  const hzRingMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(2.6, 0.45, 0.3), transparent:true, opacity:0.8, depthWrite:false });
  const hzFillMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(2.2, 0.3, 0.2), transparent:true, opacity:0.25, depthWrite:false });
  const ironMat = celMat('#26262c');
  // cannon rings: an outline, a fill that grows as the shot comes, and the cannonball dropping in at the end
  const zonePool = [0, 1, 2].map(() => { const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI/2), hzRingMat); ring.renderOrder = 2; g.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI/2), hzFillMat); fill.renderOrder = 2; fill.position.y = 0.01; g.add(fill);
    const shot = withInk(new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), ironMat), 1.1); g.add(shot);
    g.visible = false; hazG.add(g); return { g, ring, fill, shot }; });
  // steam vents: an iron grate in the court and a column of steam when it blows
  const steamMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.5, 1.5, 1.5), transparent:true, opacity:0.5, depthWrite:false });
  const ventPool = [0, 1, 2, 3].map(() => { const g = new THREE.Group();
    const grate = withInk(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.06, 20), ironMat), 1.02); grate.position.y = 0.03; g.add(grate);
    for (let i = -2; i <= 2; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.7), celMat('#4a4048')); bar.position.set(i*0.32, 0.07, 0); g.add(bar); }
    const steam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 1, 14, 1, true).translate(0, 0.5, 0), steamMat); steam.renderOrder = 3; g.add(steam);
    g.visible = false; hazG.add(g); return { g, steam }; });
  // tentacles: a curling purple limb with suckers, and a ripple ring while it's coming up
  const tentMat = celMat('#8a4ab0'), suckMat = celMat('#f2a5e0');
  const rippleMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.6, 1.0, 2.2), transparent:true, opacity:0.7, depthWrite:false });
  const tentPool = [0, 1, 2].map(() => { const g = new THREE.Group(), limb = new THREE.Group(); g.add(limb);
    const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0.2, 2, 0.1], [-0.1, 4, 0.3], [0.5, 5.6, 0.2], [1.1, 6.3, -0.2]].map(p => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(curve, 24, 0.7, 10), P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) { const k = 1 - Math.min(1, P.getY(i)/6.5)*0.8, cx = curve.getPoint(Math.max(0, Math.min(1, P.getY(i)/6.4))); P.setX(i, cx.x + (P.getX(i) - cx.x)*k); P.setZ(i, cx.z + (P.getZ(i) - cx.z)*k); }
    geo.computeVertexNormals(); limb.add(withInk(new THREE.Mesh(geo, tentMat), 1.06));
    for (let k = 0; k < 6; k++) { const p = curve.getPoint(0.12 + k*0.13), s = new THREE.Mesh(new THREE.CircleGeometry(0.16*(1 - k*0.1), 10), suckMat); s.position.set(p.x, p.y, p.z + 0.55*(1 - k*0.1)); limb.add(s); }
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 36).rotateX(-Math.PI/2), rippleMat); ripple.position.y = 0.04; ripple.renderOrder = 2; g.add(ripple);
    g.visible = false; hazG.add(g); return { g, limb, ripple }; });
  // fog banks: soft white lumps that drift across
  const fogMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(0.85, 1.0, 0.95), transparent:true, opacity:0.42, depthWrite:false });
  const fogPool = [0, 1, 2].map(() => { const g = new THREE.Group();
    for (const [x, y, z, s] of [[0, 2, 0, 1], [0.5, 4.5, 0.3, 0.75], [-0.55, 3.6, -0.2, 0.8], [0.2, 6.5, 0, 0.55]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), fogMat); m.position.set(x, y, z); m.scale.setScalar(s); m.renderOrder = 4; g.add(m); }
    g.visible = false; hazG.add(g); return g; });
  // the gull that carries the ball off (Brine Bay, and the Locker's gull rounds)
  const carrier = new THREE.Group();
  { const w = celMat('#f4f2ec'), gr = celMat('#9aa0a8'), beak = celMat('#e8b030');
    const body = withInk(new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), w), 1.12); body.scale.set(0.8, 0.7, 1.6); carrier.add(body);
    const head = withInk(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), w), 1.12); head.position.set(0, 0.35, 1.0); carrier.add(head);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), beak); bk.rotation.x = Math.PI/2; bk.position.set(0, 0.3, 1.5); carrier.add(bk);
    carrier.userData.wings = [-1, 1].map(s => { const g = new THREE.Group(); const m = withInk(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.9), w), 1.1); m.position.x = s*1.4; g.add(m);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.11, 0.8), gr); tip.position.x = s*2.6; g.add(tip); carrier.add(g); return g; }); }
  carrier.visible = false; hazG.add(carrier);
  function updateHazards(G, t){
    const H = G.haz, kind = H && H.kind;
    // the tilted deck: the whole court leans toward its downhill side
    const tilt = kind === 'tilt' ? -0.065 : 0; world.rotation.z += (tilt - world.rotation.z)*0.08; dyn.rotation.z = world.rotation.z;
    zonePool.forEach((z, i) => { const Z = kind === 'cannon' && H.zones[i]; z.g.visible = !!Z; if (!Z) return;
      W(Z.x, Z.y, 0.05, z.g.position); const k = Math.min(1, Z.t/Z.warn); z.ring.scale.setScalar(Z.r); z.fill.scale.setScalar(Z.r*k);
      hzRingMat.opacity = 0.55 + 0.4*Math.abs(Math.sin(t*10)); z.shot.visible = Z.t > Z.warn - 0.5 && !Z.hit; z.shot.position.y = Math.max(0.5, (Z.warn - Z.t)*60); });
    ventPool.forEach((v, i) => { const V = kind === 'vents' && H.vents[i]; v.g.visible = !!V; if (!V) return;
      W(V.x, V.y, 0, v.g.position); v.g.scale.set(V.r*0.75, 1, V.r*0.75);
      const on = ventOn(V, G.time), warn = ventWarn(V, G.time); v.steam.visible = on || warn;
      v.steam.scale.set(1, on ? 7 + Math.sin(t*20)*0.6 : 1.2 + Math.sin(t*14)*0.3, 1); steamMat.opacity = on ? 0.55 : 0.35; });
    tentPool.forEach((p, i) => { const T = kind === 'tentacles' && H.tents[i]; p.g.visible = !!T; if (!T) return;
      W(T.x, T.y, 0, p.g.position); p.limb.visible = T.h > 0.05; p.limb.scale.set(T.r/0.7, Math.max(0.01, T.h/6.5), T.r/0.7); p.limb.rotation.y = t*0.6 + i*2; p.limb.rotation.z = Math.sin(t*2.2 + i)*0.12;
      p.ripple.visible = T.h < 1; p.ripple.scale.setScalar(1 + (T.t % 0.5)*2); });
    fogPool.forEach((g, i) => { const F = kind === 'fog' && H.fog[i]; g.visible = !!F; if (!F) return; W(F.x, F.y, 0, g.position); g.scale.set(F.w*0.95, 2.4, F.h*0.95); g.rotation.y = Math.sin(t*0.3 + i)*0.2; });
    carrier.visible = !!(H && H.gull);
    if (carrier.visible) { const B = G.ball, g = H.gull; W(B.x, B.y, B.z + 0.9, carrier.position); carrier.rotation.y = Math.atan2(g.to.x - g.from.x, g.to.y - g.from.y);
      const f = Math.sin(t*16)*0.6; carrier.userData.wings[0].rotation.z = f; carrier.userData.wings[1].rotation.z = -f; }
  }

  // ------------------------------------------------ crew figures
  // Each crew is built from simple shapes in the cel style. Every figure gets the same rig on top: a body group that
  // bobs, twists, crouches and hops with the swing, and two-bone arms that reach the paddle wherever swings.js puts it
  // (the paddle meets the ball on the contact frame). Arms and paddles live in world space and are solved each frame.
  const SPEC = S.SPECIES;
  const SHARED_MATS = new Set();
  const shared = m => { SHARED_MATS.add(m); return m; };
  const eyeW = shared(celMat('#f4f0e4', 0.1)), eyeB = shared(new THREE.MeshBasicNodeMaterial({ color:0x0b0710 })), hatMat = shared(celMat('#1b1410')), goldMat = shared(celMat('#e0b030', 0.1));
  const paddleMat = shared(celMat('#3a2a1a')), paddleEdge = shared(celMat('#d8b878')), faceMat = shared(celMat('#c8452c')), gripMat = shared(celMat('#1b1410'));
  const bandanaMat = shared(celMat('#1f3a6a')), redMat = shared(celMat('#c8302a'));
  const glow = (r, g, b) => new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(r, g, b) });   // > 1 blooms
  SHARED_MATS.add(blobMat); SHARED_MATS.add(inkMat);
  const mesh = (geo, mat, ink) => { const m = new THREE.Mesh(geo, mat); return ink ? withInk(m, ink) : m; };
  const eye = (r, at, parent, pupil = 0.5) => { const e = mesh(new THREE.SphereGeometry(r, 10, 8), eyeW, 1.12); e.position.set(...at); const p = new THREE.Mesh(new THREE.SphereGeometry(r*pupil, 8, 6), eyeB); p.position.z = r*0.7; e.add(p); parent.add(e); return e; };
  const tricorn = (parent, y, s = 1, mat = hatMat) => { const hat = mesh(new THREE.CylinderGeometry(1.05*s, 1.1*s, 0.35*s, 3), mat, 1.08); hat.position.y = y; hat.rotation.y = Math.PI/6; parent.add(hat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5*s, 0.62*s, 0.55*s, 12), mat); crown.position.y = 0.35*s; hat.add(crown);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.62*s, 0.05*s, 4, 16).rotateX(Math.PI/2), goldMat); trim.position.y = 0.08*s; crown.add(trim); return hat; };
  const tube = (pts, r, mat, ink = 1.5) => { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), m = new THREE.Mesh(new THREE.TubeGeometry(c, 16, r, 6), mat); if (ink) m.add(new THREE.Mesh(new THREE.TubeGeometry(c, 16, r*ink, 6), inkMat)); return m; };
  const legPair = (parent, mat, top, spread = 0.4, r = 0.13, foot = '#2a1a10') => { for (const sx of [-1, 1]) { const l = mesh(new THREE.CylinderGeometry(r, r*1.1, top, 8), mat, 1.12); l.position.set(sx*spread, top/2, 0); parent.add(l);
    const f = mesh(new THREE.SphereGeometry(r*2.3, 10, 8), charMat(foot), 1.1); f.scale.set(1, 0.55, 1.4); f.position.set(sx*spread, 0.15, 0.12); parent.add(f); } };

  // every builder adds the body to `bob` and returns the rig: shoulder height and spread (local −x is the player's
  // right, the paddle side), arm segment lengths and thickness, arm and hand materials, and an optional tick(t)
  const CREWS = {
    pickle(pl, sp, bob){   // the Pickle Pirates: cucumbers in eye patches and tricorns
      const body = mesh(new THREE.CapsuleGeometry(0.72, 2.6, 6, 14), charMat(sp.body), 1.07); body.position.y = 0.72 + 1.3 + 0.55; body.castShadow = true; bob.add(body);
      for (let i = 0; i < 9; i++) { const a = i*2.4, y = -1.0 + (i % 5)*0.52; const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), charMat(sp.acc)); w.position.set(Math.cos(a)*0.71, y, Math.sin(a)*0.71); body.add(w); }
      const shirt = mesh(new THREE.CylinderGeometry(0.76, 0.79, 0.9, 16, 1, true), charMat('#e8e0c8'), 1.04); shirt.position.y = -0.31; body.add(shirt);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.18, 16, 1, true), redMat); stripe.position.y = -0.31; body.add(stripe);
      for (const sx of [-1, 1]) eye(0.2, [sx*0.3, 0.78, 0.62], body);
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.26, 14), eyeB); patch.position.set(0.3, 0.78, 0.84); body.add(patch);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.04, 4, 24), eyeB); strap.position.y = 0.86; strap.rotation.set(Math.PI/2 - 0.25, 0, 0); body.add(strap);
      tricorn(body, 1.3 + 0.54);
      for (const sx of [-1, 1]) { const f = mesh(new THREE.SphereGeometry(0.32, 10, 8), charMat('#2a1a10'), 1.1); f.scale.set(1, 0.6, 1.4); f.position.set(sx*0.4, 0.2, 0.15); bob.add(f); }
      return { sy:3.0, sx:0.72, L1:0.85, L2:0.85, r:0.13, arm:charMat(sp.body), hand:charMat(sp.acc) };
    },
    crab(pl, sp, bob){   // the Barnacle Boys: a wide red shell on six legs, eye stalks, barnacles, a bandana
      const shellM = charMat(sp.body), legM = charMat('#b8432c');
      const shell = mesh(new THREE.SphereGeometry(1, 18, 12), shellM, 1.07); shell.scale.set(1.3, 0.72, 1.0); shell.position.y = 1.75; shell.castShadow = true; bob.add(shell);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI*2, Math.PI/2, Math.PI/2), charMat(sp.acc)); belly.scale.set(1.18, 0.5, 0.9); belly.position.y = 1.62; bob.add(belly);
      for (let i = 0; i < 7; i++) { const a = i*2.1 + 0.4, r = 0.55 + (i % 3)*0.18; const bn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 6), charMat(sp.acc)); bn.position.set(Math.cos(a)*r*1.1, 2.18 + 0.05*(i % 2), Math.sin(a)*r*0.7 - 0.15); bob.add(bn); }
      const band = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI*2, 0, Math.PI*0.32), bandanaMat, 1.05); band.scale.set(1.0, 0.72, 0.8); band.position.set(0, 1.83, -0.05); bob.add(band);
      const knot = mesh(new THREE.SphereGeometry(0.16, 8, 6), bandanaMat, 1.1); knot.position.set(0.15, 2.3, -0.62); bob.add(knot);
      for (const sx of [-1, 1]) { const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.75, 6), shellM); stalk.position.set(sx*0.36, 2.55, 0.55); stalk.rotation.x = 0.25; bob.add(stalk); eye(0.21, [sx*0.38, 2.98, 0.66], bob); }
      const legs = [];
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
        const leg = new THREE.Group(); leg.position.set(sx*1.05, 1.55, 0.45 - k*0.45); leg.rotation.y = sx*(k - 1)*0.35;
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 6), legM); up.rotation.z = sx*1.0; up.position.set(sx*0.38, 0.22, 0); leg.add(up);
        const down = mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.75, 6), legM, 1.12); down.rotation.z = -sx*0.28; down.position.set(sx*0.95, -0.55, 0); leg.add(down);
        bob.add(leg); legs.push(leg);
      }
      return { sy:1.95, sx:1.05, sz:0.45, L1:0.75, L2:0.8, r:0.11, arm:legM, hand:shellM, claw:true, tick:(t, moving) => legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t*16 + i*1.7)*0.25 : 0; }) };
    },
    skeleton(pl, sp, bob){   // the Skeleton Scallywags: bones, a grin and a battered hat
      const bone = charMat(sp.body);
      const skull = mesh(new THREE.SphereGeometry(0.58, 14, 10), bone, 1.08); skull.scale.set(1, 1.05, 1.05); skull.position.y = 4.05; bob.add(skull);
      const jaw = mesh(new THREE.BoxGeometry(0.62, 0.22, 0.5), bone, 1.08); jaw.position.set(0, 3.55, 0.12); bob.add(jaw);
      for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), eyeB); s.position.set(sx*0.22, 4.1, 0.46); bob.add(s); const g = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), (glow(2.6, 0.5, 0.3))); g.position.set(sx*0.22, 4.1, 0.6); bob.add(g); }
      for (let i = 0; i < 4; i++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), eyeB); tooth.position.set(-0.15 + i*0.1, 3.62, 0.38); bob.add(tooth); }
      const spine = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 6), bone, 1.15); spine.position.y = 2.6; bob.add(spine);
      for (let i = 0; i < 4; i++) { const rib = mesh(new THREE.TorusGeometry(0.55 - i*0.07, 0.06, 6, 18), bone, 1.15); rib.rotation.x = Math.PI/2; rib.scale.set(1, 0.75, 1); rib.position.y = 3.25 - i*0.28; bob.add(rib); }
      const pelvis = mesh(new THREE.TorusGeometry(0.36, 0.1, 6, 14), bone, 1.12); pelvis.rotation.x = Math.PI/2; pelvis.position.y = 1.6; bob.add(pelvis);
      legPair(bob, bone, 1.55, 0.3, 0.08, '#1b1410');
      tricorn(bob, 4.6, 0.85, (celMat('#2a2226')));
      const sash = mesh(new THREE.TorusGeometry(0.42, 0.09, 6, 16), redMat, 1.08); sash.rotation.x = Math.PI/2; sash.position.y = 1.85; bob.add(sash);
      return { sy:3.3, sx:0.62, L1:0.85, L2:0.85, r:0.07, arm:bone, hand:bone, tick:t => { jaw.position.y = 3.55 - Math.max(0, Math.sin(t*9))*0.06; } };
    },
    monkey(pl, sp, bob){   // the Powder Monkeys: quick, long-armed, a tail and a red bandana
      const fur = charMat(sp.body), tan = charMat(sp.acc);
      const body = mesh(new THREE.SphereGeometry(0.8, 14, 10), fur, 1.07); body.scale.set(0.95, 1.1, 0.85); body.position.y = 2.05; body.castShadow = true; bob.add(body);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), tan); belly.scale.set(0.9, 1.1, 0.5); belly.position.set(0, 1.95, 0.45); bob.add(belly);
      const head = mesh(new THREE.SphereGeometry(0.62, 14, 10), fur, 1.07); head.position.y = 3.35; bob.add(head);
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), tan); face.scale.set(1, 0.85, 0.6); face.position.set(0, 3.25, 0.38); bob.add(face);
      for (const sx of [-1, 1]) { const ear = mesh(new THREE.SphereGeometry(0.24, 10, 8), fur, 1.1); ear.scale.set(1, 1, 0.5); ear.position.set(sx*0.62, 3.45, 0); bob.add(ear); const inner = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), tan); inner.position.set(sx*0.64, 3.45, 0.08); bob.add(inner); eye(0.13, [sx*0.18, 3.45, 0.55], bob, 0.6); }
      const band = mesh(new THREE.SphereGeometry(0.64, 14, 8, 0, Math.PI*2, 0, Math.PI*0.35), redMat, 1.05); band.position.y = 3.38; bob.add(band);
      const tail = tube([[0, 1.5, -0.6], [0.2, 1.2, -1.3], [0.7, 1.8, -1.7], [0.6, 2.5, -1.5], [0.3, 2.6, -1.1]], 0.08, fur);
      bob.add(tail);
      legPair(bob, fur, 1.3, 0.38, 0.13, sp.acc);
      return { sy:2.75, sx:0.72, L1:1.0, L2:1.0, r:0.11, arm:fur, hand:tan, tick:t => { tail.rotation.y = Math.sin(t*2.5)*0.4; } };
    },
    magma(pl, sp, bob){   // the Magma Mutineers: black rock with molten seams that glow
      const rock = charMat(sp.acc), hot = glow(2.6, 0.9, 0.2);
      const core = mesh(new THREE.DodecahedronGeometry(1.0, 0), rock, 1.06); core.scale.set(1.1, 1.25, 0.95); core.position.y = 2.2; core.castShadow = true; bob.add(core);
      const head = mesh(new THREE.DodecahedronGeometry(0.58, 0), rock, 1.07); head.position.y = 3.6; head.rotation.y = 0.5; bob.add(head);
      for (const [y, r] of [[1.7, 0.95], [2.5, 1.05], [3.0, 0.75]]) { const seam = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 18), hot); seam.rotation.x = Math.PI/2 + (y - 2.4)*0.3; seam.position.y = y; bob.add(seam); }
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), (glow(2.8, 2.2, 0.5))); e.position.set(sx*0.2, 3.65, 0.5); bob.add(e); }
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.05), hot); mouth.position.set(0, 3.38, 0.52); bob.add(mouth);
      legPair(bob, rock, 1.2, 0.42, 0.2, '#1a1008');
      return { sy:2.95, sx:0.95, L1:0.85, L2:0.85, r:0.17, arm:rock, hand:hot, tick:t => { const k = 0.75 + 0.35*Math.sin(t*3.1); hot.color.setRGB(2.6*k, 0.9*k, 0.2*k); } };
    },
    squid(pl, sp, bob){   // the Squid Squad: a tall mantle, big eyes, tentacles that never keep still
      const skin = charMat(sp.body), pink = charMat(sp.acc);
      const mantle = mesh(new THREE.SphereGeometry(0.75, 16, 12), skin, 1.07); mantle.scale.set(1, 1.6, 0.95); mantle.position.y = 3.25; mantle.castShadow = true; bob.add(mantle);
      for (const sx of [-1, 1]) { const fin = mesh(new THREE.ConeGeometry(0.35, 0.8, 4), skin, 1.08); fin.rotation.z = sx*1.1; fin.position.set(sx*0.6, 4.2, 0); bob.add(fin); eye(0.26, [sx*0.33, 2.55, 0.55], bob, 0.55); }
      for (let i = 0; i < 5; i++) { const spot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), pink); const a = i*1.3 - 2.4; spot.position.set(Math.sin(a)*0.72, 3.4 + (i % 2)*0.5, Math.cos(a)*0.66); bob.add(spot); }
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), eyeB); patch.position.set(-0.33, 2.55, 0.83); bob.add(patch);
      const tents = [];
      for (let i = 0; i < 6; i++) {
        const a = (i/6)*Math.PI*2 + 0.3, g = new THREE.Group(); g.position.set(Math.cos(a)*0.45, 2.0, Math.sin(a)*0.4);
        g.add(tube([[0, 0, 0], [Math.cos(a)*0.25, -0.7, Math.sin(a)*0.25], [Math.cos(a)*0.55, -1.4, Math.sin(a)*0.5], [Math.cos(a)*0.95, -1.85, Math.sin(a)*0.85]], 0.1, skin));
        bob.add(g); tents.push(g);
      }
      return { sy:2.35, sx:0.62, L1:0.95, L2:1.0, r:0.09, arm:skin, hand:pink, tick:t => tents.forEach((g, i) => { g.rotation.x = Math.sin(t*3 + i)*0.15; g.rotation.z = Math.cos(t*2.6 + i*1.3)*0.15; }) };
    },
    ghost(pl, sp, bob){   // the Drowned Crew: a glowing sheet with a ragged hem, hollow eyes, a waterlogged hat
      const sheet = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(sp.body).multiplyScalar(1.25), transparent:true, opacity:0.78, side:THREE.DoubleSide, depthWrite:false });
      const prof = []; for (let i = 0; i <= 14; i++) { const u = i/14, y = 0.5 + u*3.6, r = u > 0.75 ? Math.sqrt(Math.max(0, 1 - ((u - 0.75)/0.25)**2))*0.85 : 0.85 + (0.75 - u)*0.35; prof.push(new THREE.Vector2(Math.max(0.01, r), y)); }
      const geo = new THREE.LatheGeometry(prof, 24), P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) if (P.getY(i) < 0.9) { const a = Math.atan2(P.getZ(i), P.getX(i)); P.setY(i, P.getY(i) + Math.sin(a*7)*0.18); }
      const body = new THREE.Mesh(geo, sheet); body.castShadow = true; bob.add(body);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), (glow(0.6, 1.8, 1.6))); inner.position.y = 3.0; inner.scale.set(1, 1.2, 1); bob.add(inner);
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), eyeB); e.scale.set(1, 1.4, 0.5); e.position.set(sx*0.28, 3.55, 0.72); bob.add(e); }
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), eyeB); mouth.scale.set(1, 1.3, 0.4); mouth.position.set(0, 3.1, 0.78); bob.add(mouth);
      tricorn(bob, 4.15, 0.85, (celMat(sp.acc)));
      const ghostArm = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(sp.body).multiplyScalar(1.2), transparent:true, opacity:0.7, depthWrite:false });
      return { sy:3.1, sx:0.8, L1:0.9, L2:0.9, r:0.12, arm:ghostArm, hand:ghostArm, float:0.35, tick:t => { body.rotation.y = Math.sin(t*1.3)*0.08; sheet.opacity = 0.72 + 0.08*Math.sin(t*2); } };
    },
    deep(pl, sp, bob){   // Davy's Deep Ones: anglerfish on legs, all teeth and a glowing lure
      const skin = charMat(sp.body), lure = glow(0.8, 2.4, 3.0);
      const body = mesh(new THREE.SphereGeometry(1.15, 16, 12), skin, 1.06); body.scale.set(1, 0.95, 1.05); body.position.y = 2.3; body.castShadow = true; bob.add(body);
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI*2, Math.PI*0.55, Math.PI*0.3), eyeB); mouth.position.set(0, 2.55, 0.55); mouth.rotation.x = -0.4; bob.add(mouth);
      for (let i = 0; i < 7; i++) { const a = -0.9 + i*0.3, tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), eyeW); tooth.position.set(Math.sin(a)*0.62, 2.2 + Math.abs(a)*0.12, 0.88 + Math.cos(a)*0.1); tooth.rotation.x = Math.PI; bob.add(tooth); }
      for (const sx of [-1, 1]) { eye(0.14, [sx*0.45, 3.05, 0.88], bob, 0.6); const fin = mesh(new THREE.ConeGeometry(0.3, 0.75, 3), charMat(sp.acc), 1.08); fin.rotation.z = sx*Math.PI/2; fin.position.set(sx*1.15, 2.3, -0.1); bob.add(fin); }
      const stalk = tube([[0, 3.35, 0.1], [0, 4.2, 0.3], [0, 4.4, 0.9], [0, 4.0, 1.35]], 0.05, skin, 1.6); bob.add(stalk);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lure); bulb.position.set(0, 3.9, 1.38); bob.add(bulb);
      const tailFin = mesh(new THREE.ConeGeometry(0.5, 0.9, 3), charMat(sp.acc), 1.08); tailFin.rotation.x = -Math.PI/2; tailFin.position.set(0, 2.3, -1.4); bob.add(tailFin);
      legPair(bob, skin, 1.3, 0.45, 0.14, '#1a3040');
      return { sy:2.65, sx:1.05, L1:0.8, L2:0.85, r:0.13, arm:skin, hand:charMat(sp.acc), tick:t => { const k = 0.7 + 0.4*Math.sin(t*4); lure.color.setRGB(0.8*k, 2.4*k, 3.0*k); bulb.position.y = 3.9 + Math.sin(t*2)*0.06; } };
    },
  };

  // the rig: arm segments (unit cylinders stretched between joints), a hand, and a paddle
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
  const paddleFace = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 18).rotateX(Math.PI/2).scale(1, 1.25, 1);   // face normal +z, long axis +y
  const paddleRim = new THREE.TorusGeometry(0.42, 0.035, 4, 24).scale(1, 1.25, 1);
  const paddleGrip = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8);
  function mkPaddle(){
    const g = new THREE.Group();
    const face = withInk(new THREE.Mesh(paddleFace, paddleMat), 1.12); face.position.y = 0.8; g.add(face);
    const rim = new THREE.Mesh(paddleRim, paddleEdge); rim.position.y = 0.8; g.add(rim);
    const grip = new THREE.Mesh(paddleGrip, gripMat); grip.position.y = 0.1; g.add(grip);
    return g;
  }
  function mkArm(rig, limbs, withPaddle){
    const up = withInk(new THREE.Mesh(unitCyl, rig.arm), 1.0), fore = withInk(new THREE.Mesh(unitCyl, rig.arm), 1.0);
    up.children[0].scale.set(1.35, 1, 1.35); fore.children[0].scale.set(1.35, 1, 1.35);   // ink a little fatter, not longer
    const hand = withInk(new THREE.Mesh(new THREE.SphereGeometry(rig.r*1.7, 10, 8), rig.hand), 1.15);
    limbs.add(up, fore, hand);
    const a = { up, fore, hand, paddle:null, pincer:null };
    if (withPaddle) { a.paddle = mkPaddle(); limbs.add(a.paddle); }
    else if (rig.claw) {   // the crab's spare claw: a big pincer instead of a hand
      const p = new THREE.Group(), palm = withInk(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), rig.hand), 1.1); palm.scale.set(0.8, 1.15, 0.7); p.add(palm);
      const pin = withInk(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), rig.hand), 1.12); pin.position.set(0.12, 0.65, 0); p.add(pin);
      const dac = withInk(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 6), rig.hand), 1.12); dac.position.set(-0.12, 0.6, 0); p.add(dac);
      hand.visible = false; limbs.add(p); a.pincer = p; a.dactyl = dac;
    }
    return a;
  }
  function mkFigure(pl){
    const sp = SPEC[pl.species] || SPEC.pickle;
    const root = new THREE.Group(), bob = new THREE.Group(); root.add(bob);
    const rig = (CREWS[pl.species] || CREWS.pickle)(pl, sp, bob);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI/2), blobMat); blob.scale.set(pl.species === 'crab' ? 3.4 : 2.6, 1, pl.species === 'crab' ? 2.8 : 2.6); blob.position.y = 0.04; blob.renderOrder = 1; root.add(blob);
    const limbs = new THREE.Group();
    const main = mkArm(rig, limbs, true), off = mkArm(rig, limbs, false);
    dyn.add(root); dyn.add(limbs);
    return { root, bob, limbs, rig, main, off, v:{ x:pl.x, z:pl.y, yaw:0 } };
  }
  // two-bone reach from the shoulder S to the target T: the elbow bends down and out; stretches a little if it must
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();
  function segment(m, from, to, r){
    _a.subVectors(to, from); const len = Math.max(0.01, _a.length());
    m.position.copy(from); m.quaternion.setFromUnitVectors(_Y, _a.divideScalar(len)); m.scale.set(r, len, r);
  }
  function reach(arm, S, T, rig, outward, elbowOut){
    const L1 = rig.L1, L2 = rig.L2; _b.subVectors(T, S); let d = _b.length(); const dir = _b.clone().divideScalar(Math.max(0.001, d));
    const k = d > (L1 + L2)*0.995 ? d/((L1 + L2)*0.995) : 1;   // out of reach: stretch (it's a cartoon)
    const l1 = L1*k, l2 = L2*k; d = Math.max(Math.abs(l1 - l2) + 0.01, d);
    const a = (l1*l1 - l2*l2 + d*d)/(2*d), h = Math.sqrt(Math.max(0, l1*l1 - a*a));
    _c.set(0, -1, 0).addScaledVector(outward, 0.8); _c.addScaledVector(dir, -_c.dot(dir)); if (_c.lengthSq() < 1e-6) _c.set(0, -1, 0); _c.normalize();
    elbowOut.copy(S).addScaledVector(dir, a).addScaledVector(_c, h);
    segment(arm.up, S, elbowOut, rig.r); segment(arm.fore, elbowOut, T, rig.r*0.9);
    arm.hand.position.copy(T);
  }
  // the paddle: grip at the hand, face pointing the way the swing is going (or at the net when still)
  function placePaddle(arm, hand, head, faceDir){
    _d.subVectors(head, hand).normalize(); _e.copy(faceDir).addScaledVector(_d, -faceDir.dot(_d)); if (_e.lengthSq() < 1e-6) _e.set(0, 1, 0).addScaledVector(_d, -_d.y); _e.normalize();
    _c.crossVectors(_d, _e); _m.makeBasis(_c, _d, _e); arm.paddle.quaternion.setFromRotationMatrix(_m); arm.paddle.position.copy(hand);
  }
  function buildFigures(G){ for (const f of figs) { dyn.remove(f.root); dyn.remove(f.limbs); disposeFigure(f.root); disposeFigure(f.limbs); } figs = G.players.map(mkFigure); }

  // a new match builds new figures: free the old ones' geometry and their own materials (the shared ones stay)
  const SHARED_GEOS = new Set([unitCyl, paddleFace, paddleRim, paddleGrip]);
  function disposeFigure(root){
    const geos = new Set(), mats = new Set();
    root.traverse(o => { if (o.geometry && !SHARED_GEOS.has(o.geometry)) geos.add(o.geometry); for (const m of [].concat(o.material || [])) if (!SHARED_MATS.has(m)) mats.add(m); });
    geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
  }


  // ------------------------------------------------ the other six islands' sets (each shown on its own island)
  const sets = {}, setTicks = {};
  const mk = (geo, mat, ink) => { const m = new THREE.Mesh(geo, mat); return ink ? withInk(m, ink) : m; };
  const curveTube = (pts, r, mat, segs = 16, ink = 1.4) => { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), m = new THREE.Mesh(new THREE.TubeGeometry(c, segs, r, 8), mat); if (ink) m.add(new THREE.Mesh(new THREE.TubeGeometry(c, segs, r*ink, 8), inkMat)); return m; };
  function palm(x, z, h = 12, lean = 0.3){
    const g = new THREE.Group(), trunk = curveTube([[0, 0, 0], [lean*2, h*0.5, 0], [lean*5, h, 0]], 0.45, celMat('#8a6a44'), 12, 1.25); g.add(trunk);
    for (let i = 0; i < 6; i++) { const a = i/6*Math.PI*2, leaf = mk(new THREE.ConeGeometry(0.9, 6, 4), celMat(i % 2 ? '#3f7a30' : '#4f8f3a'), 1.06); leaf.scale.set(1, 1, 0.25);
      leaf.position.set(lean*5 + Math.cos(a)*2.4, h - 0.6, Math.sin(a)*2.4); leaf.rotation.set(Math.sin(a)*1.2, 0, -Math.cos(a)*1.2); g.add(leaf); }
    g.position.set(x, -1.2, z); return g;
  }
  function hull(L, H, beam, col){   // a simple boat hull, tapered at the bow (same idea as the harbor boats)
    const s = new THREE.Shape(); s.moveTo(-L/2, H); s.lineTo(L/2 + L*0.12, H*1.15); s.quadraticCurveTo(L/2, H*0.1, L*0.2, 0); s.lineTo(-L/2 + L*0.08, 0); s.quadraticCurveTo(-L/2, H*0.2, -L/2, H);
    const geo = new THREE.ExtrudeGeometry(s, { depth:beam, bevelEnabled:false, curveSegments:8 }); geo.translate(0, 0, -beam/2);
    const P = geo.attributes.position; for (let i = 0; i < P.count; i++) { const u = (P.getX(i) + L/2)/(L*1.12), plan = u < 0.55 ? 1 : Math.max(0.08, Math.cos((u - 0.55)/0.45*Math.PI/2)); P.setZ(i, P.getZ(i)*plan*(0.5 + 0.5*Math.min(1, P.getY(i)/H))); }
    geo.computeVertexNormals(); return mk(geo, celMat(col), 1.03);
  }
  function mast(h, sail, mat){ const g = new THREE.Group(); g.add(mk(new THREE.CylinderGeometry(0.3, 0.4, h, 8), celMat('#4a3420'), 1.1)); g.children[0].position.y = h/2;
    if (sail) for (const [y, w] of [[0.45, 1], [0.72, 0.8]]) { const sq = new THREE.Mesh(new THREE.PlaneGeometry(9*w, h*0.22, 6, 2), mat); const P = sq.geometry.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, Math.cos(P.getX(i)/(9*w)*Math.PI)*0.9); sq.position.set(0, h*y, 0.9); g.add(sq);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 10*w, 6), celMat('#4a3420')); yard.rotation.z = Math.PI/2; yard.position.set(0, h*y + h*0.11, 0.7); g.add(yard); }
    return g; }
  // Shipwreck Shoals: a sand island behind, palms, a beached wreck with a broken mast and a skull flag
  { const g = new THREE.Group(); sets.wreck = g;
    const sand = mk(new THREE.SphereGeometry(1, 24, 12), celVar('#d8c08a')); sand.scale.set(120, 6, 40); sand.position.set(0, -4.5, -95); g.add(sand);
    const shoal = mk(new THREE.SphereGeometry(1, 20, 10), celVar('#cdb07a')); shoal.scale.set(26, 2.2, 14); shoal.position.set(-44, -2.6, -20); g.add(shoal);
    for (const [x, z, h, l] of [[-40, -88, 14, 0.4], [-28, -94, 11, -0.3], [18, -90, 15, 0.2], [46, -84, 12, -0.5], [-48, -22, 10, 0.5]]) g.add(palm(x, z, h, l));
    const wreck = hull(36, 7, 11, '#3a2a1e'); wreck.position.set(36, -2.5, -46); wreck.rotation.set(0.05, 0.6, 0.32); g.add(wreck);
    const broken = mast(18, false); broken.position.set(30, 2, -44); broken.rotation.set(0.2, 0, -0.9); g.add(broken);
    const flagC = document.createElement('canvas'); flagC.width = 96; flagC.height = 64; { const c = flagC.getContext('2d'); c.fillStyle = '#1b1416'; c.fillRect(0, 0, 96, 64); c.fillStyle = '#efe8d4'; c.beginPath(); c.arc(48, 26, 13, 0, 7); c.fill(); c.fillRect(41, 34, 14, 9); c.fillStyle = '#1b1416'; c.beginPath(); c.arc(43, 25, 4, 0, 7); c.arc(53, 25, 4, 0, 7); c.fill(); c.strokeStyle = '#efe8d4'; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 52); c.lineTo(76, 12); c.moveTo(20, 12); c.lineTo(76, 52); c.stroke(); }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3, 8, 2), new THREE.MeshBasicNodeMaterial({ map:canvasTex(flagC), side:THREE.DoubleSide })); flag.position.set(18, 10, -40); g.add(flag);
    const pole = mk(new THREE.CylinderGeometry(0.15, 0.15, 12, 6), celMat('#4a3420'), 1.1); pole.position.set(15.7, 5, -40); g.add(pole);
    for (const [x, z, s] of [[-30, -60, 3], [26, -62, 2.4], [-52, -40, 2], [50, -20, 2.8]]) { const r = mk(new THREE.DodecahedronGeometry(s, 0), celMat('#6e6a62'), 1.05); r.position.set(x, -1.2, z); g.add(r); }
    setTicks.wreck = t => { const P = flag.geometry.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getX(i)*1.2 + t*5)*0.25*(P.getX(i) + 2.25)/4.5); P.needsUpdate = true; };
  }
  // Cannon Cove: the court is a galleon's main deck: cannons along both rails, masts and sails fore and aft, a fort on the cliff
  { const g = new THREE.Group(); sets.cannon = g;
    const iron = celMat('#2a2a30'), carriage = celMat('#6b4520'), sail = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color('#f2e8cc'), side:THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const side = hull(DECK_L + 10, 6, 1.4, '#5a3a20'); side.rotation.y = Math.PI/2; side.position.set(sx*(DECK_W/2 + 1.6), -5.5, 0); side.scale.set(1, 1, 1); g.add(side);
      for (let i = 0; i < 6; i++) { const c = new THREE.Group(), z = -DECK_L/2 + 5 + i*(DECK_L - 10)/5;
        const barrel = mk(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 12), iron, 1.1); barrel.rotation.z = sx*Math.PI/2; barrel.position.set(sx*0.6, 1.1, 0); c.add(barrel);
        const car = mk(new THREE.BoxGeometry(1.6, 0.7, 1.2), carriage, 1.06); car.position.y = 0.45; c.add(car);
        c.position.set(sx*(DECK_W/2 - 1.6), 0, z); g.add(c); }
    }
    for (const [x, z, h] of [[0, -DECK_L/2 - 4, 34], [-DECK_W/2 - 2, -DECK_L/2 + 6, 24], [DECK_W/2 + 2, -DECK_L/2 + 6, 24]]) { const m = mast(h, true, sail); m.position.set(x, 0, z); m.scale.setScalar(x ? 0.8 : 1); g.add(m); }   // fore and side masts, all beyond the far baseline: nothing in front of the camera
    const wheel = new THREE.Group(); const rim = mk(new THREE.TorusGeometry(1.2, 0.12, 6, 20), carriage, 1.1); wheel.add(rim); for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 5), carriage); sp.rotation.z = i*Math.PI/8; wheel.add(sp); }
    wheel.position.set(DECK_W/2 - 3, 2.2, -DECK_L/2 + 1.5); g.add(wheel);
    const cliff = mk(new THREE.SphereGeometry(1, 16, 10), celVar('#8a7a64')); cliff.scale.set(60, 26, 30); cliff.position.set(-60, -6, -130); g.add(cliff);
    const fort = mk(new THREE.CylinderGeometry(6, 7, 14, 10), celMat('#b8ab90'), 1.03); fort.position.set(-52, 22, -120); g.add(fort);
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), celMat('#b8ab90')); const a = i/10*Math.PI*2; m.position.set(-52 + Math.cos(a)*6.3, 29.6, -120 + Math.sin(a)*6.3); g.add(m); }
    const smoke = []; for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.3, 1.3, 1.3), transparent:true, opacity:0.5, depthWrite:false })); g.add(s); smoke.push(s); }
    setTicks.cannon = t => { wheel.rotation.z = Math.sin(t*0.4)*0.3; smoke.forEach((s, i) => { const u = (t*0.25 + i/4) % 1; s.position.set(-46 + u*6, 30 + u*14, -116); s.scale.setScalar(1 + u*3); s.material.opacity = 0.5*(1 - u); }); };
  }
  // Volcano Isle: a volcano behind, glowing at the top with lava running down, black rocks all round
  { const g = new THREE.Group(); sets.volcano = g;
    const VX = 10, VY = 50, VZ = -125;   // close enough that its slopes and lava show above the far baseline
    const cone = mk(new THREE.ConeGeometry(64, 60, 24, 1, true), celVar('#2a1e1a')); cone.position.set(VX, VY - 30, VZ); g.add(cone);
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1, 20), glow(2.8, 1.0, 0.25)); crater.position.set(VX, VY - 2, VZ); g.add(crater);
    const lavaMat = glow(2.6, 0.8, 0.2), flows = [];
    for (const [a, len] of [[-0.5, 1], [0.15, 0.8], [0.6, 0.9]]) { const pts = []; for (let k = 0; k <= 6; k++) { const u = k/6*len, r = 9 + u*58; pts.push([VX + Math.sin(a + Math.sin(k)*0.06)*r, VY - 2 - u*55, VZ + Math.cos(a)*r*0.95]); }
      const f = curveTube(pts, 1.1, lavaMat, 24, 0); g.add(f); flows.push(f); }
    for (const [x, z, s] of [[-30, -40, 4], [32, -48, 5], [-44, -10, 3], [40, 4, 3.5], [-26, 24, 2.6], [30, 30, 3]]) { const r = mk(new THREE.DodecahedronGeometry(s, 0), celMat('#1c1614'), 1.05); r.position.set(x, -1.3, z); r.rotation.set(x, z, 0); g.add(r);
      const seam = new THREE.Mesh(new THREE.TorusGeometry(s*0.8, 0.12, 4, 12), lavaMat); seam.position.set(x, -0.6, z); seam.rotation.x = Math.PI/2; g.add(seam); }
    const puffs = []; for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(0.35, 0.3, 0.3), transparent:true, opacity:0.6, depthWrite:false })); g.add(s); puffs.push(s); }
    setTicks.volcano = t => { const k = 0.8 + 0.25*Math.sin(t*2); lavaMat.color.setRGB(2.6*k, 0.8*k, 0.2*k); puffs.forEach((s, i) => { const u = (t*0.08 + i/5) % 1; s.position.set(VX + Math.sin(i*2 + t*0.2)*8*u, VY + 2 + u*40, VZ); s.scale.setScalar(1 + u*2.5); s.material.opacity = 0.6*(1 - u); }); };
  }
  // Kraken's Reach: the court floats on a raft of logs; the kraken's arms curl out of the water all around
  { const g = new THREE.Group(); sets.kraken = g;
    const log = celMat('#7a5a34');
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) { const l = mk(new THREE.CylinderGeometry(1.1, 1.1, DECK_L + 4, 12), log, 1.04); l.rotation.x = Math.PI/2; l.position.set(sx*(DECK_W/2 + 0.6 + i*2.1), -0.9 - i*0.3, 0); g.add(l); }
    for (const sz of [-1, 1]) { const l = mk(new THREE.CylinderGeometry(1.1, 1.1, DECK_W + 8, 12), log, 1.04); l.rotation.z = Math.PI/2; l.position.set(0, -0.9, sz*(DECK_L/2 + 0.8)); g.add(l); }
    const arm = celMat('#7a3a9a'), arms = [];
    for (const [x, z, h, s] of [[-38, -40, 22, 1], [42, -30, 26, -1], [-46, 8, 16, 1], [48, 18, 18, -1], [8, -70, 30, 1]]) {
      const a = new THREE.Group(); a.add(curveTube([[0, -2, 0], [s*2, h*0.4, 1], [s*5, h*0.8, 0], [s*3, h, -2], [s*0.5, h*0.9, -2.5]], 1.6, arm, 24, 1.15)); a.position.set(x, -1, z); g.add(a); arms.push(a); }
    const pool = new THREE.Mesh(new THREE.RingGeometry(14, 16, 40).rotateX(-Math.PI/2), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(0.5, 0.9, 1.1), transparent:true, opacity:0.35, depthWrite:false })); pool.position.set(8, -1.5, -70); g.add(pool);
    setTicks.kraken = t => { arms.forEach((a, i) => { a.rotation.z = Math.sin(t*0.7 + i*1.7)*0.12; a.rotation.y = Math.sin(t*0.4 + i)*0.3; }); pool.rotation.y = t*0.4; };
  }
  // Ghost Galleon: a spectral ship: glowing tattered sails, green lanterns, a big moon
  { const g = new THREE.Group(); sets.ghost = g;
    const ghostSail = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(0.55, 1.4, 1.2), transparent:true, opacity:0.4, side:THREE.DoubleSide, depthWrite:false });
    for (const [x, z, h] of [[0, -DECK_L/2 - 4, 34], [-DECK_W/2 - 3, -DECK_L/2 + 8, 22], [DECK_W/2 + 3, -DECK_L/2 + 8, 22]]) { const m = mast(h, true, ghostSail); m.position.set(x, 0, z); m.scale.setScalar(x ? 0.8 : 1); g.add(m); }
    const moon = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.6, 1.8, 1.7), fog:false })); moon.position.set(-80, 90, -260); g.add(moon);
    const flame = glow(0.6, 2.6, 1.4), lamps = [];
    for (const [x, z] of [[-DECK_W/2 + 1, -DECK_L/2 + 2], [DECK_W/2 - 1, -DECK_L/2 + 2], [-DECK_W/2 + 1, DECK_L/2 - 2], [DECK_W/2 - 1, DECK_L/2 - 2], [-DECK_W/2 + 1, 0], [DECK_W/2 - 1, 0]]) {
      const pole = mk(new THREE.CylinderGeometry(0.15, 0.18, 6, 6), celMat('#22343a'), 1.1); pole.position.set(x, 3, z); g.add(pole);
      const lamp = mk(new THREE.BoxGeometry(0.8, 1.1, 0.8), celMat('#1b1416'), 1.08); lamp.position.set(x, 6.3, z); g.add(lamp);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), flame); f.position.set(x, 6.3, z); g.add(f); lamps.push(f); }
    const wisps = []; for (let i = 0; i < 8; i++) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), flame); g.add(w); wisps.push(w); }
    setTicks.ghost = t => { lamps.forEach((f, i) => f.scale.setScalar(0.8 + 0.35*Math.sin(t*9 + i*2))); wisps.forEach((w, i) => { const a = t*0.3 + i*0.8; w.position.set(Math.cos(a)*(DECK_W/2 + 6 + i), 4 + Math.sin(t*1.2 + i)*2, Math.sin(a)*(DECK_L/2 + 6)); }); ghostSail.opacity = 0.32 + 0.1*Math.sin(t*1.5); };
  }
  // Davy's Locker: the seabed: sand, kelp swaying, coral, treasure chests, fish going round, bubbles rising
  { const g = new THREE.Group(); sets.locker = g;
    const bed = mk(new THREE.CircleGeometry(300, 48).rotateX(-Math.PI/2), celVar('#c2a878')); bed.position.y = -1.4; g.add(bed);
    const kelpMat = celMat('#2f7a4a'), kelps = [];
    for (let i = 0; i < 16; i++) { const a = i/16*Math.PI*2, r = 34 + (i*37 % 20), x = Math.cos(a)*r*1.3, z = Math.sin(a)*r - 20; if (Math.abs(x) < DECK_W/2 + 6 && Math.abs(z) < DECK_L/2 + 6) continue;
      const k = new THREE.Group(); k.add(curveTube([[0, 0, 0], [0.8, 5, 0], [-0.6, 10, 0.4], [0.5, 15 + (i % 4)*3, 0]], 0.35, kelpMat, 16, 1.25)); k.position.set(x, -1.4, z); g.add(k); kelps.push(k); }
    const corals = ['#ff7a8a', '#ffb070', '#c78cff', '#5fd0ff']; for (let i = 0; i < 12; i++) { const a = i*2.3, r = 30 + (i % 4)*8, c = mk(new THREE.IcosahedronGeometry(1.4 + (i % 3)*0.6, 0), celMat(corals[i % 4]), 1.06); c.position.set(Math.cos(a)*r*1.2, -0.8, Math.sin(a)*r - 15); c.scale.y = 1.4; g.add(c); }
    const gold = glow(2.4, 1.9, 0.5);
    for (const [x, z, ry] of [[-30, -38, 0.4], [28, -44, -0.3], [36, 20, 0.8]]) { const ch = new THREE.Group(); ch.add(mk(new THREE.BoxGeometry(3, 1.8, 2), celMat('#6b4520'), 1.06)); const lid = mk(new THREE.CylinderGeometry(1, 1, 3, 10, 1, false, 0, Math.PI), celMat('#6b4520'), 1.06); lid.rotation.z = Math.PI/2; lid.position.y = 0.9; ch.add(lid);
      const glint = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 1.6), gold); glint.position.y = 1.0; ch.add(glint); ch.position.set(x, -0.5, z); ch.rotation.y = ry; g.add(ch); }
    const fishMat = [celMat('#ffcf6a'), celMat('#5fd0ff'), celMat('#ff7a8a')], fish = [];
    for (let i = 0; i < 9; i++) { const f = new THREE.Group(), b = mk(new THREE.SphereGeometry(0.6, 8, 6), fishMat[i % 3], 1.12); b.scale.set(0.6, 0.8, 1.4); f.add(b); const tail = mk(new THREE.ConeGeometry(0.5, 0.8, 3), fishMat[i % 3], 1.1); tail.rotation.x = -Math.PI/2; tail.position.z = -1.1; f.add(tail); g.add(f); fish.push(f); }
    const bubMat = new THREE.MeshBasicNodeMaterial({ color:new THREE.Color(1.2, 1.6, 1.8), transparent:true, opacity:0.45, depthWrite:false }), bubbles = [];
    for (let i = 0; i < 24; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.25 + (i % 3)*0.12, 8, 6), bubMat); g.add(b); bubbles.push({ b, x:(i*37 % 70) - 35, z:(i*53 % 80) - 50, s:2 + (i % 5)*0.6, o:i*1.7 }); }
    setTicks.locker = t => { kelps.forEach((k, i) => { k.rotation.z = Math.sin(t*0.8 + i)*0.12; k.rotation.x = Math.cos(t*0.6 + i*1.3)*0.08; });
      fish.forEach((f, i) => { const a = t*(0.15 + (i % 3)*0.05) + i*0.7, r = 26 + i*3; f.position.set(Math.cos(a)*r, 6 + (i % 4)*3 + Math.sin(t + i)*0.6, Math.sin(a)*r*0.7 - 10); f.rotation.y = -a; });
      bubbles.forEach(q => { const y = ((t*q.s + q.o) % 30) - 1; q.b.position.set(q.x + Math.sin(t*2 + q.o)*0.4, y, q.z); }); };
  }
  for (const g of Object.values(sets)) { g.visible = false; scene.add(g); }

  // ------------------------------------------------ post: ink edges, bloom, halftone, vignette
  let post = null, bloomNode = null;
  const vignetteU = uniform(1);
  const texelU = uniform(new THREE.Vector2(1/1000, 1/1000)), shakeU = uniform(0), _dbSize = new THREE.Vector2();
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
  let orbitA = 0, aspect = 1, camCut = true, lastFlip = 1;
  function spring(cur, vel, target, k, dt){ const c = 2*Math.sqrt(k); const a = k*(target - cur) - c*vel; vel += a*dt; return [cur + vel*dt, vel]; }
  const _cf = new THREE.Vector3(), _cr = new THREE.Vector3();
  function updateCamera(G, dt){
    const flip = S.viewFlip() ? -1 : 1;   // after the ends switch the camera sits behind the other baseline
    if (flip !== lastFlip) { lastFlip = flip; camCut = true; }
    const B = G.ball, bx = B.z > -1 ? (B.x - CW/2)*flip : 0, bz = B.z > -1 ? (B.y - NETY)*flip : 0;
    let tx, ty, tz, px, py, pz;
    if (G.attract) {
      orbitA += dt*0.06; const R = 44;
      tx = 0; ty = 1; tz = 0; px = Math.sin(orbitA)*R; py = 15; pz = Math.cos(orbitA)*R*1.15; cam.fov = 40;
    } else if (G.view === 'side') {
      // P1 against P2: a broadcast view from the side of the court, so neither end is favored
      const portrait = aspect < 1.05, pitch = (portrait ? 58 : 33)*Math.PI/180; cam.fov = portrait ? 52 : 36;
      const halfL = portrait ? 16 : 29, tanH = Math.tan(cam.fov*Math.PI/360)*aspect;
      const d = clampN(halfL/tanH/Math.cos(pitch) + 16, 45, 130);
      tx = 0; ty = 0; tz = clampN((B.z > -1 ? B.y - NETY : 0)*0.15, -4, 4);
      px = d*Math.cos(pitch); py = d*Math.sin(pitch); pz = tz;
    } else {
      const portrait = aspect < 1.05;
      const pitch = (portrait ? 38 : 25)*Math.PI/180; cam.fov = portrait ? 50 : 36;
      // fit the court's width (plus a margin) across the screen
      const halfW = portrait ? 13 : 19, tanH = Math.tan(cam.fov*Math.PI/360)*aspect;
      const d = clampN(halfW/tanH/Math.cos(pitch)*1.0 + 26, 50, 110);
      tx = clampN(bx*0.25, -4, 4); ty = 0; tz = clampN(bz*0.12, -3, 3) - (portrait ? 1 : 3);
      px = tx*0.6; py = d*Math.sin(pitch); pz = tz + d*Math.cos(pitch);
    }
    if (flip < 0) { tx = -tx; tz = -tz; px = -px; pz = -pz; }
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
    R3.basis = { rx:_cr.x, ry:_cr.z, fx:_cf.x, fy:_cf.z, flip };   // flip: which end the camera was behind when this was measured
    key.position.set(camS.tx + 18, 70, camS.tz + 26); key.target.position.set(camS.tx, 0, camS.tz); key.target.updateMatrixWorld();
  }
  const isNearS = tm => tm === S.G.near;
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
    harbor.visible = G.island.id === 'brine';
    for (const [id, g] of Object.entries(sets)) g.visible = id === G.island.id;
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
  R3.mem = () => { const m = renderer.info && renderer.info.memory; return m ? { geometries:m.geometries, textures:m.textures } : null; };   // for the smoke test
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
      // a lunge leans the whole body toward the ball; the swing twists, crouches and hops it (swings.js)
      const rig = f.rig, pose = paddlePose(pl, G.time, rig.sy), lk = pl.lunge > 0 ? pl.lunge/0.45 : 0;
      f.bob.position.y += pose.hop - pose.crouch*0.6 + (rig.float ? rig.float + Math.sin(t*2 + i)*0.15 : 0);
      f.bob.rotation.z = (sp > 1 ? Math.sin(t*14 + i)*0.06 : 0) - pl.lungeSide*0.45*lk;
      f.bob.rotation.y = -pose.twist; f.bob.rotation.x = pose.lean + pose.crouch*0.25;
      f.bob.position.x = 0;
      if (rig.tick) rig.tick(t + i, sp > 1);
      f.root.updateMatrixWorld(true);
      // arms: the paddle arm reaches the paddle (its face center is the swing point), the other arm its own pose
      const S1 = f.bob.localToWorld(tmpV.set(-rig.sx, rig.sy, rig.sz || 0)).clone(), S2 = f.bob.localToWorld(tmpV.set(rig.sx, rig.sy, rig.sz || 0)).clone();
      const head = W(pose.head[0], pose.head[1], pose.head[2], new THREE.Vector3()), off = W(pose.off[0], pose.off[1], pose.off[2], new THREE.Vector3());
      const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)), out1 = new THREE.Vector3(-Math.cos(v.yaw), 0, Math.sin(v.yaw)), out2 = out1.clone().negate();
      const u = head.clone().sub(S1); const ul = u.length(); u.divideScalar(Math.max(0.001, ul));
      const hand = head.clone().addScaledVector(u, -Math.min(0.8, ul*0.6));
      reach(f.main, S1, hand, rig, out1, f.elbow1 || (f.elbow1 = new THREE.Vector3()));
      placePaddle(f.main, hand, head, fwd);
      reach(f.off, S2, off, rig, out2, f.elbow2 || (f.elbow2 = new THREE.Vector3()));
      if (f.off.pincer) { f.off.pincer.position.copy(off); tmpV.subVectors(off, f.elbow2).normalize(); f.off.pincer.quaternion.setFromUnitVectors(_Y, tmpV); f.off.dactyl.rotation.z = -Math.max(0, Math.sin(t*5 + i*2))*0.5; }
    });
    // each human's reach ring, kitchen warning and aim reticle (P1 gold, P2 blue)
    { const aids = (!G.attract && G.aids) || [], rings = [[reachRing, reachCol, reachA, [2.2, 1.5, 0.25]], [reachRing2, reachCol2, reachA2, [0.4, 1.6, 2.4]]];
      const warns = [kitchenWarn, kitchenWarn2], rets = [reticle, reticle2];
      for (let k = 0; k < 2; k++) {
        const a = aids[k], [ring, col, alpha, hot] = rings[k];
        ring.visible = !!a; warns[k].visible = !!(a && a.warn); rets[k].visible = !!(a && a.aim);
        if (!a) continue;
        const h = a.pl, v = figs[G.players.indexOf(h)].v; W(v.x, v.z, 0.05, ring.position); ring.scale.setScalar(TUNE.reach);
        const live = ballFor(h, G.ball) && contactQ(h, G.ball.x, G.ball.y, G.ball.z, G.ball.bounces > 0), hc = h.pad === 1 ? [0.4, 1.6, 2.4] : [2.2, 1.5, 0.25];
        if (live) { col.value.set(...hc); alpha.value = 0.9; } else if (h.queue) { col.value.set(...hc); alpha.value = 0.45 + 0.25*Math.sin(t*12); } else { col.value.set(1.4, 1.35, 1.2); alpha.value = 0.28; }
        if (a.warn) { warns[k].position.z = (isNearS(h.team) ? KD/2 : -KD/2); kwU.value = 0.3 + 0.15*Math.sin(t*14); }
        if (a.aim) { W(a.aim.x, a.aim.y, 0.07, rets[k].position); rets[k].rotation.y = t*0.8; }
      } }
    // ball, its shadow, trail and landing marker
    const B = G.ball;
    ball.visible = ballBlob.visible = B.z > -0.5 && !ballHidden();   // fog banks hide it (Ghost Galleon)
    if (ball.visible) {
      W(B.x, B.y, B.z, ball.position);
      ball.rotation.x += B.vy*dt*0.6; ball.rotation.z -= B.vx*dt*0.6;
      W(B.x, B.y, 0.05, ballBlob.position); const sc = Math.max(0.25, 0.9 - B.z*0.06); ballBlob.scale.set(sc, 1, sc);
    }
    { const tr = B.trail, n = Math.min(TRAIL_N, tr.length), fast = Math.hypot(B.vx, B.vy, B.vz) > 45 && !ballHidden(); let c = 0;
      if (fast) for (let i = 0; i < n; i++) { const [x, y, z] = tr[tr.length - 1 - i]; tmpM.compose(W(x, y, z, tmpV), tmpQ.identity(), tmpS.setScalar(Math.max(0.05, 1 - i/n))); trailMesh.setMatrixAt(c++, tmpM); }
      trailMesh.count = c; trailMesh.instanceMatrix.needsUpdate = true; }
    landing.visible = !!G.landing && !ballHidden();
    if (G.landing) { W(G.landing.x, G.landing.y, 0.06, landing.position); landU.value = 0.55 + 0.35*Math.sin(t*10); if (G.landing.in) landCol.value.set(2.2, 1.5, 0.25); else landCol.value.set(2.6, 0.5, 0.3); }
    hLine.visible = ball.visible && !!G.cfg.height && B.z > 0.4;
    if (hLine.visible) { W(B.x, B.y, 0.05, hLine.position); hLine.scale.set(1, Math.max(0.01, B.z - BALL_VIS - 0.05), 1); }
    // the cannon moves to wherever it fires from, and kicks back on each shot
    cannon.visible = G.mode !== 'game';   // stowed for games
    { const C = G.cannon, dir = C.y < NETY ? 1 : -1; W(C.x, C.y - dir*(1.4 + C.kick*0.6), 0, cannon.position); cannon.rotation.y = dir > 0 ? 0 : Math.PI; }
    { let n = 0; for (const p of G.parts) { if (n >= PART_MAX) break; tmpM.compose(W(p.x, p.y, p.z, tmpV), tmpQ.identity(), tmpS.setScalar(p.s*(p.life/p.max))); partMesh.setMatrixAt(n++, tmpM); } partMesh.count = n; partMesh.instanceMatrix.needsUpdate = true; }
    if (harbor.visible) harbor.userData.tick(t);
    updateHazards(G, t);
    { const tick = setTicks[G.island.id]; if (tick && sets[G.island.id].visible) tick(t); }
    if (R3.cut) { R3.cut = false; camCut = true; }
    updateCamera(G, dt);
    { const db = renderer.getDrawingBufferSize(_dbSize); texelU.value.set(1/Math.max(1, db.x), 1/Math.max(1, db.y)); }
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
