// Fight mode checks: boarding duels for the other crew's ship.
//   node tests/fight.mjs
// 1. Broadsides: each rally won hits the loser's hull (twice for long rallies, aces and smash winners); a sunk hull ends
//    the match; the score never ends it.
// 2. Winning takes the ship (your next fight is on her deck); losing doesn't; the whole fleet ends in defending it.
// 3. CPU-played fights from the rowboat to the galleon finish cleanly under the normal rules.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}) });
const sandbox = { document:{ getElementById:stubEl, createElement:stubEl }, window:{ matchMedia:() => ({ matches:false }) }, matchMedia:() => ({ matches:false }),
  localStorage:{ getItem:() => null, setItem(){} }, console, Math, JSON, Object, Array, Number, String, Set, Map, btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent, Date,
  sfx(){}, band(){}, toast(){}, humans:() => 1, startAttract(){}, showResults(){},
  readInput:() => [0, 0], readAim:() => [0, 0], actionHeld:() => false };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/swings.js', 'js/referee.js', 'js/players.js', 'js/hazards.js', 'js/booty.js', 'js/voyage.js', 'js/replay.js', 'js/fight.js', 'js/ai.js', 'js/update.js'])
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename:f });
let seed = 31337; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };
const start = `const F = nextFight(); Object.assign(gameCfg, fightOver(F)); newMatch('brine', false, 'game', { fight:F, crews:{ home:'pickle', away:F.crew }, seats:[{ team:'home', slot:0, pad:0 }] });`;

{
  const r = run(`(() => { save = normSave({}); ${start}
    const out = { island:G.island.id, hulls:[G.fight.hull.home, G.fight.hull.away], away:G.crew.away.id, tier:G.players[1].tier, scoring:G.match.scoring, hazards:!!G.haz };
    G.state = 'play'; G.ball.live = true; G.rally = 3; G.hits = 3; endRally('away', 'out', 10, 10);
    out.afterOne = [G.fight.hull.home, G.fight.hull.away];
    G.state = 'play'; G.ball.live = true; G.rally = 13; G.hits = 13; endRally('home', 'double bounce', 10, 10);
    out.afterBig = [G.fight.hull.home, G.fight.hull.away];
    for (let i = 0; i < 30 && !G.match.over; i++) { G.state = 'play'; G.ball.live = true; G.rally = 3; G.hits = 3; G.players.forEach(p => p.momentum = 0); endRally('away', 'net', 10, 10); }
    out.end = { over:G.match.over, winner:G.match.winner, hulls:[G.fight.hull.home, G.fight.hull.away], pts:G.match.pts.home + '–' + G.match.pts.away, state:G.state };
    return out; })()`);
  check('a fight from the rowboat: on her deck, against the sloop\'s crew, rally scoring, no island hazard', r.island === 'ship_rowboat' && r.hulls.join() === '6,8' && r.away === 'brine' && r.tier === 'deckhand' && r.scoring === 'rally' && !r.hazards, JSON.stringify(r).slice(0, 160));
  check('a rally won fires a broadside into the loser (1); a long rally fires a double (2)', r.afterOne.join() === '6,7' && r.afterBig.join() === '4,7', `${r.afterOne} then ${r.afterBig}`);
  check('the first ship to sink loses, whatever the score', r.end.over && r.end.winner === 'home' && r.end.hulls[1] === 0 && r.end.state === 'over', JSON.stringify(r.end));
}
{
  const r = run(`(() => { save = normSave({}); const out = [];
    ${start} G.match.over = true; G.match.winner = 'away'; out.push(fightFinish().took + ' ' + fleetShip());
    ${start.replace('const F', 'const F2').replace(/F\b(?!2)/g, 'F2')} G.match.over = true; G.match.winner = 'home'; out.push(fightFinish().took + ' ' + fleetShip() + ' ' + G.island.id);
    const F3 = nextFight(); Object.assign(gameCfg, fightOver(F3)); newMatch('brine', false, 'game', { fight:F3, crews:{ home:'pickle', away:F3.crew }, seats:[] }); out.push(G.island.id + ' ' + G.fight.max.home + ' vs ' + G.fight.max.away + ' ' + G.players[1].tier);
    save.fleet.ship = 3; const D = nextFight(); out.push(D.defend + ' ' + D.home.id + ' ' + D.tier);
    const code = exportSave(); save = normSave({}); importSave(code); out.push(fleetShip());
    return out; })()`);
  check('losing a fight keeps your ship; winning takes theirs', r[0] === 'false 0' && r[1] === 'true 1 ship_rowboat', r.slice(0, 2).join(' | '));
  check('the next fight is on the sloop\'s deck, her hull against the brigantine\'s, at Bosun level', r[2] === 'ship_sloop 8 vs 10 bosun', r[2]);
  check('with the galleon, fights are to defend her; the save code keeps the fleet', r[3] === 'true galleon captain' && r[4] === 3, `${r[3]} · ship ${r[4]}`);
}
{
  const r = run(`(() => { save = normSave({}); const out = [], errs = [];
    for (let g = 0; g < 4; g++) {
      ${start} const me = G.players[0]; me.human = false; me.tier = 'captain';
      let t = 0; while (G.state !== 'end' && t < 60*60*30) { update(1/60); t++; if (G.state === 'over' && G.stT <= 0.05) break; }
      if (!G.match.over) { errs.push('fight ' + g + ' did not finish'); break; }
      const FF = G.fight, loser = other(G.match.winner);
      if (FF.hull[loser] !== 0 || FF.hull[G.match.winner] <= 0) errs.push('fight ' + g + ': ended without a sinking');
      const was = G.island.id; const R = fightFinish(); out.push(was + ' ' + (R.won ? 'won' : 'lost') + ' ' + FF.hull.home + '–' + FF.hull.away + ' in ' + G.match.rallies);
    }
    return { out, errs, ship:fleetShip() }; })()`);
  check('CPU-played fights finish with a sinking, and winning climbs the fleet', r.errs.length === 0 && r.ship >= 1, (r.errs.join('; ') || r.out.join(' | ')) + ` · ship ${r.ship}`);
}
console.log(failed ? `${failed} fight check(s) failed` : 'all fight checks passed');
process.exit(failed ? 1 : 0);
