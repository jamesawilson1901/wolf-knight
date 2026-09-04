// A BLIP IS NOT A BROKEN GAME.
//
// Dad opened v3.106.0 on a tablet and got a dead end: "Something went wrong:
// Failed to load ./assets/loot/treasure/coin-gold-a.glb". The file was present,
// tracked, precached and served — nothing was missing. What happened was that
// ONE request failed, once, and the game treated that as fatal.
//
// It had a retry the whole time. js/assets.js retried the load and would have
// succeeded; but THREE's LoadingManager fires onError the instant any single
// request fails, and main.js hung the fatal error screen on that. So the screen
// went up over a load that then worked. On a phone joining wifi — or on the
// first open of a new version, when the service worker is pulling three hundred
// files and the game's own requests are queued behind them — that is not a rare
// event.
//
// This suite injects exactly that fault and insists the game shrugs it off, and
// then injects MORE failures than there are retries and insists it still says
// so. Both halves matter: a test that cannot fail would have called the old
// code correct too.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const TARGET = '**/coin-gold-a.glb';   // the one dad's tablet actually failed on

// `serviceWorkers: 'block'` is not optional here. With the worker running it
// answers from its own cache and the fault never reaches the page — the first
// version of this probe reported "0 blips injected, game survived", which
// proved only that the game boots.
async function run(blips) {
  const b = await launchBrowser();
  const page = await (await b.newContext({
    viewport: { width: 740, height: 360 }, serviceWorkers: 'block',
  })).newPage();
  let killed = 0;
  await page.route(TARGET, (route) => (killed < blips
    ? (killed++, route.abort('failed'))
    : route.continue()));
  await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
  await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
  await page.fill('#t-name', 'BLIP');
  await page.locator('#t-start').dispatchEvent('pointerdown');
  // the coin is not touched until a room builds, so the fault cannot land
  // until the game is actually playing
  await page.waitForTimeout(45000);
  const out = await page.evaluate(() => {
    const e = document.getElementById('error');
    return {
      fatal: e && getComputedStyle(e).display !== 'none'
        ? document.getElementById('error-text').textContent : null,
      playing: !!(window.__game && window.__game.world),
    };
  });
  await b.close();
  return { ...out, killed };
}

console.log('\n── a transient failure is survivable ──────────────────');
const soft = await run(2);
check('two failed fetches of the same model do not end the game',
  soft.killed === 2 && !soft.fatal, soft);
check('...and the game is still playable afterwards', soft.playing, soft);

console.log('\n── ...but a file that never arrives is still reported ──');
const hard = await run(9);
check('once the retries are spent, it says so plainly',
  !!hard.fatal && /coin-gold-a/.test(hard.fatal), hard);
// The number of aborts it took is the retry budget, observed rather than
// assumed — if someone changes it, this line changes with it and says so.
console.log(`   (the loader gave up after ${hard.killed} failed attempts)`);

console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)`
  : '\n✓ PASS — one bad request no longer ends the game');
process.exit(errors.length ? 1 : 0);
