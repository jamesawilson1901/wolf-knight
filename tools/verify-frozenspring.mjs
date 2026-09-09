// THE FROZEN SPRING, WALKED. Wild Woods' second dungeon (design/WIDER-
// WORLD.md §2.3), from tools/verify-ashvault.mjs: is the door from `t1b`
// sealed before the spring shatters and open after (and still open on a
// rebuild), does `tf2` hold its fight, does clearing it set the dungeon
// milestone and pop the plug to `tf3` where the child is standing, and do
// the moved chest / the lost wolf / the gold chest / the loop-closing door
// to `f1b` all behave.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('FROZENSPRING');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// 0. THE DOOR IS SEALED BEFORE THE SPRING SHATTERS.
await wk.page.evaluate((f) => window.__wkJump('t1b', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 't1b' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
let t1bDoors = await wk.wk('doors');
check('t1b has NO door to tf1 before the spring shatters', !t1bDoors.some((d) => d.to === 'tf1'),
  t1bDoors.map((d) => d.to));

// shatter it directly — the shatter mechanic itself is covered elsewhere
await wk.page.evaluate(() => { window.__game.WS.set('wild3', 'ice_l3_spring_ice', true); });
await wk.page.evaluate((f) => window.__wkJump('t1b', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 't1b' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
t1bDoors = await wk.wk('doors');
check('t1b HAS a door to tf1 once shattered (open on rebuild)', t1bDoors.some((d) => d.to === 'tf1'),
  t1bDoors.map((d) => d.to));

// 1. tf1/tf2/tf3 all build, calls under the general dungeon ceiling
// (verify-level3's own §9 holds these to its tighter 100-call bar).
for (const room of ['tf1', 'tf2', 'tf3']) {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: FORMS });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
  const m = await wk.page.evaluate(() => {
    const g = window.__game;
    let meshes = 0;
    g.world.root.traverse((n) => { if (n.isMesh) meshes++; });
    return { meshes, calls: g.renderer.info.render.calls,
      enemies: (g.world.enemies || []).length,
      chests: (g.world.markers.chestDefs || []).length,
      doors: (g.world.doors || []).map((d) => d.to) };
  });
  // tf1/tf3 are simpler pockets than the Ash Vault's own (no crypt-kit
  // flourish) — tools/verify-density.mjs is the real authority on "is this
  // room furnished enough" and already holds all three to their floor; this
  // check only needs "not empty" and the shared draw-call ceiling.
  check(`${room} builds with content, calls < 125`, m.meshes > 10 && m.calls < 125, m);
}

// 2. tf1 — no fight, the moved chest, the lost wolf.
await wk.page.evaluate((f) => window.__wkJump('tf1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'tf1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const tf1 = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    hasLostWolf: !!g.world.updateLostWolf };
});
check('tf1 has no fight', tf1.hostiles === 0, tf1);
check('tf1 has doors to both t1b and tf2', tf1.doors.includes('t1b') && tf1.doors.includes('tf2'), tf1.doors);
check('tf1 spawns the lost-wolf update hook', tf1.hasLostWolf, tf1);

// walk up to the wolf and rescue it for real
await wk.walkTo(-6.5, 5, { timeout: 20, arrive: 1.0 });
await wk.page.waitForTimeout(300);
const rescued = await wk.page.evaluate(() => !!window.__game.state.flags.rescued.tf1_wolf);
check('walking up to the wolf writes state.flags.rescued.tf1_wolf', rescued);

// open the chest and confirm the moved id/loot survived the move
const chestOk = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'l3_t1b_ice');
  return !!c && c.loot && c.loot.shards === 22;
});
check('the moved chest keeps its id (l3_t1b_ice) and loot', chestOk);

// 3. tf2 — the fight, the plug, the milestone.
await wk.page.evaluate((f) => window.__wkJump('tf2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'tf2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const tf2before = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    dungeonDone: g.WS.get('wild', 'dungeon') };
});
check('tf2 holds 3 enemies (2 rime-minion + 1 frost-dragonling) and no door to tf3 yet',
  tf2before.hostiles === 3 && !tf2before.doors.includes('tf3') && !tf2before.dungeonDone, tf2before);

await wk.page.evaluate(() => {
  const g = window.__game;
  for (const e of g.world.enemies) { e.hp = 0; e.dead = true; }
});
await wk.page.waitForTimeout(500);
const tf2after = await wk.page.evaluate(() => {
  const g = window.__game;
  return { dungeonDone: g.WS.get('wild', 'dungeon'),
    doors: (g.world.doors || []).map((d) => d.to) };
});
check('clearing tf2 sets WS(wild,dungeon) and pops the plug to tf3',
  tf2after.dungeonDone && tf2after.doors.includes('tf3'), tf2after);

// 4. THE PROMISE — the ??? card resolves on the milestone, not the shatter.
const promiseResolvesOnDungeon = await wk.page.evaluate(() => window.__game.WS.get('wild', 'dungeon'));
check('the l3_spring promise condition (wild/dungeon) is now true', promiseResolvesOnDungeon);

// 5. tf3 — the gold chest, and the loop-closing door to f1b.
await wk.page.evaluate((f) => window.__wkJump('tf3', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'tf3' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const tf3 = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'tf3_banked');
  return { id: c && c.id, tier: c && c.tier, heartPiece: c && c.loot.heartPiece,
    gear: c && c.loot.gear, doors: (g.world.doors || []).map((d) => d.to) };
});
check('tf3 gold chest exists with a heart piece and spear_frost',
  !!tf3.id && tf3.heartPiece === 1 && tf3.gear === 'spear_frost', tf3);
check('tf3 has a door back to tf2', tf3.doors.includes('tf2'), tf3.doors);
check('tf3 has the loop-closing door to f1b', tf3.doors.includes('f1b'), tf3.doors);

// and the far side: f1b offers a door back to tf3, always (no gate)
await wk.page.evaluate((f) => window.__wkJump('f1b', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1b' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const f1bDoors = await wk.wk('doors');
check('f1b has a door to tf3', f1bDoors.some((d) => d.to === 'tf3'), f1bDoors.map((d) => d.to));

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Frozen Spring holds together');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
