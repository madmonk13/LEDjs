// Soccer: a recreation of the 1978 LED handheld soccer game, following its instruction
// manual. The field and the rules it shares with Basketball are in court.js.
//
// Two 45-minute halves, the clock running only while the ball's in play (a half takes
// about 4 minutes); the digits show the minutes left. Visitors kick off the first half,
// Home the second. Each possession has 10 game minutes to score: win the ball back and
// the time starts again; run out and the ball goes over.
//
// The defense: five blockers and the goalkeeper (the bright blip by the goal). Blockers
// A and B wander their zones near the goal; C, D and E move to a point halfway between
// you and the goal, each in its own zone. The goalkeeper moves twice as fast, stays
// between you and the goal, and attacks whenever you or the ball come within his reach:
// if he touches either, it's a whistle and the ball changes hands.
//
// Kick from a marked position with a clear path (the three in the penalty zone, two down
// each side, and the center circle) and the ball goes in, 1 point, with a victory tune
// and the goal light. Anywhere else it bounces off out of bounds or to a defender.

import { CourtGame, courtLayout, arc, rnd } from './court.js';
import { TUNES as F2 } from './football2.js';

const LIMIT = 10 * 60;                         // game seconds a possession has to score

// Each defender's zone (rows, columns), and the goalkeeper's (the penalty zone).
const ZONES = [
  { r: [0, 1], c: [0, 1] },                    // A
  { r: [0, 1], c: [3, 4] },                    // B
  { r: [2, 3], c: [0, 2] },                    // C
  { r: [2, 3], c: [2, 4] },                    // D
  { r: [1, 2], c: [0, 2] },                    // E
  { r: [0, 0], c: [1, 3] },                    // F, the goalkeeper
];
const KEEPER = 5;

export class Soccer extends CourtGame {
  static id = 'soccer';
  static title = 'Soccer';
  static year = 1978;
  static actions = ['kick', 'kick2'];
  static controls = {
    columns: [['kick'], 'arrows', ['kick2']],
    split: 2,
    switchBelow: true,
    mirror: true,
    compact: true,                        // on a phone: one row of same-size keys (see style.css)
    switchTop: true,                      // landscape: the switch above the display...
    landscapeHide: ['kick'],                // ...and one kick key, on the right
    keysFirst: true,                      // ...as big as the football games', the display giving way
    dot: 'down',
    buttons: { kick: { label: 'Kick', color: '#efeee8' }, kick2: { label: 'Kick', color: '#efeee8' } },
  };
  static levels = ['1', '2'];
  static switchLabels = ['1', '2'];
  static arrowsLegend = 'Move (down, the dotted arrow, repeats the score)';
  // The case: brown plastic with a green stadium around the display, a black panel, orange
  // arrows and white kick keys, the name in green on black.
  static body = {
    case: '#6a3a24', caseHi: '#7e4a30', panel: '#141414', trim: '#9a7a62', print: '#ece8dc',
    key: '#f07a2a', keyInk: '#4a1a06', plate: '#141414', plateInk: '#46c25e', grille: 'rgba(30, 12, 4, 0.5)', padLabel: '',
    surround: ['#2f9a46', '#48b85c'],
  };
  static help = 'Move away from your corner to start, find a marked position with a clear path to the goal, and '
    + 'Kick: 1 point. Stay out of the goalkeeper\'s reach: if he touches you or the ball, it changes hands. Each '
    + 'possession has 10 game minutes to score. One player plays both teams: Visitors from the right corner, Home '
    + 'from the left. The dotted arrow (down) repeats the score. Keys: Z or X kicks.';

  static defStep = [5, 3];
  static blockChance = [0.32, 0.36];
  static periods = 2;
  static periodLength = 45 * 60;
  static clockRate = (45 * 60) / 240;            // a 45-minute half in about 4 minutes
  static periodStarts = ['V', 'H'];
  static points = 1;
  static marked = ['0,1', '0,2', '0,3', '1,0', '1,4', '2,0', '2,4', '3,2'];
  static scoreTune = [['c6', 110], ['e6', 110], ['g6', 110], ['c7', 220], ['g6', 110], ['c7', 420]];
  static whistle = F2.whistle;
  static endPeriodTune = [...F2.whistle, [0, 140], ...F2.whistle];
  static endGameTune = [...F2.whistle, [0, 140], ...F2.whistle, [0, 140], ...F2.whistle];
  static labels = [
    { text: 'HOME', x: 30, y: 207, size: 6, color: 'rgba(235, 235, 225, 0.6)' },
    { text: 'VISITOR', x: 170, y: 207, size: 6, color: 'rgba(235, 235, 225, 0.6)' },
  ];

  static makeLayout() {
    return courtLayout((L, { x0, dx, y0, dy }) => {
      const left = x0 - dx / 2 - 4, right = x0 + 4.5 * dx + 4, top = 34, bottom = y0 + 3.5 * dy + 6;
      L.rects = [
        { x: 0, y: 0, w: 200, h: 248, color: '#0a0606' },
        { x: left - 8, y: top - 8, w: right - left + 16, h: bottom - top + 16, color: '#2f7a3a', r: 6 },
        { x: left, y: top, w: right - left, h: bottom - top, color: '#050404' },
        { x: 84, y: 10, w: 32, h: 26, color: '#050404', r: 2 },
      ];
      const p0 = 100 - 1.6 * dx, p1 = 100 + 1.6 * dx, pb = y0 + 0.5 * dy + 2;
      L.lines = [
        { x1: left, y1: top, x2: right, y2: top }, { x1: left, y1: top, x2: left, y2: bottom }, { x1: right, y1: top, x2: right, y2: bottom },
        { x1: left, y1: bottom, x2: right, y2: bottom },
        { x1: p0, y1: top, x2: p0, y2: pb }, { x1: p1, y1: top, x2: p1, y2: pb }, { x1: p0, y1: pb, x2: p1, y2: pb },   // penalty zone
        { x1: 86, y1: 14, x2: 86, y2: 32 }, { x1: 114, y1: 14, x2: 114, y2: 32 }, { x1: 86, y1: 14, x2: 114, y2: 14 },  // the goal
        ...arc(100, pb, 0.6 * dx, 0, Math.PI, 12),
        ...arc(100, bottom, 0.85 * dx, Math.PI, 2 * Math.PI, 14),
      ];
      L.lineColor = 'rgba(235, 235, 225, 0.7)';
      L.lineWidth = 1;
    });
  }

  resetDefense() {
    const s = this.s;
    s.defs = [{ r: 1, c: 0 }, { r: 1, c: 4 }, { r: 2, c: 1 }, { r: 2, c: 3 }, { r: 1, c: 2 }, { r: 0, c: 2, bright: true }];
    s.defT = 30;
    s.extra.limit = LIMIT;
    s.extra.keeperT = 0;
  }

  allowed(d, r, c) {
    const z = ZONES[this.s.defs.indexOf(d)];
    return r >= z.r[0] && r <= z.r[1] && c >= z.c[0] && c <= z.c[1];
  }

  // A and B wander; C, D and E head halfway between the ball carrier and the goal; the
  // goalkeeper stays between them.
  targetFor(d, i) {
    const s = this.s, o = s.ball || s.off;
    if (i < 2) {
      const z = ZONES[i];
      return { r: z.r[0] + rnd(z.r[1] - z.r[0] + 1), c: z.c[0] + rnd(z.c[1] - z.c[0] + 1) };
    }
    const clamp = (v, [a, b]) => Math.max(a, Math.min(b, v));
    const z = ZONES[i];
    if (i === KEEPER) return { r: 0, c: clamp(Math.round((o.c + 2) / 2), z.c) };
    return { r: clamp(Math.round((o.r - 1) / 2), z.r), c: clamp(Math.round((o.c + 2) / 2), z.c) };
  }

  // The goalkeeper moves twice as fast: an extra step of his own each time round the others.
  defenseTick() {
    super.defenseTick();
    const s = this.s, k = s.defs[KEEPER];
    if (!k || ++s.extra.keeperT < this.constructor.defStep[s.level - 1] * s.defs.length) return;
    s.extra.keeperT = 0;
    this.stepToward(k, this.targetFor(k, KEEPER));
    this.afterDefenderMove(k);
  }

  // The goalkeeper attacks what comes within his reach: touching you or the ball, he wins it.
  afterDefenderMove(d) {
    const s = this.s;
    if (s.defs.indexOf(d) !== KEEPER) return;
    this.keeperCheck();
  }

  afterMove() { this.keeperCheck(); }

  keeperCheck() {
    const s = this.s, k = s.defs[KEEPER];
    if (!k || s.phase === 'pause') return;
    const on = (p) => p && p.r === k.r && p.c === k.c;
    const near = (p) => p && Math.abs(p.r - k.r) + Math.abs(p.c - k.c) <= 1;
    if (on(s.ball) || (near(s.off) && Math.random() < 0.35)) this.turnover();
  }

  // The ball reaching the goalkeeper is his.
  blocksBall(p) {
    const k = this.s.defs[KEEPER];
    return !!k && p.r === k.r && p.c === k.c;
  }

  // Stopped by the goalkeeper, it's a turnover at once; by a blocker, it's passed off.
  blocked(d) {
    const s = this.s;
    if (s.phase === 'pause') return;
    if (d === s.defs[KEEPER] || !s.defs.includes(d)) { this.turnover(); return; }
    super.blocked(d);
  }

  onStart() { this.s.extra.limit = LIMIT; }
  onRegain() { this.s.extra.limit = LIMIT; }

  // The possession's time limit, and the ticking (faster on skill 2).
  ownClock() {
    const s = this.s, e = s.extra, G = this.constructor;
    if (s.frame % (s.level === 2 ? 15 : 30) === 0) this.beeper.play([[2200, 6]]);
    e.limit -= G.clockRate / 60;
    if (e.limit <= 0) { this.turnover(); return false; }
    return true;
  }
}
