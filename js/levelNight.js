// THE NIGHT ROAD — the road between Ember Hollow and Stoneroot Caverns.
//
// THE SECOND INTERSTITIAL, and the first one a child is guaranteed to reach.
// design/LEVEL-DESIGN-BRANCHES.md carries the law that put it here:
//
//     "Build where the players actually are. Region 1-3 content beats region
//      6-7 content beats post-game content, every time."
//
// The Drowned Market sits between regions four and five, which is already
// further than the kids have got. This one sits between ONE and TWO — on the
// walk out of the Hollow, the first time in the game a child leaves a place
// they have finished — so it is the interstitial they will actually walk.
//
// WHY A ROAD AT NIGHT. At this point in the game a child owns exactly two
// wolves: fire, which Ember spent five rooms teaching, and the DARK WOLF, which
// the Den handed over at the very start and the game has barely asked about
// since. Its senses (player.js FORM_DEFS.senses — hidden things shimmer) and
// its sight (main.js: dark zones black the rig out for everyone else) are the
// most interesting tools a beginner has and the least used.
//
// So the road is unlit and the road is the puzzle. There is no gate here and
// nothing to fail: the way on is walkable in any form. But in the Knight's
// shape it is a black field with a hole in it somewhere, and in the Dark
// Wolf's it is a road, with the hole plainly to one side of it and three
// things worth having glittering off in the heather. A child who never
// changes form still gets through. A child who changes form gets the level.
//
// WHAT IT DOES NOT DO. No wolf (the ladder is finished at ten — see
// js/treasures.js), no new verb, no boss, and NO PUPS: the heart awards in
// main.js onPupCollected() key on a GLOBAL running count, so three pups on the
// road out of region one would hand a child Stoneroot's heart before they had
// seen Stoneroot. It pays in a keepsake, gear, a heart piece and coins.
//
// EVERY ASSET IS ALREADY PAID FOR. This is Ember's kit — the same Kenney
// Nature/Castle and Quaternius Dungeon pieces level1.js loads — pulled cold and
// blue instead of ember orange. rooms.js has already awaited loadEmberKit() by
// the time a builder here runs (its `n` dispatch sends it there), exactly as
// the Spire does. Nothing new is vendored, and loadGLB caches by URL, so the
// walk out of the Hollow costs no download at all.
import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow,
  reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { registerDistrictTints } from './districts.js';
import { emberKitRef } from './level1.js';

export const REGION = 'nightroad';

const kit = () => emberKitRef();
const GREY = () => !kit() || state.settings.greybox !== false;

// ---------------------------------------------------------------------------
// DISTRICTS. Two rooms, two districts, and the arc between them is the whole
// point of a road: you leave one place and you arrive somewhere else. The moor
// is Ember's ash gone cold and blue under a night sky; the ward is the first
// cut stone in the game that is not a ruin — Stoneroot, showing.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  moor: { tint: 0x6f7c96, floorTint: 0x4e5668, wallTint: 0x232833, propTint: 0x5d6474,
          ground: 'gloom', name: 'THE NIGHT ROAD', hero: 'THE LAST FIRE' },
  // `quarry` is the cobble style — a road that has been MADE, against the moor's
  // bare earth. GROUND_STYLES names it in full and a district naming a style
  // that does not exist falls back to generic earth with only a console warning
  // (the mistake the Market shipped with for a day), so both names above are
  // read off js/ground.js rather than remembered.
  ward: { tint: 0x8a93a6, floorTint: 0x5c6472, wallTint: 0x2a2f3a, propTint: 0x6b7382,
          ground: 'quarry', name: 'THE WARDSTONE', hero: 'THE MILESTONE' },
};

const M = MODULES;

// Two rooms, and deliberately two — the same restraint the Market took. A road
// between regions must not out-scale the regions it joins: Ember Hollow is nine
// spine rooms and Stoneroot seventeen.
export const LN = {
  n1: { ...M.island, kind: 'island', district: 'moor', spine: true,
        label: 'THE NIGHT ROAD', beat: 'the last fire · the dark · the road only the wolf can see' },
  n2: { ...M.island, kind: 'island', district: 'ward', spine: true,
        label: 'THE WARDSTONE', beat: 'cut stone · the cracked rock ahead · the keepsake' },
};

registerDistrictTints(LN, DISTRICTS);

export const SPINE = ['n1', 'n2'];

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward, pit,
  darkZone } = makeBuilders({ kit, isGrey: () => GREY() });

const { ruinedHome, coldHearth, fallenColumn, rubbleField, wayshrine, aftermath,
  cartWreck, lowWall, place } =
  makeDressers({ kit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

// A LAMP THAT IS OUT. The road had lamps and nobody has lit them for a long
// time — the one piece of scenery that says what this place is in a single
// look. Grounded the way the Market's goods are: Torch.glb is modelled to be
// driven into a wall, so its geometry sits partly below its own origin and a
// torch asked for at y=0 is a torch buried to the collar.
function roadside(world, D, list) {
  if (GREY() || !kit()) return;
  for (const [key, x, z, s = 1, ry = 0] of list) {
    const gltf = kit()[key];
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
  const spec = LN[id];
  const world = new World(scene);
  world.bgColor = 0x0a0d18;          // night, and no ember light left in it
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#b9c6e0', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#6f7c96', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// --- N1 — THE NIGHT ROAD ----------------------------------------------------
export async function buildN1(scene) {
  const { world, spec, D } = base(scene, 'n1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 8, r: 5.5, kind: 'gravel' }, { x: -10, z: -6, r: 4.0, kind: 'mud' },
              { x: 11, z: 4, r: 3.6, kind: 'moss' }, { x: -6, z: 11, r: 3.2, kind: 'ash' }],
    pathWidth: 2.8,
    // THE ROAD BENDS WEST, and the bend is not decoration: the washout below
    // takes the middle of the room out, so the painted path is the truth about
    // where a child can actually walk. A floor that lies is worse than a bare
    // one (the vh note in level2.js, learned the hard way) — and the first cut
    // of this one lied. It ran (-8,-2) → (-4,-9), which clips the washout's
    // west corner at about z -5, so the floor was drawing a road THROUGH the
    // hole. The walk found it: a Knight sent down the west lane fell twice and
    // never reached the north door. The lane hugs x -9 now, three and a half
    // units clear of the rim.
    paths: [[[0, 12], [-4, 5], [-9, -1], [-9, -8], [-3, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'le', { x: 0, z: -10.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'n2', { x: 0, z: 11, angle: Math.PI });

  // THE LAST FIRE. Somebody's camp at the top of the road, still warm, and the
  // last light before the dark — a rest beat placed exactly where a child
  // arrives, so the room opens on something friendly and then takes it away.
  world.markers.restSpot = { x: -5.5, z: 9 };
  world.markers.potionSpot = { x: -3.5, z: 9.5 };

  // THE DARK. Everything past the camp, wall to wall — main.js blacks the light
  // rig out to six percent for every form but one, and lifts the veil to almost
  // nothing for the Dark Wolf. This is the biggest dark zone in the game on
  // purpose: ld1 (Ember's order hall) is a 20x16 pocket, and a child who solved
  // that one has been told what the answer to a dark room is.
  darkZone(world, -halfW, halfW, -halfD, 2.0);

  // THE WASHOUT. The road went into the ravine years ago and the middle of the
  // room is a hole. It costs the walk and never a heart (player.js, "A HOLE IN
  // THE FLOOR COSTS THE WALK, NOT A HEART"), and its pale rim is drawn with an
  // unlit material on purpose — so even in the Knight's blackout the EDGE is
  // findable and the fall is never a gotcha. As the Dark Wolf it is simply a
  // hole with a road round it.
  // ...and Pip says so, once, at the edge of it (main.js, `night_road_dark`).
  // The marker sits ON the road where the path crosses the dark line, so the
  // hint arrives at the moment the lights go out and not before.
  world.markers.darkMouth = { x: -4.5, z: 2.5 };

  pit(world, -5.5, 7.5, -7.0, -3.0);
  world.pitReturn = { x: 0, z: 0.5 };          // the near lip, one run-up back

  // WHAT THE SENSES ARE FOR, ONE. A nook in the east heather, its mouth closed
  // by the same char-thorn Ember taught a child to burn — off the road, so
  // burning is rewarded rather than demanded, and unremarkable from the road
  // until the chest inside it shimmers.
  //
  // THREE WALLS, NOT ONE: a promise gate has to be the ONLY way in or it is
  // decoration (la's own note, learned there). The first cut walled the mouth
  // and nothing else, and the room's north strip runs the full width — so a
  // child simply walked round the end of the wall along z -11 and took the
  // chest without ever burning anything. A flood-fill from the spawn is what
  // said so: the nook's floor came back reachable with the thorn standing.
  wallRun(world, 9.0, -7.0, 12.2, -7.0, D);
  wallRun(world, 14.8, -7.0, 15.9, -7.0, D);
  wallRun(world, 9.0, -7.0, 9.0, -12.6, D);
  promiseGate(world, 13.5, -7.0, 2.6, 1.6, 0xc0682d, '', 'fire',
              { system: 'burn', id: 'n1_thorn' });
  visibleReward(world, 13.5, -10.0, 'n1_thorn_prize', { shards: 22, potion: 1 }, 'silver');

  // ...AND TWO. A chest in the west heather with nothing in front of it at all.
  // No gate, no puzzle, no wall: it is simply somewhere a child in the wrong
  // shape will walk straight past, and a child in the right one will see from
  // ten units away. That is the whole lesson of the room in one object.
  visibleReward(world, -13.5, -8.5, 'n1_heather', { shards: 24, gear: 'dagger_a' });

  // WHAT YOU FIGHT IN THE DARK HAS TO BE VISIBLE IN THE DARK, and only one of
  // these two families is. A Shade is near-black by design (enemies.js: colour
  // 0x241a38 over emissive 0x2a1b3a at 0.35) and simply disappears in a blacked
  // out rig; a Moth carries emissive 0xffb25a at 1.4 and reads as a pair of
  // burning wings whatever the light is doing. So the shades stay on the LIT
  // side of z=2 where a child can see what is hitting them, and the dark half
  // is patrolled by the things that glow. The Dark Wolf still turns the whole
  // room readable — that is its reward, not the price of admission.
  world.markers.shadeSpots = [{ x: -5, z: 3 }, { x: 4, z: 3.5 }];
  world.markers.mothSpots = [{ x: 7.5, z: -10 }, { x: -8, z: -11 }];
  world.markers.breakables = [
    { x: -7.5, z: 6.5, kind: 'crate' }, { x: 6.0, z: 8.0, kind: 'barrel' },
    { x: -10.5, z: 2.0, kind: 'jar' }, { x: 9.5, z: -2.5, kind: 'box' },
  ];

  // THE ARRIVAL VIEW IS THE HALF THAT GETS DRESSED FIRST. verify-density
  // measures a 22.2u-wide band 12.9u ahead of the spawn and 4.5u behind it, so
  // from (0, 11) facing north that is x -11.1..11.1, z -1.9..13 — the camp and
  // the top of the road, and nothing past the dark line. Three passes of the
  // Market taught this the expensive way: props at the far end of a room do not
  // count, however many of them there are.
  coldHearth(world, -5.5, 9, D);
  wayshrine(world, 4.5, 9.5, -0.5, D);
  ruinedHome(world, -12.5, 8.5, 0.4, D, { w: 6, d: 5, keep: 0.5 });
  ruinedHome(world, 13.5, 10.5, -0.6, D, { w: 5.5, d: 4.5, keep: 0.4 });
  ruinedHome(world, -11.0, 1.0, 0.9, D, { w: 5, d: 4, keep: 0.35 });
  cartWreck(world, 2.5, 11.5, 0.6, D);
  cartWreck(world, -8.5, 4.5, -0.4, D);
  lowWall(world, -2.5, 7.0, 0.1, D, 3.4);
  lowWall(world, 6.5, 5.5, 0.5, D, 3.0);
  lowWall(world, -8.0, 11.5, -0.3, D, 2.8);
  lowWall(world, 8.5, 1.5, 0.8, D, 2.6);
  fallenColumn(world, 3.5, 3.0, 0.4, D, 3.2);
  fallenColumn(world, -6.0, 0.0, -0.8, D, 3.0);
  // NOTHING STANDS IN THE EAST LANE. The road forks either side of the washout
  // and the east fork is the way to the thorn nook, so it has to be a lane and
  // not a gap between props: a fallen column at (10, 6.5) plus the ruin behind
  // it left about three units against the wall, which a flood-fill calls
  // connected and a five-year-old on a joystick calls a wall. The column is
  // gone and the ruin has moved back into the corner.
  fallenColumn(world, 5.5, 7.5, 0.2, D, 2.8);
  rubbleField(world, -3.0, 12.0, 2.2, D, 10);
  rubbleField(world, 7.5, 11.0, 2.0, D, 9);
  rubbleField(world, 0.5, 2.5, 2.0, D, 9);
  aftermath(world, -10.0, 6.0, 2.0, D, 21);
  aftermath(world, 5.0, -0.5, 1.8, D, 22);
  // THE LAMPS NOBODY LIT. Two rows down the near stretch, and one lonely pair
  // out in the dark where the road bends — a torch is the only prop in the kit
  // that means "a person maintained this", which is what makes its being out
  // say something.
  roadside(world, D, [
    ['torch', -2.0, 12.0, 1.0, 0.2], ['torch', 2.0, 10.0, 1.0, -0.3],
    ['torch', -3.5, 6.0, 1.0, 0.5], ['torch', 3.0, 4.5, 1.0, -0.6],
        // ...and the two out in the dark stand BESIDE the lane, never on it: the
    // painted path runs x -9 from z -1 to -8, and a torch at (-9.5, -6) sat
    // squarely in it — 0.42u of collider on a 2.8u road, in the pitch dark.
    ['torch', -7.0, -1.5, 1.0, 0.3], ['torch', -11.5, -6.0, 1.0, -0.2],
    ['stump', -4.5, 10.5, 1.0, 0.7], ['stump', 8.0, 7.5, 1.0, -0.9],
    ['logStack', -9.0, 8.0, 1.0, 0.4], ['logStack', 5.5, 12.0, 1.0, -0.5],
    ['barrel', -6.5, 8.0, 1.0, 0.6], ['crate', -4.0, 8.5, 1.0, -0.4],
    ['vase', 5.5, 8.5, 1.0, 0.9], ['skull', 1.5, 6.0, 1.0, 0.3],
    ['brick', -1.0, 4.0, 1.0, 1.1], ['brick', 7.0, 3.0, 1.0, -0.7],
    ['stump', 10.5, 11.0, 1.0, 0.2], ['logStack', 9.0, -4.5, 1.0, 0.8],
    ['barrel', 11.0, -8.5, 1.0, -0.3], ['crate', -12.0, -3.0, 1.0, 0.5],
  ]);
  scatter(world, halfW, halfD, D, 81, 14, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA', 'rockLB'] });
  return finish(world, spec, D);
}

// --- N2 — THE WARDSTONE -----------------------------------------------------
export async function buildN2(scene) {
  const { world, spec, D } = base(scene, 'n2');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 4, r: 6.0, kind: 'gravel' }, { x: -11, z: -7, r: 3.8, kind: 'rubble' },
              { x: 10, z: 8, r: 3.4, kind: 'moss' }, { x: 12, z: -6, r: 3.2, kind: 'mud' }],
    pathWidth: 3.0,
    paths: [[[0, 12], [3, 5], [3, -4], [0, -12]], [[3, 1], [-6, 0], [-12, -1]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'n1', { x: 0, z: -11, angle: 0 });
  // ...AND INTO STONEROOT. This is the door `le` used to hold: beating the
  // Shadowgrip used to drop a child straight into the Great Vault, and now it
  // drops them onto the road that gets there.
  sideDoor(world, 'n', halfW, halfD, 'vh', { x: 0, z: 10, angle: Math.PI });

  // THE LOCK FOR THE REGION AHEAD. Cracked rock, glittering, with the chest
  // behind it in plain sight — the Earth Wolf is the next wolf a child earns
  // and this is the last thing they see before they go and earn it. Ember
  // already showed a crack gate (regions.js, `em_boulder` / `l1_crack_gate`),
  // so this is the promise repeated at the door of the region that keeps it,
  // which is the pattern every region in the game uses.
  wallRun(world, -16, -3.0, -11.5, -3.0, D);
  wallRun(world, -16, 1.0, -11.5, 1.0, D);
  promiseGate(world, -11.5, -1.0, 2.6, 4.0, 0x9a8c6a, 'CRACKED — later', 'crack',
              { system: 'crack', id: 'n2_wardstone_crack' });
  visibleReward(world, -14.0, -1.0, 'n2_crack_prize', { shards: 26, heartPiece: 1 }, 'silver');

  // THE DARK SIDE OF THE ROAD. n1 asked a child to WALK through the dark; this
  // one asks them to look into it and see there is something there. The
  // keepsake is in it.
  //
  // IT IS A BAND, NOT A PATCH. This used to be an east-corner rectangle
  // (x 5..halfW, z -halfD..-1.5) with lit floor all round two of its sides,
  // which is exactly the "random dark spot partially in a room" dad called out
  // from play. It now runs wall to wall from the far end back, the same shape
  // n1 uses: the road ahead is dark, and the ground you are standing on is not.
  darkZone(world, -halfW, halfW, -halfD, -1.5);

  // THE ROAD'S KEEPSAKE (js/treasures.js). One per level, found and never
  // bought, and worth nothing in a fight — a thing a child keeps because they
  // went and got it. Rule 3 of that file is why this line and the table entry
  // ship on the same day: a registry that runs ahead of the world is a `???`
  // in the collection that can never be filled.
  visibleReward(world, 12.5, -9.0, 'n2_keepsake',
    { shards: 34, treasure: 'wayfarers_key' }, 'gold');

  // ...and the same rule here: the dark corner is x>5, so both shades and both
  // hounds stand west of it, in light a child can fight by.
  world.markers.shadeSpots = [{ x: -4, z: 6 }, { x: 2, z: -6 }];
  world.markers.houndSpots = [{ x: -6, z: -8 }, { x: -2, z: -10 }];
  world.markers.breakables = [
    { x: -8, z: 4.5, kind: 'crate' }, { x: 7.5, z: 6.0, kind: 'barrel' },
    { x: -5.5, z: -2.5, kind: 'vase' }, { x: 9.0, z: 1.5, kind: 'box' },
  ];

  // THE MILESTONE ITSELF, at the fork, where the arrival view opens. The one
  // piece of dressing in either room that is doing signage: a cut column,
  // upright, with the road running past it — you are somewhere now, and the
  // next place has a name.
  wayshrine(world, 2.5, 6.5, 0.3, D);
  roadside(world, D, [
    ['pillar', 0.0, 7.5, 1.1, 0], ['pillar', -3.0, 4.0, 0.9, 0.4],
    ['column', 5.5, 8.5, 1.0, 0], ['column', -6.5, 9.0, 1.0, 0.2],
    ['torch', -1.5, 11.0, 1.0, 0.3], ['torch', 4.0, 10.0, 1.0, -0.4],
    ['torch', -4.0, 1.0, 1.0, 0.6], ['torch', 6.5, 3.0, 1.0, -0.2],
    ['crate', -7.5, 7.5, 1.0, 0.5], ['barrel', 8.0, 9.5, 1.0, -0.6],
    ['vase', -2.0, 8.5, 1.0, 0.8], ['brick', 3.5, 2.0, 1.0, 0.2],
    ['brick', -9.0, 2.5, 1.0, -0.9], ['skull', 7.0, -1.0, 1.0, 0.4],
    ['stump', -10.5, 6.5, 1.0, 0.7], ['logStack', 10.5, 5.0, 1.0, -0.3],
    // a spill of coins by the keepsake, out in the dark: the shimmer a child
    // sees first is the chest's, and this is what it turns out to be lying in
    ['coins', 11.5, -6.5, 1.0, 0.5], ['stump', 13.5, -11.0, 1.0, 0.2],
  ]);
  ruinedHome(world, -12.0, 8.0, -0.4, D, { w: 6, d: 5, keep: 0.55 });
  ruinedHome(world, 12.0, 10.5, 0.5, D, { w: 5.5, d: 4.5, keep: 0.45 });
  ruinedHome(world, -13.0, 4.0, 0.9, D, { w: 5, d: 4, keep: 0.35 });
  cartWreck(world, -5.0, 10.5, 0.6, D);
  cartWreck(world, 9.5, 7.0, -0.5, D);
  lowWall(world, -3.5, 12.0, 0.2, D, 3.4);
  lowWall(world, 6.0, 5.0, -0.4, D, 3.0);
  lowWall(world, -8.5, 0.5, 0.7, D, 2.8);
  lowWall(world, 2.0, 9.5, 1.0, D, 2.6);
  fallenColumn(world, -7.0, 3.5, 0.5, D, 3.2);
  fallenColumn(world, 8.5, 11.5, -0.8, D, 3.0);
  fallenColumn(world, -1.5, 2.0, 0.9, D, 2.8);
  rubbleField(world, 4.0, 12.0, 2.2, D, 10);
  rubbleField(world, -10.0, 11.0, 2.0, D, 9);
  rubbleField(world, -13.5, -8.0, 2.6, D, 11);
  aftermath(world, 10.0, 2.5, 2.0, D, 23);
  aftermath(world, -6.0, 6.5, 1.8, D, 24);
  scatter(world, halfW, halfD, D, 82, 14, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA', 'rockLB'] });
  return finish(world, spec, D);
}

export const LEVELNIGHT_ROOMS = { n1: buildN1, n2: buildN2 };
