// C1 — DO THE BOSS TELEGRAPHS POINT WHERE THE ATTACK GOES?
//
// The highest-stakes case of THE POSE NEVER LIES: a child stands in a boss arena
// and dodges by the red mark on the floor. If the mark lies, the law is broken
// in the one place it matters most.
//
// The Bone Warden's chop arc used `rotation.z = -rotation.y + ...` on a mesh laid
// flat by `rotation.x = -PI/2`. That MIRRORS the heading instead of rotating it:
// three.js Euler XYZ applies Rz in the ring's own plane first, so a local vertex
// at angle a lands at world (cos(a+z), -sin(a+z)) and the sign must follow the
// facing. Measured before the fix, the arc was correct at exactly ONE facing
// (171 deg) and up to 162 deg wrong elsewhere — pointing almost directly away
// from the swing, sending a dodging child into the axe.
//
// This measures it in world space rather than deriving it: transform the arc's
// centre vertex by the mesh's real matrixWorld and compare the bearing with the
// warden's own forward vector, at seven facings including non-cardinals.
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name','WARD');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.settings.greybox=false; g.player.iframes=99999;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf']; });
for (let a=0;a<8;a++){ await page.evaluate(()=>{const g=window.__game;
  g.state.room='vz'; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});});
  try { await page.waitForFunction(()=>window.__game.state.room==='vz'&&window.__game.player.hearts>1,null,{timeout:45000}); break;} catch{} }

const r = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise(res=>requestAnimationFrame(res));
  const w = g.world.warden;
  if (!w) return { error: 'no warden' };
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const out = [];
  for (const deg of [0, 45, 90, 135, 171, 200, 270]) {
    const ry = deg * Math.PI / 180;
    w.root.rotation.y = ry;
    w.state = 'chop_tele'; w.stateT = 0.5;
    w.update(0.016, performance.now()/1000, g.player);
    for (let i=0;i<2;i++) await s();
    const ring = w.dangerRing;
    ring.updateMatrixWorld(true);
    // the arc spans thetaStart..thetaStart+thetaLength; its CENTRE vertex
    const p = ring.geometry.parameters;
    const aC = p.thetaStart + p.thetaLength / 2;
    const local = new V(Math.cos(aC) * p.outerRadius, Math.sin(aC) * p.outerRadius, 0);
    const world = local.clone().applyMatrix4(ring.matrixWorld);
    const dx = world.x - ring.position.x, dz = world.z - ring.position.z;
    const arcBearing = Math.atan2(dx, dz) * 180 / Math.PI;          // atan2(x,z) = facing convention
    const facing = deg;
    let err = ((arcBearing - facing) % 360 + 540) % 360 - 180;
    out.push({ facing: deg, arcPointsAt: +arcBearing.toFixed(1), errDeg: +err.toFixed(1) });
  }
  return { out };
});
if (r.error) { console.log(r.error); } else {
  console.log('warden faces   red arc points at   error');
  for (const o of r.out) {
    const bad = Math.abs(o.errDeg) > 15;
    console.log(`   ${String(o.facing).padStart(3)} deg          ${String(o.arcPointsAt).padStart(6)} deg     ${String(o.errDeg).padStart(6)} deg ${bad ? ' <-- WRONG WAY' : ''}`);
  }
  const worst = Math.max(...r.out.map(o=>Math.abs(o.errDeg)));
  console.log(worst > 15 ? `\n✗ the telegraph LIES about direction, worst ${worst.toFixed(0)} deg off`
                         : '\n✓ the telegraph points where the axe swings');
  if (worst > 15) { await b.close(); process.exit(1); }
}
await b.close();
