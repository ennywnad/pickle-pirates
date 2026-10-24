// Full-game checks: CPU-vs-CPU singles games played out point by point, every point checked against the rules.
// Milestone 4's "done when": a full game to 11 plays out correctly. No browser needed: node tests/game.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}) });
const sandbox = { document:{ getElementById:stubEl, createElement:stubEl }, window:{ matchMedia:() => ({ matches:false }) }, matchMedia:() => ({ matches:false }),
  localStorage:{ getItem:() => null, setItem(){} }, console, Math, JSON, Object, Array, Number, String, Set, Map,
  sfx(){}, band(){}, toast(){}, humans:() => 1, startAttract(){}, showResults(){ sandbox.RESULTS = true; },
  readInput:() => [0, 0], readAim:() => [0, 0], actionHeld:() => false };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/swings.js', 'js/referee.js', 'js/players.js', 'js/hazards.js', 'js/booty.js', 'js/ai.js', 'js/update.js'])
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename:f });
let seed = 4242; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };

function playGame(cfg){
  return run(`(() => {
    Object.assign(gameCfg, ${JSON.stringify(cfg)});
    newMatch('brine', false, 'game'); G.players[0].human = false;   // CPU vs CPU
    const S = G.match, errs = [], points = [], serves = [];
    let switches = 0, switchAt = null;
    // every serve: the server stands in the court their score says, behind their own baseline
    const os = doServe; doServe = (pl, kind, aim) => {
      const court = serverCourt(S), near = isNear(pl.team), right = near ? pl.x > CW/2 : pl.x < CW/2, behind = near ? pl.y > CL : pl.y < 0;
      const rec = G.players.find(p => p.team !== pl.team), diag = Math.sign(rec.x - CW/2) === -Math.sign(pl.x - CW/2);
      if ((court === 'right') !== right) errs.push('server in the wrong court at ' + scoreCall(S));
      if (!behind) errs.push('server not behind the baseline');
      if (!diag) errs.push('receiver not diagonal');
      serves.push(court);
      return os(pl, kind, aim);
    };
    // every point: the score moves exactly as the rules say
    const ope = endPoint; endPoint = (winner, kind) => {
      const before = { ...S.pts }, server = S.server;
      ope(winner, kind);
      const after = S.pts, d = { home: after.home - before.home, away: after.away - before.away };
      if (S.scoring === 'sideout') {
        if (winner === server && !(d[winner] === 1 && d[other(winner)] === 0)) errs.push('server won but did not score');
        if (winner !== server && !(d.home === 0 && d.away === 0 && S.server === winner)) errs.push('side out went wrong');
      } else if (!(d[winner] === 1 && d[other(winner)] === 0)) errs.push('rally point went wrong');
      points.push(kind);
    };
    const osw = switchEnds; switchEnds = () => { switches++; switchAt = Math.max(S.pts.home, S.pts.away); osw(); };
    let t = 0;
    while (G.state !== 'end' && t < 60*60*40) { update(1/60); t++;
      if (!isFinite(G.ball.x + G.ball.y + G.ball.z) || G.players.some(p => !isFinite(p.x + p.y))) { errs.push('NaN'); break; } }
    const kinds = {}; for (const k of points) kinds[k] = (kinds[k] || 0) + 1;
    return { pts:S.pts, winner:S.winner, over:S.over, to:S.to, scoring:S.scoring, switches, switchAt, errs:[...new Set(errs)], rallies:S.rallies, sideOuts:S.sideOuts,
      minutes:+(t/3600).toFixed(1), kinds, longest:G.stats.longest, serves:serves.length, ended:G.state === 'end' };
  })()`);
}
for (const [cfg, label] of [[{ to:11, scoring:'sideout' }, 'game to 11, side-out'], [{ to:11, scoring:'rally' }, 'game to 11, rally scoring'], [{ to:15, scoring:'sideout' }, 'game to 15, side-out']]) {
  const r = playGame(cfg), W = r.pts[r.winner], L = r.pts[r.winner === 'home' ? 'away' : 'home'];
  check(`${label}: plays to a finish`, r.over && r.ended && W >= r.to && W - L >= 2, `${r.winner} wins ${W}–${L} in ${r.rallies} rallies, ${r.minutes} sim min`);
  check(`${label}: every serve and point followed the rules`, r.errs.length === 0, r.errs.join('; ') || `${r.serves} serves, ${r.sideOuts} side outs`);
  check(`${label}: ends switched once, at ${({ 11:6, 15:8 })[r.to]}`, r.switches === 1 && r.switchAt === ({ 11:6, 15:8 })[r.to], `${r.switches} switch at ${r.switchAt}`);
  check(`${label}: points end in real rallies, not only faults`, (r.kinds['double bounce'] || 0) + (r.kinds.ace || 0) + (r.kinds.winner || 0) > 0 && r.longest >= 4, `${JSON.stringify(r.kinds)}, longest rally ${r.longest}`);
}
// doubles: full CPU games, every serve checked against an independent referee's notebook of who stands where
function playDoubles(cfg){
  return run(`(() => {
    Object.assign(gameCfg, ${JSON.stringify(cfg)});
    newMatch('brine', false, 'game', { format:'doubles', seats:[] });
    const S = G.match, errs = [], name = p => p.team[0] + p.slot;
    // the notebook: positions by name, following the rule text (see tests/rules.mjs)
    const pos = { home:{ right:'h0', left:'h1' }, away:{ right:'a0', left:'a1' } }, pts = { home:0, away:0 };
    let team = S.server, server = pos[S.server].right, num = S.scoring === 'sideout' ? 2 : 1, serves = 0, returns = 0;
    const swap = t => { const q = pos[t]; [q.right, q.left] = [q.left, q.right]; };
    const os = doServe; doServe = (pl, kind, aim, place) => {
      const court = pos[team].right === server ? 'right' : 'left', near = isNear(pl.team);
      const right = near ? pl.x > CW/2 : pl.x < CW/2, behind = near ? pl.y > CL : pl.y < 0;
      if (name(pl) !== server) errs.push('wrong server ' + name(pl) + ' (notebook ' + server + ') at ' + scoreCall(S));
      if ((court === 'right') !== right) errs.push('server in the wrong court at ' + scoreCall(S));
      if (!behind) errs.push('server not behind the baseline');
      const call = pts[team] + '–' + pts[other(team)] + (S.scoring === 'sideout' ? '–' + num : '');
      if (scoreCall(S) !== call) errs.push('score call ' + scoreCall(S) + ' (notebook ' + call + ')');
      const rec = G.players.find(p => name(p) === pos[other(team)][court]), diag = Math.sign(rec.x - CW/2) === -Math.sign(pl.x - CW/2);
      if (!diag) errs.push('receiver ' + name(rec) + ' not diagonally across');
      serves++;
      return os(pl, kind, aim, place);
    };
    const ost = strike; strike = (pl, Q, c) => {
      if (G.hits === 1 && G.state === 'play') { returns++; const court = pos[team].right === server ? 'right' : 'left';
        if (name(pl) !== pos[other(team)][court]) errs.push('the return was hit by ' + name(pl) + ', not the receiver ' + pos[other(team)][court]); }
      return ost(pl, Q, c);
    };
    const ope = endPoint; endPoint = (w, kind) => {
      if (w === team) { pts[w]++; swap(w); }
      else if (S.scoring === 'rally') { pts[w]++; swap(w); team = w; server = pos[w].right; num = 1; }
      else if (num === 1) { num = 2; server = server === pos[team].right ? pos[team].left : pos[team].right; }
      else { team = w; server = pos[w].right; num = 1; }
      ope(w, kind);
      if (S.pts.home !== pts.home || S.pts.away !== pts.away) errs.push('score ' + S.pts.home + '–' + S.pts.away + ' vs notebook ' + pts.home + '–' + pts.away);
    };
    let t = 0, pointT = 0, lastHits = 0, quiet = 0, takers = 0, both = 0;
    while (G.state !== 'end' && t < 60*60*60) { update(1/60); t++;
      quiet = G.hits !== lastHits ? 0 : quiet + 1/60; lastHits = G.hits;
      if (G.state === 'play' && G.ball.live && G.hits >= 2) { const crew = crewOf(other(G.ball.lastBy)); takers++;
        if (crew.every(p => mine(p, G.ball))) both++; }
      if (quiet > 20) { errs.push('a point stalled'); break; }
      if (!isFinite(G.ball.x + G.ball.y + G.ball.z) || G.players.some(p => !isFinite(p.x + p.y))) { errs.push('NaN'); break; } }
    return { pts:S.pts, winner:S.winner, over:S.over, rallies:S.rallies, errs:[...new Set(errs)], serves, returns, both, takers, longest:G.stats.longest, minutes:+(t/3600).toFixed(1), avg:G.stats.strokes/Math.max(1, S.rallies) };
  })()`);
}
for (const [cfg, label] of [[{ to:11, scoring:'sideout', tier:'bosun' }, 'doubles to 11, side-out'], [{ to:11, scoring:'rally', tier:'captain' }, 'doubles to 11, rally scoring'], [{ to:11, scoring:'sideout', tier:'deckhand' }, 'doubles to 11, side-out, deckhands']]) {
  const r = playDoubles(cfg), W = r.pts[r.winner], L = r.pts[r.winner === 'home' ? 'away' : 'home'];
  check(`${label}: plays to a finish`, r.over && W >= 11 && W - L >= 2, `${r.winner} wins ${W}–${L} in ${r.rallies} rallies, ${r.minutes} sim min, ${r.avg.toFixed(1)} shots a rally, longest ${r.longest}`);
  check(`${label}: every serve, server, court, receiver and score matched the notebook`, r.errs.length === 0, r.errs.slice(0, 4).join('; ') || `${r.serves} serves, ${r.returns} returns by the right receiver`);
  check(`${label}: one partner goes for each ball`, r.both === 0, `${r.both} of ${r.takers} frames with both chasing`);
}
// kitchen faults in play: a volley from the kitchen, and stepping in right after a volley
{
  const r = run(`(() => { const out = {};
    const setup = () => { Object.assign(gameCfg, { to:11, scoring:'sideout', kitchen:true }); newMatch('brine', false, 'game'); G.players[0].human = false;
      G.state = 'play'; G.hits = 4; G.match.server = 'home'; const pl = G.players[0], B = G.ball;
      Object.assign(B, { x:10.5, y:27.5, z:3, vx:0, vy:10, vz:0, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:0 }); return pl; };
    let pl = setup(); pl.x = 10; pl.y = 27; hitBall(pl, 'drive', null); out.inKitchen = { call: G.lastCall, server: G.match.server, pts: { ...G.match.pts } };
    pl = setup(); pl.x = 10; pl.y = 29.6; Object.assign(G.ball, { y:29.4 }); hitBall(pl, 'soft', null); const legal = G.ball.live;
    pl.vy = -8; for (let i = 0; i < 20; i++) { pl.y -= 0.08; kitchenWatch(1/60); } out.momentum = { legal, call: G.lastCall };
    return out; })()`);
  check('volleying from the kitchen is a fault (side out when serving)', r.inKitchen.call === 'kitchen' && r.inKitchen.server === 'away' && r.inKitchen.pts.home === 0, JSON.stringify(r.inKitchen));
  check('stepping into the kitchen right after a volley is a fault', r.momentum.legal && r.momentum.call === 'kitchen', JSON.stringify(r.momentum));
}
// issue fixes: momentum sideways and after a put-away, a ball that bounces in and spins back, illegal strokes don't count
{
  const r = run(`(() => { const out = {};
    const setup = () => { Object.assign(gameCfg, { to:11, scoring:'sideout', kitchen:true, twoBounce:true }); newMatch('brine', false, 'game'); G.players[0].human = false;
      G.state = 'play'; G.hits = 4; G.rally = 4; G.match.server = 'home'; const pl = G.players[0], B = G.ball;
      Object.assign(B, { x:10.5, y:27.5, z:3, vx:0, vy:10, vz:0, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:0 }); return pl; };
    // sideways: volley from just wide of the kitchen, drift in along the line
    let pl = setup(); pl.x = -1.2; pl.y = 27; Object.assign(G.ball, { x:-0.8, y:26.8 }); hitBall(pl, 'drive', null); const wideLegal = G.ball.live; out.counted = { hits: G.hits, rally: G.rally, strokes: G.stats.strokes };
    pl.vx = 6; pl.vy = 0; for (let i = 0; i < 20; i++) { pl.x += 0.1; kitchenWatch(1/60); } out.sideways = { legal: wideLegal, call: G.lastCall };
    // a put-away that's already over (double bounce) before the volleyer's momentum carries them in
    pl = setup(); pl.x = 10; pl.y = 29.6; Object.assign(G.ball, { y:29.4 }); hitBall(pl, 'drive', null);
    endRally('away', 'double bounce', 10, 5); const held = !!G.pendingEnd, ptsHeld = { ...G.match.pts };
    pl.vy = -8; for (let i = 0; i < 20; i++) { pl.y -= 0.08; kitchenWatch(1/60); } out.afterDead = { held, ptsHeld, call: G.lastCall, pts: { ...G.match.pts }, server: G.match.server };
    // ...and when the volleyer stays out, the put-away stands once the momentum is spent
    pl = setup(); pl.x = 10; pl.y = 31; Object.assign(G.ball, { y:30.8 }); hitBall(pl, 'drive', null);
    endRally('away', 'double bounce', 10, 5); pl.vx = pl.vy = 0; for (let i = 0; i < 40; i++) kitchenWatch(1/60); out.stands = { call: G.lastCall, pts: { ...G.match.pts } };
    // bounced in on the far side, spun back over the net and bounced on the hitter's side: the receiver's point lost, not a net fault
    pl = setup(); G.ball.lastBy = 'home'; G.ball.bounces = 1; G.ball.y = 23; G.lastCall = null; onBallEvent('bounce', G.ball, 5);
    out.spinBack = { call: G.lastCall, pts: { ...G.match.pts } };
    // a kitchen volley: the illegal stroke isn't counted in the rally
    pl = setup(); G.stats.longest = 0; pl.x = 10; pl.y = 27; hitBall(pl, 'drive', null);
    out.illegal = { call: G.lastCall, rally: G.rally, longest: G.stats.longest, hits: G.hits };
    return out; })()`);
  check('a legal stroke counts (hits, rally, strokes)', r.counted.hits === 5 && r.counted.rally === 5 && r.counted.strokes === 1, JSON.stringify(r.counted));
  check('momentum carrying you sideways into the kitchen is a fault', r.sideways.legal && r.sideways.call === 'kitchen', JSON.stringify(r.sideways));
  check('momentum into the kitchen after the put-away is dead still faults', r.afterDead.held && r.afterDead.ptsHeld.home === 0 && r.afterDead.call === 'kitchen' && r.afterDead.pts.home === 0 && r.afterDead.server === 'away', JSON.stringify(r.afterDead));
  check('a put-away stands once the volley\'s momentum is spent', r.stands.call === 'double bounce' && r.stands.pts.home === 1, JSON.stringify(r.stands));
  check('a ball that bounces in and spins back over is the receiver\'s miss', r.spinBack.call === 'double bounce' && r.spinBack.pts.home === 1, JSON.stringify(r.spinBack));
  check('an illegal stroke ends the rally without counting', r.illegal.call === 'kitchen' && r.illegal.longest === 4 && r.illegal.hits === 4, JSON.stringify(r.illegal));
}
// the prediction is the flight: a fast drive's predicted bounce matches where the live ball bounces; an overhead at the net is planned as a volley
{
  const r = run(`(() => { const out = {};
    Object.assign(gameCfg, { to:11, scoring:'sideout', kitchen:true }); newMatch('brine', false, 'game'); G.players.forEach(p => p.human = false);
    G.state = 'play'; G.hits = 4; const B = G.ball;
    Object.assign(B, launchFor('drive', { x:6, y:2, z:2.5 }, 14, 39), { x:6, y:2, z:2.5, live:true, lastBy:'away', bounces:0 });
    G.players.forEach(p => { p.x = -30; p.y = p.team === 'home' ? 60 : -20; });   // out of the way
    const pr = predict(B, 3), want = pr.first; let got = null;
    const ob = onBallEvent; onBallEvent = (e, b, v) => { if (e === 'bounce' && !got) got = { x:b.x, y:b.y }; return ob(e, b, v); };
    for (let i = 0; i < 240 && !got; i++) update(1/60);
    onBallEvent = ob; out.drive = { off: got && want ? Math.hypot(got.x - want.x, got.y - want.y) : null };
    newMatch('brine', false, 'game'); G.state = 'play'; G.hits = 4; const pl = G.players[0]; pl.x = 9; pl.y = 29.5;
    Object.assign(G.ball, { x:10.5, y:24, z:10, vx:0, vy:12, vz:0, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:0 });
    const sp = contactSpot(pl, G.ball); out.overhead = sp ? { bz:+sp.bz.toFixed(2), y:+sp.y.toFixed(1) } : null;
    return out; })()`);
  check('the predicted bounce is where the live ball bounces (under an inch)', r.drive.off !== null && r.drive.off < 0.08, `${r.drive.off === null ? 'no bounce' : (r.drive.off*12).toFixed(2) + ' in'}`);
  check('a high ball at the net is planned as an overhead volley, not a retreat', r.overhead && r.overhead.bz > 6 && r.overhead.y < 32, JSON.stringify(r.overhead));
}
console.log(failed ? `${failed} game check(s) failed` : 'all game checks passed');
process.exit(failed ? 1 : 0);
