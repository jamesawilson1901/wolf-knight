import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  LEVEL_SCROLL,
  SCROLL_SPEED,
  SEAFLOOR_Y,
  safeBandLeft,
} from '../config';
import {
  CHEST_WORLD_X,
  CHEST_Y,
  PARALLAX,
  collectibles,
  fishDefs,
  jellyDefs,
  type Collectible,
} from '../level';
import { Fish } from '../entities/Fish';
import { Mermaid } from '../entities/Mermaid';
import { sfx, startAmbient } from '../systems/audio';
import { attachSchemeToggle } from '../systems/devtoggle';
import { Hud } from '../systems/hud';
import { safeInsets } from '../systems/safearea';

const COLLECT_RADIUS = 120; // deliberately forgiving

interface Pickup {
  data: Collectible;
  sprite: Phaser.GameObjects.Image;
  taken: boolean;
  phase: number;
}

export class GameScene extends Phaser.Scene {
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private mermaid!: Mermaid;
  private hud!: Hud;
  private fish: Fish[] = [];
  private jellies: { sprite: Phaser.GameObjects.Sprite; baseY: number; phase: number }[] = [];
  private pickups: Pickup[] = [];
  private chest!: Phaser.GameObjects.Image;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chestBurst!: Phaser.GameObjects.Particles.ParticleEmitter;

  private scrollX = 0;
  private scrollVel = SCROLL_SPEED;
  private ending: 'no' | 'arriving' | 'done' = 'no';
  private t = 0;

  create() {
    const w = this.scale.width;
    // dev: jump partway into the level, e.g. ?t0=7000
    this.scrollX = Number(new URLSearchParams(location.search).get('t0')) || 0;
    this.scrollVel = SCROLL_SPEED;
    this.ending = 'no';
    this.fish = [];
    this.jellies = [];
    this.pickups = [];
    this.layers = [];

    for (let i = 1; i <= 6; i++) {
      const ts = this.add
        .tileSprite(w / 2, DESIGN_HEIGHT / 2, w, DESIGN_HEIGHT, `bg${i}`)
        .setDepth(i <= 5 ? i - 1 : 20); // foreground grass in front of gameplay
      this.layers.push(ts);
    }

    // ambient bubbles drifting up through the scene
    this.add
      .particles(0, 0, 'items', {
        frame: ['bubble-1', 'bubble-2', 'bubble-3'],
        x: { min: 0, max: w },
        y: DESIGN_HEIGHT + 40,
        lifespan: 7000,
        speedY: { min: -150, max: -80 },
        speedX: { min: -18, max: 18 },
        scale: { start: 0.25, end: 0.7 },
        alpha: { start: 0.4, end: 0 },
        frequency: 420,
      })
      .setDepth(5);

    this.mermaid = new Mermaid(this, SEAFLOOR_Y);
    const insets = safeInsets(this);
    this.hud = new Hud(this, insets);
    this.mermaid.control.ignoreRegion = (x, y) => this.hud.inSoundButton(x, y);
    this.mermaid.control.onTouchDown = () => sfx(this, 'tap');
    attachSchemeToggle(this, this.mermaid.control);

    for (const c of collectibles) {
      const sprite = this.add
        .image(-500, c.y, 'items', c.kind)
        .setDepth(8)
        .setScale(c.kind === 'pearl' ? 1 : 0.95);
      this.pickups.push({ data: c, sprite, taken: false, phase: c.worldX % 7 });
    }

    for (const def of fishDefs) this.fish.push(new Fish(this, def));
    for (const def of jellyDefs) {
      const sprite = this.add
        .sprite(-500, def.baseY, 'creatures', `jellyfish-${def.species}-move_000`)
        .setDepth(7)
        .setAlpha(0.95)
        .play(`jellyfish-${def.species}`);
      this.tweens.add({
        targets: sprite,
        scaleX: 1.07,
        scaleY: 0.94,
        duration: 1150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.jellies.push({ sprite, baseY: def.baseY, phase: def.worldX });
    }

    this.chest = this.add.image(-600, CHEST_Y, 'items', 'chest-closed').setDepth(8);

    this.sparkles = this.add.particles(0, 0, 'items', {
      frame: 'sparkle',
      lifespan: 650,
      speed: { min: 60, max: 260 },
      scale: { start: 0.55, end: 0 },
      rotate: { start: 0, end: 180 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.sparkles.setDepth(30);
    this.chestBurst = this.add.particles(0, 0, 'items', {
      frame: ['pearl', 'sparkle'],
      lifespan: 1600,
      speed: { min: 180, max: 520 },
      angle: { min: 220, max: 320 },
      gravityY: 500,
      scale: { start: 0.8, end: 0.15 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.chestBurst.setDepth(30);

    startAmbient(this);
    this.cameras.main.fadeIn(500, 7, 37, 61);
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    this.t += dt;
    const w = this.scale.width;
    const band = safeBandLeft(w);

    // forward scroll — hers to ride, never to steer
    if (this.ending === 'no') {
      this.scrollX += this.scrollVel * dt;
      if (this.scrollX >= LEVEL_SCROLL) this.beginEnding();
    } else {
      this.scrollX += this.scrollVel * dt;
    }
    this.layers.forEach((ts, i) => {
      ts.tilePositionX = this.scrollX * PARALLAX[i];
    });

    this.mermaid.update(delta);

    for (const p of this.pickups) {
      if (p.taken) continue;
      const x = band + p.data.worldX - this.scrollX;
      if (x < -150 || x > w + 200) {
        p.sprite.setVisible(false);
        continue;
      }
      p.sprite.setVisible(true);
      p.sprite.x = x;
      p.sprite.y = p.data.y + Math.sin(this.t * 1.8 + p.phase) * 9;
      const d = Phaser.Math.Distance.Between(x, p.sprite.y, this.mermaid.x, this.mermaid.y);
      if (d < COLLECT_RADIUS) this.collect(p);
    }

    for (const f of this.fish) {
      f.update(delta, band, this.scrollX, this.mermaid.x, this.mermaid.y, w);
    }
    for (const j of this.jellies) {
      const x = band + j.phase - this.scrollX;
      j.sprite.setVisible(x > -250 && x < w + 250);
      if (!j.sprite.visible) continue;
      j.sprite.x = x;
      j.sprite.y = j.baseY + Math.sin(this.t * 0.42 + j.phase) * 46;
    }

    this.chest.x = band + CHEST_WORLD_X - this.scrollX;
  }

  private collect(p: Pickup) {
    p.taken = true;
    const { x, y } = p.sprite;
    sfx(this, p.data.kind === 'pearl' ? 'pearl' : 'coin', { volume: 0.9 });
    this.sparkles.explode(p.data.kind === 'pearl' ? 10 : 16, x, y);
    this.mermaid.triggerJoy();

    const target = this.hud.flyTarget;
    this.tweens.add({
      targets: p.sprite,
      x: target.x,
      y: target.y,
      scale: 0.5,
      duration: 480,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        p.sprite.destroy();
        this.hud.add(1);
      },
    });
  }

  private beginEnding() {
    this.ending = 'arriving';
    this.mermaid.control.enabled = false;
    // glide to a stop in front of the chest
    this.tweens.add({ targets: this, scrollVel: 0, duration: 1400, ease: 'Sine.easeOut' });
    this.time.delayedCall(1500, () => {
      // she swims over to it on her own — no input needed, no way to miss it
      this.tweens.add({
        targets: this.mermaid.sprite,
        x: this.chest.x - 250,
        duration: 900,
        ease: 'Sine.easeInOut',
      });
      this.tweens.addCounter({
        from: this.mermaid.control.y,
        to: CHEST_Y - 120,
        duration: 900,
        ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          this.mermaid.control.y = tw.getValue() ?? 0;
        },
      });
      this.time.delayedCall(1000, () => this.openChest());
    });
  }

  private openChest() {
    this.ending = 'done';
    this.chest.setFrame('chest-ajar');
    sfx(this, 'chest');
    this.time.delayedCall(500, () => {
      this.chest.setFrame('chest-open');
      this.chestBurst.explode(26, this.chest.x, this.chest.y - 40);
      const glow = this.add
        .image(this.chest.x, this.chest.y - 30, 'items', 'glow')
        .setDepth(29)
        .setScale(0.4)
        .setAlpha(0.9);
      this.tweens.add({ targets: glow, scale: 3.2, alpha: 0, duration: 1300, ease: 'Sine.easeOut' });
      this.mermaid.triggerJoy();
      this.time.delayedCall(650, () => {
        sfx(this, 'complete');
        this.mermaid.triggerJoy();
      });
      this.time.delayedCall(1600, () => this.showReplay());
    });
  }

  private showReplay() {
    const w = this.scale.width;
    const glow = this.add
      .circle(w / 2, DESIGN_HEIGHT / 2 - 60, 190, 0xbfe3ff, 0.16)
      .setDepth(199);
    const btn = this.add
      .image(w / 2, DESIGN_HEIGHT / 2 - 60, 'items', 'btn-restart')
      .setDepth(200)
      .setScale(0.1)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: btn, scale: 2.4, duration: 450, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: [btn, glow],
      scale: '*=1.09',
      delay: 500,
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    btn.once('pointerdown', () => {
      sfx(this, 'tap');
      this.cameras.main.fadeOut(500, 7, 37, 61);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.restart();
      });
    });
  }
}
