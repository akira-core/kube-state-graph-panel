## Context

`useNodeDashboardUrl` already eager-prefetches `GET <base>/dashboard` once per opened node. The response today is `{ url }` → one `LinkButton`. Backend will add `{ urls: [{ label, url }] }` for multi-dashboard nodes.

## Decisions

### D1 — Single request, array response

Keep one `/dashboard` call per node/time-window. Parse multiple links from one body; do not fan out N requests.

### D2 — Backward-compatible parser

`parseDashboardLinks(res)`:

1. If `urls` is a non-empty array after filtering invalid entries → use it.
2. Else if legacy `url` is a non-empty string → `[{ label: 'Dashboard', url }]`.
3. Else → `undefined` (hook maps to unavailable).

`label` fallback: non-empty `item.label` → last URL path segment → `"Dashboard"` / `"Dashboard N"`.

### D3 — UI: one vs many

| `urls.length` | UI |
|---------------|-----|
| 1 | Unchanged `LinkButton` "Dashboard", `node-detail-dashboard-button` |
| 2+ | `Button` "Dashboards" + `Menu` overlay (`node-detail-dashboards-menu`, items `node-detail-dashboard-link-{i}`) |

Grafana 12 `@grafana/ui` has no `Dropdown`; use `Button` + `Menu` + `ClickOutsideWrapper` (same labeled `Menu.Item` with `url` + `target="_blank"`).

### D4 — No wiring changes

`KsgPanel` / `NodeDetailPanel` props unchanged; only `DashboardLookup` discriminant `ready` shape widens from `url` to `urls`.
