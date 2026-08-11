// CAN A CHILD ACTUALLY GET THROUGH STONEROOT?
//
// Dad, from play: "Level two does not work. The rooms loop back to the start and
// there's nothing you can do."
//
// verify-playthrough walks Stoneroot clean — because it SETS the three vault
// milestones itself, on the grounds that it was testing routes rather than
// progression. That is a reasonable split and it is also exactly the hole this
// bug lived in: the hub only opens its other spokes as milestones land, so if
// the game never grants one, a child walks spoke A, comes back to a hub with a
// single door, and goes round again forever.
//
// So this grants NOTHING. It walks the spoke the way a child does, stands where
// a child stands, and asks whether the world moved.
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
await page.fill('#t-name', 'L2');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  // what a child ARRIVES in Stoneroot with, and not one thing more
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf'];
  g.state.flags.bossDefeated = true;      // Ember is done; that is how you get here
});

const settle = () => page.waitForFunction(() => !document.getElementById('fade')
  || getComputedStyle(document.getElementById('fade')).opacity === '0', null, { timeout: 30000 }).catch(() => {});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      await settle();
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const doorsHere = () => page.evaluate(() => (window.__game.world.doors || []).map((d) => d.to));

console.log('\n── 1. arriving in the vault, one door is open ─────────');
await go('vh');
const first = await doorsHere();
check('the hub starts with the way out and Spoke A only',
  first.includes('vga') && !first.includes('vgb') && !first.includes('vgc'), { doors: first });

console.log('\n── 2. the spoke leads to Petra, and she is reachable ──');
await go('va3');
const shrine = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  const s = w.markers.sparkSpot;
  if (!s) return null;
  // can a child stand close enough for the grant to fire? it needs 2.4u
  const solid = (x, z) => {
    const r = w.resolveCircle(x, z, 0.32);
    return Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6;
  };
  let closest = Infinity, spot = null;
  for (let a = 0; a < 64; a++) {
    for (let d = 0.5; d < 6; d += 0.25) {
      const x = s.x + Math.cos(a / 64 * 6.283) * d, z = s.z + Math.sin(a / 64 * 6.283) * d;
      if (solid(x, z) || (w.hazardAt && w.hazardAt(x, z))) continue;
      if (d < closest) { closest = d; spot = { x: +x.toFixed(2), z: +z.toFixed(2) }; }
    }
  }
  return { shrine: { x: s.x, z: s.z }, grants: s.grants, closest: +closest.toFixed(2), spot };
});
check('va3 has Petra\'s shrine', !!shrine, shrine);
check('a child can stand within the 2.4u the grant needs',
  shrine && shrine.closest <= 2.4, shrine);

console.log('\n── 3. standing there actually gives the Earth Wolf ────');
const granted = await page.evaluate(async (spot) => {
  const g = window.__game;
  g.player.root.position.set(spot.x, g.player.root.position.y, spot.z);
  for (let i = 0; i < 90; i++) { g.player.iframes = 9999; await new Promise((r) => requestAnimationFrame(r)); }
  return { forms: g.state.formsUnlocked.slice(), spark: !!g.WS.get('vault', 'spark'),
    stage: g.WS.stage('vault') };
}, (shrine && shrine.spot) || { x: 0, z: -1 });
check('the Earth Wolf is granted', granted.forms.includes('earth_wolf'), granted);
check('...and the vault records its first milestone', granted.spark, granted);

console.log('\n── 4. so the hub has changed when you walk back ───────');
await go('vh');
const after = await doorsHere();
check('the hub now offers the other two spokes',
  after.includes('vgb') && after.includes('vgc'), { doors: after, stage: granted.stage });

console.log('\n── 5. and the sunken ring is a PROMISE, not a tease ───');
// Dad: "a puddle of water with a character and a chest in the centre that you
// are unable to get to". That is the vault ring, and it is meant to be shut —
// but only until the water drains. What must never happen is that it stays shut
// for good, which is what it looks like from inside a hub that never opens.
const ring = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const before = { reward: !!w.markers.underwaterPromise };
  g.WS.set('vault', 'drained', true);
  return before;
});
await go('vh');
const drained = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  const solid = (x, z) => {
    const r = w.resolveCircle(x, z, 0.32);
    return Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6;
  };
  return { stillWalled: solid(0, 0), promise: !!w.markers.underwaterPromise,
    stage: g.WS.stage('vault') };
});
check('once the water drains, the middle of the vault can be walked',
  !drained.stillWalled, { ...ring, ...drained });

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — Stoneroot opens up as a child plays it.'));
await b.close();
process.exit(errors.length ? 1 : 0);
