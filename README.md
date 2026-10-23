# Pickle Pirates

Arcade pickleball between pirate crews, in the browser. Real rules underneath (the kitchen, the two-bounce rule, serve rotation), arcade chaos on top. Your crew is the Pickle Pirates, cucumbers in eye patches and tricorn hats, sailing to seven island courts and the Davy's Locker Cup.

**Play:** https://ennywnad.github.io/pickle-pirates/

## Status

Milestones 1 and 2 of 10 are done:

- **The skeleton:** a placeholder dock court in a comic-book 3D view and a classic top-down view.
- **The ball:** real drag and spin lift, a bounce that grips or skids depending on spin, a net cord the ball can roll over, and line-is-in calls.
- **The ball cannon:** Practice feeds serves, drives, drops, dinks and lobs, with your choice of placement, spin, pace and timing.

Scoring, the rules engine, real shots and the real CPU come in later milestones.

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
| 10 | Voyage and polish, v1.0 | A new player can reach the Davy's Locker Cup |

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

Keys and buttons can be remapped under Controls.

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
npm install && npm test   # ball physics checks, then the Playwright smoke test against the running server
```

Add `?debug` to the address for test hooks on `window.__sim`.

## Layout

The engine around the sport (renderer core, cel shading and ink, post-processing, audio, input, menus, tests and deploy) comes from [Rink Rat Mayhem](https://github.com/ennywnad/rink-rat-mayhem); the sport itself is new.

```
js/core.js        helpers, court geometry, crews, islands, booty list, saves
js/audio.js       mixer, crowd, sound effects, music cues
js/match.js       match state, tuning sliders, accessibility
js/ball.js        ball flight, spin, bounces, net, line calls, launch solvers
js/shots.js       who can reach the ball, shot targets, the hit (placeholder)
js/rules.js       rally referee (placeholder) and the ball cannon
js/players.js     footwork and the stand-in CPU (placeholder)
js/input.js       remappable keys, controllers, touch, controls screen
js/update.js      per-frame step
js/render2d.js    classic top-down view, scoreboard
js/render3d.js    3D court (WebGPU, WebGL2 fallback)
js/overlay.js     HUD over the 3D view, graphics settings
js/ui.js, js/main.js
```

The sound pack in `assets/sfx` is borrowed from the rink until `tools/gen_sfx.py` makes the paddle, ball, deck and sea sounds.

## License

MIT
