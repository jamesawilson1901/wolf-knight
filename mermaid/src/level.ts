// Level 1 — shipwreck reef. Hardcoded on purpose; no level format until the
// design has survived contact with the player.
import { LEVEL_SCROLL } from './config';

export interface Collectible {
  kind: 'pearl' | 'coin';
  worldX: number;
  y: number;
}
export interface FishDef {
  species: 1 | 2 | 3 | 4;
  worldX: number;
  baseY: number;
  amp: number;
  freq: number;
  drift: number; // extra leftward speed, px/s
  scale: number;
  depth: 6 | 11; // behind or in front of the mermaid
}
export interface JellyDef {
  species: 1 | 2 | 3;
  worldX: number;
  baseY: number;
}

// Gentle arcs and waves — readable paths, nothing requiring precision.
// Collectible band stays well off the floor and well below the ceiling.
function arc(x0: number, cy: number, r: number, n: number, spacing: number, upward: boolean): Collectible[] {
  const out: Collectible[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const y = cy - Math.sin(t * Math.PI) * r * (upward ? 1 : -1);
    out.push({ kind: 'pearl', worldX: x0 + i * spacing, y });
  }
  return out;
}
function wave(x0: number, cy: number, amp: number, n: number, spacing: number): Collectible[] {
  const out: Collectible[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'pearl', worldX: x0 + i * spacing, y: cy + Math.sin((i / (n - 1)) * Math.PI * 2) * amp });
  }
  return out;
}

export const collectibles: Collectible[] = [
  ...arc(1500, 660, 180, 5, 160, true),
  ...wave(2600, 520, 170, 6, 165),
  ...arc(3950, 420, 160, 5, 155, false),
  ...wave(5050, 600, 150, 6, 170),
  ...arc(6450, 560, 200, 5, 160, true),
  { kind: 'coin', worldX: 2350, y: 480 },
  { kind: 'coin', worldX: 3700, y: 620 },
  { kind: 'coin', worldX: 4830, y: 400 },
  { kind: 'coin', worldX: 6150, y: 640 },
  { kind: 'coin', worldX: 7280, y: 470 },
];

export const fishDefs: FishDef[] = [
  { species: 1, worldX: 1200, baseY: 350, amp: 55, freq: 0.5, drift: 35, scale: 0.9, depth: 6 },
  { species: 2, worldX: 2100, baseY: 700, amp: 70, freq: 0.4, drift: 55, scale: 1, depth: 11 },
  { species: 3, worldX: 2900, baseY: 300, amp: 45, freq: 0.6, drift: 25, scale: 0.75, depth: 6 },
  { species: 4, worldX: 3800, baseY: 560, amp: 80, freq: 0.3, drift: 45, scale: 1, depth: 6 },
  { species: 1, worldX: 4700, baseY: 640, amp: 60, freq: 0.45, drift: 60, scale: 0.7, depth: 6 },
  { species: 2, worldX: 5500, baseY: 330, amp: 65, freq: 0.5, drift: 30, scale: 0.85, depth: 6 },
  { species: 3, worldX: 6300, baseY: 720, amp: 55, freq: 0.55, drift: 50, scale: 1, depth: 11 },
  { species: 4, worldX: 7100, baseY: 420, amp: 70, freq: 0.35, drift: 40, scale: 0.8, depth: 6 },
  { species: 1, worldX: 7900, baseY: 550, amp: 60, freq: 0.5, drift: 45, scale: 0.95, depth: 11 },
];

export const jellyDefs: JellyDef[] = [
  { species: 1, worldX: 2500, baseY: 430 },
  { species: 2, worldX: 4400, baseY: 520 },
  { species: 3, worldX: 6700, baseY: 380 },
];

// The chest waits on the sand just past the last stretch of scroll.
export const CHEST_WORLD_X = LEVEL_SCROLL + 1430;
export const CHEST_Y = 880;

// Background parallax factors, back (1) to front (6). Layer 5 is the sand the
// chest sits on, so it scrolls at world speed; 6 is foreground grass.
export const PARALLAX = [0.03, 0.1, 0.25, 0.55, 1.0, 1.18];
