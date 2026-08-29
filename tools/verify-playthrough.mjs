// CAN A CHILD WALK THIS GAME FROM THE START TO THE END?
//
// Nothing had ever asked. Ember Hollow shipped with its boss sealed behind the
// Kiln's own forge while eighteen suites were green, because every one of them
// checked a room, a graph or a flag — and none of them WALKED.
//
// This does. It starts a new save and travels the spine of all seven regions
// using the real input path: it writes to `input.move`, the same field the
// joystick writes, and lets the game's own movement and collision carry Kael.
//
// THE ONE RULE THAT MAKES IT WORTH ANYTHING: never place the player. Setting
// root.position teleports straight through the collider that IS the bug — that
// is exactly how verify-route walked past the Kiln blocker and reported clean.
// Every leg here is walked or it fails.
//
//   node tools/verify-playthrough.mjs            all seven regions
//   node tools/verify-playthrough.mjs ember      one region by name
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// The spine of each region, in the order a child walks it, taken from the
// `spine: true` rooms in each level's own room table.
//
// `grant` is what the child would be carrying by the time they arrive — the
// forms earned so far and the bosses already down. This file tests the ROUTE,
// not whether the game hands those out at the right moment; verify-progression
// and verify-sequence own that.
// THE WALK, region by region, as the game actually opens up.
//
// `legs` is the order a child physically travels — NOT the order rooms appear
// in a level's table. Stoneroot is a hub with three spokes, so it returns to
// the hub between each; the first version of this file read the table order,
// tried to walk va3 → vgb, and reported a bug that was really my map.
//
// `earn` is what the child has DONE by the time they stand there, applied
// before the leg. Nothing here is a shortcut past geometry: it is the lantern
// they lit and the knot they cut, without which the next door does not exist.
// The Stoneroot hub literally has no doorway to its other spokes until the
// first spoke is finished — that is design, and kinder than a locked door.
//
// `needs` names a leg that cannot be walked, only performed. The gale across
// the Stormreach shrine is crossed with the thunder-dash, which is the whole
// point of the region; the walker suspends that lane for the crossing and says
// so, rather than reporting the region's central mechanic as a blocker.
const REGIONS = [
  { name: 'ember', label: 'Ember Hollow', enter: 'la',
    grant: { forms: ['knight', 'dark_wolf', 'fire_wolf'], flags: {} },
    legs: [['lg1'],
      // The spine is PUZZLE-GATED since the payoff rebuild (dad: "yes, on the
      // main path too"): lg1's north door opens on the ki plate, lb's on both
      // sho plates. Same idiom as Frostpeak's f4 leg below — the walker sets
      // the plates and reloads so the gate rebuilds open; that the gates are
      // really SHUT first, and that the blocks really push, is verify-route's
      // and verify-l1-doors' job, not this file's.
      ['lb', { plates: ['l1_lg1_ki'], reload: true }],
      ['lg2', { plates: ['l1_lb_sho_p1', 'l1_lb_sho_p2'], reload: true }],
      ['lc'], ['lg3'], ['ld'], ['lg4'], ['le']] },

  { name: 'stoneroot', label: 'Stoneroot', enter: 'vh',
    grant: { forms: ['earth_wolf'], flags: { bossDefeated: true } },
    legs: [
      // The milestone is earned in the SPOKE and the hub is rebuilt when you
      // walk back into it — so the earn belongs on the returning leg, not the
      // one leaving. Set it after the hub is already built and the doorway
      // simply is not there, which is what the first version got wrong.
      ['vga'], ['va1'], ['va2'], ['va3'],
      ['vh', { ws: ['vault', 'spark'] }],           // the lantern opens two doorways
      ['vgb'], ['vb1'], ['vb2'], ['vb3'],
      ['vh', { ws: ['vault', 'drained'] }],
      ['vgc'], ['vc1'], ['vc2'], ['vc3'],
      ['vh', { ws: ['vault', 'deepLantern'] }],     // the deep lantern opens the crypt
      ['vz'],
    ] },

  { name: 'woods', label: 'The Wild Woods', enter: 't1a',
    grant: { forms: ['verdant_wolf'], flags: { wardenDefeated: true } },
    legs: [['t1b'], ['tc1'], ['t2a'], ['t2b'], ['tsh'], ['tc2'], ['t3a'], ['t3b'],
      // The knot's door opens on a PLATE, not on the wild3 milestone — the
      // puzzle IS the door. Setting knotCut left Kael standing 0.2u from a
      // doorway that had no reason to open.
      ['tkn'],
      ['tc3', { plate: 'l3_knot_p1', ws: ['wild3', 'knotCut'] }],
      ['t4a'], ['t4b'], ['tc4'], ['tgl']] },

  { name: 'frostpeak', label: 'Frostpeak', enter: 'f1',
    grant: { forms: ['frost_wolf'], flags: { sylvaDefeated: true } },
    legs: [['f2'],
      ['f3', { ws: ['frost', 'braziers'], reload: true }],   // three braziers open the frost gate
      ['f4', { plates: ['f3_p1', 'f3_p2'], reload: true }],  // two plates open the way up
      ['f5']] },

  { name: 'stormreach', label: 'Stormreach Cliffs', enter: 's1a',
    grant: { forms: ['storm_wolf'], flags: { borealDefeated: true } },
    // the via line for s1a→s1b: down the middle to the open z≈2 corridor,
    // east along it (it is clear wall-to-wall), then the door at (16.6, 0).
    // Laid from an ASCII solidity map of the room, not guessed.
    legs: [['s1b', { via: [[5, 2], [14.5, 2]] }], ['sc1'], ['s2a'], ['s2b'], ['ssh'],
      ['sc2', { needs: 'the thunder-dash, across the shrine gale' }],
      ['s3a', { needs: 'the thunder-dash, across three lanes of wind' }],
      ['s3b'], ['svn'], ['sc3'], ['s4a'], ['s4b'], ['sc4'], ['scr']] },

  { name: 'vale', label: 'The Sunken Vale', enter: 'd1a',
    grant: { forms: ['tide_wolf'], flags: { ariaDefeated: true } },
    legs: [['d1b'], ['dg1'], ['d2a'], ['d2b'], ['dsh'], ['dg2'], ['d3a'], ['d3b'], ['dtp'],
      ['dg3'], ['d4a'], ['d4b'], ['dg4'], ['ddp']] },

  { name: 'court', label: 'The Shadow Court', enter: 'x1',
    grant: { forms: ['ghost_wolf'], flags: { meriDefeated: true }, relics: true },
    legs: [['xsh'], ['xh'], ['xst'], ['xth']] },
];

const only = process.argv[2];
const RUN = only ? REGIONS.filter((r) => r.name === only) : REGIONS;
if (!RUN.length) { console.log('no such region:', only); process.exit(2); }

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'WALK');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

// A FRESH PAGE PER REGION.
//
// Walking all seven in one session, the first leg of Stormreach, the Vale and
// the Court all failed with Kael standing motionless on his spawn — and each
// walked clean on its own moments later. By the fifth region this page has
// built a hundred-odd rooms and decoded every model in the game on a software
// rasteriser, and it simply stops keeping up. That is the harness wearing out,
// not the game, and a harness that cries blocker is worth nothing.
//
// Each region is an independent question — can a child walk this? — so each
// gets a clean page to answer it in.
const freshGame = async () => {
  await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
  await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
  await page.fill('#t-name', 'WALK');
  await page.locator('#t-start').dispatchEvent('pointerdown');
  await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.state.settings.captions = false; g.state.settings.voice = false;
    g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  });
};
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
});

const settle = () => page.waitForFunction(() => !document.getElementById('fade')
  || getComputedStyle(document.getElementById('fade')).opacity === '0', null, { timeout: 30000 }).catch(() => {});

// Drop into a region's first room. This is the ONLY teleport in the file and it
// is a scene load, not a step through geometry — every door after it is walked.
const enterRegion = async (r) => {
  await page.evaluate((reg) => {
    const g = window.__game;
    for (const f of reg.grant.forms) if (!g.state.formsUnlocked.includes(f)) g.state.formsUnlocked.push(f);
    Object.assign(g.state.flags, reg.grant.flags);
    if (reg.grant.relics) for (const k of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + k);
    g.state.room = reg.enter;
    g.player.iframes = 0; g.player.hearts = 0.5;
    g.player.hurt(99, { pierceDefend: true });
  }, r);
  // RETRY LIKE EVERYTHING ELSE DOES. By the seventh region this browser has
  // built a hundred-odd rooms on a software rasteriser and a single 60s attempt
  // is not enough — the Wild Woods "failed to build" in a full run and walked
  // clean on its own moments later. A flaky harness that cries blocker is worse
  // than no harness.
  for (let a = 0; a < 6; a++) {
    try {
      await page.waitForFunction((id) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(id) && window.__game.player.hearts > 1,
        r.enter, { timeout: 45000 });
      await settle();
      return true;
    } catch {
      await page.evaluate((reg) => { const g = window.__game;
        g.state.room = reg.enter; g.player.iframes = 0; g.player.hearts = 0.5;
        g.player.hurt(99, { pierceDefend: true }); }, r);
    }
  }
  return false;
};

// WALK to the door leading to `to`. Route is a BFS over the floor the player
// can actually stand on; movement is the game's own, driven through input.move.
const walkTo = async (to, opts) => {
  const from = await page.evaluate(() => window.__game.state.room);
  let ok = await page.evaluate(async ([target, opts]) => {
    window.__walkLeg = async (target, opts) => {
    const g = window.__game, w = g.world;
    const STEP = 0.5, RAD = 0.32;
    // Impassable = solid OR on fire. hazardAt() knows about the bridge decks
    // that override the lava beneath them, so routing over a crossing is fine
    // and routing through the channel beside it is not. Without this the router
    // walked Kael straight into the Cinder Bridges lava and sat there.
    const solid = (x, z) => {
      const s = w.resolveCircle(x, z, RAD);
      if (Math.abs(s.x - x) > 1e-6 || Math.abs(s.z - z) > 1e-6) return true;
      return w.hazardAt(x, z);
    };
    const hx = w.halfW || 30, hz = w.halfD || 30;
    const inside = (x, z) => Math.abs(x) <= hx + 0.01 && Math.abs(z) <= hz + 0.01;
    // ENEMIES OFF. They are solid and they move, so a shade standing in a
    // corridor would read as a wall and make this file flap. A child can fight
    // or run past one; they cannot walk through a doorway a prop is sitting in,
    // and that is the only thing under test here.
    for (const e of (w.enemies || [])) e.dead = true;
    w.enemies = [];
    const d = (w.doors || []).find((x) => x.to === target);
    if (!d) return { ok: false, why: 'no door to ' + target,
      doorsHere: (w.doors || []).map((x) => x.to) };
    const dcx = (d.minX + d.maxX) / 2, dcz = (d.minZ + d.maxZ) / 2;
    // A leg that needs a verb rather than a walk: suspend the wind for the
    // crossing. Reported, never silent.
    if (opts && opts.needs) w.galeLanes = [];
    // DO NOT WANDER THROUGH OTHER DOORS. Crossing a room can clip a side
    // doorway in passing and land Kael somewhere he never chose — which is how
    // a walk to Frostpeak's f3 arrived in the f2b pocket instead.
    const otherDoors = (w.doors || []).filter((x) => x !== d);
    const inAnotherDoor = (x, z) => otherDoors.some((o) =>
      x >= o.minX - 0.4 && x <= o.maxX + 0.4 && z >= o.minZ - 0.4 && z <= o.maxZ + 0.4);

    // BFS from where Kael is standing to the floor nearest the doorway.
    const ci = (v) => Math.round(v / STEP);
    const key = (i, j) => i + ',' + j;
    // plan() aims at the door unless told otherwise — via points below reuse it.
    const plan = (tx = dcx, tz = dcz) => {
    const start = [ci(g.player.root.position.x), ci(g.player.root.position.z)];
    const prev = new Map(); prev.set(key(start[0], start[1]), null);
    const q = [start];
    let best = null, bestD = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      const [i, j] = q[qi];
      const dist = Math.hypot(i * STEP - tx, j * STEP - tz);
      if (dist < bestD) { bestD = dist; best = [i, j]; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        const k = key(ni, nj);
        if (prev.has(k)) continue;
        if (!inside(ni * STEP, nj * STEP) || solid(ni * STEP, nj * STEP)) continue;
        if (inAnotherDoor(ni * STEP, nj * STEP)) continue;
        prev.set(k, [i, j]); q.push([ni, nj]);
      }
    }
    if (!best || bestD > 2.2) return null;
    const p2 = [];
    for (let cur = best; cur; cur = prev.get(key(cur[0], cur[1]))) p2.push([cur[0] * STEP, cur[1] * STEP]);
    p2.reverse();
    p2.push([tx, tz]);   // the last stride is INTO the trigger
    return p2;
    };

    // HAND-LAID VIA POINTS (opts.via = [[x, z], ...]). One room defeated the
    // straight follower: s1a, where wall-sliding along the landing rocks put
    // Kael behind a pot with every waypoint behind him, and replanning from
    // there kept drawing the same doomed line. A child LOOKS and takes the
    // long way round the rocks; a via point is that look written down. Each
    // one is walked with the full machinery (plan, replan, nudge) and counts
    // as reached within 1.2u — only the door itself needs the trigger.
    for (const [vx, vz] of (opts && opts.via) || []) {
      let vpath = plan(vx, vz);
      if (!vpath) return { ok: false, retryable: true, why: 'no walkable floor reaches via point', via: [vx, vz] };
      let wp = 0, frames = 0, stale = 0, bestGap = Infinity, nudge = 0, nudgeSide = 1, replans = 0;
      while (frames < 6000 && stale < 900) {
        await new Promise((r) => requestAnimationFrame(r));
        frames++;
        if (g.narration) g.narration.blocking = false;
        g.player.iframes = 60;
        const p = g.player.root.position;
        if (Math.hypot(vx - p.x, vz - p.z) < 1.2) break;   // via point reached
        while (wp < vpath.length - 1
          && Math.hypot(vpath[wp][0] - p.x, vpath[wp][1] - p.z) < 1.0) { wp++; bestGap = Infinity; stale = 0; nudge = 0; }
        const [tx, tz] = vpath[Math.min(wp, vpath.length - 1)];
        const dx = tx - p.x, dz = tz - p.z;
        const len = Math.hypot(dx, dz) || 1;
        if (len < bestGap - 0.05) { bestGap = len; stale = 0; } else stale++;
        if (stale > 300 && replans < 6) {
          const fresh = plan(vx, vz);
          replans++; stale = 0; bestGap = Infinity; nudge = 0;
          if (fresh) { vpath = fresh; wp = 0; continue; }
        }
        if (stale > 120 && nudge <= 0) { nudge = 40; nudgeSide = -nudgeSide; }
        if (nudge > 0) {
          nudge--;
          g.input.move.x = (-dz / len) * nudgeSide;
          g.input.move.z = (dx / len) * nudgeSide;
          continue;
        }
        g.input.move.x = dx / len; g.input.move.z = dz / len;
      }
      g.input.move.x = 0; g.input.move.z = 0;
      const p = g.player.root.position;
      if (Math.hypot(vx - p.x, vz - p.z) >= 1.2) {
        return { ok: false, why: 'could not reach via point', via: [vx, vz],
          stuckAt: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) } };
      }
    }

    let path = plan();
    if (!path) return { ok: false, retryable: true, why: 'no walkable floor reaches the doorway' };

    // Now walk it, one waypoint at a time, using the real move vector.
    // BUDGET BY PROGRESS, NOT BY FRAMES. Stormreach's landing is a nineteen-unit
    // walk across a breeze, and headless the world advances about a fifth of
    // real time — Kael was still moving when a flat 3000-frame budget ran out
    // and the run called it a blocker. What actually means stuck is not moving:
    // if the distance to the next waypoint has not improved in a long while,
    // something is in the way. Otherwise let him keep walking.
    const startRoom = g.state.room;
    let wp = 0, frames = 0, stale = 0, bestGap = Infinity, nudge = 0, nudgeSide = 1, replans = 0;
    while (wp < path.length && frames < 12000 && stale < 900) {
      await new Promise((r) => requestAnimationFrame(r));
      frames++;
      if (g.narration) g.narration.blocking = false;   // a blocking line freezes the world
      g.player.iframes = 60;                            // the route is under test, not the fight
      if (g.state.room !== startRoom) { g.input.move.x = 0; g.input.move.z = 0; return { ok: true, frames }; }
      const p = g.player.root.position;
      const [tx, tz] = path[wp];
      const dx = tx - p.x, dz = tz - p.z;
      const len = Math.hypot(dx, dz);
      // ARRIVING AT A WAYPOINT HAS TO BE POSSIBLE. Kael walks ~5 u/s and a
      // headless frame can be 200ms, so one step is up to a unit — wider than
      // the 0.34 radius this used to call "arrived". He overshot every waypoint,
      // never registered reaching one, and orbited it until the run gave up and
      // reported a blocker in a room he could cross freely by hand. Take the
      // furthest waypoint already within reach, so overshooting is progress
      // rather than a trap.
      while (wp < path.length - 1) {
        const [ax, az] = path[wp];
        if (Math.hypot(ax - p.x, az - p.z) > 1.0) break;
        wp++; bestGap = Infinity; stale = 0; nudge = 0;
      }
      if (wp >= path.length) break;
      // THE LAST STRIDE IS NOT LIKE THE OTHERS. Every waypoint but the final
      // one is a place to pass through, so "within a metre" counts as reached.
      // The last one is the DOOR, and reaching it means standing inside the
      // trigger — widening the radius here made the walker stop 0.8u short of
      // every doorway in the game and report "ran out of path". Push into it
      // until the room actually changes.
      const last = wp === path.length - 1;
      if (!last && len < 1.0) { wp++; bestGap = Infinity; stale = 0; nudge = 0; continue; }
      if (len < bestGap - 0.05) { bestGap = len; stale = 0; } else stale++;
      // UNSTICK, THE WAY A CHILD WOULD. Walking straight at a waypoint wedges
      // in a pinch — Stormreach's landing has a pot and a rock either side of
      // the way south and Kael sat in the gap pushing forward forever. A player
      // with a thumb on a stick slides along and goes round; give the walker the
      // same instinct rather than reporting a route the flood fill says is open.
      // RE-PLAN WHEN THE PLAN STOPS WORKING. Kael slides along walls — that is
      // the movement code doing its job — so he ends up off the line the route
      // was drawn on, then aims at a waypoint that is now behind a wall and
      // pushes into it forever. A child would look again from where they are.
      // Stormreach's landing failed here through three wrong diagnoses of mine
      // before I instrumented it and watched the path and the body disagree.
      if (stale > 300 && replans < 6) {
        const fresh = plan();
        replans++; stale = 0; bestGap = Infinity; nudge = 0;
        if (fresh) { path = fresh; wp = 0; continue; }
      }
      if (stale > 120 && nudge <= 0) { nudge = 40; nudgeSide = -nudgeSide; }
      if (nudge > 0) {
        nudge--;
        g.input.move.x = (-dz / len) * nudgeSide;
        g.input.move.z = (dx / len) * nudgeSide;
        continue;
      }
      g.input.move.x = dx / len; g.input.move.z = dz / len;
    }
    g.input.move.x = 0; g.input.move.z = 0;
    if (g.state.room !== startRoom) return { ok: true, frames };
    const p = g.player.root.position;
    return { ok: false, why: stale >= 900 ? 'stopped making progress — something is in the way'
        : frames >= 12000 ? 'still walking after 12000 frames' : 'ran out of path',
      stuckAt: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }, door: { x: +dcx.toFixed(1), z: +dcz.toFixed(1) } };
    };
    return window.__walkLeg(target, opts);
  }, [to, opts || null]);
  // SOME FLOOR ARRIVES LATE. The Stoneroot hub's way to the arena is the
  // titan's HAND, which lowers into a ramp — walk in at the wrong moment and
  // there is genuinely nowhere to go yet. A child watches it settle; this gave
  // up on the first frame and called it a blocker, then passed on a re-run.
  // Two more looks, a second apart, before believing it.
  if (!ok.ok && ok.retryable) {
    for (let attempt = 0; attempt < 2 && !ok.ok; attempt++) {
      await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
      ok = await page.evaluate(async ([target, opts]) => window.__walkLeg(target, opts), [to, opts || null]);
    }
  }
  if (!ok.ok) return ok;
  try {
    await page.waitForFunction((f) => window.__game.state.room !== f, from, { timeout: 20000 });
  } catch { return { ok: false, why: 'the door never fired' }; }
  await settle();
  return { ok: true, room: await page.evaluate(() => window.__game.state.room), frames: ok.frames };
};

// LEGS THIS WALKER CANNOT EXECUTE, THOUGH A CHILD CAN.
//
// Named, with the evidence, because the alternative is worse in both
// directions: leave the suite red and the next real blocker gets read as noise,
// or invent a cause and the file starts lying.
//
// EMPTY, at last. s1a → s1b lived here for a night: Kael slid along the
// landing rocks into a pocket behind a pot and no amount of replanning drew a
// different line. The promised "real steering behaviour" turned out to be
// opts.via — hand-laid intermediate points on the leg (see the Stormreach RUN
// entry), each walked with the full plan/replan/nudge machinery. That is the
// look a child gives the room, written down, and the leg walks. If a new leg
// ever lands here, try via points before inventing a cause.
const CANNOT_WALK = {};

const skipped = [];
let first = true;
for (const r of RUN) {
  console.log(`\n── ${r.label} ─────────────────────────────────`);
  if (!first) await freshGame();
  first = false;
  if (!(await enterRegion(r))) { check(`${r.label}: the first room builds`, false); continue; }
  let here = r.enter;
  for (const [next, opts] of r.legs) {
    if (opts && (opts.ws || opts.plate || opts.plates)) {
      await page.evaluate((o) => {
        const g = window.__game;
        if (o.ws) g.WS.set(o.ws[0], o.ws[1], true);
        for (const p of [].concat(o.plate || [], o.plates || [])) g.state.flags.plates[p] = true;
      }, opts);
      const what = [opts.ws && opts.ws[1]].concat(opts.plate || [], opts.plates || []).filter(Boolean);
      console.log(`  · earned: ${what.join(' + ')} — the next doorway needs it`);
    }
    // Some barriers are PHYSICAL and were built with the room: Frostpeak's
    // frost gate is a solid until its braziers are lit. A child lights them
    // standing there and the gate opens; headlessly the honest equivalent is
    // to set what they earned and let the room rebuild around it. This is a
    // scene reload, not a step through geometry — the walk that follows is
    // still walked.
    if (opts && opts.reload) {
      const cur = await page.evaluate(() => window.__game.state.room);
      await page.evaluate((r) => { const g = window.__game;
        g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
        g.player.hurt(99, { pierceDefend: true }); }, cur);
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        cur, { timeout: 60000 }).catch(() => {});
      await settle();
      console.log('  · the room is rebuilt around it');
    }
    const res = await walkTo(next, opts);
    const note = opts && opts.needs ? `  (performed with ${opts.needs})` : '';
    const known = CANNOT_WALK[`${here}→${next}`];
    if (!res.ok && known) {
      // Say what was NOT tested, out loud and in legs. Resuming on the far side
      // was tried and made it worse — the resumed walk failed on its own next
      // leg, which is a second false blocker papering over the first. A number
      // of untested legs is honest; a green tick that skipped six is not.
      const left = r.legs.length - r.legs.findIndex(([n]) => n === next) - 1;
      console.log(`· ${here} → ${next} — NOT WALKED: ${known}`);
      console.log(`  ...so ${left} further legs of ${r.label} went untested this run.`);
      skipped.push(`${here}→${next} (+${left} legs of ${r.label} untested)`);
      break;
    }
    check(`  ${here} → ${next}${note}`, !!res.ok, res.ok ? undefined : res);
    if (!res.ok) break;
    here = res.room;
  }
}

// SAY WHAT WAS NOT DONE. A pass that quietly skipped a sixth of a region is
// how a suite stops meaning anything — the whole point of tonight was that the
// game had eighteen green suites and an unreachable boss.
console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : skipped.length
    ? `NO FAILURES, BUT NOT A CLEAN RUN — ${skipped.length} leg(s) this harness cannot walk:\n  `
      + skipped.join('\n  ') + '\nEverything else walked.'
    : 'ALL CLEAN — the whole game is walkable.'));
await b.close();
process.exit(errors.length ? 1 : 0);
