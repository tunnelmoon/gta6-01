import { WANTED, clamp } from './config.js';
import { Rng } from './rng.js';
import { makeVehicle } from './vehicles.js';
export class Police {
    constructor(scene, city, seed) {
        this.heat = 0;
        this.units = [];
        this.roadblocks = [];
        this.onBusted = null;
        this.onShoot = null;
        this.bustTimer = 0;
        this.shootTimer = 0;
        this.spawnTimer = 0;
        this.scene = scene;
        this.city = city;
        this.rng = new Rng(seed);
    }
    getStars() {
        if (this.heat <= 0)
            return 0;
        return clamp(Math.ceil(this.heat / 20), 1, 5);
    }
    addHeat(amount) {
        this.heat = clamp(this.heat + amount, 0, WANTED.maxHeat);
    }
    clearWanted() {
        this.heat = 0;
        for (const u of this.units)
            u.dispose(this.scene);
        this.units = [];
        for (const r of this.roadblocks)
            r.dispose(this.scene);
        this.roadblocks = [];
    }
    isSeen(playerPos) {
        for (const u of this.units) {
            if (this.inCone(u, playerPos))
                return true;
        }
        return false;
    }
    inCone(unit, p) {
        const dx = p.x - unit.pos.x;
        const dz = p.z - unit.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 70 || d < 1)
            return false;
        const ang = Math.atan2(dx, dz);
        let diff = ang - unit.heading;
        while (diff > Math.PI)
            diff -= Math.PI * 2;
        while (diff < -Math.PI)
            diff += Math.PI * 2;
        if (Math.abs(diff) > 0.55)
            return false;
        return this.hasLineOfSight(unit.pos, p);
    }
    hasLineOfSight(a, b) {
        const steps = 8;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = a.x + (b.x - a.x) * t;
            const z = a.z + (b.z - a.z) * t;
            if (this.city.collidesCircle(x, z, 0.3))
                return false;
        }
        return true;
    }
    visionCones() {
        return this.units.map((u) => ({ x: u.pos.x, z: u.pos.z, heading: u.heading, range: 70 }));
    }
    desiredUnits() {
        const s = this.getStars();
        if (s === 0)
            return [];
        if (s === 1)
            return ['metroCruiser'];
        if (s === 2)
            return ['metroCruiser', 'metroCruiser'];
        if (s === 3)
            return ['metroCruiser', 'metroCruiser', 'interceptor'];
        if (s === 4)
            return ['metroCruiser', 'interceptor', 'interceptor', 'enforcer'];
        return ['interceptor', 'interceptor', 'enforcer', 'enforcer', 'metroCruiser'];
    }
    update(dt, playerPos, playerInVehicle, playerVehicle) {
        const stars = this.getStars();
        // Heat decays only when no unit can see the player.
        if (stars > 0 && !this.isSeen(playerPos)) {
            this.heat = Math.max(0, this.heat - WANTED.decayPerSecond * dt);
        }
        // Spawn / despawn pursuit units.
        this.spawnTimer -= dt;
        const want = this.desiredUnits();
        if (this.spawnTimer <= 0) {
            this.spawnTimer = 1.5;
            while (this.units.length < want.length) {
                const defId = want[this.units.length];
                const node = this.randomSpawnNode(playerPos);
                const unit = makeVehicle(defId, this.scene, this.rng);
                unit.ai = true;
                unit.place(node.x, node.z, Math.atan2(playerPos.x - node.x, playerPos.z - node.z));
                this.units.push(unit);
            }
            while (this.units.length > want.length) {
                const u = this.units.pop();
                u.dispose(this.scene);
            }
        }
        // Roadblocks at 3+ stars: two parked cruisers ahead of the player.
        if (stars >= 3 && this.roadblocks.length === 0) {
            const node = this.city.nearestNode(playerPos.x, playerPos.z);
            for (const off of [-14, 14]) {
                const rb = makeVehicle('metroCruiser', this.scene, this.rng);
                rb.ai = true;
                rb.place(node.x + off, node.z + 40, Math.PI);
                this.roadblocks.push(rb);
            }
        }
        if (stars < 3) {
            for (const r of this.roadblocks)
                r.dispose(this.scene);
            this.roadblocks = [];
        }
        // Pursuit driving: steer straight at the player, ram when close.
        for (const unit of this.units) {
            if (unit.exploded)
                continue;
            const tx = playerPos.x - unit.pos.x;
            const tz = playerPos.z - unit.pos.z;
            const dist = Math.hypot(tx, tz);
            const wantAngle = Math.atan2(tx, tz);
            let diff = wantAngle - unit.heading;
            while (diff > Math.PI)
                diff -= Math.PI * 2;
            while (diff < -Math.PI)
                diff += Math.PI * 2;
            let throttle = 1;
            if (dist < 7)
                throttle = playerInVehicle ? 0.6 : -0.5;
            if (unit.speed > unit.def.topSpeed * 0.92)
                throttle = 0.2;
            unit.update(dt, { throttle, steer: clamp(diff * 2.2, -1, 1), drift: Math.abs(diff) > 1.2, horn: false }, this.city);
            // Ram damage to the player's car.
            if (playerInVehicle && playerVehicle && dist < (unit.radius + playerVehicle.radius) * 0.9) {
                playerVehicle.damage(6 * dt);
                unit.damage(3 * dt);
            }
            // Bust: a cop standing next to an on-foot player.
            if (!playerInVehicle && dist < 4) {
                this.bustTimer += dt;
                if (this.bustTimer > 2.5 && this.onBusted) {
                    this.bustTimer = 0;
                    this.onBusted();
                }
            }
        }
        if (stars >= 2) {
            this.bustTimer = Math.max(0, this.bustTimer - dt);
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
                this.shootTimer = 0.9;
                for (const unit of this.units) {
                    const d = Math.hypot(playerPos.x - unit.pos.x, playerPos.z - unit.pos.z);
                    if (d < 45 && this.hasLineOfSight(unit.pos, playerPos) && this.onShoot) {
                        const from = unit.pos.clone();
                        from.y = 1.4;
                        const to = playerPos.clone();
                        to.y = 1.3;
                        this.onShoot(from, to);
                        break;
                    }
                }
            }
        }
        // Remove exploded units.
        for (let i = this.units.length - 1; i >= 0; i--) {
            if (this.units[i].exploded) {
                this.units[i].dispose(this.scene);
                this.units.splice(i, 1);
            }
        }
    }
    randomSpawnNode(playerPos) {
        const nodes = Array.from(this.city.nodes.values());
        for (let i = 0; i < 20; i++) {
            const n = nodes[Math.floor(this.rng.next() * nodes.length)];
            const d = Math.hypot(n.x - playerPos.x, n.z - playerPos.z);
            if (d > 70 && d < 220)
                return n;
        }
        return nodes[0];
    }
    clear() {
        this.clearWanted();
    }
}
