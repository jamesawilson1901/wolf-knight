import Phaser from 'phaser';
import { PLAY_TOP, SEAFLOOR_Y } from '../config';

// The shark that was hiding in the trapped chest. It bursts out, herds her
// back the way she came, and is driven off by the rockfall. It is menace and
// theatre only: touching it costs the same harmless ouch as everything else,
// and it can never actually catch her — it holds station behind her.
export class ChaseShark {
  sprite: Phaser.GameObjects.Sprite;
  private y: number;
  private vy = 0;
  private lunge = 0;
  active = true;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.y = y;
    this.sprite = scene.add
      .sprite(x, y, 'creatures', 'shark-move_000')
      .setDepth(14)
      .setScale(1.25)
      .play('shark');
  }

  /** Chase: sit behind her (she is fleeing left, so the shark is to her right). */
  update(dtMs: number, mermaidX: number, mermaidY: number) {
    if (!this.active) return;
    const dt = Math.min(dtMs / 1000, 0.05);
    this.lunge += dt;
    // a slow in-and-out lunge so it feels alive and threatening
    const standoff = 330 + Math.sin(this.lunge * 1.6) * 90;
    const targetX = mermaidX + standoff;
    this.sprite.x += (targetX - this.sprite.x) * (1 - Math.exp(-dt / 0.5));
    this.vy += ((mermaidY - this.y) * 2.2 - this.vy) * (1 - Math.exp(-dt / 0.4));
    this.y += Phaser.Math.Clamp(this.vy, -320, 320) * dt;
    this.y = Phaser.Math.Clamp(this.y, PLAY_TOP, SEAFLOOR_Y);
    this.sprite.y = this.y;
    this.sprite.setFlipX(false); // art faces left — toward her
  }

  touches(mx: number, my: number): boolean {
    if (!this.active) return false;
    return Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, mx, my) < 150;
  }

  /** Blocked by the rockfall: turn tail and disappear off to the right. */
  fleeAway(onDone: () => void) {
    this.active = false;
    this.sprite.setFlipX(true);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + 2200,
      y: this.y - 120,
      duration: 2000,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.sprite.destroy();
        onDone();
      },
    });
  }
}
