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
  reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { registerDistrictTints } from './districts.js';

export const REGION = 'village';

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
  return villageKit;
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

export const LV = {
  ysq: { ...M.hub,    kind: 'hub',    district: 'village', spine: true, junction: true,
         label: 'THE VILLAGE SQUARE', beat: 'epilogue · six guardians, six doors, no locks' },
  yg1: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ysq',
         label: 'THE GATE HOUSE', beat: 'guardian 1/6 · Hollow Sentinel' },
  yg2: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ysq',
         label: 'THE MARKET ROW', beat: 'guardian 2/6 · Shade Knight' },
  yg3: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ysq',
         label: 'THE MILL', beat: 'guardian 3/6 · Twinblade Husk' },
  yg4: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ysq',
         label: 'THE BELL TOWER', beat: 'guardian 4/6 · Wraith Archer' },
  yg5: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ysq',
         label: 'THE BACK ALLEY', beat: 'guardian 5/6 · The Lurker' },
  yg6: { ...M.pocket, kind: 'pocket', district: 'village', loopsTo: 'ysq',
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
  return g;
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
  const gaps = [
    gap('s'),                                                       // back to the Den
    gap('n', undefined, -10), gap('n', undefined, 0), gap('n', undefined, 10),
    gap('w', undefined, -7), gap('w', undefined, 7),
    gap('e', undefined, -7), gap('e', undefined, 7),
  ];
  const { halfW, halfD } = shell(world, spec, gaps, D, { hub: [0, 0] });
  world.spawn = { x: 0, z: 12, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: -8, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'yg1', { x: 0, z: 6, angle: Math.PI }, { centre: -10 });
  sideDoor(world, 'n', halfW, halfD, 'yg2', { x: 0, z: 6, angle: Math.PI }, { centre: 0 });
  sideDoor(world, 'n', halfW, halfD, 'yg3', { x: 0, z: 6, angle: Math.PI }, { centre: 10 });
  sideDoor(world, 'w', halfW, halfD, 'yg4', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: -7 });
  sideDoor(world, 'w', halfW, halfD, 'yg5', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: 7 });
  sideDoor(world, 'e', halfW, halfD, 'yg6', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: -7 });
  sideDoor(world, 'e', halfW, halfD, 'yrw', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: 7 });

  world.markers.heroSpot = { x: 0, z: 0 };
  world.markers.restSpot = { x: -10, z: -8 };

  // A LIVED-IN SQUARE, kept clear of all eight door gaps: two houses in the
  // south corners, the one stretch of wall no gap touches.
  if (!GREY()) {
    placeOne(world, villageKit.hut, 'hut', -14, 10, 1.1, 0.6, D.propTint);
    world.addBox(-16.4, -11.6, 8.2, 12.2);
    placeOne(world, villageKit.hut, 'hut', 14, 10, 1.1, -0.6, D.propTint);
    world.addBox(11.6, 16.4, 8.2, 12.2);
  }

  // THE WELL — a dead tree, not a well: no well asset exists in any
  // vendored pack, and stump.glb was sitting unused. The stump itself never
  // changes; a ring of flowers and bushes grows around it one guardian at a
  // time, so a child glancing at the hub always knows the score without a
  // UI read (design doc §4). Real from day one — guardiansDown() is real
  // state, not a placeholder — so nothing downstream waits on art.
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
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 0, z: 6, angle: Math.PI }, { centre: -10 });
  // THE GATE HOUSE: the keeper's hut to one side, a stretch of wall behind
  // the sentinel — the "already know this shape" gate Hollow Sentinel's own
  // shieldUp block borrows from Stoneroot (design doc §3).
  if (!GREY()) {
    placeOne(world, villageKit.hut, 'hut', -6, -5, 1.0, 0.9, D.propTint);
    world.addBox(-8.5, -3.5, -7.2, -3.2);
    placeOne(world, villageKit.wall1, 'wall1', 6, -6.5, 1.0, Math.PI / 2, D.propTint);
    world.addBox(2, 10, -7.9, -5.1);
  }
  world.markers.hollowSentinelSpots = [{ x: 0, z: -4 }];
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
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 0, z: 6, angle: Math.PI }, { centre: 0 });
  // THE MARKET ROW: a cart left mid-sale, a stall never opened again.
  if (!GREY()) {
    placeOne(world, villageKit.wagons, 'wagons', -6, -2, 1.15, 0.4, D.propTint);
    world.addBox(-8.8, -3.2, -4.9, 0.9);
    placeOne(world, villageKit.hut, 'hut', 6, -5, 0.9, -0.5, D.propTint);
    world.addBox(3.9, 8.1, -7.1, -3.3);
  }
  world.markers.shadeKnightSpots = [{ x: 0, z: -4 }];
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
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 0, z: 6, angle: Math.PI }, { centre: 10 });
  // THE MILL: the hut IS the millhouse; the wheel is architecture, not a
  // creature, so it is a primitive rather than a new model — same reasoning
  // as frostBramble/valeBramble (js/level5.js, js/level6.js).
  let wheel = null;
  if (!GREY()) {
    placeOne(world, villageKit.hut, 'hut', -5, -5, 1.0, 0.4, D.propTint);
    world.addBox(-7.5, -2.5, -7.1, -3.3);
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
  world.spawn = { x: -6, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ysq', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: -7 });
  // THE BELL TOWER: real height, real sightlines — the design doc's own
  // reason a ranged kiter belongs here rather than on open ground.
  if (!GREY()) {
    placeOne(world, villageKit.tower2, 'tower2', 4, -4, 1.0, 0, D.propTint);
    world.addBox(1.9, 6.1, -6.1, -1.9);
  }
  world.markers.wraithArcherSpots = [{ x: 4, z: 0 }];
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
  world.spawn = { x: -6, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ysq', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: 7 });
  // THE BACK ALLEY: cramped on purpose — the one guardian that can be
  // approached quietly wants corners to be approached quietly FROM.
  if (!GREY()) {
    placeOne(world, villageKit.houses, 'houses', -3, -6.4, 0.34, 0, D.propTint);
    world.addBox(-9.5, 3.5, -7.9, -5.3);
    placeOne(world, villageKit.wall2, 'wall2', 3, 3, 1.0, Math.PI / 2, D.propTint);
    world.addBox(-1, 7, 2.1, 3.9);
  }
  world.markers.lurkerSpots = [{ x: 4, z: 0 }];
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
  world.spawn = { x: 6, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ysq', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: -7 });
  // THE CHAPEL ROOF: the region's second, distinct tower (tower-3, not
  // tower-2 again) — height for the region's one aerial fight.
  if (!GREY()) {
    placeOne(world, villageKit.tower3, 'tower3', -4, -4, 1.0, 0, D.propTint);
    world.addBox(-6.1, -1.9, -6.1, -1.9);
  }
  world.markers.shadowDragonlingSpots = [{ x: -4, z: 0 }];
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
  world.spawn = { x: 6, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ysq', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: 7 });
  if (!GREY()) {
    placeOne(world, villageKit.hut, 'hut', 4, -5, 0.85, -0.3, D.propTint);
    world.addBox(2.1, 6.5, -7.0, -3.5);
  }
  world.markers.pupSpot = { x: -4, z: 0, id: 'pup_village' };
  world.markers.chestDefs = [
    { id: 'c_yrw', tier: 'gold', x: -2, z: 3, ry: 0.6, loot: { shards: 30, heartPiece: 1 } },
  ];
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export const LEVELVILLAGE_ROOMS = {
  ysq: buildYsq,
  yg1: buildYg1, yg2: buildYg2, yg3: buildYg3,
  yg4: buildYg4, yg5: buildYg5, yg6: buildYg6,
  yrw: buildYrw,
};
