// Loot: ember shards (currency coins), breakable pots/crates, and chests.
// Shards scatter with a little hop, sparkle, and fly to Kael when close (or
// from far away with the Magnet buff). Chests persist per save; breakables
// respawn with the room (small change, not farming gold).

import * as THREE from 'three';
import { loadGLB, prepareModel, SHARED } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  // RECENTRED, because Vase.glb is modelled 1.09u off its own origin in Z — so
  // the potion a child could see was over a metre from the potion they could
  // pick up. Wrapped rather than nudged, so the shard physics keeps driving one
  // object and this file keeps one rule about where a drop is.
  const inner = new THREE.Group();
  const bb = new THREE.Box3().setFromObject(m);
  m.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  inner.add(m);
  inner.scale.setScalar(0.55 / Math.max(0.01, bb.max.y - bb.min.y));   // 0.55m tall
  inner.position.set(x, 0.4, z);
  world.add(inner);
  world.shards.push({
    mesh: inner, kind: 'potion',
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

// THE SMASHABLES, AS A KIT.
//
// Dad, twice: "Smashable items should be replaced with chests, jars, crates,
// barrels etc filled with not only coins but the occasional potion to heal."
//
// It was three kinds — and two of those were the same wooden box from the same
// pack, so a cave, a quarry and a forge all had the identical crate in them.
// Seven now, from four kits, and they are deliberately different SILHOUETTES
// rather than different colours: a child playing on a phone in a dark room
// picks a shape out long before a tint.
//
// EVERY KIND IS SIZED BY MEASUREMENT, NOT BY A NUMBER SOMEONE TYPED — and
// measuring is how the actual bug got found.
//
// Dad's other complaint: "little boxes on the ground that you hit and coins come
// out... they are so small whatever they are you can barely see them." The scale
// was bumped 0.55 → 0.85 and that was assumed to be that. It was not. The model
// the whole game called `crate` is `resource-planks.glb` under another name: a
// STACK OF PLANKS nine centimetres tall. At 0.85 it was a 7 cm smear on the
// floor, and no amount of scaling was going to turn it into a crate, because it
// was never a crate. Dad was not describing a small box. He was describing
// planks, and he was right that you cannot see what they are.
//
// So the crate is the dungeon kit's actual crate now, every model is measured on
// load, and each is scaled so its LARGEST dimension is `size` — height alone
// would have quietly turned that plank stack into a four-metre pancake, which is
// what the first version of this did.
// CHARACTER SIZED. Dad, with a screenshot: "remove the breakables that look
// like the small one in the image. replace all the breakables with character
// sized chests, barrels, crates etc."
//
// Kael measures 1.9u tall (tools/probe-modelsize.mjs against the player), so
// these run 1.2 to 1.7 — chest-height to shoulder-height on him. A smashable is
// meant to be spotted from the far side of a room and run at; the thing in his
// screenshot was a nine-centimetre plank stack, and even the honest crate that
// replaced it stood barely past Kael's knee. `size` is the model's largest
// dimension, so these are real furniture.
const BREAK_KINDS = {
  crate:  { url: './assets/env/dungeon/Crate.glb',        size: 1.55, shards: 2 },
  // the same crate, low and wide: a supply box rather than a shipping one
  box:    { url: './assets/env/dungeon/Crate.glb',        size: 1.25, shards: 2, squash: 1.25 },
  barrel: { url: './assets/env/dungeon/Barrel.glb',       size: 1.70, shards: 3 },
  // A CASK, NOT AN OIL DRUM. This pointed at the survival pack's barrel, which
  // is a red steel drum with a ring lid — dad spotted it in the Den at a glance:
  // "replace industrial barrels with wooden ones or something that fits the
  // ascetic of the game." He is right, and no amount of tinting makes a pressed
  // steel rim read as a cooper's cask. It is the dungeon barrel again, shorter
  // and darker: same mesh, different silhouette, one more draw call saved.
  cask:   { url: './assets/env/dungeon/Barrel.glb',       size: 1.30, shards: 2,
    tint: 0x6b4a2f, squash: 1.30 },
  vase:   { url: './assets/env/dungeon/Vase.glb',         size: 1.50, shards: 2 },
  // a squat clay jar: the vase again, shorter, wider and browner. Same mesh, and
  // the asset-multiplication law says that is a feature.
  jar:    { url: './assets/env/dungeon/Vase.glb',         size: 1.20, shards: 1,
    tint: 0xb07a4e, squash: 1.35 },
  // AND CHESTS. They burst rather than open — the standing chests are a
  // different thing with a different promise. This is the one a child hopes
  // for: five coins, and a potion better than half the time.
  chest:  { url: './assets/loot/survival/chest-wood.glb', size: 1.45, shards: 5,
    potion: 0.55 },
  // and the rare one, worth running across a room for
  goldchest: { url: './assets/loot/pirate/chest-gold.glb', size: 1.45, shards: 12,
    potion: 0.75 },
};
const breakGltf = {};
const breakCollapsed = {};

// ONE SMASHABLE, ONE DRAW CALL — WHATEVER MODEL IT IS.
//
// A breakable cannot join the room's static batch: it has to come apart on its
// own, so it stays a separate object forever. That was one draw call each while
// every smashable in the game was a single-mesh plank stack. The moment they
// became real props it stopped being true — the dungeon crate is two meshes,
// its barrel is three — and the Sunken Vale's d1b went straight through the
// 125-call ceiling to 128.
//
// The honest fix is not fewer pots or a cheaper kit. It is that a pot should
// cost the same whatever it is made of, so choosing a better model is never a
// budget decision. Each KIND is collapsed ONCE, at load: meshes that share a
// material merge outright, and where the materials are flat colours with no
// texture (the whole Quaternius dungeon kit) their colours bake into vertices
// and the lot becomes a single mesh. Both cases end at one call, and a kind
// that cannot be collapsed safely is simply left alone rather than risked.
function collapse(gltf) {
  const src = prepareModel(gltf.scene.clone());
  const meshes = [];
  src.updateWorldMatrix(true, true);
  let ok = true;
  src.traverse((n) => {
    if (!n.isMesh) return;
    if (Array.isArray(n.material) || n.isSkinnedMesh || n.isInstancedMesh) { ok = false; return; }
    meshes.push(n);
  });
  if (!ok || meshes.length < 2) return null;
  const maps = new Set(meshes.map((m) => (m.material.map ? m.material.map.uuid : '')));
  if (maps.size > 1) return null;              // different textures cannot merge
  const textured = !!meshes[0].material.map;
  // a textured set must also agree on colour, or merging would repaint it
  if (textured && new Set(meshes.map((m) => m.material.color.getHex())).size > 1) return null;
  const geos = [];
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(
        new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!textured) {
      // bake this mesh's flat colour into its vertices
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const c = m.material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    } else if (g.attributes.color) {
      g.deleteAttribute('color');
    }
    geos.push(g);
  }
  let merged = null;
  try { merged = mergeGeometries(geos, false); } catch { merged = null; }
  for (const g of geos) g.dispose();
  if (!merged) return null;
  const base = meshes[0].material;
  const mat = new THREE.MeshStandardMaterial({
    map: base.map || null,
    color: textured ? base.color.clone() : 0xffffff,
    vertexColors: !textured,
    roughness: base.roughness !== undefined ? base.roughness : 1,
    metalness: base.metalness !== undefined ? base.metalness : 0,
  });
  // REGISTER AS SHARED, or the first room to be torn down frees the geometry
  // every later room is still drawing from and the crates render as nothing.
  // This is the same registry the GLB cache uses (js/assets.js), and the same
  // trap the level kit's tint cache had to be taught about.
  SHARED.add(merged);
  SHARED.add(mat);
  if (mat.map) SHARED.add(mat.map);
  return { geometry: merged, material: mat };
}

export class Breakable {
  constructor(world, gltf, x, z, { shards = 2, size = 1.0, tint = 0, squash = 1,
    potion = 0.14, collapsed = null } = {}) {
    this.world = world;
    const model = collapsed
      ? new THREE.Mesh(collapsed.geometry, collapsed.material)
      : prepareModel(gltf.scene.clone());
    if (collapsed) { model.castShadow = true; model.receiveShadow = true; }
    // MEASURE FIRST, in the model's own units and before anything is moved.
    const bb = new THREE.Box3().setFromObject(model);
    const dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z;
    const s = size / Math.max(0.01, dx, dy, dz);
    // RECENTRE, DO NOT ASSUME. `Vase.glb` is modelled a metre and a bit off its
    // own origin in Z, so every vase in the game — and every potion dropped from
    // a smashed one, since the drop borrows the same mesh — was drawn well over
    // a metre from where the level put it. A child walked at the pot they could
    // see and hit nothing. Nothing in the game had ever measured a model against
    // its own pivot, so nothing had ever noticed.
    model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    if (tint) {
      model.traverse((n) => {
        if (!n.isMesh || !n.material) return;
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        n.material = mats.map((m) => {
          const c = m.clone();
          if (c.color) c.color.setHex(tint);
          // a collapsed prop carries its colour in the vertices, so tinting has
          // to switch that off or the bake would win
          c.vertexColors = false;
          return c;
        });
        if (!Array.isArray(n.material)) n.material = n.material[0];
      });
    }
    this.root = new THREE.Group();
    this.root.add(model);
    this.root.scale.set(s * squash, s, s * squash);
    this.root.position.set(x, world.deckY || 0, z);
    this.root.rotation.y = (x * 7 + z * 3) % 6.28;
    world.add(this.root);
    this.x = x; this.z = z;
    // the collider follows the measured footprint rather than a guess
    const foot = Math.max(dx, dz) * s * squash;
    this.radius = Math.max(0.4, foot * 0.55);
    this.hp = 1;
    this.dead = false;
    this.stunned = 0;
    this.scenery = true; // a pot, not a foe: never feeds the moon gauge,
                         // never shoved by transformation shockwaves
    this.shardCount = shards;
    this.potionChance = potion;
    world.addCircle(x, z, Math.max(0.34, foot * 0.46));
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
    if (lootEvents.onPotionDrop && Math.random() < this.potionChance) {
      lootEvents.onPotionDrop(this.x, this.z);
    }
    // rare bonus: a power-up pops out (wired by powerups.js via hook)
    if (this.world.onBreakableSmashed) this.world.onBreakableSmashed(this.x, this.z);
  }
  update() {}
}

export const BREAKABLE_KINDS = Object.keys(BREAK_KINDS);

export async function spawnBreakables(world, spots) {
  // Load only the kinds this room actually asks for, plus the crate as the
  // fallback for a spot that names something that does not exist.
  const want = new Set(['crate']);
  for (const s of spots) if (BREAK_KINDS[s.kind]) want.add(s.kind);
  await Promise.all([...want].map(async (k) => {
    const url = BREAK_KINDS[k].url;
    if (!breakGltf[url]) breakGltf[url] = await loadGLB(url);
  }));
  for (const s of spots) {
    const kind = BREAK_KINDS[s.kind] ? s.kind : 'crate';
    const def = BREAK_KINDS[kind];
    // collapsed per KIND, not per url: `jar` is a tinted vase and must not
    // share the vase's baked material
    if (breakCollapsed[kind] === undefined) breakCollapsed[kind] = collapse(breakGltf[def.url]);
    world.enemies.push(new Breakable(world, breakGltf[def.url], s.x, s.z,
      { ...def, ...s, collapsed: breakCollapsed[kind] }));
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
