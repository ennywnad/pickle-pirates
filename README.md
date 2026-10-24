# Pickle Pirates

Arcade pickleball between pirate crews, in the browser. Real rules underneath (the kitchen, the two-bounce rule, serve rotation), arcade chaos on top. Your crew is the Pickle Pirates, cucumbers in eye patches and tricorn hats, sailing to seven island courts and the Davy's Locker Cup.

**Play:** https://ennywnad.github.io/pickle-pirates/

## Status

Milestones 1–11 of 12 are done: v1.0 is live, from the dock to the Davy's Locker Cup. Fight mode (milestone 12) is still to be designed. What changed in each version is in the [changelog](CHANGELOG.md).

- **The skeleton:** a placeholder dock court in a comic-book 3D view and a classic top-down view.
- **The ball:** real drag and spin lift, a bounce that grips or skids depending on spin, a net cord the ball can roll over, and line-is-in calls.
- **The ball cannon:** Practice feeds serves, drives, drops, dinks and lobs, with your choice of placement, spin, pace and timing.
- **Hitting:** press a shot as the ball comes and the game times the swing, with a move-to-ball assist, split steps, lunges and aim.
- **Rules and scoring:** full singles games under the 2026 rulebook: serving order, the kitchen, the two-bounce rule, side-out or rally scoring, switching ends.
- **CPU opponent:** three crew levels (Deckhand, Bosun, Captain) that read the ball, come to the net, dink, speed up, drop and lob, and lose in believable ways.

- **v0.1, Brine Bay:** play the Barnacle Boys (crabs) on the harbor dock, with a town, a lighthouse, moored boats, the crew's own ship and gulls. Also the first sound pack and a shanty band, a How to play guide, and your record against each crew level.

- **v0.2, doubles and two players:** two a side with the real server rotation and three-number score, CPU partners that split the court, and two-player co-op or P1 vs P2 on one keyboard or two controllers.

- **v0.3, crews and swings:** all seven crews (crabs, skeletons, powder monkeys, magma men, squid, ghosts and anglerfish), arms that swing a paddle, a separate swing for every shot that meets the ball on the contact frame, and celebrations between points.

- **v0.4, islands and hazards:** all seven islands have their own set and hazard.
- **v0.5, booty:** win a rally of 6+ shots for a power-up crate, then press Booty (E, or B on a controller): Cannonball Shot, Peg-Leg Spin, Kraken Ink, Parrot Spotter, Anchor Drop, Fog Bank or Treasure Map. Plus a deck swabber who mops between points.

Play-test fixes (milestone 10) come next: steam vents you can recognize, underwater hazards for Davy's Locker, in-game explanations of every hazard and power-up, and pickle-vs-pickle matches. Then Voyage (v1.0) and fight mode.

| Island | Court | Hazard |
|---|---|---|
| Brine Bay | Harbor dock | Gulls snatch high lobs and drop them somewhere else on the far side, still in play |
| Shipwreck Shoals | A beached wreck's deck | The deck tilts: every bounce kicks the ball downhill, and loose balls roll that way |
| Cannon Cove | A galleon's main deck | Cannonballs splash marked rings: anyone inside is knocked back and stunned |
| Volcano Isle | Black-rock court | Steam vents puff on a timer: a bounce on a live vent launches the ball |
| Kraken's Reach | A raft of logs | Tentacles rise through the court: the ball bounces off them, players can't pass |
| Ghost Galleon | A spectral deck | Fog banks drift across and hide the ball |
| Davy's Locker | The seabed | All of the above, changing every three rallies |

Hazards never change a rule: the ball is still called in or out where it lands, and the score moves only by the rules. The landing marker, the CPU and the move-to-ball assist all see the tilt, the vents and the tentacles, because they're part of the ball physics. Hazards are on in games and off by default in Practice; both setups have a switch.

| Level | How it plays |
|---|---|
| Deckhand · easy | Slow first step, rough reads, early swings, pops up about one dink in four, often stays back |
| Bosun · medium | Comes to the net most points, punishes high balls, occasional rushed swing |
| Captain · hard | Reads the ball early, plays from the kitchen line, rarely misses, serves deep to your backhand |

Pick the level on the dock's Brine Bay card, in a custom game, or in the Practice settings. `tests/ai.mjs` checks the ladder (each level beats the one below), plays each level against a bot that plays like a decent human (it should beat the Deckhand and lose to the Captain), checks the styles, and runs a 20-game soak.

| # | Milestone | Done when |
|---|-----------|-----------|
| 1 | Repo and skeleton | Both views render on Pages and CI passes |
| 2 | Ball and court | Tuning sliders give believable dinks, drives and lobs |
| 3 | Hitting | You can rally with the ball cannon |
| 4 | Rules and scoring (singles) | A full game to 11 plays out correctly |
| 5 | CPU opponent | The CPU wins and loses believably |
| 6 | First playable, v0.1 | Brine Bay, singles vs the Barnacle Boys |
| 7 | Doubles and two players | A doubles game scores correctly in every rotation |
| 8 | Crews and swings | Every shot type has its own swing |
| 9 | Islands, hazards and booty | Each island plays differently |
| 10 | Play-test fixes: clear islands, an underwater Locker, crew choice | A new player can say what every hazard and power-up does without leaving the game, and a pickle-vs-pickle match plays on any island |
| 11 | Voyage and polish, v1.0 | A new player can reach the Davy's Locker Cup |
| 12 | Fight mode | You can win the other crew's ship and play your next match on its deck |

## Controls (for now)

| Action | Keyboard | Controller | Touch |
|--------|----------|------------|-------|
| Move | WASD / arrows | Left stick / D-pad | Drag on the left side |
| Aim | I J K L | Right stick (centered = auto) | — |
| Drive | Space | A / RT | Hit |
| Dink · drop | Shift | X | Soft |
| Lob | Q | Y | Lob |
| Topspin · slice (hold while hitting) | R · F | RB · LB | — |
| Pause · mute · tuning | P / Esc · M · ` | Start | Pause button |
| Menus | Mouse, Enter, Esc | D-pad or left stick to move, A to pick, B to go back | Tap |

Keys and buttons can be remapped under Controls.

**Two players** (Versus): with two controllers, each player gets one. With one controller, P1 has the keyboard and P2 the controller. With none, the keyboard splits:

| | P1 (left) | P2 (right) |
|---|---|---|
| Move | WASD | Arrows |
| Drive | F or Space | / or Numpad 0 |
| Soft | G | . |
| Lob | Q | ; |

P1 against P2 uses a side-on camera so neither end is favored.

### How hitting works

You choose the shot and where it goes; the game swings at the best moment.

1. **Press a shot early.** Pressing up to about half a second before the ball arrives is perfect; the press waits up to about a second for the ball.
2. **Hold Drive for power.** Harder drives are riskier.
3. **Get the stick out of the way if you like.** With the left stick centered, the move-to-ball assist runs you to a good contact spot. Between points it sends you back to the baseline (or keeps you at the kitchen line mid-rally). Hold Plant to stay put.
4. **What sets each shot's quality:** your timing, the ball's height (waist-high is best), how far you're stretching, how fast it's coming and how fast you're running. Quality decides how far the shot strays from your target. Very poor contact mishits.
5. **Situational shots:** a high ball near the net becomes a smash. Soft is a dink from the kitchen and a drop from further back. The serve and the return must bounce before you hit them (the two-bounce rule).

Timing grades (perfect, early, late, stretch) pop up over your player. The ring at your feet lights up when the ball is in reach, and the reticle shows where a manually aimed shot is headed.

### Rules the game enforces

From the 2026 official rulebook (USA Pickleball text). The kitchen and two-bounce rules can be switched off in Practice and in a singles game.

| Rule | What the game does | Rulebook |
|---|---|---|
| Scoring | Side-out by default (only the server scores); rally scoring as an option; games to 11, 15 or 21, win by 2 | 4.A, 4.B, 14.A |
| Serve position | Right court on the server's even score, left on odd; receiver diagonally across | 4.B |
| Serve | Must land in the diagonal service court; the kitchen line is short, other lines are in | 7.A–7.E |
| Two-bounce | The serve and the return must bounce before they're hit | 10.A |
| Kitchen | No volleying with a foot in the kitchen or on its line, or being carried into it by the volley (any direction, even after the ball is dead) | 11.A |
| Faults | Out, net, short serve, wrong court, post, double bounce | 10.B, 11.A |
| Ends | Switch when the first side reaches 6 (8 in a game to 15, 11 in a game to 21) | 21.B |
| Doubles order | Starts 0–0–2 with one server; partners each serve before a side out; the player in the right court serves first after a side out | 4.B, 5.B |
| Doubles positions | The starting server is in the right court when the team's score is even, so the serving pair swaps sides only when it scores; the receiver is diagonally across | 4.B |
| Doubles score call | Serving team, receiving team, server number (side-out); two numbers in rally scoring, one server per side out | 6.B.2, 14 |

`tests/rules.mjs` checks each rule, and runs 300 random doubles games against an independent referee's notebook of who stands where. `tests/game.mjs` plays full singles and doubles games and checks every serve, server, court, receiver and point.

## Ball physics

The ball is tuned to published pickleball measurements, and `tests/ball.mjs` checks it against them on every push:

| | Game default | Real-world target |
|---|---|---|
| Drag coefficient | 0.31 | 0.30–0.33 for outdoor 40-hole balls, ~0.45 indoor ([Steyn et al. 2025](https://arxiv.org/abs/2501.00163), [TWU](https://twu.tennis-warehouse.com/learning_center/pickleball/pickleball_aerodynamics.php)) |
| Spin lift | CL = 0.195 · Rω/v | CL ≈ 0.195 · S (Steyn et al.) |
| Bounce | 31 in from a 78 in drop | 30–34 in ([USA Pickleball equipment standards](https://www.pickleball.ph/uploads/1/2/5/9/125919777/-_official_equipment_standards_manual.pdf)) |
| Serve | 42 mph | 40–54 mph (Steyn et al.) |
| Third-shot drop | ~22 mph at ~31° into mid-kitchen | 24–36 mph at 12–22° anywhere in the kitchen (Steyn et al.) |
| Drive | 46 mph with 1,200 rpm topspin, arrives at ~67% of launch speed | a 54 mph serve lands at ~31 mph ([Pickleball Science](https://pickleballscience.org/?p=1399)) |

Every number is a live slider under Feel tuning (the \` key or the pause menu).

## Running it

It's static files with no build step: three.js r180 is vendored under `vendor/three`.

```sh
npm run serve        # http://localhost:8123
npm install && npm test   # ball, rules, hitting, full-game and CPU checks, then the Playwright smoke test against the running server
node tests/ai.mjs         # the full CPU run: ladder, vs the bot, styles, 20-game soak (a few minutes)
```

Add `?debug` to the address for test hooks on `window.__sim`.

## Layout

The engine around the sport (renderer core, cel shading and ink, post-processing, audio, input, menus, tests and deploy) comes from [Rink Rat Mayhem](https://github.com/ennywnad/rink-rat-mayhem); the sport itself is new.

```
js/core.js        helpers, court geometry, crews, islands, booty list, saves
js/audio.js       mixer, crowd, sound effects, music cues
js/match.js       match state, tuning sliders, accessibility
js/ball.js        ball flight, spin, bounces, net, line calls, launch solvers
js/shots.js       contact window, auto-timed swing, shot quality and errors, aim
js/swings.js      the paddle's path for every shot (backswing, contact, follow-through) and celebrations
js/rules.js       the rules engine: scoring, serving, two-bounce, kitchen, ends (pure, tested on its own)
js/referee.js     runs points: serving, faults and calls, side outs, switching ends, the ball cannon
js/players.js     footwork, move-to-ball assist, kitchen guard
js/hazards.js     the islands' hazards: gulls, tilt, cannon fire, steam vents, tentacles, fog
js/booty.js       power-ups: earning crates, the seven effects, the CPU using them
js/ai.js          the CPU: three levels, reading the ball, positioning, shot choice, serves
js/input.js       remappable keys, controllers, touch, controls screen
js/update.js      per-frame step
js/render2d.js    classic top-down view, scoreboard
js/render3d.js    3D court (WebGPU, WebGL2 fallback)
js/overlay.js     HUD over the 3D view, graphics settings
js/ui.js, js/main.js
```

Every sound in `assets/sfx` is generated by `tools/gen_sfx.py` (numpy, scipy, ffmpeg), seeded so the output is reproducible:

- **Play:** paddle pops (dinks, drives, smashes), ball bounces on the dock planks, the net, the net cord, the dock pilings, the ball cannon, and a splash when a ball leaves the dock.
- **The referee parrot:** one squawk for a call, two for a fault, a whistle for a winner or an ace. The ship's bell rings on a side out.
- **The harbor:** a looping bed of water at the pilings, creaking planks, distant gulls and a small dockside crowd, which builds as a rally runs long. Cheers come with shouts of "Arrr!".
- **The shanty band:** squeezebox, fiddle, plucked bass, foot stomps and a tambourine, playing original tunes in the cue slots: match start, a long rally, point won, point lost, game won, a noodle when the ends switch, and a 16-bar menu loop.

```sh
python3 tools/gen_sfx.py            # everything
python3 tools/gen_sfx.py --sfx      # effects only; --band for music only; or name sounds: paddle bell
```

## License

MIT
