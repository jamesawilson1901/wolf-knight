import Phaser from 'phaser';
import { OBSTACLE_SIZE, type ObstacleDef } from '../level';

// A static prop she has to swim around: rocks standing on the floor, spires
// hanging from the ceiling, wreck parts and weed. Bumping one costs the usual
// harmless ouch — it never blocks her outright, so there's no way to get stuck.
export class Obstacle {
  sprite: Phaser.GameObjects.Image;
  private rx: number;
  private ry: number;

  constructor(scene: Phaser.Scene, private def: ObstacleDef) {
    const size = OBSTACLE_SIZE[def.kind];
    this.rx = size.rx;
    this.ry = size.ry;
    this.sprite = scene.add.image(-800, def.y, 'items', def.kind).setDepth(8);
    if (def.flipY) this.sprite.setFlipY(true);
  }

  update(bandLeft: number, scrollX: number, screenW: number) {
    const x = bandLeft + this.def.worldX - scrollX;
    this.sprite.setVisible(x > -350 && x < screenW + 350);
    this.sprite.x = x;
  }

  touches(mx: number, my: number): boolean {
    if (!this.sprite.visible) return false;
    const dx = (mx - this.sprite.x) / this.rx;
    const dy = (my - this.sprite.y) / this.ry;
    return dx * dx + dy * dy < 1;
  }
}
