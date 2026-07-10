## Why

A single node may map to more than one Grafana dashboard (metrics, logs, traces, etc.). The kube-state-graph backend can return multiple curated URLs per node; the panel must surface them without breaking the existing single-`url` contract.

## What Changes

- **Backend contract (panel consumes):** `GET /dashboard` may return `{ urls: [{ label, url }, …] }` in addition to the legacy `{ url: string }`. Availability remains **200 + at least one non-empty `url`** after parsing.
- **`parseDashboardLinks`:** pure parser with backward-compatible fallback and `label` defaults.
- **`DashboardLookup`:** `ready` carries `urls: DashboardLink[]` (length ≥ 1).
- **`DashboardButton`:** one link → existing `LinkButton` "Dashboard"; two or more → "Dashboards" trigger with a `Menu` of labeled links (new tab each).

## Capabilities

### Modified Capabilities

- `node-dashboard-url`: response parsing, `DashboardLookup` shape, multi-link UI.
- `panel-rendering`: header Dashboard affordance for single vs multiple links.

## Impact

- `src/features/node-detail/parseDashboardLinks.ts` (new)
- `src/features/node-detail/hooks/useNodeDashboardUrl.ts`
- `src/features/node-detail/components/DashboardButton/`
- Tests only; no change to `assembleDashboardParams` or `KsgPanel` wiring.
