// Pickle Pirates · Menus: the dock (hub), pause, tuning panel, toasts and sound buttons
'use strict';
let paused = false;
let practiceIsland = 'brine';
try { const s = localStorage.getItem('pickle-practice-island'); if (ISLANDS.some(i => i.id === s)) practiceIsland = s; } catch(e) {}
function segHtml(id, opts, cur){ return `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`; }
function renderHub(){
  $('hubWrap').innerHTML = `
    <div class="logo"><p class="eyebrow">Arcade pickleball · pirate crews · real rules</p><h1>Pickle <em>Pirates</em></h1><div class="tape"></div>
      <p class="lede">Sail the Pickle Pirates to seven island courts and the Davy's Locker Cup. This is the first skeleton: rally against a stand-in crew on a placeholder court while the real game gets built.</p></div>
    <button class="chal prac" type="button" id="btnPractice">
      <span class="num">P</span>
      <span class="cinfo"><span class="arena">PRACTICE · BALL CANNON</span><span class="ct">Practice</span><span class="co">The cannon feeds you a ball; hit it back over the net and keep the rally going.</span></span>
      <span class="lock" style="color:var(--hazard)">Play</span></button>
    <div class="card gfx"><h3 class="h">Practice island</h3>${segHtml('islandSeg', ISLANDS.map(i => [i.id, i.name]), practiceIsland)}<p class="gfxnote">Colors only for now: every island shares the placeholder dock court.</p></div>
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
    <p class="foot ver">Pickle Pirates ${GAME_VERSION} · <a href="https://github.com/ennywnad/pickle-pirates" target="_blank" rel="noopener">source</a></p>`;
  document.querySelectorAll('#gfxSeg button').forEach(b => b.onclick = () => setGfx(b.dataset.g));
  document.querySelectorAll('#engSeg button').forEach(b => b.onclick = () => setEngine(b.dataset.e));
  $('islandSeg').querySelectorAll('button').forEach(b => b.onclick = () => { practiceIsland = b.dataset.v; try { localStorage.setItem('pickle-practice-island', practiceIsland); } catch(e) {} $('islandSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); startAttract(); });
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
  $('btnPractice').onclick = () => startPractice(practiceIsland);
}
function show(which){
  for (const id of ['hub','pause','ctrls']) $(id).hidden = id !== which;
  app.classList.toggle('menu', which === 'hub');
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
  $('objText').textContent = 'Practice · keep the rally going';
  save.plays++; persist();
  show(null); paused = false; renderCtrlBar();
  setTimeout(resize, 30);
  band('intro');
  toast('Practice', 'Hit it back over the net · pause for settings', 1700, 'small');
  wake();
}
function startAttract(){ newMatch(practiceIsland, true); resize(); }
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
function toggleTune(on){
  if (!$('tune')) buildTunePanel();
  const el = $('tune'); el.hidden = on == null ? !el.hidden : !on;
  if (!el.hidden && paused && G && !G.attract) setPaused(false);
}
function preparePause(){ $('pauseInfo').textContent = `${G.island.name} · ${G.score.home}–${G.score.away} · best rally ${G.best}`; }
function setPaused(p){
  if (!G || G.attract) return;
  paused = p;
  if (p) { preparePause(); keys.clear(); joy.id = null; show('pause'); }
  else show(null);
}
$('btnPause').onclick = () => setPaused(!paused);
$('btnResume').onclick = () => setPaused(false);
$('btnRestart').onclick = () => { paused = false; startPractice(G ? G.island.id : practiceIsland); };
$('btnTune').onclick = () => toggleTune(true);
$('btnPauseCtrls').onclick = () => openControls('pause');
applyA11y();
$('btnQuit').onclick = () => { paused = false; renderHub(); show('hub'); startAttract(); };
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
