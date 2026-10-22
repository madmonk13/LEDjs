// Hockey: a recreation of the 1978 LED handheld hockey game, following its instruction
// manual. It plays like Basketball and Soccer (court.js) on its own rink.
//
// The rink has 18 positions: one behind the net, one either side of it, and three rows
// of five in front. The bright blip is your Offense; the four dim ones the Defense,
// three Defensemen and the Goalie, who can (and does) leave the net. The computer always
// defends; with one player you play the Offense for both teams. Home starts in the lower
// left corner, the Visitors in the lower right; the Visitors have the first face-off,
// and the computer decides the others.
//
// Skate one position a press (no diagonals). Shoot from one of the seven scoring
// positions in front of the net (beside it, and the row in front) and the puck flies at
// the goal: four sirens and a point, unless a Defenseman checks it (one beep) and it's
// loose. From anywhere else it bounces about the ice. Either side can pick up a loose
// puck. After a goal the puck always turns over.
//
// You lose the puck to a steal (stand still near a Defenseman and he checks you: one
// whistle), an interception (a Defender picks up a loose puck), or a penalty. A poke check
// (double beep) knocks it loose. Skating into an occupied position bumps the player
// there (a high beep): one bump a possession is free, the second is a penalty (two
// whistles). A Defenseman goes to the penalty box and the other team gets the puck, with
// a power play against three defenders, for 2 simulated minutes or until it turns the
// puck over.
//
// Three 20-minute periods, the clock running during play (about 3 minutes a period);
// the digits show the minutes left. Between plays, Down shows the scoreboard: Home
// score, Visitor score, minutes left.

import { CourtGame, arc, rnd } from './court.js';
import { TUNES as F2 } from './football2.js';

const LEFT = 0x01, RIGHT = 0x02, UP = 0x04, DOWN = 0x08;
// The positions, row by row from the top; the net is at row 1, column 2.
const CELLS = [[0, 2], [1, 1], [1, 3]];
for (let r = 2; r < 5; r++) for (let c = 0; c < 5; c++) CELLS.push([r, c]);
const INDEX = new Map(CELLS.map(([r, c], i) => [`${r},${c}`, i]));
const NET = { r: 1, c: 2 };
const GOAL_LED = CELLS.length, PEN_LED = { H: CELLS.length + 1, V: CELLS.length + 2 };
const PENALTY = 120;                            // game seconds in the box
const siren = (n, ms) => Array.from({ length: n }, () => [[900, ms / 2], [1300, ms / 2]]).flat();

export class Hockey extends CourtGame {
  static id = 'hockey';
  static title = 'Hockey';
  static year = 1978;
  static actions = ['shoot', 'shoot2'];
  static controls = {
    columns: [['shoot'], 'arrows', ['shoot2']],
    split: 2,
    switchBelow: true,
    mirror: true,
    compact: true,                        // on a phone: one row of same-size keys (see style.css)
    switchTop: true,                      // landscape: the switch above the display...
    landscapeHide: ['shoot'],                // ...and one shoot key, on the right
    keysFirst: true,                      // ...as big as the football games', the display giving way
    dot: 'down',
    buttons: { shoot: { label: 'Shoot', color: '#f0702a' }, shoot2: { label: 'Shoot', color: '#f0702a' } },
  };
  static levels = ['Pro 1', 'Pro 2'];
  static arrowsLegend = 'Skate (down, between plays, shows the scoreboard)';
  // The case: blue plastic with a light-blue stadium around the display, a black panel, white
  // arrows and orange shoot keys, the name in orange on black.
  static body = {
    case: '#2f6fc0', caseHi: '#3d80d2', panel: '#151517', trim: '#7fa9dc', print: '#eef2f8',
    key: '#f1f1ec', keyInk: '#2a2a2a', plate: '#151517', plateInk: '#f05a28', grille: 'rgba(10, 30, 70, 0.45)', padLabel: '',
    surround: ['#7fb0e0', '#a8cdf0'],
  };
  static help = 'Skate with the arrows, find one of the seven scoring positions in front of the net with a clear '
    + 'shot, and Shoot. Keep moving: stand still near a Defenseman and he steals the puck. Skating into a player is '
    + 'a bump; the second bump in a possession is a penalty, and a power play for the other side. The puck turns '
    + 'over after every goal. One player plays both teams: Home from the lower left, Visitors from the lower right. '
    + 'Keys: Z or X shoots.';

  static defStep = [7, 4];
  static blockChance = [0.45, 0.6];
  static periods = 3;
  static periodLength = 20 * 60;
  static clockRate = (20 * 60) / 180;            // a 20-minute period in about 3 minutes
  static periodStarts = ['V', null, null];       // later face-offs: the computer decides
  static points = 1;
  static marked = ['1,1', '1,3', '2,0', '2,1', '2,2', '2,3', '2,4'];
  static starts = { V: { r: 4, c: 4 }, H: { r: 4, c: 0 } };
  static flashOrder = ['H', 'V'];
  static scoreTune = siren(4, 280);
  static whistle = F2.whistle;
  static endPeriodTune = siren(1, 500);
  static endGameTune = siren(5, 220);
  static labels = [
    { text: 'HOME', x: 26, y: 214, size: 6, color: 'rgba(235, 235, 225, 0.6)' },
    { text: 'VISITOR', x: 174, y: 214, size: 6, color: 'rgba(235, 235, 225, 0.6)' },
    { text: 'PENALTY', x: 22, y: 12, size: 5, color: 'rgba(235, 235, 225, 0.5)' },
    { text: 'PENALTY', x: 178, y: 12, size: 5, color: 'rgba(235, 235, 225, 0.5)' },
  ];

  static makeLayout() {
    const leds = [], x0 = 32, dx = 34, y0 = 44, dy = 36;
    for (const [r, c] of CELLS) leds.push({ x: x0 + c * dx, y: y0 + r * dy, w: 4.5, h: 10 });
    leds.push({ x: x0 + 2 * dx, y: y0 + dy, w: 10, h: 4.5 });     // the goal light, in the net
    leds.push({ x: 22, y: 26, w: 4.5, h: 10 }, { x: 178, y: 26, w: 4.5, h: 10 });   // penalty boxes
    const left = 10, right = 190, bottom = y0 + 4.5 * dy + 4, mid = 100, round = 112;
    const lines = [
      { x1: left, y1: round, x2: left, y2: bottom }, { x1: right, y1: round, x2: right, y2: bottom }, { x1: left, y1: bottom, x2: right, y2: bottom },
      ...arc(mid, round, 90, Math.PI, 2 * Math.PI, 28),                            // the rounded end of the rink
      { x1: 84, y1: y0 + dy - 9, x2: 116, y2: y0 + dy - 9 }, { x1: 84, y1: y0 + dy - 9, x2: 84, y2: y0 + dy + 9 }, { x1: 116, y1: y0 + dy - 9, x2: 116, y2: y0 + dy + 9 },
      { x1: left, y1: y0 + 2.5 * dy, x2: right, y2: y0 + 2.5 * dy },               // the blue line
      ...arc(x0 + dx, y0 + 3 * dy, 15, 0, Math.PI * 2, 16), ...arc(x0 + 3 * dx, y0 + 3 * dy, 15, 0, Math.PI * 2, 16),
      ...arc(mid, bottom, 14, Math.PI, 2 * Math.PI, 10),
    ];
    const rects = [
      { x: 0, y: 0, w: 200, h: 256, color: '#0a0606' },
      { cx: mid, cy: round, radius: 90, color: '#060505' },
      { x: left, y: round, w: right - left, h: bottom - round, color: '#060505' },
      { x: 8, y: 17, w: 28, h: 18, color: '#141010', r: 2 }, { x: 164, y: 17, w: 28, h: 18, color: '#141010', r: 2 },
    ];
    return {
      w: 200, h: 256, leds, lines, rects, lineColor: 'rgba(210, 225, 240, 0.6)', lineWidth: 1,
      digits: [{ x: 89, y: 232, h: 24 }, { x: 111, y: 232, h: 24 }],
    };
  }

  newGame(level) {
    super.newGame(level);
    this.s.extra.penalty = null;
  }

  // ---------------------------------------------------------------- the rink

  inside(r, c) { return INDEX.has(`${r},${c}`); }
  ledIndex(r, c) { return INDEX.get(`${r},${c}`) ?? -1; }
  goalLed() { return GOAL_LED; }

  // The positions between a shooter and the net.
  pathFrom(r, c) {
    const out = [];
    let pr = r, pc = c;
    while (Math.abs(pr - NET.r) + Math.abs(pc - NET.c) > 1 && !(pr === 2 && Math.abs(pc - 2) === 1)) {
      if (pc !== NET.c && !(pr === 2 && Math.abs(pc - 2) <= 1)) pc += Math.sign(NET.c - pc);
      else pr += Math.sign(NET.r + 1 - pr) || -1;
      if (!this.inside(pr, pc)) break;
      out.push({ r: pr, c: pc });
      if (out.length > 6) break;
    }
    return out;
  }

  reboundPath(o) { return [{ r: o.r, c: o.c }]; }

  // The Goalie's saves are his own (see score), not a block at the rim.
  rimCell() { return null; }

  // Three Defensemen and the Goalie; with a penalty against the defending team, one
  // Defenseman sits in the box.
  resetDefense() {
    const s = this.s;
    s.defs = [{ r: 2, c: 1 }, { r: 2, c: 3 }, { r: 3, c: 2 }, { r: 2, c: 2, goalie: true }];
    s.defT = 30;
    s.extra.bumps = 0;
    s.extra.idle = 0;
    const p = s.extra.penalty;
    if (p && p.team !== s.team) s.defs[2].out = true;
  }

  // The Goalie minds the net (and leaves it to chase a loose puck nearby); two Defensemen
  // chase the puck carrier, the other covers the slot in front of the net.
  targetFor(d, i) {
    const s = this.s, o = s.ball || s.off;
    if (d.goalie) {
      if (s.ball && Math.abs(o.r - 2) + Math.abs(o.c - 2) <= 2) return o;
      const posts = [{ r: 2, c: 2 }, { r: 1, c: 1 }, { r: 1, c: 3 }, { r: 0, c: 2 }];
      return posts.reduce((a, b) => (Math.abs(b.r - o.r) + Math.abs(b.c - o.c) < Math.abs(a.r - o.r) + Math.abs(a.c - o.c) ? b : a));
    }
    if (s.ball) return o;
    if (i < 2) return o;
    const lane = this.pathFrom(o.r, o.c);
    return lane[0] || { r: 3, c: 2 };
  }

  // ---------------------------------------------------------------- play

  // Skating into an occupied position is a bump: one a possession is free, two a penalty.
  move(pressed) {
    const s = this.s, o = s.off;
    let r = o.r, c = o.c;
    if (pressed & LEFT) c--; else if (pressed & RIGHT) c++; else if (pressed & UP) r--; else if (pressed & DOWN) r++;
    else return;
    if (!this.inside(r, c)) return;
    if (this.occupied(r, c)) {
      if (++s.extra.bumps >= 2) { this.penalty(); return; }
      this.beeper.play([[3400, 60]]);
      return;
    }
    s.extra.idle = 0;
    super.move(pressed);
  }

  penalty() {
    const s = this.s;
    s.extra.penalty = { team: s.team, left: PENALTY };
    s.ball = null;
    this.beeper.play([...F2.whistle, [0, 140], ...F2.whistle]);
    s.phase = 'pause';
    s.t = 60;
    s.next = 'turnover';
  }

  // Standing still near a Defender invites a steal, or a poke check that knocks it loose.
  afterDefenderMove(d) {
    const s = this.s;
    if (s.phase !== 'live') return;
    const o = s.off;
    if (Math.abs(d.r - o.r) + Math.abs(d.c - o.c) !== 1) return;
    const chance = s.extra.idle < 40 ? 0.06 : Math.min(0.5, s.extra.idle / 500);
    if (Math.random() >= chance) return;
    if (Math.random() < 0.7) { this.turnover(); return; }
    // Poke check: the puck squirts away from him.
    this.beeper.play([[1200, 40], [0, 40], [1200, 40]]);
    const away = [[o.r + Math.sign(o.r - d.r), o.c + Math.sign(o.c - d.c)], [o.r - 1, o.c], [o.r, o.c - 1], [o.r, o.c + 1]]
      .find(([r, c]) => this.inside(r, c) && !this.occupied(r, c) && !(r === o.r && c === o.c));
    if (!away) { this.turnover(); return; }
    s.ball = { r: away[0], c: away[1], t: 0, kind: 'free', left: 1 + rnd(2) };
    s.phase = 'loose';
  }

  ownClock() {
    const s = this.s, p = s.extra.penalty, G = this.constructor;
    s.extra.idle++;
    if (p) {
      p.left -= G.clockRate / 60;
      if (p.left <= 0) this.endPenalty();
    }
    return true;
  }

  endPenalty() {
    const s = this.s;
    s.extra.penalty = null;
    const d = s.defs.find((x) => x.out);
    if (d) {
      d.out = false;
      const spot = [[3, 2], [3, 1], [3, 3], [4, 2]].find(([r, c]) => !this.occupied(r, c) && !(s.off.r === r && s.off.c === c));
      if (spot) { d.r = spot[0]; d.c = spot[1]; }
    }
  }

  // A shot stopped by a Defender (one beep) leaves the puck loose.
  blocked(d) {
    const s = this.s;
    this.beeper.play([[1000, 70]]);
    s.ball = { r: d.r, c: d.c, t: 0, kind: 'free', left: 1 + rnd(2) };
    // He knocks it away from where he is.
    const away = [[d.r + 1, d.c], [d.r, d.c - 1], [d.r, d.c + 1]].find(([r, c]) => this.inside(r, c) && !this.occupied(r, c));
    if (away) { s.ball.r = away[0]; s.ball.c = away[1]; }
    s.phase = 'loose';
  }

  // A loose puck slides a little, then waits to be picked up: by you (yours again) or by a
  // Defender (an interception: one whistle).
  looseTick(pressed) {
    const s = this.s, b = s.ball;
    if (pressed) {
      this.move(pressed);
      if (s.phase !== 'loose') return;
      if (s.off.r === b.r && s.off.c === b.c) { this.regain(); return; }
    }
    this.defenseTick();
    if (s.phase !== 'loose') return;
    if (this.defAt(b.r, b.c)) { this.turnover(); return; }
    if (++b.t < 10) return;
    b.t = 0;
    if (b.left > 0) {
      b.left--;
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dr, dc]) => this.inside(b.r + dr, b.c + dc) && !(s.off.r === b.r + dr && s.off.c === b.c + dc));
      if (dirs.length) { const [dr, dc] = dirs[rnd(dirs.length)]; b.r += dr; b.c += dc; }
    }
    if (this.defAt(b.r, b.c)) this.turnover();
  }

  // A defender's step onto the puck's position is allowed (that's how he picks it up).
  stepToward(d, t) {
    const s = this.s;
    if (s.ball && t && Math.abs(t.r - d.r) + Math.abs(t.c - d.c) === 1 && !this.occupied(t.r, t.c)) { d.r = t.r; d.c = t.c; return; }
    super.stepToward(d, t);
  }

  // A goal: four sirens, the goal light, a point; then the puck turns over.
  score() {
    const s = this.s, p = s.extra.penalty;
    // The Goalie, minding the net, gets a piece of some shots: deflected, the puck's loose.
    const g = s.defs.find((d) => d.goalie);
    const posts = ['2,2', '1,1', '1,3', '0,2'];
    if (g && posts.includes(`${g.r},${g.c}`) && Math.random() < 0.8) { this.blocked(g); return; }
    if (p && p.team !== s.team) this.endPenalty();
    super.score();
    s.next = 'turnover';
  }

  turnover() {
    const s = this.s, p = s.extra.penalty;
    // The power play ends when the team with the extra man gives up the puck.
    if (p && p.team !== s.team) this.endPenalty();
    super.turnover();
  }

  onNewPossession() {
    const s = this.s, p = s.extra.penalty;
    if (p && p.team !== s.team) { const d = s.defs[2]; d.out = true; }
  }

  renderExtra(L) {
    const p = this.s.extra.penalty;
    L[PEN_LED.H] = p && p.team === 'H' ? 1 : 0;
    L[PEN_LED.V] = p && p.team === 'V' ? 1 : 0;
  }
}
