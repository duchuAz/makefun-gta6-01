// Civilian life: lane-following cars that turn at intersections, and pedestrians who walk
// the pavements, chat in twos, panic at gunfire and get back up after a knock. Traffic is
// deliberately stealable: detach() hands a car to the vehicle system unchanged.
import * as THREE from 'three';
import { CARS, CITY, PALETTE } from './config.js';
import { TAU, clamp, damp, hash01, pick, rng, wrapAngle } from './math.js';
import { makeCarMesh } from './vehicles.js';

const LANE = 3.35;
const TRAFFIC_COUNT = 20;
const PED_COUNT = 22;

function buildPed(random, { beach = false } = {}) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: pick([0xe85f6a, 0x2fa7a0, 0xf2a541, 0x7b61c9, 0xf0d0e0, 0x4f8cff, 0xf2e6d0], random), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pick([0x2b2f45, 0x3d3a4e, 0x6b5a48, 0xded6c8], random), roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(PALETTE.skin, random), roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: pick([0x241a1a, 0x4a3020, 0x1a1a1a, 0x8a6a3a], random), roughness: 0.95 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.66, 7), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.24, 7), pants);
  hips.position.y = 0.8;
  group.add(hips);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.172, 9, 6, 0, TAU, 0, Math.PI * 0.55), hair);
  hairMesh.position.y = 1.65;
  group.add(hairMesh);
  const armL = new THREE.Group();
  armL.position.set(-0.25, 1.4, 0);
  const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.12), shirt);
  armLMesh.position.y = -0.25;
  armLMesh.castShadow = true;
  armL.add(armLMesh);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), skin);
  handL.position.y = -0.55;
  armL.add(handL);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.25;
  group.add(armR);
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.74, 0);
  const legLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.16), pants);
  legLMesh.position.y = -0.35;
  legLMesh.castShadow = true;
  legL.add(legLMesh);
  group.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.74, 0);
  const legRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.16), pants);
  legRMesh.position.y = -0.35;
  legRMesh.castShadow = true;
  legR.add(legRMesh);
  group.add(legR);
  if (beach) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.9 }));
    hat.position.y = 1.78;
    group.add(hat);
  }
  return { group, armL, armR, legL, legR };
}

export function createTrafficSystem(scene, city) {
  const random = rng(9001);
  const cars = [];
  const peds = [];
  const nodeMin = CITY.roadsFrom;
  const nodeMax = CITY.roadsTo;
  const roadNodes = [];
  for (let i = nodeMin; i <= nodeMax; i++) for (let j = nodeMin; j <= nodeMax; j++) roadNodes.push({ x: i * CITY.grid, z: j * CITY.grid });

  const dirs = [
    { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 },
  ];

  function makeTrafficCar(kind, color, node, dir, progress = 0, options = {}) {
    const mesh = makeCarMesh(kind, color, options);
    scene.add(mesh.group);
    const car = {
      id: `traffic-${cars.length}-${Math.floor(random() * 1e6)}`,
      kind,
      spec: CARS[kind] ?? CARS.sedan,
      mesh,
      group: mesh.group,
      node: { ...node },
      target: { x: node.x + dir.x * CITY.grid, z: node.z + dir.z * CITY.grid },
      dir: { ...dir },
      progress,
      laneX: node.x + dir.z * LANE,
      laneZ: node.z - dir.x * LANE,
      x: node.x,
      z: node.z,
      heading: Math.atan2(dir.x, dir.z),
      speed: 7 + random() * 6,
      targetSpeed: 7 + random() * 6,
      health: 100,
      maxHealth: 100,
      driver: 'traffic',
      parked: false,
      dead: false,
      throttle: 0,
      brake: 0,
      steer: 0,
      wheelSpin: 0,
      vx: 0,
      vz: 0,
      stopped: 0,
      police: false,
      gang: false,
      taxi: kind === 'taxi',
    };
    updateCarTransform(car);
    cars.push(car);
    return car;
  }

  function updateCarTransform(car) {
    const dir = car.dir;
    const rx = dir.z;
    const rz = -dir.x;
    const px = car.node.x + dir.x * car.progress + rx * LANE;
    const pz = car.node.z + dir.z * car.progress + rz * LANE;
    car.x = px;
    car.z = pz;
    car.heading = Math.atan2(dir.x, dir.z);
    car.group.position.set(px, 0.1, pz);
    car.group.rotation.y = car.heading;
    for (const wheel of car.mesh.wheels) wheel.rotation.x = car.wheelSpin;
    for (const wheel of car.mesh.frontWheels) wheel.rotation.y = car.steer * 0.3;
  }

  function chooseNext(car) {
    const options = [];
    options.push({ dir: { ...car.dir }, weight: 0.56 });
    const left = { x: -car.dir.z, z: car.dir.x };
    const right = { x: car.dir.z, z: -car.dir.x };
    options.push({ dir: left, weight: 0.22 });
    options.push({ dir: right, weight: 0.22 });
    let roll = random();
    let chosen = options[0];
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        chosen = option;
        break;
      }
    }
    const node = { ...car.target };
    const target = { x: node.x + chosen.dir.x * CITY.grid, z: node.z + chosen.dir.z * CITY.grid };
    if (target.x < nodeMin * CITY.grid - 40 || target.x > nodeMax * CITY.grid + 40 || target.z < nodeMin * CITY.grid - 40 || target.z > nodeMax * CITY.grid + 40) {
      // Don't drive out of the grid; turn back next time.
      chosen = { dir: { x: -car.dir.x, z: -car.dir.z }, weight: 1 };
      return { node, dir: chosen.dir, target: { x: node.x + chosen.dir.x * CITY.grid, z: node.z + chosen.dir.z * CITY.grid } };
    }
    return { node, dir: chosen.dir, target };
  }

  function spawnTrafficNear(px, pz, minDist = 30, maxDist = 150) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const node = pick(roadNodes, random);
      const dx = node.x - px;
      const dz = node.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < minDist || d > maxDist) continue;
      const dir = pick(dirs, random);
      const kind = pick(['sedan', 'sedan', 'taxi', 'sports', 'muscle', 'van'], random);
      const color = pick([0xe8d8c8, 0xbfe3d0, 0xf2c6b2, 0xc9c0e8, 0xf6e5b8, 0x9fd8d8, 0xe86a5c, 0xf2c541], random);
      return makeTrafficCar(kind, color, node, dir, random() * 20, { taxi: kind === 'taxi' });
    }
    return null;
  }

  function spawnPedNear(px, pz, beachOnly = false) {
    const group = buildPed(random, { beach: beachOnly });
    scene.add(group.group);
    let x;
    let z;
    let target;
    if (beachOnly) {
      x = 212 + random() * 34;
      z = -220 + random() * 440;
      target = { x: x + (random() - 0.5) * 18, z: z + (random() - 0.5) * 18 };
    } else {
      let block = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        const candidate = pick(city.blocks, random);
        const d = Math.hypot(candidate.x - px, candidate.z - pz);
        if (d > 12 && d < 140) {
          block = candidate;
          break;
        }
      }
      if (!block) block = pick(city.blocks, random);
      const half = block.size / 2 + 1.9;
      const side = Math.floor(random() * 4);
      const t = (random() * 2 - 1) * half;
      if (side === 0) { x = block.x + t; z = block.z - half; }
      else if (side === 1) { x = block.x + half; z = block.z + t; }
      else if (side === 2) { x = block.x + t; z = block.z + half; }
      else { x = block.x - half; z = block.z + t; }
      target = { x, z };
    }
    const ped = {
      group: group.group,
      parts: group,
      x, z, y: 0.12,
      tx: target.x, tz: target.z,
      heading: random() * TAU,
      speed: 1.1 + random() * 0.5,
      baseSpeed: 1.1 + random() * 0.5,
      phase: random() * TAU,
      health: 32,
      alive: true,
      downTimer: 0,
      scared: 0,
      beach: beachOnly,
      block: beachOnly ? null : pick(city.blocks, random),
      skin: pick(PALETTE.skin, random),
      id: `ped-${peds.length}`,
    };
    group.group.position.set(x, ped.y, z);
    peds.push(ped);
    return ped;
  }

  // Seed the streets.
  for (let i = 0; i < TRAFFIC_COUNT; i++) spawnTrafficNear(-18, 26, 14, 190);
  for (let i = 0; i < PED_COUNT; i++) spawnPedNear(-18, 26, false);
  for (let i = 0; i < 8; i++) spawnPedNear(230, 0, true);

  function alarm(x, z, radius = 30) {
    for (const ped of peds) {
      if (!ped.alive) continue;
      if ((ped.x - x) ** 2 + (ped.z - z) ** 2 < radius * radius) {
        ped.scared = 7 + random() * 4;
        ped.tx = ped.x + (ped.x - x) * 2 + (random() - 0.5) * 12;
        ped.tz = ped.z + (ped.z - z) * 2 + (random() - 0.5) * 12;
      }
    }
  }

  function hitPed(ped, damage, fromX, fromZ, force = 1) {
    if (!ped.alive) return false;
    ped.health -= damage;
    ped.scared = 9;
    if (ped.health <= 0) {
      ped.alive = false;
      ped.downTimer = 14;
      ped.group.rotation.z = Math.PI / 2;
      ped.group.rotation.x = (random() - 0.5) * 0.4;
      ped.group.position.y = 0.3;
      return true;
    }
    const dx = ped.x - fromX;
    const dz = ped.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    ped.x += (dx / len) * 0.8 * force;
    ped.z += (dz / len) * 0.8 * force;
    return false;
  }

  function removeCar(car) {
    const index = cars.indexOf(car);
    if (index >= 0) cars.splice(index, 1);
  }

  function detach(car) {
    removeCar(car);
    car.driver = null;
    car.parked = false;
    return car;
  }

  function nearestCar(x, z, maxDistance = 4.4) {
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

  function update(dt, { player, activeCar, wanted = 0, onCarCollision } = {}) {
    const px = player?.state.x ?? 0;
    const pz = player?.state.z ?? 0;
    for (const car of cars) {
      if (car.dead) {
        car.vx *= 1 - 2 * dt;
        car.vz *= 1 - 2 * dt;
        car.x += car.vx * dt;
        car.z += car.vz * dt;
        car.group.position.set(car.x, 0.1, car.z);
        continue;
      }
      if (car.driver !== 'traffic') continue;
      // Look ahead for the player or another car in the lane.
      let targetSpeed = car.targetSpeed;
      const fwdX = Math.sin(car.heading);
      const fwdZ = Math.cos(car.heading);
      if (player && !player.state.inCar) {
        const dx = px - car.x;
        const dz = pz - car.z;
        const ahead = dx * fwdX + dz * fwdZ;
        const side = Math.abs(dx * fwdZ - dz * fwdX);
        if (ahead > 1 && ahead < 13 && side < 2.6) targetSpeed = 0;
      }
      for (const other of cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const ahead = dx * fwdX + dz * fwdZ;
        const side = Math.abs(dx * fwdZ - dz * fwdX);
        if (ahead > 1 && ahead < 11 && side < 2.4) {
          targetSpeed = Math.min(targetSpeed, Math.max(0, (ahead - 4) * 1.6));
        }
      }
      if (wanted > 0 && Math.hypot(px - car.x, pz - car.z) < 30) targetSpeed *= 0.6;
      car.targetSpeed = 7 + (car.targetSpeed - 7) * 0.999;
      car.speed = damp(car.speed, targetSpeed, targetSpeed < car.speed ? 5 : 1.6, dt);
      car.progress += car.speed * dt;
      car.wheelSpin += car.speed * dt / 0.36;
      if (car.progress >= CITY.grid) {
        const extra = car.progress - CITY.grid;
        const next = chooseNext(car);
        car.node = next.node;
        car.dir = next.dir;
        car.target = next.target;
        car.progress = extra;
      }
      updateCarTransform(car);
      // Traffic nudges the player's car rather than passing through it.
      if (activeCar && activeCar.driver === 'player') {
        const dx = activeCar.x - car.x;
        const dz = activeCar.z - car.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 2.7 * 2.7) {
          const d = Math.sqrt(d2) || 1;
          const nx = dx / d;
          const nz = dz / d;
          const push = (2.7 - d) * 0.5;
          activeCar.x += nx * push;
          activeCar.z += nz * push;
          car.x -= nx * push;
          car.z -= nz * push;
          onCarCollision?.(car, Math.hypot(activeCar.vx, activeCar.vz));
        }
      }
    }
    // Keep the population around the player.
    if (Math.random() < dt * 0.6 && cars.length < TRAFFIC_COUNT) spawnTrafficNear(px, pz, 70, 180);
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      if (Math.hypot(car.x - px, car.z - pz) > 290) {
        scene.remove(car.group);
        cars.splice(i, 1);
      }
    }
    if (cars.length < TRAFFIC_COUNT - 3) spawnTrafficNear(px, pz, 60, 160);

    // Pedestrians.
    for (const ped of peds) {
      if (!ped.alive) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.alive = true;
          ped.health = 32;
          ped.group.rotation.z = 0;
          ped.group.rotation.x = 0;
          ped.group.position.y = 0.12;
          ped.scared = 4;
        }
        continue;
      }
      ped.scared = Math.max(0, ped.scared - dt);
      const targetSpeed = ped.scared > 0 ? 5.3 : ped.baseSpeed;
      ped.speed = damp(ped.speed, targetSpeed, 5, dt);
      let dx = ped.tx - ped.x;
      let dz = ped.tz - ped.z;
      let d = Math.hypot(dx, dz);
      if (d < 0.8) {
        if (ped.beach) {
          ped.tx = 210 + random() * 38;
          ped.tz = -220 + random() * 440;
        } else if (ped.block) {
          const half = ped.block.size / 2 + 1.9;
          const side = Math.floor(random() * 4);
          const t = (random() * 2 - 1) * half;
          if (side === 0) { ped.tx = ped.block.x + t; ped.tz = ped.block.z - half; }
          else if (side === 1) { ped.tx = ped.block.x + half; ped.tz = ped.block.z + t; }
          else if (side === 2) { ped.tx = ped.block.x + t; ped.tz = ped.block.z + half; }
          else { ped.tx = ped.block.x - half; ped.tz = ped.block.z + t; }
        }
        dx = ped.tx - ped.x;
        dz = ped.tz - ped.z;
        d = Math.hypot(dx, dz) || 1;
      }
      if (ped.scared > 0 && !ped.beach) {
        dx = ped.x - px;
        dz = ped.z - pz;
        d = Math.hypot(dx, dz) || 1;
        ped.tx = ped.x + (dx / d) * 6;
        ped.tz = ped.z + (dz / d) * 6;
        dx = ped.tx - ped.x;
        dz = ped.tz - ped.z;
        d = Math.hypot(dx, dz) || 1;
      }
      const vx = (dx / d) * ped.speed;
      const vz = (dz / d) * ped.speed;
      ped.x += vx * dt;
      ped.z += vz * dt;
      if (!ped.beach) {
        const fixed = city.resolveCircle(ped.x, ped.z, 0.34);
        ped.x = fixed.x;
        ped.z = fixed.z;
      } else {
        ped.x = clamp(ped.x, 208, 252);
        ped.z = clamp(ped.z, -246, 246);
      }
      ped.heading = damp(wrapAngle(ped.heading), wrapAngle(Math.atan2(vx, vz)), 8, dt);
      ped.phase += dt * (2.5 + ped.speed * 2.2);
      const swing = Math.sin(ped.phase) * 0.5 * clamp(ped.speed / 2, 0.3, 1.4);
      ped.parts.legL.rotation.x = swing;
      ped.parts.legR.rotation.x = -swing;
      ped.parts.armL.rotation.x = -swing * 0.8;
      if (ped.scared > 0) {
        ped.parts.armR.rotation.x = -2.4 + Math.sin(ped.phase * 2) * 0.3;
      } else {
        ped.parts.armR.rotation.x = swing * 0.8;
      }
      ped.group.position.set(ped.x, ped.y + Math.abs(Math.sin(ped.phase)) * 0.025, ped.z);
      ped.group.rotation.y = ped.heading;
    }
    for (let i = peds.length - 1; i >= 0; i--) {
      const ped = peds[i];
      if (Math.hypot(ped.x - px, ped.z - pz) > 300) {
        scene.remove(ped.group);
        peds.splice(i, 1);
      }
    }
    if (peds.length < PED_COUNT - 4) spawnPedNear(px, pz, false);
  }

  return {
    cars,
    peds,
    update,
    alarm,
    hitPed,
    removeCar,
    detach,
    nearestCar,
    spawnPedNear,
    spawnTrafficNear,
    addCarAt(kind, color, x, z, heading, speed = 9, options = {}) {
      const car = makeTrafficCar(kind, color, { x: 0, z: 0 }, { x: 0, z: 1 }, 0, options);
      car.x = x;
      car.z = z;
      car.heading = heading;
      car.group.position.set(x, 0.1, z);
      car.group.rotation.y = heading;
      car.dir = { x: Math.sin(heading), z: Math.cos(heading) };
      car.node = { x, z };
      car.target = { x: x + car.dir.x * CITY.grid, z: z + car.dir.z * CITY.grid };
      car.speed = speed;
      car.targetSpeed = speed;
      car.progress = 0;
      updateCarTransform(car);
      return car;
    },
  };
}
