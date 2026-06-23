## Why

Operators inspecting a node want one-click access to the backend-curated dashboard for that node. The kube-state-graph backend now resolves a per-node dashboard URL (from its config/code-change comparison) and exposes it via a new `GET /dashboard` endpoint. Surfacing it as a button in the node-detail panel removes a manual lookup step and mirrors the existing change-report link UX.

## What Changes

- **New backend contract (panel consumes):** `GET /dashboard` with the node's attributes as query params returns `{ url: string }`. `200` + non-empty `url` ⇒ available; non-`200`, empty `url`, malformed body, or network error ⇒ unavailable. Same availability semantics as `config_changes` / `code_changes`.
- **Dashboard button beside the node name** in the node-detail panel header, shown in BOTH the left-click **alert** view and the right-click **detail** view.
- **Scope of nodes that get the button:** every leaf node, plus the **k8s-node** (`kind: node`) and **controller** compounds. The **cluster**, **namespace**, and **storageclass** compounds are excluded (no `/dashboard` call, no button).
- **Visibility is 200-gated:** the button renders only when `/dashboard` returns `200` with a non-empty `url`; otherwise it is hidden (no error surfaced).
- **Param assembly rule:**
  - Leaf node → send the node's attributes **except `labels`**.
  - Compound node (**k8s-node / controller only**) → send the node's **own** attributes **plus** attributes whose value is **identical across all children**; attributes that differ across children are **skipped**. `labels` still excluded.
  - Panel-internal rendering-only fields (accent colours, `parent`, `worstStatus`, `is*` container flags) are not backend attributes and are excluded.
- **Node-detail panel opens for the k8s-node and controller compounds** so the Dashboard button can appear for them. (Controllers already open the panel today; the k8s-node compound may need its context/tap handling enabled — confirmed in design.) Cluster / namespace / storageclass compounds remain non-opening. A compound panel with no alerts / containers / change-report still shows the node name + Dashboard button.
- **Eager prefetch:** fire the `/dashboard` request when a node panel opens (one request per opened node), reusing the existing endpoint-resolution and abort/cleanup machinery — NOT a per-canvas-node request storm.

## Capabilities

### New Capabilities

- `node-dashboard-url`: per-node Dashboard URL button — `/dashboard` request param assembly (compound child-attribute merge, `labels` and rendering-only fields excluded), `200`-gated availability, eager prefetch, and rendering beside the node name in the alert and detail views.

### Modified Capabilities

- `panel-rendering`: node-detail panel opens for the k8s-node and controller compounds (cluster / namespace / storageclass excluded) and renders the Dashboard button beside the node name in both the alert and detail views.

## Impact

- **Code:**
  - `src/features/node-detail/` — new `/dashboard` lookup hook (own hook or extension of `useNodeDetailUrls`), new `DashboardButton` component, `NodeDetailPanel` header wiring, `detailPaths.ts` adds `/dashboard`, reuse `resolveDetailEndpoint` for the base URL.
  - `src/panels/KsgPanel/` — assemble the `/dashboard` param map from the cytoscape node `data()` + its children (k8s-node / controller compound merge); ensure the panel opens for the k8s-node compound.
  - `src/features/graph-canvas/` — `cxttap` / `tap` handling extended so the k8s-node compound can open the panel (if not already).
  - `src/shared/types/` — `/dashboard` request param + response types.
- **Backend:** new `GET /dashboard` endpoint (upstream kube-state-graph) returning `{ url }`. Contract-only dependency; the demo backend may `404` and the button must hide gracefully.
- **Tests:** param-assembly helper (compound same-value merge, `labels`/rendering-fields excluded), `200`-gated availability, button render in both views, panel-open for compound nodes.
- **Specs:** new `node-dashboard-url` spec; `panel-rendering` delta.
