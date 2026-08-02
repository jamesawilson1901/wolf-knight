import Phaser from 'phaser';
import { MERMAID_SCREEN_X, safeBandLeft } from '../config';
import { VerticalControl } from '../systems/controls';

// Animation state machine: Idle when still, Move when travelling vertically,
// Joy briefly on collect (never interrupts control), Acceleration wired but
// unused in level 1.
export class Mermaid {
  sprite: Phaser.GameObjects.Sprite;
  control: VerticalControl;
  private joyUntil = 0;
  private bubbles: Phaser.GameObjects.Particles.ParticleEmitter;
  private bobT = 0;

  constructor(private scene: Phaser.Scene, startY: number) {
    this.control = new VerticalControl(scene, startY);
    const x = safeBandLeft(scene.scale.width) + MERMAID_SCREEN_X;
    this.sprite = scene.add
      .sprite(x, startY, 'mermaid', 'idle_000')
      .setDepth(10)
      .play('mermaid-idle');

    this.bubbles = scene.add.particles(0, 0, 'items', {
      frame: ['bubble-1', 'bubble-2', 'bubble-3'],
      follow: this.sprite,
      followOffset: { x: -70, y: 10 },
      lifespan: 1400,
      speedX: { min: -160, max: -100 },
      speedY: { min: -40, max: 10 },
      scale: { start: 0.35, end: 0.1 },
      alpha: { start: 0.6, end: 0 },
      frequency: 90,
      emitting: false,
    });
    this.bubbles.setDepth(9);
  }

  triggerJoy() {
    this.joyUntil = this.scene.time.now + 750;
    this.sprite.play('mermaid-joy', true);
  }

  // Wired up for later levels; intentionally never triggered in level 1.
  triggerAcceleration(until: number) {
    this.joyUntil = 0;
    this.sprite.play('mermaid-accel', true);
    this.scene.time.delayedCall(until, () => this.sprite.play('mermaid-idle', true));
  }

  update(dtMs: number) {
    const c = this.control;
    c.update(dtMs);
    this.bobT += dtMs / 1000;

    // gentle bob when resting/idling so she always feels alive
    const bob = c.isMoving ? 0 : Math.sin(this.bobT * 1.7) * 6;
    this.sprite.y = c.y + bob;
    this.sprite.rotation = Phaser.Math.Clamp(c.vy / 2600, -0.3, 0.3);

    const now = this.scene.time.now;
    const inJoy = now < this.joyUntil;
    const key = this.sprite.anims.currentAnim?.key;
    if (!inJoy) {
      const want = c.isMoving ? 'mermaid-move' : 'mermaid-idle';
      if (key !== want) this.sprite.play(want, true);
    }
    this.bubbles.emitting = c.vy < -110;
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.control.y;
  }
}
