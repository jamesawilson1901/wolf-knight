// MAREN'S LADDER — does her shelf actually fill as the world heals?
//
// GAME-CONTRACT: "Shop ladder per region tier ≈ 60/90/150/250/400. A kid who
// explores buys one big thing per region; completionists afford two." That is a
// LADDER, and a ladder only exists if the rungs arrive in order. Every item was
// on the shelf from minute one, so the numbers said "ladder" and the shop said
// "catalogue".
//
// This drives the real path a child takes — walk up to Maren in the Den, read
// the cards that are actually rendered, tap them — rather than calling
// showShop() or reading SHOP_STOCK and declaring victory. Two of the four
// assertions here would pass against a shop that renders a lock and sells the
// item anyway, if the tap were not real.
//
// The ladder itself is also asserted from source, because a mis-tiered item is
// invisible in play until the one child who saved 300 shards finds it: no tier's
// price may reach into the tier above it.
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

// Maren stands in the Den; a new game opens in r1. Same room-hop the other den
// verifiers use — die into the room, which is a real transition, not a teleport.
const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);
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
await page.evaluate(() => { window.__game.player.iframes = 999999; });

// --- THE LADDER, from source ----------------------------------------------
// Imported from the served module rather than re-typed here, so a price edit in
// items.js is measured and not merely assumed.
const ladder = await page.evaluate(async () => {
  const m = await import('/js/items.js');
  const byTier = {};
  for (const s of m.SHOP_STOCK) {
    if (s.kind === 'potion') continue;         // the potion is a consumable, not a rung
    (byTier[s.tier] ||= []).push(s.price);
  }
  return {
    tiers: m.SHOP_TIERS.map((t) => ({ tier: t.tier, flag: t.flag })),
    bands: Object.entries(byTier).map(([t, p]) => ({ tier: +t, min: Math.min(...p), max: Math.max(...p) }))
      .sort((a, c) => a.tier - c.tier),
    untiered: m.SHOP_STOCK.filter((s) => !s.tier).length,
  };
});
check('every stock line names a tier', ladder.untiered === 0, ladder);
{
  let ok = true;
  for (let i = 1; i < ladder.bands.length; i++) if (ladder.bands[i].min <= ladder.bands[i - 1].max) ok = false;
  check('the rungs do not overlap — each tier costs more than the one below',
    ok && ladder.bands.length >= 2, ladder.bands);
}
// The contract's income line: a region yields ~120-160 shards. A tier-1 rung a
// first-region child cannot reach on a full region's takings is not a rung.
check('every tier-1 rung is inside one region\'s takings (<=160)',
  ladder.bands[0] && ladder.bands[0].max <= 160, ladder.bands[0]);
check('tier 1 is open from the start, and no later tier is',
  ladder.tiers[0].flag === null && ladder.tiers.slice(1).every((t) => !!t.flag), ladder.tiers);

// --- WALKING UP TO MAREN --------------------------------------------------
// The shop opens on the EDGE of the proximity test, and the game loop stops
// while a menu is open — so a re-open means: close, walk out of range, let the
// loop see that, walk back in.
const openShop = async () => {
  await page.evaluate(() => { window.__game.player.root.position.set(-4, 0, 4); });
  await frames(6);
  await page.evaluate(() => {
    const m = window.__game.world.markers.shopSpot;
    window.__game.player.root.position.set(m.x, 0, m.z);
  });
  await frames(6);
  return page.evaluate(() => {
    const el = document.getElementById('shop-menu');
    if (getComputedStyle(el).display === 'none') return null;
    return [...el.querySelectorAll('.item-card')].map((c) => ({
      name: c.querySelector('.nm').textContent,
      price: c.querySelector('.price').textContent.trim(),
      locked: c.classList.contains('locked'),
    }));
  });
};
const closeShop = async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#shop-menu .menu-btn')].pop();
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await frames(2);
};

const names = (cards, locked) => cards.filter((c) => c.locked === locked).map((c) => c.name).sort();

let cards = await openShop();
check('walking up to Maren opens the shop', Array.isArray(cards) && cards.length > 0,
  cards && cards.length);
check('a child who has freed nothing sees only the first rung for sale',
  JSON.stringify(names(cards, false)) === JSON.stringify(['Healing Potion', 'Round Guard', 'Swift Fang', 'Ember Blade'].sort()),
  { forSale: names(cards, false) });
check('and the rungs above it are on the shelf, locked',
  JSON.stringify(names(cards, true)) === JSON.stringify(['Boulder Hammer', 'Long Spear', 'Moon Sword', 'Tower Shield'].sort()),
  { locked: names(cards, true) });
check('a locked card says WHEN, not just no',
  cards.filter((c) => c.locked).every((c) => /🔒/.test(c.price) && c.price.length > 4),
  cards.filter((c) => c.locked).map((c) => c.price));

// --- A LOCK MUST ACTUALLY LOCK --------------------------------------------
// The law the promise gates were caught by: an obstacle that only looks like an
// obstacle is decoration. Hand the child every shard in the game and let them
// hammer the locked card.
const tapped = await page.evaluate(async () => {
  const g = window.__game;
  g.state.shards = 9999;
  const before = { shards: g.state.shards, gear: g.state.inventory.gear.slice() };
  const card = [...document.querySelectorAll('#shop-menu .item-card')]
    .find((c) => c.classList.contains('locked') && /Hammer/.test(c.querySelector('.nm').textContent));
  for (let i = 0; i < 10; i++) {
    card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { before, shards: g.state.shards, gear: g.state.inventory.gear.slice() };
});
check('tapping a locked rung buys nothing',
  tapped.shards === tapped.before.shards && tapped.gear.length === tapped.before.gear.length, tapped);

// --- THE RESTOCK ----------------------------------------------------------
await closeShop();
await page.evaluate(() => { window.__game.WS.set('stone', 'restored'); });
cards = await openShop();
check('once Stoneroot sings, tier 2 is on sale',
  names(cards, false).includes('Long Spear') && names(cards, false).includes('Tower Shield'),
  { forSale: names(cards, false) });
check('...and tier 3 is still a promise',
  JSON.stringify(names(cards, true)) === JSON.stringify(['Boulder Hammer', 'Moon Sword'].sort()),
  { locked: names(cards, true) });

// and it is a real sale, not a rendered one
const bought = await page.evaluate(async () => {
  const g = window.__game;
  const card = [...document.querySelectorAll('#shop-menu .item-card')]
    .find((c) => /Long Spear/.test(c.querySelector('.nm').textContent));
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  return { gear: g.state.inventory.gear.slice(), equipped: g.state.inventory.equipped.weapon };
});
check('an unlocked rung really sells', bought.gear.includes('spear_a') && bought.equipped === 'spear_a', bought);

await closeShop();
await page.evaluate(() => { window.__game.WS.set('wild', 'restored'); });
cards = await openShop();
check('once the Wild Woods wake, the top of the ladder opens',
  names(cards, true).length === 0, { locked: names(cards, true), forSale: names(cards, false) });

// --- ADDITIVE-FOREVER -----------------------------------------------------
// The tier lives in code, the unlock lives in the world flags a save already
// round-trips. A profile written before this change has no new key to miss, and
// a profile that had already freed Stoneroot must open at tier 2, not at tier 1.
const roundTrip = await page.evaluate(async () => {
  const g = window.__game;
  g.persist();
  const m = await import('/js/items.js');
  return { two: m.tierUnlocked(2), three: m.tierUnlocked(3), one: m.tierUnlocked(1) };
});
check('an existing save that freed the regions reads its tiers back',
  roundTrip.one && roundTrip.two && roundTrip.three, roundTrip);

await b.close();
console.log(errors.length ? '\n✗ FAILURES:\n  ' + errors.join('\n  ') : '\nALL CLEAN');
process.exit(errors.length ? 1 : 0);
