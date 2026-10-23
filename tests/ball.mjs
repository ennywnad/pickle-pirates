// Ball physics checks against real pickleball numbers. No browser needed: node tests/ball.mjs
// Loads core.js, match.js and ball.js into a sandbox with just enough of a page stubbed out.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}), getBoundingClientRect: () => ({ width:1, height:1 }), style:{}, dataset:{}, classList:{ toggle(){} } });
const store = {};
const sandbox = {
  document: { getElementById: stubEl, createElement: stubEl },
  window: { matchMedia: () => ({ matches:false }) },
  matchMedia: () => ({ matches:false }),
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  console, Math, JSON, Object, Array, Number, String, Set, Map,
};
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js']) vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename: f });
const run = src => vm.runInContext(src, sandbox);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };
const r1 = v => Math.round(v*10)/10;

// fly a ball: returns landing, apex, net clearance, speeds, and the state right after the first bounce
const fly = run(`(from, v) => {
  const b = { sx:0, sy:0, sz:0, ...from, ...v }, v0 = Math.hypot(b.vx, b.vy, b.vz);
  let apex = b.z, netZ = null, land = null, t = 0, after = null, netted = false;
  for (let i = 0; i < 2400; i++) {
    const py = b.y, vh0 = Math.hypot(b.vx, b.vy), e = ballStep(b, 1/240); t += 1/240;
    if (netZ === null && (py - NETY)*(b.y - NETY) <= 0) netZ = b.z;
    if (!land) apex = Math.max(apex, b.z);
    if (e === 'net') { netted = true; break; }
    if (e === 'bounce' && !land) { land = { x:b.x, y:b.y, t, vin:vh0 }; after = { vh:Math.hypot(b.vx, b.vy), vz:b.vz }; break; }
  }
  return { v0, apex, netZ, land, after, netted };
}`);
const mph = v => v/1.46667;

// 1. drop test: 78 in onto a hard surface rebounds 30–34 in, measured to the top of the ball
{
  const r = run(`(() => { const b = { x:10, y:30, z:78/12 + BALL_R, vx:0, vy:0, vz:0, sx:0, sy:0, sz:0 }; let up = false, peak = 0;
    for (let i = 0; i < 2000; i++) { const e = ballStep(b, 1/480); if (e === 'bounce') { if (up) break; up = true; } if (up) peak = Math.max(peak, b.z); }
    return (peak + BALL_R)*12; })()`);
  check('drop test rebound 30–34 in', r >= 30 && r <= 34, `${r1(r)} in`);
}
// 2. drive: hard and low from the baseline, lands deep, slows a lot on the way
{
  const from = { x:13, y:43, z:2.4 }, v = run(`launchFor('drive', ${JSON.stringify(from)}, 6, 4)`), f = fly(from, v);
  const ok = f.land && !f.netted && f.land.y < 9 && f.land.y > 0 && f.netZ - run('NET_H_MID') < 3;
  check('drive clears low and lands deep', ok, `launch ${r1(mph(f.v0))} mph, ${r1(f.netZ - run('netH(10)'))} ft over the net, lands ${f.land ? r1(f.land.y) : '-'} ft from the far baseline`);
  const keep = f.land ? f.land.vin/f.v0 : 0;
  check('drive arrives at 55–80% of launch speed', keep > 0.55 && keep < 0.8, `${Math.round(keep*100)}% (${r1(mph(f.land ? f.land.vin : 0))} mph)`);
  check('drive takes 0.6–1.1 s', f.land && f.land.t > 0.6 && f.land.t < 1.1, `${f.land ? f.land.t.toFixed(2) : '-'} s`);
}
// 3. dink: from the kitchen line into the other kitchen, soft and just over the net
{
  const from = { x:10, y:29.3, z:1.2 }, v = run(`launchFor('dink', ${JSON.stringify(from)}, 8, 18.5)`), f = fly(from, v);
  const inK = f.land && f.land.y > 15 && f.land.y < 22;
  check('dink lands in the far kitchen', inK && !f.netted, `lands ${f.land ? r1(f.land.y) : '-'} ft, ${r1(f.netZ - run('netH(9)'))} ft over the net`);
  check('dink is slow (under 20 mph)', mph(f.v0) < 20, `${r1(mph(f.v0))} mph`);
}
// 4. third-shot drop: from the baseline into the kitchen; real drops launch at 24–36 mph, 12–24°
{
  const from = { x:10, y:43, z:2.4 }, v = run(`launchFor('drop', ${JSON.stringify(from)}, 10, 16.5)`), f = fly(from, v);
  const ang = Math.atan2(v.vz, Math.hypot(v.vx, v.vy))*180/Math.PI;
  check('drop lands in the far kitchen', f.land && f.land.y > 15 && f.land.y < 22 && !f.netted, `lands ${f.land ? r1(f.land.y) : '-'} ft, peaks ${r1(f.apex)} ft`);
  // the study's successful drops launch at 24–36 mph and 12–22° and land anywhere in the kitchen; a mid-kitchen drop sits at the slow, steep end
  check('drop launch 20–36 mph at 12–36°', mph(f.v0) > 20 && mph(f.v0) < 36 && ang > 12 && ang < 36, `${r1(mph(f.v0))} mph at ${r1(ang)}°`);
}
// 5. lob: from the kitchen line over a net player, peaks high and lands deep
{
  const from = { x:10, y:29.5, z:2.5 }, v = run(`launchFor('lob', ${JSON.stringify(from)}, 12, 3)`), f = fly(from, v);
  check('lob peaks 15–25 ft and lands deep', f.land && f.apex > 15 && f.apex < 25 && f.land.y < 6 && f.land.y > 0, `peaks ${r1(f.apex)} ft, lands ${f.land ? r1(f.land.y) : '-'} ft`);
}
// 6. serve: from behind the baseline, diagonal, past the kitchen line; real serves 40–54 mph
{
  const from = { x:15, y:44.6, z:1.6 }, v = run(`launchFor('serve', ${JSON.stringify(from)}, 5, 4)`), f = fly(from, v);
  check('serve lands deep in the diagonal court', f.land && f.land.y < NETY_MINUS(7) && f.land.x < 10 && !f.netted, `lands (${f.land ? r1(f.land.x) + ', ' + r1(f.land.y) : '-'}), ${r1(mph(f.v0))} mph`);
  function NETY_MINUS(k){ return 22 - k; }
}
// 7. spin bends the flight: same launch, topspin lands shorter than flat, backspin longer
{
  const from = { x:10, y:43, z:2.4 }, base = { vx:0, vy:-55, vz:12 };
  const land = spin => fly(from, { ...base, ...run(`spinVec(0, -1, ${spin})`) }).land.y;
  const top = land(150), flat = land(0), back = land(-150);
  check('topspin dips, backspin floats', top > flat && back < flat, `lands ${r1(43 - top)} / ${r1(43 - flat)} / ${r1(43 - back)} ft from the hitter (top / flat / back)`);
}
// 8. spin on the bounce: topspin kicks on, backspin checks up
{
  const from = { x:10, y:30, z:run('BALL_R') + 0.01 }, base = { vx:0, vy:-40, vz:-14 };   // arriving at the court, so only the bounce differs
  const after = spin => fly(from, { ...base, ...run(`spinVec(0, -1, ${spin})`) }).after.vh;
  const top = after(160), flat = after(0), back = after(-160);
  check('topspin kicks, backspin skids', top > flat && back <= flat + 0.1, `after the bounce ${r1(mph(top))} / ${r1(mph(flat))} / ${r1(mph(back))} mph`);
}
// 9. the net stops a low ball; a ball that clips the tape pops up and slows
{
  const low = fly({ x:10, y:26, z:1.5 }, { vx:0, vy:-45, vz:0.5 });
  check('low ball is caught by the net', low.netted, low.netted ? 'netted' : `got through (net crossing at ${r1(low.netZ)} ft)`);
  const r = run(`(() => { const b = { x:10, y:23, z:netH(10) + 0.12, vx:0, vy:-25, vz:0, sx:0, sy:0, sz:0 }; let tape = false;
    for (let i = 0; i < 200; i++) { if (ballStep(b, 1/480) === 'tape') tape = true; if (b.y < NETY - 1) break; } return { tape, vy:b.vy, vz:b.vz, y:b.y }; })()`);
  check('tape clip slows the ball and pops it up', r.tape && Math.abs(r.vy) < 25 && r.vz > -2, `vy ${r1(r.vy)} ft/s, vz ${r1(r.vz)} ft/s`);
}
// 10. line calls: the line is in
{
  const c = run(`[landedIn(-0.01, 30), landedIn(-0.2, 30), landedIn(10, 44.01), landedIn(10, 44.3), landedIn(20, 10)]`);
  check('line is in, a clear miss is out', c[0] && !c[1] && c[2] && !c[3] && c[4], JSON.stringify(c));
}
console.log(failed ? `${failed} ball check(s) failed` : 'all ball checks passed');
process.exit(failed ? 1 : 0);
