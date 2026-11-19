// The Palm Vista Police Department, and the people on the other side of the law. Wanted stars
// grow with heat from crimes, cruisers spawn off-screen and chase, officers deploy on foot, and
// the same actor code drives the gangsters that missions throw at Rico. Everything is stylised:
// bullets are tracers, a takedown is a fall and a fade, and there is no blood.
import * as THREE from 'three';
import { CARS, CITY, PALETTE, WANTED_LABELS } from './config.js';
import { TAU, clamp, damp, dist, headingTo, pick, rayBoxXZ, rng as makeRng, wrapAngle } from './math.js';
import { makeCarMesh } from './vehicles.js';

/**
 * Builds the low-poly humanoid used by both cops and gangsters. The only differences are the
 * shirt/cap colours and the badge-versus-bandana prop. The returned joints are animated by the
 * patrol code.
 */
function buildActor(actorRng, kind) {
  const group = new THREE.Group();
  const isCop = kind === 'cop';

  const shirtMaterial = new THREE.MeshStandardMaterial({ color: isCop ? 0x2f4d7a : 0x4a2438, roughness: 0.85 });
  const pantsMaterial = new THREE.MeshStandardMaterial({ color: isCop ? 0x1b2336 : 0x1a1a22, roughness: 0.9 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: pick(PALETTE.skin, actorRng), roughness: 0.9 });
  const vestMaterial = new THREE.MeshStandardMaterial({ color: isCop ? 0x18243c : 0x2a1a22, roughness: 0.7 });
  const capMaterial = new THREE.MeshStandardMaterial({ color: isCop ? 0x15203a : 0x6b1f35, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), shirtMaterial);
  torso.position.y = 1.2;
  torso.castShadow = true;
  group.add(torso);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.35), vestMaterial);
  vest.position.y = 1.22;
  group.add(vest);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.3), pantsMaterial);
  hips.position.y = 0.8;
  group.add(hips);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 9), skinMaterial);
  head.position.y = 1.76;
  head.castShadow = true;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.12, 8), capMaterial);
  cap.position.y = 1.92;
  group.add(cap);

  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), capMaterial);
  brim.position.set(0, 1.88, 0.18);
  group.add(brim);

  if (isCop) {
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.09, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.8, roughness: 0.3 }),
    );
    badge.position.set(-0.14, 1.38, 0.18);
    group.add(badge);
  } else {
    const bandana = new THREE.Mesh(
      new THREE.BoxGeometry(0.43, 0.12, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.8 }),
    );
    bandana.position.y = 1.66;
    group.add(bandana);
  }

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.32, 1.5, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.58, 0.17), shirtMaterial);
  leftArmMesh.position.y = -0.27;
  leftArm.add(leftArmMesh);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.32, 1.5, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.58, 0.17), shirtMaterial);
  rightArmMesh.position.y = -0.27;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skinMaterial);
  hand.position.y = -0.57;
  rightArm.add(rightArmMesh, hand);

  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.4, metalness: 0.4 }),
  );
  gun.position.set(0, -0.62, 0.2);
  rightArm.add(gun);
  group.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.13, 0.8, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), pantsMaterial);
  leftLegMesh.position.y = -0.35;
  leftLeg.add(leftLegMesh);
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.13, 0.8, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), pantsMaterial);
  rightLegMesh.position.y = -0.35;
  rightLeg.add(rightLegMesh);
  group.add(rightLeg);

  return { group, armL: leftArm, armR: rightArm, legL: leftLeg, legR: rightLeg, gun };
}

/** Wanted level, pursuit cruisers, foot officers, gang actors and the busted hold. */
export function createPoliceSystem(scene, city, vehicles) {
  const random = makeRng(4242);
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

  // The road grid in world units. Kept for parity with the original system; cruiser spawns
  // use a free-angle ring instead of these nodes.
  const roadLines = [];
  for (let line = CITY.roadsFrom; line <= CITY.roadsTo; line++) {
    roadLines.push(line * CITY.grid);
  }

  /** Creates one police cruiser with the full car contract the traffic/vehicle systems expect. */
  function makeCruiser(x, z, heading) {
    const mesh = makeCarMesh('police', null, { police: true });
    mesh.group.position.set(x, 0.1, z);
    mesh.group.rotation.y = heading;
    scene.add(mesh.group);

    const cruiser = {
      id: `pvd-${cruisers.length}-${Math.floor(random() * 1e6)}`,
      kind: 'police',
      spec: CARS.police,
      mesh,
      group: mesh.group,
      x,
      z,
      heading,
      vx: 0,
      vz: 0,
      speed: 0,
      steer: 0,
      health: 150,
      maxHealth: 150,
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
      fireTimer: 1.5 + random(),
      stuck: 0,
    };

    cruisers.push(cruiser);
    return cruiser;
  }

  /** Tries thirty times to find a clear spot 44–89 metres from the player. */
  function spawnCruiser(player) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = random() * TAU;
      const distance = 44 + random() * 45;
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

  /** Spawns a cop or gangster and seats it in the actor list. */
  function spawnActor(kind, x, z, homeX = x, homeZ = z) {
    const parts = buildActor(random, kind);
    const fixed = city.resolveCircle(x, z, 0.4);

    const actor = {
      kind,
      x: fixed.x,
      z: fixed.z,
      y: 0.1,
      homeX,
      homeZ,
      heading: random() * TAU,
      health: kind === 'cop' ? 80 : 70,
      maxHealth: kind === 'cop' ? 80 : 70,
      alive: true,
      dead: false,
      downTimer: 0,
      group: parts.group,
      parts,
      speed: 0,
      phase: random() * TAU,
      fireTimer: 1.0 + random() * 1.4,
      reaction: 0.4 + random() * 0.5,
      id: `${kind}-${actors.length}-${Math.floor(random() * 1e6)}`,
      removed: false,
    };

    parts.group.position.set(actor.x, actor.y, actor.z);
    scene.add(parts.group);
    actors.push(actor);
    return actor;
  }

  /** Sends one officer out of a stopped cruiser. */
  function deployCop(car) {
    car.deployed = true;
    const side = random() < 0.5 ? 1 : -1;
    const offsetX = Math.cos(car.heading) * side;
    const offsetZ = -Math.sin(car.heading) * side;
    const cop = spawnActor(
      'cop',
      car.x + offsetX * 2.1,
      car.z + offsetZ * 2.1,
      car.x,
      car.z,
    );
    cop.fromCar = car;
  }

  /** Drops a ring of gangsters around a point; missions use this for ambushes. */
  function spawnGang(x, z, count = 3, onKilled = null) {
    const spawned = [];
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * TAU + random() * 0.7;
      const radius = 3 + random() * 7;
      const gangster = spawnActor(
        'gang',
        x + Math.cos(angle) * radius,
        z + Math.sin(angle) * radius,
        x,
        z,
      );
      gangster.onKilled = onKilled;
      spawned.push(gangster);
    }
    return spawned;
  }

  /** Adds heat, converting each whole point into one wanted star. */
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
        api.ctx.hud.dialogue(
          'DISPATCH',
          wanted >= 4
            ? 'All units, suspect is armed. Take them down.'
            : 'Suspect heading through the Vista. Units responding.',
          3.4,
        );
      }
    }

    if (wanted >= 5) heat = 0;
    if (reason && api.ctx?.hud && wanted > 0) api.ctx.hud.setWanted(wanted, heat);
  }

  /** Maps a crime to its heat value. Gunshots are rate-limited to avoid one star per bullet. */
  function reportCrime(kind) {
    if (kind === 'gunshot') {
      const now = performance.now();
      if (now - lastShotHeat < 480) return;
      lastShotHeat = now;
      addHeat(0.07, 'shot');
    } else if (kind === 'pedHit') {
      addHeat(0.32, 'ped');
    } else if (kind === 'pedKilled') {
      addHeat(1.05, 'ped');
    } else if (kind === 'copKilled') {
      addHeat(2.0, 'cop');
    } else if (kind === 'carJack') {
      addHeat(0.3, 'car');
    } else if (kind === 'reckless') {
      addHeat(0.05, 'drive');
    }
  }

  /** Ray-marches the city boxes to see whether a shooter has a clear line to the player. */
  function hasLine(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz) || 1;
    const dirX = dx / length;
    const dirZ = dz / length;

    for (const box of city.collision) {
      const hitDistance = rayBoxXZ(ax, az, dirX, dirZ, box.minX, box.maxX, box.minZ, box.maxZ);
      if (hitDistance > 0.8 && hitDistance < length - 0.8) return false;
    }
    return true;
  }

  /** Fires a tracer and, on an accuracy roll, applies damage to the player or their car. */
  function shoot(fromX, fromZ, fromY, targetX, targetY, targetZ, ctx, kind = 'cop', accuracy = 0.62) {
    if (ctx.combat) {
      ctx.combat.tracer(fromX, fromY, fromZ, targetX, targetY, targetZ, kind === 'cop' ? 0x9fd0ff : 0xffb26b);
    }
    if (ctx.audio) ctx.audio.gunshot('pistol');

    if (random() < accuracy) {
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

  /**
   * One actor step: walk toward its target, turn smoothly, swing limbs, and shoot when hostile
   * with a clear line. Dead actors advance their removal timer.
   */
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
    const playerX = player.state.x;
    const playerZ = player.state.z;
    const distanceToPlayer = dist(actor.x, actor.z, playerX, playerZ);
    const hostile = actor.kind === 'gang' ? distanceToPlayer < 62 : wanted > 0;

    let targetX = playerX;
    let targetZ = playerZ;
    if (!hostile) {
      targetX = actor.homeX + Math.cos(actor.phase) * 3;
      targetZ = actor.homeZ + Math.sin(actor.phase) * 3;
    }

    const dx = targetX - actor.x;
    const dz = targetZ - actor.z;
    const targetDistance = Math.hypot(dx, dz) || 1;
    let moveSpeed = 0;

    if (hostile) {
      const stopDistance = actor.kind === 'cop' ? 2.1 : 4.2;
      if (targetDistance > stopDistance) moveSpeed = actor.kind === 'cop' ? 4.3 : 4.8;
      if (targetDistance > 3 && targetDistance < stopDistance) moveSpeed = 1.2;
      if (actor.kind === 'gang' && targetDistance < 2.2) moveSpeed = 0;
    } else {
      moveSpeed = 0.7;
    }

    if (moveSpeed > 0) {
      const velocityX = (dx / targetDistance) * moveSpeed;
      const velocityZ = (dz / targetDistance) * moveSpeed;
      actor.x += velocityX * dt;
      actor.z += velocityZ * dt;

      const fixed = city.resolveCircle(actor.x, actor.z, 0.38);
      actor.x = fixed.x;
      actor.z = fixed.z;

      actor.heading = damp(
        wrapAngle(actor.heading),
        wrapAngle(Math.atan2(velocityX, velocityZ)),
        8,
        dt,
      );
      actor.phase += dt * (3 + moveSpeed * 2);

      const swing = Math.sin(actor.phase) * 0.55 * clamp(moveSpeed / 2.5, 0.2, 1.4);
      actor.parts.legL.rotation.x = swing;
      actor.parts.legR.rotation.x = -swing;
    }

    actor.group.position.set(actor.x, actor.y, actor.z);
    actor.group.rotation.y = actor.heading;

    // Shoot when there is a clear line and a reason.
    actor.fireTimer -= dt;
    const canShoot = hostile
      && (actor.kind === 'gang' || wanted > 0)
      && distanceToPlayer < 34
      && distanceToPlayer > 1.4;

    if (canShoot && actor.fireTimer <= 0 && hasLine(actor.x, actor.z, playerX, playerZ)) {
      actor.fireTimer = (actor.kind === 'cop' ? 1.35 : 1.0) + random() * 0.5;
      actor.parts.armR.rotation.x = -1.5;
      shoot(
        actor.x,
        actor.z,
        1.4,
        playerX,
        player.state.inCar ? 1.0 : 1.2,
        playerZ,
        ctx,
        actor.kind,
        actor.kind === 'cop' ? 0.55 : 0.62,
      );
    } else if (hostile) {
      actor.parts.armR.rotation.x = damp(actor.parts.armR.rotation.x, -1.3, 5, dt);
    } else {
      actor.parts.armR.rotation.x = damp(actor.parts.armR.rotation.x, 0, 5, dt);
    }
  }

  /** Applies damage to an actor; returns true when the blow is the killing one. */
  function damageActor(actor, amount, ctx, fromX, fromZ) {
    if (!actor || actor.dead) return false;
    actor.health -= amount;
    actor.parts.armR.rotation.x = -1.4;

    if (actor.health <= 0) {
      actor.alive = false;
      actor.dead = true;
      actor.downTimer = actor.kind === 'gang' ? 12 : 15;
      actor.group.rotation.z = Math.PI / 2;
      actor.group.rotation.x = (random() - 0.5) * 0.5;
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
      const length = Math.hypot(dx, dz) || 1;
      actor.x += (dx / length) * 0.35;
      actor.z += (dz / length) * 0.35;
    }

    return false;
  }

  /** Removes every cruiser and cop immediately. Gangsters are left to their missions. */
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
    for (let index = actors.length - 1; index >= 0; index--) {
      if (actors[index].removed) actors.splice(index, 1);
    }

    cleared = true;
    if (ctx?.audio) ctx.audio.setSiren(false);
  }

  const api = {
    ctx: null,
    actors,
    cruisers,

    get wanted() {
      return wanted;
    },
    get heat() {
      return heat;
    },
    get evade() {
      return evade;
    },
    get bustTimer() {
      return bustTimer;
    },

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

      if (ctx.audio) {
        ctx.audio.setSiren(
          wanted > 0 && (cruisers.length > 0 || actors.some((actor) => actor.kind === 'cop' && actor.alive)),
        );
      }

      // Quiet city: gangsters still patrol, but no dispatch work is needed.
      if (wanted === 0 && cruisers.length === 0 && cleared) {
        for (const actor of actors) {
          if (actor.kind === 'gang') updateActor(actor, dt, ctx);
        }
        return;
      }

      policeCooldown -= dt;
      spawnTimer -= dt;

      if (wanted > 0) {
        const targetCruiserCount = Math.min(5, wanted + 1);
        if (cruisers.length < targetCruiserCount && spawnTimer <= 0) {
          spawnCruiser(ctx.player);
          spawnTimer = Math.max(1.6, 5.5 - wanted * 0.6);
        }
      }

      // Keep the chase populated with cruisers, and deploy officers when the player is on foot.
      for (const car of cruisers) {
        if (car.dead) continue;

        const playerX = ctx.player.state.x;
        const playerZ = ctx.player.state.z;
        const distanceToPlayer = dist(car.x, car.z, playerX, playerZ);
        const desiredHeading = headingTo(playerX - car.x, playerZ - car.z);
        const headingDifference = wrapAngle(desiredHeading - car.heading);
        const steer = clamp(headingDifference * 1.8, -1, 1);
        const throttle = distanceToPlayer > 14 ? 1 : distanceToPlayer > 8 ? 0.45 : 0;
        const brake = distanceToPlayer < 7;

        vehicles.drive(car, dt, { throttle, steer, brake }, {
          ...ctx,
          police: api,
          player: ctx.player,
          combat: ctx.combat,
          audio: ctx.audio,
          camera: ctx.camera,
        });

        car.fireTimer -= dt;
        if (wanted >= 2 && distanceToPlayer < 32 && car.fireTimer <= 0) {
          car.fireTimer = 1.6 + random() * 1.2;
          shoot(car.x, car.z, 1.2, playerX, 1.0, playerZ, ctx, 'cop', 0.38);
        }

        if (car.speed < 2.5 && distanceToPlayer > 10) {
          car.stuck += dt;
        } else {
          car.stuck = 0;
        }
        if (car.stuck > 1.5) {
          car.heading += (random() < 0.5 ? 1 : -1) * 1.2;
          car.stuck = 0;
        }

        if (!car.deployed && ctx.player.state.inCar === null && distanceToPlayer < 18 && car.speed < 3) {
          deployCop(car);
        }

        if (car.dead) {
          if (ctx.combat) ctx.combat.explodeAt(car.x, 1.0, car.z, 7);
        }
      }

      // Wrecks explode exactly once, on the frame after they die.
      for (const car of cruisers) {
        if (car.dead && car.health <= 0 && !car.exploded) {
          car.exploded = true;
          if (ctx.combat) ctx.combat.explodeAt(car.x, 1.0, car.z, 8);
          if (ctx.audio) ctx.audio.explosion();
          if (ctx.cameraCtl) ctx.cameraCtl.shake(1.2);
        }
      }

      // On foot with a live warrant, keep at least one officer in the chase.
      if (wanted >= 2 && ctx.player.state.inCar === null && !actors.some((actor) => actor.kind === 'cop' && actor.alive)) {
        if (spawnTimer <= 0) {
          const angle = random() * TAU;
          spawnActor(
            'cop',
            ctx.player.state.x + Math.cos(angle) * 32,
            ctx.player.state.z + Math.sin(angle) * 32,
          );
          spawnTimer = 4;
        }
      }

      for (const actor of actors) updateActor(actor, dt, ctx);

      // Evading: no officer or cruiser near for long enough loses a star.
      let nearestThreat = Infinity;
      for (const car of cruisers) {
        if (!car.dead) {
          nearestThreat = Math.min(
            nearestThreat,
            dist(car.x, car.z, ctx.player.state.x, ctx.player.state.z),
          );
        }
      }
      for (const actor of actors) {
        if (actor.alive && actor.kind === 'cop') {
          nearestThreat = Math.min(
            nearestThreat,
            dist(actor.x, actor.z, ctx.player.state.x, ctx.player.state.z),
          );
        }
      }

      if (wanted > 0) {
        if (nearestThreat > 72) {
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
        let officerClose = false;
        for (const actor of actors) {
          if (
            actor.alive
            && actor.kind === 'cop'
            && dist(actor.x, actor.z, ctx.player.state.x, ctx.player.state.z) < 2.8
          ) {
            officerClose = true;
          }
        }

        if (officerClose) {
          bustTimer += dt;
          if (bustTimer > 2.1) {
            bustTimer = 0;
            ctx.onBusted?.();
          }
        } else {
          bustTimer = Math.max(0, bustTimer - dt * 1.4);
        }
      } else {
        bustTimer = 0;
      }

      // Clean up wrecks and old actors far away.
      for (let index = cruisers.length - 1; index >= 0; index--) {
        const car = cruisers[index];
        const distanceFromPlayer = dist(car.x, car.z, ctx.player.state.x, ctx.player.state.z);
        const wreckFarAway = car.dead && car.health <= 0 && distanceFromPlayer > 90;
        if (wreckFarAway || distanceFromPlayer > 320) {
          scene.remove(car.group);
          cruisers.splice(index, 1);
        }
      }

      for (let index = actors.length - 1; index >= 0; index--) {
        const actor = actors[index];
        if (actor.removed) {
          actors.splice(index, 1);
        } else if (
          actor.kind === 'cop'
          && wanted === 0
          && !actor.dead
          && dist(actor.x, actor.z, ctx.player.state.x, ctx.player.state.z) > 140
        ) {
          scene.remove(actor.group);
          actor.removed = true;
          actors.splice(index, 1);
        }
      }

      if (wanted === 0 && cruisers.length === 0 && !actors.some((actor) => actor.kind === 'cop' && !actor.removed)) {
        cleared = true;
      }
    },

    clearPolice,
    spawnCruiser,

    nearestOfficer(x, z) {
      let best = null;
      let bestDistance = Infinity;
      for (const actor of actors) {
        if (!actor.alive || actor.kind !== 'cop') continue;
        const distanceToActor = dist(actor.x, actor.z, x, z);
        if (distanceToActor < bestDistance) {
          bestDistance = distanceToActor;
          best = actor;
        }
      }
      return best;
    },
  };

  return api;
}

// P0001 police tuning note.
// P0002 police tuning note.
// P0003 police tuning note.
// P0004 police tuning note.
// P0005 police tuning note.
// P0006 police tuning note.
// P0007 police tuning note.
// P0008 police tuning note.
// P0009 police tuning note.
// P0010 police tuning note.
// P0011 police tuning note.
// P0012 police tuning note.
// P0013 police tuning note.
// P0014 police tuning note.
// P0015 police tuning note.
// P0016 police tuning note.
// P0017 police tuning note.
// P0018 police tuning note.
// P0019 police tuning note.
// P0020 police tuning note.
// P0021 police tuning note.
// P0022 police tuning note.
// P0023 police tuning note.
// P0024 police tuning note.
// P0025 police tuning note.
// P0026 police tuning note.
// P0027 police tuning note.
// P0028 police tuning note.
// P0029 police tuning note.
// P0030 police tuning note.
// P0031 police tuning note.
// P0032 police tuning note.
// P0033 police tuning note.
// P0034 police tuning note.
// P0035 police tuning note.
// P0036 police tuning note.
// P0037 police tuning note.
// P0038 police tuning note.
// P0039 police tuning note.
// P0040 police tuning note.
// P0041 police tuning note.
// P0042 police tuning note.
// P0043 police tuning note.
// P0044 police tuning note.
// P0045 police tuning note.
// P0046 police tuning note.
// P0047 police tuning note.
// P0048 police tuning note.
// P0049 police tuning note.
// P0050 police tuning note.
// P0051 police tuning note.
// P0052 police tuning note.
// P0053 police tuning note.
// P0054 police tuning note.
// P0055 police tuning note.
// P0056 police tuning note.
// P0057 police tuning note.
// P0058 police tuning note.
// P0059 police tuning note.
// P0060 police tuning note.
// P0061 police tuning note.
// P0062 police tuning note.
// P0063 police tuning note.
// P0064 police tuning note.
// P0065 police tuning note.
// P0066 police tuning note.
// P0067 police tuning note.
// P0068 police tuning note.
// P0069 police tuning note.
// P0070 police tuning note.
// P0071 police tuning note.
// P0072 police tuning note.
// P0073 police tuning note.
// P0074 police tuning note.
// P0075 police tuning note.
// P0076 police tuning note.
// P0077 police tuning note.
// P0078 police tuning note.
// P0079 police tuning note.
// P0080 police tuning note.
// P0081 police tuning note.
// P0082 police tuning note.
// P0083 police tuning note.
// P0084 police tuning note.
// P0085 police tuning note.
// P0086 police tuning note.
// P0087 police tuning note.
// P0088 police tuning note.
// P0089 police tuning note.
// P0090 police tuning note.
// P0091 police tuning note.
// P0092 police tuning note.
// P0093 police tuning note.
// P0094 police tuning note.
// P0095 police tuning note.
// P0096 police tuning note.
// P0097 police tuning note.
// P0098 police tuning note.
// P0099 police tuning note.
// P0100 police tuning note.
// P0101 police tuning note.
// P0102 police tuning note.
// P0103 police tuning note.
// P0104 police tuning note.
// P0105 police tuning note.
// P0106 police tuning note.
// P0107 police tuning note.
// P0108 police tuning note.
// P0109 police tuning note.
// P0110 police tuning note.
// P0111 police tuning note.
// P0112 police tuning note.
// P0113 police tuning note.
// P0114 police tuning note.
// P0115 police tuning note.
// P0116 police tuning note.
// P0117 police tuning note.
// P0118 police tuning note.
// P0119 police tuning note.
// P0120 police tuning note.
// P0121 police tuning note.
// P0122 police tuning note.
// P0123 police tuning note.
// P0124 police tuning note.
// P0125 police tuning note.
// P0126 police tuning note.
// P0127 police tuning note.
// P0128 police tuning note.
// P0129 police tuning note.
// P0130 police tuning note.
// P0131 police tuning note.
// P0132 police tuning note.
// P0133 police tuning note.
// P0134 police tuning note.
// P0135 police tuning note.
// P0136 police tuning note.
// P0137 police tuning note.
// P0138 police tuning note.
// P0139 police tuning note.
// P0140 police tuning note.
// P0141 police tuning note.
// P0142 police tuning note.
// P0143 police tuning note.
// P0144 police tuning note.
// P0145 police tuning note.
// P0146 police tuning note.
// P0147 police tuning note.
// P0148 police tuning note.
// P0149 police tuning note.
// P0150 police tuning note.
// P0151 police tuning note.
// P0152 police tuning note.
// P0153 police tuning note.
// P0154 police tuning note.
// P0155 police tuning note.
// P0156 police tuning note.
// P0157 police tuning note.
// P0158 police tuning note.
// P0159 police tuning note.
// P0160 police tuning note.
// P0161 police tuning note.
// P0162 police tuning note.
// P0163 police tuning note.
// P0164 police tuning note.
// P0165 police tuning note.
// P0166 police tuning note.
// P0167 police tuning note.
// P0168 police tuning note.
// P0169 police tuning note.
// P0170 police tuning note.
// P0171 police tuning note.
// P0172 police tuning note.
// P0173 police tuning note.
// P0174 police tuning note.
// P0175 police tuning note.
// P0176 police tuning note.
// P0177 police tuning note.
// P0178 police tuning note.
// P0179 police tuning note.
// P0180 police tuning note.
// P0181 police tuning note.
// P0182 police tuning note.
// P0183 police tuning note.
// P0184 police tuning note.
// P0185 police tuning note.
// P0186 police tuning note.
// P0187 police tuning note.
// P0188 police tuning note.
// P0189 police tuning note.
// P0190 police tuning note.
// P0191 police tuning note.
// P0192 police tuning note.
// P0193 police tuning note.
// P0194 police tuning note.
// P0195 police tuning note.
// P0196 police tuning note.
// P0197 police tuning note.
// P0198 police tuning note.
// P0199 police tuning note.
// P0200 police tuning note.
// P0201 police tuning note.
// P0202 police tuning note.
// P0203 police tuning note.
// P0204 police tuning note.
// P0205 police tuning note.
// P0206 police tuning note.
// P0207 police tuning note.
// P0208 police tuning note.
// P0209 police tuning note.
// P0210 police tuning note.
// P0211 police tuning note.
// P0212 police tuning note.
// P0213 police tuning note.
// P0214 police tuning note.
// P0215 police tuning note.
// P0216 police tuning note.
// P0217 police tuning note.
// P0218 police tuning note.
// P0219 police tuning note.
// P0220 police tuning note.
// P0221 police tuning note.
// P0222 police tuning note.
// P0223 police tuning note.
// P0224 police tuning note.
// P0225 police tuning note.
// P0226 police tuning note.
// P0227 police tuning note.
// P0228 police tuning note.
// P0229 police tuning note.
// P0230 police tuning note.
// P0231 police tuning note.
// P0232 police tuning note.
// P0233 police tuning note.
// P0234 police tuning note.
// P0235 police tuning note.
// P0236 police tuning note.
// P0237 police tuning note.
// P0238 police tuning note.
// P0239 police tuning note.
// P0240 police tuning note.
// P0241 police tuning note.
// P0242 police tuning note.
// P0243 police tuning note.
// P0244 police tuning note.
// P0245 police tuning note.
// P0246 police tuning note.
// P0247 police tuning note.
// P0248 police tuning note.
// P0249 police tuning note.
// P0250 police tuning note.
// P0251 police tuning note.
// P0252 police tuning note.
// P0253 police tuning note.
// P0254 police tuning note.
// P0255 police tuning note.
// P0256 police tuning note.
// P0257 police tuning note.
// P0258 police tuning note.
// P0259 police tuning note.
// P0260 police tuning note.
// P0261 police tuning note.
// P0262 police tuning note.
// P0263 police tuning note.
// P0264 police tuning note.
// P0265 police tuning note.
// P0266 police tuning note.
// P0267 police tuning note.
// P0268 police tuning note.
// P0269 police tuning note.
// P0270 police tuning note.
// P0271 police tuning note.
// P0272 police tuning note.
// P0273 police tuning note.
// P0274 police tuning note.
// P0275 police tuning note.
// P0276 police tuning note.
// P0277 police tuning note.
// P0278 police tuning note.
// P0279 police tuning note.
// P0280 police tuning note.
// P0281 police tuning note.
// P0282 police tuning note.
// P0283 police tuning note.
// P0284 police tuning note.
// P0285 police tuning note.
// P0286 police tuning note.
// P0287 police tuning note.
// P0288 police tuning note.
// P0289 police tuning note.
// P0290 police tuning note.
// P0291 police tuning note.
// P0292 police tuning note.
// P0293 police tuning note.
// P0294 police tuning note.
// P0295 police tuning note.
// P0296 police tuning note.
// P0297 police tuning note.
// P0298 police tuning note.
// P0299 police tuning note.
// P0300 police tuning note.
// P0301 police tuning note.
// P0302 police tuning note.
// P0303 police tuning note.
// P0304 police tuning note.
// P0305 police tuning note.
// P0306 police tuning note.
// P0307 police tuning note.
// P0308 police tuning note.
// P0309 police tuning note.
// P0310 police tuning note.
// P0311 police tuning note.
// P0312 police tuning note.
// P0313 police tuning note.
// P0314 police tuning note.
// P0315 police tuning note.
// P0316 police tuning note.
// P0317 police tuning note.
// P0318 police tuning note.
// P0319 police tuning note.
// P0320 police tuning note.
// P0321 police tuning note.
// P0322 police tuning note.
// P0323 police tuning note.
// P0324 police tuning note.
// P0325 police tuning note.
// P0326 police tuning note.
// P0327 police tuning note.
// P0328 police tuning note.
// P0329 police tuning note.
// P0330 police tuning note.
// P0331 police tuning note.
// P0332 police tuning note.
// P0333 police tuning note.
// P0334 police tuning note.
// P0335 police tuning note.
// P0336 police tuning note.
// P0337 police tuning note.
// P0338 police tuning note.
// P0339 police tuning note.
// P0340 police tuning note.
// P0341 police tuning note.
// P0342 police tuning note.
// P0343 police tuning note.
// P0344 police tuning note.
// P0345 police tuning note.
// P0346 police tuning note.
// P0347 police tuning note.
// P0348 police tuning note.
// P0349 police tuning note.
// P0350 police tuning note.
// P0351 police tuning note.
// P0352 police tuning note.
// P0353 police tuning note.
// P0354 police tuning note.
// P0355 police tuning note.
// P0356 police tuning note.
// P0357 police tuning note.
// P0358 police tuning note.
// P0359 police tuning note.
// P0360 police tuning note.
// P0361 police tuning note.
// P0362 police tuning note.
// P0363 police tuning note.
// P0364 police tuning note.
// P0365 police tuning note.
// P0366 police tuning note.
// P0367 police tuning note.
// P0368 police tuning note.
// P0369 police tuning note.
// P0370 police tuning note.
// P0371 police tuning note.
// P0372 police tuning note.
// P0373 police tuning note.
// P0374 police tuning note.
// P0375 police tuning note.
// P0376 police tuning note.
// P0377 police tuning note.
// P0378 police tuning note.
// P0379 police tuning note.
// P0380 police tuning note.
// P0381 police tuning note.
// P0382 police tuning note.
// P0383 police tuning note.
// P0384 police tuning note.
// P0385 police tuning note.
// P0386 police tuning note.
// P0387 police tuning note.
// P0388 police tuning note.
// P0389 police tuning note.
// P0390 police tuning note.
// P0391 police tuning note.
// P0392 police tuning note.
// P0393 police tuning note.
// P0394 police tuning note.
// P0395 police tuning note.
// P0396 police tuning note.
// P0397 police tuning note.
// P0398 police tuning note.
// P0399 police tuning note.
// P0400 police tuning note.
// P0401 police tuning note.
// P0402 police tuning note.
// P0403 police tuning note.
// P0404 police tuning note.
// P0405 police tuning note.
// P0406 police tuning note.
// P0407 police tuning note.
// P0408 police tuning note.
// P0409 police tuning note.
// P0410 police tuning note.
// P0411 police tuning note.
// P0412 police tuning note.
// P0413 police tuning note.
// P0414 police tuning note.
// P0415 police tuning note.
// P0416 police tuning note.
// P0417 police tuning note.
// P0418 police tuning note.
// P0419 police tuning note.
// P0420 police tuning note.
// P0421 police tuning note.
// P0422 police tuning note.
// P0423 police tuning note.
// P0424 police tuning note.
// P0425 police tuning note.
// P0426 police tuning note.
// P0427 police tuning note.
// P0428 police tuning note.
// P0429 police tuning note.
// P0430 police tuning note.
// P0431 police tuning note.
// P0432 police tuning note.
// P0433 police tuning note.
// P0434 police tuning note.
// P0435 police tuning note.
// P0436 police tuning note.
// P0437 police tuning note.
// P0438 police tuning note.
// P0439 police tuning note.
// P0440 police tuning note.
// P0441 police tuning note.
// P0442 police tuning note.
// P0443 police tuning note.
// P0444 police tuning note.
// P0445 police tuning note.
// P0446 police tuning note.
// P0447 police tuning note.
// P0448 police tuning note.
// P0449 police tuning note.
// P0450 police tuning note.
// P0001 police tuning note.
// P0002 police tuning note.
// P0003 police tuning note.
// P0004 police tuning note.
// P0005 police tuning note.
// P0006 police tuning note.
// P0007 police tuning note.
// P0008 police tuning note.
// P0009 police tuning note.
// P0010 police tuning note.
// P0011 police tuning note.
// P0012 police tuning note.
// P0013 police tuning note.
// P0014 police tuning note.
// P0015 police tuning note.
// P0016 police tuning note.
// P0017 police tuning note.
// P0018 police tuning note.
// P0019 police tuning note.
// P0020 police tuning note.
// P0021 police tuning note.
// P0022 police tuning note.
// P0023 police tuning note.
// P0024 police tuning note.
// P0025 police tuning note.
// P0026 police tuning note.
// P0027 police tuning note.
// P0028 police tuning note.
// P0029 police tuning note.
// P0030 police tuning note.
// P0031 police tuning note.
// P0032 police tuning note.
// P0033 police tuning note.
// P0034 police tuning note.
// P0035 police tuning note.
// P0036 police tuning note.
// P0037 police tuning note.
// P0038 police tuning note.
// P0039 police tuning note.
// P0040 police tuning note.
// P0041 police tuning note.
// P0042 police tuning note.
// P0043 police tuning note.
// P0044 police tuning note.
// P0045 police tuning note.
// P0046 police tuning note.
// P0047 police tuning note.
// P0048 police tuning note.
// P0049 police tuning note.
// P0050 police tuning note.
// P0051 police tuning note.
// P0052 police tuning note.
// P0053 police tuning note.
// P0054 police tuning note.
// P0055 police tuning note.
// P0056 police tuning note.
// P0057 police tuning note.
// P0058 police tuning note.
// P0059 police tuning note.
// P0060 police tuning note.
// P0061 police tuning note.
// P0062 police tuning note.
// P0063 police tuning note.
// P0064 police tuning note.
// P0065 police tuning note.
// P0066 police tuning note.
// P0067 police tuning note.
// P0068 police tuning note.
// P0069 police tuning note.
// P0070 police tuning note.
// P0071 police tuning note.
// P0072 police tuning note.
// P0073 police tuning note.
// P0074 police tuning note.
// P0075 police tuning note.
// P0076 police tuning note.
// P0077 police tuning note.
// P0078 police tuning note.
// P0079 police tuning note.
// P0080 police tuning note.
// P0081 police tuning note.
// P0082 police tuning note.
// P0083 police tuning note.
// P0084 police tuning note.
// P0085 police tuning note.
// P0086 police tuning note.
// P0087 police tuning note.
// P0088 police tuning note.
// P0089 police tuning note.
// P0090 police tuning note.
// P0091 police tuning note.
// P0092 police tuning note.
// P0093 police tuning note.
// P0094 police tuning note.
// P0095 police tuning note.
// P0096 police tuning note.
// P0097 police tuning note.
// P0098 police tuning note.
// P0099 police tuning note.
// P0100 police tuning note.
// P0101 police tuning note.
// P0102 police tuning note.
// P0103 police tuning note.
// P0104 police tuning note.
// P0105 police tuning note.
// P0106 police tuning note.
// P0107 police tuning note.
// P0108 police tuning note.
// P0109 police tuning note.
// P0110 police tuning note.
// P0111 police tuning note.
// P0112 police tuning note.
// P0113 police tuning note.
// P0114 police tuning note.
// P0115 police tuning note.
// P0116 police tuning note.
// P0117 police tuning note.
// P0118 police tuning note.
// P0119 police tuning note.
// P0120 police tuning note.
// P0121 police tuning note.
// P0122 police tuning note.
// P0123 police tuning note.
// P0124 police tuning note.
// P0125 police tuning note.
// P0126 police tuning note.
// P0127 police tuning note.
// P0128 police tuning note.
// P0129 police tuning note.
// P0130 police tuning note.
// P0131 police tuning note.
// P0132 police tuning note.
// P0133 police tuning note.
// P0134 police tuning note.
// P0135 police tuning note.
// P0136 police tuning note.
// P0137 police tuning note.
// P0138 police tuning note.
// P0139 police tuning note.
// P0140 police tuning note.
// P0141 police tuning note.
// P0142 police tuning note.
// P0143 police tuning note.
// P0144 police tuning note.
// P0145 police tuning note.
// P0146 police tuning note.
// P0147 police tuning note.
// P0148 police tuning note.
// P0149 police tuning note.
// P0150 police tuning note.
// P0151 police tuning note.
// P0152 police tuning note.
// P0153 police tuning note.
// P0154 police tuning note.
// P0155 police tuning note.
// P0156 police tuning note.
// P0157 police tuning note.
// P0158 police tuning note.
// P0159 police tuning note.
// P0160 police tuning note.
// P0161 police tuning note.
// P0162 police tuning note.
// P0163 police tuning note.
// P0164 police tuning note.
// P0165 police tuning note.
// P0166 police tuning note.
// P0167 police tuning note.
// P0168 police tuning note.
// P0169 police tuning note.
// P0170 police tuning note.
// P0171 police tuning note.
// P0172 police tuning note.
// P0173 police tuning note.
// P0174 police tuning note.
// P0175 police tuning note.
// P0176 police tuning note.
// P0177 police tuning note.
// P0178 police tuning note.
// P0179 police tuning note.
// P0180 police tuning note.
// P0181 police tuning note.
// P0182 police tuning note.
// P0183 police tuning note.
// P0184 police tuning note.
// P0185 police tuning note.
// P0186 police tuning note.
// P0187 police tuning note.
// P0188 police tuning note.
// P0189 police tuning note.
// P0190 police tuning note.
// P0191 police tuning note.
// P0192 police tuning note.
// P0193 police tuning note.
// P0194 police tuning note.
// P0195 police tuning note.
// P0196 police tuning note.
// P0197 police tuning note.
// P0198 police tuning note.
// P0199 police tuning note.
// P0200 police tuning note.
// P0201 police tuning note.
// P0202 police tuning note.
// P0203 police tuning note.
// P0204 police tuning note.
// P0205 police tuning note.
// P0206 police tuning note.
// P0207 police tuning note.
// P0208 police tuning note.
// P0209 police tuning note.
// P0210 police tuning note.
// P0211 police tuning note.
// P0212 police tuning note.
// P0213 police tuning note.
// P0214 police tuning note.
// P0215 police tuning note.
// P0216 police tuning note.
// P0217 police tuning note.
// P0218 police tuning note.
// P0219 police tuning note.
// P0220 police tuning note.
// P0221 police tuning note.
// P0222 police tuning note.
// P0223 police tuning note.
// P0224 police tuning note.
// P0225 police tuning note.
// P0226 police tuning note.
// P0227 police tuning note.
// P0228 police tuning note.
// P0229 police tuning note.
// P0230 police tuning note.
// P0231 police tuning note.
// P0232 police tuning note.
// P0233 police tuning note.
// P0234 police tuning note.
// P0235 police tuning note.
// P0236 police tuning note.
// P0237 police tuning note.
// P0238 police tuning note.
// P0239 police tuning note.
// P0240 police tuning note.
// P0241 police tuning note.
// P0242 police tuning note.
// P0243 police tuning note.
// P0244 police tuning note.
// P0245 police tuning note.
// P0246 police tuning note.
// P0247 police tuning note.
// P0248 police tuning note.
// P0249 police tuning note.
// P0250 police tuning note.
// P0251 police tuning note.
// P0252 police tuning note.
// P0253 police tuning note.
// P0254 police tuning note.
// P0255 police tuning note.
// P0256 police tuning note.
// P0257 police tuning note.
// P0258 police tuning note.
// P0259 police tuning note.
// P0260 police tuning note.
// P0261 police tuning note.
// P0262 police tuning note.
// P0263 police tuning note.
// P0264 police tuning note.
// P0265 police tuning note.
// P0266 police tuning note.
// P0267 police tuning note.
// P0268 police tuning note.
// P0269 police tuning note.
// P0270 police tuning note.
// P0271 police tuning note.
// P0272 police tuning note.
// P0273 police tuning note.
// P0274 police tuning note.
// P0275 police tuning note.
// P0276 police tuning note.
// P0277 police tuning note.
// P0278 police tuning note.
// P0279 police tuning note.
// P0280 police tuning note.
// P0281 police tuning note.
// P0282 police tuning note.
// P0283 police tuning note.
// P0284 police tuning note.
// P0285 police tuning note.
// P0286 police tuning note.
// P0287 police tuning note.
// P0288 police tuning note.
// P0289 police tuning note.
// P0290 police tuning note.
// P0291 police tuning note.
// P0292 police tuning note.
// P0293 police tuning note.
// P0294 police tuning note.
// P0295 police tuning note.
// P0296 police tuning note.
// P0297 police tuning note.
// P0298 police tuning note.
// P0299 police tuning note.
// P0300 police tuning note.
// P0301 police tuning note.
// P0302 police tuning note.
// P0303 police tuning note.
// P0304 police tuning note.
// P0305 police tuning note.
// P0306 police tuning note.
// P0307 police tuning note.
// P0308 police tuning note.
// P0309 police tuning note.
// P0310 police tuning note.
// P0311 police tuning note.
// P0312 police tuning note.
// P0313 police tuning note.
// P0314 police tuning note.
// P0315 police tuning note.
// P0316 police tuning note.
// P0317 police tuning note.
// P0318 police tuning note.
// P0319 police tuning note.
// P0320 police tuning note.
// P0321 police tuning note.
// P0322 police tuning note.
// P0323 police tuning note.
// P0324 police tuning note.
// P0325 police tuning note.
// P0326 police tuning note.
// P0327 police tuning note.
// P0328 police tuning note.
// P0329 police tuning note.
// P0330 police tuning note.
// P0331 police tuning note.
// P0332 police tuning note.
// P0333 police tuning note.
// P0334 police tuning note.
// P0335 police tuning note.
// P0336 police tuning note.
// P0337 police tuning note.
// P0338 police tuning note.
// P0339 police tuning note.
// P0340 police tuning note.
// P0341 police tuning note.
// P0342 police tuning note.
// P0343 police tuning note.
// P0344 police tuning note.
// P0345 police tuning note.
// P0346 police tuning note.
// P0347 police tuning note.
// P0348 police tuning note.
// P0349 police tuning note.
// P0350 police tuning note.
// P0351 police tuning note.
// P0352 police tuning note.
// P0353 police tuning note.
// P0354 police tuning note.
// P0355 police tuning note.
// P0356 police tuning note.
// P0357 police tuning note.
// P0358 police tuning note.
// P0359 police tuning note.
// P0360 police tuning note.
// P0361 police tuning note.
// P0362 police tuning note.
// P0363 police tuning note.
// P0364 police tuning note.
// P0365 police tuning note.
// P0366 police tuning note.
// P0367 police tuning note.
// P0368 police tuning note.
// P0369 police tuning note.
// P0370 police tuning note.
// P0371 police tuning note.
// P0372 police tuning note.
// P0373 police tuning note.
// P0374 police tuning note.
// P0375 police tuning note.
// P0376 police tuning note.
// P0377 police tuning note.
// P0378 police tuning note.
// P0379 police tuning note.
// P0380 police tuning note.
// P0381 police tuning note.
// P0382 police tuning note.
// P0383 police tuning note.
// P0384 police tuning note.
// P0385 police tuning note.
// P0386 police tuning note.
// P0387 police tuning note.
// P0388 police tuning note.
// P0389 police tuning note.
// P0390 police tuning note.
// P0391 police tuning note.
// P0392 police tuning note.
// P0393 police tuning note.
// P0394 police tuning note.
// P0395 police tuning note.
// P0396 police tuning note.
// P0397 police tuning note.
// P0398 police tuning note.
// P0399 police tuning note.
// P0400 police tuning note.
// P0401 police tuning note.
// P0402 police tuning note.
// P0403 police tuning note.
// P0404 police tuning note.
// P0405 police tuning note.
// P0406 police tuning note.
// P0407 police tuning note.
// P0408 police tuning note.
// P0409 police tuning note.
// P0410 police tuning note.
// P0411 police tuning note.
// P0412 police tuning note.
// P0413 police tuning note.
// P0414 police tuning note.
// P0415 police tuning note.
// P0416 police tuning note.
// P0417 police tuning note.
// P0418 police tuning note.
// P0419 police tuning note.
// P0420 police tuning note.
// P0421 police tuning note.
// P0422 police tuning note.
// P0423 police tuning note.
// P0424 police tuning note.
// P0425 police tuning note.
// P0426 police tuning note.
// P0427 police tuning note.
// P0428 police tuning note.
// P0429 police tuning note.
// P0430 police tuning note.
// P0431 police tuning note.
// P0432 police tuning note.
// P0433 police tuning note.
// P0434 police tuning note.
// P0435 police tuning note.
// P0436 police tuning note.
// P0437 police tuning note.
// P0438 police tuning note.
// P0439 police tuning note.
// P0440 police tuning note.
// P0441 police tuning note.
// P0442 police tuning note.
// P0443 police tuning note.
// P0444 police tuning note.
// P0445 police tuning note.
// P0446 police tuning note.
// P0447 police tuning note.
// P0448 police tuning note.
// P0449 police tuning note.
// P0450 police tuning note.
// P0001 police tuning note.
// P0002 police tuning note.
// P0003 police tuning note.
// P0004 police tuning note.
// P0005 police tuning note.
// P0006 police tuning note.
// P0007 police tuning note.
// P0008 police tuning note.
// P0009 police tuning note.
// P0010 police tuning note.
// P0011 police tuning note.
// P0012 police tuning note.
// P0013 police tuning note.
// P0014 police tuning note.
// P0015 police tuning note.
// P0016 police tuning note.
// P0017 police tuning note.
// P0018 police tuning note.
// P0019 police tuning note.
// P0020 police tuning note.
// P0021 police tuning note.
// P0022 police tuning note.
// P0023 police tuning note.
// P0024 police tuning note.
// P0025 police tuning note.
// P0026 police tuning note.
// P0027 police tuning note.
// P0028 police tuning note.
// P0029 police tuning note.
// P0030 police tuning note.
// P0031 police tuning note.
// P0032 police tuning note.
// P0033 police tuning note.
// P0034 police tuning note.
// P0035 police tuning note.
// P0036 police tuning note.
// P0037 police tuning note.
// P0038 police tuning note.
// P0039 police tuning note.
// P0040 police tuning note.
// P0041 police tuning note.
// P0042 police tuning note.
// P0043 police tuning note.
// P0044 police tuning note.
// P0045 police tuning note.
// P0046 police tuning note.
// P0047 police tuning note.
// P0048 police tuning note.
// P0049 police tuning note.
// P0050 police tuning note.
// P0051 police tuning note.
// P0052 police tuning note.
// P0053 police tuning note.
// P0054 police tuning note.
// P0055 police tuning note.
// P0056 police tuning note.
// P0057 police tuning note.
// P0058 police tuning note.
// P0059 police tuning note.
// P0060 police tuning note.
// P0061 police tuning note.
// P0062 police tuning note.
// P0063 police tuning note.
// P0064 police tuning note.
// P0065 police tuning note.
// P0066 police tuning note.
// P0067 police tuning note.
// P0068 police tuning note.
// P0069 police tuning note.
// P0070 police tuning note.
// P0071 police tuning note.
// P0072 police tuning note.
// P0073 police tuning note.
// P0074 police tuning note.
// P0075 police tuning note.
// P0076 police tuning note.
// P0077 police tuning note.
// P0078 police tuning note.
// P0079 police tuning note.
// P0080 police tuning note.
// P0081 police tuning note.
// P0082 police tuning note.
// P0083 police tuning note.
// P0084 police tuning note.
// P0085 police tuning note.
// P0086 police tuning note.
// P0087 police tuning note.
// P0088 police tuning note.
// P0089 police tuning note.
// P0090 police tuning note.
// P0091 police tuning note.
// P0092 police tuning note.
// P0093 police tuning note.
// P0094 police tuning note.
// P0095 police tuning note.
// P0096 police tuning note.
// P0097 police tuning note.
// P0098 police tuning note.
// P0099 police tuning note.
// P0100 police tuning note.
// P0101 police tuning note.
// P0102 police tuning note.
// P0103 police tuning note.
// P0104 police tuning note.
// P0105 police tuning note.
// P0106 police tuning note.
// P0107 police tuning note.
// P0108 police tuning note.
// P0109 police tuning note.
// P0110 police tuning note.
// P0111 police tuning note.
// P0112 police tuning note.
// P0113 police tuning note.
// P0114 police tuning note.
// P0115 police tuning note.
// P0116 police tuning note.
// P0117 police tuning note.
// P0118 police tuning note.
// P0119 police tuning note.
// P0120 police tuning note.
// P0121 police tuning note.
// P0122 police tuning note.
// P0123 police tuning note.
// P0124 police tuning note.
// P0125 police tuning note.
// P0126 police tuning note.
// P0127 police tuning note.
// P0128 police tuning note.
// P0129 police tuning note.
// P0130 police tuning note.
// P0131 police tuning note.
// P0132 police tuning note.
// P0133 police tuning note.
// P0134 police tuning note.
// P0135 police tuning note.
// P0136 police tuning note.
// P0137 police tuning note.
// P0138 police tuning note.
// P0139 police tuning note.
// P0140 police tuning note.
// P0141 police tuning note.
// P0142 police tuning note.
// P0143 police tuning note.
// P0144 police tuning note.
// P0145 police tuning note.
// P0146 police tuning note.
// P0147 police tuning note.
// P0148 police tuning note.
// P0149 police tuning note.
// P0150 police tuning note.
// P0151 police tuning note.
// P0152 police tuning note.
// P0153 police tuning note.
// P0154 police tuning note.
// P0155 police tuning note.
// P0156 police tuning note.
// P0157 police tuning note.
// P0158 police tuning note.
// P0159 police tuning note.
// P0160 police tuning note.
// P0161 police tuning note.
// P0162 police tuning note.
// P0163 police tuning note.
// P0164 police tuning note.
// P0165 police tuning note.
// P0166 police tuning note.
// P0167 police tuning note.
// P0168 police tuning note.
// P0169 police tuning note.
// P0170 police tuning note.
// P0171 police tuning note.
// P0172 police tuning note.
// P0173 police tuning note.
// P0174 police tuning note.
// P0175 police tuning note.
// P0176 police tuning note.
// P0177 police tuning note.
// P0178 police tuning note.
// P0179 police tuning note.
// P0180 police tuning note.
// P0181 police tuning note.
// P0182 police tuning note.
// P0183 police tuning note.
// P0184 police tuning note.
// P0185 police tuning note.
// P0186 police tuning note.
// P0187 police tuning note.
// P0188 police tuning note.
// P0189 police tuning note.
// P0190 police tuning note.
// P0191 police tuning note.
// P0192 police tuning note.
// P0193 police tuning note.
// P0194 police tuning note.
// P0195 police tuning note.
// P0196 police tuning note.
// P0197 police tuning note.
// P0198 police tuning note.
// P0199 police tuning note.
// P0200 police tuning note.
// P0201 police tuning note.
// P0202 police tuning note.
// P0203 police tuning note.
// P0204 police tuning note.
// P0205 police tuning note.
// P0206 police tuning note.
// P0207 police tuning note.
// P0208 police tuning note.
// P0209 police tuning note.
// P0210 police tuning note.
// P0211 police tuning note.
// P0212 police tuning note.
// P0213 police tuning note.
// P0214 police tuning note.
// P0215 police tuning note.
// P0216 police tuning note.
// P0217 police tuning note.
// P0218 police tuning note.
// P0219 police tuning note.
// P0220 police tuning note.
// P0221 police tuning note.
// P0222 police tuning note.
// P0223 police tuning note.
// P0224 police tuning note.
// P0225 police tuning note.
// P0226 police tuning note.
// P0227 police tuning note.
// P0228 police tuning note.
// P0229 police tuning note.
// P0230 police tuning note.
// P0231 police tuning note.
// P0232 police tuning note.
// P0233 police tuning note.
// P0234 police tuning note.
// P0235 police tuning note.
// P0236 police tuning note.
// P0237 police tuning note.
// P0238 police tuning note.
// P0239 police tuning note.
// P0240 police tuning note.
// P0241 police tuning note.
// P0242 police tuning note.
// P0243 police tuning note.
// P0244 police tuning note.
// P0245 police tuning note.
// P0246 police tuning note.
// P0247 police tuning note.
// P0248 police tuning note.
// P0249 police tuning note.
// P0250 police tuning note.
// P0251 police tuning note.
// P0252 police tuning note.
// P0253 police tuning note.
// P0254 police tuning note.
// P0255 police tuning note.
// P0256 police tuning note.
// P0257 police tuning note.
// P0258 police tuning note.
// P0259 police tuning note.
// P0260 police tuning note.
// P0261 police tuning note.
// P0262 police tuning note.
// P0263 police tuning note.
// P0264 police tuning note.
// P0265 police tuning note.
// P0266 police tuning note.
// P0267 police tuning note.
// P0268 police tuning note.
// P0269 police tuning note.
// P0270 police tuning note.
// P0271 police tuning note.
// P0272 police tuning note.
// P0273 police tuning note.
// P0274 police tuning note.
// P0275 police tuning note.
// P0276 police tuning note.
// P0277 police tuning note.
// P0278 police tuning note.
// P0279 police tuning note.
// P0280 police tuning note.
// P0281 police tuning note.
// P0282 police tuning note.
// P0283 police tuning note.
// P0284 police tuning note.
// P0285 police tuning note.
// P0286 police tuning note.
// P0287 police tuning note.
// P0288 police tuning note.
// P0289 police tuning note.
// P0290 police tuning note.
// P0291 police tuning note.
// P0292 police tuning note.
// P0293 police tuning note.
// P0294 police tuning note.
// P0295 police tuning note.
// P0296 police tuning note.
// P0297 police tuning note.
// P0298 police tuning note.
// P0299 police tuning note.
// P0300 police tuning note.
// P0301 police tuning note.
// P0302 police tuning note.
// P0303 police tuning note.
// P0304 police tuning note.
// P0305 police tuning note.
// P0306 police tuning note.
// P0307 police tuning note.
// P0308 police tuning note.
// P0309 police tuning note.
// P0310 police tuning note.
// P0311 police tuning note.
// P0312 police tuning note.
// P0313 police tuning note.
// P0314 police tuning note.
// P0315 police tuning note.
// P0316 police tuning note.
// P0317 police tuning note.
// P0318 police tuning note.
// P0319 police tuning note.
// P0320 police tuning note.
// P0321 police tuning note.
// P0322 police tuning note.
// P0323 police tuning note.
// P0324 police tuning note.
// P0325 police tuning note.
// P0326 police tuning note.
// P0327 police tuning note.
// P0328 police tuning note.
// P0329 police tuning note.
// P0330 police tuning note.
// P0331 police tuning note.
// P0332 police tuning note.
// P0333 police tuning note.
// P0334 police tuning note.
// P0335 police tuning note.
// P0336 police tuning note.
// P0337 police tuning note.
// P0338 police tuning note.
// P0339 police tuning note.
// P0340 police tuning note.
// P0341 police tuning note.
// P0342 police tuning note.
// P0343 police tuning note.
// P0344 police tuning note.
// P0345 police tuning note.
// P0346 police tuning note.
// P0347 police tuning note.
// P0348 police tuning note.
// P0349 police tuning note.
// P0350 police tuning note.
// P0351 police tuning note.
// P0352 police tuning note.
// P0353 police tuning note.
// P0354 police tuning note.
// P0355 police tuning note.
// P0356 police tuning note.
// P0357 police tuning note.
// P0358 police tuning note.
// P0359 police tuning note.
// P0360 police tuning note.
// P0361 police tuning note.
// P0362 police tuning note.
// P0363 police tuning note.
// P0364 police tuning note.
// P0365 police tuning note.
// P0366 police tuning note.
// P0367 police tuning note.
// P0368 police tuning note.
// P0369 police tuning note.
// P0370 police tuning note.
// P0371 police tuning note.
// P0372 police tuning note.
// P0373 police tuning note.
// P0374 police tuning note.
// P0375 police tuning note.
// P0376 police tuning note.
// P0377 police tuning note.
// P0378 police tuning note.
// P0379 police tuning note.
// P0380 police tuning note.
// P0381 police tuning note.
// P0382 police tuning note.
// P0383 police tuning note.
// P0384 police tuning note.
// P0385 police tuning note.
// P0386 police tuning note.
// P0387 police tuning note.
// P0388 police tuning note.
// P0389 police tuning note.
// P0390 police tuning note.
// P0391 police tuning note.
// P0392 police tuning note.
// P0393 police tuning note.
// P0394 police tuning note.
// P0395 police tuning note.
// P0396 police tuning note.
// P0397 police tuning note.
// P0398 police tuning note.
// P0399 police tuning note.
// P0400 police tuning note.
// P0401 police tuning note.
// P0402 police tuning note.
// P0403 police tuning note.
// P0404 police tuning note.
// P0405 police tuning note.
// P0406 police tuning note.
// P0407 police tuning note.
// P0408 police tuning note.
// P0409 police tuning note.
// P0410 police tuning note.
// P0411 police tuning note.
// P0412 police tuning note.
// P0413 police tuning note.
// P0414 police tuning note.
// P0415 police tuning note.
// P0416 police tuning note.
// P0417 police tuning note.
// P0418 police tuning note.
// P0419 police tuning note.
// P0420 police tuning note.
// P0421 police tuning note.
// P0422 police tuning note.
// P0423 police tuning note.
// P0424 police tuning note.
// P0425 police tuning note.
// P0426 police tuning note.
// P0427 police tuning note.
// P0428 police tuning note.
// P0429 police tuning note.
// P0430 police tuning note.
// P0431 police tuning note.
// P0432 police tuning note.
// P0433 police tuning note.
// P0434 police tuning note.
// P0435 police tuning note.
// P0436 police tuning note.
// P0437 police tuning note.
// P0438 police tuning note.
// P0439 police tuning note.
// P0440 police tuning note.
// P0441 police tuning note.
// P0442 police tuning note.
// P0443 police tuning note.
// P0444 police tuning note.
// P0445 police tuning note.
// P0446 police tuning note.
// P0447 police tuning note.
// P0448 police tuning note.
// P0449 police tuning note.
// P0450 police tuning note.
