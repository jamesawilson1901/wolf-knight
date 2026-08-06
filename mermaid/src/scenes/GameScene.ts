import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  PLAY_TOP,
  SEAFLOOR_Y,
  STORAGE_KEYS,
  safeBandLeft,
  savedLevel,
} from '../config';
import {
  CHEST_Y,
  ESCAPE_END_SCROLL,
  LEVELS,
  REAL_CHEST_WORLD_X,
  ROCKFALL_SCROLL,
  buildLevel,
  chestWorldX,
  parallaxFactors,
  type Collectible,
  type LevelConfig,
  type PowerupDef,
} from '../level';
import { ChaseShark } from '../entities/ChaseShark';
import { Fish } from '../entities/Fish';
import { FriendFish } from '../entities/FriendFish';
import { Hazard } from '../entities/Hazard';
import { Helper } from '../entities/Helper';
import { Mermaid } from '../entities/Mermaid';
import { Obstacle } from '../entities/Obstacle';
import { sfx, startAmbient } from '../systems/audio';
import { attachSchemeToggle } from '../systems/devtoggle';
import { Hud } from '../systems/hud';
import { safeInsets } from '../systems/safearea';

const COLLECT_RADIUS = 120; // deliberately forgiving
const MAGNET_RANGE = 620;
const MAGNET_MS = 6500;
const HEART_MS = 7000;
const BOOST_MS = 2600;
const CHASE_SPEED = -430; // she flees back the way she came
const ESCAPE_SPEED = -300; // calmer once the shark is gone

type Phase = 'run' | 'trap' | 'chase' | 'escape' | 'arriving' | 'done';

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
  private obstacles: Obstacle[] = [];
  private helpers: Helper[] = [];
  private friends: FriendFish[] = [];
  private trailY: number[] = [];
  private rescued = false;
  private chest!: Phaser.GameObjects.Image;
  private realChest?: Phaser.GameObjects.Image;
  private activeChest!: Phaser.GameObjects.Image;
  private chaseShark?: ChaseShark;
  private rockPile: { sprite: Phaser.GameObjects.Image; worldX: number; dy: number }[] = [];
  private rockfallWorldX = 0;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chestBurst!: Phaser.GameObjects.Particles.ParticleEmitter;

  private scrollX = 0;
  private scrollVel = 0;
  private magnetUntil = 0;
  private heartUntil = 0;
  private magicReadyAt = 0;
  private dashUntil = 0;
  private vacuumUntil = 0;
  private streak = 0;
  private lastCollect = 0;
  phase: Phase = 'run';
  private t = 0;

  create() {
    this.levelIndex = savedLevel() % LEVELS.length;
    const qs = new URLSearchParams(location.search);
    const forced = Number(qs.get('level'));
    if (forced >= 1 && forced <= LEVELS.length) this.levelIndex = forced - 1;
    this.cfg = LEVELS[this.levelIndex];
    this.worldReady = false;

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
    this.phase = 'run';
    this.magnetUntil = 0;
    this.heartUntil = 0;
    this.magicReadyAt = 0;
    this.dashUntil = 0;
    this.vacuumUntil = 0;
    this.streak = 0;
    this.t = 0;
    this.fish = [];
    this.jellies = [];
    this.pickups = [];
    this.powerups = [];
    this.layers = [];
    this.hazards = [];
    this.obstacles = [];
    this.helpers = [];
    this.friends = [];
    this.trailY = [];
    this.rockPile = [];
    this.chaseShark = undefined;
    this.realChest = undefined;
    this.rescued = false;

    const scene = this.cfg.scene;
    this.factors = parallaxFactors(scene);
    for (let i = 1; i <= scene.layers; i++) {
      this.layers.push(
        this.add
          .tileSprite(w / 2, DESIGN_HEIGHT / 2, w, DESIGN_HEIGHT, `bg-${scene.id}-${i}`)
          .setDepth(i === scene.foregroundLayer ? 20 : (i - 1) * 0.5),
      );
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
    attachSchemeToggle(this, this.mermaid.control);

    const content = buildLevel(this.levelIndex);
    for (const c of content.collectibles) {
      const sprite = this.add
        .image(-900, c.y, 'items', c.kind)
        .setDepth(8)
        .setScale(c.kind === 'pearl' ? 1 : 0.95);
      this.pickups.push({ data: c, sprite, taken: false, phase: c.worldX % 7, pullX: 0, pullY: 0 });
    }
    for (const p of content.powerupDefs) {
      const sprite = this.add.image(-900, p.y, 'items', p.kind).setDepth(8).setScale(1.15);
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
    for (const def of content.obstacleDefs) this.obstacles.push(new Obstacle(this, def));
    for (const def of content.helperDefs) this.helpers.push(new Helper(this, def));
    for (const def of content.jellyDefs) {
      const sprite = this.add
        .sprite(-900, def.baseY, 'creatures', `jellyfish-${def.species}-move_000`)
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

    this.chest = this.add.image(-900, CHEST_Y, 'items', 'chest-closed').setDepth(8);
    this.activeChest = this.chest;
    if (this.cfg.sharkChase) {
      this.realChest = this.add.image(-900, CHEST_Y, 'items', 'chest-closed').setDepth(8);
    }

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
    const now = this.time.now;

    const boosting = now < this.dashUntil;
    this.scrollX += this.scrollVel * (boosting ? 2.2 : 1) * dt;

    if (this.phase === 'run' && this.scrollX >= this.cfg.scrollLength) this.reachChest();
    if (this.phase === 'chase' && this.scrollX <= ROCKFALL_SCROLL) this.triggerRockfall();
    if (this.phase === 'escape' && this.scrollX <= ESCAPE_END_SCROLL) this.arriveAtChest(true);

    this.layers.forEach((ts, i) => {
      ts.tilePositionX = this.scrollX * this.factors[i];
    });

    this.mermaid.update(delta);
    const playing = this.phase === 'run' || this.phase === 'chase' || this.phase === 'escape';
    this.hud.setMagicReady(now >= this.magicReadyAt && playing);
    const fleeing = now < this.heartUntil;
    const vacuumOn = now < this.vacuumUntil;
    const magnetOn = vacuumOn || now < this.magnetUntil;
    const mx = this.mermaid.x;
    const my = this.mermaid.y;

    for (const p of this.pickups) {
      if (p.taken) continue;
      const baseX = band + p.data.worldX - this.scrollX;
      if (baseX < -260 || baseX > w + 260) {
        p.sprite.setVisible(false);
        continue;
      }
      p.sprite.setVisible(true);
      const bobY = p.data.y + Math.sin(this.t * 1.8 + p.phase) * 9;
      if (magnetOn) {
        const dx = mx - (baseX + p.pullX);
        const dy = my - (bobY + p.pullY);
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
      if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, mx, my) < COLLECT_RADIUS) {
        this.collect(p);
      }
    }

    for (const pu of this.powerups) {
      if (pu.taken) continue;
      const x = band + pu.data.worldX - this.scrollX;
      pu.sprite.setVisible(x > -260 && x < w + 260);
      if (!pu.sprite.visible) continue;
      pu.sprite.x = x;
      pu.sprite.y = pu.data.y + Math.sin(this.t * 1.4 + pu.data.worldX) * 12;
      if (Phaser.Math.Distance.Between(x, pu.sprite.y, mx, my) < COLLECT_RADIUS) {
        this.collectPowerup(pu);
      }
    }

    for (const f of this.fish) f.update(delta, band, this.scrollX, mx, my, w);
    for (const h of this.hazards) {
      h.update(delta, band, this.scrollX, w, mx, my, fleeing);
      if (playing && h.touches(mx, my)) this.ouch();
    }
    for (const o of this.obstacles) {
      o.update(band, this.scrollX, w);
      if (playing && o.touches(mx, my)) this.ouch();
    }
    for (const hp of this.helpers) {
      if (hp.update(delta, band, this.scrollX, w, mx, my, this.hazards) === 'assist') {
        this.helperAssist(hp);
      }
    }

    this.trailY.push(my);
    if (this.trailY.length > 140) this.trailY.shift();
    this.friends.forEach((fr, i) => {
      const idx = Math.max(0, this.trailY.length - 1 - (i + 1) * 13);
      fr.update(delta, this.t, this.mermaid.sprite.x, this.trailY[idx], this.mermaid.facing);
    });

    for (const j of this.jellies) {
      const x = band + j.phase - this.scrollX;
      j.sprite.setVisible(x > -260 && x < w + 260);
      if (!j.sprite.visible) continue;
      j.sprite.x = x;
      const drift = fleeing ? (j.baseY < my ? -120 : 120) * dt : 0;
      j.baseY += drift;
      j.sprite.y = j.baseY + Math.sin(this.t * 0.42 + j.phase) * 46;
      if (playing && Phaser.Math.Distance.Between(x, j.sprite.y, mx, my) < 88) this.ouch();
    }

    if (this.chaseShark) {
      this.chaseShark.update(delta, mx, my);
      if (this.phase === 'chase' && this.chaseShark.touches(mx, my)) this.ouch();
    }
    for (const r of this.rockPile) {
      r.sprite.x = band + r.worldX - this.scrollX;
    }

    this.chest.x = band + chestWorldX(this.cfg) - this.scrollX;
    if (this.realChest) this.realChest.x = band + REAL_CHEST_WORLD_X - this.scrollX;
  }

  /** A dolphin saw off a shark, or she reached a turtle. */
  private helperAssist(hp: Helper) {
    this.sparkles.explode(16, hp.sprite.x, hp.sprite.y);
    sfx(this, 'power', { volume: 0.8 });
    if (hp.def.kind === 'dolphin') {
      this.cameras.main.shake(200, 0.005);
    } else {
      // the turtle's gift: a shield and a pull on the nearby pearls
      this.mermaid.gainShield();
      this.magnetUntil = Math.max(this.magnetUntil, this.time.now + 4000);
      this.mermaid.triggerJoy();
    }
  }

  /** Everything ouchy funnels through here: flash, sound, or a shield pop. */
  private ouch() {
    const result = this.mermaid.triggerHurt();
    if (result === 'hurt') {
      sfx(this, 'ouch', { volume: 0.8 });
      this.cameras.main.shake(160, 0.004);
    } else if (result === 'shielded') {
      sfx(this, 'pop');
      this.sparkles.explode(10, this.mermaid.x, this.mermaid.y);
    }
  }

  private collect(p: Pickup) {
    p.taken = true;
    const { x, y } = p.sprite;
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
    const now = this.time.now;
    switch (pu.data.kind) {
      case 'magnet':
        this.magnetUntil = now + MAGNET_MS;
        break;
      case 'shield':
        this.mermaid.gainShield();
        break;
      case 'boost':
        this.dashUntil = now + BOOST_MS;
        this.mermaid.grantGrace(BOOST_MS + 300);
        this.mermaid.triggerAcceleration(BOOST_MS);
        break;
      case 'heart':
        // kindness aura: every ouchy creature politely swims out of her way
        this.heartUntil = now + HEART_MS;
        break;
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

  private castMagic() {
    if (!this.worldReady) return;
    if (this.phase !== 'run' && this.phase !== 'chase' && this.phase !== 'escape') return;
    const now = this.time.now;
    if (now < this.magicReadyAt) return;
    this.magicReadyAt = now + 7000;
    sfx(this, 'power');
    this.sparkles.explode(24, this.mermaid.x, this.mermaid.y);
    this.mermaid.triggerJoy();
    switch (this.mermaid.character) {
      case 1:
        this.vacuumUntil = now + 1600;
        break;
      case 2:
        this.mermaid.gainShield();
        sfx(this, 'pop', { delay: 0.15, volume: 0.6 });
        break;
      case 3:
        this.dashUntil = now + 2000;
        this.mermaid.grantGrace(2400);
        this.mermaid.triggerAcceleration(2000);
        break;
    }
  }

  // ---- endings ---------------------------------------------------------

  private reachChest() {
    this.phase = 'trap';
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
      this.time.delayedCall(1000, () => {
        if (this.cfg.sharkChase) this.springTrap();
        else this.openChest(this.chest);
      });
    });
  }

  /** The chest was a trap: a shark bursts out and herds her back home. */
  private springTrap() {
    this.chest.setFrame('chest-ajar');
    sfx(this, 'chest', { rate: 0.6, volume: 0.8 });
    this.time.delayedCall(450, () => {
      this.chest.setFrame('chest-open');
      this.cameras.main.shake(600, 0.012);
      sfx(this, 'danger');
      this.chaseShark = new ChaseShark(this, this.chest.x + 60, CHEST_Y - 90);
      this.mermaid.triggerHurt();

      this.time.delayedCall(700, () => {
        this.phase = 'chase';
        this.scrollVel = CHASE_SPEED;
        this.mermaid.control.enabled = true;
        this.mermaid.setFacing(-1);
      });
    });
  }

  /** Rocks crash down between her and the shark, and it gives up. */
  private triggerRockfall() {
    this.phase = 'escape';
    this.rockfallWorldX = this.scrollX + 1250;
    const band = safeBandLeft(this.scale.width);
    const kinds = ['rock-tall', 'rock-round', 'rock-wide', 'rock-spire'];
    sfx(this, 'rumble');
    this.cameras.main.shake(900, 0.016);

    for (let i = 0; i < 7; i++) {
      const worldX = this.rockfallWorldX + (i - 3) * 105;
      const sprite = this.add
        .image(band + worldX - this.scrollX, -200, 'items', kinds[i % kinds.length])
        .setDepth(13)
        .setScale(1.15);
      const rock = { sprite, worldX, dy: 0 };
      this.rockPile.push(rock);
      this.tweens.add({
        targets: sprite,
        y: PLAY_TOP + 60 + i * 118,
        duration: 620 + i * 70,
        ease: 'Bounce.easeOut',
        delay: i * 45,
      });
    }
    this.add
      .particles(0, 0, 'items', {
        frame: ['bubble-1', 'bubble-2'],
        x: { min: -200, max: 200 },
        y: 0,
        lifespan: 1400,
        speed: { min: 60, max: 260 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.7, end: 0 },
        emitting: false,
      })
      .setDepth(14)
      .explode(30, band + this.rockfallWorldX - this.scrollX, DESIGN_HEIGHT / 2);

    this.time.delayedCall(700, () => {
      this.chaseShark?.fleeAway(() => {
        this.chaseShark = undefined;
      });
      sfx(this, 'joy', { volume: 0.7 });
    });
    this.tweens.add({ targets: this, scrollVel: ESCAPE_SPEED, duration: 1800, ease: 'Sine.easeOut' });
  }

  /** Arrive at a chest and do the reward ritual. */
  private arriveAtChest(fromEscape: boolean) {
    this.phase = 'arriving';
    this.mermaid.control.enabled = false;
    const chest = fromEscape && this.realChest ? this.realChest : this.chest;
    this.activeChest = chest;
    this.tweens.add({ targets: this, scrollVel: 0, duration: 1300, ease: 'Sine.easeOut' });
    this.time.delayedCall(1400, () => {
      sfx(this, 'joy');
      // turn to face whichever side the chest is on — after the escape run
      // she arrives from the right, so she stays facing back the way she came
      const dir: 1 | -1 = chest.x < this.mermaid.sprite.x ? -1 : 1;
      this.mermaid.setFacing(dir);
      this.tweens.add({
        targets: this.mermaid.sprite,
        x: chest.x - dir * 250,
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
      this.time.delayedCall(1000, () => this.openChest(chest));
    });
  }

  private openChest(chest: Phaser.GameObjects.Image) {
    this.phase = 'done';
    this.activeChest = chest;
    chest.setFrame('chest-ajar');
    sfx(this, 'chest');
    this.time.delayedCall(500, () => {
      chest.setFrame('chest-open');
      this.chestBurst.explode(26, chest.x, chest.y - 40);
      const glow = this.add
        .image(chest.x, chest.y - 30, 'items', 'glow')
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
    const chest = this.activeChest;
    const count = Math.min(6, Number(localStorage.getItem(STORAGE_KEYS.friends)) || 0);
    const species = (count % 4) + 1;
    localStorage.setItem(STORAGE_KEYS.friends, String(count + 1));
    localStorage.setItem(STORAGE_KEYS.level, String((this.levelIndex + 1) % LEVELS.length));

    if (this.levelIndex === LEVELS.length - 1 && localStorage.getItem(STORAGE_KEYS.crowned) !== '1') {
      localStorage.setItem(STORAGE_KEYS.crowned, '1');
      const crown = this.add
        .image(chest.x, chest.y - 90, 'items', 'crown')
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
      .sprite(chest.x, chest.y - 60, 'creatures', `fish-${species}-move_000`)
      .setScale(0.2)
      .setDepth(31)
      .setFlipX(true)
      .play(`fish-${species}`);
    sfx(this, 'joy');
    this.sparkles.explode(14, chest.x, chest.y - 60);

    const slot = this.friends.length;
    const targetX = this.mermaid.sprite.x - this.mermaid.facing * (120 + slot * 95);
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
