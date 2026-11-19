// PALMA VISTA's city: a pastel art-deco grid between the mountains and sea.
// Everything below is generated from primitives and small canvas textures; there are no
// downloaded models or images. Buildings, windows, palms, lamps and crosswalks are instanced,
// the landmarks are assembled by hand, and every solid thing contributes a collision box that
// the player, the pedestrians and the cars all share.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { TAU, clamp, hash01, pick, rng, smoothstep } from './math.js';
// Landmarks and mission anchors. These coordinates are part of the level contract: missions,
// the minimap, the save file and the screenshot staging all look them up by name.
export const SPOTS = {
  cafe: { x: -18, z: 30, label: 'CAFÉ SOL' },
  marina: { x: 60, z: 236, label: 'MARINA DOCKS' },
  neon: { x: -20, z: -84, label: 'NEON ALLEY' },
  motors: { x: 68, z: -110, label: 'VISTA MOTORS' },
  mintCar: { x: 63, z: -112, heading: 0.15 },
  garage: { x: -158, z: 120, label: 'EL TALLER' },
  alley: { x: 151.5, z: 59, label: 'PVPD BACK LOT' },
  impound: { x: 114, z: 160, label: 'CITY IMPOUND' },
  drop: { x: 352, z: 0, label: 'CAUSEWAY DROP' },
  club: { x: -120, z: -155, label: 'CLUB SOL' },
  lighthouse: { x: 158, z: 235, label: 'VISTA LIGHTHOUSE' },
  hospital: { x: -54, z: 120, label: 'ST. PALMA HOSPITAL' },
  police: { x: 151, z: 61, label: 'PVPD HEADQUARTERS' },
  beach: { x: 226, z: -26, label: 'COSTA DORADA' },
  pier: { x: 228, z: 120, label: 'SUNSET PIER' },
};
// Blocks whose procedural buildings are suppressed, because a hand-built landmark owns the lot.
const RESERVED_BLOCKS = new Set([
  '24,24',     // Vista Tower
  '-24,24',    // Café Sol
  '72,-120',   // Vista Motors
  '-168,120',  // El Taller garage
  '120,168',   // city impound
  '168,72',    // police headquarters
  '-120,-168', // Club Sol
  '-72,120',   // hospital
  '-24,-72',   // Neon Alley plaza
]);
// Shop names draw from this pool; the sequence is stable because the seeded RNG drives it.
const SIGN_WORDS = [
  'HOTEL', 'CAFÉ', 'TACOS', 'SURF', 'MOTEL', 'VINYL', 'PALMS', 'SOL', 'RADIO',
  'VICE', 'MARINA', 'ARCADE', 'LIQUOR', 'DINER', 'NOCTURNO', 'BODEGA', 'CINE', 'FLAMENCO',
];
/**
 * Draws into a fresh canvas and wraps the result in a three.js texture. `repeat` opts the
 * texture into wrapping, which the road and pavement surfaces need.
 */
function makeCanvasTexture(textureWidth, textureHeight, paint, options = {}) {
  const { repeat = false } = options;
  const canvas = document.createElement('canvas');
  canvas.width = textureWidth;
  canvas.height = textureHeight;
  const ctx2d = canvas.getContext('2d');
  paint(ctx2d, textureWidth, textureHeight);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}
/** Dark asphalt with a fine aggregate speckle and a warm sunset kiss along the top row. */
function makeAsphaltTexture() {
  return makeCanvasTexture(128, 128, (ctx2d, width, height) => {
    ctx2d.fillStyle = '#2a2939';
    ctx2d.fillRect(0, 0, width, height);
    const speckle = rng(19);
    for (let i = 0; i < 900; i++) {
      const shade = 24 + Math.floor(speckle() * 32);
      ctx2d.fillStyle = `rgba(${shade},${shade},${shade + 9},${0.16 + speckle() * 0.24})`;
      ctx2d.fillRect(speckle() * width, speckle() * height, 1 + speckle() * 2, 1 + speckle() * 2);
    }
    ctx2d.fillStyle = 'rgba(255,204,150,0.05)';
    ctx2d.fillRect(0, 0, width, 2);
  }, { repeat: true });
}
/** Warm concrete pavers: soft grain, a border, and one expansion joint each way. */
function makeConcreteTexture() {
  return makeCanvasTexture(128, 128, (ctx2d, width, height) => {
    ctx2d.fillStyle = '#cbb9a5';
    ctx2d.fillRect(0, 0, width, height);
    const grain = rng(31);
    for (let i = 0; i < 700; i++) {
      const value = 175 + Math.floor(grain() * 55);
      ctx2d.fillStyle = `rgba(${value},${value - 12},${value - 26},0.2)`;
      ctx2d.fillRect(grain() * width, grain() * height, 1 + grain() * 2, 1 + grain() * 2);
    }
    ctx2d.strokeStyle = 'rgba(104,89,78,0.28)';
    ctx2d.lineWidth = 2;
    ctx2d.strokeRect(0, 0, width, height);
    ctx2d.strokeStyle = 'rgba(112,96,84,0.16)';
    ctx2d.beginPath();
    ctx2d.moveTo(0, height / 2);
    ctx2d.lineTo(width, height / 2);
    ctx2d.moveTo(width / 2, 0);
    ctx2d.lineTo(width / 2, height);
    ctx2d.stroke();
  }, { repeat: true });
}
/** Pale beach sand with single-pixel shell flecks. */
function makeSandTexture() {
  return makeCanvasTexture(128, 128, (ctx2d, width, height) => {
    ctx2d.fillStyle = '#eed5a6';
    ctx2d.fillRect(0, 0, width, height);
    const fleck = rng(53);
    for (let i = 0; i < 1200; i++) {
      const value = 205 + Math.floor(fleck() * 38);
      ctx2d.fillStyle = `rgba(${value},${value - 22},${value - 66},0.35)`;
      ctx2d.fillRect(fleck() * width, fleck() * height, 1, 1);
    }
  }, { repeat: true });
}
/** A soft radial falloff used by every glow sprite and light pool. */
function makeRadialTexture(innerColor = 'rgba(255,220,160,1)', outerColor = 'rgba(255,120,80,0)') {
  return makeCanvasTexture(128, 128, (ctx2d, width, height) => {
    const gradient = ctx2d.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.35, 'rgba(255,190,120,0.55)');
    gradient.addColorStop(1, outerColor);
    ctx2d.fillStyle = gradient;
    ctx2d.fillRect(0, 0, width, height);
  });
}
/** Neon sign face: a colored halo, a near-white core and an optional subtitle. */
function makeSignTexture(text, color, subtitle = '') {
  return makeCanvasTexture(512, 160, (ctx2d, width, height) => {
    ctx2d.clearRect(0, 0, width, height);
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.font = '900 76px Arial, Helvetica, sans-serif';
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 26;
    ctx2d.fillStyle = color;
    const titleY = subtitle ? height * 0.42 : height / 2;
    ctx2d.fillText(text, width / 2, titleY);
    ctx2d.shadowBlur = 10;
    ctx2d.fillStyle = '#fff8ee';
    ctx2d.globalAlpha = 0.9;
    ctx2d.fillText(text, width / 2, titleY);
    ctx2d.globalAlpha = 1;
    if (subtitle) {
      ctx2d.font = '700 28px Arial, Helvetica, sans-serif';
      ctx2d.shadowBlur = 12;
      ctx2d.fillStyle = color;
      ctx2d.fillText(subtitle, width / 2, height * 0.78);
    }
  });
}
/** A lit sign plane. Width controls the height through the fixed 16:5 face ratio. */
function makeSign(text, color, width, subtitle = '') {
  const texture = makeSignTexture(text, color, subtitle);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.3125), material);
  mesh.renderOrder = 2;
  return mesh;
}
/** Clones a sign's look for a second face without sharing the material instance. */
function cloneSignMaterial(material) {
  return new THREE.MeshBasicMaterial({
    map: material.map,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });
}
/** Additive glow card used around signs and lamps. */
function makeGlow(color, scale, opacity = 0.55) {
  const texture = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}
/** Convenience: a glow sprite already placed in the world. */
function glowAt(color, scale, opacity, x, y, z) {
  const glowSprite = makeGlow(color, scale, opacity);
  glowSprite.position.set(x, y, z);
  return glowSprite;
}
/**
 * Builds the whole city and returns the API the rest of the game uses. The construction order
 * below is intentional: each section may consume the seeded RNG, so moving a block would change
 * the skyline, the shop signs and the beach clutter even though the code would still run.
 */
export function buildCity(scene) {
  const cityGroup = new THREE.Group();
  cityGroup.name = 'PalmaVista';
  scene.add(cityGroup);
  const collisionBoxes = [];
  const blockLots = [];
  const buildingSpecs = [];
  const signMeshes = [];
  const animatedParts = { wheels: [], beams: [], boats: [], neon: [], water: null };
  const nextRandom = rng(601);
  const scratch = new THREE.Object3D();
  const scratchColor = new THREE.Color();
  /** Registers an axis-aligned footprint; width and depth are full extents, not radii. */
  function registerBox(x, z, width, depth) {
    collisionBoxes.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    });
  }
  // ------------------------------------------------------------ land, sea and roads
  const landMaterial = new THREE.MeshStandardMaterial({ color: 0xc8b7a3, roughness: 0.96 });
  const land = new THREE.Mesh(new THREE.PlaneGeometry(560, 520), landMaterial);
  land.rotation.x = -Math.PI / 2;
  land.position.set(-20, -0.02, 0);
  land.receiveShadow = true;
  cityGroup.add(land);
  const sandMaterial = new THREE.MeshStandardMaterial({ map: makeSandTexture(), color: 0xffffff, roughness: 1 });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(54, 512), sandMaterial);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(232, 0.04, 0);
  beach.receiveShadow = true;
  cityGroup.add(beach);
  const concreteTexture = makeConcreteTexture();
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ map: concreteTexture, color: 0xffffff, roughness: 0.94 });
  const asphaltTexture = makeAsphaltTexture();
  const roadMaterial = new THREE.MeshStandardMaterial({ map: asphaltTexture, color: 0xffffff, roughness: 0.92, metalness: 0.04 });
  const roadLines = [];
  for (let line = CITY.roadsFrom; line <= CITY.roadsTo; line++) {
    roadLines.push(line * CITY.grid);
  }
  const roadLength = 480;
  // One north-south and one east-west ribbon for every road line.
  for (const linePosition of roadLines) {
    const northSouth = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, roadLength), roadMaterial);
    northSouth.rotation.x = -Math.PI / 2;
    northSouth.rotation.z = 0;
    northSouth.position.set(linePosition, 0.015, 0);
    northSouth.receiveShadow = true;
    cityGroup.add(northSouth);
    const eastWest = new THREE.Mesh(new THREE.PlaneGeometry(roadLength, CITY.roadWidth), roadMaterial);
    eastWest.rotation.x = -Math.PI / 2;
    eastWest.position.set(0, 0.018, linePosition);
    eastWest.receiveShadow = true;
    cityGroup.add(eastWest);
  }
  // Blocks and their pavements. The key is the rounded centre so reserved lots match exactly.
  const blockCenters = [];
  for (let column = 0; column < roadLines.length - 1; column++) {
    for (let row = 0; row < roadLines.length - 1; row++) {
      const centerX = roadLines[column] + CITY.grid / 2;
      const centerZ = roadLines[row] + CITY.grid / 2;
      const blockKey = `${Math.round(centerX)},${Math.round(centerZ)}`;
      blockCenters.push({ cx: centerX, cz: centerZ, key: blockKey, i: column, j: row });
      const pavement = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY.blockLot + CITY.sidewalk * 2, CITY.blockLot + CITY.sidewalk * 2),
        sidewalkMaterial,
      );
      pavement.rotation.x = -Math.PI / 2;
      pavement.position.set(centerX, 0.1, centerZ);
      pavement.receiveShadow = true;
      cityGroup.add(pavement);
      blockLots.push({ x: centerX, z: centerZ, size: CITY.blockLot });
    }
  }
  // Lane dashes: an instanced strip every eight metres, in both directions.
  const dashGeometry = new THREE.BoxGeometry(1, 0.02, 1);
  const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xd8c89c, toneMapped: false });
  const dashCount = roadLines.length * (Math.floor(roadLength / 8) * 2);
  const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashCount);
  let dashIndex = 0;
  for (const linePosition of roadLines) {
    for (let offset = -232; offset <= 232; offset += 8) {
      scratch.position.set(linePosition, 0.05, offset);
      scratch.scale.set(0.24, 1, 3.2);
      scratch.rotation.set(0, 0, 0);
      scratch.updateMatrix();
      dashes.setMatrixAt(dashIndex++, scratch.matrix);
      scratch.position.set(offset, 0.052, linePosition);
      scratch.scale.set(3.2, 1, 0.24);
      scratch.updateMatrix();
      dashes.setMatrixAt(dashIndex++, scratch.matrix);
    }
  }
  dashes.count = dashIndex;
  cityGroup.add(dashes);
  // Crosswalk stripes at every intersection, four approaches of four stripes each.
  const stripeGeometry = new THREE.BoxGeometry(0.7, 0.02, 2.8);
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xf0e6d4, transparent: true, opacity: 0.75, toneMapped: false });
  const stripesPerIntersection = 4 * 4;
  const stripes = new THREE.InstancedMesh(
    stripeGeometry,
    stripeMaterial,
    stripesPerIntersection * roadLines.length * roadLines.length,
  );
  let stripeIndex = 0;
  for (const crossX of roadLines) {
    for (const crossZ of roadLines) {
      for (let side = 0; side < 4; side++) {
        for (let offset = -3; offset <= 3; offset += 2) {
          scratch.rotation.set(0, side >= 2 ? Math.PI / 2 : 0, 0);
          scratch.scale.set(1, 1, 1);
          if (side === 0) {
            scratch.position.set(crossX + offset * 0.9, 0.055, crossZ - CITY.roadWidth / 2 - 1.7);
          } else if (side === 1) {
            scratch.position.set(crossX + offset * 0.9, 0.055, crossZ + CITY.roadWidth / 2 + 1.7);
          } else if (side === 2) {
            scratch.position.set(crossX - CITY.roadWidth / 2 - 1.7, 0.055, crossZ + offset * 0.9);
          } else {
            scratch.position.set(crossX + CITY.roadWidth / 2 + 1.7, 0.055, crossZ + offset * 0.9);
          }
          scratch.updateMatrix();
          stripes.setMatrixAt(stripeIndex++, scratch.matrix);
        }
      }
    }
  }
  stripes.count = stripeIndex;
  cityGroup.add(stripes);
  // Yellow kerbs on the main avenues.
  for (const kerbPosition of [0, -96]) {
    for (const axis of ['x', 'z']) {
      const kerbGeometry = new THREE.BoxGeometry(
        axis === 'x' ? roadLength : 0.22,
        0.02,
        axis === 'x' ? 0.22 : roadLength,
      );
      const kerb = new THREE.Mesh(kerbGeometry, new THREE.MeshBasicMaterial({ color: 0xe7b74e, toneMapped: false }));
      kerb.position.set(axis === 'x' ? 0 : kerbPosition, 0.056, axis === 'x' ? kerbPosition : 0);
      cityGroup.add(kerb);
    }
  }
  // ------------------------------------------------------------ the buildings
  /**
   * Decides what occupies one block. Downtown gets a single tall slab; the beachfront gets a
   * pair of low shopfronts; the rest of the city gets two or three walk-ups. Every branch uses
   * the same RNG draws as the original generator.
   */
  function planBlockBuildings(baseX, baseZ) {
    const downtown = Math.abs(baseX) < 120 && Math.abs(baseZ) < 120;
    const beachside = baseX > 120;
    if (downtown) {
      const height = 34 + nextRandom() * 56;
      return [{
        x: baseX + (nextRandom() - 0.5) * 5,
        z: baseZ + (nextRandom() - 0.5) * 5,
        w: 28,
        d: 28,
        h: height,
        color: pick(PALETTE.buildings, nextRandom),
      }];
    }
    if (beachside) {
      const count = 2 + Math.floor(nextRandom() * 2);
      const planned = [];
      for (let k = 0; k < count; k++) {
        const width = 13 + nextRandom() * 6;
        const depth = 13 + nextRandom() * 6;
        const x = baseX + (k % 2 === 0 ? -8 : 8) + (nextRandom() - 0.5) * 2;
        const z = baseZ + (k < 2 ? -8 : 8) + (nextRandom() - 0.5) * 2;
        planned.push({
          x, z, w: width, d: depth,
          h: 6 + nextRandom() * 9,
          color: pick(PALETTE.buildings, nextRandom),
          shop: true,
        });
      }
      return planned;
    }
    const count = 2 + Math.floor(nextRandom() * 3);
    const planned = [];
    for (let k = 0; k < count; k++) {
      const width = 12 + nextRandom() * 5;
      const depth = 12 + nextRandom() * 5;
      const x = baseX + (k === 0 ? -8 : k === 1 ? 8 : -7) + (nextRandom() - 0.5) * 2;
      const z = baseZ + (k < 2 ? -8 : 8) + (nextRandom() - 0.5) * 2;
      planned.push({
        x, z, w: width, d: depth,
        h: 14 + nextRandom() * 26,
        color: pick(PALETTE.buildings, nextRandom),
        shop: k === 0 && nextRandom() < 0.55,
      });
    }
    return planned;
  }
  for (const lot of blockCenters) {
    if (RESERVED_BLOCKS.has(lot.key)) continue;
    for (const spec of planBlockBuildings(lot.cx, lot.cz)) {
      buildingSpecs.push(spec);
    }
  }
  // Bodies: one instanced draw for every building, tinted through instance colours.
  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.03 });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, buildingSpecs.length);
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  const windowMatrices = [];
  const windowColors = [];
  const roofTrims = [];
  /** Picks a lit-window colour from the same four-way distribution as the original. */
  function windowColorFor(buildingIndex, floor, column, side) {
    const roll = hash01(buildingIndex * 977 + floor * 41 + column * 17 + side);
    if (roll > 0.58) return new THREE.Color(0xffcf87);
    if (roll > 0.42) return new THREE.Color(0x8ce8df);
    if (roll > 0.30) return new THREE.Color(0xff9d7a);
    return new THREE.Color(0x2c3355);
  }
  buildingSpecs.forEach((building, buildingIndex) => {
    const baseY = 0.1;
    scratch.position.set(building.x, baseY + building.h / 2, building.z);
    scratch.scale.set(building.w, building.h, building.d);
    scratch.rotation.set(0, 0, 0);
    scratch.updateMatrix();
    bodies.setMatrixAt(buildingIndex, scratch.matrix);
    bodies.setColorAt(buildingIndex, scratchColor.setHex(building.color));
    registerBox(building.x, building.z, building.w + 0.6, building.d + 0.6);
    const floorCount = Math.max(1, Math.floor((building.h - 3) / 3.1));
    const columnsAlongX = Math.max(1, Math.floor((building.w - 2) / 2.9));
    const columnsAlongZ = Math.max(1, Math.floor((building.d - 2) / 2.9));
    // Kept for parity with the original generator; the value is not otherwise consumed.
    const facadeSeed = hash01(buildingIndex * 91 + 7);
    void facadeSeed;
    for (let floor = 0; floor < floorCount; floor++) {
      const windowY = baseY + 2.6 + floor * 3.1;
      // Windows on the two faces that look along Z.
      for (let column = 0; column < columnsAlongX; column++) {
        const windowX = building.x - building.w / 2 + (building.w / (columnsAlongX + 1)) * (column + 1);
        for (const side of [-1, 1]) {
          const litRoll = hash01(buildingIndex * 131 + floor * 13 + column * 7 + side);
          if (litRoll <= 0.27) continue;
          const windowZ = building.z + side * (building.d / 2 + 0.025);
          const rotation = side > 0 ? 0 : Math.PI;
          windowMatrices.push([windowX, windowY, windowZ, rotation, 1.0, 1.35]);
          windowColors.push(windowColorFor(buildingIndex, floor, column, side));
        }
      }
      // Windows on the two faces that look along X.
      for (let column = 0; column < columnsAlongZ; column++) {
        const windowZ = building.z - building.d / 2 + (building.d / (columnsAlongZ + 1)) * (column + 1);
        for (const side of [-1, 1]) {
          const litRoll = hash01(buildingIndex * 197 + floor * 11 + column * 5 + side);
          if (litRoll <= 0.31) continue;
          const windowX = building.x + side * (building.w / 2 + 0.025);
          const rotation = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          windowMatrices.push([windowX, windowY, windowZ, rotation, 1.0, 1.35]);
          windowColors.push(windowColorFor(buildingIndex, floor, column, side + 4));
        }
      }
    }
    // A rooftop lip for the taller buildings, plus an occasional neon crown.
    if (building.h > 22) {
      roofTrims.push({
        x: building.x,
        y: baseY + building.h - 0.35,
        z: building.z,
        w: building.w + 0.4,
        d: building.d + 0.4,
        h: 0.5,
        color: building.color,
      });
      if (hash01(buildingIndex * 37 + 3) > 0.72) {
        const neonColor = pick(PALETTE.neon, nextRandom);
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(building.w + 0.25, 0.22, building.d + 0.25),
          new THREE.MeshBasicMaterial({ color: neonColor, toneMapped: false }),
        );
        crown.position.set(building.x, baseY + building.h + 0.15, building.z);
        cityGroup.add(crown);
        animatedParts.neon.push(crown.material);
      }
    }
    // Ground-floor shop front and awning, with a glowing name above it.
    if (building.shop || (building.h < 20 && nextRandom() < 0.45)) {
      const facing = nextRandom() < 0.5 ? 1 : -1;
      const alongX = nextRandom() < 0.5;
      const awningX = building.x + (alongX ? 0 : facing * (building.w / 2 + 0.7));
      const awningZ = building.z + (alongX ? facing * (building.d / 2 + 0.7) : 0);
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? building.w * 0.8 : 1.6, 0.22, alongX ? 1.6 : building.d * 0.8),
        new THREE.MeshStandardMaterial({ color: pick(PALETTE.awnings, nextRandom), roughness: 0.8 }),
      );
      awning.position.set(awningX, 3.1, awningZ);
      awning.castShadow = true;
      cityGroup.add(awning);
      const shopWord = pick(SIGN_WORDS, nextRandom);
      const neonColor = pick(PALETTE.neon, nextRandom);
      const shopSign = makeSign(shopWord, `#${neonColor.toString(16).padStart(6, '0')}`, alongX ? 6.2 : 6.2);
      shopSign.position.set(
        building.x + (alongX ? 0 : facing * (building.w / 2 + 0.12)),
        Math.min(4.9, building.h - 1.2),
        building.z + (alongX ? facing * (building.d / 2 + 0.12) : 0),
      );
      shopSign.rotation.y = alongX
        ? (facing > 0 ? 0 : Math.PI)
        : (facing > 0 ? Math.PI / 2 : -Math.PI / 2);
      cityGroup.add(shopSign);
      signMeshes.push(shopSign);
      const shopGlow = makeGlow(neonColor, 5.5, 0.22);
      shopGlow.position.copy(shopSign.position);
      cityGroup.add(shopGlow);
      animatedParts.neon.push(shopSign.material);
    }
  });
  bodies.instanceColor.needsUpdate = true;
  cityGroup.add(bodies);
  // Window quads share one instanced mesh and one white material; colour comes per instance.
  const windowGeometry = new THREE.PlaneGeometry(1, 1);
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
  const windows = new THREE.InstancedMesh(windowGeometry, windowMaterial, windowMatrices.length);
  windowMatrices.forEach((matrix, index) => {
    scratch.position.set(matrix[0], matrix[1], matrix[2]);
    scratch.rotation.set(0, matrix[3], 0);
    scratch.scale.set(0.95 * matrix[4], 1.25 * matrix[5], 1);
    scratch.updateMatrix();
    windows.setMatrixAt(index, scratch.matrix);
    windows.setColorAt(index, windowColors[index]);
  });
  windows.instanceColor.needsUpdate = true;
  cityGroup.add(windows);
  // Roof lips use a second instanced mesh tinted to each building's body colour.
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const trimMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), trimMaterial, roofTrims.length);
  roofTrims.forEach((trim, index) => {
    scratch.position.set(trim.x, trim.y, trim.z);
    scratch.scale.set(trim.w, trim.h, trim.d);
    scratch.rotation.set(0, 0, 0);
    scratch.updateMatrix();
    trimMesh.setMatrixAt(index, scratch.matrix);
    trimMesh.setColorAt(index, scratchColor.setHex(trim.color));
  });
  trimMesh.instanceColor.needsUpdate = true;
  trimMesh.castShadow = true;
  cityGroup.add(trimMesh);
  // ------------------------------------------------------------ palms, lamps and street furniture
  const palmSpots = [];
  for (let z = -228; z <= 228; z += 22) {
    palmSpots.push({ x: 212 + (hash01(z) - 0.5) * 7, z, s: 0.9 + hash01(z * 3) * 0.55 });
  }
  for (let z = -204; z <= 204; z += 48) {
    palmSpots.push({ x: 202, z: z + 8, s: 0.95 + hash01(z * 7) * 0.4 });
  }
  for (const blockX of [-24, 24, 72, -72, 120, -120]) {
    palmSpots.push({ x: blockX - 16, z: -16, s: 1.0 });
    palmSpots.push({ x: blockX + 16, z: 16, s: 1.1 });
  }
  palmSpots.push(
    { x: -232, z: 18, s: 1.2 },
    { x: -232, z: -30, s: 1.0 },
    { x: 196, z: 216, s: 1.15 },
    { x: 184, z: 226, s: 1.0 },
  );
  palmSpots.push({ x: -41.5, z: -89.5, s: 1.15 }, { x: 9, z: -86, s: 1.05 });
  const trunkGeometry = new THREE.CylinderGeometry(0.17, 0.34, 6.4, 7);
  trunkGeometry.translate(0, 3.2, 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6a4d, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, palmSpots.length);
  trunks.castShadow = true;
  palmSpots.forEach((palm, index) => {
    scratch.position.set(palm.x, 0.1, palm.z);
    scratch.rotation.set(0, hash01(index * 7) * TAU, 0);
    scratch.scale.set(palm.s, palm.s, palm.s);
    scratch.updateMatrix();
    trunks.setMatrixAt(index, scratch.matrix);
  });
  cityGroup.add(trunks);
  const frondGeometry = new THREE.ConeGeometry(0.62, 3.7, 4);
  frondGeometry.translate(0, 1.85, 0);
  const frondMaterial = new THREE.MeshStandardMaterial({ color: 0x3e7d58, roughness: 0.9, side: THREE.DoubleSide });
  const frondCount = palmSpots.length * 7;
  const fronds = new THREE.InstancedMesh(frondGeometry, frondMaterial, frondCount);
  fronds.castShadow = true;
  const upAxis = new THREE.Vector3(0, 1, 0);
  const frondDirection = new THREE.Vector3();
  const frondRotation = new THREE.Quaternion();
  const palmCrown = new THREE.Vector3();
  let frondIndex = 0;
  palmSpots.forEach((palm, palmIndex) => {
    for (let blade = 0; blade < 7; blade++) {
      const angle = (blade / 7) * TAU + hash01(palmIndex * 13 + blade) * 0.5;
      frondDirection
        .set(Math.cos(angle), -0.08 + hash01(palmIndex + blade * 3) * 0.34, Math.sin(angle))
        .normalize();
      frondRotation.setFromUnitVectors(upAxis, frondDirection);
      palmCrown.set(palm.x, 0.1 + 6.4 * palm.s, palm.z);
      scratch.position.copy(palmCrown);
      scratch.quaternion.copy(frondRotation);
      scratch.scale.set(1, palm.s * (0.85 + hash01(palmIndex * 19 + blade) * 0.4), 0.5);
      scratch.updateMatrix();
      fronds.setMatrixAt(frondIndex++, scratch.matrix);
    }
  });
  cityGroup.add(fronds);
  // Street lamps: warm globes at corners, with a pool of light painted on the pavement.
  const lampSpots = [];
  for (let index = 0; index < 14; index++) {
    const angle = (index / 14) * TAU;
    lampSpots.push({ x: Math.cos(angle) * 152, z: Math.sin(angle) * 152 });
  }
  lampSpots.push(
    { x: -12, z: 12 },
    { x: 12, z: -12 },
    { x: 60, z: 12 },
    { x: -60, z: -12 },
    { x: 108, z: 12 },
    { x: -108, z: -12 },
  );
  const poleGeometry = new THREE.CylinderGeometry(0.08, 0.13, 6.2, 6);
  poleGeometry.translate(0, 3.1, 0);
  const poleMesh = new THREE.InstancedMesh(
    poleGeometry,
    new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.6, metalness: 0.4 }),
    lampSpots.length,
  );
  const globeGeometry = new THREE.SphereGeometry(0.3, 8, 6);
  const globeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd39b, toneMapped: false });
  const globes = new THREE.InstancedMesh(globeGeometry, globeMaterial, lampSpots.length);
  lampSpots.forEach((lamp, index) => {
    scratch.position.set(lamp.x, 0.1, lamp.z);
    scratch.rotation.set(0, 0, 0);
    scratch.scale.set(1, 1, 1);
    scratch.updateMatrix();
    poleMesh.setMatrixAt(index, scratch.matrix);
    scratch.position.set(lamp.x, 6.45, lamp.z);
    scratch.updateMatrix();
    globes.setMatrixAt(index, scratch.matrix);
  });
  cityGroup.add(poleMesh, globes);
  const poolGeometry = new THREE.CircleGeometry(4.5, 16);
  const poolMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc47a,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const lightPools = new THREE.InstancedMesh(poolGeometry, poolMaterial, lampSpots.length);
  lampSpots.forEach((lamp, index) => {
    scratch.position.set(lamp.x, 0.09, lamp.z);
    scratch.rotation.set(-Math.PI / 2, 0, 0);
    scratch.scale.set(1, 1, 1);
    scratch.updateMatrix();
    lightPools.setMatrixAt(index, scratch.matrix);
  });
  cityGroup.add(lightPools);
  // Beach umbrellas and the towels scattered around them.
  const umbrellas = [];
  for (let index = 0; index < 14; index++) {
    umbrellas.push({ x: 218 + nextRandom() * 26, z: -210 + nextRandom() * 420 });
  }
  const umbrellaGeometry = new THREE.ConeGeometry(2.3, 1.2, 10);
  const umbrellaMesh = new THREE.InstancedMesh(
    umbrellaGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    umbrellas.length,
  );
  const umbrellaPoleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5);
  const umbrellaPoles = new THREE.InstancedMesh(
    umbrellaPoleGeometry,
    new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }),
    umbrellas.length,
  );
  umbrellas.forEach((umbrella, index) => {
    scratch.position.set(umbrella.x, 2.5, umbrella.z);
    scratch.rotation.set(0, hash01(index * 9) * TAU, 0);
    scratch.scale.set(1, 1, 1);
    scratch.updateMatrix();
    umbrellaMesh.setMatrixAt(index, scratch.matrix);
    umbrellaMesh.setColorAt(
      index,
      scratchColor.setHex(pick([0xe85f6a, 0x2fa7a0, 0xf2a541, 0xf0d0e0], nextRandom)),
    );
    scratch.position.set(umbrella.x, 1.3, umbrella.z);
    scratch.updateMatrix();
    umbrellaPoles.setMatrixAt(index, scratch.matrix);
  });
  umbrellaMesh.instanceColor.needsUpdate = true;
  cityGroup.add(umbrellaMesh, umbrellaPoles);
  const towelGeometry = new THREE.PlaneGeometry(1.5, 2.6);
  const towels = new THREE.InstancedMesh(
    towelGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }),
    16,
  );
  for (let index = 0; index < 16; index++) {
    scratch.position.set(216 + nextRandom() * 28, 0.09, -200 + nextRandom() * 400);
    scratch.rotation.set(-Math.PI / 2, 0, nextRandom() * TAU);
    scratch.scale.set(1, 1, 1);
    scratch.updateMatrix();
    towels.setMatrixAt(index, scratch.matrix);
    towels.setColorAt(
      index,
      scratchColor.setHex(pick([0xffb347, 0xff6b8a, 0x6bc8c8, 0xf0e0b0], nextRandom)),
    );
  }
  towels.instanceColor.needsUpdate = true;
  cityGroup.add(towels);
  // Bollards march down the promenade at a fixed fourteen-metre pitch.
  const bollards = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3c3c4c }),
    34,
  );
  for (let index = 0; index < 34; index++) {
    scratch.position.set(198, 0.5, -230 + index * 14);
    scratch.rotation.set(0, 0, 0);
    scratch.scale.set(1, 1, 1);
    scratch.updateMatrix();
    bollards.setMatrixAt(index, scratch.matrix);
  }
  cityGroup.add(bollards);
  // ------------------------------------------------------------ landmarks
  // Vista Tower, the pastel needle over downtown.
  {
    const towerX = 24;
    const towerZ = 24;
    const baseY = 0.1;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 16, 118, 8),
      new THREE.MeshStandardMaterial({
        color: 0xbfe3d0,
        roughness: 0.35,
        metalness: 0.28,
        emissive: 0x0d2a33,
        emissiveIntensity: 0.28,
      }),
    );
    tower.position.set(towerX, baseY + 59, towerZ);
    tower.castShadow = true;
    tower.receiveShadow = true;
    cityGroup.add(tower);
    registerBox(towerX, towerZ, 28, 28);
    for (const ringHeight of [34, 68, 100]) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(13.2, 13.2, 0.45, 8),
        new THREE.MeshBasicMaterial({ color: 0x4fe3ff, toneMapped: false }),
      );
      ring.position.set(towerX, baseY + ringHeight, towerZ);
      cityGroup.add(ring);
      animatedParts.neon.push(ring.material);
    }
    const towerCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 12.4, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf6e5b8, emissive: 0xff8a5c, emissiveIntensity: 0.4, roughness: 0.4 }),
    );
    towerCrown.position.set(towerX, baseY + 123, towerZ);
    cityGroup.add(towerCrown);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 1.1, 22, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8d0c0, metalness: 0.6, roughness: 0.3 }),
    );
    spire.position.set(towerX, baseY + 139, towerZ);
    cityGroup.add(spire);
    const topLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false }),
    );
    topLight.position.set(towerX, baseY + 150, towerZ);
    cityGroup.add(topLight);
    animatedParts.neon.push(topLight.material);
    const towerSign = makeSign('VISTA', '#4fe3ff', 13);
    towerSign.position.set(towerX, baseY + 110, towerZ + 12.1);
    cityGroup.add(towerSign);
    cityGroup.add(glowAt(0x4fe3ff, 20, 0.3, towerX, baseY + 110, towerZ + 12.5));
  }
  // Café Sol: a small terrace where the story starts.
  {
    const cafeX = -34;
    const cafeZ = 18;
    const cafe = new THREE.Mesh(
      new THREE.BoxGeometry(13, 5.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xf2c6b2, roughness: 0.85 }),
    );
    cafe.position.set(cafeX, 2.7, cafeZ);
    cafe.castShadow = true;
    cafe.receiveShadow = true;
    cityGroup.add(cafe);
    registerBox(cafeX, cafeZ, 13.5, 12.5);
    const cafeSign = makeSign('CAFÉ SOL', '#ffb347', 7.5, 'DESDE 1987');
    cafeSign.position.set(cafeX + 6.6, 4.2, cafeZ + 2);
    cafeSign.rotation.y = Math.PI / 2;
    cityGroup.add(cafeSign);
    cityGroup.add(glowAt(0xffb347, 7, 0.25, cafeX + 6.8, 4.2, cafeZ + 2));
    for (let index = 0; index < 4; index++) {
      const table = new THREE.Group();
      const tableTop = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 0.12, 12),
        new THREE.MeshStandardMaterial({ color: 0xf0e6d4, roughness: 0.5 }),
      );
      tableTop.position.y = 1.05;
      const tableLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.18, 1.0, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a3a4a }),
      );
      tableLeg.position.y = 0.55;
      table.add(tableTop, tableLeg);
      table.position.set(-37 + (index % 2) * 5, 0.1, 28 + Math.floor(index / 2) * 7);
      table.castShadow = true;
      cityGroup.add(table);
      const chairSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.12, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xe85f6a }),
      );
      chairSeat.position.set(table.position.x + 1.6, 0.6, table.position.z);
      cityGroup.add(chairSeat);
      const chairBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xe85f6a }),
      );
      chairBack.position.set(table.position.x + 2.0, 1.0, table.position.z);
      cityGroup.add(chairBack);
    }
    const terraceUmbrella = new THREE.Mesh(
      new THREE.ConeGeometry(4.2, 1.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2a541, roughness: 0.85 }),
    );
    terraceUmbrella.position.set(-34, 5.0, 31);
    cityGroup.add(terraceUmbrella);
  }
  // Vista Motors: glass showroom and an open forecourt with the mint car.
  {
    const showroomX = 72;
    const showroomZ = -130;
    const showroom = new THREE.Mesh(
      new THREE.BoxGeometry(25, 8, 14),
      new THREE.MeshStandardMaterial({
        color: 0x9fd8d8,
        roughness: 0.18,
        metalness: 0.55,
        emissive: 0x0a2a33,
        emissiveIntensity: 0.2,
      }),
    );
    showroom.position.set(showroomX, 4.1, showroomZ);
    showroom.castShadow = true;
    showroom.receiveShadow = true;
    cityGroup.add(showroom);
    registerBox(showroomX, showroomZ, 25.5, 14.5);
    const showroomRoof = new THREE.Mesh(
      new THREE.BoxGeometry(26.5, 0.7, 15.5),
      new THREE.MeshStandardMaterial({ color: 0xf6e5b8, roughness: 0.6 }),
    );
    showroomRoof.position.set(showroomX, 8.3, showroomZ);
    cityGroup.add(showroomRoof);
    const motorsSign = makeSign('VISTA MOTORS', '#4fe3ff', 15, 'SUN · SAND · SPEED');
    motorsSign.position.set(showroomX, 8.3, showroomZ + 7.75);
    cityGroup.add(motorsSign);
    cityGroup.add(glowAt(0x4fe3ff, 16, 0.28, showroomX, 8.3, showroomZ + 8));
    for (let index = 0; index < 3; index++) {
      const lightBar = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.1, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xe8fff8, toneMapped: false }),
      );
      lightBar.position.set(showroomX - 7 + index * 7, 7.8, showroomZ + 6.6);
      cityGroup.add(lightBar);
    }
    const displayPad = new THREE.Mesh(
      new THREE.CircleGeometry(5, 24),
      new THREE.MeshStandardMaterial({ color: 0x34344a, roughness: 0.9 }),
    );
    displayPad.rotation.x = -Math.PI / 2;
    displayPad.position.set(63, 0.12, -112);
    cityGroup.add(displayPad);
  }
  // El Taller: garage under the western palms.
  {
    const garageX = -174;
    const garageZ = 120;
    const garage = new THREE.Mesh(
      new THREE.BoxGeometry(20, 9.5, 25),
      new THREE.MeshStandardMaterial({ color: 0xb7c8e8, roughness: 0.8 }),
    );
    garage.position.set(garageX, 4.75, garageZ);
    garage.castShadow = true;
    garage.receiveShadow = true;
    cityGroup.add(garage);
    registerBox(garageX, garageZ, 20.5, 25.5);
    const rollerDoor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6),
      new THREE.MeshStandardMaterial({ color: 0x3b4152, roughness: 0.5, metalness: 0.35 }),
    );
    rollerDoor.position.set(garageX, 3.1, garageZ + 12.56);
    cityGroup.add(rollerDoor);
    for (let index = 0; index < 6; index++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(9, 0.08, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x6b7185 }),
      );
      slat.position.set(garageX, 0.6 + index * 1.0, garageZ + 12.6);
      cityGroup.add(slat);
    }
    const garageSign = makeSign('EL TALLER', '#ff4fa3', 11, 'REPAIRS · NO QUESTIONS');
    garageSign.position.set(garageX, 8.5, garageZ + 12.8);
    cityGroup.add(garageSign);
    cityGroup.add(glowAt(0xff4fa3, 12, 0.25, garageX, 8.5, garageZ + 13));
    const trafficCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.9, 6),
      new THREE.MeshStandardMaterial({ color: 0xff6b3a }),
    );
    trafficCone.position.set(garageX + 9, 0.55, garageZ + 14);
    cityGroup.add(trafficCone);
  }
  // City impound: chain fence, office and a yard for the evidence crates.
  {
    const office = new THREE.Mesh(
      new THREE.BoxGeometry(13, 5.5, 11),
      new THREE.MeshStandardMaterial({ color: 0xd9c9b6, roughness: 0.9 }),
    );
    office.position.set(130, 2.85, 177);
    office.castShadow = true;
    cityGroup.add(office);
    registerBox(130, 177, 13.5, 11.5);
    const fenceMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b7185,
      roughness: 0.5,
      metalness: 0.6,
      transparent: true,
      opacity: 0.55,
    });
    const fencePostGeometry = new THREE.BoxGeometry(0.12, 2.6, 0.12);
    for (let step = 0; step <= 30; step++) {
      const northPost = new THREE.Mesh(fencePostGeometry, fenceMaterial);
      northPost.position.set(104 + step, 1.4, 152);
      cityGroup.add(northPost);
      const southPost = new THREE.Mesh(fencePostGeometry, fenceMaterial);
      southPost.position.set(104 + step, 1.4, 186);
      cityGroup.add(southPost);
    }
    for (const railHeight of [154, 158, 162]) {
      const northRail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 0.08), fenceMaterial);
      northRail.position.set(119, railHeight * 0.012 + 1.1, 152);
      cityGroup.add(northRail);
      const southRail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 0.08), fenceMaterial);
      southRail.position.set(119, railHeight * 0.012 + 1.1, 186);
      cityGroup.add(southRail);
    }
    const impoundSign = makeSign('CITY IMPOUND', '#ffb347', 9);
    impoundSign.position.set(130, 6.2, 171.35);
    cityGroup.add(impoundSign);
    registerBox(119, 152, 31, 0.6);
    registerBox(119, 186, 31, 0.6);
  }
  // PVPD headquarters: blue glass, neon stripe and a rooftop mast.
  {
    const stationX = 168;
    const stationZ = 72;
    const station = new THREE.Mesh(
      new THREE.BoxGeometry(27, 13, 21),
      new THREE.MeshStandardMaterial({ color: 0xc9c0e8, roughness: 0.55, metalness: 0.15 }),
    );
    station.position.set(stationX, 6.6, stationZ);
    station.castShadow = true;
    station.receiveShadow = true;
    cityGroup.add(station);
    registerBox(stationX, stationZ, 27.5, 21.5);
    const stationStripe = new THREE.Mesh(
      new THREE.BoxGeometry(27.2, 0.5, 21.2),
      new THREE.MeshBasicMaterial({ color: 0x4f8cff, toneMapped: false }),
    );
    stationStripe.position.set(stationX, 8.6, stationZ);
    cityGroup.add(stationStripe);
    animatedParts.neon.push(stationStripe.material);
    const stationSign = makeSign('PVPD', '#4fa3ff', 10, 'PALMA VISTA POLICE');
    stationSign.position.set(stationX, 11.4, stationZ + 10.7);
    cityGroup.add(stationSign);
    cityGroup.add(glowAt(0x4f8cff, 13, 0.25, stationX, 11.4, stationZ + 11));
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a5060, metalness: 0.6 }),
    );
    mast.position.set(stationX, 17, stationZ - 6);
    cityGroup.add(mast);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff4f6a, toneMapped: false }),
    );
    beacon.position.set(stationX, 21, stationZ - 6);
    cityGroup.add(beacon);
    animatedParts.neon.push(beacon.material);
  }
  // Club Sol: the neon heart of the strip.
  {
    const clubX = -120;
    const clubZ = -176;
    const club = new THREE.Mesh(
      new THREE.BoxGeometry(26, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a2f6b, roughness: 0.7, emissive: 0x1a0728, emissiveIntensity: 0.6 }),
    );
    club.position.set(clubX, 5.1, clubZ);
    club.castShadow = true;
    cityGroup.add(club);
    registerBox(clubX, clubZ, 26.5, 20.5);
    const clubSign = makeSign('CLUB SOL', '#ff4fa3', 16, 'LOS CUERVOS · TONIGHT');
    clubSign.position.set(clubX, 9.5, clubZ + 10.2);
    cityGroup.add(clubSign);
    cityGroup.add(glowAt(0xff4fa3, 22, 0.4, clubX, 9.5, clubZ + 11));
    const clubDoor = new THREE.Mesh(
      new THREE.BoxGeometry(5, 5.5, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }),
    );
    clubDoor.position.set(clubX, 2.85, clubZ + 10.1);
    cityGroup.add(clubDoor);
    for (let index = 0; index < 6; index++) {
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 1.0, 6),
        new THREE.MeshStandardMaterial({ color: 0xd8b45a, metalness: 0.7 }),
      );
      bollard.position.set(clubX - 8 + index * 3.2, 0.6, clubZ + 14);
      cityGroup.add(bollard);
    }
  }
  // St. Palma hospital: white grid, red cross.
  {
    const hospitalX = -72;
    const hospitalZ = 120;
    const hospital = new THREE.Mesh(
      new THREE.BoxGeometry(28, 15, 20),
      new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.8 }),
    );
    hospital.position.set(hospitalX, 7.6, hospitalZ);
    hospital.castShadow = true;
    hospital.receiveShadow = true;
    cityGroup.add(hospital);
    registerBox(hospitalX, hospitalZ, 28.5, 20.5);
    const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xe85f6a, toneMapped: false });
    const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 0.3), crossMaterial);
    crossHorizontal.position.set(hospitalX, 11, hospitalZ + 10.2);
    cityGroup.add(crossHorizontal);
    const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 0.3), crossMaterial);
    crossVertical.position.set(hospitalX, 11, hospitalZ + 10.2);
    cityGroup.add(crossVertical);
    const hospitalSign = makeSign('ST. PALMA', '#ff6b7a', 9);
    hospitalSign.position.set(hospitalX, 7.4, hospitalZ + 10.25);
    cityGroup.add(hospitalSign);
  }
  // ------------------------------------------------------------ beach landmarks
  // Ferris wheel on the sand.
  {
    const wheel = new THREE.Group();
    wheel.position.set(236, 15, -100);
    wheel.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(12, 0.22, 6, 36),
      new THREE.MeshStandardMaterial({ color: 0xf6e5b8, emissive: 0xff8a5c, emissiveIntensity: 0.55, roughness: 0.4 }),
    );
    wheel.add(rim);
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.5, 0.1, 5, 28),
      new THREE.MeshStandardMaterial({ color: 0xff6b8a, emissive: 0xff2f6a, emissiveIntensity: 0.5 }),
    );
    wheel.add(innerRing);
    const spokeMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d8b0 });
    for (let index = 0; index < 12; index++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 24, 0.1), spokeMaterial);
      spoke.rotation.z = (index / 12) * Math.PI;
      wheel.add(spoke);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 6, 5),
        new THREE.MeshBasicMaterial({ color: index % 2 ? 0xff4fa3 : 0x4fe3ff, toneMapped: false }),
      );
      bulb.position.set(Math.cos((index / 12) * TAU) * 12, Math.sin((index / 12) * TAU) * 12, 0);
      wheel.add(bulb);
      const gondola = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.0, 1.0),
        new THREE.MeshStandardMaterial({ color: pick([0xffb347, 0xff6b8a, 0x4fe3ff], nextRandom), roughness: 0.6 }),
      );
      gondola.position.set(
        Math.cos((index / 12) * TAU) * 12,
        Math.sin((index / 12) * TAU) * 12 - 1.0,
        0,
      );
      wheel.add(gondola);
    }
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 1.2, 10),
      new THREE.MeshStandardMaterial({ color: 0xf6e5b8, metalness: 0.4 }),
    );
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    animatedParts.wheels.push(wheel);
    cityGroup.add(wheel);
    for (const side of [-1, 1]) {
      const wheelLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.45, 17, 6),
        new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.7 }),
      );
      wheelLeg.position.set(236, 7.5, -100 + side * 6);
      wheelLeg.rotation.x = -side * 0.42;
      cityGroup.add(wheelLeg);
    }
  }
  // Lifeguard tower and pier.
  {
    const lifeguardTower = new THREE.Group();
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2.4, 3),
      new THREE.MeshStandardMaterial({ color: 0xf6e5b8, roughness: 0.8 }),
    );
    cabin.position.y = 4.2;
    lifeguardTower.add(cabin);
    const towerRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.2, 4),
      new THREE.MeshStandardMaterial({ color: 0xe85f6a }),
    );
    towerRoof.position.y = 6.0;
    towerRoof.rotation.y = Math.PI / 4;
    lifeguardTower.add(towerRoof);
    for (const legX of [-1.2, 1.2]) {
      for (const legZ of [-1.2, 1.2]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 3.4, 5),
          new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }),
        );
        leg.position.set(legX, 1.7, legZ);
        lifeguardTower.add(leg);
      }
    }
    lifeguardTower.position.set(246, 0.1, 30);
    cityGroup.add(lifeguardTower);
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.5, 44),
      new THREE.MeshStandardMaterial({ color: 0x9b7a5c, roughness: 0.95 }),
    );
    pier.position.set(246, 0.4, 138);
    pier.receiveShadow = true;
    cityGroup.add(pier);

    for (let index = 0; index < 8; index++) {
      for (const side of [-3, 3]) {
        const pierPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 6, 5),
          new THREE.MeshStandardMaterial({ color: 0x6e5138 }),
        );
        pierPost.position.set(246 + side, -2.2, 120 + index * 5.2);
        cityGroup.add(pierPost);
      }
    }

    const pierSign = makeSign('SUNSET PIER', '#ffb347', 8);
    pierSign.position.set(246, 5.4, 118);
    pierSign.rotation.y = Math.PI / 2;
    cityGroup.add(pierSign);
  }

  // ------------------------------------------------------------ marina

  const marinaDocks = [];
  for (let index = 0; index < 4; index++) {
    const dockX = -64 + index * 38;
    const dock = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.45, 34),
      new THREE.MeshStandardMaterial({ color: 0x9b7a5c, roughness: 0.95 }),
    );
    dock.position.set(dockX, 0.3, 264);
    dock.receiveShadow = true;
    cityGroup.add(dock);
    marinaDocks.push(dock);

    for (let postIndex = 0; postIndex < 4; postIndex++) {
      const mooringPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, 4, 5),
        new THREE.MeshStandardMaterial({ color: 0x6e5138 }),
      );
      mooringPost.position.set(dockX + (postIndex % 2 ? 2.6 : -2.6), -0.8, 251 + postIndex * 8.5);
      cityGroup.add(mooringPost);
    }

    if (index < 3) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 1.2, 7),
        new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.45 }),
      );
      hull.position.y = 0.55;

      const boatStripe = new THREE.Mesh(
        new THREE.BoxGeometry(3.25, 0.22, 7),
        new THREE.MeshStandardMaterial({ color: pick([0x2fa7a0, 0xe85f6a, 0xf2a541], nextRandom) }),
      );
      boatStripe.position.y = 0.95;

      const boatCabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.1, 2.6),
        new THREE.MeshStandardMaterial({ color: 0xcfe4e8, roughness: 0.3 }),
      );
      boatCabin.position.set(0, 1.6, -0.8);

      const boatMast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 7, 5),
        new THREE.MeshStandardMaterial({ color: 0xd8d0c0 }),
      );
      boatMast.position.set(0, 4.4, -1);

      boat.add(hull, boatStripe, boatCabin, boatMast);
      boat.position.set(dockX + 7, -0.2, 258 + (index % 2) * 10);
      boat.rotation.y = Math.PI / 2 + (nextRandom() - 0.5) * 0.2;
      boat.userData.baseY = boat.position.y;
      boat.userData.phase = nextRandom() * TAU;
      animatedParts.boats.push(boat);
      cityGroup.add(boat);
    }
  }

  // Marina clubhouse and the lighthouse that closes the bay.
  {
    const clubhouse = new THREE.Mesh(
      new THREE.BoxGeometry(18, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xf2c6b2, roughness: 0.85 }),
    );
    clubhouse.position.set(60, 3.1, 246);
    clubhouse.castShadow = true;
    cityGroup.add(clubhouse);
    registerBox(60, 246, 18.5, 12.5);

    const marinaSign = makeSign('MARINA VISTA', '#4fe3ff', 10);
    marinaSign.position.set(60, 6.7, 240.2);
    cityGroup.add(marinaSign);
    cityGroup.add(glowAt(0x4fe3ff, 12, 0.25, 60, 6.7, 240));

    const lighthouse = new THREE.Group();
    lighthouse.position.set(168, 0.1, 240);
    for (let bandIndex = 0; bandIndex < 6; bandIndex++) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(3.0 - bandIndex * 0.16, 3.15 - bandIndex * 0.16, 4, 12),
        new THREE.MeshStandardMaterial({ color: bandIndex % 2 === 0 ? 0xf4efe6 : 0xe85f6a, roughness: 0.8 }),
      );
      band.position.y = 2 + bandIndex * 4;
      lighthouse.add(band);
    }

    const lampRoom = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 2.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.25, metalness: 0.6 }),
    );
    lampRoom.position.y = 25.5;
    lighthouse.add(lampRoom);

    const lampGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe7a0, toneMapped: false }),
    );
    lampGlow.position.y = 25.5;
    lighthouse.add(lampGlow);

    const lighthouseCap = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 2.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c3440 }),
    );
    lighthouseCap.position.y = 28;
    lighthouse.add(lighthouseCap);

    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(3, 42, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe7a0,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set(21, 25.5, 0);

    const beamPivot = new THREE.Group();
    beamPivot.position.y = 25.5;
    beam.position.set(21, 0, 0);
    beamPivot.add(beam);
    lighthouse.add(beamPivot);
    animatedParts.beams.push(beamPivot);

    cityGroup.add(lighthouse);
    registerBox(168, 240, 7, 7);
  }

  // ------------------------------------------------------------ Neon arch across the strip

  {
    const archZ = -96;
    const archX = -24;
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x2c2a44, roughness: 0.5, metalness: 0.4 });

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 11, 1.4), pillarMaterial);
      pillar.position.set(archX, 5.6, archZ + side * 10.8);
      pillar.castShadow = true;
      cityGroup.add(pillar);
      registerBox(archX, archZ + side * 10.8, 1.8, 1.8);
    }

    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 22.8), pillarMaterial);
    archBeam.position.set(archX, 11.1, archZ);
    cityGroup.add(archBeam);

    const neonPink = new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false });
    const neonCyan = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, toneMapped: false });
    for (const end of [-1, 1]) {
      for (const offsetX of [-0.72, 0.72]) {
        const verticalStrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 9.6, 0.12), neonPink);
        verticalStrip.position.set(archX + offsetX, 5.6, archZ + end * 10.8);
        cityGroup.add(verticalStrip);
      }
      for (const offsetX of [-0.62, 0.62]) {
        const horizontalStrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 20.6), neonCyan);
        horizontalStrip.position.set(archX + offsetX, 11.55, archZ);
        cityGroup.add(horizontalStrip);
      }
    }

    const archSign = makeSign('PALMA VISTA', '#ff4fa3', 17.2, 'THE CITY THAT NEVER COOLS');
    archSign.position.set(archX + 0.7, 11.6, archZ);
    archSign.rotation.y = Math.PI / 2;
    cityGroup.add(archSign);

    const archGlow = makeGlow(0xff4fa3, 26, 0.4);
    archGlow.position.set(archX, 11.4, archZ);
    cityGroup.add(archGlow);
    animatedParts.neon.push(archSign.material);

    // A second face, so the arch reads from both directions.
    const backMaterial = cloneSignMaterial(archSign.material);
    const archBack = new THREE.Mesh(archSign.geometry, backMaterial);
    archBack.position.set(archX - 0.7, 11.6, archZ);
    archBack.rotation.y = -Math.PI / 2;
    archBack.renderOrder = 2;
    cityGroup.add(archBack);
  }

  // Neon Alley: a small plaza left open under the arch, with a low club and market lights.
  {
    const alleyX = -32;
    const alleyZ = -63;
    const alleyClub = new THREE.Mesh(
      new THREE.BoxGeometry(18, 7, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a2f6b, roughness: 0.75, emissive: 0x14041f, emissiveIntensity: 0.55 }),
    );
    alleyClub.position.set(alleyX, 3.6, alleyZ);
    alleyClub.castShadow = true;
    alleyClub.receiveShadow = true;
    cityGroup.add(alleyClub);
    registerBox(alleyX, alleyZ, 18.5, 10.5);

    const alleySign = makeSign('NEON ALLEY', '#ff4fa3', 14, 'OPEN ALL NIGHT');
    alleySign.position.set(alleyX, 8.2, alleyZ + 5.2);
    cityGroup.add(alleySign);
    cityGroup.add(glowAt(0xff4fa3, 16, 0.3, alleyX, 8.2, alleyZ + 5.5));

    const alleyDoor = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 4.4, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }),
    );
    alleyDoor.position.set(alleyX, 2.3, alleyZ + 5.1);
    cityGroup.add(alleyDoor);

    // The plaza stays open under the arch for the camera and the player.
    const hotelSign = makeSign('HOTEL VISTA', '#4fe3ff', 11, 'VACANCY · NO QUESTIONS');
    hotelSign.position.set(-24, 7.4, -118);
    hotelSign.rotation.y = Math.PI;
    cityGroup.add(hotelSign);
    cityGroup.add(glowAt(0x4fe3ff, 14, 0.26, -24, 7.4, -118.5));

    const radioSign = makeSign('RADIO', '#ff4fa3', 7);
    radioSign.position.set(8, 5.2, -90);
    radioSign.rotation.y = -Math.PI / 2;
    cityGroup.add(radioSign);
    cityGroup.add(glowAt(0xff4fa3, 9, 0.24, 7.8, 5.2, -90));

    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 26),
      new THREE.MeshBasicMaterial({ color: 0x2a2030 }),
    );
    wire.position.set(-24, 9.2, -76);
    cityGroup.add(wire);

    for (let index = 0; index < 9; index++) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 5),
        new THREE.MeshBasicMaterial({ color: index % 2 ? 0xff4fa3 : 0x4fe3ff, toneMapped: false }),
      );
      bulb.position.set(-24, 8.9, -88 + index * 3);
      cityGroup.add(bulb);
    }
  }

  // ------------------------------------------------------------ the causeway

  {
    const causewayZ = CITY.causewayZ;
    const causewayFrom = CITY.causewayFromX;
    const causewayTo = CITY.causewayToX;
    const causewayLength = causewayTo - causewayFrom;
    const causewayMid = (causewayFrom + causewayTo) / 2;

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(causewayLength, 0.8, CITY.causewayWidth),
      new THREE.MeshStandardMaterial({ color: 0x35344a, roughness: 0.85 }),
    );
    deck.position.set(causewayMid, 0.18, causewayZ);
    deck.receiveShadow = true;
    cityGroup.add(deck);

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(causewayLength, 0.32, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.7 }),
      );
      rail.position.set(causewayMid, 1.0, causewayZ + side * (CITY.causewayWidth / 2 - 0.2));
      cityGroup.add(rail);

      for (let railX = causewayFrom + 6; railX < causewayTo; railX += 14) {
        const railPost = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 1.1, 0.24),
          new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }),
        );
        railPost.position.set(railX, 0.8, causewayZ + side * (CITY.causewayWidth / 2 - 0.2));
        cityGroup.add(railPost);
      }
      registerBox(causewayMid, causewayZ + side * (CITY.causewayWidth / 2 - 0.1), causewayLength, 0.55);
    }

    for (let pierX = causewayFrom + 32; pierX < causewayTo; pierX += 46) {
      const pier = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.7, 9, 8),
        new THREE.MeshStandardMaterial({ color: 0x8f8270, roughness: 0.95 }),
      );
      pier.position.set(pierX, -4.2, causewayZ);
      cityGroup.add(pier);

      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(5.5, 0.42, 5, 16, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xa89984, roughness: 0.9 }),
      );
      arch.position.set(pierX, 0.2, causewayZ);
      arch.rotation.y = Math.PI / 2;
      cityGroup.add(arch);
    }

    for (let lampX = causewayFrom + 18; lampX < causewayTo; lampX += 40) {
      for (const side of [-1, 1]) {
        const lampPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 5.5, 5),
          new THREE.MeshStandardMaterial({ color: 0x3c3c4c }),
        );
        lampPost.position.set(lampX, 3.0, causewayZ + side * (CITY.causewayWidth / 2 - 1.0));
        cityGroup.add(lampPost);

        const lampBulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xffd39b, toneMapped: false }),
        );
        lampBulb.position.set(lampX, 5.9, causewayZ + side * (CITY.causewayWidth / 2 - 1.0));
        cityGroup.add(lampBulb);
      }
    }

    const causewaySign = makeSign('PUENTE VISTA', '#4fe3ff', 13, 'TO THE KEYS');
    causewaySign.position.set(causewayFrom + 30, 8.6, causewayZ - 8.9);
    causewaySign.rotation.y = Math.PI;
    cityGroup.add(causewaySign);
    cityGroup.add(glowAt(0x4fe3ff, 14, 0.22, causewayFrom + 30, 8.6, causewayZ - 9));
  }

  // ------------------------------------------------------------ water
  const waterUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x0d3a52) },
    uShallow: { value: new THREE.Color(0x2a9aa8) },
    uSun: { value: new THREE.Color(0xffd2a0) },
    uSunDir: { value: new THREE.Vector3(0.6, 0.25, 0.2).normalize() },
    uFogColor: { value: new THREE.Color(0xffab88) },
    uFogDensity: { value: 0.0018 },
  };

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: false,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWorld;
      void main() {
        float w1 = sin(vWorld.x * 0.16 + uTime * 0.9) * 0.5 + sin(vWorld.z * 0.21 - uTime * 0.7) * 0.5;
        float w2 = sin(vWorld.x * 0.47 - vWorld.z * 0.32 + uTime * 1.7) * 0.5 + 0.5;
        vec3 n = normalize(vec3(w1 * 0.10 + w2 * 0.035, 1.0, w2 * 0.08 - w1 * 0.04));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        float glint = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 90.0);
        float bands = smoothstep(0.55, 1.0, w2) * 0.08;
        vec3 col = mix(uDeep, uShallow, 0.28 + fres * 0.55 + bands);
        col += uSun * glint * 2.2;
        float dist = length(cameraPosition - vWorld);
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200, 1, 1), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, CITY.waterY, 0);
  cityGroup.add(water);
  animatedParts.water = waterUniforms;

  // Seawall along the beach and marina, so the land reads as a raised shelf.
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x9c8e7c, roughness: 0.95 });
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 512), wallMaterial);
  eastWall.position.set(258.5, -0.9, 0);
  cityGroup.add(eastWall);

  const southWall = new THREE.Mesh(new THREE.BoxGeometry(520, 2.2, 1.2), wallMaterial);
  southWall.position.set(-14, -0.9, 252.5);
  cityGroup.add(southWall);

  // ------------------------------------------------------------ distant hills and skyline

  const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3a66, roughness: 1 });
  for (let index = 0; index < 12; index++) {
    const hillHeight = 50 + hash01(index * 31) * 80;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(44 + hash01(index * 7) * 40, hillHeight, 5),
      hillMaterial,
    );
    hill.position.set(-470 + index * 48, hillHeight / 2 - 12, -420 - hash01(index) * 70);
    hill.rotation.y = hash01(index * 13) * TAU;
    cityGroup.add(hill);
  }

  const skylineMaterial = new THREE.MeshStandardMaterial({ color: 0x33284a, roughness: 0.9 });
  for (let index = 0; index < 26; index++) {
    const towerHeight = 22 + hash01(index * 19) * 70;
    const distantBlock = new THREE.Mesh(
      new THREE.BoxGeometry(14 + hash01(index) * 18, towerHeight, 16 + hash01(index * 3) * 14),
      skylineMaterial,
    );
    distantBlock.position.set(-430 + index * 33, towerHeight / 2 - 2, -330 - hash01(index * 11) * 40);
    cityGroup.add(distantBlock);
  }

  // ------------------------------------------------------------ API

  const city = {
    group: cityGroup,
    blocks: blockLots,
    collision: collisionBoxes,
    spots: SPOTS,
    buildings: buildingSpecs,
    waterUniforms,

    /**
     * Pushes a circle out of every collision rectangle it overlaps, then clamps it to the
     * playable land. The 0.001 nudge prevents a body from re-entering the same face next frame.
     */
    resolveCircle(x, z, radius = 0.45) {
      let resolvedX = x;
      let resolvedZ = z;

      for (const box of collisionBoxes) {
        const minX = box.minX - radius;
        const maxX = box.maxX + radius;
        const minZ = box.minZ - radius;
        const maxZ = box.maxZ + radius;
        if (resolvedX <= minX || resolvedX >= maxX || resolvedZ <= minZ || resolvedZ >= maxZ) continue;

        const distanceLeft = resolvedX - minX;
        const distanceRight = maxX - resolvedX;
        const distanceTop = resolvedZ - minZ;
        const distanceBottom = maxZ - resolvedZ;
        const smallest = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

        if (smallest === distanceLeft) resolvedX = minX - 0.001;
        else if (smallest === distanceRight) resolvedX = maxX + 0.001;
        else if (smallest === distanceTop) resolvedZ = minZ - 0.001;
        else resolvedZ = maxZ + 0.001;
      }

      // Land edges: the player can walk the beach and the causeway, never out to sea.
      if (resolvedX > 205) {
        const withinBridge = Math.abs(resolvedZ) < CITY.causewayWidth / 2 + 1 && resolvedX > 200;
        if (withinBridge) {
          resolvedX = Math.min(resolvedX, CITY.causewayToX + 10);
        } else {
          resolvedX = Math.min(resolvedX, 254);
        }
      }

      const onBridge = resolvedX > 200 && Math.abs(resolvedZ) < CITY.causewayWidth / 2 + 1;
      resolvedX = Math.max(-246, Math.min(onBridge ? CITY.causewayToX + 10 : 254, resolvedX));
      resolvedZ = Math.max(-246, Math.min(248, resolvedZ));

      if (resolvedZ > 246.5 && resolvedX > -90 && resolvedX < 120) {
        // Marina promenade is open at the south edge.
        resolvedZ = Math.min(resolvedZ, 248);
      }

      return { x: resolvedX, z: resolvedZ };
    },

    /** True when a point falls inside the paved width of any road line. */
    isRoad(x, z) {
      for (const roadLine of roadLines) {
        if (Math.abs(x - roadLine) < CITY.roadWidth / 2 || Math.abs(z - roadLine) < CITY.roadWidth / 2) {
          return true;
        }
      }
      return false;
    },

    /** True only on the bridge deck itself, excluding the beach approach. */
    onCauseway(x, z) {
      return x > 200 && Math.abs(z) < CITY.causewayWidth / 2;
    },

    minimap: {
      roadLines,
      blocks: blockLots,
      beach: { minX: 205, maxX: 258, minZ: -252, maxZ: 252 },
      causeway: { minX: 200, maxX: 520, minZ: -8.5, maxZ: 8.5 },
      marina: { minX: -90, maxX: 120, minZ: 246, maxZ: 320 },
    },

    /** Animates the water clock, the Ferris wheel, the lighthouse beam, boats and neon. */
    update(t, dt) {
      animatedParts.water.uTime.value = t;
      for (const wheel of animatedParts.wheels) wheel.rotation.z = t * 0.16;
      for (const beam of animatedParts.beams) beam.rotation.y = t * 0.55;

      for (const boat of animatedParts.boats) {
        boat.position.y = boat.userData.baseY + Math.sin(t * 1.1 + boat.userData.phase) * 0.18;
        boat.rotation.z = Math.sin(t * 0.8 + boat.userData.phase) * 0.035;
      }

      for (let index = 0; index < animatedParts.neon.length; index++) {
        const material = animatedParts.neon[index];
        if (material.opacity !== undefined) {
          material.opacity = 0.86 + Math.sin(t * (1.7 + index * 0.13) + index) * 0.14;
        }
      }
    },

    /** Keeps the water's sun glint and fog colour in step with the world mood. */
    setSun(sunDir, fogColor) {
      waterUniforms.uSunDir.value.copy(sunDir).normalize();
      waterUniforms.uFogColor.value.setHex(fogColor);
    },
  };

  return city;
}
