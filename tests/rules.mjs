// Rules checks: every rule the game enforces, against the 2026 rulebook. No browser needed: node tests/rules.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const stubEl = () => ({ getContext: () => ({}) });
const sandbox = { document:{ getElementById:stubEl, createElement:stubEl }, window:{ matchMedia:() => ({ matches:false }) }, matchMedia:() => ({ matches:false }),
  localStorage:{ getItem:() => null, setItem(){} }, console, Math, JSON, Object, Array, Number, String };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/rules.js']) vm.runInContext(readFileSync(new URL(f, root), 'utf8'), sandbox, { filename:f });
const run = src => vm.runInContext(src, sandbox);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  · ' + detail : ''}`); if (!ok) failed++; };
// play a sequence of rally winners ('h' / 'a') and report the score and what happened
const play = (opt, seq) => run(`(() => { const S = newScore(${JSON.stringify(opt)}), log = [];
  for (const c of ${JSON.stringify(seq)}) log.push(awardRally(S, c === 'h' ? 'home' : 'away'));
  return { S, log, call: scoreCall(S), court: serverCourt(S), gp: gamePoint(S) }; })()`);

// ---------- scoring (4.A, 4.B, 14.A)
{
  const r = play({}, 'hhhaa');
  // home wins 3 on serve, loses one (side out, no point), then away wins one on their serve
  check('side-out: only the server scores', r.S.pts.home === 3 && r.S.pts.away === 1 && r.S.server === 'away' && r.log[3].sideOut && !r.log[3].scored && !r.log[4].sideOut && r.log[4].scored,
    `${r.S.pts.home}–${r.S.pts.away}, server ${r.S.server}`);
}
{
  const r = play({}, 'ha');
  check('side-out: losing a rally on serve passes the serve', r.S.server === 'away' && r.S.pts.home === 1 && r.S.pts.away === 0 && r.call === '0–1', `server ${r.S.server}, call ${r.call}`);
}
{
  const r = play({ scoring:'rally' }, 'hhaa');
  check('rally scoring: every rally scores, the winner serves next', r.S.pts.home === 2 && r.S.pts.away === 2 && r.S.server === 'away', `${r.S.pts.home}–${r.S.pts.away}, server ${r.S.server}`);
}
{
  const r = play({}, 'hhhhhhhhhhh');
  check('game to 11 ends at 11–0', r.S.over && r.S.winner === 'home' && r.S.pts.home === 11, `${r.S.pts.home}–${r.S.pts.away}`);
}
{
  // 10–10 with side-out: home must win by 2
  const seq = 'h'.repeat(10) + 'a' + 'a'.repeat(10) + 'h' + 'h';   // home 10, side out, away 10, side out, home 11 (not over)
  const r = play({}, seq);
  check('win by 2: 11–10 is not game', !r.S.over && r.S.pts.home === 11 && r.S.pts.away === 10, `${r.S.pts.home}–${r.S.pts.away}`);
  const r2 = play({}, seq + 'h');
  check('win by 2: 12–10 is game', r2.S.over && r2.S.winner === 'home', `${r2.S.pts.home}–${r2.S.pts.away}`);
}
{
  const a = play({ to:15 }, 'h'.repeat(14)), b = play({ to:15 }, 'h'.repeat(15)), c = play({ to:21 }, 'h'.repeat(21));
  check('games to 15 and 21', !a.S.over && b.S.over && c.S.over && c.S.pts.home === 21, `${a.S.pts.home} not over, ${b.S.pts.home} over, ${c.S.pts.home} over`);
}
{
  const r = play({}, 'h'.repeat(10));
  const r2 = play({}, 'h'.repeat(10) + 'a');
  check('game point only for the side that can score', r.gp === 'home' && r2.gp === null, `serving at 10–0: ${r.gp}; after the side out: ${r2.gp}`);
}
// ---------- serving position (4.B)
{
  const r0 = play({}, ''), r1 = play({}, 'h'), r2 = play({}, 'hh'), r3 = play({}, 'hha');
  check('server serves from the right on an even score, the left on odd', r0.court === 'right' && r1.court === 'left' && r2.court === 'right' && r3.court === 'right',
    `0:${r0.court} 1:${r1.court} 2:${r2.court} (away serving at 0) ${r3.court}`);
}
{
  const p = run(`[servePositions(true, 'right'), servePositions(true, 'left'), servePositions(false, 'right')]`);
  const diag = p.every(q => Math.sign(q.server.x - 10) === -Math.sign(q.receiver.x - 10) && Math.sign(q.server.y - 22) === -Math.sign(q.receiver.y - 22));
  check('server behind the baseline, receiver diagonally across', diag && p[0].server.x > 10 && p[1].server.x < 10 && p[2].server.x < 10 && p[0].server.y > 44 && p[2].server.y < 0,
    p.map(q => `S(${q.server.x},${q.server.y}) R(${q.receiver.x},${q.receiver.y})`).join(' · '));
}
// ---------- serve landing (7.A–7.E; lines are in except the kitchen line)
{
  // near server, right court -> far receiver's right court = x 0..10, y 0..15
  const cases = [[5, 8, 'in'], [5, 15.1, 'short'], [5, 14.99, 'short'], [5, 14.9, 'in'], [5, 18, 'short'], [10, 8, 'in'], [0, 0, 'in'], [-0.1, 8, 'out'], [12, 8, 'out'], [5, -0.3, 'out'], [15, 18, 'out']];
  const got = cases.map(([x, y]) => run(`serveResult(${x}, ${y}, false, 'right')`));
  const ok = got.every((g, i) => g === cases[i][2]);
  check('serve: diagonal court, kitchen line is short, other lines in', ok, cases.map((c, i) => `(${c[0]},${c[1]})=${got[i]}`).join(' '));
  const near = run(`[serveResult(15, 36, true, 'right'), serveResult(5, 36, true, 'right'), serveResult(15, 28.9, true, 'right'), serveResult(15, 29.1, true, 'right')]`);
  check('serve to the near side: same rules mirrored', near.join() === 'in,out,short,in', near.join());
}
// ---------- the two-bounce rule (10.A)
{
  const r = run(`[twoBounceFault(1, true), twoBounceFault(2, true), twoBounceFault(3, true), twoBounceFault(1, false), twoBounceFault(2, false)]`);
  check('two-bounce: volleying the return or the third shot is a fault, later volleys are fine', r.join() === 'true,true,false,false,false', r.join());
}
// ---------- the kitchen (11.A)
{
  const r = run(`[inKitchenZone(10, 22 + 6.9), inKitchenZone(10, 22 + 7.2), inKitchenZone(10, 22 + 7.5), inKitchenZone(10, 22 - 3), inKitchenZone(-1, 25), kitchenFault(true, true), kitchenFault(false, true), kitchenFault(true, false)]`);
  check('kitchen: on the line counts, outside the sidelines does not; only volleys fault', r.join() === 'true,true,false,true,false,true,false,false', r.join());
}
// ---------- ends (21.B)
{
  const r = run(`(() => { const out = {}; for (const to of [11, 15, 21]) { const S = newScore({ to }); let at = null, n = 0;
    for (let i = 0; i < 40 && !S.over; i++) { const w = i % 3 === 2 ? 'away' : 'home'; const res = awardRally(S, w); if (res.switchEnds) { n++; if (at === null) at = Math.max(S.pts.home, S.pts.away); } }
    out[to] = { at, n }; } return out; })()`);
  check('ends switch once, at 6 / 8 / 11', r[11].at === 6 && r[15].at === 8 && r[21].at === 11 && r[11].n === 1 && r[15].n === 1 && r[21].n === 1, JSON.stringify(r));
}
console.log(failed ? `${failed} rules check(s) failed` : 'all rules checks passed');
process.exit(failed ? 1 : 0);
