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
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/referee.js', 'js/players.js', 'js/ai.js', 'js/update.js'])
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
console.log(failed ? `${failed} game check(s) failed` : 'all game checks passed');
process.exit(failed ? 1 : 0);
