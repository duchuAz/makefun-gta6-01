// The four screenshot scenes. Each one stages real game objects — the same city, cars,
// people and HUD the player sees — sets a camera and a mood, and lets the normal renderer
// paint it. Nothing is composited afterwards.
import * as THREE from 'three';
import { SPOTS } from './city.js';
import { RADIO } from './config.js';

const idleInput = {
  forward: () => false,
  back: () => false,
  left: () => false,
  right: () => false,
  sprint: () => false,
  jump: () => false,
  aim: () => false,
};

function posePlayer(ctx, x, z, heading, { aiming = false, weapon = 'pistol' } = {}) {
  const player = ctx.player;
  player.reset(x, z, heading);
  player.state.y = 0.1;
  player.setWeapon(weapon);
  player.state.aiming = aiming;
  const input = { ...idleInput, aim: () => aiming };
  player.syncWeapon();
  player.update(1 / 60, { input, city: ctx.city, cameraYaw: heading });
  player.group.visible = true;
  player.group.position.set(x, 0.1, z);
  player.group.rotation.y = heading;
  return player;
}

function stageCar(ctx, kind, color, x, z, heading, speed = 0, options = {}) {
  const car = ctx.vehicles.spawn(kind, color, x, z, heading, { parked: true, ...options });
  car.driver = options.driver ?? null;
  car.speed = speed;
  car.vx = Math.sin(heading) * speed;
  car.vz = Math.cos(heading) * speed;
  car.brake = 0;
  car.throttle = 1;
  for (let i = 0; i < 8; i++) ctx.vehicles.animateCar(car, 1 / 60, speed);
  return car;
}

function stageCruiser(ctx, x, z, heading, speed = 20) {
  const car = ctx.police.spawnCruiser({ state: { x, z } });
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = speed;
  car.vx = Math.sin(heading) * speed;
  car.vz = Math.cos(heading) * speed;
  car.siren = true;
  car.mesh.group.position.set(x, 0.1, z);
  car.mesh.group.rotation.y = heading;
  for (let i = 0; i < 8; i++) ctx.vehicles.animateCar(car, 1 / 60, speed);
  return car;
}

function stageTraffic(ctx, kind, color, x, z, heading, speed) {
  const car = ctx.traffic.addCarAt(kind, color, x, z, heading, speed);
  for (let i = 0; i < 4; i++) {
    car.wheelSpin += speed / 60 / 0.36;
    car.group.position.set(x, 0.1, z);
    car.group.rotation.y = heading;
    for (const wheel of car.mesh.wheels) wheel.rotation.x = car.wheelSpin;
  }
  return car;
}

function stagePed(ctx, x, z, heading, scared = false, index = 0) {
  let ped = ctx.traffic.peds[index];
  if (!ped) {
    ped = ctx.traffic.spawnPedNear(x, z, false);
  }
  ped.x = x;
  ped.z = z;
  ped.tx = x;
  ped.tz = z;
  ped.heading = heading;
  ped.group.position.set(x, 0.12, z);
  ped.group.rotation.y = heading;
  ped.scared = scared ? 6 : 0;
  if (ped.parts) {
    ped.parts.armL.rotation.x = scared ? -2.2 : 0.15;
    ped.parts.armR.rotation.x = scared ? -2.4 : -0.1;
    ped.parts.legL.rotation.x = scared ? 0.45 : 0.08;
    ped.parts.legR.rotation.x = scared ? -0.45 : -0.08;
  }
  return ped;
}

function stageBoat(ctx, x, z, heading = Math.PI / 2) {
  // The marina already has boats; add one more in the shot's water for depth.
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 7.5), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.45 }));
  hull.position.y = 0.7;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.2, 7.5), new THREE.MeshStandardMaterial({ color: 0xff6b8a, roughness: 0.5 }));
  stripe.position.y = 1.05;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.8), new THREE.MeshStandardMaterial({ color: 0xcfe4e8, roughness: 0.25, metalness: 0.2 }));
  cabin.position.set(0, 1.7, -0.8);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 5), new THREE.MeshStandardMaterial({ color: 0xd8d0c0 }));
  mast.position.set(0, 4.4, -1);
  group.add(hull, stripe, cabin, mast);
  group.position.set(x, -0.15, z);
  group.rotation.y = heading;
  ctx.world.scene.add(group);
  return group;
}

function stagePalm(ctx, x, z, scale = 1) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * scale, 0.32 * scale, 6.4 * scale, 7), new THREE.MeshStandardMaterial({ color: 0x8b6a4d, roughness: 0.95 }));
  trunk.position.y = 3.2 * scale;
  trunk.castShadow = true;
  group.add(trunk);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0.1 + (k % 3) * 0.06, Math.sin(a)).normalize();
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.6 * scale, 3.7 * scale, 4), new THREE.MeshStandardMaterial({ color: 0x3e7d58, roughness: 0.9, side: THREE.DoubleSide }));
    frond.geometry.translate(0, 1.85 * scale, 0);
    frond.quaternion.setFromUnitVectors(up, dir);
    frond.position.y = 6.4 * scale;
    frond.scale.set(1, 1, 0.5);
    frond.castShadow = true;
    group.add(frond);
  }
  group.position.set(x, 0.1, z);
  ctx.world.scene.add(group);
  return group;
}

function mapState(ctx) {
  const player = ctx.player;
  const cops = [];
  for (const car of ctx.police.cruisers) cops.push({ x: car.x, z: car.z });
  for (const actor of ctx.police.actors) if (actor.kind === 'cop' && actor.alive) cops.push({ x: actor.x, z: actor.z });
  return {
    x: player.state.x,
    z: player.state.z,
    heading: player.state.inCar ? player.state.inCar.heading : player.state.heading,
    inCar: Boolean(player.state.inCar),
    traffic: ctx.traffic.cars,
    peds: ctx.traffic.peds,
    cops,
    mission: ctx.missions.minimapTarget(),
  };
}

function setRadio(ctx, index) {
  const station = RADIO[index] ?? RADIO[0];
  ctx.hud.setRadio(station.name, station.genre);
  ctx.audio.setStation(index);
}

function cameraAt(ctx, pos, look, fov = 54) {
  ctx.cameraCtl.setOverride(new THREE.Vector3(...pos), new THREE.Vector3(...look), fov);
}

function clearDynamic(ctx) {
  for (const car of ctx.traffic.cars) ctx.world.scene.remove(car.group);
  ctx.traffic.cars.length = 0;
  for (const car of ctx.police.cruisers) ctx.world.scene.remove(car.group);
  ctx.police.cruisers.length = 0;
  for (const actor of ctx.police.actors) ctx.world.scene.remove(actor.group);
  ctx.police.actors.length = 0;
  for (const ped of ctx.traffic.peds) ctx.world.scene.remove(ped.group);
  ctx.traffic.peds.length = 0;
}

export function stageShot(name, ctx) {
  clearDynamic(ctx);
  ctx.hud.show();
  ctx.hud.hideBusted();
  ctx.hud.hideWasted();
  ctx.hud.hideMissionComplete();
  ctx.hud.el.subtitle.classList.add('hidden');
  ctx.player.group.visible = false;
  ctx.world.setMood('golden', ctx.city);

  if (name === 'cover') {
    ctx.world.setMood('golden', ctx.city);
    posePlayer(ctx, -17.5, -87.5, 0.75, { aiming: false, weapon: 'pistol' });
    const mint = stageCar(ctx, 'sports', 0x7de8c8, -24.5, -90.5, 1.52, 0, { parked: true });
    mint.label = 'MINT SOLAR GT';
    stageTraffic(ctx, 'taxi', 0xf2c541, -70, -90, Math.PI / 2, 8);
    stageTraffic(ctx, 'sedan', 0xe8d8c8, 22, -101, -Math.PI / 2, 7);
    stageTraffic(ctx, 'muscle', 0x7b61c9, 15, -91, -Math.PI / 2, 9);
    stagePed(ctx, -3, -91, -1.3, false, 0);
    stagePed(ctx, -34, -84, 2.6, false, 1);
    stagePed(ctx, -40, -93, 0.7, false, 2);
    stagePalm(ctx, -43, -78, 1.15);
    stagePalm(ctx, -4, -108, 1.0);
    cameraAt(ctx, [-9.5, 1.9, -79.5], [-25, 7.2, -96], 58);
    ctx.hud.setHealth(100, 62);
    ctx.hud.setCash(1280);
    ctx.hud.setWanted(0, 0);
    ctx.hud.setWeapon('pistol', 12, 60);
    ctx.hud.setMission(null);
    ctx.hud.setPrompt(null);
    ctx.hud.setSpeed(0, 'P', false);
    ctx.hud.setClock(18 * 3600 + 41 * 60);
    ctx.hud.setDistrict('NEON STRIP');
    setRadio(ctx, 0);

  } else if (name === 'chase') {
    ctx.world.setMood('chase', ctx.city);
    const playerCar = stageCar(ctx, 'sports', 0xe86a5c, -3.2, 58, Math.PI, 27);
    playerCar.driver = 'player';
    ctx.vehicles.active = playerCar;
    ctx.player.state.inCar = playerCar;
    ctx.player.state.x = playerCar.x;
    ctx.player.state.z = playerCar.z;
    ctx.player.state.heading = playerCar.heading;
    ctx.player.group.visible = false;
    ctx.player.syncWeapon();
    const c1 = stageCruiser(ctx, -7.5, 68, Math.PI, 27);
    const c2 = stageCruiser(ctx, 4.2, 73, Math.PI, 27);
    const c3 = stageCruiser(ctx, -2.4, 81, Math.PI, 27);
    stageTraffic(ctx, 'sedan', 0xf6e5b8, 3.6, 92, Math.PI, 16);
    stageTraffic(ctx, 'van', 0xbfe3d0, -3.4, 108, Math.PI, 16);
    stageTraffic(ctx, 'taxi', 0xf2c541, 3.6, 18, 0, 12);
    stageTraffic(ctx, 'muscle', 0x7b61c9, -3.5, 8, 0, 12);
    stagePed(ctx, 12, 64, 0.4, true, 0);
    stagePed(ctx, 15, 50, 2.8, true, 1);
    stagePed(ctx, -13, 46, -0.6, false, 2);
    stagePalm(ctx, 16, 42, 1.1);
    stagePalm(ctx, -18, 34, 1.0);
    ctx.combat.muzzle(c1.x - 0.7, 1.1, c1.z + 0.5, 0xffd27a);
    ctx.combat.tracer(c1.x - 0.7, 1.1, c1.z + 0.4, playerCar.x - 0.5, 1.1, playerCar.z - 1.0, 0xffc27a);
    ctx.combat.muzzle(c2.x + 0.7, 1.1, c2.z + 0.5, 0xffd27a);
    ctx.combat.tracer(c2.x + 0.7, 1.1, c2.z + 0.4, playerCar.x + 0.7, 1.1, playerCar.z - 1.0, 0xffc27a);
    cameraAt(ctx, [10, 3.7, 43], [-1, 1.3, 68], 48);
    ctx.hud.setHealth(86, 24);
    ctx.hud.setCash(2140);
    ctx.hud.setWanted(3, 0.35);
    ctx.hud.setWeapon('pistol', 9, 36);
    ctx.hud.setMission(null);
    ctx.hud.setPrompt(null);
    ctx.hud.setSpeed(96, 'D', true);
    ctx.hud.setClock(19 * 3600 + 12 * 60);
    ctx.hud.setDistrict('DOWNTOWN');
    setRadio(ctx, 1);
    ctx.hud.toast('PVPD PURSUIT', 'wanted', 60);
  } else if (name === 'mission') {
    ctx.world.setMood('mission', ctx.city);
    ctx.missions.stage(0, 1);
    posePlayer(ctx, -25, -79, 2.3, { aiming: true, weapon: 'pistol' });
    stageTraffic(ctx, 'sedan', 0x9fd8d8, -62, -91, Math.PI / 2, 8);
    stageTraffic(ctx, 'sports', 0xe86a5c, 18, -101, -Math.PI / 2, 9);
    stagePed(ctx, -31, -87, 1.1, true, 0);
    stagePed(ctx, -13, -76, -0.8, false, 1);
    stagePed(ctx, -35, -68, 0.2, false, 2);
    stagePalm(ctx, -42, -90, 1.15);
    stagePalm(ctx, -5, -90, 1.0);
    cameraAt(ctx, [-36, 3.2, -75], [-21, 2.4, -92], 56);
    ctx.hud.setHealth(82, 40);
    ctx.hud.setCash(860);
    ctx.hud.setWanted(0, 0);
    ctx.hud.setWeapon('pistol', 7, 36);
    ctx.hud.setMission(1, 'FIRST DELIVERY', 'Deliver the package to Neon Alley', 250);
    ctx.hud.setObjective('Deliver the package to Neon Alley');
    ctx.hud.dialogue('LUNA', 'The drop is at Neon Alley. Keep your head down and the package dry.', 10);
    ctx.hud.setPrompt(null);
    ctx.hud.setSpeed(0, 'P', false);
    ctx.hud.setClock(18 * 3600 + 56 * 60);
    ctx.hud.setDistrict('NEON STRIP');
    setRadio(ctx, 2);

  } else if (name === 'drive') {
    ctx.world.setMood('drive', ctx.city);
    const playerCar = stageCar(ctx, 'muscle', 0xe86a5c, 330, 0, Math.PI / 2, 32);
    playerCar.driver = 'player';
    ctx.vehicles.active = playerCar;
    ctx.player.state.inCar = playerCar;
    ctx.player.state.x = playerCar.x;
    ctx.player.state.z = playerCar.z;
    ctx.player.state.heading = playerCar.heading;
    ctx.player.group.visible = false;
    ctx.player.syncWeapon();
    stageTraffic(ctx, 'sports', 0xf2c6b2, 376, -3.4, Math.PI / 2, 30);
    stageTraffic(ctx, 'van', 0xbfe3d0, 286, 4.0, -Math.PI / 2, 20);
    stageTraffic(ctx, 'taxi', 0xf2c541, 430, 4.0, -Math.PI / 2, 18);
    stageBoat(ctx, 420, 44, Math.PI / 2);
    stageBoat(ctx, 470, -38, Math.PI / 2);
    cameraAt(ctx, [318, 3.9, 7.2], [346, 1.3, 0], 56);
    ctx.hud.setHealth(100, 78);
    ctx.hud.setCash(3480);
    ctx.hud.setWanted(1, 0.2);
    ctx.hud.setWeapon('smg', 24, 120);
    ctx.hud.setMission(null);
    ctx.hud.setPrompt(null);
    ctx.hud.setSpeed(112, 'D', true);
    ctx.hud.setClock(20 * 3600 + 4 * 60);
    ctx.hud.setDistrict('PUENTE VISTA');
    setRadio(ctx, 2);
    ctx.hud.toast('CAUSEWAY · SUNSET RUN', 'mission', 60);
  }
  ctx.minimap.draw(mapState(ctx));
  ctx.hud.setCrosshair(name === 'mission');
  ctx.hud.setStats({ missions: ctx.missions.index, wanted: ctx.police.wanted });
  ctx.hud.update(0);
  return mapState(ctx);
}

export { mapState };
// recorded-session note: the four staged screenshot scenes are unchanged

