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
  constructor(world, x, z, kind) {
    const cfg = NODE_KINDS[kind];
    const gltf = nodeGltf[cfg.url];
    const model = prepareModel(gltf.scene.clone());
    const bb = new THREE.Box3().setFromObject(model);
    const dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z;
    const s = cfg.size / Math.max(0.01, dx, dy, dz);
    model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    this.root = new THREE.Group();
    this.root.add(model);
    this.root.scale.setScalar(s);
    this.root.position.set(x, world.deckY || 0, z);
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
  }

  update(dt, t, player, world) {
    if (this.depleted) return;
    const cfg = NODE_KINDS[this.kind];
    if (!ownsGear(cfg.tool)) { this.channelT = 0; return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
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
  for (const s of rockSpots) world.nodes.push(new ResourceNode(world, s.x, s.z, 'rock'));
  for (const s of treeSpots) world.nodes.push(new ResourceNode(world, s.x, s.z, 'tree'));
  world.updateNodes = (dt, t, player) => {
    for (const n of world.nodes) n.update(dt, t, player, world);
  };
}
