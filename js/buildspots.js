// SOMETHING TO BUILD FOR (v3.199). Dad: "There still isn't a real incentive
// to learn to build and craft. It's there but no real reward or anything?"
//
// He was right, and the reason was underneath the menus: nothing in play ever
// NEEDED a thing you made or gathered. This puts the need out in the world,
// where a child can see it. In one room of every region there is now a little
// island with a chest on it, cut off by a drop all the way round. The bridge
// over the drop has fallen in. Its ghost hangs there in gold — this game's
// "act here" colour — with a board above it that shows what fixing it takes,
// as pictures and dots: a log and eight dots means eight pieces of wood, and
// every piece you are already carrying fills a dot. Walk up with the dots
// full and the bridge builds itself in front of you, plank by plank.
//
// What waits on the island is what makes gathering worth it: crystals (the
// rare thing the best recipes and the Forge want), coins, and the scrolls for
// the recipes no menu shows until you find them — the boss charms among them.
//
// THE DROP CANNOT BE JUMPED. Not by making it wide (a double jump carries
// five metres, which would need a moat bigger than most rooms) but by a rail
// of collider along both rims: walls stop a body whether or not it is in the
// air (js/world.js — collisions live on the XZ plane), so the only way over is
// the bridge, and nobody ever falls in. The bridge, once built, carries its
// own rails for the same reason, and a safe zone so the pit under it is floor.
//
// Built is forever (WS 'build' namespace, saved with the rest of the world
// flags). A room rebuilt later shows the bridge standing.

import * as THREE from 'three';
import { loadGLB, prepareModel } from './assets.js';
import { WS } from './worldstate.js';
import { canAfford, spendMaterials, materialCount } from './materials.js';
import { latePit } from './levelkit.js';
import { claimRoomRect } from './world.js';
import { drawCostBoard } from './matIcons.js';
import { audio } from './audio.js';
import { juice } from './juice.js';
import { bumpCounter } from './progress.js';

const ISL = 1.4;    // island half-width
const GAP = 1.8;    // the drop, island edge to outer rim
const OUT = ISL + GAP;
const BW = 1.6;     // bridge width
const RAIL = 0.24;  // rail collider thickness
const TILE = 1.04;  // bridge-stone.glb is a 1.04 square tile (js/level1.js slab)

// A bridge's look is the material it is made of: timber, cut stone, or iron.
const LOOKS = {
  wood: 0x9a6a3e,
  stone: 0xcfc0ad,
  iron: 0x8c929e,
};

// One per region, in a room the child already walks through, on open floor a
// probe measured clear of doors, spawns, hazards and every prop
// (tools/verify-buildspots.mjs re-measures it). The cost climbs with the
// region and with the tools a child can own by then: the pickaxe is on
// Maren's first shelf, the axe on her second, ingots come from the Forge.
const spot = (d) => d;
export const BUILD_SPOTS = {
  la: spot({ id: 'ember', room: 'la', region: 'ember_hollow', x: -11.5, z: 4, look: 'stone',
    cost: { ore: 6 },
    loot: { shards: 30, materials: { crystal: 2 }, recipe: 'ember_charm' } }),
  vc1: spot({ id: 'stone', room: 'vc1', region: 'stoneroot', x: 10.9, z: -4.1, look: 'stone',
    cost: { ore: 8 },
    loot: { shards: 35, materials: { crystal: 2, shard_earth: 3 } } }),
  t2a: spot({ id: 'woods', room: 't2a', region: 'wildwoods', x: -11.5, z: -8.5, look: 'wood',
    cost: { wood: 8 },
    loot: { shards: 35, materials: { crystal: 2 }, recipe: 'root_charm' } }),
  f3: spot({ id: 'frost', room: 'f3', region: 'frostpeak', x: 8.9, z: -7.6, look: 'wood',
    cost: { wood: 8, ore: 4 },
    loot: { shards: 40, materials: { crystal: 3 }, recipe: 'sword_ultimate' } }),
  s2b: spot({ id: 'storm', room: 's2b', region: 'stormreach', x: -11.5, z: 1, look: 'wood',
    cost: { wood: 10, ore: 5 },
    loot: { shards: 45, materials: { crystal: 3, ingot: 2 } } }),
  d2a: spot({ id: 'vale', room: 'd2a', region: 'sunkenvale', x: -11.5, z: -8.5, look: 'iron',
    cost: { wood: 6, ore: 6, ingot: 2 },
    loot: { shards: 50, materials: { crystal: 3 }, recipe: 'ward_stone' } }),
  xm2: spot({ id: 'court', room: 'xm2', region: 'shadowcourt', x: 10.5, z: 6.5, look: 'iron',
    cost: { ore: 8, ingot: 3 },
    loot: { shards: 60, materials: { crystal: 4 } } }),
};

// The island's whole square, rim and approach included, claimed before any
// room dresses itself (js/world.js blocked()).
const PAD = 0.6;
for (const s of Object.values(BUILD_SPOTS)) {
  claimRoomRect(s.room, { minX: s.x - OUT - PAD, maxX: s.x + OUT + PAD,
    minZ: s.z - OUT - PAD, maxZ: s.z + OUT + 1.8 }, 'buildspot');
}

export function isBuilt(id) { return WS.get('build', id); }

let tileGltf = null;

// BEFORE spawnChests (js/main.js): the island's chest is an ordinary chest,
// given to the ordinary chest pipeline, so it glows, opens and saves like
// every other one.
export function addBuildSpotMarkers(world) {
  const s = BUILD_SPOTS[world.roomId];
  if (!s) return;
  // a pot the room set down where the drop will open is simply not set down —
  // a room with one fewer jar reads fine (js/world.js separateProps' own rule)
  const inside = (p) => Math.abs(p.x - s.x) < OUT + PAD && p.z > s.z - OUT - PAD && p.z < s.z + OUT + 1.8;
  if (world.markers.breakables) world.markers.breakables = world.markers.breakables.filter((p) => !inside(p));
  world.markers.chestDefs = [...(world.markers.chestDefs || []),
    { id: 'c_build_' + s.id, x: s.x, z: s.z - 0.2, ry: 0, loot: s.loot }];
}

export async function spawnBuildSpot(world) {
  const s = BUILD_SPOTS[world.roomId];
  if (!s) return;
  if (!tileGltf) tileGltf = await loadGLB('./assets/env/bridge-stone.glb');
  const { x: cx, z: cz } = s;
  // ONE DROP, AND THE ISLAND A PILLAR STANDING IN IT. Dad, on the first cut:
  // "It needs to look like one pit not four of the same assets pieced
  // together." It was four rectangles butted round the island, each drawn
  // with its own walls, so the seams showed as walls inside the hole. Now it
  // is the Moonlit Spire's own construction (js/levelSpire.js pad): one pit,
  // and a pier — a block of floor still standing in it, with real stone sides
  // falling away into the dark, drawn into the same single wall mesh.
  latePit(world, [{ minX: cx - OUT, maxX: cx + OUT, minZ: cz - OUT, maxZ: cz + OUT }], null,
    [{ minX: cx - ISL, maxX: cx + ISL, minZ: cz - ISL, maxZ: cz + ISL, top: 0 }]);
  world.safeZones.push({ minX: cx - ISL, maxX: cx + ISL, minZ: cz - ISL, maxZ: cz + ISL });
  // the pier's top is the room's own floor, carried over: the ground plane's
  // own material and its own UV mapping, so the texture runs on unbroken
  const g = world.root.children.find((c) => c.name === 'ground');
  if (g && g.userData.plane) {
    const W = g.userData.plane.w, H = g.userData.plane.h;
    const x0 = cx - ISL - g.position.x, x1 = cx + ISL - g.position.x;
    const ya = -(cz + ISL - g.position.z), yb = -(cz - ISL - g.position.z);
    const geo = new THREE.BufferGeometry();
    const P = [[x0, ya], [x1, ya], [x1, yb], [x0, yb]];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(([x, y]) => [x, y, 0]), 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(([x, y]) => [x / W + 0.5, y / H + 0.5]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const top = new THREE.Mesh(geo, g.material);
    top.rotation.copy(g.rotation);
    top.position.copy(g.position);
    top.receiveShadow = true;
    top.userData.pitArt = true;
    world.add(top);
    if (world.keepLoose) world.keepLoose(top);
  }
  // the rails: outer rim all round, inner rim all round, each with the
  // bridge's mouth left open on the south (camera) side
  const box = (a, b, c, d) => { const r = { minX: a, maxX: b, minZ: c, maxZ: d }; world.boxColliders.push(r); return r; };
  const o = OUT, i = ISL, t = RAIL, h = BW / 2;
  box(cx - o - t, cx + o + t, cz - o - t, cz - o);          // outer north
  box(cx - o - t, cx - o, cz - o, cz + o + t);              // outer west
  box(cx + o, cx + o + t, cz - o, cz + o + t);              // outer east
  box(cx - o - t, cx - h, cz + o, cz + o + t);              // outer south, left of the mouth
  box(cx + h, cx + o + t, cz + o, cz + o + t);              // ...and right of it
  box(cx - i, cx + i, cz - i, cz - i + t);                  // inner north
  box(cx - i, cx - i + t, cz - i, cz + i);                  // inner west
  box(cx + i - t, cx + i, cz - i, cz + i);                  // inner east
  box(cx - i, cx - h, cz + i - t, cz + i);                  // inner south, either side
  box(cx + h, cx + i, cz + i - t, cz + i);
  const mouth = box(cx - h, cx + h, cz + o, cz + o + t);    // shut until the bridge stands

  // the bridge's tiles: ghost gold until built, then the real thing
  const look = LOOKS[s.look] || LOOKS.wood;
  const span0 = cz + ISL - 0.15, span1 = cz + OUT + 0.15;
  // ONE slab, stretched — four tiles cost la its draw-call budget (126 of 125,
  // verify-density), and a deck reads as a deck either way
  const nx = 1, nz = 1;
  const sx = BW / nx, sz = (span1 - span0) / nz;
  const solidMat = (m) => { const c = m.clone(); if (c.color) c.color.setHex(look); return c; };
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.3,
    depthWrite: false });
  const tiles = [];
  for (let j = nz - 1; j >= 0; j--) {          // near end first: it grows away from the child
    for (let k = 0; k < nx; k++) {
      const m = prepareModel(tileGltf.scene.clone());
      const solid = [];
      m.traverse((n) => {
        if (!n.isMesh) return;
        solid.push([n, Array.isArray(n.material) ? n.material.map(solidMat) : solidMat(n.material)]);
      });
      m.position.set(cx - BW / 2 + (k + 0.5) * sx, (world.deckY || 0) + 0.02, span0 + (j + 0.5) * sz);
      m.scale.set((sx / TILE) * 1.04, 0.3, (sz / TILE) * 1.04);
      world.add(m);
      if (world.keepLoose) world.keepLoose(m);
      tiles.push({ m, solid });
    }
  }
  const setSolid = (tile, on) => {
    for (const [n, mat] of tile.solid) n.material = on ? mat : ghostMat;
  };

  // the cost board, over the mouth
  const canvas = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  board.position.set(cx, 2.5, cz + OUT + 0.6);
  board.frustumCulled = false;
  world.add(board);
  if (world.keepLoose) world.keepLoose(board);
  let boardKey = '';
  const redrawBoard = () => {
    const key = Object.keys(s.cost).map((k) => Math.min(s.cost[k], materialCount(k))).join(',');
    if (key === boardKey) return;
    boardKey = key;
    drawCostBoard(canvas, s.cost, materialCount);
    tex.needsUpdate = true;
    const aspect = canvas.width / canvas.height;
    board.scale.set(1.5 * aspect, 1.5, 1);
  };

  const finish = (quiet) => {
    const k = world.boxColliders.indexOf(mouth);
    if (k >= 0) world.boxColliders.splice(k, 1);
    world.safeZones.push({ minX: cx - h, maxX: cx + h, minZ: span0, maxZ: span1 });
    box(cx - h - t, cx - h, cz + i, cz + o + t);            // the bridge's own rails
    box(cx + h, cx + h + t, cz + i, cz + o + t);
    for (const tl of tiles) setSolid(tl, true);
    board.visible = false;
    latePit(world, []);     // redraw the rim: no brick across the bridge's mouth now
    state.built = true;
    if (!quiet && world.onBuildDone) world.onBuildDone(s);
  };

  const state = { built: isBuilt(s.id), building: null, t: 0 };
  if (state.built) finish(true);
  else { for (const tl of tiles) setSolid(tl, false); redrawBoard(); }

  const ax = cx, az = cz + OUT + 0.85;      // where a child stands to build it
  const spot = { def: s, tiles, board, mouth, get built() { return state.built; },
    get building() { return !!state.building; }, approach: { x: ax, z: az } };
  world.buildSpot = spot;

  world.updateBuildSpot = (dt, t, player) => {
    if (state.built) return;
    state.t += dt;
    if (state.building) {
      const b = state.building;
      b.t += dt;
      player.lockTime = Math.max(player.lockTime, 0.2);
      // the deck GROWS across the drop from the child's side, sparks and a
      // knock at its leading edge as it goes — built in front of them
      const GROW = 1.1;
      const p = Math.min(1, b.t / GROW);
      for (const tl of tiles) {
        if (!tl.full) tl.full = { sz: tl.m.scale.z, z: tl.m.position.z };
        setSolid(tl, true);
        tl.m.scale.z = Math.max(0.02, tl.full.sz * p);
        tl.m.position.z = span1 - (span1 - tl.full.z) * p;
      }
      b.acc = (b.acc || 0) + dt;
      if (p < 1 && b.acc > 0.14) {
        b.acc = 0;
        juice.burst(cx, 0.3, span1 - (span1 - span0) * p, look, 6);
        audio.play('hit', { volume: 0.5, rate: 0.8 + Math.random() * 0.3 });
      }
      if (b.t >= GROW + 0.3) {
        b.next = tiles.length;
        state.building = null;
        WS.set('build', s.id, true);
        bumpCounter('bridgesBuilt');
        audio.play('checkpoint', { volume: 0.9, rate: 0.9 });
        juice.burst(cx, 0.8, cz + ISL + GAP / 2, 0xffd76a, 24);
        finish(false);
      }
      return;
    }
    const pulse = 0.22 + 0.14 * Math.sin(state.t * 3);
    ghostMat.opacity = pulse;
    redrawBoard();      // cheap: it redraws only when a count has changed
    const px = player.root.position.x, pz = player.root.position.z;
    const d = Math.hypot(px - ax, pz - az);
    const n = typeof window !== 'undefined' && window.__game && window.__game.narration;
    if (d < 4.5 && n) n.say(canAfford(s.cost) ? 'build_ready' : 'build_seen');
    if (d < 1.3 && canAfford(s.cost) && player.airY <= 0) {
      if (!spendMaterials(s.cost)) return;
      redrawBoard();
      state.building = { t: 0, next: 0 };
      board.visible = false;
      audio.play('slam', { volume: 0.6, rate: 1.2 });
    }
  };
}
