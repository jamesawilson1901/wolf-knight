import Phaser from 'phaser';
import { PLAY_TOP, SEAFLOOR_Y, SOFT_MARGIN, type SchemeId, STORAGE_KEYS } from '../config';

// Scheme A — hold to rise: touch anywhere and she swims up with easing;
// release and she sinks gently. The seafloor is a resting place.
const A_RISE_SPEED = -520;
const A_SINK_SPEED = 195;
const A_RISE_TAU = 0.16; // smoothing time constant (s)
const A_SINK_TAU = 0.55;

// Scheme B — relative drag: first touch point becomes the zero point;
// dragging up/down moves her proportionally. Lifting holds height briefly,
// then she drifts down gently (inattention is never punished, floor is safe).
const B_GAIN = 1.5;
const B_DEADZONE = 18; // design px
const B_TAU = 0.11;
const B_HOLD_AFTER_RELEASE = 2.5; // s of holding height after thumb lifts
const B_DRIFT_SPEED = 70; // gentle sink after that

// Scheme C — finger-follow (default): she swims to the finger's height,
// offset upward so the thumb never covers her. Release behaves like B.
const C_OFFSET = 150; // design px above the finger
const C_TAU = 0.11;

const KEY_SPEED = 520; // desktop dev fallback

export class VerticalControl {
  y: number;
  vy = 0; // observed vertical velocity, design px/s (for animation state)
  scheme: SchemeId;
  held = false;

  private activePointerId = -1;
  private anchorPointerY = 0;
  private anchorMermaidY = 0;
  private targetY: number;
  private sinceRelease = 999;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private firstTouchFired = false;
  onFirstTouch?: () => void;
  onTouchDown?: () => void;
  /** Touches inside this region (e.g. the sound toggle) don't drive movement. */
  ignoreRegion?: (x: number, y: number) => boolean;
  /** A second finger landing while one is already down — used to cast magic. */
  onSecondTouch?: () => void;
  /** Disabled during the chest ending, when she swims in on her own. */
  enabled = true;

  constructor(scene: Phaser.Scene, startY: number) {
    this.y = startY;
    this.targetY = startY;
    const saved = localStorage.getItem(STORAGE_KEYS.scheme);
    this.scheme = saved === 'A' || saved === 'B' ? saved : 'C';
    const qs = new URLSearchParams(location.search).get('scheme')?.toUpperCase();
    if (qs === 'A' || qs === 'B' || qs === 'C') this.scheme = qs;

    scene.input.addPointer(2); // tolerate both thumbs landing
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    this.cursors = scene.input.keyboard?.createCursorKeys();

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  setScheme(s: SchemeId) {
    this.scheme = s;
    localStorage.setItem(STORAGE_KEYS.scheme, s);
    this.release();
  }

  private onDown(pointer: Phaser.Input.Pointer) {
    if (this.ignoreRegion?.(pointer.x, pointer.y)) return;
    if (!this.firstTouchFired) {
      this.firstTouchFired = true;
      this.onFirstTouch?.();
    }
    this.onTouchDown?.();
    // Multi-touch tolerant: the first pointer steers; a second one casts magic.
    if (this.activePointerId !== -1) {
      this.onSecondTouch?.();
      return;
    }
    this.activePointerId = pointer.id;
    this.held = true;
    this.anchorPointerY = pointer.y;
    this.anchorMermaidY = this.y;
    this.targetY = this.scheme === 'C' ? this.fingerTarget(pointer.y) : this.y;
  }

  private fingerTarget(pointerY: number): number {
    return Phaser.Math.Clamp(pointerY - C_OFFSET, PLAY_TOP, SEAFLOOR_Y);
  }

  private onMove(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.activePointerId) return;
    if (this.scheme === 'C') {
      this.targetY = this.fingerTarget(pointer.y);
      return;
    }
    if (this.scheme !== 'B') return;
    let delta = (pointer.y - this.anchorPointerY) * B_GAIN;
    if (Math.abs(delta) < B_DEADZONE) delta = 0;
    else delta -= Math.sign(delta) * B_DEADZONE;
    this.targetY = Phaser.Math.Clamp(this.anchorMermaidY + delta, PLAY_TOP, SEAFLOOR_Y);
  }

  private onUp(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.activePointerId) return;
    this.release();
  }

  private release() {
    this.activePointerId = -1;
    this.held = false;
    this.sinceRelease = 0;
    this.targetY = this.y;
  }

  update(dtMs: number) {
    if (!this.enabled) {
      this.vy = 0;
      return;
    }
    const dt = Math.min(dtMs / 1000, 0.05);
    const prevY = this.y;
    if (!this.held) this.sinceRelease += dt;

    const keyUp = this.cursors?.up.isDown ?? false;
    const keyDown = this.cursors?.down.isDown ?? false;

    if (keyUp || keyDown) {
      const target = keyUp ? -KEY_SPEED : KEY_SPEED;
      this.vy = approach(this.vy, target, dt, 0.12);
      this.y += this.softened(this.vy) * dt;
    } else if (this.scheme === 'A') {
      const target = this.held ? A_RISE_SPEED : A_SINK_SPEED;
      const tau = this.held ? A_RISE_TAU : A_SINK_TAU;
      this.vy = approach(this.vy, target, dt, tau);
      this.y += this.softened(this.vy) * dt;
    } else {
      // Schemes B and C: ease toward a target height
      if (!this.held && this.sinceRelease > B_HOLD_AFTER_RELEASE) {
        this.targetY = Math.min(SEAFLOOR_Y, this.targetY + B_DRIFT_SPEED * dt);
      }
      const tau = this.scheme === 'C' ? C_TAU : B_TAU;
      const k = 1 - Math.exp(-dt / tau);
      this.y += (this.targetY - this.y) * k;
      this.vy = dt > 0 ? (this.y - prevY) / dt : 0;
    }

    this.y = Phaser.Math.Clamp(this.y, PLAY_TOP, SEAFLOOR_Y);
    // Resting against a bound: bleed off velocity so she settles into Idle
    // instead of reporting phantom movement.
    if (this.y >= SEAFLOOR_Y && this.vy > 0) this.vy = 0;
    if (this.y <= PLAY_TOP && this.vy < 0) this.vy = 0;
  }

  // Soft easing near the top and bottom of the play area, not a hard stop.
  private softened(vy: number): number {
    if (vy < 0 && this.y < PLAY_TOP + SOFT_MARGIN) {
      const t = Phaser.Math.Clamp((this.y - PLAY_TOP) / SOFT_MARGIN, 0, 1);
      return vy * t * (2 - t); // ease-out toward the bound
    }
    if (vy > 0 && this.y > SEAFLOOR_Y - SOFT_MARGIN) {
      const t = Phaser.Math.Clamp((SEAFLOOR_Y - this.y) / SOFT_MARGIN, 0, 1);
      return vy * t * (2 - t);
    }
    return vy;
  }

  get restingOnFloor(): boolean {
    return !this.held && this.y > SEAFLOOR_Y - 6 && Math.abs(this.vy) < 40;
  }

  get isMoving(): boolean {
    return Math.abs(this.vy) > 55;
  }
}

function approach(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
