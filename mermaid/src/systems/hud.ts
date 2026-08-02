import Phaser from 'phaser';
import { safeBandLeft, SAFE_WIDTH } from '../config';
import { isMuted, setMuted, sfx } from './audio';
import type { Insets } from './safearea';

// HUD: pearl icon + digit sprites. That's it. No text anywhere.
export class Hud {
  count = 0;
  private icon: Phaser.GameObjects.Image;
  private digits: Phaser.GameObjects.Image[] = [];
  private soundBtn: Phaser.GameObjects.Image;
  private soundCenter: { x: number; y: number };

  constructor(private scene: Phaser.Scene, insets: Insets) {
    const band = safeBandLeft(scene.scale.width);
    const x = Math.max(band + 70, insets.left + 60);
    const y = Math.max(70, insets.top + 50);
    this.icon = scene.add.image(x, y, 'items', 'pearl').setDepth(100).setScale(1.15);
    this.renderDigits();

    // Sound toggle: top-right, adult-finger sized, away from her thumbs
    // (they live in the bottom corners).
    const bx = Math.min(band + SAFE_WIDTH - 80, scene.scale.width - insets.right - 80);
    const by = Math.max(78, insets.top + 56);
    this.soundCenter = { x: bx, y: by };
    this.soundBtn = scene.add
      .image(bx, by, 'items', isMuted() ? 'btn-sound-off' : 'btn-sound')
      .setDepth(100)
      .setAlpha(0.85)
      .setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerdown', () => {
      const muted = !isMuted();
      setMuted(scene, muted);
      this.soundBtn.setFrame(muted ? 'btn-sound-off' : 'btn-sound');
      sfx(scene, 'tap');
    });
  }

  /** The control layer ignores touches here so tapping the toggle never moves her. */
  inSoundButton(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(x, y, this.soundCenter.x, this.soundCenter.y) < 95;
  }

  get flyTarget() {
    return { x: this.icon.x, y: this.icon.y };
  }

  add(n = 1) {
    this.count = Math.min(99, this.count + n);
    this.renderDigits();
    this.scene.tweens.add({
      targets: [this.icon, ...this.digits],
      scale: '*=1.25',
      duration: 110,
      yoyo: true,
    });
  }

  private renderDigits() {
    this.digits.forEach((d) => d.destroy());
    this.digits = [];
    const str = String(this.count);
    let x = this.icon.x + 74;
    for (const ch of str) {
      const img = this.scene.add
        .image(x, this.icon.y, 'items', `digit-${ch}`)
        .setDepth(100)
        .setScale(1.2);
      this.digits.push(img);
      x += 54;
    }
  }
}
