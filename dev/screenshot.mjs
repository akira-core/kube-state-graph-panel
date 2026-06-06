// One-off: screenshot the provisioned KSG Demo panel to verify it renders.
// Usage: node dev/screenshot.mjs
import { chromium } from '@playwright/test';

const URL = process.env.KSG_DASH_URL ?? 'http://localhost:3000/d/ksg-demo/ksg-demo?from=now-1h&to=now&kiosk';
const OUT = process.env.KSG_SHOT ?? '/tmp/ksg-panel.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => console.log('  [browser]', m.type(), m.text()));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });

// The panel draws into a <canvas> created by cytoscape. Wait for it to appear.
try {
  await page.waitForSelector('canvas', { timeout: 30_000 });
} catch {
  console.log('  WARN: no <canvas> found within timeout');
}
// Give cytoscape a beat to run layout + paint.
await page.waitForTimeout(4000);

await page.screenshot({ path: OUT, fullPage: false });
console.log('screenshot written:', OUT);

// Also dump any visible error/empty-state text for diagnostics.
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('--- visible text (first 500 chars) ---');
console.log(bodyText);

await browser.close();
