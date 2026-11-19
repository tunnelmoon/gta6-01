// Traffic: 25-35 lane-following AI cars on the road graph. They pick random
// destinations, brake for obstacles ahead, and panic near gunfire. Right
// hand traffic, lane offset 3.5m.
import * as THREE from 'three';
import { clamp } from './config.js';
import { City } from './city.js';
import { Rng } from './rng.js';
import { Vehicle, makeVehicle } from './vehicles.js';

export interface Obstacle {
  pos: THREE.Vector3;
  radius: number;
}

export class Traffic {
  cars: Vehicle[] = [];
  private routes = new Map<Vehicle, { x: number; z: number }[]>();
  private speeds = new Map<Vehicle, number>();
  private panics = new Map<Vehicle, number>();
  private scene: THREE.Scene;
  private city: City;
  private rng: Rng;
  private targetCount = 30;

  constructor(scene: THREE.Scene, city: City, seed: number) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(seed);
  }

  setCount(n: number): void {
    this.targetCount = n;
  }

  private randomDef(): string {
    const r = this.rng.next();
    if (r < 0.55) return 'urbanSedan';
    if (r < 0.8) return 'v8Dorado';
    if (r < 0.92) return 'solmarGT';
    return 'cargoMule';
  }

  spawnCar(x: number, z: number, heading: number): Vehicle {
    const car = makeVehicle(this.randomDef(), this.scene, this.rng);
    car.ai = true;
    car.place(x, z, heading);
    const node = this.city.nearestNode(x, z);
    this.routes.set(car, this.newRoute(node.x, node.z));
    this.speeds.set(car, this.rng.range(9, 15));
    this.panics.set(car, 0);
    this.cars.push(car);
    return car;
  }

  private newRoute(x: number, z: number): { x: number; z: number }[] {
    const nodes = Array.from(this.city.nodes.values());
    const dest = nodes[Math.floor(this.rng.next() * nodes.length)];
    const path = this.city.route(x, z, dest.x, dest.z);
    return path.length > 1 ? path : [{ x: dest.x, z: dest.z }];
  }

  panicNear(x: number, z: number, radius: number): void {
    for (const car of this.cars) {
      const dx = car.pos.x - x;
      const dz = car.pos.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        this.panics.set(car, 4 + this.rng.next() * 3);
        this.speeds.set(car, this.rng.range(16, 22));
      }
    }
  }

  update(dt: number, playerPos: THREE.Vector3, obstacles: Obstacle[]): void {
    // Keep the count topped up near the player.
    if (this.cars.length < this.targetCount) {
      const nodes = Array.from(this.city.nodes.values());
      for (let tries = 0; tries < 8 && this.cars.length < this.targetCount; tries++) {
        const n = nodes[Math.floor(this.rng.next() * nodes.length)];
        const dx = n.x - playerPos.x;
        const dz = n.z - playerPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 60 * 60 && d2 < 320 * 320) {
          this.spawnCar(n.x, n.z, this.rng.range(0, Math.PI * 2));
        }
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const dx = car.pos.x - playerPos.x;
      const dz = car.pos.z - playerPos.z;
      if (dx * dx + dz * dz > 420 * 420) {
        this.removeCar(i);
        continue;
      }
      if (car.exploded) {
        this.removeCar(i);
        continue;
      }
      const route = this.routes.get(car)!;
      let wp = route[0];
      if (!wp) {
        this.routes.set(car, this.newRoute(car.pos.x, car.pos.z));
        wp = this.routes.get(car)![0];
      }
      // Lane offset: right side of the travel direction.
      const toX = wp.x - car.pos.x;
      const toZ = wp.z - car.pos.z;
      const dist = Math.hypot(toX, toZ);
      if (dist < 6) {
        route.shift();
        if (route.length === 0) this.routes.set(car, this.newRoute(car.pos.x, car.pos.z));
        continue;
      }
      const dirAngle = Math.atan2(toX, toZ);
      const rightX = Math.cos(dirAngle);
      const rightZ = -Math.sin(dirAngle);
      const tx = wp.x + rightX * 3.5;
      const tz = wp.z + rightZ * 3.5;
      const wantAngle = Math.atan2(tx - car.pos.x, tz - car.pos.z);
      let diff = wantAngle - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const panic = (this.panics.get(car) ?? 0) > 0;
      if (panic) this.panics.set(car, (this.panics.get(car) ?? 0) - dt);
      // Brake for obstacles ahead.
      let throttle = 1;
      const fwd = car.forward;
      for (const o of obstacles) {
        const ox = o.pos.x - car.pos.x;
        const oz = o.pos.z - car.pos.z;
        const along = ox * fwd.x + oz * fwd.z;
        const side = Math.abs(ox * fwd.z - oz * fwd.x);
        if (along > 0 && along < (panic ? 8 : 16) && side < 3.2 + o.radius) {
          throttle = -1;
          break;
        }
      }
      const targetSpeed = panic ? (this.speeds.get(car) ?? 18) : (this.speeds.get(car) ?? 12);
      if (Math.abs(diff) > 0.7) throttle = Math.min(throttle, 0.3);
      if (car.speed > targetSpeed) throttle = -0.4;
      car.update(dt, { throttle, steer: clamp(diff * 1.6, -1, 1), drift: false, horn: false }, this.city);
    }
  }

  private removeCar(i: number): void {
    const car = this.cars[i];
    this.routes.delete(car);
    this.speeds.delete(car);
    this.panics.delete(car);
    car.dispose(this.scene);
    this.cars.splice(i, 1);
  }

  removeCarByVehicle(v: Vehicle): void {
    const i = this.cars.indexOf(v);
    if (i >= 0) this.removeCar(i);
  }

  clear(): void {
    for (let i = this.cars.length - 1; i >= 0; i--) this.removeCar(i);
  }
}
