// THE DROWNED HOLD, WALKED. Stormreach's own pocket dungeon (design/
// WIDER-WORLD.md §2.3/§2.6), from tools/verify-sunkenhearth.mjs: is the door
// off s1a's own north wall sealed before the child can wade and open (and
// still open) once they can, does s1d hold its fight AND its own named
// guardian (the Ash Warden), does defeating the guardian set the dungeon
// milestone and pop the plug to s1e where the child is standing, and does
// the lost wolf / the gold chest behave. Unlike the Hearth (open from
// region 1 on the Fire Wolf, the FIRST wolf a child owns) this one needs
// Tide — Stormreach's OWN wolf, granted at the region's own end — so it is
// the one dungeon in the game reached only by walking back into a region
// already cleared.
import { launch } from './wk-drive.mjs';

const FORMS_NO_TIDE = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf'];
const FORMS = [...FORMS_NO_TIDE, 'tide_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('DROWNEDHOLD');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// 0. THE DOOR IS SEALED BEFORE THE CHILD CAN WADE.
await wk.page.evaluate((f) => window.__wkJump('s1a', f), FORMS_NO_TIDE);
await wk.page.waitForFunction(() => window.__wk.room === 's1a' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
let s1aDoors = await wk.wk('doors');
check('s1a has NO door to s1c before tide_wolf', !s1aDoors.some((d) => d.to === 's1c'), s1aDoors.map((d) => d.to));

await wk.page.evaluate((f) => window.__wkJump('s1a', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 's1a' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
s1aDoors = await wk.wk('doors');
check('s1a HAS a door to s1c once tide_wolf is unlocked (open on rebuild)', s1aDoors.some((d) => d.to === 's1c'), s1aDoors.map((d) => d.to));

// 1. s1c/s1d/s1e all build, calls under budget.
for (const room of ['s1c', 's1d', 's1e']) {
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

// 2. s1c — no fight, the lost wolf.
await wk.page.evaluate((f) => window.__wkJump('s1c', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 's1c' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const s1c = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    hasLostWolf: !!g.world.updateLostWolf };
});
check('s1c has no fight', s1c.hostiles === 0, s1c);
check('s1c has doors to both s1a and s1d', s1c.doors.includes('s1a') && s1c.doors.includes('s1d'), s1c.doors);
check('s1c spawns the lost-wolf update hook', s1c.hasLostWolf, s1c);

await wk.walkTo(-6, -4, { timeout: 20, arrive: 1.0 });
await wk.page.waitForTimeout(300);
const rescued = await wk.page.evaluate(() => !!window.__game.state.flags.rescued.s1c_wolf);
check('walking up to the wolf writes state.flags.rescued.s1c_wolf', rescued);

// 3. s1d — the fight, the guardian, the plug, the milestone.
await wk.page.evaluate((f) => window.__wkJump('s1d', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 's1d' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const s1dBefore = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    hasMini: !!g.world.miniBoss,
    miniWeakness: g.world.miniBoss && g.world.miniBoss.weakness,
    doors: (g.world.doors || []).map((d) => d.to),
    dungeonDone: g.WS.get('storm', 'dungeon') };
});
check('s1d holds 2 gale hounds + the Ash Warden, no door to s1e yet',
  s1dBefore.hostiles === 3 && s1dBefore.hasMini && s1dBefore.miniWeakness === 'earth'
    && !s1dBefore.doors.includes('s1e') && !s1dBefore.dungeonDone, s1dBefore);

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
const s1dAfter = await wk.page.evaluate(() => {
  const g = window.__game;
  return { wardenDown: g.WS.get('storm', 'mini_ash_warden'),
    dungeonDone: g.WS.get('storm', 'dungeon'),
    doors: (g.world.doors || []).map((d) => d.to) };
});
const formsAfter = await wk.wk('forms');
check('killing the Ash Warden sets WS(storm,mini_ash_warden) and WS(storm,dungeon), pops the plug to s1e',
  s1dAfter.wardenDown && s1dAfter.dungeonDone && s1dAfter.doors.includes('s1e'), s1dAfter);
check('no wolf form is granted by the guardian (it is not a region boss)',
  formsAfter.length === formsBefore.length && formsAfter.every((f) => formsBefore.includes(f)),
  { formsBefore, formsAfter });

// re-entering s1d does not respawn a second Ash Warden
await wk.page.evaluate((f) => window.__wkJump('s1c', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 's1c' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate((f) => window.__wkJump('s1d', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 's1d' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const s1dRebuilt = await wk.page.evaluate(() => !!window.__game.world.miniBoss);
check('the Ash Warden does not respawn once defeated (persists via WS)', !s1dRebuilt);

// 4. s1e — the gold chest, reachable now the plug is gone.
await wk.page.evaluate((f) => window.__wkJump('s1e', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 's1e' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const s1e = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 's1e_hold');
  return { id: c && c.id, tier: c && c.tier, heartPiece: c && c.loot.heartPiece,
    gear: c && c.loot.gear, seed: c && c.loot.seed, doors: (g.world.doors || []).map((d) => d.to) };
});
check('s1e gold chest exists with a heart piece, a gear id and its own seed',
  !!s1e.id && s1e.heartPiece === 1 && s1e.gear === 'sword_storm' && s1e.seed === 'storm', s1e);
check('s1e has a door back to s1d', s1e.doors.includes('s1d'), s1e.doors);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Drowned Hold holds together');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
