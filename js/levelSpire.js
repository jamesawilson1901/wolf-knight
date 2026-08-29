// THE MOONLIT SPIRE — the last thing the game gives you.
//
// Dad: "I want to add another level at the end. You get the 'Elemental Wolf',
// essentially the avatar of the wolves... add this as the last thing you
// build."
//
// It is an EPILOGUE CAPSTONE, like the Village: not part of REGION_ORDER, no
// lock-and-key chain, no boss. It opens once the Village is restored, which is
// the last thing left to do, and it hands over the Elemental Wolf at the top.
// Everything it asks of a child is something they already know how to do — the
// point of a victory lap is to be good at the game, not to learn a ninth verb.
//
// Room ids use the `m` prefix. Taken already: l (Ember), v (Stoneroot),
// t (Wild Woods), s (Stormreach), d (Sunken Vale), x (Shadow Court),
// y (Village), and e/k/w/f/r for the retired hand-built rooms. rooms.js
// dispatches its art-kit load on a room id's FIRST LETTER, so reusing one
// would silently route the Spire through another region's kit.
//
// THE KIT IS EMBER'S, RE-TINTED. Nothing new is vendored: the Quaternius
// dungeon set (columns, arches, bars, pedestals, stairs) is exactly the
// masonry a tower is made of, and pulled cold violet-silver instead of ember
// orange it reads as a different building entirely. The standing rule against
// code-built creatures has a sibling here that nobody wrote down but everyone
// followed: don't vendor a kit for one level when a shipped one fits.
//
// WHY THE JUMP BUTTON IS HERE. Dad, from play: "currently there is no reason
// to use the jump button either. It doesn't dodge attacks, nowhere requires
// the user to jump over anything." The dodge half of that was fixed in
// player.js (AIR_GRACE). The other half is geometry, and it could not honestly
// be retrofitted into a verified room — Level 2's own comment says it out
// loud: "this is a SEEING puzzle, not a platforming one, and a five-year-old
// must never fail it for being half a unit off." So the required jumps are
// NEW geometry, here, in a room built around them, where the cost of a miss is
// already known to be gentle: world.pitAt puts a child back on the near shore
// and takes nothing (player.js, "A HOLE IN THE FLOOR COSTS THE WALK, NOT A
// HEART"). Every gap on the main line is 1.8u. A standing jump carries ~3.0u
// at the SLOWEST form's speed, so the main line has ~40% margin at the worst
// case and much more at a run. The one 2.4u gap in the room is optional and
// guards a chest.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { prepareModel } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow, spiritShrine,
  potSpotsOrFewer, reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { registerDistrictTints } from './districts.js';
import { emberKitRef } from './level1.js';
import { pushableBoulder, plateSwitch, plateBars } from './gates.js';

export const REGION = 'spire';

// The Spire borrows Ember's kit rather than loading a second copy of the same
// twenty-five files. rooms.js has already awaited loadEmberKit() by the time
// any builder here runs (its dispatch sends `m` there); this reads whatever
// that left behind, and answers null in greybox, which is the correct
// "wear the checkers" signal.
const kit = () => emberKitRef();
const GREY = () => !kit() || state.settings.greybox !== false;

// ---------------------------------------------------------------------------
// DISTRICTS. Two, and the arc between them is the whole story of the climb:
// the broken lower tower is cold and unlit, the crown at the top is the moon
// itself. Every other region warms or cools ACROSS four districts; this one
// has two and makes the jump between them enormous, because it is four rooms
// long and the payoff has to land.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  ascent: { tint: 0x8f88b8, floorTint: 0x6d6a86, wallTint: 0x2c2940, propTint: 0x7a7496,
            ground: 'spirestone', name: 'THE MOONLIT SPIRE', hero: 'THE BROKEN ASCENT' },
  moonhall: { tint: 0xd8cfff, floorTint: 0x8f89ad, wallTint: 0x393356, propTint: 0x9b93bd,
            ground: 'moonhall', name: "THE MOON'S CROWN", hero: 'THE CROWN' },
};

const M = MODULES;

export const MS = {
  m1: { ...M.island, kind: 'island', district: 'ascent', spine: true,
        label: 'THE BROKEN ASCENT', beat: 'the stair fell · three jumps · a ledge worth one more' },
  m2: { ...M.island, kind: 'island', district: 'ascent', spine: true, junction: true,
        label: 'THE HALL OF SIGILS', beat: 'two trials · two sigils · the way up' },
  ma: { ...M.pocket, kind: 'pocket', district: 'ascent', loopsTo: 'm2',
        label: 'THE TRIAL OF STONE', beat: 'the sigil of stone · a block, a plate, a vault' },
  mb: { ...M.pocket, kind: 'pocket', district: 'ascent', loopsTo: 'm2',
        label: 'THE TRIAL OF EMBERS', beat: 'the sigil of flame · four of the old enemies' },
  m3: { ...M.arena, kind: 'arena', district: 'moonhall', spine: true,
        label: "THE MOON'S CROWN", beat: 'LUNA → THE ELEMENTAL WOLF' },
};

registerDistrictTints(MS, DISTRICTS);

export const SPINE = ['m1', 'm2', 'm3'];

// ---------------------------------------------------------------------------
// THE TWO SIGILS. World state, not save flags, for the same reason the
// Village's guardians are: a room needs to ask "is this done" while it is
// BUILDING, from a plain import, without reaching into the save format.
// ---------------------------------------------------------------------------
export const sigilStone = () => !!state.flags.plates.m_sigil_stone;
export const sigilFlame = () => !!WS.get(REGION, 'sigil_flame');
export const crownOpen = () => sigilStone() && sigilFlame();

// ---------------------------------------------------------------------------

const { ruinedHome, fallenColumn, rubbleField, wayshrine, lowWall } =
  makeDressers({ kit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const { shell, sideDoor, wallRun, visibleReward, pit } =
  makeBuilders({ kit, isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

function base(scene, id) {
  const spec = MS[id];
  const world = new World(scene);
  world.bgColor = 0x0e0c1a;   // a night sky, not Ember's ember-lit murk
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#d8cfff', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#8f88b8', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// A SLAB OF THE OLD STAIR, still standing over the drop. Registered as a safe
// zone (world.pitAt checks safeZones first — "a plank laid across a pit is
// floor") and dressed with real stair pieces so the thing a child is asked to
// land on looks like something you could land on.
function stairPad(world, minX, maxX, minZ, maxZ, D) {
  world.addSafe(minX, maxX, minZ, maxZ);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  // NOTHING GETS PLACED ON A LANDING PAD. Every dresser consults blocked(),
  // and a column dropped in the middle of the only square you can land on is
  // the difference between a jump and a trap.
  world.reserve(cx, cz, Math.max(maxX - minX, maxZ - minZ) / 2 + 0.4, 'pad');
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(maxX - minX, 0.24, maxZ - minZ),
      new THREE.MeshStandardMaterial({ color: 0x6d6a86, roughness: 0.9 })
    );
    m.position.set(cx, 0.12, cz);
    world.add(m);
    return;
  }
  const g = new THREE.Group();
  const w = maxX - minX, d = maxZ - minZ;
  // tile the pad with floor pieces so its EDGE is where the geometry ends —
  // a pad drawn smaller than its safe zone teaches the wrong landing spot
  for (let x = minX + 1; x < maxX; x += 2) {
    for (let z = minZ + 1; z < maxZ; z += 2) {
      const t = tinted(kit().floor, 'floor', D.floorTint);
      if (!t) continue;
      t.position.set(x, 0.02, z);
      t.scale.setScalar(1.05);
      g.add(t);
    }
  }
  // a lip of broken masonry round the rim, so the drop has an edge you can see
  for (let i = 0; i < 6; i++) {
    const b = tinted(kit().brick, 'brick', D.propTint);
    if (!b) break;
    const a = (i / 6) * Math.PI * 2;
    b.position.set(cx + Math.cos(a) * (w / 2 - 0.3), 0.05, cz + Math.sin(a) * (d / 2 - 0.3));
    b.rotation.y = a;
    g.add(b);
  }
  world.add(g);
}

// ---------------------------------------------------------------------------
// m1 — THE BROKEN ASCENT
//
// The stair up the tower fell a long time ago and two pieces of it are still
// standing over the drop, with a third slab broken off to the east. This is
// the first room in the game a child cannot walk through: the void spans the
// room wall to wall, so going around is not an option, and the jump button
// stops being decoration.
//
// THE MISS IS CHEAP ON PURPOSE. `world.pitReturn` is the near shore, three
// steps back, not the door — so a missed jump costs one run-up, never the
// room, never a heart, and never the walk from another region.
//
// It is set to the NEAR (Village-side) shore rather than to wherever the wolf
// came from, and that asymmetry is deliberate: a fall on the way UP costs a
// run-up, and a fall on the way back DOWN drops you on the side you were
// heading for anyway. The room is never kinder to leave than to enter, and it
// is never possible to be stranded on the far side of it.
// ---------------------------------------------------------------------------
export async function buildM1(scene) {
  const { world, spec, D } = base(scene, 'm1');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: -9, r: 5.0, kind: 'gravel' }, { x: 0, z: 10, r: 4.5, kind: 'rubble' },
              { x: -11, z: -10, r: 3.6, kind: 'rubble' }, { x: 11, z: 10, r: 3.4, kind: 'gravel' }],
    paths: [[[0, 12], [0, 8]], [[0, -8], [0, -12]]],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  // back down the stair, and out at the foot of it — the Spire's door is on
  // the Square's south wall at centre 12, so that is where this puts you down
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 12, z: 10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'm2', { x: 0, z: 11, angle: Math.PI });

  // THE VOID, then the pieces of stair still standing in it. The order
  // matters: pit() registers the hole, stairPad() registers the safe squares
  // that override it, and both must be down before any dresser runs so the
  // reservations they make are the ones the dressing sees.
  //   near shore ends  z = +3.6
  //   gap 1           z = +3.6 .. +1.8   (1.8u)
  //   PAD A           z = +1.8 .. -0.8   (2.6u to stand on and line the next up)
  //   gap 2           z = -0.8 .. -2.6   (1.8u)
  //   PAD B           z = -2.6 .. -5.2   (2.6u)
  //   gap 3           z = -5.2 .. -6.8   (1.6u — the last one is the kindest)
  //   far shore from  z = -6.8
  pit(world, -halfW, halfW, -6.8, 3.6);
  world.pitReturn = { x: 0, z: 6.4 };     // the near shore, one run-up back
  stairPad(world, -5, 5, -0.8, 1.8, D);   // PAD A
  stairPad(world, -5, 5, -5.2, -2.6, D);  // PAD B
  // THE LEDGE. Optional, and the only 2.4u gap in the room: a chest you can
  // see from both pads and have to want. Nothing behind it, no path onward —
  // a child who never makes it loses a chest and no progress at all.
  stairPad(world, 7.4, 13.2, -1.6, 2.4, D);
  visibleReward(world, 10.3, 0.4, 'm_ascent_ledge', { shards: 26, heartPiece: 1 }, 'silver');

  world.markers.restSpot = { x: 0, z: 8 };
  world.markers.breakables = [{ x: -4.5, z: 8.5, kind: 'crate' }, { x: 5.2, z: -9.5, kind: 'barrel' }];

  // dressing LAST, so every reservation above is already standing
  ruinedHome(world, -11, 8, 0.5, D);
  fallenColumn(world, 9, 7.5, -0.5, D, 3.4);
  fallenColumn(world, -9, -9.5, 0.9, D, 3.0);
  rubbleField(world, 0, 11.5, 4.5, D, 12);
  rubbleField(world, 0, -10.5, 4.0, D, 10);
  rubbleField(world, -13, 0, 2.2, D, 8);
  rubbleField(world, 13, 6, 2.0, D, 7);
  wayshrine(world, -6.5, 9.5, 0.4, D);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// m2 — THE HALL OF SIGILS
//
// A junction with two trials off it and the way up barred until both are done.
// The bars are the payoff rule the whole puzzle rebuild was written to (dad:
// "all puzzles should either open the way or reward the player"), applied at
// the level's scale instead of a room's: the two trials each pay their own
// reward AND together open the last door in the game.
// ---------------------------------------------------------------------------
export async function buildM2(scene) {
  const { world, spec, D } = base(scene, 'm2');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 6.0, kind: 'gravel' }, { x: -12, z: -8, r: 3.6, kind: 'rubble' },
              { x: 12, z: 8, r: 3.4, kind: 'rubble' }],
    paths: [[[0, 12], [0, 5]], [[0, -5], [0, -12]], [[-5, 0], [-15, 0]], [[5, 0], [15, 0]]],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'm1', { x: 0, z: -11, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'ma', { x: 8, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'mb', { x: -8, z: 0, angle: Math.PI / 2 });
  // THE LAST DOOR. Barred until both sigils burn; the way back south is never
  // barred, so a child who cannot finish a trial can always leave.
  sideDoor(world, 'n', halfW, halfD, 'm3', { x: 0, z: 11, angle: Math.PI },
    { when: crownOpen });

  world.reserve(0, 0, 3.2, 'altar');
  world.reserve(0, -9.5, 2.4, 'crownBars');
  if (!GREY()) {
    plateBars(world, prepareModel, kit().bars, 'm_crown', 0, -9.5,
      { span: 2.6, tint: 0x6f68a0, solved: crownOpen });
  }

  // THE ALTAR, and the two sigils standing on it. Each is a stone that is dark
  // until its trial is done and then burns in that trial's colour — the only
  // readout in the room, and readable from the doorway a child walks in by.
  altar(world, 0, 0, D);
  sigil(world, -1.7, 0.6, 0xd8b06a, sigilStone());   // stone, earth-gold
  sigil(world, 1.7, 0.6, 0xff7a3a, sigilFlame());    // flame, ember-orange

  world.markers.restSpot = { x: 0, z: 6 };
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);

  lowWall(world, -8, -6, 0, D, 5);
  lowWall(world, 8, 6, 0, D, 5);
  fallenColumn(world, -12, 5, 0.3, D, 3.6);
  fallenColumn(world, 12, -5, -0.8, D, 3.6);
  rubbleField(world, -13, -9, 2.4, D, 9);
  rubbleField(world, 13, 9, 2.4, D, 9);
  wayshrine(world, -5.5, -7, 0.2, D);
  wayshrine(world, 5.5, -7, -0.2, D);
  return finish(world, spec, D);
}

// A low round dais. Real pedestal pieces in dressed mode; a disc in greybox.
function altar(world, x, z, D) {
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.9, 0.3, 16),
      new THREE.MeshStandardMaterial({ color: 0x8f88b8, roughness: 0.9 })
    );
    m.position.set(x, 0.15, z);
    world.add(m);
    return;
  }
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const p = tinted(kit().floor, 'floor', D.floorTint);
    if (!p) break;
    const a = (i / 8) * Math.PI * 2;
    p.position.set(x + Math.cos(a) * 1.6, 0.03, z + Math.sin(a) * 1.6);
    g.add(p);
  }
  for (let i = 0; i < 4; i++) {
    const c = tinted(kit().pedestal, 'pedestal', D.propTint);
    if (!c) break;
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    c.position.set(x + Math.cos(a) * 2.4, 0, z + Math.sin(a) * 2.4);
    g.add(c);
  }
  world.add(g);
}

// ONE SIGIL. Dark stone until its trial is done, then a lit crystal turning
// over the altar. Kept out of the static batch (keepLoose) because it turns.
function sigil(world, x, z, colour, lit) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({
      color: lit ? 0x000000 : 0x2a2740,
      emissive: lit ? colour : 0x000000,
      emissiveIntensity: lit ? 3.4 : 0, roughness: 0.8,
    })
  );
  m.position.set(x, 1.15, z);
  world.add(m);
  world.keepLoose(m);
  if (lit) {
    const l = new THREE.PointLight(colour, 1.4, 5.5, 1.9);
    l.position.set(x, 1.4, z);
    world.add(l);
    world.keepLoose(l);
  }
  world.onAnimate((t) => {
    m.rotation.y = t * (lit ? 1.1 : 0.25);
    m.position.y = 1.15 + (lit ? Math.sin(t * 1.6) * 0.12 : 0);
  });
}

// ---------------------------------------------------------------------------
// ma — THE TRIAL OF STONE
//
// One block, one plate, one vault. Deliberately the SAME shape as the very
// first puzzle in the game (Ember's lg1) — the last level asking a child to do
// the first thing they ever learned, at the end, and have it open the last
// door. It pays twice, like lg1 does: the vault opens and the sigil lights.
// ---------------------------------------------------------------------------
export async function buildMa(scene) {
  const { world, spec, D } = base(scene, 'ma');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {
    patches: [{ x: 0, z: 0, r: 4.0, kind: 'gravel' }, { x: -7, z: -5, r: 2.8, kind: 'rubble' }],
  });
  world.spawn = { x: 7, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'm2', { x: -14, z: 0, angle: Math.PI / 2 });

  // PUZZLE FURNITURE BEFORE DRESSING — the law Ember's rebuild paid for twice.
  // reserve() is what world.blocked() answers with, and every dresser asks it,
  // so a lane reserved here is a lane the columns politely decline to stand in.
  // Reserved afterwards it reserves nothing: the props are already down.
  // THREE TRIES AT THIS ROOM, AND THE THIRD IS THE ONE THAT IS KIND.
  // tools/run-spire.mjs walked all three; each failure below is one it caught.
  //
  //   1. The block started WEST of the plate and wanted an eastward push — so
  //      the walk in from the east door leaned on its east face the whole way
  //      and shoved it two steps AWAY from the plate before the plate had even
  //      been seen. A puzzle its own approach un-solves is a trap.
  //
  //   2. Flipped round, the direction was right, but an approach half a metre
  //      off the lane pushed the block SIDEWAYS instead: a lean picks the
  //      cardinal direction of greatest offset, and a long lane gives that
  //      several chances to happen.
  //
  //   3. So the lane got walls — and walls turned a recoverable mistake into
  //      an unrecoverable one. Once the wolf was west of the block inside a
  //      corridor it could not squeeze back past it to push again, and the
  //      room was dead until the child left and came back. That is a worse
  //      bug than the one it fixed, and it is exactly the failure a five-year-
  //      old would hit and not understand.
  //
  // What is here now is the OPEN room with the SHORTEST push in the game: the
  // block sits between the east door and the plate, so walking in pushes it
  // the way it needs to go, and it is TWO steps. Every extra step is another
  // chance for a lean to go sideways, and this is the last level — a victory
  // lap, not an exam.
  //
  // And if a lean does send it off the lane, the floor all round is open, and
  // the 1.2u step grid means a push back is exact: a block knocked to z = -4.2
  // goes back to z = -3.0 in one northward shove. Nothing about this room can
  // be made unwinnable, which is worth more than making it impossible to get
  // wrong — and re-entering rebuilds the block where it started anyway.
  for (let x = -3.6; x <= -1.2; x += 1.2) world.reserve(x, -3, 1.4, 'maLane');
  world.reserve(0.2, -3, 1.4, 'maLaneMouth');
  world.reserve(-6.5, 3.2, 1.8, 'maVault');
  world.reserve(-6.5, 1.4, 1.8, 'maBars');

  // GREYBOX RENDERS THE SPACE, NOT THE FURNITURE. A boulder, a set of bars
  // and a chest are all MADE OF the art kit, so in greybox (which exists to
  // judge a layout before any art is placed) there is nothing to make them
  // out of. The lane, the plate, the vault walls and every reservation are
  // still here, which is the part a greybox pass is for.
  if (!GREY()) pushableBoulder(world, prepareModel, kit().rockSA, -1.2, -3);
  // the vault, cut into the west wall, visible from the door you walk in by
  wallRun(world, -8.2, 1.6, -8.2, 4.6, D);
  wallRun(world, -4.8, 1.6, -4.8, 4.6, D);
  visibleReward(world, -6.5, 3.2, 'm_ma_vault', { shards: 22, gear: 'hammer_earth' }, 'gold');
  const maBars = GREY() ? { open() {} }
    : plateBars(world, prepareModel, kit().bars, 'm_sigil_stone', -6.5, 1.4,
        { span: 2.6, tint: 0x6f68a0 });
  plateSwitch(world, 'm_sigil_stone', -3.6, -3, () => { maBars.open(); });

  world.markers.breakables = [{ x: 6.5, z: 4.5, kind: 'vase' }, { x: -6, z: -5.5, kind: 'crate' }];
  fallenColumn(world, 5.5, -5.5, 0.7, D, 3.0);
  rubbleField(world, -7.5, -5.5, 2.0, D, 8);
  rubbleField(world, 7.5, 2.5, 1.8, D, 7);
  lowWall(world, 1.5, 5.5, 0, D, 4);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// mb — THE TRIAL OF EMBERS
//
// Four of the enemies a child has already beaten somewhere else, together, in
// one room, once. The reward is behind bars they can see from the door, so the
// fight opens something rather than merely ending — the same rule the plates
// were rebuilt to, applied to a fight.
//
// Nothing here is new, and that is the design: the last trial before the crown
// is the game asking whether you learned it.
// ---------------------------------------------------------------------------
export async function buildMb(scene) {
  const { world, spec, D } = base(scene, 'mb');
  const cleared = sigilFlame();
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 4.5, kind: 'scorch' }, { x: 6, z: 5, r: 2.8, kind: 'rubble' }],
  });
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'm2', { x: 14, z: 0, angle: -Math.PI / 2 });

  world.reserve(6.5, 3.2, 1.8, 'mbVault');
  world.reserve(6.5, 1.4, 1.8, 'mbBars');
  wallRun(world, 4.8, 1.6, 4.8, 4.6, D);
  wallRun(world, 8.2, 1.6, 8.2, 4.6, D);
  visibleReward(world, 6.5, 3.2, 'm_mb_vault', { shards: 22, gear: 'shield_moon' }, 'gold');
  const mbBars = GREY() || cleared ? { open() {} }
    : plateBars(world, prepareModel, kit().bars, 'm_sigil_flame', 6.5, 1.4,
        { span: 2.6, tint: 0x6f68a0, solved: sigilFlame });

  // FOUR, AND ONE OF EACH SHAPE a child has learned to read: something that
  // charges, something that throws, something that duels and something that
  // flanks. Not five of one thing — the trial is "do you know them", not
  // "can you out-last a crowd".
  if (!cleared) {
    world.markers.arcKnightSpots = [{ x: 1.5, z: -3.5 }];
    world.markers.stormcallerSpots = [{ x: -3.5, z: 3.5 }];
    world.markers.gildedHuskSpots = [{ x: 2.5, z: 4.0 }];
    world.markers.emberfangSpots = [{ x: -4.5, z: -3.5 }];
  }
  world.onAnimate(() => {
    if (WS.get(REGION, 'sigil_flame') || !world.enemies || !world.enemies.length) return;
    if (world.enemies.every((e) => e.dead || e.scenery)) {
      WS.set(REGION, 'sigil_flame');
      mbBars.open();
    }
  });

  world.markers.breakables = [{ x: -6.5, z: 4.5, kind: 'barrel' }, { x: 7, z: -4.5, kind: 'cask' }];
  fallenColumn(world, -6, -5.5, 0.4, D, 3.0);
  rubbleField(world, 6.5, -5.5, 2.0, D, 8);
  lowWall(world, -2, 6, 0, D, 4);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// m3 — THE MOON'S CROWN
//
// The top of the tower, open to the sky, and Luna waiting in it. No fight:
// the last boss was Grimm and the Village was the cool-down. This is the
// ceremony, and the only thing in the room is the light she gives you.
//
// The grant itself is one marker. main.js has read `sparkSpot.grants` since
// the A3 fix — the shrine names the wolf, main.js runs the ceremony, and the
// SPARK/HOWTO tables there mean a form cannot be granted without a line
// telling a child how to hold it.
// ---------------------------------------------------------------------------
export async function buildM3(scene) {
  const { world, spec, D } = base(scene, 'm3');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 6.0, kind: 'gravel' }],
    paths: [[[0, 12], [0, 2]]],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'm2', { x: 0, z: -11, angle: 0 });

  world.reserve(0, -2, 4.0, 'crown');
  altar(world, 0, -2, D);
  // Luna's own light, the same shrine every spirit's gift has stood in
  spiritShrine(world, 0, -2, 0xf2ecff, 1.35);
  world.markers.sparkSpot = { x: 0, z: -2, grants: 'elemental_wolf' };
  world.markers.restSpot = { x: 0, z: 7 };
  // and the last chest in the game, standing open to the sky beside her
  visibleReward(world, -7.5, -6, 'm_crown', { shards: 40, heartPiece: 1 }, 'gold');

  // SEVEN LIGHTS AROUND THE RIM, one per element, already burning when you
  // walk in — the room is the swirl the wolf is about to wear, drawn large.
  const COLS = [0xff7a3a, 0xd8b06a, 0x8fdc6a, 0xbfefff, 0xfff4b0, 0x8fe4ff, 0xb08aff];
  COLS.forEach((c, i) => {
    const a = (i / COLS.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * 9.5, z = Math.sin(a) * 9.5 - 1;
    const l = new THREE.PointLight(c, 1.5, 7.5, 1.9);
    l.position.set(x, 1.5, z);
    world.add(l);
    world.keepLoose(l);
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: 3.6, roughness: 1 })
    );
    m.position.set(x, 1.5, z);
    world.add(m);
    world.keepLoose(m);
    world.reserve(x, z, 1.2, 'rimlight');
    world.onAnimate((t) => {
      m.position.y = 1.5 + Math.sin(t * 1.3 + i) * 0.14;
      m.rotation.y = t * 0.8 + i;
    });
  });

  world.markers.breakables = [{ x: 8, z: -6, kind: 'vase' }];
  fallenColumn(world, -10, 6, 0.5, D, 3.4);
  fallenColumn(world, 10, 6, -0.5, D, 3.4);
  rubbleField(world, 0, 11, 3.0, D, 8);
  return finish(world, spec, D);
}

export const LEVELSPIRE_ROOMS = { m1: buildM1, m2: buildM2, ma: buildMa, mb: buildMb, m3: buildM3 };
