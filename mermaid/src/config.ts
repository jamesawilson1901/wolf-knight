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

// Forward scroll: constant, gentle. ~60s of level.
export const SCROLL_SPEED = 130; // design px / second
export const LEVEL_SCROLL = 7800; // total scroll distance before the chest stop

export const MERMAID_SCREEN_X = 620; // fixed x inside the safe band

export type SchemeId = 'A' | 'B' | 'C';

export const STORAGE_KEYS = {
  // v2: default flipped to scheme C (finger-follow) after phone testing
  scheme: 'mermaid-reef.scheme.v2',
  muted: 'mermaid-reef.muted',
  friends: 'mermaid-reef.friends',
};
