// THE HOLLOW ROAD — the road between the Sunken Vale and the Shadow Court.
//
// GAP SIX, the last of the six interstitials, and the only one a child walks
// knowing what is at the end of it. Meri's hall used to open straight onto the
// Court's threshold: you freed the last spirit and arrived at the shadow's own
// door, with nothing in between. It opens onto two rooms of road now, and what
// those two rooms are for is DREAD — the light going out of the world one room
// at a time, which is the one thing the game has never given itself room to do.
//
// GRADUATE THE VERB BEHIND. The Tide Wolf wades, and the Vale taught it in deep
// water. Here the road is half under water and the wading is simply how you
// walk: no gate, no puzzle, just a child crossing a drowned causeway in a form
// they were handed one room ago and feeling competent doing it.
//
// SHOW THE LOCK AHEAD. h2 ends at a wall of shadow with a chest behind it, in
// the Moonlight's own violet, on the same 'shatter' promise the Court's own
// gates use — the last locked thing in the game before the last region.
//
// WHAT IT DOES NOT DO: no wolf, no boss, no new verb, no pups. It pays in a
// keepsake, gear and coins.
//
// EVERY ASSET IS ALREADY PAID FOR: loadHollowKit() names its own props and
// every URL in it is already vendored and already fetched by the Vale on one
// side or the Court on the other, and loadGLB caches by URL.
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow,
  reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { registerDistrictTints } from './districts.js';
import { waterZone } from './water.js';
import { loadGLB } from './assets.js';

export const REGION = 'hollowroad';

let hollowKit = null;
const kit = () => hollowKit;
const GREY = () => !kit() || state.settings.greybox !== false;

// A KIT OF ITS OWN, AND NOT A DOWNLOAD. Every URL below is already
// vendored and already fetched by the region on one side of this road or
// the other, and loadGLB caches by URL — so this list costs a child
// nothing and buys the road the full dresser vocabulary. Pointing the
// road at a REGION's kit instead (the first cut did) silently drops every
// prop whose key that region happens not to carry.
export async function loadHollowKit() {
  if (hollowKit) return hollowKit;
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
    // --- and the court it ends at --------------------------------------------
    decoWall:'./assets/env/dungeon/Decorative_Wall.glb',
    wallCov: './assets/env/dungeon/WallCover_Modular.glb',
    cobweb:  './assets/env/dungeon/Cobweb.glb',
    spikes:  './assets/env/dungeon/Spikes.glb',
  };
  const entries = await Promise.all(
    Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  hollowKit = Object.fromEntries(entries);
  return hollowKit;
}

// Read off the rooms either end: `drownedgate` is the Vale's own drowned town
// and `shadowmarch` is the Court's own violet, so the last road in the game is
// one place handing over to the next rather than a third colour between them.
export const DISTRICTS = {
  drownedgate: { tint: 0x7f8fb0, floorTint: 0x5f6a80, wallTint: 0x282f3d, propTint: 0x8a90a4,
    ground: 'town', name: 'THE DROWNED GATE', hero: 'THE CAUSEWAY' },
  shadowmarch: { tint: 0x6e5f96, floorTint: 0x685991, wallTint: 0x362b4e, propTint: 0x6a5f80,
    ground: 'court', name: 'THE SHADOW MARCH', hero: 'THE WALL OF DARK' },
};

const M = MODULES;

export const LH = {
  h1: { ...M.island, kind: 'island', district: 'drownedgate', spine: true,
    label: 'THE DROWNED GATE', beat: 'the causeway · wade it · the keepsake' },
  h2: { ...M.island, kind: 'island', district: 'shadowmarch', spine: true,
    label: 'THE SHADOW MARCH', beat: 'the light goes · the wall of dark · the last door' },
};

registerDistrictTints(LH, DISTRICTS);

export const SPINE = ['h1', 'h2'];

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward } =
  makeBuilders({ kit, isGrey: () => GREY() });

const { ruinedHome, fallenColumn, rubbleField, wayshrine, lowWall, thicket, cartWreck } =
  makeDressers({ kit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

function base(scene, id) {
  const spec = LH[id];
  const world = new World(scene);
  world.bgColor = spec.district === 'drownedgate' ? 0x16232a : 0x18132a;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#e0dcf0', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#9f8fd0', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.solidifyProps();
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// --- H1 — THE DROWNED GATE --------------------------------------------------
export async function buildH1(scene) {
  const { world, spec, D } = base(scene, 'h1');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 0, r: 8.0, kind: 'water' }, { x: -11, z: 9, r: 3.4, kind: 'rubble' },
      { x: 11, z: -9, r: 3.4, kind: 'rubble' }, { x: 10, z: 8, r: 3.0, kind: 'moss' }],
    pathWidth: 3.0,
    paths: [[[0, 12], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ddp', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'h2', { x: 0, z: 11, angle: Math.PI });

  // THE CAUSEWAY. Shallow, wall to wall, ankle-deep — the Vale's own idiom
  // (js/level6.js's arena is fought ankle-deep in exactly this) and NOT a gate:
  // shallow water is walkable in any form. It is here so the wading a child was
  // handed one room ago is simply how they walk the last road, which is what a
  // road between regions is for.
  waterZone(world, { x: 0, z: 0, w: 26, d: 14, deep: false });
  world.markers.heroSpot = { x: 0, z: 0 };

  // THE KEEPSAKE, on the far side of the water in a nook off the causeway.
  wallRun(world, 10.6, -12.5, 10.6, -7.2, D);
  wallRun(world, 10.6, -7.2, 12.3, -7.2, D);
  visibleReward(world, 13.5, -10.2, 'h1_keepsake', { shards: 34, treasure: 'moon_coin' }, 'gold');
  visibleReward(world, -13.5, 10.0, 'h1_west_prize', { shards: 22, potion: 1 }, 'silver');

  world.markers.slimeSpots = [{ x: -5, z: 8 }, { x: 5, z: -8 }];
  world.markers.batSpots = [{ x: -8, z: -4 }, { x: 8, z: 4 }];
  world.markers.breakables = [
    { x: -9.0, z: 11.0, kind: 'crate' }, { x: 9.0, z: 11.0, kind: 'barrel' },
    { x: -12.5, z: -2.0, kind: 'vase' }, { x: 12.5, z: 2.0, kind: 'jar' },
  ];
  world.markers.restSpot = { x: -7, z: 11 };

  // a gate town that the sea took: the arches still standing out of the water
  ruinedHome(world, -13.0, 11.5, 0.4, D, { w: 5.5, d: 4.5, keep: 0.4 });
  ruinedHome(world, 12.5, 11.0, -0.5, D, { w: 5.0, d: 4.0, keep: 0.3 });
  wayshrine(world, -8.5, -10.5, 0.6, D);
  fallenColumn(world, -6.5, -12.0, 0.4, D, 3.2);
  fallenColumn(world, 6.5, -12.5, -0.7, D, 3.0);
  fallenColumn(world, -12.0, 4.5, 1.1, D, 2.8);
  fallenColumn(world, 12.0, -4.0, -1.3, D, 2.6);
  lowWall(world, -4.5, 10.0, 0.2, D, 3.0);
  lowWall(world, 4.5, 10.5, -0.2, D, 2.8);
  cartWreck(world, -10.5, 7.5, 0.9, D);
  thicket(world, 9.5, 7.0, 1.6, D, { n: 6 });
  rubbleField(world, -2.5, 12.8, 2.0, D, 9);
  rubbleField(world, 2.5, -12.8, 2.0, D, 9);
  rubbleField(world, -13.5, 0.5, 1.8, D, 8);
  rubbleField(world, 13.0, 6.5, 1.8, D, 8);
  scatter(world, halfW, halfD, D, 91, 14, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA', 'brick'] });
  return finish(world, spec, D);
}

// --- H2 — THE SHADOW MARCH --------------------------------------------------
export async function buildH2(scene) {
  const { world, spec, D } = base(scene, 'h2');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: -2, r: 7.5, kind: 'corruption', alpha: 0.45 },
      { x: -10, z: 9, r: 3.4, kind: 'rubble' }, { x: 10, z: 9, r: 3.4, kind: 'gravel' },
      // ash, not moss: this patch sits where the child arrives, and the same
      // template green that works on the Plunge read as a lawn growing on the
      // Court's doorstep (contact sheet, 2026-09-08).
      { x: 0, z: 11, r: 3.2, kind: 'ash' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [-2, 4], [2, -4], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'h1', { x: 0, z: -11, angle: 0 });
  // ...AND THE LAST DOOR BUT ONE. x1 is the Court's own threshold.
  sideDoor(world, 'n', halfW, halfD, 'x1', { x: 0, z: 10, angle: Math.PI });

  // THE LIGHT GOES OUT ON THIS ROAD. The room's north half is a dark zone —
  // the Dark Wolf's own sense, taught in the Den in the first ten minutes and
  // barely asked for since, which is the note js/levelNight.js makes about the
  // Night Road. The last road in the game asks for it one more time.
  world.markers.darkPromise = { x: 0, z: -2 };

  // THE WALL OF DARK — the last locked thing before the last region, in the
  // Moonlight's own violet and on the same 'shatter' promise the Court's gates
  // use. Chest behind it, in sight. Across a NOOK, never across the road: see
  // the long note in js/levelClimb.js.
  wallRun(world, 9.4, -4.0, 9.4, -12.5, D);
  wallRun(world, 9.4, -4.0, 12.2, -4.0, D);
  wallRun(world, 15.4, -4.0, 16, -4.0, D);
  promiseGate(world, 13.8, -4.0, 3.0, 2.2, 0x9f7fd0, 'DARK — later', 'rockSB',
    { system: 'shatter', id: 'h2_veil', region: REGION });
  world.markers.moonPromise = { x: 13.8, z: -4.0 };
  world.markers.heroSpot = { x: 13.8, z: -4.0 };
  world.reserve(13.8, -4.0, 3.0, 'the wall of dark');
  visibleReward(world, 13.0, -8.5, 'h2_veil_prize', { shards: 30, gear: 'shield_moon' }, 'silver');

  world.markers.houndSpots = [{ x: -5, z: 6, variant: 'shadewalker' }, { x: 6, z: 2 }];
  world.markers.batSpots = [{ x: -8, z: -2 }];
  world.markers.breakables = [
    { x: -9.0, z: 11.0, kind: 'crate' }, { x: 9.8, z: 11.0, kind: 'barrel' },
    { x: -12.5, z: 5.0, kind: 'vase' },
  ];
  world.markers.restSpot = { x: -6, z: 11 };

  // the court's outer ground: columns in rows that stopped meaning anything,
  // and the last things anyone carried this way
  fallenColumn(world, -8.0, 8.5, 0.3, D, 3.4);
  fallenColumn(world, 8.0, 8.0, -0.5, D, 3.2);
  fallenColumn(world, -8.5, 0.5, 0.9, D, 3.0);
  fallenColumn(world, 8.5, 0.0, -1.1, D, 2.8);
  fallenColumn(world, -6.0, -10.0, 0.2, D, 2.6);
  fallenColumn(world, 6.0, -10.5, -0.4, D, 2.6);
  ruinedHome(world, -13.0, 11.5, 0.4, D, { w: 5.0, d: 4.0, keep: 0.3 });
  wayshrine(world, 12.0, 11.0, -0.5, D);
  lowWall(world, -4.0, 4.5, 0.2, D, 3.0);
  lowWall(world, 4.0, -1.5, 0.6, D, 2.6);
  cartWreck(world, -11.0, -8.5, 1.0, D);
  thicket(world, 11.5, -11.0, 1.5, D, { n: 5 });
  rubbleField(world, -2.5, 12.8, 2.0, D, 9);
  rubbleField(world, 3.0, 12.5, 1.8, D, 8);
  rubbleField(world, -13.5, 2.5, 2.0, D, 9);
  rubbleField(world, 13.5, 5.5, 1.8, D, 8);
  scatter(world, halfW, halfD, D, 93, 14, { spin: 1, kinds: ['rockSA', 'rockSB', 'brick', 'skull'] });
  return finish(world, spec, D);
}

export const LEVELHOLLOW_ROOMS = { h1: buildH1, h2: buildH2 };
