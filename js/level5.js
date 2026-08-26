// LEVEL 5 — STORMREACH CLIFFS, built to design/LEVEL-DESIGN-5.md.
//
// Topology: A SWITCHBACK. Four terraces stacked up a sea cliff, joined by
// stairs that alternate direction — east across the first terrace, west across
// the second, east across the third. By region five the kids have walked a line
// (L1), a hub (L2) and a ring (L3); this is the first level whose shape is a
// DIRECTION rather than a place.
//
// There is no height engine, and this level does not pretend there is one. The
// climb is carried by four things that already work: the stairs reverse your
// heading, the palette lifts out of the storm district by district, the wind
// gets stronger the higher you go, and every terrace's south lip shows the
// colour of the terrace below spilling up over it.
//
// METRICS ARE INHERITED (design/METRICS.md) and unnegotiable. One new module —
// the 24 x 12 STAIR — goes into the metrics zoo before it is used at scale,
// which is the rule Level 2 set for the hub and Level 3 followed for the ring
// leg. A stair is narrower than a ring leg and longer than a Level 1 choke,
// because a stair should read as a passage with a direction rather than as a
// room you stop in.

import * as THREE from 'three';
import { World } from './world.js';
import { state } from './state.js';
import { protoLabel } from './proto.js';
import { loadGLB, prepareModel } from './assets.js';
import { makeBuilders, tintedModel, gap, MODULES, thresholdGlow, potSpotsOrFewer,
  reserveLandings, DOOR_HALF } from './levelkit.js';
import { flattenStatic } from './batch.js';
import { WS } from './worldstate.js';
import { makeDressers } from './dressing.js';
import { registerDistrictTints } from './districts.js';
import { galeLane, buildWindField, turnVane, WIND } from './wind.js';
import { canWade } from './water.js';
import { iceGate, boulderGate } from './gates.js';

let skyKit = null;
const GREY = () => !skyKit || state.settings.greybox !== false;

export const REGION = 'storm';

// ---------------------------------------------------------------------------
// DISTRICTS. One gradient, bottom to top, and it is the level's whole
// wayfinding system: a child always knows how high they are by the colour of
// the ground. Wet dark slate under cloud at the Landing; bare pale stone and
// open sky at the top.
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  landing:   { tint: 0x5d7086, floorTint: 0x4a5560, wallTint: 0x232b33, propTint: 0x6a7280,
               ground: 'landing',   name: 'THE LANDING',      hero: 'THE BROKEN GATEHOUSE' },
  galestair: { tint: 0x7d8ea0, floorTint: 0x5b6470, wallTint: 0x2b333c, propTint: 0x7c8492,
               ground: 'galestair', name: 'THE GALE STAIR',   hero: 'THE LEANING COLONNADE' },
  thunder:   { tint: 0x9a94b8, floorTint: 0x6b6e78, wallTint: 0x332f42, propTint: 0x8a8496,
               ground: 'thunder',   name: 'THE THUNDERHEAD',  hero: 'THE STRUCK PILLAR' },
  opensky:   { tint: 0xe6d9a8, floorTint: 0x8a8378, wallTint: 0x4a4438, propTint: 0xb0a48c,
               ground: 'opensky',   name: 'THE OPEN SKY',     hero: 'THE SKY SHRINE' },
  crown:     { tint: 0xfff0c0, floorTint: 0x9a9080, wallTint: 0x554e40, propTint: 0xc4b79a,
               ground: 'crown',     name: "ARIA'S CROWN",     hero: 'THE CROWN STONES' },
};

// The one new module.
const STAIR = { w: 24, d: 12 };

const M = MODULES;
export const L5 = {
  // ---- TERRACE 1 · THE LANDING (east) -------------------------------------
  s1a: { ...M.island, kind: 'island', district: 'landing', spine: true, junction: true,
         label: '1A · THE LANDING', beat: 'off the mountain, onto the sea cliffs' },
  s1b: { ...M.island, kind: 'island', district: 'landing', spine: true,
         label: '1B · THE LANDING', beat: 'first Gale Hounds · THE LOCK IS SHOWN' },
  s1p: { ...M.pocket, kind: 'pocket', district: 'landing', loopsTo: 's1b',
         label: 'The Winch Shed', beat: 'optional · pup' },
  sc1: { ...STAIR, kind: 'stair', district: 'landing', spine: true,
         label: 'THE FIRST STAIR', beat: 'REST · the climb begins' },

  // ---- TERRACE 2 · THE GALE STAIR (west) ----------------------------------
  s2a: { ...M.island, kind: 'island', district: 'galestair', spine: true, junction: true,
         label: '2A · THE GALE STAIR', beat: 'the colonnade · storm bats' },
  s2b: { ...M.island, kind: 'island', district: 'galestair', spine: true,
         label: '2B · THE GALE STAIR', beat: 'the wind has teeth now' },
  s2p: { ...M.pocket, kind: 'pocket', district: 'galestair', loopsTo: 's2a',
         label: 'The Shepherd’s Fold', beat: 'optional · chest' },
  ssh: { ...M.pocket, kind: 'pocket', district: 'galestair', spine: true,
         label: "ARIA'S SPARK", beat: 'STORM WOLF · INTRODUCE' },
  sc2: { ...STAIR, kind: 'stair', district: 'galestair', spine: true,
         label: 'THE SECOND STAIR', beat: 'DEVELOP · three winds, three answers' },

  // ---- TERRACE 3 · THE THUNDERHEAD (east) ---------------------------------
  s3a: { ...M.island, kind: 'island', district: 'thunder', spine: true, junction: true,
         label: '3A · THE THUNDERHEAD', beat: 'inside the cloud · the struck pillar' },
  s3b: { ...M.island, kind: 'island', district: 'thunder', spine: true,
         label: '3B · THE THUNDERHEAD', beat: 'the pack, and lanes that carry them' },
  s3p: { ...M.pocket, kind: 'pocket', district: 'thunder', loopsTo: 's3a',
         label: 'The Thunder Hollow', beat: 'optional · pup' },
  svn: { ...M.island, kind: 'island', district: 'thunder', spine: true,
         label: 'THE VANES', beat: 'THE PUZZLE ROOM · TWIST' },
  sc3: { ...STAIR, kind: 'stair', district: 'thunder', spine: true,
         label: 'THE THIRD STAIR', beat: 'REST · above the cloud' },

  // ---- TERRACE 4 · THE OPEN SKY (west) ------------------------------------
  s4a: { ...M.island, kind: 'island', district: 'opensky', spine: true, junction: true,
         label: '4A · THE OPEN SKY', beat: 'out of the storm · the whole climb below' },
  s4b: { ...M.island, kind: 'island', district: 'opensky', spine: true,
         label: '4B · THE OPEN SKY', beat: 'THE WIND GATE · CONCLUDE' },
  s4p: { ...M.pocket, kind: 'pocket', district: 'opensky', loopsTo: 's4b',
         label: 'The Cloudline Cache', beat: 'optional · chest' },
  sc4: { ...STAIR, kind: 'stair', district: 'opensky', spine: true,
         label: 'THE LAST STAIR', beat: 'REST · before the crown' },

  // ---- ARIA'S CROWN -------------------------------------------------------
  scr: { ...M.arena, kind: 'arena', district: 'crown', spine: true,
         label: "ARIA'S CROWN", beat: 'ARIA, THE GALEBOUND' },

  // ---- THE SHORTCUT -------------------------------------------------------
  // A real walked space, not a door, for the reason Level 3's chords are:
  // "the way back was genuinely shorter" is something a child has to FEEL, and
  // a teleport feels like nothing at all.
  ssA: { ...STAIR, kind: 'stair', district: 'opensky', shortcut: true,
         from: 's4a', to: 's1a', opensWith: 'windBridge',
         label: 'THE WIND BRIDGE', beat: 'SHORTCUT · the Open Sky → the Landing' },
};

registerDistrictTints(L5, DISTRICTS);

// The climb, bottom to top, as it must be walkable — WITHOUT storm_wolf.
// L5/L6 RE-KEY (2026-08-22): ssh/svn/s4b dropped off the mandatory climb.
// Each still exists, still teaches its own lesson, and is still reachable
// from both of its original doors — a child can walk in any time and see
// the gale they cannot yet cross — but the climb itself now runs past
// them via the new sc2/sc3/sc4 doors added this session, so Aria's grant
// (not an early shrine) is what actually opens them.
export const CLIMB = [
  's1a', 's1b', 'sc1',
  's2a', 's2b', 'sc2',
  's3a', 's3b', 'sc3',
  's4a', 'sc4',
  'scr',
];

// Reachable at any time, but not required to finish the climb — the
// storm-only twist/conclude rooms, plus the shrine that used to grant
// early. All three take on their intended purpose only once storm_wolf
// is earned from Aria.
export const STORM_DETOURS = ['ssh', 'svn', 's4b'];

// The four-step teach for the STORM WOLF's thunder-dash. All four rooms are
// STORM_DETOURS or the shrine now (2026-08-22 re-key) — a child who wants
// to see the whole lesson still can, any time, but nothing here is on the
// mandatory CLIMB any more.
export const TEACH = [
  { step: 'introduce', room: 'ssh', marker: 'teachGale',
    what: 'the shrine — the spark, and one gale between it and the door' },
  { step: 'develop', room: 'sc2', marker: 'developGales',
    what: 'the second stair — a gust you can cross, a gale you cannot, a breeze that carries you' },
  { step: 'twist', room: 'svn', marker: 'vaneSpots',
    what: 'THE VANES — the dash does not only carry Kael, it PUSHES' },
  { step: 'conclude', room: 's4b', marker: 'windGate',
    what: 'THE WIND GATE — two vanes at once, and then Aria fights with gales of her own' },
];

// ---------------------------------------------------------------------------
// THE SKY KIT. Every file is already vendored for Levels 1-3 or the Frostpeak
// rooms — Stormreach adds ZERO bytes to the download, which is the same deal
// Level 3 made. Buckets from assets/LICENSES/MANIFEST.json.
//
// There are no ships, sails or chains in any vendored pack, so this region does
// not have any. NO FAKE FICTION: everything the level names is something the
// level shows. What people built up this cliff was a ROAD — walls, arches,
// shrines, hearths, carts — and the storm took it, which the ruin vocabulary in
// js/dressing.js already draws better than a boat would.
// ---------------------------------------------------------------------------
export async function loadSkyKit() {
  if (skyKit) return skyKit;
  const names = {
    floor:    './assets/env/floor-tile.glb',
    cliff:    './assets/env/cliff-block.glb',
    rockLA:   './assets/env/rock-large-a.glb',
    rockLB:   './assets/env/rock-large-b.glb',
    rockLC:   './assets/env/rock-large-c.glb',
    rockSA:   './assets/env/rock-small-a.glb',
    rockSB:   './assets/env/rock-small-b.glb',
    bridge:   './assets/env/bridge-stone.glb',
    pillar:   './assets/env/pillar.glb',
    stump:    './assets/env/stump.glb',
    logStack: './assets/env/log-stack.glb',
    bush:     './assets/env/bush-large.glb',
    treeA:    './assets/env/tree-a.glb',
    treeB:    './assets/env/tree-b.glb',
    flowerA:  './assets/env/flower-a.glb',
    flowerB:  './assets/env/flower-b.glb',
    // the road that was built up this cliff, and what is left of it
    arch:     './assets/env/dungeon/Arch.glb',
    archDoor: './assets/env/dungeon/Arch_Door.glb',
    archBars: './assets/env/dungeon/Arch_bars.glb',
    column:   './assets/env/dungeon/Column.glb',
    column2:  './assets/env/dungeon/Column2.glb',
    wallMod:  './assets/env/dungeon/Wall_Modular.glb',
    wallCov:  './assets/env/dungeon/WallCover_Modular.glb',
    decoWall: './assets/env/dungeon/Decorative_Wall.glb',
    brick:    './assets/env/dungeon/Brick.glb',
    barrel:   './assets/env/dungeon/Barrel.glb',
    crate:    './assets/env/dungeon/Crate.glb',
    vase:     './assets/env/dungeon/Vase.glb',
    skull:    './assets/env/dungeon/Skull.glb',
    coins:    './assets/env/dungeon/Coin_Pile.glb',
    pedestal: './assets/env/dungeon/Pedestal.glb',
    torch:    './assets/env/dungeon/Torch.glb',
    woodfire: './assets/env/dungeon/Woodfire.glb',
    stairs:   './assets/env/dungeon/Stairs_Modular.glb',
    horse:    './assets/env/dungeon/Statue_Horse.glb',
    // the cold high ground — Frostpeak's own rocks, three terraces up
    snowRockL:'./assets/env/snow/rocks-large.glb',
    snowRockM:'./assets/env/snow/rocks-medium.glb',
    snowRockS:'./assets/env/snow/rocks-small.glb',
    // Aria herself, and her pack: real pack models, never code geometry
    wolf:     './assets/chars/wolf.gltf',
  };
  const entries = await Promise.all(Object.entries(names).map(async ([k, u]) => [k, await loadGLB(u)]));
  skyKit = Object.fromEntries(entries);
  return skyKit;
}

const { shell, sideDoor, wallRun, scatter, promiseGate, visibleReward } =
  makeBuilders({ kit: () => skyKit, isGrey: () => GREY() });

const tinted = (gltf, key, tint, darken = 1) => tintedModel(gltf, key, tint, darken);

const { ruinedHome, coldHearth, fallenColumn, rubbleField, wayshrine, aftermath,
  cartWreck, lowWall, place } =
  makeDressers({ kit: () => skyKit, tint: (...a) => tinted(...a), isGrey: () => GREY() });

// ---------------------------------------------------------------------------
// LEVEL-SPECIFIC PIECES
// ---------------------------------------------------------------------------

function base(scene, id) {
  const spec = L5[id];
  const world = new World(scene);
  world.bgColor = 0x121722;
  world.roomId = id;
  reserveLandings(world, id);
  return { world, spec, D: DISTRICTS[spec.district] };
}

function finish(world, spec, D) {
  // THE WEATHER IS BUILT LAST, and rebuilt whenever a vane turns. It is one
  // mesh for the whole room (js/wind.js), so a room with five lanes in it costs
  // the draw-call budget exactly one.
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

  if (GREY()) {
    world.sweepKeepClear();
    thresholdGlow(world);
    protoLabel(world, 0, 0, spec.label, { color: '#dfe9f2', y: 3.4, size: 2.2 });
    protoLabel(world, 0, 2.4, spec.beat, { color: '#9aa8b4', y: 2.4, size: 1.4 });
    return world;
  }
  world.lightTint = { sky: D.tint, ground: D.wallTint, key: D.floorTint };
  world.sweepKeepClear();
  thresholdGlow(world);
  flattenStatic(world);
  return world;
}

// A junction's hero prop stands at DEAD CENTRE, for the reason Level 3 found:
// the same space is entered from three or four doors, and a landmark tucked
// into a corner is only a landmark from one of them.
const JUNCTION_HERO = { x: 0, z: 0 };

// The five hero props. Each is an assembly of real vendored models — the
// no-code-built-creatures law is about creatures, and these are architecture.
function heroProp(world, x, z, kind, D) {
  world.heroMarks.push({ x, z });
  world.reserve(x, z, 3.4, 'hero:' + kind);
  if (GREY()) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.1, 4.2, 6),
      new THREE.MeshStandardMaterial({ color: D.tint, roughness: 1 })
    );
    m.position.set(x, 2.1, z);
    world.add(m);
    world.addCircle(x, z, 1.2, 'hero');
    return m;
  }
  const g = new THREE.Group();
  const P = D.propTint, W = D.wallTint;

  if (kind === 'gatehouse') {
    // THE BROKEN GATEHOUSE — the road up the cliff started here, and the arch
    // over its gate is the last of it still standing.
    place(world, g, skyKit.arch, 'arch', x, 0, z, 2.1, 0, 0, P);
    place(world, g, skyKit.column, 'column', x - 3.1, 0, z + 0.4, 1.9, 0.3, 0, P);
    place(world, g, skyKit.column2, 'column2', x + 3.0, 0, z - 0.3, 1.7, 1.1, 0.12, P);
    place(world, g, skyKit.wallMod, 'wallMod', x - 4.6, 0, z + 1.4, 1.5, Math.PI / 2, 0, W);
    place(world, g, skyKit.brick, 'brick', x + 1.6, 0, z + 2.2, 1.2, 0.7, 0, W, false);
    world.addCircle(x, z, 1.5, 'hero');
    world.addCircle(x - 3.1, z + 0.4, 0.7, 'hero');
    world.addCircle(x + 3.0, z - 0.3, 0.7, 'hero');
  } else if (kind === 'colonnade') {
    // THE LEANING COLONNADE — eight columns of the old road, every one bent
    // the same way. The wind's direction, written in stone, from any door.
    for (let i = 0; i < 8; i++) {
      const px = x - 5.6 + i * 1.6, pz = z + (i % 2 ? 0.5 : -0.4);
      place(world, g, i % 2 ? skyKit.column : skyKit.column2, 'col' + (i % 2),
        px, 0, pz, 1.5 + (i % 3) * 0.14, i * 0.7, 0.13 + (i % 3) * 0.04, P);
      world.addCircle(px, pz, 0.6, 'hero');
    }
  } else if (kind === 'struck') {
    // THE STRUCK PILLAR — split top to bottom and blackened. The one thing on
    // the Thunderhead that says what the weather does up here.
    place(world, g, skyKit.pillar, 'pillar', x - 0.35, 0, z, 2.4, 0.2, -0.09, 0x3a3340);
    place(world, g, skyKit.pillar, 'pillar', x + 0.42, 0, z + 0.2, 2.1, 1.9, 0.14, 0x3a3340);
    place(world, g, skyKit.brick, 'brick', x - 1.9, 0, z + 1.4, 1.3, 0.4, 0, W, false);
    place(world, g, skyKit.brick, 'brick', x + 2.0, 0, z - 1.2, 1.1, 2.1, 0, W, false);
    world.addCircle(x, z, 1.4, 'hero');
  } else if (kind === 'skyshrine') {
    // THE SKY SHRINE — a pedestal, a horse the wind has worn smooth, and four
    // torches that are still lit because someone still climbs up here.
    place(world, g, skyKit.pedestal, 'pedestal', x, 0, z, 2.0, 0, 0, P);
    // CENTRED. Statue_Horse.glb is modelled 5.85u off its own origin in Z
    // (tools/probe-modelsize.mjs), so at this scale the statue was DRAWN metres
    // from the pedestal placed for it — floating at head height over open floor
    // with its collider back on the empty plinth. Same fault as the vase, an
    // order of magnitude worse, and nothing had ever measured a model against
    // its own pivot until tonight.
    place(world, g, skyKit.horse, 'horse', x, 1.05, z, 1.2, 0.6, 0, D.tint, true, true);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.78;
      place(world, g, skyKit.torch, 'torch', x + Math.cos(a) * 2.6, 0, z + Math.sin(a) * 2.6, 1.5, -a, 0, P, false);
    }
    world.addCircle(x, z, 1.5, 'hero');
  } else if (kind === 'crownstones') {
    // THE CROWN STONES — a ring of them round the rim, never in the middle:
    // a boss that crashes onto a boulder buries its own punish window.
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const px = x + Math.cos(a) * 10.4, pz = z + Math.sin(a) * 10.4;
      place(world, g, i % 2 ? skyKit.rockLA : skyKit.rockLC, 'crock' + (i % 2),
        px, 0, pz, 1.5 + (i % 3) * 0.2, a, 0.06, P);
      world.addCircle(px, pz, 1.3, 'hero');
    }
  }
  world.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// A WEATHERVANE. A stone post with a great slab blade across it; dash into it
// and it turns a quarter, and the gale lane it stands in turns with it.
//
// The blade is what tells the truth (THE POSE NEVER LIES): it lies ALONG the
// wind it is making, so a child can read which way a vane is blowing from
// across the room without walking into it to find out.
// ---------------------------------------------------------------------------
const VANE_ANGLE = { n: Math.PI, e: -Math.PI / 2, s: 0, w: Math.PI / 2 };

function vane(world, x, z, lane, D) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.set(x, 0, z);

  if (GREY()) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.32, 3.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a93a8, roughness: 1 })
    );
    post.position.set(x, 1.5, z);
    g.add(post);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.7, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 1 })
    );
    blade.position.y = 2.5;
    spin.add(blade);
  } else {
    place(world, g, skyKit.pillar, 'pillar', x, 0, z, 1.5, 0, 0, D.propTint);
    const b1 = place(world, spin, skyKit.bridge, 'bridge', 0, 2.35, 1.05, 0.72, 0, 0, D.tint);
    const b2 = place(world, spin, skyKit.bridge, 'bridge', 0, 2.35, -1.05, 0.72, Math.PI, 0, D.tint);
    if (b1) b1.rotation.z = 0.08;
    if (b2) b2.rotation.z = -0.08;
  }
  g.add(spin);
  world.add(g);

  const v = {
    x, z, r: 1.1, dir: lane.dir, lane, group: g, spin,
    onTurn: () => { spin.rotation.y = VANE_ANGLE[v.dir]; },
  };
  v.turn = () => turnVane(world, v);
  spin.rotation.y = VANE_ANGLE[v.dir];
  world.vanes.push(v);
  // the post is solid; the child has to dash THROUGH the lane it stands in,
  // not walk up and lean on it
  world.addCircle(x, z, 0.7, 'vane');
  world.reserve(x, z, 2.4, 'vane');
  return v;
}

// WEATHERED, NOT UNIFORM.
//
// Every cluster in the first pass took the district's one propTint, so a whole
// terrace of stone came out a single colour — which is the exact complaint that
// started the ground-painter work ("the floor is just a generic colour
// everywhere"), moved from the floor to the walls. Sea-cliff stone is bleached
// where the weather gets at it and dark where it does not, and a room that says
// so has depth a single tint cannot buy.
//
// It also fixes a measurement. The density check counts merged BATCHES, and the
// batcher buckets by material — so one tint for a whole room merges into a
// handful of batches and the room reads as empty to the verifier even when it
// is full. Varying the tint is not gaming that number; it is the thing the
// number was watching for.
function weathered(D, k) {
  const a = D.propTint, b = 0xd9d3c6;      // salt-bleached
  const t = Math.max(0, Math.min(1, k)) * 0.6;
  const mix = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return { ...D, propTint: (mix(16) << 16) | (mix(8) << 8) | mix(0) };
}

// A STAIR IS STILL A ROOM. The 24 x 12 stair reads as a passage, and the first
// pass dressed it like one — which measured 13 things in the arrival frame
// against a bar of 21, i.e. a corridor with nothing to look at. The fix is not
// to lower the bar: it is to line both long walls and leave the middle alone,
// so the passage still reads as a passage AND has a world either side of it.
// Everything here hugs the wall, and nothing takes a collider except the
// pieces big enough that walking through them would look wrong.
function stairSides(world, halfW, halfD, D, seed) {
  if (GREY()) return;
  let s0 = seed;
  const r = () => ((s0 = (s0 * 9301 + 49297) % 233280) / 233280);
  const EDGE = halfD - 1.5;
  const KINDS = ['barrel', 'crate', 'vase', 'brick', 'skull', 'rockSA', 'rockSB', 'snowRockS'];
  // EACH PIECE IS ITS OWN THING. The first version parented all thirty-eight to
  // one group sitting at the origin, which is how the cluster vocabulary works —
  // and correctly so: a ruined house IS one thing to look at. A scatter of
  // barrels and broken stone is not. Grouped, the density check counted the
  // whole stair as a single object and read 6 things in the arrival frame where
  // Level 1's chokes read 44 with less in them. Same props, same draw calls
  // after batching; an honest count.
  for (let i = 0; i < 38; i++) {
    const side = i % 2 ? 1 : -1;
    const x = -halfW + 1.2 + (i / 38) * (halfW * 2 - 2.4) + (r() - 0.5) * 1.4;
    // A BLOCKED SLOT MOVES, IT DOES NOT VANISH. Skipping on the first collision
    // quietly emptied whole stretches of stair wherever a low wall or a chest's
    // approach happened to sit — sc4 lost a third of its dressing that way and
    // measured twelve things in frame. Try the other wall, then a step inward.
    let z = side * (EDGE - r() * 1.6);
    if (world.blocked(x, z, 0.6)) z = -z;
    if (world.blocked(x, z, 0.6)) z = side * (EDGE - 2.2);
    if (world.blocked(x, z, 0.6)) continue;
    const kind = KINDS[Math.floor(r() * KINDS.length) % KINDS.length];
    const big = kind.startsWith('rock') || kind.startsWith('snow');
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    // every piece weathers differently — the wind gets at the seaward side of
    // a stair and not the other, and one flat tint up a whole cliff was the
    // floor complaint moved onto the props
    // FOUR WEATHERS, NOT A CONTINUUM. A tint per prop reads well and batches
    // terribly: every unique colour is its own material, so nothing merges, the
    // stair costs 24 more draw calls, and the density check — which counts
    // merged batches — sees a room with nothing in it. Four steps gives the
    // variety and keeps the batching.
    place(world, g, skyKit[kind], kind, 0, 0, 0,
      (big ? 0.7 : 0.9) + r() * 0.5, r() * 6.28, 0,
      weathered(D, Math.floor(r() * 4) / 3).propTint, big);
    world.add(g);
    if (big) world.addCircle(x, z, 0.55, 'decor');
  }
  // and a few torches, because a stair up a cliff in a storm is a stair
  // somebody kept lit
  for (let i = 0; i < 4; i++) {
    const x = -halfW + 3 + i * (halfW * 2 - 6) / 3;
    for (const side of [-1, 1]) {
      const z = side * (halfD - 0.9);
      if (world.blocked(x, z, 0.5)) continue;
      const t = new THREE.Group();
      t.position.set(x, 0, z);
      place(world, t, skyKit.torch, 'torch', 0, 0, 0, 1.4, side > 0 ? 0 : Math.PI, 0,
        weathered(D, 0.2 + i * 0.25).propTint, false);
      world.add(t);
    }
  }
}

// A "lock you can lean on" — the region's promise gate. Not a wall: a gale, and
// a chest plainly visible on the other side of it.
function galePromise(world, { x, z, w, d, dir, id, reward }) {
  galeLane(world, { x, z, w, d, dir, strength: 'gale', id });
  if (reward) visibleReward(world, reward.x, reward.z, reward.id, reward.loot, reward.tier || 'gold');
  return { x, z };
}

// ---------------------------------------------------------------------------
// TERRACE 1 · THE LANDING
// ---------------------------------------------------------------------------

export async function buildS1a(scene) {
  const { world, spec, D } = base(scene, 's1a');
  const bridged = WS.get(REGION, 'windBridge');
  const gaps = [gap('s'), gap('e')];
  if (bridged) gaps.push(gap('w'));
  const { halfW, halfD } = shell(world, spec, gaps, D, {
    patches: [{ x: -12, z: 8, r: 5.0, kind: 'water' },
              { x: 12, z: -8, r: 4.4, kind: 'gravel' },
              { x: -11, z: -9, r: 3.8, kind: 'rubble' },
              { x: 11, z: 9, r: 3.4, kind: 'moss' }],
  });
  world.spawn = { x: 0, z: 9, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'f5', { x: 0, z: 7.2, angle: Math.PI });
  sideDoor(world, 'e', halfW, halfD, 's1b', { x: -13, z: 0, angle: -Math.PI / 2 });
  if (bridged) sideDoor(world, 'w', halfW, halfD, 'ssA', { x: 10, z: 0, angle: Math.PI / 2 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'gatehouse', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -7, z: 5 };
  world.markers.travelSpot = { x: 7, z: 6 };

  // A BREEZE, and nothing else. The first thing the region does is show the
  // wind being harmless: the banners lean, the motes drift past, a child walks
  // through it and nothing happens. Everything the gale lanes do later is read
  // against this.
  galeLane(world, { x: 0, z: 4, w: 26, d: 7, dir: 'n', strength: 'breeze' });

  // THE SEA CAVE — region 6's lock, shown a region early exactly as the law
  // asks, with the chest inside it plainly visible from the path.
  wallRun(world, -16, -3.0, -11.5, -3.0, D);
  wallRun(world, -16, 1.6, -11.5, 1.6, D);
  // A FLOODED CAVE MOUTH IS THE TIDE'S, NOT THE FROST'S. Seeded as a 'shatter'
  // gate it would have opened to the Frost Wolf's breath — the wrong wolf, and
  // one the child already had, so the promise would have paid out instantly and
  // meant nothing. It is water: it opens when you can walk on water.
  if (!canWade()) {
    promiseGate(world, -11.5, -0.7, 3.0, 4.2, 0x4fd0e0, 'FLOODED — later', 'rockSB',
      { system: 'none', id: 's1a_seacave', region: REGION });
  }
  visibleReward(world, -14.0, -0.7, 's5_seacave', { shards: 26 });
  world.markers.tidePromise = { x: -11.5, z: -0.7 };

  world.markers.houndSpots = [{ x: 8, z: -5, variant: 'gale' }];
  scatter(world, halfW, halfD, D, 501, 7, { spin: 1, kinds: ['rockLA', 'rockSA', 'rockSB', 'stump'] });
  ruinedHome(world, -10, 7.5, 0.4, D, { w: 7, d: 5.5, keep: 0.45 });
  coldHearth(world, -8.5, 4.6, D);
  cartWreck(world, 8.5, 7.0, 1.1, D);
  lowWall(world, 3.5, 5.5, 0.0, D, 4.0);
  fallenColumn(world, -4, -7, 1, D, 5);
  rubbleField(world, 11, -9, 3.4, D, 13);
  aftermath(world, -12, -8, 2.2, D, 5);
  wayshrine(world, 12.5, 3.5, -0.6, D);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildS1b(scene) {
  const { world, spec, D } = base(scene, 's1b');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e'), gap('n')], D, {
    patches: [{ x: -12, z: 8, r: 4.6, kind: 'water' },
              { x: 12, z: -8, r: 4.6, kind: 'gravel' },
              { x: 10, z: 8, r: 3.6, kind: 'rubble' }],
  });
  world.spawn = { x: -13, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 's1a', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'sc1', { x: -9, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 's1p', { x: 0, z: 6, angle: Math.PI });

  // THE LOCK, IN THE FIRST MINUTE (LEVEL-MAP's rule, and region 1's habit).
  // A gale across a side alcove with the gold chest inside it. A child leans
  // into it, is walked back out, and has learned the whole region without a
  // word of explanation — and without being stopped from going on.
  wallRun(world, 4.5, -11, 4.5, -5.5, D);
  wallRun(world, 13.5, -11, 13.5, -5.5, D);
  // 3.8 DEEP, NOT 5.2. A gale is crossed by dashing through it, and the dash
  // covers 5.2 units — so a lane 5.2 deep is a knife edge: Kael lands exactly
  // on its far lip and the wind blows him straight back out. It looked like the
  // dash had stopped working. Every gale is authored at most 4.2 across the way
  // a child crosses it, which leaves a clear unit of margin, and
  // tools/verify-storm.mjs now measures that rather than trusting it.
  galePromise(world, {
    x: 9, z: -6.5, w: 8.4, d: 3.8, dir: 's', id: 's_gale_stair',
    reward: { x: 9, z: -9.6, id: 's5_s1b_gale', loot: { shards: 24 } },
  });
  world.markers.galePromise = { x: 9, z: -6.5 };

  world.markers.houndSpots = [{ x: -6, z: 3, variant: 'gale' }, { x: 5, z: 6, variant: 'gale' },
    { x: -3, z: -6, variant: 'gale' }];
  scatter(world, halfW, halfD, D, 502, 7, { spin: 1, kinds: ['rockLB', 'rockLC', 'rockSA', 'logStack'] });
  ruinedHome(world, -11, -7, 1.2, D, { w: 6.5, d: 5, keep: 0.35 });
  lowWall(world, -5, 8, 0.2, D, 5.0);
  cartWreck(world, 11, 8, 0.4, D);
  fallenColumn(world, 2, -2, 0, D, 4.5);
  rubbleField(world, -12, 6, 3.2, D, 12);
  aftermath(world, 6, 1, 2.4, D, 9);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildS1p(scene) {
  const { world, spec, D } = base(scene, 's1p');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: -6, z: 4, r: 3.2, kind: 'moss' }, { x: 6, z: -4, r: 3.0, kind: 'rubble' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 's1b', { x: 0, z: -10, angle: 0 });
  world.markers.pupSpot = { x: 0, z: -3.5, id: 'pup_s1' };
  world.markers.restSpot = { x: -5, z: 2 };
  // W5 audit (2026-08-22): Stormreach's critical path reused ZERO earlier
  // forms despite four being available. Earth was the first candidate here
  // but was dropped: L2-L4 already carry earth AND L6 now does too (this
  // session's own L6 fix), so adding it to L5 would bridge them into a
  // 5-consecutive-region run — worse than any option on the table. Frost's
  // own verb (iceGate, js/gates.js — world.shatterAt, the Frost Wolf's
  // breath) reused instead: L4 and L6 both carry frost already, so this
  // does create a fresh L4-L5-L6 3-consecutive run, but that is the
  // smallest cost of the four candidates weighed (fire/earth would each
  // have reached 5-consecutive). A gold chest sealed behind the ice.
  world.markers.chestDefs = [{ id: 'c_s1p_ice', tier: 'gold', x: 8.5, z: -2.2, ry: 0.4, loot: { shards: 20, heartPiece: 1 } }];
  world.reserve(8.5, -2.2, 2.2, 'chest');
  iceGate(world, 8.5, 0, 's1p_ice', REGION);
  scatter(world, halfW, halfD, D, 503, 5, { spin: 1, kinds: ['rockSA', 'rockSB', 'barrel', 'crate'] });
  ruinedHome(world, -5.5, -3.5, 0.6, D, { w: 6, d: 5, keep: 0.6, door: true });
  coldHearth(world, 4.5, 2.5, D);
  rubbleField(world, 6.5, -5, 2.4, D, 9);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildSc1(scene) {
  const { world, spec, D } = base(scene, 'sc1');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('n')], D, {
    patches: [{ x: -7, z: 3, r: 2.8, kind: 'water' }, { x: 7, z: -3, r: 2.6, kind: 'gravel' }],
  });
  world.spawn = { x: -9, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 's1b', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 's2a', { x: 0, z: 10, angle: Math.PI });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.potionSpot = { x: 8, z: 3 };
  // the first stair, and the first time the wind runs WITH you
  galeLane(world, { x: 0, z: 0, w: 7, d: 11, dir: 'n', strength: 'breeze' });
  scatter(world, halfW, halfD, D, 504, 5, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  stairSides(world, halfW, halfD, D, 5041);
  lowWall(world, -8, -4, 0, D, 4.0);
  lowWall(world, 8, 4, 0, D, 4.0);
  wayshrine(world, -8.5, 3.5, 0.5, D);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// TERRACE 2 · THE GALE STAIR
// ---------------------------------------------------------------------------

export async function buildS2a(scene) {
  const { world, spec, D } = base(scene, 's2a');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('w'), gap('n')], D, {
    patches: [{ x: -12, z: -8, r: 4.6, kind: 'gravel' }, { x: 12, z: 8, r: 4.2, kind: 'rubble' },
              { x: 10, z: -8, r: 3.4, kind: 'moss' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'sc1', { x: 0, z: -5, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 's2b', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 's2p', { x: 0, z: 6, angle: Math.PI });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'colonnade', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 6 };
  // the colonnade leans because of THIS: a gust running the length of it
  galeLane(world, { x: 0, z: 1.2, w: 30, d: 5.0, dir: 'w', strength: 'gust' });

  world.markers.batSpots = [{ x: -7, z: -6, variant: 'stormbat' }, { x: 8, z: -7, variant: 'stormbat' }];
  world.markers.houndSpots = [{ x: 6, z: 7, variant: 'gale' }];
  scatter(world, halfW, halfD, D, 511, 7, { spin: 1, kinds: ['rockLA', 'rockSA', 'rockSB', 'brick'] });
  ruinedHome(world, -11, 7, 0.9, D, { w: 7, d: 5.5, keep: 0.4 });
  fallenColumn(world, 9, -3, 1, D, 5);
  rubbleField(world, -12, -8, 3.4, D, 13);
  cartWreck(world, -6, -9, 2.2, D);
  lowWall(world, 11, 5, 1.57, D, 4.5);
  aftermath(world, 4, -6, 2.4, D, 11);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildS2b(scene) {
  const { world, spec, D } = base(scene, 's2b');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('n'), gap('s')], D, {
    patches: [{ x: 12, z: -8, r: 4.6, kind: 'gravel' }, { x: -12, z: 8, r: 4.2, kind: 'rubble' }],
  });
  world.spawn = { x: 13, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 's2a', { x: -13, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'ssh', { x: 0, z: 6, angle: Math.PI });
  // L5/L6 RE-KEY (2026-08-22): the critical path no longer runs through
  // ssh (its gale is un-crossable without storm_wolf, which now comes
  // from Aria, not this shrine). ssh keeps both its old doors and becomes
  // an optional detour; this new door carries the CLIMB straight through
  // to sc2, threading the gap between the two existing gust lanes (x -8
  // and x 7) so a child never spawns into either. Landing at z -2, not
  // right against sc2's own south wall — sc2's `lowWall(0,-5,...)` cover
  // sits exactly there, and this door's own landing isn't guaranteed to be
  // registered in LANDINGS['sc2'] (see sideDoor's own comment) before sc2
  // builds, so it can't rely on the keep-clear register to save it.
  sideDoor(world, 's', halfW, halfD, 'sc2', { x: 2, z: -2, angle: 0 });

  // Two gusts crossing, so the floor between them is calm and the way round is
  // obvious. The room is the last one before the gift, and its job is to make a
  // child WANT the tool: everything here is nearly-passable.
  galeLane(world, { x: -8, z: 0, w: 6.5, d: 22, dir: 'n', strength: 'gust' });
  galeLane(world, { x: 7, z: -2, w: 7.5, d: 20, dir: 's', strength: 'gust' });

  world.markers.houndSpots = [{ x: -3, z: 6, variant: 'gale' }, { x: 3, z: -7, variant: 'gale' }];
  world.markers.batSpots = [{ x: 10, z: 6, variant: 'stormbat' }];
  // the gauntlet flaked here — two pounces sometimes both missed a sprinter —
  // so the crossing gets the ranged answer too, just off the s2a → ssh line
  world.markers.stormcallerSpots = [{ x: -2.6, z: -2 }];
  scatter(world, halfW, halfD, D, 512, 7, { spin: 1, kinds: ['rockLB', 'rockSA', 'crate', 'barrel'] });
  // DRESSED INTO THE ARRIVAL FRAME. Kael walks in at x 13 facing west, so the
  // camera shows x 13 down to about x 0 — and the first pass put this room's
  // clusters at x 10-12 (behind him) and x -10 to -12 (past the far edge),
  // which measured eleven things in frame against a bar of thirty-two. A room
  // can be full and still look empty if all of it is somewhere else.
  ruinedHome(world, 7, 8, 2.1, weathered(D, 0.9), { w: 6.5, d: 5, keep: 0.3 });
  ruinedHome(world, 4, -8.5, 0.6, weathered(D, 0.2), { w: 6, d: 4.5, keep: 0.45 });
  fallenColumn(world, 2, -4, 0, weathered(D, 0.6), 5.5);
  fallenColumn(world, 10, 4, 1, weathered(D, 0.05), 4.5);
  lowWall(world, 1, 9, 0, weathered(D, 0.75), 5.0);
  lowWall(world, 11, -2, 1.57, weathered(D, 0.35), 4.0);
  rubbleField(world, 12, 2, 3.0, weathered(D, 0.5), 11);
  rubbleField(world, 5, 4, 2.6, weathered(D, 1.0), 10);
  cartWreck(world, 9, -5, 1.2, weathered(D, 0.15));
  coldHearth(world, 3, 2, weathered(D, 0.45));
  wayshrine(world, 12, 7, -0.5, weathered(D, 0.8));
  aftermath(world, 0, -1, 2.6, weathered(D, 0.3), 13);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildS2p(scene) {
  const { world, spec, D } = base(scene, 's2p');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 5, z: 4, r: 3.0, kind: 'moss' }, { x: -5, z: -4, r: 2.8, kind: 'gravel' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 's2a', { x: 0, z: -10, angle: 0 });
  world.markers.chestDefs = [{ id: 'c_s2p', tier: 'silver', x: 0, z: -4.0, ry: 0.3, loot: { shards: 22, potion: 1 } }];
  world.reserve(0, -4.0, 2.6, 'chest');
  world.markers.houndSpots = [{ x: -5, z: 1, variant: 'gale' }];
  scatter(world, halfW, halfD, D, 513, 5, { spin: 1, kinds: ['rockSA', 'rockSB', 'crate'] });
  lowWall(world, -6, -5, 0, D, 4.0);
  lowWall(world, 6, -5, 0, D, 4.0);
  coldHearth(world, 5.5, 3, D);
  rubbleField(world, -6.5, 4.5, 2.4, D, 9);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// THE SHRINE. Aria's spark, one gale between it and the way on, and a second
// gale with a gold chest behind it so the new verb pays out before the child
// leaves the room that gave it (the grant+30s law).
export async function buildSsh(scene) {
  const { world, spec, D } = base(scene, 'ssh');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('w')], D, {
    patches: [{ x: 0, z: -3, r: 4.0, kind: 'gravel' }, { x: 6, z: 4, r: 2.6, kind: 'moss' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 's2b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 'sc2', { x: 9, z: 0, angle: Math.PI / 2 });

  // L5/L6 RE-KEY (2026-08-22): THE SHRINE PROMISES; THE BOSS PAYS — same
  // migration fire/earth/verdant/frost already made (main.js:905-910,
  // main.js:778-794). The shrine granted storm the moment a child brushed
  // it, two terraces before Aria — so the grant moved to her defeat (see
  // main.js's ariaDefeated ceremony block) and the spark is the promise of
  // it now: no `grants` field, so main.js's generic sparkSpot handler
  // (main.js:943) does not fire here. The marker itself stays (still reads
  // as a camp/rest beat for verify-gauntlet's heuristic) and the room's
  // own gale (below) is no longer crossable from here — svn/s4b/this room
  // are bypassed on the critical path now (see the new sc2/sc3/sc4 doors)
  // and become optional "come back once you have the dash" detours.
  world.markers.sparkSpot = { x: 0, z: -4.4 };
  world.markers.teachGale = { x: -5.4, z: 0 };
  world.reserve(0, -4.4, 3.0, 'spark');

  // INTRODUCE: one gale, across the way out, and nothing else in the room to
  // think about. Level 3's shrine did exactly this with one bramble.
  galeLane(world, { x: -5.4, z: 0, w: 4.2, d: 15, dir: 's', strength: 'gale', id: 's_shrine' });
  // GRANT + 30s: a second gale, and the chest is visible through it from the
  // shrine itself.
  wallRun(world, 4.5, -8, 4.5, -3.5, D);
  galeLane(world, { x: 7.2, z: -5.6, w: 4.0, d: 4.6, dir: 'e', strength: 'gale', id: 's_shrine_pay' });
  visibleReward(world, 8.6, -5.6, 's5_shrine', { shards: 30, heartPiece: 1 });

  if (!GREY()) {
    const spark = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4b0, emissiveIntensity: 2.4, roughness: 1 })
    );
    spark.position.set(0, 1.5, -4.4);
    world.add(spark);
    const sl = new THREE.PointLight(0xc9d4ff, 5, 13, 1.8);
    sl.position.set(0, 1.8, -4.4);
    world.add(sl);
    world.onAnimate((t) => {
      spark.position.y = 1.5 + Math.sin(t * 1.7) * 0.16;
      spark.rotation.y = t * 1.1;
      sl.intensity = 4.2 + Math.abs(Math.sin(t * 6)) * 1.8;
    });
    wayshrine(world, 0, -6.6, 0, D);
  }
  scatter(world, halfW, halfD, D, 514, 4, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  lowWall(world, -8, 5, 0, D, 3.5);
  rubbleField(world, 8, 5, 2.2, D, 8);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// DEVELOP: three winds, three answers, in the order a child meets them —
// a gust you can shoulder through, a gale you cannot, and a breeze that carries
// you the rest of the way.
export async function buildSc2(scene) {
  const { world, spec, D } = base(scene, 'sc2');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('n'), gap('s', DOOR_HALF, 2)], D, {
    patches: [{ x: -6, z: 0, r: 3.0, kind: 'gravel' }, { x: 6, z: 2, r: 2.6, kind: 'rubble' }],
  });
  world.spawn = { x: 9, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 'ssh', { x: -9, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 's3a', { x: 0, z: 10, angle: Math.PI });
  // L5/L6 RE-KEY (2026-08-22): matches the new door in s2b — the CLIMB now
  // runs s2b -> sc2 directly. Offset (centre 2) threads between the gale
  // lane (x -1.5 to 0.5) and the gust lane (x 3.5 to 7.5).
  sideDoor(world, 's', halfW, halfD, 's2b', { x: 2, z: -10.5, angle: 0 }, { centre: 2 });
  world.markers.developGales = { x: 0, z: 0 };

  galeLane(world, { x: 5.5, z: 0, w: 4.0, d: 11, dir: 's', strength: 'gust' });   // shoulder through
  galeLane(world, { x: -1.5, z: 0, w: 4.0, d: 11, dir: 's', strength: 'gale' });  // dash
  galeLane(world, { x: -8.0, z: 0, w: 5.0, d: 11, dir: 'n', strength: 'breeze' }); // ride it
  world.markers.houndSpots = [{ x: -6, z: 3.5, variant: 'gale' }];
  scatter(world, halfW, halfD, D, 515, 4, { spin: 1, kinds: ['rockSA', 'rockSB'] });
  stairSides(world, halfW, halfD, D, 5151);
  lowWall(world, 0, -5, 0, D, 5.0);
  lowWall(world, 0, 5, 0, D, 5.0);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// TERRACE 3 · THE THUNDERHEAD
// ---------------------------------------------------------------------------

export async function buildS3a(scene) {
  const { world, spec, D } = base(scene, 's3a');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('e'), gap('n')], D, {
    patches: [{ x: -12, z: 8, r: 4.8, kind: 'scorch' }, { x: 12, z: -8, r: 4.4, kind: 'rubble' },
              { x: -10, z: -8, r: 3.4, kind: 'gravel' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'sc2', { x: 0, z: -5, angle: 0 });
  sideDoor(world, 'e', halfW, halfD, 's3b', { x: -13, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 's3p', { x: 0, z: 6, angle: Math.PI });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'struck', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: 8, z: 6 };
  galeLane(world, { x: -9, z: 0, w: 7, d: 24, dir: 'n', strength: 'gust' });

  // A CRACKED STONE — the Earth Wolf's, from region two. A region that only
  // rewards its own gift teaches children to stop carrying the others.
  wallRun(world, 9, 5.5, 15, 5.5, D);
  wallRun(world, 9, 10.5, 15, 10.5, D);
  promiseGate(world, 9.5, 8, 3.0, 4.4, 0xd8b06a, 'CRACKED', 'rockLB',
    { system: 'crack', id: 's3b_crack', region: REGION });
  visibleReward(world, 12.5, 8, 's5_crack', { shards: 24, potion: 1 }, 'silver');
  world.markers.crackSpot = { x: 9.5, z: 8 };

  world.markers.houndSpots = [{ x: -5, z: -6, variant: 'gale' }, { x: 6, z: -4, variant: 'eldergale' }];
  scatter(world, halfW, halfD, D, 521, 7, { spin: 1, kinds: ['rockLA', 'rockLC', 'snowRockM', 'brick'] });
  ruinedHome(world, -11, 6.5, 1.6, D, { w: 7, d: 5.5, keep: 0.3 });
  fallenColumn(world, 3, 7, 0, D, 5);
  rubbleField(world, -12, -8, 3.6, D, 14);
  aftermath(world, -4, -3, 2.8, D, 17);
  cartWreck(world, 12, -9, 0.8, D);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildS3b(scene) {
  const { world, spec, D } = base(scene, 's3b');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('n'), gap('e')], D, {
    patches: [{ x: 12, z: 8, r: 4.6, kind: 'scorch' }, { x: -12, z: -8, r: 4.4, kind: 'gravel' }],
  });
  world.spawn = { x: -13, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 's3a', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'svn', { x: 0, z: 10, angle: Math.PI });
  // L5/L6 RE-KEY (2026-08-22): the CLIMB no longer runs through svn (its
  // vanes only turn from the Thunder Dash, which now comes from Aria).
  // svn keeps both its old doors and becomes an optional detour; this new
  // door carries the CLIMB straight through to sc3. Landing at x -6, clear
  // of sc3's own west wall (halfW 12 — x -12 IS the wall) and clear of the
  // sc3→svn door's trigger box sitting right there (x -13.35..-11.85).
  sideDoor(world, 'e', halfW, halfD, 'sc3', { x: -6, z: 0, angle: -Math.PI / 2 });

  // LANES THAT CARRY THE FIGHT. Two gusts running opposite ways across the
  // floor, so the pack is dragged one way and Kael the other — the same tool
  // solves it (dash across), but now something is chasing him while he does.
  galeLane(world, { x: 0, z: -6, w: 30, d: 6, dir: 'e', strength: 'gust' });
  galeLane(world, { x: 0, z: 5, w: 30, d: 6, dir: 'w', strength: 'gust' });

  world.markers.arcKnightSpots = [{ x: -7, z: -7 }];
  world.markers.houndSpots = [{ x: 7, z: 6, variant: 'gale' },
    { x: 0, z: 0, variant: 'eldergale' }];
  world.markers.slimeSpots = [{ x: 10, z: -2, variant: 'sparkblob' }];
  scatter(world, halfW, halfD, D, 522, 7, { spin: 1, kinds: ['rockLB', 'snowRockL', 'snowRockS', 'brick'] });
  // ...same lesson as s2b, and worse here: four things in frame. Kael arrives at
  // x -13 facing east, and this room's whole ruin was at x +11.
  fallenColumn(world, -9, 8, 1, weathered(D, 0.85), 5.5);
  fallenColumn(world, -4, -8, 0, weathered(D, 0.1), 5);
  ruinedHome(world, -8, -4, 0.5, weathered(D, 0.55), { w: 6, d: 5, keep: 0.25 });
  ruinedHome(world, -3, 7, 2.2, weathered(D, 0.95), { w: 6.5, d: 5, keep: 0.4 });
  rubbleField(world, -11, 2, 3.2, weathered(D, 0.35), 12);
  rubbleField(world, -6, -1, 2.4, weathered(D, 0.7), 10);
  cartWreck(world, -11, -7, 0.9, weathered(D, 0.2));
  coldHearth(world, -2, 2, weathered(D, 0.5));
  lowWall(world, -3, 10, 0, weathered(D, 0.4), 4.5);
  lowWall(world, -12, 6, 1.57, weathered(D, 1.0), 4.0);
  wayshrine(world, 0, -10, 0.2, weathered(D, 0.65));
  aftermath(world, 5, -9, 2.6, weathered(D, 0.25), 19);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildS3p(scene) {
  const { world, spec, D } = base(scene, 's3p');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 4.0, kind: 'scorch' }, { x: -6, z: 4, r: 2.4, kind: 'gravel' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 's3a', { x: 0, z: -10, angle: 0 });
  world.markers.pupSpot = { x: 0, z: -3.5, id: 'pup_s3' };
  world.markers.batSpots = [{ x: -5, z: -2, variant: 'stormbat' }, { x: 5, z: -1, variant: 'stormbat' }];
  // W5 audit (2026-08-22): Stormreach's critical path reused ZERO earlier
  // forms despite four being available. Fixed with frost's iceGate (s1p,
  // above) plus a second reuse here. W5 re-audit (2026-08-24): the second
  // reuse was originally verdant (stormBramble) but that put verdant on
  // three straight regions (wildwoods grants it, frostpeak reused it,
  // stormreach reused it too) — swapped to earth (boulderGate, the same
  // single-smooth-stone promise as Ember's em_boulder) instead, since
  // earth's own run breaks cleanly here (frostpeak dropped its earth reuse
  // in the same pass, so wildwoods/stoneroot's earth doesn't reach this far).
  world.markers.chestDefs = [{ id: 'c_s3p_boulder', tier: 'silver', x: 8, z: -0.3, ry: -0.3, loot: { shards: 18, potion: 1 } }];
  world.reserve(8, -0.3, 2.2, 'chest');
  boulderGate(world, prepareModel, skyKit.rockLB, 's3p_boulder', 8, 2);
  scatter(world, halfW, halfD, D, 523, 5, { spin: 1, kinds: ['snowRockM', 'snowRockS', 'rockSB'] });
  fallenColumn(world, -6, -5, 0, D, 4);
  rubbleField(world, 6, -5, 2.6, D, 10);
  coldHearth(world, 5, 3, D);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE VANES — the one puzzle room of the level (dad's law: ONE per level).
//
// Three vanes, each standing in its own gale. Dash into a vane and it turns a
// quarter, and its gale turns with it. The way east is a corridor that only
// opens when no gale is blowing across it — which means every vane has to end
// up pointing ALONG the corridor rather than across it.
//
// Nothing here can be made unsolvable, nothing is timed, and a vane can always
// be dashed again all the way round. There is no reset button, because a reset
// button is an admission that a child can get stuck.
// ---------------------------------------------------------------------------
export async function buildSvn(scene) {
  const { world, spec, D } = base(scene, 'svn');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('e')], D, {
    patches: [{ x: 0, z: 0, r: 6.0, kind: 'gravel' }, { x: -11, z: -8, r: 3.4, kind: 'scorch' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 's3b', { x: 0, z: -10, angle: 0 });
  sideDoor(world, 'e', halfW, halfD, 'sc3', { x: -9, z: 0, angle: -Math.PI / 2 });

  // The corridor east, and the three lanes that cross it. Each lane starts
  // pointing ACROSS the corridor (north or south); pointing it east or west
  // lays it along the corridor and lets a child walk the whole length.
  const seats = [{ x: -6, z: 0, dir: 'n' }, { x: 1, z: 0, dir: 's' }, { x: 8, z: 0, dir: 'n' }];
  world.markers.vaneSpots = seats.map((s) => ({ x: s.x, z: s.z + 3.4 }));
  for (const s of seats) {
    const lane = galeLane(world, { x: s.x, z: 0, w: 4.2, d: 15, dir: s.dir, strength: 'gale', vaned: true });
    vane(world, s.x, s.z + 3.4, lane, D);
  }

  // What "solved" looks like, checked every frame: nothing blowing across the
  // walking line. The door east opens itself, with the door-creak the rest of
  // the game uses for a gate giving way.
  const LINE_Z = -2.2;
  world.markers.puzzleSolved = false;
  let wasOpen = false;
  world.onAnimate(() => {
    const w = world.windAt(0, LINE_Z);
    const crossing = world.galeLanes.some((l) =>
      LINE_Z >= l.minZ && LINE_Z <= l.maxZ && Math.abs(l.pz) > Math.abs(l.px));
    const open = !crossing;
    world.markers.puzzleSolved = open;
    if (open && !wasOpen) {
      wasOpen = true;
      WS.set(REGION, 'vanesTurned');
      if (world.onSolved) world.onSolved();
    } else if (!open) { wasOpen = false; }
    void w;
  });

  world.markers.batSpots = [{ x: -10, z: 8, variant: 'stormbat' }];
  scatter(world, halfW, halfD, D, 524, 6, { spin: 1, kinds: ['snowRockL', 'snowRockM', 'brick'] });
  lowWall(world, 0, 8.5, 0, D, 6.0);
  lowWall(world, 0, -8.5, 0, D, 6.0);
  rubbleField(world, -12, 7, 3.0, D, 11);
  fallenColumn(world, 11, 8, 1, D, 4.5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildSc3(scene) {
  const { world, spec, D } = base(scene, 'sc3');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 3.2, kind: 'gravel' }],
  });
  world.spawn = { x: -9, z: 0, angle: -Math.PI / 2 };
  sideDoor(world, 'w', halfW, halfD, 'svn', { x: 9, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 's4a', { x: 0, z: 10, angle: Math.PI });
  // L5/L6 RE-KEY (2026-08-22): matches the new door in s3b.
  sideDoor(world, 's', halfW, halfD, 's3b', { x: -12, z: -10, angle: Math.PI / 2 });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.potionSpot = { x: -7, z: -3 };
  galeLane(world, { x: 0, z: 0, w: 8, d: 11, dir: 'n', strength: 'breeze' });
  scatter(world, halfW, halfD, D, 525, 4, { spin: 1, kinds: ['snowRockS', 'rockSB'] });
  stairSides(world, halfW, halfD, D, 5251);
  lowWall(world, -8, 4, 0, D, 4.0);
  wayshrine(world, 8, -3.5, 2.4, D);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// TERRACE 4 · THE OPEN SKY
// ---------------------------------------------------------------------------

export async function buildS4a(scene) {
  const { world, spec, D } = base(scene, 's4a');
  const { halfW, halfD } = shell(world, spec, [gap('s'), gap('w'), gap('e'), gap('n')], D, {
    patches: [{ x: -12, z: 8, r: 4.6, kind: 'sand' }, { x: 12, z: -8, r: 4.2, kind: 'gravel' },
              { x: 10, z: 8, r: 3.2, kind: 'blossom' }],
  });
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'sc3', { x: 0, z: -5, angle: 0 });
  sideDoor(world, 'w', halfW, halfD, 's4b', { x: 13, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'e', halfW, halfD, 'ssA', { x: -9, z: 0, angle: -Math.PI / 2 });
  // L5/L6 RE-KEY (2026-08-22): the CLIMB no longer runs through s4b (its
  // vanes only turn from the Thunder Dash, which now comes from Aria).
  // s4b keeps both its old doors and becomes an optional detour; this new
  // door carries the CLIMB straight through to sc4.
  sideDoor(world, 'n', halfW, halfD, 'sc4', { x: 0, z: -5, angle: 0 });

  heroProp(world, JUNCTION_HERO.x, JUNCTION_HERO.z, 'skyshrine', D);
  world.markers.heroSpot = { ...JUNCTION_HERO };
  world.markers.restSpot = { x: -8, z: 7 };
  world.markers.bridgeSpot = { x: 11, z: 0 };
  // out of the storm at last: the wind up here is steady and harmless
  galeLane(world, { x: 0, z: -7, w: 30, d: 6, dir: 'e', strength: 'breeze' });

  world.markers.houndSpots = [{ x: -6, z: -5, variant: 'eldergale' }, { x: 7, z: 6, variant: 'gale' }];
  scatter(world, halfW, halfD, D, 531, 7, { spin: 1, kinds: ['rockLA', 'rockSA', 'snowRockM', 'flowerA'] });
  wayshrine(world, -10, -7, 0.7, D);
  ruinedHome(world, 11, 7, 2.3, D, { w: 6.5, d: 5, keep: 0.55 });
  coldHearth(world, 8, 4, D);
  lowWall(world, -4, 9, 0, D, 5.5);
  rubbleField(world, -12, 1, 2.8, D, 10);
  fallenColumn(world, 5, -9, 1, D, 5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// CONCLUDE — THE WIND GATE. Two vanes feed one gale across the way west. Both
// have to be turned off the line at once, which is the first time the twist is
// used for something other than itself.
export async function buildS4b(scene) {
  const { world, spec, D } = base(scene, 's4b');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('w'), gap('n')], D, {
    patches: [{ x: -10, z: 0, r: 4.4, kind: 'sand' }, { x: 11, z: 8, r: 3.6, kind: 'gravel' }],
  });
  world.spawn = { x: 13, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 's4a', { x: -13, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 'sc4', { x: 9, z: 0, angle: Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 's4p', { x: 0, z: 6, angle: Math.PI });
  world.markers.windGate = { x: -10, z: 0 };

  for (const s of [{ x: -10, z: -5.0 }, { x: -10, z: 5.0 }]) {
    const lane = galeLane(world, { x: -10, z: s.z, w: 7.0, d: 8.5, dir: s.z < 0 ? 's' : 'n', strength: 'gale', vaned: true });
    vane(world, s.x, s.z, lane, D);
  }

  // What "solved" looks like, checked every frame — the same rule as sc3's
  // corridor vanes (svn), turned 90°: neither lane still blowing across the
  // doorway line. This block was never written the first time, so the two
  // vanes could be turned but `windBridge` never set — leaving ssA's far
  // door (s1a) permanently sealed against anyone who crossed the bridge
  // from s4a's always-open near side. Fixes real-play report: "a wall that
  // literally blocks you from the way you need to go."
  const LINE_X = -10;
  world.markers.puzzleSolved = false;
  let gateWasOpen = false;
  world.onAnimate(() => {
    const crossing = world.galeLanes.some((l) =>
      LINE_X >= l.minX && LINE_X <= l.maxX && Math.abs(l.pz) > Math.abs(l.px));
    const open = !crossing;
    world.markers.puzzleSolved = open;
    if (open && !gateWasOpen) {
      gateWasOpen = true;
      WS.set(REGION, 'windBridge');
      if (world.onSolved) world.onSolved();
    } else if (!open) { gateWasOpen = false; }
  });

  if (!GREY()) {
    // the gate itself: two columns and an arch, so the doorway the gale defends
    // is plainly a DOORWAY and not just a windy patch of floor
    const g = new THREE.Group();
    place(world, g, skyKit.arch, 'arch', -13.5, 0, 0, 2.2, Math.PI / 2, 0, D.propTint);
    world.add(g);
  }

  world.markers.houndSpots = [{ x: 6, z: -6, variant: 'gale' }, { x: 4, z: 7, variant: 'gale' }];
  world.markers.batSpots = [{ x: -2, z: -8, variant: 'stormbat' }];
  scatter(world, halfW, halfD, D, 532, 6, { spin: 1, kinds: ['rockLC', 'rockSB', 'snowRockS'] });
  ruinedHome(world, 10, -7, 1.4, weathered(D, 0.15), { w: 6.5, d: 5, keep: 0.5 });
  ruinedHome(world, 5, 8, 0.7, weathered(D, 0.9), { w: 6, d: 4.5, keep: 0.35 });
  fallenColumn(world, 2, 9, 0, weathered(D, 0.5), 5);
  fallenColumn(world, 8, 2, 1, weathered(D, 0.75), 4.5);
  rubbleField(world, 12, 3, 2.8, weathered(D, 0.3), 10);
  rubbleField(world, 6, -3, 2.4, weathered(D, 1.0), 9);
  wayshrine(world, 11, 6, -0.4, weathered(D, 0.6));
  coldHearth(world, 3, -6, weathered(D, 0.4));
  aftermath(world, 0, -3, 2.4, weathered(D, 0.2), 23);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildS4p(scene) {
  const { world, spec, D } = base(scene, 's4p');
  const { halfW, halfD } = shell(world, spec, [gap('s')], D, {
    patches: [{ x: 0, z: -3, r: 3.4, kind: 'blossom' }, { x: 6, z: 4, r: 2.4, kind: 'sand' }],
  });
  world.spawn = { x: 0, z: 6, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 's4b', { x: 0, z: -10, angle: 0 });
  world.markers.chestDefs = [{ id: 'c_s4p', tier: 'gold', x: 0, z: -4.2, ry: -0.3, loot: { shards: 34, heartPiece: 1, gear: 'sword_storm' } }];
  world.reserve(0, -4.2, 2.6, 'chest');
  scatter(world, halfW, halfD, D, 533, 5, { spin: 1, kinds: ['rockSA', 'flowerA', 'flowerB'] });
  wayshrine(world, -6, 2, 0.4, D);
  lowWall(world, 6, -4, 1.57, D, 3.5);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export async function buildSc4(scene) {
  const { world, spec, D } = base(scene, 'sc4');
  const { halfW, halfD } = shell(world, spec, [gap('e'), gap('n'), gap('s')], D, {
    patches: [{ x: 0, z: 0, r: 3.4, kind: 'sand' }],
  });
  world.spawn = { x: 9, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 's4b', { x: -9, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'n', halfW, halfD, 'scr', { x: 0, z: 10, angle: Math.PI });
  // L5/L6 RE-KEY (2026-08-22): matches the new door in s4a.
  sideDoor(world, 's', halfW, halfD, 's4a', { x: 0, z: -10, angle: 0 });
  world.markers.restSpot = { x: 0, z: 0 };
  world.markers.potionSpot = { x: -6, z: 3 };
  world.markers.chestDefs = [{ id: 'c_sc4', tier: 'silver', x: 7, z: -3.5, ry: 0.2, loot: { potion: 2 } }];
  world.reserve(7, -3.5, 2.6, 'chest');
  galeLane(world, { x: 0, z: 0, w: 9, d: 11, dir: 'n', strength: 'breeze' });
  // L5/L6 RE-KEY (2026-08-22): the new south door (see above) blocks a couple
  // of stairSides()'s 38 wall slots, which shifts its seeded RNG sequence for
  // every slot after — not just the ones near the new door — and that shift
  // happened to thin out the arrival frame (spawn faces east; only the east
  // edge is ever in view here). scatter() cycles all four edges per count, so
  // only ~1 in 4 draws lands on the east wall — bumped well past the naive
  // 1-for-1 replacement to reliably clear the density floor again.
  scatter(world, halfW, halfD, D, 534, 40, { spin: 1, kinds: ['rockSB', 'snowRockS'] });
  stairSides(world, halfW, halfD, D, 5341);
  lowWall(world, 0, -5, 0, D, 6.0);
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// ARIA'S CROWN
// ---------------------------------------------------------------------------
export async function buildScr(scene) {
  const { world, spec, D } = base(scene, 'scr');
  const { halfW, halfD } = shell(world, spec,
    state.flags.ariaDefeated ? [gap('s'), gap('n')] : [gap('s')], D, {
      patches: [{ x: 0, z: 0, r: 7.0, kind: 'sand' }, { x: -9, z: -8, r: 3.2, kind: 'gravel' }],
    });
  // THE WAY ON. Once the gale drops off the crown, the north side opens: the
  // long path down off the cliffs and into the drowned vale below.
  const onward = !!state.flags.ariaDefeated;
  world.spawn = { x: 0, z: 10, angle: Math.PI };
  sideDoor(world, 's', halfW, halfD, 'sc4', { x: 0, z: -5, angle: 0 });
  if (onward) sideDoor(world, 'n', halfW, halfD, 'd1a', { x: 0, z: 10, angle: Math.PI });

  heroProp(world, 0, 0, 'crownstones', D);
  if (!state.flags.ariaDefeated) {
    world.markers.bossSpot = { x: 0, z: -2.0, skin: 'aria' };
  } else {
    // THE QUIET CROWN: the gale has dropped and her light rests on the stones
    world.bgColor = 0x3c5878;
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4b0, emissiveIntensity: 2.2, roughness: 1 })
    );
    heart.position.set(0, 1.4, -3.0);
    world.add(heart);
    const hl = new THREE.PointLight(0xc9d4ff, 5, 13, 1.8);
    hl.position.set(0, 1.7, -3.0);
    world.add(hl);
    world.onAnimate((t) => { heart.position.y = 1.4 + Math.sin(t * 1.5) * 0.14; heart.rotation.y = t * 0.8; });
    world.markers.ariaShrine = { x: 0, z: -3.0 };
    world.markers.healed = true;
    world.markers.chestDefs = [
      { id: 'c_scr_crown', tier: 'gold', x: -4.5, z: -5.5, ry: 0.6, loot: { shards: 40, powerup: 'star' } },
    ];
    world.reserve(-4.5, -5.5, 2.6, 'chest');
  }
  scatter(world, halfW, halfD, D, 541, 4, { spin: 1, kinds: ['rockSA', 'flowerB'] });
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

// ---------------------------------------------------------------------------
// THE WIND BRIDGE — the shortcut, opened from the top.
// ---------------------------------------------------------------------------
export async function buildSsA(scene) {
  const { world, spec, D } = base(scene, 'ssA');
  const { halfW, halfD } = shell(world, spec, [gap('w'), gap('e')], D, {
    patches: [{ x: 0, z: 0, r: 3.6, kind: 'sand' }],
  });
  world.spawn = { x: 9, z: 0, angle: Math.PI / 2 };
  sideDoor(world, 'e', halfW, halfD, 's4a', { x: -9, z: 0, angle: -Math.PI / 2 });
  sideDoor(world, 'w', halfW, halfD, 's1a', { x: 11, z: 0, angle: Math.PI / 2 });
  world.markers.restSpot = { x: 0, z: 0 };
  // the bridge itself runs down the middle, and the wind runs down it with you
  galeLane(world, { x: 0, z: 0, w: 20, d: 5.0, dir: 'w', strength: 'breeze' });
  if (!GREY()) {
    // each span is its own node, for the same reason the stair's rubble is:
    // seven slabs laid end to end are seven things a child sees, not one
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      g.position.set(-9 + i * 3, 0, 0);
      place(world, g, skyKit.bridge, 'bridge', 0, 0, 0, 1.0, 0, 0,
        weathered(D, (i % 4) / 3).propTint);
      world.add(g);
    }
  }
  scatter(world, halfW, halfD, D, 542, 4, { spin: 1, kinds: ['rockSB', 'snowRockS'] });
  stairSides(world, halfW, halfD, D, 5421);
  // what is left of the bridge's parapet, and the shrine at the head of it —
  // somebody built this crossing, and a bare span says nobody ever did
  lowWall(world, 6, -4.2, 0, weathered(D, 0.2), 5.0);
  lowWall(world, 6, 4.2, 0, weathered(D, 0.7), 5.0);
  lowWall(world, -6, -4.2, 0, weathered(D, 0.9), 4.0);
  wayshrine(world, 8.5, 3.6, -0.6, weathered(D, 0.45));
  world.markers.breakables = potSpotsOrFewer(world, halfW, halfD, spec);
  return finish(world, spec, D);
}

export const LEVEL5_ROOMS = {
  s1a: buildS1a, s1b: buildS1b, s1p: buildS1p, sc1: buildSc1,
  s2a: buildS2a, s2b: buildS2b, s2p: buildS2p, ssh: buildSsh, sc2: buildSc2,
  s3a: buildS3a, s3b: buildS3b, s3p: buildS3p, svn: buildSvn, sc3: buildSc3,
  s4a: buildS4a, s4b: buildS4b, s4p: buildS4p, sc4: buildSc4,
  scr: buildScr,
  ssA: buildSsA,
};

export { WIND };
