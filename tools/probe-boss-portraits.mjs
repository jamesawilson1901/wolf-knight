// A ONE-OFF: one framed portrait of each of the seven guardians, so a
// question about how they LOOK can be answered by looking rather than by
// reading triangle counts.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = process.env.SHOT_DIR || 'test-evidence/bosses';
mkdirSync(OUT, { recursive: true });

const BOSSES = [
  ['le', 'shadowgrip', 'The Shadowgrip', 'Ember Hollow'],
  ['vz', 'warden', 'The Bone Warden', 'Stoneroot Caverns'],
  ['tgl', 'sylva', 'Sylva, Thornbound', 'Wild Woods'],
  ['f5', 'boreal', 'Boreal', 'Frostpeak'],
  ['scr', 'aria', 'Aria, the Galebound', 'Stormreach'],
  ['ddp', 'meri', 'Meri, the Drowned', 'Sunken Vale'],
  ['xth', 'grimm', 'Shadow-Grimm', 'Shadow Court'],
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 900, height: 600 },
  deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('ERR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'PORTRAIT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'moonlight'];
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

for (const [room, id, name] of BOSSES) {
  if (!await go(room)) { console.log(`${id}: FAILED TO BUILD ${room}`); continue; }
  // The game owns the camera every frame, so a hand-parked camera is gone by
  // the next one. Stand the KNIGHT in front of the boss instead and let the
  // game frame them both — which is also the framing a child actually sees.
  const info = await page.evaluate(async (secs) => {
    const g = window.__game;
    const boss = g.world.boss || g.world.warden;
    if (!boss) return { found: false };
    const o = boss.model || boss.root || boss.mesh;
    if (!o) return { found: false };
    // the enemy's own x/z are the truth; a model root can sit at the origin
    const p = { x: boss.x !== undefined ? boss.x : o.position.x,
      z: boss.z !== undefined ? boss.z : o.position.z };
    g.player.root.position.set(p.x, g.player.root.position.y, p.z + 3.0);
    g.player.iframes = 99999;
    const t0 = performance.now();
    await new Promise((res) => {
      const step = () => (performance.now() - t0 > secs * 1000
        ? res() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
    return { found: true, at: { x: p.x, z: p.z }, boss: boss.name || boss.skin || 'warden' };
  }, 2.2);
  if (!info.found) { console.log(`${id}: no boss object in ${room}`); continue; }
  await page.screenshot({ path: `${OUT}/${id}.png` });
  console.log(`${id}: ${room} ${JSON.stringify(info)}`);
}
await b.close();
