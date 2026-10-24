// CPU checks: milestone 5's "done when" — the CPU wins and loses believably, and a 20-game soak runs clean.
//   node tests/ai.mjs            full run: tier ladder, vs a human-like bot, strategy, 20-game soak
//   SOAK=6 QUICK=1 node tests/ai.mjs   what CI runs: 3-game series, a 6-game soak, and no three-way ordering check
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}) });
const sandbox = { document:{ getElementById:stubEl, createElement:stubEl }, window:{ matchMedia:() => ({ matches:false }) }, matchMedia:() => ({ matches:false }),
  localStorage:{ getItem:() => null, setItem(){} }, console, Math, JSON, Object, Array, Number, String, Set, Map,
  sfx(){}, band(){}, toast(){}, humans:() => 1, startAttract(){}, showResults(){},
  readInput:() => [0, 0], readAim:() => [0, 0], actionHeld:() => false };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/swings.js', 'js/referee.js', 'js/players.js', 'js/hazards.js', 'js/booty.js', 'js/ai.js', 'js/update.js'])
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename:f });
let seed = Number(process.env.SEED || 777); Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);
const SOAK = Number(process.env.SOAK || 20);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };

// one game. home = a tier, or 'bot' (a decent human: presses on time, lets the move-to-ball assist run, picks shots at random)
run(`var playGame = (home, away, cfg) => {
  Object.assign(gameCfg, { to:11, scoring:'sideout', kitchen:true, twoBounce:true, hazards:false, booty:false, ...cfg, tier:away });   // CPU strength without island hazards or booty
  newMatch(cfg.island || 'brine', false, 'game');
  const me = G.players[0], S = G.match, errs = [];
  if (home === 'bot') me.human = true; else { me.human = false; me.tier = home; }
  let pointT = 0, quietT = 0, lastHits = 0, longestPoint = 0, netVisits = 0, pops = 0, cpuShots = 0;
  const ope = endPoint; endPoint = (winner, kind) => {
    const before = { ...S.pts }, server = S.server; ope(winner, kind);
    const d = { home: S.pts.home - before.home, away: S.pts.away - before.away };
    if (S.scoring === 'sideout' && winner === server && !(d[winner] === 1)) errs.push('server won without scoring');
    if (S.scoring === 'sideout' && winner !== server && (d.home || d.away)) errs.push('receiver scored');
    longestPoint = Math.max(longestPoint, pointT); pointT = 0;
  };
  const ost = strike; strike = (pl, Q, c) => { const r = ost(pl, Q, c); if (pl.team === 'away') { cpuShots++; if ((Q.arcK || 1) > 1.5) pops++; } return r; };
  let t = 0, upFrames = 0, liveFrames = 0;
  while (G.state !== 'end' && t < 60*60*40) {
    if (home === 'bot') {
      if (G.state === 'serve' && S.server === 'home') doServe(me, ['drive', 'soft', 'drive'][Math.floor(Math.random()*3)], null);
      const B = G.ball;
      if (ballFor(me, B) && !me.queue) { if (me.botFor !== G.shotN) { me.botFor = G.shotN; me.botLead = 0.15 + Math.random()*0.3; me.botKind = ['drive', 'soft', 'lob', 'drive', 'soft'][Math.floor(Math.random()*5)]; me.botSpot = contactSpot(me, B); me.botAt = G.time; }
        if (me.botSpot && me.botSpot.t - (G.time - me.botAt) <= me.botLead) queueShot(me, me.botKind, {}); }
    }
    update(1/60); t++; pointT += 1/60; quietT = G.hits !== lastHits ? 0 : quietT + 1/60; lastHits = G.hits;
    if (G.state === 'play' && G.hits >= 4) { liveFrames++; if (atNet('away', G.players[1].y)) upFrames++; }
    if (!isFinite(G.ball.x + G.ball.y + G.ball.z) || G.players.some(p => !isFinite(p.x + p.y))) { errs.push('NaN'); break; }
    if (quietT > 20 || pointT > 180) { const B = G.ball, f = v => +v.toFixed(1);
      errs.push('a point stalled (' + Math.round(pointT) + ' s, nothing hit for ' + Math.round(quietT) + ' s): state ' + G.state + ', hits ' + G.hits + ', ball ' + [B.x, B.y, B.z, B.vx, B.vy, B.vz].map(f) + ' live ' + B.live + ' bounces ' + B.bounces + ' lastBy ' + B.lastBy + ', '
        + G.players.map(p => p.team + ' ' + f(p.x) + ',' + f(p.y) + ' q ' + (p.queue ? p.queue.kind : '-') + ' spot ' + (p.spot ? f(p.spot.t) : '-')).join(' / ')); break; }
  }
  if (G.state !== 'end') errs.push('game did not finish');
  const kinds = { ...G.stats.faults };
  return { winner:S.winner, pts:{ ...S.pts }, rallies:S.rallies, errs:[...new Set(errs)], minutes:+(t/3600).toFixed(1), longestPoint:+longestPoint.toFixed(1),
    longest:G.stats.longest, avgRally: G.stats.strokes/Math.max(1, S.rallies), faultBy:G.stats.faultBy, kinds, netShare: liveFrames ? upFrames/liveFrames : 0, popRate: cpuShots ? pops/cpuShots : 0 };
}`);
const ALL = [];
const series = (home, away, n, cfg = {}) => {
  const games = []; for (let i = 0; i < n; i++) games.push(run(`playGame(${JSON.stringify(home)}, ${JSON.stringify(away)}, ${JSON.stringify(cfg)})`));
  const homeWins = games.filter(g => g.winner === 'home').length;
  const loserPts = games.map(g => Math.min(g.pts.home, g.pts.away));
  const pts = games.reduce((a, g) => [a[0] + g.pts.home, a[1] + g.pts.away], [0, 0]);
  ALL.push({ errs:[...new Set(games.flatMap(g => g.errs))] });
  return { games, homeWins, n, share: pts[0]/(pts[0] + pts[1]), avgLoser: loserPts.reduce((a, b) => a + b, 0)/n, errs:[...new Set(games.flatMap(g => g.errs))] };
};
const pc = x => Math.round(x*100) + '%';
const score = s => s.games.map(g => `${g.pts.home}–${g.pts.away}`).join(' ');

// 1. the ladder: a higher tier beats a lower one most of the time, but not 11–0 every game
const quick = process.env.QUICK ? 3 : 5;
{
  const capVsDeck = series('captain', 'deckhand', quick), bosVsDeck = series('bosun', 'deckhand', quick), capVsBos = series('captain', 'bosun', quick);
  check('captain beats deckhand', capVsDeck.homeWins >= quick - 1, `${capVsDeck.homeWins}/${quick} · ${score(capVsDeck)}`);
  check('bosun beats deckhand more often than not', bosVsDeck.homeWins > quick/2, `${bosVsDeck.homeWins}/${quick} · ${score(bosVsDeck)}`);
  check('captain beats bosun more often than not', capVsBos.homeWins > quick/2, `${capVsBos.homeWins}/${quick} · ${score(capVsBos)}`);
  const all = [capVsDeck, bosVsDeck, capVsBos];
  // one tier apart the loser still gets a few points; captain against deckhand is meant to be a mismatch
  check('one tier apart, the losing side still scores', bosVsDeck.avgLoser >= 1.5 && capVsBos.avgLoser >= 1.5, `${bosVsDeck.avgLoser.toFixed(1)} / ${capVsBos.avgLoser.toFixed(1)} points on average for the loser (captain vs deckhand: ${capVsDeck.avgLoser.toFixed(1)})`);
}
// 2. against a decent human (the bot): beats the deckhand, loses to the captain
{
  const deck = series('bot', 'deckhand', quick), cap = series('bot', 'captain', quick), bos = series('bot', 'bosun', quick);
  check('a decent player beats the deckhand', deck.homeWins >= Math.ceil(quick*0.6), `${deck.homeWins}/${quick} · ${score(deck)}`);
  check('the captain beats a decent player', cap.homeWins <= Math.floor(quick*0.4) || cap.share < 0.45, `bot won ${cap.homeWins}/${quick} · ${score(cap)} · bot's share of points ${pc(cap.share)}`);   // a few games are noisy: a clear points edge counts too
  // wins are noisy over a few games; the share of points won is steadier
  if (process.env.QUICK) console.log('skip the bosun is in between  · three games each is too few to order three levels; the full run checks it');
  else check('the bosun is in between', bos.share < deck.share + 0.06 && bos.share > cap.share, `bot won ${bos.homeWins}/${quick} · ${score(bos)} · bot's share of points: deckhand ${pc(deck.share)}, bosun ${pc(bos.share)}, captain ${pc(cap.share)}`);
}
check('every ladder and bot game finished cleanly', ALL.every(s => !s.errs.length), ALL.flatMap(s => s.errs).slice(0, 3).join('; '));
// 3. how it plays: comes to the net, pops up dinks more at the easy tier
{
  const cap = series('bosun', 'captain', 3), deck = series('bosun', 'deckhand', 3);
  const share = s => s.games.reduce((a, g) => a + g.netShare, 0)/s.games.length, pop = s => s.games.reduce((a, g) => a + g.popRate, 0)/s.games.length;
  check('the captain plays at the kitchen line more than the deckhand', share(cap) > share(deck) + 0.1, `${Math.round(share(cap)*100)}% vs ${Math.round(share(deck)*100)}% of rally time at the line`);
  check('the deckhand pops up more dinks', pop(deck) > pop(cap), `${(pop(deck)*100).toFixed(1)}% vs ${(pop(cap)*100).toFixed(1)}% of shots`);
}
// 4. the soak: games across tiers, islands and formats, every point under the rules
{
  const islands = ['brine', 'wreck', 'cannon', 'volcano', 'kraken', 'ghost', 'locker'], tiers = ['deckhand', 'bosun', 'captain'], fmts = [{ to:11, scoring:'sideout' }, { to:11, scoring:'rally' }, { to:15, scoring:'sideout' }];
  const out = []; let errs = [];
  for (let i = 0; i < SOAK; i++) {
    const home = i % 4 === 3 ? 'bot' : tiers[i % 3], away = tiers[(i + 1) % 3], cfg = { ...fmts[i % 3], island: islands[i % 7] };
    const g = run(`playGame(${JSON.stringify(home)}, ${JSON.stringify(away)}, ${JSON.stringify(cfg)})`);
    out.push(g); errs = errs.concat(g.errs.map(e => `game ${i + 1}: ${e}`));
  }
  const rallies = out.reduce((a, g) => a + g.rallies, 0), mins = out.reduce((a, g) => a + g.minutes, 0);
  const faults = {}; for (const g of out) for (const [k, n] of Object.entries(g.kinds)) faults[k] = (faults[k] || 0) + n;
  const errShare = ((faults.net || 0) + (faults.out || 0))/rallies, avgRally = out.reduce((a, g) => a + g.avgRally, 0)/out.length;
  check(`${SOAK}-game soak runs clean`, errs.length === 0, errs.slice(0, 5).join('; ') || `${rallies} rallies over ${mins.toFixed(0)} sim minutes, longest point ${Math.max(...out.map(g => g.longestPoint))} s`);
  check('soak: points end in a believable mix', errShare > 0.05 && errShare < 0.55 && (faults['double bounce'] || 0) > 0, JSON.stringify(faults));
  check('soak: rallies run 4–14 shots on average', avgRally >= 4 && avgRally <= 14, `${avgRally.toFixed(1)} shots per rally`);
}
console.log(failed ? `${failed} CPU check(s) failed` : 'all CPU checks passed');
process.exit(failed ? 1 : 0);
