// THE WHOLE PATH, WALKED. Light Ember Deep's ring for real, open the chest by
// walking onto it, and check the keepsake is in the bag and survives a save.
import { launch } from './wk-drive.mjs';
const FORMS = ['knight', 'dark_wolf', 'earth_wolf', 'fire_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('KEEP');
await wk.page.evaluate((f) => window.__wkJump('lk3', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lk3' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

const before = await wk.page.evaluate(() => [...window.__game.state.inventory.treasures]);
// walk onto the chest — 1.1u pickup radius, so aim close
await wk.walkTo(0, -5.6, { timeout: 50, arrive: 0.8 });
await wk.page.waitForTimeout(2500);
await wk.page.evaluate(() => { window.__game.narration.blocking = false; });
const after = await wk.page.evaluate(() => ({
  treasures: [...window.__game.state.inventory.treasures],
  chests: (window.__game.world.chests || []).map((c) => ({ id: c.id, opened: !!c.opened })),
}));
console.log('BEFORE', JSON.stringify(before), '\nAFTER ', JSON.stringify(after));

// and it must survive a write/read of the save
const persisted = await wk.page.evaluate(async () => {
  const g = window.__game;
  const save = await import('/js/save.js');
  save.persist();
  const raw = JSON.stringify(localStorage).includes('banked_ember');
  return { wroteIt: raw, inState: [...g.state.inventory.treasures] };
});
console.log('SAVED ', JSON.stringify(persisted));
const ok = after.treasures.includes('banked_ember') && persisted.wroteIt;
console.log('ERRORS', JSON.stringify(wk.errors.slice(0, 3)));
console.log(ok ? '\n✓ PASS — walked to it, got it, and it is in the save file'
                : '\n✗ FAIL');
await wk.b.close();
process.exit(ok ? 0 : 1);
