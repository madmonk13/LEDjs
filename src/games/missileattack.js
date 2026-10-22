// Missile Attack (1977) and Space Alert (1978): a recreation of the LED handheld, following its
// instruction manual. Missile Attack came first, defending a city from missiles; it was soon
// withdrawn (NBC wouldn't air its commercial) and the same game came back as Space Alert
// (sold as "Battlestar Galactica: Space Alert"), defending a Battlestar from Cylon Raiders.
// Both are here, each in its own case.
//
// The radar screen is three lanes wide and marked off in distance bands, 6 (far out) down to 0,
// with your city / Battlestar at the bottom. Attacking missiles (dim blips) come down the lanes;
// your defensive torpedo (the bright blip) waits at the bottom in the lane the guidance control
// is set to, and Fire launches it up the screen. The guidance control steers it, left, centre or
// right, on the way up. Hit a missile and you score its band (6 points in band 6, 5 in band 5,
// and so on): the farther out, the better. Miss, and there's a delay before a new torpedo is
// armed (it appears at the bottom).
//
// Twenty missiles come in each game, in patterns you can learn: some shift lanes on the way
// down, some come in pairs. One that gets past you to either side misses; one that reaches the
// centre is a direct hit, and the game is over (Taps). Stop all twenty and the All Clear sounds.
// Points earned count either way. Scores past 99 are shown with the digits' points lit.
//
// The original's ARM / OFF switch was its power switch: here the attack starts as soon as the
// game's opened, and Fire starts a new one after a game ends.

const LANES = 3, BANDS = 7;                    // bands 0 (your end) to 6 (far out)
const LEFT = 0x01, RIGHT = 0x02, FIRE = 0x10;
const MISSILES = 20;
const TORPEDO_STEP = 8;                        // frames per band, going up
const rnd = (n) => Math.floor(Math.random() * n);

export const TUNES = {
  launch: [[1200, 18], [1600, 18], [2000, 18]],
  hit: [[220, 40], [160, 40], [300, 30], [120, 80]],
  step: [[700, 6]],
  miss: [[400, 60]],
  pass: [[500, 80], [350, 120]],
  arm: [[1800, 25]],
  allClear: [['c5', 140], ['e5', 140], ['g5', 140], ['c6', 420], [0, 80], ['g5', 140], ['c6', 520]],
  // Taps.
  taps: [['g4', 280], ['g4', 140], ['c5', 900], [0, 80], ['g4', 280], ['c5', 140], ['e5', 900], [0, 80],
    ['g4', 200], ['c5', 200], ['e5', 500], ['g4', 200], ['c5', 200], ['e5', 500], ['g4', 200], ['c5', 200], ['e5', 1100]],
};

// An attack plan: twenty missiles in learnable patterns (singles down one lane, some that shift
// lanes partway, some in pairs), coming a little faster as the game goes on.
function plan() {
  const out = [];
  const patterns = [
    () => [{ lane: rnd(3), shiftAt: -1 }],
    () => [{ lane: rnd(3), shiftAt: 1 + rnd(3), to: rnd(3) }],
    () => { const a = rnd(3); return [{ lane: a, shiftAt: -1 }, { lane: (a + 1 + rnd(2)) % 3, shiftAt: -1, lag: 2 }]; },
  ];
  while (out.length < MISSILES) {
    const r = Math.random(), late = out.length / MISSILES;
    const p = out.length < 3 ? patterns[0] : r < 0.45 - late * 0.2 ? patterns[0] : r < 0.75 - late * 0.1 ? patterns[1] : patterns[2];
    for (const m of p()) if (out.length < MISSILES) out.push(m);
  }
  return out;
}

export class MissileAttack {
  static id = 'missileattack';
  static title = 'Missile Attack';
  static year = 1977;
  static theme = 'city';
  static actions = ['fire'];
  static controls = {
    columns: [[{ lever: 'aim', labels: ['L', 'C', 'R'], title: 'GUIDANCE' }], ['fire']],
    split: 1,
    besideWindow: 'fire',                  // on a phone: Fire beside the radar screen, as on the original
    buttons: { fire: { label: 'Fire', color: '#e8402a', round: true } },
  };
  // The original's ARM / OFF switch was its power switch; here the game is always armed.
  static levels = ['Arm'];
  static arrowsLegend = 'Guidance control (left, right)';
  // The case: teal plastic, the name in orange on black, a black panel with the red Fire button.
  static body = {
    case: '#24727a', caseHi: '#2f858d', panel: '#141414', trim: '#e8862a', print: '#f0e6d8',
    plate: '#141414', plateInk: '#f07a28', grille: 'rgba(0, 30, 34, 0.5)', surround: ['#0f1d1f', '#1a2b2e'],
  };
  static plateTop = true;
  static help = 'The attack starts straight away. Fire launches a torpedo from the bottom of the lane the '
    + 'guidance control is set to, and the guidance steers it on the way up. Hit a missile in band 6 for 6 points, '
    + 'band 5 for 5, and so on: the farther out, the better. A miss means a wait for the next torpedo. Missiles '
    + 'past you to the side miss; one in the centre ends the game. Stop all 20 for the All Clear. Ratings: under 25, '
    + 'Return to Earth; 25-50, That\'s more like it; 50-75, Excellent; 75 or more, Space Commander. '
    + 'Keys: left and right for guidance, Z to fire.';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = this.constructor.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.newGame();
  }

  // The radar screen: the score at the top, the distance bands (arcs, numbered at the sides)
  // with three blips each, and the city / Battlestar printed at the bottom.
  static makeLayout() {
    const leds = [], lines = [], text = [];
    const cx = 65, laneDx = 25, top = 104, dy = 25, bandY = (b) => top + (BANDS - 1 - b) * dy;
    for (let b = 0; b < BANDS; b++) for (let l = 0; l < LANES; l++) leds.push({ x: cx + (l - 1) * laneDx, y: bandY(b), w: 4, h: 9 });
    // Each band's arc, bowed upward, and its number at both sides.
    for (let b = 0; b < BANDS; b++) {
      const y = bandY(b) + 11, R = 140, half = 44, n = 12;
      for (let i = 0; i < n; i++) {
        const x0 = cx - half + (2 * half * i) / n, x1 = cx - half + (2 * half * (i + 1)) / n;
        const yy = (x) => y + R - Math.sqrt(R * R - (x - cx) * (x - cx)) - 2;
        lines.push({ x1: x0, y1: yy(x0), x2: x1, y2: yy(x1) });
      }
      text.push({ text: String(b), x: cx - 52, y: bandY(b) + 2, size: 9 }, { text: String(b), x: cx + 52, y: bandY(b) + 2, size: 9 });
    }
    const rects = [
      { x: 0, y: 0, w: 130, h: 300, color: '#0a0606' },
      { x: 12, y: 10, w: 106, h: 280, color: '#0d0908', r: 46 },
    ];
    this.decorate(rects, lines, text, cx, bandY(0) + 36);
    const digits = [{ x: 54, y: 62, h: 26 }, { x: 76, y: 62, h: 26 }];
    return { w: 130, h: 300, leds, lines, rects, digits, text, lineColor: 'rgba(242, 196, 64, 0.75)', lineWidth: 1.1, textColor: 'rgba(242, 196, 64, 0.85)' };
  }

  // Missile Attack's screen: RADAR above the score, a city skyline at the bottom.
  static decorate(rects, lines, text, cx, y) {
    text.push({ text: 'RADAR', x: cx, y: 32, size: 9 });
    lines.push({ x1: cx - 26, y1: 42, x2: cx + 26, y2: 42 });
    const sky = [-30, 0, -30, -10, -24, -10, -24, -16, -18, -16, -18, -8, -12, -8, -12, -22, -6, -22, -6, -12, 0, -12, 0, -26,
      6, -26, 6, -14, 12, -14, 12, -20, 18, -20, 18, -9, 24, -9, 24, -15, 30, -15, 30, 0];
    for (let i = 0; i + 3 < sky.length; i += 2) lines.push({ x1: cx + sky[i], y1: y + sky[i + 1], x2: cx + sky[i + 2], y2: y + sky[i + 3] });
  }

  newGame() {
    this.s = {
      level: 1, frame: 0, phase: 'play', score: 0,
      aim: this.s?.aim ?? 1, torp: null, armT: 20,
      queue: plan(), sent: 0, missiles: [], gap: 40, stepT: 0, result: null, t: 0,
    };
  }

  // One level: the original's only switch was its power switch.
  setSkill() {}

  // The guidance control: left, centre or right.
  levers() { return { aim: this.s.aim }; }
  setLever(name, pos) { if (name === 'aim') this.steer(pos); }
  steer(lane) {
    const s = this.s;
    lane = Math.max(0, Math.min(LANES - 1, lane));
    if (lane === s.aim) return;
    s.aim = lane;
    if (s.torp) s.torp.lane = lane;            // it steers the torpedo, armed or in flight
  }

  missileStep() {
    const s = this.s;
    // A little faster as the attack goes on.
    return Math.max(13, 24 - Math.floor(s.sent * 0.55));
  }

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (pressed & LEFT) this.steer(s.aim - 1);
    if (pressed & RIGHT) this.steer(s.aim + 1);
    if (s.phase === 'over') {
      s.t++;
      if (pressed & FIRE && s.t > 60) { this.newGame(); }
      return;
    }

    // The torpedo: armed at the bottom after a delay; Fire launches it.
    if (!s.torp && --s.armT <= 0) { s.torp = { lane: s.aim, band: 0, flying: false, t: 0 }; this.beeper.play(TUNES.arm); }
    if (s.torp && !s.torp.flying && pressed & FIRE) { s.torp.flying = true; s.torp.t = 0; this.beeper.play(TUNES.launch); }
    if (s.torp && s.torp.flying && ++s.torp.t >= TORPEDO_STEP) {
      s.torp.t = 0;
      s.torp.band++;
      this.collide();
      if (s.torp && s.torp.band >= BANDS) { s.torp = null; s.armT = 80; this.beeper.play(TUNES.miss); }   // a miss: a wait to re-arm
    }

    // New missiles from the plan, one (or a pair) at a time.
    if (s.sent < MISSILES && --s.gap <= 0) {
      const m = s.queue[s.sent++];
      s.missiles.push({ lane: m.lane, band: BANDS - 1, shiftAt: m.shiftAt, to: m.to, wait: m.lag ? m.lag * 8 : 0 });
      const pair = s.queue[s.sent] && s.queue[s.sent].lag;
      s.gap = pair ? 1 : 45 + rnd(60);
    }

    // Missiles come down a band at a time; some shift lanes on the way.
    if (++s.stepT >= this.missileStep()) {
      s.stepT = 0;
      for (const m of s.missiles) {
        if (m.wait > 0) { m.wait -= 8; continue; }
        m.band--;
        if (m.band === m.shiftAt && m.to !== undefined && m.to !== m.lane) m.lane += Math.sign(m.to - m.lane);
      }
      this.beeper.play(TUNES.step);
      this.collide();
      for (const m of [...s.missiles]) {
        if (m.band >= 0) continue;
        s.missiles.splice(s.missiles.indexOf(m), 1);
        if (m.lane === 1) { this.end('hit'); return; }      // a direct hit, in the centre
        this.beeper.play(TUNES.pass);                         // past you to the side: a miss
      }
    }
    if (s.sent >= MISSILES && !s.missiles.length) this.end('clear');
  }

  // A torpedo and a missile in the same place (or passing each other): intercepted.
  collide() {
    const s = this.s, t = s.torp;
    if (!t || !t.flying) return;
    const m = s.missiles.find((x) => x.wait <= 0 && x.lane === t.lane && (x.band === t.band || x.band === t.band - 1));
    if (!m) return;
    s.score += Math.max(0, m.band);
    s.missiles.splice(s.missiles.indexOf(m), 1);
    s.torp = null;
    s.armT = 30;
    s.flash = { lane: m.lane, band: Math.max(0, m.band), t: 18 };
    this.beeper.play(TUNES.hit);
  }

  end(result) {
    const s = this.s;
    s.phase = 'over';
    s.result = result;
    s.t = 0;
    s.missiles = [];
    s.torp = null;
    this.beeper.play(result === 'hit' ? TUNES.taps : TUNES.allClear);
  }

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    const at = (lane, band, v) => { if (band >= 0 && band < BANDS) L[band * LANES + lane] = Math.max(L[band * LANES + lane], v); };
    if (s.phase === 'play') {
      for (const m of s.missiles) if (m.wait <= 0) at(m.lane, m.band, 0.3);
      if (s.torp) at(s.torp.lane, s.torp.band, 1);
      if (s.flash && s.flash.t > 0) { s.flash.t--; if ((s.frame >> 1) & 1) at(s.flash.lane, s.flash.band, 1); }
    } else if (s.phase === 'over' && s.result === 'hit' && (s.frame >> 3) & 1) at(1, 0, 1);
    return { leds: L, digits: this.digits() };
  }

  digits() {
    const s = this.s;
    if (s.phase === 'over' && !((s.frame >> 4) & 1)) return [' ', ' '];
    const n = Math.min(199, s.score), d = String(n % 100).padStart(2, ' ');
    return n >= 100 ? [`${d[0] === ' ' ? '0' : d[0]}.`, `${d[1]}.`] : [d[0], d[1]];
  }

  saveState() { return structuredClone(this.s); }
  loadState(st) { this.s = structuredClone(st); }
}

// Space Alert: the same game as "Battlestar Galactica: Space Alert", Cylon Raiders attacking
// your Battlestar, in a black case.
export class SpaceAlert extends MissileAttack {
  static id = 'spacealert';
  static title = 'Space Alert';
  static year = 1978;
  static theme = 'space';
  static body = {
    case: '#1a1a1c', caseHi: '#26262a', panel: '#0e0e10', trim: '#e8862a', print: '#f0e6d8',
    plate: '#0e0e10', plateInk: '#f05a28', grille: 'rgba(0, 0, 0, 0.5)', surround: ['#141414', '#222'],
  };
  static help = MissileAttack.help.replace('The attack starts straight away.', 'Sold as "Battlestar Galactica: Space Alert": the Cylon Raiders are attacking, straight away.');

  // Space Alert's screen: three raiders above the score, the Battlestar at the bottom.
  static decorate(rects, lines, text, cx, y) {
    for (const dx of [-20, 0, 20]) {
      const rx = cx + dx, ry = dx ? 30 : 24;
      lines.push({ x1: rx - 7, y1: ry, x2: rx + 7, y2: ry }, { x1: rx - 7, y1: ry, x2: rx - 4, y2: ry - 5 }, { x1: rx + 7, y1: ry, x2: rx + 4, y2: ry - 5 },
        { x1: rx - 4, y1: ry - 5, x2: rx + 4, y2: ry - 5 }, { x1: rx - 3, y1: ry, x2: rx, y2: ry + 4 }, { x1: rx + 3, y1: ry, x2: rx, y2: ry + 4 });
    }
    // The Battlestar, nose up.
    const ship = [0, -26, 4, -18, 4, -8, 12, -4, 12, 4, 4, 2, 4, 8, -4, 8, -4, 2, -12, 4, -12, -4, -4, -8, -4, -18, 0, -26];
    for (let i = 0; i + 3 < ship.length; i += 2) lines.push({ x1: cx + ship[i], y1: y + ship[i + 1], x2: cx + ship[i + 2], y2: y + ship[i + 3] });
  }
}
