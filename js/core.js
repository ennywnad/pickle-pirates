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
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  book:'<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8 7h7M8 10.5h5"/>',
  // island hazards (surface, then the Davy's Locker versions)
  hz_gull:'<path d="M2.5 10c3-3.2 6.2-3 9.5 1.5 3.3-4.5 6.5-4.7 9.5-1.5"/><path d="M12 11.5v1.5"/>',
  hz_manta:'<path d="M12 6.5c-2.6 0-5.5 2.8-9.5 4.5 3.8 1 6.8 2.4 9.5 6.5 2.7-4.1 5.7-5.5 9.5-6.5-4-1.7-6.9-4.5-9.5-4.5z"/><path d="M12 17.5v4"/><path d="M10 9.5h.01M14 9.5h.01"/>',
  hz_tilt:'<path d="M3 9.5l18 6"/><path d="M3 12.5l18 6"/><circle cx="8" cy="6" r="2"/><path d="M12 5.5h6m-2-2 2 2-2 2"/>',
  hz_current:'<path d="M2.5 8c2-2 4 2 6 0s4 2 6 0"/><path d="M2.5 13c2-2 4 2 6 0s4 2 6 0"/><path d="M2.5 18c2-2 4 2 6 0s4 2 6 0"/><path d="M18 6l3 2.5-3 2.5M18 15l3 2.5-3 2.5"/>',
  hz_cannon:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  hz_steam:'<path d="M4 20.5h16"/><path d="M8 20.5v-2.5M12 20.5v-2.5M16 20.5v-2.5"/><path d="M9 15c-1.6-1.8 1.6-3 0-5s1.6-3.2 0-5"/><path d="M15 15c-1.6-1.8 1.6-3 0-5s1.6-3.2 0-5"/>',
  hz_bubbles:'<circle cx="9" cy="16" r="3"/><circle cx="15" cy="10.5" r="2.2"/><circle cx="10" cy="6" r="1.6"/><circle cx="16.5" cy="18" r="1.4"/><path d="M3.5 21.5h17"/>',
  hz_tentacle:'<path d="M7 21.5c0-6.5 1.4-9.5 4.4-12.4 2.6-2.5 4.6-5.2 2.1-6.4-2.3-1.1-4 1.8-1.7 3.3"/><path d="M11 21.5c0-5 1.5-7.3 4-9.6"/><path d="M8.8 15.5h.01M10.6 12h.01M13 9.3h.01"/>',
  hz_fog:'<path d="M3.5 8.5h11"/><path d="M6.5 12.5h14"/><path d="M3 16.5h12"/><path d="M8 20.5h9"/><path d="M9 4.5h7"/>',
  hz_fish:'<path d="M2.5 12c3-4 8.5-5 13 0-4.5 5-10 4-13 0z"/><path d="M15.5 12l5-3.5v7z"/><path d="M6.5 11h.01"/><path d="M14 4.5c1.4-1.6 3.6-1.8 5.5 0-1.9 1.8-4.1 1.6-5.5 0zM15 19.5c1.4-1.6 3.6-1.8 5.5 0-1.9 1.8-4.1 1.6-5.5 0z"/>',
  // booty
  bt_cannonball:'<circle cx="10.5" cy="13.5" r="7"/><path d="M15.5 8.5l3-3"/><path d="M18.5 5.5l2-.5M18.5 5.5l.5-2"/><path d="M7.5 11a3 3 0 0 1 3-3"/>',
  bt_pegleg:'<path d="M5 13a7 7 0 1 0 7-7"/><path d="M12 6l-2.5-2.5M12 6l-2.5 2.5"/><path d="M12 10v5.5"/><circle cx="12" cy="17" r="1.5"/>',
  bt_ink:'<path d="M12 3c2.5 3.2 6.5 3.5 6.5 7.5 0 3-2 3.3-1.2 6.2.8 3.1-3.5 4.8-5.3 2.8-1.8 2-6.4.6-5.6-2.7.6-2.6-1.9-3.5-1.4-6.3C5.6 6.6 9.8 6.4 12 3z"/><circle cx="20" cy="20" r="1"/><circle cx="4" cy="20.5" r=".8"/>',
  bt_parrot:'<path d="M7 21c0-6.5 2-12.5 8-13.5 3.3-.5 5.5 2 5.5 5h-4.2c-2.2 0-3.3 2.2-3.3 4.4V21"/><path d="M20.5 12.5l-1.6 2.4"/><path d="M15.5 10.5h.01"/><path d="M7 21H4"/>',
  bt_anchor:'<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 11h10M4 14c0 4 3.5 7 8 7s8-3 8-7"/>',
  bt_fog:'<path d="M3.5 8.5h11"/><path d="M6.5 12.5h14"/><path d="M3 16.5h12"/><circle cx="18" cy="6" r="1.6"/>',
  bt_treasure:'<path d="M3.5 11h17v9h-17z"/><path d="M3.5 11c0-3.3 3.8-6 8.5-6s8.5 2.7 8.5 6"/><path d="M10.5 13.5h3v3h-3z"/><path d="M3.5 15h7M13.5 15h7"/>'
};
const svg = (k, fill) => `<svg viewBox="0 0 24 24" fill="${fill?'currentColor':'none'}" stroke="currentColor" stroke-width="${fill?0:1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// booty (power-ups): see js/booty.js
const BOOTY = {
  cannonball:{ name:'Cannonball Shot', desc:'Your next drive, smash or serve trails smoke and skids low and fast off the bounce.' },
  pegleg:    { name:'Peg-Leg Spin',    desc:'Your next shot kicks hard sideways when it bounces (after the bounce, so the call is the same).' },
  ink:       { name:'Kraken Ink',      desc:'Squirts ink over the other crew\'s view for 4 seconds. A CPU crew misreads the ball.' },
  parrot:    { name:'Parrot Spotter',  desc:'For 8 seconds your crew sees a ring where every ball will land.' },
  anchor:    { name:'Anchor Drop',     desc:'The other crew runs at two-thirds speed for 5 seconds.' },
  fog:       { name:'Fog Bank',        desc:'Your next shot vanishes once it crosses the net, until it bounces or is hit.' },
  treasure:  { name:'Treasure Map',    desc:'Puts an X on the other side of the court. Land a shot in it and you get another crate.' }
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
// the second set of colors a crew wears when it plays itself (a mirror match)
const ALT_PAL = {
  pickle:{ body:'#9cc23e', acc:'#4a6a1a', stripe:'#2f6fb8', hat:'#8a1e1a', shirt:'#f0e6c8' }, crab:{ body:'#3f7fd0', acc:'#d8ecff', leg:'#2c5aa0' }, skeleton:{ body:'#c8b48a', acc:'#3a1a10' },
  monkey:{ body:'#5a5a62', acc:'#d8d0c0' }, magma:{ body:'#3a78e0', acc:'#10203a' }, squid:{ body:'#d05a6a', acc:'#ffd0b8' },
  ghost:{ body:'#d0b0f0', acc:'#3a2a55' }, deep:{ body:'#9a4a7a', acc:'#ffb04a' }
};
// every crew you can pick: the Pickle Pirates, their rivals Dill Rogers' crew, and each island's home crew
const CREW_LIST = [
  { id:'pickle', ...HOME },
  { id:'dill', name:'Dill Rogers\' Crew', abbr:'DIL', species:'pickle', shirt:'#2f6fb8', trim:'#8a1e1a', pal:ALT_PAL.pickle },
  ...ISLANDS.map(I => ({ id:I.id, ...I.opp }))
];
const crewById = id => CREW_LIST.find(c => c.id === id) || null;
// who plays: `home` and `away` are crew ids ('island' for the island's own crew). The same crew on both sides: the
// away side wears its other colors (the Pickle Pirates' other crew is Dill Rogers').
function resolveCrews(homeId, awayId, isl){
  const home = crewById(homeId) || crewById('pickle');
  let away = awayId && awayId !== 'island' ? crewById(awayId) : null; if (!away) away = crewById(isl.id) || crewById('brine');
  if (away.id === home.id) away = home.id === 'pickle' ? crewById('dill') : home.id === 'dill' ? crewById('pickle')
    : { ...away, id:away.id + '-alt', name:'Rival ' + away.name, shirt:ALT_PAL[away.species].body, trim:ALT_PAL[away.species].acc, pal:ALT_PAL[away.species] };
  return { home, away };
}

// ---------------- progression and save
const SKEY = 'pickle-pirates-save';
const LIFE_KEYS = ['games', 'wins', 'rallies', 'longest', 'won', 'winners', 'aces', 'errors', 'kitchen', 'booty', 'bestRun'];
const defSave = () => ({ xp:0, stars:{}, plays:0, v:1, record:{}, seenHow:false, life:{} });   // record: { tier: { w, l } } from finished singles games
function normSave(s){
  const o = { ...defSave(), ...s };
  o.xp = Math.max(0, Number(o.xp)||0);
  o.plays = Math.max(0, Number(o.plays)||0);
  o.stars = (s && typeof s.stars==='object' && s.stars) ? { ...s.stars } : {};
  o.record = {};
  for (const t of ['deckhand', 'bosun', 'captain']) { const r = s && s.record && s.record[t]; o.record[t] = { w:Math.max(0, Number(r && r.w)||0), l:Math.max(0, Number(r && r.l)||0) }; }
  o.seenHow = !!(s && s.seenHow);
  o.life = {}; for (const k of LIFE_KEYS) o.life[k] = Math.max(0, Number(s && s.life && s.life[k]) || 0);   // lifetime stats (your crew's side)
  return o;
}
let save = normSave({});
try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s && typeof s.xp === 'number') save = normSave(s); } catch(e) {}
let muted = false;
try { muted = localStorage.getItem('pickle-mute') === '1'; } catch(e) {}
const GAME_VERSION = 'v1.0.0';
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
