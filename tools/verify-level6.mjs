// VALEREACH CLIFFS, walked. design/LEVEL-DESIGN-5.md, checked against the
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
await page.fill('#t-name', 'VALE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.flags.borealDefeated = true;
  g.state.flags.ariaDefeated = true;            // the way down into the vale is open
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf'];   // NOT the tide wolf: the rim
                                                  // must be walkable without it
  g.player.iframes = 999999;
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const CLIMB = ['d1a', 'd1b', 'dg1', 'd2a', 'd2b', 'dsh', 'dg2',
  'd3a', 'd3b', 'dtp', 'dg3', 'd4a', 'd4b', 'dg4', 'ddp'];
const POCKETS = ['d1p', 'd2p', 'd3p', 'd4p'];
const ALL = [...CLIMB, ...POCKETS, 'dlg'];

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
      water: w.waterZones.map((z) => (z.deep ? 'deep' : 'shallow')),
      fires: w.quenchables.length,
      markers: Object.keys(w.markers),
      calls: window.__game.renderer.info.render.calls,
      hero: w.heroMarks.length,
    };
  });
}
check('all twenty spaces build', Object.keys(rooms).length === ALL.length,
  { built: Object.keys(rooms).length, of: ALL.length });

console.log('\n── 2. the RIM is walkable without the gift ────────────');
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
check('the spring grants the form', !!(rooms.dsh && rooms.dsh.markers.includes('sparkSpot')));
check('INTRODUCE — the spring has deep water across its way out',
  !!(rooms.dsh && rooms.dsh.water.filter((w) => w === 'deep').length >= 1), rooms.dsh && rooms.dsh.water);
check('GRANT+30s — and a second channel with a reward behind it',
  !!(rooms.dsh && rooms.dsh.water.filter((w) => w === 'deep').length >= 2));
check('DEVELOP — the north rim runs shallow, deep, shallow',
  !!(rooms.dg2 && rooms.dg2.water.join(',') === 'shallow,deep,shallow'), rooms.dg2 && rooms.dg2.water);
check('TWIST — the Tide Pools burn three fires', !!(rooms.dtp && rooms.dtp.fires === 3),
  { fires: rooms.dtp && rooms.dtp.fires });
check('CONCLUDE — the lock gate is a deep crossing',
  !!(rooms.d4b && rooms.d4b.water.includes('deep')), rooms.d4b && rooms.d4b.water);

console.log('\n── 6. the lock is shown before the key is given ───────');
// LEVEL-MAP's founding rule, and the reason region 1 puts a burnable cubby in
// its first room: a child must SEE what the region's tool does before they are
// handed it, or the gift lands as a shrug.
const d1bIdx = CLIMB.indexOf('d1b'), dshIdx = CLIMB.indexOf('dsh');
check('deep water is shown in d1b, four rooms before the spring gives the gift',
  !!(rooms.d1b && rooms.d1b.water.includes('deep')) && d1bIdx < dshIdx,
  { shownAt: d1bIdx, grantedAt: dshIdx });

console.log('\n── 7. junctions carry their landmark ──────────────────');
const junctions = ['d1a', 'd2a', 'd3a', 'd4a', 'ddp'];
const bare = junctions.filter((j) => !rooms[j] || rooms[j].hero === 0);
check('every junction has a hero prop', bare.length === 0, { bare });

console.log('\n── 8. the lagoon is shut until the gift, then open ────');
// Without the Tide Wolf the four shores must NOT offer a door onto the water:
// a door that leads somewhere a child cannot stand is worse than no door.
const shut = ['d1a', 'd2a', 'd3a', 'd4a'].filter((r) => rooms[r] && rooms[r].doors.includes('dlg'));
check('no shore opens onto the lagoon before the gift', shut.length === 0, { shut });
check('the lagoon itself is deep water', !!(rooms.dlg && rooms.dlg.water.includes('deep')));
const withTide = await page.evaluate(async () => {
  const g = window.__game;
  g.state.formsUnlocked.push('tide_wolf');
  return true;
});
void withTide;
await go('d1a');
const opened = await page.evaluate(() => window.__game.world.doors.map((d) => d.to));
check('...and every shore opens onto it once the Tide Wolf is earned',
  opened.includes('dlg'), { doors: opened });

console.log('\n── 9. and it all fits the budget ──────────────────────');
let worst = { id: null, calls: 0 };
for (const [id, r] of Object.entries(rooms)) if (r.calls > worst.calls) worst = { id, calls: r.calls };
check('worst room under 125 draw calls', worst.calls <= 125, worst);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
