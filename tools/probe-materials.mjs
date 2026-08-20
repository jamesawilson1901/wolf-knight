// How many distinct materials survive the merge, and what are they?
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'MAT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game;
  g.state.settings.greybox = false; g.player.iframes = 999999; });
const go = async (room) => { for (let a = 0; a < 8; a++) {
  await page.evaluate((r) => { const g = window.__game; g.state.room = r; g.player.iframes = 0;
    g.player.hearts = 0.5; g.player.hurt(99, { pierceDefend: true }); }, room);
  try { await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1, room, { timeout: 45000 }); return true; } catch {} }
  return false; };
await go(process.argv[2] || 'la');
const r = await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 6; i++) await new Promise((rr) => requestAnimationFrame(rr));
  const byMat = new Map(); let meshes = 0, shadowCasters = 0;
  g.world.root.traverse((n) => {
    if (!n.isMesh && !n.isInstancedMesh && !n.isSkinnedMesh) return;
    meshes++;
    if (n.castShadow) shadowCasters++;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      const k = (m && m.name) || '(unnamed)';
      byMat.set(k, (byMat.get(k) || 0) + 1);
    }
  });
  return { calls: g.renderer.info.render.calls, meshes, shadowCasters,
    batch: g.world._batchStats,
    mats: [...byMat.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 25) };
});
console.log(`calls ${r.calls}  meshes ${r.meshes}  shadowCasters ${r.shadowCasters}`);
console.log('batch stats:', JSON.stringify(r.batch));
console.log('top materials (meshes each):');
for (const [n, c] of r.mats) console.log(`  ${String(c).padStart(4)}  ${n}`);
await b.close();
