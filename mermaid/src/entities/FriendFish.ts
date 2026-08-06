import Phaser from 'phaser';

// A rescued fish friend: swims in a gentle line behind the mermaid, following
// her height with a delay so the chain waves as she moves.
export class FriendFish {
  sprite: Phaser.GameObjects.Sprite;
  private bob: number;

  constructor(
    scene: Phaser.Scene,
    public species: number,
    private slot: number, // 0 = closest behind her
    x: number,
    y: number,
  ) {
    this.bob = slot * 1.7;
    this.sprite = scene.add
      .sprite(x, y, 'creatures', `fish-${species}-move_000`)
      .setScale(0.55)
      .setDepth(9)
      .setFlipX(true) // fish art faces left; friends swim right with her
      .play({ key: `fish-${species}`, startFrame: (slot * 3) % 10 });
  }

  /** trailY samples the mermaid's height `delay` frames ago. */
  update(dtMs: number, t: number, mermaidX: number, trailY: number, facing: 1 | -1 = 1) {
    const dt = Math.min(dtMs / 1000, 0.05);
    this.sprite.setFlipX(facing === 1);
    const targetX = mermaidX - facing * (120 + this.slot * 95);
    const targetY = trailY + Math.sin(t * 2.1 + this.bob) * 12;
    const k = 1 - Math.exp(-dt / 0.22);
    this.sprite.x += (targetX - this.sprite.x) * k;
    this.sprite.y += (targetY - this.sprite.y) * k;
    this.sprite.rotation = Phaser.Math.Clamp((targetY - this.sprite.y) / 700, -0.25, 0.25);
  }
}
