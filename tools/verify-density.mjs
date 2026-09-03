// THE VERIFIER THAT CAN FAIL A BORING ROOM.
//
// Every topology assertion in this repo passed while the rooms were empty
// boxes. verify-level1 checked that the spine connects, that no pocket is a
// dead end, that the draw calls fit and that nothing is buried in the blind
// strip — and all of it was green on rooms dad played and described as
// "largely filled with nothing… big but bare".
//
// design/ROOM-STANDARD.md says plainly: **a verifier cannot tell you a room is
// boring.** That is true of TASTE. It is not true of EMPTINESS, which is a
// number, and the number was never taken. This takes it.
//
// The measurement that matters is not "how many props are in the room" — the
// old rooms could have passed that by piling everything in a corner, and `la`'s
// first dressed pass did exactly that by accident. It is:
//
//     HOW MUCH IS IN THE FRAME THE CHILD ACTUALLY SEES?
//
// The camera is a fixed world-space offset (design/METRICS.md): it never
// rotates and never changes distance, so the visible rectangle around the
// player is known and constant — 22.2u wide at Kael, 12.9u ahead of him, 4.5u
// behind. Every room is therefore checked at its own SPAWN POINT, in the exact
// frame that opens when a child walks in.
import { launchBrowser } from './launch.mjs';
import { allRooms } from './all-rooms.mjs';

// design/METRICS.md, measured (C3), at the shipping 740x360 landscape aspect
const AHEAD = 12.9, BEHIND = 4.5, HALF_W = 22.2 / 2;

// Floors are per-room canvases now (js/ground.js) and a flat one is a bug, so
// the floor is sampled rather than trusted.
const MIN_FLOOR_STDDEV = 6;      // 0-255 per channel; a flat fill scores 0

const errors = [];
const warns = [];
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
await page.fill('#t-name', 'DENSITY');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  // regions five and six only exist once their doors are open
  g.state.flags.borealDefeated = true;
  g.state.flags.ariaDefeated = true;
  g.state.flags.meriDefeated = true;
  for (const r of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + r);
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
  g.player.iframes = 999999;
  g.WS.set('wild3', 'rootCut', true); g.WS.set('wild3', 'logDown', true);
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      // world.roomId (stamped by the room's own builder, the last step of an
      // async rebuild) is the identity a race can't forge — state.room flips
      // the instant a jump is requested, before that rebuild even starts.
      // See verify-level3.mjs for the false-failure this raced into once.
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

// ROOMS, and what each one is allowed to be. A boss arena is SUPPOSED to have
// an empty middle — the Shadowgrip's charge needs somewhere to run — and a dark
// puzzle room is supposed to be readable rather than busy. Writing the
// exemptions down beside the rule is the difference between a standard and a
// nuisance: a blanket minimum would push clutter into exactly the two rooms
// where clutter is a bug.
// AND THE LIST HAS TO BE COMPLETE. Unlike verify-level1's room lists, this one
// cannot be derived — the `kind` beside each id is a JUDGEMENT (a boss arena is
// SUPPOSED to have an empty middle) and no table in the game carries it. What
// can be checked is whether it covers the live registry, and on 2026-09-02 it
// did not: Ember Deep's three rooms had shipped that morning and this suite had
// never looked at them, then the Drowned Market's two arrived the same way. A
// room missing from here is not a failure, it is SILENCE — the suite prints ALL
// CLEAN over content it never opened. The check at the bottom of this file
// turns that silence into a failure.
const ROOMS = [
  // Ember Hollow
  { id: 'la',  kind: 'island' }, { id: 'la1', kind: 'pocket' }, { id: 'lg1', kind: 'choke' },
  { id: 'lb',  kind: 'island' }, { id: 'lb1', kind: 'pocket' }, { id: 'lb2', kind: 'pocket' },
  { id: 'lg2', kind: 'choke' },  { id: 'lc',  kind: 'island' }, { id: 'lc1', kind: 'pocket' },
  { id: 'lg3', kind: 'choke' },  { id: 'ld',  kind: 'island' }, { id: 'ld1', kind: 'puzzle' },
  { id: 'lg4', kind: 'choke' },  { id: 'le',  kind: 'arena' },
  { id: 'lk1', kind: 'pocket' }, { id: 'lk2', kind: 'island' }, { id: 'lk3', kind: 'pocket' },
  // The Night Road — the road between Ember Hollow and Stoneroot
  { id: 'n1',  kind: 'island' }, { id: 'n2',  kind: 'island' },
  // The Greenway — the road between Stoneroot and the Wild Woods
  { id: 'g1',  kind: 'island' }, { id: 'g2',  kind: 'island' },
  // The Drowned Market — the road between Frostpeak and Stormreach
  { id: 'q1',  kind: 'island' }, { id: 'q2',  kind: 'island' },
  // ── AUDITED IN 2026-09-03 ────────────────────────────────────────────────
  // Twenty-six live rooms had never been looked at by this suite: the whole
  // Moonlit Spire, the whole Village, the Den, and all of Frostpeak. Not
  // failing — SILENT, which is worse, because the run printed ALL CLEAN over
  // them. The completeness check below is what found them; these kinds are
  // read off each area's own spec table where it has one (levelVillage's LV,
  // levelSpire's LM) and from the room's job where it does not.
  // The Moonlit Spire
  { id: 'm1',  kind: 'choke' },  { id: 'm2',  kind: 'choke' },
  { id: 'ma',  kind: 'pocket' }, { id: 'mb',  kind: 'pocket' },
  { id: 'm3',  kind: 'arena' },
  // The Village — the square is the hub, the rest are streets
  { id: 'ysq', kind: 'island' }, { id: 'yhs', kind: 'pocket' },
  { id: 'ylw', kind: 'pocket' }, { id: 'yg1', kind: 'pocket' },
  { id: 'yg2', kind: 'pocket' }, { id: 'yg3', kind: 'pocket' },
  { id: 'yg4', kind: 'pocket' }, { id: 'yg5', kind: 'pocket' },
  { id: 'yg6', kind: 'pocket' }, { id: 'yrw', kind: 'pocket' },
  // The Den is the safe hub: no combat, and its density is villagers and homes
  { id: 'den', kind: 'island' },
  // Live legacy rooms (the eleven audited in 2026-08-29, see all-rooms.mjs)
  { id: 'e2',  kind: 'island' }, { id: 'e2b', kind: 'pocket' },
  { id: 'w3',  kind: 'island' },
  // Frostpeak, never rebuilt and never measured
  { id: 'f1',  kind: 'island' }, { id: 'f1b', kind: 'pocket' },
  { id: 'f2',  kind: 'island' }, { id: 'f2b', kind: 'pocket' },
  { id: 'f3',  kind: 'island' }, { id: 'f4',  kind: 'island' },
  { id: 'f5',  kind: 'arena' },
  // Stoneroot Caverns
  { id: 'vh',  kind: 'island' }, { id: 'vga', kind: 'choke' },  { id: 'va1', kind: 'island' },
  { id: 'va2', kind: 'island' }, { id: 'vap', kind: 'pocket' }, { id: 'va3', kind: 'puzzle' },
  { id: 'vgb', kind: 'choke' },  { id: 'vb1', kind: 'island' }, { id: 'vb2', kind: 'island' },
  { id: 'vbp', kind: 'pocket' }, { id: 'vb3', kind: 'puzzle' }, { id: 'vgc', kind: 'choke' },
  { id: 'vc1', kind: 'island' }, { id: 'vc2', kind: 'island' }, { id: 'vcp', kind: 'pocket' },
  { id: 'vc3', kind: 'pocket' }, { id: 'vz',  kind: 'arena' },
  // The Wild Woods
  { id: 't1a', kind: 'island' }, { id: 't1b', kind: 'island' }, { id: 't1p', kind: 'pocket' },
  { id: 'tc1', kind: 'choke' },  { id: 't2a', kind: 'island' }, { id: 't2b', kind: 'island' },
  { id: 't2p', kind: 'pocket' }, { id: 'tsh', kind: 'pocket' }, { id: 'tc2', kind: 'choke' },
  { id: 't3a', kind: 'island' }, { id: 't3b', kind: 'island' }, { id: 't3p', kind: 'pocket' },
  { id: 'tkn', kind: 'puzzle' }, { id: 'tc3', kind: 'choke' },  { id: 't4a', kind: 'island' },
  { id: 't4b', kind: 'island' }, { id: 't4p', kind: 'pocket' }, { id: 'tc4', kind: 'choke' },
  { id: 'tgl', kind: 'arena' },  { id: 'tsA', kind: 'pocket' }, { id: 'tsB', kind: 'pocket' },
  // Stormreach Cliffs. The STAIR is a new module and gets measured as a choke:
  // it is the same job — compression and rest between islands — in a longer,
  // narrower box, and holding it to the island bar would only push clutter into
  // a space whose whole point is that you walk through it.
  { id: 's1a', kind: 'island' }, { id: 's1b', kind: 'island' }, { id: 's1p', kind: 'pocket' },
  { id: 'sc1', kind: 'choke' },  { id: 's2a', kind: 'island' }, { id: 's2b', kind: 'island' },
  { id: 's2p', kind: 'pocket' }, { id: 'ssh', kind: 'pocket' }, { id: 'sc2', kind: 'choke' },
  { id: 's3a', kind: 'island' }, { id: 's3b', kind: 'island' }, { id: 's3p', kind: 'pocket' },
  { id: 'svn', kind: 'puzzle' }, { id: 'sc3', kind: 'choke' },  { id: 's4a', kind: 'island' },
  { id: 's4b', kind: 'island' }, { id: 's4p', kind: 'pocket' }, { id: 'sc4', kind: 'choke' },
  { id: 'scr', kind: 'arena' },  { id: 'ssA', kind: 'choke' },
  // The Sunken Vale. The RIM is measured as a choke for the same reason the
  // stair is; the LAGOON as an arena, because it is deliberately open water and
  // holding it to the island bar would mean filling the one space in the game
  // whose whole job is to be empty and uncrossable.
  { id: 'd1a', kind: 'island' }, { id: 'd1b', kind: 'island' }, { id: 'd1p', kind: 'pocket' },
  { id: 'dg1', kind: 'choke' },  { id: 'd2a', kind: 'island' }, { id: 'd2b', kind: 'island' },
  { id: 'd2p', kind: 'pocket' }, { id: 'dsh', kind: 'pocket' }, { id: 'dg2', kind: 'choke' },
  { id: 'd3a', kind: 'island' }, { id: 'd3b', kind: 'island' }, { id: 'd3p', kind: 'pocket' },
  { id: 'dtp', kind: 'puzzle' }, { id: 'dg3', kind: 'choke' },  { id: 'd4a', kind: 'island' },
  { id: 'd4b', kind: 'island' }, { id: 'd4p', kind: 'pocket' }, { id: 'dg4', kind: 'choke' },
  { id: 'dlg', kind: 'arena' },  { id: 'ddp', kind: 'arena' },
  // The Shadow Court. A WING is measured as an island (26x20 against 32x26 —
  // close enough that a softer bar would just be a discount), the throne stair
  // as a choke, and the throne itself as an arena.
  { id: 'x1',  kind: 'island' }, { id: 'xsh', kind: 'pocket' }, { id: 'xh',  kind: 'island' },
  { id: 'xa1', kind: 'island' }, { id: 'xa2', kind: 'pocket' }, { id: 'xa3', kind: 'island' },
  { id: 'xr1', kind: 'island' }, { id: 'xr2', kind: 'pocket' }, { id: 'xr3', kind: 'island' },
  { id: 'xg1', kind: 'island' }, { id: 'xg2', kind: 'pocket' }, { id: 'xg3', kind: 'island' },
  { id: 'xm1', kind: 'island' }, { id: 'xm2', kind: 'puzzle' }, { id: 'xm3', kind: 'island' },
  { id: 'xp1', kind: 'pocket' }, { id: 'xp2', kind: 'pocket' },
  { id: 'xst', kind: 'choke' },  { id: 'xth', kind: 'arena' },
];

// EVERY LIVE ROOM IS IN THE LIST ABOVE, or this suite is lying by omission.
const LIVE = await allRooms(page);
const listed = new Set(ROOMS.map((r) => r.id));
const unwatched = LIVE.filter((id) => !listed.has(id));
check('every live room is in this suite\'s list', unwatched.length === 0,
  { unwatched, note: 'add it with its kind — a missing room is not checked at all' });
// THRESHOLDS ARE CALIBRATED, NOT GUESSED — and the first pass of this file got
// that wrong. It shipped with an island minimum of 12 while the dressed islands
// measure 69-75, which means it would have passed a room stripped back to a
// sixth of its content and reported success. A floor nothing can fail is not a
// floor.
//
// Measured on the dressed Ember rooms (2026-08-09):
//     islands  la 62  lb 66  lc 69  ld 75
//     pockets  la1 44  lb1 41  lb2 46  lc1 40
//     chokes   lg1 51  lg2 55  lg3 47  lg4 43
//     puzzle   ld1 31        arena  le 29
//
// Set at roughly HALF the measured value. That is deliberately loose: the job
// of this check is to catch a room being gutted, not to dictate exactly how
// many barrels belong in it. Taste is dad's; emptiness is arithmetic.
const MIN_IN_FRAME = { island: 32, pocket: 20, choke: 21, puzzle: 15, arena: 14 };
// minimum distinct kit models used anywhere in the room. Level 1 shipped using
// THREE of the twenty-five dungeon props it had, which is the failure this
// number exists to make impossible to repeat.
const MIN_MODELS = { island: 14, pocket: 10, choke: 7, puzzle: 7, arena: 10 };

// NAME ROOMS ON THE COMMAND LINE to measure only those — `node
// tools/verify-density.mjs n1 n2`. The completeness check above always runs on
// the whole registry, so a filtered run can still tell you a room is missing;
// what it skips is the ninety-odd room rebuilds you did not ask about, which is
// the difference between a twenty-minute suite and a twenty-second one while
// dressing a new room. An unfiltered run is unchanged.
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const MEASURE = ONLY.length ? ROOMS.filter((r) => ONLY.includes(r.id)) : ROOMS;
if (ONLY.length) {
  check('every named room exists in the list', MEASURE.length === ONLY.length,
    { asked: ONLY, found: MEASURE.map((r) => r.id) });
}

console.log(`Arrival frame: ${HALF_W * 2}u wide, ${AHEAD}u ahead of spawn, ${BEHIND}u behind.\n`);
console.log('room   inFrame  models  colliders  breakables  chests  floorσ  calls');
console.log('─'.repeat(74));

const rows = [];
for (const R of MEASURE) {
  if (!(await go(R.id))) { check('build ' + R.id, false); continue; }
  const m = await page.evaluate(async ({ ahead, behind, halfW }) => {
    const g = window.__game;
    const s = () => new Promise((r) => requestAnimationFrame(r));
    await s(); await s();
    const w = g.world;
    const sp = w.spawn || { x: 0, z: 0, angle: Math.PI };
    // forward is (sin a, cos a); the camera looks down that axis
    const fx = Math.sin(sp.angle), fz = Math.cos(sp.angle);
    const rx = fz, rz = -fx;                       // right-hand perpendicular
    const inFrame = (x, z) => {
      const dx = x - sp.x, dz = z - sp.z;
      const f = dx * fx + dz * fz;                 // distance along view
      const r = dx * rx + dz * rz;                 // distance across view
      return f >= -behind && f <= ahead && Math.abs(r) <= halfW;
    };

    // Count THINGS, not meshes: one ruined house is one thing to look at, and
    // counting its forty meshes would let a single over-detailed prop pass a
    // room that has nothing else in it. Groups added straight to the room root
    // are the unit — that is exactly what the cluster vocabulary produces.
    let things = 0, inView = 0;
    const seenModels = new Set();
    for (const child of w.root.children) {
      if (child.isLight || child.isSprite) continue;
      if (child.name === 'ground' || child.name === 'batched') continue;
      let hasMesh = false;
      child.traverse((n) => {
        if (!n.isMesh && !n.isInstancedMesh) return;
        hasMesh = true;
        if (n.geometry) seenModels.add(n.geometry.uuid);
      });
      // NOTE: this only sees what SURVIVED the merge. The rest is added below
      // from the batcher's own record of what went in — counting the leftovers
      // alone made a well-batched room look like a poorly-dressed one.
      if (!hasMesh) continue;
      things++;
      const p = child.position;
      if (inFrame(p.x, p.z)) inView++;
    }
    // ...and the merged batches, which are where most of the dressing ends up
    // once flattenStatic has run. A batch is counted by how many of its source
    // props fell in the frame, which the batcher does not record — so instead
    // the batch's own bounding box is intersected with the frame and counted as
    // one thing per cell it covers. Coarse on purpose: it is a floor, not a
    // score.
    for (const child of w.root.children) {
      if (child.name !== 'batched' || !child.geometry) continue;
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
      const bb = child.geometry.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      if (inFrame(cx, cz)) inView += 3;
      things += 3;
    }

    // the floor: is it actually textured, or did the room fall back to flat?
    let sigma = 0;
    const ground = w.root.children.find((c) => c.name === 'ground');
    if (ground && ground.material && ground.material.map && ground.material.map.image) {
      const img = ground.material.map.image;
      const c = document.createElement('canvas');
      const N = 64;
      c.width = N; c.height = N;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, N, N);
      const px = ctx.getImageData(0, 0, N, N).data;
      let sum = 0, sum2 = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const v = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        sum += v; sum2 += v * v; n++;
      }
      sigma = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
    }

    // every geometry flattenStatic consumed, plus everything it left alone
    for (const uuid of (w._batchSourceGeometries || [])) seenModels.add(uuid);
    return {
      things, inView, models: seenModels.size,
      colliders: (w.boxColliders || []).length + (w.circleColliders || []).length,
      breakables: (w.markers.breakables || []).length,
      chests: (w.markers.chestDefs || []).length,
      sigma: +sigma.toFixed(1),
      calls: g.renderer.info.render.calls,
      batch: w._batchStats || null,
    };
  }, { ahead: AHEAD, behind: BEHIND, halfW: HALF_W });

  rows.push({ ...R, ...m });
  console.log(`${R.id.padEnd(6)} ${String(m.inView).padStart(7)}  ${String(m.models).padStart(6)}  ` +
    `${String(m.colliders).padStart(9)}  ${String(m.breakables).padStart(10)}  ` +
    `${String(m.chests).padStart(6)}  ${String(m.sigma).padStart(6)}  ${String(m.calls).padStart(5)}`);
}

console.log('\n── the arrival frame is not empty ─────────────────────────────');
for (const r of rows) {
  const need = MIN_IN_FRAME[r.kind];
  check(`${r.id} (${r.kind}) shows at least ${need} things on arrival`, r.inView >= need,
    { inFrame: r.inView, need });
}
console.log('\n── the room uses the art it was given ─────────────────────────');
for (const r of rows) {
  const need = MIN_MODELS[r.kind];
  check(`${r.id} uses at least ${need} distinct models`, r.models >= need, { models: r.models, need });
}
console.log('\n── the floor is not one flat colour ──────────────────────────');
for (const r of rows) {
  check(`${r.id} floor has real variation`, r.sigma >= MIN_FLOOR_STDDEV,
    { sigma: r.sigma, need: MIN_FLOOR_STDDEV });
}
console.log('\n── and it still fits the budget ──────────────────────────────');
const worst = rows.reduce((a, r) => (r.calls > a.calls ? r : a), { calls: 0, id: '—' });
check('worst room under 125 draw calls', worst.calls < 125, { room: worst.id, calls: worst.calls });

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : '✓ every room is furnished, uses its art, and has a floor worth looking at'));
if (warns.length) console.log('\nwarnings:\n' + warns.join('\n'));
await b.close();
process.exit(errors.length ? 1 : 0);
