// UPGRADE PATH — a save made on the LIVE build (origin/main) must load intact
// under the branch build. Same origin, two server phases: serve a worktree of
// main, create real progress, swap the server to the branch tree, continue.
import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';

const say = (...a) => console.log(...a);
const errors = [];
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

execSync('git worktree remove --force /tmp/wk-main 2>/dev/null || true', { shell: '/bin/sh' });
execSync('git worktree add /tmp/wk-main origin/main', { stdio: 'ignore' });
const killServe = () => { try { execSync("kill $(ps aux | grep '[n]ode tools/serve.mjs' | awk '{print $2}') 2>/dev/null"); } catch {} };
const serveFrom = async (dir) => {
  const p = spawn('node', ['tools/serve.mjs'], { cwd: dir, detached: true, stdio: 'ignore' });
  p.unref();
  for (let i = 0; i < 40; i++) {                 // the old port lingers in TIME_WAIT
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:8901/index.html');
      if (res.ok) return;
    } catch {}
  }
  throw new Error('server never came up from ' + dir);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 740, height: 360 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// ---- PHASE A: the live build makes a save --------------------------------
killServe();
await serveFrom('/tmp/wk-main');
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
say('old build badge:', await page.locator('#badge').innerText());
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'UPG');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });
await page.evaluate(() => { window.__wkJump('vh', ['knight', 'dark_wolf', 'fire_wolf']); });
await page.waitForFunction(() => window.__wk.room === 'vh' && window.__wk.hearts > 1, null, { timeout: 60000 });
const saved = await page.evaluate(() => {
  const g = window.__game;
  g.state.flags.chests.upg_probe = true;
  g.persist();
  return { id: g.state.profileId, room: g.state.room, forms: [...g.state.formsUnlocked] };
});
say('old-build save:', JSON.stringify(saved));

// ---- PHASE B: the branch build continues it ------------------------------
killServe();
await serveFrom(process.cwd());
// THE SERVICE WORKER DEFEATS THE SWAP unless evicted: phase A's SW cached the
// old build and served it straight through phase B (badge read v3.48.2).
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.evaluate(async () => {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
});
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
say('new build badge:', await page.locator('#badge').innerText());
const btn = page.locator('.profile-btn', { hasText: 'UPG' }).first();
if (!(await btn.isVisible().catch(() => false))) bad('UPG profile missing on the new build title');
else {
  await btn.dispatchEvent('pointerdown');
  await page.waitForSelector('#t-continue', { state: 'visible', timeout: 10000 });
  await page.locator('#t-continue').dispatchEvent('pointerdown');
  await page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });
  const now = await page.evaluate(() => ({
    id: window.__game.state.profileId,
    room: window.__wk.room,
    forms: window.__wk.forms,
    chest: !!window.__game.state.flags.chests.upg_probe,
    hearts: window.__wk.hearts,
  }));
  say('new-build load:', JSON.stringify(now));
  if (now.id !== saved.id) bad('wrong profile loaded');
  if (!now.chest) bad('chest flag lost across the upgrade');
  for (const f of saved.forms) if (!now.forms.includes(f)) bad(`form ${f} lost across the upgrade`);
  if (!(now.hearts > 0)) bad('no hearts after load');
  // room policy is the game's own (a checkpointless save resuming at the
  // start is the v3.4 family of rules) — the invariant is PROGRESS INTACT
  // plus a real, living room, asserted above.
}
say('errors:', JSON.stringify(errors));
say(fails.length === 0 && errors.length === 0 ? 'UPGRADE PATH CLEAN' : 'UPGRADE PATH BROKEN');
await b.close();
execSync('git worktree remove --force /tmp/wk-main 2>/dev/null || true', { shell: '/bin/sh' });
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
