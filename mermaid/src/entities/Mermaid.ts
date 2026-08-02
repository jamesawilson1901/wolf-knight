import Phaser from 'phaser';
import { MERMAID_SCREEN_X, STORAGE_KEYS, safeBandLeft, savedCharacter, savedTint } from '../config';
import { VerticalControl } from '../systems/controls';

// Animation state machine: Idle when still, Move when travelling, Joy briefly
// on collect, Hurt on an ouch (with a red flash and a little backwards bump),
// Acceleration wired but unused. Character and shimmer tint come from the
// customise menu.
export class Mermaid {
  sprite: Phaser.GameObjects.Sprite;
  control: VerticalControl;
  readonly character: 1 | 2 | 3;
  private baseTint: number;
  private joyUntil = 0;
  private hurtUntil = 0;
  private invulnUntil = 0;
  private bubbles: Phaser.GameObjects.Particles.ParticleEmitter;
  private bobT = 0;
  private baseX: number;
  private bumpX = 0;
  private shieldBubble?: Phaser.GameObjects.Image;
  private crown?: Phaser.GameObjects.Image;
  shielded = false;

  constructor(private scene: Phaser.Scene, startY: number) {
    this.character = savedCharacter();
    this.baseTint = savedTint();
    this.control = new VerticalControl(scene, startY);
    this.baseX = safeBandLeft(scene.scale.width) + MERMAID_SCREEN_X;
    this.sprite = scene.add
      .sprite(this.baseX, startY, `mermaid${this.character}`, 'idle_000')
      .setDepth(10)
      .play(this.anim('idle'));
    if (this.baseTint) this.sprite.setTint(this.baseTint);

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
    if (this.baseTint) this.bubbles.setParticleTint(this.baseTint);

    // Finishing all seven levels earns the crown, worn forever after.
    if (localStorage.getItem(STORAGE_KEYS.crowned) === '1') this.wearCrown();
  }

  wearCrown() {
    if (this.crown) return;
    this.crown = this.scene.add
      .image(this.sprite.x, this.sprite.y - 100, 'items', 'crown')
      .setDepth(11)
      .setScale(0.75);
  }

  private anim(name: string): string {
    return `m${this.character}-${name}`;
  }

  triggerJoy() {
    if (this.scene.time.now < this.hurtUntil) return;
    this.joyUntil = this.scene.time.now + 750;
    this.sprite.play(this.anim('joy'), true);
  }

  private accelUntil = 0;

  /** Starlight dash pose, held for the duration of the surge. */
  triggerAcceleration(ms: number) {
    this.joyUntil = 0;
    this.accelUntil = this.scene.time.now + ms;
    this.sprite.play(this.anim('acceleration'), true);
  }

  gainShield() {
    this.shielded = true;
    if (!this.shieldBubble) {
      this.shieldBubble = this.scene.add
        .image(this.sprite.x, this.sprite.y, 'items', 'glow')
        .setDepth(11)
        .setTint(0x7fd0ff)
        .setAlpha(0.5)
        .setScale(1.6);
      this.scene.tweens.add({
        targets: this.shieldBubble,
        alpha: 0.32,
        scale: 1.75,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.shieldBubble.setVisible(true);
  }

  private popShield() {
    this.shielded = false;
    this.shieldBubble?.setVisible(false);
  }

  /**
   * Harmless "ouch": red flash, Hurt animation, a little backwards bump, then
   * a grace period. A shield bubble absorbs it with a pop instead. Returns
   * what happened so the scene can pick the sound.
   */
  /** Extra grace period (e.g. while starlight-dashing through the reef). */
  grantGrace(ms: number) {
    this.invulnUntil = Math.max(this.invulnUntil, this.scene.time.now + ms);
  }

  triggerHurt(): 'shielded' | 'hurt' | 'grace' {
    const now = this.scene.time.now;
    if (now < this.invulnUntil) return 'grace';
    this.invulnUntil = now + 2000;
    this.bumpX = -130; // the little bump backwards; eases back in update()
    if (this.shielded) {
      this.popShield();
      return 'shielded';
    }
    this.hurtUntil = now + 950;
    this.joyUntil = 0;
    this.sprite.play(this.anim('hurt'), true);
    this.sprite.setTint(0xff7a7a);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.55,
      duration: 150,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        if (this.baseTint) this.sprite.setTint(this.baseTint);
        else this.sprite.clearTint();
        this.sprite.setAlpha(1);
      },
    });
    return 'hurt';
  }

  update(dtMs: number) {
    const c = this.control;
    c.update(dtMs);
    this.bobT += dtMs / 1000;

    // ease the bump back to her usual spot
    this.bumpX += (0 - this.bumpX) * (1 - Math.exp(-(dtMs / 1000) / 0.45));
    this.sprite.x = this.baseX + this.bumpX;

    const bob = c.isMoving ? 0 : Math.sin(this.bobT * 1.7) * 6;
    this.sprite.y = c.y + bob;
    this.sprite.rotation = Phaser.Math.Clamp(c.vy / 2600, -0.3, 0.3);
    this.shieldBubble?.setPosition(this.sprite.x, this.sprite.y);
    if (this.crown) {
      this.crown.setPosition(this.sprite.x + 6, this.sprite.y - 100);
      this.crown.rotation = this.sprite.rotation * 0.6;
    }

    const now = this.scene.time.now;
    const inHurt = now < this.hurtUntil;
    const inJoy = now < this.joyUntil;
    const inAccel = now < this.accelUntil;
    const key = this.sprite.anims.currentAnim?.key;
    if (inHurt) {
      if (key !== this.anim('hurt')) this.sprite.play(this.anim('hurt'), true);
    } else if (inAccel) {
      if (key !== this.anim('acceleration')) this.sprite.play(this.anim('acceleration'), true);
    } else if (!inJoy) {
      const want = c.isMoving ? this.anim('move') : this.anim('idle');
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
