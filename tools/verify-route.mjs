// CAN A CHILD ACTUALLY GET TO THE BOSS?
//
// Written after a real play session reported the opposite: "there is no boss
// fight in level one, I searched every room, there is nowhere to go."
//
// Every existing suite passed at the time. verify-level1 proved every room
// BUILDS and that the door graph has no dead ends; verify-boot proved the game
// starts. Neither walked the route. The gap between "the graph says these rooms
// connect" and "a player standing in this room can reach the next one" is
// exactly where that report lived, so this file closes it: it starts a new
// game and steps through the real door triggers, in order, to the arena.
//
// It does NOT assert anything about wayfinding — whether a child can FIND the
// route is a separate and still-open problem. Two things are broken there and
// are deliberately not asserted here, because they are not yet fixed:
//   * `state.settings.easy` is absent from the settings defaults, so the gentle
//     guide never runs unless someone finds the toggle.
//   * `guideTarget()` names only RETIRED rooms, so even switched on it has no
//     target in any of the five rebuilt regions.
// When those are fixed, the assertion belongs here.
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
await page.fill('#t-name', 'ROUTE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0;
});

const settle = () => page.waitForFunction(() => !document.getElementById('fade')
  || getComputedStyle(document.getElementById('fade')).opacity === '0', null, { timeout: 30000 }).catch(() => {});

// Step onto the door's own trigger box, the way a child walking into it would,
// and wait for the room to actually change.
const stepTo = async (to) => {
  const from = await page.evaluate(() => window.__game.state.room);
  const placed = await page.evaluate((t) => {
    const g = window.__game;
    g.player.iframes = 999999;                       // no dying mid-route
    if (g.narration) g.narration.blocking = false;   // a blocking line freezes the world
    const d = (g.world.doors || []).find((x) => x.to === t);
    if (!d) return null;
    g.player.root.position.x = (d.minX + d.maxX) / 2;
    g.player.root.position.z = (d.minZ + d.maxZ) / 2;
    return true;
  }, to);
  if (!placed) return { ok: false, why: `no door to ${to} exists in ${from}` };
  try {
    await page.waitForFunction((f) => window.__game.state.room !== f, from, { timeout: 30000 });
  } catch { return { ok: false, why: `the door to ${to} did not fire` }; }
  await settle();
  return { ok: true, room: await page.evaluate(() => window.__game.state.room) };
};

console.log('\n── the walk to the Hollow\'s heart, on a NEW save ─────');
await settle();
// Every one of these is the NORTH door. The spine of Ember Hollow is a straight
// line away from the camera; the east/west doors are optional pockets.
const ROUTE = ['lg1', 'lb', 'lg2', 'lc', 'lg3', 'ld', 'lg4', 'le'];
let reached = await page.evaluate(() => window.__game.state.room);
for (const to of ROUTE) {
  const r = await stepTo(to);
  check(`${reached} → ${to}`, r.ok, r.ok ? undefined : { why: r.why });
  if (!r.ok) break;
  reached = r.room;
}

console.log('\n── and the boss is waiting when you get there ────────');
const arena = await page.evaluate(() => {
  const g = window.__game;
  return { room: g.state.room, boss: !!g.world.boss,
    visible: g.world.boss && g.world.boss.root ? g.world.boss.root.visible : null };
});
check('the walk ends in the arena', arena.room === 'le', { room: arena.room });
check('the Shadowgrip is there', arena.boss === true, arena);
check('...and is actually visible', arena.visible !== false, arena);

// The arena is a one-way room until the boss is down — that is the design, but
// it means a boss that fails to spawn is a DEAD END, not merely a quiet room.
// This is the shape the play report described, so it is worth stating outright.
console.log('\n── the arena is only a dead end if the boss is missing ──');
const doors = await page.evaluate(() => (window.__game.world.doors || []).map((d) => d.to));
check('before the fight, the only way out is back the way you came',
  doors.length === 1 && doors[0] === 'lg4', { doors });

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
