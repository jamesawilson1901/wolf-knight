// Loot: ember shards (currency coins), breakable pots/crates, and chests.
// Shards scatter with a little hop, sparkle, and fly to Kael when close (or
// from far away with the Magnet buff). Chests persist per save; breakables
// respawn with the room (small change, not farming gold).

import * as THREE from 'three';
import { loadGLB, prepareModel, prepareCharacter, SHARED } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
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

// A COIN A CHILD CAN ACTUALLY SEE, ON A PHONE, FROM THE 3/4 CAMERA.
//
// Dad: "make the coins large and noticeable to the user when the chest is
// opened or the crate is broken. at the moment I can't see them at all."
// coin.glb is 0.4u across, and at the old 1.55 it rendered 62cm — a third of
// Kael's height, lying almost flat on the floor, in a room thirty metres wide.
// It was drawn, it span, it bounced, and from the camera it was a glint.
//
// 2.4 puts it just under a metre: about half Kael's height, the same read a
// Mario coin has against Mario, and unmissable against a stone floor. The rest
// height comes OFF the scale rather than being typed, because the old 0.25 was
// already burying the small coin's lower edge — the same measure-the-model
// lesson the chests, the crate and the vase each had to learn separately.
//
// 3.4 (2026-08-30). Dad, replaying Ember: "coins are still not visible. they
// aren't meant to be realistic if that's why you keep making them so small."
// 2.4 was sized against a stone floor; against Ember's orange it is gold on
// orange and disappears. He is right about the register too — this is a
// cartoon, the coin is a CELEBRATION, and at 3.4 (~70% of Kael) it reads
// from the couch. Emissive up a notch with it, for the dark rooms.
const SHARD_SCALE = 3.4;
const SHARD_REST = 0.4 * SHARD_SCALE * 0.5;   // sit ON the floor, not in it

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
        if (c.emissive) { c.emissive.setHex(0xff9c1a); c.emissiveIntensity = 1.1; }
        c.metalness = 0.35; c.roughness = 0.35;
        return c;
      });
      if (!Array.isArray(n.material)) n.material = n.material[0];
    });
    coin.scale.setScalar(SHARD_SCALE);
    const a = (i / Math.max(1, n)) * Math.PI * 2 + x;
    // launch from the REST height, not a hard 0.4 — at 3.4x the rest is
    // 0.68 and a coin starting below it lost most of its arc. The throw is
    // 3.2/3.6, not the 4.2/5.2 that shipped first: those arcs peaked at
    // ~1.9u — Kael's own height — and dad's very next session reported "a
    // shard over your head". Impact speed IS launch speed on flat ground,
    // and three hops need ≥2.8 at the floor, so 3.2 keeps the bounce
    // promise with the apex at chest height instead of overhead.
    coin.position.set(x, SHARD_REST, z);
    world.add(coin);
    world.shards.push({
      mesh: coin,
      x: x + Math.cos(a) * 0.01,
      z: z + Math.sin(a) * 0.01,
      vx: Math.cos(a) * (1.2 + (i % 3) * 0.5),
      vz: Math.sin(a) * (1.2 + (i % 3) * 0.5),
      vy: 3.2 + (i % 2) * 0.4,
      y: SHARD_REST,
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
      //
      // 0.85, not 0.5, since v3.70. `arm` gates the MAGNET as well as the
      // pickup, and the magnet reaches 2.2u — so a child standing at the chest
      // they just opened had the whole payout land and be hoovered up inside
      // about a third of a second. Dad: "I can't see them at all." Bigger coins
      // alone would not have fixed that; they also have to still be there. This
      // is the extra beat where the money is lying on the floor being money.
      arm: 0.85,
      taken: false,
    });
  }
}

// THE ONE POTION LOOK (LAW P5): a glass beaker with red liquid and a cork —
// director's ruling, universal RED beaker, everywhere a potion appears. This
// was three different looks (a teal-lit Vase.glb here, a matching-but-
// independent glass/liquid/cork build in rooms.js's potionPickup, and the
// HUD emoji) — "there is no potion model in the pack" was also simply
// false, `assets/env/props/potion.glb` sits on disk unused, but the fix
// that actually converges every LOOK is this shared builder, not swapping
// which unused GLB gets loaded. rooms.js's potionPickup calls this too, so
// there is exactly one place that draws a potion.
export function buildPotionMesh() {
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
  // NAMED, ALL OF THEM: a pickup hovers and bobs on purpose, and
  // verify-grounded exempts deliberate floaters BY NAME. Its first pass over
  // Frostpeak flagged the cork — a 0.08u disc riding 0.46u up the bottle —
  // as "(unnamed)" hovering, which is exactly what an anonymous mesh half a
  // unit off the floor should be flagged as. One name here covers the floor
  // pickup and the smashable drop both (LAW P5: one potion, drawn once).
  group.traverse((n) => { if (n.isMesh) n.name = n.name || 'potion-part'; });
  group.name = 'potion-pickup';
  return { group, liquid };
}

// Nothing to preload anymore — buildPotionMesh() is code-built, not a GLB
// load — kept as a no-op so main.js's existing `await preloadPotionDrop()`
// call site needs no change.
export async function preloadPotionDrop() {}

export function spawnPotionDrop(world, x, z) {
  if (!world.shards) world.shards = [];
  const { group: inner } = buildPotionMesh();
  inner.position.set(x, 0.4, z);
  world.add(inner);
  world.shards.push({
    mesh: inner, kind: 'potion',
    x, z, vx: 0, vz: 0, vy: 3.4, y: 0.4,
    settled: false, life: 40, arm: 0.5, taken: false,
  });
  return true;
}

// A REWARD THAT ONLY EVER APPEARED IN A TOAST. Chest shards/potions have
// always sprung out and landed for real (see spawnShards/spawnPotionDrop
// above) — gear, armour, heart pieces and keys never did. giveLoot() grants
// them straight into state and prints a line of text; the chest itself does
// a lid-open hop, but the REWARD was never physically in the world at all
// (real-play report: "physical coins and potions should spring out of the
// chests or weapons if that's what there are" — this is the "or weapons"
// half: a found sword is still nothing you ever see fly out of the box).
// Purely additive and purely visual — the grant already happened by the
// time this is called, so there is nothing to pick up and nothing to lose;
// it only needs to arc, land, and fade, the same physics as a coin's hop
// with no magnet/collection step after it.
// THE THING ITSELF COMES OUT OF THE CHEST. Dad: "when shields and weapons
// come out the chest, don't use a generic round orange dot like you have.
// there are shield assets available. use them." He is right twice over: the
// Round Guard's emoji is literally 🟠, and every gear def already names its
// real model file. So a weapon or shield now flies out as the actual 3D
// item — normalized to a readable size, tinted like the equipped version,
// spinning as it arcs and bounces — and the emoji pop stays only for the
// things with no model to show (potions, hearts, keys, armour plate).
const gearDropCache = new Map();

// The shared pop animator: any object flies out of the chest, bounces,
// spins, fades. Splitting this from the gear loader is what let the potion,
// the heart piece, the key and armour plate all become REAL things too —
// dad's rule after the Round Guard incident: "don't use emojis anywhere!"
function animateItemPop(world, m, mats, x, z, seatIndex) {
    const holder = new THREE.Group();
    holder.add(m);
    holder.position.set(x, 0.5, z);
    world.add(holder);
    world.keepLoose(holder);
    const a = seatIndex * 1.15 + 0.4;
    let vx = Math.cos(a) * 1.1, vz = Math.sin(a) * 1.1, vy = 3.6, y = 0.5;
    let settled = false, t = 0;
    const DURATION = 3.8;   // a touch longer than the emoji pop — it earned it
    world.onAnimate((tt, dt) => {
      t += dt;
      if (!settled) {
        holder.position.x += vx * dt; holder.position.z += vz * dt;
        y += vy * dt; vy -= 11 * dt;
        if (y <= 0.55) {
          y = 0.55;
          vy = -vy * 0.42;
          vx *= 0.5; vz *= 0.5;
          if (vy < 0.8) { vy = 0; settled = true; }
        }
      } else {
        y = 0.55 + Math.sin(tt * 3 + a) * 0.06;
      }
      holder.position.y = y;
      holder.rotation.y = tt * 2.2 + a;   // turn so the shape reads from any seat
      if (t > DURATION - 0.6) {
        const o = Math.max(0, (DURATION - t) / 0.6);
        for (const c of mats) c.opacity = o;
      }
      if (t > DURATION && holder.parent) {
        world.root.remove(holder);
        for (const c of mats) c.dispose();
      }
    });
}

// Prepare a loaded model for popping: normalized size, optional tint,
// fade-ready cloned materials.
function preparePopModel(gltf, tint, targetSize = 1.5) {
  const m = prepareModel(gltf.scene.clone(), { castShadow: false });
  const bb = new THREE.Box3().setFromObject(m);
  const size = bb.getSize(new THREE.Vector3());
  m.scale.setScalar(targetSize / Math.max(size.x, size.y, size.z, 0.001));
  const mats = [];
  m.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const list = Array.isArray(n.material) ? n.material : [n.material];
    n.material = list.map((mat) => {
      const c = mat.clone();
      if (tint && c.color) c.color.setHex(tint);
      c.transparent = true;
      mats.push(c);
      return c;
    });
    if (!Array.isArray(n.material)) n.material = n.material[0];
  });
  return { m, mats };
}

export function spawnGearDrop(world, x, z, def, seatIndex = 0) {
  (async () => {
    let gltf;
    try {
      if (!gearDropCache.has(def.file)) gearDropCache.set(def.file, await loadGLB(def.file));
      gltf = gearDropCache.get(def.file);
    } catch (e) {
      console.warn('[loot] gear pop model missing:', def.file, e);
      return;                                     // toast still names the find
    }
    const { m, mats } = preparePopModel(gltf, def.tint, def.size || 1.5);
    animateItemPop(world, m, mats, x, z, seatIndex);
  })();
}

// A code-built mesh (the potion) pops through the same animator.
export function spawnMeshPop(world, x, z, group, seatIndex = 0) {
  const mats = [];
  group.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    n.material = n.material.clone();
    n.material.transparent = true;
    mats.push(n.material);
  });
  animateItemPop(world, group, mats, x, z, seatIndex);
}

export function spawnRewardPop(world, x, z, icon, seatIndex = 0) {
  // Drawn at 256 rather than 128 because the sprite is now twice the size on
  // screen — a 128px emoji stretched to 1.4u is a blurry smudge, and the point
  // of the whole pop is that a child can tell a sword from a shield at a
  // glance without reading the toast.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.font = '184px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 128, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.position.set(x, 0.5, z);
  // Dad: "I can see the weapons but even they could be larger." 0.7 was a
  // third of Kael's height and it flew, bounced and faded inside 2.6 seconds,
  // which is not long enough to notice something small.
  sp.scale.set(1.4, 1.4, 1);
  sp.renderOrder = 998;
  world.add(sp);
  const a = seatIndex * 1.15 + 0.4; // several rewards from one chest fan out, not stack
  let vx = Math.cos(a) * 1.1, vz = Math.sin(a) * 1.1, vy = 3.6, y = 0.5;
  let settled = false, t = 0;
  // ...and it stays up half a second longer, because the reward being ON the
  // floor is the half of the arc a child actually looks at.
  const DURATION = 3.4;
  world.onAnimate((tt, dt) => {
    t += dt;
    if (!settled) {
      sp.position.x += vx * dt; sp.position.z += vz * dt;
      y += vy * dt; vy -= 11 * dt;
      // bounces like the coins do, so a weapon out of a chest reads as a thing
      // thrown onto the floor rather than a label appearing in the air
      if (y <= 0.55) {
        y = 0.55;
        vy = -vy * 0.42;
        vx *= 0.5; vz *= 0.5;
        if (vy < 0.8) { vy = 0; settled = true; }
      }
    } else {
      y = 0.55 + Math.sin(tt * 3 + a) * 0.06;
    }
    sp.position.y = y;
    if (t > DURATION - 0.6) sp.material.opacity = Math.max(0, (DURATION - t) / 0.6);
    if (t > DURATION) { world.root.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
  });
  return sp;
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
      if (s.y <= SHARD_REST && s.vy < 0) {
        // IT BOUNCES. Dad: "there should also be an animation on that item
        // bounce out on the floor a few times." A coin used to fly one arc and
        // stick to the floor dead, which reads as a sprite being placed rather
        // than a thing being thrown. Each landing keeps 45% of the fall and
        // sheds most of the skid, so it hops smaller and smaller — typically
        // three or four times from the spawn arc — and settles once the hop is
        // too small to see. The pickup arm timer is untouched, so the "flies
        // out, lands, THEN is yours" rule above still holds.
        s.y = SHARD_REST;
        // 0.5 and 0.7, not 0.45 and 0.9: run the numbers with the spawn arcs
        // above (vy 3 or 4, gravity 12) and the old pair gave HALF the coins
        // exactly two hops — "a few times" was true only for the lucky half.
        // verify-smash finally joined the sweep and caught it the same night.
        // With this pair every coin hops three times before it settles.
        s.vy = -s.vy * 0.5;
        s.vx *= 0.55; s.vz *= 0.55;
        s.hops = (s.hops || 0) + 1;
        if (s.vy < 0.7) { s.vy = 0; s.settled = true; }
        // ONE chink per coin, on its first landing. A pot drops five coins and
        // each hops three or four times; chinking on every hop is twenty plays
        // inside a second, which is mud rather than sparkle. The spread of
        // first-landings across the arc is what makes it read as a scatter.
        else if (s.hops === 1) audio.play('coin', { volume: 0.16, rate: 2.1, vary: 0.25 });
      }
    } else {
      s.y = SHARD_REST + Math.sin(t * 3 + s.x * 2) * 0.05;
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
// SIZED DOWN ~15% (2026-08-30). The character-sized pass overshot: dad,
// replaying — "make all the chests a bit smaller, same with the barrels and
// crates". Still furniture, no longer freight.
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
// What each material sounds like coming apart. Layered: an impact plus a body.
const SMASH_SFX = {
  crate:  [{ n: 'hit', v: 0.6, r: 0.62 }, { n: 'whoosh', v: 0.3, r: 1.5 }],
  box:    [{ n: 'hit', v: 0.55, r: 0.72 }, { n: 'whoosh', v: 0.28, r: 1.6 }],
  barrel: [{ n: 'hit', v: 0.62, r: 0.5 }, { n: 'whoosh', v: 0.32, r: 1.3 }],
  cask:   [{ n: 'hit', v: 0.58, r: 0.58 }, { n: 'whoosh', v: 0.3, r: 1.4 }],
  // clay: brighter, shorter, with the dusty tail `puff` already carries
  vase:   [{ n: 'hit', v: 0.5, r: 1.55 }, { n: 'puff', v: 0.42, r: 1.5 }],
  jar:    [{ n: 'hit', v: 0.46, r: 1.75 }, { n: 'puff', v: 0.38, r: 1.65 }],
  // a chest bursting: the lid lets go, then the boards do
  chest:  [{ n: 'chest-open', v: 0.7, r: 1.25 }, { n: 'hit', v: 0.55, r: 0.7 }],
};

const BREAK_KINDS = {
  crate:  { url: './assets/env/dungeon/Crate.glb',        size: 1.30, shards: 2 },
  // the same crate, low and wide: a supply box rather than a shipping one
  box:    { url: './assets/env/dungeon/Crate.glb',        size: 1.05, shards: 2, squash: 1.25 },
  barrel: { url: './assets/env/dungeon/Barrel.glb',       size: 1.45, shards: 3 },
  // A CASK, NOT AN OIL DRUM. This pointed at the survival pack's barrel, which
  // is a red steel drum with a ring lid — dad spotted it in the Den at a glance:
  // "replace industrial barrels with wooden ones or something that fits the
  // ascetic of the game." He is right, and no amount of tinting makes a pressed
  // steel rim read as a cooper's cask. It is the dungeon barrel again, shorter
  // and darker: same mesh, different silhouette, one more draw call saved.
  cask:   { url: './assets/env/dungeon/Barrel.glb',       size: 1.10, shards: 2,
    tint: 0x6b4a2f, squash: 1.30 },
  vase:   { url: './assets/env/dungeon/Vase.glb',         size: 1.25, shards: 2 },
  // a squat clay jar: the vase again, shorter, wider and browner. Same mesh, and
  // the asset-multiplication law says that is a feature.
  jar:    { url: './assets/env/dungeon/Vase.glb',         size: 1.00, shards: 1,
    tint: 0xb07a4e, squash: 1.35 },
  // AND CHESTS. They burst rather than open — the standing chests are a
  // different thing with a different promise. This is the one a child hopes
  // for: five coins, and a potion better than half the time.
  chest:  { url: './assets/loot/survival/chest-wood.glb', size: 1.25, shards: 5,
    potion: 0.55 },
  // and the rare one, worth running across a room for
  goldchest: { url: './assets/loot/pirate/chest-gold.glb', size: 1.25, shards: 12,
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
    potion = 0.14, collapsed = null, kind = 'crate' } = {}) {
    this.world = world;
    this.kind = kind;   // chooses the smash sound (SMASH_SFX)
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
    // WOOD SPLINTERS, CLAY SHATTERS. Every breakable in the game used to make
    // one sound: `burn` at rate 1.3, a fire hiss borrowed because it was
    // handy. A crate and a clay jar broke identically and neither sounded like
    // breaking — dad: "there should be a sound effect when the crate, chest,
    // barrel they are in is smashed."
    //
    // No new audio was added: these are the existing CC0 files pitched to the
    // material. `hit` low and heavy is a wooden crack; `hit` bright and fast
    // over `puff` is pottery going to pieces; a chest bursting gets its own
    // lid-and-hinge crack. All three are layered under a WHOOSH of the thing
    // coming apart so the break has a body, not just a click.
    const smash = SMASH_SFX[this.kind] || SMASH_SFX.crate;
    for (const s of smash) audio.play(s.n, { volume: s.v, rate: s.r, vary: 0.09 });
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
    // `kind` last and resolved: a spot naming something that does not exist
    // falls back to the crate, and must sound like the crate it became rather
    // than like the name it asked for.
    world.enemies.push(new Breakable(world, breakGltf[def.url], s.x, s.z,
      { ...def, ...s, collapsed: breakCollapsed[kind], kind }));
  }
}

// ---------------------------------------------------------------------------
// Chests — wooden (shards/potion) and golden (gear/treasure). Walk close to
// open; opened chests stay open forever (state.flags.chests).
// ---------------------------------------------------------------------------

// THE ANIMATED CHEST KIT (assets/env/props/chest-kit.glb, uploader-supplied).
// One GLB holds three rigged chests — Golden, Silver, Wooden — each a clean
// subtree with its own skeleton and an OpenChest clip that swings the lid on a
// BoneCover bone. The game's chests used to be static models that only dimmed
// when looted; now the lid actually opens. Same SkeletonUtils.clone + mixer
// pattern the player and Pip already use, so nothing new is asked of the loader.
let chestKit = null;
const KIT_GROUP = { gold: 'GoldenChest', silver: 'SilverChest[', wood: 'WoodenChest' };
const KIT_OPEN  = { gold: 'GoldenChest|OpenChest', silver: 'SilverChest[|OpenChest', wood: 'WoodenChest|OpenChest' };

// Isolate ONE tier out of the three-chest kit: clone the whole rig (skeletons
// and all), drop the two tiers we do not want, and centre what remains on the
// floor at the origin so the caller can scale and place it like any other model.
// THE CHEST THAT CAME WITH A FRIEND.
//
// Dad: "why do the smaller chests always appear in two, with only one
// opening? fix it. one chest that opens only."
//
// The middle chest in this kit is named `SilverChest[` in the glTF — a stray
// bracket baked in by whoever exported the FBX. three.js sanitises node names
// as it loads (PropertyBinding.sanitizeNodeName strips anything outside
// \w and -), so by the time the scene exists that node is called
// `SilverChest`, and getObjectByName('SilverChest[') matched nothing. The
// isolate loop below therefore removed gold and wood — whose names survive
// sanitising untouched — and silently left SILVER standing in every wood and
// every gold room, a metre and a bit away, un-animated because the mixer was
// only ever driving the tier that was asked for. Silver rooms looked right,
// which is why it hid: it was the one tier whose own name matched.
//
// Both lookups now try the raw name and the sanitised one, so the kit works
// whichever way a future three.js decides to spell it.
const sanitised = (s) => String(s).replace(/\s/g, '_').replace(/[^\w-]/g, '');
const findNode = (root, name) =>
  root.getObjectByName(name) || root.getObjectByName(sanitised(name)) || null;
const findClip = (clips, name) =>
  THREE.AnimationClip.findByName(clips || [], name)
  || (clips || []).find((c) => sanitised(c.name) === sanitised(name)) || null;

function buildKitChest(tier) {
  const inner = prepareCharacter(SkeletonUtils.clone(chestKit.scene));
  const keep = KIT_GROUP[tier] || KIT_GROUP.wood;
  for (const name of ['GoldenChest', 'SilverChest[', 'WoodenChest']) {
    if (name === keep) continue;
    const g = findNode(inner, name);
    if (g && g.parent) g.parent.remove(g);
  }
  // ANCHOR ON THE CHEST'S OWN NODE, NOT ON A BOUNDING BOX.
  //
  // These are SKINNED meshes, and a skinned mesh's geometry bounds sit in bind
  // space — they do not follow the armature that actually places the chest.
  // The three chests are laid out side by side in the kit (x = 0.03, 3.79,
  // 7.52; their armature nodes carry the offset), so a box-centre anchor put
  // every chest up to two and a half metres from the spot the room asked for.
  // With the phantom silver chest also in the box that error was hidden inside
  // a bigger one: the box spanned BOTH chests, which shrank the scale as well,
  // and "the smaller chests" were smaller than intended for exactly that
  // reason. The armature's world position is where the chest really is.
  inner.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const anchor = new THREE.Vector3();
  const keepNode = findNode(inner, keep);
  if (keepNode) keepNode.getWorldPosition(anchor);
  else box.getCenter(anchor);
  inner.position.set(-anchor.x, -box.min.y, -anchor.z);   // on its spot, on the floor
  const group = new THREE.Group();
  group.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const clip = findClip(chestKit.animations, KIT_OPEN[tier] || KIT_OPEN.wood);
  let openAction = null;
  if (clip) {
    openAction = mixer.clipAction(clip);
    openAction.loop = THREE.LoopOnce;
    openAction.clampWhenFinished = true;   // the lid stays up once it has opened
  }
  return { group, mixer, openAction, clipDur: clip ? clip.duration : 0,
    span: Math.max(0.01, size.x, size.y, size.z) };
}

export async function spawnChests(world, defs) {
  world.chests = [];
  // ONLY LOAD THE KIT WHEN A ROOM ACTUALLY HAS CHESTS. spawnChests runs for
  // EVERY room; loading the skinned 3-chest rig unconditionally made chestless
  // rooms (all of the Wild Woods, say) pay a load they never use, which was
  // enough to perturb verify-level3's timing/landmark checks. A room with no
  // chests now does exactly nothing, as before.
  if (!defs || !defs.length) return;
  if (!chestKit) chestKit = await loadGLB('./assets/env/props/chest-kit.glb');
  for (const def of defs) {
    const opened = !!state.flags.chests[def.id];
    const tier = def.tier === 'gold' ? 'gold' : def.tier === 'silver' ? 'silver' : 'wood';
    const kit = buildKitChest(tier);
    const mesh = kit.group;
    // MEASURE THE MODEL. DO NOT TYPE A NUMBER AT IT.
    //
    // This was scale 0.85 for gold and 0.75 for everything else — one pair of
    // constants for two models that are 4.6x apart. chest-wood.glb is 0.391u
    // along its longest side, so 0.75 rendered it at TWENTY-NINE CENTIMETRES
    // against Kael's 1.9u: nineteen of the game's forty-seven chests were
    // ankle-high in rooms thirty metres across, and since the opening radius is
    // 1.1u the fanfare fired for something no child ever saw. chest-gold.glb is
    // 1.785u and came out fine, which is why it was never noticed.
    //
    // The same mistake has now been found four times in this codebase — the
    // crate that was a stack of planks, the vase modelled a metre off its own
    // origin, the horse statue floating in the boss arena. Nothing measured a
    // model against itself. This does.
    const bb = new THREE.Box3().setFromObject(mesh);
    const dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z;
    const want = def.tier === 'gold' ? 1.15 : 0.95;   // a chest a child walks up to
    const s = want / Math.max(0.01, dx, dy, dz);
    mesh.position.set(def.x, 0, def.z);
    mesh.rotation.y = def.ry || 0;
    mesh.scale.setScalar(s);
    world.add(mesh);
    // ...and the collider comes from the measurement too. 0.45 was hard-coded,
    // which is three times too wide for a 29cm chest — an invisible wall around
    // nothing — and too narrow for a gold one, so a child clipped into its
    // corners. Half the larger footprint, with a floor so it is always catchable.
    world.addCircle(def.x, def.z, Math.max(0.42, Math.max(dx, dz) * s * 0.55));
    // The lid is a real animation now — drive it from the mixer every frame.
    world.onAnimate((t, dt) => kit.mixer.update(dt));
    if (opened) {
      // A chest a child already looted, coming back to a saved room, must show
      // its lid UP — otherwise it reads as un-opened and the fanfare that will
      // never fire again looks broken. Snap the open clip to its final frame.
      if (kit.openAction) { kit.openAction.play(); kit.mixer.setTime(kit.clipDur); }
    } else {
      // EVERY UNOPENED CHEST GLOWS, not just the gold ones. A reward you cannot
      // see is not a reward, and this is the exact promise the cracked-wall
      // gates make: the thing behind them was an unlit box a child had to walk
      // into by accident. Wood and silver get a cooler, quieter light so gold
      // still reads as the good one.
      const gold = def.tier === 'gold';
      const glow = new THREE.PointLight(gold ? 0xffd76a : 0xbfe6ff, gold ? 3 : 1.7,
        gold ? 5 : 3.6, 1.9);
      glow.position.set(def.x, 0.8, def.z);
      world.add(glow);
      // the pulse rides the chest's OWN brightness — a hard-coded 2.4 here would
      // have made a wooden chest breathe up to gold's intensity every two seconds
      const base = glow.intensity * 0.8, swing = glow.intensity * 0.27;
      const pulse = (t) => { glow.intensity = base + Math.sin(t * 2.6) * swing; };
      world.onAnimate(pulse);
      def._glow = glow; def._pulse = pulse;
    }
    world.chests.push({ ...def, mesh, opened, mixer: kit.mixer, openAction: kit.openAction, glow: def._glow });
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
    // THE LID SWINGS OPEN — the kit's own animation, played once and clamped.
    if (c.openAction) c.openAction.reset().play();
    // and the glow that said "come here" has done its job
    if (c.glow) c.glow.intensity = 0;
    // a small celebratory hop rides UNDER the lid swing (position only, so it
    // never fights the skinned lid bone)
    const mesh = c.mesh;
    let tPop = 0.45;
    world.onAnimate((t, dt) => {
      if (tPop <= 0) return;
      tPop -= dt;
      const f = 1 - Math.max(0, tPop) / 0.45;
      mesh.position.y = Math.sin(f * Math.PI) * 0.22;
    });
    if (c.loot.shards) spawnShards(world, c.x, c.z, c.loot.shards);
    giveLoot(c); // potions/gear/heart pieces/keys handled by main
  }
}
