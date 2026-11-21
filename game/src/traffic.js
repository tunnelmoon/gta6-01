import { Rng } from './rng.js';
import { TRAFFIC_MODELS, clamp } from './config.js';
import { Vehicle } from './vehicles.js';
export class TrafficCar {
    vehicle;
    target;
    cruise;
    stuckTimer = 0;
    reverseTimer = 0;
    panicUntil = 0;
    constructor(vehicle, target, cruise) {
        this.vehicle = vehicle;
        this.target = target;
        this.cruise = cruise;
    }
}
export class Traffic {
    city;
    cars = [];
    rng;
    time = 0;
    constructor(city, seed = 7) {
        this.city = city;
        this.rng = new Rng(seed);
    }
    spawnNear(px, pz, count) {
        while (this.cars.length < count) {
            const node = this.randomNodeNear(px, pz, 60, 280);
            const spec = this.rng.pick(TRAFFIC_MODELS);
            const v = new Vehicle(spec);
            v.place(node.x + this.rng.range(-3, 3), node.z + this.rng.range(-3, 3), this.rng.range(0, Math.PI * 2));
            const next = this.pickNext(node, v.heading);
            const car = new TrafficCar(v, next, this.rng.range(9, 14));
            this.cars.push(car);
        }
    }
    randomNodeNear(px, pz, minD, maxD) {
        const nodes = this.city.graph;
        for (let tries = 0; tries < 40; tries++) {
            const n = nodes[this.rng.int(0, nodes.length - 1)];
            const d = Math.hypot(n.x - px, n.z - pz);
            if (d >= minD && d <= maxD)
                return n;
        }
        return this.city.nearestNode(px, pz);
    }
    pickNext(node, heading) {
        const options = node.links.map((i) => this.city.graph[i]);
        if (options.length === 0)
            return node;
        // prefer the link most aligned with current heading, with some variety
        let best = options[0];
        let bestScore = -Infinity;
        for (const o of options) {
            const ang = Math.atan2(o.x - node.x, o.z - node.z);
            let d = ang - heading;
            while (d > Math.PI)
                d -= Math.PI * 2;
            while (d < -Math.PI)
                d += Math.PI * 2;
            const score = -Math.abs(d) + this.rng.range(0, 0.9);
            if (score > bestScore) {
                bestScore = score;
                best = o;
            }
        }
        return best;
    }
    update(dt, px, pz, events, playerVehicle, peds) {
        this.time += dt;
        // keep the fleet near the player
        for (const car of this.cars) {
            const v = car.vehicle;
            const dPlayer = Math.hypot(v.x - px, v.z - pz);
            if (dPlayer > 380) {
                const node = this.randomNodeNear(px, pz, 60, 220);
                v.place(node.x, node.z, this.rng.range(0, Math.PI * 2));
                car.target = this.pickNext(node, v.heading);
                continue;
            }
            // panic near gunfire
            if (events.gunfireAt && this.time - events.gunfireAt.time < 3) {
                const gd = Math.hypot(v.x - events.gunfireAt.x, v.z - events.gunfireAt.z);
                if (gd < 45)
                    car.panicUntil = this.time + 3;
            }
            const panicking = this.time < car.panicUntil;
            // arrived at the target node: pick the next one
            const td = Math.hypot(car.target.x - v.x, car.target.z - v.z);
            if (td < 7) {
                const node = this.city.nearestNode(v.x, v.z);
                car.target = this.pickNext(node, v.heading);
            }
            // steer toward the target node
            const wantHeading = Math.atan2(car.target.x - v.x, car.target.z - v.z);
            let dh = wantHeading - v.heading;
            while (dh > Math.PI)
                dh -= Math.PI * 2;
            while (dh < -Math.PI)
                dh += Math.PI * 2;
            const steer = clamp(dh * 1.6, -1, 1);
            // brake for obstacles ahead: the player car, other traffic, peds
            let throttle = v.forwardSpeed < (panicking ? 20 : car.cruise) ? 1 : 0;
            const aheadX = v.x + Math.sin(v.heading) * 11;
            const aheadZ = v.z + Math.cos(v.heading) * 11;
            let blocked = false;
            if (playerVehicle && Math.hypot(playerVehicle.x - aheadX, playerVehicle.z - aheadZ) < 5)
                blocked = true;
            if (!blocked) {
                for (const o of this.cars) {
                    if (o === car)
                        continue;
                    if (Math.hypot(o.vehicle.x - aheadX, o.vehicle.z - aheadZ) < 5.5) {
                        blocked = true;
                        break;
                    }
                }
            }
            if (!blocked) {
                for (const p of peds) {
                    if (Math.hypot(p.x - aheadX, p.z - aheadZ) < 3.5) {
                        blocked = true;
                        break;
                    }
                }
            }
            if (blocked)
                throttle = -0.4;
            // stuck detection: reverse briefly
            if (Math.abs(v.forwardSpeed) < 0.6 && throttle > 0) {
                car.stuckTimer += dt;
                if (car.stuckTimer > 3) {
                    car.reverseTimer = 1.2;
                    car.stuckTimer = 0;
                }
            }
            else {
                car.stuckTimer = 0;
            }
            let input;
            if (car.reverseTimer > 0) {
                car.reverseTimer -= dt;
                input = { throttle: -0.7, steer: -steer, drift: false, brake: false };
            }
            else {
                input = { throttle, steer, drift: false, brake: blocked };
            }
            const others = this.cars.map((c) => c.vehicle);
            if (playerVehicle)
                others.push(playerVehicle);
            v.update(dt, input, this.city, others);
        }
    }
    addToScene(scene) {
        for (const c of this.cars)
            scene.add(c.vehicle.group);
    }
}
