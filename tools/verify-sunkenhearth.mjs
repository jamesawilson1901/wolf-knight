// THE SUNKEN HEARTH, WALKED. Frostpeak's own dungeon (design/WIDER-WORLD.md
// §2.3/§2.6), from tools/verify-rootcellar.mjs: is the door from `f1b`
// sealed before the melt gate breaks and open after (and still open on a
// rebuild), does `f1d` hold its fight AND its own named guardian (the Rime
// Warden), does defeating the guardian set the dungeon milestone and pop the
// plug to `f1e` where the child is standing, and does the lost wolf / the
// gold chest behave. Unlike the other three dungeons this one is MELTED, not
// shattered/cut/cracked — the Fire Wolf's own verb, already owned on
// arrival in Frostpeak, so the door opens the day the region begins.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('SUNKENHEARTH');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// 0. THE DOOR IS SEALED BEFORE THE ARCH MELTS.
await wk.page.evaluate((f) => window.__wkJump('f1b', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1b' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
let f1bDoors = await wk.wk('doors');
check('f1b has NO door to f1c before the arch melts', !f1bDoors.some((d) => d.to === 'f1c'), f1bDoors.map((d) => d.to));
// the cairn nook's own promise ice is untouched by this dungeon
const cairnIceUntouched = await wk.page.evaluate(() => {
  const w = window.__game.state.flags.world;
  return !w || !w.frost || !w.frost.ice_f_cairn;
});
check('the cairn nook\'s own ice (f_cairn) is untouched by this dungeon', cairnIceUntouched);

// melt it directly — the melt mechanic itself (meltGate/world.meltAt) is
// covered generically by the frozen-brazier puzzle already shipped
await wk.page.evaluate(() => { window.__game.WS.set('frost', 'melt_f1c_hearth', true); });
await wk.page.evaluate((f) => window.__wkJump('f1b', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1b' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
f1bDoors = await wk.wk('doors');
check('f1b HAS a door to f1c once melted (open on rebuild)', f1bDoors.some((d) => d.to === 'f1c'), f1bDoors.map((d) => d.to));

// 1. f1c/f1d/f1e all build, calls under budget.
for (const room of ['f1c', 'f1d', 'f1e']) {
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
  // "not empty" only — tools/verify-density.mjs is the real authority on
  // arrival-frame fullness and already holds all three to their own floor.
  check(`${room} builds with content, calls < 125`, m.meshes > 15 && m.calls < 125, m);
}

// 2. f1c — no fight, the lost wolf.
await wk.page.evaluate((f) => window.__wkJump('f1c', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1c' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const f1c = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    hasLostWolf: !!g.world.updateLostWolf };
});
check('f1c has no fight', f1c.hostiles === 0, f1c);
check('f1c has doors to both f1b and f1d', f1c.doors.includes('f1b') && f1c.doors.includes('f1d'), f1c.doors);
check('f1c spawns the lost-wolf update hook', f1c.hasLostWolf, f1c);

await wk.walkTo(-6.5, 5, { timeout: 20, arrive: 1.0 });
await wk.page.waitForTimeout(300);
const rescued = await wk.page.evaluate(() => !!window.__game.state.flags.rescued.f1c_wolf);
check('walking up to the wolf writes state.flags.rescued.f1c_wolf', rescued);

// 3. f1d — the fight, the guardian, the plug, the milestone.
await wk.page.evaluate((f) => window.__wkJump('f1d', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1d' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const f1dBefore = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    hasMini: !!g.world.miniBoss,
    miniWeakness: g.world.miniBoss && g.world.miniBoss.weakness,
    doors: (g.world.doors || []).map((d) => d.to),
    dungeonDone: g.WS.get('frost', 'dungeon') };
});
check('f1d holds 3 mooks (2 rime-minion + 1 glacier-warden) + the Rime Warden, no door to f1e yet',
  f1dBefore.hostiles === 4 && f1dBefore.hasMini && f1dBefore.miniWeakness === 'fire'
    && !f1dBefore.doors.includes('f1e') && !f1dBefore.dungeonDone, f1dBefore);

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
const f1dAfter = await wk.page.evaluate(() => {
  const g = window.__game;
  return { wardenDown: g.WS.get('frost', 'mini_rime_warden'),
    dungeonDone: g.WS.get('frost', 'dungeon'),
    doors: (g.world.doors || []).map((d) => d.to) };
});
const formsAfter = await wk.wk('forms');
check('killing the Rime Warden sets WS(frost,mini_rime_warden) and WS(frost,dungeon), pops the plug to f1e',
  f1dAfter.wardenDown && f1dAfter.dungeonDone && f1dAfter.doors.includes('f1e'), f1dAfter);
check('no wolf form is granted by the guardian (it is not a region boss)',
  formsAfter.length === formsBefore.length && formsAfter.every((f) => formsBefore.includes(f)),
  { formsBefore, formsAfter });

// re-entering f1d does not respawn a second Rime Warden
await wk.page.evaluate((f) => window.__wkJump('f1b', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1b' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate((f) => window.__wkJump('f1d', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1d' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const f1dRebuilt = await wk.page.evaluate(() => !!window.__game.world.miniBoss);
check('the Rime Warden does not respawn once defeated (persists via WS)', !f1dRebuilt);

// 4. THE PROMISE — the ??? card resolves on the milestone, not the melt.
const promiseResolvesOnDungeon = await wk.page.evaluate(() => window.__game.WS.get('frost', 'dungeon'));
check('the f1c_hearth promise condition (frost/dungeon) is now true', promiseResolvesOnDungeon);

// 5. f1e — the gold chest, reachable now the plug is gone.
await wk.page.evaluate((f) => window.__wkJump('f1e', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'f1e' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const f1e = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'f1e_hearth');
  return { id: c && c.id, tier: c && c.tier, heartPiece: c && c.loot.heartPiece,
    gear: c && c.loot.gear, seed: c && c.loot.seed, doors: (g.world.doors || []).map((d) => d.to) };
});
check('f1e gold chest exists with a heart piece, a gear id and its own seed',
  !!f1e.id && f1e.heartPiece === 1 && f1e.gear === 'axe_frost' && f1e.seed === 'frost', f1e);
check('f1e has a door back to f1d', f1e.doors.includes('f1d'), f1e.doors);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Sunken Hearth holds together');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
