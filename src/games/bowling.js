// Bowling: a recreation of the 1979 LED handheld bowling game, following its instruction manual.
//
// One or two bowlers (the power switch), ten frames each, two balls a frame. The lane runs down
// the display: the ball starts on the row of lights at the top (your end), rolls down, and meets
// the ten pins at the far end. The scoreboard above shows the speed, then each bowler's player
// number, frame, the mark of the last frame and the score.
//
// Speed: S-1 (slowest) to S-7 (fastest). The original set it once a game with the flippers;
// here it's a slide at the bottom of the case, changeable between balls, the scoreboard showing
// S-n as it moves.
//
// Bowling a ball: hold both sides of the case and the ball appears at your end; hold just one
// side to move it that way; let go of both to roll it. Then tilt toward the side you want the
// ball to hook (the phone itself, or hold that side of the case); too far and it's in the
// gutter. Start it in the gutter and nothing happens: the scoreboard just runs through its
// numbers again. A rising tone as the ball nears the pins means a good roll; each pin down is
// a beep; a strike, a fanfare. Aim to curve into the pocket, between the head pin and either
// pin behind it. (On the original, touching a flipper during a roll was a foul; here the sides
// are how you tilt without a phone's motion sensor, so holding one then hooks the ball.)
//
// On the original, tilting slid the strip of ball lights itself sideways on a bearing, by
// gravity, and the chip read where it was at each step; the hook here works the same way, the
// tilt pushing the ball a little further over each row.
//
// Scoring is real bowling's: a spare scores 10 plus the next ball, a strike 10 plus the next
// two; a spare or strike in the 10th earns the bonus balls, shown as frames 11 and 12. Before
// the first ball of a frame the scoreboard shows the last frame's mark: none, spare, strike or
// double. After a spare or a strike the pins show / or X for a moment.
//
// How pins fall isn't in the manual: here a ball knocks down the pins it runs into, and each
// falling pin can take down its neighbours behind it, more so in the direction it was hit and
// at higher speeds, so a hook into the pocket strikes most often and a head-on hit splits.

const FLIP_L = 0x10, FLIP_R = 0x20, LEFT = 0x01, RIGHT = 0x02;
const COLS = 7;              // ball positions across: 0 and 6 are the gutters
const ROWS = 9;              // ball rows down the lane before the pins
// The pins: number, across (in ball columns), row from the front.
const PINS = [
  [1, 3, 0], [2, 2.5, 1], [3, 3.5, 1], [4, 2, 2], [5, 3, 2], [6, 4, 2], [7, 1.5, 3], [8, 2.5, 3], [9, 3.5, 3], [10, 4.5, 3],
];
const X_PINS = [1, 2, 3, 5, 7, 10], SLASH_PINS = [7, 4, 2, 1];
// Frames a row at speeds S-1 to S-7.
const ROW_FRAMES = [22, 19, 16, 13, 11, 9, 7];
const MARK = { none: 'Γ', spare: '¬', strike: 'Π', double: 'Ξ' };

const rnd = Math.random;

export const TUNES = {
  speed: [[880, 25]],
  move: [[1300, 12]],
  roll: [[300, 30]],
  rising: Array.from({ length: 8 }, (_, i) => [600 + i * 120, 30]),
  pin: [[1700, 35], [0, 45]],
  strike: [['c5', 70], ['e5', 70], ['g5', 70], ['c6', 70], ['e6', 70], ['g6', 220]],
  gutter: [[160, 260]],
};

export class Bowling {
  static id = 'bowling';
  static title = 'Bowling';
  static year = 1979;
  static actions = ['flipL', 'flipR'];
  static controls = {
    columns: [['switch'], [{ lever: 'speed', labels: ['1', '2', '3', '4', '5', '6', '7'], title: 'SPEED' }]],
    split: 1,
    sideKeys: ['flipL', 'flipR'],          // the sides of the case: hold to set up and to tilt
    stack: false,
    buttons: { flipL: { label: 'Left side', color: '#e8642a', face: 'HOLD TO TILT' }, flipR: { label: 'Right side', color: '#e8642a', face: 'HOLD TO TILT' } },
  };
  static motion = true;                    // tilt the phone itself to hook the ball
  static levels = ['1 bowler', '2 bowlers'];
  static switchLabels = ['1', '2'];
  static arrowsLegend = 'Tilt (hook the ball left or right)';
  // The case: dark brown plastic, orange ribbed flippers down the sides, the name in red on black.
  static body = {
    case: '#3a2418', caseHi: '#4b3022', panel: '#24160f', trim: '#8a6a4a', print: '#efe6da',
    key: '#c9b8a6', keyInk: '#2a1a10', plate: '#141010', plateInk: '#e8402a', grille: 'rgba(0, 0, 0, 0.45)',
    padLabel: 'TILT', surround: ['#20140d', '#2e1d13'],
  };
  static help = 'Hold both sides of the case to bring up the ball, hold one side to move it, and let go of both to '
    + 'roll. While it rolls, tilt the phone (or hold a side, or use the arrow keys) to hook it into the pocket, between '
    + 'the head pin and the pin behind it. The slide at the bottom sets the speed (1 slowest, 7 fastest) between balls; '
    + 'the switch picks one or two bowlers. Keys: Z and X are the left and right sides.';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = Bowling.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.motionTilt = null;
    this.newGame(1);
  }

  // The display: the scoreboard (four digits) at the top, then the lane: the ball row and the
  // rows it rolls down (seven across, the outer two in the gutters), and the ten pins.
  static makeLayout() {
    const leds = [];
    const x0 = 15, laneW = 90, dx = laneW / COLS, colX = (c) => x0 + (c + 0.5) * dx;
    const y0 = 70, dy = 16;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) leds.push({ x: colX(c), y: y0 + r * dy, w: 5.5, h: 5.5 });
    const pinY0 = y0 + ROWS * dy + 8;
    for (const [, px, row] of PINS) leds.push({ x: colX(px), y: pinY0 + row * 13, w: 6, h: 6 });
    const laneTop = 56, laneBot = pinY0 + 3 * 13 + 14;
    const rects = [
      { x: 0, y: 0, w: 120, h: 284, color: '#0a0606' },
      { x: x0, y: laneTop, w: laneW, h: laneBot - laneTop, color: '#140c08', r: 2 },
      { x: x0, y: laneTop, w: dx, h: laneBot - laneTop, color: '#1e1a18' },
      { x: x0 + laneW - dx, y: laneTop, w: dx, h: laneBot - laneTop, color: '#1e1a18' },
    ];
    const lines = [];
    for (let c = 1; c < COLS; c++) lines.push({ x1: x0 + c * dx, y1: laneTop + 2, x2: x0 + c * dx, y2: laneBot - 2 });
    lines.push({ x1: x0, y1: y0 + dy / 2 + 2, x2: x0 + laneW, y2: y0 + dy / 2 + 2 });            // the foul line
    const digits = [27, 49, 71, 93].map((x) => ({ x, y: 28, h: 28 }));
    return { w: 120, h: 284, leds, lines, rects, digits, lineColor: 'rgba(230, 170, 120, 0.12)', lineWidth: 0.6 };
  }

  newGame(level = this.s?.level || 1) {
    this.s = {
      level, players: level, frame: 0, phase: 'off', t: 0,
      speed: 3, speedShown: 0,
      p: 0,                                          // whose turn (0 or 1)
      rolls: [[], []],                               // each bowler's pins per ball
      frameNo: [1, 1], ballInFrame: 0,
      standing: new Array(10).fill(true),
      ballX: 3, moveT: 0, held: false,
      roll: null, show: [], showT: 0, pinFlash: null, result: null, over: false,
    };
  }

  setSkill(level) { this.s.level = level; this.s.players = level; }
  setTilt(t) { this.motionTilt = t; }

  // ---------------------------------------------------------------- scoring

  // Frame scores (cumulative) from a bowler's balls, as far as they can be counted.
  static score(balls) {
    let total = 0, i = 0;
    const frames = [];
    for (let f = 0; f < 10 && i < balls.length; f++) {
      if (balls[i] === 10) {
        if (i + 2 >= balls.length) break;
        total += 10 + balls[i + 1] + balls[i + 2]; i += 1;
      } else {
        if (i + 1 >= balls.length) break;
        if (balls[i] + balls[i + 1] === 10) {
          if (i + 2 >= balls.length) break;
          total += 10 + balls[i + 2];
        } else total += balls[i] + balls[i + 1];
        i += 2;
      }
      frames.push(total);
    }
    return frames;
  }

  // The mark of a bowler's last finished frame: none, spare, strike, or double (two strikes).
  static lastMark(balls) {
    const frames = [];
    for (let i = 0, f = 0; f < 10 && i < balls.length; f++) {
      if (balls[i] === 10) { frames.push('strike'); i += 1; }
      else if (i + 1 < balls.length) { frames.push(balls[i] + balls[i + 1] === 10 ? 'spare' : 'none'); i += 2; }
      else break;
    }
    const n = frames.length;
    if (!n) return 'none';
    if (frames[n - 1] === 'strike' && frames[n - 2] === 'strike') return 'double';
    return frames[n - 1];
  }

  // ---------------------------------------------------------------- the scoreboard

  // Queue the scoreboard's run: [characters, frames] for each step.
  queueShow(steps, then) {
    const s = this.s;
    s.show = steps;
    s.showT = 0;
    s.after = then;
    s.phase = 'show';
  }

  bowlerSteps(p, pins = null) {
    const s = this.s, balls = s.rolls[p];
    const frames = Bowling.score(balls), score = frames.length ? frames[frames.length - 1] : 0;
    const f = s.frameNo[p];
    const steps = [];
    if (pins !== null) steps.push([[' ', ' ', ...String(pins).padStart(2, ' ')], 50]);
    steps.push([['P', ' ', String(p + 1), ' '], 40]);
    steps.push([['F', ...String(Math.min(12, f)).padStart(2, '0'), ' '], 40]);
    if (s.ballInFrame === 0) steps.push([[' ', MARK[Bowling.lastMark(balls)], ' ', ' '], 40]);
    steps.push([[' ', ...String(Math.min(300, score)).padStart(3, '0')], 60]);
    return steps;
  }

  // ---------------------------------------------------------------- play

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    const flips = held & (FLIP_L | FLIP_R);
    switch (s.phase) {
      case 'off':
        // The display stays dark until the case is touched; then the speed and the scoreboard show.
        if (flips) { this.queueShow([[[' ', 'S', '-', String(s.speed)], 50], ...this.bowlerSteps(s.p)], 'ready'); this.beeper.play(TUNES.speed); }
        break;
      case 'show':
        if (++s.showT >= s.show[0][1]) {
          s.show.shift();
          s.showT = 0;
          if (!s.show.length) { s.phase = s.after; s.held = false; }
        }
        break;
      case 'ready':
        // Both flippers held: the ball comes up at your end.
        if ((flips & (FLIP_L | FLIP_R)) === (FLIP_L | FLIP_R)) { s.phase = 'aim'; s.held = true; s.moveT = 0; }
        break;
      case 'aim':
        if (!flips) { this.release(); break; }
        // One flipper alone moves the ball toward its side.
        if (flips !== (FLIP_L | FLIP_R) && ++s.moveT % 12 === 0) {
          const nx = s.ballX + (flips === FLIP_L ? -1 : 1);
          if (nx >= 0 && nx < COLS) { s.ballX = nx; this.beeper.play(TUNES.move); }
        }
        break;
      case 'roll': this.rollTick(held); break;
      case 'fall': this.fallTick(); break;
      case 'over':
        if (++s.t % 120 === 0) s.overStep = (s.overStep + 1) % (s.players * 2);
        break;
    }
  }

  release() {
    const s = this.s;
    // Started in the gutter: no ball; the scoreboard runs through its numbers again.
    if (s.ballX === 0 || s.ballX === COLS - 1) { s.ballX = 3; this.queueShow(this.bowlerSteps(s.p), 'ready'); return; }
    s.phase = 'roll';
    s.roll = { x: s.ballX, dx: 0, row: 0, t: 0, gutter: false, toned: false };
    this.beeper.play(TUNES.roll);
  }

  // The tilt: holding a side of the case or an arrow key (full tilt while held), or the phone's.
  tilt(held) {
    const keys = (held & (RIGHT | FLIP_R) ? 1 : 0) - (held & (LEFT | FLIP_L) ? 1 : 0);
    if (held & (LEFT | RIGHT | FLIP_L | FLIP_R)) return keys;
    return this.motionTilt ?? 0;
  }

  // The speed slide (S-1 to S-7): it can be moved between balls, not while one's rolling.
  levers() { return { speed: this.s.speed - 1 }; }
  setLever(name, pos) {
    const s = this.s;
    if (name !== 'speed' || s.phase === 'roll' || s.phase === 'fall') return;
    s.speed = pos + 1;
    s.speedShown = 60;
    this.beeper.play(TUNES.speed);
  }

  rollTick(held) {
    const s = this.s, r = s.roll;
    if (++r.t < ROW_FRAMES[s.speed - 1]) return;
    r.t = 0;
    r.row++;
    if (!r.gutter) {
      // The hook: tilting steers the ball a little more each row (less at higher speeds).
      const grip = 0.6 + (7 - s.speed) * 0.07;
      r.dx += this.tilt(held) * 0.045 * grip;
      r.dx = Math.max(-0.5, Math.min(0.5, r.dx));
      r.x += r.dx;
      if (r.x < 0.5 || r.x > COLS - 1.5) { r.gutter = true; r.x = r.x < 3 ? 0 : COLS - 1; this.beeper.play(TUNES.gutter); }
    }
    if (r.row === ROWS - 3 && !r.gutter && !r.toned) { r.toned = true; this.beeper.play(TUNES.rising); }
    if (r.row >= ROWS) this.hitPins();
  }

  // ---------------------------------------------------------------- the pins

  hitPins() {
    const s = this.s, r = s.roll;
    const down = new Set();
    if (!r.gutter) {
      const standing = (i) => s.standing[i] && !down.has(i);
      let x = r.x, dir = r.dx;
      const hits = [];
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 10; i++) {
          const [, px, pr] = PINS[i];
          if (pr !== row || !standing(i)) continue;
          // In contact when centres are closer than half the ball and pin widths together (about
          // 0.55 of the pin spacing on a real lane).
          if (Math.abs(px - x) < 0.55) {
            down.add(i);
            // A pin hit off-centre flies away from the ball; one hit square-on goes straight back.
            hits.push({ i, from: Math.abs(px - x) < 0.12 ? 0 : Math.sign(px - x), dir });
            // The ball deflects off it: away from an off-centre hit, either way off a square one.
            x += Math.abs(px - x) < 0.12 ? (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.2) : (x - px) * 0.35;
          }
        }
        x += dir * 0.6;
      }
      // Falling pins take down their neighbours behind them, more often toward the way they
      // were knocked, and more at higher speed.
      const speedBonus = (s.speed - 1) * 0.012;
      const queue = [...hits];
      while (queue.length) {
        const h = queue.shift(), [, hx, hr] = PINS[h.i];
        for (let j = 0; j < 10; j++) {
          if (!standing(j)) continue;
          const [, jx, jr] = PINS[j];
          if (jr < hr || jr > hr + 2 || (jr === hr && Math.abs(jx - hx) > 1.01)) continue;
          const side = jx - hx;
          if (Math.abs(side) > 1.01) continue;
          const toward = h.from === 0 ? (side === 0 ? 1 : 0.15) : Math.sign(side) === h.from ? 1 : side === 0 ? 0.4 : 0;
          let p = (jr === hr ? 0.1 : jr === hr + 1 ? 0.3 : 0.12) + toward * 0.38 + speedBonus;
          if (Math.abs(h.dir) > 0.08 && Math.sign(side) === -Math.sign(h.dir)) p += 0.16;  // a hook drives through
          if (rnd() < Math.min(0.92, p)) { down.add(j); queue.push({ i: j, from: Math.sign(side) || h.from, dir: h.dir }); }
        }
      }
    }
    s.fall = { order: [...down], i: 0, t: 0, count: down.size };
    s.phase = 'fall';
  }

  // Pins go down one by one, a beep each.
  fallTick() {
    const s = this.s, f = s.fall;
    if (f.i < f.order.length) {
      if (++f.t >= 7) { f.t = 0; s.standing[f.order[f.i++]] = false; this.beeper.play(TUNES.pin); }
      return;
    }
    if (++f.t < 30) return;
    this.afterBall(f.count);
  }

  afterBall(pins) {
    const s = this.s, p = s.p, balls = s.rolls[p];
    balls.push(pins);
    const left = s.standing.filter(Boolean).length;
    const frame = s.frameNo[p];
    const first = s.ballInFrame === 0;
    const strike = first && pins === 10;
    const spare = !first && left === 0;
    if (strike) { this.beeper.play(TUNES.strike); s.pinFlash = { pins: X_PINS, t: 90 }; }
    else if (spare) s.pinFlash = { pins: SLASH_PINS, t: 90 };

    // What's next for this bowler: another ball in the frame, or the next frame (or the end).
    let frameDone = false;
    if (frame <= 10) {
      if (strike || !first) frameDone = true;
    } else frameDone = true;                     // bonus balls are one a "frame"
    const steps = this.bowlerSteps(p, pins);
    if (!frameDone) {
      s.ballInFrame = 1;
      s.ballX = 3;
      this.queueShow(steps, 'ready');
      return;
    }
    // Bonus balls after a 10th-frame spare (one) or strike (two).
    const need = this.bonusNeeded(balls);
    const resetPins = () => { s.standing.fill(true); };
    if (frame >= 10 && need > 0) {
      s.frameNo[p] = frame + 1;
      s.ballInFrame = 0;
      // After a strike in a bonus frame, or a spare, the pins are set up again.
      if (left === 0 || frame === 10) resetPins();
      s.ballX = 3;
      this.queueShow(steps, 'ready');
      return;
    }
    s.frameNo[p] = Math.min(10, frame) + 1;
    s.ballInFrame = 0;
    resetPins();
    s.ballX = 3;
    // Next bowler (two-player games alternate frames); the game ends when both have bowled 10.
    const other = (p + 1) % s.players;
    const done = (q) => s.frameNo[q] > 10 && this.bonusNeeded(s.rolls[q]) <= 0;
    if (done(p) && done(other)) {
      this.queueShow(steps, 'over');
      s.overStep = 0; s.t = 0;
      return;
    }
    if (!done(other)) s.p = other;
    this.queueShow([...steps, ...this.bowlerSteps(s.p)], 'ready');
  }

  // Bonus balls still owed after the 10th frame (0 if none).
  bonusNeeded(balls) {
    let i = 0;
    for (let f = 0; f < 9; f++) i += balls[i] === 10 ? 1 : 2;
    const tenth = balls.slice(i);
    if (tenth.length === 0) return 1;
    if (tenth[0] === 10) return 3 - tenth.length;
    if (tenth.length < 2) return 1;
    if (tenth[0] + tenth[1] === 10) return 3 - tenth.length;
    return 0;
  }

  // ---------------------------------------------------------------- display

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    const ball = (c, row, v) => { if (row >= 0 && row < ROWS && c >= 0 && c < COLS) L[row * COLS + c] = v; };
    const pinLed = (i) => ROWS * COLS + i;
    if (s.phase !== 'off' && s.phase !== 'over') {
      if (s.pinFlash && s.pinFlash.t > 0) {
        s.pinFlash.t--;
        if ((s.frame >> 3) & 1) for (const n of s.pinFlash.pins) L[pinLed(n - 1)] = 1;
      } else for (let i = 0; i < 10; i++) if (s.standing[i]) L[pinLed(i)] = 0.75;
    }
    if (s.phase === 'aim') ball(s.ballX, 0, 1);
    if (s.phase === 'roll') {
      const r = s.roll;
      ball(Math.round(r.x), Math.min(ROWS - 1, r.row), 1);
    }
    return { leds: L, digits: this.digits() };
  }

  digits() {
    const s = this.s;
    if (s.speedShown > 0) { s.speedShown--; return [' ', 'S', '-', String(s.speed)]; }
    if (s.phase === 'off') return [' ', ' ', ' ', ' '];
    if (s.phase === 'show') return s.show[0][0];
    if (s.phase === 'over') {
      // The final scores: each bowler's number, then score, in turn.
      const p = Math.floor(s.overStep / 2), frames = Bowling.score(s.rolls[p]);
      const score = frames.length ? frames[frames.length - 1] : 0;
      return s.overStep % 2 === 0 ? ['P', ' ', String(p + 1), ' '] : [' ', ...String(score).padStart(3, '0')];
    }
    return [' ', ' ', ' ', ' '];
  }

  saveState() { return structuredClone(this.s); }
  loadState(st) { this.s = structuredClone(st); }
}
