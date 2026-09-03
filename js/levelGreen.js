// THE GREENWAY — the road between Stoneroot Caverns and the Wild Woods.
//
// THE THIRD INTERSTITIAL, at gap TWO (design/LEVEL-DESIGN-BRANCHES.md: "build
// where the players actually are"). The Bone Warden's crypt used to open
// straight onto Thornedge; it opens onto two rooms of road now, and the road
// is the thing Stoneroot's own restoration promised — regions.js's ripple for
// the region is "a living vine through the NE wall: the Wild Woods calling".
// This is where the vine goes.
//
// GRADUATE THE VERB BEHIND: the Earth Wolf is the wolf a child has JUST been
// handed, and Stoneroot taught the stomp as a thing you do to a cracked pile
// in a side room. Here the road itself is cracked rock — the fall that closed
// the old way up — and the stomp is how you walk. Once required, twice
// rewarded, the way Ember Deep does burning.
//
// SHOW THE LOCK AHEAD: the first bramble. The Woods will teach the Verdant
// Wolf to cut it; here it is a green wall across a nook with a spoil weapon
// showing through, one room before the region that keeps the promise.
//
// WHAT IT DOES NOT DO: no wolf, no boss, no new verb, NO PUPS (the heart
// awards key on a global running count — js/levelNight.js has the note). It
// pays in a keepsake behind a crack a child CAN open now (js/treasures.js,
// rule 3: found, never bought, reachable the day it ships).
//
// EVERY ASSET IS ALREADY PAID FOR. The stone is Stoneroot's kit and the trees
// are the Wild Woods' Quaternius forest, both licence-cleared in MANIFEST.json
// and both cached by URL — the road is the seam between two kits a child has
// already downloaded, or is about to.
import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { loadGLB } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow,
  reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { registerDistrictTints } from './districts.js';

export const REGION = 'green';

let greenKit = null;
const GREY = () => !greenKit || state.settings.greybox !== false;

export async function loadGreenKit() {
  if (greenKit) return greenKit;
  const names = {
    // --- the stone (Stoneroot's kit, cached by URL) ---------------------------
    floor:   './assets/env/floor-tile.glb',
    cliff:   './assets/env/cliff-block.glb',
    rockLA:  './assets/env/rock-large-a.glb',
    rockLB:  './assets/env/rock-large-b.glb',
    rockLC:  './assets/env/rock-large-c.glb',
    rockSA:  './assets/env/rock-small-a.glb',
    rockSB:  './assets/env/rock-small-b.glb',
    pillar:  './assets/env/pillar.glb',
    column:  './assets/env/dungeon/Column.glb',
    column2: './assets/env/dungeon/Column2.glb',
    arch:    './assets/env/dungeon/Arch.glb',
    archDoor:'./assets/env/dungeon/Arch_Door.glb',
    wallMod: './assets/env/dungeon/Wall_Modular.glb',
    pedestal:'./assets/env/dungeon/Pedestal.glb',
    barrel:  './assets/env/dungeon/Barrel.glb',
    crate:   './assets/env/dungeon/Crate.glb',
    vase:    './assets/env/dungeon/Vase.glb',
    brick:   './assets/env/dungeon/Brick.glb',
    skull:   './assets/env/dungeon/Skull.glb',
    logStack:'./assets/env/log-stack.glb',
    stump:   './assets/env/stump.glb',
    // --- the trees (the Wild Woods' kit, cached by URL) -----------------------
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
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  greenKit = Object.fromEntries(entries);
  return greenKit;
}

// TWO DISTRICTS, and the whole road is the change between them: the first is
// still the caverns — brown stone, one root through it — and the second is the
// first daylight and the first WHOLE green a child has seen in the game, so
// that Thornedge, one door on, reads as something gone wrong with it.
export const DISTRICTS = {
  rootway: { tint: 0xa8763c, floorTint: 0x7d6a48, wallTint: 0x33281c, propTint: 0x8a7248,
             ground: 'quarry', name: 'THE ROOTWAY', hero: 'THE ROCKFALL' },
  daylight:{ tint: 0x8fdc6a, floorTint: 0x6f9e55, wallTint: 0x2a3a22, propTint: 0x6fae4a,
             ground: 'glade',  name: 'THE FIRST TREES', hero: 'THE VINE' },
};

const M = MODULES;

export const LG = {
  g1: { ...M.island, kind: 'island', district: 'rootway', spine: true,
        label: 'THE ROOTWAY', beat: 'the rockfall · crack the road · the keepsake' },
  g2: { ...M.island, kind: 'island', district: 'daylight', spine: true,
        label: 'THE FIRST TREES', beat: 'daylight · the vine · the first bramble' },
};

registerDistrictTints(LG, DISTRICTS);

export const SPINE = ['g1', 'g2'];

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward } =
  makeBuilders({ kit: () => greenKit, isGrey: () => GREY() });

const { ruinedHome, fallenColumn, rubbleField, wayshrine, lowWall, grove, thicket, cartWreck } =
  makeDressers({ kit: () => greenKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

function base(scene, id) {
  const spec = LG[id];
  const world = new World(scene);
  world.bgColor = spec.district === 'rootway' ? 0x14100c : 0x0d1410;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#e8dcc0', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#a8763c', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// A CRACKED PILE — the Earth Wolf's verb, in the shape Stoneroot taught it
// (level2.js crackedPile, ported: same glitter, same 0.8u collider, same
// crackables entry world.crackAt walks). `state.flags.cracked[id]` is the
// save flag, so a stomped pile stays stomped.
function crackedPile(world, id, x, z, big = false) {
  const done = !!(state.flags.cracked && state.flags.cracked[id]);
  if (done) return null;
  const s = big ? 1.5 : 1.0;
  world.reserve(x, z, 1.4 * s, 'crack:' + id);
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.6 * s, 1.5 * s, 1.6 * s),
      new THREE.MeshStandardMaterial({ color: 0x9a8c6a, roughness: 0.9, emissive: 0xd8c07a, emissiveIntensity: 0.22 })
    );
    m.position.set(x, 0.75 * s, z);
    const gg = new THREE.Group();
    gg.add(m);
    world.add(gg);
    world.addCircle(x, z, 0.8 * s);
    const col = world.circleColliders[world.circleColliders.length - 1];
    world.crackables.push({ id, x, z, hitR: 0.9 * s, group: gg, collider: col });
    return gg;
  }
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = tinted(greenKit[i ? 'rockSA' : 'rockLB'], 'crack', 0x9a8c6a, 0.95 + i * 0.05);
    p.position.set(x + (i - 1) * 0.55 * s, i * 0.3 * s, z + ((i % 2) - 0.5) * 0.5 * s);
    p.rotation.y = i * 1.7;
    p.scale.setScalar((i ? 0.7 : 1.05) * s);
    g.add(p);
  }
  const glint = new THREE.Mesh(
    new THREE.RingGeometry(0.7 * s, 0.95 * s, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })
  );
  glint.rotation.x = -Math.PI / 2;
  glint.position.set(x, world.deckY + 0.04, z);
  world.add(glint);
  world.keepLoose(glint);
  world.add(g);
  world.keepLoose(g);
  world.addCircle(x, z, 0.8 * s);
  const col = world.circleColliders[world.circleColliders.length - 1];
  world.crackables.push({ id, x, z, hitR: 0.9 * s, group: g, collider: col,
    clear: () => {
      const i = world.circleColliders.indexOf(col);
      if (i >= 0) world.circleColliders.splice(i, 1);
      glint.visible = false;
    } });
  return g;
}

// THE VINE. Stoneroot's restoration grew "a living vine through the NE wall"
// of the crypt; this is the rest of it, running the length of the road — a
// green line on brown stone a child follows without being told. Geometry,
// not a kit prop: a chain of leaning stones with a green glint on each, so it
// reads in greybox and dressed alike and never asks the kit for a vine model
// it does not have.
function vine(world, points) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f7a2e, roughness: 0.85 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8fdc6a, emissiveIntensity: 1.3, roughness: 1 });
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.1));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.9, 3, 6), mat);
      seg.position.set(x, 0.12, z);
      seg.rotation.z = Math.PI / 2;
      seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      g.add(seg);
      if (k % 2 === 0) {
        const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), glow);
        leaf.position.set(x, 0.3, z);
        g.add(leaf);
      }
    }
  }
  // NOT kept loose: the vine is forty small meshes and static, and left out of
  // the batch it cost g1 its whole draw budget (132 calls against 125). It
  // merges into two batches by material, and the leaves' glow is a constant.
  world.add(g);
}

// --- G1 — THE ROOTWAY --------------------------------------------------------
export async function buildG1(scene) {
  const { world, spec, D } = base(scene, 'g1');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: -2, r: 6.5, kind: 'rubble' }, { x: -10, z: 7, r: 3.8, kind: 'gravel' },
              { x: 11, z: -7, r: 3.4, kind: 'moss' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [-3, 5], [-2, -3], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  // BACK DOWN INTO THE WARDEN'S CRYPT, and on up to the first trees.
  //
  // OFF THE THRONE'S AXIS. The crypt's onward gap is cut in its north wall and
  // the Warden's throne stands at (0, -9) with a 2.1 collider, so a landing at
  // (0, -10.5) put a child one and a half metres inside it: resolveCircle shoved
  // them to (0, -11.42), wedged between the throne and the rock plug that seals
  // the gap. Measured, not read — world.blocked names the claim and
  // resolveCircle gives the push (verify-landings §3, 0.92).
  //
  // The whole of x = 0 is unusable between z -13 and -7.5 for the same reason,
  // so the landing steps aside rather than back: the throne is the composition
  // of that arena and the door is behind it by design.
  sideDoor(world, 's', halfW, halfD, 'vz', { x: 2.6, z: -10.8, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'g2', { x: 0, z: 11, angle: Math.PI });

  // THE ROCKFALL. The old way up came down years ago, and the road north is
  // cracked rock wall to wall between two spurs of the cavern: the one pile ON
  // the road is the exam (the stomp Stoneroot taught, now the way you walk),
  // and the wall either side of it is what makes the pile the only way.
  //
  // WALLED TO THE PILE. The first cut left 2.4u either side of the rock and a
  // flood-fill walked straight round it — a gate that is not the only way in
  // is decoration. wallRun pads its collider 0.5u past each end, so a run to
  // ±1.8 reaches ±1.3, and the big pile's 1.2u collider closes the rest.
  wallRun(world, -16, -4.0, -1.8, -4.0, D);
  wallRun(world, 1.8, -4.0, 16, -4.0, D);
  crackedPile(world, 'g1_road', 0, -4.0, true);
  world.markers.crackPromise = { x: 0, z: -4.0 };
  world.markers.heroSpot = { x: 0, z: -4.0 };
  world.reserve(0, -4.0, 3.2, 'the rockfall');

  // ...AND TWICE REWARDED. Two more piles off the road, one each side, each
  // with something behind it — so stomping is a thing you go looking to do.
  // (each nook is a corner of the room closed by a wall run with a 2.0u
  // mouth, the pile's 0.8u collider in the mouth — the slivers left either
  // side are narrower than Kael)
  wallRun(world, -12.0, 2.0, -12.0, 6.5, D);
  wallRun(world, -12.0, 9.5, -12.0, 12.5, D);
  crackedPile(world, 'g1_west', -12.0, 8.2);
  visibleReward(world, -14.0, 10.5, 'g1_west_prize', { shards: 18, potion: 1 }, 'silver');
  // THE KEEPSAKE, behind the third crack — a thing a child can open TODAY,
  // which is rule 3 of js/treasures.js.
  wallRun(world, 10.5, -12.5, 10.5, -7.0, D);
  wallRun(world, 10.5, -7.0, 12.2, -7.0, D);
  wallRun(world, 14.6, -7.0, 16, -7.0, D);
  crackedPile(world, 'g1_east', 13.4, -7.0);
  visibleReward(world, 13.5, -10.0, 'g1_keepsake', { shards: 30, treasure: 'rootstone' }, 'gold');

  // THE VINE runs the road, and past the rockfall it is the only green thing
  vine(world, [[1.4, 13], [1.6, 5], [1.5, -2.5], [1.6, -6], [1.2, -13]]);

  world.markers.slimeSpots = [{ x: -5, z: 5 }, { x: 4, z: 1 }];
  world.markers.batSpots = [{ x: -8, z: -9 }, { x: 7, z: -8 }];
  world.markers.spitterSpots = [{ x: 6, z: 7 }];
  world.markers.breakables = [
    { x: -8.0, z: 10.5, kind: 'vase' }, { x: 7.5, z: 10.0, kind: 'crate' },
    { x: -7.0, z: -9.5, kind: 'barrel' }, { x: 12.5, z: 3.5, kind: 'jar' },
  ];
  world.markers.restSpot = { x: -6, z: 9 };

  // the caverns' last room: cut stone gone to ruin, and the roof open somewhere
  // above so the first grass has found the floor
  fallenColumn(world, -6.5, 8.5, 0.5, D, 3.0);
  fallenColumn(world, 8.0, 9.5, -0.9, D, 3.2);
  fallenColumn(world, -9.5, -7.5, 0.3, D, 2.8);
  ruinedHome(world, -12.5, 12.0, 0.4, D, { w: 5.5, d: 4.5, keep: 0.45 });
  ruinedHome(world, 12.5, 11.5, -0.5, D, { w: 5.5, d: 4.5, keep: 0.4 });
  lowWall(world, -3.5, 9.5, 0.2, D, 3.0);
  lowWall(world, 5.5, 4.5, 0.7, D, 2.6);
  lowWall(world, -8.5, 1.5, -0.4, D, 2.8);
  wayshrine(world, 6.5, 12.0, 0.5, D);
  rubbleField(world, -2.5, 13.0, 2.0, D, 9);
  rubbleField(world, 10.0, 6.0, 1.8, D, 8);
  rubbleField(world, -13.5, -1.5, 2.2, D, 10);
  rubbleField(world, 4.0, -8.5, 2.0, D, 9);
  cartWreck(world, -10.5, 4.5, 0.8, D);
  thicket(world, 3.5, 11.0, 1.8, D, { n: 7 });
  thicket(world, -4.5, 3.0, 1.6, D, { n: 6 });
  thicket(world, 8.5, -1.0, 1.5, D, { n: 5 });
  grove(world, -13.5, -10.5, 1.8, D, { trees: 2, sick: 0.5 });
  scatter(world, halfW, halfD, D, 61, 12, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLA'] });
  return finish(world, spec, D);
}

// --- G2 — THE FIRST TREES ---------------------------------------------------
export async function buildG2(scene) {
  const { world, spec, D } = base(scene, 'g2');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 2, r: 6.0, kind: 'grass' }, { x: -10, z: -6, r: 3.6, kind: 'moss' },
              { x: 10, z: 7, r: 3.4, kind: 'blossom' }, { x: 9, z: -8, r: 3.0, kind: 'gravel' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [3, 5], [2, -4], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'g1', { x: 0, z: -11, angle: 0 });
  // ...AND INTO THE WILD WOODS. This is the door the crypt used to hold.
  sideDoor(world, 'n', halfW, halfD, 't1a', { x: 0, z: 9, angle: Math.PI });

  // THE LOCK FOR THE REGION AHEAD: the first bramble. Green and alive across
  // the mouth of a nook, the spoil showing through — the Verdant Wolf is the
  // next wolf a child earns and this is where they first want it. Stoneroot
  // already showed a bramble (regions.js `e2_bramble`), so this is the promise
  // repeated at the door of the region that keeps it.
  wallRun(world, -16, -1.0, -11.0, -1.0, D);
  wallRun(world, -16, 4.0, -11.0, 4.0, D);
  promiseGate(world, -11.0, 1.5, 2.4, 5.0, 0x5fae4a, 'THORNS — later', 'rockSB',
              { system: 'cut', id: 'g2_bramble', region: REGION });
  visibleReward(world, -14.0, 1.5, 'g2_bramble_prize', { shards: 24, gear: 'axe_c' }, 'silver');
  world.markers.bramblePromise = { x: -11.0, z: 1.5 };

  // ...and one more crack, so the verb a child just graduated still has
  // somewhere to go in the daylight
  wallRun(world, 10.5, -12.5, 10.5, -7.0, D);
  wallRun(world, 10.5, -7.0, 12.2, -7.0, D);
  wallRun(world, 14.6, -7.0, 16, -7.0, D);
  crackedPile(world, 'g2_crack', 13.4, -7.0);
  visibleReward(world, 13.5, -10.0, 'g2_crack_prize', { shards: 20, heartPiece: 1 }, 'silver');

  // THE VINE climbs the last of the stone and goes into the trees
  vine(world, [[1.6, 13], [2.4, 6], [1.8, -1], [0.8, -7], [0.4, -13]]);
  world.markers.heroSpot = { x: 0, z: -7 };

  world.markers.houndSpots = [{ x: -5, z: -5, variant: 'thorn' }, { x: 6, z: 2, variant: 'thorn' }];
  world.markers.mothSpots = [{ x: 8, z: -6, variant: 'wisp' }];
  world.markers.slimeSpots = [{ x: -6, z: 7, variant: 'bramble' }];
  world.markers.breakables = [
    { x: -7.5, z: 10.5, kind: 'crate' }, { x: 8.0, z: 10.0, kind: 'barrel' },
    { x: -8.5, z: -8.5, kind: 'jar' }, { x: 5.5, z: 6.5, kind: 'vase' },
  ];
  world.markers.restSpot = { x: 7, z: 10 };

  // THE FIRST TREES: whole ones, green ones, the only healthy stand between
  // here and Sylva's glade. The Woods' rot has not reached the road yet.
  grove(world, -12.0, 10.5, 2.6, D, { trees: 4 });
  grove(world, 12.5, 11.0, 2.4, D, { trees: 4 });
  grove(world, -13.0, -8.0, 2.4, D, { trees: 3 });
  grove(world, 6.5, -10.5, 2.0, D, { trees: 3 });
  grove(world, -5.5, 12.0, 1.6, D, { trees: 2 });
  thicket(world, 4.5, 9.0, 2.0, D, { n: 8 });
  thicket(world, -4.0, 4.5, 1.8, D, { n: 7 });
  thicket(world, 7.0, -1.5, 1.6, D, { n: 6 });
  thicket(world, -8.0, 7.0, 1.6, D, { n: 6 });
  // ...and the last of the stone, going under the green
  fallenColumn(world, -7.5, 11.0, 0.6, D, 2.8);
  fallenColumn(world, 9.5, 5.5, -0.7, D, 2.6);
  lowWall(world, -2.0, 8.5, 0.2, D, 2.8);
  lowWall(world, 6.0, 12.5, -0.3, D, 2.6);
  wayshrine(world, -6.0, -2.0, 0.4, D);
  rubbleField(world, 11.0, 2.0, 1.8, D, 8);
  rubbleField(world, -3.0, 13.0, 1.8, D, 8);
  rubbleField(world, -12.5, 7.0, 1.6, D, 7);
  scatter(world, halfW, halfD, D, 62, 10, { spin: 1, kinds: ['rockQ1', 'rockQ2', 'rockQ3'] });
  return finish(world, spec, D);
}

export const LEVELGREEN_ROOMS = { g1: buildG1, g2: buildG2 };
