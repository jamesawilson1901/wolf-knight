// Ember Hollow — the three rooms from design/LEVEL-MAP.md, kit-bashed from
// real Kenney pieces. Rooms are rebuilt from scratch on every entry, which
// gives room-reset-on-re-entry (anti-soft-lock) for free; anything permanent
// (boss defeated, burnables burned, pups collected) lives in state.flags and
// is applied at build time.

import * as THREE from 'three';
import { loadGLB, prepareModel, instancePlacements } from './assets.js';
import { World } from './world.js';
import { state } from './state.js';

// ---------------------------------------------------------------------------
// Shared kit-bash helpers
// ---------------------------------------------------------------------------

let kit = null;
export async function loadKit() {
  if (kit) return kit;
  const names = {
    floor: './assets/env/floor-tile.glb',
    cliff: './assets/env/cliff-block.glb',
    rockLA: './assets/env/rock-large-a.glb',
    rockLB: './assets/env/rock-large-b.glb',
    rockLC: './assets/env/rock-large-c.glb',
    rockSA: './assets/env/rock-small-a.glb',
    rockSB: './assets/env/rock-small-b.glb',
    pillar: './assets/env/pillar.glb',
    campfire: './assets/env/campfire.glb',
    bridge: './assets/env/bridge-stone.glb',
    bush: './assets/env/bush-large.glb',
    logStack: './assets/env/log-stack.glb',
    stump: './assets/env/stump.glb',
  };
  const entries = await Promise.all(
    Object.entries(names).map(async ([k, url]) => [k, await loadGLB(url)])
  );
  kit = Object.fromEntries(entries);
  return kit;
}

// Floor + wall ring with door gaps. Gaps are world-coordinate intervals along
// a wall side; wall COLLIDERS are split around the gaps so doorways are
// actually walkable, and door zones can be laid in the openings.
function buildShell(world, w, d, gaps = []) {
  const halfW = w / 2;
  const halfD = d / 2;

  const floorPlacements = [];
  for (let tx = 0; tx < w; tx++) {
    for (let tz = 0; tz < d; tz++) {
      floorPlacements.push({
        x: tx - halfW + 0.5,
        z: tz - halfD + 0.5,
        ry: ((tx * 7 + tz * 13) % 4) * Math.PI / 2,
      });
    }
  }
  world.add(instancePlacements(kit.floor.scene, floorPlacements, { castShadow: false }));

  const inGap = (side, coord) =>
    gaps.some((g) => g.side === side && coord > g.from && coord < g.to);

  const wallPlacements = [];
  const addWallCell = (tx, tz, side, coord) => {
    if (inGap(side, coord)) return;
    wallPlacements.push({
      x: tx - halfW + 0.5,
      z: tz - halfD + 0.5,
      ry: (Math.abs(tx * 11 + tz * 5) % 4) * Math.PI / 2,
      sy: 1.9 + (Math.abs(tx * 31 + tz * 17) % 3) * 0.18,
    });
  };
  for (let tx = -1; tx <= w; tx++) {
    addWallCell(tx, -1, 'n', tx - halfW + 0.5);
    addWallCell(tx, d, 's', tx - halfW + 0.5);
  }
  for (let tz = 0; tz < d; tz++) {
    addWallCell(-1, tz, 'w', tz - halfD + 0.5);
    addWallCell(w, tz, 'e', tz - halfD + 0.5);
  }
  world.add(instancePlacements(kit.cliff.scene, wallPlacements));

  // Wall colliders, split around gaps (each gap: one collider segment ends,
  // the next begins). Sides: n = z:-halfD-1..-halfD, s = z:halfD..halfD+1,
  // w = x:-halfW-1..-halfW, e = x:halfW..halfW+1.
  const segments = (side, lo, hi) => {
    const cuts = gaps
      .filter((g) => g.side === side)
      .sort((a, b) => a.from - b.from);
    let start = lo;
    const out = [];
    for (const c of cuts) {
      if (c.from > start) out.push([start, c.from]);
      start = c.to;
    }
    if (start < hi) out.push([start, hi]);
    return out;
  };
  for (const [a, b] of segments('n', -halfW - 1, halfW + 1)) world.addBox(a, b, -halfD - 1, -halfD);
  for (const [a, b] of segments('s', -halfW - 1, halfW + 1)) world.addBox(a, b, halfD, halfD + 1);
  for (const [a, b] of segments('w', -halfD - 1, halfD + 1)) world.addBox(-halfW - 1, -halfW, a, b);
  for (const [a, b] of segments('e', -halfD - 1, halfD + 1)) world.addBox(halfW, halfW + 1, a, b);

  return { halfW, halfD };
}

function placeRocks(world, placements) {
  for (const p of placements) {
    const src = { la: kit.rockLA, lb: kit.rockLB, lc: kit.rockLC, sa: kit.rockSA, sb: kit.rockSB }[p.kind];
    const rock = prepareModel(src.scene.clone());
    rock.position.set(p.x, 0, p.z);
    rock.rotation.y = p.ry || 0;
    rock.scale.setScalar(p.s);
    world.add(rock);
    if (p.cr) world.addCircle(p.x, p.z, p.cr);
  }
}

// A row of cliff blocks INSIDE a room (for nooks/cubbies), with a collider.
function blockRow(world, x0, z0, x1, z1, height = 1.6) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const count = Math.max(1, Math.round(len));
  const placements = [];
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0.5 : i / (count - 1);
    placements.push({
      x: x0 + dx * f,
      z: z0 + dz * f,
      ry: ((i * 3) % 4) * Math.PI / 2,
      sy: height + (i % 3) * 0.12,
    });
  }
  world.add(instancePlacements(kit.cliff.scene, placements));
  const pad = 0.5;
  world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad, Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
}

// Lava pool: emissive plane + warm pulsing point light + damage zone.
function lavaPool(world, x, z, w, d, { light = true } = {}) {
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff5a2b,
      emissiveIntensity: 1.8,
      roughness: 1,
    })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(x, 0.02, z);
  world.add(lava);
  world.addLava(x - w / 2, x + w / 2, z - d / 2, z + d / 2);

  let pointLight = null;
  if (light) {
    pointLight = new THREE.PointLight(0xff6a33, 12, Math.max(w, d) * 3.2, 1.8);
    pointLight.position.set(x, 1.2, z);
    world.add(pointLight);
  }
  const phase = x * 1.7 + z * 0.9;
  world.onAnimate((t) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.3 + phase) * Math.sin(t * 0.7 + phase);
    lava.material.emissiveIntensity = 1.5 + pulse * 0.9;
    if (pointLight) pointLight.intensity = 9 + pulse * 6;
  });
  return lava;
}

// Checkpoint: campfire with a warm glow; lights up brighter once reached.
function checkpoint(world, id, x, z) {
  const fire = prepareModel(kit.campfire.scene.clone());
  fire.position.set(x, 0, z);
  fire.scale.setScalar(1.4);
  world.add(fire);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa03a, emissiveIntensity: 2.2, roughness: 1 })
  );
  flame.position.set(x, 0.35, z);
  world.add(flame);

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
  return cp;
}

// Ember geyser: stone ring, telegraphed eruption on a fixed cycle.
// Cycle: dormant 2.0s → telegraph 0.5s (glow) → erupt 1.0s (damaging column).
function geyser(world, x, z, offset = 0) {
  const ring = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ring.push({ x: x + Math.cos(a) * 0.5, z: z + Math.sin(a) * 0.5, ry: a, sx: 0.9, sy: 0.9, sz: 0.9 });
  }
  world.add(instancePlacements(kit.rockSB.scene, ring));

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a2b, emissiveIntensity: 0.4, roughness: 1 })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, 0.03, z);
  world.add(disc);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.44, 2.4, 10, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xff7a3a, emissiveIntensity: 2.4,
      transparent: true, opacity: 0.92, roughness: 1, side: THREE.DoubleSide,
    })
  );
  column.position.set(x, 1.2, z);
  column.scale.y = 0.01;
  column.visible = false;
  world.add(column);

  const g = { x, z, r: 0.62, active: false };
  world.geysers.push(g);

  const CYCLE = 3.5, TELEGRAPH = 2.0, ERUPT = 2.5;
  world.onAnimate((t) => {
    const ph = (t + offset) % CYCLE;
    if (ph < TELEGRAPH) {
      g.active = false;
      column.visible = false;
      disc.material.emissiveIntensity = 0.4;
    } else if (ph < ERUPT) {
      g.active = false;
      const f = (ph - TELEGRAPH) / (ERUPT - TELEGRAPH);
      disc.material.emissiveIntensity = 0.6 + f * 2.2;
      column.visible = true;
      column.scale.y = 0.05 + f * 0.12;
    } else {
      g.active = true;
      const f = (ph - ERUPT) / (CYCLE - ERUPT);
      column.visible = true;
      column.scale.y = 0.5 + 0.5 * Math.sin(Math.min(f * 2.4, 1) * Math.PI / 2) + 0.06 * Math.sin(t * 31);
      disc.material.emissiveIntensity = 2.8;
    }
  });
}

// Burnable obstacle: a scorched clump of vines/logs blocking a passage.
// Breakable by the Fire Wolf ground-slam (Phase 6); already-burned ones are
// skipped at build time (state.flags.burned).
const SCORCH = new THREE.Color(0x241a18);
function burnable(world, id, x, z, ry = 0) {
  if (state.flags.burned[id]) return null;

  const group = new THREE.Group();
  const parts = [
    { src: kit.bush, dx: 0, dz: 0, s: 1.6, ry: 0.3 },
    { src: kit.bush, dx: 0.55, dz: 0.35, s: 1.15, ry: 2.4 },
    { src: kit.logStack, dx: -0.45, dz: 0.25, s: 1.05, ry: 1.2 },
    { src: kit.stump, dx: 0.2, dz: -0.4, s: 0.9, ry: 4.0 },
  ];
  for (const p of parts) {
    const m = prepareModel(p.src.scene.clone());
    // scorch every material dark (clone so shared kit tints stay intact)
    m.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.color.lerp(SCORCH, 0.82);
    });
    m.position.set(p.dx, 0, p.dz);
    m.rotation.y = p.ry;
    m.scale.setScalar(p.s);
    group.add(m);
  }
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  world.add(group);

  const collider = { x, z, r: 0.95 };
  world.circleColliders.push(collider);
  const b = { id, x, z, group, collider, burned: false };
  world.markers['burnable_' + id] = b;
  return b;
}

// Dark zone: real-lighting darkness. The zone rect dims the global rig when
// the player stands inside it (Knight form → near-black; the Dark Wolf will
// counter it in Phase 3). A translucent veil shows the darkness from outside.
function darkZone(world, minX, maxX, minZ, maxZ) {
  const veilMat = new THREE.MeshBasicMaterial({
    color: 0x0a0714, transparent: true, opacity: 0.62, depthWrite: false,
  });
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
    veilMat
  );
  veil.rotation.x = -Math.PI / 2;
  veil.position.set((minX + maxX) / 2, 1.65, (minZ + maxZ) / 2);
  world.add(veil);
  world.darkZones.push({ minX, maxX, minZ, maxZ, veilMat });
}

// ---------------------------------------------------------------------------
// Room 1 — Hollow Entrance (teaches: move, attack, form-switch)
// ---------------------------------------------------------------------------

async function buildR1(scene) {
  const world = new World(scene);
  buildShell(world, 16, 12, [
    { side: 'n', from: 4.8, to: 7.2 }, // exit to R2 (top-right)
    ...(state.flags.shortcutOpen ? [{ side: 'w', from: -3.2, to: -0.8 }] : []),
  ]);
  world.spawn = { x: -1, z: 4, angle: Math.PI };

  // Exit door → R2 south-west entrance
  world.addDoor(4.8, 7.2, -6.9, -5.85, 'r2', { x: -8, z: 4.4, angle: 0 });
  // Shortcut door (opens after the boss) → back from R1 to nothing; the
  // matching door lives in R3. From R1 it is only an opening in the wall.
  if (state.flags.shortcutOpen) {
    world.addDoor(-8.9, -7.85, -3.2, -0.8, 'r3', { x: -6.6, z: 0.6, angle: Math.PI / 2 });
  }

  // Lava patches (upper-left) with the two castle pillars framing the big one
  lavaPool(world, -5.2, -4.6, 2.6, 1.6);
  lavaPool(world, 0.6, -1.6, 1.4, 1.1, { light: false });
  for (const px of [-6.8, -3.6]) {
    const pillar = prepareModel(kit.pillar.scene.clone());
    pillar.position.set(px, 0, -5.0);
    pillar.scale.setScalar(0.6);
    world.add(pillar);
    world.addCircle(px, -5.0, 0.55);
  }

  // Dark nook (SE corner): cliff enclosure, entrance on the west side.
  blockRow(world, 3.5, 1.5, 7.5, 1.5, 1.5);          // north edge of nook
  blockRow(world, 3.5, 2.5, 3.5, 2.9, 1.5);          // west edge, above gap
  blockRow(world, 3.5, 5.0, 3.5, 5.4, 1.5);          // west edge, below gap
  darkZone(world, 3.9, 8, 2.0, 6);
  world.markers.pup1Spot = { x: 6.4, z: 4.2 };
  world.markers.darkNookMouth = { x: 3.0, z: 4.0 };

  // Burnable cubby (SW corner): pocket walled off, mouth plugged by vines.
  blockRow(world, -4.0, 2.6, -4.0, 3.0, 1.5);        // east edge, above gap
  blockRow(world, -7.5, 2.5, -4.5, 2.5, 1.5);        // north edge of cubby
  burnable(world, 'r1_cubby', -3.95, 4.4);
  world.markers.pup3Spot = { x: -6.4, z: 4.6 };

  // Checkpoint CP1 at the exit
  checkpoint(world, 'cp1', 5.9, -4.4);

  // Scattered rocks (center kept walkable)
  placeRocks(world, [
    { kind: 'lb', x: 2.4, z: -4.7, s: 2.2, ry: 2.1, cr: 0.95 },
    { kind: 'sa', x: -2.6, z: -3.2, s: 1.7, ry: 1.2, cr: 0.35 },
    { kind: 'sb', x: -6.6, z: -1.4, s: 1.5, ry: 0.9, cr: 0.32 },
    { kind: 'sa', x: 1.6, z: 1.4, s: 1.4, ry: 2.6, cr: 0.3 },
    { kind: 'sb', x: -1.2, z: 0.2, s: 1.2, ry: 4.8, cr: 0.26 },
  ]);

  // Where the first Shade will stand from Phase 4 on
  world.markers.shadeSpots = [{ x: 0.5, z: -3.6 }];

  return world;
}

// ---------------------------------------------------------------------------
// Room 2 — Ember Causeway (teaches: dodging, telegraphs; optional branch)
// ---------------------------------------------------------------------------

async function buildR2(scene) {
  const world = new World(scene);
  buildShell(world, 20, 12, [
    { side: 'w', from: 3.2, to: 5.6 },   // back to R1
    { side: 'n', from: 7.3, to: 9.7 },   // boss door to R3
  ]);
  world.spawn = { x: -8, z: 4.4, angle: 0 };

  world.addDoor(-10.15, -9.1, 3.2, 5.6, 'r1', { x: 5.6, z: -4.9, angle: Math.PI });
  world.addDoor(7.3, 9.7, -6.9, -5.85, 'r3', { x: 0, z: 6.2, angle: Math.PI });

  // Lava channel across the room, crossed by a stone bridge at x = 0
  lavaPool(world, -5.6, -2, 8.8, 2);
  lavaPool(world, 5.6, -2, 8.8, 2);
  const bridge = prepareModel(kit.bridge.scene.clone());
  bridge.position.set(0, 0.02, -2);
  bridge.rotation.y = Math.PI / 2;
  bridge.scale.set(1.6, 1.1, 2.4);
  world.add(bridge);

  // Bridge rails: keep kids from clipping the pool edges diagonally
  world.addBox(-1.7, -1.1, -3.1, -0.9);
  world.addBox(1.1, 1.7, -3.1, -0.9);

  // Geyser crossing on the north band (pure-skill gate, no enemy)
  geyser(world, 2.6, -4.5, 0.0);
  geyser(world, 4.6, -3.9, 1.15);
  geyser(world, 6.5, -4.7, 2.3);

  // Checkpoint CP2 just before the boss door
  checkpoint(world, 'cp2', 8.6, -3.6);

  // The optional branch (SE): rock-flanked pocket, Shadow Hound + Pup #2 later
  placeRocks(world, [
    { kind: 'la', x: 3.6, z: 2.6, s: 2.4, ry: 0.4, cr: 1.05 },
    { kind: 'lc', x: 8.9, z: 1.8, s: 2.2, ry: 4.2, cr: 0.95 },
    { kind: 'sb', x: 5.4, z: 2.2, s: 1.5, ry: 3.3, cr: 0.32 },
  ]);
  world.markers.pup2Spot = { x: 7.2, z: 4.4 };
  world.markers.houndSpot = { x: 6.0, z: 3.6 };
  world.markers.branchMouth = { x: 4.6, z: 3.2 };

  // West-side scatter + a stump for flavor
  placeRocks(world, [
    { kind: 'sa', x: -6.4, z: 0.6, s: 1.6, ry: 1.2, cr: 0.34 },
    { kind: 'sb', x: -3.2, z: 2.4, s: 1.3, ry: 0.9, cr: 0.28 },
    { kind: 'sa', x: -8.2, z: -3.9, s: 1.5, ry: 2.2, cr: 0.32 },
  ]);
  const stump = prepareModel(kit.stump.scene.clone());
  stump.position.set(-4.8, 0, 5.0);
  stump.scale.setScalar(1.3);
  world.add(stump);
  world.addCircle(-4.8, 5.0, 0.4);

  // Moth spawn markers for Phase 4 (near the lava channel)
  world.markers.mothSpots = [{ x: -4.5, z: -3.4 }, { x: -1.8, z: -0.6 }];

  return world;
}

// ---------------------------------------------------------------------------
// Room 3 — Heart of the Hollow (boss arena)
// ---------------------------------------------------------------------------

async function buildR3(scene) {
  const world = new World(scene);
  buildShell(world, 16, 16, [
    { side: 's', from: -1.3, to: 1.3 },  // entry from R2
    ...(state.flags.shortcutOpen ? [{ side: 'w', from: -0.6, to: 1.8 }] : []),
  ]);
  world.spawn = { x: 0, z: 6.2, angle: Math.PI };

  world.addDoor(-1.3, 1.3, 7.85, 8.9, 'r2', { x: 8.5, z: -4.9, angle: Math.PI });
  if (state.flags.shortcutOpen) {
    world.addDoor(-8.9, -7.85, -0.6, 1.8, 'r1', { x: -7.2, z: -2, angle: Math.PI / 2 });
  } else {
    // Sealed shortcut: a rock plug in front of the west wall — hints that
    // something opens here after the boss.
    placeRocks(world, [
      { kind: 'la', x: -7.2, z: 0.6, s: 2.0, ry: 1.1, cr: 0.95 },
      { kind: 'sb', x: -6.9, z: 1.7, s: 1.5, ry: 2.8, cr: 0.3 },
    ]);
  }

  // Lava rim inside the walls (the arena boundary "edge") — the entry
  // walkway crosses the south rim on a stone bridge.
  lavaPool(world, 0, -7.35, 15.6, 1.1, { light: true });
  lavaPool(world, -4.45, 7.35, 6.7, 1.1, { light: false });
  lavaPool(world, 4.45, 7.35, 6.7, 1.1, { light: false });
  lavaPool(world, -7.35, 0, 1.1, 13.6, { light: false });
  lavaPool(world, 7.35, 0, 1.1, 13.6, { light: true });
  const walkway = prepareModel(kit.bridge.scene.clone());
  walkway.position.set(0, 0.02, 7.35);
  walkway.scale.set(2.4, 1.1, 1.5);
  world.add(walkway);

  // Four pillars give cover from dives
  for (const [px, pz] of [[-4.2, -2.8], [4.2, -2.8], [-4.2, 2.4], [4.2, 2.4]]) {
    const pillar = prepareModel(kit.pillar.scene.clone());
    pillar.position.set(px, 0, pz);
    pillar.scale.setScalar(0.75);
    world.add(pillar);
    world.addCircle(px, pz, 0.68);
  }

  // Checkpoint CP3 at the arena entrance
  checkpoint(world, 'cp3', -2.2, 5.6);

  // Caged Cinder: a weak warm ember at the center (the Shadowgrip itself
  // arrives in Phase 6). After the boss, Cinder is freed — no cage here.
  if (!state.flags.bossDefeated) {
    const ember = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb25a, emissiveIntensity: 2.4, roughness: 1 })
    );
    ember.position.set(0, 1.3, -0.5);
    world.add(ember);
    const glow = new THREE.PointLight(0xffb25a, 6, 9, 1.9);
    glow.position.set(0, 1.6, -0.5);
    world.add(glow);
    world.onAnimate((t) => {
      ember.position.y = 1.3 + Math.sin(t * 1.7) * 0.12;
      glow.intensity = 5 + Math.sin(t * 2.6) * 1.2;
    });
    world.markers.cinder = { ember, glow };
  }
  world.markers.bossSpot = { x: 0, z: -0.5 };

  return world;
}

export const ROOMS = { r1: buildR1, r2: buildR2, r3: buildR3 };

export async function buildRoom(id, scene) {
  await loadKit();
  return ROOMS[id](scene);
}
