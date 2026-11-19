// Solmar Sunset - central configuration: world layout, districts, key
// locations, vehicle and weapon definitions, economy. Every coordinate in
// the brief lives here so missions, HUD and the minimap all agree.
import * as THREE from 'three';
export const WORLD = {
    minX: -900,
    maxX: 900,
    minZ: -980,
    maxZ: 900,
    roadHalfWidth: 7,
    sidewalk: 3.5,
    blockMargin: 11,
};
export const AVENUES = [-800, -640, -480, -320, -160, 0, 160, 320, 480, 640, 800];
export const STREETS = [-880, -720, -560, -400, -240, -80, 80, 240, 400, 560, 720, 840];
export const CAYO_AVENUES = [-160, 0, 160, 320];
export const CAYO_STREETS = [-880, -720, -560];
export const CHANNEL = { north: -430, south: -510 };
export const DISTRICTS = [
    { id: 'centro', name: 'Centro Solmar', minX: -320, maxX: 320, minZ: -380, maxZ: 360, minH: 22, maxH: 88, palette: [0xe8dcc8, 0xd9c7a7, 0xc9b8a3, 0xb8c4cc, 0xe0cfae] },
    { id: 'playa', name: 'Playa Dorado', minX: 350, maxX: 850, minZ: -350, maxZ: 350, minH: 8, maxH: 24, palette: [0xf2c9a4, 0xf7d9c4, 0xf5e6c8, 0xd9e8e4, 0xeeb9b0] },
    { id: 'barrio', name: 'Barrio Cobre', minX: -850, maxX: -350, minZ: -300, maxZ: 350, minH: 8, maxH: 18, palette: [0xd9a066, 0xc98a5a, 0xe0b184, 0xb5774a, 0xdba67e] },
    { id: 'puerto', name: 'Puerto Viejo', minX: -400, maxX: 450, minZ: 400, maxZ: 850, minH: 8, maxH: 16, palette: [0x9aa0a3, 0x8a8f92, 0xb0a89c, 0x7d838a, 0xa89a86] },
    { id: 'cayo', name: 'Cayo Verde', minX: -250, maxX: 350, minZ: -950, maxZ: -520, minH: 10, maxH: 30, palette: [0xe6e2d4, 0xf0e9d8, 0xd8e2d4, 0xe8d8c0, 0xcfd8dc] },
];
export function districtAt(x, z) {
    for (const d of DISTRICTS) {
        if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ)
            return d;
    }
    if (z < -430 && z > -510)
        return DISTRICTS[4];
    return DISTRICTS[0];
}
// Key locations from the brief (Three.js coords: +X east, -Z north).
export const LOC = {
    elFaroBar: { x: -540, z: 80 },
    vossCustoms: { x: -460, z: -140 },
    smpdHq: { x: 110, z: -60 },
    solmarArmory: { x: -120, z: 80 },
    safehouseMotel: { x: 520, z: 140 },
    vipLot: { x: 640, z: -180 },
    marina: { x: 780, z: 260 },
    portGate: { x: -60, z: 480 },
    containerYard: { x: 180, z: 660 },
    pier4: { x: 240, z: 740 },
    bridgeSouth: { x: 0, z: -410 },
    bridgeNorth: { x: 0, z: -510 },
    compoundGate: { x: 120, z: -720 },
    penthouseTerrace: { x: 120, z: -780 },
    vault: { x: 125, z: -805 },
    getawayGt: { x: 95, z: -750 },
    centralPlaza: { x: 0, z: 0 },
};
export const VEHICLES = {
    solmarGT: { id: 'solmarGT', name: 'Solmar GT', color: 0xc0c8d0, length: 4.6, width: 1.9, topSpeed: 52, accel: 22, brake: 34, grip: 2.6, hp: 120, seats: 2, police: false },
    v8Dorado: { id: 'v8Dorado', name: 'V8 Dorado', color: 0xd8542e, length: 4.9, width: 2.0, topSpeed: 47, accel: 19, brake: 30, grip: 2.2, hp: 140, seats: 2, police: false },
    metroCruiser: { id: 'metroCruiser', name: 'Metro Cruiser', color: 0x1c2a4a, length: 4.9, width: 2.0, topSpeed: 48, accel: 19, brake: 32, grip: 2.4, hp: 150, seats: 4, police: true },
    interceptor: { id: 'interceptor', name: 'SMPD Interceptor', color: 0x101828, length: 4.7, width: 1.95, topSpeed: 56, accel: 24, brake: 36, grip: 2.8, hp: 150, seats: 2, police: true },
    urbanSedan: { id: 'urbanSedan', name: 'Urban Sedan', color: 0x7a8a99, length: 4.7, width: 1.9, topSpeed: 40, accel: 14, brake: 28, grip: 2.0, hp: 100, seats: 4, police: false },
    cargoMule: { id: 'cargoMule', name: 'Cargo Mule', color: 0x4a5a68, length: 6.2, width: 2.3, topSpeed: 34, accel: 11, brake: 24, grip: 1.6, hp: 200, seats: 2, police: false },
    enforcer: { id: 'enforcer', name: 'Tactical Enforcer', color: 0x232a33, length: 6.4, width: 2.4, topSpeed: 38, accel: 13, brake: 26, grip: 1.8, hp: 260, seats: 4, police: true },
};
export const WEAPONS = [
    { id: 'melee', name: 'Fists', damage: 18, fireRate: 2.2, mag: 0, maxReserve: 0, range: 2.2, price: 0, auto: false },
    { id: 'kestrel', name: 'Kestrel 9mm', damage: 22, fireRate: 4.5, mag: 15, maxReserve: 120, range: 55, price: 0, auto: false },
    { id: 'viper', name: 'Viper Micro-SMG', damage: 14, fireRate: 11, mag: 32, maxReserve: 224, range: 42, price: 1200, auto: true },
    { id: 'bulldog', name: 'Bulldog Carbine', damage: 34, fireRate: 7, mag: 30, maxReserve: 180, range: 90, price: 2800, auto: true },
];
export const ECONOMY = {
    startCash: 250,
    respawnCost: 100,
    resprayCost: 200,
    armorCost: 500,
    armorValue: 100,
    ammoCost: 100,
    pedCashMin: 15,
    pedCashMax: 60,
    storyDiscount: 0.5,
};
export const PLAYER = {
    walkSpeed: 5.2,
    sprintSpeed: 9.0,
    aimSpeed: 2.6,
    radius: 0.45,
    height: 1.8,
    maxHealth: 100,
    maxArmor: 100,
};
export const WANTED = {
    decayPerSecond: 6,
    heatPerKill: 26,
    heatPerCopKill: 40,
    heatPerShotNearPolice: 8,
    heatPerSteal: 18,
    maxHeat: 100,
};
export const PALETTE = {
    amber: 0xffb347,
    amberCss: '#ffb347',
    teal: 0x2fd4c4,
    tealCss: '#2fd4c4',
    armorBlue: 0x4aa8ff,
    armorBlueCss: '#4aa8ff',
    coral: 0xff6b4a,
    sun: 0xffd27a,
    skyDay: 0x8ecae6,
    skySunset: 0xff9e5e,
    skyNight: 0x0e1a2e,
    fogSunset: 0xf2a56b,
};
export function clamp(v, min, max) {
    if (v < min)
        return min;
    if (v > max)
        return max;
    return v;
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function angleLerp(a, b, t) {
    let d = b - a;
    while (d > Math.PI)
        d -= Math.PI * 2;
    while (d < -Math.PI)
        d += Math.PI * 2;
    return a + d * t;
}
export function dist2d(ax, az, bx, bz) {
    const dx = ax - bx;
    const dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
}
export const UP = new THREE.Vector3(0, 1, 0);
