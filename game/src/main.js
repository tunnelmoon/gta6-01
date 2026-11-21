// Bootstrap: create the game on the canvas.
import { Game } from './game.js';
const canvas = document.getElementById('game');
if (!canvas)
    throw new Error('missing #game canvas');
new Game(canvas);
