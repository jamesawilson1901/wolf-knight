// CRAFTING MATERIALS (design/CRAFTING.md §1) — what enemies, pots, crates and
// chests drop besides shards/potions/gear, so there is something to craft
// FROM. Deliberately reuses the game's own seven-element vocabulary rather
// than inventing a parallel taxonomy; which shard an enemy pays is
// materialForEnemy() below — what it is made of, never what beats it.
import * as THREE from 'three';
import { state, regionOf } from './state.js';
import { bumpCounter } from './progress.js';

export const MATERIALS = {
  shard_fire:    { name: 'Ember Shard', icon: '🔥', color: 0xff6a2a },
  shard_earth:   { name: 'Stone Shard', icon: '🪨', color: 0xd8b06a },
  shard_verdant: { name: 'Thorn Shard', icon: '🌿', color: 0x7ad46a },
  shard_frost:   { name: 'Rime Shard', icon: '❄️', color: 0x8fd8ff },
  shard_storm:   { name: 'Storm Shard', icon: '🌩️', color: 0xc8b4ff },
  shard_tide:    { name: 'Tide Shard', icon: '🌊', color: 0x4fd0d8 },
  shard_moon:    { name: 'Moon Shard', icon: '🌙', color: 0xbfa8ff },
  // No weakness (rare) and every ordinary pot/crate/chest: breakables carry
  // no element of their own, so they pay in the one material that isn't one.
  wisp:          { name: 'Shadow Wisp', icon: '💨', color: 0x8a7fa8 },
  // Universal and rare — elites/guardians and gold chests only. The one
  // material every "ultimate" recipe needs a stack of, regardless of element.
  crystal:       { name: "Wolf's Crystal", icon: '💎', color: 0xeaf6ff },
  // MINING & WOODCUTTING (design/MINING.md) — the two gathered resources,
  // from a rock or a tree rather than a kill or a breakable. Both feed the
  // SAME materials pool/bucket as everything above, not a parallel one.
  ore:           { name: 'Ore', icon: '⛏️', color: 0xb0a89a },
  wood:          { name: 'Timber', icon: '🪵', color: 0xa07a4a },
  // THE DEN REBUILT (design/DEN-REBUILD.md) — the Forge's own payout, once
  // restored: smelted ore, a step up from raw ore the same way a crafted
  // recipe is a step up from a raw shard. Feeds the SAME bucket as
  // everything above (canAfford/spendMaterials work with it for free).
  ingot:         { name: 'Ingot', icon: '🔩', color: 0xc9c9d4 },
};

// AN ENEMY DROPS WHAT IT IS MADE OF. Dad: "Fire enemies are dropping tide
// shards when they should drop whatever element they are. Things that they
// drop need to have some logic to them."
//
// This used to pay in the enemy's `weakness` — what BEATS it, which is
// almost never what it IS: the fire-spitter (`resist: 'fire'`, `weakness:
// ['tide','frost']`) paid Tide Shards, a Frostpeak rime-hound (fears fire)
// paid Ember Shards, a skeleton paid Ember Shards because fire is what
// breaks bone. The rule now, in the order a child would reason it out:
//   1. `element` — what it visibly is, tagged on regional variants whose
//      theme is unambiguous (js/enemies.js VARIANTS / roster).
//   2. `resist` — "shrugs off fire" because it is made of fire.
//   3. the element of the PLACE it lives: bats in the Stoneroot caverns are
//      stone-touched, soldiers in the Sunken Vale are waterlogged. Every one
//      of the seven shards has a home region, so no recipe loses its source.
//   4. a Shadow Wisp — the roads, the Village, the Spire: nowhere with an
//      element of its own, so the one material that isn't one.
const REGION_ELEMENT = {
  ember_hollow: 'fire', stoneroot: 'earth', wildwoods: 'verdant', frostpeak: 'frost',
  stormreach: 'storm', sunkenvale: 'tide', shadowcourt: 'moon',
};

export function materialForEnemy(e) {
  // some enemies list two (`['tide','frost']`); the first is the one its
  // own combat text leads with
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const room = e.world && e.world.roomId;
  const own = first(e.element) || first(e.resist) || (room && REGION_ELEMENT[regionOf(room)]);
  const id = 'shard_' + own;
  return MATERIALS[id] ? id : 'wisp';
}

export function materialCount(id) {
  return state.inventory.materials[id] || 0;
}

export function addMaterial(id, n = 1) {
  if (!MATERIALS[id]) return;
  state.inventory.materials[id] = materialCount(id) + n;
  bumpCounter('materialsFound');
}

// `cost` is `{ materialId: count }`. Returns true only if EVERY line is
// affordable — never spends a partial recipe.
export function canAfford(cost) {
  return Object.entries(cost).every(([id, n]) => materialCount(id) >= n);
}

export function spendMaterials(cost) {
  if (!canAfford(cost)) return false;
  for (const [id, n] of Object.entries(cost)) state.inventory.materials[id] -= n;
  return true;
}

// The pickup itself — a floating gem in the enemy-kill ember drop's own
// shape, pushed onto `world.drops` so js/enemies.js's own updateDrops (run
// every frame off world.updateEnemies, which every room sets up whether it
// has enemies or not — js/rooms.js calls spawnEnemies() unconditionally)
// animates, fizzles and collects it exactly the same way. Kept HERE rather
// than duplicated in js/enemies.js and js/loot.js so both can drop a
// material without importing from each other (they already import from one
// another and a third leg would cycle).
export function spawnMaterialDrop(world, x, z, materialId) {
  const def = MATERIALS[materialId];
  if (!def) return;
  if (!world.drops) world.drops = [];
  const spark = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14, 0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: def.color, emissiveIntensity: 2.4, roughness: 1 })
  );
  spark.position.set(x, 0.35, z);
  world.add(spark);
  const glow = new THREE.PointLight(def.color, 2.2, 4, 1.9);
  glow.position.set(x, 0.6, z);
  world.add(glow);
  world.drops.push({ x, z, spark, glow, life: 12, taken: false, kind: materialId });
}
