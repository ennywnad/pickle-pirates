// Smoke test: loads the game, plays a few seconds of practice in both views, hits the ball,
// round-trips a save code, and fails on any page error. Usage: node tests/smoke.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8123/';
const shots = process.env.SHOTS || '';   // folder for screenshots, if set
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = false;
const fail = msg => { failed = true; console.error('FAIL', msg); };
// DOM clicks: the software-rendered 3D view is too slow for Playwright's "stable element" checks
const tapper = page => sel => page.$eval(sel, el => el.click());

for (const gfx of ['classic', 'med']) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  const tap = tapper(page);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/WebGPU|favicon|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(g => { localStorage.setItem('pickle-gfx', g); localStorage.setItem('pickle-gfx-engine', 'webgl'); }, gfx);
  await page.goto(base + '?debug');
  await page.waitForSelector('#hub:not([hidden]) #btnPractice', { timeout: 20000 });

  // attract mode: the CPU crews rally behind the menu
  const att = await page.evaluate(() => { const S = window.__sim; S.step(600); return { attract: S.G.attract, score: S.G.score.home + S.G.score.away, hits: S.G.best }; });
  if (!att.attract || att.score + att.hits === 0) fail(`${gfx}: attract rally did not run (${JSON.stringify(att)})`);

  // practice settings: dinks only, cannon only, then start
  await tap('#btnPractice');
  await page.waitForSelector('#prac:not([hidden])', { timeout: 5000 });
  await tap('#p_feed button[data-v="dink"]');
  await tap('#p_opp button[data-v="none"]');
  await tap('#pracGo');
  await page.waitForTimeout(1500);
  const dk = await page.evaluate(() => { const S = window.__sim, G = S.G; for (let i = 0; i < 240 && !G.ball.live; i++) S.step(1); const kind = G.ball.lastKind, pr = S.predict(G.ball, 3, 1/120, 1000); return { kind, land: pr.first && pr.first.y, opp: G.cfg.opp }; });
  if (dk.kind !== 'feed:dink' || !(dk.land > 22 && dk.land < 29.5) || dk.opp !== 'none') fail(`${gfx}: dink feed did not land in the near kitchen (${JSON.stringify(dk)})`);
  // back to the mix with the stand-in crew, from the pause menu
  await page.keyboard.press('KeyP');
  await tap('#btnPracSet');
  await tap('#p_feed button[data-v="mix"]');
  await tap('#p_opp button[data-v="cpu"]');
  await tap('#pracGo');
  await page.waitForTimeout(gfx === 'classic' ? 2500 : 5000);
  const st = await page.evaluate(() => { const G = window.__sim.G; return { attract: G.attract, mode: G.mode, state: G.state, live: G.ball.live, z: G.ball.z }; });
  if (st.attract || st.mode !== 'practice') fail(`${gfx}: practice not running (${JSON.stringify(st)})`);
  if (shots) await page.screenshot({ path: `${shots}/practice-${gfx}.png` });

  // hit: stand the player where the fed ball lands and drive it back over the net
  const hit = await page.evaluate(() => {
    const S = window.__sim, G = S.G, pl = G.players[0];
    S.feedBall('home'); G.state = 'play';
    const pr = S.predict(G.ball, 3);
    const p = pr.pts.find(q => q.bounced && q.y > 22 && q.vz < 0) || pr.pts[pr.pts.length - 1];
    let hitIt = false;
    for (let i = 0; i < 400 && !hitIt; i++) {
      pl.x = G.ball.x; pl.y = Math.max(22.6, G.ball.y + 0.5);
      if (G.ball.bounces >= 1 && G.ball.z < 4) hitIt = hitBall(pl, 'drive', null);
      S.step(1);
    }
    let crossed = false;
    for (let i = 0; i < 180; i++) { S.step(1); if (G.ball.y < 22) crossed = true; }
    return { hitIt, crossed, rally: G.best, target: !!p };
  });
  if (!hit.hitIt || !hit.crossed) fail(`${gfx}: could not hit the ball over the net (${JSON.stringify(hit)})`);

  // the shot button: press Drive just before the ball arrives and the game times the swing
  await page.evaluate(() => { const S = window.__sim, G = S.G, pl = G.players[0]; G.cfg.opp = 'cpu'; pl.x = 10; pl.y = 42; S.feedBall('home'); G.state = 'play';
    for (let i = 0; i < 240; i++) { const sp = contactSpot(pl, G.ball); if (sp && sp.t < 0.35) break; S.step(1); } window.__r0 = G.shotN; });
  await page.keyboard.down('Space');
  const queued = await page.evaluate(() => !!window.__sim.G.players[0].queue);
  const struck = await page.evaluate(() => { const S = window.__sim, G = S.G; for (let i = 0; i < 90 && G.shotN === window.__r0; i++) S.step(1); return G.lastShot && G.lastShot.team === 'home' && G.shotN > window.__r0 ? G.lastShot : null; });
  await page.keyboard.up('Space');
  if (!queued || !struck) fail(`${gfx}: the Drive key did not queue and strike a shot (${JSON.stringify({ queued, struck })})`);

  // keyboard moves the player
  // (stepped by hand: the software-rendered 3D view runs too few frames to measure in real time)
  const [x0, x1] = await page.evaluate(() => { const S = window.__sim, pl = S.G.players[0]; pl.x = 10; const a = pl.x; S.keys.add('KeyA'); S.step(30); S.keys.delete('KeyA'); return [a, pl.x]; });
  if (!(x1 < x0 - 0.5)) fail(`${gfx}: keyboard did not move the player (${x0} -> ${x1})`);

  // a singles game: serve setup, the score call on the scoreboard, then fast-forward a few points CPU vs CPU
  await page.keyboard.press('KeyP');
  await tap('#btnQuit');
  await tap('#btnGame');
  await page.waitForSelector('#gameset:not([hidden])', { timeout: 5000 });
  await tap('#g_tier button[data-v="captain"]');
  await tap('#gameGo');
  await page.waitForTimeout(1500);
  const gm = await page.evaluate(() => { const S = window.__sim, G = S.G; const start = { mode: G.mode, state: G.state, call: document.getElementById('clk').textContent, tier: G.players[1].tier, board: document.getElementById('arenaShort').textContent };
    G.players[0].human = false; for (let i = 0; i < 60*90 && G.match.rallies < 4; i++) S.step(1); G.players[0].human = true;
    return { ...start, rallies: G.match.rallies, pts: G.match.pts }; });
  if (gm.mode !== 'game' || !['set', 'serve', 'play'].includes(gm.state) || !/^\d+–\d+$/.test(gm.call) || gm.rallies < 4) fail(`${gfx}: singles game did not run (${JSON.stringify(gm)})`);
  if (gm.tier !== 'captain' || !/CAPTAIN/.test(gm.board)) fail(`${gfx}: the opponent level did not carry into the game (${gm.tier}, "${gm.board}")`);
  await page.waitForTimeout(300);

  // pause, back to the dock, save code round trip
  await page.keyboard.press('KeyP');
  if (await page.isHidden('#pause')) fail(`${gfx}: pause menu did not open`);
  await tap('#btnQuit');
  await tap('#saveCopy');
  await page.waitForFunction(() => document.getElementById('saveMsg').textContent.length > 0, null, { timeout: 5000 }).catch(() => {});
  const code = await page.inputValue('#saveCode');
  if (!code.startsWith('PKP1.')) fail(`${gfx}: save code missing`);
  await tap('#saveLoad');
  const msg = await page.textContent('#saveMsg');
  if (!/Loaded/.test(msg)) fail(`${gfx}: save code did not load (${msg})`);

  if (gfx !== 'classic') {
    const r3 = await page.evaluate(() => ({ status: window.__r3d.status, active: window.__r3d.active, check: window.__r3d.lastCheck }));
    if (!r3.active) fail(`3D view not active (${JSON.stringify(r3)})`);
    console.log('3D status', JSON.stringify(r3));
  }
  if (errors.length) fail(`${gfx}: page errors\n  ` + errors.join('\n  '));
  else console.log(`ok: ${gfx}`);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
