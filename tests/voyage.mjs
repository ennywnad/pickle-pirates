// Voyage checks (milestone 11): the career's stars, objectives, island order and booty unlocks.
//   node tests/voyage.mjs
// 1. Stars and unlocks: islands open in order, power-ups unlock at 3, 6, 9 and 12 stars, the save code keeps it all.
// 2. Every objective is scored right, from the per-crew counters the sim keeps.
// 3. CPU-played Voyage matches: the stars recorded match what happened, only unlocked booty is dealt, nothing breaks.
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
let seed = 4242; Math.random = () => (seed = (seed*16807) % 2147483647)/2147483647;
const run = src => vm.runInContext(src, sandbox);
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };
const GAMES = Number(process.env.GAMES || 7);

// ---------- 1. stars, island order, unlocks, save codes
{
  const r = run(`(() => { save = normSave({});
    const fresh = { total:voyTotal(), pool:voyUnlocked().join(), open:VOYAGE.map((L, i) => voyOpen(i)), next:voyNext() };
    save.stars = { brine:[true, true, false], wreck:[true, false, true] };
    const mid = { total:voyTotal(), pool:voyUnlocked().length, open:VOYAGE.map((L, i) => voyOpen(i)), next:voyNext() };
    save.stars = Object.fromEntries(VOYAGE.map(L => [L.island, [true, true, true]]));
    const all = { total:voyTotal(), pool:voyUnlocked().length, next:voyNext(), cup:voyCupWon() };
    const code = exportSave(); save = normSave({}); const imp = importSave(code);
    return { fresh, mid, all, imp:imp.ok, back:voyTotal() }; })()`);
  check('a new voyage: no stars, three power-ups, only Brine Bay open', r.fresh.total === 0 && r.fresh.pool === 'cannonball,pegleg,parrot' && r.fresh.open.filter(Boolean).length === 1 && r.fresh.next === 0, JSON.stringify(r.fresh));
  check('winning an island opens the next; 4 stars unlock Kraken Ink', r.mid.total === 4 && r.mid.pool === 4 && r.mid.open.filter(Boolean).length === 3 && r.mid.next === 2, JSON.stringify(r.mid));
  check('all 21 stars: every power-up, the Cup won, nothing left to sail to', r.all.total === 21 && r.all.pool === 7 && r.all.next === null && r.all.cup);
  check('the save code carries the Voyage stars', r.imp && r.back === 21, `${r.back} stars after a round trip`);
}
// ---------- 2. objectives from the counters
{
  const r = run(`(() => {
    const out = {};
    const try1 = (leg, set, pts) => { save = normSave({}); Object.assign(gameCfg, voyOver(VOYAGE[leg]));
      newMatch(VOYAGE[leg].island, false, 'game', { voyage:leg, seats:[] }); Object.assign(G.stats.team.home, set);
      G.match.winner = pts[0] > pts[1] ? 'home' : 'away'; G.match.pts.home = pts[0]; G.match.pts.away = pts[1];
      return voyFinish().got.map(Number).join(''); };
    out.winners = [try1(0, { winners:3 }, [11, 4]), try1(0, { winners:2 }, [11, 9]), try1(0, { winners:5 }, [8, 11])];
    out.longrally = [try1(1, { longWin:8 }, [11, 7]), try1(1, { longWin:7 }, [11, 2])];
    out.nostun = [try1(2, { stunned:0 }, [11, 9]), try1(2, { stunned:1 }, [11, 1])];
    out.crates = [try1(3, { crates:2 }, [12, 10]), try1(3, { crates:1 }, [11, 6])];
    out.nokitchen = [try1(4, { kitchen:0 }, [11, 5]), try1(4, { kitchen:2 }, [11, 5])];
    out.streak = [try1(5, { bestStreak:4 }, [11, 8]), try1(5, { bestStreak:3 }, [11, 8])];
    out.used = [try1(6, { used:3 }, [15, 9]), try1(6, { used:2 }, [15, 13])];
    // keeps the best: a later worse result doesn't take stars away
    save = normSave({}); save.stars.brine = [true, false, true]; Object.assign(gameCfg, voyOver(VOYAGE[0])); newMatch('brine', false, 'game', { voyage:0, seats:[] });
    G.match.winner = 'away'; G.match.pts.home = 3; G.match.pts.away = 11; const keep = voyFinish(); out.keep = voyStars('brine').map(Number).join('') + ' fresh ' + keep.fresh.map(Number).join('');
    return out; })()`);
  const want = { winners:['111', '100', '000'], longrally:['110', '101'], nostun:['110', '101'], crates:['110', '101'], nokitchen:['111', '101'], streak:['110', '100'], used:['111', '100'] };
  for (const [k, w] of Object.entries(want)) check(`objective "${k}": scored only when the match is won and the objective met`, JSON.stringify(r[k]) === JSON.stringify(w), `${r[k].join(' ')} (want ${w.join(' ')})`);
  check('stars are kept: a loss never takes one away', r.keep === '101 fresh 000', r.keep);
}
// ---------- 3. CPU-played Voyage matches
{
  const r = run(`(() => {
    const out = [], errs = []; save = normSave({});
    for (let g = 0; g < ${GAMES}; g++) {
      const leg = g % VOYAGE.length, L = VOYAGE[leg]; Object.assign(gameCfg, voyOver(L));
      newMatch(L.island, false, 'game', { voyage:leg, seats:[{ team:'home', slot:0, pad:0 }] });
      const me = G.players[0]; me.human = false; me.tier = 'captain';
      const pool = G.voyage.pool, dealt = new Set();
      let t = 0; while (G.state !== 'end' && t < 60*60*40) { update(1/60); t++; for (const tm of ['home', 'away']) if (G.booty.held[tm]) dealt.add(G.booty.held[tm]);
        if (G.state === 'over' && G.stT <= 0.05) break; }
      if (G.state !== 'end' && !G.match.winner) { errs.push(L.island + ' did not finish'); continue; }
      const R = voyFinish(), P = voyProgress(), S = G.match, won = S.winner === 'home';
      if (R.got[0] !== won) errs.push(L.island + ': win star wrong');
      if (R.got[2] !== (won && S.pts.home - S.pts.away >= VOYAGE_MARGIN)) errs.push(L.island + ': margin star wrong');
      if ([...dealt].some(k => !pool.includes(k))) errs.push(L.island + ': dealt locked booty ' + [...dealt].filter(k => !pool.includes(k)).join(','));
      if (S.to !== L.to || G.cfg.marker || !G.cfg.kitchen || G.cfg.scoring !== 'sideout') errs.push(L.island + ': rules not straight');
      out.push(L.island + ' ' + S.pts.home + '–' + S.pts.away + ' ' + R.got.map(b => b ? '★' : '·').join('') + ' (' + voyProgressText() + ')');
    }
    return { out, errs, total:voyTotal(), pool:voyUnlocked().length }; })()`);
  check('CPU-played Voyage matches: stars match the result, only unlocked booty is dealt, rules played straight', r.errs.length === 0, r.errs.join('; ') || r.out.join(' | '));
  check('the stars unlock power-ups as they come in', r.pool === run(`VOYAGE_UNLOCKS.filter(([n]) => ${r.total} >= n).length`), `${r.total} stars, ${r.pool} power-ups`);
}
console.log(failed ? `${failed} voyage check(s) failed` : 'all voyage checks passed');
process.exit(failed ? 1 : 0);
