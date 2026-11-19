// Solmar city: ground, road graph, buildings, props, ocean, sky and
// collision. The city is a flat grid town on the coast: 5 districts, a
// north island (Cayo Verde) joined by the Coastal Bridge, ocean east and
// south, and a port. Buildings are instanced where they repeat (palms,
// lamps, containers) and individual meshes where they vary.
import * as THREE from 'three';
import { AVENUES, CAYO_AVENUES, CAYO_STREETS, CHANNEL, DISTRICTS, LOC, WORLD, clamp, districtAt } from './config.js';
import { Rng } from './rng.js';
import { CAYO as CAYO_EXT, MAINLAND as MAIN_EXT, facadeTexture, glassTexture, neonTexture, paintGround, roofTexture, waterTexture } from './textures.js';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoadNode {
  x: number;
  z: number;
  neighbors: string[];
}

export interface Poi {
  id: string;
  name: string;
  x: number;
  z: number;
  icon: string;
}

const POIS: Poi[] = [
  { id: 'elfaro', name: 'El Faro Bar', x: LOC.elFaroBar.x, z: LOC.elFaroBar.z, icon: 'bar' },
  { id: 'customs', name: 'Voss Customs', x: LOC.vossCustoms.x, z: LOC.vossCustoms.z, icon: 'shop' },
  { id: 'armory', name: 'Solmar Armory', x: LOC.solmarArmory.x, z: LOC.solmarArmory.z, icon: 'shop' },
  { id: 'motel', name: 'Safehouse Motel', x: LOC.safehouseMotel.x, z: LOC.safehouseMotel.z, icon: 'home' },
  { id: 'marina', name: 'Playa Dorado Marina', x: LOC.marina.x, z: LOC.marina.z, icon: 'boat' },
  { id: 'portgate', name: 'Port Main Gate', x: LOC.portGate.x, z: LOC.portGate.z, icon: 'port' },
  { id: 'pier4', name: 'Pier 4 Warehouse', x: LOC.pier4.x, z: LOC.pier4.z, icon: 'port' },
  { id: 'smpd', name: 'SMPD HQ', x: LOC.smpdHq.x, z: LOC.smpdHq.z, icon: 'police' },
  { id: 'penthouse', name: 'Vespera Penthouse', x: LOC.penthouseTerrace.x, z: LOC.penthouseTerrace.z, icon: 'target' },
];

export type TimeOfDay = 'day' | 'sunset' | 'night';

export class City {
  scene: THREE.Scene;
  colliders: AABB[] = [];
  nodes = new Map<string, RoadNode>();
  pois = POIS;
  groundCanvas!: HTMLCanvasElement;
  private rng: Rng;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private skyMat!: THREE.MeshBasicMaterial;
  private skyCanvases: Record<TimeOfDay, HTMLCanvasElement>;
  private lampMats: THREE.MeshStandardMaterial[] = [];
  private waterTex!: THREE.CanvasTexture;
  private timeOfDay: TimeOfDay = 'sunset';
  private gateWall: THREE.Mesh | null = null;
  private gateSinking = false;

  constructor(scene: THREE.Scene, seed: number) {
    this.scene = scene;
    this.rng = new Rng(seed);
    this.skyCanvases = {
      day: this.paintSky('#7ec3ee', '#cfe9f7', '#fff3c4'),
      sunset: this.paintSky('#2b3a6e', '#ff9e5e', '#ffd27a'),
      night: this.paintSky('#050914', '#12203a', '#dfe8ff'),
    };
    this.buildGround();
    this.buildRoadGraph();
    this.buildSky();
    this.buildLights();
    this.buildBuildings();
    this.buildPois();
    this.buildProps();
    this.buildOceanAndBridge();
    this.setTimeOfDay('sunset');
  }

  private paintSky(top: string, mid: string, sun: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(0.78, sun);
    g.addColorStop(1, sun);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    return c;
  }

  private buildGround(): void {
    const mk = (ext: typeof MAIN_EXT) => {
      const c = paintGround(ext, ext === MAIN_EXT ? 11 : 23);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(ext.maxX - ext.minX, ext.maxZ - ext.minZ);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((ext.minX + ext.maxX) / 2, 0, (ext.minZ + ext.maxZ) / 2);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return c;
    };
    this.groundCanvas = mk(MAIN_EXT);
    mk(CAYO_EXT);
  }

  private buildRoadGraph(): void {
    const key = (x: number, z: number) => x + ',' + z;
    const add = (x: number, z: number) => {
      const k = key(x, z);
      if (!this.nodes.has(k)) this.nodes.set(k, { x, z, neighbors: [] });
      return k;
    };
    const link = (a: string, b: string) => {
      const na = this.nodes.get(a)!;
      const nb = this.nodes.get(b)!;
      if (!na.neighbors.includes(b)) na.neighbors.push(b);
      if (!nb.neighbors.includes(a)) nb.neighbors.push(a);
    };
    // Mainland grid: streets at Z >= -400 only (channel cuts the north).
    const mainStreets = [-400, -240, -80, 80, 240, 400, 560, 720, 840];
    for (const ax of AVENUES) {
      for (const sz of mainStreets) add(ax, sz);
    }
    for (const ax of AVENUES) {
      for (let i = 0; i < mainStreets.length - 1; i++) link(key(ax, mainStreets[i]), key(ax, mainStreets[i + 1]));
    }
    for (const sz of mainStreets) {
      for (let i = 0; i < AVENUES.length - 1; i++) link(key(AVENUES[i], sz), key(AVENUES[i + 1], sz));
    }
    // Cayo Verde grid.
    for (const ax of CAYO_AVENUES) {
      for (const sz of CAYO_STREETS) add(ax, sz);
    }
    for (const ax of CAYO_AVENUES) {
      for (let i = 0; i < CAYO_STREETS.length - 1; i++) link(key(ax, CAYO_STREETS[i]), key(ax, CAYO_STREETS[i + 1]));
    }
    for (const sz of CAYO_STREETS) {
      for (let i = 0; i < CAYO_AVENUES.length - 1; i++) link(key(CAYO_AVENUES[i], sz), key(CAYO_AVENUES[i + 1], sz));
    }
    // Coastal Bridge: (0,-400) - (0,-430) - (0,-510) - (0,-560).
    const b1 = add(0, CHANNEL.north);
    const b2 = add(0, CHANNEL.south);
    link(key(0, -400), b1);
    link(b1, b2);
    link(b2, key(0, -560));
  }

  nearestNode(x: number, z: number): RoadNode {
    let best: RoadNode | null = null;
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      const dx = n.x - x;
      const dz = n.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best!;
  }

  // Breadth-first route over the road graph, as a list of waypoints.
  route(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] {
    const start = this.nearestNode(fromX, fromZ);
    const goal = this.nearestNode(toX, toZ);
    const startKey = start.x + ',' + start.z;
    const goalKey = goal.x + ',' + goal.z;
    const prev = new Map<string, string>();
    const seen = new Set<string>([startKey]);
    const queue = [startKey];
    while (queue.length > 0) {
      const k = queue.shift()!;
      if (k === goalKey) break;
      for (const nb of this.nodes.get(k)!.neighbors) {
        if (!seen.has(nb)) {
          seen.add(nb);
          prev.set(nb, k);
          queue.push(nb);
        }
      }
    }
    const path: { x: number; z: number }[] = [];
    let cur = goalKey;
    if (cur !== startKey && !prev.has(cur)) return [{ x: toX, z: toZ }];
    while (cur !== startKey) {
      const n = this.nodes.get(cur)!;
      path.unshift({ x: n.x, z: n.z });
      cur = prev.get(cur)!;
    }
    path.push({ x: toX, z: toZ });
    return path;
  }

  private buildSky(): void {
    const tex = new THREE.CanvasTexture(this.skyCanvases.sunset);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 16), this.skyMat);
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xf2a56b, 220, 2200);
    this.waterTex = waterTexture();
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xffd9b0, 0x3a4a5a, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffb066, 2.2);
    this.sun.position.set(-600, 420, 900);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -260;
    this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260;
    this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 2600;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  setTimeOfDay(mode: TimeOfDay): void {
    this.timeOfDay = mode;
    const tex = new THREE.CanvasTexture(this.skyCanvases[mode]);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.skyMat.map = tex;
    this.skyMat.needsUpdate = true;
    if (mode === 'day') {
      this.sun.color.setHex(0xfff2d8);
      this.sun.intensity = 2.6;
      this.sun.position.set(-500, 900, 400);
      this.hemi.intensity = 1.0;
      this.hemi.color.setHex(0xbfe3ff);
      this.scene.fog!.color.setHex(0xa8c8e0);
    } else if (mode === 'sunset') {
      this.sun.color.setHex(0xffb066);
      this.sun.intensity = 2.2;
      this.sun.position.set(-600, 420, 900);
      this.hemi.intensity = 0.85;
      this.hemi.color.setHex(0xffd9b0);
      this.scene.fog!.color.setHex(0xf2a56b);
    } else {
      this.sun.color.setHex(0x9db8e8);
      this.sun.intensity = 0.55;
      this.sun.position.set(300, 700, -400);
      this.hemi.intensity = 0.4;
      this.hemi.color.setHex(0x8aa0c8);
      this.scene.fog!.color.setHex(0x0e1a2e);
    }
    for (const m of this.lampMats) m.emissiveIntensity = mode === 'night' ? 2.2 : mode === 'sunset' ? 1.2 : 0.15;
  }

  getTimeOfDay(): TimeOfDay {
    return this.timeOfDay;
  }

  isWater(x: number, z: number): boolean {
    if (x > 850 || z > 850) return true;
    if (z < CHANNEL.north && z > CHANNEL.south) {
      // Channel water, except the bridge deck at X near 0.
      if (Math.abs(x) > 9) return true;
    }
    if (z < -430) {
      // North of the channel only Cayo Verde is land.
      if (x < CAYO_EXT.minX || x > CAYO_EXT.maxX || z < CAYO_EXT.minZ) return true;
    }
    return false;
  }

  private addCollider(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.colliders.push({ minX, maxX, minZ, maxZ });
  }

  private nearPoi(x: number, z: number, r: number): boolean {
    for (const p of POIS) {
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  private buildBuildings(): void {
    const rng = this.rng;
    const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.9 });
    const facadeMats = new Map<string, THREE.MeshStandardMaterial>();
    const glassMat = new THREE.MeshStandardMaterial({ map: glassTexture(rng), roughness: 0.25, metalness: 0.35 });
    const getFacade = (base: number, lit: number): THREE.MeshStandardMaterial => {
      const k = base + ':' + lit;
      let m = facadeMats.get(k);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ map: facadeTexture(base, 8, lit, rng), roughness: 0.85 });
        facadeMats.set(k, m);
      }
      return m;
    };
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const place = (cx: number, cz: number, w: number, d: number, h: number, mat: THREE.Material | THREE.Material[]): void => {
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(w, h, d);
      mesh.position.set(cx, h / 2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
    };

    const blocks: { x0: number; x1: number; z0: number; z1: number; cayo: boolean }[] = [];
    for (let i = 0; i < AVENUES.length - 1; i++) {
      for (let j = 0; j < 8; j++) {
        // Streets -400..840 in order: -400,-240,-80,80,240,400,560,720,840.
        const streets = [-400, -240, -80, 80, 240, 400, 560, 720, 840];
        blocks.push({ x0: AVENUES[i], x1: AVENUES[i + 1], z0: streets[j], z1: streets[j + 1], cayo: false });
      }
    }
    for (let i = 0; i < CAYO_AVENUES.length - 1; i++) {
      for (let j = 0; j < CAYO_STREETS.length - 1; j++) {
        blocks.push({ x0: CAYO_AVENUES[i], x1: CAYO_AVENUES[i + 1], z0: CAYO_STREETS[j], z1: CAYO_STREETS[j + 1], cayo: true });
      }
    }

    for (const b of blocks) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const district = districtAt(cx, cz);
      const w = b.x1 - b.x0 - 2 * WORLD.blockMargin;
      const d = b.z1 - b.z0 - 2 * WORLD.blockMargin;
      if (w < 26 || d < 26) continue;
      // Central Plaza stays open.
      if (Math.abs(cx) < 170 && Math.abs(cz) < 120) continue;
      if (this.nearPoi(cx, cz, 46)) continue;
      const tall = district.id === 'centro' && rng.chance(0.35);
      const count = district.id === 'puerto' ? 1 : tall ? 1 : rng.chance(0.55) ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const bw = count === 1 ? w * rng.range(0.55, 0.85) : w * rng.range(0.32, 0.44);
        const bd = count === 1 ? d * rng.range(0.55, 0.85) : d * rng.range(0.32, 0.44);
        const ox = count === 1 ? rng.range(-6, 6) : (k === 0 ? -w / 4 : w / 4) + rng.range(-4, 4);
        const oz = count === 1 ? rng.range(-6, 6) : rng.range(-d / 5, d / 5);
        const bx = cx + ox;
        const bz = cz + oz;
        if (this.nearPoi(bx, bz, 34)) continue;
        let h = rng.range(district.minH, district.maxH);
        if (tall) h = rng.range(55, 92);
        const base = district.palette[Math.floor(rng.next() * district.palette.length)];
        const useGlass = tall && rng.chance(0.6);
        const mat = useGlass ? glassMat : getFacade(base, 0.28);
        place(bx, bz, bw, bd, h, [mat, mat, roofMat, roofMat, mat, mat]);
      }
    }
  }

  private sign(text: string, color: string, x: number, y: number, z: number, w: number, h: number, ry: number, sub?: string): void {
    const tex = neonTexture(text, color, sub);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.scene.add(mesh);
  }

  private poiBuilding(x: number, z: number, w: number, d: number, h: number, color: number, signText?: string, signColor?: string, signSub?: string): void {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    if (signText && signColor) {
      this.sign(signText, signColor, x, h + 1.6, z + d / 2 + 0.3, Math.min(w * 0.9, 22), 6, 0, signSub);
    }
  }

  private buildPois(): void {
    // El Faro Bar: low pastel building with a pink neon sign.
    this.poiBuilding(LOC.elFaroBar.x, LOC.elFaroBar.z, 26, 18, 9, 0xe8b48a, 'EL FARO', '#ff5e8a', 'BAR - EST. 1987');
    // Voss Customs: garage with a wide door face.
    this.poiBuilding(LOC.vossCustoms.x, LOC.vossCustoms.z, 30, 20, 10, 0x5a6b7d, 'VOSS CUSTOMS', '#ffb347', 'RESPRAY - REPAIR');
    // SMPD HQ: blue-gray tower.
    this.poiBuilding(LOC.smpdHq.x, LOC.smpdHq.z, 34, 26, 42, 0x3a4a63, 'SMPD', '#7ec8ff', 'SOLMAR METRO POLICE');
    // Solmar Armory.
    this.poiBuilding(LOC.solmarArmory.x, LOC.solmarArmory.z, 22, 16, 9, 0x6b5a44, 'ARMORY', '#ffd27a', 'GUNS - AMMO - ARMOR');
    // Safehouse Motel: two wings.
    this.poiBuilding(LOC.safehouseMotel.x, LOC.safehouseMotel.z, 30, 14, 10, 0xd9a0a0, 'SAFEHOUSE', '#ff8a6b', 'MOTEL');
    this.poiBuilding(LOC.safehouseMotel.x, LOC.safehouseMotel.z + 18, 20, 10, 8, 0xd9a0a0);
    // Marina pier + boats.
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.9 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 14), pierMat);
    pier.position.set(LOC.marina.x, 0.5, LOC.marina.z);
    pier.castShadow = true;
    this.scene.add(pier);
    this.sign('MARINA', '#7ee8d9', LOC.marina.x, 8, LOC.marina.z - 8, 18, 5.5, 0, 'PLAYA DORADO');
    const boatMat = new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const boat = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 3), boatMat);
      boat.position.set(LOC.marina.x - 22 + i * 15, -0.1, LOC.marina.z + 12);
      this.scene.add(boat);
    }
    // Port Main Gate: two posts and a beam.
    const gateMat = new THREE.MeshStandardMaterial({ color: 0xd8542e, roughness: 0.7 });
    for (const dx of [-12, 12]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(3, 16, 3), gateMat);
      post.position.set(LOC.portGate.x + dx, 8, LOC.portGate.z);
      post.castShadow = true;
      this.scene.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(27, 3, 3), gateMat);
    beam.position.set(LOC.portGate.x, 15, LOC.portGate.z);
    this.scene.add(beam);
    // Port cranes: tall masts with a jib.
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xe8b93c, roughness: 0.6 });
    for (const [cx, cz] of [[60, 560], [300, 700], [-160, 640]] as const) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(4, 46, 4), craneMat);
      mast.position.set(cx, 23, cz);
      mast.castShadow = true;
      this.scene.add(mast);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(34, 2.5, 2.5), craneMat);
      jib.position.set(cx + 12, 44, cz);
      this.scene.add(jib);
      this.addCollider(cx - 3, cx + 3, cz - 3, cz + 3);
    }
    // Pier 4 Warehouse.
    this.poiBuilding(LOC.pier4.x, LOC.pier4.z, 44, 26, 12, 0x7d838a, 'PIER 4', '#ffb347', 'WAREHOUSE');
    // Vespera compound: wall ring + penthouse tower + vault.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.9 });
    const wallSegs: [number, number, number, number][] = [
      [120, -700, 70, 2], [120, -760, 70, 2], [86, -730, 2, 60], [154, -730, 2, 60],
    ];
    for (const [wx, wz, ww, wd] of wallSegs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 5, wd), wallMat);
      wall.position.set(wx, 2.5, wz);
      wall.castShadow = true;
      this.scene.add(wall);
      this.addCollider(wx - ww / 2, wx + ww / 2, wz - wd / 2, wz + wd / 2);
      if (wx === 120 && wz === -700) this.gateWall = wall;
    }
    this.poiBuilding(LOC.penthouseTerrace.x, LOC.penthouseTerrace.z, 30, 22, 34, 0x2e2a33, 'VESPERA', '#c98aff', 'PENTHOUSE');
    this.poiBuilding(LOC.vault.x, LOC.vault.z, 14, 12, 8, 0x8a7a3a, 'VAULT', '#ffd27a');
  }

  private buildProps(): void {
    const rng = this.rng;
    // Palm trees: instanced trunks + fronds.
    const palmSpots: { x: number; z: number }[] = [];
    for (let z = -320; z <= 320; z += 40) {
      palmSpots.push({ x: 838, z });
      palmSpots.push({ x: 812, z: z + 20 });
    }
    for (let i = 0; i < 26; i++) {
      palmSpots.push({ x: rng.range(-120, 120), z: rng.range(-100, 100) });
    }
    for (let i = 0; i < 20; i++) {
      palmSpots.push({ x: rng.range(-240, 340), z: rng.range(-940, -540) });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    const frondGeo = new THREE.ConeGeometry(2.6, 1.6, 6);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8f5b, roughness: 0.9 });
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    palmSpots.forEach((p, i) => {
      e.set(0, rng.range(0, Math.PI * 2), 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, 2.75, p.z), q, new THREE.Vector3(1, 1, 1));
      trunks.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(p.x, 6.1, p.z), q, new THREE.Vector3(1, 1, 1));
      fronds.setMatrixAt(i, m4);
    });
    trunks.castShadow = true;
    this.scene.add(trunks);
    this.scene.add(fronds);

    // Street lamps along avenues and streets.
    const lampSpots: { x: number; z: number }[] = [];
    for (const ax of AVENUES) {
      for (let z = -380; z <= 820; z += 160) lampSpots.push({ x: ax + 9, z });
    }
    for (const sz of [-400, -240, -80, 80, 240, 400, 560, 720, 840]) {
      for (let x = -780; x <= 780; x += 160) lampSpots.push({ x, z: sz + 9 });
    }
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.5 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
    const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc46b, emissiveIntensity: 1.2 });
    this.lampMats.push(headMat);
    const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
    lampSpots.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, 3.25, p.z), q.identity(), new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(p.x, 6.6, p.z), q.identity(), new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(i, m4);
    });
    this.scene.add(poles);
    this.scene.add(heads);

    // Shipping containers in the port yard.
    const contGeo = new THREE.BoxGeometry(12, 2.6, 2.6);
    const contColors = [0xc94f2e, 0x2e7fc9, 0x3a9e5f, 0xd8a03c, 0x8a5fc9];
    const contSpots: { x: number; z: number; ry: number; color: number; sy: number }[] = [];
    for (let i = 0; i < 46; i++) {
      const x = rng.range(90, 320);
      const z = rng.range(580, 780);
      contSpots.push({ x, z, ry: rng.chance(0.5) ? 0 : Math.PI / 2, color: contColors[i % contColors.length], sy: rng.chance(0.3) ? 2 : 1 });
    }
    const conts = new THREE.InstancedMesh(contGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.2 }), contSpots.length);
    const col = new THREE.Color();
    contSpots.forEach((p, i) => {
      e.set(0, p.ry, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, p.sy === 2 ? 2.6 : 1.3, p.z), q, new THREE.Vector3(1, p.sy, 1));
      conts.setMatrixAt(i, m4);
      conts.setColorAt(i, col.setHex(p.color));
      const hw = p.ry === 0 ? 6 : 1.3;
      const hd = p.ry === 0 ? 1.3 : 6;
      this.addCollider(p.x - hw, p.x + hw, p.z - hd, p.z + hd);
    });
    conts.castShadow = true;
    conts.receiveShadow = true;
    this.scene.add(conts);
  }

  private buildOceanAndBridge(): void {
    // One huge water plane under everything; land planes sit above it.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(5200, 5200),
      new THREE.MeshStandardMaterial({ map: this.waterTex, roughness: 0.35, metalness: 0.1 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.6, 0);
    this.scene.add(water);
    // Coastal Bridge deck across the channel.
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 84), deckMat);
    deck.position.set(0, -0.2, -470);
    deck.receiveShadow = true;
    this.scene.add(deck);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.7 });
    for (const dx of [-8, 8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 84), railMat);
      rail.position.set(dx, 0.9, -470);
      this.scene.add(rail);
    }
    // Two bridge pylons.
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.8 });
    for (const dz of [-452, -488]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.5, 26, 2.5), pylonMat);
      pylon.position.set(0, 12, dz);
      pylon.castShadow = true;
      this.scene.add(pylon);
    }
  }

  // Circle vs AABB push-out in 2D. Never traps: the push is always along the
  // smallest penetration axis, and the clamped point uses a correct clamp.
  resolveCircle(pos: THREE.Vector3, radius: number): void {
    for (const c of this.colliders) {
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 < 1e-8) {
        // Center is inside the box: push out along the smallest axis.
        const pl = pos.x - c.minX;
        const pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ;
        const pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }

  collidesCircle(x: number, z: number, radius: number): boolean {
    for (const c of this.colliders) {
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  removeColliderNear(x: number, z: number, r: number): void {
    this.colliders = this.colliders.filter((c) => {
      const ccx = clamp(x, c.minX, c.maxX);
      const ccz = clamp(z, c.minZ, c.maxZ);
      const dx = x - ccx;
      const dz = z - ccz;
      return dx * dx + dz * dz >= r * r;
    });
  }

  openCompoundGate(): void {
    this.removeColliderNear(120, -700, 40);
    this.gateSinking = true;
  }

  update(dt: number, time: number): void {
    this.waterTex.offset.x = time * 0.004;
    this.waterTex.offset.y = time * 0.0025;
    if (this.gateSinking && this.gateWall) {
      this.gateWall.position.y -= dt * 4;
      if (this.gateWall.position.y < -5) {
        this.gateWall.visible = false;
        this.gateSinking = false;
      }
    }
    void dt;
  }
}
