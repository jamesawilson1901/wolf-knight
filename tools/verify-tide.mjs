// THE TIDE PASSAGE, walked (design/WIDER-WORLD.md §5.1, v3.208): lb2 -> lw1
// -> lw2 -> q2, the last of §5.1's loops. Every step here is the keyboard —
// wk-drive's walkTo, real key presses, the real door transitions — so what
// is proved is what a child can actually do:
//
//   1. without the Tide Wolf neither end of the passage is a door at all
//      (lb2's north wall and q2's east wall are wall);
//   2. with it, a child walks from the Scorched Cubby down through the
//      Drowned Stores and the Flooded Way and comes up on the Market's far
//      bank — and can wade the channel to the stalls from there;
//   3. each room's deep pool holds a chest that only wading reaches, and
//      walking into it opens it.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('TIDE');
await wk.page.evaluate(() => {
  setInterval(() => { const n = window.__game.narration; if (n && n.speaking) n.skip(); }, 80);
  window.__game.CONFIG.DIFFICULTY.GUIDE_IDLE_S = 1e9;
});
const doorsOf = () => wk.page.evaluate(() => window.__game.world.doors.map((d) => d.to));
const calm = () => wk.page.evaluate(() => { const g = window.__game; g.player.iframes = 1e6;
  for (const e of g.world.enemies) if (!e.scenery) e.update = () => {}; });
const where = () => wk.page.evaluate(() => ({ room: window.__game.world.roomId,
  x: +window.__game.player.root.position.x.toFixed(2), z: +window.__game.player.root.position.z.toFixed(2) }));

// 1. no Tide Wolf: no passage
const noWade = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf'];
await wk.jump('lb2', noWade);
check('without the Tide Wolf, the Scorched Cubby has no way down', !(await doorsOf()).includes('lw1'), await doorsOf());
await wk.jump('q2', noWade);
check('...and the Market\'s far bank has no door back', !(await doorsOf()).includes('lw2'), await doorsOf());

// 2. with it: the whole way through, on foot
const ALL = [...noWade, 'tide_wolf'];
await wk.jump('lb2', ALL);
await calm();
check('with the Tide Wolf, the Scorched Cubby\'s north wall opens', (await doorsOf()).includes('lw1'), await doorsOf());
let r = await wk.walkTo(0, -9.5, { timeout: 30 });
check('walking north through it lands in the Drowned Stores', r.roomChanged === 'lw1' || (await where()).room === 'lw1', r);
await wk.page.waitForFunction(() => window.__wk.room === 'lw1' && !window.__wk.gates.transitioning, null, { timeout: 30000 });
await calm();

// the sunk chest: in the deep cistern, so only wading gets there
const sunk = await wk.page.evaluate(() => { const c = window.__game.world.chests.find((q) => q.id === 'l1_lw1_sunk');
  return c && { x: c.x, z: c.z, inDeep: window.__game.world.waterZones.some((w) => w.deep && c.x > w.minX && c.x < w.maxX && c.z > w.minZ && c.z < w.maxZ) }; });
check('the Drowned Stores\' chest sits in deep water', sunk && sunk.inDeep, sunk);
const toSunk = await wk.walkTo(sunk.x - 0.7, sunk.z, { timeout: 25, arrive: 0.3 });
await wk.page.waitForFunction(() => window.__game.state.flags.chests.l1_lw1_sunk, null, { timeout: 8000 }).catch(() => {});
check('...and wading out to it opens it', await wk.page.evaluate(() => !!window.__game.state.flags.chests.l1_lw1_sunk), { toSunk, at: await where() });

r = await wk.walkTo(0, -9.5, { timeout: 30 });
await wk.page.waitForFunction(() => window.__wk.room === 'lw2' && !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
check('on north through the Stores into the Flooded Way', (await where()).room === 'lw2', await where());
await calm();

const gold = await wk.page.evaluate(() => { const c = window.__game.world.chests.find((q) => q.id === 'l1_tide_promise');
  return c && { x: c.x, z: c.z, tier: c.tier, inDeep: window.__game.world.waterZones.some((w) => w.deep && c.x > w.minX && c.x < w.maxX && c.z > w.minZ && c.z < w.maxZ) }; });
check('the Flooded Way\'s gold — Ember\'s oldest promise, kept — sits in the deep sluice', gold && gold.inDeep, gold);
const toGold = await wk.walkTo(gold.x - 0.7, gold.z, { timeout: 25, arrive: 0.3 });
await wk.page.waitForFunction(() => window.__game.state.flags.chests.l1_tide_promise, null, { timeout: 8000 }).catch(() => {});
check('...and wading out to it opens it', await wk.page.evaluate(() => !!window.__game.state.flags.chests.l1_tide_promise), { toGold, at: await where() });

r = await wk.walkTo(-11.5, 0, { timeout: 35 });
await wk.page.waitForFunction(() => window.__wk.room === 'q2' && !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
const bank = await where();
check('out the Flooded Way\'s west door onto the Market\'s far bank', bank.room === 'q2' && bank.x > 12, bank);
await calm();
check('q2 now has its door back down', (await doorsOf()).includes('lw2'), await doorsOf());

// ...and the channel between the far bank and the stalls can be waded
r = await wk.walkTo(3.5, -8, { timeout: 35, arrive: 0.8 });
const across = await where();
check('from the far bank, a wading child crosses the channel to the stalls', across.room === 'q2' && across.x < 5, { r, across });

check('no page errors', wk.errors.length === 0, wk.errors.slice(0, 4));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Tide passage: shut without the wolf, walked end to end with it, and its two finds wait in the deep');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
