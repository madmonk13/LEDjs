// Football: a recreation of the 1977 LED handheld football game (the first one,
// later called Football I), following its instruction manual.
//
// The field is 3 lanes by 9 yards. You (Home) run to the right: the bright blip is
// your runner, the five dim blips the tacklers. Each press of an arrow key is one
// yard: up and down cross the field, forward heads for the goal. Every play starts
// with the runner at the left end, in front of his own goal posts; reach the right
// end and he comes back in at the left, and play goes on.
//
// Four downs to make 10 yards. A tackle (from any side) ends the play with the
// referee's whistle; the tackler blinks. Kicking is only on 4th down: the computer
// decides whether it's a punt or a field goal try (better odds the closer you are),
// and a kick goes 1 to 65 yards. A failed 4th-down run turns the ball over where it
// stopped. Touchdowns are 7 points, field goals 3; after a score the other team
// starts on its own 20. There are no kickoffs: Home opens on its own 20, and the
// Visitor opens the second half on its own 20.
//
// After every play press Status (down, field position, yards to go) or Score
// (score, time left in the quarter) to set up the next. Four 15-minute quarters,
// the clock running only during plays, six times faster than real time.
//
// The original was for one or two players, the computer always playing defense.
// Here you're Home, and the computer plays the Visitor's possessions: its drive is
// shown as its runner working across the field, then the result on the scoreboard.

import { TUNES as F2 } from './football2.js';

const COLS = 9, ROWS = 3;
const LEFT = 0x01, RIGHT = 0x02, UP = 0x04, DOWN = 0x08;
const KICK = 0x10, STATUS = 0x20, SCORE = 0x40;
const MOVES = RIGHT | UP | DOWN;
const QUARTER = 15 * 60;                   // seconds
// Frames between tackler moves (one tackler each time) on Pro 1 and Pro 2 (50% faster).
const DEF_STEP = [11, 7];

const rnd = (n) => Math.floor(Math.random() * n);
const pad2 = (n) => String(Math.max(0, Math.min(99, n))).padStart(2, ' ');

export const TUNES = { ...F2 };

export class Football {
  static id = 'football';
  static title = 'Football';
  static year = 1977;
  static actions = ['kick', 'status', 'score'];
  // As on the original, two halves mirroring each other: ST over SC, then K (blue, lettered); the
  // orange two-way forward key, then up over down; all one size. The PRO 1 / PRO 2 switch runs
  // along the bottom, under all of them.
  static controls = {
    columns: [['status', 'score'], ['kick'], 'arrows'],
    split: 2,
    switchBelow: true,
    mirror: true,
    keyScale: 1.25,
    pad: ['up', 'right', 'down'],
    padStyle: 'forward',
    keyColors: { right: '#f08a2a' },
    stack: false,
    buttons: {
      score: { label: 'Score', color: '#2f74cf', face: 'SC' }, status: { label: 'Status', color: '#2f74cf', face: 'ST' },
      kick: { label: 'Kick', color: '#2f74cf', face: 'K' },
    },
  };
  static levels = ['Pro 1', 'Pro 2'];
  static arrowsLegend = 'Run: up, down, forward (right)';
  // The case: cream plastic with a cream stadium around the display, a black control panel,
  // red-orange run keys, and the blue name plate.
  static body = {
    case: '#e9e3d1', caseHi: '#f5f0e2', panel: '#151515', trim: '#3a3a3a', print: '#e8e6df',
    key: '#ec5a33', keyInk: '#4a1408', plate: '#2f74cf', plateInk: '#ffffff', padLabel: '',
    grille: 'rgba(70, 62, 48, 0.45)', surround: ['#d8d1bd', '#ebe5d4'],
  };
  static help = 'Run with the arrow keys, a yard a press: up, down and forward. Off the end of the field you come '
    + 'back in at the start. Four downs to make 10 yards; Kick on 4th down (the computer punts or tries a field goal). '
    + 'After each play, press Status or Score to line up the next. Touchdowns 7, field goals 3. '
    + 'Keys: Z Kick, X Status, C Score.';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = Football.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.newGame(1);
  }

  // The display: the scoreboard strip, then the field (green surround, blue end zones,
  // white yard lines on black), as on Football 2 but a yard shorter.
  static makeLayout() {
    const leds = [], lines = [];
    const x0 = 34, dx = 29, y0 = 106, dy = 17;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) leds.push({ x: x0 + c * dx, y: y0 + r * dy, w: 12, h: 4 });
    const fx0 = x0 - dx / 2, fx1 = fx0 + COLS * dx, fy0 = y0 - dy / 2 - 3, fy1 = y0 + 2.5 * dy + 3;
    for (let c = 1; c < COLS; c++) {
      const x = fx0 + c * dx;
      lines.push({ x1: x, y1: fy0, x2: x, y2: fy1 });
      for (const y of [y0 + dy / 2, y0 + 1.5 * dy]) lines.push({ x1: x - 2.5, y1: y, x2: x + 2.5, y2: y });
    }
    lines.push({ x1: fx0, y1: fy0, x2: fx1, y2: fy0 }, { x1: fx0, y1: fy1, x2: fx1, y2: fy1 });
    const rects = [
      { x: 0, y: 0, w: 300, h: 76, color: '#0a0606' },
      { x: 0, y: 76, w: 300, h: 84, color: '#3f8a3c' },
      { x: fx0 - 9, y: fy0 - 1, w: 9, h: fy1 - fy0 + 2, color: '#2f6fd0' },
      { x: fx1, y: fy0 - 1, w: 9, h: fy1 - fy0 + 2, color: '#2f6fd0' },
      { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0, color: '#050303' },
    ];
    const dh = 26, dyy = 38;
    const digits = [55, 79, 126, 150, 174, 221, 245].map((x) => ({ x, y: dyy, h: dh }));
    return { w: 300, h: 160, leds, lines, rects, digits, lineColor: 'rgba(235, 235, 225, 0.75)', lineWidth: 0.9, textColor: 'rgba(225, 225, 215, 0.38)' };
  }

  // ---------------------------------------------------------------- game flow

  newGame(level = this.s?.level || 1) {
    this.s = {
      level, home: 0, vis: 0, qtr: 1, clock: QUARTER, frame: 0,
      phase: 'ready', t: 0, display: 'status',
      yard: 20, los: 20, down: 1, toGo: 10, fdLine: 30, fdDone: false,
      car: { c: 0, r: 1 }, defs: [], defT: 0, defTurn: 0,
      next: null, quarterOver: false, anim: null, blink: [],
    };
    this.setupScrimmage();
  }

  setSkill(level) { this.s.level = level; }

  // Every play starts at the left end, the tacklers spread down the field.
  setupScrimmage() {
    const s = this.s;
    s.phase = 'ready';
    s.los = Math.max(1, Math.min(99, s.los));
    s.toGo = Math.min(s.toGo, 100 - s.los);
    s.fdLine = s.los + s.toGo;
    s.fdDone = false;
    s.yard = s.los;
    s.car = { c: 0, r: 1 };
    s.blink = [];
    s.defs = [
      { c: 2, r: 0 }, { c: 2, r: 2 }, { c: 3, r: 1 },
      { c: 5, r: rnd(3) }, { c: 7 + rnd(2), r: rnd(3) },
    ];
    s.defT = DEF_STEP[s.level - 1] + 12;
  }

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (pressed & STATUS) s.display = 'status';
    if (pressed & SCORE) s.display = 'score';
    switch (s.phase) {
      case 'ready':
        if (pressed & KICK && s.down === 4) { this.kick(); break; }
        if (pressed & MOVES) { s.phase = 'live'; this.move(pressed); }
        break;
      case 'live': this.live(pressed); break;
      case 'kick': this.kickTick(); break;
      case 'dead':
        if (s.t > 0) s.t--;
        if (pressed & (STATUS | SCORE) && s.t <= 0) this.proceed();
        break;
      case 'td':
        if (++s.t > 150 && pressed & (STATUS | SCORE)) this.proceed();
        break;
      case 'cpu': this.cpuTick(); break;
      case 'over': break;
    }
  }

  defAt(c, r) { return this.s.defs.find((d) => d.c === c && d.r === r) || null; }

  live(pressed) {
    const s = this.s;
    // The clock runs during play, six times real time.
    if (s.frame % 10 === 0 && s.clock > 0) s.clock--;
    if (pressed & MOVES) { this.move(pressed); if (s.phase !== 'live') return; }
    // The defense moves one tackler at a time, taking turns.
    if (--s.defT > 0) return;
    s.defT = DEF_STEP[s.level - 1];
    s.defTurn = (s.defTurn + 1) % s.defs.length;
    const d = s.defs[s.defTurn];
    this.chase(d);
    if (d.c === s.car.c && d.r === s.car.r) this.tackle(d);
  }

  // The runner: forward (wrapping from the far end back to the start), or across.
  move(pressed) {
    const s = this.s, r = s.car;
    if (pressed & RIGHT) { r.c = r.c < COLS - 1 ? r.c + 1 : 0; s.yard++; }
    else if (pressed & UP) { if (r.r === 0) return; r.r--; }
    else if (pressed & DOWN) { if (r.r === ROWS - 1) return; r.r++; }
    else return;
    this.beeper.play(TUNES.step);
    const d = this.defAt(r.c, r.r);
    if (d) { this.tackle(d); return; }
    if (s.yard >= 100) { this.touchdown(); return; }
    if (!s.fdDone && s.yard >= s.fdLine) { s.fdDone = true; this.beeper.play(TUNES.firstDown); }
  }

  // A tackler steps toward the runner, now and then holding its ground.
  chase(d) {
    const s = this.s, r = s.car;
    if (Math.random() < [0.25, 0.12][s.level - 1]) return;
    const dc = Math.sign(r.c - d.c), dr = Math.sign(r.r - d.r);
    const free = (c, rr) => !s.defs.some((o) => o !== d && o.c === c && o.r === rr);
    const tryRow = () => dr && free(d.c, d.r + dr) && ((d.r += dr), true);
    const tryCol = () => dc && free(d.c + dc, d.r) && ((d.c += dc), true);
    if (Math.random() < (dc ? 0.45 : 1)) { if (!tryRow()) tryCol(); } else if (!tryCol()) tryRow();
  }

  // ---------------------------------------------------------------- kicking

  // 4th down: the computer punts, or tries a field goal when it's close enough.
  kick() {
    const s = this.s;
    const toGoal = 100 - s.los;
    const fg = toGoal <= 38;
    // A kick goes 1 to 65 yards, most of them in the middle.
    const dist = 1 + rnd(33) + rnd(33);
    s.phase = 'kick';
    s.anim = { fg, dist, t: 0, len: 70, good: fg && dist >= toGoal + 7 };
    this.beeper.play(TUNES.snap);
  }

  kickTick() {
    const s = this.s, a = s.anim;
    if (++a.t < a.len) return;
    if (a.fg) {
      if (a.good) {
        s.home += 3;
        this.beeper.play(TUNES.charge);
        this.deadBall({ kind: 'cpu', at: 20 }, []);
      } else {
        // Missed: the Visitor takes over at the line of scrimmage (at least its own 20).
        this.beeper.play(TUNES.whistle2);
        this.deadBall({ kind: 'cpu', at: Math.max(20, 100 - s.los) }, []);
      }
      return;
    }
    // A punt: two whistles, and the Visitor's ball where it came down (its 20 if in the end zone).
    const land = s.los + a.dist;
    this.beeper.play(TUNES.whistle2);
    s.yard = Math.min(100, land);
    this.deadBall({ kind: 'cpu', at: land >= 100 ? 20 : 100 - land }, []);
  }

  // ---------------------------------------------------------------- end of play

  tackle(d) {
    const s = this.s;
    this.beeper.play(TUNES.whistle);
    const spot = Math.max(1, s.yard);
    const blink = [d, { ...s.car }];
    if (s.fdDone || spot >= s.fdLine) { s.down = 1; s.toGo = 10; }
    else if (s.down >= 4) {
      // Short on 4th down: two whistles, and the Visitor's ball where the runner stopped.
      this.beeper.then([[0, 400], ...TUNES.whistle2]);
      this.deadBall({ kind: 'cpu', at: 100 - spot }, blink);
      return;
    } else { s.down++; s.toGo = s.fdLine - spot; }
    s.los = spot;
    this.deadBall({ kind: 'scrimmage' }, blink);
  }

  // Play over: the tackler and runner blink until Status or Score sets up the next.
  deadBall(next, blink) {
    const s = this.s;
    s.phase = 'dead';
    s.t = 30;
    s.next = next;
    s.blink = blink.map((b) => ({ c: b.c, r: b.r }));
    if (s.clock <= 0 && !s.quarterOver) { s.quarterOver = true; this.beeper.then([[0, 300], ...TUNES.buzzer]); }
  }

  touchdown() {
    const s = this.s;
    s.home += 7;
    s.phase = 'td';
    s.t = 0;
    s.next = { kind: 'cpu', at: 20 };
    this.beeper.play(TUNES.charge);
    if (s.clock <= 0) s.quarterOver = true;
  }

  // Status or Score after a play: on to what comes next (the next quarter first, if it's time).
  // Quarters 2 and 4 carry on from where the last one stopped; the Visitor opens the second
  // half on its own 20.
  proceed() {
    const s = this.s;
    if (s.quarterOver) {
      s.quarterOver = false;
      if (s.qtr >= 4) { this.gameOver(); return; }
      s.qtr++;
      s.clock = QUARTER;
      if (s.qtr === 3) { this.cpuDrive(20); return; }
    }
    const n = s.next;
    s.next = null;
    if (!n || n.kind === 'scrimmage') this.setupScrimmage();
    else if (n.kind === 'cpu') this.cpuDrive(n.at);
  }

  gameOver() {
    const s = this.s;
    s.phase = 'over';
    s.display = 'score';
    s.clock = 0;
    this.beeper.play(TUNES.buzzer);
  }

  // ---------------------------------------------------------------- the Visitor's possessions

  // The computer's drive from `at` (yards from its own goal), decided by the odds, shown as
  // its runner working right to left across the field, then the result on the scoreboard.
  cpuDrive(at) {
    const s = this.s;
    const lv = s.level - 1, field = (at - 20) / 200, roll = Math.random();
    let result;
    if (roll < 0.14 + 0.04 * lv + field) result = 'td';
    else if (roll < 0.28 + 0.05 * lv + field) result = 'fg';
    else if (roll < 0.86) result = 'punt';
    else result = 'downs';
    s.phase = 'cpu';
    s.display = 'score';
    s.defs = []; s.blink = [];
    s.anim = { result, at, t: 0, len: 170, c: COLS - 1, r: 1 };
    s.clock = Math.max(0, s.clock - (180 + rnd(180)));
  }

  cpuTick() {
    const s = this.s, a = s.anim;
    a.t++;
    if (a.t % 7 === 0 && a.t < a.len - 40) {
      a.c = a.c > 0 ? a.c - 1 : COLS - 1;
      if (Math.random() < 0.3) a.r = Math.max(0, Math.min(ROWS - 1, a.r + (Math.random() < 0.5 ? -1 : 1)));
      this.beeper.play([[1300, 8]]);
    }
    if (a.t === a.len - 40) {
      if (a.result === 'td') { s.vis += 7; this.beeper.play(TUNES.charge); }
      else if (a.result === 'fg') { s.vis += 3; this.beeper.play(TUNES.charge); }
      else this.beeper.play(TUNES.whistle2);
    }
    if (a.t < a.len) return;
    // Your ball: on your 20 after a score, where a punt came down, or where its 4th down failed.
    if (a.result === 'td' || a.result === 'fg') s.los = 20;
    else if (a.result === 'punt') s.los = Math.max(5, Math.min(60, 100 - (a.at + 20 + rnd(25)) - (25 + rnd(20))));
    else s.los = Math.max(10, Math.min(80, 100 - (a.at + 10 + rnd(30))));
    s.down = 1; s.toGo = 10;
    if (s.clock <= 0) s.quarterOver = true;
    s.yard = s.los;
    if (s.quarterOver) { s.phase = 'dead'; s.t = 30; s.next = { kind: 'scrimmage' }; s.blink = []; return; }
    s.next = { kind: 'scrimmage' };
    this.proceed();
  }

  // ---------------------------------------------------------------- display

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    const at = (c, r, v) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) L[r * COLS + c] = Math.max(L[r * COLS + c], v); };
    const blink = (s.frame >> 3) & 1, slow = (s.frame >> 4) & 1;
    switch (s.phase) {
      case 'kick': {
        // The ball sails across the field.
        const a = s.anim;
        at(Math.floor((a.t * 0.4) % COLS), 1, 1);
        break;
      }
      case 'cpu': {
        const a = s.anim;
        if (a.t < a.len - 40) {
          at(a.c, a.r, 1);
          for (let i = 0; i < 3; i++) at((a.c + 2 + i) % COLS, (a.r + i) % ROWS, 0.22);
        }
        break;
      }
      case 'td':
        if (slow) for (let i = 0; i < COLS * ROWS; i++) L[i] = 0.7;
        break;
      case 'over': break;
      case 'dead':
        for (const d of s.defs) at(d.c, d.r, 0.22);
        for (const b of s.blink) L[b.r * COLS + b.c] = 0;
        for (const b of s.blink) at(b.c, b.r, blink ? (b.c === s.car.c && b.r === s.car.r ? 1 : 0.3) : 0);
        if (!s.blink.length && s.next?.kind === 'scrimmage') at(s.car.c, s.car.r, 1);
        break;
      default:
        for (const d of s.defs) at(d.c, d.r, 0.22);
        at(s.car.c, s.car.r, 1);
    }
    return { leds: L, digits: this.digits(), text: this.labels() };
  }

  displayMode() {
    const s = this.s;
    if (s.phase === 'over' || s.phase === 'cpu') return 'score';
    return s.display;
  }

  digits() {
    const s = this.s;
    if (s.phase === 'td' && !((s.frame >> 4) & 1)) return Array(7).fill(' ');
    if (this.displayMode() === 'score') {
      // Home score, time remaining in minutes and tenths (15.0, 7.5), Visitor score.
      const tenths = Math.round(s.clock / 6);
      const t = String(Math.floor(tenths / 10)).padStart(2, ' ');
      return [...pad2(s.home), t[0], `${t[1]}.`, String(tenths % 10), ...pad2(s.vis)];
    }
    // Status: down, field position (yards from the nearer goal, with a mark for the side of
    // the 50: before the number on your side, after it on theirs), yards to go (none when
    // it's fewer than 10 to the goal).
    const live = s.phase === 'live';
    const y = Math.max(0, Math.min(100, live ? s.yard : s.los));
    const fp = y <= 50 ? y : 100 - y;
    const field = y < 50 ? ['<', ...pad2(fp)] : y > 50 ? [...pad2(fp), '>'] : [' ', ...pad2(fp)];
    const togo = live ? s.fdLine - s.yard : s.toGo;
    const ytg = 100 - (live ? s.yard : s.los) < 10 || (live && s.fdDone) ? '  ' : pad2(Math.max(0, togo));
    return [' ', String(s.down), ...field, ...ytg];
  }

  labels() {
    const mode = this.displayMode();
    const on = 'rgba(235, 235, 225, 0.85)', off = 'rgba(235, 235, 225, 0.28)';
    const top = mode === 'status' ? on : off, bottom = mode === 'score' ? on : off;
    return [
      { text: 'DOWN', x: 67, y: 13, size: 6.5, color: top }, { text: 'FIELD POSITION', x: 150, y: 13, size: 6.5, color: top },
      { text: 'YARDS TO GO', x: 233, y: 13, size: 6.5, color: top },
      { text: 'HOME', x: 67, y: 64, size: 6.5, color: bottom }, { text: 'TIME REMAINING', x: 150, y: 64, size: 6.5, color: bottom },
      { text: 'VISITORS', x: 233, y: 64, size: 6.5, color: bottom },
    ];
  }

  // ---------------------------------------------------------------- saves

  saveState() { return structuredClone(this.s); }
  loadState(s) { this.s = structuredClone(s); }
}
