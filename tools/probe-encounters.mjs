// A9 — WHAT DOES ONE MORE ENEMY COST?
//
// An encounter pass is not a free edit. A9 discovered in v3.28 that a character
// rig never merges into the static batch (flattenStatic skips skinned meshes),
// so every enemy in a room is its own handful of draw calls, forever.
//
// THE CEILING IS 125, NOT 100 (corrected 2026-09-05). This tool was written
// against Level 3's old 100 and kept it hardcoded long after the shipping
// budget moved: every verify-level*.mjs and verify-density.mjs asserts
// `calls <= 125`, and verify-level1 records why — 125 is "110 plus a working
// margin", 110 being what a room dressed to ROOM-STANDARD.md actually costs.
// A stale 100 here reports every room as 25 calls poorer than it is, which is
// exactly the kind of number someone then deletes content to satisfy. It did:
// two Shadow Court placements came out at 101 and 105 before this was caught.
//
// It is NOT a measured device limit, and verify-level1 says so: SwiftShader is
// a CPU rasteriser and its timings say nothing about a phone GPU. If the kids
// report jank, this number is the first thing to come back down.
//
// So before placing anything: measure the room WITH its enemies and WITHOUT
// them, per room, in dressed art. The difference is what a placement costs and
// the remainder is what the room can afford.
import { chromium } from 'playwright';

const BUDGET = +(process.env.WK_BUDGET || 125);

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'ENC');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
  g.state.settings.greybox = false;
  g.player.iframes = 99999;
  g.WS.set('wild3', 'rootCut', true); g.WS.set('wild3', 'logDown', true);
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

const ROOMS = (process.env.WK_ROOMS || 't1a,t1b,t1p,tc1,t2a,t2b,t2p,tsh,tc2,'
  + 't3a,t3b,t3p,tkn,tc3,t4a,t4b,t4p,tc4,tgl,tsA,tsB').split(',');

console.log('room   calls  bare  enemies  per-enemy  headroom  cast');
console.log('─'.repeat(78));
const rows = [];
for (const id of ROOMS) {
  if (!await go(id)) { console.log(`${id.padEnd(6)} FAILED TO BUILD`); continue; }
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await s();
    const withAll = g.renderer.info.render.calls;
    const cast = (g.world.enemies || []).filter((e) => !e.dead)
      .map((e) => e.constructor.name);
    // hide every enemy rig and re-render: the delta is what the cast costs
    const hidden = [];
    for (const e of (g.world.enemies || [])) {
      const o = e.model || e.root;
      if (o && o.visible) { o.visible = false; hidden.push(o); }
    }
    await s();
    const bare = g.renderer.info.render.calls;
    for (const o of hidden) o.visible = true;
    await s();
    return { withAll, bare, cast };
  });
  const n = r.cast.length;
  const per = n ? ((r.withAll - r.bare) / n).toFixed(1) : '—';
  const headroom = BUDGET - r.withAll;
  const spare = n && per !== '—' ? Math.floor(headroom / ((r.withAll - r.bare) / n)) : '?';
  rows.push({ id, ...r, n, per, headroom, spare });
  console.log(`${id.padEnd(6)} ${String(r.withAll).padStart(4)}  ${String(r.bare).padStart(4)}  ` +
    `${String(n).padStart(6)}  ${String(per).padStart(8)}  ${String(headroom).padStart(7)}  ` +
    `${r.cast.join(',') || '(empty)'}`);
}

console.log('\n── what each room can still afford ────────────────────────────');
const costs = rows.filter((r) => r.n > 0).map((r) => (r.withAll - r.bare) / r.n);
const avg = costs.length ? costs.reduce((a, c) => a + c, 0) / costs.length : 0;
console.log(`measured cost of one enemy: ${avg.toFixed(1)} draw calls (${costs.length} samples)`);
for (const r of rows) {
  const room = BUDGET - r.withAll;
  console.log(`  ${r.id.padEnd(5)} has ${String(room).padStart(3)} calls spare → ` +
    `room for ${avg ? Math.floor(room / avg) : '?'} more`);
}
if (errs.length) console.log('\nPAGE ERRORS:\n' + errs.join('\n'));
await b.close();
