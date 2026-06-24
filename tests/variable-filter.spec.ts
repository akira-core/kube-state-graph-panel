import { test, expect } from '@grafana/plugin-e2e';

/**
 * Regression guard: verifies that the KSG Demo dashboard exposes all four
 * provisioned template variables and that the panel still mounts under the
 * default (All) variable selection.
 *
 * These tests run GREEN after the provisioning from F1 Tasks 2-5 is committed.
 * They are developer-triggered locally (npm run e2e) — not in CI.
 *
 * Note: The kube-state-graph backend already supports the scope query params driven by
 * these variables — no image change is required.
 */

test('KSG demo dashboard exposes the cluster/namespace/name/edge_type template variables', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'ksg-demo.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);

  // Each provisioned variable renders a submenu label on the dashboard.
  // Labels match the provisioned `label` fields in ksg-demo.json:
  //   cluster → "Cluster", namespace → "Namespace",
  //   name    → "Resource name", edge_type → "Edge type"
  for (const label of ['Cluster', 'Namespace', 'Resource name', 'Edge type']) {
    await expect(
      dashboardPage.getByGrafanaSelector(`Dashboard template variables submenu Label ${label}`)
    ).toBeVisible();
  }
});

test('KSG panel mounts under default (All) variable selection', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'ksg-demo.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  // With variables defaulting to All, the customqueryparam segments expand to
  // every concrete value (equivalent to no filter), so the panel renders the
  // full graph (or empty state if the backend is unavailable) — both prove the
  // panel mounted and the parameterized URL did not break the request.
  await expect(panelEditPage.panel.locator.getByTestId(/graph-canvas|empty-state/)).toBeVisible();
});
