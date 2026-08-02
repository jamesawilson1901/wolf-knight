import Phaser from 'phaser';
import { DESIGN_HEIGHT } from '../config';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Display cutout / home indicator insets, converted from CSS px into design px.
// In landscape the notch eats a whole short edge (left or right).
export function safeInsets(scene: Phaser.Scene): Insets {
  const style = getComputedStyle(document.documentElement);
  const px = (name: string) => {
    const v = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(v) ? v : 0;
  };
  const cssH = scene.scale.displaySize?.height || window.innerHeight;
  const k = cssH > 0 ? DESIGN_HEIGHT / cssH : 1;
  return {
    top: px('--sa-top') * k,
    right: px('--sa-right') * k,
    bottom: px('--sa-bottom') * k,
    left: px('--sa-left') * k,
  };
}
