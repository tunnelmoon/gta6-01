// Solmar city: ground, roads, buildings, landmarks, props, collision
// AABBs and the road graph traffic follows. Everything is placed from a
// seeded RNG, so a fixed seed builds the same city every time.
import * as THREE from 'three';
import { Rng } from './rng.js';
import { DISTRICTS, ISLAND_ROADS_X, ISLAND_ROADS_Z, MAIN_ROADS_X, MAIN_ROADS_Z, WORLD, clamp, isWater } from './config.js';
import { asphaltTexture, facadeTexture, glassTexture, neonTexture, sandTexture, sidewalkTexture, waterTexture } from './textures.js';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface GraphNode {
  x: number;
  z: number;
  links: number[];
}

// Push a circle (x, z, radius) out of an AABB. Returns corrected position.
export function pushOutAABB(x: number, z: number, r: number, b: AABB): { x: number; z: number } {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return { x, z };
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
  }
  // center inside the box: push out along the smallest penetration axis
  const pl = x - (b.minX - r);
  const pr = b.maxX + r - x;
  const pn = z - (b.minZ - r);
  const ps = b.maxZ + r - z;
  const m = Math.min(pl, pr, pn, ps);
  if (m === pl) return { x: b.minX - r, z };
  if (m === pr) return { x: b.maxX + r, z };
  if (m === pn) return { x, z: b.minZ - r };
  return { x, z: b.maxZ + r };
}

// 2D segment vs AABB test (slab method), for line of sight.
export function segmentHitsAABB(x1: number, z1: number, x2: number, z2: number, b: AABB): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < b.minX || x1 > b.maxX) return false;
  } else {
    let t1 = (b.minX - x1) / dx;
    let t2 = (b.maxX - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z1 < b.minZ || z1 > b.maxZ) return false;
  } else {
    let t1 = (b.minZ - z1) / dz;
    let t2 = (b.maxZ - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// Merge several translated plane/box geometries into one BufferGeometry.
function mergeGeoms(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let posCount = 0;
  let idxCount = 0;
  for (const g of geoms) {
    posCount += g.attributes.position.count;
    idxCount += g.index ? g.index.count : 0;
  }
  const pos = new Float32Array(posCount * 3);
  const nor = new Float32Array(posCount * 3);
  const uv = new Float32Array(posCount * 2);
  const idx = new Uint32Array(idxCount);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(n.array as Float32Array, vo * 3);
    uv.set(u.array as Float32Array, vo * 2);
    if (g.index) {
      const ia = g.index.array as Uint32Array | Uint16Array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      io += ia.length;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function roadPlane(x1: number, z1: number, x2: number, z2: number, width: number, y: number): THREE.BufferGeometry {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const g = new THREE.PlaneGeometry(width, len);
  // UV repeat: one texture tile per 22 m of road
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 22));
  g.rotateX(-Math.PI / 2);
  const ang = Math.atan2(x2 - x1, z2 - z1);
  g.rotateY(ang);
  g.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
  return g;
}

interface Exclusion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class City {
  colliders: AABB[] = [];
  graph: GraphNode[] = [];
  private rng: Rng;

  constructor(scene: THREE.Scene, seed = 1) {
    this.rng = new Rng(seed);
    const rng = this.rng;
    const asphalt = asphaltTexture(rng);
    const sidewalk = sidewalkTexture(rng);
    const sand = sandTexture(rng);
    const water = waterTexture(rng);

    // ---- ground: sidewalk-colored mainland + island, sand beaches ----
    const groundMat = new THREE.MeshStandardMaterial({ map: sidewalk, color: 0x9a9484, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1720, 1300), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 210);
    ground.receiveShadow = true;
    scene.add(ground);
    const island = new THREE.Mesh(new THREE.PlaneGeometry(620, 450), groundMat);
    island.rotation.x = -Math.PI / 2;
    island.position.set(50, 0, -730);
    island.receiveShadow = true;
    scene.add(island);
    // beaches
    const sandMat = new THREE.MeshStandardMaterial({ map: sand, color: 0xd9b380, roughness: 1 });
    const beachE = new THREE.Mesh(new THREE.PlaneGeometry(40, 1300), sandMat);
    beachE.rotation.x = -Math.PI / 2;
    beachE.position.set(845, 0.01, 210);
    scene.add(beachE);
    const beachS = new THREE.Mesh(new THREE.PlaneGeometry(1720, 40), sandMat);
    beachS.rotation.x = -Math.PI / 2;
    beachS.position.set(0, 0.01, 845);
    scene.add(beachS);
    // ocean
    const waterMat = new THREE.MeshStandardMaterial({ map: water, color: 0x2a8a96, roughness: 0.25, metalness: 0.1 });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), waterMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.6, -50);
    scene.add(ocean);

    // ---- roads (merged into one mesh) ----
    const roadGeoms: THREE.BufferGeometry[] = [];
    const addRoad = (x1: number, z1: number, x2: number, z2: number) => {
      roadGeoms.push(roadPlane(x1, z1, x2, z2, WORLD.roadWidth, 0.03));
    };
    for (const x of MAIN_ROADS_X) addRoad(x, -420, x, 845);
    for (const z of MAIN_ROADS_Z) addRoad(-845, z, 845, z);
    for (const x of ISLAND_ROADS_X) addRoad(x, -940, x, -530);
    for (const z of ISLAND_ROADS_Z) addRoad(-240, z, 340, z);
    // Coastal Bridge deck (causeway over the channel)
    addRoad(0, -430, 0, -510);
    const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 });
    const roads = new THREE.Mesh(mergeGeoms(roadGeoms), roadMat);
    roads.receiveShadow = true;
    scene.add(roads);

    // ---- road graph ----
    const nodeIndex = new Map<string, number>();
    const addNode = (x: number, z: number): number => {
      const key = `${x},${z}`;
      const hit = nodeIndex.get(key);
      if (hit !== undefined) return hit;
      const id = this.graph.length;
      this.graph.push({ x, z, links: [] });
      nodeIndex.set(key, id);
      return id;
    };
    const link = (a: number, b: number) => {
      if (!this.graph[a].links.includes(b)) this.graph[a].links.push(b);
      if (!this.graph[b].links.includes(a)) this.graph[b].links.push(a);
    };
    for (const x of MAIN_ROADS_X) {
      let prev = -1;
      for (const z of MAIN_ROADS_Z) {
        const id = addNode(x, z);
        if (prev >= 0) link(prev, id);
        prev = id;
      }
    }
    for (const z of MAIN_ROADS_Z) {
      let prev = -1;
      for (const x of MAIN_ROADS_X) {
        const id = addNode(x, z);
        if (prev >= 0) link(prev, id);
        prev = id;
      }
    }
    // bridge chain: (0,-360) -> (0,-410) -> (0,-430) -> (0,-470) -> (0,-510) -> (0,-600)
    const b0 = addNode(0, -360);
    const b1 = addNode(0, -410);
    const b2 = addNode(0, -430);
    const b3 = addNode(0, -470);
    const b4 = addNode(0, -510);
    const b5 = addNode(0, -600);
    link(b0, b1); link(b1, b2); link(b2, b3); link(b3, b4); link(b4, b5);
    for (const x of ISLAND_ROADS_X) {
      let prev = -1;
      for (const z of ISLAND_ROADS_Z) {
        const id = addNode(x, z);
        if (prev >= 0) link(prev, id);
        prev = id;
      }
    }
    for (const z of ISLAND_ROADS_Z) {
      let prev = -1;
      for (const x of ISLAND_ROADS_X) {
        const id = addNode(x, z);
        if (prev >= 0) link(prev, id);
        prev = id;
      }
    }

    // ---- buildings (instanced by facade type) ----
    const exclusions: Exclusion[] = [
      { minX: -45, maxX: 45, minZ: -45, maxZ: 45 }, // Central Plaza
      { minX: -565, maxX: -515, minZ: 55, maxZ: 105 }, // El Faro
      { minX: -485, maxX: -435, minZ: -165, maxZ: -115 }, // Voss Customs
      { minX: 85, maxX: 135, minZ: -85, maxZ: -35 }, // SMPD HQ
      { minX: -145, maxX: -95, minZ: 55, maxZ: 105 }, // Armory
      { minX: 495, maxX: 545, minZ: 115, maxZ: 165 }, // Motel
      { minX: 615, maxX: 665, minZ: -205, maxZ: -155 }, // VIP lot
      { minX: 145, maxX: 215, minZ: 625, maxZ: 695 }, // Container yard
      { minX: 215, maxX: 265, minZ: 715, maxZ: 765 }, // Pier 4 warehouse
      { minX: 85, maxX: 155, minZ: -755, maxZ: -695 }, // Compound gate
      { minX: 95, maxX: 145, minZ: -825, maxZ: -755 }, // Terrace + vault
      { minX: 755, maxX: 805, minZ: 235, maxZ: 285 }, // Marina piers
      { minX: -25, maxX: 25, minZ: -520, maxZ: -360 }, // Bridge corridor
      { minX: -85, maxX: -35, minZ: 455, maxZ: 505 }, // Port gate
    ];
    const overlaps = (a: Exclusion, b: Exclusion) =>
      a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
    const pastel = facadeTexture('#e8b48a', '#c98a5a', rng);
    const pastel2 = facadeTexture('#a8c8d8', '#6a8a9a', rng);
    const glass = glassTexture(rng);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const mats = [
      new THREE.MeshStandardMaterial({ map: pastel, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: pastel2, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: glass, roughness: 0.35, metalness: 0.4 }),
    ];
    const buckets: { x: number; z: number; w: number; h: number; d: number; color: number }[][] = [[], [], []];
    const placeBlock = (bx0: number, bz0: number, bx1: number, bz1: number) => {
      const w = bx1 - bx0;
      const d = bz1 - bz0;
      if (w < 22 || d < 22) return;
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      if (isWater(cx, cz)) return;
      for (const e of exclusions) {
        if (overlaps({ minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 }, e)) return;
      }
      const downtown = Math.abs(cx) < 320 && cz > -380 && cz < 360;
      const n = rng.chance(0.5) ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const bw = w / n - rng.range(4, 10);
        const bd = d - rng.range(6, 12);
        const bx = bx0 + (w / n) * i + (w / n - bw) / 2 + rng.range(0, 3);
        const bz = bz0 + (d - bd) / 2 + rng.range(0, 3);
        const h = downtown ? rng.range(16, 68) : rng.range(7, 26);
        const kind = downtown && rng.chance(0.4) ? 2 : rng.int(0, 1);
        const tint = new THREE.Color().setHSL(rng.range(0, 1), rng.range(0.1, 0.35), rng.range(0.55, 0.8)).getHex();
        buckets[kind].push({ x: bx + bw / 2, z: bz + bd / 2, w: bw, h, d: bd, color: kind === 2 ? 0xffffff : tint });
        this.colliders.push({ minX: bx, maxX: bx + bw, minZ: bz, maxZ: bz + bd });
      }
    };
    for (let i = 0; i < MAIN_ROADS_X.length - 1; i++) {
      for (let j = 0; j < MAIN_ROADS_Z.length - 1; j++) {
        placeBlock(MAIN_ROADS_X[i] + 11, MAIN_ROADS_Z[j] + 11, MAIN_ROADS_X[i + 1] - 11, MAIN_ROADS_Z[j + 1] - 11);
      }
    }
    for (let i = 0; i < ISLAND_ROADS_X.length - 1; i++) {
      for (let j = 0; j < ISLAND_ROADS_Z.length - 1; j++) {
        placeBlock(ISLAND_ROADS_X[i] + 11, ISLAND_ROADS_Z[j] + 11, ISLAND_ROADS_X[i + 1] - 11, ISLAND_ROADS_Z[j + 1] - 11);
      }
    }
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    buckets.forEach((list, k) => {
      if (list.length === 0) return;
      const inst = new THREE.InstancedMesh(boxGeo, mats[k], list.length);
      list.forEach((b, i) => {
        dummy.position.set(b.x, 0, b.z);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, col.setHex(b.color));
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      scene.add(inst);
    });

    // ---- landmarks ----
    this.buildLandmarks(scene, rng);

    // ---- palms along the beach, plaza and marina ----
    this.buildPalms(scene, rng);

    // ---- streetlights along main roads ----
    this.buildLamps(scene, rng);

    // ---- distant skyline silhouettes for the horizon ----
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x4a3a5a, fog: true });
    const skyGeoms: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = rng.range(1050, 1250);
      const w = rng.range(40, 90);
      const h = rng.range(60, 190);
      const g = new THREE.BoxGeometry(w, h, w);
      g.translate(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
      skyGeoms.push(g);
    }
    const skyline = new THREE.Mesh(mergeGeoms(skyGeoms), skyMat);
    scene.add(skyline);
  }

  private addBox(scene: THREE.Scene, x: number, z: number, w: number, h: number, d: number, color: number, y = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  private addCollider(x: number, z: number, w: number, d: number): void {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  private buildLandmarks(scene: THREE.Scene, rng: Rng): void {
    // Central Plaza: disc, fountain, benches
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 0.4, 32), new THREE.MeshStandardMaterial({ color: 0xb8a88a, roughness: 1 }));
    plaza.position.set(0, 0.2, 0);
    plaza.receiveShadow = true;
    scene.add(plaza);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1.6, 20), new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9 }));
    fountain.position.set(0, 0.8, 0);
    scene.add(fountain);
    const fwater = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0x2a8a96, roughness: 0.2 }));
    fwater.position.set(0, 1.6, 0);
    scene.add(fwater);
    this.addCollider(0, 0, 13, 13);

    // El Faro Bar with neon sign
    this.addBox(scene, -540, 80, 34, 9, 20, 0x7a4a3a);
    this.addCollider(-540, 80, 34, 20);
    const faro = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: neonTexture('EL FARO', '#ff5a7a') }));
    faro.position.set(-540, 10.5, 90.2);
    faro.rotation.y = Math.PI;
    scene.add(faro);

    // Voss Customs garage (open front faces south toward the road)
    this.addBox(scene, -460, -152, 36, 10, 18, 0x3a3f46);
    this.addCollider(-460, -158, 36, 6);
    this.addCollider(-477, -146, 2, 14);
    this.addCollider(-443, -146, 2, 14);
    const customs = new THREE.Mesh(new THREE.PlaneGeometry(30, 5), new THREE.MeshBasicMaterial({ map: neonTexture('VOSS CUSTOMS', '#ffb347') }));
    customs.position.set(-460, 11, -141.5);
    scene.add(customs);

    // SMPD HQ glass tower
    this.addBox(scene, 110, -60, 30, 64, 30, 0x2a3a4a);
    this.addCollider(110, -60, 30, 30);
    const hq = new THREE.Mesh(new THREE.PlaneGeometry(24, 5), new THREE.MeshBasicMaterial({ map: neonTexture('SMPD HQ', '#4da6ff') }));
    hq.position.set(110, 66, -44.5);
    scene.add(hq);

    // Solmar Armory
    this.addBox(scene, -120, 80, 30, 8, 18, 0x5a4a3a);
    this.addCollider(-120, 80, 30, 18);
    const arm = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.5), new THREE.MeshBasicMaterial({ map: neonTexture('ARMORY', '#ffd98a') }));
    arm.position.set(-120, 9, 89.2);
    arm.rotation.y = Math.PI;
    scene.add(arm);

    // Safehouse Motel
    this.addBox(scene, 520, 140, 40, 8, 16, 0x8a7a5a);
    this.addCollider(520, 140, 40, 16);
    const motel = new THREE.Mesh(new THREE.PlaneGeometry(24, 5), new THREE.MeshBasicMaterial({ map: neonTexture('MOTEL', '#7ae8c8') }));
    motel.position.set(520, 9.5, 148.2);
    scene.add(motel);

    // VIP lot: low walls + gate posts
    this.addCollider(640, -198, 44, 2);
    this.addCollider(640, -162, 44, 2);
    this.addCollider(619, -180, 2, 36);
    this.addCollider(661, -180, 2, 36);
    this.addBox(scene, 640, -198, 44, 1.2, 2, 0x555555);
    this.addBox(scene, 640, -162, 44, 1.2, 2, 0x555555);

    // Port: containers (instanced) + cranes + Pier 4 warehouse
    const contGeo = new THREE.BoxGeometry(12, 2.6, 2.6);
    const contMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const conts: { x: number; z: number; y: number; color: number; rot: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const x = 150 + (i % 6) * 12 + rng.range(-1, 1);
      const z = 635 + Math.floor(i / 6) * 14 + rng.range(-2, 2);
      conts.push({ x, z, y: 1.3, color: new THREE.Color().setHSL(rng.range(0, 1), 0.55, 0.45).getHex(), rot: rng.chance(0.5) ? 0 : Math.PI / 2 });
      if (rng.chance(0.4)) conts.push({ x, z, y: 3.9, color: new THREE.Color().setHSL(rng.range(0, 1), 0.5, 0.5).getHex(), rot: 0 });
    }
    const contInst = new THREE.InstancedMesh(contGeo, contMat, conts.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    conts.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, c.rot, 0);
      dummy.updateMatrix();
      contInst.setMatrixAt(i, dummy.matrix);
      contInst.setColorAt(i, col.setHex(c.color));
    });
    contInst.castShadow = true;
    contInst.instanceMatrix.needsUpdate = true;
    if (contInst.instanceColor) contInst.instanceColor.needsUpdate = true;
    scene.add(contInst);
    this.addCollider(180, 660, 70, 60);
    // cranes
    this.addBox(scene, 150, 620, 6, 42, 6, 0xd8c23a);
    this.addBox(scene, 150, 620, 34, 3, 3, 0xd8c23a, 40);
    this.addCollider(150, 620, 8, 8);
    this.addBox(scene, 220, 640, 6, 38, 6, 0xd8c23a);
    this.addBox(scene, 220, 640, 30, 3, 3, 0xd8c23a, 36);
    this.addCollider(220, 640, 8, 8);
    // Pier 4 warehouse
    this.addBox(scene, 240, 740, 44, 12, 30, 0x6a5a4a);
    this.addCollider(240, 740, 44, 30);

    // Marina piers + boats
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 46), pierMat);
      pier.position.set(768 + i * 14, 0.4, 262);
      scene.add(pier);
      const boat = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 14), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }));
      boat.position.set(768 + i * 14, 0.6, 288);
      scene.add(boat);
    }
    // yacht at the marina
    this.addBox(scene, 790, 300, 10, 4, 26, 0xf0f0f0, 0);
    this.addBox(scene, 790, 296, 7, 3, 12, 0x2a3a4a, 4);

    // Coastal Bridge rails + pylons
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.6, metalness: 0.4 });
    for (const sx of [-8, 8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 82), railMat);
      rail.position.set(sx, 0.7, -470);
      scene.add(rail);
    }
    for (const pz of [-440, -470, -500]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 10, 8), new THREE.MeshStandardMaterial({ color: 0x777777 }));
      pylon.position.set(0, -4, pz);
      scene.add(pylon);
    }

    // Vespera compound: perimeter walls with a south gate gap, penthouse, vault
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
    const wall = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 7, d), wallMat);
      m.position.set(x, 3.5, z);
      m.castShadow = true;
      scene.add(m);
      this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    };
    wall(120, -752, 70, 2); // north wall
    wall(87, -726, 2, 56); // west wall
    wall(153, -726, 2, 56); // east wall
    wall(100, -700, 34, 2); // south wall west of gate
    wall(140, -700, 34, 2); // south wall east of gate
    this.addBox(scene, 120, -730, 34, 26, 22, 0x2a2a33);
    this.addCollider(120, -730, 34, 22);
    this.addBox(scene, 125, -805, 12, 6, 10, 0x4a3a2a);
    this.addCollider(125, -805, 12, 10);
    const vaultSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: neonTexture('VAULT', '#ff4d4d') }));
    vaultSign.position.set(125, 7, -799.5);
    scene.add(vaultSign);
  }

  private buildPalms(scene: THREE.Scene, rng: Rng): void {
    const spots: { x: number; z: number }[] = [];
    for (let z = -320; z <= 320; z += 46) spots.push({ x: 838, z });
    for (let z = -320; z <= 320; z += 46) spots.push({ x: 800, z: z + 23 });
    for (let a = 0; a < 10; a++) {
      const t = (a / 10) * Math.PI * 2;
      spots.push({ x: Math.cos(t) * 42, z: Math.sin(t) * 42 });
    }
    for (let i = 0; i < 8; i++) spots.push({ x: 760 + rng.range(0, 30), z: 230 + rng.range(0, 50) });
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
    trunkGeo.translate(0, 3.5, 0);
    const crownGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
    crownGeo.translate(0, 8.2, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(1, rng.range(0.85, 1.25), 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      crowns.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    scene.add(trunks);
    scene.add(crowns);
  }

  private buildLamps(scene: THREE.Scene, rng: Rng): void {
    const spots: { x: number; z: number }[] = [];
    for (const x of MAIN_ROADS_X) {
      for (let z = -400; z <= 840; z += 120) spots.push({ x: x + 9, z });
    }
    for (const z of MAIN_ROADS_Z) {
      for (let x = -820; x <= 820; x += 120) spots.push({ x, z: z + 9 });
    }
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    poleGeo.translate(0, 3.5, 0);
    const headGeo = new THREE.BoxGeometry(1.2, 0.3, 0.4);
    headGeo.translate(0, 7, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffd98a, emissiveIntensity: 0.7 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      heads.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    scene.add(poles);
    scene.add(heads);
  }

  // Nearest graph node to a point (traffic respawn, GPS).
  nearestNode(x: number, z: number): GraphNode {
    let best = this.graph[0];
    let bd = Infinity;
    for (const n of this.graph) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  // Circle vs all building colliders + water edge. Returns corrected pos.
  collideCircle(x: number, z: number, r: number): { x: number; z: number; hit: boolean } {
    let hit = false;
    for (const b of this.colliders) {
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      const p = pushOutAABB(x, z, r, b);
      if (p.x !== x || p.z !== z) hit = true;
      x = p.x;
      z = p.z;
    }
    if (isWater(x, z)) {
      // water blocks movement: step back toward the nearest land is handled
      // by callers clamping to the last dry position; here just flag it
      hit = true;
    }
    return { x, z, hit };
  }

  // Line of sight in 2D: true when no building blocks the segment.
  hasLineOfSight(x1: number, z1: number, x2: number, z2: number): boolean {
    for (const b of this.colliders) {
      if (segmentHitsAABB(x1, z1, x2, z2, b)) return false;
    }
    return true;
  }
}
