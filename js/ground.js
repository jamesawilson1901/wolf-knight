// GROUND — the floor stops being one flat colour.
//
// Dad, after the first real playthrough of the rebuilt levels: *"the floor is
// just a generic colour everywhere, do we have access to textures or
// something."*
//
// We did not, and that is the honest answer. Until v3.36 every room's floor was
// Kenney's `floor-tile.glb` instanced across the rectangle with ONE tint from
// the district table applied to it — `floorTintMap(D)`. One tile, one colour, no
// detail, no variation, and identical from the first room of the game to the
// last. A Zelda screen is legible because the ground tells you where you are and
// where to go; ours told you neither.
//
// There are no ground textures in the repo to reach for: `find assets -name
// '*.png'` returns fourteen files and every one is a pack's own colour atlas.
// Downloading more is the wrong instinct anyway — this is an offline-first PWA
// the kids install to a phone, and a set of 1k ground textures is megabytes on
// the critical path for something we can compute in a few milliseconds.
//
// So the ground is PAINTED, per room, into a canvas, at load:
//
//   * a district palette and a district PATTERN — flagstones, cobbles, cave
//     floor, packed earth, grass, ash, snow — so Ember reads as burnt masonry
//     and Stoneroot reads as cut rock, before a single prop is placed
//   * several materials meeting INSIDE one room, via `patches` — scorch, moss,
//     gravel, mud, corruption — because the ROOM STANDARD asks for "path into
//     grass into dirt" and a single-material floor cannot say that
//   * a WORN PATH along the route through the room. This is the honest version
//     of the bobbing yellow orbs that v3.35 deleted: a floor that has been
//     walked on tells a child where people went without pretending to be a
//     collectible they can never collect. It is the oldest trick in level
//     design and it costs nothing.
//
// Everything is seeded off the room id, so a room looks the SAME every time a
// child walks back into it. A floor that reshuffles on re-entry is worse than a
// flat one — it tells them the world is not real.
//
// Cost: one draw call, the same as the instanced tile it replaces. The canvas is
// disposed with the room by World.dispose(), which already frees `map` on any
// material outside the shared registry.

import * as THREE from 'three';

// --- deterministic noise ----------------------------------------------------
// mulberry32: small, fast, and identical across every browser, which matters
// because "the same room" has to mean the same room on dad's phone and in the
// headless verifier.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The room currently being built. Set once by buildRoom() before it dispatches,
// read by dressShell as the default seed. The alternative was adding a seed
// argument to all fifty-two build functions, and a seed nobody remembers to
// pass is a seed that silently defaults — which would paint every room in the
// game with the identical layout of cracks, patches and wear.
let CURRENT = 'room';
export const setRoomSeed = (id) => { CURRENT = id || 'room'; };
export const roomSeed = () => CURRENT;

// A string room id -> a stable 32-bit seed.
export function seedOf(str) {
  const s = String(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --- colour -----------------------------------------------------------------
const c255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toRGB = (hex) => ({ r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 });
const css = (c, a = 1) => (a >= 1
  ? `rgb(${c255(c.r)},${c255(c.g)},${c255(c.b)})`
  : `rgba(${c255(c.r)},${c255(c.g)},${c255(c.b)},${a})`);
// scale toward black (k<1) or toward white (k>1), keeping hue
const shade = (c, k) => (k <= 1
  ? { r: c.r * k, g: c.g * k, b: c.b * k }
  : { r: c.r + (255 - c.r) * (k - 1), g: c.g + (255 - c.g) * (k - 1), b: c.b + (255 - c.b) * (k - 1) });
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

// --- district ground styles -------------------------------------------------
// Keyed by the district name already used in level1/2/3's district tables, so a
// district opts in by naming a style and inherits its own existing tints for
// everything else. An unlisted district still gets a TEXTURED floor — derived
// from its floorTint — rather than falling back to flat colour. There is no code
// path in this file that produces a single flat surface.
//
//   pattern  flagstone | cobble | cavefloor | earth | grass | ash | snow
//   wear     0..1  how heavily scuffed and cracked the district is
//   joint    0..1  how dark the gaps between stones read
//   path     multiplier on the base colour for the worn route (>1 polished
//            pale by feet, <1 trodden dark into soil)
//   grain    multiplier on the fine speckle
//   base     OPTIONAL hex that replaces the district's floorTint as the ground
//            colour. Needed where the district tint describes the CANOPY rather
//            than the earth: the Bloomfall's tint is blossom pink, and using it
//            as the ground turned four rooms into a flat candy-pink field —
//            which reads as a toy, not as somewhere beautiful that is dying.
//            The blossom belongs ON the ground as fallen petals, not AS it.
export const GROUND_STYLES = {
  // --- Ember Hollow: people LIVED here, and then it burned -----------------
  ashfall:   { pattern: 'ash',       wear: 0.85, joint: 0.55, path: 1.18, grain: 0.90 },
  causeway:  { pattern: 'flagstone', wear: 0.80, joint: 0.50, path: 1.22, grain: 0.70 },
  bridges:   { pattern: 'flagstone', wear: 0.90, joint: 0.45, path: 1.20, grain: 0.80 },
  kiln:      { pattern: 'flagstone', wear: 0.70, joint: 0.50, path: 1.24, grain: 0.75 },
  heart:     { pattern: 'flagstone', wear: 0.60, joint: 0.42, path: 1.15, grain: 0.60 },
  // --- Stoneroot: something enormous was carved here, long ago -------------
  vaultDark: { pattern: 'cavefloor', wear: 0.55, joint: 0.60, path: 1.26, grain: 0.85 },
  vaultWarm: { pattern: 'flagstone', wear: 0.50, joint: 0.55, path: 1.20, grain: 0.70 },
  glimmer:   { pattern: 'cavefloor', wear: 0.40, joint: 0.55, path: 1.30, grain: 0.90 },
  quarry:    { pattern: 'cobble',    wear: 0.75, joint: 0.60, path: 1.18, grain: 0.95 },
  sunken:    { pattern: 'cavefloor', wear: 0.60, joint: 0.50, path: 1.16, grain: 0.80 },
  crypt:     { pattern: 'flagstone', wear: 0.70, joint: 0.62, path: 1.14, grain: 0.70 },
  // --- Wild Woods: it was the loveliest place in the world -----------------
  thorn:     { pattern: 'grass', wear: 0.50, joint: 0.30, path: 0.78, grain: 1.00 },
  gloom:     { pattern: 'earth', wear: 0.60, joint: 0.30, path: 0.85, grain: 0.90 },
  bloom:     { pattern: 'grass', wear: 0.35, joint: 0.25, path: 0.80, grain: 1.05, base: 0x7f8a4e },
  root:      { pattern: 'earth', wear: 0.70, joint: 0.35, path: 0.84, grain: 0.95 },
  glade:     { pattern: 'grass', wear: 0.30, joint: 0.22, path: 0.82, grain: 1.10 },
  rot:       { pattern: 'earth', wear: 0.80, joint: 0.35, path: 0.82, grain: 0.95 },
  // --- elsewhere ----------------------------------------------------------
  // The Den is a GLADE, not a yard: grass, with the worn earth painted in as
  // patches where a camp actually wears it — round the fire, at the tent
  // mouths, along the tracks between them. `path` is below 1 because a track
  // through grass is trodden DARK, not polished pale like stone.
  den:       { pattern: 'grass', wear: 0.30, joint: 0.25, path: 0.80, grain: 1.05,
               // 0x4f7a3c, not 0x62894a. The paler green came out as a washed
               // sage once the grass tufts and the value layer went over it —
               // a lawn in a photograph, not a glade in a wood.
               base: 0x4f7a3c },
  snowfield: { pattern: 'snow',  wear: 0.30, joint: 0.20, path: 1.10, grain: 0.60 },
  // --- Stormreach: sea-cliff rock, scoured barer the higher you climb -------
  // One gradient, bottom to top, and the numbers carry it rather than the
  // colours alone: `wear` climbs and `grain` falls as the wind gets at it, so
  // the Landing's wet broken slate becomes the Open Sky's bare swept stone.
  landing:   { pattern: 'cobble',    wear: 0.62, joint: 0.55, path: 1.12, grain: 0.95, base: 0x4a5560 },
  galestair: { pattern: 'cobble',    wear: 0.78, joint: 0.48, path: 1.18, grain: 0.80, base: 0x5b6470 },
  thunder:   { pattern: 'flagstone', wear: 0.86, joint: 0.44, path: 1.24, grain: 0.62, base: 0x6b6e78 },
  opensky:   { pattern: 'flagstone', wear: 0.94, joint: 0.36, path: 1.28, grain: 0.48, base: 0x8a8378 },
  crown:     { pattern: 'flagstone', wear: 0.70, joint: 0.40, path: 1.20, grain: 0.55, base: 0x9a9080 },
  // --- The Sunken Vale: four shores that drowned differently ---------------
  shallows:  { pattern: 'earth',     wear: 0.60, joint: 0.35, path: 0.90, grain: 0.95, base: 0x6a8a84 },
  reeds:     { pattern: 'grass',     wear: 0.55, joint: 0.28, path: 0.86, grain: 1.05, base: 0x5f7248 },
  town:      { pattern: 'flagstone', wear: 0.80, joint: 0.58, path: 1.16, grain: 0.75, base: 0x5f6a80 },
  salt:      { pattern: 'cobble',    wear: 0.88, joint: 0.42, path: 1.22, grain: 0.60, base: 0xa89f86 },
  lagoon:    { pattern: 'cavefloor', wear: 0.50, joint: 0.40, path: 1.10, grain: 0.85, base: 0x2a5a6e },
  deepvale:  { pattern: 'cavefloor', wear: 0.55, joint: 0.45, path: 1.12, grain: 0.80, base: 0x23485c },
  // --- The Shadow Court: one palace, and the four wings it grew ------------
  // These bases were first authored around luminance 32-63, roughly a third of
  // what every other region uses, on the theory that a shadow palace should be
  // dark. Measured on a screen it made 18% of the Mirror Wing's puzzle room
  // literally unreadable. The floor is most of a top-down frame, so it is the
  // wrong surface to carry the mood: HUE says shadow, LIGHTING says shadow, and
  // the floor stays legible. Re-valued to ~70 — still the darkest ground in the
  // game, and the hue of each is untouched.
  court:     { pattern: 'flagstone', wear: 0.45, joint: 0.62, path: 1.14, grain: 0.55, base: 0x4c416a },
  ashwing:   { pattern: 'flagstone', wear: 0.78, joint: 0.55, path: 1.20, grain: 0.70, base: 0x5d403a },
  rootwing:  { pattern: 'earth',     wear: 0.66, joint: 0.38, path: 0.92, grain: 0.95, base: 0x394c32 },
  galewing:  { pattern: 'cobble',    wear: 0.80, joint: 0.48, path: 1.18, grain: 0.65, base: 0x3c4757 },
  mirrorwing:{ pattern: 'flagstone', wear: 0.35, joint: 0.66, path: 1.10, grain: 0.45, base: 0x48416d },
  throne:    { pattern: 'flagstone', wear: 0.30, joint: 0.70, path: 1.08, grain: 0.40, base: 0x4f3f6f },
  // --- The Village: the same square, before and after the shadow lifts -----
  // Same pattern and wear on both — it is one place, not two — only the base
  // hue moves: villageShadow reuses the exact 0x2a1a3a the rest of the game
  // already paints on every moon-weak enemy's corruption puff (js/enemies.js
  // TRAITS/puffTint), so a child who has learned "that colour is the shadow"
  // reads the same colour here without being taught it twice. `village` is
  // DISTRICTS.village's own floorTint, picked at the greybox pass.
  village:      { pattern: 'flagstone', wear: 0.55, joint: 0.52, path: 1.10, grain: 0.70, base: 0x6e5f45 },
  villageShadow:{ pattern: 'flagstone', wear: 0.55, joint: 0.52, path: 1.10, grain: 0.70, base: 0x2a1a3a },
};

const DEFAULT_STYLE = { pattern: 'earth', wear: 0.55, joint: 0.45, path: 1.15, grain: 0.80 };

// What a `patch` is made of. Patches are how one room gets several materials —
// a scorch where the fire took hold, moss creeping out of a cold corner, gravel
// spilling from a collapse. `edge` is how ragged the boundary is: 0 a clean
// spill, 1 a slow creep.
const PATCH_KINDS = {
  scorch:     { col: 0x191512, alpha: 0.72, speck: 0x3a2a1e, edge: 0.55 },
  ash:        { col: 0x8e8880, alpha: 0.45, speck: 0xb8b2a8, edge: 0.70 },
  moss:       { col: 0x445f30, alpha: 0.60, speck: 0x6f8f4a, edge: 0.75 },
  grass:      { col: 0x4e7a38, alpha: 0.66, speck: 0x7aa04a, edge: 0.70 },
  gravel:     { col: 0x6c6459, alpha: 0.50, speck: 0x9a9186, edge: 0.60 },
  mud:        { col: 0x4a3a2a, alpha: 0.60, speck: 0x2e241a, edge: 0.65 },
  water:      { col: 0x2b4a55, alpha: 0.62, speck: 0x4d7f8c, edge: 0.80 },
  ice:        { col: 0xbcd8e4, alpha: 0.55, speck: 0xe8f4fa, edge: 0.70 },
  corruption: { col: 0x2c1a38, alpha: 0.68, speck: 0x6b3f8a, edge: 0.60 },
  sand:       { col: 0xb9a279, alpha: 0.50, speck: 0xd8c9a4, edge: 0.70 },
  blossom:    { col: 0xe6a8c0, alpha: 0.55, speck: 0xf6d2e0, edge: 0.85 },
  rubble:     { col: 0x5f594f, alpha: 0.55, speck: 0x8d8880, edge: 0.50 },
};

// ---------------------------------------------------------------------------
// THE PAINTER
//
// Canvas -> world mapping, once, so nothing below has to think about it again.
// PlaneGeometry(w, d) rotated -PI/2 about X puts local +Y at world -Z, and
// CanvasTexture flips Y by default, which cancels out: canvas row 0 is world
// -Z (the far edge, the top of the screen) and canvas column 0 is world -X.
// Both axes therefore run the same way the camera sees them, and a path drawn
// left-to-right on the canvas runs left-to-right on the screen.
// ---------------------------------------------------------------------------

const MAX_PX = 1024;          // per side; 4 MB at worst, one room live at a time
const MIN_PPU = 14;           // never go coarser than this or joints turn to mush

function makeCanvas(w, d) {
  const ppu = Math.max(MIN_PPU, Math.min(30, MAX_PX / Math.max(w, d)));
  const W = Math.max(64, Math.round(w * ppu));
  const H = Math.max(64, Math.round(d * ppu));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  return { cv, g: cv.getContext('2d'), W, H, ppu };
}

// An irregular closed blob around (cx, cy) with radius r — the workhorse for
// anything that should not read as a circle: patches, scorches, cave stones.
function blob(g, cx, cy, r, wobble, rand, lobes = 14) {
  // Sampled radii joined with quadratic curves through the MIDPOINTS. Joining
  // them with lineTo (as the first draft did) leaves visible straight facets on
  // every patch — a corruption pool that reads as a hexagon is worse than no
  // patch at all.
  const pt = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const rr = r * (1 - wobble * 0.5 + rand() * wobble);
    pt.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  g.beginPath();
  const mid = (i, j) => [(pt[i][0] + pt[j][0]) / 2, (pt[i][1] + pt[j][1]) / 2];
  let m = mid(lobes - 1, 0);
  g.moveTo(m[0], m[1]);
  for (let i = 0; i < lobes; i++) {
    const nxt = mid(i, (i + 1) % lobes);
    g.quadraticCurveTo(pt[i][0], pt[i][1], nxt[0], nxt[1]);
  }
  g.closePath();
}

// Slightly-wonky rectangle: a cut stone that has settled over a few centuries.
function slab(g, x, y, w, h, rand, j) {
  g.beginPath();
  g.moveTo(x + rand() * j, y + rand() * j);
  g.lineTo(x + w - rand() * j, y + rand() * j);
  g.lineTo(x + w - rand() * j, y + h - rand() * j);
  g.lineTo(x + rand() * j, y + h - rand() * j);
  g.closePath();
}

// Every pattern calls this first. Without a low-frequency luminance layer the
// floor is uniformly busy and therefore reads FLAT from eleven units up — the
// second draft had detail everywhere and still looked like a swatch. Broad
// light and dark regions are what make a floor look like a place.
function bigMottle(g, W, H, ppu, base, rand, strength = 1) {
  for (let i = 0; i < 16; i++) {
    const k = 1 + (rand() - 0.5) * 0.4 * strength;
    g.fillStyle = css(shade(base, k), 0.11);
    blob(g, rand() * W, rand() * H, Math.max(W, H) * (0.14 + rand() * 0.32), 0.45, rand, 16);
    g.fill();
  }
}

// --- the district patterns --------------------------------------------------
// Each one paints the WHOLE surface. They are what makes a district legible
// from the floor alone — walk from the causeway into the kiln and the ground
// changes under you.

function patFlagstone(g, W, H, ppu, base, S, rand) {
  // 2.4u slabs. The first draft used 1.7u with hard black joints and it read as
  // a brick wall laid flat — the giveaway was that the joint grid was the most
  // contrasty thing on the floor. Real paving is mostly stone and barely any
  // joint, so: bigger slabs, joints only a little darker than the stone, and
  // most of the variation INSIDE each slab rather than between them.
  const size = 2.4 * ppu;
  g.fillStyle = css(shade(base, 0.72 - S.joint * 0.12)); g.fillRect(0, 0, W, H);
  const gap = Math.max(1, ppu * 0.055);
  for (let row = 0, y = -size; y < H + size; y += size, row++) {
    const off = (row % 2) * size * 0.5;
    for (let x = -size + off; x < W + size; x += size) {
      const k = 0.90 + rand() * 0.22;
      g.fillStyle = css(shade(base, k));
      slab(g, x + gap, y + gap, size - gap * 2, size - gap * 2, rand, ppu * 0.12);
      g.fill();
      // mottle within the slab — this is what stops it looking like tile
      for (let i = 0; i < 6; i++) {
        g.fillStyle = css(shade(base, k * (0.9 + rand() * 0.22)), 0.35);
        blob(g, x + rand() * size, y + rand() * size, size * (0.1 + rand() * 0.26), 0.5, rand, 9);
        g.fill();
      }
      // worn top-left lip, faint
      g.strokeStyle = css(shade(base, k * 1.14), 0.22);
      g.lineWidth = Math.max(1, ppu * 0.045);
      g.stroke();
    }
  }
}

function patCobble(g, W, H, ppu, base, S, rand) {
  // Drafts three and four laid one evenly-spaced grid of same-sized stones and
  // it read as pebbledash — a wall render, not a floor. Real broken stone has a
  // SIZE HIERARCHY: a few big blocks, medium stones packed around them, grit in
  // what is left. So this lays three passes largest-first and lets each fill the
  // gaps in the one before.
  g.fillStyle = css(shade(base, 0.76)); g.fillRect(0, 0, W, H);
  const area = W * H;
  const pass = (sizeU, count, wob) => {
    const r = sizeU * ppu;
    for (let i = 0; i < count; i++) {
      const k = 0.86 + rand() * 0.3;
      const rr = r * (0.6 + rand() * 0.8);        // wide spread inside the pass
      g.fillStyle = css(shade(base, k));
      blob(g, rand() * W, rand() * H, rr, wob, rand, 6 + Math.round(rand() * 3));
      g.fill();
      g.strokeStyle = css(shade(base, 0.62), 0.28);
      g.lineWidth = Math.max(1, ppu * 0.03);
      g.stroke();
    }
  };
  pass(1.5, Math.round(area / (ppu * ppu) * 0.10), 0.55);   // blocks
  pass(0.75, Math.round(area / (ppu * ppu) * 0.5), 0.6);    // stones
  pass(0.3, Math.round(area / (ppu * ppu) * 1.6), 0.65);    // grit
}

// No grid at all: this floor was never cut, only worn smooth by water.
function patCavefloor(g, W, H, ppu, base, S, rand) {
  g.fillStyle = css(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {              // broad damp mottling
    const k = 0.74 + rand() * 0.5;
    g.fillStyle = css(shade(base, k), 0.4);
    blob(g, rand() * W, rand() * H, ppu * (0.9 + rand() * 3.4), 0.5, rand);
    g.fill();
  }
  for (let i = 0; i < 420; i++) {             // embedded stones, angular
    const r = ppu * (0.07 + rand() * 0.22);
    g.fillStyle = css(shade(base, 0.62 + rand() * 0.56), 0.7);
    blob(g, rand() * W, rand() * H, r, 0.62, rand, 6);
    g.fill();
  }
  for (let i = 0; i < 40; i++) {              // wet, darker hollows
    g.fillStyle = css(shade(base, 0.66), 0.26);
    blob(g, rand() * W, rand() * H, ppu * (0.5 + rand() * 1.8), 0.55, rand, 12);
    g.fill();
  }
}

function patEarth(g, W, H, ppu, base, S, rand) {
  g.fillStyle = css(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {             // dragged, streaky soil
    const x = rand() * W, y = rand() * H;
    const len = ppu * (0.7 + rand() * 3.2), th = ppu * (0.07 + rand() * 0.2);
    const a = (rand() - 0.5) * 0.7;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = css(shade(base, 0.76 + rand() * 0.46), 0.4);
    g.beginPath(); g.ellipse(0, 0, len, th, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (let i = 0; i < 300; i++) {             // pebbles
    g.fillStyle = css(shade(base, 0.66 + rand() * 0.55), 0.7);
    blob(g, rand() * W, rand() * H, ppu * (0.05 + rand() * 0.15), 0.4, rand, 6);
    g.fill();
  }
}

function patGrass(g, W, H, ppu, base, S, rand) {
  // Grass has to read as grass from eleven units up. The first draft drew five
  // hair-thin blades per square unit at 3% of a unit wide, which at the real
  // camera distance averaged out to a flat green wash. Now: strong patchiness,
  // clumped tufts, and blades thick enough to survive a mipmap.
  g.fillStyle = css(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 150; i++) {
    g.fillStyle = css(shade(base, 0.66 + rand() * 0.68), 0.4);
    blob(g, rand() * W, rand() * H, ppu * (0.7 + rand() * 3.2), 0.5, rand);
    g.fill();
  }
  // bare earth showing through, so the green is never unbroken
  for (let i = 0; i < 26; i++) {
    g.fillStyle = css(mix(base, { r: 96, g: 74, b: 48 }, 0.55), 0.3 + rand() * 0.25);
    blob(g, rand() * W, rand() * H, ppu * (0.4 + rand() * 1.5), 0.55, rand);
    g.fill();
  }
  g.lineCap = 'round';
  const clumps = Math.round(W * H / (ppu * ppu) * 1.4);
  for (let c = 0; c < clumps; c++) {
    const cx = rand() * W, cy = rand() * H;
    const tint = 0.82 + rand() * 0.6;
    for (let b = 0; b < 5 + rand() * 6; b++) {
      const x = cx + (rand() - 0.5) * ppu * 0.55, y = cy + (rand() - 0.5) * ppu * 0.4;
      const h = ppu * (0.24 + rand() * 0.4);
      g.strokeStyle = css(shade(base, tint * (0.92 + rand() * 0.2)), 0.7);
      g.lineWidth = Math.max(1.2, ppu * 0.075);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + (rand() - 0.5) * h * 0.7, y - h * 0.6,
                         x + (rand() - 0.5) * h * 1.5, y - h);
      g.stroke();
    }
  }
}

function patAsh(g, W, H, ppu, base, S, rand) {
  g.fillStyle = css(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {              // drifts, banked against nothing
    g.fillStyle = css(shade(base, 1.12 + rand() * 0.2), 0.28);
    blob(g, rand() * W, rand() * H, ppu * (1.4 + rand() * 4), 0.55, rand);
    g.fill();
  }
  for (let i = 0; i < 22; i++) {              // burnt-through, broad and faint
    const x = rand() * W, y = rand() * H;
    g.save(); g.translate(x, y); g.rotate((rand() - 0.5) * 1.4);
    g.scale(1, 0.45 + rand() * 0.35);
    g.fillStyle = css(shade(base, 0.5), 0.13);
    blob(g, 0, 0, ppu * (2.0 + rand() * 4.5), 0.5, rand, 15);
    g.fill(); g.restore();
  }
  for (let i = 0; i < 34; i++) {              // charred lumps left in the ash
    g.fillStyle = css(shade(base, 0.34), 0.4 + rand() * 0.3);
    blob(g, rand() * W, rand() * H, ppu * (0.08 + rand() * 0.3), 0.6, rand, 6);
    g.fill();
  }
  for (let i = 0; i < 500; i++) {             // cinders and pale flecks
    const warm = rand() < 0.18;
    g.fillStyle = warm ? `rgba(${180 + rand() * 60 | 0},${70 + rand() * 40 | 0},30,0.35)`
                       : css(shade(base, 1.3), 0.4);
    const r = ppu * (0.02 + rand() * 0.08);
    g.beginPath(); g.arc(rand() * W, rand() * H, r, 0, Math.PI * 2); g.fill();
  }
}

function patSnow(g, W, H, ppu, base, S, rand) {
  g.fillStyle = css(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i++) {              // drifts with a cold shadow side
    const x = rand() * W, y = rand() * H, r = ppu * (1.2 + rand() * 3.6);
    g.fillStyle = css(mix(base, { r: 150, g: 178, b: 205 }, 0.35), 0.3);
    blob(g, x, y, r, 0.45, rand); g.fill();
    g.fillStyle = css(shade(base, 1.25), 0.35);
    blob(g, x - r * 0.12, y - r * 0.18, r * 0.85, 0.45, rand); g.fill();
  }
  for (let i = 0; i < 400; i++) {             // sparkle
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(rand() * W, rand() * H, ppu * (0.02 + rand() * 0.05), 0, Math.PI * 2); g.fill();
  }
}

const PATTERNS = {
  flagstone: patFlagstone, cobble: patCobble, cavefloor: patCavefloor,
  earth: patEarth, grass: patGrass, ash: patAsh, snow: patSnow,
};

// --- patches: several materials meeting inside one room ---------------------
// ROOM STANDARD §6 asks for "path into grass into dirt". A patch is one of
// those materials, spilled where the fiction puts it: scorch under a collapsed
// roof, moss on the cold north side, gravel where the ceiling came down.
function paintPatch(g, X, Y, ppu, p, rand) {
  const K = PATCH_KINDS[p.kind] || PATCH_KINDS.rubble;
  const col = toRGB(K.col), spk = toRGB(K.speck);
  const cx = X(p.x), cy = Y(p.z), r = (p.r || 3) * ppu;
  const a = p.alpha !== undefined ? p.alpha : K.alpha;
  // the body, built from overlapping lobes so no edge is ever a clean arc
  const lobes = 4 + Math.round(rand() * 4);
  for (let i = 0; i < lobes; i++) {
    const ang = rand() * Math.PI * 2, dist = rand() * r * 0.45;
    g.fillStyle = css(col, a * (0.55 + rand() * 0.45));
    blob(g, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist,
      r * (0.55 + rand() * 0.5), 0.35 + K.edge * 0.4, rand);
    g.fill();
  }
  // the creep: detached flecks outside the body, so the boundary breathes
  const flecks = Math.round(r * K.edge * 3.2);
  for (let i = 0; i < flecks; i++) {
    const ang = rand() * Math.PI * 2, dist = r * (0.7 + rand() * 0.55);
    g.fillStyle = css(col, a * 0.45 * rand());
    blob(g, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist,
      r * (0.015 + rand() * 0.07), 0.6, rand, 6);
    g.fill();
  }
  // grain within the patch, so it does not read as a sticker
  for (let i = 0; i < r * 1.6; i++) {
    const ang = rand() * Math.PI * 2, dist = Math.sqrt(rand()) * r * 0.95;
    g.fillStyle = css(spk, 0.35 * rand());
    g.beginPath();
    g.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist,
      ppu * (0.03 + rand() * 0.11), 0, Math.PI * 2);
    g.fill();
  }
}

// --- the worn path ----------------------------------------------------------
// This is the replacement for the yellow orbs, and it is a better guide than
// they ever were: it is diegetic (feet made it), it is unmistakably not a
// pickup, and it points continuously instead of in three discrete hops.
//
// Drawn as a stack of strokes from wide-and-faint to narrow-and-strong, which
// gives a soft trodden edge without a single gradient object. The polyline is
// resampled and jittered first — a path with perfectly straight legs reads as
// a road marking, not as wear.
function paintPath(g, pts, ppu, base, S, rand, widthU) {
  if (!pts || pts.length < 2) return;
  const w = (widthU || 3.2) * ppu;

  // 1. RESAMPLE with a smooth wander.
  //
  // Draft one stroked the polyline with per-sample jitter and got a ruled
  // stripe — a road marking. The jitter was high-frequency, which a wide stroke
  // averages straight back out, and both doors sit at x=0 so the route ran dead
  // straight anyway. The wander is now LOW frequency and large: control offsets
  // every few units, cosine-interpolated, pushing the route up to most of a
  // path-width off the true line.
  const flat = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(seg / (ppu * 0.4)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      flat.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
  }
  flat.push(pts[pts.length - 1]);

  const CTRL = 5;
  const ctrl = Array.from({ length: CTRL + 1 }, () => (rand() - 0.5) * 2);
  ctrl[0] *= 0.12; ctrl[CTRL] *= 0.12;      // stay honest at the doorways
  const wanderAt = (t) => {
    const u = t * CTRL, i = Math.min(CTRL - 1, Math.floor(u)), f = u - i;
    const s2 = (1 - Math.cos(f * Math.PI)) / 2;
    return ctrl[i] * (1 - s2) + ctrl[i + 1] * s2;
  };
  const dense = flat.map(([x, y], i) => {
    const t = i / (flat.length - 1);
    const [px, py] = flat[Math.min(flat.length - 1, i + 1)];
    let nx = py - y, ny = -(px - x);
    const len = Math.hypot(nx, ny) || 1;
    return [x + (nx / len) * wanderAt(t) * w * 0.8,
            y + (ny / len) * wanderAt(t) * w * 0.8, t];
  });

  // 2. LAY THE WEAR as a BLURRED band.
  //
  // Draft two stacked overlapping blobs along the route and the individual
  // blobs stayed visible — a lumpy caterpillar. Canvas 2D has a real blur
  // filter, so the band is stroked once at variable width and blurred, which
  // gives a genuinely soft shoulder no amount of stacking will. The stroke
  // width breathes along the length so the band is never two parallel edges.
  //
  // The contrast is computed against the base rather than taken from the style
  // multiplier alone: on a pale floor (glimmer) a 1.3x multiplier clips to
  // nothing and the path vanishes, which is how draft two lost the guidance in
  // exactly the rooms that needed it most.
  const lum = (base.r * 0.299 + base.g * 0.587 + base.b * 0.114) / 255;
  const lighten = S.path >= 1;
  const amt = lighten ? Math.min(0.34, 0.14 + (1 - lum) * 0.3)
                      : Math.min(0.34, 0.14 + lum * 0.3);
  const worn = lighten ? shade(base, 1 + amt) : shade(base, 1 - amt);
  const deep = lighten ? shade(base, 1 - amt * 0.55) : shade(base, 1 - amt * 1.25);

  // Blurring has to happen ONCE, not per segment. Setting ctx.filter and then
  // stroking a thousand short segments runs a thousand full blur passes and the
  // painter simply never returns — draft three hung the screenshot at thirty
  // seconds. So the band is drawn opaque into an offscreen canvas and blurred a
  // single time on the way in.
  const off = document.createElement('canvas');
  off.width = g.canvas.width; off.height = g.canvas.height;
  const og = off.getContext('2d');

  const band = (width, colour, alpha, blurPx) => {
    og.clearRect(0, 0, off.width, off.height);
    og.strokeStyle = css(colour, 1);
    og.lineCap = 'round'; og.lineJoin = 'round';
    for (let i = 0; i < dense.length - 1; i++) {
      const t = dense[i][2];
      const breathe = 0.72 + 0.28 * Math.sin(t * 6.3 + ctrl[1] * 4);
      og.lineWidth = width * breathe;
      og.beginPath();
      og.moveTo(dense[i][0], dense[i][1]);
      og.lineTo(dense[i + 1][0], dense[i + 1][1]);
      og.stroke();
    }
    g.save();
    g.filter = `blur(${blurPx}px)`;
    g.globalAlpha = alpha;
    g.drawImage(off, 0, 0);
    g.restore();
  };

  band(w * 1.15, deep, 0.20, ppu * 0.55);   // the hollow the feet pressed
  band(w * 0.82, worn, 0.26, ppu * 0.42);   // the wear itself
  band(w * 0.34, worn, 0.16, ppu * 0.3);    // where the traffic concentrates

  // 3. GRAIN inside the band, so it is not a smooth airbrushed sweep, and
  //    LOOSE STONES on the shoulders where feet pushed the grit aside.
  for (let i = 0; i < dense.length; i += 3) {
    const [x, y] = dense[i];
    if (rand() < 0.55) {
      const off = (rand() - 0.5) * w * 0.7;
      g.fillStyle = css(shade(base, 1 + (rand() - 0.5) * 0.3), 0.16);
      blob(g, x + off, y + (rand() - 0.5) * w * 0.3, ppu * (0.12 + rand() * 0.4), 0.5, rand, 10);
      g.fill();
    }
    if (rand() < 0.34) {
      const [px, py] = dense[Math.min(dense.length - 1, i + 1)];
      let nx = py - y, ny = -(px - x);
      const len = Math.hypot(nx, ny) || 1;
      const side = (rand() < 0.5 ? -1 : 1) * w * (0.46 + rand() * 0.24);
      g.fillStyle = css(shade(base, 0.72 + rand() * 0.5), 0.5 + rand() * 0.3);
      blob(g, x + (nx / len) * side, y + (ny / len) * side,
        ppu * (0.05 + rand() * 0.14), 0.4, rand, 8);
      g.fill();
    }
  }
}

// --- wear, cracks, grime ----------------------------------------------------
function paintCracks(g, W, H, ppu, base, S, rand) {
  // Fewer and heavier than the second draft, which drew thirty thin wandering
  // lines that read as stray hairs lying on the floor. A crack in stone runs
  // fairly straight and opens as it goes.
  const n = Math.round(3 + S.wear * 9);
  for (let i = 0; i < n; i++) {
    let x = rand() * W, y = rand() * H;
    let a = rand() * Math.PI * 2;
    const steps = 6 + Math.round(rand() * 12);
    g.strokeStyle = css(shade(base, 0.42), 0.3 + rand() * 0.26);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let sI = 0; sI < steps; sI++) {
      a += (rand() - 0.5) * 0.36;             // straighter run
      const nx = x + Math.cos(a) * ppu * 0.55, ny = y + Math.sin(a) * ppu * 0.55;
      g.lineWidth = Math.max(1, ppu * (0.10 - 0.06 * (sI / steps)));  // tapers
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny;
    }
  }
}

// Dirt banks up where the floor meets a wall. Without this the room reads as a
// texture swatch with a hard edge; with it, it reads as a place with corners.
function paintGrime(g, W, H, ppu, base, S) {
  const dark = shade(base, 0.62);
  const band = Math.min(W, H) * 0.16;
  const sides = [
    [0, 0, 0, band, W, band],           // north
    [0, H, 0, H - band, W, band],       // south
    [0, 0, band, 0, band, H],           // west
    [W, 0, W - band, 0, band, H],       // east
  ];
  for (const [gx0, gy0, gx1, gy1] of sides) {
    const grad = g.createLinearGradient(gx0, gy0, gx1, gy1);
    grad.addColorStop(0, css(dark, 0.42));
    grad.addColorStop(1, css(dark, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
}

function paintSpeckle(g, W, H, ppu, base, S, rand) {
  const n = Math.round(W * H / 900 * (S.grain || 0.8) * 6);
  for (let i = 0; i < n; i++) {
    const up = rand() < 0.5;
    g.fillStyle = css(shade(base, up ? 1.3 : 0.66), 0.05 + rand() * 0.12);
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

// Paint one room's ground into a canvas. Exported separately from ground() so
// the density verifier can pull the pixels and assert that a floor actually has
// variation in it, rather than trusting that it was asked for.
const warned = new Set();
export function paintGround(w, d, D, opts = {}) {
  // A DISTRICT THAT NAMES NO STYLE IS A BUG, NOT A DEFAULT.
  //
  // This shipped resolving `GROUND_STYLES[opts.style || D.ground]` and silently
  // falling back to DEFAULT_STYLE when the lookup missed — and every district
  // table in the game missed, because none of them carried a `ground` field.
  // The result: eight authored patterns, none of them ever drawn, every room in
  // three regions rendered as generic earth, and four screenshots reviewed
  // before the flat pink Bloomfall floor made it obvious. A silent fallback
  // that produces plausible output is the worst kind.
  const styleName = opts.style || D.ground;
  if (!styleName || !GROUND_STYLES[styleName]) {
    const k = String(styleName);
    if (!warned.has(k)) {
      warned.add(k);
      console.warn(`[ground] no style "${k}" — falling back to generic earth. `
        + `Add a \`ground:\` key to the district, or a style to GROUND_STYLES.`);
    }
  }
  const S = { ...DEFAULT_STYLE, ...(GROUND_STYLES[styleName] || {}) };
  const base = toRGB(S.base !== undefined ? S.base
    : (D.floorTint !== undefined ? D.floorTint : 0x7a746c));
  const { cv, g, W, H, ppu } = makeCanvas(w, d);
  const rand = rng(seedOf(opts.seed || 'room'));

  // world -> canvas. Both axes run the way the camera sees them (see the note
  // above THE PAINTER), so nothing below has to flip anything.
  const X = (x) => (x + w / 2) / w * W;
  const Y = (z) => (z + d / 2) / d * H;

  (PATTERNS[S.pattern] || patEarth)(g, W, H, ppu, base, S, rand);
  // broad light and dark regions, OVER the pattern so flagstones and cobbles
  // get it too, but UNDER the patches and the path so it never veils them
  bigMottle(g, W, H, ppu, base, rand);

  for (const p of (opts.patches || [])) paintPatch(g, X, Y, ppu, p, rand);

  for (const line of (opts.paths || (opts.path ? [opts.path] : []))) {
    paintPath(g, line.map(([x, z]) => [X(x), Y(z)]), ppu, base, S, rand, opts.pathWidth);
  }

  // CRACKS ARE A STONE THING. Drawn over grass or snow they read as thin black
  // scratches lying on top of the field — clearly visible in the first dressed
  // shot of t1a, and clearly wrong: soil does not crack in hairlines, it just
  // wears. So the pattern decides, not the district.
  if (S.pattern !== 'grass' && S.pattern !== 'snow') paintCracks(g, W, H, ppu, base, S, rand);
  paintGrime(g, W, H, ppu, base, S);
  paintSpeckle(g, W, H, ppu, base, S, rand);
  return cv;
}

// Build the ground plane and add it to the room. Drop-in for the instanced
// floor tile it replaces: same one draw call, same y, same shadow receiver.
export function ground(world, w, d, D, opts = {}) {
  const cv = paintGround(w, d, D, opts);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  // a hair above deckY: nothing should be left at exactly 0 to fight with, but
  // decals sit at +0.025 and up and must still win
  mesh.position.y = (world.deckY || 0) + 0.002;
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  world.add(mesh);
  // kept out of the static merge for the same reason the tile floor was: it is
  // already one call, and merging it would fold a 4 MB texture into the batch
  if (world.keepLoose) world.keepLoose(mesh);
  return mesh;
}

// Every room gets guidance for free: a worn route from each doorway to the
// middle of the room. Rooms that want a specific route (round a ruin, past the
// chest) pass their own `paths` instead.
//
// `gaps` is the same array shell() already takes: { side, from, to }.
export function pathsThroughDoors(gaps, halfW, halfD, opts = {}) {
  const inset = opts.inset !== undefined ? opts.inset : 1.8;
  const hub = opts.hub || [0, 0];
  const mouths = [];
  for (const gp of (gaps || [])) {
    const c = (gp.from + gp.to) / 2;
    if (gp.side === 'n') mouths.push([c, -halfD + inset]);
    else if (gp.side === 's') mouths.push([c, halfD - inset]);
    else if (gp.side === 'w') mouths.push([-halfW + inset, c]);
    else if (gp.side === 'e') mouths.push([halfW - inset, c]);
  }
  if (mouths.length === 0) return [];
  // two doors: one continuous route across the room, bowed slightly off centre
  // so it never reads as a ruled line
  if (mouths.length === 2) {
    const [a, b] = mouths;
    const mid = [(a[0] + b[0]) / 2 + (hub[0] - (a[0] + b[0]) / 2) * 0.8,
                 (a[1] + b[1]) / 2 + (hub[1] - (a[1] + b[1]) / 2) * 0.8];
    return [[a, mid, b]];
  }
  // otherwise a hub with a spur to each doorway
  return mouths.map((m) => [hub, m]);
}
