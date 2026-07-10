// Touch-first input: hand-rolled virtual joystick (pointer events, left half
// of the screen) + WASD/arrow keyboard fallback. Exposes a unified state:
//   move: {x, z} normalized to length <= 1 (screen-up = -z, world-aligned)
//   attack / special: edge-triggered button presses (consumed per frame)
// Attack taps and the form picker arrive in later phases; the right-half tap
// zone is already reserved here so Phase 4 only adds consumers.

const JOY_RADIUS = 52;    // px, knob travel
const HOLD_TIME = 420;    // ms press-and-hold to open the form picker
const HOLD_SLOP = 14;     // px of movement that still counts as a hold
const TAP_TIME = 300;     // ms max for a right-half attack tap

export class Input {
  constructor() {
    this.move = { x: 0, z: 0 };
    this.onHold = null;    // (x, y, pointerId) => bool — return true to consume
    this._keys = new Set();
    this._joyPointer = null;
    this._joyOrigin = { x: 0, y: 0 };
    this._attackQueued = false;
    this._specialQueued = false;
    this._formCycleQueued = false;
    this._pointers = new Map(); // id -> {x0, y0, t0, moved, held, timer}

    this._base = document.getElementById('joy-base');
    this._knob = document.getElementById('joy-knob');

    const opts = { passive: false };
    window.addEventListener('pointerdown', (e) => this._onDown(e), opts);
    window.addEventListener('pointermove', (e) => this._onMove(e), opts);
    window.addEventListener('pointerup', (e) => this._onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this._onUp(e), opts);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault(); // keep focus in the game
      if (e.repeat) return;
      this._keys.add(e.code);
      if (e.code === 'KeyJ') this._attackQueued = true;
      if (e.code === 'KeyK') this._specialQueued = true;
      if (e.code === 'Tab') this._formCycleQueued = true;
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => this._keys.clear());
  }

  _onDown(e) {
    if (e.target.closest && e.target.closest('.ui')) return; // HTML UI wins

    const rec = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, held: false };
    // Press-and-hold anywhere = radial form picker
    rec.timer = setTimeout(() => {
      if (rec.moved) return;
      if (this.onHold && this.onHold(rec.x0, rec.y0, e.pointerId)) {
        rec.held = true;
        if (this._joyPointer === e.pointerId) this._releaseJoy();
      }
    }, HOLD_TIME);
    this._pointers.set(e.pointerId, rec);

    if (e.clientX < window.innerWidth * 0.5) {
      if (this._joyPointer !== null) return;
      this._joyPointer = e.pointerId;
      this._joyOrigin = { x: e.clientX, y: e.clientY };
      this._showJoy(e.clientX, e.clientY, 0, 0);
      e.preventDefault();
    }
  }

  _onMove(e) {
    const rec = this._pointers.get(e.pointerId);
    if (rec && !rec.moved && Math.hypot(e.clientX - rec.x0, e.clientY - rec.y0) > HOLD_SLOP) {
      rec.moved = true;
      clearTimeout(rec.timer);
    }
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
    const rec = this._pointers.get(e.pointerId);
    if (rec) {
      clearTimeout(rec.timer);
      this._pointers.delete(e.pointerId);
      // Right-half quick tap = attack (only if it wasn't a hold or a drag)
      if (!rec.held && !rec.moved &&
          rec.x0 >= window.innerWidth * 0.5 &&
          performance.now() - rec.t0 < TAP_TIME) {
        this._attackQueued = true;
      }
    }
    if (e.pointerId !== this._joyPointer) return;
    this._releaseJoy();
  }

  _releaseJoy() {
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

  consumeFormCycle() {
    const v = this._formCycleQueued;
    this._formCycleQueued = false;
    return v;
  }
}
