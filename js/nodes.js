// RESOURCE NODES (design/MINING.md) — mine a rock, chop a tree. RuneScape's
// own idiom, fitted to this game's own control law: everything interactive
// here already triggers on PROXIMITY, never a tap-to-target (a chest opens
// when you walk into it, a minigame host arms on approach) — this game has
// no camera-raycast tap-to-select system anywhere, so a node follows the
// same law rather than inventing one. Walk up with the right tool owned and
// it starts on its own; no manual swing needed.
import * as THREE from 'three';
import { loadGLB, prepareModel } from './assets.js';
import { ownsGear } from './items.js';
import { spawnMaterialDrop } from './materials.js';
import { audio } from './audio.js';

// Real, already-vendored decoration props — the SAME rock-large/tree-a
// meshes scattered as scenery in every region — doing double duty as the
// resource itself rather than a new model (CLAUDE.md's asset rule).
export const NODE_KINDS = {
  rock:  { url: './assets/env/rock-large-b.glb', tool: 'pickaxe', hits: 3, material: 'ore',
    crystalChance: 0.15, size: 1.6 },
  tree:  { url: './assets/env/tree-a.glb', tool: 'axe_b', hits: 3, material: 'wood',
    crystalChance: 0, size: 2.4 },
};

const RANGE = 1.6;      // how close counts as "working it"
const SWING_EVERY = 0.7; // seconds per "hit" — a channel, not a single tap
const nodeGltf = {};

export async function preloadNodes() {
  await Promise.all(Object.values(NODE_KINDS).map(async (k) => {
    if (!nodeGltf[k.url]) nodeGltf[k.url] = await loadGLB(k.url);
  }));
}

export class ResourceNode {
  // `tint` (optional, the 2026-09-16 region rollout, design/MINING.md): a
  // single hex colour, applied to every mesh material the SAME way
  // `Player.js`'s own `_tintGear` recolours a cloned weapon — clone each
  // material, set `.color`, never touch the loader's shared cache. Omitted
  // entirely, a node renders exactly as lc's original untinted pair always
  // has: no regression, pure opt-in. Kept on the instance (`this._tint`)
  // purely so a verify suite can read back what a room asked for.
  constructor(world, x, z, kind, tint) {
    const cfg = NODE_KINDS[kind];
    const gltf = nodeGltf[cfg.url];
    const model = prepareModel(gltf.scene.clone());
    this._tint = tint;
    if (tint) {
      model.traverse((n) => {
        if (!n.isMesh || !n.material) return;
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        // BLENDED, NOT PAINTED. setHex flattened every face of the rock to
        // one pale colour — Frostpeak's 0x9be3ff came out as a glowing
        // ice-white slab with no shading, which Dad read as "a grand flying
        // iceberg" (2026-09-26). Pulling the model's own colour 60% toward
        // the tint keeps its light and dark faces, so it reads as a rock.
        const want = new THREE.Color(tint);
        const cloned = mats.map((m) => { const c = m.clone(); if (c.color) c.color.lerp(want, 0.6).multiplyScalar(0.85); return c; });
        n.material = Array.isArray(n.material) ? cloned : cloned[0];
      });
    }
    const bb = new THREE.Box3().setFromObject(model);
    const dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z;
    const s = cfg.size / Math.max(0.01, dx, dy, dz);
    model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    this.root = new THREE.Group();
    this.root.add(model);
    this.root.scale.setScalar(s);
    // SEATED IN THE GROUND, not balanced on it: a hair below the deck so no
    // gap of light shows under the model from the chase camera.
    this.root.position.set(x, (world.deckY || 0) - 0.08, z);
    this.root.rotation.y = (x * 7 + z * 3) % 6.28;
    world.add(this.root);
    this.x = x; this.z = z;
    this.kind = kind;
    this.hp = cfg.hits;
    this.channelT = 0;
    this.depleted = false;
    this.scenery = true; // never a foe: no moon gauge, no engagement tokens
    world.addCircle(x, z, cfg.size * 0.32);
    this._collider = world.circleColliders[world.circleColliders.length - 1];
    this._model = model;
    // A NODE HAS TO SAY WHAT IT IS FOR. Dad, 2026-09-26, on Frostpeak's rock:
    // "if there's something grand... it needs to do something. Not just be
    // decoration." It always did — with a pickaxe — but nothing in the world
    // said so. A glinting ring round its foot (this game's act-here grammar,
    // the same one braziers and plates wear) and a Pip line on approach that
    // names the tool, or, with the tool owned, tells the child to stand close.
    this._ring = new THREE.Mesh(
      new THREE.RingGeometry(cfg.size * 0.42, cfg.size * 0.5, 28),
      new THREE.MeshBasicMaterial({ color: kind === 'tree' ? 0xc8f58a : 0xcdeeff,
        transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.set(x, (world.deckY || 0) + 0.04, z);
    world.add(this._ring);
    if (world.keepLoose) world.keepLoose(this._ring);   // it pulses and leaves
    this._t = 0;
  }

  update(dt, t, player, world) {
    if (this.depleted) return;
    const cfg = NODE_KINDS[this.kind];
    const owned = ownsGear(cfg.tool);
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    this._t += dt || 0;
    if (this._ring) {
      const w = owned ? 3.2 : 1.8;
      this._ring.material.opacity = (owned ? 0.55 : 0.32) + 0.25 * Math.sin(this._t * w + this.x);
    }
    if (dx * dx + dz * dz < 3.4 * 3.4) {
      const n = typeof window !== 'undefined' && window.__game && window.__game.narration;
      if (n) n.say(owned ? 'node_work' : (this.kind === 'tree' ? 'node_need_axe' : 'node_need_pickaxe'));
    }
    if (!owned) { this.channelT = 0; return; }
    if (dx * dx + dz * dz > RANGE * RANGE) { this.channelT = 0; return; }
    // held in place while it works, the same law an attack's own lockTime
    // already gives a swing — a child cannot wander off mid-strike either.
    player.lockTime = Math.max(player.lockTime, 0.15);
    this.channelT += dt;
    // a little life in the node each tick, so "something is happening" reads
    // even before the first hit lands
    const settle = 1 - Math.min(1, this.channelT / SWING_EVERY) * 0.08;
    this._model.scale.setScalar(settle);
    if (this.channelT >= SWING_EVERY) {
      this.channelT = 0;
      this._model.scale.setScalar(1);
      this.hp--;
      audio.play('hit', { volume: 0.6, rate: 0.85 });
      if (this.hp <= 0) this._deplete(world);
    }
  }

  _deplete(world) {
    this.depleted = true;
    const cfg = NODE_KINDS[this.kind];
    spawnMaterialDrop(world, this.x, this.z, cfg.material);
    if (Math.random() < cfg.crystalChance) spawnMaterialDrop(world, this.x + 0.3, this.z, 'crystal');
    audio.play('puff', { volume: 0.7 });
    world.root.remove(this.root);
    if (this._ring) world.root.remove(this._ring);
    const i = world.circleColliders.indexOf(this._collider);
    if (i >= 0) world.circleColliders.splice(i, 1);
  }
}

// Called from the shared per-room pipeline (js/main.js), the same place
// spawnBreakables()/spawnChests() already run. `world.markers.rockSpots`/
// `treeSpots` are plain `{x,z}` arrays, a region's own room-builder's
// business — nodes don't persist or respawn on a timer, the same "always
// there next time you build the room" law enemies got in v3.170: no
// levels regenerate, but nothing here ever needed to be gone for good.
export async function spawnResourceNodes(world, rockSpots = [], treeSpots = []) {
  if (!rockSpots.length && !treeSpots.length) return;
  await preloadNodes();
  if (!world.nodes) world.nodes = [];
  for (const s of rockSpots) world.nodes.push(new ResourceNode(world, s.x, s.z, 'rock', s.tint));
  for (const s of treeSpots) world.nodes.push(new ResourceNode(world, s.x, s.z, 'tree', s.tint));
  world.updateNodes = (dt, t, player) => {
    for (const n of world.nodes) n.update(dt, t, player, world);
  };
}
