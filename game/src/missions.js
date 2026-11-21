import { MISSIONS, SHOPS } from './config.js';
export class Missions {
    city;
    scene;
    combat;
    events;
    missionIndex = -1; // -1 = free roam / no mission
    stepIndex = 0;
    storyComplete = false;
    discount = false;
    runtime = { kills: 0, targetVehicle: null, convoy: null, interactProgress: 0, guards: [], rescueAt: null };
    cutsceneActive = false;
    missionCars = [];
    spawnCarFn = null;
    constructor(city, scene, combat, events) {
        this.city = city;
        this.scene = scene;
        this.combat = combat;
        this.events = events;
    }
    setSpawnCar(fn) {
        this.spawnCarFn = fn;
    }
    spawnCar(key, x, z, heading, color) {
        if (!this.spawnCarFn)
            throw new Error('spawnCar not set');
        return this.spawnCarFn(key, x, z, heading, color);
    }
    get current() {
        return this.missionIndex >= 0 && this.missionIndex < MISSIONS.length ? MISSIONS[this.missionIndex] : null;
    }
    get stepText() {
        const m = this.current;
        if (!m)
            return '';
        return m.steps[this.stepIndex]?.text ?? '';
    }
    startMission(id, player) {
        this.missionIndex = id - 1;
        this.stepIndex = 0;
        this.clearRescueAt();
        this.resetRuntime();
        const m = this.current;
        if (!m)
            return;
        player.place(m.start.x + 4, m.start.z + 4, Math.PI);
        this.setupStep(player);
        this.playIntro(m);
    }
    resetRuntime() {
        // Step-scoped state is wiped between steps. The stolen target
        // vehicle is the exception: advance() saves and restores it, so a
        // deliver step can still check it. Mission boundaries (startMission,
        // failMission) call this without restoring, which clears it.
        for (const e of this.runtime.guards) {
            if (e.state !== 'dead') {
                e.hp = 0;
                e.state = 'dead';
                e.deadTimer = 0;
            }
        }
        // rescueAt survives: the convoy van's stop point is the rescue target
        // for the next step, even after the convoy step itself is cleared
        const rescueAt = this.runtime.rescueAt;
        this.runtime = { kills: 0, targetVehicle: null, convoy: null, interactProgress: 0, guards: [], rescueAt };
    }
    clearRescueAt() {
        this.runtime.rescueAt = null;
    }
    clearMissionCars() {
        if (this.missionCars.length > 0) {
            this.events.onRemoveVehicles([...this.missionCars]);
        }
        this.missionCars = [];
    }
    // Build the entities for the current step.
    setupStep(player) {
        const m = this.current;
        if (!m)
            return;
        const step = m.steps[this.stepIndex];
        if (!step)
            return;
        if (step.kind === 'kill') {
            const count = step.count ?? 1;
            const hp = step.hp ?? 60;
            const faction = m.id === 4 ? (count === 1 && step.text.includes('Underboss') ? 'underboss' : 'elite') : m.id === 2 ? 'syndicate' : 'guard';
            // spread guards around the step target
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2 + 0.7;
                const r = 8 + (i % 3) * 5;
                const e = this.combat.spawnEnemy(step.x + Math.sin(a) * r, step.z + Math.cos(a) * r, hp, faction);
                this.runtime.guards.push(e);
            }
            // explosive barrels near the fight for M2/M4
            if (m.id === 2 || m.id === 4) {
                this.combat.spawnBarrel(step.x - 12, step.z + 6);
                this.combat.spawnBarrel(step.x + 10, step.z - 8);
            }
        }
        if (step.kind === 'steal') {
            const key = m.id === 1 ? 'solmarGT' : 'cargoMule';
            const color = m.id === 1 ? 0xc0c8d0 : 0x4a4a48;
            const v = this.spawnCar(key, step.x, step.z, Math.PI / 2, color);
            v.hp = m.id === 2 ? 200 : 100;
            this.runtime.targetVehicle = v;
            this.missionCars.push(v);
        }
        if (step.kind === 'convoy') {
            const waypoints = [
                { x: -150, z: -80 },
                { x: -120, z: -80 },
                { x: -120, z: -360 },
                { x: 0, z: -360 },
                { x: 0, z: -430 },
                { x: 0, z: -510 },
            ];
            const van = this.spawnCar('cargoMule', -150, -86, 0, 0x141414);
            const e1 = this.spawnCar('v8Dorado', -156, -80, 0, 0x8a2a20);
            const e2 = this.spawnCar('v8Dorado', -144, -80, 0, 0x8a2a20);
            e1.hp = 140;
            e2.hp = 140;
            van.hp = 300;
            this.runtime.convoy = { van, escorts: [e1, e2], waypoints, wpIndex: 0, disabled: 0, failed: false };
            this.missionCars.push(van, e1, e2);
        }
        if (step.kind === 'interact' && m.id === 4) {
            // getaway car waits at the compound
            const v = this.spawnCar('solmarGT', 95, -750, Math.PI, 0xc0c8d0);
            this.missionCars.push(v);
        }
        this.updateObjective(player);
    }
    playIntro(m) {
        const keys = [];
        const start = m.start;
        if (m.id === 1) {
            keys.push({ x: -540, y: 26, z: 120, lx: -540, ly: 10, lz: 80, t: 0 }, { x: -520, y: 8, z: 100, lx: -540, ly: 3, lz: 80, t: 4 }, { x: -536, y: 3.2, z: 102, lx: -540, ly: 2.5, lz: 90, t: 8 });
        }
        else if (m.id === 2) {
            keys.push({ x: -452, y: 4, z: -128, lx: -460, ly: 1.6, lz: -140, t: 0 }, { x: -200, y: 60, z: 200, lx: -60, ly: 20, lz: 480, t: 4 }, { x: -40, y: 30, z: 420, lx: 180, ly: 10, lz: 660, t: 8 });
        }
        else if (m.id === 3) {
            keys.push({ x: 512, y: 4, z: 128, lx: 520, ly: 1.6, lz: 140, t: 0 }, { x: 300, y: 40, z: -40, lx: -120, ly: 2, lz: -160, t: 4 }, { x: -100, y: 12, z: -140, lx: -120, ly: 2, lz: -280, t: 8 });
        }
        else {
            keys.push({ x: -60, y: 34, z: -380, lx: 0, ly: 4, lz: -470, t: 0 }, { x: 40, y: 18, z: -460, lx: 120, ly: 6, lz: -720, t: 4.5 }, { x: 110, y: 6, z: -700, lx: 120, ly: 2, lz: -780, t: 9 });
        }
        this.cutsceneActive = true;
        this.events.letterbox(true);
        this.showSubtitles(m.intro);
        this.events.cameraKeys(keys, () => {
            this.cutsceneActive = false;
            this.events.letterbox(false);
            this.events.clearSubtitle();
        });
    }
    showSubtitles(lines) {
        // subtitles are queued by the game loop via the cutscene timer; store
        // them on the instance for the game to read
        this.subtitleQueue = lines.map((l, i) => ({ ...l, start: i * 3.2, end: i * 3.2 + 3.0 }));
    }
    subtitleQueue = [];
    isCutscene() {
        return this.cutsceneActive;
    }
    skipCutscene() {
        if (!this.cutsceneActive)
            return;
        this.cutsceneActive = false;
        this.events.letterbox(false);
        this.events.clearSubtitle();
        this.subtitleQueue = [];
    }
    // Mission kill hook: count kills toward the current kill step.
    onKill(_e) {
        const m = this.current;
        if (!m)
            return;
        const step = m.steps[this.stepIndex];
        if (step && step.kind === 'kill') {
            this.runtime.kills += 1;
        }
    }
    // Called when the player enters a vehicle.
    onEnterVehicle(v, player) {
        const m = this.current;
        if (!m)
            return;
        const step = m.steps[this.stepIndex];
        if (step && step.kind === 'steal' && this.runtime.targetVehicle === v) {
            this.advance(player);
        }
    }
    // Called when the customs respray clears the wanted level.
    onCustomsClear(player) {
        const m = this.current;
        if (!m)
            return;
        const step = m.steps[this.stepIndex];
        if (step && step.kind === 'deliver' && m.id === 3) {
            this.advance(player);
        }
    }
    // Interact key (E/F) near an interact target.
    tryInteract(player, dt) {
        const m = this.current;
        if (!m)
            return false;
        const step = m.steps[this.stepIndex];
        if (!step || step.kind !== 'interact')
            return false;
        // the rescue target follows the stopped van
        let tx = step.x;
        let tz = step.z;
        if (m.id === 3) {
            const at = this.runtime.rescueAt ?? (this.runtime.convoy ? { x: this.runtime.convoy.van.x, z: this.runtime.convoy.van.z } : null);
            if (at) {
                tx = at.x;
                tz = at.z;
            }
        }
        const px = player.inVehicle ? player.inVehicle.x : player.x;
        const pz = player.inVehicle ? player.inVehicle.z : player.z;
        const d = Math.hypot(tx - px, tz - pz);
        if (d > step.radius)
            return false;
        if (m.id === 4) {
            // vault: hold for 3 seconds
            this.runtime.interactProgress += dt;
            if (this.runtime.interactProgress >= 3) {
                this.runtime.interactProgress = 0;
                this.advance(player);
                return true;
            }
            return true; // holding
        }
        this.advance(player);
        return true;
    }
    getInteractProgress() {
        return this.runtime.interactProgress / 3;
    }
    failMission(reason, player) {
        this.events.onFail(reason);
        this.combat.clearEnemies();
        // eject the player from a mission car before it is removed
        if (player.inVehicle && this.missionCars.includes(player.inVehicle)) {
            player.exitVehicle();
        }
        this.clearMissionCars();
        this.clearRescueAt();
        this.resetRuntime();
        this.stepIndex = 0;
        const m = this.current;
        if (m) {
            player.place(m.start.x + 4, m.start.z + 4, Math.PI);
            this.setupStep(player);
        }
    }
    // Public read of the convoy van position (minimap GPS target).
    convoyVanPos() {
        const c = this.runtime.convoy;
        if (c)
            return { x: c.van.x, z: c.van.z };
        // Once the convoy step is cleared, the convoy record is gone, but
        // the van's stop point is kept in rescueAt for the rescue step.
        // Return it so the GPS and the rescue interact still point at the
        // van instead of falling back to the step coordinates.
        return this.runtime.rescueAt;
    }
    // Expose the convoy escorts for the playtest/debug hooks.
    convoyEscorts() {
        const c = this.runtime.convoy;
        return c ? c.escorts : [];
    }
    advance(player) {
        const m = this.current;
        if (!m)
            return;
        const finishedStep = m.steps[this.stepIndex];
        // The stolen target vehicle must survive the step reset: the
        // deliver step that follows the steal step checks it. Without this,
        // the deliver can never complete (targetVehicle is wiped here).
        const keepVehicle = this.runtime.targetVehicle;
        this.stepIndex += 1;
        this.resetRuntime();
        this.runtime.targetVehicle = keepVehicle;
        // cracking the vault triggers the 4-star escape
        if (m.id === 4 && finishedStep && finishedStep.kind === 'interact') {
            this.events.onVaultCracked();
        }
        if (this.stepIndex >= m.steps.length) {
            this.completeMission(player);
            return;
        }
        // set up the next step's entities (guards, target vehicle, convoy)
        this.setupStep(player);
        this.updateObjective(player);
        this.events.toast(`Objective updated: ${m.steps[this.stepIndex].text}`);
    }
    completeMission(player) {
        const m = this.current;
        if (!m)
            return;
        player.cash += m.reward;
        if (m.id === 1)
            player.unlockWeapon(2);
        if (m.id === 2)
            player.unlockWeapon(3);
        if (m.id === 3) {
            player.unlockWeapon(4);
            player.armor = 100;
        }
        this.events.onMissionComplete(m.id, m.reward);
        if (m.id === 4) {
            this.storyComplete = true;
            this.discount = true;
            this.missionIndex = -1;
            this.events.onStoryComplete();
            // Save AFTER storyComplete is set, so the auto-save records the
            // finished story; saving before it left a stale story=false save
            // that made Continue drop the player back into M4.
            this.events.save();
            return;
        }
        this.events.save();
        // chain into the next mission
        this.missionIndex += 1;
        this.stepIndex = 0;
        const next = this.current;
        if (next) {
            this.setupStep(player);
            this.playIntro(next);
        }
    }
    updateObjective(player) {
        const m = this.current;
        if (!m)
            return;
        const step = m.steps[this.stepIndex];
        if (!step)
            return;
        const px = player.inVehicle ? player.inVehicle.x : player.x;
        const pz = player.inVehicle ? player.inVehicle.z : player.z;
        const d = Math.hypot(step.x - px, step.z - pz);
        this.events.objective(`${m.title} - ${m.id} of 4`, step.text, d);
    }
    update(dt, player) {
        const m = this.current;
        if (!m || this.cutsceneActive)
            return;
        const step = m.steps[this.stepIndex];
        if (!step)
            return;
        const px = player.inVehicle ? player.inVehicle.x : player.x;
        const pz = player.inVehicle ? player.inVehicle.z : player.z;
        if (step.kind === 'goto') {
            const d = Math.hypot(step.x - px, step.z - pz);
            this.events.objective(`${m.title} - ${m.id} of 4`, step.text, d);
            if (d < step.radius)
                this.advance(player);
        }
        else if (step.kind === 'kill') {
            const need = step.count ?? 1;
            this.events.objective(`${m.title} - ${m.id} of 4`, `${step.text} (${Math.min(this.runtime.kills, need)}/${need})`, Math.hypot(step.x - px, step.z - pz));
            if (this.runtime.kills >= need)
                this.advance(player);
        }
        else if (step.kind === 'deliver') {
            const d = Math.hypot(step.x - px, step.z - pz);
            this.events.objective(`${m.title} - ${m.id} of 4`, step.text, d);
            if (d < step.radius) {
                if (m.id === 1) {
                    // must be in the stolen GT with at least 40% HP
                    const v = player.inVehicle;
                    if (v && this.runtime.targetVehicle === v && v.hp >= v.spec.hp * 0.4) {
                        this.advance(player);
                    }
                    else if (v && this.runtime.targetVehicle === v) {
                        this.failMission('The GT is too damaged to deliver. Voss Customs will not take it.', player);
                    }
                }
                else if (m.id === 2) {
                    const v = player.inVehicle;
                    if (v && this.runtime.targetVehicle === v)
                        this.advance(player);
                }
                else if (m.id === 3) {
                    // respray step: arriving at Voss Customs in a car completes it
                    // (the customs clear itself is a bonus that fires when needed)
                    const v = player.inVehicle;
                    if (v)
                        this.advance(player);
                }
                else if (m.id === 4) {
                    this.advance(player);
                }
            }
        }
        else if (step.kind === 'convoy') {
            this.updateConvoy(dt, player);
            const c = this.runtime.convoy;
            if (c) {
                this.events.objective(`${m.title} - ${m.id} of 4`, `${step.text} (escorts disabled ${c.disabled}/2)`, Math.hypot(c.van.x - px, c.van.z - pz));
            }
        }
        else if (step.kind === 'interact') {
            let tx = step.x;
            let tz = step.z;
            if (m.id === 3) {
                const at = this.runtime.rescueAt ?? (this.runtime.convoy ? { x: this.runtime.convoy.van.x, z: this.runtime.convoy.van.z } : null);
                if (at) {
                    tx = at.x;
                    tz = at.z;
                }
            }
            this.events.objective(`${m.title} - ${m.id} of 4`, step.text, Math.hypot(tx - px, tz - pz));
        }
    }
    updateConvoy(dt, player) {
        const c = this.runtime.convoy;
        if (!c)
            return;
        if (c.failed)
            return;
        const disabledCount = c.escorts.filter((e) => e.hp < e.spec.hp * 0.2 || e.dead).length;
        c.disabled = disabledCount;
        const vanStopped = disabledCount >= 2;
        // van crossed the bridge: Mateo is gone
        if (c.van.z < -510 && !vanStopped) {
            c.failed = true;
            this.failMission('The convoy crossed the bridge. Mateo is gone.', player);
            return;
        }
        // move the convoy along its waypoints at 42 MPH (18.8 m/s)
        const speed = 18.8;
        const moveCar = (v, tx, tz, cruise) => {
            if (v.dead)
                return;
            const want = Math.atan2(tx - v.x, tz - v.z);
            let dh = want - v.heading;
            while (dh > Math.PI)
                dh -= Math.PI * 2;
            while (dh < -Math.PI)
                dh += Math.PI * 2;
            const steer = Math.max(-1, Math.min(1, dh * 1.8));
            const throttle = v.forwardSpeed < cruise ? 1 : 0;
            v.update(dt, { throttle, steer, drift: false, brake: false }, this.city, [c.van, ...c.escorts]);
        };
        const wp = c.waypoints[c.wpIndex];
        if (!vanStopped) {
            // advance waypoint when the van gets close
            if (Math.hypot(wp.x - c.van.x, wp.z - c.van.z) < 10 && c.wpIndex < c.waypoints.length - 1) {
                c.wpIndex += 1;
            }
            const cur = c.waypoints[c.wpIndex];
            moveCar(c.van, cur.x, cur.z, speed);
            // escorts flank the van
            const ex = Math.cos(c.van.heading);
            const ez = -Math.sin(c.van.heading);
            c.escorts.forEach((e, i) => {
                const side = i === 0 ? -1 : 1;
                const tx = c.van.x + ex * side * 5 - Math.sin(c.van.heading) * 4;
                const tz = c.van.z + ez * side * 5 - Math.cos(c.van.heading) * 4;
                if (e.hp < e.spec.hp * 0.2 || e.dead) {
                    // disabled escort stops
                    e.update(dt, { throttle: 0, steer: 0, drift: false, brake: true }, this.city, [c.van, ...c.escorts]);
                }
                else {
                    moveCar(e, tx, tz, speed);
                }
            });
        }
        else {
            // both escorts down: the van stops
            c.van.update(dt, { throttle: 0, steer: 0, drift: false, brake: true }, this.city, c.escorts);
            for (const e of c.escorts) {
                e.update(dt, { throttle: 0, steer: 0, drift: false, brake: true }, this.city, [c.van, ...c.escorts]);
            }
            // remember where the van stopped: that is the rescue point
            this.runtime.rescueAt = { x: c.van.x, z: c.van.z };
            // van stopped: move to the rescue step
            if (this.current && this.current.steps[this.stepIndex].kind === 'convoy') {
                this.advance(player);
            }
        }
    }
    // Shops: armory (weapons/ammo/armor), customs (repair/respray), motel (save).
    nearestShop(px, pz) {
        for (const s of SHOPS) {
            if (Math.hypot(s.x - px, s.z - pz) < s.radius + 4)
                return s;
        }
        return null;
    }
    // Save/load. Corrupt or missing saves are ignored safely.
    saveGame(player) {
        const data = {
            v: 1,
            cash: player.cash,
            mission: this.missionIndex,
            step: this.stepIndex,
            armor: player.armor,
            health: player.health,
            x: player.x,
            z: player.z,
            story: this.storyComplete,
            weapons: player.weapons.map((w) => w.spec.unlock),
        };
        try {
            localStorage.setItem('solmar-save-v1', JSON.stringify(data));
        }
        catch {
            // storage unavailable (private mode); ignore
        }
        return JSON.stringify(data);
    }
    loadGame(player) {
        let raw = null;
        try {
            raw = localStorage.getItem('solmar-save-v1');
        }
        catch {
            return false;
        }
        if (!raw)
            return false;
        let data;
        try {
            data = JSON.parse(raw);
        }
        catch {
            return false;
        }
        if (typeof data !== 'object' || data === null || data.v !== 1)
            return false;
        if (typeof data.cash === 'number')
            player.cash = data.cash;
        if (typeof data.armor === 'number')
            player.armor = data.armor;
        if (typeof data.health === 'number')
            player.health = data.health;
        if (typeof data.x === 'number' && typeof data.z === 'number')
            player.place(data.x, data.z, 0);
        if (typeof data.story === 'boolean') {
            this.storyComplete = data.story;
            this.discount = data.story;
        }
        if (Array.isArray(data.weapons)) {
            data.weapons.forEach((u, i) => {
                if (u === 0 && player.weapons[i])
                    player.weapons[i].spec.unlock = 0;
            });
        }
        if (typeof data.mission === 'number' && data.mission >= 0) {
            this.missionIndex = data.mission;
            this.stepIndex = typeof data.step === 'number' ? data.step : 0;
        }
        return true;
    }
}
