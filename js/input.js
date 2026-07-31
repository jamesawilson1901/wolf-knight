// Touch-first input: FLOATING virtual joystick (appears wherever the thumb
// lands in the left 40% of the screen; faint idle hint at the classic spot)
// + WASD/arrow keyboard fallback. Exposes a unified state:
//   move: {x, z} normalized to length <= 1 (screen-up = -z, world-aligned)
//   attack / special / etc: edge-triggered presses (consumed per frame)
// The form button (#form-badge) taps to cycle forms and holds for the radial
// picker — press-and-hold anywhere else never opens it (no tap-spam clashes).

import { CONFIG } from './config.js';

const TAP_TIME = 300; // ms max for a right-half attack tap

export class Input {
  constructor() {
    this.move = { x: 0, z: 0 };
    this.onHold = null;      // (x, y, pointerId) => bool — open the radial picker
    this.onFormTap = null;   // () => void — cycle to the next unlocked form
    this.defending = false;  // true while the shield button/key is held
    this._keys = new Set();
    this._joyPointer = null;
    this._joyOrigin = { x: 0, y: 0 };
    this._attackQueued = false;
    this._specialQueued = false;
    this._formCycleQueued = false;
    this._jumpQueued = false;
    this._rangedQueued = false;
    this._potionQueued = false;
    this._pointers = new Map(); // id -> {x0, y0, t0, moved}

    // action buttons (HTML, class .ui so joystick logic ignores them)
    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); down(e); });
      if (up) {
        el.addEventListener('pointerup', (e) => { e.stopPropagation(); up(e); });
        el.addEventListener('pointercancel', (e) => up(e));
        el.addEventListener('pointerleave', (e) => up(e));
      }
    };
    btn('btn-jump', () => { this._jumpQueued = true; });
    btn('btn-ranged', () => { this._rangedQueued = true; });
    btn('btn-attack', () => { this._attackQueued = true; });
    btn('btn-defend', () => { this.defending = true; }, () => { this.defending = false; });

    // Form button: tap = cycle, hold CONFIG.FORM_HOLD_MS = radial picker.
    // Wired by hand (not via btn()) because the release must NOT stop
    // propagation: on touch screens the badge implicitly captures the
    // pointer, so the radial picker's window-level pointerup — the event
    // that selects an option and CLOSES the ring — arrives via this badge.
    // Swallowing it left the picker stuck open on phones.
    this._formHoldTimer = null;
    this._formHeld = false;
    {
      const badge = document.getElementById('form-badge');
      badge.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this._formHeld = false;
        clearTimeout(this._formHoldTimer);
        this._formHoldTimer = setTimeout(() => {
          this._formHeld = true;
          if (this.onHold) this.onHold(e.clientX, e.clientY, e.pointerId);
        }, CONFIG.FORM_HOLD_MS);
      });
      const badgeUp = () => {
        clearTimeout(this._formHoldTimer);
        if (!this._formHeld && this.onFormTap) this.onFormTap();
        this._formHeld = false;
      };
      badge.addEventListener('pointerup', badgeUp);
      badge.addEventListener('pointercancel', badgeUp);
    }

    this._base = document.getElementById('joy-base');
    this._knob = document.getElementById('joy-knob');
    this._hint = document.getElementById('joy-hint');
    this._base.style.display = 'none';
    this._knob.style.display = 'none';
    if (this._hint) this._hint.style.display = 'block';

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

    // Floating stick: any touch in the left zone becomes the stick's origin.
    if (e.clientX < window.innerWidth * CONFIG.JOY_ZONE && this._joyPointer === null) {
      this._joyPointer = e.pointerId;
      this._joyOrigin = { x: e.clientX, y: e.clientY };
      this._showJoy(0, 0);
      e.preventDefault();
      return;
    }

    this._pointers.set(e.pointerId, {
      x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false,
    });
  }

  _onMove(e) {
    const rec = this._pointers.get(e.pointerId);
    if (rec && !rec.moved && Math.hypot(e.clientX - rec.x0, e.clientY - rec.y0) > 14) {
      rec.moved = true;
    }
    if (e.pointerId !== this._joyPointer) return;
    // Thumb may drift far outside the radius — magnitude clamps, never detaches
    this._showJoy(e.clientX - this._joyOrigin.x, e.clientY - this._joyOrigin.y);
    e.preventDefault();
  }

  _onUp(e) {
    const rec = this._pointers.get(e.pointerId);
    if (rec) {
      this._pointers.delete(e.pointerId);
      // Right-half quick tap = attack (kids can tap anywhere on that side)
      if (!rec.moved &&
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
    if (this._hint) this._hint.style.opacity = String(CONFIG.JOY_HINT_OPACITY);
  }

  // Offset from the touch origin → move vector (dead-zoned, normalized) +
  // knob position (clamped to the ring).
  _showJoy(dx, dy) {
    const R = CONFIG.JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    let kx = dx, ky = dy;
    if (len > R) { kx = dx * R / len; ky = dy * R / len; }
    const dead = R * CONFIG.JOY_DEADZONE;
    if (len <= dead) {
      this.move.x = 0;
      this.move.z = 0;
    } else {
      // remap dead..R to 0..1 so speed still starts gently past the dead zone
      const m = Math.min(1, (len - dead) / (R - dead));
      this.move.x = (dx / len) * m;
      this.move.z = (dy / len) * m; // screen down = +z (toward camera)
    }
    this._base.style.display = 'block';
    this._knob.style.display = 'block';
    this._base.style.left = this._joyOrigin.x + 'px';
    this._base.style.top = this._joyOrigin.y + 'px';
    this._knob.style.left = (this._joyOrigin.x + kx) + 'px';
    this._knob.style.top = (this._joyOrigin.y + ky) + 'px';
    if (this._hint) this._hint.style.opacity = '0';
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
