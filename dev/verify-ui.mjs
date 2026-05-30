// Visual verification of the panel UI changes against the running demo:
//   1. full-panel screenshot (new pentagon/star shapes + glyph/arrow legend)
//   2. a mouse sweep over the cytoscape canvas to trigger + capture the hover
//      tooltip — proving the hover-binding fix actually works end to end.
// Usage: node dev/verify-ui.mjs
import { chromium } from '@playwright/test';

const URL = process.env.KSG_DASH_URL ?? 'http://localhost:3000/d/ksg-demo/ksg-demo?from=now-1h&to=now&kiosk';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForSelector('canvas', { timeout: 30_000 });
await page.waitForTimeout(4000); // let fcose settle

await page.screenshot({ path: '/tmp/ksg-ui.png' });
console.log('full-panel screenshot: /tmp/ksg-ui.png');

// Sweep the canvas to land the pointer on a node and surface the tooltip.
const canvas = page.locator('[data-testid="graph-canvas"] canvas').first();
const box = await canvas.boundingBox();
const tooltip = page.locator('[data-testid="hover-tooltip"]');
let found = false;

if (box) {
  const cols = 26;
  const rows = 16;
  outer: for (let r = 1; r < rows && !found; r++) {
    for (let c = 1; c < cols; c++) {
      const x = box.x + (box.width * c) / cols;
      const y = box.y + (box.height * r) / rows;
      await page.mouse.move(x, y);
      await page.waitForTimeout(20);
      if (await tooltip.isVisible().catch(() => false)) {
        found = true;
        await page.waitForTimeout(150);
        await page.screenshot({ path: '/tmp/ksg-hover.png' });
        const text = (await tooltip.innerText()).replace(/\n/g, ' | ');
        console.log('HOVER TOOLTIP VISIBLE ✅  ->', text);
        console.log('hover screenshot: /tmp/ksg-hover.png');
        break outer;
      }
    }
  }
}

if (!found) {
  console.log('HOVER TOOLTIP NOT FOUND ❌ (swept canvas, tooltip never appeared)');
}

await browser.close();
