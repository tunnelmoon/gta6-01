// Vehicle archetypes, meshes, arcade physics, damage and explosions.
import * as THREE from 'three';
import { City } from './city.js';
import { VEHICLES, VehicleSpec, clamp, isWater } from './config.js';

export interface DriveInput {
  throttle: number; // -1..1
  steer: number; // -1..1
  drift: boolean;
  brake: boolean;
}

export function buildVehicleMesh(spec: VehicleSpec, bodyColor?: number): { group: THREE.Group; wheels: THREE.Mesh[]; lightbar: THREE.Mesh[]; body: THREE.Mesh } {
  const group = new THREE.Group();
  const bodyCol = bodyColor ?? spec.body;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.35, metalness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.5, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.7 });
  const L = spec.length;
  const W = spec.width;
  const H = spec.height;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.42, L), bodyMat);
  body.position.y = H * 0.42;
  body.castShadow = true;
  group.add(body);
  const cabinH = H * 0.42;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, cabinH, L * 0.5), glassMat);
  cabin.position.set(0, H * 0.42 + cabinH / 2 + H * 0.18, -L * 0.06);
  cabin.castShadow = true;
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, H * 0.14, L * 0.2), trimMat);
  hood.position.set(0, H * 0.42 + H * 0.1, L * 0.38);
  group.add(hood);
  // headlights + taillights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffedb0, emissiveIntensity: 0.9 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lightMat);
    hl.position.set(sx * (W / 2 - 0.35), H * 0.42, L / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.7 }));
    tl.position.set(sx * (W / 2 - 0.35), H * 0.46, -L / 2 - 0.02);
    group.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels: THREE.Mesh[] = [];
  for (const [wx, wz] of [[-W / 2 + 0.12, L / 2 - 0.85], [W / 2 - 0.12, L / 2 - 0.85], [-W / 2 + 0.12, -L / 2 + 0.85], [W / 2 - 0.12, -L / 2 + 0.85]] as const) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.36, wz);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  // police lightbar
  const lightbar: THREE.Mesh[] = [];
  if (spec.kind === 'police' || spec.kind === 'interceptor' || spec.kind === 'swat') {
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0xff2222, emissiveIntensity: 1.5 }));
    red.position.set(-0.3, H * 0.42 + cabinH + H * 0.18 + 0.1, -L * 0.06);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x1111cc, emissive: 0x2244ff, emissiveIntensity: 1.5 }));
    blue.position.set(0.3, H * 0.42 + cabinH + H * 0.18 + 0.1, -L * 0.06);
    group.add(blue);
    lightbar.push(red, blue);
  }
  // van box / swat armor
  if (spec.kind === 'van' || spec.kind === 'swat') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, H * 0.55, L * 0.62), bodyMat);
    box.position.set(0, H * 0.42 + H * 0.28, -L * 0.14);
    box.castShadow = true;
    group.add(box);
  }
  return { group, wheels, lightbar, body };
}

export class Vehicle {
  // Deterministic clock (ms) set by the game loop each frame. The lightbar
  // flash reads this instead of performance.now() so renders are identical.
  static clockMs = 0;
  spec: VehicleSpec;
  group: THREE.Group;
  wheels: THREE.Mesh[];
  lightbar: THREE.Mesh[];
  x = 0;
  z = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  hp: number;
  dead = false;
  driftTime = 0;
  smokeTimer = 0;
  private steerVis = 0;
  private rollVis = 0;
  private pitchVis = 0;
  onExplode: ((v: Vehicle) => void) | null = null;

  constructor(specKey: string, bodyColor?: number) {
    this.spec = VEHICLES[specKey];
    const built = buildVehicleMesh(this.spec, bodyColor);
    this.group = built.group;
    this.wheels = built.wheels;
    this.lightbar = built.lightbar;
    this.hp = this.spec.hp;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }
  get forwardSpeed(): number {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }
  get mph(): number {
    return Math.abs(this.speed) * 2.237;
  }
  get radius(): number {
    return this.spec.length * 0.48;
  }

  place(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.syncMesh(0);
  }

  damage(amount: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (this.onExplode) this.onExplode(this);
      return true;
    }
    return false;
  }

  repair(): void {
    this.hp = this.spec.hp;
    this.dead = false;
  }

  update(dt: number, input: DriveInput, city: City, others: Vehicle[]): void {
    if (this.dead) return;
    const spec = this.spec;
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const fSpeed = this.forwardSpeed;
    // engine + brake
    let accel = 0;
    if (input.throttle > 0) accel = spec.accel * input.throttle;
    else if (input.throttle < 0) accel = spec.accel * 0.7 * input.throttle;
    if (input.brake) {
      accel = fSpeed > 0.5 ? -spec.accel * 1.4 : spec.accel * 0.7 * -1;
    }
    const newFSpeed = clamp(fSpeed + accel * dt, -12, spec.topSpeed);
    // steering: stronger at low speed, reversed when reversing
    const steerTarget = input.steer * spec.turn * clamp(Math.abs(fSpeed) / 8, 0, 1) * (fSpeed >= 0 ? 1 : -1);
    this.heading += steerTarget * dt;
    this.steerVis = clamp(this.steerVis + (input.steer * 0.42 - this.steerVis) * Math.min(1, dt * 10), -0.42, 0.42);
    // velocity: keep most of the forward speed, decay lateral slide by grip
    const nFwdX = Math.sin(this.heading);
    const nFwdZ = Math.cos(this.heading);
    const latX = this.vx - fwdX * fSpeed;
    const latZ = this.vz - fwdZ * fSpeed;
    const grip = input.drift && Math.abs(fSpeed) > 10 ? 1.1 : 5.5;
    const latDecay = Math.exp(-grip * dt);
    this.vx = nFwdX * newFSpeed + latX * latDecay;
    this.vz = nFwdZ * newFSpeed + latZ * latDecay;
    if (input.drift && Math.abs(fSpeed) > 12) this.driftTime += dt;
    else this.driftTime = 0;
    // drag
    const drag = Math.exp(-0.12 * dt);
    this.vx *= drag;
    this.vz *= drag;
    // integrate
    const px = this.x;
    const pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // water blocks the car
    if (isWater(this.x, this.z)) {
      this.x = px;
      this.z = pz;
      this.vx *= -0.3;
      this.vz *= -0.3;
    }
    // building collision: push out, kill inward velocity, damage on hard hits
    const before = this.speed;
    const hit = city.collideCircle(this.x, this.z, this.radius);
    if (hit.hit) {
      const nx = hit.x - this.x;
      const nz = hit.z - this.z;
      this.x = hit.x;
      this.z = hit.z;
      const into = this.vx * nx + this.vz * nz;
      if (into < 0) {
        this.vx -= nx * into * 1.4;
        this.vz -= nz * into * 1.4;
      }
      if (before > 14) this.damage((before - 14) * 1.2);
    }
    // car-car collisions
    for (const o of others) {
      if (o === this || o.dead) continue;
      const dx = this.x - o.x;
      const dz = this.z - o.z;
      const rr = this.radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        this.x += ux * push;
        this.z += uz * push;
        o.x -= ux * push;
        o.z -= uz * push;
        const rel = (this.vx - o.vx) * ux + (this.vz - o.vz) * uz;
        if (rel > 0) {
          this.vx -= ux * rel * 0.6;
          this.vz -= uz * rel * 0.6;
          o.vx += ux * rel * 0.6;
          o.vz += uz * rel * 0.6;
          if (rel > 10) {
            this.damage(rel * 0.5);
            o.damage(rel * 0.5);
          }
        }
      }
    }
    this.syncMesh(dt);
  }

  private syncMesh(dt: number): void {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    const fSpeed = this.forwardSpeed;
    // body roll into corners, pitch under accel
    const targetRoll = -this.steerVis * clamp(Math.abs(fSpeed) / 30, 0, 1) * 0.09;
    const targetPitch = clamp(-fSpeed * 0.0012, -0.03, 0.03);
    this.rollVis = lerp(this.rollVis, targetRoll, Math.min(1, dt * 8 + 0.001));
    this.pitchVis = lerp(this.pitchVis, targetPitch, Math.min(1, dt * 8 + 0.001));
    this.group.rotation.z = this.rollVis;
    this.group.rotation.x = this.pitchVis;
    // wheels spin + front steer
    const spin = (fSpeed / 0.36) * dt;
    this.wheels.forEach((w, i) => {
      w.rotation.x += spin;
      if (i < 2) w.rotation.y = this.steerVis;
    });
    // lightbar flash (deterministic: driven by the game's clock)
    if (this.lightbar.length === 2) {
      const phase = Math.floor(Vehicle.clockMs / 280) % 2;
      (this.lightbar[0].material as THREE.MeshStandardMaterial).emissiveIntensity = phase === 0 ? 2.2 : 0.15;
      (this.lightbar[1].material as THREE.MeshStandardMaterial).emissiveIntensity = phase === 1 ? 2.2 : 0.15;
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
