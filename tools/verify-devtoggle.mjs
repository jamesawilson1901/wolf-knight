// THE WAY OUT OF DEV MODE HAS TO WORK FROM A TOUCH.
//
// Dad, 2026-09-05: "the game is stuck in developer mode. pressing and holding
// the version number doesn't work." It never had. Three things were wrong at
// once and each alone was enough:
//
//   * #badge sat at z-index 5, under #title (20) on the menu and under
//     #special-btn in play. document.elementFromPoint at its own centre
//     returned the thing on top of it, so the press landed elsewhere and the
//     1.5s timer never started. The listener was armed the whole time; nothing
//     could ever reach it.
//   * `?dev=1` re-asserts itself on every load, so even a toggle that DID fire
//     was undone by the next reload. The installed app has no address bar to
//     clear it from.
//   * The DEV MODE chip, the one thing always on top, was pointer-events:none.
//
// So this suite drives the REAL pointer path — mouse down, hold past 1500ms,
// release — and asserts the toggle in both directions AND that the version
// label stays inert during play, because it lies on top of the special button
// and a 132x13 strip of dead attack input would be a worse bug than the one
// being fixed.

import { launchBrowser } from './launch.mjs';

const fails = [];
const check = (n, ok, d) => {
  console.log((ok ? '\u2713 ' : '\u2717 ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) fails.push(n);
};

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const state = async () => page.evaluate(() => ({
  remembered: localStorage.getItem('wk-dev'),
  devChip: !!document.getElementById('dev-badge'),
  url: location.search || '(clean)',
}));
const hold = async (sel, ms = 1800) => {
  const box = await page.locator(sel).boundingBox();
  if (!box) throw new Error(sel + ' has no box');
  const hit = await page.evaluate((s) => {
    const el = document.querySelector(s), r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  }, sel);
  console.log(`    (${sel} is the topmost element at its own centre: ${hit})`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(1200);
};
const newGame = async (name) => {
  await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
  await page.fill('#t-name', name);
  await page.locator('#t-start').dispatchEvent('pointerdown');
  await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
};

console.log('\n1. STUCK IN DEV MODE VIA ?dev=1 — press the DEV MODE chip in game');
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await newGame('OUT1');
console.log('  before:', JSON.stringify(await state()));
await hold('#dev-badge');
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 }).catch(() => {});
const s1 = await state();
check('a long press on the DEV MODE chip leaves dev mode, mid-game', !s1.devChip, s1);
check('...and it strips ?dev=1 so the next load cannot turn it back on', s1.url === '(clean)', s1);

console.log('\n2. TURN IT BACK ON from the title screen version label');
console.log('  before:', JSON.stringify(await state()));
await hold('#badge');
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 }).catch(() => {});
const s2 = await state();
check('a long press on the version label turns dev mode ON from the title', s2.devChip, s2);

console.log('\n3. AND OUT AGAIN from the title screen');
await hold('#badge');
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 }).catch(() => {});
const s3 = await state();
check('...and the same press turns it OFF again', !s3.devChip, s3);

console.log('\n4. THE LABEL MUST STAY INERT IN PLAY (it covers the special button)');
await newGame('TAP1');
const top = await page.evaluate(() => {
  const el = document.getElementById('badge'), r = el.getBoundingClientRect();
  const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return t ? (t.id || t.tagName) : 'none';
});
check('in play the version label is inert, so it cannot eat attack taps',
  top !== 'badge', { topmostAtTheLabel: top });

console.log(fails.length
  ? `\n\u2717 FAIL — ${fails.length}`
  : '\n\u2713 ALL CLEAN — dev mode can be left from a touch, both ways');
await b.close();
process.exit(fails.length ? 1 : 0);
