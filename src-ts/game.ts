// Solmar Sunset: the game. State machine, main loop, cutscene camera,
// shot mode for deterministic screenshots, and the debug hooks the
// playtest uses.
import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { City } from './city.js';
import { Combat } from './combat.js';
import { ECONOMY, MISSIONS, PLACES, RADIO, WANTED, clamp, districtAt } from './config.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Minimap } from './minimap.js';
import { CutsceneKey, Missions } from './missions.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { RenderWorld } from './render.js';
import { SHOT_CONFIGS } from './shots.js';
import { Traffic } from './traffic.js';
import { Vehicle } from './vehicles.js';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'cutscene' | 'wasted' | 'ending';

export interface ShotSetup {
  shot: string;
  seed: number;
}

declare global {
  interface Window {
    __solmar?: unknown;
    __shotReady?: boolean;
  }
}

const SAVE_KEY = 'solmar-save-v1';

export class Game {
  state: GameState = 'loading';
  time = 0;
  private render: RenderWorld;
  private city: City;
  private input: Input;
  private audio = new AudioEngine();
  private player: Player;
  private traffic: Traffic;
  private peds: Pedestrians;
  private police: Police;
  private combat: Combat;
  private missions: Missions;
  private hud: HUD;
  private minimap: Minimap;
  private vehicles: Vehicle[] = [];
  private lastTime = 0;
  private cutsceneKeys: CutsceneKey[] = [];
  private cutsceneT = 0;
  private cutsceneDur = 0;
  private cutsceneOnDone: (() => void) | null = null;
  private cutsceneLine = -1;
  private titleAngle = 0;
  private wastedTimer = 0;
  private wastedKind: 'wasted' | 'busted' = 'wasted';
  private shopOpen = false;
  private lastOrbitTime = -10;
  private gunfireAt: { x: number; z: number; time: number } | null = null;
  private shot: ShotSetup | null = null;
  private shotFrames = 0;
  private shotTarget = 0;
  private debug: Record<string, unknown>;

  constructor(canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(window.location.search);
    const shotParam = params.get('shot');
    const seedParam = Number(params.get('seed') ?? '1');
    this.shot = shotParam ? { shot: shotParam, seed: Number.isFinite(seedParam) ? seedParam : 1 } : null;
    const seed = this.shot ? this.shot.seed : 1;

    this.render = new RenderWorld(canvas);
    // deep-link quality (?quality=low|medium|high), applied before the
    // world population is sized from it
    const qParam = params.get('quality');
    if (qParam === 'low' || qParam === 'medium' || qParam === 'high') {
      this.render.setQuality(qParam);
    }
    this.city = new City(this.render.scene, seed);
    this.input = new Input(canvas);
    this.player = new Player(this.render.scene);
    this.traffic = new Traffic(this.city, seed + 6);
    this.peds = new Pedestrians(this.city, this.render.scene, seed + 10);
    this.police = new Police(this.city, this.render.scene, seed + 22);
    this.combat = new Combat(this.city, this.render.scene, this.render.particles, this.render.tracers, this.audio, seed + 30);
    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, this.city);
    this.missions = new Missions(this.city, this.render.scene, this.combat, {
      toast: (m) => this.hud.toast(m),
      objective: (t, s, d) => {
        this.objectiveTitle = t;
        this.objectiveStep = s;
        this.objectiveDist = d;
      },
      subtitle: (sp, line) => this.hud.subtitle(sp, line),
      clearSubtitle: () => this.hud.clearSubtitle(),
      letterbox: (on) => this.hud.letterbox(on),
      cameraKeys: (keys, onDone) => this.startCutscene(keys, onDone),
      onMissionComplete: (id, reward) => {
        this.audio.missionDone();
        this.hud.toast(`Mission complete: ${MISSIONS[id - 1].title} - $${reward.toLocaleString('en-US')}`);
        this.save();
      },
      onStoryComplete: () => this.startEnding(),
      onFail: (reason) => this.hud.toast(reason),
      save: () => this.save(),
      onVaultCracked: () => {
        this.police.wanted.addHeat(82);
        this.police.spawnRoadblockAt(0, -470, Math.PI / 2);
        this.hud.toast('SWAT blockade on the Coastal Bridge. Run for the marina.');
      },
      onRemoveVehicles: (vs) => this.removeVehicles(vs),
    });
    this.missions.setSpawnCar((key, x, z, h, c) => this.spawnCar(key, x, z, h, c));
    this.hud = new HUD({
      onNewGame: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onResume: () => this.resume(),
      onRestartMission: () => this.restartMission(),
      onSave: () => {
        this.save();
        this.hud.toast('Game saved.');
      },
      onQuit: () => this.toTitle(),
      onQuality: (q) => this.render.setQuality(q),
      onVolume: (v) => this.audio.setVolume(v),
    });
    this.input.setKeyHandler((e) => this.onKey(e));
    canvas.addEventListener('mousedown', () => this.input.requestLock());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // ambient world population (quality-scaled)
    const q = this.render.getQuality();
    const carCount = q === 'low' ? 18 : q === 'medium' ? 25 : 30;
    const pedCount = q === 'low' ? 28 : q === 'medium' ? 40 : 50;
    this.traffic.spawnNear(0, 0, carCount);
    this.traffic.addToScene(this.render.scene);
    this.peds.spawn(pedCount, 0, 0);
    this.player.place(-540, 80, Math.PI);
    // debug hooks for the playtest (and curious players)
    this.debug = {
      state: () => this.debugState(),
      teleport: (x: number, z: number) => this.debugTeleport(x, z),
      setCash: (n: number) => {
        this.player.cash = n;
      },
      mission: (id: number) => this.missions.startMission(id, this.player),
      completeStep: () => this.debugCompleteStep(),
      killAll: () => this.debugKillAll(),
      setWanted: (n: number) => {
        this.police.wanted.heat = n >= 5 ? 100 : n <= 0 ? 0 : [0, 25, 45, 65, 82][n];
        this.police.wanted.addHeat(0);
      },
      spawnCar: (key: string, x: number, z: number) => this.spawnCar(key, x, z, 0),
      giveWeapons: () => {
        for (let i = 1; i <= 4; i++) this.player.unlockWeapon(i);
      },
      setHealth: (n: number) => {
        this.player.health = n;
      },
      damagePlayer: (n: number) => {
        if (this.player.takeDamage(n)) this.die('wasted');
        this.hud.damage();
      },
      spawnEnemy: (x: number, z: number, hp: number, faction: string) => {
        this.combat.spawnEnemy(x, z, hp, faction as 'guard' | 'syndicate' | 'elite' | 'underboss');
      },
      spawnBarrel: (x: number, z: number) => this.combat.spawnBarrel(x, z),
      aimAt: (x: number, z: number) => {
        const dx = x - this.player.x;
        const dz = z - this.player.z;
        // the camera's view direction is (sin(yaw), cos(yaw))
        const yaw = Math.atan2(dx, dz);
        this.render.rig.setYaw(yaw);
        // snap the camera so the aim is immediate (the rig's spring
        // would otherwise still be swinging when the test fires)
        this.render.rig.snap({ x: this.player.x, y: 0, z: this.player.z, heading: yaw, speed: 0 });
      },
      setYaw: (y: number) => this.render.rig.setYaw(y),
      enemies: () =>
        this.combat.enemies.map((e) => ({ x: Math.round(e.x * 10) / 10, z: Math.round(e.z * 10) / 10, hp: Math.round(e.hp), state: e.state, faction: e.faction })),
      police: () => this.police.units.map((u) => ({ x: Math.round(u.vehicle.x), z: Math.round(u.vehicle.z), hp: Math.round(u.vehicle.hp) })),
      time: () => this.time,
    };
    window.__solmar = this.debug;
    this.hud.setLoading('Loading Solmar...');
    // first frame: show the title (or the shot setup)
    if (this.shot) {
      this.setupShot();
    } else {
      this.toTitle();
    }
    this.hud.hideLoading();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private objectiveTitle = '';
  private objectiveStep = '';
  private objectiveDist = 0;

  private resize(): void {
    this.render.resize(window.innerWidth, window.innerHeight);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Enter' && this.state === 'cutscene') {
      this.missions.skipCutscene();
      // The ending cutscene is not a mission intro, so missions may not
      // know a cutscene is active; always clear the letterbox here or it
      // stays stuck on into free roam after skipping the ending.
      this.hud.letterbox(false);
      this.endCutscene();
      return;
    }
    if (e.code === 'Escape') {
      if (this.shopOpen) {
        this.shopOpen = false;
        this.hud.hideShop();
        return;
      }
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (e.code === 'Tab' && this.state === 'playing') {
      e.preventDefault();
      const i = this.audio.cycleStation();
      this.hud.toast(this.audio.getStationName());
      void i;
    }
  }

  // ---- state transitions ----
  private toTitle(): void {
    this.state = 'title';
    this.hud.hideLive();
    this.hud.showTitle(this.hasSave());
    this.hud.hidePause();
    this.player.place(-540, 80, Math.PI);
    this.render.setTimeOfDay(0.62);
  }

  private hasSave(): boolean {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  newGame(): void {
    this.audio.unlock();
    this.audio.setStation(0);
    this.resetWorld();
    this.hud.hideTitle();
    this.hud.showLive();
    this.state = 'playing';
    this.missions.startMission(1, this.player);
  }

  continueGame(): void {
    this.audio.unlock();
    this.resetWorld();
    this.hud.hideTitle();
    this.hud.showLive();
    const ok = this.missions.loadGame(this.player);
    this.state = 'playing';
    if (ok && this.missions.missionIndex >= 0) {
      const m = this.missions.current;
      if (m) {
        this.hud.toast(`Continuing: ${m.title}`);
        this.missions.setupStep(this.player);
      }
    } else if (this.missions.storyComplete) {
      this.hud.toast('Welcome back to Solmar. Free roam.');
    }
  }

  private resetWorld(): void {
    this.police.reset();
    this.combat.clearEnemies();
    for (const v of this.vehicles) this.render.scene.remove(v.group);
    this.vehicles = [];
    this.player.healFull();
    this.player.cash = ECONOMY.startCash;
    this.player.armor = 0;
    this.player.weaponIndex = 0;
    this.player.weapons.forEach((w, i) => {
      w.spec.unlock = i === 0 ? 0 : (i === 1 ? 1 : i === 2 ? 2 : 3);
      w.clip = w.spec.clip;
      w.reserve = w.spec.reserve;
    });
    this.time = 0;
  }

  private pause(): void {
    this.state = 'paused';
    this.hud.showPause();
  }
  private resume(): void {
    this.state = 'playing';
    this.hud.hidePause();
    this.hud.hideEnding();
  }

  private restartMission(): void {
    this.hud.hidePause();
    const id = this.missions.missionIndex + 1;
    if (id >= 1) {
      this.missions.failMission('Mission restarted.', this.player);
      this.state = 'playing';
    }
  }

  private save(): void {
    this.missions.saveGame(this.player);
  }

  // ---- vehicles ----
  spawnCar(key: string, x: number, z: number, heading: number, color?: number): Vehicle {
    const v = new Vehicle(key, color);
    v.place(x, z, heading);
    v.onExplode = (veh) => this.explode(veh.x, 1.2, veh.z, 8, 60);
    this.vehicles.push(v);
    this.render.scene.add(v.group);
    return v;
  }

  private nearestVehicle(x: number, z: number, maxD: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = maxD;
    for (const v of this.vehicles) {
      if (v.dead) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // Remove vehicles from the world (mission cleanup).
  removeVehicles(vs: Vehicle[]): void {
    for (const v of vs) {
      this.render.scene.remove(v.group);
      const i = this.vehicles.indexOf(v);
      if (i >= 0) this.vehicles.splice(i, 1);
    }
  }

  // ---- cutscenes ----
  private startCutscene(keys: CutsceneKey[], onDone: () => void): void {
    this.cutsceneKeys = keys;
    this.cutsceneT = 0;
    this.cutsceneDur = keys[keys.length - 1].t;
    this.cutsceneOnDone = onDone;
    this.cutsceneLine = -1;
    this.state = 'cutscene';
  }

  private endCutscene(): void {
    this.cutsceneKeys = [];
    this.cutsceneOnDone = null;
    this.state = 'playing';
  }

  private updateCutscene(dt: number): void {
    this.cutsceneT += dt;
    const keys = this.cutsceneKeys;
    const t = Math.min(this.cutsceneT, this.cutsceneDur);
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(0.001, b.t - a.t);
    let f = clamp((t - a.t) / span, 0, 1);
    f = f * f * (3 - 2 * f);
    const px = a.x + (b.x - a.x) * f;
    const py = a.y + (b.y - a.y) * f;
    const pz = a.z + (b.z - a.z) * f;
    const lx = a.lx + (b.lx - a.lx) * f;
    const ly = a.ly + (b.ly - a.ly) * f;
    const lz = a.lz + (b.lz - a.lz) * f;
    const cam = this.render.camera;
    cam.position.set(px, py, pz);
    cam.lookAt(lx, ly, lz);
    // subtitles follow the mission queue
    const lines = this.missions.subtitleQueue;
    for (let li = 0; li < lines.length; li++) {
      if (t >= lines[li].start && t <= lines[li].end && this.cutsceneLine !== li) {
        this.cutsceneLine = li;
        this.hud.subtitle(lines[li].speaker, lines[li].line);
      }
    }
    if (this.cutsceneT >= this.cutsceneDur + 0.4) {
      const done = this.cutsceneOnDone;
      this.endCutscene();
      if (done) done();
    }
  }

  private startEnding(): void {
    this.state = 'ending';
    this.hud.letterbox(true);
    const keys: CutsceneKey[] = [
      { x: 740, y: 26, z: 220, lx: 780, ly: 4, lz: 260, t: 0 },
      { x: 760, y: 8, z: 240, lx: 790, ly: 2, lz: 300, t: 6 },
      { x: 772, y: 3, z: 268, lx: 790, ly: 2, lz: 300, t: 12 },
    ];
    this.missions.subtitleQueue = [
      { speaker: 'Mara', line: 'The debt is paid, Mateo. And the rest of Solmar? It is wide open.', start: 1, end: 8 },
    ];
    this.startCutscene(keys, () => {
      this.hud.letterbox(false);
      const stats = `SOLMAR SUNSET - STORY COMPLETE\nMissions: 4 of 4\nCash earned: $62,000\nTime in Solmar: ${Math.round(this.time / 60)} minutes\n\nFree Roam unlocked. All shops 50% off.`;
      this.hud.showEnding(stats);
      this.state = 'playing';
    });
  }

  // ---- death / busted ----
  private die(kind: 'wasted' | 'busted'): void {
    if (this.state === 'wasted') return;
    this.wastedKind = kind;
    this.state = 'wasted';
    this.wastedTimer = 0;
    this.hud.showWasted();
    this.audio.hurt();
    this.player.cash = Math.max(0, this.player.cash - ECONOMY.respawnFee);
    this.police.wanted.clear();
  }

  private respawn(): void {
    // nearest clinic (Central Plaza) or SMPD station
    const dPlaza = Math.hypot(this.player.x - 0, this.player.z - 0);
    const dHq = Math.hypot(this.player.x - PLACES.smpdHQ.x, this.player.z - PLACES.smpdHQ.z);
    const spot = dPlaza < dHq ? { x: 20, z: 20 } : { x: PLACES.smpdHQ.x + 20, z: PLACES.smpdHQ.z };
    if (this.player.inVehicle) {
      this.player.inVehicle = null;
      this.player.group.visible = true;
    }
    this.player.healFull();
    this.player.place(spot.x, spot.z, 0);
    const m = this.missions.current;
    if (m) {
      this.missions.failMission('Back on your feet. The mission restarts.', this.player);
    }
    this.state = 'playing';
  }

  // ---- explosions ----
  explode(x: number, y: number, z: number, radius: number, damage: number): void {
    this.render.particles.burst(x, y, z, 34, 14, 1.1, 3.2, 1, 0.55, 0.15, -2);
    this.render.particles.burst(x, y + 1, z, 18, 6, 1.6, 2.6, 0.3, 0.3, 0.3, 1.5);
    this.render.rig.addTrauma(0.7);
    this.audio.explosion();
    this.gunfireAt = { x, z, time: this.time };
    for (const e of [...this.combat.enemies]) {
      if (Math.hypot(e.x - x, e.z - z) < radius) {
        this.combat.damageEnemy(e, damage, { onKill: (en) => this.missions.onKill(en), onPlayerShot: () => undefined, onExplosion: () => undefined });
      }
    }
    for (const v of this.vehicles) {
      if (!v.dead && Math.hypot(v.x - x, v.z - z) < radius) v.damage(damage * 0.8);
    }
    if (Math.hypot(this.player.x - x, this.player.z - z) < radius && !this.player.inVehicle) {
      if (this.player.takeDamage(damage * 0.6)) this.die('wasted');
      this.hud.damage();
    }
    if (this.player.inVehicle && Math.hypot(this.player.inVehicle.x - x, this.player.inVehicle.z - z) < radius) {
      if (this.player.inVehicle.damage(damage * 0.8)) {
        // car exploded under the player
      }
    }
    this.peds.panicNear(x, z, 50);
  }

  // ---- per-frame update ----
  private loop(t: number): void {
    requestAnimationFrame((nt) => this.loop(nt));
    let dt = (t - this.lastTime) / 1000;
    this.lastTime = t;
    if (this.shot) {
      dt = 1 / 60;
      this.shotFrames += 1;
      if (this.shotFrames >= this.shotTarget && this.shotTarget > 0) {
        if (!window.__shotReady) window.__shotReady = true;
        // keep rendering the frozen frame
        this.render.render();
        return;
      }
    }
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    this.time += dt;
    Vehicle.clockMs = this.time * 1000;
    this.update(dt);
    this.render.render();
    this.input.endFrame();
  }

  private update(dt: number): void {
    // day cycle drifts slowly toward night and back (paused in shot mode)
    if (!this.shot) {
      this.render.setTimeOfDay(0.62 + Math.sin(this.time / 240) * 0.14);
    }
    this.render.followSun(this.player.x, this.player.z);
    if (this.state === 'title') {
      this.titleAngle += dt * 0.045;
      const cam = this.render.camera;
      cam.position.set(Math.cos(this.titleAngle) * 70, 22, Math.sin(this.titleAngle) * 70);
      cam.lookAt(0, 10, 0);
      this.traffic.update(dt, 0, 0, { gunfireAt: null }, null, []);
      this.peds.update(dt, 0, 0);
      this.render.particles.update(dt);
      this.render.tracers.update(dt);
      return;
    }
    if (this.state === 'cutscene') {
      this.updateCutscene(dt);
      this.render.particles.update(dt);
      this.render.tracers.update(dt);
      return;
    }
    if (this.state === 'wasted') {
      this.wastedTimer += dt;
      if (this.wastedTimer > 2.4) this.respawn();
      return;
    }
    if (this.state !== 'playing') return;

    const input = this.input;
    const mouse = input.consumeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) {
      this.lastOrbitTime = this.time;
      this.render.rig.orbit(mouse.dx, mouse.dy);
    }
    const aiming = input.mouseRight;
    const player = this.player;
    const inCar = player.inVehicle !== null;

    // --- enter / exit / interact (E or F) ---
    if (input.wasPressed('KeyE') || input.wasPressed('KeyF')) {
      if (this.shopOpen) {
        this.shopOpen = false;
        this.hud.hideShop();
      } else if (inCar) {
        player.exitVehicle();
      } else {
        // mission interact first
        const didInteract = this.missions.tryInteract(player, dt);
        if (!didInteract) {
          const shop = this.missions.nearestShop(player.x, player.z);
          if (shop) {
            this.openShop(shop);
          } else {
            const v = this.nearestVehicle(player.x, player.z, 5);
            if (v) {
              this.enterVehicle(v);
              this.audio.click();
            }
          }
        }
      }
    }
    // vault hold progress uses the held key
    if (input.held('KeyE') || input.held('KeyF')) {
      const m = this.missions.current;
      if (m && m.id === 4 && m.steps[this.missions.stepIndex]?.kind === 'interact') {
        this.missions.tryInteract(player, dt);
        this.hud.setVaultProgress(this.missions.getInteractProgress());
      }
    } else {
      this.hud.setVaultProgress(null);
    }

    // --- movement ---
    if (inCar && player.inVehicle) {
      const v = player.inVehicle;
      const throttle = input.axis('KeyS', 'KeyW');
      const steer = input.axis('KeyA', 'KeyD');
      const drift = input.held('Space');
      const brake = input.held('KeyS') && v.forwardSpeed > 1;
      v.update(dt, { throttle, steer, drift, brake }, this.city, this.vehicles);
      if (input.wasPressed('KeyH')) this.audio.horn();
      if (v.driftTime > 0.1 && Math.random() < 0.4) {
        this.audio.screech();
        this.render.particles.smoke(v.x - Math.sin(v.heading) * 1.5, 0.4, v.z - Math.cos(v.heading) * 1.5);
      }
      // vehicle damage smoke / fire
      if (v.hp < v.spec.hp * 0.5) {
        v.smokeTimer -= dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = 0.12;
          this.render.particles.smoke(v.x, 1.2, v.z);
        }
      }
      if (v.hp < v.spec.hp * 0.2) {
        v.smokeTimer -= dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = 0.2;
          this.render.particles.burst(v.x, 1, v.z, 3, 2, 0.5, 1.8, 1, 0.5, 0.1, -1);
        }
      }
      this.audio.setEngine(Math.abs(v.forwardSpeed) / v.spec.topSpeed, true);
      // peds knocked down by the car
      const dropped = this.peds.checkVehicleHits(v.x, v.z, Math.abs(v.forwardSpeed));
      if (dropped.length > 0) {
        this.police.wanted.addHeat(WANTED.heatPerKill * 0.5);
        this.peds.panicNear(v.x, v.z, 30);
      }
    } else {
      const fwd = input.axis('KeyS', 'KeyW');
      const strafe = input.axis('KeyA', 'KeyD');
      player.update(dt, { fwd, strafe, sprint: input.held('ShiftLeft') || input.held('ShiftRight'), aim: aiming }, this.render.rig.getYaw(), this.city);
      player.setAimPose(aiming, this.render.rig.getYaw());
      this.audio.setEngine(0, false);
    }

    // --- weapons ---
    const w = player.currentWeapon;
    if (input.wasPressed('Digit1')) player.weaponIndex = 0;
    if (input.wasPressed('Digit2') && player.hasWeapon(2)) player.weaponIndex = 1;
    if (input.wasPressed('Digit3') && player.hasWeapon(3)) player.weaponIndex = 2;
    if (input.wasPressed('Digit4') && player.hasWeapon(4)) player.weaponIndex = 3;
    if (input.wasPressed('KeyR')) this.combat.startReload(player);
    const firing = w.spec.auto ? input.mouseDown : input.mouseDownPressed;
    if (firing && !inCar || (firing && inCar && w.spec.slot === 3)) {
      // drive-by only with the Viper
      // Shots are cast horizontally from chest height in the camera's
      // facing direction. Casting from the camera itself would point
      // the ray steeply down at the player, so it would hit the ground
      // a few meters out and never reach a distant target.
      const yaw = this.render.rig.getYaw();
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const origin = new THREE.Vector3();
      if (inCar && player.inVehicle) {
        origin.set(player.inVehicle.x, 1.6, player.inVehicle.z);
      } else {
        origin.set(player.x, 1.4, player.z);
      }
      const fired = this.combat.tryFire(player, origin, dir, {
        onKill: (e) => this.missions.onKill(e),
        onPlayerShot: () => {
          this.police.wanted.addHeat(WANTED.heatPerShot);
          this.gunfireAt = { x: player.x, z: player.z, time: this.time };
          this.peds.panicNear(player.x, player.z, 35);
        },
        onExplosion: (x, y, z) => this.explode(x, y, z, 8, 80),
      });
      if (fired && w.spec.slot !== 1) {
        this.render.rig.addTrauma(w.spec.slot === 4 ? 0.22 : 0.12);
      }
    }
    // crosshair visibility
    const ch = document.getElementById('crosshair');
    if (ch) ch.classList.toggle('hidden', inCar && w.spec.slot !== 3);

    // --- world systems ---
    const px = inCar && player.inVehicle ? player.inVehicle.x : player.x;
    const pz = inCar && player.inVehicle ? player.inVehicle.z : player.z;
    this.combat.shootableVehicles = [...this.vehicles, ...this.police.units.map((u) => u.vehicle), ...this.traffic.cars.map((c) => c.vehicle)];
    this.traffic.update(dt, px, pz, { gunfireAt: this.gunfireAt }, player.inVehicle, this.peds.peds.map((p) => ({ x: p.x, z: p.z })));
    this.peds.update(dt, px, pz);
    this.police.update(dt, px, pz, inCar, player.inVehicle, {
      onBusted: () => this.die('busted'),
      onShootPlayer: (dmg) => {
        if (player.takeDamage(dmg)) this.die('wasted');
        this.hud.damage();
        this.audio.hurt();
      },
      onExplosion: (x, y, z) => this.explode(x, y, z, 8, 60),
    });
    this.combat.update(dt, player, {
      onKill: (e) => this.missions.onKill(e),
      onPlayerShot: () => undefined,
      onExplosion: (x, y, z) => this.explode(x, y, z, 8, 80),
    });
    this.missions.update(dt, player);

    // --- cash pickups ---
    const got = this.peds.collectNear(px, pz, 3);
    if (got > 0) {
      player.cash += got;
      this.audio.pickup();
      this.hud.toast(`+$${got}`);
    }

    // --- customs clear ---
    if (player.inVehicle) {
      const res = this.police.tryCustomsClear(px, pz, player.cash, player.inVehicle);
      if (res.cleared) {
        player.cash -= res.cost;
        this.hud.toast(`Voss Customs: respray done, wanted cleared. -$${res.cost}`);
        this.missions.onCustomsClear(player);
      }
    }

    // --- death by enemy fire already handled; check player death ---
    if (player.dead && this.state === 'playing') {
      this.die('wasted');
    }

    // --- camera auto-align behind the car while driving (the player can
    // still look around with the mouse; it pauses the align for 1.5s) ---
    if (inCar && player.inVehicle && Math.abs(player.inVehicle.forwardSpeed) > 3 && this.time - this.lastOrbitTime > 1.5) {
      const wantYaw = player.inVehicle.heading;
      let d = wantYaw - this.render.rig.getYaw();
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.render.rig.setYaw(this.render.rig.getYaw() + d * Math.min(1, dt * 1.6));
    }

    // --- camera ---
    const target = {
      x: px,
      y: 0,
      z: pz,
      heading: player.inVehicle ? player.inVehicle.heading : player.heading,
      speed: player.inVehicle ? player.inVehicle.speed : player.speed,
    };
    this.render.rig.update(dt, target, this.city, aiming);

    // --- HUD ---
    const district = districtAt(px, pz);
    this.hud.update(
      {
        health: player.health,
        armor: player.armor,
        cash: player.cash,
        speedMph: player.inVehicle ? player.inVehicle.mph : 0,
        inVehicle: inCar,
        vehHp: player.inVehicle ? player.inVehicle.hp : 0,
        vehHpMax: player.inVehicle ? player.inVehicle.spec.hp : 1,
        stars: this.police.wanted.stars,
        weaponName: w.spec.name,
        clip: w.clip,
        reserve: w.reserve,
        district,
        objectiveTitle: this.objectiveTitle,
        objectiveStep: this.objectiveStep,
        objectiveDist: this.objectiveDist,
        radio: this.audio.getStationName(),
        wanted: this.police.wanted.stars > 0,
      },
      dt,
    );
    this.minimap.draw(
      {
        playerX: px,
        playerZ: pz,
        heading: this.render.rig.getYaw(),
        waypoint: this.currentWaypoint(),
        enemies: this.combat.enemies.filter((e) => e.state !== 'dead').map((e) => ({ x: e.x, z: e.z })),
        police: this.police.units.map((u) => ({ x: u.vehicle.x, z: u.vehicle.z })),
        cones: this.police.cones(),
      },
      this.time,
    );
    // interact prompt
    const shop = this.missions.nearestShop(px, pz);
    const mission = this.missions.current;
    const step = mission?.steps[this.missions.stepIndex];
    let prompt: string | null = null;
    if (!inCar && step?.kind === 'interact') {
      let tx = step.x;
      let tz = step.z;
      prompt = Math.hypot(tx - px, tz - pz) < step.radius + 4 ? 'Hold E - interact' : null;
    } else if (!inCar && shop) {
      prompt = `Press E - ${shop.name}`;
    } else if (!inCar && this.nearestVehicle(px, pz, 5)) {
      prompt = 'Press E - enter vehicle';
    } else if (inCar) {
      prompt = 'Press E - exit vehicle';
    }
    this.hud.setInteract(prompt);

    this.render.particles.update(dt);
    this.render.tracers.update(dt);
    this.audio.setSiren(this.police.units.length > 0 && this.police.wanted.stars > 0);
  }

  private currentWaypoint(): { x: number; z: number } | null {
    const m = this.missions.current;
    if (!m) return null;
    const step = m.steps[this.missions.stepIndex];
    if (!step) return null;
    if (step.kind === 'convoy') {
      const van = this.missions.convoyVanPos();
      if (van) return van;
    }
    if (step.kind === 'interact' && m.id === 3) {
      const van = this.missions.convoyVanPos();
      if (van) return van;
    }
    return { x: step.x, z: step.z };
  }

  private openShop(shop: { id: string; name: string; x: number; z: number; radius: number; kind: string }): void {
    this.shopOpen = true;
    const player = this.player;
    const discount = this.missions.discount ? ECONOMY.discountAfterStory : 1;
    const price = (n: number) => Math.round(n * discount);
    if (shop.kind === 'armory') {
      const items = [
        {
          label: 'Kevlar Body Armor (+100 AP)',
          price: price(ECONOMY.armorCost),
          canAfford: player.cash >= price(ECONOMY.armorCost) && player.armor < 100,
          onBuy: () => {
            player.cash -= price(ECONOMY.armorCost);
            player.armor = 100;
            this.audio.pickup();
          },
        },
        {
          label: 'Kestrel 9mm ammo (120)',
          price: price(ECONOMY.ammoCost),
          canAfford: player.cash >= price(ECONOMY.ammoCost) && player.hasWeapon(2),
          onBuy: () => {
            player.cash -= price(ECONOMY.ammoCost);
            player.weapons[1].reserve += 120;
            this.audio.pickup();
          },
        },
        {
          label: 'Viper Micro-SMG ($1,200)',
          price: price(1200),
          canAfford: player.cash >= price(1200) && !player.hasWeapon(3),
          onBuy: () => {
            player.cash -= price(1200);
            player.unlockWeapon(3);
            this.audio.pickup();
          },
        },
        {
          label: 'Bulldog Carbine ($2,800)',
          price: price(2800),
          canAfford: player.cash >= price(2800) && !player.hasWeapon(4),
          onBuy: () => {
            player.cash -= price(2800);
            player.unlockWeapon(4);
            this.audio.pickup();
          },
        },
      ];
      this.hud.showShop('Solmar Armory', items);
    } else if (shop.kind === 'customs') {
      const v = player.inVehicle;
      const items = [
        {
          label: 'Full repair + respray (clears wanted)',
          price: price(ECONOMY.resprayCost),
          canAfford: player.cash >= price(ECONOMY.resprayCost) && !!v,
          onBuy: () => {
            player.cash -= price(ECONOMY.resprayCost);
            if (v) v.repair();
            this.police.wanted.clear();
            this.audio.pickup();
          },
        },
      ];
      this.hud.showShop('Voss Customs', items);
    } else {
      const items = [
        {
          label: 'Save game',
          price: 0,
          canAfford: true,
          onBuy: () => {
            this.save();
            this.hud.toast('Game saved.');
          },
        },
      ];
      this.hud.showShop('Safehouse Motel', items);
    }
  }

  // ---- shot mode (deterministic screenshots) ----
  private setupShot(): void {
    const s = this.shot;
    if (!s) return;
    const cfg = SHOT_CONFIGS[s.shot];
    if (!cfg) return;
    this.render.setTimeOfDay(cfg.timeOfDay);
    this.audio.setMuted(true);
    if (s.shot === 'start') {
      this.toTitle();
      this.shotTarget = cfg.frames;
      return;
    }
    this.state = 'playing';
    this.hud.hideTitle();
    this.hud.showLive();
    this.resetWorld();
    this.player.cash = cfg.cash;
    this.player.place(cfg.playerX, cfg.playerZ, cfg.playerHeading);
    if (cfg.weaponSlot > 1) this.player.unlockWeapon(cfg.weaponSlot);
    if (cfg.weaponSlot > 0) this.player.weaponIndex = cfg.weaponSlot - 1;
    if (cfg.carKey) {
      const v = this.spawnCar(cfg.carKey, cfg.carX, cfg.carZ, cfg.carHeading, cfg.carColor);
      if (cfg.inCar) {
        this.player.enterVehicle(v);
      }
    }
    if (cfg.wantedHeat > 0) this.police.wanted.addHeat(cfg.wantedHeat);
    for (const p of cfg.policeAt) this.police.spawnUnitAt('cruiser', p.x, p.z);
    for (const g of cfg.guards) this.combat.spawnEnemy(g.x, g.z, g.hp, 'guard');
    if (s.shot === 'combat') this.combat.spawnBarrel(628, -176);
    if (s.shot === 'play') this.traffic.spawnNear(cfg.playerX, cfg.playerZ, 12);
    this.objectiveTitle = cfg.objectiveTitle;
    this.objectiveStep = cfg.objectiveStep;
    this.objectiveDist = cfg.objectiveDist;
    this.render.rig.setYaw(cfg.cameraYaw);
    this.shotTarget = cfg.frames;
  }

  // ---- debug ----
  private debugState(): Record<string, unknown> {
    const p = this.player;
    const w = p.currentWeapon;
    // position follows the vehicle when driving (player.x/z freeze on entry)
    const px = p.inVehicle ? p.inVehicle.x : p.x;
    const pz = p.inVehicle ? p.inVehicle.z : p.z;
    return {
      state: this.state,
      time: Math.round(this.time * 10) / 10,
      px: Math.round(px * 10) / 10,
      pz: Math.round(pz * 10) / 10,
      health: p.health,
      armor: p.armor,
      cash: p.cash,
      inVehicle: p.inVehicle ? p.inVehicle.spec.name : null,
      vehHp: p.inVehicle ? p.inVehicle.hp : null,
      weapon: w.spec.name,
      clip: w.clip,
      reserve: w.reserve,
      reloading: this.combat.isReloading(),
      mission: this.missions.missionIndex + 1,
      step: this.missions.stepIndex,
      stepText: this.missions.stepText,
      stars: this.police.wanted.stars,
      heat: Math.round(this.police.wanted.heat),
      enemies: this.combat.enemies.filter((e) => e.state !== 'dead').length,
      police: this.police.units.length,
      traffic: this.traffic.cars.length,
      peds: this.peds.peds.length,
      vehicles: this.vehicles.length,
      storyComplete: this.missions.storyComplete,
      nan: Number.isNaN(px) || Number.isNaN(pz),
    };
  }

  private debugTeleport(x: number, z: number): void {
    if (this.player.inVehicle) {
      this.player.inVehicle.place(x, z, this.player.inVehicle.heading);
      this.player.x = x;
      this.player.z = z;
    } else {
      this.player.place(x, z, this.player.heading);
    }
    this.render.rig.snap({ x, y: 0, z, heading: 0, speed: 0 });
  }

  // Enter a vehicle and run the mission hooks for it. The M1 steal
  // triggers the scripted 2-star pursuit whichever way the player
  // gets into the GT (E key or the debug hook), so the hook lives
  // here once instead of being duplicated at each entry point.
  private enterVehicle(v: Vehicle): void {
    const m = this.missions.current;
    const stepBefore = m ? this.missions.stepIndex : -1;
    const kindBefore = m ? m.steps[stepBefore]?.kind : undefined;
    this.player.enterVehicle(v);
    this.missions.onEnterVehicle(v, this.player);
    if (m && m.id === 1 && kindBefore === 'steal' && this.missions.stepIndex === stepBefore + 1) {
      this.police.wanted.addHeat(45);
      this.police.spawnUnitAt('cruiser', 560, -140);
      this.police.spawnUnitAt('cruiser', 590, -240);
      this.hud.toast('SMPD is on you. Lose them, then deliver the GT.');
    }
  }

  private debugCompleteStep(): void {
    const m = this.missions.current;
    if (!m) return;
    const step = m.steps[this.missions.stepIndex];
    if (!step) return;
    if (step.kind === 'kill') {
      for (const e of [...this.combat.enemies]) {
        if (e.state !== 'dead') {
          this.combat.damageEnemy(e, 9999, { onKill: (en) => this.missions.onKill(en), onPlayerShot: () => undefined, onExplosion: () => undefined });
        }
      }
    } else if (step.kind === 'steal') {
      // the target vehicle spawns exactly at the step coordinates.
      // Get out of any car first: otherwise the car the player drove
      // in sits at the same spot and the nearest-vehicle search picks
      // it instead of the target.
      if (this.player.inVehicle) this.player.exitVehicle();
      this.debugTeleport(step.x, step.z);
      const v = this.nearestVehicle(step.x, step.z, 8);
      if (v) {
        this.enterVehicle(v);
      }
    } else if (step.kind === 'convoy') {
      for (const e of this.missions.convoyEscorts()) e.hp = 1;
    } else if (step.kind === 'interact') {
      // the M3 rescue target is the stopped van, not the step coordinates
      const van = this.missions.convoyVanPos();
      if (m.id === 3 && van) {
        this.debugTeleport(van.x, van.z);
      } else {
        this.debugTeleport(step.x, step.z);
      }
      this.missions.tryInteract(this.player, 3.5);
    } else {
      this.debugTeleport(step.x, step.z);
    }
  }

  private debugKillAll(): void {
    for (const e of [...this.combat.enemies]) {
      if (e.state !== 'dead') {
        this.combat.damageEnemy(e, 9999, { onKill: (en) => this.missions.onKill(en), onPlayerShot: () => undefined, onExplosion: () => undefined });
      }
    }
  }
}
