// Loot: ember shards (currency coins), breakable pots/crates, and chests.
// Shards scatter with a little hop, sparkle, and fly to Kael when close (or
// from far away with the Magnet buff). Chests persist per save; breakables
// respawn with the room (small change, not farming gold).

import * as THREE from 'three';
import { loadGLB, prepareModel } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { bumpCounter } from './progress.js';

export const lootEvents = { onShards: null, onLoot: null, onPotionDrop: null, onPotion: null }; // main.js wires HUD

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
    // GOLD, AND LIT FROM INSIDE. The model ships with an ordinary material, so
    // in a dark room the currency of the game rendered BLACK — dad found little
    // black discs on the floor of the cave and could not tell what they were.
    // A coin is the one thing that must read the same in the Kiln and in the
    // dark, so it carries its own light rather than borrowing the room's.
    coin.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (c.color) c.color.setHex(0xffc843);
        if (c.emissive) { c.emissive.setHex(0xff9c1a); c.emissiveIntensity = 0.85; }
        c.metalness = 0.35; c.roughness = 0.35;
        return c;
      });
      if (!Array.isArray(n.material)) n.material = n.material[0];
    });
    coin.scale.setScalar(1.55);
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
      // A COIN HAS TO BE SEEN BEFORE IT CAN BE TAKEN.
      //
      // Dad, from play: "There is no coin appearing when you smash things.
      // Sometimes you'll smash it and you'll hear the coin sound and the counter
      // will go up but nothing is visible."
      //
      // Shards spawn AT the pot, and the child is standing next to the pot they
      // just hit — so the pickup test, which runs on the very first frame, found
      // them inside its 0.45u radius and swallowed the lot instantly. The reward
      // existed, was counted, was heard, and was never once drawn.
      //
      // Half a second of being uncollectable is exactly the arc: up at 3 u/s,
      // gravity 12, apex at a quarter second, landing at a half. It flies out,
      // it lands, THEN it is yours.
      arm: 0.5,
      taken: false,
    });
  }
}

// A POTION, DROPPED. There is no potion model in the pack — the HUD draws an
// emoji — so this is the dungeon VASE, shrunk and lit teal from inside. It is
// the same trick the whole game runs on: one kit, many meanings. It rides the
// shard physics so it arcs, lands and waits exactly as a coin does.
let vaseGltf = null;
export async function preloadPotionDrop() {
  if (!vaseGltf) vaseGltf = await loadGLB('./assets/env/dungeon/Vase.glb');
  return vaseGltf;
}

export function spawnPotionDrop(world, x, z) {
  if (!vaseGltf) return false;
  if (!world.shards) world.shards = [];
  const m = prepareModel(vaseGltf.scene.clone(), { castShadow: false });
  m.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    n.material = mats.map((mm) => {
      const c = mm.clone();
      if (c.color) c.color.setHex(0x2fe0c0);
      if (c.emissive) { c.emissive.setHex(0x1fbfa4); c.emissiveIntensity = 0.9; }
      return c;
    });
    if (!Array.isArray(n.material)) n.material = n.material[0];
  });
  m.scale.setScalar(1.5);
  m.position.set(x, 0.4, z);
  world.add(m);
  world.shards.push({
    mesh: m, kind: 'potion',
    x, z, vx: 0, vz: 0, vy: 3.4, y: 0.4,
    settled: false, life: 40, arm: 0.5, taken: false,
  });
  return true;
}

export function updateShards(world, dt, t, player) {
  if (!world.shards) return;
  const magnet = player.buffs && player.buffs.magnet > 0;
  for (const s of world.shards) {
    if (s.taken) continue;
    s.life -= dt;
    if (s.arm > 0) s.arm -= dt;
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
    if (s.arm <= 0 && s.settled && d2 < pullR * pullR && d2 > 0.3 * 0.3) {
      const d = Math.sqrt(d2);
      const pull = (magnet ? 10 : 6) * dt;
      s.x += (dx / d) * pull;
      s.z += (dz / d) * pull;
    }
    if ((s.arm <= 0 && d2 < 0.45 * 0.45) || s.life <= 0) {
      s.taken = true;
      world.root.remove(s.mesh);
      if (s.life > 0) {
        if (s.kind === 'potion') {
          if (lootEvents.onPotion) lootEvents.onPotion();
        } else {
          state.shards++;
          bumpCounter('shardsEarned');
          audio.play('coin', { volume: 0.35, rate: 1.5, vary: 0.2 });
          if (lootEvents.onShards) lootEvents.onShards();
        }
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
  // SCALE 0.85, NOT 0.55. Dad's words: "they are so small whatever they are you
  // can barely see them". A breakable is a thing a child is meant to spot from
  // across the room and run at; at 0.55 a crate was ankle-high clutter. The
  // collider grows with it so it still feels like hitting a box.
  constructor(world, gltf, x, z, { shards = 2, scale = 0.85 } = {}) {
    this.world = world;
    this.root = prepareModel(gltf.scene.clone());
    this.root.position.set(x, 0, z);
    this.root.rotation.y = (x * 7 + z * 3) % 6.28;
    this.root.scale.setScalar(scale);
    world.add(this.root);
    this.x = x; this.z = z;
    this.radius = 0.42 * (scale / 0.55);
    this.hp = 1;
    this.dead = false;
    this.stunned = 0;
    this.scenery = true; // a pot, not a foe: never feeds the moon gauge,
                         // never shoved by transformation shockwaves
    this.shardCount = shards;
    world.addCircle(x, z, 0.38 * (scale / 0.55));
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
    // ...AND SOMETIMES A POTION. Dad: breakables should be "filled with not only
    // coins but the occasional potion to heal". One in seven, and only when the
    // child has room to carry it — a potion that vanishes because the belt is
    // full teaches that breaking things is pointless. It arcs out like the
    // coins do and waits to be walked over.
    if (lootEvents.onPotionDrop && Math.random() < 0.14) lootEvents.onPotionDrop(this.x, this.z);
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
