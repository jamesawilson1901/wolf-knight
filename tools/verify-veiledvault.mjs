// THE VEILED VAULT, WALKED. The Shadow Court's own pocket dungeon (design/
// WIDER-WORLD.md §2.3 court row, the last of the seven), from
// tools/verify-bonecrypt.mjs: is the door off x1's own east wall sealed
// before the ice shatters and open after, does xc2 hold its fight AND its
// own named guardian (the Chancellor — the first MINI_ROSTER guardian on
// Duellist rather than BoneWarden or RangedBolter), does defeating her set
// the dungeon milestone and pop the plug to xc3 where the child is standing,
// and does the lost wolf / the gold chest behave. Needs the Frost Wolf — old
// news by region 4, and still opening new rooms in the last region.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('VEILPROBE');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// 0. x1 has no door to xc1 before the ice shatters.
await wk.page.evaluate((f) => window.__wkJump('x1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'x1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
let x1Doors = await wk.wk('doors');
check('x1 has NO door to xc1 before the vault ice shatters', !x1Doors.some((d) => d.to === 'xc1'), x1Doors.map((d) => d.to));

await wk.page.evaluate(() => { window.__game.WS.set('court', 'ice_x1_vault', true); });
await wk.page.evaluate((f) => window.__wkJump('x1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'x1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
x1Doors = await wk.wk('doors');
check('x1 HAS a door to xc1 once the ice is shattered', x1Doors.some((d) => d.to === 'xc1'), x1Doors.map((d) => d.to));

// 1. xc1/xc2/xc3 build, calls under budget.
for (const room of ['xc1', 'xc2', 'xc3']) {
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
  check(`${room} builds with content, calls < 125`, m.meshes > 15 && m.calls < 125, m);
}

// 2. xc1 — no fight, the lost wolf.
await wk.page.evaluate((f) => window.__wkJump('xc1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'xc1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const xc1 = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    hasLostWolf: !!g.world.updateLostWolf };
});
check('xc1 has no fight', xc1.hostiles === 0, xc1);
check('xc1 has doors to both x1 and xc2', xc1.doors.includes('x1') && xc1.doors.includes('xc2'), xc1.doors);
check('xc1 spawns the lost-wolf update hook', xc1.hasLostWolf, xc1);

await wk.walkTo(-6, -4, { timeout: 20, arrive: 1.0 });
await wk.page.waitForTimeout(300);
const rescued = await wk.page.evaluate(() => !!window.__game.state.flags.rescued.xc1_wolf);
check('walking up to the wolf writes state.flags.rescued.xc1_wolf', rescued);

// 3. xc2 — the fight, the guardian, the plug, the milestone.
await wk.page.evaluate((f) => window.__wkJump('xc2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'xc2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const xc2Before = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    hasMini: !!g.world.miniBoss,
    miniClass: g.world.miniBoss && g.world.miniBoss.constructor.name,
    miniWeakness: g.world.miniBoss && g.world.miniBoss.weakness,
    doors: (g.world.doors || []).map((d) => d.to),
    dungeonDone: g.WS.get('court', 'dungeon') };
});
check('xc2 holds 2 shadow hounds + the Chancellor (on Duellist), no door to xc3 yet',
  xc2Before.hostiles === 3 && xc2Before.hasMini && xc2Before.miniClass === 'Duellist'
    && xc2Before.miniWeakness === 'moon' && !xc2Before.doors.includes('xc3') && !xc2Before.dungeonDone, xc2Before);

const formsBefore = await wk.wk('forms');
await wk.page.evaluate(() => {
  const g = window.__game;
  for (const e of g.world.enemies) {
    if (e === g.world.miniBoss) continue;
    e.hp = 0; e.dead = true;
  }
  if (g.world.miniBoss && !g.world.miniBoss.dead) g.world.miniBoss.die();
});
await wk.page.waitForTimeout(500);
const xc2After = await wk.page.evaluate(() => {
  const g = window.__game;
  return { chancellorDown: g.WS.get('court', 'mini_court_chancellor'),
    dungeonDone: g.WS.get('court', 'dungeon'),
    doors: (g.world.doors || []).map((d) => d.to) };
});
const formsAfter = await wk.wk('forms');
check('killing the Chancellor sets WS(court,mini_court_chancellor) and WS(court,dungeon), pops the plug to xc3',
  xc2After.chancellorDown && xc2After.dungeonDone && xc2After.doors.includes('xc3'), xc2After);
check('no wolf form is granted by the guardian (it is not a region boss)',
  formsAfter.length === formsBefore.length && formsAfter.every((f) => formsBefore.includes(f)),
  { formsBefore, formsAfter });

// re-entering xc2 does not respawn a second Chancellor
await wk.page.evaluate((f) => window.__wkJump('xc1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'xc1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate((f) => window.__wkJump('xc2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'xc2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const xc2Rebuilt = await wk.page.evaluate(() => !!window.__game.world.miniBoss);
check('the Chancellor does not respawn once defeated (persists via WS)', !xc2Rebuilt);

// 4. xc3 — the gold chest, reachable now the plug is gone.
await wk.page.evaluate((f) => window.__wkJump('xc3', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'xc3' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const xc3 = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'xc3_veil');
  return { id: c && c.id, tier: c && c.tier, heartPiece: c && c.loot.heartPiece,
    gear: c && c.loot.gear, seed: c && c.loot.seed, doors: (g.world.doors || []).map((d) => d.to) };
});
check('xc3 gold chest exists with a heart piece, a gear id and its own seed',
  !!xc3.id && xc3.heartPiece === 1 && xc3.gear === 'staff_moon' && xc3.seed === 'court', xc3);
check('xc3 has a door back to xc2', xc3.doors.includes('xc2'), xc3.doors);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Veiled Vault holds together');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
