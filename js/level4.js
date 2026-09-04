// LEVEL 4 — FROSTPEAK, rebuilt to the modern level spec (2026-09-03).
//
// The one region that was never rebuilt. Ember, Stoneroot and the Wild Woods
// were re-specified in design/LEVEL-MAP.md and rebuilt at island scale; the
// Vale, Stormreach and the Court were born that way. Frostpeak stayed the
// v3.21 hand-build in rooms.js: seven rooms of 18x12 and smaller, no spec
// table, no district palette, no dressers, a bare floor plane (until
// 2026-09-03), and both of the arrival-density failures the game had left.
//
// WHAT IS KEPT, EXACTLY. The design (design/LEVEL-DESIGN-2.md, "still
// current") is good and dad has played it: the seven-room graph, the two
// puzzle doors, Boreal. Every room keeps its id (f1..f5, f1b, f2b), so every
// system that names them — the guide, narration, the map, verify-pups,
// verify-playthrough, route.js — keeps working, and RETIRED_ROOMS gains
// nothing. Every world-state key keeps its name (WS 'frost' braziers, the
// f3_p1/f3_p2 plates, the f_cairn/f_scour/f_eyrie ice, cut_f2b_alcove), so a
// child half-way up the mountain on an old save is exactly as far up it on
// the new one. The Frozen Lake's stopper arithmetic is copied to the decimal:
// it was measured, it was wrong once, and it is not a thing to re-derive.
//
// WHAT CHANGES. The rooms are module-sized (island 32x26, pocket 20x16, arena
// 26x26 — design/METRICS.md, not free parameters), built through the shared
// shell/door/dresser vocabulary every other level uses, with a district
// palette that cools as you climb, ground painted by js/ground.js, and the
// mountain INSIDE the room rather than only round its edge.
//
// EVERY ASSET IS ALREADY PAID FOR: Kenney's Holiday Kit (assets/env/snow,
// CC0), the Nature Kit pieces every shell uses, and the Quaternius dungeon
// set for what the mountain's people left behind — the Rime Gate was a GATE,
// the Icebound Hall was a HALL.
import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { loadGLB, prepareModel, instancePlacements } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow, bossGate,
  reserveLandings, spiritShrine } from './levelkit.js';
import { makeDressers } from './dressing.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { audio } from './audio.js';
import { registerDistrictTints } from './districts.js';
import { iceGate, freezeBrazier, brazier, pushableBoulder, plateSwitch,
  registerCuttable } from './gates.js';
import { buildPotionMesh } from './loot.js';

export const REGION = 'frost';   // the WS namespace the v3.21 rooms wrote

let frostKit = null;
const GREY = () => !frostKit || state.settings.greybox !== false;

// ---------------------------------------------------------------------------
// DISTRICTS. The palette climbs: grey-blue at the treeline, blue-white in the
// hall, the pale glass of the lake, a storm-dark scour, and the summit — the
// one place on the mountain with gold in it, because that is where the Frost
// Wolf is.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  treeline: { tint: 0x9fb8cc, floorTint: 0xe6eef6, wallTint: 0x56687a, propTint: 0x8ea3b6,
              ground: 'snowfield', name: 'THE RIME GATE',     hero: 'THE OLD GATEPOSTS' },
  hall:     { tint: 0x8fb0c8, floorTint: 0xe2ecf6, wallTint: 0x4a5e72, propTint: 0x7f9ab0,
              ground: 'snowfield', name: 'THE ICEBOUND HALL', hero: 'THE THREE BOWLS' },
  lake:     { tint: 0xb9d6e6, floorTint: 0xeaf3fa, wallTint: 0x5a7086, propTint: 0x9db4c6,
              ground: 'snowfield', name: 'THE FROZEN LAKE',   hero: 'THE ICE' },
  scour:    { tint: 0x7f98b0, floorTint: 0xd8e2ec, wallTint: 0x3c4c5e, propTint: 0x6e8498,
              ground: 'snowfield', name: 'THE WINDSCOUR',     hero: 'THE SUMMIT DOOR' },
  eyrie:    { tint: 0xc4dbe8, floorTint: 0xf0f6fb, wallTint: 0x66788c, propTint: 0xa9bfd0,
              ground: 'snowfield', name: "BOREAL'S EYRIE",    hero: 'THE STANDING STONES' },
};

const M = MODULES;

// The level as data. Same seven rooms, same graph, same ids as v3.21.
export const L4 = {
  f1:  { ...M.island, kind: 'island', district: 'treeline', spine: true,
         label: 'THE RIME GATE', beat: 'the air bites · rime hounds · the cairn branch' },
  f1b: { ...M.pocket, kind: 'pocket', district: 'treeline', loopsTo: 'f1',
         label: 'THE FROZEN CAIRN', beat: 'optional · a pup · a chest sealed in ice' },
  f2:  { ...M.island, kind: 'island', district: 'hall', spine: true,
         label: 'THE ICEBOUND HALL', beat: 'PUZZLE DOOR 1 · melt, then light · the cold creeps back' },
  f2b: { ...M.pocket, kind: 'pocket', district: 'hall', loopsTo: 'f2',
         label: 'THE GLACIER NOOK', beat: 'optional · an elder hound over a pup · thorn alcove' },
  f3:  { ...M.island, kind: 'island', district: 'lake', spine: true,
         label: 'THE FROZEN LAKE', beat: 'PUZZLE DOOR 2 · the boulders skid · plan the lane' },
  f4:  { ...M.island, kind: 'island', district: 'scour', spine: true,
         label: 'THE WINDSCOUR', beat: 'the gauntlet · rest before the summit' },
  f5:  { ...M.arena,  kind: 'arena',  district: 'eyrie', spine: true,
         label: "BOREAL'S EYRIE", beat: 'BOREAL, THE RIMEBOUND · the first boss that flies' },
};

registerDistrictTints(L4, DISTRICTS);

export const SPINE = ['f1', 'f2', 'f3', 'f4', 'f5'];

// ---------------------------------------------------------------------------
// THE FROST KIT. The Holiday Kit's firs, rocks, drifts and bunkers; the Nature
// Kit pieces the shared shell needs; the dungeon set for the gate and the hall.
// ---------------------------------------------------------------------------
export async function loadFrostKit() {
  if (frostKit) return frostKit;
  const names = {
    floor:   './assets/env/floor-tile.glb',        // Kenney Nature  🟢
    cliff:   './assets/env/cliff-block.glb',
    rockLA:  './assets/env/rock-large-a.glb',
    rockLB:  './assets/env/rock-large-b.glb',
    rockLC:  './assets/env/rock-large-c.glb',
    rockSA:  './assets/env/rock-small-a.glb',
    rockSB:  './assets/env/rock-small-b.glb',
    campfire:'./assets/env/campfire.glb',
    pillar:  './assets/env/pillar.glb',            // Kenney Castle  🟢
    // --- THE MOUNTAIN (Kenney Holiday Kit 🟢) ------------------------------
    treeA:   './assets/env/snow/tree-snow-a.glb',
    treeB:   './assets/env/snow/tree-snow-b.glb',
    treeC:   './assets/env/snow/tree-snow-c.glb',
    rockL:   './assets/env/snow/rocks-large.glb',
    rockM:   './assets/env/snow/rocks-medium.glb',
    rockS:   './assets/env/snow/rocks-small.glb',
    pile:    './assets/env/snow/snow-pile.glb',
    bunker:  './assets/env/snow/snow-bunker.glb',
    flat:    './assets/env/snow/snow-flat.glb',
    // --- WHAT PEOPLE LEFT UP HERE (Quaternius Dungeon 🟢) -------------------
    torch:   './assets/env/dungeon/Torch.glb',       // the braziers
    column:  './assets/env/dungeon/Column.glb',
    column2: './assets/env/dungeon/Column2.glb',
    archDoor:'./assets/env/dungeon/Arch_Door.glb',
    wallMod: './assets/env/dungeon/Wall_Modular.glb',
    pedestal:'./assets/env/dungeon/Pedestal.glb',
    barrel:  './assets/env/dungeon/Barrel.glb',
    crate:   './assets/env/dungeon/Crate.glb',
    vase:    './assets/env/dungeon/Vase.glb',
    brick:   './assets/env/dungeon/Brick.glb',
    skull:   './assets/env/dungeon/Skull.glb',
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  frostKit = Object.fromEntries(entries);
  // The Holiday Kit's rocks sample a DIRT-BROWN cell of the shared colormap —
  // on snow they read as mud, not mountain — and its drift pieces sample a
  // dark cell that made a ridge look like a wall of coal. Same fix the v3.21
  // rooms made: drop the atlas on those and give them flat frost-slate / snow.
  // Every piece in the pack names its material "colormap" and assets.js caches
  // prepared materials BY NAME, so a recoloured piece must also be RENAMED or
  // prepareModel hands back the shared atlas and the tint silently vanishes.
  for (const [k, hex] of [
    ['rockL', 0x9aabbd], ['rockM', 0xa6b6c6], ['rockS', 0xb2c0ce],
    ['pile', 0xf2f8ff], ['bunker', 0xe8f2fb], ['flat', 0xe4eef8],
  ]) {
    frostKit[k].scene.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.name = 'snowrock_' + k;
      n.material.map = null;
      n.material.color.setHex(hex);
      n.material.roughness = 0.95;
      n.material.needsUpdate = true;
    });
  }
  return frostKit;
}

const { shell, sideDoor, wallRun, scatter, visibleReward } =
  makeBuilders({ kit: () => frostKit, isGrey: () => GREY() });

const { fallenColumn, rubbleField, wayshrine, lowWall } =
  makeDressers({ kit: () => frostKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

function base(scene, id) {
  const spec = L4[id];
  const world = new World(scene);
  world.bgColor = 0x1b2735;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#e6f2ff', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#9fb8cc', y: 2.4, size: 1.4 });
    return world;
  }
  // COLD LIGHT: the global rig is firelit and it turned the snow pink. A pale
  // blue sky bounce and a white-blue sun, per district.
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: 0xeaf4ff };
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// ---------------------------------------------------------------------------
// THE MOUNTAIN'S OWN VOCABULARY — ported from the v3.21 rooms, unchanged where
// a number was measured.
// ---------------------------------------------------------------------------

// Snow rocks / drifts with colliders. Each is its own model, so each is one
// THING to look at (and one thing to verify-density).
function drift(world, spots) {
  if (GREY()) return;
  for (const [kind, x, z, s, ry, cr] of spots) {
    if (cr && world.blocked(x, z, cr)) continue;
    const m = prepareModel(frostKit[kind].scene.clone());
    m.position.set(x, 0, z);
    m.rotation.y = ry || 0;
    m.scale.setScalar(s || 1.2);
    world.add(m);
    if (cr) world.addCircle(x, z, cr);
  }
}

// A stand of snow-laden firs. Trees BLOCK (ROOM-STANDARD §2): they are what
// shapes a mountain room, so each carries a collider and each asks the
// keep-clear register before it stands anywhere.
function firs(world, x, z, rad, n, seed = 1) {
  if (GREY()) return;
  let s = (seed * 9301 + Math.round(x * 31 + z * 17)) >>> 0;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const keys = ['treeA', 'treeB', 'treeC'];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, dd = Math.sqrt(rnd()) * rad;
    const px = x + Math.cos(a) * dd, pz = z + Math.sin(a) * dd;
    if (world.blocked(px, pz, 0.8)) continue;
    const m = prepareModel(frostKit[keys[i % 3]].scene.clone());
    m.position.set(px, 0, pz);
    m.rotation.y = rnd() * 6.28;
    m.scale.setScalar(1.1 + rnd() * 0.4);
    world.add(m);
    world.addCircle(px, pz, 0.45);
  }
}

// A low snow ridge with a real collider — the wall that shapes the ice lanes.
// The 0.5u collider pad is a fact the Frozen Lake's lane widths were measured
// against (see buildF3); it does not change.
function snowRidge(world, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const count = Math.max(1, Math.round(len / 1.15));
  if (!GREY()) {
    const ps = [];
    for (let i = 0; i <= count; i++) {
      const f = i / count;
      ps.push({ x: x0 + dx * f, z: z0 + dz * f, ry: i * 2.3, s: 1.35 + (i % 2) * 0.2 });
    }
    world.add(instancePlacements(frostKit.bunker.scene, ps));
  }
  const pad = 0.5;
  world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad, Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
}

// THE MOUNTAIN INSIDE THE ROOM. A fir border just inside the cliff on the
// three sides the camera sees, a low hem of drifts along the south (the
// blind-strip law: nothing there taller than Kael's knee), wind-scoured flats,
// and falling snow — the one thing that says "you are up the mountain". Each
// room passes its own keep-outs so nothing lands in a lane a puzzle needs.
function mountain(world, halfW, halfD, gaps, seed, keep = []) {
  if (GREY()) return;
  const clear = (x, z, r) => world.blocked(x, z, r)
    || keep.some((k) => x > k.minX - r && x < k.maxX + r && z > k.minZ - r && z < k.maxZ + r);
  const inGap = (side, c) => gaps.some((g) => g.side === side && c > g.from - 1.2 && c < g.to + 1.2);
  // the fir border, three rows deep and thinning inward, as its own stands so
  // a child reads "trees" rather than "a wall with trees painted on it"
  const border = [];
  for (let tx = -halfW + 1.5; tx <= halfW - 1.5; tx += 3.2) {
    if (!inGap('n', tx)) border.push([tx, -halfD + 1.6]);
  }
  for (let tz = -halfD + 1.5; tz <= halfD - 4.5; tz += 3.2) {
    if (!inGap('w', tz)) border.push([-halfW + 1.6, tz]);
    if (!inGap('e', tz)) border.push([halfW - 1.6, tz]);
  }
  border.forEach(([x, z], i) => { if (!clear(x, z, 1.4)) firs(world, x, z, 1.3, 3, seed + i); });
  // the south hem: drifts and small rocks, never taller than the knee
  const hem = [];
  for (let tx = -halfW + 1; tx <= halfW - 1; tx += 2.4) {
    if (inGap('s', tx)) continue;
    hem.push([tx % 4.8 < 2.4 ? 'pile' : 'rockS', tx, halfD - 0.9, 1.2 + (Math.abs(tx) % 2) * 0.3, tx * 1.7, 0]);
  }
  drift(world, hem);
  // wind-scoured flats — decorative, no collider, kept off the lanes
  const flats = [];
  for (let i = 0; i < 12; i++) {
    const fx = ((i * 41 + seed * 7) % (halfW * 2 - 6)) - halfW + 3;
    const fz = ((i * 27 + seed * 3) % (halfD * 2 - 8)) - halfD + 4;
    if (clear(fx, fz, 0.2)) continue;
    flats.push({ x: fx, z: fz, ry: i * 1.4, s: 0.9 + (i % 3) * 0.2 });
  }
  if (flats.length) world.add(instancePlacements(frostKit.flat.scene, flats, { castShadow: false }));
  // FALLING SNOW: one Points cloud, ~90 flakes, recycled forever.
  const N = 90;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * (halfW + 2);
    pos[i * 3 + 1] = Math.random() * 6;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * (halfD + 2);
    vel[i] = 0.5 + Math.random() * 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const snow = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  world.add(snow);
  world.keepLoose(snow);
  world.onAnimate((t, dt) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] -= vel[i] * dt;
      p[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.25;
      if (p[i * 3 + 1] < 0) {
        p[i * 3 + 1] = 6;
        p[i * 3] = (Math.random() * 2 - 1) * (halfW + 2);
        p[i * 3 + 2] = (Math.random() * 2 - 1) * (halfD + 2);
      }
    }
    geo.attributes.position.needsUpdate = true;
  });
}

// A campfire save point. The rebuilt levels dropped floor checkpoints (the
// game persists at every milestone now), but Frostpeak's rest-before-the-boss
// law is written into GAME-CONTRACT and its fires are what a child remembers
// the mountain by, so they stay — same shape rooms.js's checkpoint() has.
function campfire(world, id, x, z) {
  world.reserve(x, z, 1.6, 'campfire:' + id);
  const fire = prepareModel(frostKit.campfire.scene.clone());
  fire.position.set(x, 0, z);
  fire.scale.setScalar(1.4);
  world.add(fire);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa03a, emissiveIntensity: 2.2, roughness: 1 })
  );
  flame.position.set(x, 0.35, z);
  world.add(flame);
  world.keepLoose(flame);
  const light = new THREE.PointLight(0xffa03a, 5, 7, 1.9);
  light.position.set(x, 1.0, z);
  world.add(light);
  const cp = { id, x, z, r: 1.3, flame, light, reached: false };
  world.checkpoints.push(cp);
  world.onAnimate((t) => {
    const s = cp.reached ? 1.25 : 0.8;
    flame.scale.setScalar(s + 0.14 * Math.sin(t * 9 + x));
    light.intensity = (cp.reached ? 7.5 : 4) + Math.sin(t * 11 + z) * 0.8;
  });
  world.markers.restSpot = { x, z };
}

function potion(world, x, z) {
  world.reserve(x, z, 1.2, 'potion');
  const { group, liquid } = buildPotionMesh();
  group.position.set(x, 0, z);
  world.add(group);
  world.keepLoose(group);
  world.onAnimate((t) => {
    group.position.y = 0.05 + Math.sin(t * 2.4 + x) * 0.06;
    group.rotation.y = t * 1.2;
    liquid.material.emissiveIntensity = 1.5 + Math.sin(t * 3.1 + z) * 0.5;
  });
  world.potionSpots.push({ x, z, group, taken: false });
  world.markers.potionSpot = { x, z };
}

// A frost gate across a doorway: three ice spurs that burst when open() runs.
// It is only ever the ANSWER to a puzzle in its own room, so it must not dress
// like the promise ice — it carries the game's act-here grammar, a pulsing
// GOLD ring, saying "this room opens me" (dad read the old look as "you need
// the frost wolf to proceed", one room after Pip taught that ice means frost).
function frostGate(world, x, z, span = 2.8) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xbfe8ff, emissive: 0x7ab8e8, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.88, roughness: 0.25,
  });
  for (const [ox, h, ry] of [[-span * 0.33, 1.7, 0.4], [0, 2.0, 2.2], [span * 0.33, 1.6, 4.0]]) {
    const spur = new THREE.Mesh(new THREE.ConeGeometry(0.42, h, 6), mat);
    spur.position.set(x + ox, h / 2, z);
    spur.rotation.y = ry;
    group.add(spur);
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(span * 0.42, span * 0.55, 26),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, (world.deckY || 0) + 0.06, z);
  group.add(ring);
  world.add(group);
  world.keepLoose(group);
  world.onAnimate((t) => {
    mat.emissiveIntensity = 0.35 + 0.15 * Math.sin(t * 1.7 + x);
    ring.material.opacity = 0.38 + 0.2 * Math.sin(t * 2.6);
  });
  world.markers.frostDoorSpot = { x, z };
  const collider = { minX: x - span / 2 - 0.4, maxX: x + span / 2 + 0.4, minZ: z - 0.8, maxZ: z + 0.8 };
  world.boxColliders.push(collider);
  world.reserve(x, z + 1.4, 2.2, 'frostgate');
  return {
    open: (silent = false) => {
      world.root.remove(group);
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      if (!silent) {
        audio.play('parry', { volume: 0.8, rate: 1.7 });  // the crack
        audio.play('puff', { volume: 0.85, rate: 1.2 });
      }
    },
  };
}

// The frozen lake surface, and the flag that makes pushed boulders SKID.
function iceSheet(world, minX, maxX, minZ, maxZ) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa8d8f0, emissive: 0x5f9fd0, emissiveIntensity: 0.25,
    transparent: true, opacity: 0.7, roughness: 0.12, metalness: 0.1,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), mat);
  sheet.rotation.x = -Math.PI / 2;
  // HEIGHT LAW: deck + 0.02, BELOW every plate decal, so the plates still read
  sheet.position.set((minX + maxX) / 2, (world.deckY || 0) + 0.02, (minZ + maxZ) / 2);
  world.add(sheet);
  world.keepLoose(sheet);
  world.onAnimate((t) => { mat.emissiveIntensity = 0.2 + 0.08 * Math.sin(t * 1.1); });
  world.slickFloor = true;
  return sheet;
}

// FROST BRAMBLE — the Verdant Wolf's own verb, reused up here (gates.js
// registerCuttable). Geometry, not a kit prop, so it never checks GREY().
function frostBramble(world, id, x, z) {
  const group = new THREE.Group();
  for (const [ox, oz, s, ry] of [[-0.4, 0, 1.0, 0.4], [0.4, -0.1, 1.1, 2.1], [0, 0.35, 0.9, 4.0]]) {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55 * s, 0),
      new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 0.9 })
    );
    m.position.set(x + ox, 0.4 * s, z + oz);
    m.rotation.y = ry;
    group.add(m);
  }
  const glint = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.06, 0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8fdc6a, emissiveIntensity: 1.7, roughness: 1 })
  );
  glint.position.set(x, 0.95, z);
  group.add(glint);
  world.add(group);
  world.keepLoose(group);
  world.onAnimate((t) => {
    glint.position.y = 0.95 + Math.sin(t * 2.1) * 0.1;
    glint.rotation.y = t * 1.4;
  });
  const collider = { minX: x - 1.0, maxX: x + 1.0, minZ: z - 0.85, maxZ: z + 0.85 };
  world.boxColliders.push(collider);
  world.markers.brambleSpot = { x, z, id };
  registerCuttable(world, { id, x, z, region: REGION, group, collider });
  return { id, collider };
}

// Promise ice with the chest showing behind it: the same call the v3.21 rooms
// made, plus the reservation the chest's approach needs.
function promiseIce(world, x, z, id) {
  iceGate(world, x, z, id, REGION);
  world.reserve(x, z, 1.4, 'ice:' + id);
}

// --- F1 — THE RIME GATE -----------------------------------------------------
export async function buildF1(scene) {
  const { world, spec, D } = base(scene, 'f1');
  const gaps = [gap('s'), gap('n'), gap('e')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 3, r: 6.5, kind: 'ice' }, { x: -10, z: -6, r: 3.8, kind: 'gravel' },
              { x: 10, z: 6, r: 3.4, kind: 'rubble' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [0, 4], [-3, -3], [0, -12]], [[1, 2], [8, 1], [15, 0]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  // BACK DOWN TO SYLVA'S GLADE. The v3.21 door said 'w5', a retired id that
  // resolveRoom redirects to tgl; it names the live room now.
  sideDoor(world, 's', halfW, halfD, 'tgl', { x: 0, z: -10.5, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'f2', { x: 0, z: 11, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'f1b', { x: -7, z: 0, angle: Math.PI / 2 });

  // THE GATEPOSTS: what makes this the Rime GATE. Two columns either side of
  // the road where the treeline ends and the mountain begins — in frame from
  // the south door, so the room has a hero a child can name.
  if (!GREY()) {
    for (const [x, z] of [[-2.6, -1.0], [2.6, -1.0]]) {
      const c = tinted(frostKit.column2, 'gatepost', D.propTint);
      c.position.set(x, 0, z); c.scale.setScalar(1.15); world.add(c);
      world.addCircle(x, z, 0.55);
    }
  }
  world.markers.heroSpot = { x: 0, z: -1.0 };
  world.reserve(0, -1.0, 2.2, 'gate lane');

  // BRACKETING THE CROSSING (gauntlet law — "the crossing costs"): one hound
  // either side of the road, staggered, so a straight line meets both and a
  // child who weaves still gets through clean.
  world.markers.houndSpots = [
    { x: -1.2, z: 2.4, variant: 'rime' }, { x: 1.4, z: -3.6, variant: 'rime' },
  ];
  world.markers.rimeSlimeSpots = [{ x: -2.0, z: -7.5 }];
  campfire(world, 'cp_f1', -8.5, 8.5);
  potion(world, 8.5, 8.0);
  world.markers.chestDefs = [
    { id: 'c_f1_gate', tier: 'wood', x: -12.5, z: -7.5, ry: 1.1, loot: { shards: 14 } },
  ];
  world.markers.breakables = [
    { x: 9.5, z: -7.0, kind: 'crate', shards: 3 }, { x: -5.5, z: 6.5, kind: 'crate', shards: 2 },
    { x: 11.0, z: 3.0, kind: 'barrel', shards: 3 },
  ];

  drift(world, [
    ['rockL', -9.5, -3.5, 1.3, 0.7, 0.95], ['rockL', 9.5, -4.0, 1.25, 2.3, 0.9],
    ['rockM', -6.0, 1.0, 1.3, 1.2, 0.6], ['rockM', 6.5, 3.5, 1.25, 0.4, 0.6],
    ['pile', -11.0, 3.0, 1.6, 2.8, 0], ['pile', 11.5, 6.5, 1.5, 3.4, 0],
    ['rockS', -4.5, 8.5, 1.2, 0.3, 0.45], ['rockS', 4.0, 9.5, 1.2, 1.9, 0.45],
    ['pile', -7.5, 11.0, 1.4, 0.8, 0], ['pile', 6.0, 11.5, 1.5, 2.2, 0],
    ['rockM', -12.5, 9.5, 1.2, 1.4, 0.6], ['rockM', 13.0, 10.0, 1.25, 0.6, 0.6],
    ['rockS', -2.5, 6.0, 1.1, 2.6, 0.4], ['rockS', 8.0, 6.5, 1.1, 0.9, 0.4],
  ]);
  firs(world, -11, 6, 2.4, 5, 11);
  firs(world, 10.5, 9.5, 2.2, 4, 12);
  firs(world, -13, -1, 2.0, 4, 13);
  firs(world, 12.5, -8, 2.2, 4, 14);
  fallenColumn(world, -6.5, 9.0, 0.5, D, 3.0);
  fallenColumn(world, 7.0, -8.5, -0.9, D, 2.8);
  rubbleField(world, -3.5, 10.5, 2.0, D, 9);
  rubbleField(world, 4.5, 6.0, 1.8, D, 8);
  lowWall(world, -9.0, 0.5, 0.2, D, 2.8);
  lowWall(world, 9.5, 1.0, -0.3, D, 2.6);
  mountain(world, halfW, halfD, gaps, 41, [{ minX: -2.5, maxX: 2.5, minZ: -12, maxZ: 12 }]);
  scatter(world, halfW, halfD, D, 41, 6, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  return finish(world, spec, D);
}

// --- F1b — THE FROZEN CAIRN (branch: a pup, and a chest sealed behind ice) --
export async function buildF1b(scene) {
  const { world, spec, D } = base(scene, 'f1b');
  const gaps = [gap('w')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 2, z: 0, r: 4.5, kind: 'ice' }, { x: -5, z: 5, r: 2.6, kind: 'gravel' }],
    paths: [[[-9, 0], [-3, 0], [3, -1], [7, -3]]],
  });
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'f1', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK

  // THE CAIRN NOOK: a rock spur walls it, the ice seals the only way in. The
  // Frost Wolf is still up the mountain, so this is a PROMISE — come back.
  //
  // THREE SIDES OF RIDGE AND THE ICE IN THE MOUTH. The first cut of this
  // nook walled its south side only; a flood-fill from the spawn found the
  // chest reachable round the west end of the ridge with the ice untouched —
  // a promise gate that is not the only way in is decoration (la's rule).
  // The mouth is 2.8u between the ridge ends; the ice's 1.0u collider in the
  // middle of it leaves two slivers narrower than Kael (0.64u).
  snowRidge(world, 3.4, -3.6, 4.6, -3.6);
  snowRidge(world, 7.4, -3.6, 9.5, -3.6);
  snowRidge(world, 3.4, -3.6, 3.4, -7.4);
  promiseIce(world, 6.0, -3.6, 'f_cairn');
  world.markers.chestDefs = [
    // THE RIME PLATE — Frostpeak's own armour, findable, not only buyable
    { id: 'c_f1b_ice', tier: 'gold', x: 7.5, z: -6.5, ry: -1.6,
      loot: { shards: 22, heartPiece: 1, armour: 'frost' } },
    { id: 'c_f1b_cairn', tier: 'wood', x: -7.5, z: -5.5, ry: 0.8, loot: { shards: 12, potion: 1 } },
  ];
  world.markers.slimeSpots = [{ x: -2.0, z: 4.0, variant: 'snowblob' }];
  world.markers.visoredWightSpots = [{ x: 3.0, z: 1.5 }];
  world.markers.pup10Spot = { x: 0.5, z: -5.5 };
  world.markers.breakables = [{ x: 7.5, z: 4.5, kind: 'barrel', shards: 3 }];

  // the cairn itself — a stack of stones someone raised before the ice took it
  drift(world, [
    ['rockL', -4.0, -4.5, 1.4, 0.9, 0.95], ['rockM', -1.5, -6.0, 1.2, 1.7, 0.6],
    ['rockM', 5.5, 5.0, 1.3, 2.2, 0.6], ['pile', 1.5, 6.0, 1.6, 1.2, 0],
    ['rockS', -5.5, 3.0, 1.1, 0.4, 0.4], ['rockS', 8.5, 1.5, 1.1, 2.0, 0.4],
    ['pile', -8.0, 5.5, 1.4, 0.3, 0],
  ]);
  wayshrine(world, -3.5, -2.5, 0.6, D);
  firs(world, 8.0, 5.5, 1.6, 3, 21);
  firs(world, -7.5, -3.0, 1.4, 3, 22);
  rubbleField(world, 4.0, 3.0, 1.6, D, 7);
  mountain(world, halfW, halfD, gaps, 42, [{ minX: -9, maxX: 3, minZ: -2, maxZ: 2 }]);
  return finish(world, spec, D);
}

// --- F2 — THE ICEBOUND HALL (PUZZLE DOOR 1) ---------------------------------
// Three braziers under ice. BREATHE to melt the shell, SLAM to light the bowl
// — two fire verbs chained. Anything melted and left unlit seals over again,
// so the kids learn to finish what they start. Kept BRIGHT on purpose: a timer
// and a dark room together is cruelty, not difficulty.
export async function buildF2(scene) {
  const { world, spec, D } = base(scene, 'f2');
  const gaps = [gap('s'), gap('n'), gap('e')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: -3, r: 7.5, kind: 'ice' }, { x: -11, z: 7, r: 3.4, kind: 'gravel' },
              { x: 11, z: -8, r: 3.4, kind: 'rubble' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [0, 2], [0, -12]], [[1, 1], [8, 0.5], [15, 0]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'f1', { x: 0, z: -11, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'f3', { x: 0, z: 11, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 'f2b', { x: -7, z: 0, angle: Math.PI / 2 });

  const done = () => !!WS.get(REGION, 'braziers');
  const gate = frostGate(world, 0, -halfD - 0.05, 2.8);
  if (done()) gate.open(true);
  let litCount = 0;
  const onLit = () => {
    litCount++;
    audio.play('pup-chime', { volume: 0.7, rate: 1.1 + litCount * 0.15 }); // rising
    if (litCount >= 3 && !done()) {
      WS.set(REGION, 'braziers');
      gate.open();
      audio.play('checkpoint', { volume: 0.9, rate: 1.2 });
    }
  };
  // THE BOWLS keep their v3.21 spacing (5.4u apart): the refreeze clock is
  // tuned to the run between them, and a bigger room is not a reason to make
  // a five-year-old sprint further against it. Gentle mode thaws far longer.
  const REFREEZE = state.settings.easy ? 45 : 26;
  const B = [
    brazier(world, prepareModel, frostKit.torch, 'f2_b1', -5.4, -1.2, onLit),
    brazier(world, prepareModel, frostKit.torch, 'f2_b2', 0, -4.2, onLit),
    brazier(world, prepareModel, frostKit.torch, 'f2_b3', 5.4, -1.2, onLit),
  ];
  if (done()) {
    for (const b of B) { b.lit = true; b.flame.visible = true; b.light.intensity = 5; }
  } else {
    for (const b of B) freezeBrazier(world, b, REFREEZE);
  }
  world.markers.brazierSpots = B.map((b) => ({ x: b.x, z: b.z }));
  for (const b of B) world.reserve(b.x, b.z, 2.0, 'brazier');

  // THE HALL: it had a roof once. Two rows of columns either side of the
  // bowls, a doorway still standing at the back, the walls slumped into the
  // snow — this is the hero, and it is the reason the room has a name.
  if (!GREY()) {
    for (const [x, z] of [[-8.5, -8.0], [-8.5, -3.0], [-8.5, 2.5], [8.5, -8.0], [8.5, -3.0], [8.5, 2.5]]) {
      const c = tinted(frostKit.column, 'hallcol', D.propTint);
      c.position.set(x, 0, z); c.scale.setScalar(1.1); world.add(c);
      world.addCircle(x, z, 0.5);
    }
  }
  world.markers.heroSpot = { x: 0, z: -4.2 };
  lowWall(world, -11.5, -10.0, 0.0, D, 3.2);
  lowWall(world, 11.5, -10.0, 0.0, D, 3.2);
  lowWall(world, -12.0, 5.5, 1.5, D, 2.8);
  lowWall(world, 12.0, 5.5, 1.5, D, 2.8);
  fallenColumn(world, -6.0, 8.5, 0.6, D, 3.2);
  fallenColumn(world, 6.5, 9.0, -0.8, D, 3.0);
  rubbleField(world, -11.0, -6.0, 2.2, D, 10);
  rubbleField(world, 11.0, 8.5, 2.0, D, 9);
  rubbleField(world, -3.5, 10.5, 1.8, D, 8);

  // one lone flyer, parked away from the braziers — flavour, not interference
  world.markers.mothSpots = [{ x: 9.0, z: 6.0, variant: 'frostmoth' }];
  world.markers.rimeMinionSpots = [{ x: -9.0, z: 6.5 }];
  campfire(world, 'cp_f2', -9.5, 10.0);
  potion(world, 9.5, 10.0);
  world.markers.chestDefs = [
    { id: 'c_f2_hall', tier: 'wood', x: -13.0, z: -10.5, ry: 1.3, loot: { shards: 16, potion: 1 } },
  ];
  world.markers.breakables = [
    { x: 12.5, z: 2.0, kind: 'crate', shards: 3 }, { x: -4.5, z: 6.0, kind: 'jar', shards: 2 },
    { x: 4.0, z: 5.5, kind: 'crate', shards: 2 },
  ];
  drift(world, [
    ['rockL', -13.5, -2.0, 1.3, 1.1, 0.95], ['rockL', 13.5, -4.5, 1.3, 2.6, 0.9],
    ['pile', -13.0, 3.0, 1.6, 0.4, 0], ['pile', 13.5, 0.5, 1.5, 1.9, 0],
    ['rockS', -7.0, 5.0, 1.1, 0.7, 0.4], ['rockS', 7.5, 4.5, 1.1, 2.3, 0.4],
    ['rockM', -2.5, 8.5, 1.2, 1.5, 0.6], ['rockM', 2.5, 8.0, 1.2, 0.2, 0.6],
    ['pile', -9.0, 12.0, 1.4, 0.8, 0], ['pile', 8.0, 12.0, 1.4, 2.4, 0],
  ]);
  firs(world, -12.5, 8.5, 2.0, 4, 31);
  firs(world, 12.5, 11.0, 1.8, 3, 32);
  mountain(world, halfW, halfD, gaps, 43, [{ minX: -7.5, maxX: 7.5, minZ: -13, maxZ: 1.5 }]);
  scatter(world, halfW, halfD, D, 43, 5, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  return finish(world, spec, D);
}

// --- F2b — THE GLACIER NOOK (branch: an Elder Rime Hound over a pup) --------
export async function buildF2b(scene) {
  const { world, spec, D } = base(scene, 'f2b');
  const gaps = [gap('w')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 3, z: 1, r: 4.8, kind: 'ice' }, { x: -6, z: -5, r: 2.4, kind: 'rubble' }],
    paths: [[[-9, 0], [-2, 0], [4, 1]]],
  });
  world.spawn = { x: -7, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'f2', { x: 13.5, z: 0, angle: -Math.PI / 2 });   // LOOPS BACK

  world.markers.houndSpots = [{ x: 2.5, z: -0.5, variant: 'elderrime' }];
  world.markers.pup11Spot = { x: 6.5, z: -4.5 };
  // the thorn alcove: verdant's verb reused (W5 fix — earth was running three
  // regions straight), with the gold chest that answers it
  frostBramble(world, 'f2b_alcove', -5.0, -4.5);
  snowRidge(world, -8.5, -3.0, -6.5, -3.0);
  world.markers.chestDefs = [
    ...(WS.get(REGION, 'cut_f2b_alcove')
      ? [{ id: 'c_f2b_nook', tier: 'gold', x: -6.5, z: -6.0, ry: 0.9, loot: { shards: 20, gear: 'hammer_a' } }]
      : []),
  ];
  world.reserve(-6.5, -6.0, 1.4, 'nook chest');
  world.markers.breakables = [{ x: 7.0, z: 4.5, kind: 'barrel', shards: 3 }];

  drift(world, [
    ['rockL', -1.5, -3.5, 1.7, 0.8, 1.15], ['pile', 2.5, 4.0, 1.6, 1.2, 0],
    ['rockM', 6.0, -1.0, 1.3, 2.2, 0.6], ['rockM', -3.5, 4.5, 1.2, 0.5, 0.6],
    ['rockS', 8.0, 2.5, 1.1, 1.4, 0.4], ['pile', -8.0, 4.5, 1.4, 2.0, 0],
    ['rockL', 7.5, -6.0, 1.4, 1.6, 0.95],
  ]);
  firs(world, 4.5, 5.5, 1.6, 3, 51);
  firs(world, -2.0, -6.5, 1.4, 2, 52);
  rubbleField(world, 0.5, 5.5, 1.6, D, 7);
  mountain(world, halfW, halfD, gaps, 44, [{ minX: -9, maxX: 4, minZ: -2, maxZ: 2 }]);
  return finish(world, spec, D);
}

// --- F3 — THE FROZEN LAKE (PUZZLE DOOR 2) -----------------------------------
// The Stoneroot boulders, but the lake is SLICK. One push and the stone skids
// until something stops it, so the plan comes first: send each boulder
// EAST/WEST into the rock that stops it dead in a lane, then NORTH up that
// lane onto its plate. A low snow ridge closes every other route.
//
// THE NUMBERS ARE v3.21's, TO THE DECIMAL. Lane mouths at x ±3.0 with a true
// 2.0u collider corridor (snowRidge pads its box by 0.5 each side — the
// puzzle was once GEOMETRICALLY UNSOLVABLE because that pad was forgotten);
// stoppers at (±1.6, 1.6) r 0.75 so a boulder (r 0.62) comes to rest 1.37u
// short of centre, exactly at x ∓3.0; plates at (±3.0, -4.6). A skid ends at
// a wall, a rock or a plate (world.js), so the plates catch the boulders
// whatever the room's height is — the room is bigger, the puzzle is not.
export async function buildF3(scene) {
  const { world, spec, D } = base(scene, 'f3');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 9, r: 3.6, kind: 'gravel' }, { x: 12, z: 9, r: 3.4, kind: 'gravel' }],
    pathWidth: 2.6,
    paths: [[[0, 12], [0, 6]], [[-3, -6], [-1, -10], [0, -12]], [[3, -6], [1, -10], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'f2', { x: 0, z: -11, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'f4', { x: 0, z: 11, angle: Math.PI });

  // the lake itself — everything on it slides (Kael excepted, always)
  iceSheet(world, -15, 15, -12, 5.0);

  // THE RIDGE: no way north except the two lanes at x = ±3.
  snowRidge(world, -15.4, -1.5, -4.6, -1.5);
  snowRidge(world, -1.6, -1.5, 1.6, -1.5);
  snowRidge(world, 4.6, -1.5, 15.4, -1.5);
  // the STOPPERS (scale 0.8 ≈ collider 0.75 — a stopper must LOOK exactly as
  // wide as it blocks, or the boulder appears to sink into it when it lands)
  drift(world, [
    ['rockM', -1.6, 1.6, 0.8, 0.6, 0.75],
    ['rockM', 1.6, 1.6, 0.8, 2.4, 0.75],
  ]);
  pushableBoulder(world, prepareModel, frostKit.rockLB, -7.0, 1.6);
  pushableBoulder(world, prepareModel, frostKit.rockLB, 7.0, 1.6);
  plateSwitch(world, 'f3_p1', -3.0, -4.6, () => { if (world.checkLake) world.checkLake(); });
  plateSwitch(world, 'f3_p2', 3.0, -4.6, () => { if (world.checkLake) world.checkLake(); });
  world.markers.boulderSpot = { x: -7.0, z: 1.6 };
  // NOTHING ELSE STANDS ON THE LAKE. The whole playfield — the skid lines east
  // and west from each boulder, the lanes north to the plates — is reserved,
  // so no dresser can drop a rock where a boulder has to slide.
  world.reserve(0, -2.0, 11.5, 'the lake');

  const gate = frostGate(world, 0, -halfD - 0.05, 2.8);
  const solved = () => !!state.flags.plates.f3_p1 && !!state.flags.plates.f3_p2;
  if (solved()) gate.open(true);
  world.checkLake = () => {
    if (!solved()) return;
    gate.open();
    audio.play('checkpoint', { volume: 0.9, rate: 1.15 });
    world.checkLake = null;
  };

  world.markers.slimeSpots = [{ x: -9.0, z: 8.0, variant: 'snowblob' }];
  world.markers.glacierWardenSpots = [{ x: 9.5, z: 8.5 }];
  campfire(world, 'cp_f3', -13.0, 9.5);
  world.markers.chestDefs = [
    { id: 'c_f3_lake', tier: 'wood', x: -13.5, z: -10.5, ry: 1.2, loot: { shards: 16 } },
  ];
  world.markers.breakables = [
    { x: 13.5, z: 10.0, kind: 'crate', shards: 2 }, { x: -6.0, z: 11.0, kind: 'barrel', shards: 2 },
  ];
  // the shore: everything lives on the south bank and the two far corners
  drift(world, [
    ['rockL', -13.0, -8.0, 1.3, 0.8, 0.95], ['rockL', 14.0, -9.5, 1.3, 2.0, 0.9],
    ['pile', -10.0, 11.5, 1.6, 0.6, 0], ['pile', 10.0, 11.5, 1.5, 1.6, 0],
    ['rockM', -14.5, 5.0, 1.3, 1.1, 0.6], ['rockM', 14.5, 3.5, 1.25, 0.3, 0.6],
    ['rockS', -4.0, 9.0, 1.1, 0.5, 0.4], ['rockS', 4.5, 8.5, 1.1, 1.8, 0.4],
    ['pile', -8.0, 6.5, 1.3, 2.4, 0], ['pile', 7.5, 6.0, 1.3, 0.9, 0],
    ['rockM', -12.0, 12.0, 1.2, 1.7, 0.6], ['rockM', 13.0, 7.0, 1.2, 0.9, 0.6],
    ['rockS', -1.5, 12.0, 1.0, 1.1, 0.4], ['rockS', 2.0, 8.0, 1.0, 2.9, 0.4],
  ]);
  firs(world, -13.5, 11.0, 1.8, 4, 61);
  firs(world, 13.0, 11.5, 1.8, 4, 62);
  firs(world, -14.0, -12.0, 1.4, 2, 63);
  firs(world, 14.0, -12.0, 1.4, 2, 64);
  wayshrine(world, -8.5, 9.5, 0.4, D);
  rubbleField(world, 6.5, 10.5, 1.8, D, 8);
  mountain(world, halfW, halfD, gaps, 45, [{ minX: -13, maxX: 13, minZ: -13, maxZ: 5.5 }]);
  return finish(world, spec, D);
}

// --- F4 — THE WINDSCOUR (the gauntlet; and the rest before the summit) ------
export async function buildF4(scene) {
  const { world, spec, D } = base(scene, 'f4');
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: 0, r: 6.5, kind: 'ice' }, { x: -11, z: -6, r: 3.6, kind: 'rubble' },
              { x: 11, z: 5, r: 3.2, kind: 'gravel' }],
    pathWidth: 2.8,
    paths: [[[0, 12], [-3, 5], [-3, -3], [0, -12]]],
  });
  world.spawn = { x: 0, z: 11, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'f3', { x: 0, z: -11, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'f5', { x: 0, z: 10.5, angle: Math.PI });

  // THE SUMMIT DOOR, looming: the same gate grammar Ember's boss door wears,
  // open (the lake earned it), with the eyrie showing through it as haze.
  if (!GREY()) {
    bossGate(world, 0, -halfD, 0, frostKit.archDoor, D.wallTint,
      { open: true, portal: 0x9be3ff, height: 3.4 });
  }
  world.markers.bossDoorSpot = { x: 0, z: -10.5 };

  // the rime pack — the mountain's last stand before the summit
  world.markers.houndSpots = [
    { x: 4.0, z: -3.0, variant: 'rime' },
    { x: 0.5, z: 1.0, variant: 'elderrime' },
  ];
  world.markers.frostDragonlingSpots = [{ x: -4.5, z: -5.5 }];
  world.markers.slimeSpots = [{ x: -7.5, z: 4.0, variant: 'snowblob' }];
  world.markers.mothSpots = [{ x: 8.0, z: 2.5, variant: 'frostmoth' }];
  world.markers.pup12Spot = { x: -12.0, z: 6.0 };
  // one more ice-sealed promise, in plain sight of the boss door — in a corner
  // nook the ridge closes on two sides (the cliff makes the other two), with
  // the ice in its one mouth. The v3.21 room stood the ice BESIDE the chest and
  // the chest could be walked to round it; that was never measured until the
  // rebuild's flood-fill.
  snowRidge(world, 10.5, -6.0, 11.4, -6.0);
  snowRidge(world, 14.6, -6.0, 15.4, -6.0);
  snowRidge(world, 10.5, -6.0, 10.5, -12.4);
  promiseIce(world, 13.0, -6.0, 'f_scour');
  world.markers.chestDefs = [
    { id: 'c_f4_scour', tier: 'gold', x: 13.5, z: -9.0, ry: -1.4, loot: { shards: 24, heartPiece: 1 } },
  ];
  // rest before the door (contract law): flame + potion side by side
  campfire(world, 'cp_f4', -2.4, -7.0);
  potion(world, 2.4, -7.0);
  world.markers.breakables = [
    { x: -11.0, z: 10.0, kind: 'crate', shards: 3 }, { x: 11.5, z: 9.5, kind: 'barrel', shards: 3 },
    { x: 7.0, z: -9.5, kind: 'crate', shards: 2 },
  ];

  // THE SCOUR: the wind has stripped this shelf to rock and the snow lies in
  // drifts against everything that stood still long enough
  drift(world, [
    ['rockL', -8.5, -2.5, 1.35, 0.7, 0.95], ['rockL', 8.0, -1.0, 1.3, 2.3, 0.9],
    ['rockM', -12.5, -8.0, 1.3, 1.1, 0.6], ['rockM', 8.5, -10.5, 1.3, 0.3, 0.6],
    ['pile', -5.5, 4.5, 1.6, 1.8, 0], ['pile', 5.0, -5.5, 1.5, 3.9, 0],
    ['rockS', -3.5, 8.0, 1.1, 0.6, 0.4], ['rockS', 4.5, 7.5, 1.1, 2.1, 0.4],
    ['pile', -9.5, 9.0, 1.4, 0.4, 0], ['pile', 9.0, 8.0, 1.4, 1.3, 0],
    ['rockM', -13.5, 2.0, 1.2, 1.9, 0.6], ['rockM', 13.5, 1.5, 1.2, 0.8, 0.6],
    ['rockL', -6.0, -10.0, 1.3, 1.4, 0.95], ['rockS', 1.5, 6.0, 1.0, 1.0, 0.4],
    ['rockS', -7.5, 0.0, 1.0, 2.5, 0.4],
  ]);
  firs(world, -12.5, 10.5, 1.8, 3, 71);
  firs(world, 12.0, 11.0, 1.8, 3, 72);
  fallenColumn(world, 7.5, 5.0, 0.4, D, 3.0);
  fallenColumn(world, -9.5, 6.5, -0.7, D, 2.8);
  rubbleField(world, 2.0, 9.5, 1.8, D, 8);
  rubbleField(world, -12.5, -3.0, 2.0, D, 9);
  lowWall(world, 6.5, 10.5, 0.1, D, 2.6);
  mountain(world, halfW, halfD, gaps, 46, [{ minX: -4.5, maxX: 4.5, minZ: -13, maxZ: 12 }]);
  scatter(world, halfW, halfD, D, 46, 5, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  return finish(world, spec, D);
}

// --- F5 — BOREAL'S EYRIE (the summit; the first boss that FLIES) ------------
export async function buildF5(scene) {
  const { world, spec, D } = base(scene, 'f5');
  const onward = !!state.flags.borealDefeated;
  // The north gap is ALWAYS cut: plugged with rime-caked boulders while Boreal
  // flies, opened live (smoke poof, main.js) the moment she is calmed, so the
  // way on appears where the child is standing instead of on re-entry.
  const gaps = [gap('s'), gap('n')];
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: 0, z: -2, r: 7, kind: 'ice' }, { x: -9, z: 8, r: 3.2, kind: 'gravel' },
              { x: 9, z: 8, r: 3.2, kind: 'gravel' }],
    paths: [[[0, 12], [0, 6]], [[0, -6], [0, -12]]],
  });
  world.spawn = { x: 0, z: 10.5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'f4', { x: 0, z: -11, angle: 0 });
  // ...AND THE ROAD DOWN HAS A TOWN ON IT: the Drowned Market (levelMarket.js)
  // sits between the summit and Stormreach's cliffs.
  if (onward) {
    sideDoor(world, 'n', halfW, halfD, 'q1', { x: 0, z: 11, angle: Math.PI });
  } else {
    const plug = new THREE.Group();
    for (const [kind, x, z, s, ry] of [
      ['rockM', -1.0, -12.1, 1.25, 0.7], ['rockL', 0.1, -12.4, 1.35, 2.1],
      ['rockM', 1.1, -12.0, 1.15, 4.0],
    ]) {
      if (GREY()) continue;
      const m = prepareModel(frostKit[kind].scene.clone());
      m.position.set(x, 0, z);
      m.rotation.y = ry;
      m.scale.setScalar(s);
      plug.add(m);
    }
    world.add(plug);
    world.keepLoose(plug);      // flattenStatic must not fold in a removable
    const collider = { minX: -2.0, maxX: 2.0, minZ: -13.2, maxZ: -11.3 };
    world.boxColliders.push(collider);
    world.onwardSpot = { x: 0, z: -12.1, w: 3.4, d: 1.6 };
    world.openOnward = () => {
      world.root.remove(plug);
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      world.addDoor(-1.2, 1.2, -halfD - 1.0, -halfD + 0.15, 'q1', { x: 0, z: 11, angle: Math.PI });
      world.openOnward = null;
    };
  }
  world.reserve(0, -11.5, 2.4, 'the way down');

  // THE STANDING STONES round the RIM only — cover to break a dive line, never
  // a maze. A dive that ends on top of a boulder buries the gold punish ring,
  // and that ring is the whole fight. The middle stays clear for her to crash
  // onto: reserved, so no dresser can wander into it.
  world.reserve(0, -1.0, 8.0, 'the eyrie');
  drift(world, [
    ['rockL', -10.4, -6.4, 1.35, 0.8, 0.95], ['rockL', 10.4, -6.2, 1.3, 2.2, 0.9],
    ['rockL', -10.2, 5.4, 1.3, 1.2, 0.9], ['rockL', 10.2, 5.6, 1.3, 3.1, 0.9],
    ['rockM', -10.9, -10.4, 1.3, 0.5, 0.6], ['rockM', 5.0, -11.0, 1.3, 1.9, 0.6],
    ['pile', -11.0, 0.0, 1.6, 0.4, 0], ['pile', 11.0, -0.5, 1.5, 1.9, 0],
    ['rockS', -9.5, 9.5, 1.1, 0.7, 0.4], ['rockS', 9.5, 9.5, 1.1, 2.3, 0.4],
  ]);
  if (!GREY()) {
    // and the stones people RAISED here, before it was hers
    for (const [x, z] of [[-11.5, -3.0], [11.5, -3.0], [-11.5, 3.0], [11.5, 3.0]]) {
      const c = tinted(frostKit.pillar, 'menhir', D.propTint);
      c.position.set(x, 0, z); c.scale.setScalar(1.3); world.add(c);
      world.addCircle(x, z, 0.5);
    }
  }
  world.markers.heroSpot = { x: 0, z: -2.5 };

  if (!onward) {
    world.markers.bossSpot = { x: 0, z: -1.0, kind: 'boreal' };
  } else {
    // THE CALMED SUMMIT: the storm lifts, her rime-light rests on the stones
    world.bgColor = 0x2c4560;
    // HER LIGHT RESTS ON THE STONES — so it needs stones to rest on. This was a
    // bare glowing ball hovering at y 1.4 over open arena floor, the same shape
    // dad tapped twice in the shrine rooms and called a floating orb. The game
    // already has one treatment for a light that means something (levelkit's
    // spiritShrine: a heart over a floor ring, a halo, and a column standing
    // out of it), used at Ember, the Vault, the Woods and the Spire — so the
    // memorials use it too, and every meaningful light in the game now reads
    // the same way.
    spiritShrine(world, 0, -2.5, 0x9be3ff, 0.7);
    world.markers.borealShrine = { x: 0, z: -2.5 };
    world.markers.healed = true;
  }
  // GRANT + 30s law: the instant the Frost Wolf is earned there is ice RIGHT
  // HERE to shatter with it — the new verb pays out before the kid leaves
  // — in a corner nook of the rim, outside her crash zone, ridge on two sides
  // and the ice in the mouth, so the payout is a real shatter and not a walk
  // round a block (the v3.21 chest sat 1.3u from its ice, on open ground).
  snowRidge(world, 7.5, -9.5, 8.6, -9.5);
  snowRidge(world, 11.4, -9.5, 12.4, -9.5);
  snowRidge(world, 7.5, -9.5, 7.5, -12.4);
  promiseIce(world, 10.0, -9.5, 'f_eyrie');
  world.markers.chestDefs = [
    ...(onward
      ? [{ id: 'c_f5_summit', tier: 'gold', x: -4.0, z: -5.0, ry: 0.7, loot: { shards: 32, powerup: 'star' } }]
      : []),
    { id: 'c_f5_ice', tier: 'gold', x: 10.5, z: -11.5, ry: -2.2, loot: { shards: 26, heartPiece: 1 } },
  ];
  campfire(world, 'cp_f5', -9.5, 9.0);
  world.markers.breakables = [{ x: 9.0, z: 9.0, kind: 'crate', shards: 2 }];
  firs(world, -11.0, 10.0, 1.4, 2, 81);
  firs(world, 11.5, 10.5, 1.4, 2, 82);
  rubbleField(world, -6.5, 10.5, 1.6, D, 7);
  rubbleField(world, 6.0, 10.5, 1.6, D, 7);
  mountain(world, halfW, halfD, gaps, 47, [{ minX: -8.5, maxX: 8.5, minZ: -10, maxZ: 8 }]);
  return finish(world, spec, D);
}

export const LEVEL4_ROOMS = {
  f1: buildF1, f1b: buildF1b, f2: buildF2, f2b: buildF2b, f3: buildF3, f4: buildF4, f5: buildF5,
};
