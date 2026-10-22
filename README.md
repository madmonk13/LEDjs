# LEDjs

Touch-first recreations of the 1970s LED handheld sports games, for phones and desktop, in plain
JavaScript with no dependencies. It's a sibling of 6502js (Atari 2600), 2A03js (NES), SM83js
(Game Boy), P8js (PICO-8) and z80js (arcade), and shares their app shell (settings, pause and
resume, an installable web app), but instead of gesture controls it draws the handheld, with real
buttons to press.

These are recreations, not emulations: each game is written from how the original played (its
field, its blips, its beeps and its rules), with no ROMs involved, so everything is included. They
play like the originals but aren't their code, so timing and odds are close rather than exact. The
games' names are generic; the originals were trademarks of their makers.

**Play it:** [madmonk13.github.io/LEDjs](https://madmonk13.github.io/LEDjs/)

## Games

| Game | Year | Notes |
| --- | --- | --- |
| Auto Race | 1976 | Mattel's first handheld. Following its instruction manual: three lanes, oncoming cars, a 4-speed gear shift and a steering lever, 4 laps in 99 seconds (it only starts in first gear), crashes pushing you back down the track, and the manual's driver ratings by time. |
| Football | 1977 | The first one (later Football I). Following its instruction manual: a 9-yard field that wraps, up, down and forward run keys, five tacklers, four downs, kicking only on 4th down (the computer punts or tries a field goal), no kickoffs (each team starts on its own 20), Pro 1 and Pro 2. |
| Baseball | 1978 | Following its instruction manual: the computer pitches (fast, medium or slow, straight or curve) and fields; you hit in the strike zone, read the beeps (how many bases a hit is worth) and hold Run to run, with runners caught between bases called out by the original's rules. Walks, home runs, five innings. |
| Basketball | 1978 | Following its instruction manual: five defenders guarding the basket, the 24-second clock, 2-point baskets from the marked shooting positions (blocked shots to be won back, the rest off the backboard), four 12-minute quarters. |
| Football 2 | 1978 | Following its instruction manual: a 10-yard field that wraps, running in any direction, passing (with interceptions and incompletes), punts, field goals, kickoffs and runbacks, safeties, four 15-minute quarters, Pro 1 to Pro 4. |
| Hockey | 1978 | Following its instruction manual: the 18-position rink, three Defensemen and a Goalie who leaves the net, the seven scoring positions, steals, poke checks, bumps and penalties (with the penalty box lights and power plays), three 20-minute periods. |
| Soccer | 1978 | Following its instruction manual: five blockers in their zones (two wandering, three cutting off the goal) and a goalkeeper twice as fast who wins the ball by touching it, the marked kicking positions, the 10-minute possession limit, two 45-minute halves. |

Where a manual leaves something out (how fast the defense moves, exact odds), it's filled in to
play the way the manual describes: a clean Auto Race in top gear takes a little under 30 seconds,
the manual's World Champion time, and scores in the court games stay in their two digits.

The originals were for one or two players, the computer always playing the defense. Basketball,
Hockey and Soccer work as their manuals say for one player: you play the offense for both teams,
Visitor and Home taking turns, against the computer's defense. In the two football games Home and
Visitor each ran the offense against the computer's defense, and in Baseball each batted against
its pitching and fielding. Single-player here: in Football and Football 2 you're Home, and the
Visitor's possessions are played by the computer (its drive shown as its runner working across the
field, then the result on the scoreboard; in Football 2 its kickoffs and punts to you are yours to
run back). In Baseball you're the Visitors, batting first, and the computer bats for Home with the
same pitching and fielding, which you watch.

## Controls

Each game is drawn as the handheld itself, in the originals' colours: a case with the LED window in
its stadium surround, the game's buttons, the run keys and the skill switch, all pressed directly.
Keys can be held together. Each press of an arrow key is one yard; holding doesn't repeat.

On a phone the phone becomes the handheld: the case fills the screen edge to edge, its plastic
running under the top bar and the notch (the phone's status bar takes the case's colour), and the
keys grow to use the room the panel has, as far as its width allows. Football 2, whose wide
display leaves the most room, stacks its controls there: the buttons in a row on top, the run keys
below with Pass beside them, so the keys can be bigger. Football keeps its original single row (ST
over SC, K, the two-way forward key, up over down), which is compact enough to grow as it is. On
larger screens the case is drawn whole, framed in the window.

| Case | Keyboard | Gamepad |
| --- | --- | --- |
| Arrow keys (Auto Race: steering and the gear shift) | Arrows / WASD | D-pad, left stick |
| Game buttons (Football: Kick, Status, Score; Football 2: Pass, Kick, Status, Score; Baseball: Pitch, Hit, Run, Score; Basketball and Hockey: the two Shoot keys; Soccer: the two Kick keys; Auto Race: Start) | Z, X, C, V (or J, K, L, ;) | Bottom, right, left, top face buttons |
| Pause / resume | P | Start |

Auto Race's levers are tapped to a position (or moved with the keys: left and right steer, up and
down shift). On Basketball, Hockey and Soccer the down arrow is printed with a dot: between plays it
shows the score (Visitor, Home and the minutes left; Hockey's scoreboard is Home first).

Football 2's switch selects Pro 1 or Pro 2; hold Kick while moving it for Pro 3 or Pro 4 (as you
held Kick while switching the original on). Moving to the other pair of levels starts a new game,
as it did on the original. Settings has the same levels, **Arrow keys on the left** (the originals
had them on the right), and New game. P pauses. A game in progress is saved whenever play stops,
and picks up where it was left.

**Hints follow how you play,** as in the other apps. Played by touch, the case is the control. On a
computer, or as soon as you press a key or a gamepad button, a card lists the game's keys (or
gamepad buttons) by its own button names as a game starts and while it's paused, fading at the first
key or tap; the same list is in Settings › Controls. **Hints for** in Settings fixes it to Touch,
Keys or Pad instead of Auto. The pause screen says how to resume for each.

## Sound

The originals' sound came from the game chip toggling a small speaker, so the exact tunes live in
the game's code. The sounds here follow each manual's list (Football 2's whistle, double whistle, runback
tone, safety tones, "Charge!", victory tune, first-down beep and end-of-quarter buzzer; Basketball's
trumpet, ticking 24-second clock and buzzers; Hockey's four sirens for a goal, beeps for checks and
bumps; Soccer's victory tune and double and triple whistles at the half and the end) as square-wave
tones, but their exact pitches and rhythms are approximations.

## How it works

- `src/led/display.js` draws the LED window: red blips (bright and dim, with glow and a short
  afterglow) and seven-segment digits, from a layout each game describes.
- `src/led/beeper.js` is the piezo buzzer: square-wave beeps and tunes.
- `src/device.js` builds the handheld's case for each game (buttons, arrow keys, the skill switch,
  Auto Race's levers), and reads the presses.
- `src/games/*.js` are the games, each with the same small interface: `tick(held, pressed)` 60
  times a second, `render()`, and `saveState()` / `loadState()`. Basketball, Soccer and Hockey
  share `court.js`: the grid, the defense's moves, shooting, loose balls, possessions, periods and
  the score flash, each game adding its own rules.

## Running

```bash
npm start
```

Then open http://localhost:2609.

## Offline and install

The app is a PWA: open it once while online and a service worker (`sw.js`) caches it, so it then
starts and plays without a network. `sw.js` is generated: `npm start` rebuilds it, or run
`npm run sw` after changing files, and commit it with them. Service workers only run on **https**
or **localhost**.


**Install** (in Settings, next to the title) installs it as an app where the browser allows that
from a page (Chrome, Edge and other Chromium browsers, on computers and Android). Safari can't be
asked by a page, so there the button says how: Share › Add to Home Screen on iPhone and iPad, or
File › Add to Dock on a Mac. It's hidden in browsers that can't install apps (Firefox) and once
the app is installed.
