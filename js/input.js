// Touch-first input: hand-rolled virtual joystick (pointer events, left half
// of the screen) + WASD/arrow keyboard fallback. Exposes a unified state:
//   move: {x, z} normalized to length <= 1 (screen-up = -z, world-aligned)
//   attack / special: edge-triggered button presses (consumed per frame)
// Attack taps and the form picker arrive in later phases; the right-half tap
// zone is already reserved here so Phase 4 only adds consumers.

const JOY_RADIUS = 52; // px, knob travel

export class Input {
  constructor() {
    this.move = { x: 0, z: 0 };
    this._keys = new Set();
    this._joyPointer = null;
    this._joyOrigin = { x: 0, y: 0 };
    this._attackQueued = false;
    this._specialQueued = false;

    this._base = document.getElementById('joy-base');
    this._knob = document.getElementById('joy-knob');

    const opts = { passive: false };
    window.addEventListener('pointerdown', (e) => this._onDown(e), opts);
    window.addEventListener('pointermove', (e) => this._onMove(e), opts);
    window.addEventListener('pointerup', (e) => this._onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this._onUp(e), opts);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._keys.add(e.code);
      if (e.code === 'KeyJ') this._attackQueued = true;
      if (e.code === 'KeyK') this._specialQueued = true;
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => this._keys.clear());
  }

  _onDown(e) {
    if (e.target.closest && e.target.closest('.ui')) return; // HTML UI wins
    if (e.clientX < window.innerWidth * 0.5) {
      if (this._joyPointer !== null) return;
      this._joyPointer = e.pointerId;
      this._joyOrigin = { x: e.clientX, y: e.clientY };
      this._showJoy(e.clientX, e.clientY, 0, 0);
      e.preventDefault();
    } else {
      this._attackQueued = true; // right-half tap = attack (used from Phase 4)
    }
  }

  _onMove(e) {
    if (e.pointerId !== this._joyPointer) return;
    let dx = e.clientX - this._joyOrigin.x;
    let dy = e.clientY - this._joyOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
    this.move.x = dx / JOY_RADIUS;
    this.move.z = dy / JOY_RADIUS; // screen down = +z (toward camera)
    this._showJoy(this._joyOrigin.x, this._joyOrigin.y, dx, dy);
    e.preventDefault();
  }

  _onUp(e) {
    if (e.pointerId !== this._joyPointer) return;
    this._joyPointer = null;
    this.move.x = 0;
    this.move.z = 0;
    this._base.style.display = 'none';
    this._knob.style.display = 'none';
  }

  _showJoy(cx, cy, dx, dy) {
    this._base.style.display = 'block';
    this._knob.style.display = 'block';
    this._base.style.left = cx + 'px';
    this._base.style.top = cy + 'px';
    this._knob.style.left = (cx + dx) + 'px';
    this._knob.style.top = (cy + dy) + 'px';
  }

  // Combined joystick + keyboard move vector, length clamped to 1.
  getMove() {
    let x = this.move.x;
    let z = this.move.z;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) x -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) x += 1;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) z -= 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  consumeAttack() {
    const v = this._attackQueued;
    this._attackQueued = false;
    return v;
  }

  consumeSpecial() {
    const v = this._specialQueued;
    this._specialQueued = false;
    return v;
  }
}
