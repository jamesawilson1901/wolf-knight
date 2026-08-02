import Phaser from 'phaser';
import type { VerticalControl } from './controls';

// Dev-only control-scheme toggle. Desktop: press C. Phone: 4 quick taps in the
// top-left corner. Feedback is icon-only — one dot = scheme A, two dots = B.
export function attachSchemeToggle(scene: Phaser.Scene, control: VerticalControl) {
  scene.input.keyboard?.on('keydown-C', () => toggle(scene, control));

  let taps: number[] = [];
  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (p.x > 260 || p.y > 260) return;
    const now = scene.time.now;
    taps = taps.filter((t) => now - t < 1800);
    taps.push(now);
    if (taps.length >= 4) {
      taps = [];
      toggle(scene, control);
    }
  });
}

function toggle(scene: Phaser.Scene, control: VerticalControl) {
  const order = ['A', 'B', 'C'] as const;
  const next = order[(order.indexOf(control.scheme) + 1) % order.length];
  control.setScheme(next);
  showDots(scene, order.indexOf(next) + 1);
}

function showDots(scene: Phaser.Scene, count: number) {
  const cx = scene.scale.width / 2;
  const g = scene.add.graphics().setDepth(1000).setScrollFactor(0);
  g.fillStyle(0xffffff, 0.9);
  for (let i = 0; i < count; i++) {
    g.fillCircle(cx + (i - (count - 1) / 2) * 60, 90, 18);
  }
  scene.tweens.add({
    targets: g,
    alpha: 0,
    delay: 700,
    duration: 500,
    onComplete: () => g.destroy(),
  });
}
