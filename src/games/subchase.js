// Sub Chase (1978): a recreation of the LED handheld, following its instruction manual.
//
// The radar screen is a round grid of 24 positions (rows of 5, 7, 7 and 5), marked with
// crosshairs. The dot is your destroyer; the arrow keys move it a position at a time. Somewhere
// below is a submarine you can't see, moving in a direction you don't know. Listen: a slow beep
// means it's to one side of you; a faster beep means it's straight above or below you on the
// screen, or right underneath. Press Fire to drop a depth charge where you are.
//
// A hit on the first try scores 5 points, the second 3, the third 2, and four or more tries 1,
// with a sinking sound; a miss gets a short tune. After a sinking, a new sub appears somewhere
// else, heading in an unknown direction. You have 30 depth charges. Beware: now and then the sub
// fires one or two torpedoes, fast dots across the screen; if one reaches your destroyer, the
// game is over. The score flashes after every hit, and at the end. Press Fire to play again.

const LEFT = 0x01, RIGHT = 0x02, UP = 0x04, DOWN = 0x08, FIRE = 0x10;
const CHARGES = 30;
// The positions: row, column (columns 0-6; the top and bottom rows have 1-5).
const POS = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) if (r === 1 || r === 2 || (c >= 1 && c <= 5)) POS.push([r, c]);
const INDEX = new Map(POS.map(([r, c], i) => [`${r},${c}`, i]));
const valid = (r, c) => INDEX.has(`${r},${c}`);
const rnd = (n) => Math.floor(Math.random() * n);

export const TUNES = {
  slow: [[600, 40]],
  fast: [[900, 30]],
  drop: [[400, 30], [300, 40]],
  sink: [[150, 60], [120, 80], [100, 120], [80, 200]],
  miss: [['e5', 90], ['c5', 140]],
  torpedo: [[1400, 15]],
  over: [['c5', 200], ['g4', 200], ['e4', 200], ['c4', 500]],
  move: [[1200, 8]],
};

export class SubChase {
  static id = 'subchase';
  static title = 'Sub Chase';
  static year = 1978;
  static actions = ['fire'];
  static controls = {
    columns: [['fire'], 'arrows'],
    split: 1,
    maxGrow: 1.5,                          // on a phone: arrow keys the football games' size
    besideWindow: 'fire',                  // on a phone: Fire beside the radar, at the case's left edge as on the original
    buttons: { fire: { label: 'Fire', color: '#f08a2a', round: true } },
  };
  static levels = ['Play'];
  static arrowsLegend = 'Steer the destroyer';
  // The case: blue, with a black face; the name in blue on black, orange keys.
  static body = {
    case: '#2a5cc4', caseHi: '#3a6fd8', panel: '#141414', trim: '#2f4f8f', print: '#e8eef8',
    key: '#f08a2a', keyInk: '#4a1a06', plate: '#141414', plateInk: '#3fb8f0', grille: 'rgba(0, 0, 0, 0.5)',
    padLabel: '', surround: ['#0e0e10', '#1c1c20'],
  };
  static plateTop = true;
  static help = 'Steer your destroyer with the arrows and listen: a slow beep means the hidden sub is beside you; '
    + 'a faster beep means it\'s straight above or below you, or right underneath. Fire drops a depth charge where you '
    + 'are: 5 points on the first try, 3 on the second, 2 on the third, 1 after that. 30 charges a game. Dodge the '
    + 'sub\'s torpedoes: one reaching you ends the game. Keys: arrows, Z to fire.';

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = SubChase.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.newGame();
  }

  // The radar: rings, a crosshair at each position, the score window at the top, a destroyer
  // and a submarine printed at the bottom.
  static makeLayout() {
    const cx = 100, cy = 120, dx = 23, dy = 28;
    const at = (r, c) => ({ x: cx + (c - 3) * dx, y: cy + (r - 1.5) * dy });
    const leds = POS.map(([r, c]) => ({ ...at(r, c), w: 6.5, h: 6.5 }));
    const lines = [];
    const ring = (rad) => { for (let i = 0; i < 40; i++) { const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2; lines.push({ x1: cx + rad * Math.cos(a0), y1: cy + rad * Math.sin(a0), x2: cx + rad * Math.cos(a1), y2: cy + rad * Math.sin(a1) }); } };
    for (const rad of [24, 48, 72, 94]) ring(rad);
    const rects = [
      { x: 0, y: 0, w: 200, h: 240, color: '#0a0606' },
      { cx, cy, radius: 98, color: '#07070a' },
      { x: cx - 24, y: 30, w: 48, h: 30, color: '#2a1f5c', r: 9 },
    ];
    // Crosshairs (cyan), under the lights.
    for (const [r, c] of POS) {
      const p = at(r, c), s = 7, t = 1.4, col = 'rgba(64, 190, 240, 0.85)';
      rects.push({ x: p.x - s, y: p.y - t / 2, w: s * 2, h: t, color: col }, { x: p.x - t / 2, y: p.y - s, w: t, h: s * 2, color: col });
    }
    // A destroyer and a submarine, printed in cyan below the grid.
    const ship = (x, y, w) => [x - w, y, x + w, y, x + w - 3, y + 4, x - w + 3, y + 4];
    rects.push({ points: ship(cx, 196, 20), color: 'rgba(64, 190, 240, 0.9)' }, { x: cx - 4, y: 189, w: 9, h: 7, color: 'rgba(64, 190, 240, 0.9)' });
    rects.push({ points: [cx - 14, 208, cx + 12, 208, cx + 16, 211, cx + 12, 214, cx - 14, 214], color: 'rgba(64, 190, 240, 0.9)' });
    const digits = [{ x: cx - 10, y: 45, h: 22 }, { x: cx + 10, y: 45, h: 22 }];
    return { w: 200, h: 240, leds, lines, rects, digits, lineColor: 'rgba(230, 210, 60, 0.7)', lineWidth: 1.2 };
  }

  newGame() {
    this.s = {
      frame: 0, phase: 'play', score: 0, charges: CHARGES,
      ship: { r: 2, c: 3 }, sub: null, subT: 0, tries: 0,
      beepT: 0, torps: [], torpT: 180 + rnd(240), flash: 0, sinkAt: null, t: 0,
    };
    this.newSub();
  }

  setSkill() {}

  // A new sub, somewhere away from the destroyer, heading in an unknown direction.
  newSub() {
    const s = this.s;
    const far = POS.filter(([r, c]) => Math.abs(r - s.ship.r) + Math.abs(c - s.ship.c) >= 3);
    const [r, c] = far[rnd(far.length)];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    s.sub = { r, c, d: dirs[rnd(dirs.length)] };
    s.subT = 0;
    s.tries = 0;
  }

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (s.flash > 0) s.flash--;
    if (s.phase === 'over') { s.t++; if (pressed & FIRE && s.t > 60) this.newGame(); return; }
    if (s.phase === 'sinking') { if (--s.t <= 0) { s.phase = 'play'; s.sinkAt = null; this.newSub(); } return; }

    // The destroyer.
    const d = pressed & LEFT ? [0, -1] : pressed & RIGHT ? [0, 1] : pressed & UP ? [-1, 0] : pressed & DOWN ? [1, 0] : null;
    if (d) {
      let r = s.ship.r + d[0], c = s.ship.c + d[1];
      // From a long row to a short one, keep to the nearest position.
      if (!valid(r, c) && d[0]) c = Math.max(1, Math.min(5, c));
      if (valid(r, c)) { s.ship = { r, c }; this.beeper.play(TUNES.move); }
    }

    // A depth charge, where the destroyer is.
    if (pressed & FIRE) { this.dropCharge(); if (s.phase !== 'play') return; }

    // The sub moves on, a position at a time, turning when it meets the edge (and now and then anyway).
    if (++s.subT >= 95) {
      s.subT = 0;
      const sub = s.sub;
      if (Math.random() < 0.18 || !valid(sub.r + sub.d[0], sub.c + sub.d[1])) {
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].filter(([a, b]) => valid(sub.r + a, sub.c + b));
        sub.d = dirs[rnd(dirs.length)];
      }
      sub.r += sub.d[0]; sub.c += sub.d[1];
    }

    // The sonar: slow beeps when it's beside you, faster when it's straight above, below or under.
    const dr = Math.abs(s.sub.r - s.ship.r), dc = Math.abs(s.sub.c - s.ship.c);
    const near = dc === 0 && dr <= 1 ? 'fast' : dc === 1 && dr <= 1 ? 'slow' : null;
    if (near && ++s.beepT >= (near === 'fast' ? 14 : 34)) { s.beepT = 0; this.beeper.play(TUNES[near]); }
    if (!near) s.beepT = 0;

    // Torpedoes: one or two at a time, fast across a row; one reaching the destroyer ends the game.
    if (--s.torpT <= 0) {
      s.torpT = 240 + rnd(360);
      const n = 1 + (Math.random() < 0.3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const row = i === 0 && Math.random() < 0.5 ? s.ship.r : rnd(4);
        const cols = POS.filter(([r]) => r === row).map(([, c]) => c);
        const fromLeft = Math.random() < 0.5;
        s.torps.push({ r: row, c: fromLeft ? Math.min(...cols) : Math.max(...cols), dir: fromLeft ? 1 : -1, t: 0, wait: i * 20 });
      }
    }
    for (const t of [...s.torps]) {
      if (t.wait > 0) { t.wait--; continue; }
      if (++t.t < 7) continue;
      t.t = 0;
      if (t.r === s.ship.r && t.c === s.ship.c) { this.end(); return; }
      t.c += t.dir;
      this.beeper.play(TUNES.torpedo);
      if (!valid(t.r, t.c)) s.torps.splice(s.torps.indexOf(t), 1);
      else if (t.r === s.ship.r && t.c === s.ship.c) { this.end(); return; }
    }
  }

  dropCharge() {
    const s = this.s;
    s.charges--;
    s.tries++;
    if (s.sub.r === s.ship.r && s.sub.c === s.ship.c) {
      s.score += s.tries === 1 ? 5 : s.tries === 2 ? 3 : s.tries === 3 ? 2 : 1;
      s.flash = 90;
      s.phase = 'sinking';
      s.sinkAt = { r: s.sub.r, c: s.sub.c };
      s.t = 70;
      this.beeper.play(TUNES.sink);
    } else this.beeper.play(TUNES.miss);
    if (s.charges <= 0) { if (s.phase === 'sinking') s.t = 70; this.end(); }
  }

  end() {
    const s = this.s;
    s.phase = 'over';
    s.t = 0;
    s.torps = [];
    this.beeper.play(TUNES.over);
  }

  render() {
    const s = this.s, L = this.leds;
    L.fill(0);
    const at = (r, c, v) => { const i = INDEX.get(`${r},${c}`); if (i !== undefined) L[i] = Math.max(L[i], v); };
    if (s.phase !== 'over') {
      for (const t of s.torps) if (t.wait <= 0) at(t.r, t.c, 0.6);
      at(s.ship.r, s.ship.c, 1);
      if (s.sinkAt && (s.frame >> 2) & 1) at(s.sinkAt.r, s.sinkAt.c, 0.8);
    } else if ((s.frame >> 4) & 1) at(s.ship.r, s.ship.c, 1);
    return { leds: L, digits: this.digits() };
  }

  // The score: flashing after a hit and at the end; steady otherwise. Past 99, the points light.
  digits() {
    const s = this.s;
    if ((s.flash > 0 || s.phase === 'over') && (s.frame >> 3) & 1) return [' ', ' '];
    const n = s.score, d = String(n % 100).padStart(2, n >= 100 ? '0' : ' ');
    return n >= 100 ? [`${d[0]}.`, `${d[1]}.`] : [d[0], d[1]];
  }

  saveState() { return structuredClone(this.s); }
  loadState(st) { this.s = structuredClone(st); }
}
