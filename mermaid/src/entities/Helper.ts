import Phaser from 'phaser';
import { PLAY_TOP, SEAFLOOR_Y } from '../config';
import type { HelperDef } from '../level';
import type { Hazard } from './Hazard';

// Friendly sea life that helps her.
//
//  - dolphin: patrols an area and, if a shark wanders close, charges it and
//    drives it off. Only some sharks get one, so it stays a lucky moment.
//  - turtle: drifts gently; swimming into it earns a shield bubble and pulls
//    the nearby pearls in. It stays around afterwards, just out of assists.
//
// ART NOTE: the Craftpix "Underwater World" pack has no dolphin or turtle,
// so these render as recoloured, upscaled friendly fish for now. Dropping in
// real sprites is a one-line change: point `frameKey`/`animKey` at the new
// atlas entries and delete the tint.
const LOOK = {
  dolphin: { animKey: 'fish-1', frameKey: 'fish-1-move_000', scale: 2.1, tint: 0x9fd4ff },
  turtle: { animKey: 'fish-3', frameKey: 'fish-3-move_000', scale: 1.9, tint: 0x8fdba0 },
};

const DOLPHIN_SENSE = 620;
const TURTLE_TOUCH = 120;

export class Helper {
  sprite: Phaser.GameObjects.Sprite;
  used = false;
  private t: number;
  private charging?: Hazard;
  private chargeX = 0;
  private y: number;

  constructor(private scene: Phaser.Scene, public def: HelperDef) {
    this.t = def.worldX * 0.011;
    this.y = def.baseY;
    const look = LOOK[def.kind];
    this.sprite = scene.add
      .sprite(-900, def.baseY, 'creatures', look.frameKey)
      .setDepth(9)
      .setScale(look.scale)
      .setTint(look.tint)
      .play({ key: look.animKey, startFrame: Math.floor(def.worldX) % 10 });
  }

  update(
    dtMs: number,
    bandLeft: number,
    scrollX: number,
    screenW: number,
    mermaidX: number,
    mermaidY: number,
    hazards: Hazard[],
  ): 'none' | 'assist' {
    const dt = Math.min(dtMs / 1000, 0.05);
    this.t += dt;
    const anchorX = bandLeft + this.def.worldX - scrollX + this.chargeX;

    if (this.def.kind === 'dolphin') {
      // look for a shark worth seeing off
      if (!this.charging) {
        this.charging = hazards.find(
          (h) =>
            h.def.kind === 'shark' &&
            !h.routed &&
            h.sprite.visible &&
            Phaser.Math.Distance.Between(h.sprite.x, h.sprite.y, anchorX, this.y) < DOLPHIN_SENSE,
        );
        if (this.charging) {
          this.sprite.setFlipX(false);
          this.scene.tweens.add({ targets: this.sprite, scale: LOOK.dolphin.scale * 1.15, duration: 200, yoyo: true });
        }
      }
      if (this.charging) {
        const target = this.charging.sprite;
        this.chargeX += (target.x - anchorX) * 3.2 * dt;
        this.y += (target.y - this.y) * (1 - Math.exp(-dt / 0.28));
        if (Phaser.Math.Distance.Between(anchorX, this.y, target.x, target.y) < 190) {
          this.charging.driveAway(this.scene);
          this.charging = undefined;
          this.scene.tweens.add({
            targets: this.sprite,
            angle: { from: -12, to: 12 },
            duration: 140,
            yoyo: true,
            repeat: 3,
            onComplete: () => this.sprite.setAngle(0),
          });
          return 'assist';
        }
      } else {
        this.y += (this.def.baseY + Math.sin(this.t * 0.7) * 90 - this.y) * (1 - Math.exp(-dt / 0.7));
        this.chargeX *= 1 - Math.min(1, dt * 1.2);
        this.sprite.setFlipX(mermaidX > anchorX);
      }
    } else {
      // turtle: slow, calm, always drifting
      this.y = this.def.baseY + Math.sin(this.t * 0.4) * 55;
      this.sprite.setFlipX(true);
      if (
        !this.used &&
        Phaser.Math.Distance.Between(anchorX, this.y, mermaidX, mermaidY) < TURTLE_TOUCH
      ) {
        this.used = true;
        this.sprite.setAlpha(0.85);
        this.scene.tweens.add({
          targets: this.sprite,
          scale: LOOK.turtle.scale * 1.2,
          duration: 260,
          yoyo: true,
        });
        return 'assist';
      }
    }

    this.y = Phaser.Math.Clamp(this.y, PLAY_TOP, SEAFLOOR_Y);
    this.sprite.setVisible(anchorX > -450 && anchorX < screenW + 450);
    this.sprite.setPosition(anchorX, this.y);
    return 'none';
  }
}
