// LEVEL 3 — WILD WOODS, rebuilt to design/LEVEL-MAP.md (2026-08-07).
//
// Topology: A RING. Not a Metroidvania graph — one loop, walked clockwise,
// with two chords that open from the FAR side so the return leg is short.
// By level three the kids have done open islands (L1) and a hub (L2); now the
// level itself is the shape.
//
// METRICS ARE INHERITED (design/METRICS.md), unchanged and unnegotiable. One
// new module type is added — the 26 x 20 RING LEG — and it goes into the
// metrics zoo before it is used at scale, same rule Level 2 followed for the
// hub.
//
// THE THING THAT MAKES A RING HARD is not building it, it is that a child can
// arrive at the same space facing a different way and not recognise it. That
// is why every junction carries its district's hero prop, placed so it is in
// frame from EVERY door — see design/METRICS.md and tools/verify-level3.mjs,
// which projects the prop into the camera frustum from each entry in turn
// rather than trusting that it looks fine.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel, protoMaterial } from './proto.js';
import { loadGLB, prepareModel } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, DOOR_HALF, BOSS_DOOR_HALF, potSpotsOrFewer,
  reserveLandings,
  spiritShrine } from './levelkit.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { makeDressers } from './dressing.js';
import { registerDistrictTints } from './districts.js';
import { thresholdGlow } from './levelkit.js';
import { registerCuttable, alreadyCut, pushableBoulder, plateSwitch } from './gates.js';

let forceGrey = false;
let woodKit = null;
const GREY = () => forceGrey || !woodKit || state.settings.greybox !== false;

// Rooms announce their own milestones. main.js owns bigToast, and importing it
// here would make main and level3 a cycle, so the room asks the window for it
// and simply stays quiet if it is not there (headless builds, tests).
function bigToastSafe(msg) {
  const t = typeof window !== 'undefined' && window.__game && window.__game.bigToast;
  if (t) t(msg);
}

export const REGION = 'wild3';

// The two shortcuts are world state, not session state: a child who pushes the
// log over, quits, and comes back tomorrow must still find it lying there.
// Same mechanism Level 2's vault uses (js/worldstate.js).
// The restoration itself is declared in js/worldstate.js, with the vault's, so
// there is one registry rather than one per level.

// ---------------------------------------------------------------------------
// DISTRICTS. The palette IS the story: sick yellow → dark blue → brown → and
// then, on the far side, one district that is already WELL. Reaching the
// Bloomfall tells a child without a word that they are near the end and that
// the woods can be saved.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  // propTint here is the LIVING colour of the region — deliberately richer than
  // the ground it stands on, because dad's brief for the Wild Woods is
  // "beautiful and sick… you can see what it's losing", and you cannot see
  // something being lost unless it was plainly worth having. The rot is applied
  // per-prop by draining this toward 0x4a3a52 (js/dressing.js), so the same
  // grove reads whole on one side of a room and drained on the other.
  thorn:  { tint: 0xb9bd5e, floorTint: 0x9a9c55, wallTint: 0x3c3a1e, propTint: 0x7f9a48, ground: 'thorn',
            name: 'THORNEDGE',           hero: 'THE LEANING SHRINE' },
  gloom:  { tint: 0x3e7d7a, floorTint: 0x35595c, wallTint: 0x14262b, propTint: 0x3f7a63, ground: 'gloom',
            name: 'THE GLOOMWOOD',       hero: 'THE WATCHING TREE' },
  root:   { tint: 0xa8763c, floorTint: 0x8a6438, wallTint: 0x33241a, propTint: 0x7d6a3a, ground: 'root',
            name: 'THE ROOTBOUND DEEP',  hero: 'THE GREAT ROOT ARCH' },
  bloom:  { tint: 0xf0b8cf, floorTint: 0xd9aebe, wallTint: 0x5a3a48, propTint: 0xc98fa8, ground: 'bloom',
            name: 'THE BLOOMFALL',       hero: 'THE BLOSSOM FALL' },
  glade:  { tint: 0x8fdc6a, floorTint: 0x6f9e55, wallTint: 0x2a3a22, propTint: 0x6fae4a, ground: 'glade',
            name: "SYLVA'S GLADE",       hero: 'SYLVA, THORNBOUND' },
};

// The one new module. A ring leg is deliberately NOT a Level 1 chokepoint:
// a 14 x 10 choke reads as compression, and a ring needs its legs to read as
// TRAVEL — the whole point of the loop is that the outward journey feels long
// enough that finding the way back is a relief.
const RING = { w: 26, d: 20 };

const M = MODULES;
export const L3 = {
  // ---- 1 · THORNEDGE ------------------------------------------------------
  t1a: { ...M.island, kind: 'island', district: 'thorn', spine: true, junction: true,
         label: '1A · THORNEDGE', beat: 'the woods are wrong · quiet dread' },
  t1b: { ...M.island, kind: 'island', district: 'thorn', spine: true,
         label: '1B · THORNEDGE', beat: 'first Thorn Hounds · the ice spring' },
  t1p: { ...M.pocket, kind: 'pocket', district: 'thorn', loopsTo: 't1b',
         label: 'Hollow Oak', beat: 'optional · pup' },
  tc1: { ...RING, kind: 'ring', district: 'thorn', spine: true,
         label: 'THE THORN ROAD', beat: 'REST · travel' },

  // ---- 2 · THE GLOOMWOOD --------------------------------------------------
  t2a: { ...M.island, kind: 'island', district: 'gloom', spine: true, junction: true,
         label: '2A · THE GLOOMWOOD', beat: 'the dark · Dark Wolf eyes' },
  t2b: { ...M.island, kind: 'island', district: 'gloom', spine: true,
         label: '2B · THE GLOOMWOOD', beat: 'wisp moths' },
  t2p: { ...M.pocket, kind: 'pocket', district: 'gloom', loopsTo: 't2b',
         label: 'Wisp Pocket', beat: 'optional · chest' },
  tsh: { ...M.pocket, kind: 'pocket', district: 'gloom', spine: true,
         label: "SYLVA'S SPARK", beat: 'VERDANT WOLF · INTRODUCE' },
  tc2: { ...RING, kind: 'ring', district: 'gloom', spine: true,
         label: 'THE LOG CROSSING', beat: 'DEVELOP · regrowth + the bridge' },

  // ---- 3 · THE ROOTBOUND DEEP ---------------------------------------------
  t3a: { ...M.island, kind: 'island', district: 'root', spine: true, junction: true,
         label: '3A · THE ROOTBOUND DEEP', beat: 'roots · the root-wall' },
  t3b: { ...M.island, kind: 'island', district: 'root', spine: true,
         label: '3B · THE ROOTBOUND DEEP', beat: 'regrowing brambles' },
  t3p: { ...M.pocket, kind: 'pocket', district: 'root', loopsTo: 't3b',
         label: 'Under-root', beat: 'optional · pup' },
  tkn: { ...M.island, kind: 'island', district: 'root', spine: true,
         label: 'THE KNOT', beat: 'THE PUZZLE ROOM · TWIST' },
  tc3: { ...RING, kind: 'ring', district: 'root', spine: true,
         label: 'THE DEEP ROAD', beat: 'REST · travel' },

  // ---- 4 · THE BLOOMFALL (the far side — already well) --------------------
  t4a: { ...M.island, kind: 'island', district: 'bloom', spine: true, junction: true,
         label: '4A · THE BLOOMFALL', beat: 'the pack · Elder Thorn Hounds' },
  t4b: { ...M.island, kind: 'island', district: 'bloom', spine: true,
         label: '4B · THE BLOOMFALL', beat: 'the great thorn-knot · CONCLUDE' },
  t4p: { ...M.pocket, kind: 'pocket', district: 'bloom', loopsTo: 't4b',
         label: 'Petal Hollow', beat: 'optional · chest' },
  tc4: { ...RING, kind: 'ring', district: 'bloom', spine: true,
         label: 'THE PETAL ROAD', beat: 'REST · before the glade' },

  // ---- SYLVA'S GLADE ------------------------------------------------------
  tgl: { ...M.arena, kind: 'arena', district: 'glade', spine: true,
         label: "SYLVA'S GLADE", beat: 'SYLVA, THORNBOUND' },

  // ---- THE TWO CHORDS -----------------------------------------------------
  // Shortcut legs, opened from the FAR side. Each is a real walked space, not
  // a door, because "the way back was genuinely shorter" has to be something
  // a child FEELS, and a door teleport would feel like nothing at all.
  tsA: { ...RING, kind: 'ring', district: 'bloom', shortcut: true,
         from: 't4a', to: 't1a', opensWith: 'logDown',
         label: 'THE FALLEN LOG', beat: 'SHORTCUT · Bloomfall → Thornedge' },
  tsB: { ...RING, kind: 'ring', district: 'root', shortcut: true,
         from: 't3a', to: 't2a', opensWith: 'rootCut',
         label: 'THE CUT ROOT-WALL', beat: 'SHORTCUT · Rootbound → Gloomwood' },
};

// Each room's district colour, so a DOORWAY can show what is beyond it
// (js/districts.js). Registered here because this is the only place that
// knows both the room table and the palette.
registerDistrictTints(L3, DISTRICTS);

// The ring, clockwise, as it must be walkable. The last hop closes it.
export const RING_PATH = [
  't1a', 't1b', 'tc1',
  't2a', 't2b', 'tsh', 'tc2',
  't3a', 't3b', 'tkn', 'tc3',
  't4a', 't4b', 'tc4',
  'tgl', 't1a',
];

// LEVEL 3'S SPINE, told straight: verdant is no longer taught before Sylva —
// it is HER reward (dad's law: each wolf is locked behind its own element's
// boss, and the next level runs on it). tc2's log bridge and t4b's great
// thorn-knot, both hard spine gates, now burn with the wolf the child already
// holds from Ember Hollow. What verdant still teaches — the shrine promise,
// the regrowing tangles, the vine-snare on a hound — moves to AFTER the fight,
// optional return content on the way back through, same as every other
// region's post-boss content.
export const TEACH = [
  { step: 'promise', room: 'tsh', marker: 'sparkSpot',
    what: "Sylva's shrine — cold stone naming the fight ahead, nothing to cut" },
  { step: 'spine (fire)', room: 'tc2', marker: 'logBridge',
    what: 'the way out — a scorched rope, burned same as any Level 1 tangle' },
  { step: 'spine (push)', room: 'tkn', marker: 'plateSpots',
    what: 'an honest push-and-plate room — no verb the child does not have' },
  { step: 'spine (fire), boss door', room: 't4b', marker: 'thornKnot',
    what: 'the great thorn-knot burns away — the glade, and Sylva, are ahead' },
  { step: 'reward + return (verdant)', room: 'tgl → back through the ring',
    what: "Sylva's grant, then the lash on tc2's regrow tangles and t3a/t4a's chords" },
];

// ---------------------------------------------------------------------------
// THE WOOD KIT. Every file is already vendored for Levels 1-2 or the shipping
// Wild Woods rooms — Level 3 adds ZERO bytes to the download. Buckets from
// assets/LICENSES/MANIFEST.json: Kenney Nature 2.1 GREEN, KayKit Forest Nature
// 1.0 GREEN, Quaternius LowPoly Modular Dungeon GREEN, KayKit Adventurers GREEN.
// ---------------------------------------------------------------------------
export async function loadWoodKit() {
  if (woodKit) return woodKit;
  const names = {
    floor:   './assets/env/floor-tile.glb',        // Kenney Nature  🟢
    cliff:   './assets/env/cliff-block.glb',
    rockLA:  './assets/env/rock-large-a.glb',
    rockLB:  './assets/env/rock-large-b.glb',
    rockLC:  './assets/env/rock-large-c.glb',
    rockSA:  './assets/env/rock-small-a.glb',
    rockSB:  './assets/env/rock-small-b.glb',
    treeA:   './assets/env/tree-a.glb',
    treeB:   './assets/env/tree-b.glb',
    stump:   './assets/env/stump.glb',
    logStack:'./assets/env/log-stack.glb',
    bush:    './assets/env/bush-large.glb',
    mushG:   './assets/env/mushroom-group.glb',
    mushT:   './assets/env/mushroom-tall.glb',
    flowerA: './assets/env/flower-a.glb',
    flowerB: './assets/env/flower-b.glb',
    bridge:  './assets/env/bridge-stone.glb',
    pillar:  './assets/env/pillar.glb',            // Kenney Castle  🟢
    arch:    './assets/env/dungeon/Arch.glb',      // Quaternius     🟢
    column:  './assets/env/dungeon/Column.glb',
    // --- THE FOREST ITSELF --------------------------------------------------
    // Fourteen Quaternius forest models, vendored, licence-cleared 🟢 and used
    // ZERO times: Level 3 shipped dressed with two generic Kenney trees. Dad
    // counted this before I did. The two BARE trees are the point of the set —
    // they are how the rot is shown spreading rather than described.
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
    // and the ruin props, for the places people built before the woods took
    // them back — the region is "overgrown and forgotten" as well as sick
    wallMod: './assets/env/dungeon/Wall_Modular.glb',
    archDoor:'./assets/env/dungeon/Arch_Door.glb',
    brick:   './assets/env/dungeon/Brick.glb',
    barrel:  './assets/env/dungeon/Barrel.glb',
    crate:   './assets/env/dungeon/Crate.glb',
    vase:    './assets/env/dungeon/Vase.glb',
    skull:   './assets/env/dungeon/Skull.glb',
    coins:   './assets/env/dungeon/Coin_Pile.glb',
    pedestal:'./assets/env/dungeon/Pedestal.glb',
    banner:  './assets/env/dungeon/Banner_wall.glb',
    woodfire:'./assets/env/dungeon/Woodfire.glb',
    column2: './assets/env/dungeon/Column2.glb',
    // the two hero props that are BEINGS get real character models, never code
    // geometry (no-code-built-creatures law)
    statue:  './assets/chars/knight.glb',          // the toppled wolf-knight shrine
    sylva:   './assets/chars/wolf.gltf',           // Sylva herself, thornbound
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  woodKit = Object.fromEntries(entries);
  return woodKit;
}

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward,
  darkZone } = makeBuilders({ kit: () => woodKit, isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

// The shared cluster vocabulary (js/dressing.js), bound to the wood kit. The
// forest half of it — grove, thicket, blight, mossyRuin — exists because Ember
// and Stoneroot are built things that fell down while the Wild Woods is a GROWN
// thing being eaten, and the clusters come in matched pairs so a room can say
// how far the rot has reached by which of the pair dresses it.
const { grove, thicket, blight, mossyRuin, ruinedHome, coldHearth, fallenColumn,
  rubbleField, wayshrine, aftermath, cartWreck, lowWall } =
  makeDressers({ kit: () => woodKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

// ---------------------------------------------------------------------------
// LEVEL-SPECIFIC PIECES
// ---------------------------------------------------------------------------

// A bramble — the Verdant Wolf's verb, and before you have it, a promise.
//
// `regrows` is the DEVELOP twist: it closes again if you dawdle, so the lesson
// is not "cut the thing" but "cut it and GO". A regrowing bramble is
// deliberately NOT recorded in WorldState — flagging it would make the develop
// step solve itself on the next visit.
const REGROW_AFTER = 6.5;      // seconds of standing about before it closes

function bramble(world, id, x, z, w = 2.4, d = 1.2, regrows = false, onCut = null) {
  if (!regrows && alreadyCut(REGION, id)) return null;
  const colour = 0x4f8f3a;
  const g = new THREE.Group();

  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.6, d),
      new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9,
        emissive: colour, emissiveIntensity: regrows ? 0.3 : 0.16 })
    );
    m.position.set(x, 0.8, z);
    g.add(m);
  } else {
    // A REAL TANGLE, NOT A ROW OF PEBBLES. This used to clone bush-large.glb
    // (measured 0.37 x 0.24 x 0.34u) at scale 1.1 -> a 0.27u-tall row of ankle-
    // high blobs standing in for a doorway-sized collider. Dad: "the vines
    // look nothing like vines... so tiny you can't see them and just think the
    // game is glitching." The Quaternius forest kit vendors real bushes and
    // bare-branch trees (loadWoodKit above) that had been loaded and used
    // ZERO times. Bush_2_C (1.32u) and Bush_4_B (0.99 x 0.74u) give body that
    // actually fills the footprint; Tree_Bare pieces (2.6-3.8u, floor-pivot)
    // laid low as thorny canes read at a glance as "this is not a tree, it is
    // thorns across the door". Every piece measured against its own pivot
    // first (the stairs lesson) — no guessing.
    const along = w >= d;
    const span = Math.max(w, d);
    const n = Math.max(2, Math.round(span / 1.3));
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : (i / (n - 1) - 0.5);
      const bushKey = i % 2 === 0 ? 'bushQ1' : 'bushQ2';   // Bush_2_C / Bush_4_B alternate
      const bushScale = (bushKey === 'bushQ1' ? 1.35 : 1.75) * (0.85 + (i % 3) * 0.12);
      const piece = tinted(woodKit[bushKey], 'bramble', colour, 0.85 + (i % 3) * 0.1);
      piece.position.set(x + (along ? f * w : (i % 2 - 0.5) * 0.5),
        0, z + (along ? (i % 2 - 0.5) * 0.5 : f * d));
      piece.rotation.y = i * 1.9;
      piece.scale.setScalar(bushScale);
      g.add(piece);
    }
    // one or two bare-branch canes standing THROUGH the bushes, tinted
    // thorn-dark — the silhouette that says "thorns", not "hedge", visible
    // over the bush tops rather than buried in them. Kept upright (a small
    // random lean, not laid flat) so the same code is correct whichever way
    // the gate is long — no risk of a lay-down rotation being right for one
    // orientation and wrong for the other.
    const caneCount = span > 3.5 ? 2 : 1;
    for (let i = 0; i < caneCount; i++) {
      const f = caneCount === 1 ? 0 : (i - 0.5) * 0.6;
      const caneKey = i % 2 === 0 ? 'bareQ1' : 'bareQ2';
      const raw = caneKey === 'bareQ1' ? 2.86 : 3.84;
      const cane = tinted(woodKit[caneKey], 'thornCane', 0x2f4a1e, 0.8);
      cane.position.set(x + (along ? f * w : (i - 0.5) * 0.4),
        0, z + (along ? (i - 0.5) * 0.4 : f * d));
      cane.rotation.set(0.12 * (i ? -1 : 1), i * 2.1, 0.08 * (i ? 1 : -1));
      cane.scale.setScalar(1.7 / raw);    // ~1.7u — over the bushes, under the canopy
      g.add(cane);
    }
  }
  world.add(g);
  const collider = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
  world.boxColliders.push(collider);

  const entry = registerCuttable(world, { id, x, z, region: REGION, group: g, collider, regrows, onCut });

  if (regrows) {
    // THE CLOCK. Cut it and it is gone; stand around and it comes back, in the
    // same place, cuttable again. The bramble is put back into the scene and
    // its collider restored, and `cut` is cleared so world.cutAt sees it again.
    let since = 0;
    world.onAnimate((t, dt) => {
      if (!entry.cut) return;
      since += dt;
      if (since < REGROW_AFTER) return;
      since = 0;
      entry.cut = false;
      world.add(g);
      world.boxColliders.push(collider);
    });
  }
  return g;
}

// THE LOG BRIDGE — a gap you cannot walk, a log lying beside it, and a
// holding-rope. It USED to be a verdant-lash cuttable, taught before the
// child had earned the wolf that opens it. Sylva's grant now lands AFTER her
// fight (see the ceremony in main.js), so the spine has to run on the form
// the child actually holds this early: fire. The rope is a scorched hemp tie,
// not a green vine — burn it and the log still swings the same way. WS
// bookkeeping stays a 'cut_' key for save-compat with the region's other
// chords (rootCut/logDown) that DO stay verdant-locked, post-boss content.
function logBridge(world, id, x, z) {
  const done = state.flags.burned[id];
  const GAP_W = 14, GAP_D = 3.2;

  // the gap itself: impassable until the log lands
  if (!done) {
    world.addBox(x - GAP_W / 2, x + GAP_W / 2, z - GAP_D / 2, z + GAP_D / 2);
  } else {
    world.addSafe(x - GAP_W / 2, x + GAP_W / 2, z - GAP_D / 2, z + GAP_D / 2);
  }

  const log = GREY()
    ? new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.2, 1.2),
        protoMaterial(0x8a6a3a, 3, 1))
    : tinted(woodKit.logStack, 'bridgeLog', 0x6b4d2c);
  if (!GREY()) log.scale.setScalar(2.2);

  if (done) {
    // already swung: it IS the bridge
    log.position.set(x, 0.1, z);
    log.rotation.set(0, Math.PI / 2, 0);
    if (!GREY()) log.scale.set(2.2, 1.4, 5.2);
    world.add(log);
    return null;
  }

  // upright, off to the side, obviously not yet a bridge — and HELD UP by the
  // rope below it, so it is meant to be off the ground until that rope burns.
  // Named so the grounding check knows the difference between hanging and
  // hovering.
  log.name = 'hangingLog';
  log.position.set(x + GAP_W / 2 - 2, 1.4, z - 2.4);
  log.rotation.set(0, 0.3, 0.5);
  world.add(log);

  // the rope: a scorched hemp-and-branch tie, burnable, standing where the
  // slam can reach it from the safe side. Real timber (logStack), charred
  // dark so fire reads — the same silhouette family as L2's burn pin.
  const ropeZ = z - GAP_D / 2 - 1.6;
  const ropeX = x + GAP_W / 2 - 2;
  const ropeGroup = new THREE.Group();
  if (GREY()) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2c211a, emissive: 0xff7a2d, emissiveIntensity: 0.2 }));
    m.position.y = 0.9;
    ropeGroup.add(m);
  } else {
    const strut = tinted(woodKit.logStack, 'rope', 0x3a2a1c, 0.9);
    strut.rotation.z = 0.08;
    strut.scale.set(1.6, 2.6, 1.6);
    ropeGroup.add(strut);
    const glint = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.0, 18),
      new THREE.MeshBasicMaterial({ color: 0xff7a2d, transparent: true, opacity: 0.34,
        side: THREE.DoubleSide, depthWrite: false })
    );
    glint.rotation.x = -Math.PI / 2;
    glint.position.y = world.deckY + 0.04;
    ropeGroup.add(glint);
  }
  ropeGroup.position.set(ropeX, 0, ropeZ);
  world.add(ropeGroup);

  const collider = { minX: ropeX - 0.7, maxX: ropeX + 0.7,
    minZ: ropeZ - 0.7, maxZ: ropeZ + 0.7 };
  world.boxColliders.push(collider);

  world.burnables.push({
    id, x: ropeX, z: ropeZ, hitR: 1.3, group: ropeGroup, collider,
    clear: () => {
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      // the log SWINGS — a second of movement, then it is the road
      const from = { y: log.position.y, rz: log.rotation.z, ry: log.rotation.y };
      let k = 0;
      world.onAnimate((t, dt) => {
        if (k >= 1) return;
        k = Math.min(1, k + dt * 1.4);
        const e = 1 - Math.pow(1 - k, 3);
        log.position.set(x + (GAP_W / 2 - 2) * (1 - e), from.y * (1 - e) + 0.1 * e, z - 2.4 * (1 - e));
        log.rotation.set(0, from.ry + (Math.PI / 2 - from.ry) * e, from.rz * (1 - e));
        if (k >= 1) {
          if (!GREY()) log.scale.set(2.2, 1.4, 5.2);
          // the gap becomes walkable at the moment the log lands, not before
          const gi = world.boxColliders.findIndex((b) =>
            b.minX === x - GAP_W / 2 && b.minZ === z - GAP_D / 2);
          if (gi >= 0) world.boxColliders.splice(gi, 1);
          world.addSafe(x - GAP_W / 2, x + GAP_W / 2, z - GAP_D / 2, z + GAP_D / 2);
        }
      });
      if (WS.complete(REGION, 'cut_' + id)) bigToastSafe('🔥 The rope burns through — the log swings down!');
    },
  });
  world.markers.logBridge = { x: ropeX, z: ropeZ };
  return log;
}

// The hero props. In a ring these carry more navigational load than in either
// earlier level: they are not decoration, they are the answer to "have I been
// here before?" asked from a door the child has never used. Greybox form is a
// bold blocky silhouette at TRUE SCALE, because that is the question.
function heroProp(world, x, z, kind, D, scale = 1) {
  const g = new THREE.Group();
  // colliders are placed in world space, so they do not come along for free
  // when the group is scaled — every one goes through here instead
  const circle = (ox, oz, r) => world.addCircle(x + ox * scale, z + oz * scale, r * scale);

  if (GREY()) {
    const mat = protoMaterial(D.tint, 3, 3);
    const add = (w, h, d, px, py, pz, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz); m.rotation.set(0, ry, rz); m.castShadow = true;
      g.add(m);
    };
    if (kind === 'leaningShrine') {        // a toppled statue, half-swallowed
      add(2.2, 6.0, 2.2, 0, 2.6, 0, 0, 0.5);
      add(4.4, 1.0, 4.4, 0, 0.5, 0);
      circle(0, 0, 2.0);
    } else if (kind === 'watchingTree') {  // a vast hollow trunk with a face
      add(5.0, 9.0, 5.0, 0, 4.5, 0);
      add(2.2, 2.6, 1.0, 0, 5.6, 2.4);     // the hollow — the "face"
      circle(0, 0, 2.5);
    } else if (kind === 'rootArch') {      // roots grown into a doorway
      add(1.8, 7.0, 1.8, -3.4, 3.5, 0, 0, 0.22);
      add(1.8, 7.0, 1.8, 3.4, 3.5, 0, 0, -0.22);
      add(8.0, 1.6, 2.0, 0, 7.0, 0);
      circle(-3.4, 0, 1.0); circle(3.4, 0, 1.0);
    } else if (kind === 'blossomFall') {   // a permanent cascade of petals
      add(3.0, 8.5, 3.0, 0, 4.25, 0);
      add(7.5, 1.2, 7.5, 0, 8.6, 0);
      circle(0, 0, 1.6);
    } else if (kind === 'standingStones') {
      // rim ring + colliders, matching the dressed branch (arena law)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(1.3, 4.6, 1.3, Math.cos(a) * 10.4, 2.3, Math.sin(a) * 10.4, a);
        circle(Math.cos(a) * 10.4, Math.sin(a) * 10.4, 1.1);
      }
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    world.add(g);
    return g;
  }

  const put = (gltf, key, px, py, pz, s, ry = 0, rz = 0, colour = D.wallTint) => {
    const m = tinted(gltf, key, colour);
    m.position.set(px, py, pz);
    m.rotation.set(0, ry, rz);
    m.scale.setScalar(s);
    g.add(m);
    return m;
  };

  if (kind === 'leaningShrine') {
    if (scale === 1) {
      // a real knight model, stone grey, toppled and sinking — the wolf-knight
      // who came before, which is the whole reason Thornedge feels like a warning
      const st = tinted(woodKit.statue, 'shrineStatue', 0x8f9186);
      st.scale.setScalar(2.6);
      st.rotation.set(0, 0.6, 0.5);
      st.position.set(0, 1.2, 0);
      g.add(st);
    } else {
      // ...and the gate markers are NOT more knights. That model is a character
      // rig: it never merges into the static batch, and two more copies took
      // t1a from 79 draw calls to 119. They are what a shrine's waymarkers
      // would actually be — smaller stones set at the same lean, the same grey,
      // on the same base — which is also the truer fiction. There was one
      // wolf-knight before Kael, not three.
      put(woodKit.pillar, 'shrineMark', 0, 0.4, 0, 2.9, 0.6, 0.5, 0x8f9186);
    }
    put(woodKit.rockLA, 'shrineBase', 0, 0, 0, 2.2, 0.3, 0, 0x6e6f66);
    circle(0, 0, 2.0);
  } else if (kind === 'watchingTree') {
    put(woodKit.treeA, 'watchTree', 0, 0, 0, 4.2, 0.4, 0, 0x1d3a34);
    put(woodKit.stump, 'watchTree', 0, 0, 2.2, 3.0, 0, 0, 0x14262b);
    // the hollow reads as a face from above only if it GLOWS — two eyes
    const eyes = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.1, 20),
      new THREE.MeshBasicMaterial({ color: 0x7fe8c8, transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, depthWrite: false })
    );
    eyes.rotation.x = -Math.PI / 2;
    // INSIDE the group, so a half-size copy at a gate gets half-size eyes
    eyes.position.set(0, world.deckY + 0.05, 0);
    g.add(eyes);
    circle(0, 0, 2.5);
  } else if (kind === 'rootArch') {
    put(woodKit.arch, 'rootArch', 0, 0, 0, 3.4, 0, 0, 0x4a3320);
    put(woodKit.logStack, 'rootArch', -3.6, 0, 0.6, 1.8, 0.4);
    put(woodKit.logStack, 'rootArch', 3.6, 0, -0.4, 1.8, -0.4);
    circle(-3.4, 0, 1.0); circle(3.4, 0, 1.0);
  } else if (kind === 'blossomFall') {
    put(woodKit.treeB, 'blossom', 0, 0, 0, 4.4, 0, 0, 0xe8a8c0);
    // the fall itself: petals drifting down, one InstancedMesh, one draw call.
    // Only the full-size Bloomfall gets them: a gate copy needs the SILHOUETTE,
    // and 60 more instances per gatepost buys nothing a child can read.
    if (scale === 1) {
      const petals = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.22, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xffd9e8, transparent: true, opacity: 0.85,
          side: THREE.DoubleSide, depthWrite: false }),
        60
      );
      const dm = new THREE.Object3D();
      const seed = [];
      for (let i = 0; i < 60; i++) {
        seed.push({ a: i * 2.39, r: 0.6 + (i % 7) * 0.55, y: (i % 11) * 0.75 });
      }
      world.add(petals);
      world.keepLoose(petals);
      world.onAnimate((t) => {
        for (let i = 0; i < 60; i++) {
          const s = seed[i];
          const yy = 8.2 - ((s.y + t * 1.1) % 8.2);
          dm.position.set(x + Math.cos(s.a + t * 0.2) * s.r, yy, z + Math.sin(s.a + t * 0.2) * s.r);
          dm.rotation.set(t * 0.8 + i, s.a, 0);
          dm.updateMatrix();
          petals.setMatrixAt(i, dm.matrix);
        }
        petals.instanceMatrix.needsUpdate = true;
      });
    }
    circle(0, 0, 1.6);
  } else if (kind === 'standingStones') {
    // AT THE RIM, WITH COLLIDERS — the arena law (level1 'le'). These stood in
    // a r6.2 ring dead-centre of the fight space, inside Sylva's prowl radius
    // and charge lane, and uniquely among heroProps had NO colliders: six
    // walk-through ghost pillars mid-arena. Dad: "shit everywhere and can't
    // see anything." r10.4 (scr's crownstone ring) puts them against the
    // walls; the angle offset keeps the boss-door approach and the spawn
    // corridor clear of stone.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      put(woodKit.pillar, 'stones', Math.cos(a) * 10.4, 0, Math.sin(a) * 10.4, 2.2, a, 0, 0x8a9a7a);
      circle(Math.cos(a) * 10.4, Math.sin(a) * 10.4, 1.1);
    }
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  world.add(g);
  return g;
}

// THE NORTH GATE (A6) — how a junction announces itself to someone walking
// SOUTH into it.
//
// The camera is a fixed world-space offset: it sits 7.07 u south of the player
// and never rotates, so the frame shows 12.8 u of ground AHEAD (north) and only
// 4.6 u behind. Every ring leg returns to its junction through the junction's
// north door, arriving at z = -10 facing south — which puts the centre
// landmark at z = 0 a full 2.9 u BEHIND THE CAMERA ITSELF. Not clipped, not
// small: behind. No amount of height or scale reaches it, and moving the
// landmark north only breaks the three approaches that currently work, because
// an island is 26 u deep and the camera covers 17.4 u of ground in total.
//
// So the junction says its name twice. A pair of half-size copies of its OWN
// landmark stand just inside the north door, 1.2 u ahead of where a child lands
// — the same silhouette, at the top of the frame, the instant they arrive. The
// big one at the centre is still the payoff when they turn round.
//
// Deliberately not a HUD marker: dad ruled that out, and he was right. This is
// architecture a child can walk up to, and it makes the ring's north gates read
// as gates.
const GATE = { x: 3.6, z: -11.2, scale: 0.45 };
function northGate(world, kind, D) {
  for (const side of [-1, 1]) {
    const gx = side * GATE.x;
    heroProp(world, gx, GATE.z, kind, D, GATE.scale);
    world.heroMarks.push({ x: gx, z: GATE.z });
  }
}

// ---------------------------------------------------------------------------
function base(scene, id) {
  const spec = L3[id];
  const world = new World(scene);
  world.bgColor = 0x0d1410;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#d8f0c8', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#93a68c', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  // LAST LINE OF DEFENCE. A builder that dressed before it set its markers
  // could not have consulted them, so anything still standing on a gameplay
  // square loses its collider here and says so on the console. See
  // World.sweepKeepClear.
  world.sweepKeepClear();
  thresholdGlow(world);   // the next room's colour, spilled at each doorway
  flattenStatic(world);
  return world;
}

// A junction's hero prop sits at the room's DEAD CENTRE, not against a wall.
// In a ring the same space is entered from three or four different doors, and
// a landmark tucked into a corner is only a landmark from one of them.
//
// Measured: at z = -2 the Leaning Shrine projected to ndcY 1.08 from the
// entrance — just off the top of the screen, because the camera only shows
// 12.8 u ahead and the entry sits 11 u away. Dead centre puts every junction
// landmark ~9-10 u from every one of its doors, inside the frame from all of
// them. It also stands in the middle of the floor, which breaks the square
// and gives the fight something to circle.
const JUNCTION_HERO = { x: 0, z: 0 };

// ===========================================================================
// 1 · THORNEDGE — the entry, and the ring's closing junction
// ===========================================================================
export async function buildT1a(scene) {
  const { world, spec, D } = base(scene, 't1a');
  const logDown = WS.get(REGION, 'logDown');
  // FOUR ways in: from the world, from t1b (outbound), from the glade (the
  // ring closing), and from the fallen-log chord once it is down.
  const gaps = [gap('s'), gap('n'), gap('e')];
  if (logDown) gaps.push(gap('w'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.29 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  // BACK THROUGH THE VINE, to the crypt — the way a child came in. This door
  // pointed at the DEN, whose only exit is Ember Hollow: one step south out of
  // the first Wild Woods room stranded a kid two regions from the forest
  // (found by the run-3 played route; the den has no door back).
  // landing offset beside the crypt's doorway: dead-centre (0,-10) is inside
  // the throne's collider (verify-landings caught it — pushedBy 1.42)
  sideDoor(world, 's', halfW, halfD, 'vz', { x: 1.6, z: -11.1, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't1b', { x: 0, z: 10, angle: Math.PI });
  // LANDS ON FLOOR. Checked by verify-reachable's landing sweep — see there for
  // why nothing had ever measured these.
  sideDoor(world, 'e', halfW, halfD, 'tgl', { x: -9.6, z: 8.5, angle: Math.PI / 2 });
  if (logDown) sideDoor(world, 'w', halfW, halfD, 'tsA', { x: 10, z: 0, angle: -Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'leaningShrine', D);
  northGate(world, 'leaningShrine', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -7, z: 4 };
  // NO ENEMIES, deliberately. The beat chart's first row is "the woods are
  // wrong (quiet dread, NO FIGHT)" at intensity 1, and t1b next door is
  // labelled "first Thorn Hounds" — a hound here contradicted both, and made
  // the level open on a fight instead of on the feeling that something is off.
  scatter(world, halfW, halfD, D, 121, 6, { spin: 1, kinds: ['treeA', 'stump', 'rockSA', 'bush'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.1 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.1 });
  grove(world, -11, -8, 3.6, D, { sick: 0.30 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.1 });
  thicket(world, 5, -4, 3.2, D, { sick: 0.30 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 4);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildT1b(scene) {
  const { world, spec, D } = base(scene, 't1b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('e')], D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.32 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't1a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc1', { x: 0, z: 7, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 't1p', { x: -7.5, z: 0, angle: Math.PI / 2 });

  world.markers.houndSpots = [{ x: -6, z: 2, variant: 'thorn' }, { x: 7, z: -5, variant: 'thorn' },
    { x: 5, z: 6, variant: 'thorn' }];
  // GATE — bramble walls, before the shrine. Same tangle, same look as the one
  // seeded back in Stoneroot a whole level ago.
  wallRun(world, -16, -8.5, -11, -8.5, D);
  wallRun(world, -16, -3.5, -11, -3.5, D);
  bramble(world, 'w3_thorn_wall', -11, -6, 2.0, 5.0);
  visibleReward(world, -13.5, -6, 'l3_t1b_bramble', { shards: 20, gear: 'sword_verdant' });
  world.markers.thornPromise = { x: -11, z: -6 };
  // GATE — the ICE-SEALED SPRING. Level 4's tool, a whole level early.
  wallRun(world, 11, 2, 16, 2, D);
  wallRun(world, 11, 6, 16, 6, D);
  promiseGate(world, 11, 4, 3.0, 4.0, 0x9be3ff, 'FROZEN — later', 'rockSB',
              { system: 'shatter', id: 'l3_spring_ice', region: REGION });
  visibleReward(world, 13.5, 4, 'l3_t1b_ice', { shards: 22 });
  world.markers.icePromise = { x: 11, z: 4 };
  scatter(world, halfW, halfD, D, 122, 6, { spin: 1, kinds: ['treeA', 'treeB', 'stump', 'rockSB'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.15 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.15 });
  grove(world, -11, -8, 3.6, D, { sick: 0.35 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.15 });
  thicket(world, 5, -4, 3.2, D, { sick: 0.35 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildT1p(scene) {
  const { world, spec, D } = base(scene, 't1p');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: -6, z: 3, r: 3.0, kind: 'moss' },
              { x: 6, z: -3, r: 2.8, kind: 'corruption', alpha: 0.29 },
              { x: -5, z: -4, r: 2.4, kind: 'mud' }],
  });
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  // THE CAMERA LANE IS GROUND GAMEPLAY OWNS. The camera hangs 7u south of
  // Kael (+z, CAM_OFFSET in main.js), so a canopy planted between the spawn
  // and that point fills the whole arrival frame with leaves — the B1
  // screenshot audit found a child stepping into this pocket saw a tree, not
  // a room. grove() already asks blocked() before every trunk; this reserve
  // makes the sight line something it can refuse.
  world.reserve(-7.5, 3.5, 2.6, 'cameraLane');
  sideDoor(world, 'w', halfW, halfD, 't1b', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  wallRun(world, -2, -3, 5, -3, D);
  world.markers.pup7Spot = { x: 6, z: -5 };
  scatter(world, halfW, halfD, D, 123, 6, { spin: 1, kinds: ['stump', 'bush'] });
  grove(world, -6.5, 4, 3.4, D, { sick: 0.1 });
  grove(world, 6.5, -4, 3.0, D, { sick: 0.30 });
  thicket(world, -2, -5, 2.8, D, { sick: 0.1 });
  thicket(world, 3, 5, 2.6, D, { sick: 0.1 });
  // undergrowth beside the reserved camera lane — no canopy, so it can sit
  // this close to the spawn without ever blocking the view; puts back the
  // in-frame density the lane took from the grove (22 of a floor of 20
  // without it — one relaid prop from passing on luck)
  thicket(world, -5.2, -2.2, 2.2, D, { sick: 0.1 });
  blight(world, 6, 4, 2.4, D);
  aftermath(world, -6, -4, 1.8, D, 6);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildTc1(scene) {
  const { world, spec, D } = base(scene, 'tc1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -3, z: 0, r: 2.1, kind: 'moss' },
              { x: 3, z: 0, r: 2.0, kind: 'corruption', alpha: 0.32 },
              { x: -2, z: -1, r: 1.7, kind: 'mud' }],
  });
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't1b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't2a', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  scatter(world, halfW, halfD, D, 124, 6, { spin: 1, kinds: ['treeA', 'stump'] });
  grove(world, -4.4, 2.6, 2.2, D, { sick: 0.15, trees: 3 });
  grove(world, 4.4, -2.6, 2.0, D, { sick: 0.15, trees: 3 });
  thicket(world, 4.2, 2.4, 2.0, D, { sick: 0.15 });
  blight(world, -4.4, -2.6, 1.8, D);
  aftermath(world, 0, 2.2, 1.5, D, 3);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ===========================================================================
// 2 · THE GLOOMWOOD
// ===========================================================================
export async function buildT2a(scene) {
  const { world, spec, D } = base(scene, 't2a');
  const rootCut = WS.get(REGION, 'rootCut');
  const gaps = [gap('s'), gap('n')];
  if (rootCut) gaps.push(gap('e'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.39 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tc1', { x: 0, z: -7, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't2b', { x: 0, z: 10, angle: Math.PI });
  if (rootCut) sideDoor(world, 'e', halfW, halfD, 'tsB', { x: -10, z: 0, angle: Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'watchingTree', D);
  northGate(world, 'watchingTree', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 5 };
  // the dark: the Dark Wolf's eyes are the way through, as in Ember
  darkZone(world, -halfW, halfW, -halfD, 4);
  world.markers.mothSpots = [{ x: -5, z: -6, variant: 'wisp' }, { x: 6, z: -4, variant: 'wisp' }];
  // A ground shape in the dark. Moths dive and wheel; a Bramble Blob crawls at
  // 1.2 u/s, which is the only kind of thing that is fair to put where a child
  // cannot see without the Dark Wolf's eyes.
  world.markers.toxinSlimeSpots = [{ x: -7, z: -1 }];
  scatter(world, halfW, halfD, D, 131, 6, { spin: 1, kinds: ['treeB', 'mushT', 'mushG', 'rockSA'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.3 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.3 });
  grove(world, -11, -8, 3.6, D, { sick: 0.50 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.3 });
  thicket(world, 5, -4, 3.2, D, { sick: 0.50 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 6);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildT2b(scene) {
  const { world, spec, D } = base(scene, 't2b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('w')], D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.42 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't2a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tsh', { x: 0, z: 5.5, angle: Math.PI });
  sideDoor(world, 'w', halfW, halfD, 't2p', { x: 7.5, z: 0, angle: -Math.PI / 2 });

  darkZone(world, -halfW, halfW, -halfD, 2);
  world.markers.mothSpots = [{ x: -4, z: 4, variant: 'wisp' }, { x: 5, z: -2, variant: 'wisp' },
    { x: -7, z: -6, variant: 'wisp' }];
  world.markers.slimeSpots = [{ x: 7, z: 5, variant: 'bramble' }];
  wallRun(world, 4, -4, 4, 6, D);
  scatter(world, halfW, halfD, D, 132, 6, { spin: 1, kinds: ['treeB', 'mushT', 'stump'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.38 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.38 });
  grove(world, -11, -8, 3.6, D, { sick: 0.58 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.38 });
  thicket(world, 5, -4, 3.2, D, { sick: 0.58 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 4);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildT2p(scene) {
  const { world, spec, D } = base(scene, 't2p');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {
    patches: [{ x: -6, z: 3, r: 3.0, kind: 'moss' },
              { x: 6, z: -3, r: 2.8, kind: 'corruption', alpha: 0.39 },
              { x: -5, z: -4, r: 2.4, kind: 'mud' }],
  });
  world.spawn = { x: 7.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 't2b', { x: -13.5, z: 0, angle: Math.PI / 2 });
  visibleReward(world, -6, -3, 'l3_t2p_chest', { shards: 24 });
  world.markers.pupSpot = { x: 6, z: 4.5, id: 'pup_t3' };
  world.markers.mothSpots = [{ x: -3, z: 4, variant: 'wisp' }];
  // The splitting blob lives HERE rather than in t3b. Measured: a Bramble Blob
  // costs ~17 draw calls at its peak, not 5 — it dies into two minis and their
  // drops land on top of whatever else the room has already dropped. t3b
  // arrives at 86 and went to 102 with one in it; this pocket arrives at 54.
  world.markers.slimeSpots = [{ x: 4, z: -4, variant: 'bramble' }];
  scatter(world, halfW, halfD, D, 133, 6, { spin: 1, kinds: ['mushG', 'mushT'] });
  grove(world, -6.5, 4, 3.4, D, { sick: 0.3 });
  grove(world, 6.5, -4, 3.0, D, { sick: 0.50 });
  thicket(world, -2, -5, 2.8, D, { sick: 0.3 });
  thicket(world, 3, 5, 2.6, D, { sick: 0.3 });
  blight(world, 6, 4, 2.4, D);
  aftermath(world, -6, -4, 1.8, D, 4);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// SYLVA'S SPARK — TEACH 1: INTRODUCE. One bramble across a doorway. Nothing
// else in the room to do, no enemies, no timer.
export async function buildTsh(scene) {
  const { world, spec, D } = base(scene, 'tsh');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -6, z: 3, r: 3.0, kind: 'moss' },
              { x: 6, z: -3, r: 2.8, kind: 'corruption', alpha: 0.36 },
              { x: -5, z: -4, r: 2.4, kind: 'mud' }],
  });
  world.spawn = { x: 0, z: 5.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't2b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc2', { x: 0, z: 7, angle: Math.PI });

  world.markers.shrineSpot = { x: 0, z: -2 };
  // NO `grants` HERE ANY MORE (dad's law, applied region by region: "each
  // elemental wolf is locked behind an elemental boss fight of that element").
  // Sylva's shrine is a PROMISE now — cold stone naming the fight ahead,
  // exactly like the Kiln shrine in Ember Hollow — and the real grant lives
  // in main.js, watching state.flags.sylvaDefeated (mirrors the Fire Wolf's
  // ceremony). The doorway bramble that used to gate this room is gone too:
  // it was the child's ONLY verdant-locked obstacle before they had verdant,
  // and its job (introduce the cut) no longer has anywhere to live pre-boss.
  world.markers.sparkSpot = { x: 0, z: -2, spirit: 'sylva' };
  if (!GREY()) {
    const ped = tinted(woodKit.rockLC, 'shrine', 0x6f9e55);
    ped.position.set(0, 0, -2);
    ped.scale.setScalar(1.6);
    world.add(ped);
  }
  world.addCircle(0, -2, 0.9);
  // The same light Petra's shrine now carries. A spirit's stone is the most
  // important thing in its region and it should not be the dimmest.
  spiritShrine(world, 0, -2, 0x9fe07a);
  grove(world, -6.5, 4, 3.4, D, { sick: 0.25 });
  grove(world, 6.5, -4, 3.0, D, { sick: 0.45 });
  thicket(world, -2, -5, 2.8, D, { sick: 0.25 });
  thicket(world, 3, 5, 2.6, D, { sick: 0.25 });
  blight(world, 6, 4, 2.4, D);
  aftermath(world, -6, -4, 1.8, D, 7);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// TEACH 2 — DEVELOP. The way out of the shrine: brambles that grow back if you
// dawdle, and a bramble rope you lash to swing a fallen log into a bridge.
export async function buildTc2(scene) {
  const { world, spec, D } = base(scene, 'tc2');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -3, z: 0, r: 2.1, kind: 'moss' },
              { x: 3, z: 0, r: 2.0, kind: 'corruption', alpha: 0.41 },
              { x: -2, z: -1, r: 1.7, kind: 'mud' }],
  });
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  // NOT IN THE BRAMBLE. This put the child down at (0,-5.5) — half a metre from
  // the teaching bramble at (0,-5), which is a collider until it is cut.
  sideDoor(world, 's', halfW, halfD, 'tsh', { x: -0.5, z: -6.6, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't3a', { x: 0, z: 10, angle: Math.PI });

  // Three tangles across the way out, each of which grows back if you dawdle.
  // Cut, move, cut, move — the lesson is not the verb, it is the tempo.
  world.markers.developBrambles = [{ x: -4, z: 4 }, { x: 4, z: 1 }, { x: 0, z: -1 }];
  for (const [i, p] of world.markers.developBrambles.entries()) {
    bramble(world, `l3_tc2_${i}`, p.x, p.z, 3.0, 1.2, true);   // REGROWS
  }
  // ...and then the same verb used on something that is NOT a tangle at all.
  logBridge(world, 'l3_tc2_bridge', 0, -6);
  grove(world, -4.4, 2.6, 2.2, D, { sick: 0.35, trees: 3 });
  grove(world, 4.4, -2.6, 2.0, D, { sick: 0.35, trees: 3 });
  thicket(world, 4.2, 2.4, 2.0, D, { sick: 0.35 });
  blight(world, -4.4, -2.6, 1.8, D);
  aftermath(world, 0, 2.2, 1.5, D, 5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ===========================================================================
// 3 · THE ROOTBOUND DEEP
// ===========================================================================
export async function buildT3a(scene) {
  const { world, spec, D } = base(scene, 't3a');
  const rootCut = WS.get(REGION, 'rootCut');
  const gaps = [gap('s'), gap('n')];
  if (rootCut) gaps.push(gap('w'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.50 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  // LANDS ON FLOOR. Checked by verify-reachable's landing sweep — see there for
  // why nothing had ever measured these.
  sideDoor(world, 's', halfW, halfD, 'tc2', { x: -0.2, z: -8.6, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't3b', { x: 0, z: 10, angle: Math.PI });
  if (rootCut) sideDoor(world, 'w', halfW, halfD, 'tsB', { x: 10, z: 0, angle: -Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'rootArch', D);
  northGate(world, 'rootArch', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: 8, z: 6 };
  // THE ROOT-WALL: a chord you can SEE the Gloomwood through, before you can
  // cut it. It is the shortcut, and it reads as later, not as broken.
  if (!rootCut) {
    // CUT IT AND THE CHORD OPENS. This is a shortcut that unlocks from the FAR
    // side: a child arriving here has already walked the long way round, so
    // the root-wall is a reward for the distance rather than a way to skip it.
    bramble(world, 'l3_rootwall', -13, 0, 2.0, 6.0, false, () => {
      if (WS.complete(REGION, 'rootCut')) {
        bigToastSafe('🌿 A way back opens through the roots!');
      }
    });
    world.markers.rootWallPromise = { x: -13, z: 0 };
  }
  world.markers.thornstalkerSpots = [{ x: 6, z: -6 }];
  world.markers.houndSpots = [{ x: -6, z: 4, variant: 'thorn' }];
  scatter(world, halfW, halfD, D, 141, 6, { spin: 1, kinds: ['logStack', 'stump', 'rockLB', 'treeA'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.55 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.55 });
  grove(world, -11, -8, 3.6, D, { sick: 0.75 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.55 });
  thicket(world, 5, -4, 3.2, D, { sick: 0.75 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 4);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildT3b(scene) {
  const { world, spec, D } = base(scene, 't3b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('e')], D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.53 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't3a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tkn', { x: 0, z: 10, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 't3p', { x: -7.5, z: 0, angle: Math.PI / 2 });

  for (const [i, p] of [[-5, 3], [5, 0], [-2, -5]].entries()) {
    bramble(world, `l3_t3b_${i}`, p[0], p[1], 3.0, 1.2, true);
  }
  // (7,5), not (8,4): a breakable pot's own circle collider lands at
  // (8.9, 3.69) — close enough to overlap a spawn at (8,4) once the real
  // kit is loaded (verify-spawn-clear.mjs, greybox:false). Moved clear.
  world.markers.quiverbonesSpots = [{ x: 7, z: 5 }];
  world.markers.houndSpots = [{ x: -8, z: -4, variant: 'thorn' }];
  scatter(world, halfW, halfD, D, 142, 6, { spin: 1, kinds: ['logStack', 'rockLC', 'stump'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.62 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.62 });
  grove(world, -11, -8, 3.6, D, { sick: 0.82 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.62 });
  thicket(world, 5, -4, 3.2, D, { sick: 0.82 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 6);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildT3p(scene) {
  const { world, spec, D } = base(scene, 't3p');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: -6, z: 3, r: 3.0, kind: 'moss' },
              { x: 6, z: -3, r: 2.8, kind: 'corruption', alpha: 0.50 },
              { x: -5, z: -4, r: 2.4, kind: 'mud' }],
  });
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  // Same camera-lane reserve as t1p, same reason: the arrival frame was a
  // wall of canopy (B1 audit). See the comment there.
  world.reserve(-7.5, 3.5, 2.6, 'cameraLane');
  sideDoor(world, 'w', halfW, halfD, 't3b', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  wallRun(world, 0, -4, 0, 3, D);
  world.markers.pup8Spot = { x: 6, z: -3 };
  world.markers.slimeSpots = [{ x: 5, z: 3, variant: 'bramble' }];
  scatter(world, halfW, halfD, D, 143, 6, { spin: 1, kinds: ['logStack', 'stump'] });
  grove(world, -6.5, 4, 3.4, D, { sick: 0.55 });
  grove(world, 6.5, -4, 3.0, D, { sick: 0.75 });
  thicket(world, -2, -5, 2.8, D, { sick: 0.55 });
  thicket(world, 3, 5, 2.6, D, { sick: 0.55 });
  blight(world, 6, 4, 2.4, D);
  aftermath(world, -6, -4, 1.8, D, 3);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// THE KNOT — the one puzzle room, and TEACH 3: THE TWIST.
// The lash does not only CUT, it HOLDS. Tether a boulder and drag it; snare a
// Thorn Hound and hold it still. The tool they learned as a blade is a rope.
// It is ON THE SPINE, not in a pocket — Level 2 taught us that a skippable
// twist teaches three quarters of an ability.
export async function buildTkn(scene) {
  const { world, spec, D } = base(scene, 'tkn');
  const solved = () => !!state.flags.plates.l3_knot_p1;
  // the way onward opens when the plate is held down — the puzzle IS the door
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.52 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't3b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc3', { x: 0, z: 7, angle: Math.PI },
    { when: () => !!state.flags.plates.l3_knot_p1 });

  // ---------------------------------------------------------------------
  // THE KNOT — an honest push-and-plate room, the same shared furniture as
  // Stoneroot and Frostpeak. It used to be a LASH-TETHER puzzle told the
  // child pushing was impossible ("no floor behind the boulder"), but the
  // channel was open at its west end the whole time — the room's own fiction
  // was never enforced, and the tether verb it demanded belonged to the wolf
  // Sylva had not yet granted. Dad: "the lashing the boulder is weak and it
  // doesn't work properly. get rid of it." Gone: the tether, the channel
  // walls that manufactured the false "can't push" premise, and the framing
  // around them. What is left is what was always physically true — push the
  // boulder onto the plate — now honest about it.
  // ---------------------------------------------------------------------
  world.markers.houndSpots = [{ x: 3, z: 3, variant: 'thorn' }];

  if (!GREY()) {
    pushableBoulder(world, prepareModel, woodKit.rockLB, -8, 2);
  } else {
    // greybox: the same collider and the same slide, in a plain box, so the
    // puzzle can be walked and judged before any art exists
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), protoMaterial(0x8a8d95, 2, 2));
    g.add(m);
    g.position.set(-8, 0.65, 2);
    world.add(g);
    const collider = { x: -8, z: 2, r: 0.62 };
    world.circleColliders.push(collider);
    world.boulders.push({ x: -8, z: 2, r: 0.62, group: g, mesh: m, collider });
  }

  plateSwitch(world, 'l3_knot_p1', 6, 2, () => {
    state.flags.plates.l3_knot_p1 = true;
  });
  world.markers.plateSpots = [{ x: 6, z: 2, id: 'l3_knot_p1' }];

  // THE LANE ITSELF MUST STAY CLEAR. The boulder only ever travels the
  // straight line from its start to the plate — but `world.blocked()` (which
  // scatter/potSpots consult) only knows the boulder's STARTING point, not
  // the ground it rolls across to get to the plate. A random breakable
  // dropped mid-lane deflects the roll sideways on contact and the boulder
  // then tracks that new heading in a dead straight line forever, skimming
  // past the plate's capture radius without ever landing on it — the exact
  // "physically impossible puzzle" dad flagged at Frostpeak, just found here
  // by walking the room for real instead of assuming honest geometry.
  for (let x = -8; x <= 7; x += 2.2) world.reserve(x, 2, 1.6, 'boulderLane');

  scatter(world, halfW, halfD, D, 144, 6, { spin: 1, kinds: ['logStack', 'rockLA'] });
  // THE KNOT is the puzzle room — the mechanic must stay readable, so it is dressed at the WALLS and nowhere near the middle.
  grove(world, -12.5, 9.5, 3.2, D, { sick: 0.6 });
  grove(world, 12.5, 9.5, 3.2, D, { sick: 0.6 });
  blight(world, -12.5, -9.5, 3.0, D);
  blight(world, 12.5, -9.5, 3.0, D);
  thicket(world, 0, 10.5, 4.0, D, { sick: 0.6 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildTc3(scene) {
  const { world, spec, D } = base(scene, 'tc3');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -3, z: 0, r: 2.1, kind: 'moss' },
              { x: 3, z: 0, r: 2.0, kind: 'corruption', alpha: 0.52 },
              { x: -2, z: -1, r: 1.7, kind: 'mud' }],
  });
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tkn', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't4a', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  scatter(world, halfW, halfD, D, 145, 6, { spin: 1, kinds: ['stump', 'rockSA'] });
  grove(world, -4.4, 2.6, 2.2, D, { sick: 0.6, trees: 3 });
  grove(world, 4.4, -2.6, 2.0, D, { sick: 0.6, trees: 3 });
  thicket(world, 4.2, 2.4, 2.0, D, { sick: 0.6 });
  blight(world, -4.4, -2.6, 1.8, D);
  aftermath(world, 0, 2.2, 1.5, D, 5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ===========================================================================
// 4 · THE BLOOMFALL — the far side, and the only district already WELL
// ===========================================================================
export async function buildT4a(scene) {
  const { world, spec, D } = base(scene, 't4a');
  const logDown = WS.get(REGION, 'logDown');
  const gaps = [gap('s'), gap('n')];
  if (logDown) gaps.push(gap('e'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    // DRIFTS, not a carpet. The first pass used r=6 and r=4 and the petals
    // covered the entire arrival frame, which put the room straight back to the
    // flat pink field the base change was meant to fix. Blossom should be the
    // thing you notice ON the ground, never the ground.
    patches: [{ x: -7, z: 5, r: 2.8, kind: 'blossom' },
              { x: 6, z: -7, r: 2.4, kind: 'blossom' },
              { x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.60 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tc3', { x: 0, z: -7, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't4b', { x: 0, z: 10, angle: Math.PI });
  if (logDown) sideDoor(world, 'e', halfW, halfD, 'tsA', { x: -10, z: 0, angle: Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'blossomFall', D);
  northGate(world, 'blossomFall', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 6 };
  // THE GREAT LOG — push it over and it becomes the chord home. Visible from
  // the moment you arrive; it reads as "that goes somewhere", not as scenery.
  if (!logDown) {
    // THE GREAT LOG. Lash the vines holding it and it comes down across the
    // gully, opening the long chord home to Thornedge. Same verb the level has
    // taught all the way round — nothing new after the twist.
    world.markers.logPromise = { x: 12, z: 0 };
    const lg = GREY()
      ? new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.0, 1.8),
          new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 }))
      : tinted(woodKit.treeB, 'greatLog', 0x7a5a34);
    lg.position.set(12, GREY() ? 3 : 0, 0);
    if (!GREY()) lg.scale.setScalar(3.4);
    world.add(lg);
    world.addCircle(12, 0, 1.2);
    bramble(world, 'l3_greatlog', 10.4, 0, 1.2, 3.0, false, () => {
      // it falls: a second of movement, then it is the road home
      let k = 0;
      world.onAnimate((t, dt) => {
        if (k >= 1) return;
        k = Math.min(1, k + dt * 1.2);
        const e = 1 - Math.pow(1 - k, 3);
        lg.rotation.z = -e * Math.PI / 2;
        lg.position.y = (GREY() ? 3 : 0) * (1 - e) + 0.6 * e;
      });
      if (WS.complete(REGION, 'logDown')) {
        bigToastSafe('🪵 The great log crashes down — a way home!');
      }
    });
  }
  // THE PACK — the beat chart's "the pack, Elder Thorn Hounds" at intensity 4,
  // and the last fight before the glade. Two elders and three of the pack.
  // It reads as a pack rather than a pile-on because CONFIG.ENGAGE only ever
  // hands out 2 attack tokens (1 on Gentle, 3 on Brave) — the rest prowl a
  // waiting ring, so a child meets one pattern at a time however many are here.
  world.markers.houndSpots = [{ x: -6, z: -5, variant: 'elderthorn' },
    { x: 6, z: -6, variant: 'elderthorn' },
    { x: -10, z: 2, variant: 'thorn' }, { x: 7, z: 5, variant: 'thorn' },
    { x: 3, z: 8, variant: 'thorn' }];
  scatter(world, halfW, halfD, D, 151, 6, { spin: 1, kinds: ['treeB', 'flowerA', 'flowerB', 'bush'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.78 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.78 });
  grove(world, -11, -8, 3.6, D, { sick: 0.98 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.78 });
  thicket(world, 5, -4, 3.2, D, { sick: 0.98 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 4);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// TEACH 4 — CONCLUDE. The great thorn-knot: the same cut, at a scale that
// changes a district. Cutting it blooms the Bloomfall and opens the Glade.
export async function buildT4b(scene) {
  const { world, spec, D } = base(scene, 't4b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('w')], D, {
    // DRIFTS, not a carpet. The first pass used r=6 and r=4 and the petals
    // covered the entire arrival frame, which put the room straight back to the
    // flat pink field the base change was meant to fix. Blossom should be the
    // thing you notice ON the ground, never the ground.
    patches: [{ x: -7, z: 5, r: 2.8, kind: 'blossom' },
              { x: 6, z: -7, r: 2.4, kind: 'blossom' },
              { x: -12, z: 8, r: 4.8, kind: 'moss' },
              { x: 12, z: -8, r: 4.5, kind: 'corruption', alpha: 0.63 },
              { x: -11, z: -9, r: 3.8, kind: 'mud' },
              { x: 11, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't4a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc4', { x: 0, z: 7, angle: Math.PI });
  sideDoor(world, 'w', halfW, halfD, 't4p', { x: 7.5, z: 0, angle: -Math.PI / 2 });

  // THE GREAT THORN-KNOT — the last thing standing between here and Sylva.
  // A whole district's worth of dry, choking thorn, and it gates the boss
  // door itself (tc4's north door checks WS 'knotCut'). It used to be a
  // verdant-lash cuttable taught before the child had verdant — the exact
  // thing dad's law forbids. Fire burns thorn as readily as it burns
  // anything else this level, and "burn the great tangle" is the oldest verb
  // in the book. WS key unchanged so a save already past this point needs no
  // migration.
  world.markers.thornKnot = { x: 0, z: -7 };
  {
    const done = state.flags.burned.l3_thornknot;
    const KX = 0, KZ = -7, KW = 7.0, KD = 2.0;
    if (!done) {
      const g = new THREE.Group();
      if (GREY()) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(KW, 1.8, KD),
          new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9,
            emissive: 0xff7a2d, emissiveIntensity: 0.18 }));
        m.position.set(KX, 0.9, KZ);
        g.add(m);
      } else {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1) - 0.5;
          const key = i % 2 === 0 ? 'bareQ1' : 'bareQ2';
          const raw = key === 'bareQ1' ? 2.86 : 3.84;
          const piece = tinted(woodKit[key], 'thornknot', 0x2a1c12, 0.85 + (i % 3) * 0.08);
          piece.position.set(KX + f * KW, 0, KZ + (i % 2 - 0.5) * 0.6);
          piece.rotation.set(0.15 * (i % 2 ? -1 : 1), i * 1.7, 0);
          piece.scale.setScalar(1.9 / raw);
          g.add(piece);
        }
        const glint = new THREE.Mesh(
          new THREE.RingGeometry(KW * 0.32, KW * 0.42, 24),
          new THREE.MeshBasicMaterial({ color: 0xff7a2d, transparent: true, opacity: 0.3,
            side: THREE.DoubleSide, depthWrite: false })
        );
        glint.rotation.x = -Math.PI / 2;
        glint.position.set(KX, world.deckY + 0.04, KZ);
        g.add(glint);
      }
      world.add(g);
      const collider = { minX: KX - KW / 2, maxX: KX + KW / 2, minZ: KZ - KD / 2, maxZ: KZ + KD / 2 };
      world.boxColliders.push(collider);
      world.burnables.push({
        // half the width, not the full width — hitR pads the burn radius by
        // the object's own extent (the crackedPile/burnPin convention), and
        // using the FULL 7.0u width here would let a slam land from 10u away
        id: 'l3_thornknot', x: KX, z: KZ, hitR: Math.max(KW, KD) / 2, group: g, collider,
        clear: () => {
          const i = world.boxColliders.indexOf(collider);
          if (i >= 0) world.boxColliders.splice(i, 1);
          if (WS.complete(REGION, 'knotCut')) {
            bigToastSafe('🔥 The great thorn-knot burns away — the glade is ahead!');
          }
        },
      });
    }
  }
  world.markers.houndSpots = [{ x: -7, z: 3, variant: 'elderthorn' }];
  world.markers.rotcasterSpots = [{ x: 7, z: 5 }];
  scatter(world, halfW, halfD, D, 152, 6, { spin: 1, kinds: ['treeB', 'flowerA', 'flowerB'] });
  grove(world, -12, 8, 4.2, D, { sick: 0.85 });
  grove(world, 11.5, 7, 3.8, D, { sick: 0.85 });
  grove(world, -11, -8, 3.6, D, { sick: 1.00 });
  blight(world, 11, -8, 3.4, D);
  thicket(world, -3, 4, 3.4, D, { sick: 0.85 });
  thicket(world, 5, -4, 3.2, D, { sick: 1.00 });
  mossyRuin(world, -10, 0, 0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, 4, 5, 0.4, D, 3.2);
  aftermath(world, -11, 1.5, 2.0, D, 6);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildT4p(scene) {
  const { world, spec, D } = base(scene, 't4p');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {
    // DRIFTS, not a carpet. The first pass used r=6 and r=4 and the petals
    // covered the entire arrival frame, which put the room straight back to the
    // flat pink field the base change was meant to fix. Blossom should be the
    // thing you notice ON the ground, never the ground.
    patches: [{ x: -7, z: 5, r: 2.8, kind: 'blossom' },
              { x: 6, z: -7, r: 2.4, kind: 'blossom' },
              { x: -6, z: 3, r: 3.0, kind: 'moss' },
              { x: 6, z: -3, r: 2.8, kind: 'corruption', alpha: 0.60 },
              { x: -5, z: -4, r: 2.4, kind: 'mud' }],
  });
  world.spawn = { x: 7.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 't4b', { x: -13.5, z: 0, angle: Math.PI / 2 });
  visibleReward(world, -6, -3, 'l3_t4p_chest', { shards: 26, heartPiece: 1 }, 'gold');
  scatter(world, halfW, halfD, D, 153, 6, { spin: 1, kinds: ['flowerA', 'flowerB', 'bush'] });
  grove(world, -6.5, 4, 3.4, D, { sick: 0.78 });
  grove(world, 6.5, -4, 3.0, D, { sick: 0.98 });
  thicket(world, -2, -5, 2.8, D, { sick: 0.78 });
  thicket(world, 3, 5, 2.6, D, { sick: 0.78 });
  blight(world, 6, 4, 2.4, D);
  aftermath(world, -6, -4, 1.8, D, 4);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildTc4(scene) {
  const { world, spec, D } = base(scene, 'tc4');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n', BOSS_DOOR_HALF)], D, {
    // DRIFTS, not a carpet. The first pass used r=6 and r=4 and the petals
    // covered the entire arrival frame, which put the room straight back to the
    // flat pink field the base change was meant to fix. Blossom should be the
    // thing you notice ON the ground, never the ground.
    patches: [{ x: -7, z: 5, r: 2.8, kind: 'blossom' },
              { x: 6, z: -7, r: 2.4, kind: 'blossom' },
              { x: -3, z: 0, r: 2.1, kind: 'moss' },
              { x: 3, z: 0, r: 2.0, kind: 'corruption', alpha: 0.62 },
              { x: -2, z: -1, r: 1.7, kind: 'mud' }],
  });
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't4b', { x: 0, z: -10, angle: 0 });
  // the glade waits on the great thorn-knot: the conclude step IS the door
  sideDoor(world, 'n', halfW, halfD, 'tgl', { x: 0, z: 9.5, angle: Math.PI },
    { half: BOSS_DOOR_HALF, when: () => WS.get(REGION, 'knotCut') });
  world.markers.restSpot = { x: -3, z: 0 };
  world.markers.potionSpot = { x: 3, z: 0 };
  grove(world, -4.4, 2.6, 2.2, D, { sick: 0.82, trees: 3 });
  grove(world, 4.4, -2.6, 2.0, D, { sick: 0.82, trees: 3 });
  thicket(world, 4.2, 2.4, 2.0, D, { sick: 0.82 });
  blight(world, -4.4, -2.6, 1.8, D);
  aftermath(world, 0, 2.2, 1.5, D, 3);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ===========================================================================
// SYLVA'S GLADE — the boss, and the room that CLOSES THE RING
// ===========================================================================
export async function buildTgl(scene) {
  const { world, spec, D } = base(scene, 'tgl');
  const beaten = !!state.flags.sylvaDefeated;
  // The ring closes here: west back to Thornedge. It is walked, always open,
  // and it is what turns a very long branch into a loop.
  // The ring closes west to Thornedge, always. North opens ONWARD to Frostpeak
  // once Sylva is freed (fix plan A1) — Frostpeak was never rebuilt and is
  // reached exactly as it always was.
  const gaps = [gap('s', BOSS_DOOR_HALF), gap('w'), ...(beaten ? [gap('n')] : [])];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -9, z: 8, r: 3.9, kind: 'moss' },
              { x: 9, z: -8, r: 3.6, kind: 'corruption', alpha: 0.66 },
              { x: -8, z: -9, r: 3.1, kind: 'mud' },
              { x: 8, z: 9, r: 3.6, kind: 'grass' }],
  });
  world.spawn = { x: 0, z: 9.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tc4', { x: 0, z: -7, angle: 0 }, { half: BOSS_DOOR_HALF });
  // LANDS ON FLOOR. Checked by verify-reachable's landing sweep — see there for
  // why nothing had ever measured these.
  sideDoor(world, 'w', halfW, halfD, 't1a', { x: 10.9, z: 9.4, angle: -Math.PI / 2 });
  if (beaten) sideDoor(world, 'n', halfW, halfD, 'f1', { x: 0, z: 4.2, angle: Math.PI });

  heroProp(world, 0, -2, 'standingStones', D);
  world.markers.heroSpot = { x: 0, z: -2 };
  if (!beaten) world.markers.bossSpot = { x: 0, z: -4, skin: 'sylva' };
  world.markers.sylvaSpot = { x: 0, z: -4, spirit: 'sylva' };
  // SYLVA'S GLADE is the boss arena — she needs a clear floor, so it is dressed at the WALLS and nowhere near the middle.
  grove(world, -10, 10, 3.0, D, { sick: 0.9 });
  grove(world, 10, 10, 3.0, D, { sick: 0.9 });
  blight(world, -10, -10, 3.0, D);
  blight(world, 10, -10, 3.0, D);
  thicket(world, 0, 11, 3.4, D, { sick: 0.9 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ===========================================================================
// THE TWO CHORDS. Each is a real walked space, because "the way back was
// shorter" has to be something a child FEELS — a door that teleports would
// feel like nothing at all, and dad's law says nothing teleports the player.
// ===========================================================================
export async function buildTsA(scene) {
  const { world, spec, D } = base(scene, 'tsA');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: -6, z: 3, r: 3.0, kind: 'moss' },
              { x: 6, z: -3, r: 2.8, kind: 'corruption', alpha: 0.45 },
              { x: -5, z: -4, r: 2.4, kind: 'mud' }],
  });
  world.spawn = { x: 10, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 't4a', { x: -10, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 't1a', { x: 10, z: 0, angle: -Math.PI / 2 });
  world.markers.shortcutSpot = { x: 0, z: 0 };
  if (!GREY()) {
    // the log you pushed over, now lying across the gap as the road
    const log = tinted(woodKit.logStack, 'fallenLog', 0x7a5a34);
    log.position.set(0, 0, 0);
    log.rotation.y = Math.PI / 2;
    log.scale.set(3.0, 2.0, 2.0);
    world.add(log);
  }
  grove(world, -6.5, 4, 3.4, D, { sick: 0.45 });
  grove(world, 6.5, -4, 3.0, D, { sick: 0.65 });
  thicket(world, -2, -5, 2.8, D, { sick: 0.45 });
  thicket(world, 3, 5, 2.6, D, { sick: 0.45 });
  blight(world, 6, 4, 2.4, D);
  aftermath(world, -6, -4, 1.8, D, 5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildTsB(scene) {
  const { world, spec, D } = base(scene, 'tsB');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: -6, z: 3, r: 3.0, kind: 'moss' },
              { x: 6, z: -3, r: 2.8, kind: 'corruption', alpha: 0.45 },
              { x: -5, z: -4, r: 2.4, kind: 'mud' }],
  });
  world.spawn = { x: 10, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 't3a', { x: -10, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 't2a', { x: 10, z: 0, angle: -Math.PI / 2 });
  world.markers.shortcutSpot = { x: 0, z: 0 };
  grove(world, -6.5, 4, 3.4, D, { sick: 0.45 });
  grove(world, 6.5, -4, 3.0, D, { sick: 0.65 });
  thicket(world, -2, -5, 2.8, D, { sick: 0.45 });
  thicket(world, 3, 5, 2.6, D, { sick: 0.45 });
  blight(world, 6, 4, 2.4, D);
  aftermath(world, -6, -4, 1.8, D, 6);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE METRICS ZOO ADDITION — Level 3's one new module, at true scale, drawn
// against the island it has to be told apart from.
// ---------------------------------------------------------------------------
export function zooRingModule(world, protoDecal, say) {
  protoDecal(world, 0, -8, RING.w, RING.d, 0x8fdc6a, 0.14);
  say(0, 2.6, `LEVEL 3 RING LEG ${RING.w} x ${RING.d}u — travel, not compression`, '#8fdc6a');
}

export const LEVEL3_ROOMS = {
  t1a: buildT1a, t1b: buildT1b, t1p: buildT1p, tc1: buildTc1,
  t2a: buildT2a, t2b: buildT2b, t2p: buildT2p, tsh: buildTsh, tc2: buildTc2,
  t3a: buildT3a, t3b: buildT3b, t3p: buildT3p, tkn: buildTkn, tc3: buildTc3,
  t4a: buildT4a, t4b: buildT4b, t4p: buildT4p, tc4: buildTc4,
  tgl: buildTgl,
  tsA: buildTsA, tsB: buildTsB,
};
