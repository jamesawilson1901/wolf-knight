import Phaser from 'phaser';
import { DESIGN_HEIGHT, LEVELS_COMPLETE_KEY, STORAGE_KEYS, savedCharacter, savedTint } from '../config';
import { sfx, startAmbient } from '../systems/audio';

/**
 * The end of the game. She has finished every level, so this is a real
 * curtain call rather than another lap: her mermaid, crowned, with every fish
 * friend she rescued circling her, the open chest, and a rain of pearls.
 *
 * It holds forever — nothing here can time out or fail — with one big play
 * button if she wants to go round again from the first level.
 */
export class VictoryScene extends Phaser.Scene {
  create() {
    const w = this.scale.width;
    const cx = w / 2;
    const cy = DESIGN_HEIGHT / 2 - 40;
    localStorage.setItem(LEVELS_COMPLETE_KEY, '1');

    this.add.image(cx, DESIGN_HEIGHT / 2, 'menu-bg').setDisplaySize(w, DESIGN_HEIGHT);
    this.add.rectangle(cx, DESIGN_HEIGHT / 2, w, DESIGN_HEIGHT, 0x08375a, 0.35);

    // sunbeam behind her
    const halo = this.add.image(cx, cy, 'items', 'glow').setScale(4.5).setAlpha(0.35);
    this.tweens.add({ targets: halo, scale: 5.2, alpha: 0.22, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const character = savedCharacter();
    const tint = savedTint();
    const her = this.add.sprite(cx, cy, `mermaid${character}`, 'idle_000').setScale(2.2).play(`m${character}-joy`);
    if (tint) her.setTint(tint);
    her.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => her.play(`m${character}-idle`));
    this.tweens.add({ targets: her, y: cy - 24, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const crown = this.add.image(cx + 10, cy - 232, 'items', 'crown').setScale(1.5).setDepth(4);
    this.tweens.add({ targets: crown, y: cy - 252, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // every friend she rescued, swimming a slow ring around her
    const friends = Math.min(6, Number(localStorage.getItem(STORAGE_KEYS.friends)) || 0);
    const ring: { sprite: Phaser.GameObjects.Sprite; phase: number }[] = [];
    for (let i = 0; i < friends; i++) {
      const species = (i % 3) + 1;
      const sprite = this.add
        .sprite(cx, cy, 'creatures', `fish-${species}-move_000`)
        .setScale(0.85)
        .setDepth(5)
        .play({ key: `fish-${species}`, startFrame: (i * 3) % 10 });
      ring.push({ sprite, phase: (i / Math.max(1, friends)) * Math.PI * 2 });
    }
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, delta: number) => {
      this.ringT += delta / 1000;
      for (const f of ring) {
        const a = this.ringT * 0.5 + f.phase;
        f.sprite.x = cx + Math.cos(a) * 300;
        f.sprite.y = cy + Math.sin(a) * 130;
        f.sprite.setFlipX(Math.sin(a) < 0);
      }
    });

    // pearls raining gently, forever
    this.add
      .particles(0, 0, 'items', {
        frame: ['pearl', 'sparkle'],
        x: { min: 0, max: w },
        y: -60,
        lifespan: 5200,
        speedY: { min: 90, max: 190 },
        speedX: { min: -30, max: 30 },
        scale: { start: 0.7, end: 0.3 },
        alpha: { start: 1, end: 0.2 },
        rotate: { start: 0, end: 220 },
        frequency: 260,
      })
      .setDepth(30);

    startAmbient(this);
    sfx(this, 'complete');
    this.time.delayedCall(900, () => sfx(this, 'joy'));
    this.cameras.main.fadeIn(900, 7, 37, 61);

    // one big play button — a fresh run from the first level
    this.time.delayedCall(2200, () => {
      const glow = this.add.circle(cx, DESIGN_HEIGHT - 170, 130, 0xbfe3ff, 0.18).setDepth(199);
      const btn = this.add
        .image(cx, DESIGN_HEIGHT - 170, 'items', 'btn-play')
        .setDepth(200)
        .setScale(0.1)
        .setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: btn, scale: 1.9, duration: 450, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: [btn, glow],
        scale: '*=1.09',
        delay: 500,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      btn.once('pointerdown', () => {
        sfx(this, 'tap');
        localStorage.setItem(STORAGE_KEYS.level, '0');
        this.cameras.main.fadeOut(500, 7, 37, 61);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('start');
        });
      });
    });
  }

  private ringT = 0;
}
