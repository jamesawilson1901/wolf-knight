// B1 — WHERE DO THE DRAW CALLS ACTUALLY GO?
//
// vc1 is the last room in the game over the 100-call ceiling. Cutting an enemy
// from it saved 4 calls, which tells us the head count is not the lever. This
// attributes every call in a room by switching one thing off at a time and
// re-rendering — the same differential method that measured enemy cost in A9.
//
// The shadow map is the thing under suspicion: a castShadow mesh is submitted
// TWICE, once for the depth pass and once for the beauty pass, so anything
// skinned (never merged, never instanced) costs double.
import { chromium } from 'playwright';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'ATTRIB');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
  g.state.settings.greybox = false;
  g.player.iframes = 99999;
  g.WS.set('vault', 'spark', true); g.WS.set('vault', 'drained', true); g.WS.set('vault', 'handDown', true);
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const L2 = (process.argv[2] || 'vh,vga,va1,va2,vap,va3,vgb,vb1,vb2,vbp,vb3,vgc,vc1,vc2,vcp,vc3,vz').split(',');

console.log('── Level 2, dressed, as it ships ──────────────────────────────');
const rows = [];
for (const id of L2) {
  if (!await go(id)) { console.log(`${id} FAILED`); continue; }
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise((res) => requestAnimationFrame(res));
    await s(); await s();
    return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
             enemies: (g.world.enemies || []).filter((e) => !e.dead).length };
  });
  rows.push({ id, ...r });
  const flag = r.calls >= 100 ? '  ✗ OVER' : r.calls > 90 ? '  ⚠' : '';
  console.log(`  ${id.padEnd(5)} ${String(r.calls).padStart(4)} calls  ${String(r.tris).padStart(6)} tris  ${r.enemies} enemies${flag}`);
}
const worst = rows.reduce((a, r) => (r.calls > a.calls ? r : a), { calls: 0 });
console.log(`\nworst: ${worst.id} at ${worst.calls}`);

// ---------------------------------------------------------------------------
for (const id of [worst.id].filter(Boolean)) {
  console.log(`\n── ${id}: what is each thing worth? ────────────────────────────`);
  if (!await go(id)) continue;
  const a = await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise((res) => requestAnimationFrame(res));
    const R = async () => { await s(); await s(); return g.renderer.info.render.calls; };
    const base = await R();

    // classify every renderable in the scene
    const skinned = [], heldItems = [], staticMeshes = [], instanced = [];
    // __game exposes no scene handle; the world's root shares its parent
    const scene = g.world.root.parent;
    scene.traverse((n) => {
      if (!n.isMesh && !n.isInstancedMesh) return;
      if (n.isInstancedMesh) { instanced.push(n); return; }
      if (n.isSkinnedMesh) { skinned.push(n); return; }
      // a held item rides a bone: its ancestor chain hits a SkinnedMesh's parent
      let held = false;
      for (let p = n.parent; p; p = p.parent) if (p.isBone) { held = true; break; }
      (held ? heldItems : staticMeshes).push(n);
    });

    const off = async (list, prop) => {
      const prev = list.map((n) => n[prop]);
      list.forEach((n) => { n[prop] = false; });
      const c = await R();
      list.forEach((n, i) => { n[prop] = prev[i]; });
      return c;
    };

    const noCharShadow = await off(skinned, 'castShadow');
    const noHeldShadow = await off(heldItems, 'castShadow');
    const noHeldAtAll = await off(heldItems, 'visible');
    const noStaticShadow = await off(staticMeshes, 'castShadow');
    const noInstShadow = await off(instanced, 'castShadow');
    const enemyObjs = [];
    for (const e of (g.world.enemies || [])) { const o = e.model || e.root; if (o) enemyObjs.push(o); }
    const noEnemies = await off(enemyObjs, 'visible');

    return { base,
      counts: { skinned: skinned.length, heldItems: heldItems.length,
                staticMeshes: staticMeshes.length, instanced: instanced.length },
      noCharShadow, noHeldShadow, noHeldAtAll, noStaticShadow, noInstShadow, noEnemies };
  });
  console.log(`  baseline                                  ${a.base}`);
  console.log(`  objects: ${a.counts.skinned} skinned, ${a.counts.heldItems} held, ` +
    `${a.counts.staticMeshes} static, ${a.counts.instanced} instanced`);
  const d = (v) => String(a.base - v).padStart(3);
  console.log(`  castShadow off, SKINNED characters   -${d(a.noCharShadow)}  → ${a.noCharShadow}`);
  console.log(`  castShadow off, HELD ITEMS only      -${d(a.noHeldShadow)}  → ${a.noHeldShadow}`);
  console.log(`  held items hidden entirely           -${d(a.noHeldAtAll)}  → ${a.noHeldAtAll}`);
  console.log(`  castShadow off, static meshes        -${d(a.noStaticShadow)}  → ${a.noStaticShadow}`);
  console.log(`  castShadow off, instanced meshes     -${d(a.noInstShadow)}  → ${a.noInstShadow}`);
  console.log(`  all enemies hidden                   -${d(a.noEnemies)}  → ${a.noEnemies}`);
}
if (errs.length) console.log('\nPAGE ERRORS:\n' + errs.join('\n'));
await b.close();
