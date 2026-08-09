// MAREN'S COUNTER GROWS — the shop tier, driven through the real path.
//
// GAME-CONTRACT's region checklist asks every region for a "shop tier" and its
// progression targets set the ladder at "≈ 60/90/150/250/400 per region tier".
// Nothing in tools/ could see the shop at all before this: the whole stock list
// could go back to one flat shelf, or a tier-2 row could be made buyable on
// day one, and every other verifier would stay green.
//
// So this walks a child up to Maren the way the game does — the shop opens on
// PROXIMITY from main's loop, never by calling showShop() — reads the real
// cards out of the real DOM, and taps them with real pointer events.
//
// Four things are asserted, in the order they can fail:
//   1. the shelf a new child sees is tier 1 only, and the rest are WRAPPED
//      (shown, not hidden — an empty counter says "this is all there is")
//   2. a wrapped row cannot be bought, with the shards to buy it in hand
//   3. an unwrapped row still can
//   4. healing Stoneroot unwraps the second shelf, and only then
// Plus the ladder itself: every tier-1 price under 100, every tier-2 over it.
// That last one is what stops a future edit quietly putting the 300-shard
// hammer on a five-year-old's first visit.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SHOP');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.player.iframes = 999999;
});

// Get into the Den the way verify-minigame does — die home rather than teleport.
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
check('the Den builds', await go('den'));

const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);

// Walk to the counter. main.js opens the shop when Kael is within 1.7u of
// world.markers.shopSpot, on the rising edge — so stepping away and back is how
// the shop is re-opened after the flag flips, and the trigger itself is under
// test every time.
const AWAY = { x: -6, z: 4 };
const walkToMaren = async () => {
  await page.evaluate((p) => { window.__game.player.root.position.set(p.x, 0, p.z); }, AWAY);
  await frames(4);
  await page.evaluate(() => {
    const g = window.__game, s = g.world.markers.shopSpot;
    g.player.root.position.set(s.x, 0, s.z);
  });
  await frames(6);
  return page.locator('#shop-menu').isVisible();
};
const closeShop = async () => {
  await page.locator('#shop-menu .menu-btn').dispatchEvent('pointerdown');
  await frames(2);
};

const readCards = () => page.evaluate(() => Array.from(
  document.querySelectorAll('#shop-menu .item-card'),
).map((c) => ({ row: c.dataset.shopRow, locked: c.dataset.locked === '1',
  price: (c.querySelector('.price') || {}).textContent })));

check('walking up to Maren opens the shop', await walkToMaren());

// ---- 1. what a new child sees ---------------------------------------------
const before = await readCards();
const open1 = before.filter((c) => !c.locked).map((c) => c.row);
const wrapped1 = before.filter((c) => c.locked).map((c) => c.row);
check('the whole ladder is on the counter, none of it hidden', before.length === 8,
  { rows: before.length });
check('tier 1 is on the shelf', open1.join(',') === 'potion,dagger_a,sword_b,shield_a', open1);
check('tier 2 is wrapped, not missing',
  wrapped1.join(',') === 'spear_a,shield_c,sword_d,hammer_a', wrapped1);
check('a wrapped row shows a lock instead of a price',
  before.filter((c) => c.locked).every((c) => /🔒/.test(c.price)));

// ---- 2. a wrapped row cannot be bought, with the shards in hand ------------
await page.evaluate(() => { window.__game.state.shards = 999; });
await closeShop();
await walkToMaren();
const buy = async (row) => {
  const card = page.locator(`#shop-menu .item-card[data-shop-row="${row}"]`);
  // A row that is not on the counter at all must READ as a failure rather than
  // throw a locator timeout thirty seconds later with no name on it.
  if (await card.count()) await card.dispatchEvent('pointerdown');
  else check(`the ${row} row is on the counter`, false);
  await frames(4);
  return page.evaluate(() => ({ shards: window.__game.state.shards,
    gear: window.__game.state.inventory.gear.slice() }));
};
const afterLocked = await buy('hammer_a');
check('999 shards do not buy a wrapped hammer',
  afterLocked.shards === 999 && !afterLocked.gear.includes('hammer_a'), afterLocked);

// ---- 3. an unwrapped row still sells --------------------------------------
const afterOpen = await buy('sword_b');
check('the Ember Blade on the open shelf still sells',
  afterOpen.shards === 909 && afterOpen.gear.includes('sword_b'), afterOpen);

// ---- 4. Stoneroot unwraps the second shelf --------------------------------
await closeShop();
const midFlip = await page.evaluate(() => window.__game.WS.get('stone', 'restored'));
check('Stoneroot was NOT healed for any of the above', midFlip === false);

await page.evaluate(() => { window.__game.WS.set('stone', 'restored'); });
check('the shop re-opens on the walk back', await walkToMaren());
const after = await readCards();
check('nothing is wrapped once the Caverns sing',
  after.every((c) => !c.locked) && after.length === 7, // sword_b is sold now
  { rows: after.length, locked: after.filter((c) => c.locked).map((r) => r.row) });
check('the hammer sells once its shelf is open',
  (await buy('hammer_a')).gear.includes('hammer_a'));

// ---- the ladder itself, read from source ----------------------------------
const ladder = await page.evaluate(async () => {
  const { SHOP_STOCK } = await import('./js/items.js');
  return SHOP_STOCK.map((s) => ({ id: s.id || s.kind, tier: s.tier, price: s.price }));
});
const t1 = ladder.filter((s) => s.tier === 1 && s.id !== 'potion');
const t2 = ladder.filter((s) => s.tier === 2);
check('every row declares a tier', ladder.every((s) => s.tier >= 1), ladder);
check('tier 1 is the ≈60/90 rungs of the contract ladder',
  t1.every((s) => s.price < 100), t1.map((s) => s.price));
check('tier 2 is the ≈150/250/400 rungs',
  t2.every((s) => s.price >= 100), t2.map((s) => s.price));

console.log('');
if (errors.length) { console.log('✗ ' + errors.length + ' problem(s):\n  ' + errors.join('\n  ')); }
else console.log('ALL CLEAN');
await b.close();
process.exit(errors.length ? 1 : 0);
