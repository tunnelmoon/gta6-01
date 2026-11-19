// Solmar Sunset: game orchestrator. Owns the loop, state machine (title,
// playing, paused, cutscene, dead), player/vehicle control, shooting,
// collisions, wanted heat, shops, save/load, cutscenes and the debug API
// the playtest and screenshot drivers use.
import * as THREE from 'three';
import { AudioEngine, RadioStation } from './audio.js';
import { City, TimeOfDay } from './city.js';
import { Combat, Enemy } from './combat.js';
import { ECONOMY, LOC, PALETTE, PLAYER, WEAPONS, clamp, districtAt, lerp } from './config.js';
import { Hud, MenuName } from './hud.js';
import { Input } from './input.js';
import { Minimap } from './minimap.js';
import { MISSIONS, MissionContext, MissionDef, Missions } from './missions.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { CameraRig, Particles, Renderer } from './render.js';
import { Rng } from './rng.js';
import { Traffic } from './traffic.js';
import { Vehicle, makeVehicle } from './vehicles.js';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'cutscene' | 'dead' | 'complete';

export interface SaveData {
  version: 1;
  cash: number;
  armor: number;
  health: number;
  missionIndex: number;
  storyComplete: boolean;
  customsUnlocked: boolean;
  armoryUnlocked: boolean;
  unlockedWeapons: string[];
  playerX: number;
  playerZ: number;
  timeMin: number;
  quality: string;
}

const SAVE_KEY = 'solmar-sunset-save-v1';

export class Game {
  state: GameState = 'loading';
  city: City;
  player: Player;
  traffic: Traffic;
  peds: Pedestrians;
  police: Police;
  combat: Combat;
  missions: Missions;
  audio: AudioEngine;
  hud: Hud;
  minimap: Minimap;
  rig: CameraRig;
  particles: Particles;
  input: Input;
  renderer: Renderer;
  playerVehicle: Vehicle | null = null;
  vehicles: Vehicle[] = [];
  time = 0;
  playTimeMin = 0;
  quality = 'medium';
  shotMode = false;
  shotFrames = 0;
  debugAim = false;
  debugDrive = false;
  private rng: Rng;
  private seed: number;
  private lastNow = 0;
  private cutscene: { def: { duration: number; lines: { speaker: string; text: string }[] }; t: number; lineIdx: number; onDone: () => void } | null = null;
  private cutsceneWasPlaying = false;
  private shopOpen = false;
  private shopKind: 'customs' | 'armory' | null = null;
  private mapOpen = false;
  private respawnCostPaid = false;
  private districtName = '';
  private pausedFrom: GameState = 'playing';
  private deadKind: 'WASTED' | 'BUSTED' = 'WASTED';
  private gpsRoute: { x: number; z: number }[] | null = null;
  private gpsTarget: { x: number; z: number } | null = null;
  private fireHeld = false;
  private meleeCd = 0;
  private hitFlash = 0;

  constructor(canvas: HTMLCanvasElement, seed: number, opts: { lowFx?: boolean } = {}) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.renderer = new Renderer(canvas, opts.lowFx ?? false);
    this.city = new City(this.renderer.scene, seed);
    this.particles = new Particles(this.renderer.scene);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.player = new Player(this.renderer.scene);
    this.player.cash = ECONOMY.startCash;
    this.traffic = new Traffic(this.renderer.scene, this.city, seed + 11);
    this.peds = new Pedestrians(this.renderer.scene, this.city, seed + 23);
    this.police = new Police(this.renderer.scene, this.city, seed + 37);
    this.combat = new Combat(this.renderer.scene, this.city, this.particles, seed + 41);
    this.missions = new Missions(this.makeMissionContext());
    this.rig = new CameraRig();
    const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.minimap = new Minimap(minimapCanvas, this.city);
    this.hud = new Hud({
      onNewGame: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onResume: () => this.resume(),
      onRestartMission: () => this.restartMission(),
      onSave: () => this.saveGame(true),
      onQuitToTitle: () => this.quitToTitle(),
      onQuality: (q) => this.setQuality(q),
      onShopBuy: (item) => this.buyShopItem(item),
      onCloseShop: () => this.closeShop(),
      onToggleMap: () => this.toggleMap(),
    });
    this.police.onBusted = () => this.onBusted();
    this.police.onShoot = (from, to) => this.combat.policeShot(from, to);
    this.combat.onEnemyKilled = (e) => this.missions.onEnemyKilled(e);
    this.combat.onPlayerDamage = (amount, from) => this.damagePlayer(amount, from);
    this.combat.onShotFired = (kind) => {
      this.audio.gunshot(kind);
      this.rig.addTrauma(kind === 'bulldog' ? 0.22 : 0.12);
    };
    this.peds.onCash = (amount) => {
      this.player.cash += amount;
      this.audio.pickup();
      this.hud.toast('+$' + amount);
    };
    this.spawnParkedCars();
    this.applyQuality();
    this.hud.setLoading(false);
    this.hud.setLoadingText('Building Solmar...');
    this.loadSaveIfAny();
    this.state = 'title';
    this.hud.setLoading(true);
    this.hud.setHudVisible(false);
    this.hud.showMenu('title');
    this.rig.yaw = 0.6;
    this.rig.pitch = 0.3;
    this.rig.snapTo(new THREE.Vector3(0, 0, 0));
  }

  private makeMissionContext(): MissionContext {
    return {
      city: this.city,
      playerPos: () => this.player.pos,
      playerVehicle: () => this.playerVehicle,
      playerInVehicle: () => this.player.state === 'vehicle',
      spawnVehicle: (defId, x, z, heading) => this.spawnMissionVehicle(defId, x, z, heading),
      removeVehicle: (v) => this.removeVehicle(v),
      spawnEnemy: (x, z, hp, faction) => this.combat.spawnEnemy(x, z, hp, faction),
      addHeat: (n) => this.police.addHeat(n),
      setHeat: (n) => {
        this.police.heat = clamp(n, 0, 100);
      },
      giveCash: (n) => {
        this.player.cash += n;
      },
      unlockWeapon: (id) => {
        this.combat.unlock(id);
        this.player.setWeapon(id);
        this.combat.select(id);
      },
      setArmor: (n) => {
        this.player.armor = n;
      },
      healPlayer: () => this.player.healFull(),
      setTimeOfDay: (m: TimeOfDay) => this.city.setTimeOfDay(m),
      playCutscene: (cut, onDone) => this.playCutscene(cut, onDone),
      showSubtitle: (s, t) => this.hud.showSubtitle(s, t),
      clearSubtitle: () => this.hud.clearSubtitle(),
      notify: (t) => this.hud.toast(t),
      onMissionComplete: (m) => this.onMissionComplete(m),
      onMissionFailed: (r) => this.onMissionFailed(r),
      isPlayerSeen: () => this.police.isSeen(this.player.pos),
      isKeyDown: (k: string) => this.input.down(k),
      openCompoundGate: () => this.city.openCompoundGate(),
      setWantedBlockade: () => this.spawnBridgeBlockade(),
    };
  }

  private spawnMissionVehicle(defId: string, x: number, z: number, heading: number): Vehicle {
    const v = makeVehicle(defId, this.renderer.scene, this.rng);
    v.place(x, z, heading);
    v.onSmoke = (pos, fire) => {
      const c = fire ? [1, 0.45, 0.1] : [0.5, 0.5, 0.5];
      this.particles.burst(pos, fire ? 8 : 3, fire ? 5 : 2, 0.8, c[0], c[1], c[2]);
    };
    v.onExplode = (veh) => this.explodeVehicle(veh);
    this.vehicles.push(v);
    return v;
  }

  private removeVehicle(v: Vehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    if (this.playerVehicle === v) this.playerVehicle = null;
    v.dispose(this.renderer.scene);
  }

  private spawnParkedCars(): void {
    const spots: { x: number; z: number; h: number; def: string }[] = [
      { x: -530, z: 80, h: 0, def: 'urbanSedan' },
      { x: -520, z: 80, h: Math.PI / 2, def: 'v8Dorado' },
      { x: -440, z: -80, h: 0, def: 'urbanSedan' },
      { x: 60, z: -80, h: Math.PI, def: 'solmarGT' },
      { x: 140, z: 80, h: Math.PI / 2, def: 'urbanSedan' },
      { x: 500, z: 80, h: 0, def: 'v8Dorado' },
      { x: 620, z: -240, h: Math.PI, def: 'urbanSedan' },
      { x: -40, z: 400, h: Math.PI / 2, def: 'cargoMule' },
      { x: 200, z: 560, h: 0, def: 'cargoMule' },
      { x: -640, z: 200, h: Math.PI, def: 'urbanSedan' },
      { x: -320, z: -200, h: Math.PI / 2, def: 'v8Dorado' },
      { x: 320, z: 200, h: 0, def: 'urbanSedan' },
      { x: 800, z: 240, h: Math.PI / 2, def: 'solmarGT' },
      { x: 160, z: -700, h: 0, def: 'urbanSedan' },
      { x: -160, z: -700, h: Math.PI, def: 'v8Dorado' },
      { x: 20, z: 240, h: Math.PI / 2, def: 'urbanSedan' },
    ];
    const tints = [0x7a8a99, 0xd8542e, 0xc0c8d0, 0x3a5a3a, 0x8a6a9a, 0xc9a03c, 0x2a4a6a, 0xb0b8c0];
    for (const s of spots) {
      const v = this.spawnMissionVehicle(s.def, s.x, s.z, s.h);
      v.recolor(tints[Math.floor(this.rng.next() * tints.length)]);
    }
  }

  private spawnBridgeBlockade(): void {
    for (const [x, z] of [[-6, -470], [6, -470]] as const) {
      const rb = this.spawnMissionVehicle('enforcer', x, z, 0);
      rb.ai = true;
    }
  }

  private explodeVehicle(v: Vehicle): void {
    const pos = v.pos.clone();
    pos.y = 1;
    this.particles.burst(pos, 40, 9, 1.2, 1, 0.55, 0.15);
    this.particles.burst(pos, 25, 5, 1.8, 0.25, 0.25, 0.25);
    this.audio.explosion();
    this.rig.addTrauma(0.7);
    const p = this.player.pos;
    const d = Math.hypot(p.x - v.pos.x, p.z - v.pos.z);
    if (d < 12) this.damagePlayer(35, v.pos);
    this.traffic.panicNear(v.pos.x, v.pos.z, 60);
    this.peds.panicNear(v.pos.x, v.pos.z, 50);
    if (this.playerVehicle === v) {
      this.playerVehicle = null;
      this.player.state = 'foot';
      this.player.teleport(v.pos.x + 3, v.pos.z + 3);
    }
    window.setTimeout(() => this.removeVehicle(v), 2500);
  }

  private damagePlayer(amount: number, from: THREE.Vector3): void {
    if (this.state !== 'playing' && this.state !== 'cutscene') return;
    if (this.player.state === 'dead') return;
    this.player.takeDamage(amount);
    this.rig.addTrauma(0.3);
    this.hitFlash = 0.25;
    if (this.player.health <= 0) {
      this.onWasted();
    }
    void from;
  }

  private onWasted(): void {
    this.audio.wasted();
    this.audio.stopEngine();
    this.audio.setSiren(false);
    this.deadKind = 'WASTED';
    this.state = 'dead';
    this.hud.setDeadTitle('WASTED');
    this.hud.showMenu('dead');
    this.input.releaseLock();
    this.missions.onPlayerDeath();
  }

  private onBusted(): void {
    if (this.state !== 'playing') return;
    this.audio.wasted();
    this.audio.stopEngine();
    this.audio.setSiren(false);
    this.deadKind = 'BUSTED';
    this.state = 'dead';
    this.hud.setDeadTitle('BUSTED');
    this.hud.showMenu('dead');
    this.input.releaseLock();
    this.missions.onPlayerBusted();
  }

  newGame(): void {
    this.audio.init();
    this.audio.resume();
    this.player.cash = ECONOMY.startCash;
    this.player.health = PLAYER.maxHealth;
    this.player.armor = 0;
    this.player.state = 'foot';
    this.player.teleport(LOC.elFaroBar.x - 20, LOC.elFaroBar.z + 30);
    this.player.heading = Math.PI / 2;
    this.combat.clearEnemies();
    this.combat.unlocked = new Set(['melee']);
    this.combat.select('melee');
    this.player.setWeapon('melee');
    this.missions.current = -1;
    this.missions.active = false;
    this.missions.storyComplete = false;
    this.missions.customsUnlocked = false;
    this.missions.armoryUnlocked = false;
    this.missions.discount = false;
    this.police.clearWanted();
    this.playTimeMin = 0;
    this.city.setTimeOfDay('sunset');
    this.state = 'playing';
    this.hud.setHudVisible(true);
    this.hud.hideMenus();
    this.rig.yaw = this.player.heading;
    this.rig.snapTo(this.player.pos);
    this.hud.toast('Welcome to Solmar. Find the yellow ring at El Faro Bar.');
    this.saveGame(false);
  }

  continueGame(): void {
    const save = this.readSave();
    if (!save) {
      this.newGame();
      return;
    }
    this.applySave(save);
    this.state = 'playing';
    this.hud.setHudVisible(true);
    this.hud.hideMenus();
    this.rig.yaw = this.player.heading;
    this.rig.snapTo(this.player.pos);
  }

  resume(): void {
    if (this.state === 'dead') {
      // Respawn after wasted/busted: $100, nearest safe spot, mission stays failed.
      this.player.cash = Math.max(0, this.player.cash - ECONOMY.respawnCost);
      this.player.healFull();
      this.player.armor = Math.max(this.player.armor, 0);
      this.player.state = 'foot';
      this.player.teleport(LOC.safehouseMotel.x - 20, LOC.safehouseMotel.z + 20);
      this.police.clearWanted();
      this.state = 'playing';
      this.hud.hideMenus();
      this.rig.snapTo(this.player.pos);
      return;
    }
    if (this.state === 'paused' || this.state === 'complete') {
      this.state = 'playing';
      this.hud.hideMenus();
    }
  }

  restartMission(): void {
    if (this.missions.current < 0) {
      this.resume();
      return;
    }
    const i = this.missions.current;
    this.player.healFull();
    this.player.state = 'foot';
    this.player.teleport(MISSIONS[i].startX, MISSIONS[i].startZ + 20);
    this.police.clearWanted();
    this.state = 'playing';
    this.hud.hideMenus();
    this.missions.startMission(i);
  }

  quitToTitle(): void {
    this.saveGame(false);
    this.state = 'title';
    this.hud.setHudVisible(false);
    this.hud.showMenu('title');
    this.input.releaseLock();
    this.audio.stopEngine();
    this.audio.setSiren(false);
    this.loadSaveIfAny();
  }

  setQuality(q: string): void {
    this.quality = q;
    this.applyQuality();
    this.hud.toast('Graphics: ' + q);
  }

  private applyQuality(): void {
    const r = this.renderer.renderer;
    if (this.quality === 'low') {
      r.setPixelRatio(1);
      r.shadowMap.enabled = false;
      this.traffic.setCount(16);
      this.peds.setCount(28);
    } else if (this.quality === 'high') {
      r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      r.shadowMap.enabled = true;
      this.traffic.setCount(35);
      this.peds.setCount(60);
    } else {
      r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      r.shadowMap.enabled = true;
      this.traffic.setCount(30);
      this.peds.setCount(48);
    }
  }

  playCutscene(def: { duration: number; camFrom: THREE.Vector3; camTo: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; lines: { speaker: string; text: string }[] }, onDone: () => void): void {
    this.cutscene = { def, t: 0, lineIdx: -1, onDone };
    this.cutsceneWasPlaying = this.state === 'playing';
    this.state = 'cutscene';
    document.body.classList.add('cutscene');
    this.rig.setCutscene(def.camFrom, def.camTo, def.lookFrom, def.lookTo, def.duration);
    this.input.releaseLock();
  }

  private finishCutscene(): void {
    if (!this.cutscene) return;
    const done = this.cutscene.onDone;
    this.cutscene = null;
    this.rig.endCutscene();
    document.body.classList.remove('cutscene');
    this.hud.clearSubtitle();
    this.state = 'playing';
    done();
    if (this.completePending) {
      this.completePending = false;
      this.state = 'complete';
      this.hud.setCompleteStats(this.player.cash, Math.round(this.playTimeMin));
      this.hud.showMenu('complete');
    }
  }

  // Shot driver helpers (also used by the playtest).
  skipCutscene(): void {
    this.finishCutscene();
  }

  spawnShotVehicle(defId: string, x: number, z: number, heading: number): Vehicle {
    return this.spawnMissionVehicle(defId, x, z, heading);
  }

  shotEnterVehicle(v: Vehicle): void {
    this.enterVehicle(v);
  }

  private completePending = false;

  private onMissionComplete(m: MissionDef): void {
    this.audio.missionDone();
    this.hud.toast('Mission complete: ' + m.title + ' - ' + m.rewardText);
    this.saveGame(false);
    if (m.id === 'm4') this.completePending = true;
  }

  private onMissionFailed(reason: string): void {
    this.hud.toast(reason);
    this.audio.wasted();
    this.saveGame(false);
  }

  private buyShopItem(item: string): void {
    const disc = this.missions.discount ? ECONOMY.storyDiscount : 1;
    const price = (base: number) => Math.round(base * disc);
    if (item === 'armor') {
      const p = price(ECONOMY.armorCost);
      if (this.player.cash < p) return this.hud.toast('Not enough cash.');
      this.player.cash -= p;
      this.player.armor = ECONOMY.armorValue;
      this.audio.pickup();
      this.hud.toast('Body Armor fitted (+100 AP).');
    } else if (item === 'ammo') {
      const p = price(ECONOMY.ammoCost);
      if (this.player.cash < p) return this.hud.toast('Not enough cash.');
      const def = this.combat.weaponDef(this.combat.current);
      if (def.mag === 0) return this.hud.toast('No ammo for fists.');
      this.player.cash -= p;
      this.combat.addAmmo(this.combat.current, def.maxReserve);
      this.audio.pickup();
      this.hud.toast(def.name + ' ammo restocked.');
    } else if (item === 'repair') {
      const p = price(ECONOMY.resprayCost);
      if (!this.playerVehicle) return this.hud.toast('No vehicle to repair.');
      if (this.player.cash < p) return this.hud.toast('Not enough cash.');
      this.player.cash -= p;
      this.playerVehicle.hp = this.playerVehicle.def.hp;
      this.audio.pickup();
      this.hud.toast('Vehicle repaired to 100%.');
    } else if (item === 'respray') {
      const p = price(ECONOMY.resprayCost);
      if (!this.playerVehicle) return this.hud.toast('No vehicle to respray.');
      if (this.player.cash < p) return this.hud.toast('Not enough cash.');
      this.player.cash -= p;
      this.playerVehicle.hp = this.playerVehicle.def.hp;
      this.playerVehicle.recolor([0xc0c8d0, 0xd8542e, 0x3a5a3a, 0x8a6a9a, 0xc9a03c][Math.floor(this.rng.next() * 5)]);
      this.police.clearWanted();
      this.audio.pickup();
      this.hud.toast('Respray done. Heat cleared, fresh paint.');
    }
  }

  private openShop(kind: 'customs' | 'armory'): void {
    this.shopKind = kind;
    this.shopOpen = true;
    this.state = 'paused';
    this.pausedFrom = 'playing';
    const disc = this.missions.discount ? ECONOMY.storyDiscount : 1;
    const price = (base: number) => Math.round(base * disc);
    this.hud.setShopPrices(this.missions.discount, price(ECONOMY.armorCost), price(ECONOMY.ammoCost), price(ECONOMY.resprayCost), price(ECONOMY.resprayCost));
    this.hud.showMenu('shop');
    const title = document.getElementById('shop-title');
    if (title) title.textContent = kind === 'customs' ? 'VOSS CUSTOMS' : 'SOLMAR ARMORY';
    this.input.releaseLock();
  }

  private closeShop(): void {
    this.shopOpen = false;
    this.shopKind = null;
    this.state = 'playing';
    this.hud.hideMenus();
  }

  private toggleMap(): void {
    this.mapOpen = !this.mapOpen;
    const el = document.getElementById('map-overlay');
    if (!el) return;
    el.classList.toggle('visible', this.mapOpen);
    if (this.mapOpen) this.drawFullMap();
  }

  private drawFullMap(): void {
    const canvas = document.getElementById('fullmap') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.minimap.drawFull(canvas, this.player.pos, this.missions.waypoint);
  }

  // ---- save / load ----

  private readSave(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  }

  private loadSaveIfAny(): void {
    const save = this.readSave();
    this.hud.setContinueVisible(!!save);
  }

  private applySave(save: SaveData): void {
    this.player.cash = save.cash;
    this.player.armor = save.armor;
    this.player.health = save.health;
    this.player.teleport(save.playerX, save.playerZ);
    this.player.state = 'foot';
    this.missions.current = save.missionIndex;
    this.missions.storyComplete = save.storyComplete;
    this.missions.customsUnlocked = save.customsUnlocked;
    this.missions.armoryUnlocked = save.armoryUnlocked;
    this.missions.discount = save.storyComplete;
    for (const w of save.unlockedWeapons) this.combat.unlock(w);
    if (save.unlockedWeapons.length > 0) {
      const last = save.unlockedWeapons[save.unlockedWeapons.length - 1];
      this.combat.select(last);
      this.player.setWeapon(last);
    }
    this.playTimeMin = save.timeMin;
    this.setQuality(save.quality || 'medium');
  }

  saveGame(notify: boolean): void {
    const data: SaveData = {
      version: 1,
      cash: this.player.cash,
      armor: this.player.armor,
      health: this.player.health,
      missionIndex: this.missions.current,
      storyComplete: this.missions.storyComplete,
      customsUnlocked: this.missions.customsUnlocked,
      armoryUnlocked: this.missions.armoryUnlocked,
      unlockedWeapons: [...this.combat.unlocked],
      playerX: this.player.pos.x,
      playerZ: this.player.pos.z,
      timeMin: this.playTimeMin,
      quality: this.quality,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (notify) this.hud.toast('Game saved.');
    } catch {
      if (notify) this.hud.toast('Save failed: storage unavailable.');
    }
  }

  // ---- main loop ----

  start(): void {
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      if (this.lastNow === 0) this.lastNow = now;
      let dt = (now - this.lastNow) / 1000;
      this.lastNow = now;
      if (this.shotMode) dt = 1 / 60;
      dt = Math.min(dt, 0.05);
      // In shot mode the scene freezes after frame 60, so two captures of
      // the same load are byte-identical renders of the same frame.
      const frozen = this.shotMode && this.shotFrames >= 60;
      if (!frozen) {
        this.time += dt;
        this.update(dt);
      }
      this.renderer.render();
      if (this.shotMode) {
        this.shotFrames++;
        if (this.shotFrames >= 60 && !(window as unknown as { __shotReady?: boolean }).__shotReady) {
          (window as unknown as { __shotReady?: boolean }).__shotReady = true;
        }
      }
      this.input.endFrame();
    };
    requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    if (this.state === 'title') {
      this.rig.yaw += dt * 0.05;
      const center = new THREE.Vector3(0, 0, 0);
      this.rig.update(dt, center, 0, this.city, this.renderer.camera, false);
      this.traffic.update(dt, center, []);
      this.peds.update(dt, center, 0);
      this.city.update(dt, this.time);
      this.particles.update(dt);
      return;
    }
    if (this.state === 'paused' || this.state === 'dead' || this.state === 'complete') {
      return;
    }
    if (this.state === 'cutscene' && this.cutscene) {
      this.cutscene.t += dt;
      const c = this.cutscene;
      const per = c.def.duration / Math.max(1, c.def.lines.length);
      const idx = Math.min(c.def.lines.length - 1, Math.floor(c.t / per));
      if (idx !== c.lineIdx) {
        c.lineIdx = idx;
        const line = c.def.lines[idx];
        this.hud.showSubtitle(line.speaker, line.text);
      }
      if (this.input.wasPressed('enter') || c.t >= c.def.duration) {
        this.finishCutscene();
      }
      this.rig.update(dt, this.player.pos, 0, this.city, this.renderer.camera, false);
      this.city.update(dt, this.time);
      this.particles.update(dt);
      return;
    }
    // Playing.
    this.playTimeMin += dt / 60;
    this.handlePlayingInput(dt);
    this.updateWorld(dt);
    this.updateHud(dt);
  }

  private handlePlayingInput(dt: number): void {
    const input = this.input;
    const mouse = input.consumeMouse();
    this.rig.yaw -= mouse.dx * 0.0028;
    this.rig.pitch = clamp(this.rig.pitch + mouse.dy * 0.0022, -0.15, 1.1);
    if (input.wasPressed('escape')) {
      this.state = 'paused';
      this.pausedFrom = 'playing';
      this.hud.showMenu('pause');
      this.input.releaseLock();
      return;
    }
    if (input.wasPressed('m')) this.toggleMap();
    if (input.wasPressed('tab') || input.wasPressed('[') || input.wasPressed(']')) {
      const order: RadioStation[] = ['off', 'wave', 'heat'];
      const cur = this.audio.getStation();
      const next = order[(order.indexOf(cur) + 1) % order.length];
      this.audio.setStation(next);
      this.hud.setRadio(next);
      this.hud.toast(next === 'off' ? 'Radio off' : next === 'wave' ? 'Solmar Wave 104.5' : 'Dorado Heat 98.2');
    }
    if (input.wasPressed('1')) this.selectWeapon('melee');
    if (input.wasPressed('2')) this.selectWeapon('kestrel');
    if (input.wasPressed('3')) this.selectWeapon('viper');
    if (input.wasPressed('4')) this.selectWeapon('bulldog');
    if (input.wasPressed('r')) this.combat.startReload();
    if (input.wasPressed('e') || input.wasPressed('f')) this.onInteract(input.wasPressed('f'));
  }

  private selectWeapon(id: string): void {
    if (this.combat.select(id)) {
      this.player.setWeapon(id);
      this.audio.uiClick();
    } else {
      this.hud.toast('Weapon locked. Finish the story to unlock it.');
    }
  }

  private onInteract(isExit: boolean): void {
    if (this.state !== 'playing') return;
    const p = this.player.pos;
    // Mission context actions first.
    if (this.missions.active && this.missions.interact()) return;
    // Shops.
    const dCustoms = Math.hypot(p.x - LOC.vossCustoms.x, p.z - LOC.vossCustoms.z);
    const dArmory = Math.hypot(p.x - LOC.solmarArmory.x, p.z - LOC.solmarArmory.z);
    if (this.player.state === 'foot') {
      if (dCustoms < 14 && this.missions.customsUnlocked) {
        this.openShop('customs');
        return;
      }
      if (dArmory < 14 && this.missions.armoryUnlocked) {
        this.openShop('armory');
        return;
      }
    }
    // Mission start ring.
    const ring = this.missions.nextStartRing();
    if (ring && this.player.state === 'foot') {
      const d = Math.hypot(p.x - ring.x, p.z - ring.z);
      if (d < 10) {
        this.missions.startMission(this.missions.nextMissionIndex());
        return;
      }
    }
    // Enter / exit vehicle.
    if (this.player.state === 'vehicle') {
      this.exitVehicle();
      return;
    }
    if (isExit) return;
    const v = this.nearestVehicle(p, 5);
    if (v) this.enterVehicle(v);
  }

  private nearestVehicle(p: THREE.Vector3, maxD: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = maxD;
    const consider = (v: Vehicle) => {
      if (v.exploded) return;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    };
    for (const v of this.vehicles) consider(v);
    for (const v of this.traffic.cars) consider(v);
    for (const v of this.police.units) consider(v);
    return best;
  }

  private enterVehicle(v: Vehicle): void {
    // Stealing a traffic car removes it from traffic; stealing in view of
    // the police adds heat.
    const ti = this.traffic.cars.indexOf(v);
    if (ti >= 0) {
      this.traffic.removeCarByVehicle(v);
      if (this.police.units.some((u) => Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) < 80)) {
        this.police.addHeat(18);
        this.hud.toast('Car stolen in view of SMPD.');
      }
    }
    this.playerVehicle = v;
    v.isPlayerDriven = true;
    this.player.state = 'vehicle';
    this.audio.init();
    this.audio.startEngine();
    this.hud.toast(v.def.name);
  }

  private exitVehicle(): void {
    const v = this.playerVehicle;
    if (!v) return;
    v.isPlayerDriven = false;
    const side = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
    this.player.teleport(v.pos.x + side.x * 2.4, v.pos.z + side.z * 2.4);
    this.player.state = 'foot';
    this.playerVehicle = null;
    this.audio.stopEngine();
  }

  private updateWorld(dt: number): void {
    const p = this.player.pos;
    const inVehicle = this.player.state === 'vehicle';
    // Player movement / driving.
    if (inVehicle && this.playerVehicle) {
      const v = this.playerVehicle;
      const input = this.input;
      const throttle = this.debugDrive ? 1 : input.down('w', 'arrowup') ? 1 : input.down('s', 'arrowdown') ? -1 : 0;
      const steer = this.debugDrive ? 0 : input.down('a', 'arrowleft') ? -1 : input.down('d', 'arrowright') ? 1 : 0;
      v.update(dt, { throttle, steer, drift: input.down(' '), horn: input.down('h') }, this.city);
      this.player.pos.copy(v.pos);
      this.player.heading = v.heading;
      this.player.speed = Math.abs(v.speed);
      const rpm = clamp(Math.abs(v.speed) / v.def.topSpeed, 0, 1);
      this.audio.setEngine(rpm, Math.abs(throttle));
      this.audio.setSkid(v.drifting ? 0.8 : 0);
      // Car vs pedestrians.
      if (Math.abs(v.speed) > 3) {
        const knocked = this.peds.knockDownAt(v.pos.x, v.pos.z, 2.6);
        if (knocked > 0) {
          this.police.addHeat(26 * knocked);
          this.rig.addTrauma(0.25);
        }
      }
      // Drive-by with the Viper.
      if (this.input.mouseDown && this.combat.current === 'viper') {
        this.fireFromVehicle();
      }
    } else {
      const blocked = this.missions.active && this.cutscene !== null;
      const aiming = this.debugAim || (this.input.mouseDownRight && this.combat.current !== 'melee');
      this.player.update(dt, this.input, this.rig.yaw, this.city, blocked, aiming);
      this.audio.setSkid(0);
      // On-foot shooting and melee.
      this.meleeCd = Math.max(0, this.meleeCd - dt);
      if (this.input.mouseClicked && this.combat.current === 'melee') {
        const hit = this.combat.meleeAttack(this.player.pos, this.player.heading);
        if (hit) {
          this.player.melee();
          this.rig.addTrauma(0.15);
        } else {
          this.player.melee();
        }
      } else if (this.input.mouseDown && this.combat.current !== 'melee') {
        this.fireOnFoot();
      }
    }
    // Camera follows the player or the car.
    const speed = inVehicle && this.playerVehicle ? Math.abs(this.playerVehicle.speed) : this.player.speed;
    const aiming = this.debugAim || (this.input.mouseDownRight && this.combat.current !== 'melee' && !inVehicle);
    this.player.aiming = aiming;
    this.rig.update(dt, this.player.pos, speed, this.city, this.renderer.camera, aiming);

    // World systems.
    const obstacles: { pos: THREE.Vector3; radius: number }[] = [{ pos: p, radius: 0.6 }];
    for (const v of this.vehicles) obstacles.push({ pos: v.pos, radius: v.radius });
    for (const u of this.police.units) obstacles.push({ pos: u.pos, radius: u.radius });
    this.traffic.update(dt, p, obstacles);
    this.peds.update(dt, p, this.player.speed);
    this.police.update(dt, p, inVehicle, this.playerVehicle);
    this.combat.update(dt, p, this.player.state !== 'dead');
    this.missions.update(dt);
    this.city.update(dt, this.time);
    this.particles.update(dt);

    // Car vs car collisions with the player's vehicle.
    if (inVehicle && this.playerVehicle) {
      const pv = this.playerVehicle;
      const push = (other: Vehicle) => {
        if (other.exploded || other === pv) return;
        const dx = pv.pos.x - other.pos.x;
        const dz = pv.pos.z - other.pos.z;
        const d = Math.hypot(dx, dz);
        const min = pv.radius + other.radius;
        if (d < min && d > 0.01) {
          const overlap = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          pv.pos.x += nx * overlap;
          pv.pos.z += nz * overlap;
          other.pos.x -= nx * overlap;
          other.pos.z -= nz * overlap;
          const impact = Math.abs(pv.speed - other.speed);
          if (impact > 6) {
            pv.damage(impact * 0.4);
            other.damage(impact * 0.5);
            this.rig.addTrauma(0.2);
          }
        }
      };
      for (const c of this.traffic.cars) push(c);
      for (const u of this.police.units) push(u);
      for (const v of this.vehicles) push(v);
    }
    // Traffic cars hitting the on-foot player.
    if (!inVehicle && this.player.state === 'foot') {
      for (const c of this.traffic.cars) {
        const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
        if (d < c.radius + 0.6 && Math.abs(c.speed) > 4) {
          this.damagePlayer(20, c.pos);
          this.peds.panicNear(p.x, p.z, 30);
          c.speed *= 0.5;
        }
      }
      for (const u of this.police.units) {
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < u.radius + 0.6 && Math.abs(u.speed) > 4) {
          this.damagePlayer(15, u.pos);
        }
      }
    }
    // Siren audio when wanted.
    this.audio.setSiren(this.police.getStars() > 0);
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  private fireOnFoot(): void {
    const cam = this.renderer.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    // Flatten the aim: the camera looks slightly down at the player, so
    // its raw ray hits the ground a few metres out. Bullets fly at chest
    // height along the camera's horizontal bearing.
    dir.y = 0;
    dir.normalize();
    const from = new THREE.Vector3();
    this.player.muzzleWorldPos(from);
    const aim = this.combat.traceAim(from, dir, 90);
    const shootDir = aim.point.clone().sub(from).normalize();
    this.combat.fire(from, shootDir, this.player.pos, false);
    // Gunfire near police adds heat.
    for (const u of this.police.units) {
      const d = Math.hypot(u.pos.x - this.player.pos.x, u.pos.z - this.player.pos.z);
      if (d < 60) this.police.addHeat(2);
    }
    this.traffic.panicNear(this.player.pos.x, this.player.pos.z, 45);
    this.peds.panicNear(this.player.pos.x, this.player.pos.z, 35);
  }

  private fireFromVehicle(): void {
    const cam = this.renderer.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const v = this.playerVehicle!;
    const from = v.pos.clone();
    from.y = 1.3;
    from.x += Math.cos(v.heading) * 0.9;
    from.z -= Math.sin(v.heading) * 0.9;
    const aim = this.combat.traceAim(from, dir, 90);
    const shootDir = aim.point.clone().sub(from).normalize();
    this.combat.fire(from, shootDir, this.player.pos, false);
  }

  private updateHud(dt: number): void {
    const p = this.player;
    this.hud.setHealth(p.health, p.armor);
    this.hud.setCash(p.cash);
    this.hud.setStars(this.police.getStars());
    const def = this.combat.weaponDef(this.combat.current);
    const ammo = this.combat.getAmmo(this.combat.current);
    this.hud.setWeapon(def.name, ammo.clip, ammo.reserve, def.mag > 0);
    const inVehicle = this.player.state === 'vehicle' && this.playerVehicle !== null;
    const mph = inVehicle ? Math.abs(this.playerVehicle!.speed) * 2.237 : 0;
    const hpPct = inVehicle ? (this.playerVehicle!.hp / this.playerVehicle!.def.hp) * 100 : 100;
    this.hud.setSpeed(mph, inVehicle, hpPct);
    const district = this.cityDistrictAt(p.pos.x, p.pos.z);
    if (district !== this.districtName) {
      this.districtName = district;
      this.hud.setDistrict(district);
    }
    this.hud.setObjective(this.missions.active ? this.missions.objective : '');
    // GPS route to the current waypoint.
    const wp = this.missions.waypoint;
    if (wp) {
      const target = { x: wp.x, z: wp.z };
      if (!this.gpsTarget || Math.hypot(this.gpsTarget.x - target.x, this.gpsTarget.z - target.z) > 1 || !this.gpsRoute) {
        this.gpsTarget = target;
        this.gpsRoute = this.city.route(p.pos.x, p.pos.z, wp.x, wp.z);
      }
    } else {
      this.gpsRoute = null;
      this.gpsTarget = null;
    }
    // Interact prompt.
    let prompt = '';
    const ring = this.missions.nextStartRing();
    if (ring && this.player.state === 'foot' && Math.hypot(p.pos.x - ring.x, p.pos.z - ring.z) < 10) {
      prompt = 'Press E to start: ' + MISSIONS[this.missions.nextMissionIndex()].title;
    } else if (this.player.state === 'vehicle') {
      prompt = 'E: exit vehicle';
    } else {
      const v = this.nearestVehicle(p.pos, 5);
      if (v) prompt = 'E: enter ' + v.def.name;
      const dC = Math.hypot(p.pos.x - LOC.vossCustoms.x, p.pos.z - LOC.vossCustoms.z);
      const dA = Math.hypot(p.pos.x - LOC.solmarArmory.x, p.pos.z - LOC.solmarArmory.z);
      if (dC < 14 && this.missions.customsUnlocked) prompt = 'E: Voss Customs';
      if (dA < 14 && this.missions.armoryUnlocked) prompt = 'E: Solmar Armory';
      if (this.missions.active) {
        const s = this.missions.step;
        if (s && (s.kind === 'grab' || s.kind === 'rescue' || s.kind === 'gate' || s.kind === 'breach')) {
          const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
          if (d < s.radius + 3) prompt = s.kind === 'breach' ? 'Hold E: breach the vault' : 'Press E';
        }
      }
    }
    if (prompt) this.hud.showPrompt(prompt);
    else this.hud.hidePrompt();
    // Minimap.
    this.minimap.draw(
      this.player.pos,
      this.player.heading,
      this.gpsRoute,
      this.missions.waypoint,
      this.combat.enemies,
      this.police.visionCones(),
      this.city.pois,
      this.time,
    );
    void dt;
  }

  private cityDistrictAt(x: number, z: number): string {
    return districtAt(x, z).name;
  }

  // ---- debug API for the playtest and screenshot drivers ----

  exposeDebug(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__solmar = {
      game: this,
      state: () => this.state,
      playerPos: () => ({ x: this.player.pos.x, z: this.player.pos.z, health: this.player.health, cash: this.player.cash }),
      mission: () => ({ current: this.missions.current, active: this.missions.active, objective: this.missions.objective, step: this.missions.step?.kind ?? null }),
      wanted: () => this.police.getStars(),
      teleport: (x: number, z: number) => {
        if (this.playerVehicle) this.exitVehicle();
        this.player.teleport(x, z);
        this.rig.snapTo(this.player.pos);
      },
      startMission: (i: number) => this.missions.startMission(i),
      enterNearestVehicle: () => {
        const v = this.nearestVehicle(this.player.pos, 6);
        if (v) this.enterVehicle(v);
        return v?.def.id ?? null;
      },
      exitVehicle: () => this.exitVehicle(),
      damagePlayer: (n: number) => this.damagePlayer(n, this.player.pos),
      errors: (w.__errors as string[]) ?? [],
    };
    w.__errors = w.__errors ?? [];
    window.addEventListener('error', (e) => {
      (w.__errors as string[]).push(String(e.message));
    });
  }
}
