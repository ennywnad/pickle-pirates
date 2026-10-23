# Changelog

What changed in each version of Pickle Pirates, newest first. Each version finishes one milestone from the [README](README.md#status).

## v0.0.4 · Rules and scoring (milestone 4) · 2026-10-23

You can now play a full singles game under the 2026 official rules.

**Singles game**
- A new **Singles game** on the dock. Pick the island, a game to 11, 15 or 21, and side-out (standard) or rally scoring.
- Side-out scoring: only the serving side scores, and losing a rally on serve passes the serve. Rally scoring: every rally scores.
- Win by 2.
- The ends switch when the first side reaches 6 (8 in a game to 15, 11 in a game to 21). Both views turn around so you always play from your own end.
- A results card at the end shows the score, rallies, side outs, longest rally, aces and faults, with a rematch button.
- Behind the menus, the CPU crews now play real games.

**Serving**
- The server serves from the right court on an even score and the left on odd. The receiver waits diagonally across.
- Press Drive for a hard serve, Soft for a slower deep one, or Lob for a lob serve. The aim stick picks the spot.
- A serve must land in the diagonal service court past the kitchen line. The kitchen line is short; the other lines are in.

**Faults and calls**
- New calls: out, net, short, fault, kitchen, two bounce, post, double bounce, ace.
- Big moments get announced: side out, game point, switch ends, game.
- Kitchen rule: volleying with a foot in the kitchen, or stepping in right after a volley, is a fault.
- The kitchen glows red when a volley from where you stand would fault. The CPU and the move-to-ball assist never plan a volley from the kitchen.
- Two-bounce rule: the serve and the return must bounce before they're hit.
- The kitchen and two-bounce rules can be switched off in Practice and in a singles game.

**Scoreboard**
- Shows the score call (server's score first), who is serving, the game format, game point, and "Your serve" prompts.

**Tests**
- `tests/rules.mjs` checks every rule on its own.
- `tests/game.mjs` plays full CPU-vs-CPU games (to 11 side-out, to 11 rally, to 15) and checks each serve and point against the rules, plus the kitchen faults.
- The smoke test plays a singles game in both views.

**Plan**
- Added milestone 11, fight mode: win the other crew's ship and play your next match on its deck.

## v0.0.3 · Hitting (milestone 3) · 2026-10-23

Press a shot as the ball comes and the game times the swing.

**Shots**
- A shot press waits up to about a second and swings at the best contact moment.
- Pressing up to about half a second before contact is perfect; much earlier, or at the last instant, strays more.
- Shot quality comes from timing, ball height (waist-high is best), stretch, incoming pace and your running speed. Quality sets how far the shot strays from its target, and very poor contact mishits.
- Hold Drive for more power, at more risk.
- A high ball near the net becomes a smash. Soft plays a dink at the kitchen and a drop from further back.
- Hold R or F (RB or LB) while hitting for topspin or slice.
- Aim with I J K L or the right stick. Aim assist keeps manual aim inside the lines, and auto-aim plays away from the opponent.

**Footwork**
- The move-to-ball assist runs you to a good contact spot.
- Between points it walks you back to the baseline; mid-rally it holds the kitchen line if you're up there.
- The other player split-steps as the ball is struck, and stretched balls get a lunge.
- Hold Plant (C or LT) to stay put.

**Seeing it**
- A reach ring lights up when the ball is hittable.
- A shot label with a power bar appears over your player.
- An aim reticle shows where a manually aimed shot is headed.
- Timing grades pop up: perfect, early, late, stretch, mishit.

**New sliders**
- Assist strength, reach, lunge reach, the press window, error forgiveness, aim assist, drive hold time and smash speed.

**Tests**
- `tests/rally.mjs`: a bot that only presses shot buttons returns 91% of cannon feeds and rallies with the stand-in crew. Pressing too early or too late lands fewer.

## v0.0.2 · Ball and court (milestone 2) · 2026-10-23

The ball now flies like a real pickleball.

**Ball physics**
- Drag Cd 0.31 for an outdoor 40-hole ball, and spin lift CL = 0.195 × spin.
- A 78 in drop rebounds 31 in; the spec is 30–34 in.
- Bounces grip or skid depending on spin: topspin kicks on, backspin skids.
- The ball can clip the net tape and roll over, and the posts deflect it.
- The line is in.

**Shot shapes**
- Serves come in at about 42 mph.
- Drives hit 46 mph with topspin and arrive at about two-thirds of their launch speed.
- Drops and dinks clear the net by a set height into the kitchen, and lobs peak around 16–19 ft.

**Ball cannon in Practice**
- Feeds serves, drives, drops, dinks, lobs or a mix.
- You pick the placement (anywhere, forehand, backhand, at you), spin, pace, and the time between balls.
- "Cannon only" mode scores every return that lands in.
- The settings open from the dock or the pause menu.

**Reading the ball**
- A landing marker shows gold when the ball is going in and red when it's going out.
- A height line runs from the ball down to its shadow, and close calls show "IN!".

**Sliders and tests**
- Physical tuning sliders: drag, spin lift, restitution, court grip, tape bounce, and each shot's speed, spin and arc.
- `tests/ball.mjs` checks the flight against published measurements.

## v0.0.1 · Repo and skeleton (milestone 1) · 2026-10-23

**From Rink Rat Mayhem**
- Copied the renderer core, cel shading and ink outlines, post-processing, quality tiers and the WebGPU → WebGL2 → classic fallback.
- Also copied the audio engine, remappable controls, menus, tuning panel, save codes, smoke test and Pages deploy.

**New**
- A placeholder dock court on the water, in the 3D view (camera behind the baseline) and in a classic top-down view.
- A ball with gravity, drag, spin and bounces.
- A ball cannon, and a stand-in crew that returns the ball.
- Out, net and double-bounce calls.
- Pickle Pirates crew figures, with eye patches and tricorn hats.
- Live at https://ennywnad.github.io/pickle-pirates/.
