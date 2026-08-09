// MAREN'S SHELF GROWS — the shop ladder, gated by the spirits coming home.
//
// GAME-CONTRACT: "Shop ladder per region tier ~60/90/150/250/400. A kid who
// explores buys one big thing per region", and the region shipping checklist
// ships a "shop tier" per region. The code had one flat list: every weapon and
// shield in the game, 70 to 300 shards, on the shelf the first time a child
// walks into the Den — before they have beaten anything.
//
// Nothing in tools/ measured the shop at all, so this is written first. It
// drives the REAL path (walk to Maren, the proximity trigger opens the menu)
// and reads the REAL rendered cards, because the defect this guards against is
// a rung appearing at the wrong time on screen, not a wrong value in a table.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
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
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0;
  g.player.iframes = 99999;
  // Rich enough that AFFORDABILITY is never what hides a rung — this suite is
  // about which rungs EXIST. The first run of it read every card as dead
  // because a fresh profile has 0 shards and the card's handler captures
  // `afford` at render time, so nothing was buyable and nothing said so.
  g.state.shards = 900;
});

// --- get to the Den the way verify-den does (respawn, not teleport) --------
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => {
      const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true });
    }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};
if (!await go('den')) { check('the Den builds', false); await b.close(); process.exit(1); }
check('the Den builds', true);

// Walk to Maren and let the proximity trigger open the shop, exactly as a
// child does. The trigger is edge-detected (near && !wasNear), so the player
// has to be stood AWAY first — dropping straight onto the spot on the frame
// the room builds can miss the edge entirely.
const openShop = async () => {
  await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise((r) => requestAnimationFrame(r));
    g.player.root.position.set(0, g.player.root.position.y, 4);   // away from her cart
    for (let i = 0; i < 4; i++) await s();
    const m = g.world.markers.shopSpot;
    g.player.root.position.set(m.x, g.player.root.position.y, m.z);
    for (let i = 0; i < 6; i++) await s();
  });
  return page.locator('#shop-menu').isVisible();
};
// The menu PAUSES the world (menus._open → onPauseGame), so the proximity
// trigger cannot fire again until the shop is properly dismissed through its
// own "✓ Done" button. Hiding the panel by hand leaves the game paused and
// every later stage silently reads the first render's cards.
const closeShop = async () => {
  await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise((r) => requestAnimationFrame(r));
    const btn = document.querySelector('#shop-menu .menu-btn');
    if (btn) btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    for (let i = 0; i < 4; i++) await s();
    g.player.root.position.set(0, g.player.root.position.y, 4);   // step away
    for (let i = 0; i < 6; i++) await s();
  });
};

// Read the shelf off the DOM: what a child can buy, and what is shown as a
// promise for later. A locked rung must still be VISIBLE — an item that simply
// vanishes reads as a bug ("where did the hammer go"), and the ladder is the
// motivation.
const readShelf = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('#shop-menu .item-card')];
  const read = (c) => ({
    name: (c.querySelector('.nm') || {}).textContent || '',
    price: Number(((c.querySelector('.price') || {}).textContent || '').replace(/[^0-9]/g, '')) || 0,
    locked: c.classList.contains('locked'),
  });
  const all = cards.map(read);
  return { buyable: all.filter((c) => !c.locked), locked: all.filter((c) => c.locked) };
});

console.log('\n── a fresh child, nothing freed yet ────────────────────────────');
check('the shop opens by walking up to Maren', await openShop());
const t0 = await readShelf();
const names0 = t0.buyable.map((c) => c.name).sort();
check('only the starter rung is on the shelf', names0.length === 3, names0);
check('the starter rung is the potion, the Round Guard and the Swift Fang',
  JSON.stringify(names0) === JSON.stringify(['Healing Potion', 'Round Guard', 'Swift Fang']), names0);
check('the rest is shown as a promise, not hidden', t0.locked.length === 5,
  t0.locked.map((c) => c.name));
const top0 = Math.max(...t0.buyable.map((c) => c.price));
check('nothing over 80 shards before a single spirit is home', top0 <= 80, { top0 });

// A locked rung must not be purchasable — the card carries no handler at all.
const beforeBuy = await page.evaluate(() => ({ shards: window.__game.state.shards,
  gear: window.__game.state.inventory.gear.length }));
await page.evaluate(() => {
  window.__game.state.shards = 9999;
  const c = [...document.querySelectorAll('#shop-menu .item-card')].find((x) => x.classList.contains('locked'));
  if (c) c.dispatchEvent(new Event('pointerdown', { bubbles: true }));
});
const afterBuy = await page.evaluate(() => ({ shards: window.__game.state.shards,
  gear: window.__game.state.inventory.gear.length }));
check('tapping a locked rung buys nothing', afterBuy.gear === beforeBuy.gear, afterBuy);

console.log('\n── the shelf grows as the spirits come home ────────────────────');
const stage = async (region) => {
  await closeShop();
  if (region) await page.evaluate((r) => window.__game.WS.set(r, 'restored', true), region);
  if (!await openShop()) return null;
  return readShelf();
};
const ladder = [];
for (const [region, label] of [['ember', 'Ember Hollow'], ['stone', 'Stoneroot'],
  ['wild', 'Wild Woods'], ['frost', 'Frostpeak']]) {
  const s = await stage(region);
  if (!s) { check(`the shop still opens after ${label}`, false); break; }
  ladder.push({ after: label, buyable: s.buyable.length, locked: s.locked.length,
    top: Math.max(0, ...s.buyable.map((c) => c.price)),
    newly: s.buyable.map((c) => c.name) });
}
for (let i = 0; i < ladder.length; i++) {
  const prev = i === 0 ? { buyable: t0.buyable.length, top: top0 } : ladder[i - 1];
  check(`${ladder[i].after} adds stock and never removes any`,
    ladder[i].buyable > prev.buyable, { was: prev.buyable, now: ladder[i].buyable });
  check(`${ladder[i].after}'s new rung is the dearest so far`,
    ladder[i].top >= prev.top, { was: prev.top, now: ladder[i].top });
}
const last = ladder[ladder.length - 1];
check('every rung is on the shelf once the fifth region is free',
  !!last && last.locked === 0 && last.buyable === 8, last);

console.log('\n── and buying still works ─────────────────────────────────────');
const bought = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  const before = g.state.shards;
  const card = [...document.querySelectorAll('#shop-menu .item-card')]
    .find((c) => (c.querySelector('.nm') || {}).textContent === 'Swift Fang');
  if (!card) return { found: false };
  card.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  for (let i = 0; i < 12; i++) await s();
  const gone = ![...document.querySelectorAll('#shop-menu .item-card .nm')]
    .some((n) => n.textContent === 'Swift Fang');
  return { found: true, before, after: g.state.shards, owns: g.state.inventory.gear.includes('dagger_a'), gone };
});
check('a real purchase deducts the price', bought.found && bought.before - bought.after === 80, bought);
check('the bought gear is owned and leaves the stock', bought.owns && bought.gone, bought);

console.log('\n── the measured ladder ────────────────────────────────────────');
console.log('  start            ', top0, 'shards top rung,', t0.buyable.length, 'buyable,', t0.locked.length, 'promised');
for (const r of ladder) console.log(`  after ${r.after.padEnd(12)}`, r.top, 'shards top rung,', r.buyable, 'buyable,', r.locked, 'promised');

console.log('');
if (errors.length) console.log('✗ ' + errors.length + ' problem(s):\n  ' + errors.join('\n  '));
else console.log('ALL CLEAN');
await b.close();
process.exit(errors.length ? 1 : 0);
