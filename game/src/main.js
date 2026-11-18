// PALMA VISTA boots here: build the city once, wire the systems together, then run one
// fixed-step loop. The same build serves the title screen, free roam, the four screenshot
// scenes and a headless smoke test that drives the real systems.
import * as THREE from 'three';
import { GAME_TITLE, PLAYER, RADIO, SPAWN, TIME, WEAPONS } from './config.js';
import { clamp, dist, money } from './math.js';
import { createWorld } from './world.js';
import { buildCity, SPOTS } from './city.js';
import { createPlayer } from './player.js';
import { createVehicleSystem } from './vehicles.js';
import { createTrafficSystem } from './traffic.js';
import { createPoliceSystem } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createCameraController } from './camera.js';
import { createHUD } from './hud.js';
import { createMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { loadSettings, saveSettings, hasSave, loadGame, writeGame, eraseGame } from './save.js';
import { stageShot, mapState } from './shots.js';

window.__errors = [];
function recordError(message, source = '') {
  const text = String(message);
  window.__errors.push(`${source ? `${source}: ` : ''}${text}`);
  if (window.__errors.length > 30) window.__errors.shift();
}
window.addEventListener('error', (event) => recordError(event.message, 'error'));
window.addEventListener('unhandledrejection', (event) => recordError(event.reason?.message ?? event.reason, 'rejection'));
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  recordError(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '), 'console');
  originalConsoleError(...args);
};

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const smokeMode = params.get('smoke') === '1';
const canvas = document.getElementById('game');
const el = {
  loading: document.getElementById('loading-screen'),
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  settings: document.getElementById('settings-screen'),
  controls: document.getElementById('controls-screen'),
  bigMap: document.getElementById('big-map'),
  mapCanvas: document.getElementById('map-canvas'),
  btnContinue: document.getElementById('btn-continue'),
  optAudio: document.getElementById('opt-audio'),
  optMusic: document.getElementById('opt-music'),
  optHints: document.getElementById('opt-hints'),
  optSens: document.getElementById('opt-sens'),
};

const world = createWorld(canvas);
const city = buildCity(world.scene);
const player = createPlayer(world.scene);
const vehicles = createVehicleSystem(world.scene, city);
const traffic = createTrafficSystem(world.scene, city);
const police = createPoliceSystem(world.scene, city, vehicles);
const combat = createCombat(world.scene, city);
const missions = createMissions(world.scene, city);
const cameraCtl = createCameraController(world.camera, city);
const hud = createHUD();
const minimap = createMinimap(document.getElementById('minimap'), city);
const audio = createAudio();
const settings = loadSettings();

const stats = { missions: 0, arrests: 0, distance: 0, takedowns: 0 };
let mode = shotName ? 'shot' : smokeMode ? 'smoke' : 'title';
let mapOpen = false;
let deathState = null;
let titleTime = 0;
let gameTime = 18 * 3600 + 42 * 60;
let lastMissionIndex = 0;
let autosaveTimer = 0;
let settingsReturn = 'title';
let input = null;
let started = false;
let shotFrames = 0;
let shotMapState = null;
let smoke = null;
let lastFrame = performance.now();
let accumulator = 0;
let hudRefreshAccumulator = 0;
let engineState = false;
let frameCount = 0;

const ctx = {
  world, city, player, vehicles, traffic, police, combat, missions, cameraCtl, hud, minimap, audio, stats, settings,
  camera: world.camera,
  playerCar: null,
  onBusted: () => handleDeath('busted'),
};

function areaName(x, z) {
  if (x > 260) return 'PUENTE VISTA';
  if (x > 198) return 'COSTA DORADA';
  if (z > 205) return 'MARINA VISTA';
  if (z < -135) return 'VISTA HILLS';
  if (Math.abs(x) < 108 && Math.abs(z) < 108) return 'DOWNTOWN';
  if (z < -68) return 'NEON STRIP';
  if (x > 108) return 'COSTA DORADA';
  return 'PALMA VISTA';
}

function resetWeapons() {
  player.state.weapons.pistol = { ammo: WEAPONS.pistol.ammo, reserve: WEAPONS.pistol.reserve };
  player.state.weapons.smg = { ammo: WEAPONS.smg.ammo, reserve: WEAPONS.smg.reserve };
  player.setWeapon(PLAYER.startWeapon);
}

function applySettings() {
  audio.setEnabled(settings.audio);
  audio.setRadio(settings.music);
  audio.setStation(settings.radio);
  if (input) input.sensitivity = settings.sensitivity;
  el.optAudio.classList.toggle('on', Boolean(settings.audio));
  el.optMusic.classList.toggle('on', Boolean(settings.music));
  el.optHints.classList.toggle('on', Boolean(settings.showHints));
  el.optSens.value = String(settings.sensitivity);
  hud.el.hint.style.display = settings.showHints ? '' : 'none';
  saveSettings(settings);
}

function refreshContinue() {
  const saved = hasSave();
  el.btnContinue.disabled = !saved;
  el.btnContinue.style.opacity = saved ? '1' : '0.45';
  el.btnContinue.textContent = saved ? 'CONTINUE' : 'NO SAVE YET';
}

function showScreen(name) {
  for (const key of ['title', 'pause', 'settings', 'controls']) {
    el[key].classList.toggle('hidden', key !== name);
  }
  if (!name) {
    el.title.classList.add('hidden');
    el.pause.classList.add('hidden');
    el.settings.classList.add('hidden');
    el.controls.classList.add('hidden');
  }
}

function startGame({ fromSave = false, lock = true, silent = false } = {}) {
  const data = fromSave ? loadGame() : null;
  if (fromSave && !data) {
    hud.toast('NO SAVE FOUND', 'warn');
    return false;
  }
  if (!fromSave) {
    eraseGame();
    player.reset(SPAWN.x, SPAWN.z, SPAWN.heading);
    resetWeapons();
    player.state.cash = PLAYER.startCash;
    player.state.health = PLAYER.maxHealth;
    player.state.armor = 0;
    missions.setIndex(0);
    lastMissionIndex = 0;
    gameTime = 18 * 3600 + 42 * 60;
    stats.missions = 0;
    stats.takedowns = 0;
    stats.arrests = 0;
    stats.distance = 0;
  } else {
    player.reset(data.player?.x ?? SPAWN.x, data.player?.z ?? SPAWN.z, data.player?.heading ?? SPAWN.heading);
    player.state.y = data.player?.y ?? 0.1;
    player.state.health = data.player?.health ?? PLAYER.maxHealth;
    player.state.armor = data.player?.armor ?? 0;
    player.state.cash = data.cash ?? PLAYER.startCash;
    resetWeapons();
    if (data.weapons) {
      for (const name of ['pistol', 'smg']) {
        const pocket = data.weapons[name];
        if (pocket && Number.isFinite(pocket.ammo) && Number.isFinite(pocket.reserve)) {
          player.state.weapons[name] = { ammo: clamp(pocket.ammo, 0, 999), reserve: clamp(pocket.reserve, 0, 999) };
        }
      }
      if (['fists', 'pistol', 'smg'].includes(data.weapons.current)) player.setWeapon(data.weapons.current);
    }
    missions.setIndex(data.missionIndex ?? 0);
    lastMissionIndex = missions.index;
    stats.missions = data.stats?.missions ?? 0;
    stats.takedowns = data.stats?.takedowns ?? 0;
    stats.arrests = data.stats?.arrests ?? 0;
    stats.distance = data.stats?.distance ?? 0;
    if (data.settings) Object.assign(settings, data.settings);
    applySettings();
  }
  police.setWanted(0);
  police.clearPolice();
  combat.clear();
  player.state.alive = true;
  player.state.inCar = null;
  vehicles.active = null;
  player.syncWeapon();
  player.group.visible = true;
  cameraCtl.reset();
  cameraCtl.setYaw(SPAWN.heading + 0.2);
  mode = 'play';
  mapOpen = false;
  deathState = null;
  el.bigMap.classList.add('hidden');
  showScreen(null);
  hud.show();
  hud.hideBusted();
  hud.hideWasted();
  hud.hideMissionComplete();
  hud.setPrompt(null);
  hud.setStats({ missions: missions.index, wanted: 0 });
  audio.ensure();
  audio.setAmbient(true);
  audio.setSiren(false);
  audio.setSkid(false);
  applySettings();
  refreshContinue();
  if (!silent) {
    hud.toast(fromSave ? 'SAVE LOADED' : 'WELCOME TO PALMA VISTA', 'mission');
    hud.dialogue('LUNA', fromSave ? 'Back on the street. The city did not wait for you.' : 'Rico. Wake up. There is a package at the marina and a clock already running.', 5);
    if (lock) input?.lock();
  }
  started = true;
  return true;
}

function saveProgress(silent = false) {
  const ok = writeGame({
    cash: player.state.cash,
    missionIndex: missions.index,
    missionStep: missions.stepIndex,
    missionActive: Boolean(missions.active),
    player: {
      x: player.state.x, y: player.state.y, z: player.state.z,
      heading: player.state.heading, health: player.state.health, armor: player.state.armor,
    },
    weapons: {
      current: player.state.weapon,
      pistol: { ...player.state.weapons.pistol },
      smg: { ...player.state.weapons.smg },
    },
    stats,
    settings,
  });
  if (ok && !silent) hud.toast('GAME SAVED', 'good');
  if (!ok && !silent) hud.toast('SAVE UNAVAILABLE IN THIS BROWSER', 'warn');
  refreshContinue();
  return ok;
}

function showTitle() {
  mode = 'title';
  started = false;
  mapOpen = false;
  deathState = null;
  player.state.inCar = null;
  vehicles.active = null;
  player.syncWeapon();
  player.group.visible = false;
  cameraCtl.reset();
  hud.hide();
  hud.setPrompt(null);
  hud.hideBusted();
  hud.hideWasted();
  hud.hideMissionComplete();
  el.bigMap.classList.add('hidden');
  showScreen('title');
  refreshContinue();
  audio.setEngine(false);
  audio.setSkid(false);
  audio.setSiren(false);
  audio.setAmbient(false);
  input?.unlock();
}

function pauseGame() {
  if (mode !== 'play' || mapOpen || deathState) return;
  mode = 'pause';
  showScreen('pause');
  hud.show();
  hud.setPrompt(null);
  document.getElementById('stat-cash').textContent = money(player.state.cash);
  document.getElementById('stat-missions').textContent = `${missions.index} / 5`;
  document.getElementById('stat-wanted').textContent = String(police.wanted);
  input?.unlock();
  audio.setEngine(false);
  audio.setSkid(false);
  audio.setSiren(false);
}

function resumeGame() {
  if (mode !== 'pause' && mode !== 'settings') return;
  mode = 'play';
  showScreen(null);
  hud.show();
  input?.lock();
  audio.setAmbient(true);
}

function openSettings(from) {
  settingsReturn = from;
  mode = 'settings';
  showScreen('settings');
  audio.setEngine(false);
  audio.setSiren(false);
  input?.unlock();
}

function closeSettings() {
  saveSettings(settings);
  if (settingsReturn === 'pause') {
    mode = 'pause';
    showScreen('pause');
  } else {
    showTitle();
  }
}

function openControls(from) {
  settingsReturn = from;
  mode = 'controls';
  showScreen('controls');
  input?.unlock();
}

function closeControls() {
  if (settingsReturn === 'pause') {
    mode = 'pause';
    showScreen('pause');
  } else {
    showTitle();
  }
}

function toggleMap() {
  if (mode !== 'play' && !mapOpen) return;
  mapOpen = !mapOpen;
  el.bigMap.classList.toggle('hidden', !mapOpen);
  if (mapOpen) {
    input?.unlock();
    audio.setEngine(false);
    audio.setSkid(false);
    minimap.drawFull(el.mapCanvas, mapState(ctx));
  } else {
    input?.lock();
  }
}

function enterNearestCar() {
  let best = vehicles.nearest(player.state.x, player.state.z, 4.6);
  let bestD = best ? dist(player.state.x, player.state.z, best.x, best.z) : Infinity;
  const trafficCar = traffic.nearestCar(player.state.x, player.state.z, 4.6);
  if (trafficCar) {
    const d = dist(player.state.x, player.state.z, trafficCar.x, trafficCar.z);
    if (d < bestD) {
      best = trafficCar;
      bestD = d;
    }
  }
  if (!best) return false;
  if (best.driver === 'traffic') {
    traffic.detach(best);
    vehicles.adopt(best);
    police.reportCrime('carJack');
    hud.toast('VEHICLE STOLEN', 'warn');
  } else if (!best.police) {
    police.reportCrime('carJack');
  }
  const ok = vehicles.enter(best, player);
  if (ok) {
    player.group.visible = false;
    cameraCtl.reset();
    audio.ensure();
    hud.toast(best.label ?? 'VEHICLE ACQUIRED', 'good');
  }
  return ok;
}

function exitCar() {
  const car = vehicles.exit(player);
  if (car) {
    player.group.visible = true;
    player.syncWeapon();
    cameraCtl.reset();
    audio.setEngine(false);
    audio.setSkid(false);
  }
}

function handleDeath(kind) {
  if (deathState) return;
  if (player.state.inCar) exitCar();
  deathState = { kind, timer: 3.0 };
  player.state.alive = kind === 'wasted' ? false : player.state.alive;
  player.state.vx = 0;
  player.state.vz = 0;
  player.state.aiming = false;
  missions.fail(ctx);
  if (kind === 'busted') {
    hud.showBusted();
    audio.busted();
    stats.arrests += 1;
  } else {
    hud.showWasted();
    audio.busted();
  }
  input?.unlock();
  audio.setEngine(false);
  audio.setSkid(false);
  audio.setSiren(false);
}

function respawn() {
  const kind = deathState.kind;
  deathState = null;
  hud.hideBusted();
  hud.hideWasted();
  police.setWanted(0);
  police.clearPolice();
  audio.setSiren(false);
  if (kind === 'wasted') {
    const spot = SPOTS.hospital;
    player.reset(spot.x, spot.z, 0);
    player.state.cash = Math.max(0, player.state.cash - 100);
    hud.toast('ST. PALMA HOSPITAL ·-$100', 'warn');
    hud.dialogue('LUNA', 'You look terrible. The job is still there if you want it.', 4);
  } else {
    const spot = SPOTS.police;
    player.reset(spot.x, spot.z, 0);
    player.state.cash = Math.max(0, player.state.cash - 150);
    player.state.weapons.pistol.ammo = 0;
    player.state.weapons.pistol.reserve = 12;
    player.state.weapons.smg.ammo = 0;
    player.state.weapons.smg.reserve = 0;
    player.setWeapon('fists');
    hud.toast('PVPD RELEASED YOU ·-$150 · WEAPONS SEIZED', 'warn');
    hud.dialogue('VOSS', 'You are lucky I need a courier more than I need a report.', 4);
  }
  player.group.visible = true;
  player.syncWeapon();
  cameraCtl.reset();
  saveProgress(true);
  if (!smokeMode) input?.lock();
}

function playerPrompt() {
  if (mode !== 'play') return null;
  if (player.state.inCar) return 'EXIT VEHICLE';
  if (missions.nearStart) return `START MISSION ${missions.index + 1}`;
  let best = vehicles.nearest(player.state.x, player.state.z, 4.6);
  let bestD = best ? dist(player.state.x, player.state.z, best.x, best.z) : Infinity;
  const trafficCar = traffic.nearestCar(player.state.x, player.state.z, 4.6);
  if (trafficCar) {
    const d = dist(player.state.x, player.state.z, trafficCar.x, trafficCar.z);
    if (d < bestD) { best = trafficCar; bestD = d; }
  }
  if (best) return best.driver === 'traffic' ? 'STEAL VEHICLE' : 'ENTER VEHICLE';
  return null;
}

function carCollisions(dt) {
  const active = player.state.inCar;
  if (!active) return;
  const all = [...traffic.cars, ...police.cruisers];
  for (const other of all) {
    if (other === active || other.dead) continue;
    const dx = active.x - other.x;
    const dz = active.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d > 3.15 || d < 0.001) continue;
    const nx = dx / d;
    const nz = dz / d;
    const overlap = 3.15 - d;
    active.x += nx * overlap * 0.55;
    active.z += nz * overlap * 0.55;
    other.x -= nx * overlap * 0.45;
    other.z -= nz * overlap * 0.45;
    const rel = Math.hypot(active.vx - (other.vx ?? 0), active.vz - (other.vz ?? 0));
    if (rel > 7 && !(other.hitTimer > 0)) {
      other.hitTimer = 0.8;
      vehicles.damageCar(active, rel * 0.7, ctx);
      vehicles.damageCar(other, rel * 1.1, ctx);
      audio.impact();
      cameraCtl.shake(0.55);
      if (other.driver === 'traffic') other.speed = Math.max(0, other.speed * 0.4);
      police.reportCrime('reckless');
    }
  }
  for (const list of [traffic.cars, police.cruisers]) {
    for (const car of list) if (car.hitTimer > 0) car.hitTimer -= dt;
  }
}

function pedCollisions() {
  const car = player.state.inCar;
  if (!car || car.speed < 4) return;
  const now = performance.now();
  for (const ped of traffic.peds) {
    if (!ped.alive) continue;
    if (ped.lastHit && now - ped.lastHit < 1500) continue;
    if (dist(car.x, car.z, ped.x, ped.z) < 2.3) {
      ped.lastHit = now;
      const fatal = traffic.hitPed(ped, 30 + car.speed * 1.4, car.x, car.z, 2.4);
      police.reportCrime(fatal ? 'pedKilled' : 'pedHit');
      car.speed *= 0.86;
      audio.impact();
      cameraCtl.shake(0.35);
    }
  }
  for (const actor of police.actors) {
    if (!actor.alive || actor.kind !== 'gang') continue;
    if (dist(car.x, car.z, actor.x, actor.z) < 2.4) {
      police.damageActor(actor, 26 + car.speed, ctx, car.x, car.z);
      stats.takedowns += 1;
      car.speed *= 0.9;
    }
  }
}

function updateHUD(dt) {
  hud.setHealth(player.state.health, player.state.armor);
  hud.setCash(player.state.cash);
  hud.setWanted(police.wanted, police.heat);
  const spec = player.currentSpec();
  const pocket = player.state.weapons[player.state.weapon];
  hud.setWeapon(player.state.weapon, pocket?.ammo ?? 0, pocket?.reserve ?? 0);
  const car = player.state.inCar;
  hud.setSpeed(car ? car.speed * 2.23694 : 0, car ? (car.brake ? 'B' : 'D') : 'P', Boolean(car));
  hud.setClock(gameTime);
  hud.setDistrict(areaName(player.state.x, player.state.z));
  hud.setRadio(audio.station.name, audio.station.genre);
  hud.setPrompt(playerPrompt());
  hud.setCrosshair(Boolean(player.state.aiming));
  hud.setStats({ missions: missions.index, wanted: police.wanted });
  hud.update(dt);
  minimap.draw(mapState(ctx));
  if (mapOpen) minimap.drawFull(el.mapCanvas, mapState(ctx));
}

function gameplayUpdate(dt) {
  if (!started) return;
  gameTime = (gameTime + dt * 0.5) % 86400;
  autosaveTimer -= dt;
  if (deathState) {
    deathState.timer -= dt;
    player.state.vx = 0;
    player.state.vz = 0;
    player.update(dt, { input: input ?? emptyInput, city, cameraYaw: cameraCtl.state.yaw, frozen: true });
    traffic.update(dt, { player, activeCar: null, wanted: police.wanted });
    world.update(dt);
    city.update(gameTime, dt);
    cameraCtl.update(dt, { player, car: null, speed: 0 });
    updateHUD(dt);
    if (deathState.timer <= 0) respawn();
    return;
  }
  const look = input.look();
  cameraCtl.look(look.dx, look.dy);

  if (input.weapon1()) { player.setWeapon('pistol'); audio.ui(1); }
  if (input.weapon2()) { player.setWeapon('smg'); audio.ui(1); }
  if (input.weapon3()) { player.setWeapon('fists'); audio.ui(1); }
  if (input.reload()) player.reload();
  if (input.stationPrev()) {
    const station = audio.nextStation(-1);
    settings.radio = audio.stationIndex;
    hud.toast(`${station.name} · ${station.genre}`, 'good');
    saveSettings(settings);
  }
  if (input.stationNext()) {
    const station = audio.nextStation(1);
    settings.radio = audio.stationIndex;
    hud.toast(`${station.name} · ${station.genre}`, 'good');
    saveSettings(settings);
  }

  const car = player.state.inCar;
  if (car) {
    const throttle = (input.forward() ? 1 : 0) - (input.back() ? 1 : 0);
    const steer = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
    const brake = input.jump();
    const boost = input.sprint();
    let smokeThrottle = throttle;
    let smokeSteer = steer;
    if (smokeMode && smoke?.driving) {
      smokeThrottle = 1;
      smokeSteer = 0.03;
    }
    if (car.dead) {
      exitCar();
      player.damage(200);
    } else {
      vehicles.drive(car, dt, { throttle: smokeThrottle, steer: smokeSteer, brake, boost }, ctx);
      player.state.x = car.x;
      player.state.z = car.z;
      player.state.heading = car.heading;
      player.state.y = 0.1;
      stats.distance += car.speed * dt;
      if (input.interact()) exitCar();
      const speedNorm = clamp(car.speed / car.spec.maxSpeed, 0, 1);
      audio.setEngine(true, speedNorm, Math.abs(throttle));
      audio.setSkid(brake && car.speed > 6);
      if (input.horn()) audio.horn();
      cameraCtl.update(dt, { player, car, speed: speedNorm });
    }
  } else {
    audio.setEngine(false);
    audio.setSkid(false);
    player.update(dt, { input, city, cameraYaw: cameraCtl.state.yaw });
    if (input.interact()) {
      if (missions.nearStart) {
        if (missions.start(ctx)) {
          hud.toast(`MISSION ${missions.index + 1} ACCEPTED`, 'mission');
          audio.ui(1);
        }
      } else {
        enterNearestCar();
      }
    }
    if (input.fire() && player.state.alive) {
      combat.playerAttack(ctx);
    }
    cameraCtl.update(dt, { player, car: null, aiming: player.state.aiming, speed: 0 });
  }

  if (!player.state.inCar && player.state.alive && player.state.health <= 0) {
    handleDeath('wasted');
  }
  if (!player.state.alive && !deathState) handleDeath('wasted');
  if (!player.state.alive) {
    player.state.vx = 0;
    player.state.vz = 0;
  }

  vehicles.update(dt, ctx);
  traffic.update(dt, { player, activeCar: player.state.inCar, wanted: police.wanted });
  police.update(dt, ctx);
  combat.update(dt, ctx);
  missions.update(dt, ctx);
  carCollisions(dt);
  pedCollisions();

  if (missions.index > lastMissionIndex) {
    lastMissionIndex = missions.index;
    stats.missions = Math.max(stats.missions, missions.index);
    saveProgress(true);
    autosaveTimer = 45;
  }
  if (autosaveTimer <= 0 && mode === 'play' && !police.wanted) {
    autosaveTimer = 60;
    saveProgress(true);
  }

  world.update(dt);
  city.update(gameTime, dt);
  updateHUD(dt);
}

function emptyUpdate() {
  // Title screen: let the city breathe while the camera drifts over it.
  titleTime += 1 / 60;
  const a = titleTime * 0.035 + 0.5;
  const radius = 225;
  world.camera.position.set(Math.cos(a) * radius, 64 + Math.sin(titleTime * 0.11) * 8, Math.sin(a) * radius - 30);
  world.camera.lookAt(-8, 18, -18);
  world.camera.fov = 50;
  world.camera.updateProjectionMatrix();
  traffic.update(1 / 60, { player, activeCar: null, wanted: 0 });
  vehicles.update(1 / 60, ctx);
  city.update(gameTime + titleTime * 0.4, 1 / 60);
  world.update(1 / 60);
}

// ---------------------------------------------------------------- input and screens

input = createInput(canvas, {
  onPointerLock: (locked) => {
    if (!locked && mode === 'play' && !mapOpen && !deathState && !shotName) pauseGame();
  },
});

function bindButton(id, handler) {
  const node = document.getElementById(id);
  if (node) node.addEventListener('click', (event) => {
    event.stopPropagation();
    audio.ensure();
    handler();
  });
}

bindButton('btn-new', () => {
  audio.ensure();
  audio.setAmbient(true);
  startGame({ fromSave: false });
});
bindButton('btn-continue', () => {
  if (!hasSave()) return;
  audio.ensure();
  startGame({ fromSave: true });
});
bindButton('btn-controls', () => openControls('title'));
bindButton('btn-settings', () => openSettings('title'));
bindButton('btn-settings-back', closeSettings);
bindButton('btn-controls-back', closeControls);
bindButton('btn-resume', resumeGame);
bindButton('btn-save', () => { saveProgress(false); });
bindButton('btn-load', () => {
  if (hasSave()) startGame({ fromSave: true });
  else hud.toast('NO SAVE FOUND', 'warn');
});
bindButton('btn-pause-settings', () => openSettings('pause'));
bindButton('btn-quit', () => {
  showTitle();
});

function bindSwitch(node, key, after = null) {
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    settings[key] = !settings[key];
    applySettings();
    after?.();
  });
}
bindSwitch(el.optAudio, 'audio', () => audio.ensure());
bindSwitch(el.optMusic, 'music');
bindSwitch(el.optHints, 'showHints');
el.optSens.addEventListener('input', () => {
  settings.sensitivity = Number(el.optSens.value);
  if (input) input.sensitivity = settings.sensitivity;
  saveSettings(settings);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') pauseGame();
});

// Start the title music on the first gesture, as browsers require.
let firstGesture = false;
const gesture = () => {
  if (firstGesture) return;
  firstGesture = true;
  audio.ensure();
  audio.setAmbient(true);
  applySettings();
};
window.addEventListener('pointerdown', gesture, { once: true });
window.addEventListener('keydown', gesture, { once: true });

// ---------------------------------------------------------------- shot mode

function beginShot() {
  mode = 'shot';
  showScreen(null);
  hud.show();
  player.group.visible = false;
  cameraCtl.reset();
  audio.setEnabled(false);
  audio.setAmbient(false);
  world.setMood(shotName === 'chase' ? 'chase' : shotName === 'drive' ? 'drive' : shotName === 'mission' ? 'mission' : 'golden', city);
  shotMapState = stageShot(shotName, ctx);
  document.title = `${GAME_TITLE} — ${shotName}`;
  window.__shotName = shotName;
}

function shotUpdate(dt) {
  shotFrames += 1;
  city.update(shotFrames / 60, dt);
  world.update(dt);
  for (const car of vehicles.cars) vehicles.animateCar(car, dt, car.speed || 0);
  for (const car of police.cruisers) vehicles.animateCar(car, dt, car.speed || 0);
  cameraCtl.update(dt, { player, car: player.state.inCar, speed: player.state.inCar ? 1 : 0 });
  hud.update(dt);
  minimap.draw(mapState(ctx));
  if (shotFrames === 2) {
    el.loading.style.display = 'none';
  }
  if (shotFrames >= 10) {
    window.__shotReady = true;
  }
}

// ---------------------------------------------------------------- smoke mode

function beginSmoke() {
  el.loading.style.display = 'none';
  smoke = {
    time: 0,
    results: {},
    driving: false,
    stage: 0,
    car: null,
    startX: 0,
    startZ: 0,
    errorCount: window.__errors.length,
  };
  mode = 'smoke';
  window.__smoke = smoke;
  showScreen(null);
  hud.show();
  audio.setEnabled(false);
  startGame({ fromSave: false, lock: false, silent: true });
  mode = 'smoke';
  audio.setEnabled(false);
  player.state.x = 3;
  player.state.z = 26;
  player.state.heading = 0;
  player.group.position.set(3, 0.1, 26);
  smoke.car = vehicles.spawn('sedan', 0xe8d8c8, 0.5, 26, 0, { parked: true, id: 'smoke-car' });
  vehicles.animateCar(smoke.car, 1 / 60, 0);
  ctx.hud.toast('SMOKE TEST', 'mission');
}

function finishSmoke() {
  const results = smoke.results;
  results.errors = window.__errors;
  results.fpsMode = 'headless';
  const pass = Boolean(results.started && results.enteredCar && results.drove && results.fired && results.ammoDropped && results.wanted && results.mission);
  results.pass = pass;
  document.body.dataset.smoke = JSON.stringify(results);
  window.__smokeDone = true;
  document.title = pass ? 'SMOKE PASS' : 'SMOKE FAIL';
  smoke.done = true;
  smoke.results = results;
}

function smokeUpdate(dt) {
  if (!smoke || smoke.done) return;
  smoke.time += dt;
  const t = smoke.time;
  document.body.dataset.smokeStage = String(smoke.stage);
  window.__smoke = smoke;
  if (smoke.stage === 0 && t > 0.25) {
    smoke.results.started = started && mode === 'smoke';
    smoke.stage = 1;
  }
  if (smoke.stage === 1 && t > 0.45) {
    enterNearestCar();
    smoke.results.enteredCar = Boolean(player.state.inCar);
    smoke.startX = player.state.x;
    smoke.startZ = player.state.z;
    smoke.driving = true;
    smoke.stage = 2;
  }
  if (smoke.stage === 2 && t > 1.1) {
    if (player.state.inCar) {
      vehicles.drive(player.state.inCar, dt, { throttle: 1, steer: 0.02, brake: false }, ctx);
      player.state.x = player.state.inCar.x;
      player.state.z = player.state.inCar.z;
    }
  }
  if (smoke.stage === 2 && t > 2.1) {
    smoke.driving = false;
    smoke.results.drove = Boolean(player.state.inCar) && dist(player.state.x, player.state.z, smoke.startX, smoke.startZ) > 3;
    smoke.results.carSpeed = player.state.inCar?.speed ?? 0;
    exitCar();
    smoke.stage = 3;
  }
  if (smoke.stage === 3 && t > 2.5) {
    player.setWeapon('pistol');
    const before = player.state.weapons.pistol.ammo;
    cameraCtl.update(0.016, { player, car: null, aiming: false, speed: 0 });
    combat.playerAttack(ctx);
    smoke.results.fired = true;
    smoke.results.ammoDropped = player.state.weapons.pistol.ammo < before;
    police.setWanted(3);
    smoke.stage = 4;
  }
  if (smoke.stage === 4 && t > 3.3) {
    smoke.results.wanted = police.wanted >= 3 && police.cruisers.length > 0;
    smoke.results.cruisers = police.cruisers.length;
    police.setWanted(0);
    police.clearPolice();
    player.state.x = SPOTS.cafe.x;
    player.state.z = SPOTS.cafe.z;
    player.group.position.set(SPOTS.cafe.x, 0.1, SPOTS.cafe.z);
    missions.setIndex(0);
    missions.update(1 / 60, ctx);
    smoke.stage = 5;
  }
  if (smoke.stage === 5 && t > 3.6) {
    const startedMission = missions.start(ctx);
    smoke.results.mission = Boolean(startedMission && missions.active);
    smoke.results.missionTitle = missions.active?.title ?? null;
    smoke.results.marker = missions.minimapTarget();
    smoke.stage = 6;
  }
  if (smoke.stage === 6 && t > 4.2) {
    finishSmoke();
  }
}

// ---------------------------------------------------------------- main loop

function frameBody(now) {
  frameCount += 1;
  const dt = Math.min((now - lastFrame) / 1000, 0.12);
  lastFrame = now;
  if (mode === 'shot') {
    shotUpdate(1 / 60);
    world.render();
    return;
  }
  if (mode === 'smoke') {
    // The headless smoke test runs faster than real time so software rendering cannot stall it.
    if (smoke?.done) { world.render(); return; }
    for (let i = 0; i < 30 && !smoke?.done; i++) {
      smokeUpdate(TIME.step);
      gameplayUpdate(TIME.step);
    }
    world.render();
    return;
  }
  if (mode === 'play') {
    if (mapOpen) {
      if (input.map() || input.pause()) toggleMap();
      minimap.drawFull(el.mapCanvas, mapState(ctx));
      world.render();
      return;
    }
    if (input.pause()) {
      pauseGame();
      world.render();
      return;
    }
    if (input.map()) {
      toggleMap();
      world.render();
      return;
    }
    if (input.save()) saveProgress(false);
    if (input.load()) {
      if (hasSave()) startGame({ fromSave: true });
      else hud.toast('NO SAVE FOUND', 'warn');
    }
    accumulator += dt;
    let guard = 0;
    while (accumulator >= TIME.step && guard < 8) {
      gameplayUpdate(TIME.step);
      accumulator -= TIME.step;
      guard += 1;
    }
    if (accumulator > 0.2) accumulator = 0;
    world.render();
    return;
  }
  if (mode === 'pause') {
    if (input.pause()) resumeGame();
    world.render();
    return;
  }
  if (mode === 'settings') {
    if (input.pause()) closeSettings();
    world.render();
    return;
  }
  if (mode === 'controls') {
    if (input.pause()) closeControls();
    world.render();
    return;
  }
  // Title (and any unknown mode).
  emptyUpdate();
  world.render();
  if (!el.loading.dataset.hidden) {
    el.loading.dataset.hidden = '1';
    setTimeout(() => { el.loading.style.display = 'none'; }, 250);
  }
}

// ---------------------------------------------------------------- boot

applySettings();
refreshContinue();
showScreen('title');
hud.hide();
if (shotName) {
  beginShot();
} else if (smokeMode) {
  beginSmoke();
} else {
  mode = 'title';
  player.group.visible = false;
  world.setMood('title', city);
  audio.setAmbient(false);
}

// One warm-up render so shaders compile before the title appears.
world.camera.position.set(120, 48, 120);
world.camera.lookAt(0, 16, -20);
world.camera.fov = 50;
world.camera.updateProjectionMatrix();
world.update(1 / 60);
world.render();
if (shotName) {
  el.loading.style.display = 'none';
}
window.__palmaVista = { mode, shotName, smokeMode, world, city, player, missions, police, vehicles, traffic, combat, ctx };
window.__gameState = () => ({
  mode, mapOpen, death: deathState?.kind ?? null, frameCount, started,
  player: { x: player.state.x, y: player.state.y, z: player.state.z, heading: player.state.heading, inCar: Boolean(player.state.inCar) },
  camera: world.camera.position.toArray(),
  wanted: police.wanted, mission: missions.index, active: Boolean(missions.active),
});

function frame(now) {
  requestAnimationFrame(frame);
  try {
    frameBody(now);
  } catch (error) {
    recordError(error?.stack ?? error?.message ?? String(error), 'frame');
    document.body.dataset.frameError = String(error?.message ?? error);
  }
}

requestAnimationFrame(frame);

