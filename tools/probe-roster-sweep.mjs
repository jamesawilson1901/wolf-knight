// A ONE-OFF CENSUS, not a law: walk every shipping room, ask the live world
// what stands in it, and print family/variant/model per region. Written to
// answer "what enemies does each area actually have?" with a measurement
// rather than a grep of marker names.
import { chromium } from 'playwright';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
page.on('pageerror', (e) => console.error('ERR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'ROSTER');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'moonlight'];
  g.state.settings.greybox = false;
});

const allRooms = await page.evaluate(async () => {
  const { ROOMS } = await import('/js/rooms.js');
  return Object.keys(ROOMS);
});
const go = async (room) => {
  for (let a = 0; a < 6; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world
        && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 40000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const out = [];
for (const id of allRooms) {
  if (!await go(id)) { out.push({ id, failed: true }); continue; }
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const modelOf = (e) => {
      let url = null;
      const o = e.model || e.root || e.mesh;
      o && o.traverse && o.traverse((n) => { if (!url && n.userData && n.userData.srcUrl) url = n.userData.srcUrl; });
      return url;
    };
    const cast = (g.world.enemies || []).map((e) => ({
      cls: e.constructor.name, variant: e.variantName || e.variant || null,
      elem: e.element || null, hp: e.maxHp || e.hp || null, model: modelOf(e),
    }));
    const { regionOf } = await import('/js/state.js');
    return { region: regionOf(g.world.roomId),
      room: g.world.roomId, cast, boss: g.world.boss ? (g.world.boss.name || g.world.boss.skin) : null };
  });
  out.push({ id, ...r });
}
console.log(JSON.stringify(out, null, 1));
await b.close();
