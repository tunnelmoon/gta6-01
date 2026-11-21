// Screenshot scenarios: deterministic setups for the four cover shots.
// Each scenario fixes the player, vehicles, enemies, wanted level and
// camera so the same URL renders the same frame every time.
export interface ShotConfig {
  shot: string;
  title: string;
  objectiveTitle: string;
  objectiveStep: string;
  objectiveDist: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  cameraYaw: number;
  inCar: boolean;
  carKey: string | null;
  carX: number;
  carZ: number;
  carHeading: number;
  carColor: number;
  wantedHeat: number;
  policeAt: { x: number; z: number }[];
  guards: { x: number; z: number; hp: number }[];
  cash: number;
  weaponSlot: number;
  timeOfDay: number;
  frames: number;
}

export const SHOT_CONFIGS: Record<string, ShotConfig> = {
  start: {
    shot: 'start',
    title: 'Title screen',
    objectiveTitle: '',
    objectiveStep: '',
    objectiveDist: 0,
    playerX: -540,
    playerZ: 80,
    playerHeading: Math.PI,
    cameraYaw: 0,
    inCar: false,
    carKey: null,
    carX: 0,
    carZ: 0,
    carHeading: 0,
    carColor: 0,
    wantedHeat: 0,
    policeAt: [],
    guards: [],
    cash: 250,
    weaponSlot: 1,
    timeOfDay: 0.62,
    frames: 150,
  },
  play: {
    shot: 'play',
    title: 'Open-world driving',
    objectiveTitle: 'Salt and Ignition - 1 of 4',
    objectiveStep: 'Deliver the GT to Voss Customs',
    objectiveDist: 420,
    playerX: 0,
    playerZ: 140,
    playerHeading: Math.PI,
    cameraYaw: Math.PI,
    inCar: true,
    carKey: 'solmarGT',
    carX: 0,
    carZ: 140,
    carHeading: Math.PI,
    carColor: 0xc0c8d0,
    wantedHeat: 45,
    policeAt: [
      { x: 40, z: 90 },
      { x: -40, z: 190 },
    ],
    guards: [],
    cash: 1750,
    weaponSlot: 2,
    timeOfDay: 0.62,
    frames: 150,
  },
  combat: {
    shot: 'combat',
    title: 'Mission combat',
    objectiveTitle: 'Salt and Ignition - 1 of 4',
    objectiveStep: 'Deal with the 3 lot guards',
    objectiveDist: 14,
    playerX: 632,
    playerZ: -172,
    playerHeading: Math.PI * 0.75,
    cameraYaw: Math.PI * 0.75,
    inCar: false,
    carKey: 'solmarGT',
    carX: 641,
    carZ: -182,
    carHeading: Math.PI / 2,
    carColor: 0xc0c8d0,
    wantedHeat: 0,
    policeAt: [],
    guards: [
      { x: 635, z: -180, hp: 60 },
      { x: 636, z: -176, hp: 60 },
      { x: 640, z: -176, hp: 60 },
    ],
    cash: 250,
    weaponSlot: 4,
    timeOfDay: 0.62,
    frames: 150,
  },
  end: {
    shot: 'end',
    title: 'Ending at the marina',
    objectiveTitle: 'Solmar Sunset - Story Complete',
    objectiveStep: 'Free Roam - Solmar is yours',
    objectiveDist: 0,
    playerX: 810,
    playerZ: 260,
    playerHeading: Math.PI / 2,
    cameraYaw: Math.PI / 2,
    inCar: false,
    carKey: 'solmarGT',
    carX: 812,
    carZ: 267,
    carHeading: Math.PI * 0.85,
    carColor: 0xc0c8d0,
    wantedHeat: 0,
    policeAt: [],
    guards: [],
    cash: 52000,
    weaponSlot: 2,
    timeOfDay: 0.66,
    frames: 150,
  },
};

export function parseShotParams(): { shot: string; seed: number } | null {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  const seed = Number(params.get('seed') ?? '1');
  return { shot, seed: Number.isFinite(seed) ? seed : 1 };
}
