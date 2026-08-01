// Loot: ember shards (currency coins), breakable pots/crates, and chests.
// Shards scatter with a little hop, sparkle, and fly to Kael when close (or
// from far away with the Magnet buff). Chests persist per save; breakables
// respawn with the room (small change, not farming gold).

import * as THREE from 'three';
import { loadGLB, prepareModel } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { bumpCounter } from './progress.js';

export const lootEvents = { onShards: null, onLoot: null }; // main.js wires HUD

// ---------------------------------------------------------------------------
// Shards
// ---------------------------------------------------------------------------

let coinGltf = null;
export async function preloadLoot() {
  if (!coinGltf) {
    coinGltf = await loadGLB('./assets/loot/platformer/coin.glb');
  }
}

export function spawnShards(world, x, z, n) {
  if (!world.shards) world.shards = [];
  for (let i = 0; i < n; i++) {
    const coin = prepareModel(coinGltf.scene.clone(), { castShadow: false });
    coin.scale.setScalar(1.1);
    const a = (i / Math.max(1, n)) * Math.PI * 2 + x;
    coin.position.set(x, 0.4, z);
    world.add(coin);
    world.shards.push({
      mesh: coin,
      x: x + Math.cos(a) * 0.01,
      z: z + Math.sin(a) * 0.01,
      vx: Math.cos(a) * (1.2 + (i % 3) * 0.5),
      vz: Math.sin(a) * (1.2 + (i % 3) * 0.5),
      vy: 3 + (i % 2),
      y: 0.4,
      settled: false,
      life: 25,
      taken: false,
    });
  }
}

export function updateShards(world, dt, t, player) {
  if (!world.shards) return;
  const magnet = player.buffs && player.buffs.magnet > 0;
  for (const s of world.shards) {
    if (s.taken) continue;
    s.life -= dt;
    if (!s.settled) {
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.y += s.vy * dt;
      s.vy -= 12 * dt;
      if (s.y <= 0.25 && s.vy < 0) { s.y = 0.25; s.settled = true; }
    } else {
      s.y = 0.25 + Math.sin(t * 3 + s.x * 2) * 0.05;
    }
    const dx = player.root.position.x - s.x;
    const dz = player.root.position.z - s.z;
    const d2 = dx * dx + dz * dz;
    const pullR = magnet ? 8 : 2.2;
    if (s.settled && d2 < pullR * pullR && d2 > 0.3 * 0.3) {
      const d = Math.sqrt(d2);
      const pull = (magnet ? 10 : 6) * dt;
      s.x += (dx / d) * pull;
      s.z += (dz / d) * pull;
    }
    if (d2 < 0.45 * 0.45 || s.life <= 0) {
      s.taken = true;
      world.root.remove(s.mesh);
      if (s.life > 0) {
        state.shards++;
        bumpCounter('shardsEarned');
        audio.play('coin', { volume: 0.35, rate: 1.5, vary: 0.2 });
        if (lootEvents.onShards) lootEvents.onShards();
      }
      continue;
    }
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.rotation.y = t * 4 + s.x;
  }
}

// ---------------------------------------------------------------------------
// Breakables — pots/crates/barrels that pop into shards. Enemy-shaped so
// swords, bolts, slams and the Blood Moon all break them.
// ---------------------------------------------------------------------------

export class Breakable {
  constructor(world, gltf, x, z, { shards = 2, scale = 0.55 } = {}) {
    this.world = world;
    this.root = prepareModel(gltf.scene.clone());
    this.root.position.set(x, 0, z);
    this.root.rotation.y = (x * 7 + z * 3) % 6.28;
    this.root.scale.setScalar(scale);
    world.add(this.root);
    this.x = x; this.z = z;
    this.radius = 0.42;
    this.hp = 1;
    this.dead = false;
    this.stunned = 0;
    this.shardCount = shards;
    world.addCircle(x, z, 0.38);
    this._collider = world.circleColliders[world.circleColliders.length - 1];
  }

  takeStun() {}
  takeDamage() {
    if (this.dead) return;
    this.dead = true;
    bumpCounter('pots');
    audio.play('burn', { volume: 0.55, rate: 1.3 });
    // wooden debris: chunks fly and fade
    const bits = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.08, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1, transparent: true })
      );
      const a = (i / 6) * Math.PI * 2;
      m.position.set(this.x, 0.4, this.z);
      m.userData.v = new THREE.Vector3(Math.cos(a) * 2, 2.5 + (i % 3), Math.sin(a) * 2);
      this.world.add(m);
      bits.push(m);
    }
    let life = 0.7;
    this.world.onAnimate((t, dt) => {
      if (life <= 0) return;
      life -= dt;
      for (const m of bits) {
        m.position.addScaledVector(m.userData.v, dt);
        m.userData.v.y -= dt * 9;
        m.rotation.x += dt * 8;
        m.material.opacity = Math.max(0, life / 0.7);
      }
      if (life <= 0) for (const m of bits) this.world.root.remove(m);
    });
    this.world.root.remove(this.root);
    const i = this.world.circleColliders.indexOf(this._collider);
    if (i >= 0) this.world.circleColliders.splice(i, 1);
    spawnShards(this.world, this.x, this.z, this.shardCount);
    // rare bonus: a power-up pops out (wired by powerups.js via hook)
    if (this.world.onBreakableSmashed) this.world.onBreakableSmashed(this.x, this.z);
  }
  update() {}
}

export async function spawnBreakables(world, spots) {
  const [crate, barrel, vase] = await Promise.all([
    loadGLB('./assets/loot/survival/crate.glb'),
    loadGLB('./assets/loot/survival/barrel.glb'),
    loadGLB('./assets/env/dungeon/Vase.glb'),
  ]);
  for (const s of spots) {
    const gltf = { barrel, vase }[s.kind] || crate;
    if (s.kind === 'vase' && s.scale === undefined) s.scale = 2.0; // dungeon vase is tiny
    world.enemies.push(new Breakable(world, gltf, s.x, s.z, s));
  }
}

// ---------------------------------------------------------------------------
// Chests — wooden (shards/potion) and golden (gear/treasure). Walk close to
// open; opened chests stay open forever (state.flags.chests).
// ---------------------------------------------------------------------------

export async function spawnChests(world, defs) {
  const [wood, gold] = await Promise.all([
    loadGLB('./assets/loot/survival/chest-wood.glb'),
    loadGLB('./assets/loot/pirate/chest-gold.glb'),
  ]);
  world.chests = [];
  for (const def of defs) {
    const opened = !!state.flags.chests[def.id];
    const gltf = def.tier === 'gold' ? gold : wood;
    const mesh = prepareModel(gltf.scene.clone());
    mesh.position.set(def.x, 0, def.z);
    mesh.rotation.y = def.ry || 0;
    mesh.scale.setScalar(def.tier === 'gold' ? 0.85 : 0.75);
    world.add(mesh);
    world.addCircle(def.x, def.z, 0.45);
    if (opened) {
      // already-looted chests sit open and dark
      mesh.traverse((n) => {
        if (n.isMesh) { n.material = n.material.clone(); n.material.color.multiplyScalar(0.55); }
      });
    } else if (def.tier === 'gold') {
      const glow = new THREE.PointLight(0xffd76a, 3, 5, 1.9);
      glow.position.set(def.x, 0.8, def.z);
      world.add(glow);
      world.onAnimate((t) => { glow.intensity = 2.4 + Math.sin(t * 2.6) * 0.8; });
    }
    world.chests.push({ ...def, mesh, opened });
  }
}

export function updateChests(world, player, giveLoot) {
  if (!world.chests) return;
  for (const c of world.chests) {
    if (c.opened) continue;
    const dx = player.root.position.x - c.x;
    const dz = player.root.position.z - c.z;
    if (dx * dx + dz * dz > 1.1 * 1.1) continue;
    c.opened = true;
    state.flags.chests[c.id] = true;
    bumpCounter('chests');
    audio.play('chest-open', { volume: 0.95 }); // the latch clicks...
    audio.play('checkpoint', { volume: 0.7, rate: 0.8 }); // ...then the chime
    // celebratory hop + burst
    const mesh = c.mesh;
    let tPop = 0.45;
    world.onAnimate((t, dt) => {
      if (tPop <= 0) return;
      tPop -= dt;
      const f = 1 - Math.max(0, tPop) / 0.45;
      mesh.position.y = Math.sin(f * Math.PI) * 0.35;
      mesh.rotation.z = Math.sin(f * Math.PI * 2) * 0.12;
    });
    if (c.loot.shards) spawnShards(world, c.x, c.z, c.loot.shards);
    giveLoot(c); // potions/gear/heart pieces/keys handled by main
  }
}
