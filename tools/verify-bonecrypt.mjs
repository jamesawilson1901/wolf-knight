// THE BONE CRYPT, WALKED. The Sunken Vale's own pocket dungeon (design/
// WIDER-WORLD.md §2.3), from tools/verify-drownedhold.mjs: is the door off
// d1a's own east wall sealed before the ice shatters and open after, does
// d1d hold its fight AND its own named guardian (the Bone Sage — the first
// MINI_ROSTER guardian on RangedBolter rather than BoneWarden), does
// defeating her set the dungeon milestone and pop the plug to d1e where the
// child is standing, and does the lost wolf / the gold chest behave. Unlike
// the Hold (Storm's OWN wolf, gained at the region's own end) this one needs
// the Frost Wolf — old news by region 6, and still opening new rooms.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('BONECRYPT');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// 0. THE DOOR IS SEALED BEFORE THE ICE SHATTERS.
await wk.page.evaluate((f) => window.__wkJump('d1a', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'd1a' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
let d1aDoors = await wk.wk('doors');
check('d1a has NO door to d1c before the crypt ice shatters', !d1aDoors.some((d) => d.to === 'd1c'), d1aDoors.map((d) => d.to));

await wk.page.evaluate(() => { window.__game.WS.set('vale', 'ice_d1a_crypt', true); });
await wk.page.evaluate((f) => window.__wkJump('d1a', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'd1a' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
d1aDoors = await wk.wk('doors');
check('d1a HAS a door to d1c once the ice is shattered (open on rebuild)', d1aDoors.some((d) => d.to === 'd1c'), d1aDoors.map((d) => d.to));

// 1. d1c/d1d/d1e all build, calls under budget.
for (const room of ['d1c', 'd1d', 'd1e']) {
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

// 2. d1c — no fight, the lost wolf.
await wk.page.evaluate((f) => window.__wkJump('d1c', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'd1c' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const d1c = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    hasLostWolf: !!g.world.updateLostWolf };
});
check('d1c has no fight', d1c.hostiles === 0, d1c);
check('d1c has doors to both d1a and d1d', d1c.doors.includes('d1a') && d1c.doors.includes('d1d'), d1c.doors);
check('d1c spawns the lost-wolf update hook', d1c.hasLostWolf, d1c);

await wk.walkTo(-6, -4, { timeout: 20, arrive: 1.0 });
await wk.page.waitForTimeout(300);
const rescued = await wk.page.evaluate(() => !!window.__game.state.flags.rescued.d1c_wolf);
check('walking up to the wolf writes state.flags.rescued.d1c_wolf', rescued);

// 3. d1d — the fight, the guardian, the plug, the milestone.
await wk.page.evaluate((f) => window.__wkJump('d1d', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'd1d' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const d1dBefore = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    hasMini: !!g.world.miniBoss,
    miniClass: g.world.miniBoss && g.world.miniBoss.constructor.name,
    miniWeakness: g.world.miniBoss && g.world.miniBoss.weakness,
    doors: (g.world.doors || []).map((d) => d.to),
    dungeonDone: g.WS.get('vale', 'dungeon') };
});
check('d1d holds 2 drowned minions + the Bone Sage (on RangedBolter), no door to d1e yet',
  d1dBefore.hostiles === 3 && d1dBefore.hasMini && d1dBefore.miniClass === 'RangedBolter'
    && d1dBefore.miniWeakness === 'fire' && !d1dBefore.doors.includes('d1e') && !d1dBefore.dungeonDone, d1dBefore);

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
const d1dAfter = await wk.page.evaluate(() => {
  const g = window.__game;
  return { sageDown: g.WS.get('vale', 'mini_bone_sage'),
    dungeonDone: g.WS.get('vale', 'dungeon'),
    doors: (g.world.doors || []).map((d) => d.to) };
});
const formsAfter = await wk.wk('forms');
check('killing the Bone Sage sets WS(vale,mini_bone_sage) and WS(vale,dungeon), pops the plug to d1e',
  d1dAfter.sageDown && d1dAfter.dungeonDone && d1dAfter.doors.includes('d1e'), d1dAfter);
check('no wolf form is granted by the guardian (it is not a region boss)',
  formsAfter.length === formsBefore.length && formsAfter.every((f) => formsBefore.includes(f)),
  { formsBefore, formsAfter });

// re-entering d1d does not respawn a second Bone Sage
await wk.page.evaluate((f) => window.__wkJump('d1c', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'd1c' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate((f) => window.__wkJump('d1d', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'd1d' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const d1dRebuilt = await wk.page.evaluate(() => !!window.__game.world.miniBoss);
check('the Bone Sage does not respawn once defeated (persists via WS)', !d1dRebuilt);

// 4. d1e — the gold chest, reachable now the plug is gone.
await wk.page.evaluate((f) => window.__wkJump('d1e', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'd1e' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const d1e = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'd1e_crypt');
  return { id: c && c.id, tier: c && c.tier, heartPiece: c && c.loot.heartPiece,
    gear: c && c.loot.gear, seed: c && c.loot.seed, doors: (g.world.doors || []).map((d) => d.to) };
});
check('d1e gold chest exists with a heart piece, a gear id and its own seed',
  !!d1e.id && d1e.heartPiece === 1 && d1e.gear === 'halberd' && d1e.seed === 'vale', d1e);
check('d1e has a door back to d1d', d1e.doors.includes('d1d'), d1e.doors);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Bone Crypt holds together');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
