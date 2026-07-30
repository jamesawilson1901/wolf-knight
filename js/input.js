// Touch-first input: hand-rolled virtual joystick FIXED to the bottom-left
// corner (always visible; touches near it grab the knob) + WASD/arrow
// keyboard fallback. Exposes a unified state:
//   move: {x, z} normalized to length <= 1 (screen-up = -z, world-aligned)
//   attack / special: edge-triggered button presses (consumed per frame)

const JOY_RADIUS = 52;    // px, knob travel
const JOY_CAPTURE = 130;  // px, touches this close to the stick grab it
const JOY_ANCHOR_X = 104; // px from the left edge
const JOY_ANCHOR_Y = 108; // px up from the bottom edge
const HOLD_TIME = 420;    // ms press-and-hold to open the form picker
const HOLD_SLOP = 14;     // px of movement that still counts as a hold
const TAP_TIME = 300;     // ms max for a right-half attack tap

export class Input {
  constructor() {
    this.move = { x: 0, z: 0 };
    this.onHold = null;    // (x, y, pointerId) => bool — return true to consume
    this.defending = false; // true while the shield button/key is held
    this._keys = new Set();
    this._joyPointer = null;
    this._attackQueued = false;
    this._specialQueued = false;
    this._formCycleQueued = false;
    this._jumpQueued = false;
    this._rangedQueued = false;
    this._potionQueued = false;
    this._pointers = new Map(); // id -> {x0, y0, t0, moved, held, timer}

    // action buttons (HTML, class .ui so the joystick/hold logic ignores them)
    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); down(); });
      if (up) {
        el.addEventListener('pointerup', (e) => { e.stopPropagation(); up(); });
        el.addEventListener('pointercancel', () => up());
        el.addEventListener('pointerleave', () => up());
      }
    };
    btn('btn-jump', () => { this._jumpQueued = true; });
    btn('btn-ranged', () => { this._rangedQueued = true; });
    btn('btn-defend', () => { this.defending = true; }, () => { this.defending = false; });

    this._base = document.getElementById('joy-base');
    this._knob = document.getElementById('joy-knob');

    // The stick lives at a fixed bottom-left anchor and is always on screen.
    this._anchor = { x: 0, y: 0 };
    const placeJoy = () => {
      this._anchor.x = JOY_ANCHOR_X;
      this._anchor.y = window.innerHeight - JOY_ANCHOR_Y;
      this._base.style.left = this._anchor.x + 'px';
      this._base.style.top = this._anchor.y + 'px';
      if (this._joyPointer === null) {
        this._knob.style.left = this._anchor.x + 'px';
        this._knob.style.top = this._anchor.y + 'px';
      }
    };
    placeJoy();
    window.addEventListener('resize', placeJoy);
    this._base.style.display = 'block';
    this._knob.style.display = 'block';

    const opts = { passive: false };
    window.addEventListener('pointerdown', (e) => this._onDown(e), opts);
    window.addEventListener('pointermove', (e) => this._onMove(e), opts);
    window.addEventListener('pointerup', (e) => this._onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this._onUp(e), opts);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); // keep focus/scroll in the game
      if (e.repeat) return;
      this._keys.add(e.code);
      if (e.code === 'KeyJ') this._attackQueued = true;
      if (e.code === 'KeyK') this._specialQueued = true;
      if (e.code === 'Tab') this._formCycleQueued = true;
      if (e.code === 'Space') this._jumpQueued = true;
      if (e.code === 'KeyL') this._rangedQueued = true;
      if (e.code === 'KeyH') this._potionQueued = true;
      if (e.code === 'ShiftLeft' || e.code === 'KeyI') this.defending = true;
    });
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'KeyI') this.defending = false;
    });
    window.addEventListener('blur', () => { this._keys.clear(); this.defending = false; });
  }

  _onDown(e) {
    if (e.target.closest && e.target.closest('.ui')) return; // HTML UI wins

    // Touches near the fixed stick grab it; resting a thumb there must NOT
    // pop the form picker, so joystick touches skip the hold timer.
    const nearStick =
      Math.hypot(e.clientX - this._anchor.x, e.clientY - this._anchor.y) < JOY_CAPTURE;
    if (nearStick && this._joyPointer === null) {
      this._joyPointer = e.pointerId;
      this._pointers.set(e.pointerId, {
        x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: true, held: false,
      });
      this._applyJoy(e.clientX - this._anchor.x, e.clientY - this._anchor.y);
      e.preventDefault();
      return;
    }

    const rec = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, held: false };
    // Press-and-hold anywhere else = radial form picker
    rec.timer = setTimeout(() => {
      if (rec.moved) return;
      if (this.onHold && this.onHold(rec.x0, rec.y0, e.pointerId)) rec.held = true;
    }, HOLD_TIME);
    this._pointers.set(e.pointerId, rec);
  }

  _onMove(e) {
    const rec = this._pointers.get(e.pointerId);
    if (rec && !rec.moved && Math.hypot(e.clientX - rec.x0, e.clientY - rec.y0) > HOLD_SLOP) {
      rec.moved = true;
      clearTimeout(rec.timer);
    }
    if (e.pointerId !== this._joyPointer) return;
    this._applyJoy(e.clientX - this._anchor.x, e.clientY - this._anchor.y);
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
    this._base.classList.remove('active');
    this._knob.classList.remove('active');
    this._knob.style.left = this._anchor.x + 'px';
    this._knob.style.top = this._anchor.y + 'px';
  }

  // Offset from the FIXED base center → move vector + knob position.
  _applyJoy(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
    this.move.x = dx / JOY_RADIUS;
    this.move.z = dy / JOY_RADIUS; // screen down = +z (toward camera)
    this._base.classList.add('active');
    this._knob.classList.add('active');
    this._knob.style.left = (this._anchor.x + dx) + 'px';
    this._knob.style.top = (this._anchor.y + dy) + 'px';
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

  consumeJump() {
    const v = this._jumpQueued;
    this._jumpQueued = false;
    return v;
  }

  consumeRanged() {
    const v = this._rangedQueued;
    this._rangedQueued = false;
    return v;
  }

  consumePotion() {
    const v = this._potionQueued;
    this._potionQueued = false;
    return v;
  }
}
