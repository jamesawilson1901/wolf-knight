// Design space: 1080 tall, 16:9 safe band 1920 wide, canvas widened up to 20:9
// so wider phones fill with art instead of black bars.
export const DESIGN_HEIGHT = 1080;
export const SAFE_WIDTH = 1920;
export const MAX_WIDTH = 2400; // 20:9

export function computeGameWidth(): number {
  const long = Math.max(window.innerWidth, window.innerHeight);
  const short = Math.min(window.innerWidth, window.innerHeight);
  const aspect = short > 0 ? long / short : 16 / 9;
  const clamped = Math.min(Math.max(aspect, 16 / 9), MAX_WIDTH / DESIGN_HEIGHT);
  return Math.round(DESIGN_HEIGHT * clamped);
}

// Everything gameplay-critical stays inside the centred 16:9 band.
export function safeBandLeft(gameWidth: number): number {
  return Math.round((gameWidth - SAFE_WIDTH) / 2);
}

// Vertical play area for the mermaid (design px).
export const PLAY_TOP = 120;
export const SEAFLOOR_Y = 930; // resting height when she sinks all the way
export const SOFT_MARGIN = 140; // easing distance near top/bottom, not a hard stop

export const MERMAID_SCREEN_X = 620; // fixed x inside the safe band

export type SchemeId = 'A' | 'B' | 'C';

export const STORAGE_KEYS = {
  // v2: default flipped to scheme C (finger-follow) after phone testing
  scheme: 'mermaid-reef.scheme.v2',
  muted: 'mermaid-reef.muted',
  friends: 'mermaid-reef.friends',
  level: 'mermaid-reef.level',
  character: 'mermaid-reef.character',
  tint: 'mermaid-reef.tint',
  crowned: 'mermaid-reef.crowned',
};

// Customisation: gentle pastel shimmer tints (0 = natural).
export const TINTS = [0, 0xffd9ee, 0xd6ecff, 0xd9ffe3];

export function savedCharacter(): 1 | 2 | 3 {
  const c = Number(localStorage.getItem(STORAGE_KEYS.character));
  return c === 2 || c === 3 ? c : 1;
}
export function savedTint(): number {
  const i = Number(localStorage.getItem(STORAGE_KEYS.tint));
  return TINTS[i] ?? 0;
}
export function savedLevel(): number {
  const l = Number(localStorage.getItem(STORAGE_KEYS.level));
  return Number.isFinite(l) && l >= 0 ? Math.floor(l) : 0;
}
