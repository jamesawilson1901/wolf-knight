// THE OVERNIGHT DRIVER. Launches the game with the dev harness on, reads the
// READ-ONLY window.__wk view, and plays through the REAL input pipeline only:
// Playwright keyboard events (WASD / J attack / K special / Tab form / Space
// jump / I shield) and, where touch specifically is under test, real pointer
// events into the floating-joystick zone. It never calls a gameplay API.
//
// Evidence discipline: every screenshot is checked against the flat-frame rule
// (a PNG of a single colour compresses far below any real world frame) and a
// flat frame THROWS: it is a render failure, never evidence. FLAT_KB is
// calibrated to the 740x360 viewport — recalibrate if the viewport changes.
import { launchBrowser } from './launch.mjs';
import { mkdirSync, statSync, appendFileSync } from 'fs';

// 740x360 matches every verify-* suite; the old 960x480 drew 73% more pixels
// through SwiftShader for no fidelity gain (RUN2-REPORT discovery #3).
const VW = 740, VH = 360;
const FLAT_KB = 26; // calibrated: a real in-game frame at 740x360 measures ~200KB; single-colour frames compress under 10

export async function launch({ dev = true, timescale = 1, evidenceDir } = {}) {
  const b = await launchBrowser();
  // FRESH CONTEXT, ALWAYS: no storage, no service worker, no cached build.
  const ctx = await b.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const consoleLog = [];
  const errors = [];
  page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => { errors.push(e.message); consoleLog.push(`[UNCAUGHT] ${e.message}`); });
  const q = `?dev=1${timescale !== 1 ? `&timescale=${timescale}` : ''}`;
  await page.goto(`http://localhost:8901/index.html${q}`, { waitUntil: 'load' });
  await page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
  if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });
  let shotN = 0;
  const api = {
    b, ctx, page, consoleLog, errors,
    async newGame(name = 'BOT') {
      await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
      await page.fill('#t-name', name);
      await page.locator('#t-start').dispatchEvent('pointerdown');
      await page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });
      await page.evaluate(() => { const g = window.__game;
        g.state.settings.voice = false; g.state.settings.musicVol = 0.4; g.state.settings.sfxVol = 0.4; });
    },
    wk: (expr = '') => page.evaluate((e) => {
      const w = window.__wk;
      return e ? w[e] : { pos: w.pos, room: w.room, form: w.form, hearts: w.hearts,
        music: w.music, boss: w.boss, foes: w.foes.length, ws: w.ws };
    }, expr),
    async jump(room, forms) {
      await page.evaluate(({ room, forms }) => window.__wkJump(room, forms), { room, forms });
      // hearts>1 lands mid-fade: loadRoom() sets state.room/rebuilds world,
      // heals the player, THEN fades the black overlay back out — hearts
      // recovers before that fade-in finishes. A caller who screenshots the
      // instant this resolves can catch the overlay still opaque: a flat
      // frame that reads as a render failure when the render was fine. Wait
      // for the same `gates.transitioning` flag walkTo() already respects.
      await page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
        && !window.__wk.gates.transitioning, room, { timeout: 60000 });
    },
    // Closed-loop walk to (x,z) via real keyboard events. Returns why it stopped.
    async walkTo(tx, tz, { timeout = 30, arrive = 0.9, onTick } = {}) {
      const held = new Set();
      const want = new Set();
      const t0 = Date.now();
      let lastPos = null, stuck = 0;
      // ANCHOR THE START ROOM ONCE. The old check compared two reads inside
      // the same iteration, so a transition completing during the inter-tick
      // wait was invisible — and the walk carried on BLIND in the new room
      // toward old-room coordinates (the t1a door cascade, run 3).
      const startRoom = await api.wk('room');
      try {
        while ((Date.now() - t0) / 1000 < timeout) {
          const s = await api.wk();
          if (s.room !== startRoom) return { ok: true, roomChanged: s.room, at: s.pos };
          if (onTick) await onTick(s);
          const dx = tx - s.pos.x, dz = tz - s.pos.z;
          if (Math.hypot(dx, dz) < arrive) return { ok: true, at: s.pos, room: s.room };
          want.clear();
          if (dx < -0.3) want.add('a'); if (dx > 0.3) want.add('d');
          if (dz < -0.3) want.add('w'); if (dz > 0.3) want.add('s');
          for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
          for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
          if (lastPos && Math.hypot(s.pos.x - lastPos.x, s.pos.z - lastPos.z) < 0.05) stuck++;
          else stuck = 0;
          lastPos = s.pos;
          if (stuck >= 3) {
            // A DOOR FADE freezes the player in place for seconds (measured
            // ~5s at 3x/4.5fps): motionless is not stuck while transitioning.
            const fading = await page.evaluate(() => window.__wk.gates.transitioning).catch(() => false);
            if (fading) { stuck = 0; await page.waitForTimeout(400); continue; }
          }
          if (stuck === 5) {
            // Patience is only for NARRATION and dead worlds. A blocking story
            // line stalls the world on purpose — wait it out and absolve the
            // stuckness. But a ticking world with a motionless player is
            // GEOMETRY, and absolving that starved the sidesteps forever: the
            // bot jammed on va3's shrine because stuck could never reach 7.
            const verdict = await page.evaluate(async () => {
              const g = window.__game;
              if (g.narration.speaking) {
                for (let i = 0; i < 40 && g.narration.speaking; i++) {
                  await new Promise((r2) => setTimeout(r2, 500));
                }
                return 'narration';
              }
              const t1 = g.player._time;
              await new Promise((r2) => setTimeout(r2, 900));
              return g.player._time === t1 ? 'dead' : 'geometry';
            }).catch(() => 'geometry');
            if (verdict === 'narration') stuck = 0;
            else if (verdict === 'dead') {
              if (await api.pickPerkIfOffered()) { stuck = 0; continue; }
              const gates = await page.evaluate(() => window.__wk.gates).catch(() => null);
              console.log('  [walkTo] world not ticking — real wedge, gates:', JSON.stringify(gates));
            }
          }
          if (stuck === 10) {
            // WHO FROZE THE WORLD? The pause flags are closured and unreadable,
            // but a menu that is open is open in the DOM, and a halted loop
            // cannot advance the game clock. Read both while it is happening.
            const guts = await page.evaluate(async () => {
              const g = window.__game;
              // `g.state.clock` DOES NOT EXIST — there is no such field in
              // js/state.js, so this read was always undefined and
              // `clockMoved` was always false, which made every wedge look
              // like a frozen world and sent two debugging sessions after the
              // wrong thing. The player's own accumulated time is the clock
              // that a halted loop stops advancing (it is what the 'dead'
              // verdict above already uses).
              const c1 = g.player._time;
              await new Promise((r2) => setTimeout(r2, 600));
              const vis = (id) => { const el = document.getElementById(id);
                return el ? getComputedStyle(el).display !== 'none' : null; };
              return { clockMoved: g.player._time !== c1,
                inv: vis('inv-menu'), shop: vis('shop-menu'), map: vis('map-menu'),
                mg: vis('mg-tap'), pausePanel: vis('pause-menu'),
                caption: !!document.querySelector('#caption.show, .caption.show'),
                speaking: g.narration.speaking, queue: (g.narration.queue || []).length,
                vel: { ...g.player._vel }, lock: g.player.lockTime };
            }).catch((e) => ({ err: String(e) }));
            console.log('  [walkTo stuck-guts]', JSON.stringify(guts));
          }
          if (stuck === 7 || stuck === 18) {
            // sidestep: walk perpendicular for a beat, the way a thumb does
            const side = stuck === 7 ? 1 : -1;
            const px = Math.abs(dx) > Math.abs(dz) ? (side > 0 ? 'w' : 's') : (side > 0 ? 'a' : 'd');
            for (const k of held) { await page.keyboard.up(k); held.delete(k); }
            await page.keyboard.down(px); await page.waitForTimeout(700); await page.keyboard.up(px);
          }
          if (stuck > 30) return { ok: false, why: 'stuck', at: s.pos, room: s.room };
          await page.waitForTimeout(140);
        }
        return { ok: false, why: 'timeout', at: (await api.wk()).pos };
      } finally {
        for (const k of held) await page.keyboard.up(k);
      }
    },
    // THE DRIVER CAN GET ROUND THINGS NOW.
    //
    // walkTo above drives real keys STRAIGHT at a target and has no routing at
    // all, which is board item #1 and the single root cause of two suites'
    // failures: verify-nightroad and verify-chests/t3b both report a room a
    // child walks through fine, because a prop between the bot and the target
    // stops it dead. Flood fills proved both — the goal cells are reachable,
    // 0.11u and 0.09u from walkable ground, and the bot wedges on a point that
    // is itself inside geometry.
    //
    // So the driver gets the same flood fill, once, in the page: a 0.4u grid
    // over the room, BFS from where the player is standing to the goal, then
    // the corners kept and the straight runs thrown away. Each leg is the
    // existing walkTo, so every step is still a real key press through the
    // real input pipeline — this adds WAYPOINTS, not a teleport.
    //
    // If the fill cannot reach the goal it returns null and this falls back to
    // one straight walk, which is exactly the old behaviour: a routing bot that
    // silently refuses to try is worse than a dumb one.
    async pathTo(tx, tz, r = 0.34) {
      return page.evaluate(({ tx, tz, r }) => {
        const w = window.__game.world, p = window.__game.player.root.position;
        if (!w.halfW) return null;
        const STEP = 0.4;
        const nx = Math.floor((w.halfW * 2) / STEP), nz = Math.floor((w.halfD * 2) / STEP);
        const at = (i, j) => [-w.halfW + i * STEP + STEP / 2, -w.halfD + j * STEP + STEP / 2];
        // the same overlap test verify-spawn-clear and probe-freespot use —
        // NOT resolveCircle, which answers the weaker "would a body be pushed
        // off here" and calls a prop's own centre clear
        const free = new Uint8Array(nx * nz);
        for (let i = 0; i < nx; i++) {
          for (let j = 0; j < nz; j++) {
            const [x, z] = at(i, j);
            let ok = true;
            for (const c of w.boxColliders) {
              const cx = Math.max(c.minX, Math.min(x, c.maxX));
              const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
              if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) { ok = false; break; }
            }
            if (ok) {
              for (const c of w.circleColliders) {
                if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) { ok = false; break; }
              }
            }
            free[i * nz + j] = ok ? 1 : 0;
          }
        }
        const cell = (x, z) => [
          Math.max(0, Math.min(nx - 1, Math.round((x + w.halfW - STEP / 2) / STEP))),
          Math.max(0, Math.min(nz - 1, Math.round((z + w.halfD - STEP / 2) / STEP)))];
        // NEAREST FREE CELL, both ends. The goal is often a chest or a door
        // mouth whose own collider fills its cell; a fill that insists on
        // standing IN the target never starts.
        const nearestFree = ([ci, cj]) => {
          if (free[ci * nz + cj]) return [ci, cj];
          for (let rad = 1; rad < 12; rad++) {
            for (let di = -rad; di <= rad; di++) {
              for (let dj = -rad; dj <= rad; dj++) {
                if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
                const i = ci + di, j = cj + dj;
                if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
                if (free[i * nz + j]) return [i, j];
              }
            }
          }
          return null;
        };
        const start = nearestFree(cell(p.x, p.z));
        const goal = nearestFree(cell(tx, tz));
        if (!start || !goal) return null;
        const prev = new Int32Array(nx * nz).fill(-1);
        const seen = new Uint8Array(nx * nz);
        let q = [start[0] * nz + start[1]];
        seen[q[0]] = 1;
        const goalIdx = goal[0] * nz + goal[1];
        while (q.length) {
          const next = [];
          for (const cur of q) {
            if (cur === goalIdx) { q = []; break; }
            const ci = Math.floor(cur / nz), cj = cur % nz;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const i = ci + di, j = cj + dj;
              if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
              const k = i * nz + j;
              if (seen[k] || !free[k]) continue;
              seen[k] = 1; prev[k] = cur; next.push(k);
            }
          }
          if (!q.length) break;
          q = next;
        }
        if (!seen[goalIdx]) return null;
        const back = [];
        for (let k = goalIdx; k !== -1; k = prev[k]) back.push(k);
        back.reverse();
        // KEEP THE CORNERS, THROW AWAY THE STRAIGHT RUNS. A waypoint every
        // 0.4u would have the bot stopping and restarting forty times across a
        // room; what walkTo needs is the handful of places the line bends.
        const pts = back.map((k) => at(Math.floor(k / nz), k % nz));
        const out = [pts[0]];
        for (let i = 1; i < pts.length - 1; i++) {
          const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
          const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (Math.abs(cross) > 1e-6) out.push(b);
        }
        out.push([tx, tz]);
        return out;
      }, { tx, tz, r });
    },

    // Walk to (x, z) the long way round if the short way is blocked. Same
    // return shape as walkTo, so a caller can swap one for the other.
    async routeTo(tx, tz, opts = {}) {
      const legs = await api.pathTo(tx, tz).catch(() => null);
      if (!legs || legs.length < 2) return api.walkTo(tx, tz, opts);
      const budget = opts.timeout || 30;
      const t0 = Date.now();
      let last = null;
      for (let i = 0; i < legs.length; i++) {
        const isLast = i === legs.length - 1;
        const left = budget - (Date.now() - t0) / 1000;
        if (left <= 1) return { ok: false, why: 'timeout', at: (await api.wk()).pos, legs: legs.length };
        last = await api.walkTo(legs[i][0], legs[i][1], {
          ...opts,
          timeout: Math.min(left, isLast ? left : 8),
          arrive: isLast ? (opts.arrive || 0.9) : 0.55,
        });
        if (last.roomChanged) return last;
        // A LEG THAT WEDGES IS NOT THE WALK FAILING. The fill is a snapshot and
        // the world moves — an enemy stands in a corridor, a boulder rolls.
        // Re-fill from wherever the bot actually is and carry on rather than
        // giving up on a route that was right when it was computed.
        if (!last.ok && !isLast) {
          const again = await api.pathTo(tx, tz).catch(() => null);
          if (again && again.length > 1) { legs.splice(0, legs.length, ...again); i = -1; continue; }
          return api.walkTo(tx, tz, { ...opts, timeout: Math.max(2, budget - (Date.now() - t0) / 1000) });
        }
      }
      return last;
    },

    async tap(key) { await page.keyboard.press(key); },      // j/k/l/Tab/Space/h
    // THE PERK CHOOSER BLOCKS UNTIL CHOSEN — that is its design, and it was
    // the whole overnight wedge: level up mid-fight, the world pauses for a
    // choice, and a bot that never taps stands frozen forever. A real child
    // taps a card; so does the driver, through a real pointer event. Returns
    // true if a choice was made.
    async pickPerkIfOffered() {
      const card = page.locator('#perk-menu .perk-card').first();
      if (!(await card.isVisible().catch(() => false))) return false;
      const name = await card.locator('.nm').textContent().catch(() => '?');
      await card.dispatchEvent('pointerdown');
      console.log(`  [driver] level up — picked perk: ${name}`);
      await page.waitForTimeout(400);
      return true;
    },
    async holdShield(ms) { await page.keyboard.down('i'); await page.waitForTimeout(ms); await page.keyboard.up('i'); },
    // Real pointer joystick: down in the left zone, drag, hold `ms`, release.
    async joystick(dirX, dirZ, ms) {
      const ox = VW * 0.18, oy = VH * 0.62;
      await page.mouse.move(ox, oy);
      await page.mouse.down();
      await page.mouse.move(ox + dirX * 60, oy + dirZ * 60, { steps: 4 });
      await page.waitForTimeout(ms);
      await page.mouse.up();
    },
    async shot(label) {
      const p = `${evidenceDir}/${String(++shotN).padStart(2, '0')}-${label}.png`;
      await page.screenshot({ path: p });
      const kb = statSync(p).size / 1024;
      if (kb < FLAT_KB) throw new Error(`RENDER FAILURE: ${p} is ${kb.toFixed(0)}KB — flat frame, not evidence`);
      return p;
    },
    saveLog(label) {
      appendFileSync(`${evidenceDir}/console-${label}.log`, consoleLog.join('\n') + '\n');
      consoleLog.length = 0;
    },
    async close() { await b.close(); },
  };
  return api;
}
