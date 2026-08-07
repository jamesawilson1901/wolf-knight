// Twelve levels across the pack's eight scenes, each harder than the last.
//
// Difficulty design for an almost-six-year-old, borrowed from the games that
// get this right (Mario's level grammar, Ori's spike corridors, Kirby):
//  - one new element per level, introduced generously and never two at once
//  - difficulty is navigation, density and precision — never punishment.
//    There is still no fail state: an ouch is a red flash and a small bump.
//  - a pearl always sits in the safe gap of a spike gate or tunnel, so the
//    collectible trail *is* the tutorial for the route through
//  - the resting lane along the seafloor is kept clear of gate spikes, so a
//    child who puts the phone down still reaches the end untouched
//  - the reward is always the same reliable ritual (chest, sparkles, a new
//    fish friend), so wanting to finish never feels risky
//
// Levels 4, 8 and 12 hide a shark in the chest: it bursts out, chases her
// back the way she came, a rockfall drives it off, and the real chest waits
// beyond the original start with a fish friend inside.
import { PLAY_TOP, SEAFLOOR_Y } from './config';

export interface Collectible {
  kind: 'pearl' | 'coin';
  worldX: number;
  y: number;
}
export interface FishDef {
  species: 1 | 2 | 3;
  worldX: number;
  baseY: number;
  amp: number;
  freq: number;
  drift: number;
  scale: number;
  depth: 6 | 11;
}
export interface JellyDef {
  species: 1 | 2 | 3;
  worldX: number;
  baseY: number;
}
export type HazardKind = 'urchin' | 'crab' | 'shark' | 'lionfish';
export interface HazardDef {
  kind: HazardKind;
  worldX: number;
  baseY: number;
  still?: boolean; // gate spikes hold position so the gap stays predictable
}
export interface HelperDef {
  kind: 'dolphin' | 'turtle';
  worldX: number;
  baseY: number;
}
export type PowerupKind = 'magnet' | 'shield' | 'boost' | 'heart' | 'seahorse';
export interface PowerupDef {
  kind: PowerupKind;
  worldX: number;
  y: number;
}
export type ObstacleKind =
  | 'rock-tall'
  | 'rock-round'
  | 'rock-wide'
  | 'rock-spire'
  | 'rock-small'
  | 'rock-flat'
  | 'mast'
  | 'anchor'
  | 'barrel'
  | 'crate'
  | 'wheel'
  | 'chain'
  | 'weed-wide'
  | 'weed-tall';

/**
 * Props are anchored, not floated. Anything that grows or falls sits on the
 * seabed; only stalactites and chains hang, and only in cave-roofed scenes.
 * Free-floating pointy rocks in open water read as debris, so they are gone.
 */
export interface ObstacleDef {
  kind: ObstacleKind;
  worldX: number;
  anchor: 'floor' | 'ceiling';
  /** how far the prop reaches from its anchor line, in design px */
  reach: number;
}

/** Collision half-extents per prop, deliberately smaller than the art. */
export const OBSTACLE_SIZE: Record<ObstacleKind, { rx: number; ry: number }> = {
  'rock-tall': { rx: 60, ry: 118 },
  'rock-round': { rx: 56, ry: 80 },
  'rock-wide': { rx: 76, ry: 60 },
  'rock-spire': { rx: 40, ry: 130 },
  'rock-small': { rx: 42, ry: 66 },
  'rock-flat': { rx: 62, ry: 30 },
  mast: { rx: 92, ry: 116 },
  anchor: { rx: 50, ry: 68 },
  barrel: { rx: 46, ry: 58 },
  crate: { rx: 62, ry: 50 },
  wheel: { rx: 66, ry: 62 },
  chain: { rx: 20, ry: 150 },
  'weed-wide': { rx: 74, ry: 60 },
  'weed-tall': { rx: 50, ry: 72 },
};

/** Props that stand on the seabed. */
const FLOOR_PROPS: ObstacleKind[] = [
  'rock-tall', 'rock-round', 'rock-wide', 'rock-small', 'rock-flat',
  'weed-wide', 'weed-tall', 'anchor', 'barrel', 'crate', 'wheel', 'mast',
];
/** Wreck-flavoured props, for the shipwreck and ruins scenes. */
const WRECK_PROPS: ObstacleKind[] = ['mast', 'anchor', 'barrel', 'crate', 'wheel'];
/** Only these hang, and only where there is a rock roof overhead. */
const CEILING_PROPS: ObstacleKind[] = ['rock-spire', 'chain'];
/** Scenes with a cave roof, where hanging props make sense. */
const ROOFED_SCENES = new Set(['b1s2', 'b2s2', 'b2s3']);

export interface SceneConfig {
  id: string;
  layers: number;
  floorLayer: number;
  extraFloorLayer?: number;
  foregroundLayer?: number;
}

export interface LevelConfig {
  scene: SceneConfig;
  scrollSpeed: number;
  scrollLength: number;
  pearlGroups: number;
  coins: number;
  gates: number;
  gateGap: number; // half-height of the safe opening; smaller = tighter
  tunnels: number; // horizontal spike corridors
  obstacles: number;
  urchins: number;
  crabs: number;
  sharks: number;
  lionfish: number;
  powerups: number;
  fish: number;
  jellies: number;
  sharkChase?: boolean; // the chest is a trap on these levels
}

const SCENES: Record<string, SceneConfig> = {
  reef: { id: 'b1s1', layers: 6, floorLayer: 5, foregroundLayer: 6 },
  coral: { id: 'b1s4', layers: 6, floorLayer: 5, foregroundLayer: 6 },
  ruins: { id: 'b2s1', layers: 8, floorLayer: 7, foregroundLayer: 8 },
  canyon: { id: 'b2s2', layers: 6, floorLayer: 5, foregroundLayer: 6 },
  gems: { id: 'b1s2', layers: 6, floorLayer: 5, foregroundLayer: 6 },
  kelp: { id: 'b1s3', layers: 7, floorLayer: 5, foregroundLayer: 7 },
  cove: { id: 'b2s4', layers: 6, floorLayer: 5, foregroundLayer: 6 },
  bones: { id: 'b2s3', layers: 6, floorLayer: 4, extraFloorLayer: 5, foregroundLayer: 6 },
};

// Chase levels get a shorter outward leg, because the escape run back is a
// whole second act on top.
export const LEVELS: LevelConfig[] = [
  // L1 reef — learn to swim. Open water, a few urchins to notice.
  { scene: SCENES.reef, scrollSpeed: 172, scrollLength: 7400, pearlGroups: 5, coins: 4,
    gates: 0, gateGap: 260, tunnels: 0, obstacles: 2, urchins: 3, crabs: 1, sharks: 0,
    lionfish: 0, powerups: 1, fish: 8, jellies: 2 },
  // L2 coral — the magnet, more props to weave past.
  { scene: SCENES.coral, scrollSpeed: 184, scrollLength: 7800, pearlGroups: 5, coins: 5,
    gates: 1, gateGap: 250, tunnels: 0, obstacles: 4, urchins: 4, crabs: 1, sharks: 0,
    lionfish: 1, powerups: 2, fish: 8, jellies: 2 },
  // L3 ruins — first proper spike gates and the lionfish.
  { scene: SCENES.ruins, scrollSpeed: 196, scrollLength: 8200, pearlGroups: 6, coins: 5,
    gates: 2, gateGap: 240, tunnels: 0, obstacles: 6, urchins: 4, crabs: 2, sharks: 0,
    lionfish: 2, powerups: 2, fish: 8, jellies: 3 },
  // L4 canyon — the first trapped chest. Shark chase!
  { scene: SCENES.canyon, scrollSpeed: 206, scrollLength: 7000, pearlGroups: 5, coins: 6,
    gates: 2, gateGap: 232, tunnels: 1, obstacles: 6, urchins: 5, crabs: 2, sharks: 0,
    lionfish: 2, powerups: 3, fish: 9, jellies: 3, sharkChase: true },
  // L5 gems — free-roaming sharks join in.
  { scene: SCENES.gems, scrollSpeed: 218, scrollLength: 9000, pearlGroups: 6, coins: 6,
    gates: 3, gateGap: 224, tunnels: 1, obstacles: 8, urchins: 5, crabs: 3, sharks: 1,
    lionfish: 2, powerups: 3, fish: 9, jellies: 4 },
  // L6 kelp — dark, dense, gaps tightening.
  { scene: SCENES.kelp, scrollSpeed: 228, scrollLength: 9400, pearlGroups: 7, coins: 7,
    gates: 3, gateGap: 214, tunnels: 2, obstacles: 9, urchins: 6, crabs: 3, sharks: 1,
    lionfish: 3, powerups: 3, fish: 9, jellies: 4 },
  // L7 cove — four gates and two sharks.
  { scene: SCENES.cove, scrollSpeed: 238, scrollLength: 9800, pearlGroups: 7, coins: 7,
    gates: 4, gateGap: 206, tunnels: 2, obstacles: 10, urchins: 6, crabs: 3, sharks: 2,
    lionfish: 3, powerups: 3, fish: 10, jellies: 4 },
  // L8 bones — the graveyard, and another trapped chest.
  { scene: SCENES.bones, scrollSpeed: 246, scrollLength: 8200, pearlGroups: 6, coins: 8,
    gates: 3, gateGap: 200, tunnels: 2, obstacles: 9, urchins: 7, crabs: 3, sharks: 1,
    lionfish: 3, powerups: 4, fish: 10, jellies: 5, sharkChase: true },
  // L9-L11 — a second, harder lap through the best scenes.
  { scene: SCENES.coral, scrollSpeed: 258, scrollLength: 10600, pearlGroups: 8, coins: 8,
    gates: 5, gateGap: 192, tunnels: 2, obstacles: 12, urchins: 7, crabs: 4, sharks: 2,
    lionfish: 4, powerups: 4, fish: 10, jellies: 5 },
  { scene: SCENES.canyon, scrollSpeed: 268, scrollLength: 11000, pearlGroups: 8, coins: 9,
    gates: 5, gateGap: 182, tunnels: 3, obstacles: 13, urchins: 8, crabs: 4, sharks: 2,
    lionfish: 4, powerups: 4, fish: 11, jellies: 5 },
  { scene: SCENES.gems, scrollSpeed: 280, scrollLength: 11400, pearlGroups: 8, coins: 9,
    gates: 6, gateGap: 172, tunnels: 3, obstacles: 14, urchins: 8, crabs: 4, sharks: 3,
    lionfish: 5, powerups: 4, fish: 11, jellies: 6 },
  // L12 bones — the finale: hardest run, trapped chest, and the crown.
  { scene: SCENES.bones, scrollSpeed: 292, scrollLength: 9800, pearlGroups: 7, coins: 10,
    gates: 5, gateGap: 164, tunnels: 3, obstacles: 13, urchins: 9, crabs: 4, sharks: 2,
    lionfish: 5, powerups: 5, fish: 11, jellies: 6, sharkChase: true },
];

export const CHEST_Y = 880;

/** On chase levels the real chest waits back beyond the original start. */
export const REAL_CHEST_WORLD_X = -2600;
/** Scroll position where the escape run stops, with the real chest in view. */
export const ESCAPE_END_SCROLL = REAL_CHEST_WORLD_X - 350;
/** The rockfall that drives the shark off fires here, part-way back. */
export const ROCKFALL_SCROLL = 1500;

/**
 * Gate spikes never come below this, so the seafloor resting lane stays a
 * safe corridor for a child who stops playing.
 */
const GATE_FLOOR_LIMIT = 800;
const SPIKE_STEP = 92;

export function chestWorldX(cfg: LevelConfig): number {
  return cfg.scrollLength + 1430;
}

/** Back-to-front parallax factors for a scene. */
export function parallaxFactors(scene: SceneConfig): number[] {
  const f: number[] = [];
  for (let i = 1; i <= scene.layers; i++) {
    if (i === scene.floorLayer || i === scene.extraFloorLayer) f.push(1.0);
    else if (i === scene.foregroundLayer) f.push(1.18);
    else if (i > scene.floorLayer) f.push(1.08); // e.g. light shafts in the kelp
    else {
      const backCount = scene.floorLayer - 1;
      const t = Math.min(1, (i - 1) / Math.max(1, backCount - 1));
      f.push(0.03 + (0.55 - 0.03) * t * t);
    }
  }
  return f;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LevelContent {
  collectibles: Collectible[];
  fishDefs: FishDef[];
  jellyDefs: JellyDef[];
  hazardDefs: HazardDef[];
  powerupDefs: PowerupDef[];
  obstacleDefs: ObstacleDef[];
  helperDefs: HelperDef[];
}

const BAND_TOP = 300;
const BAND_BOTTOM = 760;

/**
 * Deterministic layout per level. Pearl runs come in five shapes so no two
 * levels read the same; gates and tunnels are spike walls with a pearl in
 * the opening; obstacles and creatures fill the space between.
 */
export function buildLevel(index: number): LevelContent {
  const cfg = LEVELS[index % LEVELS.length];
  const rand = mulberry32(7000 + index * 131);
  const pick = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const clamp = (y: number) => Math.min(BAND_BOTTOM, Math.max(BAND_TOP, y));

  const collectibles: Collectible[] = [];
  const hazardDefs: HazardDef[] = [];
  const powerupDefs: PowerupDef[] = [];
  const obstacleDefs: ObstacleDef[] = [];
  const helperDefs: HelperDef[] = [];

  const startX = 1400;
  const endX = cfg.scrollLength - 500;
  const span = (endX - startX) / cfg.pearlGroups;

  // --- pearl runs: five shapes, rotated so levels never feel identical ---
  const shapes = ['arc', 'wave', 'stair', 'zigzag', 'ring'] as const;
  const groupYs: number[] = [];
  for (let g = 0; g < cfg.pearlGroups; g++) {
    const gx = startX + g * span + pick(0, span * 0.15);
    const cy = pick(BAND_TOP + 90, BAND_BOTTOM - 90);
    groupYs.push(cy);
    const shape = shapes[(g + index) % shapes.length];
    const n = 5 + Math.floor(rand() * 3);
    const spacing = pick(140, 170);
    const amp = pick(130, 195);

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      let x = gx + i * spacing;
      let y = cy;
      switch (shape) {
        case 'arc':
          y = cy - Math.sin(t * Math.PI) * amp * (rand() > 0.5 ? 1 : -0.85);
          break;
        case 'wave':
          y = cy + Math.sin(t * Math.PI * 2) * amp * 0.85;
          break;
        case 'stair':
          y = cy - amp + t * amp * 2;
          break;
        case 'zigzag':
          y = cy + (i % 2 === 0 ? -amp * 0.7 : amp * 0.7);
          break;
        case 'ring': {
          const a = t * Math.PI * 2;
          x = gx + 220 + Math.cos(a) * 200;
          y = cy + Math.sin(a) * amp * 0.75;
          break;
        }
      }
      collectibles.push({ kind: 'pearl', worldX: x, y: clamp(y) });
    }
  }

  for (let c = 0; c < cfg.coins; c++) {
    const t = (c + 0.5) / cfg.coins;
    collectibles.push({
      kind: 'coin',
      worldX: startX + t * (endX - startX) + pick(-120, 120),
      y: pick(BAND_TOP + 60, BAND_BOTTOM - 60),
    });
  }

  // --- spike gates: a wall of urchins with one clear opening -------------
  const busyXs: number[] = [];
  const addGate = (gateX: number, gapY: number, half: number) => {
    busyXs.push(gateX);
    for (let y = PLAY_TOP + 30; y < gapY - half; y += SPIKE_STEP) {
      hazardDefs.push({ kind: 'urchin', worldX: gateX, baseY: y, still: true });
    }
    for (let y = gapY + half; y < GATE_FLOOR_LIMIT; y += SPIKE_STEP) {
      hazardDefs.push({ kind: 'urchin', worldX: gateX, baseY: y, still: true });
    }
    collectibles.push({ kind: 'pearl', worldX: gateX, y: gapY });
    collectibles.push({ kind: 'pearl', worldX: gateX + 190, y: gapY });
  };

  for (let k = 0; k < cfg.gates; k++) {
    const gateX = startX + span * 0.55 + ((k + 0.5) / cfg.gates) * (endX - startX - span);
    addGate(gateX, pick(BAND_TOP + 40, BAND_BOTTOM - 100), cfg.gateGap);
  }

  // --- tunnels: a horizontal spike corridor with a pearl line inside -----
  for (let k = 0; k < cfg.tunnels; k++) {
    const tx = startX + span * 0.3 + ((k + 0.25) / Math.max(1, cfg.tunnels)) * (endX - startX - span * 1.5);
    const midY = pick(BAND_TOP + 120, BAND_BOTTOM - 120);
    const half = cfg.gateGap * 0.78;
    const length = pick(700, 1100);
    busyXs.push(tx + length / 2);
    for (let x = tx; x < tx + length; x += SPIKE_STEP * 1.35) {
      hazardDefs.push({ kind: 'urchin', worldX: x, baseY: midY - half, still: true });
      if (midY + half < GATE_FLOOR_LIMIT) {
        hazardDefs.push({ kind: 'urchin', worldX: x, baseY: midY + half, still: true });
      }
    }
    for (let x = tx + 60; x < tx + length; x += 175) {
      collectibles.push({ kind: 'pearl', worldX: x, y: midY });
    }
  }

  const clearOfBusy = (x: number, pad = 430) => busyXs.every((bx) => Math.abs(x - bx) > pad);

  // --- obstacles: props rooted to the seabed, or hanging from a rock roof
  const roofed = ROOFED_SCENES.has(cfg.scene.id);
  const wreck = cfg.scene.id === 'b1s1' || cfg.scene.id === 'b2s1';
  const floorSet = wreck ? [...FLOOR_PROPS, ...WRECK_PROPS] : FLOOR_PROPS;
  let placed = 0;
  for (let attempt = 0; attempt < cfg.obstacles * 14 && placed < cfg.obstacles; attempt++) {
    const x = pick(startX + 200, endX);
    if (!clearOfBusy(x)) continue;
    // hanging props only under a rock roof, and never more than a third
    if (roofed && rand() < 0.33) {
      obstacleDefs.push({
        kind: CEILING_PROPS[Math.floor(rand() * CEILING_PROPS.length)],
        worldX: x,
        anchor: 'ceiling',
        reach: pick(180, 330),
      });
    } else {
      obstacleDefs.push({
        kind: floorSet[Math.floor(rand() * floorSet.length)],
        worldX: x,
        anchor: 'floor',
        reach: pick(120, 300),
      });
    }
    placed++;
  }

  // --- free-swimming ouchy creatures ------------------------------------
  for (let u = 0; u < cfg.urchins; u++) {
    const g = u % cfg.pearlGroups;
    const gx = startX + (g + 0.82) * span;
    if (!clearOfBusy(gx)) continue;
    const y = groupYs[g] > 520 ? pick(290, 400) : pick(620, 730);
    hazardDefs.push({ kind: 'urchin', worldX: gx + pick(-80, 80), baseY: y });
  }
  for (let c = 0; c < cfg.crabs; c++) {
    hazardDefs.push({
      kind: 'crab',
      worldX: startX + ((c + 0.6) / cfg.crabs) * (endX - startX) + pick(-200, 200),
      baseY: 952,
    });
  }
  for (let l = 0; l < cfg.lionfish; l++) {
    const x = startX + ((l + 0.35) / cfg.lionfish) * (endX - startX) + pick(-260, 260);
    if (!clearOfBusy(x, 300)) continue;
    hazardDefs.push({ kind: 'lionfish', worldX: x, baseY: pick(330, 700) });
  }
  for (let s = 0; s < cfg.sharks; s++) {
    const sharkX = 3000 + s * 3600 + pick(0, 900);
    hazardDefs.push({ kind: 'shark', worldX: sharkX, baseY: pick(380, 560) });
    // Two seahorses per shark: catch either one and she simply outruns it.
    // Two, at different heights, so there is always a reachable escape.
    powerupDefs.push({ kind: 'seahorse', worldX: sharkX - 900, y: pick(BAND_TOP + 60, 520) });
    powerupDefs.push({ kind: 'seahorse', worldX: sharkX - 380, y: pick(560, BAND_BOTTOM - 60) });
    // Roughly half the sharks get a dolphin shadowing them — it charges in
    // and drives that shark off. Random on purpose: a lucky rescue, not a
    // guarantee, so sharks stay worth respecting.
    if (rand() < 0.5) {
      helperDefs.push({ kind: 'dolphin', worldX: sharkX - pick(700, 1500), baseY: pick(340, 620) });
    }
  }

  // Turtles: calm assists dotted along the level. Retry placement so a busy
  // level never ends up with none — the turtle is a nice moment to find.
  const turtles = 1 + Math.floor(index / 4);
  for (let i = 0; i < turtles; i++) {
    let x = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      x = pick(startX + 900, endX - 700);
      if (clearOfBusy(x, 320)) break;
      x = 0;
    }
    if (!x) continue;
    helperDefs.push({ kind: 'turtle', worldX: x, baseY: pick(BAND_TOP + 80, BAND_BOTTOM - 80) });
  }

  // --- powerups: a shield always lands before the first gate -------------
  const kinds: PowerupKind[] = ['shield', 'magnet', 'boost', 'heart'];
  for (let p = 0; p < cfg.powerups; p++) {
    const kind = kinds[p % kinds.length];
    const x =
      p === 0
        ? Math.max(1700, busyXs.length ? Math.min(...busyXs) - 520 : 2400)
        : pick(2400, endX - 900);
    powerupDefs.push({ kind, worldX: x, y: pick(BAND_TOP + 60, BAND_BOTTOM - 60) });
  }

  // --- friendly life (lionfish is an enemy now, so species 1-3 only) -----
  const fishDefs: FishDef[] = [];
  for (let i = 0; i < cfg.fish; i++) {
    fishDefs.push({
      species: ((i % 3) + 1) as 1 | 2 | 3,
      worldX: 1100 + (i * (cfg.scrollLength - 1500)) / cfg.fish + pick(-200, 200),
      baseY: pick(300, 740),
      amp: pick(45, 85),
      freq: pick(0.3, 0.6),
      drift: pick(25, 60),
      scale: pick(0.7, 1),
      depth: rand() > 0.7 ? 11 : 6,
    });
  }
  const jellyDefs: JellyDef[] = [];
  for (let i = 0; i < cfg.jellies; i++) {
    const x = 2000 + (i * (cfg.scrollLength - 3000)) / cfg.jellies + pick(-250, 250);
    if (!clearOfBusy(x, 320)) continue;
    jellyDefs.push({ species: ((i % 3) + 1) as 1 | 2 | 3, worldX: x, baseY: pick(360, 560) });
  }

  // --- the escape run: everything behind the original start line --------
  // Only reachable on chase levels, when the shark drives her back past it.
  if (cfg.sharkChase) {
    for (let x = 600; x > REAL_CHEST_WORLD_X + 700; x -= 210) {
      collectibles.push({
        kind: 'pearl',
        worldX: x,
        y: clamp(520 + Math.sin(x * 0.0016) * 210),
      });
    }
    for (let i = 0; i < 5; i++) {
      obstacleDefs.push({
        kind: FLOOR_PROPS[Math.floor(rand() * FLOOR_PROPS.length)],
        worldX: 300 - i * 520 + pick(-90, 90),
        anchor: 'floor',
        reach: pick(140, 280),
      });
    }
    powerupDefs.push({ kind: 'heart', worldX: -700, y: 520 });
    powerupDefs.push({ kind: 'boost', worldX: -1700, y: 480 });
  }

  return { collectibles, fishDefs, jellyDefs, hazardDefs, powerupDefs, obstacleDefs, helperDefs };
}

/** Sanity guard used by the tests: nothing may block the resting lane. */
export const RESTING_LANE_Y = SEAFLOOR_Y;
