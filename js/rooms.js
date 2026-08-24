// Ember Hollow — the three rooms from design/LEVEL-MAP.md, kit-bashed from
// real Kenney pieces. Rooms are rebuilt from scratch on every entry, which
// gives room-reset-on-re-entry (anti-soft-lock) for free; anything permanent
// (boss defeated, burnables burned, pups collected) lives in state.flags and
// is applied at build time.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareModel, prepareCharacter, instancePlacements } from './assets.js';
import { World } from './world.js';
import { flattenStatic } from './batch.js';
import { ground } from './ground.js';
import { state, resolveRoom } from './state.js';
import { setRoomSeed } from './ground.js';
import { spawnEnemies } from './enemies.js';
import { Shadowgrip, Boreal } from './boss.js';
import { audio } from './audio.js';
import { WS } from './worldstate.js';
import { boulderGate, waterGate, brazier, brambleGate, iceGate, freezeBrazier,
  pushableBoulder, plateSwitch, registerCuttable } from './gates.js';
import { spawnDenNpcs } from './npcs.js';
import { setupDenGames } from './minigames.js';
import { LEVEL1_ROOMS, loadEmberKit } from './level1.js';
import { LEVEL2_ROOMS, loadCaveKit } from './level2.js';
import { LEVEL3_ROOMS, loadWoodKit } from './level3.js';
import { LEVEL5_ROOMS, loadSkyKit } from './level5.js';
import { LEVEL6_ROOMS, loadValeKit } from './level6.js';
import { LEVEL7_ROOMS, loadCourtKit } from './level7.js';
import { buildPotionMesh } from './loot.js';

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
    pathTile: './assets/env/path-tile.glb',
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
// coolable pools turn to walkable dark basalt once the Ember Key is claimed
// (the region's mid-dungeon twist — cleared rooms read differently).
function lavaPool(world, x, z, w, d, { light = true, coolable = false } = {}) {
  // coolable pools turn to basalt only when the REGION heals (boss down) —
  // never mid-dungeon (user rule: lava stays dangerous until the victory)
  if (coolable && state.flags.bossDefeated) {
    const basalt = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x2b2331, roughness: 1 })
    );
    basalt.rotation.x = -Math.PI / 2;
    basalt.position.set(x, 0.02, z);
    world.add(basalt);
    const veins = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.9, d * 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xff5a2b, emissiveIntensity: 0.18,
        transparent: true, opacity: 0.35, roughness: 1, depthWrite: false,
      })
    );
    veins.rotation.x = -Math.PI / 2;
    veins.position.set(x, 0.03, z);
    world.add(veins); // faint dying embers in the crust
    return basalt;
  }
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
  let wasErupting = false;
  world.onAnimate((t) => {
    const ph = (t + offset) % CYCLE;
    const erupting = ph >= ERUPT;
    if (erupting && !wasErupting) audio.play('geyser', { volume: 0.35, rate: 0.8 });
    wasErupting = erupting;
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
  world.burnables.push(b);
  return b;
}

// Doorway: every exit gets the same read — two flanking pillars with torch
// flames and a soft glowing strip on the floor. Kids learn "glow between
// pillars = way through" once and never get lost.
function doorway(world, x, z, axis /* 'x': gap runs along x */) {
  const off = 1.35;
  const p1 = axis === 'x' ? [x - off, z] : [x, z - off];
  const p2 = axis === 'x' ? [x + off, z] : [x, z + off];
  for (const [px, pz] of [p1, p2]) {
    const pillar = prepareModel(kit.pillar.scene.clone());
    pillar.position.set(px, 0, pz);
    pillar.scale.setScalar(0.45);
    world.add(pillar);
    world.addCircle(px, pz, 0.32);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.34, 6),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc25a, emissiveIntensity: 2.4, roughness: 1 })
    );
    flame.position.set(px, 1.22, pz);
    world.add(flame);
    world.onAnimate((t) => {
      flame.scale.setScalar(0.85 + 0.2 * Math.sin(t * 9 + px * 3 + pz));
    });
  }
  const torchLight = new THREE.PointLight(0xffc25a, 4.5, 6.5, 1.9);
  torchLight.position.set(x, 1.6, z);
  world.add(torchLight);

  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(axis === 'x' ? 2.1 : 0.9, axis === 'x' ? 0.9 : 2.1),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.5, roughness: 1, depthWrite: false,
    })
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(x, 0.03, z);
  world.add(strip);
  world.onAnimate((t) => {
    strip.material.emissiveIntensity = 0.55 + 0.3 * Math.sin(t * 2.1 + x);
  });
}

// THE LANDMARK: the Kiln — a distant volcano cone on the northern skyline
// of every Ember Hollow room. Kids orient by it: the boss is always where
// the mountain is.
function kilnLandmark(world) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(11, 15, 24),
    new THREE.MeshStandardMaterial({ color: 0x241a20, roughness: 1 })
  );
  cone.position.set(3, -1.5, -34);
  world.add(cone);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 2.4, 16),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a2b, emissiveIntensity: 1.6, roughness: 1 })
  );
  tip.position.set(3, 6.6, -34);
  world.add(tip);
  const glow = new THREE.PointLight(0xff5a2b, 8, 30, 2);
  glow.position.set(3, 8, -33);
  world.add(glow);
  world.onAnimate((t) => {
    tip.material.emissiveIntensity = 1.3 + Math.sin(t * 0.9) * 0.5;
    glow.intensity = 7 + Math.sin(t * 1.3) * 2;
  });
}

// A visible dirt path along the critical route (real Kenney path tiles laid
// a hair above the floor). Skips lava cells — bridges carry the route there.
function pathTiles(world, waypoints) {
  const cells = new Map();
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, az] = waypoints[i];
    const [bx, bz] = waypoints[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 0.4));
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const cx = Math.floor(ax + (bx - ax) * f) + 0.5;
      const cz = Math.floor(az + (bz - az) * f) + 0.5;
      if (world.lavaZones.some((l) => cx > l.minX && cx < l.maxX && cz > l.minZ && cz < l.maxZ)) continue;
      // 0.035 up: clear of the floor tops even on 16-bit mobile depth buffers
      cells.set(cx + '|' + cz, { x: cx, y: 0.035, z: cz, ry: ((cells.size * 7) % 4) * Math.PI / 2 });
    }
  }
  world.add(instancePlacements(kit.pathTile.scene, [...cells.values()], {
    castShadow: false,
    materialTints: { dirt: 0x8f6f52, dirtDark: 0x7a5a42, grass: 0x6f585c },
  }));
}

// Healing potion pickup: a little glowing ember flask (code-built). Touch to
// take one (carry limit enforced by the player); respawns with the room.
function potionPickup(world, x, z) {
  // LAW P5: one potion look everywhere — loot.js's buildPotionMesh() is the
  // single place a potion is drawn (this floor pickup, the smashable drop,
  // both call it now).
  const { group, liquid } = buildPotionMesh();
  group.position.set(x, 0, z);
  world.add(group);
  world.onAnimate((t) => {
    group.position.y = 0.05 + Math.sin(t * 2.4 + x) * 0.06;
    group.rotation.y = t * 1.2;
    liquid.material.emissiveIntensity = 1.5 + Math.sin(t * 3.1 + z) * 0.5;
  });
  world.potionSpots.push({ x, z, group, taken: false });
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
    { side: 's', from: 0.8, to: 3.2 }, // down to the Moonlit Den
    { side: 'e', from: -2.2, to: 0.2 }, // the Ash Warrens burrow
    ...(state.flags.shortcutOpen ? [{ side: 'w', from: -3.2, to: -0.8 }] : []),
  ]);
  world.spawn = { x: -1, z: 4, angle: Math.PI };

  // Exit door → R2 south-west entrance
  world.addDoor(4.8, 7.2, -6.9, -5.85, 'r2', { x: -8, z: 4.4, angle: 0 });
  // Cozy stairs down to the Den
  world.addDoor(0.8, 3.2, 5.85, 6.9, 'den', { x: 0, z: 7.4, angle: Math.PI });
  // east burrow into the Ash Warrens
  world.addDoor(7.9, 8.9, -2.2, 0.2, 'r1b', { x: -4.8, z: 0, angle: Math.PI / 2 });
  // Shortcut door (opens after the boss) → back from R1 to nothing; the
  // matching door lives in R3. From R1 it is only an opening in the wall.
  if (state.flags.shortcutOpen) {
    world.addDoor(-8.9, -7.85, -3.2, -0.8, 'r3', { x: -6.6, z: 0.6, angle: Math.PI / 2 });
  }

  // Lava patches (upper-left) with the two castle pillars framing the big one
  lavaPool(world, -5.2, -4.6, 2.6, 1.6, { coolable: true });
  lavaPool(world, 0.6, -1.6, 1.4, 1.1, { light: false, coolable: true });
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
  // BLIND-STRIP LAW (v3.21.1): the pup used to sit at z 4.2 — deep in the
  // ~2.5u strip of floor the camera can never see over the south wall. It is
  // now in the NORTH half of the same nook: still hidden by darkness (which
  // the Dark Wolf's eyes solve), no longer hidden by the camera (which
  // nothing solves).
  world.markers.pup1Spot = { x: 6.4, z: 2.6 };
  world.markers.darkNookMouth = { x: 3.0, z: 4.0 };

  // Burnable cubby (SW corner): pocket walled off, mouth plugged by vines.
  // Pulled ~1.6u north of where it started, for the same reason — this is
  // the game's FIRST taught obstacle (Pip points at it in minute one), and
  // a teaching moment the camera hides teaches nothing.
  blockRow(world, -7.5, 1.6, -4.5, 1.6, 1.5);        // north edge of cubby
  blockRow(world, -4.0, 1.7, -4.0, 2.1, 1.5);        // east edge, above the mouth
  blockRow(world, -4.0, 3.9, -4.0, 5.4, 1.5);        // east edge, below the mouth
  burnable(world, 'r1_cubby', -3.95, 3.0);
  world.markers.pup3Spot = { x: -6.4, z: 2.8 };

  // Checkpoint CP1 at the exit, with a potion beside the fire
  checkpoint(world, 'cp1', 5.9, -4.4);
  potionPickup(world, 4.6, -3.6);

  kilnLandmark(world);

  // Restoration dressing: once the region is healed, green rises through the
  // ash — EXCEPT one scar by the Den stairs that never mends (WORLD-DESIGN §3:
  // one thing stays broken makes the rest believable).
  if (WS.get('ember', 'restored')) {
    healedSprouts(world, [[-2.2, 1.2], [2.6, 3.4], [-5.8, -2.6], [4.4, 0.8], [7.0, -3.6], [-0.6, 5.0]]);
    const scar = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 20),
      new THREE.MeshStandardMaterial({ color: 0x241d1c, roughness: 1 })
    );
    scar.rotation.x = -Math.PI / 2;
    scar.position.set(2.6, 0.045, 5.1);
    world.add(scar);
    world.markers.scarSpot = { x: 2.6, z: 5.1 };
    world.markers.healed = true;
  }

  // Scattered rocks (center kept walkable)
  placeRocks(world, [
    { kind: 'lb', x: 2.4, z: -4.7, s: 2.2, ry: 2.1, cr: 0.95 },
    { kind: 'sa', x: -2.6, z: -3.2, s: 1.7, ry: 1.2, cr: 0.35 },
    { kind: 'sb', x: -6.6, z: -1.4, s: 1.5, ry: 0.9, cr: 0.32 },
    { kind: 'sa', x: 1.6, z: 1.4, s: 1.4, ry: 2.6, cr: 0.3 },
    { kind: 'sb', x: -1.2, z: 0.2, s: 1.2, ry: 4.8, cr: 0.26 },
  ]);

  // The first Shade stands on the critical path between spawn and the exit —
  // every kid meets it (and Pip's sword lesson) before leaving the room.
  world.markers.shadeSpots = [{ x: 2.5, z: -0.5 }];

  // Way-finding: torch-lit doorways + a dirt path toward the exit
  doorway(world, 6, -5.7, 'x');
  doorway(world, 2, 5.6, 'x');
  if (state.flags.shortcutOpen) doorway(world, -7.6, -2, 'z');
  pathTiles(world, [[-1, 4], [1.5, 0.5], [4.5, -2.5], [6, -5.2]]);
  pathTiles(world, [[0.5, 2.5], [2, 5.4]]);

  // Loot: crates near the start, a hidden chest, a burn-cubby reward chest
  world.markers.breakables = [
    { x: -1.6, z: 2.4, kind: 'crate', shards: 2 },
    { x: 0.6, z: 3.3, kind: 'barrel', shards: 2 },
    { x: 3.4, z: -4.9, kind: 'crate', shards: 3 },
  ];
  world.markers.chestDefs = [
    { id: 'c_r1_rocks', tier: 'wood', x: -6.9, z: -2.6, ry: 1.2, loot: { shards: 8 } },
    { id: 'c_r1_cubby', tier: 'wood', x: -7.0, z: 2.8, ry: 0.8, loot: { shards: 12, potion: 1 } },
    // this one stands ON the big pool — only reachable once the lava cools
    ...(state.flags.keys.ember
      ? [{ id: 'c_r1_basalt', tier: 'gold', x: -5.2, z: -4.6, ry: 0.4, loot: { shards: 15, heartPiece: 1 } }]
      : []),
  ];

  return world;
}

// ---------------------------------------------------------------------------
// Room 1b — Ash Warrens (maze burrow: tight switchbacks, shade ambushes in
// dark pockets, a burnable secret, and a one-way ledge drop home)
// ---------------------------------------------------------------------------

async function buildR1b(scene) {
  const world = new World(scene);
  buildShell(world, 12, 12, [
    { side: 'w', from: -1.2, to: 1.2 }, // mouth back to R1 (normal door)
  ]);
  world.spawn = { x: -4.8, z: 0, angle: Math.PI / 2 };
  world.addDoor(-7.05, -6.0, -1.2, 1.2, 'r1', { x: 7.2, z: -1, angle: -Math.PI / 2 });

  // the maze: interior wall runs carve switchback corridors (rule 2 —
  // shaped rooms). Corridors ~2 wide; the route snakes N → E → S → E.
  blockRow(world, -3.2, -3.4, 3.4, -3.4, 1.5);   // upper run
  blockRow(world, -1.2, -0.6, 5.0, -0.6, 1.5);   // middle run (offset mouth)
  blockRow(world, -5.9, 2.2, 1.8, 2.2, 1.5);     // lower run (now wall-to-gap)
  blockRow(world, -3.2, -0.6, -3.2, 2.2, 1.5);   // west spine between runs
  world.markers.breakables = [
    { x: -4.6, z: -4.6, kind: 'crate', shards: 2 },
    { x: 4.6, z: 4.6, kind: 'vase', shards: 3 },
  ];

  // dark ambush pockets — shades wait where the light dies
  // the WHOLE warrens are pitch dark — the Dark Wolf's eyes are the way
  // through, not a nicety (user rule: darkness = the whole room)
  darkZone(world, -5.9, 5.9, -5.9, 5.9);
  world.markers.shadeSpots = [
    { x: 3.4, z: -4.8 }, { x: 4.8, z: -2.2 }, { x: -3.8, z: 0.8 },
  ];

  // the secret: a burnable clump walls off the treasure nook (rule 6).
  // v3.21.1 — the nook now has a real east wall and sits a full 2u further
  // north. A SECRET is allowed to be hidden by darkness; it is not allowed to
  // be hidden by the camera, because then finding it is luck, not searching.
  blockRow(world, 4.2, 2.2, 5.9, 2.2, 1.5);      // east half of the lower run
  // ...and now the clump is the ONLY way through. The old comment claimed it
  // "walls off the treasure nook"; geometrically it never did — the whole south
  // band was open from the west, so the secret was decoration, not a lock.
  burnable(world, 'r1b_secret', 3.0, 2.4, 0.6);  // the plug in the 1.4u mouth
  world.markers.chestDefs = [
    { id: 'c_r1b_maze', tier: 'wood', x: 5.0, z: 3.2, ry: 2.4, loot: { shards: 14, potion: 1 } },
  ];
  potionPickup(world, -5.0, -4.8);

  // the LEDGE (rule 3): a raised lip in the NE corner — walk off it and
  // drop straight back into R1 by the entrance. One-way: R1 has no door
  // back up here.
  const lip = [];
  for (let i = 0; i < 3; i++) lip.push({ x: 4.9 + i * 0.7, z: -5.4, sy: 0.5 });
  world.add(instancePlacements(kit.cliff.scene, lip, { materialTints: { dirt: 0x54463e } }));
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 0.6, transparent: true, opacity: 0.45, roughness: 1, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(5.4, 0.03, -4.6);
  world.add(glow);
  world.onAnimate((t) => { glow.material.emissiveIntensity = 0.5 + 0.3 * Math.sin(t * 2.4); });
  world.addDoor(4.4, 5.9, -5.9, -4.4, 'r1', { x: 6.4, z: 1.2, angle: Math.PI });

  doorway(world, -6.4, 0, 'z');
  return world;
}

// ---------------------------------------------------------------------------
// The Moonlit Den — Luna's warm glade: shop, training barrels, rescued pups.
// The one place with living green grass; corruption never reached it.
// ---------------------------------------------------------------------------

// The Den's palette, in the same shape every district uses so it can hand
// itself straight to the ground painter and the dressing helpers. Warmer and
// greener than anywhere else in the game on purpose: this is the one place that
// is not ruined, buried or rotting.
const DEN_DISTRICT = {
  tint: 0x8fc06a, floorTint: 0x62894a, wallTint: 0x3f4a30, propTint: 0x8a7048,
  ground: 'den', name: 'THE MOONLIT DEN',
};

async function buildDen(scene) {
  const world = new World(scene);
  // ONE MATERIAL PER COLOUR, not one per prop.
  //
  // The Den tints its props by cloning the material on every mesh, which was
  // fine when there were nine of them. Rebuilt at 24 x 18 with a village in it,
  // every crate, stump, torch and bush arrived with a material of its own, so
  // flattenStatic could not bucket any of them and the room came out at 170
  // draw calls against a ceiling of 125.
  //
  // Keyed on the source material plus the tint, exactly as tintedModel does, so
  // forty props that share a colour share one material and merge into one draw.
  const denMats = new Map();
  const denTint = (root, colours) => {
    root.traverse((n) => {
      if (!n.isMesh) return;
      const want = colours[n.material.name];
      if (want === undefined) return;
      const key = `${n.material.uuid}|${want}`;
      if (!denMats.has(key)) {
        const m = n.material.clone();
        m.color.setHex(want);
        denMats.set(key, m);
      }
      n.material = denMats.get(key);
    });
    return root;
  };
  const [tentGltf, cartGltf, treeA, treeB, flowerA, flowerB, mageGltf, generalAnims,
    barrelGltf, crateGltf, torchGltf] =
    await Promise.all([
      loadGLB('./assets/env/den-survival/tent.glb'),
      loadGLB('./assets/env/den-town/cart.glb'),
      loadGLB('./assets/env/tree-a.glb'),
      loadGLB('./assets/env/tree-b.glb'),
      loadGLB('./assets/env/flower-a.glb'),
      loadGLB('./assets/env/flower-b.glb'),
      loadGLB('./assets/chars/mage.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
      // the things that make a camp look INHABITED rather than merely placed:
      // stores that were carried here, light someone hung up, a flag someone
      // chose to fly. All already vendored and licence-cleared 🟢.
      loadGLB('./assets/env/dungeon/Barrel.glb'),
      loadGLB('./assets/env/dungeon/Crate.glb'),
      loadGLB('./assets/env/dungeon/Torch.glb'),
    ]);

  // THE DEN IS A PLACE PEOPLE LIVE, AND IT WAS THE SIZE OF A CORRIDOR.
  //
  // Dad: "there's no textures, it's physically tiny… the den needs to feel more
  // lived in." All three are the same root cause — it was hand-built before the
  // metrics existed and never revisited. It measured 14 x 10, which is the
  // CHOKE module: the smallest space in the game, used for the compression
  // beats between islands. The camera shows 22.2u across, so the entire home
  // base fitted on one screen with room to spare, and every villager, tent,
  // shrine and minigame was crammed into ten units of depth.
  //
  // 24 x 18 — three times the area. Deliberately NOT island-sized (32 x 26):
  // home should feel gathered, and a hub you have to cross twice to reach the
  // shop is a chore rather than a comfort. Between a pocket and an island is
  // where a village belongs.
  const halfW = 12, halfD = 9;

  // ...and it had no painted ground, because it predates js/ground.js: one
  // instanced tile under a flat green tint, which is exactly what dad
  // described as "no textures". It gets the same treatment as every other room
  // now — grass, with the earth worn through where a camp actually wears it.
  // A BIGGER APRON THAN THE THREE UNITS dressShell uses. The Den spawns you
  // 2.4u from its north wall, and from a camera eight units up at 50 degrees
  // you look straight over a two-unit wall and out into the void — which is
  // exactly what the first pass showed as a black band across the top of the
  // frame. The apron is one draw call whatever size it is, so it simply gets
  // big enough to fill what the camera can see past the wall.
  ground(world, halfW * 2 + 16, halfD * 2 + 16, DEN_DISTRICT, {
    seed: 'den',
    patches: [
      // trodden earth, kept SMALL and soft. The first pass used r 3.2-4.2 at
      // full strength and the yard read as three brown blobs dropped on a lawn
      // rather than as grass worn through by feet.
      { x: 0, z: -1, r: 2.8, kind: 'mud', alpha: 0.34 },    // the yard round the fire
      { x: 7.2, z: -4.4, r: 2.4, kind: 'mud', alpha: 0.30 },// where the cart turns
      { x: -7.8, z: -2.5, r: 2.6, kind: 'mud', alpha: 0.30 },// the tent mouths
      { x: 6.2, z: 1.4, r: 2.6, kind: 'gravel' },     // Rook's training patch
      { x: -9.5, z: 6.5, r: 3.4, kind: 'moss', alpha: 0.42 },  // the damp corner
      { x: 9.0, z: 7.0, r: 3.0, kind: 'moss', alpha: 0.42 },
      { x: 0, z: 7.5, r: 2.8, kind: 'gravel' },       // the step up to the gate
    ],
    // the tracks a household actually makes: gate to fire, then fire to the
    // beds, the market and the meadow
    paths: [
      [[0, 9], [0, 4], [0, -1]],                      // gate to fire
      [[0, -1], [-4, -2], [-7.5, -3.5]],              // fire to the beds
      [[0, -1], [4, -2.5], [7, -4.2]],                // fire to the market
      [[0, -1], [1, 3], [1, 6]],                      // fire to the meadow
    ],
    pathWidth: 2.6,
  });

  const wallPlacements = [];
  const addWall = (x, z) => {
    wallPlacements.push({
      x, z,
      ry: (Math.abs(Math.round(x) * 11 + Math.round(z) * 5) % 4) * Math.PI / 2,
      sy: 1.7 + (Math.abs(Math.round(x) * 31 + Math.round(z) * 17) % 3) * 0.15,
    });
  };
  // THE GATE IS ON THE SOUTH WALL, and that is a camera decision rather than a
  // geographic one. CAM_OFFSET sits at +7z and looks toward -z, so the frame
  // always shows 4.5u behind you and 12.9u NORTHWARD. With the gate on the
  // north wall — where the Den had it, because la lies north — you arrived home
  // at z = -8 and the entire camp, every tent, villager and shrine, sat behind
  // the camera. The first pass of this rebuild rendered a fence and a lawn.
  //
  // Gate south, camp north: you come home and the whole place lies in front of
  // you. Walking back out means walking toward the camera, which is what every
  // other room in the game already does with its return door.
  for (let x = -halfW - 0.5; x <= halfW + 0.5; x += 1) {
    addWall(x, -halfD - 0.5);
    if (!(x > -1.8 && x < 1.8)) addWall(x, halfD + 0.5);   // the gap is the stair to la
  }
  for (let z = -halfD + 0.5; z <= halfD - 0.5; z += 1) {
    addWall(-halfW - 0.5, z); addWall(halfW + 0.5, z);
  }
  world.add(instancePlacements(kit.cliff.scene, wallPlacements, {
    materialTints: { grass: 0x4d6a3c, dirt: 0x5a4a34 },
  }));
  world.addBox(-halfW - 1, halfW + 1, -halfD - 1, -halfD);
  world.addBox(-halfW - 1, -1.5, halfD, halfD + 1);         // south wall, either
  world.addBox(1.5, halfW + 1, halfD, halfD + 1);           // side of the stair
  world.addBox(-halfW - 1, -halfW, -halfD - 1, halfD + 1);
  world.addBox(halfW, halfW + 1, -halfD - 1, halfD + 1);
  world.spawn = { x: 0, z: 7.4, angle: Math.PI };
  world.addDoor(-1.4, 1.4, halfD - 0.15, halfD + 0.9, 'la', { x: 0, z: 9, angle: Math.PI });
  doorway(world, 0, halfD - 0.6, 'x');

  // warm heart campfire + tents + trees + flowers
  checkpoint(world, 'cp_den', 0, -1.0);
  for (const [gltf, x, z, s, ry] of [
    // WEST — where people sleep. Two tents facing the fire, mouths onto the
    // worn patch the ground painter puts there.
    [tentGltf, -7.5, -4.6, 1.6, 0.6], [tentGltf, -8.6, 0.4, 1.5, 2.2],
    // the trees that make the glade a glade, pushed out to the corners so the
    // middle stays the plaza
    [treeA, 9.8, -6.4, 1.7, 0.4], [treeB, -4.8, 7.6, 1.6, 2.0],
    [treeA, 10.4, 4.4, 1.5, 3.4], [treeB, -10.6, -5.8, 1.6, 1.1],
    [treeA, 3.2, 8.2, 1.4, 2.7], [treeB, -11.0, 3.4, 1.5, 0.2],
  ]) {
    const m = prepareModel(gltf.scene.clone());
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    m.scale.setScalar(s);
    // the Den keeps NATURAL colours — out of the volcanic cache, into a shared
    // den palette that still merges (see denTint)
    // `leafsGreen`, not `foliage`. The Den has tinted a material called
    // `foliage` since it was written and tree-a/tree-b do not have one — their
    // leaves are `leafsGreen` and their trunks `woodBark`/`woodInner`. So the
    // canopies were never tinted at all and had been rendering in the model's
    // own turquoise the whole time, which is why the Den's trees read as
    // crystals. Nothing in js/ sets that colour; it was simply never reached.
    denTint(m, {
      grass: 0x4e9a4a, dirt: 0x8a6a48, foliage: 0x4e9a4a,
      leafsGreen: 0x4f9440, woodBark: 0x6a4c30, woodInner: 0x8a6a44,
    });
    world.add(m);
    world.addCircle(x, z, 0.6);
  }
  // FLOWERS, INSTANCED. Eighteen individually-placed flowers were eighteen
  // objects the batcher could not touch (each needed its own material to escape
  // the volcanic tint cache). One InstancedMesh per kind is one draw call for
  // all of them, however many there are.
  const flowerSpots = [
    [-2.6, -2.2], [2.4, 2.6], [4.8, -1.6], [-5.0, 1.8], [6.4, 5.2],
    // A KITCHEN GARDEN, in rows. Rows are the tell: scattered flowers are
    // scenery, but a line of them is somebody's work.
    [-9.4, 2.6], [-8.6, 2.6], [-7.8, 2.6], [-9.4, 3.4], [-8.6, 3.4], [-7.8, 3.4],
    [-2.0, 6.8], [-0.6, 7.2], [1.0, 6.6], [8.2, 1.2], [-6.0, -6.4], [4.0, -6.8],
  ];
  for (const [gltf, pick] of [[flowerA, 0], [flowerB, 1]]) {
    const pts = flowerSpots.filter((_, i) => i % 2 === pick)
      .map(([x, z]) => ({ x, z, ry: (x + z) * 0.9, sx: 1.3, sy: 1.3, sz: 1.3 }));
    if (pts.length) world.add(instancePlacements(gltf.scene, pts, { castShadow: false }));
  }

  // The shopkeeper: a friendly mage by her cart
  const cart = prepareModel(cartGltf.scene.clone());
  cart.position.set(7.2, 0, -4.6);
  cart.rotation.y = -0.5;
  cart.scale.setScalar(1.1);
  world.add(cart);
  world.addCircle(7.2, -4.6, 0.7);
  const mage = prepareCharacter(SkeletonUtils.clone(mageGltf.scene));
  mage.scale.setScalar(0.5);
  mage.position.set(5.9, 0, -3.7);
  mage.rotation.y = 2.6;
  world.add(mage);
  const mixer = new THREE.AnimationMixer(mage);
  const idle = generalAnims.animations.find((c) => c.name === 'Idle_A');
  if (idle) mixer.clipAction(idle).play();
  world.onAnimate((t, dt) => mixer.update(dt));
  world.markers.shopSpot = { x: 5.9, z: -3.7 };

  // DEN ARRIVAL: Petra's stone-heart hums beside the moonstone once
  // Stoneroot is healed — the second spirit home.
  if (WS.get('stone', 'restored')) {
    const base = prepareModel(kit.rockSB.scene.clone());
    base.position.set(-3.4, 0, -4.8);
    base.scale.setScalar(1.2);
    world.add(base);
    world.addCircle(-3.4, -4.8, 0.4);
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.18, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd8b06a, emissiveIntensity: 2.8, roughness: 1 })
    );
    heart.position.set(-3.4, 0.85, -4.8);
    world.add(heart);
    world.keepLoose(heart);     // it bobs and turns (onAnimate below)
    const hGlow = new THREE.PointLight(0xd8b06a, 4, 7, 1.9);
    hGlow.position.set(-3.4, 1.0, -4.8);
    world.add(hGlow);
    world.onAnimate((t) => {
      heart.position.y = 0.85 + Math.sin(t * 1.4 + 2.1) * 0.06;
      heart.rotation.y = t * 0.6;
      hGlow.intensity = 3.6 + Math.sin(t * 2.0 + 1.0) * 0.5;
    });
    world.markers.petraHome = { x: -3.4, z: -4.8 };
  }

  // DEN ARRIVAL (WORLD-DESIGN §3): Cinder's ember settles by the campfire
  // once Ember Hollow is healed — the first of seven spirits to come home.
  if (WS.get('ember', 'restored')) {
    const homeEmber = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb25a, emissiveIntensity: 3.0, roughness: 1 })
    );
    homeEmber.position.set(2.2, 0.9, -2.4);
    world.add(homeEmber);
    world.keepLoose(homeEmber); // it floats (onAnimate below)
    const homeGlow = new THREE.PointLight(0xffc27a, 5, 8, 1.9);
    homeGlow.position.set(2.2, 1.1, -2.4);
    world.add(homeGlow);
    world.onAnimate((t) => {
      homeEmber.position.y = 0.9 + Math.sin(t * 1.6 + 0.8) * 0.07;
      homeGlow.intensity = 4.4 + Math.sin(t * 2.3) * 0.7;
    });
    world.markers.cinderHome = { x: 2.2, z: -2.4 };
  }

  // Luna's moonstone — the fast-travel waystone. Glows once there is
  // somewhere to travel (a second region freed).
  {
    const base = prepareModel(kit.rockSA.scene.clone());
    base.position.set(-5.4, 0, -7.0);
    base.scale.setScalar(1.6);
    denTint(base, { grass: 0x8d93a8, dirt: 0x8d93a8, colormap: 0x8d93a8 });
    world.add(base);
    world.addCircle(-5.4, -7.0, 0.45);
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xa8bcff, emissiveIntensity: 2.2, roughness: 1,
      })
    );
    orb.position.set(-5.4, 1.0, -7.0);
    world.add(orb);
    world.keepLoose(orb);       // it bobs and turns (onAnimate below)
    const moonGlow = new THREE.PointLight(0xa8bcff, 4, 7, 1.9);
    moonGlow.position.set(-5.4, 1.3, -7.0);
    world.add(moonGlow);
    world.onAnimate((t) => {
      orb.position.y = 1.0 + Math.sin(t * 1.8) * 0.08;
      orb.rotation.y = t * 0.9;
      moonGlow.intensity = 3.4 + Math.sin(t * 2.7) * 0.9;
    });
    world.markers.travelSpot = { x: -5.4, z: -7.0 };
  }

  // training barrels (no loot — just for practicing swings)
  world.markers.breakables = [
    { x: 5.6, z: 1.2, kind: 'barrel', shards: 0 },
    { x: 6.9, z: 1.8, kind: 'barrel', shards: 0 },
    { x: 6.2, z: 0.0, kind: 'crate', shards: 0 },
  ];

  // Terranigma rule, home edition: the Den grows as regions are freed.
  // Stoneroot freed → the caverns' glowing mushrooms take root in the glade
  // and a third tent stands for new friends.
  await mushroomPatches(world, [[-9.8, 6.6], [9.0, 6.8, 1.3], [-2.6, -5.4]]);
  if (state.flags.wardenDefeated) {
    const t3 = prepareModel(tentGltf.scene.clone());
    t3.position.set(-6.8, 0, 4.4);
    t3.rotation.y = -2.4;
    t3.scale.setScalar(1.4);
    denTint(t3, { grass: 0x4e9a4a, dirt: 0x8a6a48, leafsGreen: 0x4f9440,
      woodBark: 0x6a4c30, woodInner: 0x8a6a44 });
    world.add(t3);
    world.addCircle(-6.8, 4.4, 0.6);
  }

  // --- WHAT MAKES IT LOOK LIVED IN ----------------------------------------
  //
  // Tents and trees say a camp EXISTS. These say somebody is still doing things
  // in it: seats round the fire that face the fire, wood cut and stacked ready,
  // stores carried in and not yet unpacked, light hung where people walk after
  // dark, and a flag somebody chose to fly. Small things, all of them, and no
  // colliders on the small ones so a five-year-old running at the screen never
  // snags on the furniture.
  // THE SMALL REPEATED THINGS ARE INSTANCED, one draw call per kind however
  // many there are. Placed one at a time they were the single biggest cost in
  // the room: forty-odd objects, each needing its own tinted material to escape
  // the volcanic cache, none of which the batcher could bucket. The Den already
  // carries more characters than any other room and skinned meshes never merge,
  // so its furniture has to be cheap.
  const instAt = (gltf, pts, tints, castShadow = false) => {
    if (!pts.length) return;
    world.add(instancePlacements(gltf.scene, pts.map(([x, z, sc, ry]) => ({
      x, z, ry: ry !== undefined ? ry : (x + z) * 0.7,
      sx: sc, sy: sc, sz: sc,
    })), { castShadow, materialTints: tints }));
    for (const [x, z, sc] of pts) if (sc >= 0.8) world.addCircle(x, z, 0.42 * sc);
  };

  // SEATS ROUND THE FIRE, facing it. Four stumps at the points of the compass
  // is the clearest possible statement that people sit here together.
  instAt(kit.stump, [
    [-2.3, 0.2, 0.85], [2.3, 0.2, 0.85], [-1.7, -3.0, 0.85], [1.9, -3.2, 0.85],
    [2.6, -6.5, 1.0],                                   // and the one by the woodpile
  ], { grass: 0x6a5238, dirt: 0x6a5238, colormap: 0x6a5238 });

  // wood cut and stacked, ready for tonight
  instAt(kit.logStack, [[3.4, -5.6, 1.15, 0.5], [4.1, -6.3, 1.0, -0.9]],
    { grass: 0x7a5c3a, dirt: 0x7a5c3a, colormap: 0x7a5c3a }, true);

  // stores carried in and not yet unpacked
  instAt(crateGltf, [[9.4, -6.4, 1.0], [8.8, -5.7, 1.0], [-10.2, -3.2, 1.0]],
    { Wood: 0x8a6a44, DarkWood: 0x6a4e30 });
  instAt(barrelGltf, [[10.1, -5.6, 1.0], [-10.4, -2.2, 1.0]],
    { Wood: 0x8a6a44, DarkWood: 0x6a4e30 });

  // light somebody hung up, along the way people actually walk after dark
  instAt(torchGltf, [[-1.9, 6.6, 1.15, 0], [1.9, 6.6, 1.15, 0], [-4.6, -1.2, 1.15, 0],
    [4.8, -1.4, 1.15, 0], [0.6, -6.4, 1.15, 0]], null);

  // bushes softening the wall line, so the glade has an edge rather than a box
  instAt(kit.bush, [[-11.2, 0.6, 1.4], [11.3, -1.4, 1.3], [-7.2, 8.2, 1.4],
    [11.2, 6.2, 1.3], [-11.4, -8.0, 1.3]],
    { grass: 0x4e8a42, foliage: 0x4e8a42, leafsGreen: 0x4e8a42, dirt: 0x5a4632 });
  instAt(kit.rockSA, [[-9.8, -7.4, 1.2], [9.6, 1.8, 1.1], [6.0, -8.0, 1.0]],
    { grass: 0x7d8272, dirt: 0x6a6f60, colormap: 0x7d8272 });

  // A FLAG OVER THE GATE was the obvious idea and it did not work: Banner_wall
  // is modelled to hang on a vertical wall face, and laid at the gate mouth it
  // rendered as a pale slab on the ground right where a child walks in. The two
  // torches already flanking the gate say "this is the way home" perfectly well,
  // and a prop that reads as a mistake is worse than no prop.

  // rescued pups live here, playing in the grass
  const wolfGltf = await loadGLB('./assets/chars/wolf.gltf');
  const rescued = Object.keys(state.flags.pups);
  rescued.forEach((id, i) => {
    const pup = prepareCharacter(SkeletonUtils.clone(wolfGltf.scene));
    pup.scale.setScalar(0.16);
    world.add(pup);
    const pupMixer = new THREE.AnimationMixer(pup);
    const clip = wolfGltf.animations.find((c) => c.name === (i % 2 ? 'Gallop' : 'Idle'));
    if (clip) pupMixer.clipAction(clip).play();
    const cx = -3.4 + (i % 3) * 3.0, cz = 3.0 + Math.floor(i / 3) * 2.2, r = 1.1 + (i % 3) * 0.3;
    world.onAnimate((t, dt) => {
      pupMixer.update(dt);
      const a = t * (0.5 + i * 0.2) + i * 2;
      pup.position.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
      pup.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2;
    });
  });

  // DEN LIFE: villagers + the den dog (real faces — js/npcs.js). The
  // roster grows with the healed regions.
  await spawnDenNpcs(world);

  // DEN GAMES: each villager hosts a minigame (gold act-here rings —
  // js/minigames.js). Rook's targets appear with Rook himself.
  await setupDenGames(world);

  // B3 — BATCH THE DEN. It was the last room in the game over the 100 draw-call
  // ceiling (113 worst-case, standing at (-5, 8)), and after B1 characters were
  // no longer why: its own static geometry cast 18 calls of shadow. The cause
  // was simply that the hand-built shipping rooms never called this, while all
  // three rebuilt levels do from their finish().
  //
  // Safe here because everything that MOVES is already excluded: skinned meshes
  // are skipped outright (the villagers, Biscuit, the shopkeeper, the pup), the
  // checkpoint flame is a protected gameplay list, `world.npcs` is in the
  // protected keys, and the three animated props — Petra's heart, Cinder's
  // ember and the moonstone orb — are marked keepLoose where they are built.
  // A HUB CARRIES MORE CHARACTERS THAN ANY OTHER ROOM — the shopkeeper, three
  // villagers, Biscuit, and every pup the kids have rescued. Skinned meshes
  // never merge and every one of them casts a shadow, so the Den pays a cost no
  // other room does, and it pays it for exactly the thing that makes it home.
  //
  // So the STATIC furniture gives up its shadows instead. 2.4 culls the crates,
  // stumps, torches and bushes while leaving the tents, trees and cart — the
  // things whose shadows actually tell you they are solid.
  flattenStatic(world, { shadowCullBelow: 2.4 });

  // soft daylight mood handled by main (den has no lava rumble)
  return world;
}

// ---------------------------------------------------------------------------
// Room 2 — Ember Causeway (teaches: dodging, telegraphs; optional branch)
// ---------------------------------------------------------------------------

async function buildR2(scene) {
  const world = new World(scene);
  buildShell(world, 20, 12, [
    { side: 'w', from: 3.2, to: 5.6 },   // back to R1
    { side: 'n', from: 7.3, to: 9.7 },   // boss door to R3 (sealed until the key)
    { side: 'e', from: 2.2, to: 4.6 },   // east: the Cinder Bridges
  ]);
  world.spawn = { x: -8, z: 4.4, angle: 0 };

  world.addDoor(-10.15, -9.1, 3.2, 5.6, 'r1', { x: 5.6, z: -4.9, angle: Math.PI });
  world.addDoor(7.3, 9.7, -6.9, -5.85, 'k1', { x: 0, z: 4.6, angle: Math.PI });
  world.addDoor(9.9, 10.9, 2.2, 4.6, 'r2b', { x: -5.9, z: 0, angle: Math.PI / 2 });

  // Restoration dressing along the south bank once the region is healed
  if (WS.get('ember', 'restored')) {
    healedSprouts(world, [[-7.0, 5.2], [-3.5, 5.4], [1.0, 5.2], [5.0, 5.3]]);
    world.markers.healed = true;
  }

  // The boss door is sealed by shadow until the Ember Key is found in the
  // Cinder Bridges — the region now has a real dungeon loop, not a straight
  // line. The plug lifts live the moment the key chest opens.
  if (!state.flags.keys.ember && !state.flags.bossDefeated) {
    const plug = new THREE.Group();
    for (const p of [
      { kind: kit.rockLB, x: 7.9, z: -6.2, s: 2.0, ry: 0.7 },
      { kind: kit.rockLA, x: 9.0, z: -6.4, s: 1.9, ry: 2.3 },
      { kind: kit.rockSB, x: 8.5, z: -5.8, s: 1.5, ry: 4.1 },
    ]) {
      const rock = prepareModel(p.kind.scene.clone());
      rock.position.set(p.x, 0, p.z);
      rock.rotation.y = p.ry;
      rock.scale.setScalar(p.s);
      rock.traverse((n) => {
        if (!n.isMesh) return;
        n.material = n.material.clone();
        n.material.color.lerp(new THREE.Color(0x1a1226), 0.55); // shadow-dark
      });
      plug.add(rock);
    }
    // a gold keyhole glow marks it as a LOCK, not a wall
    const hole = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.3, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    hole.position.set(8.5, 1.1, -5.6);
    plug.add(hole);
    world.add(plug);
    world.onAnimate((t) => { hole.material.opacity = 0.6 + 0.3 * Math.sin(t * 3); });
    const plugCollider = { minX: 7.1, maxX: 9.9, minZ: -7.0, maxZ: -5.6 };
    world.boxColliders.push(plugCollider);
    world.openBossDoor = () => {
      world.root.remove(plug);
      const i = world.boxColliders.indexOf(plugCollider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      audio.play('checkpoint', { volume: 0.9, rate: 1.2 });
      world.openBossDoor = null;
    };
  }

  // Lava channel across the room, crossed by a stone bridge at x = 0
  lavaPool(world, -5.6, -2, 8.8, 2, { coolable: true });
  lavaPool(world, 5.6, -2, 8.8, 2, { coolable: true });
  const bridge = prepareModel(kit.bridge.scene.clone());
  bridge.position.set(0, 0.02, -2);
  bridge.rotation.y = Math.PI / 2;
  bridge.scale.set(1.6, 1.1, 2.4);
  world.add(bridge);
  world.addSafe(-1.3, 1.3, -3.2, -0.8); // the deck is solid ground, never lava

  // Bridge rails: keep kids from clipping the pool edges diagonally
  world.addBox(-1.7, -1.1, -3.1, -0.9);
  world.addBox(1.1, 1.7, -3.1, -0.9);

  // Geyser crossing on the north band (pure-skill gate, no enemy)
  geyser(world, 2.6, -4.5, 0.0);
  geyser(world, 4.6, -3.9, 1.15);
  geyser(world, 6.5, -4.7, 2.3);

  // Checkpoint CP2 just before the boss door, potion by the stump
  checkpoint(world, 'cp2', 8.6, -3.6);
  potionPickup(world, -4.2, 3.2);

  // The optional branch (SE): rock-flanked pocket, Shadow Hound + Pup #2 later
  placeRocks(world, [
    { kind: 'la', x: 3.6, z: 2.6, s: 2.4, ry: 0.4, cr: 1.05 },
    { kind: 'lc', x: 8.9, z: 1.8, s: 2.2, ry: 4.2, cr: 0.95 },
    { kind: 'sb', x: 5.4, z: 2.2, s: 1.5, ry: 3.3, cr: 0.32 },
  ]);
  world.markers.pup2Spot = { x: 7.2, z: 3.0 };
  world.markers.houndSpot = { x: 6.0, z: 1.9 }; // out of the camera's blind strip
  world.markers.branchMouth = { x: 4.6, z: 3.2 };

  // "NOT YET" GATE (Earth Wolf): one huge gold-veined boulder plugs a pocket
  // where a heart-piece chest glitters — smash it on a return trip.
  boulderGate(world, prepareModel, kit.rockLB, 'em_boulder', -8.2, 1.6);
  world.markers.boulderGateSpot = { x: -8.2, z: 1.6 };
  world.markers.chestDefs = [
    { id: 'c_r2_boulder', tier: 'gold', x: -9.2, z: 1.6, ry: 1.5, loot: { shards: 25, heartPiece: 2 } },
  ];
  kilnLandmark(world);

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

  // Ember Moths near the lava channel; Shades DEEPER in the room and apart
  // (playtest: the old pair camped the doorway — walking in felt like an
  // ambush; now each is met on Kael's terms, one pattern at a time)
  world.markers.mothSpots = [{ x: -4.5, z: -3.4 }, { x: -1.8, z: -0.6 }];
  world.markers.shadeSpots = [{ x: -3.6, z: 1.0 }, { x: -0.8, z: 3.6 }];

  // The optional branch should look tempting-but-scary: shadowed ground and
  // a faint red glow around the hound's pocket (the pup is visible beyond).
  const branchShadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.5, 26),
    new THREE.MeshBasicMaterial({ color: 0x140b20, transparent: true, opacity: 0.34, depthWrite: false })
  );
  branchShadow.rotation.x = -Math.PI / 2;
  branchShadow.position.set(6.1, 0.025, 3.7);
  world.add(branchShadow);
  const branchGlow = new THREE.PointLight(0xff3626, 2.6, 6.5, 1.9);
  branchGlow.position.set(6.0, 0.9, 3.7);
  world.add(branchGlow);
  const embers = [];
  for (let i = 0; i < 3; i++) {
    const fleck = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff4a2a, emissiveIntensity: 2.2 })
    );
    world.add(fleck);
    embers.push(fleck);
  }
  world.onAnimate((t) => {
    branchGlow.intensity = 2.2 + Math.sin(t * 1.7) * 0.7;
    embers.forEach((f, i) => {
      const a = t * 0.8 + i * 2.1;
      f.position.set(6.1 + Math.cos(a) * 1.6, 0.5 + Math.sin(t * 2 + i) * 0.25, 3.7 + Math.sin(a) * 1.6);
    });
  });

  // A reward tucked past the geyser crossing pays off the timing skill
  potionPickup(world, 9.2, -5.1);

  // Way-finding: doorways + the dirt path (bridges carry it over lava)
  doorway(world, -9.4, 4.4, 'z');
  doorway(world, 8.5, -5.7, 'x');
  doorway(world, 9.4, 3.4, 'z');
  pathTiles(world, [[-8, 4.4], [-4.5, 2], [-0.5, 0.2], [-0.5, -3.6], [2.4, -4.4], [6.5, -4.4], [8.4, -5.2]]);

  return world;
}

// ---------------------------------------------------------------------------
// Room 2b — Cinder Bridges (the key branch: broken crossings, moth nests,
// and a hound guarding the Ember Key)
// ---------------------------------------------------------------------------

async function buildR2b(scene) {
  const world = new World(scene);
  buildShell(world, 14, 10, [
    { side: 'w', from: -1.2, to: 1.2 }, // back to the Causeway
  ]);
  world.spawn = { x: -5.9, z: 0, angle: Math.PI / 2 };
  world.addDoor(-8.05, -7.0, -1.2, 1.2, 'r2', { x: 8.9, z: 3.4, angle: -Math.PI / 2 });

  // two lava channels, crossed by narrow bridges offset from each other —
  // the walk is a zigzag under moth fire. Coolable (v3.18.1 playtest):
  // when the boss falls, EVERY Ember pool sleeps as black stone — not
  // just room 1's.
  lavaPool(world, -2.2, 0, 1.6, 9.6, { coolable: true });
  lavaPool(world, 2.4, 0, 1.6, 9.6, { light: false, coolable: true });
  const b1 = prepareModel(kit.bridge.scene.clone());
  b1.position.set(-2.2, 0.02, -2.6);
  b1.scale.set(1.3, 1.1, 1.6);
  world.add(b1);
  world.addSafe(-3.4, -1.2, -3.4, -1.7); // b1 deck: crossing lane between rails
  const b2 = prepareModel(kit.bridge.scene.clone());
  b2.position.set(2.4, 0.02, 2.6);
  b2.scale.set(1.3, 1.1, 1.6);
  world.add(b2);
  world.addSafe(1.2, 3.4, 1.7, 3.4);     // b2 deck: crossing lane between rails
  // rails so the zigzag can't be corner-cut into lava
  world.addBox(-3.2, -1.2, -3.6, -3.2); world.addBox(-3.2, -1.2, -1.9, -1.5);
  world.addBox(1.4, 3.4, 1.5, 1.9); world.addBox(1.4, 3.4, 3.3, 3.7);

  geyser(world, 0.1, -3.6, 0.6);
  geyser(world, 0.1, 3.4, 1.8);
  world.markers.mothSpots = [{ x: -0.1, z: -1.2 }, { x: 0.2, z: 1.6 }];

  // east side: the hound's watch — pillars ring the key chest
  for (const [px, pz] of [[4.6, -2.2], [6.3, 1.9]]) {
    const pillar = prepareModel(kit.pillar.scene.clone());
    pillar.position.set(px, 0, pz);
    pillar.scale.setScalar(0.55);
    world.add(pillar);
    world.addCircle(px, pz, 0.5);
  }
  world.markers.houndSpot = { x: 5.2, z: 0.2, variant: 'elder' }; // the pack leader

  // "NOT YET" GATE (Tide Wolf, region 6): rushing fire-water seals a wall
  // pocket; the golden chest inside glitters in plain sight.
  waterGate(world, 5.6, -3.2, 2.8, 0.9);
  placeRocks(world, [{ kind: 'sb', x: 3.85, z: -3.9, s: 1.6, ry: 0.8, cr: 0.6 }]);
  world.markers.waterGateSpot = { x: 5.6, z: -3.2 };
  world.markers.chestDefs = [
    { id: 'c_r2b_key', tier: 'gold', x: 6.1, z: -0.4, ry: -1.3,
      loot: { shards: 12, key: 'ember', keyName: 'Ember Key' } },
    { id: 'c_r2b_water', tier: 'gold', x: 5.6, z: -4.3, ry: 2.0, loot: { shards: 30, heartPiece: 2 } },
  ];
  world.markers.breakables = [
    { x: -5.6, z: 3.6, kind: 'crate', shards: 2 },
    { x: -5.9, z: -3.4, kind: 'barrel', shards: 2 },
  ];
  potionPickup(world, 5.4, 2.4);

  placeRocks(world, [
    { kind: 'sa', x: -4.6, z: -2.0, s: 1.5, ry: 1.1, cr: 0.32 },
    { kind: 'sb', x: 4.4, z: 4.0, s: 1.4, ry: 2.7, cr: 0.3 },
  ]);
  doorway(world, -7.5, 0, 'z');
  pathTiles(world, [[-5.9, 0], [-2.2, -2.6], [0.1, -0.2], [2.4, 2.6], [4.6, 0.6]]);
  return world;
}

// ---------------------------------------------------------------------------
// THE KILN — the volcano dungeon (Zelda hub-and-spoke). Hub K1 has three
// doors: A open (yields the FIRE WOLF at a shrine, then teach→test→combine
// braziers), B brazier-locked (yields the Kiln Key), C key-locked (boss).
// ---------------------------------------------------------------------------

async function buildK1(scene) {
  const world = new World(scene);
  world.lightScale = 0.7;
  world.bgColor = 0x160e14;
  buildShell(world, 16, 12, [
    { side: 's', from: -1.2, to: 1.2 },   // entrance from the Causeway
    { side: 'n', from: -6.2, to: -3.8 },  // door A — open
    { side: 'n', from: -1.2, to: 1.2 },   // door B — brazier-locked
    { side: 'n', from: 3.8, to: 6.2 },    // door C — Kiln Key → boss
  ]);
  world.spawn = { x: 0, z: 4.6, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 5.85, 6.9, 'r2', { x: 8.5, z: -4.9, angle: Math.PI });
  world.addDoor(-6.2, -3.8, -6.9, -5.85, 'ka', { x: 0, z: 3.6, angle: Math.PI });
  world.addDoor(-1.2, 1.2, -6.9, -5.85, 'kb', { x: 0, z: 3.6, angle: Math.PI },
    () => WS.get('ember', 'kiln_doorB'));
  world.addDoor(3.8, 6.2, -6.9, -5.85, 'r3', { x: 0, z: 6.2, angle: Math.PI },
    () => !!state.flags.keys.kiln);

  // door B: plugged until BOTH flanking braziers burn (Fire Wolf from door A)
  if (!WS.get('ember', 'kiln_doorB')) {
    const plugB = new THREE.Group();
    for (const p of [{ x: -0.7, s: 1.7 }, { x: 0.6, s: 1.9 }]) {
      const rock = prepareModel(kit.rockSB.scene.clone());
      rock.position.set(p.x, 0, -6.2);
      rock.scale.setScalar(p.s);
      plugB.add(rock);
    }
    world.add(plugB);
    const colB = { minX: -1.4, maxX: 1.4, minZ: -6.9, maxZ: -5.6 };
    world.boxColliders.push(colB);
    let litCount = 0;
    const onFlank = () => {
      litCount++;
      if (litCount >= 2) {
        WS.set('ember', 'kiln_doorB');
        world.root.remove(plugB);
        const i = world.boxColliders.indexOf(colB);
        if (i >= 0) world.boxColliders.splice(i, 1);
        audio.play('checkpoint', { volume: 0.9, rate: 1.25 });
      }
    };
    brazier(world, prepareModel, dkit.torch, 'k1_bl', -2.2, -5.0, onFlank);
    brazier(world, prepareModel, dkit.torch, 'k1_br', 2.2, -5.0, onFlank);
  }
  // door C: sealed with the gold keyhole until the Kiln Key
  if (!state.flags.keys.kiln) {
    const plugC = new THREE.Group();
    for (const p of [{ x: 4.2, s: 1.8 }, { x: 5.6, s: 2.0 }]) {
      const rock = prepareModel(kit.rockLA.scene.clone());
      rock.position.set(p.x, 0, -6.2);
      rock.scale.setScalar(p.s);
      rock.traverse((n) => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.lerp(new THREE.Color(0x1a1226), 0.5); } });
      plugC.add(rock);
    }
    const hole = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.3, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    hole.position.set(5, 1.2, -5.6);
    plugC.add(hole);
    world.add(plugC);
    const colC = { minX: 3.6, maxX: 6.4, minZ: -6.9, maxZ: -5.6 };
    world.boxColliders.push(colC);
    world.onAnimate((t) => { hole.material.opacity = 0.6 + 0.3 * Math.sin(t * 3); });
    world.openBossDoor = () => {
      world.root.remove(plugC);
      const i = world.boxColliders.indexOf(colC);
      if (i >= 0) world.boxColliders.splice(i, 1);
      audio.play('checkpoint', { volume: 0.9, rate: 1.2 });
      world.openBossDoor = null;
    };
  }

  // hub dressing: lava veins, columns, a resting fire before the boss wing
  lavaPool(world, -6.6, 1.8, 1.6, 5.2, { light: true, coolable: true });
  lavaPool(world, 6.6, 1.8, 1.6, 5.2, { light: false, coolable: true });
  checkpoint(world, 'cp_k1', 0, 0.4);
  potionPickup(world, 1.6, 0.8);
  for (const [px, pz] of [[-3.2, -3.6], [3.2, -3.6]]) {
    const col = prepareModel(dkit.column2.scene.clone());
    col.position.set(px, 0, pz);
    col.scale.setScalar(0.5);
    world.add(col);
    world.addCircle(px, pz, 0.4);
  }
  // one of the Kiln's shades is BAKED — a Cinder Shade that shrugs off fire
  world.markers.shadeSpots = [{ x: -3.4, z: 2.4, variant: 'cinder' }];
  doorway(world, 0, 5.6, 'x');
  return world;
}

// Spoke A — the Ember Shrine: clear the bones of the hollow, receive the
// FIRE WOLF, then use it three ways (trivial / timed twist / in combat).
async function buildKa(scene) {
  const world = new World(scene);
  world.lightScale = 0.62;
  world.bgColor = 0x160e14;
  buildShell(world, 18, 10, [
    { side: 's', from: -1.2, to: 1.2 }, // back to the hub
  ]);
  world.spawn = { x: 0, z: 3.6, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 4.85, 5.9, 'k1', { x: -5, z: -4.9, angle: 0 });

  // STAGE 1 (west third): the guard pack — clear it to open the shrine bars
  blockRow(world, -3.2, -4.9, -3.2, -1.2, 1.5);
  blockRow(world, -3.2, 0.8, -3.2, 4.9, 1.5);
  world.markers.shadeSpots = [{ x: -6.2, z: -1.8, variant: 'cinder' }, { x: -5.4, z: 2.2 }];
  world.markers.mothSpots = [{ x: -6.8, z: 0.6 }];
  const bars1 = prepareModel(dkit.bars.scene.clone());
  bars1.position.set(-3.2, 0, -0.2);
  bars1.rotation.y = Math.PI / 2;
  bars1.scale.set(0.85, 0.62, 1);
  world.add(bars1);
  const col1 = { minX: -3.7, maxX: -2.7, minZ: -1.4, maxZ: 1.0 };
  world.boxColliders.push(col1);
  let stage1Done = false;
  world.onAnimate(() => {
    if (stage1Done || !world.enemies) return;
    const alive = world.enemies.some((e) => !e.dead && e.constructor.name !== 'Breakable' && e.x < -3.2);
    if (!alive) {
      stage1Done = true;
      world.root.remove(bars1);
      const i = world.boxColliders.indexOf(col1);
      if (i >= 0) world.boxColliders.splice(i, 1);
      audio.play('checkpoint', { volume: 0.8, rate: 1.3 });
    }
  });

  // STAGE 2 (center): the fire shrine — Cinder's spark reaches out here.
  // main.js grants the FIRE WOLF on approach (see narrationTriggers).
  const ped = prepareModel(dkit.pedestal.scene.clone());
  ped.position.set(0, 0, -2.6);
  ped.scale.setScalar(0.6);
  world.add(ped);
  world.addCircle(0, -2.6, 0.65);
  const shrineFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff8a3a, emissiveIntensity: 2.6, roughness: 1 })
  );
  shrineFlame.position.set(0, 1.8, -2.6);
  world.add(shrineFlame);
  const shrineGlow = new THREE.PointLight(0xff8a3a, 7, 10, 1.8);
  shrineGlow.position.set(0, 2, -2.6);
  world.add(shrineGlow);
  world.onAnimate((t) => {
    shrineFlame.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
    shrineGlow.intensity = 6 + Math.sin(t * 3.4) * 1.6;
  });
  world.markers.shrineSpot = { x: 0, z: -2.6 };

  // STAGE 3 (east third, behind bars): teach → test → combine
  blockRow(world, 3.2, -4.9, 3.2, -1.2, 1.5);
  blockRow(world, 3.2, 0.8, 3.2, 4.9, 1.5);
  const bars2 = prepareModel(dkit.bars.scene.clone());
  bars2.position.set(3.2, 0, -0.2);
  bars2.rotation.y = Math.PI / 2;
  bars2.scale.set(0.85, 0.62, 1);
  world.add(bars2);
  const col2 = { minX: 2.7, maxX: 3.7, minZ: -1.4, maxZ: 1.0 };
  world.boxColliders.push(col2);
  // TEACH: one cold brazier by the shrine opens the east bars — trivial
  brazier(world, prepareModel, dkit.torch, 'ka_teach', 1.8, -2.6, () => {
    world.root.remove(bars2);
    const i = world.boxColliders.indexOf(col2);
    if (i >= 0) world.boxColliders.splice(i, 1);
    audio.play('checkpoint', { volume: 0.8, rate: 1.3 });
  });
  // TEST (twist): two guttering braziers — both must burn at once
  const t1 = brazier(world, prepareModel, dkit.torch, 'ka_t1', 5.0, -3.4, () => checkPair());
  const t2 = brazier(world, prepareModel, dkit.torch, 'ka_t2', 7.4, -1.6, () => checkPair());
  t1.gutterAfter = 6; t2.gutterAfter = 6;
  let pairDone = false;
  const drop = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 0.0, transparent: true, opacity: 0.4, roughness: 1, depthWrite: false })
  );
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(7.4, 0.04, 3.9);
  world.add(drop);
  function checkPair() {
    if (pairDone || !t1.lit || !t2.lit) return;
    pairDone = true;
    t1.gutterAfter = 0; t2.gutterAfter = 0; // they hold their flame now
    drop.material.emissiveIntensity = 0.8;
    audio.play('checkpoint', { volume: 0.9, rate: 1.4 });
  }
  // COMBINE: shades haunt the last brazier — slam does both jobs at once
  world.markers.shadeSpots.push({ x: 6.4, z: 2.2 }, { x: 7.8, z: 1.0 });
  // (z 1.6, not 2.8 — a brazier the kid has to LIGHT may never sit in the
  // strip of floor the camera cannot see over the south wall)
  brazier(world, prepareModel, dkit.torch, 'ka_combat', 7.0, 1.6, () => {
    WS.set('ember', 'kiln_A_done');
  });
  // one-way glowing drop back to the hub once the pair puzzle is done
  world.addDoor(6.5, 8.3, 3.4, 4.4, 'k1', { x: 0, z: 4.2, angle: Math.PI }, () => pairDone);

  world.markers.breakables = [
    { x: -7.6, z: 3.9, kind: 'crate', shards: 3 },
    { x: 7.9, z: -4.2, kind: 'vase', shards: 3 },
  ];
  doorway(world, 0, 4.6, 'x');
  return world;
}

// Spoke B — the Order of Flame: light the numbered braziers 1→2→3.
// Wrong order snuffs them all (anti-soft-lock reset). Reward: the Kiln Key
// + a shortcut back to the Causeway, opened from the far side.
async function buildKb(scene) {
  const world = new World(scene);
  world.lightScale = 0.6;
  world.bgColor = 0x160e14;
  buildShell(world, 14, 10, [
    { side: 's', from: -1.2, to: 1.2 },
  ]);
  world.spawn = { x: 0, z: 3.6, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 4.85, 5.9, 'k1', { x: 0, z: -4.9, angle: 0 });

  world.markers.mothSpots = [{ x: -3.4, z: -1.4 }, { x: 3.8, z: 0.8 }];

  // the numbered braziers (pip-count rings show the order)
  const order = [];
  let solved = state.flags.keys.kiln === true; // returning trips skip it
  const defs = [
    { id: 'kb_1', x: -4.4, z: -2.6, n: 1 },
    { id: 'kb_2', x: 0.2, z: -3.6, n: 2 },
    { id: 'kb_3', x: 4.6, z: -2.2, n: 3 },
  ];
  const brs = [];
  for (const d of defs) {
    for (let i = 0; i < d.n; i++) { // pip rings above the bowl = its number
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.16, 14),
        new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.position.set(d.x, 2.2 + i * 0.28, d.z);
      world.add(ring);
    }
    const b = brazier(world, prepareModel, dkit.torch, d.id, d.x, d.z, (br) => {
      if (solved) return;
      order.push(br.id);
      const want = ['kb_1', 'kb_2', 'kb_3'].slice(0, order.length);
      if (order.join() !== want.join()) {
        // wrong order — everything gutters, try again (reset, never stuck)
        order.length = 0;
        for (const o of brs) { o.lit = false; o.flame.visible = false; o.light.intensity = 0; }
        audio.play('parry', { volume: 0.5, rate: 0.5 });
      } else if (order.length === 3) {
        solved = true;
        audio.play('checkpoint', { volume: 1, rate: 1.2 });
      }
    });
    brs.push(b);
  }
  world.markers.orderSpot = { x: 0.2, z: -3.6 };

  // key chest appears solved (spawned gated by chest system on rebuild; on
  // the live solve the chest is already placed but walled by bars)
  const bars = prepareModel(dkit.bars.scene.clone());
  bars.position.set(5.4, 0, 1.4);
  bars.scale.set(0.8, 0.6, 1);
  if (!solved) world.add(bars);
  const colK = { minX: 4.4, maxX: 6.4, minZ: 1.2, maxZ: 1.9 };
  if (!solved) world.boxColliders.push(colK);
  world.onAnimate(() => {
    if (solved && bars.parent) {
      world.root.remove(bars);
      const i = world.boxColliders.indexOf(colK);
      if (i >= 0) world.boxColliders.splice(i, 1);
    }
  });
  world.markers.chestDefs = [
    { id: 'c_kb_key', tier: 'gold', x: 5.4, z: 1.8, ry: -0.6,
      loot: { shards: 10, key: 'kiln', keyName: 'Kiln Key' } },
  ];

  // the clever shortcut: a ledge drop from deep here straight back to the
  // Causeway, only enterable from this side
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 0.7, transparent: true, opacity: 0.45, roughness: 1, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(-5.8, 0.04, 3.9);
  world.add(glow);
  world.addDoor(-6.6, -5.0, 3.4, 4.4, 'r2', { x: 8.5, z: -4.2, angle: Math.PI });

  world.markers.breakables = [{ x: -5.8, z: -3.8, kind: 'barrel', shards: 3 }];
  doorway(world, 0, 4.6, 'x');
  return world;
}

// ---------------------------------------------------------------------------
// Room 3 — Heart of the Hollow (boss arena)
// ---------------------------------------------------------------------------

async function buildR3(scene) {
  const world = new World(scene);
  buildShell(world, 16, 16, [
    { side: 's', from: -1.3, to: 1.3 },  // entry from R2
    { side: 'w', from: -0.6, to: 1.8 },  // shortcut to R1 (plugged until boss)
  ]);
  world.spawn = { x: 0, z: 6.2, angle: Math.PI };

  world.addDoor(-1.3, 1.3, 7.85, 8.9, 'k1', { x: 5, z: -4.6, angle: Math.PI });
  world.addDoor(-8.9, -7.85, -0.6, 1.8, 'r1', { x: -7.2, z: -2, angle: Math.PI / 2 });
  if (!state.flags.shortcutOpen) {
    // The shortcut is plugged with rocks until the boss falls; beating it
    // removes the plug in the LIVE room (world.openShortcut), so the
    // backtrack loop starts immediately.
    const plug = new THREE.Group();
    for (const p of [
      { kind: kit.rockLA, x: -7.6, z: 0.2, s: 2.1, ry: 1.1 },
      { kind: kit.rockLC, x: -7.5, z: 1.2, s: 1.8, ry: 2.8 },
      { kind: kit.rockSB, x: -6.9, z: 0.7, s: 1.6, ry: 0.4 },
    ]) {
      const rock = prepareModel(p.kind.scene.clone());
      rock.position.set(p.x, 0, p.z);
      rock.rotation.y = p.ry;
      rock.scale.setScalar(p.s);
      plug.add(rock);
    }
    world.add(plug);
    const plugCollider = { minX: -8.9, maxX: -6.4, minZ: -0.8, maxZ: 2.0 };
    world.boxColliders.push(plugCollider);
    world.openShortcut = () => {
      world.root.remove(plug);
      const i = world.boxColliders.indexOf(plugCollider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      doorway(world, -6.4, 0.6, 'z'); // torches light the way home
      world.openShortcut = null;
    };
  }

  // Lava rim inside the walls (the arena boundary "edge") — the entry
  // walkway crosses the south rim on a stone bridge.
  lavaPool(world, 0, -7.35, 15.6, 1.1, { light: true, coolable: true });
  lavaPool(world, -4.45, 7.35, 6.7, 1.1, { light: false, coolable: true });
  lavaPool(world, 4.45, 7.35, 6.7, 1.1, { light: false, coolable: true });
  // west rim leaves a clear walkway where the shortcut opens (z -0.8..2.0)
  lavaPool(world, -7.35, -3.8, 1.1, 6.0, { light: false, coolable: true });
  lavaPool(world, -7.35, 4.4, 1.1, 4.8, { light: false, coolable: true });
  lavaPool(world, 7.35, 0, 1.1, 13.6, { light: true, coolable: true });
  const walkway = prepareModel(kit.bridge.scene.clone());
  walkway.position.set(0, 0.02, 7.35);
  walkway.scale.set(2.4, 1.1, 1.5);
  world.add(walkway);
  world.addSafe(-1.3, 1.3, 6.6, 8.1);    // entry walkway over the south rim

  // Four pillars give cover — the boss's shadow wave breaks against them
  world.markers.pillars = [];
  for (const [px, pz] of [[-4.2, -2.8], [4.2, -2.8], [-4.2, 2.4], [4.2, 2.4]]) {
    const pillar = prepareModel(kit.pillar.scene.clone());
    pillar.position.set(px, 0, pz);
    pillar.scale.setScalar(0.75);
    world.add(pillar);
    world.addCircle(px, pz, 0.68);
    world.markers.pillars.push({ x: px, z: pz, r: 0.68 });
  }

  // Checkpoint CP3 at the arena entrance, with a potion for the fight
  checkpoint(world, 'cp3', -2.2, 5.6);
  potionPickup(world, 2.2, 5.6);

  // Loot: entry barrels; once the boss falls, a golden chest appears
  world.markers.breakables = [
    { x: -5.8, z: 5.6, kind: 'barrel', shards: 2 },
    { x: 5.8, z: 5.9, kind: 'crate', shards: 2 },
  ];
  world.markers.chestDefs = state.flags.bossDefeated
    ? [{ id: 'c_r3_gold', tier: 'gold', x: 3.2, z: -4.6, ry: 2.2, loot: { shards: 20, powerup: 'fury' } }]
    : [];

  // The live restoration's regrowth persists on every rebuild after healing
  if (WS.get('ember', 'restored')) {
    healedSprouts(world, [[-3, 4.4], [3, 4.4], [-5.2, -1], [5.2, -1], [-2.4, -4.2], [2.4, -4.2], [0, 2.6], [5.7, 3.4]]);
    world.markers.healed = true;
  }

  // Way-finding: torch-lit entry + shortcut doorway (once open) + path
  doorway(world, 0, 6.35, 'x');
  if (state.flags.shortcutOpen) doorway(world, -6.4, 0.6, 'z');
  pathTiles(world, [[0, 6.4], [0, 3], [0, 1.4]]);

  // The Shadowgrip (built in code) grips Cinder at the center until beaten;
  // afterwards Cinder floats free, warm and bright.
  if (!state.flags.bossDefeated) {
    world.markers.bossSpot = { x: 0, z: -0.5 };
  } else {
    const ember = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb25a, emissiveIntensity: 3.2, roughness: 1 })
    );
    ember.position.set(0, 1.8, -0.5);
    world.add(ember);
    const glow = new THREE.PointLight(0xffc27a, 10, 13, 1.8);
    glow.position.set(0, 2.0, -0.5);
    world.add(glow);
    world.onAnimate((t) => {
      ember.position.y = 1.8 + Math.sin(t * 1.7) * 0.15;
      glow.intensity = 9 + Math.sin(t * 2.6) * 1.5;
    });
    world.markers.cinder = { ember, glow };

    // The glowing way onward (toward the Luna dream / next region) appears
    // once Ember Hollow is free.
    const portal = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.0, 36),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    portal.rotation.x = -Math.PI / 2;
    portal.position.set(0, 0.05, -5.6);
    world.add(portal);
    const portalLight = new THREE.PointLight(0xffe9a8, 6, 8, 1.9);
    portalLight.position.set(0, 1.2, -5.6);
    world.add(portalLight);
    world.onAnimate((t) => {
      portal.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08);
      portalLight.intensity = 5 + Math.sin(t * 3.1) * 1.4;
    });
    world.markers.exitSpot = { x: 0, z: -5.6 };
    // Once the Part C celebration has played, the ring becomes a real door
    // down into the Stoneroot Caverns.
    world.addDoor(-0.9, 0.9, -6.3, -5.2, 'e1', { x: 0, z: 4.6, angle: Math.PI },
      () => !!state.spoken.region_complete);
  }

  return world;
}

// ---------------------------------------------------------------------------
// Stoneroot Caverns — region 2. Quaternius Modular Dungeon pieces (converted
// to GLB) on the same shell/collider system. Darker rig (world.lightScale),
// torch pools of light, skeletons that wake from bone piles.
// ---------------------------------------------------------------------------

let dkit = null;
async function loadDungeonKit() {
  if (dkit) return dkit;
  const names = {
    floor: './assets/env/dungeon/Floor_Modular.glb',
    wall: './assets/env/dungeon/Wall_Modular.glb',
    wallCover: './assets/env/dungeon/WallCover_Modular.glb',
    arch: './assets/env/dungeon/Arch.glb',
    bars: './assets/env/dungeon/Arch_bars.glb',
    column: './assets/env/dungeon/Column.glb',
    column2: './assets/env/dungeon/Column2.glb',
    torch: './assets/env/dungeon/Torch.glb',
    skull: './assets/env/dungeon/Skull.glb',
    cobweb: './assets/env/dungeon/Cobweb.glb',
    barrel: './assets/env/dungeon/Barrel.glb',
    crate: './assets/env/dungeon/Crate.glb',
    vase: './assets/env/dungeon/Vase.glb',
    pedestal: './assets/env/dungeon/Pedestal.glb',
    statue: './assets/env/dungeon/Statue_Horse.glb',
    trapBase: './assets/env/dungeon/Trap_empty.glb',
    spikes: './assets/env/dungeon/Spikes.glb',
    banner: './assets/env/dungeon/Banner_wall.glb',
    brick: './assets/env/dungeon/Brick.glb',
    woodfire: './assets/env/dungeon/Woodfire.glb',
  };
  const entries = await Promise.all(
    Object.entries(names).map(async ([k, url]) => [k, await loadGLB(url)])
  );
  dkit = Object.fromEntries(entries);
  return dkit;
}

// Stone shell: dungeon floor tiles (2×2) + modular walls with door gaps.
// Collider layout matches buildShell so doors/entries behave identically.
function buildStoneShell(world, w, d, gaps = []) {
  const halfW = w / 2, halfD = d / 2;
  world.deckY = 0.185; // measured top of the modular dungeon floor tiles

  const floorPlacements = [];
  for (let tx = 0; tx < w / 2; tx++) {
    for (let tz = 0; tz < d / 2; tz++) {
      floorPlacements.push({
        x: tx * 2 - halfW + 1,
        z: tz * 2 - halfD + 1,
        y: 0.06,
        ry: ((tx * 7 + tz * 13) % 4) * Math.PI / 2,
      });
    }
  }
  world.add(instancePlacements(dkit.floor.scene, floorPlacements, { castShadow: false }));

  const inGap = (side, coord) =>
    gaps.some((g) => g.side === side && coord > g.from && coord < g.to);

  // walls are 2 wide × 2 tall; stack a second row for cavern height
  const wallPlacements = [];
  const addWall = (x, z, ry, side, coord) => {
    if (inGap(side, coord)) return;
    wallPlacements.push({ x, z, y: 1.06, ry });
    wallPlacements.push({ x, z, y: 2.66, ry, sy: 0.6 });
  };
  for (let tx = 0; tx < w / 2; tx++) {
    const x = tx * 2 - halfW + 1;
    addWall(x, -halfD - 0.22, 0, 'n', x);
    addWall(x, halfD + 0.22, 0, 's', x);
  }
  for (let tz = 0; tz < d / 2; tz++) {
    const z = tz * 2 - halfD + 1;
    addWall(-halfW - 0.22, z, Math.PI / 2, 'w', z);
    addWall(halfW + 0.22, z, Math.PI / 2, 'e', z);
  }
  world.add(instancePlacements(dkit.wall.scene, wallPlacements));

  const segments = (side, lo, hi) => {
    const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
    let start = lo;
    const out = [];
    for (const c of cuts) {
      if (c.from > start) out.push([start, c.from]);
      start = c.to;
    }
    if (start < hi) out.push([start, hi]);
    return out;
  };
  for (const [a, b] of segments('n', -halfW - 1, halfW + 1)) world.addBox(a, b, -halfD - 1, -halfD + 0.1);
  for (const [a, b] of segments('s', -halfW - 1, halfW + 1)) world.addBox(a, b, halfD - 0.1, halfD + 1);
  for (const [a, b] of segments('w', -halfD - 1, halfD + 1)) world.addBox(-halfW - 1, -halfW + 0.1, a, b);
  for (const [a, b] of segments('e', -halfD - 1, halfD + 1)) world.addBox(halfW - 0.1, halfW + 1, a, b);

  return { halfW, halfD };
}

// A torch column: warm flame + a pool of real light (the caverns run dark).
// `bare` skips the column base (for sconces mounted on existing pillars).
function wallTorch(world, x, z, ry = 0, { bare = false } = {}) {
  if (!bare) {
    const col = prepareModel(dkit.column.scene.clone());
    col.position.set(x, 0, z);
    col.scale.setScalar(0.35);
    world.add(col);
    world.addCircle(x, z, 0.28);
  }
  const torch = prepareModel(dkit.torch.scene.clone());
  torch.position.set(x, bare ? 1.3 : 1.55, z);
  torch.rotation.y = ry;
  torch.scale.setScalar(1.4);
  torch.traverse((n) => {
    if (n.isMesh && n.material.name === 'Fire') {
      n.material = n.material.clone();
      n.material.emissive = new THREE.Color(0xffa03a);
      n.material.emissiveIntensity = 2.4;
    }
  });
  world.add(torch);
  const light = new THREE.PointLight(0xffb25a, 5, 8, 1.9);
  light.position.set(x, 1.9, z);
  world.add(light);
  world.onAnimate((t) => {
    light.intensity = 4.4 + Math.sin(t * 9 + x * 3 + z) * 0.8;
  });
}

// Cavern doorway: flanking dungeon columns + torch glow (same "glow = way
// through" read the Ember doorways teach).
function stoneDoorway(world, x, z, axis) {
  const off = 1.45;
  const p1 = axis === 'x' ? [x - off, z] : [x, z - off];
  const p2 = axis === 'x' ? [x + off, z] : [x, z + off];
  for (const [px, pz] of [p1, p2]) {
    const col = prepareModel(dkit.column.scene.clone());
    col.position.set(px, 0, pz);
    col.scale.setScalar(0.55);
    world.add(col);
    world.addCircle(px, pz, 0.4);
    wallTorch(world, px, pz, 0, { bare: true });
  }
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(axis === 'x' ? 2.2 : 0.9, axis === 'x' ? 0.9 : 2.2),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.5, roughness: 1, depthWrite: false,
    })
  );
  strip.rotation.x = -Math.PI / 2;
  // v3.20: was 0.1 — BELOW the 0.185 stone floor, so every doorway's
  // "this is the way out" glow was invisible in all five Stoneroot rooms
  strip.position.set(x, world.deckY + 0.015, z);
  world.add(strip);
  world.onAnimate((t) => {
    strip.material.emissiveIntensity = 0.55 + 0.3 * Math.sin(t * 2.1 + x);
  });
}

// Floor spikes on a fixed cycle (rest → warning peek + click → up). They ride
// the geyser hazard list, so a well-timed jump clears them.
function spikeTrap(world, x, z, offset = 0) {
  const base = prepareModel(dkit.trapBase.scene.clone(), { castShadow: false });
  base.position.set(x, 0.09, z);
  base.scale.setScalar(0.85);
  world.add(base);

  const spikes = prepareModel(dkit.spikes.scene.clone());
  spikes.position.set(x, -1.1, z);
  spikes.scale.setScalar(0.85);
  world.add(spikes);

  const g = { x, z, r: 0.78, active: false };
  world.geysers.push(g);

  const CYCLE = 3.6, WARN = 2.0, UP = 2.6;
  let clicked = false;
  world.onAnimate((t) => {
    const ph = (t + offset) % CYCLE;
    if (ph < WARN) {
      g.active = false;
      spikes.position.y = -1.1;
      clicked = false;
    } else if (ph < UP) {
      g.active = false;
      const f = (ph - WARN) / (UP - WARN);
      spikes.position.y = -1.1 + f * 0.24; // tips peek out
      if (!clicked) { clicked = true; audio.play('ui-click', { volume: 0.5, rate: 0.55 }); }
    } else {
      const f = Math.min(1, (ph - UP) * 6);
      spikes.position.y = -1.1 + 0.24 + f * 0.92;
      g.active = f > 0.4;
    }
  });
}

// Pushable boulder + pressure plate now live in js/gates.js so Level 3 can use
// the SAME ones rather than growing its own. Level 3 duplicating the cut
// system — and getting it subtly wrong, so its brambles could never be cut at
// all — is exactly what sharing these prevents. Thin wrappers keep every
// existing call site in this file unchanged.
function boulder(world, x, z) { return pushableBoulder(world, prepareModel, kit.rockLB, x, z); }
function pressurePlate(world, id, x, z, onPressed) { return plateSwitch(world, id, x, z, onPressed); }

// (v3.18: the drop-hole/climb-spot teleport pair is GONE — dad's law:
// nothing moves the player without a door they walked through.)

// Cracked rock pile — the Earth Wolf's stomp shatters these (region verb,
// mirrors Ember's burnables).
function crackedRocks(world, id, x, z) {
  if (state.flags.cracked[id]) return null;
  const group = new THREE.Group();
  for (const p of [
    { src: kit.rockLA, dx: 0, dz: 0, s: 1.7, ry: 0.6 },
    { src: kit.rockSB, dx: 0.55, dz: 0.4, s: 1.5, ry: 2.1 },
    { src: kit.rockSA, dx: -0.5, dz: 0.3, s: 1.4, ry: 3.8 },
    { src: kit.rockSB, dx: 0.1, dz: -0.5, s: 1.3, ry: 1.2 },
  ]) {
    const m = prepareModel(p.src.scene.clone());
    m.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.color.setHex(0x74787f);
      n.material.emissive = new THREE.Color(0xd8b06a);
      n.material.emissiveIntensity = 0.12; // faint golden cracks — "special"
    });
    m.position.set(p.dx, 0, p.dz);
    m.rotation.y = p.ry;
    m.scale.setScalar(p.s);
    group.add(m);
  }
  group.position.set(x, 0, z);
  world.add(group);
  const collider = { x, z, r: 0.95 };
  world.circleColliders.push(collider);
  const c = { id, x, z, group, collider, cracked: false };
  world.crackables.push(c);
  return c;
}

// Shared cavern dressing. Terranigma rule: beating the region's guardian
// visibly REVIVES the world — the caverns brighten and glowing mushrooms
// sprout where there was bare stone.
function cavernMood(world) {
  const revived = state.flags.wardenDefeated;
  world.lightScale = revived ? 0.6 : 0.42;
  world.bgColor = revived ? 0x101720 : 0x0b0d14;
}

// Post-warden life: glowing mushroom clusters (Kenney nature kit). Every
// other patch carries a soft green light so the new life reads at a glance.
// GLOWING MUSHROOMS — Stoneroot's growth, taking root wherever the caverns'
// light has reached. One of the Terranigma beats: the world visibly changes as
// regions are freed.
//
// They used to render as three teal boulders. Two reasons, and the first is
// simply that a mushroom was being drawn at 1.6x — mushroom-group.glb is a
// CLUSTER of caps modelled at roughly ankle height, so at 1.6 each "patch" was
// a single object the size of a tree. The second is that a strong emissive
// tint on a low-poly cap makes it read as a crystal rather than as something
// that grew: fungus glows FAINTLY and unevenly, it does not blaze.
//
// So a patch is now what the word means — nine to fourteen small mushrooms
// scattered across a couple of units, at ankle-to-knee height, with a single
// soft light over the whole patch rather than one per clump. Instanced, so all
// the patches in a room together cost two draw calls instead of one each.
async function mushroomPatches(world, spots) {
  if (!state.flags.wardenDefeated) return;
  const [group, tall] = await Promise.all([
    loadGLB('./assets/env/mushroom-group.glb'),
    loadGLB('./assets/env/mushroom-tall.glb'),
  ]);
  // seeded off the spot list so a patch looks the same every time you come back
  let seed = spots.length * 9301 + Math.round((spots[0] ? spots[0][0] * 71 : 7));
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  const caps = [], stalks = [];
  for (const [x, z, spread] of spots) {
    const R = 1.3 * (spread || 1);
    const n = 9 + Math.round(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      // a few tall ones standing out of the clump, the rest low
      const isTall = rnd() < 0.24;
      const sc = isTall ? 0.34 + rnd() * 0.2 : 0.26 + rnd() * 0.22;
      (isTall ? stalks : caps).push({
        x: px, z: pz, y: 0.02, ry: rnd() * 6.28, sx: sc, sy: sc * (0.9 + rnd() * 0.35), sz: sc,
      });
    }
    // ONE light for the whole patch. A light per clump was three point lights
    // in the Den alone, and the shader pays for every one of them in every
    // material in the room.
    const glow = new THREE.PointLight(0x9affc0, 1.5, 4.5, 1.9);
    glow.position.set(x, 0.45, z);
    world.add(glow);
    world.onAnimate((t) => { glow.intensity = 1.2 + Math.sin(t * 1.9 + x) * 0.35; });
  }

  for (const [gltf, pts, hue] of [[group, caps, 0x8affc0], [tall, stalks, 0xd8ffb0]]) {
    if (!pts.length) continue;
    const inst = instancePlacements(gltf.scene, pts, { castShadow: false });
    inst.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.emissive = new THREE.Color(hue);
      // 0.28, not 0.55 — enough to read as lit from within, not enough to make
      // a cap look like cut glass
      n.material.emissiveIntensity = 0.28;
    });
    world.add(inst);
  }
}

// ---------------------------------------------------------------------------
// E1 — Cavern Gate (teaches: skeletons wake; the way down from Ember Hollow)
// ---------------------------------------------------------------------------

async function buildE1(scene) {
  const world = new World(scene);
  cavernMood(world);
  buildStoneShell(world, 16, 12, [
    { side: 's', from: -1.2, to: 1.2 }, // back up to Ember Hollow (R3)
    { side: 'n', from: -1.2, to: 1.2 }, // deeper: the Deep Hall
    { side: 'e', from: -1.2, to: 1.2 }, // sideways: the Echo Chasm
  ]);
  world.spawn = { x: 0, z: 4.6, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 5.85, 6.9, 'r3', { x: 0, z: -4.4, angle: 0 });
  world.addDoor(-1.2, 1.2, -6.9, -5.85, 'e2', { x: -6, z: 4.4, angle: Math.PI });
  world.addDoor(7.9, 8.9, -1.2, 1.2, 'e1b', { x: -7, z: -2.8, angle: Math.PI / 2 });

  // torch pools mark the safe path; the rest stays cave-dark
  wallTorch(world, -2.4, 5.2); wallTorch(world, 2.4, 5.2);
  wallTorch(world, -3.2, -0.4); wallTorch(world, 3.2, -0.4);
  stoneDoorway(world, 0, -5.5, 'x');

  // grand entry arch framing the way in
  const arch = prepareModel(dkit.arch.scene.clone());
  arch.position.set(0, 0, 3.4);
  arch.scale.setScalar(0.75);
  world.add(arch);
  world.addCircle(-1.5, 3.4, 0.4);
  world.addCircle(1.5, 3.4, 0.4);

  // RIPPLE (WORLD-DESIGN §3): once Ember Hollow heals, two green shoots
  // push through the cave mouth — the next region already feels touched.
  if (WS.get('ember', 'restored')) {
    healedSprouts(world, [[1.9, 4.9], [-1.7, 5.1]], 1.1);
    world.markers.rippleShoots = { x: 0, z: 4.9 };
  }

  // THRESHOLD CAMP (WORLD-DESIGN §2, beat 2): Old Bram the prospector rests
  // by a small fire at the region mouth — a face, a rest point, a rumour
  // about what rattles below. He cheers up once the caverns heal.
  {
    const [mageGltf, generalAnims] = await Promise.all([
      loadGLB('./assets/chars/mage.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
    ]);
    const fire = prepareModel(dkit.woodfire.scene.clone());
    fire.position.set(-4.2, 0, 3.2);
    fire.scale.setScalar(1.1);
    world.add(fire);
    world.addCircle(-4.2, 3.2, 0.4);
    const fl = new THREE.PointLight(0xffa54a, 3.0, 7, 1.8);
    fl.position.set(-4.2, 0.8, 3.2);
    world.add(fl);
    const crate = prepareModel(dkit.crate.scene.clone());
    crate.position.set(-5.4, 0, 3.6);
    crate.rotation.y = 0.5;
    world.add(crate);
    world.addCircle(-5.4, 3.6, 0.4);
    // Bram = the mage model in earth-brown work clothes (tinted clone)
    const bram = prepareCharacter(SkeletonUtils.clone(mageGltf.scene));
    bram.scale.setScalar(0.5);
    bram.position.set(-4.8, 0, 2.4);
    bram.rotation.y = 0.9; // faces the fire + the entrance
    bram.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (c.color) c.color.lerp(new THREE.Color(0x8a6a48), 0.45);
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    world.add(bram);
    world.addCircle(-4.8, 2.4, 0.35);
    const bramMixer = new THREE.AnimationMixer(bram);
    const idleClip = generalAnims.animations.find((c) => c.name === 'Idle_A');
    if (idleClip) bramMixer.clipAction(idleClip).play();
    world.onAnimate((t, dt) => {
      bramMixer.update(dt);
      fl.intensity = 2.7 + Math.sin(t * 7.3) * 0.5;
    });
    // v3.21.1: the whole camp shifted 1.4u north — a campfire's glow reaches
    // across a dark cavern, but Bram himself was standing in the strip of floor
    // the camera never shows, so a kid could hear him and never find him.
    world.markers.campSpot = { x: -4.6, z: 2.8 };
  }

  // The NE treasure alcove — open to any curious explorer. (v3.18: the old
  // "dead machinery" grate + code-built millstone discs are GONE — playtest:
  // the grey discs read as nonsense wall-circles, and the mill fiction had
  // no real machinery to back it. Rooms only promise what they can show.)

  // Post-restore: glow-moss lights the old hall
  if (WS.get('stone', 'restored')) {
    healedGlowmoss(world, [[-6.6, 0.5], [2.4, -2.8], [6.4, 3.4], [-2.2, -5.2]]);
    world.markers.healed = true;
  }

  // columns + cobwebs + skulls: ruins of the old stone hall
  for (const [x, z, s] of [[-5.6, -3.8, 0.5], [5.6, -3.8, 0.5], [-5.8, 2.8, 0.45]]) {
    const col = prepareModel(dkit.column2.scene.clone());
    col.position.set(x, 0, z);
    col.scale.setScalar(s);
    world.add(col);
    world.addCircle(x, z, 0.4);
  }
  for (const [x, z, ry] of [[-7.2, -5.0, 0.4], [7.3, -5.2, -0.5], [7.2, 5.4, 2.6]]) {
    const web = prepareModel(dkit.cobweb.scene.clone(), { castShadow: false });
    web.position.set(x, 0.4, z);
    web.rotation.y = ry;
    web.scale.setScalar(1.4);
    world.add(web);
  }
  for (const [x, z, ry] of [[-4.4, 0.9, 1.2], [4.9, -1.8, 3.6], [-6.3, -4.2, 5.1]]) {
    const skull = prepareModel(dkit.skull.scene.clone());
    skull.position.set(x, 0.1, z);
    skull.rotation.y = ry;
    world.add(skull);
  }

  // skeletons sleep on the critical path — every kid sees the wake-up beat;
  // bats roost by the cobwebbed corners
  world.markers.minionSpots = [{ x: 0.6, z: 0.6 }, { x: -2.0, z: -2.6 }];
  world.markers.batSpots = [{ x: -6.6, z: -4.4 }, { x: 6.6, z: 4.6 }];
  // the first SHIELD-BEARER: a slow wall of bone that teaches "wait for the
  // swing or go around" (Pip explains on approach)
  world.markers.shieldSpots = [{ x: 0.6, z: -1.8 }];

  // the caverns bloom once the Warden falls (Terranigma-style revival)
  await mushroomPatches(world, [
    [-5.0, 4.6], [5.2, 2.8, 2.0], [-6.6, -2.6], [2.6, -2.0, 1.3], [6.8, -3.4],
  ]);

  // checkpoint by the deep door
  checkpoint(world, 'cp_e1', 3.4, -4.4);
  potionPickup(world, 4.6, -3.4);

  // cracked rocks hide a treasure alcove (Earth Wolf backtrack reward)
  crackedRocks(world, 'e1_alcove', 6.0, 1.8);
  world.markers.crackSpot = { x: 6.0, z: 1.8 };
  world.markers.chestDefs = [
    { id: 'c_e1_hall', tier: 'wood', x: -6.8, z: 3.4, ry: 0.9, loot: { shards: 10 } },
    // the NE alcove treasure (id kept from the old grate version — saves)
    { id: 'c_e1_mill', tier: 'gold', x: 6.1, z: -5.5, ry: 3.1, loot: { shards: 22, potion: 1 } },
    ...(state.flags.cracked.e1_alcove
      ? [{ id: 'c_e1_crack', tier: 'gold', x: 7.0, z: 1.6, ry: -1.2, loot: { shards: 20, heartPiece: 1 } }]
      : []),
  ];
  world.markers.breakables = [
    { x: -1.8, z: 3.0, kind: 'vase', shards: 2 },
    { x: -2.6, z: 3.5, kind: 'vase', shards: 2 },
    { x: 6.6, z: -4.9, kind: 'crate', shards: 3 },
  ];

  return world;
}

// ---------------------------------------------------------------------------
// E1b — The Hidden Hollow (a simple pitch-dark treasure cave: the Dark
// Wolf's eyes are the only tool it asks for. v3.18 playtest law replaced the
// old Echo Chasm fall-hole maze — "you randomly disappear and reappear" is
// banned; nothing in this game teleports the player without a door.)
// ---------------------------------------------------------------------------

async function buildE1b(scene) {
  const world = new World(scene);
  cavernMood(world);
  buildStoneShell(world, 16, 12, [
    { side: 'w', from: -4, to: -1.6 }, // back to the Cavern Gate (upper tier)
  ]);
  world.spawn = { x: -7, z: -2.8, angle: Math.PI / 2 };
  world.addDoor(-8.9, -7.85, -4, -1.6, 'e1', { x: 7.4, z: 0, angle: -Math.PI / 2 });

  // pitch dark, wall to wall — the Dark Wolf's eyes or nothing
  darkZone(world, -7.9, 7.9, -5.9, 5.9);
  wallTorch(world, -6.4, -5.2); wallTorch(world, 6.4, -5.2);
  stoneDoorway(world, -7.4, -2.8, 'z');

  // a winding cave: rock spurs shape two bays, everything walkable on foot
  for (const [x, z, s, ry] of [
    [-2.6, -1.4, 1.9, 0.7], [2.4, 1.8, 2.1, 2.3], [-5.0, 2.6, 1.7, 4.1],
    [5.8, -2.2, 1.8, 1.1],
  ]) {
    const rock = prepareModel(kit.rockLA.scene.clone());
    rock.position.set(x, 0, z);
    rock.rotation.y = ry;
    rock.scale.setScalar(s);
    world.add(rock);
    world.addCircle(x, z, 0.65 * (s / 1.8));
  }

  // shades and bats wait where the torchlight can't reach
  world.markers.shadeSpots = [{ x: -3.6, z: 3.4 }, { x: 3.2, z: -4.2 }];
  world.markers.batSpots = [{ x: -1.5, z: -4.8 }, { x: 5.8, z: -4.2 }];
  crackedRocks(world, 'e1b_deep', 6.2, 3.0); // kept OUT of the south blind strip
  world.markers.chestDefs = [
    { id: 'c_e1b_maze', tier: 'wood', x: 1.8, z: 3.2, ry: 3.1, loot: { shards: 16, potion: 1 } },
    ...(state.flags.cracked.e1b_deep
      ? [{ id: 'c_e1b_deep', tier: 'gold', x: 7.0, z: 3.4, ry: -2.4, loot: { shards: 14, heartPiece: 1 } }]
      : []),
  ];
  world.markers.breakables = [
    { x: -6.9, z: 3.0, kind: 'vase', shards: 2 },
    { x: 6.6, z: -5.4, kind: 'crate', shards: 3 },
  ];
  checkpoint(world, 'cp_e1b', -7.2, -4.6);
  for (const [x, z, ry] of [[7.2, -5.6, 0.5], [-2.0, 5.6, 2.2]]) {
    const web = prepareModel(dkit.cobweb.scene.clone(), { castShadow: false });
    web.position.set(x, 0.4, z);
    web.rotation.y = ry;
    web.scale.setScalar(1.3);
    world.add(web);
  }
  return world;
}

// ---------------------------------------------------------------------------
// E2b — The Old Quarry (v3.18: the second push-puzzle is GONE — one puzzle
// room per level, dad's law — and the "Mill" fiction went with it. This is
// now a straight COMBAT challenge: an old bone-quarry arena. Clear the
// ambush and the treasure vault grinds open on its own.)
// ---------------------------------------------------------------------------

async function buildE2b(scene) {
  const world = new World(scene);
  cavernMood(world);
  buildStoneShell(world, 16, 12, [
    { side: 's', from: -1.2, to: 1.2 }, // back down to the Deep Hall
  ]);
  world.spawn = { x: 0, z: 4.6, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 5.85, 6.9, 'e2', { x: 6, z: -5.2, angle: 0 });

  wallTorch(world, -5.8, 4.6); wallTorch(world, 5.8, 4.6);
  wallTorch(world, -6.6, -2.6); wallTorch(world, 6.6, -2.6);
  stoneDoorway(world, 0, 5.4, 'x');

  // quarry dressing: half-cut stone piles and old crates — cover to fight
  // around, nothing that pretends to be machinery
  for (const [x, z, s, ry] of [
    [-4.6, -0.6, 1.9, 0.4], [4.2, 1.6, 1.7, 2.1], [-2.2, -3.8, 1.6, 5.2],
  ]) {
    const rock = prepareModel(kit.rockLA.scene.clone());
    rock.position.set(x, 0, z);
    rock.rotation.y = ry;
    rock.scale.setScalar(s);
    world.add(rock);
    world.addCircle(x, z, 0.65 * (s / 1.8));
  }

  // THE TREASURE VAULT (NE corner): barred until the quarry is CLEARED —
  // beat every skeleton in the room and it grinds open. Old saves that
  // solved the retired twin-plate puzzle keep their open vault.
  {
    const cleared = () =>
      !!state.flags.e2bCleared || (!!state.flags.plates.e2b_p1 && !!state.flags.plates.e2b_p2);
    const bars = prepareModel(dkit.bars.scene.clone());
    bars.position.set(6.9, 0, -4.4);
    bars.scale.set(0.9, 0.8, 1);
    const vaultCollider = { minX: 5.9, maxX: 7.9, minZ: -6, maxZ: -4.1 };
    if (!cleared()) {
      world.add(bars);
      world.boxColliders.push(vaultCollider);
    }
    world.quarryCleared = cleared;
    let opened = cleared();
    world.onAnimate((t, dt) => {
      if (opened) return;
      // the fight is over when every real enemy (not pots/crates) is down
      const foes = (world.enemies || []).filter((e) => !e.scenery && e.takeStun);
      if (!foes.length || foes.some((e) => !e.dead)) return;
      opened = true;
      state.flags.e2bCleared = true;
      const i = world.boxColliders.indexOf(vaultCollider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      let rise = 0;
      world.onAnimate((t2, dt2) => {
        if (rise >= 2.6) return;
        rise += dt2 * 1.6;
        bars.position.y = Math.min(2.6, rise);
        if (rise >= 2.6) world.root.remove(bars);
      });
      audio.play('gate-creak', { volume: 0.85, rate: 0.45 }); // the vault groans
      audio.play('checkpoint', { volume: 0.9, rate: 1.1 });
    });

    // v3.18.1 (playtest: "the chest is unobtainable"): a sleeping skeleton
    // in a dim corner could stall the clear forever without the player
    // knowing WHY. Two fixes: the AMBUSH SPRINGS all at once the moment
    // Kael steps onto the quarry floor (no hidden sleepers), and a bones
    // counter chip shows exactly how many remain until the vault opens.
    const chipEl = document.getElementById('mg-chip');
    let sprung = false;
    world.updateMinigames = (dt, t, player) => {
      if (opened) { chipEl.style.display = 'none'; return; }
      const foes = (world.enemies || []).filter((e) => !e.scenery && e.takeStun);
      if (!sprung && player.root.position.z < 3.2) {
        sprung = true;
        let woke = false;
        for (const e of foes) {
          if (!e.dead && e.state === 'sleep') {
            e.state = 'awaken';
            e.stateT = 0;
            e._play('awaken', 0.08, { once: true });
            woke = true;
          }
        }
        if (woke) audio.play('bones', { volume: 0.85, rate: 0.6 }); // they ALL rise
      }
      const left = foes.filter((e) => !e.dead).length;
      chipEl.textContent = `🦴 ${left} left — clear the quarry!`;
      chipEl.style.display = sprung && left > 0 ? 'block' : 'none';
    };
  }
  world.markers.chestDefs = [
    // clear of the NE wall visuals (it used to sink into the corner blocks)
    { id: 'c_e2b_vault', tier: 'gold', x: 6.8, z: -5.0, ry: 2.6, loot: { shards: 24, heartPiece: 1 } },
  ];

  // THE AMBUSH: rogues from the flanks, minions from the dark corners, and
  // the Bone Brute anchoring the floor — the room IS the challenge
  world.markers.rogueSpots = [{ x: -4.2, z: 3.0 }, { x: 4.4, z: 3.4 }];
  world.markers.minionSpots = [
    { x: 0, z: -5.0, variant: 'brute' }, // a wall of old bone
    { x: -5.2, z: -4.2 }, { x: 5.4, z: -1.8 },
  ];

  checkpoint(world, 'cp_e2b', -6.8, 3.4);
  potionPickup(world, 6.8, 3.4);
  world.markers.breakables = [
    { x: -7.3, z: -5.4, kind: 'barrel', shards: 3 },
    { x: 3.2, z: 3.0, kind: 'vase', shards: 2 },
  ];
  await mushroomPatches(world, [[-4.6, -5.2], [2.8, 2.2, 1.4], [-2.4, 4.8]]);
  if (WS.get('stone', 'restored')) {
    healedGlowmoss(world, [[-6.2, 0.4], [4.8, -0.8]]);
    world.markers.healed = true;
  }
  return world;
}

// ---------------------------------------------------------------------------
// E2 — The Deep Hall (teaches: spike timing, boulder pushing; rogue ambush)
// ---------------------------------------------------------------------------

async function buildE2(scene) {
  const world = new World(scene);
  cavernMood(world);
  buildStoneShell(world, 20, 12, [
    { side: 's', from: -7.2, to: -4.8 }, // back to E1
    { side: 'e', from: -1.2, to: 1.2 },  // gated crypt door
    { side: 'n', from: 4.8, to: 7.2 },   // up into the Mill
  ]);
  world.spawn = { x: -6, z: 4.4, angle: Math.PI };
  world.addDoor(-7.2, -4.8, 5.85, 6.9, 'e1', { x: 0, z: -4.4, angle: 0 });
  world.addDoor(9.15, 10.15, -1.2, 1.2, 'e3', { x: 0, z: 5.4, angle: Math.PI });
  world.addDoor(4.8, 7.2, -6.9, -5.85, 'e2b', { x: 0, z: 4.6, angle: Math.PI });

  wallTorch(world, -6, 2.2); wallTorch(world, -2.8, -1.4);
  wallTorch(world, 3.4, 2.6); wallTorch(world, 7.8, -2.2);
  stoneDoorway(world, -6, 5.4, 'x');

  // spike gauntlet across the north band — guards a chest + the high road
  spikeTrap(world, -0.6, -4.2, 0.0);
  spikeTrap(world, 1.4, -3.6, 1.2);
  spikeTrap(world, 3.4, -4.3, 2.4);
  world.markers.spikeSpot = { x: 1.4, z: -4.0 };

  // the boulder puzzle: roll the old millstone onto the plate to raise the
  // crypt gate (SW chamber, walled so the puzzle reads as its own pocket)
  blockRow(world, 0.5, 1.0, 0.5, 5.4, 1.4);
  boulder(world, -2.6, 1.4);
  world.markers.boulderSpot = { x: -2.6, z: 1.4 };
  const gateBars = prepareModel(dkit.bars.scene.clone());
  gateBars.position.set(9.35, 0, 0);
  gateBars.rotation.y = Math.PI / 2;
  gateBars.scale.set(1.05, 0.75, 1);
  const gateCollider = { minX: 9.0, maxX: 9.8, minZ: -1.3, maxZ: 1.3 };
  const opened = !!state.flags.plates.e2_gate;
  if (!opened) {
    world.add(gateBars);
    world.boxColliders.push(gateCollider);
  }
  // plate placement law (v3.18): the tall SOUTH wall hides a ~2u strip of
  // floor from the camera — interactives NEVER live there ("there is no
  // pressure plate" = a plate parked in the blind strip). z 2.6 is open floor.
  pressurePlate(world, 'e2_gate', -1.6, 2.6, () => {
    // the way is open the moment the plate clicks (collider first, visual after)
    const ci = world.boxColliders.indexOf(gateCollider);
    if (ci >= 0) world.boxColliders.splice(ci, 1);
    let rise = 0;
    world.onAnimate((t, dt) => {
      if (rise >= 2.6) return;
      rise += dt * 1.6;
      gateBars.position.y = Math.min(2.6, rise);
      if (rise >= 2.6) world.root.remove(gateBars);
    });
    audio.play('slam', { volume: 0.5, rate: 0.6 });
    audio.play('gate-creak', { volume: 0.85, rate: 0.5 }); // old iron groans up
  });
  // (v3.18: the region-wide "mill wakes" twist and the code-built wheel
  // discs are GONE — playtest: they read as nonsense circles, and the game
  // showed no real machinery. The plate simply opens the crypt gate.)

  // Region 3's LOCK, shown a region early (machine-checked in regions.js):
  // a thorny bramble tangle chokes an east alcove. Only the Verdant Wolf's
  // vine-lash will cut it — for now it is a promise.
  // v3.21.1: it used to choke the SE *corner* (z 4.7), which put the promise
  // AND its visible reward inside the camera's blind strip — a lock you are
  // meant to remember for a whole region, that you can never actually see.
  // The alcove is now built out of two short walls further north, so the
  // corner geometry is no longer what makes the pocket.
  blockRow(world, 7.8, 1.9, 10.2, 1.9, 1.4);   // alcove roof
  blockRow(world, 7.8, 4.4, 10.2, 4.4, 1.4);   // alcove floor
  await (async () => {
    const bush = await loadGLB('./assets/env/bush-large.glb');
    brambleGate(world, prepareModel, bush, 'e2_bramble', 7.4, 3.1);
  })();

  // Post-restore dressing: glow-moss — and ONE crack that never mends
  if (WS.get('stone', 'restored')) {
    healedGlowmoss(world, [[-8.2, 3.8], [-0.2, -1.2], [5.6, -2.8], [8.6, 1.0]]);
    const scar = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 18),
      new THREE.MeshStandardMaterial({ color: 0x14101c, roughness: 1 })
    );
    scar.rotation.x = -Math.PI / 2;
    scar.position.set(3.0, world.deckY + 0.015, 3.6); // height law
    world.add(scar);
    world.markers.scarSpot = { x: 3.0, z: 3.6 };
    world.markers.healed = true;
  }
  // frame the gate with the big arch
  const arch2 = prepareModel(dkit.arch.scene.clone());
  arch2.position.set(9.35, 0, 0);
  arch2.rotation.y = Math.PI / 2;
  arch2.scale.setScalar(0.7);
  world.add(arch2);

  // the rogue ambush waits mid-hall; slimes squelch near the entry; a bat
  // roosts over the spike gauntlet
  world.markers.minionSpots = [{ x: -3.4, z: 3.2 }];
  world.markers.rogueSpots = [{ x: 1.6, z: 0.2 }, { x: 4.8, z: 1.8 }];
  world.markers.slimeSpots = [{ x: -5.6, z: 0.2 }, { x: 5.8, z: 3.6 }];
  world.markers.shieldSpots = [{ x: 2.8, z: 1.0 }]; // the wall walks the Deep Hall
  world.markers.batSpots = [{ x: 5.2, z: -4.6 }];

  // the deep NORTH half is cave-dark — spikes and bones read through the
  // Dark Wolf's eyes or the torch pools. The SOUTH half (entrance + the
  // boulder puzzle) stays lit: v3.18 playtest law — a puzzle the player
  // must SOLVE is never hidden in the dark ("there is no pressure plate"
  // was a plate the dark had swallowed).
  darkZone(world, -10, 10, -6, 0.2);
  world.markers.pup4Spot = { x: -9.0, z: -5.0 };
  // ...and a second pup shivers in the far corner past the spikes
  world.markers.pup5Spot = { x: 9.2, z: -5.2 };

  // the pre-boss rest moved west: the bramble alcove now occupies the east
  // band, and a rest point must never share space with a locked promise
  checkpoint(world, 'cp_e2', 6.0, 3.0);
  potionPickup(world, -8.6, -4.2);
  potionPickup(world, 6.8, 2.6); // campfire + potion directly before the boss door (contract law)
  await mushroomPatches(world, [
    [-7.8, 3.2], [-1.2, -2.2, 1.3], [2.2, 4.6], [7.0, 0.8, 2.0], [-4.6, -4.8], [8.6, 5.4],
  ]);
  world.markers.chestDefs = [
    { id: 'c_e2_spikes', tier: 'wood', x: 6.8, z: -4.9, ry: 2.0, loot: { shards: 14, potion: 1 } },
    // visible through the brambles — region 3's promise reward
    { id: 'c_e2_bramble', tier: 'gold', x: 9.3, z: 3.1, ry: -2.4, loot: { shards: 18, powerup: 'feather' } },
  ];
  world.markers.breakables = [
    { x: -8.6, z: 1.8, kind: 'barrel', shards: 2 },
    { x: -4.4, z: -3.9, kind: 'crate', shards: 3 },
    { x: 8.3, z: 4.9, kind: 'vase', shards: 2 },
  ];
  for (const [x, z, ry] of [[-9.2, -5.2, 0.7], [9.2, -5.3, -2.2]]) {
    const web = prepareModel(dkit.cobweb.scene.clone(), { castShadow: false });
    web.position.set(x, 0.4, z);
    web.rotation.y = ry;
    web.scale.setScalar(1.3);
    world.add(web);
  }

  return world;
}

// ---------------------------------------------------------------------------
// E3 — The Warden's Crypt (mini-boss arena; Petra + the Earth Wolf)
// ---------------------------------------------------------------------------

async function buildE3(scene) {
  const world = new World(scene);
  cavernMood(world);
  buildStoneShell(world, 14, 14, [
    { side: 's', from: -1.3, to: 1.3 }, // entry from E2
    // once Stoneroot sings, the living vine opens the way to the WILD WOODS
    ...(WS.get('stone', 'restored') ? [{ side: 'n', from: 4.4, to: 6.6 }] : []),
  ]);
  world.spawn = { x: 0, z: 5.4, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 6.85, 7.9, 'e2', { x: 8.4, z: 0, angle: 0 });
  if (WS.get('stone', 'restored')) {
    world.addDoor(4.4, 6.6, -8.0, -6.85, 'w1', { x: 0, z: 4.2, angle: Math.PI });
  }

  wallTorch(world, -4.6, 4.6); wallTorch(world, 4.6, 4.6);
  wallTorch(world, -5.4, -3.2); wallTorch(world, 5.4, -3.2);
  stoneDoorway(world, 0, 6.3, 'x');

  // marble horse statues guard Petra's shrine
  for (const [x, ry] of [[-2.6, 0.6], [2.6, -0.6]]) {
    const s = prepareModel(dkit.statue.scene.clone());
    // Statue_Horse.glb sits 5.85u off its own origin in Z — at 0.34 scale that
    // put these two guardians two metres adrift of Petra's shrine, and of the
    // colliders added for them below.
    const sb = new THREE.Box3().setFromObject(s);
    for (const c of s.children) {
      c.position.x -= (sb.min.x + sb.max.x) / 2;
      c.position.z -= (sb.min.z + sb.max.z) / 2;
    }
    s.position.set(x, 0, -4.2);
    s.rotation.y = ry;
    s.scale.setScalar(0.34);
    world.add(s);
    world.addCircle(x, -4.2, 0.55);
  }
  for (const [x, z, ry] of [[-4.2, -0.4, 0.8], [4.4, 0.6, 2.4]]) {
    const b = prepareModel(dkit.banner.scene.clone(), { castShadow: false });
    b.position.set(x, 2.8, z);
    b.rotation.y = ry;
    world.add(b);
  }

  // Petra: an amber stone-heart on the pedestal, gripped in a dark shell
  // until the Warden falls.
  const ped = prepareModel(dkit.pedestal.scene.clone());
  ped.position.set(0, 0, -4.6);
  ped.scale.setScalar(0.7);
  world.add(ped);
  world.addCircle(0, -4.6, 0.75);
  const crystal = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.28, 1),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xd8b06a,
      emissiveIntensity: state.flags.wardenDefeated ? 3.0 : 0.5, roughness: 1,
    })
  );
  crystal.position.set(0, 1.9, -4.6);
  world.add(crystal);
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0d0916, transparent: true,
      opacity: state.flags.wardenDefeated ? 0 : 0.8, roughness: 1,
    })
  );
  shell.position.copy(crystal.position);
  shell.visible = !state.flags.wardenDefeated;
  world.add(shell);
  const glow = new THREE.PointLight(0xd8b06a, state.flags.wardenDefeated ? 9 : 1.4, 12, 1.8);
  glow.position.set(0, 2.1, -4.6);
  world.add(glow);
  world.onAnimate((t) => {
    crystal.position.y = 1.9 + Math.sin(t * 1.6) * 0.12;
    shell.position.y = crystal.position.y;
    crystal.rotation.y = t * 0.7;
  });
  world.markers.petraSpot = { x: 0, z: -4.6 };
  world.freePetra = () => {
    shell.visible = false;
    crystal.material.emissiveIntensity = 3.0;
    glow.intensity = 9;
  };

  // the Warden sleeps mid-arena until Kael steps close
  if (!state.flags.wardenDefeated) {
    world.markers.wardenSpot = { x: 0, z: -1.6 };
  }

  // treasure alcove sealed by cracked rocks (stomp practice, right where the
  // form is earned)
  crackedRocks(world, 'e3_treasure', -5.2, 2.2);

  // Post-restore: the crypt blooms with glow-moss, and the RIPPLE into
  // region 3 appears — a living vine curling through the north-east wall,
  // pointing at the Wild Woods to come.
  if (WS.get('stone', 'restored')) {
    healedGlowmoss(world, [[-4.2, 3.8], [4.2, 3.8], [-5.4, -1.6], [5.2, -0.6]]);
    healedSprouts(world, [[5.2, -5.8], [5.9, -5.2]], 1.15);
    world.markers.wildwoodsWay = { x: 5.5, z: -5.5 };
    world.markers.healed = true;
  }
  world.markers.chestDefs = [
    ...(state.flags.cracked.e3_treasure
      ? [{ id: 'c_e3_crack', tier: 'gold', x: -6.2, z: 1.4, ry: 1.4, loot: { shards: 16, gear: 'spear_a' } }]
      : []),
    ...(state.flags.wardenDefeated
      ? [{ id: 'c_e3_gold', tier: 'gold', x: 3.4, z: -2.6, ry: -0.8, loot: { shards: 25, powerup: 'star' } }]
      : []),
  ];
  world.markers.breakables = [
    { x: -5.9, z: 5.6, kind: 'vase', shards: 2 },
    { x: 5.9, z: 5.6, kind: 'barrel', shards: 2 },
  ];

  checkpoint(world, 'cp_e3', -3.2, 3.9);
  potionPickup(world, 3.2, 3.9);

  // the third cavern pup cowers in the crypt corner, freed with the Warden
  world.markers.pup6Spot = { x: -5.6, z: -5.6 };
  await mushroomPatches(world, [
    [-4.6, 0.4], [4.8, -1.2, 2.0], [-2.0, -6.0], [2.2, 5.8, 1.3], [5.8, 3.2],
  ]);

  return world;
}

// ---------------------------------------------------------------------------
// Witnessed restoration (design/WORLD-DESIGN.md §3) — shared helpers
// ---------------------------------------------------------------------------

// Natural (non-volcanic) colors for regrowth props — same trick as the Den.
function naturalTint(m) {
  m.traverse((n) => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    if (n.material.name === 'grass' || n.material.name === 'foliage') n.material.color.setHex(0x4e9a4a);
    if (n.material.name === 'dirt') n.material.color.setHex(0x8a6a48);
  });
  return m;
}

// Static regrowth dressing, applied at room BUILD time once a region's
// restoration flag is set (rooms rebuild on entry, so this persists free).
async function healedSprouts(world, spots, scale = 1.3) {
  const [fa, fb, bush] = await Promise.all([
    loadGLB('./assets/env/flower-a.glb'),
    loadGLB('./assets/env/flower-b.glb'),
    loadGLB('./assets/env/bush-large.glb'),
  ]);
  spots.forEach(([x, z], i) => {
    const src = i % 3 === 2 ? bush : (i % 2 === 0 ? fa : fb);
    const m = naturalTint(prepareModel(src.scene.clone(), { castShadow: false }));
    m.position.set(x, 0, z);
    m.rotation.y = (i * 2.1) % (Math.PI * 2);
    m.scale.setScalar(src === bush ? scale * 0.8 : scale);
    world.add(m); // decoration only — no colliders, kids walk through flowers
  });
}

// Glow-moss: Stoneroot's regrowth — mushroom clusters that LIGHT UP,
// because a cave heals into luminescence, not grass.
async function healedGlowmoss(world, spots, scale = 1.4) {
  const shroom = await loadGLB('./assets/env/mushroom-group.glb');
  spots.forEach(([x, z], i) => {
    const m = prepareModel(shroom.scene.clone(), { castShadow: false });
    m.position.set(x, 0, z);
    m.rotation.y = (i * 1.7) % (Math.PI * 2);
    m.scale.setScalar(scale);
    m.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      if (n.material.emissive) {
        n.material.emissive.setHex(0x7ee787);
        n.material.emissiveIntensity = 0.9;
      }
    });
    world.add(m);
    const l = new THREE.PointLight(0x9fe8a8, 1.6, 4.5, 2.0);
    l.position.set(x, 0.6, z);
    world.add(l);
  });
}

// Stoneroot's LIVE restoration: the crypt blooms glow-moss around the
// player the moment the Bone Warden falls. Mirrors emberRestorationLive.
export async function stoneRestorationLive(world) {
  const shroom = await loadGLB('./assets/env/mushroom-group.glb');
  const spots = [[-4.2, 3.8], [4.2, 3.8], [-5.4, -1.6], [5.2, -0.6], [-2.6, 0.8], [2.6, 0.8], [0, 3.2], [4.6, -3.6]];
  const blooms = spots.map(([x, z], i) => {
    const m = prepareModel(shroom.scene.clone(), { castShadow: false });
    m.position.set(x, 0, z);
    m.rotation.y = (i * 1.7) % (Math.PI * 2);
    m.scale.setScalar(0.001);
    m.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      if (n.material.emissive) {
        n.material.emissive.setHex(0x7ee787);
        n.material.emissiveIntensity = 0.9;
      }
    });
    world.add(m);
    const l = new THREE.PointLight(0x9fe8a8, 0, 4.5, 2.0);
    l.position.set(x, 0.6, z);
    world.add(l);
    return { m, l, delay: 0.6 + i * 0.5, target: 1.4 };
  });
  const DURATION = 9;
  let t = 0;
  world.onAnimate((tt, dt) => {
    t += dt;
    for (const b of blooms) {
      const p = Math.min(1, Math.max(0, (t - b.delay) / 1.2));
      const e = 1 - (1 - p) * (1 - p);
      b.m.scale.setScalar(Math.max(0.001, b.target * (e * 1.08 - 0.08 * e * e)));
      b.l.intensity = 1.6 * e;
    }
  });
  world.markers.restorationPlayed = true;
  return DURATION;
}

// The LIVE restoration: plays in the boss arena the moment the Shadowgrip
// falls, while the player is standing in it. Green rises around them and
// Cinder's ember climbs to the ridge. Returns total duration (seconds).
export async function emberRestorationLive(world) {
  const [fa, fb, bush] = await Promise.all([
    loadGLB('./assets/env/flower-a.glb'),
    loadGLB('./assets/env/flower-b.glb'),
    loadGLB('./assets/env/bush-large.glb'),
  ]);
  const spots = [[-3, 4.4], [3, 4.4], [-5.2, -1], [5.2, -1], [-2.4, -4.2], [2.4, -4.2], [0, 2.6], [5.7, 3.4]];
  const sprouts = spots.map(([x, z], i) => {
    const src = i % 3 === 2 ? bush : (i % 2 === 0 ? fa : fb);
    const m = naturalTint(prepareModel(src.scene.clone(), { castShadow: false }));
    m.position.set(x, 0, z);
    m.rotation.y = (i * 2.1) % (Math.PI * 2);
    m.scale.setScalar(0.001);
    world.add(m);
    return { m, delay: 0.6 + i * 0.5, target: src === bush ? 1.05 : 1.3 };
  });
  // Cinder's ember rises from where the grip held it toward the north ridge
  const ember = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.26, 1),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb25a, emissiveIntensity: 3.2, roughness: 1 })
  );
  ember.position.set(0, 1.2, -0.5);
  const glow = new THREE.PointLight(0xffc27a, 8, 13, 1.8);
  glow.position.copy(ember.position);
  world.add(ember); world.add(glow);

  const DURATION = 9;
  let t = 0;
  world.onAnimate((tt, dt) => {
    t += dt;
    for (const s of sprouts) {
      const p = Math.min(1, Math.max(0, (t - s.delay) / 1.1));
      const e = 1 - (1 - p) * (1 - p); // ease-out grow, slight overshoot pop
      s.m.scale.setScalar(Math.max(0.001, s.target * (e * 1.08 - 0.08 * e * e)));
    }
    const f = Math.min(1, t / 4.5);
    const ef = f * f * (3 - 2 * f); // smoothstep climb
    ember.position.set(0, 1.2 + ef * 2.4, -0.5 - ef * 5.2);
    ember.position.y += Math.sin(t * 1.7) * 0.06; // gentle bob, always
    glow.position.copy(ember.position);
  });
  world.markers.restorationPlayed = true;
  return DURATION;
}

// ---------------------------------------------------------------------------
// THE WILD WOODS (region 3, v3.19) — a thorn-corrupted forest. Seven rooms,
// two puzzle DOORS that build on learned skills (dad's brief): the Gloomwood
// opens to LANTERN-LIGHTING (Fire Wolf slams — one lantern hides behind
// cracked rock, chaining the Earth Wolf first), the Rootbound Door opens to
// TWIN boulders on TWIN plates (the Stoneroot skill, now with routing).
// Sylva, the forest's own great wolf, waits thornbound at the heart.
// ---------------------------------------------------------------------------

let fkit = null;
async function loadForestKit() {
  if (fkit) return fkit;
  const base = './assets/env/forest/';
  const names = {
    tree1: 'Tree_1_A.gltf', tree2: 'Tree_2_B.gltf', tree3: 'Tree_3_A.gltf', tree4: 'Tree_4_B.gltf',
    bare1: 'Tree_Bare_1_A.gltf', bare2: 'Tree_Bare_2_A.gltf',
    bush1: 'Bush_1_A.gltf', bush2: 'Bush_2_C.gltf', bush3: 'Bush_4_B.gltf',
    rock1: 'Rock_1_F.gltf', rock2: 'Rock_2_C.gltf', rock3: 'Rock_3_H.gltf',
    grass1: 'Grass_1_A.gltf', grass2: 'Grass_2_B.gltf',
  };
  const entries = await Promise.all(
    Object.entries(names).map(async ([k, f]) => [k, await loadGLB(base + f)])
  );
  fkit = Object.fromEntries(entries);
  return fkit;
}

// Forest shell: mossy ground + a border of TREES with door gaps. The SOUTH
// edge uses low bushes + rocks instead of tall trees (blind-strip law: the
// camera looks north over the south border — nothing tall may live there).
function buildForestShell(world, w, d, gaps = []) {
  const halfW = w / 2, halfD = d / 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 8, d + 8),
    new THREE.MeshStandardMaterial({ color: 0x36502b, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  const inGap = (side, coord) =>
    gaps.some((g) => g.side === side && coord > g.from && coord < g.to);

  // tree border (n/w/e) — three species interleaved, deterministic jitter
  const treeP = { tree1: [], tree2: [], bare1: [] };
  const keys = ['tree1', 'tree2', 'tree1', 'bare1', 'tree2'];
  let ti = 0;
  const addTree = (x, z, side, coord) => {
    if (inGap(side, coord)) return;
    const k = keys[ti++ % keys.length];
    treeP[k].push({
      x: x + ((ti * 13) % 5 - 2) * 0.12, z: z + ((ti * 7) % 5 - 2) * 0.12,
      ry: (ti % 8) * 0.8, s: 1.1 + (ti % 3) * 0.2,
    });
  };
  for (let tx = 0; tx <= w; tx += 1.6) {
    addTree(tx - halfW, -halfD - 0.6, 'n', tx - halfW);
  }
  for (let tz = 0; tz <= d; tz += 1.6) {
    addTree(-halfW - 0.6, tz - halfD, 'w', tz - halfD);
    addTree(halfW + 0.6, tz - halfD, 'e', tz - halfD);
  }
  for (const [k, ps] of Object.entries(treeP)) {
    if (ps.length) world.add(instancePlacements(fkit[k].scene, ps));
  }
  // low south border: bushes + rocks (never taller than Kael)
  const bushP = [], rockP = [];
  for (let tx = 0; tx <= w; tx += 1.3) {
    const coord = tx - halfW;
    if (inGap('s', coord)) continue;
    (tx % 2.6 < 1.3 ? bushP : rockP).push({
      x: coord, z: halfD + 0.55, ry: tx * 1.7, s: 1.15 + (tx % 2) * 0.25,
    });
  }
  if (bushP.length) world.add(instancePlacements(fkit.bush2.scene, bushP));
  if (rockP.length) world.add(instancePlacements(fkit.rock2.scene, rockP));

  // colliders, split around gaps (same segment logic as every shell)
  const segments = (side, lo, hi) => {
    const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
    let start = lo;
    const out = [];
    for (const c of cuts) {
      if (c.from > start) out.push([start, c.from]);
      start = c.to;
    }
    if (start < hi) out.push([start, hi]);
    return out;
  };
  for (const [a, b] of segments('n', -halfW - 1, halfW + 1)) world.addBox(a, b, -halfD - 1.3, -halfD + 0.1);
  for (const [a, b] of segments('s', -halfW - 1, halfW + 1)) world.addBox(a, b, halfD - 0.1, halfD + 1.3);
  for (const [a, b] of segments('w', -halfD - 1, halfD + 1)) world.addBox(-halfW - 1.3, -halfW + 0.1, a, b);
  for (const [a, b] of segments('e', -halfD - 1, halfD + 1)) world.addBox(halfW - 0.1, halfW + 1.3, a, b);

  // scattered grass tufts — the floor feels alive for one instanced draw
  const tufts = [];
  for (let i = 0; i < 16; i++) {
    tufts.push({
      x: ((i * 37) % (w - 2)) - halfW + 1, z: ((i * 23) % (d - 2)) - halfD + 1,
      ry: i * 1.3, s: 0.9 + (i % 3) * 0.25,
    });
  }
  world.add(instancePlacements(fkit.grass1.scene, tufts, { castShadow: false }));

  // drifting wisp-motes: the woods breathe (six cheap glow dots)
  const motes = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.05, 0),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xbfffc8, emissiveIntensity: 1.5, roughness: 1 })
    );
    world.add(m);
    motes.push({ m, p: i * 1.05 });
  }
  world.onAnimate((t) => {
    for (const mo of motes) {
      mo.m.position.set(
        Math.sin(t * 0.21 + mo.p * 5) * (halfW - 1.5),
        0.8 + Math.sin(t * 0.9 + mo.p * 3) * 0.4,
        Math.cos(t * 0.17 + mo.p * 4) * (halfD - 1.5)
      );
    }
  });
  return { halfW, halfD };
}

// A thorn-wood gate across a door gap — three dark tangles that tear away
// when open() is called (the forest's version of rising bars).
function thornGate(world, x, z, span = 2.6) {
  const group = new THREE.Group();
  for (const [ox, s, ry] of [[-span * 0.33, 1.35, 0.6], [0, 1.5, 2.4], [span * 0.33, 1.3, 4.2]]) {
    const b = prepareModel(fkit.bush3.scene.clone());
    b.position.set(x + ox, 0, z);
    b.rotation.y = ry;
    b.scale.setScalar(s);
    b.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      if (n.material.color) n.material.color.setHex(0x28381e); // dark thorn
    });
    group.add(b);
  }
  world.add(group);
  const collider = { minX: x - span / 2 - 0.4, maxX: x + span / 2 + 0.4, minZ: z - 0.8, maxZ: z + 0.8 };
  world.boxColliders.push(collider);
  return {
    open: (silent = false) => {
      world.root.remove(group);
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      if (!silent) {
        audio.play('gate-creak', { volume: 0.85, rate: 0.7 });
        audio.play('puff', { volume: 0.8, rate: 1.1 });
      }
    },
  };
}

// inner clumps of trees/bushes with colliders — the woods' walls and cover
function grove(world, spots) {
  for (const [kind, x, z, s, ry, cr] of spots) {
    const m = prepareModel(fkit[kind].scene.clone());
    m.position.set(x, 0, z);
    m.rotation.y = ry || 0;
    m.scale.setScalar(s || 1.2);
    world.add(m);
    if (cr) world.addCircle(x, z, cr);
  }
}

// --- w1 — The Thorn Gate (entry: the woods gone wrong; first thorn hounds)
async function buildW1(scene) {
  const world = new World(scene);
  await loadForestKit();
  buildForestShell(world, 18, 12, [
    { side: 's', from: -1.2, to: 1.2 }, // back to the Warden's Crypt
    { side: 'n', from: -1.2, to: 1.2 }, // deeper: the Gloomwood
    { side: 'e', from: -1.2, to: 1.2 }, // the Mossy Dell (branch)
  ]);
  world.spawn = { x: 0, z: 4.2, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 5.85, 7.2, 'e3', { x: 5.5, z: -4.6, angle: 0 });
  world.addDoor(-1.2, 1.2, -7.2, -5.85, 'w2', { x: 0, z: 5.6, angle: Math.PI });
  world.addDoor(8.85, 10.2, -1.2, 1.2, 'w1b', { x: -6.0, z: 0, angle: Math.PI / 2 });

  grove(world, [
    ['tree3', -5.8, -3.6, 1.4, 0.7, 0.55], ['tree4', 5.6, -4.0, 1.5, 2.1, 0.6],
    ['bare2', -3.0, -0.8, 1.3, 1.2, 0.5], ['bush1', 3.2, 2.4, 1.4, 0.4, 0],
    ['rock3', -6.8, 1.0, 1.5, 2.8, 0.7], ['bush3', 6.9, 2.6, 1.3, 3.4, 0],
  ]);
  world.markers.houndSpots = [
    { x: -4.0, z: -1.2, variant: 'thorn' }, { x: 4.4, z: 0.6, variant: 'thorn' },
  ];
  world.markers.mothSpots = [{ x: -1.6, z: -3.6, variant: 'wisp' }];
  checkpoint(world, 'cp_w1', -6.6, 3.2);
  potionPickup(world, 6.6, 3.4);
  world.markers.chestDefs = [
    { id: 'c_w1_gate', tier: 'wood', x: -7.6, z: -4.4, ry: 1.1, loot: { shards: 12 } },
  ];
  world.markers.breakables = [
    { x: 7.4, z: -4.8, kind: 'crate', shards: 3 },
    { x: -2.2, z: 3.4, kind: 'crate', shards: 2 },
  ];
  return world;
}

// --- w1b — The Mossy Dell (branch: pup + the ICE-SEALED SPRING, region 4's
// promise — frost's lock shown a region early, per the lock-before-key law)
async function buildW1b(scene) {
  const world = new World(scene);
  await loadForestKit();
  buildForestShell(world, 14, 10, [
    { side: 'w', from: -1.2, to: 1.2 }, // back to the Thorn Gate
  ]);
  world.spawn = { x: -6, z: 0, angle: Math.PI / 2 };
  world.addDoor(-8.2, -6.85, -1.2, 1.2, 'w1', { x: 8.2, z: 0, angle: -Math.PI / 2 });

  grove(world, [
    ['tree2', -2.4, -3.4, 1.4, 0.9, 0.55], ['tree1', 2.8, 2.2, 1.3, 1.7, 0.5],
    ['bush1', 0.4, -1.4, 1.5, 2.2, 0], ['rock1', -4.2, 2.6, 1.4, 0.8, 0.6],
  ]);
  // a rock spur walls a little nook; the frozen spring seals its doorway
  blockRowRocks(world, 4.6, -1.8, 7.0, -1.8);
  iceGate(world, 5.0, -3.2, 'w_ice');
  world.markers.chestDefs = [
    // visible past the ice — region 4's promise reward
    { id: 'c_w1b_ice', tier: 'gold', x: 6.4, z: -3.2, ry: -1.6, loot: { shards: 20, heartPiece: 1 } },
    { id: 'c_w1b_dell', tier: 'wood', x: -6.4, z: -3.8, ry: 0.8, loot: { shards: 10, potion: 1 } },
  ];
  world.markers.slimeSpots = [
    { x: -1.8, z: 2.6, variant: 'bramble' }, { x: 2.4, z: -2.8, variant: 'bramble' },
  ];
  world.markers.pup7Spot = { x: -2.0, z: -3.6 };
  world.markers.breakables = [{ x: 6.6, z: 2.6, kind: 'barrel', shards: 3 }];
  return world;
}

// --- w2 — The Gloomwood (PUZZLE DOOR 1: light the three wisp-lanterns.
// Fire Wolf slams — and one lantern hides behind CRACKED ROCK, so the kids
// chain Earth stomp → Fire slam. Dark room: the Dark Wolf's eyes help hunt
// the cold lanterns down. Skills from regions 1+2, braided.)
async function buildW2(scene) {
  const world = new World(scene);
  await loadForestKit();
  buildForestShell(world, 18, 14, [
    { side: 's', from: -1.2, to: 1.2 }, // back to the Thorn Gate
    { side: 'n', from: -1.3, to: 1.3 }, // the Rootbound Door (thorn-sealed)
    { side: 'e', from: -1.2, to: 1.2 }, // the Hollow Oak (branch)
  ]);
  world.spawn = { x: 0, z: 5.2, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 6.85, 8.2, 'w1', { x: 0, z: -4.9, angle: 0 });
  world.addDoor(-1.3, 1.3, -8.2, -6.85, 'w3', { x: 0, z: 5.6, angle: Math.PI });
  world.addDoor(8.85, 10.2, -1.2, 1.2, 'w2b', { x: -5.0, z: 0, angle: Math.PI / 2 });

  // the gloom: whole-room twilight — lantern light (and wolf eyes) matter
  darkZone(world, -8.9, 8.9, -6.9, 6.9);
  const fire = prepareModel(kit.campfire.scene.clone());
  fire.position.set(-1.8, 0, 4.6);
  world.add(fire);
  const fl = new THREE.PointLight(0xffa04a, 2.4, 7, 1.8);
  fl.position.set(-1.8, 1.2, 4.6);
  world.add(fl);
  world.onAnimate((t) => { fl.intensity = 2.2 + Math.sin(t * 7.1) * 0.4; });

  grove(world, [
    ['tree4', -6.2, -2.6, 1.5, 1.1, 0.6], ['tree2', 6.4, -3.8, 1.4, 2.6, 0.55],
    ['bare1', 3.4, 0.8, 1.3, 0.5, 0.5], ['bush1', -3.8, 1.8, 1.4, 1.9, 0],
    ['rock3', 7.2, 3.2, 1.4, 0.4, 0.65],
  ]);

  // THE THREE WISP-LANTERNS (cold braziers — the Fire Wolf's slam wakes them)
  const lit = () => !!WS.get('wild', 'lanterns');
  const gate = thornGate(world, 0, -7.05, 2.8);
  if (lit()) gate.open(true);
  let litCount = 0;
  const onLantern = () => {
    litCount++;
    audio.play('pup-chime', { volume: 0.7, rate: 1.1 + litCount * 0.15 }); // rising
    if (litCount >= 3 && !lit()) {
      WS.set('wild', 'lanterns');
      gate.open();
      audio.play('checkpoint', { volume: 0.9, rate: 1.2 });
    }
  };
  const L = [
    brazier(world, prepareModel, dkit.torch, 'w2_l1', -5.2, 1.6, onLantern),
    brazier(world, prepareModel, dkit.torch, 'w2_l2', 5.4, -1.2, onLantern),
    // the third hides in a rock pocket behind CRACKED STONE (Earth first!)
    brazier(world, prepareModel, dkit.torch, 'w2_l3', 0.5, -4.4, onLantern),
  ];
  if (lit()) {
    for (const b of L) { b.lit = true; b.flame.visible = true; b.light.intensity = 5; }
  }
  // the pocket: rock rows east+west, the cracked pile is the only way in
  blockRowRocks(world, -1.1, -6.4, -1.1, -3.1);
  blockRowRocks(world, 2.1, -6.4, 2.1, -3.1);
  crackedRocks(world, 'w2_lantern', 0.5, -2.6);
  world.markers.crackSpot = { x: 0.5, z: -2.6 };
  world.markers.lanternSpots = L.map((b) => ({ x: b.x, z: b.z }));

  world.markers.mothSpots = [
    { x: -3.4, z: -2.2, variant: 'wisp' }, { x: 4.2, z: 2.6, variant: 'wisp' },
  ];
  world.markers.houndSpots = [{ x: 2.6, z: -0.6, variant: 'thorn' }];
  checkpoint(world, 'cp_w2', -6.8, 3.8);
  world.markers.chestDefs = [
    { id: 'c_w2_gloom', tier: 'wood', x: -7.6, z: -5.4, ry: 1.3, loot: { shards: 14, potion: 1 } },
  ];
  world.markers.breakables = [{ x: 6.8, z: 4.0, kind: 'crate', shards: 3 }];
  return world;
}

// --- w2b — The Hollow Oak (branch: the Elder Thorn Hound guards a pup)
async function buildW2b(scene) {
  const world = new World(scene);
  await loadForestKit();
  buildForestShell(world, 12, 10, [
    { side: 'w', from: -1.2, to: 1.2 },
  ]);
  world.spawn = { x: -5, z: 0, angle: Math.PI / 2 };
  world.addDoor(-7.2, -5.85, -1.2, 1.2, 'w2', { x: 8.2, z: 0, angle: -Math.PI / 2 });

  // the great hollow oak itself
  grove(world, [
    ['tree4', -1.6, -1.8, 2.6, 0.8, 0.9],
    ['bush1', 1.8, 2.0, 1.4, 1.2, 0], ['rock2', 4.0, -0.6, 1.3, 2.2, 0.55],
  ]);
  world.markers.houndSpots = [{ x: 1.6, z: -0.4, variant: 'elderthorn' }];
  world.markers.pup8Spot = { x: 4.4, z: -3.4 };
  crackedRocks(world, 'w2b_alcove', -4.2, -3.2);
  world.markers.chestDefs = [
    ...(state.flags.cracked.w2b_alcove
      ? [{ id: 'c_w2b_oak', tier: 'gold', x: -5.2, z: -3.8, ry: 0.9, loot: { shards: 18, gear: 'hammer_a' } }]
      : []),
  ];
  world.markers.breakables = [{ x: 5.0, z: 2.8, kind: 'barrel', shards: 3 }];
  return world;
}

// --- w3 — The Rootbound Door (PUZZLE DOOR 2: TWIN boulders, TWIN plates.
// The Stoneroot skill grown up: a hedge splits the north half into two bays;
// each boulder must be routed through the center gap, then into ITS bay.)
async function buildW3(scene) {
  const world = new World(scene);
  await loadForestKit();
  buildForestShell(world, 18, 14, [
    { side: 's', from: -1.3, to: 1.3 }, // back to the Gloomwood
    { side: 'n', from: -1.3, to: 1.3 }, // the Bramble Heart (thorn-sealed)
  ]);
  world.spawn = { x: 0, z: 5.2, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 6.85, 8.2, 'w2', { x: 0, z: -6.4, angle: 0 });
  world.addDoor(-1.3, 1.3, -8.2, -6.85, 'w4', { x: 0, z: 4.6, angle: Math.PI });

  // THE HEDGE: a bush wall across the room with TWO narrow gaps (x ±3.4).
  // Each boulder starts OFFSET from its gap, so the route is a real plan:
  // push EAST to line up with a gap, NORTH through it, then a final turn
  // onto the plate. (Wrong-gap mistakes just mean re-entering to reset —
  // rooms rebuild, anti-soft-lock law.)
  bushRow(world, -8.9, -1.5, -4.75, -1.5); // west wall
  bushRow(world, -2.05, -1.5, 2.05, -1.5); // middle island
  bushRow(world, 4.75, -1.5, 8.9, -1.5);   // east wall

  boulder(world, -5.8, 2.2);
  boulder(world, 1.0, 2.2);
  pressurePlate(world, 'w3_p1', -4.6, -4.0, () => { if (world.checkRoot) world.checkRoot(); });
  pressurePlate(world, 'w3_p2', 4.6, -4.0, () => { if (world.checkRoot) world.checkRoot(); });
  world.markers.boulderSpot = { x: -5.8, z: 2.2 };

  const gate = thornGate(world, 0, -7.05, 2.8);
  const done = () => !!state.flags.plates.w3_p1 && !!state.flags.plates.w3_p2;
  if (done()) gate.open(true);
  world.checkRoot = () => {
    if (!done()) return;
    gate.open();
    audio.play('checkpoint', { volume: 0.9, rate: 1.15 });
    world.checkRoot = null;
  };

  grove(world, [
    ['tree3', -6.8, -5.6, 1.4, 0.8, 0.55], ['tree1', 6.8, -5.8, 1.4, 2.0, 0.5],
    ['bush1', -6.4, 2.8, 1.4, 0.6, 0], ['rock1', 7.0, 2.6, 1.4, 1.6, 0.6],
  ]);
  world.markers.slimeSpots = [
    { x: -5.2, z: 0.8, variant: 'bramble' }, { x: 5.6, z: 1.4, variant: 'bramble' },
  ];
  checkpoint(world, 'cp_w3', -7.2, 3.6);
  world.markers.chestDefs = [
    { id: 'c_w3_root', tier: 'wood', x: -7.8, z: -6.0, ry: 1.2, loot: { shards: 14 } },
  ];
  world.markers.breakables = [{ x: 7.6, z: 4.0, kind: 'crate', shards: 2 }];
  return world;
}

// --- w4 — The Bramble Heart (the gauntlet; rest before the boss — law)
async function buildW4(scene) {
  const world = new World(scene);
  await loadForestKit();
  buildForestShell(world, 16, 12, [
    { side: 's', from: -1.3, to: 1.3 }, // back to the Rootbound Door
    { side: 'n', from: -1.3, to: 1.3 }, // Sylva's Glade
  ]);
  world.spawn = { x: 0, z: 4.6, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 5.85, 7.2, 'w3', { x: 0, z: -6.4, angle: 0 });
  world.addDoor(-1.3, 1.3, -7.2, -5.85, 'w5', { x: 0, z: 6.2, angle: Math.PI });

  grove(world, [
    ['bare1', -4.6, -2.2, 1.5, 0.7, 0.55], ['bare2', 4.8, -1.6, 1.5, 2.3, 0.55],
    ['tree2', -6.6, -4.4, 1.4, 1.1, 0.55], ['tree3', 6.6, -4.6, 1.4, 0.3, 0.55],
    ['bush3', -2.6, 0.8, 1.5, 1.8, 0], ['bush3', 2.8, -3.2, 1.4, 3.9, 0],
    ['rock3', -7.0, 0.6, 1.4, 2.4, 0.65],
  ]);
  // the thorn pack — the woods' last stand (attack tokens keep it a duel)
  world.markers.houndSpots = [
    { x: -3.6, z: -3.0, variant: 'thorn' }, { x: 3.8, z: -2.4, variant: 'thorn' },
    { x: 0.4, z: -0.8, variant: 'elderthorn' },
  ];
  world.markers.slimeSpots = [{ x: -5.4, z: 1.8, variant: 'bramble' }];
  world.markers.mothSpots = [{ x: 5.6, z: 0.8, variant: 'wisp' }];
  world.markers.pup9Spot = { x: 7.0, z: -4.6 };
  // rest before the door (contract law): flame + potion side by side
  checkpoint(world, 'cp_w4', -1.9, -3.4);
  potionPickup(world, 1.9, -3.4);
  world.markers.bossDoorSpot = { x: 0, z: -5.6 };
  world.markers.breakables = [
    { x: -7.0, z: 3.6, kind: 'crate', shards: 3 }, { x: 7.2, z: 3.8, kind: 'barrel', shards: 3 },
  ];
  return world;
}

// --- w5 — Sylva's Glade (the boss; then the grant + the healing)
async function buildW5(scene) {
  const world = new World(scene);
  await loadForestKit();
  // Once Sylva is free the thorns part in the north and the WAY UP opens:
  // the treeline gives out and Frostpeak begins (region 4).
  const onward = !!state.flags.sylvaDefeated;
  buildForestShell(world, 16, 16, [
    { side: 's', from: -1.3, to: 1.3 }, // back to the Bramble Heart
    ...(onward ? [{ side: 'n', from: -1.3, to: 1.3 }] : []), // up to the Rime Gate
  ]);
  world.spawn = { x: 0, z: 6.2, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 7.85, 9.2, 'w4', { x: 0, z: -4.9, angle: 0 });
  if (onward) {
    world.addDoor(-1.3, 1.3, -9.2, -7.85, 'f1', { x: 0, z: 4.2, angle: Math.PI });
    world.markers.frostWaySpot = { x: 0, z: -6.6 };
  }

  // scattered cover — the duel weaves between old stones
  grove(world, [
    ['rock3', -4.6, -3.0, 1.6, 0.8, 0.75], ['rock3', 4.8, -2.6, 1.5, 2.2, 0.7],
    ['rock1', -4.2, 2.6, 1.5, 1.2, 0.65], ['rock1', 4.4, 3.0, 1.5, 3.1, 0.65],
    ['tree4', -6.9, -6.4, 1.6, 0.5, 0.7], ['tree4', 6.9, -6.6, 1.6, 1.9, 0.7],
  ]);

  if (!state.flags.sylvaDefeated) {
    world.markers.bossSpot = { x: 0, z: -0.5, skin: 'sylva' };
  } else {
    // THE HEALED GLADE: flowers bloom, her light rests free, treasure waits
    await (async () => {
      const [fa, fb] = await Promise.all([
        loadGLB('./assets/env/flower-a.glb'), loadGLB('./assets/env/flower-b.glb'),
      ]);
      const ps = [];
      for (let i = 0; i < 14; i++) {
        ps.push({ x: ((i * 29) % 12) - 6, z: ((i * 17) % 12) - 6, ry: i * 1.1, s: 1.1 });
      }
      world.add(instancePlacements((i => i % 2 ? fa : fb)(1).scene, ps.slice(0, 7)));
      world.add(instancePlacements(fb.scene, ps.slice(7)));
    })();
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.24, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xb8ffc8, emissiveIntensity: 2.2, roughness: 1 })
    );
    heart.position.set(0, 1.4, -2.5);
    world.add(heart);
    const hl = new THREE.PointLight(0xb8ffc8, 5, 11, 1.8);
    hl.position.set(0, 1.7, -2.5);
    world.add(hl);
    world.onAnimate((t) => { heart.position.y = 1.4 + Math.sin(t * 1.5) * 0.14; heart.rotation.y = t * 0.8; });
    world.markers.sylvaShrine = { x: 0, z: -2.5 };
    world.markers.healed = true;
  }
  // GRANT + 30s law: the moment the Verdant Wolf is earned, a bramble
  // tangle RIGHT HERE hides gold — cut it with the new lash immediately
  brambleGate(world, prepareModel, kit.bush, 'w5_reward', 5.6, -5.2, 'wild');
  world.markers.chestDefs = [
    ...(state.flags.sylvaDefeated
      ? [{ id: 'c_w5_glade', tier: 'gold', x: -2.8, z: -3.4, ry: 0.7, loot: { shards: 30, powerup: 'star' } }]
      : []),
    { id: 'c_w5_bramble', tier: 'gold', x: 6.6, z: -5.8, ry: -2.2, loot: { shards: 22, heartPiece: 1 } },
  ];
  checkpoint(world, 'cp_w5', -6.6, 5.4);
  return world;
}

// small helpers the Wild Woods rooms lean on
function bushRow(world, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const count = Math.max(1, Math.round(len / 0.95));
  const ps = [];
  for (let i = 0; i <= count; i++) {
    const f = i / count;
    ps.push({ x: x0 + dx * f, z: z0 + dz * f, ry: i * 2.1, s: 1.25 + (i % 2) * 0.2 });
  }
  world.add(instancePlacements(fkit.bush3.scene, ps));
  const pad = 0.55;
  world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad, Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
}

function blockRowRocks(world, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const count = Math.max(1, Math.round(len / 1.1));
  for (let i = 0; i <= count; i++) {
    const f = i / count;
    const m = prepareModel(fkit.rock3.scene.clone());
    m.position.set(x0 + dx * f, 0, z0 + dz * f);
    m.rotation.y = i * 1.9;
    m.scale.setScalar(1.35 + (i % 2) * 0.2);
    world.add(m);
  }
  const pad = 0.6;
  world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad, Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
}

// ---------------------------------------------------------------------------
// FROSTPEAK (region 4, v3.21) — the mountain above the woods. Seven rooms and
// two puzzle DOORS that braid every verb the kids already own:
//   • the Icebound Hall — braziers sealed in ice. FIRE BREATH melts the shell,
//     the FIRE SLAM lights the bowl. Two fire verbs, one door; and the cold
//     creeps back over anything melted but left unlit.
//   • the Frozen Lake — the Stoneroot boulders on ICE. A push no longer takes
//     one polite step; the stone SKIDS until a rock stops it. Line the lane
//     up first, then send it. (Kael never slides. That is on purpose.)
// Boreal, the Rimebound, circles the summit — the first boss that FLIES, so
// the region-1 law "bolts hit flyers for full damage" finally pays out.
// The Frost Wolf is her gift, which makes every ice block back down the
// mountain — including the Mossy Dell's frozen spring — a reason to return.
// ---------------------------------------------------------------------------

let skit = null;
async function loadSnowKit() {
  if (skit) return skit;
  const base = './assets/env/snow/';
  const names = {
    treeA: 'tree-snow-a.glb', treeB: 'tree-snow-b.glb', treeC: 'tree-snow-c.glb',
    rockL: 'rocks-large.glb', rockM: 'rocks-medium.glb', rockS: 'rocks-small.glb',
    pile: 'snow-pile.glb', bunker: 'snow-bunker.glb',
    flat: 'snow-flat.glb', flatL: 'snow-flat-large.glb',
  };
  const entries = await Promise.all(
    Object.entries(names).map(async ([k, f]) => [k, await loadGLB(base + f)])
  );
  skit = Object.fromEntries(entries);
  // The Holiday Kit's rocks sample a DIRT-BROWN cell of the shared colormap —
  // on snow they read as mud, not mountain. Drop the atlas on those three and
  // give them flat frost-slate (asset-multiplication law: recolour what we
  // already have rather than fetch another pack).
  // NOTE: every piece in this pack names its material "colormap", and
  // assets.js caches prepared materials BY NAME — so a recoloured rock must
  // also be RENAMED, or prepareModel hands it straight back the shared
  // texture-atlas material and the tint silently vanishes.
  // The drift pieces sample a dark cell of the same atlas — a snow ridge came
  // out looking like a wall of coal. They get flat SNOW instead. (Only the
  // firs keep the atlas: their two-tone bark/snow reads correctly.)
  for (const [k, hex] of [
    ['rockL', 0x9aabbd], ['rockM', 0xa6b6c6], ['rockS', 0xb2c0ce],
    ['pile', 0xf2f8ff], ['bunker', 0xe8f2fb], ['flat', 0xe4eef8], ['flatL', 0xe4eef8],
  ]) {
    skit[k].scene.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.name = 'snowrock_' + k;
      n.material.map = null;
      n.material.color.setHex(hex);
      n.material.roughness = 0.95;
      n.material.needsUpdate = true;
    });
  }
  return skit;
}

// FROST BRAMBLE — Frostpeak's reuse of verdant's own verb (gates.js's
// registerCuttable(), the Verdant Wolf's vine-lash / world.cutAt). Same
// code-built-primitives pattern as level5.js's stormBramble: a thorn tangle
// that survived up here needs no new asset and never checks GREY() — it's
// geometry, not a kit prop. W5 fix (2026-08-24): moved F2b's optional-nook
// gate off earth (crackedRocks) onto this, since Frostpeak's critical path
// already carries fire (F2) and needed a second earlier-form reuse that
// wasn't earth, to stop 'earth' running three straight regions (L2-L4).
function frostBramble(world, id, x, z, region = 'frost') {
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
  world.onAnimate((t) => {
    glint.position.y = 0.95 + Math.sin(t * 2.1) * 0.1;
    glint.rotation.y = t * 1.4;
  });
  const collider = { minX: x - 1.0, maxX: x + 1.0, minZ: z - 0.85, maxZ: z + 0.85 };
  world.boxColliders.push(collider);
  world.markers.brambleSpot = { x, z, id };
  registerCuttable(world, { id, x, z, region, group, collider });
  return { id, collider };
}

// Snow shell: a pale ground plane, a border of snow-laden firs (n/w/e) and —
// per the BLIND-STRIP LAW — nothing on the south edge taller than a snow
// drift, because the camera looks north straight over it.
function buildSnowShell(world, w, d, gaps = []) {
  const halfW = w / 2, halfD = d / 2;
  world.deckY = 0; // bare ground plane (height law)
  world.bgColor = 0x1b2735;
  // COLD LIGHT: the global rig is firelit (warm key, brown bounce) and it
  // turned the snow pink. Frostpeak asks for its own hues — a pale blue sky
  // bounce and a white-blue sun. Nothing else in the game changes.
  world.lightTint = { sky: 0xbcd4ea, ground: 0x6c7f96, key: 0xeaf4ff };

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 8, d + 8),
    new THREE.MeshStandardMaterial({ color: 0xeaf2fa, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  const inGap = (side, coord) =>
    gaps.some((g) => g.side === side && coord > g.from && coord < g.to);

  // fir border (n/w/e) — three shapes interleaved, deterministic jitter
  const treeP = { treeA: [], treeB: [], treeC: [] };
  const keys = ['treeA', 'treeB', 'treeA', 'treeC', 'treeB'];
  let ti = 0;
  const addTree = (x, z, side, coord) => {
    if (inGap(side, coord)) return;
    const k = keys[ti++ % keys.length];
    treeP[k].push({
      x: x + ((ti * 13) % 5 - 2) * 0.11, z: z + ((ti * 7) % 5 - 2) * 0.11,
      ry: (ti % 8) * 0.8, s: 1.15 + (ti % 3) * 0.18,
    });
  };
  for (let tx = 0; tx <= w; tx += 1.5) addTree(tx - halfW, -halfD - 0.6, 'n', tx - halfW);
  for (let tz = 0; tz <= d; tz += 1.5) {
    addTree(-halfW - 0.6, tz - halfD, 'w', tz - halfD);
    addTree(halfW + 0.6, tz - halfD, 'e', tz - halfD);
  }
  for (const [k, ps] of Object.entries(treeP)) {
    if (ps.length) world.add(instancePlacements(skit[k].scene, ps));
  }
  // low south border: drifts + small rocks, never taller than Kael's knee
  const pileP = [], rockP = [];
  for (let tx = 0; tx <= w; tx += 1.2) {
    const coord = tx - halfW;
    if (inGap('s', coord)) continue;
    (tx % 2.4 < 1.2 ? pileP : rockP).push({
      x: coord, z: halfD + 0.5, ry: tx * 1.7, s: 1.3 + (tx % 2) * 0.3,
    });
  }
  if (pileP.length) world.add(instancePlacements(skit.pile.scene, pileP));
  if (rockP.length) world.add(instancePlacements(skit.rockS.scene, rockP));

  // colliders, split around the gaps (the same segment logic every shell uses)
  const segments = (side, lo, hi) => {
    const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
    let start = lo;
    const out = [];
    for (const c of cuts) {
      if (c.from > start) out.push([start, c.from]);
      start = c.to;
    }
    if (start < hi) out.push([start, hi]);
    return out;
  };
  for (const [a, b] of segments('n', -halfW - 1, halfW + 1)) world.addBox(a, b, -halfD - 1.3, -halfD + 0.1);
  for (const [a, b] of segments('s', -halfW - 1, halfW + 1)) world.addBox(a, b, halfD - 0.1, halfD + 1.3);
  for (const [a, b] of segments('w', -halfD - 1, halfD + 1)) world.addBox(-halfW - 1.3, -halfW + 0.1, a, b);
  for (const [a, b] of segments('e', -halfD - 1, halfD + 1)) world.addBox(halfW - 0.1, halfW + 1.3, a, b);

  // wind-scoured drifts underfoot — flat snow patches, one instanced draw.
  // They are 0.1 tall, so they are kept OUT of the middle where plates live.
  const flats = [];
  for (let i = 0; i < 10; i++) {
    const fx = ((i * 41) % (w - 3)) - halfW + 1.5;
    const fz = ((i * 27) % (d - 3)) - halfD + 1.5;
    if (Math.abs(fx) < 2.2 && Math.abs(fz) < 5) continue; // keep the lanes clean
    flats.push({ x: fx, z: fz, ry: i * 1.4, s: 0.9 + (i % 3) * 0.2 });
  }
  if (flats.length) world.add(instancePlacements(skit.flat.scene, flats, { castShadow: false }));

  // FALLING SNOW: one Points cloud, ~90 flakes, recycled forever. Cheap on a
  // phone and it is the single thing that says "you are up the mountain".
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
  world.onAnimate((t, dt) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] -= vel[i] * dt;
      p[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.25; // the wind nudges them
      if (p[i * 3 + 1] < 0) {
        p[i * 3 + 1] = 6;
        p[i * 3] = (Math.random() * 2 - 1) * (halfW + 2);
        p[i * 3 + 2] = (Math.random() * 2 - 1) * (halfD + 2);
      }
    }
    geo.attributes.position.needsUpdate = true;
  });
  return { halfW, halfD };
}

// Snow rocks / drifts with colliders — Frostpeak's version of `grove`.
function drift(world, spots) {
  for (const [kind, x, z, s, ry, cr] of spots) {
    const m = prepareModel(skit[kind].scene.clone());
    m.position.set(x, 0, z);
    m.rotation.y = ry || 0;
    m.scale.setScalar(s || 1.2);
    world.add(m);
    if (cr) world.addCircle(x, z, cr);
  }
}

// A low snow ridge with a real collider — the wall that shapes the ice lanes.
function snowRidge(world, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const count = Math.max(1, Math.round(len / 1.15));
  const ps = [];
  for (let i = 0; i <= count; i++) {
    const f = i / count;
    ps.push({ x: x0 + dx * f, z: z0 + dz * f, ry: i * 2.3, s: 1.35 + (i % 2) * 0.2 });
  }
  world.add(instancePlacements(skit.bunker.scene, ps));
  const pad = 0.5;
  world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad, Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
}

// A frost gate across a doorway: three ice spurs that burst when open() runs.
// (The Wild Woods had thorns; the mountain has rime. Same grammar.)
//
// AND IT MUST NOT DRESS LIKE THE PROMISE ICE. This gate is only ever the
// ANSWER to a puzzle in its own room (f2's bowls, f3's plates) — but it wore
// the exact pale-ice look of the frost_wolf-only iceGates, one room after Pip
// says "we'll come back" over one of those and logs an "Ice sealing a way"
// mystery card. Dad read it precisely as taught: "you need the frost wolf to
// proceed" — a trap made of costume. So the puzzle gate carries the game's
// act-here grammar: a pulsing GOLD ring at its base, the same gold every
// plate and stomp-target wears, saying "this room opens me".
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
  world.onAnimate((t) => {
    mat.emissiveIntensity = 0.35 + 0.15 * Math.sin(t * 1.7 + x);
    ring.material.opacity = 0.38 + 0.2 * Math.sin(t * 2.6);
  });
  world.markers.frostDoorSpot = { x, z };   // the "this door answers the room" line
  const collider = { minX: x - span / 2 - 0.4, maxX: x + span / 2 + 0.4, minZ: z - 0.8, maxZ: z + 0.8 };
  world.boxColliders.push(collider);
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

// The frozen lake surface: a pale sheet laid just above the ground, and the
// flag that makes pushed boulders SKID (world.slickFloor).
function iceSheet(world, minX, maxX, minZ, maxZ) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa8d8f0, emissive: 0x5f9fd0, emissiveIntensity: 0.25,
    transparent: true, opacity: 0.7, roughness: 0.12, metalness: 0.1,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), mat);
  sheet.rotation.x = -Math.PI / 2;
  // HEIGHT LAW: the sheet sits at deck + 0.02, BELOW every plate decal
  // (base -0.015, glow +0.05, ring +0.04) so the plates still read.
  sheet.position.set((minX + maxX) / 2, world.deckY + 0.02, (minZ + maxZ) / 2);
  world.add(sheet);
  world.onAnimate((t) => { mat.emissiveIntensity = 0.2 + 0.08 * Math.sin(t * 1.1); });
  world.slickFloor = true;
  return sheet;
}

// --- f1 — The Rime Gate (entry: the air bites; the first rime hounds)
async function buildF1(scene) {
  const world = new World(scene);
  await loadSnowKit();
  buildSnowShell(world, 18, 12, [
    { side: 's', from: -1.3, to: 1.3 }, // back down to Sylva's Glade
    { side: 'n', from: -1.3, to: 1.3 }, // deeper: the Icebound Hall
    { side: 'e', from: -1.2, to: 1.2 }, // the Frozen Cairn (branch)
  ]);
  world.spawn = { x: 0, z: 4.2, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 5.85, 7.2, 'w5', { x: 0, z: -6.4, angle: 0 });
  world.addDoor(-1.3, 1.3, -7.2, -5.85, 'f2', { x: 0, z: 5.6, angle: Math.PI });
  world.addDoor(8.85, 10.2, -1.2, 1.2, 'f1b', { x: -5.6, z: 0, angle: Math.PI / 2 });

  drift(world, [
    ['rockL', -6.0, -3.4, 1.3, 0.7, 0.95], ['rockL', 6.0, -3.8, 1.25, 2.3, 0.9],
    ['rockM', -3.2, -0.6, 1.3, 1.2, 0.6], ['rockM', 3.6, 1.8, 1.25, 0.4, 0.6],
    ['pile', -7.0, 1.2, 1.6, 2.8, 0], ['pile', 7.0, 2.4, 1.5, 3.4, 0],
  ]);
  world.markers.houndSpots = [
    { x: -4.0, z: -1.4, variant: 'rime' }, { x: 4.4, z: 0.4, variant: 'rime' },
  ];
  world.markers.rimeSlimeSpots = [{ x: -1.4, z: -3.4 }];
  checkpoint(world, 'cp_f1', -6.8, 3.2);
  potionPickup(world, 6.6, 3.4);
  world.markers.chestDefs = [
    { id: 'c_f1_gate', tier: 'wood', x: -7.8, z: -4.6, ry: 1.1, loot: { shards: 14 } },
  ];
  world.markers.breakables = [
    { x: 7.4, z: -4.8, kind: 'crate', shards: 3 },
    { x: -2.4, z: 3.4, kind: 'crate', shards: 2 },
  ];
  return world;
}

// --- f1b — The Frozen Cairn (branch: a pup, and a chest sealed behind ice.
// The Frost Wolf is still up the mountain, so this is a PROMISE: come back.)
async function buildF1b(scene) {
  const world = new World(scene);
  await loadSnowKit();
  buildSnowShell(world, 14, 10, [
    { side: 'w', from: -1.2, to: 1.2 }, // back to the Rime Gate
  ]);
  world.spawn = { x: -5.6, z: 0, angle: Math.PI / 2 };
  world.addDoor(-8.2, -6.85, -1.2, 1.2, 'f1', { x: 8.2, z: 0, angle: -Math.PI / 2 });

  drift(world, [
    ['rockL', -2.6, -3.2, 1.35, 0.9, 0.95], ['rockM', 2.4, 2.4, 1.3, 1.7, 0.6],
    ['pile', 0.2, -1.2, 1.6, 2.2, 0], ['rockM', -4.4, 2.6, 1.25, 0.8, 0.6],
  ]);
  // the cairn nook: a rock spur walls it, the ice seals the only way in
  snowRidge(world, 4.4, -1.6, 6.9, -1.6);
  iceGate(world, 5.0, -3.2, 'f_cairn', 'frost');
  world.markers.chestDefs = [
    { id: 'c_f1b_ice', tier: 'gold', x: 6.3, z: -3.2, ry: -1.6, loot: { shards: 22, heartPiece: 1 } },
    { id: 'c_f1b_cairn', tier: 'wood', x: -6.2, z: -3.6, ry: 0.8, loot: { shards: 12, potion: 1 } },
  ];
  world.markers.slimeSpots = [{ x: -1.6, z: 2.6, variant: 'snowblob' }];
  world.markers.visoredWightSpots = [{ x: 2.6, z: -2.6 }];
  world.markers.pup10Spot = { x: -2.2, z: -3.4 };
  world.markers.breakables = [{ x: 6.4, z: 2.6, kind: 'barrel', shards: 3 }];
  return world;
}

// --- f2 — The Icebound Hall (PUZZLE DOOR 1: three braziers under ice.
// BREATHE to melt the shell, SLAM to light the bowl — two fire verbs
// chained. Anything melted and left unlit seals over again, so the kids
// learn to finish what they start. Kept BRIGHT on purpose: a timer and a
// dark room together is cruelty, not difficulty.)
async function buildF2(scene) {
  const world = new World(scene);
  await loadSnowKit();
  buildSnowShell(world, 18, 14, [
    { side: 's', from: -1.3, to: 1.3 }, // back to the Rime Gate
    { side: 'n', from: -1.3, to: 1.3 }, // the Frozen Lake (frost-sealed)
    { side: 'e', from: -1.2, to: 1.2 }, // the Glacier Nook (branch)
  ]);
  world.spawn = { x: 0, z: 5.2, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 6.85, 8.2, 'f1', { x: 0, z: -4.9, angle: 0 });
  world.addDoor(-1.3, 1.3, -8.2, -6.85, 'f3', { x: 0, z: 5.6, angle: Math.PI });
  world.addDoor(8.85, 10.2, -1.2, 1.2, 'f2b', { x: -5.0, z: 0, angle: Math.PI / 2 });

  const done = () => !!WS.get('frost', 'braziers');
  const gate = frostGate(world, 0, -7.05, 2.8);
  if (done()) gate.open(true);
  let litCount = 0;
  const onLit = () => {
    litCount++;
    audio.play('pup-chime', { volume: 0.7, rate: 1.1 + litCount * 0.15 }); // rising
    if (litCount >= 3 && !done()) {
      WS.set('frost', 'braziers');
      gate.open();
      audio.play('checkpoint', { volume: 0.9, rate: 1.2 });
    }
  };
  // gentle mode gets a far longer thaw before the cold wins back
  const REFREEZE = state.settings.easy ? 45 : 26;
  const B = [
    brazier(world, prepareModel, dkit.torch, 'f2_b1', -5.4, -1.2, onLit),
    brazier(world, prepareModel, dkit.torch, 'f2_b2', 0, -4.2, onLit),
    brazier(world, prepareModel, dkit.torch, 'f2_b3', 5.4, -1.2, onLit),
  ];
  if (done()) {
    for (const b of B) { b.lit = true; b.flame.visible = true; b.light.intensity = 5; }
  } else {
    for (const b of B) freezeBrazier(world, b, REFREEZE);
  }
  world.markers.brazierSpots = B.map((b) => ({ x: b.x, z: b.z }));

  drift(world, [
    ['rockL', -7.2, -4.6, 1.35, 1.1, 0.95], ['rockL', 7.2, -4.8, 1.3, 2.6, 0.9],
    ['rockM', -3.0, 2.6, 1.3, 0.5, 0.6], ['rockM', 3.2, 2.8, 1.25, 1.9, 0.6],
    ['pile', -7.6, 1.6, 1.6, 0.4, 0],
  ]);
  // one lone flyer, parked away from the braziers — flavour, not interference
  world.markers.mothSpots = [{ x: 6.6, z: 3.4, variant: 'frostmoth' }];
  world.markers.rimeMinionSpots = [{ x: -6.2, z: 3.2 }];
  checkpoint(world, 'cp_f2', -7.4, 3.6);
  potionPickup(world, 7.4, 3.6);
  world.markers.chestDefs = [
    { id: 'c_f2_hall', tier: 'wood', x: -8.0, z: -5.8, ry: 1.3, loot: { shards: 16, potion: 1 } },
  ];
  world.markers.breakables = [{ x: 7.8, z: 4.4, kind: 'crate', shards: 3 }];
  return world;
}

// --- f2b — The Glacier Nook (branch: an Elder Rime Hound stands over a pup)
async function buildF2b(scene) {
  const world = new World(scene);
  await loadSnowKit();
  buildSnowShell(world, 12, 10, [
    { side: 'w', from: -1.2, to: 1.2 },
  ]);
  world.spawn = { x: -5.0, z: 0, angle: Math.PI / 2 };
  world.addDoor(-7.2, -5.85, -1.2, 1.2, 'f2', { x: 8.2, z: 0, angle: -Math.PI / 2 });

  drift(world, [
    ['rockL', -1.8, -2.0, 1.7, 0.8, 1.15],
    ['pile', 1.8, 2.2, 1.6, 1.2, 0], ['rockM', 4.0, -0.8, 1.3, 2.2, 0.6],
  ]);
  world.markers.houndSpots = [{ x: 1.6, z: -0.4, variant: 'elderrime' }];
  world.markers.pup11Spot = { x: 4.4, z: -3.2 };
  frostBramble(world, 'f2b_alcove', -4.2, -3.0);
  world.markers.chestDefs = [
    ...(WS.get('frost', 'cut_f2b_alcove')
      ? [{ id: 'c_f2b_nook', tier: 'gold', x: -5.2, z: -3.6, ry: 0.9, loot: { shards: 20, gear: 'hammer_a' } }]
      : []),
  ];
  world.markers.breakables = [{ x: 4.8, z: 2.8, kind: 'barrel', shards: 3 }];
  return world;
}

// --- f3 — The Frozen Lake (PUZZLE DOOR 2: the Stoneroot boulders, but the
// lake is SLICK. One push and the stone skids until something stops it, so
// the plan comes first: send each boulder EAST/WEST into the rock that stops
// it dead in a lane, then NORTH up that lane onto its plate. A low snow
// ridge closes every other route, which is what makes the lanes readable.)
async function buildF3(scene) {
  const world = new World(scene);
  await loadSnowKit();
  buildSnowShell(world, 18, 14, [
    { side: 's', from: -1.3, to: 1.3 }, // back to the Icebound Hall
    { side: 'n', from: -1.3, to: 1.3 }, // the Windscour (frost-sealed)
  ]);
  world.spawn = { x: 0, z: 5.2, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 6.85, 8.2, 'f2', { x: 0, z: -6.4, angle: 0 });
  world.addDoor(-1.3, 1.3, -8.2, -6.85, 'f4', { x: 0, z: 5.6, angle: Math.PI });

  // the lake itself — everything inside it slides (Kael excepted, always)
  iceSheet(world, -8.6, 8.6, -6.6, 4.2);

  // THE RIDGE: no way north except the two lanes at x = ±3.
  //
  // LANE WIDTH IS A COLLIDER FACT, NOT A VISUAL ONE. These endpoints used to be
  // ±4.0 and ±2.0 — a 2.0u visual gap — but snowRidge pads its box collider by
  // 0.5u each side, so the real corridor was 1.0u while the pushable boulder's
  // collider is 1.24u wide (r 0.62). The puzzle was GEOMETRICALLY UNSOLVABLE:
  // every boulder wedged at the lane mouth, the plates could never be pressed,
  // and the f4 gate never opened — dad hit exactly this and read the sealed ice
  // as "I need the Frost Wolf" (which this level's boss awards; a perfect trap).
  // Kael (0.64u) fit through, which is why walking the room never revealed it.
  // Endpoints pulled back to leave a true 2.0u collider corridor — the metrics
  // zoo's MIN CORRIDOR — centred on the ±3.0 stopper rest points.
  snowRidge(world, -8.6, -1.5, -4.6, -1.5);
  snowRidge(world, -1.6, -1.5, 1.6, -1.5);
  snowRidge(world, 4.6, -1.5, 8.6, -1.5);

  // the STOPPERS: the rocks that catch a skidding boulder exactly in a lane
  // (boulder r 0.62 + rock r 0.75 → it comes to rest 1.37u short of centre,
  // which is x = ∓3.0 — dead in front of the gap. That is the whole trick.)
  // (scale 0.8 ≈ collider 0.75 — a stopper must LOOK exactly as wide as it
  // blocks, or the boulder appears to sink into it when it lands)
  drift(world, [
    ['rockM', -1.6, 1.6, 0.8, 0.6, 0.75],
    ['rockM', 1.6, 1.6, 0.8, 2.4, 0.75],
  ]);

  boulder(world, -7.0, 1.6);
  boulder(world, 7.0, 1.6);
  pressurePlate(world, 'f3_p1', -3.0, -4.6, () => { if (world.checkLake) world.checkLake(); });
  pressurePlate(world, 'f3_p2', 3.0, -4.6, () => { if (world.checkLake) world.checkLake(); });
  world.markers.boulderSpot = { x: -7.0, z: 1.6 };

  const gate = frostGate(world, 0, -7.05, 2.8);
  const solved = () => !!state.flags.plates.f3_p1 && !!state.flags.plates.f3_p2;
  if (solved()) gate.open(true);
  world.checkLake = () => {
    if (!solved()) return;
    gate.open();
    audio.play('checkpoint', { volume: 0.9, rate: 1.15 });
    world.checkLake = null;
  };

  drift(world, [
    ['rockL', -6.6, -5.0, 1.3, 0.8, 0.95], ['rockL', 7.6, -5.6, 1.3, 2.0, 0.9],
    ['pile', -7.8, 5.0, 1.6, 0.6, 0], ['pile', 7.8, 5.0, 1.5, 1.6, 0],
  ]);
  world.markers.slimeSpots = [{ x: -5.6, z: 3.2, variant: 'snowblob' }];
  world.markers.glacierWardenSpots = [{ x: 5.8, z: 3.4 }];
  checkpoint(world, 'cp_f3', -7.6, 3.8);
  world.markers.chestDefs = [
    { id: 'c_f3_lake', tier: 'wood', x: -8.0, z: -6.0, ry: 1.2, loot: { shards: 16 } },
  ];
  world.markers.breakables = [{ x: 8.0, z: 5.6, kind: 'crate', shards: 2 }];
  return world;
}

// --- f4 — The Windscour (the gauntlet; and the rest before the summit — law)
async function buildF4(scene) {
  const world = new World(scene);
  await loadSnowKit();
  buildSnowShell(world, 16, 12, [
    { side: 's', from: -1.3, to: 1.3 }, // back to the Frozen Lake
    { side: 'n', from: -1.3, to: 1.3 }, // Boreal's Eyrie
  ]);
  world.spawn = { x: 0, z: 4.6, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 5.85, 7.2, 'f3', { x: 0, z: -6.4, angle: 0 });
  world.addDoor(-1.3, 1.3, -7.2, -5.85, 'f5', { x: 0, z: 6.2, angle: Math.PI });

  drift(world, [
    ['rockL', -4.8, -2.4, 1.35, 0.7, 0.95], ['rockL', 4.8, -1.8, 1.3, 2.3, 0.9],
    ['rockM', -6.8, -4.2, 1.3, 1.1, 0.6], ['rockM', 6.8, -4.4, 1.3, 0.3, 0.6],
    ['pile', -2.6, 0.8, 1.6, 1.8, 0], ['pile', 2.8, -3.2, 1.5, 3.9, 0],
  ]);
  // the rime pack — the mountain's last stand before the summit
  world.markers.houndSpots = [
    { x: 3.8, z: -2.4, variant: 'rime' },
    { x: 0.4, z: -0.8, variant: 'elderrime' },
  ];
  world.markers.frostDragonlingSpots = [{ x: -3.6, z: -3.0 }];
  world.markers.slimeSpots = [{ x: -5.4, z: 1.8, variant: 'snowblob' }];
  world.markers.mothSpots = [{ x: 5.6, z: 0.8, variant: 'frostmoth' }];
  world.markers.pup12Spot = { x: -7.0, z: 2.6 };
  // one more ice-sealed promise, in plain sight of the boss door
  iceGate(world, 7.0, 1.6, 'f_scour', 'frost');
  // rest before the door (contract law): flame + potion side by side
  checkpoint(world, 'cp_f4', -1.9, -3.4);
  potionPickup(world, 1.9, -3.4);
  world.markers.bossDoorSpot = { x: 0, z: -5.6 };
  world.markers.chestDefs = [
    { id: 'c_f4_scour', tier: 'gold', x: 7.0, z: 3.0, ry: -1.4, loot: { shards: 24, heartPiece: 1 } },
  ];
  world.markers.breakables = [
    { x: -7.2, z: 4.0, kind: 'crate', shards: 3 }, { x: 7.4, z: 4.2, kind: 'barrel', shards: 3 },
  ];
  return world;
}

// --- f5 — Boreal's Eyrie (the summit; the first boss that FLIES)
async function buildF5(scene) {
  const world = new World(scene);
  await loadSnowKit();
  // THE WAY ON. Once Boreal is calmed the summit's north side opens: the cliff
  // path down off the mountain and out onto the Stormreach sea cliffs.
  const onward = !!state.flags.borealDefeated;
  buildSnowShell(world, 18, 18, [
    { side: 's', from: -1.3, to: 1.3 }, // back to the Windscour
    ...(onward ? [{ side: 'n', from: -1.3, to: 1.3 }] : []),
  ]);
  world.spawn = { x: 0, z: 7.2, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 8.85, 10.2, 'f4', { x: 0, z: -4.9, angle: 0 });
  if (onward) world.addDoor(-1.3, 1.3, -10.2, -8.85, 's1a', { x: 0, z: 9, angle: Math.PI });

  // Standing stones round the RIM only — cover to break a dive line, never a
  // maze. They are pushed right out to the edges on purpose: a dive that ends
  // on top of a boulder buries the gold punish ring, and that ring is the
  // whole fight. The middle stays clear ground for her to crash onto.
  drift(world, [
    ['rockL', -7.4, -4.4, 1.35, 0.8, 0.95], ['rockL', 7.4, -4.2, 1.3, 2.2, 0.9],
    ['rockL', -7.2, 4.4, 1.3, 1.2, 0.9], ['rockL', 7.2, 4.6, 1.3, 3.1, 0.9],
    ['rockM', -7.9, -7.4, 1.3, 0.5, 0.6], ['rockM', 7.9, -7.6, 1.3, 1.9, 0.6],
  ]);

  if (!state.flags.borealDefeated) {
    world.markers.bossSpot = { x: 0, z: -1.0, kind: 'boreal' };
  } else {
    // THE CALMED SUMMIT: the storm lifts, her rime-light rests on the stones
    world.bgColor = 0x2c4560;
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.24, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9be3ff, emissiveIntensity: 2.2, roughness: 1 })
    );
    heart.position.set(0, 1.4, -2.5);
    world.add(heart);
    const hl = new THREE.PointLight(0x9be3ff, 5, 12, 1.8);
    hl.position.set(0, 1.7, -2.5);
    world.add(hl);
    world.onAnimate((t) => { heart.position.y = 1.4 + Math.sin(t * 1.5) * 0.14; heart.rotation.y = t * 0.8; });
    world.markers.borealShrine = { x: 0, z: -2.5 };
    world.markers.healed = true;
  }
  // GRANT + 30s law: the instant the Frost Wolf is earned there is ice RIGHT
  // HERE to shatter with it — the new verb pays out before the kid leaves
  iceGate(world, 6.4, -6.0, 'f_eyrie', 'frost');
  world.markers.chestDefs = [
    ...(state.flags.borealDefeated
      ? [{ id: 'c_f5_summit', tier: 'gold', x: -3.0, z: -3.6, ry: 0.7, loot: { shards: 32, powerup: 'star' } }]
      : []),
    { id: 'c_f5_ice', tier: 'gold', x: 7.6, z: -6.4, ry: -2.2, loot: { shards: 26, heartPiece: 1 } },
  ];
  checkpoint(world, 'cp_f5', -7.4, 6.4);
  return world;
}

// LEVEL 1 REBUILD (design/LEVEL-MAP.md). The `l*` rooms are the expanded,
// non-linear Ember Hollow. They live ALONGSIDE r1/r2/r3 rather than replacing
// them: r1/r2/r3 are what kids are playing right now, and a greybox is not
// something you ship to a child. Reached from the cheat menu until dressed
// and approved. Nothing existing was rescaled (dad's law).
export const ROOMS = { ...LEVEL1_ROOMS, ...LEVEL2_ROOMS, ...LEVEL3_ROOMS, ...LEVEL5_ROOMS, ...LEVEL6_ROOMS, ...LEVEL7_ROOMS, r1: buildR1, r1b: buildR1b, r2: buildR2, r2b: buildR2b, k1: buildK1, ka: buildKa, kb: buildKb, r3: buildR3, den: buildDen, e1: buildE1, e1b: buildE1b, e2: buildE2, e2b: buildE2b, e3: buildE3, w1: buildW1, w1b: buildW1b, w2: buildW2, w2b: buildW2b, w3: buildW3, w4: buildW4, w5: buildW5, f1: buildF1, f1b: buildF1b, f2: buildF2, f2b: buildF2b, f3: buildF3, f4: buildF4, f5: buildF5 };

export async function buildRoom(rawId, scene) {
  const id = resolveRoom(rawId);
  // Greybox spaces are plain geometry by definition — loading a 40-piece art
  // kit for them would both waste the load and hide the real cost of the box.
  if (id === 'zoo') {
    // the metrics zoo is greybox forever; it exists to measure, not to dress
  } else if (id[0] === 'l') {
    if (state.settings.greybox === false) await loadEmberKit();
  } else if (id[0] === 'v') {
    if (state.settings.greybox === false) await loadCaveKit();
  } else if (id[0] === 't') {
    if (state.settings.greybox === false) await loadWoodKit();
  } else if (id[0] === 's') {
    if (state.settings.greybox === false) await loadSkyKit();
  } else if (id[0] === 'd' && id !== 'den') {
    if (state.settings.greybox === false) await loadValeKit();
  } else if (id[0] === 'x') {
    if (state.settings.greybox === false) await loadCourtKit();
  } else {
    await loadKit();
    if (id[0] === 'e' || id[0] === 'k' || id[0] === 'w' || id[0] === 'f') await loadDungeonKit();
  }
  setRoomSeed(id);          // the ground painter seeds off the room id
  const world = await ROOMS[id](scene);
  // js/level{1,2,3,5,6,7}.js's own base() already stamps this (harmless
  // duplicate here) — but the legacy rooms defined directly in THIS file
  // (den, e1-e3, w1-w5, f1-f5, r1-r3, k1/ka/kb, zoo) never did, so
  // world.roomId sat undefined for all of them. Any reader that trusts it as
  // "the room actually built" (window.__wk.room, every test harness's own
  // go() helper) waited forever on those ids — stamping it here, once, for
  // every room regardless of which builder made it, is the fix.
  world.roomId = id;
  await spawnEnemies(world);
  if (world.markers.bossSpot) {
    const bs = world.markers.bossSpot;
    if (bs.kind === 'meri') {
      // The Sunken Vale's guardian is a TIDE BLOB, enormous — the family the
      // kids have fought all region, so the hop and the helpless landing are
      // reads they already own.
      const slimeGltf = await loadGLB('./assets/chars/monsters/Slime.glb');
      new Shadowgrip(world, bs.x, bs.z, slimeGltf, 'meri');
    } else if (bs.kind === 'boreal') {
      // Frostpeak's guardian is no wolf — she FLIES, which is why bolts
      // (full damage to flyers, since region 1) finally decide a fight.
      const dragonGltf = await loadGLB('./assets/chars/monsters/Dragon.glb');
      new Boreal(world, bs.x, bs.z, dragonGltf);
    } else {
      // Giant-wolf duels wear the same class: the Shadowgrip in Ember, Sylva
      // the Thornbound in the Wild Woods (bosses fight like their family).
      const wolfGltf = await loadGLB('./assets/chars/wolf.gltf');
      new Shadowgrip(world, bs.x, bs.z, wolfGltf, bs.skin || 'shadowgrip');
    }
  }
  return world;
}
