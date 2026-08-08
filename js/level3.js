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
import { makeBuilders, tintedModel, gap, MODULES, DOOR_HALF, BOSS_DOOR_HALF } from './levelkit.js';
import { flattenStatic } from './batch.js';
import { WS, defineRestoration } from './worldstate.js';

let forceGrey = false;
let woodKit = null;
const GREY = () => forceGrey || !woodKit || state.settings.greybox !== false;

export const REGION = 'wild3';

// The two shortcuts are world state, not session state: a child who pushes the
// log over, quits, and comes back tomorrow must still find it lying there.
// Same mechanism Level 2's vault uses (js/worldstate.js).
defineRestoration(REGION, [
  { key: 'rootCut', title: 'the root-wall is cut open',
    opens: 'a chord from the Rootbound Deep back to the Gloomwood' },
  { key: 'logDown', title: 'the great log is pushed over',
    opens: 'a chord from the Bloomfall back to Thornedge' },
]);

// ---------------------------------------------------------------------------
// DISTRICTS. The palette IS the story: sick yellow → dark blue → brown → and
// then, on the far side, one district that is already WELL. Reaching the
// Bloomfall tells a child without a word that they are near the end and that
// the woods can be saved.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  thorn:  { tint: 0xb9bd5e, floorTint: 0x9a9c55, wallTint: 0x3c3a1e,
            name: 'THORNEDGE',           hero: 'THE LEANING SHRINE' },
  gloom:  { tint: 0x3e7d7a, floorTint: 0x35595c, wallTint: 0x14262b,
            name: 'THE GLOOMWOOD',       hero: 'THE WATCHING TREE' },
  root:   { tint: 0xa8763c, floorTint: 0x8a6438, wallTint: 0x33241a,
            name: 'THE ROOTBOUND DEEP',  hero: 'THE GREAT ROOT ARCH' },
  bloom:  { tint: 0xf0b8cf, floorTint: 0xd9aebe, wallTint: 0x5a3a48,
            name: 'THE BLOOMFALL',       hero: 'THE BLOSSOM FALL' },
  glade:  { tint: 0x8fdc6a, floorTint: 0x6f9e55, wallTint: 0x2a3a22,
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

// The ring, clockwise, as it must be walkable. The last hop closes it.
export const RING_PATH = [
  't1a', 't1b', 'tc1',
  't2a', 't2b', 'tsh', 'tc2',
  't3a', 't3b', 'tkn', 'tc3',
  't4a', 't4b', 'tc4',
  'tgl', 't1a',
];

// The four-step teach for the VERDANT WOLF's vine-lash.
export const TEACH = [
  { step: 'introduce', room: 'tsh', marker: 'teachBramble',
    what: 'the shrine clearing — one bramble across a doorway, nothing else' },
  { step: 'develop', room: 'tc2', marker: 'developBrambles',
    what: 'the way out — brambles that grow back, and a log swung into a bridge' },
  { step: 'twist', room: 'tkn', marker: 'knotTether',
    what: 'THE KNOT — the lash does not only cut, it HOLDS' },
  { step: 'conclude', room: 't4b', marker: 'thornKnot',
    what: "the great thorn-knot that opens the Glade, then Sylva's own thorns" },
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
  darkZone, breadcrumbs } = makeBuilders({ kit: () => woodKit, isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

// ---------------------------------------------------------------------------
// LEVEL-SPECIFIC PIECES
// ---------------------------------------------------------------------------

// A bramble — the Verdant Wolf's verb, and before you have it, a promise.
// `regrows` is the DEVELOP twist: it closes again if you dawdle.
function bramble(world, id, x, z, w = 2.4, d = 1.2, regrows = false) {
  if (state.flags.cut && state.flags.cut[id] && !regrows) return null;
  // gates.js creates world.cuttables lazily, so a room that grows its own
  // brambles without going through brambleGate() has to make sure it exists —
  // getting this wrong threw inside the first build and left the room loader
  // wedged, which failed all twenty rooms after it, not just this one.
  if (!world.cuttables) world.cuttables = [];
  const colour = 0x4f8f3a;
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.6, d),
      new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9,
        emissive: colour, emissiveIntensity: 0.16 })
    );
    m.position.set(x, 0.8, z);
    world.add(m);
    world.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    world.cuttables.push({ id, x, z, r: Math.max(w, d) / 2, mesh: m, regrows });
    return m;
  }
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(Math.max(w, d) / 1.1));
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const piece = tinted(woodKit.bush, 'bramble', colour, 0.85 + (i % 3) * 0.1);
    piece.position.set(x + (w > d ? f * w : 0), 0, z + (d >= w ? f * d : 0));
    piece.rotation.y = i * 1.9;
    piece.scale.setScalar(1.1);
    g.add(piece);
  }
  world.add(g);
  world.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  world.cuttables.push({ id, x, z, r: Math.max(w, d) / 2, mesh: g, regrows });
  return g;
}

// The hero props. In a ring these carry more navigational load than in either
// earlier level: they are not decoration, they are the answer to "have I been
// here before?" asked from a door the child has never used. Greybox form is a
// bold blocky silhouette at TRUE SCALE, because that is the question.
function heroProp(world, x, z, kind, D) {
  const g = new THREE.Group();

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
      world.addCircle(x, z, 2.0);
    } else if (kind === 'watchingTree') {  // a vast hollow trunk with a face
      add(5.0, 9.0, 5.0, 0, 4.5, 0);
      add(2.2, 2.6, 1.0, 0, 5.6, 2.4);     // the hollow — the "face"
      world.addCircle(x, z, 2.5);
    } else if (kind === 'rootArch') {      // roots grown into a doorway
      add(1.8, 7.0, 1.8, -3.4, 3.5, 0, 0, 0.22);
      add(1.8, 7.0, 1.8, 3.4, 3.5, 0, 0, -0.22);
      add(8.0, 1.6, 2.0, 0, 7.0, 0);
      world.addCircle(x - 3.4, z, 1.0); world.addCircle(x + 3.4, z, 1.0);
    } else if (kind === 'blossomFall') {   // a permanent cascade of petals
      add(3.0, 8.5, 3.0, 0, 4.25, 0);
      add(7.5, 1.2, 7.5, 0, 8.6, 0);
      world.addCircle(x, z, 1.6);
    } else if (kind === 'standingStones') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(1.3, 4.6, 1.3, Math.cos(a) * 6.2, 2.3, Math.sin(a) * 6.2, a);
      }
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

  if (kind === 'leaningShrine') {
    // a real knight model, stone grey, toppled and sinking — the wolf-knight
    // who came before, which is the whole reason Thornedge feels like a warning
    const st = tinted(woodKit.statue, 'shrineStatue', 0x8f9186);
    st.scale.setScalar(2.6);
    st.rotation.set(0, 0.6, 0.5);
    st.position.set(0, 1.2, 0);
    g.add(st);
    put(woodKit.rockLA, 'shrineBase', 0, 0, 0, 2.2, 0.3, 0, 0x6e6f66);
    world.addCircle(x, z, 2.0);
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
    eyes.position.set(x, world.deckY + 0.05, z);
    world.add(eyes);
    world.addCircle(x, z, 2.5);
  } else if (kind === 'rootArch') {
    put(woodKit.arch, 'rootArch', 0, 0, 0, 3.4, 0, 0, 0x4a3320);
    put(woodKit.logStack, 'rootArch', -3.6, 0, 0.6, 1.8, 0.4);
    put(woodKit.logStack, 'rootArch', 3.6, 0, -0.4, 1.8, -0.4);
    world.addCircle(x - 3.4, z, 1.0); world.addCircle(x + 3.4, z, 1.0);
  } else if (kind === 'blossomFall') {
    put(woodKit.treeB, 'blossom', 0, 0, 0, 4.4, 0, 0, 0xe8a8c0);
    // the fall itself: petals drifting down, one InstancedMesh, one draw call
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
    world.addCircle(x, z, 1.6);
  } else if (kind === 'standingStones') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      put(woodKit.pillar, 'stones', Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2, 2.2, a, 0, 0x8a9a7a);
    }
  }
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

// ---------------------------------------------------------------------------
function base(scene, id) {
  const spec = L3[id];
  const world = new World(scene);
  world.bgColor = 0x0d1410;
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    protoLabel(world, 0, 0, spec.label, { color: '#d8f0c8', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#93a68c', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
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
  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'den', { x: 0, z: -3.2, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't1b', { x: 0, z: 10, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'tgl', { x: -10, z: 9, angle: Math.PI / 2 });
  if (logDown) sideDoor(world, 'w', halfW, halfD, 'tsA', { x: 10, z: 0, angle: -Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'leaningShrine', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -7, z: 4 };
  world.markers.houndSpots = [{ x: 8, z: 3, variant: 'thorn' }];
  breadcrumbs(world, [[0, 7], [0, 3], [0, -6]], 0xc8e88a);
  scatter(world, halfW, halfD, D, 121, 18, { spin: 1, kinds: ['treeA', 'stump', 'rockSA', 'bush'] });
  return finish(world, spec, D);
}

export async function buildT1b(scene) {
  const { world, spec, D } = base(scene, 't1b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('e')], D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't1a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc1', { x: 0, z: 7, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 't1p', { x: -7.5, z: 0, angle: Math.PI / 2 });

  world.markers.houndSpots = [{ x: -6, z: 2, variant: 'thorn' }, { x: 7, z: -5, variant: 'thorn' }];
  // GATE — bramble walls, before the shrine. Same tangle, same look as the one
  // seeded back in Stoneroot a whole level ago.
  bramble(world, 'w3_thorn_wall', -11, -6, 2.0, 5.0);
  visibleReward(world, -13.5, -6, 'l3_w1b_bramble', { shards: 20 });
  world.markers.bramblePromise = { x: -11, z: -6 };
  // GATE — the ICE-SEALED SPRING. Level 4's tool, a whole level early.
  promiseGate(world, 11, 4, 3.0, 3.0, 0x9be3ff, 'FROZEN — later', 'rockSB');
  visibleReward(world, 13.5, 4, 'l3_w1b_ice', { shards: 22 });
  world.markers.icePromise = { x: 11, z: 4 };
  breadcrumbs(world, [[0, 8], [0, 2], [0, -8]], 0xc8e88a);
  scatter(world, halfW, halfD, D, 122, 20, { spin: 1, kinds: ['treeA', 'treeB', 'stump', 'rockSB'] });
  return finish(world, spec, D);
}

export async function buildT1p(scene) {
  const { world, spec, D } = base(scene, 't1p');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 't1b', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  wallRun(world, -2, -3, 5, -3, D);
  world.markers.pup7Spot = { x: 6, z: -5 };
  scatter(world, halfW, halfD, D, 123, 10, { spin: 1, kinds: ['stump', 'bush'] });
  return finish(world, spec, D);
}

export async function buildTc1(scene) {
  const { world, spec, D } = base(scene, 'tc1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't1b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't2a', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  breadcrumbs(world, [[0, 5], [0, 0], [0, -5]], 0xc8e88a);
  scatter(world, halfW, halfD, D, 124, 12, { spin: 1, kinds: ['treeA', 'stump'] });
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
  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tc1', { x: 0, z: -7, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't2b', { x: 0, z: 10, angle: Math.PI });
  if (rootCut) sideDoor(world, 'e', halfW, halfD, 'tsB', { x: -10, z: 0, angle: Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'watchingTree', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 5 };
  // the dark: the Dark Wolf's eyes are the way through, as in Ember
  darkZone(world, -halfW, halfW, -halfD, 4);
  world.markers.mothSpots = [{ x: -5, z: -6, variant: 'wisp' }, { x: 6, z: -4, variant: 'wisp' }];
  breadcrumbs(world, [[0, 8], [0, 2], [0, -8]], 0x8fe0d4);
  scatter(world, halfW, halfD, D, 131, 20, { spin: 1, kinds: ['treeB', 'mushT', 'mushG', 'rockSA'] });
  return finish(world, spec, D);
}

export async function buildT2b(scene) {
  const { world, spec, D } = base(scene, 't2b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('w')], D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't2a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tsh', { x: 0, z: 5.5, angle: Math.PI });
  sideDoor(world, 'w', halfW, halfD, 't2p', { x: 7.5, z: 0, angle: -Math.PI / 2 });

  darkZone(world, -halfW, halfW, -halfD, 2);
  world.markers.mothSpots = [{ x: -4, z: 4, variant: 'wisp' }, { x: 5, z: -2, variant: 'wisp' },
    { x: -7, z: -6, variant: 'wisp' }];
  wallRun(world, 4, -4, 4, 6, D);
  breadcrumbs(world, [[0, 8], [-3, 2], [-3, -5], [0, -9]], 0x8fe0d4);
  scatter(world, halfW, halfD, D, 132, 22, { spin: 1, kinds: ['treeB', 'mushT', 'stump'] });
  return finish(world, spec, D);
}

export async function buildT2p(scene) {
  const { world, spec, D } = base(scene, 't2p');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D);
  world.spawn = { x: 7.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 't2b', { x: -13.5, z: 0, angle: Math.PI / 2 });
  visibleReward(world, -6, -3, 'l3_w2p_chest', { shards: 24 });
  world.markers.mothSpots = [{ x: -3, z: 4, variant: 'wisp' }];
  scatter(world, halfW, halfD, D, 133, 10, { spin: 1, kinds: ['mushG', 'mushT'] });
  return finish(world, spec, D);
}

// SYLVA'S SPARK — TEACH 1: INTRODUCE. One bramble across a doorway. Nothing
// else in the room to do, no enemies, no timer.
export async function buildTsh(scene) {
  const { world, spec, D } = base(scene, 'tsh');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
  world.spawn = { x: 0, z: 5.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't2b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc2', { x: 0, z: 7, angle: Math.PI });

  world.markers.shrineSpot = { x: 0, z: -2 };
  world.markers.sparkSpot = { x: 0, z: -2, spirit: 'sylva', grants: 'verdant_wolf' };
  // the one bramble, across the way OUT — so the first cut is also the exit
  world.markers.teachBramble = { x: 0, z: -5 };
  bramble(world, 'l3_wsh_teach', 0, -5, 3.0, 1.2);
  if (!GREY()) {
    const ped = tinted(woodKit.rockLC, 'shrine', 0x6f9e55);
    ped.position.set(0, 0, -2);
    ped.scale.setScalar(1.6);
    world.add(ped);
    world.addCircle(0, -2, 0.9);
  }
  return finish(world, spec, D);
}

// TEACH 2 — DEVELOP. The way out of the shrine: brambles that grow back if you
// dawdle, and a bramble rope you lash to swing a fallen log into a bridge.
export async function buildTc2(scene) {
  const { world, spec, D } = base(scene, 'tc2');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tsh', { x: 0, z: -5.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't3a', { x: 0, z: 10, angle: Math.PI });

  world.markers.developBrambles = [{ x: -4, z: 2 }, { x: 4, z: -1 }, { x: 0, z: -5 }];
  for (const [i, p] of world.markers.developBrambles.entries()) {
    bramble(world, `l3_wc2_${i}`, p.x, p.z, 3.0, 1.2, true);   // REGROWS
  }
  world.markers.logBridge = { x: 0, z: -7 };
  if (!GREY()) {
    const log = tinted(woodKit.logStack, 'bridgeLog', 0x6b4d2c);
    log.position.set(0, 0, -7);
    log.rotation.y = Math.PI / 2;
    log.scale.setScalar(2.2);
    world.add(log);
  }
  breadcrumbs(world, [[0, 5], [0, 0], [0, -6]], 0x8fe0d4);
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
  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tc2', { x: 0, z: -7, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't3b', { x: 0, z: 10, angle: Math.PI });
  if (rootCut) sideDoor(world, 'w', halfW, halfD, 'tsB', { x: 10, z: 0, angle: -Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'rootArch', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: 8, z: 6 };
  // THE ROOT-WALL: a chord you can SEE the Gloomwood through, before you can
  // cut it. It is the shortcut, and it reads as later, not as broken.
  if (!rootCut) {
    bramble(world, 'l3_rootwall', -13, 0, 2.0, 6.0);
    world.markers.rootWallPromise = { x: -13, z: 0 };
  }
  world.markers.houndSpots = [{ x: 6, z: -6, variant: 'thorn' }];
  breadcrumbs(world, [[0, 8], [0, 2], [0, -8]], 0xe8c88a);
  scatter(world, halfW, halfD, D, 141, 20, { spin: 1, kinds: ['logStack', 'stump', 'rockLB', 'treeA'] });
  return finish(world, spec, D);
}

export async function buildT3b(scene) {
  const { world, spec, D } = base(scene, 't3b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('e')], D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't3a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tkn', { x: 0, z: 10, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 't3p', { x: -7.5, z: 0, angle: Math.PI / 2 });

  for (const [i, p] of [[-5, 3], [5, 0], [-2, -5]].entries()) {
    bramble(world, `l3_w3b_${i}`, p[0], p[1], 3.0, 1.2, true);
  }
  world.markers.houndSpots = [{ x: 8, z: 4, variant: 'thorn' }, { x: -8, z: -4, variant: 'thorn' }];
  breadcrumbs(world, [[0, 8], [0, 0], [0, -8]], 0xe8c88a);
  scatter(world, halfW, halfD, D, 142, 22, { spin: 1, kinds: ['logStack', 'rockLC', 'stump'] });
  return finish(world, spec, D);
}

export async function buildT3p(scene) {
  const { world, spec, D } = base(scene, 't3p');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D);
  world.spawn = { x: -7.5, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 't3b', { x: 13.5, z: 0, angle: -Math.PI / 2 });
  wallRun(world, 0, -4, 0, 3, D);
  world.markers.pup8Spot = { x: 6, z: -3 };
  scatter(world, halfW, halfD, D, 143, 10, { spin: 1, kinds: ['logStack', 'stump'] });
  return finish(world, spec, D);
}

// THE KNOT — the one puzzle room, and TEACH 3: THE TWIST.
// The lash does not only CUT, it HOLDS. Tether a boulder and drag it; snare a
// Thorn Hound and hold it still. The tool they learned as a blade is a rope.
// It is ON THE SPINE, not in a pocket — Level 2 taught us that a skippable
// twist teaches three quarters of an ability.
export async function buildTkn(scene) {
  const { world, spec, D } = base(scene, 'tkn');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't3b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc3', { x: 0, z: 7, angle: Math.PI });

  // the boulder you TETHER and drag onto the plate
  world.markers.knotTether = { x: -8, z: 2 };
  world.markers.boulderSpots = [{ x: -8, z: 2, id: 'l3_knot_a' }];
  world.markers.plateSpots = [{ x: 8, z: -4, id: 'l3_knot_p1' }];
  // the hound you SNARE and hold still while the boulder rolls
  world.markers.knotSnare = { x: 4, z: 4 };
  world.markers.houndSpots = [{ x: 4, z: 4, variant: 'thorn' }];
  wallRun(world, -2, -8, -2, -1, D);
  wallRun(world, 2, 6, 12, 6, D);
  if (GREY()) {
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 0.18, 18),
      protoMaterial(0xffd54a, 3, 3)
    );
    plate.position.set(8, world.deckY + 0.09, -4);
    world.add(plate);
  }
  breadcrumbs(world, [[0, 8], [-6, 3], [6, -2], [0, -8]], 0xe8c88a);
  scatter(world, halfW, halfD, D, 144, 16, { spin: 1, kinds: ['logStack', 'rockLA'] });
  return finish(world, spec, D);
}

export async function buildTc3(scene) {
  const { world, spec, D } = base(scene, 'tc3');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D);
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tkn', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't4a', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  breadcrumbs(world, [[0, 5], [0, 0], [0, -5]], 0xe8c88a);
  scatter(world, halfW, halfD, D, 145, 12, { spin: 1, kinds: ['stump', 'rockSA'] });
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
  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tc3', { x: 0, z: -7, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 't4b', { x: 0, z: 10, angle: Math.PI });
  if (logDown) sideDoor(world, 'e', halfW, halfD, 'tsA', { x: -10, z: 0, angle: Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'blossomFall', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 6 };
  // THE GREAT LOG — push it over and it becomes the chord home. Visible from
  // the moment you arrive; it reads as "that goes somewhere", not as scenery.
  if (!logDown) {
    world.markers.logPromise = { x: 12, z: 0 };
    if (GREY()) {
      const lg = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 6.0, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 })
      );
      lg.position.set(12, 3, 0);
      world.add(lg);
    } else {
      const lg = tinted(woodKit.treeB, 'greatLog', 0x7a5a34);
      lg.position.set(12, 0, 0);
      lg.scale.setScalar(3.4);
      world.add(lg);
    }
    world.addCircle(12, 0, 1.2);
  }
  world.markers.houndSpots = [{ x: -6, z: -5, variant: 'elderthorn' },
    { x: 6, z: -6, variant: 'thorn' }];
  breadcrumbs(world, [[0, 8], [0, 2], [0, -8]], 0xffd0e0);
  scatter(world, halfW, halfD, D, 151, 20, { spin: 1, kinds: ['treeB', 'flowerA', 'flowerB', 'bush'] });
  return finish(world, spec, D);
}

// TEACH 4 — CONCLUDE. The great thorn-knot: the same cut, at a scale that
// changes a district. Cutting it blooms the Bloomfall and opens the Glade.
export async function buildT4b(scene) {
  const { world, spec, D } = base(scene, 't4b');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n'), gap('w')], D);
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't4a', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tc4', { x: 0, z: 7, angle: Math.PI });
  sideDoor(world, 'w', halfW, halfD, 't4p', { x: 7.5, z: 0, angle: -Math.PI / 2 });

  world.markers.thornKnot = { x: 0, z: -7 };
  bramble(world, 'l3_thornknot', 0, -7, 7.0, 2.0);
  world.markers.houndSpots = [{ x: -7, z: 3, variant: 'elderthorn' }];
  breadcrumbs(world, [[0, 8], [0, 0], [0, -5]], 0xffd0e0);
  scatter(world, halfW, halfD, D, 152, 24, { spin: 1, kinds: ['treeB', 'flowerA', 'flowerB'] });
  return finish(world, spec, D);
}

export async function buildT4p(scene) {
  const { world, spec, D } = base(scene, 't4p');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D);
  world.spawn = { x: 7.5, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 't4b', { x: -13.5, z: 0, angle: Math.PI / 2 });
  visibleReward(world, -6, -3, 'l3_w4p_chest', { shards: 26, heartPiece: 1 }, 'gold');
  scatter(world, halfW, halfD, D, 153, 12, { spin: 1, kinds: ['flowerA', 'flowerB', 'bush'] });
  return finish(world, spec, D);
}

export async function buildTc4(scene) {
  const { world, spec, D } = base(scene, 'tc4');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n', BOSS_DOOR_HALF)], D);
  world.spawn = { x: 0, z: 7, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 't4b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'tgl', { x: 0, z: 9.5, angle: Math.PI },
    { half: BOSS_DOOR_HALF });
  world.markers.restSpot = { x: -3, z: 0 };
  world.markers.potionSpot = { x: 3, z: 0 };
  breadcrumbs(world, [[0, 5], [0, -5]], 0xffd0e0);
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
  const { halfW, halfD } = shell(world, spec, gaps, D);
  world.spawn = { x: 0, z: 9.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'tc4', { x: 0, z: -7, angle: 0 }, { half: BOSS_DOOR_HALF });
  sideDoor(world, 'w', halfW, halfD, 't1a', { x: 10, z: 9, angle: -Math.PI / 2 });
  if (beaten) sideDoor(world, 'n', halfW, halfD, 'f1', { x: 0, z: 4.2, angle: Math.PI });

  heroProp(world, 0, -2, 'standingStones', D);
  world.markers.heroSpot = { x: 0, z: -2 };
  if (!beaten) world.markers.bossSpot = { x: 0, z: -4, skin: 'sylva' };
  world.markers.sylvaSpot = { x: 0, z: -4, spirit: 'sylva' };
  return finish(world, spec, D);
}

// ===========================================================================
// THE TWO CHORDS. Each is a real walked space, because "the way back was
// shorter" has to be something a child FEELS — a door that teleports would
// feel like nothing at all, and dad's law says nothing teleports the player.
// ===========================================================================
export async function buildTsA(scene) {
  const { world, spec, D } = base(scene, 'tsA');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D);
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
  breadcrumbs(world, [[7, 0], [0, 0], [-7, 0]], 0xffd0e0);
  return finish(world, spec, D);
}

export async function buildTsB(scene) {
  const { world, spec, D } = base(scene, 'tsB');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D);
  world.spawn = { x: 10, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 't3a', { x: -10, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 't2a', { x: 10, z: 0, angle: -Math.PI / 2 });
  world.markers.shortcutSpot = { x: 0, z: 0 };
  breadcrumbs(world, [[7, 0], [0, 0], [-7, 0]], 0x8fe0d4);
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
