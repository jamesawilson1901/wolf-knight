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
// GREYBOX FIRST, WITHOUT EXCEPTION (design doc §7, build order step 1):
// loadVillageKit() is a deliberate no-op for now — it never populates
// villageKit, which keeps GREY() permanently true (courtKit-style: `!kit`
// is the grey condition) until the dressing pass (build order step 4)
// actually wires assets/env/town/*.glb in.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { makeBuilders, gap, MODULES, thresholdGlow, potSpotsOrFewer,
  reserveLandings } from './levelkit.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { registerDistrictTints } from './districts.js';

export const REGION = 'village';

let villageKit = null;
const GREY = () => !villageKit || state.settings.greybox !== false;

// no-op for now (see header) — populated in the dressing pass
export async function loadVillageKit() {
  return villageKit;
}

export const DISTRICTS = {
  village: { tint: 0x8a7a5c, floorTint: 0x6e5f45, wallTint: 0x3a3226, propTint: 0x7a6a4e,
             ground: 'village', name: 'THE VILLAGE', hero: 'THE VILLAGE SQUARE' },
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

function base(scene, id) {
  const spec = LV[id];
  const world = new World(scene);
  world.roomId = id;
  reserveLandings(world, id);
  world.bgColor = 0x1c1810;
  return { world, spec, D: DISTRICTS[spec.district] };
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
  const { world, spec, D } = base(scene, 'ysq');
  const gaps = [
    gap('s'),                                                       // back to the Den
    gap('n', undefined, -10), gap('n', undefined, 0), gap('n', undefined, 10),
    gap('w', undefined, -7), gap('w', undefined, 7),
    gap('e', undefined, -7), gap('e', undefined, 7),
  ];
  const { halfW, halfD } = shell(world, spec, gaps, D, { hub: [0, 0] });
  world.spawn = { x: 0, z: 12, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: -6, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'yg1', { x: 0, z: 6, angle: Math.PI }, { centre: -10 });
  sideDoor(world, 'n', halfW, halfD, 'yg2', { x: 0, z: 6, angle: Math.PI }, { centre: 0 });
  sideDoor(world, 'n', halfW, halfD, 'yg3', { x: 0, z: 6, angle: Math.PI }, { centre: 10 });
  sideDoor(world, 'w', halfW, halfD, 'yg4', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: -7 });
  sideDoor(world, 'w', halfW, halfD, 'yg5', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: 7 });
  sideDoor(world, 'e', halfW, halfD, 'yg6', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: -7 });
  sideDoor(world, 'e', halfW, halfD, 'yrw', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: 7 });

  world.markers.heroSpot = { x: 0, z: 0 };
  world.markers.restSpot = { x: -10, z: -8 };

  // THE WELL (village-square centrepiece, restoration progress readout —
  // design doc §4). Greybox placeholder now; the 6-stage visual and the
  // shadow-overlay-per-street dressing land in the dressing pass. The
  // progress read itself (guardiansDown()) is real from day one, so nothing
  // downstream has to wait on art to be testable.
  world.markers.villageWellSpot = { x: 0, z: 0 };

  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// Six guardian pockets — identical shape, one enemy each, one door home.
// ---------------------------------------------------------------------------
export async function buildYg1(scene) {
  const { world, spec, D } = base(scene, 'yg1');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {});
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 0, z: 6, angle: Math.PI }, { centre: -10 });
  world.markers.hollowSentinelSpots = [{ x: 0, z: -4 }];
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g1') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) WS.set(REGION, 'guardian_g1');
  });
  return finish(world, spec, D);
}

export async function buildYg2(scene) {
  const { world, spec, D } = base(scene, 'yg2');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {});
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 0, z: 6, angle: Math.PI }, { centre: 0 });
  world.markers.shadeKnightSpots = [{ x: 0, z: -4 }];
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g2') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) WS.set(REGION, 'guardian_g2');
  });
  return finish(world, spec, D);
}

export async function buildYg3(scene) {
  const { world, spec, D } = base(scene, 'yg3');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {});
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ysq', { x: 0, z: 6, angle: Math.PI }, { centre: 10 });
  world.markers.twinbladeHuskSpots = [{ x: 0, z: -4 }];
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g3') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) WS.set(REGION, 'guardian_g3');
  });
  return finish(world, spec, D);
}

export async function buildYg4(scene) {
  const { world, spec, D } = base(scene, 'yg4');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {});
  world.spawn = { x: -6, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ysq', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: -7 });
  world.markers.wraithArcherSpots = [{ x: 4, z: 0 }];
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g4') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) WS.set(REGION, 'guardian_g4');
  });
  return finish(world, spec, D);
}

export async function buildYg5(scene) {
  const { world, spec, D } = base(scene, 'yg5');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {});
  world.spawn = { x: -6, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ysq', { x: -8, z: 0, angle: -Math.PI / 2 }, { centre: 7 });
  world.markers.lurkerSpots = [{ x: 4, z: 0 }];
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g5') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) WS.set(REGION, 'guardian_g5');
  });
  return finish(world, spec, D);
}

export async function buildYg6(scene) {
  const { world, spec, D } = base(scene, 'yg6');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {});
  world.spawn = { x: 6, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ysq', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: -7 });
  world.markers.shadowDragonlingSpots = [{ x: -4, z: 0 }];
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  world.onAnimate(() => {
    if (WS.get(REGION, 'guardian_g6') || !world.enemies) return;
    if (world.enemies.length && world.enemies.every((e) => e.dead)) WS.set(REGION, 'guardian_g6');
  });
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// yrw — THE WELL. The one non-combat room: a rescued pup, a visible chest.
// ---------------------------------------------------------------------------
export async function buildYrw(scene) {
  const { world, spec, D } = base(scene, 'yrw');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {});
  world.spawn = { x: 6, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ysq', { x: 8, z: 0, angle: Math.PI / 2 }, { centre: 7 });
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
