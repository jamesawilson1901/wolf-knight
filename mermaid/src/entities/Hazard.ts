import Phaser from 'phaser';
import type { HazardDef } from '../level';

const TOUCH_RADIUS = 82; // deliberately smaller than it looks — err in her favour
const SHARK_RADIUS = 130;

// Ouchy creatures. Touching one flashes the mermaid red and plays a sound;
// there is no health, no loss, no fail state.
export class Hazard {
  sprite: Phaser.GameObjects.Sprite;
  private t: number;

  private sharkDrift = 0;

  constructor(scene: Phaser.Scene, private def: HazardDef) {
    this.t = def.worldX * 0.017;
    this.sprite = scene.add
      .sprite(-500, def.baseY, 'creatures', `${def.kind}-move_000`)
      .setDepth(8)
      .play({ key: def.kind, startFrame: Math.floor(def.worldX) % 10 });
    if (def.kind === 'crab') this.sprite.setOrigin(0.5, 0.9); // feet on the sand
  }

  update(dtMs: number, bandLeft: number, scrollX: number, screenW: number) {
    const dt = dtMs / 1000;
    this.t += dt;
    let x = bandLeft + this.def.worldX - scrollX;
    let y = this.def.baseY;
    if (this.def.kind === 'urchin') {
      y += Math.sin(this.t * 0.7) * 34; // slow drift, easy to read
    } else if (this.def.kind === 'crab') {
      const patrol = Math.sin(this.t * 0.45) * 90; // slow floor patrol
      x += patrol;
      this.sprite.setFlipX(Math.cos(this.t * 0.45) > 0);
    } else {
      // shark: swims slowly toward the player on a big lazy sine — the most
      // telegraphed thing in the sea
      this.sharkDrift += 85 * dt;
      x -= this.sharkDrift;
      y += Math.sin(this.t * 0.5) * 110;
    }
    this.sprite.setVisible(x > -400 && x < screenW + 450);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  touches(mx: number, my: number): boolean {
    if (!this.sprite.visible) return false;
    const r = this.def.kind === 'shark' ? SHARK_RADIUS : TOUCH_RADIUS;
    return Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, mx, my) < r;
  }
}
