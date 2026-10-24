// Pickle Pirates · Audio: sample pack loader, mixer, crowd bed, sound effects, synth fallback and music cues
'use strict';
// ---------------- audio
// Sample pack in assets/sfx, built by tools/gen_sfx.py: paddle pops, deck bounces, the net, pilings, the ball cannon,
// the referee parrot, the ship's bell, the harbor bed, the dockside crowd and the shanty band.
// Mixer: effects + crowd buses -> compressor -> master volume. A sample that hasn't loaded plays its synthesised version instead.
let AC = null, noise = null, master = null, sfxBus = null, crowdBus = null, crowdGain = null, crowdSrc = null;
let volume = 0.8, crowdVol = 0.6, musicVol = 0.6, musicBus = null;
try { const v = parseFloat(localStorage.getItem('pickle-vol')); if (v >= 0 && v <= 1) volume = v; const c = parseFloat(localStorage.getItem('pickle-crowdvol')); if (c >= 0 && c <= 1) crowdVol = c; const m = parseFloat(localStorage.getItem('pickle-musicvol')); if (m >= 0 && m <= 1) musicVol = m; } catch(e) {}
// sound name -> number of files (name_0.mp3 ...)
const SFX_SET = { paddle:4, drive:3, smash:2, bounce:4, net:2, tape:1, post:2, cannon:1, splash:1, bell:1, pickup:1, level:1, cheer:1, aww:1, parrot:3, crowd:1, vent:1, bubbles:1 };
// fixed picks: the parrot's three calls mean different things
const SFX_PICK = { call:['parrot', 0], fault:['parrot', 1], good:['parrot', 2] };
const SFX_GAIN = { paddle:0.5, drive:0.62, smash:0.75, bounce:0.4, net:0.5, tape:0.4, post:0.5, cannon:0.45, splash:0.55, bell:0.4, pickup:0.45, level:0.5, cheer:0.6, aww:0.5, parrot:0.42, vent:0.5, bubbles:0.45 };
const SFX_GAP = { vent:0.5, bubbles:0.5, bounce:0.04, paddle:0.04, drive:0.04, cheer:1.5, aww:1.5, call:0.3, fault:0.3, good:0.3, bell:0.8 };
const NO_PITCH = new Set(['level', 'pickup', 'cheer', 'aww', 'bell']);
const sfxRaw = {}, sfxBuf = {}, sfxLast = {};
// fetch the bytes right away; decode once the audio context exists (after the first tap / key / button)
for (const [name, n] of Object.entries(SFX_SET)) for (let i=0;i<n;i++) {
  const key = `${name}_${i}`;
  sfxRaw[key] = fetch(`assets/sfx/${key}.mp3`).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
}
let sfxDecoding = false;
function decodeSfx(){
  if (sfxDecoding || !AC) return; sfxDecoding = true;
  for (const [name, n] of Object.entries(SFX_SET)) for (let i=0;i<n;i++) {
    sfxRaw[`${name}_${i}`].then(ab => ab && new Promise((res, rej) => AC.decodeAudioData(ab, res, rej))).then(buf => {
      if (!buf) return; (sfxBuf[name] || (sfxBuf[name] = []))[i] = buf;   // by index: fixed picks need the right file
      if (name === 'crowd') startCrowd();
    }).catch(() => {});
  }
  decodeMusic();
}
function ensureAudio(){
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { AC = null; }
    if (AC) {
      const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      master = AC.createGain(); master.gain.value = muted ? 0 : volume;
      sfxBus = AC.createGain(); crowdBus = AC.createGain(); crowdBus.gain.value = crowdVol; musicBus = AC.createGain(); musicBus.gain.value = musicVol;
      sfxBus.connect(comp); crowdBus.connect(comp); comp.connect(master); musicBus.connect(master); master.connect(AC.destination);
      decodeSfx();
    }
  }
  if (AC && AC.state === 'suspended') AC.resume().catch(()=>{});
  if (AC && !noise) { noise = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noise.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1; }
}
function applyA11y(){
  app.dataset.btn = A11Y.btn; document.body.classList.toggle('rm', !!A11Y.rm);
  JR = A11Y.btn === 'xl' ? 66 : A11Y.btn === 'large' ? 56 : 46;
}
function applyVolume(){
  if (!AC) return; const t = AC.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : volume, t, 0.03); crowdBus.gain.setTargetAtTime(crowdVol, t, 0.05); musicBus.gain.setTargetAtTime(musicVol, t, 0.05);
}
function startCrowd(){
  if (crowdSrc || !sfxBuf.crowd) return;
  crowdSrc = AC.createBufferSource(); crowdSrc.buffer = sfxBuf.crowd[0]; crowdSrc.loop = true;
  crowdGain = AC.createGain(); crowdGain.gain.value = 0; crowdSrc.connect(crowdGain); crowdGain.connect(crowdBus); crowdSrc.start();
}
// the crowd murmur builds with the length of the rally and dips while paused
function updateCrowd(){
  if (!crowdGain) return;
  let target = 0.1;
  if (G && !G.attract) target = paused || G.state === 'end' ? 0.05 : 0.18 + 0.05*Math.min(8, G.rally || 0);
  crowdGain.gain.setTargetAtTime(target, AC.currentTime, 0.5);
}
function playSample(name, gain, rate, pick){
  const list = sfxBuf[name]; if (!list) return false;
  let i = pick;
  if (i == null) {
    const have = list.map((b, k) => b ? k : -1).filter(k => k >= 0); if (!have.length) return false;
    const alt = have.filter(k => k !== sfxLast[name]); i = (alt.length ? alt : have)[Math.floor(Math.random()*(alt.length ? alt : have).length)];
  }
  if (!list[i]) return false; sfxLast[name] = i;
  const src = AC.createBufferSource(); src.buffer = list[i]; src.playbackRate.value = rate;
  const g = AC.createGain(); g.gain.value = gain; src.connect(g); g.connect(sfxBus); src.start();
  return true;
}
const lastSfx = {};
function sfx(type, v=1){
  if (!AC || muted || (G && G.attract)) return;
  const t = AC.currentTime;
  if (lastSfx[type] && t - lastSfx[type] < (SFX_GAP[type] || 0.05)) return; lastSfx[type] = t;
  const [name, pick] = SFX_PICK[type] || [type, null];
  const g = clamp(v, 0.2, 1.2);
  const rate = NO_PITCH.has(name) ? 1 : name === 'parrot' ? 0.97 + Math.random()*0.08 : 0.95 + Math.random()*0.1;
  if (playSample(name, (SFX_GAIN[name] || 0.5)*g, rate, pick)) return;
  synthSfx(type, v);
}
function synthSfx(type, v){
  const t = AC.currentTime, out = sfxBus;
  const burst = (dur, ft, freq, q, gain, f2) => {
    gain = Math.max(0.002, gain || 0);
    const s = AC.createBufferSource(); s.buffer = noise;
    const f = AC.createBiquadFilter(); f.type = ft; f.frequency.setValueAtTime(freq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t+dur); f.Q.value = q;
    const g = AC.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()*0.5); s.stop(t+dur+0.02);
  };
  const tone = (w, fr, dur, gain, att=0.005, fd, at=0) => {
    gain = Math.max(0.0002, gain || 0);
    const o = AC.createOscillator(); o.type = w; o.frequency.setValueAtTime(fr, t+at); if (fd) o.frequency.exponentialRampToValueAtTime(fd, t+at+dur);
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t+at); g.gain.exponentialRampToValueAtTime(gain, t+at+att); g.gain.exponentialRampToValueAtTime(0.0001, t+at+dur);
    o.connect(g); g.connect(out); o.start(t+at); o.stop(t+at+dur+0.05); return o;
  };
  switch(type){
    case 'paddle': burst(0.04,'bandpass',1500,1.6,0.25*v); tone('triangle',520,0.05,0.1*v); break;
    case 'drive': case 'smash': burst(0.06,'bandpass',1800,1.2,0.4); tone('triangle',440,0.06,0.14); break;
    case 'tape': burst(0.03,'highpass',3000,0.8,0.15); break;
    case 'post': tone('triangle',250,0.12,0.15); break;
    case 'cannon': tone('sine',90,0.25,0.3,0.004,40); burst(0.15,'bandpass',600,0.8,0.2); break;
    case 'bell': tone('sine',880,0.9,0.12); tone('sine',1760,0.5,0.05); break;
    case 'call': case 'fault': case 'good': tone('sawtooth',1500,0.18,0.04,0.01,1200); break;
    case 'bounce': burst(0.035,'bandpass',900,1.8,0.2*v); tone('sine',300,0.04,0.08*v); break;
    case 'net': burst(0.18,'lowpass',500,0.7,0.3); break;
    case 'splash': burst(0.5,'bandpass',1400,0.6,0.5,300); break;
    case 'pickup': tone('square',660,0.08,0.06); tone('square',990,0.12,0.06,0.005,null,0.08); break;
    case 'whistle': { const o = tone('sine',2850,0.42,0.09,0.02); const l = AC.createOscillator(); l.frequency.value = 32; const lg = AC.createGain(); lg.gain.value = 90; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t+0.45); break; }
    case 'level': [523,659,784,1047].forEach((f,i) => tone('square',f,0.18,0.07,0.005,null,i*0.09)); break;
  }
}

// ---------------- music cues
// The shanty band (squeezebox, fiddle, bass, stomps, tambourine): match start, a long rally, point won, point lost,
// game won, between-points noodles, and the menu loop. All original tunes, generated by tools/gen_sfx.py.
const MUSIC_SET = { intro:1, rally:1, won:1, lost:1, end:1, noodle:3, loop:1 };
const MUSIC_FILE = { intro:'mus_intro', rally:'mus_rally', won:'mus_won', lost:'mus_lost', end:'mus_end', noodle:'mus_noodle', loop:'mus_loop' };
const LOOP_LEN = 16*4*60/116;          // 16 bars at 116 bpm
const musBuf = {};
let musCue = null, musLoop = null, musSheet = 'hub', musDecoding = false;
function decodeMusic(){
  if (musDecoding || !AC) return; musDecoding = true;
  for (const [name, n] of Object.entries(MUSIC_SET)) for (let i=0;i<n;i++) {
    const file = n > 1 ? `${MUSIC_FILE[name]}_${i}` : MUSIC_FILE[name];
    fetch(`assets/sfx/${file}.mp3`).then(r => r.ok ? r.arrayBuffer() : null).then(ab => ab && new Promise((res, rej) => AC.decodeAudioData(ab, res, rej)))
      .then(buf => { if (buf) (musBuf[name] || (musBuf[name] = [])).push(buf); }).catch(() => {});
  }
}
const cueOn = () => musCue && AC && musCue.end > AC.currentTime;
function fadeOut(node, f){
  const t = AC.currentTime;
  node.g.gain.cancelScheduledValues(t); node.g.gain.setValueAtTime(node.g.gain.value, t); node.g.gain.linearRampToValueAtTime(0, t + f);
  try { node.src.stop(t + f + 0.05); } catch(e) {}
}
function stopCue(f = 0.25){ if (musCue && AC) fadeOut(musCue, f); musCue = null; }
// play one cue; 'inter' asks for the loop instead
function band(cue, delay = 0){
  if (!AC || !musicBus || (G && G.attract && cue !== 'inter')) return;
  if (cue === 'inter') { stopCue(0.4); return bandLoop(true); }
  const list = musBuf[cue]; if (!list || !list.length) return;
  bandLoop(false); stopCue(0.25);
  const buf = list[Math.floor(Math.random()*list.length)], t = AC.currentTime + delay;
  const src = AC.createBufferSource(); src.buffer = buf;
  const g = AC.createGain(); g.gain.value = 0.72; src.connect(g); g.connect(musicBus); src.start(t);
  musCue = { src, g, name:cue, end: t + buf.duration };
}
function bandLoop(on){
  if (!AC || !musicBus) return;
  if (!on) { if (musLoop) { fadeOut(musLoop, 0.7); musLoop = null; } return; }
  if (musLoop || !musBuf.loop) return;
  const buf = musBuf.loop[0], lead = buf.duration - LOOP_LEN > 0.01 ? 1105/buf.sampleRate : 0;   // decoders that keep the mp3 encoder delay
  const src = AC.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = lead; src.loopEnd = Math.min(buf.duration, lead + LOOP_LEN);
  const g = AC.createGain(), t = AC.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 1.6);
  src.connect(g); g.connect(musicBus); src.start(t, lead);
  musLoop = { src, g };
}
// show() reports which sheet is up; the loop plays under menus (not the pause menu) once no cue is playing
function musicSheet(which){ musSheet = which; if (!which) bandLoop(false); }
function musicTick(){
  if (!AC || !musicBus) return;
  const live = G && !G.attract && G.state !== 'end';
  if (musSheet && musSheet !== 'pause' && !live && !cueOn()) bandLoop(true);
}
