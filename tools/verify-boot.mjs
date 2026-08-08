// DOES THE GAME START?
//
// `node --check js/player.js` exits 0 on a file with a broken if/else chain,
// because a .js file parses as CommonJS, hits the `import` on line 5 and never
// reads the body. It has now given a false pass twice in one session — once on
// a syntax error that stopped the game booting at all, and once on a
// ReferenceError that would have fired the first time a child breathed fire.
//
// This is the cheap check that actually catches those: load the page, wait for
// the title screen, and report any page error. Run it before anything longer.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
let titled = false;
try {
  await page.waitForSelector('#title', { state: 'visible', timeout: 25000 });
  titled = true;
} catch { /* reported below */ }
// ...and it must survive actually starting a game, not just showing a menu
let playing = false;
if (titled) {
  try {
    await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
    await page.fill('#t-name', 'BOOT');
    await page.locator('#t-start').dispatchEvent('pointerdown');
    await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
    playing = true;
  } catch { /* reported below */ }
}
console.log(titled ? '✓ the title screen appears' : '✗ the title screen never appeared');
console.log(playing ? '✓ a new game starts and the world builds' : '✗ a new game did not start');
if (errs.length) console.log('\n' + errs.length + ' page error(s):\n' + errs.join('\n'));
const ok = titled && playing && !errs.length;
console.log('\n' + (ok ? '✓ the game boots clean' : '✗ THE GAME IS BROKEN'));
await b.close();
process.exit(ok ? 0 : 1);
