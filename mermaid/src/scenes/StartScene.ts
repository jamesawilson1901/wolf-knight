import Phaser from 'phaser';
import { DESIGN_HEIGHT, STORAGE_KEYS, TINTS, savedCharacter, savedTint } from '../config';
import { sfx } from '../systems/audio';
import { tryFullscreen } from '../systems/fullscreen';

// The customise-your-mermaid menu, entirely icon-driven: three mermaids to
// tap (the chosen one glows and does her Joy dance), four shimmer pearls for
// a tint, and one big play button. Every choice persists on the device. The
// first tap here is also the user gesture that unlocks iOS web audio.
export class StartScene extends Phaser.Scene {
  private characters: Phaser.GameObjects.Sprite[] = [];
  private ring!: Phaser.GameObjects.Arc;
  private tintPearls: Phaser.GameObjects.Image[] = [];
  private tintRing!: Phaser.GameObjects.Arc;
  private starting = false;

  create() {
    this.starting = false;
    this.characters = [];
    this.tintPearls = [];
    // any tap on the menu takes the browser fullscreen (no-op when installed)
    this.input.on('pointerdown', tryFullscreen);

    const w = this.scale.width;
    const cx = w / 2;
    this.add.image(cx, DESIGN_HEIGHT / 2, 'menu-bg').setDisplaySize(w, DESIGN_HEIGHT);
    this.add.rectangle(cx, DESIGN_HEIGHT / 2, w, DESIGN_HEIGHT, 0x06304f, 0.35);

    // three mermaids, side by side
    const charY = 430;
    const spread = 330;
    this.ring = this.add.circle(0, charY, 150, 0xbfe3ff, 0.22);
    for (let ch = 1; ch <= 3; ch++) {
      const x = cx - spread + (ch - 1) * spread;
      const sprite = this.add
        .sprite(x, charY, `mermaid${ch}`, 'idle_000')
        .setScale(0.9)
        .setInteractive({ useHandCursor: true })
        .play({ key: `m${ch}-idle`, startFrame: ch * 3 });
      sprite.on('pointerdown', () => this.pickCharacter(ch as 1 | 2 | 3, false));
      this.characters.push(sprite);
    }

    // four shimmer pearls below
    const tintY = 790;
    this.tintRing = this.add.circle(0, tintY, 58, 0xffffff, 0.28);
    TINTS.forEach((tint, i) => {
      const x = cx - 180 + i * 120;
      const pearl = this.add
        .image(x, tintY, 'items', 'pearl')
        .setScale(1.1)
        .setInteractive({ useHandCursor: true });
      if (tint) pearl.setTint(tint);
      pearl.on('pointerdown', () => this.pickTint(i, false));
      this.tintPearls.push(pearl);
    });

    // big play button on the right
    const btnX = Math.min(cx + 640, w - 180);
    const glow = this.add.circle(btnX, 560, 140, 0xbfe3ff, 0.2);
    const btn = this.add
      .image(btnX, 560, 'items', 'btn-play')
      .setScale(2.4)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({
      targets: [btn, glow],
      scale: '*=1.09',
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    btn.on('pointerdown', () => this.startGame());

    this.pickCharacter(savedCharacter(), true);
    this.pickTint(Math.max(0, TINTS.indexOf(savedTint())), true);
  }

  private pickCharacter(ch: 1 | 2 | 3, silent: boolean) {
    localStorage.setItem(STORAGE_KEYS.character, String(ch));
    this.characters.forEach((s, i) => {
      const selected = i === ch - 1;
      s.setScale(selected ? 1.05 : 0.8);
      s.setAlpha(selected ? 1 : 0.75);
      if (selected) {
        this.ring.setPosition(s.x, s.y);
        if (!silent) {
          sfx(this, 'joy', { volume: 0.7 });
          s.play(`m${ch}-joy`, true);
          s.playAfterRepeat(`m${ch}-idle`);
        }
      } else if (s.anims.currentAnim?.key !== `m${i + 1}-idle`) {
        s.play(`m${i + 1}-idle`, true);
      }
    });
  }

  private pickTint(index: number, silent: boolean) {
    localStorage.setItem(STORAGE_KEYS.tint, String(index));
    const tint = TINTS[index] ?? 0;
    this.tintPearls.forEach((p, i) => p.setScale(i === index ? 1.35 : 1));
    this.tintRing.setPosition(this.tintPearls[index].x, this.tintPearls[index].y);
    this.characters.forEach((s) => {
      if (tint) s.setTint(tint);
      else s.clearTint();
    });
    if (!silent) sfx(this, 'pearl', { volume: 0.7 });
  }

  private startGame() {
    if (this.starting) return;
    this.starting = true;
    sfx(this, 'tap');
    this.cameras.main.fadeOut(450, 7, 37, 61);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('game');
    });
  }
}
