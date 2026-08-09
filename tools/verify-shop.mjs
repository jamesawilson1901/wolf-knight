// THE SHOP LADDER — Maren's stock grows with the world.
//
// GAME-CONTRACT's region shipping checklist asks every region for a "shop
// tier", and the progression targets name the ladder (~60/90/150/250/400).
// The shop was a flat list: every weapon in the game was on the shelf the
// first time a child walked up to the cart, so the ladder existed only in the
// doc.
//
// This drives the REAL path — walk Kael up to the mage, let main.js's own
// proximity trigger open the panel, read the cards the child would actually
// see — because the failure this guards against is a rendering/gating one and
// a direct call to showShop() would not prove the trigger still works.
//
// It also guards the two ways a gate like this goes wrong:
//   · a tier never opens (the child beats a region and the shelf is unchanged)
//   · a tier opens too early (the ladder is decoration again)
// and the additive-forever law: gear bought before the gating existed stays
// owned, stays equippable, and does not come back onto the shelf.
import { chromium } from 'playwright';
const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : ''); if (!ok) errors.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SHOP');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.player.iframes = 99999;
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};
if (!await go('den')) { check('the Den builds', false); process.exit(1); }
check('the Den builds', true);

// Close the panel the way a child does, then walk out of range so the
// proximity trigger re-arms (main.js only opens on the ENTERING edge).
const closeShop = async () => {
  if (await page.locator('#shop-menu').isVisible()) {
    await page.locator('#shop-menu .menu-btn').last().dispatchEvent('pointerdown');
  }
  await page.evaluate(() => { const g = window.__game;
    g.player.root.position.set(-8, g.player.root.position.y, 8); });
  await page.waitForFunction(() => document.getElementById('shop-menu').style.display === 'none',
    null, { timeout: 10000 });
  for (let i = 0; i < 4; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
};

// Walk to the cart and read the shelf. Returns what the CHILD sees.
// Always steps out of range first: main.js arms `shopWasNear = true` on spawn
// so the panel cannot pop merely from landing next to the mage, and the
// trigger fires on the ENTERING edge only.
const openShop = async () => {
  await page.evaluate(() => { const g = window.__game;
    g.player.root.position.set(-8, g.player.root.position.y, 8); });
  for (let i = 0; i < 4; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  await page.evaluate(() => { const g = window.__game, s = g.world.markers.shopSpot;
    g.player.root.position.set(s.x, g.player.root.position.y, s.z); });
  await page.waitForSelector('#shop-menu', { state: 'visible', timeout: 15000 });
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('#shop-menu .item-card')];
    return {
      names: cards.map((c) => c.querySelector('.nm').textContent.trim()),
      locked: cards.filter((c) => c.classList.contains('locked'))
        .map((c) => (c.querySelector('div:nth-child(3)') || {}).textContent || ''),
    };
  });
};

const T1 = ['Swift Fang', 'Ember Blade', 'Round Guard'];
const T2 = ['Long Spear', 'Tower Shield'];
const T3 = ['Moon Sword'];
const T4 = ['Boulder Hammer'];
const has = (names, list) => list.every((n) => names.includes(n));
const hasNone = (names, list) => list.every((n) => !names.includes(n));

console.log('\n── tier 1: a new game, nothing freed ───────────────────────────');
let shelf = await openShop();
check('the potion is always on the shelf', shelf.names.includes('Healing Potion'), shelf.names);
check('tier 1 gear is on the shelf', has(shelf.names, T1), shelf.names);
check('tier 2 gear is NOT yet', hasNone(shelf.names, T2));
check('tier 3 gear is NOT yet', hasNone(shelf.names, T3));
check('tier 4 gear is NOT yet', hasNone(shelf.names, T4));
check('one locked crate promises what is next', shelf.locked.length === 1, shelf.locked);
check('...and it names Stoneroot', /Stoneroot/i.test(shelf.locked[0] || ''), shelf.locked[0]);

console.log('\n── the ladder opens a rung at a time ───────────────────────────');
await closeShop();
await page.evaluate(() => { window.__game.state.flags.wardenDefeated = true; });
shelf = await openShop();
check('Stoneroot freed → tier 2 arrives', has(shelf.names, T2), shelf.names);
check('...and tier 3 still does not', hasNone(shelf.names, T3));
check('...and the crate now names the Wild Woods', /Wild Woods/i.test(shelf.locked[0] || ''), shelf.locked[0]);

await closeShop();
await page.evaluate(() => { window.__game.state.flags.sylvaDefeated = true; });
shelf = await openShop();
check('the Wild Woods freed → tier 3 arrives', has(shelf.names, T3), shelf.names);
check('...and tier 4 still does not', hasNone(shelf.names, T4));

await closeShop();
await page.evaluate(() => { window.__game.state.flags.borealDefeated = true; });
shelf = await openShop();
check('Frostpeak freed → tier 4 arrives', has(shelf.names, T4), shelf.names);
check('the last rung leaves no locked crate', shelf.locked.length === 0, shelf.locked);

console.log('\n── the ladder climbs (contract: ~60/90/150/250/400) ────────────');
// Read the registry itself, straight out of the module the game loaded — no
// debug hook needed in shipping code for a table that is already public.
const ladder = await page.evaluate(async () => {
  const rows = (await import('/js/items.js')).SHOP_STOCK.filter((s) => s.kind !== 'potion');
  const byTier = {};
  for (const r of rows) (byTier[r.tier] = byTier[r.tier] || []).push(r.price);
  return Object.keys(byTier).sort().map((t) => ({ tier: +t, min: Math.min(...byTier[t]), max: Math.max(...byTier[t]) }));
});
let monotonic = true;
for (let i = 1; i < ladder.length; i++) if (ladder[i].min < ladder[i - 1].max) monotonic = false;
check('every rung costs at least as much as the one below', monotonic, ladder);
check('every gear item has a tier', await page.evaluate(
  async () => (await import('/js/items.js')).SHOP_STOCK
    .filter((s) => s.kind !== 'potion').every((s) => s.tier >= 1)), true);

console.log('\n── buying still works, through the real card ───────────────────');
await closeShop();
await page.evaluate(() => { const g = window.__game; g.state.shards = 999; });
shelf = await openShop();
const beforeBuy = await page.evaluate(() => ({ shards: window.__game.state.shards,
  gear: [...window.__game.state.inventory.gear] }));
await page.evaluate(() => {
  const card = [...document.querySelectorAll('#shop-menu .item-card')]
    .find((c) => c.querySelector('.nm').textContent.trim() === 'Long Spear');
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await page.waitForFunction(() => window.__game.state.inventory.gear.includes('spear_a'), null, { timeout: 20000 });
// The card handler is async (it awaits equipGear before re-rendering), so the
// gear flag lands before the shelf redraws. Wait for the redraw rather than
// reading the DOM in the gap — bounded, so a shelf that never redraws still fails.
await page.waitForFunction(() => ![...document.querySelectorAll('#shop-menu .item-card .nm')]
  .some((n) => n.textContent.trim() === 'Long Spear'), null, { timeout: 30000 }).catch(() => {});
const afterBuy = await page.evaluate(() => ({ shards: window.__game.state.shards,
  gear: [...window.__game.state.inventory.gear],
  onShelf: [...document.querySelectorAll('#shop-menu .item-card .nm')].map((n) => n.textContent.trim()) }));
check('the spear is owned', afterBuy.gear.includes('spear_a'));
check('120 shards left the purse', beforeBuy.shards - afterBuy.shards === 120,
  { before: beforeBuy.shards, after: afterBuy.shards });
check('a sold item leaves the shelf', !afterBuy.onShelf.includes('Long Spear'), afterBuy.onShelf);

console.log('\n── additive-forever: gear bought before the gates existed ──────');
await closeShop();
await page.evaluate(() => { const g = window.__game;
  // an old profile: owns the top-tier hammer, has freed nothing
  g.state.flags.wardenDefeated = false; g.state.flags.sylvaDefeated = false;
  g.state.flags.borealDefeated = false;
  if (!g.state.inventory.gear.includes('hammer_a')) g.state.inventory.gear.push('hammer_a');
  g.state.inventory.equipped.weapon = 'hammer_a';
});
shelf = await openShop();
check('the old save keeps its hammer', await page.evaluate(
  () => window.__game.state.inventory.gear.includes('hammer_a')));
check('...still equipped', await page.evaluate(
  () => window.__game.state.inventory.equipped.weapon === 'hammer_a'));
check('...and it is not back on the shelf', hasNone(shelf.names, T4), shelf.names);
check('...and the gating still holds for what it does NOT own', hasNone(shelf.names, T2), shelf.names);

await closeShop();
await b.close();
console.log('');
if (errors.length) { console.log('FAILED:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log('ALL CLEAN — the shop ladder climbs with the world');
