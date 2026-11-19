// The Palm Vista Police Department, and the people on the other side of the law. Wanted
// stars grow with heat from crimes, cruisers spawn off-screen and chase, officers deploy on
// foot, and the same actor code drives the gangsters missions throw at Rico. Everything is
// stylised: bullets are tracers, a takedown is a fall and a fade, no blood.
import * as THREE from 'three';
import { CARS, CITY, PALETTE, WANTED_LABELS } from './config.js';
import { TAU, clamp, damp, dist, headingTo, pick, rayBoxXZ, rng as makeRng, wrapAngle } from './math.js';
import { makeCarMesh } from './vehicles.js';

function buildActor(rng, kind) {
  const group = new THREE.Group();
  const cop = kind === 'cop';
  const shirt = new THREE.MeshStandardMaterial({ color: cop ? 0x2f4d7a : 0x4a2438, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: cop ? 0x1b2336 : 0x1a1a22, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(PALETTE.skin, rng), roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: cop ? 0x18243c : 0x2a1a22, roughness: 0.7 });
  const capMat = new THREE.MeshStandardMaterial({ color: cop ? 0x15203a : 0x6b1f35, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), shirt);
  torso.position.y = 1.2;
  torso.castShadow = true;
  group.add(torso);
  const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.35), vest);
  vestMesh.position.y = 1.22;
  group.add(vestMesh);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.3), pants);
  hips.position.y = 0.8;
  group.add(hips);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 9), skin);
  head.position.y = 1.76;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.12, 8), capMat);
  cap.position.y = 1.92;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), capMat);
  brim.position.set(0, 1.88, 0.18);
  group.add(brim);
  if (cop) {
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.8, roughness: 0.3 }));
    badge.position.set(-0.14, 1.38, 0.18);
    group.add(badge);
  } else {
    const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.12, 0.34), new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.8 }));
    bandana.position.y = 1.66;
    group.add(bandana);
  }
  const armL = new THREE.Group();
  armL.position.set(-0.32, 1.5, 0);
  const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.58, 0.17), shirt);
  armLMesh.position.y = -0.27;
  armL.add(armLMesh);
  group.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.32, 1.5, 0);
  const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.58, 0.17), shirt);
  armRMesh.position.y = -0.27;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skin);
  hand.position.y = -0.57;
  armR.add(armRMesh, hand);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.38), new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.4, metalness: 0.4 }));
  gun.position.set(0, -0.62, 0.2);
  armR.add(gun);
  group.add(armR);
  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.8, 0);
  const legLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), pants);
  legLMesh.position.y = -0.35;
  legL.add(legLMesh);
  group.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.8, 0);
  const legRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), pants);
  legRMesh.position.y = -0.35;
  legR.add(legRMesh);
  group.add(legR);
  return { group, armL, armR, legL, legR, gun };
}

export function createPoliceSystem(scene, city, vehicles) {
  const rng = makeRng(4242);
  const actors = [];
  const cruisers = [];
  let wanted = 0;
  let heat = 0;
  let evade = 0;
  let spawnTimer = 0;
  let lastShotHeat = 0;
  let bustTimer = 0;
  let policeCooldown = 0;
  let dispatchCooldown = 0;
  let cleared = true;
  const roadLines = [];
  for (let k = CITY.roadsFrom; k <= CITY.roadsTo; k++) roadLines.push(k * CITY.grid);

  function makeCruiser(x, z, heading) {
    const mesh = makeCarMesh('police', null, { police: true });
    mesh.group.position.set(x, 0.1, z);
    mesh.group.rotation.y = heading;
    scene.add(mesh.group);
    const car = {
      id: `pvd-${cruisers.length}-${Math.floor(rng() * 1e6)}`,
      kind: 'police',
      spec: CARS.police,
      mesh,
      group: mesh.group,
      x, z, heading,
      vx: 0, vz: 0, speed: 0, steer: 0,
      health: 150, maxHealth: 150,
      driver: 'police',
      parked: false,
      dead: false,
      police: true,
      gang: false,
      siren: true,
      wheelSpin: 0,
      throttle: 0,
      brake: 0,
      deployed: false,
      fireTimer: 1.5 + rng(),
      stuck: 0,
    };
    cruisers.push(car);
    return car;
  }

  function spawnCruiser(player) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = rng() * TAU;
      const distance = 44 + rng() * 45;
      let x = player.state.x + Math.cos(angle) * distance;
      let z = player.state.z + Math.sin(angle) * distance;
      x = Math.max(-230, Math.min(230, x));
      z = Math.max(-230, Math.min(230, z));
      const fixed = city.resolveCircle(x, z, 2);
      if (Math.hypot(fixed.x - x, fixed.z - z) > 1.5) continue;
      return makeCruiser(fixed.x, fixed.z, headingTo(player.state.x - fixed.x, player.state.z - fixed.z));
    }
    return makeCruiser(0, 0, 0);
  }

  function spawnActor(kind, x, z, homeX = x, homeZ = z) {
    const parts = buildActor(rng, kind);
    const fixed = city.resolveCircle(x, z, 0.4);
    const actor = {
      kind,
      x: fixed.x, z: fixed.z, y: 0.1,
      homeX, homeZ,
      heading: rng() * TAU,
      health: kind === 'cop' ? 80 : 70,
      maxHealth: kind === 'cop' ? 80 : 70,
      alive: true,
      dead: false,
      downTimer: 0,
      group: parts.group,
      parts,
      speed: 0,
      phase: rng() * TAU,
      fireTimer: 1.0 + rng() * 1.4,
      reaction: 0.4 + rng() * 0.5,
      id: `${kind}-${actors.length}-${Math.floor(rng() * 1e6)}`,
      removed: false,
    };
    parts.group.position.set(actor.x, actor.y, actor.z);
    scene.add(parts.group);
    actors.push(actor);
    return actor;
  }

  function deployCop(car) {
    car.deployed = true;
    const side = rng() < 0.5 ? 1 : -1;
    const rx = Math.cos(car.heading) * side;
    const rz = -Math.sin(car.heading) * side;
    const cop = spawnActor('cop', car.x + rx * 2.1, car.z + rz * 2.1, car.x, car.z);
    cop.fromCar = car;
  }

  function spawnGang(x, z, count = 3, onKilled = null) {
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rng() * 0.7;
      const r = 3 + rng() * 7;
      const gangster = spawnActor('gang', x + Math.cos(a) * r, z + Math.sin(a) * r, x, z);
      gangster.onKilled = onKilled;
      spawned.push(gangster);
    }
    return spawned;
  }

  function addHeat(amount, reason = '') {
    if (wanted >= 5) {
      heat = 0;
      return;
    }
    heat += amount;
    while (heat >= 1 && wanted < 5) {
      heat -= 1;
      wanted += 1;
      bustTimer = 0;
      dispatchCooldown = 0;
      if (api.ctx?.audio) api.ctx.audio.wantedUp();
      if (api.ctx?.hud) {
        api.ctx.hud.toast(WANTED_LABELS[wanted] ?? 'PVPD ALERT', 'wanted');
        api.ctx.hud.dialogue('DISPATCH', wanted >= 4 ? 'All units, suspect is armed. Take them down.' : 'Suspect heading through the Vista. Units responding.', 3.4);
      }
    }
    if (wanted >= 5) heat = 0;
    if (reason && api.ctx?.hud && wanted > 0) api.ctx.hud.setWanted(wanted, heat);
  }

  function reportCrime(kind) {
    if (kind === 'gunshot') {
      const now = performance.now();
      if (now - lastShotHeat < 480) return;
      lastShotHeat = now;
      addHeat(0.07, 'shot');
    } else if (kind === 'pedHit') addHeat(0.32, 'ped');
    else if (kind === 'pedKilled') addHeat(1.05, 'ped');
    else if (kind === 'copKilled') addHeat(2.0, 'cop');
    else if (kind === 'carJack') addHeat(0.3, 'car');
    else if (kind === 'reckless') addHeat(0.05, 'drive');
  }

  function hasLine(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    for (const box of city.collision) {
      const t = rayBoxXZ(ax, az, nx, nz, box.minX, box.maxX, box.minZ, box.maxZ);
      if (t > 0.8 && t < len - 0.8) return false;
    }
    return true;
  }

  function shoot(fromX, fromZ, fromY, targetX, targetY, targetZ, ctx, kind = 'cop', accuracy = 0.62) {
    if (ctx.combat) ctx.combat.tracer(fromX, fromY, fromZ, targetX, targetY, targetZ, kind === 'cop' ? 0x9fd0ff : 0xffb26b);
    if (ctx.audio) ctx.audio.gunshot('pistol');
    if (rng() < accuracy) {
      if (ctx.player.state.inCar && ctx.player.state.inCar.driver === 'player') {
        vehicles.damageCar(ctx.player.state.inCar, kind === 'cop' ? 7 : 9, ctx);
        if (ctx.player.damage) ctx.player.damage(kind === 'cop' ? 2.5 : 4);
      } else {
        ctx.player.damage(kind === 'cop' ? 7 : 8);
      }
      if (ctx.cameraCtl) ctx.cameraCtl.shake(0.16);
      if (ctx.audio) ctx.audio.damage();
    }
  }

  function updateActor(actor, dt, ctx) {
    if (actor.dead || !actor.alive) {
      actor.downTimer -= dt;
      if (actor.downTimer <= 0 && !actor.removed) {
        actor.removed = true;
        scene.remove(actor.group);
      }
      return;
    }
    const player = ctx.player;
    const px = player.state.x;
    const pz = player.state.z;
    const d = dist(actor.x, actor.z, px, pz);
    const hostile = actor.kind === 'gang' ? d < 62 : wanted > 0;
    let targetX = px;
    let targetZ = pz;
    if (!hostile) {
      targetX = actor.homeX + Math.cos(actor.phase) * 3;
      targetZ = actor.homeZ + Math.sin(actor.phase) * 3;
    }
    const dx = targetX - actor.x;
    const dz = targetZ - actor.z;
    const dd = Math.hypot(dx, dz) || 1;
    let moveSpeed = 0;
    if (hostile) {
      const stop = actor.kind === 'cop' ? 2.1 : 4.2;
      if (dd > stop) moveSpeed = actor.kind === 'cop' ? 4.3 : 4.8;
      if (dd > 3 && dd < stop) moveSpeed = 1.2;
      if (actor.kind === 'gang' && dd < 2.2) moveSpeed = 0;
    } else {
      moveSpeed = 0.7;
    }
    if (moveSpeed > 0) {
      const vx = (dx / dd) * moveSpeed;
      const vz = (dz / dd) * moveSpeed;
      actor.x += vx * dt;
      actor.z += vz * dt;
      const fixed = city.resolveCircle(actor.x, actor.z, 0.38);
      actor.x = fixed.x;
      actor.z = fixed.z;
      actor.heading = damp(wrapAngle(actor.heading), wrapAngle(Math.atan2(vx, vz)), 8, dt);
      actor.phase += dt * (3 + moveSpeed * 2);
      const swing = Math.sin(actor.phase) * 0.55 * clamp(moveSpeed / 2.5, 0.2, 1.4);
      actor.parts.legL.rotation.x = swing;
      actor.parts.legR.rotation.x = -swing;
    }
    actor.group.position.set(actor.x, actor.y, actor.z);
    actor.group.rotation.y = actor.heading;

    // Shoot when there is a clear line and a reason.
    actor.fireTimer -= dt;
    const canShoot = hostile && (actor.kind === 'gang' || wanted > 0) && d < 34 && d > 1.4;
    if (canShoot && actor.fireTimer <= 0 && hasLine(actor.x, actor.z, px, pz)) {
      actor.fireTimer = (actor.kind === 'cop' ? 1.35 : 1.0) + rng() * 0.5;
      actor.parts.armR.rotation.x = -1.5;
      shoot(actor.x, actor.z, 1.4, px, player.state.inCar ? 1.0 : 1.2, pz, ctx, actor.kind, actor.kind === 'cop' ? 0.55 : 0.62);
    } else if (hostile) {
      actor.parts.armR.rotation.x = damp(actor.parts.armR.rotation.x, -1.3, 5, dt);
    } else {
      actor.parts.armR.rotation.x = damp(actor.parts.armR.rotation.x, 0, 5, dt);
    }
  }

  function damageActor(actor, amount, ctx, fromX, fromZ) {
    if (!actor || actor.dead) return false;
    actor.health -= amount;
    actor.parts.armR.rotation.x = -1.4;
    if (actor.health <= 0) {
      actor.alive = false;
      actor.dead = true;
      actor.downTimer = actor.kind === 'gang' ? 12 : 15;
      actor.group.rotation.z = Math.PI / 2;
      actor.group.rotation.x = (rng() - 0.5) * 0.5;
      actor.group.position.y = 0.32;
      if (actor.kind === 'cop') {
        addHeat(1.8, 'copdown');
        if (ctx.hud) ctx.hud.toast('OFFICER DOWN', 'wanted');
      } else if (actor.onKilled) {
        actor.onKilled(actor);
      }
      if (ctx.player) ctx.player.state.recoil = 0.2;
      return true;
    }
    // A shove, not a gore effect.
    if (fromX !== undefined) {
      const dx = actor.x - fromX;
      const dz = actor.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      actor.x += (dx / len) * 0.35;
      actor.z += (dz / len) * 0.35;
    }
    return false;
  }

  function clearPolice(ctx) {
    for (const car of cruisers) {
      scene.remove(car.group);
    }
    cruisers.length = 0;
    for (const actor of actors) {
      if (actor.kind === 'cop') {
        scene.remove(actor.group);
        actor.removed = true;
      }
    }
    for (let i = actors.length - 1; i >= 0; i--) if (actors[i].removed) actors.splice(i, 1);
    cleared = true;
    if (ctx?.audio) ctx.audio.setSiren(false);
  }

  const api = {
    ctx: null,
    actors,
    cruisers,
    get wanted() { return wanted; },
    get heat() { return heat; },
    get evade() { return evade; },
    get bustTimer() { return bustTimer; },
    addHeat,
    reportCrime,
    spawnGang,
    damageActor,
    setWanted(n) {
      wanted = clamp(Math.round(n), 0, 5);
      heat = 0;
      if (wanted === 0) clearPolice(api.ctx);
    },
    update(dt, ctx) {
      api.ctx = ctx;
      if (ctx.audio) ctx.audio.setSiren(wanted > 0 && (cruisers.length > 0 || actors.some((a) => a.kind === 'cop' && a.alive)));
      if (wanted === 0 && cruisers.length === 0 && cleared) {
        for (const actor of actors) if (actor.kind === 'gang') updateActor(actor, dt, ctx);
        return;
      }
      policeCooldown -= dt;
      spawnTimer -= dt;
      if (wanted > 0) {
        const targetCount = Math.min(5, wanted + 1);
        if (cruisers.length < targetCount && spawnTimer <= 0) {
          spawnCruiser(ctx.player);
          spawnTimer = Math.max(1.6, 5.5 - wanted * 0.6);
        }
      }
      // Keep the chase populated with cruisers, and deploy officers when the player is on foot.
      for (const car of cruisers) {
        if (car.dead) continue;
        const px = ctx.player.state.x;
        const pz = ctx.player.state.z;
        const d = dist(car.x, car.z, px, pz);
        const desired = headingTo(px - car.x, pz - car.z);
        const diff = wrapAngle(desired - car.heading);
        const steer = clamp(diff * 1.8, -1, 1);
        const throttle = d > 14 ? 1 : d > 8 ? 0.45 : 0;
        const brake = d < 7;
        vehicles.drive(car, dt, { throttle, steer, brake }, {
          ...ctx,
          police: api,
          player: ctx.player,
          combat: ctx.combat,
          audio: ctx.audio,
          camera: ctx.camera,
        });
        car.fireTimer -= dt;
        if (wanted >= 2 && d < 32 && car.fireTimer <= 0) {
          car.fireTimer = 1.6 + rng() * 1.2;
          shoot(car.x, car.z, 1.2, px, 1.0, pz, ctx, 'cop', 0.38);
        }
        if (car.speed < 2.5 && d > 10) car.stuck += dt; else car.stuck = 0;
        if (car.stuck > 1.5) {
          car.heading += (rng() < 0.5 ? 1 : -1) * 1.2;
          car.stuck = 0;
        }
        if (!car.deployed && ctx.player.state.inCar === null && d < 18 && car.speed < 3) deployCop(car);
        if (car.dead) {
          if (ctx.combat) ctx.combat.explodeAt(car.x, 1.0, car.z, 7);
        }
      }
      for (const car of cruisers) {
        if (car.dead && car.health <= 0 && !car.exploded) {
          car.exploded = true;
          if (ctx.combat) ctx.combat.explodeAt(car.x, 1.0, car.z, 8);
          if (ctx.audio) ctx.audio.explosion();
          if (ctx.cameraCtl) ctx.cameraCtl.shake(1.2);
        }
      }
      if (wanted >= 2 && ctx.player.state.inCar === null && !actors.some((a) => a.kind === 'cop' && a.alive)) {
        if (spawnTimer <= 0) {
          const angle = rng() * TAU;
          spawnActor('cop', ctx.player.state.x + Math.cos(angle) * 32, ctx.player.state.z + Math.sin(angle) * 32);
          spawnTimer = 4;
        }
      }
      for (const actor of actors) updateActor(actor, dt, ctx);

      // Evading: no officer or cruiser near for long enough loses a star.
      let nearest = Infinity;
      for (const car of cruisers) if (!car.dead) nearest = Math.min(nearest, dist(car.x, car.z, ctx.player.state.x, ctx.player.state.z));
      for (const actor of actors) if (actor.alive && actor.kind === 'cop') nearest = Math.min(nearest, dist(actor.x, actor.z, ctx.player.state.x, ctx.player.state.z));
      if (wanted > 0) {
        if (nearest > 72) {
          evade += dt;
          if (evade > 20) {
            evade = 0;
            wanted = Math.max(0, wanted - 1);
            heat = 0;
            if (wanted === 0) {
              if (ctx.hud) ctx.hud.toast('YOU LOST THE COPS', 'good');
              clearPolice(ctx);
            } else {
              if (ctx.hud) ctx.hud.toast('HEAT DROPPING', 'good');
            }
          }
        } else {
          evade = 0;
        }
      }
      // Busted: an officer reaches a suspect on foot and holds them.
      if (ctx.player.state.inCar === null && wanted > 0) {
        let close = false;
        for (const actor of actors) {
          if (actor.alive && actor.kind === 'cop' && dist(actor.x, actor.z, ctx.player.state.x, ctx.player.state.z) < 2.8) close = true;
        }
        if (close) {
          bustTimer += dt;
          if (bustTimer > 2.1) {
            bustTimer = 0;
            ctx.onBusted?.();
          }
        } else bustTimer = Math.max(0, bustTimer - dt * 1.4);
      } else bustTimer = 0;

      // Clean up wrecks and old actors far away.
      for (let i = cruisers.length - 1; i >= 0; i--) {
        const car = cruisers[i];
        if ((car.dead && car.health <= 0 && dist(car.x, car.z, ctx.player.state.x, ctx.player.state.z) > 90) || dist(car.x, car.z, ctx.player.state.x, ctx.player.state.z) > 320) {
          scene.remove(car.group);
          cruisers.splice(i, 1);
        }
      }
      for (let i = actors.length - 1; i >= 0; i--) {
        const a = actors[i];
        if (a.removed) actors.splice(i, 1);
        else if (a.kind === 'cop' && wanted === 0 && !a.dead && dist(a.x, a.z, ctx.player.state.x, ctx.player.state.z) > 140) {
          scene.remove(a.group);
          a.removed = true;
          actors.splice(i, 1);
        }
      }
      if (wanted === 0 && cruisers.length === 0 && !actors.some((a) => a.kind === 'cop' && !a.removed)) cleared = true;
    },
    clearPolice,
    spawnCruiser,
    nearestOfficer(x, z) {
      let best = null;
      let bd = Infinity;
      for (const actor of actors) {
        if (!actor.alive || actor.kind !== 'cop') continue;
        const d = dist(actor.x, actor.z, x, z);
        if (d < bd) { bd = d; best = actor; }
      }
      return best;
    },
  };
  return api;
}
// recorded-session note: wanted escalation and pursuit logic are unchanged

