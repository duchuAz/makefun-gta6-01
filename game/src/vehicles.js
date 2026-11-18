// Cars: one mesh factory used by parked cars, traffic and the police, and one arcade physics
// model for anything the player is driving. Speed, grip, drift and crash damage are all
// tuned by the spec table in config.js; a wrecked car smokes and then goes up in a stylised
// orange bloom, never anything graphic.
import * as THREE from 'three';
import { CARS } from './config.js';
import { clamp, damp, wrapAngle } from './math.js';

function makeSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, 'rgba(190,190,200,0.8)');
  grad.addColorStop(0.55, 'rgba(120,120,135,0.32)');
  grad.addColorStop(1, 'rgba(80,80,95,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTaxiSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f2c541';
  g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#1a1a24';
  g.font = '900 32px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TAXI', 64, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let smokeTexture = null;
let taxiTexture = null;
let lightTexture = null;

function makeLightTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A car's visible shell. Returns the group plus the bits other systems animate: wheels,
 * front wheels, light bar materials, head/tail light materials, the body material and smoke.
 */
export function makeCarMesh(kind = 'sedan', colorOverride = null, { police = false, gang = false, taxi = false } = {}) {
  const spec = CARS[kind] ?? CARS.sedan;
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  const bodyColor = colorOverride ?? (police ? 0xf2f2f2 : spec.color);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.38, metalness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x20202c, roughness: 0.45, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x162430, roughness: 0.12, metalness: 0.65, emissive: 0x0a1a22, emissiveIntensity: 0.35 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.9, roughness: 0.2 });
  const [, bh, bl] = spec.body;
  const [cw, ch, cl] = spec.cabin;

  const lower = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0], bh, bl), bodyMat);
  lower.position.y = 0.72;
  lower.castShadow = true;
  lower.receiveShadow = true;
  chassis.add(lower);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 0.92, 0.22, bl * 0.95), trimMat);
  belly.position.y = 0.37;
  belly.castShadow = true;
  chassis.add(belly);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cl), glassMat);
  cabin.position.set(0, 0.72 + bh / 2 + ch / 2 - 0.03, -0.18);
  cabin.castShadow = true;
  chassis.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.94, 0.09, cl * 0.88), bodyMat);
  roof.position.set(0, 0.72 + bh / 2 + ch - 0.02, -0.18);
  chassis.add(roof);

  // Pillars keep the greenhouse from reading as one glass brick.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, ch + 0.02, 0.1), bodyMat);
      pillar.position.set(sx * (cw / 2 - 0.03), 0.72 + bh / 2 + ch / 2, -0.18 + sz * (cl / 2 - 0.03));
      chassis.add(pillar);
    }
  }

  // Bumpers, grille and side mirrors.
  for (const sz of [-1, 1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 1.02, 0.22, 0.22), chromeMat);
    bumper.position.set(0, 0.6, sz * (bl / 2 + 0.02));
    chassis.add(bumper);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 0.52, 0.16, 0.06), trimMat);
  grille.position.set(0, 0.76, bl / 2 + 0.1);
  chassis.add(grille);
  for (const sx of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.1), bodyMat);
    mirror.position.set(sx * (cw / 2 + 0.13), 1.18, 0.32);
    chassis.add(mirror);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.27, 12);
  const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.285, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8b8c4, metalness: 0.85, roughness: 0.25 });
  const wheels = [];
  const frontWheels = [];
  const axles = [
    [-1, 1], [1, 1], [-1, -1], [1, -1],
  ];
  for (const [sx, sz] of axles) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(sx * (spec.body[0] / 2 - 0.08), 0.4, sz * (bl * 0.34));
    const tire = new THREE.Mesh(wheelGeo, wheelMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(tire, rim);
    chassis.add(wheelGroup);
    wheels.push(wheelGroup);
    if (sz > 0) frontWheels.push(wheelGroup);
  }

  // Lights: emissive blocks plus soft glow cards on the road-facing side.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3a4a, toneMapped: false });
  const headlights = [];
  const taillights = [];
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.06), headMat);
    head.position.set(sx * 0.58, 0.82, bl / 2 + 0.07);
    chassis.add(head);
    headlights.push(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.05), tailMat.clone());
    tail.position.set(sx * 0.6, 0.82, -bl / 2 - 0.07);
    chassis.add(tail);
    taillights.push(tail);
  }

  if (kind === 'sports' || kind === 'muscle') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 0.82, 0.07, 0.32), trimMat);
    wing.position.set(0, 1.02, -bl / 2 + 0.25);
    chassis.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.14), trimMat);
      strut.position.set(sx * spec.body[0] * 0.32, 0.92, -bl / 2 + 0.26);
      chassis.add(strut);
    }
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 0.95, 0.06, 0.42), trimMat);
    splitter.position.set(0, 0.43, bl / 2 - 0.02);
    chassis.add(splitter);
  }

  if (!lightTexture) lightTexture = makeLightTexture();
  const glowSprites = [];
  for (const sx of [-1, 1]) {
    const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightTexture, color: 0xfff0c0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    headGlow.position.set(sx * 0.58, 0.82, bl / 2 + 0.15);
    headGlow.scale.set(1.4, 1.4, 1);
    group.add(headGlow);
    glowSprites.push(headGlow);
    const tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightTexture, color: 0xff3040, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    tailGlow.position.set(sx * 0.6, 0.82, -bl / 2 - 0.15);
    tailGlow.scale.set(1.1, 1.1, 1);
    group.add(tailGlow);
    glowSprites.push(tailGlow);
  }

  let meshLightGlows = null;
  let lightbarRed = null;
  let lightbarBlue = null;
  if (police) {
    const doorBlack = new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 1.7), doorBlack);
      door.position.set(sx * (spec.body[0] / 2 + 0.02), 0.76, -0.1);
      chassis.add(door);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 0.62, 0.14, 0.34), trimMat);
    bar.position.set(0, 1.28, -0.15);
    chassis.add(bar);
    lightbarRed = new THREE.MeshBasicMaterial({ color: 0xff2444, toneMapped: false });
    lightbarBlue = new THREE.MeshBasicMaterial({ color: 0x2f7dff, toneMapped: false });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.3), lightbarRed);
    red.position.set(-0.32, 1.32, -0.15);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.3), lightbarBlue);
    blue.position.set(0.32, 1.32, -0.15);
    chassis.add(red, blue);
    const redGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightTexture, color: 0xff2444, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    redGlow.position.set(-0.32, 1.35, -0.15);
    redGlow.scale.set(1.9, 1.9, 1);
    const blueGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightTexture, color: 0x2f7dff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    blueGlow.position.set(0.32, 1.35, -0.15);
    blueGlow.scale.set(1.9, 1.9, 1);
    group.add(redGlow, blueGlow);
    meshLightGlows = { redGlow, blueGlow };
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 0.7, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0x2f7dff, toneMapped: false }));
    stripe.position.set(0, 0.98, bl / 2 + 0.08);
    chassis.add(stripe);
  }

  if (taxi) {
    if (!taxiTexture) taxiTexture = makeTaxiSign();
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.34), new THREE.MeshBasicMaterial({ map: taxiTexture, toneMapped: false }));
    sign.position.set(0, 1.4, -0.15);
    chassis.add(sign);
  }

  if (gang) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.body[0] * 1.001, 0.09, bl * 0.7), new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.4 }));
    stripe.position.set(0, 0.98, 0);
    chassis.add(stripe);
  }

  // Smoke card for a damaged engine.
  if (!smokeTexture) smokeTexture = makeSmokeTexture();
  const smokeMat = new THREE.SpriteMaterial({ map: smokeTexture, color: 0x9a9aa8, transparent: true, opacity: 0, depthWrite: false });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.scale.set(2.4, 2.4, 1);
  smoke.position.set(0, 1.5, bl / 2 - 0.2);
  group.add(smoke);

  return {
    group,
    chassis,
    glowSprites,
    lightGlows: meshLightGlows,
    wheels,
    frontWheels,
    bodyMat,
    glassMat,
    headlightMat: headMat,
    taillightMats: taillights.map((t) => t.material),
    lightbarRed,
    lightbarBlue,
    smoke,
    spec,
    kind,
    police,
  };
}

export function createVehicleSystem(scene, city) {
  const cars = [];
  let nextId = 0;

  function spawn(kind, color, x, z, heading = 0, options = {}) {
    const mesh = makeCarMesh(kind, color, options);
    mesh.group.position.set(x, 0.1, z);
    mesh.group.rotation.y = heading;
    scene.add(mesh.group);
    const car = {
      id: options.id ?? `car-${nextId++}`,
      kind,
      spec: mesh.spec,
      mesh,
      group: mesh.group,
      x, z, heading,
      vx: 0, vz: 0,
      speed: 0,
      steer: 0,
      health: options.health ?? 100,
      maxHealth: options.health ?? 100,
      driver: null,
      parked: options.parked ?? true,
      stolen: false,
      dead: false,
      police: Boolean(options.police),
      gang: Boolean(options.gang),
      siren: false,
      wheelSpin: 0,
      label: mesh.spec.label,
      radio: 0,
      throttle: 0,
      brake: 0,
      lock: options.lock ?? false,
    };
    cars.push(car);
    return car;
  }

  const parked = [
    ['sedan', 0xe8d8c8, -5.4, 60, 0],
    ['muscle', 0xe86a5c, -98.4, 30, 0],
    ['sedan', 0xbfe3d0, 40, 43.2, Math.PI / 2],
    ['taxi', 0xf2c541, -60, -53.2, Math.PI / 2],
    ['sports', 0xf2c6b2, 100.8, -24, Math.PI],
    ['van', 0xbfe3d0, 13.2, 91, Math.PI / 2],
    ['muscle', 0x7b61c9, -53.2, 120, 0],
    ['sedan', 0xc9c0e8, 84, 139.2, Math.PI / 2],
    ['taxi', 0xf2c541, 264, -4.2, Math.PI / 2],
    ['sports', 0x7de8c8, 282, 4.4, -Math.PI / 2],
  ];
  for (const [kind, color, x, z, heading] of parked) {
    const car = spawn(kind, color, x, z, heading, { parked: true, taxi: kind === 'taxi' });
  }

  // The mission car: mint, parked on the Vista Motors forecourt.
  const mint = spawn('sports', 0x7de8c8, 63, -112, 0.15, { parked: true, id: 'mint-gt', lock: true });
  mint.label = 'MINT SOLAR GT';

  let active = null;

  function nearest(x, z, maxDistance = 4.4, includeTraffic = false) {
    let best = null;
    let bestD = maxDistance * maxDistance;
    for (const car of cars) {
      if (car.dead) continue;
      const d = (car.x - x) ** 2 + (car.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function adopt(car) {
    if (!cars.includes(car)) {
      cars.push(car);
      car.parked = false;
      car.driver = null;
    }
    return car;
  }

  function enter(car, player) {
    if (!car || car.dead || car.driver) return false;
    car.driver = 'player';
    car.parked = false;
    car.stolen = car.kind !== 'police';
    active = car;
    player.state.inCar = car;
    player.state.vx = 0;
    player.state.vz = 0;
    player.state.x = car.x;
    player.state.z = car.z;
    player.syncWeapon();
    return true;
  }

  function exit(player) {
    if (!active) return null;
    const car = active;
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);
    let ex = car.x - rightX * 2.4;
    let ez = car.z - rightZ * 2.4;
    let fixed = city.resolveCircle(ex, ez, 0.5);
    if (Math.hypot(fixed.x - ex, fixed.z - ez) > 0.6) {
      ex = car.x + rightX * 2.4;
      ez = car.z + rightZ * 2.4;
      fixed = city.resolveCircle(ex, ez, 0.5);
    }
    player.state.x = fixed.x;
    player.state.z = fixed.z;
    player.state.y = 0.1;
    player.state.vx = car.vx * 0.15;
    player.state.vz = car.vz * 0.15;
    player.state.inCar = null;
    player.syncWeapon();
    car.driver = null;
    active = null;
    return car;
  }

  function damageCar(car, amount, ctx) {
    if (car.dead || amount <= 0) return false;
    car.health = Math.max(0, car.health - amount);
    if (car.health <= 0) {
      car.dead = true;
      car.exploded = true;
      car.driver = null;
      car.throttle = 0;
      car.brake = 1;
      if (ctx?.combat) ctx.combat.explodeAt(car.x, 1.2, car.z, 8);
      if (ctx?.audio) ctx.audio.explosion();
      if (ctx?.cameraCtl) ctx.cameraCtl.shake(1.4);
      if (active === car) {
        active = null;
      }
      return true;
    }
    return false;
  }

  function collideCar(car, dt, ctx) {
    const oldX = car.x;
    const oldZ = car.z;
    const fixed = city.resolveCircle(car.x, car.z, 1.45);
    if (Math.abs(fixed.x - car.x) < 0.0001 && Math.abs(fixed.z - car.z) < 0.0001) return 0;
    const nx = fixed.x - car.x;
    const nz = fixed.z - car.z;
    const len = Math.hypot(nx, nz) || 1;
    const normalX = nx / len;
    const normalZ = nz / len;
    const impact = Math.hypot(car.vx, car.vz);
    car.x = fixed.x;
    car.z = fixed.z;
    const dot = car.vx * normalX + car.vz * normalZ;
    if (dot < 0) {
      car.vx -= 1.45 * dot * normalX;
      car.vz -= 1.45 * dot * normalZ;
    }
    car.vx *= 0.42;
    car.vz *= 0.42;
    car.speed *= 0.35;
    if (impact > 5.2) {
      const damage = (impact - 4) * 2.1;
      damageCar(car, damage, ctx);
      if (ctx?.cameraCtl) ctx.cameraCtl.shake(Math.min(1.0, damage * 0.02));
      if (ctx?.audio) ctx.audio.impact();
      if (active === car && ctx?.player) {
        ctx.player.damage((impact - 4) * 0.9);
      }
    }
    car.x = Math.max(-246, Math.min(534, car.x));
    car.z = Math.max(-246, Math.min(248, car.z));
    return impact;
  }

  function drive(car, dt, controls, ctx) {
    if (car.dead) {
      car.vx *= 1 - 2.4 * dt;
      car.vz *= 1 - 2.4 * dt;
      car.x += car.vx * dt;
      car.z += car.vz * dt;
      animateCar(car, dt, 0);
      return;
    }
    const spec = car.spec;
    const throttle = clamp(controls.throttle ?? 0, -1, 1);
    const steer = clamp(controls.steer ?? 0, -1, 1);
    const brake = Boolean(controls.brake);
    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);
    let f = car.vx * fwdX + car.vz * fwdZ;
    let l = car.vx * rightX + car.vz * rightZ;
    const boost = controls.boost ? 1.16 : 1;
    if (throttle > 0) {
      f += spec.accel * boost * throttle * dt * (1 - Math.max(0, f) / (spec.maxSpeed * boost));
    } else if (throttle < 0) {
      if (f > 0.9) f -= spec.brake * dt;
      else f = Math.max(-11, f + spec.accel * 0.48 * throttle * dt);
    }
    if (brake) {
      const amount = spec.brake * 1.25 * dt;
      f = f > 0 ? Math.max(0, f - amount) : Math.min(0, f + amount);
    }
    const drag = brake ? 1.7 : 0.52;
    f *= Math.max(0, 1 - (drag + Math.abs(f) * 0.011) * dt);
    const grip = brake ? spec.grip * 0.2 : spec.grip;
    l *= Math.exp(-grip * dt);
    if (Math.abs(f) < 0.06 && Math.abs(throttle) < 0.02) f = 0;
    const speedRatio = clamp(Math.abs(f) / spec.maxSpeed, 0, 1);
    const turn = steer * spec.steer * clamp(Math.abs(f) / 8, 0, 1) * Math.sign(f || 1) * (1 - speedRatio * 0.28);
    car.heading = wrapAngle(car.heading + turn * dt);
    car.steer = damp(car.steer, steer, 9, dt);
    car.throttle = throttle;
    car.brake = brake ? 1 : 0;
    const fwd2X = Math.sin(car.heading);
    const fwd2Z = Math.cos(car.heading);
    const right2X = Math.cos(car.heading);
    const right2Z = -Math.sin(car.heading);
    car.vx = fwd2X * f + right2X * l;
    car.vz = fwd2Z * f + right2Z * l;
    car.speed = Math.hypot(car.vx, car.vz);
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    collideCar(car, dt, ctx);
    if (car.driver === 'player' && ctx?.police?.wanted > 0 && car.speed > 20) {
      // Fast reckless driving keeps the heat on.
      ctx.police.heat?.(dt * 0.16);
    }
    animateCar(car, dt, f);
  }

  function animateCar(car, dt, forwardSpeed) {
    const mesh = car.mesh;
    car.wheelSpin += forwardSpeed * dt / 0.36;
    for (const wheel of mesh.wheels) wheel.rotation.x = car.wheelSpin;
    for (const wheel of mesh.frontWheels) wheel.rotation.y = car.steer * 0.42;
    mesh.group.position.set(car.x, 0.1, car.z);
    mesh.group.rotation.y = car.heading;
    const damage = 1 - car.health / car.maxHealth;
    if (mesh.smoke) {
      mesh.smoke.material.opacity = car.dead ? 0.75 : damage > 0.45 ? (damage - 0.45) * 0.8 : 0;
      if (mesh.smoke.material.opacity > 0) {
        mesh.smoke.scale.setScalar(1.2 + damage * 2.2 + Math.sin(performance.now() * 0.004) * 0.2);
      }
    }
    for (const mat of mesh.taillightMats) {
      mat.color.setHex(car.brake ? 0xff5a3a : 0x9a1a2a);
    }
    if (mesh.lightbarRed && mesh.lightbarBlue) {
      const phase = Math.sin(performance.now() * 0.012) > 0;
      const on = car.siren;
      mesh.lightbarRed.color.setHex(on && phase ? 0xff2444 : 0x3a1020);
      mesh.lightbarBlue.color.setHex(on && !phase ? 0x2f7dff : 0x10204a);
      if (mesh.lightGlows) {
        mesh.lightGlows.redGlow.material.opacity = on && phase ? 0.95 : 0.08;
        mesh.lightGlows.blueGlow.material.opacity = on && !phase ? 0.95 : 0.08;
      }
    }
    // A little body roll, kept subtle.
    mesh.chassis.rotation.z = damp(mesh.chassis.rotation.z, -car.steer * clamp(car.speed / 30, 0, 1) * 0.055, 7, dt);
    mesh.chassis.rotation.x = damp(mesh.chassis.rotation.x, car.brake ? 0.025 : -car.throttle * 0.012, 6, dt);
  }

  function update(dt, ctx) {
    for (const car of cars) {
      if (car.driver === 'player' && active === car) continue;
      if (car.dead) {
        car.vx *= 1 - 1.6 * dt;
        car.vz *= 1 - 1.6 * dt;
        car.x += car.vx * dt;
        car.z += car.vz * dt;
        animateCar(car, dt, 0);
      } else if (car.driver === 'ai') {
        // AI control is supplied by traffic/police in ctx.controls.
        const controls = ctx.controls?.(car) ?? { throttle: 0, steer: 0, brake: true };
        drive(car, dt, controls, ctx);
      } else {
        animateCar(car, dt, 0);
      }
    }
  }

  return {
    cars,
    spawn,
    nearest,
    adopt,
    enter,
    exit,
    drive,
    update,
    damageCar,
    animateCar,
    get active() { return active; },
    set active(v) { active = v; },
    mint,
    remove(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      scene.remove(car.group);
    },
  };
}

