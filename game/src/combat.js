// Combat: weapons, hitscan shooting, enemy AI, explosive barrels.
import * as THREE from 'three';
import { Rng } from './rng.js';
import { clamp } from './config.js';
function buildEnemyMesh(faction) {
    const group = new THREE.Group();
    const shirtColor = faction === 'underboss' ? 0xe8e0d0 : faction === 'elite' ? 0x1a1a1a : faction === 'guard' ? 0x3a4a5a : 0x4a1a1a;
    const pantsColor = faction === 'underboss' ? 0x2a2a2a : 0x222222;
    const bodyMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.85 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xb08060, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.3), bodyMat);
    torso.position.y = 1.28;
    torso.castShadow = true;
    group.add(torso);
    if (faction === 'elite' || faction === 'underboss') {
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.34), new THREE.MeshStandardMaterial({ color: 0x8a7a2a, roughness: 0.7 }));
        vest.position.y = 1.32;
        group.add(vest);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skinMat);
    head.position.y = 1.78;
    group.add(head);
    const mkLeg = (sx) => {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.16, 0.95, 0);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.22), pantsMat);
        leg.position.y = -0.42;
        pivot.add(leg);
        group.add(pivot);
        return pivot;
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);
    // gun in the right hand
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }));
    gun.position.set(0.36, 1.32, 0.3);
    group.add(gun);
    return { group, bodyMat, legL, legR };
}
export class Combat {
    city;
    scene;
    particles;
    tracers;
    audio;
    enemies = [];
    barrels = [];
    // Vehicles the player can shoot (convoy escorts, police, traffic).
    shootableVehicles = [];
    rng;
    fireTimer = 0;
    reloadTimer = 0;
    muzzleTimer = 0;
    constructor(city, scene, particles, tracers, audio, seed = 31) {
        this.city = city;
        this.scene = scene;
        this.particles = particles;
        this.tracers = tracers;
        this.audio = audio;
        this.rng = new Rng(seed);
    }
    spawnEnemy(x, z, hp, faction) {
        const built = buildEnemyMesh(faction);
        built.group.position.set(x, 0, z);
        this.scene.add(built.group);
        const e = {
            group: built.group,
            bodyMat: built.bodyMat,
            x,
            z,
            heading: this.rng.range(0, Math.PI * 2),
            hp,
            maxHp: hp,
            faction,
            state: 'idle',
            shootTimer: this.rng.range(0.5, 1.5),
            coverX: x,
            coverZ: z,
            deadTimer: 0,
            flashTimer: 0,
            legL: built.legL,
            legR: built.legR,
            phase: this.rng.range(0, Math.PI * 2),
        };
        this.enemies.push(e);
        return e;
    }
    spawnBarrel(x, z) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0xaa2211, roughness: 0.6, metalness: 0.3 }));
        mesh.position.set(x, 0.65, z);
        mesh.castShadow = true;
        this.scene.add(mesh);
        const b = { mesh, x, z, hp: 20 };
        this.barrels.push(b);
        return b;
    }
    clearEnemies() {
        for (const e of this.enemies)
            this.scene.remove(e.group);
        this.enemies = [];
        for (const b of this.barrels)
            this.scene.remove(b.mesh);
        this.barrels = [];
    }
    // Hitscan shot from the player. origin/aim come from the camera.
    tryFire(player, origin, dir, events) {
        const w = player.currentWeapon;
        if (this.fireTimer > 0 || this.reloadTimer > 0)
            return false;
        if (w.spec.slot === 1) {
            // melee swing
            this.fireTimer = 1 / w.spec.fireRate;
            const hx = player.x + Math.sin(player.heading) * 1.6;
            const hz = player.z + Math.cos(player.heading) * 1.6;
            for (const e of this.enemies) {
                if (e.state === 'dead')
                    continue;
                if (Math.hypot(e.x - hx, e.z - hz) < 1.6)
                    this.damageEnemy(e, w.spec.damage, events);
            }
            this.audio.click();
            return true;
        }
        if (w.clip <= 0) {
            this.startReload(player);
            return false;
        }
        this.fireTimer = 1 / w.spec.fireRate;
        w.clip -= 1;
        // spread
        const spread = w.spec.spread;
        const d = dir.clone();
        d.x += (this.rng.next() - 0.5) * spread * 2;
        d.y += (this.rng.next() - 0.5) * spread * 2;
        d.z += (this.rng.next() - 0.5) * spread * 2;
        d.normalize();
        const hit = this.marchRay(origin, d, w.spec.range);
        const mx = origin.x + d.x * 0.6;
        const my = origin.y + d.y * 0.6 - 0.15;
        const mz = origin.z + d.z * 0.6;
        this.tracers.fire(mx, my, mz, hit.x, hit.y, hit.z);
        this.particles.spawn(mx, my, mz, 0, 0, 0, 0.06, 2.5, 1, 0.85, 0.4);
        this.audio.shot();
        events.onPlayerShot();
        if (hit.kind === 'enemy' && hit.enemy) {
            this.damageEnemy(hit.enemy, w.spec.damage, events);
            return true;
        }
        if (hit.kind === 'vehicle' && hit.vehicle) {
            const wasDead = hit.vehicle.dead;
            hit.vehicle.damage(w.spec.damage);
            if (hit.vehicle.dead && !wasDead) {
                events.onExplosion(hit.vehicle.x, 1, hit.vehicle.z);
            }
            return true;
        }
        if (hit.kind === 'barrel' && hit.barrel) {
            this.explodeBarrel(hit.barrel, events);
        }
        return true;
    }
    marchRay(origin, dir, range) {
        const step = 1.0;
        for (let t = 0; t < range; t += step) {
            const x = origin.x + dir.x * t;
            const y = origin.y + dir.y * t;
            const z = origin.z + dir.z * t;
            if (y < 0)
                return { kind: 'wall', x, y: 0, z };
            // vehicles (circle test in plan view, within body height)
            if (y > 0.2 && y < 3.2) {
                for (const v of this.shootableVehicles) {
                    if (v.dead)
                        continue;
                    const dx = x - v.x;
                    const dz = z - v.z;
                    const r = v.radius;
                    if (dx * dx + dz * dz < r * r) {
                        return { kind: 'vehicle', x, y, z, vehicle: v };
                    }
                }
            }
            // enemies (chest sphere)
            for (const e of this.enemies) {
                if (e.state === 'dead')
                    continue;
                const dx = x - e.x;
                const dy = y - 1.3;
                const dz = z - e.z;
                if (dx * dx + dy * dy + dz * dz < 0.85) {
                    return { kind: 'enemy', x, y, z, enemy: e };
                }
            }
            // barrels
            for (const b of this.barrels) {
                const dx = x - b.x;
                const dy = y - 0.65;
                const dz = z - b.z;
                if (dx * dx + dy * dy + dz * dz < 1.1) {
                    return { kind: 'barrel', x, y, z, barrel: b };
                }
            }
            // buildings: point-in-AABB
            for (const c of this.city.colliders) {
                if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && y < 80) {
                    return { kind: 'wall', x, y, z };
                }
            }
        }
        const x = origin.x + dir.x * range;
        const y = origin.y + dir.y * range;
        const z = origin.z + dir.z * range;
        return { kind: 'none', x, y, z };
    }
    damageEnemy(e, amount, events) {
        if (e.state === 'dead')
            return;
        e.hp -= amount;
        e.flashTimer = 0.12;
        e.bodyMat.emissive.setHex(0x661111);
        if (e.hp <= 0) {
            e.hp = 0;
            e.state = 'dead';
            e.deadTimer = 4;
            e.group.rotation.x = -Math.PI / 2;
            e.group.position.y = 0.3;
            this.particles.burst(e.x, 1.2, e.z, 10, 3, 0.7, 1.6, 0.7, 0.15, 0.15);
            events.onKill(e);
        }
        else if (e.hp < e.maxHp * 0.5 && e.state !== 'cover') {
            // fall back to the nearest building corner
            let best = null;
            for (const c of this.city.colliders) {
                for (const [cx, cz] of [[c.minX - 2, c.minZ - 2], [c.maxX + 2, c.minZ - 2], [c.minX - 2, c.maxZ + 2], [c.maxX + 2, c.maxZ + 2]]) {
                    const d = Math.hypot(cx - e.x, cz - e.z);
                    if (d < 20 && (!best || d < best.d))
                        best = { x: cx, z: cz, d };
                }
            }
            if (best) {
                e.state = 'cover';
                e.coverX = best.x;
                e.coverZ = best.z;
            }
        }
    }
    explodeBarrel(b, events) {
        this.scene.remove(b.mesh);
        this.barrels.splice(this.barrels.indexOf(b), 1);
        events.onExplosion(b.x, 1, b.z);
    }
    // Public read of the reload state (HUD + playtest).
    isReloading() {
        return this.reloadTimer > 0;
    }
    startReload(player) {
        const w = player.currentWeapon;
        if (w.spec.slot === 1 || w.clip >= w.spec.clip || w.reserve <= 0 || this.reloadTimer > 0)
            return;
        this.reloadTimer = 1.2;
        this.audio.reload();
    }
    finishReload(player) {
        const w = player.currentWeapon;
        const need = w.spec.clip - w.clip;
        const take = Math.min(need, w.reserve);
        w.clip += take;
        w.reserve -= take;
    }
    update(dt, player, events) {
        this.fireTimer = Math.max(0, this.fireTimer - dt);
        this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
        if (this.reloadTimer > 0) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0)
                this.finishReload(player);
        }
        const px = player.x;
        const pz = player.z;
        for (const e of this.enemies) {
            if (e.state === 'dead') {
                e.deadTimer -= dt;
                if (e.deadTimer <= 0) {
                    this.scene.remove(e.group);
                    this.enemies.splice(this.enemies.indexOf(e), 1);
                }
                continue;
            }
            if (e.flashTimer > 0) {
                e.flashTimer -= dt;
                if (e.flashTimer <= 0)
                    e.bodyMat.emissive.setHex(0x000000);
            }
            const d = Math.hypot(px - e.x, pz - e.z);
            const sees = d < 48 && this.city.hasLineOfSight(e.x, e.z, px, pz);
            if (sees && e.state !== 'combat')
                e.state = 'combat';
            if (!sees && e.state === 'combat' && d > 60)
                e.state = 'idle';
            if (e.state === 'cover') {
                const cd = Math.hypot(e.coverX - e.x, e.coverZ - e.z);
                if (cd > 1.5) {
                    const ang = Math.atan2(e.coverX - e.x, e.coverZ - e.z);
                    e.x += Math.sin(ang) * 3.4 * dt;
                    e.z += Math.cos(ang) * 3.4 * dt;
                    e.heading = ang;
                    e.phase += dt * 6;
                }
                else if (sees) {
                    e.state = 'combat';
                }
            }
            else if (e.state === 'combat') {
                e.heading = Math.atan2(px - e.x, pz - e.z);
                // hold position while shooting
                e.shootTimer -= dt;
                if (e.shootTimer <= 0 && sees) {
                    e.shootTimer = 0.9 + this.rng.next() * 0.7;
                    const hitChance = clamp(0.5 - d / 110, 0.08, 0.4);
                    const muzzleX = e.x + Math.sin(e.heading) * 0.5;
                    const muzzleZ = e.z + Math.cos(e.heading) * 0.5;
                    const hitX = px + (this.rng.next() - 0.5) * 2;
                    const hitZ = pz + (this.rng.next() - 0.5) * 2;
                    this.tracers.fire(muzzleX, 1.4, muzzleZ, hitX, 1.2, hitZ);
                    this.particles.spawn(muzzleX, 1.4, muzzleZ, 0, 0, 0, 0.06, 2.2, 1, 0.85, 0.4);
                    this.audio.shot();
                    if (this.rng.chance(hitChance)) {
                        const dmg = e.faction === 'underboss' ? 16 : e.faction === 'elite' ? 11 : 8;
                        player.takeDamage(dmg);
                    }
                }
            }
            // walk animation
            const moving = e.state === 'cover';
            if (moving) {
                const s = Math.sin(e.phase) * 0.45;
                e.legL.rotation.x = s;
                e.legR.rotation.x = -s;
            }
            else {
                e.legL.rotation.x = 0;
                e.legR.rotation.x = 0;
            }
            e.group.position.set(e.x, e.group.position.y, e.z);
            e.group.rotation.y = e.heading;
        }
    }
}
