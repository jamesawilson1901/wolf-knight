// LEVEL KIT — the build vocabulary shared by every rebuilt level.
//
// Level 1 proved the pattern: describe a space ONCE as data, render it either
// as gridded greybox or as dressed art, and the box that gets walked and
// approved is provably the layout that ships. That pattern is not Ember-
// specific, and copying four hundred lines of it into Level 2 would guarantee
// the two costumes drift apart in one level and not the other — which is the
// exact failure greyboxing exists to prevent.
//
// So the shell, the doors, the wall runs, the scatter and the tint cache live
// here, once. A level supplies:
//
//   kit()     a function returning its loaded GLB kit (or null before load)
//   isGrey()  a function answering "greybox right now?"
//
// and gets back builders whose call signatures are identical in both levels.
// Everything below is geometry and colour; gameplay stays in the level module.

import * as THREE from 'three';
import { prepareModel, instancePlacements, SHARED } from './assets.js';
import { protoFloor, protoWall, protoDecal, protoLabel, protoMaterial } from './proto.js';
import { ground, pathsThroughDoors, roomSeed } from './ground.js';
import { districtTint } from './districts.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { WS } from './worldstate.js';
import { registerCuttable, alreadyCut } from './gates.js';

// METRICS.md — locked, inherited unchanged by every level built on this kit.
export const DOOR_HALF = 1.2;      // 2.4 u standard door
export const BOSS_DOOR_HALF = 1.3; // 2.6 u wide/boss door
export const WALL_T = 1.0;         // wall band thickness
export const DOOR_ZONE = 1.35;     // trigger band depth
export const BLIND_STRIP = 2.5;    // camera cannot see this band at the south wall

// The module sizes, also locked. A level picks from this list; if a space
// seems to want a size that is not here, the module gets redesigned rather
// than the grid getting bent (dad's rule).
export const MODULES = {
  island:  { w: 32, d: 26 },   // two camera-widths — cannot be seen at once
  choke:   { w: 14, d: 10 },   // smaller than one screen, on purpose
  pocket:  { w: 20, d: 16 },   // one screen-ish; a reward, not a maze
  arena:   { w: 26, d: 26 },   // a boss charge plus dodging room both sides
  hub:     { w: 36, d: 28 },   // NEW in Level 2 — see the note in METRICS.md
};

// A door gap in a shell wall. `centre` exists for the Level 2 hub, which needs
// FIVE doorways (an entrance, three spokes and the crypt) on four walls — so
// two of them share the north wall, 18 u apart, which reads as two clearly
// separate archways rather than one ambiguous opening.
export const gap = (side, half = DOOR_HALF, centre = 0) =>
  ({ side, from: centre - half, to: centre + half });

// ---------------------------------------------------------------------------
// The tint cache. Materials here outlive the room that made them, so they are
// registered SHARED — otherwise World.dispose() frees a material the next room
// is still pointing at, and the room after that renders black.
// ---------------------------------------------------------------------------
const tintCache = new Map();
// SURFACE CLASSES.
//
// A Quaternius dungeon piece is not one material. Wall_Modular alone carries
// Wall_Dark, Wall_Medium, Wall_Highlights and Grey_Floor — so eleven wall
// fragments arrive as forty-four meshes in four material buckets, and
// flattenStatic() buckets PER SPATIAL CELL as well, which splits each of those
// again. Measured on the rebuilt `la`: 309 loose meshes, 36 merged draws, and
// 107 stranded in buckets of one or two that merging will not touch.
//
// The materials are all flat colours with no map, so the only thing those four
// names carry is a VALUE step. Collapsing them to three shared classes keeps
// the light-and-shade and triples every bucket size.
const SURFACE = {
  // darkest step
  Wall_Dark: 'dark', StoneDark: 'dark', Stone_Dark: 'dark', DarkWood: 'dark',
  DarkMetal: 'dark', dirt: 'dark',
  // the body of the surface
  Wall_Medium: 'mid', Stone: 'mid', Grey_Floor: 'mid', Grey: 'mid', Main: 'mid',
  colormap: 'mid', grass: 'mid', Ceramic: 'mid', Wood: 'mid', stone: 'mid',
  stoneDark: 'dark',
  // catch the light
  Wall_Highlights: 'light', Metal: 'light',
};
// what each class does to the tint it is given
const SURFACE_VALUE = { dark: 0.66, mid: 1.0, light: 1.26 };

export function tintedModel(gltf, key, tint, darken = 1) {
  const root = prepareModel(gltf.scene.clone());
  root.traverse((n) => {
    if (!n.isMesh) return;
    // THE CACHE KEY IS THE MATERIAL'S SURFACE CLASS, NOT ITS NAME.
    //
    // It started as the caller's label, which meant a rock and a stump cut from
    // the same atlas at the same tint got two materials and could never merge.
    // Keying on the material NAME fixed that. Keying on the CLASS fixes the
    // next order of the same problem: four names that differ only in brightness
    // become one material at three values, so a house's wall fragments land in
    // one bucket instead of four.
    const tex = n.material.map ? n.material.map.uuid : 'nomap';
    const cls = SURFACE[n.material.name] || n.material.name;
    const v = SURFACE_VALUE[cls] !== undefined ? SURFACE_VALUE[cls] : 1;
    const ck = `${cls}|${tex}|${tint}|${darken}`;
    if (!tintCache.has(ck)) {
      const m = n.material.clone();
      m.name = `kit_${ck}`;
      m.color.setHex(tint).multiplyScalar(darken * v);
      SHARED.add(m);
      tintCache.set(ck, m);
    }
    n.material = tintCache.get(ck);
  });
  return root;
}

// ONE TEXTURE, MANY FILES.
//
// loadGLB caches per FILE, so a pack whose GLBs all name the same external
// atlas still ends up with one THREE.Texture per file — and tintedModel above
// keys its material cache on `map.uuid`, so N files means N materials and N
// draw calls that flattenStatic can never merge, however identical the pixels.
// Hand it the loaded gltfs of one pack and every mesh in them ends up sharing
// the first texture object, which is what makes the cache key collapse.
//
// Only ever call this on gltfs from a SINGLE pack that genuinely shares one
// atlas — it is a claim about the pixels, and pointing two different images at
// one object would repaint half of them.
export function shareTexture(gltfs) {
  let shared = null;
  for (const g of gltfs) {
    if (!g || !g.scene) continue;
    g.scene.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
        if (!m.map) continue;
        if (!shared) { shared = m.map; continue; }
        if (m.map !== shared) { m.map = shared; m.needsUpdate = true; }
      }
    });
  }
  return shared;
}

// Kit materials are named per surface — Kenney's floor-tile.glb is `grass`,
// cliff-block.glb is `grass` + `dirt`, Quaternius dungeon pieces are `Stone`,
// `StoneDark`, `Wood`. Naming every one is how a single kit becomes eight
// districts across two levels with no new downloads. A name NOT in the map
// keeps its original colour, so a miss shows up as a green patch in a cave
// rather than as a silent nothing.
export const floorTintMap = (D) => ({
  grass: D.floorTint, dirt: D.wallTint, colormap: D.floorTint,
  Stone: D.floorTint, StoneDark: D.wallTint, Stone_Dark: D.wallTint,
  Grey: D.floorTint, Main: D.floorTint,
});
export const wallTintMap = (D) => ({
  grass: D.wallTint, dirt: D.wallTint, stone: D.wallTint, stoneDark: D.wallTint,
  colormap: D.wallTint, Stone: D.wallTint, StoneDark: D.wallTint,
  Stone_Dark: D.wallTint, Grey: D.wallTint, Main: D.wallTint, Wood: D.wallTint,
});

// POTS, CRATES AND BARRELS — placed, not hand-listed.
//
// Levels 3, 5, 6 and 7 shipped with none at all: 62 of 99 rooms held nothing to
// break, and the Wild Woods sat under the shard floor because of it. Hand-
// listing coordinates for forty-odd rooms is how the last four regions came to
// have none — so this asks the room where there is space instead.
//
// Three rules, and they are the ones the suites already enforce:
//   * NOT IN THE BLIND STRIP. The camera is a fixed offset, so the 2.5u nearest
//     the south edge is behind the player on arrival. A pot a child cannot see
//     is a pot they will not break.
//   * NOT ON A KEEP-CLEAR SQUARE. blocked() is the build-time register — doors,
//     spawns, chests, shrines — and it is exactly the right question here.
//   * NOT INSIDE SOMETHING. resolveCircle is the player's own collision; a pot
//     sunk into a ruin wall reads as a bug.
//
// Count comes from the room's own floor area, so a choke gets two and an island
// gets six without anyone deciding it twice.
// SEVEN SHAPES, NOT THREE. Dad asked twice for "chests, jars, crates, barrels
// etc". Three kinds across a hundred and eight rooms is why every room read the
// same; the kit in js/loot.js has seven now and this is what spends them.
// Landing spots, keyed by the room they are IN. Filled by sideDoor as rooms
// build, and monotonic — it only ever learns more. Every room in the game is
// reached through a neighbour, so by the time a child stands in one, the door
// that put them there has been built and has declared its landing.
export const LANDINGS = {};

// Reserve this room's landings, so nothing is ever placed on the spot a door
// drops a child. Called from every level's finish().
export function reserveLandings(world, roomId) {
  for (const p of LANDINGS[roomId] || []) world.reserve(p.x, p.z, 1.9, 'landing');
}

export function potSpots(world, halfW, halfD, spec, kinds = ['crate', 'barrel', 'vase', 'jar', 'box', 'cask'], relax = {}) {
  const CLEAR = relax.clearance !== undefined ? relax.clearance : 1.4;
  // THE PAD HAS TO COVER THE POT, NOT JUST ITS CENTRE.
  //
  // 0.85 was chosen when a smashable was a knee-high crate. They are character
  // sized now — a collider around 0.85 across on its own — so a pot whose CENTRE
  // cleared the keep-clear register still had a body that reached into it. The
  // landing sweep caught it: xm1 → xm2 put a child down inside a barrel.
  //
  // The register is asked about the space the pot will actually occupy.
  const PAD = relax.pad !== undefined ? relax.pad : 1.7;
  const label = (spec && spec.label) || '';
  let s0 = 7;
  for (let i = 0; i < label.length; i++) s0 = (s0 * 31 + label.charCodeAt(i)) % 233280;
  const r = () => ((s0 = (s0 * 9301 + 49297) % 233280) / 233280);
  // Cap 4, not 6. A breakable is its own mesh and cannot be batched — it has to
  // come apart on its own — so each one is a draw call. Six put the Vale's d1b
  // at 126 against a ceiling of 125; five left it hovering on 123-126 run to
  // run, which is not a pass, it is a coin toss. Four gives it real headroom.
  const want = Math.max(2, Math.min(4, Math.round((halfW * halfD) / 34)));
  const out = [];
  // WHY a candidate was thrown out, so a room that ends up with nothing can say
  // what stopped it instead of just returning an empty array (probe-potspots).
  const why = relax.stats || { edge: 0, blind: 0, blocked: 0, inside: 0, hazard: 0, huddle: 0, penned: 0, want };
  // MOST OF THEM WHERE THE CHILD IS LOOKING. The camera is a fixed offset, so
  // "the room" on arrival is a known box: 12.9u ahead of the spawn along its own
  // heading, 4.5 behind, 22.2 wide. Scattering uniformly put none at all in the
  // Vale's d3a arrival frame — six pots nobody would ever see. Two thirds are
  // aimed into that box; the rest fill the room so it is not a shop window.
  const sp = world.spawn || { x: 0, z: 0, angle: Math.PI };
  const a = sp.angle === undefined ? Math.PI : sp.angle;
  const fx = Math.sin(a), fz = Math.cos(a), rx = fz, rz = -fx;
  const inFrame = Math.ceil(want * 0.66);
  // AND THE ARRIVAL FRAME MUST NOT EAT THE WHOLE BUDGET.
  //
  // probe-potspots asked this loop why seven rooms came out with nothing, and
  // the answer was one number: `edge` threw out between 111 and 224 candidates
  // while every other reason was in single figures.
  //
  // The frame sampler aims up to 12u ahead and 9u across, which is the right box
  // for a 32x26 island and LARGER THAN THE WHOLE ROOM in a 20x16 pocket — so
  // nearly every candidate landed outside the walls. And because nothing was
  // ever placed, `out.length < inFrame` stayed true and the uniform fallback
  // below never ran even once. The loop spent its entire budget sampling a box
  // that does not fit, then returned empty.
  //
  // The frame is a PREFERENCE, not a requirement. It gets the first third of the
  // attempts; after that the room is sampled whole.
  const FRAME_TRIES = want * 20;
  for (let t = 0; t < want * 60 && out.length < want; t++) {
    let x, z;
    if (out.length < inFrame && t < FRAME_TRIES) {
      // ...and the box is clipped to the room, so a small room samples its own
      // arrival frame rather than mostly empty space beyond its walls
      const reach = Math.max(3, Math.min(12, halfD * 1.6));
      const wide = Math.max(3, Math.min(9, halfW * 0.8));
      const ahead = -2 + r() * reach, across = (r() * 2 - 1) * wide;
      x = sp.x + fx * ahead + rx * across;
      z = sp.z + fz * ahead + rz * across;
      if (Math.abs(x) > halfW - 2.6 || Math.abs(z) > halfD - 2.6) { why.edge++; continue; }
    } else {
      x = (r() * 2 - 1) * (halfW - 2.6);
      z = (r() * 2 - 1) * (halfD - 2.6);
    }
    if (z > halfD - 3.0) { why.blind++; continue; }      // the blind strip
    if (world.blocked(x, z, PAD)) { why.blocked++; continue; }   // doors, spawns, markers
    const c = world.resolveCircle ? world.resolveCircle(x, z, 0.5) : { x, z };
    if (Math.abs(c.x - x) > 1e-6 || Math.abs(c.z - z) > 1e-6) { why.inside++; continue; }  // inside a prop
    if (world.hazardAt && world.hazardAt(x, z)) { why.hazard++; continue; }
    if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 9)) { why.huddle++; continue; }  // no huddles
    // AND IT MUST NOT PLUG A GAP. A breakable is a collider, so one dropped in
    // a corridor the width of a doorway seals it — which is how a pot came to
    // wall off the Ash Wing's way round its own gate, the same shape of bug as
    // the Kiln's forge. Open floor on all four sides or it does not go there:
    // pots belong in the middle of a room, not in a pinch point.
    let penned = false;
    for (const [ox, oz] of [[CLEAR, 0], [-CLEAR, 0], [0, CLEAR], [0, -CLEAR]]) {
      const q = world.resolveCircle ? world.resolveCircle(x + ox, z + oz, 0.4) : null;
      if (q && (Math.abs(q.x - (x + ox)) > 1e-6 || Math.abs(q.z - (z + oz)) > 1e-6)) { penned = true; break; }
    }
    if (penned) { why.penned++; continue; }
    out.push({ x: +x.toFixed(2), z: +z.toFixed(2), kind: kinds[Math.floor(r() * kinds.length)] });
  }
  // AND ROUGHLY EVERY THIRD ROOM HIDES A CHEST. Not every room — a reward you
  // are certain of is scenery. The seed comes off the room label, so a given
  // room either has one or does not, the same way every time a child plays it:
  // "the one with the chest in" is a place you can remember and go back to.
  if (out.length && r() < 0.36) {
    out[out.length - 1].kind = r() < 0.22 ? 'goldchest' : 'chest';
  }
  return out;
}

// A PLACER THAT GIVES UP SILENTLY IS HOW ROOMS END UP EMPTY.
//
// probe-emptyrooms found EIGHTEEN rooms with nothing to break in them — nine of
// them in the Shadow Court — and every one of those rooms asks for pots. The
// rules above are all individually right and together they are unsatisfiable in
// a heavily dressed room: no candidate clears a 1.4u gap on all four sides when
// two ruined homes and fourteen loose pieces are already down, so the loop runs
// out of attempts and returns an empty array. Nothing said so. The room built,
// the suites passed, and a child walked into a hall with nothing to hit.
//
// So: ask strictly first, and if the room gives back nothing, ask again with the
// elbow room reduced rather than accept nothing. A pot slightly closer to a wall
// than ideal is worth having; no pot at all is the bug.
export function potSpotsOrFewer(world, halfW, halfD, spec, kinds) {
  let out = potSpots(world, halfW, halfD, spec, kinds);
  if (out.length) return out;
  out = potSpots(world, halfW, halfD, spec, kinds, { clearance: 1.0, pad: 1.3 });
  if (out.length) return out;
  return potSpots(world, halfW, halfD, spec, kinds, { clearance: 0.75, pad: 1.0 });
}

// ---------------------------------------------------------------------------
export function makeBuilders({ kit, isGrey }) {
  const K = () => kit();
  const GREY = () => isGrey();

  // Wall segments with the door gaps cut out of them.
  const segments = (gaps, side, lo, hi) => {
    const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
    let start = lo; const out = [];
    for (const c of cuts) { if (c.from > start) out.push([start, c.from]); start = c.to; }
    if (start < hi) out.push([start, hi]);
    return out;
  };

  // --- GREYBOX shell -------------------------------------------------------
  function protoShell(world, w, d, gaps, tint) {
    const halfW = w / 2, halfD = d / 2;
    world.deckY = 0;
    // +6 in both axes: three units of ground OUTSIDE the wall, so the camera
    // never sees the void past a 1.9u wall (Level 1 shipped without this and
    // a third of the screen was empty on entry)
    protoFloor(world, w + 6, d + 6, tint);

    const H = 1.6;
    for (const [a, b] of segments(gaps, 'n', -halfW, halfW)) protoWall(world, a, -halfD - WALL_T / 2, b, -halfD + WALL_T / 2, { height: H, tint });
    for (const [a, b] of segments(gaps, 's', -halfW, halfW)) protoWall(world, a, halfD - WALL_T / 2, b, halfD + WALL_T / 2, { height: H, tint });
    for (const [a, b] of segments(gaps, 'w', -halfD, halfD)) protoWall(world, -halfW - WALL_T / 2, a, -halfW + WALL_T / 2, b, { height: H, tint });
    for (const [a, b] of segments(gaps, 'e', -halfD, halfD)) protoWall(world, halfW - WALL_T / 2, a, halfW + WALL_T / 2, b, { height: H, tint });

    // BLIND-STRIP LAW made visible: the band along the south wall the camera
    // cannot see over. Painting it means the rule gets checked by eye while
    // the space is being walked, not only by a script afterwards.
    protoDecal(world, 0, halfD - BLIND_STRIP / 2, w, BLIND_STRIP, 0xff3a3a, 0.13);
    return { halfW, halfD };
  }

  // --- DRESSED shell: same rectangle, same gaps, same colliders ------------
  function dressShell(world, w, d, gaps, D, opts = {}) {
    const halfW = w / 2, halfD = d / 2;
    world.deckY = 0;
    const kit0 = K();

    // THE FLOOR. Until v3.36 this instanced Kenney's floor-tile.glb across the
    // rectangle under one district tint — one tile, one colour, every room,
    // which is exactly what dad saw: "the floor is just a generic colour
    // everywhere". js/ground.js paints it instead: a district PATTERN, several
    // materials meeting inside the room via `patches`, and a worn path along
    // the route that replaces the guide-orbs v3.35 deleted. Still one call.
    //
    // +6 on both axes for the same reason protoFloor uses an apron: three units
    // of ground outside the wall so the camera never sees the void past it.
    const APRON = 3;
    ground(world, w + APRON * 2, d + APRON * 2, D, {
      seed: opts.seed || roomSeed(),
      style: opts.groundStyle,
      patches: opts.patches || [],
      pathWidth: opts.pathWidth,
      paths: opts.paths || pathsThroughDoors(gaps, halfW, halfD, { hub: opts.hub }),
    });

    const inGap = (side, c) => gaps.some((g) => g.side === side && c > g.from && c < g.to);
    const walls = [];
    const cell = (tx, tz, side, coord) => {
      if (inGap(side, coord)) return;
      walls.push({
        x: tx - halfW + 0.5, z: tz - halfD + 0.5,
        ry: (Math.abs(tx * 11 + tz * 5) % 4) * Math.PI / 2,
        sy: 1.9 + (Math.abs(tx * 31 + tz * 17) % 3) * 0.18,
      });
    };
    for (let tx = -1; tx <= w; tx++) { cell(tx, -1, 'n', tx - halfW + 0.5); cell(tx, d, 's', tx - halfW + 0.5); }
    for (let tz = 0; tz < d; tz++) { cell(-1, tz, 'w', tz - halfD + 0.5); cell(w, tz, 'e', tz - halfD + 0.5); }
    world.add(instancePlacements(kit0.cliff.scene, walls, { materialTints: wallTintMap(D) }));

    // colliders sit at the SAME coordinates the greybox used, so every
    // distance measured while walking the box still holds
    for (const [a, b] of segments(gaps, 'n', -halfW, halfW)) world.addBox(a, b, -halfD - WALL_T / 2, -halfD + WALL_T / 2);
    for (const [a, b] of segments(gaps, 's', -halfW, halfW)) world.addBox(a, b, halfD - WALL_T / 2, halfD + WALL_T / 2);
    for (const [a, b] of segments(gaps, 'w', -halfD, halfD)) world.addBox(-halfW - WALL_T / 2, -halfW + WALL_T / 2, a, b);
    for (const [a, b] of segments(gaps, 'e', -halfD, halfD)) world.addBox(halfW - WALL_T / 2, halfW + WALL_T / 2, a, b);

    return { halfW, halfD };
  }

  // ONE entry point, TWO costumes. A builder never decides for itself which
  // mode it is in — that is what keeps the two provably the same layout.
  // `opts` reaches the ground painter: { seed, groundStyle, patches, paths,
  // pathWidth, hub }. A room that passes nothing still gets a textured,
  // patterned floor with a worn route between its doors.
  function shell(world, spec, gaps, D, opts = {}) {
    // The room's own extent, recorded rather than computed-and-discarded.
    // Anything asking "is this point inside the room" — the reachability
    // verifier especially — had no way to know, and guessing it from door
    // positions fails for rooms whose doors are all on one axis.
    world.halfW = spec.w / 2;
    world.halfD = spec.d / 2;
    // record every water PATCH (ground-paint kind:'water' — decorative,
    // this room's own visual shape), in BOTH costumes: decoration only
    // places in dressed mode, but the shape is the same either way. NOT
    // the same thing as world.waterZones (js/water.js's real gameplay
    // deep/shallow zones, a totally different {minX,maxX,minZ,maxZ,deep}
    // shape, already consumed by player.js and boss.js) — named
    // differently on purpose after finding that out the hard way.
    world.waterPatches = (opts.patches || []).filter((p) => p.kind === 'water')
      .map((p) => ({ x: p.x, z: p.z, r: p.r }));
    return GREY()
      ? protoShell(world, spec.w, spec.d, gaps, D.tint)
      : dressShell(world, spec.w, spec.d, gaps, D, opts);
  }

  // A door on a wall side, in the gap the shell already cut.
  function sideDoor(world, side, halfW, halfD, to, entry, opts = {}) {
    // WHERE THIS DOOR PUTS YOU DOWN IS THE OTHER ROOM'S BUSINESS, AND IT HAD NO
    // WAY TO KNOW.
    //
    // The landing sweep found a jar sitting exactly on the spot xm1 → xm2 drops
    // a child. The keep-clear register never rejected it because a room's
    // `blocked()` knows its own markers and its own doorways — and the landing
    // was declared over in xm1, eight metres from any wall of xm2. The room it
    // lands in has never been told. Widening the pot's pad could not fix that,
    // and I widened it before checking, which cost a run.
    //
    // So every landing a door declares is remembered against the room it lands
    // IN, and that room reserves them when it builds (see `finish`).
    if (entry && to) {
      const list = LANDINGS[to] || (LANDINGS[to] = []);
      if (!list.some((p) => Math.hypot(p.x - entry.x, p.z - entry.z) < 0.2)) {
        list.push({ x: entry.x, z: entry.z });
      }
    }
    const T = DOOR_ZONE;
    // the mouth of the door, and room to walk out of it
    const rc = opts.centre || 0;
    // 2.0, not 2.8: the opening is 2.4u wide (DOOR_HALF 1.2), so a reservation
    // wider than that starts claiming the ground beside the door — which is
    // exactly where gateposts belong, and they were losing their colliders.
    const rtag = 'door→' + to;
    if (side === 'n') world.reserve(rc, -halfD + 1.6, 2.0, rtag);
    else if (side === 's') world.reserve(rc, halfD - 1.6, 2.0, rtag);
    else if (side === 'w') world.reserve(-halfW + 1.6, rc, 2.0, rtag);
    else if (side === 'e') world.reserve(halfW - 1.6, rc, 2.0, rtag);
    const half = opts.half || DOOR_HALF;
    const c = opts.centre || 0;          // offset ALONG the wall — see gap()
    const when = opts.when || null;
    if (side === 'n') world.addDoor(c - half, c + half, -halfD - T, -halfD + 0.15, to, entry, when);
    if (side === 's') world.addDoor(c - half, c + half, halfD - 0.15, halfD + T, to, entry, when);
    if (side === 'w') world.addDoor(-halfW - T, -halfW + 0.15, c - half, c + half, to, entry, when);
    if (side === 'e') world.addDoor(halfW - 0.15, halfW + T, c - half, c + half, to, entry, when);

    // THE NEXT ROOM'S LIGHT, SPILLING THROUGH. Collected here and built as one
    // mesh in thresholdGlow() below — see the note there for why it is one.
    const tint = districtTint(to);
    if (tint !== null) {
      (world._thresholds || (world._thresholds = [])).push({ side, c, half, halfW, halfD, tint, when });
    }
  }

  // An INTERIOR wall run — what makes a room a shape instead of a box.
  function wallRun(world, x0, z0, x1, z1, D, height = 1.6) {
    if (GREY()) return protoWall(world, x0, z0, x1, z1, { height, tint: D.tint });
    const dx = x1 - x0, dz = z1 - z0;
    const count = Math.max(1, Math.round(Math.hypot(dx, dz)));
    const places = [];
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0.5 : i / (count - 1);
      places.push({ x: x0 + dx * f, z: z0 + dz * f, ry: ((i * 3) % 4) * Math.PI / 2,
        sy: height + (i % 3) * 0.12 });
    }
    world.add(instancePlacements(K().cliff.scene, places, { materialTints: wallTintMap(D) }));
    const pad = 0.5;
    world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad,
      Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
    return null;
  }

  // Scatter along the walls: silhouette variety without eating the playfield.
  // Everything sits in the outer ring, never mid-room where the fighting is,
  // and never in a doorway.
  //
  // `density` and `spin` exist because players notice repeated CLUTTER long
  // before they notice repeated architecture — two spokes built from the same
  // modules read as different places if their small stuff differs hardest.
  function scatter(world, halfW, halfD, D, seed = 1, count = 14, opts = {}) {
    if (GREY()) return;
    const kinds = opts.kinds || ['rockLA', 'rockLB', 'rockLC', 'rockSA', 'rockSB'];
    const spin = opts.spin !== undefined ? opts.spin : 1;      // 0 = grid-aligned, 1 = free
    const scale = opts.scale || 1;
    const kit0 = K();
    let s = seed * 9301;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < count; i++) {
      const edge = i % 4;
      const along = (rnd() - 0.5) * 2;
      const inset = 1.2 + rnd() * 2.6;
      let x, z;
      if (edge === 0) { x = along * (halfW - 2); z = -halfD + inset; }
      else if (edge === 1) { x = along * (halfW - 2); z = halfD - inset; }
      else if (edge === 2) { x = -halfW + inset; z = along * (halfD - 2); }
      else { x = halfW - inset; z = along * (halfD - 2); }
      if (Math.abs(x) < DOOR_HALF + 1.2 && edge < 2) continue;
      if (Math.abs(z) < DOOR_HALF + 1.2 && edge >= 2) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      if (!kit0[kind]) continue;
      // scatter() picks its spots at random, which makes it the likeliest thing
      // in the whole toolkit to drop a rock on a chest's only approach
      if (world.blocked(x, z, 0.9)) continue;
      const big = /rockL|Column|Brick/.test(kind);
      // SHADE IN THREE STEPS, NOT CONTINUOUSLY. A per-prop random float gave
      // every rock its own material and so its own draw call — twenty props
      // meant forty calls with shadows. Three discrete shades read the same to
      // the eye and merge into three draws. Variety comes from rotation and
      // scale below, which are free.
      const shade = [0.88, 1.0, 1.1][Math.floor(rnd() * 3)];
      const rock = tintedModel(kit0[kind], kind, D.wallTint, shade);
      rock.position.set(x, 0, z);
      // spin 0 snaps to quarter turns (fitted masonry); spin 1 is free
      rock.rotation.y = spin ? rnd() * Math.PI * 2 : Math.floor(rnd() * 4) * Math.PI / 2;
      rock.scale.setScalar((big ? 0.8 + rnd() * 0.5 : 0.6 + rnd() * 0.4) * scale);
      world.add(rock);
      if (big) world.addCircle(x, z, 0.75 * scale, 'decor');
    }
  }

  // A "come back later" gate. It must read as LATER, never as broken: a
  // shaped, coloured obstacle with the reward VISIBLE beyond it.
  //
  // A8 — AND IT MUST ACTUALLY OPEN. Until v3.27 this function drew the gate,
  // dropped a box collider in front of it and stopped. It registered with no
  // gate system at all, so Level 1's cracked wall, Level 1's scorched
  // barricade, Level 2's thorn tangle and Level 3's ice-sealed spring were
  // permanent walls with a visible chest behind them. The promise was a lie:
  // a child who came back with the very form the gate advertises found the
  // stomp, the slam, the lash and the breath all did nothing.
  //
  // `gate` is now REQUIRED and says which tool opens it:
  //   {system: 'crack'|'burn'|'cut'|'shatter', id, region}
  // Each system is the SAME one the shipping rooms use, so a promise gate
  // breaks with the same verb, the same feel and the same permanence as every
  // other obstacle of its kind — no second, subtly-different code path.
  function promiseGate(world, x, z, w, d, color, label, kindModel, gate) {
    if (!gate || !gate.system) throw new Error('promiseGate needs a gate system — see A8');
    const { system, id, region } = gate;
    // Already opened on an earlier visit? Then there is nothing here at all —
    // no geometry, and crucially no collider.
    const opened =
      system === 'crack'   ? !!state.flags.cracked[id]
      : system === 'burn'  ? !!state.flags.burned[id]
      : system === 'cut'   ? alreadyCut(region, id)
      : /* shatter */        WS.get(region, 'ice_' + id);
    if (opened) return null;

    // The gate and the ground immediately behind it belong to the gate: the
    // whole promise is that THIS is the way through, and a prop dressed into
    // the gap turns a solved puzzle into a locked door.
    world.reserve(x, z, Math.max(w, d) * 0.6 + 1.4, 'gate:' + id);
    // The group is positioned at the gate and its pieces sit RELATIVE to it,
    // so when a crack or a burn scatters the chunks they fly apart from the
    // gate rather than from the room's origin.
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const span = Math.max(w, d);
    if (GREY()) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.5, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: color, emissiveIntensity: 0.18 })
      );
      m.position.set(0, 0.75, 0);
      g.add(m);
      protoLabel(world, x, z, label, { color: '#ffd54a', y: 2.4, size: 1.2 });
    } else {
      const kit0 = K();
      const src = kit0[kindModel] || kit0.rockLB;
      const n = Math.max(2, Math.round(span / 1.6));
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : (i / (n - 1) - 0.5);
        const piece = tintedModel(src, 'gate_' + kindModel, color);
        piece.position.set(w > d ? f * w : 0, 0, d >= w ? f * d : 0);
        piece.rotation.y = i * 1.31;
        piece.scale.setScalar(1.05);
        g.add(piece);
      }
      // the "later" tell: a cold glow in the future tool's own colour, at ankle
      // height, so it reads as a promise rather than as a wall
      const hint = new THREE.Mesh(
        new THREE.RingGeometry(span * 0.42, span * 0.55, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32,
          side: THREE.DoubleSide, depthWrite: false })
      );
      hint.rotation.x = -Math.PI / 2;
      hint.position.set(0, world.deckY + 0.04, 0);
      g.add(hint);
    }
    world.add(g);

    // EVERY GATE SIGNS THE REGISTER. tools/verify-promises.mjs drives each one
    // with the real verb, and its table is hand-kept BY NECESSITY — the
    // approach geometry (where a child stands, which way they face to swing)
    // is nowhere in the game data. Its own header already admitted the list
    // had rotted once ("Ember Deep's burn nooks are still missing from it").
    // A list that cannot be derived can still be CHECKED: this is the roll
    // call, so a gate that ships without a test says so out loud.
    (world.promiseGates || (world.promiseGates = [])).push({ id, system, x, z, w, d, label });
    // A gate across a doorway blocks with a BOX, not the circle a rock clump
    // uses, so it hands its own collider-removal to whichever system takes it.
    const collider = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    world.boxColliders.push(collider);
    const dropCollider = () => {
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
    };

    if (system === 'cut') {
      // the lash owns the whole clear (group + collider + flag + sound)
      registerCuttable(world, { id, x, z, region, group: g, collider, hitR: span / 2 });
    } else if (system === 'shatter') {
      world.shatterables.push({
        id, x, z, broken: false, hitR: span / 2, group: g,
        clear: () => {
          world.root.remove(g);
          dropCollider();
          WS.set(region, 'ice_' + id);
          audio.play('parry', { volume: 0.7, rate: 1.8 });   // the crack
          audio.play('puff', { volume: 0.8, rate: 1.3 });
        },
      });
    } else if (system === 'none') {
      // A gate that no VERB opens. The Stormreach sea cave is one: it is water,
      // and water opens by being walkable — the room simply does not build this
      // at all once the child can wade (js/water.js). Registering it as a
      // crackable or a shatterable would have handed it to the wrong wolf.
    } else {
      // crack + burn ride World._shatter, which does the break-apart itself
      // and writes the permanent flag; `clear` only takes the box away.
      const list = system === 'crack' ? world.crackables : world.burnables;
      list.push({ id, x, z, group: g, collider: null, hitR: span / 2, clear: dropCollider });
    }
    return g;
  }

  // THE WAY ON, PLUGGED UNTIL THE BOSS FALLS — and opened WHERE YOU STAND.
  //
  // Dad: "is it possible that at the end of the boss fight the door to the
  // next level opens without having to walk out the room and back again?
  // could we do a smoke poof animation and have it appear?"
  //
  // The old shape was rebuild-gated: the arena's onward gap and door only
  // existed if the defeated flag was set when the room BUILT, so the child
  // who had just won was standing in a room whose reward hadn't arrived —
  // they had to leave and come back to fetch it. Now the gap is always cut,
  // this plug of region rocks fills it while the boss lives, and beating the
  // boss removes plug + collider and adds the door trigger IN the live room
  // (main.js does the smoke poof and the thump — juice/audio live there).
  //
  // Geometry notes: keepLoose is load-bearing — flattenStatic would fold the
  // rocks into the static batches and removing the group would leave their
  // picture behind. The door trigger is only added at open time, so the
  // door-suites (openholes, gauntlet, reachable) see either "no door" or
  // "open door", never "a door that fires into a wall". A live-added door
  // misses finish()'s threshold-glow fan; the poof carries the announcement.
  function onwardPlug(world, x, z, w, d, kindModel, tint, addTheDoor) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const span = Math.max(w, d);
    if (GREY()) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.5, d),
        new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9 })
      );
      m.position.set(0, 0.75, 0);
      g.add(m);
    } else {
      const kit0 = K();
      const src = kit0[kindModel] || kit0.rockLB;
      const n = Math.max(2, Math.round(span / 1.4));
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : (i / (n - 1) - 0.5);
        const piece = tintedModel(src, 'onward_' + kindModel, tint);
        piece.position.set(w > d ? f * w : 0, 0, d >= w ? f * d : 0);
        piece.rotation.y = i * 1.31;
        piece.scale.setScalar(1.15);
        g.add(piece);
      }
    }
    world.add(g);
    world.keepLoose(g);
    world.reserve(x, z, span * 0.6 + 1.4, 'onward');
    const collider = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    world.boxColliders.push(collider);
    world.onwardSpot = { x, z, w: Math.max(w, 2.6), d: Math.max(d, 1.6) };
    // TWO PLUGS, ONE OPENING. Ember's arena has TWO ways out that the
    // Shadowgrip holds shut — the road on, and the walked loop-back home — and
    // a second call used to overwrite the first, so one of them stayed a rock
    // pile forever. Each plug keeps whatever was already registered and calls
    // it after its own, so a room may carry as many as it likes. `onwardSpot`
    // is the LAST one registered, which is where main.js puffs the smoke:
    // register the loop-back first and the way on second, so the smoke lands
    // on the door that matters.
    const alsoOpen = world.openOnward;
    world.openOnward = () => {
      world.root.remove(g);
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      addTheDoor();
      world.openOnward = null;
      if (alsoOpen) alsoOpen();
    };
  }

  // The reward you can SEE but not reach yet — the other half of a promise.
  function visibleReward(world, x, z, id, loot = { shards: 14 }, tier = 'wood') {
    if (GREY()) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.7, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0xffd54a, emissiveIntensity: 0.5, roughness: 0.7 })
      );
      m.position.set(x, 0.35, z);
      world.add(m);
      return m;
    }
    (world.markers.chestDefs || (world.markers.chestDefs = []))
      .push({ id, tier, x, z, ry: 0.4, loot });
    // A CHEST OWNS ITS APPROACH. vc2 shipped with the thorn gate cut, the
    // puzzle solved, and the reward still 2.06u out of reach because a rock
    // had been scattered into the alcove afterwards. 2.6u is enough for a
    // child to walk up from any side.
    world.reserve(x, z, 2.6, 'chest:' + id);
    return null;
  }

  // A dark zone. main.js writes `zone.veilMat.opacity` every frame, so the
  // material is not optional — a zone without one crashes the render loop.
  function darkZone(world, minX, maxX, minZ, maxZ) {
    const veilMat = new THREE.MeshBasicMaterial({
      color: 0x0a0714, transparent: true, opacity: 0.62, depthWrite: false,
    });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), veilMat);
    veil.rotation.x = -Math.PI / 2;
    veil.position.set((minX + maxX) / 2, 1.65, (minZ + maxZ) / 2);
    world.add(veil);
    world.darkZones.push({ minX, maxX, minZ, maxZ, veilMat });
  }

  // A HOLE IN THE FLOOR. Registers the fall zone and drops a black quad into
  // the floor so it READS as a hole rather than as a differently-coloured tile
  // — in a dark room the child needs the shape of the gap, and the Dark Wolf's
  // sight is what turns that shape from a guess into a route. The rim is a
  // separate ring so the edge stays visible when the veil is at its darkest.
  // A HOLE IN THE FLOOR, AND NOT A SHAPE DRAWN ON IT.
  //
  // Dad, from play: "keep the pitfalls but remove the grey geometric marks on
  // them." He was looking at a four-segment RingGeometry rotated forty-five
  // degrees — a grey diamond outline painted around every pit in the game. It
  // was there for a real reason (the note it replaces: "a pale lip so the edge
  // is findable: this is the thing the Dark Wolf sees") and it looked like a
  // debug gizmo somebody forgot to take out.
  //
  // The edge still has to be findable, so the cue moved INTO the hole: one
  // plane carrying a soft radial falloff with a crumbled, uneven lip, so the
  // washout fades from black at its centre to nothing at its rim the way a
  // real hole does. It is also one draw call FEWER than the hole-plus-ring it
  // replaces.
  function pit(world, minX, maxX, minZ, maxZ) {
    world.pitZones.push({ minX, maxX, minZ, maxZ });
    if (isGrey()) return;
    const w = maxX - minX, d = maxZ - minZ;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const hole = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.18, d * 1.18),   // the fade needs room outside the fall line
      new THREE.MeshBasicMaterial({ map: pitTexture(), transparent: true,
        depthWrite: false, color: 0xffffff })
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(cx, (world.deckY || 0) + 0.05, cz);
    world.add(hole);
  }

  return { protoShell, dressShell, shell, sideDoor, wallRun, scatter,
    promiseGate, onwardPlug, visibleReward, darkZone, pit, protoMaterial };
}

// ---------------------------------------------------------------------------
// THE THRESHOLD GLOW
//
// A district's colour temperature is the game's wayfinding — a child recalls
// "the orange bit" long before they could read a map. But you only see a
// district once you are standing in it, so the colour says where you ARE and
// never where you are GOING, and a doorway that shows you nothing gives you no
// reason to walk through it. Terranigma and Zelda pull you forward because you
// can SEE the next thing and want it.
//
// So each doorway spills a little of the next room's colour across the floor in
// front of it. It costs no new geometry and reads instantly: warm light through
// that arch means the Kiln is that way.
//
// ONE MESH FOR THE WHOLE ROOM. A separate quad per door would be five extra
// draw calls in the Great Vault, which sits at 110 of a 125 budget — so every
// doorway's fan goes into a single geometry and the destination colour rides on
// the VERTICES. One material, one call, however many doors a room has.
//
// Additive and depth-write-off so it reads as light lying on the ground rather
// than as paint. flattenStatic already skips transparent MeshBasicMaterial, so
// it is left alone by the batcher without needing to be marked.
// ---------------------------------------------------------------------------
// THE WASHOUT'S OWN TEXTURE — one canvas, cached for the session, shared by
// every pit in the game. Black in the middle, a crumbled rock lip, and a soft
// alpha falloff to nothing at the edge: the hole reads as depth instead of as
// a rectangle of paint, and the lip is still the bright thing the Dark Wolf
// picks out in the dark.
let pitTex = null;
function pitTexture() {
  if (pitTex) return pitTex;
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (x / (N - 1)) * 2 - 1, ny = (y / (N - 1)) * 2 - 1;
      // a rounded-rectangle distance rather than a circle, so a long thin
      // washout still reads as a hole and not as a lens
      const r = Math.max(Math.abs(nx), Math.abs(ny)) * 0.55 + Math.hypot(nx, ny) * 0.45;
      // crumble the edge: a cheap two-octave wobble keyed off the angle, so no
      // two pits in a room show the same outline
      const a = Math.atan2(ny, nx);
      const wob = Math.sin(a * 7) * 0.035 + Math.sin(a * 13 + 1.7) * 0.022;
      const e = r + wob;
      let alpha, lum;
      if (e < 0.62) { alpha = 1; lum = 8; }                      // the dark
      else if (e < 0.78) {                                        // the lip
        const f = (e - 0.62) / 0.16;
        alpha = 1; lum = 8 + f * 78;                              // stone catching light
      } else if (e < 0.98) {                                      // the fade
        const f = (e - 0.78) / 0.20;
        alpha = 1 - f; lum = 86 - f * 30;
      } else { alpha = 0; lum = 0; }
      const i = (y * N + x) * 4;
      img.data[i] = lum * 0.86; img.data[i + 1] = lum * 0.82; img.data[i + 2] = lum;
      img.data[i + 3] = Math.round(alpha * 255);
    }
  }
  g.putImageData(img, 0, 0);
  pitTex = new THREE.CanvasTexture(cv);
  pitTex.colorSpace = THREE.SRGBColorSpace;
  SHARED.add(pitTex);   // session-shared: a room teardown must never free it
  return pitTex;
}

let glowTex = null;
function thresholdTexture() {
  if (glowTex) return glowTex;
  const N = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / (N - 1), v = y / (N - 1);
      // v: 0 at the doorway, 1 deep into the room. u: 0..1 across the opening.
      const along = Math.pow(1 - v, 1.9);            // falls off fast, like light
      const across = Math.pow(Math.cos((u - 0.5) * Math.PI), 1.4);
      const a = Math.max(0, Math.min(1, along * across));
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  SHARED.add(glowTex);
  return glowTex;
}

// A SPIRIT SHRINE YOU CANNOT WALK PAST WITHOUT SEEING.
//
// Dad, from play: "rocks everywhere nothing to do throught the level... there
// is not boss fight." Stoneroot's whole region hangs off one grant — Petra's
// spark in va3 — and until that grant lands the hub has a single spoke and the
// crypt does not exist. So the level was one missed pedestal away from being an
// endless loop, and the pedestal was a GREY STONE LUMP AGAINST A GREY STONE
// WALL, unlit, in a cave. Every suite passed. Nothing in the room said "here".
//
// Ember Hollow got this right by accident: its shrine sits behind a lit brazier
// and you cannot miss a fire. This is that, made deliberate and shared, so the
// Wild Woods' shrine and every spirit after it reads the same way:
//
//   * a heart of light floating over the stone, turning, bobbing;
//   * the brightest lamp in the room, so a dark cave points at it;
//   * a column of light standing straight up out of it — visible from a doorway
//     across a thirty-metre cavern, which a 2-metre pedestal is not;
//   * a ring on the floor saying where to stand.
//
// It is drawn from primitives on purpose. This is LIGHT, not a creature, and
// the no-code-built-creatures law is about creatures.
export function spiritShrine(world, x, z, colour = 0xd8b06a, top = 1.35) {
  const deck = world.deckY || 0;

  // THE HEART. Big enough to read as a THING from across a room, not a spark.
  const heart = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 1),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: colour,
      emissiveIntensity: 4.2, roughness: 1 })
  );
  heart.position.set(x, top + 0.7, z);
  world.add(heart);
  world.keepLoose(heart);

  // A HALO around it, tilted, turning the other way — the thing that makes a
  // glowing rock look built rather than dropped.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.055, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: colour,
      emissiveIntensity: 3.0, roughness: 1 })
  );
  halo.position.set(x, top + 0.7, z);
  halo.rotation.x = 1.15;
  world.add(halo);
  world.keepLoose(halo);

  // the column: a tall cone of light, drawn from inside so it never occludes
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 2.0, 15, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.26,
      depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.set(x, top + 6.0, z);
  world.add(beam);
  world.keepLoose(beam);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 3.1, 40),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.46,
      depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, deck + 0.05, z);
  world.add(ring);
  world.keepLoose(ring);

  // MOTES rising out of it. One instanced mesh, so the whole flourish is a
  // single draw call — a shrine should not cost a room its budget.
  const N = 18;
  const motes = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.075, 6, 5),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9,
      depthWrite: false }),
    N
  );
  const dm = new THREE.Object3D();
  world.add(motes);
  world.keepLoose(motes);

  const lamp = new THREE.PointLight(colour, 46, 34, 1.5);
  lamp.position.set(x, top + 1.2, z);
  world.add(lamp);

  world.onAnimate((t) => {
    heart.position.y = top + 0.7 + Math.sin(t * 1.5) * 0.18;
    heart.rotation.y = t * 0.6;
    halo.position.y = heart.position.y;
    halo.rotation.y = -t * 0.85;
    halo.rotation.z = Math.sin(t * 0.4) * 0.25;
    const p = 0.86 + Math.sin(t * 2.2) * 0.14;
    lamp.intensity = 46 * p;
    beam.material.opacity = 0.26 * p;
    ring.material.opacity = 0.46 * p;
    for (let i = 0; i < N; i++) {
      const a = i * 2.39 + t * 0.5;
      const climb = (t * 0.55 + i / N) % 1;             // 0..1, each on its own phase
      const rr = 1.5 * (1 - climb * 0.75);
      dm.position.set(x + Math.cos(a) * rr, deck + 0.15 + climb * 4.4, z + Math.sin(a) * rr);
      dm.scale.setScalar(1 - climb * 0.7);
      dm.updateMatrix();
      motes.setMatrixAt(i, dm.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
  });
  return heart;
}

// THE BOSS GATE.
//
// Dad: "keep boss doors. make them a intimadatingly big door that opens up
// infront of the user when they unlock it. make the inside of the doorway look
// like smoke haze or a portal the player enters into the boss arena."
//
// The rebuilt regions had no boss door at all — the way into every arena was an
// ordinary 2.4u gap in a wall with a narration marker beside it, identical to
// the doorway into a store cupboard. The one room in a region a child should
// hesitate outside of looked exactly like the fourteen they had already walked
// through without thinking.
//
// So: two leaves nearly twice Kael's height, a heavy lintel across the top, a
// pillar either side, and a portal standing in the gap. Shut, the leaves meet in
// the middle and a collider says no. Open, they swing back over about a second —
// IN FRONT OF THE CHILD if they are standing there when it unlocks, which is the
// whole point of a ceremony — and the haze behind them is the thing you step
// into.
//
// `facing` is the direction you walk THROUGH the gate, in radians about Y.
export function bossGate(world, x, z, facing, gltf, tint, opts = {}) {
  const H = opts.height || 3.4;          // Kael is 1.9; this looms
  const halfGap = opts.halfGap || 1.3;   // BOSS_DOOR_HALF
  const open0 = !!opts.open;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  world.add(g);
  world.keepLoose(g);

  const stone = (w, h, d, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9 }));
    m.position.set(px, py, pz);
    m.castShadow = false;
    g.add(m);
    return m;
  };
  // frame: a pillar each side and a lintel over the top
  stone(0.7, H + 0.5, 0.9, -(halfGap + 0.35), (H + 0.5) / 2, 0);
  stone(0.7, H + 0.5, 0.9, halfGap + 0.35, (H + 0.5) / 2, 0);
  stone(halfGap * 2 + 1.9, 0.8, 1.1, 0, H + 0.75, 0);

  // THE PORTAL. Two layers drifting opposite ways at different speeds, which is
  // what stops a flat translucent quad reading as a pane of glass.
  const haze = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(halfGap * 2, H),
      new THREE.MeshBasicMaterial({ color: opts.portal || 0x9a6cff, transparent: true,
        opacity: 0.30, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.set(0, H / 2, i ? 0.06 : -0.06);
    g.add(m);
    haze.push(m);
  }

  // the leaves, hinged at the pillars
  const leaves = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * halfGap, 0, 0);
    g.add(hinge);
    let leaf;
    if (gltf) {
      leaf = tintedModel(gltf, 'bossleaf', tint, 0.8);
      // measured, then scaled — the arch models are ~3.2u tall in their own
      // units and none of them agree with each other
      const bb = new THREE.Box3().setFromObject(leaf);
      const s = H / Math.max(0.01, bb.max.y - bb.min.y);
      leaf.scale.set(s * (halfGap / 1.3), s, s);
      leaf.position.set(-side * halfGap * 0.5, 0, 0);
    } else {
      leaf = new THREE.Mesh(new THREE.BoxGeometry(halfGap, H, 0.34),
        new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85 }));
      leaf.position.set(-side * halfGap * 0.5, H / 2, 0);
    }
    hinge.add(leaf);
    leaves.push({ hinge, side });
  }

  // shut, the gate is a wall
  const blocker = { minX: x - halfGap - 0.2, maxX: x + halfGap + 0.2,
    minZ: z - 0.5, maxZ: z + 0.5 };
  if (Math.abs(Math.sin(facing)) > 0.5) {          // gate runs along Z
    blocker.minX = x - 0.5; blocker.maxX = x + 0.5;
    blocker.minZ = z - halfGap - 0.2; blocker.maxZ = z + halfGap + 0.2;
  }
  let shut = !open0;
  if (shut) world.boxColliders.push(blocker);

  let swing = open0 ? 1 : 0;                        // 0 shut, 1 wide
  world.onAnimate((t, dt) => {
    if (!shut && swing < 1) swing = Math.min(1, swing + dt * 0.9);
    const a = swing * 1.95;                         // ~112 degrees
    for (const l of leaves) l.hinge.rotation.y = -l.side * a;
    for (let i = 0; i < haze.length; i++) {
      const m = haze[i];
      m.material.opacity = (0.16 + 0.14 * Math.sin(t * (1.3 + i * 0.7) + i)) * swing;
      m.position.y = H / 2 + Math.sin(t * (0.6 + i * 0.4)) * 0.08;
    }
  });

  // Called the moment the region says the way is earned. The leaves move while
  // the child watches, which is the difference between a door opening and a
  // door having been open.
  world.openBossDoor = () => {
    if (!shut) return;
    shut = false;
    const i = world.boxColliders.indexOf(blocker);
    if (i >= 0) world.boxColliders.splice(i, 1);
    audio.play('checkpoint', { volume: 1, rate: 0.75 });
  };
  world.markers.bossGateSpot = { x, z };
  return g;
}

export function thresholdGlow(world) {
  const list = world._thresholds;
  if (!list || !list.length) return null;
  const pos = [], uv = [], col = [], idx = [];
  const c3 = new THREE.Color();
  let n = 0;
  for (const t of list) {
    if (t.when && !t.when()) continue;         // a sealed door glows for nothing
    const w = t.half + 1.1;                    // a touch wider than the opening
    // 3.4, not 5.0. At five units the fan from lb's south door washed most of
    // the lower frame and read as a stain rather than as light through a
    // doorway. It only has to be seen from across the room, not light it.
    const D = 3.4;
    // origin on the wall, and the direction pointing INTO this room
    let ox, oz, fx, fz;
    if (t.side === 'n') { ox = t.c; oz = -t.halfD; fx = 0; fz = 1; }
    else if (t.side === 's') { ox = t.c; oz = t.halfD; fx = 0; fz = -1; }
    else if (t.side === 'w') { ox = -t.halfW; oz = t.c; fx = 1; fz = 0; }
    else { ox = t.halfW; oz = t.c; fx = -1; fz = 0; }
    const rx = fz, rz = -fx;                   // across the opening
    // SATURATE THE TINT before it becomes light. Several districts are close to
    // neutral (the Ashfall is a grey), and neutral light added to an orange
    // floor is invisible — the first version of this was so subtle I mistook a
    // painted ash patch for it. Pushing the hue keeps the wayfinding readable
    // without making the room look lit by a disco.
    c3.setHex(t.tint);
    const hsl = { h: 0, s: 0, l: 0 };
    c3.getHSL(hsl);
    c3.setHSL(hsl.h, Math.max(hsl.s, 0.40), Math.max(0.42, hsl.l));

    // `k` scales this quad's share of the light. The spill on the FLOOR is a
    // fraction of what stands in the opening: light falls off, and a floor fan
    // as bright as the doorway reads as a glowing portal rather than as a lit
    // room beyond a dark wall.
    const quad = (fn, k = 1) => {
      const base = n * 4;
      for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const [px, py, pz] = fn(du, dv);
        pos.push(px, py, pz);
        uv.push(du, dv);
        col.push(c3.r * k, c3.g * k, c3.b * k);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      n++;
    };

    // 1. the fan of light lying on the floor in front of the opening
    quad((du, dv) => {
      const across = (du - 0.5) * 2 * w, into = dv * D;
      return [ox + rx * across + fx * into, 0, oz + rz * across + fz * into];
    }, 0.42);
    // 2. THE OPENING ITSELF, standing upright in the gap. This is the image
    //    that actually reads: a lit doorway in a dark wall, seen from across
    //    the room. The floor fan alone was almost invisible against a bright
    //    floor, because additive light on a lit surface has little to add — but
    //    the wall beside it is nearly black, and against that it sings.
    quad((du, dv) => {
      const across = (du - 0.5) * 2 * (t.half + 0.15);
      return [ox + rx * across + fx * 0.25, 1.85 * dv, oz + rz * across + fz * 0.25];
    });
  }
  if (!n) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: thresholdTexture(), transparent: true, vertexColors: true, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
  }));
  mesh.position.y = (world.deckY || 0) + 0.03;   // above the ground, below decals
  mesh.renderOrder = 2;
  mesh.name = 'thresholdGlow';
  world.add(mesh);
  world.keepLoose(mesh);
  return mesh;
}
