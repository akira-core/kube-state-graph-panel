# KSG Panel

Grafana panel that renders Kubernetes resource topology as an interactive cytoscape graph. This context covers the vocabulary of the graph view and its interactions; in a deployment the graph data is produced by the upstream kube-state-graph backend.

This repository contains no backend. Its demo data is the **fixture** (below), which is also what every test asserts against.

## Language

### Graph model

**Node kind**:
The classification of a graph node (backend `data.type`): `pod`, `node`, `pvc`, `service`, `external`, `switch`, the workload controllers (`deployment`/`statefulset`/`daemonset`/`job`/`cronjob`), the physical storage pair `netapp-aggr`/`netapp-node`, `network`, plus the synthesized `application`. An open set — unknown kinds stay visible and fall back to defaults.
_Avoid_: node type, category

**Edge type**:
The classification of a graph edge; the 8-type backend wire contract: `pod-to-node`, `pod-mounts-pvc`, `pod-calls-pod`, `pod-calls-service`, `service-selects-pod`, `pvc-to-netapp-aggr`, `switch-to-switch`, `node-to-switch`. Which subset is drawn depends on the pod-parent mode.
_Avoid_: relation, link type

**Fixture**:
`SHOWCASE_GRAPH` in `src/shared/fixtures/showcaseGraph.ts` — the typed demo graph, and the single source of the panel's fake data. Typed `WireGraph` (`src/shared/types/wire.ts`, the backend's response shape in its own snake_case), compiled into the provisioned dashboard by `npm run fixture:build` and gated against drift by `npm run fixture:check`. It mixes the real wire contract with **panel-only** fields no backend emits — `status`, `alerts`, `time_records`, and the `switch` / `network` kinds with their fabric edges.
_Avoid_: mock data, seed, sample payload

**Ingress role**:
The backend's `labels.role` on an ingress node, with two values that are **not** interchangeable. `ingress-gateway` is the routed chain's entry hop: gateway pods sit behind it, the caller also has a direct edge to the backend service, so the whole shape is hideable by the ingress toggle and drawn dashed. `ingress-lb` is the non-Istio LB fallback destination: nothing is routed behind it and the caller's edge to it is that caller's **only** dependency edge, so it is never in the ingress set, never hidden, and never dashed. `collectIngressNodeIds` matches `ingress-gateway` exactly — not by prefix.
_Avoid_: gateway label, ingress marker

**Edge metrics** (RED):
The rate / error / duration measurements the backend attaches to an edge it derived from trace data (`data.metrics`, normalized to `{ rate, errorRate?, p90ServerMs? }`). `rate` is **requests per second**, `errorRate` is a **fraction in [0,1]** (not a percentage), `p90ServerMs` is **milliseconds**. Carried only on edges whose both endpoints resolve to a pod or service — in practice `pod-calls-pod` and `pod-calls-service`; never on `service-selects-pod`, the storage/topology edges, or any edge touching an `external` node.

Three states that must stay distinct: **`metrics` absent** = no measurement exists; **`errorRate` absent** = the failure counter could not be read; **`errorRate: 0`** = read successfully with no failures. Never default an absent field to `0`. Values arrive rounded to 6 significant digits, so a wide query window legitimately yields `3.86e-7` — format defensively, never `toFixed`.
_Avoid_: golden signals, edge stats, latency (alone — say `p90ServerMs`)

**Edge metrics** (storage I/O):
The other half of the `data.metrics` union, carried only on `pvc-to-netapp-aggr` edges and never mixed with RED (`rate` discriminates them). Six **measurements** read verbatim from Harvest — `readOps` / `writeOps` (per second), `readLatencyUs` / `writeLatencyUs` (average **microseconds**), `readBytesPerSec` / `writeBytesPerSec` — plus the volume's two declared **QoS ceilings**, `maxIops` and `maxBytesPerSec` (bytes per second, already converted upstream from Harvest's MB/s so a ceiling and a measurement compare directly). Every field is independently optional. A **ceiling** is a configured limit, not a reading: its absence means the volume is in no QoS policy group — never `0`, never an unlimited sentinel — and a measurement exceeding one is neither coloured nor warned about, because ONTAP throttles rather than fails.
_Avoid_: IOPS limit, quota, throttle (for the ceilings — say `maxIops` / `maxBytesPerSec`)

**Container** (compound):
A node that holds children via cytoscape nesting (`data.parent`): cluster, namespace, application, K8s node, synthesized controller, or the virtual `network` wrapper. In `node` mode pod→node is expressed as nesting; in `controller` mode it is drawn as a `pod-to-node` edge.
_Avoid_: group, box, parent node (in prose)

**Collapse**:
Folding a container so its children leave the canvas and the container renders as a single box. Per-container; controller mode default-collapses controllers on entry.
_Avoid_: fold, minimize

**Pod-parent mode**:
The view transform choosing which container pods nest under: `controller` (owner controller) or `node` (K8s node). Ephemeral view state, not persisted.
_Avoid_: layout mode (that word belongs to fcose/dagre choice)

### Visibility

**Ready status**:
A K8s node's Kubernetes Ready condition (backend `ready_status` → `data.readyStatus`): `Ready`, `NotReady`, or `Unknown`. A third axis, independent of **status** (alert severity) and **worstStatus** — a `NotReady` node with no alerts is still status-normal, and Ready never tints a border. Absence is NOT `Unknown`: the backend omits the field when the node has no Ready series and reserves that literal for a kubelet that stopped reporting.
_Avoid_: node health, readiness (alone)

**Filter-hidden**:
An element hidden by the kind / edge-type / ingress visibility filter (`computeVisibility`), including the orphan cascade. A deliberate user choice — features must announce it, never silently override it.
_Avoid_: excluded, filtered out (in code identifiers)

**Focus fade**:
The dimming applied to everything outside the selection's neighborhood (selected node + incident edges + neighbors + descendants + their ancestors). Same visual dimming as **miss fade** and the same style class — the two differ only in which lit set they compute, and never apply at once.
_Avoid_: dim, ghost

### Selection & detail

**Selection**:
The single node the user has chosen (canvas tap or locate). Drives the cy highlight, focus fade, pinned card, and variable export. Independent of the detail panel's visibility.
_Avoid_: active node, focused node

**Detail open**:
Whether the detail panel is visible. Pure UI state — closing it never clears the selection. Reopen by tapping the selected node again.
_Avoid_: detail selection

**Pinned card**:
The persistent top-right attribute card shown for the selection (same content source as the hover tooltip).
_Avoid_: pinned tooltip (in prose)

### Search

**Hit**:
A node matching the search query: case-insensitive substring over `label`, `kind`, `namespace`, `cluster`, `application`, `ipAddress`; whitespace-separated tokens AND-combined. Nodes only — a hit lights its focus neighborhood with it (see **Miss fade**), but edges are never hits themselves.
_Avoid_: match, found node

**Miss fade**:
The dimming of non-hit elements while the search query is non-empty. Lit set = the union of each hit's **focus neighborhood** — exactly what a canvas left-click on that hit would light: the hit, its incident edges, its 1-hop neighbour nodes, its descendants, and the ancestors of all of those (+ proxy-hit containers lighting theirs the same way). One shared definition with focus fade, so a lit edge can never end in a faded node. Never widened by a selection: a stale selection carried in from before the search (the detail panel's × leaves it set) stays dimmed with the other misses, and **locate** cannot widen it either, because locate ends the search outright (see **Locate**). A zero-hit query fades the whole graph. Mutually exclusive with focus fade: while searching, miss fade alone applies; clearing the query restores focus fade.
_Avoid_: search dim

**Proxy hit**:
The outermost collapsed ancestor container standing in visually for a hit folded inside it: it stays lit and joins the fit set; the collapsed hit itself has no canvas position. Typing never auto-expands anything.
_Avoid_: surrogate, stand-in

**Result**:
One row of the search dropdown list: a hit (or a filter-hidden hit, rendered disabled with an eye-slash marker, not locatable).
_Avoid_: suggestion, option

**Locate**:
The composite action of activating a result: expand the collapsed ancestor chain (if any), select the node, fit the viewport to its closed neighborhood, and **clear the search query** — the input never holds the result label. Locate therefore ends the search state outright: it reads exactly like a canvas left-click on that node (focus fade on the selection, nothing else lit), plus the fit. The only search action that mutates collapse state; expanded containers stay expanded after locate clears the query.
_Avoid_: jump, goto, navigate
