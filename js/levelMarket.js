// THE DROWNED MARKET — the road between Frostpeak and Stormreach.
//
// Dad, 2026-09-02: "make the drowned market a mid game level. we are going to
// add a new level that doesn't reward a wolf but something else inbetween all
// existing levels."
//
// THE FIRST INTERSTITIAL. It is not a region and does not want to be: no boss,
// no new wolf, no new world verb. It sits ON the road — f5's north door used to
// open straight onto Stormreach's cliffs and now opens onto a harbour first —
// and it exists to do the two jobs a road between two places can do that
// neither place can:
//
//   1. GRADUATE THE VERB YOU JUST EARNED. You come down off the summit with the
//      Frost Wolf and nothing else new, so this is frost's exam: the whole town
//      is under ice and every stall worth opening is sealed in it.
//   2. SHOW THE LOCK FOR THE ONE AHEAD. regions.js machine-checks that a gate's
//      ability is SHOWN strictly earlier than it is GRANTED. The black channels
//      cutting through this harbour are deep water — a hard wall until Meri's
//      gift in region SIX — with the far quay and what is on it in plain sight
//      the whole way through. Two regions of wanting it.
//
// WHY IT WAS MOVED HERE. It was designed as a branch off the Sunken Vale, and
// dad scrapped the Trial of the Ten with the reason "post-game content is the
// wrong target — the kids are not finishing the game yet". That reasoning kills
// a region-6 branch just as dead. Frozen instead of drowned, it lands at region
// four and every prop still fits: a fishing town reads the same under ice as
// under water.
//
// EVERY ASSET IS ALREADY PAID FOR. The props are the Small Props Pack the
// Village vendored (CC0, RG Poly, claimed in MANIFEST.json) and loadGLB caches
// by URL, so entering the market after the Village costs nothing at all — the
// same gltf objects come back, already atlas-shared.
import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { loadGLB } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow,
  reserveLandings, shareTexture } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { iceGate } from './gates.js';
import { waterZone } from './water.js';
import { registerDistrictTints } from './districts.js';

export const REGION = 'market';

// The props this town is made of. Listed once: the loader shares their atlas by
// this list and the dresser picks from it by name.
const PROP_KEYS = ['boat', 'rod', 'fish', 'basin', 'trough', 'trough2', 'cart',
  'bucket', 'sack', 'coil', 'stool', 'cartwheel'];

let marketKit = null;
const GREY = () => !marketKit || state.settings.greybox !== false;

export async function loadMarketKit() {
  if (marketKit) return marketKit;
  const names = {
    cliff: './assets/env/cliff-block.glb',
    hut: './assets/env/town/hut.glb',
    houses: './assets/env/town/houses-pack.glb',
    wall1: './assets/env/town/wall-1.glb',
    rockLA: './assets/env/rock-large-a.glb',
    rockSA: './assets/env/rock-small-a.glb',
    rockSB: './assets/env/rock-small-b.glb',
    // the market's own goods — the Village's props, cached by URL
    boat: './assets/env/village/BoatFrame_A.glb',
    rod: './assets/env/village/FishingRod_A.glb',
    fish: './assets/env/village/DriedFish_1_A.glb',
    basin: './assets/env/village/Basin_A.glb',
    trough: './assets/env/village/Trough_1_A.glb',
    trough2: './assets/env/village/Trough_2_A.glb',
    cart: './assets/env/village/Cart_1_A.glb',
    bucket: './assets/env/village/Bucket_1_A.glb',
    sack: './assets/env/village/Bag_1_A.glb',
    coil: './assets/env/village/Rope_1_A.glb',
    stool: './assets/env/village/Stool_A.glb',
    cartwheel: './assets/env/village/Wheel_A.glb',
  };
  const entries = await Promise.all(Object.entries(names).map(
    async ([k, f]) => [k, await loadGLB(f)]));
  marketKit = Object.fromEntries(entries);
  // ONE TEXTURE OBJECT FOR THE WHOLE ATLAS. loadGLB caches per FILE, so twelve
  // GLBs naming one PNG still build twelve THREE.Texture objects — and
  // tintedModel keys its material cache on map.uuid, which is twelve materials
  // flattenStatic can never merge. Same call the Village makes, same reason.
  shareTexture(PROP_KEYS.map((k) => marketKit[k]).filter(Boolean));
  return marketKit;
}

// ICE, NOT STONE. Everything here is the cold end of the palette: the floor is
// the frozen harbour, the walls are the sea cliffs it sits under, and the props
// are tinted the pale blue of things left out in a hard winter.
export const DISTRICTS = {
  quay: { tint: 0x9fb4c4, floorTint: 0xa8c2d2, wallTint: 0x46525e, propTint: 0x8fa2b2,
          // `snowfield`, not `snow` — GROUND_STYLES names it in full, and a
          // district naming a style that does not exist falls back to generic
          // earth with only a console warning. Caught reading ground.js while
          // fixing Frostpeak's floors, which had the same class of miss.
          ground: 'snowfield', name: 'THE DROWNED MARKET', hero: 'THE FROZEN QUAY' },
};

const M = MODULES;

// Two rooms, and deliberately two. A road between regions must not out-scale
// the regions — Frostpeak is five rooms and Stormreach nineteen.
export const LQ = {
  q1: { kind: 'island', w: 32, d: 26, district: 'quay', spine: true,
        label: 'THE FROZEN QUAY', beat: 'arrival · ice underfoot · the first channel' },
  q2: { kind: 'island', w: 32, d: 26, district: 'quay', spine: true,
        label: 'THE MARKET ROWS', beat: 'the stalls · the far quay you cannot reach' },
};

// Each room's district colour, so a DOORWAY can show what is beyond it and the
// map screen can draw the room at all (js/districts.js). The Market shipped
// without this call — every other level makes it — so its doorways bled no
// colour and, once the map started reading the registry instead of a hand
// list, the harbour was simply not on it. Found by verify-map on its first run.
registerDistrictTints(LQ, DISTRICTS);

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

const { shell, sideDoor, wallRun, scatter, visibleReward, pit } = makeBuilders({
  kit: () => marketKit,
  isGrey: () => GREY(),
});

const { place, ruinedHome, lowWall, rubbleField, fallenColumn, cartWreck } =
  makeDressers({ kit: () => marketKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

// A stall's worth of goods, grounded the way the Village's clutter() is: the
// pack contains props modelled to hang from a hook whose geometry sits entirely
// BELOW their origin, and placing those at y=0 buries them whole.
function goods(world, D, list) {
  if (GREY() || !marketKit) return;
  for (const [key, x, z, s = 1, ry = 0] of list) {
    const gltf = marketKit[key];
    if (!gltf) continue;
    const g = new THREE.Group();
    place(world, g, gltf, key, x, 0, z, s, ry, 0, D.propTint, true, true);
    const bb = new THREE.Box3().setFromObject(g);
    if (isFinite(bb.min.y) && bb.min.y < 0) g.position.y -= bb.min.y;
    world.add(g);
    world.addCircle(x, z, 0.42 * s);
  }
}

function base(scene, id) {
  const spec = LQ[id];
  const world = new World(scene);
  world.bgColor = 0x101820;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
  world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#cfe6ff', y: 3.4, size: 2.2 });
    return world;
  }
  world.solidifyProps();   // drawn obstacles become solid ones
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// --- Q1 — THE FROZEN QUAY --------------------------------------------------
export async function buildQ1(scene) {
  const { world, spec, D } = base(scene, 'q1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 2, r: 6.0, kind: 'gravel' }, { x: -11, z: -7, r: 3.6, kind: 'rubble' },
              { x: 11, z: 7, r: 3.4, kind: 'rubble' }],
    pathWidth: 2.8,
    // the road bends WEST around the channel, because the channel is a wall
    paths: [[[0, 12], [-4, 6], [-8, 0], [-4, -6], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  // f5 is a 26x26 arena since the Frostpeak rebuild (level4.js): land inside its
  // north door — and clear of the rime plug that seals it while Boreal flies.
  // That plug's collider runs to z = -11.3, so a landing at -11 clipped it by
  // two centimetres (verify-landings §3). A child only walks back down this
  // road with Boreal already calmed and the plug gone, so nothing was broken
  // in play — but a landing that is only safe because of a flag is a landing
  // waiting to break, and -10.6 is clear of it in either state.
  sideDoor(world, 's', halfW, halfD, 'f5', { x: 0, z: -10.6, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'q2', { x: 0, z: 11, angle: Math.PI });

  // THE HARBOUR IS FROZEN, AND FROZEN GROUND BEHAVES. Same flag the Frozen Lake
  // sets (rooms.js f2b): pushed things skid, and footfalls read colder.
  world.slickFloor = true;

  // THE FIRST CHANNEL. Deep water is a hard box collider until Meri's gift —
  // laid the same way the cliff walls are, so it stops Kael with no special
  // case in movement. This one is narrow and crosses the room's east side: the
  // road goes round it, and it is the first black water a child has seen that
  // the ice did not take.
  waterZone(world, { x: 8.5, z: 0, w: 6.5, d: 22, deep: true });

  // FROST'S EXAM, FIRST QUESTION. One stall sealed in ice, alone, with the
  // reward showing through it — the introduce beat, no enemies, no timing.
  iceGate(world, -12, 5.5, 'q1_stall', REGION);
  visibleReward(world, -13, 7.5, 'q1_stall_prize', { shards: 22, potion: 1 }, 'silver');

  // THE FAR BANK, seen from the road on the way past. Props on the OTHER side
  // of the channel do two jobs at once: they are the first thing that says this
  // water has a far side worth reaching, and they are density in the half of
  // the arrival view that is otherwise open water. Nothing here is reachable
  // until Meri's gift two regions from now.
  goods(world, D, [
    ['cart', 13.5, 6.5, 1.0, -0.4], ['boat', 14.0, 1.0, 1.0, 0.9],
    ['trough', 13.0, -3.5, 1.0, 0.3], ['sack', 14.5, 4.0, 1.0, 0.6],
    ['fish', 12.8, 8.5, 1.0, -0.2], ['bucket', 14.2, -6.0, 1.0, 0],
  ]);
  ruinedHome(world, 14, 10.5, -0.6, D, { w: 5.5, d: 4.5, keep: 0.55 });

  world.markers.restSpot = { x: -6, z: 9 };
  world.markers.rimeMinionSpots = [{ x: -5, z: -4 }, { x: 2, z: 6 }];
  world.markers.breakables = [
    { x: -9, z: -2, kind: 'crate' }, { x: 3, z: -8, kind: 'barrel' },
    { x: -3, z: 3, kind: 'jar' },
  ];
  // DRESS THE ARRIVAL VIEW FIRST. A child comes through the south door at
  // (0, 11) looking down the room, so the north half is the whole first
  // impression — and the first pass put nearly all the goods along the west
  // wall where the camera does not look. verify-density measured it at ELEVEN
  // things in frame against a need of 32, which is the number agreeing with
  // what the screenshot already said: a snowfield with a boat in it.
  goods(world, D, [
    // the near rows, straight ahead as you come down the steps
    ['cart', -3.0, 7.5, 1.0, 0.5], ['cart', 3.5, 6.0, 1.0, -0.7],
    ['trough', -5.5, 8.5, 1.0, 0.2], ['trough2', 1.5, 9.0, 1.0, -0.4],
    ['sack', 1.5, 8.5, 1.0, -0.3], ['sack', -1.5, 5.5, 1.0, 0.8],
    ['bucket', -2.2, 9.5, 1.0, 0], ['bucket', 4.5, 8.5, 1.0, 0.6],
    ['basin', 0.5, 4.0, 1.0, 0.9], ['stool', -4.0, 5.0, 1.0, 1.1],
    ['stool', 2.5, 3.5, 1.0, -1.0], ['coil', 5.0, 4.5, 1.0, 0.2],
    ['cartwheel', -6.5, 4.0, 1.0, 0.4], ['fish', -0.5, 7.0, 1.0, -0.6],
    ['rod', 4.0, 10.0, 1.0, 0.7], ['rod', -7.5, 10.5, 1.0, -0.4],
    ['fish', 2.0, 11.0, 1.0, 0.3], ['coil', -3.0, 11.0, 1.0, 0.8],
    ['cartwheel', 3.0, 12.0, 1.0, -0.5], ['sack', -5.0, 12.0, 1.0, 0.2],
    ['trough2', -9.0, 3.0, 1.0, 0.6], ['stool', -10.5, 7.5, 1.0, -0.9],
    // the quayside proper, west, where the boats were pulled up
    ['boat', -10.5, 0.5, 1.0, 0.4], ['boat', -13, -4, 1.0, -0.8],
    ['boat', -11.5, 4.0, 1.0, 1.1],
    ['cart', -6.5, -8, 1.0, 0.9], ['coil', -8.5, 6.5, 1.0, 0.2],
    ['bucket', -4.5, -1.5, 1.0, 0], ['basin', -2, -6.5, 1.0, 0.6],
    ['stool', -7, 2.5, 1.0, 1.1], ['trough', -9.5, -6.5, 1.0, -0.3],
    ['sack', -12, 1.5, 1.0, 0.7], ['fish', -8.0, -2.5, 1.0, 0.5],
  ]);
  // The props all share one atlas material, so flattenStatic merges the lot into
  // a single batched draw — which is the point, and which is why piling on more
  // of them stopped moving the arrival count. Structures each bring their own
  // geometry, so this is what actually fills a frame.
  ruinedHome(world, -13, 9.5, 0.4, D, { w: 6, d: 5, keep: 0.45 });
  ruinedHome(world, 8.5, 9.0, -0.5, D, { w: 5.5, d: 4.5, keep: 0.4 });
  ruinedHome(world, -9.5, 12.0, 0.8, D, { w: 5, d: 4, keep: 0.35 });
  lowWall(world, -2, 10, 0.2, D, 3.4);
  lowWall(world, 5.5, 1.5, 0.6, D, 3.0);
  lowWall(world, -6.5, 6.5, -0.4, D, 2.8);
  lowWall(world, 1.5, 2.0, 0.9, D, 2.6);
  // THE ARRIVAL BAND, MEASURED RATHER THAN GUESSED. verify-density's frame is
  // 12.9u ahead of spawn, 4.5u behind and 22.2u wide, so from (0, 11) facing
  // south it counts x -11.1..11.1, z -1.9..15.5 — and the east third of that is
  // the channel. Three passes of adding props moved the count by five, because
  // the far-bank goods sit at x 13+ (outside the width) and the near rows at
  // z 12 sit behind the camera. These are inside it on purpose.
  fallenColumn(world, -8.5, 1.0, 0.3, D, 3.2);
  fallenColumn(world, 2.5, 7.5, -0.7, D, 2.8);
  lowWall(world, -10.5, 10.0, 0.5, D, 2.6);
  lowWall(world, 3.5, 12.0, -0.2, D, 2.8);
  cartWreck(world, -4.5, 0.5, 0.8, D);
  rubbleField(world, -2.0, 13.0, 2.0, D, 8);
  rubbleField(world, 4.5, -1.0, 1.8, D, 8);
  fallenColumn(world, 4, -3, 0.8, D, 3.4);
  fallenColumn(world, -5.5, 11.0, -0.4, D, 3.0);
  cartWreck(world, 6.5, -6.5, 0.3, D);
  rubbleField(world, -12, -8, 2.6, D, 11);
  rubbleField(world, 6.0, 11.5, 2.2, D, 9);
  scatter(world, halfW, halfD, D, 91, 14, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA'] });
  return finish(world, spec, D);
}

// --- Q2 — THE MARKET ROWS --------------------------------------------------
export async function buildQ2(scene) {
  const { world, spec, D } = base(scene, 'q2');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 6.5, kind: 'gravel' }, { x: -11, z: 6, r: 3.4, kind: 'rubble' },
              { x: 11, z: -6, r: 3.4, kind: 'rubble' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [-3, 5], [-3, -5], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'q1', { x: 0, z: -11, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 's1a', { x: 0, z: 9, angle: Math.PI });

  world.slickFloor = true;

  // THE FAR QUAY. A wide channel down the whole east side with the market's
  // best stall standing on the other bank, lit, plainly visible, and utterly
  // unreachable for two more regions. This is the lock-before-key law doing the
  // thing it is for: a child asks what that is, and the answer is "later".
  waterZone(world, { x: 10.5, z: 0, w: 9.0, d: 24, deep: true });
  world.markers.underwaterPromise = { x: 6.0, z: 0 };
  goods(world, D, [
    ['boat', 13.5, 4.5, 1.0, 0.3], ['cart', 14, -3, 1.0, -0.5],
    ['fish', 12.5, 1.0, 1.0, 0.8],
  ]);

  // FROST'S EXAM, THE REST OF IT. Three sealed stalls, two of them off the road
  // so that shattering is REWARDED rather than merely required, and the third
  // across the way on.
  iceGate(world, 0, -2.0, 'q2_row', REGION);
  iceGate(world, -12, -6.5, 'q2_west', REGION);
  visibleReward(world, -13.5, -8.5, 'q2_west_prize', { shards: 24, gear: 'axe_frost' });
  iceGate(world, -11.5, 7.0, 'q2_north', REGION);
  visibleReward(world, -13.5, 8.5, 'q2_north_prize', { shards: 20, heartPiece: 1 }, 'silver');

  // THE MARKET'S OWN KEEPSAKE, at the end of the rows. A road pays in something
  // you keep, not in a wolf (js/treasures.js).
  visibleReward(world, -3.5, -9.5, 'q2_market',
    { shards: 36, treasure: 'frozen_tear' }, 'gold');

  world.markers.rimeMinionSpots = [{ x: -4, z: 4 }, { x: 3, z: -5 }];
  world.markers.glacierWardenSpots = [{ x: -6, z: -1 }];
  world.markers.breakables = [
    { x: -8, z: 2, kind: 'crate' }, { x: 4, z: 7, kind: 'barrel' },
    { x: -6, z: -8, kind: 'vase' }, { x: 2, z: -7.5, kind: 'box' },
  ];
  goods(world, D, [
    // THE ROWS. Stalls in two lines either side of the road, because a market
    // is a SHAPE a child recognises before they can read the sign over it.
    ['trough', -7.5, 5.5, 1.0, 0.2], ['trough2', -9, -3, 1.0, -0.6],
    ['rod', -5, 8, 1.0, 0.5], ['fish', -2.5, 6.5, 1.0, -0.2],
    ['basin', -10.5, 1.5, 1.0, 0.9], ['sack', -4, -6, 1.0, 0.3],
    ['cartwheel', 2.5, 3.5, 1.0, 0.7], ['coil', 1.5, -3.5, 1.0, -0.4],
    ['stool', -2, 1.5, 1.0, 1.3], ['bucket', -8.5, 8.5, 1.0, 0],
    // the near row, in the arrival view
    ['cart', -6.0, 9.5, 1.0, 0.4], ['cart', 3.0, 8.5, 1.0, -0.6],
    ['trough2', -1.0, 10.0, 1.0, 0.1], ['trough', 5.0, 6.0, 1.0, -0.3],
    ['sack', 0.5, 8.0, 1.0, 0.9], ['sack', -8.0, 6.5, 1.0, -0.2],
    ['bucket', 2.0, 10.5, 1.0, 0], ['bucket', -3.5, 4.0, 1.0, 0.5],
    ['stool', 4.5, 9.5, 1.0, 1.0], ['stool', -6.5, 2.0, 1.0, -0.8],
    ['fish', 1.0, 5.0, 1.0, 0.3], ['rod', -9.5, 9.5, 1.0, -0.5],
    ['cartwheel', -11.0, 5.0, 1.0, 0.6], ['coil', 5.5, 1.5, 1.0, 0.2],
    ['basin', 3.5, -1.0, 1.0, -0.7], ['boat', -12.5, -8.5, 1.0, 0.8],
  ]);
  ruinedHome(world, -12.5, 3, -0.3, D, { w: 6, d: 5, keep: 0.5 });
  ruinedHome(world, -12, -1.5, 0.5, D, { w: 5.5, d: 4.5, keep: 0.4 });
  cartWreck(world, 5, 9, 0.4, D);
  cartWreck(world, -10, 11, -0.6, D);
  lowWall(world, 3, -9.5, 0.1, D, 3.0);
  lowWall(world, -4, 11.5, 0.3, D, 3.2);
  fallenColumn(world, 6, 6, -0.9, D, 3.2);
  fallenColumn(world, -7.5, -10.5, 0.5, D, 3.0);
  rubbleField(world, -13, -10, 2.4, D, 10);
  rubbleField(world, 7.5, 11.0, 2.2, D, 9);
  scatter(world, halfW, halfD, D, 92, 10, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA'] });
  return finish(world, spec, D);
}

export const LEVELMARKET_ROOMS = { q1: buildQ1, q2: buildQ2 };
