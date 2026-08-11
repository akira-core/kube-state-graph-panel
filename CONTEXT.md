# KSG Panel

Grafana panel that renders Kubernetes resource topology as an interactive cytoscape graph. This context covers the vocabulary of the graph view and its interactions; the graph data itself is produced by the upstream kube-state-graph backend.

## Language

### Graph model

**Node kind**:
The classification of a graph node (backend `data.type`): `pod`, `node`, `pvc`, `service`, `external`, `switch`, the workload controllers (`deployment`/`statefulset`/`daemonset`/`job`/`cronjob`), `storageclass`, `network`, plus the synthesized `application`. An open set — unknown kinds stay visible and fall back to defaults.
_Avoid_: node type, category

**Edge type**:
The classification of a graph edge; the 8-type backend wire contract: `pod-to-node`, `pod-mounts-pvc`, `pod-calls-pod`, `pod-calls-service`, `service-selects-pod`, `pvc-to-storageclass`, `switch-to-switch`, `node-to-switch`. Which subset is drawn depends on the pod-parent mode.
_Avoid_: relation, link type

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

**Filter-hidden**:
An element hidden by the kind / edge-type / ingress visibility filter (`computeVisibility`), including the orphan cascade. A deliberate user choice — features must announce it, never silently override it.
_Avoid_: excluded, filtered out (in code identifiers)

**Focus fade**:
The dimming applied to everything outside the selection's neighborhood (selected node + incident edges + neighbors + descendants + their ancestors).
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
A node matching the search query: case-insensitive substring over `label`, `kind`, `namespace`, `cluster`, `application`, `ipAddress`; whitespace-separated tokens AND-combined. Nodes only — a hit's incident edges light up with it, edges are never hits themselves.
_Avoid_: match, found node

**Miss fade**:
The dimming of non-hit elements while the search query is non-empty. Mutually exclusive with focus fade: while searching, miss fade alone applies; clearing the query restores focus fade.
_Avoid_: search dim

**Proxy hit**:
The outermost collapsed ancestor container standing in visually for a hit folded inside it: it stays lit and joins the fit set; the collapsed hit itself has no canvas position. Typing never auto-expands anything.
_Avoid_: surrogate, stand-in

**Result**:
One row of the search dropdown list: a hit (or a filter-hidden hit, rendered disabled with an eye-slash marker, not locatable).
_Avoid_: suggestion, option

**Locate**:
The composite action of activating a result: expand the collapsed ancestor chain (if any), select the node, and fit the viewport to its closed neighborhood. The only search action that mutates collapse state; expanded containers stay expanded after the query clears.
_Avoid_: jump, goto, navigate
