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
  ['Ball flight', [
    ['gravity', 'Gravity', 20, 45, 0.5, 32.2, 'ft/s²'],
    ['cd', 'Drag coefficient (outdoor ball ≈ 0.31, indoor ≈ 0.45)', 0, 0.7, 0.01, 0.31, ''],
    ['lift', 'Spin lift (CL per unit of spin)', 0, 0.6, 0.005, 0.195, ''],
    ['spinDecay', 'Spin lost per second', 0, 1, 0.02, 0.2, ''],
  ]],
  ['Bounce and net', [
    ['bounce', 'Bounce (restitution)', 0.4, 0.8, 0.01, 0.63, ''],
    ['grip', 'Court grip (friction)', 0.05, 1, 0.01, 0.45, ''],
    ['tape', 'Net tape bounce', 0, 0.7, 0.01, 0.25, ''],
  ]],
  ['Shot shapes', [
    ['serveSpeed', 'Serve speed', 25, 60, 1, 42, 'mph'],
    ['driveSpeed', 'Drive speed', 25, 65, 1, 46, 'mph'],
    ['driveSpin', 'Drive topspin', 0, 2500, 50, 1200, 'rpm'],
    ['dinkClear', 'Dink clears the net by', 0.2, 3, 0.05, 1.0, 'ft'],
    ['dropClear', 'Drop clears the net by', 0.3, 5, 0.05, 1.1, 'ft'],
    ['lobApex', 'Lob peaks at', 10, 30, 0.5, 19, 'ft'],
    ['sliceSpin', 'Slice backspin', 0, 2000, 50, 700, 'rpm'],
  ]],
  ['Footwork', [
    ['runSpeed', 'Run speed', 6, 24, 0.5, 14, 'ft/s'],
    ['runAccel', 'Acceleration', 20, 160, 5, 70, ''],
    ['reach', 'Paddle reach', 1.5, 5, 0.1, 3.2, 'ft'],
  ]],
];
const TUNE = {};
for (const [, items] of TUNE_DEF) for (const [k, , , , , d] of items) TUNE[k] = d;
try { const t = JSON.parse(localStorage.getItem('pickle-tune') || 'null'); if (t) for (const k in t) if (k in TUNE && typeof t[k] === 'number') TUNE[k] = t[k]; } catch(e) {}
const saveTune = () => { try { const ch = {}; for (const [, items] of TUNE_DEF) for (const [k, , , , , d] of items) if (TUNE[k] !== d) ch[k] = TUNE[k]; localStorage.setItem('pickle-tune', JSON.stringify(ch)); } catch(e) {} };

// ---------------- practice: the ball cannon (saved per browser)
const PRAC_OPTS = {
  feed:  [['mix','Mix'],['serve','Serves'],['drive','Drives'],['drop','Drops'],['dink','Dinks'],['lob','Lobs']],
  place: [['random','Anywhere'],['fore','Forehand'],['back','Backhand'],['body','At me']],
  spin:  [['none','Flat'],['top','Topspin'],['slice','Slice'],['random','Random']],
  pace:  [['slow','Slow'],['normal','Normal'],['fast','Fast']],
  rate:  [['fast','Quick'],['normal','Normal'],['slow','Relaxed']],
  opp:   [['cpu','Stand-in crew returns'],['none','Cannon only']],
};
const practiceDef = () => ({ feed:'mix', place:'random', spin:'none', pace:'normal', rate:'normal', opp:'cpu', marker:true, height:true });
let practice = practiceDef();
try { const pr = JSON.parse(localStorage.getItem('pickle-practice') || 'null'); if (pr && typeof pr === 'object') for (const k in practice) if (k in pr && (typeof pr[k] === typeof practice[k]) && (!PRAC_OPTS[k] || PRAC_OPTS[k].some(o => o[0] === pr[k]))) practice[k] = pr[k]; } catch(e) {}
const savePractice = () => { try { localStorage.setItem('pickle-practice', JSON.stringify(practice)); } catch(e) {} };
const FEED_DELAY = { fast:0.6, normal:1.4, slow:2.4 }, PACE = { slow:0.85, normal:1, fast:1.15 };

// mode: 'attract' (CPU vs CPU behind the menus) or 'practice' (you on the near side, CPU across the net, the ball cannon restarts rallies)
function newMatch(islandId, attract){
  const isl = ISLANDS.find(i => i.id === islandId) || ISLANDS[0];
  G = { island:isl, theme:THEMES[isl.id], attract:!!attract, mode: attract ? 'attract' : 'practice', state:'feed', stT:1.0, time:0,
    score:{ home:0, away:0 }, rally:0, best:0, shotN:0, feedTo:'home', lastCall:null,
    ball:mkBall(), landing:null, parts:[], pops:[], shake:0,
    cfg: attract ? { ...practiceDef(), opp:'cpu', marker:false } : { ...practice }, cannon:{ x:CW/2, y:-3.4, z:2.5, kick:0 } };
  G.players = [mkPlayer('home', HOME.species, !attract), mkPlayer('away', isl.opp.species, false)];
}
const humanPl = () => G && !G.attract ? G.players.find(p => p.human) || null : null;
const other = tm => tm === 'home' ? 'away' : 'home';
const sideOf = y => y > NETY ? 'home' : 'away';
const baseY = tm => tm === 'home' ? CL : 0;
