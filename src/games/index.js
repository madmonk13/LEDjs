// The games, in the order the Games list shows them: alphabetical.

import { ArmorBattle } from './armorbattle.js';
import { AutoRace } from './autorace.js';
import { Baseball } from './baseball.js';
import { Basketball } from './basketball.js';
import { Bowling } from './bowling.js';
import { Football } from './football.js';
import { Football2 } from './football2.js';
import { Hockey } from './hockey.js';
import { MissileAttack, SpaceAlert } from './missileattack.js';
import { Soccer } from './soccer.js';
import { SubChase } from './subchase.js';

export const GAMES = [ArmorBattle, AutoRace, Baseball, Basketball, Bowling, Football, Football2, Hockey, MissileAttack, Soccer, SpaceAlert, SubChase];

export function gameById(id) { return GAMES.find((G) => G.id === id) || null; }
