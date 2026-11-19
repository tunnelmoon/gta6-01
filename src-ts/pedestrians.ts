// Pedestrians: sidewalk walkers who flee gunfire and reckless driving and
// drop cash when knocked down. Cash pickups bob and spin until collected.
import * as THREE from 'three';
import { ECONOMY, clamp } from './config.js';
import { City } from './city.js';
import { Rng } from './rng.js';

export interface CashPickup {
  pos: THREE.Vector3;
  amount: number;
  mesh: THREE.Mesh;
  age: number;
}

interface Ped {
  group: THREE.Group;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  walkPhase: number;
  fleeT: number;
  down: boolean;
  downT: number;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
}

const SHIRTS = [0xe8e4d8, 0xd96a4a, 0x4a7fd9, 0x5fae6a, 0xd9b84a, 0x8a5fc9, 0xe8a0b0, 0x4aa8a0];

export class Pedestrians {
  peds: Ped[] = [];
  pickups: CashPickup[] = [];
  private scene: THREE.Scene;
  private city: City;
  private rng: Rng;
  private targetCount = 48;
  onCash: ((amount: number) => void) | null = null;

  constructor(scene: THREE.Scene, city: City, seed: number) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(seed);
  }

  setCount(n: number): void {
    this.targetCount = n;
  }

  private buildPed(): Ped {
    const g = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[Math.floor(this.rng.next() * SHIRTS.length)], roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2c3542, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), shirt);
    torso.position.y = 1.15;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    g.add(head);
    const mkLimb = (x: number, y: number, w: number, h: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), mat);
      m.position.set(x, y, 0);
      m.geometry.translate(0, -h / 2 + 0.05, 0);
      g.add(m);
      return m;
    };
    const legL = mkLimb(-0.12, 0.85, 0.16, 0.8, pants);
    const legR = mkLimb(0.12, 0.85, 0.16, 0.8, pants);
    const armL = mkLimb(-0.3, 1.4, 0.12, 0.55, shirt);
    const armR = mkLimb(0.3, 1.4, 0.12, 0.55, shirt);
    const ped: Ped = {
      group: g, pos: new THREE.Vector3(), heading: 0, speed: 1.4,
      walkPhase: this.rng.range(0, 6), fleeT: 0, down: false, downT: 0,
      legL, legR, armL, armR,
    };
    return ped;
  }

  private spawnPed(x: number, z: number): void {
    const ped = this.buildPed();
    ped.pos.set(x, 0, z);
    ped.heading = this.rng.range(0, Math.PI * 2);
    ped.speed = this.rng.range(1.1, 1.9);
    ped.group.position.copy(ped.pos);
    this.scene.add(ped.group);
    this.peds.push(ped);
  }

  // Sidewalk point: 9m off a road centerline, on land.
  private sidewalkPointNear(x: number, z: number, maxR: number): { x: number; z: number } | null {
    for (let i = 0; i < 12; i++) {
      const node = this.city.nearestNode(x + this.rng.range(-maxR, maxR), z + this.rng.range(-maxR, maxR));
      const ox = this.rng.range(-1, 1) > 0 ? 9.5 : -9.5;
      const px = node.x + ox;
      const pz = node.z + this.rng.range(-40, 40);
      if (!this.city.isWater(px, pz) && !this.city.collidesCircle(px, pz, 0.6)) return { x: px, z: pz };
    }
    return null;
  }

  panicNear(x: number, z: number, radius: number): void {
    for (const ped of this.peds) {
      const dx = ped.pos.x - x;
      const dz = ped.pos.z - z;
      if (dx * dx + dz * dz < radius * radius && !ped.down) {
        ped.fleeT = 3 + this.rng.next() * 2;
        ped.heading = Math.atan2(dx, dz);
      }
    }
  }

  knockDownAt(x: number, z: number, radius: number): number {
    let count = 0;
    for (const ped of this.peds) {
      if (ped.down) continue;
      const dx = ped.pos.x - x;
      const dz = ped.pos.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        ped.down = true;
        ped.downT = 0;
        ped.group.rotation.x = -Math.PI / 2;
        ped.group.position.y = 0.25;
        this.dropCash(ped.pos.x, ped.pos.z);
        count++;
      }
    }
    return count;
  }

  private dropCash(x: number, z: number): void {
    const amount = this.rng.int(ECONOMY.pedCashMin, ECONOMY.pedCashMax);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x3fae5a, emissive: 0x1a6a30, emissiveIntensity: 0.5 }),
    );
    mesh.position.set(x, 0.5, z);
    this.scene.add(mesh);
    this.pickups.push({ pos: new THREE.Vector3(x, 0.5, z), amount, mesh, age: 0 });
  }

  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number): void {
    if (this.peds.length < this.targetCount) {
      for (let tries = 0; tries < 6 && this.peds.length < this.targetCount; tries++) {
        const p = this.sidewalkPointNear(playerPos.x, playerPos.z, 260);
        if (p) this.spawnPed(p.x, p.z);
      }
    }
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const ped = this.peds[i];
      const dx = ped.pos.x - playerPos.x;
      const dz = ped.pos.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 420 * 420) {
        this.scene.remove(ped.group);
        this.peds.splice(i, 1);
        continue;
      }
      if (ped.down) {
        ped.downT += dt;
        if (ped.downT > 14) {
          this.scene.remove(ped.group);
          this.peds.splice(i, 1);
        }
        continue;
      }
      // Flee a fast car bearing down on them.
      if (playerSpeed > 8 && d2 < 14 * 14) {
        ped.fleeT = Math.max(ped.fleeT, 2);
        ped.heading = Math.atan2(dx, dz);
      }
      if (ped.fleeT > 0) {
        ped.fleeT -= dt;
        ped.speed = 6.5;
      } else {
        ped.speed = lerp(ped.speed, 1.4, dt);
      }
      const nx = ped.pos.x + Math.sin(ped.heading) * ped.speed * dt;
      const nz = ped.pos.z + Math.cos(ped.heading) * ped.speed * dt;
      if (this.city.isWater(nx, nz) || this.city.collidesCircle(nx, nz, 0.5)) {
        ped.heading += Math.PI * (0.5 + this.rng.next() * 0.5);
      } else {
        ped.pos.x = nx;
        ped.pos.z = nz;
      }
      // Wander: small chance to change direction at intersections.
      if (this.rng.next() < dt * 0.08) ped.heading += this.rng.range(-1.2, 1.2);
      ped.walkPhase += dt * ped.speed * 4.4;
      const swing = Math.sin(ped.walkPhase) * 0.5 * clamp(ped.speed / 6.5, 0.3, 1);
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      ped.armL.rotation.x = -swing * 0.7;
      ped.armR.rotation.x = swing * 0.7;
      ped.group.position.copy(ped.pos);
      ped.group.rotation.y = ped.heading;
    }
    // Cash pickups: bob, spin, collect.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.age += dt;
      pk.mesh.rotation.y += dt * 3;
      pk.mesh.position.y = 0.5 + Math.sin(pk.age * 4) * 0.08;
      const dx = pk.pos.x - playerPos.x;
      const dz = pk.pos.z - playerPos.z;
      if (dx * dx + dz * dz < 1.8 * 1.8) {
        if (this.onCash) this.onCash(pk.amount);
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      } else if (pk.age > 45) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const ped of this.peds) this.scene.remove(ped.group);
    this.peds = [];
    for (const pk of this.pickups) this.scene.remove(pk.mesh);
    this.pickups = [];
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
