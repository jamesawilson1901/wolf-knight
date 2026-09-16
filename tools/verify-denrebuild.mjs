// THE DEN REBUILT (design/DEN-REBUILD.md) — canRestore is false without
// materials and true with them, restore() actually spends materials and
// flips the restored flag, the forward-ratchet elapsed-time math pays out
// correctly and never twice for the same stretch of time, cap enforcement
// holds even against a manufactured huge elapsed time, collect() dispenses
// the right material/xp, and the new room ('dr') really exists and is
// reachable through a real door from 'den'. Elapsed time is simulated by
// directly rewriting the stored WS timestamp INTO THE PAST inside one
// synchronous page.evaluate() — this session's own established lesson
// (design/MINING.md's and design/CRAFTING.md's own verify sections): the
// real render loop's !transitioning/!narration.blocking gates can add real
// wall-clock delay for reasons unrelated to the mechanic under test, so
// nothing here ever waits on real time passing.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('DENREBUILDPROBE');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

await wk.page.evaluate(() => window.__wkJump('den', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'den' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });

// 1. canRestore is false with no materials, true once they're granted.
const afford = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game;
  g.state.inventory.materials = {};
  const before = d.canRestore('forge');
  g.state.inventory.materials = { ore: 99, wood: 99 };
  const after = d.canRestore('forge');
  return { before, after };
});
check('canRestore(forge) is false with no materials', afford.before === false, afford);
check('canRestore(forge) is true once the cost is affordable', afford.after === true, afford);

// 2. restore() spends materials and flips the flag — but not twice.
const restored = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game;
  g.state.inventory.materials = { ore: 20, wood: 20 };
  const wasRestored = d.isRestored('forge');
  const before = { ...g.state.inventory.materials };
  const ok = d.restore('forge');
  const after = { ...g.state.inventory.materials };
  const isRestoredNow = d.isRestored('forge');
  // a second restore() on an already-restored building must refuse and
  // spend nothing more
  const secondOk = d.restore('forge');
  const afterSecond = { ...g.state.inventory.materials };
  return { wasRestored, ok, before, after, isRestoredNow, secondOk, afterSecond };
});
check('the forge starts un-restored', restored.wasRestored === false, restored);
check('restore() succeeds and actually spends the ore/wood cost',
  restored.ok === true && restored.after.ore === restored.before.ore - 15
    && restored.after.wood === restored.before.wood - 3, restored);
check('restore() flips isRestored true', restored.isRestoredNow === true, restored);
check('restoring an already-restored building refuses and spends nothing further',
  restored.secondOk === false
    && restored.afterSecond.ore === restored.after.ore
    && restored.afterSecond.wood === restored.after.wood, restored);

// 3. the forward-ratchet timer: no time passed -> nothing pending; rewrite
// the stored baseline INTO THE PAST to fake elapsed time, deterministically.
const timer = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game;
  g.state.inventory.materials = { ore: 20, wood: 20 };
  g.state.flags.world = g.state.flags.world || {};
  g.state.flags.world.den = {}; // a clean slate for this check
  d.restore('forge');
  const immediate = d.pendingCollections('forge');
  // rewrite the baseline this module itself wrote, one interval + a bit back
  const INTERVAL = 20 * 60 * 1000;
  g.state.flags.world.den.bld_forge_since = Date.now() - Math.floor(INTERVAL * 1.5);
  const afterOneInterval = d.pendingCollections('forge');
  return { immediate, afterOneInterval };
});
check('a freshly restored building has nothing pending yet (no time has passed)',
  timer.immediate === 0, timer);
check('rewinding the stored baseline by 1.5 intervals makes exactly 1 collection pending',
  timer.afterOneInterval === 1, timer);

// 4. collect() pays out the right material and does NOT double-pay when
// called twice in a row with no further time passed.
const paid = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game;
  const beforeIngot = g.state.inventory.materials.ingot || 0;
  const first = d.collect('forge');
  const afterFirst = g.state.inventory.materials.ingot || 0;
  const second = d.collect('forge'); // no time passed since the first collect
  const afterSecond = g.state.inventory.materials.ingot || 0;
  return { beforeIngot, first, afterFirst, second, afterSecond };
});
check('collect() pays exactly 1 collection worth (2 ingot) of the forge\'s own material',
  paid.first.count === 1 && paid.afterFirst === paid.beforeIngot + 2, paid);
check('calling collect() again immediately pays nothing (no time has passed)',
  paid.second.count === 0 && paid.afterSecond === paid.afterFirst, paid);

// 5. cap enforcement — manufacturing a huge elapsed time never pays out more
// than `cap` collections in one visit, even though the underlying elapsed
// interval count is far larger.
const capped = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game;
  g.state.inventory.materials = { ore: 20, wood: 20 };
  g.state.flags.world.den = {}; // clean slate again
  d.restore('forge');
  const INTERVAL = 20 * 60 * 1000;
  // 100 intervals' worth of real time, rewritten directly — no waiting
  g.state.flags.world.den.bld_forge_since = Date.now() - INTERVAL * 100;
  const pending = d.pendingCollections('forge');
  const beforeIngot = g.state.inventory.materials.ingot || 0;
  const r = d.collect('forge');
  const afterIngot = g.state.inventory.materials.ingot || 0;
  // and it does not keep paying out further collections beyond the cap
  const r2 = d.collect('forge');
  return { pending, r, afterIngot, beforeIngot, r2 };
});
check('a huge elapsed time never shows more than `cap` (3) collections pending',
  capped.pending === 3, capped);
check('collect() pays exactly cap collections worth, not the full 100 intervals',
  capped.r.count === 3 && capped.afterIngot === capped.beforeIngot + 6, capped);
check('a further collect() right after pays nothing more (the backlog was fully drained)',
  capped.r2.count === 0, capped);

// 6. a clock rewound BACKWARDS (into the future then reset) can never pay
// out a collection twice — total-collected floors at 0, never negative.
const clockSafe = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game;
  g.state.inventory.materials = { ore: 20, wood: 20 };
  g.state.flags.world.den = {};
  d.restore('forge');
  const INTERVAL = 20 * 60 * 1000;
  g.state.flags.world.den.bld_forge_since = Date.now() - INTERVAL * 2;
  const beforeIngot = g.state.inventory.materials.ingot || 0;
  const first = d.collect('forge'); // pays 2
  const afterFirst = g.state.inventory.materials.ingot || 0;
  // now wind the baseline itself FORWARD (as if a device clock jumped back
  // and the room rebuilt) — collected already reflects 2 real intervals, so
  // pending must clamp to 0, never go negative or re-pay
  g.state.flags.world.den.bld_forge_since = Date.now() + 999999;
  const pendingAfterClockJump = d.pendingCollections('forge');
  const second = d.collect('forge');
  const afterSecond = g.state.inventory.materials.ingot || 0;
  return { beforeIngot, first, afterFirst, pendingAfterClockJump, second, afterSecond };
});
check('a normal 2-interval collect pays 2 collections worth', clockSafe.first.count === 2, clockSafe);
check('an adverse baseline never reports negative pending (clamped to 0)',
  clockSafe.pendingAfterClockJump === 0, clockSafe);
check('collect() after an adverse clock jump pays nothing further',
  clockSafe.second.count === 0 && clockSafe.afterSecond === clockSafe.afterFirst, clockSafe);

// 7. xp payout (the pup pen) actually grants xp through the real system.
const xpPaid = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game;
  g.state.flags.pups = { test_pup: true }; // "at least one pup home"
  g.state.flags.world = g.state.flags.world || {};
  g.state.flags.world.den = { ...(g.state.flags.world.den || {}) };
  delete g.state.flags.world.den.bld_pupPen_since;
  delete g.state.flags.world.den.bld_pupPen_collected;
  const wasRestored = d.isRestored('pupPen');
  const immediate = d.pendingCollections('pupPen');
  const INTERVAL = 20 * 60 * 1000;
  d.pendingCollections('pupPen'); // establishes the lazy baseline
  g.state.flags.world.den.bld_pupPen_since = Date.now() - Math.floor(INTERVAL * 1.2);
  const beforeXp = g.state.xp;
  const r = d.collect('pupPen');
  const afterXp = g.state.xp;
  return { wasRestored, immediate, r, beforeXp, afterXp };
});
check('the pup pen counts as restored once any pup is home (no spend needed)',
  xpPaid.wasRestored === true, xpPaid);
check('the pup pen grants real xp through collect()',
  xpPaid.r.count === 1 && xpPaid.afterXp === xpPaid.beforeXp + 4, xpPaid);

// 8. the new room really exists and is reachable through a real door from
// 'den' — an actual room jump both ways, not inference from source.
await wk.page.evaluate(() => window.__wkJump('den', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'den' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const hasDoor = await wk.page.evaluate(() => {
  const w = window.__game.world;
  return (w.doors || []).some((d) => d.to === 'dr');
});
check("the den room really has a door to 'dr'", hasDoor, hasDoor);

await wk.page.evaluate(() => window.__wkJump('dr', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'dr' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const inDr = await wk.page.evaluate(() => ({
  room: window.__wk.room,
  hasDoorBack: (window.__game.world.doors || []).some((d) => d.to === 'den'),
  buildingCount: (window.__game.world.updateDenBuildings ? 1 : 0),
}));
check("jumping to 'dr' really builds it (window.__wk.room === 'dr')", inDr.room === 'dr', inDr);
check("'dr' has a real door back to 'den'", inDr.hasDoorBack, inDr);
check("'dr' wired its own walk-into trigger (world.updateDenBuildings)", inDr.buildingCount === 1, inDr);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Den rebuild spends, pays, ratchets forward-only, caps correctly, and the room is really reachable');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
