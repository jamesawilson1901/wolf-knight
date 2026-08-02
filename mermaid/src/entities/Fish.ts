import Phaser from 'phaser';
import type { FishDef } from '../level';

// Friendly fish drifting on slow sine paths. Near the mermaid they turn to
// look at her and ease gently out of her way — never into it.
export class Fish {
  sprite: Phaser.GameObjects.Sprite;
  private worldX: number;
  private avoid = 0;
  private t: number;

  constructor(scene: Phaser.Scene, private def: FishDef) {
    this.worldX = def.worldX;
    this.t = def.worldX * 0.013; // decorrelate phases
    this.sprite = scene.add
      .sprite(-500, def.baseY, 'creatures', `fish-${def.species}-move_000`)
      .setScale(def.scale)
      .setDepth(def.depth)
      .play({ key: `fish-${def.species}`, startFrame: def.worldX % 10 });
    if (def.depth === 6) this.sprite.setAlpha(0.92); // slightly hazier behind her
  }

  update(dtMs: number, bandLeft: number, scrollX: number, mermaidX: number, mermaidY: number, screenW: number) {
    const dt = dtMs / 1000;
    this.t += dt;
    this.worldX -= this.def.drift * dt;
    const x = bandLeft + this.worldX - scrollX;
    if (x < -300 || x > screenW + 400) {
      this.sprite.setVisible(false);
      return;
    }
    this.sprite.setVisible(true);

    const near =
      Math.abs(x - mermaidX) < 330 && Math.abs(this.sprite.y - mermaidY) < 280;
    const target = near ? Math.sign(this.sprite.y - mermaidY || 1) * 130 : 0;
    this.avoid += (target - this.avoid) * (1 - Math.exp(-dt / 0.5));

    this.sprite.x = x;
    this.sprite.y = this.def.baseY + Math.sin(this.t * this.def.freq * Math.PI * 2) * this.def.amp + this.avoid;

    // Fish art faces left; when she's close, turn to look at her (with a
    // little hysteresis so they don't flip-flap right above her).
    if (near && Math.abs(x - mermaidX) > 50) {
      this.sprite.setFlipX(mermaidX > x);
    } else if (!near) {
      this.sprite.setFlipX(false);
    }
  }
}
