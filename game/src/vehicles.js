// Cars. One mesh factory serves parked cars, ambient traffic and the police, and one arcade
// physics model serves anything the player is driving. Speed, grip, drift and crash damage all
// come from the spec table in config.js. A wrecked car smokes, then goes up in a stylised
// orange bloom; nothing here is graphic.
import * as THREE from 'three';
import { CARS } from './config.js';
import { clamp, damp, wrapAngle } from './math.js';

/** Soft grey puff used for a damaged engine. */
function makeSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx2d = canvas.getContext('2d');
  const gradient = ctx2d.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(190,190,200,0.8)');
  gradient.addColorStop(0.55, 'rgba(120,120,135,0.32)');
  gradient.addColorStop(1, 'rgba(80,80,95,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, 96, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The little roof card that marks a Sun Cab. */
function makeTaxiSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const ctx2d = canvas.getContext('2d');
  ctx2d.fillStyle = '#f2c541';
  ctx2d.fillRect(0, 0, 128, 48);
  ctx2d.fillStyle = '#1a1a24';
  ctx2d.font = '900 32px Arial';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText('TAXI', 64, 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let smokeTexture = null;
let taxiTexture = null;
let lightTexture = null;

/** Radial white card used additively for headlights, tail lights and the police bar. */
function makeLightTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx2d = canvas.getContext('2d');
  const gradient = ctx2d.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Builds the four wheel groups. Front wheels are tracked separately so they can steer. */
function addWheels(bodyGroup, carSpec, wheelGeometry, rimGeometry, wheelMaterial, rimMaterial) {
  const wheels = [];
  const frontWheels = [];
  const axlePositions = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ];

  for (const [side, end] of axlePositions) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(side * (carSpec.body[0] / 2 - 0.08), 0.4, end * (carSpec.body[2] * 0.34));

    const tire = new THREE.Mesh(wheelGeometry, wheelMaterial);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;

    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.z = Math.PI / 2;

    wheelGroup.add(tire, rim);
    bodyGroup.add(wheelGroup);
    wheels.push(wheelGroup);
    if (end > 0) frontWheels.push(wheelGroup);
  }

  return { wheels, frontWheels };
}

/** Adds the head and tail lenses, returning both so the animator can tint them. */
function addLamps(bodyGroup, bodyLength, headMaterial, tailMaterial, headlights, taillights) {
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.06), headMaterial);
    head.position.set(side * 0.58, 0.82, bodyLength / 2 + 0.07);
    bodyGroup.add(head);
    headlights.push(head);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.05), tailMaterial.clone());
    tail.position.set(side * 0.6, 0.82, -bodyLength / 2 - 0.07);
    bodyGroup.add(tail);
    taillights.push(tail);
  }
}

/** Additive head and tail glow cards; they live on the root group, not the rolling chassis. */
function addLightGlows(rootGroup, bodyLength) {
  const glowSprites = [];
  for (const side of [-1, 1]) {
    const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: lightTexture,
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    headGlow.position.set(side * 0.58, 0.82, bodyLength / 2 + 0.15);
    headGlow.scale.set(1.4, 1.4, 1);
    rootGroup.add(headGlow);
    glowSprites.push(headGlow);

    const tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: lightTexture,
      color: 0xff3040,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    tailGlow.position.set(side * 0.6, 0.82, -bodyLength / 2 - 0.15);
    tailGlow.scale.set(1.1, 1.1, 1);
    rootGroup.add(tailGlow);
    glowSprites.push(tailGlow);
  }
  return glowSprites;
}

/** Police livery: black doors, roof bar, red/blue lenses and their glow cards. */
function addPoliceKit(rootGroup, bodyGroup, carSpec, trimMaterial) {
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.5 });
  for (const side of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 1.7), doorMaterial);
    door.position.set(side * (carSpec.body[0] / 2 + 0.02), 0.76, -0.1);
    bodyGroup.add(door);
  }

  const barBase = new THREE.Mesh(new THREE.BoxGeometry(carSpec.body[0] * 0.62, 0.14, 0.34), trimMaterial);
  barBase.position.set(0, 1.28, -0.15);
  bodyGroup.add(barBase);

  const lightbarRed = new THREE.MeshBasicMaterial({ color: 0xff2444, toneMapped: false });
  const lightbarBlue = new THREE.MeshBasicMaterial({ color: 0x2f7dff, toneMapped: false });

  const redLens = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.3), lightbarRed);
  redLens.position.set(-0.32, 1.32, -0.15);
  const blueLens = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.3), lightbarBlue);
  blueLens.position.set(0.32, 1.32, -0.15);
  bodyGroup.add(redLens, blueLens);

  const redGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: lightTexture,
    color: 0xff2444,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  redGlow.position.set(-0.32, 1.35, -0.15);
  redGlow.scale.set(1.9, 1.9, 1);

  const blueGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: lightTexture,
    color: 0x2f7dff,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  blueGlow.position.set(0.32, 1.35, -0.15);
  blueGlow.scale.set(1.9, 1.9, 1);

  rootGroup.add(redGlow, blueGlow);

  const hoodStripe = new THREE.Mesh(
    new THREE.BoxGeometry(carSpec.body[0] * 0.7, 0.08, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x2f7dff, toneMapped: false }),
  );
  hoodStripe.position.set(0, 0.98, carSpec.body[2] / 2 + 0.08);
  bodyGroup.add(hoodStripe);

  return { redGlow, blueGlow, lightbarRed, lightbarBlue };
}

/**
 * A car's visible shell. The returned object carries the group plus everything the systems
 * animate: wheels, front wheels, light-bar materials, lamp materials, the body material and
 * the engine-smoke sprite.
 */
export function makeCarMesh(kind = 'sedan', colorOverride = null, options = {}) {
  const { police = false, gang = false, taxi = false } = options;
  const carSpec = CARS[kind] ?? CARS.sedan;
  const rootGroup = new THREE.Group();
  const bodyGroup = new THREE.Group();
  rootGroup.add(bodyGroup);

  const bodyColor = colorOverride ?? (police ? 0xf2f2f2 : carSpec.color);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.38, metalness: 0.35 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x20202c, roughness: 0.45, metalness: 0.4 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x162430,
    roughness: 0.12,
    metalness: 0.65,
    emissive: 0x0a1a22,
    emissiveIntensity: 0.35,
  });
  const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.9, roughness: 0.2 });

  const bodyHeight = carSpec.body[1];
  const bodyLength = carSpec.body[2];
  const cabinWidth = carSpec.cabin[0];
  const cabinHeight = carSpec.cabin[1];
  const cabinLength = carSpec.cabin[2];

  const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(carSpec.body[0], bodyHeight, bodyLength), bodyMaterial);
  lowerBody.position.y = 0.72;
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  bodyGroup.add(lowerBody);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(carSpec.body[0] * 0.92, 0.22, bodyLength * 0.95), trimMaterial);
  belly.position.y = 0.37;
  belly.castShadow = true;
  bodyGroup.add(belly);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinLength), glassMaterial);
  cabin.position.set(0, 0.72 + bodyHeight / 2 + cabinHeight / 2 - 0.03, -0.18);
  cabin.castShadow = true;
  bodyGroup.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(cabinWidth * 0.94, 0.09, cabinLength * 0.88), bodyMaterial);
  roof.position.set(0, 0.72 + bodyHeight / 2 + cabinHeight - 0.02, -0.18);
  bodyGroup.add(roof);

  // Pillars keep the greenhouse from reading as one glass brick.
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, cabinHeight + 0.02, 0.1), bodyMaterial);
      pillar.position.set(
        side * (cabinWidth / 2 - 0.03),
        0.72 + bodyHeight / 2 + cabinHeight / 2,
        -0.18 + end * (cabinLength / 2 - 0.03),
      );
      bodyGroup.add(pillar);
    }
  }

  // Bumpers, grille and side mirrors.
  for (const end of [-1, 1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(carSpec.body[0] * 1.02, 0.22, 0.22), chromeMaterial);
    bumper.position.set(0, 0.6, end * (bodyLength / 2 + 0.02));
    bodyGroup.add(bumper);
  }

  const grille = new THREE.Mesh(new THREE.BoxGeometry(carSpec.body[0] * 0.52, 0.16, 0.06), trimMaterial);
  grille.position.set(0, 0.76, bodyLength / 2 + 0.1);
  bodyGroup.add(grille);

  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.1), bodyMaterial);
    mirror.position.set(side * (cabinWidth / 2 + 0.13), 1.18, 0.32);
    bodyGroup.add(mirror);
  }

  const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.27, 12);
  const rimGeometry = new THREE.CylinderGeometry(0.19, 0.19, 0.285, 8);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.85 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xb8b8c4, metalness: 0.85, roughness: 0.25 });
  const { wheels, frontWheels } = addWheels(
    bodyGroup,
    carSpec,
    wheelGeometry,
    rimGeometry,
    wheelMaterial,
    rimMaterial,
  );

  // Lights: emissive blocks plus soft glow cards on the road-facing side.
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false });
  const taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff3a4a, toneMapped: false });
  const headlights = [];
  const taillights = [];
  addLamps(bodyGroup, bodyLength, headlightMaterial, taillightMaterial, headlights, taillights);

  if (kind === 'sports' || kind === 'muscle') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(carSpec.body[0] * 0.82, 0.07, 0.32), trimMaterial);
    wing.position.set(0, 1.02, -bodyLength / 2 + 0.25);
    bodyGroup.add(wing);

    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.14), trimMaterial);
      strut.position.set(side * carSpec.body[0] * 0.32, 0.92, -bodyLength / 2 + 0.26);
      bodyGroup.add(strut);
    }

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(carSpec.body[0] * 0.95, 0.06, 0.42), trimMaterial);
    splitter.position.set(0, 0.43, bodyLength / 2 - 0.02);
    bodyGroup.add(splitter);
  }

  if (!lightTexture) lightTexture = makeLightTexture();
  const glowSprites = addLightGlows(rootGroup, bodyLength);

  let lightGlows = null;
  let lightbarRed = null;
  let lightbarBlue = null;
  if (police) {
    const kit = addPoliceKit(rootGroup, bodyGroup, carSpec, trimMaterial);
    lightGlows = { redGlow: kit.redGlow, blueGlow: kit.blueGlow };
    lightbarRed = kit.lightbarRed;
    lightbarBlue = kit.lightbarBlue;
  }

  if (taxi) {
    if (!taxiTexture) taxiTexture = makeTaxiSign();
    const taxiSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.26, 0.34),
      new THREE.MeshBasicMaterial({ map: taxiTexture, toneMapped: false }),
    );
    taxiSign.position.set(0, 1.4, -0.15);
    bodyGroup.add(taxiSign);
  }

  if (gang) {
    const gangStripe = new THREE.Mesh(
      new THREE.BoxGeometry(carSpec.body[0] * 1.001, 0.09, bodyLength * 0.7),
      new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.4 }),
    );
    gangStripe.position.set(0, 0.98, 0);
    bodyGroup.add(gangStripe);
  }

  // Smoke card for a damaged engine.
  if (!smokeTexture) smokeTexture = makeSmokeTexture();
  const smokeMaterial = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: 0x9a9aa8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const smoke = new THREE.Sprite(smokeMaterial);
  smoke.scale.set(2.4, 2.4, 1);
  smoke.position.set(0, 1.5, bodyLength / 2 - 0.2);
  rootGroup.add(smoke);

  return {
    group: rootGroup,
    chassis: bodyGroup,
    glowSprites,
    lightGlows,
    wheels,
    frontWheels,
    bodyMat: bodyMaterial,
    glassMat: glassMaterial,
    headlightMat: headlightMaterial,
    taillightMats: taillights.map((tail) => tail.material),
    lightbarRed,
    lightbarBlue,
    smoke,
    spec: carSpec,
    kind,
    police,
  };
}

/**
 * Owns every car that is not ambient traffic or a police cruiser: the parked cars, the mint
 * mission car, and whatever the player has stolen. Physics is intentionally arcade.
 */
export function createVehicleSystem(scene, city) {
  const cars = [];
  let nextId = 0;

  /** Creates a car record and its mesh. Callers may pre-set an id for mission lookups. */
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
      x,
      z,
      heading,
      vx: 0,
      vz: 0,
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

  // Parked cars around the city. Order is stable; each entry is kind, colour, x, z, heading.
  const parkedCars = [
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

  for (const [kind, color, x, z, heading] of parkedCars) {
    spawn(kind, color, x, z, heading, { parked: true, taxi: kind === 'taxi' });
  }

  // The mission car: mint, parked on the Vista Motors forecourt.
  const mint = spawn('sports', 0x7de8c8, 63, -112, 0.15, { parked: true, id: 'mint-gt', lock: true });
  mint.label = 'MINT SOLAR GT';

  let active = null;

  /** Closest live car within maxDistance. Squared distances avoid a square root per car. */
  function nearest(x, z, maxDistance = 4.4, includeTraffic = false) {
    let best = null;
    let bestDistanceSq = maxDistance * maxDistance;
    for (const car of cars) {
      if (car.dead) continue;
      const distanceSq = (car.x - x) ** 2 + (car.z - z) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = car;
      }
    }
    return best;
  }

  /** Adds a stolen traffic car to this system without rebuilding it. */
  function adopt(car) {
    if (!cars.includes(car)) {
      cars.push(car);
      car.parked = false;
      car.driver = null;
    }
    return car;
  }

  /** Seats the player in a car. Refuses wrecks and cars that already have a driver. */
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

  /** Puts the player on the pavement, preferring the right-hand side of the car. */
  function exit(player) {
    if (!active) return null;
    const car = active;
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);

    let exitX = car.x - rightX * 2.4;
    let exitZ = car.z - rightZ * 2.4;
    let fixed = city.resolveCircle(exitX, exitZ, 0.5);

    if (Math.hypot(fixed.x - exitX, fixed.z - exitZ) > 0.6) {
      exitX = car.x + rightX * 2.4;
      exitZ = car.z + rightZ * 2.4;
      fixed = city.resolveCircle(exitX, exitZ, 0.5);
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

  /** Applies damage; returns true on the hit that wrecks the car. */
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
      if (active === car) active = null;
      return true;
    }

    return false;
  }

  /**
   * Resolves a car against the city's collision boxes. The normal is derived from the push
   * vector, the velocity is reflected, and hard impacts damage both car and driver.
   */
  function collideCar(car, dt, ctx) {
    const beforeX = car.x;
    const beforeZ = car.z;
    const fixed = city.resolveCircle(car.x, car.z, 1.45);
    if (Math.abs(fixed.x - car.x) < 0.0001 && Math.abs(fixed.z - car.z) < 0.0001) return 0;

    const pushX = fixed.x - car.x;
    const pushZ = fixed.z - car.z;
    const pushLength = Math.hypot(pushX, pushZ) || 1;
    const normalX = pushX / pushLength;
    const normalZ = pushZ / pushLength;
    const impact = Math.hypot(car.vx, car.vz);

    car.x = fixed.x;
    car.z = fixed.z;

    const alongNormal = car.vx * normalX + car.vz * normalZ;
    if (alongNormal < 0) {
      car.vx -= 1.45 * alongNormal * normalX;
      car.vz -= 1.45 * alongNormal * normalZ;
    }
    car.vx *= 0.42;
    car.vz *= 0.42;
    car.speed *= 0.35;

    if (impact > 5.2) {
      const damage = (impact - 4) * 2.1;
      damageCar(car, damage, ctx);
      if (ctx?.cameraCtl) ctx.cameraCtl.shake(Math.min(1.0, damage * 0.02));
      if (ctx?.audio) ctx.audio.impact();
      if (active === car && ctx?.player) ctx.player.damage((impact - 4) * 0.9);
    }

    car.x = Math.max(-246, Math.min(534, car.x));
    car.z = Math.max(-246, Math.min(248, car.z));
    return impact;
  }

  /**
   * The arcade driving model. Throttle accelerates along the nose, steering rotates the nose
   * (with less authority at speed), lateral velocity bleeds off through grip, and braking
   * both slows the car and cuts grip so it can slide.
   */
  function drive(car, dt, controls, ctx) {
    if (car.dead) {
      car.vx *= 1 - 2.4 * dt;
      car.vz *= 1 - 2.4 * dt;
      car.x += car.vx * dt;
      car.z += car.vz * dt;
      animateCar(car, dt, 0);
      return;
    }

    const carSpec = car.spec;
    const throttle = clamp(controls.throttle ?? 0, -1, 1);
    const steer = clamp(controls.steer ?? 0, -1, 1);
    const brake = Boolean(controls.brake);

    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);

    let forwardSpeed = car.vx * forwardX + car.vz * forwardZ;
    let lateralSpeed = car.vx * rightX + car.vz * rightZ;
    const boost = controls.boost ? 1.16 : 1;

    if (throttle > 0) {
      forwardSpeed += carSpec.accel * boost * throttle * dt
        * (1 - Math.max(0, forwardSpeed) / (carSpec.maxSpeed * boost));
    } else if (throttle < 0) {
      if (forwardSpeed > 0.9) {
        forwardSpeed -= carSpec.brake * dt;
      } else {
        forwardSpeed = Math.max(-11, forwardSpeed + carSpec.accel * 0.48 * throttle * dt);
      }
    }

    if (brake) {
      const brakeAmount = carSpec.brake * 1.25 * dt;
      forwardSpeed = forwardSpeed > 0
        ? Math.max(0, forwardSpeed - brakeAmount)
        : Math.min(0, forwardSpeed + brakeAmount);
    }

    const drag = brake ? 1.7 : 0.52;
    forwardSpeed *= Math.max(0, 1 - (drag + Math.abs(forwardSpeed) * 0.011) * dt);

    const grip = brake ? carSpec.grip * 0.2 : carSpec.grip;
    lateralSpeed *= Math.exp(-grip * dt);

    if (Math.abs(forwardSpeed) < 0.06 && Math.abs(throttle) < 0.02) forwardSpeed = 0;

    const speedRatio = clamp(Math.abs(forwardSpeed) / carSpec.maxSpeed, 0, 1);
    const turnRate = steer * carSpec.steer * clamp(Math.abs(forwardSpeed) / 8, 0, 1)
      * Math.sign(forwardSpeed || 1) * (1 - speedRatio * 0.28);
    car.heading = wrapAngle(car.heading + turnRate * dt);
    car.steer = damp(car.steer, steer, 9, dt);
    car.throttle = throttle;
    car.brake = brake ? 1 : 0;

    const newForwardX = Math.sin(car.heading);
    const newForwardZ = Math.cos(car.heading);
    const newRightX = Math.cos(car.heading);
    const newRightZ = -Math.sin(car.heading);

    car.vx = newForwardX * forwardSpeed + newRightX * lateralSpeed;
    car.vz = newForwardZ * forwardSpeed + newRightZ * lateralSpeed;
    car.speed = Math.hypot(car.vx, car.vz);
    car.x += car.vx * dt;
    car.z += car.vz * dt;

    collideCar(car, dt, ctx);

    if (car.driver === 'player' && ctx?.police?.wanted > 0 && car.speed > 20) {
      // Fast reckless driving keeps the heat on.
      ctx.police.heat?.(dt * 0.16);
    }

    animateCar(car, dt, forwardSpeed);
  }

  /** Positions the mesh, spins and steers the wheels, tints the lamps, and applies body roll. */
  function animateCar(car, dt, forwardSpeed) {
    const mesh = car.mesh;
    car.wheelSpin += forwardSpeed * dt / 0.36;
    for (const wheel of mesh.wheels) wheel.rotation.x = car.wheelSpin;
    for (const wheel of mesh.frontWheels) wheel.rotation.y = car.steer * 0.42;

    mesh.group.position.set(car.x, 0.1, car.z);
    mesh.group.rotation.y = car.heading;

    const damage = 1 - car.health / car.maxHealth;
    if (mesh.smoke) {
      mesh.smoke.material.opacity = car.dead
        ? 0.75
        : damage > 0.45
          ? (damage - 0.45) * 0.8
          : 0;
      if (mesh.smoke.material.opacity > 0) {
        mesh.smoke.scale.setScalar(1.2 + damage * 2.2 + Math.sin(performance.now() * 0.004) * 0.2);
      }
    }

    for (const tailMaterial of mesh.taillightMats) {
      tailMaterial.color.setHex(car.brake ? 0xff5a3a : 0x9a1a2a);
    }

    if (mesh.lightbarRed && mesh.lightbarBlue) {
      const phase = Math.sin(performance.now() * 0.012) > 0;
      const sirenOn = car.siren;
      mesh.lightbarRed.color.setHex(sirenOn && phase ? 0xff2444 : 0x3a1020);
      mesh.lightbarBlue.color.setHex(sirenOn && !phase ? 0x2f7dff : 0x10204a);
      if (mesh.lightGlows) {
        mesh.lightGlows.redGlow.material.opacity = sirenOn && phase ? 0.95 : 0.08;
        mesh.lightGlows.blueGlow.material.opacity = sirenOn && !phase ? 0.95 : 0.08;
      }
    }

    // A little body roll, kept subtle.
    mesh.chassis.rotation.z = damp(
      mesh.chassis.rotation.z,
      -car.steer * clamp(car.speed / 30, 0, 1) * 0.055,
      7,
      dt,
    );
    mesh.chassis.rotation.x = damp(
      mesh.chassis.rotation.x,
      car.brake ? 0.025 : -car.throttle * 0.012,
      6,
      dt,
    );
  }

  /** Steps every car this system owns. Player-driven cars are stepped by gameplay instead. */
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
    get active() {
      return active;
    },
    set active(value) {
      active = value;
    },
    mint,
    remove(car) {
      const index = cars.indexOf(car);
      if (index >= 0) cars.splice(index, 1);
      scene.remove(car.group);
    },
  };
}
