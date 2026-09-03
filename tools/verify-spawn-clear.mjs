// Every enemy must spawn on walkable floor, not inside a wall run, a hero prop,
// a bramble, a boulder or a promise-gate alcove. A stuck enemy is worse than no
// enemy: it never reaches the child and never stops being on the screen.
//
// IT USED TO MEAN "EVERY ENEMY IN THE WILD WOODS." The header said every enemy
// and the list said twenty-one `t*` rooms — one region out of ten, hand-typed,
// and never revisited as five more regions shipped past it. That is the fourth
// hand-kept list this project has caught rotting (docs/TESTING.md §7a(ii)), and
// the fix is the same one every time: ask the game.
//
// It also no longer teleports. `buildRoom` spawns a room's enemies as part of
// building it, so the whole registry can be measured in one pass instead of one
// death-and-respawn per room — which is what made covering everything look
// expensive in the first place.
import { launchBrowser } from './launch.mjs';
import { allRooms } from './all-rooms.mjs';

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'CLEAR');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.WS.set('wild3', 'rootCut', true); g.WS.set('wild3', 'logDown', true); });

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const ROOMS = only.length ? only : await allRooms(page);
console.log(`asking the game: ${ROOMS.length} rooms`);

const rows = await page.evaluate(async (ids) => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');
  const out = [];
  for (const id of ids) {
    let w;
    try { w = await rooms.buildRoom(id, new THREE.Scene()); }
    catch (e) { out.push({ id, error: String(e && e.message || e) }); continue; }
    const bodies = [];
    for (const e of (w.enemies || [])) {
      if (e.scenery || !e.root) continue;
      // A FLYER IS NOT STUCK BECAUSE SOMETHING IS UNDER IT. Bats, moths and
      // wasps hover clear of the floor and a collider beneath them is scenery,
      // not a cage — the same distinction verify-bounds had to learn about
      // gameplay bodies.
      if (e.flying) continue;
      const x = e.x, z = e.z, R = e.radius || 0.4;
      let hit = null;
      for (const c of w.boxColliders) {
        const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) { hit = 'box'; break; }
      }
      if (!hit) for (const c of w.circleColliders) {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + R) ** 2) { hit = 'circle'; break; }
      }
      bodies.push({ cls: e.constructor.name, x: +x.toFixed(1), z: +z.toFixed(1), hit });
    }
    out.push({ id, bodies });
  }
  return out;
}, ROOMS);

let bad = 0, n = 0, roomsWithFoes = 0;
const broke = [];
for (const r of rows) {
  if (r.error) { broke.push(r); continue; }
  if (r.bodies.length) roomsWithFoes++;
  for (const e of r.bodies) {
    n++;
    if (e.hit) { bad++; console.log(`  ✗ ${r.id} ${e.cls} @(${e.x},${e.z}) spawns INSIDE a ${e.hit} collider`); }
  }
}
if (broke.length) for (const r of broke) console.log(`  ✗ ${r.id} FAILED TO BUILD: ${r.error}`);
console.log(`\nchecked ${n} bodies across ${roomsWithFoes} rooms that carry any`);
console.log(bad || broke.length
  ? `\n✗ ${bad}/${n} enemies spawn inside geometry${broke.length ? `, ${broke.length} room(s) failed to build` : ''}`
  : `\n✓ all ${n} enemies spawn on clear floor`);
if (pageErrors.length) console.log('page errors:', JSON.stringify(pageErrors.slice(0, 3)));
await b.close();
process.exit(bad || broke.length ? 1 : 0);
