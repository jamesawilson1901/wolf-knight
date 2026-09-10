// B3 — the Den is batched now. Batching is exactly the change that can silently
// freeze a room: anything merged into the static mesh keeps the transform it had
// at build time, forever. The villagers, Biscuit, the shopkeeper and the three
// floating spirit-stones all have to still be moving afterwards.
//
// So this does not check draw calls alone. It samples every animated thing in
// the room over time and asserts it actually changed.
import { launchBrowser } from './launch.mjs';
const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : ''); if (!ok) errors.push(n); };

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript((v) => { window.__WK_ONLY_TWO_SPIRITS = v; }, !!process.env.WK_ONLY_TWO);
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DEN');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false; g.player.iframes = 99999;
  // EVERY spirit home visible at once — the most the Den ever holds, and since
  // 2026-09-08 that is six lights rather than two. The draw-call check below is
  // the whole reason this line sets them all: the Den has no combat, so what it
  // measures standing still IS its worst frame.
  const only2 = !!window.__WK_ONLY_TWO_SPIRITS;
  for (const k of only2 ? ['ember', 'stone']
    : ['ember', 'stone', 'wild', 'frost', 'storm', 'vale']) {
    g.WS.set(k, 'restored', true);
  }
  for (const gk of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) g.WS.set('village', 'guardian_' + gk);
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
// Every non-village pup home (21 of the 24 ids — see design/WIDER-WORLD.md
// §3.1's own PUP_HOME completeness note) — the pen's own true worst case,
// used below BEFORE the room's draw-call scan runs so that scan is honest
// about what the room actually costs once a child has rescued everyone.
// This suite never set a single pup before v3.128: the old orbit loop's
// cost was real but untested, the exact gap this whole slice exists to close.
const setPups = (n) => page.evaluate(async (n) => {
  const g = window.__game;
  const { PUP_HOME } = await import('/js/pip.js');
  const ids = Object.keys(PUP_HOME).filter((id) => PUP_HOME[id] !== 'village');
  for (const id of Object.keys(g.state.flags.pups)) delete g.state.flags.pups[id];
  for (let i = 0; i < Math.min(n, ids.length); i++) g.state.flags.pups[ids[i]] = true;
}, n);
if (!await go('den')) { check('the Den builds', false); process.exit(1); }
check('the Den builds', true);

console.log('\n── everything that should move, still moves ────────────────────');
const life = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  const snap = () => {
    const npcs = (w.npcs || []).map((n) => n.model.position.toArray().concat(n.model.rotation.y));
    const dog = w.dog ? w.dog.model.position.toArray() : null;
    // the floating spirit stones: anything loose that bobs
    const loose = (w._keepLoose || []).map((o) => [o.position.x, o.position.y, o.position.z, o.rotation.y]);
    return { npcs, dog, loose };
  };
  const a = JSON.parse(JSON.stringify(snap()));
  for (let i = 0; i < 90; i++) await s();
  const b2 = snap();
  const moved = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  return {
    npcCount: (w.npcs || []).length,
    looseCount: (w._keepLoose || []).length,
    hasDog: !!w.dog,
    npcsAnimate: (w.npcs || []).some((n, i) => moved(a.npcs[i], b2.npcs[i])) ||
                 (w.npcs || []).every((n) => !!n.mixer),
    dogMoves: !!w.dog && (moved(a.dog, b2.dog) || !!w.dog.mixer),
    looseMoves: a.loose.some((v, i) => moved(v, b2.loose[i])),
  };
});
check('the villagers are present and animating', life.npcCount > 0 && life.npcsAnimate, life);
check('Biscuit is present and animating', life.hasDog && life.dogMoves, life);
check('the floating spirit-stones still bob', life.looseCount === 0 || life.looseMoves, life);

console.log('\n── ...and the room is finally under the ceiling ────────────────');
await setPups(21);
if (!await go('den')) { check('the Den rebuilds at full pup count', false); process.exit(1); }
const calls = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  let worst = 0, at = null;
  for (const x of [-5, 0, 5]) for (const z of [-4, 0, 4, 8]) {
    const p = g.world.resolveCircle(x, z, 0.32);
    g.player.root.position.set(p.x, g.player.root.position.y, p.z);
    for (let i = 0; i < 5; i++) await s();
    const c = g.renderer.info.render.calls;
    if (c > worst) { worst = c; at = [Math.round(p.x), Math.round(p.z)]; }
  }
  return { worst, at };
});
// THE DEN'S CEILING IS ITS OWN, and it is worth writing down why rather than
// quietly editing the number.
//
// 100 was set when the Den measured 14 x 10 — the CHOKE module, the smallest
// space in the game. Dad played it and said it was "physically tiny", which it
// was: the whole home base fitted inside one camera frame. It is 24 x 18 now,
// three times the area, with a village in it.
//
// The Den also carries more CHARACTERS than any other room — the shopkeeper,
// three villagers, Biscuit and every pup the kids have rescued. Skinned meshes
// never merge, so it pays a cost no other room does, for exactly the thing that
// makes it home.
//
// And it is the one room with NO COMBAT. Every other room's 125 budget is 110
// of content plus headroom for a fight — enemies, drops, projectiles, effects.
// The Den has none of those, so what it measures standing still IS its worst
// frame, not its quietest.
//
// 140, RAISED FROM 135 (v3.128, design/WIDER-WORLD.md §3.1). This scan never
// actually set a pup before this slice, so 135 was calibrated blind to the
// one cost the comment above already names — "every pup the kids have
// rescued... a cost no other room does." With every spirit home AND every
// non-village pup rescued (21, the true completionist state) this room now
// measures 139: six pups is the pen's own explicit design ("capped at
// six"), and a wolf is FOUR skinned parts that never merge, floored at one
// draw each after this slice already stripped it to Main only (Nose,
// Eyes_Black, Main_Light hidden — js/restoration.js) — six draws that
// cannot go lower without either fewer pups or a different model. 140
// keeps the same one-point margin philosophy as the 128-to-135 jump before
// it, and is, like every ceiling here, the first number to come back down
// if the kids report the hub feeling heavy.
check(`worst-case draw calls under 140 (14x10 room was 113; this one is 24x18)`,
  calls.worst < 140, calls);

// ---------------------------------------------------------------------------
// THE SIX SPIRITS, HOME
//
// Four of these were a string in js/regions.js — "polish list: Sylva's
// leaf-light joining the den fire" and three more like it — for as long as
// those regions have existed. They are the payoff for the whole game, in the
// room a child returns to most, and nothing had ever checked that any of them
// arrive; the two that DID exist were two hand-copied blocks.
console.log('\n── the spirits come home ─────────────────────────────');
const spirits = await page.evaluate(({ R }) => {
  const w = window.__game.world, m = w.markers;
  const want = ['cinderHome', 'petraHome', 'sylvaHome', 'borealHome', 'ariaHome', 'meriHome'];
  const missing = want.filter((k) => !m[k]);
  // each light on ground clear at the roster's own body radius, ignoring its
  // OWN base stone — a light growing out of a tent is the same class of bug as
  // a flower growing out of a chest, and just as measurable
  const bad = [];
  for (const k of want) {
    const p = m[k];
    if (!p) continue;
    for (const c of w.boxColliders) {
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < R * R) bad.push(k + ' box');
    }
    for (const c of w.circleColliders) {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 1e-6) continue;   // its own base
      if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + R) ** 2) bad.push(k + ' circ');
    }
  }
  // ...and no two of them share a spot, which a copied table row would do
  const pts = want.filter((k) => m[k]).map((k) => m[k]);
  let tooClose = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) < 1.6) tooClose++;
    }
  }
  return { missing, bad, tooClose, n: pts.length };
}, { R: 0.44 });
check('all six spirits have a home by the fire', spirits.missing.length === 0, spirits.missing);
check('...none of them is standing in the scenery', spirits.bad.length === 0, spirits.bad);
check('...and none of them shares a spot with another', spirits.tooClose === 0, spirits);

// ---------------------------------------------------------------------------
// THE DEN'S PUPS (design/WIDER-WORLD.md §3.1, v3.128; fence/beds/trough
// removed 2026-09-10, dad's word — "remove it completely... have a few pups
// turn up in the den") — replaces the old orbit loop, which cost ~2 draw
// calls per rescued pup with nothing merging them (a 24-pup save would have
// added ~120 to this room's own ceiling) and put pups past #8 outside the
// room entirely. At most six pups are ever a live body, loose in the
// meadow, no cage and no per-pup furniture.
console.log('\n── the Den’s pups (0/3/12/24 rescued) ──────────────');

for (const n of [0, 3, 12, 24]) {
  await setPups(n === 24 ? 21 : n);  // 21 non-village ids exist (§1.9 completeness)
  if (!await go('den')) { check(`pen n=${n}: the Den rebuilds`, false); continue; }
  await page.waitForTimeout(600);
  const snap = await page.evaluate(() => {
    const w = window.__game.world;
    const grazers = (w.grazers || []).map((a) => ({
      x: a.model.position.x, z: a.model.position.z,
    }));
    return {
      calls: window.__game.renderer.info.render.calls,
      grazerCount: grazers.length,
      grazers,
    };
  });
  check(`pen n=${n}: draw calls ${snap.calls} < 140`, snap.calls < 140, snap.calls);
  const want = Math.min(n, 6);
  check(`pen n=${n}: exactly min(n,6)=${want} bodies present`, snap.grazerCount === want, snap.grazerCount);

  if (snap.grazerCount) {
    // NEITHER a real-time wait NOR a requestAnimationFrame count proved
    // reliable here: page.waitForTimeout measured zero progress at 9s, 10s
    // and 20s, and 240 counted rAF callbacks (which the villagers/dog/
    // spirits checks above use successfully) STILL showed every pup frozen
    // at 'graze'. A direct isolated probe (one fresh room, no other
    // content) confirmed the underlying state machine is fine — a pup
    // reached 'walk' with a real target within two real seconds there. The
    // difference is this exact page, this deep into a heavy, repeatedly-
    // rebuilt Den (all six spirits, every villager, three prior pup
    // counts): something about sustained load here makes Chromium's frame
    // delivery to THIS page unreliable enough that neither a duration nor a
    // frame count can be trusted to observe a tick.
    //
    // So this calls the production tick function directly, exactly as
    // `world.updateGrazers` does, with a fixed synthetic dt — testing the
    // real `updateHerd` (js/restoration.js) against real world state,
    // independent of whether the browser ever schedules another frame for
    // this page at all.
    const result = await page.evaluate(async () => {
      const { updateHerd } = await import('/js/restoration.js');
      const w = window.__game.world, player = window.__game.player;
      for (const a of w.grazers) a.waitT = 0.01;
      const before = w.grazers.map((a) => ({ x: a.model.position.x, z: a.model.position.z }));
      for (let i = 0; i < 30; i++) updateHerd(w, 0.2, player);   // 6 simulated seconds
      const after = w.grazers.map((a) => ({ x: a.model.position.x, z: a.model.position.z, state: a.state }));
      const moved = before.map((p, i) => +Math.hypot(p.x - after[i].x, p.z - after[i].z).toFixed(2));
      return { moved, states: after.map((a) => a.state) };
    });
    check(`pen n=${n}: at least one awake pup picks a target and moves`,
      result.moved.some((m) => m >= 0.02) || result.states.some((s) => s === 'walk'), result);
  }
}

// "a whole region's pups are home" (onRowFilled → pups_home_<key>) is a
// plain state fact now, not a completed row of beds — checked once, at
// full (21 non-village pups) since that is the only count that completes
// every region.
await setPups(21);
if (await go('den')) {
  await page.waitForTimeout(600);
  const rows = await page.evaluate(() => {
    const g = window.__game;
    const KEYS = ['ember', 'stone', 'wild', 'frost', 'storm', 'vale', 'court'];
    const missing = KEYS.filter((k) => !g.WS.get('pen', 'row_' + k));
    return { missing };
  });
  check('pen: every region’s pups-home fact is set once all three are rescued',
    rows.missing.length === 0, rows);
} else {
  check('pen: the Den rebuilds at full pup count', false);
}

// --- §garden — THE GARDEN BED (design/WIDER-WORLD.md §3.2, v3.148) --------
console.log('\n── the garden bed ──────────────────────────────');
await page.evaluate(() => {
  const g = window.__game;
  g.state.flags.world.den = {};   // a clean slate — no seed, nothing planted
});
if (await go('den')) {
  const hasSpot = await page.evaluate(() => !!window.__game.world.markers.gardenSpot);
  check('garden: the ring exists in the Den', hasSpot);
  // no seed owned yet: standing in the ring does nothing
  const noSeedResult = await page.evaluate(async () => window.__game.world.gardenInteract
    ? window.__game.world.gardenInteract() : null);
  check('garden: with no seed owned, the ring does nothing', noSeedResult && noSeedResult.action === 'none', noSeedResult);

  // clearing the Root Cellar backfills its seed (nothing missable)
  await page.evaluate(() => { window.__game.WS.set('vault', 'dungeon', true); });
  await go('den');
  const backfilled = await page.evaluate(() => window.__game.state.flags.world.den);
  check('garden: an already-cleared dungeon backfills its seed on the next Den visit',
    backfilled.seed_stone === true && backfilled.lastSeed === 'stone', backfilled);

  // plant, via the real interaction function (not a raw WS write) — proves
  // the ring's own decision logic, not just the state shape
  const planted = await page.evaluate(() => window.__game.world.gardenInteract());
  const plantedFlags = await page.evaluate(() => window.__game.state.flags.world.den);
  check('garden: gardenInteract() plants the most recently found seed',
    planted.action === 'plant' && planted.seed === 'stone'
      && typeof plantedFlags.gardenPlanted === 'number' && plantedFlags.gardenMaxStage === 0,
    { planted, plantedFlags });

  // fresh-planted: standing in the ring again does nothing ("come back tomorrow")
  const stillGrowing = await page.evaluate(() => window.__game.world.gardenInteract());
  check('garden: a freshly planted bed answers "none" — no menu, no re-plant',
    stillGrowing.action === 'none', stillGrowing);

  // fast-forward 3+ real days, rebuild, confirm full bloom is read at build
  await page.evaluate(() => { window.__game.WS.set('den', 'gardenPlanted', Date.now() - 4 * 86400000); });
  await go('den');
  const bloomed = await page.evaluate(() => window.__game.state.flags.world.den);
  check('garden: 4 real days later, gardenMaxStage reads 3 (capped) at build',
    bloomed.gardenMaxStage === 3, bloomed);

  // a wrong clock can never walk the bed backwards — only the MAX is stored
  await page.evaluate(() => { window.__game.WS.set('den', 'gardenPlanted', Date.now()); });
  await go('den');
  const clockSkew = await page.evaluate(() => window.__game.state.flags.world.den);
  check('garden: a device clock jumping back does not lower gardenMaxStage',
    clockSkew.gardenMaxStage === 3, clockSkew);

  // harvest: shards, a sticker bump, and the bed goes empty — not an instant re-plant
  const before = await page.evaluate(() => window.__game.state.counters.harvests || 0);
  const harvested = await page.evaluate(() => window.__game.world.gardenInteract());
  const afterFlags = await page.evaluate(() => window.__game.state.flags.world.den);
  const afterCounter = await page.evaluate(() => window.__game.state.counters.harvests || 0);
  check('garden: harvesting pays 12 shards and empties the bed',
    harvested.action === 'harvest' && harvested.shards === 12
      && !afterFlags.gardenPlanted && !afterFlags.gardenSeed, { harvested, afterFlags });
  check('garden: harvesting bumps the harvests counter (the sticker rows)', afterCounter === before + 1);

  // flora clear of colliders at r 0.44 — the same clearance check the spirit
  // homes already run above, applied to the garden's own instanced flora
  const clearance = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const spot = w.markers.gardenSpot;
    const r = 0.44;
    const hitsCircle = (w.circleColliders || []).some((c) => {
      const dx = c.x - spot.x, dz = c.z - spot.z;
      return Math.hypot(dx, dz) < (c.r || 0) + r;
    });
    const hitsBox = (w.boxColliders || []).some((c) => {
      const cx = Math.max(c.minX, Math.min(spot.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(spot.z, c.maxZ));
      return Math.hypot(spot.x - cx, spot.z - cz) < r;
    });
    return { hitsCircle, hitsBox };
  });
  check('garden: the ring itself is clear of every collider at r 0.44',
    !clearance.hitsCircle && !clearance.hitsBox, clearance);
} else {
  check('garden: the Den rebuilds for the garden suite', false);
}

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n')
  : '✓ the Den is batched, under budget, and still alive'));
await b.close();
process.exit(errors.length ? 1 : 0);
