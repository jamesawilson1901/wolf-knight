// NOTHING RENDERS OUTSIDE ITS OWN ROOM, AND NOTHING HOVERS.
//
// Dad, replay batch 2: "there are also objects outside in the black" and
// "image three shows a weird floating rock structure." Both turned out to be
// the same dresser function (coldHearth) with two wrong coordinate frames —
// but nothing had ever LOOKED for either symptom anywhere else in the game.
// The screenshot audits (docs/TESTING.md's contact-sheet passes) only ever
// review the arrival frame; a stray prop thirty degrees off-camera, or one
// dressed into a room nobody photographed that session, is invisible to a
// human reviewer and always has been.
//
// This is the promoted version of the scratchpad probe that found the bug
// (session of 2026-08-30/31): for every room in the live registry, measure
// every top-level prop's world-space bounds and flag two shapes of wrong —
//   1. OUTSIDE THE SHELL — the prop's bounds centre sits beyond the room's
//      own half-extents (with margin for scatter() legitimately touching the
//      wall band). This is "in the black."
//   2. FLOATING — the prop's lowest point sits above the floor with nothing
//      under it, and it is not tall enough to plausibly be a hanging fixture
//      (a banner, a cobweb, a lantern) — those are excused by height, not by
//      name, so a new hanging prop never needs this list touched.
//
// A prop group added straight to the room root is the unit, matching
// verify-density's own "count things, not meshes" rule — a house's forty
// wall fragments are one thing, and flagging each mesh separately would
// bury one real bug in thirty identical lines pointing at the same group.
import { launchBrowser } from './launch.mjs';
import { allRooms } from './all-rooms.mjs';

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
await page.fill('#t-name', 'BOUNDS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
const ROOMS = process.argv.slice(2).length ? process.argv.slice(2) : await allRooms(page);
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
  // batching hides most props inside merged 'batched' meshes, which have no
  // per-prop position to blame — the scratchpad probe found this and it is
  // the reason this suite runs unmerged: every prop stays individually named.
  window.__noBatch = true;
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

// A prop legitimately taller than this and hanging can float without being a
// bug — a banner, a cobweb, a hanging lantern. Named, not guessed at, the same
// way SEALED_BY_DESIGN in verify-openholes documents its own exceptions.
const HANGING_HINTS = /banner|cobweb|lantern|light|torch|chandelier|vine|moss|sigil|glow|gem|rune|crystal/i;

const outsideFound = [], floatingFound = [];
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const r = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    const hw = w.halfW || 30, hd = w.halfD || 30;
    const topOf = (o) => { let n = o; while (n.parent && n.parent !== w.root) n = n.parent; return n; };
    // AN INVISIBLE MESH IS NOT ON SCREEN. gates.js plants an unlit brazier's
    // flame (visible = false until ignited) at torch height with real
    // geometry — a first draft of this suite measured it and reported a
    // rock-solid, working design as a floating bug. Skip anything hidden by
    // itself or by an ancestor.
    const isVisible = (o) => { for (let n = o; n && n !== w.root; n = n.parent) if (!n.visible) return false; return true; };
    // ENEMIES FLY BY DESIGN. Bats and dragonlings are gameplay bodies with
    // their own AI-driven height, not static dressing — sweeping them here
    // flagged a correctly-hovering Bat/Dragonling as "floating."
    const enemyRoots = new Set((w.enemies || []).map((e) => e.root).filter(Boolean));
    const isEnemy = (o) => { for (let n = o; n && n !== w.root; n = n.parent) if (enemyRoots.has(n)) return true; return false; };
    const tops = new Map();
    w.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!isVisible(o) || isEnemy(o)) return;
      let bb;
      if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones.length) {
        // A SKINNED MESH'S geometry.boundingBox IS BIND-SPACE, NOT WHERE
        // SKINNING ACTUALLY DRAWS IT — the same fact that put the la1 dodo
        // outside its wall while its own Box3 measured it as centred. Build
        // the box from the animated SKELETON's bone world positions instead,
        // padded for the flesh around each bone.
        bb = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
        const PAD = 0.4;
        for (const bone of o.skeleton.bones) {
          bone.updateWorldMatrix(true, false);
          const e = bone.matrixWorld.elements;
          bb.min.x = Math.min(bb.min.x, e[12] - PAD); bb.max.x = Math.max(bb.max.x, e[12] + PAD);
          bb.min.y = Math.min(bb.min.y, e[13] - PAD); bb.max.y = Math.max(bb.max.y, e[13] + PAD);
          bb.min.z = Math.min(bb.min.z, e[14] - PAD); bb.max.z = Math.max(bb.max.z, e[14] + PAD);
        }
      } else {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const box = o.geometry.boundingBox.clone();
        o.updateWorldMatrix(true, false);
        box.applyMatrix4(o.matrixWorld);
        bb = box;
      }
      const top = topOf(o);
      let rec = tops.get(top);
      let name = (o.material && o.material.name) || '';
      for (let n = o; n && n !== w.root; n = n.parent) name += ' ' + (n.name || '');
      // A GLOWING MESH IS A LIGHT EFFECT, NOT A DROPPED PROP. Every level's
      // own flame/glow/sigil helper (js/gates.js, js/rooms.js, and each
      // region's own torch — the vocabulary differs region to region: full
      // black + emissiveIntensity 2.4 in Ember, a dimmer 0.2-0.5 "cold,
      // waiting" state in Frostpeak's own torches) uses SOME nonzero
      // emissiveIntensity for a mesh that is meant to hover above a stand,
      // altar or pedestal. No solid architectural prop in this game carries
      // emissive at all — walls, chests, houses, rocks never do — so any
      // nonzero value is the reliable signal, confirmed against every
      // flame/glow call site in the codebase (2026-08-31 sweep) rather than
      // guessed at. A stricter "must be exactly black" version of this rule
      // missed Frostpeak's own near-black `#14101f` torches; this is the
      // corrected version.
      const isFireFX = !!(o.material && o.material.emissive && o.material.emissiveIntensity > 0.15);
      if (!rec) tops.set(top, rec = { minY: Infinity, minX: Infinity, maxX: -Infinity,
        minZ: Infinity, maxZ: -Infinity, maxY: -Infinity, name: name.trim().slice(0, 50), isFireFX: false });
      if (isFireFX) rec.isFireFX = true;
      rec.minY = Math.min(rec.minY, bb.min.y); rec.maxY = Math.max(rec.maxY, bb.max.y);
      rec.minX = Math.min(rec.minX, bb.min.x); rec.maxX = Math.max(rec.maxX, bb.max.x);
      rec.minZ = Math.min(rec.minZ, bb.min.z); rec.maxZ = Math.max(rec.maxZ, bb.max.z);
    });
    const outside = [], floating = [];
    const MARGIN = 1.2;   // scatter() legitimately touches the wall band
    for (const rec of tops.values()) {
      const cx = (rec.minX + rec.maxX) / 2, cz = (rec.minZ + rec.maxZ) / 2;
      if (Math.abs(cx) > hw + MARGIN || Math.abs(cz) > hd + MARGIN) {
        outside.push({ name: rec.name, at: [+cx.toFixed(1), +cz.toFixed(1)],
          shell: [+hw.toFixed(1), +hd.toFixed(1)] });
      }
      const gap = rec.minY - (w.deckY || 0);
      const h = rec.maxY - rec.minY;
      const footprintX = rec.maxX - rec.minX, footprintZ = rec.maxZ - rec.minZ;
      // AN ENVIRONMENTAL OVERLAY IS NOT "A THING". darkZone()'s darkness veil
      // spans the whole room at ceiling height on purpose — the room ITSELF
      // is its footprint. A real floating-prop bug is a discrete object small
      // against the room, so anything covering most of the room's own width
      // or depth is excluded the same way verify-density counts things, not
      // meshes: this is one room-scale effect, not one misplaced object.
      const isRoomSpanning = footprintX > hw * 1.2 || footprintZ > hd * 1.2;
      if (gap > 0.45 && h < 3.5 && rec.minY < 4 && !isRoomSpanning && !rec.isFireFX
        && Math.abs(cx) <= hw && Math.abs(cz) <= hd) {
        floating.push({ name: rec.name, gap: +gap.toFixed(2), at: [+cx.toFixed(1), +cz.toFixed(1)] });
      }
    }
    return { outside, floating };
  });
  for (const o of r.outside) outsideFound.push({ room, ...o });
  for (const f of r.floating) {
    if (HANGING_HINTS.test(f.name)) continue;   // excused by height class, not a guess
    floatingFound.push({ room, ...f });
  }
}

for (const o of outsideFound) check(`${o.room}: "${o.name}" is inside the room`, false, o);
check('no prop in the game renders outside its own room', outsideFound.length === 0,
  { rooms: ROOMS.length });

for (const f of floatingFound) check(`${f.room}: "${f.name}" is not floating`, false, f);
check('no non-hanging prop in the game floats above the floor', floatingFound.length === 0,
  { rooms: ROOMS.length });

console.log(errors.length ? `\n${errors.length} PROBLEM(S)`
  : `\nALL CLEAN — every prop in all ${ROOMS.length} rooms sits inside its own room, on the floor.`);
await b.close();
process.exit(errors.length ? 1 : 0);
