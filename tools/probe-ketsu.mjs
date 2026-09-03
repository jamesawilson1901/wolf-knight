// THE KETSU, PUSHED FOR REAL (lc1, js/level1.js).
//
// The corridor was widened so the block a child parks on the plate no longer
// seals the vault behind it (verify-chests, 2026-09-03). Widening a corridor
// is exactly the kind of change that breaks the push it was built around, so
// this drives the whole beat on real keys: north leg, corner, west leg, plate,
// bars, and then WALKS ROUND the parked block to the chest and checks the bag.
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
const wk = await launch({ timescale: 1 });
await wk.newGame('KETSU');
await wk.page.evaluate(() => window.__wkJump('lc1', ['knight', 'dark_wolf', 'fire_wolf']));
await wk.page.waitForFunction(() => window.__wk.room === 'lc1' && !window.__wk.gates.transitioning,
  null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; window.__game.narration.blocking = false; });

const block = () => wk.page.evaluate(() => {
  const b = (window.__game.world.boulders || [])[0];
  return b ? { x: +b.x.toFixed(2), z: +b.z.toFixed(2) } : null;
});
const bars = () => wk.page.evaluate(() => !!window.__game.state.flags.plates.l1_lc1_ketsu);
const pos = () => wk.wk('pos');

check('the block starts where the room puts it', JSON.stringify(await block()) === JSON.stringify({ x: 7, z: -2.6 }), await block());

// A PUSH IS A LOOP, NOT A LEAN. World.updateBoulders snaps the shove to the
// DOMINANT axis of (boulder - player), so a child a hand's width off the lane
// pushes the block sideways instead of forward — which is what a 22-second
// hold on one key does the moment the walk drifts. Re-align before every step.
const push = async (key, ax, stop, maxSteps = 14) => {
  for (let i = 0; i < maxSteps; i++) {
    const b = await block();
    if (await stop(b)) return b;
    // stand a stride BEHIND the block on the axis being pushed
    const at = ax === 'z' ? { x: b.x, z: b.z + 1.7 } : { x: b.x + 1.7, z: b.z };
    await wk.walkTo(at.x, at.z, { timeout: 25, arrive: 0.35 });
    await wk.page.keyboard.down(key);
    await wk.page.waitForTimeout(1400);          // lean 0.12s + a 1.2u step at 2.4u/s
    await wk.page.keyboard.up(key);
    await wk.page.waitForTimeout(200);
  }
  return block();
};

// --- the north leg: push until the room's own shell stops the block
const afterNorth = await push('w', 'z', (b) => b.z < -6.2);
check('the north leg runs the block up to the shell', afterNorth.z < -6.2,
  { block: afterNorth, me: await pos() });

// --- the corner, then the west leg onto the plate
const afterWest = await push('a', 'x', async () => bars());
check('the west leg lands the block on the plate and the bars go up',
  await bars(), { block: afterWest, me: await pos() });

// --- AND ROUND IT. The whole point of the widened corridor.
await wk.walkTo(3.0, -5.2, { timeout: 30, arrive: 0.8 });
await wk.walkTo(0.9, -5.4, { timeout: 30, arrive: 0.8 });
await wk.walkTo(0.2, -6.8, { timeout: 30, arrive: 0.7 });
await wk.page.waitForTimeout(1500);
const got = await wk.page.evaluate(() => ({
  opened: !!window.__game.state.flags.chests.l1_lc1_ketsu,
  potions: window.__game.state.potions }));
check('the child walks ROUND the parked block and opens the vault', got.opened,
  { ...got, me: await pos(), block: await block() });

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the ketsu is pushed, and the prize is not behind the answer');
process.exit(errors.length ? 1 : 0);
