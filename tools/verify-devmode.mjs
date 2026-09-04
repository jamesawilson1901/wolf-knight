// DEV MODE IS A SHIPPED FEATURE, SO IT GETS A SUITE.
//
// It is the tool dad reports bugs WITH. If it silently captures blank frames,
// or loses a session, or the export comes out empty, the failure is invisible
// until an evening of play-testing is already gone — and the one person who
// would notice is the one person who cannot debug it. So this drives it the
// way he will: real pointer events on the real buttons, and then it reads what
// actually landed in the store.
//
// The two things most worth proving are the two that are easiest to get wrong:
//   * the FRAME is real pixels, not a blank canvas. There is no
//     preserveDrawingBuffer, so a capture taken a tick late returns a
//     transparent image that looks fine in a data URL and is worthless.
//   * the REPORT knows where it was taken. A picture with no room and no
//     coordinates is the thing this whole feature exists to stop.
//
// It also checks the OFF case, because a dev tool that leaks into the game the
// children play is a worse bug than any it could report.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();

// --- 1. OFF by default -----------------------------------------------------
{
  const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
  await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
  const leaked = await page.evaluate(() => ({
    badge: !!document.getElementById('dev-badge'),
    bar: !!document.getElementById('dev-bar'),
    global: typeof window.__dev !== 'undefined',
  }));
  console.log('\n── 1. invisible without ?dev=1 ────────────────────────');
  check('no dev badge, no dev bar, no window.__dev in the shipped game',
    !leaked.badge && !leaked.bar && !leaked.global, leaked);
  await page.close();
}

// --- 2. ON with ?dev=1, and it reports -------------------------------------
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DEVM');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

console.log('\n── 2. the label is in the corner ──────────────────────');
const badge = await page.evaluate(() => {
  const el = document.getElementById('dev-badge');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { text: el.textContent, x: Math.round(r.x), y: Math.round(r.y),
    onScreen: r.x >= 0 && r.y >= 0 && r.bottom <= window.innerHeight + 1 };
});
check('a DEV MODE label is on screen', !!badge && badge.onScreen, badge);

console.log('\n── 3. REPORT → tap the problem → a note ───────────────');
// The real buttons, the real pointer events, in the order he will use them.
await page.locator('#dev-bar button', { hasText: 'REPORT' }).first().dispatchEvent('pointerdown');
await page.waitForSelector('#dev-aim', { timeout: 5000 });
check('tapping REPORT asks him to point at the problem', true);

// point at the middle of the canvas — where the room is
await page.evaluate(() => {
  const aim = document.getElementById('dev-aim');
  aim.dispatchEvent(new PointerEvent('pointerdown', {
    clientX: Math.round(window.innerWidth / 2), clientY: Math.round(window.innerHeight / 2),
    bubbles: true, cancelable: true }));
});
await page.waitForSelector('#dev-form', { timeout: 10000 });
await page.fill('#dev-form textarea', 'the test typed this');
await page.locator('#dev-form button', { hasText: 'Save' }).first().dispatchEvent('pointerdown');
await page.waitForSelector('#dev-form', { state: 'detached', timeout: 5000 });

const rec = await page.evaluate(() => {
  const r = window.__dev.reports().slice(-1)[0];
  if (!r) return null;
  return { n: r.n, kind: r.kind, note: r.note, room: r.room,
    hasPlayer: !!(r.player && typeof r.player.x === 'number'),
    hasTap: !!(r.tap && r.tap.camera && Array.isArray(r.tap.camera.pos)),
    hitName: r.tap && r.tap.hit ? (r.tap.hit.name || r.tap.hit.material || r.tap.hit.geometry) : null,
    hudRects: (r.hud || []).length,
    shotLen: r.shot ? r.shot.length : 0,
    shotKind: r.shot ? r.shot.slice(0, 22) : null };
});
check('a report was stored, with the note he typed',
  !!rec && rec.note === 'the test typed this', rec);
check('...and it knows which ROOM it was taken in', !!rec && !!rec.room, rec);
check('...and where he was standing', !!rec && rec.hasPlayer, rec);
check('...and enough camera to re-cast the ray offline', !!rec && rec.hasTap, rec);
check('...and it measured the HUD the screenshot cannot see', !!rec && rec.hudRects > 0, rec);

console.log('\n── 4. the frame is real pixels, not a blank canvas ────');
// A capture one tick late comes back transparent and still looks like a valid
// data URL, which is the whole trap. Decode it and count what is not black.
const pixels = await page.evaluate((dataUrl) => new Promise((res) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) {          // sparse sample
      if (d[i] + d[i + 1] + d[i + 2] > 24) lit++;
      seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
      if (seen.size > 400) break;
    }
    res({ w: img.width, h: img.height, lit, distinct: seen.size });
  };
  img.onerror = () => res(null);
  img.src = dataUrl;
}), await page.evaluate(() => window.__dev.reports().slice(-1)[0].shot));
check('the screenshot is a jpeg of the right shape',
  !!rec && rec.shotKind === 'data:image/jpeg;base64' && rec.shotLen > 4000, rec);
check('...and it has a picture in it, not an empty buffer',
  !!pixels && pixels.lit > 20 && pixels.distinct > 8, pixels);

console.log('\n── 5. a note with no picture still carries the room ───');
await page.locator('#dev-bar button', { hasText: 'NOTE' }).first().dispatchEvent('pointerdown');
await page.waitForSelector('#dev-form', { timeout: 10000 });
await page.fill('#dev-form textarea', 'this fight is too hard');
await page.locator('#dev-form button', { hasText: 'Save' }).first().dispatchEvent('pointerdown');
await page.waitForSelector('#dev-form', { state: 'detached', timeout: 5000 });
const noteRec = await page.evaluate(() => {
  const r = window.__dev.reports().slice(-1)[0];
  return { kind: r.kind, note: r.note, room: r.room, hasPlayer: !!r.player };
});
check('a plain note is stored with its room and position',
  noteRec.kind === 'note' && !!noteRec.room && noteRec.hasPlayer, noteRec);

console.log('\n── 6. the session survives a reload ───────────────────');
await page.reload({ waitUntil: 'load' });
// A reload lands back on the title screen. The panel must be there BEFORE a
// profile is picked — a bug on the title screen is still a bug, and a session
// that looks lost until you start playing is a session he will assume is gone.
await page.waitForSelector('#dev-badge', { timeout: 30000 });
check('the panel is up on the title screen, before any room exists',
  await page.evaluate(() => typeof window.__dev !== 'undefined'));
const carried = await page.evaluate(async () => {
  for (let i = 0; i < 60 && window.__dev.reports().length === 0; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return window.__dev.reports().map((r) => ({ n: r.n, note: r.note, hasShot: !!r.shot }));
});
check('both reports came back after a reload, pictures included',
  carried.length === 2 && carried.every((r) => r.note) && carried[0].hasShot, carried);

console.log('\n── 7. the export is one readable file ─────────────────');
const html = await page.evaluate(async () => {
  // build the same document the EXPORT button writes, without going near the
  // browser's download plumbing (which Playwright would swallow anyway)
  const list = window.__dev.reports();
  const blobbed = [];
  for (const r of list) blobbed.push(r);
  const a = document.createElement('a');
  document.body.appendChild(a);
  let captured = null;
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = (blob) => { captured = blob; return origCreate.call(URL, blob); };
  await window.__dev.export();
  URL.createObjectURL = origCreate;
  return captured ? await captured.text() : null;
});
check('EXPORT produces a self-contained HTML document', !!html && /<!doctype html>/i.test(html),
  { bytes: html ? html.length : 0 });
check('...with both notes in it', !!html && html.includes('the test typed this')
  && html.includes('this fight is too hard'));
check('...with the pictures embedded, not linked',
  !!html && html.includes('src="data:image/jpeg;base64'));
check('...and the machine-readable data underneath',
  !!html && html.includes('"room"') && html.includes('"camera"'));

check('nothing threw during the run', pageErrors.length === 0, pageErrors.slice(0, 3));
await b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)`
  : '\n✓ PASS — dev mode reports where, not just what');
process.exit(errors.length ? 1 : 0);
