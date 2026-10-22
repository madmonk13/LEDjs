// Basketball: a recreation of the 1978 LED handheld basketball game, following its
// instruction manual. The court and the rules it shares with Soccer are in court.js.
//
// Four 12-minute quarters, the clock running only while the ball's in play (a quarter
// takes about 2 1/2 minutes). Visitors open the 1st and 3rd quarters, Home the 2nd and
// 4th. The 24-second clock starts ticking when you move away from your corner: score as
// many times as you can before it runs out or you turn the ball over. While it runs, the
// digits show it.
//
// The marked shooting positions are the four along the baseline (either side of the
// basket), the three in front of it, three further out (both sides and the middle), and
// the top of the key. Shoot from one with a clear lane and the ball goes in, 2 points,
// with a trumpet and the light in the basket, unless a defender moves into its way.
// Anywhere else it comes off the backboard. Shots from close in are hardest to stop.

import { CourtGame, courtLayout, arc } from './court.js';
import { TUNES as F2 } from './football2.js';

const SHOT_CLOCK = 24;

export class Basketball extends CourtGame {
  static id = 'basketball';
  static title = 'Basketball';
  static year = 1978;
  static actions = ['shoot', 'shoot2'];
  static controls = {
    columns: [['shoot'], 'arrows', ['shoot2', 'switch']],
    split: 2,
    dot: 'down',
    buttons: { shoot: { label: 'Shoot', color: '#3e8fdc' }, shoot2: { label: 'Shoot', color: '#3e8fdc' } },
  };
  static levels = ['1', '2'];
  static switchLabels = ['1', '2'];
  static arrowsLegend = 'Move (down, the dotted arrow, repeats the score)';
  // The case: cream plastic, a black control panel, red arrows and blue shoot buttons.
  static body = {
    case: '#e6dfcc', caseHi: '#f2ecdc', panel: '#1d1b19', trim: '#b9a789', print: '#ece8dc',
    key: '#e2483a', keyInk: '#5a140e', plate: '#1d1b19', plateInk: '#f08a2a', grille: 'rgba(60, 50, 35, 0.35)', padLabel: '',
  };
  static help = 'Move away from your corner to start the 24-second clock, find a marked position with no defender '
    + 'between you and the basket, and Shoot: 2 points. Score as often as you can in 24 seconds. A blocked shot can '
    + 'be won back by getting to the ball. One player plays both teams: Visitors from the right corner, Home from the '
    + 'left. The dotted arrow (down) repeats the score. Keys: Z or X shoots.';

  static defStep = [3, 2];
  static blockChance = [0.52, 0.6];
  static periods = 4;
  static periodLength = 12 * 60;
  static clockRate = (12 * 60) / 150;           // a 12-minute quarter in 2 1/2 minutes
  static periodStarts = ['V', 'H', 'V', 'H'];
  static points = 2;
  static marked = ['0,0', '0,1', '0,3', '0,4', '1,1', '1,2', '1,3', '2,0', '2,2', '2,4', '3,2'];
  static scoreTune = [['g5', 110], [0, 30], ['c6', 360]];
  static whistle = F2.whistle;
  static endPeriodTune = [[150, 700]];
  static endGameTune = [[150, 1600]];
  static labels = [
    { text: 'HOME', x: 30, y: 207, size: 6, color: 'rgba(235, 225, 205, 0.6)' },
    { text: 'VISITOR', x: 170, y: 207, size: 6, color: 'rgba(235, 225, 205, 0.6)' },
  ];

  static makeLayout() {
    return courtLayout((L, { x0, dx, y0, dy }) => {
      const left = x0 - dx / 2 - 4, right = x0 + 4.5 * dx + 4, top = 34, bottom = y0 + 3.5 * dy + 6;
      L.rects = [
        { x: 0, y: 0, w: 200, h: 248, color: '#0a0606' },
        { x: left - 8, y: top - 8, w: right - left + 16, h: bottom - top + 16, color: '#8a5a32', r: 6 },
        { x: left, y: top, w: right - left, h: bottom - top, color: '#060404' },
        { x: 84, y: 10, w: 32, h: 26, color: '#060404', r: 2 },
      ];
      const lane0 = 100 - 0.75 * dx, lane1 = 100 + 0.75 * dx, ft = y0 + 1.5 * dy - 6;
      L.lines = [
        { x1: left, y1: top, x2: right, y2: top }, { x1: left, y1: top, x2: left, y2: bottom }, { x1: right, y1: top, x2: right, y2: bottom },
        { x1: left, y1: bottom, x2: right, y2: bottom },
        { x1: lane0, y1: top, x2: lane0, y2: ft }, { x1: lane1, y1: top, x2: lane1, y2: ft }, { x1: lane0, y1: ft, x2: lane1, y2: ft },
        { x1: 88, y1: 32, x2: 112, y2: 32 },                                   // the backboard
        ...arc(100, ft, 0.75 * dx, Math.PI, 2 * Math.PI, 14),                  // free-throw circle
        ...arc(100, ft, 0.75 * dx, 0, Math.PI, 14).filter((_, i) => i % 2 === 0),
        ...arc(100, bottom, 0.85 * dx, Math.PI, 2 * Math.PI, 14),              // center circle
        ...arc(100, 26, 6, 0, Math.PI * 2, 12),                                // the hoop
      ];
      L.lineColor = 'rgba(235, 225, 205, 0.7)';
      L.lineWidth = 1;
    });
  }

  // Five defenders guarding the basket.
  resetDefense() {
    this.s.defs = [{ r: 0, c: 1 }, { r: 0, c: 3 }, { r: 1, c: 2 }, { r: 1, c: 0 }, { r: 1, c: 4 }];
    this.s.defT = 30;
    this.s.extra.shot = SHOT_CLOCK;
    this.s.extra.shotT = 0;
  }

  // The defense: the nearest defenders step into the lane between you and the basket; the
  // others stay home, around the basket.
  targetFor(d, i) {
    const s = this.s;
    const lane = this.pathFrom(s.off.r, s.off.c);
    const ranked = s.defs.map((x, j) => ({ j, dist: Math.abs(x.r - s.off.r) + Math.abs(x.c - s.off.c) })).sort((a, b) => a.dist - b.dist);
    const rank = ranked.findIndex((x) => x.j === i);
    if (rank < 2 && lane.length) return lane[Math.min(lane.length - 1, lane.length - 1 - rank)];
    const home = [{ r: 0, c: 1 }, { r: 0, c: 3 }, { r: 1, c: 2 }, { r: 1, c: 1 }, { r: 1, c: 3 }];
    return home[i];
  }

  onStart() { this.s.extra.shot = SHOT_CLOCK; this.s.extra.shotT = 0; }

  // The 24-second clock, ticking in real seconds.
  ownClock() {
    const e = this.s.extra;
    if (!this.s.inPlay) return true;
    if (++e.shotT >= 60) {
      e.shotT = 0;
      e.shot--;
      this.beeper.play([[2200, 6]]);
      if (e.shot <= 0) { this.turnover(); return false; }
    }
    return true;
  }

  playDigits(two, mins) {
    const s = this.s;
    if (s.inPlay && (s.phase === 'live' || s.phase === 'shot' || s.phase === 'loose' || s.phase === 'pause')) return two(s.extra.shot);
    return two(mins);
  }
}
