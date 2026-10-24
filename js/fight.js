// Pickle Pirates · Fight mode: boarding duels for the other crew's ship.
// You start in a rowboat. Each fight is against the crew holding the next ship up (a sloop, a brigantine, a galleon),
// played on your own deck. It's a singles match with rally scoring, but nobody plays to 11: every rally won fires a
// broadside into the other ship. A long rally (12+ shots), an ace or a smash winner fires a double broadside. The first
// ship to sink loses, and if it's theirs, the ship is yours: your next fight is played on its deck, with its bigger hull.
// The rules of play don't change (the kitchen, two bounces, faults); only how the match ends.
'use strict';
const SHIPS = [
  { id:'rowboat', name:'Rowboat',    title:'the Pickle Pirates\' rowboat', hull:6, masts:0, cannons:0, deck:'A rowboat lashed to a raft' },
  { id:'sloop',   name:'Sloop',      title:'the Salty Sloop',              hull:8, masts:1, cannons:2, deck:'A sloop\'s deck', crew:'brine',  tier:'deckhand' },
  { id:'brig',    name:'Brigantine', title:'the Black Brig',               hull:10, masts:2, cannons:4, deck:'A brigantine\'s deck', crew:'wreck', tier:'bosun' },
  { id:'galleon', name:'Galleon',    title:'the Kraken\'s Crown',          hull:12, masts:3, cannons:6, deck:'A galleon\'s main deck', crew:'kraken', tier:'captain' },
];
const FIGHT_DOUBLE = 12;   // shots in a rally for a double broadside
const fleetShip = () => Math.min(SHIPS.length - 1, Math.max(0, (save.fleet && save.fleet.ship) | 0));
const fleetDone = () => fleetShip() === SHIPS.length - 1;
// the next fight: the crew holding the next ship up (or, with the whole fleet, any crew coming for your galleon)
function nextFight(){
  const mine = fleetShip();
  if (mine < SHIPS.length - 1) { const prize = SHIPS[mine + 1]; return { home:SHIPS[mine], prize, crew:prize.crew, tier:prize.tier, defend:false }; }
  const crews = ['brine', 'wreck', 'cannon', 'volcano', 'kraken', 'ghost', 'locker'], crew = crews[((save.fleet.fights || 0)*3) % crews.length];
  return { home:SHIPS[mine], prize:{ ...SHIPS[mine], title:`a ${crewById(crew).name} galleon` }, crew, tier:'captain', defend:true };
}
// the court for a fight: your ship's deck (an island the views know how to draw)
function fightIsland(F){
  const S = F.home, c = crewById(F.crew);
  return { id:'ship_' + S.id, name:S.title.replace(/^the /, 'The '), court:S.deck, hazard:'Broadsides', opp:{ name:c.name, abbr:c.abbr, species:c.species, shirt:c.shirt, trim:c.trim }, ship:true };
}
const fightOver = F => ({ to:11, scoring:'rally', kitchen:true, twoBounce:true, marker:false, tier:F.tier, hazards:false, booty:true });
function newFight(F){
  G.fight = { ...F, hull:{ home:F.home.hull, away:F.prize.hull }, max:{ home:F.home.hull, away:F.prize.hull }, shots:{ home:0, away:0 }, log:[] };
  G.match.to = 999; G.match.switchAt = 99;   // the hulls decide it, not the score (and nobody switches ends)
}
// a rally is over in a fight: the winner's broadside hits the loser's hull; a sunk hull ends the match
function fightRally(winner, kind, res){
  const F = G.fight; if (!F) return;
  const loser = other(winner), big = G.rally >= FIGHT_DOUBLE || kind === 'ace' || (kind === 'double bounce' && G.lastShot && G.lastShot.kind === 'smash' && G.lastShot.team === winner);
  const dmg = big ? 2 : 1;
  F.hull[loser] = Math.max(0, F.hull[loser] - dmg); F.shots[winner] += dmg; F.log.push({ winner, dmg });
  F.lastHit = { team:loser, t:G.time, dmg };
  // the broadside: smoke from the winner's rail, splashes and splinters along the loser's half
  const side = Math.random() < 0.5 ? -1.5 : CW + 1.5, ly = isNear(loser) ? NETY + 12 : NETY - 12;
  for (let k = 0; k < 10*dmg; k++) G.parts.push({ x:side + rand(-1, 1), y:ly + rand(-9, 9), z:rand(0.5, 2), vx:rand(-3, 3), vy:rand(-3, 3), vz:rand(6, 13), life:0.9, max:0.9, s:rand(0.25, 0.6), c:k % 3 ? '#dff3ff' : '#7a5a3a' });
  G.shake = Math.max(G.shake || 0, 0.35 + 0.25*dmg);
  if (!G.attract && typeof sfx === 'function') { sfx('cannon'); sfx('splash', 0.7); }
  if (F.hull[loser] <= 0) { G.match.over = true; G.match.winner = winner; res.gameOver = true; res.sideOut = false; res.switchEnds = false; res.sunk = loser; }
  else if (typeof announce === 'function') announce(dmg > 1 ? 'Double broadside!' : 'Broadside!', `${teamName(loser)}: hull ${F.hull[loser]} of ${F.max[loser]}`, 1100);
}
// the match is over: take the ship (or not)
function fightFinish(){
  const F = G.fight; if (!F || F.finished) return F && F.result;
  F.finished = true;
  const won = G.match.winner === 'home';
  save.fleet.fights = (save.fleet.fights || 0) + 1;
  if (won) save.fleet.wins = (save.fleet.wins || 0) + 1;
  const took = won && !F.defend;
  if (took) save.fleet.ship = Math.min(SHIPS.length - 1, fleetShip() + 1);
  persist();
  F.result = { won, took, ship:took ? SHIPS[fleetShip()] : null, defend:F.defend, fleet:fleetDone() };
  return F.result;
}
