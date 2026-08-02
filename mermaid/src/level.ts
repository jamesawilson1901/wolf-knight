// Seven levels across seven background scenes, each a touch harder than the
// last. Difficulty design for an almost-six-year-old, borrowed from the games
// that get this right (Mario's level grammar, Kirby, Sago Mini, Toca Boca):
//  - one new element per level, introduced generously (never two at once)
//  - difficulty = density and variety, never punishment: there is still no
//    fail state anywhere, an ouch costs a red flash and a bump (jellyfish,
//    urchins, crabs and sharks all sting now)
//  - every level is completable by doing nothing at all
//  - the reward at the end is always the same big, reliable ritual
//    (chest -> sparkles -> a new friend), so finishing feels safe to want
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
  drift: number;
  scale: number;
  depth: 6 | 11;
}
export interface JellyDef {
  species: 1 | 2 | 3;
  worldX: number;
  baseY: number;
}
export interface HazardDef {
  kind: 'urchin' | 'crab' | 'shark';
  worldX: number;
  baseY: number;
}
export interface PowerupDef {
  kind: 'magnet' | 'shield';
  worldX: number;
  y: number;
}

export interface SceneConfig {
  id: string;
  layers: number;
  floorLayer: number; // the sand/rock the chest sits on — scrolls at 1.0
  extraFloorLayer?: number; // floor-level feature (e.g. the dino skeleton)
  foregroundLayer?: number; // rendered in front of gameplay
}

export interface LevelConfig {
  scene: SceneConfig;
  scrollSpeed: number;
  scrollLength: number;
  pearlGroups: number;
  coins: number;
  urchins: number;
  crabs: number;
  sharks: number;
  magnets: number;
  shields: number;
  fish: number;
  jellies: number;
}

export const LEVELS: LevelConfig[] = [
  // L1 — shipwreck reef: the baseline. A few urchins, one crab.
  { scene: { id: 'b1s1', layers: 6, floorLayer: 5, foregroundLayer: 6 },
    scrollSpeed: 170, scrollLength: 7800, pearlGroups: 5, coins: 4,
    urchins: 3, crabs: 1, sharks: 0, magnets: 0, shields: 0, fish: 8, jellies: 2 },
  // L2 — bright coral reef: introduces the magnet.
  { scene: { id: 'b1s4', layers: 6, floorLayer: 5, foregroundLayer: 6 },
    scrollSpeed: 178, scrollLength: 8200, pearlGroups: 5, coins: 5,
    urchins: 4, crabs: 1, sharks: 0, magnets: 1, shields: 0, fish: 9, jellies: 2 },
  // L3 — sunken ruins: introduces the shield bubble.
  { scene: { id: 'b2s1', layers: 8, floorLayer: 7, foregroundLayer: 8 },
    scrollSpeed: 186, scrollLength: 8600, pearlGroups: 6, coins: 5,
    urchins: 5, crabs: 2, sharks: 0, magnets: 1, shields: 1, fish: 9, jellies: 3 },
  // L4 — rocky canyon: denser, a little faster.
  { scene: { id: 'b2s2', layers: 6, floorLayer: 5, foregroundLayer: 6 },
    scrollSpeed: 194, scrollLength: 9000, pearlGroups: 6, coins: 6,
    urchins: 6, crabs: 2, sharks: 0, magnets: 1, shields: 1, fish: 10, jellies: 4 },
  // L5 — gem cave: introduces the shark (slow, well telegraphed).
  { scene: { id: 'b1s2', layers: 6, floorLayer: 5, foregroundLayer: 6 },
    scrollSpeed: 202, scrollLength: 9400, pearlGroups: 6, coins: 6,
    urchins: 6, crabs: 3, sharks: 1, magnets: 1, shields: 1, fish: 10, jellies: 4 },
  // L6 — pebble cove: two sharks, everything a notch denser.
  { scene: { id: 'b2s4', layers: 6, floorLayer: 5, foregroundLayer: 6 },
    scrollSpeed: 212, scrollLength: 9800, pearlGroups: 7, coins: 7,
    urchins: 7, crabs: 3, sharks: 2, magnets: 1, shields: 1, fish: 11, jellies: 4 },
  // L7 — dragon graveyard: the grand finale mix.
  { scene: { id: 'b2s3', layers: 6, floorLayer: 4, extraFloorLayer: 5, foregroundLayer: 6 },
    scrollSpeed: 222, scrollLength: 10200, pearlGroups: 7, coins: 8,
    urchins: 8, crabs: 3, sharks: 2, magnets: 2, shields: 1, fish: 11, jellies: 5 },
];

export const CHEST_Y = 880;

export function chestWorldX(cfg: LevelConfig): number {
  return cfg.scrollLength + 1430;
}

/** Back-to-front parallax factors for a scene. */
export function parallaxFactors(scene: SceneConfig): number[] {
  const f: number[] = [];
  for (let i = 1; i <= scene.layers; i++) {
    if (i === scene.floorLayer || i === scene.extraFloorLayer) f.push(1.0);
    else if (i === scene.foregroundLayer) f.push(1.18);
    else {
      // geometric ramp through the background layers
      const backCount = scene.floorLayer - 1;
      const t = (i - 1) / Math.max(1, backCount - 1);
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
}

/**
 * Deterministic layout per level: gentle arcs and waves of pearls with
 * hazards placed *between* groups and vertically away from each group's path,
 * so following the pearls steers around trouble. The collectible band stays
 * well off the floor and ceiling.
 */
export function buildLevel(index: number): LevelContent {
  const cfg = LEVELS[index % LEVELS.length];
  const rand = mulberry32(1000 + index * 77);
  const pick = (lo: number, hi: number) => lo + rand() * (hi - lo);

  const collectibles: Collectible[] = [];
  const hazardDefs: HazardDef[] = [];
  const powerupDefs: PowerupDef[] = [];

  const startX = 1400;
  const endX = cfg.scrollLength - 500;
  const span = (endX - startX) / cfg.pearlGroups;
  const groupYs: number[] = [];

  for (let g = 0; g < cfg.pearlGroups; g++) {
    const gx = startX + g * span + pick(0, span * 0.2);
    const cy = pick(380, 700);
    groupYs.push(cy);
    const n = 5 + Math.floor(rand() * 2);
    const spacing = pick(145, 175);
    const amp = pick(140, 190);
    const isArc = g % 2 === 0;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const y = isArc
        ? cy - Math.sin(t * Math.PI) * amp * (rand() > 0.5 ? 1 : -0.8)
        : cy + Math.sin(t * Math.PI * 2) * amp * 0.8;
      collectibles.push({
        kind: 'pearl',
        worldX: gx + i * spacing,
        y: Math.min(760, Math.max(300, y)),
      });
    }
  }

  // coins between groups, on the path a drifting mermaid might take
  for (let c = 0; c < cfg.coins; c++) {
    const t = (c + 0.5) / cfg.coins;
    collectibles.push({
      kind: 'coin',
      worldX: startX + t * (endX - startX) + pick(-120, 120),
      y: pick(360, 700),
    });
  }

  // urchins live between pearl groups, offset away from the group height
  for (let u = 0; u < cfg.urchins; u++) {
    const g = u % cfg.pearlGroups;
    const gx = startX + (g + 0.82) * span;
    const awayFrom = groupYs[g];
    const y = awayFrom > 520 ? pick(290, 400) : pick(620, 730);
    hazardDefs.push({ kind: 'urchin', worldX: gx + pick(-80, 80), baseY: y });
  }
  for (let c = 0; c < cfg.crabs; c++) {
    hazardDefs.push({
      kind: 'crab',
      worldX: startX + ((c + 0.6) / cfg.crabs) * (endX - startX) + pick(-200, 200),
      baseY: 952,
    });
  }
  for (let s = 0; s < cfg.sharks; s++) {
    hazardDefs.push({
      kind: 'shark',
      worldX: 2600 + s * 3400 + pick(0, 800),
      baseY: pick(380, 560),
    });
  }

  for (let m = 0; m < cfg.magnets; m++) {
    powerupDefs.push({ kind: 'magnet', worldX: pick(2200, endX - 2200), y: pick(380, 660) });
  }
  for (let s = 0; s < cfg.shields; s++) {
    powerupDefs.push({ kind: 'shield', worldX: pick(1700, 2600), y: pick(380, 660) });
  }

  const fishDefs: FishDef[] = [];
  for (let i = 0; i < cfg.fish; i++) {
    fishDefs.push({
      species: ((i % 4) + 1) as 1 | 2 | 3 | 4,
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
    jellyDefs.push({
      species: ((i % 3) + 1) as 1 | 2 | 3,
      worldX: 2000 + (i * (cfg.scrollLength - 3000)) / cfg.jellies + pick(-250, 250),
      baseY: pick(360, 560),
    });
  }

  return { collectibles, fishDefs, jellyDefs, hazardDefs, powerupDefs };
}
