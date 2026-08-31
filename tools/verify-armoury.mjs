// THE ARMOURY SHOWS YOU WHAT YOU ARE ABOUT TO WEAR.
//
// Dad, 2026-08-31: "if you pick up a red axe, it has to be a red axe in the
// player's hand when equipped. a tower shield that gets picked up is a tower
// shield when equipped." The screen that promises this is the equipment
// screen, so this is the suite that holds it to the promise.
//
// Four things, each of which has actually been broken at some point:
//
//   1. THE RACKS SHOW REAL ITEMS. The old grid drew every item as an EMOJI,
//      so the Cinder Axe — a genuinely red axe in the world and in his hand —
//      was a 🔥 in the bag. Every weapon/shield row must carry a real render.
//   2. EQUIPPING CHANGES THE KNIGHT IN FRONT OF YOU. Tap a tinted weapon and
//      the preview's hand must end up holding that tint, not the old one.
//   3. THE PREVIEW SURVIVES BEING CLOSED AND REOPENED. A WebGLRenderer is
//      welded to the canvas it was built on; the first cut of this screen
//      handed itself a fresh <canvas> every open, so the knight appeared once
//      and every reopen after that was an empty box.
//   4. IT FITS ON THE PHONE. This is played on a phone in landscape. A screen
//      whose Done button is off the bottom is a soft-lock (the .panel rule in
//      index.html carries that scar already), so the layout is measured at a
//      phone-sized viewport, not just at desktop.
import { launchBrowser, pageErrors } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
// PHONE-SIZED ON PURPOSE — see 4 above.
const page = await b.newPage({ viewport: { width: 740, height: 360 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'ARMOURY');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.musicVol = 0; g.state.settings.sfxVol = 0;
  g.player.iframes = 999999;
  // a rack with a TINTED weapon, a distinctly-shaped shield and armour in it
  g.state.inventory.gear = ['sword_knight', 'axe_ember', 'shield_badge', 'shield_c'];
  g.state.inventory.armours = ['plain', 'moon'];
});
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => { window.__game.narration.blocking = false; });
  await new Promise((r) => setTimeout(r, 25));
}

const open = async () => {
  await page.locator('#inv-btn').dispatchEvent('pointerdown');
  await page.waitForTimeout(2200);
};
const close = async () => {
  await page.locator('#inv-menu .menu-btn').dispatchEvent('pointerdown');
  await page.waitForTimeout(400);
};

console.log('── 1. the racks show real items, not emoji ───────────');
await open();
const racks = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.rack-row')];
  return {
    rows: rows.length,
    // a weapon/shield row carries a background image; armour carries a colour
    withArt: rows.filter((r) => {
      const a = r.querySelector('.rack-art');
      return a && (a.style.backgroundImage || a.style.background);
    }).length,
    // any emoji left in a row is the bug this screen was built to remove
    emoji: rows.map((r) => r.textContent)
      .filter((t) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)).length,
  };
});
check('every gear row carries real item art', racks.rows > 0 && racks.withArt === racks.rows, racks);
check('no emoji left in the racks', racks.emoji === 0, { emoji: racks.emoji });

console.log('\n── 2. equipping changes the knight in front of you ───');
const swapped = await page.evaluate(async () => {
  const m = window.__menus;
  const handTint = () => {
    const out = new Set();
    const bone = m.preview && m.preview._handR;
    if (bone) bone.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const mat of mats) if (mat && mat.color) out.add('#' + mat.color.getHexString());
    });
    return [...out];
  };
  const before = handTint();
  // tap the Cinder Axe row the way a child does
  const row = [...document.querySelectorAll('.rack-row')]
    .find((r) => (r.querySelector('.rack-name') || {}).textContent === 'Cinder Axe');
  if (!row) return { err: 'no Cinder Axe row' };
  row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
  return { before, after: handTint(), equipped: window.__game.state.inventory.equipped.weapon };
});
check('tapping a tinted weapon puts that tint in the preview hand',
  !swapped.err && swapped.equipped === 'axe_ember' && (swapped.after || []).includes('#ff6a2a'),
  swapped);

console.log('\n── 3. the preview survives close and reopen ──────────');
await close();
await open();
await close();
await open();
const reopened = await page.evaluate(() => {
  const m = window.__menus, c = document.getElementById('equip-preview');
  return {
    canvasInDom: !!c && document.body.contains(c),
    rendererOnSameCanvas: !!(m && m.preview && m.preview.canvas === c),
    hasModel: !!(m && m.preview && m.preview.model),
    // the knight must still be holding what is equipped
    equipped: window.__game.state.inventory.equipped.weapon,
  };
});
check('the live knight is still on the same, attached canvas after reopening',
  reopened.canvasInDom && reopened.rendererOnSameCanvas && reopened.hasModel, reopened);

console.log('\n── 4. it fits on a phone ─────────────────────────────');
const fits = await page.evaluate(() => {
  const panel = document.getElementById('inv-menu');
  const done = panel.querySelector('.menu-btn');
  const pr = panel.getBoundingClientRect(), dr = done.getBoundingClientRect();
  return {
    viewport: [innerWidth, innerHeight],
    doneBottom: Math.round(dr.bottom),
    doneReachable: dr.bottom <= innerHeight + 1 || panel.scrollHeight > panel.clientHeight,
    panelScrolls: panel.scrollHeight > panel.clientHeight,
    // the racks get their own scroller so the whole panel does not have to move
    racksScroll: (() => {
      const r = panel.querySelector('.arm-right');
      return r ? r.scrollHeight > r.clientHeight : false;
    })(),
    horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
  };
});
check('the Done button is reachable at phone size', fits.doneReachable, fits);
check('nothing overflows sideways', !fits.horizontalOverflow, { w: fits.horizontalOverflow });

// ...and nothing threw while we did it, including in async code — the
// armoury loads a dozen models in the background, and a rejected promise in
// one of those used to vanish without a trace (tools/launch.mjs pageErrors).
const thrown = await pageErrors(page);
check('nothing threw during the run', thrown.length === 0, thrown);

console.log(errors.length ? `\n${errors.length} PROBLEM(S)`
  : '\n✓ PASS — the armoury shows real gear, changes the knight as you equip, survives reopening, and fits a phone.');
await b.close();
process.exit(errors.length ? 1 : 0);
