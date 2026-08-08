// Screenshot the ground painter's output so a human can judge it.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 960, height: 1000 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
await page.goto('http://localhost:8901/tools/preview-ground.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.screenshot({ path: process.argv[2] || '/tmp/ground.png', fullPage: true });
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'painted clean');
await b.close();
process.exit(errs.length ? 1 : 0);
