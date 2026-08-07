// LEVEL 1 — EMBER HOLLOW, rebuilt to design/LEVEL-MAP.md (2026-08-07).
//
// Topology: wide-linear "string of pearls" — five open islands joined by four
// chokepoints, with five optional pockets that all loop back onto the spine.
//
// BUILD ORDER LAW (dad): greybox before art, without exception. Every space
// here is described ONCE, as data, and rendered either as greybox (checkered
// proto geometry) or dressed (art from GREEN-bucket packs) depending on
// `state.settings.greybox`. One description, two costumes — so the greybox
// that gets walked and approved is provably the same layout that ships.
//
// Sizes come from design/METRICS.md and are NOT free parameters:
//   island 32x26  — two camera-widths across (16.1u visible), so it cannot be
//                   seen all at once; ~7s to cross, the minimum that holds an
//                   approach, an encounter and a recovery
//   choke  14x10  — smaller than one screen ON PURPOSE, so it reads as
//                   compression against the islands
//   pocket 20x16  — about one screen: a reward should be legible at a glance
//   arena  26x26  — the Shadowgrip's charge runs ~8u and needs dodging room
// Everything snaps to the 1.0u grid. No existing space was rescaled.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoFloor, protoWall, protoDecal, protoLabel, protoMaterial } from './proto.js';
import { loadGLB, prepareModel, instancePlacements, SHARED } from './assets.js';
import { flattenStatic } from './batch.js';
import { brazier } from './gates.js';

// Greybox is the default until dressed — and is FORCED in two cases that are
// not a preference: the metrics zoo exists to measure, never to look nice, and
// a room whose art kit was never loaded has no art costume to wear (asking for
// one would throw on the first emberKit lookup).
let forceGrey = false;
const GREY = () => forceGrey || !emberKit || state.settings.greybox !== false;

// ---------------------------------------------------------------------------
// DISTRICTS — colour, floor and hero prop. The palette IS the navigation
// (design/LEVEL-MAP.md): children recall "the orange bit" long before they
// could read a map, so the tint is carried into the greybox rather than being
// added with the art. The arc warms grey → orange → red → gold going in, then
// turns cold violet at the boss.
// ---------------------------------------------------------------------------
// `tint` is the greybox display colour (bright, so the checker stays legible).
// `floorTint`/`wallTint` are the DRESSED colours applied to the Kenney kit —
// darker, because a lit texture reads several stops lighter than a flat swatch.
// The wall tints are deliberately about HALF the luminance of their floor.
// The first dressed pass used near-identical values and the Kiln read as one
// flat brown field with no depth at all — from a 50-degree camera the only
// thing separating a wall from the ground it stands on is its value.
export const DISTRICTS = {
  ashfall:  { tint: 0x8d8b86, floorTint: 0x8b8580, wallTint: 0x3b3835,
              name: 'THE ASHFALL',         hero: 'THE FALLEN GATE' },
  causeway: { tint: 0xb5702f, floorTint: 0xa2632f, wallTint: 0x40241a,
              name: 'EMBER CAUSEWAY',      hero: 'THE KILN' },
  bridges:  { tint: 0x9c3a2a, floorTint: 0x8a4436, wallTint: 0x33191a,
              name: 'CINDER BRIDGES',      hero: 'THE BROKEN SPAN' },
  kiln:     { tint: 0xc99a3a, floorTint: 0xb98d3c, wallTint: 0x453317,
              name: 'THE KILN',            hero: 'THE FORGE HEART' },
  heart:    { tint: 0x6a5a8a, floorTint: 0x5d5078, wallTint: 0x241d33,
              name: 'HEART OF THE HOLLOW', hero: "CINDER'S CAGE" },
};

// ---------------------------------------------------------------------------
// THE LEVEL, as data. `spine: true` marks the guaranteed critical path.
// Every non-spine space declares the space it loops back to — the no-dead-ends
// rule is therefore checkable by reading this table, not by walking the level.
// ---------------------------------------------------------------------------
export const L1 = {
  la:  { kind: 'island', w: 32, d: 26, district: 'ashfall',  spine: true,
         label: 'A · THE ASHFALL', beat: 'arrival · first Shades' },
  la1: { kind: 'pocket', w: 20, d: 16, district: 'ashfall',  loopsTo: 'la',
         label: 'Ash Warrens', beat: 'optional · maze + secret' },
  lg1: { kind: 'choke',  w: 14, d: 10, district: 'ashfall',  spine: true,
         label: 'THE FALLEN GATE', beat: 'REST · compression' },
  lb:  { kind: 'island', w: 32, d: 26, district: 'causeway', spine: true,
         label: 'B · EMBER CAUSEWAY', beat: 'moths · geysers' },
  lb1: { kind: 'pocket', w: 20, d: 16, district: 'causeway', loopsTo: 'lb',
         label: 'Moth Hollow', beat: 'optional · pup #1' },
  lb2: { kind: 'pocket', w: 20, d: 16, district: 'causeway', loopsTo: 'lb',
         label: 'Scorched Cubby', beat: 'optional · pup #3 · FIRE GATE' },
  lg2: { kind: 'choke',  w: 14, d: 10, district: 'causeway', spine: true,
         label: 'THE NARROWS', beat: 'REST' },
  lc:  { kind: 'island', w: 32, d: 26, district: 'bridges',  spine: true,
         label: 'C · CINDER BRIDGES', beat: 'lava slabs · Elder Hound' },
  lc1: { kind: 'pocket', w: 20, d: 16, district: 'bridges',  loopsTo: 'lc',
         label: 'The Drowned Forge', beat: 'optional · chest' },
  lg3: { kind: 'choke',  w: 14, d: 10, district: 'bridges',  spine: true,
         label: 'THE EMBER SEAL', beat: 'REST · key gate' },
  ld:  { kind: 'island', w: 32, d: 26, district: 'kiln',     spine: true,
         label: 'D · THE KILN', beat: 'SHRINE → FIRE WOLF · gutter run' },
  ld1: { kind: 'pocket', w: 20, d: 16, district: 'kiln',     loopsTo: 'ld',
         label: 'THE ORDER HALL', beat: 'THE PUZZLE ROOM · the twist' },
  lg4: { kind: 'choke',  w: 14, d: 10, district: 'kiln',     spine: true,
         label: 'THE BOSS DOOR', beat: 'REST · flame + potion' },
  le:  { kind: 'arena',  w: 26, d: 26, district: 'heart',    spine: true,
         label: 'E · HEART OF THE HOLLOW', beat: 'THE SHADOWGRIP' },
};

// The spine, in order. Written down so it can be asserted, not just believed.
export const SPINE = ['la', 'lg1', 'lb', 'lg2', 'lc', 'lg3', 'ld', 'lg4', 'le'];

// The four-step ability teach, in the order it must be encountered.
export const TEACH = [
  { step: 'introduce', room: 'ld',  what: 'one cold brazier, no enemies, no timer' },
  { step: 'develop',   room: 'ld',  what: 'the Gutter Run — three braziers, the flame creeps back' },
  { step: 'twist',     room: 'ld1', what: 'THE ORDER HALL — the order is only readable as the Dark Wolf' },
  { step: 'conclude',  room: 'le',  what: 'slam the cage-braziers in the boss collapse windows' },
];

// ---------------------------------------------------------------------------
// THE EMBER KIT — the art costume. Every file below is covered by a verified
// CC0 licence in assets/LICENSES/MANIFEST.json (Kenney Nature Kit 2.1, Kenney
// Castle Kit 2.0, Quaternius LowPoly Modular Dungeon), i.e. GREEN bucket only.
// Nothing here comes from an UNKNOWN pack.
// ---------------------------------------------------------------------------
let emberKit = null;
export async function loadEmberKit() {
  if (emberKit) return emberKit;
  const names = {
    floor:   './assets/env/floor-tile.glb',      // Kenney Nature  🟢
    cliff:   './assets/env/cliff-block.glb',     // Kenney Nature  🟢
    rockLA:  './assets/env/rock-large-a.glb',    // Kenney Nature  🟢
    rockLB:  './assets/env/rock-large-b.glb',
    rockLC:  './assets/env/rock-large-c.glb',
    rockSA:  './assets/env/rock-small-a.glb',
    rockSB:  './assets/env/rock-small-b.glb',
    stump:   './assets/env/stump.glb',
    logStack:'./assets/env/log-stack.glb',
    bridge:  './assets/env/bridge-stone.glb',
    path:    './assets/env/path-tile.glb',
    pillar:  './assets/env/pillar.glb',          // Kenney Castle  🟢
    torch:   './assets/env/dungeon/Torch.glb',   // Quaternius Dungeon 🟢
    bars:    './assets/env/dungeon/Arch_bars.glb',
    column:  './assets/env/dungeon/Column.glb',
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  emberKit = Object.fromEntries(entries);
  return emberKit;
}

// Scorched rock. The Kenney nature pieces are green-and-grey out of the box;
// Ember Hollow is a burnt-out volcanic hollow, so every kit material gets the
// district's tint. This is the asset-multiplication law: one rock, five
// districts, no new downloads.
const tintCache = new Map();
function tinted(gltf, key, tint, darken = 1) {
  const root = prepareModel(gltf.scene.clone());
  root.traverse((n) => {
    if (!n.isMesh) return;
    const ck = `${key}|${n.material.name}|${tint}|${darken}`;
    if (!tintCache.has(ck)) {
      const m = n.material.clone();
      m.name = `ember_${ck}`;
      m.color.setHex(tint).multiplyScalar(darken);
      // this cache outlives the room, so the room teardown must not free it —
      // the identity registry is what stops World.dispose() reclaiming it
      SHARED.add(m);
      tintCache.set(ck, m);
    }
    n.material = tintCache.get(ck);
  });
  return root;
}

// ---------------------------------------------------------------------------
// Greybox shell: floor + walls with door gaps, on the grid.
// ---------------------------------------------------------------------------
const DOOR_HALF = 1.2;      // 2.4u standard door — METRICS.md
const WALL_T = 1.0;

function protoShell(world, w, d, gaps, tint) {
  const halfW = w / 2, halfD = d / 2;
  world.deckY = 0;
  // +6 in both axes: three units of ground outside the wall, so the camera
  // never sees the void past a 1.9u wall (see dressShell's APRON)
  protoFloor(world, w + 6, d + 6, tint);

  const segments = (side, lo, hi) => {
    const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
    let start = lo; const out = [];
    for (const c of cuts) { if (c.from > start) out.push([start, c.from]); start = c.to; }
    if (start < hi) out.push([start, hi]);
    return out;
  };
  const H = 1.6;
  for (const [a, b] of segments('n', -halfW, halfW)) protoWall(world, a, -halfD - WALL_T / 2, b, -halfD + WALL_T / 2, { height: H, tint });
  for (const [a, b] of segments('s', -halfW, halfW)) protoWall(world, a, halfD - WALL_T / 2, b, halfD + WALL_T / 2, { height: H, tint });
  for (const [a, b] of segments('w', -halfD, halfD)) protoWall(world, -halfW - WALL_T / 2, a, -halfW + WALL_T / 2, b, { height: H, tint });
  for (const [a, b] of segments('e', -halfD, halfD)) protoWall(world, halfW - WALL_T / 2, a, halfW + WALL_T / 2, b, { height: H, tint });

  // BLIND-STRIP LAW made visible in the greybox: the 2.5u band along the south
  // wall that the camera cannot see over. Nothing interactive may live here,
  // and painting it means the rule is checked by eye while walking.
  protoDecal(world, 0, halfD - 1.25, w, 2.5, 0xff3a3a, 0.13);
  return { halfW, halfD };
}

// ---------------------------------------------------------------------------
// DRESSED shell: the same rectangle, the same door gaps, the same colliders —
// built from Kenney floor tiles and cliff blocks instead of checkered boxes.
// The geometry contract is identical, which is the whole point of greyboxing
// first: approving the box approves the room.
// ---------------------------------------------------------------------------
function dressShell(world, w, d, gaps, D) {
  const halfW = w / 2, halfD = d / 2;
  world.deckY = 0;

  const APRON = 3;   // tiles of ground OUTSIDE the wall — see note above
  const floors = [];
  for (let tx = -APRON; tx < w + APRON; tx++) {
    for (let tz = -APRON; tz < d + APRON; tz++) {
      floors.push({ x: tx - halfW + 0.5, z: tz - halfD + 0.5, ry: ((tx * 7 + tz * 13) % 4) * Math.PI / 2 });
    }
  }
  // one InstancedMesh for the whole floor — 832 tiles, one draw call, and
  // deliberately left OUT of the static merge (see batch.js EXPAND_TRI_LIMIT)
  world.add(instancePlacements(emberKit.floor.scene, floors,
    { castShadow: false, materialTints: floorTint(D) }));

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
  world.add(instancePlacements(emberKit.cliff.scene, walls, { materialTints: wallTint(D) }));

  const segments = (side, lo, hi) => {
    const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
    let start = lo; const out = [];
    for (const c of cuts) { if (c.from > start) out.push([start, c.from]); start = c.to; }
    if (start < hi) out.push([start, hi]);
    return out;
  };
  // colliders sit at the SAME coordinates the greybox used, so every distance
  // measured while walking the box still holds
  for (const [a, b] of segments('n', -halfW, halfW)) world.addBox(a, b, -halfD - WALL_T / 2, -halfD + WALL_T / 2);
  for (const [a, b] of segments('s', -halfW, halfW)) world.addBox(a, b, halfD - WALL_T / 2, halfD + WALL_T / 2);
  for (const [a, b] of segments('w', -halfD, halfD)) world.addBox(-halfW - WALL_T / 2, -halfW + WALL_T / 2, a, b);
  for (const [a, b] of segments('e', -halfD, halfD)) world.addBox(halfW - WALL_T / 2, halfW + WALL_T / 2, a, b);

  return { halfW, halfD };
}

// Kenney's nature materials are named per surface — floor-tile.glb is `grass`,
// cliff-block.glb is `grass` + `dirt`, the rocks are `dirt` + `grass`. Naming
// every one is how one green kit becomes five volcanic districts with no new
// downloads (asset-multiplication law). A name that is not in the map keeps
// its original colour, so a missed name shows up as a green patch rather than
// a silent failure.
const floorTint = (D) => ({ grass: D.floorTint, dirt: D.wallTint, colormap: D.floorTint });
const wallTint = (D) => ({ grass: D.wallTint, dirt: D.wallTint, stone: D.wallTint,
  stoneDark: D.wallTint, colormap: D.wallTint });

// ONE entry point, TWO costumes. Every builder calls this and never decides
// for itself which mode it is in — that is what keeps the greybox and the
// dressed room provably the same layout.
function shell(world, spec, gaps, D) {
  return GREY()
    ? protoShell(world, spec.w, spec.d, gaps, D.tint)
    : dressShell(world, spec.w, spec.d, gaps, D);
}

// Scorched scatter along the walls: silhouette variety without eating the
// playfield. Everything sits in the outer 4u ring, never in the middle where
// the fighting happens, and never in a doorway.
function scatter(world, halfW, halfD, D, seed = 1, count = 14) {
  if (GREY()) return;
  const kinds = ['rockLA', 'rockLB', 'rockLC', 'rockSA', 'rockSB'];
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
    if (Math.abs(x) < DOOR_HALF + 1.2 && edge < 2) continue;   // keep n/s doorways clear
    if (Math.abs(z) < DOOR_HALF + 1.2 && edge >= 2) continue;  // keep e/w doorways clear
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const big = kind.startsWith('rockL');
    const rock = tinted(emberKit[kind], kind, D.wallTint, 0.9 + rnd() * 0.2);
    rock.position.set(x, 0, z);
    rock.rotation.y = rnd() * Math.PI * 2;
    rock.scale.setScalar(big ? 0.8 + rnd() * 0.5 : 0.6 + rnd() * 0.4);
    world.add(rock);
    if (big) world.addCircle(x, z, 0.75);
  }
}

// The lava you can SEE. In greybox the channel is a red decal so its footprint
// can be judged; dressed, it is an emissive surface with a pulsing light, and
// the safe slabs are real bridge pieces laid across it.
function lavaSurface(world, x, z, w, d) {
  if (GREY()) return null;
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a2b, emissiveIntensity: 1.8, roughness: 1 })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(x, world.deckY + 0.02, z);
  world.add(lava);
  world.keepLoose(lava);                     // it animates; do not fold it in
  const light = new THREE.PointLight(0xff6a33, 11, Math.max(w, d) * 2.4, 1.8);
  light.position.set(x, 1.2, z);
  world.add(light);
  world.onAnimate((t) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.3 + x) * Math.sin(t * 0.7 + z);
    lava.material.emissiveIntensity = 1.5 + pulse * 0.9;
    light.intensity = 8 + pulse * 5;
  });
  return lava;
}

// A walkable slab across the lava, from real bridge pieces.
function slab(world, x, z, w, d, D) {
  if (GREY()) return;
  for (let i = 0; i < Math.max(1, Math.round(w / 2)); i++) {
    const p = tinted(emberKit.bridge, 'slab', D.wallTint);
    p.position.set(x - w / 2 + 1 + i * 2, world.deckY + 0.03, z);
    p.scale.set(1.1, 1, d / 2.2);
    world.add(p);
  }
}

// The teach braziers, dressed. In greybox these are markers only — a brazier
// is a gameplay object, and the greybox exists to test SPACE, not systems.
function teachBraziers(world, spots, prefix, onLit) {
  if (GREY()) return;
  spots.forEach((sp, i) => brazier(world, prepareModel, emberKit.torch, `${prefix}${i + 1}`, sp.x, sp.z, onLit));
}

// An INTERIOR wall run — the thing that makes a room a shape instead of a box.
// Greybox: a checkered slab. Dressed: a row of cliff blocks, same footprint,
// same collider. These were the one piece still wearing the greybox costume in
// a dressed room, which is exactly the kind of drift greyboxing is meant to
// prevent, so it dispatches like everything else now.
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
  world.add(instancePlacements(emberKit.cliff.scene, places, { materialTints: wallTint(D) }));
  const pad = 0.5;
  world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad,
    Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
}

// A door on a wall side, with its gap already cut in the shell.
function sideDoor(world, side, halfW, halfD, to, entry) {
  const T = 1.35;
  if (side === 'n') world.addDoor(-DOOR_HALF, DOOR_HALF, -halfD - T, -halfD + 0.15, to, entry);
  if (side === 's') world.addDoor(-DOOR_HALF, DOOR_HALF, halfD - 0.15, halfD + T, to, entry);
  if (side === 'w') world.addDoor(-halfW - T, -halfW + 0.15, -DOOR_HALF, DOOR_HALF, to, entry);
  if (side === 'e') world.addDoor(halfW - 0.15, halfW + T, -DOOR_HALF, DOOR_HALF, to, entry);
}
const gap = (side) => ({ side, from: -DOOR_HALF, to: DOOR_HALF });

// Spine breadcrumbs: the Sparks. Twelve per level, ON the critical path, drifting
// just above the floor. In greybox they are plain glowing dots — their JOB is
// wayfinding, and that job has to be evaluable before any art exists.
function sparks(world, pts) {
  if (!pts.length) return;
  const geo = new THREE.SphereGeometry(0.13, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffb45a, emissiveIntensity: 2.2, roughness: 1,
  });
  const inst = new THREE.InstancedMesh(geo, mat, pts.length);   // one draw call
  const dummy = new THREE.Object3D();
  pts.forEach((p, i) => {
    dummy.position.set(p[0], 0.9, p[1]);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  });
  world.add(inst);
  world.onAnimate((t) => { inst.position.y = Math.sin(t * 1.6) * 0.12; });
  world.markers.sparkSpots = pts.map((p) => ({ x: p[0], z: p[1] }));
}

// A "come back later" gate. It must read as LATER, never as broken: a shaped,
// coloured obstacle with the reward VISIBLE on the far side (design/LEVEL-MAP.md).
// In greybox it is a coloured slab plus a gold reward marker behind it — enough
// to test whether a child reads it as a promise.
function promiseGate(world, x, z, w, d, color, label, kind = 'crack') {
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.5, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: color, emissiveIntensity: 0.18 })
    );
    m.position.set(x, 0.75, z);
    world.add(m);
    world.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    protoLabel(world, x, z, label, { color: '#ffd54a', y: 2.4, size: 1.2 });
    return m;
  }
  // DRESSED: the obstacle has to say "later" by its own shape and colour, so
  // it is a real object of the kind the future tool destroys — a fissured
  // boulder for the Earth Wolf, a charred log jam for the Fire Wolf. Nothing
  // is described that is not modelled (NO FAKE FICTION).
  const g = new THREE.Group();
  const span = Math.max(w, d);
  const n = Math.max(2, Math.round(span / 1.6));
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const piece = kind === 'fire'
      ? tinted(emberKit.logStack, 'gateLog', 0x2e211c, 1)
      : tinted(emberKit.rockLB, 'gateRock', color, 1);
    piece.position.set(x + (w > d ? f * w : 0), 0, z + (d >= w ? f * d : 0));
    piece.rotation.y = i * 1.31;
    piece.scale.setScalar(kind === 'fire' ? 1.25 : 1.05);
    g.add(piece);
  }
  world.add(g);
  world.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  // the "later" tell: a cold glow in the tool's own colour, at ankle height
  const hint = new THREE.Mesh(
    new THREE.RingGeometry(span * 0.42, span * 0.55, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, depthWrite: false })
  );
  hint.rotation.x = -Math.PI / 2;
  hint.position.set(x, world.deckY + 0.04, z);
  world.add(hint);
  return g;
}

// The reward you can SEE but not reach yet — the other half of a promise gate.
function visibleReward(world, x, z, id = 'l1_reward', loot = { shards: 14 }) {
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0xffd54a, emissiveIntensity: 0.5, roughness: 0.7 })
    );
    m.position.set(x, 0.35, z);
    world.add(m);
    return m;
  }
  // DRESSED: an actual openable chest, not a gold cube pretending to be one.
  // main.js spawnChests() builds these from world.markers.chestDefs.
  (world.markers.chestDefs || (world.markers.chestDefs = []))
    .push({ id, tier: 'wood', x, z, ry: 0.4, loot });
  return null;
}

// A dark zone, greybox flavour. The room's own copy rather than rooms.js's —
// importing it back the other way would make rooms.js and level1.js a cycle.
// main.js writes `zone.veilMat.opacity` every frame, so the material is not
// optional: a zone without one crashes the render loop.
function protoDarkZone(world, minX, maxX, minZ, maxZ) {
  const veilMat = new THREE.MeshBasicMaterial({
    color: 0x0a0714, transparent: true, opacity: 0.62, depthWrite: false,
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), veilMat);
  veil.rotation.x = -Math.PI / 2;
  veil.position.set((minX + maxX) / 2, 1.65, (minZ + maxZ) / 2);
  world.add(veil);
  world.darkZones.push({ minX, maxX, minZ, maxZ, veilMat });
}

// A hero prop: the district's memory anchor. Greybox form is a bold blocky
// silhouette at true scale — the point of testing it early is precisely that
// it must READ FROM ABOVE, and that is a silhouette question, not an art one.
function heroProp(world, x, z, kind, tint, D = null) {
  const g = new THREE.Group();

  if (GREY()) {
    const mat = protoMaterial(tint, 3, 3);
    const add = (w, h, d, px, py, pz, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz); m.rotation.y = ry;
      m.castShadow = true;
      g.add(m);
    };
    if (kind === 'gate') {           // a toppled arch you walk UNDER
      add(2, 5.5, 2, -3.5, 2.75, 0); add(2, 5.5, 2, 3.5, 2.75, 0); add(9, 1.6, 2.2, 0, 6.3, 0);
      world.addCircle(x - 3.5, z, 1.2); world.addCircle(x + 3.5, z, 1.2);
    } else if (kind === 'cone') {    // the Kiln volcano — visible from everywhere
      add(9, 7, 9, 0, 3.5, 0); add(5.5, 4, 5.5, 0, 9, 0);
      world.addCircle(x, z, 4.6);
    } else if (kind === 'span') {    // a collapsed stone bridge over the chasm
      for (let i = 0; i < 7; i++) add(2.2, 1.1, 1.1, -7 + i * 2.4, 1.3 + Math.sin(i) * 0.5, 0, i * 0.4);
    } else if (kind === 'bowl') {    // the Forge Heart — a brazier the size of a room
      add(10, 1.4, 10, 0, 0.7, 0); add(7.5, 2.6, 7.5, 0, 2.4, 0);
      world.addCircle(x, z, 5.2);
    } else if (kind === 'cage') {    // Cinder's cage
      add(3.2, 4.4, 3.2, 0, 2.2, 0);
      world.addCircle(x, z, 1.9);
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }

  // DRESSED. Same footprint, same colliders, same silhouette-from-above —
  // built entirely from GREEN-pack models. Nothing here is named after a thing
  // that is not on screen: the Cinder Bridges anchor is a BROKEN SPAN because
  // a broken span is what bridge-stone.glb can actually be.
  const wall = D ? D.wallTint : tint;
  const put = (gltf, key, px, py, pz, s, ry = 0, rz = 0, colour = wall) => {
    const m = tinted(gltf, key, colour);
    m.position.set(px, py, pz);
    m.rotation.set(0, ry, rz);
    m.scale.setScalar(s);
    g.add(m);
    return m;
  };

  if (kind === 'gate') {
    // two standing castle pillars with the lintel fallen off one of them
    put(emberKit.pillar, 'heroPillar', -3.5, 0, 0, 2.4);
    put(emberKit.pillar, 'heroPillar', 3.5, 0, 0, 2.4);
    put(emberKit.pillar, 'heroPillar', 0.6, 4.9, 0, 2.4, 0, Math.PI / 2);
    world.addCircle(x - 3.5, z, 1.2); world.addCircle(x + 3.5, z, 1.2);
  } else if (kind === 'cone') {
    // the Kiln itself: a cone of stacked boulders, the landmark the whole
    // level is walking toward. Big enough to be read from two rooms away.
    const ring = (r, y, n, s) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        put(i % 2 ? emberKit.rockLA : emberKit.rockLC, 'heroCone',
          Math.cos(a) * r, y, Math.sin(a) * r, s, a);
      }
    };
    ring(4.2, 0, 9, 2.0); ring(2.7, 2.6, 7, 1.7); ring(1.3, 4.8, 5, 1.3);
    world.addCircle(x, z, 4.6);
  } else if (kind === 'span') {
    // THE BROKEN SPAN — a stone bridge that used to cross the chasm, its
    // sections tipped and sagging. Real bridge pieces, really broken.
    for (let i = 0; i < 5; i++) {
      put(emberKit.bridge, 'heroSpan', -6 + i * 3, 0.4 + Math.sin(i * 1.3) * 0.5, 0,
        1.5, 0.06 * i, (i - 2) * 0.13);
    }
  } else if (kind === 'bowl') {
    // THE FORGE HEART — a ring of dungeon columns around a sunken fire bowl.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      put(emberKit.column, 'heroBowl', Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4, 1.5, a);
    }
    const coals = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a2b, emissiveIntensity: 1.5, roughness: 1 })
    );
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = world.deckY + 0.05;
    g.add(coals);
    world.keepLoose(coals);
    world.onAnimate((t) => { coals.material.emissiveIntensity = 1.2 + Math.sin(t * 1.7) * 0.5; });
    world.addCircle(x, z, 5.2);
  } else if (kind === 'cage') {
    // CINDER'S CAGE — four barred arches boxing the spirit in. Real bars.
    for (let i = 0; i < 4; i++) {
      put(emberKit.bars, 'heroCage', 0, 0, 0, 1.9, (i / 4) * Math.PI * 2, 0, 0x4a4350);
    }
    world.addCircle(x, z, 1.9);
  }
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// THE ROOM BUILDERS
// ---------------------------------------------------------------------------

function base(scene, id) {
  const spec = L1[id];
  const world = new World(scene);
  world.bgColor = 0x17101f;
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    protoLabel(world, 0, 0, spec.label, { color: '#ffd9c2', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#9b8e85', y: 2.4, size: 1.4 });
    return world;
  }
  // The district's light. Wayfinding without text (design/LEVEL-MAP.md):
  // the room's own colour temperature tells a child which part of the level
  // they are standing in before they look at a single prop.
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };

  // THE GUARDRAIL. Every static prop placed above is folded into one draw per
  // material here — measured on the shipping rooms, this is worth 40-70 draw
  // calls a room and it is the difference between Level 1 fitting in the
  // budget and not. Anything gameplay holds (gates, chests, enemies, the
  // Forge Heart coals) is protected and left alone. See js/batch.js.
  flattenStatic(world);
  return world;
}

// --- ISLAND A — THE ASHFALL (arrival) ---------------------------------------
export async function buildLa(scene) {
  const { world, spec, D } = base(scene, 'la');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e')], D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg1', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'la1', { x: -7, z: 0, angle: Math.PI / 2 });

  heroProp(world, 0, -6, 'gate', D.tint, D);               // ▲ THE FALLEN GATE
  world.markers.heroSpot = { x: 0, z: -6 };
  world.markers.shadeSpots = [{ x: -6, z: 2 }, { x: 6, z: -1 }];
  scatter(world, halfW, halfD, D, 11, 16);
  // FORESHADOWED GATE — Level 2's tool, seeded a whole level early
  promiseGate(world, -11, -4, 3, 3, 0x9a8c6a, 'CRACKED — later', 'crack');
  visibleReward(world, -13.5, -4, 'l1_crack_promise', { shards: 18 });
  world.markers.crackPromise = { x: -11, z: -4 };
  sparks(world, [[0, 7], [0, 3], [0, -1]]);
  return finish(world, spec, D);
}

export async function buildLa1(scene) {
  const { world, spec, D } = base(scene, 'la1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'la', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  // shaped, not a box: a switchback so the pocket is a small maze
  wallRun(world, -4, -3, 6, -3, D);
  wallRun(world, -6, 2, 4, 2, D);
  world.markers.shadeSpots = [{ x: 5, z: -5 }];
  world.markers.pocketChest = { x: 7, z: 5 };
  scatter(world, halfW, halfD, D, 12, 10);
  visibleReward(world, 7, 5, 'l1_warrens', { shards: 16 });
  return finish(world, spec, D);
}

// --- CHOKE 1 — THE FALLEN GATE (rest) ---------------------------------------
export async function buildLg1(scene) {
  const { world, spec, D } = base(scene, 'lg1');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'la', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lb', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  sparks(world, [[0, 2], [0, -2]]);
  return finish(world, spec, D);
}

// --- ISLAND B — EMBER CAUSEWAY ----------------------------------------------
export async function buildLb(scene) {
  const { world, spec, D } = base(scene, 'lb');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e'), gap('w')], D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg1', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg2', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'lb1', { x: -7, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'lb2', { x: 7, z: 0, angle: -Math.PI / 2 });

  heroProp(world, 10, -9, 'cone', D.tint, D);              // ▲ THE KILN, seen from here on
  world.markers.heroSpot = { x: 10, z: -9 };
  // shaped, not a box — an L of rock splits the island into two reads
  wallRun(world, -14, -2, -4, -2, D);
  wallRun(world, -4, -2, -4, 6, D);
  world.markers.mothSpots = [{ x: -8, z: 4 }, { x: 4, z: 2 }];
  world.markers.geyserSpots = [{ x: 2, z: -5 }, { x: 6, z: -5 }, { x: 10, z: -5 }];
  scatter(world, halfW, halfD, D, 21, 16);
  sparks(world, [[0, 9], [0, 5], [0, 0], [0, -5], [0, -10]]);
  return finish(world, spec, D);
}

export async function buildLb1(scene) {
  const { world, spec, D } = base(scene, 'lb1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'lb', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  wallRun(world, 1, -6, 1, 1, D);
  world.markers.pup1Spot = { x: 6, z: -4 };
  world.markers.mothSpots = [{ x: 4, z: 3 }];
  scatter(world, halfW, halfD, D, 22, 10);
  return finish(world, spec, D);
}

export async function buildLb2(scene) {
  const { world, spec, D } = base(scene, 'lb2');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D);
  world.spawn = { x: 7, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'lb', { x: -13.5, z: 0, angle: Math.PI / 2 });   // LOOPS BACK
  // THE FIRE GATE — foreshadowed long before the Fire Wolf exists.
  // Charred, orange, reward plainly visible behind it: reads "later", not "never".
  promiseGate(world, 1, 0, 2, 8, 0xc0682d, 'SCORCHED — needs fire', 'fire');
  visibleReward(world, -4, 0, 'l1_scorched', { shards: 20 });
  world.markers.firePromise = { x: 1, z: 0 };
  world.markers.pup3Spot = { x: -6, z: 0 };
  scatter(world, halfW, halfD, D, 23, 10);
  return finish(world, spec, D);
}

// --- CHOKE 2 — THE NARROWS --------------------------------------------------
export async function buildLg2(scene) {
  const { world, spec, D } = base(scene, 'lg2');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lb', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lc', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  sparks(world, [[0, 2], [0, -2]]);
  return finish(world, spec, D);
}

// --- ISLAND C — CINDER BRIDGES ----------------------------------------------
export async function buildLc(scene) {
  const { world, spec, D } = base(scene, 'lc');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e')], D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg2', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg3', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'lc1', { x: -7, z: 0, angle: Math.PI / 2 });

  heroProp(world, -9, -7, 'span', D.tint, D);            // ▲ THE BROKEN SPAN
  world.markers.heroSpot = { x: -9, z: -7 };
  // the lava channel: two walkable slab routes with a gap of hazard between
  world.addLava(-16, 16, -3, 1);
  world.addSafe(-7, -3, -3, 1); world.addSafe(3, 7, -3, 1);
  protoDecal(world, 0, -1, 32, 4, 0xff5a2b, 0.5);
  protoDecal(world, -5, -1, 4, 4, 0x8a8a8a, 0.9);
  protoDecal(world, 5, -1, 4, 4, 0x8a8a8a, 0.9);
  lavaSurface(world, 0, -1, 32, 4);
  slab(world, -5, -1, 4, 4, D); slab(world, 5, -1, 4, 4, D);
  world.markers.houndSpot = { x: 8, z: -8, variant: 'elder' };
  scatter(world, halfW, halfD, D, 31, 14);
  sparks(world, [[0, 9], [-5, 3], [-5, -5], [0, -10]]);
  return finish(world, spec, D);
}

export async function buildLc1(scene) {
  const { world, spec, D } = base(scene, 'lc1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'lc', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  wallRun(world, -2, -5, 6, -5, D);
  world.markers.pocketChest = { x: 6, z: -2 };
  visibleReward(world, 6, -2, 'l1_drowned_forge', { shards: 22, heartPiece: 1 });
  world.markers.shadeSpots = [{ x: 2, z: 4 }];
  scatter(world, halfW, halfD, D, 32, 10);
  return finish(world, spec, D);
}

// --- CHOKE 3 — THE EMBER SEAL -----------------------------------------------
export async function buildLg3(scene) {
  const { world, spec, D } = base(scene, 'lg3');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lc', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'ld', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.sealSpot = { x: 0, z: -2 };
  sparks(world, [[0, 2], [0, -2]]);
  return finish(world, spec, D);
}

// --- ISLAND D — THE KILN (the ability: introduce + develop) ------------------
export async function buildLd(scene) {
  const { world, spec, D } = base(scene, 'ld');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e')], D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg3', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg4', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'ld1', { x: -7, z: 0, angle: Math.PI / 2 });

  heroProp(world, 0, -8, 'bowl', D.tint, D);               // ▲ THE FORGE HEART
  world.markers.heroSpot = { x: 0, z: -8 };
  // TEACH 1 — INTRODUCE: one brazier, in a safe alcove, no enemies, no timer.
  world.markers.shrineSpot = { x: 0, z: -3 };
  world.markers.teachBrazier = { x: 0, z: -3 };
  // TEACH 2 — DEVELOP: the Gutter Run. Three braziers in a channel, on a clock.
  wallRun(world, 6, 2, 6, 10, D);
  wallRun(world, 13, 2, 13, 10, D);
  world.markers.gutterSpots = [{ x: 9.5, z: 8 }, { x: 9.5, z: 5 }, { x: 9.5, z: 2 }];
  teachBraziers(world, [world.markers.teachBrazier], 'ld_teach');
  teachBraziers(world, world.markers.gutterSpots, 'ld_gutter');
  scatter(world, halfW, halfD, D, 41, 14);
  sparks(world, [[0, 9], [0, 4], [0, 0]]);
  return finish(world, spec, D);
}

// --- THE ORDER HALL — the one puzzle room, the TWIST -------------------------
export async function buildLd1(scene) {
  const { world, spec, D } = base(scene, 'ld1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ld', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  // TEACH 3 — TWIST: four braziers, lit in the order their pilot-flames
  // flicker — but the hall is DARK, so the order is only readable as the Dark
  // Wolf. The new tool needs the old tool. Nothing new is taught after this.
  protoDarkZone(world, -halfW, halfW, -halfD, halfD);
  world.markers.orderSpots = [
    { x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }, { x: -5, z: 4 },
  ];
  world.markers.orderSpot = { x: 0, z: 0 };
  teachBraziers(world, world.markers.orderSpots, 'ld1_order');
  return finish(world, spec, D);
}

// --- CHOKE 4 — THE BOSS DOOR (rest: flame + potion, contract law) ------------
export async function buildLg4(scene) {
  const { world, spec, D } = base(scene, 'lg4');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ld', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'le', { x: 0, z: 9.5, angle: Math.PI });
  world.markers.restSpot = { x: -2, z: 0 };
  world.markers.potionSpot = { x: 2, z: 0 };
  world.markers.bossDoorSpot = { x: 0, z: -3 };
  return finish(world, spec, D);
}

// --- ISLAND E — HEART OF THE HOLLOW (boss; TEACH 4 — conclude) ---------------
export async function buildLe(scene) {
  const { world, spec, D } = base(scene, 'le');
  const onward = !!state.flags.bossDefeated;
  const gaps = [gap('s'), ...(onward ? [gap('w')] : [])];
  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 9.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg4', { x: 0, z: -3.2, angle: 0 });
  // THE LOOP-BACK: a one-way walked door home, opened by the boss (rule 4).
  if (onward) sideDoor(world, 'w', halfW, halfD, 'la', { x: 0, z: 10, angle: Math.PI });

  heroProp(world, 0, -2, 'cage', D.tint, D);               // ▲ CINDER'S CAGE
  world.markers.heroSpot = { x: 0, z: -2 };
  if (!onward) world.markers.bossSpot = { x: 0, z: -2, skin: 'shadowgrip' };
  // TEACH 4 — CONCLUDE: four cage-braziers, slammed alight in the collapse
  // windows. The final use of the gift is what frees the spirit.
  scatter(world, halfW, halfD, D, 51, 12);
  world.markers.cageBraziers = [
    { x: -4, z: -6 }, { x: 4, z: -6 }, { x: -4, z: 2 }, { x: 4, z: 2 },
  ];
  teachBraziers(world, world.markers.cageBraziers, 'le_cage');
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE METRICS ZOO — every module, gap and doorway at TRUE SCALE, walkable.
// Reached from the cheat menu. Walk it before trusting design/METRICS.md.
// ---------------------------------------------------------------------------
export async function buildZoo(scene) {
  forceGrey = true;                 // the zoo is a ruler; a ruler is not dressed
  try {
    return buildZooInner(scene);
  } finally { forceGrey = false; }
}

function buildZooInner(scene) {
  const world = new World(scene);
  world.bgColor = 0x14161c;
  world.deckY = 0;
  protoFloor(world, 60, 44, 0x9aa0a8);
  const H = 1.6;
  protoWall(world, -30, -22, 30, -22, { height: H, tint: 0x6a7078 });
  protoWall(world, -30, 22, 30, 22, { height: H, tint: 0x6a7078 });
  protoWall(world, -30, -22, -30, 22, { height: H, tint: 0x6a7078 });
  protoWall(world, 30, -22, 30, 22, { height: H, tint: 0x6a7078 });
  world.spawn = { x: 0, z: 16, angle: Math.PI };

  const say = (x, z, t, c) => protoLabel(world, x, z, t, { color: c || '#ffd9c2', y: 2.5, size: 1.5 });

  // 1 — one grid tile, and the body that has to fit through everything
  protoDecal(world, -24, 14, 1, 1, 0xffd54a, 0.9);
  say(-24, 12.4, '1 x 1u grid tile');
  protoDecal(world, -20, 14, 0.64, 0.64, 0x6fe3a0, 0.9);
  say(-20, 12.4, 'Kael 0.64u body');

  // 2 — the doorway family, side by side at true width
  const doorPair = (x, w, label) => {
    protoWall(world, x - 4, 6, x - w / 2, 6, { height: H, tint: 0x7a828a });
    protoWall(world, x + w / 2, 6, x + 4, 6, { height: H, tint: 0x7a828a });
    say(x, 8.4, label, '#cfe8d0');
  };
  doorPair(-18, 2.4, 'DOOR 2.4u');
  doorPair(-8, 3.0, 'CHOKE 3.0u');
  doorPair(2, 2.0, 'MIN CORRIDOR 2.0u');
  doorPair(12, 0.64, 'ABSOLUTE MIN 0.64u');
  say(12, 4.2, '(fits, but a child cannot steer it)', '#ff9d9d');

  // 3 — the island footprint, with the camera's actual view drawn inside it
  protoDecal(world, 0, -8, 32, 26, 0xffffff, 0.10);
  say(0, -21.5, 'ISLAND FOOTPRINT 32 x 26u');
  protoDecal(world, 0, -8, 16.1, 17.4, 0x6fe3a0, 0.16);
  say(0, -0.6, 'what the camera actually shows: 16.1u wide', '#6fe3a0');

  // 4 — the blind strip, at the size it really is
  protoDecal(world, 0, 20.4, 60, 2.5, 0xff3a3a, 0.20);
  say(0, 19.6, 'BLIND STRIP 2.5u — no interactives here', '#ff9d9d');

  // 5 — deck heights: a decal at deck 0 vs one at 0.185 (the stone tile deck)
  const deckDemo = new THREE.Mesh(new THREE.BoxGeometry(4, 0.185, 4), protoMaterial(0x8a8a8a, 4, 4));
  deckDemo.position.set(22, 0.0925, 14);
  world.add(deckDemo);
  protoDecal(world, 22, 14, 2, 2, 0xffd54a, 0.9);       // sits ON the raised deck
  say(22, 11.6, 'deck 0.185 + decal above it');

  // 6 — the hero props, at true scale, judged from directly above
  heroProp(world, -20, -14, 'gate', 0x8d8b86);
  heroProp(world, -6, -14, 'cone', 0xb5702f);
  heroProp(world, 8, -14, 'span', 0x9c3a2a);
  heroProp(world, 20, -14, 'bowl', 0xc99a3a);
  say(0, -19.5, 'HERO PROPS — do these read from above?', '#ffd54a');

  protoLabel(world, 0, 17, 'METRICS ZOO — design/METRICS.md', { color: '#ffd9c2', y: 3.6, size: 2.2 });
  return world;
}

export const LEVEL1_ROOMS = {
  la: buildLa, la1: buildLa1, lg1: buildLg1,
  lb: buildLb, lb1: buildLb1, lb2: buildLb2, lg2: buildLg2,
  lc: buildLc, lc1: buildLc1, lg3: buildLg3,
  ld: buildLd, ld1: buildLd1, lg4: buildLg4,
  le: buildLe,
  zoo: buildZoo,
};
