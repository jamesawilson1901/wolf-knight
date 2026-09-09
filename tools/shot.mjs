// ROOM CONTACT SHEET. Walks to each room through the real load path and
// screenshots it from the game's own camera. A verifier cannot tell you a room
// is boring; this is how a human finds out without playing fifty-two rooms.
//
//   node tools/shot.mjs <outdir> <room> [room...]
// DPR=1 halves the resolution, which is what the contact sheet uses: fifty-two
// rooms at 2x is 26 MB of PNG and an Artifact page has to fit in 16.
import { launchBrowser } from './launch.mjs';
import { mkdirSync } from 'fs';

const outDir = process.argv[2] || '/tmp/shots';
const ROOMS = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: Number(process.env.DPR || 2) })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.addInitScript((v) => { window.__LATE = v; }, Number(process.env.LATE || 0));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SHOT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(async () => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf','frost_wolf'];
  g.player.iframes = 999999;
  g.WS.set('wild3','rootCut',true); g.WS.set('wild3','logDown',true);
  // LATE=<n> shoots the world at growth stage n (design/WIDER-WORLD.md §1.2),
  // n = 0..5. Stage 1 is what LATE used to mean on its own (boolean, since
  // 2026-09-08): the Den's spirit shrines, its third tent and the Stoneroot
  // mushrooms only exist once a region is freed, and a contact sheet of the
  // early-game Den never showed half of what is in it. Stages 2-5 are the new
  // ground this slice adds — pups home, the road keepsake, the region's
  // dungeon, Grimm freed — each one strictly additive over the last, so
  // LATE=3 includes everything LATE=1 and LATE=2 set.
  const KEYS = ['ember', 'stone', 'wild', 'frost', 'storm', 'vale', 'court'];
  const LATE = window.__LATE || 0;
  if (LATE >= 1) {
    for (const f of ['bossDefeated', 'wardenDefeated', 'sylvaDefeated', 'borealDefeated',
      'ariaDefeated', 'meriDefeated']) g.state.flags[f] = true;
    for (const k of KEYS) g.WS.set(k, 'restored');
  }
  if (LATE >= 2) {
    const { PUP_HOME } = await import('/js/pip.js');
    for (const id of Object.keys(PUP_HOME)) g.state.flags.pups[id] = true;
  }
  if (LATE >= 3) {
    const { KEEPSAKE, COURT_RELICS } = await import('/js/restoration.js');
    if (!g.state.inventory.treasures) g.state.inventory.treasures = [];
    for (const id of Object.values(KEEPSAKE)) {
      if (!g.state.inventory.treasures.includes(id)) g.state.inventory.treasures.push(id);
    }
    for (const n of COURT_RELICS) g.WS.set('court', 'relic_' + n, true);
  }
  if (LATE >= 4) {
    for (const k of KEYS) g.WS.set(k, 'dungeon', true);
    // The Ash Vault's own gate (§2.4) — a region's dungeon cannot be CLEARED
    // without its door having opened first, so LATE=4 shows `la` with the
    // crack already broken, not just the milestone flag on its own.
    g.state.flags.cracked.l1_crack_gate = true;
  }
  // GRIMM FREED IS GLOBAL, NOT PER-REGION (js/restoration.js growthStage's
  // fifth fact) — so stage 5 is the one stage no single hearth can reach on
  // its own, and this only ever fires at the top of the range.
  if (LATE >= 5) g.state.flags.grimmFreed = true;
  // hide the HUD: this sheet is about the ROOM
  for (const el of document.querySelectorAll('.ui, #joy-base, #joy-knob, #joy-hint, #hearts, #shards, #level-badge, #xp-bar, #potions, #pause-btn, #inv-btn, #form-badge, #moon-gauge, #btn-attack, #special-btn, #btn-ranged, #btn-defend, #btn-jump, #caption, #toast')) {
    el.style.display = 'none';
  }
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
for (const id of ROOMS) {
  if (!await go(id)) { console.log(`${id}  FAILED TO BUILD`); continue; }
  // let the camera settle and any onAnimate hooks tick
  await page.evaluate(async () => { for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r)); });
  const calls = await page.evaluate(() => window.__game.renderer.info.render.calls);
  await page.screenshot({ path: `${outDir}/${id}.png` });
  console.log(`${id.padEnd(6)} ${String(calls).padStart(4)} calls  -> ${outDir}/${id}.png`);
}
if (errs.length) console.log('\n' + errs.join('\n'));
await b.close();
