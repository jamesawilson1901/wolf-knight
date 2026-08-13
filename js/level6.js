// LEVEL 6 — THE SUNKEN VALE, built to design/LEVEL-DESIGN-6.md.
//
// Topology: A LAGOON. Four shores around one great flooded bowl. Until the Tide
// Wolf, the water in the middle is a wall you can see across and you walk the
// rim the long way; after it, the lagoon IS the road and every shore is one
// crossing from every other.
//
// This is the only level whose SHAPE changes when the child is given the gift.
// Level 2 taught that returning somewhere is progress; this is the same lesson
// at the size of a whole region, and it is the last new shape the game needs.
//
// The hidden spine still holds: the rim is a complete walkable loop, so a child
// who never works out what the lagoon is for still finishes the region. The
// crossing is a shortcut everywhere except into the Deep, which is the boss door
// and is supposed to need the gift.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { loadGLB } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow, potSpotsOrFewer,
  reserveLandings } from './levelkit.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { makeDressers } from './dressing.js';
import { registerDistrictTints } from './districts.js';
import { waterZone, buildWaterField, quenchable, canWade } from './water.js';

let valeKit = null;
const GREY = () => !valeKit || state.settings.greybox !== false;

export const REGION = 'vale';

// ---------------------------------------------------------------------------
// THE SHORES. Not a gradient this time — four places that drowned differently.
// A child always knows which shore they are on by its colour, and the lagoon
// between them is the one thing that looks the same from all four.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  shallows: { tint: 0x6fbfc4, floorTint: 0x6a8a84, wallTint: 0x2a3f42, propTint: 0x84a09a,
              ground: 'shallows', name: 'THE SHALLOWS',      hero: 'THE DROWNED GATE' },
  reeds:    { tint: 0x8fae5e, floorTint: 0x6f7f52, wallTint: 0x2f3a26, propTint: 0x8a9464,
              ground: 'reeds',    name: 'THE REEDBEDS',      hero: "THE FISHER'S RUIN" },
  town:     { tint: 0x7f8fb0, floorTint: 0x5f6a80, wallTint: 0x282f3d, propTint: 0x8a90a4,
              ground: 'town',     name: 'THE DROWNED TOWN',  hero: 'THE SUNKEN HALL' },
  salt:     { tint: 0xd8cfae, floorTint: 0xa89f86, wallTint: 0x4a4438, propTint: 0xc0b69a,
              ground: 'salt',     name: 'THE SALT FLATS',    hero: 'THE WHALE-BONES' },
  lagoon:   { tint: 0x2f7f96, floorTint: 0x2a5a6e, wallTint: 0x142a35, propTint: 0x4f8496,
              ground: 'lagoon',   name: 'THE LAGOON',        hero: 'THE OPEN WATER' },
  deep:     { tint: 0x1d5a72, floorTint: 0x23485c, wallTint: 0x0f2530, propTint: 0x3f6f84,
              ground: 'deepvale', name: "MERI'S DEEP",       hero: 'THE DROWNED THRONE' },
};

// Two new modules. The RIM is a shore path — shorter than a Stormreach stair
// because you are walking round a bowl, not up a cliff. The LAGOON is the
// biggest space in the game and has to be: its whole job is to be a distance you
// could not cross.
const RIM = { w: 22, d: 14 };
const LAGOON = { w: 34, d: 30 };

const M = MODULES;
export const L6 = {
  // ---- EAST · THE SHALLOWS ------------------------------------------------
  d1a: { ...M.island, kind: 'island', district: 'shallows', spine: true, junction: true,
         label: '1A · THE SHALLOWS', beat: 'down out of the cliffs · the vale is under water' },
  d1b: { ...M.island, kind: 'island', district: 'shallows', spine: true,
         label: '1B · THE SHALLOWS', beat: 'first Tide Blobs · THE LOCK IS SHOWN' },
  d1p: { ...M.pocket, kind: 'pocket', district: 'shallows', loopsTo: 'd1b',
         label: 'The Boathouse', beat: 'optional · pup' },
  dg1: { ...RIM, kind: 'rim', district: 'shallows', spine: true,
         label: 'THE EAST RIM', beat: 'REST · round the bowl' },

  // ---- NORTH · THE REEDBEDS -----------------------------------------------
  d2a: { ...M.island, kind: 'island', district: 'reeds', spine: true, junction: true,
         label: '2A · THE REEDBEDS', beat: "the fisher's ruin · gulls" },
  d2b: { ...M.island, kind: 'island', district: 'reeds', spine: true,
         label: '2B · THE REEDBEDS', beat: 'waist deep · the water has things in it' },
  d2p: { ...M.pocket, kind: 'pocket', district: 'reeds', loopsTo: 'd2a',
         label: 'The Eel Pool', beat: 'optional · chest' },
  dsh: { ...M.pocket, kind: 'pocket', district: 'reeds', spine: true,
         label: "MERI'S SPRING", beat: 'TIDE WOLF · INTRODUCE' },
  dg2: { ...RIM, kind: 'rim', district: 'reeds', spine: true,
         label: 'THE NORTH RIM', beat: 'DEVELOP · shallow, deep, shallow' },

  // ---- WEST · THE DROWNED TOWN --------------------------------------------
  d3a: { ...M.island, kind: 'island', district: 'town', spine: true, junction: true,
         label: '3A · THE DROWNED TOWN', beat: 'streets under the water' },
  d3b: { ...M.island, kind: 'island', district: 'town', spine: true,
         label: '3B · THE DROWNED TOWN', beat: 'the drowned, and what they still guard' },
  d3p: { ...M.pocket, kind: 'pocket', district: 'town', loopsTo: 'd3a',
         label: 'The Counting House', beat: 'optional · pup' },
  dtp: { ...M.island, kind: 'island', district: 'town', spine: true,
         label: 'THE TIDE POOLS', beat: 'THE PUZZLE ROOM · TWIST' },
  dg3: { ...RIM, kind: 'rim', district: 'town', spine: true,
         label: 'THE WEST RIM', beat: 'REST · round the bowl' },

  // ---- SOUTH · THE SALT FLATS ---------------------------------------------
  d4a: { ...M.island, kind: 'island', district: 'salt', spine: true, junction: true,
         label: '4A · THE SALT FLATS', beat: 'the whale-bones · the water is going out' },
  d4b: { ...M.island, kind: 'island', district: 'salt', spine: true,
         label: '4B · THE SALT FLATS', beat: 'THE LOCK GATE · CONCLUDE' },
  d4p: { ...M.pocket, kind: 'pocket', district: 'salt', loopsTo: 'd4b',
         label: 'The Salt Cellar', beat: 'optional · chest' },
  dg4: { ...RIM, kind: 'rim', district: 'salt', spine: true,
         label: 'THE SOUTH RIM', beat: 'REST · before the deep' },

  // ---- THE WATER ITSELF ---------------------------------------------------
  // The hub that does not exist until the gift does. Reachable from all four
  // shores, and from nowhere at all before the Tide Wolf.
  dlg: { ...LAGOON, kind: 'lagoon', district: 'lagoon', spine: false, junction: true,
         label: 'THE LAGOON', beat: 'THE ROAD, once you can walk it' },

  // ---- MERI'S DEEP --------------------------------------------------------
  ddp: { ...M.arena, kind: 'arena', district: 'deep', spine: true,
         label: "MERI'S DEEP", beat: 'MERI, THE DROWNED' },
};

registerDistrictTints(L6, DISTRICTS);

// The rim, clockwise, as it must be walkable WITHOUT the gift.
export const RIM_PATH = [
  'd1a', 'd1b', 'dg1',
  'd2a', 'd2b', 'dsh', 'dg2',
  'd3a', 'd3b', 'dtp', 'dg3',
  'd4a', 'd4b', 'dg4',
  'ddp',
];

export const TEACH = [
  { step: 'introduce', room: 'dsh', marker: 'teachDeep',
    what: 'the spring — the gift, and one channel of deep water between it and the door' },
  { step: 'develop', room: 'dg2', marker: 'developDepths',
    what: 'the north rim — shallow, then deep, then shallow: depth is a thing to LOOK at' },
  { step: 'twist', room: 'dtp', marker: 'poolBraziers',
    what: 'THE TIDE POOLS — the splash puts fires OUT, so region one\'s tool is undone by region six\'s' },
  { step: 'conclude', room: 'd4b', marker: 'lockGate',
    what: 'the lock gate — a deep crossing with the pack waiting on the far side' },
];

// ---------------------------------------------------------------------------
// THE VALE KIT. Every file already vendored. No new bytes, same deal as Levels
// 3 and 5. There are no boats, nets or fish in any pack, so the Vale has none:
// what drowned here is a TOWN, and the ruin vocabulary draws towns.
// ---------------------------------------------------------------------------
export async function loadValeKit() {
  if (valeKit) return valeKit;
  const names = {
    floor:    './assets/env/floor-tile.glb',
    cliff:    './assets/env/cliff-block.glb',
    rockLA:   './assets/env/rock-large-a.glb',
    rockLB:   './assets/env/rock-large-b.glb',
    rockLC:   './assets/env/rock-large-c.glb',
    rockSA:   './assets/env/rock-small-a.glb',
    rockSB:   './assets/env/rock-small-b.glb',
    bridge:   './assets/env/bridge-stone.glb',
    pillar:   './assets/env/pillar.glb',
    stump:    './assets/env/stump.glb',
    logStack: './assets/env/log-stack.glb',
    bush:     './assets/env/bush-large.glb',
    treeA:    './assets/env/tree-a.glb',
    treeB:    './assets/env/tree-b.glb',
    flowerA:  './assets/env/flower-a.glb',
    flowerB:  './assets/env/flower-b.glb',
    mushG:    './assets/env/mushroom-group.glb',
    grassQ1:  './assets/env/forest/Grass_1_A.gltf',
    grassQ2:  './assets/env/forest/Grass_2_B.gltf',
    bushQ1:   './assets/env/forest/Bush_1_A.gltf',
    rockQ1:   './assets/env/forest/Rock_1_F.gltf',
    rockQ2:   './assets/env/forest/Rock_2_C.gltf',
    // the town that drowned
    arch:     './assets/env/dungeon/Arch.glb',
    archDoor: './assets/env/dungeon/Arch_Door.glb',
    archBars: './assets/env/dungeon/Arch_bars.glb',
    column:   './assets/env/dungeon/Column.glb',
    column2:  './assets/env/dungeon/Column2.glb',
    wallMod:  './assets/env/dungeon/Wall_Modular.glb',
    wallCov:  './assets/env/dungeon/WallCover_Modular.glb',
    decoWall: './assets/env/dungeon/Decorative_Wall.glb',
    brick:    './assets/env/dungeon/Brick.glb',
    barrel:   './assets/env/dungeon/Barrel.glb',
    crate:    './assets/env/dungeon/Crate.glb',
    vase:     './assets/env/dungeon/Vase.glb',
    skull:    './assets/env/dungeon/Skull.glb',
    coins:    './assets/env/dungeon/Coin_Pile.glb',
    pedestal: './assets/env/dungeon/Pedestal.glb',
    torch:    './assets/env/dungeon/Torch.glb',
    woodfire: './assets/env/dungeon/Woodfire.glb',
    stairs:   './assets/env/dungeon/Stairs_Modular.glb',
    horse:    './assets/env/dungeon/Statue_Horse.glb',
    cobweb:   './assets/env/dungeon/Cobweb.glb',
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  valeKit = Object.fromEntries(entries);
  return valeKit;
}

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward } =
  makeBuilders({ kit: () => valeKit, isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

const { ruinedHome, coldHearth, fallenColumn, rubbleField, wayshrine, aftermath,
  cartWreck, lowWall, place } =
  makeDressers({ kit: () => valeKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

// ---------------------------------------------------------------------------
// PIECES
// ---------------------------------------------------------------------------

function base(scene, id) {
  const spec = L6[id];
  const world = new World(scene);
  world.bgColor = 0x0e2530;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  world._waterMeshes = buildWaterField(world);
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#cfeef2', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#8fb0b4', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// Salt-bleached, same trick Stormreach needed: one propTint for a whole shore
// reads as a single grey object, and it batches into so few buckets that a full
// room measures empty. Four steps, not a continuum.
function washed(D, k) {
  const a = D.propTint, b = 0xcfd8d4;
  // QUANTISED TO FOUR STEPS, always. Stormreach learned this twice: a unique
  // tint per cluster is a unique material per cluster, nothing merges, and the
  // draw calls run away — d1b hit 151 against a ceiling of 125 the first time
  // this took a continuous k. Callers may pass anything; four is what comes out.
  const q = Math.round(Math.max(0, Math.min(1, k)) * 3) / 3;
  const t = q * 0.55;
  const mix = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return { ...D, propTint: (mix(16) << 16) | (mix(8) << 8) | mix(0) };
}

const JUNCTION_HERO = { x: 0, z: 0 };

function heroProp(world, x, z, kind, D) {
  world.heroMarks.push({ x, z });
  world.reserve(x, z, 3.4, 'hero:' + kind);
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 4.0, 6),
      new THREE.MeshStandardMaterial({ color: D.tint, roughness: 1 })
    );
    m.position.set(x, 2.0, z);
    world.add(m);
    world.addCircle(x, z, 1.2, 'hero');
    return m;
  }
  const g = new THREE.Group();
  const P = D.propTint, W = D.wallTint;
  if (kind === 'drownedgate') {
    place(world, g, valeKit.arch, 'arch', x, 0, z, 2.2, 0, 0, P);
    place(world, g, valeKit.column, 'column', x - 3.2, 0, z + 0.5, 1.8, 0.4, 0.05, P);
    place(world, g, valeKit.column2, 'column2', x + 3.1, 0, z - 0.4, 1.7, 1.3, -0.07, P);
    place(world, g, valeKit.brick, 'brick', x + 1.4, 0, z + 2.4, 1.2, 0.6, 0, W, false);
    world.addCircle(x, z, 1.5, 'hero');
  } else if (kind === 'fisherruin') {
    place(world, g, valeKit.wallMod, 'wallMod', x - 1.6, 0, z, 1.7, 0, 0, W);
    place(world, g, valeKit.wallMod, 'wallMod', x + 1.8, 0, z + 0.4, 1.6, 0.2, 0.1, W);
    place(world, g, valeKit.archDoor, 'archDoor', x, 0, z + 2.6, 1.8, Math.PI, 0, P);
    place(world, g, valeKit.barrel, 'barrel', x + 2.8, 0, z + 2.2, 1.1, 0.8, 0, P, false);
    place(world, g, valeKit.crate, 'crate', x - 2.9, 0, z + 2.4, 1.0, 2.1, 0, P, false);
    world.addCircle(x, z, 1.6, 'hero');
  } else if (kind === 'sunkenhall') {
    for (let i = 0; i < 6; i++) {
      const px = x - 4.5 + (i % 3) * 4.5, pz = z + (i < 3 ? -2.2 : 2.2);
      place(world, g, i % 2 ? valeKit.column : valeKit.column2, 'hcol' + (i % 2),
        px, 0, pz, 1.6, i * 0.9, (i % 3) * 0.05, P);
      world.addCircle(px, pz, 0.6, 'hero');
    }
    place(world, g, valeKit.pedestal, 'pedestal', x, 0, z, 1.7, 0, 0, P);
  } else if (kind === 'whalebones') {
    // ribs: bridge slabs stood on end in two curving rows. No whale model
    // exists; a ribcage of stone is what the salt left, and it is honest.
    for (let i = 0; i < 8; i++) {
      const t = (i / 7) * 2 - 1;
      const px = x + t * 6.2, pz = z + Math.abs(t) * 1.6;
      const m1 = place(world, g, valeKit.bridge, 'bridge', px, 0, pz - 2.0, 0.8, 0, 0, washed(D, 1).propTint);
      const m2 = place(world, g, valeKit.bridge, 'bridge', px, 0, pz + 2.0, 0.8, 0, 0, washed(D, 1).propTint);
      if (m1) m1.rotation.z = 1.1 - Math.abs(t) * 0.3;
      if (m2) m2.rotation.z = -1.1 + Math.abs(t) * 0.3;
      world.addCircle(px, pz - 2.0, 0.5, 'hero');
      world.addCircle(px, pz + 2.0, 0.5, 'hero');
    }
  } else if (kind === 'throne') {
    place(world, g, valeKit.pedestal, 'pedestal', x, 0, z, 2.2, 0, 0, P);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8;
      const px = x + Math.cos(a) * 9.8, pz = z + Math.sin(a) * 9.8;
      place(world, g, i % 2 ? valeKit.column : valeKit.pillar, 'tcol' + (i % 2),
        px, 0, pz, 1.5, a, 0.05, P);
      world.addCircle(px, pz, 1.1, 'hero');
    }
  }
  world.add(g);
  return g;
}

// A brazier standing in the tide pools — lit, blocking, and put out by a splash.
function poolBrazier(world, x, z, id, D, onOut) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff5a2b, emissiveIntensity: 1.2, roughness: 1 })
    );
    m.position.y = 0.8;
    g.add(m);
  } else {
    place(world, g, valeKit.woodfire, 'woodfire', 0, 0, 0, 1.5, 0, 0, D.propTint);
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.9, 7),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa03a, emissiveIntensity: 2.4, roughness: 1 })
  );
  flame.position.y = 1.0;
  g.add(flame);
  const light = new THREE.PointLight(0xffa03a, 3.2, 9, 1.8);
  light.position.set(0, 1.3, 0);
  g.add(light);
  world.add(g);
  world.addCircle(x, z, 0.8, 'brazier');
  world.reserve(x, z, 2.2, 'brazier');
  world.onAnimate((t) => {
    if (!flame.visible) return;
    flame.scale.setScalar(0.9 + Math.sin(t * 9 + x) * 0.12);
    light.intensity = 2.8 + Math.abs(Math.sin(t * 7 + z)) * 0.9;
  });
  quenchable(world, {
    x, z, id,
    onQuench: () => {
      flame.visible = false;
      light.intensity = 0;
      WS.set(REGION, 'quench_' + id);
      if (onOut) onOut();
    },
  });
  return g;
}

// ---------------------------------------------------------------------------
// THE SHARED DRESSER.
//
// Stormreach was written as twenty bespoke dressing blocks, and five of them
// quietly failed the density check because the clusters happened to sit outside
// the arrival frame. The fix each time was the same: put things where the child
// is looking. So the Vale does it once, properly, in room-relative coordinates
// that cannot drift — the arrival frame is 22.2u wide and 12.9u ahead of the
// spawn, and this lays its clusters inside that by construction.
//
// It is not a template that makes every room the same: seed, palette, spread and
// which clusters get used all vary, and every room adds its own landmarks and
// water on top. It is the floor, not the room.
// ---------------------------------------------------------------------------
function dressShore(world, halfW, halfD, D, seed, opts = {}) {
  if (GREY()) return;
  let s0 = seed;
  const r = () => ((s0 = (s0 * 9301 + 49297) % 233280) / 233280);
  // FACING. The clusters go where the camera looks, which is 12.9u ahead of the
  // spawn along its own heading — not "north", because half the rooms in this
  // region are entered from the side.
  const a = (world.spawn && world.spawn.angle) || Math.PI;
  const fx = Math.sin(a), fz = Math.cos(a);
  const rx = fz, rz = -fx;                        // to the child's right
  const at = (ahead, across) => ({
    x: Math.max(-halfW + 2.4, Math.min(halfW - 2.4, world.spawn.x + fx * ahead + rx * across)),
    z: Math.max(-halfD + 2.4, Math.min(halfD - 2.4, world.spawn.z + fz * ahead + rz * across)),
  });

  const homes = opts.homes !== undefined ? opts.homes : 2;
  const spots = [
    at(4.5, -8.5), at(6.5, 8.0), at(10.5, -4.0), at(11.5, 5.5),
    at(2.0, 9.5), at(8.5, 0.5), at(13.0, -9.0), at(3.0, -11.0),
  ];
  let i = 0;
  for (let h = 0; h < homes; h++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 2.6)) {
      ruinedHome(world, p.x, p.z, r() * 6.28, washed(D, r()),
        { w: 5.5 + r() * 2, d: 4.5 + r() * 1.5, keep: 0.25 + r() * 0.4 });
    }
  }
  for (const maker of [coldHearth, cartWreck, wayshrine]) {
    const p = spots[i++ % spots.length];
    if (world.blocked(p.x, p.z, 1.8)) continue;
    if (maker === coldHearth) coldHearth(world, p.x, p.z, washed(D, r()));
    else if (maker === cartWreck) cartWreck(world, p.x, p.z, r() * 6.28, washed(D, r()));
    else wayshrine(world, p.x, p.z, r() * 6.28, washed(D, r()));
  }
  for (let k = 0; k < 2; k++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 1.6)) fallenColumn(world, p.x, p.z, k ? 1 : 0, washed(D, r()), 4 + r() * 2);
  }
  for (let k = 0; k < 2; k++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 2.0)) rubbleField(world, p.x, p.z, 2.4 + r() * 1.2, washed(D, r()), 9 + Math.floor(r() * 5));
  }
  for (let k = 0; k < 2; k++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 1.6)) lowWall(world, p.x, p.z, k ? 1.57 : 0, washed(D, r()), 3.5 + r() * 2);
  }
  const p = spots[i++ % spots.length];
  if (!world.blocked(p.x, p.z, 1.8)) aftermath(world, p.x, p.z, 2.2 + r() * 0.8, washed(D, r()), seed % 29);

  // ...and the loose stuff, each piece its own node so the count is honest
  // SIX KINDS, THREE WEATHERS. Every (kind x tint) pair is its own batch, so
  // eight kinds at four weathers is up to thirty-two buckets in one room on top
  // of everything the clusters make — which is how d1b reached 132 draw calls
  // against a ceiling of 125. Eighteen buckets looks the same and costs half.
  const KINDS = opts.kinds || ['barrel', 'crate', 'brick', 'skull', 'rockSA', 'bush'];
  for (let k = 0; k < (opts.loose || 16); k++) {
    const q = at(1.5 + r() * 12, (r() - 0.5) * 20);
    if (world.blocked(q.x, q.z, 0.7)) continue;
    const kind = KINDS[Math.floor(r() * KINDS.length) % KINDS.length];
    const big = kind.startsWith('rock');
    const g = new THREE.Group();
    g.position.set(q.x, 0, q.z);
    place(world, g, valeKit[kind], kind, 0, 0, 0, (big ? 0.7 : 0.85) + r() * 0.5,
      r() * 6.28, 0, washed(D, Math.floor(r() * 3) / 2).propTint, big);
    world.add(g);
    if (big) world.addCircle(q.x, q.z, 0.55, 'decor');
  }
}

// A rim path is still a room — the lesson Stormreach's stairs taught the hard
// way. Both long walls lined, the middle left clear, every piece its own node.
function rimSides(world, halfW, halfD, D, seed) {
  if (GREY()) return;
  let s0 = seed;
  const r = () => ((s0 = (s0 * 9301 + 49297) % 233280) / 233280);
  const KINDS = ['barrel', 'crate', 'vase', 'brick', 'skull', 'rockSA', 'rockSB', 'bush'];
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const x = -halfW + 1.2 + (i / 34) * (halfW * 2 - 2.4) + (r() - 0.5) * 1.3;
    let z = side * (halfD - 1.4 - r() * 1.5);
    if (world.blocked(x, z, 0.6)) z = -z;
    if (world.blocked(x, z, 0.6)) z = side * (halfD - 2.6);
    if (world.blocked(x, z, 0.6)) continue;
    const kind = KINDS[Math.floor(r() * KINDS.length) % KINDS.length];
    const big = kind.startsWith('rock');
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    place(world, g, valeKit[kind], kind, 0, 0, 0,
      (big ? 0.7 : 0.9) + r() * 0.5, r() * 6.28, 0,
      washed(D, Math.floor(r() * 4) / 3).propTint, big);
    world.add(g);
    if (big) world.addCircle(x, z, 0.55, 'decor');
  }
}

// ---------------------------------------------------------------------------
// EAST · THE SHALLOWS
// ---------------------------------------------------------------------------
export async function buildD1a(scene) {
  const { world, spec, D } = base(scene, 'd1a');
  const wade = canWade();
  const gaps = [gap('s'), gap('n')];
  if (wade) gaps.push(gap('w'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 8, r: 5.0, kind: 'water' }, { x: 12, z: -8, r: 4.4, kind: 'sand' },
              { x: -11, z: -9, r: 3.6, kind: 'moss' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'scr', { x: 0, z: 8, angle: Math.PI });
  sideDoor(world, 'n', halfW, halfD, 'd1b', { x: 0, z: 10, angle: Math.PI });
  if (wade) sideDoor(world, 'w', halfW, halfD, 'dlg', { x: 14, z: 0, angle: Math.PI / 2 });
  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'drownedgate', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: 7, z: 6 };
  world.markers.travelSpot = { x: -7, z: 6 };
  // THE LAGOON, SEEN FROM THE FIRST ROOM: the west side runs out into deep
  // water, and the door across it is simply not there yet.
  waterZone(world, { x: -13.5, z: 0, w: 7, d: 26, deep: true, id: 'd1a_edge' });
  waterZone(world, { x: -8.5, z: 0, w: 4.5, d: 26, deep: false });
  world.markers.slimeSpots = [{ x: 7, z: -5, variant: 'tide' }];
  scatter(world, halfW, halfD, D, 601, 6, { spin: 1, kinds: ['rockLA', 'rockSA', 'stump'] });
  dressShore(world, halfW, halfD, D, 6011, { homes: 2 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildD1b(scene) {
  const { world, spec, D } = base(scene, 'd1b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('e')], D, {
    patches: [{ x: -12, z: -8, r: 4.8, kind: 'water' }, { x: 12, z: 8, r: 4.2, kind: 'sand' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'd1a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'dg1', { x: 0, z: 5, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'd1p', { x: -7.5, z: 0, angle: -Math.PI / 2 });
  // THE LOCK, IN THE FIRST MINUTE — a deep channel with the chest on the islet
  // beyond it, in plain sight. Walk to the edge and look at it as long as you like.
  waterZone(world, { x: -10, z: -3, w: 7.0, d: 12, deep: true, id: 'd1b_channel' });
  waterZone(world, { x: -10, z: 5.5, w: 7.0, d: 5.0, deep: false });
  visibleReward(world, -13.5, -3, 'd6_d1b_deep', { shards: 24 });
  world.markers.deepPromise = { x: -10, z: -3 };
  world.markers.spitterSpots = [{ x: -3.2, z: 1.5 }];
  world.markers.slimeSpots = [{ x: 5, z: 3, variant: 'tide' }, { x: -2, z: -6, variant: 'tide' },
    { x: 7, z: -4, variant: 'tide' }];
  // d1b is the busiest room in the region — the lock, the islet, the chest and
  // a pack of three — and it came in at 126 draw calls against a 125 ceiling.
  // It loses clutter, not content: 127 things in the arrival frame against a
  // bar of 32 means there is a great deal of clutter to lose.
  //
  // AND IT NEEDS MORE THAN ONE CALL OF HEADROOM. Trimmed once to 123 it has
  // measured anywhere from 123 to 126 run to run, which is not a pass, it is a
  // coin toss that lands on dad's phone. One shore home fewer and four fewer
  // loose pieces put it in the high teens, where a stray call cannot reach the
  // ceiling. Nothing a child can interact with is touched.
  scatter(world, halfW, halfD, D, 602, 4, { spin: 1, kinds: ['rockLB', 'rockSA'] });
  dressShore(world, halfW, halfD, D, 6021, { homes: 1, loose: 6 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildD1p(scene) {
  const { world, spec, D } = base(scene, 'd1p');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: 5, z: 3, r: 3.2, kind: 'water' }, { x: -5, z: -3, r: 2.8, kind: 'moss' }],
  });
  world.spawn = { x: -7.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'd1b', { x: 7.5, z: 0, angle: Math.PI / 2 });
  world.markers.pupSpot = { x: 4, z: -2, id: 'pup_d1' };
  world.markers.restSpot = { x: -4, z: 3 };
  waterZone(world, { x: 6, z: 4, w: 8, d: 6, deep: false });
  scatter(world, halfW, halfD, D, 603, 4, { spin: 1, kinds: ['rockSA', 'barrel'] });
  dressShore(world, halfW, halfD, D, 6031, { homes: 1, loose: 18 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildDg1(scene) {
  const { world, spec, D } = base(scene, 'dg1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -6, z: 0, r: 3.4, kind: 'water' }, { x: 6, z: 2, r: 2.8, kind: 'sand' }],
  });
  world.spawn = { x: 0, z: 5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'd1b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'd2a', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.potionSpot = { x: 7, z: -3 };
  waterZone(world, { x: -8, z: 0, w: 5, d: 13, deep: false });
  scatter(world, halfW, halfD, D, 604, 4, { spin: 1, kinds: ['rockSA', 'bush'] });
  rimSides(world, halfW, halfD, D, 6041);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// NORTH · THE REEDBEDS
// ---------------------------------------------------------------------------
export async function buildD2a(scene) {
  const { world, spec, D } = base(scene, 'd2a');
  const wade = canWade();
  const gaps = [gap('s'), gap('w'), gap('n')];
  if (wade) gaps.push(gap('e'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'water' }, { x: 12, z: -8, r: 4.2, kind: 'moss' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'dg1', { x: 0, z: -5, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'd2b', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'd2p', { x: 0, z: 6, angle: Math.PI });
  if (wade) sideDoor(world, 'e', halfW, halfD, 'dlg', { x: 0, z: 13, angle: Math.PI });
  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'fisherruin', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 6 };
  waterZone(world, { x: 12.5, z: 0, w: 7, d: 26, deep: true, id: 'd2a_edge' });
  waterZone(world, { x: 7.5, z: 0, w: 5, d: 26, deep: false });
  world.markers.batSpots = [{ x: -6, z: -6, variant: 'gull' }, { x: 6, z: -7, variant: 'gull' }];
  world.markers.slimeSpots = [{ x: -7, z: 5, variant: 'tide' }];
  scatter(world, halfW, halfD, D, 611, 6, { spin: 1, kinds: ['rockLA', 'bush', 'stump'] });
  dressShore(world, halfW, halfD, D, 6111, { homes: 2 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildD2b(scene) {
  const { world, spec, D } = base(scene, 'd2b');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 6.0, kind: 'water' }, { x: -12, z: 8, r: 3.8, kind: 'moss' }],
  });
  world.spawn = { x: 13, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'd2a', { x: -13, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'dsh', { x: 0, z: 6, angle: Math.PI });
  // waist deep across the middle: you CAN cross it, and it slows you while
  // things that live in it do not slow at all
  waterZone(world, { x: 0, z: 0, w: 20, d: 12, deep: false });
  world.markers.spitterSpots = [{ x: 2.5, z: 3 }];
  world.markers.slimeSpots = [{ x: -2, z: 2, variant: 'tide' }, { x: 4, z: -3, variant: 'deeptide' },
    { x: -7, z: -4, variant: 'tide' }];
  scatter(world, halfW, halfD, D, 612, 6, { spin: 1, kinds: ['rockLB', 'rockSB', 'bush'] });
  dressShore(world, halfW, halfD, D, 6121, { homes: 2 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildD2p(scene) {
  const { world, spec, D } = base(scene, 'd2p');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: -2, r: 4.0, kind: 'water' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'd2a', { x: 0, z: -10, angle: 0 });
  world.markers.chestDefs = [{ id: 'c_d2p', tier: 'silver', x: 0, z: -5.0, ry: 0.3, loot: { shards: 24, potion: 1 } }];
  world.reserve(0, -5.0, 2.6, 'chest');
  waterZone(world, { x: 0, z: -1.5, w: 11, d: 5.5, deep: false });
  world.markers.slimeSpots = [{ x: -5, z: 1, variant: 'tide' }];
  scatter(world, halfW, halfD, D, 613, 4, { spin: 1, kinds: ['rockSA', 'crate'] });
  dressShore(world, halfW, halfD, D, 6131, { homes: 1, loose: 18 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// THE SPRING. Meri's gift, one channel of deep water between it and the way on,
// and a second channel with the chest on an islet — the grant+30s law.
export async function buildDsh(scene) {
  const { world, spec, D } = base(scene, 'dsh');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('w')], D, {
    patches: [{ x: 0, z: -3, r: 4.4, kind: 'water' }, { x: 6, z: 4, r: 2.4, kind: 'moss' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'd2b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'dg2', { x: 9, z: 0, angle: Math.PI / 2 });
  world.markers.sparkSpot = { x: 0, z: -4.6, grants: 'tide_wolf' };
  world.markers.teachDeep = { x: -5.6, z: 0 };
  world.reserve(0, -4.6, 3.0, 'spark');
  // INTRODUCE — one channel, across the way out, and nothing else to think about
  waterZone(world, { x: -5.6, z: 0, w: 4.4, d: 15, deep: true, id: 'd_shrine' });
  // GRANT + 30s — and the chest is visible through the water from the spring
  waterZone(world, { x: 7.0, z: -5.4, w: 4.6, d: 4.6, deep: true, id: 'd_shrine_pay' });
  visibleReward(world, 8.4, -5.4, 'd6_shrine', { shards: 30, heartPiece: 1 });
  if (!GREY()) {
    const spark = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8fe4ff, emissiveIntensity: 2.4, roughness: 1 })
    );
    spark.position.set(0, 1.5, -4.6);
    world.add(spark);
    const sl = new THREE.PointLight(0x4fd0e0, 5, 13, 1.8);
    sl.position.set(0, 1.8, -4.6);
    world.add(sl);
    world.onAnimate((t) => {
      spark.position.y = 1.5 + Math.sin(t * 1.6) * 0.15;
      spark.rotation.y = t * 1.0;
      sl.intensity = 4.2 + Math.abs(Math.sin(t * 5)) * 1.6;
    });
    wayshrine(world, 0, -6.8, 0, washed(D, 0.5));
  }
  scatter(world, halfW, halfD, D, 614, 4, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  dressShore(world, halfW, halfD, D, 6141, { homes: 1, loose: 16 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// DEVELOP — shallow, deep, shallow. Depth is a thing to LOOK at.
export async function buildDg2(scene) {
  const { world, spec, D } = base(scene, 'dg2');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 5.0, kind: 'water' }],
  });
  world.spawn = { x: 9, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'dsh', { x: -9, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'd3a', { x: 13, z: 0, angle: Math.PI / 2 });
  world.markers.developDepths = { x: 0, z: 0 };
  waterZone(world, { x: 5.5, z: 0, w: 5.0, d: 13, deep: false });
  waterZone(world, { x: -0.5, z: 0, w: 5.0, d: 13, deep: true, id: 'dg2_deep' });
  waterZone(world, { x: -6.5, z: 0, w: 5.0, d: 13, deep: false });
  world.markers.slimeSpots = [{ x: 7, z: 4, variant: 'tide' }];
  scatter(world, halfW, halfD, D, 615, 4, { spin: 1, kinds: ['rockSA', 'bush'] });
  // rimSides walks the long walls, and here the deep channel runs right through
  // them — two thirds of its slots were inside the water and got dropped, so the
  // room measured eight things in frame. The dry ends get dressed properly.
  rimSides(world, halfW, halfD, D, 6151);
  for (const [x, z, k] of [[8.5, -4.5, 0.2], [8.5, 4.5, 0.8], [-8.5, -4.5, 0.6], [-8.5, 4.5, 0.1]]) {
    if (!world.blocked(x, z, 1.8)) rubbleField(world, x, z, 2.2, washed(D, k), 10);
  }
  lowWall(world, 9.5, 0, 1.57, washed(D, 0.4), 4.0);
  lowWall(world, -9.5, 0, 1.57, washed(D, 0.9), 4.0);
  coldHearth(world, 7.5, 0, washed(D, 0.6));
  wayshrine(world, 9.0, -2.5, 1.2, washed(D, 0.25));
  cartWreck(world, 6.5, 5.0, 0.6, washed(D, 0.75));
  fallenColumn(world, 4.0, -5.2, 0, washed(D, 0.55), 4.0);
  // the posts that marked the ford, still standing on the dry side
  for (let i = 0; i < 6; i++) {
    const x = 10.0 - i * 0.9, z = (i % 2 ? 1 : -1) * (3.2 + (i % 3) * 0.8);
    if (world.blocked(x, z, 0.6)) continue;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    place(world, g, valeKit.pillar, 'pillar', 0, 0, 0, 0.8 + (i % 3) * 0.1,
      i * 0.9, 0.05, washed(D, (i % 3) / 2).propTint);
    world.add(g);
  }
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// WEST · THE DROWNED TOWN
// ---------------------------------------------------------------------------
export async function buildD3a(scene) {
  const { world, spec, D } = base(scene, 'd3a');
  const wade = canWade();
  const gaps = [gap('e'), gap('w'), gap('n')];
  if (wade) gaps.push(gap('s'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: -8, r: 4.6, kind: 'water' }, { x: 12, z: 8, r: 4.2, kind: 'rubble' }],
  });
  world.spawn = { x: 13, z: 0, angle: Math.PI / 2 };
  // -9, NOT -13. dg2 is a RIM (22 x 14), so its half-width is 11 — this landing
  // was written with an ISLAND's 13 and put the child a metre and a half beyond
  // dg2's own west wall, on the apron with the void past it. Walking back east
  // re-crossed dg2's west trigger and dumped them straight back here, so dg2
  // could not be entered from this side at all. dg2's door home sits at
  // x[-12.35,-10.85]; -9 clears it by 1.85 and faces into the room.
  sideDoor(world, 'e', halfW, halfD, 'dg2', { x: -9, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'd3b', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'd3p', { x: 0, z: 6, angle: Math.PI });
  if (wade) sideDoor(world, 's', halfW, halfD, 'dlg', { x: 0, z: -13, angle: 0 });
  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'sunkenhall', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: 8, z: 7 };
  waterZone(world, { x: 0, z: 11.5, w: 30, d: 5, deep: true, id: 'd3a_edge' });
  world.markers.minionSpots = [{ x: -6, z: -5, variant: 'drowned' }, { x: 5, z: -6, variant: 'drowned' }];
  scatter(world, halfW, halfD, D, 621, 6, { spin: 1, kinds: ['rockLA', 'brick', 'rockSB'] });
  dressShore(world, halfW, halfD, D, 6211, { homes: 3 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildD3b(scene) {
  const { world, spec, D } = base(scene, 'd3b');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('n')], D, {
    patches: [{ x: 0, z: 2, r: 5.4, kind: 'water' }, { x: -12, z: -8, r: 3.8, kind: 'rubble' }],
  });
  world.spawn = { x: 13, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'd3a', { x: -13, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'dtp', { x: 0, z: 10, angle: Math.PI });
  waterZone(world, { x: 0, z: 3, w: 22, d: 9, deep: false });
  // THE GHOST DOOR — region 7's lock, shown a region early: a doorway with
  // nothing behind it but dark, which is exactly what the Shadow Court is.
  wallRun(world, -16, -9.5, -10, -9.5, D);
  wallRun(world, -16, -5.0, -10, -5.0, D);
  promiseGate(world, -10, -7.2, 3.0, 4.2, 0x9f7fd0, 'DARK — later', 'rockSB',
    { system: 'shatter', id: 'd3b_ghost', region: REGION });
  visibleReward(world, -13, -7.2, 'd6_ghost', { shards: 28 });
  world.markers.ghostPromise = { x: -10, z: -7.2 };
  world.markers.minionSpots = [{ x: -4, z: -3, variant: 'drowned' }, { x: 6, z: -6, variant: 'drowned' }];
  world.markers.spitterSpots = [{ x: 3, z: 2.4 }];
  world.markers.slimeSpots = [{ x: 8, z: 6, variant: 'deeptide' }];
  scatter(world, halfW, halfD, D, 622, 6, { spin: 1, kinds: ['brick', 'rockSA', 'rockLC'] });
  dressShore(world, halfW, halfD, D, 6221, { homes: 3 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildD3p(scene) {
  const { world, spec, D } = base(scene, 'd3p');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 3.6, kind: 'rubble' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'd3a', { x: 0, z: -10, angle: 0 });
  world.markers.pupSpot = { x: 0, z: -4, id: 'pup_d3' };
  world.markers.minionSpots = [{ x: -5, z: -1, variant: 'drowned' }];
  scatter(world, halfW, halfD, D, 623, 4, { spin: 1, kinds: ['coins', 'brick', 'vase'] });
  dressShore(world, halfW, halfD, D, 6231, { homes: 1, loose: 18 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// THE TIDE POOLS — the one puzzle room. Three braziers burn on three islets in
// deep water; the splash puts them out; the way north opens when all three are
// dark. Region ONE's fire, undone by region SIX's water.
export async function buildDtp(scene) {
  const { world, spec, D } = base(scene, 'dtp');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 7.0, kind: 'water' }, { x: -12, z: -9, r: 3.0, kind: 'rubble' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'd3b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'dg3', { x: 0, z: 5, angle: Math.PI });
  const seats = [{ x: -8, z: -1 }, { x: 0, z: -5 }, { x: 8, z: -1 }];
  world.markers.poolBraziers = seats.map((s) => ({ ...s }));
  // shallow all round, so a child can walk to every brazier and stand there
  waterZone(world, { x: 0, z: -1, w: 26, d: 14, deep: false });
  let out = 0;
  world.markers.puzzleSolved = false;
  for (const s of seats) {
    poolBrazier(world, s.x, s.z, 'tp' + s.x, D, () => {
      out++;
      if (out >= seats.length) {
        world.markers.puzzleSolved = true;
        WS.set(REGION, 'poolsQuenched');
        if (world.onSolved) world.onSolved();
      }
    });
  }
  world.markers.slimeSpots = [{ x: -10, z: 6, variant: 'tide' }, { x: 10, z: 6, variant: 'tide' }];
  world.markers.spitterSpots = [{ x: 0, z: 4 }];
  scatter(world, halfW, halfD, D, 624, 5, { spin: 1, kinds: ['rockSA', 'rockSB', 'brick'] });
  dressShore(world, halfW, halfD, D, 6241, { homes: 2, loose: 20 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildDg3(scene) {
  const { world, spec, D } = base(scene, 'dg3');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 3.4, kind: 'rubble' }],
  });
  world.spawn = { x: 0, z: 5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'dtp', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'd4a', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.potionSpot = { x: -7, z: 3 };
  waterZone(world, { x: 8, z: 0, w: 5, d: 13, deep: false });
  scatter(world, halfW, halfD, D, 625, 4, { spin: 1, kinds: ['brick', 'rockSB'] });
  rimSides(world, halfW, halfD, D, 6251);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// SOUTH · THE SALT FLATS
// ---------------------------------------------------------------------------
export async function buildD4a(scene) {
  const { world, spec, D } = base(scene, 'd4a');
  const wade = canWade();
  const gaps = [gap('s'), gap('w'), gap('e')];
  if (wade) gaps.push(gap('n'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'sand' }, { x: 12, z: -8, r: 4.2, kind: 'water' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'dg3', { x: 0, z: -5, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'd4b', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'd4p', { x: -7.5, z: 0, angle: -Math.PI / 2 });
  if (wade) sideDoor(world, 'n', halfW, halfD, 'dlg', { x: 0, z: 13, angle: Math.PI });
  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'whalebones', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 7 };
  waterZone(world, { x: 0, z: -11.5, w: 30, d: 5, deep: true, id: 'd4a_edge' });
  world.markers.slimeSpots = [{ x: -6, z: 4, variant: 'deeptide' }];
  world.markers.batSpots = [{ x: 7, z: -5, variant: 'gull' }];
  scatter(world, halfW, halfD, D, 631, 6, { spin: 1, kinds: ['rockLC', 'rockSA', 'skull'] });
  dressShore(world, halfW, halfD, D, 6311, { homes: 2 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// CONCLUDE — the lock gate. A deep crossing with the pack waiting on the far
// side, so the last thing the region teaches is doing it under pressure.
export async function buildD4b(scene) {
  const { world, spec, D } = base(scene, 'd4b');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 6.0, kind: 'water' }, { x: 12, z: 8, r: 3.4, kind: 'sand' }],
  });
  world.spawn = { x: 13, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'd4a', { x: -13, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'dg4', { x: 9, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'd4p', { x: 0, z: 6, angle: Math.PI });
  world.markers.lockGate = { x: -2, z: 0 };
  waterZone(world, { x: -2, z: 0, w: 9, d: 22, deep: true, id: 'd4b_lock' });
  waterZone(world, { x: 5, z: 0, w: 5, d: 22, deep: false });
  world.markers.slimeSpots = [{ x: -10, z: -5, variant: 'deeptide' }, { x: -9, z: 5, variant: 'tide' }];
  world.markers.spitterSpots = [{ x: 3, z: -2 }];
  world.markers.minionSpots = [{ x: -12, z: 0, variant: 'drowned' }];
  scatter(world, halfW, halfD, D, 632, 6, { spin: 1, kinds: ['rockLB', 'skull', 'rockSB'] });
  dressShore(world, halfW, halfD, D, 6321, { homes: 2 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildD4p(scene) {
  const { world, spec, D } = base(scene, 'd4p');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('w')], D, {
    patches: [{ x: 0, z: -2, r: 3.6, kind: 'sand' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'd4b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'd4a', { x: 7.5, z: 0, angle: Math.PI / 2 });
  world.markers.chestDefs = [{ id: 'c_d4p', tier: 'gold', x: 0, z: -4.4, ry: -0.3, loot: { shards: 34, heartPiece: 1, gear: 'spear_tide' } }];
  world.reserve(0, -4.4, 2.6, 'chest');
  scatter(world, halfW, halfD, D, 633, 4, { spin: 1, kinds: ['rockSA', 'skull'] });
  dressShore(world, halfW, halfD, D, 6331, { homes: 1, loose: 18 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildDg4(scene) {
  const { world, spec, D } = base(scene, 'dg4');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 3.4, kind: 'sand' }],
  });
  world.spawn = { x: 9, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'd4b', { x: -9, z: 0, angle: -Math.PI / 2 });
  // LANDS ON FLOOR — see verify-reachable's landing sweep.
  sideDoor(world, 'n', halfW, halfD, 'ddp', { x: 1.7, z: 10.7, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.potionSpot = { x: -6, z: -3 };
  world.markers.chestDefs = [{ id: 'c_dg4', tier: 'silver', x: 7, z: 3.5, ry: 0.2, loot: { potion: 2 } }];
  world.reserve(7, 3.5, 2.6, 'chest');
  scatter(world, halfW, halfD, D, 634, 4, { spin: 1, kinds: ['rockSB', 'skull'] });
  rimSides(world, halfW, halfD, D, 6341);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE LAGOON — the hub that does not exist until the gift does.
// ---------------------------------------------------------------------------
export async function buildDlg(scene) {
  const { world, spec, D } = base(scene, 'dlg');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w'), gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 9.0, kind: 'water' }],
  });
  // FACING IN. This was angle +PI/2 — pointing at the east wall two units away,
  // so the arrival frame showed a wall and the density check read ONE thing in
  // it. A spawn angle is not decoration: it is where the camera looks.
  world.spawn = { x: 14, z: 0, angle: -Math.PI / 2 };
  // THREE OF THESE FOUR LANDED YOU BACK IN THE LAGOON.
  //
  // Each of the three was written in the LAGOON's coordinates, mirrored — the
  // spot opposite dlg's own doorway — instead of "just inside the matching door
  // in the room you are going to". Every one of them came down exactly on the
  // destination's own door line, so the door fired again on the next frame:
  // north sent the child to the Eel Pool instead of the Reedbeds, west and south
  // bounced them straight back into the water. d4a was unreachable from here.
  // Only the east exit was ever right, and it is the one that shows the shape:
  // land beside the door you came through, facing in.
  sideDoor(world, 'e', halfW, halfD, 'd1a', { x: -14, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'd2a', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'd3a', { x: 0, z: 10, angle: Math.PI });
  sideDoor(world, 's', halfW, halfD, 'd4a', { x: 0, z: -10, angle: 0 });
  // The whole floor is deep, except a ring of shallow at each doorway so a
  // child always arrives standing on something.
  waterZone(world, { x: 0, z: 0, w: 30, d: 26, deep: true, id: 'lagoon' });
  for (const [x, z] of [[14, 0], [-14, 0], [0, 12], [0, -12]]) {
    waterZone(world, { x, z, w: 7, d: 7, deep: false });
  }
  world.markers.slimeSpots = [{ x: -6, z: -4, variant: 'deeptide' }, { x: 7, z: 5, variant: 'deeptide' }];
  world.markers.batSpots = [{ x: 0, z: 0, variant: 'gull' }, { x: -9, z: 6, variant: 'gull' }];
  // the tops of what is under there — a drowned town has roofs, and this is
  // how a child reads that the lagoon is a PLACE and not a blue floor
  if (!GREY()) {
    let s0 = 6401;
    const r = () => ((s0 = (s0 * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 30; i++) {
      const x = (r() - 0.5) * 28, z = (r() - 0.5) * 24;
      if (world.blocked(x, z, 1.0)) continue;
      const kind = ['column', 'column2', 'pillar', 'arch', 'brick'][Math.floor(r() * 5) % 5];
      const g = new THREE.Group();
      // Half of them break the surface. Entirely submerged, they were invisible
      // under an opaque deep-water sheet — a drowned town nobody can see is a
      // drowned town that is not there.
      g.position.set(x, i % 2 ? -0.35 : -1.1 - r() * 0.5, z);
      place(world, g, valeKit[kind], kind, 0, 0, 0, 1.1 + r() * 0.6, r() * 6.28, 0,
        washed(D, Math.floor(r() * 4) / 3).propTint);
      world.add(g);
    }
  }
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// MERI'S DEEP
// ---------------------------------------------------------------------------
export async function buildDdp(scene) {
  const { world, spec, D } = base(scene, 'ddp');
  // THE LAST DOOR. Once the vale drains, the way out of the deep opens north —
  // and there is only one place left to go.
  const onward = !!state.flags.meriDefeated;
  const { halfW, halfD } = shell(world, spec, onward ? [gap('s'), gap('n')] : [gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 8.0, kind: 'water' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'dg4', { x: 0, z: -5, angle: 0 });
  if (onward) sideDoor(world, 'n', halfW, halfD, 'x1', { x: 0, z: 10, angle: Math.PI });
  heroProp(world, 0, 0, 'throne', D);
  // the arena floor is shallow — the fight is fought ankle-deep, and Meri's
  // slams are what make it deeper
  waterZone(world, { x: 0, z: 0, w: 22, d: 22, deep: false });
  if (!state.flags.meriDefeated) {
    world.markers.bossSpot = { x: 0, z: -2.0, kind: 'meri' };
  } else {
    world.bgColor = 0x2a5f74;
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8fe4ff, emissiveIntensity: 2.2, roughness: 1 })
    );
    heart.position.set(0, 1.4, -3.0);
    world.add(heart);
    const hl = new THREE.PointLight(0x4fd0e0, 5, 13, 1.8);
    hl.position.set(0, 1.7, -3.0);
    world.add(hl);
    world.onAnimate((t) => { heart.position.y = 1.4 + Math.sin(t * 1.5) * 0.14; heart.rotation.y = t * 0.8; });
    world.markers.meriShrine = { x: 0, z: -3.0 };
    world.markers.healed = true;
    world.markers.chestDefs = [
      { id: 'c_ddp', tier: 'gold', x: -4.5, z: -5.5, ry: 0.6, loot: { shards: 42, powerup: 'star' } },
    ];
    world.reserve(-4.5, -5.5, 2.6, 'chest');
  }
  scatter(world, halfW, halfD, D, 641, 4, { spin: 1, kinds: ['rockSA', 'brick'] });
  // THE RIM ONLY. An arena's middle stays clear — a boss that lands on a
  // boulder buries its own punish ring — but ten things in the arrival frame is
  // a bare room, so what she drowned is piled round the edges where it belongs.
  for (const [x, z, k] of [[-9.5, 7.5, 0.2], [9.5, 7.5, 0.7], [-10.5, -6.5, 0.9], [10.5, -6.5, 0.4]]) {
    if (!world.blocked(x, z, 2.0)) rubbleField(world, x, z, 2.6, washed(D, k), 12);
  }
  fallenColumn(world, -11, 2, 1, washed(D, 0.5), 5);
  fallenColumn(world, 11, 2, 1, washed(D, 0.15), 5);
  cartWreck(world, -6, 9.5, 0.8, washed(D, 0.85));
  lowWall(world, 6, 9.5, 0, washed(D, 0.3), 4.5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export const LEVEL6_ROOMS = {
  d1a: buildD1a, d1b: buildD1b, d1p: buildD1p, dg1: buildDg1,
  d2a: buildD2a, d2b: buildD2b, d2p: buildD2p, dsh: buildDsh, dg2: buildDg2,
  d3a: buildD3a, d3b: buildD3b, d3p: buildD3p, dtp: buildDtp, dg3: buildDg3,
  d4a: buildD4a, d4b: buildD4b, d4p: buildD4p, dg4: buildDg4,
  dlg: buildDlg, ddp: buildDdp,
};
