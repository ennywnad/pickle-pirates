// Instant replay checks: great points get a half-speed replay that holds the game and puts everything back exactly.
//   node tests/replay.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}) });
const sandbox = { document:{ getElementById:stubEl, createElement:stubEl }, window:{ matchMedia:() => ({ matches:false }) }, matchMedia:() => ({ matches:false }),
  localStorage:{ getItem:() => null, setItem(){} }, console, Math, JSON, Object, Array, Number, String, Set, Map,
  sfx(){}, band(){}, toast(){}, humans:() => 1, startAttract(){}, showResults(){},
  readInput:() => [0, 0], readAim:() => [0, 0], actionHeld:() => false };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/swings.js', 'js/referee.js', 'js/players.js', 'js/hazards.js', 'js/booty.js', 'js/voyage.js', 'js/replay.js', 'js/fight.js', 'js/ai.js', 'js/update.js'])
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename:f });
let seed = 777; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };

const game = (on, skipAt) => run(`(() => {
  A11Y.replay = ${on}; Object.assign(gameCfg, { to:11, scoring:'sideout', tier:'captain', hazards:true, booty:true });
  newMatch('kraken', false, 'game', { seats:[{ team:'home', slot:0, pad:0 }] }); G.players[0].human = false; G.players[0].tier = 'captain';
  const out = { replays:0, reasons:[], held:true, restored:true, frames:[], skipped:0, longest:0 };
  let t = 0, before = null, rallies = 0, seen = 0;
  while (G.state !== 'end' && t < 60*60*60) {
    t++;
    const was = !!G.replay;
    if (replayTick(1/60)) {
      if (!was) { out.replays++; out.reasons.push(G.replay.title); out.frames.push(G.replay.frames.length); before = { ...G.replay.live, ball:{ ...G.replay.live.ball } }; rallies = G.match.rallies; seen = 0; }
      seen++; if (G.match.rallies !== rallies) out.held = false;
      if (${skipAt} && seen === ${skipAt}) { skipReplay(); out.skipped++; }
      if (!G.replay) { const now = snapshot(); if (now.t !== before.t || now.ball.x !== before.ball.x || now.ball.z !== before.ball.z || G.players.some((p, i) => p.x !== before.pl[i].x || p.hit !== before.pl[i].hit)) out.restored = false; }
      continue;
    }
    if (was && !G.replay && before) { const now = snapshot(); if (now.t !== before.t || now.ball.x !== before.ball.x || G.players.some((p, i) => p.x !== before.pl[i].x)) out.restored = false; }
    update(1/60);
  }
  out.done = G.state === 'end'; out.pts = G.match.pts.home + '–' + G.match.pts.away; out.longest = G.stats.longest; out.rallies = G.match.rallies;
  return out; })()`);
{
  const r = game(true, 0);
  check('great points get a replay (long rallies, smash winners), spaced out', r.replays >= 1 && r.replays <= Math.ceil(r.rallies/4), `${r.replays} replays in ${r.rallies} rallies (longest ${r.longest}): ${[...new Set(r.reasons)].join(', ')}`);
  check('a replay shows the last few seconds (about 5 s of frames)', r.frames.every(n => n > 30 && n <= 300), r.frames.join(', '));
  check('the game holds still while a replay plays, and everything is put back exactly afterwards', r.held && r.restored);
  check('the game still finishes normally', r.done, r.pts);
}
{
  const r = game(true, 20);
  check('a replay can be skipped, and the game carries on', r.skipped === r.replays && r.replays > 0 && r.restored && r.done, `${r.skipped} of ${r.replays} skipped, ${r.pts}`);
}
{
  const r = game(false, 0);
  check('with instant replays switched off there are none', r.replays === 0 && r.done, r.pts);
}
console.log(failed ? `${failed} replay check(s) failed` : 'all replay checks passed');
process.exit(failed ? 1 : 0);
