// Baseball: a recreation of the 1978 LED handheld baseball game, following its
// instruction manual. The computer pitches and fields; you bat and run.
//
// Press Pitch, and after a pause (1.5 to 2.5 seconds) the pitch comes in down
// the lights from the mound: fast, medium or slow, straight or a curve. Press
// Hit while it's in the strike zone (the last two lights before the plate, and
// the plate). Swing too soon, too late or not at all and it's a strike (or, if
// you let it go, perhaps a ball). Make contact and the light of the fielder it
// went to comes on: flashing is a fly out; steady is a hit, and the beeps (one,
// two or three) say how many bases it might be worth.
//
// Then hold Run: the runners advance, at a speed picked for this batter (slow,
// medium or fast), until you let go. When the fielder's light goes out the ball
// is back in: a batter short of first is out; otherwise, if anyone's caught
// between bases, the lead runner is out and the rest go back (if just past a
// base) or on (if nearly at the next). Four balls walk the batter (press Run).
// A home run flashes the whole field; hold Run to bring everyone home.
//
// Five innings; it can end in a tie. You're the Visitors (batting first); the
// computer bats for Home, with the same pitching and fielding. After three
// outs, press Score to start the next half-inning; Score also shows the score
// between batters.

const PITCH = 0x10, HIT = 0x20, RUN = 0x40, SCORE = 0x80;
const INNINGS = 5;

// The 28 lights (positions from the original's layout, in its units).
const SPOTS = [
  [17, 25.6],                                                       // 0 home plate
  [19.866, 22.733], [22.733, 19.866], [25.6, 17],                   // 1-3 to first base
  [22.733, 14.133], [19.866, 11.266], [17, 8.4],                    // 4-6 to second
  [14.133, 11.266], [11.266, 14.133], [8.4, 17],                    // 7-9 to third
  [11.266, 19.866], [14.133, 22.733],                               // 10-11 toward home
  [17, 14.85], [17, 16.72], [17, 18.59], [17, 20.46], [17, 22.33], [17, 24.2],   // 12-17 the pitch, mound to plate
  [18.05, 16.72], [18.35, 18.59], [18.05, 20.46],                   // 18-20 a curve's path
  [17, 27.0], [17, 28.1],                                           // 21-22 past the plate
  [26.2, 13.26], [7.8, 13.26],                                      // 23 deep first, 24 deep third
  [8.2, 6.33], [17, 3.4], [25.8, 6.33],                             // 25 left, 26 center, 27 right field
];
const STRAIGHT = [12, 13, 14, 15, 16, 17, 0, 21, 22];
const CURVE = [12, 18, 19, 20, 16, 17, 0, 21, 22];
const ZONE = [4, 5, 6];                    // path steps in the strike zone (A, B, C)
const DEEP_FIRST = 23, DEEP_THIRD = 24, OUTFIELD = [25, 26, 27];
const pathLed = (pos) => (pos % 12 === 0 ? 0 : pos);   // runner position 0-12 (12 = scored) to its light

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

export const TUNES = {
  squeak: [[2900, 22], [3500, 28]],
  plop: [[700, 40], [560, 40], [450, 45], [360, 50], [290, 70]],
  taTa: [['g5', 110], [0, 30], ['c6', 200]],
  beep: [[1500, 70]],
  horn: [[220, 550]],
  bigHorn: [[180, 500], [0, 60], [180, 900]],
};

export class Baseball {
  static id = 'baseball';
  static title = 'Baseball';
  static year = 1978;
  static actions = ['pitch', 'hit', 'run', 'score'];
  static controls = {
    columns: [['score', 'pitch'], ['switch'], ['run', 'hit']],
    split: 2,
    buttons: {
      score: { label: 'Score', color: '#3e8fdc' }, pitch: { label: 'Pitch', color: '#3e8fdc' },
      run: { label: 'Run', color: '#3e8fdc' }, hit: { label: 'Hit', color: '#e4483a' },
    },
  };
  static levels = ['Pro 1', 'Pro 2'];
  // The case: tan plastic, a dark control panel with a gold outline, no arrow keys.
  static body = {
    case: '#b49d72', caseHi: '#c9b48a', panel: '#2e2620', trim: '#c9b07a', print: '#ece8dc',
    plate: '#e6dcc0', plateInk: '#1d1a12', grille: 'rgba(60, 45, 25, 0.45)',
  };
  static help = 'Pitch, then Hit when the ball is in the strike zone (the last lights before the plate). '
    + 'A steady fielder light is a hit: the beeps say how many bases it might be worth. Hold Run to run; '
    + 'let go to stop. Anyone caught between bases when the fielder\'s light goes out may be out. '
    + 'After three outs, press Score for the next half-inning. You bat first; the computer bats second. '
    + 'Keys: Z Pitch, X Hit, C Run (hold), V Score.';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = Baseball.makeLayout();
    this.leds = new Float32Array(SPOTS.length);
    this.newGame(1);
  }

  // The display: the scoreboard strip, and the field (grass, the dirt arc and base
  // paths, white bases and foul lines) with the lights on it.
  static makeLayout() {
    const k = 8.3, X = (x) => 120 + (x - 17) * k, Y = (y) => 82 + (y - 3.4) * k;
    const leds = SPOTS.map(([x, y]) => ({ x: X(x), y: Y(y), w: 7, h: 7 }));
    const diamond = (cx, cy, r) => [X(cx), Y(cy - r), X(cx + r), Y(cy), X(cx), Y(cy + r), X(cx - r), Y(cy)];
    const rects = [
      // Scoreboard: a light panel with four black windows.
      { x: 4, y: 3, w: 232, h: 63, color: '#c4c4be', r: 4 },
      ...[0, 1, 2, 3].map((i) => ({ x: 9 + i * 56, y: 17, w: 54, h: 30, color: '#080404' })),
      // The field.
      { x: 0, y: 70, w: 240, h: 230, color: '#3f8a3c' },
      { cx: X(17), cy: Y(16.4), radius: 11.4 * k, color: '#0b0707' },        // the dirt arc
      { cx: X(17), cy: Y(26.6), radius: 2.6 * k, color: '#0b0707' },         // around home plate
      { points: diamond(17, 17, 7.2), color: '#3f8a3c' },                    // infield grass
      { cx: X(17), cy: Y(14.85), radius: 1.3 * k, color: '#0b0707' },        // the mound
      // Bases: white squares (the lights sit on them).
      ...[[25.6, 17], [17, 8.4], [8.4, 17]].flatMap(([x, y]) => [
        { points: diamond(x, y, 1.15), color: '#e8e8e2' }, { points: diamond(x, y, 0.8), color: '#0b0707' }]),
      { points: [X(16.2), Y(25.0), X(17.8), Y(25.0), X(17.8), Y(26.0), X(17), Y(26.7), X(16.2), Y(26.0)], color: '#e8e8e2' },
      { points: [X(16.5), Y(25.25), X(17.5), Y(25.25), X(17.5), Y(25.9), X(17), Y(26.35), X(16.5), Y(25.9)], color: '#0b0707' },
    ];
    // Foul lines, from home past first and third.
    const lines = [
      { x1: X(17.9), y1: Y(24.7), x2: X(35), y2: Y(7.6) },
      { x1: X(16.1), y1: Y(24.7), x2: X(-1), y2: Y(7.6) },
    ];
    const digits = [0, 1, 2, 3].map((i) => ({ x: 36 + i * 56, y: 32, h: 22 }));
    return { w: 240, h: 300, leds, rects, lines, digits, lineColor: 'rgba(240, 240, 232, 0.85)', lineWidth: 1.4 };
  }

  // ---------------------------------------------------------------- game flow

  newGame(level = this.s?.level || 1) {
    this.s = {
      level, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0, vis: 0, home: 0,
      runners: [],                         // { pos: 0-11, batter }: 3 first, 6 second, 9 third
      phase: 'idle', t: 0, frame: 0, pitch: null, swing: null, fielder: -1, fieldT: 0,
      runStep: 16, runT: 0, showScore: 0, flash: 0, ai: { t: 0 }, lastFielder: -1,
    };
  }

  setSkill(level) { this.s.level = level; }

  // Everything runs faster on Pro 2.
  pace(frames) { return Math.max(2, Math.round(frames * (this.s.level === 2 ? 0.7 : 1))); }

  cpuBats() { return this.s.half === 'bottom'; }

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (s.showScore > 0) s.showScore--;
    if (s.flash > 0) s.flash--;
    // The computer bats for Home: its presses stand in for yours (Score stays yours).
    if (this.cpuBats() && s.phase !== 'halfover' && s.phase !== 'over') {
      const ai = this.aiInput();
      held = (held & SCORE) | ai.held;
      pressed = (pressed & SCORE) | ai.pressed;
    }
    if (pressed & SCORE) {
      if (s.phase === 'halfover') { this.nextHalf(); return; }
      if (s.phase === 'idle' || s.phase === 'over') s.showScore = 120;
    }
    switch (s.phase) {
      case 'idle': if (pressed & PITCH) this.windup(); break;
      case 'windup':
        if (pressed & HIT) { this.swingEarly(); break; }
        if (--s.t <= 0) this.deliver();
        break;
      case 'pitch': this.pitchTick(pressed); break;
      case 'swung': if (--s.t <= 0) this.afterSwing(); break;
      case 'called': if (--s.t <= 0) this.endPitch(); break;
      case 'flyout': if (--s.t <= 0) this.endPitch(); break;
      case 'hit': this.runTick(held); break;
      case 'walk': if (pressed & RUN) this.walk(); break;
      case 'homer': this.homerTick(held); break;
      case 'halfover': break;
      case 'over': break;
    }
  }

  // ---------------------------------------------------------------- the pitch

  windup() {
    const s = this.s;
    s.phase = 'windup';
    s.t = 90 + rnd(61);                     // 1.5 to 2.5 seconds
    s.swing = null; s.fielder = -1;
  }

  deliver() {
    const s = this.s;
    const curve = Math.random() < 0.4;
    const speed = pick(['fast', 'medium', 'slow']);
    const step = this.pace({ fast: 6, medium: 9, slow: 13 }[speed]);
    s.pitch = { path: curve ? CURVE : STRAIGHT, curve, speed, idx: 0, t: step, step };
    s.phase = 'pitch';
  }

  pitchTick(pressed) {
    const s = this.s, p = s.pitch;
    if (pressed & HIT) { this.swingAt(p.idx); return; }
    if (--p.t > 0) return;
    p.t = p.step;
    p.idx++;
    if (p.idx >= p.path.length) {
      // No swing: the umpire calls it. Curves miss the zone more often.
      s.phase = 'called';
      s.t = 20;
      if (Math.random() < (p.curve ? 0.35 : 0.6)) s.strikes++; else s.balls++;
      this.beeper.play(TUNES.squeak);
    }
  }

  swingEarly() {
    const s = this.s;
    s.swing = { idx: -1, contact: false };
    s.phase = 'swung';
    s.t = 20;
  }

  // The swing: only in the zone can it connect, best in the middle of it.
  swingAt(idx) {
    const s = this.s, p = s.pitch;
    let contact = false, sweet = false;
    if (ZONE.includes(idx)) {
      sweet = idx === ZONE[1];
      let chance = sweet ? (p.curve ? 0.5 : 0.7) : (p.curve ? 0.28 : 0.42);
      chance += p.speed === 'slow' ? 0.1 : p.speed === 'fast' ? -0.1 : 0;
      contact = Math.random() < chance;
    }
    s.swing = { idx, led: p.path[idx], contact, sweet };
    s.phase = 'swung';
    s.t = 30;                                // the ball's light stays a moment where you swung
  }

  afterSwing() {
    const s = this.s, sw = s.swing;
    if (!sw.contact) { s.strikes++; this.beeper.play(TUNES.squeak); this.endPitch(); return; }
    // Contact: where it went, and what it's worth.
    const roll = Math.random();
    const odds = sw.sweet ? [0.48, 0.78, 0.92, 0.965] : [0.62, 0.87, 0.96, 0.99];   // fly out, 1, 2, 3 bases, else home run
    const bases = roll < odds[0] ? 0 : roll < odds[1] ? 1 : roll < odds[2] ? 2 : roll < odds[3] ? 3 : 4;
    if (bases === 0) {
      s.fielder = pick([DEEP_FIRST, DEEP_THIRD, ...OUTFIELD]);
      s.outs++;
      s.phase = 'flyout';
      s.t = 90;
      this.beeper.play(TUNES.plop);
      return;
    }
    if (bases === 4) { this.homeRun(); return; }
    s.fielder = bases === 1 ? pick([DEEP_FIRST, DEEP_THIRD, ...OUTFIELD]) : pick(OUTFIELD);
    // The beeps: how many bases it might be worth.
    const beeps = [];
    for (let i = 0; i < bases; i++) beeps.push(...TUNES.beep, [0, 90]);
    this.beeper.play(beeps);
    // The batter's running speed, and how long until the ball is back in: longer for a
    // longer hit, and more or less depending on how near the fielder it went.
    s.runStep = this.pace(pick([22, 16, 12]));
    s.fieldT = Math.round(this.pace(60 * (0.55 + 0.85 * bases)) * (0.75 + Math.random() * 0.55));
    s.runT = 0;
    s.runners.push({ pos: 0, batter: true });
    s.hitBases = bases;
    s.phase = 'hit';
    s.balls = 0; s.strikes = 0;
  }

  // The count after a pitch: strike three, ball four, or the next pitch.
  endPitch() {
    const s = this.s;
    if (s.strikes >= 3) { s.outs++; s.balls = 0; s.strikes = 0; this.beeper.then(TUNES.plop); }
    if (s.balls >= 4) { s.phase = 'walk'; return; }
    if (s.phase === 'flyout') { s.balls = 0; s.strikes = 0; }
    this.nextBatterOrSide();
  }

  nextBatterOrSide() {
    const s = this.s;
    s.phase = 'idle';
    s.fielder = -1;
    s.pitch = null;
    if (s.outs >= 3) this.sideRetired();
  }

  // ---------------------------------------------------------------- running

  // Hold Run to advance everyone a light at a time; when the fielder's light goes out,
  // the play's over.
  runTick(held) {
    const s = this.s;
    if (held & RUN) {
      if (++s.runT >= s.runStep) {
        s.runT = 0;
        for (const r of s.runners) r.pos++;
        this.scoreRunners();
      }
    }
    if (--s.fieldT > 0) return;
    // The ball's in. Anyone between bases?
    const out = [];
    const batter = s.runners.find((r) => r.batter);
    if (batter && batter.pos < 3) {
      out.push(batter);
      for (const r of s.runners) if (r !== batter) r.pos = Math.floor(r.pos / 3) * 3;
    } else if (s.runners.some((r) => r.pos % 3)) {
      const lead = s.runners.reduce((a, b) => (b.pos > a.pos ? b : a));
      out.push(lead);
      for (const r of s.runners) if (r !== lead) r.pos = r.pos % 3 === 1 ? r.pos - 1 : r.pos % 3 === 2 ? r.pos + 1 : r.pos;
    }
    s.runners = s.runners.filter((r) => !out.includes(r));
    s.outs += out.length;
    if (out.length) this.beeper.play(TUNES.plop);
    this.scoreRunners();
    for (const r of s.runners) r.batter = false;
    this.nextBatterOrSide();
  }

  // Runners reaching home score: a "ta ta!" for each.
  scoreRunners() {
    const s = this.s;
    const home = s.runners.filter((r) => r.pos >= 12);
    if (!home.length) return;
    s.runners = s.runners.filter((r) => r.pos < 12);
    for (let i = 0; i < home.length; i++) { if (s.half === 'top') s.vis++; else s.home++; this.beeper.then(TUNES.taTa); }
  }

  // Ball four: press Run, and the batter takes first, pushing forced runners along.
  walk() {
    const s = this.s;
    const on = (b) => s.runners.find((r) => r.pos === b);
    if (on(3)) {
      if (on(6)) { if (on(9)) on(9).pos = 12; on(6).pos = 9; }
      on(3).pos = 6;
    }
    s.runners.push({ pos: 3 });
    s.balls = 0; s.strikes = 0;
    this.scoreRunners();
    this.nextBatterOrSide();
  }

  homeRun() {
    const s = this.s;
    s.phase = 'homer';
    s.flash = 150;
    s.runners.push({ pos: 0, batter: true });
    s.runStep = this.pace(10);
    s.runT = 0;
    s.balls = 0; s.strikes = 0;
    this.beeper.play([...TUNES.taTa, [0, 80], ...TUNES.taTa, [0, 80], ...TUNES.taTa, [0, 80], ...TUNES.taTa]);
  }

  // After the fanfare, hold Run to bring everyone around.
  homerTick(held) {
    const s = this.s;
    if (s.flash > 0 || !(held & RUN)) return;
    if (++s.runT < s.runStep) return;
    s.runT = 0;
    for (const r of s.runners) r.pos++;
    this.scoreRunners();
    if (!s.runners.length) this.nextBatterOrSide();
  }

  // ---------------------------------------------------------------- innings

  // Three outs: the horn; men left on base stay lit until Score starts the next half.
  sideRetired() {
    const s = this.s;
    const last = s.half === 'bottom' && s.inning >= INNINGS;
    s.phase = last ? 'over' : 'halfover';
    s.lastFielder = s.fielder;
    this.beeper.then(last ? TUNES.bigHorn : TUNES.horn);
    if (last) s.showScore = 1e9;
  }

  nextHalf() {
    const s = this.s;
    if (s.half === 'top') s.half = 'bottom';
    else { s.half = 'top'; s.inning++; }
    s.outs = 0; s.balls = 0; s.strikes = 0;
    s.runners = [];
    s.phase = 'idle';
    s.ai = { t: 0 };
  }

  // ---------------------------------------------------------------- the computer at bat

  // Presses for the computer's half-inning: pitch after a moment, swing at a spot it
  // picks (not always well), run for about what the beeps promise.
  aiInput() {
    const s = this.s, ai = s.ai;
    let held = 0, pressed = 0;
    switch (s.phase) {
      case 'idle':
        if (++ai.t > 50) { pressed = PITCH; ai.t = 0; ai.swingAt = null; }
        break;
      case 'pitch': {
        const p = s.pitch;
        if (ai.swingAt === null || ai.swingAt === undefined) {
          const r = Math.random();
          ai.swingAt = (p.curve && r < 0.35) ? 99 : r < 0.55 ? ZONE[1] : r < 0.75 ? ZONE[0] : r < 0.9 ? ZONE[2] : pick([3, 7]);
        }
        if (p.idx === ai.swingAt && p.t === p.step) pressed = HIT;
        break;
      }
      case 'hit': {
        const batter = s.runners.find((r) => r.batter);
        // It hears the beeps too, and stretches one now and then with a fast runner.
        if (!ai.goal) ai.goal = 3 * Math.min(3, s.hitBases + (s.runStep <= this.pace(12) && Math.random() < 0.4 ? 1 : 0));
        if (batter && batter.pos < ai.goal) held = RUN;
        break;
      }
      case 'walk': pressed = RUN; break;
      case 'homer': held = RUN; break;
      default: ai.goal = 0;
    }
    if (s.phase !== 'hit') ai.goal = 0;
    return { held, pressed };
  }

  // ---------------------------------------------------------------- display

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    const blink = (s.frame >> 3) & 1;
    if (s.phase === 'homer' && s.flash > 0) {
      // A home run: the whole field lights up, again and again.
      if ((s.frame >> 4) & 1) L.fill(1);
    } else {
      for (const r of s.runners) L[pathLed(r.pos)] = 1;
      const p = s.pitch;
      if (s.phase === 'pitch' && p) L[p.path[p.idx]] = 1;
      if (s.phase === 'swung' && s.swing && s.swing.idx >= 0) L[s.swing.led] = 1;
      if (s.phase === 'called' && p) L[p.path[p.path.length - 1]] = 1;
      if (s.fielder >= 0) {
        if (s.phase === 'flyout') L[s.fielder] = blink;
        else if (s.phase === 'hit') L[s.fielder] = 1;
      }
      if (s.phase === 'halfover' && s.lastFielder >= 0) L[s.lastFielder] = blink;
    }
    return { leds: L, digits: this.digits(), text: this.labels() };
  }

  digits() {
    const s = this.s;
    if (s.showScore > 0) {
      const v = String(Math.min(99, s.vis)).padStart(2, ' '), h = String(Math.min(99, s.home)).padStart(2, ' ');
      return [v[0], v[1], h[0], h[1]];
    }
    // Inning, outs, balls, strikes; a decimal point shows who's at bat (Visitors on
    // the outs, Home on the strikes). After three outs the outs count flashes.
    const outs = s.phase === 'halfover' && !((s.frame >> 4) & 1) ? ' ' : String(Math.min(3, s.outs));
    return [String(Math.min(9, s.inning)), `${outs}${s.half === 'top' ? '.' : ''}`, String(Math.min(3, s.balls)), `${Math.min(2, s.strikes)}${s.half === 'bottom' ? '.' : ''}`];
  }

  labels() {
    const ink = 'rgba(26, 89, 179, 0.95)';
    return [
      { text: 'VISITORS', x: 64, y: 10, size: 7, color: ink }, { text: 'HOME', x: 176, y: 10, size: 7, color: ink },
      { text: 'INNING', x: 36, y: 56, size: 6.5, color: ink }, { text: 'OUTS', x: 92, y: 56, size: 6.5, color: ink },
      { text: 'BALLS', x: 148, y: 56, size: 6.5, color: ink }, { text: 'STRIKES', x: 204, y: 56, size: 6.5, color: ink },
    ];
  }

  // ---------------------------------------------------------------- saves

  saveState() { return structuredClone(this.s); }
  loadState(s) { this.s = structuredClone(s); }
}
