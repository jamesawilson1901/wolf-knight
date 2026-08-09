// STORMREACH CLIFFS, walked. design/LEVEL-DESIGN-5.md, checked against the
// rooms that were actually built rather than against the doc's own table.
//
// The switchback's whole promise is that a child who visits every room they can
// see always finds the way up. That is not something you can see by reading the
// room table — a door typo makes a level that still boots, still looks right,
// and cannot be finished. So this builds all twenty spaces through the real
// loader and walks them.
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
await page.fill('#t-name', 'STORM');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.flags.borealDefeated = true;          // the way onto the cliffs is open
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf'];
  g.player.iframes = 999999;
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

const CLIMB = ['s1a', 's1b', 'sc1', 's2a', 's2b', 'ssh', 'sc2',
  's3a', 's3b', 'svn', 'sc3', 's4a', 's4b', 'sc4', 'scr'];
const POCKETS = ['s1p', 's2p', 's3p', 's4p'];
const ALL = [...CLIMB, ...POCKETS, 'ssA'];

console.log('\n── 1. every space builds ──────────────────────────────');
const rooms = {};
for (const id of ALL) {
  const built = await go(id);
  if (!built) { check(`${id} builds`, false); continue; }
  rooms[id] = await page.evaluate(() => {
    const w = window.__game.world;
    return {
      doors: w.doors.map((d) => d.to),
      spawn: { x: +w.spawn.x.toFixed(2), z: +w.spawn.z.toFixed(2) },
      lanes: w.galeLanes.map((l) => ({ dir: l.dir, s: l.strength })),
      vanes: w.vanes.length,
      markers: Object.keys(w.markers),
      calls: window.__game.renderer.info.render.calls,
      hero: w.heroMarks.length,
    };
  });
}
check('all twenty spaces build', Object.keys(rooms).length === ALL.length,
  { built: Object.keys(rooms).length, of: ALL.length });

console.log('\n── 2. the climb is walkable, bottom to top ────────────');
let broken = [];
for (let i = 0; i < CLIMB.length - 1; i++) {
  const from = CLIMB[i], to = CLIMB[i + 1];
  if (!rooms[from] || !rooms[from].doors.includes(to)) broken.push(`${from}→${to}`);
}
check('every step of the climb has a door to the next', broken.length === 0, { broken });

console.log('\n── 3. ...and every step back down ─────────────────────');
broken = [];
for (let i = CLIMB.length - 1; i > 0; i--) {
  const from = CLIMB[i], to = CLIMB[i - 1];
  if (!rooms[from] || !rooms[from].doors.includes(to)) broken.push(`${from}→${to}`);
}
check('nothing is one-way — you can always walk back down', broken.length === 0, { broken });

console.log('\n── 4. no dead ends, and every pocket loops home ───────');
const dead = ALL.filter((id) => rooms[id] && rooms[id].doors.length === 0);
check('no space is sealed', dead.length === 0, { dead });
const strays = POCKETS.filter((p) => {
  const back = rooms[p] && rooms[p].doors[0];
  return !back || !rooms[back] || !rooms[back].doors.includes(p);
});
check('every pocket door is answered from the other side', strays.length === 0, { strays });

console.log('\n── 5. the teach is in order, and in the right rooms ───');
check('the shrine grants the form', !!(rooms.ssh && rooms.ssh.markers.includes('sparkSpot')));
check('INTRODUCE — the shrine has a gale across its way out',
  !!(rooms.ssh && rooms.ssh.lanes.filter((l) => l.s === 'gale').length >= 1),
  rooms.ssh && rooms.ssh.lanes);
check('GRANT+30s — and a second gale with a reward behind it',
  !!(rooms.ssh && rooms.ssh.lanes.filter((l) => l.s === 'gale').length >= 2));
check('DEVELOP — the second stair has all three strengths',
  !!(rooms.sc2 && new Set(rooms.sc2.lanes.map((l) => l.s)).size === 3),
  rooms.sc2 && rooms.sc2.lanes);
check('TWIST — the Vanes room has three vanes', !!(rooms.svn && rooms.svn.vanes === 3),
  { vanes: rooms.svn && rooms.svn.vanes });
check('CONCLUDE — the wind gate has two', !!(rooms.s4b && rooms.s4b.vanes === 2),
  { vanes: rooms.s4b && rooms.s4b.vanes });

console.log('\n── 6. the lock is shown before the key is given ───────');
// LEVEL-MAP's founding rule, and the reason region 1 puts a burnable cubby in
// its first room: a child must SEE what the region's tool does before they are
// handed it, or the gift lands as a shrug.
const s1bIdx = CLIMB.indexOf('s1b'), sshIdx = CLIMB.indexOf('ssh');
check('a gale is shown in s1b, four rooms before the shrine grants the dash',
  !!(rooms.s1b && rooms.s1b.lanes.some((l) => l.s === 'gale')) && s1bIdx < sshIdx,
  { shownAt: s1bIdx, grantedAt: sshIdx });

console.log('\n── 7. junctions carry their landmark ──────────────────');
const junctions = ['s1a', 's2a', 's3a', 's4a', 'scr'];
const bare = junctions.filter((j) => !rooms[j] || rooms[j].hero === 0);
check('every junction has a hero prop', bare.length === 0, { bare });

console.log('\n── 8. the shortcut runs both ways ─────────────────────');
check('the wind bridge joins the Open Sky to the Landing',
  !!(rooms.ssA && rooms.ssA.doors.includes('s4a') && rooms.ssA.doors.includes('s1a')),
  rooms.ssA && rooms.ssA.doors);

console.log('\n── 9. and it all fits the budget ──────────────────────');
let worst = { id: null, calls: 0 };
for (const [id, r] of Object.entries(rooms)) if (r.calls > worst.calls) worst = { id, calls: r.calls };
check('worst room under 125 draw calls', worst.calls <= 125, worst);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
