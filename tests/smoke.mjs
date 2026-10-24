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

  // every sound and music file the audio engine asks for is there
  if (gfx === 'classic') {
    const missing = await page.evaluate(async () => {
      const files = [];
      for (const [n, k] of Object.entries(SFX_SET)) for (let i = 0; i < k; i++) files.push(`${n}_${i}`);
      for (const [n, k] of Object.entries(MUSIC_SET)) for (let i = 0; i < k; i++) files.push(k > 1 ? `${MUSIC_FILE[n]}_${i}` : MUSIC_FILE[n]);
      const r = await Promise.all(files.map(f => fetch(`assets/sfx/${f}.mp3`, { method:'HEAD' }).then(x => x.ok ? null : f).catch(() => f)));
      return r.filter(Boolean);
    });
    if (missing.length) fail(`missing sound files: ${missing.join(', ')}`);
  }

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
  const dk = await page.evaluate(() => { const S = window.__sim, G = S.G; for (let i = 0; i < 240 && !G.ball.live; i++) S.step(1); const kind = G.ball.lastKind, pr = S.predict(G.ball, 3, 1/240, 1e4); return { kind, land: pr.first && pr.first.y, opp: G.cfg.opp }; });
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
  // Accessibility: game speed 70% scales every sim step to 70% of the frame time (frames are capped at 50 ms)
  const sp = await page.evaluate(async () => { A11Y.speed = 0.7; const orig = window.update, dts = []; let last = performance.now(), ok = true;
    window.update = dt => { const now = performance.now(), fdt = Math.min(0.05, (now - last)/1000); last = now; dts.push(dt); return orig(dt); };
    await new Promise(r => setTimeout(r, 1500)); window.update = orig; A11Y.speed = 1;
    return { n: dts.length, max: Math.max(...dts) }; });
  if (sp.n && sp.max > 0.0351) fail(`${gfx}: game speed 70% did not slow the game (${JSON.stringify(sp)})`);

  // hit: stand the player where the fed ball lands and drive it back over the net
  const hit = await page.evaluate(() => {
    // a random feed now and then leaves a drive in the net: three tries
    const S = window.__sim, G = S.G, pl = G.players[0]; let hitIt = false, crossed = false, p = null, tries = 0;
    for (; tries < 3 && !crossed; tries++) {
      S.feedBall('home'); G.state = 'play';
      const pr = S.predict(G.ball, 3);
      p = pr.pts.find(q => q.bounced && q.y > 22 && q.vz < 0) || pr.pts[pr.pts.length - 1];
      hitIt = false;
      for (let i = 0; i < 400 && !hitIt; i++) {
        pl.x = G.ball.x; pl.y = Math.max(22.6, G.ball.y + 0.5);
        if (G.ball.bounces >= 1 && G.ball.z < 4) hitIt = hitBall(pl, 'drive', null);
        S.step(1);
      }
      for (let i = 0; i < 180; i++) { S.step(1); if (G.ball.y < 22) crossed = true; }
    }
    return { hitIt, crossed, rally: G.best, target: !!p, tries };
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
  // the island card comes first and holds the game until you set sail (Enter)
  await page.waitForSelector('#isle:not([hidden])', { timeout: 5000 }).catch(() => {});
  const card = await page.evaluate(() => ({ shown: !document.getElementById('isle').hidden, text: document.getElementById('isleCard').textContent, paused, t: window.__sim.G.time }));
  if (!card.shown || !card.paused || !/hazard/i.test(card.text) || !/Set sail/.test(card.text)) fail(`${gfx}: the island card did not show before the game (${JSON.stringify(card).slice(0, 300)})`);
  if (shots) await page.screenshot({ path: `${shots}/isle-${gfx}.png` });
  await page.keyboard.press('Enter');
  const sailed = await page.evaluate(() => ({ hidden: document.getElementById('isle').hidden, paused }));
  if (!sailed.hidden || sailed.paused) fail(`${gfx}: Enter did not set sail from the island card (${JSON.stringify(sailed)})`);
  await page.waitForFunction(() => /CAPTAIN/.test(document.getElementById('arenaShort').textContent), null, { timeout: 8000 }).catch(() => {});
  const gm = await page.evaluate(() => { const S = window.__sim, G = S.G; const start = { mode: G.mode, state: G.state, call: document.getElementById('clk').textContent, tier: G.players[1].tier, board: document.getElementById('arenaShort').textContent };
    G.players[0].human = false; for (let i = 0; i < 60*240 && G.match.rallies < 4; i++) S.step(1); G.players[0].human = true;
    return { ...start, rallies: G.match.rallies, pts: G.match.pts }; });
  if (gm.mode !== 'game' || !['set', 'serve', 'play'].includes(gm.state) || !/^\d+–\d+$/.test(gm.call) || gm.rallies < 4) fail(`${gfx}: singles game did not run (${JSON.stringify(gm)})`);
  if (gm.tier !== 'captain' || !/CAPTAIN/.test(gm.board)) fail(`${gfx}: the opponent level did not carry into the game (${gm.tier}, "${gm.board}")`);
  await page.waitForTimeout(300);

  // Feel tuning from the pause menu holds a singles game, and closing it goes back to the pause menu
  await page.keyboard.press('KeyP');
  await tap('#btnTune');
  const t0 = await page.evaluate(() => window.__sim.G.time); await page.waitForTimeout(400);
  const tn = await page.evaluate(() => ({ t: window.__sim.G.time, tune: !document.getElementById('tune').hidden }));
  await tap('#tuneClose');
  const backToPause = await page.isVisible('#pause');
  if (!tn.tune || tn.t !== t0 || !backToPause) fail(`${gfx}: Feel tuning did not hold the game (${JSON.stringify({ t0, ...tn, backToPause })})`);
  // a controller can move through the pause menu and pick a button (d-pad down, A)
  const nav = await page.evaluate(() => { setPaused(true); padMove(0, 1); const a = padFocus && padFocus.id; padMove(0, 1); const b = padFocus && padFocus.id;
    const ring = padFocus && padFocus.classList.contains('padfocus'); padMove(0, -1); const c = padFocus && padFocus.id; padConfirm(); return { a, b, c, ring, paused }; });
  if (nav.a !== 'btnResume' || !nav.b || nav.b === nav.a || !nav.ring || nav.c !== 'btnResume' || nav.paused) fail(`${gfx}: controller navigation in the pause menu did not work (${JSON.stringify(nav)})`);
  // the logbook from the pause menu, and back
  await page.keyboard.press('KeyP'); await tap('#btnPauseLog');
  const lg = await page.evaluate(() => ({ shown: !document.getElementById('logbook').hidden, rows: document.querySelectorAll('#logWrap .hzrow').length, text: document.getElementById('logWrap').textContent }));
  if (!lg.shown || lg.rows < 6 + 6 + 7 || !/Fish schools/.test(lg.text) || !/Treasure Map/.test(lg.text)) fail(`${gfx}: the logbook is missing islands or booty (${JSON.stringify({ ...lg, text: undefined })})`);
  await tap('#logGo');
  if (await page.isHidden('#pause')) fail(`${gfx}: the logbook did not go back to the pause menu`);
  await tap('#btnResume');
  // new matches don't pile up figure geometry on the GPU (3D only)
  if (gfx !== 'classic') {
    const mem = await page.evaluate(async () => { const R3 = window.__r3d, S = window.__sim, wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!R3.mem || !R3.mem()) return null; const by = { singles:[], doubles:[] };   // attract games are singles or doubles: compare like with like
      for (let i = 0; i < 10; i++) { startAttract(); await wait(); by[S.G.format].push(R3.mem().geometries); }
      startGame(lastOver, lastOpts, true); await wait(); return by; });
    const grow = mem ? Math.max(...Object.values(mem).filter(v => v.length).map(v => Math.max(...v) - v[0])) : 0;
    if (mem && grow > 4) fail(`${gfx}: figure geometry leaks across matches (${JSON.stringify(mem)})`);
    console.log(`${gfx}: geometries across 10 new matches`, mem ? JSON.stringify(mem) : 'n/a');
  }
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

  // pickle vs pickle: the same crew on both sides, the far side in Dill Rogers' colors, names on the scoreboard
  const pvp = await page.evaluate(() => { gameCfg.crewHome = 'pickle'; gameCfg.crewAway = 'pickle'; startGame(null, { crews:pickedCrews() }); setSail();
    const G = window.__sim.G, out = { species: G.players.map(p => p.species).join(','), away: G.crew.away.id, pal: !!G.players[1].pal, h: $('hAbbr').textContent, a: $('aAbbr').textContent, name: teamName('away') };
    gameCfg.crewAway = 'island'; return out; });
  if (pvp.species !== 'pickle,pickle' || pvp.away !== 'dill' || !pvp.pal || pvp.h !== 'PKL' || pvp.a !== 'DIL') fail(`${gfx}: pickle vs pickle did not set up right (${JSON.stringify(pvp)})`);
  await page.evaluate(() => { renderHub(); show('hub'); });
  // v0.2: Versus. P1 + P2 against the crew in doubles (P2 on the arrow keys), then P1 vs P2 from the side
  await page.evaluate(() => { renderHub(); show('hub'); });
  await tap('#btnVersus');
  await tap('#v_format button[data-v="doubles"]');
  await tap('#v_who button[data-v="coop"]');
  await tap('#vsGo');
  await tap('#isleGo');
  await page.waitForTimeout(400);
  const co = await page.evaluate(() => { const S = window.__sim, G = S.G; return { n: G.players.length, humans: G.players.filter(p => p.human).map(p => p.team + p.slot + 'p' + p.pad).join(','), doubles: G.match.doubles, call: scoreCall(G.match), bar: document.getElementById('ctrlBar').textContent }; });
  if (co.n !== 4 || co.humans !== 'home0p0,home1p1' || !co.doubles || !/–[12]$/.test(co.call)) fail(`${gfx}: co-op doubles did not start right (${JSON.stringify(co)})`);
  if (!/P2/.test(co.bar)) fail(`${gfx}: the controls bar does not show P2 (${co.bar})`);
  // P2 on the arrow keys: hold left and P2 moves left (toward −x from behind the near baseline); P1 doesn't
  const p2x = await page.evaluate(() => { const S = window.__sim, G = S.G; G.state = 'play'; G.ball.live = false; const p2 = humanFor(1), p1 = humanFor(0); p2.x = 10; p2.y = 38; p1.x = 14; p1.y = 38; return [p2.x, p1.x]; });
  await page.keyboard.down('ArrowLeft');
  const after = await page.evaluate(() => { const S = window.__sim; S.step(30); return [humanFor(1).x, humanFor(0).x]; });
  await page.keyboard.up('ArrowLeft');
  if (!(after[0] < p2x[0] - 1) || Math.abs(after[1] - p2x[1]) > 1.5) fail(`${gfx}: P2's arrow keys did not move P2 alone (${JSON.stringify({ before: p2x, after })})`);
  // fast-forward some doubles points with everyone on the CPU
  const dbl = await page.evaluate(() => { startGame(lastOver, lastOpts, true); const S = window.__sim, G = S.G; G.players.forEach(p => p.human = false);
    for (let i = 0; i < 60*240 && G.match.rallies < 4; i++) S.step(1); return { rallies: G.match.rallies, call: scoreCall(G.match) }; });
  if (dbl.rallies < 4) fail(`${gfx}: doubles points did not play out (${JSON.stringify(dbl)})`);
  await page.evaluate(() => { renderHub(); show('hub'); });
  await tap('#btnVersus');
  await tap('#v_format button[data-v="singles"]');
  await tap('#v_who button[data-v="vs"]');
  await tap('#vsGo');
  await tap('#isleGo');
  await page.waitForTimeout(400);
  const vs = await page.evaluate(() => { const G = window.__sim.G; return { n: G.players.length, view: G.view, p2team: humanFor(1) && humanFor(1).team }; });
  if (vs.n !== 2 || vs.view !== 'side' || vs.p2team !== 'away') fail(`${gfx}: P1 vs P2 singles did not start with the side view (${JSON.stringify(vs)})`);

  // v0.1: Play from the dock. First time shows How to play, then Brine Bay vs the chosen crew level under the standard
  // rules; finishing the game records the result and offers the next level after a win
  await page.evaluate(() => { renderHub(); show('hub'); });
  await tap('#h_tier button[data-v="deckhand"]');
  await tap('#btnPlay');
  const howShown = await page.isVisible('#howto');
  if (gfx === 'classic' && !howShown) fail(`${gfx}: How to play did not show on the first Play`);
  if (howShown) await tap('#howGo');
  await tap('#isleGo');
  await page.waitForTimeout(500);
  const pg = await page.evaluate(() => { const S = window.__sim, G = S.G;
    const out = { island: G.island.id, tier: G.players[1].tier, to: G.match.to, scoring: G.match.scoring, kitchen: G.cfg.kitchen, seen: save.seenHow, before: save.record.deckhand.w };
    G.players[0].human = false; G.players[0].tier = 'captain'; G.match.pts.home = 10; G.match.pts.away = 0; G.match.server = 'home'; startPoint();
    for (let i = 0; i < 60*900 && G.state !== 'end'; i++) S.step(1);
    return { ...out, state: G.state, winner: G.match.winner, after: save.record.deckhand.w + save.record.deckhand.l - out.before - (save.record.deckhand.l ? 0 : 0) }; });
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => ({ shown: !document.getElementById('results').hidden, text: document.getElementById('resCard').textContent, next: !!document.getElementById('resNext') }));
  if (pg.island !== 'brine' || pg.tier !== 'deckhand' || pg.to !== 11 || pg.scoring !== 'sideout' || !pg.kitchen || !pg.seen) fail(`${gfx}: Play did not start Brine Bay vs the Deckhand under the standard rules (${JSON.stringify(pg)})`);
  if (pg.state !== 'end' || !res.shown || !/record vs the Deckhand/.test(res.text)) fail(`${gfx}: the game did not finish into a results card with the record (${JSON.stringify({ pg, res })})`);
  if (pg.winner === 'home' && !res.next) fail(`${gfx}: no "try the next level" after a win`);
  if (!/Rallies won/.test(res.text) || !/Winners/.test(res.text)) fail(`${gfx}: the results card has no crew stats table`);
  await tap('#resHub');
  // the lifetime log in the Logbook picked the game up
  await tap('#btnLog');
  const life = await page.evaluate(() => ({ text: document.getElementById('logWrap').textContent, games: save.life.games }));
  if (!(life.games >= 1) || !/Your log/.test(life.text)) fail(`${gfx}: the Logbook has no lifetime log after a game (${JSON.stringify({ games: life.games })})`);
  await tap('#logGo');
  const hubRec = await page.textContent('#hubRec');
  if (!/Deckhand \d+–\d+/.test(hubRec) || /Deckhand 0–0/.test(hubRec)) fail(`${gfx}: the dock does not show the record (${hubRec})`);

  // v0.8: an instant replay plays over a held game, shows its tag, and Space skips it
  await page.evaluate(() => { A11Y.replay = false; startGame(STANDARD, {}, true); const S = window.__sim, G = S.G; G.players[0].human = false;
    for (let i = 0; i < 60*60 && !(G.match.rallies >= 2 && G.state === 'dead'); i++) S.step(1);   // just after a point
    window.__r0 = G.match.rallies; G.replayWant = { title:'Test', sub:'smoke', at:G.time }; A11Y.replay = true; });
  await page.waitForFunction(() => window.__sim.G.replay && !document.getElementById('rtag').hidden, null, { timeout: 4000 }).catch(() => {});
  const rp = await page.evaluate(() => { const G = window.__sim.G; return { state: G.state, on: !!G.replay, tag: !document.getElementById('rtag').hidden, held: G.match.rallies === window.__r0, frames: G.replay ? G.replay.frames.length : 0 }; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('rtag').hidden, null, { timeout: 3000 }).catch(() => {});
  const rp2 = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(f); else r({ off: !window.__sim.G.replay, tagOff: document.getElementById('rtag').hidden, fps: n*2 }); }; requestAnimationFrame(f); }));
  if (!rp.on || !rp.tag || !rp.held || !rp2.off || !rp2.tagOff) fail(`${gfx}: the instant replay did not play and skip (${JSON.stringify({ ...rp, ...rp2 })})`);
  await page.evaluate(() => { G.players[0].human = true; renderHub(); show('hub'); });

  // v0.7: the Voyage. The dock card opens the map, the first island sails with its objective on the island card, and
  // a won match records its stars and offers the next island
  await tap('#btnVoyage');
  await page.waitForSelector('#voyage:not([hidden])', { timeout: 5000 }).catch(() => {});
  const vm1 = await page.evaluate(() => ({ shown: !document.getElementById('voyage').hidden, legs: document.querySelectorAll('#voyWrap .card.leg').length, go: !!document.getElementById('voyGo') }));
  if (!vm1.shown || vm1.legs !== 7 || !vm1.go) fail(`${gfx}: the Voyage map did not open with seven islands (${JSON.stringify(vm1)})`);
  await page.evaluate(() => { save.stars = {}; persist(); openVoyage(); });
  await tap('#voyGo');
  const vc = await page.evaluate(() => ({ isle: !document.getElementById('isle').hidden, text: document.getElementById('isleCard').textContent, leg: G.voyage && G.voyage.leg, tier: G.players[1].tier }));
  if (!vc.isle || vc.leg !== 0 || !/Hit 3 winners/.test(vc.text) || vc.tier !== 'deckhand') fail(`${gfx}: the first Voyage island did not start with its objective (${JSON.stringify({ ...vc, text: vc.text.slice(0, 120) })})`);
  await tap('#isleGo');
  const vr = await page.evaluate(() => { const S = window.__sim, G = S.G; G.players[0].human = false; G.players[0].tier = 'captain'; G.match.pts.home = 10; G.match.pts.away = 0; G.match.server = 'home'; startPoint();
    for (let i = 0; i < 60*900 && G.state !== 'end'; i++) S.step(1); return { winner: G.match.winner, stars: voyStars('brine') }; });
  await page.waitForTimeout(400);
  const vres = await page.evaluate(() => ({ shown: !document.getElementById('results').hidden, next: document.getElementById('resNext') && document.getElementById('resNext').textContent, map: !!document.getElementById('resMap'), text: document.getElementById('resCard').textContent }));
  if (vr.winner === 'home' && (!vr.stars[0] || !vres.shown || !/Shipwreck Shoals/.test(vres.next || '') || !vres.map || !/Voyage: ★/.test(vres.text))) fail(`${gfx}: a won Voyage match did not record its star and offer the next island (${JSON.stringify({ vr, ...vres, text: undefined })})`);
  await tap('#resHub');
  // the last leg: winning the Davy's Locker Cup gets its own title and confetti
  await page.evaluate(() => { save.stars = Object.fromEntries(VOYAGE.slice(0, 6).map(L => [L.island, [true, false, false]])); persist(); startVoyage(6); setSail();
    const S = window.__sim, G = S.G; G.players[0].human = false; G.players[0].tier = 'captain'; G.match.pts.home = 14; G.match.pts.away = 0; G.match.server = 'home'; startPoint();
    for (let i = 0; i < 60*900 && G.state !== 'end'; i++) S.step(1); });
  await page.waitForTimeout(400);
  const cup = await page.evaluate(() => ({ won: window.__sim.G.match.winner, title: document.querySelector('#resCard h2').textContent, confetti: document.querySelectorAll('.confetti i').length, star: voyCupWon() }));
  if (cup.won === 'home' && (!/Cup is yours/.test(cup.title) || !cup.star || (!cup.confetti && !(await page.evaluate(() => A11Y.rm))))) fail(`${gfx}: winning the Cup did not celebrate (${JSON.stringify(cup)})`);
  await tap('#resHub');

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
