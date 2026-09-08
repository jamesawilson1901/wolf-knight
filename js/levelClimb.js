// THE COLD CLIMB — the road between the Wild Woods and Frostpeak.
//
// GAP THREE of the six interstitials (design/LEVEL-DESIGN-BRANCHES.md). Sylva's
// glade used to open straight onto Frostpeak's first island: you freed a forest
// and arrived on a mountain, with nothing in between to say the world had got
// colder. It opens onto two rooms of road now, and those two rooms ARE the
// change — the last green, then the snowline.
//
// GRADUATE THE VERB BEHIND. The Verdant Wolf is the wolf a child has just been
// handed, and the Woods taught the cut as a thing you do to a thorn wall in a
// side room. Here the road itself is thorned: the way north is a bramble across
// the whole width, and cutting is how you walk. Once required, twice rewarded —
// two more thorn nooks off the road, each with something showing through it.
//
// SHOW THE LOCK AHEAD. c2 ends at an ice wall with a chest behind it, in the
// Frost Wolf's own pale blue, one room before the region that hands it over.
// Frostpeak's own t1b promise gate uses the same colour and the same
// 'shatter' system, so a child meets the idea twice before they can act on it.
//
// WHAT IT DOES NOT DO: no wolf (the ladder is finished at ten), no boss, no new
// verb, and NO PUPS — the heart awards in main.js key on a GLOBAL running
// count, so pups on a road would hand out a region's heart early
// (js/levelNight.js has the original note). It pays in a keepsake, gear and
// coins.
//
// EVERY ASSET IS ALREADY PAID FOR. loadClimbKit() below names its own props,
// but every URL in it is already vendored and already fetched by the Wild Woods
// on one side or Frostpeak on the other, and loadGLB caches by URL — so the
// walk over the mountain costs a child no download at all. The first room
// simply keeps the snow off the trees and paints the ground green.
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow,
  reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { registerDistrictTints } from './districts.js';
import { loadGLB } from './assets.js';

export const REGION = 'coldclimb';

let climbKit = null;
const kit = () => climbKit;
const GREY = () => !kit() || state.settings.greybox !== false;

// A KIT OF ITS OWN, AND NOT A DOWNLOAD. Every URL below is already
// vendored and already fetched by the region on one side of this road or
// the other, and loadGLB caches by URL — so this list costs a child
// nothing and buys the road the full dresser vocabulary. Pointing the
// road at a REGION's kit instead (the first cut did) silently drops every
// prop whose key that region happens not to carry.
export async function loadClimbKit() {
  if (climbKit) return climbKit;
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
    // --- and the mountain the road climbs into (Kenney Holiday 🟢) -----------
    treeSA:  './assets/env/snow/tree-snow-a.glb',
    treeSB:  './assets/env/snow/tree-snow-b.glb',
    rockL:   './assets/env/snow/rocks-large.glb',
    rockM:   './assets/env/snow/rocks-medium.glb',
    rockS:   './assets/env/snow/rocks-small.glb',
    pile:    './assets/env/snow/snow-pile.glb',
  };
  const entries = await Promise.all(
    Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  climbKit = Object.fromEntries(entries);
  return climbKit;
}

// TWO DISTRICTS, and the arc between them is the road's whole job: the last
// place with green in it, and the first place with none.
// A ROAD'S PALETTE IS A JOURNEY, NOT A COLOUR. The first cut painted both rooms
// out of one green family — tint, floor and props all within a few points of
// each other — and the arrival frame came out as a flat wash with the props
// invisible inside it. These are read off the rooms either END of the road
// instead: `lastgreen` keeps level3's glade prop-green (0x6fae4a), the living
// colour the Wild Woods is losing, over a floor that has already started to go
// grey; `snowline` IS level4's rime gate, so stepping through the last door is
// stepping into Frostpeak's own palette a room early.
export const DISTRICTS = {
  lastgreen: { tint: 0x9fbf7a, floorTint: 0x87996a, wallTint: 0x36402c, propTint: 0x6fae4a,
    ground: 'thorn', name: 'THE LAST GREEN', hero: 'THE THORN ACROSS THE ROAD' },
  snowline: { tint: 0x9fb8cc, floorTint: 0xe6eef6, wallTint: 0x56687a, propTint: 0x8ea3b6,
    ground: 'snowfield', name: 'THE SNOWLINE', hero: 'THE ICE WALL' },
};

const M = MODULES;

export const LC = {
  c1: { ...M.island, kind: 'island', district: 'lastgreen', spine: true,
    label: 'THE LAST GREEN', beat: 'the thorn road · cut to pass · the keepsake' },
  c2: { ...M.island, kind: 'island', district: 'snowline', spine: true,
    label: 'THE SNOWLINE', beat: 'the first snow · the ice wall · the way over' },
};

registerDistrictTints(LC, DISTRICTS);

export const SPINE = ['c1', 'c2'];

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward } =
  makeBuilders({ kit, isGrey: () => GREY() });

const { ruinedHome, fallenColumn, rubbleField, wayshrine, lowWall, grove, thicket, cartWreck } =
  makeDressers({ kit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

function base(scene, id) {
  const spec = LC[id];
  const world = new World(scene);
  world.bgColor = spec.district === 'lastgreen' ? 0x121a12 : 0x1c2a38;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#e8f0f8', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#8fbf7a', y: 2.4, size: 1.4 });
    return world;
  }
  // COLD LIGHT ABOVE THE SNOWLINE, the way level4.js does it: the global rig is
  // firelit and it turns snow pink.
  world.lightTint = { sky: D.tint, ground: D.wallTint,
    key: spec.district === 'snowline' ? 0xeaf4ff : D.floorTint };
  world.solidifyProps();
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// A THORN WALL, in the shape the Wild Woods taught it (promiseGate's `cut`
// system, the same one level3's brambles use — so a child who has cut one has
// cut all of them, and WS remembers per region and id).
function thorn(world, x, z, w, d, id) {
  return promiseGate(world, x, z, w, d, 0x6fae4a, 'THORNS — cut', 'bush',
    { system: 'cut', id, region: REGION });
}

// --- C1 — THE LAST GREEN ----------------------------------------------------
export async function buildC1(scene) {
  const { world, spec, D } = base(scene, 'c1');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 2, r: 6.5, kind: 'grass' }, { x: -10, z: -7, r: 3.8, kind: 'moss' },
      { x: 11, z: 8, r: 3.4, kind: 'mud' }, { x: 8, z: -9, r: 3.0, kind: 'gravel' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [-2, 5], [-1, -3], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  // BACK INTO SYLVA'S GLADE, and on up to the snowline. tgl's own north gap is
  // where this lands: its arena is dressed at the walls only, so the middle of
  // the north edge is clear ground (js/level3.js buildTgl).
  sideDoor(world, 's', halfW, halfD, 'tgl', { x: 0, z: -10.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'c2', { x: 0, z: 11, angle: Math.PI });

  // THE THORN ACROSS THE ROAD. Wall to wall between two spurs, with the gate in
  // the middle: the wall runs are what make the cut the only way, and wallRun
  // pads its collider 0.5u past each end (the lesson the Greenway's rockfall
  // learned when a flood fill walked straight round it).
  wallRun(world, -16, -4.0, -1.9, -4.0, D);
  wallRun(world, 1.9, -4.0, 16, -4.0, D);
  thorn(world, 0, -4.0, 3.4, 2.4, 'c1_road');
  world.markers.cutPromise = { x: 0, z: -4.0 };
  world.markers.heroSpot = { x: 0, z: -4.0 };
  world.reserve(0, -4.0, 3.2, 'the thorn road');

  // TWICE REWARDED. Two nooks off the road, each closed by a thorn, each with
  // something visible through it — so cutting becomes a thing a child goes
  // looking to do rather than a toll they pay once.
  wallRun(world, -12.0, 2.0, -12.0, 6.4, D);
  wallRun(world, -12.0, 9.6, -12.0, 12.5, D);
  thorn(world, -12.0, 8.0, 2.2, 3.0, 'c1_west');
  visibleReward(world, -14.0, 10.5, 'c1_west_prize', { shards: 20, potion: 1 }, 'silver');
  // THE KEEPSAKE, behind the third cut — reachable the day this ships, which is
  // rule 3 of js/treasures.js.
  wallRun(world, 10.6, -12.5, 10.6, -7.2, D);
  wallRun(world, 10.6, -7.2, 12.3, -7.2, D);
  wallRun(world, 14.7, -7.2, 16, -7.2, D);
  thorn(world, 13.5, -7.2, 2.2, 2.6, 'c1_east');
  visibleReward(world, 13.5, -10.2, 'c1_keepsake', { shards: 32, treasure: 'sealed_map' }, 'gold');

  world.markers.houndSpots = [{ x: -5, z: 6, variant: 'thorn' }, { x: 5, z: 1 }];
  world.markers.batSpots = [{ x: -8, z: -9 }, { x: 7, z: -8 }];
  world.markers.breakables = [
    { x: -7.5, z: 10.5, kind: 'crate' }, { x: 7.5, z: 10.0, kind: 'barrel' },
    { x: -6.5, z: -9.5, kind: 'vase' }, { x: 12.5, z: 3.5, kind: 'jar' },
  ];
  world.markers.restSpot = { x: -6, z: 9 };

  // the woods giving up: whole trees at the bottom of the room, bare ones at
  // the top, and what people left when they stopped coming this way
  grove(world, -13.0, 11.5, 2.4, D, { trees: 3 });
  grove(world, 12.5, 12.0, 2.2, D, { trees: 3 });
  thicket(world, 4.0, 9.5, 1.8, D, { n: 7 });
  thicket(world, -4.5, 3.5, 1.6, D, { n: 6 });
  thicket(world, 8.5, 5.0, 1.5, D, { n: 5 });
  cartWreck(world, -9.5, 4.5, 0.8, D);
  wayshrine(world, 6.5, 12.0, 0.5, D);
  ruinedHome(world, -13.0, -1.5, 0.4, D, { w: 5.0, d: 4.0, keep: 0.4 });
  fallenColumn(world, -6.5, -7.5, 0.5, D, 3.0);
  fallenColumn(world, 8.0, -11.5, -0.9, D, 3.2);
  lowWall(world, -3.5, 8.5, 0.2, D, 3.0);
  lowWall(world, 5.5, -1.5, 0.7, D, 2.6);
  rubbleField(world, -2.5, 12.8, 2.0, D, 9);
  rubbleField(world, 10.5, -2.0, 1.8, D, 8);
  rubbleField(world, 3.0, -9.5, 2.0, D, 9);
  scatter(world, halfW, halfD, D, 71, 12, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA', 'treeA'] });
  return finish(world, spec, D);
}

// --- C2 — THE SNOWLINE ------------------------------------------------------
export async function buildC2(scene) {
  const { world, spec, D } = base(scene, 'c2');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 0, r: 7.0, kind: 'ice' }, { x: -10, z: 8, r: 3.6, kind: 'gravel' },
      { x: 10, z: -8, r: 3.4, kind: 'gravel' }, { x: 9, z: 9, r: 3.0, kind: 'moss' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [2, 4], [1, -4], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'c1', { x: 0, z: -11, angle: 0 });
  // ...AND OVER THE TOP. f1 is a 32x26 island since the Frostpeak rebuild
  // (js/level4.js): this lands inside its south door.
  sideDoor(world, 'n', halfW, halfD, 'f1', { x: 0, z: 11, angle: Math.PI });

  // THE ICE WALL — the lock ahead, in the Frost Wolf's own pale blue and on the
  // same 'shatter' system Frostpeak's t1b spring uses, so a child meets the
  // idea twice before they are handed the tool for it. There is a chest behind
  // it, in sight, which is what turns a wall into a promise.
  //
  // ACROSS A NOOK, NOT ACROSS THE ROAD. The first cut walled this wall-to-wall
  // with the gate in the middle and a comment claiming a pass ran round the
  // east spur; the wall runs went 1.9→16, so there was no pass and the only
  // way north was through a gate the child cannot open for another whole
  // region. verify-reachable said so in one line — "the doorway is open but
  // walled off from where the player arrives" — which is exactly the job that
  // suite exists to do. A ROAD'S PROMISE GATE GUARDS A REWARD, NEVER THE WAY ON.
  wallRun(world, 9.4, -4.0, 9.4, -12.5, D);
  wallRun(world, 9.4, -4.0, 12.2, -4.0, D);
  wallRun(world, 15.4, -4.0, 16, -4.0, D);
  promiseGate(world, 13.8, -4.0, 3.0, 2.2, 0x9be3ff, 'FROZEN — later', 'rockSB',
    { system: 'shatter', id: 'c2_pass', region: REGION });
  world.markers.icePromise = { x: 13.8, z: -4.0 };
  world.markers.heroSpot = { x: 13.8, z: -4.0 };
  world.reserve(13.8, -4.0, 3.0, 'the ice wall');
  visibleReward(world, 13.0, -8.5, 'c2_ice_prize', { shards: 26, gear: 'shield_iron' }, 'silver');

  world.markers.batSpots = [{ x: -6, z: 5 }, { x: 6, z: 7 }];
  world.markers.slimeSpots = [{ x: -4, z: -1, variant: 'frost' }];
  world.markers.breakables = [
    { x: -8.0, z: 10.5, kind: 'crate' }, { x: 8.0, z: 10.0, kind: 'barrel' },
    { x: -11.0, z: 2.0, kind: 'vase' },
  ];
  world.markers.restSpot = { x: -6, z: 9 };

  // above the treeline: what the mountain has, and what people built when they
  // still tried to cross it
  grove(world, -12.5, 11.5, 2.2, D, { trees: 2 });
  grove(world, 12.0, 11.0, 2.0, D, { trees: 2 });
  ruinedHome(world, -12.0, 5.5, 0.5, D, { w: 5.0, d: 4.0, keep: 0.35 });
  wayshrine(world, 9.0, 3.0, -0.6, D);
  fallenColumn(world, -7.5, -9.5, 0.3, D, 3.0);
  fallenColumn(world, 7.5, -3.5, -1.1, D, 2.8);
  lowWall(world, -4.0, 7.5, 0.2, D, 3.0);
  lowWall(world, 4.5, 1.5, 0.6, D, 2.6);
  cartWreck(world, -9.0, -3.0, 1.2, D);
  rubbleField(world, -2.5, 12.8, 2.0, D, 9);
  rubbleField(world, 11.5, 6.5, 1.8, D, 8);
  rubbleField(world, -13.5, -9.5, 2.2, D, 10);
  rubbleField(world, 4.5, -11.5, 1.8, D, 8);
  scatter(world, halfW, halfD, D, 73, 14, { spin: 1, kinds: ['rockS', 'rockM', 'rockSA', 'rockSB', 'pile'] });
  return finish(world, spec, D);
}

export const LEVELCLIMB_ROOMS = { c1: buildC1, c2: buildC2 };
