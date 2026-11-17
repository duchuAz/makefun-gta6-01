// PALMA VISTA — shared tuning: the city's dimensions, the palette, arcade physics,
// weapon and car specs, radio stations. Every other module reads its numbers here so the
// world feels like one place instead of a pile of demos.

export const GAME_TITLE = 'PALMA VISTA';
export const SAVE_KEY = 'palma-vista-save-v1';
export const SAVE_VERSION = 1;

export const CITY = {
  grid: 48,          // distance between road centre lines
  roadsFrom: -4,     // road lines k * grid, k in [roadsFrom, roadsTo]
  roadsTo: 4,
  roadWidth: 14,
  sidewalk: 3.2,
  landMinX: -252,
  landMaxX: 205,
  landMinZ: -252,
  landMaxZ: 252,
  beachMaxX: 258,
  waterY: -0.55,
  causewayZ: 0,
  causewayFromX: 206,
  causewayToX: 520,
  causewayWidth: 17,
  blockLot: 34,
};

// Sun-washed art-deco palette. Bodies are muted pastels; signs and windows carry the neon.
export const PALETTE = {
  skyTop: 0x241b4d,
  skyMid: 0xff6f61,
  skyHorizon: 0xffd39b,
  sun: 0xfff0c4,
  fog: 0xffab88,
  asphalt: 0x24243a,
  sidewalk: 0xd9c9b6,
  sidewalkDark: 0xb9a795,
  sand: 0xf0d5a8,
  water: 0x1d6f86,
  grass: 0x4f7d58,
  buildings: [0xf2c6b2, 0xbfe3d0, 0xf6e5b8, 0xc9c0e8, 0x9fd8d8, 0xe8a9a0, 0xf0d0e0, 0xb7c8e8],
  awnings: [0xe85f6a, 0x2fa7a0, 0xf2a541, 0x7b61c9, 0xe86a9a],
  neon: [0xff4fa3, 0x4fe3ff, 0xffb347, 0xa56bff, 0x5cff9d, 0xff6b5c],
  police: [0x1a2a44, 0xf2f2f2],
  skin: [0xc98a63, 0x8a5a3c, 0xe0b18a, 0x6b4429, 0xd9a07a],
};

export const PLAYER = {
  walkSpeed: 4.4,
  sprintSpeed: 8.1,
  acceleration: 34,
  jumpSpeed: 6.2,
  gravity: 20,
  radius: 0.46,
  height: 1.82,
  maxHealth: 100,
  maxArmor: 100,
  respawnHealth: 100,
  startCash: 750,
  startWeapon: 'pistol',
  interactRange: 4.2,
};

export const WEAPONS = {
  fists: { name: 'FISTS', short: 'F', damage: 14, range: 2.45, rate: 0.34, ammo: Infinity, spread: 0, tracer: false, sound: 'punch' },
  pistol: { name: 'PISTOL', short: 'P', damage: 26, range: 70, rate: 0.26, ammo: 12, reserve: 84, spread: 0.012, tracer: true, sound: 'pistol' },
  smg: { name: 'SMG', short: 'S', damage: 13, range: 52, rate: 0.075, ammo: 30, reserve: 150, spread: 0.032, tracer: true, sound: 'smg' },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg'];

export const CARS = {
  sedan: { label: 'VISTA SEDAN', body: [1.92, 0.62, 4.25], cabin: [1.66, 0.56, 2.05], accel: 17, maxSpeed: 30, brake: 28, grip: 7.2, steer: 2.1, mass: 1.2, color: 0xe8d8c8 },
  sports: { label: 'SOLAR GT', body: [2.02, 0.5, 4.3], cabin: [1.55, 0.44, 1.65], accel: 27, maxSpeed: 42, brake: 34, grip: 9.5, steer: 2.5, mass: 1.0, color: 0x7de8c8 },
  muscle: { label: 'CORAL 88', body: [2.0, 0.66, 4.4], cabin: [1.7, 0.48, 1.8], accel: 23, maxSpeed: 37, brake: 26, grip: 5.6, steer: 2.3, mass: 1.35, color: 0xe86a5c },
  taxi: { label: 'SUN CAB', body: [1.94, 0.64, 4.3], cabin: [1.68, 0.56, 2.0], accel: 16, maxSpeed: 29, brake: 27, grip: 7.0, steer: 2.1, mass: 1.25, color: 0xf2c541 },
  van: { label: 'SURF VAN', body: [2.15, 1.25, 4.9], cabin: [1.9, 0.8, 2.4], accel: 13, maxSpeed: 25, brake: 22, grip: 6.0, steer: 1.9, mass: 1.7, color: 0xbfe3d0 },
  police: { label: 'PVPD CRUISER', body: [1.96, 0.62, 4.35], cabin: [1.68, 0.55, 2.0], accel: 28, maxSpeed: 44, brake: 34, grip: 8.4, steer: 2.45, mass: 1.3, color: 0x1a2a44 },
  gang: { label: 'SHADOW COUPE', body: [1.98, 0.54, 4.3], cabin: [1.6, 0.46, 1.75], accel: 25, maxSpeed: 39, brake: 31, grip: 8.2, steer: 2.4, mass: 1.1, color: 0x37294a },
};

export const WEAPON_AMMO_PACKS = {
  pistol: { ammo: 12, reserve: 48, price: 60 },
  smg: { ammo: 30, reserve: 90, price: 180 },
};

export const RADIO = [
  { name: 'VISTA FM 98.2', genre: 'SUNSET SYNTH', bpm: 104, root: 55, scale: [0, 3, 5, 7, 10], color: '#ff9a6b' },
  { name: 'NEON 88', genre: 'MIDNIGHT WAVE', bpm: 118, root: 49, scale: [0, 2, 3, 7, 8], color: '#ff4fa3' },
  { name: 'COSTA WAVE', genre: 'BEACH GROOVE', bpm: 96, root: 62, scale: [0, 2, 4, 7, 9], color: '#4fe3ff' },
  { name: 'PV TALK', genre: 'LOCAL VOICES', bpm: 80, root: 43, scale: [0, 5, 7], color: '#f2c541' },
];

export const WANTED_LABELS = [
  '', 'PVPD ALERT', 'PVPD ALERT', 'PVPD PURSUIT', 'PVPD LOCKDOWN', 'PVPD MAXIMUM',
];

export const TIME = {
  step: 1 / 60,
  maxFrame: 0.2,
};

export const SPAWN = { x: -14, z: 20, heading: 0.35 };
