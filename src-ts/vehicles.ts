// Vehicles: 7 archetypes built from boxes and cylinders, with arcade
// physics (accel, brake, steering, drift, suspension pitch/roll), damage
// states (smoke, fire, explosion) and headlights. Traffic AI drives the
// same class through a driver interface.
import * as THREE from 'three';
import { VEHICLES, VehicleDef, clamp, lerp } from './config.js';
import { City } from './city.js';
import { Rng } from './rng.js';

export interface VehicleInput {
  throttle: number; // -1..1
  steer: number; // -1..1
  drift: boolean;
  horn: boolean;
}

export class Vehicle {
  def: VehicleDef;
  group = new THREE.Group();
  pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  steerAngle = 0;
  hp: number;
  exploded = false;
  isPlayerDriven = false;
  ai = false;
  body: THREE.Group;
  wheels: THREE.Mesh[] = [];
  lightbarL: THREE.Mesh | null = null;
  lightbarR: THREE.Mesh | null = null;
  private smokeTimer = 0;
  private fireTimer = 0;
  private flashT = 0;
  private paintMat: THREE.MeshStandardMaterial | null = null;
  onSmoke: ((pos: THREE.Vector3, fire: boolean) => void) | null = null;
  onExplode: ((v: Vehicle) => void) | null = null;

  constructor(def: VehicleDef, scene: THREE.Scene, rng: Rng) {
    this.def = def;
    this.hp = def.hp;
    this.body = this.buildMesh(def, rng);
    this.group.add(this.body);
    scene.add(this.group);
  }

  private buildMesh(def: VehicleDef, rng: Rng): THREE.Group {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.55 });
    this.paintMat = paint;
    const dark = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.5, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.7 });
    const L = def.length;
    const W = def.width;
    const isVan = def.id === 'cargoMule' || def.id === 'enforcer';
    const bodyH = isVan ? 1.9 : 0.62;
    const bodyY = isVan ? 1.15 : 0.55;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, L), paint);
    body.position.y = bodyY;
    body.castShadow = true;
    g.add(body);
    if (!isVan) {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.55, L * 0.42), glass);
      cabin.position.set(0, bodyY + bodyH / 2 + 0.24, -L * 0.06);
      cabin.castShadow = true;
      g.add(cabin);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.12, L * 0.2), paint);
      hood.position.set(0, bodyY + bodyH / 2 + 0.04, L * 0.36);
      g.add(hood);
      if (def.id === 'solmarGT') {
        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.06, 0.3), dark);
        spoiler.position.set(0, bodyY + bodyH / 2 + 0.28, -L * 0.46);
        g.add(spoiler);
      }
    } else {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.3, L * 0.9), dark);
      stripe.position.set(0, 1.1, 0);
      g.add(stripe);
    }
    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.9 });
    const positions: [number, number][] = [
      [-W / 2 + 0.1, L * 0.32], [W / 2 - 0.1, L * 0.32],
      [-W / 2 + 0.1, -L * 0.32], [W / 2 - 0.1, -L * 0.32],
    ];
    for (const [wx, wz] of positions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      wheel.castShadow = true;
      g.add(wheel);
      this.wheels.push(wheel);
    }
    // Headlights and taillights.
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 0.9 });
    for (const hx of [-W / 2 + 0.3, W / 2 - 0.3]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
      hl.position.set(hx, bodyY + 0.05, L / 2 + 0.02);
      g.add(hl);
    }
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.7 });
    for (const hx of [-W / 2 + 0.3, W / 2 - 0.3]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
      tl.position.set(hx, bodyY + 0.05, -L / 2 - 0.02);
      g.add(tl);
    }
    // Police lightbar.
    if (def.police) {
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.1, 0.3), dark);
      barBase.position.set(0, bodyY + bodyH / 2 + (isVan ? 0.1 : 0.62), -L * 0.05);
      g.add(barBase);
      const red = new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0xff2222, emissiveIntensity: 2 });
      const blue = new THREE.MeshStandardMaterial({ color: 0x1111cc, emissive: 0x2244ff, emissiveIntensity: 2 });
      this.lightbarL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.28), red);
      this.lightbarL.position.set(-W * 0.18, barBase.position.y + 0.1, -L * 0.05);
      this.lightbarR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.28), blue);
      this.lightbarR.position.set(W * 0.18, barBase.position.y + 0.1, -L * 0.05);
      g.add(this.lightbarL);
      g.add(this.lightbarR);
    }
    void rng;
    return g;
  }

  get radius(): number {
    return Math.max(this.def.length, this.def.width) * 0.42;
  }

  recolor(hex: number): void {
    if (this.paintMat) this.paintMat.color.setHex(hex);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  place(x: number, z: number, heading: number): void {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = heading;
  }

  damage(amount: number): void {
    if (this.exploded) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.exploded = true;
      if (this.onExplode) this.onExplode(this);
    }
  }

  update(dt: number, input: VehicleInput, city: City): void {
    if (this.exploded) return;
    const def = this.def;
    // Steering: less authority at high speed, more while drifting.
    const steerTarget = input.steer * def.grip * (input.drift ? 1.35 : 1);
    const speedFactor = clamp(1 - Math.abs(this.speed) / (def.topSpeed * 1.4), 0.25, 1);
    this.steerAngle = lerp(this.steerAngle, steerTarget * speedFactor, 1 - Math.exp(-8 * dt));
    const moving = Math.abs(this.speed) > 0.5;
    if (moving) {
      this.heading += this.steerAngle * (this.speed / def.topSpeed) * dt * (this.speed < 0 ? -1 : 1) * 1.9;
    }
    // Longitudinal physics.
    if (input.throttle > 0) {
      this.speed += def.accel * input.throttle * dt * (1 - this.speed / def.topSpeed);
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) {
        this.speed += def.brake * input.throttle * dt; // braking
      } else {
        this.speed += def.accel * 0.55 * input.throttle * dt; // reverse
        this.speed = Math.max(this.speed, -12);
      }
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    }
    // Drift: extra lateral slide, handled visually by yaw offset and skid.
    const fwd = this.forward;
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.x += fwd.x * this.speed * dt;
    this.pos.z += fwd.z * this.speed * dt;
    if (city.isWater(this.pos.x, this.pos.z)) {
      this.pos.x = prevX;
      this.pos.z = prevZ;
      this.speed *= 0.4;
    }
    city.resolveCircle(this.pos, this.radius);
    // Suspension pitch and roll (visual only).
    const accelPitch = clamp(-input.throttle * 0.03, -0.05, 0.05);
    const roll = clamp(-this.steerAngle * 0.03 * (Math.abs(this.speed) / def.topSpeed), -0.06, 0.06);
    this.body.rotation.x = lerp(this.body.rotation.x, accelPitch, 1 - Math.exp(-6 * dt));
    this.body.rotation.z = lerp(this.body.rotation.z, roll, 1 - Math.exp(-6 * dt));
    if (input.drift && moving) {
      this.body.rotation.y = lerp(this.body.rotation.y, -this.steerAngle * 0.12, 1 - Math.exp(-8 * dt));
    } else {
      this.body.rotation.y = lerp(this.body.rotation.y, 0, 1 - Math.exp(-8 * dt));
    }
    // Wheel spin.
    for (const w of this.wheels) w.rotation.x += (this.speed / 0.36) * dt;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    // Damage smoke and fire.
    const hpRatio = this.hp / def.hp;
    if (hpRatio < 0.5 && this.onSmoke) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = hpRatio < 0.2 ? 0.05 : 0.16;
        const p = this.pos.clone();
        p.y = 1.2;
        this.onSmoke(p, hpRatio < 0.2);
      }
    }
    if (this.def.police) {
      this.flashT += dt;
      const on = Math.floor(this.flashT * 4) % 2 === 0;
      if (this.lightbarL && this.lightbarR) {
        (this.lightbarL.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0.2;
        (this.lightbarR.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.2 : 3;
      }
    }
    void this.fireTimer;
  }

  get drifting(): boolean {
    return Math.abs(this.steerAngle) > 1.4 && Math.abs(this.speed) > 14;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
  }
}

export function makeVehicle(defId: string, scene: THREE.Scene, rng: Rng): Vehicle {
  const def = VEHICLES[defId];
  if (!def) throw new Error('unknown vehicle ' + defId);
  return new Vehicle(def, scene, rng);
}
