// THE SHOP LADDER — does Maren's stall actually grow?
//
// The stock table is data, so it is easy to "fix" a tier by editing a number
// and never noticing that the shop renders every row regardless. This drives
// the REAL path a child takes: walk up to Maren in the Den until the trigger
// in main.js fires, and read the cards that are actually in the DOM.
//
// Three things have to hold, and the middle one is the whole item:
//   1. a fresh save sees the opening stock and NOT the tier-2 crate
//   2. freeing Stoneroot puts the tier-2 crate on the table
//   3. every row in SHOP_STOCK is reachable from some tier — a typo in a
//      `tier:` must not quietly delete a weapon from the game
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

// Same room-hop the other Den verifiers use: die into the target room.
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

// Walk to Maren the way a child does. The trigger is EDGE-triggered
// (`near && !shopWasNear`), so every visit must start from outside the ring.
// Maren's stall has colliders, so a single hand-picked stand-point can be
// shoved back out of the ring by the solver. Try the ring from several sides
// and keep the one the world actually lets Kael stand on.
const openShop = async () => {
  let ok = false;
  for (const a of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]) {
    ok = await page.evaluate(async (ang) => {
      const g = window.__game, s = g.world.markers.shopSpot;
      const step = () => new Promise((r) => requestAnimationFrame(r));
      const y = g.player.root.position.y;
      g.player.root.position.set(s.x, y, s.z - 6); // outside the 1.7u ring
      for (let i = 0; i < 4; i++) await step();
      const p = g.world.resolveCircle(s.x + Math.cos(ang) * 1.1, s.z + Math.sin(ang) * 1.1, 0.32);
      g.player.root.position.set(p.x, y, p.z);
      for (let i = 0; i < 4; i++) await step();
      const dx = g.player.root.position.x - s.x, dz = g.player.root.position.z - s.z;
      return dx * dx + dz * dz < 1.7 * 1.7;
    }, a);
    if (ok) break;
  }
  if (!ok) { check('Kael can stand close enough to Maren to open the shop', false); }
  await page.waitForSelector('#shop-menu', { state: 'visible', timeout: 15000 });
  return page.evaluate(() => {
    const el = document.getElementById('shop-menu');
    return {
      names: [...el.querySelectorAll('.item-card .nm')].map((n) => n.textContent),
      promise: el.querySelector('#shop-promise') ? el.querySelector('#shop-promise').textContent : null,
    };
  });
};
const closeShop = async () => {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#shop-menu .menu-btn')];
    btns[btns.length - 1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForSelector('#shop-menu', { state: 'hidden', timeout: 10000 });
};

// What the tables SAY, read out of the live modules, so the assertions below
// name real stock rather than a copy of it that can drift.
const ladder = await page.evaluate(async () => {
  const it = await import('./js/items.js');
  const nameOf = (s) => s.kind === 'potion' ? s.name
    : (s.kind === 'weapon' ? it.WEAPONS[s.id].name : it.SHIELDS[s.id].name);
  return {
    tiers: it.SHOP_TIERS.map((t) => t.tier),
    stock: it.SHOP_STOCK.map((s) => ({ name: nameOf(s), tier: s.tier || 1 })),
  };
});
const tier1 = ladder.stock.filter((s) => s.tier === 1).map((s) => s.name);
const tier2 = ladder.stock.filter((s) => s.tier === 2).map((s) => s.name);

console.log('\n── a fresh save: the opening stock only ────────────────────────');
const before = await openShop();
check('Stoneroot is not restored yet',
  await page.evaluate(() => !window.__game.WS.get('stone', 'restored')));
check('every tier-1 item is on the table',
  tier1.every((n) => before.names.includes(n)), { want: tier1, got: before.names });
check('no tier-2 item is on the table',
  !tier2.some((n) => before.names.includes(n)), { hidden: tier2, got: before.names });
check('Maren promises the locked crate', !!before.promise, before.promise);
await closeShop();

console.log('\n── Stoneroot sings, and the crate opens ────────────────────────');
await page.evaluate(() => window.__game.WS.set('stone', 'restored', true));
const after = await openShop();
check('every tier-2 item is now on the table',
  tier2.every((n) => after.names.includes(n)), { want: tier2, got: after.names });
check('the tier-1 stock did not disappear with it',
  tier1.every((n) => after.names.includes(n)), { want: tier1, got: after.names });
check('the promise line is gone once nothing is locked', after.promise === null, after.promise);
check('the shop grew rather than swapped', after.names.length > before.names.length,
  { before: before.names.length, after: after.names.length });
await closeShop();

console.log('\n── no row is stranded on a tier that never opens ───────────────');
const orphans = ladder.stock.filter((s) => !ladder.tiers.includes(s.tier));
check('every stock row belongs to a declared tier', orphans.length === 0, orphans);

if (errors.length) console.log('\n' + errors.length + ' problem(s):\n  ' + errors.join('\n  '));
else console.log('\nALL CLEAN');
await b.close();
process.exit(errors.length ? 1 : 0);
