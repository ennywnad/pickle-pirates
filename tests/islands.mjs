// Island checks: milestone 9's "done when" (first half): each island plays differently, and no hazard breaks a rule.
//   node tests/islands.mjs
// 1. Each hazard does exactly what it says, set up directly.
// 2. CPU games on every island with hazards on: every point still scored by the rules, no stalled points, and each
//    island's own hazard is the one that shows up.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}) });
const sandbox = { document:{ getElementById:stubEl, createElement:stubEl }, window:{ matchMedia:() => ({ matches:false }) }, matchMedia:() => ({ matches:false }),
  localStorage:{ getItem:() => null, setItem(){} }, console, Math, JSON, Object, Array, Number, String, Set, Map,
  sfx(){}, band(){}, toast(){}, humans:() => 1, startAttract(){}, showResults(){},
  readInput:() => [0, 0], readAim:() => [0, 0], actionHeld:() => false };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/swings.js', 'js/referee.js', 'js/players.js', 'js/hazards.js', 'js/booty.js', 'js/voyage.js', 'js/ai.js', 'js/update.js'])
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename:f });
let seed = 9090; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };
const GAMES = Number(process.env.GAMES || 2);

// ---------- 1. each hazard, set up directly
const setup = island => `Object.assign(gameCfg, { to:11, scoring:'sideout', tier:'bosun', hazards:true }); newMatch('${island}', false, 'game', { seats:[] }); G.state = 'play'; G.hits = 4;`;
{
  const r = run(`(() => { ${setup('wreck')} const B = G.ball; Object.assign(B, { x:10, y:30, z:3, vx:0, vy:0, vz:-5, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:0 });
    const pr = predict(B, 2, BALL_DT, 4); let e; for (let i = 0; i < 400 && e !== 'bounce'; i++) e = ballStep(B, BALL_DT);
    const after = B.vx; for (let i = 0; i < 240; i++) ballStep(B, BALL_DT); const p2 = pr.pts.find(p => Math.abs(p.t - 1.0 - 0.5) < 0.01);
    return { kick:after, x:B.x }; })()`);
  check('Shipwreck Shoals: a bounce kicks the ball downhill', r.kick > 5 && r.x > 12, `vx after a straight-down bounce ${r.kick.toFixed(1)} ft/s, rolled to x ${r.x.toFixed(1)}`);
}
{
  const r = run(`(() => { ${setup('volcano')} const B = G.ball, v = G.haz.vents[0];
    let t = 0; while (!ventOn(v, t)) t += 0.05;   // a moment the vent is live
    Object.assign(B, { x:v.x, y:v.y, z:1.5, vx:0, vy:0, vz:-8, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:0, clock:t });
    const pr = predict(B, 1, BALL_DT, 2), apexP = Math.max(...pr.pts.map(p => p.z)); let apex = 0;
    for (let i = 0; i < 240; i++) { ballStep(B, BALL_DT); apex = Math.max(apex, B.z); }
    let t2 = 0; while (ventOn(v, t2)) t2 += 0.05; const C = { x:v.x, y:v.y, z:1.5, vx:0, vy:0, vz:-8, sx:0, sy:0, sz:0, clock:t2 }; let apex2 = 0; for (let i = 0; i < 240; i++) { ballStep(C, BALL_DT); apex2 = Math.max(apex2, C.z); }
    return { apex, apexP, apex2 }; })()`);
  check('Volcano Isle: a bounce on a live vent launches the ball (and the prediction sees it); a quiet vent does nothing', r.apex > 4 && Math.abs(r.apex - r.apexP) < 0.3 && r.apex2 < 1.5, `apex ${r.apex.toFixed(1)} ft (predicted ${r.apexP.toFixed(1)}), quiet vent ${r.apex2.toFixed(1)} ft`);
}
{
  const r = run(`(() => { ${setup('kraken')} const H = G.haz; H.tents.push({ x:10, y:32, r:0.65, h:6.5, t:2, rise:1, up:3.2 }); HZ.tents = H.tents;
    const B = G.ball; Object.assign(B, { x:10, y:26, z:2, vx:0, vy:30, vz:2, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:0 }); let e = null;
    for (let i = 0; i < 120 && e !== 'tentacle'; i++) e = ballStep(B, BALL_DT); const vyAfter = B.vy;
    const pl = G.players[0]; pl.x = 10; pl.y = 34; for (let i = 0; i < 60; i++) movePlayer(pl, 0, -1, 1/60);
    return { e, vyAfter, py:pl.y, gap:Math.hypot(pl.x - 10, pl.y - 32) }; })()`);
  check('Kraken\'s Reach: the ball bounces off a tentacle, and players can\'t walk through one', r.e === 'tentacle' && r.vyAfter < 0 && r.gap > 1.3, `ball vy after ${r.vyAfter.toFixed(1)}, player stays ${r.gap.toFixed(2)} ft from it`);
}
{
  const r = run(`(() => { ${setup('cannon')} const H = G.haz, pl = G.players[0], cpu = G.players[1]; pl.human = false; pl.x = 10; pl.y = 36;
    H.zones.push({ x:10, y:36, r:2.4, t:1.45, warn:1.5, hit:false }); hazardStep(0.1);
    const stunned = pl.stun > 0; const [ax, ay] = hazardAvoid(cpu.x, cpu.y); H.zones.push({ x:cpu.x, y:cpu.y, r:2.4, t:0, warn:1.5, hit:false }); const [bx, by] = hazardAvoid(cpu.x, cpu.y);
    return { stunned, moved:Math.hypot(bx - cpu.x, by - cpu.y) }; })()`);
  check('Cannon Cove: a player caught in a ring is stunned, and the CPU steers out of a ring before it lands', r.stunned && r.moved > 2.4, `steered ${r.moved.toFixed(1)} ft out`);
}
{
  const r = run(`(() => { ${setup('ghost')} const f = G.haz.fog[0]; const B = G.ball; Object.assign(B, { x:f.x, y:f.y, z:3, live:true });
    const hid = ballHidden(), pen = fogPenalty(); B.z = 12; const high = ballHidden(); return { hid, pen, high }; })()`);
  check('Ghost Galleon: the ball vanishes in a fog bank (not above it), and the CPU reads it worse', r.hid && r.pen > 1 && !r.high);
}
{
  const r = run(`(() => { ${setup('brine')} const B = G.ball; let got = null;
    for (let k = 0; k < 20 && !got; k++) {
      G.shotN++; Object.assign(B, launchFor('lob', { x:10, y:38, z:1.5 }, 10, 3), { x:10, y:38, z:1.5, live:true, lastBy:'home', bounces:0 });
      for (let i = 0; i < 240; i++) { G.time += 1/60; hazardStep(1/60); if (G.haz.gull) got = got || 'grabbed'; if (!B.carried) for (let s = 0; s < 4; s++) ballStep(B, BALL_DT); if (got && !G.haz.gull) break; }
    }
    const d = G.haz.lastDrop; return { got, drop:d, inFar: !!d && d.y < NETY && d.x > 0 && d.x < CW, live:B.live }; })()`);
  check('Brine Bay: a gull snatches a high lob and drops it on the far side, still in play', r.got && r.inFar && r.live, JSON.stringify(r.drop && { x:+r.drop.x.toFixed(1), y:+r.drop.y.toFixed(1) }));
}
{
  // Davy's Locker: the sea current pushes the ball sideways in flight (no tilted deck), and the prediction knows it
  const r = run(`(() => { ${setup('locker')} setHazard('tilt'); const B = G.ball, cur = HZ.current;
    const shot = () => Object.assign(B, { x:10, y:38, z:2, vx:0, vy:-26, vz:20, live:true, lastBy:'home', bounces:0, sx:0, sy:0, sz:0 });
    shot(); const pr = predict(B, 4, BALL_DT, 1000); let e; for (let i = 0; i < 1200 && e !== 'bounce'; i++) e = ballStep(B, BALL_DT);
    const land = { x:B.x, y:B.y }, pf = pr.first;
    HZ.current = 0; shot(); e = null; for (let i = 0; i < 1200 && e !== 'bounce'; i++) e = ballStep(B, BALL_DT); HZ.current = cur;
    return { cur, tilt:HZ.tilt, name:HAZ_NAME.tilt, drift:land.x - B.x, err:Math.hypot(land.x - pf.x, land.y - pf.y) }; })()`);
  check('Davy\'s Locker: the sea current curves the ball sideways (no tilt), and the landing prediction follows it', r.tilt === 0 && Math.abs(r.cur) > 0 && Math.sign(r.drift) === Math.sign(r.cur) && Math.abs(r.drift) > 1 && r.err < 0.15 && r.name === 'Sea current',
    `current ${r.cur} ft/s², drift ${r.drift.toFixed(2)} ft, prediction off by ${r.err.toFixed(3)} ft`);
}
// ---------- 2. games on every island
const islands = ['brine', 'wreck', 'cannon', 'volcano', 'kraken', 'ghost', 'locker'];
const own = { brine:['gulls'], wreck:['tilt'], cannon:['cannon'], volcano:['vents'], kraken:['tentacles'], ghost:['fog'], locker:null };
const kinds = ['gulls', 'tilt', 'current', 'cannon', 'vents', 'tentacles', 'fog'];
for (const isl of islands) {
  const r = run(`(() => {
    const ev = {}, errs = [], kindsSeen = new Set(); let rallies = 0, strokes = 0, minutes = 0;
    for (let g = 0; g < ${GAMES}; g++) {
      Object.assign(gameCfg, { to:11, scoring:'sideout', tier:'bosun', hazards:true, booty:false }); newMatch('${isl}', false, 'game', { format: g % 2 ? 'doubles' : 'singles', seats:[] });
      const S = G.match;
      const ope = endPoint; endPoint = (w, kind) => { const before = { ...S.pts }, server = S.server; ope(w, kind);
        const d = { home:S.pts.home - before.home, away:S.pts.away - before.away };
        if (w === server && !(d[w] === 1 && d[other(w)] === 0)) errs.push('server won but did not score');
        if (w !== server && (d.home || d.away)) errs.push('receiver scored in side-out'); };
      let t = 0, quiet = 0, last = 0;
      while (G.state !== 'end' && t < 60*60*40) { update(1/60); t++; if (G.haz) kindsSeen.add(G.haz.kind);
        quiet = G.hits !== last ? 0 : quiet + 1/60; last = G.hits; if (quiet > 25) { errs.push('stalled'); break; }
        if (!isFinite(G.ball.x + G.ball.y + G.ball.z)) { errs.push('NaN'); break; } }
      endPoint = ope;
      if (G.state !== 'end') errs.push('game did not finish');
      for (const [k, n] of Object.entries(G.haz ? G.haz.ev : {})) ev[k] = (ev[k] || 0) + n;
      rallies += S.rallies; strokes += G.stats.strokes; minutes += t/3600;
    }
    return { ev, errs:[...new Set(errs)], kinds:[...kindsSeen], rallies, avg:strokes/Math.max(1, rallies), minutes };
  })()`);
  const evs = kinds.filter(k => (r.ev[k] || 0) > 0);
  const label = run(`ISLANDS.find(i => i.id === '${isl}').name`);
  check(`${label}: every point scored by the rules, nothing stalled`, r.errs.length === 0, r.errs.join('; ') || `${r.rallies} rallies, ${r.avg.toFixed(1)} shots a rally, ${r.minutes.toFixed(0)} sim min`);
  if (own[isl]) check(`${label}: its own hazard shows up, and only that one`, own[isl].every(k => r.ev[k] > 0) && evs.every(k => own[isl].includes(k)), JSON.stringify(r.ev));
  else check(`${label}: the hazard rotates through the others`, r.kinds.length >= 4 && evs.length >= 3, `${r.kinds.join(', ')} · ${JSON.stringify(r.ev)}`);
}
console.log(failed ? `${failed} island check(s) failed` : 'all island checks passed');
process.exit(failed ? 1 : 0);
