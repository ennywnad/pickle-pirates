// Pickle Pirates · Match state, feel tuning values and accessibility settings
'use strict';
// ---------------- match state
let G = null;
const mkPlayer = (team, species, human) => ({ team, species, human:!!human, x:CW/2, y: team === 'home' ? CL - 2 : 2, vx:0, vy:0, face: team === 'home' ? -Math.PI/2 : Math.PI/2, swing:0, swingKind:null, cool:0, ai:{ tx:CW/2, ty: team === 'home' ? CL - 2 : 2, think:0 } });
const mkBall = () => ({ x:CW/2, y:NETY, z:-5, vx:0, vy:0, vz:0, sx:0, sy:0, sz:0, live:false, side:null, bounces:0, lastBy:null, lastKind:null, still:0, trail:[] });

// ---------------- accessibility (saved per browser)
const A11Y = { rm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), btn: (window.matchMedia && matchMedia('(pointer:coarse)').matches) ? 'large' : 'normal' };
try { const a = JSON.parse(localStorage.getItem('pickle-a11y') || 'null'); if (a) Object.assign(A11Y, a); } catch(e) {}
const saveA11y = () => { try { localStorage.setItem('pickle-a11y', JSON.stringify(A11Y)); } catch(e) {} };

// ---------------- feel tuning (live sliders; saved in this browser)
// [key, label, min, max, step, default, unit]
const TUNE_DEF = [
  ['Ball', [
    ['gravity', 'Gravity', 20, 45, 0.5, 32.2, 'ft/s²'],
    ['drag', 'Air drag', 0, 0.03, 0.0005, 0.012, ''],
    ['magnus', 'Spin curve', 0, 0.004, 0.0001, 0.0012, ''],
    ['bounce', 'Bounce height', 0.4, 0.85, 0.01, 0.64, ''],
    ['skid', 'Speed kept on the bounce', 0.5, 1, 0.01, 0.78, ''],
  ]],
  ['Footwork', [
    ['runSpeed', 'Run speed', 6, 24, 0.5, 14, 'ft/s'],
    ['runAccel', 'Acceleration', 20, 160, 5, 70, ''],
    ['reach', 'Paddle reach', 1.5, 5, 0.1, 3.2, 'ft'],
  ]],
  ['Practice', [
    ['cannonRate', 'Ball cannon delay', 0.4, 4, 0.1, 1.2, 's'],
  ]],
];
const TUNE = {};
for (const [, items] of TUNE_DEF) for (const [k, , , , , d] of items) TUNE[k] = d;
try { const t = JSON.parse(localStorage.getItem('pickle-tune') || 'null'); if (t) for (const k in t) if (k in TUNE && typeof t[k] === 'number') TUNE[k] = t[k]; } catch(e) {}
const saveTune = () => { try { const ch = {}; for (const [, items] of TUNE_DEF) for (const [k, , , , , d] of items) if (TUNE[k] !== d) ch[k] = TUNE[k]; localStorage.setItem('pickle-tune', JSON.stringify(ch)); } catch(e) {} };

// mode: 'attract' (CPU vs CPU behind the menus) or 'practice' (you on the near side, CPU across the net, the ball cannon restarts rallies)
function newMatch(islandId, attract){
  const isl = ISLANDS.find(i => i.id === islandId) || ISLANDS[0];
  G = { island:isl, theme:THEMES[isl.id], attract:!!attract, mode: attract ? 'attract' : 'practice', state:'feed', stT:1.0, time:0,
    score:{ home:0, away:0 }, rally:0, best:0, shotN:0, feedTo:'home', lastCall:null,
    ball:mkBall(), landing:null, parts:[], pops:[], shake:0 };
  G.players = [mkPlayer('home', HOME.species, !attract), mkPlayer('away', isl.opp.species, false)];
}
const humanPl = () => G && !G.attract ? G.players.find(p => p.human) || null : null;
const other = tm => tm === 'home' ? 'away' : 'home';
const sideOf = y => y > NETY ? 'home' : 'away';
const baseY = tm => tm === 'home' ? CL : 0;
