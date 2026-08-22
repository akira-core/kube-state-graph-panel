// Verify the legend-left layout + hover tooltip (all labels + "labels" divider).
// Default shot, then scan the canvas with the mouse to trigger node/pod hovers.
// Usage: node dev/hover-screenshot.mjs
import { chromium } from '@playwright/test';

const URL = process.env.KSG_DASH_URL ?? 'http://localhost:3000/d/ksg-switch-demo/ksg-showcase?from=now-1h&to=now&kiosk';
const TIP = '[data-testid="hover-tooltip"]';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForSelector('canvas', { timeout: 30_000 });
await page.waitForTimeout(4000); // let fcose settle + paint

await page.screenshot({ path: '/tmp/ksg-layout.png' });
console.log('layout shot: /tmp/ksg-layout.png');

const box = await (await page.$('canvas')).boundingBox();
const seen = new Set();
let shots = 0;
const park = async () => {
  await page.mouse.move(box.x + box.width - 6, box.y + box.height - 6);
  await page.waitForTimeout(120);
};

scan: for (let y = box.y + 16; y < box.y + box.height - 16; y += 16) {
  for (let x = box.x + 16; x < box.x + box.width - 16; x += 16) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(35);
    if (!(await page.$(TIP))) {
      continue;
    }
    const title = (await page.textContent(`${TIP} > div`))?.trim() ?? '';
    if (!title || seen.has(title)) {
      continue;
    }
    seen.add(title);
    await page.screenshot({
      path: `/tmp/ksg-hover-${shots}.png`,
      clip: { x: box.x + box.width - 320, y: box.y, width: 320, height: 320 },
    });
    await page.screenshot({ path: `/tmp/ksg-hover-${shots}-full.png` });
    console.log(`hover shot ${shots}: "${title}"`);
    if (++shots >= 4) {
      break scan;
    }
    await park();
  }
}
console.log('total hover shots:', shots);
await browser.close();
