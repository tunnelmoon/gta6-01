// Mara Voss: articulated character mesh, on-foot movement, enter/exit,
// health and armor, weapon inventory.
import * as THREE from 'three';
import { City } from './city.js';
import { ECONOMY, PLAYER_TUNE, WEAPONS, WeaponSpec, clamp, isWater } from './config.js';
import { Vehicle } from './vehicles.js';

export interface FootInput {
  fwd: number; // -1..1 (W/S relative to camera)
  strafe: number; // -1..1 (A/D relative to camera)
  sprint: boolean;
  aim: boolean;
}

function limbMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
}

export function buildMaraMesh(): { group: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; torso: THREE.Mesh } {
  const group = new THREE.Group();
  const jacket = limbMat(0x5a2a22); // leather bomber jacket, oxblood
  const jeans = limbMat(0x2a3444);
  const skin = limbMat(0xc89878);
  const boots = limbMat(0x1c1a18);
  const hair = limbMat(0x14100c);
  // legs pivot at the hip (y 0.95)
  const mkLeg = (sx: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.16, 0.95, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.22), jeans);
    leg.position.y = -0.42;
    leg.castShadow = true;
    pivot.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.34), boots);
    boot.position.set(0, -0.88, 0.05);
    pivot.add(boot);
    group.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.3), jacket);
  torso.position.y = 1.28;
  torso.castShadow = true;
  group.add(torso);
  // jacket collar + belt
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.32), limbMat(0x3a1a14));
  collar.position.y = 1.62;
  group.add(collar);
  // head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.34), hair);
  hairM.position.set(0, 1.94, -0.03);
  group.add(hairM);
  const ponytail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), hair);
  ponytail.position.set(0, 1.72, -0.22);
  group.add(ponytail);
  // arms pivot at the shoulder (y 1.52)
  const mkArm = (sx: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.34, 1.52, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.19), jacket);
    arm.position.y = -0.3;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), skin);
    hand.position.y = -0.64;
    pivot.add(hand);
    group.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  return { group, armL, armR, legL, legR, torso };
}

export class Player {
  group: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  x = -540;
  z = 80;
  heading = 0;
  vx = 0;
  vz = 0;
  health = PLAYER_TUNE.health;
  armor = 0;
  cash = ECONOMY.startCash;
  inVehicle: Vehicle | null = null;
  weapons: { spec: WeaponSpec; clip: number; reserve: number }[] = [];
  weaponIndex = 0;
  private walkPhase = 0;
  private aimBlend = 0;
  dead = false;

  constructor(scene: THREE.Scene) {
    const built = buildMaraMesh();
    this.group = built.group;
    this.armL = built.armL;
    this.armR = built.armR;
    this.legL = built.legL;
    this.legR = built.legR;
    scene.add(this.group);
    this.weapons = WEAPONS.map((w) => ({ spec: w, clip: w.clip === Infinity ? Infinity : w.clip, reserve: w.reserve }));
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }
  get mph(): number {
    return Math.abs(this.speed) * 2.237;
  }
  get currentWeapon(): { spec: WeaponSpec; clip: number; reserve: number } {
    return this.weapons[this.weaponIndex];
  }
  get radius(): number {
    return PLAYER_TUNE.radius;
  }

  place(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.syncMesh(0);
  }

  hasWeapon(slot: number): boolean {
    const w = this.weapons[slot - 1];
    return w !== undefined && w.spec.unlock === 0;
  }
  unlockWeapon(slot: number): void {
    const w = this.weapons[slot - 1];
    if (w) w.spec.unlock = 0;
  }

  takeDamage(amount: number): boolean {
    if (this.dead) return false;
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.health -= rest;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  healFull(): void {
    this.health = PLAYER_TUNE.health;
    this.armor = 0;
    this.dead = false;
  }

  enterVehicle(v: Vehicle): void {
    this.inVehicle = v;
    this.group.visible = false;
  }

  exitVehicle(): void {
    const v = this.inVehicle;
    if (!v) return;
    this.inVehicle = null;
    const sx = Math.cos(v.heading);
    const sz = -Math.sin(v.heading);
    this.x = v.x + sx * (v.spec.width / 2 + 1.2);
    this.z = v.z + sz * (v.spec.width / 2 + 1.2);
    this.heading = v.heading;
    this.group.visible = true;
    this.syncMesh(0);
  }

  update(dt: number, input: FootInput, cameraYaw: number, city: City): void {
    if (this.inVehicle || this.dead) return;
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    // camera-relative movement: forward is the camera's view direction
    // (away from the camera, into the screen), right is screen right
    const mx = sin * input.fwd - cos * input.strafe;
    const mz = cos * input.fwd + sin * input.strafe;
    const mag = Math.hypot(mx, mz);
    const targetSpeed = input.sprint ? PLAYER_TUNE.sprintSpeed : PLAYER_TUNE.walkSpeed;
    if (mag > 0.01) {
      const nx = mx / mag;
      const nz = mz / mag;
      const accel = PLAYER_TUNE.accel * dt;
      this.vx += nx * accel;
      this.vz += nz * accel;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > targetSpeed) {
        this.vx = (this.vx / sp) * targetSpeed;
        this.vz = (this.vz / sp) * targetSpeed;
      }
      const wantHeading = Math.atan2(this.vx, this.vz);
      let d = wantHeading - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += clamp(d, -9 * dt, 9 * dt);
    } else {
      const sp = Math.hypot(this.vx, this.vz);
      const dec = Math.min(sp, PLAYER_TUNE.accel * dt);
      if (sp > 0.001) {
        this.vx -= (this.vx / sp) * dec;
        this.vz -= (this.vz / sp) * dec;
      } else {
        this.vx = 0;
        this.vz = 0;
      }
    }
    const px = this.x;
    const pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.x = clamp(this.x, -890, 890);
    this.z = clamp(this.z, -990, 890);
    if (isWater(this.x, this.z)) {
      this.x = px;
      this.z = pz;
      this.vx = 0;
      this.vz = 0;
    }
    const hit = city.collideCircle(this.x, this.z, this.radius);
    this.x = hit.x;
    this.z = hit.z;
    this.syncMesh(dt);
  }

  private syncMesh(dt: number): void {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    const sp = this.speed;
    this.walkPhase += sp * dt * 1.9;
    const swing = clamp(sp / PLAYER_TUNE.walkSpeed, 0, 1.6) * 0.55;
    const s = Math.sin(this.walkPhase);
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;
    this.armL.rotation.x = -s * swing * 0.8;
    this.armR.rotation.x = s * swing * 0.8;
    // aim blend: right arm raises to point forward
    const wantAim = 0;
    this.aimBlend = lerp(this.aimBlend, wantAim, Math.min(1, dt * 8));
    void this.aimBlend;
  }

  // Aim pose: right arm forward, body faces the camera's view direction
  // (away from the camera, into the screen).
  setAimPose(aiming: boolean, cameraYaw: number): void {
    if (this.inVehicle) return;
    if (aiming) {
      this.heading = cameraYaw;
      this.armR.rotation.x = -1.35;
      this.armL.rotation.x = -0.9;
      this.armL.rotation.z = 0.5;
    } else {
      this.armL.rotation.z = 0;
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
