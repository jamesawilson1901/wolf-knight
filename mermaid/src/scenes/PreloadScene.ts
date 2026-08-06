import Phaser from 'phaser';
import { DESIGN_HEIGHT } from '../config';
import { MUSIC_PRESENT } from '../systems/audio';

// Loads the shared assets up front with a text-free progress bar. Background
// layers are per-level and loaded by GameScene on demand (everything is
// precached by the service worker either way).
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
    for (let ch = 1; ch <= 3; ch++) {
      this.load.atlas(`mermaid${ch}`, `mermaid${ch}.webp`, `mermaid${ch}.json`);
    }
    this.load.atlas('creatures', 'creatures.webp', 'creatures.json');
    this.load.atlas('items', 'items.webp', 'items.json');
    this.load.image('menu-bg', 'bg/b1s1/layer-1.webp');
    for (const key of ['ambient', 'pearl', 'coin', 'chest', 'complete', 'tap', 'joy', 'ouch', 'power', 'pop', 'danger', 'rumble']) {
      this.load.audio(key, `audio/${key}.wav`);
    }
    // Optional: only present once a music loop is dropped into audio-source/
    if (MUSIC_PRESENT) this.load.audio('music', 'audio/music.wav');
  }

  create() {
    this.registerAnimations();
    this.scene.start('start');
  }

  private registerAnimations() {
    for (let ch = 1; ch <= 3; ch++) {
      const mk = (name: string, prefix: string, rate = 12, repeat = -1) => {
        this.anims.create({
          key: `m${ch}-${name}`,
          frames: this.anims.generateFrameNames(`mermaid${ch}`, {
            prefix,
            start: 0,
            end: 9,
            zeroPad: 3,
          }),
          frameRate: rate,
          repeat,
        });
      };
      mk('idle', 'idle_');
      mk('move', 'move_', 14);
      mk('joy', 'joy_', 16, 0);
      mk('acceleration', 'acceleration_', 16);
      mk('hurt', 'hurt_', 14, 0);
    }

    const creature = (key: string, prefix: string, rate: number) => {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNames('creatures', {
          prefix,
          start: 0,
          end: 9,
          zeroPad: 3,
        }),
        frameRate: rate,
        repeat: -1,
      });
    };
    for (let f = 1; f <= 4; f++) creature(`fish-${f}`, `fish-${f}-move_`, 10);
    for (let j = 1; j <= 3; j++) creature(`jellyfish-${j}`, `jellyfish-${j}-move_`, 8);
    creature('urchin', 'urchin-move_', 7);
    creature('crab', 'crab-move_', 9);
    creature('shark', 'shark-move_', 9);
    creature('shark-attack', 'shark-attack-move_', 11);
    creature('lionfish', 'lionfish-move_', 10);
  }
}
