// Pickle Pirates · Match state, feel tuning values and accessibility settings
'use strict';
// ---------------- match state
let G = null;
const mkPlayer = (team, species, human) => ({ team, species, human:!!human, x:CW/2, y: team === 'home' ? CL - 2 : 2, vx:0, vy:0, face: team === 'home' ? -Math.PI/2 : Math.PI/2,
  swing:0, swingKind:null, swingSide:1, cool:0, queue:null, split:0, burst:0, lunge:0, lungeSide:1, spot:null, spotT:0,
  ai:{ tx:CW/2, ty: team === 'home' ? CL - 2 : 2, think:0, pressAt:0.3, rollFor:-1 } });
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
    ['assist', 'Move-to-ball assist', 0, 1, 0.05, 0.6, ''],
    ['reach', 'Paddle reach', 1.5, 5, 0.1, 3.0, 'ft'],
    ['lungeReach', 'Extra reach on a lunge', 0, 2, 0.05, 0.9, 'ft'],
  ]],
  ['Hitting', [
    ['queueTime', 'A shot press waits up to', 0.3, 2, 0.05, 1.1, 's'],
    ['sweetEarly', 'Perfect timing: press up to', 0.2, 1, 0.02, 0.5, 's before contact'],
    ['sweetLate', 'Perfect timing: no later than', 0, 0.3, 0.01, 0.1, 's before contact'],
    ['forgive', 'Error forgiveness', 0, 1, 0.05, 0.5, ''],
    ['aimAssist', 'Aim assist (keeps manual aim inside the lines)', 0, 1, 0.05, 0.6, ''],
    ['holdTime', 'Drive hold to full power', 0.15, 1.2, 0.05, 0.5, 's'],
    ['smashSpeed', 'Smash speed', 35, 75, 1, 56, 'mph'],
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
  opp:   [['cpu','A crew returns it'],['none','Cannon only']],
  tier:  [['deckhand','Deckhand'],['bosun','Bosun'],['captain','Captain']],
};
const practiceDef = () => ({ feed:'mix', place:'random', spin:'none', pace:'normal', rate:'normal', opp:'cpu', marker:true, height:true, kitchen:true, twoBounce:true, tier:'bosun' });
let practice = practiceDef();
try { const pr = JSON.parse(localStorage.getItem('pickle-practice') || 'null'); if (pr && typeof pr === 'object') for (const k in practice) if (k in pr && (typeof pr[k] === typeof practice[k]) && (!PRAC_OPTS[k] || PRAC_OPTS[k].some(o => o[0] === pr[k]))) practice[k] = pr[k]; } catch(e) {}
const savePractice = () => { try { localStorage.setItem('pickle-practice', JSON.stringify(practice)); } catch(e) {} };
const FEED_DELAY = { fast:0.6, normal:1.4, slow:2.4 }, PACE = { slow:0.85, normal:1, fast:1.15 };

// ---------------- singles game settings (saved per browser)
const GAME_OPTS = { to:[[11,'11'],[15,'15'],[21,'21']], scoring:[['sideout','Side-out (standard)'],['rally','Rally scoring']], tier:[['deckhand','Deckhand · easy'],['bosun','Bosun · medium'],['captain','Captain · hard']] };
const gameDef = () => ({ to:11, scoring:'sideout', kitchen:true, twoBounce:true, marker:false, height:true, tier:'bosun' });
let gameCfg = gameDef();
try { const g = JSON.parse(localStorage.getItem('pickle-game') || 'null'); if (g && typeof g === 'object') for (const k in gameCfg) if (k in g && typeof g[k] === typeof gameCfg[k]) gameCfg[k] = g[k]; } catch(e) {}
const saveGameCfg = () => { try { localStorage.setItem('pickle-game', JSON.stringify(gameCfg)); } catch(e) {} };

// mode 'practice': you on the near side, the ball cannon restarts every rally, a CPU crew (or nobody) across the net.
// mode 'game': a singles game under the full rules. Attract mode plays games CPU vs CPU behind the menus.
function newMatch(islandId, attract, mode){
  const isl = ISLANDS.find(i => i.id === islandId) || ISLANDS[0];
  mode = attract ? 'game' : mode || 'practice';
  const cfg = attract ? { ...gameDef(), opp:'cpu' } : mode === 'game' ? { ...gameCfg, opp:'cpu' } : { kitchen:true, twoBounce:true, ...practice };
  G = { island:isl, theme:THEMES[isl.id], attract:!!attract, mode, state:'feed', stT:1.0, time:0,
    near:'home', hits:0, score:{ home:0, away:0 }, rally:0, best:0, shotN:0, aimPreview:null, feedTo:'home', lastCall:null,
    ball:mkBall(), landing:null, parts:[], pops:[], shake:0, cfg, cannon:{ x:CW/2, y:-3.4, z:2.5, kick:0 }, stats:{ rallies:0, longest:0, aces:0, strokes:0, faults:{}, faultBy:{ home:{}, away:{} } } };
  G.players = [mkPlayer('home', HOME.species, !attract), mkPlayer('away', isl.opp.species, false)];
  G.players[1].tier = AI_TIERS[cfg.tier] ? cfg.tier : 'bosun';
  G.players[0].tier = attract ? pick(['bosun', 'captain']) : 'bosun';   // the home side's CPU (attract mode, tests)
  if (attract) G.players[1].tier = pick(AI_ORDER);
  if (mode === 'game') {
    G.match = newScore({ to:cfg.to, scoring:cfg.scoring, server: Math.random() < 0.5 ? 'home' : 'away' });
    G.score = G.match.pts;
    G.cannon.y = -40;   // the cannon is stowed for games
    startPoint();
  }
}
const humanPl = () => G && !G.attract ? G.players.find(p => p.human) || null : null;
const other = tm => tm === 'home' ? 'away' : 'home';
// which team plays the near half (y > NETY); swaps when the ends change
const isNear = tm => tm === (G ? G.near : 'home');
const sideOf = y => y > NETY ? (G ? G.near : 'home') : other(G ? G.near : 'home');
const baseY = tm => isNear(tm) ? CL : 0;
const backDir = tm => isNear(tm) ? 1 : -1;   // the y direction away from the net, for this team
// the views stay behind the human: after the ends switch they look from the other baseline
const viewFlip = () => { const h = humanPl(); return !!h && !isNear(h.team); };
