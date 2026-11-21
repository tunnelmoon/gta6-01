// Solmar Sunset - shared tuning, world layout, mission data.
// Every coordinate and number the game uses lives here so the systems
// stay in agreement about where things are.

// ---- math helpers (clamp's upper branch returns the max, always) ----
export function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
export function angleTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(bx - ax, bz - az);
}

// ---- world bounds ----
export const WORLD = {
  minX: -900,
  maxX: 900,
  minZ: -1000,
  maxZ: 900,
  roadWidth: 14,
  sidewalk: 4,
};

// Vertical roads (along Z) and horizontal roads (along X), mainland grid.
export const MAIN_ROADS_X = [-720, -600, -480, -360, -240, -120, 0, 120, 240, 360, 480, 600, 720];
export const MAIN_ROADS_Z = [-360, -240, -120, 0, 120, 240, 360, 480, 600, 720, 840];
// Cayo Verde island roads.
export const ISLAND_ROADS_X = [-120, 0, 120, 240];
export const ISLAND_ROADS_Z = [-840, -720, -600];

// Water: ocean east of X 850, south of Z 850, the channel, and around the island.
export function isWater(x: number, z: number): boolean {
  if (x > 850 || z > 850) return true;
  if (z < -430 && z > -510) return Math.abs(x) > 9; // channel, bridge corridor stays dry
  if (z <= -510 && z >= -950) {
    if (x < -250 || x > 350) return true;
    return false;
  }
  if (z < -950) return true;
  return false;
}
export function isOnLand(x: number, z: number): boolean {
  return !isWater(x, z);
}

// ---- districts ----
export interface District {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export const DISTRICTS: District[] = [
  { name: 'Centro Solmar', minX: -320, maxX: 320, minZ: -380, maxZ: 360 },
  { name: 'Playa Dorado', minX: 350, maxX: 850, minZ: -350, maxZ: 350 },
  { name: 'Barrio Cobre', minX: -850, maxX: -350, minZ: -300, maxZ: 350 },
  { name: 'Puerto Viejo', minX: -400, maxX: 450, minZ: 400, maxZ: 850 },
  { name: 'Cayo Verde', minX: -250, maxX: 350, minZ: -950, maxZ: -520 },
];
export function districtAt(x: number, z: number): string {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d.name;
  }
  return 'Solmar';
}

// ---- named places (world bible coordinates) ----
export const PLACES = {
  centralPlaza: { x: 0, z: 0 },
  smpdHQ: { x: 110, z: -60 },
  armory: { x: -120, z: 80 },
  safehouse: { x: 520, z: 140 },
  vipLot: { x: 640, z: -180 },
  marina: { x: 780, z: 260 },
  elFaro: { x: -540, z: 80 },
  vossCustoms: { x: -460, z: -140 },
  portGate: { x: -60, z: 480 },
  containerYard: { x: 180, z: 660 },
  pier4: { x: 240, z: 740 },
  bridgeSouth: { x: 0, z: -410 },
  bridgeNorth: { x: 0, z: -510 },
  compoundGate: { x: 120, z: -720 },
  terrace: { x: 120, z: -780 },
  vault: { x: 125, z: -805 },
};

// ---- vehicles ----
export interface VehicleSpec {
  name: string;
  length: number;
  width: number;
  height: number;
  topSpeed: number; // m/s
  accel: number; // m/s^2
  turn: number; // rad/s at full steer
  hp: number;
  body: number; // color
  trim: number; // color
  kind: 'sports' | 'muscle' | 'police' | 'interceptor' | 'sedan' | 'van' | 'swat';
}
export const VEHICLES: Record<string, VehicleSpec> = {
  solmarGT: { name: 'Solmar GT', length: 4.6, width: 2.0, height: 1.15, topSpeed: 52, accel: 16, turn: 1.9, hp: 100, body: 0xc0c8d0, trim: 0x22242a, kind: 'sports' },
  v8Dorado: { name: 'V8 Dorado', length: 5.0, width: 2.1, height: 1.3, topSpeed: 46, accel: 14, turn: 1.6, hp: 120, body: 0x8a2a20, trim: 0x1a1a1a, kind: 'muscle' },
  cruiser: { name: 'Metro Cruiser', length: 5.0, width: 2.05, height: 1.45, topSpeed: 44, accel: 13, turn: 1.7, hp: 140, body: 0x1c2a3a, trim: 0xe8e8e8, kind: 'police' },
  interceptor: { name: 'SMPD Interceptor', length: 4.8, width: 2.0, height: 1.3, topSpeed: 56, accel: 18, turn: 2.0, hp: 130, body: 0x101418, trim: 0xd8d8d8, kind: 'interceptor' },
  sedan: { name: 'Urban Sedan', length: 4.7, width: 1.95, height: 1.4, topSpeed: 38, accel: 10, turn: 1.7, hp: 90, body: 0x6a7a8a, trim: 0x2a2a2a, kind: 'sedan' },
  cargoMule: { name: 'Cargo Mule', length: 6.2, width: 2.4, height: 2.6, topSpeed: 34, accel: 8, turn: 1.3, hp: 200, body: 0x4a4a48, trim: 0xd8c23a, kind: 'van' },
  enforcer: { name: 'Tactical Enforcer', length: 6.4, width: 2.6, height: 2.9, topSpeed: 36, accel: 9, turn: 1.25, hp: 260, body: 0x23282c, trim: 0x3a3a3a, kind: 'swat' },
};
export const TRAFFIC_MODELS = ['sedan', 'sedan', 'v8Dorado', 'sedan', 'solmarGT', 'cargoMule'];

// ---- weapons ----
export interface WeaponSpec {
  name: string;
  slot: number;
  damage: number;
  fireRate: number; // shots per second
  clip: number;
  reserve: number;
  range: number;
  spread: number; // radians
  auto: boolean;
  price: number;
  unlock: number; // mission that unlocks it (0 = from the start)
}
export const WEAPONS: WeaponSpec[] = [
  { name: 'Fists', slot: 1, damage: 25, fireRate: 2.0, clip: Infinity, reserve: Infinity, range: 2.6, spread: 0, auto: false, price: 0, unlock: 0 },
  { name: 'Kestrel 9mm', slot: 2, damage: 34, fireRate: 4.0, clip: 15, reserve: 120, range: 70, spread: 0.02, auto: false, price: 100, unlock: 1 },
  { name: 'Viper Micro-SMG', slot: 3, damage: 22, fireRate: 10.0, clip: 32, reserve: 192, range: 55, spread: 0.05, auto: true, price: 1200, unlock: 2 },
  { name: 'Bulldog Carbine', slot: 4, damage: 55, fireRate: 6.0, clip: 30, reserve: 180, range: 110, spread: 0.012, auto: true, price: 2800, unlock: 3 },
];

// ---- economy ----
export const ECONOMY = {
  startCash: 250,
  respawnFee: 100,
  resprayCost: 200,
  armorCost: 500,
  armorValue: 100,
  ammoCost: 100,
  pedCashMin: 15,
  pedCashMax: 60,
  discountAfterStory: 0.5,
};

// ---- player tuning ----
export const PLAYER_TUNE = {
  walkSpeed: 4.2,
  sprintSpeed: 7.2,
  accel: 30,
  radius: 0.55,
  health: 100,
  armorMax: 100,
};

// ---- wanted ----
export const WANTED = {
  heatPerKill: 18,
  heatPerSteal: 10,
  heatPerShot: 2,
  decayPerSecond: 6,
  unseenSecondsToCool: 4,
  starsForHeat: [0, 25, 45, 65, 82, 95], // heat thresholds per star count
  policePerStar: [0, 1, 2, 3, 4, 5],
  visionRange: 70,
  visionAngle: 1.25, // radians half-angle
};

// ---- mission data ----
export interface MissionStep {
  kind: 'goto' | 'kill' | 'steal' | 'deliver' | 'interact' | 'convoy' | 'survive';
  text: string;
  x: number;
  z: number;
  radius: number;
  count?: number;
  hp?: number;
}
export interface MissionDef {
  id: number;
  title: string;
  start: { x: number; z: number; label: string };
  intro: { speaker: string; line: string }[];
  outro: { speaker: string; line: string }[];
  reward: number;
  steps: MissionStep[];
}
export const MISSIONS: MissionDef[] = [
  {
    id: 1,
    title: 'Salt and Ignition',
    start: { x: -540, z: 100, label: 'El Faro Bar' },
    intro: [
      { speaker: 'Mateo', line: 'Two years off the grid, Mara, and Vespera Syndicate still remembers what your brother owed them. Tonight, they collect, unless we pay first.' },
      { speaker: 'Mara', line: "I don't boost cars for free anymore, Mateo. Give me a name and a plate." },
      { speaker: 'Mateo', line: "Silver Solmar GT parked at the Playa Dorado VIP lot. Clean keys, dirty owner. Drop it at Voss Customs before SMPD tags the plates." },
    ],
    outro: [
      { speaker: 'Mateo', line: "Clean work, Voss. Keep the Kestrel 9mm I left in the glovebox, something tells me Vespera won't take this quietly." },
    ],
    reward: 1500,
    steps: [
      { kind: 'goto', text: 'Drive to the VIP lot in Playa Dorado', x: 640, z: -180, radius: 26 },
      { kind: 'kill', text: 'Deal with the 3 lot guards', x: 640, z: -185, radius: 30, count: 3, hp: 60 },
      { kind: 'steal', text: 'Steal the silver Solmar GT', x: 645, z: -185, radius: 6 },
      { kind: 'deliver', text: 'Lose the heat, then deliver the GT to Voss Customs', x: -460, z: -140, radius: 30 },
    ],
  },
  {
    id: 2,
    title: 'Harbor Static',
    start: { x: -460, z: -140, label: 'Voss Customs' },
    intro: [
      { speaker: 'Mateo', line: "Mara, we got burned! Vespera tracked the coupe's transponder and raided my stash at Puerto Viejo docks." },
      { speaker: 'Mara', line: "Tell me they didn't get the ledger drives." },
      { speaker: 'Mateo', line: 'Locked inside Pier 4 warehouse right now. Grab that drive before their freighter leaves port, and watch out, they brought heavy hardware.' },
    ],
    outro: [
      { speaker: 'Mara', line: "I've got the drives, Mateo. Meet me at the motel, wait... Mateo? Answer your phone." },
    ],
    reward: 3500,
    steps: [
      { kind: 'goto', text: 'Drive to the Port Main Gate', x: -60, z: 480, radius: 26 },
      { kind: 'kill', text: 'Clear the 8 Syndicate gunmen at the docks', x: 200, z: 690, radius: 90, count: 8, hp: 85 },
      { kind: 'interact', text: 'Grab the Encrypted Ledger Case', x: 240, z: 740, radius: 6 },
      { kind: 'steal', text: 'Hijack the armored Cargo Mule', x: 215, z: 755, radius: 7 },
      { kind: 'deliver', text: 'Deliver the van to the Safehouse Motel', x: 520, z: 140, radius: 30 },
    ],
  },
  {
    id: 3,
    title: 'Neon Ransom',
    start: { x: 520, z: 158, label: 'Safehouse Motel' },
    intro: [
      { speaker: 'Vespera Lieutenant', line: "You want your little hacker back, Voss? Bring the ledger to Cayo Verde midnight, or we dump him off the North Bridge." },
      { speaker: 'Mara', line: "They're moving him up Central Avenue right now. If they cross that bridge into Cayo Verde, he's dead." },
    ],
    outro: [
      { speaker: 'Mateo', line: 'I cracked the ledger while tied up in the back of that van... fifty grand in bearer bonds sitting in their Cayo Verde penthouse vault.' },
      { speaker: 'Mara', line: 'No more running. Tonight, we take Solmar.' },
    ],
    reward: 7500,
    steps: [
      { kind: 'convoy', text: 'Intercept the convoy heading north to the bridge', x: -120, z: -300, radius: 60 },
      { kind: 'interact', text: 'Rescue Mateo from the stopped Transport Van', x: 0, z: -430, radius: 8 },
      { kind: 'deliver', text: 'Respray the getaway car at Voss Customs', x: -460, z: -140, radius: 30 },
    ],
  },
  {
    id: 4,
    title: 'Solmar Sunset',
    start: { x: 0, z: -410, label: 'Coastal Bridge' },
    intro: [
      { speaker: 'Mateo', line: 'I looped their penthouse security cameras for ten minutes. Once you breach the courtyard, their private army will lock down the bridge.' },
      { speaker: 'Mara', line: "Keep the boat engine running at Playa Dorado Marina. When I cross back over that bridge, I'm not coming empty-handed." },
    ],
    outro: [
      { speaker: 'Mara', line: "The debt is paid, Mateo. And the rest of Solmar? It's wide open." },
    ],
    reward: 50000,
    steps: [
      { kind: 'goto', text: 'Cross the Coastal Bridge to Cayo Verde', x: 0, z: -510, radius: 22 },
      { kind: 'kill', text: 'Breach the compound, defeat 12 elite guards', x: 120, z: -780, radius: 70, count: 12, hp: 110 },
      { kind: 'kill', text: 'Take down the Vespera Underboss', x: 120, z: -780, radius: 40, count: 1, hp: 250 },
      { kind: 'interact', text: 'Crack the vault (hold E for 3s)', x: 125, z: -805, radius: 8 },
      { kind: 'deliver', text: 'Escape to Playa Dorado Marina', x: 780, z: 260, radius: 30 },
    ],
  },
];

// ---- shops ----
export const SHOPS = [
  { id: 'armory', name: 'Solmar Armory', x: -120, z: 80, radius: 16, kind: 'armory' },
  { id: 'customs', name: 'Voss Customs', x: -460, z: -140, radius: 30, kind: 'customs' },
  { id: 'motel', name: 'Safehouse Motel', x: 520, z: 140, radius: 20, kind: 'motel' },
];

// ---- radio ----
export const RADIO = [
  { name: 'Solmar Wave 104.5', desc: 'Synthwave', kind: 'synth' as const },
  { name: 'Dorado Heat 98.2', desc: 'Latin-Funk', kind: 'funk' as const },
  { name: 'Radio Off', desc: '', kind: 'off' as const },
];

// ---- palette (sun-soaked Solmar: warm dusk, teal sea, pastel art deco) ----
export const PALETTE = {
  skyTop: 0x2a3a6a,
  skyMid: 0xe8825a,
  skyLow: 0xffc98a,
  sun: 0xffb347,
  fog: 0xe89a6a,
  sea: 0x1d6f7a,
  sand: 0xd9b380,
  asphalt: 0x33363c,
  sidewalk: 0x8a8578,
  grass: 0x4a7a3a,
  hudTeal: '#2fd6c0',
  hudAmber: '#ffb347',
  hudRed: '#ff4d4d',
  hudBlue: '#4da6ff',
};
