// Keyboard and mouse, with a thin action layer. The game asks for named actions, never
// key codes, and the input system turns edge presses (E, Esc, weapon swap, save) into
// one-shot actions so a held key never repeats an interaction.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyF',
  'KeyR', 'KeyM', 'KeyQ', 'KeyC', 'Digit1', 'Digit2', 'Digit3', 'BracketLeft',
  'BracketRight', 'F5', 'F9', 'Tab', 'Escape',
]);

export function createInput(canvas, { onPause, onPointerLock } = {}) {
  const held = new Set();
  const edges = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let wheel = 0;
  let mouseDown = false;
  let mouse2Down = false;
  let mouseClicked = false;
  let locked = false;
  let sensitivity = 1;

  const onKeyDown = (event) => {
    if (event.repeat) {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      return;
    }
    const wasHeld = held.has(event.code);
    held.add(event.code);
    if (!wasHeld) edges.add(event.code);
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (event.code === 'Escape' && locked) {
      document.exitPointerLock?.();
    }
    if (event.code === 'Tab') event.preventDefault();
  };
  const onKeyUp = (event) => {
    held.delete(event.code);
    if (GAME_KEYS.has(event.code)) event.preventDefault();
  };
  const onMouseMove = (event) => {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  };
  const onMouseDown = (event) => {
    if (event.button === 0) {
      mouseDown = true;
      mouseClicked = true;
    } else if (event.button === 2) {
      mouse2Down = true;
    }
  };
  const onMouseUp = (event) => {
    if (event.button === 0) mouseDown = false;
    else if (event.button === 2) mouse2Down = false;
  };
  const onContextMenu = (event) => event.preventDefault();
  const onWheel = (event) => {
    wheel += Math.sign(event.deltaY);
  };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      mouseDown = false;
      mouse2Down = false;
      mouseDX = 0;
      mouseDY = 0;
    }
    onPointerLock?.(locked);
  };
  const onCanvasClick = () => {
    if (!locked) {
      const result = canvas.requestPointerLock?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    }
  };
  const onBlur = () => {
    held.clear();
    edges.clear();
    mouseDown = false;
    mouse2Down = false;
  };

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('blur', onBlur);
  window.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('click', onCanvasClick);

  const isHeld = (...codes) => codes.some((code) => held.has(code));
  const take = (code) => {
    if (!edges.has(code)) return false;
    edges.delete(code);
    return true;
  };

  return {
    get locked() { return locked; },
    get mouseDown() { return mouseDown; },
    get sensitivity() { return sensitivity; },
    set sensitivity(v) { sensitivity = Math.max(0.35, Math.min(2.5, v)); },
    lock: onCanvasClick,
    unlock: () => document.exitPointerLock?.(),
    clearEdges: () => edges.clear(),
    clearMouse: () => { mouseDX = 0; mouseDY = 0; mouseClicked = false; wheel = 0; },
    get wheel() { const w = wheel; wheel = 0; return w; },
    takeMouseClick() {
      const c = mouseClicked;
      mouseClicked = false;
      return c;
    },
    look() {
      const dx = mouseDX * 0.0022 * sensitivity;
      const dy = mouseDY * 0.0022 * sensitivity;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    forward: () => isHeld('KeyW'),
    back: () => isHeld('KeyS'),
    left: () => isHeld('KeyA'),
    right: () => isHeld('KeyD'),
    sprint: () => isHeld('ShiftLeft', 'ShiftRight'),
    jump: () => take('Space'),
    fire: () => mouseDown,
    firePressed: () => take('Mouse0'),
    interact: () => take('KeyE'),
    horn: () => isHeld('KeyF'),
    reload: () => take('KeyR'),
    weapon1: () => take('Digit1'),
    weapon2: () => take('Digit2'),
    weapon3: () => take('Digit3'),
    pause: () => take('Escape') || take('KeyP'),
    map: () => take('KeyM'),
    save: () => take('F5'),
    load: () => take('F9'),
    stationPrev: () => take('BracketLeft'),
    stationNext: () => take('BracketRight'),
    aim: () => mouse2Down,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('click', onCanvasClick);
    },
  };
}
// recorded-session note: key bindings and pointer-lock handling are unchanged

