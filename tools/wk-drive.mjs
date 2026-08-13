// THE OVERNIGHT DRIVER. Launches the game with the dev harness on, reads the
// READ-ONLY window.__wk view, and plays through the REAL input pipeline only:
// Playwright keyboard events (WASD / J attack / K special / Tab form / Space
// jump / I shield) and, where touch specifically is under test, real pointer
// events into the floating-joystick zone. It never calls a gameplay API.
//
// Evidence discipline: every screenshot is checked against the flat-frame rule
// (a PNG of a single colour compresses far below any real world frame — the
// threshold here is generous at 45KB) and a flat frame THROWS: it is a render
// failure, never evidence.
import { chromium } from 'playwright';
import { mkdirSync, statSync, appendFileSync } from 'fs';

export async function launch({ dev = true, timescale = 1, evidenceDir } = {}) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required'] });
  // FRESH CONTEXT, ALWAYS: no storage, no service worker, no cached build.
  const ctx = await b.newContext({ viewport: { width: 960, height: 480 } });
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
      await page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1,
        room, { timeout: 60000 });
    },
    // Closed-loop walk to (x,z) via real keyboard events. Returns why it stopped.
    async walkTo(tx, tz, { timeout = 30, arrive = 0.9, onTick } = {}) {
      const held = new Set();
      const want = new Set();
      const t0 = Date.now();
      let lastPos = null, stuck = 0;
      try {
        while ((Date.now() - t0) / 1000 < timeout) {
          const s = await api.wk();
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
          if (stuck > 14) return { ok: false, why: 'stuck', at: s.pos, room: s.room };
          const r = await api.wk('room');
          if (r !== s.room) return { ok: true, roomChanged: r, at: s.pos };
          await page.waitForTimeout(140);
        }
        return { ok: false, why: 'timeout', at: (await api.wk()).pos };
      } finally {
        for (const k of held) await page.keyboard.up(k);
      }
    },
    async tap(key) { await page.keyboard.press(key); },      // j/k/l/Tab/Space/h
    async holdShield(ms) { await page.keyboard.down('i'); await page.waitForTimeout(ms); await page.keyboard.up('i'); },
    // Real pointer joystick: down in the left zone, drag, hold `ms`, release.
    async joystick(dirX, dirZ, ms) {
      const vw = 960, vh = 480;
      const ox = vw * 0.18, oy = vh * 0.62;
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
      if (kb < 45) throw new Error(`RENDER FAILURE: ${p} is ${kb.toFixed(0)}KB — flat frame, not evidence`);
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
