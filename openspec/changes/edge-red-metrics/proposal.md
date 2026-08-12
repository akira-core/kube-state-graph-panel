## Why

The kube-state-graph backend now attaches RED measurements (request **R**ate, **E**rror ratio, **D**uration) to trace-derived graph edges — the same three numbers Grafana's Tempo service graph shows, but keyed per pod/service pair instead of per service name. The panel currently drops that field on the floor: `parseEdges` copies only `id` / `source` / `target` / `type` / `labels`, so an operator looking at a `pod-calls-service` edge in the graph has no way to tell a 5 req/s healthy call from a 20 %-failing one. Surfacing it closes the loop between "what talks to what" (topology) and "how well" (golden signals) without leaving the panel.

## What Changes

- **Edge `data.metrics` passthrough.** `normalizeGraph` recognises the backend's optional `metrics` object on an edge and carries it onto the cytoscape `EdgeDataDefinition` as a typed `metrics` field. Malformed metrics degrade per-field (drop the bad field, keep the edge) rather than failing the edge.
- **Hover tooltip RED rows.** Hovering an edge that carries metrics adds up to three promoted rows — request rate, error rate, p90 server duration — between the existing `edgeType` row and the `labels` divider. Values are formatted for humans (`req/s`, `%`, `ms`), not printed raw.
- **Absent stays absent.** An edge without `metrics` (`pod-mounts-pvc`, `pod-to-node`, `service-selects-pod`, any external-endpoint edge, …) renders exactly as it does today — no RED rows, no placeholder, no "0". An omitted `error_rate` is likewise NOT rendered as `0 %`: the backend contract states a missing key means *unreadable*, while `0` means *read, no failures*.
- **Demo fixture exercises RED.** `dev/victoriametrics/seed.sh` gains the two companion series (`traces_service_graph_request_failed_total`, `traces_service_graph_request_server_seconds_bucket`) with label sets identical to the existing `_total` series, so `docker compose --profile backend up` shows real RED values on some edges and none on the external one.
- No new node kind, no new edge type, no new legend entry, no change to edge colour / width / labels on the canvas, no new panel option. **Not breaking**: the field is additive and optional at every level.

## Capabilities

### New Capabilities

_None._ RED is an additional attribute on an existing wire contract and an additional section in an existing tooltip; it does not introduce a new panel capability.

### Modified Capabilities

- `graph-data-integration`: the upstream payload contract gains the optional edge `data.metrics` object, and the boundary normalize function gains its validation / passthrough rules (including per-field degradation and the "omitted ≠ zero" rule).
- `panel-rendering`: the "Hover Tooltip 顯示元素 metadata" requirement gains RED rows for edges that carry metrics, with formatting and omission rules.
- `dev-environment`: the seeder must push the two RED source series so the local backend-profile demo actually produces `data.metrics`.

## Impact

**Code**

- `src/shared/types/cytoscape.d.ts` — declaration-merged `EdgeDataDefinition.metrics`.
- `src/features/graph-data/normalize.ts` — `parseEdges` metrics validation + passthrough.
- `src/features/hover-tooltip/components/HoverTooltip/HoverTooltip.tsx` — edge branch of `buildContent`.
- New pure formatter module under `src/features/hover-tooltip/` (rate / ratio / duration → display strings).
- `dev/victoriametrics/seed.sh` — two extra series families per tick.
- Tests alongside each of the above.

**Upstream dependency (blocking for the live demo, not for the panel code)**

The backend feature lives on branch `add-service-graph-red-metrics` (commits `dfb375e`, `bee02d7`) and is **not yet merged to backend `main`**, so the published `marz32one/kube-state-graph` image does not emit `data.metrics` yet. Panel-side work and its unit tests are independent of that; only end-to-end verification against `docker compose --profile backend` has to wait for a backend image built from that branch (overridable via `KSG_BACKEND_TAG`).

**Wire contract consumed** (from `pkg/cytoscape/cytoscape.go`)

```jsonc
"metrics": {
  "rate": 5,              // req/s over the query window; present and > 0 whenever `metrics` is
  "error_rate": 0.2,      // optional; ratio in [0,1], NOT percent. 0 means measured-and-clean
  "p90_server_ms": 45     // optional; milliseconds, server-observed, hardcoded p90
}
```

Values are rounded to 6 significant digits by the backend and may therefore arrive in exponent notation (`3.86e-7` is a real value from a wide time window) — the panel must format defensively rather than assume small integers.

**Not affected**: stylesheet, layout, legend, element filter, node detail panel, dashboard-URL query assembly, variable export.
