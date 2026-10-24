// Swing checks: milestone 8's "done when": every shot type has its own swing, and it lines up with contact.
//   node tests/swings.mjs
// Plays CPU games (singles and doubles) and, for every stroke, compares where the forward swing was headed (the
// windup planned from the predicted contact) with where the ball really was when it was struck, and checks that the
// paddle in the drawn pose is at the ball on the contact frame.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}) });
const sandbox = { document:{ getElementById:stubEl, createElement:stubEl }, window:{ matchMedia:() => ({ matches:false }) }, matchMedia:() => ({ matches:false }),
  localStorage:{ getItem:() => null, setItem(){} }, console, Math, JSON, Object, Array, Number, String, Set, Map,
  sfx(){}, band(){}, toast(){}, humans:() => 1, startAttract(){}, showResults(){},
  readInput:() => [0, 0], readAim:() => [0, 0], actionHeld:() => false };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/swings.js', 'js/referee.js', 'js/players.js', 'js/ai.js', 'js/update.js'])
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename:f });
let seed = 2024; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };

// 1. every swing is its own: backswings and follow-throughs differ from every other swing
{
  const r = run(`(() => { const names = Object.keys(SWINGS), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); let worst = [99, ''];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const A = SWINGS[names[i]], B = SWINGS[names[j]], m = Math.max(d(A.back, B.back), d(A.follow, B.follow));
      if (m < worst[0]) worst = [m, names[i] + ' / ' + names[j]]; }
    return { n: names.length, worst }; })()`);
  check('every swing has its own backswing or follow-through (at least 0.5 ft apart)', r.worst[0] >= 0.5, `${r.n} swings; closest pair ${r.worst[1]} at ${r.worst[0].toFixed(2)} ft`);
}
// 2. play games and watch every stroke
const res = run(`(() => {
  const seen = {}, miss = [], late = [], noWind = {}, total = {};
  const ost = strike; strike = (pl, Q, c) => { const w = pl.wind ? { ...pl.wind } : null, B = G.ball, at = { x:B.x, y:B.y, z:B.z, t:G.time };
    const r = ost(pl, Q, c); const H = pl.hit; if (!H) return r;
    seen[H.sw] = (seen[H.sw] || 0) + 1; total[H.sw] = (total[H.sw] || 0) + 1;
    const pose = paddlePose(pl, H.t), off = Math.hypot(pose.head[0] - at.x, pose.head[1] - at.y, pose.head[2] - at.z);
    if (off > 0.01) miss.push(H.sw + ' ' + off.toFixed(2));
    if (!w) noWind[H.sw] = (noWind[H.sw] || 0) + 1;
    else late.push({ sw:H.sw, d:Math.hypot(w.x - at.x, w.y - at.y, w.z - at.z), dt:Math.abs(w.at - at.t), lead:at.t - (w.at - WIND) });
    return r; };
  const osv = doServe; doServe = (pl, kind, aim, place) => { const w = pl.wind ? { ...pl.wind } : null, t = G.time, ok = osv(pl, kind, aim, place);
    if (ok) { seen.serve = (seen.serve || 0) + 1; total.serve = (total.serve || 0) + 1; if (w) late.push({ sw:'serve', d:Math.hypot(w.x - pl.hit.x, w.y - pl.hit.y, w.z - pl.hit.z), dt:Math.abs(w.at - t), lead:WIND }); else noWind.serve = (noWind.serve || 0) + 1; }
    return ok; };
  for (const [fmt, tier] of [['singles', 'bosun'], ['doubles', 'captain'], ['singles', 'deckhand'], ['doubles', 'bosun']]) {
    Object.assign(gameCfg, { to:11, scoring:'sideout', tier }); newMatch('brine', false, 'game', { format:fmt, seats:[] });
    let t = 0; while (G.state !== 'end' && t < 60*60*30) { update(1/60); t++; }
  }
  // the rarer shapes, set up directly: each shot on each side, at the height and depth it's played from
  // [button, side (+1 forehand), ball height, feet from the net, bounced]
  for (const [kind, side, z, from, bounced] of [['drive', -1, 2.6, 18, true], ['soft', -1, 1.0, 17, true], ['soft', -1, 0.9, 8, true], ['lob', 1, 2.0, 16, true], ['lob', -1, 2.0, 16, true],
      ['drive', 1, 6.6, 9, false], ['drive', -1, 3.0, 8.5, false], ['drive', 1, 3.0, 8.5, false]]) {
    newMatch('brine', false, 'game', { seats:[] }); G.state = 'play'; G.hits = 4; const pl = G.players[0]; pl.human = false;
    pl.x = 10; pl.y = NETY + from; pl.face = -Math.PI/2;
    Object.assign(G.ball, { x:pl.x + side*1.6, y:pl.y - 0.4, z, vx:0, vy:3, vz:0, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:bounced ? 1 : 0 });
    const c = contactQ(pl, G.ball.x, G.ball.y, G.ball.z, bounced); if (c) strike(pl, { kind, t:0.3, hold:false, power:0, aim:null, mod:null, skill:1, arcK:1 }, c);
  }
  return { seen, miss, late, noWind, total };
})()`);
const want = ['serve', 'drive_fh', 'drive_bh', 'volley_fh', 'volley_bh', 'dink_fh', 'dink_bh', 'drop_fh', 'drop_bh', 'smash'];
const lobs = (res.seen.lob_fh || 0) + (res.seen.lob_bh || 0);
check('every shot type gets swung in play', want.every(w => res.seen[w] > 0) && lobs > 0, JSON.stringify(res.seen));
check('on the contact frame the paddle is at the ball (every stroke)', res.miss.length === 0, res.miss.slice(0, 5).join('; ') || `${Object.values(res.total).reduce((a, b) => a + b, 0)} strokes`);
const L = res.late, close = L.filter(x => x.d < 0.35 && x.dt < 0.05).length;
check('the forward swing is headed where the ball is struck (within 0.35 ft and a frame or two)', L.length > 200 && close/L.length >= 0.9, `${close} of ${L.length} windups (${(100*close/L.length).toFixed(1)}%)`);
const shown = L.filter(x => x.lead >= 0.15).length;
check('most strokes show a backswing first (planned at least 0.15 s ahead)', shown/L.length >= 0.75, `${shown} of ${L.length}; strokes with no windup at all: ${JSON.stringify(res.noWind)}`);
console.log(failed ? `${failed} swing check(s) failed` : 'all swing checks passed');
process.exit(failed ? 1 : 0);
