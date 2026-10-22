// Football 2: a recreation of the 1978 LED handheld football game, following
// its instruction manual.
//
// The field is 3 lanes by 10 yards. You (Home) attack to the right; the
// computer plays the Visitor's possessions, shown on the scoreboard. You're the
// bright blip; the five dim blips are the defense. Each arrow press moves one
// yard, in any direction. Run off the right end and you come back in at the
// left, facing the same defenders.
//
// A play starts one yard behind the line of scrimmage, with three linemen on
// the line (running straight into them is a tackle for a loss). When the play
// starts, a receiver (dim, blinking) appears among the tacklers and runs
// downfield. Pass, from behind the line, with the receiver in your lane: if a
// tackler between you hasn't crossed the line yet, it's intercepted; if the
// receiver isn't in your lane, it's incomplete.
//
// Kick at the start of a play punts. Step back exactly two yards and Kick for
// a field goal. Kickoffs open each half and follow scores; a kick that lands in
// the field is run back. After each play, Status (down, field position, yards
// to go) or Score (score and clock) sets up the next.

const COLS = 10, ROWS = 3;
const LEFT = 0x01, RIGHT = 0x02, UP = 0x04, DOWN = 0x08;
const PASS = 0x10, KICK = 0x20, STATUS = 0x40, SCORE = 0x80;
const ARROWS = LEFT | RIGHT | UP | DOWN;
const QUARTER = 15 * 60;                   // seconds
const LOS_COL = 3;                         // the line of scrimmage's column at the snap
// Frames between defensive moves (one tackler each time) and receiver steps, for Pro 1-4.
const DEF_STEP = [20, 13, 9, 6];
const REC_STEP = [26, 20, 15, 11];

const rnd = (n) => Math.floor(Math.random() * n);
const pad2 = (n) => String(Math.max(0, Math.min(99, n))).padStart(2, ' ');

function trill(ms) {
  const out = [];
  for (let t = 0; t < ms; t += 24) out.push([(t / 24) % 2 ? 3300 : 2750, 24]);
  return out;
}

export const TUNES = {
  step: [[1500, 10]],
  // A referee's whistle warbles: two high pitches trading places quickly.
  whistle: trill(380),
  whistle2: [...trill(300), [0, 140], ...trill(300)],
  tone: [[880, 350]],                      // runback signal
  tones2: [[880, 220], [0, 90], [660, 320]], // safety
  firstDown: [[1800, 70]],
  charge: [['g5', 120], ['c6', 120], ['e6', 120], ['g6', 240], ['e6', 120], ['g6', 480]],
  victory: [['c6', 110], ['c6', 110], ['c6', 110], ['g6', 330], ['e6', 110], ['g6', 520]],
  buzzer: [[150, 700]],
  snap: [[900, 20]],
  pass: [[1200, 30], [1500, 30], [1800, 30]],
};

export class Football2 {
  static id = 'football2';
  static title = 'Football 2';
  static year = 1978;
  // Button order sets their input bits (and keyboard keys Z, X, C, V).
  static actions = ['pass', 'kick', 'status', 'score'];
  // All the keys one size, the Pro switch on its own row beneath them.
  static controls = {
    columns: [['score', 'status', 'kick'], ['pass'], 'arrows'],
    split: 2,
    switchBelow: true,
    mirror: true,
    runRow: 'pass',                       // stacked on a phone: Pass beside the run keys
    buttons: {
      score: { label: 'Score', color: '#3e8fdc' }, status: { label: 'Status', color: '#3e8fdc' },
      kick: { label: 'Kick', color: '#3e8fdc' }, pass: { label: 'Pass', color: '#f2c230' },
    },
  };
  static levels = ['Pro 1', 'Pro 2', 'Pro 3', 'Pro 4'];
  static levelModifier = 'kick';          // hold Kick while moving the switch for Pro 3 / Pro 4
  // The case: dark green plastic, a darker control panel with a gold outline,
  // orange-red run keys, blue buttons and a yellow Pass button.
  static body = {
    case: '#1f4a2f', caseHi: '#2b5d3c', panel: '#173a25', trim: '#c9b07a', print: '#ece8dc',
    key: '#e2573a', keyInk: '#5a1a0e', plate: '#d6c493', plateInk: '#1d1a12', padLabel: 'RUN',
  };
  static help = 'Arrow keys move one yard per press. Off the end of the field you come back in at the start. '
    + 'Pass from behind the line to the receiver (the blinking blip) in your lane. Kick at the start of a play punts; '
    + 'step back two yards, then Kick, for a field goal. After each play, press Status or Score to line up the next. '
    + 'Hold Kick while moving the switch for Pro 3 and Pro 4. Keys: Z Pass, X Kick, C Status, V Score.';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = Football2.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.newGame(1);
  }

  // The display: the scoreboard strip (status labels above the digits, score labels
  // below), and the printed field (green surround, blue end zones, white lines on black).
  static makeLayout() {
    const leds = [], lines = [];
    const x0 = 28, dx = 26.5, y0 = 106, dy = 17;
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
    // Seven digits, grouped 2-3-2 as on the original (the clock's decimal point is on the middle one).
    const dh = 26, dyy = 38;
    const digits = [55, 79, 126, 150, 174, 221, 245].map((x) => ({ x, y: dyy, h: dh }));
    return { w: 300, h: 160, leds, lines, rects, digits, lineColor: 'rgba(235, 235, 225, 0.75)', lineWidth: 0.9, textColor: 'rgba(225, 225, 215, 0.38)' };
  }

  // ---------------------------------------------------------------- game flow

  newGame(level = this.s?.level || 1) {
    this.s = {
      level, home: 0, vis: 0, qtr: 1, clock: QUARTER, frame: 0,
      phase: 'kickoff', t: 0, display: 'status',
      yard: 35, los: 35, down: 1, toGo: 10, fdLine: 45, fdDone: false,
      car: { c: 2, r: 1 }, carrier: 'qb', rec: null, defs: [], defT: 0, defTurn: 0,
      fgSeq: 0, kicker: 'home', next: null, quarterOver: false, anim: null, blink: [], msg: null,
    };
    this.setupKickoff('home', 35);
  }

  setSkill(level) { this.s.level = level; }

  // Kickoff formation: the ball (bright) and the kicker (dim), both blinking.
  setupKickoff(by, from) {
    const s = this.s;
    s.phase = 'kickoff';
    s.kicker = by;
    s.kickFrom = from;
    s.t = 0;
    s.defs = []; s.rec = null; s.blink = [];
    s.display = 'status';
    s.yard = by === 'home' ? from : 100 - from;
    s.car = by === 'home' ? { c: 3, r: 1 } : { c: 6, r: 1 };
  }

  setupScrimmage() {
    const s = this.s;
    s.phase = 'ready';
    s.los = Math.max(1, Math.min(99, s.los));
    s.toGo = Math.min(s.toGo, 100 - s.los);
    s.fdLine = s.los + s.toGo;
    s.fdDone = false;
    s.yard = s.los - 1;                     // the quarterback starts a yard behind the line
    s.car = { c: LOS_COL - 1, r: 1 };
    s.carrier = 'qb';
    s.rec = null;
    s.fgSeq = 0;
    s.blink = [];
    s.defs = [
      { c: LOS_COL, r: 0 }, { c: LOS_COL, r: 1 }, { c: LOS_COL, r: 2 },   // linemen, on the line
      { c: LOS_COL + 3, r: rnd(3) },                                     // linebacker
      { c: COLS - 2, r: rnd(3) },                                        // safety
    ];
    s.defT = 0;
  }

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (pressed & STATUS) s.display = 'status';
    if (pressed & SCORE) s.display = 'score';
    switch (s.phase) {
      case 'kickoff': this.kickoffTick(pressed); break;
      case 'flight': this.flightTick(); break;
      case 'runwait':
        // A kick to be run back: the carrier waits; an arrow starts the runback.
        if (pressed & ARROWS) this.startRunback(pressed);
        break;
      case 'ready':
        if (pressed & KICK) { this.punt(); break; }
        if (pressed & ARROWS) this.snap(pressed);
        break;
      case 'live': this.live(pressed); break;
      case 'pass': this.passTick(); break;
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

  // ---------------------------------------------------------------- kicks

  kickoffTick(pressed) {
    const s = this.s;
    s.t++;
    // You kick with Kick; the Visitor kicks on its own after a moment.
    if ((s.kicker === 'home' && pressed & KICK) || (s.kicker === 'vis' && s.t === 70)) {
      this.beeper.play(TUNES.charge);
      const dist = 40 + rnd(26);
      this.startFlight('kickoff', dist);
    }
  }

  // The ball in the air: it crosses the field (several times, as the yardage scrolls)
  // with everyone else off the display.
  startFlight(kind, dist) {
    const s = this.s;
    const dir = s.kicker === 'home' ? 1 : -1;
    s.phase = 'flight';
    s.anim = { kind, from: s.yard, dist, dir, t: 0, len: Math.max(40, dist * 2) };
    s.defs = []; s.rec = null;
  }

  flightTick() {
    const s = this.s, a = s.anim;
    a.t++;
    s.yard = Math.round(a.from + a.dir * a.dist * Math.min(1, a.t / a.len));
    if (a.t < a.len) return;
    const land = a.from + a.dir * a.dist;
    switch (a.kind) {
      case 'kickoff': case 'punt':
        if (s.kicker === 'home') {
          // To the Visitor: a touchback, or a runback, and then its drive (played by the computer).
          if (land >= 100) { this.beeper.play(TUNES.whistle2); this.cpuDrive(20); }
          else { this.beeper.play(TUNES.tone); this.cpuDrive(100 - land + rnd(16)); }
        } else if (land <= 0) {
          // Touchback: your ball on the 20.
          this.beeper.play(TUNES.whistle2);
          s.los = 20; s.down = 1; s.toGo = 10; s.yard = 20;
          this.deadBall({ kind: 'scrimmage' }, []);
        } else {
          // Run it back: the ball's down, the defense not yet in view.
          this.beeper.play(TUNES.tone);
          s.phase = 'runwait';
          s.yard = land;
          s.car = { c: 1, r: 1 };
          s.carrier = 'run';
          s.defs = [];
        }
        break;
      case 'fg': {
        if (a.good) {
          s.home += 3;
          this.beeper.play(TUNES.victory);
          this.deadBall({ kind: 'kickoff', by: 'home', from: 35 }, []);
        } else {
          // Missed: the Visitor takes over at the line of scrimmage (at least its own 20).
          this.beeper.play(TUNES.whistle2);
          this.deadBall({ kind: 'cpu', at: Math.max(20, 100 - s.los) }, []);
        }
        break;
      }
    }
  }

  punt() {
    const s = this.s;
    s.kicker = 'home';
    s.yard = s.los;
    this.beeper.play(TUNES.snap);
    this.startFlight('punt', 30 + rnd(26));
  }

  fieldGoal() {
    const s = this.s;
    const dist = 100 - s.yard + 10;         // to the goal posts, at the back of the end zone
    s.kicker = 'home';
    this.beeper.play(TUNES.snap);
    this.startFlight('fg', 100 - s.yard);
    s.anim.good = Math.random() < Math.max(0.05, Math.min(0.95, 1.3 - dist / 45));
  }

  startRunback(pressed) {
    const s = this.s;
    s.phase = 'live';
    s.fdLine = 999; s.fdDone = true; s.los = s.yard;
    // The tacklers appear ahead.
    s.defs = [{ c: 4, r: 0 }, { c: 5, r: 2 }, { c: 6, r: 1 }, { c: 8, r: 0 }, { c: 9, r: 2 }];
    s.defT = DEF_STEP[s.level - 1] + 10;
    s.fgSeq = -1;
    this.move(pressed);
  }

  // ---------------------------------------------------------------- scrimmage

  snap(pressed) {
    const s = this.s;
    s.phase = 'live';
    s.defT = DEF_STEP[s.level - 1] + 10;
    s.defTurn = rnd(s.defs.length);
    // The receiver appears among the tacklers, in any lane.
    const free = [];
    for (let c = LOS_COL + 1; c <= LOS_COL + 4; c++) for (let r = 0; r < ROWS; r++) if (!this.defAt(c, r)) free.push({ c, r });
    const spot = free[rnd(free.length)];
    s.rec = { c: spot.c, r: spot.r, t: REC_STEP[s.level - 1] };
    this.beeper.play(TUNES.snap);
    this.move(pressed);
  }

  defAt(c, r) { return this.s.defs.find((d) => d.c === c && d.r === r) || null; }

  live(pressed) {
    const s = this.s;
    // The clock runs during play, six times real time.
    if (s.frame % 10 === 0 && s.clock > 0) s.clock--;
    if (pressed & KICK && s.carrier === 'qb' && s.fgSeq === 2) { this.fieldGoal(); return; }
    if (pressed & PASS && s.carrier === 'qb') { this.throwPass(); return; }
    if (pressed & ARROWS) { this.move(pressed); if (s.phase !== 'live') return; }
    // The receiver runs downfield, around tacklers when he can, and stops at the end.
    const rec = s.rec;
    if (rec && --rec.t <= 0) {
      rec.t = REC_STEP[s.level - 1];
      if (rec.c < COLS - 1) {
        if (!this.defAt(rec.c + 1, rec.r) && !(s.car.c === rec.c + 1 && s.car.r === rec.r)) rec.c++;
        else {
          const lanes = [rec.r - 1, rec.r + 1].filter((r) => r >= 0 && r < ROWS && !this.defAt(rec.c, r));
          if (lanes.length) rec.r = lanes[rnd(lanes.length)];
        }
      }
    }
    // The defense moves one tackler at a time, taking turns.
    if (--s.defT > 0) return;
    s.defT = DEF_STEP[s.level - 1];
    s.defTurn = (s.defTurn + 1) % s.defs.length;
    const d = s.defs[s.defTurn];
    this.chase(d);
    if (d.c === s.car.c && d.r === s.car.r) this.tackle(d);
  }

  // The ball carrier: one yard per press, any direction. Off the right end he comes
  // back in at the left; the left end is as far back as he goes.
  move(pressed) {
    const s = this.s, r = s.car;
    let dir = 0;
    for (const b of [RIGHT, LEFT, UP, DOWN]) if (pressed & b) { dir = b; break; }
    if (!dir) return;
    // A field goal try is exactly two steps back and then Kick.
    if (s.carrier === 'qb') s.fgSeq = dir === LEFT && s.fgSeq >= 0 && s.fgSeq < 2 ? s.fgSeq + 1 : -1;
    let nc = r.c, nr = r.r, dy = 0;
    if (dir === RIGHT) { nc = r.c < COLS - 1 ? r.c + 1 : 0; dy = 1; }
    else if (dir === LEFT) { if (r.c === 0 || s.yard <= -9) return; nc = r.c - 1; dy = -1; }
    else if (dir === UP) { if (r.r === 0) return; nr = r.r - 1; }
    else { if (r.r === ROWS - 1) return; nr = r.r + 1; }
    // The receiver is your own man: you can't run through him.
    if (s.rec && s.rec.c === nc && s.rec.r === nr) return;
    r.c = nc; r.r = nr; s.yard += dy;
    this.beeper.play(TUNES.step);
    const d = this.defAt(r.c, r.r);
    if (d) { this.tackle(d); return; }
    if (s.yard >= 100) { this.touchdown(); return; }
    if (!s.fdDone && s.yard >= s.fdLine) { s.fdDone = true; this.beeper.play(TUNES.firstDown); }
  }

  // A tackler steps toward the ball carrier, now and then holding its ground.
  chase(d) {
    const s = this.s, r = s.car;
    if (Math.random() < [0.3, 0.2, 0.12, 0.06][s.level - 1]) return;
    const dc = Math.sign(r.c - d.c), dr = Math.sign(r.r - d.r);
    const free = (c, rr) => !s.defs.some((o) => o !== d && o.c === c && o.r === rr) && !(s.rec && s.rec.c === c && s.rec.r === rr);
    const tryRow = () => dr && free(d.c, d.r + dr) && ((d.r += dr), true);
    const tryCol = () => dc && free(d.c + dc, d.r) && ((d.c += dc), true);
    if (Math.random() < (dc ? 0.45 : 1)) { if (!tryRow()) tryCol(); } else if (!tryCol()) tryRow();
  }

  // ---------------------------------------------------------------- passing

  throwPass() {
    const s = this.s, qb = s.car;
    // Only from behind the line of scrimmage.
    if (s.yard >= s.los) return;
    const lane = qb.r, rec = s.rec && s.rec.r === lane && s.rec.c > qb.c ? s.rec : null;
    const target = rec ? rec.c : COLS - 1;
    // A tackler in the lane between, that hasn't crossed the line, intercepts.
    const picks = s.defs.filter((d) => d.r === lane && d.c > qb.c && d.c < target + (rec ? 0 : 1) && d.c >= LOS_COL).sort((a, b) => a.c - b.c);
    const result = picks.length ? 'int' : rec ? 'complete' : 'incomplete';
    const to = result === 'int' ? picks[0].c : target;
    s.phase = 'pass';
    s.anim = { from: qb.c, to, r: lane, t: 0, result, at: result === 'int' ? picks[0] : null };
    this.beeper.play(TUNES.pass);
  }

  passTick() {
    const s = this.s, a = s.anim;
    a.t++;
    if (a.t < (a.to - a.from) * 5 + 6) return;
    if (a.result === 'complete') {
      // The receiver has it: he's the ball carrier now.
      s.yard += s.rec.c - s.car.c;
      s.car = { c: s.rec.c, r: s.rec.r };
      s.rec = null;
      s.carrier = 'rec';
      s.phase = 'live';
      if (s.yard >= 100) { this.touchdown(); return; }
      if (!s.fdDone && s.yard >= s.fdLine) { s.fdDone = true; this.beeper.play(TUNES.firstDown); }
    } else if (a.result === 'int') {
      // Intercepted: the Visitor's ball where it was picked off.
      const at = s.yard + (a.at.c - s.car.c);
      this.beeper.play(TUNES.whistle2);
      this.deadBall({ kind: 'cpu', at: Math.max(1, 100 - at) }, [a.at]);
    } else {
      // Incomplete: back to the line of scrimmage for the next down.
      this.beeper.play(TUNES.whistle);
      s.yard = s.los;
      this.endPlay([]);
    }
  }

  // ---------------------------------------------------------------- end of play

  tackle(d) {
    const s = this.s;
    if (s.yard <= 0 && s.carrier !== 'run') {
      // Tackled in your own end zone: a safety, and you free kick from your 20.
      s.vis += 2;
      this.beeper.play(TUNES.tones2);
      this.deadBall({ kind: 'kickoff', by: 'home', from: 20 }, [d, s.car]);
      return;
    }
    this.beeper.play(TUNES.whistle);
    this.endPlay([d, { ...s.car }]);
  }

  // Spot the ball: next down, first down, or turnover on downs.
  endPlay(blink) {
    const s = this.s;
    const spot = Math.max(1, s.yard);
    if (s.carrier === 'run' || s.fdDone || spot >= s.fdLine) {
      s.down = 1; s.toGo = 10;
    } else if (s.down >= 4) {
      this.beeper.then([[0, 400], ...TUNES.whistle2]);
      this.deadBall({ kind: 'cpu', at: 100 - spot }, blink);
      return;
    } else { s.down++; s.toGo = s.fdLine - spot; }
    s.los = spot;
    this.deadBall({ kind: 'scrimmage' }, blink);
  }

  // Play over: the carrier and tackler blink until Status or Score sets up the next.
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
    s.next = { kind: 'kickoff', by: 'home', from: 35 };
    this.beeper.play(TUNES.victory);
    if (s.clock <= 0) s.quarterOver = true;
  }

  // Status or Score after a play: on to what comes next (the next quarter first, if it's time).
  proceed() {
    const s = this.s;
    if (s.quarterOver) {
      s.quarterOver = false;
      if (s.qtr >= 4) { this.gameOver(); return; }
      s.qtr++;
      s.clock = QUARTER;
      // The second half opens with the Visitor kicking off to you.
      if (s.qtr === 3) { this.setupKickoff('vis', 35); return; }
    }
    const n = s.next;
    s.next = null;
    if (!n || n.kind === 'scrimmage') this.setupScrimmage();
    else if (n.kind === 'kickoff') this.setupKickoff(n.by, n.from);
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

  // The computer's drive, from `at` (yards from its own goal): decided by the odds,
  // shown as its runner working across the field, then the result on the scoreboard.
  cpuDrive(at) {
    const s = this.s;
    const lv = s.level - 1, field = (at - 25) / 220, roll = Math.random();
    let result;
    if (roll < 0.06) result = 'turnover';
    else if (roll < 0.06 + 0.22 + 0.04 * lv + field) result = 'td';
    else if (roll < 0.06 + 0.40 + 0.05 * lv + field) result = 'fg';
    else result = 'punt';
    s.phase = 'cpu';
    s.display = 'score';
    s.defs = []; s.rec = null; s.blink = [];
    s.anim = { result, at, t: 0, len: 170, c: COLS - 1, r: 1 };
    s.clock = Math.max(0, s.clock - (90 + rnd(150)));
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
      if (a.result === 'td') { s.vis += 7; this.beeper.play(TUNES.victory); }
      else if (a.result === 'fg') { s.vis += 3; this.beeper.play(TUNES.victory); }
      else this.beeper.play(TUNES.whistle2);
    }
    if (a.t < a.len) return;
    // Your ball next: a kickoff after a score, a punt to run back, or a turnover.
    if (s.clock <= 0) s.quarterOver = true;
    if (a.result === 'td' || a.result === 'fg') this.queueOrDo({ kind: 'kickoff', by: 'vis', from: 35 });
    else if (a.result === 'punt') this.queueOrDo({ kind: 'visPunt' });
    else { s.los = Math.max(10, Math.min(80, 100 - (a.at + 15 + rnd(30)))); s.down = 1; s.toGo = 10; this.queueOrDo({ kind: 'scrimmage' }); }
  }

  // After the Visitor's drive: if the quarter's over, wait for Status/Score; else go on.
  queueOrDo(next) {
    const s = this.s;
    if (next.kind === 'visPunt') {
      // The Visitor punts to you from about its 30-40.
      s.kicker = 'vis';
      s.yard = 100 - (25 + rnd(20));
      next = { kind: 'punt-in' };
    }
    if (s.quarterOver) { s.phase = 'dead'; s.t = 30; s.next = next.kind === 'punt-in' ? { kind: 'kickoff', by: 'vis', from: 100 - s.yard } : next; s.blink = []; return; }
    if (next.kind === 'punt-in') { this.startFlight('punt', 35 + rnd(20)); return; }
    s.next = next;
    this.proceed();
  }

  // ---------------------------------------------------------------- display

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    const at = (c, r, v) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) L[r * COLS + c] = Math.max(L[r * COLS + c], v); };
    const blink = (s.frame >> 3) & 1, slow = (s.frame >> 4) & 1;
    switch (s.phase) {
      case 'kickoff': {
        const k = s.car;
        at(k.c, k.r, blink ? 1 : 0.35);
        at(k.c + (s.kicker === 'home' ? -2 : 2), k.r, blink ? 0.25 : 0.08);
        break;
      }
      case 'flight': {
        const a = s.anim;
        // The ball crosses the field again and again while it's in the air.
        const p = (a.t * 0.35) % COLS;
        at(a.dir > 0 ? Math.floor(p) : COLS - 1 - Math.floor(p), 1, 1);
        break;
      }
      case 'pass': {
        const a = s.anim;
        for (const d of s.defs) at(d.c, d.r, 0.22);
        if (s.rec) at(s.rec.c, s.rec.r, 0.22);
        at(Math.min(a.to, a.from + Math.floor(a.t / 5)), a.r, 1);
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
        // The whole display flashes.
        if (slow) for (let i = 0; i < COLS * ROWS; i++) L[i] = 0.7;
        break;
      case 'over': break;
      default: {
        for (const d of s.defs) at(d.c, d.r, 0.22);
        if (s.rec) at(s.rec.c, s.rec.r, blink ? 0.24 : 0.06);
        if (s.phase === 'dead') {
          for (const b of s.blink) L[b.r * COLS + b.c] = 0;
          for (const b of s.blink) at(b.c, b.r, blink ? (b.c === s.car.c && b.r === s.car.r ? 1 : 0.3) : 0);
          if (!s.blink.length && s.next?.kind !== 'cpu') at(s.car.c, s.car.r, 1);
        } else at(s.car.c, s.car.r, 1);
      }
    }
    return { leds: L, digits: this.digits(), text: this.labels() };
  }

  displayMode() {
    const s = this.s;
    if (s.phase === 'over' || s.phase === 'cpu') return 'score';
    return s.display;
  }

  shownYard() {
    const s = this.s;
    return s.phase === 'live' || s.phase === 'flight' || s.phase === 'runwait' || s.phase === 'kickoff' ? s.yard : s.los;
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
    // Status: down, field position (yards from the nearer goal, with a mark for the side
    // of the 50 the ball is on: ⊢ before the number on your side, ⊣ after it on theirs),
    // yards to go (dark when it's goal to go, or on a runback).
    const y = Math.max(0, Math.min(100, this.shownYard()));
    const fp = y <= 50 ? y : 100 - y;
    const field = y < 50 ? ['<', ...pad2(fp)] : y > 50 ? [...pad2(fp), '>'] : [' ', ...pad2(fp)];
    const live = s.phase === 'live';
    const scrimmage = s.phase === 'ready' || (live && s.carrier !== 'run') || s.phase === 'dead' || s.phase === 'pass';
    const togo = live ? s.fdLine - s.yard : s.toGo;
    const goalToGo = s.fdLine >= 100;
    const down = scrimmage ? String(s.down) : ' ';
    const ytg = scrimmage && !goalToGo && !(live && s.fdDone) ? pad2(Math.max(0, togo)) : '  ';
    return [' ', down, ...field, ...ytg];
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
