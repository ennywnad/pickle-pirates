// Pickle Pirates · Menus: the dock (hub), pause, tuning panel, toasts and sound buttons
'use strict';
let paused = false;
let practiceIsland = 'brine';
try { const s = localStorage.getItem('pickle-practice-island'); if (ISLANDS.some(i => i.id === s)) practiceIsland = s; } catch(e) {}
function segHtml(id, opts, cur){ return `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`; }
function renderHub(){
  $('hubWrap').innerHTML = `
    <div class="logo"><p class="eyebrow">Arcade pickleball · pirate crews · real rules</p><h1>Pickle <em>Pirates</em></h1><div class="tape"></div>
      <p class="lede">Sail the Pickle Pirates to seven island courts and the Davy's Locker Cup. Early build: play singles against a CPU crew at three levels on a placeholder court while the real game gets built.</p></div>
    <button class="chal prac" type="button" id="btnPractice">
      <span class="num">P</span>
      <span class="cinfo"><span class="arena">PRACTICE · BALL CANNON</span><span class="ct">Practice</span><span class="co">The cannon feeds serves, drives, drops, dinks and lobs. Hit them back over the net and keep the rally going.</span></span>
      <span class="lock" style="color:var(--hazard)">Set up</span></button>
    <button class="chal prac" type="button" id="btnGame">
      <span class="num">1v1</span>
      <span class="cinfo"><span class="arena">SINGLES · FULL RULES</span><span class="ct">Singles game</span><span class="co">You against a CPU crew at three levels, under the full rules: serves, the kitchen, the two-bounce rule, side-out scoring, switching ends.</span></span>
      <span class="lock" style="color:var(--hazard)">Set up</span></button>
    <button class="chal" type="button" disabled><span class="num">${svg('lock')}</span><span class="cinfo"><span class="arena">THE CAREER · v1.0</span><span class="ct">Voyage</span><span class="co">One match per island, objectives, stars and booty unlocks.</span></span><span class="lock">Coming later</span></button>
    <button class="chal" type="button" disabled><span class="num">${svg('lock')}</span><span class="cinfo"><span class="arena">SINGLES OR DOUBLES</span><span class="ct">Versus</span><span class="co">P1 vs P2, two players vs the CPU, or solo; games to 11, 15 or 21.</span></span><span class="lock">Coming later</span></button>
    <div class="card gfx"><h3 class="h">Sound</h3>
      <label class="tog"><input type="checkbox" id="sndOn" ${muted ? '' : 'checked'}><span class="sw" aria-hidden="true"></span><span class="tl"><b>Sound</b><small>Also the speaker button in the scoreboard, or press M</small></span></label>
      <label class="sl home snd"><span>Volume</span><input type="range" id="sndVol" min="0" max="100" step="5" value="${Math.round(volume*100)}"><b id="sndVolV">${Math.round(volume*100)}%</b></label>
      <label class="sl home snd"><span>Crowd</span><input type="range" id="sndCrowd" min="0" max="100" step="5" value="${Math.round(crowdVol*100)}"><b id="sndCrowdV">${Math.round(crowdVol*100)}%</b></label>
      <label class="sl home snd"><span>Music</span><input type="range" id="sndMusic" min="0" max="100" step="5" value="${Math.round(musicVol*100)}"><b id="sndMusicV">${Math.round(musicVol*100)}%</b></label></div>
    <div class="card gfx"><div class="kitrow"><div style="display:flex;flex-direction:column;gap:4px;min-width:0"><h3 class="h">Controls</h3><span class="xptext">Remap keys and controller buttons.</span></div><button class="btn ghost small" id="btnControls" type="button">Change</button></div></div>
    <div class="card gfx"><h3 class="h">Accessibility</h3>
      <label class="tog"><input type="checkbox" id="a_rm" ${A11Y.rm ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl"><b>Reduce motion</b><small>No screen shake or pulsing buttons</small></span></label>
      <div class="prow"><span class="xptext">On-screen buttons</span>${segHtml('a_btn', [['normal','Normal'],['large','Large'],['xl','Extra large']], A11Y.btn)}</div></div>
    <div class="card gfx"><h3 class="h">Graphics</h3><div class="seg" id="gfxSeg">${GFX_OPTS.map(([k,l]) => `<button type="button" data-g="${k}" aria-pressed="${k===gfxPref}">${l}</button>`).join('')}</div><h3 class="h" style="margin-top:6px">3D engine</h3><div class="seg" id="engSeg">${[['webgpu','WebGPU'],['webgl','WebGL2 (compatibility)']].map(([k,l]) => `<button type="button" data-e="${k}" aria-pressed="${k===gfxEngine()}">${l}</button>`).join('')}</div><p class="gfxnote" id="gfxNote">${gfxStatusText()}</p></div>
    <div class="card gfx"><h3 class="h">Save data</h3>
      <p class="gfxnote">Progress lives in this browser. Copy your save code to move it to another browser or device, then paste it there and load it.</p>
      <textarea id="saveCode" class="savecode" rows="2" spellcheck="false" autocomplete="off" aria-label="Save code" placeholder="Paste a save code here"></textarea>
      <div class="savebtns"><button class="btn ghost small" id="saveCopy" type="button">Copy my save code</button><button class="btn ghost small" id="saveLoad" type="button">Load code</button></div>
      <p class="gfxnote" id="saveMsg" aria-live="polite"></p></div>
    <p class="foot" id="padNote">${padNoteText()}</p>
    <p class="foot ver">Pickle Pirates ${GAME_VERSION} · <a href="https://github.com/ennywnad/pickle-pirates/blob/main/CHANGELOG.md" target="_blank" rel="noopener">what's new</a> · <a href="https://github.com/ennywnad/pickle-pirates" target="_blank" rel="noopener">source</a></p>`;
  document.querySelectorAll('#gfxSeg button').forEach(b => b.onclick = () => setGfx(b.dataset.g));
  document.querySelectorAll('#engSeg button').forEach(b => b.onclick = () => setEngine(b.dataset.e));
  $('sndOn').onchange = e => setMuted(!e.target.checked);
  $('btnControls').onclick = () => openControls('hub');
  $('a_rm').onchange = e => { A11Y.rm = e.target.checked; saveA11y(); applyA11y(); };
  $('a_btn').querySelectorAll('button').forEach(b => b.onclick = () => { A11Y.btn = b.dataset.v; saveA11y(); applyA11y(); $('a_btn').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  $('sndVol').oninput = e => { volume = Number(e.target.value)/100; $('sndVolV').textContent = e.target.value + '%'; try { localStorage.setItem('pickle-vol', String(volume)); } catch(err) {} ensureAudio(); applyVolume(); };
  $('sndCrowd').oninput = e => { crowdVol = Number(e.target.value)/100; $('sndCrowdV').textContent = e.target.value + '%'; try { localStorage.setItem('pickle-crowdvol', String(crowdVol)); } catch(err) {} ensureAudio(); applyVolume(); };
  $('sndMusic').oninput = e => { musicVol = Number(e.target.value)/100; $('sndMusicV').textContent = e.target.value + '%'; try { localStorage.setItem('pickle-musicvol', String(musicVol)); } catch(err) {} ensureAudio(); applyVolume(); };
  $('sndVol').onchange = () => { sfx('paddle', 1); };
  $('saveCopy').onclick = async () => {
    const code = exportSave(); $('saveCode').value = code;
    let ok = false; try { await navigator.clipboard.writeText(code); ok = true; } catch(e) {}
    $('saveMsg').textContent = ok ? 'Save code copied to the clipboard.' : 'Select the code above and copy it.';
    if (!ok) $('saveCode').select();
  };
  $('saveLoad').onclick = () => {
    const r = importSave($('saveCode').value);
    if (!r.ok) { $('saveMsg').textContent = r.msg; return; }
    $('saveMsg').textContent = `Loaded: ${save.plays} practice session${save.plays === 1 ? '' : 's'}.`;
  };
  $('btnPractice').onclick = () => openPractice(false);
  $('btnGame').onclick = () => openGameSetup();
}
function show(which){
  for (const id of ['hub','pause','ctrls','prac','gameset','results']) $(id).hidden = id !== which;
  app.classList.toggle('menu', which === 'hub' || which === 'gameset' || which === 'results' || (which === 'prac' && !pracLive));
  musicSheet(which);
  if (which) $(which).scrollTop = 0;
  requestAnimationFrame(resize);
}
function refreshMenus(){ if (!$('hub').hidden) renderHub(); }
let toastTimer = 0;
function toast(main, sub, ms, cls){
  if (G && G.attract) return;
  const t = $('toast'); $('tMain').textContent = main; $('tSub').textContent = sub || '';
  t.className = 'toast' + (cls ? ' ' + cls : ''); t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function startPractice(id){
  ensureAudio();
  newMatch(id || practiceIsland, false);
  Object.keys(hudCache).forEach(k => delete hudCache[k]);
  $('aAbbr').textContent = G.island.opp.abbr; $('aSw').style.background = G.island.opp.shirt; $('aSw').style.boxShadow = `inset 0 -3px 0 ${G.island.opp.trim}`;
  $('arenaShort').textContent = G.island.name.toUpperCase().slice(0, 16);
  syncPracLabels();
  save.plays++; persist();
  show(null); paused = false; renderCtrlBar();
  setTimeout(resize, 30);
  band('intro');
  toast('Practice', 'Press a shot as the ball comes · the swing is timed for you', 2200, 'small');
  wake();
}
// ---------------- practice settings: island and ball cannon (from the dock, or live from the pause menu)
let pracLive = false;
function openPractice(live){ pracLive = !!live; renderPractice(); show('prac'); }
function renderPractice(){
  const P = practice, seg = (k, label, note) => `<div class="prow"><h3 class="h">${label}</h3>${segHtml('p_' + k, PRAC_OPTS[k], P[k])}${note ? `<p class="gfxnote">${note}</p>` : ''}</div>`;
  const tog = (k, label, note) => `<label class="tog"><input type="checkbox" id="p_${k}" ${P[k] ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl"><b>${label}</b><small>${note}</small></span></label>`;
  $('pracWrap').innerHTML = `
    <div class="sticky"><div style="display:flex;flex-direction:column;gap:6px"><h2 class="h">Practice</h2><span class="slots">BALL CANNON · NO XP</span></div><button class="btn small" id="pracGoTop" type="button">${pracLive ? 'Apply' : 'Start'}</button></div>
    ${pracLive ? '' : `<div class="card pset"><div class="prow"><h3 class="h">Island</h3>${segHtml('p_island', ISLANDS.map(i => [i.id, i.name]), practiceIsland)}<p class="gfxnote">Colors only for now: every island shares the placeholder dock court.</p></div></div>`}
    <div class="card pset">
      ${seg('feed', 'Cannon feeds', 'Mix plays all of them: serves from behind the far baseline, drives and lobs deep, drops and dinks into your kitchen.')}
      ${seg('place', 'Placement')}
      ${seg('spin', 'Spin')}
      ${seg('pace', 'Pace')}
      ${seg('rate', 'Time between balls')}
      ${seg('opp', 'Across the net', 'Cannon only scores a point for every return that lands in.')}
      ${seg('tier', 'Crew level', 'How well the crew across the net plays it back.')}
    </div>
    <div class="card pset"><h3 class="h">Rules</h3>
      ${tog('kitchen', 'Kitchen rule', 'Volleying with a foot in the kitchen, or stepping in right after a volley, is a fault')}
      ${tog('twoBounce', 'Two-bounce rule', 'The serve and the return must bounce before they\'re hit')}
    </div>
    <div class="card pset"><h3 class="h">Reading the ball</h3>
      ${tog('marker', 'Landing marker', 'A ring where the ball will bounce: gold when it lands in, red when it\'s going out')}
      ${tog('height', 'Height line', 'In 3D, a thin line from the ball down to its shadow')}
    </div>
    <div class="btns"><button class="btn" id="pracGo" type="button">${pracLive ? 'Apply and resume' : 'Start practice'}</button><button class="btn ghost" id="pracBack" type="button">${pracLive ? 'Back to the pause menu' : 'Back to the dock'}</button></div>`;
  for (const k of Object.keys(PRAC_OPTS)) $('p_' + k).querySelectorAll('button').forEach(b => b.onclick = () => { practice[k] = b.dataset.v; savePractice(); $('p_' + k).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  for (const k of ['marker', 'height', 'kitchen', 'twoBounce']) $('p_' + k).onchange = e => { practice[k] = e.target.checked; savePractice(); };
  if (!pracLive) $('p_island').querySelectorAll('button').forEach(b => b.onclick = () => { practiceIsland = b.dataset.v; try { localStorage.setItem('pickle-practice-island', practiceIsland); } catch(e) {} $('p_island').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); startAttract(); });
  const go = () => { if (pracLive && G && !G.attract) { G.cfg = { ...practice }; G.players[1].tier = AI_TIERS[practice.tier] ? practice.tier : 'bosun'; syncPracLabels(); paused = false; show(null); toast('Settings applied', '', 1000, 'small'); } else startPractice(practiceIsland); };
  const back = () => { if (pracLive && G && !G.attract) { paused = true; preparePause(); show('pause'); } else { renderHub(); show('hub'); } };
  $('pracGo').onclick = go; $('pracGoTop').onclick = go; $('pracBack').onclick = back;
}
function syncPracLabels(){
  const cannonOnly = G.cfg.opp === 'none';
  $('objText').textContent = cannonOnly ? 'Practice · return the cannon\'s feeds' : 'Practice · keep the rally going';
  $('hSub').textContent = cannonOnly ? 'RETURNS IN' : 'PICKLE PIRATES'; $('aSub').textContent = cannonOnly ? 'MISSED' : tierOf(G.players[1]).name.toUpperCase();
}
function startAttract(){ newMatch(practiceIsland, true); resize(); }
// ---------------- singles game: setup, start, results
function openGameSetup(){
  const C = gameCfg, tog = (k, label, note) => `<label class="tog"><input type="checkbox" id="g_${k}" ${C[k] ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl"><b>${label}</b><small>${note}</small></span></label>`;
  $('gameWrap').innerHTML = `
    <div class="sticky"><div style="display:flex;flex-direction:column;gap:6px"><h2 class="h">Singles game</h2><span class="slots">YOU VS A CPU CREW</span></div><button class="btn small" id="gameGoTop" type="button">Start</button></div>
    <div class="card pset">
      <div class="prow"><h3 class="h">Island</h3>${segHtml('g_island', ISLANDS.map(i => [i.id, i.name]), practiceIsland)}</div>
      <div class="prow"><h3 class="h">Opponent</h3>${segHtml('g_tier', GAME_OPTS.tier, C.tier)}<p class="gfxnote">Deckhands are slow to react and pop up their dinks. Bosuns come to the net and punish high balls. Captains read everything early and rarely miss.</p></div>
      <div class="prow"><h3 class="h">Game to</h3>${segHtml('g_to', GAME_OPTS.to, C.to)}<p class="gfxnote">Win by 2. Ends switch when the first side reaches 6 (8 in a game to 15, 11 in a game to 21).</p></div>
      <div class="prow"><h3 class="h">Scoring</h3>${segHtml('g_scoring', GAME_OPTS.scoring, C.scoring)}<p class="gfxnote">Side-out: only the serving side scores, and losing a rally passes the serve. Rally: every rally scores.</p></div>
    </div>
    <div class="card pset"><h3 class="h">Rules</h3>
      ${tog('kitchen', 'Kitchen rule', 'Volleying with a foot in the kitchen, or stepping in right after a volley, is a fault')}
      ${tog('twoBounce', 'Two-bounce rule', 'The serve and the return must bounce before they\'re hit')}
    </div>
    <div class="card pset"><h3 class="h">Reading the ball</h3>
      ${tog('marker', 'Landing marker', 'Off by default in games')}
      ${tog('height', 'Height line', 'In 3D, a thin line from the ball down to its shadow')}
    </div>
    <div class="btns"><button class="btn" id="gameGo" type="button">Start the game</button><button class="btn ghost" id="gameBack" type="button">Back to the dock</button></div>`;
  for (const k of ['to', 'scoring', 'tier']) $('g_' + k).querySelectorAll('button').forEach(b => b.onclick = () => { gameCfg[k] = k === 'to' ? Number(b.dataset.v) : b.dataset.v; saveGameCfg(); $('g_' + k).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  for (const k of ['kitchen', 'twoBounce', 'marker', 'height']) $('g_' + k).onchange = e => { gameCfg[k] = e.target.checked; saveGameCfg(); };
  $('g_island').querySelectorAll('button').forEach(b => b.onclick = () => { practiceIsland = b.dataset.v; try { localStorage.setItem('pickle-practice-island', practiceIsland); } catch(e) {} $('g_island').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); startAttract(); });
  $('gameGo').onclick = $('gameGoTop').onclick = () => startGame();
  $('gameBack').onclick = () => { renderHub(); show('hub'); };
  show('gameset');
}
function startGame(){
  ensureAudio();
  newMatch(practiceIsland, false, 'game');
  Object.keys(hudCache).forEach(k => delete hudCache[k]);
  $('aAbbr').textContent = G.island.opp.abbr; $('aSw').style.background = G.island.opp.shirt; $('aSw').style.boxShadow = `inset 0 -3px 0 ${G.island.opp.trim}`;
  save.plays++; persist();
  show(null); paused = false; renderCtrlBar();
  setTimeout(resize, 30);
  band('intro');
  toast(`First to ${G.match.to}`, `vs a ${tierOf(G.players[1]).name} · ${teamName(G.match.server)} serve first`, 2200, 'small');
  wake();
}
function showResults(){
  const S = G.match, won = S.winner === 'home', st = G.stats;
  const faults = Object.entries(st.faults).filter(([k]) => !['double bounce', 'winner', 'ace', 'in'].includes(k)).map(([k, n]) => `${CALL_TEXT[k].replace('!', '').toLowerCase()} ${n}`).join(', ');
  $('resCard').innerHTML = `
    <div class="resulthead ${won ? 'win' : 'lose'}" style="display:flex;flex-direction:column;gap:8px"><p class="eyebrow">${G.island.name.toUpperCase()} · GAME TO ${S.to} · VS ${tierOf(G.players[1]).name.toUpperCase()}</p><h2>${won ? 'Victory!' : 'Sunk!'}</h2></div>
    <div class="final"><div><div class="n">${S.pts.home}</div><div class="who">${HOME.abbr}</div></div><div class="dash">–</div><div><div class="n">${S.pts.away}</div><div class="who">${G.island.opp.abbr}</div></div></div>
    <dl class="xprows"><div><dt>Rallies</dt><dd>${S.rallies}</dd></div><div><dt>Side outs</dt><dd>${S.sideOuts}</dd></div><div><dt>Longest rally</dt><dd>${st.longest} shots</dd></div><div><dt>Aces</dt><dd>${st.aces}</dd></div>${faults ? `<div><dt>Faults</dt><dd>${faults}</dd></div>` : ''}</dl>
    <div class="btns"><button class="btn" id="resAgain" type="button">Rematch</button><button class="btn ghost" id="resHub" type="button">Back to the dock</button></div>`;
  $('resAgain').onclick = () => startGame();
  $('resHub').onclick = () => { renderHub(); show('hub'); startAttract(); };
  show('results');
  if (won) sfx('level');
}
// ---------------- feel tuning panel (` key or the pause menu); the game keeps running while it's open
function buildTunePanel(){
  let el = $('tune');
  if (!el) { el = document.createElement('aside'); el.id = 'tune'; el.className = 'tune'; el.hidden = true; el.setAttribute('aria-label', 'Feel tuning'); stage.appendChild(el); }
  const fmt = (v, st) => st >= 1 ? String(Math.round(v)) : st >= 0.1 ? v.toFixed(1) : st >= 0.01 ? v.toFixed(2) : v.toFixed(4);
  const unitSp = u => u && u !== '°' && u !== '×' ? ' ' : '';
  el.innerHTML = `<div class="tune-head"><b>Feel tuning</b><span>live · saved in this browser</span><button class="ib" id="tuneClose" type="button" aria-label="Close tuning">×</button></div>
    <div class="tune-body">${TUNE_DEF.map(([grp, items]) => `<h4>${grp}</h4>` + items.map(([k, label, mn, mx, st, d, unit]) => `
      <label class="trow${TUNE[k] !== d ? ' changed' : ''}" data-k="${k}"><span class="tl">${label}</span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${TUNE[k]}" data-k="${k}" data-st="${st}" data-d="${d}"><span class="tv">${fmt(TUNE[k], st)}${unitSp(unit)}${unit}</span></label>`).join('')).join('')}</div>
    <div class="tune-foot"><button class="btn ghost small" id="tuneCopy" type="button">Copy values</button><button class="btn ghost small" id="tuneReset" type="button">Reset all</button><span id="tuneMsg" aria-live="polite"></span></div>`;
  el.querySelectorAll('input[type=range]').forEach(inp => {
    const k = inp.dataset.k, st = Number(inp.dataset.st), unit = TUNE_DEF.flatMap(g => g[1]).find(x => x[0] === k)[6];
    inp.oninput = () => { TUNE[k] = Number(inp.value); inp.nextElementSibling.textContent = fmt(TUNE[k], st) + unitSp(unit) + unit; inp.parentElement.classList.toggle('changed', TUNE[k] !== Number(inp.dataset.d)); saveTune(); };
    inp.onchange = () => inp.blur();   // hand the keyboard straight back to the game
    inp.addEventListener('pointerup', () => setTimeout(() => inp.blur(), 0));
  });
  $('tuneClose').onclick = () => toggleTune(false);
  $('tuneReset').onclick = () => { for (const [, items] of TUNE_DEF) for (const [k, , , , , d] of items) TUNE[k] = d; saveTune(); buildTunePanel(); $('tune').hidden = false; $('tuneMsg').textContent = 'Back to defaults.'; };
  $('tuneCopy').onclick = async () => {
    const chg = {}; for (const [, items] of TUNE_DEF) for (const [k, , , , , d] of items) if (TUNE[k] !== d) chg[k] = TUNE[k];
    const txt = JSON.stringify(chg, null, 1); let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch(e) {}
    $('tuneMsg').textContent = ok ? (Object.keys(chg).length ? 'Copied your changes.' : 'Nothing changed yet.') : txt;
  };
}
// Practice: tuning runs live, so you can feel each slider. A singles game holds while the drawer is open
// and goes back to where you were when it closes (the pause menu, or play).
let tuneHold = null;   // null, 'pause' or 'play': what a held game returns to
function toggleTune(on){
  if (!$('tune')) buildTunePanel();
  const el = $('tune'), wasOpen = !el.hidden; el.hidden = on == null ? !el.hidden : !on;
  const live = G && !G.attract;
  if (!el.hidden && !wasOpen && live) {
    if (G.mode === 'game') { tuneHold = paused ? 'pause' : 'play'; paused = true; keys.clear(); show(null); }
    else if (paused) setPaused(false);
  } else if (el.hidden && wasOpen && tuneHold) {
    const back = tuneHold; tuneHold = null;
    if (live && G.mode === 'game') { if (back === 'pause') setPaused(true); else setPaused(false); }
  }
}
function preparePause(){
  const game = G.mode === 'game';
  $('pauseInfo').textContent = game ? `${G.island.name} · ${scoreCall(G.match)} · game to ${G.match.to}` : `${G.island.name} · ${G.score.home}–${G.score.away} · best rally ${G.best}`;
  $('btnPracSet').hidden = game;
  $('btnRestart').textContent = game ? 'Restart game' : 'Restart practice';
}
function setPaused(p){
  if (!G || G.attract) return;
  tuneHold = null;
  paused = p;
  if (p) { preparePause(); keys.clear(); joy.id = null; show('pause'); }
  else show(null);
}
$('btnPause').onclick = () => setPaused(!paused);
$('btnResume').onclick = () => setPaused(false);
$('btnRestart').onclick = () => { paused = false; if (G && G.mode === 'game') startGame(); else startPractice(G ? G.island.id : practiceIsland); };
$('btnTune').onclick = () => toggleTune(true);
$('btnPracSet').onclick = () => openPractice(true);
$('btnPauseCtrls').onclick = () => openControls('pause');
applyA11y();
$('btnQuit').onclick = () => { paused = false; tuneHold = null; renderHub(); show('hub'); startAttract(); };
function syncSound(){
  $('btnSound').setAttribute('aria-pressed', String(muted)); $('btnSound').setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound'); $('icoOn').hidden = muted; $('icoOff').hidden = !muted;
  const pm = $('btnMute'); if (pm) pm.textContent = muted ? 'Sound: off' : 'Sound: on';
  const hm = $('sndOn'); if (hm) hm.checked = !muted;
}
function setMuted(m){ muted = !!m; ensureAudio(); applyVolume(); try { localStorage.setItem('pickle-mute', muted ? '1' : '0'); } catch(e) {} syncSound(); if (G && !G.attract) toast(muted ? 'Sound off' : 'Sound on', '', 900, 'small'); }
$('btnSound').onclick = () => setMuted(!muted);
$('btnMute').onclick = () => setMuted(!muted);
syncSound();
$('btnCtrls').onclick = () => { ctrlBarOn = !ctrlBarOn; try { localStorage.setItem('pickle-ctrlbar', ctrlBarOn ? '1' : '0'); } catch(e) {} renderCtrlBar(); };
renderCtrlBar();
let wakeLock = null;
