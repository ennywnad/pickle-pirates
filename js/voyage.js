// Pickle Pirates · Voyage: the career. Seven matches, one per island, ending with the Davy's Locker Cup.
// Each match has three stars: win it, meet the island's objective, and win by 5 or more. Winning a match opens the next
// island. Stars unlock booty: the Voyage starts with three power-ups and adds the rest as the stars pile up.
// Voyage plays the rules straight (kitchen and two-bounce on, side-out scoring, no landing marker).
'use strict';
const VOYAGE = [
  { island:'brine',   tier:'deckhand', to:11, obj:{ id:'winners',   n:3, text:'Hit 3 winners', tip:'A winner is a shot they can\'t return. Aces count.' } },
  { island:'wreck',   tier:'deckhand', to:11, obj:{ id:'longrally', n:8, text:'Win a rally of 8 shots or more', tip:'Keep it in play: dinks and drops until they miss.' } },
  { island:'cannon',  tier:'bosun',    to:11, obj:{ id:'nostun',         text:'Never get caught by a cannonball', tip:'Step out of the red rings before they land.' } },
  { island:'volcano', tier:'bosun',    to:11, obj:{ id:'crates',    n:2, text:'Earn 2 booty crates', tip:'Each rally of 6 shots or more that you win earns one.' } },
  { island:'kraken',  tier:'bosun',    to:11, obj:{ id:'nokitchen',      text:'Win without a kitchen fault', tip:'No volleys with a foot in the kitchen.' } },
  { island:'ghost',   tier:'captain',  to:11, obj:{ id:'streak',    n:4, text:'Win 4 rallies in a row', tip:'Rallies count on either side\'s serve.' } },
  { island:'locker',  tier:'captain',  to:15, cup:true, obj:{ id:'used', n:3, text:'Use 3 booty power-ups', tip:'Earn crates with long rallies, then press Booty.' } },
];
const VOYAGE_MARGIN = 5;
// booty unlocks: [stars needed, power-up]
const VOYAGE_UNLOCKS = [[0, 'cannonball'], [0, 'pegleg'], [0, 'parrot'], [3, 'ink'], [6, 'anchor'], [9, 'fog'], [12, 'treasure']];
const STAR_NAMES = ['Win the match', null, `Win by ${VOYAGE_MARGIN} or more`];
const voyLeg = i => VOYAGE[i] || null;
const voyStars = id => { const s = save.stars && save.stars[id]; return Array.isArray(s) ? [0, 1, 2].map(k => !!s[k]) : [false, false, false]; };
const voyTotal = () => VOYAGE.reduce((n, L) => n + voyStars(L.island).filter(Boolean).length, 0);
const voyUnlocked = (n = voyTotal()) => VOYAGE_UNLOCKS.filter(([need]) => n >= need).map(([, k]) => k);
const voyOpen = i => i === 0 || (i > 0 && i < VOYAGE.length && voyStars(VOYAGE[i - 1].island)[0]);
const voyNext = () => { const i = VOYAGE.findIndex(L => !voyStars(L.island)[0]); return i < 0 ? null : i; };
const voyCupWon = () => voyStars(VOYAGE[VOYAGE.length - 1].island)[0];
// the match settings for a leg (applied over the custom-game settings for this one game)
const voyOver = L => ({ to:L.to, scoring:'sideout', kitchen:true, twoBounce:true, marker:false, tier:L.tier, hazards:true, booty:true });

// per-team counters the objectives read (kept for every game; cheap)
const teamStats = () => ({ winners:0, streak:0, bestStreak:0, longWin:0, stunned:0, crates:0, used:0, kitchen:0 });
function statRally(winner, loser, kind){
  const T = G.stats.team; if (!T) return;
  const w = T[winner], l = T[loser];
  if (kind === 'double bounce' || kind === 'ace') w.winners++;
  if (kind === 'kitchen') l.kitchen++;
  w.streak++; w.bestStreak = Math.max(w.bestStreak, w.streak); l.streak = 0;
  w.longWin = Math.max(w.longWin, G.rally);
}
const statAdd = (team, k, n = 1) => { const T = G && G.stats && G.stats.team; if (T && T[team]) T[team][k] += n; };

// how the objective stands: { have, need, done, failed, text }
function voyProgress(){
  const V = G && G.voyage; if (!V) return null;
  const O = V.obj, T = G.stats.team.home;
  switch (O.id) {
    case 'winners':   return { have:T.winners, need:O.n, done:T.winners >= O.n };
    case 'longrally': return { have:T.longWin, need:O.n, done:T.longWin >= O.n, best:true };
    case 'crates':    return { have:T.crates, need:O.n, done:T.crates >= O.n };
    case 'streak':    return { have:T.bestStreak, need:O.n, done:T.bestStreak >= O.n, best:true };
    case 'used':      return { have:T.used, need:O.n, done:T.used >= O.n };
    // "never" objectives: met until something breaks them, and only settled when the match is won
    case 'nostun':    return { have:T.stunned, need:0, done:false, failed:T.stunned > 0, never:true };
    case 'nokitchen': return { have:T.kitchen, need:0, done:false, failed:T.kitchen > 0, never:true };
  }
  return null;
}
function voyProgressText(){
  const P = voyProgress(); if (!P) return '';
  if (P.never) return P.failed ? 'missed' : 'so far so good';
  return P.done ? 'done!' : P.best ? `best ${P.have} of ${P.need}` : `${P.have} of ${P.need}`;
}
// called every frame in a Voyage match: say so the moment the objective is met (or missed)
function voyWatch(){
  const V = G.voyage; if (!V || G.attract || V.told) return;
  const P = voyProgress(); if (!P) return;
  if (P.done) { V.told = 'done'; if (typeof toast === 'function') toast('Objective done!', V.obj.text, 1800, 'small booty'); if (typeof sfx === 'function') sfx('pickup'); }
  else if (P.failed) { V.told = 'failed'; if (typeof toast === 'function') toast('Objective missed', V.obj.text, 1600, 'small'); }
}
// the match is over: work out the stars, keep the best ever for this island, and report what's new
function voyFinish(){
  const V = G.voyage; if (!V || V.finished) return V && V.result;
  V.finished = true;
  const S = G.match, won = S.winner === 'home', P = voyProgress();
  const obj = won && (P.never ? !P.failed : P.done), margin = won && S.pts.home - S.pts.away >= VOYAGE_MARGIN;
  const got = [won, obj, margin], before = voyStars(V.island), beforeTotal = voyTotal(), unlockedBefore = voyUnlocked();
  save.stars[V.island] = before.map((b, k) => b || got[k]); persist();
  const after = voyStars(V.island), total = voyTotal();
  V.result = { got, fresh:after.map((b, k) => b && !before[k]), total, gained:total - beforeTotal,
    unlocked:voyUnlocked().filter(k => !unlockedBefore.includes(k)), cup:!!V.cup && won, firstCup:!!V.cup && won && !before[0],
    next:won && V.leg + 1 < VOYAGE.length ? V.leg + 1 : null };
  return V.result;
}
