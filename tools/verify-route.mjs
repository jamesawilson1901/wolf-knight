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
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
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
    // CLEAR THE ROOM FIRST — this file is about the door GRAPH, not combat.
    //
    // Encounter rooms now shut until they are cleared (World.armEncounter), so
    // walking the spine without fighting stops dead at the first room with three
    // shadows in it. That is the feature working; it is not a route fault, and
    // this suite has no business fighting. verify-playthrough already does
    // exactly this for the same reason.
    for (const e of (g.world.enemies || [])) e.dead = true;
    g.world.enemies = [];
    if (g.world.updateSeal) g.world.updateSeal(0);
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

// THE SPINE HAS PUZZLE GATES ON IT NOW, AND THAT IS THE POINT OF THEM.
//
// Dad, on the first cut of Ember's push rooms: "there's no opening the way to
// continue through the level or anything... all puzzles should either open the
// way or reward the player" — and, asked directly whether the MAIN path should
// be gated too: "yes, on the main path too." So lg1's north door and lb's are
// shut until their blocks are on their plates, and this suite went red the day
// that shipped, because it walks the spine without solving anything.
//
// The stale half was this file, not the gate. But the fix is not to quietly
// unlock the doors and carry on claiming the boss is reachable — a suite that
// waves away the thing standing in the way is how "there is no boss fight in
// level one" got past every green suite in the first place. So it now proves
// MORE than it did: first that the gates are really shut, then that the spine
// walks end to end once they are solved.
//
// Solving them by flag rather than by pushing the blocks is the same call this
// file already makes about combat two dozen lines up — it is about the door
// graph, not about whether a block can be pushed. That the pushes themselves
// work is proven by real input elsewhere: tools/verify-l1-doors.mjs for the
// gate topology, tools/run-l1.mjs for the walk.
console.log('\n── the gates on the spine are really shut ────────────');
await settle();
const gateShut = async (room, onward) => {
  // iframes DOWN for the warp: the room change here rides the same
  // die-and-respawn-in-state.room trick every other suite uses, and this file
  // sets iframes to 999999 in stepTo — leave those on and hurt() is a no-op,
  // hearts never drop, and the wait times out on a room that never changed
  await page.evaluate((r) => { const g = window.__game;
    g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
    g.player.hurt(99, { pierceDefend: true }); }, room);
  await page.waitForFunction((r) => window.__game.world
    && window.__game.world.roomId === r && window.__game.player.hearts > 1,
    room, { timeout: 45000 });
  return page.evaluate((t) => {
    const d = (window.__game.world.doors || []).find((x) => x.to === t);
    return { present: !!d, shut: d ? (d.when ? !d.when() : false) : null };
  }, onward);
};
for (const [room, onward] of [['lg1', 'lb'], ['lb', 'lg2']]) {
  const g = await gateShut(room, onward);
  check(`${room}: the way on to ${onward} is shut until its plates are down`,
    g.present && g.shut === true, { room, ...g });
}

console.log('\n── the walk to the Hollow\'s heart, on a NEW save ─────');
// down go the plates, and back to the start of the spine
await page.evaluate(() => {
  const g = window.__game;
  for (const id of ['l1_lg1_ki', 'l1_lb_sho_p1', 'l1_lb_sho_p2']) g.state.flags.plates[id] = true;
  g.state.room = 'la'; g.player.iframes = 0; g.player.hearts = 0.5;
  g.player.hurt(99, { pierceDefend: true });
});
await page.waitForFunction(() => window.__game.world && window.__game.world.roomId === 'la'
  && window.__game.player.hearts > 1, null, { timeout: 45000 });
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
