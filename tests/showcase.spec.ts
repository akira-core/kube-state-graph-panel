import { test, expect } from '@grafana/plugin-e2e';

// The only e2e spec, and the only one there can be: this repository has no backend to run
// one against. The showcase dashboard carries its graph inline, generated from
// src/shared/fixtures/showcaseGraph.ts, so the panel renders real elements from a plain
// `docker compose up`.
//
// Edge strokes are drawn on a <canvas> and cannot be selected from the DOM —
// dashedEdges.integration.test.ts pins those. What this proves is the wiring around them:
// the generated payload (including the broker `relation` labels) survives the round trip
// through the dashboard JSON and the Infinity inline target, the panel mounts a real graph
// from it, and the legend rows reach the rail.
test('showcase dashboard renders the provisioned graph without a backend', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'ksg-switch-demo.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  await expect(panelEditPage.panel.locator.getByTestId('graph-canvas')).toBeVisible();
  await expect(panelEditPage.panel.locator.getByTestId('ingress-toggle')).toBeVisible();
  await expect(panelEditPage.panel.locator.getByTestId('edge-legend-row-network-hop')).toBeVisible();
});
