// MAREN'S STOCK GROWS WITH THE WORLD.
//
// The shop was one flat list: every weapon in the game, on sale at the Den
// before a child had walked into Ember. GAME-CONTRACT's economy line asks for
// a ladder — "shop ladder per region tier ~ 60/90/150/250/400, a kid who
// explores buys one big thing per region" — and BUILDLOG's queue asks for the
// concrete first rung of it: "Maren tier-2 stock after Stoneroot".
//
// This drives the REAL shop: it walks a child into Maren's ring the way the
// game opens it (main.js watches shopSpot every frame), reads the cards out of
// the DOM, then heals regions one at a time and re-reads. Reading SHOP_STOCK
// out of the module would prove the data and none of the wiring.
//
// The assertion that matters in six months is the last one: an old profile
// that already OWNS a tier-4 weapon must keep it. The tier gate decides what
// Maren offers, never what a child already has — the additive-forever law
// applies to gear as much as to save fields.
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
  g.state.settings.greybox = false;
  g.player.iframes = 999999;
});

// Get into the Den the way the other verifiers do — death respawn, retried,
// because a room build under SwiftShader can take a while.
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

// OPEN THE SHOP THE WAY THE GAME OPENS IT. main.js:1662 watches the distance
// to world.markers.shopSpot every frame and opens on the rising edge, so the
// child has to LEAVE the ring before it will open again — hence the walk-away
// between reads. Calling menus.showShop() directly would skip the one piece of
// wiring most likely to break.
// Closing it has to go through the '✓ Done' button, not through display:none.
// `_open` calls onPauseGame() and main.js skips the whole world update while a
// menu is up, so hiding the panel by hand leaves the game FROZEN: the player
// never moves, the proximity edge never resets, and every later read returns
// the render before it. That cost a full suite run to find.
const readShop = async () => {
  await page.evaluate(() => {
    const done = document.querySelector('#shop-menu .menu-btn');
    if (done) done.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await frames(4);
  await page.evaluate(() => {
    const p = window.__game.player.root.position;
    p.x = -14; p.z = 10;                       // well outside the ring: reset the edge
  });
  await frames(4);
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.world.markers.shopSpot;
    g.player.root.position.x = s.x;
    g.player.root.position.z = s.z;
  });
  await frames(6);
  return page.evaluate(() => {
    const el = document.getElementById('shop-menu');
    const open = el && getComputedStyle(el).display !== 'none';
    const names = [...el.querySelectorAll('.item-card .nm')].map((n) => n.textContent.trim());
    const locked = [...el.querySelectorAll('.item-card.locked .nm')].map((n) => n.textContent.trim());
    const teaser = el.querySelector('.shop-teaser');
    return { open, names, locked, teaser: teaser ? teaser.textContent.trim() : null };
  });
};

const heal = (region) => page.evaluate((r) => {
  window.__game.WS.set(r, 'restored');
}, region);
const shards = (n) => page.evaluate((v) => { window.__game.state.shards = v; }, n);

await shards(9999); // affordability must never be what hides a card

// ---- Tier 1: the world is untouched -------------------------------------
const t1 = await readShop();
check('walking into Maren opens the shop', t1.open);
check('tier 1 offers the potion, the Round Guard and the Swift Fang',
  ['Healing Potion', 'Round Guard', 'Swift Fang'].every((n) => t1.names.includes(n)), t1.names);
const later = ['Ember Blade', 'Long Spear', 'Tower Shield', 'Moon Sword', 'Boulder Hammer'];
check('nothing from a later tier is on sale yet',
  later.every((n) => !t1.names.includes(n)),
  later.filter((n) => t1.names.includes(n)));
check('a teaser says stock is coming and names the region', !!t1.teaser, t1.teaser);

// ---- Tier 2: Stoneroot sings again --------------------------------------
await heal('stone');
const t2 = await readShop();
check('healing Stoneroot puts tier 2 on the shelf',
  ['Ember Blade', 'Long Spear'].every((n) => t2.names.includes(n)), t2.names);
check('tier 1 stock is still there', t2.names.includes('Round Guard'));
check('tier 3 and 4 stay back',
  ['Tower Shield', 'Moon Sword', 'Boulder Hammer'].every((n) => !t2.names.includes(n)));

// ---- Tier 3: the Wild Woods bloom ---------------------------------------
await heal('wild');
const t3 = await readShop();
check('healing the Wild Woods puts tier 3 on the shelf',
  ['Tower Shield', 'Moon Sword'].every((n) => t3.names.includes(n)), t3.names);
check('the Boulder Hammer stays back', !t3.names.includes('Boulder Hammer'));

// ---- Tier 4: Frostpeak's storm lifts ------------------------------------
await heal('frost');
const t4 = await readShop();
check('healing Frostpeak puts the Boulder Hammer on the shelf', t4.names.includes('Boulder Hammer'));
// EVERY LINE, NOT A MAGIC NUMBER.
//
// This asserted `names.length === 8`, so the day the weapon rack grew from
// seven items to twenty-three it went red for a shop that was working
// perfectly. A count is a restatement of the stock table, not a fact about it —
// and it says nothing about WHICH line went missing. Ask the table.
const stockAll = await page.evaluate(async () => {
  const items = await import('/js/items.js');
  const { CONFIG } = await import('/js/config.js');
  const top = Math.max(...CONFIG.SHOP.TIERS.map((t) => t.tier));
  return { upTo4: items.SHOP_STOCK.filter((s) => (s.tier || 1) <= 4)
    .map((s) => s.kind === 'potion' ? s.name
      : (items.WEAPONS[s.id] || items.SHIELDS[s.id] || items.ARMOURS[s.id] || {}).name),
    top, tiers: CONFIG.SHOP.TIERS.map((t) => t.tier) };
});
const missing = stockAll.upTo4.filter((n) => n && !t4.names.includes(n));
check('every line up to tier 4 is on the shelf once Frostpeak is healed',
  missing.length === 0, { missing, onShelf: t4.names.length });

// AND EVERY RUNG A LINE NAMES ACTUALLY EXISTS. Five items were shipped on a
// tier 5 when the ladder stopped at four — in the table, and unreachable.
const orphanTier = await page.evaluate(async () => {
  const items = await import('/js/items.js');
  const { CONFIG } = await import('/js/config.js');
  const rungs = new Set(CONFIG.SHOP.TIERS.map((t) => t.tier));
  return items.SHOP_STOCK.filter((s) => !rungs.has(s.tier || 1))
    .map((s) => s.id || s.name);
});
check('no stock line sits on a rung the ladder does not have',
  orphanTier.length === 0, { orphanTier });
// THE LADDER IS DONE WHEN THE LAST RUNG OPENS, NOT WHEN FROSTPEAK DOES.
// This checked for a teaser at tier 4 and called that "done" — true only while
// four was the last rung. Heal the Vale and ask again.
await heal('vale');
const t5 = await readShop();
check('healing the Vale puts the last rung on the shelf',
  ['Moonwood Staff', 'Stormfang', 'Moonguard', 'Petra\u2019s Maul', 'Moonplate']
    .every((n) => t5.names.includes(n)), t5.names);
check('no teaser is left when the ladder is done', !t5.teaser, t5.teaser);

// ---- Buying still works, through the real card ---------------------------
await shards(500);
const before = await page.evaluate(() => window.__game.state.shards);
await page.evaluate(() => {
  const el = document.getElementById('shop-menu');
  const card = [...el.querySelectorAll('.item-card')]
    .find((c) => c.querySelector('.nm') && c.querySelector('.nm').textContent.trim() === 'Swift Fang');
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await frames(20);
const bought = await page.evaluate(() => ({
  shards: window.__game.state.shards,
  owns: window.__game.state.inventory.gear.includes('dagger_a'),
}));
check('buying a card still spends shards and grants the gear',
  bought.owns && bought.shards === before - 80, { before, ...bought });
const afterBuy = await readShop();
check('a bought weapon leaves the shelf', !afterBuy.names.includes('Swift Fang'));

// ---- THE OLD-SAVE RULE ---------------------------------------------------
// A profile from before the ladder existed may own anything. The tier gate
// decides what MAREN OFFERS; it must never reach into a child's inventory.
const kept = await page.evaluate(async () => {
  const g = window.__game;
  g.state.flags.world = {};                    // nothing healed: back to tier 1
  g.state.inventory.gear.push('hammer_a');
  g.state.inventory.equipped.weapon = 'hammer_a';
  g.persist();
  // a REAL round-trip through localStorage, not a re-read of live state
  const raw = JSON.parse(localStorage.getItem('wolfknight:save:' + g.state.profileId));
  g.applySave(g.state.profileId, g.state.profileName, raw);
  return {
    owns: g.state.inventory.gear.includes('hammer_a'),
    equipped: g.state.inventory.equipped.weapon,
    healed: Object.keys(g.state.flags.world || {}).length,
  };
});
check('a tier-4 weapon owned on an old save survives a reload at tier 1',
  kept.owns && kept.equipped === 'hammer_a', kept);
const t6 = await readShop();
check('...and Maren does not offer it back', !t6.names.includes('Boulder Hammer'), t6.names);

console.log('\n' + (errors.length ? `✗ ${errors.length} FAILED: ${errors.join(', ')}` : 'ALL CLEAN'));
await b.close();
process.exit(errors.length ? 1 : 0);
