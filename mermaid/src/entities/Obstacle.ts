import Phaser from 'phaser';
import { PLAY_TOP } from '../config';
import { OBSTACLE_SIZE, type ObstacleDef } from '../level';

const SEABED_Y = 968; // where props are planted, just under the resting lane

// A prop she has to swim around. Floor props are planted on the seabed and
// grow upward; ceiling props hang from the rock roof. Nothing floats loose in
// open water. Bumping one costs the usual harmless ouch — it never blocks her
// outright, so there is no way to get stuck.
export class Obstacle {
  sprite: Phaser.GameObjects.Image;
  private rx: number;
  private ry: number;
  private cy: number;

  constructor(scene: Phaser.Scene, private def: ObstacleDef) {
    const size = OBSTACLE_SIZE[def.kind];
    this.sprite = scene.add.image(-900, 0, 'items', def.kind).setDepth(7.5);

    // scale the art so it reaches the requested distance from its anchor
    const baseH = this.sprite.height || 1;
    const scale = Phaser.Math.Clamp(def.reach / baseH, 0.55, 1.6);
    this.sprite.setScale(scale);
    this.rx = size.rx * scale;
    this.ry = size.ry * scale;

    if (def.anchor === 'floor') {
      this.sprite.setOrigin(0.5, 1).setY(SEABED_Y);
      this.cy = SEABED_Y - this.sprite.displayHeight / 2;
    } else {
      this.sprite.setOrigin(0.5, 0).setY(PLAY_TOP - 40).setFlipY(true);
      this.cy = PLAY_TOP - 40 + this.sprite.displayHeight / 2;
    }
  }

  update(bandLeft: number, scrollX: number, screenW: number) {
    const x = bandLeft + this.def.worldX - scrollX;
    this.sprite.setVisible(x > -350 && x < screenW + 350);
    this.sprite.x = x;
  }

  touches(mx: number, my: number): boolean {
    if (!this.sprite.visible) return false;
    const dx = (mx - this.sprite.x) / this.rx;
    const dy = (my - this.cy) / this.ry;
    return dx * dx + dy * dy < 1;
  }
}
