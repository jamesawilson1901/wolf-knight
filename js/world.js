// The World: one room's static geometry + flat-plane gameplay data. All
// collision runs in 2D on the XZ plane — circles (dynamic bodies) vs static
// AABBs and circles, plus damage zones (lava rects, geyser circles).

import * as THREE from 'three';
import { state } from './state.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.boxColliders = [];    // {minX, maxX, minZ, maxZ}
    this.circleColliders = []; // {x, z, r}
    this.lavaZones = [];       // {minX, maxX, minZ, maxZ}
    this.geysers = [];         // {x, z, r, active} — managed by room animate
    this.darkZones = [];       // {minX, maxX, minZ, maxZ, veils: [materials]}
    this.doors = [];           // {minX, maxX, minZ, maxZ, to, entry:{x,z,angle}}
    this.checkpoints = [];     // {id, x, z, r, flame, light}
    this.markers = {};         // named spots for later phases (pups, boss, enemies)
    this.burnables = [];       // {id, x, z, group, collider, burned}
    this.potionSpots = [];     // {x, z, group, taken}
    this.boss = null;
    this.bossDarkness = false; // boss phase 3 blacks out the whole room
    this.spawn = { x: 0, z: 0, angle: Math.PI };
    this._animateHooks = [];
  }

  add(obj) { this.root.add(obj); return obj; }

  addBox(minX, maxX, minZ, maxZ) {
    this.boxColliders.push({ minX, maxX, minZ, maxZ });
  }

  addCircle(x, z, r) {
    this.circleColliders.push({ x, z, r });
  }

  addLava(minX, maxX, minZ, maxZ) {
    this.lavaZones.push({ minX, maxX, minZ, maxZ });
  }

  addDoor(minX, maxX, minZ, maxZ, to, entry) {
    this.doors.push({ minX, maxX, minZ, maxZ, to, entry });
  }

  onAnimate(fn) { this._animateHooks.push(fn); }

  animate(t, dt) {
    for (const fn of this._animateHooks) fn(t, dt);
  }

  dispose() {
    this.scene.remove(this.root);
    // Geometries/materials are shared via the asset cache — do not dispose
    // them; just drop the scene graph.
  }

  // True while standing somewhere that hurts (lava, erupting geyser).
  hazardAt(x, z) {
    for (const l of this.lavaZones) {
      if (x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ) return true;
    }
    for (const g of this.geysers) {
      if (!g.active) continue;
      const dx = x - g.x, dz = z - g.z;
      if (dx * dx + dz * dz < g.r * g.r) return true;
    }
    return false;
  }

  // Fire Wolf ground-slam: burn every unburned obstacle in range. The clump
  // breaks apart — chunks scatter, shrink and fade — and its collider goes.
  burnAt(x, z, r) {
    let burned = 0;
    for (const b of this.burnables) {
      if (b.burned) continue;
      const dx = b.x - x, dz = b.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      b.burned = true;
      state.flags.burned[b.id] = true;
      burned++;
      const i = this.circleColliders.indexOf(b.collider);
      if (i >= 0) this.circleColliders.splice(i, 1);
      const chunks = [...b.group.children];
      for (const c of chunks) {
        const a = Math.atan2(c.position.x + 0.01, c.position.z + 0.01);
        c.userData.v = { x: Math.sin(a) * 1.6, y: 2.2, z: Math.cos(a) * 1.6 };
        c.traverse((n) => {
          if (n.isMesh) { n.material.transparent = true; }
        });
      }
      let life = 0.8;
      this.onAnimate((t, dt) => {
        if (life <= 0) return;
        life -= dt;
        const f = Math.max(0, life / 0.8);
        for (const c of chunks) {
          c.position.x += c.userData.v.x * dt;
          c.position.y += c.userData.v.y * dt;
          c.position.z += c.userData.v.z * dt;
          c.userData.v.y -= dt * 7;
          c.scale.multiplyScalar(Math.max(0.0001, 1 - dt * 1.6));
          c.traverse((n) => { if (n.isMesh) n.material.opacity = f; });
        }
        if (life <= 0) this.root.remove(b.group);
      });
    }
    return burned;
  }

  doorAt(x, z) {
    for (const d of this.doors) {
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d;
    }
    return null;
  }

  darknessAt(x, z) {
    for (const zone of this.darkZones) {
      if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return 1;
    }
    return 0;
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
