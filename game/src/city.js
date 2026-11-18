// PALMA VISTA's city: a pastel art-deco grid between the mountains and the sea. Everything
// here is generated from primitives and canvas textures — no downloaded models or images.
// Buildings, windows, palms, lamps and crosswalks are instanced, the landmarks are built by
// hand, and every solid thing contributes a collision box the player and cars share.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { TAU, clamp, hash01, pick, rng, smoothstep } from './math.js';

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

const RESERVED = new Set([
  '24,24',    // Vista Tower
  '-24,24',   // Café Sol
  '72,-120',  // Vista Motors
  '-168,120', // El Taller garage
  '120,168',  // city impound
  '168,72',   // police headquarters
  '-120,-168',// Club Sol
  '-72,120',  // hospital
  '-24,-72',  // Neon Alley plaza
]);

const SIGN_WORDS = ['HOTEL', 'CAFÉ', 'TACOS', 'SURF', 'MOTEL', 'VINYL', 'PALMS', 'SOL', 'RADIO', 'VICE', 'MARINA', 'ARCADE', 'LIQUOR', 'DINER', 'NOCTURNO', 'BODEGA', 'CINE', 'FLAMENCO'];

function canvasTexture(width, height, draw, { repeat = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  draw(g, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

function asphaltTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2a2939';
    g.fillRect(0, 0, w, h);
    const r = rng(19);
    for (let i = 0; i < 900; i++) {
      const shade = 24 + Math.floor(r() * 32);
      g.fillStyle = `rgba(${shade},${shade},${shade + 9},${0.16 + r() * 0.24})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    g.fillStyle = 'rgba(255,204,150,0.05)';
    g.fillRect(0, 0, w, 2);
  }, { repeat: true });
}

function concreteTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#cbb9a5';
    g.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 700; i++) {
      const v = 175 + Math.floor(r() * 55);
      g.fillStyle = `rgba(${v},${v - 12},${v - 26},0.2)`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    g.strokeStyle = 'rgba(104,89,78,0.28)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(112,96,84,0.16)';
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
  }, { repeat: true });
}

function sandTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#eed5a6';
    g.fillRect(0, 0, w, h);
    const r = rng(53);
    for (let i = 0; i < 1200; i++) {
      const v = 205 + Math.floor(r() * 38);
      g.fillStyle = `rgba(${v},${v - 22},${v - 66},0.35)`;
      g.fillRect(r() * w, r() * h, 1, 1);
    }
  }, { repeat: true });
}

function radialTexture(inner = 'rgba(255,220,160,1)', outer = 'rgba(255,120,80,0)') {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, 'rgba(255,190,120,0.55)');
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function signTexture(text, color, sub = '') {
  return canvasTexture(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 76px Arial, Helvetica, sans-serif';
    g.shadowColor = color;
    g.shadowBlur = 26;
    g.fillStyle = color;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    g.shadowBlur = 10;
    g.fillStyle = '#fff8ee';
    g.globalAlpha = 0.9;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    g.globalAlpha = 1;
    if (sub) {
      g.font = '700 28px Arial, Helvetica, sans-serif';
      g.shadowBlur = 12;
      g.fillStyle = color;
      g.fillText(sub, w / 2, h * 0.78);
    }
  });
}

function makeSign(text, color, width, sub = '') {
  const texture = signTexture(text, color, sub);
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

function materialClone(material) {
  return new THREE.MeshBasicMaterial({
    map: material.map,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });
}

function makeGlow(color, scale, opacity = 0.55) {
  const texture = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
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

function glowAt(color, scale, opacity, x, y, z) {
  const glow = makeGlow(color, scale, opacity);
  glow.position.set(x, y, z);
  return glow;
}

export function buildCity(scene) {
  const group = new THREE.Group();
  group.name = 'PalmaVista';
  scene.add(group);
  const collision = [];
  const blocks = [];
  const buildings = [];
  const signs = [];
  const animated = { wheels: [], beams: [], boats: [], neon: [], water: null };
  const random = rng(601);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const addBoxCollision = (x, z, w, d) => {
    collision.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };

  // ------------------------------------------------------------ land, sea and roads

  const landMat = new THREE.MeshStandardMaterial({ color: 0xc8b7a3, roughness: 0.96 });
  const land = new THREE.Mesh(new THREE.PlaneGeometry(560, 520), landMat);
  land.rotation.x = -Math.PI / 2;
  land.position.set(-20, -0.02, 0);
  land.receiveShadow = true;
  group.add(land);

  const sandMat = new THREE.MeshStandardMaterial({ map: sandTexture(), color: 0xffffff, roughness: 1 });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(54, 512), sandMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(232, 0.04, 0);
  beach.receiveShadow = true;
  group.add(beach);

  const concrete = concreteTexture();
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xffffff, roughness: 0.94 });
  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: 0xffffff, roughness: 0.92, metalness: 0.04 });

  const roadLines = [];
  for (let k = CITY.roadsFrom; k <= CITY.roadsTo; k++) roadLines.push(k * CITY.grid);
  const roadLength = 480;

  for (const pos of roadLines) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, roadLength), roadMat);
    a.rotation.x = -Math.PI / 2;
    a.rotation.z = 0;
    a.position.set(pos, 0.015, 0);
    a.receiveShadow = true;
    group.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(roadLength, CITY.roadWidth), roadMat);
    b.rotation.x = -Math.PI / 2;
    b.position.set(0, 0.018, pos);
    b.receiveShadow = true;
    group.add(b);
  }

  // Blocks and their pavements.
  const blockCenters = [];
  for (let i = 0; i < roadLines.length - 1; i++) {
    for (let j = 0; j < roadLines.length - 1; j++) {
      const cx = roadLines[i] + CITY.grid / 2;
      const cz = roadLines[j] + CITY.grid / 2;
      const key = `${Math.round(cx)},${Math.round(cz)}`;
      blockCenters.push({ cx, cz, key, i, j });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(CITY.blockLot + CITY.sidewalk * 2, CITY.blockLot + CITY.sidewalk * 2), sidewalkMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx, 0.1, cz);
      plane.receiveShadow = true;
      group.add(plane);
      blocks.push({ x: cx, z: cz, size: CITY.blockLot });
    }
  }

  // Lane dashes: an instanced strip every eight metres, in both directions.
  const dashGeo = new THREE.BoxGeometry(1, 0.02, 1);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c89c, toneMapped: false });
  const dashCount = roadLines.length * (Math.floor(roadLength / 8) * 2);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  let di = 0;
  for (const pos of roadLines) {
    for (let t = -232; t <= 232; t += 8) {
      dummy.position.set(pos, 0.05, t);
      dummy.scale.set(0.24, 1, 3.2);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
      dummy.position.set(t, 0.052, pos);
      dummy.scale.set(3.2, 1, 0.24);
      dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
    }
  }
  dashes.count = di;
  group.add(dashes);

  // Crosswalk stripes at the busier crossings.
  const stripeGeo = new THREE.BoxGeometry(0.7, 0.02, 2.8);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf0e6d4, transparent: true, opacity: 0.75, toneMapped: false });
  const perIntersection = 4 * 4;
  const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, perIntersection * roadLines.length * roadLines.length);
  let si = 0;
  for (const cx of roadLines) {
    for (const cz of roadLines) {
      for (let side = 0; side < 4; side++) {
        for (let s = -3; s <= 3; s += 2) {
          dummy.rotation.set(0, side >= 2 ? Math.PI / 2 : 0, 0);
          dummy.scale.set(1, 1, 1);
          if (side === 0) dummy.position.set(cx + s * 0.9, 0.055, cz - CITY.roadWidth / 2 - 1.7);
          else if (side === 1) dummy.position.set(cx + s * 0.9, 0.055, cz + CITY.roadWidth / 2 + 1.7);
          else if (side === 2) dummy.position.set(cx - CITY.roadWidth / 2 - 1.7, 0.055, cz + s * 0.9);
          else dummy.position.set(cx + CITY.roadWidth / 2 + 1.7, 0.055, cz + s * 0.9);
          dummy.updateMatrix();
          stripes.setMatrixAt(si++, dummy.matrix);
        }
      }
    }
  }
  stripes.count = si;
  group.add(stripes);

  // Yellow kerbs on the main avenues.
  for (const pos of [0, -96]) {
    for (const axis of ['x', 'z']) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? roadLength : 0.22, 0.02, axis === 'x' ? 0.22 : roadLength), new THREE.MeshBasicMaterial({ color: 0xe7b74e, toneMapped: false }));
      mesh.position.set(axis === 'x' ? 0 : pos, 0.056, axis === 'x' ? pos : 0);
      group.add(mesh);
    }
  }

  // ------------------------------------------------------------ the buildings

  const builder = (bx, bz, i, j) => {
    const downtown = Math.abs(bx) < 120 && Math.abs(bz) < 120;
    const beachside = bx > 120;
    if (downtown) {
      const h = 34 + random() * 56;
      return [{ x: bx + (random() - 0.5) * 5, z: bz + (random() - 0.5) * 5, w: 28, d: 28, h, color: pick(PALETTE.buildings, random) }];
    }
    if (beachside) {
      const n = 2 + Math.floor(random() * 2);
      const list = [];
      for (let k = 0; k < n; k++) {
        const w = 13 + random() * 6;
        const d = 13 + random() * 6;
        const x = bx + (k % 2 === 0 ? -8 : 8) + (random() - 0.5) * 2;
        const z = bz + (k < 2 ? -8 : 8) + (random() - 0.5) * 2;
        list.push({ x, z, w, d, h: 6 + random() * 9, color: pick(PALETTE.buildings, random), shop: true });
      }
      return list;
    }
    const n = 2 + Math.floor(random() * 3);
    const list = [];
    for (let k = 0; k < n; k++) {
      const w = 12 + random() * 5;
      const d = 12 + random() * 5;
      const x = bx + (k === 0 ? -8 : k === 1 ? 8 : -7) + (random() - 0.5) * 2;
      const z = bz + (k < 2 ? -8 : 8) + (random() - 0.5) * 2;
      list.push({ x, z, w, d, h: 14 + random() * 26, color: pick(PALETTE.buildings, random), shop: k === 0 && random() < 0.55 });
    }
    return list;
  };

  for (const block of blockCenters) {
    if (RESERVED.has(block.key)) continue;
    for (const b of builder(block.cx, block.cz, block.i, block.j)) {
      buildings.push(b);
    }
  }

  // Bodies, one instanced draw for every building.
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.03 });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, buildings.length);
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  const windowMatrices = [];
  const windowColors = [];
  const trims = [];

  buildings.forEach((b, index) => {
    const base = 0.1;
    dummy.position.set(b.x, base + b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(index, dummy.matrix);
    bodies.setColorAt(index, color.setHex(b.color));
    addBoxCollision(b.x, b.z, b.w + 0.6, b.d + 0.6);

    const floors = Math.max(1, Math.floor((b.h - 3) / 3.1));
    const colsX = Math.max(1, Math.floor((b.w - 2) / 2.9));
    const colsZ = Math.max(1, Math.floor((b.d - 2) / 2.9));
    const lit = hash01(index * 91 + 7);
    for (let f = 0; f < floors; f++) {
      const y = base + 2.6 + f * 3.1;
      for (let c = 0; c < colsX; c++) {
        const x = b.x - b.w / 2 + (b.w / (colsX + 1)) * (c + 1);
        for (const side of [-1, 1]) {
          if (hash01(index * 131 + f * 13 + c * 7 + side) > 0.27) {
            const z = b.z + side * (b.d / 2 + 0.025);
            const rot = side > 0 ? 0 : Math.PI;
            windowMatrices.push([x, y, z, rot, 1.0, 1.35]);
            windowColors.push(windowColor(index, f, c, side));
          }
        }
      }
      for (let c = 0; c < colsZ; c++) {
        const z = b.z - b.d / 2 + (b.d / (colsZ + 1)) * (c + 1);
        for (const side of [-1, 1]) {
          if (hash01(index * 197 + f * 11 + c * 5 + side) > 0.31) {
            const x = b.x + side * (b.w / 2 + 0.025);
            const rot = side > 0 ? Math.PI / 2 : -Math.PI / 2;
            windowMatrices.push([x, y, z, rot, 1.0, 1.35]);
            windowColors.push(windowColor(index, f, c, side + 4));
          }
        }
      }
    }

    // A rooftop lip for the taller buildings, and an occasional neon crown.
    if (b.h > 22) {
      trims.push({ x: b.x, y: base + b.h - 0.35, z: b.z, w: b.w + 0.4, d: b.d + 0.4, h: 0.5, color: b.color });
      if (hash01(index * 37 + 3) > 0.72) {
        const neon = pick(PALETTE.neon, random);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.25, 0.22, b.d + 0.25), new THREE.MeshBasicMaterial({ color: neon, toneMapped: false }));
        crown.position.set(b.x, base + b.h + 0.15, b.z);
        group.add(crown);
        animated.neon.push(crown.material);
      }
    }

    // Ground-floor shop front and awning, with a glowing name over it.
    if (b.shop || (b.h < 20 && random() < 0.45)) {
      const facing = random() < 0.5 ? 1 : -1;
      const alongX = random() < 0.5;
      const fx = b.x + (alongX ? 0 : facing * (b.w / 2 + 0.7));
      const fz = b.z + (alongX ? facing * (b.d / 2 + 0.7) : 0);
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? b.w * 0.8 : 1.6, 0.22, alongX ? 1.6 : b.d * 0.8),
        new THREE.MeshStandardMaterial({ color: pick(PALETTE.awnings, random), roughness: 0.8 }),
      );
      awning.position.set(fx, 3.1, fz);
      awning.castShadow = true;
      group.add(awning);
      const word = pick(SIGN_WORDS, random);
      const neon = pick(PALETTE.neon, random);
      const sign = makeSign(word, `#${neon.toString(16).padStart(6, '0')}`, alongX ? 6.2 : 6.2);
      sign.position.set(
        b.x + (alongX ? 0 : facing * (b.w / 2 + 0.12)),
        Math.min(4.9, b.h - 1.2),
        b.z + (alongX ? facing * (b.d / 2 + 0.12) : 0),
      );
      sign.rotation.y = alongX ? (facing > 0 ? 0 : Math.PI) : (facing > 0 ? Math.PI / 2 : -Math.PI / 2);
      group.add(sign);
      signs.push(sign);
      const glow = makeGlow(neon, 5.5, 0.22);
      glow.position.copy(sign.position);
      group.add(glow);
      animated.neon.push(sign.material);
    }
  });

  function windowColor(index, f, c, side) {
    const v = hash01(index * 977 + f * 41 + c * 17 + side);
    if (v > 0.58) return new THREE.Color(0xffcf87);
    if (v > 0.42) return new THREE.Color(0x8ce8df);
    if (v > 0.30) return new THREE.Color(0xff9d7a);
    return new THREE.Color(0x2c3355);
  }

  bodies.instanceColor.needsUpdate = true;
  group.add(bodies);

  const windowGeo = new THREE.PlaneGeometry(1, 1);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
  const windows = new THREE.InstancedMesh(windowGeo, windowMat, windowMatrices.length);
  windowMatrices.forEach((m, i) => {
    dummy.position.set(m[0], m[1], m[2]);
    dummy.rotation.set(0, m[3], 0);
    dummy.scale.set(0.95 * m[4], 1.25 * m[5], 1);
    dummy.updateMatrix();
    windows.setMatrixAt(i, dummy.matrix);
    windows.setColorAt(i, windowColors[i]);
  });
  windows.instanceColor.needsUpdate = true;
  group.add(windows);

  const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const trimMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), trimMat, trims.length);
  trims.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z);
    dummy.scale.set(t.w, t.h, t.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trimMesh.setMatrixAt(i, dummy.matrix);
    trimMesh.setColorAt(i, color.setHex(t.color));
  });
  trimMesh.instanceColor.needsUpdate = true;
  trimMesh.castShadow = true;
  group.add(trimMesh);

  // ------------------------------------------------------------ palms, lamps and street furniture

  const palmSpots = [];
  for (let z = -228; z <= 228; z += 22) palmSpots.push({ x: 212 + (hash01(z) - 0.5) * 7, z, s: 0.9 + hash01(z * 3) * 0.55 });
  for (let z = -204; z <= 204; z += 48) palmSpots.push({ x: 202, z: z + 8, s: 0.95 + hash01(z * 7) * 0.4 });
  for (const bx of [-24, 24, 72, -72, 120, -120]) {
    palmSpots.push({ x: bx - 16, z: -16, s: 1.0 });
    palmSpots.push({ x: bx + 16, z: 16, s: 1.1 });
  }
  palmSpots.push({ x: -232, z: 18, s: 1.2 }, { x: -232, z: -30, s: 1.0 }, { x: 196, z: 216, s: 1.15 }, { x: 184, z: 226, s: 1.0 });
  palmSpots.push({ x: -41.5, z: -89.5, s: 1.15 }, { x: 9, z: -86, s: 1.05 });

  const trunkGeo = new THREE.CylinderGeometry(0.17, 0.34, 6.4, 7);
  trunkGeo.translate(0, 3.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6a4d, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  trunks.castShadow = true;
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0.1, p.z);
    dummy.rotation.set(0, hash01(i * 7) * TAU, 0);
    dummy.scale.set(p.s, p.s, p.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  group.add(trunks);

  const frondGeo = new THREE.ConeGeometry(0.62, 3.7, 4);
  frondGeo.translate(0, 1.85, 0);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3e7d58, roughness: 0.9, side: THREE.DoubleSide });
  const frondCount = palmSpots.length * 7;
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, frondCount);
  fronds.castShadow = true;
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const palmTop = new THREE.Vector3();
  let fi = 0;
  palmSpots.forEach((p, i) => {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + hash01(i * 13 + k) * 0.5;
      dir.set(Math.cos(a), -0.08 + hash01(i + k * 3) * 0.34, Math.sin(a)).normalize();
      quat.setFromUnitVectors(up, dir);
      palmTop.set(p.x, 0.1 + 6.4 * p.s, p.z);
      dummy.position.copy(palmTop);
      dummy.quaternion.copy(quat);
      dummy.scale.set(1, p.s * (0.85 + hash01(i * 19 + k) * 0.4), 0.5);
      dummy.updateMatrix();
      fronds.setMatrixAt(fi++, dummy.matrix);
    }
  });
  group.add(fronds);

  // Street lamps: warm globes at corners, with a pool of light painted on the pavement.
  const lampSpots = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    lampSpots.push({ x: Math.cos(a) * 152, z: Math.sin(a) * 152 });
  }
  lampSpots.push({ x: -12, z: 12 }, { x: 12, z: -12 }, { x: 60, z: 12 }, { x: -60, z: -12 }, { x: 108, z: 12 }, { x: -108, z: -12 });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.13, 6.2, 6);
  poleGeo.translate(0, 3.1, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.6, metalness: 0.4 }), lampSpots.length);
  const globeGeo = new THREE.SphereGeometry(0.3, 8, 6);
  const globeMat = new THREE.MeshBasicMaterial({ color: 0xffd39b, toneMapped: false });
  const globes = new THREE.InstancedMesh(globeGeo, globeMat, lampSpots.length);
  lampSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0.1, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 6.45, p.z);
    dummy.updateMatrix();
    globes.setMatrixAt(i, dummy.matrix);
  });
  group.add(poleMesh, globes);

  const poolGeo = new THREE.CircleGeometry(4.5, 16);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc47a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lampSpots.length);
  lampSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0.09, p.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  group.add(pools);

  // Beach umbrellas and towels.
  const umbrellas = [];
  for (let i = 0; i < 14; i++) umbrellas.push({ x: 218 + random() * 26, z: -210 + random() * 420 });
  const umbGeo = new THREE.ConeGeometry(2.3, 1.2, 10);
  const umbMesh = new THREE.InstancedMesh(umbGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), umbrellas.length);
  const uPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5);
  const uPoles = new THREE.InstancedMesh(uPoleGeo, new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }), umbrellas.length);
  umbrellas.forEach((u, i) => {
    dummy.position.set(u.x, 2.5, u.z);
    dummy.rotation.set(0, hash01(i * 9) * TAU, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    umbMesh.setMatrixAt(i, dummy.matrix);
    umbMesh.setColorAt(i, color.setHex(pick([0xe85f6a, 0x2fa7a0, 0xf2a541, 0xf0d0e0], random)));
    dummy.position.set(u.x, 1.3, u.z);
    dummy.updateMatrix();
    uPoles.setMatrixAt(i, dummy.matrix);
  });
  umbMesh.instanceColor.needsUpdate = true;
  group.add(umbMesh, uPoles);

  const towelGeo = new THREE.PlaneGeometry(1.5, 2.6);
  const towels = new THREE.InstancedMesh(towelGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), 16);
  for (let i = 0; i < 16; i++) {
    dummy.position.set(216 + random() * 28, 0.09, -200 + random() * 400);
    dummy.rotation.set(-Math.PI / 2, 0, random() * TAU);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    towels.setMatrixAt(i, dummy.matrix);
    towels.setColorAt(i, color.setHex(pick([0xffb347, 0xff6b8a, 0x6bc8c8, 0xf0e0b0], random)));
  }
  towels.instanceColor.needsUpdate = true;
  group.add(towels);

  // Bollards along the promenade.
  const bollards = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x3c3c4c }), 34);
  for (let i = 0; i < 34; i++) {
    dummy.position.set(198, 0.5, -230 + i * 14);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
  }
  group.add(bollards);

  // ------------------------------------------------------------ landmarks

  // Vista Tower, the pastel needle over downtown.
  {
    const x = 24, z = 24, base = 0.1;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 16, 118, 8),
      new THREE.MeshStandardMaterial({ color: 0xbfe3d0, roughness: 0.35, metalness: 0.28, emissive: 0x0d2a33, emissiveIntensity: 0.28 }),
    );
    tower.position.set(x, base + 59, z);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);
    addBoxCollision(x, z, 28, 28);
    for (const y of [34, 68, 100]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.2, 0.45, 8), new THREE.MeshBasicMaterial({ color: 0x4fe3ff, toneMapped: false }));
      ring.position.set(x, base + y, z);
      group.add(ring);
      animated.neon.push(ring.material);
    }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 12.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf6e5b8, emissive: 0xff8a5c, emissiveIntensity: 0.4, roughness: 0.4 }));
    crown.position.set(x, base + 123, z);
    group.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.1, 22, 6), new THREE.MeshStandardMaterial({ color: 0xd8d0c0, metalness: 0.6, roughness: 0.3 }));
    spire.position.set(x, base + 139, z);
    group.add(spire);
    const topLight = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false }));
    topLight.position.set(x, base + 150, z);
    group.add(topLight);
    animated.neon.push(topLight.material);
    const sign = makeSign('VISTA', '#4fe3ff', 13);
    sign.position.set(x, base + 110, z + 12.1);
    group.add(sign);
    group.add(glowAt(0x4fe3ff, 20, 0.3, x, base + 110, z + 12.5));
  }

  // Café Sol: a small terrace where the story starts.
  {
    const x = -34, z = 18;
    const cafe = new THREE.Mesh(new THREE.BoxGeometry(13, 5.2, 12), new THREE.MeshStandardMaterial({ color: 0xf2c6b2, roughness: 0.85 }));
    cafe.position.set(x, 2.7, z);
    cafe.castShadow = true;
    cafe.receiveShadow = true;
    group.add(cafe);
    addBoxCollision(x, z, 13.5, 12.5);
    const sign = makeSign('CAFÉ SOL', '#ffb347', 7.5, 'DESDE 1987');
    sign.position.set(x + 6.6, 4.2, z + 2);
    sign.rotation.y = Math.PI / 2;
    group.add(sign);
    group.add(glowAt(0xffb347, 7, 0.25, x + 6.8, 4.2, z + 2));
    for (let i = 0; i < 4; i++) {
      const table = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xf0e6d4, roughness: 0.5 }));
      top.position.y = 1.05;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a4a }));
      leg.position.y = 0.55;
      table.add(top, leg);
      table.position.set(-37 + (i % 2) * 5, 0.1, 28 + Math.floor(i / 2) * 7);
      table.castShadow = true;
      group.add(table);
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0xe85f6a }));
      chair.position.set(table.position.x + 1.6, 0.6, table.position.z);
      group.add(chair);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.12), new THREE.MeshStandardMaterial({ color: 0xe85f6a }));
      back.position.set(table.position.x + 2.0, 1.0, table.position.z);
      group.add(back);
    }
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.4, 10), new THREE.MeshStandardMaterial({ color: 0xf2a541, roughness: 0.85 }));
    umbrella.position.set(-34, 5.0, 31);
    group.add(umbrella);
  }

  // Vista Motors: glass showroom and an open forecourt with the mint car.
  {
    const x = 72, z = -130;
    const showroom = new THREE.Mesh(new THREE.BoxGeometry(25, 8, 14), new THREE.MeshStandardMaterial({ color: 0x9fd8d8, roughness: 0.18, metalness: 0.55, emissive: 0x0a2a33, emissiveIntensity: 0.2 }));
    showroom.position.set(x, 4.1, z);
    showroom.castShadow = true;
    showroom.receiveShadow = true;
    group.add(showroom);
    addBoxCollision(x, z, 25.5, 14.5);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(26.5, 0.7, 15.5), new THREE.MeshStandardMaterial({ color: 0xf6e5b8, roughness: 0.6 }));
    roof.position.set(x, 8.3, z);
    group.add(roof);
    const sign = makeSign('VISTA MOTORS', '#4fe3ff', 15, 'SUN · SAND · SPEED');
    sign.position.set(x, 8.3, z + 7.75);
    group.add(sign);
    group.add(glowAt(0x4fe3ff, 16, 0.28, x, 8.3, z + 8));
    for (let i = 0; i < 3; i++) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: 0xe8fff8, toneMapped: false }));
      light.position.set(x - 7 + i * 7, 7.8, z + 6.6);
      group.add(light);
    }
    const pad = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshStandardMaterial({ color: 0x34344a, roughness: 0.9 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(63, 0.12, -112);
    group.add(pad);
  }

  // El Taller: garage under the western palms.
  {
    const x = -174, z = 120;
    const garage = new THREE.Mesh(new THREE.BoxGeometry(20, 9.5, 25), new THREE.MeshStandardMaterial({ color: 0xb7c8e8, roughness: 0.8 }));
    garage.position.set(x, 4.75, z);
    garage.castShadow = true;
    garage.receiveShadow = true;
    group.add(garage);
    addBoxCollision(x, z, 20.5, 25.5);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshStandardMaterial({ color: 0x3b4152, roughness: 0.5, metalness: 0.35 }));
    door.position.set(x, 3.1, z + 12.56);
    group.add(door);
    for (let i = 0; i < 6; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0x6b7185 }));
      slat.position.set(x, 0.6 + i * 1.0, z + 12.6);
      group.add(slat);
    }
    const sign = makeSign('EL TALLER', '#ff4fa3', 11, 'REPAIRS · NO QUESTIONS');
    sign.position.set(x, 8.5, z + 12.8);
    group.add(sign);
    group.add(glowAt(0xff4fa3, 12, 0.25, x, 8.5, z + 13));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xff6b3a }));
    cone.position.set(x + 9, 0.55, z + 14);
    group.add(cone);
  }

  // City impound: chain fence, office and a yard for the evidence crates.
  {
    const x = 120, z = 168;
    const office = new THREE.Mesh(new THREE.BoxGeometry(13, 5.5, 11), new THREE.MeshStandardMaterial({ color: 0xd9c9b6, roughness: 0.9 }));
    office.position.set(130, 2.85, 177);
    office.castShadow = true;
    group.add(office);
    addBoxCollision(130, 177, 13.5, 11.5);
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x6b7185, roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0.55 });
    const fencePost = new THREE.BoxGeometry(0.12, 2.6, 0.12);
    for (let t = 0; t <= 30; t++) {
      const post = new THREE.Mesh(fencePost, fenceMat);
      post.position.set(104 + t, 1.4, 152);
      group.add(post);
      const post2 = new THREE.Mesh(fencePost, fenceMat);
      post2.position.set(104 + t, 1.4, 186);
      group.add(post2);
    }
    for (const zz of [154, 158, 162]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 0.08), fenceMat);
      rail.position.set(119, zz * 0.012 + 1.1, 152);
      group.add(rail);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 0.08), fenceMat);
      rail2.position.set(119, zz * 0.012 + 1.1, 186);
      group.add(rail2);
    }
    const sign = makeSign('CITY IMPOUND', '#ffb347', 9);
    sign.position.set(130, 6.2, 171.35);
    group.add(sign);
    addBoxCollision(119, 152, 31, 0.6);
    addBoxCollision(119, 186, 31, 0.6);
  }

  // PVPD headquarters: blue glass, a flag and a rooftop mast.
  {
    const x = 168, z = 72;
    const station = new THREE.Mesh(new THREE.BoxGeometry(27, 13, 21), new THREE.MeshStandardMaterial({ color: 0xc9c0e8, roughness: 0.55, metalness: 0.15 }));
    station.position.set(x, 6.6, z);
    station.castShadow = true;
    station.receiveShadow = true;
    group.add(station);
    addBoxCollision(x, z, 27.5, 21.5);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(27.2, 0.5, 21.2), new THREE.MeshBasicMaterial({ color: 0x4f8cff, toneMapped: false }));
    stripe.position.set(x, 8.6, z);
    group.add(stripe);
    animated.neon.push(stripe.material);
    const sign = makeSign('PVPD', '#4fa3ff', 10, 'PALMA VISTA POLICE');
    sign.position.set(x, 11.4, z + 10.7);
    group.add(sign);
    group.add(glowAt(0x4f8cff, 13, 0.25, x, 11.4, z + 11));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a5060, metalness: 0.6 }));
    mast.position.set(x, 17, z - 6);
    group.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff4f6a, toneMapped: false }));
    beacon.position.set(x, 21, z - 6);
    group.add(beacon);
    animated.neon.push(beacon.material);
  }

  // Club Sol: the neon heart of the strip.
  {
    const x = -120, z = -176;
    const club = new THREE.Mesh(new THREE.BoxGeometry(26, 10, 20), new THREE.MeshStandardMaterial({ color: 0x4a2f6b, roughness: 0.7, emissive: 0x1a0728, emissiveIntensity: 0.6 }));
    club.position.set(x, 5.1, z);
    club.castShadow = true;
    group.add(club);
    addBoxCollision(x, z, 26.5, 20.5);
    const sign = makeSign('CLUB SOL', '#ff4fa3', 16, 'LOS CUERVOS · TONIGHT');
    sign.position.set(x, 9.5, z + 10.2);
    group.add(sign);
    group.add(glowAt(0xff4fa3, 22, 0.4, x, 9.5, z + 11));
    const door = new THREE.Mesh(new THREE.BoxGeometry(5, 5.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
    door.position.set(x, 2.85, z + 10.1);
    group.add(door);
    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0xd8b45a, metalness: 0.7 }));
      post.position.set(x - 8 + i * 3.2, 0.6, z + 14);
      group.add(post);
    }
  }

  // St. Palma hospital: white grid, red cross.
  {
    const x = -72, z = 120;
    const hospital = new THREE.Mesh(new THREE.BoxGeometry(28, 15, 20), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.8 }));
    hospital.position.set(x, 7.6, z);
    hospital.castShadow = true;
    hospital.receiveShadow = true;
    group.add(hospital);
    addBoxCollision(x, z, 28.5, 20.5);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xe85f6a, toneMapped: false });
    const crossA = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 0.3), crossMat);
    crossA.position.set(x, 11, z + 10.2);
    group.add(crossA);
    const crossB = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 0.3), crossMat);
    crossB.position.set(x, 11, z + 10.2);
    group.add(crossB);
    const sign = makeSign('ST. PALMA', '#ff6b7a', 9);
    sign.position.set(x, 7.4, z + 10.25);
    group.add(sign);
  }

  // ------------------------------------------------------------ beach landmarks

  // Ferris wheel on the sand.
  {
    const wheel = new THREE.Group();
    wheel.position.set(236, 15, -100);
    wheel.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(12, 0.22, 6, 36), new THREE.MeshStandardMaterial({ color: 0xf6e5b8, emissive: 0xff8a5c, emissiveIntensity: 0.55, roughness: 0.4 }));
    wheel.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.1, 5, 28), new THREE.MeshStandardMaterial({ color: 0xff6b8a, emissive: 0xff2f6a, emissiveIntensity: 0.5 }));
    wheel.add(inner);
    const spokeMat = new THREE.MeshBasicMaterial({ color: 0xf0d8b0 });
    for (let i = 0; i < 12; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 24, 0.1), spokeMat);
      spoke.rotation.z = (i / 12) * Math.PI;
      wheel.add(spoke);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff4fa3 : 0x4fe3ff, toneMapped: false }));
      bulb.position.set(Math.cos((i / 12) * TAU) * 12, Math.sin((i / 12) * TAU) * 12, 0);
      wheel.add(bulb);
      const car = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: pick([0xffb347, 0xff6b8a, 0x4fe3ff], random), roughness: 0.6 }));
      car.position.set(Math.cos((i / 12) * TAU) * 12, Math.sin((i / 12) * TAU) * 12 - 1.0, 0);
      wheel.add(car);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.2, 10), new THREE.MeshStandardMaterial({ color: 0xf6e5b8, metalness: 0.4 }));
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    animated.wheels.push(wheel);
    group.add(wheel);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 17, 6), new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.7 }));
      leg.position.set(236, 7.5, -100 + s * 6);
      leg.rotation.x = -s * 0.42;
      group.add(leg);
    }
  }

  // Lifeguard tower and pier.
  {
    const tower = new THREE.Group();
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), new THREE.MeshStandardMaterial({ color: 0xf6e5b8, roughness: 0.8 }));
    cabin.position.y = 4.2;
    tower.add(cabin);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0xe85f6a }));
    roof.position.y = 6.0;
    roof.rotation.y = Math.PI / 4;
    tower.add(roof);
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 5), new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }));
      leg.position.set(sx, 1.7, sz);
      tower.add(leg);
    }
    tower.position.set(246, 0.1, 30);
    group.add(tower);

    const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 44), new THREE.MeshStandardMaterial({ color: 0x9b7a5c, roughness: 0.95 }));
    pier.position.set(246, 0.4, 138);
    pier.receiveShadow = true;
    group.add(pier);
    for (let i = 0; i < 8; i++) {
      for (const s of [-3, 3]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 5), new THREE.MeshStandardMaterial({ color: 0x6e5138 }));
        p.position.set(246 + s, -2.2, 120 + i * 5.2);
        group.add(p);
      }
    }
    const pierSign = makeSign('SUNSET PIER', '#ffb347', 8);
    pierSign.position.set(246, 5.4, 118);
    pierSign.rotation.y = Math.PI / 2;
    group.add(pierSign);
  }

  // ------------------------------------------------------------ marina

  const marinaDocks = [];
  for (let i = 0; i < 4; i++) {
    const x = -64 + i * 38;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.45, 34), new THREE.MeshStandardMaterial({ color: 0x9b7a5c, roughness: 0.95 }));
    dock.position.set(x, 0.3, 264);
    dock.receiveShadow = true;
    group.add(dock);
    marinaDocks.push(dock);
    for (let k = 0; k < 4; k++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 4, 5), new THREE.MeshStandardMaterial({ color: 0x6e5138 }));
      post.position.set(x + (k % 2 ? 2.6 : -2.6), -0.8, 251 + k * 8.5);
      group.add(post);
    }
    if (i < 3) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 7), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.45 }));
      hull.position.y = 0.55;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.22, 7), new THREE.MeshStandardMaterial({ color: pick([0x2fa7a0, 0xe85f6a, 0xf2a541], random) }));
      stripe.position.y = 0.95;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.6), new THREE.MeshStandardMaterial({ color: 0xcfe4e8, roughness: 0.3 }));
      cabin.position.set(0, 1.6, -0.8);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 5), new THREE.MeshStandardMaterial({ color: 0xd8d0c0 }));
      mast.position.set(0, 4.4, -1);
      boat.add(hull, stripe, cabin, mast);
      boat.position.set(x + 7, -0.2, 258 + (i % 2) * 10);
      boat.rotation.y = Math.PI / 2 + (random() - 0.5) * 0.2;
      boat.userData.baseY = boat.position.y;
      boat.userData.phase = random() * TAU;
      animated.boats.push(boat);
      group.add(boat);
    }
  }

  // Marina clubhouse and the lighthouse that closes the bay.
  {
    const clubhouse = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 12), new THREE.MeshStandardMaterial({ color: 0xf2c6b2, roughness: 0.85 }));
    clubhouse.position.set(60, 3.1, 246);
    clubhouse.castShadow = true;
    group.add(clubhouse);
    addBoxCollision(60, 246, 18.5, 12.5);
    const sign = makeSign('MARINA VISTA', '#4fe3ff', 10);
    sign.position.set(60, 6.7, 240.2);
    group.add(sign);
    group.add(glowAt(0x4fe3ff, 12, 0.25, 60, 6.7, 240));

    const lh = new THREE.Group();
    lh.position.set(168, 0.1, 240);
    for (let i = 0; i < 6; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.0 - i * 0.16, 3.15 - i * 0.16, 4, 12), new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xf4efe6 : 0xe85f6a, roughness: 0.8 }));
      band.position.y = 2 + i * 4;
      lh.add(band);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 2.6, 10), new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.25, metalness: 0.6 }));
    lamp.position.y = 25.5;
    lh.add(lamp);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe7a0, toneMapped: false }));
    glow.position.y = 25.5;
    lh.add(glow);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0x2c3440 }));
    cap.position.y = 28;
    lh.add(cap);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3, 42, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(21, 25.5, 0);
    const beamPivot = new THREE.Group();
    beamPivot.position.y = 25.5;
    beam.position.set(21, 0, 0);
    beamPivot.add(beam);
    lh.add(beamPivot);
    animated.beams.push(beamPivot);
    group.add(lh);
    addBoxCollision(168, 240, 7, 7);
  }

  // ------------------------------------------------------------ Neon arch across the strip

  {
    const z = -96;
    const x = -24;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c2a44, roughness: 0.5, metalness: 0.4 });
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 11, 1.4), pillarMat);
      pillar.position.set(x, 5.6, z + s * 10.8);
      pillar.castShadow = true;
      group.add(pillar);
      addBoxCollision(x, z + s * 10.8, 1.8, 1.8);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 22.8), pillarMat);
    beam.position.set(x, 11.1, z);
    group.add(beam);
    const neonPink = new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false });
    const neonCyan = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, toneMapped: false });
    for (const s2 of [-1, 1]) {
      for (const sideX of [-0.72, 0.72]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 9.6, 0.12), neonPink);
        strip.position.set(x + sideX, 5.6, z + s2 * 10.8);
        group.add(strip);
      }
      for (const sideX of [-0.62, 0.62]) {
        const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 20.6), neonCyan);
        strip2.position.set(x + sideX, 11.55, z);
        group.add(strip2);
      }
    }
    const sign = makeSign('PALMA VISTA', '#ff4fa3', 17.2, 'THE CITY THAT NEVER COOLS');
    sign.position.set(x + 0.7, 11.6, z);
    sign.rotation.y = Math.PI / 2;
    group.add(sign);
    const glow = makeGlow(0xff4fa3, 26, 0.4);
    glow.position.set(x, 11.4, z);
    group.add(glow);
    animated.neon.push(sign.material);
    // A second face, so the arch reads from both directions.
    const backMat = materialClone(sign.material);
    const back = new THREE.Mesh(sign.geometry, backMat);
    back.position.set(x - 0.7, 11.6, z);
    back.rotation.y = -Math.PI / 2;
    back.renderOrder = 2;
    group.add(back);
  }

  // Neon Alley: a small plaza left open under the arch, with a low club and market lights.
  {
    const x = -32, z = -63;
    const club = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 10), new THREE.MeshStandardMaterial({ color: 0x4a2f6b, roughness: 0.75, emissive: 0x14041f, emissiveIntensity: 0.55 }));
    club.position.set(x, 3.6, z);
    club.castShadow = true;
    club.receiveShadow = true;
    group.add(club);
    addBoxCollision(x, z, 18.5, 10.5);
    const sign = makeSign('NEON ALLEY', '#ff4fa3', 14, 'OPEN ALL NIGHT');
    sign.position.set(x, 8.2, z + 5.2);
    group.add(sign);
    group.add(glowAt(0xff4fa3, 16, 0.3, x, 8.2, z + 5.5));
    const door = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
    door.position.set(x, 2.3, z + 5.1);
    group.add(door);
    // The plaza stays open under the arch for the camera and the player.
    const hotel = makeSign('HOTEL VISTA', '#4fe3ff', 11, 'VACANCY · NO QUESTIONS');
    hotel.position.set(-24, 7.4, -118);
    hotel.rotation.y = Math.PI;
    group.add(hotel);
    group.add(glowAt(0x4fe3ff, 14, 0.26, -24, 7.4, -118.5));
    const radio = makeSign('RADIO', '#ff4fa3', 7);
    radio.position.set(8, 5.2, -90);
    radio.rotation.y = -Math.PI / 2;
    group.add(radio);
    group.add(glowAt(0xff4fa3, 9, 0.24, 7.8, 5.2, -90));
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 26), new THREE.MeshBasicMaterial({ color: 0x2a2030 }));
    wire.position.set(-24, 9.2, -76);
    group.add(wire);
    for (let i = 0; i < 9; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff4fa3 : 0x4fe3ff, toneMapped: false }));
      bulb.position.set(-24, 8.9, -88 + i * 3);
      group.add(bulb);
    }
  }

  // ------------------------------------------------------------ the causeway

  {
    const z = CITY.causewayZ;
    const from = CITY.causewayFromX;
    const to = CITY.causewayToX;
    const len = to - from;
    const mid = (from + to) / 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, CITY.causewayWidth), new THREE.MeshStandardMaterial({ color: 0x35344a, roughness: 0.85 }));
    deck.position.set(mid, 0.18, z);
    deck.receiveShadow = true;
    group.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.32, 0.35), new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.7 }));
      rail.position.set(mid, 1.0, z + s * (CITY.causewayWidth / 2 - 0.2));
      group.add(rail);
      for (let x = from + 6; x < to; x += 14) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.1, 0.24), new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }));
        post.position.set(x, 0.8, z + s * (CITY.causewayWidth / 2 - 0.2));
        group.add(post);
      }
      addBoxCollision(mid, z + s * (CITY.causewayWidth / 2 - 0.1), len, 0.55);
    }
    for (let x = from + 32; x < to; x += 46) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 9, 8), new THREE.MeshStandardMaterial({ color: 0x8f8270, roughness: 0.95 }));
      pillar.position.set(x, -4.2, z);
      group.add(pillar);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.42, 5, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xa89984, roughness: 0.9 }));
      arch.position.set(x, 0.2, z);
      arch.rotation.y = Math.PI / 2;
      group.add(arch);
    }
    for (let x = from + 18; x < to; x += 40) {
      for (const s of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.5, 5), new THREE.MeshStandardMaterial({ color: 0x3c3c4c }));
        pole.position.set(x, 3.0, z + s * (CITY.causewayWidth / 2 - 1.0));
        group.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd39b, toneMapped: false }));
        bulb.position.set(x, 5.9, z + s * (CITY.causewayWidth / 2 - 1.0));
        group.add(bulb);
      }
    }
    const sign = makeSign('PUENTE VISTA', '#4fe3ff', 13, 'TO THE KEYS');
    sign.position.set(from + 30, 8.6, z - 8.9);
    sign.rotation.y = Math.PI;
    group.add(sign);
    group.add(glowAt(0x4fe3ff, 14, 0.22, from + 30, 8.6, z - 9));
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
  const waterMat = new THREE.ShaderMaterial({
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
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, CITY.waterY, 0);
  group.add(water);
  animated.water = waterUniforms;

  // Seawall along the beach and marina, so the land reads as a raised shelf.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9c8e7c, roughness: 0.95 });
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 512), wallMat);
  eastWall.position.set(258.5, -0.9, 0);
  group.add(eastWall);
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(520, 2.2, 1.2), wallMat);
  southWall.position.set(-14, -0.9, 252.5);
  group.add(southWall);

  // ------------------------------------------------------------ distant hills and skyline

  const hillMat = new THREE.MeshStandardMaterial({ color: 0x4b3a66, roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const h = 50 + hash01(i * 31) * 80;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(44 + hash01(i * 7) * 40, h, 5), hillMat);
    hill.position.set(-470 + i * 48, h / 2 - 12, -420 - hash01(i) * 70);
    hill.rotation.y = hash01(i * 13) * TAU;
    group.add(hill);
  }
  const skylineMat = new THREE.MeshStandardMaterial({ color: 0x33284a, roughness: 0.9 });
  for (let i = 0; i < 26; i++) {
    const h = 22 + hash01(i * 19) * 70;
    const b = new THREE.Mesh(new THREE.BoxGeometry(14 + hash01(i) * 18, h, 16 + hash01(i * 3) * 14), skylineMat);
    b.position.set(-430 + i * 33, h / 2 - 2, -330 - hash01(i * 11) * 40);
    group.add(b);
  }

  // ------------------------------------------------------------ API

  const city = {
    group,
    blocks,
    collision,
    spots: SPOTS,
    buildings,
    waterUniforms,
    resolveCircle(x, z, radius = 0.45) {
      let px = x;
      let pz = z;
      for (const box of collision) {
        const minX = box.minX - radius;
        const maxX = box.maxX + radius;
        const minZ = box.minZ - radius;
        const maxZ = box.maxZ + radius;
        if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) continue;
        const dl = px - minX;
        const dr = maxX - px;
        const dt = pz - minZ;
        const db = maxZ - pz;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) px = minX - 0.001;
        else if (m === dr) px = maxX + 0.001;
        else if (m === dt) pz = minZ - 0.001;
        else pz = maxZ + 0.001;
      }
      // Land edges: the player can walk the beach and the causeway, never out to sea.
      if (px > 205) {
        if (Math.abs(pz) < CITY.causewayWidth / 2 + 1 && px > 200) {
          px = Math.min(px, CITY.causewayToX + 10);
        } else {
          px = Math.min(px, 254);
        }
      }
      const onBridge = px > 200 && Math.abs(pz) < CITY.causewayWidth / 2 + 1;
      px = Math.max(-246, Math.min(onBridge ? CITY.causewayToX + 10 : 254, px));
      pz = Math.max(-246, Math.min(248, pz));
      if (pz > 246.5 && px > -90 && px < 120) {
        // Marina promenade is open at the south edge.
        pz = Math.min(pz, 248);
      }
      return { x: px, z: pz };
    },
    isRoad(x, z) {
      for (const line of roadLines) {
        if (Math.abs(x - line) < CITY.roadWidth / 2 || Math.abs(z - line) < CITY.roadWidth / 2) return true;
      }
      return false;
    },
    onCauseway(x, z) {
      return x > 200 && Math.abs(z) < CITY.causewayWidth / 2;
    },
    minimap: {
      roadLines,
      blocks,
      beach: { minX: 205, maxX: 258, minZ: -252, maxZ: 252 },
      causeway: { minX: 200, maxX: 520, minZ: -8.5, maxZ: 8.5 },
      marina: { minX: -90, maxX: 120, minZ: 246, maxZ: 320 },
    },
    update(t, dt) {
      animated.water.uTime.value = t;
      for (const wheel of animated.wheels) wheel.rotation.z = t * 0.16;
      for (const beam of animated.beams) beam.rotation.y = t * 0.55;
      for (const boat of animated.boats) {
        boat.position.y = boat.userData.baseY + Math.sin(t * 1.1 + boat.userData.phase) * 0.18;
        boat.rotation.z = Math.sin(t * 0.8 + boat.userData.phase) * 0.035;
      }
      for (let i = 0; i < animated.neon.length; i++) {
        const mat = animated.neon[i];
        if (mat.opacity !== undefined) mat.opacity = 0.86 + Math.sin(t * (1.7 + i * 0.13) + i) * 0.14;
      }
    },
    setSun(sunDir, fogColor) {
      waterUniforms.uSunDir.value.copy(sunDir).normalize();
      waterUniforms.uFogColor.value.setHex(fogColor);
    },
  };
  return city;
}

