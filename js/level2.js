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
  wallTintMap } from './levelkit.js';
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
  vaultDark:  { tint: 0x6d7480, floorTint: 0x555c68, wallTint: 0x22262e,
                name: 'THE GREAT VAULT', hero: 'THE STONE TITAN' },
  vaultWarm:  { tint: 0xc79a5e, floorTint: 0xb08a55, wallTint: 0x3a2e20,
                name: 'THE GREAT VAULT', hero: 'THE STONE TITAN' },
  glimmer:    { tint: 0x7fd8e8, floorTint: 0xa9c6cf, wallTint: 0x24414d,
                name: 'THE GLIMMERWAY', hero: 'THE GEODE' },
  quarry:     { tint: 0xd8c9a4, floorTint: 0xcabf9d, wallTint: 0x4a4132,
                name: 'THE BONE QUARRY', hero: 'THE RIBCAGE' },
  sunken:     { tint: 0x4e9c96, floorTint: 0x5a8a86, wallTint: 0x1c3a3c,
                name: 'THE SUNKEN STAIR', hero: 'THE DROWNED DOOR' },
  crypt:      { tint: 0x8a8478, floorTint: 0x6a665e, wallTint: 0x1a1a1c,
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
  darkZone, breadcrumbs } = makeBuilders({ kit: () => caveKit, isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

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
  const D = spec.district === 'vault' ? vaultDistrict() : DISTRICTS[spec.district];
  return { world, spec, D };
}

function finish(world, spec, D) {
  if (GREY()) {
    protoLabel(world, 0, 0, spec.label, { color: '#cfe8f2', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#8f9aa4', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  // THE GUARDRAIL (js/batch.js). Every static prop above folds into one draw
  // per material. Measured on Level 1 this is worth 40-70 calls a room.
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

  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };

  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'vga', { x: 5.4, z: 0, angle: -Math.PI / 2 });
  if (stage >= 1) {
    sideDoor(world, 'e', halfW, halfD, 'vgb', { x: -5.4, z: 0, angle: Math.PI / 2 });
    sideDoor(world, 'n', halfW, halfD, 'vgc', { x: 0, z: 3.2, angle: Math.PI }, { centre: -9 });
  }
  if (stage >= 3) {
    sideDoor(world, 'n', halfW, halfD, 'vz', { x: 0, z: 9.5, angle: Math.PI },
      { centre: 9, half: BOSS_DOOR_HALF });
  }

  // ▲ THE STONE TITAN, slumped against the north wall. The level's anchor.
  heroProp(world, 0, -10, 'titan', D);
  world.markers.heroSpot = { x: 0, z: -10 };

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
  const RING = { x: 0, z: 2, r: 7.5 };
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
  world.markers.hubStage = stage;               // for the headless verifier
  breadcrumbs(world, [[0, 8], [-6, 4], [-11, 0]], 0xffd18a);
  scatter(world, halfW, halfD, D, 71, 18, { spin: 0 });   // fitted masonry: no free rotation
  return finish(world, spec, D);
}

// ===========================================================================
// SPOKE A — THE GLIMMERWAY (cyan, cold sparkle). Forced first: the only door.
// ===========================================================================
export async function buildVga(scene) {
  const { world, spec, D } = base(scene, 'vga');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D);
  world.spawn = { x: 5.4, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'vh', { x: -15.4, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'va1', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  world.markers.restSpot = { x: 0, z: 0 };
  breadcrumbs(world, [[3, 0], [-3, 0]], 0x9fe8f4);
  return finish(world, spec, D);
}

export async function buildVa1(scene) {
  const { world, spec, D } = base(scene, 'va1');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D);
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
  breadcrumbs(world, [[13, 0], [7, 2], [0, 4], [-7, 2], [-13, 0]], 0x9fe8f4);
  scatter(world, halfW, halfD, D, 81, 16, { spin: 1, kinds: ['rockSA', 'rockSB', 'rockLB', 'column'] });
  return finish(world, spec, D);
}

export async function buildVa2(scene) {
  const { world, spec, D } = base(scene, 'va2');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w'), gap('n')], D);
  world.spawn = { x: 13.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'va1', { x: -13.5, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'va3', { x: 7.5, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'vap', { x: 0, z: 5.5, angle: Math.PI });

  heroProp(world, -9, -8, 'geode', D);          // ▲ THE GEODE
  world.markers.heroSpot = { x: -9, z: -8 };
  world.markers.batSpots = [{ x: 4, z: -6 }, { x: -3, z: 3 }];

  // Optional practice, NOT the teach step (that is vb1, which cannot be
  // skipped). A child who walks back out through here instead of taking the
  // shrine's shortcut gets paid for it: three piles they watched go by on the
  // way in, now breakable.
  world.markers.practiceCracks = [{ x: 6, z: 5 }, { x: -2, z: 7 }, { x: 10, z: -2 }];
  for (const [i, p] of world.markers.practiceCracks.entries()) crackedPile(world, `l2_va2_${i}`, p.x, p.z);
  breadcrumbs(world, [[13, 0], [6, 0], [0, 0], [-6, 0], [-13, 0]], 0x9fe8f4);
  scatter(world, halfW, halfD, D, 82, 22, { spin: 1, kinds: ['rockSA', 'rockLC', 'column2', 'brick'] });
  return finish(world, spec, D);
}

export async function buildVap(scene) {
  const { world, spec, D } = base(scene, 'vap');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D);
  world.spawn = { x: 0, z: 5.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'va2', { x: 0, z: -10.5, angle: 0 });   // LOOPS BACK
  wallRun(world, -5, -2, 3, -2, D);
  world.markers.pup4Spot = { x: 6, z: -4 };
  world.markers.slimeSpots = [{ x: -4, z: 3 }];
  scatter(world, halfW, halfD, D, 83, 12, { spin: 1, kinds: ['rockSB', 'rockSA'] });
  return finish(world, spec, D);
}

// PETRA'S SPARK — the shrine. TEACH 1: INTRODUCE. One pile, no enemies, no
// timer, nothing else in the room to do.
export async function buildVa3(scene) {
  const { world, spec, D } = base(scene, 'va3');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D);
  world.spawn = { x: 7.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'va2', { x: -13.5, z: 0, angle: Math.PI / 2 });
  // THE SHORTCUT HOME — a walked gallery, not a teleport (dad's law).
  sideDoor(world, 'w', halfW, halfD, 'vh', { x: -13, z: -9, angle: Math.PI / 2 });

  world.markers.shrineSpot = { x: 0, z: -3 };
  world.markers.sparkSpot = { x: 0, z: -3, spirit: 'petra', grants: 'earth_wolf' };
  world.markers.teachCrack = { x: 0, z: 2 };
  crackedPile(world, 'l2_va3_teach', 0, 2, true);
  if (!GREY()) {
    const ped = tinted(caveKit.pedestal, 'shrine', 0xb6c8cf);
    ped.position.set(0, 0, -3);
    ped.scale.setScalar(2.2);
    world.add(ped);
    world.addCircle(0, -3, 0.9);
  }
  return finish(world, spec, D);
}

// ===========================================================================
// SPOKE B — THE BONE QUARRY (bone white + tan dust).
// ===========================================================================
export async function buildVgb(scene) {
  const { world, spec, D } = base(scene, 'vgb');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D);
  world.spawn = { x: -5.4, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vh', { x: 15.4, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'vb1', { x: -13.5, z: 0, angle: Math.PI / 2 });
  world.markers.restSpot = { x: 0, z: 0 };
  breadcrumbs(world, [[-3, 0], [3, 0]], 0xf0e2b8);
  return finish(world, spec, D);
}

export async function buildVb1(scene) {
  const { world, spec, D } = base(scene, 'vb1');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D);
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
  breadcrumbs(world, [[-13, 0], [-6, -2], [1, -2], [8, 0], [13, 0]], 0xf0e2b8);
  scatter(world, halfW, halfD, D, 91, 20, { spin: 0, kinds: ['brick', 'rockLB', 'rockSA', 'skull'] });
  return finish(world, spec, D);
}

export async function buildVb2(scene) {
  const { world, spec, D } = base(scene, 'vb2');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e'), gap('s')], D);
  world.spawn = { x: -13.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vb1', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'vb3', { x: -7.5, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 's', halfW, halfD, 'vbp', { x: 0, z: -5.5, angle: 0 });

  heroProp(world, 4, -8, 'ribcage', D);          // ▲ THE RIBCAGE
  world.markers.heroSpot = { x: 4, z: -8 };
  world.markers.shieldSpots = [{ x: -2, z: 2 }];
  world.markers.minionSpots = [{ x: 9, z: 4 }, { x: -7, z: -4 }];
  crackedPile(world, 'l2_vb2_a', 11, 6);
  breadcrumbs(world, [[-13, 0], [-6, 2], [0, 2], [7, 0], [13, 0]], 0xf0e2b8);
  scatter(world, halfW, halfD, D, 92, 26, { spin: 0, kinds: ['brick', 'skull', 'rockSB', 'column'] });
  return finish(world, spec, D);
}

export async function buildVbp(scene) {
  const { world, spec, D } = base(scene, 'vbp');
  const { halfW, halfD } = shell(world, spec, [gap('n')], D);
  world.spawn = { x: 0, z: -5.5, angle: Math.PI };
  sideDoor(world, 'n', halfW, halfD, 'vb2', { x: 0, z: 10.5, angle: Math.PI });  // LOOPS BACK
  wallRun(world, -6, 1, 2, 1, D);
  visibleReward(world, 6, 4, 'l2_vbp_chest', { shards: 22 });
  world.markers.minionSpots = [{ x: -4, z: -3 }];
  scatter(world, halfW, halfD, D, 93, 14, { spin: 0, kinds: ['brick', 'skull'] });
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
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D);
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vb2', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  // THE SHORTCUT HOME, opened by the dam breaking.
  sideDoor(world, 'e', halfW, halfD, 'vh', { x: 13, z: -9, angle: -Math.PI / 2 });

  // The resonant plate: stomp HERE and the whole chamber answers.
  world.markers.rattlePlate = { x: 0, z: 2 };
  // What answers: stalactites drop on whatever stands beneath them...
  world.markers.stalactiteSpots = [{ x: -5, z: -2 }, { x: 0, z: -4 }, { x: 5, z: -2 }];
  // ...and a bell-stone you cannot see from the plate rings, opening the dam.
  world.markers.bellStone = { x: 7, z: -5 };
  world.markers.damSpot = { x: 0, z: -6 };
  world.markers.minionSpots = [{ x: -5, z: -2 }, { x: 5, z: -2 }];

  if (GREY()) {
    // the plate, the three drop zones and the bell, all readable as shapes
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.18, 20),
      protoMaterial(0xffd54a, 3, 3)
    );
    plate.position.set(0, world.deckY + 0.09, 2);
    world.add(plate);
    for (const s of world.markers.stalactiteSpots) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 8), protoMaterial(0xc8bda0, 2, 2));
      c.position.set(s.x, 4.6, s.z);
      c.rotation.z = Math.PI;
      world.add(c);
    }
  } else {
    const plate = tinted(caveKit.pedestal, 'rattlePlate', 0xd8c78a);
    plate.position.set(0, 0, 2);
    plate.scale.set(2.4, 0.5, 2.4);
    world.add(plate);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.9, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, world.deckY + 0.05, 2);
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
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
  world.spawn = { x: 0, z: 3.2, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vh', { x: -9, z: -10.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'vc1', { x: 0, z: 10.5, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  breadcrumbs(world, [[0, 3], [0, -3]], 0x8fe0d4);
  return finish(world, spec, D);
}

export async function buildVc1(scene) {
  const { world, spec, D } = base(scene, 'vc1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
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
  world.markers.minionSpots = [{ x: -6, z: -1 }];
  // and no third body. Dropping one shield-bearer took this room 106 -> 102,
  // still over; a character costs far more than the room's own geometry here
  // (43 of the original 106 was three of them). Two enemies on a three-terrace
  // stair is the right fight anyway — the stair IS the difficulty.
  breadcrumbs(world, [[0, 10], [5, 5], [5, 0], [-2, -6], [0, -11]], 0x8fe0d4);
  scatter(world, halfW, halfD, D, 101, 18, { spin: 1, kinds: ['rockSA', 'rockLB', 'column2'] });
  return finish(world, spec, D);
}

export async function buildVc2(scene) {
  const { world, spec, D } = base(scene, 'vc2');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('e')], D);
  world.spawn = { x: 0, z: 10.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vc1', { x: 0, z: -10.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'vc3', { x: 0, z: 5.5, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'vcp', { x: -7.5, z: 0, angle: Math.PI / 2 });

  heroProp(world, -8, -7, 'drownedDoor', D);     // ▲ THE DROWNED DOOR
  world.markers.heroSpot = { x: -8, z: -7 };
  world.markers.shieldSpots = [{ x: 4, z: 2 }];
  world.markers.batSpots = [{ x: -4, z: 5 }];

  // FORESHADOWED GATE — Level 3's tool, a whole level early. Green and alive
  // in a wet cave: obviously wrong, obviously later, reward plainly visible.
  wallRun(world, 11, -6, 16, -6, D);
  wallRun(world, 11, 0, 16, 0, D);
  promiseGate(world, 11, -3, 2.4, 6, 0x5fae4a, 'THORNS — later', 'rockSB',
              { system: 'cut', id: 'l2_bramble_gate', region: REGION });
  visibleReward(world, 14, -3, 'l2_vc2_bramble', { shards: 24 });
  world.markers.bramblePromise = { x: 11, z: -3 };
  breadcrumbs(world, [[0, 10], [-3, 4], [-3, -2], [0, -10]], 0x8fe0d4);
  scatter(world, halfW, halfD, D, 102, 24, { spin: 1, kinds: ['rockSB', 'rockLC', 'column', 'brick'] });
  return finish(world, spec, D);
}

export async function buildVcp(scene) {
  const { world, spec, D } = base(scene, 'vcp');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'vc2', { x: 13.5, z: 0, angle: -Math.PI / 2 });  // LOOPS BACK
  wallRun(world, 0, -4, 0, 3, D);
  visibleReward(world, 6, -3, 'l2_vcp_chest', { shards: 20, heartPiece: 1 }, 'gold');
  world.markers.slimeSpots = [{ x: 5, z: 4 }];
  scatter(world, halfW, halfD, D, 103, 12, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  return finish(world, spec, D);
}

// THE SHOULDER PIN — the last thing holding the titan's arm up.
export async function buildVc3(scene) {
  const { world, spec, D } = base(scene, 'vc3');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
  world.spawn = { x: 0, z: 5.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'vc2', { x: 0, z: -10.5, angle: 0 });
  // THE SHORTCUT HOME.
  sideDoor(world, 'n', halfW, halfD, 'vh', { x: 0, z: -11.5, angle: Math.PI });

  world.markers.pinSpot = { x: 0, z: -3 };
  crackedPile(world, 'l2_vc3_pin', 0, -3, true);
  world.markers.shieldSpots = [{ x: -4, z: 2 }];
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
  const { halfW, halfD } = shell(world, spec, gaps, D);
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
  scatter(world, halfW, halfD, D, 111, 14, { spin: 0, kinds: ['column', 'skull', 'brick'] });
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
