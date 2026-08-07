// The World: one room's static geometry + flat-plane gameplay data. All
// collision runs in 2D on the XZ plane — circles (dynamic bodies) vs static
// AABBs and circles, plus damage zones (lava rects, geyser circles).

import * as THREE from 'three';
import { state } from './state.js';
import { audio } from './audio.js';

const _rollAxis = new THREE.Vector3();

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.boxColliders = [];    // {minX, maxX, minZ, maxZ}
    this.circleColliders = []; // {x, z, r}
    this.lavaZones = [];       // {minX, maxX, minZ, maxZ}
    this.safeZones = [];       // {minX, maxX, minZ, maxZ} — bridge decks etc.
                               // that OVERRIDE hazards underneath them
    this.geysers = [];         // {x, z, r, active} — managed by room animate
    this.darkZones = [];       // {minX, maxX, minZ, maxZ, veils: [materials]}
    this.doors = [];           // {minX, maxX, minZ, maxZ, to, entry:{x,z,angle}}
    this.checkpoints = [];     // {id, x, z, r, flame, light}
    this.markers = {};         // named spots for later phases (pups, boss, enemies)
    this.burnables = [];       // {id, x, z, group, collider, burned}
    this.crackables = [];      // {id, x, z, group, collider, cracked} — Earth Wolf
    this.boulders = [];        // {x, z, r, group, collider} — pushable
    this.potionSpots = [];     // {x, z, group, taken}
    this.boss = null;
    this.bossDarkness = false; // boss phase 3 blacks out the whole room
    this.spawn = { x: 0, z: 0, angle: Math.PI };
    // HEIGHT LAW (v3.20): the top surface of THIS room's floor. Ground decals
    // (plates, act-here rings, doorway glows, scars) must sit above it or they
    // are drawn INSIDE the floor and become invisible — which is exactly how
    // the Deep Hall's pressure plate hid itself for two regions. Each shell
    // builder sets its own value; 0 is a bare ground plane.
    this.deckY = 0;
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

  // A walkable platform footprint (bridge deck, walkway) — anywhere inside
  // is SAFE even if a lava/geyser zone lies underneath it.
  addSafe(minX, maxX, minZ, maxZ) {
    this.safeZones.push({ minX, maxX, minZ, maxZ });
  }

  addDoor(minX, maxX, minZ, maxZ, to, entry, when = null) {
    this.doors.push({ minX, maxX, minZ, maxZ, to, entry, when });
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
    // bridge decks first: standing ON the crossing is never "in the lava"
    for (const s of this.safeZones) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return false;
    }
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
    return this._shatter(this.burnables, 'burned', state.flags.burned, x, z, r);
  }

  // Earth Wolf stone-stomp: the same break-apart for cracked rock piles.
  crackAt(x, z, r) {
    return this._shatter(this.crackables, 'cracked', state.flags.cracked, x, z, r);
  }

  _shatter(list, doneKey, flagMap, x, z, r) {
    let burned = 0;
    for (const b of list) {
      if (b[doneKey]) continue;
      const dx = b.x - x, dz = b.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      b[doneKey] = true;
      flagMap[b.id] = true;
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

  // Pushable boulders — v3.18 playtest law: PREDICTABLE. Lean on a boulder
  // for a beat and it rolls ONE clean step in the straight direction you
  // pushed (snapped to north/south/east/west), then stops and waits. Push
  // from the side you want it to LEAVE. If a step carries it over a pressure
  // plate the boulder SNAPS onto the plate with a click and stays forever.
  _moveBoulder(b, nx, nz) {
    const mx = nx - b.x, mz = nz - b.z;
    const moved = Math.hypot(mx, mz);
    b.x = b.collider.x = nx;
    b.z = b.collider.z = nz;
    b.group.position.set(nx, 0, nz);
    if (moved > 1e-5 && b.mesh) {
      // roll the rock about the axis perpendicular to its motion
      _rollAxis.set(mz / moved, 0, -mx / moved);
      b.mesh.rotateOnWorldAxis(_rollAxis, moved / b.r);
      b._rollAcc = (b._rollAcc || 0) + moved;
      if (b._rollAcc > 0.55) {
        b._rollAcc = 0;
        audio.play('gate-creak', { volume: 0.3, rate: 0.55, vary: 0.15 });
      }
    }
    return moved;
  }

  _boulderPlateAt(x, z, r = 0.6) {
    for (const p of (this.plates || [])) {
      const px = p.x - x, pz = p.z - z;
      if (px * px + pz * pz < r * r) return p;
    }
    return null;
  }

  updateBoulders(dt, player) {
    for (const b of this.boulders) {
      // a step in flight advances on its own — the player just watches it land
      if (b._slide) {
        const s = b._slide;
        const step = Math.min(s.remaining, 2.4 * dt);
        const i = this.circleColliders.indexOf(b.collider);
        if (i >= 0) this.circleColliders.splice(i, 1);
        const solved = this.resolveCircle(b.x + s.dx * step, b.z + s.dz * step, b.r);
        if (i >= 0) this.circleColliders.splice(i, 0, b.collider);
        const moved = this._moveBoulder(b, solved.x, solved.z);
        s.remaining -= step;
        if (moved < step * 0.35) s.remaining = 0; // hit something — stop clean
        // rolling onto a plate ends the step immediately: CLICK, locked in
        const plate = this._boulderPlateAt(b.x, b.z, 0.55);
        if (plate) s.remaining = 0;
        if (s.remaining <= 0) {
          b._slide = null;
          if (plate) {
            this._moveBoulder(b, plate.x, plate.z); // snap dead-center
            b._locked = true;                        // it holds the weight forever
            if (!plate.pressed) {
              plate.pressed = true;
              state.flags.plates[plate.id] = true;
              if (plate.onPressed) plate.onPressed();
            }
          }
        }
        continue;
      }
      if (b._locked) continue;

      // leaning: standing against the boulder starts the next step
      const dx = b.x - player.root.position.x;
      const dz = b.z - player.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > b.r + 0.32 + 0.1 || d < 1e-4) { b._lean = 0; continue; }
      b._lean = (b._lean || 0) + dt;
      if (b._lean < 0.12) continue; // a brief lean, so a stray bump can't shove it
      b._lean = 0;
      // snap the push to the dominant axis: one clean cardinal step
      const dir = Math.abs(dx) > Math.abs(dz)
        ? { dx: Math.sign(dx), dz: 0 }
        : { dx: 0, dz: Math.sign(dz) };
      b._slide = { ...dir, remaining: 1.2 };
    }
  }

  doorAt(x, z) {
    for (const d of this.doors) {
      if (d.when && !d.when()) continue;
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
