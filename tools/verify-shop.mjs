// MAREN'S SHELF GROWS — the shop tier ladder (GAME-CONTRACT: "shop ladder per
// region tier"; the region shipping checklist's "shop tier" line).
//
// Nothing in tools/ measured the shop before this, which is how every rung of
// the ladder came to sit on the shelf from minute one without a single verifier
// noticing. Breakables respawn with the room, so shard income is unbounded: a
// child who liked smashing pots could buy the 300-shard Boulder Hammer — the
// last weapon in the game — before leaving Ember Hollow.
//
// This drives the REAL path: walk Kael up to Maren so main.js's proximity
// trigger opens the shop, then tap the cards the way a thumb does. It asserts
// both halves — that a locked rung cannot be bought AND that it is still on the
// shelf saying when it opens, because a shop that silently grows teaches a child
// nothing.
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
  g.state.settings.greybox = false; g.player.iframes = 99999;
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

// Walk up to Maren the way a child does: main.js watches world.markers.shopSpot
// and opens the shop itself. Nothing here calls menus.showShop().
const closeShop = async () => {
  await page.evaluate(() => {
    const el = document.getElementById('shop-menu');
    if (el.style.display !== 'flex') return;
    [...el.querySelectorAll('.menu-btn')].pop()
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForFunction(() => document.getElementById('shop-menu').style.display !== 'flex',
    null, { timeout: 10000 });
};
const walkToMaren = async () => {
  // stand well clear first so main's `shopWasNear` edge can re-arm
  await page.evaluate(async () => {
    const g = window.__game, s = () => new Promise((r) => requestAnimationFrame(r));
    const m = g.world.markers.shopSpot;
    g.player.root.position.set(m.x + 9, g.player.root.position.y, m.z + 9);
    for (let i = 0; i < 8; i++) await s();
    g.player.root.position.set(m.x, g.player.root.position.y, m.z);
  });
  await page.waitForSelector('#shop-menu', { state: 'visible', timeout: 20000 });
};
const shelf = () => page.evaluate(() => [...document.querySelectorAll('#shop-menu .item-card')].map((c) => ({
  name: c.querySelector('.nm').textContent,
  locked: c.dataset.locked === '1',
  price: c.querySelector('.price').textContent.trim(),
})));

console.log('\n── before Stoneroot: the ladder has a locked rung ──────────────');
await page.evaluate(() => { window.__game.state.shards = 999; });
await walkToMaren();
let cards = await shelf();
const locked = cards.filter((c) => c.locked);
const openC = cards.filter((c) => !c.locked);
check('the shop opens from the real proximity trigger', cards.length > 0, { cards: cards.length });
check('tier-1 stock is on the shelf', openC.length === 4, openC.map((c) => c.name));
check('tier-2 stock is LOCKED', locked.length === 4, locked.map((c) => c.name));
// the promise, not a hole in the shelf
check('every locked rung says when it opens',
  locked.length > 0 && locked.every((c) => c.price.includes('🔒') && /Stoneroot/i.test(c.price)),
  locked.map((c) => c.price));

console.log('\n── ...and 999 shards cannot buy it ────────────────────────────');
const before = await page.evaluate(() => ({ shards: window.__game.state.shards,
  gear: [...window.__game.state.inventory.gear] }));
await page.evaluate(async () => {
  const s = () => new Promise((r) => requestAnimationFrame(r));
  for (const c of document.querySelectorAll('#shop-menu .item-card[data-locked="1"]')) {
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await s();
  }
});
const after = await page.evaluate(() => ({ shards: window.__game.state.shards,
  gear: [...window.__game.state.inventory.gear] }));
check('tapping a locked card costs nothing', after.shards === before.shards, { before: before.shards, after: after.shards });
check('tapping a locked card grants nothing', after.gear.length === before.gear.length, after.gear);

console.log('\n── an open rung still sells ───────────────────────────────────');
await page.evaluate(async () => {
  const s = () => new Promise((r) => requestAnimationFrame(r));
  const card = [...document.querySelectorAll('#shop-menu .item-card')]
    .find((c) => c.dataset.locked !== '1' && c.querySelector('.nm').textContent !== 'Healing Potion');
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  for (let i = 0; i < 10; i++) await s();
});
const bought = await page.evaluate(() => ({ shards: window.__game.state.shards,
  gear: [...window.__game.state.inventory.gear] }));
check('a tier-1 purchase goes through', bought.gear.length === before.gear.length + 1 && bought.shards < before.shards, bought);

console.log('\n── Stoneroot wakes: the crate comes out ───────────────────────');
await closeShop();
await page.evaluate(() => { const g = window.__game;
  g.WS.set('stone', 'restored', true); g.state.shards = 999;
  delete g.state.spoken.shop_restock; });
await walkToMaren();
cards = await shelf();
check('nothing on the shelf is locked any more', cards.every((c) => !c.locked), cards.filter((c) => c.locked).map((c) => c.name));
check('Pip says the crate is open', await page.evaluate(() => !!window.__game.state.spoken.shop_restock));

const hammerBought = await page.evaluate(async () => {
  const g = window.__game, s = () => new Promise((r) => requestAnimationFrame(r));
  const shardsBefore = g.state.shards;
  const card = [...document.querySelectorAll('#shop-menu .item-card')]
    .find((c) => c.querySelector('.nm').textContent === 'Boulder Hammer');
  if (!card) return { found: false };
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  for (let i = 0; i < 20; i++) await s();
  return { found: true, spent: shardsBefore - g.state.shards, owns: g.state.inventory.gear.includes('hammer_a') };
});
check('the top rung sells once Stoneroot is restored',
  hammerBought.found && hammerBought.owns && hammerBought.spent === 300, hammerBought);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n')
  : '✓ ALL CLEAN — the shop ladder is a ladder'));
await b.close();
process.exit(errors.length ? 1 : 0);
