// Solmar Sunset entry point: builds the game, wires the debug API, and
// runs a screenshot scenario when ?shot= is present.
import { Game } from './game.js';
import { setupShot } from './shots.js';
const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const seed = seedParam ? parseInt(seedParam, 10) : (Date.now() % 2147483647);
try {
    const game = new Game(canvas, seed, { lowFx: params.has('lowfx') });
    game.exposeDebug();
    const shot = params.get('shot');
    if (shot)
        setupShot(game, shot);
    game.start();
}
catch (err) {
    const el = document.getElementById('loading-text');
    if (el)
        el.textContent = 'Failed to start: ' + String(err);
    throw err;
}
