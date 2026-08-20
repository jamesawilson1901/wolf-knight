import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type()==='error') console.log('CONSOLE ' + m.text()); });
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DBG');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game; g.state.flags.pups={p1:true}; g.state.settings.greybox=false; g.player.iframes=999999; });
const go = async (r) => { for (let a=0;a<8;a++){ await page.evaluate((x)=>{const g=window.__game;g.state.room=x;g.player.iframes=0;g.player.hearts=0.5;g.player.hurt(99,{pierceDefend:true});},r);
  try { await page.waitForFunction((x)=>window.__game.world && window.__game.world.roomId===x&&window.__game.player.hearts>1,r,{timeout:45000}); return true;} catch{} } return false; };
await go('den');
await page.evaluate(() => { window.__game.player.root.position.set(1.6,0,4.6); });
await page.evaluate(async () => { for(let i=0;i<8;i++) await new Promise(r=>requestAnimationFrame(r)); });
console.log('opened:', await page.evaluate(() => window.__game.world.harness.active));
// does calling exit() directly work?
const direct = await page.evaluate(async () => {
  window.__game.world.harness.exit();
  const justAfter = window.__game.world.harness.active;
  for (let i=0;i<5;i++) await new Promise(r=>requestAnimationFrame(r));
  return { justAfter, later: window.__game.world.harness.active };
});
console.log('direct exit():', JSON.stringify(direct));
// and does the BUTTON work?
await page.evaluate(() => { window.__game.player.root.position.set(-6,0,0); });
await page.evaluate(async () => { for(let i=0;i<3;i++) await new Promise(r=>requestAnimationFrame(r)); });
await page.evaluate(() => { window.__game.player.root.position.set(1.6,0,4.6); });
await page.evaluate(async () => { for(let i=0;i<4;i++) await new Promise(r=>requestAnimationFrame(r)); });
console.log('reopened:', await page.evaluate(() => window.__game.world.harness.active));
await page.locator('#mg-exit').dispatchEvent('pointerdown');
await page.evaluate(async () => { for(let i=0;i<5;i++) await new Promise(r=>requestAnimationFrame(r)); });
console.log('after button:', await page.evaluate(() => window.__game.world.harness.active));
await b.close();
