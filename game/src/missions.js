// Story missions: 4 chained missions with letterboxed cutscenes, dialogue
// subtitles, GPS waypoints, fail/retry and rewards. Each mission is a list
// of typed steps; the manager spawns what a step needs and advances when
// its condition is met. Deliver radii are set above the closest distance
// any car can physically reach a building centre.
import * as THREE from 'three';
import { LOC } from './config.js';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const MISSIONS = [
    {
        id: 'm1',
        title: 'Salt and Ignition',
        startX: LOC.elFaroBar.x,
        startZ: LOC.elFaroBar.z + 25,
        intro: {
            duration: 8,
            camFrom: V3(-560, 14, 40), camTo: V3(-520, 6, 110),
            lookFrom: V3(-540, 8, 80), lookTo: V3(-540, 4, 80),
            lines: [
                { speaker: 'Mateo', text: 'Two years off the grid, Mara, and Vespera Syndicate still remembers what your brother owed them. Tonight, they collect, unless we pay first.' },
                { speaker: 'Mara', text: "I don't boost cars for free anymore, Mateo. Give me a name and a plate." },
                { speaker: 'Mateo', text: 'Take my Kestrel. Silver Solmar GT parked at the Playa Dorado VIP lot. Clean keys, dirty owner. Drop it at Voss Customs before SMPD tags the plates.' },
            ],
        },
        outro: {
            duration: 5,
            camFrom: V3(-440, 8, -110), camTo: V3(-480, 5, -160),
            lookFrom: V3(-460, 3, -140), lookTo: V3(-460, 3, -140),
            lines: [
                { speaker: 'Mateo', text: 'Clean work, Voss. Vespera will not take this quietly, keep that Kestrel close.' },
            ],
        },
        steps: [
            { kind: 'goto', x: LOC.vipLot.x, z: LOC.vipLot.z, radius: 14, text: 'Reach the Playa Dorado VIP lot' },
            { kind: 'kill', x: 640, z: -185, radius: 30, text: 'Take out the 3 lot guards', hp: 60, count: 3, positions: [{ x: 632, z: -175 }, { x: 652, z: -180 }, { x: 640, z: -195 }], faction: 'guard' },
            { kind: 'steal', x: 645, z: -185, radius: 6, text: 'Steal the silver Solmar GT', vehicleDef: 'solmarGT' },
            { kind: 'deliver', x: LOC.vossCustoms.x, z: LOC.vossCustoms.z, radius: 17, text: 'Lose the heat and deliver the GT to Voss Customs', minHpPct: 40 },
        ],
        reward: 1500,
        rewardText: '$1,500 + Kestrel 9mm + Voss Customs unlocked',
    },
    {
        id: 'm2',
        title: 'Harbor Static',
        startX: LOC.vossCustoms.x,
        startZ: LOC.vossCustoms.z + 25,
        intro: {
            duration: 8,
            camFrom: V3(-60, 30, 420), camTo: V3(40, 18, 520),
            lookFrom: V3(60, 20, 560), lookTo: V3(180, 16, 660),
            lines: [
                { speaker: 'Mateo', text: "Mara, we got burned! Vespera tracked the coupe's transponder and raided my stash at Puerto Viejo docks." },
                { speaker: 'Mara', text: "Tell me they didn't get the ledger drives." },
                { speaker: 'Mateo', text: 'Locked inside Pier 4 warehouse right now. Grab that drive before their freighter leaves port, and watch out, they brought heavy hardware.' },
            ],
        },
        outro: {
            duration: 6,
            camFrom: V3(500, 8, 110), camTo: V3(545, 5, 165),
            lookFrom: V3(520, 3, 140), lookTo: V3(520, 3, 140),
            lines: [
                { speaker: 'Mara', text: "I've got the drives, Mateo. Meet me at the motel, wait... Mateo? Answer your phone." },
            ],
        },
        steps: [
            { kind: 'goto', x: LOC.portGate.x, z: LOC.portGate.z, radius: 14, text: 'Drive to the Port Main Gate' },
            { kind: 'kill', x: 190, z: 680, radius: 60, text: 'Clear the 8 Syndicate gunmen', hp: 85, count: 8, positions: [{ x: 140, z: 620 }, { x: 165, z: 640 }, { x: 190, z: 680 }, { x: 210, z: 665 }, { x: 235, z: 725 }, { x: 150, z: 700 }, { x: 225, z: 640 }, { x: 175, z: 720 }], faction: 'syndicate' },
            { kind: 'grab', x: LOC.pier4.x, z: LOC.pier4.z - 12, radius: 6, text: 'Grab the Encrypted Ledger Case in Pier 4' },
            { kind: 'steal', x: 215, z: 755, radius: 6, text: 'Hijack the armored Cargo Mule', vehicleDef: 'cargoMule', vehicleHp: 200 },
            { kind: 'deliver', x: LOC.safehouseMotel.x, z: LOC.safehouseMotel.z, radius: 17, text: 'Deliver the van to the Safehouse Motel', minHpPct: 0 },
        ],
        reward: 3500,
        rewardText: '$3,500 + Viper Micro-SMG + Solmar Armory unlocked',
    },
    {
        id: 'm3',
        title: 'Neon Ransom',
        startX: LOC.safehouseMotel.x,
        startZ: LOC.safehouseMotel.z + 25,
        intro: {
            duration: 8,
            camFrom: V3(500, 10, 110), camTo: V3(540, 6, 160),
            lookFrom: V3(520, 4, 140), lookTo: V3(520, 4, 140),
            lines: [
                { speaker: 'Vespera Lieutenant', text: "You want your little hacker back, Voss? Bring the ledger to Cayo Verde midnight, or we dump him off the North Bridge." },
                { speaker: 'Mara', text: "They're moving him up Central Avenue right now. If they cross that bridge into Cayo Verde, he's dead." },
            ],
        },
        outro: {
            duration: 6,
            camFrom: V3(-440, 8, -110), camTo: V3(-480, 5, -160),
            lookFrom: V3(-460, 3, -140), lookTo: V3(-460, 3, -140),
            lines: [
                { speaker: 'Mateo', text: 'I cracked the ledger while tied up in the back of that van... fifty grand in bearer bonds sitting in their Cayo Verde penthouse vault.' },
                { speaker: 'Mara', text: 'No more running. Tonight, we take Solmar.' },
            ],
        },
        steps: [
            { kind: 'convoy', x: -150, z: -80, radius: 40, text: 'Intercept the convoy heading north' },
            { kind: 'rescue', x: 0, z: -300, radius: 8, text: 'Rescue Mateo from the stopped Transport Van' },
            { kind: 'respray', x: LOC.vossCustoms.x, z: LOC.vossCustoms.z, radius: 15, text: 'Lose the 3-star heat: respray at Voss Customs out of police sight' },
        ],
        reward: 7500,
        rewardText: '$7,500 + Bulldog Carbine + max Body Armor',
    },
    {
        id: 'm4',
        title: 'Solmar Sunset',
        startX: LOC.bridgeSouth.x,
        startZ: LOC.bridgeSouth.z,
        intro: {
            duration: 9,
            camFrom: V3(-80, 24, -340), camTo: V3(60, 16, -460),
            lookFrom: V3(0, 8, -470), lookTo: V3(0, 6, -520),
            lines: [
                { speaker: 'Mateo', text: 'I looped their penthouse security cameras for ten minutes. Once you breach the courtyard, their private army will lock down the bridge.' },
                { speaker: 'Mara', text: "Keep the boat engine running at Playa Dorado Marina. When I cross back over that bridge, I'm not coming empty-handed." },
            ],
        },
        outro: {
            duration: 12,
            camFrom: V3(720, 14, 200), camTo: V3(790, 6, 280),
            lookFrom: V3(780, 3, 260), lookTo: V3(780, 3, 260),
            lines: [
                { speaker: 'Mara', text: 'The debt is paid, Mateo. And the rest of Solmar? It is wide open.' },
            ],
        },
        steps: [
            { kind: 'goto', x: 0, z: -510, radius: 12, text: 'Cross the Coastal Bridge into Cayo Verde' },
            { kind: 'gate', x: LOC.compoundGate.x, z: LOC.compoundGate.z, radius: 10, text: 'Breach the Vespera Compound Gate' },
            { kind: 'kill', x: 120, z: -780, radius: 55, text: 'Defeat the 12 elite guards and the Underboss', hp: 110, count: 12, positions: [{ x: 100, z: -760 }, { x: 140, z: -760 }, { x: 110, z: -740 }, { x: 130, z: -745 }, { x: 95, z: -780 }, { x: 145, z: -780 }, { x: 105, z: -800 }, { x: 135, z: -800 }, { x: 120, z: -770 }, { x: 100, z: -730 }, { x: 140, z: -735 }, { x: 120, z: -790 }], faction: 'syndicate' },
            { kind: 'breach', x: LOC.vault.x, z: LOC.vault.z, radius: 6, text: 'Breach the Vault (hold E for 3s)' },
            { kind: 'escape', x: LOC.marina.x, z: LOC.marina.z, radius: 17, text: 'Take the getaway GT and reach Playa Dorado Marina' },
        ],
        reward: 50000,
        rewardText: '$50,000 + Endless Free Roam + 50% store discount',
    },
];
export class Missions {
    constructor(ctx) {
        this.current = -1;
        this.active = false;
        this.storyComplete = false;
        this.customsUnlocked = false;
        this.armoryUnlocked = false;
        this.discount = false;
        this.objective = '';
        this.waypoint = null;
        this.stepIndex = 0;
        this.stepDone = false;
        this.killRemaining = 0;
        this.missionEnemyIds = new Set();
        this.convoy = null;
        this.convoyFailed = false;
        this.chasers = [];
        this.chasersSpawned = false;
        this.breachT = 0;
        this.stepVehicle = null;
        this.outroPlaying = false;
        this.underboss = null;
        this.underbossSpawned = false;
        this.ctx = ctx;
    }
    get def() {
        return this.current >= 0 ? MISSIONS[this.current] : null;
    }
    get step() {
        const d = this.def;
        if (!d || this.stepIndex >= d.steps.length)
            return null;
        return d.steps[this.stepIndex];
    }
    nextMissionIndex() {
        return this.current + 1;
    }
    canStartNext() {
        return !this.active && !this.storyComplete && this.current + 1 < MISSIONS.length;
    }
    nextStartRing() {
        if (!this.canStartNext())
            return null;
        const d = MISSIONS[this.current + 1];
        return { x: d.startX, z: d.startZ, title: d.title };
    }
    startMission(i) {
        const d = MISSIONS[i];
        this.current = i;
        this.stepIndex = 0;
        this.active = true;
        this.stepDone = false;
        this.killRemaining = 0;
        this.missionEnemyIds.clear();
        this.convoy = null;
        this.convoyFailed = false;
        this.chasers = [];
        this.chasersSpawned = false;
        this.breachT = 0;
        this.stepVehicle = null;
        this.outroPlaying = false;
        this.underboss = null;
        this.underbossSpawned = false;
        if (i === 2)
            this.ctx.setTimeOfDay('night');
        if (i === 3)
            this.ctx.setTimeOfDay('sunset');
        if (i === 0)
            this.ctx.unlockWeapon('kestrel');
        // A new job starts patched up: health has no other recovery path, and
        // a player who limps out of the last job at 20 HP would have no chance
        // against the next crew.
        this.ctx.healPlayer();
        this.ctx.playCutscene(d.intro, () => this.beginSteps());
    }
    // Debug/shot driver: jump straight to a mission step.
    debugJumpToStep(i) {
        if (!this.def)
            return;
        this.stepIndex = Math.min(i, this.def.steps.length - 1);
        this.setupStep();
    }
    beginSteps() {
        this.stepIndex = 0;
        this.setupStep();
    }
    setupStep() {
        const s = this.step;
        if (!s) {
            this.completeMission();
            return;
        }
        this.stepDone = false;
        this.objective = s.text;
        this.waypoint = { x: s.x, z: s.z, radius: s.radius };
        if (s.kind === 'kill' && s.positions) {
            this.killRemaining = s.count ?? s.positions.length;
            this.missionEnemyIds.clear();
            for (const p of s.positions) {
                const e = this.ctx.spawnEnemy(p.x, p.z, s.hp ?? 80, s.faction ?? 'syndicate');
                this.missionEnemyIds.add(e.id);
            }
            if (this.def?.id === 'm4' && !this.underbossSpawned) {
                this.underbossSpawned = true;
                this.underboss = this.ctx.spawnEnemy(120, -780, 250, 'syndicate');
                this.missionEnemyIds.add(this.underboss.id);
                this.killRemaining += 1;
            }
        }
        if (s.kind === 'steal' && s.vehicleDef) {
            const v = this.ctx.spawnVehicle(s.vehicleDef, s.x, s.z, 0);
            if (s.vehicleHp)
                v.hp = s.vehicleHp;
            this.stepVehicle = v;
        }
        if (s.kind === 'convoy') {
            const route = [
                { x: -160, z: -80 }, { x: -160, z: -240 }, { x: -160, z: -400 },
                { x: -80, z: -400 }, { x: 0, z: -400 }, { x: 0, z: -470 }, { x: 0, z: -540 },
            ];
            const escorts = [
                this.ctx.spawnVehicle('v8Dorado', -150, -70, Math.PI),
                this.ctx.spawnVehicle('v8Dorado', -150, -92, Math.PI),
            ];
            const van = this.ctx.spawnVehicle('cargoMule', -150, -80, Math.PI);
            van.hp = 220;
            this.convoy = { vehicles: [escorts[0], van, escorts[1]], route, wp: 0, speed: 18.8, stopped: false };
            this.ctx.addHeat(0);
        }
        if (s.kind === 'deliver' && this.def?.id === 'm1') {
            this.ctx.setHeat(40);
        }
        if (s.kind === 'respray') {
            this.ctx.setHeat(50);
        }
        if (s.kind === 'escape') {
            this.ctx.setHeat(80);
            this.ctx.setWantedBlockade();
            const gt = this.ctx.spawnVehicle('solmarGT', 95, -750, Math.PI / 2);
            this.stepVehicle = gt;
        }
        if (s.kind === 'gate') {
            this.ctx.notify('Breach the gate: get close and press E');
        }
        if (s.kind === 'rescue' && this.convoy) {
            const van = this.convoy.vehicles[1];
            this.waypoint = { x: van.pos.x, z: van.pos.z, radius: 8 };
        }
    }
    advance() {
        this.stepIndex++;
        this.setupStep();
    }
    completeMission() {
        const d = this.def;
        this.active = false;
        this.objective = '';
        this.waypoint = null;
        this.ctx.giveCash(d.reward);
        if (d.id === 'm1') {
            this.ctx.unlockWeapon('kestrel');
            this.customsUnlocked = true;
        }
        if (d.id === 'm2') {
            this.ctx.unlockWeapon('viper');
            this.armoryUnlocked = true;
        }
        if (d.id === 'm3') {
            this.ctx.unlockWeapon('bulldog');
            this.ctx.setArmor(100);
        }
        if (d.id === 'm4') {
            this.storyComplete = true;
            this.discount = true;
        }
        this.ctx.onMissionComplete(d);
        this.outroPlaying = true;
        this.ctx.playCutscene(d.outro, () => {
            this.outroPlaying = false;
        });
    }
    fail(reason) {
        if (!this.active)
            return;
        this.active = false;
        this.objective = '';
        this.waypoint = null;
        for (const c of this.chasers)
            this.ctx.removeVehicle(c);
        this.chasers = [];
        if (this.stepVehicle) {
            this.ctx.removeVehicle(this.stepVehicle);
            this.stepVehicle = null;
        }
        if (this.convoy) {
            for (const v of this.convoy.vehicles)
                this.ctx.removeVehicle(v);
            this.convoy = null;
        }
        this.ctx.onMissionFailed(reason);
    }
    onEnemyKilled(e) {
        if (!this.active || !this.missionEnemyIds.has(e.id))
            return;
        this.missionEnemyIds.delete(e.id);
        this.killRemaining--;
        if (this.killRemaining <= 0) {
            const s = this.step;
            if (s && s.kind === 'kill')
                this.advance();
        }
    }
    onPlayerDeath() {
        if (this.active)
            this.fail('Mara was wasted. Mission failed, try again.');
    }
    onPlayerBusted() {
        if (this.active)
            this.fail('Mara was busted. Mission failed, try again.');
    }
    // E pressed: context actions for grab / rescue / breach / gate steps.
    interact() {
        const s = this.step;
        if (!this.active || !s)
            return false;
        const p = this.ctx.playerPos();
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (s.kind === 'grab' && d < s.radius + 2) {
            this.ctx.notify('Ledger Case secured');
            this.advance();
            return true;
        }
        if (s.kind === 'rescue' && this.convoy && this.convoy.stopped) {
            const van = this.convoy.vehicles[1];
            const vd = Math.hypot(p.x - van.pos.x, p.z - van.pos.z);
            if (vd < 5) {
                this.ctx.notify('Mateo rescued');
                this.advance();
                return true;
            }
        }
        if (s.kind === 'gate' && d < s.radius + 2) {
            this.ctx.openCompoundGate();
            this.ctx.notify('Compound gate breached');
            this.advance();
            return true;
        }
        return false;
    }
    update(dt) {
        if (!this.active || this.outroPlaying)
            return;
        const s = this.step;
        if (!s)
            return;
        const p = this.ctx.playerPos();
        const pv = this.ctx.playerVehicle();
        const dist = Math.hypot(p.x - s.x, p.z - s.z);
        if (s.kind === 'goto' && dist < s.radius) {
            this.advance();
            return;
        }
        if (s.kind === 'steal' && pv && this.stepVehicle && pv === this.stepVehicle) {
            this.advance();
            return;
        }
        if (s.kind === 'deliver') {
            if (pv && this.stepVehicle && pv === this.stepVehicle && dist < s.radius) {
                const pct = (pv.hp / pv.def.hp) * 100;
                if (s.minHpPct && pct < s.minHpPct) {
                    this.fail('The delivery car is too damaged. Mission failed.');
                    return;
                }
                this.advance();
                return;
            }
        }
        if (s.kind === 'breach') {
            if (dist < s.radius + 2 && this.ctx.playerInVehicle() === false && this.ctx.isKeyDown('e')) {
                this.breachT += dt;
                if (this.breachT >= 3) {
                    this.ctx.notify('Vault cracked: $50,000 in bearer bonds');
                    this.advance();
                    return;
                }
            }
            else {
                this.breachT = 0;
            }
        }
        if (s.kind === 'respray') {
            if (pv && dist < s.radius && !this.ctx.isPlayerSeen()) {
                this.ctx.setHeat(0);
                pv.hp = pv.def.hp;
                this.ctx.notify('Respray complete. Heat cleared, car repaired.');
                this.advance();
                return;
            }
        }
        if (s.kind === 'escape' && pv && this.stepVehicle && pv === this.stepVehicle && dist < s.radius) {
            this.advance();
            return;
        }
        if (s.kind === 'convoy' && this.convoy) {
            this.updateConvoy(dt);
            return;
        }
        // M2 chasers: two V8 Dorados tail the player after the hijack.
        if (this.def?.id === 'm2' && this.step?.kind === 'deliver' && !this.chasersSpawned && pv) {
            this.chasersSpawned = true;
            const c1 = this.ctx.spawnVehicle('v8Dorado', 40, 520, 0);
            const c2 = this.ctx.spawnVehicle('v8Dorado', 60, 540, 0);
            this.chasers = [c1, c2];
        }
        for (const c of this.chasers) {
            if (c.exploded)
                continue;
            const tx = p.x - c.pos.x;
            const tz = p.z - c.pos.z;
            const want = Math.atan2(tx, tz);
            let diff = want - c.heading;
            while (diff > Math.PI)
                diff -= Math.PI * 2;
            while (diff < -Math.PI)
                diff += Math.PI * 2;
            c.update(dt, { throttle: 1, steer: Math.max(-1, Math.min(1, diff * 2)), drift: false, horn: false }, this.ctx.city);
            const d = Math.hypot(tx, tz);
            if (pv && d < c.radius + pv.radius) {
                pv.damage(8 * dt);
                c.damage(4 * dt);
            }
        }
        this.chasers = this.chasers.filter((c) => !c.exploded);
    }
    updateConvoy(dt) {
        const cv = this.convoy;
        const escorts = [cv.vehicles[0], cv.vehicles[2]];
        const van = cv.vehicles[1];
        // Fail if the convoy crosses into Cayo Verde with escorts alive.
        if (!this.convoyFailed && van.pos.z < -510) {
            const alive = escorts.filter((e) => !e.exploded && e.hp > e.def.hp * 0.2);
            if (alive.length > 0) {
                this.convoyFailed = true;
                this.fail('The convoy crossed the bridge. Mateo is gone.');
                return;
            }
        }
        // Escorts disabled (hp below 20%) and van stopped -> rescue step.
        const disabled = escorts.every((e) => e.exploded || e.hp <= e.def.hp * 0.2);
        if (disabled && !cv.stopped) {
            cv.stopped = true;
            van.speed = 0;
            this.ctx.notify('Convoy stopped. Rescue Mateo from the Transport Van.');
            this.advance();
        }
        if (cv.stopped) {
            // Rescue step is handled by interact(); keep the waypoint on the van.
            return;
        }
        const target = cv.route[cv.wp];
        if (!target)
            return;
        const dx = target.x - van.pos.x;
        const dz = target.z - van.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 6) {
            cv.wp++;
            return;
        }
        const want = Math.atan2(dx, dz);
        const speed = cv.speed;
        for (let i = 0; i < cv.vehicles.length; i++) {
            const v = cv.vehicles[i];
            if (v.exploded)
                continue;
            // Follow in formation: escorts flank the van.
            const offX = i === 0 ? -4 : i === 2 ? 4 : 0;
            const offZ = i === 1 ? 0 : 2;
            const tx = target.x + offX - v.pos.x;
            const tz = target.z + offZ - v.pos.z;
            const wang = Math.atan2(tx, tz);
            let diff = wang - v.heading;
            while (diff > Math.PI)
                diff -= Math.PI * 2;
            while (diff < -Math.PI)
                diff += Math.PI * 2;
            v.speed = speed;
            v.heading += diff * dt * 1.2;
            v.pos.x += Math.sin(v.heading) * v.speed * dt;
            v.pos.z += Math.cos(v.heading) * v.speed * dt;
            v.group.position.copy(v.pos);
            v.group.rotation.y = v.heading;
        }
    }
}
