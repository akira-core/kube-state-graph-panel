import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1700, height: 950 } });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto('http://localhost:3000/d/ksg-switch-demo?from=now-1h&to=now&kiosk', {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await p.waitForSelector('canvas', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(5000);
const legend = () => p.evaluate(() => document.querySelector('aside')?.innerText.replace(/\n+/g, ' | '));
const checked = () => p.evaluate(() => document.querySelector('[data-testid="layout-mode-control"] input:checked')?.id);
console.log('=== DEFAULT (expect controller, collapsed) ===');
console.log('checked:', await checked());
console.log('legend:', await legend());
await p.screenshot({ path: '/tmp/sw-default.png' });
console.log('=== click NODE (expect clean cluster>node>pod, NO controllers) ===');
await p.getByRole('radio', { name: 'Node' }).check({ force: true });
await p.waitForTimeout(4500);
console.log('legend:', await legend());
await p.screenshot({ path: '/tmp/sw-node2.png' });
console.log('=== click CONTROLLER ===');
await p.getByRole('radio', { name: 'Controller' }).check({ force: true });
await p.waitForTimeout(4500);
console.log('legend:', await legend());
await p.screenshot({ path: '/tmp/sw-ctrl2.png' });
console.log('errors:', errs.join(' || ') || 'none');
await b.close();
