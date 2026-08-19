// ANIMATED CHEST KIT — verify the lid actually swings. Find a room with a
// chest, screenshot it closed, read the lid bone's rest angle, walk in to open
// it, then confirm the open clip ran (bone angle changed, chest.opened) with no
// console errors from the SkeletonUtils clone / mixer binding.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/assets/chest', timescale: 1 });
const say = (...a) => console.log(...a);
let ok = true;

await d.newGame('CHEST');

// jump to rooms until one has chests (forms don't gate room build)
const CANDIDATES = ['s2p', 's4p', 'xp2', 'vga', 'lc', 'r1'];
let found = null;
for (const r of CANDIDATES) {
  try {
    await d.jump(r, ['knight', 'dark_wolf', 'fire_wolf']);
    await d.page.waitForFunction(() => !window.__game.narration.speaking, null, { timeout: 15000 }).catch(() => {});
    const n = await d.page.evaluate(() => (window.__game.world.chests || []).length);
    say(`room ${r}: ${n} chest(s)`);
    if (n > 0) { found = r; break; }
  } catch (e) { say(`room ${r}: jump failed (${String(e.message).split('\n')[0]})`); }
}
if (!found) { say('FAIL: no chest room reachable'); await d.close(); process.exit(1); }

// read the first unopened chest: its position + lid-bone rest angle
const info = await d.page.evaluate(() => {
  const w = window.__game.world;
  const c = (w.chests || []).find((x) => !x.opened) || w.chests[0];
  let boneAngle = null, boneName = null, tier = c.tier;
  c.mesh.traverse((n) => {
    if (n.isBone && /BoneCover_0[135]$/.test(n.name)) { boneAngle = n.rotation.x; boneName = n.name; }
  });
  return { x: c.x, z: c.z, tier, opened: c.opened, hasMixer: !!c.mixer, hasAction: !!c.openAction, boneName, boneAngle };
});
say('chest:', JSON.stringify(info));
ok = ok && info.hasMixer && info.hasAction && info.boneName != null;
say(info.hasMixer && info.hasAction ? '  PASS: chest is the animated kit (mixer+openAction+lid bone)' : '  FAIL: not wired as animated kit');
await d.shot('chest-closed');

// walk into it to open
await d.walkTo(info.x, info.z, { timeout: 25, arrive: 0.9 }).catch(() => {});
await d.page.waitForFunction(() => (window.__game.world.chests || []).some((c) => c.opened), null, { timeout: 20000 }).catch(() => {});
// let the open clip play out
await d.page.waitForTimeout(1800);

const after = await d.page.evaluate(() => {
  const w = window.__game.world;
  const c = (w.chests || []).find((x) => x.opened) || w.chests[0];
  let boneAngle = null;
  c.mesh.traverse((n) => { if (n.isBone && /BoneCover_0[135]$/.test(n.name)) boneAngle = n.rotation.x; });
  return { opened: c.opened, boneAngle, actionRan: c.openAction ? (c.openAction.time > 0) : false };
});
say('after open:', JSON.stringify(after));
await d.shot('chest-open');

const lidMoved = info.boneAngle != null && after.boneAngle != null && Math.abs(after.boneAngle - info.boneAngle) > 0.05;
ok = ok && after.opened && lidMoved;
say(after.opened ? '  PASS: chest opened' : '  FAIL: chest never opened');
say(lidMoved ? `  PASS: lid bone rotated ${info.boneAngle.toFixed(2)} -> ${after.boneAngle.toFixed(2)}` : '  FAIL: lid did not move');

say('errors:', JSON.stringify(d.errors));
ok = ok && d.errors.length === 0;
say(ok ? 'CHEST ANIM: PASS' : 'CHEST ANIM: FAIL');
d.saveLog('chest-anim');
await d.close();
process.exit(ok ? 0 : 1);
