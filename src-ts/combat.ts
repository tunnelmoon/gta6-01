// Combat: player weapons with ammo, hitscan shooting with building
// blocking, pooled tracers and muzzle flash, melee, and enemy gunmen with
// cover-seeking AI. Enemies are simple articulated humanoids.
import * as THREE from 'three';
import { WEAPONS, WeaponDef, clamp } from './config.js';
import { City } from './city.js';
import { Particles } from './render.js';
import { Rng } from './rng.js';
import { Vehicle } from './vehicles.js';

export interface Enemy {
  id: number;
  group: THREE.Group;
  pos: THREE.Vector3;
  heading: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  deadT: number;
  state: 'idle' | 'combat' | 'cover';
  cover: { x: number; z: number } | null;
  shootCd: number;
  moveCd: number;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armR: THREE.Mesh;
  faction: 'syndicate' | 'swat' | 'guard';
  walkPhase: number;
}

interface Tracer {
  line: THREE.Line;
  life: number;
}

export class Combat {
  enemies: Enemy[] = [];
  unlocked = new Set<string>(['melee']);
  current = 'melee';
  ammo = new Map<string, { clip: number; reserve: number }>();
  onEnemyKilled: ((e: Enemy) => void) | null = null;
  onPlayerDamage: ((amount: number, from: THREE.Vector3) => void) | null = null;
  onShotFired: ((kind: string) => void) | null = null;
  private scene: THREE.Scene;
  private city: City;
  private particles: Particles;
  private rng: Rng;
  private tracers: Tracer[] = [];
  private flash: THREE.PointLight;
  private flashT = 0;
  private fireCd = 0;
  private reloadT = 0;
  private nextEnemyId = 1;

  constructor(scene: THREE.Scene, city: City, particles: Particles, seed: number) {
    this.scene = scene;
    this.city = city;
    this.particles = particles;
    this.rng = new Rng(seed);
    for (const w of WEAPONS) this.ammo.set(w.id, { clip: w.mag, reserve: w.id === 'melee' ? 0 : w.maxReserve });
    this.flash = new THREE.PointLight(0xffc46b, 0, 18, 1.8);
    this.scene.add(this.flash);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo.clone(), mat);
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
  }

  weaponDef(id: string): WeaponDef {
    return WEAPONS.find((w) => w.id === id)!;
  }

  unlock(id: string): void {
    this.unlocked.add(id);
    // A newly earned weapon is equipped at once, so the player never has
    // to hunt for the key in the middle of a firefight.
    this.select(id);
  }

  select(id: string): boolean {
    if (!this.unlocked.has(id)) return false;
    this.current = id;
    return true;
  }

  getAmmo(id: string): { clip: number; reserve: number } {
    return this.ammo.get(id)!;
  }

  addAmmo(id: string, amount: number): void {
    const a = this.ammo.get(id)!;
    const def = this.weaponDef(id);
    a.reserve = Math.min(def.maxReserve, a.reserve + amount);
  }

  startReload(): void {
    const def = this.weaponDef(this.current);
    const a = this.ammo.get(this.current)!;
    if (def.mag === 0 || a.clip >= def.mag || a.reserve <= 0 || this.reloadT > 0) return;
    this.reloadT = 1.1;
  }

  isReloading(): boolean {
    return this.reloadT > 0;
  }

  private buildHumanoid(shirt: number, pants: number, vest: number | null): { group: THREE.Group; legL: THREE.Mesh; legR: THREE.Mesh; armR: THREE.Mesh } {
    const g = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.28), shirtMat);
    torso.position.y = 1.18;
    torso.castShadow = true;
    g.add(torso);
    if (vest !== null) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: vest, roughness: 0.8 }));
      v.position.y = 1.22;
      g.add(v);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.27, 0.25), skinMat);
    head.position.y = 1.66;
    head.castShadow = true;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.27), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
    cap.position.y = 1.82;
    g.add(cap);
    const mkLimb = (x: number, y: number, w: number, h: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), mat);
      m.position.set(x, y, 0);
      m.geometry.translate(0, -h / 2 + 0.05, 0);
      g.add(m);
      return m;
    };
    const legL = mkLimb(-0.13, 0.85, 0.17, 0.8, pantsMat);
    const legR = mkLimb(0.13, 0.85, 0.17, 0.8, pantsMat);
    mkLimb(-0.31, 1.42, 0.12, 0.55, shirtMat);
    const armR = mkLimb(0.31, 1.42, 0.12, 0.55, shirtMat);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.5 }));
    gun.position.set(0.31, 1.05, 0.25);
    g.add(gun);
    return { group: g, legL, legR, armR };
  }

  spawnEnemy(x: number, z: number, hp: number, faction: 'syndicate' | 'swat' | 'guard'): Enemy {
    const colors = faction === 'syndicate'
      ? { shirt: 0x2a2a2e, pants: 0x1c1c20, vest: 0x5a1a1a }
      : faction === 'swat'
        ? { shirt: 0x1c2a4a, pants: 0x141c30, vest: 0x0e1420 }
        : { shirt: 0x3a3a3a, pants: 0x222222, vest: null };
    const { group, legL, legR, armR } = this.buildHumanoid(colors.shirt, colors.pants, colors.vest);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const e: Enemy = {
      id: this.nextEnemyId++, group, pos: new THREE.Vector3(x, 0, z), heading: 0, hp, maxHp: hp,
      alive: true, deadT: 0, state: 'idle', cover: null, shootCd: this.rng.range(0.5, 1.5),
      moveCd: 0, legL, legR, armR, faction, walkPhase: this.rng.range(0, 6),
    };
    this.enemies.push(e);
    return e;
  }

  removeEnemy(e: Enemy): void {
    this.scene.remove(e.group);
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  clearEnemies(): void {
    for (const e of [...this.enemies]) this.removeEnemy(e);
  }

  // Ray vs building AABBs in 2D (buildings are taller than any shot line).
  private blockedByBuilding(from: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
    const steps = Math.ceil(maxDist / 1.5);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxDist;
      const x = from.x + dir.x * t;
      const z = from.z + dir.z * t;
      if (this.city.collidesCircle(x, z, 0.2)) return t;
    }
    return maxDist;
  }

  private raySphere(from: THREE.Vector3, dir: THREE.Vector3, center: THREE.Vector3, radius: number, maxDist: number): number | null {
    const ox = center.x - from.x;
    const oy = center.y - from.y;
    const oz = center.z - from.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0 || tca > maxDist) return null;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    if (d2 > radius * radius) return null;
    return tca - Math.sqrt(radius * radius - d2);
  }

  // Aim point for third-person shooting: the first thing the camera ray
  // hits (enemy, building, or a far fallback), so shots from the muzzle
  // converge on the crosshair instead of flying parallel to the camera.
  traceAim(from: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { point: THREE.Vector3; dist: number; enemy: Enemy | null } {
    const blockDist = this.blockedByBuilding(from, dir, maxDist);
    let best: Enemy | null = null;
    let bestT = blockDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const center = e.pos.clone();
      center.y = 1.2;
      const t = this.raySphere(from, dir, center, 0.55, maxDist);
      if (t !== null && t < bestT) {
        bestT = t;
        best = e;
      }
    }
    return { point: from.clone().addScaledVector(dir, bestT), dist: bestT, enemy: best };
  }

  // Hitscan shot. Returns the enemy hit, if any.
  fire(from: THREE.Vector3, dir: THREE.Vector3, shooterPos: THREE.Vector3, canHitPlayer: boolean): Enemy | null {
    const def = this.weaponDef(this.current);
    if (this.reloadT > 0 || this.fireCd > 0) return null;
    if (def.mag > 0) {
      const a = this.ammo.get(this.current)!;
      if (a.clip <= 0) {
        this.startReload();
        return null;
      }
      a.clip--;
    }
    this.fireCd = 1 / def.fireRate;
    const spread = this.current === 'viper' ? 0.03 : this.current === 'bulldog' ? 0.012 : 0.02;
    const d = dir.clone();
    d.x += (this.rng.next() - 0.5) * spread * 2;
    d.y += (this.rng.next() - 0.5) * spread * 2;
    d.z += (this.rng.next() - 0.5) * spread * 2;
    d.normalize();
    const blockDist = this.blockedByBuilding(from, d, def.range);
    let best: Enemy | null = null;
    let bestT = blockDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const center = e.pos.clone();
      center.y = 1.2;
      const t = this.raySphere(from, d, center, 0.55, def.range);
      if (t !== null && t < bestT) {
        bestT = t;
        best = e;
      }
    }
    const end = from.clone().addScaledVector(d, bestT);
    this.showTracer(from, end);
    this.muzzle(from);
    if (this.onShotFired) this.onShotFired(this.current);
    if (best) {
      this.damageEnemy(best, def.damage, shooterPos);
      this.particles.burst(end, 6, 3, 0.4, 1, 0.3, 0.3);
    } else if (bestT < def.range) {
      this.particles.burst(end, 4, 2, 0.3, 0.9, 0.8, 0.5);
    }
    void canHitPlayer;
    return best;
  }

  meleeAttack(from: THREE.Vector3, heading: number): Enemy | null {
    if (this.fireCd > 0) return null;
    this.fireCd = 0.45;
    let best: Enemy | null = null;
    let bestD = 2.4;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - from.x;
      const dz = e.pos.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.4) continue;
      const ang = Math.atan2(dx, dz);
      let diff = ang - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 1.1 && dist < bestD) {
        bestD = dist;
        best = e;
      }
    }
    if (best) this.damageEnemy(best, 18, from);
    return best;
  }

  damageEnemy(e: Enemy, amount: number, from: THREE.Vector3): void {
    if (!e.alive) return;
    e.hp -= amount;
    e.state = 'combat';
    if (e.hp <= 0) {
      e.alive = false;
      e.deadT = 0;
      e.group.rotation.x = -Math.PI / 2;
      e.group.position.y = 0.25;
      this.particles.burst(e.pos.clone().setY(1.2), 12, 4, 0.6, 0.9, 0.2, 0.2);
      if (this.onEnemyKilled) this.onEnemyKilled(e);
    } else {
      // Flinch toward the shooter.
      e.heading = Math.atan2(from.x - e.pos.x, from.z - e.pos.z);
    }
  }

  // Police shot at the player: tracer from the cruiser, damage chance.
  policeShot(from: THREE.Vector3, to: THREE.Vector3): void {
    this.showTracer(from, to);
    this.muzzle(from);
    if (this.rng.next() < 0.3 && this.onPlayerDamage) {
      this.onPlayerDamage(6, from);
    }
  }

  private showTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
    const pos = t.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    (t.line.material as THREE.LineBasicMaterial).opacity = 0.9;
    t.line.visible = true;
    t.life = 0.07;
  }

  private muzzle(pos: THREE.Vector3): void {
    this.flash.position.copy(pos);
    this.flash.intensity = 14;
    this.flashT = 0.05;
    this.particles.burst(pos, 5, 2.5, 0.15, 1, 0.75, 0.3);
  }

  // Enemy shot at the player: tracer + damage through a callback so the
  // game can apply armor, shake and wanted heat.
  enemyShoot(e: Enemy, target: THREE.Vector3): void {
    const from = e.pos.clone();
    from.y = 1.4;
    const dir = target.clone().sub(from).normalize();
    const blockDist = this.blockedByBuilding(from, dir, 60);
    const dist = from.distanceTo(target);
    if (blockDist < dist - 1) {
      // Shot hits a wall: spark at the block point.
      const end = from.clone().addScaledVector(dir, blockDist);
      this.showTracer(from, end);
      this.particles.burst(end, 3, 2, 0.3, 0.9, 0.8, 0.5);
      return;
    }
    this.showTracer(from, target);
    this.muzzle(from);
    // Inaccuracy: 55% hit at close range, less far away.
    const hitChance = clamp(0.75 - dist / 120, 0.2, 0.75);
    if (this.rng.next() < hitChance && this.onPlayerDamage) {
      this.onPlayerDamage(e.faction === 'swat' ? 12 : 8, from);
    }
  }

  private findCover(e: Enemy, threat: THREE.Vector3): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestScore = Infinity;
    for (const c of this.city.colliders) {
      const corners = [
        { x: c.minX - 1.5, z: c.minZ - 1.5 }, { x: c.maxX + 1.5, z: c.minZ - 1.5 },
        { x: c.minX - 1.5, z: c.maxZ + 1.5 }, { x: c.maxX + 1.5, z: c.maxZ + 1.5 },
      ];
      for (const p of corners) {
        const dE = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
        const dT = Math.hypot(p.x - threat.x, p.z - threat.z);
        if (dE > 45 || dT < 8) continue;
        const score = dE + Math.abs(dT - 22);
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
    }
    return best;
  }

  update(dt: number, playerPos: THREE.Vector3, playerAlive: boolean): void {
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const def = this.weaponDef(this.current);
        const a = this.ammo.get(this.current)!;
        const need = def.mag - a.clip;
        const take = Math.min(need, a.reserve);
        a.clip += take;
        a.reserve -= take;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const e of [...this.enemies]) {
      if (!e.alive) {
        e.deadT += dt;
        if (e.deadT > 9) this.removeEnemy(e);
        continue;
      }
      const dist = Math.hypot(e.pos.x - playerPos.x, e.pos.z - playerPos.z);
      if (playerAlive && dist < 55) e.state = 'combat';
      e.shootCd -= dt;
      e.moveCd -= dt;
      if (e.state === 'combat' && playerAlive) {
        // Seek cover once, then shoot from it.
        if (!e.cover && e.moveCd <= 0) {
          e.cover = this.findCover(e, playerPos);
          e.moveCd = 6;
        }
        let moving = false;
        if (e.cover) {
          const cd = Math.hypot(e.cover.x - e.pos.x, e.cover.z - e.pos.z);
          if (cd > 2) {
            const ang = Math.atan2(e.cover.x - e.pos.x, e.cover.z - e.pos.z);
            e.heading = ang;
            e.pos.x += Math.sin(ang) * 4.2 * dt;
            e.pos.z += Math.cos(ang) * 4.2 * dt;
            this.city.resolveCircle(e.pos, 0.45);
            moving = true;
          }
        }
        // Face and shoot the player.
        e.heading = Math.atan2(playerPos.x - e.pos.x, playerPos.z - e.pos.z);
        if (dist < 48 && e.shootCd <= 0 && this.hasLineOfSight(e.pos, playerPos)) {
          const aim = playerPos.clone();
          aim.y = 1.3;
          this.enemyShoot(e, aim);
          e.shootCd = this.rng.range(0.9, 1.7);
        }
        e.walkPhase += dt * (moving ? 9 : 0);
        const swing = Math.sin(e.walkPhase) * 0.5;
        e.legL.rotation.x = moving ? swing : 0;
        e.legR.rotation.x = moving ? -swing : 0;
        e.armR.rotation.x = -1.2;
      } else {
        e.armR.rotation.x = 0;
      }
      e.group.position.copy(e.pos);
      e.group.rotation.y = e.heading;
    }
  }

  private hasLineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = 8;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (this.city.collidesCircle(x, z, 0.3)) return false;
    }
    return true;
  }
}
