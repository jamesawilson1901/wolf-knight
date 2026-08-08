// C1 — THE POSE NEVER LIES, applied to the shockwave ring.
//
// Every ability that hits in a circle draws effects.groundSlam(). Until v3.31
// that ring grew to a fixed ~4u whoever called it, so it told a child the wrong
// reach for every ability in the game — worst on the knight's spin, which
// reaches 2.3u and drew 4.0u while its own comment claimed the ring "sweeps out
// to the spin's reach".
//
// This fires each ability through the real input path (player.trySpecial /
// tryAttack, no direct calls into effects), finds the ring in the scene, and
// measures its ACTUAL world radius at full extent against the constant the
// ability's hit test uses.
import { chromium } from 'playwright';
const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : ''); if (!ok) errors.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'POSE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
  g.player.iframes = 99999;
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
await go('tc1');   // a wide empty ring leg: nothing to collide with, nothing to kill

// The truth each ring claims to show, read from js/player.js.
const ABILITIES = [
  { form: 'knight',       name: 'knight spin',   reach: 2.3, why: 'SPIN_RANGE' },
  { form: 'fire_wolf',    name: 'fire slam',     reach: 3.0, why: 'SLAM_RADIUS' },
  { form: 'earth_wolf',   name: 'stone stomp',   reach: 3.2, why: 'STOMP_RADIUS' },
  { form: 'verdant_wolf', name: 'vine lash',     reach: 3.8, why: 'VINE_RANGE, drawn as a 13 deg wedge', wedge: 13 },
  { form: 'frost_wolf',   name: 'frost breath',  reach: 3.6, why: 'FROST_RANGE, drawn as a 40 deg cone', wedge: 40 },
];

console.log('\n── the ring reaches exactly as far as the ability does ─────────');
for (const a of ABILITIES) {
  const r = await page.evaluate(async (ab) => {
    const g = window.__game;
    const s = () => new Promise((res) => requestAnimationFrame(res));
    const scene = g.world.root.parent;
    const ringsBefore = new Set();
    scene.traverse((n) => { if (n.isMesh && n.geometry && n.geometry.type === 'RingGeometry') ringsBefore.add(n); });

    g.state.form = ab.form;
    g.player.root.position.set(0, g.player.root.position.y, 0);
    g.player.root.rotation.y = Math.PI;            // face north, up the room
    g.player.specialCooldown = 0; g.player.lockTime = 0;
    for (let i = 0; i < 3; i++) { g.world.animate(i * 0.05, 0.05); await s(); }

    const fired = g.player.trySpecial(g.effects, g.world);   // the real input path

    // follow the new ring and record its widest world-space extent
    let ring = null, maxR = 0, maxAtOpacity = 0;
    for (let i = 0; i < 40; i++) {
      await s();
      if (!ring) {
        scene.traverse((n) => {
          if (!ring && n.isMesh && n.geometry && n.geometry.type === 'RingGeometry' && !ringsBefore.has(n)) ring = n;
        });
      }
      if (ring && ring.parent) {
        const outer = ring.geometry.parameters.outerRadius * ring.scale.x;
        if (outer > maxR) { maxR = outer; maxAtOpacity = ring.material.opacity; }
      }
    }
    // the wedge abilities draw from Kael's feet, so the ring radius IS the reach
    const reached = maxR + (ab.offset || 0);
    const p = ring && ring.geometry.parameters;
    const wedgeDeg = p && p.thetaLength < 6.28 ? Math.round(p.thetaLength * 180 / Math.PI) : 360;
    return { fired, ringFound: !!ring, ringRadius: +maxR.toFixed(2),
             reached: +reached.toFixed(2), wedgeDeg };
  }, a);

  check(`${a.name}: the ring appears at all`, r.fired === true && r.ringFound === true, r);
  if (!r.ringFound) continue;
  const err = Math.abs(r.reached - a.reach);
  check(`${a.name}: reaches ${a.reach}u (${a.why}), measured ${r.reached}u`,
    err <= 0.35, { claimed: a.reach, measured: r.reached, errU: +err.toFixed(2) });
  // ...and the SHAPE. A cone ability drawn as a full disc tells a child it
  // reaches behind them, which is the one direction the fixed camera hides.
  if (a.wedge) {
    check(`${a.name}: drawn as a ${a.wedge * 2} deg wedge, not a full disc`,
      Math.abs(r.wedgeDeg - a.wedge * 2) <= 4, { wedgeDeg: r.wedgeDeg, expected: a.wedge * 2 });
  } else {
    check(`${a.name}: drawn as a full disc (it really is radial)`, r.wedgeDeg === 360, r);
  }
}

console.log('\n── one ability, one number ────────────────────────────────────');
const oneNumber = await page.evaluate(() => {
  const src = { };
  return src;
});
// read the constants straight out of the running player, via what it does
const reaches = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((res) => requestAnimationFrame(res));
  const out = {};
  // fire slam: the burn/ignite reach must equal the damage reach
  const w = g.world;
  const seen = [];
  const realBurn = w.burnAt.bind(w), realCrack = w.crackAt.bind(w);
  w.burnAt = (x, z, r) => { seen.push(['burn', r]); return 0; };
  w.crackAt = (x, z, r) => { seen.push(['crack', r]); return 0; };
  const oldIgnite = w.igniteAt; w.igniteAt = (x, z, r) => { seen.push(['ignite', r]); };
  const oldDmg = w.damageEnemiesAt; w.damageEnemiesAt = (x, z, r) => { seen.push(['damage', r]); return 0; };
  for (const form of ['fire_wolf', 'earth_wolf']) {
    g.state.form = form;
    g.player.specialCooldown = 0; g.player.lockTime = 0;
    g.player.trySpecial(g.effects, g.world);
    for (let i = 0; i < 3; i++) await s();
    out[form] = seen.splice(0);
  }
  w.burnAt = realBurn; w.crackAt = realCrack; w.igniteAt = oldIgnite; w.damageEnemiesAt = oldDmg;
  return out;
});
const fire = Object.fromEntries(reaches.fire_wolf || []);
const earth = Object.fromEntries(reaches.earth_wolf || []);
check('fire slam: burn reaches exactly as far as the damage (and the ring)',
  fire.burn === fire.damage && fire.ignite === fire.damage, fire);
check('stone stomp: cracking rock reaches the ring, not the fire wolf\'s 2.6',
  earth.crack === 3.2, earth);

console.log('\n── ceremony keeps its full size (no hitbox to be honest about) ──');
const ceremony = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((res) => requestAnimationFrame(res));
  const scene = g.world.root.parent;
  const before = new Set();
  scene.traverse((n) => { if (n.isMesh && n.geometry && n.geometry.type === 'RingGeometry') before.add(n); });
  g.effects.groundSlam({ x: 0, z: 0 }, 0xff3a4a, 4.0);
  let ring = null, maxR = 0;
  for (let i = 0; i < 40; i++) {
    await s();
    if (!ring) scene.traverse((n) => { if (!ring && n.isMesh && n.geometry && n.geometry.type === 'RingGeometry' && !before.has(n)) ring = n; });
    if (ring && ring.parent) maxR = Math.max(maxR, ring.geometry.parameters.outerRadius * ring.scale.x);
  }
  return { maxR: +maxR.toFixed(2) };
});
check('the transformation/boss ring still reaches 4.0u', Math.abs(ceremony.maxR - 4.0) <= 0.35, ceremony);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n')
  : '✓ every shockwave ring shows the reach its ability actually has'));
await b.close();
process.exit(errors.length ? 1 : 0);
