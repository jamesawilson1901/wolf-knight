// MAREN'S CART GROWS WITH THE WORLD.
//
// BUILDLOG v2.2.6's QUEUED NEXT list: "Maren tier-2 stock after Stoneroot".
// Until now every weapon and shield in the game sat on her cart from the first
// minute — a five-year-old with 15 shards reading eight cards, six of which are
// years of saving away, and no sign that the shop is ever going to change.
//
// The rule this asserts, in the child's terms: what is on the cart today is
// what the Ember ladder can afford; beating Stoneroot brings the rest, and the
// cart SAYS SO while they are still locked.
//
// Everything here goes through the real paths — walk into Maren's radius to
// open the shop, tap a card to buy, tap Done to leave, walk out and back to
// reopen. Calling menus.showShop() directly would pass with the trigger broken,
// and `menus` is not even on the debug hook, which is the point.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// The split, stated here as well as in js/items.js, so a change to one without
// the other fails loudly instead of drifting.
const TIER1 = ['Healing Potion', 'Round Guard', 'Swift Fang', 'Ember Blade'];
const TIER2 = ['Long Spear', 'Tower Shield', 'Moon Sword', 'Boulder Hammer'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 25000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SHOP');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.player.iframes = 999999;
});

const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);

// The Den, reached the way the other den verifiers reach it.
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

// WALK UP TO MAREN. The marker is the room's own, not a number copied in here:
// if the cart moves, the walk moves with it.
const openShop = async () => {
  await page.evaluate(() => { window.__game.player.root.position.set(-4, 0, 6); });
  await frames(6);
  await page.evaluate(() => {
    const g = window.__game, s = g.world.markers.shopSpot;
    g.player.root.position.set(s.x, 0, s.z);
  });
  await frames(6);
  return page.evaluate(() => getComputedStyle(document.getElementById('shop-menu')).display !== 'none');
};
const readShop = () => page.evaluate(() => {
  const el = document.getElementById('shop-menu');
  return {
    open: getComputedStyle(el).display !== 'none',
    names: [...el.querySelectorAll('.item-card .nm')].map((n) => n.textContent.trim()),
    note: (el.querySelector('#shop-note') || {}).textContent || null,
  };
});
const closeShop = async () => {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#shop-menu .menu-btn')];
    const done = btns[btns.length - 1];
    done.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await frames(4);
};

check('walking up to Maren opens the shop', await openShop());
const before = await readShop();

const missing1 = TIER1.filter((n) => !before.names.includes(n));
const leaked2 = TIER2.filter((n) => before.names.includes(n));
check('the Ember ladder is on the cart from the start', missing1.length === 0,
  { onSale: before.names, missing: missing1 });
check('nothing from tier 2 is on sale before Stoneroot', leaked2.length === 0,
  { leaked: leaked2 });
check('and the cart says more is coming', !!before.note, { note: before.note });
check('the note names what unlocks it', !!before.note && /Stoneroot/i.test(before.note),
  { note: before.note });

// THE NOTE COSTS HEIGHT, and this screen is 360px tall on a phone. Measured
// rather than eyeballed: the panel must not overflow its own scroll box, or the
// Done button is the thing that goes off the bottom.
const fit = await page.evaluate(() => {
  const el = document.getElementById('shop-menu');
  const done = [...el.querySelectorAll('.menu-btn')].pop().getBoundingClientRect();
  return { scrollH: el.scrollHeight, clientH: el.clientHeight, viewH: window.innerHeight,
    doneBottom: Math.round(done.bottom) };
});
check('the shop still fits a phone screen with the note on it',
  fit.scrollH <= fit.clientH && fit.doneBottom <= fit.viewH, fit);

// BUYING STILL WORKS — a filter over the stock list is exactly the change that
// can hand the click handler the wrong row.
await page.evaluate(() => { window.__game.state.shards = 500; });
await closeShop();
check('walking away and back reopens it', await openShop());
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#shop-menu .item-card')];
  const card = cards.find((c) => c.querySelector('.nm').textContent.trim() === 'Swift Fang');
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await frames(20);
const bought = await page.evaluate(() => ({
  gear: window.__game.state.inventory.gear.slice(),
  shards: window.__game.state.shards,
  equipped: window.__game.state.inventory.equipped.weapon,
}));
check('tapping a card still buys the thing on it',
  bought.gear.includes('dagger_a') && bought.shards === 420 && bought.equipped === 'dagger_a', bought);
const afterBuy = await readShop();
check('a sold item leaves the cart', !afterBuy.names.includes('Swift Fang'), { onSale: afterBuy.names });

// STONEROOT SINGS.
await closeShop();
await page.evaluate(() => { window.__game.WS.set('stone', 'restored'); });
check('the shop reopens after Stoneroot', await openShop());
const after = await readShop();
const missing2 = TIER2.filter((n) => !after.names.includes(n));
check('tier 2 arrives once Stoneroot is restored', missing2.length === 0,
  { onSale: after.names, missing: missing2 });
check('and the note is gone, because nothing is held back now', !after.note,
  { note: after.note });

// THE SAVE ROUND-TRIPS. Additive-forever: the tier is derived from world state
// that was already persisted, so there is nothing new in the file — this proves
// it rather than assuming it.
const persisted = await page.evaluate(() => {
  window.__game.persist();
  const raw = Object.keys(localStorage).filter((k) => k.includes('wolf') || k.includes('save'));
  return raw.map((k) => (localStorage.getItem(k) || '').includes('"stone"')).some(Boolean);
});
check('the unlock rides world state that is already saved', persisted === true);

console.log(errors.length ? '\n✗ ' + errors.length + ' problem(s):\n  ' + errors.join('\n  ')
  : '\nALL CLEAN');
await b.close();
process.exit(errors.length ? 1 : 0);
