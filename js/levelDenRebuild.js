// THE DEN REBUILT — design/DEN-REBUILD.md. Dad's ask: "I want to change the
// den so it's much bigger... like rebuilding Rome in Assassin's Creed. You
// mine/cut/collect a certain amount of resources and you get to rebuild the
// town around the den."
//
// SCOPE (decided in the design doc, not relitigated here): the existing
// `den` room (js/rooms.js buildDen) is a single hand-built room already near
// its own draw-call ceiling and not on the shared toolkit — rewriting it was
// judged too risky for a first slice. So v1 ships as ONE new room reachable
// through a door from `den`, built on the SAME shared shell()/sideDoor()
// toolkit js/levelVillage.js already proved for a multi-building town, and
// reusing that module's own houses-pack/prop kit (one extra download the
// Village already pays for) rather than the Vale's or a new one. A bigger
// multi-district town is explicitly deferred — see the design doc's own
// "still to design" section.
//
// Three restorable structures (Tavern/Forge/Mill) plus a fourth, cosmetic
// Monument. v1 (2026-09) reskinned a split `houses-pack.glb` chunk for all
// three, per CLAUDE.md's asset rule about real mesh assets. v1.1 (2026-09-17)
// replaces that with dad's own commissioned models — a real quaint tavern, a
// stone smithy and a proper watermill (Tripo AI generations, converted and
// retinted the same way DRAGON-EGGS.md's egg was: baked texture stripped,
// one flat `.color`-bearing material per model, tinted per-instance through
// the SAME `tintedModel()`/`placeOne()` pipeline every Kenney asset in this
// game already goes through — the source pack doesn't matter to that code
// path, only that the model carries a plain material with no map). The
// economy itself (costs, payout timers, the forward-ratchet math) lives in
// js/denRebuild.js; this file only places things and answers "did the child
// just walk up to one". The Pup Pen's own payout is wired separately, into
// the EXISTING pen in `den` (js/restoration.js spawnPupPen) — it has no new
// geometry here, per the design doc.
//
// The Monument is NOT part of that economy — no cost, no payout, nothing to
// walk up to. It is a pure milestone reward (design/DEN-REBUILD.md's own
// "still to design" list named this exact thing): it simply appears, with a
// small juice flourish, the moment all three working buildings are restored.
// Its own baked material is kept AS SUPPLIED rather than stripped flat,
// unlike the three buildings above — it is a one-off set piece, never
// retinted per-instance, and its lit brazier/lava-crack detail is the whole
// point of the reward; flattening it to a solid color would put the fire out.
import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { makeBuilders, gap, MODULES, thresholdGlow, reserveLandings, potSpotsOrFewer } from './levelkit.js';
import { loadVillageKit, placeOne } from './levelVillage.js';
import { loadGLB } from './assets.js';
import { protoLabel } from './proto.js';
import { flattenStatic } from './batch.js';
import { BUILDINGS, isRestored, canRestore, restore, pendingCollections, collect } from './denRebuild.js';
import { juice } from './juice.js';
import { audio } from './audio.js';

const M = MODULES;

// One flat district — the Den's own glade palette (js/ground.js GROUND_STYLES
// .den), so the outer camp reads as MORE OF THE SAME PLACE rather than a new
// one. No corrupt/warm split like the Village: nothing here was ever
// shadowed, it is simply unbuilt until paid for (RUIN_TINT, below).
const D = { tint: 0x4f7a3c, floorTint: 0x4f7a3c, wallTint: 0x3a4f2c,
  propTint: 0x6a5a3c, ground: 'den' };

const RUIN_TINT = 0x716c5e;    // not yet restored — plain, unpainted timber
const TAVERN_TINT = 0xd88a4a;  // warm hearth wood, once restored
const FORGE_TINT = 0x565a62;   // iron/dark steel, once restored
const MILL_TINT = 0xd9c48a;    // pale wheat/cream, once restored — visibly
                                // lighter than RUIN_TINT (a first attempt at
                                // a "plain timber" 0x9a8a6a read almost the
                                // same as unrestored on screen; caught in
                                // the pre-ship visual pass, see DEN-REBUILD.md)

let kit = null;
const GREY = () => !kit || state.settings.greybox !== false;

const { shell, sideDoor } = makeBuilders({ kit: () => kit, isGrey: () => GREY() });

// THE COMMISSIONED TOWN MODELS. Each file is a single mesh, one flat
// `.color`-bearing material, no baked texture (design/DEN-REBUILD.md's
// "v1.1" section) — so `w`/`h`/`d` below are RAW model-space sizes, measured
// once at load time, exactly like js/levelVillage.js's own splitBuildings()
// returns for a houses-pack chunk. `s` is this specific model's own natural
// scale-to-world-units factor (targetDiameter / its own raw footprint) —
// computed once per model rather than shared, because these three come from
// three separate generations at three unrelated native scales, unlike a
// houses-pack chunk where every building already shares one modeling unit.
// FULL LITERAL PATHS, not a shared directory constant + filename — the same
// lesson tools/sync-cache.mjs's own header documents about the KAYKIT_ROSTER
// template-literal miss: its runtime-asset scan is a plain regex over the
// source TEXT (`ASSET_LIT`, any quoted `./assets/....glb` string, wherever it
// sits), so a path built at runtime from two identifiers is invisible to it
// no matter how the load call itself is written. Each string below is
// exactly the file this room loads, so the scan finds it without needing a
// hand-added exception the way the enemy roster did.
const TOWN_SPEC = {
  tavern: { file: './assets/env/den-town/tavern.glb', targetDiameter: 5.6 },
  forge: { file: './assets/env/den-town/forge.glb', targetDiameter: 4.8 },
  mill: { file: './assets/env/den-town/mill.glb', targetDiameter: 5.2 },
  monument: { file: './assets/env/den-town/monument.glb', targetDiameter: 3.0 },
};
let townAssets = null;

async function loadTownBuilding(file, targetDiameter) {
  const gltf = await loadGLB(file);
  const bb = new THREE.Box3().setFromObject(gltf.scene);
  const size = bb.getSize(new THREE.Vector3());
  const s = targetDiameter / Math.max(size.x, size.z);
  return { scene: gltf.scene, w: size.x, h: size.y, d: size.z, s };
}

async function loadTownAssets() {
  if (!townAssets) {
    townAssets = {};
    await Promise.all(Object.entries(TOWN_SPEC).map(async ([id, spec]) => {
      townAssets[id] = await loadTownBuilding(spec.file, spec.targetDiameter);
    }));
  }
  return townAssets;
}

function base(scene) {
  const world = new World(scene);
  world.roomId = 'dr';
  reserveLandings(world, 'dr');
  world.bgColor = 0x1c1810;
  return world;
}

function finish(world) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, 'THE OUTER CAMP', { color: '#e8d9b0', y: 3.4, size: 2.0 });
    protoLabel(world, 0, 2.4, 'mine, chop, and rebuild', { color: '#b8a880', y: 2.4, size: 1.2 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.solidifyProps();
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// A building with its collider COMPUTED from its own rotated footprint — the
// same idiom js/levelVillage.js's own (private) townhouse() uses. `tpl` is
// one entry from loadTownAssets() — its own natural `s` carries the scale,
// so (unlike the old houses-pack version) no shared default is needed here.
function placeBuilding(world, tpl, key, x, z, ry, tint) {
  const s = tpl.s;
  const w = tpl.w * s, d = tpl.d * s;
  const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry));
  const hw = (w * c + d * sn) * 0.5 * 0.82, hd = (w * sn + d * c) * 0.5 * 0.82;
  placeOne(world, tpl, key, x, z, s, ry, tint);
  world.addBox(x - hw, x + hw, z - hd, z + hd);
  return { hw, hd };
}

// One entry per restorable structure: where it stands (bx/bz), which way it
// faces (ry), its restored tint, and where a child stands to work it (sx/sz
// — just outside its own footprint, toward the room's open middle).
const SPOTS = [
  { id: 'tavern', bx: -5.6, bz: -3.4, ry: 0.3, tint: TAVERN_TINT, sx: -3.2, sz: -2.0 },
  { id: 'forge',  bx: -5.6, bz: 3.4, ry: -0.4, tint: FORGE_TINT, sx: -3.2, sz: 2.0 },
  { id: 'mill',   bx: 1.5, bz: -4.2, ry: 0.6, tint: MILL_TINT, sx: 1.0, sz: -1.6 },
];

// THE MONUMENT — centered in the room's own open middle, clear of every
// building, prop, node and pot spot reserved elsewhere in this file. No
// tint, no `sx`/`sz`, no entry in the walk-into trigger loop below: it is
// not something a child works, it is something that appears.
const MONUMENT_POS = { x: 0, z: 0.5, ry: 0 };
const allBuildingsRestored = () => SPOTS.every((s) => isRestored(s.id));

export async function buildDr(scene) {
  if (state.settings.greybox === false) kit = await loadVillageKit();
  const world = base(scene);
  const spec = M.pocket;
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {});
  world.spawn = { x: halfW - 3, z: 0, angle: Math.PI / 2 };
  // THE WAY BACK. entry lands just inside den's own west gap (js/rooms.js
  // buildDen, the mirror of this door) — the same "every landing is the
  // other room's business" law every sideDoor() call already keeps.
  sideDoor(world, 'e', halfW, halfD, 'den', { x: -8.5, z: 0, angle: 0 });

  if (GREY()) {
    for (const s of SPOTS) {
      const restored = isRestored(s.id);
      const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 4.2),
        new THREE.MeshStandardMaterial({ color: restored ? s.tint : RUIN_TINT, roughness: 0.95 }));
      m.position.set(s.bx, 1.6, s.bz);
      world.add(m);
      world.addBox(s.bx - 2.3, s.bx + 2.3, s.bz - 2.3, s.bz + 2.3);
      protoLabel(world, s.bx, s.bz, BUILDINGS[s.id].name, { color: '#e8d9b0', y: 3.0, size: 0.8 });
    }
    if (allBuildingsRestored()) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8a850, roughness: 0.9 }));
      m.position.set(MONUMENT_POS.x, 1.3, MONUMENT_POS.z);
      world.add(m);
      protoLabel(world, MONUMENT_POS.x, MONUMENT_POS.z, 'MONUMENT', { color: '#e8d9b0', y: 2.8, size: 0.8 });
    }
  } else {
    const town = await loadTownAssets();
    for (const s of SPOTS) {
      const tint = isRestored(s.id) ? s.tint : RUIN_TINT;
      placeBuilding(world, town[s.id], `denhouse_${s.id}`, s.bx, s.bz, s.ry, tint);
    }
    // ONE PROP PER TRADE, where one fits naturally and cheaply — the same
    // Small Props Pack the Village and the Den's own armoury corner already
    // share an atlas with, so this costs nothing extra to download.
    placeOne(world, kit.hearth, 'hearth', -4.0, -3.2, 1.0, 0.4, D.propTint);
    placeOne(world, kit.grinder, 'grinder', -4.0, 3.0, 1.0, -0.3, D.propTint);
    placeOne(world, kit.cartwheel, 'cartwheel', -3.4, 3.7, 1.0, 0.7, D.propTint);
    // THE MONUMENT — appears once, with its own kept-as-supplied material
    // (see the header note above), the moment the three working buildings
    // are all restored. No tint argument: placeOne's TINT() pipeline still
    // runs prepareModel() over it (shadow flags, the metalness/roughness
    // safety clamp every Kenney-adjacent model gets), but passing its own
    // baked colour straight through leaves the lit brazier/lava-crack detail
    // intact instead of painting it one flat colour.
    if (allBuildingsRestored()) {
      const mon = town.monument;
      placeOne(world, mon, 'monument', MONUMENT_POS.x, MONUMENT_POS.z, mon.s, MONUMENT_POS.ry, 0xffffff);
      world.addBox(MONUMENT_POS.x - 1.6, MONUMENT_POS.x + 1.6, MONUMENT_POS.z - 1.6, MONUMENT_POS.z + 1.6);
    }
  }

  // MINING & WOODCUTTING ROLLOUT (design/MINING.md) — the Outer Camp is
  // literally the room whose own greybox label already reads "mine, chop,
  // and rebuild" (see `finish()` above), so it gets BOTH kinds, untinted
  // (this is home base, not one of the seven elemental regions — nothing in
  // js/player.js WOLF_TINTS names it, so it renders exactly as lc's original
  // pair always has). Both sit in the room's open east half, clear of the
  // three restorable buildings' footprints and both breakables — confirmed
  // against a real dump of this room's colliders. Reserved before
  // `potSpotsOrFewer` right below so a pot can never land on either.
  world.markers.rockSpots = [{ x: 6.5, z: 3 }];
  world.markers.treeSpots = [{ x: 6.5, z: -3 }];
  world.reserve(6.5, 3, 1.3, 'node');
  world.reserve(6.5, -3, 1.6, 'node');
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, { label: 'dr' });

  // THE WALK-INTO TRIGGER — this game's only interaction law (js/nodes.js's
  // own header note: no tap-to-target anywhere). Armed/disarmed with the
  // same hysteresis nearSpot+edge-flag idiom the Den's shop/travel/garden
  // spots already use (js/main.js), generalized here to N spots in one loop
  // rather than duplicated three times. Unaffordable = silence, the SAME
  // "no tool = does nothing" precedent js/nodes.js already set; a small
  // juice burst (js/juice.js, no new VFX) is the only feedback either way.
  for (const s of SPOTS) s.armed = false;
  world.updateDenBuildings = (dt, t, player) => {
    if (!player) return;
    for (const s of SPOTS) {
      const dx = player.root.position.x - s.sx, dz = player.root.position.z - s.sz;
      const rr = s.armed ? 2.8 : 2.0;
      const near = (dx * dx + dz * dz) < rr * rr;
      if (near && !s.armed) {
        if (!isRestored(s.id)) {
          if (canRestore(s.id)) {
            restore(s.id);
            juice.burst(s.sx, 0.6, s.sz, 0xffe9b0, 18);
            audio.play('checkpoint', { volume: 0.7, rate: 1.1 });
          }
        } else if (pendingCollections(s.id) > 0) {
          const r = collect(s.id);
          if (r && r.count > 0) {
            juice.burst(s.sx, 0.6, s.sz, 0xffe9b0, 14);
            audio.play('pup-chime', { volume: 0.6, rate: 1.0 });
          }
        }
      }
      s.armed = near;
    }
  };

  return finish(world);
}

export const DENREBUILD_ROOMS = { dr: buildDr };
