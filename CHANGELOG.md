# Changelog

What changed in each version of Pickle Pirates, newest first. Each version finishes one milestone from the [README](README.md#status).

## v0.2.0 · Doubles and two players (milestone 7) · 2026-10-23

Two a side, and two people on one screen.

**Doubles**
- Real doubles rules. Games start 0–0–2 with one server. After that, each partner serves before the serve passes over, and after a side out the player in the right court serves first.
- The serving pair swaps sides only when it scores (the starting-server rule). The receiver is always the player diagonally across.
- The score call is three numbers in side-out scoring (serving team, receiving team, server number). Rally scoring uses two numbers and one server per side out.
- The scoreboard shows the server number, and "Second server" is called when the partner takes over.

**CPU partners and crews**
- One partner takes each ball (whoever gets to a good contact spot with the least running). The other covers their half of the court. The tests count frames where both partners chase the same ball, and it's zero.
- The receiver's partner starts at the kitchen line. The serving pair stays back until the return bounces, then moves up together.
- The CPU aims for the biggest gap, often the middle between two players.
- The crews behind the menus sometimes play doubles now.

**Two players**
- **Versus** is open on the dock: doubles or singles, with three ways to play:
  - **Solo:** with a CPU partner in doubles.
  - **P1 + P2 vs the crew:** co-op doubles.
  - **P1 vs P2:** singles, or doubles with a CPU partner each.
- Controls: two controllers give one each, one controller goes to P2 with P1 on the keyboard, and with none the keyboard splits left and right. The controls bar shows both players' keys.
- P1 and P2 tags float over each player. Each gets their own reach ring, aim reticle and kitchen warning (P1 gold, P2 blue).
- P1 vs P2 uses a side-on camera that favors neither end, and the results card names the winner.

**CPU tuning**
- Long dink rallies end sooner: the CPU tries a speed-up off a lower ball as the rally goes on, and now and then misses a dink into the net or pops one up. It loosens up from 16 shots instead of 24. Singles rallies are unchanged (about 6–9 shots on average). CPU-only doubles average about 15–17.

**Tests**
- `tests/rules.mjs` checks a hand-worked doubles sequence, plus 300 random games in each scoring system against an independent referee's notebook that tracks who stands where by name. That's about 17,000 serves.
- `tests/game.mjs` plays full doubles games and checks every serve against the notebook: the right server, behind the baseline in the right court, the receiver diagonally across, the return hit by the receiver, and the score.
- The smoke test plays co-op doubles (P2 moves on the arrow keys and P1 doesn't), fast-forwards doubles points, and starts P1 vs P2 with the side camera. The geometry leak check now compares singles with singles and doubles with doubles.

## v0.1.0 · First playable: Brine Bay (milestone 6) · 2026-10-23

The first playable build. Brine Bay is open: the Pickle Pirates against the Barnacle Boys, singles to 11.

**Play the Barnacle Boys**
- A new Brine Bay card at the top of the dock. Pick the crew level (Deckhand, Bosun or Captain) and press Play.
- Play always uses the standard rules: to 11, side-out scoring, the kitchen and two-bounce rules on. The old Singles game card is now **Custom game**, for any island, format and rule set.
- **How to play** shows before your first game and is always on the dock and in the pause menu. It covers scoring, moving, the four shots, aiming, the three rules to know and the crew levels, with your keys or controller buttons.
- **Your record** against each crew level is saved (it moves with your save code) and shown on the dock and on the results card.
- After a win, the results card offers the next level up. Your first win over a level gets called out.

**Brine Bay**
- The harbor dock now sits in a real harbor: a quay of colored houses with hills behind, a lighthouse with a glowing lamp, rowboats tied to the dock, a sloop, the Pickle Pirates' own two-masted ship with a jolly roger (crossed paddles), bobbing buoys, and gulls circling overhead.
- The **Barnacle Boys** are crabs: a wide red shell on six legs, barnacles, eye stalks, a bandana, the paddle gripped in one claw and a spare claw that snaps. They're crabs in the classic view too.
- The other islands keep the plain dock until milestone 9.

**The first sound pack**
Every sound is new, made by `tools/gen_sfx.py`.
- Paddle pops for dinks, drives and smashes. Ball bounces on the dock planks, the net, the net cord, wooden pilings, and the ball cannon's thoomp.
- A splash when a ball flies off the dock into the harbor.
- The referee parrot squawks the calls: one squawk for a call, two for a fault, a whistle for a winner or an ace. The ship's bell rings on a side out.
- A harbor ambience (water at the pilings, creaking planks, distant gulls, a small dockside crowd) that builds as a rally runs long. Cheers come with shouts of "Arrr!".

**The shanty band**
- The organ is gone. A squeezebox, fiddle, plucked bass, foot stomps and a tambourine play original shanty tunes in D Dorian and D major.
- Cues: a fiddle run and a "Hey!" at the start of a game, the band picking up in a 14-shot rally, a quick jig when you score, a sagging squeezebox when they score, a finale when you win, a noodle when the ends switch, and a 16-bar menu loop.

**Fixes**
- The unused booty button no longer shows in the corner of the court. Booty comes in milestone 9.

**Tests**
- The smoke test checks that every sound and music file the game asks for exists.
- It also plays the v0.1 flow: Play from the dock, How to play on the first game, Brine Bay against the chosen level under the standard rules, then the results record and the dock record.
- `tests/game.mjs` checks that a legal stroke counts toward the rally. The smoke test caught a build where it didn't.

## v0.0.6 · Fixes from the issue list · 2026-10-23

Fixes all ten open GitHub issues (#1–#10) before milestone 6.

**Rules**
- A ball that bounces in, then spins or rolls back over the net, is now the receiver's lost point. Before, it was called a net fault on the hitter (#1).
- A kitchen-volley fault is called at contact. The illegal shot no longer counts toward the rally, the longest rally or the stroke count, and the ball isn't launched (#2).
- After a volley, being carried into the kitchen in any direction is now a fault, including sideways from just wide of the sideline (#3).
- The kitchen rule now also applies after a put-away: when the volleyer would win the rally, the call waits until their momentum is spent. If they step in first, the point goes the other way (#3, rule 11.A).

**Play**
- The CPU and the move-to-ball assist now plan overhead volleys at the net up to about 8 ft. Before, anything over 6 ft was skipped and the player backed off to wait for the ball to drop (#4).
- The ball now runs on one fixed step (1/240 s) whatever your screen's refresh rate, and every prediction uses that same step. The landing marker, the assist, the CPU and the aim solvers all see the exact flight; a fast drive's predicted bounce now matches the real one (#5).
- Code cleanup in the CPU's return of serve (#7).

**Views and menus**
- In 3D, the stick no longer steers backwards for one frame when the ends switch (#6).
- Crew figures are freed from GPU memory when a new match starts. Before, every new match (including the attract mode behind the menus) left the old figures in memory. One small per-frame allocation is also gone (#8).
- In the classic view after switching ends, lunges and paddle swings now lean the right way (#9).
- Opening Feel tuning in a singles game now holds the game, and closing it puts you back where you were (the pause menu, or play). In Practice, tuning still runs live so you can feel each slider (#10).

**Tests**
- `tests/game.mjs` checks each rules fix, that the predicted bounce matches the live ball to under an inch, and the overhead volley plan.
- The smoke test checks that figure geometry stays flat across new matches and that Feel tuning holds a game.
- The quick CPU run in CI skips the three-way level ordering, which three games can't settle; the full `node tests/ai.mjs` still checks it.

## v0.0.5 · CPU opponent (milestone 5) · 2026-10-23

The crew across the net now plays real pickleball, at three levels.

**Three crew levels**
- **Deckhand (easy):** a slow first step, rough reads of the ball, early swings, about one dink in four popped up, and it often stays back.
- **Bosun (medium):** comes to the net most points and punishes high balls, with the odd rushed swing.
- **Captain (hard):** reads the ball early, plays from the kitchen line, rarely misses, and serves deep to your backhand.
- Pick the level in the singles setup (Bosun by default) or under Crew level in the Practice settings.
- The scoreboard and the results card show which level you're playing.

**How the CPU plays**
- Reads where the ball will be, with error that shrinks as the ball arrives, then runs to a contact spot after a reaction delay.
- Picks shots by contact height and where both players are: puts away high balls, dinks at the kitchen line, speeds up when a dink sits up, drops and lobs when you're at the net, and drives deep when you're both back.
- The longer a dink rally runs, the more tempted it is to speed up.
- Returns serve deep and comes in. When serving it stays back until the return bounces (two-bounce rule).
- Waits between shots at the baseline or the kitchen line, shading toward where the ball is headed.
- Serves drives, soft deep serves and the odd lob serve.
- Never volleys from the kitchen.
- In a very long rally its shots slowly get looser, so points don't run forever.

**Fixes**
- A CPU serve now leaves from the server's paddle. Before, it could start from where the last point ended and fly out.
- The move-to-ball assist runs at full speed and steers you clear of kitchen faults.
- Shot error is wider, so rallies end in believable mistakes instead of running forever.
- Up at the net, you (with the move-to-ball assist) and the CPU now volley or smash a high ball instead of backing off to play it after the bounce.
- Pressing a shot a full second early costs more than before. Inside the half-second window nothing changes.

**Tests**
- `tests/ai.mjs` checks the ladder: each level beats the one below, and one level apart the loser still scores.
- It also plays each level against a bot that plays like a decent human. The bot beats the Deckhand, loses to the Captain, and the Bosun sits in between.
- It checks style (the Captain plays at the kitchen line more, the Deckhand pops up more dinks) and runs a 20-game soak across islands and formats with every point checked against the rules.
- CI runs a shorter 6-game soak on every push.

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
