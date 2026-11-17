// Combat: hitscan shots with tracers and sparks, a punch for when things get close, and
// explosions that bloom orange and fade. Shots are checked against pedestrians, officers,
// gangsters and cars, with buildings blocking the line. No blood, no gore, just arcade
// impact and a wanted level that notices.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { clamp, dist, rayBoxXZ } from './math.js';

function makeFlashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.18, 'rgba(255,226,150,0.95)');
  grad.addColorStop(0.5, 'rgba(255,150,70,0.3)');
  grad.addColorStop(1, 'rgba(255,110,50,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, 'rgba(120,110,110,0.7)');
  grad.addColorStop(0.6, 'rgba(75,70,80,0.25)');
  grad.addColorStop(1, 'rgba(50,45,55,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.strokeStyle = 'rgba(255,220,160,0.9)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,150,90,0.4)';
  g.lineWidth = 18;
  g.beginPath();
  g.arc(64, 64, 48, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCombat(scene, city) {
  const tracers = [];
  const flashes = [];
  const explosions = [];
  const sparks = [];
  const flashTexture = makeFlashTexture();
  const smokeTexture = makeSmokeTexture();
  const ringTexture = makeRingTexture();
  let activeCtx = null;

  function tracer(fromX, fromY, fromZ, toX, toY, toZ, color = 0xffe3a0) {
    if (![fromX, fromY, fromZ, toX, toY, toZ].every(Number.isFinite)) {
      window.__badShot = { fromX, fromY, fromZ, toX, toY, toZ };
      return;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(fromX, fromY, fromZ),
      new THREE.Vector3(toX, toY, toZ),
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    tracers.push({ mesh: line, life: 0.1, max: 0.1 });
    if (dist(fromX, fromZ, toX, toZ) > 6) {
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flashTexture,
          color,
          transparent: true,
          opacity: 0.5 + Math.random() * 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }));
        s.position.set(toX, toY, toZ);
        s.scale.setScalar(0.4 + Math.random() * 0.5);
        scene.add(s);
        sparks.push({ mesh: s, life: 0.16 + Math.random() * 0.12, max: 0.28, vy: 0.8 + Math.random() });
      }
    }
  }

  function muzzle(x, y, z, color = 0xffd27a) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture,
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0.8);
    scene.add(sprite);
    flashes.push({ mesh: sprite, life: 0.07, max: 0.07 });
  }

  function explodeAt(x, y, z, radius = 8, ctx = null) {
    const context = ctx ?? activeCtx;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa24a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    core.position.set(x, y, z);
    scene.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture, color: 0xffb060, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.position.set(x, y + 0.8, z);
    glow.scale.setScalar(radius * 2.4);
    scene.add(glow);
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: ringTexture, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.2, z);
    scene.add(ring);
    const smokes = [];
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTexture, color: 0x6b5a58, transparent: true, opacity: 0.55,
        depthWrite: false, toneMapped: false,
      }));
      const a = Math.random() * Math.PI * 2;
      puff.position.set(x + Math.cos(a) * 1.2, y + 0.6 + Math.random(), z + Math.sin(a) * 1.2);
      puff.scale.setScalar(2 + Math.random() * 2);
      puff.userData.vy = 1.2 + Math.random() * 2;
      puff.userData.vx = Math.cos(a) * (0.6 + Math.random());
      puff.userData.vz = Math.sin(a) * (0.6 + Math.random());
      scene.add(puff);
      smokes.push(puff);
    }
    explosions.push({ core, glow, ring, smokes, life: 1.5, max: 1.5, radius });

    if (context) {
      const px = context.player?.state.x;
      const pz = context.player?.state.z;
      if (context.player && px !== undefined) {
        const d = dist(px, pz, x, z);
        if (d < radius) {
          context.player.damage(32 * (1 - d / radius) + 4);
          if (context.cameraCtl) context.cameraCtl.shake(1.5);
        }
      }
      const peds = context.traffic?.peds ?? [];
      for (const ped of peds) {
        if (!ped.alive) continue;
        const d = dist(ped.x, ped.z, x, z);
        if (d < radius) context.traffic.hitPed(ped, 90 * (1 - d / radius) + 10, x, z, 2);
      }
      const actors = context.police?.actors ?? [];
      for (const actor of actors) {
        if (!actor.alive) continue;
        const d = dist(actor.x, actor.z, x, z);
        if (d < radius && context.police) context.police.damageActor(actor, 100 * (1 - d / radius) + 15, context, x, z);
      }
      const carLists = [context.vehicles?.cars ?? [], context.traffic?.cars ?? [], context.police?.cruisers ?? []];
      for (const list of carLists) {
        for (const car of list) {
          if (car.dead) continue;
          const d = dist(car.x, car.z, x, z);
          if (d < radius && d > 0.1) context.vehicles?.damageCar(car, 55 * (1 - d / radius) + 8, context);
        }
      }
    }
  }

  function candidates(ctx) {
    const list = [];
    for (const ped of ctx.traffic?.peds ?? []) {
      if (!ped.alive) continue;
      list.push({ type: 'ped', ref: ped, x: ped.x, y: 1.1, z: ped.z, radius: 0.55 });
    }
    for (const actor of ctx.police?.actors ?? []) {
      if (!actor.alive) continue;
      list.push({ type: actor.kind, ref: actor, x: actor.x, y: 1.15, z: actor.z, radius: 0.58 });
    }
    for (const car of ctx.vehicles?.cars ?? []) {
      if (car.dead) continue;
      list.push({ type: 'car', ref: car, x: car.x, y: 0.8, z: car.z, radius: 1.55 });
    }
    for (const car of ctx.traffic?.cars ?? []) {
      if (car.dead) continue;
      list.push({ type: 'car', ref: car, x: car.x, y: 0.8, z: car.z, radius: 1.5 });
    }
    for (const car of ctx.police?.cruisers ?? []) {
      if (car.dead) continue;
      list.push({ type: 'car', ref: car, x: car.x, y: 0.8, z: car.z, radius: 1.55 });
    }
    for (const target of ctx.missions?.shootTargets ?? []) list.push(target);
    return list;
  }

  function hitscan(origin, direction, maxDistance, ctx) {
    const dir = direction.clone().normalize();
    let best = maxDistance;
    let hit = null;
    if (dir.y < -0.001) {
      const groundT = (0.15 - origin.y) / dir.y;
      if (groundT > 0 && groundT < best) {
        best = groundT;
        hit = { type: 'ground', point: origin.clone().addScaledVector(dir, groundT) };
      }
    }
    // Buildings block first.
    for (const box of city.collision) {
      const t = rayBoxXZ(origin.x, origin.z, dir.x, dir.z, box.minX, box.maxX, box.minZ, box.maxZ);
      if (t > 0.4 && t < best) {
        best = t;
        hit = { type: 'wall', point: origin.clone().addScaledVector(dir, t) };
      }
    }
    for (const candidate of candidates(ctx)) {
      const ox = candidate.x - origin.x;
      const oy = candidate.y - origin.y;
      const oz = candidate.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0.6 || t > best) continue;
      const cx = ox - dir.x * t;
      const cy = oy - dir.y * t;
      const cz = oz - dir.z * t;
      const rr = candidate.radius * candidate.radius;
      if (cx * cx + cy * cy + cz * cz <= rr) {
        best = t;
        hit = { ...candidate, point: origin.clone().addScaledVector(dir, t) };
      }
    }
    if (!hit) hit = { type: 'air', point: origin.clone().addScaledVector(dir, best) };
    return hit;
  }

  function applyHit(hit, damage, ctx, fromX, fromZ) {
    if (!hit) return;
    if (hit.type === 'ped') {
      const fatal = ctx.traffic.hitPed(hit.ref, damage, fromX, fromZ, 1.2);
      ctx.police?.reportCrime(fatal ? 'pedKilled' : 'pedHit');
      if (ctx.audio) ctx.audio.damage();
    } else if (hit.type === 'cop' || hit.type === 'gang') {
      const killed = ctx.police.damageActor(hit.ref, damage, ctx, fromX, fromZ);
      if (ctx.audio) ctx.audio.damage();
      if (killed && hit.type === 'cop') ctx.police.reportCrime('copKilled');
    } else if (hit.type === 'car') {
      ctx.vehicles.damageCar(hit.ref, damage * 0.85, ctx);
      if (ctx.audio) ctx.audio.impact();
    } else if (hit.type === 'crate') {
      ctx.missions.hitCrate(hit.ref, damage, ctx);
      if (ctx.audio) ctx.audio.impact();
    }
  }

  function playerAttack(ctx) {
    const player = ctx.player;
    const state = player.state;
    if (!state.alive || state.inCar || player.reloading) return false;
    if (state.fireCooldown > 0) return false;
    const spec = player.currentSpec();
    const aimDir = new THREE.Vector3();
    ctx.camera.getWorldDirection(aimDir);
    const origin = ctx.camera.position.clone().addScaledVector(aimDir, 0.4);

    if (state.weapon === 'fists') {
      state.fireCooldown = spec.rate;
      if (ctx.audio) ctx.audio.punch();
      const fx = Math.sin(state.heading);
      const fz = Math.cos(state.heading);
      let best = null;
      let bestD = spec.range;
      for (const ped of ctx.traffic.peds) {
        if (!ped.alive) continue;
        const d = dist(ped.x, ped.z, state.x, state.z);
        const dot = ((ped.x - state.x) * fx + (ped.z - state.z) * fz) / (d || 1);
        if (d < bestD && dot > 0.35) { bestD = d; best = { type: 'ped', ref: ped }; }
      }
      for (const actor of ctx.police.actors) {
        if (!actor.alive) continue;
        const d = dist(actor.x, actor.z, state.x, state.z);
        const dot = ((actor.x - state.x) * fx + (actor.z - state.z) * fz) / (d || 1);
        if (d < bestD && dot > 0.35) { bestD = d; best = { type: actor.kind, ref: actor }; }
      }
      if (best) {
        const hit = { ...best, point: new THREE.Vector3(best.ref.x, 1.2, best.ref.z) };
        applyHit(hit, spec.damage, ctx, state.x, state.z);
        tracer(state.x, 1.3, state.z, best.ref.x, 1.3, best.ref.z, 0xffe3a0);
        if (ctx.cameraCtl) ctx.cameraCtl.kick(0.08);
      }
      return true;
    }

    const pocket = state.weapons[state.weapon];
    if (!pocket) return false;
    if (pocket.ammo <= 0) {
      state.fireCooldown = 0.25;
      if (ctx.audio) ctx.audio.ui(0);
      if (ctx.hud) ctx.hud.toast('RELOAD', 'warn');
      player.reload();
      return false;
    }
    pocket.ammo -= 1;
    state.fireCooldown = spec.rate;
    state.recoil = 1;
    if (ctx.audio) ctx.audio.gunshot(state.weapon === 'smg' ? 'smg' : 'pistol');
    if (ctx.camera) {
      ctx.cameraCtl?.kick(state.weapon === 'smg' ? 0.06 : 0.14);
    }
    const muzzlePos = player.muzzleWorld();
    if (![muzzlePos.x, muzzlePos.y, muzzlePos.z, origin.x, origin.y, origin.z].every(Number.isFinite)) {
      window.__badShot = { muzzle: muzzlePos.toArray(), origin: origin.toArray() };
    }
    muzzle(muzzlePos.x, muzzlePos.y, muzzlePos.z);
    if (ctx.traffic) ctx.traffic.alarm(state.x, state.z, 34);
    if (ctx.police) {
      ctx.police.reportCrime('gunshot');
      ctx.police.addHeat?.(0.02);
    }
    const shots = state.weapon === 'smg' ? 1 : 1;
    for (let i = 0; i < shots; i++) {
      const spread = spec.spread;
      const direction = aimDir.clone();
      direction.x += (Math.random() - 0.5) * spread * 2;
      direction.y += (Math.random() - 0.5) * spread * 2;
      direction.z += (Math.random() - 0.5) * spread * 2;
      const hit = hitscan(origin, direction, spec.range, ctx);
      tracer(muzzlePos.x, muzzlePos.y, muzzlePos.z, hit.point.x, hit.point.y, hit.point.z, state.weapon === 'smg' ? 0xffd08a : 0xffe3a0);
      applyHit(hit, spec.damage, ctx, state.x, state.z);
    }
    if (pocket.ammo === 0) {
      if (ctx.hud) ctx.hud.toast('MAG EMPTY', 'warn');
      player.reload();
    }
    return true;
  }

  function update(dt, ctx) {
    activeCtx = ctx;
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.95;
      if (t.life <= 0) {
        scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        tracers.splice(i, 1);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life -= dt;
      f.mesh.material.opacity = Math.max(0, f.life / f.max);
      f.mesh.scale.setScalar(0.8 + (1 - f.life / f.max) * 0.5);
      if (f.life <= 0) {
        scene.remove(f.mesh);
        f.mesh.material.dispose();
        flashes.splice(i, 1);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.material.opacity = Math.max(0, s.life / s.max) * 0.8;
      if (s.life <= 0) {
        scene.remove(s.mesh);
        s.mesh.material.dispose();
        sparks.splice(i, 1);
      }
    }
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.life -= dt;
      const k = 1 - e.life / e.max;
      e.core.scale.setScalar(0.6 + k * e.radius * 0.7);
      e.core.material.opacity = Math.max(0, 0.95 - k * 1.4);
      e.core.position.y = 1.1 + k * 2.2;
      e.glow.scale.setScalar(e.radius * (2.2 + k * 1.4));
      e.glow.material.opacity = Math.max(0, 0.9 - k * 1.2);
      e.ring.scale.setScalar(1 + k * e.radius * 1.6);
      e.ring.material.opacity = Math.max(0, 0.8 - k * 1.6);
      for (const puff of e.smokes) {
        puff.position.x += puff.userData.vx * dt;
        puff.position.z += puff.userData.vz * dt;
        puff.position.y += puff.userData.vy * dt;
        puff.scale.setScalar(2 + k * e.radius * 0.6);
        puff.material.opacity = Math.max(0, 0.5 - k * 0.5);
      }
      if (e.life <= 0) {
        scene.remove(e.core, e.glow, e.ring, ...e.smokes);
        e.core.geometry.dispose();
        e.core.material.dispose();
        e.glow.material.dispose();
        e.ring.material.dispose();
        for (const puff of e.smokes) puff.material.dispose();
        explosions.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const list of [tracers, flashes, sparks]) {
      for (const item of list) {
        scene.remove(item.mesh);
        item.mesh.material?.dispose();
      }
      list.length = 0;
    }
    for (const e of explosions) {
      scene.remove(e.core, e.glow, e.ring, ...e.smokes);
    }
    explosions.length = 0;
  }

  return {
    tracer,
    muzzle,
    explodeAt,
    hitscan,
    playerAttack,
    applyHit,
    update,
    clear,
    get activeCtx() { return activeCtx; },
  };
}
