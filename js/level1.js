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
import { makeBuilders, tintedModel, gap, DOOR_HALF, spiritShrine, bossGate,
  reserveLandings } from './levelkit.js';
import { zooHubModule } from './level2.js';
import { zooRingModule } from './level3.js';
import { flattenStatic } from './batch.js';
import { brazier, pushableBoulder, plateSwitch, plateBars } from './gates.js';
import { makeDressers } from './dressing.js';
import { registerDistrictTints } from './districts.js';
import { thresholdGlow } from './levelkit.js';
import { spawnShards } from './loot.js';
import { carryItem, socket } from './carry.js';

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
  ashfall:  { tint: 0x8d8b86, floorTint: 0x8b8580, wallTint: 0x3b3835, propTint: 0x8a7a6c, ground: 'ashfall',
              name: 'THE ASHFALL',         hero: 'THE FALLEN GATE' },
  causeway: { tint: 0xb5702f, floorTint: 0xa2632f, wallTint: 0x40241a, propTint: 0x8f6440, ground: 'causeway',
              name: 'EMBER CAUSEWAY',      hero: 'THE KILN' },
  bridges:  { tint: 0x9c3a2a, floorTint: 0x8a4436, wallTint: 0x33191a, propTint: 0x7d4a3a, ground: 'bridges',
              name: 'CINDER BRIDGES',      hero: 'THE BROKEN SPAN' },
  kiln:     { tint: 0xc99a3a, floorTint: 0xb98d3c, wallTint: 0x453317, propTint: 0x9c7a44, ground: 'kiln',
              name: 'THE KILN',            hero: 'THE FORGE HEART' },
  heart:    { tint: 0x6a5a8a, floorTint: 0x5d5078, wallTint: 0x241d33, propTint: 0x5f5470, ground: 'heart',
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

// Each room's district colour, so a DOORWAY can show what is beyond it
// (js/districts.js). Registered here because this is the only place that
// knows both the room table and the palette.
registerDistrictTints(L1, DISTRICTS);

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

// THE SPIRE BORROWS THIS KIT. js/levelSpire.js is built from the same
// Quaternius dungeon set, re-tinted cold — a tower is made of the same masonry
// a ruin is — so rather than loading a second copy of twenty-five files it
// reads whatever loadEmberKit() left here. An accessor rather than the binding
// itself because `emberKit` is reassigned on load and an imported binding
// would be a live view of a module-private let: correct, but far less obvious
// than a function that says what it does. Answers null before the kit loads,
// which is every caller's "wear the checkers" signal.
export function emberKitRef() { return emberKit; }
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
// The cluster vocabulary (js/dressing.js), bound to this level's kit. Level 2
// and Level 3 bind the same builders to theirs — a ruined home is a ruined home
// whether the walls are Ember's masonry or Stoneroot's cut rock.
// `tint` is wrapped rather than passed directly: `tinted` is declared further
// down this file and a direct reference here reads it in the temporal dead zone.
const { ruinedHome, coldHearth, fallenColumn, rubbleField, wayshrine, aftermath,
  cartWreck, lowWall } = makeDressers({ kit: () => emberKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward,
  darkZone: protoDarkZone } = makeBuilders({
    kit: () => emberKit,
    isGrey: () => GREY(),
  });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

// A DODO. Just a dodo. No mechanic, no reward, nothing required — a secret
// for its own sake ("more secrets and easter eggs... the things that make
// kids remember a game as something special"). assets/chars/monsters/
// dodo.glb was vendored for a combat-enemy pass that never shipped (it
// carries zero animation clips — measured with probe-modelsize.mjs, which
// is exactly why it belongs here instead: it only ever needed to stand
// still and be funny in a volcano ruin that has no business having one.
let _dodoGltf = null;
async function dodoSecret(world, x, z) {
  if (GREY()) return;
  if (!_dodoGltf) _dodoGltf = await loadGLB('./assets/chars/monsters/dodo.glb');
  const model = prepareModel(_dodoGltf.scene.clone());
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.add(model);
  world.add(root);
  world.addCircle(x, z, 0.4, 'decor');
  const seed = x * 3 + z;
  world.onAnimate((t) => {
    root.rotation.y = 0.4 + Math.sin(t * 0.5 + seed) * 0.5;
    model.position.y = 0.02 + Math.max(0, Math.sin(t * 1.6 + seed)) * 0.05; // a little hop, not a bob
  });
  world.markers.dodoSpot = { x, z };
}

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
// THE SAFE CROSSINGS OVER THE LAVA. Dad, on seeing them: "the bridges are
// awful."  He was right, and the numbers say why.
//
// bridge-stone.glb is a 1.04 x 0.40 x 1.04 SQUARE TILE. This laid pieces 2.0
// apart at 1.1 scale — so each was 1.14 wide with a 0.86-unit HOLE beside it —
// two of them, in one row, for a slab four units deep. It read as a couple of
// pallets dropped in the fire, not a way across. And it was tinted `wallTint`,
// the darkest colour the district owns, so the one surface that means SAFE was
// the blackest thing on screen next to the lava.
//
// Now it TILES: the crossing is covered edge to edge with a slight overlap so
// there are no seams, laid flat rather than as 0.4-tall blocks the player would
// visibly walk into, and in pale stone. A child should be able to tell at a
// glance which strip does not burn.
function slab(world, x, z, w, d, D) {
  if (GREY()) return;
  const TILE = 1.04;
  const nx = Math.max(1, Math.round(w / TILE));
  const nz = Math.max(1, Math.round(d / TILE));
  const stepX = w / nx, stepZ = d / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const p = tinted(emberKit.bridge, 'slab', 0xcfc0ad);   // pale stone: this is the safe way
      p.position.set(x - w / 2 + (i + 0.5) * stepX, world.deckY + 0.02,
        z - d / 2 + (j + 0.5) * stepZ);
      // 1.04 wide models a 1.0 step, and 0.3 in y turns a block into a deck
      p.scale.set((stepX / TILE) * 1.04, 0.3, (stepZ / TILE) * 1.04);
      world.add(p);
    }
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
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
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
  // LAST LINE OF DEFENCE. A builder that dressed before it set its markers
  // could not have consulted them, so anything still standing on a gameplay
  // square loses its collider here and says so on the console. See
  // World.sweepKeepClear.
  world.sweepKeepClear();
  thresholdGlow(world);   // the next room's colour, spilled at each doorway
  flattenStatic(world);
  return world;
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
  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: 7.4, angle: Math.PI });
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
  world.markers.breakables = [
    { x: -9.5, z: 5.5, kind: 'cask' }, { x: -13, z: 8.5, kind: 'crate' },
    { x: -12.5, z: 4.5, kind: 'jar' },
    { x: -7.5, z: -8.5, kind: 'barrel' }, { x: -11, z: -12, kind: 'jar' },
    { x: 10, z: -5.5, kind: 'crate' },  { x: 13.5, z: -9.5, kind: 'cask' },
    { x: 9.5, z: 6.5, kind: 'vase' },
  ];
  world.markers.shadeSpots = [{ x: -6, z: 2 }];
  world.markers.emberWretchSpots = [{ x: 6, z: -1 }];
  // the ranged lesson, from the very first room: open ground is never free
  world.markers.spitterSpots = [{ x: 3.4, z: -0.5 }];
  world.markers.crackPromise = { x: -11, z: -4 };
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
  // 2. AN ALCOVE FOUND BY EXPLORING OFF-PATH. Behind the east house, screened
  //    from the worn route, a nook you only see if you go and look.
  wallRun(world, 14.5, -11.5, 14.5, -3.5, D);
  visibleReward(world, 15.2, -7.5, 'l1_ash_nook', { shards: 12 });

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
  return finish(world, spec, D);
}
export async function buildLa1(scene) {
  const { world, spec, D } = base(scene, 'la1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: 6, z: 5, r: 3.4, kind: 'scorch' }, { x: -6, z: -5, r: 3.6, kind: 'ash' },
              { x: 0, z: 0, r: 3.0, kind: 'rubble' }],
    paths: [[[-10, 0], [-2, -0.5], [2, 4], [7, 5]]],
  });
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'la', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  // shaped, not a box: a switchback so the pocket is a small maze
  wallRun(world, -4, -3, 6, -3, D);
  wallRun(world, -6, 2, 4, 2, D);
  // the warrens are where the village kept its stores — the switchback is
  // lined with what was in them, and the chest at the end is the last of it
  world.markers.breakables = [
    { x: -2, z: 5.5, kind: 'crate' }, { x: 3.5, z: 5.5, kind: 'cask' },
    { x: 1, z: -5, kind: 'vase' }, { x: -8, z: 1.5, kind: 'box' },
  ];
  world.markers.cinderImpSpots = [{ x: 5, z: -5 }];
  world.markers.pocketChest = { x: 7, z: 5 };
  cartWreck(world, -7, 4.5, 1.1, D);
  rubbleField(world, 2, -5.5, 3.0, D, 14);
  rubbleField(world, -3, 5.5, 2.6, D, 12);
  aftermath(world, 5.5, -5.5, 2.0, D, 3);
  coldHearth(world, -7.5, -5.5, D);
  scatter(world, halfW, halfD, D, 12, 5);
  // A PRIZE, NOT JUST COINS. Dad: gear "that you can find and equip". Ember's
  // warrens hold the axe — the first weapon that is a different SHAPE of swing.
  visibleReward(world, 7, 5, 'l1_warrens', { shards: 16, gear: 'axe_b' });
  await dodoSecret(world, 0, -7);
  return finish(world, spec, D);
}

// --- CHOKE 1 — THE FALLEN GATE (rest) ---------------------------------------
export async function buildLg1(scene) {
  const { world, spec, D } = base(scene, 'lg1');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 2.4, kind: 'scorch' }, { x: -5, z: 3, r: 2.6, kind: 'ash' }],
    pathWidth: 2.4,
  });
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  const lg1Solved = () => !!state.flags.plates.l1_lg1_ki;
  sideDoor(world, 's', halfW, halfD, 'la', { x: 0, z: -10, angle: 0 });
  // THE WAY ON IS THE PRIZE. A plate that pays only in coins is a switch with
  // a payout, not a puzzle — dad, on the first cut of these rooms: "there's no
  // opening the way to continue through the level or anything. no push this
  // rock on the plate for no reason at all." So the north door is barred until
  // the block is on the plate, and the bars are the first thing you see from
  // the doorway you came in by. Never the SOUTH door: the way back is always
  // open, so a child who cannot solve it can still leave, and the room rebuilds
  // its boulder on re-entry (L2's reset, for free).
  sideDoor(world, 'n', halfW, halfD, 'lb', { x: 0, z: 10, angle: Math.PI },
    { when: lg1Solved });
  // A CHOKE IS A REST, AND A REST NEEDS SOMEWHERE TO SIT. The four chokes
  // shipped as completely empty 14x10 boxes — nothing but two doors. They are
  // the smallest rooms in the level, which makes them the cheapest to fill and
  // the most obviously bare when they are not. A hearth someone banked up, the
  // shrine they passed on the way, and the gateposts of the old road.
  world.markers.breakables = [{ x: 3.4, z: 0.8, kind: 'cask' }, { x: -2.2, z: -3.2, kind: 'vase' }];
  world.markers.restSpot = { x: 0, z: 0 };
  // THE KI: one block, one plate, no enemies — the region's first taught
  // mechanic (playbook ki beat; assets/dungeons.json's ember_hollow graph,
  // node lg1). It cannot be failed: one clean push is the whole puzzle, and
  // it pays out twice over — the vault in the south-east wall opens AND the
  // road north opens, both on the same clang.
  //
  // PLACED BEFORE THE DRESSING, and this ordering is the whole trick. Every
  // dressing helper consults world.blocked(), and reserve() is what answers
  // it — so a lane reserved up here is a lane the columns, walls and scatter
  // all politely decline to stand in. Reserved afterwards (as the first cut
  // of these rooms did) it reserves nothing: the props are already down, and
  // a boulder that clips one tracks off its lane forever and skims past the
  // plate. That is the Knot's lesson (level3.js) paid for a second time.
  const lg1Lane = [];
  for (let z = 1; z <= 3.5; z += 1.2) lg1Lane.push([-5, z]);
  for (const [rx, rz] of lg1Lane) world.reserve(rx, rz, 1.1, 'lg1KiLane');
  world.reserve(4.5, 4.0, 1.8, 'lg1Vault');       // the vault and its mouth
  world.reserve(0, -4.2, 1.8, 'lg1DoorBars');

  pushableBoulder(world, prepareModel, emberKit.rockSA, -5, 1);
  // THE VAULT: a nook cut into the south-east wall, bars across its mouth, a
  // chest lit up behind them. Visible from the moment you walk in, which is
  // the point — the child sees the prize first and works out the question
  // second (the Lolo contract, playbook §18.1).
  wallRun(world, 3.2, 2.6, 3.2, 5, D);
  wallRun(world, 5.8, 2.6, 5.8, 5, D);
  visibleReward(world, 4.5, 4.0, 'l1_lg1_vault', { shards: 16, gear: 'shield_a' });
  const lg1VaultBars = plateBars(world, prepareModel, emberKit.bars, 'l1_lg1_ki', 4.5, 2.6,
    { span: 2.6 });
  const lg1DoorBars = plateBars(world, prepareModel, emberKit.bars, 'l1_lg1_ki', 0, -4.2,
    { span: 2.6 });
  plateSwitch(world, 'l1_lg1_ki', -5, 3.5, () => {
    lg1VaultBars.open();
    lg1DoorBars.open(true);      // one clang between them, not two
  });

  coldHearth(world, 0, 0.6, D);
  wayshrine(world, -4.6, -2.2, 0.5, D);
  fallenColumn(world, 4.4, -2.6, -0.4, D, 2.6);
  rubbleField(world, 4.8, 2.8, 2.2, D, 10);
  rubbleField(world, -4.8, 2.6, 2.0, D, 9);
  aftermath(world, -3, 1.5, 1.6, D, 4);
  return finish(world, spec, D);
}

// --- ISLAND B — EMBER CAUSEWAY ----------------------------------------------
export async function buildLb(scene) {
  const { world, spec, D } = base(scene, 'lb');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e'), gap('w')], D, {
    patches: [{ x: 10, z: -9, r: 6, kind: 'scorch' }, { x: -11, z: 6, r: 4.5, kind: 'scorch' },
              { x: -13, z: -7, r: 4.2, kind: 'rubble' }, { x: 6, z: -5, r: 4, kind: 'ash' },
              { x: 12, z: 7, r: 3.6, kind: 'gravel' }, { x: -4, z: 10, r: 3.4, kind: 'ash' }],
    paths: [[[0, 13], [0, 7], [-2, 2], [0, -4], [0, -13]], [[-1, 0], [-9, 0.5], [-16, 0]],
            [[1, 0], [9, 1], [16, 0]]],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  const lbSolved = () => !!state.flags.plates.l1_lb_sho_p1 && !!state.flags.plates.l1_lb_sho_p2;
  sideDoor(world, 's', halfW, halfD, 'lg1', { x: 0, z: -3.2, angle: 0 });
  // Barred until BOTH plates are down — the Causeway is the gate on the road
  // to the Kiln. The three other doors (back to lg1, out to the pup pocket and
  // the scorched cubby) stay open the whole time, so the room is a place to
  // wander and think in, never a cell.
  sideDoor(world, 'n', halfW, halfD, 'lg2', { x: 0, z: 3.2, angle: Math.PI },
    { when: lbSolved });
  sideDoor(world, 'e', halfW, halfD, 'lb1', { x: -7, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'lb2', { x: 7, z: 0, angle: -Math.PI / 2 });

  heroProp(world, 10, -9, 'cone', D.tint, D);              // ▲ THE KILN, seen from here on
  world.markers.heroSpot = { x: 10, z: -9 };
  // shaped, not a box — an L of rock splits the island into two reads
  wallRun(world, -14, -2, -4, -2, D);
  wallRun(world, -4, -2, -4, 6, D);
  // THE CAUSEWAY IS THE ROAD IN. This is the edge of the settlement proper —
  // where the road widens, the stalls stood, and the gateposts still do. It is
  // busier than the Ashfall on purpose: you are walking INTO somewhere.
  // FOUR, NOT SIX — the d1b lesson (levelkit.js potSpots: "six put the Vale's
  // d1b at 126 against a ceiling of 125"). lb shipped with six hand-listed
  // pots anyway, and once the sho furniture went in (boulders, bars, plates,
  // the silver chest — all unbatchable) the room measured 134 against 125.
  // A breakable has to come apart on its own, so each one is its own draw;
  // the two cut here were the far-corner box beside another barrel and the
  // east jar the vault crowd already busies.
  // TWO, in the room that measures heaviest in the game: the density suite's
  // ceiling is STRICT (< 125 calls) and lb sat at exactly 126 with four pots.
  // A breakable can never batch — it has to come apart on its own — so each
  // one is a whole draw call, and the two barrels were the cut that costs the
  // least: the vase and the box keep W9's smash-coverage, and the room around
  // them is the densest-dressed island in Ember anyway.
  world.markers.breakables = [
    { x: -10.5, z: -6, kind: 'vase' }, { x: 6, z: 7, kind: 'box' },
  ];
  world.markers.mothSpots = [{ x: -8, z: 4 }];
  world.markers.emberDragonlingSpots = [{ x: 4, z: 2 }];
  // NO SPITTER — a design call and a budget call that agree. The room gained
  // a two-block push puzzle, and a ranged harasser sniping a child mid-push
  // is frustration, not challenge; three signatures (moth, dragonling,
  // marauder) match la's density. It was also ~6 draw calls in the room that
  // measures worst in the game (134 at peak against the 125 mobile ceiling).
  world.markers.moltenMarauderSpots = [{ x: 5, z: 3.6 }];
  world.markers.geyserSpots = [{ x: 2, z: -5 }, { x: 6, z: -5 }, { x: 10, z: -5 }];

  // THE SHO: the same element, twice over — two blocks, two plates, and a
  // room big enough that you have to notice the second one (playbook sho beat;
  // dungeons.json node lb). Both must be down before anything happens, which
  // is the develop step: one block is no longer the whole answer.
  //
  // Reserved and built BEFORE the dressing, for the reason spelled out in
  // lg1: reserve() is what world.blocked() answers with, so a lane claimed up
  // here is a lane the columns, the low walls and scatter all decline. Claimed
  // afterwards it claims nothing — and the first cut of this room put a low
  // wall's rubble half a metre off the eastern lane, close enough to shoulder
  // a rolling block off its line.
  for (const lx of [7, 11]) {
    for (let z = -3.6; z <= 0.01; z += 1.2) world.reserve(lx, z, 1.1, 'lbShoLane');
  }
  world.reserve(14.6, -4.7, 2.0, 'lbVault');
  world.reserve(0, -11.9, 1.8, 'lbDoorBars');

  pushableBoulder(world, prepareModel, emberKit.rockSA, 7, -3.6);
  pushableBoulder(world, prepareModel, emberKit.rockSA, 11, -3.6);
  // THE VAULT, cut into the east wall between the Kiln road and the pup
  // pocket: a heart piece behind bars, in plain sight from both plates.
  wallRun(world, 13.7, -6, 16, -6, D);
  wallRun(world, 13.7, -3.4, 16, -3.4, D);
  visibleReward(world, 14.9, -4.7, 'l1_lb_vault', { shards: 24, heartPiece: 1 }, 'silver');
  const lbVaultBars = plateBars(world, prepareModel, emberKit.bars, 'l1_lb_sho', 13.2, -4.7,
    { span: 2.0, ry: Math.PI / 2, solved: lbSolved });
  const lbDoorBars = plateBars(world, prepareModel, emberKit.bars, 'l1_lb_sho', 0, -11.9,
    { span: 2.6, solved: lbSolved });
  const lbOpen = () => {
    if (!lbSolved()) return;      // one plate is half an answer, and stays shut
    lbVaultBars.open();
    lbDoorBars.open(true);
  };
  plateSwitch(world, 'l1_lb_sho_p1', 7, 0, lbOpen);
  plateSwitch(world, 'l1_lb_sho_p2', 11, 0, lbOpen);

  ruinedHome(world, -11, 6.5, -0.35, D, { w: 6.5, d: 5, keep: 0.68 });
  ruinedHome(world, -12.5, -7.5, 0.6, D, { w: 6, d: 4.5, keep: 0.5 });
  wayshrine(world, -6.5, 10.5, Math.PI + 0.2, D);
  cartWreck(world, 4.5, 8, -0.6, D);
  cartWreck(world, -7.5, -9.5, 0.9, D);
  fallenColumn(world, 13, 4, -1.2, D, 4.2);
  fallenColumn(world, 6.5, 11.5, 0.5, D, 3.0);
  lowWall(world, -2.5, 5.5, 0.4, D, 3.2);
  lowWall(world, 7.5, 2.5, -1.0, D, 3.4);
  rubbleField(world, 13.5, -2, 3.0, D, 14);
  rubbleField(world, -15, 1.5, 2.8, D, 12);
  rubbleField(world, 2, -11, 2.8, D, 12);
  aftermath(world, -11, 5, 2.2, D, 5);
  aftermath(world, 4, -9, 2.0, D, 6);
  scatter(world, halfW, halfD, D, 21, 7);
  return finish(world, spec, D);
}

export async function buildLb1(scene) {
  const { world, spec, D } = base(scene, 'lb1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: -6, z: 4, r: 3.6, kind: 'moss' }, { x: 6, z: -4, r: 3.2, kind: 'ash' },
              { x: 2, z: 5, r: 3.0, kind: 'gravel' }],
    paths: [[[-10, 0], [-3, 2], [3, 3.5], [8, 2]]],
  });
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'lb', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK
  wallRun(world, 1, -6, 1, 1, D);
  // Moth Hollow: a house whose roof went but whose hearth the moths still
  // gather at. The pup is behind the wall run, which is the whole point of it.
  world.markers.breakables = [
    { x: -3.5, z: -5.5, kind: 'cask' }, { x: 3, z: -5.5, kind: 'vase' },
    { x: -8, z: 4.5, kind: 'box' },
  ];
  world.markers.pup1Spot = { x: 6, z: -4 };
  world.markers.mothSpots = [{ x: 4, z: 3 }];
  ruinedHome(world, -6, -4.5, 0.7, D, { w: 5.5, d: 4, keep: 0.55 });
  cartWreck(world, 5.5, 5, -0.4, D);
  rubbleField(world, -2, 6, 2.6, D, 12);
  rubbleField(world, 7.5, -1, 2.4, D, 10);
  aftermath(world, -5, -4, 1.8, D, 7);
  scatter(world, halfW, halfD, D, 22, 5);
  return finish(world, spec, D);
}

export async function buildLb2(scene) {
  const { world, spec, D } = base(scene, 'lb2');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {
    patches: [{ x: -4, z: 0, r: 5.5, kind: 'scorch' }, { x: 4, z: -5, r: 3.2, kind: 'ash' },
              { x: -7, z: 5.5, r: 3.0, kind: 'rubble' }],
    paths: [[[10, 0], [4, -0.5], [1.5, 0]]],
  });
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
  // THE SCORCHED CUBBY. Whatever burned here burned hottest — this is where
  // the fire came through, and the props say so: everything on this side is
  // charred, collapsed, and the shrine did not survive it upright.
  world.markers.breakables = [
    { x: 3, z: 4.5, kind: 'crate' }, { x: 8.5, z: -5.5, kind: 'cask' },
    { x: -8.5, z: 2, kind: 'vase' },
  ];

  // THE TEN: push_block meets a second thing — not a new element, a new
  // SHAPE. lb's blocks each went straight at their plate; this one cannot,
  // because a spur wall stands exactly where a straight push would land it.
  // The block has to be walked the long way round the spur's open end before
  // it can reach the plate at all — routing, not repeating (playbook §5's
  // "exactly one twist"; dungeons.json node lb2). This is the hardest push in
  // the region, so it guards the best thing in it.
  //
  // Reserved before the dressing, for the reason given in lg1 and lb.
  for (const [rx, rz] of [[3, -1], [3, -2.2], [3, -3.4], [3, -4.6], [3, -5.8],
                          [4.2, -5.8], [5.4, -5.8], [6.6, -5.8],
                          [6.6, -4.6], [6.6, -3.4], [6.6, -2.2], [6.6, -1]]) {
    world.reserve(rx, rz, 1.1, 'lb2TenLane');
  }
  world.reserve(8.7, 6.6, 2.0, 'lb2Vault');

  wallRun(world, 4.5, -3, 4.5, 1, D);
  pushableBoulder(world, prepareModel, emberKit.rockSA, 3, -1);
  // THE VAULT, in the cubby's own back corner — the region's best axe behind
  // the region's hardest push. Nothing here is on the critical path (lb2 is a
  // dead end that loops back to the Causeway), so this one gates treasure and
  // never the road: a child who cannot route the block loses a prize, not
  // their game.
  wallRun(world, 7.0, 5.2, 7.0, 8, D);
  visibleReward(world, 8.7, 6.6, 'l1_lb2_vault', { shards: 20, gear: 'axe_ember' }, 'gold');
  const lb2Bars = plateBars(world, prepareModel, emberKit.bars, 'l1_lb2_ten', 8.7, 5.2,
    { span: 2.6 });
  plateSwitch(world, 'l1_lb2_ten', 6.6, -1, () => lb2Bars.open());

  ruinedHome(world, -6.5, 5.5, 0.4, D, { w: 6, d: 4.5, keep: 0.35 });
  fallenColumn(world, 3.5, 6.5, 2.2, D, 3.2);
  fallenColumn(world, 5, -5.5, -0.6, D, 2.8);
  cartWreck(world, 8.5, 2, 0.8, D);
  rubbleField(world, 0, 6, 3.0, D, 14);
  rubbleField(world, -8, -4, 2.8, D, 12);
  aftermath(world, -5, -5.5, 2.2, D, 8);
  scatter(world, halfW, halfD, D, 23, 5);
  return finish(world, spec, D);
}

// --- CHOKE 2 — THE NARROWS --------------------------------------------------
export async function buildLg2(scene) {
  const { world, spec, D } = base(scene, 'lg2');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: 1, r: 2.4, kind: 'scorch' }, { x: 4.5, z: -2.5, r: 2.4, kind: 'gravel' }],
    pathWidth: 2.4,
  });
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lb', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lc', { x: 0, z: 10, angle: Math.PI });
  // THE NARROWS: the road pinches between two collapsed frontages
  world.markers.breakables = [{ x: -3.2, z: 1.4, kind: 'crate' }, { x: 3.4, z: 1.6, kind: 'cask' }];
  world.markers.restSpot = { x: 0, z: 0 };
  coldHearth(world, -0.4, 1.2, D);
  ruinedHome(world, -5.4, -3.4, 0.9, D, { w: 4.5, d: 3.5, keep: 0.4, door: false });
  fallenColumn(world, 4.6, -1.4, -0.5, D, 2.4);
  rubbleField(world, -4.6, 3, 2.2, D, 10);
  rubbleField(world, 5, 2.6, 2.0, D, 9);
  aftermath(world, 3, -3, 1.6, D, 9);
  return finish(world, spec, D);
}

// --- ISLAND C — CINDER BRIDGES ----------------------------------------------
export async function buildLc(scene) {
  const { world, spec, D } = base(scene, 'lc');
  // the lava channel runs z -3..1 right across the room, so the worn route
  // deliberately bends to the two safe slabs rather than crossing where it
  // would burn — a path that walks a child into lava is worse than no path
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s'), gap('e')], D, {
    patches: [{ x: -9, z: -7, r: 5, kind: 'rubble' }, { x: 11, z: 8, r: 4.2, kind: 'scorch' },
              { x: -12, z: 7, r: 4, kind: 'scorch' }, { x: 12, z: -8, r: 3.8, kind: 'ash' },
              { x: -5, z: -1, r: 3, kind: 'gravel' }, { x: 5, z: -1, r: 3, kind: 'gravel' }],
    paths: [[[0, 13], [-2, 6], [-5, 2], [-5, -4], [-2, -8], [0, -13]],
            [[1, 1], [8, 2], [16, 0]]],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg2', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg3', { x: 0, z: 3.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'lc1', { x: -7, z: 0, angle: Math.PI / 2 });

  heroProp(world, -9, -7, 'span', D.tint, D);            // ▲ THE BROKEN SPAN
  world.markers.heroSpot = { x: -9, z: -7 };
  // the lava channel: two walkable slab routes with a gap of hazard between
  //
  // AND IT STOPS SHORT OF THE EAST DOORWAY. Dad, on v3.47.3: "unable to go
  // through doors in this room." The channel used to run the full width of the
  // room — x -16 to 16 — and the door to lc1 sits at x 16.6, z 0, which is
  // INSIDE that band. Both crossing slabs are at x -5 and x 5, so there was no
  // standing room in front of that doorway at all: a child could only reach it
  // by standing in lava, and lc1 — a pup and a chest — was behind it.
  //
  // Nothing ever cools this. `lava_cooled` is a narration line and nothing more;
  // no code removes a hazard when the boss falls. So the room was not saving
  // that pocket for later, it was simply walling it off.
  //
  // The band now ends at 12.5, leaving a stone shore in front of the door. The
  // SURFACE moves with it — a picture that shows lava where the collision says
  // floor is worse than either, because a child believes the picture.
  world.addLava(-16, 12.5, -3, 1);
  world.addSafe(-7, -3, -3, 1); world.addSafe(3, 7, -3, 1);
  protoDecal(world, -1.75, -1, 28.5, 4, 0xff5a2b, 0.5);
  protoDecal(world, -5, -1, 4, 4, 0x8a8a8a, 0.9);
  protoDecal(world, 5, -1, 4, 4, 0x8a8a8a, 0.9);
  protoDecal(world, 14.25, -1, 3.5, 4, 0x8a8a8a, 0.9);   // the east shore
  lavaSurface(world, -1.75, -1, 28.5, 4);
  slab(world, -5, -1, 4, 4, D); slab(world, 5, -1, 4, 4, D);
  slab(world, 14.25, -1, 3.5, 4, D);                     // ...and its stone
  // CINDER BRIDGES — the industrial edge. Not homes: the works. Columns that
  // carried the span, the stacks that fed it, and what the heat left. Nothing
  // is placed in the lava band z -3..1 or on the two safe slabs.
  world.markers.breakables = [
    { x: -10, z: 5.5, kind: 'barrel' }, { x: -14, z: 9.5, kind: 'box' },
    { x: 8.5, z: 9, kind: 'crate' }, { x: 13.5, z: 2, kind: 'cask' },
    { x: -4, z: -9.5, kind: 'vase' }, { x: 4.5, z: 8.5, kind: 'jar' },
  ];
  world.markers.emberfangSpots = [{ x: 8, z: -8 }];
  ruinedHome(world, -12, 7.5, 0.5, D, { w: 6, d: 4.5, keep: 0.45 });
  fallenColumn(world, -13.5, -6.5, 0.3, D, 4.4);
  fallenColumn(world, 12.5, 6.5, -1.4, D, 4.0);
  fallenColumn(world, 4, 11, 0.9, D, 3.0);
  wayshrine(world, 13, -10, Math.PI - 0.6, D);
  cartWreck(world, -6, 10.5, -0.5, D);
  cartWreck(world, 11, 3.5, 1.2, D);
  lowWall(world, -8.5, 5, -0.3, D, 3.4);
  lowWall(world, 6.5, 6.5, 0.9, D, 3.0);
  rubbleField(world, 14, 11, 3.0, D, 14);
  rubbleField(world, -15, 2.5, 2.6, D, 11);
  rubbleField(world, 2, -11, 3.0, D, 13);
  rubbleField(world, -3, 6.5, 2.4, D, 10);
  aftermath(world, -11, 6, 2.2, D, 10);
  aftermath(world, 10, -9, 2.0, D, 11);
  scatter(world, halfW, halfD, D, 31, 6);
  return finish(world, spec, D);
}

export async function buildLc1(scene) {
  const { world, spec, D } = base(scene, 'lc1');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: 4, z: -3, r: 4.5, kind: 'water' }, { x: -5, z: 4, r: 3.4, kind: 'mud' },
              { x: -7, z: -4, r: 3.0, kind: 'rubble' }],
    paths: [[[-10, 0], [-3, 1.5], [3, 0], [6, -2]]],
  });
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  // LANDED IN THE FIRE. This loop-back dropped the child at (13.5,0) in lc,
  // which is a hazard tile — walk back through the door and take a hit for it,
  // every time, with nothing to dodge. Nothing had ever checked a landing.
  sideDoor(world, 'w', halfW, halfD, 'lc', { x: 12.2, z: 1.7, angle: -Math.PI / 2 });  // LOOPS BACK
  wallRun(world, -2, -5, 6, -5, D);

  // THE KETSU: push_block's conclusion beat, and the last hole in Ember's
  // four-beat arc (dungeons.json carried it as a known gap; verify-graphs sat
  // in the known-fail manifest over it). The route is an L — north up the
  // open floor, then west into the corridor behind the forge wall — so it
  // asks for everything the arc taught: lg1's push, lb's patience, lb2's
  // routing. The corridor is the trick that makes the LONG push unfailable:
  // its walls (the forge wall south, the room shell north) leave no sideways
  // for a lean to deflect into, and a plate SNAPS the block dead-centre, so
  // the final leg cannot be fumbled — precision comes from the geometry, not
  // from the child. The open-floor half stays open floor: a wrong push out
  // there is walked around and pushed back, never wedged (the ma lesson).
  // Optional twice over — lc1 is a dead-end pocket, and the bars gate a NEW
  // vault, not the forge chest a save might already have opened.
  // The first cut of this room was wrong twice, and pushing it for real found
  // both inside ten minutes: the north leg had no stopper (the block overran
  // the turn and drifted into the corner), and the vault sat exactly where
  // the child must STAND to start the west leg. So the shell wall IS the
  // stopper now — push north until the room itself stops the block, which
  // auto-aligns the turn (f3's skid-stopper idea, on foot) — and the vault
  // lives at the corridor's FAR END, sealed on three sides (shell north, a
  // short wall west, the forge wall south), its prize visible down the
  // tunnel through the bars. The child only ever pushes from the east.
  for (let z = -2.6; z >= -6.8; z -= 1.2) world.reserve(7, z, 1.4, 'ketsuLane');
  for (let x = 0.2; x <= 8.6; x += 1.2) world.reserve(x, -6.8, 1.4, 'ketsuLane');
  if (!GREY()) pushableBoulder(world, prepareModel, emberKit.rockSA, 7, -2.6);
  wallRun(world, -1.2, -5.6, -1.2, -7.2, D);          // the vault pocket's west seal
  visibleReward(world, 0.2, -6.8, 'l1_lc1_ketsu', { shards: 26, potion: 1 }, 'silver');
  const ketsuBars = GREY() ? { open() {} }
    : plateBars(world, prepareModel, emberKit.bars, 'l1_lc1_ketsu', 0.9, -6.8,
        { span: 2.0, ry: Math.PI / 2 });
  plateSwitch(world, 'l1_lc1_ketsu', 2.2, -6.8, () => { ketsuBars.open(); });
  // Ember's third pup, in the corner the forge water never reached
  world.markers.pupSpot = { x: -7, z: 5.5, id: 'pup_l3' };
  // THE DROWNED FORGE: the one place in the Hollow where the fire lost. Water
  // took the floor, the stacks went over, and the heart piece is at the back
  // of it — which is why this pocket is worth the detour.
  world.markers.breakables = [
    { x: -3, z: -3, kind: 'barrel' }, { x: 7.5, z: 5.5, kind: 'box' },
    { x: 1, z: 3.5, kind: 'vase' },
  ];
  world.markers.pocketChest = { x: 6, z: -2 };
  world.markers.magmaSlimeSpots = [{ x: 2, z: 4 }];
  fallenColumn(world, -6.5, -1.5, 1.4, D, 3.4);
  fallenColumn(world, 2, 5.5, -0.3, D, 3.0);
  cartWreck(world, -7.5, 4.5, 0.9, D);
  rubbleField(world, 8, 3, 2.8, D, 13);
  rubbleField(world, -1, -6.5, 2.4, D, 10);
  aftermath(world, 5, 2, 2.0, D, 12);
  visibleReward(world, 6, -2, 'l1_drowned_forge', { shards: 22, heartPiece: 1, armour: 'ember' });
  // THE EMBER KEY (playbook item beat): a stone that remembers the seal
  // back at THE EMBER SEAL. Carry it there — carrying trades away the
  // special (Wild Arms rule, js/carry.js) — and the "sealed by shadow"
  // hint Pip has been giving since the first room finally resolves. This
  // pocket stays optional: nothing about clearing the region depends on it.
  carryItem(world, prepareModel, emberKit.rockSA, {
    id: 'ember_key', region: 'ember', x: -4, z: -1, tint: 0xffa93a, scale: 0.85,
  });
  scatter(world, halfW, halfD, D, 32, 5);
  return finish(world, spec, D);
}

// --- CHOKE 3 — THE EMBER SEAL -----------------------------------------------
export async function buildLg3(scene) {
  const { world, spec, D } = base(scene, 'lg3');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: -2, r: 2.6, kind: 'scorch' }, { x: -4.5, z: 2.5, r: 2.4, kind: 'gravel' }],
    pathWidth: 2.4,
  });
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lc', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'ld', { x: 0, z: 10, angle: Math.PI });
  // THE EMBER SEAL: the last gate before the Kiln, and someone kept a watch
  // here. The shrine is the tell — this door mattered to whoever held it.
  world.markers.breakables = [{ x: 2.6, z: -1.2, kind: 'vase' }, { x: -2.6, z: 2.6, kind: 'box' }];
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.sealSpot = { x: 0, z: -2 };
  // THE SEAL ITSELF: the Ember Key (lc1) seats here. Resolves the key_door
  // hint (main.js) and pays out a bonus find — this stays a side-quest, not
  // a gate, since lc1 is an optional pocket, not on the spine.
  socket(world, prepareModel, emberKit.rockSA, {
    id: 'ember_seal', region: 'ember', x: 0, z: -2, stoneId: 'ember_key',
    tint: 0xffa93a, scale: 0.85,
    onFill: () => { state.flags.keys.ember = true; spawnShards(world, 0, -2, 20); },
  });
  wayshrine(world, -4.4, -2.4, 0.4, D);
  coldHearth(world, 4.2, 1.4, D);
  fallenColumn(world, 4.6, -2.8, -0.7, D, 2.4);
  rubbleField(world, -4.8, 2.8, 2.2, D, 10);
  rubbleField(world, 2, 3.2, 1.8, D, 8);
  aftermath(world, -2.5, -3, 1.5, D, 13);
  return finish(world, spec, D);
}

// --- ISLAND D — THE KILN (the ability: introduce + develop) ------------------
export async function buildLd(scene) {
  const { world, spec, D } = base(scene, 'ld');
  // THE BOSS DOOR IS OFF-CENTRE, AND HAS TO BE.
  //
  // The Forge Heart is a 5.2-radius solid at (0, -8). The north wall's inner
  // face is at z = -12.5, so at the wall the forge still covers x ±3.2 — and a
  // doorway is only 2.4u wide. Cut in the middle, the gap was completely
  // sealed: Ember Hollow shipped with its boss unreachable, and a child could
  // walk up to the great forge and no further. Nothing caught it because the
  // door GRAPH was perfect; only the floor was impassable.
  //
  // Moving the forge would cost the room its centrepiece. Moving the DOOR costs
  // nothing and reads better: you come up the Hollow, the forge fills the way
  // ahead, and you go round it. tools/verify-reachable.mjs holds this now.
  const { halfW, halfD } = shell(world, spec, [gap('n', undefined, -6), gap('s'), gap('e')], D, {
    patches: [{ x: 0, z: -8, r: 6.5, kind: 'scorch' }, { x: -11, z: 6, r: 4.4, kind: 'gravel' },
              { x: -12, z: -6, r: 4.0, kind: 'scorch' }, { x: 9.5, z: 6, r: 4.0, kind: 'ash' },
              { x: 13, z: -8, r: 3.6, kind: 'rubble' }],
    // the route bends WEST around the gutter channel (x 6..13, z 2..10) rather
    // than through it: the channel is a timed run, not a corridor — and then
    // west again around the forge itself to the boss door
    paths: [[[0, 13], [-3, 8], [-2, 2], [0, -3], [-4, -8], [-6, -13]], [[1, 0], [9, -1], [16, 0]]],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'lg3', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'lg4', { x: 0, z: 3.2, angle: Math.PI }, { centre: -6 });
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
  // CINDER'S SHRINE — the place the whole region walks toward.
  //
  // Dad, on a screenshot of standing right at it: "remove the lantern in this
  // image and replace it with an epic looking shrine or something epic that
  // makes you want to walk up to it and touch it. make it glow bright as well."
  //
  // He was standing ON the spot where the Fire Wolf is granted and reading it as
  // a lantern, because that is what it looked like: one small brazier among the
  // several this room already has. The single most important object in Ember
  // Hollow was dressed the same as its scenery. It gets the spirit shrine now —
  // a heart of light, a turning halo, a column visible from the doorway and
  // motes climbing out of it — the same treatment Petra's and Sylva's carry, in
  // forge-orange.
  spiritShrine(world, 0, -3, 0xff8a2b, 1.5);
  // THE KILN DISTRICT — the works, and the shrine at the heart of them. The
  // richest room in the level because it is the one the whole level walks
  // toward. Nothing sits in the gutter channel (x 6..13, z 2..10) or within
  // four units of the Forge Heart, which needs its approach clear.
  world.markers.breakables = [
    { x: -10, z: 4.5, kind: 'barrel' }, { x: -14, z: 8.5, kind: 'box' },
    { x: -10.5, z: -5, kind: 'vase' }, { x: 2, z: 11, kind: 'box' },
    { x: 14, z: 4, kind: 'barrel' }, { x: -3.5, z: -10, kind: 'jar' },
  ];
  wayshrine(world, -5, -4, 0.3, D);
  ruinedHome(world, -12, 6.5, -0.4, D, { w: 6, d: 5, keep: 0.66 });
  ruinedHome(world, -12.5, -6.5, 0.8, D, { w: 5.5, d: 4.5, keep: 0.5 });
  fallenColumn(world, -6.5, 9.5, 0.6, D, 3.6);
  fallenColumn(world, 13.5, -5.5, -1.1, D, 3.4);
  cartWreck(world, 3.5, 9, -0.7, D);
  cartWreck(world, -8.5, 1.5, 1.0, D);
  lowWall(world, 4, 4.5, 0.5, D, 3.0);
  rubbleField(world, 14.5, 8, 2.8, D, 12);
  rubbleField(world, -15, 0, 2.6, D, 11);
  rubbleField(world, 8, -11, 3.0, D, 13);
  aftermath(world, -11, 5, 2.2, D, 14);
  aftermath(world, 12, -7, 2.0, D, 15);
  scatter(world, halfW, halfD, D, 41, 6);
  return finish(world, spec, D);
}

// --- THE ORDER HALL — the one puzzle room, the TWIST -------------------------
export async function buildLd1(scene) {
  const { world, spec, D } = base(scene, 'ld1');
  // THE PUZZLE ROOM stays READABLE. It is dark by design and the whole
  // mechanic is reading four pilot-flames, so this is the one room in Ember
  // dressed only at the PERIMETER — clutter between the braziers would compete
  // with the exact thing a child has to look at.
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    groundStyle: 'kiln',
    patches: [{ x: 0, z: 0, r: 5, kind: 'scorch' }, { x: -8, z: 6, r: 2.6, kind: 'gravel' },
              { x: 8, z: -6, r: 2.6, kind: 'gravel' }],
    paths: [[[-10, 0], [-4, 0], [4, 0], [9, 0]]],
  });
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
  // perimeter only — see the note on the shell above
  world.markers.breakables = [{ x: -8.5, z: 2, kind: 'jar' }, { x: 8.5, z: -2, kind: 'vase' }];
  fallenColumn(world, -8.5, -6, 0.5, D, 2.6);
  fallenColumn(world, 8.5, 6, -0.8, D, 2.6);
  rubbleField(world, 8.5, -6.5, 2.2, D, 9);
  rubbleField(world, -8.5, 6.5, 2.2, D, 9);
  aftermath(world, 0, -6.8, 1.6, D, 16);
  return finish(world, spec, D);
}

// --- CHOKE 4 — THE BOSS DOOR (rest: flame + potion, contract law) ------------
export async function buildLg4(scene) {
  const { world, spec, D } = base(scene, 'lg4');
  const { halfW, halfD } = shell(world, spec, [gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: -3, r: 3.0, kind: 'scorch' }, { x: -5, z: 2.5, r: 2.2, kind: 'ash' }],
    pathWidth: 2.6,
  });
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  // ...and coming BACK put the player at (0, -10), which is inside the Forge
  // Heart's collider. Both ends of this door were wrong.
  sideDoor(world, 's', halfW, halfD, 'ld', { x: -6, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'le', { x: 0, z: 9.5, angle: Math.PI });
  // THE LAST ROOM BEFORE THE BOSS. Someone waited here, and did not go in: a
  // hearth still ringed with stones, a shrine, and the belongings they left
  // when they finally turned back. It is the quietest room in Ember on purpose.
  world.markers.restSpot = { x: -2, z: 0 };
  world.markers.potionSpot = { x: 2, z: 0 };
  world.markers.bossDoorSpot = { x: 0, z: -3 };
  // THE GATE INTO CINDER'S CAGE. Twice Kael's height, shut until the region
  // says otherwise, with the arena showing through it as haze.
  if (!GREY()) {
    bossGate(world, 0, -halfD, 0, emberKit.archDoorB, D.wallTint,
      { open: true, portal: 0xff8a3a, height: 3.4 });
  }
  wayshrine(world, -4.6, -2.6, 0.6, D);
  coldHearth(world, 3.8, 2.2, D);
  fallenColumn(world, 4.8, -2.4, -0.9, D, 2.2);
  rubbleField(world, -4.6, 3, 2.0, D, 9);
  aftermath(world, -2, -3.2, 1.5, D, 17);
  return finish(world, spec, D);
}

// --- ISLAND E — HEART OF THE HOLLOW (boss; TEACH 4 — conclude) ---------------
export async function buildLe(scene) {
  const { world, spec, D } = base(scene, 'le');
  const onward = !!state.flags.bossDefeated;
  const gaps = [gap('s'), ...(onward ? [gap('w'), gap('n')] : [])];
  // A BOSS ARENA IS DRESSED AT THE EDGES ONLY. The Shadowgrip's charge runs
  // about eight units and needs somewhere to run; anything a child can snag on
  // mid-arena turns a readable dodge into an unfair hit. So the floor carries
  // the mood and the perimeter carries the props.
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: -2, r: 7, kind: 'corruption' }, { x: -10, z: 8, r: 3.4, kind: 'scorch' },
              { x: 10, z: 8, r: 3.4, kind: 'scorch' }, { x: 0, z: 10, r: 3.0, kind: 'ash' }],
    paths: [[[0, 13], [0, 6]]],
  });
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
  scatter(world, halfW, halfD, D, 51, 6);
  world.markers.cageBraziers = [
    { x: -4, z: -6 }, { x: 4, z: -6 }, { x: -4, z: 2 }, { x: 4, z: 2 },
  ];
  teachBraziers(world, world.markers.cageBraziers, 'le_cage');
  // the ring of what was here before the cage was — perimeter only
  for (const [cx, cz, cr] of [[-11, -9, 0.4], [11, -9, -0.4], [-11.5, 9, 1.2], [11.5, 9, -1.2]]) {
    fallenColumn(world, cx, cz, cr, D, 3.0);
  }
  rubbleField(world, -11.5, 0, 2.6, D, 11);
  rubbleField(world, 11.5, 0, 2.6, D, 11);
  rubbleField(world, 0, -11.5, 2.8, D, 12);
  aftermath(world, -9, -10, 2.0, D, 18);
  aftermath(world, 9, -10, 2.0, D, 19);
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
