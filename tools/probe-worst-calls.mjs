// WORST-CASE DRAW CALLS — sampled where the player actually stands.
//
// tools/probe-encounters.mjs samples one point: the room's spawn. That is not
// the worst frame. The frustum decides what gets submitted, so walking to the
// far corner of a room can add up to ~19 draw calls in the SAME room — the Den
// measures 89 at its spawn and 113 five metres away.
//
// Two independent agents reviewing the A9 encounter pass caught this hole at
// once, having measured t1b 105, t2a 107 and t3a 106 dressed at the worst camera
// position while the spawn-point probe was reporting them comfortably clear.
//
// So: sweep a grid of standing positions per room, resolve each against the
// room's own colliders so the sample is somewhere a child could really be, and
// report the worst. This is the number METRICS.md's "< 100 draw calls" should be
// checked against.
//
//   Run:  (nohup python3 -m http.server 8901 &) ; node tools/probe-worst-calls.mjs
//   Or:   node tools/probe-worst-calls.mjs den,vc1,t3a
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name','SWEEP');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.settings.greybox=false; g.player.iframes=99999;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf','frost_wolf'];
  g.WS.set('vault','spark',true); g.WS.set('vault','drained',true); g.WS.set('vault','handDown',true);
  g.WS.set('wild3','rootCut',true); g.WS.set('wild3','logDown',true); });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.state.room===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };

const ROOMS = (process.argv[2] || 'den,vc1,vc2,vh,t1b,t4a,la,le,f5').split(',');
let globalWorst = { calls: 0 };
for (const id of ROOMS) {
  if (!await go(id)) { console.log(`${id.padEnd(5)} FAILED`); continue; }
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise(r=>requestAnimationFrame(r));
    let worst = 0, at = null;
    for (const x of [-10, -5, 0, 5, 10]) for (const z of [-8, 0, 8]) {
      const p = g.world.resolveCircle(x, z, 0.32);
      g.player.root.position.set(p.x, g.player.root.position.y, p.z);
      for (let i=0;i<5;i++) await s();
      const c = g.renderer.info.render.calls;
      if (c > worst) { worst = c; at = [Math.round(p.x), Math.round(p.z)]; }
    }
    return { worst, at };
  });
  const flag = r.worst >= 100 ? '  ✗ OVER 100' : r.worst > 90 ? '  ⚠' : '';
  console.log(`  ${id.padEnd(5)} worst ${String(r.worst).padStart(4)} calls  standing at (${r.at})${flag}`);
  if (r.worst > globalWorst.calls) globalWorst = { calls: r.worst, id };
}
console.log(`\nworst room in the game: ${globalWorst.id} at ${globalWorst.calls} calls`);
await b.close();
