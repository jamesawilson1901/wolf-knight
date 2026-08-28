// THE VILLAGE, walked. design/LEVEL-DESIGN-VILLAGE.md, checked against the
// rooms actually built. No lock-and-key economy to prove here — the whole
// point of this region is that nothing is gated — so this suite proves the
// other half of the contract instead: every guardian door is open from the
// moment the region loads, every pocket loops home, one guardian per pocket,
// and clearing all six actually flips the restoration flag.
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
await page.fill('#t-name', 'VILLAGE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;  // the dressing pass — test the real kit, not the boxes
  g.state.flags.grimmFreed = true;   // the region does not exist until the story is over
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
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

const HUB = 'ysq';
const STREETS = ['yhs', 'ylw'];
// which street each district hangs off (the town-rebuild graph, 2026-08-28)
const STREET_OF = { yg1: 'yhs', yg2: 'yhs', yg3: 'yhs', yg4: 'ylw', yg5: 'ylw', yg6: 'ylw' };
const GUARDIAN_ROOMS = ['yg1', 'yg2', 'yg3', 'yg4', 'yg5', 'yg6'];
const ALL = [HUB, ...STREETS, ...GUARDIAN_ROOMS, 'yrw'];

console.log('\n── 1. every space builds ──────────────────────────────');
const rooms = {};
for (const id of ALL) {
  const built = await go(id);
  if (!built) { check(`${id} builds`, false); continue; }
  rooms[id] = await page.evaluate(() => {
    const w = window.__game.world;
    const foes = (w.enemies || []).filter((e) => !e.scenery);
    return {
      doors: w.doors.map((d) => d.to),
      enemies: foes.length,
      enemyKinds: foes.map((e) => e.constructor.name),
      enemyClear: foes.map((e) => {
        const x = e.x, z = e.z, R = e.radius || 0.4;
        for (const b of w.boxColliders) {
          const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
          if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return false;
        }
        for (const c of w.circleColliders) {
          if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + R) ** 2) return false;
        }
        return true;
      }),
      markers: Object.keys(w.markers),
      calls: window.__game.renderer.info.render.calls,
    };
  });
}
check('all ten spaces build', Object.keys(rooms).length === ALL.length,
  { built: Object.keys(rooms).length, of: ALL.length });

console.log('\n── 2. the square opens the streets; the streets open the town ──');
check('ysq opens both streets and the well',
  rooms[HUB] && STREETS.every((st) => rooms[HUB].doors.includes(st)) && rooms[HUB].doors.includes('yrw'),
  { doors: rooms[HUB] && rooms[HUB].doors });
const missing = GUARDIAN_ROOMS.filter((id) =>
  !rooms[STREET_OF[id]] || !rooms[STREET_OF[id]].doors.includes(id));
check('each street opens its three districts', missing.length === 0, { missing });
const backHome = GUARDIAN_ROOMS.filter((id) => !rooms[id] || !rooms[id].doors.includes(STREET_OF[id]));
check('every guardian pocket loops back to its street', backHome.length === 0, { backHome });
check('yrw loops back to ysq too', rooms.yrw && rooms.yrw.doors.includes(HUB));
// THE TOWN LOOP: ysq → yhs → ylw → ysq must close, both directions walkable —
// the difference between a town and a diagram of one.
check('the streets join each other (the town is a loop)',
  rooms.yhs && rooms.yhs.doors.includes('ylw') && rooms.ylw && rooms.ylw.doors.includes('yhs'),
  { yhs: rooms.yhs && rooms.yhs.doors, ylw: rooms.ylw && rooms.ylw.doors });
// the streets are safe ground — combat lives in the districts
check('the streets hold no enemies',
  STREETS.every((st) => rooms[st] && rooms[st].enemies === 0),
  STREETS.map((st) => ({ st, n: rooms[st] && rooms[st].enemies })));
// and each street hides one chest for the child who pokes around
check('each street hides a chest',
  STREETS.every((st) => rooms[st] && rooms[st].markers.includes('chestDefs')));

console.log('\n── 3. no dead ends, no locks ──────────────────────────');
const dead = ALL.filter((id) => rooms[id] && rooms[id].doors.length === 0);
check('no space is sealed', dead.length === 0, { dead });
// no gate/lock markers anywhere — this region has none by design (§5)
const locked = ALL.filter((id) => rooms[id] && rooms[id].markers.some((m) => /Lock$/.test(m)));
check('no room carries a lock marker', locked.length === 0, { locked });

console.log('\n── 4. one guardian per pocket, six distinct classes ───');
const counts = GUARDIAN_ROOMS.map((id) => ({ id, n: rooms[id] ? rooms[id].enemies : -1 }));
check('every guardian pocket has exactly one enemy', counts.every((c) => c.n === 1), counts);
const kinds = GUARDIAN_ROOMS.map((id) => rooms[id] && rooms[id].enemyKinds[0]);
check('yrw has none (the one non-combat room)', rooms.yrw && rooms.yrw.enemies === 0, { n: rooms.yrw && rooms.yrw.enemies });
const distinctKinds = new Set(kinds);
check('all six guardians are distinct classes', distinctKinds.size === 6, { kinds });

console.log('\n── 4b. no guardian spawns inside the dressing ─────────');
// The dressing pass hand-places real structures (hut/houses/tower/wagons)
// with hand-measured colliders next to fixed enemy markers — exactly the
// class of bug verify-spawn-clear.mjs caught in Wild Woods (t3b) on ship
// day. That suite doesn't reach the Village at all, so this room-build
// checks the same thing here.
const trapped = [];
for (const id of GUARDIAN_ROOMS) {
  const r = rooms[id];
  if (r && r.enemyClear && r.enemyClear.some((ok) => !ok)) trapped.push(id);
}
check('no guardian spawns inside a wall/structure collider', trapped.length === 0, { trapped });

console.log('\n── 5. clear all six, and the restoration fires ────────');
check('villageCleared() is false before any kill', await page.evaluate(() => {
  return !window.__game.WS.get('village', 'guardian_g1');
}));
for (const g of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) {
  await page.evaluate((gg) => window.__game.WS.set('village', 'guardian_' + gg), g);
}
await go(HUB);
// stand at heroSpot so main.js's completion watch fires
const complete = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.world.markers;
  if (!m.heroSpot) return { ok: false, why: 'no heroSpot marker' };
  g.player.root.position.set(m.heroSpot.x, 0, m.heroSpot.z);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (g.WS.get('village', 'restored')) return { ok: true };
  }
  return { ok: false, why: 'timed out', restored: g.WS.get('village', 'restored') };
});
check('WS(village, restored) flips once all six guardians are down', complete.ok, complete);

console.log('\n── 6. and it all fits the budget ──────────────────────');
let worst = { id: null, calls: 0 };
for (const [id, r] of Object.entries(rooms)) if (r.calls > worst.calls) worst = { id, calls: r.calls };
check('worst room under 125 draw calls', worst.calls <= 125, worst);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
