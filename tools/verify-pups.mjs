// EVERY PUP THE COUNTER PROMISES MUST EXIST AND BE REACHABLE.
//
// The HUD has always shown "🐺 found/total", and nothing ever checked that the
// total was findable. Two faults hid behind that: spawnPups() only read the
// numbered pupNSpot markers, so every pup in Stormreach, the Sunken Vale, the
// Shadow Court and the Village was placed by its room and silently never
// spawned; and one Frostpeak pup stood inside a rock, unreachable.
//
// Walkability is tested with resolveCircle, NOT world.blocked(): blocked() is
// the prop keep-out register and matches pup*Spot deliberately (it reserves the
// pup's standing room), so it reports "true" at every correct placement and
// means the opposite of what this file needs.
import { chromium } from 'playwright';

// Every room that should now hold a pup, by region.
const ROOMS = {
  ember:      ['lb1', 'lb2', 'lc1'],
  stoneroot:  ['vap', 'vbp', 'vcp'],
  wildwoods:  ['t1p', 't2p', 't3p'],
  frostpeak:  ['f1b', 'f2b', 'f4'],
  stormreach: ['s1p', 's2p', 's3p'],
  sunkenvale: ['d1p', 'd2p', 'd3p'],
  court:      ['xp1', 'xp2', 'xsh'],
  village:    ['yrw', 'yg2', 'yg5'],
};
const ALL_FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 740, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'PUPS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });

const seen = new Set();
let bad = 0;
for (const [region, rooms] of Object.entries(ROOMS)) {
  for (const room of rooms) {
    await page.evaluate(({ room, forms }) => window.__wkJump(room, forms), { room, forms: ALL_FORMS });
    try {
      await page.waitForFunction((r) => window.__game.world
        && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1 && !window.__wk.gates.transitioning,
      room, { timeout: 45000 });
    } catch { console.log(`  ${region}/${room}: BUILD TIMEOUT`); bad++; continue; }
    await page.waitForTimeout(250);

    const r = await page.evaluate(() => {
      const w = window.__game.world;
      return (w.pups || []).map((p) => {
        // CAN A CHILD STAND ON IT? world.blocked() is the prop keep-out
        // register (it matches pup*Spot on purpose, to reserve the pup's own
        // standing room) so it always says "true" here and means the opposite
        // of what we need. Solid geometry is what resolveCircle pushes out of.
        const s = w.resolveCircle(p.x, p.z, 0.45);
        const push = Math.hypot(s.x - p.x, s.z - p.z);
        return {
          id: p.id, x: p.x, z: p.z,
          push: +push.toFixed(2),
          stuck: push > 0.01,
          hazard: w.hazardAt ? !!w.hazardAt(p.x, p.z) : false,
          inWorld: !!p.root.parent,
        };
      });
    });
    for (const p of r) {
      seen.add(p.id);
      const flag = p.stuck ? ` ✗ STUCK(push ${p.push})` : p.hazard ? " ✗ HAZARD" : "";
      if (p.stuck || p.hazard || !p.inWorld) bad++;
      console.log(`  ${region}/${room}: ${p.id} @(${p.x},${p.z})${flag}`);
    }
    if (!r.length) { console.log(`  ${region}/${room}: — no pup spawned`); bad++; }
  }
}

console.log(`\nDISTINCT PUPS SPAWNED: ${seen.size} (want 24)`);
console.log('ids:', [...seen].sort().join(', '));
if (errors.length) console.log('ERRORS:', errors.slice(0, 10));
console.log(seen.size === 24 && bad === 0 ? '\n✓ PASS' : `\n✗ FAIL (${bad} bad placements)`);
await b.close();
process.exit(seen.size === 24 && bad === 0 ? 0 : 1);
