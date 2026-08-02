import Phaser from 'phaser';
import { DESIGN_HEIGHT } from '../config';
import { sfx } from '../systems/audio';

// One big pulsing play button, nothing else. The tap that starts the game is
// also the user gesture that unlocks iOS web audio.
export class StartScene extends Phaser.Scene {
  create() {
    const w = this.scale.width;
    this.add.image(w / 2, DESIGN_HEIGHT / 2, 'bg1').setDisplaySize(w, DESIGN_HEIGHT);

    const glow = this.add.circle(w / 2, DESIGN_HEIGHT / 2, 170, 0xbfe3ff, 0.18);
    const btn = this.add
      .image(w / 2, DESIGN_HEIGHT / 2, 'items', 'btn-play')
      .setScale(3.4);
    this.tweens.add({
      targets: [btn, glow],
      scale: '*=1.08',
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.input.once('pointerdown', () => {
      sfx(this, 'tap');
      this.cameras.main.fadeOut(450, 7, 37, 61);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('game');
      });
    });
  }
}
