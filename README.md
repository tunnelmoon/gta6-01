[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/tunnelmoon/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/tunnelmoon/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Sunset

An open-world crime game set in Solmar, a sun-baked coastal city in the spirit of GTA 6. You play Mara Voss, a driver pulled back into the life she left behind, running four chained missions across five districts before the sun sets on the Vespera Syndicate.

Entry for the make.fun bounty: https://make.fun/bounty/gta6-01

Built with an AI agent on make.fun: https://make.fun/r/jg1vyr82

## Play it

Open `game/index.html` in a desktop browser. No install, no network, no server. Everything runs offline from the files in this repo.

## The game

- Five districts: Centro Solmar, Playa Dorado, Barrio Cobre, Puerto Viejo, and Cayo Verde.
- Four chained missions: steal the Solmar GT, recover the ledger from the docks, rescue Mateo from a moving convoy, and take down the Vespera underboss at the Cayo Verde vault.
- On-foot and driving play, car stealing, traffic and pedestrians, a 1 to 5 star wanted system with police pursuit, combat with four weapons, shops for armor, ammo, respray, and repair, radio, and a save system.
- HUD with a live minimap, health and armor bars, cash, wanted stars, weapon and ammo, and the current mission objective.

## Controls

- WASD to walk and drive, mouse to aim, E to enter or exit a car and to interact, Space for the handbrake, R to reload, 1 to 4 to switch weapon, Tab to change radio station, Esc to pause.

## Build

The game is written in TypeScript under `src-ts/` and compiled to plain ES modules in `game/src/`. Three.js is vendored under `game/vendor/`. Run `npm run build` to typecheck, compile, copy the vendor files, and audit the output for offline use.
