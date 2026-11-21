// Bootstrap: create the game on the canvas.
import { Game } from './game.js';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('missing #game canvas');
new Game(canvas);
