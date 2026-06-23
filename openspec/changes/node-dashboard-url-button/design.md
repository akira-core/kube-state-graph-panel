## Context

The kube-state-graph backend now resolves a per-node dashboard URL (derived from its
config/code-change comparison) and exposes it via a new `GET /dashboard` endpoint that
returns `{ url: string }`. The panel must surface that URL as a button beside the node
name in the node-detail panel, in BOTH the left-click **alert** view and the right-click
**detail** view, for leaf nodes plus the **k8s-node** (`kind: node`) and **controller**
compounds — excluding the cluster, namespace, and storageclass compounds.

Current state mapped from the code:

- **Panel-open scope already matches the target scope.** `resolveSelectedNode`
  (`KsgPanel.tsx`) returns `null` for `isCluster`/`isStorageClass`/`isNamespace` nodes and
  resolves everything else — i.e. leaf nodes, the k8s-node container, and synthesized
  controllers. So the set of nodes that open the detail panel is already _exactly_ the set
  that should get the Dashboard button.
- **Selectability is data-driven and already correct.** Only `isCluster` nodes get
  `selectable: false` (`normalize.ts`); the k8s-node container and controllers are
  selectable, so both `tap` and `cxttap` (`GraphCanvas.tsx`) already fire `onSelect` /
  `onContextSelect` for them. This resolves the proposal's open hedge ("the k8s-node
  compound may need its context/tap handling enabled"): it does **not** — no
  graph-canvas change is required.
- **The existing detail-URL flow is right-click-only.** `useNodeDetailUrls` fires the
  `config_changes` / `code_changes` queries solely off `detailRequest` (set by `cxttap`,
  carrying a captured `time`). The Dashboard button, by contrast, must appear in the
  left-click alert view too, so its fetch cannot be gated on `detailRequest`.
- **Endpoint resolution is reusable.** `resolveDetailEndpoint` yields the detail base
  (explicit option, else the datasource-proxy sibling of the graph query);
  `detailPaths.ts` names the trailing segments; `useNodeDetailUrls` owns the
  AbortController / keyed-effect / `argsRef` machinery the prefetch should mirror.
- **Node data shape** (`cytoscape.d.ts`, `normalize.ts`): a node's `data` carries the
  backend identity as panel fields — notably `kind` (mapped from upstream `type`) and
  `label` (mapped from upstream `name`; upstream `name` is **not** retained). `cluster` is
  a top-level field only on `isCluster` containers; for pods/controllers the cluster lives
  in the excluded `labels.cluster`. Synthesized controllers carry a **panel-minted** `id`
  (`ctrl/<cluster>/<ns>/<kind>/<name>`), not a backend id.

## Goals / Non-Goals

**Goals:**

- Render a Dashboard button beside the node name in both the alert and detail views,
  for leaf + k8s-node + controller nodes.
- Visibility is strictly `200`-gated: the button renders only when `/dashboard` returns
  `200` with a non-empty `url`; every other outcome hides it silently (no error surfaced,
  no spinner flash).
- Eager-prefetch the `/dashboard` request once per opened node, on ANY open (left- or
  right-click), reusing `resolveDetailEndpoint` and the existing abort/cleanup pattern.
- Assemble request params from the node's attributes with the compound child-attribute
  merge, excluding `labels` and panel-internal rendering-only fields.
- Confirm (and rely on) the existing selectability/resolution path so no graph-canvas
  tap/cxttap change ships.

**Non-Goals:**

- No Dashboard button or `/dashboard` call for cluster / namespace / storageclass
  compounds.
- No error UI — an unavailable dashboard is simply an absent button.
- No change to the `config_changes` / `code_changes` (right-click) flow.
- No backend implementation (contract-only dependency; the demo backend may `404`).
- No time-windowing of `/dashboard` (see Open Questions).

## Decisions

### D1 — Button scope == panel-open scope; no new gating

The Dashboard button is shown for any node the detail panel already opens for
(`resolveSelectedNode` ≠ `null`): leaf nodes, the k8s-node container, controllers.
Cluster/namespace/storageclass are already excluded upstream of the panel, so no separate
"which kinds get the button" predicate is introduced — the eligibility gate is the
param-assembly helper returning `undefined` (D4), which the cluster/ns/sc cases never even
reach.

_Alternative considered:_ a dedicated `DASHBOARD_BUTTON_KINDS` set mirroring
`DETAIL_URL_KINDS`. Rejected — it would duplicate the exclusion logic already encoded in
`resolveSelectedNode` and risk drift; the button scope is definitionally the panel scope.

### D2 — No graph-canvas change

The k8s-node container and controllers are already selectable and already resolve through
`resolveSelectedNode`, so `tap`/`cxttap` already open the panel for them. The proposal's
Impact line about extending `cxttap`/`tap` is dropped: verified unnecessary.

### D3 — A separate, open-driven prefetch hook

Add `useNodeDashboardUrl(params, endpoint)` rather than fold the call into
`useNodeDetailUrls`, because the trigger differs: the dashboard fetch fires whenever a
node panel **opens** (left or right click), decoupled from the right-click `detailRequest`
that drives `config_changes`/`code_changes`. It mirrors `useNodeDetailUrls`'s structure —
one effect keyed on a request-key **string**, live args read through a ref so a
same-value data refresh does not refire, AbortController registered in a ref'd Set, aborted
on key change and unmount — but issues a **single** request. It carries **no `time`**
(unlike the detail queries) since open is not a right-click and the param rule is
attribute-only.

_Alternative considered:_ extend `useNodeDetailUrls` with a third query. Rejected — it
would couple a both-views, open-driven fetch to the right-click-only `NodeDetailQueryInput`
and muddy the at-most-once-per-open semantics of each.

### D4 — Param assembly as a pure helper

Add `assembleDashboardParams(elements, nodeId): Record<string, string> | undefined`
(node-detail feature, unit-tested in isolation). Returns `undefined` when the node is
missing or is a cluster/namespace/storageclass compound (defensive eligibility gate, D1).
Otherwise:

1. **Denylist** these panel-internal / structural keys: `id`, `parent`, `worstStatus`,
   `isCluster`, `isController`, `isStorageClass`, `isNamespace`, `clusterColor`,
   `namespaceColor`, `labels`. (`id` is excluded because controllers carry a synthesized
   id, not a backend attribute; identity travels as kind+name.)
2. **Scalar-only**: keep string/number values; drop arrays/objects (`alerts`, `containers`,
   `owner`, `ipAddress`) — they are not query identity. (See Open Questions for
   `ipAddress`.)
3. **Rename `label` → `name`** so the param vocabulary matches the existing detail
   endpoints (which key on `kind` + `name`). `kind` passes through unchanged.
4. **Compound child-merge** (k8s-node / controller): direct children are the elements with
   `data.parent === nodeId`. For each key that is present with an **identical** value
   across **all** children (after the same denylist/scalar/rename treatment), add it
   **only if the compound does not already carry that key** (own-wins). Keys that differ
   across children are skipped. No children → own attributes only.
5. **`cluster` (ancestor-resolved)**: `cluster` is not a first-class leaf data field on
   eligible nodes (it lives on the ineligible `isCluster` compound, and pods carry it only
   in the denied `labels`; synthesized controllers carry it in neither). So `cluster` is
   resolved by walking `data.parent` up to the nearest `isCluster` ancestor and emitting
   its `data.cluster` — the only source uniform across pods, controllers, k8s-nodes, and
   other leaves (all nest under a cluster compound). Fallback: the node's own
   `labels.cluster` (flat / cluster-less-but-labelled payloads); omitted when neither
   exists. Ancestor wins over the label fallback; never overwrites an own `cluster` key.

   _Alternative considered:_ make `cluster` a first-class `data.cluster` in `normalize`
   (like `namespace`), letting it flow through the denylist passthrough with zero
   param-assembly logic and become reusable (hover/legend/filters). Rejected for THIS
   change as a wider blast radius (normalize + type + per-kind source decision); the
   ancestor walk is self-contained and symmetric with the existing child-walk. Revisit
   if other features need `cluster` on the node.

KsgPanel memoizes the result on `(elements, selectedNodeId)` and feeds it to
`useNodeDashboardUrl`. The shared eligibility predicate (cluster/ns/sc exclusion) is
extracted so it cannot drift from `resolveSelectedNode`.

_Note on practical contribution:_ with the current backend data shape the merge adds
little (a controller already owns `namespace`; cluster lives in the excluded `labels`; a
k8s-node spans many namespaces so `namespace` differs and is correctly skipped). The rule
is retained as the forward-compatible contract — a future shared child scalar flows through
automatically (matching the project's single-source / "upstream additions don't silently
disappear" philosophy).

### D5 — Endpoint via the existing resolver

Reuse `resolveDetailEndpoint` for the base; add `DETAIL_DASHBOARD_PATH = '/dashboard'` to
`detailPaths.ts`. The request URL is `${base}${DETAIL_DASHBOARD_PATH}` issued through
`getBackendSrv().get(...)` (proxy, never a direct external fetch), exactly like the detail
queries. An empty base idles the hook (no request, button hidden).

### D6 — Response parse and lookup state

Parse `{ url: string }`: a non-empty `url` ⇒ `ready`; a non-`200`, empty `url`, malformed
body, or network error ⇒ `unavailable` (same availability semantics as
`parseApplicationUrl`). Expose a minimal discriminated union
`DashboardLookup = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'unavailable' }`
(lighter than `DetailLookup`, which carries diff-timestamp / result-type extras a dashboard
URL never has). The button renders **iff** `status === 'ready'`; `loading` and
`unavailable` both render nothing (no flash, no error).

### D7 — DashboardButton in the panel header

Add a `DashboardButton` component (a `@grafana/ui` `LinkButton`/`IconButton` with
`href={url}`, `target="_blank"`, `rel="noopener noreferrer"`, an external-link icon, and a
tooltip) that returns `null` unless its lookup is `ready`. Render it in
`NodeDetailPanel`'s **header**, immediately after the title span and before the badges —
the header renders in both the `alerts` and `detail` views, so a single placement satisfies
the both-views requirement. Thread the state via a new optional
`dashboard?: DashboardLookup` prop on `NodeDetailPanelProps` (omitted ⇒ hidden), keeping
the panel a pure presentational component.

## Risks / Trade-offs

- **Demo backend has no `/dashboard` (404).** → The button hides gracefully (D6); the
  local demo will simply show no button. Manual verification needs a real/stub backend
  returning `{ url }`; component/unit tests cover the `ready` render without a live
  backend.
- **React 18 StrictMode double-mount fires the prefetch twice in dev.** → Same mitigation
  as `useNodeDetailUrls`: keyed effect + AbortController; production/non-StrictMode fire
  once.
- **Volatile fields in the request key would refire the prefetch on every refresh** (e.g.
  `status` changing). → Keep the param map to stable identity fields; see Open Question Q1.
- **Mode-dependent children.** The compound's children come from the current
  mode-transformed `elements`, so a controller's children (pods) exist only in controller
  mode. → The only merge-eligible shared scalar in the current shape is `namespace`, which
  is mode-invariant, so the assembled params are stable across modes. Acceptable.
- **Over-broad param passthrough could send the backend fields it does not understand.**
  → The denylist + scalar-only + rename narrows the map to identity-ish fields; tests pin
  the exact output for leaf and compound cases.

## Migration Plan

Purely additive. No data-shape or options migration. Existing dashboards gain the button
automatically once the backend serves `/dashboard`; until then the button never appears.
Rollback = remove `DashboardButton`, `useNodeDashboardUrl`, `assembleDashboardParams`, and
`DETAIL_DASHBOARD_PATH` — no persisted state or contract change to unwind.

## Open Questions

- **Q1 — `status` param:** it passes the denylist (the proposal excludes only rendering
  fields) but is health, not identity, and is volatile (would refire the prefetch key on a
  refresh). _Lean:_ exclude `status` from the request (treat it as non-identity).
- **Q2 — `ipAddress`:** send as repeated `ipaddress=` params or drop under scalar-only?
  _Lean:_ drop (identity travels as kind+name; revisit if the backend keys on IP).
- **Q3 — time window:** does `/dashboard` need `[from,to]` (its config/code comparison is
  time-windowed)? The proposal sends attributes only, and the open trigger (incl.
  left-click) captures no time. _Lean:_ omit; treat a time requirement as a follow-up
  contract change.
- **Q4 — backend param vocabulary:** D4 assumes `/dashboard` keys on `kind` + `name`
  (matching `config_changes`/`code_changes`), hence the `label → name` rename. Confirm the
  exact param names the backend expects for `/dashboard`.
