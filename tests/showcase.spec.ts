import { test, expect } from '@grafana/plugin-e2e';

// The showcase dashboard carries its graph inline (source: "inline"), so unlike ksg-demo
// this renders real elements with no backend running. Edge strokes themselves are drawn on
// a <canvas> and cannot be selected from the DOM — dashedEdges.integration.test.ts pins
// those. What this proves is the wiring around them: the provisioned payload (including the
// broker `relation` labels) parses, the panel mounts a real graph from it, and the legend
// row explaining the dashed strokes reaches the rail.
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
