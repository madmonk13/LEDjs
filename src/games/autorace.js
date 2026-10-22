// Auto Race: a recreation of the 1976 LED handheld racing game (Mattel's first),
// following its instruction manual.
//
// The track is 3 lanes by 7 positions. Your car is the bright blip that starts at
// the bottom and drives up; the dim blips are oncoming cars, driving down. Reach the
// top and that's a lap: the car goes back to the starting line for the next one.
// Complete 4 laps in 99 seconds or less to win. The digits show the race time.
//
// The gear shift (1-4) sets your speed: higher gears save time, lower ones help
// you dodge. The race only starts in first gear. Steer with the steering lever
// (left, middle and right lanes). Run into a car, or let one run into you, and it
// pushes you back down the track until you steer out of its lane, costing time.

const LANES = 3, ROWS = 7, LAPS = 4, LIMIT = 99;
const LEFT = 0x01, RIGHT = 0x02, UP = 0x04, DOWN = 0x08, START = 0x10;
// Frames per position for your car in gears 1-4 (a clean race in top gear takes a little
// under 30 seconds, the manual's World Champion time), and for the oncoming cars.
const STEP = [130, 95, 72, 56];
const CAR_STEP = [62, 52, 44, 38];

const rnd = (n) => Math.floor(Math.random() * n);

export const TUNES = {
  go: [[660, 60], [0, 40], [660, 60], [0, 40], [990, 160]],
  lap: [[1320, 90], [0, 30], [1760, 120]],
  crash: [[180, 120], [140, 160]],
  win: [['c6', 100], [0, 40], ['c6', 100], [0, 40], ['c6', 100], [0, 40], ['g6', 400]],
  lose: [[400, 300], [300, 300], [200, 600]],
  shift: [[500, 25]],
};

export class AutoRace {
  static id = 'autorace';
  static title = 'Auto Race';
  static year = 1976;
  static actions = ['start'];
  static controls = {
    columns: [
      [{ lever: 'gear', labels: ['4', '3', '2', '1'], vertical: true, title: 'GEAR' }],
      [{ lever: 'steer', labels: ['L', '', 'R'], title: 'STEER' }, 'start'],
    ],
    split: 1,
    buttons: { start: { label: 'Start', color: '#d8d2c4' } },
  };
  static levels = ['Race'];
  static arrowsLegend = 'Steer (left, right), shift gear (up, down)';
  // The case: black plastic with a chrome-silver name plate.
  static body = {
    case: '#202022', caseHi: '#2e2e32', panel: '#141416', trim: '#b9b9b9', print: '#e8e8e8',
    plate: '#c9ccd1', plateInk: '#141414', grille: 'rgba(0, 0, 0, 0.5)',
  };
  static help = 'Shift into first gear and press Start: your car drives up the track. Steer around the oncoming '
    + 'cars; hitting one pushes you back until you change lanes. Higher gears are faster. Complete 4 laps in '
    + '99 seconds. Ratings from the manual: under 30 seconds, World Champion Driver; 30-45 Professional Driver; '
    + '45-55 Showing Potential; 55-65 Still an Amateur; 65-75 Stick to the Highways; 75 or more, Leave Car in Garage. '
    + 'Keys: left and right steer, up and down shift, Z starts (and resets).';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = AutoRace.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.newGame(1);
  }

  // The display: the race time at the top, then the track, lanes left to right and
  // positions bottom to top, each LED a short upright dash.
  static makeLayout() {
    const leds = [], lines = [];
    const x0 = 34, dx = 26, yBottom = 196, dy = 21;
    for (let r = 0; r < ROWS; r++) for (let l = 0; l < LANES; l++) leds.push({ x: x0 + l * dx, y: yBottom - r * dy, w: 4, h: 11 });
    const tx0 = x0 - dx / 2, tx1 = x0 + 2.5 * dx, ty0 = yBottom - 6.5 * dy - 4, ty1 = yBottom + dy / 2 + 2;
    for (let l = 1; l < LANES; l++) {
      const x = tx0 + l * dx;
      for (let y = ty0 + 4; y < ty1 - 4; y += 12) lines.push({ x1: x, y1: y, x2: x, y2: y + 6 });
    }
    const rects = [
      { x: 0, y: 0, w: 120, h: 58, color: '#0a0606' },
      { x: tx0 - 6, y: ty0 - 2, w: tx1 - tx0 + 12, h: ty1 - ty0 + 4, color: '#3a3a3a', r: 3 },
      { x: tx0, y: ty0, w: tx1 - tx0, h: ty1 - ty0, color: '#070505' },
    ];
    const digits = [{ x: 47, y: 29, h: 30 }, { x: 73, y: 29, h: 30 }];
    return { w: 120, h: 214, leds, lines, rects, digits, lineColor: 'rgba(235, 235, 225, 0.5)', lineWidth: 1.2 };
  }

  newGame(level = this.s?.level || 1) {
    this.s = {
      level, frame: 0, phase: 'off', gear: this.s?.gear || 1, lane: this.s?.lane ?? 1,
      row: 0, lap: 0, time: 0, ticks: 0, adv: 0, cars: [], carT: 0, spawnGap: 0, flash: 0, result: null,
    };
  }

  setSkill(level) { this.s.level = level; }

  // The levers: gear 1-4 (shown top to bottom as 4, 3, 2, 1) and the lane.
  levers() { return { gear: 4 - this.s.gear, steer: this.s.lane }; }
  setLever(name, pos) {
    if (name === 'gear') this.shift(4 - pos);
    else if (name === 'steer') this.steer(pos);
  }

  shift(gear) {
    gear = Math.max(1, Math.min(4, gear));
    if (gear !== this.s.gear) { this.s.gear = gear; this.beeper.play(TUNES.shift); }
  }

  steer(lane) {
    const s = this.s;
    lane = Math.max(0, Math.min(LANES - 1, lane));
    if (lane === s.lane) return;
    // Steering into a car alongside is a collision too.
    if (s.phase === 'race' && this.carAt(lane, s.row)) { this.crash(); return; }
    s.lane = lane;
  }

  carAt(lane, row) { return this.s.cars.find((c) => c.lane === lane && c.row === row) || null; }

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (pressed & LEFT) this.steer(s.lane - 1);
    if (pressed & RIGHT) this.steer(s.lane + 1);
    if (pressed & UP) this.shift(s.gear + 1);
    if (pressed & DOWN) this.shift(s.gear - 1);
    if (pressed & START) {
      // Start / Reset: during or after a race it resets to the starting line; from there it
      // starts the motor, but only in first gear.
      if (s.phase !== 'off') this.newGame();
      else if (s.gear === 1) { s.phase = 'race'; this.beeper.play(TUNES.go); }
      else this.beeper.play([[160, 90]]);
      return;
    }
    if (s.phase === 'done') { if (s.flash > 0) s.flash--; return; }
    if (s.phase !== 'race') return;

    // The race clock.
    if (++s.ticks >= 60) {
      s.ticks = 0;
      s.time++;
      if (s.time >= LIMIT) { s.time = LIMIT; this.finish(false); return; }
    }

    // Your car moves up a position at the gear's pace, unless a car is in the way.
    if (++s.adv >= STEP[s.gear - 1]) {
      s.adv = 0;
      if (s.row === ROWS - 1) {
        // Off the top: a lap. Back to the starting line.
        s.lap++;
        if (s.lap >= LAPS) { this.finish(true); return; }
        s.row = 0;
        s.cars = s.cars.filter((c) => c.row > 1);
        this.beeper.play(TUNES.lap);
      } else {
        const blocker = this.carAt(s.lane, s.row + 1);
        if (blocker) this.crash();
        else { s.row++; this.beeper.tone(300 + s.gear * 140 + s.row * 30, 18); }
      }
    }

    // Oncoming cars move down; a car reaching yours pushes it back.
    if (++s.carT >= CAR_STEP[s.gear - 1]) {
      s.carT = 0;
      for (const c of s.cars) {
        c.row--;
        if (c.lane === s.lane && c.row === s.row) {
          if (s.row > 0) { s.row--; this.crash(); }
          else c.row = -1;            // at the starting line it slips past
        }
      }
      s.cars = s.cars.filter((c) => c.row >= 0);
      this.spawn();
    }
  }

  // A new car at the top, now and then, never closing every lane.
  spawn() {
    const s = this.s;
    if (s.spawnGap > 0) { s.spawnGap--; return; }
    if (s.cars.length >= 3 || Math.random() < 0.35) return;
    const near = s.cars.filter((c) => c.row >= ROWS - 3).map((c) => c.lane);
    const free = [0, 1, 2].filter((l) => !near.includes(l));
    if (free.length < 2) return;
    s.cars.push({ lane: free[rnd(free.length)], row: ROWS - 1 });
    s.spawnGap = 1 + rnd(2);
  }

  crash() {
    const s = this.s;
    s.adv = 0;
    this.beeper.play(TUNES.crash);
  }

  finish(won) {
    const s = this.s;
    s.phase = 'done';
    s.result = won ? 'win' : 'lose';
    s.flash = 240;
    s.cars = [];
    this.beeper.play(won ? TUNES.win : TUNES.lose);
  }

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    const at = (lane, row, v) => { if (row >= 0 && row < ROWS) L[row * LANES + lane] = Math.max(L[row * LANES + lane], v); };
    if (s.phase === 'race') {
      for (const c of s.cars) at(c.lane, c.row, 0.22);
      at(s.lane, s.row, 1);
    } else if (s.phase === 'off') {
      at(s.lane, 0, (s.frame >> 5) & 1 ? 1 : 0.4);
    } else if (s.result === 'win' && (s.frame >> 4) & 1) {
      for (let l = 0; l < LANES; l++) at(l, ROWS - 1, 1);
    }
    return { leds: L, digits: this.digits() };
  }

  digits() {
    const s = this.s;
    if (s.phase === 'off') return [' ', '0'];
    if (s.phase === 'done' && s.flash > 0 && !((s.frame >> 4) & 1)) return [' ', ' '];
    const t = String(Math.min(LIMIT, s.time)).padStart(2, ' ');
    return [t[0], t[1]];
  }

  saveState() { return structuredClone(this.s); }
  loadState(s) { this.s = structuredClone(s); }
}
