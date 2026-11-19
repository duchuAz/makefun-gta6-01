// Rico Valdez: a courier with a teal jacket and a borrowed pistol. The model is built from
// boxes and capsules so it animates without a rig; movement is camera-relative, collisions
// are circles against the city's boxes, and the weapon state lives here for combat to read.
import * as THREE from 'three';
import { PLAYER, WEAPONS, WEAPON_ORDER, SPAWN } from './config.js';
import { clamp, damp, wrapAngle } from './math.js';

function part(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createPlayer(scene) {
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2fa7a0, roughness: 0.75 });
  const jacketDark = new THREE.MeshStandardMaterial({ color: 0x1e7777, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f45, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a07a, roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x241a1a, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.5, metalness: 0.2 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.8, roughness: 0.3 });

  const group = new THREE.Group();
  group.name = 'Rico';
  scene.add(group);

  const body = new THREE.Group();
  group.add(body);

  const torso = part(new THREE.BoxGeometry(0.62, 0.74, 0.36), jacket, 0, 1.31, 0);
  body.add(torso);
  const zipper = part(new THREE.BoxGeometry(0.045, 0.64, 0.025), gold, 0, 1.3, 0.195);
  body.add(zipper);
  const strap = part(new THREE.BoxGeometry(0.075, 0.78, 0.025), black, 0, 1.31, 0.2);
  strap.rotation.z = 0.58;
  body.add(strap);
  const bag = part(new THREE.BoxGeometry(0.26, 0.3, 0.16), new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.9 }), -0.4, 0.98, 0.0);
  body.add(bag);
  const collar = part(new THREE.BoxGeometry(0.5, 0.11, 0.34), jacketDark, 0, 1.67, 0);
  const collarTrim = part(new THREE.BoxGeometry(0.22, 0.08, 0.04), shirt, 0, 1.61, 0.19);
  body.add(collar, collarTrim);
  const pendant = part(new THREE.BoxGeometry(0.13, 0.13, 0.025), gold, 0, 1.45, 0.21);
  body.add(pendant);
  const hips = part(new THREE.BoxGeometry(0.52, 0.26, 0.34), pants, 0, 0.87, 0);
  body.add(hips);

  const head = new THREE.Group();
  head.position.set(0, 1.76, 0);
  const skull = part(new THREE.SphereGeometry(0.22, 12, 10), skin, 0, 0.06, 0);
  skull.scale.set(0.92, 1.05, 0.92);
  head.add(skull);
  const cap = part(new THREE.SphereGeometry(0.228, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.09, 0);
  cap.scale.set(0.95, 0.9, 0.95);
  head.add(cap);
  const shades = part(new THREE.BoxGeometry(0.36, 0.075, 0.06), black, 0, 0.06, 0.2);
  head.add(shades);
  const jaw = part(new THREE.BoxGeometry(0.24, 0.12, 0.2), skin, 0, -0.04, 0.025);
  head.add(jaw);
  body.add(head);

  const armL = new THREE.Group();
  armL.position.set(-0.38, 1.55, 0);
  const armLMesh = part(new THREE.BoxGeometry(0.17, 0.58, 0.19), jacket, 0, -0.28, 0);
  armL.add(armLMesh);
  const handL = part(new THREE.BoxGeometry(0.14, 0.17, 0.16), skin, 0, -0.63, 0);
  armL.add(handL);
  body.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.38, 1.55, 0);
  const armRMesh = part(new THREE.BoxGeometry(0.17, 0.58, 0.19), jacket, 0, -0.28, 0);
  armR.add(armRMesh);
  const handR = part(new THREE.BoxGeometry(0.14, 0.17, 0.16), skin, 0, -0.63, 0);
  armR.add(handR);
  body.add(armR);

  const legL = new THREE.Group();
  legL.position.set(-0.15, 0.83, 0);
  const legLMesh = part(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants, 0, -0.36, 0);
  legL.add(legLMesh);
  const shoeL = part(new THREE.BoxGeometry(0.24, 0.14, 0.36), black, 0, -0.76, 0.06);
  legL.add(shoeL);
  body.add(legL);

  const legR = new THREE.Group();
  legR.position.set(0.15, 0.83, 0);
  const legRMesh = part(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants, 0, -0.36, 0);
  legR.add(legRMesh);
  const shoeR = part(new THREE.BoxGeometry(0.24, 0.14, 0.36), black, 0, -0.76, 0.06);
  legR.add(shoeR);
  body.add(legR);

  const pistol = new THREE.Group();
  const slide = part(new THREE.BoxGeometry(0.075, 0.11, 0.36), black, 0, 0, 0.12);
  const grip = part(new THREE.BoxGeometry(0.07, 0.2, 0.1), black, 0, -0.13, -0.02);
  grip.rotation.x = 0.22;
  const trigger = part(new THREE.BoxGeometry(0.05, 0.05, 0.06), gold, 0, -0.07, 0.05);
  pistol.add(slide, grip, trigger);
  const smg = new THREE.Group();
  const bodySmg = part(new THREE.BoxGeometry(0.11, 0.16, 0.5), black, 0, 0, 0.14);
  const barrel = part(new THREE.BoxGeometry(0.06, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: 0x2a2a36, metalness: 0.7, roughness: 0.3 }), 0, 0.02, 0.48);
  const mag = part(new THREE.BoxGeometry(0.08, 0.28, 0.1), black, 0, -0.2, 0.05);
  mag.rotation.x = -0.18;
  const stock = part(new THREE.BoxGeometry(0.06, 0.12, 0.28), black, 0, 0, -0.16);
  smg.add(bodySmg, barrel, mag, stock);
  const weaponMount = new THREE.Group();
  weaponMount.add(pistol, smg);
  weaponMount.position.set(0.36, 1.36, 0.34);
  weaponMount.rotation.x = 0.08;
  body.add(weaponMount);
  pistol.visible = false;
  smg.visible = false;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, 0.55);
  weaponMount.add(muzzle);

  const state = {
    x: SPAWN.x, y: 0.1, z: SPAWN.z, heading: SPAWN.heading,
    vx: 0, vz: 0, vy: 0, grounded: true,
    health: PLAYER.maxHealth, armor: 0,
    cash: PLAYER.startCash,
    alive: true,
    inCar: null,
    aiming: false,
    sprinting: false,
    crouch: false,
    fireCooldown: 0,
    reloadTimer: 0,
    walkPhase: 0,
    speed: 0,
    lastDamageAt: -99,
    weapon: PLAYER.startWeapon,
    weapons: {
      pistol: { ammo: WEAPONS.pistol.ammo, reserve: WEAPONS.pistol.reserve },
      smg: { ammo: WEAPONS.smg.ammo, reserve: WEAPONS.smg.reserve },
    },
    recoil: 0,
    hurtFlash: 0,
  };

  function updateWeaponMesh() {
    pistol.visible = state.weapon === 'pistol' && !state.inCar;
    smg.visible = state.weapon === 'smg' && !state.inCar;
    body.visible = !state.inCar;
  }

  function setWeapon(name) {
    if (name === 'fists' || !WEAPONS[name]) {
      state.weapon = 'fists';
    } else {
      state.weapon = name;
    }
    updateWeaponMesh();
  }

  function nextWeapon() {
    const index = WEAPON_ORDER.indexOf(state.weapon);
    state.weapon = WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length];
    updateWeaponMesh();
    return state.weapon;
  }

  function currentSpec() {
    return WEAPONS[state.weapon] ?? WEAPONS.fists;
  }

  function reload() {
    if (state.weapon !== 'pistol' && state.weapon !== 'smg') return false;
    const pocket = state.weapons[state.weapon];
    const spec = WEAPONS[state.weapon];
    if (pocket.reserve <= 0 || pocket.ammo >= spec.ammo || state.reloadTimer > 0) return false;
    state.reloadTimer = state.weapon === 'smg' ? 1.55 : 1.15;
    return true;
  }

  function finishReload() {
    if (state.weapon !== 'pistol' && state.weapon !== 'smg') return;
    const pocket = state.weapons[state.weapon];
    const spec = WEAPONS[state.weapon];
    const need = spec.ammo - pocket.ammo;
    const take = Math.min(need, pocket.reserve);
    pocket.ammo += take;
    pocket.reserve -= take;
  }

  function damage(amount, { ignoreArmor = false } = {}) {
    if (!state.alive || amount <= 0) return false;
    let left = amount;
    if (!ignoreArmor && state.armor > 0) {
      const absorbed = Math.min(state.armor, left * 0.62);
      state.armor = Math.max(0, state.armor - absorbed);
      left -= absorbed;
    }
    state.health = Math.max(0, state.health - left);
    state.hurtFlash = 1;
    state.lastDamageAt = performance.now() / 1000;
    if (state.health <= 0) {
      state.alive = false;
      return true;
    }
    return false;
  }

  function heal(amount) {
    state.health = clamp(state.health + amount, 0, PLAYER.maxHealth);
  }

  function reset(x = SPAWN.x, z = SPAWN.z, heading = SPAWN.heading) {
    state.x = x;
    state.y = 0.1;
    state.z = z;
    state.heading = heading;
    state.vx = 0;
    state.vz = 0;
    state.vy = 0;
    state.health = PLAYER.maxHealth;
    state.armor = 0;
    state.alive = true;
    state.reloadTimer = 0;
    state.fireCooldown = 0;
    state.inCar = null;
    state.aiming = false;
    updateWeaponMesh();
  }

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let bobTime = 0;

  function update(dt, { input, city, cameraYaw, frozen = false }) {
    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 2.5);
    state.recoil = Math.max(0, state.recoil - dt * 6);
    if (state.reloadTimer > 0) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        state.reloadTimer = 0;
        finishReload();
      }
    }
    if (!state.alive) {
      state.vx = 0;
      state.vz = 0;
      group.position.set(state.x, state.y, state.z);
      group.rotation.z = damp(group.rotation.z, Math.PI / 2, 3, dt);
      return;
    }
    group.rotation.z = damp(group.rotation.z, 0, 6, dt);
    if (state.inCar || frozen) {
      state.speed = 0;
      state.aiming = false;
      animate(dt, 0, false);
      group.position.set(state.x, state.y, state.z);
      group.rotation.y = state.heading;
      return;
    }

    state.aiming = Boolean(input.aim?.());
    const wantF = (input.forward() ? 1 : 0) - (input.back() ? 1 : 0);
    const wantR = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
    forward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    let mx = forward.x * wantF + right.x * wantR;
    let mz = forward.z * wantF + right.z * wantR;
    const mag = Math.hypot(mx, mz);
    if (mag > 0.001) {
      mx /= mag;
      mz /= mag;
    }
    state.sprinting = input.sprint?.() && mag > 0 && !state.aiming;
    let targetSpeed = state.crouch ? PLAYER.walkSpeed * 0.45 : state.aiming ? PLAYER.walkSpeed * 0.62 : state.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (state.health < 25) targetSpeed *= 0.86;
    const desiredVx = mx * targetSpeed * (mag > 0 ? 1 : 0);
    const desiredVz = mz * targetSpeed * (mag > 0 ? 1 : 0);
    const accel = mag > 0 ? PLAYER.acceleration : PLAYER.acceleration * 1.4;
    state.vx = damp(state.vx, desiredVx, accel * 0.28, dt);
    state.vz = damp(state.vz, desiredVz, accel * 0.28, dt);

    if (input.jump?.() && state.grounded) {
      state.vy = PLAYER.jumpSpeed;
      state.grounded = false;
    }
    state.vy -= PLAYER.gravity * dt;
    state.y += state.vy * dt;
    if (state.y <= 0.1) {
      state.y = 0.1;
      state.vy = 0;
      state.grounded = true;
    }

    state.x += state.vx * dt;
    state.z += state.vz * dt;
    const fixed = city.resolveCircle(state.x, state.z, PLAYER.radius);
    if (Math.abs(fixed.x - state.x) > 0.0001 || Math.abs(fixed.z - state.z) > 0.0001) {
      state.vx *= 0.2;
      state.vz *= 0.2;
    }
    state.x = fixed.x;
    state.z = fixed.z;
    state.speed = Math.hypot(state.vx, state.vz);

    if (state.aiming) {
      state.heading = damp(wrapAngle(state.heading), wrapAngle(cameraYaw), 18, dt);
    } else if (state.speed > 0.35) {
      state.heading = damp(wrapAngle(state.heading), wrapAngle(Math.atan2(state.vx, state.vz)), 12, dt);
    }
    group.position.set(state.x, state.y, state.z);
    group.rotation.y = state.heading;
    animate(dt, state.speed, state.aiming);
  }

  function animate(dt, speed, aiming) {
    const move = clamp(speed / PLAYER.walkSpeed, 0, 1.4);
    state.walkPhase += dt * (4 + speed * 1.4);
    if (state.inCar) {
      body.visible = false;
      return;
    }
    body.visible = true;
    const swing = Math.sin(state.walkPhase) * 0.58 * Math.min(1, move);
    const swing2 = Math.sin(state.walkPhase + Math.PI) * 0.58 * Math.min(1, move);
    legL.rotation.x = swing;
    legR.rotation.x = swing2;
    if (aiming) {
      armR.rotation.x = damp(armR.rotation.x, -1.42, 16, dt);
      armL.rotation.x = damp(armL.rotation.x, -1.18, 16, dt);
      armL.rotation.z = damp(armL.rotation.z, 0.55, 14, dt);
      armR.rotation.z = damp(armR.rotation.z, -0.08, 14, dt);
    } else {
      armR.rotation.x = damp(armR.rotation.x, -swing * 0.8, 14, dt);
      armL.rotation.x = damp(armL.rotation.x, -swing2 * 0.8, 14, dt);
      armL.rotation.z = damp(armL.rotation.z, 0.04, 10, dt);
      armR.rotation.z = damp(armR.rotation.z, -0.04, 10, dt);
    }
    if (state.reloadTimer > 0) {
      armR.rotation.x = damp(armR.rotation.x, -0.35, 18, dt);
      armR.rotation.z = damp(armR.rotation.z, -0.7, 18, dt);
    }
    bobTime += dt * speed;
    const bob = Math.abs(Math.sin(bobTime * 2.2)) * 0.03 * Math.min(1, move);
    body.position.y = bob + (state.crouch ? -0.3 : 0);
    head.rotation.x = aiming ? -0.05 : Math.sin(state.walkPhase * 0.5) * 0.02;
    weaponMount.visible = state.weapon !== 'fists' && !state.inCar;
    weaponMount.rotation.x = aiming ? 0 : 0.08;
  }

  function muzzleWorld() {
    const v = new THREE.Vector3();
    muzzle.getWorldPosition(v);
    return v;
  }

  updateWeaponMesh();
  group.position.set(state.x, state.y, state.z);
  group.rotation.y = state.heading;

  return {
    group,
    state,
    update,
    damage,
    heal,
    reset,
    setWeapon,
    nextWeapon,
    currentSpec,
    reload,
    muzzleWorld,
    bodyY: () => body.position.y,
    get reloading() { return state.reloadTimer > 0; },
    syncWeapon() { updateWeaponMesh(); },
  };
}
// recorded-session note: movement, aiming and weapon state are unchanged
// strict3 recorded-session note: movement, aiming and weapon state are untouched

