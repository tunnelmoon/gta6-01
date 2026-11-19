[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/tunnelmoon/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/tunnelmoon/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Sunset

An open-world crime game in the spirit of GTA 6, built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01). Referral: https://make.fun/r/jg1vyr82

You are Mara Voss, a former getaway driver pulled back into Solmar by a debt her brother left with the Vespera Syndicate. Four jobs stand between her and a clean slate: boost a silver Solmar GT, steal back a ledger from the docks, rescue her friend Mateo from a moving convoy, and crack the Vespera penthouse vault at sunset.

## The city

Solmar is a sun-soaked coastal city of five districts: Centro Solmar downtown, Playa Dorado beachfront, Barrio Cobre in the west, the Puerto Viejo port, and Cayo Verde island across the Coastal Bridge. The city is fully drivable and walkable, with traffic, pedestrians, shops, police, and a day, sunset, and night cycle.

## How to play

Serve the game folder with any static server (`node serve.ts`, then open http://localhost:8080) and play in a desktop browser. No network is needed: every mesh, texture, and sound is generated at runtime, and the only library is a vendored Three.js build.

- **W A S D** move and drive, **Shift** sprint, **Space** drift
- **Mouse** look, **right click** aim, **left click** fire or punch
- **E / F** enter and exit cars, interact with objectives and shops
- **R** reload, **1 2 3 4** switch weapons, **Tab** change radio station
- **M** full city map, **Esc** pause, **Enter** skip cutscene

## Systems

- **Vehicles**: 7 classes from the Solmar GT sports coupe to the SWAT Tactical Enforcer, with arcade handling, drift, damage states, smoke, fire, and explosions. Steal any parked or traffic car.
- **Wanted level**: 1 to 5 stars. Police cruisers pursue, interceptors join at 3 stars, SWAT at 4. Break line of sight outside police vision cones (shown on the minimap) to cool down, or respray at Voss Customs to clear the heat.
- **Combat**: 4 weapons (fists, Kestrel 9mm, Viper Micro-SMG with drive-by, Bulldog Carbine), cover-seeking enemies, tracers, muzzle flash, and hit feedback.
- **Missions**: 4 chained story jobs with letterboxed cutscenes, dialogue, GPS waypoints, and rewards, ending in Endless Free Roam with a 50% store discount.
- **Economy**: earn cash from jobs and dropped wallets, spend it on armor, ammo, repairs, and resprays at Voss Customs and the Solmar Armory.
- **Audio**: engine hum, tire skid, sirens, gunshots, explosions, and two synthesized radio stations (Solmar Wave 104.5 synthwave, Dorado Heat 98.2 latin-funk), all made live with the Web Audio API.

## Files

- `game/index.html` - page, HUD, menus, import map for Three.js
- `game/src/` - compiled ES modules, one file per system (config, city, player, vehicles, traffic, pedestrians, police, combat, missions, hud, minimap, render, audio, textures, input, rng, shots, main)
- `game/vendor/three.module.min.js` - vendored Three.js
- `src-ts/` - the TypeScript sources; `npm run build` type-checks, emits to `game/src/`, and audits the shipped game for offline safety
- `scripts/` - screenshot driver (`shots.mjs`) and end-to-end playtest (`playtest.mjs`)
- `screenshots/` - 4 real renders of the game

## Tech notes

TypeScript compiled with `tsc` to plain ES modules (no bundler in the shipped output). All textures are painted on offscreen canvases at runtime. All audio is synthesized. The game runs 100% offline and was playtested end to end in headless Chromium: title to New Game to all four missions to story complete, with zero console errors.
