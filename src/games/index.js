// The games, in the order the Games list shows them: alphabetical.

import { AutoRace } from './autorace.js';
import { Baseball } from './baseball.js';
import { Basketball } from './basketball.js';
import { Bowling } from './bowling.js';
import { Football } from './football.js';
import { Football2 } from './football2.js';
import { Hockey } from './hockey.js';
import { MissileAttack, SpaceAlert } from './missileattack.js';
import { Soccer } from './soccer.js';

export const GAMES = [AutoRace, Baseball, Basketball, Bowling, Football, Football2, Hockey, MissileAttack, Soccer, SpaceAlert];

export function gameById(id) { return GAMES.find((G) => G.id === id) || null; }
