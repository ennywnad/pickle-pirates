// Booty checks: milestone 9's "done when" (second half): no power-up breaks a rule.
//   node tests/booty.mjs
// 1. Each power-up does what it says, set up directly.
// 2. CPU games where every rally earns a crate and the CPU uses it at once: every point is scored by the rules, every
//    out call is a ball that really landed out, and every power-up gets used.
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
let seed = 31337; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };
const setup = `Object.assign(gameCfg, { to:11, scoring:'sideout', tier:'bosun', hazards:false, booty:true }); newMatch('brine', false, 'game', { seats:[] }); G.state = 'play'; G.hits = 4; G.rally = 4;
  const pl = G.players[0]; pl.human = false; pl.x = 10; pl.y = 38; pl.face = -Math.PI/2;
  const ready = () => Object.assign(G.ball, { x:11.5, y:37.6, z:2.5, vx:0, vy:3, vz:0, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:1 });
  const hit = kind => { ready(); const c = contactQ(pl, G.ball.x, G.ball.y, G.ball.z, true); strike(pl, { kind, t:0.3, hold:false, power:0, aim:null, mod:null, skill:1, arcK:1 }, c); return G.ball; };`;

// ---------- 1. each power-up
{
  const r = run(`(() => { ${setup} Math.random = (() => { let s = 7; return () => (s = (s*16807) % 2147483647)/2147483647; })();
    const off = b0 => { const b = { ...b0 }; let pre = null, post = null, land = null; for (let i = 0; i < 1200 && !post; i++) { const v = { h:Math.hypot(b.vx, b.vy), z:-b.vz }; const e = ballStep(b, BALL_DT); if (e === 'bounce') { pre = v; land = { x:b.x, y:b.y }; post = { h:Math.hypot(b.vx, b.vy), z:b.vz }; } } return { pre, post, land }; };
    const a = off(hit('drive')); G.booty.held.home = 'cannonball'; useBooty('home');
    const B = hit('drive'), pr = predict(B, 3, BALL_DT, 1e4), b = off(B);
    return { lowA:a.post.z/a.pre.z, lowB:b.post.z/b.pre.z, fastA:a.post.h/a.pre.h, fastB:b.post.h/b.pre.h, inn:landedIn(b.land.x, b.land.y), same:Math.hypot(b.land.x - pr.first.x, b.land.y - pr.first.y), spent:!G.booty.fx.home.cannonball }; })()`);
  check('Cannonball Shot: the next drive skids low and fast off the bounce (where it lands, and the call, don\u2019t change), then it is spent', r.lowB < r.lowA*0.6 && r.fastB > r.fastA*1.1 && r.same < 0.05 && r.spent, `bounce height ×${(r.lowB/r.lowA).toFixed(2)}, pace off the bounce ×${(r.fastB/r.fastA).toFixed(2)} vs a normal drive; lands in: ${r.inn}`);
}
{
  const r = run(`(() => { ${setup} G.booty.held.home = 'pegleg'; useBooty('home'); const b = hit('drive'), kick = b.kick, pr = predict(b, 3, BALL_DT, 1e4);
    let e, first = null, before = 0; for (let i = 0; i < 1000 && !first; i++) { before = b.vx; e = ballStep(b, BALL_DT, (ev, B) => { if (ev === 'bounce' && !first) first = { x:B.x, y:B.y }; }); }
    return { kick, vx:b.vx - before, same: Math.hypot(first.x - pr.first.x, first.y - pr.first.y) }; })()`);
  check('Peg-Leg Spin: it kicks sideways off the bounce, and lands exactly where it would have (the call cannot change)', Math.abs(r.kick) > 6 && Math.abs(r.vx) > 5 && r.same < 0.05, `kick ${r.kick.toFixed(1)} ft/s, landing off by ${r.same.toFixed(3)} ft`);
}
{
  const r = run(`(() => { ${setup} const before = bootyRead('away'); G.booty.held.home = 'ink'; useBooty('home'); const inked = bootyRead('away'), me = bootyRead('home');
    G.time += 4.5; return { before, inked, me, after: bootyRead('away') }; })()`);
  check('Kraken Ink: the other crew reads the ball far worse for 4 s, then it wears off', r.inked > 2 && r.before === 1 && r.me === 1 && r.after === 1, JSON.stringify(r));
}
{
  const r = run(`(() => { ${setup} G.booty.held.home = 'parrot'; useBooty('home'); return { mine:bootyRead('home'), theirs:bootyRead('away') }; })()`);
  check('Parrot Spotter: your crew reads the ball near perfectly for a while', r.mine < 0.5 && r.theirs === 1, JSON.stringify(r));
}
{
  const r = run(`(() => { ${setup} const o = G.players[1]; o.x = 10; o.y = 6; o.vx = o.vy = 0; for (let i = 0; i < 60; i++) movePlayer(o, 1, 0, 1/60); const free = o.x - 10;
    G.booty.held.home = 'anchor'; useBooty('home'); o.x = 10; o.vx = o.vy = 0; for (let i = 0; i < 60; i++) movePlayer(o, 1, 0, 1/60); return { free, slowed:o.x - 10 }; })()`);
  check('Anchor Drop: the other crew runs at about two-thirds speed', r.slowed/r.free < 0.75 && r.slowed/r.free > 0.55, `${r.free.toFixed(1)} ft vs ${r.slowed.toFixed(1)} ft in a second`);
}
{
  const r = run(`(() => { ${setup} G.booty.held.home = 'fog'; useBooty('home'); const b = hit('drive'); let ownSide = false, farHidden = false, afterBounce = false;
    for (let i = 0; i < 1000; i++) { ballStep(b, BALL_DT, (e, B) => { if (e === 'bounce') B.bounces++; }); if (sideOf(b.y) === 'home' && ballHidden()) ownSide = true; if (sideOf(b.y) === 'away' && b.bounces === 0 && ballHidden()) farHidden = true; if (b.bounces > 0 && ballHidden()) afterBounce = true; if (b.bounces > 0) break; }
    return { ownSide, farHidden, afterBounce }; })()`);
  check('Fog Bank: your next shot vanishes over their side, not yours, and reappears when it bounces', !r.ownSide && r.farHidden && !r.afterBounce, JSON.stringify(r));
}
{
  const r = run(`(() => { ${setup} G.booty.held.home = 'treasure'; useBooty('home'); const z = { ...G.booty.zone }, pts = { ...G.match.pts };
    Object.assign(G.ball, { x:z.x, y:z.y, z:0.05, vx:0, vy:0, vz:-5, live:true, lastBy:'home', bounces:0 }); onBallEvent('bounce', G.ball, 5);
    return { zoneOnFar: z.y < NETY, got:G.booty.held.home, pts:G.match.pts, same: G.match.pts.home === pts.home && G.match.pts.away === pts.away }; })()`);
  check('Treasure Map: an X on their side; landing in it gives another booty and no points', r.zoneOnFar && !!r.got && r.same, JSON.stringify(r));
}
// ---------- 2. games with booty every rally
const res = run(`(() => {
  const errs = [], used = {}, calls = {}; let rallies = 0, earned = 0;
  for (let g = 0; g < ${Number(process.env.GAMES || 3)}; g++) {
    Object.assign(gameCfg, { to:11, scoring: g % 2 ? 'rally' : 'sideout', tier:'bosun', hazards:false, booty:true });
    newMatch(['brine', 'volcano', 'kraken'][g % 3], false, 'game', { format: g === 1 ? 'doubles' : 'singles', seats:[] });
    G.booty.always = true; const S = G.match;
    let land = null; const ob = onBallEvent; onBallEvent = (e, B, vin) => { if (e === 'bounce' && B.live && B.lastBy && B.bounces === 0 && sideOf(B.y) !== B.lastBy) land = { x:B.x, y:B.y, serve:!!B.serve }; return ob(e, B, vin); };
    const oer = endRally; endRally = (loser, kind, x, y) => { if (G.ball.live && kind === 'out' && land && !land.serve && landedIn(land.x, land.y)) errs.push('called out but landed in'); calls[kind] = (calls[kind] || 0) + 1; land = null; return oer(loser, kind, x, y); };
    const ope = endPoint; endPoint = (w, kind) => { const before = { ...S.pts }, server = S.server; ope(w, kind); const d = { home:S.pts.home - before.home, away:S.pts.away - before.away };
      if (S.scoring === 'sideout') { if (w === server && !(d[w] === 1 && d[other(w)] === 0)) errs.push('server won, no point'); if (w !== server && (d.home || d.away)) errs.push('receiver scored'); }
      else if (!(d[w] === 1 && d[other(w)] === 0)) errs.push('rally point wrong'); };
    let t = 0, quiet = 0, last = 0;
    while (G.state !== 'end' && t < 60*60*40) { update(1/60); t++; quiet = G.hits !== last ? 0 : quiet + 1/60; last = G.hits; if (quiet > 25) { errs.push('stalled'); break; } }
    if (G.state !== 'end') errs.push('did not finish');
    onBallEvent = ob; endRally = oer; endPoint = ope;
    for (const [k, n] of Object.entries(G.booty.ev.used)) used[k] = (used[k] || 0) + n; earned += G.booty.ev.earned; rallies += S.rallies;
  }
  return { errs:[...new Set(errs)], used, calls, rallies, earned };
})()`);
check('games with booty every rally: every point by the rules, every out call really out, nothing stalled', res.errs.length === 0, res.errs.join('; ') || `${res.rallies} rallies, ${res.earned} crates, calls ${JSON.stringify(res.calls)}`);
check('every power-up got used', ['cannonball', 'pegleg', 'ink', 'parrot', 'anchor', 'fog', 'treasure'].every(k => res.used[k] > 0), JSON.stringify(res.used));
console.log(failed ? `${failed} booty check(s) failed` : 'all booty checks passed');
process.exit(failed ? 1 : 0);
