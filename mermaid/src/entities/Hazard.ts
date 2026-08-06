import Phaser from 'phaser';
import { PLAY_TOP, SEAFLOOR_Y } from '../config';
import type { HazardDef } from '../level';

const RADIUS: Record<string, number> = {
  urchin: 82,
  crab: 84,
  lionfish: 88,
  shark: 130,
};

// Ouchy creatures. Touching one flashes the mermaid red, bumps her back and
// plays a sound; there is no health, no loss, no fail state.
//
// Urchins hold station (gate spikes hold perfectly still), crabs patrol the
// sand, lionfish cruise and lean toward her, and sharks actively chase —
// slowly enough to always be out-swum, and they give up after a while.
export class Hazard {
  sprite: Phaser.GameObjects.Sprite;
  private t: number;
  private x = -900;
  private y: number;
  private chaseVX = 0;
  private chaseVY = 0;
  private givesUpAt = 0;
  private woke = false;

  constructor(scene: Phaser.Scene, public def: HazardDef) {
    this.t = def.worldX * 0.017;
    this.y = def.baseY;
    const key = def.kind === 'shark' ? 'shark' : def.kind;
    this.sprite = scene.add
      .sprite(-900, def.baseY, 'creatures', `${key}-move_000`)
      .setDepth(def.kind === 'shark' ? 12 : 8)
      .play({ key, startFrame: Math.floor(def.worldX) % 10 });
    if (def.kind === 'crab') this.sprite.setOrigin(0.5, 0.9); // feet on the sand
  }

  update(
    dtMs: number,
    bandLeft: number,
    scrollX: number,
    screenW: number,
    mermaidX: number,
    mermaidY: number,
    fleeing: boolean,
  ) {
    if (this.routed) return;
    const dt = Math.min(dtMs / 1000, 0.05);
    this.t += dt;
    const anchorX = bandLeft + this.def.worldX - scrollX;

    switch (this.def.kind) {
      case 'urchin': {
        this.x = anchorX;
        this.y = this.def.baseY + (this.def.still ? 0 : Math.sin(this.t * 0.7) * 34);
        break;
      }
      case 'crab': {
        this.x = anchorX + Math.sin(this.t * 0.45) * 90;
        this.y = this.def.baseY;
        this.sprite.setFlipX(Math.cos(this.t * 0.45) > 0);
        break;
      }
      case 'lionfish': {
        // cruises on a slow wave and leans toward her height when close
        const near = Math.abs(anchorX - mermaidX) < 620;
        const lean = near && !fleeing ? Phaser.Math.Clamp(mermaidY - this.y, -180, 180) * 0.5 : 0;
        this.x = anchorX;
        const want = this.def.baseY + Math.sin(this.t * 0.55) * 70 + lean;
        this.y += (want - this.y) * (1 - Math.exp(-dt / 0.9));
        this.sprite.setFlipX(mermaidX > this.x);
        break;
      }
      case 'shark': {
        // Three states. Asleep: holds its patch of water so it's where the
        // level put it (and where a dolphin can find it). Chasing: wakes when
        // she comes near and pursues at a speed she can out-swim. Bored:
        // gives up after ~9 s and cruises away for good.
        if (!this.woke) {
          this.x = anchorX;
          this.y = this.def.baseY + Math.sin(this.t * 0.5) * 60;
          if (!fleeing && Math.abs(anchorX - mermaidX) < 1250) {
            this.woke = true;
            this.givesUpAt = this.t + 9;
          }
          break;
        }
        const bored = this.t >= this.givesUpAt;
        const chasing = !bored && !fleeing;
        const targetX = chasing ? mermaidX - 210 : this.x - 320;
        const targetY = chasing ? mermaidY : this.y + Math.sin(this.t * 0.5) * 40;
        // ease toward the target: menacing, never actually faster than her
        this.chaseVX += ((targetX - this.x) * 1.5 - this.chaseVX) * (1 - Math.exp(-dt / 0.55));
        this.chaseVY += ((targetY - this.y) * 2.0 - this.chaseVY) * (1 - Math.exp(-dt / 0.45));
        this.x += Phaser.Math.Clamp(this.chaseVX, -320, 250) * dt;
        this.y += Phaser.Math.Clamp(this.chaseVY, -260, 260) * dt;
        this.y = Phaser.Math.Clamp(this.y, PLAY_TOP, SEAFLOOR_Y);
        this.sprite.setFlipX(mermaidX > this.x); // shark art faces left
        break;
      }
    }

    if (fleeing) this.y += (this.y < mermaidY ? -160 : 160) * dt;
    this.sprite.setVisible(this.x > -450 && this.x < screenW + 500);
    this.sprite.setPosition(this.x, this.y);
  }

  touches(mx: number, my: number): boolean {
    if (this.routed || !this.sprite.visible) return false;
    const r = RADIUS[this.def.kind] ?? 82;
    return Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, mx, my) < r;
  }

  routed = false;

  /** Sent packing by a dolphin: turn tail and bolt off the top of the screen. */
  driveAway(scene: Phaser.Scene) {
    if (this.routed) return;
    this.routed = true;
    this.sprite.setFlipX(true);
    scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + 1800,
      y: this.sprite.y - 420,
      angle: 18,
      alpha: 0,
      duration: 1700,
      ease: 'Back.easeIn',
      onComplete: () => this.sprite.destroy(),
    });
  }
}
