// Third-person camera with mouse orbit, an over-the-shoulder aim pose, a wider low chase
// camera for cars and a simple collision pull-in. The controller never owns the camera's
// target: the player or the current car does.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from './math.js';

export function createCameraController(camera, city) {
  const state = {
    yaw: 0.35,
    pitch: 0.22,
    distance: 4.6,
    mode: 'foot',
    shake: 0,
    recoil: 0,
    aim: 0,
    override: null,
  };
  const smoothPos = new THREE.Vector3(-40, 20, 60);
  const smoothLook = new THREE.Vector3(0, 0, 0);
  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  let carYawOffset = 0;
  let init = false;

  function blocked(x, z) {
    for (const box of city.collision) {
      if (x > box.minX - 0.45 && x < box.maxX + 0.45 && z > box.minZ - 0.45 && z < box.maxZ + 0.45) return true;
    }
    return false;
  }

  function applyOverride(override) {
    camera.position.copy(override.pos);
    if (override.look) camera.lookAt(override.look);
    if (override.fov) {
      camera.fov = override.fov;
      camera.updateProjectionMatrix();
    }
    smoothPos.copy(camera.position);
    if (override.look) smoothLook.copy(override.look);
  }

  function update(dt, { player, car, look, aiming = false, speed = 0 }) {
    if (state.override) {
      applyOverride(state.override);
      return;
    }
    const target = new THREE.Vector3();
    let desiredDistance;
    let targetY;
    let lookAhead;
    if (car) {
      target.set(car.x, 1.25, car.z);
      targetY = 1.15;
      desiredDistance = 7.1 + clamp(speed, 0, 1) * 1.4;
      lookAhead = 5.5 + speed * 8;
      state.mode = 'car';
      const desiredYaw = car.heading + carYawOffset;
      state.yaw = damp(wrapAngle(state.yaw), wrapAngle(desiredYaw), 5.5, dt);
      carYawOffset = damp(carYawOffset, 0, 2.4, dt);
      state.pitch = damp(state.pitch, 0.15 + clamp(speed, 0, 1) * 0.05, 4, dt);
      state.aim = damp(state.aim, 0, 8, dt);
    } else {
      target.set(player.state.x, player.state.y + 1.5, player.state.z);
      targetY = 1.45;
      desiredDistance = aiming ? 2.9 : 5.0;
      lookAhead = aiming ? 12 : 3.2;
      state.mode = 'foot';
    }
    const pitch = clamp(state.pitch, -0.22, 0.95);
    const dist = state.distance = damp(state.distance, desiredDistance, 5, dt);
    const horizontal = Math.cos(pitch) * dist;
    const vertical = 0.8 + Math.sin(pitch) * dist;
    const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    tmpPos.copy(target).addScaledVector(forward, -horizontal).add(new THREE.Vector3(0, vertical, 0));
    if (aiming && !car) {
      tmpPos.addScaledVector(right, 0.85);
      tmpPos.y += 0.18;
    }

    // Pull the camera in before it enters a wall.
    let safe = 0;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const px = lerp(target.x, tmpPos.x, t);
      const pz = lerp(target.z, tmpPos.z, t);
      if (blocked(px, pz)) break;
      safe = t;
    }
    if (safe < 1) {
      tmpPos.x = lerp(target.x, tmpPos.x, Math.max(0.18, safe));
      tmpPos.z = lerp(target.z, tmpPos.z, Math.max(0.18, safe));
      tmpPos.y = Math.max(tmpPos.y, target.y + 0.5);
    }

    // Small recoil kick and crash shake.
    const shake = state.shake;
    if (shake > 0.001) {
      tmpPos.x += (Math.random() - 0.5) * shake;
      tmpPos.y += (Math.random() - 0.5) * shake;
      tmpPos.z += (Math.random() - 0.5) * shake;
      state.shake = Math.max(0, shake - dt * 2.6);
    }
    state.recoil = Math.max(0, state.recoil - dt * 5);
    if (!init) {
      smoothPos.copy(tmpPos);
      init = true;
    } else {
      smoothPos.lerp(tmpPos, 1 - Math.exp(-11 * dt));
    }
    camera.position.copy(smoothPos);

    tmpLook.set(
      target.x + forward.x * lookAhead,
      targetY + (state.mode === 'car' ? 0.15 : 0.25) - state.recoil * 0.12,
      target.z + forward.z * lookAhead,
    );
    if (look) tmpLook.copy(look);
    smoothLook.lerp(tmpLook, 1 - Math.exp(-14 * dt));
    camera.lookAt(smoothLook);

    const targetFov = car ? 58 + clamp(speed, 0, 1) * 16 : aiming ? 52 : 58;
    camera.fov = damp(camera.fov, targetFov, 4, dt);
    camera.updateProjectionMatrix();
  }

  return {
    state,
    update,
    look(dx, dy) {
      if (state.mode === 'car') {
        carYawOffset = clamp(carYawOffset - dx, -1.1, 1.1);
        state.pitch = clamp(state.pitch + dy * 0.7, 0.02, 0.42);
      } else {
        state.yaw -= dx;
        state.pitch = clamp(state.pitch + dy, -0.2, 0.92);
      }
    },
    kick(amount = 0.12) {
      state.recoil = Math.min(0.5, state.recoil + amount);
      state.shake = Math.min(1.2, state.shake + amount * 1.4);
    },
    shake(amount) {
      state.shake = Math.min(2.5, state.shake + amount);
    },
    setYaw(yaw) {
      state.yaw = yaw;
    },
    setOverride(pos, look, fov) {
      state.override = pos ? { pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), look: look ? new THREE.Vector3(look.x, look.y, look.z) : null, fov: fov ?? null } : null;
      init = false;
    },
    reset() {
      init = false;
      state.override = null;
    },
  };
}

