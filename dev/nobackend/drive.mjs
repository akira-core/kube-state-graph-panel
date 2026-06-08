// Drive the no-backend KSG demo: open the inline-JSON dashboard, capture node
// mode, toggle the legend's Layout control to Controller, capture controller mode.
//   node dev/nobackend/drive.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.KSG_BASE ?? 'http://localhost:3000';
const url = `${BASE}/d/ksg-switch-demo?from=now-1h&to=now&kiosk`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
await page
  .waitForSelector('canvas, [data-testid="graph-canvas"], [data-testid="empty-state"]', { timeout: 30_000 })
  .catch(() => console.log('WARN: no canvas/empty within 30s'));
await page.waitForTimeout(4500);

const legendText = () =>
  page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.innerText.replace(/\n+/g, ' | ') : '(no legend aside)';
  });
const bodySnippet = () => page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n+/g, ' | '));

console.log('=== NODE MODE ===');
console.log('canvasCount:', await page.locator('canvas').count());
console.log('legend:', await legendText());
console.log('body:', await bodySnippet());
await page.screenshot({ path: '/tmp/sw-node.png' });

const ctrl = page.locator('[data-testid="layout-mode-control"]');
console.log('layout-mode-control count:', await ctrl.count());
// Grafana RadioButtonGroup: the <input type=radio> intercepts the <label>, so
// check the radio directly (force skips the overlay actionability check).
await page.getByRole('radio', { name: 'Controller' }).check({ force: true });
await page.waitForTimeout(5500);

console.log('=== CONTROLLER MODE ===');
console.log('legend:', await legendText());
await page.screenshot({ path: '/tmp/sw-controller.png' });

console.log('=== browser logs (last 25) ===');
console.log(logs.slice(-25).join('\n'));

await browser.close();
console.log('shots: /tmp/sw-node.png /tmp/sw-controller.png');
