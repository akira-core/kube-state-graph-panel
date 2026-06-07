// Drive the BACKEND demo dashboard (/d/ksg-demo, Infinity source:url against the
// local ksg). Capture default (controller) mode, toggle Node, toggle back.
//   node dev/nobackend/drive-backend.mjs
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1700, height: 950 } });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto('http://localhost:3000/d/ksg-demo?from=now-1h&to=now&kiosk', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForSelector('canvas', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(6000);
const legend = () => p.evaluate(() => document.querySelector('aside')?.innerText.replace(/\n+/g, ' | '));
const checked = () => p.evaluate(() => document.querySelector('[data-testid="layout-mode-control"] input:checked')?.id);
console.log('=== DEFAULT (expect controller) ===');
console.log('checked:', await checked());
console.log('legend:', await legend());
await p.screenshot({ path: '/tmp/be-default.png' });
console.log('=== click NODE ===');
await p.getByRole('radio', { name: 'Node' }).check({ force: true });
await p.waitForTimeout(4500);
console.log('legend:', await legend());
await p.screenshot({ path: '/tmp/be-node.png' });
console.log('=== click CONTROLLER ===');
await p.getByRole('radio', { name: 'Controller' }).check({ force: true });
await p.waitForTimeout(4500);
console.log('legend:', await legend());
await p.screenshot({ path: '/tmp/be-controller.png' });
console.log('errors:', errs.join(' || ') || 'none');
await b.close();
