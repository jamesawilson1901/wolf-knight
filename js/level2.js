// LEVEL 2 — STONEROOT CAVERNS, rebuilt to design/LEVEL-MAP.md (2026-08-07).
//
// Topology: HUB AND SPOKE. One great vault, three spokes, and the vault is a
// different room every time you walk back into it. That last part is the whole
// level: a hub you merely pass through six times is backtracking, and a hub
// that has visibly changed since you left is progress.
//
// METRICS ARE INHERITED, NOT DERIVED (design/METRICS.md). Body radius, grid
// snap, door width, corridor minimums, camera framing and every module size
// come straight from the Level 1 lock. One new module type is added — the
// 36 x 28 HUB — because the vault is crossed six times and a space crossed six
// times has to be big enough that a corner which was dark last visit is a
// genuine discovery. It is still on the same 1.0 u grid, still an even size,
// and it is in the metrics zoo to be walked at true scale.
//
// SPACES (17): hub + 3 chokes + 3 spokes x 3 + 3 pockets + crypt.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel, protoMaterial } from './proto.js';
import { loadGLB, prepareModel, instancePlacements } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, DOOR_HALF, BOSS_DOOR_HALF,
  wallTintMap, spiritShrine, bossGate, reserveLandings } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { registerDistrictTints } from './districts.js';
import { thresholdGlow } from './levelkit.js';
import { flattenStatic } from './batch.js';
import { WS, restorationOf } from './worldstate.js';

let forceGrey = false;
let caveKit = null;
const GREY = () => forceGrey || !caveKit || state.settings.greybox !== false;

// The region key the restoration is registered under (js/worldstate.js).
export const REGION = 'vault';

// ---------------------------------------------------------------------------
// DISTRICTS. The palette IS the navigation: a child recalls "the blue wet bit"
// long before they could read a sign. The vault alone carries two palettes —
// cold slate before the lantern, warm amber after — which is the single
// clearest way to say "this place changed" without a word of text.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  // propTint: the third value. wallTint is deliberately about half the floor's
  // luminance because it was chosen for rock faces, and renders a crate as a
  // black slab; floorTint renders one as bleached bone. A thing you walk past
  // sits between them. Down here it also runs COLDER than Ember's, because the
  // only light that has reached this stone in an age is blue.
  vaultDark:  { tint: 0x6d7480, floorTint: 0x555c68, wallTint: 0x22262e, propTint: 0x5c6470, ground: 'vaultDark',
                name: 'THE GREAT VAULT', hero: 'THE STONE TITAN' },
  vaultWarm:  { tint: 0xc79a5e, floorTint: 0xb08a55, wallTint: 0x3a2e20, propTint: 0x8e7048, ground: 'vaultWarm',
                name: 'THE GREAT VAULT', hero: 'THE STONE TITAN' },
  glimmer:    { tint: 0x7fd8e8, floorTint: 0xa9c6cf, wallTint: 0x24414d, propTint: 0x6d8f9c, ground: 'glimmer',
                name: 'THE GLIMMERWAY', hero: 'THE GEODE' },
  quarry:     { tint: 0xd8c9a4, floorTint: 0xcabf9d, wallTint: 0x4a4132, propTint: 0x9a8f70, ground: 'quarry',
                name: 'THE BONE QUARRY', hero: 'THE RIBCAGE' },
  sunken:     { tint: 0x4e9c96, floorTint: 0x5a8a86, wallTint: 0x1c3a3c, propTint: 0x4e7472, ground: 'sunken',
                name: 'THE SUNKEN STAIR', hero: 'THE DROWNED DOOR' },
  crypt:      { tint: 0x8a8478, floorTint: 0x6a665e, wallTint: 0x1a1a1c, propTint: 0x6b6760, ground: 'crypt',
                name: "THE WARDEN'S CRYPT", hero: "THE WARDEN'S THRONE" },
};

// The hub wears whichever palette its state says it wears. This is the
// smallest possible example of the Step 3 rule: geometry and colour are
// FUNCTIONS OF THE STATE, never of what happened to run earlier this session.
const vaultDistrict = () => (WS.stage(REGION) >= 1 ? DISTRICTS.vaultWarm : DISTRICTS.vaultDark);

// ---------------------------------------------------------------------------
// THE LEVEL, as data. `spine` marks the guaranteed critical path; `loopsTo`
// marks an optional pocket and names the space it returns to; `returnsToHub`
// marks a spoke terminus and its walked shortcut home. The no-dead-ends rule
// is therefore readable off this table and checkable against the built world.
// ---------------------------------------------------------------------------
const M = MODULES;
export const L2 = {
  vh:  { ...M.hub,    kind: 'hub',    district: 'vault',   spine: true,
         label: 'THE GREAT VAULT', beat: 'REST · changes three times' },

  vga: { ...M.choke,  kind: 'choke',  district: 'glimmer', spine: true,
         label: 'THE CRYSTAL MOUTH', beat: 'REST · compression' },
  va1: { ...M.island, kind: 'island', district: 'glimmer', spine: true,
         label: 'A1 · THE GLIMMERWAY', beat: 'slimes · crystal narrows' },
  va2: { ...M.island, kind: 'island', district: 'glimmer', spine: true,
         label: 'A2 · THE GEODE', beat: 'bats · the climb · DEVELOP' },
  vap: { ...M.pocket, kind: 'pocket', district: 'glimmer', loopsTo: 'va2',
         label: 'Glitter Pocket', beat: 'optional · pup' },
  va3: { ...M.pocket, kind: 'pocket', district: 'glimmer', spine: true, returnsToHub: true,
         label: "PETRA'S SPARK", beat: 'EARTH WOLF · INTRODUCE' },

  vgb: { ...M.choke,  kind: 'choke',  district: 'quarry',  spine: true,
         label: 'THE CHALK MOUTH', beat: 'REST · compression' },
  vb1: { ...M.island, kind: 'island', district: 'quarry',  spine: true,
         label: 'B1 · THE BONE QUARRY', beat: 'skeleton minions' },
  vb2: { ...M.island, kind: 'island', district: 'quarry',  spine: true,
         label: 'B2 · THE RIBCAGE', beat: 'Bone Brutes' },
  vbp: { ...M.pocket, kind: 'pocket', district: 'quarry',  loopsTo: 'vb2',
         label: 'The Chalk Seam', beat: 'optional · chest' },
  vb3: { ...M.pocket, kind: 'pocket', district: 'quarry',  spine: true, returnsToHub: true,
         label: 'THE RATTLE', beat: 'THE PUZZLE ROOM · TWIST · the Dam' },

  vgc: { ...M.choke,  kind: 'choke',  district: 'sunken',  spine: true,
         label: 'THE WET MOUTH', beat: 'REST · compression' },
  vc1: { ...M.island, kind: 'island', district: 'sunken',  spine: true,
         label: 'C1 · THE SUNKEN STAIR', beat: 'shieldlings' },
  vc2: { ...M.island, kind: 'island', district: 'sunken',  spine: true,
         label: 'C2 · THE DROWNED DOOR', beat: 'wet stair · bramble promise' },
  vcp: { ...M.pocket, kind: 'pocket', district: 'sunken',  loopsTo: 'vc2',
         label: 'Drowned Alcove', beat: 'optional · chest' },
  vc3: { ...M.pocket, kind: 'pocket', district: 'sunken',  spine: true, returnsToHub: true,
         label: 'THE SHOULDER PIN', beat: 'the last pin drops' },

  vz:  { ...M.arena,  kind: 'arena',  district: 'crypt',   spine: true,
         label: "E · THE WARDEN'S CRYPT", beat: 'THE BONE WARDEN · CONCLUDE' },
};

// Each room's district colour, so a DOORWAY can show what is beyond it
// (js/districts.js). Registered here because this is the only place that
// knows both the room table and the palette.
registerDistrictTints(L2, DISTRICTS);

// The critical path. Written down so it can be asserted rather than believed.
// Spokes B and C are interchangeable — that is the level's only real choice —
// so the spine is expressed as the A-first order and the verifier also proves
// the C-first order works.
export const SPINE = [
  'vh', 'vga', 'va1', 'va2', 'va3', 'vh',
  'vgb', 'vb1', 'vb2', 'vb3', 'vh',
  'vgc', 'vc1', 'vc2', 'vc3', 'vh',
  'vz',
];

// The four-step teach for the EARTH WOLF's stone-stomp, in the order it must
// be met. Nothing new is introduced after the twist.
export const TEACH = [
  { step: 'introduce', room: 'va3', marker: 'teachCrack',
    what: 'the shrine — one cracked pile, no enemies, no timer' },
  // DEVELOP lives in vb1, not on Spoke A's return leg as the docs suggested.
  // The shrine has a walked shortcut straight back to the hub, so a child who
  // takes it would never re-cross va2 and would be taught three quarters of an
  // ability. vb1 is on the spine after the shrine and cannot be skipped — and
  // "cracked piles with skeletons standing over them" belongs in the Bone
  // Quarry far more naturally than in a crystal gallery anyway.
  { step: 'develop', room: 'vb1', marker: 'developCracks',
    what: 'the Bone Quarry — cracked piles with skeletons standing over them' },
  { step: 'twist', room: 'vb3', marker: 'rattlePlate',
    what: 'THE RATTLE — the stomp is not a hammer, it is a SOUND' },
  { step: 'conclude', room: 'vz', marker: 'stompStagger',
    what: "the Bone Warden — a stomp at his feet drops his guard" },
];

// ---------------------------------------------------------------------------
// THE CAVE KIT. Every file is already vendored for Level 1 or for the shipping
// Stoneroot rooms, so Level 2 adds ZERO bytes to the download. Buckets, from
// assets/LICENSES/MANIFEST.json: Kenney Nature 2.1 GREEN, Kenney Castle 2.0
// GREEN, Quaternius LowPoly Modular Dungeon GREEN, KayKit Adventurers GREEN.
// ---------------------------------------------------------------------------
export async function loadCaveKit() {
  if (caveKit) return caveKit;
  const names = {
    // reused from Level 1 — the shell modules are proven 1x1 on the grid
    floor:   './assets/env/floor-tile.glb',        // Kenney Nature   🟢
    cliff:   './assets/env/cliff-block.glb',       // Kenney Nature   🟢
    rockLA:  './assets/env/rock-large-a.glb',
    rockLB:  './assets/env/rock-large-b.glb',
    rockLC:  './assets/env/rock-large-c.glb',
    rockSA:  './assets/env/rock-small-a.glb',
    rockSB:  './assets/env/rock-small-b.glb',
    bridge:  './assets/env/bridge-stone.glb',
    pillar:  './assets/env/pillar.glb',            // Kenney Castle   🟢
    // reused from the shipping Stoneroot rooms
    column:  './assets/env/dungeon/Column.glb',    // Quaternius      🟢
    column2: './assets/env/dungeon/Column2.glb',
    arch:    './assets/env/dungeon/Arch.glb',
    bars:    './assets/env/dungeon/Arch_bars.glb',
    archDoor:'./assets/env/dungeon/Arch_Door.glb',
    brick:   './assets/env/dungeon/Brick.glb',
    pedestal:'./assets/env/dungeon/Pedestal.glb',
    skull:   './assets/env/dungeon/Skull.glb',
    torch:   './assets/env/dungeon/Torch.glb',
    stairs:  './assets/env/dungeon/Stairs_Modular.glb',
    decoWall:'./assets/env/dungeon/Decorative_Wall.glb',
    // --- THE OLD WORKINGS ---------------------------------------------------
    // Stoneroot is BURIED AND WAITING: something enormous was carved here a
    // very long time ago and the dark has been sitting on it since. These are
    // the things the diggers left when they stopped — all already vendored and
    // licence-cleared, all previously unused.
    wallMod: './assets/env/dungeon/Wall_Modular.glb',      // Quaternius 🟢
    wallCov: './assets/env/dungeon/WallCover_Modular.glb',
    barrel:  './assets/env/dungeon/Barrel.glb',
    crate:   './assets/env/dungeon/Crate.glb',
    vase:    './assets/env/dungeon/Vase.glb',
    banner:  './assets/env/dungeon/Banner_wall.glb',
    woodfire:'./assets/env/dungeon/Woodfire.glb',
    coins:   './assets/env/dungeon/Coin_Pile.glb',
    cobweb:  './assets/env/dungeon/Cobweb.glb',
    logStack:'./assets/env/log-stack.glb',                 // Kenney Nature 🟢
    horse:   './assets/env/dungeon/Statue_Horse.glb',
    archDoorB:'./assets/env/dungeon/Arch_Door.glb',
    // the hero prop that is a BEING gets a real character model, never code
    // geometry (no-code-built-creatures law). A stone titan is a slumped
    // giant: KayKit's barbarian at 3.4x, tinted granite.
    titan:   './assets/chars/barbarian.glb',       // KayKit Adventurers 🟢
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  caveKit = Object.fromEntries(entries);
  return caveKit;
}

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward,
  darkZone } = makeBuilders({ kit: () => caveKit, isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

// The shared cluster vocabulary (js/dressing.js), bound to the cave kit. The
// same builders Ember uses — a collapsed home is a collapsed home whether its
// walls are burnt masonry or cut rock, and a vocabulary only one level can
// speak is how Level 3 ended up using none of its forest models.
const { ruinedHome, coldHearth, fallenColumn, rubbleField, wayshrine, aftermath,
  cartWreck, lowWall } = makeDressers({ kit: () => caveKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

// ---------------------------------------------------------------------------
// LEVEL-SPECIFIC PIECES
// ---------------------------------------------------------------------------

// A cracked pile — the Earth Wolf's verb, and before you have the Earth Wolf,
// a promise. Glittering cracks say "later" in the same shape every time, which
// is why the very first one is back in Ember Hollow a whole level early.
function crackedPile(world, id, x, z, big = false) {
  const done = !!(state.flags.cracked && state.flags.cracked[id]);
  if (done) return null;
  const s = big ? 1.5 : 1.0;
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.6 * s, 1.5 * s, 1.6 * s),
      new THREE.MeshStandardMaterial({ color: 0x9a8c6a, roughness: 0.9,
        emissive: 0xd8c07a, emissiveIntensity: 0.22 })
    );
    m.position.set(x, 0.75 * s, z);
    world.add(m);
    world.addCircle(x, z, 0.8 * s);
    world.crackables.push({ id, x, z, r: 0.9 * s, mesh: m });
    return m;
  }
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = tinted(caveKit[i ? 'rockSA' : 'rockLB'], 'crack', 0x9a8c6a, 0.95 + i * 0.05);
    p.position.set(x + (i - 1) * 0.55 * s, i * 0.3 * s, z + ((i % 2) - 0.5) * 0.5 * s);
    p.rotation.y = i * 1.7;
    p.scale.setScalar((i ? 0.7 : 1.05) * s);
    g.add(p);
  }
  // the glitter: the tell that this is breakable, readable from directly above
  const glint = new THREE.Mesh(
    new THREE.RingGeometry(0.7 * s, 0.95 * s, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.34,
      side: THREE.DoubleSide, depthWrite: false })
  );
  glint.rotation.x = -Math.PI / 2;
  glint.position.set(x, world.deckY + 0.04, z);
  world.add(glint);
  world.add(g);
  world.addCircle(x, z, 0.8 * s);
  world.crackables.push({ id, x, z, r: 0.9 * s, mesh: g, glint });
  return g;
}

// The hero props. Greybox is a bold blocky silhouette at TRUE SCALE, because
// "does it read from directly above" is a silhouette question, not an art one.
function heroProp(world, x, z, kind, D) {
  const g = new THREE.Group();

  if (GREY()) {
    const mat = protoMaterial(D.tint, 3, 3);
    const add = (w, h, d, px, py, pz, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz); m.rotation.y = ry; m.castShadow = true;
      g.add(m);
    };
    if (kind === 'titan') {          // a slumped giant against the far wall
      add(6, 7, 3.4, 0, 3.5, 0);                 // torso
      add(3.4, 3.4, 3.4, 0, 8.4, 0.4);           // head
      add(2.4, 6.5, 2.4, -5.2, 3.2, 1.6, 0.4);   // the arm that becomes the ramp
      world.addBox(x - 3.4, x + 3.4, z - 1.9, z + 1.9);
    } else if (kind === 'geode') {   // a split crystal taller than Kael
      add(3.2, 5.4, 3.2, -1.3, 2.7, 0, 0.5);
      add(2.6, 4.2, 2.6, 1.6, 2.1, 0.4, -0.4);
      world.addCircle(x, z, 2.2);
    } else if (kind === 'ribcage') { // a colossal fossil arch you walk under
      for (let i = 0; i < 5; i++) {
        const a = -1 + i * 0.5;
        add(0.9, 6.2, 0.9, Math.sin(a) * 5.2, 3.1, i * 0.9 - 1.8, a);
      }
    } else if (kind === 'drownedDoor') { // a stone door half-submerged
      add(6.5, 5.5, 1.4, 0, 1.6, 0);
      world.addBox(x - 3.2, x + 3.2, z - 0.8, z + 0.8);
    } else if (kind === 'throne') {
      add(4.2, 1.2, 4.2, 0, 0.6, 0); add(3.4, 4.4, 1.2, 0, 3.0, -1.5);
      world.addCircle(x, z, 2.1);
    }
    g.position.set(x, 0, z);
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

  if (kind === 'titan') {
    // A real humanoid model at 3.4x, granite grey, tipped back and slumped —
    // the asset-multiplication law doing the work a bespoke model would.
    const t = tinted(caveKit.titan, 'titan', 0x8d8f94);
    t.scale.setScalar(3.4);
    t.rotation.set(-0.34, 0, 0);         // slumped back against the wall
    t.position.set(0, 0, 0);
    g.add(t);
    world.addBox(x - 3.4, x + 3.4, z - 1.9, z + 1.9);
  } else if (kind === 'geode') {
    // a split boulder with a glowing heart — one rock, two halves, cracked open
    put(caveKit.rockLA, 'geodeShell', -1.5, 0, 0, 2.6, 0.5, 0.18, 0x35525c);
    put(caveKit.rockLC, 'geodeShell', 1.7, 0, 0.3, 2.4, -0.4, -0.2, 0x35525c);
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 0),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x7fd8e8,
        emissiveIntensity: 2.2, roughness: 0.4 })
    );
    heart.position.set(0.1, 1.9, 0.1);
    g.add(heart);
    world.keepLoose(heart);
    const lamp = new THREE.PointLight(0x7fd8e8, 7, 16, 1.8);
    lamp.position.set(x, 2.2, z);
    world.add(lamp);
    world.onAnimate((t2) => {
      heart.rotation.y = t2 * 0.5;
      heart.material.emissiveIntensity = 1.8 + Math.sin(t2 * 1.7) * 0.6;
    });
    world.addCircle(x, z, 2.2);
  } else if (kind === 'ribcage') {
    // ribs from columns, splayed and leaning — an arch you walk under
    for (let i = 0; i < 6; i++) {
      const a = -1.1 + i * 0.44;
      put(caveKit.column, 'rib', Math.sin(a) * 5.4, 0, i * 0.95 - 2.4, 2.5, 0, a, 0xd8d2bc);
    }
  } else if (kind === 'drownedDoor') {
    put(caveKit.archDoor, 'drowned', 0, 0, 0, 3.0, 0, 0, 0x2c4f52);
    world.addBox(x - 3.2, x + 3.2, z - 0.8, z + 0.8);
  } else if (kind === 'throne') {
    put(caveKit.pedestal, 'throne', 0, 0, 0, 3.0);
    put(caveKit.column, 'throne', 0, 1.1, -1.6, 2.2);
    put(caveKit.skull, 'throne', 0, 2.6, -1.4, 2.6, 0.3, 0, 0xe6e0d0);
    world.addCircle(x, z, 2.1);
  }
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// BUILDER PLUMBING
// ---------------------------------------------------------------------------
function base(scene, id) {
  const spec = L2[id];
  const world = new World(scene);
  world.bgColor = 0x0e1218;
  world.roomId = id;
  reserveLandings(world, id);
  const D = spec.district === 'vault' ? vaultDistrict() : DISTRICTS[spec.district];
  return { world, spec, D };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#cfe8f2', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#8f9aa4', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  // THE GUARDRAIL (js/batch.js). Every static prop above folds into one draw
  // per material. Measured on Level 1 this is worth 40-70 calls a room.
  // LAST LINE OF DEFENCE. A builder that dressed before it set its markers
  // could not have consulted them, so anything still standing on a gameplay
  // square loses its collider here and says so on the console. See
  // World.sweepKeepClear.
  world.sweepKeepClear();
  thresholdGlow(world);   // the next room's colour, spilled at each doorway
  flattenStatic(world);
  return world;
}

// ===========================================================================
// THE HUB — THE GREAT VAULT.
//
// Everything in here is a FUNCTION OF WS.stage('vault'). Nothing is toggled by
// "what happened earlier this session": the room is rebuilt from scratch on
// every entry and reads the saved state, which is exactly why a child who
// quits after the water drains and comes back tomorrow finds it still drained.
// ===========================================================================
export async function buildVh(scene) {
  const { world, spec, D } = base(scene, 'vh');
  const stage = WS.stage(REGION);

  // The doorways THEMSELVES are state. Before the lantern relights the vault
  // is unlit and the two side galleries are simply not there to be found —
  // which is kinder than a locked door: there is nothing to fail at.
  const gaps = [gap('s')];                                  // out to the world
  gaps.push(gap('w'));                                      // Spoke A, always
  if (stage >= 1) { gaps.push(gap('e')); gaps.push(gap('n', DOOR_HALF, -9)); }
  if (stage >= 3) gaps.push(gap('n', BOSS_DOOR_HALF, 9));   // the hand-ramp

  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -8, z: 8, r: 4.5, kind: 'gravel' }, { x: 12, z: 9, r: 4.5, kind: 'rubble' },
              { x: -13, z: -6, r: 4.5, kind: 'water' }, { x: 9, z: -11, r: 4, kind: 'gravel' },
              { x: 0, z: -10, r: 5.5, kind: 'rubble' }],
    // THE WORN PATH MUST NOT LIE. It used to run straight down the middle and
    // straight into the pool, which is the floor of the room telling a child to
    // walk somewhere they cannot. It forks around the water now, both ways, and
    // meets again at the Titan's feet.
    paths: [[[0, 14], [0, 8], [-8, 5], [-9, -6], [0, -10], [0, -14]],
            [[0, 8], [8, 5], [9, -6], [0, -10]],
            [[-8, 4], [-13, 1], [-18, 0]], [[8, 4], [13, 1], [18, 0]]],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };

  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: 7.4, angle: Math.PI });
  sideDoor(world, 'w', halfW, halfD, 'vga', { x: 5.4, z: 0, angle: -Math.PI / 2 });
  if (stage >= 1) {
    sideDoor(world, 'e', halfW, halfD, 'vgb', { x: -5.4, z: 0, angle: Math.PI / 2 });
    sideDoor(world, 'n', halfW, halfD, 'vgc', { x: 0, z: 3.2, angle: Math.PI }, { centre: -9 });
  }
  if (stage >= 3) {
    sideDoor(world, 'n', halfW, halfD, 'vz', { x: 0, z: 9.5, angle: Math.PI },
      { centre: 9, half: BOSS_DOOR_HALF });
  }
  // THE CRYPT GATE, AND IT IS THERE FROM THE FIRST VISIT.
  //
  // Dad: "make them a intimadatingly big door that opens up infront of the user
  // when they unlock it." A gate that only appears once it is already open has
  // no ceremony in it — the moment is the OPENING, and you cannot have that
  // moment unless the child has walked past the shut thing wondering about it.
  //
  // So it stands in the north wall from the first time a child enters the
  // vault, twice their height and closed, with nothing behind it. The hand
  // comes down, the wall opens, and this swings back while they watch.
  if (!GREY()) {
    bossGate(world, 9, -halfD, 0, caveKit.archDoor, D.wallTint,
      { open: stage >= 3, portal: 0x8f7bff, height: 3.4, halfGap: BOSS_DOOR_HALF });
  }

  // ▲ THE STONE TITAN, slumped against the north wall. The level's anchor.
  heroProp(world, 0, -11.5, 'titan', D);
  world.markers.heroSpot = { x: 0, z: -11.5 };

  // --- CHANGE 1: the lantern -----------------------------------------------
  world.markers.lanternSpot = { x: 3.6, z: -7.4 };
  if (stage >= 1) {
    const lamp = new THREE.PointLight(0xffc46a, 16, 34, 1.7);
    lamp.position.set(3.6, 3.2, -7.4);
    world.add(lamp);
    if (!GREY()) {
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc46a, emissiveIntensity: 2.6, roughness: 1 })
      );
      glow.position.set(3.6, 3.0, -7.4);
      world.add(glow);
      world.keepLoose(glow);
      world.onAnimate((t) => { glow.material.emissiveIntensity = 2.2 + Math.sin(t * 2.1) * 0.5; });
    }
    world.lightScale = 1.0;
  } else {
    // near-dark. NOT a dark zone — a child must still be able to walk out.
    world.lightScale = 0.5;
  }

  // --- CHANGE 2: the sunken ring -------------------------------------------
  // A ring of floor at the vault's centre. Flooded, it is impassable and you
  // can SEE the door and the chest through the water; drained, it is a place.
  //
  // IT USED TO START HALF A METRE FROM THE CHILD'S FEET. Dad, twice: "There is
  // a puddle of water with a character and a chest in the centre that you are
  // unable to get to", then "you still walk into the first room with the water
  // and an unreachable character and chest."
  //
  // He was not describing a puzzle he had not solved. He was describing the
  // FIRST ROOM OF THE REGION being a wall: the door drops you at (0,10), the
  // water began at 9.5, and the worn path painted on the floor ran straight
  // into it. A promise you cannot walk around is indistinguishable from a bug,
  // and the Titan — the room's whole anchor — sat on the far side of it.
  //
  // Pulled back to the middle and shrunk, so arriving in the Great Vault means
  // arriving in a room: five metres of open floor ahead, twelve either side,
  // and the pool is a thing across the way rather than a thing in your face.
  const RING = { x: 0, z: -1, r: 6.0 };
  world.markers.ringSpot = { x: RING.x, z: RING.z };
  if (stage < 2) {
    if (GREY()) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(RING.r, 28),
        new THREE.MeshStandardMaterial({ color: 0x2b6c78, transparent: true, opacity: 0.6,
          emissive: 0x2b6c78, emissiveIntensity: 0.3, roughness: 0.4 })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(RING.x, world.deckY + 0.12, RING.z);
      world.add(disc);
    } else {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(RING.r, 32),
        new THREE.MeshStandardMaterial({ color: 0x143c44, transparent: true, opacity: 0.72,
          emissive: 0x1d5b66, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.1 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(RING.x, world.deckY + 0.14, RING.z);
      world.add(water);
      world.keepLoose(water);
      world.onAnimate((t) => { water.position.y = world.deckY + 0.14 + Math.sin(t * 0.9) * 0.03; });
    }
    world.addCircle(RING.x, RING.z, RING.r);   // you cannot swim
    // THE PROMISE: the reward is plainly visible through the water
    visibleReward(world, RING.x, RING.z - 3.2, 'l2_vault_sunken', { shards: 26, heartPiece: 1 }, 'gold');
    world.markers.underwaterPromise = { x: RING.x, z: RING.z - 3.2 };
    // AND THE THING THAT LETS IT OUT, ON THE NEAR RIM WHERE YOU ARRIVE.
    //
    // Water you cannot cross reads as a wall. Water with a shut sluice gate in
    // it reads as water that opens — same geometry, completely different
    // sentence, and it is the difference between "this level is broken" and
    // "I'll come back". The gate is carved stone, it is lit, and it stands on
    // the rim a child walks up to first.
    world.markers.sluiceSpot = { x: RING.x, z: RING.z + RING.r - 0.4 };
    if (!GREY()) {
      const gate = tinted(caveKit.archDoor, 'sluice', 0x7f8894);
      gate.position.set(RING.x, 0, RING.z + RING.r - 0.4);
      gate.scale.setScalar(1.1);
      world.add(gate);
    }
    const seal = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ color: 0x59d6e4, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide })
    );
    seal.position.set(RING.x, 1.3, RING.z + RING.r - 0.35);
    world.add(seal);
    world.keepLoose(seal);
    world.onAnimate((t) => { seal.material.opacity = 0.22 + Math.sin(t * 1.7) * 0.09; });
  } else {
    // drained: walkable mud, and glowing mushrooms bloom in the wet
    if (!GREY()) {
      const mud = new THREE.Mesh(
        new THREE.CircleGeometry(RING.r, 32),
        new THREE.MeshStandardMaterial({ color: 0x4a4535, roughness: 1 })
      );
      mud.rotation.x = -Math.PI / 2;
      mud.position.set(RING.x, world.deckY + 0.03, RING.z);
      world.add(mud);
      const caps = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.26, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9ff0c8, emissiveIntensity: 1.6, roughness: 1 }),
        14
      );
      const dm = new THREE.Object3D();
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39, rr = 1.6 + (i % 5) * 1.05;
        dm.position.set(RING.x + Math.cos(a) * rr, 0.3, RING.z + Math.sin(a) * rr);
        dm.updateMatrix();
        caps.setMatrixAt(i, dm.matrix);
      }
      world.add(caps);
      world.keepLoose(caps);
    }
    visibleReward(world, RING.x, RING.z - 3.2, 'l2_vault_sunken', { shards: 26, heartPiece: 1 }, 'gold');
  }

  // --- CHANGE 3: the hand lowers into a ramp -------------------------------
  if (stage >= 3) {
    world.markers.rampSpot = { x: 9, z: -11 };
    if (GREY()) {
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.5, 6),
        protoMaterial(0xb9a27a, 5, 6)
      );
      ramp.position.set(9, 0.25, -11);
      world.add(ramp);
    } else {
      for (let i = 0; i < 4; i++) {
        const st = tinted(caveKit.stairs, 'ramp', 0x8d8f94);
        st.position.set(9, 0, -9.2 - i * 1.5);
        st.scale.setScalar(2.0);
        world.add(st);
      }
    }
  }

  // Cracked piles in the hub itself — the shape of the promise, seen early and
  // often, so the Earth Wolf's first real use has a home to come back to.
  crackedPile(world, 'l2_vh_a', -12, -4);
  crackedPile(world, 'l2_vh_b', 13, -6);

  world.markers.restSpot = { x: -8, z: 8 };     // Old Bram's camp
  // THE GREAT VAULT. Something enormous was carved here a very long time ago
  // and the dark has been sitting on it since. Old Bram's camp is the only WARM
  // thing in the room and it needs cold to read against — so the vault gets the
  // diggers' abandoned workings: their stores, their fallen scaffold, and the
  // shrine they cut into the rock before the work stopped.
  world.markers.breakables = [
    { x: -10.5, z: 8.5, kind: 'cask' }, { x: -14, z: 12, kind: 'crate' },
    { x: 11, z: 10, kind: 'jar' }, { x: 16, z: 5, kind: 'barrel' },
    { x: -3, z: 12, kind: 'box' },
  ];
  world.markers.hubStage = stage;               // for the headless verifier
  scatter(world, halfW, halfD, D, 71, 8, { spin: 0 });   // fitted masonry: no free rotation
  coldHearth(world, -8, 6.6, D);                          // Bram's own fire
  cartWreck(world, -12.5, 10, 0.7, D);
  wayshrine(world, 14.5, -4, -Math.PI / 2 + 0.2, D);
  fallenColumn(world, -15.5, 2, 0.4, D, 4.4);
  fallenColumn(world, 15, 8, -1.3, D, 3.8);
  ruinedHome(world, 13, 12, -0.5, D, { w: 6, d: 4.5, keep: 0.4, door: false });
  lowWall(world, -5, -4.5, 0.3, D, 3.4);
  lowWall(world, 6, -3, -0.9, D, 3.0);
  rubbleField(world, -16, -10, 3.2, D, 15);
  rubbleField(world, 16.5, -11, 3.0, D, 13);
  rubbleField(world, 4, 12.5, 2.8, D, 12);
  aftermath(world, -13, -8, 2.2, D, 21);
  // WHAT YOU SEE ON ARRIVAL. vh spawns at (0,10) facing the whole 36x28 vault,
  // and the first dressed pass put every cluster on the perimeter — so the band
  // the camera actually shows came out under the density floor. These sit in
  // it, off the central route, which stays clear because three spokes and the
  // crypt all lead off this room.
  cartWreck(world, -6.5, 6, 0.4, D);
  cartWreck(world, 7, 8.5, -0.7, D);
  fallenColumn(world, -9.5, 11, 0.9, D, 3.2);
  fallenColumn(world, 9, 12, -0.5, D, 3.0);
  rubbleField(world, -4, 9.5, 2.6, D, 11);
  rubbleField(world, 5, 11.5, 2.4, D, 10);
  aftermath(world, 3, 7, 1.8, D, 39);
  return finish(world, spec, D);
}

// ===========================================================================
// SPOKE A — THE GLIMMERWAY (cyan, cold sparkle). Forced first: the only door.
// ===========================================================================
export async function buildVga(scene) {
  const { world, spec, D } = base(scene, 'vga');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 2.6, kind: 'gravel' }, { x: 4, z: -3, r: 2.2, kind: 'water' }],
    pathWidth: 2.4,
  });
  world.spawn = { x: 5.4, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'vh', { x: -15.4, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'va1', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  // THE CRYSTAL MOUTH. The chokes shipped as bare 14x10 boxes with two doors
  // and nothing else. Down here they are where the diggers stopped for breath.
  world.markers.breakables = [{ x: 2.6, z: -1.4, kind: 'box' }, { x: -2.4, z: 2.2, kind: 'vase' }];
  // AND SOMETHING LIVING IN IT. Dad, from play: "rocks everywhere nothing to do
  // throught the level." He was not exaggerating — the vault and all three of
  // its mouths held no creature at all, so the spine of the region, the rooms a
  // child crosses most often, were scenery with a door at each end. Two natives
  // apiece: enough that walking in is an event, few enough that a room you cross
  // six times never becomes a toll gate.
  world.markers.batSpots = [{ x: -3.4, z: -2.2 }, { x: 3.8, z: 2.6 }];
  world.markers.restSpot = { x: 0, z: 0 };
  coldHearth(world, 0, 1.2, D);
  fallenColumn(world, -4.4, -2.4, 0.5, D, 2.4);
  rubbleField(world, 4.6, -2.6, 2.2, D, 11);
  rubbleField(world, -4.4, 2.8, 2.0, D, 9);
  aftermath(world, 3, 2.4, 1.6, D, 22);
  return finish(world, spec, D);
}

export async function buildVa1(scene) {
  const { world, spec, D } = base(scene, 'va1');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: -11, z: -7, r: 4.5, kind: 'gravel' }, { x: 9, z: 6, r: 4.2, kind: 'water' },
              { x: -6, z: 8, r: 4.0, kind: 'rubble' }, { x: 12, z: -8, r: 3.6, kind: 'gravel' }],
    paths: [[[16, 0], [6, 2], [-4, 1], [-16, 0]]],
  });
  world.spawn = { x: 13.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'vga', { x: -5.4, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'va2', { x: 13.5, z: 0, angle: -Math.PI / 2 });

  // the crystal narrows: an L of rock splitting the island into two reads
  wallRun(world, 4, -3, 4, 7, D);
  wallRun(world, -6, -3, 4, -3, D);
  world.markers.slimeSpots = [{ x: -3, z: 4 }, { x: 8, z: -6 }];
  // a cracked pile you meet BEFORE you have the tool — the promise, in situ
  crackedPile(world, 'l2_va1_a', -11, -7);
  visibleReward(world, -13.5, -7, 'l2_va1_crack', { shards: 16 });
  // THE GLIMMERWAY. The first cut, and the widest — the diggers worked this
  // seam long enough to build in it. Scaffold, stores, and the shrine at the
  // turn. The crystal light is cold, so everything it lands on is cold too.
  world.markers.breakables = [
    { x: -9, z: 5, kind: 'barrel' }, { x: -13, z: 9, kind: 'box' },
    { x: 8, z: 10, kind: 'vase' }, { x: 14, z: -3, kind: 'cask' },
  ];
  ruinedHome(world, -11, 7, -0.4, D, { w: 6, d: 4.5, keep: 0.5, door: false });
  fallenColumn(world, 11, -7.5, 0.8, D, 4.0);
  fallenColumn(world, -13, 3, -1.1, D, 3.4);
  cartWreck(world, 6, 8.5, 0.6, D);
  wayshrine(world, 12.5, 4, Math.PI - 0.4, D);
  lowWall(world, 0, 6, 0.4, D, 3.2);
  rubbleField(world, 14, 10, 3.0, D, 13);
  rubbleField(world, -8, -10.5, 2.8, D, 12);
  rubbleField(world, 3, -9, 2.6, D, 11);
  aftermath(world, -10, 6, 2.0, D, 25);
  scatter(world, halfW, halfD, D, 81, 6, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLB', 'column'] });
  return finish(world, spec, D);
}

export async function buildVa2(scene) {
  const { world, spec, D } = base(scene, 'va2');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w'), gap('n')], D, {
    patches: [{ x: -9, z: -8, r: 5.5, kind: 'gravel' }, { x: 10, z: 7, r: 4.2, kind: 'rubble' },
              { x: -12, z: 6, r: 4.0, kind: 'water' }, { x: 6, z: -9, r: 3.8, kind: 'gravel' }],
    paths: [[[16, 0], [5, -1], [-5, 1], [-16, 0]], [[0, 1], [0, -8], [0, -13]]],
  });
  world.spawn = { x: 13.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'va1', { x: -13.5, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'va3', { x: 7.5, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'vap', { x: 0, z: 5.5, angle: Math.PI });

  heroProp(world, -9, -8, 'geode', D);          // ▲ THE GEODE
  world.markers.heroSpot = { x: -9, z: -8 };
  world.markers.batSpots = [{ x: 4, z: -6 }, { x: -3, z: 3 }];
  world.markers.spitterSpots = [{ x: 2.6, z: 1.5 }];

  // Optional practice, NOT the teach step (that is vb1, which cannot be
  // skipped). A child who walks back out through here instead of taking the
  // shrine's shortcut gets paid for it: three piles they watched go by on the
  // way in, now breakable.
  world.markers.practiceCracks = [{ x: 6, z: 5 }, { x: -2, z: 7 }, { x: 10, z: -2 }];
  for (const [i, p] of world.markers.practiceCracks.entries()) crackedPile(world, `l2_va2_${i}`, p.x, p.z);
  // THE GEODE. The room the whole seam was chasing — and the practice cracks
  // sit in the open on purpose, so the dressing is pushed to the walls and the
  // three of them stay the most obvious thing in the room.
  world.markers.breakables = [
    { x: -11, z: 6, kind: 'box' }, { x: 14, z: 7, kind: 'barrel' },
    { x: -8, z: -11, kind: 'jar' }, { x: 9, z: -11, kind: 'crate' },
  ];
  ruinedHome(world, -13, 8, 0.5, D, { w: 5.5, d: 4.5, keep: 0.45, door: false });
  fallenColumn(world, 13, -6, -0.9, D, 4.2);
  fallenColumn(world, -14, -3, 0.6, D, 3.4);
  cartWreck(world, 12, 9.5, -0.6, D);
  rubbleField(world, -6, 11, 2.8, D, 12);
  rubbleField(world, 15, 2, 2.6, D, 11);
  rubbleField(world, -2, -11, 2.8, D, 12);
  aftermath(world, -12, 7, 2.0, D, 26);
  scatter(world, halfW, halfD, D, 82, 7, { spin: 1, kinds: ['rockSA', 'rockLC', 'column2', 'brick'] });
  return finish(world, spec, D);
}

export async function buildVap(scene) {
  const { world, spec, D } = base(scene, 'vap');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: -5, z: 4, r: 3.4, kind: 'water' }, { x: 6, z: -4, r: 3.2, kind: 'gravel' },
              { x: 0, z: 0, r: 3.0, kind: 'rubble' }],
    paths: [[[0, 8], [-1, 1], [3, -3], [7, -4]]],
  });
  world.spawn = { x: 0, z: 5.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'va2', { x: 0, z: -10.5, angle: 0 });   // LOOPS BACK
  wallRun(world, -5, -2, 3, -2, D);
  world.markers.pup4Spot = { x: 6, z: -4 };
  world.markers.slimeSpots = [{ x: -4, z: 3 }];
  // GLITTER POCKET: a seam so rich they camped in it rather than walk out
  world.markers.breakables = [
    { x: -8, z: 1.5, kind: 'box' }, { x: 3, z: 5.5, kind: 'barrel' }, { x: 8, z: -6, kind: 'jar' },
  ];
  coldHearth(world, -7, -4, D);
  cartWreck(world, 6.5, 4.5, 0.8, D);
  rubbleField(world, -3, 6, 2.6, D, 11);
  rubbleField(world, 8, 1, 2.4, D, 10);
  aftermath(world, -6, -3, 1.8, D, 29);
  scatter(world, halfW, halfD, D, 83, 5, { spin: 1, kinds: ['rockSB', 'rockSA'] });
  return finish(world, spec, D);
}

// PETRA'S SPARK — the shrine. TEACH 1: INTRODUCE. One pile, no enemies, no
// timer, nothing else in the room to do.
export async function buildVa3(scene) {
  const { world, spec, D } = base(scene, 'va3');
  // THE SHRINE STANDS IN THE DOORWAY OF THE ROUTE, AND BOTH DOORS ARE OPEN.
  //
  // Dad, from play, twice: "the rooms loop back to the start and there's nothing
  // you can do", then "the rooms just end suddenly". Those are the same room and
  // they are the two halves of one mistake.
  //
  // Everything in Stoneroot hangs off ONE grant: Petra's spark, here. Until it
  // lands the hub has a single spoke and the crypt does not exist — so a child
  // who crosses this room without touching the shrine is locked into a loop with
  // no boss and no way to know what they missed. The first fix was to take the
  // far door away until the spark was earned, which stopped the loop and bought
  // a dead end instead: walk in, see a wall, walk out.
  //
  // Neither door was ever the problem. The SHRINE WAS FOUR UNITS OFF THE PATH,
  // and it was an unlit grey pedestal in a grey cave. The Wild Woods' shrine has
  // always been placed correctly — spawn, shrine, exit, in a line — so this is
  // that layout, with the light the Woods gets for free from its own kit. You
  // cannot cross this room without walking into it.
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 4.6, kind: 'gravel' }, { x: -7, z: 5, r: 2.8, kind: 'water' },
              { x: 7, z: 5, r: 2.8, kind: 'rubble' }],
    paths: [[[14, 0], [4, 0], [-4, 0], [-14, 0]]],
  });
  world.spawn = { x: 7.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'va2', { x: -13.5, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'vh', { x: -13, z: -9, angle: Math.PI / 2 });

  world.markers.shrineSpot = { x: 0, z: 0 };
  world.markers.sparkSpot = { x: 0, z: 0, spirit: 'petra', grants: 'earth_wolf' };
  world.markers.teachCrack = { x: 0, z: 4 };
  crackedPile(world, 'l2_va3_teach', 0, 4, true);
  if (!GREY()) {
    // 0.55, NOT 2.2. Pedestal.glb is 2.19m tall in its own units, so this
    // altar was rendering FOUR AND A HALF METRES HIGH — taller than the cavern
    // wall, wider than the doorway, and it swallowed everything placed on it.
    // Every other pedestal in the game is set around 0.7; this one was never
    // looked at from the game's own camera.
    const ped = tinted(caveKit.pedestal, 'shrine', 0xb6c8cf);
    ped.position.set(0, 0, 0);
    ped.scale.setScalar(0.55);
    world.add(ped);
  }
  world.addCircle(0, 0, 0.9);         // the stone is solid in greybox too
  spiritShrine(world, 0, 0, 0xd8b06a, 1.25);
  // PETRA'S SPARK is a GRANT room: the shrine at the centre and the teach crack
  // just behind it are the only two things a child must find, so this one is
  // dressed at the walls and nowhere else. Ceremony needs an empty middle.
  world.markers.breakables = [{ x: -8.5, z: 3, kind: 'vase' }, { x: 8.5, z: 3, kind: 'jar' }];
  fallenColumn(world, -8, -5, 0.5, D, 2.6);
  fallenColumn(world, 8, -5, -0.5, D, 2.6);
  rubbleField(world, -8, 5.5, 2.4, D, 10);
  rubbleField(world, 8, 5.5, 2.4, D, 10);
  aftermath(world, 0, 6, 1.8, D, 33);
  return finish(world, spec, D);
}

// ===========================================================================
// SPOKE B — THE BONE QUARRY (bone white + tan dust).
// ===========================================================================
export async function buildVgb(scene) {
  const { world, spec, D } = base(scene, 'vgb');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 2.6, kind: 'rubble' }, { x: 4, z: -3, r: 2.2, kind: 'gravel' }],
    pathWidth: 2.4,
  });
  world.spawn = { x: -5.4, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vh', { x: 15.4, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'vb1', { x: -13.5, z: 0, angle: Math.PI / 2 });
  // THE CHALK MOUTH — the quarry's own doorway, and the last dry rest
  world.markers.breakables = [{ x: -2.4, z: -1.6, kind: 'barrel' }, { x: 2.2, z: 2.4, kind: 'jar' }];
  world.markers.slimeSpots = [{ x: -3.6, z: 2.4 }, { x: 3.4, z: -2.6 }];
  world.markers.restSpot = { x: 0, z: 0 };
  wayshrine(world, 4.4, -2.4, -0.5, D);
  coldHearth(world, -3.8, 1.4, D);
  rubbleField(world, -4.6, -2.8, 2.2, D, 11);
  rubbleField(world, 4.4, 2.8, 2.0, D, 9);
  aftermath(world, 0, 2.6, 1.6, D, 23);
  return finish(world, spec, D);
}

export async function buildVb1(scene) {
  const { world, spec, D } = base(scene, 'vb1');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D, {
    patches: [{ x: -9, z: 6, r: 4.5, kind: 'sand' }, { x: 8, z: -7, r: 4.2, kind: 'gravel' },
              { x: -12, z: -8, r: 4.0, kind: 'rubble' }, { x: 12, z: 8, r: 3.8, kind: 'sand' }],
    paths: [[[-16, 0], [-6, -1], [6, 1], [16, 0]]],
  });
  world.spawn = { x: -13.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vgb', { x: 5.4, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'vb2', { x: -13.5, z: 0, angle: Math.PI / 2 });

  // quarried steps: two terraces instead of one flat field
  wallRun(world, -4, 4, 10, 4, D, 1.2);
  wallRun(world, -4, -6, -4, 4, D, 1.2);
  // TEACH 2 — DEVELOP. The same cracked pile, but now a skeleton is standing
  // over it: the verb is known, the timing is not. Enemies only appear once
  // the tool exists, so a first pass through here is not an ambush.
  world.markers.developCracks = [{ x: -9, z: 6 }, { x: 4, z: -6 }];
  for (const [i, p] of world.markers.developCracks.entries()) crackedPile(world, `l2_vb1_${i}`, p.x, p.z);
  world.markers.minionSpots = state.formsUnlocked.includes('earth_wolf')
    ? [{ x: 2, z: -3 }, { x: 8, z: 6 }, { x: -7, z: 5 }]
    : [{ x: 2, z: -3 }, { x: 8, z: 6 }];
  world.markers.spitterSpots = [{ x: -3, z: 1.8 }];
  // THE BONE QUARRY. Cut stone, and what the cutting left. The terraces are
  // the room's shape and the dressing sits off them, so the two levels stay
  // legible from the fixed camera.
  world.markers.breakables = [
    { x: -11, z: -7, kind: 'crate' }, { x: 10, z: 11, kind: 'cask' },
    { x: 14, z: -4, kind: 'vase' }, { x: -3, z: 10, kind: 'box' },
  ];
  fallenColumn(world, -13, 8, 0.7, D, 4.2);
  fallenColumn(world, 12, -8, -1.0, D, 3.8);
  cartWreck(world, -9, -9.5, 0.5, D);
  wayshrine(world, 13.5, 6, Math.PI + 0.4, D);
  ruinedHome(world, 8, 9.5, -0.5, D, { w: 5.5, d: 4, keep: 0.4, door: false });
  rubbleField(world, -15, -2, 3.0, D, 13);
  rubbleField(world, 3, 11, 2.8, D, 12);
  rubbleField(world, 15, 0, 2.6, D, 11);
  aftermath(world, -6, -10, 2.2, D, 27);
  scatter(world, halfW, halfD, D, 91, 7, { spin: 0, kinds: ['brick', 'rockLB', 'rockSA', 'skull'] });
  return finish(world, spec, D);
}

export async function buildVb2(scene) {
  const { world, spec, D } = base(scene, 'vb2');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e'), gap('s')], D, {
    patches: [{ x: 4, z: -8, r: 5.5, kind: 'sand' }, { x: -11, z: 7, r: 4.2, kind: 'rubble' },
              { x: 12, z: 6, r: 4.0, kind: 'gravel' }, { x: -13, z: -6, r: 3.8, kind: 'sand' }],
    paths: [[[-16, 0], [-5, 1], [5, -1], [16, 0]], [[0, -1], [1, 6], [0, 13]]],
  });
  world.spawn = { x: -13.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vb1', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'vb3', { x: -7.5, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 's', halfW, halfD, 'vbp', { x: 0, z: -5.5, angle: 0 });

  heroProp(world, 4, -8, 'ribcage', D);          // ▲ THE RIBCAGE
  world.markers.heroSpot = { x: 4, z: -8 };
  world.markers.shieldSpots = [{ x: -2, z: 2 }];
  world.markers.spitterSpots = [{ x: 4, z: -2.5 }];
  world.markers.minionSpots = [{ x: 9, z: 4 }, { x: -7, z: -4 }];
  crackedPile(world, 'l2_vb2_a', 11, 6);
  // THE RIBCAGE. The deepest the quarry got before something made them stop.
  world.markers.breakables = [
    { x: -10, z: 6, kind: 'cask' }, { x: 13, z: 11, kind: 'crate' },
    { x: -14, z: 5, kind: 'jar' }, { x: 6, z: 11, kind: 'barrel' },
  ];
  ruinedHome(world, -12, 8, 0.4, D, { w: 6, d: 4.5, keep: 0.35, door: false });
  fallenColumn(world, 13, -7, -0.8, D, 4.0);
  fallenColumn(world, -14, 2, 1.2, D, 3.4);
  cartWreck(world, 11, 9, 0.7, D);
  lowWall(world, -6, 5.5, -0.3, D, 3.2);
  rubbleField(world, -15, -9, 3.0, D, 13);
  rubbleField(world, 15, 2, 2.8, D, 12);
  rubbleField(world, -3, 11.5, 2.6, D, 11);
  aftermath(world, -10, 7, 2.0, D, 28);
  scatter(world, halfW, halfD, D, 92, 7, { spin: 0, kinds: ['brick', 'skull', 'rockSB', 'column'] });
  return finish(world, spec, D);
}

export async function buildVbp(scene) {
  const { world, spec, D } = base(scene, 'vbp');
  const { halfW, halfD } = shell(world, spec, [gap('n')], D, {
    patches: [{ x: 6, z: 4, r: 3.4, kind: 'sand' }, { x: -6, z: -3, r: 3.2, kind: 'rubble' },
              { x: 0, z: 2, r: 3.0, kind: 'gravel' }],
    paths: [[[0, -8], [-1, -1], [3, 3], [6, 4]]],
  });
  world.spawn = { x: 0, z: -5.5, angle: Math.PI };
  sideDoor(world, 'n', halfW, halfD, 'vb2', { x: 0, z: 10.5, angle: Math.PI });  // LOOPS BACK
  wallRun(world, -6, 1, 2, 1, D);
  visibleReward(world, 6, 4, 'l2_vbp_chest', { shards: 22, gear: 'sword_c' });
  world.markers.minionSpots = [{ x: -4, z: -3 }];
  // THE CHALK SEAM: a dead end they worked out and abandoned
  world.markers.breakables = [
    // The vase was at z 6.5, which is inside the 2.5u BLIND STRIP against the
    // room's south edge — the band a child cannot see from where the camera
    // sits, so a breakable there is a breakable nobody knows is there. Pulled
    // in to z 4.6, which clears it with room to spare.
    { x: -8.5, z: 1, kind: 'barrel' }, { x: 2, z: -6, kind: 'box' }, { x: 8, z: 4.6, kind: 'vase' },
  ];
  fallenColumn(world, -7, 4, 0.6, D, 3.0);
  cartWreck(world, -6.5, -5, 1.1, D);
  rubbleField(world, 7, -4, 2.6, D, 11);
  rubbleField(world, -2, 6.5, 2.4, D, 10);
  aftermath(world, 4, -5, 1.8, D, 30);
  scatter(world, halfW, halfD, D, 93, 5, { spin: 0, kinds: ['brick', 'skull'] });
  return finish(world, spec, D);
}

// THE RATTLE — the one puzzle room, and TEACH 3: THE TWIST.
//
// It is on the SPINE, not in an optional pocket. The docs' bubble diagram has
// it dotted, but the twist is the level's whole idea — a child who never finds
// out that the stomp is a SOUND has been taught three quarters of an ability.
// Putting it on Spoke B's critical path also lets the puzzle BE the spoke's
// payoff: ringing the chamber cracks the dam, and the dam draining is hub
// change 2. One room, one idea, one consequence.
export async function buildVb3(scene) {
  const { world, spec, D } = base(scene, 'vb3');
  // BOTH DOORS, ALWAYS — see buildVa3 for why the earned-shortcut was the wrong
  // fix. The plate sits on the line between them instead, so the way across the
  // room runs over the one thing in it.
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D, {
    patches: [{ x: 0, z: 0, r: 3.6, kind: 'sand' }, { x: 0, z: -6, r: 4.0, kind: 'water' },
              { x: -8, z: 5, r: 2.8, kind: 'rubble' }, { x: 8, z: 5, r: 2.8, kind: 'gravel' }],
    paths: [[[-14, 0], [-4, 0], [0, 0], [4, 0], [14, 0]], [[0, 0], [4, -2], [7, -5]]],
  });
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vb2', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'vh', { x: 13, z: -9, angle: -Math.PI / 2 });

  // The resonant plate: stomp HERE and the whole chamber answers.
  world.markers.rattlePlate = { x: 0, z: 0 };
  // What answers: stalactites drop on whatever stands beneath them...
  world.markers.stalactiteSpots = [{ x: -5, z: -2 }, { x: 0, z: -4 }, { x: 5, z: -2 }];
  world.markers.spitterSpots = [{ x: 2.8, z: 2.6 }];
  // ...and a bell-stone you cannot see from the plate rings, opening the dam.
  world.markers.bellStone = { x: 7, z: -5 };
  world.markers.damSpot = { x: 0, z: -6 };
  // THE RATTLE is Stoneroot's PUZZLE ROOM, and the same law as Ember's ld1
  // applies: the plate, the three stalactites and the bell-stone are the whole
  // mechanic, so this room is dressed at the WALLS and nowhere near them.
  // Clutter here would compete with the exact things a child has to spot.
  world.markers.breakables = [{ x: -9, z: 1.5, kind: 'crate' }, { x: 9, z: 1.5, kind: 'jar' }];
  world.markers.minionSpots = [{ x: -5, z: -2 }, { x: 5, z: -2 }];
  fallenColumn(world, -8.5, -5, 0.5, D, 2.6);
  fallenColumn(world, 8.5, 4.5, -0.8, D, 2.6);
  rubbleField(world, -8.5, 5.5, 2.4, D, 10);
  rubbleField(world, 8.5, -6, 2.2, D, 9);
  aftermath(world, -6, 6, 1.8, D, 38);

  if (GREY()) {
    // the plate, the three drop zones and the bell, all readable as shapes
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.18, 20),
      protoMaterial(0xffd54a, 3, 3)
    );
    plate.position.set(0, world.deckY + 0.09, 0);
    world.add(plate);
    for (const s of world.markers.stalactiteSpots) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 8), protoMaterial(0xc8bda0, 2, 2));
      c.position.set(s.x, 4.6, s.z);
      c.rotation.z = Math.PI;
      world.add(c);
    }
  } else {
    const plate = tinted(caveKit.pedestal, 'rattlePlate', 0xd8c78a);
    plate.position.set(0, 0, 0);
    plate.scale.set(2.4, 0.5, 2.4);
    world.add(plate);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.9, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, world.deckY + 0.05, 0);
    world.add(ring);
    for (const s of world.markers.stalactiteSpots) {
      const c = tinted(caveKit.column, 'stal', 0xc8bda0);
      c.position.set(s.x, 5.4, s.z);
      c.rotation.z = Math.PI;
      c.scale.setScalar(1.6);
      world.add(c);
    }
    const bell = tinted(caveKit.rockLA, 'bell', 0xb9a880);
    bell.position.set(7, 0, -5);
    bell.scale.setScalar(1.6);
    world.add(bell);
    world.addCircle(7, -5, 1.0);
  }
  return finish(world, spec, D);
}

// ===========================================================================
// SPOKE C — THE SUNKEN STAIR (deep blue-green, wet).
// ===========================================================================
export async function buildVgc(scene) {
  const { world, spec, D } = base(scene, 'vgc');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 2.6, kind: 'water' }, { x: 4, z: -3, r: 2.2, kind: 'mud' }],
    pathWidth: 2.4,
  });
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vh', { x: -9, z: -10.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'vc1', { x: 0, z: 10.5, angle: Math.PI });
  // THE WET MOUTH. Past here the workings flooded, and the props say so before
  // the floor colour does: everything left standing on this side is stained.
  world.markers.breakables = [{ x: 2.8, z: -1.2, kind: 'vase' }, { x: -2.2, z: 2.4, kind: 'box' }];
  world.markers.slimeSpots = [{ x: -3.8, z: -2.4 }, { x: 3.2, z: 2.8 }];
  world.markers.restSpot = { x: 0, z: 0 };
  coldHearth(world, -3.6, -1.6, D);
  fallenColumn(world, 4.2, 2.2, 1.1, D, 2.4);
  rubbleField(world, -4.6, 2.6, 2.2, D, 11);
  rubbleField(world, 4.4, -2.8, 2.0, D, 9);
  aftermath(world, 1.5, 2.6, 1.6, D, 24);
  return finish(world, spec, D);
}

export async function buildVc1(scene) {
  const { world, spec, D } = base(scene, 'vc1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -10, z: 7, r: 4.5, kind: 'water' }, { x: 9, z: -8, r: 4.2, kind: 'mud' },
              { x: 12, z: 8, r: 4.0, kind: 'water' }, { x: -13, z: -6, r: 3.8, kind: 'gravel' }],
    paths: [[[0, 13], [-2, 5], [1, -2], [0, -13]]],
  });
  world.spawn = { x: 0, z: 10.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vgc', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'vc2', { x: 0, z: 10.5, angle: Math.PI });

  // the stair: three terraces stepping down, broken so the route zig-zags
  wallRun(world, -14, 3, 3, 3, D, 1.2);
  wallRun(world, 7, 3, 14, 3, D, 1.2);
  wallRun(world, -14, -4, 6, -4, D, 1.2);
  // ONE shield-bearer, not two. Measured: a SkeletonShield is ~16 draw calls
  // (body, shield and blade, each redrawn for the shadow map), and two of them
  // plus a slime put this room at 106 of a 100-call ceiling. It is also the
  // better fight — two raised shields at once is a wall for a five-year-old,
  // where a shield plus a minion teaches "deal with the one you can hurt".
  world.markers.shieldSpots = [{ x: 5, z: 6 }];
  world.markers.spitterSpots = [{ x: -2.6, z: 2.2 }];
  world.markers.minionSpots = [{ x: -6, z: -1 }];
  // and no third body. Dropping one shield-bearer took this room 106 -> 102,
  // still over; a character costs far more than the room's own geometry here
  // (43 of the original 106 was three of them). Two enemies on a three-terrace
  // stair is the right fight anyway — the stair IS the difficulty.
  // THE SUNKEN STAIR. Three terraces, and the water has been finding its way
  // down them for a very long time. Everything here is stained, slumped or
  // floated out of place — but nothing is on the terrace edges, which are the
  // room's whole readability from a fixed camera.
  world.markers.breakables = [
    { x: -14, z: 4, kind: 'vase' }, { x: 12, z: 10, kind: 'box' },
    { x: -6, z: 11, kind: 'barrel' }, { x: 8, z: -12, kind: 'jar' },
  ];
  fallenColumn(world, -13, 9, 0.5, D, 3.8);
  fallenColumn(world, 13, 6, -1.1, D, 3.4);
  ruinedHome(world, -12, -8, 0.7, D, { w: 5.5, d: 4, keep: 0.35, door: false });
  cartWreck(world, 10, -10, 0.9, D);
  rubbleField(world, 15, -2, 2.8, D, 12);
  rubbleField(world, -15, 1, 2.6, D, 11);
  rubbleField(world, 2, 11.5, 2.6, D, 11);
  aftermath(world, -10, -7, 2.0, D, 31);
  // same fix as the vault: the arrival band was empty because the terraces
  // pushed everything to the walls. Nothing here sits ON a terrace edge, which
  // is what makes the three levels readable from a fixed camera.
  cartWreck(world, -6, 9.5, 0.6, D);
  fallenColumn(world, 6.5, 10.5, -0.8, D, 3.0);
  rubbleField(world, -3, 7.5, 2.4, D, 10);
  rubbleField(world, 4, 11.5, 2.4, D, 10);
  aftermath(world, -7, 6, 1.8, D, 40);
  scatter(world, halfW, halfD, D, 101, 6, { spin: 1, kinds: ['rockSA', 'rockLB', 'column2'] });
  return finish(world, spec, D);
}

export async function buildVc2(scene) {
  const { world, spec, D } = base(scene, 'vc2');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('e')], D, {
    patches: [{ x: -8, z: -7, r: 5.0, kind: 'water' }, { x: 10, z: 7, r: 4.2, kind: 'mud' },
              { x: -12, z: 6, r: 4.0, kind: 'moss' }, { x: 6, z: -10, r: 3.6, kind: 'water' }],
    paths: [[[0, 13], [-2, 4], [0, -4], [0, -13]], [[1, -3], [6, -3], [10, -3]]],
  });
  world.spawn = { x: 0, z: 10.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vc1', { x: 0, z: -10.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'vc3', { x: 0, z: 5.5, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'vcp', { x: -7.5, z: 0, angle: Math.PI / 2 });

  heroProp(world, -8, -7, 'drownedDoor', D);     // ▲ THE DROWNED DOOR
  world.markers.heroSpot = { x: -8, z: -7 };
  world.markers.shieldSpots = [{ x: 4, z: 2 }];
  world.markers.spitterSpots = [{ x: -3, z: -2.2 }];
  world.markers.batSpots = [{ x: -4, z: 5 }];

  // FORESHADOWED GATE — Level 3's tool, a whole level early. Green and alive
  // in a wet cave: obviously wrong, obviously later, reward plainly visible.
  wallRun(world, 11, -6, 16, -6, D);
  wallRun(world, 11, 0, 16, 0, D);
  promiseGate(world, 11, -3, 2.4, 6, 0x5fae4a, 'THORNS — later', 'rockSB',
              { system: 'cut', id: 'l2_bramble_gate', region: REGION });
  visibleReward(world, 14, -3, 'l2_vc2_bramble', { shards: 24 });
  world.markers.bramblePromise = { x: 11, z: -3 };
  // Where the wet workings meet the first green thing anyone has seen in three
  // rooms — the bramble behind the promise gate. Nothing is placed in the
  // alcove x 11..16, z -6..0: that is the gate's own space and it has to read
  // as the ONLY way to the chest.
  world.markers.breakables = [
    { x: -10, z: 5.5, kind: 'vase' }, { x: 2, z: 11, kind: 'box' },
    { x: -14, z: 10, kind: 'barrel' }, { x: 12, z: 5, kind: 'jar' },
  ];
  ruinedHome(world, -12, 7.5, -0.4, D, { w: 5.5, d: 4.5, keep: 0.35, door: false });
  fallenColumn(world, -13, -6, 0.9, D, 3.6);
  fallenColumn(world, 6, 10.5, -0.6, D, 3.0);
  cartWreck(world, -6, 10, 0.6, D);
  lowWall(world, 3, 5.5, 0.4, D, 3.0);
  rubbleField(world, -15, 0, 2.8, D, 12);
  rubbleField(world, 9, -12, 2.6, D, 11);
  rubbleField(world, 14, 9, 2.6, D, 11);
  aftermath(world, -11, 6, 2.0, D, 32);
  scatter(world, halfW, halfD, D, 102, 6, { spin: 1, kinds: ['rockSB', 'rockLC', 'column', 'brick'] });
  return finish(world, spec, D);
}

export async function buildVcp(scene) {
  const { world, spec, D } = base(scene, 'vcp');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: 6, z: -3, r: 3.4, kind: 'water' }, { x: -5, z: 4, r: 3.2, kind: 'moss' },
              { x: 2, z: 5, r: 2.8, kind: 'mud' }],
    paths: [[[-10, 0], [-3, 2], [3, -1], [6, -3]]],
  });
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  // LANDS ON FLOOR. Checked by verify-reachable's landing sweep — see there for
  // why nothing had ever measured these.
  sideDoor(world, 'w', halfW, halfD, 'vc2', { x: 14.1, z: 1.5, angle: -Math.PI / 2 });  // LOOPS BACK
  wallRun(world, 0, -4, 0, 3, D);
  visibleReward(world, 6, -3, 'l2_vcp_chest', { shards: 20, heartPiece: 1, armour: 'stone' }, 'gold');
  world.markers.slimeSpots = [{ x: 5, z: 4 }];
  // the last dry pocket before the crypt — someone sheltered here and the gold
  // chest is what they were carrying
  world.markers.breakables = [
    { x: -3, z: -5.5, kind: 'crate' }, { x: 8, z: 1, kind: 'cask' }, { x: -1, z: 6, kind: 'vase' },
  ];
  coldHearth(world, -6.5, -4, D);
  cartWreck(world, -7, 4.5, 0.9, D);
  rubbleField(world, 3, -6, 2.6, D, 11);
  rubbleField(world, 8, 5, 2.4, D, 10);
  aftermath(world, -5, -3.5, 1.8, D, 34);
  scatter(world, halfW, halfD, D, 103, 5, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  return finish(world, spec, D);
}

// THE SHOULDER PIN — the last thing holding the titan's arm up.
export async function buildVc3(scene) {
  const { world, spec, D } = base(scene, 'vc3');
  // BOTH DOORS, ALWAYS. The pin-pile sits square in the middle of the only line
  // between them, so it cannot be walked past — which is what the earned
  // shortcut was clumsily trying to guarantee.
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: -3, r: 3.8, kind: 'water' }, { x: -6, z: 4, r: 3.0, kind: 'moss' },
              { x: 6, z: 3, r: 2.8, kind: 'mud' }],
    paths: [[[0, 8], [0, 1], [0, -8]]],
  });
  world.spawn = { x: 0, z: 5.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vc2', { x: 0, z: -10.5, angle: 0 });
  // LANDS IN FRONT OF THE TITAN, NOT INSIDE IT. This shortcut used to put the
  // child down at (0,-11.5) — which is where the Stone Titan's collider moved to
  // when it was slid back to make room for the vault's pool. Arriving inside a
  // statue meant the flood fill for the walk to the crypt began in solid rock,
  // and the only symptom anywhere was the boss becoming unwalkable-to. The spot
  // is clear whether the pool is still flooded or drained.
  sideDoor(world, 'n', halfW, halfD, 'vh', { x: 0, z: -8.4, angle: Math.PI });

  world.markers.pinSpot = { x: 0, z: -3 };
  crackedPile(world, 'l2_vc3_pin', 0, -3, true);
  world.markers.shieldSpots = [{ x: -4, z: 2 }];
  world.markers.breakables = [{ x: -8, z: 1, kind: 'crate' }, { x: 8, z: 1, kind: 'jar' }];
  fallenColumn(world, -7.5, -4.5, 0.6, D, 2.6);
  fallenColumn(world, 7.5, -4.5, -0.6, D, 2.6);
  rubbleField(world, -7.5, 5, 2.4, D, 10);
  rubbleField(world, 7.5, 5, 2.4, D, 10);
  aftermath(world, -4, 6, 1.8, D, 35);
  return finish(world, spec, D);
}

// ===========================================================================
// THE WARDEN'S CRYPT — TEACH 4: CONCLUDE.
// ===========================================================================
export async function buildVz(scene) {
  const { world, spec, D } = base(scene, 'vz');
  const beaten = !!state.flags.wardenDefeated;
  // ONWARD to the Wild Woods once the Warden is down (fix plan A1). Before
  // that the crypt is a dead end on purpose — it is the boss room.
  const gaps = [gap('s', BOSS_DOOR_HALF), ...(beaten ? [gap('n')] : [])];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: -2, r: 7, kind: 'gravel' }, { x: -10, z: 8, r: 3.4, kind: 'rubble' },
              { x: 10, z: 8, r: 3.4, kind: 'rubble' }, { x: 0, z: 10, r: 3.0, kind: 'water' }],
    paths: [[[0, 13], [0, 6]]],
  });
  world.spawn = { x: 0, z: 9.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vh', { x: 9, z: -11.5, angle: 0 }, { half: BOSS_DOOR_HALF });
  if (beaten) sideDoor(world, 'n', halfW, halfD, 't1a', { x: 0, z: 9, angle: Math.PI });

  heroProp(world, 0, -9, 'throne', D);           // ▲ THE WARDEN'S THRONE
  world.markers.heroSpot = { x: 0, z: -9 };
  if (!beaten) world.markers.wardenSpot = { x: 0, z: -2 };
  // The gift is the answer to the boss: his tower shield front-blocks
  // everything, and a stomp at his feet staggers him off his guard.
  world.markers.stompStagger = { x: 0, z: -2 };
  world.markers.petraSpot = { x: 0, z: -9, spirit: 'petra' };
  // A BOSS ARENA IS DRESSED AT THE EDGES ONLY — the Warden's stomp needs a
  // clear floor, and anything you can snag on mid-arena turns a readable dodge
  // into an unfair hit. Same law as Ember's `le`.
  for (const [cx, cz, cr] of [[-11, -9, 0.4], [11, -9, -0.4], [-11.5, 9, 1.2], [11.5, 9, -1.2]]) {
    fallenColumn(world, cx, cz, cr, D, 3.0);
  }
  rubbleField(world, -11.5, 0, 2.6, D, 11);
  rubbleField(world, 11.5, 0, 2.6, D, 11);
  rubbleField(world, 0, -11.5, 2.8, D, 12);
  aftermath(world, -9, -10, 2.0, D, 36);
  aftermath(world, 9, -10, 2.0, D, 37);
  scatter(world, halfW, halfD, D, 111, 6, { spin: 0, kinds: ['column', 'skull', 'brick'] });
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE METRICS ZOO ADDITION — the one new module Level 2 introduces, at true
// scale, next to the island it has to be judged against.
// ---------------------------------------------------------------------------
// Drawn CONCENTRIC with the zoo's 32 x 26 island footprint, because the only
// question worth asking about a new module is "how much bigger does this
// actually feel?" — and the honest answer is a 2 u border you can walk.
export function zooHubModule(world, protoDecal, say) {
  protoDecal(world, 0, -8, 36, 28, 0x7fd8e8, 0.12);
  say(0, 7.4, 'LEVEL 2 HUB MODULE 36 x 28u — the island is drawn inside it', '#7fd8e8');
}

export const LEVEL2_ROOMS = {
  vh: buildVh,
  vga: buildVga, va1: buildVa1, va2: buildVa2, vap: buildVap, va3: buildVa3,
  vgb: buildVgb, vb1: buildVb1, vb2: buildVb2, vbp: buildVbp, vb3: buildVb3,
  vgc: buildVgc, vc1: buildVc1, vc2: buildVc2, vcp: buildVcp, vc3: buildVc3,
  vz: buildVz,
};
