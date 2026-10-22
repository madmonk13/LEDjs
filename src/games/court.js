// The court games: Basketball and Soccer (1978) share their hardware. A 5 x 4 grid of
// positions (row 0 nearest the basket or goal), one bright blip for the offensive man,
// five dim defenders run by the computer, two identical shoot (kick) keys, the arrow
// keys (no diagonals), and a two-digit display below the court. Each game adds its own
// rules on top (see basketball.js and soccer.js).
//
// What they have in common, from their manuals:
// - One or two players, always against the computer's defense: with one player you
//   play the offense for both teams, Visitor and Home taking turns.
// - The Visitor starts from the right rear corner, Home from the left. Moving away from
//   the corner puts the ball in play; a move into a defender's position, or out of
//   bounds, is cancelled.
// - Shoot from a marked position with no defender between you and the basket (goal) and
//   the computer guides the ball in, unless a defender gets in its way: then the defense
//   passes it toward the sideline, and you can win it back by getting to it first. From
//   anywhere else the ball bounces loose.
// - A score sends the ball back to your starting position, and you go again. A turnover
//   (whistle) flashes the scores, Visitor then Home, then the minutes left, and the other
//   team takes over from its corner. The arrow with the dot (down) repeats the scores
//   before play resumes.
// - Skill 1 or 2: the defense moves twice as fast on 2.

const ROWS = 4, COLS = 5;
export const LEFT = 0x01, RIGHT = 0x02, UP = 0x04, DOWN = 0x08, SHOOT = 0x10 | 0x20;
const ARROWS = LEFT | RIGHT | UP | DOWN;
const START = { V: { r: 3, c: 4 }, H: { r: 3, c: 0 } };
const FLASH = 50;                         // frames each part of the score flash shows

const rnd = (n) => Math.floor(Math.random() * n);
export { ROWS, COLS, rnd };

export class CourtGame {
  // Set by each game: frames between defender moves (skill 1, 2), the period length in
  // game seconds and how many there are, which team starts each period, the marked
  // shooting positions ('r,c'), points a score, and its tunes.

  constructor(beeper) {
    this.beeper = beeper;
    this.layout = this.constructor.makeLayout();
    this.leds = new Float32Array(this.layout.leds.length);
    this.newGame(1);
  }

  newGame(level = this.s?.level || 1) {
    const G = this.constructor;
    this.s = {
      level, frame: 0, period: 1, clock: G.periodLength, V: 0, H: 0,
      team: G.periodStarts[0], phase: 'flash', t: 0, flashFrom: 0,
      off: { ...this.start(G.periodStarts[0]) }, defs: [], defT: 0, defTurn: 0,
      ball: null, inPlay: false, after: 'ready', goalLight: 0, extra: {},
    };
    this.resetDefense();
    this.s.phase = 'ready';
  }

  setSkill(level) { this.s.level = level; }

  // ---------------------------------------------------------------- the grid

  // Where each team starts (Hockey's rink is a row deeper).
  start(team) { return (this.constructor.starts || START)[team]; }

  occupied(r, c) { return this.s.defs.some((d) => d.r === r && d.c === c); }
  defAt(r, c) { return this.s.defs.find((d) => d.r === r && d.c === c) || null; }
  inside(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  // The positions a ball passes on its way from (r, c) to the basket / goal (above row 0,
  // in the middle column), not counting where it starts.
  pathFrom(r, c) {
    const out = [], n = r + 1;
    for (let k = 1; k < n; k++) out.push({ r: r - k, c: Math.round(c + ((2 - c) * k) / n) });
    return out;
  }

  isMarked(r, c) { return this.constructor.marked.includes(`${r},${c}`); }

  // ---------------------------------------------------------------- the frame

  tick(held, pressed) {
    const s = this.s;
    s.frame++;
    if (s.goalLight > 0) s.goalLight--;
    switch (s.phase) {
      case 'ready':
        // Waiting in the corner: the dotted arrow repeats the scores; any other arrow starts.
        if (pressed & DOWN) { this.flash('ready'); break; }
        if (pressed & (LEFT | RIGHT | UP)) { this.startPlay(); this.move(pressed); }
        break;
      case 'live': this.live(pressed); break;
      case 'shot': this.runClocks() && this.shotTick(pressed); break;
      case 'loose': this.runClocks() && this.looseTick(pressed); break;
      case 'pause':
        if (--s.t <= 0) this.afterPause();
        break;
      case 'flash':
        if (++s.t >= FLASH * 3 + 20) { s.phase = s.after; s.t = 0; }
        break;
      case 'over':
        s.t++;
        break;
    }
  }

  startPlay() {
    this.s.phase = 'live';
    this.s.inPlay = true;
    this.onStart();
  }

  live(pressed) {
    const s = this.s;
    if (!this.runClocks()) return;
    if (pressed & SHOOT) { this.shoot(); return; }
    if (pressed & ARROWS) { this.move(pressed); if (s.phase !== 'live') return; }
    this.defenseTick();
  }

  // The game clock, and each game's own clock (shot clock, possession limit); false once
  // play has stopped for one of them.
  runClocks() {
    const s = this.s, G = this.constructor;
    s.clock = Math.max(0, s.clock - G.clockRate / 60);
    if (s.clock <= 0) { this.endPeriod(); return false; }
    return this.ownClock();
  }

  move(pressed) {
    const s = this.s, o = s.off;
    let r = o.r, c = o.c;
    if (pressed & LEFT) c--; else if (pressed & RIGHT) c++; else if (pressed & UP) r--; else if (pressed & DOWN) r++;
    else return;
    // Out of bounds, or into a defender: the move is cancelled.
    if (!this.inside(r, c) || this.occupied(r, c)) return;
    o.r = r; o.c = c;
    this.beeper.play([[1500, 8]]);
    this.afterMove();
  }

  // Defenders take turns to move, one step at a time.
  defenseTick() {
    const s = this.s, G = this.constructor;
    if (--s.defT > 0) return;
    s.defT = G.defStep[s.level - 1];
    if (!s.defs.length) return;
    s.defTurn = (s.defTurn + 1) % s.defs.length;
    const d = s.defs[s.defTurn];
    if (d.out) return;
    if (Math.random() < 0.15) return;          // now and then a defender holds
    const t = this.targetFor(d, s.defTurn);
    this.stepToward(d, t);
    this.afterDefenderMove(d);
  }

  stepToward(d, t) {
    const s = this.s;
    if (!t) return;
    const dr = Math.sign(t.r - d.r), dc = Math.sign(t.c - d.c);
    const ok = (r, c) => this.inside(r, c) && !this.occupied(r, c) && !(s.off.r === r && s.off.c === c) && this.allowed(d, r, c);
    const tries = Math.random() < 0.5 ? [[dr, 0], [0, dc]] : [[0, dc], [dr, 0]];
    for (const [a, b] of tries) {
      if ((a || b) && ok(d.r + a, d.c + b)) { d.r += a; d.c += b; return; }
    }
    // Both ways blocked (by a teammate, usually): step around, sideways to the way it wants to go.
    const dist = Math.abs(t.r - d.r) + Math.abs(t.c - d.c);
    if (dist <= 1) return;
    const side = (dr ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]).filter(([a, b]) => ok(d.r + a, d.c + b));
    if (side.length) { const [a, b] = side[rnd(side.length)]; d.r += a; d.c += b; }
  }

  // ---------------------------------------------------------------- shooting

  shoot() {
    const s = this.s, o = s.off;
    const marked = this.isMarked(o.r, o.c);
    s.ball = { r: o.r, c: o.c, path: marked ? this.pathFrom(o.r, o.c) : this.reboundPath(o), i: -1, t: 0, kind: marked ? 'aimed' : 'wild' };
    s.phase = 'shot';
    this.beeper.play([[1100, 25], [1500, 25]]);
  }

  // A shot from an unmarked position: toward the backboard (goal mouth), then off.
  reboundPath(o) {
    const to = this.pathFrom(o.r, o.c);
    const last = to.length ? to[to.length - 1] : { r: 0, c: 2 };
    const out = [...to, { r: 0, c: last.c + (Math.random() < 0.5 ? -1 : 1) }];
    return out.filter((p) => this.inside(p.r, p.c));
  }

  shotTick(pressed) {
    const s = this.s, b = s.ball;
    if (pressed & ARROWS) { this.move(pressed); if (s.phase !== 'shot') return; }
    this.defenseTick();
    if (s.phase !== 'shot') return;
    if (++b.t < 6) return;
    b.t = 0;
    b.i++;
    if (b.i >= b.path.length) {
      // At the basket (goal): a defender right there may still get a hand to it.
      const rim = b.kind === 'aimed' && this.rimCell();
      const d = rim && this.reacts(rim);
      if (d) { this.blocked(d); return; }
      if (b.kind === 'aimed') this.score();
      else this.bounceLoose();
      return;
    }
    const p = b.path[b.i];
    // A defender beside the ball's next position may jump into its way.
    const jumper = this.reacts(p);
    if (jumper) { this.blocked(jumper); return; }
    b.r = p.r; b.c = p.c;
    const d = this.defAt(p.r, p.c);
    if (d || this.blocksBall(p)) { this.blocked(d || p); }
  }

  // The defenders next to a position each get a chance (by skill) to move in and block.
  reacts(p) {
    const s = this.s, q = this.constructor.blockChance[s.level - 1];
    for (const d of s.defs) {
      if (d.out || Math.abs(d.r - p.r) + Math.abs(d.c - p.c) !== 1) continue;
      if (Math.random() < q) return d;
    }
    return null;
  }

  // The position in front of the basket (goal), where the last defense happens.
  rimCell() { return { r: 0, c: 2 }; }

  // A defender stopped the ball: the defense passes it toward the sideline, and the
  // offense can get to it first.
  blocked(d) {
    const s = this.s;
    this.beeper.play([[900, 60]]);
    const side = d.c <= 2 ? -1 : 1;
    s.ball = { r: d.r, c: d.c, dir: side, t: 0, steps: 0, kind: 'defpass' };
    s.phase = 'loose';
  }

  // Off the backboard (or wide): the ball bounces about, then lands somewhere.
  bounceLoose() {
    const s = this.s, b = s.ball;
    this.beeper.play([[700, 40]]);
    s.ball = { r: b.r, c: b.c, t: 0, steps: 0, kind: 'free', left: 2 + rnd(3) };
    s.phase = 'loose';
  }

  looseTick(pressed) {
    const s = this.s, b = s.ball;
    if (pressed & ARROWS) {
      this.move(pressed);
      if (s.phase !== 'loose') return;
      if (s.off.r === b.r && s.off.c === b.c) { this.regain(); return; }
    }
    this.defenseTick();
    if (s.phase !== 'loose') return;
    if (++b.t < 9) return;
    b.t = 0;
    if (b.kind === 'defpass') {
      // Passed along toward the sideline: out of bounds is a turnover.
      const nc = b.c + b.dir;
      if (!this.inside(b.r, nc)) { this.turnover(); return; }
      b.c = nc;
    } else {
      // Bouncing: anywhere, maybe out of bounds; landing on a defender, he passes it off.
      if (b.left-- <= 0) {
        const d = this.defAt(b.r, b.c);
        if (d) { this.blocked(d); return; }
        if (Math.random() < 0.5) { this.turnover(); return; }
        b.left = 1;
      }
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const [dr, dc] = dirs[rnd(4)];
      if (!this.inside(b.r + dr, b.c + dc)) { this.turnover(); return; }
      b.r += dr; b.c += dc;
    }
    if (s.off.r === b.r && s.off.c === b.c) this.regain();
  }

  regain() {
    const s = this.s;
    s.ball = null;
    s.phase = 'live';
    this.beeper.play([[1800, 40]]);
    this.onRegain();
  }

  // ---------------------------------------------------------------- results

  score() {
    const s = this.s, G = this.constructor;
    s[s.team] += G.points;
    s.ball = null;
    s.goalLight = 90;
    this.beeper.play(G.scoreTune);
    // Back to the starting position, and go again.
    s.phase = 'pause';
    s.t = 90;
    s.next = 'rescore';
  }

  turnover() {
    const s = this.s, G = this.constructor;
    s.ball = null;
    this.beeper.play(G.whistle);
    s.phase = 'pause';
    s.t = 45;
    s.next = 'turnover';
  }

  afterPause() {
    const s = this.s;
    if (s.next === 'rescore') {
      s.off = { ...this.start(s.team) };
      s.phase = 'live';
      this.resetDefense();
      this.onRescore();
      return;
    }
    if (s.next === 'turnover') {
      s.team = s.team === 'V' ? 'H' : 'V';
      this.newPossession();
      this.flash('ready');
      return;
    }
    if (s.next === 'period') {
      const G = this.constructor;
      if (s.period >= G.periods) { this.gameOver(); return; }
      s.period++;
      s.clock = G.periodLength;
      // Who starts the period (Hockey's later face-offs: the computer decides).
      s.team = G.periodStarts[s.period - 1] || (Math.random() < 0.5 ? 'H' : 'V');
      this.newPossession();
      this.flash('ready');
    }
  }

  newPossession() {
    const s = this.s;
    s.off = { ...this.start(s.team) };
    s.ball = null;
    s.inPlay = false;
    this.resetDefense();
    this.onNewPossession();
  }

  endPeriod() {
    const s = this.s, G = this.constructor;
    s.ball = null;
    s.clock = 0;
    s.phase = 'pause';
    s.t = 80;
    s.next = 'period';
    this.beeper.play(s.period >= G.periods ? G.endGameTune : G.endPeriodTune);
  }

  gameOver() {
    const s = this.s;
    s.phase = 'over';
    s.t = 0;
  }

  // The scores, Visitor then Home, then the minutes left; then on to `after`.
  flash(after) {
    const s = this.s;
    s.phase = 'flash';
    s.t = 0;
    s.after = after;
  }

  // ---------------------------------------------------------------- display

  render() {
    const s = this.s, L = this.leds, G = this.constructor;
    L.fill(0);
    const at = (r, c, v) => { const i = this.ledIndex(r, c); if (i >= 0) L[i] = Math.max(L[i], v); };
    const blink = (s.frame >> 3) & 1;
    if (s.phase !== 'over') {
      for (const d of s.defs) if (!d.out) at(d.r, d.c, d.bright ? 1 : 0.28);
      const loose = s.phase === 'shot' || s.phase === 'loose';
      at(s.off.r, s.off.c, loose ? (blink ? 1 : 0.15) : s.phase === 'ready' ? (blink ? 1 : 0.5) : 1);
      if (s.ball) at(s.ball.r, s.ball.c, 1);
    }
    L[this.goalLed()] = s.goalLight > 0 ? ((s.frame >> 2) & 1 ? 1 : 0.4) : 0;
    this.renderExtra(L);
    return { leds: L, digits: this.digits(), text: G.labels };
  }

  digits() {
    const s = this.s;
    const two = (n) => String(Math.max(0, Math.min(99, n))).padStart(2, ' ').split('');
    const mins = Math.ceil(s.clock / 60);
    if (s.phase === 'flash' || s.phase === 'over') {
      const t = s.phase === 'over' ? s.t % (FLASH * 3 + 40) : s.t;
      const part = Math.floor(t / FLASH), order = this.constructor.flashOrder || ['V', 'H'];
      if (t % FLASH > FLASH - 8) return [' ', ' '];
      return part < 2 ? two(s[order[part]]) : part === 2 ? two(mins) : [' ', ' '];
    }
    return this.playDigits(two, mins);
  }

  // Which LED shows a position (-1 if none), and the goal light's.
  ledIndex(r, c) { return this.inside(r, c) ? r * COLS + c : -1; }
  goalLed() { return ROWS * COLS; }

  // Hooks each game fills in.
  onStart() {}
  onRegain() {}
  onRescore() {}
  onNewPossession() {}
  afterMove() {}
  afterDefenderMove() {}
  ownClock() { return true; }
  allowed() { return true; }
  blocksBall() { return false; }
  renderExtra() {}
  playDigits(two, mins) { return two(mins); }

  saveState() { return structuredClone(this.s); }
  loadState(s) { this.s = structuredClone(s); }
}

// The court's layout, shared: positions in a 5 x 4 grid (row 0 at the top, by the basket
// or goal), the goal light above, two digits below. `deco` adds each game's markings.
export function courtLayout(deco) {
  const leds = [], x0 = 32, dx = 34, y0 = 58, dy = 38;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) leds.push({ x: x0 + c * dx, y: y0 + r * dy, w: 4.5, h: 10 });
  leds.push({ x: 100, y: 24, w: 10, h: 4.5 });            // the goal light
  const L = { w: 200, h: 248, leds, digits: [{ x: 89, y: 222, h: 24 }, { x: 111, y: 222, h: 24 }] };
  deco(L, { x0, dx, y0, dy });
  return L;
}

// A circle (or arc, from a0 to a1 radians) as line segments, for court markings.
export function arc(cx, cy, rad, a0 = 0, a1 = Math.PI * 2, n = 20) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    out.push({ x1: cx + rad * Math.cos(t0), y1: cy + rad * Math.sin(t0), x2: cx + rad * Math.cos(t1), y2: cy + rad * Math.sin(t1) });
  }
  return out;
}
