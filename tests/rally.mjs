// Hitting checks: a bot that only presses shot buttons (the move-to-ball assist does the running) rallies with the
// ball cannon and the stand-in crew. This is milestone 3's "done when". No browser needed: node tests/rally.mjs
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
  // stand-ins for the page-side modules
  sfx(){}, band(){}, toast(){}, humans: () => 1, startAttract(){}, showResults(){},
  BOT: { input:[0, 0], aim:[0, 0], plant:false }, readInput: () => sandbox.BOT.input, readAim: () => sandbox.BOT.aim, actionHeld: (p, a) => a === 'plant' && sandbox.BOT.plant,
};
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/match.js', 'js/ball.js', 'js/rules.js', 'js/shots.js', 'js/swings.js', 'js/referee.js', 'js/players.js', 'js/hazards.js', 'js/booty.js', 'js/voyage.js', 'js/ai.js', 'js/update.js'])
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename: f });
const run = src => vm.runInContext(src, sandbox);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };
const pct = v => Math.round(v*100) + '%';
// Math.random is shared with the sandbox; seed it so CI runs are repeatable
let seed = 12345; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;

// a session: the bot presses `kind` (or a mix) `lead` seconds before the ball arrives at its contact spot
run(`var botPress = (lead, kinds) => { const pl = G.players[0], B = G.ball;
  if (!ballFor(pl, B) || pl.queue) return;
  if (pl.botFor !== G.shotN) { pl.botFor = G.shotN; pl.botLead = lead(); pl.botKind = kinds[Math.floor(Math.random()*kinds.length)]; pl.botSpot = contactSpot(pl, B); pl.botAt = G.time; }
  if (pl.botSpot && pl.botSpot.t - (G.time - pl.botAt) <= pl.botLead) queueShot(pl, pl.botKind, { hold:false });
}`);
function session({ opp, feed = 'mix', seconds, lead, kinds = ['drive', 'soft', 'lob'], assist = 0.6 }){
  return run(`(() => {
    practice.opp = ${JSON.stringify(opp)}; practice.feed = ${JSON.stringify(feed)}; practice.rate = 'fast';
    TUNE.assist = ${assist};
    newMatch('brine', false);
    const rallies = []; let hits = 0, lastRally = 0;
    const lead = ${lead.toString()}, kinds = ${JSON.stringify(kinds)};
    for (let i = 0; i < ${seconds}*60; i++) {
      botPress(lead, kinds);
      const before = G.rally; update(1/60);
      if (G.rally > before && G.lastShot.team === 'home') hits++;
      if (before > 0 && G.rally === 0) rallies.push(before);
    }
    const n = G.score.home + G.score.away;
    return { home:G.score.home, away:G.score.away, n, hits, rallies, avg: rallies.length ? rallies.reduce((a, b) => a + b, 0)/rallies.length : 0 };
  })()`);
}
// 1. cannon only, good timing: most returns land in
{
  const r = session({ opp:'none', seconds:300, lead: () => 0.15 + Math.random()*0.3 });
  check('cannon only: 70%+ of returns land in with good timing', r.n >= 60 && r.home/r.n >= 0.7, `${r.home} of ${r.n} in (${pct(r.home/r.n)})`);
}
// 2. pressing much too early is punished
{
  const good = session({ opp:'none', seconds:120, lead: () => 0.15 + Math.random()*0.3 });
  const early = session({ opp:'none', seconds:120, lead: () => 0.95 + Math.random()*0.1 });
  check('pressing too early lands fewer', early.home/early.n < good.home/good.n - 0.08, `${pct(early.home/early.n)} early vs ${pct(good.home/good.n)} on time`);
  const late = session({ opp:'none', seconds:120, lead: () => Math.random()*0.03 });
  check('pressing at the last instant lands fewer', late.home/late.n < good.home/good.n - 0.05, `${pct(late.home/late.n)} late vs ${pct(good.home/good.n)} on time`);
}
// 3. without the assist and without moving, you can't reach most balls
{
  const r = session({ opp:'none', seconds:90, lead: () => 0.3, assist:0 });
  check('no assist, standing still: most balls get past', r.home/r.n < 0.4, `${pct(r.home/r.n)} in`);
}
// 4. the done-when: rallies with the cannon and the stand-in crew across the net
{
  const r = session({ opp:'cpu', seconds:240, lead: () => 0.15 + Math.random()*0.3 });
  const long = r.rallies.filter(n => n >= 4).length;
  check('rally with the crew: 3+ shots on average', r.avg >= 3, `${r.rallies.length} rallies, ${r.avg.toFixed(1)} shots on average, best ${Math.max(...r.rallies)}`);
  check('rally with the crew: a third of rallies reach 4+ shots', long/r.rallies.length >= 0.33, `${long} of ${r.rallies.length}`);
}
// 5. shot types: a high ball near the net becomes a smash; soft is a dink at the kitchen and a drop from the back
{
  const r = run(`(() => {
    newMatch('brine', false); G.state = 'play'; G.hits = 3; const pl = G.players[0], B = G.ball;
    const at = (x, y, z, bounced) => Object.assign(B, { x, y, z, vx:0, vy:8, vz:-2, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces: bounced ? 1 : 0 });
    pl.x = 10; pl.y = 30; at(11.2, 29.8, 6.2, false); hitBall(pl, 'drive', null); const smash = G.ball.lastKind;   // just outside the kitchen
    G.hits = 3; G.ball.live = true; pl.x = 10; pl.y = 29.5; at(11.2, 29.3, 1.6, true); hitBall(pl, 'soft', null); const dink = G.ball.lastKind;
    G.hits = 3; pl.x = 10; pl.y = 41; at(11.2, 40.8, 2.2, true); hitBall(pl, 'soft', null); const drop = G.ball.lastKind;
    G.hits = 1; pl.x = 10; pl.y = 41; at(11.2, 40.8, 2.2, false); const volleyServe = hitBall(pl, 'drive', null);
    return { smash, dink, drop, volleyServe };
  })()`);
  check('high ball at the net is smashed', r.smash === 'smash', r.smash);
  check('soft: dink at the kitchen, drop from the back', r.dink === 'dink' && r.drop === 'drop', `${r.dink} / ${r.drop}`);
  check('two-bounce rule: no volleying the return', r.volleyServe === false, String(r.volleyServe));
}
// 6. manual aim goes where you point (within the spray)
{
  const r = run(`(() => { let left = 0, right = 0;
    for (let i = 0; i < 40; i++) { for (const [ax, tag] of [[-1, 'l'], [1, 'r']]) {
      newMatch('brine', false); G.state = 'play'; G.hits = 3; const pl = G.players[0], B = G.ball; pl.x = 10; pl.y = 40;
      Object.assign(B, { x:11.2, y:39.8, z:2.5, vx:0, vy:6, vz:-1, sx:0, sy:0, sz:0, live:true, lastBy:'away', bounces:1 });
      hitBall(pl, 'drive', [ax, 0]); const pr = predict(G.ball, 3, BALL_DT, 1e4);
      if (pr.first && (tag === 'l' ? pr.first.x < CW/2 : pr.first.x > CW/2)) tag === 'l' ? left++ : right++; } }
    return { left, right }; })()`);
  check('aim left lands left, aim right lands right', r.left >= 36 && r.right >= 36, `${r.left}/40 left, ${r.right}/40 right`);
}
console.log(failed ? `${failed} hitting check(s) failed` : 'all hitting checks passed');
process.exit(failed ? 1 : 0);
