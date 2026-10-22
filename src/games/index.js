// The games, in the order the Games list shows them: by year, then by name.

import { AutoRace } from './autorace.js';
import { Football } from './football.js';
import { Baseball } from './baseball.js';
import { Basketball } from './basketball.js';
import { Football2 } from './football2.js';
import { Hockey } from './hockey.js';
import { Soccer } from './soccer.js';

export const GAMES = [AutoRace, Football, Baseball, Basketball, Football2, Hockey, Soccer];

export function gameById(id) { return GAMES.find((G) => G.id === id) || null; }
