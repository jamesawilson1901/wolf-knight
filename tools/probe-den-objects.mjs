import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('ERR ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'WHAT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game; g.state.settings.greybox = false; g.player.iframes = 999999; });
await page.evaluate(() => { const g = window.__game; g.state.room='den'; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true}); });
await page.waitForFunction(() => window.__game.state.room === 'den' && window.__game.player.hearts > 1, null, { timeout: 45000 });
const r = await page.evaluate(() => {
  const out = [];
  window.__game.world.root.traverse((n) => {
    if (!n.isMesh && !n.isInstancedMesh) return;
    n.updateWorldMatrix(true, false);
    const p = new (n.matrixWorld.constructor === Object ? Object : window.__game.world.root.position.constructor)();
    const px = n.matrixWorld.elements[12], pz = n.matrixWorld.elements[14];
    const c = n.material && n.material.color ? n.material.color.getHexString() : '?';
    out.push(`${n.isInstancedMesh ? 'INST' : 'mesh'} ${(n.material&&n.material.name)||'-'} #${c} at (${px.toFixed(1)}, ${pz.toFixed(1)})`);
  });
  return out;
});
// only the ones that are teal-ish
const seen = new Map();
for (const l of r) { const k = l.replace(/at \(.*/, ''); seen.set(k, (seen.get(k) || 0) + 1); }
console.log([...seen.entries()].map(([k, n]) => `${String(n).padStart(3)}x ${k}`).join('\n'));
await b.close();
