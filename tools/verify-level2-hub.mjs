// LEVEL 2 VERIFIER, PART B — THE HUB.
// The hub is the load-bearing part of a hub level and it carries the level's
// one specific risk: it is revisited constantly, so any leak there compounds
// across a whole session. This proves the four states, the quit-and-resume
// round trip, the loud save, and twenty entries with no growth.
//
// As with Level 1, every graph assertion reads the WORLD THAT WAS BUILT
// (world.doors), not the table that generated it. A door graph derived from
// its own source data proves nothing.
//
//   Run:  (nohup python3 -m http.server 8901 &) ; node tools/verify-level2.mjs
//   Add:  --dressed   to check the art costume instead of the greybox
import { chromium } from 'playwright';

const DRESSED = process.argv.includes('--dressed');
const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', DRESSED ? 'L2DRESS' : 'L2GREY');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate((dressed) => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'];
  g.state.settings.greybox = !dressed;
  g.player.iframes = 99999;
}, DRESSED);

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => {
      const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true });
    }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* SwiftShader builds a room slowly; retry */ }
  }
  return false;
};

// Drive the WorldState directly — the point of the test is the GEOMETRY that
// results, not the gameplay path to it (that is a separate assertion below).
const setStage = (n) => page.evaluate((k) => {
  const g = window.__game;
  g.state.flags.world = {};
  const keys = ['spark', 'drained', 'deepLantern'].slice(0, k);
  for (const key of keys) g.WS.set('vault', key, true);
}, n);

const snap = () => page.evaluate(() => {
  const g = window.__game, w = g.world, i = g.renderer.info;
  let southEdge = -Infinity;
  for (const c of w.boxColliders) southEdge = Math.max(southEdge, c.maxZ);
  const interactive = [];
  for (const [k, v] of Object.entries(w.markers)) {
    const push = (o) => { if (o && typeof o.z === 'number') interactive.push({ k, x: o.x, z: o.z }); };
    if (Array.isArray(v)) v.forEach(push); else push(v);
  }
  return {
    doors: w.doors.map((d) => ({ to: d.to, gated: !!d.when })),
    spawn: { ...w.spawn },
    markers: Object.keys(w.markers),
    interactive, southEdge,
    boxes: w.boxColliders.length,
    circles: w.circleColliders.length,
    lightScale: w.lightScale === undefined ? 1 : w.lightScale,
    calls: i.render.calls, tris: i.render.triangles,
  };
});

const SPACES = ['vh', 'vga'];
console.log('\n── 6. THE HUB VISIBLY CHANGES, driven by state ─────────');
const hubAt = async (n) => { await setStage(n); await go('vh'); return snap(); };
const H = [await hubAt(0), await hubAt(1), await hubAt(2), await hubAt(3)];
for (const [i, h] of H.entries()) {
  console.log(`  stage ${i}: doors=[${h.doors.map((d) => d.to).join(',')}]  ` +
    `light=${h.lightScale}  boxes=${h.boxes}  circles=${h.circles}  calls=${h.calls}`);
}
check('stage 0: only the Spoke A door exists',
  H[0].doors.filter((d) => d.to.startsWith('vg')).length === 1 &&
  H[0].doors.some((d) => d.to === 'vga'), { doors: H[0].doors.map((d) => d.to) });
check('stage 0 is dark and stage 1 is lit (the lantern relights)',
  H[0].lightScale < H[1].lightScale, { stage0: H[0].lightScale, stage1: H[1].lightScale });
check('stage 1 opens the two side galleries',
  H[1].doors.some((d) => d.to === 'vgb') && H[1].doors.some((d) => d.to === 'vgc'),
  { doors: H[1].doors.map((d) => d.to) });
// the flooded ring blocks with a CIRCLE collider, not a box — draining it must
// physically remove that circle, or "the water drained" is only a repaint
check('stage 2 drains the ring — the water collider is physically gone',
  H[2].circles < H[1].circles, { stage1circles: H[1].circles, stage2circles: H[2].circles });
check('stage 3 opens the crypt door (the hand lowers)',
  H[3].doors.some((d) => d.to === 'vz') && !H[2].doors.some((d) => d.to === 'vz'),
  { stage2: H[2].doors.map((d) => d.to), stage3: H[3].doors.map((d) => d.to) });
check('the crypt is unreachable before the hand lowers',
  !H[0].doors.some((d) => d.to === 'vz') && !H[1].doors.some((d) => d.to === 'vz'));

// SURVIVES A QUIT. Serialise, wipe the live state, restore, rebuild.
const persisted = await page.evaluate(() => {
  const g = window.__game;
  g.state.flags.world = {};
  g.WS.set('vault', 'spark', true);
  g.WS.set('vault', 'drained', true);
  const ok = g.persist();
  const raw = localStorage.getItem('wolfknight:save:' + g.state.profileId);
  const parsed = JSON.parse(raw);
  // wipe the live copy and put back ONLY what the save file holds
  g.state.flags.world = {};
  g.WS.restore(parsed.flags.world);
  return { wrote: ok, stage: g.WS.stage('vault'), stored: parsed.flags.world };
});
check('the vault state round-trips through the localStorage profile',
  persisted.stage === 2 && persisted.wrote, persisted);
await go('vh');
const resumed = await snap();
check('a child who quits mid-level resumes with the correct hub',
  resumed.doors.some((d) => d.to === 'vgb') && !resumed.doors.some((d) => d.to === 'vz'),
  { doors: resumed.doors.map((d) => d.to) });

// A FAILED WRITE MUST BE LOUD.
const loud = await page.evaluate(() => {
  const g = window.__game;
  const real = localStorage.setItem.bind(localStorage);
  let shouted = false;
  const errEl = document.getElementById('error');
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try { g.persist(); } catch (e) { /* persist must not throw */ }
  shouted = errEl && getComputedStyle(errEl).display !== 'none';
  localStorage.setItem = real;
  if (errEl) errEl.style.display = 'none';
  return { shouted };
});
check('a save that cannot write SHOUTS (no silent catch)', loud.shouted, loud);

// ---------------------------------------------------------------------------
console.log('\n── 7. twenty hub entries must not grow memory ───────────');
await setStage(2);
// WARM THE ROOMS THE LOOP ACTUALLY USES, NOT SOME OTHER ROOMS.
//
// This warmed vh and va1 and then measured a vh <-> VGA loop, so the first
// entry into vga inside the measured window loaded that room's models for the
// first time — and a one-time cache fill was reported as a leak of exactly
// that many geometries. It went off the day vga gained bats and a dungeon
// crate, which is a true statement about the assets and a false one about
// memory. Both ends of the round trip get warmed now, twice, so what is
// measured is only what recurs.
for (const r of ['vh', 'vga', 'vh', 'vga', 'vh']) await go(r);
const mem = () => page.evaluate(() => {
  const i = window.__game.renderer.info;
  return { geometries: i.memory.geometries, textures: i.memory.textures,
           programs: i.programs ? i.programs.length : 0 };
});
const before = await mem();
for (let i = 0; i < 20; i++) { await go('vga'); await go('vh'); }
const after = await mem();
console.log(`  before: ${JSON.stringify(before)}`);
console.log(`  after 20 hub entries: ${JSON.stringify(after)}`);
check('geometry count returns to baseline after 20 hub entries',
  after.geometries - before.geometries <= 2, { delta: after.geometries - before.geometries });
check('texture count returns to baseline after 20 hub entries',
  after.textures - before.textures <= 2, { delta: after.textures - before.textures });
check('shader program count does not climb',
  after.programs - before.programs <= 2, { delta: after.programs - before.programs });
const stillDraws = await snap();
check('the hub still renders after 20 teardowns (nothing over-disposed)',
  stillDraws.calls > 5 && stillDraws.tris > 2000, { calls: stillDraws.calls, tris: stillDraws.tris });

// ---------------------------------------------------------------------------

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
