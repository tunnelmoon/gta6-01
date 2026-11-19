// Mara Voss: articulated 3D character mesh (leather bomber jacket, dark
// jeans, boots) with procedural walk, sprint, aim, shoot and melee
// animation. Movement is camera-relative, with building collision and
// shoreline blocking.
import * as THREE from 'three';
import { PLAYER, angleLerp, clamp, lerp } from './config.js';
import { City } from './city.js';
import { Input } from './input.js';

export type PlayerState = 'foot' | 'vehicle' | 'dead';

export class Player {
  group = new THREE.Group();
  pos = new THREE.Vector3(0, 0, 40);
  heading = Math.PI;
  speed = 0;
  state: PlayerState = 'foot';
  health = PLAYER.maxHealth;
  armor = 0;
  cash = 250;
  aiming = false;
  firing = false;
  meleeTimer = 0;
  private walkPhase = 0;
  private torso: THREE.Group;
  private head: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private weaponMeshes = new Map<string, THREE.Group>();
  private muzzleZ = new Map<string, number>();
  private currentWeapon = 'melee';

  constructor(scene: THREE.Scene) {
    const jacket = new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 0.7 });
    const jeans = new THREE.MeshStandardMaterial({ color: 0x2c3542, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077, roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.6 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.6 });

    const mkBox = (w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.castShadow = true;
      return m;
    };
    // Torso group at hip height; limbs pivot from their top.
    this.torso = new THREE.Group();
    this.torso.position.y = 1.05;
    const chest = mkBox(0.52, 0.62, 0.3, jacket);
    chest.position.y = 0.31;
    this.torso.add(chest);
    const collar = mkBox(0.4, 0.08, 0.32, new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.7 }));
    collar.position.y = 0.64;
    this.torso.add(collar);

    this.head = new THREE.Group();
    this.head.position.y = 0.72;
    const skull = mkBox(0.26, 0.28, 0.26, skin);
    skull.position.y = 0.14;
    this.head.add(skull);
    const hairTop = mkBox(0.28, 0.1, 0.28, hair);
    hairTop.position.y = 0.3;
    this.head.add(hairTop);
    const hairBack = mkBox(0.28, 0.24, 0.08, hair);
    hairBack.position.set(0, 0.16, -0.12);
    this.head.add(hairBack);
    this.torso.add(this.head);

    const mkArm = (side: number): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(0.31 * side, 0.58, 0);
      const upper = mkBox(0.13, 0.42, 0.15, jacket);
      upper.position.y = -0.21;
      arm.add(upper);
      const hand = mkBox(0.11, 0.14, 0.12, skin);
      hand.position.y = -0.5;
      arm.add(hand);
      this.torso.add(arm);
      return arm;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const mkLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(0.14 * side, 1.05, 0);
      const thigh = mkBox(0.18, 0.5, 0.2, jeans);
      thigh.position.y = -0.25;
      leg.add(thigh);
      const shin = mkBox(0.16, 0.5, 0.18, jeans);
      shin.position.y = -0.75;
      leg.add(shin);
      const foot = mkBox(0.17, 0.09, 0.32, boot);
      foot.position.set(0, -1.0, 0.06);
      leg.add(foot);
      this.group.add(leg);
      return leg;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    this.group.add(this.torso);

    this.buildWeaponMeshes();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  private buildWeaponMeshes(): void {
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4, metalness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.7 });
    const mk = (parts: [number, number, number, number, number, number, THREE.Material][]): THREE.Group => {
      const g = new THREE.Group();
      for (const [w, h, d, x, y, z, m] of parts) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        g.add(mesh);
      }
      g.visible = false;
      this.armR.add(g);
      return g;
    };
    // Pistol: small slide + grip, held at the right hand.
    this.weaponMeshes.set('kestrel', mk([
      [0.05, 0.06, 0.24, 0, -0.52, 0.1, gunmetal],
      [0.05, 0.12, 0.06, 0, -0.58, 0.02, wood],
    ]));
    this.muzzleZ.set('kestrel', 0.24);
    // SMG: body + magazine + short barrel.
    this.weaponMeshes.set('viper', mk([
      [0.07, 0.09, 0.42, 0, -0.52, 0.12, gunmetal],
      [0.05, 0.16, 0.06, 0, -0.62, 0.14, gunmetal],
      [0.05, 0.05, 0.12, 0, -0.52, 0.36, gunmetal],
    ]));
    this.muzzleZ.set('viper', 0.44);
    // Carbine: long body + stock + magazine.
    this.weaponMeshes.set('bulldog', mk([
      [0.07, 0.1, 0.62, 0, -0.52, 0.16, gunmetal],
      [0.06, 0.14, 0.07, 0, -0.6, 0.05, gunmetal],
      [0.06, 0.08, 0.2, 0, -0.52, -0.14, wood],
      [0.04, 0.04, 0.2, 0, -0.52, 0.5, gunmetal],
    ]));
    this.muzzleZ.set('bulldog', 0.62);
  }

  setWeapon(id: string): void {
    this.currentWeapon = id;
    for (const [key, mesh] of this.weaponMeshes) mesh.visible = key === id;
  }

  muzzleWorldPos(out: THREE.Vector3): THREE.Vector3 {
    const mesh = this.weaponMeshes.get(this.currentWeapon);
    if (!mesh) {
      out.copy(this.pos).add(new THREE.Vector3(0, 1.3, 0));
      return out;
    }
    // The tip sits at the front of this weapon's barrel, not at a fixed
    // length: a shared length lifts the pistol's muzzle above the target
    // when the aim pose rotates the arm.
    const tip = new THREE.Vector3(0, -0.52, this.muzzleZ.get(this.currentWeapon) ?? 0.24);
    mesh.localToWorld(tip);
    out.copy(tip);
    return out;
  }

  update(dt: number, input: Input, camYaw: number, city: City, blocked: boolean, aiming: boolean): void {
    if (this.state !== 'foot') {
      this.group.visible = this.state !== 'vehicle';
      return;
    }
    this.group.visible = true;
    const fwd = input.down('w', 'arrowup') ? 1 : input.down('s', 'arrowdown') ? -1 : 0;
    const strafe = input.down('d', 'arrowright') ? 1 : input.down('a', 'arrowleft') ? -1 : 0;
    this.aiming = aiming && this.currentWeapon !== 'melee';
    const sprint = input.down('shift') && fwd > 0 && !this.aiming;
    const targetSpeed = this.aiming ? PLAYER.aimSpeed : sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const moving = fwd !== 0 || strafe !== 0;
    const speedTarget = moving ? targetSpeed : 0;
    this.speed = lerp(this.speed, speedTarget, 1 - Math.exp(-10 * dt));
    if (moving && !blocked) {
      const moveAngle = camYaw + Math.atan2(strafe, fwd);
      const nx = this.pos.x + Math.sin(moveAngle) * this.speed * dt;
      const nz = this.pos.z + Math.cos(moveAngle) * this.speed * dt;
      if (!city.isWater(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
      }
      this.heading = this.aiming ? camYaw : angleLerp(this.heading, moveAngle, 1 - Math.exp(-12 * dt));
    }
    city.resolveCircle(this.pos, PLAYER.radius);
    this.pos.x = clamp(this.pos.x, WORLD_MIN_X, WORLD_MAX_X);
    this.pos.z = clamp(this.pos.z, WORLD_MIN_Z, WORLD_MAX_Z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    if (this.meleeTimer > 0) this.meleeTimer -= dt;

    // Procedural animation.
    const stride = clamp(this.speed / PLAYER.walkSpeed, 0, 1.8);
    this.walkPhase += dt * (6 + stride * 6) * (this.speed > 0.1 ? 1 : 0);
    const swing = Math.sin(this.walkPhase) * 0.55 * Math.min(stride, 1);
    const idleSway = Math.sin(this.walkPhase * 0.5) * 0.03;
    if (this.aiming) {
      this.armR.rotation.x = -Math.PI / 2 + 0.15;
      this.armL.rotation.x = -Math.PI / 2 + 0.35;
      this.armL.rotation.z = 0.5;
      this.legL.rotation.x = swing * 0.4;
      this.legR.rotation.x = -swing * 0.4;
      this.torso.rotation.x = 0.08;
    } else if (this.meleeTimer > 0) {
      const t = 1 - this.meleeTimer / 0.35;
      this.armR.rotation.x = -Math.PI * (0.4 + 0.5 * Math.sin(t * Math.PI));
      this.armL.rotation.x = swing;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.torso.rotation.x = 0.12 * Math.sin(t * Math.PI);
    } else {
      this.armR.rotation.x = swing;
      this.armL.rotation.x = -swing;
      this.armR.rotation.z = 0;
      this.armL.rotation.z = 0;
      this.legL.rotation.x = -swing;
      this.legR.rotation.x = swing;
      this.torso.rotation.x = stride > 0.3 ? 0.1 : idleSway;
    }
    this.torso.rotation.y = this.aiming ? 0 : 0;
    this.head.rotation.x = this.aiming ? -0.05 : 0;
  }

  melee(): void {
    if (this.meleeTimer <= 0) this.meleeTimer = 0.35;
  }

  teleport(x: number, z: number): void {
    this.pos.set(x, 0, z);
    this.group.position.copy(this.pos);
  }

  takeDamage(amount: number): void {
    let left = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, left);
      this.armor -= absorbed;
      left -= absorbed;
    }
    this.health = Math.max(0, this.health - left);
    if (this.health <= 0) this.state = 'dead';
  }

  healFull(): void {
    this.health = PLAYER.maxHealth;
  }
}

const WORLD_MIN_X = -890;
const WORLD_MAX_X = 890;
const WORLD_MIN_Z = -970;
const WORLD_MAX_Z = 890;
