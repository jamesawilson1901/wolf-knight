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
  private escort: { sprite: Phaser.GameObjects.Sprite; phase: number }[] = [];
  private crown?: Phaser.GameObjects.Image;
  private selected: 1 | 2 | 3 = 1;
  private t = 0;

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

    // Her collection, on show every time she opens the game: the fish she has
    // rescued swim around whichever mermaid is selected, and the crown sits
    // above her once she has finished the whole game. Ownership you can see
    // matters a lot at this age, and it costs nothing to display.
    const friends = Math.min(6, Number(localStorage.getItem(STORAGE_KEYS.friends)) || 0);
    for (let i = 0; i < friends; i++) {
      const species = (i % 3) + 1;
      this.escort.push({
        sprite: this.add
          .sprite(cx, charY, 'creatures', `fish-${species}-move_000`)
          .setScale(0.42)
          .setDepth(2)
          .play({ key: `fish-${species}`, startFrame: (i * 3) % 10 }),
        phase: (i / Math.max(1, friends)) * Math.PI * 2,
      });
    }
    if (localStorage.getItem(STORAGE_KEYS.crowned) === '1') {
      this.crown = this.add.image(cx, charY - 150, 'items', 'crown').setScale(0.7).setDepth(3);
    }

    this.pickCharacter(savedCharacter(), true);
    this.pickTint(Math.max(0, TINTS.indexOf(savedTint())), true);
  }

  update(_time: number, delta: number) {
    this.t += delta / 1000;
    const target = this.characters[this.selected - 1];
    if (!target) return;
    for (const f of this.escort) {
      const a = this.t * 0.55 + f.phase;
      f.sprite.x = target.x + Math.cos(a) * 190;
      f.sprite.y = target.y + Math.sin(a) * 88;
      f.sprite.setFlipX(Math.sin(a) < 0);
    }
    if (this.crown) this.crown.setPosition(target.x + 4, target.y - 150 + Math.sin(this.t * 1.3) * 6);
  }

  private pickCharacter(ch: 1 | 2 | 3, silent: boolean) {
    this.selected = ch;
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
