// THE VILLAGE — an epilogue capstone, built to design/LEVEL-DESIGN-VILLAGE.md.
//
// Not part of the canon region chain (REGION_ORDER in regions.js). No new
// wolf form, no lock-and-key gates — every door here is open the moment the
// region is reached. The verb is CLEAR IT: six named guardians (the roster
// ids task #31 tagged region:"The Village", already generated and rigged,
// never wired until now), reachable from the Square in any order. Defeat
// all six and the corruption lifts.
//
// Room ids use the `y` prefix — `v` is Stoneroot's, and js/rooms.js's kit
// loader dispatches on a room id's first letter, so reusing one would
// silently route the Village through Stoneroot's cave-kit branch.
//
// DRESSING PASS (2026-08-24), decided with the user before any code:
//   * kit — assets/env/town/* (hut, houses-pack, tower-2/3, wagons,
//     wall-1/2), confirmed unused anywhere else and, apart from the
//     higher-poly fantasy-house.glb and the 100-material castle.glb (both
//     skipped — see loadVillageKit), a real village kit rather than a
//     repurposed dungeon set.
//   * centrepiece — a dead tree (assets/env/stump.glb, otherwise unused),
//     with a ring of flowers/bushes that grows one guardian at a time —
//     the stump itself never changes; life returns AROUND it.
//   * corruption look — shadow/moon-tinted: every corrupted room's props and
//     ground reuse 0x2a1a3a, the exact colour every moon-weak enemy's
//     hit-puff already carries (js/enemies.js TRAITS), so a child who has
//     learned "that colour is the shadow" isn't taught a second palette here.
//   * per-room dressing — each of the six guardian pockets gets its own
//     named structure (a gatehouse, a market row, a mill, two distinct
//     towers, a cramped alley) rather than one dressing kit repeated six
//     times unlabelled.
export const REGION_DRESSING_DECIDED = '2026-08-24';

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { loadGLB } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow, potSpotsOrFewer,
  reserveLandings, shareTexture } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { registerDistrictTints } from './districts.js';

export const REGION = 'village';

// The Small Props Pack keys, listed once: the kit loader shares their atlas by
// this list and the dressers pick from it by name.
const PROP_KEYS = ['cart', 'trough', 'trough2', 'bucket', 'basin', 'broom', 'stool',
  'laundry', 'hearth', 'coil', 'sack', 'firewood', 'cartwheel', 'grinder',
  'target', 'manikin', 'rod', 'fish', 'boat', 'hide'];

let villageKit = null;
const GREY = () => !villageKit || state.settings.greybox !== false;

// no-op for now (see header) — populated in the dressing pass
export async function loadVillageKit() {
  if (villageKit) return villageKit;
  const names = {
    cliff: './assets/env/cliff-block.glb',   // the shell itself — every region's walls
    hut: './assets/env/town/hut.glb',
    houses: './assets/env/town/houses-pack.glb',
    tower2: './assets/env/town/tower-2.glb',
    tower3: './assets/env/town/tower-3.glb',
    wagons: './assets/env/town/wagons.glb',
    wall1: './assets/env/town/wall-1.glb',
    wall2: './assets/env/town/wall-2.glb',
    stump: './assets/env/stump.glb',
    flowerA: './assets/env/flower-a.glb',
    flowerB: './assets/env/flower-b.glb',
    bush: './assets/env/bush-large.glb',
    // THE VILLAGE HAD BUILDINGS AND NOTHING PEOPLE OWN (2026-09-02). RG Poly's
    // Small Props Pack (CC0) is a workshop-and-yard set, which is exactly the
    // gap: a restored village that is huts and walls and no cart, no washing,
    // no firewood reads as a model of a village rather than a place someone
    // came back to. Twenty-one picked out of 115, one per family, biased to
    // the ones that say SOMEBODY LIVES HERE rather than the ones that are just
    // shapes.
    //
    // They arrived 12.3MB for 13,000 triangles: every prop shipped its own
    // embedded copy of the pack's ONE 541KB atlas, twenty-one identical
    // downloads (verified byte-identical, sha256). tools/deduct-atlas.mjs
    // lifts it out once and repoints each GLB at it by URI — the same way the
    // KayKit gear next door names weapons_bits_texture.png — which is 1.5MB
    // for the same pixels and the same geometry.
    cart: './assets/env/village/Cart_1_A.glb',
    trough: './assets/env/village/Trough_1_A.glb',
    trough2: './assets/env/village/Trough_2_A.glb',
    bucket: './assets/env/village/Bucket_1_A.glb',
    basin: './assets/env/village/Basin_A.glb',
    broom: './assets/env/village/Broom_A.glb',
    stool: './assets/env/village/Stool_A.glb',
    laundry: './assets/env/village/Laundry_A.glb',
    hearth: './assets/env/village/FirePlace_1_1_A.glb',
    coil: './assets/env/village/Rope_1_A.glb',
    sack: './assets/env/village/Bag_1_A.glb',
    firewood: './assets/env/village/CutedWood_1_A.glb',
    cartwheel: './assets/env/village/Wheel_A.glb',
    grinder: './assets/env/village/Grinder_A.glb',
    target: './assets/env/village/PracticeTarget_1_A.glb',
    manikin: './assets/env/village/Manequin_1_A.glb',
    rod: './assets/env/village/FishingRod_A.glb',
    fish: './assets/env/village/DriedFish_1_A.glb',
    boat: './assets/env/village/BoatFrame_A.glb',
    hide: './assets/env/village/SkinHang_A.glb',
  };
  // fantasy-house.glb (5 materials it can't be tinted to one colour without
  // flattening its roof/wall/window distinction, and noticeably higher-poly
  // than this project's low-poly standard) and castle.glb (100 materials, a
  // photogrammetry-style import — no sane tint map, far over budget) were
  // both measured and dropped. The seven assetfactory pieces above share
  // exactly one visible material each ("Material" on the hut, "Medieval" on
  // everything else), which is what makes a two-colour corrupted/restored
  // tint pass possible at all.
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  villageKit = Object.fromEntries(entries);
  // SPLIT THE HOUSES-PACK INTO HOUSES. The pack is one 46.5u strip of
  // townhouses with every offset baked into the vertices (all node
  // translations are zero — probe-modelsize confirmed), so it was only ever
  // placeable as the whole terrace at once, which is why the Back Alley used
  // it at 0.34 scale: the strip only fit a pocket as a miniature. Cluster its
  // meshes by world bounds instead and one download becomes a street's worth
  // of DISTINCT buildings, each placeable, tintable and colliding on its own.
  // THIS ENGINE HAS NO USE FOR BAKED COLLISION MESHES. World's own collision
  // is a flat list of boxes/circles (world.addBox/addCircle), registered by
  // hand at each placement — never mesh geometry. The assetfactory pieces
  // (houses-pack, tower-2/3, wagons, wall-1/2) each ship a second, invisible
  // "_COLLIDER" copy of their own geometry for a physics engine this game
  // does not have. Left in, tintedModel would tint and render it right
  // alongside the real mesh — a ghost double standing in the same spot.
  // Stripped once here, at load, so every later placement is clean.
  for (const gltf of Object.values(villageKit)) {
    const dead = [];
    gltf.scene.traverse((n) => {
      if (n.isMesh && /COLLIDER/i.test((n.material && n.material.name) || '')) dead.push(n);
    });
    for (const n of dead) { if (n.parent) n.parent.remove(n); }
  }
  // split AFTER the collider strip, or every townhouse keeps a ghost double
  // of itself baked in
  villageKit.townhouses = splitBuildings(villageKit.houses);
  // ONE TEXTURE OBJECT FOR THE WHOLE PROP PACK, or the download saving buys
  // nothing on screen. loadGLB caches per FILE, so twenty-one GLBs naming the
  // same props_atlas.png still build twenty-one THREE.Texture objects — and
  // tintedModel keys its material cache on `map.uuid`, so that is twenty-one
  // materials and twenty-one draw calls that flattenStatic can never merge.
  // Point them all at the first one and the whole village's clutter collapses
  // to a single batched call.
  shareTexture(PROP_KEYS.map((k) => villageKit[k]).filter(Boolean));
  return villageKit;
}

// Cluster a pack GLB's visible meshes into separate buildings by overlapping
// world bounds (union-find over AABBs padded 0.6u — chimneys and porches touch
// their house, houses do not touch each other across a street). Each cluster
// comes back as {scene} so tintedModel/place treat it exactly like a loaded
// GLB: centred on x/z, feet at y=0, with its true size attached for collider
// derivation — a collider is COMPUTED from the building it boxes, never typed.
function splitBuildings(gltf) {
  const meshes = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((n) => { if (n.isMesh) meshes.push(n); });
  const boxes = meshes.map((m) => new THREE.Box3().setFromObject(m));
  const parent = meshes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const PAD = 0.6;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].clone().expandByScalar(PAD);
      if (a.intersectsBox(boxes[j])) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map();
  meshes.forEach((m, i) => {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(i);
  });
  const out = [];
  for (const idxs of clusters.values()) {
    const box = new THREE.Box3();
    for (const i of idxs) box.union(boxes[i]);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 1 || size.z < 1) continue;   // stray trim, not a building
    const ctr = box.getCenter(new THREE.Vector3());
    const g = new THREE.Group();
    for (const i of idxs) {
      const c = meshes[i].clone();
      c.applyMatrix4(meshes[i].matrixWorld);
      c.position.sub(new THREE.Vector3(ctr.x, box.min.y, ctr.z));
      g.add(c);
    }
    out.push({ scene: g, w: size.x, h: size.y, d: size.z });
  }
  // biggest first, so callers can pick "a grand house" vs "a small one" by index
  out.sort((a, b) => b.w * b.d - a.w * a.d);
  return out;
}

export const DISTRICTS = {
  village: { tint: 0x8a7a5c, floorTint: 0x6e5f45, wallTint: 0x3a3226, propTint: 0x7a6a4e,
             ground: 'village', name: 'THE VILLAGE', hero: 'THE VILLAGE SQUARE' },
};

// THE SHADOW LIFTS PER STREET. A room's OWN guardian falling flips which one
// of these two districts its walls, floor and structures are built with the
// NEXT time this room builds — the same "next visit reflects the change"
// contract every other region's restoration state already keeps (the
// vault's three stages, the wild wood's cut chords: none of those repaint
// live mid-visit either, because flattenStatic() has already merged the
// room's geometry into a handful of draws by the time a child could see it
// happen). The instant of the kill gets its own live payoff instead — see
// villageUnshadowLive, fired from the same onAnimate poll that notices the
// room is clear.
const CORRUPT_TINT = 0x2a1a3a;   // exactly enemies.js's moon-weak puffTint
const CORRUPT_D = { tint: CORRUPT_TINT, floorTint: CORRUPT_TINT, wallTint: 0x1c1128,
  propTint: CORRUPT_TINT, ground: 'villageShadow', name: 'THE VILLAGE', hero: 'THE VILLAGE SQUARE' };
const WARM_D = DISTRICTS.village;

const mixHex = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((Math.round(ar + (br - ar) * t) << 16)
        | (Math.round(ag + (bg - ag) * t) << 8)
        | Math.round(ab + (bb - ab) * t));
};

const M = MODULES;

// The six guardians (design doc §3) — all already in KAYKIT_ROSTER/
// MONSTER_ROSTER (enemies.js), so a plain `world.markers.<id>Spots` marker
// is the entire spawn contract; spawnEnemies() does the rest.
export const GUARDIANS = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
export const guardianDown = (g) => !!WS.get(REGION, 'guardian_' + g);
export const guardiansDown = () => GUARDIANS.filter(guardianDown).length;
export const villageCleared = () => guardiansDown() >= GUARDIANS.length;

// A TOWN, NOT A ROOM WITH SHEDS IN IT. Dad, from play: "the town is
// miniaturized and is just a regular room with some tiny houses. I want a
// bigger level, a huge level with proper sized houses in comparison to the
// character. I want it to actually look like a proper town to explore and
// get lost in."
//
// He was right twice over. The hut model is 1.35u tall at scale 1 and was
// placed at 0.85-1.15 — waist-high on a 1.7u child — and the whole region
// was one hub with six pockets hanging straight off it: a star, which is a
// diagram of a town, not a town. Now two full-size STREETS stand between
// the square and the districts, lined with real townhouses (the split
// houses-pack, ~5u tall at street scale), and a lane joins the streets to
// each other so the map is a LOOP a child can actually get lost in and then
// find their own way out of. All six guardians, both pups, every WS key and
// chest id survive unchanged — the town got bigger around them.
export const LV = {
  ysq: { ...M.hub,    kind: 'hub',    district: 'village', spine: true, junction: true,
         label: 'THE VILLAGE SQUARE', beat: 'epilogue · the tree, the well, two streets' },
  yhs: { ...M.island, kind: 'island', district: 'village', spine: true, junction: true,
         label: 'THE HIGH STREET', beat: 'townhouses · three doors north · the lane west' },
  ylw: { ...M.island, kind: 'island', district: 'village', spine: true, junction: true,
         label: 'THE LOW LANES', beat: 'cramped lanes · the lane north · three districts' },
  yg1: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'yhs',
         label: 'THE GATE HOUSE', beat: 'guardian 1/6 · Hollow Sentinel' },
  yg2: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'yhs',
         label: 'THE MARKET ROW', beat: 'guardian 2/6 · Shade Knight' },
  yg3: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'yhs',
         label: 'THE MILL', beat: 'guardian 3/6 · Twinblade Husk' },
  yg4: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ylw',
         label: 'THE BELL TOWER', beat: 'guardian 4/6 · Wraith Archer' },
  yg5: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ylw',
         label: 'THE BACK ALLEY', beat: 'guardian 5/6 · The Lurker' },
  yg6: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ylw',
         label: 'THE CHAPEL ROOF', beat: 'guardian 6/6 · Shadow Dragonling' },
  yrw: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ysq',
         label: 'THE WELL', beat: 'optional · a rescued pup, a chest' },
};

registerDistrictTints(LV, DISTRICTS);

const { shell, sideDoor } = makeBuilders({ kit: () => villageKit, isGrey: () => GREY() });
const { place } = makeDressers({ kit: () => villageKit,
  tint: (gltf, key, t) => tintedModel(gltf, key, t), isGrey: () => GREY() });

// One prop, one call: a throwaway group so `place`'s bounding-box recentring
// (every one of these assetfactory pieces except wall-1/wall-2 sits off its
// own pivot — probe-modelsize.mjs confirmed it) always has something to
// centre without every caller repeating the ceremony.
function placeOne(world, gltf, key, x, z, s, ry, tint) {
  if (GREY() || !gltf) return null;
  const g = new THREE.Group();
  place(world, g, gltf, key, x, 0, z, s, ry, 0, tint, true, true);
  world.add(g);
  // AND IT STANDS ON THE FLOOR. `clutter` has measured and set down every prop
  // it places since the Small Props Pack shipped (see the long note there);
  // placeOne — which puts down the huts, the walls, the towers, the wagons and
  // the townhouses, every STRUCTURE in the Village — never did, and simply
  // trusted each file's own idea of where its origin was. No structure is
  // known to be hanging today; this is the same guard clutter already has, so
  // that the next model added here cannot hang by an authoring convention
  // nobody checked. Every caller below stands on the ground and none of them
  // hangs from anything, so grounding all of them is the whole rule.
  const bb = new THREE.Box3().setFromObject(g);
  if (isFinite(bb.min.y)) g.position.y -= bb.min.y;
  return g;
}

// THE THINGS PEOPLE OWN.
//
// A restored village of huts and walls and nothing else reads as a MODEL of a
// village. What says somebody came back is a cart left where it was unloaded,
// washing out, firewood cut but not stacked. So each street gets a few, chosen
// for what that street is rather than scattered at random.
//
// Two rules, both learned the hard way elsewhere in this file:
//   * Only the things a grown-up could not walk through get a collider. A
//     bucket that stops Kael dead is a bug a five-year-old reads as the game
//     being broken, and the pack is mostly buckets.
//   * `centre: true` on every one. These props are not modelled on their own
//     pivot (Cart_1_A sits well off its origin), and this file already has the
//     scar from Vase.glb being drawn a metre from where it was asked for.
const SOLID_PROPS = new Set(['cart', 'boat', 'trough', 'trough2', 'grinder', 'hearth']);

function clutter(world, D, list) {
  if (GREY() || !villageKit) return;
  for (const [key, ax, az, s = 1, ry = 0, base = 0] of list) {
    const gltf = villageKit[key];
    if (!gltf) continue;
    // INSIDE THE ROOM, WHATEVER THE LIST SAYS.
    //
    // These lists are long lines of hand-typed coordinates, and the Village's
    // rooms come in three sizes. The square's list dresses its south edge out
    // to z 16.5 — a sensible number for a room 16 deep, and the square is 14 —
    // so the washing, the basin, the firewood and a whole cart stood one to
    // two and a half metres PAST the wall, out in the black. Every one of the
    // six guardian pockets carries the same template at pocket scale, with z
    // values out to 9.5 in a room whose half-depth is 8. Measured, not
    // guessed: verify-bounds named seven of them, and reading the lists after
    // that turned up a dozen more sitting exactly on the wall line. It is
    // dad's "objects outside in the black" again, and it will keep happening
    // as long as a typed number can put a prop outside the room it dresses.
    //
    // So the room's own extents are the ruler. A spot outside them is pulled
    // to the wall band rather than dropped: the author was dressing the edge,
    // and an edge prop one metre in is what they meant. verify-bounds still
    // asks the question afterwards, so this cannot quietly paper over a spot
    // that lands somewhere else entirely.
    const lim = (v, half) => (half ? Math.max(-(half - 1.4), Math.min(half - 1.4, v)) : v);
    const x = lim(ax, world.halfW), z = lim(az, world.halfD);
    // ...AND A CLAMP MUST NOT PUT A COLLIDER IN A DOORWAY. Pulling a prop to
    // the wall band puts it exactly where the doors are. Most of this pack is
    // buckets and washing, which nothing walks into — but the square's stray
    // cart sits at x 8, and x 8 is the centre of the Spire stair: clamped
    // straight in, it would have parked a solid collider across the last door
    // in the game, which is a worse bug than the one being fixed. A SOLID prop
    // that lands in a doorway is dropped instead. One less cart in a dressed
    // square is nothing; a door a child cannot walk through is the whole game.
    if (SOLID_PROPS.has(key) && (x !== ax || z !== az)) {
      const inDoor = (world.doors || []).some((d) =>
        x >= d.minX - 1.6 && x <= d.maxX + 1.6 && z >= d.minZ - 1.6 && z <= d.maxZ + 1.6);
      if (inDoor || world.blocked(x, z, 1.2)) continue;
    }
    const g = new THREE.Group();
    place(world, g, gltf, key, x, 0, z, s, ry, 0, D.propTint, true, true);
    world.add(g);
    // STAND IT ON THE FLOOR, WHATEVER ITS PIVOT.
    //
    // `centre: true` fixes the X/Z pivot problem this file already has a scar
    // from (Vase.glb), but says nothing about Y — and this pack contains props
    // modelled to HANG from a hook, whose geometry sits entirely below their
    // origin. Placed at y=0 they measured 1.77u UNDER the floor: the rope coil
    // in the High Street and the drying skin in the Low Lanes were both
    // invisible, buried whole. Measuring the placed group and lifting it until
    // its lowest point rests on `base` grounds every prop by construction, so
    // no future addition can be buried by an authoring convention nobody
    // checked. `base` above 0 is how the ones that really do hang get hung —
    // and the rope coil and the drying skin were hung that way on the first
    // pass, which verify-grounded promptly failed three rooms for. It was
    // right to. Nothing in this game HANGS FROM NOTHING: a coil floating 1.6u
    // up with no peg under it is the same defect dad reported as "floating
    // rocks", and the honest fix was to set them down rather than to widen
    // that suite's allow-list until it stopped asking. A coil of rope on the
    // ground and a stretched hide on its own frame both read fine. `base`
    // stays for a prop hung on something that is actually there.
    const bb = new THREE.Box3().setFromObject(g);
    if (isFinite(bb.min.y)) g.position.y += base - bb.min.y;
    if (SOLID_PROPS.has(key)) {
      const sz = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
      world.addBox(x - sz.x / 2, x + sz.x / 2, z - sz.z / 2, z + sz.z / 2);
    }
  }
}

// STREET SCALE, DERIVED ONCE FROM THE CHARACTER. Kael stands 1.7u; a town
// door should clear his head with room to spare and a house should be a
// storey or two above that. The split townhouses measure ~7.4u tall at scale
// 1 (properly proportioned buildings, unlike the 1.35u-tall hut), so:
const TOWNHOUSE_S = 0.62;   // ~4.6u tall — a real two-storey house beside him
const TOWER_S = 0.75;       // ~10.5u — landmarks visible over the rooflines
const WALL_S = 0.85;        // ~3.6u town wall
const BARN_S = 2.3;         // the 1.35u-tall hut, honest about being a low barn

// A building with its collider COMPUTED from its own rotated footprint —
// colliders typed by hand at one scale are exactly how the old 0.85-scale
// "houses" kept their old boxes through every resize. In both costumes: the
// greybox shows a box of the true footprint, so the layout walked in grey is
// the layout that ships dressed (the levelkit's founding rule).
function townhouse(world, idx, x, z, ry, tint, s = TOWNHOUSE_S) {
  const list = villageKit ? villageKit.townhouses : null;
  const tpl = list && list.length ? list[((idx % list.length) + list.length) % list.length] : null;
  const w = (tpl ? tpl.w : 6.5) * s, d = (tpl ? tpl.d : 6.0) * s, h = (tpl ? tpl.h : 7.4) * s;
  // rotated AABB of the footprint; 0.82 inset keeps eaves from blocking lanes
  const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry));
  const hw = (w * c + d * sn) * 0.5 * 0.82, hd = (w * sn + d * c) * 0.5 * 0.82;
  if (GREY()) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, h, hd * 2),
      new THREE.MeshStandardMaterial({ color: 0x6e5f45, roughness: 0.95 }));
    m.position.set(x, h / 2, z); m.castShadow = true;
    world.add(m);
  } else if (tpl) {
    placeOne(world, tpl, `townhouse${idx}`, x, z, s, ry, tint);
  }
  world.addBox(x - hw, x + hw, z - hd, z + hd);
  return { hw, hd, h };
}

// THE MOMENT A GUARDIAN FALLS. Additive only, exactly like
// stoneRestorationLive/emberRestorationLive (js/rooms.js) — the room's own
// geometry is already flattened into a handful of draw calls by the time
// this fires, so nothing already built can be re-tinted live. What CAN
// happen live is what those two do: new warm light rising in the room the
// child is already standing in. Reused, not reinvented.
function villageUnshadowLive(world, x = 0, z = -2) {
  const spots = [[x - 2.2, z - 0.4], [x + 2.0, z - 1.2], [x + 0.3, z + 1.4]];
  const lights = spots.map(([lx, lz]) => {
    const l = new THREE.PointLight(0xffd9a0, 0, 6.5, 1.9);
    l.position.set(lx, 1.3, lz);
    world.add(l);
    return l;
  });
  const RISE = 1.6;
  let t = 0;
  world.onAnimate((tt, dt) => {
    t += dt;
    const e = Math.min(1, t / RISE);
    const eased = 1 - (1 - e) * (1 - e);
    for (const l of lights) l.intensity = eased * 2.2;
  });
}

function base(scene, id) {
  const spec = LV[id];
  const world = new World(scene);
  world.roomId = id;
  reserveLandings(world, id);
  world.bgColor = 0x1c1810;
  return { world, spec };
}

function finish(world, spec, D) {
  if (GREY()) {
  world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#e8d9b0', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#b8a880', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.solidifyProps();   // drawn obstacles become solid ones
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// ---------------------------------------------------------------------------
// ysq — THE VILLAGE SQUARE. Arrival (from the Den) + hub. No locks: all six
// guardian doors and the reward door are open from the moment this room
// first builds.
// ---------------------------------------------------------------------------
export async function buildYsq(scene) {
  const { world, spec } = base(scene, 'ysq');
  const stage = guardiansDown();
  const blend = stage / GUARDIANS.length;
  // The square itself is never fully corrupted or fully restored — it reads
  // the aggregate of all six streets, continuously, on top of the tree's own
  // discrete 0-6 readout below.
  const D = { tint: mixHex(CORRUPT_TINT, WARM_D.tint, blend),
    floorTint: mixHex(CORRUPT_TINT, WARM_D.floorTint, blend),
    wallTint: mixHex(CORRUPT_D.wallTint, WARM_D.wallTint, blend),
    propTint: mixHex(CORRUPT_TINT, WARM_D.propTint, blend),
    ground: blend >= 0.5 ? 'village' : 'villageShadow',
    name: 'THE VILLAGE', hero: 'THE VILLAGE SQUARE' };
  // THE NEW GRAPH: the square keeps four ways out — the Den behind you, the
  // High Street north, the Low Lanes west, the Well east. The six guardian
  // districts hang off the STREETS now, not off the square: a child crosses
  // real town to reach every fight, which is the entire point of a town.
  const gaps = [
    gap('s'),                       // back to the Den
    gap('n', undefined, 0),         // THE HIGH STREET
    gap('w', undefined, 0),         // THE LOW LANES
    gap('e', undefined, 0),         // THE WELL
    // THE SPIRE STAIR. A SECOND gap on the south wall rather than one on the
    // east, because the Well's door has sat at east-centre since the region
    // shipped. Centre 8, not 12: the first cut used 12 and the extended
    // landings sweep caught what that meant — the corner house (collider
    // x 10.6-15.4, z 6.7-11.3) stood square in front of the doorway, hiding
    // the last door in the game behind a building AND dropping arrivals from
    // the Spire 1.57u inside its wall. At 8 the archway fronts open street.
    gap('s', undefined, 8),
  ];
  const { halfW, halfD } = shell(world, spec, gaps, D, { hub: [0, 0] });
  world.spawn = { x: 0, z: 12, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: -8, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'yhs', { x: 0, z: 10.5, angle: Math.PI }, { centre: 0 });
  sideDoor(world, 'w', halfW, halfD, 'ylw', { x: 13.5, z: 0, angle: -Math.PI / 2 }, { centre: 0 });
  sideDoor(world, 'e', halfW, halfD, 'yrw', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: 0 });
  // THE WAY UP, and the last door in the game. Shut until every guardian is
  // down: the Spire is what the Village is restored FOR, and opening it early
  // would let a child walk past the region they are standing in. The stair is
  // visible the whole time — thresholdGlow spills the Spire's cold violet
  // across it — so it reads as a promise rather than as a wall.
  sideDoor(world, 's', halfW, halfD, 'm1', { x: 0, z: 11, angle: Math.PI },
    { centre: 8, when: villageCleared });

  world.markers.heroSpot = { x: 0, z: 0 };
  world.markers.restSpot = { x: -10, z: -8 };

  // A LIVED-IN SQUARE AT LIVED-IN SCALE: real townhouses facing the tree
  // from the corners the doors don't use, and the old waist-high huts gone.
  townhouse(world, 0, -13, 9, 0.5, D.propTint);
  townhouse(world, 1, 13, 9, -0.5, D.propTint);
  townhouse(world, 2, -13, -9, 2.6, D.propTint);
  townhouse(world, 3, 13, -9, -2.6, D.propTint);
  if (!GREY()) {
    placeOne(world, villageKit.wagons, 'wagons', 8, 4, 1.15, 1.2, D.propTint);
    // THE SQUARE — the market that stopped. A cart still half unloaded by the
    // wagons, sacks beside it, the water trough the whole town shares.
    clutter(world, D, [['cart', 6.2, 6.0, 1.0, 0.6], ['sack', 7.6, 5.0, 1.0, 1.1],
      ['sack', 8.4, 5.6, 1.0, 2.3], ['trough', -7.5, 5.5, 1.0, Math.PI / 2],
      ['bucket', -6.4, 4.4, 1.0, 0.4], ['broom', -8.2, 4.0, 1.0, -0.3]]);
    world.addBox(6.2, 9.8, 1.5, 6.5);
  }

  // THE WELL — a dead tree, not a well: no well asset exists in any
  // vendored pack, and stump.glb was sitting unused. The stump itself never
  // changes; a ring of flowers and bushes grows around it one guardian at a
  // time, so a child glancing at the hub always knows the score without a
  // UI read (design doc §4). Real from day one — guardiansDown() is real
  // state, not a placeholder — so nothing downstream waits on art.
  // TWO THINGS SHORT. The square measured 30 in its arrival frame against a
  // floor of 32 for months — the clutter above is one atlas material and
  // flattenStatic folds it into a handful of batches, so piling on more of it
  // never moved the count (the Market learned the same). Two felled logs by
  // the south way, each its own model and its own collider, are two things.
  if (!GREY()) {
    for (const [x, z, ry] of [[-4.6, 9.4, 0.9], [4.6, 9.2, -1.1]]) {
      if (world.blocked(x, z, 0.9)) continue;
      placeOne(world, villageKit.stump, 'stump', x, z, 1.25, ry, 0x6a5a48);
      world.addCircle(x, z, 0.6);
    }
  }
  world.markers.villageTreeSpot = { x: 0, z: 0 };
  if (!GREY()) {
    placeOne(world, villageKit.stump, 'stump', 0, 0, 5.0, 0.4, 0x5a4a3a);
    world.addCircle(0, 0, 1.1);
    const ringR = 2.3;
    for (let i = 0; i < stage; i++) {
      const a = (i / GUARDIANS.length) * Math.PI * 2 + 0.3;
      const rx = Math.cos(a) * ringR, rz = Math.sin(a) * ringR;
      const bloom = i % 3 === 0 ? villageKit.bush : (i % 2 === 0 ? villageKit.flowerA : villageKit.flowerB);
      const key = i % 3 === 0 ? 'bush' : (i % 2 === 0 ? 'flowerA' : 'flowerB');
      placeOne(world, bloom, key, rx, rz, i % 3 === 0 ? 0.9 : 1.3, a, 0x6fae4a);
    }
  }

      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['cart', -9.0, 9.5, 1.0, 0.3], ['cart', 9.5, 8.0, 1.0, -0.5], ['trough', -10.0, 3.0, 1.0, 0.6], ['trough2', 10.0, 2.5, 1.0, -0.2], ['sack', -8.0, 13.5, 1.0, 0.9], ['bucket', 8.5, 13.0, 1.0, 0], ['coil', -6.0, 5.5, 1.0, 0.4], ['stool', 6.5, 5.0, 1.0, 1.1], ['firewood', -10.5, -0.5, 1.0, 0.2], ['cartwheel', 10.5, -0.5, 1.0, 0.7], ['laundry', -4.0, 15.0, 1.0, -0.3], ['basin', 4.5, 15.5, 1.0, 0.5],
      ['broom', -7.0, 11.0, 1.0, 1.0], ['grinder', 7.5, 10.5, 1.0, -0.4],
      ['stool', -2.5, 7.0, 1.0, 0.8], ['bucket', 2.5, 6.5, 1.0, 0.1],
      ['sack', -11.0, 7.0, 1.0, 0.6], ['coil', 11.0, 6.0, 1.0, -0.7],
      ['trough2', -5.5, 2.0, 1.0, 0.3], ['cartwheel', 5.5, 1.5, 1.0, -0.2],
      ['firewood', -8.5, 16.0, 1.0, 0.4], ['cart', 8.0, 16.5, 1.0, -0.6],
      ['bucket', -3.0, 3.5, 1.0, 0.7], ['sack', 3.0, 3.0, 1.0, -0.4],
      ['stool', -9.5, 12.5, 1.0, 1.0], ['basin', 9.5, 12.0, 1.0, 0.2],
      ['coil', -6.5, 8.5, 1.0, 0.4], ['broom', 6.0, 8.0, 1.0, -0.9],
      ['cartwheel', -1.5, 11.5, 1.0, 0.6], ['sack', 1.5, 12.0, 1.0, -0.2]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE TWO STREETS — the town itself. Both read the aggregate of the three
// guardians that hang off them, the same continuous blend the square uses,
// so a street warms house by house as its districts are freed.
// ---------------------------------------------------------------------------
function streetD(gs) {
  const down = gs.filter(guardianDown).length;
  const blend = down / gs.length;
  return { tint: mixHex(CORRUPT_TINT, WARM_D.tint, blend),
    floorTint: mixHex(CORRUPT_TINT, WARM_D.floorTint, blend),
    wallTint: mixHex(CORRUPT_D.wallTint, WARM_D.wallTint, blend),
    propTint: mixHex(CORRUPT_TINT, WARM_D.propTint, blend),
    ground: blend >= 0.5 ? 'village' : 'villageShadow',
    name: 'THE VILLAGE', hero: 'THE VILLAGE SQUARE' };
}

// THE HIGH STREET: a real street — townhouses shoulder to shoulder down both
// sides, the three north districts opening off the top of it, and the lane
// west to the Low Lanes closing the town loop. The alley BEHIND the east row
// hides a chest: the "get lost and be paid for it" promise, kept.
export async function buildYhs(scene) {
  const { world, spec } = base(scene, 'yhs');
  const D = streetD(['g1', 'g2', 'g3']);
  const { halfW, halfD } = shell(world, spec, [
    gap('s', undefined, 0),
    gap('n', undefined, -10), gap('n', undefined, 0), gap('n', undefined, 10),
    gap('w', undefined, 0),
  ], D, {
    paths: [[[0, 11], [0, -11]], [[-14, 0], [-4, 0], [0, 3]],
            [[-10, -3], [-10, -11]], [[10, -3], [10, -11]]],
  });
  world.spawn = { x: 0, z: 10.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 0, z: -11.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'yg1', { x: 0, z: 6, angle: Math.PI }, { centre: -10 });
  sideDoor(world, 'n', halfW, halfD, 'yg2', { x: 0, z: 6, angle: Math.PI }, { centre: 0 });
  sideDoor(world, 'n', halfW, halfD, 'yg3', { x: 0, z: 6, angle: Math.PI }, { centre: 10 });
  sideDoor(world, 'w', halfW, halfD, 'ylw', { x: 0, z: -10.5, angle: 0 }, { centre: 0 });

  // WEST ROW: three houses fronting the street, gaps left for the lane door.
  townhouse(world, 0, -8.5, 7.5, 1.62, D.propTint);
  townhouse(world, 4, -9.5, -6.5, 1.5, D.propTint);
  // 1.5u east of its first spot (-8.5): there its collider reached x -10.5
  // and ate half the yg1 doorway (centre -10), leaving a 0.7u squeeze into
  // the Gate House street and swallowing the landing from yg1's own door —
  // live since the region shipped, invisible until the landing sweep learned
  // this room existed (the hand-kept-list rot, caught 2026-08-29).
  townhouse(world, 2, -7, -11, 1.7, D.propTint);
  // EAST ROW: three more, pulled off the wall so a real ALLEY runs behind
  // them — nothing marks it, walking it is its own discovery.
  townhouse(world, 1, 9, 7.5, -1.55, D.propTint);
  townhouse(world, 3, 9.5, 0.5, -1.62, D.propTint);
  townhouse(world, 5, 9, -7, -1.5, D.propTint);
  if (!GREY()) {
    placeOne(world, villageKit.wagons, 'wagons', 3, 6, 1.1, 0.25, D.propTint);
    // THE HIGH STREET — the shopfronts. Washing across the gap between two
    // houses is the single loudest "people live here" signal the pack has.
    clutter(world, D, [['laundry', -4.5, 4.2, 1.0, 0.2], ['basin', -3.0, 3.2, 1.0, 0.8],
      ['stool', -2.2, 2.6, 1.0, 1.4], ['coil', 5.5, 5.2, 1.0, 0.9],
      ['firewood', 6.6, 4.4, 1.0, -0.5]]);
    world.addBox(1.3, 4.7, 3.6, 8.4);
  }
  // the alley chest, behind the east row against the wall
  world.markers.chestDefs = [
    { id: 'c_yhs_alley', tier: 'gold', x: 14, z: 0, ry: -1.2,
      loot: { shards: 34, gear: 'staff_moon' } },
  ];
  world.reserve(14, 0, 2.2, 'chest');
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// THE LOW LANES: the cramped half of town. Town walls cut the room into
// crooked lanes; the three remaining districts open off them. A nook in the
// walls holds the second hidden chest.
export async function buildYlw(scene) {
  const { world, spec } = base(scene, 'ylw');
  const D = streetD(['g4', 'g5', 'g6']);
  const { halfW, halfD } = shell(world, spec, [
    gap('e', undefined, 0),
    gap('n', undefined, 0),
    gap('w', undefined, -7), gap('w', undefined, 7),
    gap('s', undefined, 0),
  ], D, {
    paths: [[[14, 0], [4, 0], [-4, -2], [-14, -7]], [[-4, -2], [-14, 7]],
            [[4, 0], [0, -11]], [[0, 2], [0, 11]]],
  });
  world.spawn = { x: 13.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ysq', { x: -15, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'yhs', { x: -13.5, z: 0, angle: Math.PI / 2 }, { centre: 0 });
  sideDoor(world, 'w', halfW, halfD, 'yg4', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: -7 });
  sideDoor(world, 'w', halfW, halfD, 'yg6', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: 7 });
  sideDoor(world, 's', halfW, halfD, 'yg5', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: 0 });

  // the lanes: two runs of town wall and three houses set crooked, so no
  // line of sight runs the whole room — corners, which is what "get lost
  // in" means at this scale
  if (!GREY()) {
    placeOne(world, villageKit.wall1, 'wall1', -4, -5.5, WALL_S, 0.35, D.propTint);
    // THE LOW LANES — the working end of town: the mill stone, firewood, the
    // hides out to dry against the wall.
    clutter(world, D, [['grinder', -6.5, 3.5, 1.0, 0.7], ['firewood', -5.2, 4.4, 1.0, 0.2],
      ['hide', -3.4, -5.0, 1.0, 0.35], ['cartwheel', 5.6, 3.2, 1.0, 0.9]]);
    // THE PITCHFORK IS NOT PLACED, and that is the whole note. Pitchfork_A is
    // two separate top-level objects — a head and a shaft — that only make
    // sense assembled, and assembled the shaft starts 0.42u off the ground
    // with the head under it. clutter() grounds the group it places, so the
    // ASSEMBLY sits on the floor correctly, but verify-grounded reads each
    // top-level object on its own and sees a shaft hanging in the air. Rather
    // than special-case one prop in a suite that exists to catch exactly that
    // shape of thing, it is left out: there are twenty other props and no
    // street needs this one.
    world.addBox(-7.4, -0.6, -6.6, -4.4);
    placeOne(world, villageKit.wall2, 'wall2', 3, 5, WALL_S, -0.5, D.propTint);
    world.addBox(0.1, 5.9, 3.6, 6.4);
  } else {
    world.addBox(-7.4, -0.6, -6.6, -4.4);
    world.addBox(0.1, 5.9, 3.6, 6.4);
  }
  townhouse(world, 6, -9, -10, 0.3, D.propTint);
  townhouse(world, 7, 9.5, -8.5, -2.9, D.propTint);
  townhouse(world, 8, -10, 9.5, 2.8, D.propTint);
  // the nook chest, tucked where the wall meets the south house
  world.markers.chestDefs = [
    { id: 'c_ylw_nook', tier: 'gold', x: -3.5, z: 11, ry: 2.6,
      loot: { shards: 30, armour: 'verdant' } },
  ];
  world.reserve(-3.5, 11, 2.2, 'chest');
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['cart', 5.0, 9.0, 1.0, 0.4], ['cart', 9.0, -9.5, 1.0, -0.6], ['trough', 12.0, 7.5, 1.0, 0.2], ['trough2', 3.0, -8.0, 1.0, 0.7], ['sack', 15.0, 4.0, 1.0, 0], ['bucket', 14.0, -4.5, 1.0, 0.3], ['coil', 7.0, 6.0, 1.0, -0.4], ['stool', 6.0, -5.0, 1.0, 1.2], ['firewood', 16.5, 8.0, 1.0, 0.5], ['cartwheel', 2.0, 6.5, 1.0, -0.2], ['laundry', 11.0, -7.0, 1.0, 0.8], ['grinder', 16.0, -8.0, 1.0, 0.1]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// Six guardian pockets — each a named structure, tinted corrupted or
// restored by whether ITS OWN guardian has fallen, plus a live warm-light
// bloom the instant it does.
// ---------------------------------------------------------------------------
export async function buildYg1(scene) {
  const { world, spec } = base(scene, 'yg1');
  const cleared = guardianDown('g1');
  const D = cleared ? WARM_D : CORRUPT_D;
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {});
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  // THE TRIGGER LIVES IN THE GAP, AND THE GAP IS AT CENTRE 0. Five of the six
  // guardian pockets shipped from the big-town rebuild with their STREET-side
  // door centre (±10 along the High Street, ±7 along the Lanes) mirrored onto
  // their own exit wall — where the shell's gap is cut at the default centre.
  // Result: a door trigger buried in solid wall at the room's corner, and an
  // open hole at centre 0 with nothing solid and nothing firing — a walk into
  // the black nothing, the exact v3.47 class. yg2 aligned only because its
  // street slot happens to BE 0. Caught by probe-openholes the first night it
  // knew these rooms existed (2026-08-29).
  sideDoor(world, 's', halfW, halfD, 'yhs', { x: -10, z: -10.5, angle: 0 });
  // THE GATE HOUSE: the keeper's hut to one side, a stretch of wall behind
  // the sentinel — the "already know this shape" gate Hollow Sentinel's own
  // shieldUp block borrows from Stoneroot (design doc §3).
  if (!GREY()) {
    placeOne(world, villageKit.hut, 'hut', -5.5, -4.5, 1.9, 0.9, D.propTint);
    clutter(world, D, [['trough2', -3.0, -3.2, 1.0, 0.9], ['bucket', -1.8, -2.4, 1.0, 0.2],
      ['sack', -4.4, -2.8, 1.0, 1.7]]);
    world.addBox(-10, -1, -8, -1);
    placeOne(world, villageKit.wall1, 'wall1', 6, -6.5, WALL_S, Math.PI / 2, D.propTint);
    world.addBox(2.6, 9.4, -7.7, -5.3);
  }
  world.markers.hollowSentinelSpots = [{ x: 0, z: -4 }];
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['cart', -8.5, 6.0, 1.0, 0.4], ['trough', 8.0, 5.0, 1.0, -0.3], ['sack', -7.0, 1.5, 1.0, 0.8], ['bucket', 7.5, 1.0, 1.0, 0], ['stool', -9.0, -3.0, 1.0, 1.1], ['coil', 8.5, -3.5, 1.0, 0.2], ['cartwheel', -6.5, 9.0, 1.0, 0.6], ['laundry', 6.5, 8.5, 1.0, -0.5], ['firewood', -9.5, -6.0, 1.0, 0.3], ['basin', 9.0, -6.5, 1.0, 0.7]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g1') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) {
      WS.set(REGION, 'guardian_g1');
      villageUnshadowLive(world, 0, -4);
    }
  });
  return finish(world, spec, D);
}

export async function buildYg2(scene) {
  const { world, spec } = base(scene, 'yg2');
  const cleared = guardianDown('g2');
  const D = cleared ? WARM_D : CORRUPT_D;
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {});
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'yhs', { x: 0, z: -10.5, angle: 0 }, { centre: 0 });
  // THE MARKET ROW: a cart left mid-sale, a stall never opened again.
  if (!GREY()) {
    placeOne(world, villageKit.wagons, 'wagons', -6, -2, 1.15, 0.4, D.propTint);
    world.addBox(-8.8, -3.2, -4.9, 0.9);
    townhouse(world, 4, 6.5, -5, -0.5, D.propTint, 0.55);
  }
  world.markers.pupSpot = { x: -6, z: 4, id: 'pup_y2' };
  world.markers.shadeKnightSpots = [{ x: 0, z: -4 }];
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['trough2', -8.0, 5.5, 1.0, -0.4], ['cart', 8.5, 6.5, 1.0, 0.5], ['bucket', -7.5, 2.0, 1.0, 0], ['sack', 7.0, 1.5, 1.0, 0.9], ['broom', -9.0, -2.5, 1.0, 1.0], ['stool', 8.0, -3.0, 1.0, -0.8], ['coil', -6.5, 8.5, 1.0, 0.2], ['firewood', 6.0, 9.0, 1.0, 0.4], ['grinder', -9.5, -6.5, 1.0, 0.6], ['cartwheel', 9.0, -6.0, 1.0, -0.2]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g2') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) {
      WS.set(REGION, 'guardian_g2');
      villageUnshadowLive(world, 0, -4);
    }
  });
  return finish(world, spec, D);
}

export async function buildYg3(scene) {
  const { world, spec } = base(scene, 'yg3');
  const cleared = guardianDown('g3');
  const D = cleared ? WARM_D : CORRUPT_D;
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {});
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'yhs', { x: 10, z: -10.5, angle: 0 });
  // THE MILL: the hut IS the millhouse; the wheel is architecture, not a
  // creature, so it is a primitive rather than a new model — same reasoning
  // as frostBramble/valeBramble (js/level5.js, js/level6.js).
  let wheel = null;
  if (!GREY()) {
    placeOne(world, villageKit.hut, 'hut', -5, -5, 1.7, 0.4, D.propTint);
    clutter(world, D, [['hearth', -3.2, -3.4, 1.0, 0.4], ['stool', -2.0, -2.6, 1.0, 1.1],
      ['firewood', -4.2, -2.2, 1.0, -0.6]]);
    world.addBox(-9.3, -0.7, -8, -2);
    const wg = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.16, 6, 14),
      new THREE.MeshStandardMaterial({ color: D.propTint, roughness: 0.9 }));
    wg.add(rim);
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12),
        new THREE.MeshStandardMaterial({ color: D.propTint, roughness: 0.9 }));
      spoke.rotation.z = (i / 6) * Math.PI;
      wg.add(spoke);
    }
    wg.position.set(-2.2, 1.4, -5.2);
    wg.rotation.y = Math.PI / 2;
    world.add(wg);
    wheel = wg;
  }
  if (wheel) {
    let spin = 0;
    world.onAnimate((tt, dt) => { spin += dt * 0.4; wheel.rotation.x = spin; });
  }
  world.markers.twinbladeHuskSpots = [{ x: 0, z: -4 }];
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['cart', -8.0, 6.5, 1.0, 0.3], ['laundry', 8.0, 5.5, 1.0, -0.6], ['basin', -7.5, 1.5, 1.0, 0.8], ['trough', 7.5, 1.0, 1.0, 0], ['sack', -9.0, -3.0, 1.0, 0.5], ['bucket', 8.5, -3.5, 1.0, 0.2], ['stool', -6.0, 9.0, 1.0, 1.2], ['coil', 6.5, 8.5, 1.0, -0.3], ['cartwheel', -9.5, -6.5, 1.0, 0.7], ['firewood', 9.0, -6.0, 1.0, 0.4]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g3') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) {
      WS.set(REGION, 'guardian_g3');
      villageUnshadowLive(world, 0, -4);
    }
  });
  return finish(world, spec, D);
}

export async function buildYg4(scene) {
  const { world, spec } = base(scene, 'yg4');
  const cleared = guardianDown('g4');
  const D = cleared ? WARM_D : CORRUPT_D;
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {});
  // FACING ACROSS THE ROOM, NOT AT THE NEAREST WALL. This spawned 6u from one
  // side LOOKING AT IT — 7u of room ahead out of 26, with everything in the
  // street behind the player's shoulder. Its three sisters yg1-yg3 spawn at
  // (0, 6) facing -z and get 17u, which is what a first impression is supposed
  // to be. Measured 2026-09-03 after verify-density read this room as showing
  // ZERO things on arrival: not an empty room, a room seen backwards.
  world.spawn = { x: -6, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ylw', { x: -13.5, z: -7, angle: Math.PI / 2 });
  // THE BELL TOWER: real height, real sightlines — the design doc's own
  // reason a ranged kiter belongs here rather than on open ground.
  if (!GREY()) {
    placeOne(world, villageKit.tower2, 'tower2', 4, -4, TOWER_S, 0, D.propTint);
    clutter(world, D, [['target', 6.5, -1.5, 1.0, 0.3], ['manikin', 7.6, -2.6, 1.0, -0.4],
      ['coil', 5.4, -2.8, 1.0, 0.8]]);
    world.addBox(1.9, 6.1, -6.1, -1.9);
  }
  world.markers.wraithArcherSpots = [{ x: 4, z: 0 }];
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['cart', -8.5, 6.5, 1.0, 0.4], ['trough', -7.0, -6.5, 1.0, -0.3], ['sack', -2.0, 8.0, 1.0, 0.8], ['bucket', -1.5, -8.0, 1.0, 0], ['coil', 3.0, 7.5, 1.0, 0.2], ['stool', 2.5, -7.5, 1.0, 1.1], ['firewood', -9.5, 1.5, 1.0, 0.6], ['cartwheel', 5.5, 5.5, 1.0, -0.5], ['basin', 5.0, -5.0, 1.0, 0.3], ['laundry', -4.5, 9.5, 1.0, 0.7]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g4') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) {
      WS.set(REGION, 'guardian_g4');
      villageUnshadowLive(world, 4, 0);
    }
  });
  return finish(world, spec, D);
}

export async function buildYg5(scene) {
  const { world, spec } = base(scene, 'yg5');
  const cleared = guardianDown('g5');
  const D = cleared ? WARM_D : CORRUPT_D;
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {});
  // FACING ACROSS THE ROOM, NOT AT THE NEAREST WALL. This spawned 6u from one
  // side LOOKING AT IT — 7u of room ahead out of 26, with everything in the
  // street behind the player's shoulder. Its three sisters yg1-yg3 spawn at
  // (0, 6) facing -z and get 17u, which is what a first impression is supposed
  // to be. Measured 2026-09-03 after verify-density read this room as showing
  // ZERO things on arrival: not an empty room, a room seen backwards.
  world.spawn = { x: -6, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ylw', { x: 0, z: 10.5, angle: Math.PI });
  // THE BACK ALLEY: cramped on purpose — the one guardian that can be
  // approached quietly wants corners to be approached quietly FROM.
  if (!GREY()) {
    // the alley's terrace: two REAL townhouses instead of the whole
    // houses-pack strip squeezed to 0.34 — the exact miniaturisation dad named
    townhouse(world, 5, -5, -6, 0.15, D.propTint, 0.55);
    townhouse(world, 7, 2.5, -6.2, -0.15, D.propTint, 0.55);
    placeOne(world, villageKit.wall2, 'wall2', 3, 3, WALL_S, Math.PI / 2, D.propTint);
    // THE WATERSIDE END — the boat frame nobody finished, rods, fish drying.
    clutter(world, D, [['boat', -6.5, -4.5, 1.0, 0.5], ['rod', -4.0, -5.4, 1.0, 1.2],
      ['fish', -8.0, -3.0, 1.0, 0.2], ['basin', -3.2, -3.6, 1.0, 0.6]]);
    world.addBox(-0.4, 6.4, 2.4, 3.6);
  }
  world.markers.pupSpot = { x: -6, z: 4, id: 'pup_y3' };
  world.markers.lurkerSpots = [{ x: 4, z: 0 }];
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['trough2', -8.0, 6.0, 1.0, -0.4], ['cart', -6.5, -7.0, 1.0, 0.5], ['bucket', -1.5, 8.5, 1.0, 0], ['sack', -2.5, -8.0, 1.0, 0.9], ['broom', 3.5, 7.0, 1.0, 1.0], ['stool', 2.0, -7.0, 1.0, -0.8], ['coil', -9.5, 2.0, 1.0, 0.2], ['grinder', 5.0, 5.0, 1.0, 0.4], ['firewood', 4.5, -5.5, 1.0, 0.6], ['cartwheel', -4.0, 9.5, 1.0, -0.2]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g5') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) {
      WS.set(REGION, 'guardian_g5');
      villageUnshadowLive(world, 4, 0);
    }
  });
  return finish(world, spec, D);
}

export async function buildYg6(scene) {
  const { world, spec } = base(scene, 'yg6');
  const cleared = guardianDown('g6');
  const D = cleared ? WARM_D : CORRUPT_D;
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {});
  // FACING ACROSS THE ROOM, NOT AT THE NEAREST WALL. This spawned 6u from one
  // side LOOKING AT IT — 7u of room ahead out of 26, with everything in the
  // street behind the player's shoulder. Its three sisters yg1-yg3 spawn at
  // (0, 6) facing -z and get 17u, which is what a first impression is supposed
  // to be. Measured 2026-09-03 after verify-density read this room as showing
  // ZERO things on arrival: not an empty room, a room seen backwards.
  world.spawn = { x: 6, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ylw', { x: -13.5, z: 7, angle: Math.PI / 2 });
  // THE CHAPEL ROOF: the region's second, distinct tower (tower-3, not
  // tower-2 again) — height for the region's one aerial fight.
  if (!GREY()) {
    placeOne(world, villageKit.tower3, 'tower3', -4, -4, TOWER_S, 0, D.propTint);
    world.addBox(-6.1, -1.9, -6.1, -1.9);
  }
  world.markers.shadowDragonlingSpots = [{ x: -4, z: 0 }];
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['cart', 8.5, 6.5, 1.0, -0.4], ['trough', 7.0, -6.5, 1.0, 0.3], ['sack', 2.0, 8.0, 1.0, -0.8], ['bucket', 1.5, -8.0, 1.0, 0], ['coil', -3.0, 7.5, 1.0, -0.2], ['stool', -2.5, -7.5, 1.0, 1.1], ['firewood', 9.5, 1.5, 1.0, 0.6], ['cartwheel', -5.5, 5.5, 1.0, 0.5], ['basin', -5.0, -5.0, 1.0, 0.3], ['laundry', 4.5, 9.5, 1.0, -0.7]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g6') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) {
      WS.set(REGION, 'guardian_g6');
      villageUnshadowLive(world, -4, 0);
    }
  });
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// yrw — THE WELL. The one non-combat room: a rescued pup, a visible chest.
// Always warm — nothing here was ever corrupted.
// ---------------------------------------------------------------------------
export async function buildYrw(scene) {
  const { world, spec } = base(scene, 'yrw');
  const D = WARM_D;
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {});
  // FACING ACROSS THE ROOM, NOT AT THE NEAREST WALL. This spawned 6u from one
  // side LOOKING AT IT — 7u of room ahead out of 26, with everything in the
  // street behind the player's shoulder. Its three sisters yg1-yg3 spawn at
  // (0, 6) facing -z and get 17u, which is what a first impression is supposed
  // to be. Measured 2026-09-03 after verify-density read this room as showing
  // ZERO things on arrival: not an empty room, a room seen backwards.
  world.spawn = { x: 6, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ysq', { x: 15, z: 0, angle: -Math.PI / 2 }, { centre: 0 });
  // the well-keeper's barn — the hut at the scale it honestly is
  if (!GREY()) {
    placeOne(world, villageKit.hut, 'hut', 3.5, -5, BARN_S, -0.3, D.propTint);
    world.addBox(-2.2, 9.2, -9.6, -0.6);
  } else {
    world.addBox(-2.2, 9.2, -9.6, -0.6);
  }
  world.markers.pupSpot = { x: -4, z: 0, id: 'pup_village' };
  world.markers.chestDefs = [
    { id: 'c_yrw', tier: 'gold', x: -2, z: 3, ry: 0.6, loot: { shards: 30, heartPiece: 1 } },
  ];
      // A STREET WITH NOTHING IN IT. Measured on arrival 2026-09-03 after this
    // suite was finally pointed at the Village at all; the middle is left open
    // because five of these rooms hold a guardian fight, so the goods line the
    // edges the way a real street's do.
    clutter(world, D, [['trough2', 8.0, 6.0, 1.0, 0.4], ['cart', 6.5, -7.0, 1.0, -0.5], ['bucket', 1.5, 8.5, 1.0, 0], ['sack', 2.5, -8.0, 1.0, -0.9], ['broom', -3.5, 7.0, 1.0, 1.0], ['stool', -2.0, -7.0, 1.0, 0.8], ['coil', 9.5, 2.0, 1.0, -0.2], ['grinder', -5.0, 5.0, 1.0, 0.4], ['firewood', -4.5, -5.5, 1.0, 0.6], ['cartwheel', 4.0, 9.5, 1.0, 0.2], ['laundry', -7.5, -2.0, 1.0, 0.5], ['basin', 7.5, -3.0, 1.0, -0.3]]);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export const LEVELVILLAGE_ROOMS = {
  ysq: buildYsq, yhs: buildYhs, ylw: buildYlw,
  yg1: buildYg1, yg2: buildYg2, yg3: buildYg3,
  yg4: buildYg4, yg5: buildYg5, yg6: buildYg6,
  yrw: buildYrw,
};
