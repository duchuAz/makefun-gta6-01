// Saves are one localStorage record: progress, the player's pockets and the settings that
// should survive a reload. Nothing here talks to the network; a private window just means
// the game runs without a save, and every call is guarded.
import { SAVE_KEY, SAVE_VERSION } from './config.js';

const SETTINGS_KEY = 'palma-vista-settings-v1';

export const DEFAULT_SETTINGS = {
  audio: true,
  music: true,
  sensitivity: 1,
  radio: 0,
  showHints: true,
};

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings() {
  const store = storage();
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadGame() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * The save payload. Callers pass plain numbers only; this is deliberately a whitelist so a
 * stray Three.js object never ends up in localStorage.
 */
export function writeGame(state) {
  const store = storage();
  if (!store) return false;
  const data = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    cash: Math.round(state.cash ?? 0),
    missionIndex: state.missionIndex ?? 0,
    missionStep: state.missionStep ?? 0,
    missionActive: Boolean(state.missionActive),
    player: {
      x: Number(state.player?.x ?? 0),
      y: Number(state.player?.y ?? 0),
      z: Number(state.player?.z ?? 0),
      heading: Number(state.player?.heading ?? 0),
      health: Number(state.player?.health ?? 100),
      armor: Number(state.player?.armor ?? 0),
    },
    weapons: {
      current: state.weapons?.current ?? 'pistol',
      pistol: { ...state.weapons?.pistol },
      smg: { ...state.weapons?.smg },
    },
    stats: {
      missions: state.stats?.missions ?? 0,
      arrests: state.stats?.arrests ?? 0,
      distance: state.stats?.distance ?? 0,
      takedowns: state.stats?.takedowns ?? 0,
    },
    settings: { ...state.settings },
  };
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function eraseGame() {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

