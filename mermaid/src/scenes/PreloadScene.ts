import Phaser from 'phaser';
import { DESIGN_HEIGHT } from '../config';

// Loads everything up front (it's all precached offline anyway) with a
// text-free progress bar.
export class PreloadScene extends Phaser.Scene {
  preload() {
    const w = this.scale.width;
    const barW = 560;
    const barY = DESIGN_HEIGHT / 2;
    const track = this.add.rectangle(w / 2, barY, barW, 22, 0x0d3c5f).setOrigin(0.5);
    const fill = this.add
      .rectangle(w / 2 - barW / 2, barY, 1, 14, 0xbfe3ff)
      .setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => {
      fill.width = Math.max(1, barW * v);
    });
    this.load.once('complete', () => {
      track.destroy();
      fill.destroy();
    });

    this.load.setPath('assets');
    this.load.atlas('mermaid', 'mermaid.webp', 'mermaid.json');
    this.load.atlas('creatures', 'creatures.webp', 'creatures.json');
    this.load.atlas('items', 'items.webp', 'items.json');
    for (let i = 1; i <= 6; i++) {
      this.load.image(`bg${i}`, `bg/layer-${i}.webp`);
    }
    this.load.audio('ambient', 'audio/ambient.wav');
    this.load.audio('pearl', 'audio/pearl.wav');
    this.load.audio('coin', 'audio/coin.wav');
    this.load.audio('chest', 'audio/chest.wav');
    this.load.audio('complete', 'audio/complete.wav');
    this.load.audio('tap', 'audio/tap.wav');
    this.load.audio('joy', 'audio/joy.wav');
    this.load.audio('ouch', 'audio/ouch.wav');
  }

  create() {
    this.registerAnimations();
    this.scene.start('start');
  }

  private registerAnimations() {
    const mk = (key: string, prefix: string, rate = 12, repeat = -1) => {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNames('mermaid', {
          prefix,
          start: 0,
          end: 9,
          zeroPad: 3,
        }),
        frameRate: rate,
        repeat,
      });
    };
    mk('mermaid-idle', 'idle_');
    mk('mermaid-move', 'move_', 14);
    mk('mermaid-joy', 'joy_', 16, 0);
    mk('mermaid-accel', 'acceleration_', 16);
    mk('mermaid-hurt', 'hurt_', 14, 0);

    this.anims.create({
      key: 'urchin',
      frames: this.anims.generateFrameNames('creatures', {
        prefix: 'urchin-move_',
        start: 0,
        end: 9,
        zeroPad: 3,
      }),
      frameRate: 7,
      repeat: -1,
    });
    this.anims.create({
      key: 'crab',
      frames: this.anims.generateFrameNames('creatures', {
        prefix: 'crab-move_',
        start: 0,
        end: 9,
        zeroPad: 3,
      }),
      frameRate: 9,
      repeat: -1,
    });

    for (let f = 1; f <= 4; f++) {
      this.anims.create({
        key: `fish-${f}`,
        frames: this.anims.generateFrameNames('creatures', {
          prefix: `fish-${f}-move_`,
          start: 0,
          end: 9,
          zeroPad: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
    for (let j = 1; j <= 3; j++) {
      this.anims.create({
        key: `jellyfish-${j}`,
        frames: this.anims.generateFrameNames('creatures', {
          prefix: `jellyfish-${j}-move_`,
          start: 0,
          end: 9,
          zeroPad: 3,
        }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }
}
