// The story of Rico Valdez, courier, and the five jobs that pull him into Los Cuervos:
// a package run, a stolen concept car, a box of evidence, an ambush on the causeway, and
// the night the marina changes hands. Each mission is a small state machine of markers,
// objectives, dialogue, targets and rewards.
import * as THREE from 'three';
import { SPOTS } from './city.js';
import { clamp, dist } from './math.js';

export const MISSIONS = [
  {
    id: 'first-delivery',
    number: 1,
    title: 'FIRST DELIVERY',
    start: 'cafe',
    reward: 250,
    intro: [
      ['LUNA', 'Rico. One package from the marina to Neon Alley. Then Los Cuervos will owe you.'],
      ['RICO', 'One run. Then we are square, Luna.'],
    ],
    steps: [
      { type: 'goto', spot: 'marina', objective: 'Collect the package at the marina', radius: 6, enter: [['LUNA', 'Locker 42. The combination is your sister\'s birthday.']] },
      { type: 'goto', spot: 'neon', objective: 'Deliver the package to Neon Alley', radius: 5.5, enter: [['RICO', 'Package secured. Smells like sunscreen and bad decisions.']] },
    ],
    outro: [
      ['SOL', 'Late, Valdez. But not dead. That is progress.'],
      ['LUNA', 'They want you at Club Sol. I told them you are useful.'],
    ],
  },
  {
    id: 'mint-condition',
    number: 2,
    title: 'MINT CONDITION',
    start: 'club',
    reward: 400,
    intro: [
      ['VOSS', 'Valdez. The mint Solar GT at Vista Motors is evidence. I need it moved.'],
      ['RICO', 'You are a detective.'],
      ['VOSS', 'And you are a courier. Take it to El Taller. Do not scratch it.'],
    ],
    steps: [
      { type: 'goto', spot: 'motors', objective: 'Meet the contact at Vista Motors', radius: 5.5 },
      { type: 'steal', carId: 'mint-gt', objective: 'Steal the mint Solar GT' },
      { type: 'deliver', spot: 'garage', carId: 'mint-gt', objective: 'Drive the mint GT to El Taller', radius: 7 },
    ],
    outro: [
      ['VOSS', 'Good. Now you are on the payroll, whether you like it or not.'],
      ['LUNA', 'That badge is going to get us both killed.'],
    ],
  },
  {
    id: 'badge-problems',
    number: 3,
    title: 'BADGE PROBLEMS',
    start: 'alley',
    reward: 600,
    intro: [
      ['VOSS', 'Internal Affairs is sniffing around the impound. Three crates. Burn them.'],
      ['RICO', 'You want me to shoot evidence.'],
      ['VOSS', 'I want you to make it loud enough that nobody looks at me.'],
    ],
    steps: [
      { type: 'goto', spot: 'alley', objective: 'Meet Voss behind PVPD headquarters', radius: 5 },
      {
        type: 'destroy', spot: 'impound', objective: 'Destroy the evidence crates', count: 3,
        enter: [['VOSS', 'Make it loud. Then lose the uniforms.']],
        crates: [
          { x: 112, z: 162 }, { x: 120, z: 166 }, { x: 128, z: 162 },
        ],
      },
      { type: 'evade', objective: 'Lose the PVPD pursuit', heat: 3, enter: [['DISPATCH', 'Shots fired at the city impound. All units respond.']] },
    ],
    outro: [
      ['VOSS', 'Clean. For now.'],
      ['LUNA', 'Rico, the crates were full of marina deeds. Voss is not cleaning up. He is covering.'],
    ],
  },
  {
    id: 'the-drop',
    number: 4,
    title: 'THE DROP',
    start: 'club',
    reward: 900,
    intro: [
      ['SOL', 'The Cardenal wants his briefcase on the causeway. No cops, no questions.'],
      ['LUNA', 'It is a setup. Let me come with you.'],
      ['RICO', 'Keep the engine warm.'],
    ],
    steps: [
      { type: 'goto', spot: 'drop', objective: 'Drive the briefcase to the causeway drop', radius: 8, needCar: true },
      {
        type: 'kill', spot: 'drop', objective: 'Survive the ambush', count: 4, radius: 12,
        enter: [['EL CARDENAL', 'You brought a courier to a cartel meeting, Sol? Take the case.']],
      },
      { type: 'goto', spot: 'club', objective: 'Return the briefcase to Club Sol', radius: 6 },
    ],
    outro: [
      ['SOL', 'You are still breathing. Good. The Cardenal will remember that.'],
      ['LUNA', 'The case was empty, Rico. They wanted you on the bridge.'],
    ],
  },
  {
    id: 'vista-finale',
    number: 5,
    title: 'VISTA FINALE',
    start: 'lighthouse',
    reward: 2000,
    intro: [
      ['LUNA', 'Voss sold the marina to Los Cuervos. The lighthouse is where they are counting the money.'],
      ['RICO', 'Then we take it back.'],
      ['LUNA', 'For your sister. For the whole damn city.'],
    ],
    steps: [
      { type: 'goto', spot: 'lighthouse', objective: 'Meet Luna at the lighthouse', radius: 6 },
      {
        type: 'kill', spot: 'lighthouse', objective: 'Take back the marina', count: 6, radius: 16,
        enter: [['VOSS', 'You should have stayed a courier, Valdez.'], ['EL CARDENAL', 'Put him in the water.']],
      },
      { type: 'evade', objective: 'Escape the PVPD lockdown', heat: 4, enter: [['DISPATCH', 'All units, marina perimeter. Suspect is armed and dangerous.']] },
      { type: 'goto', spot: 'drop', objective: 'Get to the causeway and disappear', radius: 8, needCar: true, enter: [['LUNA', 'Go, Rico. I will find you on the other side of the bridge.']] },
    ],
    outro: [
      ['LUNA', 'The city looks different from here.'],
      ['RICO', 'It looks like ours.'],
      ['LUNA', 'Palma Vista. The city that never cools.'],
    ],
    finale: true,
  },
];

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.35, 'rgba(255,210,120,0.55)');
  grad.addColorStop(1, 'rgba(255,170,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GLOW_TEX = makeGlowTexture();

function makeMarker() {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.8, 5.4, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  beam.position.y = 2.9;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.09, 6, 36),
    new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  const icon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.46, 0),
    new THREE.MeshBasicMaterial({ color: 0xffe6a0, toneMapped: false }),
  );
  icon.position.y = 3.0;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffd35a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.scale.set(7, 7, 1);
  glow.position.y = 2.6;
  group.add(beam, ring, icon, glow);
  return { group, beam, ring, icon, glow };
}

export function createMissions(scene, city) {
  const marker = makeMarker();
  scene.add(marker.group);
  let index = 0;
  let active = null;
  let stepIndex = 0;
  let stepState = null;
  let dialogueQueue = [];
  let dialogueTimer = 0;
  let completeTimer = 0;
  let nearStart = false;
  let finished = false;
  let lastCtx = null;
  const crates = [];

  const api = {
    get index() { return index; },
    get active() { return active; },
    get stepIndex() { return stepIndex; },
    get nearStart() { return nearStart; },
    get finished() { return finished; },
    get objective() { return active ? active.steps[stepIndex]?.objective ?? '' : ''; },
    get markerPosition() {
      if (!marker.group.visible) return null;
      return { x: marker.group.position.x, z: marker.group.position.z };
    },
    get shootTargets() {
      return crates.filter((c) => !c.dead).map((c) => ({ type: 'crate', ref: c, x: c.x, y: 0.75, z: c.z, radius: 0.9 }));
    },
    stage(missionIndex, step = 0) {
      index = clamp(missionIndex, 0, MISSIONS.length - 1);
      active = MISSIONS[index];
      stepIndex = clamp(step, 0, active.steps.length - 1);
      stepState = { killed: 0, enemies: [], crates: [], warned: false };
      const stepDef = active.steps[stepIndex];
      const spot = stepDef.spot ? SPOTS[stepDef.spot] : null;
      if (spot) {
        marker.group.position.set(spot.x, 0.1, spot.z);
        marker.group.visible = true;
      }
      return active;
    },
    setIndex(n) {
      index = clamp(n, 0, MISSIONS.length);
      active = null;
      stepIndex = 0;
      finished = index >= MISSIONS.length;
      clearCrates();
      refreshIdleMarker();
    },
    start(ctx) {
      if (active || index >= MISSIONS.length || !nearStart) return false;
      active = MISSIONS[index];
      nearStart = false;
      stepIndex = 0;
      stepState = { killed: 0, enemies: [], crates: [], done: false };
      ctx.hud?.setMission(active.number, active.title, active.steps[0].objective, active.reward);
      ctx.hud?.toast(`MISSION ${active.number}: ${active.title}`, 'mission');
      queueDialogue(active.intro);
      enterStep(ctx);
      return true;
    },
    update(dt, ctx) {
      lastCtx = ctx;
      // Dialogue queue.
      if (dialogueQueue.length > 0) {
        dialogueTimer -= dt;
        if (dialogueTimer <= 0) {
          const [speaker, text] = dialogueQueue.shift();
          ctx.hud?.dialogue(speaker, text, 4.6);
          dialogueTimer = 0.3;
        }
      }
      // Marker animation.
      marker.ring.rotation.z += dt * 0.7;
      marker.icon.rotation.y += dt * 1.6;
      marker.icon.position.y = 3.0 + Math.sin(performance.now() * 0.0025) * 0.2;
      marker.beam.material.opacity = 0.028 + Math.sin(performance.now() * 0.002) * 0.012;
      if (completeTimer > 0) completeTimer -= dt;

      if (!active) {
        if (index >= MISSIONS.length) {
          marker.group.visible = false;
          nearStart = false;
          return;
        }
        const spot = SPOTS[MISSIONS[index].start];
        marker.group.position.set(spot.x, 0.1, spot.z);
        marker.group.visible = true;
        nearStart = dist(ctx.player.state.x, ctx.player.state.z, spot.x, spot.z) < 5.4;
        ctx.hud?.setMission(null);
        return;
      }

      nearStart = false;
      const step = active.steps[stepIndex];
      if (!step) return;
      let target = null;
      if (step.type === 'steal') {
        const car = ctx.vehicles.cars.find((c) => c.id === step.carId);
        if (car && !car.dead) target = { x: car.x, z: car.z };
      } else if (step.spot) {
        target = SPOTS[step.spot];
      }
      if (target) {
        marker.group.visible = true;
        marker.group.position.set(target.x, 0.1, target.z);
        marker.ring.material.color.setHex(step.type === 'evade' ? 0xff5a6a : 0xffd35a);
        marker.icon.material.color.setHex(step.type === 'evade' ? 0xff8a9a : 0xffe6a0);
      } else {
        marker.group.visible = false;
      }

      const player = ctx.player;
      const px = player.state.x;
      const pz = player.state.z;
      if (step.type === 'goto') {
        if (dist(px, pz, target.x, target.z) < (step.radius ?? 5)) {
          if (step.needCar && !player.state.inCar) {
            ctx.hud?.toast('BRING A CAR', 'warn');
          } else {
            advance(ctx);
          }
        }
      } else if (step.type === 'steal') {
        if (player.state.inCar && player.state.inCar.id === step.carId) {
          ctx.hud?.toast('CAR STOLEN', 'good');
          ctx.police?.reportCrime('carJack');
          advance(ctx);
        } else if (!ctx.vehicles.cars.some((c) => c.id === step.carId && !c.dead)) {
          ctx.hud?.toast('THE CAR IS WRECKED', 'warn');
          fail(ctx);
        }
      } else if (step.type === 'deliver') {
        const car = player.state.inCar;
        if (car && dist(px, pz, target.x, target.z) < (step.radius ?? 6)) {
          if (step.carId && car.id !== step.carId) {
            if (!stepState.warned) {
              stepState.warned = true;
              ctx.hud?.toast('WRONG CAR — BRING THE GT', 'warn');
            }
          } else {
            advance(ctx);
          }
        }
      } else if (step.type === 'destroy') {
        const total = step.count ?? 3;
        const left = stepState.crates.filter((c) => !c.dead).length;
        ctx.hud?.setObjective(`Destroy the evidence crates  ${total - left}/${total}`);
        if (left === 0) {
          if (!stepState.warned) {
            stepState.warned = true;
            ctx.police?.setWanted(step.heat ?? 3);
            ctx.police?.addHeat?.(0.2);
          }
          advance(ctx);
        }
      } else if (step.type === 'kill') {
        const total = step.count ?? 4;
        const left = stepState.enemies.filter((e) => e.alive).length;
        ctx.hud?.setObjective(`${step.objective}  ${total - left}/${total}`);
        if (left === 0 && stepState.enemies.length > 0) {
          advance(ctx);
        }
      } else if (step.type === 'evade') {
        if ((ctx.police?.wanted ?? 0) === 0) {
          ctx.hud?.toast('PURSUIT LOST', 'good');
          advance(ctx);
        }
      }
    },
    fail(ctx) {
      if (!active) return;
      ctx.hud?.toast('MISSION FAILED', 'warn');
      clearCrates();
      active = null;
      stepIndex = 0;
      stepState = null;
      dialogueQueue = [];
      refreshIdleMarker();
    },
    hitCrate(crate, damage, ctx) {
      if (!crate || crate.dead) return;
      crate.health -= damage;
      if (crate.health <= 0) {
        crate.dead = true;
        crate.mesh.visible = false;
        ctx.combat?.explodeAt(crate.x, 0.9, crate.z, 3.2, ctx);
        ctx.audio?.impact();
        ctx.hud?.toast('EVIDENCE DESTROYED', 'good');
      }
    },
    /** The marker position for the minimap and HUD compass. */
    minimapTarget() {
      if (!marker.group.visible) return null;
      return { x: marker.group.position.x, z: marker.group.position.z };
    },
    status(ctx) {
      if (!active) return null;
      return { number: active.number, title: active.title, step: stepIndex, steps: active.steps.length, objective: active.steps[stepIndex]?.objective };
    },
    complete(ctx) {
      if (!active) return;
      const mission = active;
      playerReward(mission.reward, ctx);
      ctx.stats && (ctx.stats.missions += 1);
      ctx.hud?.showMissionComplete(mission.title, mission.reward, mission.finale);
      ctx.audio?.missionComplete();
      queueDialogue(mission.outro);
      index += 1;
      finished = index >= MISSIONS.length;
      active = null;
      stepIndex = 0;
      stepState = null;
      clearCrates();
      completeTimer = 5;
      if (mission.finale) {
        ctx.hud?.setObjective('');
      }
    },
  };

  function playerReward(amount, ctx) {
    ctx.player.state.cash += amount;
    ctx.audio?.cash();
    ctx.hud?.toast(`+$${amount.toLocaleString('en-US')}`, 'cash');
  }

  function queueDialogue(lines) {
    if (!lines) return;
    dialogueQueue.push(...lines);
    dialogueTimer = 0.1;
  }

  function refreshIdleMarker() {
    if (!active && index < MISSIONS.length) {
      const spot = SPOTS[MISSIONS[index].start];
      marker.group.position.set(spot.x, 0.1, spot.z);
      marker.group.visible = true;
    } else if (index >= MISSIONS.length) {
      marker.group.visible = false;
    }
  }

  function clearCrates() {
    for (const crate of crates) {
      if (crate.mesh) scene.remove(crate.mesh);
    }
    crates.length = 0;
    if (stepState) stepState.crates = [];
  }

  function spawnCrates(step, ctx) {
    clearCrates();
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x9b6b3a, roughness: 0.9 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.6 });
    for (const item of step.crates ?? []) {
      const mesh = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat);
      box.position.y = 0.8;
      box.castShadow = true;
      mesh.add(box);
      for (const y of [0.35, 1.25]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.12, 1.44), stripeMat);
        stripe.position.y = y;
        mesh.add(stripe);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffb347, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.scale.set(4, 4, 1);
      glow.position.y = 1.0;
      mesh.add(glow);
      mesh.position.set(item.x, 0.1, item.z);
      scene.add(mesh);
      const crate = { x: item.x, z: item.z, health: 60, dead: false, mesh, id: `crate-${crates.length}` };
      crates.push(crate);
      stepState.crates.push(crate);
    }
    ctx.hud?.setObjective(step.objective);
  }

  function spawnEnemies(step, ctx) {
    const spot = SPOTS[step.spot];
    stepState.killed = 0;
    stepState.enemies = ctx.police.spawnGang(spot.x, spot.z, step.count ?? 4, (actor) => {
      stepState.killed += 1;
      ctx.hud?.setObjective(`${step.objective}  ${stepState.killed}/${step.count ?? 4}`);
      ctx.audio?.cash();
    });
    ctx.hud?.setObjective(`${step.objective}  0/${step.count ?? 4}`);
  }

  function enterStep(ctx) {
    const step = active.steps[stepIndex];
    if (!step) {
      api.complete(ctx);
      return;
    }
    stepState.warned = false;
    ctx.hud?.setMission(active.number, active.title, step.objective, active.reward);
    if (step.enter) queueDialogue(step.enter);
    if (step.type === 'destroy') {
      spawnCrates(step, ctx);
    } else if (step.type === 'kill') {
      spawnEnemies(step, ctx);
    } else if (step.type === 'evade') {
      if (step.heat) ctx.police?.setWanted(step.heat);
    }
    if (step.type === 'steal' || step.type === 'goto' || step.type === 'deliver') {
      ctx.hud?.setObjective(step.objective);
    }
    if (step.type === 'evade') {
      ctx.hud?.setObjective(step.objective);
    }
  }

  function advance(ctx) {
    stepIndex += 1;
    if (stepIndex >= active.steps.length) {
      api.complete(ctx);
    } else {
      stepState = { ...stepState, killed: 0, enemies: [], crates: [], warned: false };
      ctx.audio?.pickup();
      enterStep(ctx);
    }
  }

  // A small point light on the active marker helps it read at night.
  const markerLight = new THREE.PointLight(0xffd35a, 4, 11, 2);
  markerLight.position.y = 2.4;
  marker.group.add(markerLight);

  refreshIdleMarker();
  return api;
}

