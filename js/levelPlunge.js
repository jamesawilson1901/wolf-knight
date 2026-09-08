// THE PLUNGE — the road between the Stormreach Cliffs and the Sunken Vale.
//
// GAP FIVE of the six interstitials. Aria's crown used to open straight onto
// the Vale's first shore: you calmed a gale on a cliff top and arrived at sea
// level, with nothing in between to say you had come DOWN. It opens onto two
// rooms of road now, and the drop is what they are about — the cliff stair,
// then the first tide pools.
//
// GRADUATE THE VERB BEHIND. The Storm Wolf's dash is the newest thing a child
// holds, and Stormreach taught it as the way out of a gale lane. Here the stair
// itself runs through wind: three lanes across the road, none of them a wall,
// all of them a shove — a child who has not learned the dash gets pushed about
// and still gets down, and a child who has crosses it clean. A road is not the
// place for a gate a verb opens; it is the place for a verb to feel EARNED.
//
// SHOW THE LOCK AHEAD. p2 ends at flooded ground with a chest out in it, in the
// Tide Wolf's own teal, on the same 'shatter' promise the Vale's own gates use
// — one room before the region that hands the wading over.
//
// WHAT IT DOES NOT DO: no wolf, no boss, no new verb, no pups (the heart awards
// key on a global count — js/levelNight.js has the note). It pays in a
// keepsake, gear and coins.
//
// EVERY ASSET IS ALREADY PAID FOR: loadPlungeKit() names its own props and
// every URL in it is already vendored and already fetched by Stormreach on one
// side or the Vale on the other, and loadGLB caches by URL.
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow,
  reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { registerDistrictTints } from './districts.js';
import { galeLane, buildWindField } from './wind.js';
import { loadGLB } from './assets.js';

export const REGION = 'plunge';

let plungeKit = null;
const kit = () => plungeKit;
const GREY = () => !kit() || state.settings.greybox !== false;

// A KIT OF ITS OWN, AND NOT A DOWNLOAD. Every URL below is already
// vendored and already fetched by the region on one side of this road or
// the other, and loadGLB caches by URL — so this list costs a child
// nothing and buys the road the full dresser vocabulary. Pointing the
// road at a REGION's kit instead (the first cut did) silently drops every
// prop whose key that region happens not to carry.
export async function loadPlungeKit() {
  if (plungeKit) return plungeKit;
  const names = {
    // --- the ground and the walls (Kenney Nature 🟢) --------------------------
    floor:   './assets/env/floor-tile.glb',
    cliff:   './assets/env/cliff-block.glb',
    rockLA:  './assets/env/rock-large-a.glb',
    rockLB:  './assets/env/rock-large-b.glb',
    rockLC:  './assets/env/rock-large-c.glb',
    rockSA:  './assets/env/rock-small-a.glb',
    rockSB:  './assets/env/rock-small-b.glb',
    bridge:  './assets/env/bridge-stone.glb',
    pillar:  './assets/env/pillar.glb',
    stump:   './assets/env/stump.glb',
    logStack:'./assets/env/log-stack.glb',
    bush:    './assets/env/bush-large.glb',
    treeA:   './assets/env/tree-a.glb',
    treeB:   './assets/env/tree-b.glb',
    flowerA: './assets/env/flower-a.glb',
    flowerB: './assets/env/flower-b.glb',
    // --- what people left (Quaternius Dungeon 🟢) -----------------------------
    arch:    './assets/env/dungeon/Arch.glb',
    archDoor:'./assets/env/dungeon/Arch_Door.glb',
    column:  './assets/env/dungeon/Column.glb',
    column2: './assets/env/dungeon/Column2.glb',
    wallMod: './assets/env/dungeon/Wall_Modular.glb',
    pedestal:'./assets/env/dungeon/Pedestal.glb',
    barrel:  './assets/env/dungeon/Barrel.glb',
    crate:   './assets/env/dungeon/Crate.glb',
    vase:    './assets/env/dungeon/Vase.glb',
    brick:   './assets/env/dungeon/Brick.glb',
    skull:   './assets/env/dungeon/Skull.glb',
    coins:   './assets/env/dungeon/Coin_Pile.glb',
    banner:  './assets/env/dungeon/Banner_wall.glb',
    woodfire:'./assets/env/dungeon/Woodfire.glb',
    torch:   './assets/env/dungeon/Torch.glb',
    // --- THE DRESSERS' OWN VOCABULARY (Quaternius Forest 🟢). grove(),
    // thicket() and their undergrowth pick from treeQ*/bareQ*/bushQ*/grassQ*/
    // rockQ* BY NAME (js/dressing.js) — a kit without them produces a room with
    // no trees in it and says nothing, which is exactly what the first cut of
    // this road did.
    treeQ1:  './assets/env/forest/Tree_1_A.gltf',
    treeQ2:  './assets/env/forest/Tree_2_B.gltf',
    treeQ3:  './assets/env/forest/Tree_3_A.gltf',
    treeQ4:  './assets/env/forest/Tree_4_B.gltf',
    bareQ1:  './assets/env/forest/Tree_Bare_1_A.gltf',
    bareQ2:  './assets/env/forest/Tree_Bare_2_A.gltf',
    bushQ1:  './assets/env/forest/Bush_1_A.gltf',
    bushQ2:  './assets/env/forest/Bush_2_C.gltf',
    bushQ3:  './assets/env/forest/Bush_4_B.gltf',
    grassQ1: './assets/env/forest/Grass_1_A.gltf',
    grassQ2: './assets/env/forest/Grass_2_B.gltf',
    rockQ1:  './assets/env/forest/Rock_1_F.gltf',
    rockQ2:  './assets/env/forest/Rock_2_C.gltf',
    rockQ3:  './assets/env/forest/Rock_3_H.gltf',
    // --- and the shore it comes down to --------------------------------------
    mushG:   './assets/env/mushroom-group.glb',
    wallCov: './assets/env/dungeon/WallCover_Modular.glb',
  };
  const entries = await Promise.all(
    Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  plungeKit = Object.fromEntries(entries);
  return plungeKit;
}

// Read off the rooms either end, the way the Cold Climb's are: `cliffstair` is
// Stormreach's own gale stair and `tidepools` is the Vale's own shallows, so
// the road is the two regions meeting rather than a third colour between them.
export const DISTRICTS = {
  cliffstair: { tint: 0x7d8ea0, floorTint: 0x5b6470, wallTint: 0x2b333c, propTint: 0x7c8492,
    ground: 'galestair', name: 'THE CLIFF STAIR', hero: 'THE THREE WINDS' },
  tidepools: { tint: 0x6fbfc4, floorTint: 0x6a8a84, wallTint: 0x2a3f42, propTint: 0x84a09a,
    ground: 'shallows', name: 'THE TIDE POOLS', hero: 'THE FLOODED GATE' },
};

const M = MODULES;

export const LP = {
  p1: { ...M.island, kind: 'island', district: 'cliffstair', spine: true,
    label: 'THE CLIFF STAIR', beat: 'three winds · dash between them · the keepsake' },
  p2: { ...M.island, kind: 'island', district: 'tidepools', spine: true,
    label: 'THE TIDE POOLS', beat: 'sea level · the flooded gate · the way on' },
};

registerDistrictTints(LP, DISTRICTS);

export const SPINE = ['p1', 'p2'];

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward } =
  makeBuilders({ kit, isGrey: () => GREY() });

const { ruinedHome, fallenColumn, rubbleField, wayshrine, lowWall, grove, thicket, cartWreck } =
  makeDressers({ kit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

function base(scene, id) {
  const spec = LP[id];
  const world = new World(scene);
  world.bgColor = spec.district === 'cliffstair' ? 0x1c242e : 0x14282c;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  // THE WEATHER IS BUILT LAST (js/level5.js does the same, and says why): every
  // lane in a room merges into ONE mesh, so p1's three winds cost the draw-call
  // budget exactly one. A road that registers lanes and never builds the field
  // has wind you can feel and cannot see, which is the worst of both.
  world.rebuildWind = () => {
    if (world._windMesh) {
      world.root.remove(world._windMesh);
      world._windMesh.geometry.dispose();
      if (world._windMesh.material.map) world._windMesh.material.map.dispose();
      world._windMesh.material.dispose();
    }
    world._windMesh = buildWindField(world);
  };
  world.rebuildWind();
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#dceef0', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#7fc2bc', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.solidifyProps();
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// --- P1 — THE CLIFF STAIR ---------------------------------------------------
export async function buildP1(scene) {
  const { world, spec, D } = base(scene, 'p1');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 0, r: 7.0, kind: 'gravel' }, { x: -10, z: 8, r: 3.6, kind: 'rubble' },
      { x: 11, z: -8, r: 3.4, kind: 'sand' }, { x: -9, z: -9, r: 3.0, kind: 'moss' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [-3, 4], [2, -4], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  // BACK UP TO THE CROWN, and on down to the pools. scr's arena keeps its
  // middle clear for Aria's charge, so the north edge is open ground.
  sideDoor(world, 's', halfW, halfD, 'scr', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'p2', { x: 0, z: 11, angle: Math.PI });

  // THE THREE WINDS. Across the road, not along it, so the shove is sideways
  // and a child feels it as a thing to time rather than a thing to lean into.
  // 'gust', never 'gale': a road must be crossable by a child who has not
  // worked out the dash yet — this is where the verb gets to feel earned, not
  // where it gets tested.
  galeLane(world, { x: 0, z: 6.0, w: 30, d: 3.4, dir: 'e', strength: 'gust', id: 'p1_a' });
  galeLane(world, { x: 0, z: 0.0, w: 30, d: 3.4, dir: 'w', strength: 'gust', id: 'p1_b' });
  galeLane(world, { x: 0, z: -6.0, w: 30, d: 3.4, dir: 'e', strength: 'gust', id: 'p1_c' });
  world.markers.heroSpot = { x: 0, z: 0 };
  world.markers.windPromise = { x: 0, z: 6.0 };

  // THE KEEPSAKE, out on the windward spur — a child has to cross a lane and
  // come back to have it, which is the smallest possible use of the verb that
  // is still a use of it.
  wallRun(world, 10.6, -12.5, 10.6, -7.2, D);
  wallRun(world, 10.6, -7.2, 12.3, -7.2, D);
  visibleReward(world, 13.5, -10.2, 'p1_keepsake', { shards: 32, treasure: 'harbour_key' }, 'gold');
  visibleReward(world, -13.5, 10.0, 'p1_west_prize', { shards: 20, potion: 1 }, 'silver');

  world.markers.batSpots = [{ x: -6, z: 9 }, { x: 7, z: -3 }];
  world.markers.houndSpots = [{ x: 5, z: 9 }];
  world.markers.breakables = [
    { x: -8.0, z: 11.0, kind: 'crate' }, { x: 8.5, z: 11.0, kind: 'barrel' },
    { x: -12.0, z: 0.5, kind: 'vase' }, { x: 12.0, z: 4.0, kind: 'jar' },
  ];
  world.markers.restSpot = { x: -6, z: 11 };

  // a stair somebody cut, and the weather taking it back
  ruinedHome(world, -13.0, 5.5, 0.4, D, { w: 5.0, d: 4.0, keep: 0.35 });
  wayshrine(world, 8.5, 12.0, 0.5, D);
  fallenColumn(world, -6.5, -8.5, 0.5, D, 3.2);
  fallenColumn(world, 7.5, 7.5, -0.9, D, 3.0);
  fallenColumn(world, -11.0, -12.0, 0.3, D, 2.6);
  lowWall(world, -4.0, 10.5, 0.2, D, 3.0);
  lowWall(world, 5.0, 3.5, 0.7, D, 2.6);
  lowWall(world, -8.5, -3.5, -0.3, D, 2.8);
  cartWreck(world, -10.0, 11.5, 0.9, D);
  thicket(world, 3.5, -10.0, 1.6, D, { n: 6 });
  grove(world, -13.5, -6.0, 2.0, D, { trees: 2, sick: 0.4 });
  rubbleField(world, -2.5, 12.8, 2.0, D, 9);
  rubbleField(world, 11.5, 8.5, 1.8, D, 8);
  rubbleField(world, 2.5, -12.5, 2.0, D, 9);
  rubbleField(world, -13.0, 1.5, 1.8, D, 8);
  scatter(world, halfW, halfD, D, 81, 14, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA', 'rockQ1'] });
  return finish(world, spec, D);
}

// --- P2 — THE TIDE POOLS ----------------------------------------------------
export async function buildP2(scene) {
  const { world, spec, D } = base(scene, 'p2');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 0, r: 7.5, kind: 'water' }, { x: -10, z: -8, r: 3.6, kind: 'sand' },
      { x: 10, z: 8, r: 3.4, kind: 'mud' }, { x: 11, z: -7, r: 3.0, kind: 'moss' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [3, 4], [-2, -4], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'p1', { x: 0, z: -11, angle: 0 });
  // ...AND INTO THE VALE. d1a is the Vale's own first shore.
  sideDoor(world, 'n', halfW, halfD, 'd1a', { x: 0, z: 10, angle: Math.PI });

  // THE FLOODED GATE — the lock ahead, in the Tide Wolf's teal. A chest stands
  // in the water beyond it, in sight from the road, which is what makes a wall
  // a promise instead of a dead end.
  wallRun(world, -16, -6.0, -1.9, -6.0, D);
  wallRun(world, 1.9, -6.0, 16, -6.0, D);
  promiseGate(world, 0, -6.0, 3.4, 2.4, 0x4fd0e0, 'FLOODED — later', 'rockSB',
    { system: 'shatter', id: 'p2_ford', region: REGION });
  world.markers.waterPromise = { x: 0, z: -6.0 };
  world.markers.heroSpot = { x: 0, z: -6.0 };
  world.reserve(0, -6.0, 3.2, 'the flooded gate');
  visibleReward(world, 0, -9.5, 'p2_ford_prize', { shards: 26, gear: 'spear_a' }, 'silver');

  // THE WAY ON runs round the west spur, open from the day a child arrives: a
  // road whose only exit is behind its own promise gate is a dead end.
  wallRun(world, -12.5, -6.0, -12.5, -2.0, D);
  world.reserve(-14.2, -6.0, 2.2, 'the way round');

  world.markers.slimeSpots = [{ x: -5, z: 4 }, { x: 5, z: 8 }];
  world.markers.batSpots = [{ x: 8, z: 1 }];
  world.markers.breakables = [
    { x: -8.5, z: 10.5, kind: 'crate' }, { x: 8.0, z: 10.5, kind: 'barrel' },
    { x: -12.0, z: 3.0, kind: 'vase' }, { x: 12.5, z: -1.0, kind: 'jar' },
  ];
  world.markers.restSpot = { x: -7, z: 10 };

  // sea level: what the tide left, and what the town above it dropped
  ruinedHome(world, -12.5, 11.5, 0.4, D, { w: 5.5, d: 4.5, keep: 0.4 });
  ruinedHome(world, 12.0, 4.5, -0.6, D, { w: 5.0, d: 4.0, keep: 0.3 });
  wayshrine(world, -8.0, 6.5, 0.7, D);
  fallenColumn(world, 6.5, 11.5, 0.5, D, 3.0);
  fallenColumn(world, -6.0, -9.5, -0.8, D, 2.8);
  lowWall(world, 4.0, 6.0, 0.2, D, 3.0);
  lowWall(world, -4.5, 1.0, 0.7, D, 2.6);
  cartWreck(world, 10.0, 11.0, 1.1, D);
  thicket(world, -10.5, -3.5, 1.8, D, { n: 7 });
  thicket(world, 9.0, -10.0, 1.5, D, { n: 5 });
  grove(world, 13.0, 11.5, 2.0, D, { trees: 2 });
  rubbleField(world, 2.5, 12.8, 2.0, D, 9);
  rubbleField(world, -13.5, 6.5, 1.8, D, 8);
  rubbleField(world, 6.5, -12.5, 2.0, D, 9);
  rubbleField(world, -9.0, -12.0, 1.8, D, 8);
  scatter(world, halfW, halfD, D, 83, 14, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockQ1', 'rockQ2'] });
  return finish(world, spec, D);
}

export const LEVELPLUNGE_ROOMS = { p1: buildP1, p2: buildP2 };
