// Enemies — per design/COMBAT-SPEC.md. Forgiving and readable: slow grunts,
// ~1-second telegraphs on anything that lunges, puff-of-smoke deaths.
// Shades and Ember Moths are code-built shadow creatures (ASSETS.md casting
// sheet); the Shadow Hound is the Quaternius wolf tinted near-black.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
// THE ATTACK CLOCK (js/attacks.js). Every telegraph/recovery below reads
// from that one table, which tools/verify-combat-laws.mjs also reads — so a
// windup can never quietly drift under the floor again (LAW 7, extended
// from hitboxes to clocks). Four of them had.
import { ATTACK as A, phase } from './attacks.js';
const P_LUNGE = phase('minion_lunge');
const P_SWING = phase('shield_swing');
import { audio } from './audio.js';
import { grantXp, XP_VALUES, bumpCounter, enemyScale } from './progress.js';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { juice } from './juice.js';
import { spawnGearDrop } from './loot.js';
import { addGear, ownsGear, shopStock, WEAPONS, SHIELDS } from './items.js';

// AWARENESS, the middle state. Two numbers, both about a child rather than a
// simulation: how close you have to be before a shadow half-notices, and how
// long it takes to decide. Two seconds is long — deliberately. It is the window
// in which a five-year-old sees the eyes come up and gets to ghost or back off,
// and the whole point of the state is that the window exists.
const SUSPECT_R = 5.5;
// How far a shadow can see a GHOSTED Kael: arm's length, so being stood on
// still gives him away, and nothing else does. See senseRange().
const GHOST_SIGHT = 1.3;
const SUSPECT_HOLD = 2.0;

// ---------------------------------------------------------------------------
// Death puff: a harmless burst of smoke
// ---------------------------------------------------------------------------

export function smokePuff(world, x, y, z, tint = 0x5a4d66) {
  const bits = [];
  const mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.85, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.05, 0), mat.clone());
    const a = (i / 8) * Math.PI * 2 + 0.4;
    m.position.set(x, y + 0.15 * (i % 3), z);
    m.userData.v = new THREE.Vector3(Math.cos(a) * (1 + (i % 2)), 1.4 + (i % 3) * 0.5, Math.sin(a) * (1 + ((i + 1) % 2)));
    world.add(m);
    bits.push(m);
  }
  let life = 0.65;
  world.onAnimate((t, dt) => {
    if (life <= 0) return;
    life -= dt;
    for (const m of bits) {
      m.position.addScaledVector(m.userData.v, dt);
      m.userData.v.y -= dt * 2.2;
      m.scale.multiplyScalar(1 + dt * 2.4);
      m.material.opacity = Math.max(0, 0.85 * (life / 0.65));
    }
    if (life <= 0) for (const m of bits) world.root.remove(m);
  });
}

// ---------------------------------------------------------------------------
// Base enemy
// ---------------------------------------------------------------------------

// Elemental traits (design/GAME-CONTRACT.md): every family has a WEAKNESS
// that takes 1.5x; ARMORED bone takes half from steel (the knight's sword)
// but 1.35x from anything magical (bolts, wolf bites, wolf specials).
// Grimm's shadow-things fear Luna's MOON; old bones fear FIRE.
const TRAITS = {
  Shade: { weakness: 'moon' },
  Moth: { weakness: 'moon' },
  Hound: { weakness: 'moon' },
  Slime: { weakness: 'fire' },
  // THE FIRE-SPITTER, which had no elemental identity at all — it looked like
  // a slime (whose lesson is "slimes fear fire"), so a child hit it with fire
  // and got nothing: no SUPER!, no RESIST, no lesson either way. Dad's call:
  // a thing that spits fire SHRUGS OFF fire and fears WATER and ICE. That
  // makes it the game's clearest RESIST teacher — in Stoneroot, where fire is
  // the child's whole toolkit, this one says "not that, switch" — and it
  // turns a later return with Frost or Tide into a real payoff.
  Spitter: { weakness: ['tide', 'frost'], resist: 'fire' },
  Bat: { weakness: 'fire' },
  SkeletonMinion: { weakness: 'fire', armored: true },
  SkeletonRogue: { weakness: 'fire', armored: true },
  SkeletonShield: { weakness: 'fire', armored: true },
  BoneWarden: { weakness: 'fire', armored: true },

  // --- Roster expansion (task #31). One class often serves several roster
  // ids across different regions (e.g. Duellist is both the frost Visored
  // Wight and the Shadow Court's Gilded Husk) — this is the CLASS DEFAULT,
  // same as every family above; spawnEnemies() overrides `.weakness`/
  // `.resist` per instance where a region disagrees, exactly like VARIANTS
  // already does for Shade/Hound/Moth/Slime/Bat.
  Flanker: { weakness: 'moon' },
  Stalker: { weakness: 'moon' },
  RangedKiter: { weakness: 'moon' },
  RangedLobber: { weakness: 'fire' },
  RangedBolter: { weakness: 'earth' },
  DashStriker: { weakness: 'earth' },
  Duellist: { weakness: 'fire', armored: true },
  HeavySwinger: { weakness: 'fire', armored: true },
  // ShieldAdvancer was missing from this table entirely (audit 2026-08-24) —
  // it's a `shieldUp`-gated frontal-block class ("same law as SkeletonShield"
  // per its own §1.4a description) that was silently never armored as a
  // result: Enemy's constructor reads `armored` from HERE, not from the
  // shield-carrying behavior itself.
  ShieldAdvancer: { weakness: 'moon', armored: true },
  MirrorKael: { weakness: 'moon' },
  Flurry: { weakness: 'moon' },
  Commander: { weakness: 'fire', armored: true },
  SlowStomper: { weakness: 'fire', armored: true },
  Hopper: { weakness: 'fire' },
  Dragonling: { weakness: 'frost' },
};

// ---------------------------------------------------------------------------
// VARIANTS — the oldest trick in the book (standing rule): recolor, resize
// and restat the models we already ship. A spawn marker carries
// `variant: 'cinder'` and the base enemy becomes a new foe: different tint,
// size, hp, speed, element RESISTANCE (0.4x + a grey "RESIST" callout — the
// counterpart lesson to SUPER!). One model, many monsters.
// ---------------------------------------------------------------------------

// The Warden's chop covers 130 degrees (see _swingDamage below) — the telegraph
// arc and the hit test read the same constant so they can never drift apart.
const CHOP_ARC = THREE.MathUtils.degToRad(130);

export const VARIANTS = {
  // Kiln elite: a shade baked in the kiln's own fire — FIRE bounces off it
  // (the Fire Wolf's home advantage disappears; moon still shreds it)
  cinder: {
    label: 'Cinder Shade',
    scale: 1.3, hp: 4.5, speed: 3.0, resist: 'fire', dropChance: 0.7,
    puffTint: 0x6a2a10,
    tint: (m) => {
      if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(0xffd75a); m.emissiveIntensity = 2.0; }
      else if (m.color) { m.color.setHex(0x4a1408); m.emissive && m.emissive.setHex(0x8a2a10); m.emissiveIntensity = 0.5; }
    },
  },
  // The pack leader: bigger, tougher, faster charge, gold-burning eyes
  elder: {
    label: 'Elder Hound',
    scale: 1.3, hp: 6, chargeSpeed: 10.8, dropChance: 1,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xffd75a); m.emissiveIntensity = 1.8; }
    },
  },
  // A wall of old bone: slow, huge, hits harder — same armor law as all bone
  brute: {
    label: 'Bone Brute',
    scale: 1.4, hp: 5, speed: 1.1, contactDmg: 1.5, dropChance: 0.8,
    sharedMats: true, // skeletons share loader materials — clone before tinting
    tint: (m) => {
      if (m.color) m.color.multiplyScalar(0.82); // old bone runs darker
    },
  },

  // --- the WILD WOODS family (v3.19): forest creatures wound in thorns.
  // All of them FEAR FIRE (burn the brambles off) — the region's element
  // lesson, taught with the Fire Wolf the kids have owned since region 1.
  thorn: {
    label: 'Thorn Hound',
    hp: 3.5, weakness: 'fire', puffTint: 0x39502c, dropChance: 0.45,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xcaff8a); m.emissiveIntensity = 1.5; }
      else if (m.name === 'Main') { m.color && m.color.setHex(0x3c5a2e); }
      else if (m.name === 'Main_Light') { m.color && m.color.setHex(0x55793f); }
    },
  },
  elderthorn: {
    label: 'Elder Thorn Hound',
    scale: 1.3, hp: 6, chargeSpeed: 11, weakness: 'fire', dropChance: 1, puffTint: 0x39502c,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xffe14a); m.emissiveIntensity = 1.9; }
      else if (m.name === 'Main' || m.name === 'Main_Light') { m.color && m.color.setHex(0x2c4a22); }
    },
  },
  bramble: {
    label: 'Bramble Blob',
    hp: 3, weakness: 'fire', puffTint: 0x39502c,
    tint: (m) => {
      if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(0xcaff8a); m.emissiveIntensity = 1.6; }
      else if (m.color) { m.color.setHex(0x35521f); m.emissive && m.emissive.setHex(0x1d3312); m.emissiveIntensity = 0.35; }
    },
  },
  // --- FROSTPEAK (v3.21): rime-wrapped creatures. Everything here FEARS
  // FIRE — the same lesson the region's puzzles teach with melting ice.
  rime: {
    label: 'Rime Hound',
    hp: 4, weakness: 'fire', chargeSpeed: 10.2, puffTint: 0xcfeaff, dropChance: 0.5,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xeaffff); m.emissiveIntensity = 1.6; }
      else if (m.name === 'Main') { m.color && m.color.setHex(0x8fc4e8); }
      else if (m.name === 'Main_Light') { m.color && m.color.setHex(0xcfe8ff); }
    },
  },
  elderrime: {
    label: 'Elder Rime Hound',
    scale: 1.3, hp: 6.5, weakness: 'fire', chargeSpeed: 11.4, dropChance: 1, puffTint: 0xcfeaff,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0x9be3ff); m.emissiveIntensity = 2.0; }
      else if (m.name === 'Main') { m.color && m.color.setHex(0x6fa8d8); }
      else if (m.name === 'Main_Light') { m.color && m.color.setHex(0xbfe0ff); }
    },
  },
  snowblob: {
    label: 'Snow Blob',
    hp: 3.5, weakness: 'fire', puffTint: 0xeaffff,
    tint: (m) => {
      if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(0x9be3ff); m.emissiveIntensity = 1.5; }
      else if (m.color) { m.color.setHex(0xdff2ff); m.emissive && m.emissive.setHex(0x8fc4e8); m.emissiveIntensity = 0.3; }
    },
  },
  frostmoth: {
    label: 'Frost Moth',
    hp: 1.5, weakness: 'fire', puffTint: 0xeaffff,
    tint: (m) => {
      if (m.color) { m.color.setHex(0xbfe8ff); m.emissive && m.emissive.setHex(0x9be3ff); m.emissiveIntensity = 0.8; }
    },
  },
  // --- STORMREACH (region 5): creatures of the air, and the first family in
  // the game that does NOT fear fire. Four regions of "burn it" was becoming
  // the only answer a child ever needed; these fear EARTH — the stomp drops
  // them out of the air, and it is a tool the kids have owned since region 2.
  gale: {
    label: 'Gale Hound',
    hp: 4.5, weakness: 'earth', chargeSpeed: 11.0, puffTint: 0xdfe9f2, dropChance: 0.5,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xfff4b0); m.emissiveIntensity = 1.7; }
      else if (m.name === 'Main') { m.color && m.color.setHex(0x6f7a8c); }
      else if (m.name === 'Main_Light') { m.color && m.color.setHex(0xb8c2d4); }
    },
  },
  eldergale: {
    label: 'Storm Hound',
    scale: 1.32, hp: 7, weakness: 'earth', chargeSpeed: 12.2, dropChance: 1, puffTint: 0xdfe9f2,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xfff4b0); m.emissiveIntensity = 2.1; }
      else if (m.name === 'Main') { m.color && m.color.setHex(0x555f72); }
      else if (m.name === 'Main_Light') { m.color && m.color.setHex(0x9fabc0); }
    },
  },
  stormbat: {
    label: 'Storm Bat',
    hp: 2, weakness: 'earth', puffTint: 0xdfe9f2,
    tint: (m) => {
      if (m.color) { m.color.setHex(0xa8b4cc); m.emissive && m.emissive.setHex(0xc9d4ff); m.emissiveIntensity = 0.7; }
    },
  },
  sparkblob: {
    label: 'Spark Blob',
    hp: 3.5, weakness: 'earth', puffTint: 0xfff4b0,
    tint: (m) => {
      if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(0xfff4b0); m.emissiveIntensity = 1.8; }
      else if (m.color) { m.color.setHex(0xb9c4dc); m.emissive && m.emissive.setHex(0x8a9ad0); m.emissiveIntensity = 0.45; }
    },
  },
  // --- THE SHADOW COURT (region 7). Grimm's own, and the only creatures in the
  // game that can be UNAWARE — `_sleeps` is what opts a variant into that.
  // Nothing else anywhere gets it, so six regions behave exactly as before.
  //
  // These three were first tinted near-black (0x140e1e-0x1a1226) on top of a
  // near-black Court floor, which made them holes rather than creatures — and
  // the courtwarden had Main and Main_Light set to the SAME hex, so the biggest
  // shadow in the game had no internal form at all and no wind-up a child could
  // read. THE POSE NEVER LIES needs a silhouette that is dark, not absent.
  shadewalker: {
    label: 'Shadewalker',
    hp: 5, weakness: 'moon', chargeSpeed: 10.5, puffTint: 0x2a1a3a, dropChance: 0.6,
    sleeps: true,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xb9a8ff); m.emissiveIntensity = 1.8; }
      else if (m.name === 'Main') { m.color && m.color.setHex(0x322546); }
      else if (m.name === 'Main_Light') { m.color && m.color.setHex(0x4f3b6e); }
    },
  },
  courtwarden: {
    label: 'Court Warden',
    scale: 1.3, hp: 8, weakness: 'moon', chargeSpeed: 11.5, dropChance: 1, puffTint: 0x2a1a3a,
    sleeps: true,
    tint: (m) => {
      if (m.name === 'Eyes_Black') { m.emissive && m.emissive.setHex(0xffd76a); m.emissiveIntensity = 2.2; }
      else if (m.name === 'Main') { m.color && m.color.setHex(0x2b2038); }
      else if (m.name === 'Main_Light') { m.color && m.color.setHex(0x483559); }
    },
  },
  gloomblob: {
    label: 'Gloom',
    hp: 4, weakness: 'moon', puffTint: 0x2a1a3a, sleeps: true,
    tint: (m) => {
      if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(0xb9a8ff); m.emissiveIntensity = 1.6; }
      else if (m.color) { m.color.setHex(0x3d2c55); m.emissive && m.emissive.setHex(0x1d1430); m.emissiveIntensity = 0.4; }
    },
  },
  wisp: {
    label: 'Wisp Moth',
    hp: 1.5, weakness: 'fire', puffTint: 0xb8ffc8,
    tint: (m) => {
      if (m.color) { m.color.setHex(0x9fd8a8); m.emissive && m.emissive.setHex(0x8fdc6a); m.emissiveIntensity = 0.7; }
    },
  },

  // --- THE SUNKEN VALE (region 6): Pass 2 audit finding — every spawn site
  // in js/level6.js asked for `variant: 'tide' | 'deeptide' | 'gull' |
  // 'drowned'`, and none of those keys had ever existed here. applyVariant()
  // fails silent on an unknown name (`if (!v) return e;`), so every creature
  // in the whole region was quietly shipping as an unmodified base enemy —
  // no tint, no size, no weakness lesson, indistinguishable from region 1.
  // Dad's call: fire and steel-armor, the whole roster. Crusted in old
  // barnacle-shell (`armored` — new to Slime/Bat, which are never armored
  // otherwise) and, despite the water, still flammable enough to fear fire.
  tide: {
    label: 'Tide Slime',
    hp: 4, weakness: 'fire', armored: true, puffTint: 0x1a3a3a,
    tint: (m) => {
      if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(0x6affea); m.emissiveIntensity = 1.4; }
      else if (m.color) { m.color.setHex(0x2a5a5a); m.emissive && m.emissive.setHex(0x123030); m.emissiveIntensity = 0.4; }
    },
  },
  deeptide: {
    label: 'Deep Tide',
    scale: 1.3, hp: 6.5, weakness: 'fire', armored: true, dropChance: 1, puffTint: 0x0f2626,
    tint: (m) => {
      if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(0x9bfff0); m.emissiveIntensity = 2.0; }
      else if (m.color) { m.color.setHex(0x163838); m.emissive && m.emissive.setHex(0x0a1c1c); m.emissiveIntensity = 0.5; }
    },
  },
  gull: {
    label: 'Storm Gull',
    hp: 2, weakness: 'fire', armored: true, puffTint: 0xd8e8e0,
    tint: (m) => {
      if (m.color) { m.color.setHex(0x8fa8a0); m.emissive && m.emissive.setHex(0x6affea); m.emissiveIntensity = 0.9; }
    },
  },
  drowned: {
    label: 'Drowned Skeleton',
    hp: 2.5, weakness: 'fire', armored: true, sharedMats: true, puffTint: 0x1a3a3a,
    tint: (m) => {
      if (m.color) m.color.setHex(0x2f4a48); // old bone gone waterlogged-green
    },
  },
};

function applyVariant(e, name) {
  const v = VARIANTS[name];
  if (!v) return e;
  // A9 — A VARIANT'S hp IS A BASE, NOT A VERDICT.
  //
  // This used to be `e.hp = v.hp` — a flat overwrite of the number the Enemy
  // constructor had just computed, which meant a varianted enemy opted out of
  // BOTH difficulty levers the rest of the game runs on: the level scaling
  // (`enemyScale()`) and the Gentle-mode hp relief. It went unnoticed because
  // Levels 1 and 2 barely use variants. Level 3 is made of nothing else, so
  // every enemy in the Wild Woods was pinned at its level-1 value:
  //
  //   player level        1     4     8    12    16
  //   L2 skeleton       3.0   3.5   4.5   5.5   6.5   (scales)
  //   plain hound       4.0   5.0   6.0   7.5   9.0   (scales)
  //   THORN HOUND       3.5   3.5   3.5   3.5   3.5   (did not)
  //
  // A child reaches the Wild Woods at about level 8-12, so the corrupted,
  // supposedly-tougher forest creature was the WEAKEST thing in the game by a
  // wide margin. That — not the room-by-room head count — is the main reason
  // difficulty fell off a cliff at Level 3. The variant now feeds the same
  // formula every other enemy uses, so Gentle mode reaches the woods too.
  if (v.hp) {
    const bonus = state.settings.easy ? 0 : CONFIG.DIFFICULTY.ENEMY_HP_BONUS;
    e.hp = e.maxHp = Math.round((v.hp + bonus) * enemyScale() * 2) / 2;
  }
  if (v.scale && e.model) {
    e.model.scale.multiplyScalar(v.scale);
    e.radius = e.radius * (1 + (v.scale - 1) * 0.6);
  }
  if (v.speed !== undefined) e.speed = v.speed;
  if (v.chargeSpeed !== undefined) e.chargeSpeed = v.chargeSpeed;
  if (v.contactDmg !== undefined) e.contactDmg = v.contactDmg;
  if (v.resist) e.resist = v.resist;
  if (v.weakness) e.weakness = v.weakness;
  // Pass 2 audit: no variant had ever asked for this before — every armored
  // enemy got it from its own class's base TRAITS. The Sunken Vale roster
  // (tide/deeptide/gull/drowned, below) is the first to hand it out through
  // a variant instead, on classes (Slime, Bat) that are never armored
  // otherwise — crusted shells and old barnacles, steel skitters off them.
  if (v.armored !== undefined) e.armored = v.armored;
  // only a variant that says so can ever be unaware, and one that can starts
  // that way — a court full of shadows already hunting you is not a court you
  // can sneak through
  if (v.sleeps) { e._sleeps = true; e.alert = 'unaware'; }
  if (v.dropChance !== undefined) e.dropChance = v.dropChance;
  if (v.puffTint !== undefined) e.puffTint = v.puffTint;
  if (v.tint && e.model) {
    e.model.traverse((n) => {
      if (!n.isMesh) return;
      if (v.sharedMats) {
        // clone first — never recolor the loader cache other spawns share
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        const cloned = mats.map((m) => { const c = m.clone(); v.tint(c); return c; });
        n.material = Array.isArray(n.material) ? cloned : cloned[0];
      } else {
        // shades/hounds already own per-instance clones (eye-flare mats
        // must stay the SAME objects the class holds references to)
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) v.tint(m);
      }
    });
  }
  if (v.sharedMats) {
    e._flashMats = [];
    e.registerFlashMats(e.model); // re-point the hurt flash at the clones
  }
  // AND KEEP HOLD OF THE EYES. Awareness reads off `eyeMats`, and a variant
  // that recolours Eyes_Black never handed the material over — so `this.eyeMat`
  // was checked in three places and was undefined in all of them. The whole
  // awareness system has been invisible since it was written: unaware,
  // suspicious and aware looked identical. THE POSE NEVER LIES needs a pose.
  if (v.sleeps && e.model) {
    e.eyeMats = e.eyeMats || [];
    e.model.traverse((n) => {
      if (!n.isMesh) return;
      for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
        if (/eye/i.test(m.name || '') && !e.eyeMats.includes(m)) e.eyeMats.push(m);
      }
    });
  }
  return e;
}

class Enemy {
  constructor(world, x, z, { hp, radius }) {
    this.world = world;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);
    // gentle level scaling on hp (behaviors carry real difficulty).
    // 🌸 Gentle profiles skip the playtest hp bonus.
    const bonus = state.settings.easy ? 0 : CONFIG.DIFFICULTY.ENEMY_HP_BONUS;
    this.hp = Math.round((hp + bonus) * enemyScale() * 2) / 2;
    this.maxHp = this.hp;
    this.radius = radius;
    this.dead = false;
    this.stunned = 0;
    this.frozen = 0;   // >0 = held solid and BRITTLE (Frost Wolf breath)
    this._flash = 0;
    this._flashMats = [];
    const tr = TRAITS[this.constructor.name] || {};
    this.weakness = tr.weakness || null;
    // ...AND ITS RESISTANCE. TRAITS has always been read for weakness and
    // armour but never for `resist`, so a base family could not shrug off an
    // element at all — only VARIANTS could (applyVariant sets it directly).
    // The fire-spitter is the first family that needs one, and it silently
    // did nothing until a probe measured the multiplier instead of trusting
    // the table.
    this.resist = tr.resist || null;
    this.armored = !!tr.armored;
    // AWARENESS (region 7). Everything in the game before the Shadow Court is
    // born aware and nothing ever changes that, so six regions of behaviour are
    // untouched. Only a shadow that is told to sleep starts unaware, and only
    // the Ghost Wolf can keep it that way.
    this.alert = 'aware';        // 'unaware' | 'suspicious' | 'aware'
    this._calmT = 0;
  }

  // Snap this one awake. Called when Kael attacks, breaks something, or walks
  // into it — contact works both ways, which is the rule that keeps ghosting
  // honest: you cannot barge through a room and stay a rumour.
  // One place that lights the eyes, because there are two shapes of eye in the
  // codebase — a single material on some, a list on others — and the awareness
  // code only ever knew about the one that does not exist.
  _eyes(v) {
    if (this.eyeMat) this.eyeMat.emissiveIntensity = v;
    for (const m of (this.eyeMats || [])) m.emissiveIntensity = v;
  }

  notice(why = 'contact') {
    if (this.dead || this.alert === 'aware') return false;
    this.alert = 'aware';
    this._calmT = 0;
    this._eyes(2.2);
    audio.play('ui-click', { volume: 0.5, rate: 0.7 });
    void why;
    return true;
  }

  // ...and settle again once he has been gone a while. A child who makes one
  // mistake should not have to leave the room and come back.
  _calm(dt, player) {
    if (this.alert !== 'aware' || !this._sleeps) return;
    const d = Math.hypot(player.root.position.x - this.x, player.root.position.z - this.z);
    const hidden = player.ghosted;
    this._calmT = (hidden && d > 2.2) ? this._calmT + dt : 0;
    if (this._calmT > 3.0) { this.alert = 'unaware'; this._calmT = 0; this._suspT = 0; }
  }

  // THE MIDDLE STATE, which was declared and never entered.
  //
  // `alert` has always named three states and the code only ever used two: a
  // shadow was oblivious or it was hunting you, and the change happened between
  // one frame and the next. That is the one thing a stealth rule must not do to
  // a five-year-old — there was no moment in which the game told her she was
  // about to be seen, and no moment in which she could do anything about it.
  //
  // Suspicious is that moment. A shadow that half-notices STOPS, turns to look,
  // and its eyes come up — and it takes a beat and a half to decide. Ghost, or
  // back off, and it settles again. THE POSE NEVER LIES applies to attention:
  // the state is on the body, and there is no meter anywhere.
  _senses(dt, player) {
    // Long enough for a five-year-old to notice and do something. 1.2s read
    // fine to me and is not the test that matters.

    if (!this._sleeps || this.dead || this.alert === 'aware') return;
    const d = Math.hypot(player.root.position.x - this.x, player.root.position.z - this.z);
    const hidden = !!player.ghosted;
    const near = d < SUSPECT_R;
    if (this.alert === 'unaware') {
      if (near && !hidden) {
        this.alert = 'suspicious';
        this._suspT = 0;
        audio.play('growl', { volume: 0.25, rate: 1.6 });   // the rising note
      }
      return;
    }
    // suspicious: closing the distance decides it faster than loitering does
    if (hidden || !near) {
      this._suspT -= dt * 1.5;
      if (this._suspT <= 0) { this.alert = 'unaware'; this._suspT = 0; }
    } else {
      this._suspT += dt * (d < 3 ? 1.8 : 1);
      if (this._suspT > SUSPECT_HOLD) this.notice('seen');
    }
  }

  // Does this one act at all this frame? An unaware shadow carries on with
  // whatever it was doing and does not know Kael is in the room. A suspicious
  // one has stopped to look, which is also not acting — it is deciding.
  _asleep(player) {
    if (this.alert === 'aware') return false;
    // ...unless he walks into it. Touch is the third way to be noticed.
    const d = Math.hypot(player.root.position.x - this.x, player.root.position.z - this.z);
    if (d < this.radius + 0.55) { this.notice('bump'); return false; }
    return true;
  }

  // WHAT AN UNAWARE SHADOW DOES. Not nothing — nothing reads as broken. It
  // paces the spot it was left on and looks the other way, which is the pose
  // saying "has not seen you" without a meter anywhere on screen.
  _drowse(dt, t, player) {
    // SUSPICIOUS READS AS STOPPING. It paces while oblivious; the moment it
    // half-notices it stands still and turns to face him, and the eyes climb
    // with the timer — so a child can see the decision being made and has a
    // beat and a half to ghost or back away.
    if (this.alert === 'suspicious') {
      this._play && this._play('idle');
      if (player) {
        this.root.rotation.y = Math.atan2(player.root.position.x - this.x,
          player.root.position.z - this.z);
      }
      const k = Math.max(0, Math.min(1, (this._suspT || 0) / SUSPECT_HOLD));
      this._eyes(0.25 + k * 1.5);
      return;
    }
    this._play && this._play('walk');
    const a = (this._drowseA === undefined ? (this._drowseA = (this.x * 7 + this.z * 3) % 6.28) : this._drowseA);
    this.root.rotation.y = a + Math.sin(t * 0.5 + a) * 0.9;
    this._eyes(0.25);
    void dt;
  }

  // Grounded enemies obey lava exactly like Kael — they cannot walk in.
  // Flyers cross freely. Returns the resolved position (or "stay put").
  _moveSolved(nx, nz) {
    const s = this.world.resolveCircle(nx, nz, this.radius);
    if (!this.flying && this.world.hazardAt(s.x, s.z)) return { x: this.x, z: this.z };
    return s;
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  // A perfect parry dazes this enemy: no moving, no hurting, slow wobble.
  takeStun(sec) {
    if (this.dead) return;
    this.stunned = Math.max(this.stunned, sec);
  }

  // Returns true while stunned (callers skip their AI for the frame).
  stunUpdate(dt) {
    if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);
    if (this.stunned <= 0) return false;
    this.stunned -= dt;
    this.root.rotation.y += dt * 5;              // dizzy spin
    this.root.position.y = Math.abs(Math.sin(this.stunned * 9)) * 0.06;
    if (this.stunned <= 0) this.root.position.y = 0;
    this.flashUpdate(dt);
    return true;
  }

  // element: 'steel' (knight sword) | 'spark' | 'moon' | 'fire' | 'earth' |
  //          'verdant' | 'frost' | 'storm' | 'tide'.
  // The list had gone stale at five while the player grew to nine forms —
  // an enemy given a weakness outside this set would simply never trigger
  // it, silently. tools/verify-combat-laws.mjs now checks the vocabulary.
  // kind: 'melee' | 'bolt' | 'aoe' — some enemies react per kind (dodges).
  takeDamage(n, element = 'steel', kind = 'melee') {
    this.notice('hit');       // being hit is the loudest way to be noticed
    if (this.dead) return;
    let mult = 1;
    // BRITTLE (v3.21): frozen solid, then struck — the ice shatters and the
    // blow lands double. The Frost Wolf's breath is a SET-UP, not a kill.
    if (this.frozen > 0 && kind !== 'aoe') {
      this.frozen = 0;
      mult *= 2;
      audio.play('parry', { volume: 0.6, rate: 1.9 });   // the crack of ice
      juice.burst(this.x, 0.9, this.z, 0xbfefff, 12);
      if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.5, this.z, 'SHATTER!');
    }
    if (this.armored) {
      if (element === 'steel') {
        mult *= 0.5; // steel skitters off old bone...
        audio.play('parry', { volume: 0.3, rate: 1.5 }); // armor clank teach
      } else {
        mult *= 1.35; // ...but magic bites deep
      }
    }
    // weakness is an element OR a list of them — the fire-spitter fears both
    // water and ice, and one field should not force a designer to pick.
    const weak = this.weakness && (Array.isArray(this.weakness)
      ? this.weakness.includes(element) : element === this.weakness);
    if (weak) mult *= 1.5;
    // variant RESISTANCE: the wrong element fizzles (0.4x + grey callout) —
    // the counterpart lesson to SUPER!: "this one shrugs that off, switch!"
    if (this.resist && (Array.isArray(this.resist)
      ? this.resist.includes(element) : element === this.resist)) {
      mult *= 0.4;
      audio.play('puff', { volume: 0.4, rate: 1.7 });
      if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.35, this.z, 'RESIST');
    }
    n = Math.round(n * mult * 2) / 2;
    if (n <= 0) n = 0.5;
    if (this.stunned > 0) n *= 2; // parry payoff: dizzy enemies take double
    this.hp -= n;
    this._flash = 0.14;
    this._pop = weak ? 0.2 : 0.14;    // weakness hits pop harder
    if (weak) {
      // make experimentation LOUD: gold flare + a SUPER! callout so kids
      // instantly see "this element is the one" (Pip teaches it once too)
      juice.burst(this.x, 0.9, this.z, 0xffe14a, 8);
      if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.35, this.z, 'SUPER!');
      bumpCounter('weakHits');
    }
    if (this.world.onDmgNum) this.world.onDmgNum(this.x, 0.9, this.z, n);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    grantXp(XP_VALUES[this.constructor.name] || 0);
    bumpCounter('kills');
    smokePuff(this.world, this.x, 0.5, this.z, this.puffTint || 0x5a4d66);
    audio.play('puff', { volume: 0.8 });
    // sometimes shadows leave a warm ember behind — a little half-heart heal
    const chance = this.dropChance !== undefined ? this.dropChance : 0.35;
    if (Math.random() < chance) spawnEmberDrop(this.world, this.x, this.z);
    dropWeapon(this);
    this.world.root.remove(this.root);
  }

  // Un-engaged foes PROWL: hold the waiting ring around Kael, drifting
  // sideways — a visible "waiting their turn", never a pile-on. dx/dz point
  // TOWARD the player.
  // CLOSING THE GAP, WITHOUT TOUCHING THE FIGHT.
  //
  // Dad: "the game is too easy. not in terms of hp and attack power etc, its
  // easy because I can literally run straight through each level without
  // getting hurt." tools/probe-sprint.mjs put a number on it — seven of eight
  // rooms cost NOTHING to cross, and in most the nearest enemy never came
  // within three metres.
  //
  // The cause is arithmetic. The Dark Wolf runs 6.7 u/s. A slime does 1.2, a
  // hound stalks at 1.8, a minion 2.0. Nothing could ever arrive.
  //
  // But he was explicit that the FIGHT is not the problem, so the melee numbers
  // must not move: at close range this returns the tuned speed unchanged and
  // everything at arm's length behaves exactly as it did. It only ramps with
  // DISTANCE — a foe eight metres away closes at up to 5.6, which still lets a
  // wolf outrun it in the open. Fights feel the same; the walk between them
  // stops being free. Paired with interceptDir below, "outrun" now means
  // actually turning, not just holding a direction.
  pursueSpeed(base, d) {
    // Bonelord's rally (task #31, Commander): a temporary buff aura, applied
    // uniformly here so every chase-speed call site benefits without each
    // class having to know the rally even exists.
    if (this._rallyT > 0) base *= this._rallySpeedBonus || 1;
    const CAP = 5.6;                         // under the Dark Wolf's 6.7, on purpose
    if (d <= 3.5) return base;               // melee: untouched
    const t = Math.min(1, (d - 3.5) / 5.5);  // full ramp by 9u out
    return base + (Math.max(base, CAP) - base) * t;
  }

  // WHERE KAEL WILL BE, NOT WHERE HE IS.
  //
  // Dad, having played the room lock: "no, thats not what was asked for. I
  // wanted not to be able to cross the room without being attacked at all. I
  // wanted enemies to be able to close in quicker." The lock is gone; this is
  // the thing that replaces it.
  //
  // An enemy that runs at Kael's current position trails a moving child the
  // whole width of the room — by the time it arrives he has left, forever.
  // This aims at his position PLUS his velocity carried forward, so a child
  // sprinting a straight line finds the shadow arriving at the far end of that
  // line. Standing still or turning collapses the lead to nothing, which is
  // the Terranigma bargain: crossing is dangerous, DODGING still works.
  //
  // The lead never exceeds a second, and at melee range it vanishes — close
  // combat is tuned and stays exactly as it was.
  interceptDir(player, d) {
    const px = player.root.position.x, pz = player.root.position.z;
    const vx = (player._vel && player._vel.x) || 0;
    const vz = (player._vel && player._vel.z) || 0;
    const lead = Math.max(0, Math.min(1.0, (d - 2.0) / 6));
    const tx = px + vx * lead - this.x, tz = pz + vz * lead - this.z;
    const td = Math.hypot(tx, tz);
    if (td < 0.01) return { x: 0, z: 0, d: 0 };
    return { x: tx / td, z: tz / td, d: td };
  }

  // A SPRINTING CHILD IS LOUD.
  //
  // The gauntlet's first run proved the interceptors were not enough on their
  // own: 18 of 23 fight rooms could still be crossed for free, and the data
  // said why — nothing ever WOKE. A slime notices at 6.5u; a runner is through
  // that bubble in under two seconds and gone before pursuit starts. The
  // intercept maths only matters to an enemy that is already moving.
  //
  // So running carries. Above a walk (3.4 u/s — between the knight's 4.6 and
  // the careful stick-half-tilt a sneaking child actually uses), the whole
  // room hears you. Move slowly and every quiet range is exactly what it was:
  // sneaking past a sleeping skeleton is still a thing a patient child can do,
  // which is the Zelda bargain — speed or safety, pick one.
  // HOW FAR THIS SHADOW CAN NOTICE YOU RIGHT NOW.
  //
  // Ghosting used to change this number not at all. Dad, from play: "ghost
  // wolf's power turning invisible doesn't work. the enemies still react and
  // attack" — and he was right, because the only two places in the game that
  // ever read `player.ghosted` were the wake/settle rules on the three
  // variants flagged `sleeps: true`. Every other shadow in seven regions
  // hunted a boy it could not see.
  //
  // The white wolf is Luna's own moonlight and it lasts six seconds on an
  // eight-second cooldown (player.js), so this is a window to slip a lane, not
  // a way to walk through the game unseen. While it is open, sight collapses
  // to arm's length: a shadow you stand on still finds you — contact works
  // both ways, which is the rule that keeps ghosting honest — and a shadow
  // already hunting simply loses the thread, because every caller treats
  // out-of-range as "go idle".
  //
  // Bosses are untouched by design: they are their own classes in js/boss.js
  // and never come through here. Vanishing out of an arena you were sealed
  // into would not be stealth, it would be an exit.
  senseRange(player, quiet) {
    if (player && player.ghosted) return GHOST_SIGHT;
    const vx = (player._vel && player._vel.x) || 0;
    const vz = (player._vel && player._vel.z) || 0;
    return Math.hypot(vx, vz) > 3.4 ? Math.max(quiet, 14) : quiet;
  }

  // THE TRUE INTERCEPT, for anything that flies in a straight line.
  //
  // interceptDir's fixed lead is fine for legs that re-aim every frame; a
  // projectile aims ONCE, and the gauntlet showed what an estimated lead does
  // there: the glob landed half a metre behind a crossing runner, every shot,
  // forever — an error that looks close and never, ever hits. This solves the
  // actual quadratic — where must a shot at `speed` be aimed so that shot and
  // runner arrive together — and clamps the answer to `cap` seconds so a
  // distant target does not produce an absurd lead into a wall. If the child
  // outruns the shot entirely (no positive root), it fires at where they are,
  // which is the honest miss.
  interceptPoint(player, speed, cap = 1.6) {
    const px = player.root.position.x, pz = player.root.position.z;
    const vx = (player._vel && player._vel.x) || 0;
    const vz = (player._vel && player._vel.z) || 0;
    const rx = px - this.x, rz = pz - this.z;
    const a = vx * vx + vz * vz - speed * speed;
    const b = 2 * (rx * vx + rz * vz);
    const c = rx * rx + rz * rz;
    let t = 0;
    if (Math.abs(a) < 1e-6) {
      if (Math.abs(b) > 1e-6) t = -c / b;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const roots = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].filter((x) => x > 0);
        if (roots.length) t = Math.min(...roots);
      }
    }
    t = Math.max(0, Math.min(cap, t));
    return { x: px + vx * t, z: pz + vz * t };
  }

  holdOrbit(dt, dx, dz, d) {
    const H = CONFIG.ENGAGE;
    if (d < 0.01) return;
    const nx = dx / d, nz = dz / d;
    let mx, mz;
    if (d < H.HOLD_DIST - 0.5) { mx = -nx; mz = -nz; }        // too close: give ground
    else if (d > H.HOLD_DIST + 1.4) { mx = nx; mz = nz; }     // drifted off: close up
    else {
      if (this._orbitSign === undefined) this._orbitSign = (this.x + this.z) % 2 < 1 ? 1 : -1;
      mx = -nz * this._orbitSign; mz = nx * this._orbitSign;  // circle Kael
    }
    const s = this._moveSolved(this.x + mx * H.HOLD_SPEED * dt, this.z + mz * H.HOLD_SPEED * dt);
    this.root.position.x = s.x;
    this.root.position.z = s.z;
    this.root.rotation.y = Math.atan2(dx, dz); // eyes stay ON Kael
  }

  contact(player, dmg = 1, { ground = true } = {}) {
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const rr = this.radius + 0.32;
    if (dx * dx + dz * dz < rr * rr) {
      if (this._rallyT > 0) dmg *= 1.25; // Bonelord's rally (task #31)
      player.hurt(dmg, { attacker: this, groundAttack: ground });
    }
  }

  flashUpdate(dt) {
    // Bonelord's rally aura (task #31, Commander): decays here since every
    // class already calls this once a frame — a gold pulse ON THE BODY
    // while it lasts, no separate UI or timer plumbing needed per class.
    if (this._rallyT > 0) {
      this._rallyT -= dt;
      const k = Math.min(1, this._rallyT / 1.2);
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.5 + k * 0.8);
    }
    if (this._pop > 0) {
      this._pop -= dt;
      const f = Math.max(0, this._pop) / 0.14;
      this.root.scale.setScalar(1 + 0.28 * Math.sin(f * Math.PI));
      if (this._pop <= 0) this.root.scale.setScalar(1);
    }
    if (this._flash <= 0) return;
    this._flash -= dt;
    const on = this._flash > 0 && Math.sin(this._flash * 60) > -0.4;
    for (const m of this._flashMats) {
      m.emissive && m.emissive.setHex(on ? 0xffffff : (m.userData.baseEmissive || 0x000000));
      m.emissiveIntensity = on ? 0.9 : (m.userData.baseEmissiveIntensity || 0);
    }
  }

  registerFlashMats(root) {
    root.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        if (!m.emissive) continue;
        m.userData.baseEmissive = m.emissive.getHex();
        m.userData.baseEmissiveIntensity = m.emissiveIntensity;
        this._flashMats.push(m);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Shadow Hound — elite. Stalks, crouches (streak telegraph ~1s), charges.
// ---------------------------------------------------------------------------

export class Hound extends Enemy {
  constructor(world, x, z, wolfGltf) {
    super(world, x, z, { hp: 3, radius: 0.4 });
    this.puffTint = 0x241a30;
    this.dropChance = 1; // the elite always leaves an ember

    this.eyeMats = []; // the telegraph lives in the EYES now, not a floor decal
    const model = prepareCharacter(SkeletonUtils.clone(wolfGltf.scene));
    model.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Eyes_Black') {
          c.emissive = new THREE.Color(0xff3a2a);
          c.emissiveIntensity = 1.4;
          this.eyeMats.push(c);
        } else {
          c.color.setHex(m.name === 'Main_Light' ? 0x2a2136 : 0x171021);
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    model.scale.setScalar(0.35);
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, name] of Object.entries({
      walk: 'Walk', crouch: 'Idle_2_HeadLow', charge: 'Gallop', idle: 'Idle', die: 'Death',
    })) {
      const clip = wolfGltf.animations.find((c) => c.name === name);
      this.actions[key] = this.mixer.clipAction(clip);
    }
    this._current = null;
    this._play('idle');
    this.registerFlashMats(this.root);

    this.state = 'stalk';
    this.stateT = 0;
    this.chargeDir = { x: 0, z: 1 };
    this._scrapeAcc = 0;
  }

  _play(name, fade = 0.18) {
    if (this._current === name) return;
    const next = this.actions[name];
    next.reset().play();
    if (this._current) this.actions[this._current].crossFadeTo(next, fade, false);
    this._current = name;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    this._calm(dt, player);
    this._senses(dt, player);
    if (this._asleep(player)) { this._drowse(dt, t, player); this.mixer.update(dt); return; }
    this.stateT += dt;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'stalk') {
      this._play('walk');
      if (d > 0.01) {
        if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
          this.holdOrbit(dt, dx, dz, d); // circles, red eyes on Kael, waiting
        } else {
          const speed = this.pursueSpeed(1.8, d); // stalks with intent, and CLOSES
          const iv = this.interceptDir(player, d); // ...along Kael's line, not behind it
          const solved = this._moveSolved(this.x + iv.x * speed * dt, this.z + iv.z * speed * dt);
          this.root.position.x = solved.x;
          this.root.position.z = solved.z;
          this.root.rotation.y = Math.atan2(dx, dz);
        }
      }
      // A SPRINTING CHILD TRIGGERS THE POUNCE FROM FURTHER OUT. 4.4 was tuned
      // for a child who has stopped to fight; one running past at full speed
      // crossed the whole window before the crouch finished. The hound reads
      // the run and winds up early — and the charge aims at the INTERCEPT
      // point, so a straight line is punished and a turn still dodges it.
      const spd = player._vel ? Math.hypot(player._vel.x, player._vel.z) : 0;
      const pounceAt = spd > 3.4 ? 7.0 : 4.4;
      if (d < pounceAt && this.stateT > 1.2 && this.engaged !== false) {
        this.state = 'crouch';
        this.stateT = 0;
        const iv = this.interceptDir(player, d);
        this.chargeDir = iv.d > 0.01 ? { x: iv.x, z: iv.z }
          : { x: dx / Math.max(d, 0.01), z: dz / Math.max(d, 0.01) };
        this.root.rotation.y = Math.atan2(this.chargeDir.x, this.chargeDir.z);
        audio.play('growl', { volume: 0.5, rate: 0.42, vary: 0.05 }); // low GROWL
      }
    } else if (this.state === 'crouch') {
      // ~1s telegraph, ALL on the wolf's body (the floor decal is gone —
      // playtest verdict): it crouches LOW, its eyes flare bright red, and
      // its paws scrape up little bursts of dust as it winds the spring.
      this._play('crouch', 0.1);
      const f = Math.min(1, this.stateT / 1.0);
      this.model.scale.y = 0.35 * (1 - 0.18 * Math.min(1, this.stateT * 2));
      for (const m of this.eyeMats) m.emissiveIntensity = 1.4 + f * 2.6;
      this._scrapeAcc += dt;
      if (this._scrapeAcc > 0.24) {
        this._scrapeAcc = 0;
        juice.burst(this.x - this.chargeDir.x * 0.35, 0.18, this.z - this.chargeDir.z * 0.35, 0x6a5a48, 3);
      }
      if (this.stateT >= 1.0) {
        this.state = 'charge';
        this.stateT = 0;
        // AIM AT LAUNCH, NOT AT CROUCH. The charge direction was fixed the
        // moment the crouch began — a full second stale by lift-off, which a
        // walking child never noticed and a running child made a fool of: the
        // gauntlet showed hound rooms crossed for free because every pounce
        // landed where the runner had been a second ago. The wind-up is still
        // the tell; the direction is honest to the moment it actually fires,
        // and it leads the runner, so the dodge is a TURN, not just more speed.
        const iv = this.interceptDir(player, d);
        if (iv.d > 0.01) this.chargeDir = { x: iv.x, z: iv.z };
        this.root.rotation.y = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      }
    } else if (this.state === 'charge') {
      this._play('charge', 0.08);
      this.model.scale.y = 0.35;
      for (const m of this.eyeMats) m.emissiveIntensity = 4.0; // burning as it flies
      const speed = this.chargeSpeed || 9.6; // elders charge harder (VARIANTS)
      const nx = this.x + this.chargeDir.x * speed * dt;
      const nz = this.z + this.chargeDir.z * speed * dt;
      const solved = this._moveSolved(nx, nz);
      const blocked = Math.hypot(solved.x - nx, solved.z - nz) > 0.01;
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > 0.7 || blocked) { this.state = 'recover'; this.stateT = 0; }
    } else { // recover — slow, vulnerable
      this._play('idle', 0.25);
      for (const m of this.eyeMats) m.emissiveIntensity = Math.max(1.4, m.emissiveIntensity - dt * 6);
      if (this.stateT > 1.6) { this.state = 'stalk'; this.stateT = 0; }
    }

    if (this.state !== 'charge') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Cave Slime — Quaternius animated monster. Slow, squishy, hops after Kael
// and squelches into him. The caverns' gentle "first contact" enemy.
// ---------------------------------------------------------------------------

export class Slime extends Enemy {
  constructor(world, x, z, gltf) {
    super(world, x, z, { hp: 2, radius: 0.4 });
    this.puffTint = 0x7fc46a;
    this.aggroRange = 6.5;
    this.speed = 1.2; // playtest bump
    this.splits = true;   // cave slimes burst into two minis when smashed
    this._gltf = gltf;
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    model.scale.setScalar(0.26);
    this.model = model;
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [k, n] of Object.entries({
      idle: 'Armature|Slime_Idle', walk: 'Armature|Slime_Walk', attack: 'Armature|Slime_Attack',
    })) {
      const clip = gltf.animations.find((c) => c.name === n);
      if (clip) this.actions[k] = this.mixer.clipAction(clip);
    }
    this._current = null;
    this._play('idle');
    this.registerFlashMats(this.root);
    this.attackT = 0;
  }

  _play(name, fade = 0.2) {
    if (this._current === name) return;
    const next = this.actions[name];
    if (!next) return;
    next.reset().play();
    if (this._current && this.actions[this._current]) {
      this.actions[this._current].crossFadeTo(next, fade, false);
    }
    this._current = name;
  }

  die() {
    if (this.splits && !this.mini && this.world.enemies) {
      for (const off of [-0.35, 0.35]) {
        const m = new Slime(this.world, this.x + off, this.z - off, this._gltf);
        m.mini = true; m.splits = false;
        m.hp = 1; m.speed = 2.0; m.radius = 0.22; // minis nip at the heels
        m.model.scale.setScalar(0.14);
        this.world.enemies.push(m);
      }
    }
    super.die();
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < this.senseRange(player, this.aggroRange) && d > 0.01) {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d); // no token: prowl the ring, wait
      } else {
        const speed = this.pursueSpeed(this.speed, d);
        const iv = this.interceptDir(player, d);   // cut the corner, don't trail
        const solved = this._moveSolved(this.x + iv.x * speed * dt, this.z + iv.z * speed * dt);
        this.root.position.x = solved.x;
        this.root.position.z = solved.z;
        this.root.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      this._play('idle');
    }
    this.attackT -= dt;
    if (d < 1.1 && this.attackT <= 0) {
      this.attackT = 1.8;
      const act = this.actions.attack;
      if (act) { act.reset(); act.setLoop(THREE.LoopOnce); act.play(); this._current = 'attack'; }
    }
    this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Shade — the corruption itself: a slime given shadow. Same gentle chase as
// its cave cousin, dressed in deep violet with ember eyes.
// ---------------------------------------------------------------------------

export class Shade extends Slime {
  constructor(world, x, z, gltf) {
    super(world, x, z, gltf);
    this.puffTint = 0x4a3f5c;
    this.radius = 0.34;
    this.aggroRange = 7;
    this.speed = 3.3;      // burst speed — shades move in sudden skips (playtest bump)
    this.splits = false;   // shadow, not jelly
    this.model.scale.setScalar(0.23);
    this.model.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Eyes') {
          c.color.setHex(0x000000);
          c.emissive = new THREE.Color(0xff7a3a);
          c.emissiveIntensity = 1.6;
        } else {
          c.color.setHex(0x241a38);
          c.emissive = new THREE.Color(0x2a1b3a);
          c.emissiveIntensity = 0.35;
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    this._flashMats = [];
    this.registerFlashMats(this.root);
    this._lurchT = 0;
    this._retreatT = 0;
  }

  // Lurch rhythm: rest ~0.8s, then a quick 0.4s skip toward Kael. A totally
  // different read from the cave slime's steady squelch. HIT-AND-RUN
  // (playtest: "some attack and retreat"): the moment it strikes home it
  // darts BACK out of reach, watches, then comes again — intercept it on
  // the way in or chase it down.
  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    if (this._retreatT > 0) {
      this._retreatT -= dt;
      this._play('walk');
      if (d > 0.01 && d < 4.2) {
        const sv = this._moveSolved(this.x - (dx / d) * 3.6 * dt, this.z - (dz / d) * 3.6 * dt);
        this.root.position.x = sv.x;
        this.root.position.z = sv.z;
      }
      this.root.rotation.y = Math.atan2(dx, dz); // backs away still facing Kael
      this.contact(player);
      this.flashUpdate(dt);
      this.mixer.update(dt);
      return;
    }
    if (d < 1.05) this._retreatT = 1.1; // struck home — dart back out
    this._lurchT -= dt;
    if (this._lurchT <= -0.8) this._lurchT = 0.4;
    if (d < this.senseRange(player, this.aggroRange) && d > 0.01 && this._lurchT > 0) {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d); // waiting shades skip AROUND, not in
      } else {
        // THE SKIP IS THE BURST. At range the 0.4s skip flies at 7.2 — over the
        // Dark Wolf's 6.7 for that beat only, so a shade can genuinely catch a
        // sprinter, but only in pulses with a rest between them: the rest IS
        // the telegraph, and the melee-range skip stays the tuned 3.3.
        const skip = d > 4 ? 7.2 : this.speed;
        const iv = this.interceptDir(player, d);
        const sv = this._moveSolved(this.x + iv.x * skip * dt, this.z + iv.z * skip * dt);
        this.root.position.x = sv.x;
        this.root.position.z = sv.z;
        this.root.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      this._play('idle');
    }
    this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Ember Spitter — the slime again, scorched, and it SHOOTS. Dad: "I wanted
// enemies to be able to close in quicker or more enemies or ranged attacks."
// This is the ranged one, and it is what actually punishes a straight-line
// sprint: nothing on legs has to catch you if something can reach across the
// room. Same GLB as the slime — the old recolour trick, exactly as the
// weapons and the armour do it.
//
// Kid-fair by construction: it holds still to shoot, the wind-up is 0.6s of
// visible swelling glow, the glob flies slow enough to see coming and is
// aimed at where Kael IS — so a child who keeps moving sideways is never
// hit, and a child who stands still or runs straight through the open eats
// one. Gentle mode slows the glob and stretches the cooldown further.
// ---------------------------------------------------------------------------

export class Spitter extends Slime {
  constructor(world, x, z, gltf) {
    super(world, x, z, gltf);
    this.puffTint = 0xff8a3a;
    this.splits = false;                 // scorched through — nothing left to split
    this.aggroRange = 13;
    this.speed = 1.0;                    // it would rather not walk at all
    this.model.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Eyes') {
          c.color.setHex(0x000000);
          c.emissive = new THREE.Color(0xffb03a);
          c.emissiveIntensity = 2.2;
        } else {
          c.color.setHex(0x4a2418);
          c.emissive = new THREE.Color(0x8a2d0c);
          c.emissiveIntensity = 0.5;
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    this._flashMats = [];
    this.registerFlashMats(this.root);
    this._spitT = 1.2;                   // first shot comes late enough to be seen
    this._windup = 0;
    this._globs = [];
  }

  _spawnGlob(player) {
    // AIMED ALONG KAEL'S LINE, not at his heels — and with the REAL solve, not
    // an estimate. The first lead here was min(0.9, d/5.2), which against a
    // crossing runner is always a fraction short: the gauntlet measured globs
    // landing half a metre behind the runner on every shot in every room. A
    // shot that is aimed once must solve for where shot and runner actually
    // meet. Any change of direction after the glob leaves still beats it
    // clean, and standing still collapses the lead to zero: a slow straight
    // ball you step aside from.
    const speed0 = state.settings.easy ? 4.0 : 5.2;
    const aim = this.interceptPoint(player, speed0, 1.6);
    const dx = aim.x - this.x, dz = aim.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a2d, emissiveIntensity: 2.8, roughness: 1 })
    );
    mesh.position.set(this.x, 0.75, this.z);
    this.world.add(mesh);
    this.world.keepLoose(mesh);
    this._globs.push({ mesh, x: this.x, z: this.z,
      vx: (dx / d) * speed0, vz: (dz / d) * speed0, life: 2.6 });
    audio.play('growl', { volume: 0.4, rate: 1.6, vary: 0.1 });
  }

  _updateGlobs(dt, player) {
    for (const g of this._globs) {
      if (g.life <= 0) continue;
      g.life -= dt;
      g.x += g.vx * dt; g.z += g.vz * dt;
      // a wall stops it — resolveCircle is the same truth the player runs on
      const s = this.world.resolveCircle(g.x, g.z, 0.2);
      const hitWall = Math.hypot(s.x - g.x, s.z - g.z) > 0.01;
      const pdx = player.root.position.x - g.x, pdz = player.root.position.z - g.z;
      const hitKael = pdx * pdx + pdz * pdz < 0.55 * 0.55;
      if (hitKael) player.hurt(1, { attacker: this, groundAttack: true });
      if (hitWall || hitKael || g.life <= 0) {
        g.life = 0;
        juice.burst(g.x, 0.6, g.z, 0xff7a2d, 5);
        g.mesh.visible = false;
      } else {
        g.mesh.position.set(g.x, 0.75, g.z);
      }
    }
    this._globs = this._globs.filter((g) => g.life > 0 || g.mesh.visible);
  }

  update(dt, t, player) {
    if (this.dead) { this._updateGlobs(dt, player); return; }
    if (this.stunUpdate(dt)) { this._updateGlobs(dt, player); this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this.root.rotation.y = Math.atan2(dx, dz);

    if (this._windup > 0) {
      // THE TELL: it stops dead and swells with ember light. Interrupt it with
      // anything, or simply step off the line it is drawing to you.
      this._play('attack');
      this._windup -= dt;
      const f = 1 - Math.max(0, this._windup) / A.spitter_spit.windup;
      this.model.scale.setScalar(0.26 * (1 + f * 0.35));
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = 0.5 + f * 2.2;
      if (this._windup <= 0) {
        this.model.scale.setScalar(0.26);
        this._spawnGlob(player);
        this._spitT = state.settings.easy ? 3.2 : A.spitter_spit.gap;
      }
    } else if (d < this.senseRange(player, this.aggroRange) && d > 0.01) {
      // ...through senseRange like every other prowler, so the Spitter cannot
      // keep shooting a boy who has gone translucent — it was the one enemy
      // reading its aggro radius raw.
      this._spitT -= dt;
      if (d < 4) {
        // too close for comfort: waddle back, keep the gun range open
        this._play('walk');
        const sv = this._moveSolved(this.x - (dx / d) * 1.6 * dt, this.z - (dz / d) * 1.6 * dt);
        this.root.position.x = sv.x;
        this.root.position.z = sv.z;
      } else {
        this._play('idle');
      }
      // Pass 2 audit (combat context pack §3): Spitter never checked
      // engagement at all — a ranged bolt attack with a real windup that
      // could fire regardless of the attack-token cap, the one enemy able
      // to ignore "only 2/3/4 press at once." Gated like every other
      // attack in the roster; the cooldown still ticks while it waits, so
      // it is not left flat-footed the moment its turn comes.
      if (this._spitT <= 0 && d > 3 && this.engaged !== false) this._windup = A.spitter_spit.windup;
    } else {
      this._play('idle');
    }
    this.contact(player);
    this._updateGlobs(dt, player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Cave Bat — Quaternius animated monster. Roosts half-asleep, flutters up
// when Kael comes near, telegraphs with a fast flap, then dives. The bolt's
// natural prey (flying=true), same rhythm the Ember Moths teach.
// ---------------------------------------------------------------------------

export class Bat extends Enemy {
  constructor(world, x, z, gltf) {
    super(world, x, z, { hp: 1, radius: 0.3 });
    this.puffTint = 0x4a3f5c;
    this.flying = true;
    this.home = { x, z };
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    model.scale.setScalar(0.13);
    model.position.y = -0.25; // wings pivot high on the rig — recenter
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const fly = gltf.animations.find((c) => c.name === 'BatArmature|Bat_Flying');
    this.flyAction = fly ? this.mixer.clipAction(fly) : null;
    if (this.flyAction) { this.flyAction.play(); this.flyAction.timeScale = 0.25; } // sleepy flutter
    this.registerFlashMats(this.root);
    this.state = 'roost';
    this.stateT = 0;
    this.diveDir = { x: 0, z: 0 };
    this.landsAfterDive = true; // cave bats crash-land, winded — sword window
    this.doubleDive = false;    // moths override with a second swoop
    this._seed = x * 2.3 + z;
    this.root.position.y = 1.5;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    this._calm(dt, player);
    this._senses(dt, player);
    if (this._asleep(player)) { this._drowse(dt, t, player); this.mixer.update(dt); return; }
    this.stateT += dt;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'roost') {
      this.root.position.y = 1.5 + Math.sin(t * 1.4 + this._seed) * 0.06;
      if (d < 5) {
        this.state = 'hover';
        this.stateT = 0;
        if (this.flyAction) this.flyAction.timeScale = 1;
      }
    } else if (this.state === 'hover') {
      // FLYERS STILL HIT WALLS. "Flying free" (see _moveSolved's own
      // comment) only ever meant free of lava — object collision was never
      // meant to be optional, but hover/dive/return wrote straight to
      // this.root.position and never routed through _moveSolved at all, so
      // a hovering bat could drift straight through a rock, a Village hut,
      // anything solid (real-play report: "enemies... going through
      // physical objects").
      const hs = this._moveSolved(
        this.x + (this.home.x + Math.sin(t * 0.9 + this._seed) * 0.7 - this.x) * dt,
        this.z + (this.home.z + Math.cos(t * 0.7 + this._seed) * 0.7 - this.z) * dt);
      this.root.position.x = hs.x; this.root.position.z = hs.z;
      this.root.position.y = 1.4 + Math.sin(t * 2.6 + this._seed) * 0.15;
      this.root.rotation.y = Math.atan2(dx, dz);
      // only a token-holder may wind up a dive — the rest keep hovering
      // ...and a RUNNER triggers it from further out: a bat that waits for a
      // sprinter to come within 4.6 watches them leave instead. The dive that
      // follows is led (see below), so the wider window is a threat, not a gift.
      const pv = player._vel ? Math.hypot(player._vel.x, player._vel.z) : 0;
      const trig = pv > 3.4 ? 8.5 : 4.6;
      if (d < trig && this.stateT > 1.0 && this.engaged !== false) { this.state = 'telegraph'; this.stateT = 0; }
    } else if (this.state === 'telegraph') {
      // fast flap + rising pitch flutter (~0.8s) before the swoop
      if (this.flyAction) this.flyAction.timeScale = 2.6;
      if (this.glowMats) {
        for (const m of this.glowMats) m.emissiveIntensity = 1.1 + (this.stateT / 0.8) * 2.4;
      }
      this.root.rotation.y = Math.atan2(dx, dz);
      if (this.stateT >= 0.8) {
        this.state = 'dive';
        this.stateT = 0;
        const dd = Math.max(d, 0.01);
        // the dive is aimed at the INTERCEPT, not the afterimage — the
        // gauntlet showed wisp rooms crossed clean because every dive hit
        // where the runner had been. Aimed at launch, led at dive speed:
        // a turn after the wings fold still dodges it.
        const ip = this.interceptPoint(player, 7.2, 0.9);
        const ix = ip.x - this.root.position.x, iz = ip.z - this.root.position.z;
        const idd = Math.hypot(ix, iz) || dd;
        this.diveDir = { x: ix / idd, z: iz / idd };
        audio.play('form-switch', { volume: 0.4, rate: 2.0 }); // screech-whoosh
      }
    } else if (this.state === 'dive') {
      const speed = 7.2; // playtest bump: dives demand a real dodge
      const ds = this._moveSolved(this.x + this.diveDir.x * speed * dt, this.z + this.diveDir.z * speed * dt);
      this.root.position.x = ds.x; this.root.position.z = ds.z;
      this.root.position.y = Math.max(0.45, this.root.position.y - dt * 2.2);
      this.contact(player, 1, { ground: false });
      if (this.stateT > 0.7) {
        // A DIVE THAT ENDS IN LAVA STAYS AIRBORNE. landsAfterDive drops
        // `flying` to false the instant the dive timer runs out, wherever
        // that happened to be — no hazard check at all, so a dive aimed
        // into Ember Hollow's lava channels could "land" a bat mid-pool,
        // and grounded bats never move again, let alone re-check hazards
        // (real-play report: "enemies walking over lava"). Landing on fire
        // is now simply refused: the crash-land is skipped and it flies
        // home instead, same as a moth's dive always has.
        const landsSafely = this.landsAfterDive && !this.world.hazardAt(this.x, this.z);
        if (this.doubleDive && !this._didSecond) {
          this._didSecond = true;          // wheel around for a second swoop
          this.state = 'telegraph';
          this.stateT = 0.55;              // shortened re-aim
        } else if (landsSafely) {
          this._didSecond = false;
          this.state = 'grounded';         // crash-landed and winded
          this.stateT = 0;
          this.flying = false;             // sword food while grounded
        } else {
          this._didSecond = false;
          this.state = 'return';
          this.stateT = 0;
        }
      }
    } else if (this.state === 'grounded') {
      this.root.position.y = Math.max(0.14, this.root.position.y - dt * 3);
      if (this.flyAction) this.flyAction.timeScale = 0.3;
      if (this.stateT > 1.3) {
        this.state = 'return';
        this.stateT = 0;
        this.flying = true;
        if (this.flyAction) this.flyAction.timeScale = 1;
      }
    } else { // return to the roost
      if (this.flyAction) this.flyAction.timeScale = 1;
      if (this.glowMats) for (const m of this.glowMats) m.emissiveIntensity = 1.1;
      const hx = this.home.x - this.x, hz = this.home.z - this.z;
      const hd = Math.hypot(hx, hz);
      if (hd < 0.3) { this.state = 'hover'; this.stateT = 0; }
      else {
        const rs = this._moveSolved(this.x + (hx / hd) * 2.4 * dt, this.z + (hz / hd) * 2.4 * dt);
        this.root.position.x = rs.x; this.root.position.z = rs.z;
        this.root.position.y = Math.min(1.5, this.root.position.y + dt);
        this.root.rotation.y = Math.atan2(hx, hz);
      }
    }
    if (this.state === 'hover' || this.state === 'telegraph') this.contact(player, 1, { ground: false });
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Ember Moth — the bat given fire: dark body, ember-glow wings that burn
// brighter through the dive telegraph. Same swoop rhythm as the cave bat.
// ---------------------------------------------------------------------------

export class Moth extends Bat {
  constructor(world, x, z, gltf) {
    super(world, x, z, gltf);
    this.puffTint = 0x6b4a3a;
    this.radius = 0.26;
    this.state = 'hover'; // moths never roost — they drift near the lava
    this.landsAfterDive = false;
    this.doubleDive = true; // swoop, wheel, swoop again
    if (this.flyAction) this.flyAction.timeScale = 1;
    this.glowMats = [];
    this.root.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Black') {         // the wings
          c.color.setHex(0x1a0d08);
          c.emissive = new THREE.Color(0xff6a2a);
          c.emissiveIntensity = 1.1;
          this.glowMats.push(c);
        } else if (m.name === 'Eyes') {
          c.emissive = new THREE.Color(0xffb25a);
          c.emissiveIntensity = 1.4;
        } else {
          c.color.setHex(0x140d18);
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    this._flashMats = [];
    this.registerFlashMats(this.root);
  }
}

// ---------------------------------------------------------------------------
// Stoneroot skeletons — KayKit models on the same Rig_Medium as the knight,
// so the shared animation library retargets directly. They sleep as bone
// piles and rattle awake when Kael comes close (kids get a readable "it is
// waking up" beat before any fight starts).
// ---------------------------------------------------------------------------

// GUARD LAYER (v3.19.1 — playtest: "the skeletons and the bone warden don't
// have a shield holding up animation"). The rig's `Melee_Blocking` clip poses
// the whole body, so playing it whole would freeze the legs mid-advance. We
// strip it down to the UPPER BODY (spine/chest/head/arms) and play that as a
// second, heavier-weighted action ON TOP of walk: the legs keep striding, the
// shield stays braced. LAW: a guard that blocks damage must LOOK raised —
// the pose and the damage rule are never allowed to disagree.
const UPPER_BODY = /^(spine|chest|head|upperarm|lowerarm|wrist|hand)/;
const GUARD_WEIGHT = 8; // vs the locomotion clip's 1 → ~89% guard on the arms

function upperBodyClip(src, name) {
  const tracks = src.tracks.filter((t) => UPPER_BODY.test(t.name.split('.')[0]));
  if (!tracks.length) return null;
  return new THREE.AnimationClip(name, src.duration, tracks);
}

class SkeletonBase extends Enemy {
  constructor(world, x, z, cfg) {
    super(world, x, z, { hp: cfg.hp, radius: cfg.radius });
    this.puffTint = 0xb8b0a0; // bone dust
    const model = prepareCharacter(SkeletonUtils.clone(cfg.gltf.scene));
    model.scale.setScalar(cfg.scale);
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, name] of Object.entries(cfg.clips)) {
      const clip = cfg.anims.find((c) => c.name === name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    // THE NUMBER HAS TO COME FROM THE ASSET (2026-09-02). Every skeleton
    // subclass hardcodes an `awakenTime` — how long it stays in the get-up
    // state before it is allowed to chase — and two of them were SHORTER than
    // the clip they were waiting on:
    //
    //   SkeletonMinion  Skeletons_Awaken_Floor     2.30s clip, awakenTime 1.9
    //   SkeletonShield  Skeletons_Awaken_Floor     2.30s clip, awakenTime 1.9
    //   SkeletonRogue   Skeletons_Awaken_Standing  1.00s clip, awakenTime 1.1
    //   BoneWarden      Skeletons_Awaken_Standing  1.00s clip, awakenTime 1.3
    //
    // Exactly the two that rise OUT OF THE FLOOR were short, and that is not a
    // coincidence — the floor clip is the only one a skeleton plays that spends
    // time below y=0 (lowest toe bone -0.044; walk, idle and the punch are all
    // positive). Cutting it 0.4s early handed `walk` a pose that still had its
    // legs in the ground, and the 0.16s crossfade carried them into the walk
    // cycle: a skeleton visibly animating with no shins. Dad, on Level 1's
    // Ember Wretches — "the skeletons is animated but his legs are partially in
    // the ground."
    //
    // The clip's own duration is the floor now, so the number cannot drift from
    // the asset again; a subclass value still wins where it is LONGER, which is
    // what the two standing wakers use for their telegraph.
    this._awakenClip = this.actions.awaken ? this.actions.awaken.getClip().duration : 0;

    // gear mounts on the sanitized handslot bones (dots stripped by GLTFLoader)
    this._handR = null;
    this._handL = null;
    model.traverse((n) => {
      if (n.name === 'handslotr') this._handR = n;
      if (n.name === 'handslotl') this._handL = n;
    });

    // asleep: a still bone pile until Kael comes close
    this.state = 'sleep';
    this.stateT = 0;
    const inactive = this.actions.inactive;
    if (inactive) { inactive.play(); inactive.paused = true; }
    // ...AND THE SLEEPING POSE HAS TO BE RETIRED, NOT JUST PAUSED.
    //
    // `inactive` is played and paused so a sleeping skeleton holds its pile-of-
    // bones pose. `_current` was left null, so the FIRST _play() found no
    // outgoing action and skipped its crossFadeTo — and a paused action is not
    // stopped, it is a still frame held at full weight. Every skeleton
    // therefore walked, idled and punched with `Skeletons_Inactive_Floor_Pose`
    // — a body lying flat on the ground — mixed in at weight 1 for the rest of
    // its life, which drags the hips and legs down through the floor.
    //
    // It hid because `AnimationAction.isRunning()` is `enabled && !paused &&
    // ...`: every debug dump of "what is running on this skeleton" answered
    // "only the walk", while the mixer's own action list showed the floor pose
    // sitting there at weight 1. Naming it as the current clip is all it takes
    // — _play() then crossfades away from it the way it always meant to.
    this._current = inactive ? 'inactive' : null;
  }

  _play(name, fade = 0.16, { once = false } = {}) {
    if (this._current === name) return;
    const next = this.actions[name];
    if (!next) return;
    next.reset();
    next.paused = false;
    if (once) { next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true; }
    next.play();
    const from = this._current ? this.actions[this._current] : null;
    if (from) {
      from.crossFadeTo(next, fade, false);
    } else {
      // NOTHING NAMED TO FADE FROM — BUT SOMETHING IS STILL POSING THIS RIG.
      //
      // Twelve attack states end with `this._current = null` to force the next
      // _play('walk') past its own early-return, and the constructor left it
      // null too. Each of those skipped the crossFadeTo above and left the
      // outgoing action exactly where it was: a paused hold (the sleeping
      // floor pose) or a LoopOnce clamped at its last frame (a finished
      // lunge), both sitting at weight 1 and both blended into everything
      // that followed for the rest of the enemy's life.
      //
      // `isRunning()` is `enabled && !paused && ...`, so it answers FALSE for
      // both — which is why every "what is running on this skeleton" dump said
      // "only the walk" while the mixer's own action list showed the floor
      // pose at weight 1 beside it. Fade out anything of ours that still has
      // weight, and fade the new clip in against it, so a null `_current`
      // means the same thing as a named one.
      for (const k in this.actions) {
        const a = this.actions[k];
        if (a !== next && a.enabled && a.getEffectiveWeight() > 0) a.fadeOut(fade);
      }
      next.fadeIn(fade);
    }
    this._current = name;
  }

  mount(hand, gltf, scale = 1) {
    const bone = hand === 'r' ? this._handR : this._handL;
    if (!bone) return;
    const m = prepareCharacter(gltf.scene.clone());
    m.scale.setScalar(scale);
    bone.add(m);
  }

  // Build the shield-up layer (call once, after the clips are bound).
  _setupGuard(anims, clipName = 'Melee_Blocking') {
    const src = anims.find((c) => c.name === clipName);
    if (!src) return;
    const clip = upperBodyClip(src, clipName + '_upper');
    if (!clip) return;
    this.guardAction = this.mixer.clipAction(clip);
    this.guardAction.setEffectiveWeight(0);
    this.guardAction.play(); // always running; weight is the switch
    this._guardW = 0;
  }

  // Ease the guard pose in/out (~0.1s) so raising and DROPPING the shield
  // both read — the drop IS the opening the kids are taught to watch for.
  _guard(up, dt) {
    if (!this.guardAction) return;
    const target = up ? GUARD_WEIGHT : 0;
    this._guardW += (target - this._guardW) * Math.min(1, dt * 14);
    if (Math.abs(target - this._guardW) < 0.02) this._guardW = target;
    this.guardAction.setEffectiveWeight(this._guardW);
  }

  die() {
    audio.play('bones', { volume: 0.8, rate: 1.2 }); // bones clatter
    super.die();
  }

  // shared awaken logic; returns true while still waking (callers wait)
  awakenUpdate(dt, d, wakeRange) {
    if (this.state === 'sleep') {
      if (d < wakeRange) {
        this.state = 'awaken';
        this.stateT = 0;
        this._play('awaken', 0.08, { once: true });
        audio.play('bones', { volume: 0.5, rate: 0.7 }); // rattle
      }
      this.mixer.update(dt);
      return true;
    }
    if (this.state === 'awaken') {
      this.stateT += dt;
      if (this.stateT >= Math.max(this.awakenTime, this._awakenClip)) {
        this.state = 'chase'; this.stateT = 0;
      }
      this.mixer.update(dt);
      return true;
    }
    return false;
  }

  chaseToward(dt, dx, dz, d, speed) {
    if (d < 0.01) return;
    const nx = this.x + (dx / d) * speed * dt;
    const nz = this.z + (dz / d) * speed * dt;
    const solved = this.world.resolveCircle(nx, nz, this.radius);
    this.root.position.x = solved.x;
    this.root.position.z = solved.z;
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  // TURN-CLAMPED FACING, shared. Snap-facing + a frontal guard/arc meant a
  // heavy or shielded enemy could never be flanked (BoneWarden's own fix,
  // v3.20) — every class below that advances slowly and hits hard reuses the
  // exact same turn rate idiom instead of re-deriving it.
  turnToward(dt, dx, dz, rate) {
    if (Math.hypot(dx, dz) < 0.01) return;
    const want = Math.atan2(dx, dz);
    let delta = want - this.root.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.root.rotation.y += Math.max(-rate * dt, Math.min(rate * dt, delta));
  }

  // Frontal-arc melee hit test, lifted out of BoneWarden so every new swing
  // (task #31) reads the SAME shape it draws — LAW 7, never re-derived twice.
  _swingDamage(player, arcDeg, range, dmg) {
    const px = player.root.position.x - this.x;
    const pz = player.root.position.z - this.z;
    const d = Math.hypot(px, pz);
    if (d > range) return;
    const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
    if (arcDeg < 360 && d > 0.1 && (px * fx + pz * fz) / d < Math.cos(arcDeg * Math.PI / 360)) return;
    player.hurt(dmg, { attacker: this, groundAttack: true });
  }
}

// Skeleton Minion — the basic shuffler. Wakes from the floor, shambles in,
// contact damage; every few seconds it lunges with a little punch.
export class SkeletonMinion extends SkeletonBase {
  constructor(world, x, z, gltf, anims) {
    super(world, x, z, {
      hp: 2, radius: 0.36, scale: 0.5, gltf, anims,
      clips: {
        inactive: 'Skeletons_Inactive_Floor_Pose', awaken: 'Skeletons_Awaken_Floor',
        walk: 'Skeletons_Walking', idle: 'Skeletons_Idle', lunge: 'Melee_Unarmed_Attack_Punch_A',
      },
    });
    this.awakenTime = 1.9;
    this.lungeTimer = 2.0;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    if (this.awakenUpdate(dt, d, this.senseRange(player, 3.4))) return;

    if (this.state === 'chase') {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d); // bones queue up too
      } else {
        const iv = this.interceptDir(player, d);            // bones cut corners too
        this.chaseToward(dt, iv.x, iv.z, 1, this.pursueSpeed(this.speed || 1.5, d));
      }
      this.lungeTimer -= dt;
      if (d < 1.6 && this.lungeTimer <= 0 && this.engaged !== false) {
        this.state = 'lunge';
        this.stateT = 0;
        this._play('lunge', 0.08, { once: true });
        const dd = Math.max(d, 0.01);
        this.lungeDir = { x: dx / dd, z: dz / dd };
      }
    } else if (this.state === 'lunge') {
      this.stateT += dt;
      if (this.stateT > P_LUNGE.windupEnd && this.stateT < P_LUNGE.activeEnd) {
        this.chaseToward(dt, this.lungeDir.x, this.lungeDir.z, 1, 3.4);
      }
      if (this.stateT > P_LUNGE.stateEnd) { this.state = 'chase'; this.lungeTimer = A.minion_lunge.gap; this._current = null; }
    }
    this.contact(player, this.contactDmg || 1); // brutes hit harder (VARIANTS)
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Skeleton Rogue — quick blade-dancer. Wakes standing, circles just out of
// sword reach, crouch-telegraphs (~0.7s), then dashes through. Parry or jump.
export class SkeletonRogue extends SkeletonBase {
  constructor(world, x, z, gltf, anims, bladeGltf) {
    super(world, x, z, {
      hp: 1.5, radius: 0.34, scale: 0.48, gltf, anims,
      clips: {
        inactive: 'Skeletons_Inactive_Standing_Pose', awaken: 'Skeletons_Awaken_Standing',
        walk: 'Skeletons_Walking', run: 'Running_A', idle: 'Skeletons_Idle',
        stab: 'Melee_1H_Attack_Stab', taunt: 'Skeletons_Taunt',
      },
    });
    this.awakenTime = 1.1;
    if (bladeGltf) this.mount('r', bladeGltf);
    this.orbitDir = (x + z) % 2 < 1 ? 1 : -1;
    this.dashTimer = 1.6;
    this._dodgeCd = 0; // the blade-dancer SIDESTEPS the first swing
  }

  // PREDICTABLE dodge pattern (anti-button-mash): the rogue hops aside from
  // the FIRST melee swing, then is open for 3.5s. Bolts and AoE always land;
  // a stunned rogue can't dodge. Kids learn: bait the hop, THEN strike.
  takeDamage(n, element, kind) {
    if (!this.dead && kind === 'melee' && this._dodgeCd <= 0 && this.stunned <= 0 && this.state !== 'dash') {
      this._dodgeCd = 3.5;
      const a = this.root.rotation.y + (this.orbitDir > 0 ? 1 : -1) * Math.PI / 2;
      const s = this._moveSolved(this.x + Math.sin(a) * 1.5, this.z + Math.cos(a) * 1.5);
      this.root.position.x = s.x;
      this.root.position.z = s.z;
      if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.0, this.z, 'DODGE');
      audio.play('puff', { volume: 0.5, rate: 1.7 });
      return;
    }
    super.takeDamage(n, element, kind);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this._dodgeCd > 0) this._dodgeCd -= dt;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);
    if (this.awakenUpdate(dt, d, this.senseRange(player, 4.2))) return;

    if (this.state === 'chase') {
      // Pass 2 audit (combat context pack §3): the rogue's own ~2.6u orbit
      // never checked engagement either — it closed and dashed on its own
      // clock no matter how many other fighters already held a token. When
      // un-engaged it now holds the SAME waiting ring every other prowler
      // reads (CONFIG.ENGAGE.HOLD_DIST), so a child sees one consistent
      // "not their turn yet" pose across the whole roster; the tighter
      // 2.6u attack-approach orbit only starts once a token is actually held.
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this._play('run');
        this.holdOrbit(dt, dx, dz, d);
      } else {
        // orbit at ~2.6, closing slowly
        const tangent = { x: -dz / Math.max(d, 0.01) * this.orbitDir, z: dx / Math.max(d, 0.01) * this.orbitDir };
        const inward = d > 2.6 ? 0.8 : -0.3;
        const mx = tangent.x * 1.6 + (dx / Math.max(d, 0.01)) * inward;
        const mz = tangent.z * 1.6 + (dz / Math.max(d, 0.01)) * inward;
        const mm = Math.hypot(mx, mz);
        this._play('run');
        this.chaseToward(dt, mx / mm, mz / mm, 1, 2.3);
        this.root.rotation.y = Math.atan2(dx, dz);
      }
      this.dashTimer -= dt;
      if (this.dashTimer <= 0 && d < 4.6 && this.engaged !== false) {
        this.state = 'telegraph';
        this.stateT = 0;
        this._play('idle', 0.08);
        const dd = Math.max(d, 0.01);
        this.dashDir = { x: dx / dd, z: dz / dd };
        this.root.rotation.y = Math.atan2(this.dashDir.x, this.dashDir.z);
      }
    } else if (this.state === 'telegraph') {
      // crouch low + rising hiss — the "block or jump NOW" beat
      this.stateT += dt;
      this.model.scale.y = 0.48 * (1 - 0.22 * Math.min(1, this.stateT * 2.4));
      if (this.stateT >= A.rogue_dash.windup) {
        this.state = 'dash';
        this.stateT = 0;
        this.model.scale.y = 0.48;
        this._play('stab', 0.06, { once: true });
        audio.play('sword-swing2', { volume: 0.6, rate: 1.3 });
      }
    } else if (this.state === 'dash') {
      this.stateT += dt;
      const nx = this.x + this.dashDir.x * 7.5 * dt;
      const nz = this.z + this.dashDir.z * 7.5 * dt;
      const solved = this._moveSolved(nx, nz);
      const blocked = Math.hypot(solved.x - nx, solved.z - nz) > 0.01;
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > A.rogue_dash.active || blocked) { this.state = 'recover'; this.stateT = 0; this._play('idle', 0.2); }
    } else { // recover — open to punishment
      this.stateT += dt;
      if (this.stateT > A.rogue_dash.recover) { this.state = 'chase'; this.dashTimer = A.rogue_dash.gap + Math.random(); }
    }

    if (this.state === 'chase' || this.state === 'telegraph') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// The Bone Warden — Stoneroot's crypt guardian. A big armored skeleton with
// axe + tower shield. Two attacks, both loudly telegraphed: an overhead chop
// (parry it!) and a slow spin when Kael hugs too close. After three swings it
// wheezes — a big open punish window.
// Skeleton Shieldling — the WALL that walks (playtest: "some approach with
// a shield and damage is null till they drop it"). It advances slowly behind
// a tower shield: every frontal hit CLANKS off (BLOCKED). Three honest ways
// in, all taught by feedback: wait for its swing (the shield drops for the
// whole wind-up + recovery), slip around BEHIND it, or stun it (parry /
// rock / stomp) to break its guard.
export class SkeletonShield extends SkeletonBase {
  constructor(world, x, z, gltf, anims, shieldGltf, bladeGltf) {
    super(world, x, z, {
      hp: 2.5, radius: 0.38, scale: 0.5, gltf, anims,
      clips: {
        inactive: 'Skeletons_Inactive_Floor_Pose', awaken: 'Skeletons_Awaken_Floor',
        walk: 'Skeletons_Walking', idle: 'Skeletons_Idle',
        swing: 'Melee_1H_Attack_Chop', // the guard pose is a LAYER (_setupGuard)
      },
    });
    this.awakenTime = 1.9;
    this.dropChance = 0.6;
    if (shieldGltf) this.mount('l', shieldGltf);
    if (bladeGltf) this.mount('r', bladeGltf);
    this.swingTimer = 2.2;
    this._pp = null;
    this._setupGuard(anims); // the tower shield RIDES UP while it walks
  }

  // shield up = frontal damage nulls (same honest cone as the Warden);
  // guard is DOWN while it swings/recovers, while stunned, and from behind
  get shieldUp() {
    return this.state === 'chase' && this.stunned <= 0;
  }

  takeDamage(n, element, kind) {
    if (!this.dead && this.shieldUp && this._pp) {
      const dx = this._pp.x - this.x, dz = this._pp.z - this.z;
      const dd = Math.hypot(dx, dz);
      const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
      if (dd > 0.05 && (dx * fx + dz * fz) / dd > 0.35) {
        audio.play('parry', { volume: 0.45, rate: 0.6 }); // CLANK — teach
        this._pop = 0.1;
        if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.2, this.z, 'BLOCKED');
        return;
      }
    }
    super.takeDamage(n, element, kind);
  }

  update(dt, t, player) {
    if (this.dead) return;
    this._pp = { x: player.root.position.x, z: player.root.position.z };
    // the guard pose follows the guard RULE exactly, every frame — stunned
    // or mid-swing, the shield visibly drops
    this._guard(this.shieldUp, dt);
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    if (this.awakenUpdate(dt, d, this.senseRange(player, 3.6))) return;

    if (this.state === 'chase') {
      // a slow, deliberate shield-wall shuffle — menace, not speed. It
      // TURNS slowly too (2 rad/s): a quick kid can genuinely circle
      // behind the shield, which is the whole lesson. The legs walk; the
      // guard layer holds the shield braced the whole way in.
      this._play('walk', 0.2);
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        const want = Math.atan2(dx, dz);
        let delta = want - this.root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        this.root.rotation.y += Math.max(-2.0 * dt, Math.min(2.0 * dt, delta));
        const s = this._moveSolved(
          this.x + Math.sin(this.root.rotation.y) * 1.0 * dt,
          this.z + Math.cos(this.root.rotation.y) * 1.0 * dt);
        this.root.position.x = s.x;
        this.root.position.z = s.z;
      }
      this.swingTimer -= dt;
      if (d < 1.9 && this.swingTimer <= 0 && this.engaged !== false) {
        // THE OPENING: the shield comes DOWN for the whole swing + recovery
        this.state = 'swing';
        this.stateT = 0;
        this._play('swing', 0.1, { once: true });
        audio.play('bones', { volume: 0.5, rate: 1.1 });
      }
    } else if (this.state === 'swing') {
      this.stateT += dt;
      if (this.stateT > P_SWING.windupEnd && this.stateT < P_SWING.activeEnd) {
        // the chop lands in a short frontal arc
        const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
        const px2 = player.root.position.x - this.x, pz2 = player.root.position.z - this.z;
        const pd = Math.hypot(px2, pz2);
        if (pd < 1.6 && pd > 0.05 && (px2 * fx + pz2 * fz) / pd > 0.5) {
          player.hurt(1, { attacker: this, groundAttack: true });
        }
      }
      if (this.stateT > P_SWING.stateEnd) { // long recovery — the punish window
        this.state = 'chase';
        this.swingTimer = A.shield_swing.gap;
        this._current = null;
      }
    }
    this.contact(player, 0.5);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

export class BoneWarden extends SkeletonBase {
  constructor(world, x, z, gltf, anims, axeGltf, shieldGltf) {
    super(world, x, z, {
      // Dad, twice now: "bigger, like the wolf boss" (v3.18.2) and again from
      // play "bone warden needs to be bigger". Scale 1.1 CLAIMED the Shadowgrip
      // ratio but only delivered 1.87x Kael — the comparison was scale-numbers
      // vs minions, not measured height vs the player (Skeleton_Warrior.glb's
      // raw mesh is 17% shorter than knight.glb's). 1.35 makes him ~2.9u,
      // a true 2.3x over Kael's measured 1.27u — the Shadowgrip ratio, for
      // real this time. Reach, damage and the danger rings are UNCHANGED:
      // the rings are drawn at true reach, so a bigger body over the same
      // hitboxes is strictly fairer.
      hp: 14, radius: 0.9, scale: 1.35, gltf, anims,
      clips: {
        inactive: 'Skeletons_Inactive_Standing_Pose', awaken: 'Skeletons_Awaken_Standing',
        walk: 'Skeletons_Walking', idle: 'Skeletons_Idle',
        chop: 'Melee_1H_Attack_Chop', spin: 'Melee_2H_Attack_Spin',
        taunt: 'Skeletons_Taunt', tired: 'Skeletons_Inactive_Standing_Pose',
      },
    });
    this.awakenTime = 1.3;
    this.dropChance = 1;
    // WOUNDS PERSIST ACROSS DEATHS — the spec is explicit and universal:
    // COMBAT-SPEC.md ("wounds PERSIST across deaths, flags.bossHp, saved") and
    // LEVEL-DESIGN-5/6/7 ("her wounds persist across deaths, like every boss
    // since v3.18"). Every boss.js boss reads state.flags[saveKey] at build and
    // writes it on every hit; the Warden — the one boss that lives in
    // enemies.js — did neither, so he reset to full on every death and a child
    // (or a play-test bot) who chipped him to a sliver lost all of it on one
    // fall. Restored here, saved in takeDamage below. In-memory flag only: this
    // is the across-deaths persistence the spec names, and it touches no save
    // format. (Cross-session parity — adding wardenHp to save.js — is logged in
    // MORNING-REVIEW as an additive follow-up.)
    if (state.flags.wardenHp > 0) this.hp = Math.min(state.flags.wardenHp, this.maxHp);
    if (axeGltf) this.mount('r', axeGltf);
    if (shieldGltf) this.mount('l', shieldGltf);
    this.swings = 0;
    this.attackTimer = 1.4;
    // v3.19.1: the Warden had NO guard pose at all — he front-blocked
    // everything while strolling with the tower shield at his hip. Now the
    // shield rides UP the whole advance and drops for every swing.
    this._setupGuard(anims);

    // telegraph ring shows the chop's danger zone (boss-sized) — and it sits
    // ABOVE the crypt's stone floor tiles (height law: y<~0.17 is buried)
    // TWO marks, because the Warden has two attacks and they are different
    // SHAPES. The chop is a 130-degree cone reaching 2.9u; the spin is the whole
    // circle at 2.6u. One 162-degree wedge was being drawn for both, which meant
    // the spin — the attack you cannot step out of sideways — was signposted as
    // if it had a safe side. Radii are the real reach: RingGeometry's outer edge
    // IS where the axe lands.
    const mark = (geo) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xff4a3a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = world.deckY + 0.02;           // height law (v3.20)
      world.add(m);
      return m;
    };
    this.dangerRing = mark(new THREE.RingGeometry(1.0, 2.9, 28, 1, 0, CHOP_ARC));
    this.spinRing = mark(new THREE.RingGeometry(1.0, 2.6, 32));
  }

  die() {
    this.world.root.remove(this.dangerRing);
    this.world.root.remove(this.spinRing);
    state.flags.wardenHp = 0;   // the duel is over — no stale wound to restore
    if (this.world.onWardenDefeated) this.world.onWardenDefeated(this);
    super.die();
  }

  // The tower shield blocks everything from the front while he advances —
  // flank him, or parry the chop and punish the stun. Punish windows
  // (tired / stunned / mid-swing) take full damage.
  takeDamage(n, element, kind) {
    if (!this.dead && this.shieldUp && this._pp) {
      const dx = this._pp.x - this.x, dz = this._pp.z - this.z;
      const dd = Math.hypot(dx, dz);
      const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
      // 0.5 (±60°), was 0.42 (±65.2°). The old cone exactly matched the 130°
      // chop arc, so the shield edge and the axe edge were the same line: a
      // child who cleared the block was still inside the swing, zero margin.
      // ±60° opens a real band where a flank lands and the chop cannot reach.
      if (dd > 0.05 && (dx * fx + dz * fz) / dd > 0.5) {
        audio.play('parry', { volume: 0.45, rate: 0.55 }); // clank — blocked
        this._pop = 0.1;
        this._blockedOnce = true;
        if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.2, this.z, 'BLOCKED');
        return;
      }
    }
    super.takeDamage(n, element, kind);
    // ...and the wound is remembered (see constructor). Written after super so
    // it reflects the blow that actually landed, exactly as boss.js does.
    if (!this.dead) state.flags.wardenHp = Math.max(0, this.hp);
  }

  // his front-block law (takeDamage) in one place — the pose reads from the
  // SAME expression, so the shield can never lie about the hitbox
  get shieldUp() {
    return this.stunned <= 0 &&
      (this.state === 'chase' || this.state === 'chop_tele' || this.state === 'spin_tele');
  }

  update(dt, t, player) {
    if (this.dead) return;
    this._guard(this.shieldUp, dt);
    // a stunned giant is not about to hit anyone: BOTH marks go out
    if (this.stunUpdate(dt)) {
      this.mixer.update(dt);
      this.dangerRing.material.opacity = 0;
      this.spinRing.material.opacity = 0;
      return;
    }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this._pp = { x: player.root.position.x, z: player.root.position.z };
    if (this.awakenUpdate(dt, d, this.senseRange(player, 5.2))) return;
    this.stateT += dt;

    if (this.state === 'chase') {
      this._play('walk');
      // TURN-CLAMPED, NOT SNAP-FACED. chaseToward snaps rotation to the player
      // every frame — infinite turn rate — and the Warden front-blocks a ±60°
      // cone whenever his shield is up, which is ALL of chase and both
      // telegraphs. Snap-facing + front-block meant every hit from every angle
      // was "frontal": flanking him was mathematically impossible, which is
      // exactly dad's "I as an adult had a hard time getting around to his
      // back". He now turns like the old giant he is — 1.6 rad/s, slower than
      // a Shieldling's 2.0 — and lumbers at 1.15 u/s, so a circling child
      // genuinely gets behind the shield. (Pattern from SkeletonShield above;
      // chaseToward itself is untouched — the minions share it.)
      if (d > 0.01) {
        const want = Math.atan2(dx, dz);
        let delta = want - this.root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        this.root.rotation.y += Math.max(-1.6 * dt, Math.min(1.6 * dt, delta));
        const s = this._moveSolved(
          this.x + Math.sin(this.root.rotation.y) * 1.15 * dt,
          this.z + Math.cos(this.root.rotation.y) * 1.15 * dt);
        this.root.position.x = s.x;
        this.root.position.z = s.z;
      }
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && d < 3.0) { // giant reach
        if (this.swings >= 3) {
          this.state = 'tired';
          this.stateT = 0;
          this.swings = 0;
          this._play('tired', 0.3);
        } else if (d < 1.9) {
          this.state = 'spin_tele';
          this.stateT = 0;
          this._play('idle', 0.1);
        } else {
          this.state = 'chop_tele';
          this.stateT = 0;
          this._play('idle', 0.1);
          this.root.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (this.state === 'chop_tele') {
      // 1.1s: the danger arc fades in where the axe will land. Was 0.9s —
      // lengthened with every other window (dad: "slightly slower") so a
      // 7-year-old's read-then-move actually fits inside it; his facing is
      // frozen from the moment the telegraph starts, so this IS the flank
      // window.
      const f = Math.min(1, this.stateT / 1.1);
      this.dangerRing.position.set(this.x, this.world.deckY + 0.02, this.z);
      // THE ARC POINTS WHERE THE AXE GOES. This was `-rotation.y + ...`, which
      // MIRRORS the heading instead of rotating it: the mesh is laid flat by
      // rotation.x = -PI/2 and three.js Euler XYZ applies Rz first, so a local
      // vertex at angle a ends up at world (cos(a+z), -sin(a+z)) — the sign has
      // to follow the facing, not oppose it. Measured before the fix, the red
      // "the axe lands here" arc was correct at exactly one facing (171 deg) and
      // up to 162 deg wrong everywhere else, i.e. pointing almost directly away
      // from the swing. A child dodging by it was being sent INTO the axe.
      this.dangerRing.rotation.z = this.root.rotation.y - Math.PI / 2 - CHOP_ARC / 2;
      this.dangerRing.material.opacity = f * 0.55;
      if (this.stateT >= 1.1) {
        this.state = 'chop';
        this.stateT = 0;
        this._play('chop', 0.06, { once: true });
        audio.play('sword-swing', { volume: 0.9, rate: 0.7 });
      }
    } else if (this.state === 'chop') {
      // fade to nothing at 0.45s, AFTER the 0.32s damage frame. It used to hit
      // zero at 0.275s, so the mark vanished three frames before the axe landed.
      this.dangerRing.material.opacity = Math.max(0, 0.55 - this.stateT * 1.2);
      if (this.stateT > 0.32 && !this._chopHit) {
        this._chopHit = true;
        this._swingDamage(player, 130, 2.9, 1.5); // giant's axe reach
        audio.play('slam', { volume: 0.5, rate: 1.4 });
      }
      // recovery lengthened 0.8→1.15s and the gap to his next swing 1.1→1.5s:
      // the post-chop opening is the punish a flanking child was promised
      if (this.stateT > 1.15) { this.state = 'chase'; this._chopHit = false; this.swings++; this.attackTimer = 1.5; }
    } else if (this.state === 'spin_tele') {
      // 1.0s: full-circle warning ring
      const f = Math.min(1, this.stateT / 1.0);
      this.spinRing.position.set(this.x, this.world.deckY + 0.02, this.z);
      this.spinRing.material.opacity = f * 0.55;
      if (this.stateT >= 1.0) {
        this.state = 'spin';
        this.stateT = 0;
        this._play('spin', 0.06, { once: true });
        audio.play('sword-swing2', { volume: 0.9, rate: 0.6 });
      }
    } else if (this.state === 'spin') {
      // ...and stays up past the 0.45s damage frame, as the chop mark now does
      this.spinRing.material.opacity = Math.max(0, 0.55 - this.stateT * 0.9);
      if (this.stateT > 0.45 && !this._spinHit) {
        this._spinHit = true;
        this._swingDamage(player, 360, 2.6, 1.5); // giant's full-circle sweep
      }
      if (this.stateT > 1.45) {
        this.state = 'chase'; this._spinHit = false; this.spinRing.material.opacity = 0;
        this.swings++; this.attackTimer = 1.7;
      }
    } else if (this.state === 'tired') {
      // ~3.4s wheeze — the punish window (double damage would need a stun;
      // being wide open is reward enough for kids). Lengthened from 2.6s with
      // the rest of dad's "slightly slower" pass.
      this.root.position.y = Math.sin(this.stateT * 18) * 0.01;
      if (this.stateT > 3.4) { this.state = 'chase'; this.attackTimer = 1.1; this.root.position.y = 0; }
    }

    if (this.state === 'chase') this.contact(player, 1);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// ROSTER EXPANSION (task #31) — 15 new AI behaviors for the 32-enemy roster.
// Every class below loads ITS OWN generated body (assets/generated/enemies/
// <id>.glb — the roster tool's baked recolor/part-swap output, reviewed
// before wiring per the standing rule) and binds to the SAME shared
// rig-medium clip library spawnEnemies() already loads for the Stoneroot
// skeletons — no new animation assets, no code-built creatures. `opts`
// carries the per-instance weakness/resist override, since one class often
// answers for roster ids in different regions (Duellist is both the frost
// Visored Wight and the Shadow Court's Gilded Husk) and TRAITS is a class
// DEFAULT, not a verdict — same rule VARIANTS has always run by.
//
// None of these classes start asleep: they're alert guards/beasts, not
// slumbering bone piles, so the sleep/awaken beat (SkeletonBase.state=
// 'sleep') is skipped — `this.state` is set to each class's own first
// active state right after construction instead.
// ---------------------------------------------------------------------------

function applyRosterWeak(e, opts) {
  if (opts.weakness !== undefined) e.weakness = opts.weakness;
  if (opts.resist !== undefined) e.resist = opts.resist;
}

// Maskbone / Emberfang — circles for an opening, then dashes in from the
// side. Same orbit-then-commit shape as the Skeleton Rogue but without its
// dodge gimmick (that's the Rogue's own identity) — a lighter, trash-tier
// read: "it's circling, watch where it lands."
export class Flanker extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 3, radius: 0.34, scale: 0.48, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A', stab: 'Melee_1H_Attack_Slice_Diagonal' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.orbitDir = (x + z) % 2 < 1 ? 1 : -1;
    this.dashTimer = 1.4;
    if (opts.bladeGltf) this.mount('r', opts.bladeGltf);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this._play('walk');
        this.holdOrbit(dt, dx, dz, d);
      } else {
        const tangent = { x: -dz / Math.max(d, 0.01) * this.orbitDir, z: dx / Math.max(d, 0.01) * this.orbitDir };
        const inward = d > 2.4 ? 0.9 : -0.4;
        const mx = tangent.x * 1.8 + (dx / Math.max(d, 0.01)) * inward;
        const mz = tangent.z * 1.8 + (dz / Math.max(d, 0.01)) * inward;
        const mm = Math.hypot(mx, mz) || 1;
        this._play('walk');
        this.chaseToward(dt, mx / mm, mz / mm, 1, 2.1);
        this.root.rotation.y = Math.atan2(dx, dz);
      }
      this.dashTimer -= dt;
      if (this.dashTimer <= 0 && d < 4.2 && this.engaged !== false) {
        this.state = 'telegraph';
        this.stateT = 0;
        this._play('idle', 0.08);
        const dd = Math.max(d, 0.01);
        this.dashDir = { x: dx / dd, z: dz / dd };
        this.root.rotation.y = Math.atan2(this.dashDir.x, this.dashDir.z);
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      this.model.scale.y = 0.48 * (1 - 0.2 * Math.min(1, this.stateT * 2.4));
      if (this.stateT >= A.flanker_strike.windup) {
        this.state = 'dash';
        this.stateT = 0;
        this.model.scale.y = 0.48;
        this._play('stab', 0.06, { once: true });
      }
    } else if (this.state === 'dash') {
      this.stateT += dt;
      const nx = this.x + this.dashDir.x * 6.4 * dt, nz = this.z + this.dashDir.z * 6.4 * dt;
      const solved = this._moveSolved(nx, nz);
      this.root.position.x = solved.x; this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > A.flanker_strike.active) { this.state = 'recover'; this.stateT = 0; this._play('idle', 0.2); }
    } else { // recover
      this.stateT += dt;
      if (this.stateT > A.flanker_strike.recover) { this.state = 'chase'; this.dashTimer = A.flanker_strike.gap + Math.random() * 0.6; }
    }
    if (this.state === 'chase' || this.state === 'telegraph') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// The Lurker — an ambush predator. Starts UNAWARE (the awareness system is
// built into the class itself, not opt-in per variant like the Shadow
// Court): paces its spot, half-notices, and only pounces once it has fully
// noticed — the same stalk-crouch-charge shape as the Shadow Hound, just
// shorter and meaner: an ambush, not a chase.
export class Stalker extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 4, radius: 0.36, scale: 0.5, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', crouch: 'Melee_Unarmed_Idle', charge: 'Running_B', pounce: 'Melee_Unarmed_Attack_Kick' },
    });
    applyRosterWeak(this, opts);
    this._sleeps = true;
    this.alert = 'unaware';
    this.eyeMats = [];
    this.model.traverse((n) => {
      if (!n.isMesh) return;
      for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
        if (/eye/i.test(m.name || '')) this.eyeMats.push(m);
      }
    });
    this.state = 'stalk';
    this.stateT = 0;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    this._calm(dt, player);
    this._senses(dt, player);
    if (this._asleep(player)) { this._drowse(dt, t, player); this.mixer.update(dt); return; }
    this.stateT += dt;
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'stalk') {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        const speed = this.pursueSpeed(1.6, d);
        const iv = this.interceptDir(player, d);
        this.chaseToward(dt, iv.x, iv.z, 1, speed);
      }
      if (d < 3.6 && this.stateT > 0.6 && this.engaged !== false) {
        this.state = 'crouch'; this.stateT = 0;
        const dd = Math.max(d, 0.01);
        this.chargeDir = { x: dx / dd, z: dz / dd };
      }
    } else if (this.state === 'crouch') {
      this._play('crouch', 0.1);
      this.model.scale.y = 0.5 * (1 - 0.15 * Math.min(1, this.stateT * 1.4));
      for (const m of this.eyeMats) if (m.emissive) m.emissiveIntensity = 1.2 + (this.stateT / A.stalker_pounce.windup) * 2.4;
      if (this.stateT >= A.stalker_pounce.windup) {
        this.state = 'charge'; this.stateT = 0; this.model.scale.y = 0.5;
        this._play('charge', 0.06); this._pounceHit = false;
        audio.play('growl', { volume: 0.4, rate: 0.55 });
      }
    } else if (this.state === 'charge') {
      const nx = this.x + this.chargeDir.x * 6.6 * dt, nz = this.z + this.chargeDir.z * 6.6 * dt;
      const solved = this._moveSolved(nx, nz);
      this.root.position.x = solved.x; this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > A.stalker_pounce.active) { this.state = 'recover'; this.stateT = 0; this._play('idle', 0.2); }
    } else { // recover
      for (const m of this.eyeMats) if (m.emissive) m.emissiveIntensity = Math.max(0.3, m.emissiveIntensity - dt * 4);
      if (this.stateT > A.stalker_pounce.recover) { this.state = 'stalk'; this.stateT = 0; }
    }
    if (this.state !== 'charge') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Base for the three "stand off and shoot" roster ids (wraith-archer,
// thornstalker, quiverbones) — same shape as Ember Spitter (hold range,
// visible windup, interceptPoint-aimed shot) transplanted onto legs. The
// windup itself carries the attack-token commitment (like Spitter, nothing
// else checks `state` for it) so it can never fizzle mid-draw.
export class RangedKiter extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 3, radius: 0.34, scale: 0.48, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', draw: 'Throw' },
    });
    applyRosterWeak(this, opts);
    this.state = 'kite';
    this.holdRange = opts.holdRange ?? 5.5;
    this.aggroRange = opts.aggroRange ?? 12;
    this._shotT = 1.0;
    this._windup = 0;
    this._bolts = [];
    this._boltColor = opts.boltColor ?? 0xdcd0b0;
  }

  _fire(player) {
    const speed0 = state.settings.easy ? 6.0 : 8.0;
    const aim = this.interceptPoint(player, speed0, 1.2);
    const dx = aim.x - this.x, dz = aim.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: this._boltColor, emissiveIntensity: 2.2, roughness: 1 }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(this.x, 0.9, this.z);
    this.world.add(mesh);
    this.world.keepLoose(mesh);
    this._bolts.push({ mesh, x: this.x, z: this.z, vx: (dx / d) * speed0, vz: (dz / d) * speed0, life: 2.2 });
    audio.play('form-switch', { volume: 0.3, rate: 1.8 });
  }

  _updateBolts(dt, player) {
    for (const b of this._bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      const s = this.world.resolveCircle(b.x, b.z, 0.1);
      const hitWall = Math.hypot(s.x - b.x, s.z - b.z) > 0.01;
      const pdx = player.root.position.x - b.x, pdz = player.root.position.z - b.z;
      const hitKael = pdx * pdx + pdz * pdz < 0.5 * 0.5;
      if (hitKael) player.hurt(1, { attacker: this, groundAttack: true });
      if (hitWall || hitKael || b.life <= 0) { b.life = 0; juice.burst(b.x, 0.7, b.z, this._boltColor, 4); b.mesh.visible = false; }
      else { b.mesh.position.set(b.x, 0.9, b.z); b.mesh.rotation.y = Math.atan2(b.vx, b.vz); }
    }
    this._bolts = this._bolts.filter((b) => b.life > 0 || b.mesh.visible);
  }

  update(dt, t, player) {
    if (this.dead) { this._updateBolts(dt, player); return; }
    if (this.stunUpdate(dt)) { this._updateBolts(dt, player); this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this.root.rotation.y = Math.atan2(dx, dz);

    if (this._windup > 0) {
      this._play('draw', 0.06);
      this._windup -= dt;
      const f = 1 - Math.max(0, this._windup) / A.ranged_kite_shot.windup;
      this.model.scale.setScalar(0.48 * (1 + f * 0.12));
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = 0.3 + f * 1.6;
      if (this._windup <= 0) {
        this.model.scale.setScalar(0.48);
        this._fire(player);
        this._shotT = state.settings.easy ? 2.6 : A.ranged_kite_shot.gap;
      }
    } else if (d < this.senseRange(player, this.aggroRange) && d > 0.01) {
      this._shotT -= dt;
      if (d < this.holdRange) {
        this._play('walk');
        const sv = this._moveSolved(this.x - (dx / d) * 1.8 * dt, this.z - (dz / d) * 1.8 * dt);
        this.root.position.x = sv.x; this.root.position.z = sv.z;
      } else {
        this._play('idle');
      }
      if (this._shotT <= 0 && d > 2.5 && this.engaged !== false) this._windup = A.ranged_kite_shot.windup;
    } else {
      this._play('idle');
    }
    this.contact(player, 0.5);
    this._updateBolts(dt, player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Rotcaster — an arcing lob rather than an aimed shot: less precise (it
// throws at where Kael IS, not an intercept), which is the whole point —
// the counterplay is "keep moving", not "read the exact line".
export class RangedLobber extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 3, radius: 0.34, scale: 0.48, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', draw: 'Throw' },
    });
    applyRosterWeak(this, opts);
    this.state = 'kite';
    this.holdRange = opts.holdRange ?? 5.0;
    this.aggroRange = opts.aggroRange ?? 11;
    this._shotT = 1.2;
    this._windup = 0;
    this._lobs = [];
  }

  _fire(player) {
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const flight = Math.min(1.4, 0.4 + d / 6);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 7, 5),
      new THREE.MeshStandardMaterial({ color: 0x2a3a10, emissive: 0x9bd63c, emissiveIntensity: 1.6, roughness: 1 }));
    mesh.position.set(this.x, 0.9, this.z);
    this.world.add(mesh);
    this.world.keepLoose(mesh);
    this._lobs.push({ mesh, x0: this.x, z0: this.z, x1: px, z1: pz, t: 0, flight });
    audio.play('growl', { volume: 0.35, rate: 1.3 });
  }

  _updateLobs(dt, player) {
    for (const l of this._lobs) {
      if (l.done) continue;
      l.t += dt;
      const f = Math.min(1, l.t / l.flight);
      const x = l.x0 + (l.x1 - l.x0) * f, z = l.z0 + (l.z1 - l.z0) * f;
      const arc = Math.sin(f * Math.PI) * 1.1;
      l.mesh.position.set(x, 0.4 + arc, z);
      if (f >= 1) {
        l.done = true;
        l.mesh.visible = false;
        juice.burst(x, 0.4, z, 0x9bd63c, 6);
        const pdx = player.root.position.x - x, pdz = player.root.position.z - z;
        if (pdx * pdx + pdz * pdz < 0.9 * 0.9) player.hurt(1, { attacker: this, groundAttack: true });
      }
    }
    this._lobs = this._lobs.filter((l) => !l.done || l.mesh.visible);
  }

  update(dt, t, player) {
    if (this.dead) { this._updateLobs(dt, player); return; }
    if (this.stunUpdate(dt)) { this._updateLobs(dt, player); this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this.root.rotation.y = Math.atan2(dx, dz);

    if (this._windup > 0) {
      this._play('draw', 0.06);
      this._windup -= dt;
      const f = 1 - Math.max(0, this._windup) / A.ranged_lob_throw.windup;
      this.model.scale.setScalar(0.48 * (1 + f * 0.15));
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = 0.3 + f * 1.6;
      if (this._windup <= 0) {
        this.model.scale.setScalar(0.48);
        this._fire(player);
        this._shotT = state.settings.easy ? 2.8 : A.ranged_lob_throw.gap;
      }
    } else if (d < this.senseRange(player, this.aggroRange) && d > 0.01) {
      this._shotT -= dt;
      if (d < this.holdRange) {
        this._play('walk');
        const sv = this._moveSolved(this.x - (dx / d) * 1.6 * dt, this.z - (dz / d) * 1.6 * dt);
        this.root.position.x = sv.x; this.root.position.z = sv.z;
      } else {
        this._play('idle');
      }
      if (this._shotT <= 0 && d > 2.5 && this.engaged !== false) this._windup = A.ranged_lob_throw.windup;
    } else {
      this._play('idle');
    }
    this.contact(player, 0.5);
    this._updateLobs(dt, player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Stormcaller — the fastest ranged tell in the roster: shortest windup, a
// straight fast bolt, and it holds ground rather than kiting (a caster, not
// a skirmisher). The speed is entirely in the CLOCK, never the windup floor.
export class RangedBolter extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 4, radius: 0.34, scale: 0.48, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', cast: 'Throw' },
    });
    applyRosterWeak(this, opts);
    this.state = 'kite';
    this.holdRange = opts.holdRange ?? 4.5;
    this.aggroRange = opts.aggroRange ?? 13;
    this._shotT = 0.9;
    this._windup = 0;
    this._bolts = [];
  }

  _fire(player) {
    const speed0 = state.settings.easy ? 7.0 : 9.5;
    const aim = this.interceptPoint(player, speed0, 1.0);
    const dx = aim.x - this.x, dz = aim.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xcfd6ff, emissiveIntensity: 2.6, roughness: 1 }));
    mesh.position.set(this.x, 0.95, this.z);
    this.world.add(mesh);
    this.world.keepLoose(mesh);
    this._bolts.push({ mesh, x: this.x, z: this.z, vx: (dx / d) * speed0, vz: (dz / d) * speed0, life: 1.8 });
    audio.play('parry', { volume: 0.3, rate: 2.1 });
  }

  _updateBolts(dt, player) {
    for (const b of this._bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.mesh.rotation.y += dt * 12;
      const s = this.world.resolveCircle(b.x, b.z, 0.1);
      const hitWall = Math.hypot(s.x - b.x, s.z - b.z) > 0.01;
      const pdx = player.root.position.x - b.x, pdz = player.root.position.z - b.z;
      const hitKael = pdx * pdx + pdz * pdz < 0.5 * 0.5;
      if (hitKael) player.hurt(1, { attacker: this, groundAttack: true });
      if (hitWall || hitKael || b.life <= 0) { b.life = 0; juice.burst(b.x, 0.7, b.z, 0xcfd6ff, 5); b.mesh.visible = false; }
      else b.mesh.position.set(b.x, 0.95, b.z);
    }
    this._bolts = this._bolts.filter((b) => b.life > 0 || b.mesh.visible);
  }

  update(dt, t, player) {
    if (this.dead) { this._updateBolts(dt, player); return; }
    if (this.stunUpdate(dt)) { this._updateBolts(dt, player); this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this.root.rotation.y = Math.atan2(dx, dz);

    if (this._windup > 0) {
      this._play('cast', 0.05);
      this._windup -= dt;
      const f = 1 - Math.max(0, this._windup) / A.ranged_bolt_shot.windup;
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = 0.4 + f * 2.0;
      if (this._windup <= 0) {
        this._fire(player);
        this._shotT = state.settings.easy ? 2.4 : A.ranged_bolt_shot.gap;
      }
    } else if (d < this.senseRange(player, this.aggroRange) && d > 0.01) {
      this._shotT -= dt;
      if (d < this.holdRange) {
        this._play('walk');
        const sv = this._moveSolved(this.x - (dx / d) * 1.4 * dt, this.z - (dz / d) * 1.4 * dt);
        this.root.position.x = sv.x; this.root.position.z = sv.z;
      } else {
        this._play('idle');
      }
      if (this._shotT <= 0 && d > 2 && this.engaged !== false) this._windup = A.ranged_bolt_shot.windup;
    } else {
      this._play('idle');
    }
    this.contact(player, 0.5);
    this._updateBolts(dt, player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Arc Knight — chase, telegraph, straight-line dash. Same grammar as the
// Skeleton Rogue's dash without the dodge gimmick: a clean, elite-scale
// charger (faster, harder-hitting, no side dodge to bait first).
export class DashStriker extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 7, radius: 0.4, scale: 0.52, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A', stab: 'Melee_1H_Attack_Stab' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.dashTimer = 1.6;
    if (opts.bladeGltf) this.mount('r', opts.bladeGltf);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this._play('walk');
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        const speed = this.pursueSpeed(2.0, d);
        const iv = this.interceptDir(player, d);
        this._play('run');
        this.chaseToward(dt, iv.x, iv.z, 1, speed);
      }
      this.dashTimer -= dt;
      if (this.dashTimer <= 0 && d < 5.2 && this.engaged !== false) {
        this.state = 'telegraph'; this.stateT = 0; this._play('idle', 0.08);
        const dd = Math.max(d, 0.01);
        this.dashDir = { x: dx / dd, z: dz / dd };
        this.root.rotation.y = Math.atan2(this.dashDir.x, this.dashDir.z);
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      this.model.scale.y = 0.52 * (1 - 0.2 * Math.min(1, this.stateT * 2.2));
      if (this.stateT >= A.dash_strike.windup) {
        this.state = 'dash'; this.stateT = 0; this.model.scale.y = 0.52;
        this._play('stab', 0.06, { once: true });
        audio.play('sword-swing2', { volume: 0.55, rate: 1.15 });
      }
    } else if (this.state === 'dash') {
      this.stateT += dt;
      const nx = this.x + this.dashDir.x * 8.4 * dt, nz = this.z + this.dashDir.z * 8.4 * dt;
      const solved = this._moveSolved(nx, nz);
      const blocked = Math.hypot(solved.x - nx, solved.z - nz) > 0.01;
      this.root.position.x = solved.x; this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > A.dash_strike.active || blocked) { this.state = 'recover'; this.stateT = 0; this._play('idle', 0.2); }
    } else { // recover
      this.stateT += dt;
      if (this.stateT > A.dash_strike.recover) { this.state = 'chase'; this.dashTimer = A.dash_strike.gap + Math.random() * 0.6; }
    }
    if (this.state === 'chase' || this.state === 'telegraph') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Visored Wight / Gilded Husk — the readable 1v1: turn-clamped advance,
// single windup, single swing, generous recovery. The "answer with
// shield/parry" teaching enemy, at mook rather than mini-boss scale.
export class Duellist extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 6, radius: 0.38, scale: 0.5, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', swing: 'Melee_1H_Attack_Chop' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.swingTimer = 1.8;
    if (opts.bladeGltf) this.mount('r', opts.bladeGltf);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        this.turnToward(dt, dx, dz, 2.4);
        const s = this._moveSolved(this.x + Math.sin(this.root.rotation.y) * 1.5 * dt, this.z + Math.cos(this.root.rotation.y) * 1.5 * dt);
        this.root.position.x = s.x; this.root.position.z = s.z;
      }
      this.swingTimer -= dt;
      if (d < 1.9 && this.swingTimer <= 0 && this.engaged !== false) {
        this.state = 'telegraph'; this.stateT = 0; this._play('idle', 0.1);
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      this.model.scale.y = 0.5 * (1 - 0.14 * Math.min(1, this.stateT * 2));
      if (this.stateT >= A.duellist_swing.windup) {
        this.state = 'swing'; this.stateT = 0; this.model.scale.y = 0.5;
        this._play('swing', 0.06, { once: true });
        audio.play('sword-swing', { volume: 0.6, rate: 1.0 });
        this._swingHit = false;
      }
    } else if (this.state === 'swing') {
      this.stateT += dt;
      if (this.stateT > A.duellist_swing.active * 0.4 && !this._swingHit) {
        this._swingHit = true;
        this._swingDamage(player, 100, 2.0, 1);
      }
      if (this.stateT > A.duellist_swing.active) { this.state = 'recover'; this.stateT = 0; }
    } else { // recover
      this.stateT += dt;
      if (this.stateT > A.duellist_swing.recover) { this.state = 'chase'; this.swingTimer = A.duellist_swing.gap; this._current = null; }
    }
    this.contact(player, 0.5);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Molten Marauder / Stone Colossus / Ashen Vanguard — the biggest single hit
// any mook throws. Slow turn, longest windup in the roster (1.1s), wide arc,
// long recovery: the reward for reading it is real, and getting around it
// is the whole lesson (LAW 2 — never a shorter tell, ever).
export class HeavySwinger extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 9, radius: 0.44, scale: 0.56, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', swing: 'Melee_2H_Attack_Chop' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.swingTimer = 2.0;
    if (opts.axeGltf) this.mount('r', opts.axeGltf);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        this.turnToward(dt, dx, dz, 1.5);
        const s = this._moveSolved(this.x + Math.sin(this.root.rotation.y) * 1.1 * dt, this.z + Math.cos(this.root.rotation.y) * 1.1 * dt);
        this.root.position.x = s.x; this.root.position.z = s.z;
      }
      this.swingTimer -= dt;
      if (d < 2.6 && this.swingTimer <= 0 && this.engaged !== false) {
        this.state = 'telegraph'; this.stateT = 0; this._play('idle', 0.1);
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      this.model.scale.y = 0.56 * (1 - 0.16 * Math.min(1, this.stateT / A.heavy_swing.windup));
      if (this.stateT >= A.heavy_swing.windup) {
        this.state = 'swing'; this.stateT = 0; this.model.scale.y = 0.56;
        this._play('swing', 0.06, { once: true });
        audio.play('slam', { volume: 0.6, rate: 0.9 });
        this._swingHit = false;
      }
    } else if (this.state === 'swing') {
      this.stateT += dt;
      if (this.stateT > A.heavy_swing.active * 0.5 && !this._swingHit) {
        this._swingHit = true;
        this._swingDamage(player, 150, 2.6, 1.5);
      }
      if (this.stateT > A.heavy_swing.active) { this.state = 'recover'; this.stateT = 0; }
    } else { // recover
      this.stateT += dt;
      if (this.stateT > A.heavy_swing.recover) { this.state = 'chase'; this.swingTimer = A.heavy_swing.gap; this._current = null; }
    }
    this.contact(player, 0.5);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Hollow Sentinel / Glacier Warden — the shield-wall, transplanted onto the
// new roster's own bodies. Same law as the Skeleton Shieldling: `shieldUp`
// is the ONE getter both the guard pose and takeDamage's frontal-block read,
// so the two can never drift apart (LAW 7).
export class ShieldAdvancer extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 7, radius: 0.4, scale: 0.5, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', swing: 'Melee_1H_Attack_Chop' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.swingTimer = 2.0;
    if (opts.shieldGltf) this.mount('l', opts.shieldGltf);
    if (opts.bladeGltf) this.mount('r', opts.bladeGltf);
    this._setupGuard(anims, 'Melee_Blocking');
  }

  get shieldUp() { return this.state === 'chase' && this.stunned <= 0; }

  takeDamage(n, element, kind) {
    if (!this.dead && this.shieldUp && this._pp) {
      const dx = this._pp.x - this.x, dz = this._pp.z - this.z;
      const dd = Math.hypot(dx, dz);
      const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
      if (dd > 0.05 && (dx * fx + dz * fz) / dd > 0.35) {
        audio.play('parry', { volume: 0.45, rate: 0.6 });
        this._pop = 0.1;
        if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.2, this.z, 'BLOCKED');
        return;
      }
    }
    super.takeDamage(n, element, kind);
  }

  update(dt, t, player) {
    if (this.dead) return;
    this._pp = { x: player.root.position.x, z: player.root.position.z };
    this._guard(this.shieldUp, dt);
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      this._play('walk', 0.2);
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        this.turnToward(dt, dx, dz, 2.0);
        const s = this._moveSolved(this.x + Math.sin(this.root.rotation.y) * 1.0 * dt, this.z + Math.cos(this.root.rotation.y) * 1.0 * dt);
        this.root.position.x = s.x; this.root.position.z = s.z;
      }
      this.swingTimer -= dt;
      if (d < 1.9 && this.swingTimer <= 0 && this.engaged !== false) {
        this.state = 'swing'; this.stateT = 0; this._play('swing', 0.1, { once: true });
        audio.play('bones', { volume: 0.5, rate: 1.0 });
        this._swingHit = false;
      }
    } else if (this.state === 'swing') {
      this.stateT += dt;
      if (this.stateT > A.shieldadvancer_swing.windup && this.stateT < A.shieldadvancer_swing.windup + A.shieldadvancer_swing.active && !this._swingHit) {
        this._swingHit = true;
        this._swingDamage(player, 90, 1.6, 1);
      }
      if (this.stateT > A.shieldadvancer_swing.windup + A.shieldadvancer_swing.active + A.shieldadvancer_swing.recover) {
        this.state = 'chase'; this.swingTimer = A.shieldadvancer_swing.gap; this._current = null;
      }
    }
    this.contact(player, 0.5);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Shade Knight — the Village's shadow duel. Same readable swing loop as the
// Duellist, but MIRRORS: struck with the same element twice in a row while
// under a third of its health, it shrugs the second hit off (the existing
// resist pipeline — 0.4x + the grey RESIST callout, takeDamage() already
// does this for free once `.resist` is set). The lesson: keep switching.
export class MirrorKael extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 7, radius: 0.4, scale: 0.5, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', swing: 'Melee_1H_Attack_Slice_Horizontal' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.swingTimer = 1.8;
    this._lastElement = null;
    if (opts.bladeGltf) this.mount('r', opts.bladeGltf);
  }

  takeDamage(n, element, kind) {
    if (!this.dead) {
      this.resist = (this.hp < this.maxHp / 3 && this._lastElement === element) ? element : null;
      this._lastElement = element;
    }
    super.takeDamage(n, element, kind);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        this.turnToward(dt, dx, dz, 2.6);
        const s = this._moveSolved(this.x + Math.sin(this.root.rotation.y) * 1.6 * dt, this.z + Math.cos(this.root.rotation.y) * 1.6 * dt);
        this.root.position.x = s.x; this.root.position.z = s.z;
      }
      this.swingTimer -= dt;
      if (d < 1.9 && this.swingTimer <= 0 && this.engaged !== false) {
        this.state = 'telegraph'; this.stateT = 0; this._play('idle', 0.1);
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      this.model.scale.y = 0.5 * (1 - 0.14 * Math.min(1, this.stateT * 2));
      if (this.stateT >= A.mirror_swing.windup) {
        this.state = 'swing'; this.stateT = 0; this.model.scale.y = 0.5;
        this._play('swing', 0.06, { once: true });
        this._swingHit = false;
      }
    } else if (this.state === 'swing') {
      this.stateT += dt;
      if (this.stateT > A.mirror_swing.active * 0.4 && !this._swingHit) {
        this._swingHit = true;
        this._swingDamage(player, 100, 2.0, 1);
      }
      if (this.stateT > A.mirror_swing.active) { this.state = 'recover'; this.stateT = 0; }
    } else { // recover
      this.stateT += dt;
      if (this.stateT > A.mirror_swing.recover) { this.state = 'chase'; this.swingTimer = A.mirror_swing.gap; this._current = null; }
    }
    this.contact(player, 0.5);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Twinblade Husk — ONE committed swing, two hits inside it (never an
// open-ended combo — bosses/mooks are never a grinder). The active window
// is wide enough to fit both without shrinking the windup.
export class Flurry extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 5, radius: 0.36, scale: 0.48, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A', swing: 'Melee_Dualwield_Attack_Slice' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.swingTimer = 1.5;
    if (opts.bladeGltf) this.mount('r', opts.bladeGltf);
    if (opts.bladeGltf) this.mount('l', opts.bladeGltf, 0.9);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this._play('walk');
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        const speed = this.pursueSpeed(2.2, d);
        const iv = this.interceptDir(player, d);
        this._play('run');
        this.chaseToward(dt, iv.x, iv.z, 1, speed);
      }
      this.swingTimer -= dt;
      if (d < 1.8 && this.swingTimer <= 0 && this.engaged !== false) {
        this.state = 'telegraph'; this.stateT = 0; this._play('idle', 0.08);
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      this.model.scale.y = 0.48 * (1 - 0.14 * Math.min(1, this.stateT * 2));
      if (this.stateT >= A.flurry_strikes.windup) {
        this.state = 'swing'; this.stateT = 0; this.model.scale.y = 0.48;
        this._play('swing', 0.05, { once: true });
        this._hit1 = false; this._hit2 = false;
      }
    } else if (this.state === 'swing') {
      this.stateT += dt;
      if (this.stateT > A.flurry_strikes.active * 0.25 && !this._hit1) { this._hit1 = true; this._swingDamage(player, 110, 1.7, 0.5); }
      if (this.stateT > A.flurry_strikes.active * 0.7 && !this._hit2) { this._hit2 = true; this._swingDamage(player, 110, 1.7, 0.5); }
      if (this.stateT > A.flurry_strikes.active) { this.state = 'recover'; this.stateT = 0; }
    } else { // recover — the long payoff for a two-hit swing
      this.stateT += dt;
      if (this.stateT > A.flurry_strikes.recover) { this.state = 'chase'; this.swingTimer = A.flurry_strikes.gap; this._current = null; }
    }
    this.contact(player, 0.5);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Bonelord — the roster's first Leader/buffer (a documented gap in the
// combat-context audit). Its OWN attack is a plain Duellist-shaped swing;
// on a long separate cooldown it RALLIES instead: a rising on-body glow
// (never a floor decal) that gives nearby non-elite allies a temporary
// gold aura (+speed, +contact damage) for a few seconds. Obeys the same
// token cap as any other attack, and it dies to the same taught answer as
// every other duelist in the roster — kill the commander, the buff ends.
export class Commander extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 10, radius: 0.42, scale: 0.54, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', swing: 'Melee_2H_Attack_Spin', rally: 'Melee_2H_Idle' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.swingTimer = 2.2;
    this.rallyTimer = 3.0; // first rally comes early enough to matter
    if (opts.axeGltf) this.mount('r', opts.axeGltf);
  }

  _rallyAllies() {
    for (const e of this.world.enemies) {
      if (e === this || e.dead || e.scenery || e.constructor.name === 'Hittable') continue;
      if (e.constructor.name === 'Commander') continue; // leaders don't buff each other
      const dx = e.x - this.x, dz = e.z - this.z;
      if (dx * dx + dz * dz > 5 * 5) continue;
      e._rallyT = 4.5;
      e._rallySpeedBonus = 1.3;
    }
    juice.burst(this.x, 1.1, this.z, 0xffd76a, 10);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.4) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        this.turnToward(dt, dx, dz, 1.6);
        const s = this._moveSolved(this.x + Math.sin(this.root.rotation.y) * 1.15 * dt, this.z + Math.cos(this.root.rotation.y) * 1.15 * dt);
        this.root.position.x = s.x; this.root.position.z = s.z;
      }
      this.swingTimer -= dt;
      this.rallyTimer -= dt;
      if (this.rallyTimer <= 0 && this.engaged !== false) {
        this.state = 'rally'; this.stateT = 0; this._play('rally', 0.15);
      } else if (d < 2.6 && this.swingTimer <= 0 && this.engaged !== false) {
        this.state = 'telegraph'; this.stateT = 0; this._play('idle', 0.1);
      }
    } else if (this.state === 'rally') {
      // rising glow ON THE BODY — no ground ring (LAW 4)
      this.stateT += dt;
      const f = Math.min(1, this.stateT / A.commander_rally.windup);
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = f * 1.8;
      if (this.stateT >= A.commander_rally.windup) {
        this._rallyAllies();
        this.state = 'recover'; this.stateT = 0; this._justRallied = true;
        this.rallyTimer = A.commander_rally.gap;
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      this.model.scale.y = 0.54 * (1 - 0.15 * Math.min(1, this.stateT / A.commander_swing.windup));
      if (this.stateT >= A.commander_swing.windup) {
        this.state = 'swing'; this.stateT = 0; this.model.scale.y = 0.54;
        this._play('swing', 0.06, { once: true });
        this._swingHit = false;
      }
    } else if (this.state === 'swing') {
      this.stateT += dt;
      if (this.stateT > A.commander_swing.active * 0.5 && !this._swingHit) {
        this._swingHit = true;
        this._swingDamage(player, 130, 2.2, 1);
      }
      if (this.stateT > A.commander_swing.active) { this.state = 'recover'; this.stateT = 0; this._justRallied = false; }
    } else { // recover — the rally leaves swingTimer running untouched (it
      // never stopped counting), a swing resets it for the next cycle
      this.stateT += dt;
      if (this.stateT > (this._justRallied ? A.commander_rally.recover : A.commander_swing.recover)) {
        this.state = 'chase'; this._current = null;
        if (!this._justRallied) this.swingTimer = A.commander_swing.gap;
        this._justRallied = false;
      }
    }
    this.contact(player, 0.5);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Tower Wight — Stoneroot's landmark: slow, huge, one attack. A pared-down
// Bone Warden (turn-clamped advance, one long telegraph, one AOE stomp) —
// no shield, no "tired" cycle, no ground decal (that's the sanctioned boss
// exception; this is a mook, LAW 4 applies): the tell is entirely on the
// body — a deep crouch and a rising dust cloud.
export class SlowStomper extends SkeletonBase {
  constructor(world, x, z, gltf, anims, opts = {}) {
    super(world, x, z, {
      hp: opts.hp ?? 14, radius: 0.5, scale: 0.62, gltf, anims,
      clips: { idle: 'Idle_A', walk: 'Walking_A', stomp: 'Melee_2H_Attack_Spin' },
    });
    applyRosterWeak(this, opts);
    this.state = 'chase';
    this.stompTimer = 2.4;
    this._scrapeAcc = 0;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'chase') {
      this._play('walk');
      if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.6) {
        this.holdOrbit(dt, dx, dz, d);
      } else if (d > 0.01) {
        this.turnToward(dt, dx, dz, 1.3);
        const s = this._moveSolved(this.x + Math.sin(this.root.rotation.y) * 0.95 * dt, this.z + Math.cos(this.root.rotation.y) * 0.95 * dt);
        this.root.position.x = s.x; this.root.position.z = s.z;
      }
      this.stompTimer -= dt;
      if (d < 2.4 && this.stompTimer <= 0 && this.engaged !== false) {
        this.state = 'telegraph'; this.stateT = 0; this._play('idle', 0.15);
      }
    } else if (this.state === 'telegraph') {
      this.stateT += dt;
      const f = Math.min(1, this.stateT / A.stomp_slam.windup);
      this.model.scale.y = 0.62 * (1 - 0.2 * f);
      this._scrapeAcc += dt;
      if (this._scrapeAcc > 0.2) { this._scrapeAcc = 0; juice.burst(this.x, 0.15, this.z, 0x9a8a70, 4); }
      if (this.stateT >= A.stomp_slam.windup) {
        this.state = 'stomp'; this.stateT = 0; this.model.scale.y = 0.62;
        this._play('stomp', 0.06, { once: true });
        audio.play('slam', { volume: 0.8, rate: 0.7 });
        this._stompHit = false;
      }
    } else if (this.state === 'stomp') {
      this.stateT += dt;
      if (this.stateT > A.stomp_slam.active * 0.5 && !this._stompHit) {
        this._stompHit = true;
        this._swingDamage(player, 360, 2.4, 1.5);
        juice.burst(this.x, 0.1, this.z, 0x9a8a70, 10);
      }
      if (this.stateT > A.stomp_slam.active) { this.state = 'recover'; this.stateT = 0; }
    } else { // recover
      this.stateT += dt;
      if (this.stateT > A.stomp_slam.recover) { this.state = 'chase'; this.stompTimer = A.stomp_slam.gap; this._current = null; }
    }
    if (this.state === 'chase') this.contact(player, 1);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Magma / Rime / Gloom / Toxin Slime — the genuinely new movement pattern
// the roster needed: a real leap-arc hop rather than the cave slime's
// sliding walk cycle. Rest → crouch-squash tell → airborne leap (Y arcs,
// XZ carries the burst) → land. Inherits the cave slime's split-on-death
// and contact damage for free.
export class Hopper extends Slime {
  constructor(world, x, z, gltf, opts = {}) {
    super(world, x, z, gltf);
    if (opts.weakness !== undefined) this.weakness = opts.weakness;
    if (opts.resist !== undefined) this.resist = opts.resist;
    if (opts.hp !== undefined) {
      const bonus = state.settings.easy ? 0 : CONFIG.DIFFICULTY.ENEMY_HP_BONUS;
      this.hp = this.maxHp = Math.round((opts.hp + bonus) * enemyScale() * 2) / 2;
    }
    this.splits = opts.splits ?? this.splits;
    this.state = 'rest';
    this.stateT = 0;
    this.restTimer = 0.5 + Math.random() * 0.4;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this.stateT += dt;

    if (this.state === 'rest') {
      this._play('idle');
      if (d < this.senseRange(player, this.aggroRange) && this.stateT > this.restTimer) {
        if (this.engaged === false && d < CONFIG.ENGAGE.HOLD_DIST + 1.2) {
          this.holdOrbit(dt, dx, dz, d);
        } else if (this.engaged !== false) {
          this.state = 'telegraph'; this.stateT = 0;
          const dd = Math.max(d, 0.01);
          this.hopDir = { x: dx / dd, z: dz / dd };
          this.root.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (this.state === 'telegraph') {
      this._play('idle');
      const f = Math.min(1, this.stateT / A.hop_leap.windup);
      this.model.scale.set(0.26 * (1 + f * 0.25), 0.26 * (1 - f * 0.3), 0.26 * (1 + f * 0.25)); // squash
      if (this.stateT >= A.hop_leap.windup) {
        this.state = 'charge'; this.stateT = 0;
        this._play('attack', 0.05, { once: true });
        this.model.scale.setScalar(0.26);
      }
    } else if (this.state === 'charge') {
      const f = Math.min(1, this.stateT / A.hop_leap.active);
      this.root.position.y = Math.sin(f * Math.PI) * 0.6;
      const nx = this.x + this.hopDir.x * 3.6 * dt, nz = this.z + this.hopDir.z * 3.6 * dt;
      const solved = this._moveSolved(nx, nz);
      this.root.position.x = solved.x; this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > A.hop_leap.active) {
        this.root.position.y = 0;
        this.state = 'recover'; this.stateT = 0;
        juice.burst(this.x, 0.1, this.z, this.puffTint || 0x7fc46a, 5);
      }
    } else { // recover
      this._play('idle');
      if (this.stateT > A.hop_leap.recover) { this.state = 'rest'; this.stateT = 0; this.restTimer = A.hop_leap.gap; }
    }
    if (this.state !== 'charge') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Ember / Frost / Shadow Dragonling — Dragon.glb (fully rigged: 5 clips,
// 2 skins, real bones), never wired to an enemy before. Same roost/hover/
// telegraph/dive/grounded/return grammar as the Cave Bat, at dragon scale,
// using the model's OWN Attack clip for the bite at the dive's damage frame
// instead of the bat's borrowed motion.
export class Dragonling extends Enemy {
  constructor(world, x, z, gltf, opts = {}) {
    super(world, x, z, { hp: opts.hp ?? 6, radius: 0.55 });
    if (opts.weakness !== undefined) this.weakness = opts.weakness;
    if (opts.resist !== undefined) this.resist = opts.resist;
    this.puffTint = opts.puffTint ?? 0x4a3f5c;
    this.flying = true;
    this.home = { x, z };
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    model.scale.setScalar(opts.scale ?? 0.5);
    if (opts.tint) {
      model.traverse((n) => {
        if (!n.isMesh) return;
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        n.material = mats.map((m) => { const c = m.clone(); opts.tint(c); return c; });
        if (n.material.length === 1) n.material = n.material[0];
      });
    }
    this.root.add(model);
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [k, n] of Object.entries({
      fly: 'DragonArmature|Dragon_Flying', bite: 'DragonArmature|Dragon_Attack',
    })) {
      const clip = gltf.animations.find((c) => c.name === n);
      if (clip) this.actions[k] = this.mixer.clipAction(clip);
    }
    this._current = null;
    if (this.actions.fly) { this.actions.fly.play(); this.actions.fly.timeScale = 0.35; }
    this._flashMats = [];
    this.registerFlashMats(this.root);
    this.state = 'hover'; // dragonlings never roost — always circling
    this.stateT = 0;
    this._floorT = 0;
    this.diveDir = { x: 0, z: 0 };
    this._seed = x * 2.3 + z;
    this.root.position.y = 2.0;

    // Dragon.glb's eyes are a SEPARATE skinned sub-rig (its own tiny
    // EyeArmature, not parented under the body's Head bone) — and none of
    // the model's 5 animation clips ever touch it, confirmed by reading the
    // .glb's own animation channel targets. Left alone they sit frozen at
    // their bind pose forever while the neck/head bends through Flying/
    // Attack, reading as two eyes floating in empty air above the dragon.
    // Locking them to the Head bone's live world position every frame is
    // the fix — no shared vendored asset touched, contained to this class.
    this._headBone = model.getObjectByName('Head');
    this._eyeRig = ['EyeArmature', 'Eyes'].map((n) => model.getObjectByName(n)).filter(Boolean);
    this._eyeOffset = new THREE.Vector3(0, 0.02, 0.06);
  }

  _syncEyes() {
    if (!this._headBone || !this._eyeRig.length) return;
    const headWorld = new THREE.Vector3();
    this._headBone.getWorldPosition(headWorld);
    for (const rig of this._eyeRig) {
      if (!rig.parent) continue;
      const local = rig.parent.worldToLocal(headWorld.clone());
      rig.position.copy(local).add(this._eyeOffset);
    }
  }

  _play(name) {
    if (this._current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset(); next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true; next.play();
    if (this._current && this.actions[this._current]) this.actions[this._current].crossFadeTo(next, 0.1, false);
    this._current = name;
  }

  // THE SHIELD IS THE ANSWER TO THE DIVE (dad's request, 2026-08-30): meet
  // the fly-at with a raised shield — a plain block, not only a perfect
  // parry — and the dragonling crashes out of the air onto the floor, dazed
  // and finally in sword's reach. Same grammar Boreal teaches at boss scale.
  _floor(dur) {
    if (this.dead || this.state === 'floored') return;
    this.state = 'floored';
    this.stateT = 0;
    this._floorT = dur;
    if (this.actions.fly) this.actions.fly.timeScale = 0;
    juice.burst(this.x, 0.5, this.z, this.puffTint, 10);
    audio.play('slam', { volume: 0.6, rate: 1.3 });
  }

  takeStun(sec) { this._floor(Math.max(2.2, sec)); }

  onBlocked() {
    if (this.state === 'dive') this._floor(2.4);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); this._syncEyes(); return; }
    this.stateT += dt;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'floored') {
      // downed: sinks to the floor, dim, harmless, and hittable
      this._floorT -= dt;
      this.root.position.y = Math.max(0.35, this.root.position.y - dt * 6);
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = 0.12;
      if (this._floorT <= 0) { this.state = 'return'; this.stateT = 0;
        if (this.actions.fly) this.actions.fly.timeScale = 1; }
      this.flashUpdate(dt);
      this.mixer.update(dt);
      this._syncEyes();
      return;
    }
    if (this.state === 'hover') {
      if (this.actions.fly) this.actions.fly.timeScale = 0.35;
      // Same fix as Bat/Moth (js/enemies.js): route through _moveSolved so a
      // hovering/diving/returning dragonling stops flying straight through
      // rocks, columns and dressed structures.
      const hs = this._moveSolved(
        this.x + (this.home.x + Math.sin(t * 0.7 + this._seed) * 1.3 - this.x) * dt * 0.6,
        this.z + (this.home.z + Math.cos(t * 0.55 + this._seed) * 1.3 - this.z) * dt * 0.6);
      this.root.position.x = hs.x; this.root.position.z = hs.z;
      this.root.position.y = 2.0 + Math.sin(t * 1.6 + this._seed) * 0.2;
      this.root.rotation.y = Math.atan2(dx, dz);
      const pv = player._vel ? Math.hypot(player._vel.x, player._vel.z) : 0;
      const trig = pv > 3.4 ? 9.5 : 5.6;
      if (d < trig && this.stateT > 1.1 && this.engaged !== false) { this.state = 'telegraph'; this.stateT = 0; }
    } else if (this.state === 'telegraph') {
      if (this.actions.fly) this.actions.fly.timeScale = 2.4;
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = 0.4 + (this.stateT / A.dragonling_dive.windup) * 2.0;
      this.root.rotation.y = Math.atan2(dx, dz);
      if (this.stateT >= A.dragonling_dive.windup) {
        this.state = 'dive'; this.stateT = 0;
        const ip = this.interceptPoint(player, 8.0, 1.0);
        const ix = ip.x - this.root.position.x, iz = ip.z - this.root.position.z;
        const idd = Math.hypot(ix, iz) || Math.max(d, 0.01);
        this.diveDir = { x: ix / idd, z: iz / idd };
        this._play('bite');
        audio.play('growl', { volume: 0.5, rate: 0.6 });
      }
    } else if (this.state === 'dive') {
      const speed = 8.0;
      const ds = this._moveSolved(this.x + this.diveDir.x * speed * dt, this.z + this.diveDir.z * speed * dt);
      this.root.position.x = ds.x; this.root.position.z = ds.z;
      this.root.position.y = Math.max(0.6, this.root.position.y - dt * 3.0);
      this.contact(player, 1, { ground: false });
      if (this.stateT > A.dragonling_dive.active) { this.state = 'return'; this.stateT = 0; }
    } else { // return to hover height/home
      if (this.actions.fly) this.actions.fly.timeScale = 1;
      for (const m of this._flashMats) if (m.emissive) m.emissiveIntensity = 0.4;
      const hx = this.home.x - this.x, hz = this.home.z - this.z;
      const hd = Math.hypot(hx, hz);
      this.root.position.y = Math.min(2.0, this.root.position.y + dt);
      if (hd < 0.4 && this.root.position.y >= 1.9) { this.state = 'hover'; this.stateT = 0; }
      else if (hd > 0.01) {
        const rs = this._moveSolved(this.x + (hx / hd) * 3.0 * dt, this.z + (hz / hd) * 3.0 * dt);
        this.root.position.x = rs.x; this.root.position.z = rs.z;
        this.root.rotation.y = Math.atan2(hx, hz);
      }
    }
    if (this.state === 'hover' || this.state === 'telegraph') this.contact(player, 1, { ground: false });
    this.flashUpdate(dt);
    this.mixer.update(dt);
    this._syncEyes();
  }
}

// ---------------------------------------------------------------------------
// Ember drops: warm sparks fallen shadows sometimes leave behind.
// Touch one to heal half a heart (fizzles after ~12s).
// ---------------------------------------------------------------------------

// A RANDOM WEAPON, SOMETIMES. Combat has never handed out gear at all —
// only the Den shop and chests ever have — despite nothing standing in the
// way: addGear() is a one-line push, and shopStock() already knows exactly
// which weapons/shields have unlocked at this point in the story (real-play
// report: "there are no random weapon drops"). A small, universal chance on
// every kill, roughly doubled for the "always drops something" elite tier
// (dropChance >= 1) — picks from what the shop would sell RIGHT NOW, so a
// drop can never hand a five-year-old the Boulder Hammer three rooms into
// the game, and never repeats gear already owned. Visible the same way a
// chest's reward now is (giveLoot(), js/main.js) — spawnRewardPop, not a
// silent inventory change.
function dropWeapon(e) {
  const base = e.dropChance !== undefined ? e.dropChance : 0.35;
  const chance = base >= 1 ? 0.08 : 0.03;
  if (Math.random() >= chance) return;
  const pool = shopStock().filter((s) => (s.kind === 'weapon' || s.kind === 'shield') && !ownsGear(s.id));
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  addGear(pick.id);
  const gd = (pick.kind === 'weapon' ? WEAPONS : SHIELDS)[pick.id];
  // the real item, never an emoji (dad's rule after the Round Guard 🟠)
  if (gd && gd.file) spawnGearDrop(e.world, e.x, e.z, gd);
}

function spawnEmberDrop(world, x, z) {
  if (!world.drops) world.drops = [];
  const spark = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14, 0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa04a, emissiveIntensity: 2.4, roughness: 1 })
  );
  spark.position.set(x, 0.35, z);
  world.add(spark);
  const glow = new THREE.PointLight(0xffa04a, 2.2, 4, 1.9);
  glow.position.set(x, 0.6, z);
  world.add(glow);
  world.drops.push({ x, z, spark, glow, life: 12, taken: false });
}

function updateDrops(world, dt, t, player) {
  if (!world.drops) return;
  for (const d of world.drops) {
    if (d.taken) continue;
    d.life -= dt;
    d.spark.position.y = 0.35 + Math.sin(t * 3.1 + d.x) * 0.09;
    d.spark.rotation.y = t * 2.4;
    if (d.life < 2.5) { // fizzle warning
      d.spark.visible = Math.sin(t * 14) > -0.3;
      d.glow.intensity = 1.1 + Math.sin(t * 14);
    }
    const dx = player.root.position.x - d.x;
    const dz = player.root.position.z - d.z;
    const gone = d.life <= 0;
    if (gone || dx * dx + dz * dz < 0.6 * 0.6) {
      d.taken = true;
      world.root.remove(d.spark);
      world.root.remove(d.glow);
      if (!gone) {
        audio.play('pup-chime', { volume: 0.45, rate: 1.7 });
        if (player.hearts < player.maxHearts) {
          player.hearts = Math.min(player.maxHearts, player.hearts + 0.5);
          if (player.onDamaged) player.onDamaged(player.hearts); // refresh HUD
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Spawning + the shared combat query used by sword arcs and the Blood Moon
// ---------------------------------------------------------------------------

// Solid bodies: creatures can't walk through each other, and a raised shield
// physically stops and bumps back grounded enemies. Flyers pass over walkers.
// Boss parts (Hittable) and breakables (already static colliders) stay out.
function resolveBodies(world, dt, player) {
  const solid = world.enemies.filter((e) =>
    !e.dead && e.radius && !e.scenery &&
    e.constructor.name !== 'Hittable' && e.constructor.name !== 'Breakable');

  // enemy vs enemy: split the overlap evenly
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (!!a.flying !== !!b.flying) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const rr = a.radius + b.radius;
      if (d >= rr || d < 1e-4) continue;
      const push = (rr - d) / 2;
      dx /= d; dz /= d;
      a.root.position.x -= dx * push; a.root.position.z -= dz * push;
      b.root.position.x += dx * push; b.root.position.z += dz * push;
    }
  }

  const px = player.root.position.x, pz = player.root.position.z;
  for (const e of solid) {
    // shove-in-progress from a shield bump
    if (e.bump > 0) {
      const s = world.resolveCircle(e.x + e.bumpDir.x * e.bump * dt, e.z + e.bumpDir.z * e.bump * dt, e.radius);
      e.root.position.x = s.x; e.root.position.z = s.z;
      e.bump -= dt * 10;
    }
    if (e.flying) continue; // flyers dive over both body and shield
    let dx = e.x - px, dz = e.z - pz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) continue;
    dx /= d; dz /= d;
    if (player.defending) {
      // the shield is a wall: stop at arm's length and take a firm shove back
      const rr = e.radius + 0.52;
      if (d < rr) {
        const s = world.resolveCircle(e.x + dx * (rr - d + 0.06), e.z + dz * (rr - d + 0.06), e.radius);
        e.root.position.x = s.x; e.root.position.z = s.z;
        if (!(e.bump > 0)) { e.bump = 4.2; e.bumpDir = { x: dx, z: dz }; }
      }
    } else {
      // bodies never fully merge — but stay inside contact range so touch
      // damage still lands (contact triggers at radius + 0.32)
      const rr = e.radius + 0.22;
      if (d < rr) {
        const s = world.resolveCircle(e.x + dx * (rr - d), e.z + dz * (rr - d), e.radius);
        e.root.position.x = s.x; e.root.position.z = s.z;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ROSTER (task #31) — one row per new enemy id, keyed exactly like the asset
// tool's own manifest.json. `weakness`/`resist` are the per-instance
// override this session settled on (regional law where one exists — "Wild
// Woods fears fire", "Shadow Court fears moon" — bone-family default
// otherwise); omit either to keep the class's own TRAITS default.
//
// KAYKIT_ROSTER ids load THEIR OWN generated body — the roster tool's baked
// recolor/part-swap output at assets/generated/enemies/<id>.glb — bound to
// the shared rig-medium clip library every skeleton already uses.
// MONSTER_ROSTER ids reuse a shared Quaternius base (Slime/Bat/Dragon.glb)
// with a runtime material tint, exactly like every other VARIANTS entry.
// ---------------------------------------------------------------------------

const KAYKIT_ROSTER = {
  'ember-wretch': { cls: SkeletonMinion, hp: 2 },
  'cinder-imp': { cls: SkeletonMinion, hp: 1 },
  'rime-minion': { cls: SkeletonMinion, hp: 3 },
  'molten-marauder': { cls: HeavySwinger, hp: 8, weakness: 'moon', mount: 'axe' },
  'hollow-sentinel': { cls: ShieldAdvancer, hp: 6, weakness: 'moon', mount: 'shield' },
  'shade-knight': { cls: MirrorKael, hp: 7, weakness: 'moon', mount: 'blade' },
  'maskbone': { cls: Flanker, hp: 3, weakness: 'moon', mount: 'blade' },
  'lurker': { cls: Stalker, hp: 4, weakness: 'moon' },
  'wraith-archer': { cls: RangedKiter, hp: 3, weakness: 'moon' },
  'glacier-warden': { cls: ShieldAdvancer, hp: 8, weakness: 'fire', mount: 'shield' },
  'visored-wight': { cls: Duellist, hp: 6, mount: 'blade' },
  'tower-wight': { cls: SlowStomper, hp: 14 },
  'stone-colossus': { cls: HeavySwinger, hp: 12, mount: 'axe' },
  'bonelord': { cls: Commander, hp: 10, mount: 'axe' },
  'rotcaster': { cls: RangedLobber, hp: 3, weakness: 'fire' },
  'thornstalker': { cls: RangedKiter, hp: 4, weakness: 'fire' },
  'quiverbones': { cls: RangedKiter, hp: 3, weakness: 'fire' },
  'stormcaller': { cls: RangedBolter, hp: 4 },
  'arc-knight': { cls: DashStriker, hp: 7, mount: 'blade' },
  'gilded-husk': { cls: Duellist, hp: 8, weakness: 'moon', mount: 'blade' },
  'emberfang': { cls: Flanker, hp: 3, weakness: 'moon', mount: 'blade' },
  'ashen-vanguard': { cls: HeavySwinger, hp: 9, mount: 'axe' },
  'twinblade-husk': { cls: Flurry, hp: 5, weakness: 'moon', mount: 'blade' },
};

const MONSTER_ROSTER = {
  'ember-dragonling': { cls: Dragonling, base: 'dragon', hp: 6, weakness: 'frost', scale: 0.5,
    tint: { Main: 0x8f2f10, Belly: 0xff9a2a, Claws: 0x2a1410, Wings: 0xc23c00, Eyes: 0xfff07a } },
  'frost-dragonling': { cls: Dragonling, base: 'dragon', hp: 6, weakness: 'fire', scale: 0.5,
    tint: { Main: 0x3e5c73, Belly: 0xcfe3ee, Claws: 0x1a2630, Wings: 0x7d97ad, Eyes: 0x9fe6ff } },
  'shadow-dragonling': { cls: Dragonling, base: 'dragon', hp: 7, weakness: 'moon', scale: 0.5,
    tint: { Main: 0x2f2440, Belly: 0x6f6383, Claws: 0x12101a, Wings: 0x3d2f4f, Eyes: 0xb45cff } },
  'cinder-bat': { cls: Moth, base: 'bat', hp: 1 }, // already the Ember Hollow flyer, no retint needed
  'frost-bat': { cls: Moth, base: 'bat', hp: 1, variant: 'frostmoth' },
  'magma-slime': { cls: Hopper, base: 'slime', hp: 2, weakness: ['tide', 'frost'], resist: 'fire',
    tint: { Body: 0xff6a1a, Eyes: 0x2a1410 } },
  'rime-slime': { cls: Hopper, base: 'slime', hp: 3,
    tint: { Body: 0x8fd0f0, Eyes: 0x1a2630 } },
  'gloom-slime': { cls: Hopper, base: 'slime', hp: 4, weakness: 'moon',
    tint: { Body: 0x5b4770, Eyes: 0xb45cff } },
  'toxin-slime': { cls: Hopper, base: 'slime', hp: 2,
    tint: { Body: 0x8fd63c, Eyes: 0x1c2419 } },
};

function makeMonsterTint(map) {
  return (m) => {
    if (map[m.name] === undefined) return;
    m.color && m.color.setHex(map[m.name]);
    if (m.name === 'Eyes') { // eyes read as a glow, matching every other VARIANTS entry
      m.emissive && m.emissive.setHex(map[m.name]);
      m.emissiveIntensity = 1.6;
    }
  };
}

export async function spawnEnemies(world) {
  world.enemies = [];
  const wolfGltf = await loadGLB('./assets/chars/wolf.gltf');

  if ((world.markers.shadeSpots || []).length) {
    const slimeGltf = await loadGLB('./assets/chars/monsters/Slime.glb');
    for (const s of world.markers.shadeSpots) {
      world.enemies.push(applyVariant(new Shade(world, s.x, s.z, slimeGltf), s.variant));
    }
  }
  if ((world.markers.mothSpots || []).length) {
    const batGltf = await loadGLB('./assets/chars/monsters/Bat.glb');
    for (const m of world.markers.mothSpots) {
      world.enemies.push(applyVariant(new Moth(world, m.x, m.z, batGltf), m.variant));
    }
  }
  if (world.markers.houndSpot) {
    world.enemies.push(applyVariant(
      new Hound(world, world.markers.houndSpot.x, world.markers.houndSpot.z, wolfGltf),
      world.markers.houndSpot.variant));
  }
  // packs of hounds (Wild Woods runs on them — v3.19)
  if ((world.markers.houndSpots || []).length) {
    for (const s of world.markers.houndSpots) {
      world.enemies.push(applyVariant(new Hound(world, s.x, s.z, wolfGltf), s.variant));
    }
  }

  // Cavern natives — Quaternius monsters, loaded only when a room asks
  const mk = world.markers;
  if (mk.slimeSpots && mk.slimeSpots.length) {
    const slimeGltf = await loadGLB('./assets/chars/monsters/Slime.glb');
    for (const s of mk.slimeSpots) {
      world.enemies.push(applyVariant(new Slime(world, s.x, s.z, slimeGltf), s.variant));
    }
  }
  // the ranged one — same GLB as the slime, scorched (see class Spitter)
  if (mk.spitterSpots && mk.spitterSpots.length) {
    const slimeGltf = await loadGLB('./assets/chars/monsters/Slime.glb');
    for (const s of mk.spitterSpots) {
      world.enemies.push(applyVariant(new Spitter(world, s.x, s.z, slimeGltf), s.variant));
    }
  }
  if (mk.batSpots && mk.batSpots.length) {
    const batGltf = await loadGLB('./assets/chars/monsters/Bat.glb');
    for (const s of mk.batSpots) {
      world.enemies.push(applyVariant(new Bat(world, s.x, s.z, batGltf), s.variant));
    }
  }
  // task #31 marker key for a roster id: 'ember-wretch' -> 'emberWretchSpots'
  const rosterKey = (id) => id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 'Spots';
  const rosterIds = Object.keys(KAYKIT_ROSTER).filter((id) => (mk[rosterKey(id)] || []).length);

  if ((mk.minionSpots && mk.minionSpots.length) || (mk.rogueSpots && mk.rogueSpots.length) ||
      (mk.shieldSpots && mk.shieldSpots.length) || mk.wardenSpot || rosterIds.length) {
    const [special, movement, general, combat] = await Promise.all([
      loadGLB('./assets/anims/rig-medium-special.glb'),
      loadGLB('./assets/anims/rig-medium-movement-basic.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
      loadGLB('./assets/anims/rig-medium-combat-melee.glb'),
    ]);
    const anims = [...special.animations, ...movement.animations, ...general.animations, ...combat.animations];
    if (mk.minionSpots && mk.minionSpots.length) {
      const minionGltf = await loadGLB('./assets/chars/skeletons/Skeleton_Minion.glb');
      for (const s of mk.minionSpots) {
        world.enemies.push(applyVariant(new SkeletonMinion(world, s.x, s.z, minionGltf, anims), s.variant));
      }
    }
    if (mk.rogueSpots && mk.rogueSpots.length) {
      const [rogueGltf, bladeGltf] = await Promise.all([
        loadGLB('./assets/chars/skeletons/Skeleton_Rogue.glb'),
        loadGLB('./assets/chars/skeletons/Skeleton_Blade.gltf'),
      ]);
      for (const s of mk.rogueSpots) world.enemies.push(new SkeletonRogue(world, s.x, s.z, rogueGltf, anims, bladeGltf));
    }
    if (mk.shieldSpots && mk.shieldSpots.length) {
      const [minGltf, shieldGltf, bladeGltf] = await Promise.all([
        loadGLB('./assets/chars/skeletons/Skeleton_Minion.glb'),
        loadGLB('./assets/chars/skeletons/Skeleton_Shield_Large_A.gltf'),
        loadGLB('./assets/chars/skeletons/Skeleton_Blade.gltf'),
      ]);
      for (const s of mk.shieldSpots) world.enemies.push(new SkeletonShield(world, s.x, s.z, minGltf, anims, shieldGltf, bladeGltf));
    }
    if (mk.wardenSpot) {
      const [warriorGltf, axeGltf, shieldGltf] = await Promise.all([
        loadGLB('./assets/chars/skeletons/Skeleton_Warrior.glb'),
        loadGLB('./assets/chars/skeletons/Skeleton_Axe.gltf'),
        loadGLB('./assets/chars/skeletons/Skeleton_Shield_Large_A.gltf'),
      ]);
      world.warden = new BoneWarden(world, mk.wardenSpot.x, mk.wardenSpot.z, warriorGltf, anims, axeGltf, shieldGltf);
      world.enemies.push(world.warden);
    }

    // task #31 — the 23 KayKit-family roster ids, each its own generated
    // body (assets/generated/enemies/<id>.glb) on the same shared rig
    if (rosterIds.length) {
      const needsProp = (kind) => rosterIds.some((id) => KAYKIT_ROSTER[id].mount === kind);
      const [bladeGltf, axeGltf2, shieldGltf2] = await Promise.all([
        needsProp('blade') ? loadGLB('./assets/chars/skeletons/Skeleton_Blade.gltf') : null,
        needsProp('axe') ? loadGLB('./assets/chars/skeletons/Skeleton_Axe.gltf') : null,
        needsProp('shield') ? loadGLB('./assets/chars/skeletons/Skeleton_Shield_Large_A.gltf') : null,
      ]);
      for (const id of rosterIds) {
        const cfg = KAYKIT_ROSTER[id];
        const bodyGltf = await loadGLB(`./assets/generated/enemies/${id}.glb`);
        const opts = { hp: cfg.hp, weakness: cfg.weakness, resist: cfg.resist };
        if (cfg.mount === 'blade') opts.bladeGltf = bladeGltf;
        if (cfg.mount === 'axe') opts.axeGltf = axeGltf2;
        if (cfg.mount === 'shield') { opts.shieldGltf = shieldGltf2; opts.bladeGltf = bladeGltf; }
        for (const s of mk[rosterKey(id)]) {
          const e = cfg.cls === SkeletonMinion
            ? new SkeletonMinion(world, s.x, s.z, bodyGltf, anims) // reuse as-is (swarm)
            : new cfg.cls(world, s.x, s.z, bodyGltf, anims, opts);
          if (cfg.cls === SkeletonMinion) { if (cfg.weakness !== undefined) e.weakness = cfg.weakness; if (cfg.resist !== undefined) e.resist = cfg.resist; }
          world.enemies.push(e);
        }
      }
    }
  }

  // task #31 — the 9 Quaternius-family roster ids, sharing the base
  // Slime/Bat/Dragon.glb with a runtime material tint (same idiom VARIANTS
  // already uses for every other reskin in the game)
  {
    const monsterIds = Object.keys(MONSTER_ROSTER).filter((id) => (mk[rosterKey(id)] || []).length);
    if (monsterIds.length) {
      const bases = [...new Set(monsterIds.map((id) => MONSTER_ROSTER[id].base))];
      const loaded = {};
      await Promise.all(bases.map(async (b) => {
        const path = b === 'dragon' ? './assets/chars/monsters/Dragon.glb'
          : b === 'bat' ? './assets/chars/monsters/Bat.glb' : './assets/chars/monsters/Slime.glb';
        loaded[b] = await loadGLB(path);
      }));
      for (const id of monsterIds) {
        const cfg = MONSTER_ROSTER[id];
        const gltf = loaded[cfg.base];
        for (const s of mk[rosterKey(id)]) {
          let e;
          if (cfg.cls === Dragonling) {
            e = new Dragonling(world, s.x, s.z, gltf, {
              hp: cfg.hp, weakness: cfg.weakness, resist: cfg.resist, scale: cfg.scale,
              tint: cfg.tint ? makeMonsterTint(cfg.tint) : undefined,
            });
          } else if (cfg.cls === Hopper) {
            e = new Hopper(world, s.x, s.z, gltf, { hp: cfg.hp, weakness: cfg.weakness, resist: cfg.resist });
            if (cfg.tint) {
              e.model.traverse((n) => {
                if (!n.isMesh) return;
                for (const m of (Array.isArray(n.material) ? n.material : [n.material])) makeMonsterTint(cfg.tint)(m);
              });
            }
          } else { // Moth reuse (cinder-bat / frost-bat)
            e = applyVariant(new Moth(world, s.x, s.z, gltf), cfg.variant);
            if (cfg.weakness !== undefined) e.weakness = cfg.weakness;
            if (cfg.resist !== undefined) e.resist = cfg.resist;
          }
          world.enemies.push(e);
        }
      }
    }
  }

  world.damageEnemiesAt = (x, z, r, dmg, element = 'steel') => {
    let hits = 0;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= (r + e.radius) * (r + e.radius)) {
        e.takeDamage(dmg, element, 'aoe');
        hits++;
      }
    }
    return hits;
  };

  world.updateEnemies = (dt, t, player) => {
    assignEngagement(world, player);
    for (const e of world.enemies) if (!e.dead) e.update(dt, t, player);
    resolveBodies(world, dt, player);
    updateDrops(world, dt, t, player);
  };
}

// ATTACK TOKENS (CONFIG.ENGAGE): the closest few foes get to press the
// attack; everyone else prowls the waiting ring (Enemy.holdOrbit). This is
// what turns "swarmed at the door" into readable, one-pattern-at-a-time
// combat — Gentle duels 1, Cozy 2, Brave 3. Boss parts and scenery are
// exempt (bosses run their own choreography).
function assignEngagement(world, player) {
  const M = CONFIG.ENGAGE;
  const max = state.settings.easy ? M.MAX_GENTLE : state.settings.brave ? M.MAX_BRAVE : M.MAX;
  const px = player.root.position.x, pz = player.root.position.z;
  const fighters = [];
  for (const e of world.enemies) {
    if (e.dead || e.scenery || !e.takeStun || !e.root) continue;
    const dx = e.x - px, dz = e.z - pz;
    e._engageD = dx * dx + dz * dz;
    fighters.push(e);
  }
  fighters.sort((a, b) => a._engageD - b._engageD);
  for (let i = 0; i < fighters.length; i++) {
    const e = fighters[i];
    // an attack in motion keeps its token — patterns never fizzle mid-swing.
    // 'rally' (Commander's cast) and 'stomp' (SlowStomper's AOE) were missing
    // (audit 2026-08-24) — every other new class's active-damage phase reuses
    // an already-covered name, but these two don't, so a closer enemy could
    // silently steal their token mid-cast/mid-AOE and free a slot while the
    // attack was still visibly happening.
    const committed = e.state === 'charge' || e.state === 'dive' || e.state === 'lunge' ||
      e.state === 'telegraph' || e.state === 'crouch' || e.state === 'dash' || e.state === 'swing' ||
      e.state === 'rally' || e.state === 'stomp';
    e.engaged = i < max || committed;
  }
}
