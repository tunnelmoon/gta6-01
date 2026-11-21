// Sidewalk pedestrians: they stroll, flee gunfire, get knocked down by
// reckless driving and drop cash pickups.
import * as THREE from 'three';
import { Rng } from './rng.js';
import { ECONOMY, WORLD, clamp } from './config.js';
function buildPedMesh(shirt, pants) {
    const group = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), shirtMat);
    torso.position.y = 1.2;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skinMat);
    head.position.y = 1.66;
    group.add(head);
    const mkLeg = (sx) => {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.13, 0.88, 0);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.18), pantsMat);
        leg.position.y = -0.4;
        pivot.add(leg);
        group.add(pivot);
        return pivot;
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);
    return { group, legL, legR };
}
export class Pedestrians {
    city;
    scene;
    peds = [];
    pickups = [];
    rng;
    time = 0;
    constructor(city, scene, seed = 11) {
        this.city = city;
        this.scene = scene;
        this.rng = new Rng(seed);
    }
    spawn(count, px, pz) {
        while (this.peds.length < count) {
            const node = this.city.graph[this.rng.int(0, this.city.graph.length - 1)];
            const dx = Math.hypot(node.x - px, node.z - pz);
            if (dx > 320)
                continue;
            const side = this.rng.chance(0.5) ? 1 : -1;
            const along = this.rng.chance(0.5);
            const x = node.x + (along ? side * 10.5 : this.rng.range(-8, 8));
            const z = node.z + (along ? this.rng.range(-8, 8) : side * 10.5);
            const shirt = new THREE.Color().setHSL(this.rng.range(0, 1), 0.5, 0.55).getHex();
            const pants = new THREE.Color().setHSL(this.rng.range(0, 1), 0.25, 0.3).getHex();
            const built = buildPedMesh(shirt, pants);
            built.group.position.set(x, 0, z);
            this.scene.add(built.group);
            const t = this.randomSidewalkTarget(x, z);
            this.peds.push({
                group: built.group,
                legL: built.legL,
                legR: built.legR,
                x,
                z,
                heading: this.rng.range(0, Math.PI * 2),
                speed: this.rng.range(1.1, 1.8),
                state: 'walk',
                panicUntil: 0,
                fallTimer: 0,
                targetX: t.x,
                targetZ: t.z,
                phase: this.rng.range(0, Math.PI * 2),
            });
        }
    }
    randomSidewalkTarget(x, z) {
        const node = this.city.nearestNode(x, z);
        const side = this.rng.chance(0.5) ? 1 : -1;
        const along = this.rng.chance(0.5);
        return {
            x: node.x + (along ? side * 10.5 : this.rng.range(-30, 30)),
            z: node.z + (along ? this.rng.range(-30, 30) : side * 10.5),
        };
    }
    panicNear(x, z, radius) {
        for (const p of this.peds) {
            if (p.state === 'fallen')
                continue;
            if (Math.hypot(p.x - x, p.z - z) < radius) {
                p.state = 'panic';
                p.panicUntil = this.time + 3.5;
                p.heading = Math.atan2(p.x - x, p.z - z);
            }
        }
    }
    // A fast vehicle hitting a ped knocks them down and drops cash.
    checkVehicleHits(vx, vz, speed) {
        const dropped = [];
        if (speed < 8)
            return dropped;
        for (const p of this.peds) {
            if (p.state === 'fallen')
                continue;
            if (Math.hypot(p.x - vx, p.z - vz) < 2.0) {
                p.state = 'fallen';
                p.fallTimer = 6;
                p.group.rotation.x = -Math.PI / 2;
                p.group.position.y = 0.3;
                const amount = this.rng.int(ECONOMY.pedCashMin, ECONOMY.pedCashMax);
                this.addPickup(p.x, p.z, amount);
                dropped.push({ amount, x: p.x, z: p.z });
            }
        }
        return dropped;
    }
    addPickup(x, z, amount) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a9a4a, emissive: 0x1a6a2a, emissiveIntensity: 0.6 }));
        mesh.position.set(x, 0.5, z);
        this.scene.add(mesh);
        this.pickups.push({ mesh, x, z, amount, life: 25 });
    }
    // Collect pickups near a point. Returns total cash collected.
    collectNear(x, z, radius) {
        let total = 0;
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pk = this.pickups[i];
            if (Math.hypot(pk.x - x, pk.z - z) < radius) {
                total += pk.amount;
                this.scene.remove(pk.mesh);
                this.pickups.splice(i, 1);
            }
        }
        return total;
    }
    update(dt, px, pz) {
        this.time += dt;
        for (const p of this.peds) {
            if (p.state === 'fallen') {
                p.fallTimer -= dt;
                if (p.fallTimer <= 0) {
                    // get up and walk away
                    p.state = 'walk';
                    p.group.rotation.x = 0;
                    p.group.position.y = 0;
                    const t = this.randomSidewalkTarget(p.x, p.z);
                    p.targetX = t.x;
                    p.targetZ = t.z;
                }
                continue;
            }
            let speed = p.speed;
            if (p.state === 'panic') {
                speed = 4.2;
                if (this.time > p.panicUntil) {
                    p.state = 'walk';
                    const t = this.randomSidewalkTarget(p.x, p.z);
                    p.targetX = t.x;
                    p.targetZ = t.z;
                }
            }
            else {
                const td = Math.hypot(p.targetX - p.x, p.targetZ - p.z);
                if (td < 3) {
                    const t = this.randomSidewalkTarget(p.x, p.z);
                    p.targetX = t.x;
                    p.targetZ = t.z;
                }
                const want = Math.atan2(p.targetX - p.x, p.targetZ - p.z);
                let d = want - p.heading;
                while (d > Math.PI)
                    d -= Math.PI * 2;
                while (d < -Math.PI)
                    d += Math.PI * 2;
                p.heading += clamp(d, -3 * dt, 3 * dt);
            }
            p.x += Math.sin(p.heading) * speed * dt;
            p.z += Math.cos(p.heading) * speed * dt;
            p.x = clamp(p.x, WORLD.minX + 10, WORLD.maxX - 10);
            p.z = clamp(p.z, WORLD.minZ + 10, WORLD.maxZ - 10);
            // keep peds out of the water by steering back toward land
            if (p.z < -420 && p.z > -520 && Math.abs(p.x) > 9) {
                p.z = p.z < -470 ? -520 : -420;
            }
            p.phase += speed * dt * 3.2;
            const s = Math.sin(p.phase) * 0.5;
            p.legL.rotation.x = s;
            p.legR.rotation.x = -s;
            p.group.position.set(p.x, p.group.position.y, p.z);
            p.group.rotation.y = p.heading;
            // recycle far peds near the player
            if (Math.hypot(p.x - px, p.z - pz) > 380) {
                const node = this.city.graph[this.rng.int(0, this.city.graph.length - 1)];
                if (Math.hypot(node.x - px, node.z - pz) < 220) {
                    p.x = node.x + this.rng.range(-8, 8);
                    p.z = node.z + this.rng.range(-8, 8);
                    const t = this.randomSidewalkTarget(p.x, p.z);
                    p.targetX = t.x;
                    p.targetZ = t.z;
                }
            }
        }
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pk = this.pickups[i];
            pk.life -= dt;
            pk.mesh.rotation.y += dt * 3;
            pk.mesh.position.y = 0.5 + Math.sin(this.time * 4 + i) * 0.12;
            if (pk.life <= 0) {
                this.scene.remove(pk.mesh);
                this.pickups.splice(i, 1);
            }
        }
    }
}
