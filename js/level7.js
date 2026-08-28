// LEVEL 7 — THE SHADOW COURT, built to design/LEVEL-DESIGN-7.md.
//
// Topology: A HUB WITH FOUR LOCKED WINGS, AND A THRONE. Level 2's shape,
// returned to at the very end of the game with every tool in hand — deliberate,
// because the shape a child learned second is the shape they finish on, and a
// finale that needs explaining is a finale that has gone wrong.
//
// Each wing is OPENED by one verb and SOLVED with a second. That is the
// "combine your tools" lesson six regions have been building toward, and it is
// the only thing this level asks that the game has not asked before.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { loadGLB } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow, potSpotsOrFewer,
  reserveLandings } from './levelkit.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { makeDressers } from './dressing.js';
import { registerDistrictTints } from './districts.js';
import { galeLane, buildWindField } from './wind.js';
import { waterZone, buildWaterField, quenchable } from './water.js';

let courtKit = null;
const GREY = () => !courtKit || state.settings.greybox !== false;

export const REGION = 'court';

// THE FOUR RELICS. Held in WorldState, so a child who finds one, quits, and
// comes back tomorrow still has it.
export const RELICS = ['ember', 'thorn', 'tide', 'moon'];
export const hasRelic = (r) => !!WS.get(REGION, 'relic_' + r);
export const relicCount = () => RELICS.filter(hasRelic).length;

export const DISTRICTS = {
  court:  { tint: 0x6e5f96, floorTint: 0x685991, wallTint: 0x362b4e, propTint: 0x6a5f80,
            ground: 'court',      name: 'THE SHADOW COURT', hero: 'THE COURT GATE' },
  ash:    { tint: 0xb0654a, floorTint: 0x805850, wallTint: 0x442b24, propTint: 0x8a5a44,
            ground: 'ashwing',    name: 'THE ASH WING',     hero: 'THE COLD FORGE' },
  root:   { tint: 0x7aa54e, floorTint: 0x4f6844, wallTint: 0x263618, propTint: 0x6f8a4a,
            ground: 'rootwing',   name: 'THE ROOT WING',    hero: 'THE SPLIT TREE' },
  gale:   { tint: 0x8fa4c0, floorTint: 0x526277, wallTint: 0x273140, propTint: 0x7e8c9e,
            ground: 'galewing',   name: 'THE GALE WING',    hero: 'THE BROKEN VANE' },
  mirror: { tint: 0xa89ce0, floorTint: 0x635a95, wallTint: 0x332c51, propTint: 0x8f86b8,
            ground: 'mirrorwing', name: 'THE MIRROR WING',  hero: 'THE STANDING MIRRORS' },
  throne: { tint: 0xc9b8ff, floorTint: 0x6c5799, wallTint: 0x362a55, propTint: 0x7a6ea8,
            ground: 'throne',     name: 'THE THRONE',       hero: "GRIMM'S SEAT" },
};

const WING = { w: 26, d: 20 };
const STAIR = { w: 24, d: 12 };
const M = MODULES;

export const L7 = {
  x1:  { ...M.island, kind: 'island', district: 'court', spine: true, junction: true,
         label: 'THE COURT GATE', beat: 'the first watcher · THE LOCK IS SHOWN' },
  xsh: { ...M.pocket, kind: 'pocket', district: 'court', spine: true,
         label: "LUNA'S LIGHT", beat: 'GHOST WOLF · INTRODUCE' },
  xh:  { ...M.hub,    kind: 'hub',    district: 'court', spine: true, junction: true,
         label: 'THE GREAT HALL', beat: 'DEVELOP · four doors, two watchers' },

  xa1: { ...WING, kind: 'wing', district: 'ash', label: 'THE ASH WING', beat: 'burn the bar' },
  xa2: { ...M.pocket, kind: 'pocket', district: 'ash', label: 'THE COLD FORGE', beat: 'crack the vault' },
  xa3: { ...WING, kind: 'wing', district: 'ash', label: 'THE EMBER RELIC', beat: 'reward' },

  xr1: { ...WING, kind: 'wing', district: 'root', label: 'THE ROOT WING', beat: 'cut the tangle' },
  xr2: { ...M.pocket, kind: 'pocket', district: 'root', label: 'THE SPRING', beat: 'shatter the ice' },
  xr3: { ...WING, kind: 'wing', district: 'root', label: 'THE THORN RELIC', beat: 'reward' },

  xg1: { ...WING, kind: 'wing', district: 'gale', label: 'THE GALE WING', beat: 'dash the gale' },
  xg2: { ...M.pocket, kind: 'pocket', district: 'gale', label: 'THE DROWNED STAIR', beat: 'quench the fires' },
  xg3: { ...WING, kind: 'wing', district: 'gale', label: 'THE TIDE RELIC', beat: 'reward' },

  xm1: { ...WING, kind: 'wing', district: 'mirror', label: 'THE MIRROR WING', beat: 'walk past the watchers' },
  xm2: { ...M.island, kind: 'island', district: 'mirror', label: 'THE STANDING MIRRORS', beat: 'THE PUZZLE ROOM · TWIST' },
  xm3: { ...WING, kind: 'wing', district: 'mirror', label: 'THE MOON RELIC', beat: 'reward' },

  xp1: { ...M.pocket, kind: 'pocket', district: 'court', loopsTo: 'xh', label: 'The Undercroft', beat: 'optional · pup' },
  xp2: { ...M.pocket, kind: 'pocket', district: 'court', loopsTo: 'xh', label: 'The Long Gallery', beat: 'optional · chest' },
  xst: { ...STAIR, kind: 'stair', district: 'throne', spine: true, label: 'THE THRONE STAIR', beat: 'REST · the last rest' },
  xth: { ...M.arena, kind: 'arena', district: 'throne', spine: true, label: 'THE THRONE', beat: 'SHADOW-GRIMM' },
};

registerDistrictTints(L7, DISTRICTS);

export const SPINE = ['x1', 'xsh', 'xh', 'xst', 'xth'];
export const WINGS = {
  ash:    { rooms: ['xa1', 'xa2', 'xa3'], opens: 'fire_wolf',    solves: 'earth_wolf',   relic: 'ember' },
  root:   { rooms: ['xr1', 'xr2', 'xr3'], opens: 'verdant_wolf', solves: 'frost_wolf',   relic: 'thorn' },
  gale:   { rooms: ['xg1', 'xg2', 'xg3'], opens: 'storm_wolf',   solves: 'tide_wolf',    relic: 'tide' },
  mirror: { rooms: ['xm1', 'xm2', 'xm3'], opens: 'ghost_wolf',   solves: 'ghost_wolf',   relic: 'moon' },
};

export const TEACH = [
  { step: 'introduce', room: 'xsh', marker: 'teachWatcher',
    what: "Luna's light, and one watcher between it and the door" },
  { step: 'develop', room: 'xh', marker: 'watcherSpots',
    what: 'the great hall — two watchers pacing, four doors to reach past them' },
  { step: 'twist', room: 'xm2', marker: 'mirrorSpots',
    what: 'THE STANDING MIRRORS — shadow does not stop a ghost' },
  { step: 'conclude', room: 'xth', marker: 'bossSpot',
    what: 'Shadow-Grimm, who sees everything, fought with all six other verbs' },
];

export async function loadCourtKit() {
  if (courtKit) return courtKit;
  const names = {
    floor: './assets/env/floor-tile.glb', cliff: './assets/env/cliff-block.glb',
    rockLA: './assets/env/rock-large-a.glb', rockLB: './assets/env/rock-large-b.glb',
    rockLC: './assets/env/rock-large-c.glb', rockSA: './assets/env/rock-small-a.glb',
    rockSB: './assets/env/rock-small-b.glb', bridge: './assets/env/bridge-stone.glb',
    pillar: './assets/env/pillar.glb', bush: './assets/env/bush-large.glb',
    treeA: './assets/env/tree-a.glb', treeB: './assets/env/tree-b.glb',
    stump: './assets/env/stump.glb', flowerA: './assets/env/flower-a.glb',
    arch: './assets/env/dungeon/Arch.glb', archDoor: './assets/env/dungeon/Arch_Door.glb',
    archBars: './assets/env/dungeon/Arch_bars.glb', column: './assets/env/dungeon/Column.glb',
    column2: './assets/env/dungeon/Column2.glb', wallMod: './assets/env/dungeon/Wall_Modular.glb',
    wallCov: './assets/env/dungeon/WallCover_Modular.glb', decoWall: './assets/env/dungeon/Decorative_Wall.glb',
    brick: './assets/env/dungeon/Brick.glb', barrel: './assets/env/dungeon/Barrel.glb',
    crate: './assets/env/dungeon/Crate.glb', vase: './assets/env/dungeon/Vase.glb',
    skull: './assets/env/dungeon/Skull.glb', coins: './assets/env/dungeon/Coin_Pile.glb',
    pedestal: './assets/env/dungeon/Pedestal.glb', torch: './assets/env/dungeon/Torch.glb',
    woodfire: './assets/env/dungeon/Woodfire.glb', stairs: './assets/env/dungeon/Stairs_Modular.glb',
    horse: './assets/env/dungeon/Statue_Horse.glb', cobweb: './assets/env/dungeon/Cobweb.glb',
    banner: './assets/env/dungeon/Banner_wall.glb', spikes: './assets/env/dungeon/Spikes.glb',
    wolf: './assets/chars/wolf.gltf',
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  courtKit = Object.fromEntries(entries);
  return courtKit;
}

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward } =
  makeBuilders({ kit: () => courtKit, isGrey: () => GREY() });
const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);
const { ruinedHome, coldHearth, fallenColumn, rubbleField, wayshrine, aftermath,
  cartWreck, lowWall, place } =
  makeDressers({ kit: () => courtKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

const has = (form) => state.formsUnlocked.includes(form);

function base(scene, id) {
  const spec = L7[id];
  const world = new World(scene);
  world.roomId = id;
  reserveLandings(world, id);
  world.bgColor = 0x171128;
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  world.rebuildWind = () => {
    if (world._windMesh) {
      world.root.remove(world._windMesh);
      world._windMesh.geometry.dispose();
      if (world._windMesh.material.map) world._windMesh.material.map.dispose();
      world._windMesh.material.dispose();
    }
    world._windMesh = buildWindField(world);
  };
  world.rebuildWind();
  world._waterMeshes = buildWaterField(world);
  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#d8cfff', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#9a90b8', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// Four steps of weathering, for the reason Stormreach learned twice: a tint per
// prop is a material per prop, nothing batches, and the draw calls run away.
function aged(D, k) {
  const a = D.propTint, b = 0x2b2338;   // the court BLACKENS rather than bleaches
  const q = Math.round(Math.max(0, Math.min(1, k)) * 3) / 3;
  const t = q * 0.34;                   // ...but only until it is still a prop
  const mix = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return { ...D, propTint: (mix(16) << 16) | (mix(8) << 8) | mix(0) };
}

// The shared dresser, in room-relative coordinates — the Vale's, which is where
// this pattern was worked out. Clusters land in the arrival frame by
// construction rather than by me remembering to put them there.
function dressCourt(world, halfW, halfD, D, seed, opts = {}) {
  if (GREY()) return;
  let s0 = seed;
  const r = () => ((s0 = (s0 * 9301 + 49297) % 233280) / 233280);
  const a = (world.spawn && world.spawn.angle) || Math.PI;
  const fx = Math.sin(a), fz = Math.cos(a);
  const rx = fz, rz = -fx;
  const at = (ahead, across) => ({
    x: Math.max(-halfW + 2.4, Math.min(halfW - 2.4, world.spawn.x + fx * ahead + rx * across)),
    z: Math.max(-halfD + 2.4, Math.min(halfD - 2.4, world.spawn.z + fz * ahead + rz * across)),
  });
  const spots = [
    at(4.5, -8.5), at(6.5, 8.0), at(10.5, -4.0), at(11.5, 5.5),
    at(2.0, 9.5), at(8.5, 0.5), at(12.5, -9.0), at(3.0, -11.0),
  ];
  let i = 0;
  for (let h = 0; h < (opts.homes !== undefined ? opts.homes : 2); h++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 2.6)) {
      ruinedHome(world, p.x, p.z, r() * 6.28, aged(D, r()),
        { w: 5.5 + r() * 2, d: 4.5 + r() * 1.5, keep: 0.35 + r() * 0.4 });
    }
  }
  for (const maker of ['hearth', 'cart', 'shrine']) {
    const p = spots[i++ % spots.length];
    if (world.blocked(p.x, p.z, 1.8)) continue;
    if (maker === 'hearth') coldHearth(world, p.x, p.z, aged(D, r()));
    else if (maker === 'cart') cartWreck(world, p.x, p.z, r() * 6.28, aged(D, r()));
    else wayshrine(world, p.x, p.z, r() * 6.28, aged(D, r()));
  }
  for (let k = 0; k < 2; k++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 1.6)) fallenColumn(world, p.x, p.z, k ? 1 : 0, aged(D, r()), 4 + r() * 2);
  }
  for (let k = 0; k < 2; k++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 2.0)) rubbleField(world, p.x, p.z, 2.4 + r() * 1.2, aged(D, r()), 9 + Math.floor(r() * 5));
  }
  for (let k = 0; k < 2; k++) {
    const p = spots[i++ % spots.length];
    if (!world.blocked(p.x, p.z, 1.6)) lowWall(world, p.x, p.z, k ? 1.57 : 0, aged(D, r()), 3.5 + r() * 2);
  }
  const p = spots[i++ % spots.length];
  if (!world.blocked(p.x, p.z, 1.8)) aftermath(world, p.x, p.z, 2.2 + r() * 0.8, aged(D, r()), seed % 29);

  const KINDS = opts.kinds || ['barrel', 'crate', 'brick', 'skull', 'rockSA', 'vase'];
  for (let k = 0; k < (opts.loose || 16); k++) {
    const q = at(1.5 + r() * 12, (r() - 0.5) * 20);
    if (world.blocked(q.x, q.z, 0.7)) continue;
    const kind = KINDS[Math.floor(r() * KINDS.length) % KINDS.length];
    const big = kind.startsWith('rock');
    const g = new THREE.Group();
    g.position.set(q.x, 0, q.z);
    place(world, g, courtKit[kind], kind, 0, 0, 0, (big ? 0.7 : 0.85) + r() * 0.5,
      r() * 6.28, 0, aged(D, Math.floor(r() * 3) / 2).propTint, big);
    world.add(g);
    if (big) world.addCircle(q.x, q.z, 0.55, 'decor');
  }
}

// ---------------------------------------------------------------------------
// A WATCHER — the region's lock. A shadow sentinel that is SOLID while it can
// see Kael and steps aside when it cannot. Not a puzzle: a thing you walk past
// once you can, which is exactly what a lock should be.
// ---------------------------------------------------------------------------
function watcher(world, x, z, D) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x6e5f96, roughness: 1 })
    );
    m.position.y = 1.3;
    g.add(m);
  } else {
    // Dark, but a SHAPE. At 0x120c1c against the old floor this was a hole in
    // the room: you could see the gold eye and nothing holding it up, so there
    // was no body to read the state off. It is still the darkest thing in the
    // Court — it just has a silhouette now.
    place(world, g, courtKit.column, 'column', 0, 0, 0, 1.6, 0, 0, 0x33284c);
    place(world, g, courtKit.spikes, 'spikes', 0, 0, 0.9, 1.1, 0, 0, 0x3d3159, false);
  }
  // the eye: gold when it is looking, dark when it is not (act-here grammar
  // inverted on purpose — this is the one gold thing you do NOT walk into)
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd76a, emissiveIntensity: 2.2, roughness: 1 })
  );
  eye.position.y = 2.3;
  g.add(eye);
  const light = new THREE.PointLight(0xffd76a, 2.4, 8, 1.8);
  light.position.y = 2.3;
  g.add(light);
  world.add(g);

  const collider = { x, z, r: 1.5, tag: 'watcher' };
  world.circleColliders.push(collider);
  const w = { x, z, group: g, eye, light, blind: false, collider };
  world.watchers.push(w);
  world.reserve(x, z, 2.8, 'watcher');
  world.onAnimate((t) => {
    const blind = !!(world.player && world.player.ghosted);
    if (blind !== w.blind) {
      w.blind = blind;
      const i = world.circleColliders.indexOf(collider);
      if (blind && i >= 0) world.circleColliders.splice(i, 1);
      else if (!blind && i < 0) world.circleColliders.push(collider);
    }
    // THE POSE NEVER LIES: the eye is out when it cannot see, and the whole
    // sentinel sinks a little — it is not watching, so it is not standing to.
    eye.material.emissiveIntensity = blind ? 0.05 : 2.0 + Math.sin(t * 3) * 0.4;
    light.intensity = blind ? 0 : 2.2 + Math.sin(t * 3) * 0.5;
    g.position.y = blind ? -0.55 : 0;
    g.rotation.y = blind ? g.rotation.y : Math.sin(t * 0.7 + x) * 0.7;
  });
  return w;
}

// A relic on its pedestal — the thing a wing is for.
function relic(world, x, z, name, D) {
  if (hasRelic(name)) return null;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  if (!GREY()) place(world, g, courtKit.pedestal, 'pedestal', 0, 0, 0, 1.8, 0, 0, D.propTint);
  const COL = { ember: 0xff8a3a, thorn: 0x8fdc6a, tide: 0x4fd0e0, moon: 0xd8cfff }[name] || 0xffd76a;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3, 0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COL, emissiveIntensity: 2.6, roughness: 1 })
  );
  gem.position.y = 1.5;
  g.add(gem);
  const l = new THREE.PointLight(COL, 4.5, 11, 1.8);
  l.position.y = 1.7;
  g.add(l);
  world.add(g);
  world.addCircle(x, z, 0.7, 'relic');
  world.reserve(x, z, 2.8, 'relic');
  world.onAnimate((t) => { gem.position.y = 1.5 + Math.sin(t * 1.6) * 0.13; gem.rotation.y = t * 1.2; });
  // `gem` and `l` travel with the marker so the thing a child just picked up can
  // stop glowing on its pedestal the moment they pick it up, rather than on the
  // next visit to the room.
  (world.markers.relicSpots || (world.markers.relicSpots = [])).push({ x, z, name, gem, light: l });
  return g;
}

// ---------------------------------------------------------------------------
// THE SPINE
// ---------------------------------------------------------------------------
export async function buildX1(scene) {
  const { world, spec, D } = base(scene, 'x1');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'corruption', alpha: 0.3 },
              { x: 12, z: -8, r: 4.2, kind: 'rubble' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'ddp', { x: 0, z: 8, angle: Math.PI });
  sideDoor(world, 'n', halfW, halfD, 'xsh', { x: 0, z: 6, angle: Math.PI });
  world.markers.restSpot = { x: 8, z: 6 };
  world.markers.travelSpot = { x: -8, z: 6 };
  // THE LOCK, IN THE FIRST ROOM: a watcher standing over a gold chest, in
  // plain sight, unpassable and not dangerous. Walk up, look, come back.
  wallRun(world, -16, -6, -8.5, -6, D);
  wallRun(world, -16, -1.5, -8.5, -1.5, D);
  watcher(world, -8.5, -3.8, D);
  visibleReward(world, -13, -3.8, 'x7_gate', { shards: 30 });
  world.markers.watcherPromise = { x: -8.5, z: -3.8 };
  world.markers.houndSpots = [{ x: 7, z: -5, variant: 'shadewalker' }];
  scatter(world, halfW, halfD, D, 701, 6, { spin: 1, kinds: ['rockLA', 'brick', 'rockSB'] });
  dressCourt(world, halfW, halfD, D, 7011, { homes: 2 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXsh(scene) {
  const { world, spec, D } = base(scene, 'xsh');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: -3, r: 4.2, kind: 'corruption', alpha: 0.24 }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'x1', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'xh', { x: 0, z: 12, angle: Math.PI });
  world.markers.sparkSpot = { x: 0, z: -1.5, grants: 'ghost_wolf' };
  world.reserve(0, -1.5, 3.0, 'spark');
  world.markers.teachWatcher = { x: 0, z: -5.5 };
  world.markers.pupSpot = { x: -6.5, z: 3, id: 'pup_x3' };
  // INTRODUCE: one watcher, across the way out, and nothing else in the room.
  watcher(world, 0, -5.5, D);
  if (!GREY()) {
    const spark = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd8cfff, emissiveIntensity: 2.6, roughness: 1 })
    );
    spark.position.set(0, 1.5, -1.5);
    world.add(spark);
    const sl = new THREE.PointLight(0xd8cfff, 5.5, 14, 1.8);
    sl.position.set(0, 1.8, -1.5);
    world.add(sl);
    world.onAnimate((t) => {
      spark.position.y = 1.5 + Math.sin(t * 1.5) * 0.16;
      spark.rotation.y = t * 0.9;
      sl.intensity = 4.6 + Math.abs(Math.sin(t * 4)) * 1.6;
    });
    wayshrine(world, 0, -8, 0, aged(D, 0.4));
  }
  scatter(world, halfW, halfD, D, 702, 4, { spin: 1, kinds: ['brick', 'rockSB'] });
  dressCourt(world, halfW, halfD, D, 7021, { homes: 1, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// THE GREAT HALL. Four wing doors and the throne stair, and two watchers
// pacing between them — DEVELOP: the same tool, now with somewhere to go.
export async function buildXh(scene) {
  const { world, spec, D } = base(scene, 'xh');
  const open = relicCount() >= 4;
  // TWO ROOMS NOBODY COULD GET INTO. The Undercroft and the Long Gallery each
  // declare a south door home to this hall — and this hall declared no door to
  // either of them, so the only way in was not to exist. One holds a pup; the
  // other holds a gold chest with a heart piece and the moon armour in it. Every
  // other region's pocket rooms have their inbound door; the Court's did not,
  // and no suite noticed because a test reaches a room by naming it.
  const gaps = [gap('s'), gap('s', undefined, -10), gap('s', undefined, 10),
    gap('w', undefined, -8), gap('w', undefined, 8),
    gap('e', undefined, -8), gap('e', undefined, 8)];
  if (open) gaps.push(gap('n'));
  // `hub` is the POINT the worn paths bow through, not a flag — passing `true`
  // here threw "boolean true is not iterable" and took every room past the
  // shrine with it, because the hall is the door to all of them.
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    hub: [0, 0],
    patches: [{ x: -14, z: 9, r: 5.0, kind: 'corruption', alpha: 0.26 },
              { x: 14, z: -9, r: 4.6, kind: 'rubble' }],
  });
  world.spawn = { x: 0, z: 12, angle: Math.PI };
  // NOT -8, AND NOT ON THE CENTRE LINE EITHER. xsh is a pocket, half-depth 8, so
  // -8 is its north wall line — exactly where xsh's own door back to the Great
  // Hall lives. The child was put down standing inside that trigger and bounced
  // back on the next frame, and since xh has no travel stone the Court could be
  // entered and not left.
  //
  // The obvious repair, (0, -6), is also wrong: xsh's watcher stands at (0, -5.5)
  // with a 1.5u body, deliberately ACROSS THE WAY OUT — that is the whole lesson
  // of the room. Between the wall and the watcher there is a gap of 0.15u on the
  // centre line, which is no gap at all. So the landing steps aside instead:
  // 2.4 to the east, 2.5u clear of the watcher, still inside the north wall.
  sideDoor(world, 's', halfW, halfD, 'xsh', { x: 2.4, z: -6.2, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'xa1', { x: 11, z: 0, angle: Math.PI / 2 }, { centre: -8 });
  sideDoor(world, 'w', halfW, halfD, 'xr1', { x: 11, z: 0, angle: Math.PI / 2 }, { centre: 8 });
  sideDoor(world, 'e', halfW, halfD, 'xg1', { x: -11, z: 0, angle: -Math.PI / 2 }, { centre: -8 });
  sideDoor(world, 'e', halfW, halfD, 'xm1', { x: -11, z: 0, angle: -Math.PI / 2 }, { centre: 8 });
  // ...and the way in to each pocket, landing where its own spawn already sits.
  sideDoor(world, 's', halfW, halfD, 'xp1', { x: 0, z: 6, angle: Math.PI }, { centre: -10 });
  sideDoor(world, 's', halfW, halfD, 'xp2', { x: 0, z: 6, angle: Math.PI }, { centre: 10 });
  if (open) sideDoor(world, 'n', halfW, halfD, 'xst', { x: 0, z: 5, angle: Math.PI });

  world.markers.heroSpot = { x: 0, z: 0 };
  world.markers.restSpot = { x: -10, z: 8 };
  world.markers.relicDoor = { x: 0, z: -13, open };
  world.markers.watcherSpots = [{ x: -7, z: -4 }, { x: 7, z: 3 }];
  for (const w of world.markers.watcherSpots) watcher(world, w.x, w.z, D);

  // THE RELIC DOOR. Four sockets over the throne stair, one lit per relic — a
  // child can see how many are left without a word or a number anywhere.
  if (!GREY()) {
    const g = new THREE.Group();
    place(world, g, courtKit.arch, 'arch', 0, 0, -13, 2.4, 0, 0, D.propTint);
    for (let i = 0; i < 4; i++) {
      const lit = hasRelic(RELICS[i]);
      const COL = [0xff8a3a, 0x8fdc6a, 0x4fd0e0, 0xd8cfff][i];
      const socket = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({
          color: lit ? 0x000000 : 0x2a2438,
          emissive: lit ? COL : 0x000000, emissiveIntensity: lit ? 2.4 : 0, roughness: 1,
        })
      );
      socket.name = 'relicSocket';   // mounted on the arch, not resting on the floor
      socket.position.set(-2.4 + i * 1.6, 2.9, -13);
      g.add(socket);
      if (lit) { const l = new THREE.PointLight(COL, 2.2, 6, 1.8); l.position.copy(socket.position); g.add(l); }
    }
    world.add(g);
  }
  if (!open) world.addBox(-1.6, 1.6, -14.2, -12.4);

  // FOUR DOORS, FOUR COLOURS — a torch pair either side of each wing door, in
  // that wing's colour, and the SAME four colours the relic sockets over the
  // throne stair use. The hall is a junction: a child standing in the middle
  // has to be able to see there are four ways on, and then to remember which
  // one they have already done. Before this the doorways were unlit holes in a
  // dark wall, which is the actual reason the hall read as "too dark" — not
  // enough light, and nothing worth looking at where the light should have been.
  if (!GREY()) {
    const WING_DOORS = [
      { x: 11, z: -8, col: 0xff8a3a },   // the Ash Wing   — fire
      { x: 11, z: 8, col: 0x8fdc6a },   // the Root Wing  — verdant
      { x: -11, z: -8, col: 0x4fd0e0 },   // the Gale Wing  — storm/tide
      { x: -11, z: 8, col: 0xd8cfff },   // the Mirror Wing — moon
    ];
    for (const d of WING_DOORS) {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      // one tint per wing, not per torch — four materials, four batches
      for (const off of [-1.5, 1.5]) {
        place(world, g, courtKit.torch, 'torch', 0, 0, off, 1.5, 0, 0, d.col, false);
      }
      const l = new THREE.PointLight(d.col, 2.6, 9, 1.8);
      l.position.set(0, 2.1, 0);
      g.add(l);
      world.add(g);
    }
  }

  world.markers.maskboneSpots = [{ x: -4, z: 8 }];
  world.markers.houndSpots = [{ x: 5, z: -8, variant: 'shadewalker' }];
  scatter(world, halfW, halfD, D, 703, 7, { spin: 1, kinds: ['rockLA', 'brick', 'column'] });
  dressCourt(world, halfW, halfD, D, 7031, { homes: 3, loose: 18 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE FOUR WINGS.
//
// Each is OPENED by one verb and SOLVED with a second, which is the only thing
// this level asks that the game has not asked before. The opening lock is
// always in the first room and always has the relic visible past it, so a child
// who cannot open it yet knows exactly what they are missing and why.
// ---------------------------------------------------------------------------
function wingEntry(world, halfW, halfD, D, cfg) {
  // the barred door, in whatever material the wing's verb answers
  wallRun(world, -6, -4, -6, 4, D);
  wallRun(world, 6, -4, 6, 4, D);
  promiseGate(world, 0, -1.5, 4.2, 3.4, cfg.colour, cfg.label, cfg.prop,
    { system: cfg.system, id: cfg.id, region: REGION });
  world.markers.wingLock = { x: 0, z: -1.5, needs: cfg.needs };
}

export async function buildXa1(scene) {
  const { world, spec, D } = base(scene, 'xa1');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: -4, r: 4.4, kind: 'scorch' }, { x: -9, z: 6, r: 3.0, kind: 'ash' }],
  });
  world.spawn = { x: 11, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'xh', { x: -14, z: 0, angle: -Math.PI / 2, centre: -8 });
  sideDoor(world, 'w', halfW, halfD, 'xa2', { x: 8, z: 0, angle: Math.PI / 2 });
  // OPENED BY FIRE — the barred door burns, the way it did in region one
  wingEntry(world, halfW, halfD, D, {
    colour: 0xff8a3a, label: 'BARRED', prop: 'brick', system: 'burn',
    id: 'x_ash_bar', needs: 'fire_wolf',
  });
  world.markers.houndSpots = [{ x: -8, z: -5, variant: 'shadewalker' }];
  scatter(world, halfW, halfD, D, 711, 5, { spin: 1, kinds: ['brick', 'rockSA'] });
  dressCourt(world, halfW, halfD, D, 7111, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXa2(scene) {
  const { world, spec, D } = base(scene, 'xa2');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 4.6, kind: 'scorch' }],
  });
  world.spawn = { x: 8, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'xa1', { x: -11, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'xa3', { x: 11, z: 0, angle: Math.PI / 2 });
  // SOLVED WITH EARTH — the vault at the end of it cracks
  wallRun(world, -9, -4, -9, 4, D);
  promiseGate(world, -6.5, 0, 3.4, 4.6, 0xd8b06a, 'CRACKED', 'rockLB',
    { system: 'crack', id: 'x_ash_vault', region: REGION });
  world.markers.wingSolve = { x: -6.5, z: 0, needs: 'earth_wolf' };
  world.markers.gloomSlimeSpots = [{ x: 3, z: -4 }];
  scatter(world, halfW, halfD, D, 712, 4, { spin: 1, kinds: ['brick', 'coins'] });
  dressCourt(world, halfW, halfD, D, 7121, { homes: 1, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXa3(scene) {
  const { world, spec, D } = base(scene, 'xa3');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {
    patches: [{ x: 0, z: -2, r: 5.0, kind: 'scorch' }],
  });
  world.spawn = { x: 11, z: 0, angle: Math.PI / 2 };
  // LANDS ON FLOOR — see verify-reachable's landing sweep.
  sideDoor(world, 'e', halfW, halfD, 'xa2', { x: -7.1, z: 3.3, angle: -Math.PI / 2 });
  relic(world, -6, 0, 'ember', D);
  world.markers.gildedHuskSpots = [{ x: 2, z: 5 }];
  scatter(world, halfW, halfD, D, 713, 5, { spin: 1, kinds: ['brick', 'coins', 'vase'] });
  dressCourt(world, halfW, halfD, D, 7131, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXr1(scene) {
  const { world, spec, D } = base(scene, 'xr1');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: -4, r: 4.4, kind: 'moss' }, { x: -9, z: 6, r: 3.0, kind: 'grass' }],
  });
  world.spawn = { x: 11, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'xh', { x: -14, z: 0, angle: -Math.PI / 2, centre: 8 });
  sideDoor(world, 'w', halfW, halfD, 'xr2', { x: 8, z: 0, angle: Math.PI / 2 });
  wingEntry(world, halfW, halfD, D, {
    colour: 0x8fdc6a, label: 'TANGLED', prop: 'bush', system: 'cut',
    id: 'x_root_tangle', needs: 'verdant_wolf',
  });
  world.markers.houndSpots = [{ x: -8, z: 5, variant: 'shadewalker' }];
  scatter(world, halfW, halfD, D, 721, 5, { spin: 1, kinds: ['stump', 'treeA', 'rockSA'] });
  dressCourt(world, halfW, halfD, D, 7211, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXr2(scene) {
  const { world, spec, D } = base(scene, 'xr2');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w')], D, {
    patches: [{ x: 0, z: 0, r: 4.6, kind: 'ice' }],
  });
  world.spawn = { x: 8, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'xr1', { x: -11, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'xr3', { x: 11, z: 0, angle: Math.PI / 2 });
  wallRun(world, -9, -4, -9, 4, D);
  promiseGate(world, -6.5, 0, 3.4, 4.6, 0x9be3ff, 'FROZEN', 'rockSB',
    { system: 'shatter', id: 'x_root_ice', region: REGION });
  world.markers.wingSolve = { x: -6.5, z: 0, needs: 'frost_wolf' };
  world.markers.slimeSpots = [{ x: 3, z: 4, variant: 'gloomblob' }];
  scatter(world, halfW, halfD, D, 722, 4, { spin: 1, kinds: ['rockSB', 'stump'] });
  dressCourt(world, halfW, halfD, D, 7221, { homes: 1, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXr3(scene) {
  const { world, spec, D } = base(scene, 'xr3');
  const { halfW, halfD } = shell(world, spec, [gap('e')], D, {
    patches: [{ x: 0, z: -2, r: 5.0, kind: 'grass' }],
  });
  world.spawn = { x: 11, z: 0, angle: Math.PI / 2 };
  // LANDS ON FLOOR — see verify-reachable's landing sweep.
  sideDoor(world, 'e', halfW, halfD, 'xr2', { x: -7.1, z: 3.3, angle: -Math.PI / 2 });
  relic(world, -6, 0, 'thorn', D);
  world.markers.houndSpots = [{ x: 2, z: -5, variant: 'courtwarden' }];
  scatter(world, halfW, halfD, D, 723, 5, { spin: 1, kinds: ['treeB', 'bush', 'flowerA'] });
  dressCourt(world, halfW, halfD, D, 7231, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXg1(scene) {
  const { world, spec, D } = base(scene, 'xg1');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D, {
    patches: [{ x: 0, z: -4, r: 4.4, kind: 'gravel' }, { x: 9, z: 6, r: 3.0, kind: 'rubble' }],
  });
  world.spawn = { x: -11, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'xh', { x: 14, z: 0, angle: Math.PI / 2, centre: -8 });
  sideDoor(world, 'e', halfW, halfD, 'xg2', { x: -8, z: 0, angle: -Math.PI / 2 });
  // OPENED BY THE DASH. 3.8 across, the rule Stormreach learned: the dash
  // covers 5.2, and a gale as deep as the dash is long is not crossable.
  galeLane(world, { x: 2, z: 0, w: 3.8, d: 18, dir: 'w', strength: 'gale', id: 'x_gale' });
  visibleReward(world, 7, -6, 'x7_gale', { shards: 26 });
  world.markers.wingLock = { x: 2, z: 0, needs: 'storm_wolf' };
  world.markers.batSpots = [{ x: -6, z: -5, variant: 'shadewalker' }];
  scatter(world, halfW, halfD, D, 731, 5, { spin: 1, kinds: ['rockLC', 'brick'] });
  dressCourt(world, halfW, halfD, D, 7311, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXg2(scene) {
  const { world, spec, D } = base(scene, 'xg2');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D, {
    patches: [{ x: 0, z: 0, r: 4.6, kind: 'water' }],
  });
  world.spawn = { x: -8, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'xg1', { x: 11, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'xg3', { x: -11, z: 0, angle: -Math.PI / 2 });
  waterZone(world, { x: 0, z: 0, w: 14, d: 9, deep: false });
  // SOLVED WITH THE TIDE — three fires hold the door, and the splash ends them
  let out = 0;
  world.markers.wingSolve = { x: 6.5, z: 0, needs: 'tide_wolf' };
  world.markers.poolBraziers = [];
  for (const [bx, bz] of [[-3, -3], [0, 0], [3, 3]]) {
    world.markers.poolBraziers.push({ x: bx, z: bz });
    const g = new THREE.Group();
    g.position.set(bx, 0, bz);
    if (!GREY()) place(world, g, courtKit.woodfire, 'woodfire', 0, 0, 0, 1.5, 0, 0, D.propTint);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9, 7),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa03a, emissiveIntensity: 2.4, roughness: 1 })
    );
    flame.position.y = 1.0;
    g.add(flame);
    const li = new THREE.PointLight(0xffa03a, 3.0, 9, 1.8);
    li.position.y = 1.3;
    g.add(li);
    world.add(g);
    world.addCircle(bx, bz, 0.8, 'brazier');
    world.reserve(bx, bz, 2.2, 'brazier');
    quenchable(world, { x: bx, z: bz, id: 'xg2' + bx, onQuench: () => {
      flame.visible = false; li.intensity = 0;
      if (++out >= 3) { world.markers.puzzleSolved = true; WS.set(REGION, 'galeQuenched'); }
    } });
  }
  scatter(world, halfW, halfD, D, 732, 4, { spin: 1, kinds: ['brick', 'barrel'] });
  dressCourt(world, halfW, halfD, D, 7321, { homes: 1, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXg3(scene) {
  const { world, spec, D } = base(scene, 'xg3');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: 0, z: -2, r: 5.0, kind: 'gravel' }],
  });
  world.spawn = { x: -11, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'xg2', { x: 8, z: 0, angle: Math.PI / 2 });
  relic(world, 6, 0, 'tide', D);
  world.markers.houndSpots = [{ x: -2, z: 5, variant: 'courtwarden' }];
  scatter(world, halfW, halfD, D, 733, 5, { spin: 1, kinds: ['rockLB', 'coins'] });
  dressCourt(world, halfW, halfD, D, 7331, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXm1(scene) {
  const { world, spec, D } = base(scene, 'xm1');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D, {
    patches: [{ x: 0, z: -4, r: 4.4, kind: 'corruption', alpha: 0.24 }],
  });
  world.spawn = { x: -11, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'xh', { x: 14, z: 0, angle: Math.PI / 2, centre: 8 });
  sideDoor(world, 'e', halfW, halfD, 'xm2', { x: -8, z: 0, angle: -Math.PI / 2 });
  // three watchers in a line, which is only a wall while they can see you
  for (const wz of [-4.5, 0, 4.5]) watcher(world, 2, wz, D);
  world.markers.wingLock = { x: 2, z: 0, needs: 'ghost_wolf' };
  scatter(world, halfW, halfD, D, 741, 5, { spin: 1, kinds: ['column', 'brick'] });
  dressCourt(world, halfW, halfD, D, 7411, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// THE STANDING MIRRORS — the one puzzle room. The mirrors are SHADOW, and
// shadow does not stop a ghost: they are solid while Kael is solid, and he
// walks through them while he is not. TWIST: ghosting does not only hide him,
// it lets him PASS.
export async function buildXm2(scene) {
  const { world, spec, D } = base(scene, 'xm2');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D, {
    patches: [{ x: 0, z: 0, r: 6.0, kind: 'corruption', alpha: 0.2 }],
  });
  world.spawn = { x: -13, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'xm1', { x: 11, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'xm3', { x: -11, z: 0, angle: -Math.PI / 2 });
  world.markers.mirrorSpots = [];
  // three walls of mirror, staggered, so the way through is a zigzag you can
  // only walk while faded
  for (const [mx, mz, mw] of [[-5, -3, 10], [1, 4, 10], [7, -3, 10]]) {
    world.markers.mirrorSpots.push({ x: mx, z: mz });
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1430, emissive: 0x6e5f96, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.4,
    });
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, mw), mat);
    pane.position.set(mx, 1.6, mz);
    g.add(pane);
    world.add(g);
    const col = { minX: mx - 0.5, maxX: mx + 0.5, minZ: mz - mw / 2, maxZ: mz + mw / 2 };
    world.boxColliders.push(col);
    world.reserve(mx, mz, 1.4, 'mirror');
    world.onAnimate((t) => {
      const through = !!(world.player && world.player.ghosted);
      const i = world.boxColliders.indexOf(col);
      if (through && i >= 0) world.boxColliders.splice(i, 1);
      else if (!through && i < 0) world.boxColliders.push(col);
      // THE POSE NEVER LIES: solid when it stops you, nearly gone when it does not
      mat.opacity = through ? 0.16 : 0.72;
      mat.emissiveIntensity = through ? 0.12 : 0.5 + Math.sin(t * 2 + mx) * 0.12;
    });
  }
  world.markers.houndSpots = [{ x: -9, z: 7, variant: 'shadewalker' }];
  scatter(world, halfW, halfD, D, 742, 5, { spin: 1, kinds: ['column2', 'brick'] });
  dressCourt(world, halfW, halfD, D, 7421, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXm3(scene) {
  const { world, spec, D } = base(scene, 'xm3');
  const { halfW, halfD } = shell(world, spec, [gap('w')], D, {
    patches: [{ x: 0, z: -2, r: 5.0, kind: 'corruption', alpha: 0.2 }],
  });
  world.spawn = { x: -11, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'xm2', { x: 8, z: 0, angle: Math.PI / 2 });
  relic(world, 6, 0, 'moon', D);
  world.markers.houndSpots = [{ x: -2, z: -5, variant: 'courtwarden' }];
  scatter(world, halfW, halfD, D, 743, 5, { spin: 1, kinds: ['column', 'coins'] });
  dressCourt(world, halfW, halfD, D, 7431, { homes: 2, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXp1(scene) {
  const { world, spec, D } = base(scene, 'xp1');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 3.6, kind: 'rubble' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'xh', { x: -10, z: 8, angle: Math.PI });
  world.markers.pupSpot = { x: 0, z: -4, id: 'pup_x1' };
  scatter(world, halfW, halfD, D, 751, 4, { spin: 1, kinds: ['brick', 'skull'] });
  dressCourt(world, halfW, halfD, D, 7511, { homes: 1, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXp2(scene) {
  const { world, spec, D } = base(scene, 'xp2');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 3.6, kind: 'corruption', alpha: 0.2 }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'xh', { x: 10, z: 8, angle: Math.PI });
  world.markers.chestDefs = [{ id: 'c_xp2', tier: 'gold', x: 0, z: -4.2, ry: 0.3, loot: { shards: 40, heartPiece: 1, armour: 'moon' } }];
  world.reserve(0, -4.2, 2.6, 'chest');
  world.markers.houndSpots = [{ x: -5, z: 1, variant: 'shadewalker' }];
  world.markers.pupSpot = { x: 6.5, z: -1, id: 'pup_x2' };
  scatter(world, halfW, halfD, D, 752, 4, { spin: 1, kinds: ['coins', 'vase'] });
  dressCourt(world, halfW, halfD, D, 7521, { homes: 1, loose: 14 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildXst(scene) {
  const { world, spec, D } = base(scene, 'xst');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('n')], D, {
    patches: [{ x: 0, z: 0, r: 3.4, kind: 'corruption', alpha: 0.18 }],
  });
  world.spawn = { x: 0, z: 5, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'xh', { x: 0, z: -12, angle: 0 });
  sideDoor(world, 'n', halfW, halfD, 'xth', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.potionSpot = { x: -7, z: -3 };
  world.markers.chestDefs = [{ id: 'c_xst', tier: 'silver', x: 7, z: 3, ry: 0.2, loot: { potion: 3 } }];
  world.reserve(7, 3, 2.6, 'chest');
  if (!GREY()) {
    for (let i = 0; i < 8; i++) {
      const x = -9 + i * 2.6, z = (i % 2 ? 1 : -1) * 4.6;
      if (world.blocked(x, z, 0.7)) continue;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      place(world, g, courtKit.torch, 'torch', 0, 0, 0, 1.5, 0, 0, aged(D, (i % 3) / 2).propTint, false);
      world.add(g);
    }
  }
  scatter(world, halfW, halfD, D, 753, 4, { spin: 1, kinds: ['brick', 'column'] });
  dressCourt(world, halfW, halfD, D, 7531, { homes: 1, loose: 16 });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE THRONE
// ---------------------------------------------------------------------------
export async function buildXth(scene) {
  const { world, spec, D } = base(scene, 'xth');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 8.0, kind: 'corruption', alpha: 0.3 }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'xst', { x: 0, z: -5, angle: 0 });
  // the seat itself, at the back, and the rim of columns round the arena — the
  // middle stays clear, because a boss that crashes onto a boulder buries its
  // own punish ring
  if (!GREY()) {
    const g = new THREE.Group();
    place(world, g, courtKit.pedestal, 'pedestal', 0, 0, -9.5, 2.4, 0, 0, D.propTint);
    // CENTRED. Statue_Horse.glb is modelled 5.85u off its own origin in Z
    // (tools/probe-modelsize.mjs), so at this scale the statue was DRAWN metres
    // from the pedestal placed for it — floating at head height over open floor
    // with its collider back on the empty plinth. Same fault as the vase, an
    // order of magnitude worse, and nothing had ever measured a model against
    // its own pivot until tonight.
    place(world, g, courtKit.horse, 'horse', 0, 1.3, -9.5, 1.3, 0, 0, 0x1a1226, true, true);
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI * 2 / 10;
      const px = Math.cos(a) * 10.6, pz = Math.sin(a) * 10.6;
      place(world, g, i % 2 ? courtKit.column : courtKit.pillar, 'tcol' + (i % 2),
        px, 0, pz, 1.5, a, 0.04, aged(D, (i % 3) / 2).propTint);
      world.addCircle(px, pz, 1.1, 'hero');
    }
    world.add(g);
    world.heroMarks.push({ x: 0, z: -9.5 });
  }
  if (!state.flags.grimmFreed) {
    world.markers.bossSpot = { x: 0, z: -2.0, skin: 'grimm' };
  } else {
    // THE COURT AT PEACE. He is not gone — he is sitting there, old and tired
    // and himself, which is the whole point of the ending.
    world.bgColor = 0x2a2440;
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd8cfff, emissiveIntensity: 2.4, roughness: 1 })
    );
    heart.position.set(0, 1.6, -6.5);
    world.add(heart);
    const hl = new THREE.PointLight(0xd8cfff, 6, 16, 1.8);
    hl.position.set(0, 1.9, -6.5);
    world.add(hl);
    world.onAnimate((t) => { heart.position.y = 1.6 + Math.sin(t * 1.3) * 0.15; heart.rotation.y = t * 0.7; });
    world.markers.grimmSeat = { x: 0, z: -6.5 };
    world.markers.healed = true;
    world.markers.chestDefs = [
      { id: 'c_xth', tier: 'gold', x: -5, z: -5, ry: 0.6, loot: { shards: 60, powerup: 'star' } },
    ];
    world.reserve(-5, -5, 2.6, 'chest');
  }
  scatter(world, halfW, halfD, D, 761, 4, { spin: 1, kinds: ['brick', 'skull'] });
  for (const [x, z, k] of [[-10, 8, 0.2], [10, 8, 0.8], [-11, -5, 0.5], [11, -5, 0.9]]) {
    if (!world.blocked(x, z, 2.0)) rubbleField(world, x, z, 2.6, aged(D, k), 12);
  }
  fallenColumn(world, -8, 2, 1, aged(D, 0.4), 5);
  fallenColumn(world, 8, 2, 1, aged(D, 0.7), 5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export const LEVEL7_ROOMS = {
  x1: buildX1, xsh: buildXsh, xh: buildXh,
  xa1: buildXa1, xa2: buildXa2, xa3: buildXa3,
  xr1: buildXr1, xr2: buildXr2, xr3: buildXr3,
  xg1: buildXg1, xg2: buildXg2, xg3: buildXg3,
  xm1: buildXm1, xm2: buildXm2, xm3: buildXm3,
  xp1: buildXp1, xp2: buildXp2,
  xst: buildXst, xth: buildXth,
};
