// THE SHOP GROWS WITH THE WORLD — Maren's tier-2 stock arrives after Stoneroot.
//
// Nothing in tools/ measured the shop at all before this. The regression this
// is written to catch is the quiet one: a stock row losing (or gaining) its
// tier, so a five-year-old either sees the whole ladder in minute one — which
// is what the game shipped with — or a tier that never arrives at all and a
// promise the world never keeps.
//
// It drives the REAL path: walk Kael up to the mage and read the DOM she opens.
// The shop is proximity-triggered in main.js, so a rendered card is the only
// honest evidence; asserting against SHOP_STOCK in node would pass happily
// while showShop() ignored the field entirely.
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

// Walk to the mage and back out again. The trigger is edge-detected
// (`near && !shopWasNear`), so the shop only re-renders after a real departure —
// which is exactly what a child does, and what the after-Stoneroot half of this
// test needs.
const openShop = async () => {
  // Leave through the ✓ Done button, not by hiding the panel: _open() PAUSES
  // the world, so a panel hidden behind its own back leaves the game frozen and
  // the proximity edge never fires again. (It cost the first run of this file a
  // 20s timeout that looked like a shop bug and was a test bug.)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#shop-menu .menu-btn')].pop();
    if (btn && document.getElementById('shop-menu').style.display !== 'none') {
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
    window.__game.player.root.position.set(20, 0, 20);   // far away: drop shopWasNear
  });
  // WAIT FOR FRAMES, NOT FOR MILLISECONDS. `shopWasNear` only clears on a tick
  // of the real loop, and under SwiftShader a frame can outlast any wall-clock
  // guess — a 200ms sleep here failed two runs in three while the identical
  // file with a console listener attached (and therefore slower) passed.
  await page.evaluate(() => new Promise((r) => {
    let n = 0;
    const step = () => (++n >= 4 ? r() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }));
  await page.evaluate(() => {
    const g = window.__game, m = g.world.markers.shopSpot;
    g.player.root.position.set(m.x + 0.6, g.player.root.position.y, m.z + 0.6);
  });
  await page.waitForFunction(() => {
    const el = document.getElementById('shop-menu');
    return el && el.style.display !== 'none' && el.querySelectorAll('.item-card').length > 0;
  }, null, { timeout: 20000 });
  return page.evaluate(() => [...document.querySelectorAll('#shop-menu .item-card')].map((c) => ({
    id: c.dataset.shopId,
    tier: Number(c.dataset.shopTier),
    locked: c.classList.contains('locked'),
    text: c.textContent,
  })));
};

console.log('\n── before Stoneroot sings ─────────────────────────────────────');
await page.evaluate(() => { window.__game.state.shards = 999; });
const before = await openShop();
check('the shop opens when Kael walks up to Maren', before.length > 0, before.length);
const t1 = before.filter((c) => c.tier === 1), t2 = before.filter((c) => c.tier === 2);
check('every card declares a tier', before.every((c) => c.tier >= 1), before.map((c) => `${c.id}:${c.tier}`));
check('tier 1 is on sale', t1.length > 0 && t1.every((c) => !c.locked), t1.map((c) => c.id));
check('tier 2 is SHOWN — the ladder is a promise, not a secret', t2.length > 0, t2.map((c) => c.id));
// `every` on an empty array is true — the first run of this file reported "tier
// 2 is locked ✓" against no tier-2 cards at all. Length first, always.
check('tier 2 is locked', t2.length > 0 && t2.every((c) => c.locked), t2.map((c) => `${c.id}:${c.locked}`));
check('a locked card says what opens it', t2.length > 0 && t2.every((c) => /Stoneroot/i.test(c.text)),
  t2.map((c) => c.text.replace(/\s+/g, ' ').trim()));
if (!t2.length) { console.log('\n✗ no tier-2 stock — nothing further can be measured'); await b.close(); process.exit(1); }

// Tapping a locked card must not sell it. 999 shards is deliberate: the only
// thing that can refuse the sale here is the lock itself.
const lockedId = t2[0].id;
const tap = await page.evaluate(async (id) => {
  const g = window.__game;
  const card = document.querySelector(`#shop-menu .item-card[data-shop-id="${id}"]`);
  const shards = g.state.shards;
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  return { shards, after: g.state.shards, owns: g.state.inventory.gear.includes(id) };
}, lockedId);
check('tapping a locked card sells nothing', tap.after === tap.shards && !tap.owns, tap);

console.log('\n── after Stoneroot sings ──────────────────────────────────────');
await page.evaluate(() => window.__game.WS.set('stone', 'restored', true));
const after = await openShop();
const a2 = after.filter((c) => c.tier === 2);
check('tier 2 is on sale now', a2.length > 0 && a2.every((c) => !c.locked), a2.map((c) => `${c.id}:${c.locked}`));
check('the tier-2 stock is the same stock', a2.map((c) => c.id).sort().join() === t2.map((c) => c.id).sort().join(),
  { before: t2.map((c) => c.id), after: a2.map((c) => c.id) });

const buy = await page.evaluate(async (id) => {
  const g = window.__game;
  const card = document.querySelector(`#shop-menu .item-card[data-shop-id="${id}"]`);
  const shards = g.state.shards;
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  return { spent: shards - g.state.shards, owns: g.state.inventory.gear.includes(id) };
}, lockedId);
check('...and it can actually be bought', buy.owns && buy.spent > 0, buy);

// A sold item vanishes from the stock; the lock must not resurrect it.
const sold = await openShop();
check('a bought item leaves the stock', !sold.some((c) => c.id === lockedId), sold.map((c) => c.id));

console.log('\n── the potion is always for sale ──────────────────────────────');
check('the potion is tier 1 and unlocked', sold.some((c) => c.id === 'potion' && c.tier === 1 && !c.locked),
  sold.filter((c) => c.id === 'potion'));

await b.close();
if (errors.length) { console.log('\n✗ ' + errors.length + ' problem(s):\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('\nALL CLEAN');
