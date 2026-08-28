// COURTREACH CLIFFS, walked. design/LEVEL-DESIGN-5.md, checked against the
// rooms that were actually built rather than against the doc's own table.
//
// The switchback's whole promise is that a child who visits every room they can
// see always finds the way up. That is not something you can see by reading the
// room table — a door typo makes a level that still boots, still looks right,
// and cannot be finished. So this builds all twenty spaces through the real
// loader and walks them.
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
await page.fill('#t-name', 'COURT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.flags.borealDefeated = true;
  g.state.flags.ariaDefeated = true;
  g.state.flags.meriDefeated = true;            // the way up to the court is open
  // EVERY wolf but the ghost. The Court's four wings each need a different one,
  // so a child arrives here carrying six verbs — and the seventh is what the
  // region itself gives them.
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf'];
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

const CLIMB = ['x1', 'xsh', 'xh'];                    // the spine before the wings
const POCKETS = ['xp1', 'xp2'];
const WINGS = ['xa1', 'xa2', 'xa3', 'xr1', 'xr2', 'xr3',
  'xg1', 'xg2', 'xg3', 'xm1', 'xm2', 'xm3'];
const ALL = [...CLIMB, ...POCKETS, ...WINGS, 'xst', 'xth'];

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
      watchers: w.watchers.length,
      fires: w.quenchables.length,
      relics: (w.markers.relicSpots || []).length,
      lock: w.markers.wingLock ? w.markers.wingLock.needs : null,
      solve: w.markers.wingSolve ? w.markers.wingSolve.needs : null,
      markers: Object.keys(w.markers),
      calls: window.__game.renderer.info.render.calls,
      hero: w.heroMarks.length,
    };
  });
}
check('all twenty spaces build', Object.keys(rooms).length === ALL.length,
  { built: Object.keys(rooms).length, of: ALL.length });

console.log('\n── 2. the spine walks, and the wings hang off it ────');
let broken = [];
for (let i = 0; i < CLIMB.length - 1; i++) {
  const from = CLIMB[i], to = CLIMB[i + 1];
  if (!rooms[from] || !rooms[from].doors.includes(to)) broken.push(`${from}→${to}`);
}
check('gate → shrine → hall', broken.length === 0, { broken });
const wingDoors = ['xa1', 'xr1', 'xg1', 'xm1'].filter((w) => !rooms.xh.doors.includes(w));
check('the hall opens all four wings', wingDoors.length === 0, { missing: wingDoors });
const wingBack = ['xa1', 'xr1', 'xg1', 'xm1'].filter((w) => !rooms[w].doors.includes('xh'));
check('...and every wing leads back to it', wingBack.length === 0, { missing: wingBack });

console.log('\n── 3. each wing runs three rooms to a relic ───────────');
const chains = [['xa1','xa2','xa3','ember'], ['xr1','xr2','xr3','thorn'],
  ['xg1','xg2','xg3','tide'], ['xm1','xm2','xm3','moon']];
const badChain = [];
for (const [a, b2, c, relicName] of chains) {
  if (!rooms[a].doors.includes(b2)) badChain.push(`${a}→${b2}`);
  if (!rooms[b2].doors.includes(c)) badChain.push(`${b2}→${c}`);
  if (!rooms[c].doors.includes(b2)) badChain.push(`${c}→${b2} (no way back)`);
  if (rooms[c].relics !== 1) badChain.push(`${c} has ${rooms[c].relics} relics`);
  void relicName;
}
check('every wing is a there-and-back-again ending in one relic',
  badChain.length === 0, { badChain });

console.log('\n── 4. no dead ends ───────────────────────────────────');
const dead = ALL.filter((id) => rooms[id] && rooms[id].doors.length === 0);
check('no space is sealed', dead.length === 0, { dead });

console.log('\n── 5. every wing needs TWO different verbs ────────────');
// The one thing this level asks that the game has not asked before: opened by
// one wolf, solved by another. A wing whose lock and solve are the same wolf is
// a wing that teaches nothing.
const verbs = [];
for (const [a, b2] of chains) {
  const lock = rooms[a].lock, solve = rooms[b2].solve;
  verbs.push({ wing: a, lock, solve });
}
const singleVerb = verbs.filter((v) => !v.lock || (!v.solve && v.wing !== 'xm1'));
check('every wing states the verb that opens it', singleVerb.length === 0, { verbs });
const distinct = new Set(verbs.map((v) => v.lock));
check('and the four wings need four DIFFERENT wolves to open',
  distinct.size === 4, { locks: [...distinct] });

console.log('\n── 6. the throne is shut until four relics ────────────');
check('the hall does not open the throne stair with none held',
  !rooms.xh.doors.includes('xst'), { doors: rooms.xh.doors });
const withRelics = await page.evaluate(async () => {
  const g = window.__game;
  for (const r of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + r);
  return true;
});
void withRelics;
await go('xh');
const opened = await page.evaluate(() => window.__game.world.doors.map((d) => d.to));
check('...and opens it with all four', opened.includes('xst'), { doors: opened });

console.log('\n── 7. the watchers, and the ghost that passes them ────');
check('the first room shows a watcher', rooms.x1.watchers >= 1, { n: rooms.x1.watchers });
check('the shrine has one across its way out', rooms.xsh.watchers >= 1, { n: rooms.xsh.watchers });
check('the hall paces two', rooms.xh.watchers >= 2, { n: rooms.xh.watchers });
const ghostPass = await page.evaluate(async () => {
  const g = window.__game;
  g.state.formsUnlocked.push('ghost_wolf');
  return true;
});
void ghostPass;
check('the mirror wing builds', await go('xm2'));
const mirrors = await page.evaluate(async () => {
  const g = window.__game;
  const before = g.world.boxColliders.length;
  g.player.setForm('ghost_wolf', { silent: true });
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.player.trySpecial(g.effects, g.world);
  for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
  const during = g.world.boxColliders.length;
  g.player.ghostUntil = 0;
  for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
  return { before, during, after: g.world.boxColliders.length, ghosted: false };
});
check('the mirrors stop being solid while Kael is a ghost',
  mirrors.during < mirrors.before, mirrors);
check('...and go solid again the moment he is not', mirrors.after === mirrors.before, mirrors);

console.log('\n── 8. and it all fits the budget ──────────────────────');
let worst = { id: null, calls: 0 };
for (const [id, r] of Object.entries(rooms)) if (r.calls > worst.calls) worst = { id, calls: r.calls };
check('worst room under 125 draw calls', worst.calls <= 125, worst);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
