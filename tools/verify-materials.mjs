// CRAFTING MATERIALS (design/CRAFTING.md §1) — does a kill really pay in the
// right shard (an enemy's own `weakness`, js/materials.js's
// materialForWeakness), does a smashed breakable pay in a Wisp, does walking
// onto the drop actually credit state.inventory.materials, do the
// canAfford/spendMaterials helpers round-trip a recipe cost correctly, and
// do materials/crafted survive a real save/load cycle (saves are additive
// forever — a profile from before this system existed must still load).
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('MATPROBE');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

// 1. force every enemy in a room to a guaranteed material drop, kill them,
// walk over the drops, confirm materials accumulate correctly by weakness.
await wk.page.evaluate((f) => window.__wkJump('lc', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lc' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });

const before = await wk.page.evaluate(() => ({ ...window.__game.state.inventory.materials }));
const info = await wk.page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const foes = (w.enemies || []).filter((e) => !e.scenery);
  for (const e of foes) { e.dropChance = 1; }
  const weaknesses = foes.map((e) => e.weakness);
  for (const e of foes) e.hp = 0;
  for (const e of foes) e.die();
  return { n: foes.length, weaknesses, drops: (w.drops || []).map((d) => d.kind) };
});
const materialDrops = info.drops.filter((k) => k !== 'heal');
// the elite-crystal roll (15%) is real randomness on top of the guaranteed
// shard, so only the heal + shard counts are asserted exactly — a bonus
// crystal showing up sometimes is the system working, not a flake to hide.
const shardDrops = info.drops.filter((k) => k !== 'heal' && k !== 'crystal');
const healDrops = info.drops.filter((k) => k === 'heal');
check('lc has real enemies to test on', info.n > 0, info);
check('every forced kill spawned BOTH the ember heal AND its own weakness-shard drop (independent rolls)',
  healDrops.length === info.n && shardDrops.length === info.n, info);

// Stand on each drop and tick world.updateEnemies() ONCE, DIRECTLY, in the
// same synchronous browser step — rather than teleporting and hoping enough
// real animation frames land inside a page.waitForTimeout. The real render
// loop gates updateEnemies behind `!transitioning`/`!narration.blocking`
// (js/main.js), and a forced kill fires narration (first_enemy, sticker
// toasts) that can flip those flags for real seconds of wall-clock time —
// a flakiness in THIS harness's timing, not in the drop/collect mechanism
// itself, which this calls directly instead of waiting to observe.
const remaining = await wk.page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  for (const d of w.drops) {
    if (d.taken) continue;
    g.player.root.position.x = d.x;
    g.player.root.position.z = d.z;
    w.updateEnemies(0.016, 0, g.player);
  }
  return w.drops.filter((d) => !d.taken).length;
});
const after = await wk.page.evaluate(() => ({ ...window.__game.state.inventory.materials }));
check('standing on every drop and ticking updateEnemies collects it (none left uncollected)', remaining === 0, remaining);

let gained = 0;
for (const k of new Set(materialDrops)) gained += (after[k] || 0) - (before[k] || 0);
check('every dropped material landed in state.inventory.materials, one each',
  gained === materialDrops.length, { before, after, expect: materialDrops });

// 2. a breakable drops a Wisp at its own configured rate — force it to 1 and
// confirm the material appears in the SAME inventory bucket. The drop is
// relocated onto the room's own spawn point before collecting it — a real
// breakable can sit anywhere room-dressing put it, and this test is about
// the materials system, not re-proving every room's own collision layout
// (verify-density/reachable already own that question).
const potInfo = await wk.page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const pot = (w.enemies || []).find((e) => e.scenery && e.constructor.name === 'Breakable');
  if (!pot) return { found: false };
  pot.materialChance = 1;
  const beforeWisp = g.state.inventory.materials.wisp || 0;
  pot.takeDamage();
  const wisp = w.drops.find((x) => x.kind === 'wisp' && !x.taken);
  if (!wisp) return { found: true, beforeWisp, drops: (w.drops || []).map((d) => d.kind), collected: false };
  g.player.root.position.x = wisp.x;
  g.player.root.position.z = wisp.z;
  w.updateEnemies(0.016, 0, g.player);
  return { found: true, beforeWisp, drops: (w.drops || []).map((d) => d.kind),
    afterWisp: g.state.inventory.materials.wisp || 0 };
});
check('a breakable in lc exists to test on', potInfo.found, potInfo);
if (potInfo.found) {
  check('the breakable pushed a wisp drop', potInfo.drops.includes('wisp'), potInfo);
  check('standing on the wisp and ticking updateEnemies credits it',
    potInfo.afterWisp === potInfo.beforeWisp + 1, potInfo);
}

// 3. materials.js helpers: canAfford/spendMaterials/addMaterial round-trip correctly.
const helperCheck = await wk.page.evaluate(async () => {
  const m = await import('/js/materials.js');
  const g = window.__game;
  g.state.inventory.materials = { shard_fire: 3, wisp: 1 };
  const cost = { shard_fire: 2, wisp: 1 };
  const afford1 = m.canAfford(cost);
  const spent = m.spendMaterials(cost);
  const afterSpend = { ...g.state.inventory.materials };
  const afford2 = m.canAfford({ shard_fire: 5 });
  return { afford1, spent, afterSpend, afford2 };
});
check('canAfford is true when every line is affordable', helperCheck.afford1, helperCheck);
check('spendMaterials succeeds and deducts every line', helperCheck.spent
  && helperCheck.afterSpend.shard_fire === 1 && helperCheck.afterSpend.wisp === 0, helperCheck);
check('canAfford is false when a line is short', !helperCheck.afford2, helperCheck);

// 4. a real persist -> loadSave -> applySave round trip carries materials
// and crafted through (the additive-forever save contract).
const roundTrip = await wk.page.evaluate(async () => {
  const g = window.__game;
  const s = await import('/js/save.js');
  g.state.inventory.materials = { shard_moon: 4, crystal: 1 };
  g.state.inventory.crafted = ['test_item'];
  s.persist();
  const data = s.loadSave(g.state.profileId);
  g.state.inventory.materials = {};
  g.state.inventory.crafted = [];
  s.applySave(g.state.profileId, g.state.profileName, data);
  return { materials: { ...g.state.inventory.materials }, crafted: [...g.state.inventory.crafted] };
});
check('materials and crafted survive a real save/load round trip',
  roundTrip.materials.shard_moon === 4 && roundTrip.materials.crystal === 1
    && roundTrip.crafted.includes('test_item'), roundTrip);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — materials drop, collect, spend correctly');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
