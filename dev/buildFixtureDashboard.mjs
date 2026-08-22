// Compiles the TypeScript demo fixture into the provisioned Grafana dashboard.
//
//   npm run fixture:build   — rewrite the dashboard from the fixture
//   npm run fixture:check   — fail if the dashboard is stale (CI)
//
// The Infinity datasource reads the graph from an `inline` target whose `data` is a JSON
// STRING embedded in the dashboard JSON. That string is GENERATED, never hand-edited:
// src/shared/fixtures/showcaseGraph.ts is the only source, so a wire-contract change lands
// in one typed file and the demo, the unit tests, and the e2e spec all move with it.
// `fixture:check` is what stops the two from drifting apart silently.
//
// Plain .mjs on purpose (matching dev/'s other scripts): the fixture is imported through
// Node's native TypeScript type-stripping, so no compile step or extra dependency stands
// between the source of truth and the dashboard.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHOWCASE_GRAPH } from '../src/shared/fixtures/showcaseGraph.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASHBOARD_PATH = resolve(REPO_ROOT, 'provisioning/dashboards/ksg-switch-demo.json');

// Rewrites the one inline target's `data` and returns the dashboard as text. Throws rather
// than writing a half-updated file: a dashboard whose shape moved out from under this
// script must stop the build, not silently publish a demo carrying stale data.
function renderDashboard(currentText, graph) {
  const dashboard = JSON.parse(currentText);
  const targets = (dashboard.panels ?? []).flatMap((panel) => panel.targets ?? []);
  const inline = targets.filter((target) => target.source === 'inline');
  if (inline.length !== 1) {
    throw new Error(`expected exactly 1 inline target in the dashboard, found ${inline.length}`);
  }
  // Compact: the string is machine-written and machine-read, and an indented payload would
  // multiply the dashboard diff on every fixture edit.
  inline[0].data = JSON.stringify(graph);
  return `${JSON.stringify(dashboard, null, 2)}\n`;
}

const checkOnly = process.argv.includes('--check');
const current = readFileSync(DASHBOARD_PATH, 'utf8');
const next = renderDashboard(current, SHOWCASE_GRAPH);

if (current === next) {
  console.log('fixture dashboard is up to date');
} else if (checkOnly) {
  console.error(
    'provisioning/dashboards/ksg-switch-demo.json is stale.\nRun `npm run fixture:build` and commit the result.'
  );
  process.exit(1);
} else {
  writeFileSync(DASHBOARD_PATH, next);
  console.log(`wrote ${DASHBOARD_PATH}`);
}
