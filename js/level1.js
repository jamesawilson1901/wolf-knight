// LEVEL 1 — EMBER HOLLOW, rebuilt to design/LEVEL-MAP.md (2026-08-07).
//
// Topology: wide-linear "string of pearls" — five open islands joined by four
// chokepoints, with five optional pockets that all loop back onto the spine.
//
// BUILD ORDER LAW (dad): greybox before art, without exception. Every space
// here is described ONCE, as data, and rendered either as greybox (checkered
// proto geometry) or dressed (art from GREEN-bucket packs) depending on
// `state.settings.greybox`. One description, two costumes — so the greybox
// that gets walked and approved is provably the same layout that ships.
//
// Sizes come from design/METRICS.md and are NOT free parameters:
//   island 32x26  — two camera-widths across (16.1u visible), so it cannot be
//                   seen all at once; ~7s to cross, the minimum that holds an
//                   approach, an encounter and a recovery
//   choke  14x10  — smaller than one screen ON PURPOSE, so it reads as
//                   compression against the islands
//   pocket 20x16  — about one screen: a reward should be legible at a glance
//   arena  26x26  — the Shadowgrip's charge runs ~8u and needs dodging room
// Everything snaps to the 1.0u grid. No existing space was rescaled.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoFloor, protoWall, protoDecal, protoLabel, protoMaterial } from './proto.js';
import { loadGLB, prepareModel } from './assets.js';
import { makeBuilders, tintedModel, gap, DOOR_HALF } from './levelkit.js';
import { zooHubModule } from './level2.js';
import { zooRingModule } from './level3.js';
import { flattenStatic } from './batch.js';
import { brazier } from './gates.js';

// Greybox is the default until dressed — and is FORCED in two cases that are
// not a preference: the metrics zoo exists to measure, never to look nice, and
// a room whose art kit was never loaded has no art costume to wear (asking for
// one would throw on the first emberKit lookup).
let forceGrey = false;
const GREY = () => forceGrey || !emberKit || state.settings.greybox !== false;

// ---------------------------------------------------------------------------
// DISTRICTS — colour, floor and hero prop. The palette IS the navigation
// (design/LEVEL-MAP.md): children recall "the orange bit" long before they
// could read a map, so the tint is carried into the greybox rather than being
// added with the art. The arc warms grey → orange → red → gold going in, then
// turns cold violet at the boss.
// ---------------------------------------------------------------------------
// `tint` is the greybox display colour (bright, so the checker stays legible).
// `floorTint`/`wallTint` are the DRESSED colours applied to the Kenney kit —
// darker, because a lit texture reads several stops lighter than a flat swatch.
// The wall tints are deliberately about HALF the luminance of their floor.
// The first dressed pass used near-identical values and the Kiln read as one
// flat brown field with no depth at all — from a 50-degree camera the only
// thing separating a wall from the ground it stands on is its value.
export const DISTRICTS = {
  // `propTint` is the THIRD value, and it exists because the first dressed pass
  // of the settlement used the other two and looked wrong in both directions:
  // wallTint is deliberately about half the floor's luminance (it was picked so
  // a cliff face separates from the ground it stands on) and renders a barrel
  // as a black slab, while floorTint renders one as bleached bone. A thing you
  // walk PAST needs to sit between the ground and the wall, and warmer than
  // either — ash greys everything it lands on, but not to neutral.
  //
  // One prop tint per district is also what makes the density affordable:
  // tintedModel keys its cache on class+tint, so every prop in a district
  // shares three materials (dark/mid/light) and flattenStatic folds each
  // cell's worth into a single draw.
  ashfall:  { tint: 0x8d8b86, floorTint: 0x8b8580, wallTint: 0x3b3835, propTint: 0x8a7a6c,
              name: 'THE ASHFALL',         hero: 'THE FALLEN GATE' },
  causeway: { tint: 0xb5702f, floorTint: 0xa2632f, wallTint: 0x40241a, propTint: 0x8f6440,
              name: 'EMBER CAUSEWAY',      hero: 'THE KILN' },
  bridges:  { tint: 0x9c3a2a, floorTint: 0x8a4436, wallTint: 0x33191a, propTint: 0x7d4a3a,
              name: 'CINDER BRIDGES',      hero: 'THE BROKEN SPAN' },
  kiln:     { tint: 0xc99a3a, floorTint: 0xb98d3c, wallTint: 0x453317, propTint: 0x9c7a44,
              name: 'THE KILN',            hero: 'THE FORGE HEART' },
  heart:    { tint: 0x6a5a8a, floorTint: 0x5d5078, wallTint: 0x241d33, propTint: 0x5f5470,
              name: 'HEART OF THE HOLLOW', hero: "CINDER'S CAGE" },
};

// ---------------------------------------------------------------------------
// THE LEVEL, as data. `spine: true` marks the guaranteed critical path.
// Every non-spine space declares the space it loops back to — the no-dead-ends
// rule is therefore checkable by reading this table, not by walking the level.
// ---------------------------------------------------------------------------
export const L1 = {
  la:  { kind: 'island', w: 32, d: 26, district: 'ashfall',  spine: true,
         label: 'A · THE ASHFALL', beat: 'arrival · first Shades' },
  la1: { kind: 'pocket', w: 20, d: 16, district: 'ashfall',  loopsTo: 'la',
         label: 'Ash Warrens', beat: 'optional · maze + secret' },
  lg1: { kind: 'choke',  w: 14, d: 10, district: 'ashfall',  spine: true,
         label: 'THE FALLEN GATE', beat: 'REST · compression' },
  lb:  { kind: 'island', w: 32, d: 26, district: 'causeway', spine: true,
         label: 'B · EMBER CAUSEWAY', beat: 'moths · geysers' },
  lb1: { kind: 'pocket', w: 20, d: 16, district: 'causeway', loopsTo: 'lb',
         label: 'Moth Hollow', beat: 'optional · pup #1' },
  lb2: { kind: 'pocket', w: 20, d: 16, district: 'causeway', loopsTo: 'lb',
         label: 'Scorched Cubby', beat: 'optional · pup #3 · FIRE GATE' },
  lg2: { kind: 'choke',  w: 14, d: 10, district: 'causeway', spine: true,
         label: 'THE NARROWS', beat: 'REST' },
  lc:  { kind: 'island', w: 32, d: 26, district: 'bridges',  spine: true,
         label: 'C · CINDER BRIDGES', beat: 'lava slabs · Elder Hound' },
  lc1: { kind: 'pocket', w: 20, d: 16, district: 'bridges',  loopsTo: 'lc',
         label: 'The Drowned Forge', beat: 'optional · chest' },
  lg3: { kind: 'choke',  w: 14, d: 10, district: 'bridges',  spine: true,
         label: 'THE EMBER SEAL', beat: 'REST · key gate' },
  ld:  { kind: 'island', w: 32, d: 26, district: 'kiln',     spine: true,
         label: 'D · THE KILN', beat: 'SHRINE → FIRE WOLF · gutter run' },
  ld1: { kind: 'pocket', w: 20, d: 16, district: 'kiln',     loopsTo: 'ld',
         label: 'THE ORDER HALL', beat: 'THE PUZZLE ROOM · the twist' },
  lg4: { kind: 'choke',  w: 14, d: 10, district: 'kiln',     spine: true,
         label: 'THE BOSS DOOR', beat: 'REST · flame + potion' },
  le:  { kind: 'arena',  w: 26, d: 26, district: 'heart',    spine: true,
         label: 'E · HEART OF THE HOLLOW', beat: 'THE SHADOWGRIP' },
};

// The spine, in order. Written down so it can be asserted, not just believed.
export const SPINE = ['la', 'lg1', 'lb', 'lg2', 'lc', 'lg3', 'ld', 'lg4', 'le'];

// The four-step ability teach, in the order it must be encountered.
export const TEACH = [
  { step: 'introduce', room: 'ld',  what: 'one cold brazier, no enemies, no timer' },
  { step: 'develop',   room: 'ld',  what: 'the Gutter Run — three braziers, the flame creeps back' },
  { step: 'twist',     room: 'ld1', what: 'THE ORDER HALL — the order is only readable as the Dark Wolf' },
  { step: 'conclude',  room: 'le',  what: 'slam the cage-braziers in the boss collapse windows' },
];

// ---------------------------------------------------------------------------
// THE EMBER KIT — the art costume. Every file below is covered by a verified
// CC0 licence in assets/LICENSES/MANIFEST.json (Kenney Nature Kit 2.1, Kenney
// Castle Kit 2.0, Quaternius LowPoly Modular Dungeon), i.e. GREEN bucket only.
// Nothing here comes from an UNKNOWN pack.
// ---------------------------------------------------------------------------
let emberKit = null;
export async function loadEmberKit() {
  if (emberKit) return emberKit;
  const names = {
    floor:   './assets/env/floor-tile.glb',      // Kenney Nature  🟢
    cliff:   './assets/env/cliff-block.glb',     // Kenney Nature  🟢
    rockLA:  './assets/env/rock-large-a.glb',    // Kenney Nature  🟢
    rockLB:  './assets/env/rock-large-b.glb',
    rockLC:  './assets/env/rock-large-c.glb',
    rockSA:  './assets/env/rock-small-a.glb',
    rockSB:  './assets/env/rock-small-b.glb',
    stump:   './assets/env/stump.glb',
    logStack:'./assets/env/log-stack.glb',
    bridge:  './assets/env/bridge-stone.glb',
    path:    './assets/env/path-tile.glb',
    pillar:  './assets/env/pillar.glb',          // Kenney Castle  🟢
    torch:   './assets/env/dungeon/Torch.glb',   // Quaternius Dungeon 🟢
    bars:    './assets/env/dungeon/Arch_bars.glb',
    column:  './assets/env/dungeon/Column.glb',
    // --- THE SETTLEMENT ----------------------------------------------------
    // Ember Hollow is RUINED AND SAD: somewhere people LIVED before it burned.
    // Every model below was already vendored and licence-cleared, and every one
    // was used ZERO times — Level 1 shipped using three of the twenty-five
    // dungeon props. These are the ones that say a family lived here.
    column2: './assets/env/dungeon/Column2.glb',        // Quaternius Dungeon 🟢
    arch:    './assets/env/dungeon/Arch.glb',
    archDoor:'./assets/env/dungeon/Arch_Door.glb',
    wallMod: './assets/env/dungeon/Wall_Modular.glb',
    wallCov: './assets/env/dungeon/WallCover_Modular.glb',
    decorWall:'./assets/env/dungeon/Decorative_Wall.glb',
    stairs:  './assets/env/dungeon/Stairs_Modular.glb',
    pedestal:'./assets/env/dungeon/Pedestal.glb',
    horse:   './assets/env/dungeon/Statue_Horse.glb',
    banner:  './assets/env/dungeon/Banner_wall.glb',
    woodfire:'./assets/env/dungeon/Woodfire.glb',
    barrel:  './assets/env/dungeon/Barrel.glb',
    crate:   './assets/env/dungeon/Crate.glb',
    vase:    './assets/env/dungeon/Vase.glb',
    brick:   './assets/env/dungeon/Brick.glb',
    skull:   './assets/env/dungeon/Skull.glb',
    coins:   './assets/env/dungeon/Coin_Pile.glb',
    cobweb:  './assets/env/dungeon/Cobweb.glb',
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  emberKit = Object.fromEntries(entries);
  return emberKit;
}

// ---------------------------------------------------------------------------
// The shared build vocabulary (js/levelkit.js). Level 1 used to own private
// copies of the shell, the door, the wall run and the scatter; Level 2 needs
// exactly the same ones, and two copies of "greybox and dressed must agree"
// is a guarantee that they eventually will not. Call signatures are unchanged.
// ---------------------------------------------------------------------------
const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward,
  darkZone: protoDarkZone } = makeBuilders({
    kit: () => emberKit,
    isGrey: () => GREY(),
  });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

// The lava you can SEE. In greybox the channel is a red decal so its footprint
// can be judged; dressed, it is an emissive surface with a pulsing light, and
// the safe slabs are real bridge pieces laid across it.
function lavaSurface(world, x, z, w, d) {
  if (GREY()) return null;
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a2b, emissiveIntensity: 1.8, roughness: 1 })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(x, world.deckY + 0.02, z);
  world.add(lava);
  world.keepLoose(lava);                     // it animates; do not fold it in
  const light = new THREE.PointLight(0xff6a33, 11, Math.max(w, d) * 2.4, 1.8);
  light.position.set(x, 1.2, z);
  world.add(light);
  world.onAnimate((t) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.3 + x) * Math.sin(t * 0.7 + z);
    lava.material.emissiveIntensity = 1.5 + pulse * 0.9;
    light.intensity = 8 + pulse * 5;
  });
  return lava;
}

// A walkable slab across the lava, from real bridge pieces.
function slab(world, x, z, w, d, D) {
  if (GREY()) return;
  for (let i = 0; i < Math.max(1, Math.round(w / 2)); i++) {
    const p = tinted(emberKit.bridge, 'slab', D.wallTint);
    p.position.set(x - w / 2 + 1 + i * 2, world.deckY + 0.03, z);
    p.scale.set(1.1, 1, d / 2.2);
    world.add(p);
  }
}

// The teach braziers, dressed. In greybox these are markers only — a brazier
// is a gameplay object, and the greybox exists to test SPACE, not systems.
function teachBraziers(world, spots, prefix, onLit) {
  if (GREY()) return;
  spots.forEach((sp, i) => brazier(world, prepareModel, emberKit.torch, `${prefix}${i + 1}`, sp.x, sp.z, onLit));
}

// A hero prop: the district's memory anchor. Greybox form is a bold blocky
// silhouette at true scale — the point of testing it early is precisely that
// it must READ FROM ABOVE, and that is a silhouette question, not an art one.
function heroProp(world, x, z, kind, tint, D = null) {
  const g = new THREE.Group();

  if (GREY()) {
    const mat = protoMaterial(tint, 3, 3);
    const add = (w, h, d, px, py, pz, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz); m.rotation.y = ry;
      m.castShadow = true;
      g.add(m);
    };
    if (kind === 'gate') {           // a toppled arch you walk UNDER
      add(2, 5.5, 2, -3.5, 2.75, 0); add(2, 5.5, 2, 3.5, 2.75, 0); add(9, 1.6, 2.2, 0, 6.3, 0);
      world.addCircle(x - 3.5, z, 1.2); world.addCircle(x + 3.5, z, 1.2);
    } else if (kind === 'cone') {    // the Kiln volcano — visible from everywhere
      add(9, 7, 9, 0, 3.5, 0); add(5.5, 4, 5.5, 0, 9, 0);
      world.addCircle(x, z, 4.6);
    } else if (kind === 'span') {    // a collapsed stone bridge over the chasm
      for (let i = 0; i < 7; i++) add(2.2, 1.1, 1.1, -7 + i * 2.4, 1.3 + Math.sin(i) * 0.5, 0, i * 0.4);
    } else if (kind === 'bowl') {    // the Forge Heart — a brazier the size of a room
      add(10, 1.4, 10, 0, 0.7, 0); add(7.5, 2.6, 7.5, 0, 2.4, 0);
      world.addCircle(x, z, 5.2);
    } else if (kind === 'cage') {    // Cinder's cage
      add(3.2, 4.4, 3.2, 0, 2.2, 0);
      world.addCircle(x, z, 1.9);
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }

  // DRESSED. Same footprint, same colliders, same silhouette-from-above —
  // built entirely from GREEN-pack models. Nothing here is named after a thing
  // that is not on screen: the Cinder Bridges anchor is a BROKEN SPAN because
  // a broken span is what bridge-stone.glb can actually be.
  const wall = D ? D.wallTint : tint;
  const put = (gltf, key, px, py, pz, s, ry = 0, rz = 0, colour = wall) => {
    const m = tinted(gltf, key, colour);
    m.position.set(px, py, pz);
    m.rotation.set(0, ry, rz);
    m.scale.setScalar(s);
    g.add(m);
    return m;
  };

  if (kind === 'gate') {
    // THE FALLEN GATE. Two pillars still standing; the lintel came down and now
    // lies across the ground between them.
    //
    // It used to be placed at y = 4.9 lying on its side — resting on NOTHING.
    // The uprights are at x = ±3.5 and a pillar on its side reaches x −1.8→3.0,
    // so it touched neither of them and simply hovered at head height in the
    // first room of the game. Dad spotted it on his first playthrough.
    //
    // A lintel that has FALLEN belongs on the floor, which also reads the story
    // better: this gate is broken, not merely old.
    put(emberKit.pillar, 'heroPillar', -3.5, 0, 0, 2.4);
    put(emberKit.pillar, 'heroPillar', 3.5, 0, 0, 2.4);
    put(emberKit.pillar, 'heroPillar', 0.4, 0.55, -0.7, 2.4, 0.18, Math.PI / 2);
    world.addCircle(x - 3.5, z, 1.2); world.addCircle(x + 3.5, z, 1.2);
    world.addCircle(x + 0.4, z - 0.7, 1.0);   // you walk around the fallen piece
  } else if (kind === 'cone') {
    // the Kiln itself: a cone of stacked boulders, the landmark the whole
    // level is walking toward. Big enough to be read from two rooms away.
    const ring = (r, y, n, s) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        put(i % 2 ? emberKit.rockLA : emberKit.rockLC, 'heroCone',
          Math.cos(a) * r, y, Math.sin(a) * r, s, a);
      }
    };
    ring(4.2, 0, 9, 2.0); ring(2.7, 2.6, 7, 1.7); ring(1.3, 4.8, 5, 1.3);
    world.addCircle(x, z, 4.6);
  } else if (kind === 'span') {
    // THE BROKEN SPAN — a stone bridge that used to cross the chasm, its
    // sections tipped and sagging. Real bridge pieces, really broken.
    for (let i = 0; i < 5; i++) {
      put(emberKit.bridge, 'heroSpan', -6 + i * 3, 0.4 + Math.sin(i * 1.3) * 0.5, 0,
        1.5, 0.06 * i, (i - 2) * 0.13);
    }
  } else if (kind === 'bowl') {
    // THE FORGE HEART — a ring of dungeon columns around a sunken fire bowl.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      put(emberKit.column, 'heroBowl', Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4, 1.5, a);
    }
    const coals = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a2b, emissiveIntensity: 1.5, roughness: 1 })
    );
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = world.deckY + 0.05;
    g.add(coals);
    world.keepLoose(coals);
    world.onAnimate((t) => { coals.material.emissiveIntensity = 1.2 + Math.sin(t * 1.7) * 0.5; });
    world.addCircle(x, z, 5.2);
  } else if (kind === 'cage') {
    // CINDER'S CAGE — four barred arches boxing the spirit in. Real bars.
    for (let i = 0; i < 4; i++) {
      put(emberKit.bars, 'heroCage', 0, 0, 0, 1.9, (i / 4) * Math.PI * 2, 0, 0x4a4350);
    }
    world.addCircle(x, z, 1.9);
  }
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// THE ROOM BUILDERS
// ---------------------------------------------------------------------------

function base(scene, id) {
  const spec = L1[id];
  const world = new World(scene);
  world.bgColor = 0x17101f;
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    protoLabel(world, 0, 0, spec.label, { color: '#ffd9c2', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#9b8e85', y: 2.4, size: 1.4 });
    return world;
  }
  // The district's light. Wayfinding without text (design/LEVEL-MAP.md):
  // the room's own colour temperature tells a child which part of the level
  // they are standing in before they look at a single prop.
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };

  // THE GUARDRAIL. Every static prop placed above is folded into one draw per
  // material here — measured on the shipping rooms, this is worth 40-70 draw
  // calls a room and it is the difference between Level 1 fitting in the
  // budget and not. Anything gameplay holds (gates, chests, enemies, the
  // Forge Heart coals) is protected and left alone. See js/batch.js.
  flattenStatic(world);
  return world;
}

// ---------------------------------------------------------------------------
// THE RUIN VOCABULARY
//
// design/ROOM-STANDARD.md, written after dad's first playthrough: the rooms
// "are largely filled with nothing… big but bare… they aren't like a Zelda game
// or terranigma game or even a Pokemon game that uses space effectively."
//
// The reason the old rooms were bare is not that placing props is hard. It is
// that the vocabulary was wrong. `scatter()` sprinkles rocks, and a room
// sprinkled with rocks is decorated, not INHABITED. You do not dress Ember
// Hollow by placing a barrel — you place the REMAINS OF A HOUSE, and the barrel
// is one of the things left in it.
//
// So these are CLUSTERS. Each one is a sentence about what happened here.
//
// Two rules run through all of them, from ROOM-STANDARD §2:
//   BIG THINGS BLOCK    — walls, columns, statues, hearths get colliders and
//                         you navigate around them; this is what shapes a room
//   SMALL THINGS DON'T  — bricks, skulls, coins, cobwebs, spilled belongings
//                         have no collider at all, so a five-year-old running
//                         at the screen never snags on scenery
//
// Draw calls are not the constraint they look like: tintedModel() keys its
// cache on material identity, so every prop cut from the dungeon atlas at one
// district tint shares ONE material, and flattenStatic() folds the lot into a
// single merged draw. A thirty-prop cluster costs about one call.
// ---------------------------------------------------------------------------

// Small deterministic PRNG, so a ruin looks the same every time a child walks
// back into the room. A room that reshuffles on re-entry tells them the world
// is not real.
function srnd(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One placement helper shared by every cluster below. Returns the mesh so a
// caller can nudge it; adds nothing to any gameplay list, so flattenStatic
// folds it away.
function place(world, g, gltf, key, x, y, z, s, ry = 0, rz = 0, colour = 0x808080, shadow = true) {
  if (!gltf) return null;
  const m = tinted(gltf, key, colour);
  m.position.set(x, y, z);
  m.rotation.set(0, ry, rz);
  m.scale.setScalar(s);
  // THE SHADOW PASS IS A SECOND DRAW CALL, per caster, forever. flattenStatic
  // culls casters under 1.4u AFTER merging — but a merged cell of forty bricks
  // is sixteen units across and sails through that test, so the cull never sees
  // the bricks it was written for. Small clutter therefore opts out HERE,
  // before it is merged, and its shadowless batch buckets separately.
  if (!shadow) m.traverse((n) => { if (n.isMesh) n.castShadow = false; });
  g.add(m);
  return m;
}

// --- THE REMAINS OF A HOUSE -------------------------------------------------
// A footprint of wall, a doorway still standing because doorways always are,
// and the things the family did not take with them. `ry` turns the whole house.
//
// The doorway is the point. A ruin without a doorway is a pile; a ruin WITH one
// is a home, because a child knows what a door is for.
function ruinedHome(world, x, z, ry, D, opts = {}) {
  const r = srnd(Math.round(x * 73 + z * 31 + 17));
  const g = new THREE.Group();
  const P = D.propTint || D.floorTint;
  const W = opts.w !== undefined ? opts.w : 6;      // footprint
  const Dp = opts.d !== undefined ? opts.d : 5;
  const hw = W / 2, hd = Dp / 2;

  // --- the walls, broken down to different heights on each run --------------
  // Modular wall pieces are ~2u wide. Dropping some below the floor is how a
  // wall becomes a RUINED wall without a second model: the top is simply gone.
  const runWall = (x0, z0, x1, z1, keep) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2));
    const a = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      if (r() > keep) continue;                     // this stretch has fallen
      const t = (i + 0.5) / n;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const sink = r() < 0.45 ? -(0.3 + r() * 0.8) : 0;   // slumped, not level
      place(world, g, emberKit.wallMod, 'ruinWall', px, sink, pz,
        1.0, a + Math.PI / 2, 0, P);
      if (sink > -0.5) world.addBox(x + px - 0.5, x + px + 0.5, z + pz - 0.5, z + pz + 0.5);
    }
  };
  runWall(-hw, -hd, hw, -hd, opts.keep || 0.72);        // back wall
  runWall(-hw, -hd, -hw, hd, opts.keep || 0.6);         // left
  runWall(hw, -hd, hw, hd, opts.keep || 0.55);          // right
  // the front is open — you can see in, and walk in

  // --- the doorway, still standing ------------------------------------------
  if (opts.door !== false) {
    place(world, g, emberKit.archDoor, 'ruinDoor', 0, 0, hd, 1.0, 0, 0, P);
    world.addBox(x - 1.4, x - 0.7, z + hd - 0.4, z + hd + 0.4);
    world.addBox(x + 0.7, x + 1.4, z + hd - 0.4, z + hd + 0.4);
  }

  // --- what they left ------------------------------------------------------
  coldHearth(world, x + (r() - 0.5) * 1.5, z - hd + 1.2, D, g);
  const spill = 3 + Math.round(r() * 3);
  for (let i = 0; i < spill; i++) {
    const px = (r() - 0.5) * (W - 1.2), pz = (r() - 0.5) * (Dp - 1.6);
    const pick = r();
    const gltf = pick < 0.4 ? emberKit.barrel : pick < 0.75 ? emberKit.crate : emberKit.vase;
    const sc = gltf === emberKit.vase ? 1.6 : 1.0;
    // knocked over: a barrel lying on its side says "left in a hurry" in a way
    // an upright one never does
    const down = r() < 0.5;
    place(world, g, gltf, 'ruinGoods', px, down ? 0.28 : 0, pz,
      sc, r() * 6.28, down ? Math.PI / 2 : 0, P, false);
  }
  // brick spill from the fallen courses — small, so you walk through it
  for (let i = 0; i < 6 + r() * 6; i++) {
    place(world, g, emberKit.brick, 'ruinBrick',
      (r() - 0.5) * (W + 2.5), 0, (r() - 0.5) * (Dp + 2.5),
      0.8 + r() * 0.5, r() * 6.28, 0, P, false);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  world.add(g);
  return g;
}

// A hearth nobody has lit in a long time. The one thing in a burnt village that
// is unmistakably domestic.
function coldHearth(world, x, z, D, parent = null) {
  const g = parent || new THREE.Group();
  const px = parent ? x : 0, pz = parent ? z : 0;
  place(world, g, emberKit.woodfire, 'hearth', px, 0, pz, 1.1, 0, 0, D.propTint || D.wallTint);
  const r = srnd(Math.round(x * 41 + z * 97));
  for (let i = 0; i < 7; i++) {                     // the stone ring around it
    const a = (i / 7) * Math.PI * 2 + r();
    place(world, g, i % 2 ? emberKit.rockSA : emberKit.rockSB, 'hearthRing',
      px + Math.cos(a) * 1.1, 0, pz + Math.sin(a) * 1.1, 0.42 + r() * 0.18, a, 0, D.propTint || D.wallTint, false);
  }
  if (!parent) { g.position.set(0, 0, 0); world.add(g); }
  return g;
}

// A column that came down, plus the drum sections that rolled. Reads as
// COLLAPSE rather than as decoration, because the pieces are scattered along
// the direction it fell.
function fallenColumn(world, x, z, dir, D, len = 4) {
  const g = new THREE.Group();
  const r = srnd(Math.round(x * 13 + z * 57));
  const dx = Math.sin(dir), dz = Math.cos(dir);
  place(world, g, emberKit.column, 'fallCol', 0, 0, 0, 1.0, 0, 0, D.propTint || D.wallTint);
  world.addCircle(x, z, 0.6);
  for (let i = 1; i <= 3; i++) {                    // the drums, lying down
    const t = i * (len / 3);
    place(world, g, emberKit.column2, 'fallCol',
      dx * t + (r() - 0.5) * 0.5, 0.42, dz * t + (r() - 0.5) * 0.5,
      0.9, r() * 6.28, Math.PI / 2, D.propTint || D.wallTint);
    world.addCircle(x + dx * t, z + dz * t, 0.5);
  }
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

// Rubble: bricks, chips and dust. NO colliders — this is the stuff that fills
// the gaps between the things that matter, and a child must be able to run
// straight through it.
function rubbleField(world, x, z, rad, D, n = 14) {
  const g = new THREE.Group();
  const r = srnd(Math.round(x * 29 + z * 83 + n));
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad;
    const pick = r();
    const gltf = pick < 0.55 ? emberKit.brick
               : pick < 0.8 ? emberKit.rockSA : emberKit.rockSB;
    place(world, g, gltf, 'rubble', Math.cos(a) * dd, 0, Math.sin(a) * dd,
      0.6 + r() * 0.6, r() * 6.28, 0, D.propTint || D.wallTint, false);
  }
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

// A wayside shrine: pedestal, arch, a banner that did not burn all the way.
// Somewhere people STOPPED — the strongest signal a space was lived in.
function wayshrine(world, x, z, ry, D) {
  const g = new THREE.Group();
  place(world, g, emberKit.arch, 'shrine', 0, 0, 0, 1.1, 0, 0, D.propTint || D.wallTint);
  place(world, g, emberKit.pedestal, 'shrine', 0, 0, -0.2, 1.0, 0, 0, D.propTint || D.wallTint);
  place(world, g, emberKit.banner, 'shrine', 0, 0, -1.0, 1.0, 0, 0, D.propTint || D.floorTint);
  world.addCircle(x, z, 0.9);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  world.add(g);
  return g;
}

// A cart that did not make it out. Timbers, a wheel-less axle, and whatever
// was being carried spilled around it. This is the clearest single image of
// "people were LEAVING" that the kit can make, and it is small enough to sit
// mid-room without taking the fighting floor away.
function cartWreck(world, x, z, ry, D) {
  const g = new THREE.Group();
  const r = srnd(Math.round(x * 51 + z * 23));
  const P = D.propTint || D.floorTint;
  place(world, g, emberKit.logStack, 'cart', 0, 0, 0, 1.0, 0, 0, P);
  place(world, g, emberKit.logStack, 'cart', 0.9, 0.35, -0.6, 0.8, 0.7, 0.5, P);
  for (let i = 0; i < 4; i++) {
    const gl = r() < 0.5 ? emberKit.barrel : emberKit.crate;
    place(world, g, gl, 'cart', (r() - 0.5) * 3.4, r() < 0.6 ? 0.28 : 0, (r() - 0.5) * 2.8,
      1.0, r() * 6.28, r() < 0.6 ? Math.PI / 2 : 0, P, false);
  }
  world.addCircle(x, z, 1.0);        // the wreck itself blocks; the spill does not
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  world.add(g);
  return g;
}

// A stub of wall left standing chest-high. THIS IS COVER, and it is the one
// piece of the vocabulary placed INSIDE the fighting floor on purpose:
// ROOM-STANDARD §1 asks for open ground where fights happen and §2 asks that
// you navigate around things, and the way both are true at once is a few
// discrete pieces with clear space between them — which is how a Zelda arena
// with pillars in it works.
function lowWall(world, x, z, ry, D, len = 3) {
  const g = new THREE.Group();
  const n = Math.max(1, Math.round(len / 2));
  const r = srnd(Math.round(x * 67 + z * 11));
  const P = D.propTint || D.floorTint;
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * 2;
    place(world, g, emberKit.wallMod, 'lowWall', t, -(0.55 + r() * 0.5), 0, 1.0, Math.PI / 2, 0, P);
  }
  for (let i = 0; i < 5; i++) {
    place(world, g, emberKit.brick, 'lowWall', (r() - 0.5) * (len + 2), 0, (r() - 0.5) * 2.4,
      0.75 + r() * 0.4, r() * 6.28, 0, P, false);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  world.add(g);
  // the collider follows the run, in world space
  const dx = Math.sin(ry) * len / 2, dz = Math.cos(ry) * len / 2;
  const steps = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps * 2 - 1;
    world.addCircle(x + dx * t, z + dz * t, 0.62);
  }
  return g;
}

// The things the fire left behind, scattered where they fell. Skulls and coins
// are SMALL — no colliders, and deliberately sparse: one skull is a story, six
// is a haunted house, and this is a sad place rather than a spooky one.
function aftermath(world, x, z, rad, D, seed = 1) {
  const g = new THREE.Group();
  const r = srnd(Math.round(x * 19 + z * 61 + seed));
  const n = 2 + Math.round(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad;
    const gltf = r() < 0.6 ? emberKit.skull : emberKit.coins;
    place(world, g, gltf, 'aftermath', Math.cos(a) * dd, 0, Math.sin(a) * dd,
      gltf === emberKit.coins ? 1.0 : 0.9, r() * 6.28, 0, D.propTint || D.floorTint, false);
  }
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

// --- ISLAND A — THE ASHFALL (arrival) ---------------------------------------
export async function buildLa(scene) {
  const { world, spec, D } = base(scene, 'la');
  // THE FLOOR TELLS THE STORY FIRST. Scorch where each house burned, ash
  // drifted against the west wall, rubble under the fallen gate — and a worn
  // route from the Den door, past the gate, to the way onward. The path is the
  // honest replacement for the guide-orbs: a track people made with their feet.
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e')], D, {
    patches: [
      { x: -11, z: 7, r: 4.5, kind: 'scorch' },
      { x: -9, z: -10, r: 4.2, kind: 'scorch' },
      { x: 12, z: -7, r: 3.8, kind: 'scorch' },
      { x: -14, z: 1, r: 5.5, kind: 'ash' },
      { x: 6, z: 10, r: 4.5, kind: 'ash' },
      { x: 0, z: -6, r: 4.5, kind: 'rubble' },
      { x: 11, z: 4, r: 3.0, kind: 'gravel' },
    ],
    paths: [
      [[0, 13], [0, 6], [-1.5, -1], [0, -7], [0, -13]],   // Den → gate → onward
      [[1, 0.5], [8, 1.5], [16, 0]],                       // the spur to the warrens
    ],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg1', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'la1', { x: -7, z: 0, angle: Math.PI / 2 });

  heroProp(world, 0, -6, 'gate', D.tint, D);               // ▲ THE FALLEN GATE
  world.markers.heroSpot = { x: 0, z: -6 };

  // --- THE SETTLEMENT -------------------------------------------------------
  // Ember Hollow is RUINED AND SAD (design/ROOM-STANDARD.md §7): somewhere
  // people LIVED before it burned. Three homes, a wayside shrine and the two
  // columns that came down when the roof went. This is the first room of the
  // game and it now says all of that before Pip opens his mouth.
  //
  // Everything sits OUTSIDE the box x -8..8, z -4..6 — that is the fighting
  // floor, where the two Shades come at you, and ROOM-STANDARD §1 is explicit
  // that open ground is kept where fights happen. Dense at the edges, clear in
  // the middle, which is how a Zelda screen is actually built.
  ruinedHome(world, -11.5, 7, 0.28, D, { w: 6, d: 5 });
  ruinedHome(world, -9.5, -10, -0.5, D, { w: 6.5, d: 4.5, keep: 0.5 });
  ruinedHome(world, 12, -7.5, 0.9, D, { w: 5.5, d: 5, keep: 0.62 });
  wayshrine(world, 11.5, 5, Math.PI - 0.3, D);
  fallenColumn(world, 6.5, -10.5, 0.7, D);
  fallenColumn(world, -4.5, -11.5, -0.9, D, 3.4);

  // the gaps between the things that matter — no colliders, run straight through
  rubbleField(world, -14.5, 2.5, 3.0, D, 16);
  rubbleField(world, 13.5, 10, 3.2, D, 14);
  rubbleField(world, -5, -12, 2.6, D, 12);
  rubbleField(world, 8.5, -2.5, 2.4, D, 10);
  rubbleField(world, 2.5, 11.5, 2.6, D, 10);

  // --- WHAT YOU SEE THE MOMENT YOU ARRIVE -----------------------------------
  // Kael spawns at (0, 9) facing north, and the camera shows roughly z 13.5
  // down to -4. The first dressed pass put every cluster on the perimeter and
  // that band came out EMPTY — dad's exact complaint, reproduced faithfully in
  // the one frame that matters most. These sit in it: a cart that did not get
  // out, and the stumps of the trees that lined the road.
  cartWreck(world, -4.5, 6.5, 0.5, D);
  cartWreck(world, 6, 9.5, -0.8, D);
  for (const [sx, sz, ss] of [[5.5, 6.5, 1.0], [8, 3.5, 0.8], [-7.5, 10.5, 0.9], [3, 12, 0.75]]) {
    const st = tinted(emberKit.stump, 'deadStump', D.propTint);
    st.position.set(sx, 0, sz); st.scale.setScalar(ss);
    st.rotation.y = sx * 1.7;
    world.add(st); world.addCircle(sx, sz, 0.55 * ss);
  }

  // COVER TO FIGHT AROUND. Two stubs, well apart, inside the fighting floor —
  // the Shades come at (-6, 2) and (6, -1) and now there is something to break
  // line of sight on instead of a bare plate.
  lowWall(world, -3, 1.5, 0.35, D, 3.4);
  lowWall(world, 5.5, -1.5, -1.15, D, 3.0);
  aftermath(world, -11.5, 5.5, 2.2, D, 1);
  aftermath(world, 12, -6, 2.0, D, 2);

  // --- THINGS TO DO (ROOM-STANDARD §4) --------------------------------------
  // 1. BREAK THINGS OPEN. Pots and crates at each house, where a family's
  //    belongings would actually be. main.js spawns these from the marker.
  world.markers.breakables = [
    { x: -9.5, z: 5.5, kind: 'barrel' }, { x: -13, z: 8.5, kind: 'crate' },
    { x: -12.5, z: 4.5, kind: 'vase' },
    { x: -7.5, z: -8.5, kind: 'barrel' }, { x: -11, z: -12, kind: 'vase' },
    { x: 10, z: -5.5, kind: 'crate' },  { x: 13.5, z: -9.5, kind: 'barrel' },
    { x: 9.5, z: 6.5, kind: 'vase' },
  ];
  // 2. AN ALCOVE FOUND BY EXPLORING OFF-PATH. Behind the east house, screened
  //    from the worn route, a nook you only see if you go and look.
  wallRun(world, 14.5, -11.5, 14.5, -3.5, D);
  visibleReward(world, 15.2, -7.5, 'l1_ash_nook', { shards: 12 });

  world.markers.shadeSpots = [{ x: -6, z: 2 }, { x: 6, z: -1 }];
  scatter(world, halfW, halfD, D, 11, 7);   // the clusters do the filling now
  // FORESHADOWED GATE — Level 2's tool, seeded a whole level early.
  // The two wall runs are the point: without them the "gate" sat alone in the
  // middle of a 32u island and a child simply walked round it to the chest,
  // so the promise resolved itself and the mystery never closed. A promise
  // gate has to be the ONLY way in or it is decoration.
  wallRun(world, -16, -6, -11, -6, D);
  wallRun(world, -16, -2, -11, -2, D);
  promiseGate(world, -11, -4, 3, 4, 0x9a8c6a, 'CRACKED — later', 'crack',
              { system: 'crack', id: 'l1_crack_gate' });
  visibleReward(world, -13.5, -4, 'l1_crack_promise', { shards: 18 });
  world.markers.crackPromise = { x: -11, z: -4 };
  return finish(world, spec, D);
}
export async function buildLa1(scene) {
  const { world, spec, D } = base(scene, 'la1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'la', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  // shaped, not a box: a switchback so the pocket is a small maze
  wallRun(world, -4, -3, 6, -3, D);
  wallRun(world, -6, 2, 4, 2, D);
  world.markers.shadeSpots = [{ x: 5, z: -5 }];
  world.markers.pocketChest = { x: 7, z: 5 };
  scatter(world, halfW, halfD, D, 12, 10);
  visibleReward(world, 7, 5, 'l1_warrens', { shards: 16 });
  return finish(world, spec, D);
}

// --- CHOKE 1 — THE FALLEN GATE (rest) ---------------------------------------
export async function buildLg1(scene) {
  const { world, spec, D } = base(scene, 'lg1');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'la', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lb', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  return finish(world, spec, D);
}

// --- ISLAND B — EMBER CAUSEWAY ----------------------------------------------
export async function buildLb(scene) {
  const { world, spec, D } = base(scene, 'lb');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e'), gap('w')], D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg1', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg2', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'lb1', { x: -7, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'lb2', { x: 7, z: 0, angle: -Math.PI / 2 });

  heroProp(world, 10, -9, 'cone', D.tint, D);              // ▲ THE KILN, seen from here on
  world.markers.heroSpot = { x: 10, z: -9 };
  // shaped, not a box — an L of rock splits the island into two reads
  wallRun(world, -14, -2, -4, -2, D);
  wallRun(world, -4, -2, -4, 6, D);
  world.markers.mothSpots = [{ x: -8, z: 4 }, { x: 4, z: 2 }];
  world.markers.geyserSpots = [{ x: 2, z: -5 }, { x: 6, z: -5 }, { x: 10, z: -5 }];
  scatter(world, halfW, halfD, D, 21, 16);
  return finish(world, spec, D);
}

export async function buildLb1(scene) {
  const { world, spec, D } = base(scene, 'lb1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'lb', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  wallRun(world, 1, -6, 1, 1, D);
  world.markers.pup1Spot = { x: 6, z: -4 };
  world.markers.mothSpots = [{ x: 4, z: 3 }];
  scatter(world, halfW, halfD, D, 22, 10);
  return finish(world, spec, D);
}

export async function buildLb2(scene) {
  const { world, spec, D } = base(scene, 'lb2');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D);
  world.spawn = { x: 7, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'lb', { x: -13.5, z: 0, angle: Math.PI / 2 });   // LOOPS BACK
  // THE FIRE GATE — foreshadowed long before the Fire Wolf exists.
  // Charred, orange, reward plainly visible behind it: reads "later", not "never".
  wallRun(world, -10, -4, 1, -4, D);
  wallRun(world, -10, 4, 1, 4, D);
  promiseGate(world, 1, 0, 2, 8, 0xc0682d, 'SCORCHED — needs fire', 'fire',
              { system: 'burn', id: 'l1_scorched_gate' });
  visibleReward(world, -4, 0, 'l1_scorched', { shards: 20 });
  world.markers.firePromise = { x: 1, z: 0 };
  // the pup moved OUT of the scorched alcove — walling the alcove properly
  // would otherwise have locked a collectible behind a form two levels away
  world.markers.pup3Spot = { x: -6, z: -6 };
  scatter(world, halfW, halfD, D, 23, 10);
  return finish(world, spec, D);
}

// --- CHOKE 2 — THE NARROWS --------------------------------------------------
export async function buildLg2(scene) {
  const { world, spec, D } = base(scene, 'lg2');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lb', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lc', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  return finish(world, spec, D);
}

// --- ISLAND C — CINDER BRIDGES ----------------------------------------------
export async function buildLc(scene) {
  const { world, spec, D } = base(scene, 'lc');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e')], D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg2', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg3', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'lc1', { x: -7, z: 0, angle: Math.PI / 2 });

  heroProp(world, -9, -7, 'span', D.tint, D);            // ▲ THE BROKEN SPAN
  world.markers.heroSpot = { x: -9, z: -7 };
  // the lava channel: two walkable slab routes with a gap of hazard between
  world.addLava(-16, 16, -3, 1);
  world.addSafe(-7, -3, -3, 1); world.addSafe(3, 7, -3, 1);
  protoDecal(world, 0, -1, 32, 4, 0xff5a2b, 0.5);
  protoDecal(world, -5, -1, 4, 4, 0x8a8a8a, 0.9);
  protoDecal(world, 5, -1, 4, 4, 0x8a8a8a, 0.9);
  lavaSurface(world, 0, -1, 32, 4);
  slab(world, -5, -1, 4, 4, D); slab(world, 5, -1, 4, 4, D);
  world.markers.houndSpot = { x: 8, z: -8, variant: 'elder' };
  scatter(world, halfW, halfD, D, 31, 14);
  return finish(world, spec, D);
}

export async function buildLc1(scene) {
  const { world, spec, D } = base(scene, 'lc1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'lc', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  wallRun(world, -2, -5, 6, -5, D);
  world.markers.pocketChest = { x: 6, z: -2 };
  visibleReward(world, 6, -2, 'l1_drowned_forge', { shards: 22, heartPiece: 1 });
  world.markers.shadeSpots = [{ x: 2, z: 4 }];
  scatter(world, halfW, halfD, D, 32, 10);
  return finish(world, spec, D);
}

// --- CHOKE 3 — THE EMBER SEAL -----------------------------------------------
export async function buildLg3(scene) {
  const { world, spec, D } = base(scene, 'lg3');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lc', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'ld', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.sealSpot = { x: 0, z: -2 };
  return finish(world, spec, D);
}

// --- ISLAND D — THE KILN (the ability: introduce + develop) ------------------
export async function buildLd(scene) {
  const { world, spec, D } = base(scene, 'ld');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e')], D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg3', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg4', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'ld1', { x: -7, z: 0, angle: Math.PI / 2 });

  heroProp(world, 0, -8, 'bowl', D.tint, D);               // ▲ THE FORGE HEART
  world.markers.heroSpot = { x: 0, z: -8 };
  // TEACH 1 — INTRODUCE: one brazier, in a safe alcove, no enemies, no timer.
  world.markers.shrineSpot = { x: 0, z: -3 };
  world.markers.teachBrazier = { x: 0, z: -3 };
  // TEACH 2 — DEVELOP: the Gutter Run. Three braziers in a channel, on a clock.
  wallRun(world, 6, 2, 6, 10, D);
  wallRun(world, 13, 2, 13, 10, D);
  world.markers.gutterSpots = [{ x: 9.5, z: 8 }, { x: 9.5, z: 5 }, { x: 9.5, z: 2 }];
  teachBraziers(world, [world.markers.teachBrazier], 'ld_teach');
  teachBraziers(world, world.markers.gutterSpots, 'ld_gutter');
  scatter(world, halfW, halfD, D, 41, 14);
  return finish(world, spec, D);
}

// --- THE ORDER HALL — the one puzzle room, the TWIST -------------------------
export async function buildLd1(scene) {
  const { world, spec, D } = base(scene, 'ld1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'ld', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  // TEACH 3 — TWIST: four braziers, lit in the order their pilot-flames
  // flicker — but the hall is DARK, so the order is only readable as the Dark
  // Wolf. The new tool needs the old tool. Nothing new is taught after this.
  protoDarkZone(world, -halfW, halfW, -halfD, halfD);
  world.markers.orderSpots = [
    { x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }, { x: -5, z: 4 },
  ];
  world.markers.orderSpot = { x: 0, z: 0 };
  teachBraziers(world, world.markers.orderSpots, 'ld1_order');
  return finish(world, spec, D);
}

// --- CHOKE 4 — THE BOSS DOOR (rest: flame + potion, contract law) ------------
export async function buildLg4(scene) {
  const { world, spec, D } = base(scene, 'lg4');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ld', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'le', { x: 0, z: 9.5, angle: Math.PI });
  world.markers.restSpot = { x: -2, z: 0 };
  world.markers.potionSpot = { x: 2, z: 0 };
  world.markers.bossDoorSpot = { x: 0, z: -3 };
  return finish(world, spec, D);
}

// --- ISLAND E — HEART OF THE HOLLOW (boss; TEACH 4 — conclude) ---------------
export async function buildLe(scene) {
  const { world, spec, D } = base(scene, 'le');
  const onward = !!state.flags.bossDefeated;
  const gaps = [gap('s'), ...(onward ? [gap('w'), gap('n')] : [])];
  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 9.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg4', { x: 0, z: -3.2, angle: 0 });
  // THE LOOP-BACK: a one-way walked door home, opened by the boss (rule 4).
  if (onward) sideDoor(world, 'w', halfW, halfD, 'la', { x: 0, z: 10, angle: Math.PI });
  // ...and ONWARD to Stoneroot. Level 1 is now the game's first level rather
  // than a demo reachable only from the cheat menu (fix plan A1), so beating
  // the Shadowgrip has to actually lead somewhere.
  if (onward) sideDoor(world, 'n', halfW, halfD, 'vh', { x: 0, z: 10, angle: Math.PI });

  heroProp(world, 0, -2, 'cage', D.tint, D);               // ▲ CINDER'S CAGE
  world.markers.heroSpot = { x: 0, z: -2 };
  if (!onward) world.markers.bossSpot = { x: 0, z: -2, skin: 'shadowgrip' };
  // TEACH 4 — CONCLUDE: four cage-braziers, slammed alight in the collapse
  // windows. The final use of the gift is what frees the spirit.
  scatter(world, halfW, halfD, D, 51, 12);
  world.markers.cageBraziers = [
    { x: -4, z: -6 }, { x: 4, z: -6 }, { x: -4, z: 2 }, { x: 4, z: 2 },
  ];
  teachBraziers(world, world.markers.cageBraziers, 'le_cage');
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE METRICS ZOO — every module, gap and doorway at TRUE SCALE, walkable.
// Reached from the cheat menu. Walk it before trusting design/METRICS.md.
// ---------------------------------------------------------------------------
export async function buildZoo(scene) {
  forceGrey = true;                 // the zoo is a ruler; a ruler is not dressed
  try {
    return buildZooInner(scene);
  } finally { forceGrey = false; }
}

function buildZooInner(scene) {
  const world = new World(scene);
  world.bgColor = 0x14161c;
  world.deckY = 0;
  protoFloor(world, 60, 44, 0x9aa0a8);
  const H = 1.6;
  protoWall(world, -30, -22, 30, -22, { height: H, tint: 0x6a7078 });
  protoWall(world, -30, 22, 30, 22, { height: H, tint: 0x6a7078 });
  protoWall(world, -30, -22, -30, 22, { height: H, tint: 0x6a7078 });
  protoWall(world, 30, -22, 30, 22, { height: H, tint: 0x6a7078 });
  world.spawn = { x: 0, z: 16, angle: Math.PI };

  const say = (x, z, t, c) => protoLabel(world, x, z, t, { color: c || '#ffd9c2', y: 2.5, size: 1.5 });

  // 1 — one grid tile, and the body that has to fit through everything
  protoDecal(world, -24, 14, 1, 1, 0xffd54a, 0.9);
  say(-24, 12.4, '1 x 1u grid tile');
  protoDecal(world, -20, 14, 0.64, 0.64, 0x6fe3a0, 0.9);
  say(-20, 12.4, 'Kael 0.64u body');

  // 2 — the doorway family, side by side at true width
  const doorPair = (x, w, label) => {
    protoWall(world, x - 4, 6, x - w / 2, 6, { height: H, tint: 0x7a828a });
    protoWall(world, x + w / 2, 6, x + 4, 6, { height: H, tint: 0x7a828a });
    say(x, 8.4, label, '#cfe8d0');
  };
  doorPair(-18, 2.4, 'DOOR 2.4u');
  doorPair(-8, 3.0, 'CHOKE 3.0u');
  doorPair(2, 2.0, 'MIN CORRIDOR 2.0u');
  doorPair(12, 0.64, 'ABSOLUTE MIN 0.64u');
  say(12, 4.2, '(fits, but a child cannot steer it)', '#ff9d9d');

  // 3 — the island footprint, with the camera's actual view drawn inside it,
  //     and Level 2's ONE new module drawn around it so the difference between
  //     "an island" and "a hub" is a thing you stand in, not a number
  zooHubModule(world, protoDecal, say);
  zooRingModule(world, protoDecal, say);
  protoDecal(world, 0, -8, 32, 26, 0xffffff, 0.10);
  say(0, -21.5, 'ISLAND FOOTPRINT 32 x 26u');
  protoDecal(world, 0, -8, 16.1, 17.4, 0x6fe3a0, 0.16);
  say(0, -0.6, 'what the camera actually shows: 16.1u wide', '#6fe3a0');

  // 4 — the blind strip, at the size it really is
  protoDecal(world, 0, 20.4, 60, 2.5, 0xff3a3a, 0.20);
  say(0, 19.6, 'BLIND STRIP 2.5u — no interactives here', '#ff9d9d');

  // 5 — deck heights: a decal at deck 0 vs one at 0.185 (the stone tile deck)
  const deckDemo = new THREE.Mesh(new THREE.BoxGeometry(4, 0.185, 4), protoMaterial(0x8a8a8a, 4, 4));
  deckDemo.position.set(22, 0.0925, 14);
  world.add(deckDemo);
  protoDecal(world, 22, 14, 2, 2, 0xffd54a, 0.9);       // sits ON the raised deck
  say(22, 11.6, 'deck 0.185 + decal above it');

  // 6 — the hero props, at true scale, judged from directly above
  heroProp(world, -20, -14, 'gate', 0x8d8b86);
  heroProp(world, -6, -14, 'cone', 0xb5702f);
  heroProp(world, 8, -14, 'span', 0x9c3a2a);
  heroProp(world, 20, -14, 'bowl', 0xc99a3a);
  say(0, -19.5, 'HERO PROPS — do these read from above?', '#ffd54a');

  protoLabel(world, 0, 17, 'METRICS ZOO — design/METRICS.md', { color: '#ffd9c2', y: 3.6, size: 2.2 });
  return world;
}

export const LEVEL1_ROOMS = {
  la: buildLa, la1: buildLa1, lg1: buildLg1,
  lb: buildLb, lb1: buildLb1, lb2: buildLb2, lg2: buildLg2,
  lc: buildLc, lc1: buildLc1, lg3: buildLg3,
  ld: buildLd, ld1: buildLd1, lg4: buildLg4,
  le: buildLe,
  zoo: buildZoo,
};
