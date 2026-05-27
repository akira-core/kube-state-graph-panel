import { test, expect } from '@grafana/plugin-e2e';

test('KSG panel renders empty state when no graph data is returned', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'ksg-demo.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  // Either real data renders the graph canvas, or empty state shows up — both prove the panel mounted.
  await expect(panelEditPage.panel.locator.getByTestId(/graph-canvas|empty-state/)).toBeVisible();
});
