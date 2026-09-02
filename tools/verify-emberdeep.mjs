// EMBER DEEP, WALKED. Does the branch build, is the door from the Kiln real,
// and does the Fire Wolf's slam actually open the road west?
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'earth_wolf', 'fire_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('DEEP');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// the Kiln must now offer a way west
await wk.page.evaluate((f) => window.__wkJump('ld', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'ld' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const kilnDoors = await wk.wk('doors');
check('the Kiln has a door into Ember Deep', kilnDoors.some((d) => d.to === 'lk1'), kilnDoors.map((d) => d.to));

for (const room of ['lk1', 'lk2', 'lk3']) {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: FORMS });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
  const m = await wk.page.evaluate(() => {
    const g = window.__game;
    let meshes = 0;
    g.world.root.traverse((n) => { if (n.isMesh) meshes++; });
    return { meshes, calls: g.renderer.info.render.calls,
      burnables: (g.world.burnables || []).length,
      braziers: (g.world.braziers || []).length,
      chests: (g.world.markers.chestDefs || []).length,
      doors: (g.world.doors || []).map((d) => d.to),
      spawn: g.world.spawn };
  });
  check(`${room} builds with content`, m.meshes > 40 && m.calls < 125, m);
}

// THE REAL QUESTION: does fire open the road? Slam in lk1 and count burnables.
await wk.page.evaluate((f) => window.__wkJump('lk1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lk1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const before = await wk.page.evaluate(() => (window.__game.world.burnables || []).filter((b) => !b.burned).length);
// become the Fire Wolf through the real picker path, walk onto the thorn, slam
await wk.page.evaluate(() => window.__game.player.setForm('fire_wolf'));
await wk.walkTo(4.5, 0, { timeout: 40, arrive: 1.6 });
for (let i = 0; i < 6; i++) {
  await wk.page.keyboard.press('k');            // the special: ground slam
  await wk.page.waitForTimeout(700);
  await wk.page.evaluate(() => { window.__game.narration.blocking = false; });
}
const after = await wk.page.evaluate(() => (window.__game.world.burnables || []).filter((b) => !b.burned).length);
check('the Fire Wolf burns the road open', after < before, { before, after });

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 3)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — Ember Deep builds and fire opens it');

await wk.b.close();
process.exit(errs.length ? 1 : 0);
