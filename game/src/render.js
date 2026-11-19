// Renderer and camera: WebGL setup, a spring-damped third-person orbit
// camera with collision pull-in, trauma-based screen shake (summed sines,
// never random per frame), FOV speed effect, and a pooled particle system.
import * as THREE from 'three';
import { clamp, lerp } from './config.js';
import { Rng } from './rng.js';
export class Renderer {
    constructor(canvas, lowFx = false) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowFx, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(lowFx ? 1 : Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = !lowFx;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 6000);
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }
    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
export class CameraRig {
    constructor() {
        this.yaw = 0;
        this.pitch = 0.32;
        this.distance = 7.5;
        this.targetDistance = 7.5;
        this.trauma = 0;
        this.shakeT = 0;
        this.fov = 68;
        this.currentPos = new THREE.Vector3();
        this.currentLook = new THREE.Vector3();
        this.cutsceneActive = false;
        this.cutFrom = new THREE.Vector3();
        this.cutTo = new THREE.Vector3();
        this.cutLookFrom = new THREE.Vector3();
        this.cutLookTo = new THREE.Vector3();
        this.cutT = 0;
        this.cutDur = 1;
    }
    addTrauma(amount) {
        this.trauma = clamp(this.trauma + amount, 0, 1);
    }
    setCutscene(from, to, lookFrom, lookTo, dur) {
        this.cutsceneActive = true;
        this.cutFrom.copy(from);
        this.cutTo.copy(to);
        this.cutLookFrom.copy(lookFrom);
        this.cutLookTo.copy(lookTo);
        this.cutT = 0;
        this.cutDur = Math.max(0.5, dur);
    }
    endCutscene() {
        this.cutsceneActive = false;
    }
    isCutscene() {
        return this.cutsceneActive;
    }
    update(dt, target, speed, city, camera, aiming) {
        const realDt = dt;
        if (this.trauma > 0) {
            this.trauma = Math.max(0, this.trauma - 1.4 * realDt);
            this.shakeT += realDt * 31;
        }
        const wantFov = aiming ? 58 : 68 + clamp(speed / 50, 0, 1) * 12;
        this.fov = lerp(this.fov, wantFov, 1 - Math.exp(-6 * dt));
        if (Math.abs(camera.fov - this.fov) > 0.05) {
            camera.fov = this.fov;
            camera.updateProjectionMatrix();
        }
        this.targetDistance = aiming ? 4.2 : 7.5;
        // While aiming, ease the camera toward level so the crosshair sits
        // near the bullet line instead of pointing at the ground ahead.
        if (aiming)
            this.pitch = lerp(this.pitch, 0.12, 1 - Math.exp(-6 * dt));
        if (this.cutsceneActive) {
            this.cutT += dt;
            const t = clamp(this.cutT / this.cutDur, 0, 1);
            const e = t * t * (3 - 2 * t);
            const pos = new THREE.Vector3().lerpVectors(this.cutFrom, this.cutTo, e);
            const look = new THREE.Vector3().lerpVectors(this.cutLookFrom, this.cutLookTo, e);
            this.applyShake(camera, pos, look);
            return;
        }
        // Spring-damped distance: pull in fast, ease out slow.
        const rate = this.distance > this.targetDistance ? 14 : 5;
        this.distance = lerp(this.distance, this.targetDistance, 1 - Math.exp(-rate * dt));
        const lookTarget = new THREE.Vector3(target.x, target.y + 1.7, target.z);
        const sinP = Math.sin(this.pitch);
        const cosP = Math.cos(this.pitch);
        const offset = new THREE.Vector3(-Math.sin(this.yaw) * cosP, sinP, -Math.cos(this.yaw) * cosP);
        let dist = this.distance;
        // Collision pull-in: step the camera ray back until it clears buildings.
        const dir = offset.clone().normalize();
        for (let d = dist; d > 1.2; d -= 0.6) {
            const p = new THREE.Vector3().copy(lookTarget).addScaledVector(dir, d);
            if (p.y < 0.6) {
                dist = d;
                break;
            }
            if (city.collidesCircle(p.x, p.z, 0.4)) {
                dist = Math.max(1.2, d - 0.6);
                break;
            }
        }
        const desired = new THREE.Vector3().copy(lookTarget).addScaledVector(dir, dist);
        if (desired.y < 0.7)
            desired.y = 0.7;
        const k = 1 - Math.exp(-18 * dt);
        this.currentPos.lerp(desired, k);
        this.currentLook.lerp(lookTarget, 1 - Math.exp(-22 * dt));
        this.applyShake(camera, this.currentPos, this.currentLook);
    }
    applyShake(camera, pos, look) {
        const s = this.trauma * this.trauma;
        const ox = 0.35 * s * Math.sin(this.shakeT * 1.7);
        const oy = 0.28 * s * Math.sin(this.shakeT * 2.3);
        const oz = 0.35 * s * Math.sin(this.shakeT * 1.1);
        camera.position.set(pos.x + ox, pos.y + oy, pos.z + oz);
        camera.lookAt(look);
    }
    snapTo(target) {
        const lookTarget = new THREE.Vector3(target.x, target.y + 1.7, target.z);
        const sinP = Math.sin(this.pitch);
        const cosP = Math.cos(this.pitch);
        this.currentPos.set(lookTarget.x - Math.sin(this.yaw) * cosP * this.distance, lookTarget.y + sinP * this.distance, lookTarget.z - Math.cos(this.yaw) * cosP * this.distance);
        this.currentLook.copy(lookTarget);
    }
}
// Pooled point particles: sparks, smoke puffs, blood hits, explosion debris.
// One THREE.Points draw call, fixed capacity, recycled slots.
export class Particles {
    constructor(scene) {
        this.capacity = 700;
        this.rng = new Rng(987654321);
        this.head = 0;
        this.positions = new Float32Array(this.capacity * 3);
        this.colors = new Float32Array(this.capacity * 3);
        this.vel = new Float32Array(this.capacity * 3);
        this.life = new Float32Array(this.capacity);
        this.maxLife = new Float32Array(this.capacity);
        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        const mat = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
        this.points = new THREE.Points(this.geo, mat);
        this.points.frustumCulled = false;
        for (let i = 0; i < this.capacity; i++)
            this.positions[i * 3 + 1] = -100;
        scene.add(this.points);
    }
    spawn(x, y, z, vx, vy, vz, life, r, g, b) {
        const i = this.head;
        this.head = (this.head + 1) % this.capacity;
        this.positions[i * 3] = x;
        this.positions[i * 3 + 1] = y;
        this.positions[i * 3 + 2] = z;
        this.vel[i * 3] = vx;
        this.vel[i * 3 + 1] = vy;
        this.vel[i * 3 + 2] = vz;
        this.colors[i * 3] = r;
        this.colors[i * 3 + 1] = g;
        this.colors[i * 3 + 2] = b;
        this.life[i] = life;
        this.maxLife[i] = life;
    }
    burst(pos, count, speed, life, r, g, b, up = 0.5) {
        for (let i = 0; i < count; i++) {
            const a = this.rng.next() * Math.PI * 2;
            const s = speed * (0.3 + this.rng.next() * 0.7);
            this.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s, up * speed * this.rng.next(), Math.sin(a) * s, life * (0.6 + this.rng.next() * 0.7), r, g, b);
        }
    }
    update(dt) {
        for (let i = 0; i < this.capacity; i++) {
            if (this.life[i] <= 0)
                continue;
            this.life[i] -= dt;
            if (this.life[i] <= 0) {
                this.positions[i * 3 + 1] = -100;
                continue;
            }
            this.vel[i * 3 + 1] -= 6 * dt;
            this.positions[i * 3] += this.vel[i * 3] * dt;
            this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
            this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        }
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate = true;
    }
}
