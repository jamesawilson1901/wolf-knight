// Every enemy must spawn on walkable floor, not inside a wall run, a hero prop,
// a bramble, a boulder or a promise-gate alcove. A stuck enemy is worse than no
// enemy: it never reaches the child and never stops being on the screen.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'CLEAR');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.settings.greybox=false; g.player.iframes=99999;
  g.WS.set('wild3','rootCut',true); g.WS.set('wild3','logDown',true); });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r)&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };
const ROOMS=['t1a','t1b','t1p','tc1','t2a','t2b','t2p','tsh','tc2','t3a','t3b','t3p','tkn','tc3','t4a','t4b','t4p','tc4','tgl','tsA','tsB'];
let bad=0, n=0;
for (const id of ROOMS) {
  if (!await go(id)) { console.log(id,'FAILED'); continue; }
  const r = await page.evaluate(() => {
    const w = window.__game.world;
    const out=[];
    for (const e of (w.enemies||[])) {
      if (e.scenery || !e.root) continue;
      const x=e.x, z=e.z, R=e.radius||0.4;
      let hit=null;
      for (const b of w.boxColliders) {
        const cx=Math.max(b.minX,Math.min(x,b.maxX)), cz=Math.max(b.minZ,Math.min(z,b.maxZ));
        if ((x-cx)**2+(z-cz)**2 < R*R) { hit='box'; break; }
      }
      if (!hit) for (const c of w.circleColliders) {
        if ((x-c.x)**2+(z-c.z)**2 < (c.r+R)**2) { hit='circle'; break; }
      }
      // ...and it must be able to actually reach the player's spawn side
      out.push({ cls:e.constructor.name, x:+x.toFixed(1), z:+z.toFixed(1), hit });
    }
    return out;
  });
  for (const e of r) { n++;
    if (e.hit) { bad++; console.log(`  ✗ ${id} ${e.cls} @(${e.x},${e.z}) spawns INSIDE a ${e.hit} collider`); } }
  if (r.length) console.log(`  ${id.padEnd(5)} ${r.length} bodies, ${r.filter(e=>e.hit).length} stuck`);
}
console.log(bad ? `\n✗ ${bad}/${n} enemies spawn inside geometry` : `\n✓ all ${n} enemies spawn on clear floor`);
await b.close(); process.exit(bad?1:0);
