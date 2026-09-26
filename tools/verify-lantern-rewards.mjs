// LIT LAMPS PAY. Dad, 2026-09-26: "lighting these lanterns does nothing" (the
// Kiln's Gutter Run, ld) and "there is no indication what the correct order
// is" (the Order Hall, ld1). Both rooms had braziers and nothing wired to them.
//
// This plays both through the SAME call the Fire Wolf's slam makes
// (world.igniteAt), then walks into the cage and onto the chest:
//   ld1 — each lamp shows 1-4 floor dots; a wrong lamp snuffs them all; 1→4
//         lifts the cage bars; the chest opens; a rebuild comes back solved.
//   ld  — three lamps burn down on a clock; all three at once lifts the bars;
//         the chest opens; they stay lit on a rebuild.
import { launch } from './wk-drive.mjs';
const errs = [];
const check = (name, ok, info) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`);
  if (!ok) errs.push(name);
};
const wk = await launch({ timescale: 1 });
await wk.newGame('LAMPS');
async function goto(room) {
  await wk.page.evaluate((r) => window.__wkJump(r, ['knight', 'fire_wolf']), room);
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; window.__game.narration.blocking = false; });
}
const ignite = (id) => wk.page.evaluate((id) => {
  const w = window.__game.world;
  const b = w.braziers.find((q) => q.id === id);
  w.igniteAt(b.x, b.z, 0.5);
  return w.braziers.filter((q) => /^ld1_order|^ld_gutter/.test(q.id)).map((q) => [q.id, q.lit]);
}, id);
// A Pip line freezes play while it speaks (narration.blocking); tap-to-skip
// it the way a child taps the caption, so walking resumes.
const hush = () => wk.page.evaluate(() => {
  const n = window.__game.narration;
  for (let i = 0; i < 6 && n.speaking; i++) n.skip();
});
const barsAt = (x, z) => wk.page.evaluate(({ x, z }) => window.__game.world.boxColliders
  .some((c) => x >= c.minX - 0.05 && x <= c.maxX + 0.05 && z >= c.minZ - 0.05 && z <= c.maxZ + 0.05), { x, z });

// ---- ld1 — THE ORDER HALL --------------------------------------------------
await goto('ld1');
const dots = await wk.page.evaluate(() => {
  let n = 0;
  window.__game.world.root.traverse((o) => { if (o.isMesh && o.geometry.type === 'CircleGeometry'
    && o.material.color && o.material.color.getHex() === 0xffd76a) n++; });
  return n;
});
check('ld1: the order is written on the floor — 1+2+3+4 = 10 gold dots', dots === 10, { dots });
check('ld1: the cage mouth is barred before the puzzle', await barsAt(8.3 - 1.35, 0), {});
let lit = await ignite('ld1_order2');
check('ld1: lighting lamp 2 first snuffs everything (wrong order resets)',
  lit.every(([, l]) => !l), lit);
await ignite('ld1_order1'); await ignite('ld1_order2'); await ignite('ld1_order3');
lit = await ignite('ld1_order4');
check('ld1: 1→2→3→4 leaves all four burning', lit.every(([, l]) => l), lit);
const flag = await wk.page.evaluate(() => !!window.__game.state.flags.plates.l1_ld1_order);
check('ld1: the solve is saved (plates.l1_ld1_order)', flag, {});
check('ld1: the cage mouth is open', !(await barsAt(8.3 - 1.35, 0)), {});
await hush();
await wk.walkTo(6.2, 0, { timeout: 60, arrive: 0.5 });
console.log('  walk', JSON.stringify(await wk.walkTo(8.3, 0, { timeout: 45, arrive: 0.3 })));
console.log('  state', JSON.stringify(await wk.page.evaluate(() => ({ p: [window.__game.player.root.position.x, window.__game.player.root.position.z],
  chests: (window.__game.world.chests || []).map((c) => [c.id, c.x, c.z, c.opened]), gates: window.__wk.gates }))));
await wk.page.waitForTimeout(1500);
const c1 = await wk.page.evaluate(() => !!window.__game.state.flags.chests.l1_ld1_order_chest);
check('ld1: walked into the cage and the chest opened', c1, {});
await goto('ld');
await goto('ld1');
const back1 = await wk.page.evaluate(() => ({
  lit: window.__game.world.braziers.filter((q) => /^ld1_order/.test(q.id)).every((q) => q.lit),
}));
check('ld1: a rebuild comes back solved — lamps burning', back1.lit, back1);
check('ld1: ...and no bars on the cage mouth', !(await barsAt(8.3 - 1.35, 0)), {});

// ---- ld — THE GUTTER RUN ---------------------------------------------------
await goto('ld');
const g0 = await wk.page.evaluate(() => window.__game.world.braziers
  .filter((q) => /^ld_gutter/.test(q.id)).map((q) => ({ id: q.id, x: q.x, z: q.z, gutter: q.gutterAfter })));
check('ld: three gutter lamps, each on a burn-down clock', g0.length === 3 && g0.every((q) => q.gutter > 0), g0);
const spread = Math.min(...g0.flatMap((a) => g0.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z))));
check('ld: no one slam (3.0u) can reach two lamps', spread > 3.0, { spread });
check('ld: the cage mouth is barred before the run', await barsAt(9.5, 11.3 - 1.35), {});
await ignite('ld_gutter1');
// let lamp 1 burn out (gutterAfter), driving the room's own animate loop
const burnt = await wk.page.evaluate(() => {
  const w = window.__game.world;
  const b = w.braziers.find((q) => q.id === 'ld_gutter1');
  for (let i = 0; i < 200 && b.lit; i++) for (const f of w._animateHooks || []) f(i * 0.1, 0.1);
  return { lit: b.lit, hasAnim: (w._animateHooks || []).length };
});
check('ld: a lamp left alone burns out', burnt.lit === false || burnt.hasAnim === 0, burnt);
await ignite('ld_gutter1'); await ignite('ld_gutter2'); lit = await ignite('ld_gutter3');
check('ld: all three burning at once', lit.filter(([id]) => /ld_gutter/.test(id)).every(([, l]) => l), lit);
check('ld: the run is saved (plates.l1_ld_gutter)',
  await wk.page.evaluate(() => !!window.__game.state.flags.plates.l1_ld_gutter), {});
check('ld: the cage mouth is open', !(await barsAt(9.5, 11.3 - 1.35)), {});
await hush();
// into the channel by its open north mouth, the way a child walks it
console.log('  g0', JSON.stringify(await wk.walkTo(0.5, 0.5, { timeout: 60, arrive: 0.8 })));
console.log('  g1', JSON.stringify(await wk.walkTo(9.5, 0.2, { timeout: 60, arrive: 0.6 })));
console.log('  g2', JSON.stringify(await wk.walkTo(9.5, 9.0, { timeout: 60, arrive: 0.5 })));
console.log('  g3', JSON.stringify(await wk.walkTo(9.5, 11.3, { timeout: 45, arrive: 0.3 })));
await wk.page.waitForTimeout(1500);
check('ld: walked into the cage and the chest opened',
  await wk.page.evaluate(() => !!window.__game.state.flags.chests.l1_ld_gutter_chest), {});

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — both Kiln brazier rooms read, reset, pay out and rebuild solved');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
