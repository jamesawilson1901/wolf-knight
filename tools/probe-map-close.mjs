// BUG 1 — "no way to go back to the game from the map; must restart." The map
// panel centered its content with no scroll, so on a short screen the ✓ Done
// button sat below the viewport, unclickable: a soft-lock. The fix makes .panel
// scroll. Verify at a DELIBERATELY short viewport that Done is reachable and
// actually returns to the game.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-2/map', timescale: 1 });
const say = (...a) => console.log(...a);
let ok = true;

await d.newGame('MAPCLOSE');
// squeeze the viewport so the map list is taller than the screen — the exact
// condition dad's phone hit.
await d.page.setViewportSize({ width: 740, height: 220 });
await d.page.waitForTimeout(300);

// open the map through the real HUD button
await d.page.locator('#map-btn').dispatchEvent('pointerdown');
await d.page.waitForTimeout(400);

const opened = await d.page.evaluate(() => getComputedStyle(document.getElementById('map-menu')).display);
say('map-menu display:', opened);
ok = ok && opened === 'flex';

// the panel must SCROLL (content taller than the box) so nothing is stranded
const scrollInfo = await d.page.evaluate(() => {
  const el = document.getElementById('map-menu');
  const btns = [...el.querySelectorAll('.menu-btn')];
  const done = btns[btns.length - 1];
  return { scrollH: el.scrollHeight, clientH: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY, hasDone: !!done,
    doneText: done ? done.textContent : null };
});
say('scroll:', JSON.stringify(scrollInfo));
ok = ok && scrollInfo.hasDone && scrollInfo.overflowY === 'auto';
const overflows = scrollInfo.scrollH > scrollInfo.clientH + 1;
say(overflows ? '  content overflows the short screen (as on the phone)' : '  content fits (still fine)');

// scroll the Done button into view the way a thumb would, then check it is
// actually inside the viewport and click it with a REAL pointer.
await d.page.evaluate(() => {
  const el = document.getElementById('map-menu');
  el.querySelectorAll('.menu-btn')[el.querySelectorAll('.menu-btn').length - 1].scrollIntoView({ block: 'center' });
});
await d.page.waitForTimeout(200);
const box = await d.page.evaluate(() => {
  const el = document.getElementById('map-menu');
  const done = el.querySelectorAll('.menu-btn')[el.querySelectorAll('.menu-btn').length - 1];
  const r = done.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
    inView: r.top >= 0 && r.bottom <= window.innerHeight };
});
say('Done button box after scroll:', JSON.stringify(box));
ok = ok && box.inView;
await d.shot('map-open-short');

// click Done and confirm we are back in the game
await d.page.locator('#map-menu .menu-btn').last().dispatchEvent('pointerdown');
await d.page.waitForTimeout(400);
const closed = await d.page.evaluate(() => getComputedStyle(document.getElementById('map-menu')).display);
say('map-menu display after Done:', closed);
ok = ok && closed === 'none';

// and the world is live again (clock advancing)
const live = await d.page.evaluate(async () => {
  const g = window.__game;
  const t1 = g.player._time;
  await new Promise((r) => setTimeout(r, 700));
  return g.player._time !== t1;
});
say(live ? '  game resumed (clock ticking)' : '  FAIL: game still frozen after close');
ok = ok && live;

say('errors:', JSON.stringify(d.errors));
say(ok && d.errors.length === 0 ? 'MAP CLOSE FIX: PASS' : 'MAP CLOSE FIX: FAIL');
d.saveLog('map-close');
await d.close();
process.exit(ok && d.errors.length === 0 ? 0 : 1);
