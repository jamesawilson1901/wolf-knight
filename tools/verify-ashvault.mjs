// THE ASH VAULT, WALKED. Ember's first dungeon (design/WIDER-WORLD.md §2.4),
// from tools/verify-emberdeep.mjs: is the door from `la` sealed before the
// crack and open after (and still open on a rebuild), does `lv2` hold its
// fight, does clearing it set the dungeon milestone and pop the plug to
// `lv3` where the child is standing, and does the moved chest / the lost
// wolf / the gold chest all behave.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'earth_wolf', 'fire_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('ASHVAULT');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// 0. THE DOOR IS SEALED BEFORE THE CRACK BREAKS.
await wk.page.evaluate((f) => window.__wkJump('la', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'la' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
let laDoors = await wk.wk('doors');
check('la has NO door to lv1 before the crack', !laDoors.some((d) => d.to === 'lv1'), laDoors.map((d) => d.to));

// crack it directly — the crack mechanic itself is covered elsewhere
await wk.page.evaluate(() => { window.__game.state.flags.cracked.l1_crack_gate = true; });
await wk.page.evaluate((f) => window.__wkJump('la', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'la' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
laDoors = await wk.wk('doors');
check('la HAS a door to lv1 once cracked (open on rebuild)', laDoors.some((d) => d.to === 'lv1'), laDoors.map((d) => d.to));

// 1. lv1 — no fight, the moved chest, the lost wolf.
for (const room of ['lv1', 'lv2', 'lv3']) {
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
  check(`${room} builds with content, calls < 125`, m.meshes > 20 && m.calls < 125, m);
}

await wk.page.evaluate((f) => window.__wkJump('lv1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lv1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const lv1 = await wk.page.evaluate(() => {
  const g = window.__game;
  // world.enemies also carries Breakable (js/loot.js) — pots share the hit
  // array, they are not a fight.
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    hasLostWolf: !!g.world.updateLostWolf };
});
check('lv1 has no fight', lv1.hostiles === 0, lv1);
check('lv1 has doors to both la and lv2', lv1.doors.includes('la') && lv1.doors.includes('lv2'), lv1.doors);
check('lv1 spawns the lost-wolf update hook', lv1.hasLostWolf, lv1);

// walk up to the wolf and rescue it for real
await wk.walkTo(-6.5, 5, { timeout: 20, arrive: 1.0 });
await wk.page.waitForTimeout(300);
const rescued = await wk.page.evaluate(() => !!window.__game.state.flags.rescued.lv1_wolf);
check('walking up to the wolf writes state.flags.rescued.lv1_wolf', rescued);

// open the chest and confirm the moved id/loot survived the move
const chestOk = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'l1_crack_promise');
  return !!c && c.loot && c.loot.gear === 'sword_legion' && c.loot.shards === 18;
});
check('the moved chest keeps its id (l1_crack_promise) and loot', chestOk);

// 2. lv2 — the fight, the plug, the milestone.
await wk.page.evaluate((f) => window.__wkJump('lv2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lv2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const lv2before = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    dungeonDone: g.WS.get('ember', 'dungeon') };
});
check('lv2 holds 3 enemies (2 wretch + 1 marauder) and no door to lv3 yet',
  lv2before.hostiles === 3 && !lv2before.doors.includes('lv3') && !lv2before.dungeonDone, lv2before);

await wk.page.evaluate(() => {
  const g = window.__game;
  for (const e of g.world.enemies) { e.hp = 0; e.dead = true; }
});
await wk.page.waitForTimeout(500);
const lv2after = await wk.page.evaluate(() => {
  const g = window.__game;
  return { dungeonDone: g.WS.get('ember', 'dungeon'),
    doors: (g.world.doors || []).map((d) => d.to) };
});
check('clearing lv2 sets WS(ember,dungeon) and pops the plug to lv3',
  lv2after.dungeonDone && lv2after.doors.includes('lv3'), lv2after);

// 3. THE PROMISE — the ??? card resolves on the milestone, not the crack.
const promiseResolvesOnDungeon = await wk.page.evaluate(() => window.__game.WS.get('ember', 'dungeon'));
check('the l1_crack promise condition (ember/dungeon) is now true', promiseResolvesOnDungeon);

// 4. lv3 — the gold chest, reachable now the plug is gone.
await wk.page.evaluate((f) => window.__wkJump('lv3', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lv3' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const lv3 = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'lv3_banked');
  // Extract plain fields only — main.js's chest spawner attaches a live mesh
  // onto this object once built, and returning it whole is a circular value.
  return { id: c && c.id, tier: c && c.tier, heartPiece: c && c.loot.heartPiece,
    gear: c && c.loot.gear, doors: (g.world.doors || []).map((d) => d.to) };
});
check('lv3 gold chest exists with a heart piece and a gear id',
  !!lv3.id && lv3.heartPiece === 1 && !!lv3.gear, lv3);
check('lv3 has a door back to lv2', lv3.doors.includes('lv2'), lv3.doors);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Ash Vault holds together');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
