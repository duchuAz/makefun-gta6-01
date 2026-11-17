// The HUD is plain DOM over the canvas: bars, stars, cash, objective, subtitles, toasts,
// prompt, speedometer and radio. It keeps the last values so the render loop can call it
// every frame without touching the DOM when nothing changed.
import { WEAPONS } from './config.js';
import { money, pad } from './math.js';

export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    healthFill: $('health-fill'),
    armorFill: $('armor-fill'),
    cash: $('cash'),
    stars: [...document.querySelectorAll('#wanted .star')],
    clock: $('clock'),
    district: $('district'),
    missionPanel: $('mission-panel'),
    missionKicker: $('mission-kicker'),
    missionTitle: $('mission-title'),
    objective: $('objective'),
    missionReward: $('mission-reward'),
    subtitle: $('subtitle'),
    speaker: $('speaker'),
    subtitleText: $('subtitle-text'),
    toasts: $('toasts'),
    prompt: $('prompt'),
    crosshair: $('crosshair'),
    promptText: $('prompt-text'),
    weaponName: $('weapon-name'),
    ammo: $('ammo'),
    speedo: $('speedo'),
    speed: $('speed'),
    gear: $('gear'),
    radioName: $('radio-name'),
    radioGenre: $('radio-genre'),
    busted: $('busted-screen'),
    wasted: $('wasted-screen'),
    missionComplete: $('mission-complete'),
    mcTitle: $('mc-title'),
    mcReward: $('mc-reward'),
    mcNext: $('mc-next'),
    hint: $('hint-line'),
    statCash: $('stat-cash'),
    statMissions: $('stat-missions'),
    statWanted: $('stat-wanted'),
  };
  let lastHealth = -1;
  let lastArmor = -1;
  let lastCash = -1;
  let lastWanted = -1;
  let lastHeat = -1;
  let lastWeapon = '';
  let lastAmmo = '';
  let lastSpeed = -1;
  let lastGear = '';
  let dialogueTimer = 0;
  let missionTimer = 0;
  let completeTimer = 0;
  const toastNodes = [];

  let crosshairOn = true;
  function setCrosshair(on) {
    if (on === crosshairOn) return;
    crosshairOn = on;
    el.crosshair.style.display = on ? 'block' : 'none';
  }

  function show() { el.hud.classList.remove('hidden'); }
  function hide() { el.hud.classList.add('hidden'); }

  function setHealth(health, armor) {
    const h = Math.max(0, Math.min(100, health));
    const a = Math.max(0, Math.min(100, armor));
    if (h !== lastHealth) {
      el.healthFill.style.transform = `scaleX(${h / 100})`;
      el.healthFill.parentElement.dataset.value = Math.round(h);
      lastHealth = h;
    }
    if (a !== lastArmor) {
      el.armorFill.style.transform = `scaleX(${a / 100})`;
      lastArmor = a;
    }
  }

  function setCash(cash) {
    const c = Math.round(cash);
    if (c === lastCash) return;
    lastCash = c;
    el.cash.textContent = money(c);
    el.statCash.textContent = money(c);
  }

  function setWanted(wanted, heat = 0) {
    const w = Math.max(0, Math.min(5, wanted));
    if (w === lastWanted && Math.abs(heat - lastHeat) < 0.02) return;
    lastWanted = w;
    lastHeat = heat;
    el.stars.forEach((star, i) => {
      star.classList.toggle('on', i < w);
      star.classList.toggle('hot', i === w && heat > 0.1);
    });
    el.statWanted.textContent = String(w);
  }

  function setWeapon(name, ammo, reserve) {
    const spec = WEAPONS[name] ?? WEAPONS.fists;
    const text = name === 'fists' ? '∞' : `${ammo} / ${reserve}`;
    if (lastWeapon !== name) {
      el.weaponName.textContent = spec.name;
      lastWeapon = name;
    }
    if (lastAmmo !== text) {
      el.ammo.textContent = text;
      lastAmmo = text;
    }
    el.ammo.style.color = name !== 'fists' && ammo <= 0 ? '#ff8a7a' : '';
  }

  function setMission(number, title, objective, reward) {
    if (!number || !title) {
      el.missionPanel.classList.add('hidden');
      missionTimer = 0;
      return;
    }
    el.missionPanel.classList.remove('hidden');
    el.missionKicker.textContent = `MISSION ${number} · ${title}`;
    el.missionTitle.textContent = title;
    el.objective.textContent = objective ?? '';
    el.missionReward.textContent = `REWARD ${money(reward ?? 0)}`;
    missionTimer = 0;
  }

  function setObjective(text) {
    if (text !== undefined && text !== null) el.objective.textContent = text;
  }

  function dialogue(speaker, text, seconds = 4.5) {
    el.speaker.textContent = speaker;
    el.subtitleText.textContent = text;
    el.subtitle.classList.remove('hidden');
    dialogueTimer = seconds;
  }

  function toast(text, type = '', seconds = 3.2) {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = text;
    el.toasts.appendChild(node);
    toastNodes.push({ node, time: seconds });
    while (toastNodes.length > 4) {
      const old = toastNodes.shift();
      old.node.remove();
    }
  }

  function setPrompt(text) {
    if (text) {
      el.promptText.textContent = text;
      el.prompt.classList.remove('hidden');
    } else {
      el.prompt.classList.add('hidden');
    }
  }

  function setSpeed(mph, gear = 'D', visible = false) {
    el.speedo.classList.toggle('hidden', !visible);
    if (!visible) return;
    const rounded = Math.round(mph);
    if (rounded !== lastSpeed) {
      el.speed.textContent = String(rounded);
      lastSpeed = rounded;
    }
    if (gear !== lastGear) {
      el.gear.textContent = gear;
      lastGear = gear;
    }
  }

  function setRadio(name, genre) {
    if (el.radioName.textContent !== name) el.radioName.textContent = name;
    if (el.radioGenre.textContent !== genre) el.radioGenre.textContent = genre;
  }

  function setClock(seconds) {
    const total = Math.floor(seconds) % 86400;
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const text = `${pad(hh)}:${pad(mm)}`;
    if (el.clock.textContent !== text) el.clock.textContent = text;
  }

  function setDistrict(text) {
    if (el.district.textContent !== text) el.district.textContent = text;
  }

  function showBusted() {
    el.busted.classList.remove('hidden');
    el.wasted.classList.add('hidden');
  }
  function hideBusted() { el.busted.classList.add('hidden'); }
  function showWasted() {
    el.wasted.classList.remove('hidden');
    el.busted.classList.add('hidden');
  }
  function hideWasted() { el.wasted.classList.add('hidden'); }

  function showMissionComplete(title, reward, finale = false) {
    el.mcTitle.textContent = title;
    el.mcReward.textContent = `+${money(reward)}`;
    el.mcNext.textContent = finale
      ? 'Palma Vista is yours. Free roam the city, finish the radio dial, or start a new game from the title screen.'
      : 'The next job is waiting. Follow the gold marker on the minimap.';
    el.missionComplete.classList.remove('hidden');
    completeTimer = 6.5;
  }
  function hideMissionComplete() {
    el.missionComplete.classList.add('hidden');
    completeTimer = 0;
  }

  function update(dt) {
    if (dialogueTimer > 0) {
      dialogueTimer -= dt;
      if (dialogueTimer <= 0) el.subtitle.classList.add('hidden');
    }
    if (completeTimer > 0) {
      completeTimer -= dt;
      if (completeTimer <= 0) el.missionComplete.classList.add('hidden');
    }
    for (let i = toastNodes.length - 1; i >= 0; i--) {
      toastNodes[i].time -= dt;
      if (toastNodes[i].time <= 0) {
        toastNodes[i].node.remove();
        toastNodes.splice(i, 1);
      }
    }
  }

  function setStats({ missions = 0, wanted = 0 } = {}) {
    el.statMissions.textContent = `${missions} / 5`;
    el.statWanted.textContent = String(wanted);
  }

  return {
    el,
    show,
    hide,
    setHealth,
    setCash,
    setWanted,
    setWeapon,
    setMission,
    setObjective,
    dialogue,
    toast,
    setPrompt,
    setCrosshair,
    setSpeed,
    setRadio,
    setClock,
    setDistrict,
    showBusted,
    hideBusted,
    showWasted,
    hideWasted,
    showMissionComplete,
    hideMissionComplete,
    setStats,
    update,
    setHint(text) { el.hint.textContent = text; },
  };
}
