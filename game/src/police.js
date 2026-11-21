import { Rng } from './rng.js';
import { PLACES, WANTED, clamp } from './config.js';
import { Vehicle } from './vehicles.js';
export class Wanted {
    heat = 0;
    stars = 0;
    unseenTimer = 0;
    get level() {
        return this.stars;
    }
    addHeat(amount) {
        this.heat = clamp(this.heat + amount, 0, 100);
        // gaining heat means the player was just active/seen: restart the
        // grace period before decay, so a fresh wanted level never drops
        // a star on the very next frame
        if (amount > 0)
            this.unseenTimer = 0;
        this.recompute();
    }
    clear() {
        this.heat = 0;
        this.stars = 0;
        this.unseenTimer = 0;
    }
    recompute() {
        let s = 0;
        for (let i = 5; i >= 1; i--) {
            if (this.heat >= WANTED.starsForHeat[i]) {
                s = i;
                break;
            }
        }
        this.stars = s;
    }
    // Heat decays only while no police unit can see the player.
    update(dt, seen) {
        if (seen) {
            this.unseenTimer = 0;
        }
        else {
            this.unseenTimer += dt;
            if (this.unseenTimer > WANTED.unseenSecondsToCool && this.heat > 0) {
                this.heat = Math.max(0, this.heat - WANTED.decayPerSecond * dt);
                this.recompute();
            }
        }
    }
}
export class PoliceUnit {
    vehicle;
    shootCooldown = 0;
    bustedTimer = 0;
    isRoadblock = false;
    constructor(vehicle) {
        this.vehicle = vehicle;
    }
}
export class Police {
    city;
    scene;
    units = [];
    wanted = new Wanted();
    rng;
    time = 0;
    roadblockTimer = 0;
    constructor(city, scene, seed = 23) {
        this.city = city;
        this.scene = scene;
        this.rng = new Rng(seed);
    }
    // Is any police unit seeing the point (2D cone + line of sight)?
    seesPoint(x, z) {
        for (const u of this.units) {
            const v = u.vehicle;
            const dx = x - v.x;
            const dz = z - v.z;
            const d = Math.hypot(dx, dz);
            if (d > WANTED.visionRange)
                continue;
            const ang = Math.atan2(dx, dz);
            let diff = ang - v.heading;
            while (diff > Math.PI)
                diff -= Math.PI * 2;
            while (diff < -Math.PI)
                diff += Math.PI * 2;
            if (Math.abs(diff) > WANTED.visionAngle)
                continue;
            if (!this.city.hasLineOfSight(v.x, v.z, x, z))
                continue;
            return true;
        }
        return false;
    }
    cones() {
        return this.units.map((u) => ({
            x: u.vehicle.x,
            z: u.vehicle.z,
            heading: u.vehicle.heading,
            range: WANTED.visionRange,
            angle: WANTED.visionAngle,
        }));
    }
    // Scripted spawns for missions: a police unit at an exact spot.
    spawnUnitAt(kind, x, z) {
        return this.spawnUnit(kind, x, z);
    }
    // A static blockade across a road (two cruisers side by side).
    spawnRoadblockAt(x, z, heading) {
        for (const off of [-5, 5]) {
            const u = this.spawnUnit('cruiser', x + Math.cos(heading) * off, z - Math.sin(heading) * off);
            u.isRoadblock = true;
            u.vehicle.heading = heading;
        }
    }
    spawnUnit(kind, x, z) {
        const v = new Vehicle(kind);
        v.place(x, z, this.rng.range(0, Math.PI * 2));
        const unit = new PoliceUnit(v);
        this.units.push(unit);
        this.scene.add(v.group);
        return unit;
    }
    removeUnit(unit) {
        this.scene.remove(unit.vehicle.group);
        this.units.splice(this.units.indexOf(unit), 1);
    }
    update(dt, px, pz, playerInVehicle, playerVehicle, cb) {
        this.time += dt;
        const stars = this.wanted.stars;
        const wantCount = WANTED.policePerStar[stars];
        // spawn up to the wanted count, near the player but not on top of them
        while (this.units.length < wantCount) {
            const node = this.city.graph[this.rng.int(0, this.city.graph.length - 1)];
            const d = Math.hypot(node.x - px, node.z - pz);
            if (d < 55 || d > 160)
                continue;
            const kind = stars >= 4 ? (this.rng.chance(0.5) ? 'enforcer' : 'interceptor') : stars >= 3 ? 'interceptor' : 'cruiser';
            this.spawnUnit(kind, node.x, node.z);
        }
        // despawn far units and dead ones
        for (let i = this.units.length - 1; i >= 0; i--) {
            const u = this.units[i];
            const d = Math.hypot(u.vehicle.x - px, u.vehicle.z - pz);
            if (u.vehicle.dead || d > 420)
                this.removeUnit(u);
        }
        // roadblocks at 3+ stars: two cruisers across a road ahead of the player
        this.roadblockTimer -= dt;
        if (stars >= 3 && this.roadblockTimer <= 0) {
            this.roadblockTimer = 18;
            const node = this.city.nearestNode(px + this.rng.range(-60, 60), pz + this.rng.range(-60, 60));
            for (const off of [-6, 6]) {
                const u = this.spawnUnit('cruiser', node.x + off, node.z);
                u.isRoadblock = true;
                u.vehicle.heading = Math.PI / 2;
            }
        }
        // pursuit AI
        for (const u of this.units) {
            const v = u.vehicle;
            if (u.isRoadblock)
                continue;
            const d = Math.hypot(px - v.x, pz - v.z);
            // busted: on foot and a cop stands next to the player
            if (!playerInVehicle && d < 3.2 && stars > 0) {
                u.bustedTimer += dt;
                if (u.bustedTimer > 1.5) {
                    cb.onBusted();
                    return;
                }
            }
            else {
                u.bustedTimer = 0;
            }
            // shooting: stars 2+, in range, line of sight
            u.shootCooldown -= dt;
            if (stars >= 2 && d < 42 && u.shootCooldown <= 0 && this.city.hasLineOfSight(v.x, v.z, px, pz)) {
                u.shootCooldown = 0.9 + this.rng.range(0, 0.7);
                const hitChance = clamp(0.5 - d / 120, 0.1, 0.45);
                if (this.rng.chance(hitChance))
                    cb.onShootPlayer(stars >= 4 ? 12 : 7, v.x, v.z);
            }
            // chase steering: aim at the player, ram when close
            const wantHeading = Math.atan2(px - v.x, pz - v.z);
            let dh = wantHeading - v.heading;
            while (dh > Math.PI)
                dh -= Math.PI * 2;
            while (dh < -Math.PI)
                dh += Math.PI * 2;
            const steer = clamp(dh * 1.8, -1, 1);
            const throttle = d > 10 ? 1 : d > 5 ? 0.5 : 0.2;
            const others = this.units.map((o) => o.vehicle);
            if (playerVehicle)
                others.push(playerVehicle);
            v.update(dt, { throttle, steer, drift: false, brake: false }, this.city, others);
        }
        // wanted decay
        const seen = this.seesPoint(px, pz);
        this.wanted.update(dt, seen);
    }
    // Voss Customs: no police sight + inside the yard clears the heat and
    // repairs the car for $200 (or whatever cash is left).
    tryCustomsClear(px, pz, cash, vehicle) {
        const d = Math.hypot(px - PLACES.vossCustoms.x, pz - PLACES.vossCustoms.z);
        if (d > 30)
            return { cleared: false, cost: 0 };
        if (this.seesPoint(px, pz))
            return { cleared: false, cost: 0 };
        if (this.wanted.stars === 0 && (!vehicle || vehicle.hp >= vehicle.spec.hp))
            return { cleared: false, cost: 0 };
        const cost = Math.min(200, cash);
        this.wanted.clear();
        if (vehicle)
            vehicle.repair();
        return { cleared: true, cost };
    }
    reset() {
        for (let i = this.units.length - 1; i >= 0; i--)
            this.removeUnit(this.units[i]);
        this.wanted.clear();
    }
}
