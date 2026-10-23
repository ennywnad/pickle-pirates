// Pickle Pirates · Shared helpers, court geometry, content (crews, islands, booty), progression and saves
'use strict';
const $ = id => document.getElementById(id);
const cv = $('court'), ctx = cv.getContext('2d'), stage = $('stage'), app = $('app');

// ---------------- geometry (feet). x across the court (0..CW), y down the court (0..CL), z is height.
// The home crew plays the near half (y > NETY); the far half belongs to the other crew.
const CW = 20, CL = 44, NETY = 22, KD = 7;               // court width/length, net line, kitchen depth
const NET_H_SIDE = 3, NET_H_MID = 34/12, POST_OUT = 1;   // 36 in at the sidelines, 34 in at the center, posts 1 ft outside
const BALL_R = 0.122;                                     // 2.93 in ball
const PL_R = 1.1;                                         // player body radius
const netH = x => { const u = Math.abs(x - CW/2)/(CW/2 + POST_OUT); return NET_H_MID + (NET_H_SIDE - NET_H_MID)*u*u; };   // sag toward the middle
const inCourt = (x, y, m = 0) => x >= -m && x <= CW + m && y >= -m && y <= CL + m;
const inKitchen = (x, y) => Math.abs(y - NETY) <= KD;

const clamp = (v,a,b) => v<a?a:v>b?b:v;
const rand = (a,b) => a + Math.random()*(b-a);
const pick = a => a[Math.floor(Math.random()*a.length)];
const hyp = Math.hypot;

// ---------------- content
const ICON = {
  ball:'<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="14.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="12" cy="13" r="1.1" fill="currentColor"/><circle cx="8" cy="14.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="14" r="1.1" fill="currentColor"/>',
  paddle:'<rect x="5" y="2.5" width="11" height="13" rx="5"/><path d="M10.5 15.5v6"/><path d="M8.5 21.5h4"/>',
  anchor:'<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 11h10M4 14c0 4 3.5 7 8 7s8-3 8-7"/>',
  skull:'<path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.3 3 5.3V19h8v-3.7c1.7-1 3-2.7 3-5.3a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="10.5" r="1.4" fill="currentColor"/><circle cx="14.7" cy="10.5" r="1.4" fill="currentColor"/><path d="M10 19v2M14 19v2"/>',
  map:'<path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 3.5v14.5M15 6v14.5"/><path d="M11 10l2 2M13 10l-2 2"/>',
  star:'<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
};
const svg = (k, fill) => `<svg viewBox="0 0 24 24" fill="${fill?'currentColor':'none'}" stroke="currentColor" stroke-width="${fill?0:1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// first-draft booty (power-ups); none of them is wired up yet
const BOOTY = {
  cannonball:{ name:'Cannonball Shot', desc:'Your next drive leaves a smoke trail and skids on the bounce.' },
  pegleg:    { name:'Peg-Leg Spin',    desc:'Your next shot hooks hard after it bounces.' },
  ink:       { name:'Kraken Ink',      desc:'Blots the other crew\'s view for a few seconds.' },
  parrot:    { name:'Parrot Spotter',  desc:'A parrot shows where the next ball will land.' },
  anchor:    { name:'Anchor Drop',     desc:'Slows the other crew\'s footwork for a few seconds.' },
  fog:       { name:'Fog Bank',        desc:'Hides the ball in its flight across the net.' },
  treasure:  { name:'Treasure Map',    desc:'Marks a target zone worth bonus booty.' }
};

const HOME = { name:'Pickle Pirates', abbr:'PKL', species:'pickle', shirt:'#4d9a3a', trim:'#1b1410' };
const ISLANDS = [
  { id:'brine',   name:'Brine Bay',        court:'Harbor dock',              hazard:'Gulls snatch high lobs',          opp:{ name:'Barnacle Boys',       abbr:'BRN', species:'crab',     shirt:'#c8452c', trim:'#f4d8b0' } },
  { id:'wreck',   name:'Shipwreck Shoals', court:'A beached wreck\'s deck',  hazard:'Tilted deck: bounces kick downhill', opp:{ name:'Skeleton Scallywags', abbr:'SKL', species:'skeleton', shirt:'#3d3a46', trim:'#e9e2cc' } },
  { id:'cannon',  name:'Cannon Cove',      court:'Galleon main deck',        hazard:'Cannonballs splash target zones',  opp:{ name:'Powder Monkeys',      abbr:'PWD', species:'monkey',   shirt:'#7a4a24', trim:'#ffcf6a' } },
  { id:'volcano', name:'Volcano Isle',     court:'Black-rock court',         hazard:'Steam vents launch the ball',      opp:{ name:'Magma Mutineers',     abbr:'MAG', species:'magma',    shirt:'#8f1d10', trim:'#ffb070' } },
  { id:'kraken',  name:'Kraken\'s Reach',  court:'Floating raft',            hazard:'Tentacles rise through the court', opp:{ name:'Squid Squad',         abbr:'SQD', species:'squid',    shirt:'#5a2f7a', trim:'#f2a5e0' } },
  { id:'ghost',   name:'Ghost Galleon',    court:'Spectral deck',            hazard:'Fog hides the ball mid-flight',    opp:{ name:'The Drowned Crew',    abbr:'DRN', species:'ghost',    shirt:'#2c4a55', trim:'#a8f0e0' } },
  { id:'locker',  name:'Davy\'s Locker',   court:'Bubble court on the seabed', hazard:'All of the above, rotating',     opp:{ name:'Davy\'s Deep Ones',   abbr:'DPO', species:'deep',     shirt:'#14304a', trim:'#5fd0ff' } }
];
// per-island colors for the court and its surroundings (both views read these)
const THEMES = {
  brine:  { court:'#2f6f8f', kitchen:'#3a86a8', out:'#7a5a3a', line:'#f4f0e4', water:'#0f4c6a', deck:'#8a6a44', sky:'#9fd3e8', accent:'#ffc23a' },
  wreck:  { court:'#5a6b3a', kitchen:'#6f8248', out:'#6b4a2a', line:'#f2ead0', water:'#16586a', deck:'#6b4a2a', sky:'#c9d8c0', accent:'#ffb070' },
  cannon: { court:'#7a3a2a', kitchen:'#8f4a36', out:'#5a3a20', line:'#f4e8d0', water:'#124a66', deck:'#5a3a20', sky:'#f0c890', accent:'#ffcf6a' },
  volcano:{ court:'#2a2a30', kitchen:'#3a3a44', out:'#1a1414', line:'#ffd0a0', water:'#2a1410', deck:'#241a18', sky:'#ff8a50', accent:'#ff6a1a' },
  kraken: { court:'#3a5a7a', kitchen:'#4a6c90', out:'#6b5030', line:'#f0f4ff', water:'#0c3550', deck:'#6b5030', sky:'#7aa0c8', accent:'#c78cff' },
  ghost:  { court:'#2c4a55', kitchen:'#3a5c68', out:'#22343a', line:'#c8fff0', water:'#0a2228', deck:'#22343a', sky:'#3a5058', accent:'#a8f0e0' },
  locker: { court:'#14406a', kitchen:'#1c5284', out:'#0c2a44', line:'#dff6ff', water:'#06223a', deck:'#0c2a44', sky:'#0a3050', accent:'#5fd0ff' }
};
const SPECIES = {
  pickle:{ body:'#5aa83e', acc:'#2d5a1e' }, crab:{ body:'#d8553a', acc:'#f4d8b0' }, skeleton:{ body:'#efe8d4', acc:'#1b1520' },
  monkey:{ body:'#8a5a34', acc:'#e8c49a' }, magma:{ body:'#d0612a', acc:'#2b1a10' }, squid:{ body:'#b06ad0', acc:'#f2a5e0' },
  ghost:{ body:'#a8e8d8', acc:'#2c4a55' }, deep:{ body:'#3a7a9a', acc:'#5fd0ff' }
};

// ---------------- progression and save
const SKEY = 'pickle-pirates-save';
const defSave = () => ({ xp:0, stars:{}, plays:0, v:1 });
function normSave(s){
  const o = { ...defSave(), ...s };
  o.xp = Math.max(0, Number(o.xp)||0);
  o.plays = Math.max(0, Number(o.plays)||0);
  o.stars = (s && typeof s.stars==='object' && s.stars) ? { ...s.stars } : {};
  return o;
}
let save = defSave();
try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s && typeof s.xp === 'number') save = normSave(s); } catch(e) {}
let muted = false;
try { muted = localStorage.getItem('pickle-mute') === '1'; } catch(e) {}
const GAME_VERSION = 'v0.0.2';
// save codes: "PKP1." + base64url(JSON)
function exportSave(){ const j = JSON.stringify({ ...save, updatedAt:Date.now() }); return 'PKP1.' + btoa(unescape(encodeURIComponent(j))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function importSave(code){
  code = String(code || '').trim();
  if (!code.startsWith('PKP1.')) return { ok:false, msg:'That doesn’t look like a Pickle Pirates save code. It starts with PKP1.' };
  try {
    let b = code.slice(5).replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    const d = JSON.parse(decodeURIComponent(escape(atob(b))));
    if (!d || typeof d.xp !== 'number') throw new Error('bad');
    save = normSave(d); persist();
    return { ok:true };
  } catch(e) { return { ok:false, msg:'That save code is damaged or incomplete. Copy the whole thing and try again.' }; }
}
function persist(){ try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch(e) {} }
