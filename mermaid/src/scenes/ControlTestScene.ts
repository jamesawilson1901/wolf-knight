import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  MERMAID_SCREEN_X,
  PLAY_TOP,
  SAFE_WIDTH,
  SEAFLOOR_Y,
  safeBandLeft,
} from '../config';
import { VerticalControl } from '../systems/controls';
import { attachSchemeToggle } from '../systems/devtoggle';

// Build-order step 2: a plain coloured rectangle driven by both control
// schemes, for tuning on a real phone before any art. Reach it with
// ?test=controls (scheme toggle: C key or 4 taps top-left).
export class ControlTestScene extends Phaser.Scene {
  private control!: VerticalControl;
  private avatar!: Phaser.GameObjects.Rectangle;
  private trail: Phaser.GameObjects.Arc[] = [];

  create() {
    const w = this.scale.width;
    const left = safeBandLeft(w);

    // Safe band + play area guides
    this.add.rectangle(w / 2, DESIGN_HEIGHT / 2, SAFE_WIDTH, DESIGN_HEIGHT, 0x0d3c5f, 0.35);
    this.add.rectangle(w / 2, PLAY_TOP, SAFE_WIDTH, 4, 0x66aacc, 0.6);
    this.add.rectangle(w / 2, SEAFLOOR_Y, SAFE_WIDTH, 4, 0x66aacc, 0.6);

    this.control = new VerticalControl(this, SEAFLOOR_Y);
    this.avatar = this.add.rectangle(
      left + MERMAID_SCREEN_X,
      this.control.y,
      140,
      90,
      0xffb6d5,
    );
    attachSchemeToggle(this, this.control);
  }

  update(_time: number, delta: number) {
    this.control.update(delta);
    this.avatar.y = this.control.y;
    this.avatar.rotation = Phaser.Math.Clamp(this.control.vy / 2500, -0.35, 0.35);

    // faint motion trail so easing quality is visible in testing
    const dot = this.add.circle(this.avatar.x - 80, this.avatar.y, 6, 0xffffff, 0.5);
    this.trail.push(dot);
    this.tweens.add({ targets: dot, alpha: 0, x: dot.x - 250, duration: 900, onComplete: () => dot.destroy() });
    if (this.trail.length > 120) this.trail.shift();
  }
}
