// World building: rooms are kit-bashed from real Kenney GLBs, and all gameplay
// collision runs flat on the XZ plane — circles (dynamic bodies) vs a static
// list of AABBs and circles, plus rectangular damage zones (lava).

import * as THREE from 'three';
import { loadGLB, prepareModel, instancePlacements } from './assets.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.boxColliders = [];    // {minX, maxX, minZ, maxZ}
    this.circleColliders = []; // {x, z, r}
    this.lavaZones = [];       // {minX, maxX, minZ, maxZ}
    this.spawn = new THREE.Vector3(0, 0, 3.5);
  }

  addBox(minX, maxX, minZ, maxZ) {
    this.boxColliders.push({ minX, maxX, minZ, maxZ });
  }

  addCircle(x, z, r) {
    this.circleColliders.push({ x, z, r });
  }

  addLava(minX, maxX, minZ, maxZ) {
    this.lavaZones.push({ minX, maxX, minZ, maxZ });
  }

  inLava(x, z) {
    for (const l of this.lavaZones) {
      if (x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ) return true;
    }
    return false;
  }

  // Push a circle body (x, z, r) out of every static collider. Returns the
  // resolved position. Axis-of-least-penetration for boxes keeps sliding
  // along walls smooth; no impulses, no knockback — this is a kids' game.
  resolveCircle(x, z, r) {
    for (const b of this.boxColliders) {
      const nx = Math.max(b.minX, Math.min(x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Center inside the box: push out along the shallowest axis.
        const left = x - b.minX, right = b.maxX - x;
        const top = z - b.minZ, bottom = b.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.minX - r;
        else if (m === right) x = b.maxX + r;
        else if (m === top) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    for (const c of this.circleColliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      x = c.x + (dx / d) * rr;
      z = c.z + (dz / d) * rr;
    }
    return { x, z };
  }
}

const ROOM_W = 16; // tiles along X
const ROOM_D = 12; // tiles along Z

// Phase 1 world: the Phase 0 test room, now with colliders and hurting lava.
export async function buildTestRoom(scene) {
  const world = new World(scene);

  const [floorGltf, cliffGltf, rockLA, rockLB, rockLC, rockSA, rockSB, pillarGltf] =
    await Promise.all([
      loadGLB('./assets/env/floor-tile.glb'),
      loadGLB('./assets/env/cliff-block.glb'),
      loadGLB('./assets/env/rock-large-a.glb'),
      loadGLB('./assets/env/rock-large-b.glb'),
      loadGLB('./assets/env/rock-large-c.glb'),
      loadGLB('./assets/env/rock-small-a.glb'),
      loadGLB('./assets/env/rock-small-b.glb'),
      loadGLB('./assets/env/pillar.glb'),
    ]);

  const halfW = ROOM_W / 2;
  const halfD = ROOM_D / 2;

  // Floor: instanced tiles rotated in 90° steps so the surface doesn't look
  // stamped. One draw call for the whole floor.
  const floorPlacements = [];
  for (let tx = 0; tx < ROOM_W; tx++) {
    for (let tz = 0; tz < ROOM_D; tz++) {
      floorPlacements.push({
        x: tx - halfW + 0.5,
        z: tz - halfD + 0.5,
        ry: ((tx * 7 + tz * 13) % 4) * Math.PI / 2,
      });
    }
  }
  scene.add(instancePlacements(floorGltf.scene, floorPlacements, { castShadow: false }));

  // Walls: a ring of cliff blocks just outside the floor, with deterministic
  // rotation + height variation so the cave rim feels hand-stacked.
  const wallPlacements = [];
  const addWallCell = (tx, tz) => wallPlacements.push({
    x: tx - halfW + 0.5,
    z: tz - halfD + 0.5,
    ry: (Math.abs(tx * 11 + tz * 5) % 4) * Math.PI / 2,
    sy: 1.9 + (Math.abs(tx * 31 + tz * 17) % 3) * 0.18,
  });
  for (let tx = -1; tx <= ROOM_W; tx++) { addWallCell(tx, -1); addWallCell(tx, ROOM_D); }
  for (let tz = 0; tz < ROOM_D; tz++) { addWallCell(-1, tz); addWallCell(ROOM_W, tz); }
  scene.add(instancePlacements(cliffGltf.scene, wallPlacements));

  // One box collider per wall side (walls are solid rows, not per-block).
  world.addBox(-halfW - 1, halfW + 1, -halfD - 1, -halfD); // north
  world.addBox(-halfW - 1, halfW + 1, halfD, halfD + 1);   // south
  world.addBox(-halfW - 1, -halfW, -halfD - 1, halfD + 1); // west
  world.addBox(halfW, halfW + 1, -halfD - 1, halfD + 1);   // east

  // Rocks: hand-placed boulders, center left walkable.
  const rockPlacements = [
    { gltf: rockLA, x: -5.6, z: -3.4, s: 2.6, ry: 0.4, cr: 1.15 },
    { gltf: rockLB, x: 5.9, z: -3.9, s: 3.0, ry: 2.1, cr: 1.3 },
    { gltf: rockLC, x: -6.3, z: 3.6, s: 2.3, ry: 4.2, cr: 1.0 },
    { gltf: rockLA, x: 4.8, z: 4.1, s: 2.1, ry: 5.5, cr: 0.95 },
    { gltf: rockSA, x: -2.9, z: -4.6, s: 1.9, ry: 1.2, cr: 0.4 },
    { gltf: rockSB, x: 2.2, z: -4.8, s: 1.6, ry: 3.3, cr: 0.35 },
    { gltf: rockSB, x: -4.4, z: 0.6, s: 1.4, ry: 0.9, cr: 0.3 },
    { gltf: rockSA, x: 6.4, z: 0.9, s: 1.7, ry: 2.6, cr: 0.35 },
    { gltf: rockSB, x: 0.8, z: 4.7, s: 1.3, ry: 4.8, cr: 0.3 },
  ];
  for (const p of rockPlacements) {
    const rock = prepareModel(p.gltf.scene.clone());
    rock.position.set(p.x, 0, p.z);
    rock.rotation.y = p.ry;
    rock.scale.setScalar(p.s);
    scene.add(rock);
    world.addCircle(p.x, p.z, p.cr);
  }

  // Two castle pillars framing the lava pool (base already at y=0 in the GLB).
  const PILLAR_SCALE = 0.6;
  for (const px of [-7.0, -3.0]) {
    const pillar = prepareModel(pillarGltf.scene.clone());
    pillar.position.set(px, 0, -5.2);
    pillar.scale.setScalar(PILLAR_SCALE);
    scene.add(pillar);
    world.addCircle(px, -5.2, 0.55);
  }

  // Lava pool: emissive plane + warm point light, gently pulsing. Walking on
  // it hurts (handled by world.lavaZones), but it never blocks movement.
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff5a2b,
      emissiveIntensity: 1.8,
      roughness: 1,
    })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(-5, 0.02, -5.1);
  scene.add(lava);
  world.addLava(-5 - 1.7, -5 + 1.7, -5.1 - 0.9, -5.1 + 0.9);

  const lavaLight = new THREE.PointLight(0xff6a33, 14, 12, 1.8);
  lavaLight.position.set(-5, 1.2, -5.1);
  scene.add(lavaLight);

  world.animate = (t) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
    lava.material.emissiveIntensity = 1.5 + pulse * 0.9;
    lavaLight.intensity = 11 + pulse * 7;
  };

  return world;
}
