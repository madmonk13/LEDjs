// Armor Battle (1978): a recreation of the LED handheld, following its instruction manual. It
// was built on the same hardware as Sub Chase.
//
// The screen is a battlefield map, six positions across and four down. Your tank is the steady
// light, starting in a corner; the enemy tank you're after is the blinking one. Press Fire to
// start the clock, then move with the arrow keys. To fire, hold Fire and press the direction of
// the target when it's next to you. Each hit scores a point; the clock stops, and the tanks and
// mines are set out afresh. Press Fire to start the clock again.
//
// Four mines are hidden on the field. A buzzer warns when one is next to you; drive onto one and
// your tank goes back to its corner (the clock keeps running). The enemy has its guns too: stay
// next to it and it gives three warning beeps, then destroys your tank, which goes back to its
// corner. The game is over when the clock reaches 99 seconds, or after 10 mines. The score
// shows then, flashing. Press Fire to play again.

const LEFT = 0x01, RIGHT = 0x02, UP = 0x04, DOWN = 0x08, FIRE = 0x10;
const COLS = 6, ROWS = 4, MINES = 4, MINE_LIMIT = 10, TIME = 99;
const rnd = (n) => Math.floor(Math.random() * n);
const idx = (r, c) => r * COLS + c;

export const TUNES = {
  start: [[1000, 30], [1400, 40]],
  move: [[300, 14]],
  buzz: [[110, 90]],
  mine: [[90, 60], [70, 80], [55, 120], [40, 220]],
  shot: [[1800, 20], [900, 30]],
  hit: [[200, 50], [140, 60], [260, 40], [100, 160]],
  warn: [[1500, 60]],
  killed: [[180, 80], [120, 120], [80, 260]],
  over: [['c5', 180], ['g4', 180], ['e4', 180], ['c4', 500]],
  tick: [[2400, 5]],
};

export class ArmorBattle {
  static id = 'armorbattle';
  static title = 'Armor Battle';
  static year = 1978;
  static actions = ['fire'];
  static controls = {
    columns: [['fire'], 'arrows'],
    split: 1,
    maxGrow: 1.5,                          // on a phone: arrow keys the football games' size
    besideWindow: 'fire',                  // on a phone: Fire beside the map, at the case's left edge as on the original
    buttons: { fire: { label: 'Fire', color: '#2f6fd6', round: true } },
  };
  static levels = ['Play'];
  static arrowsLegend = 'Drive (hold Fire and press one to shoot that way)';
  // The case: red, with a black face; the name in orange, blue keys.
  static body = {
    case: '#c42a26', caseHi: '#d8403a', panel: '#141414', trim: '#8a1f1c', print: '#f4e4dc',
    key: '#2f6fd6', keyInk: '#0a1838', plate: '#141414', plateInk: '#f08a2a', grille: 'rgba(0, 0, 0, 0.5)',
    padLabel: '', surround: ['#0e0e10', '#1c1c20'],
  };
  static plateTop = true;
  static help = 'Press Fire to start the clock, then drive your tank (the steady light) with the arrows. When the '
    + 'enemy tank (blinking) is next to you, hold Fire and press its direction to shoot: a point, and a new field. '
    + 'Press Fire to start the clock again. A buzz means a hidden mine is next to you; drive onto one and you\'re '
    + 'back in your corner. Stay next to the enemy and it fires after three beeps. The game ends at 99 seconds or '
    + 'after 10 mines. Keys: arrows, Z to fire.';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = ArmorBattle.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.newGame();
  }

  // The map: terrain (roads, a river, hills) printed in yellow, a star at each position, and the
  // time counter at the top between two tanks.
  static makeLayout() {
    const x0 = 30, y0 = 78, dx = 28, dy = 30;
    const leds = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) leds.push({ x: x0 + c * dx, y: y0 + r * dy, w: 7, h: 7 });
    const left = x0 - 18, right = x0 + (COLS - 1) * dx + 18, top = y0 - 20, bottom = y0 + (ROWS - 1) * dy + 20;
    const rects = [
      { x: 0, y: 0, w: 200, h: 190, color: '#0a0606' },
      { x: left, y: top, w: right - left, h: bottom - top, color: '#07070a', r: 4 },
      { x: 82, y: 8, w: 36, h: 34, color: '#1c1410', r: 4 },
    ];
    // The tanks either side of the counter.
    const tank = (x, y, f) => [
      { x: x - 11, y: y + 2, w: 22, h: 7, color: 'rgba(240, 138, 42, 0.9)', r: 3 },
      { x: x - 6, y: y - 4, w: 12, h: 6, color: 'rgba(240, 138, 42, 0.9)', r: 2 },
      { x: f > 0 ? x + 4 : x - 16, y: y - 2.5, w: 12, h: 2, color: 'rgba(240, 138, 42, 0.9)' },
    ];
    rects.push(...tank(52, 22, 1), ...tank(148, 22, -1));
    // Stars at the positions.
    for (const d of leds) {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? 2.4 : 6; pts.push(d.x + rad * Math.cos(a), d.y + rad * Math.sin(a)); }
      rects.push({ points: pts, color: 'rgba(230, 200, 70, 0.28)' });
    }
    // Terrain: the border, a winding road and a river, and some hills.
    const lines = [
      { x1: left, y1: top, x2: right, y2: top }, { x1: right, y1: top, x2: right, y2: bottom },
      { x1: right, y1: bottom, x2: left, y2: bottom }, { x1: left, y1: bottom, x2: left, y2: top },
    ];
    const path = (pts) => { for (let i = 0; i + 3 < pts.length; i += 2) lines.push({ x1: pts[i], y1: pts[i + 1], x2: pts[i + 2], y2: pts[i + 3] }); };
    path([left, 93, 40, 92, 58, 100, 72, 112, 98, 116, 116, 108, 128, 94, 150, 90, 170, 96, right, 98]);
    path([left, 140, 30, 150, 50, 152, 64, 140, 80, 136, 100, 146, 114, 160, 120, bottom]);
    path([128, top, 132, 64, 126, 78, 134, 92]);
    path([150, 120, 158, 114, 166, 120, 172, 112, 180, 120]);
    path([22, 64, 30, 58, 38, 64]);
    path([86, 64, 94, 58, 102, 64]);
    path([140, 150, 148, 144, 156, 150, 164, 144, 172, 150]);
    const digits = [{ x: 90, y: 25, h: 24 }, { x: 110, y: 25, h: 24 }];
    return { w: 200, h: 190, leds, lines, rects, digits, lineColor: 'rgba(230, 200, 70, 0.7)', lineWidth: 1.1 };
  }

  newGame() {
    this.s = {
      frame: 0, phase: 'ready', score: 0, time: 0, timeT: 0, mineHits: 0,
      start: { r: ROWS - 1, c: 0 }, tank: null, enemy: null, mines: [],
      buzzT: 0, warn: 0, warnT: 0, shot: null, flash: 0, t: 0,
    };
    this.newField();
  }

  setSkill() {}

  // A fresh field: your tank in a corner, the enemy away from it, four mines elsewhere.
  newField() {
    const s = this.s;
    const corners = [{ r: ROWS - 1, c: 0 }, { r: ROWS - 1, c: COLS - 1 }, { r: 0, c: 0 }, { r: 0, c: COLS - 1 }];
    s.start = corners[rnd(4)];
    s.tank = { ...s.start };
    const free = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) free.push({ r, c });
    const far = free.filter((p) => Math.abs(p.r - s.start.r) + Math.abs(p.c - s.start.c) >= 4);
    s.enemy = far[rnd(far.length)];
    // Mines: not on either tank, nor right beside your corner.
    const spots = free.filter((p) => !(p.r === s.enemy.r && p.c === s.enemy.c) && Math.max(Math.abs(p.r - s.start.r), Math.abs(p.c - s.start.c)) > 1);
    // ...and never walling the enemy off: there's always a safe way to it.
    do {
      const left = [...spots];
      s.mines = [];
      while (s.mines.length < MINES) s.mines.push(left.splice(rnd(left.length), 1)[0]);
    } while (!this.reachable());
    s.warn = 0;
    s.warnT = 0;
  }

  // Can your tank get next to the enemy, in a line, without driving over a mine?
  reachable() {
    const s = this.s, seen = new Set([idx(s.start.r, s.start.c)]), queue = [s.start];
    const blocked = (r, c) => s.mines.some((m) => m.r === r && m.c === c) || (r === s.enemy.r && c === s.enemy.c);
    while (queue.length) {
      const { r, c } = queue.shift();
      if (Math.abs(r - s.enemy.r) + Math.abs(c - s.enemy.c) === 1) return true;
      for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nr = r + a, nc = c + b;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || blocked(nr, nc) || seen.has(idx(nr, nc))) continue;
        seen.add(idx(nr, nc));
        queue.push({ r: nr, c: nc });
      }
    }
    return false;
  }

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (s.flash > 0) s.flash--;
    if (s.shot && --s.shot.t <= 0) s.shot = null;
    if (s.phase === 'over') { s.t++; if (pressed & FIRE && s.t > 60) this.newGame(); return; }
    // Fire starts the clock (at the start, and after each hit).
    if (s.phase === 'ready') {
      if (pressed & FIRE) { s.phase = 'play'; this.beeper.play(TUNES.start); }
      return;
    }

    // The clock, in seconds.
    if (++s.timeT >= 60) {
      s.timeT = 0;
      s.time++;
      if (s.time >= TIME) { this.end(); return; }
    }

    const d = pressed & LEFT ? [0, -1] : pressed & RIGHT ? [0, 1] : pressed & UP ? [-1, 0] : pressed & DOWN ? [1, 0] : null;
    if (d) {
      const r = s.tank.r + d[0], c = s.tank.c + d[1];
      if (held & FIRE) this.fire(r, c);
      else if (r >= 0 && r < ROWS && c >= 0 && c < COLS && !(r === s.enemy.r && c === s.enemy.c)) {
        s.tank = { r, c };
        if (s.mines.some((m) => m.r === r && m.c === c)) { this.mineHit(); return; }
        this.beeper.play(TUNES.move);
      }
      if (s.phase !== 'play') return;
    }

    // The mine warning: a buzz while one is next to you.
    const nearMine = s.mines.some((m) => Math.abs(m.r - s.tank.r) + Math.abs(m.c - s.tank.c) === 1);
    if (nearMine) { if (s.buzzT-- <= 0) { s.buzzT = 30; this.beeper.play(TUNES.buzz); } } else s.buzzT = 0;

    // The enemy: next to you (in a line or diagonally), it beeps three warnings, then fires.
    const nearEnemy = Math.max(Math.abs(s.enemy.r - s.tank.r), Math.abs(s.enemy.c - s.tank.c)) === 1;
    if (!nearEnemy) { s.warn = 0; s.warnT = 0; return; }
    if (s.warnT-- <= 0) {
      s.warnT = 35;
      if (s.warn < 3) { s.warn++; this.beeper.play(TUNES.warn); }
      else {
        s.shot = { r: s.tank.r, c: s.tank.c, t: 30 };
        s.tank = { ...s.start };
        s.warn = 0;
        this.beeper.play(TUNES.killed);
      }
    }
  }

  fire(r, c) {
    const s = this.s;
    s.shot = { r, c, t: 10 };
    if (r === s.enemy.r && c === s.enemy.c) {
      s.score++;
      s.shot.t = 40;
      s.flash = 90;
      s.phase = 'ready';
      this.beeper.play(TUNES.hit);
      this.newField();
    } else this.beeper.play(TUNES.shot);
  }

  mineHit() {
    const s = this.s;
    s.shot = { r: s.tank.r, c: s.tank.c, t: 30 };
    s.tank = { ...s.start };
    s.warn = 0;
    this.beeper.play(TUNES.mine);
    if (++s.mineHits >= MINE_LIMIT) this.end();
  }

  end() {
    const s = this.s;
    s.phase = 'over';
    s.t = 0;
    this.beeper.play(TUNES.over);
  }

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    if (s.phase === 'over') {
      if ((s.frame >> 4) & 1) L[idx(s.tank.r, s.tank.c)] = 1;
    } else {
      if ((s.frame >> 3) & 1) L[idx(s.enemy.r, s.enemy.c)] = 1;
      L[idx(s.tank.r, s.tank.c)] = 1;
      // A shell (or an explosion) where it lands.
      if (s.shot && s.shot.r >= 0 && s.shot.r < ROWS && s.shot.c >= 0 && s.shot.c < COLS && (s.frame >> 1) & 1) L[idx(s.shot.r, s.shot.c)] = Math.max(L[idx(s.shot.r, s.shot.c)], 0.7);
    }
    return { leds: L, digits: this.digits() };
  }

  // The counter: the time in play; the score just after a hit, and flashing when the game's over.
  digits() {
    const s = this.s;
    const two = (n) => { const d = String(n).padStart(2, ' '); return [d[0], d[1]]; };
    if (s.phase === 'over') return (s.frame >> 4) & 1 ? two(s.score) : [' ', ' '];
    if (s.flash > 0) return (s.frame >> 3) & 1 ? two(s.score) : [' ', ' '];
    return two(s.time);
  }

  saveState() { return structuredClone(this.s); }
  loadState(st) { this.s = structuredClone(st); }
}
