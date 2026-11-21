// Renderer, sky, lighting, day cycle, chase camera rig with collision,
// screen shake, pooled particles and bullet tracers.
import * as THREE from 'three';
import { City, pushOutAABB } from './city.js';
import { PALETTE, clamp, lerp } from './config.js';
import { glowTexture, skyTexture } from './textures.js';

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
}

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0.32;
  private dist = 8.5;
  private trauma = 0;
  private shakeT = 0;
  private pos = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  // Mouse orbit deltas (degrees per pixel tuned by caller).
  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.0032;
    this.pitch = clamp(this.pitch + dy * 0.0028, 0.06, 1.15);
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
  }
  getYaw(): number {
    return this.yaw;
  }

  update(dt: number, target: CameraTarget, city: City, aiming: boolean): void {
    const wantDist = aiming ? 5.5 : 8.5;
    this.dist = lerp(this.dist, wantDist, Math.min(1, dt * 4));
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const cx = target.x - sin * Math.cos(this.pitch) * this.dist;
    const cz = target.z - cos * Math.cos(this.pitch) * this.dist;
    const cy = target.y + 1.6 + Math.sin(this.pitch) * this.dist;
    this.desired.set(cx, Math.max(cy, 1.4), cz);
    // collision: pull the camera out of any building it sits inside
    for (const b of city.colliders) {
      const m = 0.6;
      if (this.desired.x > b.minX - m && this.desired.x < b.maxX + m && this.desired.z > b.minZ - m && this.desired.z < b.maxZ + m) {
        const p = pushOutAABB(this.desired.x, this.desired.z, m, b);
        this.desired.x = p.x;
        this.desired.z = p.z;
      }
    }
    const k = 1 - Math.exp(-dt * 9);
    this.pos.lerp(this.desired, k);
    if (this.pos.lengthSq() === 0) this.pos.copy(this.desired);
    // trauma shake (summed sines, decays in real time)
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.shakeT += dt * 31;
    const s = this.trauma * this.trauma;
    const ox = 0.5 * s * Math.sin(this.shakeT * 1.7);
    const oy = 0.35 * s * Math.sin(this.shakeT * 2.3);
    this.camera.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z);
    this.tmp.set(target.x, target.y + 1.7, target.z);
    this.camera.lookAt(this.tmp);
    // FOV widens with speed
    const wantFov = 68 + clamp(Math.abs(target.speed) / 55, 0, 1) * 12 + (aiming ? -6 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, wantFov, Math.min(1, dt * 5));
      this.camera.updateProjectionMatrix();
    }
  }

  // Instant snap (cutscenes, teleports).
  snap(target: CameraTarget): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.pos.set(
      target.x - sin * Math.cos(this.pitch) * this.dist,
      target.y + 1.6 + Math.sin(this.pitch) * this.dist,
      target.z - cos * Math.cos(this.pitch) * this.dist,
    );
    this.camera.position.copy(this.pos);
    this.tmp.set(target.x, target.y + 1.7, target.z);
    this.camera.lookAt(this.tmp);
  }
}

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
  drag: number;
}

const MAX_PARTICLES = 900;

export class Particles {
  private points: THREE.Points;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private pool: Particle[] = [];
  private geo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const size = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pos[i * 3 + 1] = -100;
      this.pool.push({ alive: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, r: 1, g: 1, b: 1, gravity: 0, drag: 0 });
    }
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.colAttr = new THREE.BufferAttribute(col, 3);
    this.sizeAttr = new THREE.BufferAttribute(size, 1);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.geo.setAttribute('psize', this.sizeAttr);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float psize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d) * 0.85;
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, gravity = 0, drag = 0): void {
    for (const p of this.pool) {
      if (p.alive) continue;
      p.alive = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.life = life; p.maxLife = life;
      p.size = size; p.r = r; p.g = g; p.b = b;
      p.gravity = gravity; p.drag = drag;
      return;
    }
  }

  burst(x: number, y: number, z: number, n: number, speed: number, life: number, size: number, r: number, g: number, b: number, gravity = -4): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + speed * 0.4, Math.sin(a) * Math.cos(e) * s, life * (0.6 + Math.random() * 0.7), size, r, g, b, gravity, 1.5);
    }
  }

  smoke(x: number, y: number, z: number): void {
    this.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 1.6, 2.2, 0.25, 0.25, 0.25, 1.2, 0.4);
  }

  update(dt: number): void {
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    const size = this.sizeAttr.array as Float32Array;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.alive) {
        pos[i * 3 + 1] = -100;
        size[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        pos[i * 3 + 1] = -100;
        size[i] = 0;
        continue;
      }
      const dragF = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragF;
      p.vz *= dragF;
      p.vy = p.vy * dragF + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const f = p.life / p.maxLife;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r;
      col[i * 3 + 1] = p.g;
      col[i * 3 + 2] = p.b;
      size[i] = p.size * (0.5 + f * 0.5);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }
}

const MAX_TRACERS = 24;

export class Tracers {
  private lines: THREE.LineSegments;
  private posAttr: THREE.BufferAttribute;
  private life: number[] = [];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_TRACERS * 6);
    for (let i = 0; i < MAX_TRACERS; i++) {
      pos[i * 6 + 1] = -100;
      pos[i * 6 + 4] = -100;
      this.life.push(0);
    }
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    geo.setAttribute('position', this.posAttr);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  fire(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void {
    let slot = -1;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.life[i] <= 0) { slot = i; break; }
    }
    if (slot < 0) slot = 0;
    const pos = this.posAttr.array as Float32Array;
    pos[slot * 6] = x1; pos[slot * 6 + 1] = y1; pos[slot * 6 + 2] = z1;
    pos[slot * 6 + 3] = x2; pos[slot * 6 + 4] = y2; pos[slot * 6 + 5] = z2;
    this.life[slot] = 0.09;
    this.posAttr.needsUpdate = true;
  }

  update(dt: number): void {
    let dirty = false;
    const pos = this.posAttr.array as Float32Array;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          pos[i * 6 + 1] = -100;
          pos[i * 6 + 4] = -100;
          dirty = true;
        }
      }
    }
    if (dirty) this.posAttr.needsUpdate = true;
  }
}

export type Quality = 'low' | 'medium' | 'high';

export class RenderWorld {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  particles: Particles;
  tracers: Tracers;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sunSprite: THREE.Sprite;
  private skyMat: THREE.MeshBasicMaterial;
  private timeOfDay = 0.62; // 0 dawn, 0.5 noon, 0.62 golden sunset, 1 night
  private quality: Quality = 'high';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.fog, 180, 1150);
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2600);
    this.rig = new CameraRig(this.camera);
    // sky dome
    const skyGeo = new THREE.SphereGeometry(2400, 24, 16);
    this.skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(sky);
    // sun sprite
    const sunMat = new THREE.SpriteMaterial({ map: glowTexture(), color: PALETTE.sun, fog: false, depthWrite: false, transparent: true });
    this.sunSprite = new THREE.Sprite(sunMat);
    this.sunSprite.scale.set(320, 320, 1);
    this.scene.add(this.sunSprite);
    // lights
    this.hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a2a3a, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffb347, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -90;
    this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90;
    this.sun.shadow.camera.bottom = -90;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.particles = new Particles(this.scene);
    this.tracers = new Tracers(this.scene);
    this.applyTimeOfDay();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, q === 'medium' ? 1.5 : 2));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
  }
  getQuality(): Quality {
    return this.quality;
  }

  setTimeOfDay(t: number): void {
    this.timeOfDay = clamp(t, 0, 1);
    this.applyTimeOfDay();
  }
  getTimeOfDay(): number {
    return this.timeOfDay;
  }

  private applyTimeOfDay(): void {
    const t = this.timeOfDay;
    // sun elevation: high at noon (0.5), low at golden hour (0.62), below horizon at night
    const elev = Math.sin((0.5 - Math.abs(t - 0.5)) * Math.PI) * 0.9 + 0.08;
    const az = lerp(-0.6, 0.9, t);
    const dist = 420;
    this.sun.position.set(Math.sin(az) * dist * Math.cos(elev), Math.sin(elev) * dist, -Math.cos(az) * dist * Math.cos(elev));
    this.sunSprite.position.set(Math.sin(az) * 2100, Math.max(60, Math.sin(elev) * 2100), -Math.cos(az) * 2100);
    const warm = t > 0.55 && t < 0.75 ? 1 : 0.55;
    this.sun.color.setHex(warm > 0.8 ? 0xffb347 : 0xfff2d8);
    this.sun.intensity = t > 0.85 ? 0.25 : 2.2;
    this.hemi.intensity = t > 0.85 ? 0.35 : 0.85;
    const fogColor = t > 0.85 ? 0x1a2233 : t > 0.55 && t < 0.75 ? 0xe89a6a : 0xa8c8e8;
    this.scene.fog!.color.setHex(fogColor);
  }

  followSun(px: number, pz: number): void {
    this.sun.position.x += px;
    this.sun.position.z += pz;
    this.sun.target.position.set(px, 0, pz);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
