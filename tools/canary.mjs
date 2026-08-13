// THE REGRESSION CANARY. Fresh context, new game from boot, ~60 seconds of
// real Level 1 play, zero uncaught errors. Runs before every push: a fix deep
// in the game must not break the opening the kids load first.
import { launch } from './wk-drive.mjs';
const d = await launch({ evidenceDir: 'test-evidence/canary' });
await d.newGame('CANARY');
const s0 = await d.wk();
console.log('boot:', JSON.stringify(s0));
if (s0.room !== 'la') { console.log('CANARY FAIL: wrong start room'); process.exit(1); }
await d.shot('canary-start');
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const s = await d.wk();
  const foes = await d.wk('foes');
  if (foes.length) {
    const f = foes[0];
    await d.walkTo(f.x, f.z, { timeout: 3, arrive: 1.2 });
    await d.tap('j');
  } else {
    await d.walkTo((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 16, { timeout: 4, arrive: 1.5 });
  }
}
const end = await d.wk();
console.log('after 60s:', JSON.stringify(end));
await d.shot('canary-end');
d.saveLog('canary');
console.log('errors:', JSON.stringify(d.errors));
await d.close();
const ok = d.errors.length === 0 && end.hearts > 0;
console.log(ok ? 'CANARY GREEN' : 'CANARY FAIL');
process.exit(ok ? 0 : 1);
