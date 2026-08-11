// IS ANYTHING HOVERING?
//
// Dad, on a screenshot of Ember Hollow: "Image 1 shows floating rocks."
//
// A prop that hangs above the floor is the cheapest possible way to break a
// child's belief in a place, and it is invisible to every other suite — the
// room builds, the doors work, the draw calls fit, and a rock hangs in the air.
// The camera is a fixed 50-degree offset, so a gap of a few centimetres reads
// clearly as floating rather than as resting.
//
// This measures the bottom of every rendered thing against the floor it stands
// on, and reports what does not touch. Things that are MEANT to be off the
// ground are listed by name.
//
// IT MUST RUN BEFORE THE ROOM IS BATCHED. flattenStatic merges scenery by
// material and cell, so forty rocks become one mesh — and the lowest corner of
// that mesh is whichever rock sits lowest. A single rock hanging in the air
// hides behind its grounded neighbours and the room measures clean, which is
// precisely what happened on the first pass: dad could see floating rocks on a
// screen while this file reported all fourteen Ember Hollow rooms fine.
//
// So it sets window.__noBatch before building, and every prop stays separate.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// Things that hang, hover or fly on purpose.
const ALLOWED = /banner|torch|cobweb|flame|fire|light|glow|coin|shard|moth|wisp|bat|spark|veil|wind|water|decal|threshold|arch|lintel|bridge|vane|relic|eye|socket|mirror|sky|cloud|rain|snow|bar|hud/i;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'GROUND');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate((GAPENV) => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.player.iframes = 999999;
  window.__noBatch = true;   // build rooms unmerged, so every prop can be seen
  window.__gapThreshold = Number(GAPENV) || 0.12;
}, process.env.GROUND_GAP || '');

const ROOMS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4', 'le'];

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

console.log('\n── everything rests on something ─────────────────────');
let worstAll = null;
let checkedUnmerged = false;
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  // Prove the switch took hold on a room built AFTER it was set. Asserting it
  // up front tested the boot room, which was already merged — the check failed
  // on its first run for that reason, which is the point of having it.
  if (!checkedUnmerged) {
    checkedUnmerged = true;
    check('flattenStatic is switched off, so props are separate',
      await page.evaluate(() => !!window.__game.world._batchSkipped),
      { note: 'without this a hovering prop hides inside its batch' });
  }
  const floaters = await page.evaluate((allowedSrc) => {
    const allowed = new RegExp(allowedSrc.slice(1, allowedSrc.lastIndexOf('/')),
      allowedSrc.slice(allowedSrc.lastIndexOf('/') + 1));
    const g = window.__game, w = g.world;
    const deck = w.deckY || 0;
    const GAP = window.__gapThreshold || 0.12;

    // MEASURE THE PROP, NOT ITS PARTS.
    //
    // The first version tested every MESH, and reported a wolf pup's nose as a
    // floating object — which it is, and so is every nose. What has to touch
    // the floor is the WHOLE THING: a rock, a crate, a ruin. So each mesh is
    // charged to the top-level prop it belongs to, and the prop is judged by
    // its lowest point.
    const props = new Map();
    const topOf = (o) => { let n = o; while (n.parent && n.parent !== w.root) n = n.parent; return n; };

    w.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const name = ((o.name || '') + ' ' + ((o.material && o.material.name) || '')
        + ' ' + ((o.parent && o.parent.name) || ''));
      if (allowed.test(name)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // flames, glows and decals are meant to hang
      if (mats.some((m) => m && ((m.emissive
        && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) || m.transparent))) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone();
      o.updateWorldMatrix(true, false);
      bb.applyMatrix4(o.matrixWorld);
      const top = topOf(o);
      let rec = props.get(top);
      if (!rec) props.set(top, rec = { minY: Infinity, maxY: -Infinity,
        minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
        name: (top.name || o.name || '(unnamed)').slice(0, 34) });
      rec.minY = Math.min(rec.minY, bb.min.y); rec.maxY = Math.max(rec.maxY, bb.max.y);
      rec.minX = Math.min(rec.minX, bb.min.x); rec.maxX = Math.max(rec.maxX, bb.max.x);
      rec.minZ = Math.min(rec.minZ, bb.min.z); rec.maxZ = Math.max(rec.maxZ, bb.max.z);
    });

    // creatures stand where their rig puts them; this suite is about scenery
    const alive = [g.player, w.boss, w.warden, ...(w.enemies || []),
      ...(w.watchers || []), ...(w.pups || [])];
    const out = [];
    for (const rec of props.values()) {
      const cx = (rec.minX + rec.maxX) / 2, cz = (rec.minZ + rec.maxZ) / 2;
      if (alive.some((e) => {
        if (!e || e.dead) return false;
        const ex = e.x !== undefined ? e.x : (e.root && e.root.position.x);
        const ez = e.z !== undefined ? e.z : (e.root && e.root.position.z);
        return ex !== undefined && Math.hypot(ex - cx, ez - cz) < 2.5;
      })) continue;
      const gap = rec.minY - deck;
      const h = rec.maxY - rec.minY;
      if (gap > GAP && h < 3.0 && rec.minY < deck + 3.0) {
        out.push({ name: rec.name, gap: +gap.toFixed(2), h: +h.toFixed(2),
          at: [+cx.toFixed(1), +cz.toFixed(1)] });
      }
    }
    out.sort((a, b) => b.gap - a.gap);
    return out;
  }, ALLOWED.toString());
  const worst = floaters[0];
  if (worst && (!worstAll || worst.gap > worstAll.gap)) worstAll = { room, ...worst };
  check(`${room}: nothing hovers`, floaters.length === 0,
    floaters.length ? { count: floaters.length, worst: floaters.slice(0, 4) } : undefined);
}

if (worstAll) console.log('\nworst offender:', JSON.stringify(worstAll));

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — it all sits on the ground.'));
await b.close();
process.exit(errors.length ? 1 : 0);
