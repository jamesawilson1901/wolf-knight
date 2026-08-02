import Phaser from 'phaser';
import { DESIGN_HEIGHT, SEAFLOOR_Y, STORAGE_KEYS, safeBandLeft, savedLevel } from '../config';
import {
  CHEST_Y,
  LEVELS,
  buildLevel,
  chestWorldX,
  parallaxFactors,
  type Collectible,
  type LevelConfig,
  type PowerupDef,
} from '../level';
import { Fish } from '../entities/Fish';
import { FriendFish } from '../entities/FriendFish';
import { Hazard } from '../entities/Hazard';
import { Mermaid } from '../entities/Mermaid';
import { sfx, startAmbient } from '../systems/audio';
import { attachSchemeToggle } from '../systems/devtoggle';
import { Hud } from '../systems/hud';
import { safeInsets } from '../systems/safearea';

const COLLECT_RADIUS = 120; // deliberately forgiving
const MAGNET_RANGE = 620;
const MAGNET_MS = 6500;

interface Pickup {
  data: Collectible;
  sprite: Phaser.GameObjects.Image;
  taken: boolean;
  phase: number;
  pullX: number;
  pullY: number;
}
interface Powerup {
  data: PowerupDef;
  sprite: Phaser.GameObjects.Image;
  taken: boolean;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private cfg!: LevelConfig;
  private worldReady = false;
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private factors: number[] = [];
  private mermaid!: Mermaid;
  private hud!: Hud;
  private fish: Fish[] = [];
  private jellies: { sprite: Phaser.GameObjects.Sprite; baseY: number; phase: number }[] = [];
  private pickups: Pickup[] = [];
  private powerups: Powerup[] = [];
  private hazards: Hazard[] = [];
  private friends: FriendFish[] = [];
  private trailY: number[] = [];
  private rescued = false;
  private chest!: Phaser.GameObjects.Image;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chestBurst!: Phaser.GameObjects.Particles.ParticleEmitter;

  private scrollX = 0;
  private scrollVel = 0;
  private magnetUntil = 0;
  private magicReadyAt = 0;
  private dashUntil = 0;
  private vacuumUntil = 0;
  private streak = 0;
  private lastCollect = 0;
  private ending: 'no' | 'arriving' | 'done' = 'no';
  private t = 0;

  create() {
    this.levelIndex = savedLevel() % LEVELS.length;
    this.cfg = LEVELS[this.levelIndex];
    this.worldReady = false;

    // dev: jump partway into the level (?t0=7000), or force a level (?level=3)
    const qs = new URLSearchParams(location.search);
    const forced = Number(qs.get('level'));
    if (forced >= 1 && forced <= LEVELS.length) {
      this.levelIndex = forced - 1;
      this.cfg = LEVELS[this.levelIndex];
    }

    // Load this level's background layers on demand (service-worker cached),
    // and drop other scenes' textures to keep GPU memory bounded.
    for (const lvl of LEVELS) {
      if (lvl.scene.id === this.cfg.scene.id) continue;
      for (let i = 1; i <= lvl.scene.layers; i++) {
        const key = `bg-${lvl.scene.id}-${i}`;
        if (this.textures.exists(key)) this.textures.remove(key);
      }
    }
    const missing: number[] = [];
    for (let i = 1; i <= this.cfg.scene.layers; i++) {
      if (!this.textures.exists(`bg-${this.cfg.scene.id}-${i}`)) missing.push(i);
    }
    if (missing.length > 0) {
      this.load.setPath('assets');
      for (const i of missing) {
        this.load.image(`bg-${this.cfg.scene.id}-${i}`, `bg/${this.cfg.scene.id}/layer-${i}.webp`);
      }
      this.load.once('complete', () => this.buildWorld());
      this.load.start();
    } else {
      this.buildWorld();
    }
  }

  private buildWorld() {
    const w = this.scale.width;
    const qs = new URLSearchParams(location.search);
    this.scrollX = Number(qs.get('t0')) || 0;
    this.scrollVel = this.cfg.scrollSpeed;
    this.ending = 'no';
    this.magnetUntil = 0;
    this.t = 0;
    this.fish = [];
    this.jellies = [];
    this.pickups = [];
    this.powerups = [];
    this.layers = [];
    this.hazards = [];
    this.friends = [];
    this.trailY = [];
    this.rescued = false;

    const scene = this.cfg.scene;
    this.factors = parallaxFactors(scene);
    for (let i = 1; i <= scene.layers; i++) {
      const ts = this.add
        .tileSprite(w / 2, DESIGN_HEIGHT / 2, w, DESIGN_HEIGHT, `bg-${scene.id}-${i}`)
        .setDepth(i === scene.foregroundLayer ? 20 : (i - 1) * 0.5);
      this.layers.push(ts);
    }

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
    this.hud = new Hud(this, insets, this.levelIndex + 1);
    this.mermaid.control.ignoreRegion = (x, y) => this.hud.inSoundButton(x, y);
    this.mermaid.control.onTouchDown = () => sfx(this, 'tap');
    this.mermaid.control.onSecondTouch = () => this.castMagic();
    this.input.keyboard?.on('keydown-SPACE', () => this.castMagic());
    this.hud.showMagicStar();
    this.magicReadyAt = 0;
    this.dashUntil = 0;
    this.vacuumUntil = 0;
    this.streak = 0;
    attachSchemeToggle(this, this.mermaid.control);

    const content = buildLevel(this.levelIndex);
    for (const c of content.collectibles) {
      const sprite = this.add
        .image(-500, c.y, 'items', c.kind)
        .setDepth(8)
        .setScale(c.kind === 'pearl' ? 1 : 0.95);
      this.pickups.push({ data: c, sprite, taken: false, phase: c.worldX % 7, pullX: 0, pullY: 0 });
    }
    for (const p of content.powerupDefs) {
      const sprite = this.add.image(-500, p.y, 'items', p.kind).setDepth(8).setScale(1.15);
      this.tweens.add({
        targets: sprite,
        scale: 1.35,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.powerups.push({ data: p, sprite, taken: false });
    }
    for (const def of content.fishDefs) this.fish.push(new Fish(this, def));
    for (const def of content.hazardDefs) this.hazards.push(new Hazard(this, def));
    for (const def of content.jellyDefs) {
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

    const rescuedCount = Math.min(6, Number(localStorage.getItem(STORAGE_KEYS.friends)) || 0);
    for (let i = 0; i < rescuedCount; i++) {
      this.friends.push(
        new FriendFish(this, (i % 4) + 1, i, this.mermaid.x - 120 - i * 95, this.mermaid.y),
      );
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
    this.worldReady = true;
  }

  update(_time: number, delta: number) {
    if (!this.worldReady) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.t += dt;
    const w = this.scale.width;
    const band = safeBandLeft(w);

    // forward scroll — hers to ride, never to steer (starlight dash surges it)
    const dashing = this.time.now < this.dashUntil;
    this.scrollX += this.scrollVel * (dashing ? 2.2 : 1) * dt;
    if (this.ending === 'no' && this.scrollX >= this.cfg.scrollLength) this.beginEnding();
    this.layers.forEach((ts, i) => {
      ts.tilePositionX = this.scrollX * this.factors[i];
    });

    this.mermaid.update(delta);
    this.hud.setMagicReady(this.time.now >= this.magicReadyAt && this.ending === 'no');
    const vacuumOn = this.time.now < this.vacuumUntil;
    const magnetOn = vacuumOn || this.time.now < this.magnetUntil;

    for (const p of this.pickups) {
      if (p.taken) continue;
      const baseX = band + p.data.worldX - this.scrollX;
      if (baseX < -200 || baseX > w + 200) {
        p.sprite.setVisible(false);
        continue;
      }
      p.sprite.setVisible(true);
      const bobY = p.data.y + Math.sin(this.t * 1.8 + p.phase) * 9;
      if (magnetOn) {
        const dx = this.mermaid.x - (baseX + p.pullX);
        const dy = this.mermaid.y - (bobY + p.pullY);
        const d = Math.hypot(dx, dy);
        const range = vacuumOn ? 1500 : MAGNET_RANGE;
        if (d < range) {
          const pull = (1 - d / range) * (vacuumOn ? 3200 : 900) * dt;
          p.pullX += (dx / (d || 1)) * pull * 1.4;
          p.pullY += (dy / (d || 1)) * pull;
        }
      }
      p.sprite.x = baseX + p.pullX;
      p.sprite.y = bobY + p.pullY;
      const d = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, this.mermaid.x, this.mermaid.y);
      if (d < COLLECT_RADIUS) this.collect(p);
    }

    for (const pu of this.powerups) {
      if (pu.taken) continue;
      const x = band + pu.data.worldX - this.scrollX;
      pu.sprite.setVisible(x > -200 && x < w + 200);
      if (!pu.sprite.visible) continue;
      pu.sprite.x = x;
      pu.sprite.y = pu.data.y + Math.sin(this.t * 1.4 + pu.data.worldX) * 12;
      if (Phaser.Math.Distance.Between(x, pu.sprite.y, this.mermaid.x, this.mermaid.y) < COLLECT_RADIUS) {
        this.collectPowerup(pu);
      }
    }

    for (const f of this.fish) {
      f.update(delta, band, this.scrollX, this.mermaid.x, this.mermaid.y, w);
    }
    for (const h of this.hazards) {
      h.update(delta, band, this.scrollX, w);
      if (this.ending === 'no' && h.touches(this.mermaid.x, this.mermaid.y)) {
        const result = this.mermaid.triggerHurt();
        if (result === 'hurt') sfx(this, 'ouch', { volume: 0.8 });
        else if (result === 'shielded') {
          sfx(this, 'pop');
          this.sparkles.explode(10, this.mermaid.x, this.mermaid.y);
        }
      }
    }

    this.trailY.push(this.mermaid.y);
    if (this.trailY.length > 140) this.trailY.shift();
    this.friends.forEach((fr, i) => {
      const idx = Math.max(0, this.trailY.length - 1 - (i + 1) * 13);
      fr.update(delta, this.t, this.mermaid.sprite.x, this.trailY[idx]);
    });

    for (const j of this.jellies) {
      const x = band + j.phase - this.scrollX;
      j.sprite.setVisible(x > -250 && x < w + 250);
      if (!j.sprite.visible) continue;
      j.sprite.x = x;
      j.sprite.y = j.baseY + Math.sin(this.t * 0.42 + j.phase) * 46;
      // jellyfish sting (harmlessly) now, like everything ouchy
      if (
        this.ending === 'no' &&
        Phaser.Math.Distance.Between(x, j.sprite.y, this.mermaid.x, this.mermaid.y) < 85
      ) {
        const result = this.mermaid.triggerHurt();
        if (result === 'hurt') sfx(this, 'ouch', { volume: 0.8 });
        else if (result === 'shielded') {
          sfx(this, 'pop');
          this.sparkles.explode(10, this.mermaid.x, this.mermaid.y);
        }
      }
    }

    this.chest.x = band + chestWorldX(this.cfg) - this.scrollX;
  }

  private collect(p: Pickup) {
    p.taken = true;
    const { x, y } = p.sprite;
    // quick streaks climb in pitch — a tiny musical reward for flowing
    // through a whole arc (resets after a 1.5 s gap)
    const now = this.time.now;
    this.streak = now - this.lastCollect < 1500 ? this.streak + 1 : 0;
    this.lastCollect = now;
    const rate = Math.min(1.5, 1 + this.streak * 0.06);
    sfx(this, p.data.kind === 'pearl' ? 'pearl' : 'coin', { volume: 0.9, rate });
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

  private collectPowerup(pu: Powerup) {
    pu.taken = true;
    sfx(this, 'power');
    this.sparkles.explode(18, pu.sprite.x, pu.sprite.y);
    this.mermaid.triggerJoy();
    if (pu.data.kind === 'magnet') {
      this.magnetUntil = this.time.now + MAGNET_MS;
    } else {
      this.mermaid.gainShield();
    }
    this.tweens.add({
      targets: pu.sprite,
      x: this.mermaid.x,
      y: this.mermaid.y,
      scale: 0.3,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.easeIn',
      onComplete: () => pu.sprite.destroy(),
    });
  }

  // Each mermaid has her own magic, cast by tapping with the second thumb
  // (or Space on desktop). ~7 s recharge, shown by the golden HUD star.
  private castMagic() {
    if (this.ending !== 'no' || !this.worldReady) return;
    const now = this.time.now;
    if (now < this.magicReadyAt) return;
    this.magicReadyAt = now + 7000;
    sfx(this, 'power');
    this.sparkles.explode(24, this.mermaid.x, this.mermaid.y);
    this.mermaid.triggerJoy();
    switch (this.mermaid.character) {
      case 1: // pearl call: every pearl nearby rushes to her
        this.vacuumUntil = now + 1600;
        break;
      case 2: // bubble magic: conjure a shield
        this.mermaid.gainShield();
        sfx(this, 'pop', { delay: 0.15, volume: 0.6 });
        break;
      case 3: // starlight dash: surge forward, sparkling and unbumpable
        this.dashUntil = now + 2000;
        this.mermaid.grantGrace(2400);
        this.mermaid.triggerAcceleration(2000);
        break;
    }
  }

  private beginEnding() {
    this.ending = 'arriving';
    this.mermaid.control.enabled = false;
    this.tweens.add({ targets: this, scrollVel: 0, duration: 1400, ease: 'Sine.easeOut' });
    this.time.delayedCall(1500, () => {
      sfx(this, 'joy');
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
      this.time.delayedCall(900, () => this.rescueFriend());
      this.time.delayedCall(2400, () => this.showReplay());
    });
  }

  // A fish friend was trapped in the chest: it pops out, sparkles, and joins
  // the chain behind her — persisted, so the family grows run after run.
  private rescueFriend() {
    if (this.rescued) return;
    this.rescued = true;
    const count = Math.min(6, Number(localStorage.getItem(STORAGE_KEYS.friends)) || 0);
    const species = (count % 4) + 1;
    localStorage.setItem(STORAGE_KEYS.friends, String(count + 1));
    // finishing a level advances to the next one (wraps around at the end)
    localStorage.setItem(STORAGE_KEYS.level, String((this.levelIndex + 1) % LEVELS.length));

    // finishing the last level earns the crown, worn forever after
    if (this.levelIndex === LEVELS.length - 1 && localStorage.getItem(STORAGE_KEYS.crowned) !== '1') {
      localStorage.setItem(STORAGE_KEYS.crowned, '1');
      const crown = this.add
        .image(this.chest.x, this.chest.y - 90, 'items', 'crown')
        .setDepth(32)
        .setScale(0.3);
      this.tweens.add({
        targets: crown,
        x: this.mermaid.sprite.x + 6,
        y: this.mermaid.y - 100,
        scale: 0.75,
        duration: 1200,
        delay: 400,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          crown.destroy();
          this.mermaid.wearCrown();
          this.sparkles.explode(20, this.mermaid.sprite.x, this.mermaid.y - 90);
          sfx(this, 'complete', { volume: 0.8 });
        },
      });
    }

    const fish = this.add
      .sprite(this.chest.x, this.chest.y - 60, 'creatures', `fish-${species}-move_000`)
      .setScale(0.2)
      .setDepth(31)
      .setFlipX(true)
      .play(`fish-${species}`);
    sfx(this, 'joy');
    this.sparkles.explode(14, this.chest.x, this.chest.y - 60);

    const slot = this.friends.length;
    const targetX = this.mermaid.sprite.x - 120 - slot * 95;
    this.tweens.add({ targets: fish, scale: 0.55, duration: 1100, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: fish, x: targetX, duration: 1100, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: fish,
      y: this.mermaid.y - 160,
      duration: 550,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        fish.destroy();
        this.friends.push(new FriendFish(this, species, slot, targetX, this.mermaid.y));
        this.sparkles.explode(8, targetX, this.mermaid.y);
      },
    });
  }

  private showReplay() {
    const w = this.scale.width;
    const glow = this.add
      .circle(w / 2, DESIGN_HEIGHT / 2 - 60, 190, 0xbfe3ff, 0.16)
      .setDepth(199);
    const btn = this.add
      .image(w / 2, DESIGN_HEIGHT / 2 - 60, 'items', 'btn-play')
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
