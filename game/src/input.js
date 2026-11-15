// Input: keyboard state, mouse look deltas, pointer lock, and edge-triggered presses.
// Nothing here knows about the game — it only reports what the operator did. The
// buy-menu keys, reload, grenade and plant are plain keydown events the main loop
// consumes once per frame.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let lookDx = 0;
  let lookDy = 0;
  let firing = false;
  let zooming = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
    zooming = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookDx += e.movementX;
    lookDy += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) { firing = false; zooming = false; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!locked) {
      canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) firing = true;
    if (e.button === 2) zooming = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
    if (e.button === 2) zooming = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    keys,
    get locked() { return locked; },
    get firing() { return firing; },
    get zooming() { return zooming; },
    consumeLook() {
      const out = { dx: lookDx, dy: lookDy };
      lookDx = 0;
      lookDy = 0;
      return out;
    },
    wasPressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    endFrame() { pressed.clear(); },
    lock() { canvas.requestPointerLock(); },
  };
}
