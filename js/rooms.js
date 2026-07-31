// Ember Hollow — the three rooms from design/LEVEL-MAP.md, kit-bashed from
// real Kenney pieces. Rooms are rebuilt from scratch on every entry, which
// gives room-reset-on-re-entry (anti-soft-lock) for free; anything permanent
// (boss defeated, burnables burned, pups collected) lives in state.flags and
// is applied at build time.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareModel, prepareCharacter, instancePlacements } from './assets.js';
import { World } from './world.js';
import { state } from './state.js';
import { spawnEnemies } from './enemies.js';
import { Shadowgrip } from './boss.js';
import { audio } from './audio.js';
import { WS } from './worldstate.js';
import { boulderGate, waterGate, brazier } from './gates.js';

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
  if (coolable && state.flags.keys.ember) {
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
      cells.set(cx + '|' + cz, { x: cx, y: 0.02, z: cz, ry: ((cells.size * 7) % 4) * Math.PI / 2 });
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
  const group = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: 0xcfe0ee, transparent: true, opacity: 0.45, roughness: 0.3 })
  );
  glass.position.y = 0.22;
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.13, 0.18, 10),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff4a5a, emissiveIntensity: 1.8, roughness: 1 })
  );
  liquid.position.y = 0.17;
  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 })
  );
  cork.position.y = 0.41;
  group.add(glass, liquid, cork);
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
  world.addDoor(0.8, 3.2, 5.85, 6.9, 'den', { x: 0, z: -3.2, angle: 0 });
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
  world.markers.pup1Spot = { x: 6.4, z: 4.2 };
  world.markers.darkNookMouth = { x: 3.0, z: 4.0 };

  // Burnable cubby (SW corner): pocket walled off, mouth plugged by vines.
  blockRow(world, -4.0, 2.6, -4.0, 3.0, 1.5);        // east edge, above gap
  blockRow(world, -7.5, 2.5, -4.5, 2.5, 1.5);        // north edge of cubby
  burnable(world, 'r1_cubby', -3.95, 4.4);
  world.markers.pup3Spot = { x: -6.4, z: 4.6 };

  // Checkpoint CP1 at the exit, with a potion beside the fire
  checkpoint(world, 'cp1', 5.9, -4.4);
  potionPickup(world, 4.6, -3.6);

  kilnLandmark(world);

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
    { id: 'c_r1_cubby', tier: 'wood', x: -7.0, z: 3.6, ry: 0.8, loot: { shards: 12, potion: 1 } },
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
  blockRow(world, -3.2, 2.2, 2.2, 2.2, 1.5);     // lower run
  blockRow(world, -3.2, -0.6, -3.2, 2.2, 1.5);   // west spine between runs
  world.markers.breakables = [
    { x: -4.6, z: -4.6, kind: 'crate', shards: 2 },
    { x: 4.6, z: 4.6, kind: 'vase', shards: 3 },
  ];

  // dark ambush pockets — shades wait where the light dies
  darkZone(world, 1.0, 5.9, -5.9, -1.4);
  darkZone(world, -5.9, -1.0, 3.0, 5.9);
  world.markers.shadeSpots = [
    { x: 3.4, z: -4.8 }, { x: 4.8, z: -2.2 }, { x: -3.8, z: 4.4 },
  ];

  // the secret: a burnable clump walls off the treasure nook (rule 6)
  burnable(world, 'r1b_secret', 3.6, 3.6, 0.6);
  world.markers.chestDefs = [
    { id: 'c_r1b_maze', tier: 'wood', x: 5.0, z: 4.8, ry: 2.4, loot: { shards: 14, potion: 1 } },
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

async function buildDen(scene) {
  const world = new World(scene);
  const [tentGltf, cartGltf, treeA, treeB, flowerA, flowerB, mageGltf, generalAnims] =
    await Promise.all([
      loadGLB('./assets/env/den-survival/tent.glb'),
      loadGLB('./assets/env/den-town/cart.glb'),
      loadGLB('./assets/env/tree-a.glb'),
      loadGLB('./assets/env/tree-b.glb'),
      loadGLB('./assets/env/flower-a.glb'),
      loadGLB('./assets/env/flower-b.glb'),
      loadGLB('./assets/chars/mage.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
    ]);

  // green shell: fresh grass + mossy walls
  const halfW = 7, halfD = 5;
  const floorPlacements = [];
  for (let tx = 0; tx < 14; tx++) {
    for (let tz = 0; tz < 10; tz++) {
      floorPlacements.push({ x: tx - halfW + 0.5, z: tz - halfD + 0.5, ry: ((tx * 7 + tz * 13) % 4) * Math.PI / 2 });
    }
  }
  world.add(instancePlacements(kit.floor.scene, floorPlacements, {
    castShadow: false, materialTints: { grass: 0x5da05a },
  }));
  const wallPlacements = [];
  const addWall = (tx, tz, side, coord) => {
    if (side === 'n' && coord > -1.3 && coord < 1.3) return; // stairs up to R1
    wallPlacements.push({
      x: tx - halfW + 0.5, z: tz - halfD + 0.5,
      ry: (Math.abs(tx * 11 + tz * 5) % 4) * Math.PI / 2,
      sy: 1.7 + (Math.abs(tx * 31 + tz * 17) % 3) * 0.15,
    });
  };
  for (let tx = -1; tx <= 14; tx++) { addWall(tx, -1, 'n', tx - halfW + 0.5); addWall(tx, 10, 's', tx - halfW + 0.5); }
  for (let tz = 0; tz < 10; tz++) { addWall(-1, tz, 'w', 0); addWall(14, tz, 'e', 0); }
  world.add(instancePlacements(kit.cliff.scene, wallPlacements, {
    materialTints: { grass: 0x5da05a, dirt: 0x6a5a48 },
  }));
  world.addBox(-8, -1.4, -6, -5); world.addBox(1.4, 8, -6, -5); // north wall w/ gap
  world.addBox(-8, 8, 5, 6);
  world.addBox(-8, -7, -6, 6); world.addBox(7, 8, -6, 6);
  world.spawn = { x: 0, z: -3.2, angle: 0 };
  world.addDoor(-1.3, 1.3, -5.9, -4.85, 'r1', { x: 2, z: 4.6, angle: Math.PI });
  doorway(world, 0, -4.4, 'x');

  // warm heart campfire + tents + trees + flowers
  checkpoint(world, 'cp_den', 0, 0.4);
  for (const [gltf, x, z, s, ry] of [
    [tentGltf, -4.8, -2.6, 1.5, 0.6], [tentGltf, -5.2, 1.8, 1.4, 2.2],
    [treeA, 5.6, -3.6, 1.6, 0.4], [treeB, -2.8, 3.9, 1.5, 2.0], [treeA, 5.9, 3.4, 1.4, 3.4],
  ]) {
    const m = prepareModel(gltf.scene.clone());
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    m.scale.setScalar(s);
    // the Den keeps NATURAL colors — clone materials out of the volcanic cache
    m.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      if (n.material.name === 'grass') n.material.color.setHex(0x4e9a4a);
      if (n.material.name === 'dirt') n.material.color.setHex(0x8a6a48);
      if (n.material.name === 'foliage') n.material.color.setHex(0x4e9a4a);
    });
    world.add(m);
    world.addCircle(x, z, 0.6);
  }
  for (const [x, z] of [[-2.2, -1.6], [1.8, 1.8], [3.4, -1.2], [-3.6, 1.2], [4.6, 1.6]]) {
    const f = prepareModel(((x + z) % 2 === 0 ? flowerA : flowerB).scene.clone(), { castShadow: false });
    f.position.set(x, 0, z);
    f.scale.setScalar(1.3);
    f.traverse((n) => { if (n.isMesh) { n.material = n.material.clone(); } });
    world.add(f);
  }

  // The shopkeeper: a friendly mage by her cart
  const cart = prepareModel(cartGltf.scene.clone());
  cart.position.set(4.2, 0, -3.0);
  cart.rotation.y = -0.5;
  cart.scale.setScalar(1.1);
  world.add(cart);
  world.addCircle(4.2, -3.0, 0.7);
  const mage = prepareCharacter(SkeletonUtils.clone(mageGltf.scene));
  mage.scale.setScalar(0.5);
  mage.position.set(3.2, 0, -2.2);
  mage.rotation.y = 2.6;
  world.add(mage);
  const mixer = new THREE.AnimationMixer(mage);
  const idle = generalAnims.animations.find((c) => c.name === 'Idle_A');
  if (idle) mixer.clipAction(idle).play();
  world.onAnimate((t, dt) => mixer.update(dt));
  world.markers.shopSpot = { x: 3.2, z: -2.2 };

  // Luna's moonstone — the fast-travel waystone. Glows once there is
  // somewhere to travel (a second region freed).
  {
    const base = prepareModel(kit.rockSA.scene.clone());
    base.position.set(-4.6, 0, -3.4);
    base.scale.setScalar(1.6);
    base.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.color.setHex(0x8d93a8);
    });
    world.add(base);
    world.addCircle(-4.6, -3.4, 0.45);
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xa8bcff, emissiveIntensity: 2.2, roughness: 1,
      })
    );
    orb.position.set(-4.6, 1.0, -3.4);
    world.add(orb);
    const moonGlow = new THREE.PointLight(0xa8bcff, 4, 7, 1.9);
    moonGlow.position.set(-4.6, 1.3, -3.4);
    world.add(moonGlow);
    world.onAnimate((t) => {
      orb.position.y = 1.0 + Math.sin(t * 1.8) * 0.08;
      orb.rotation.y = t * 0.9;
      moonGlow.intensity = 3.4 + Math.sin(t * 2.7) * 0.9;
    });
    world.markers.travelSpot = { x: -4.6, z: -3.4 };
  }

  // training barrels (no loot — just for practicing swings)
  world.markers.breakables = [
    { x: -1.8, z: 2.8, kind: 'barrel', shards: 0 },
    { x: -0.6, z: 3.4, kind: 'barrel', shards: 0 },
  ];

  // Terranigma rule, home edition: the Den grows as regions are freed.
  // Stoneroot freed → the caverns' glowing mushrooms take root in the glade
  // and a third tent stands for new friends.
  await mushroomPatches(world, [[-6.2, 3.8], [5.2, -0.8, 1.3], [-1.4, -2.4]]);
  if (state.flags.wardenDefeated) {
    const t3 = prepareModel(tentGltf.scene.clone());
    t3.position.set(4.9, 0, 2.9);
    t3.rotation.y = -2.4;
    t3.scale.setScalar(1.4);
    t3.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      if (n.material.name === 'grass') n.material.color.setHex(0x4e9a4a);
      if (n.material.name === 'dirt') n.material.color.setHex(0x8a6a48);
    });
    world.add(t3);
    world.addCircle(4.9, 2.9, 0.6);
  }

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
    const cx = -3.6 + (i % 3) * 2.4, cz = 1.6 + Math.floor(i / 3) * 1.9, r = 0.9 + (i % 3) * 0.25;
    world.onAnimate((t, dt) => {
      pupMixer.update(dt);
      const a = t * (0.5 + i * 0.2) + i * 2;
      pup.position.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
      pup.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2;
    });
  });

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

  // Bridge rails: keep kids from clipping the pool edges diagonally
  world.addBox(-1.7, -1.1, -3.1, -0.9);
  world.addBox(1.1, 1.7, -3.1, -0.9);

  // Geyser crossing on the north band (pure-skill gate, no enemy)
  geyser(world, 2.6, -4.5, 0.0);
  geyser(world, 4.6, -3.9, 1.15);
  geyser(world, 6.5, -4.7, 2.3);

  // Checkpoint CP2 just before the boss door, potion by the stump
  checkpoint(world, 'cp2', 8.6, -3.6);
  potionPickup(world, -4.2, 4.6);

  // The optional branch (SE): rock-flanked pocket, Shadow Hound + Pup #2 later
  placeRocks(world, [
    { kind: 'la', x: 3.6, z: 2.6, s: 2.4, ry: 0.4, cr: 1.05 },
    { kind: 'lc', x: 8.9, z: 1.8, s: 2.2, ry: 4.2, cr: 0.95 },
    { kind: 'sb', x: 5.4, z: 2.2, s: 1.5, ry: 3.3, cr: 0.32 },
  ]);
  world.markers.pup2Spot = { x: 7.2, z: 4.4 };
  world.markers.houndSpot = { x: 6.0, z: 3.6 };
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

  // Ember Moths near the lava channel; a small Shade cluster mid-room
  // (2-3 max per COMBAT-SPEC — never swarms)
  world.markers.mothSpots = [{ x: -4.5, z: -3.4 }, { x: -1.8, z: -0.6 }];
  world.markers.shadeSpots = [{ x: -5.5, z: 2.2 }, { x: -6.5, z: 3.4 }];

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
  // the walk is a zigzag under moth fire
  lavaPool(world, -2.2, 0, 1.6, 9.6);
  lavaPool(world, 2.4, 0, 1.6, 9.6, { light: false });
  const b1 = prepareModel(kit.bridge.scene.clone());
  b1.position.set(-2.2, 0.02, -2.6);
  b1.scale.set(1.3, 1.1, 1.6);
  world.add(b1);
  const b2 = prepareModel(kit.bridge.scene.clone());
  b2.position.set(2.4, 0.02, 2.6);
  b2.scale.set(1.3, 1.1, 1.6);
  world.add(b2);
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
  world.markers.houndSpot = { x: 5.2, z: 0.2 };

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
  potionPickup(world, 6.2, 3.9);

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
  lavaPool(world, -6.6, 1.8, 1.6, 5.2, { light: true });
  lavaPool(world, 6.6, 1.8, 1.6, 5.2, { light: false });
  checkpoint(world, 'cp_k1', 0, 0.4);
  potionPickup(world, 1.6, 0.8);
  for (const [px, pz] of [[-3.2, -3.6], [3.2, -3.6]]) {
    const col = prepareModel(dkit.column2.scene.clone());
    col.position.set(px, 0, pz);
    col.scale.setScalar(0.5);
    world.add(col);
    world.addCircle(px, pz, 0.4);
  }
  world.markers.shadeSpots = [{ x: -3.4, z: 2.4 }];
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
  world.markers.shadeSpots = [{ x: -6.2, z: -1.8 }, { x: -5.4, z: 2.2 }];
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
  brazier(world, prepareModel, dkit.torch, 'ka_combat', 7.0, 2.8, () => {
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
    { id: 'c_kb_key', tier: 'gold', x: 5.4, z: 3.0, ry: -0.6,
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
  lavaPool(world, 0, -7.35, 15.6, 1.1, { light: true });
  lavaPool(world, -4.45, 7.35, 6.7, 1.1, { light: false });
  lavaPool(world, 4.45, 7.35, 6.7, 1.1, { light: false });
  // west rim leaves a clear walkway where the shortcut opens (z -0.8..2.0)
  lavaPool(world, -7.35, -3.8, 1.1, 6.0, { light: false });
  lavaPool(world, -7.35, 4.4, 1.1, 4.8, { light: false });
  lavaPool(world, 7.35, 0, 1.1, 13.6, { light: true });
  const walkway = prepareModel(kit.bridge.scene.clone());
  walkway.position.set(0, 0.02, 7.35);
  walkway.scale.set(2.4, 1.1, 1.5);
  world.add(walkway);

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
  strip.position.set(x, 0.1, z);
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

// Pushable boulder (Kenney rock, stone-gray) — the Stoneroot puzzle verb.
function boulder(world, x, z) {
  const rock = prepareModel(kit.rockLB.scene.clone());
  rock.traverse((n) => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    n.material.color.setHex(0x8a8d95);
  });
  rock.scale.setScalar(2.0);
  const group = new THREE.Group();
  group.add(rock);
  group.position.set(x, 0, z);
  world.add(group);
  const collider = { x, z, r: 0.62 };
  world.circleColliders.push(collider);
  const b = { x, z, r: 0.62, group, mesh: rock, collider };
  world.boulders.push(b);
  return b;
}

// Pressure plate: a glowing floor switch a boulder can hold down.
function pressurePlate(world, id, x, z, onPressed) {
  const base = prepareModel(dkit.trapBase.scene.clone(), { castShadow: false });
  base.position.set(x, 0.09, z);
  base.scale.setScalar(0.8);
  world.add(base);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 22),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.75, roughness: 1, depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, 0.12, z);
  world.add(glow);
  if (!world.plates) world.plates = [];
  const pressed = !!state.flags.plates[id];
  const p = {
    id, x, z, pressed,
    onPressed: () => {
      glow.material.emissive.setHex(0x7aff8a);
      audio.play('checkpoint', { volume: 0.8, rate: 1.3 });
      if (onPressed) onPressed();
    },
  };
  if (pressed) glow.material.emissive.setHex(0x7aff8a);
  world.plates.push(p);
  world.onAnimate((t) => {
    glow.material.emissiveIntensity = p.pressed ? 1.4 : 0.7 + 0.35 * Math.sin(t * 2.6 + x);
  });
  return p;
}

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
async function mushroomPatches(world, spots) {
  if (!state.flags.wardenDefeated) return;
  const [group, tall] = await Promise.all([
    loadGLB('./assets/env/mushroom-group.glb'),
    loadGLB('./assets/env/mushroom-tall.glb'),
  ]);
  spots.forEach(([x, z, s], i) => {
    const m = prepareModel((i % 3 === 2 ? tall : group).scene.clone(), { castShadow: false });
    m.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      n.material.emissive = new THREE.Color(i % 3 === 2 ? 0xd8ffb0 : 0x8affc0);
      n.material.emissiveIntensity = 0.55;
    });
    m.position.set(x, 0.08, z);
    m.rotation.y = (x * 5 + z * 3) % 6.28;
    m.scale.setScalar(s || 1.6);
    world.add(m);
    if (i % 2 === 0) {
      const glow = new THREE.PointLight(0x9affc0, 2.2, 5, 1.9);
      glow.position.set(x, 0.7, z);
      world.add(glow);
      world.onAnimate((t) => { glow.intensity = 1.8 + Math.sin(t * 1.9 + x) * 0.5; });
    }
  });
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
  ]);
  world.spawn = { x: 0, z: 4.6, angle: Math.PI };
  world.addDoor(-1.2, 1.2, 5.85, 6.9, 'r3', { x: 0, z: -4.4, angle: 0 });
  world.addDoor(-1.2, 1.2, -6.9, -5.85, 'e2', { x: -6, z: 4.4, angle: Math.PI });

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
    { id: 'c_e1_hall', tier: 'wood', x: -6.8, z: 4.6, ry: 0.9, loot: { shards: 10 } },
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
// E2 — The Deep Hall (teaches: spike timing, boulder pushing; rogue ambush)
// ---------------------------------------------------------------------------

async function buildE2(scene) {
  const world = new World(scene);
  cavernMood(world);
  buildStoneShell(world, 20, 12, [
    { side: 's', from: -7.2, to: -4.8 }, // back to E1
    { side: 'e', from: -1.2, to: 1.2 },  // gated crypt door
  ]);
  world.spawn = { x: -6, z: 4.4, angle: Math.PI };
  world.addDoor(-7.2, -4.8, 5.85, 6.9, 'e1', { x: 0, z: -4.4, angle: 0 });
  world.addDoor(9.15, 10.15, -1.2, 1.2, 'e3', { x: 0, z: 5.4, angle: Math.PI });

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
  pressurePlate(world, 'e2_gate', -1.6, 4.6, () => {
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
  });
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
  world.markers.batSpots = [{ x: 5.2, z: -4.6 }];

  // NW dark nook — the Dark Wolf's eyes find a lost pup in here
  darkZone(world, -10, -6.2, -6, -2.2);
  world.markers.pup4Spot = { x: -9.0, z: -5.0 };
  // ...and a second pup shivers in the far corner past the spikes
  world.markers.pup5Spot = { x: 9.2, z: -5.2 };

  checkpoint(world, 'cp_e2', 7.6, 3.8);
  potionPickup(world, -8.6, -4.2);
  await mushroomPatches(world, [
    [-7.8, 3.2], [-1.2, -2.2, 1.3], [2.2, 4.6], [7.0, 0.8, 2.0], [-4.6, -4.8], [8.6, 4.6],
  ]);
  world.markers.chestDefs = [
    { id: 'c_e2_spikes', tier: 'wood', x: 6.8, z: -4.9, ry: 2.0, loot: { shards: 14, potion: 1 } },
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
  ]);
  world.spawn = { x: 0, z: 5.4, angle: Math.PI };
  world.addDoor(-1.3, 1.3, 6.85, 7.9, 'e2', { x: 8.4, z: 0, angle: 0 });

  wallTorch(world, -4.6, 4.6); wallTorch(world, 4.6, 4.6);
  wallTorch(world, -5.4, -3.2); wallTorch(world, 5.4, -3.2);
  stoneDoorway(world, 0, 6.3, 'x');

  // marble horse statues guard Petra's shrine
  for (const [x, ry] of [[-2.6, 0.6], [2.6, -0.6]]) {
    const s = prepareModel(dkit.statue.scene.clone());
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

  checkpoint(world, 'cp_e3', -3.2, 5.2);
  potionPickup(world, 3.2, 5.2);

  // the third cavern pup cowers in the crypt corner, freed with the Warden
  world.markers.pup6Spot = { x: -5.6, z: -5.6 };
  await mushroomPatches(world, [
    [-4.6, 0.4], [4.8, -1.2, 2.0], [-2.0, -6.0], [2.2, 5.8, 1.3], [5.8, 3.2],
  ]);

  return world;
}

export const ROOMS = { r1: buildR1, r1b: buildR1b, r2: buildR2, r2b: buildR2b, k1: buildK1, ka: buildKa, kb: buildKb, r3: buildR3, den: buildDen, e1: buildE1, e2: buildE2, e3: buildE3 };

export async function buildRoom(id, scene) {
  await loadKit();
  if (id[0] === 'e' || id[0] === 'k') await loadDungeonKit();
  const world = await ROOMS[id](scene);
  await spawnEnemies(world);
  if (world.markers.bossSpot && !state.flags.bossDefeated) {
    const [dragonGltf, slimeGltf] = await Promise.all([
      loadGLB('./assets/chars/monsters/Dragon.glb'),
      loadGLB('./assets/chars/monsters/Slime.glb'),
    ]);
    new Shadowgrip(world, world.markers.bossSpot.x, world.markers.bossSpot.z, dragonGltf, slimeGltf);
  }
  return world;
}
