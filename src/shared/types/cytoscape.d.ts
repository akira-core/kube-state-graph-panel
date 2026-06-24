import 'cytoscape';

import type { GraphEdgeType, GraphNodeKind, NodeStatus, NodeAlert } from '../constants/types';

import type { ContainerSpec } from './containerSpec';

declare module 'cytoscape' {
  interface NodeDataDefinition {
    kind?: GraphNodeKind; // mapped from upstream data.type (may be an unknown backend kind)
    status?: NodeStatus; // mapped from upstream data.status; normalize defaults to 'normal'
    namespace?: string; // extracted from upstream data.labels.namespace
    ipAddress?: string[]; // mapped from upstream data.ipaddress (moved out of labels in 524057b)
    // ArgoCD application name carried on pod nodes by the backend; a synthesized
    // controller takes it from its first valued owned pod in stable podId order
    // (normalize.ts). Drives the detail panel's Application section and both
    // detail-URL queries. Omitted when absent/empty.
    application?: string;
    // Container name/image specs carried on pod nodes (upstream `containers`); a
    // synthesized controller carries the (name, image)-deduped union across its
    // owned pods. Omitted when absent or nothing valid survives validation.
    containers?: ContainerSpec[];
    // A pod's controller owner (typed upstream `data.owner` passthrough). The
    // detail-URL queries resolve a pod's controller kind/name from it; a pod
    // without one queries as itself (standalone pod).
    owner?: { kind: string; name: string };
    // Mapped from upstream data.alerts (omitted when absent/empty). A synthesized
    // controller aggregates its child pods' alerts here (normalize.ts) so its detail
    // panel lists them — colour still comes from status/worstStatus, never alerts.
    alerts?: NodeAlert[];
    labels?: Record<string, string>;
    // Compound (cluster) container nodes — see normalize.ts. The grouping
    // structure (the native `parent` field) comes from the backend untouched;
    // the panel only tags `type: "cluster"` containers and assigns their colour.
    isCluster?: boolean; // true only on a backend-provided cluster container node
    cluster?: string; // cluster name carried on the container node
    clusterColor?: string; // accent colour assigned in normalize so the stylesheet stays pure
    // true only on a panel-synthesized controller node (see normalize.ts);
    // distinguishes a controller container from a K8s `node` container in
    // controller mode (deriveContainers).
    isController?: boolean;
    // Worst STATUS a COLLAPSED container would HIDE, surfaced as its border tint in
    // getStylesheet. On a synthesized controller = worst child-pod status; on a k8s
    // `node` container = worst of its OWN status and its child pods' statuses
    // (worst-wins). Aggregated in normalize. Omitted when that worst is `normal` (so the
    // folded box keeps its neutral / own-status border).
    worstStatus?: NodeStatus;
    // true only on a backend-synthesized StorageClass compound group node
    // (data.type === 'storageclass'; cluster > storageclass > pvc nesting). UNLIKE
    // isCluster, it ALSO carries a real `kind: 'storageclass'` — it renders exactly
    // like the K8s `node` container (icon-less while an expanded :parent, shows its
    // kind glyph when collapsed/leaf) and is filterable via visibleKinds. The flag
    // itself only drives three non-style behaviours: its own "Storage classes" swatch
    // legend section, exclusion from the detail panel, and synthesized hover context.
    // It nests under its cluster, tints from that cluster's accent, and stays
    // interactive / collapsible.
    isStorageClass?: boolean;
    // Panel-synthesized namespace compound — CONTROLLER MODE ONLY (applyNamespaceGrouping).
    // Groups namespaced resources under their cluster: cluster > namespace >
    // {controller > pod, service, storageclass > pvc}. Decorative (selectable:false),
    // carries NO status / alerts / worstStatus; coloured by a stable hash of the
    // namespace name. node mode draws no namespace, so neither flag appears there.
    isNamespace?: boolean; // true only on a synthesized namespace box
    namespaceColor?: string; // accent assigned in applyNamespaceGrouping so the stylesheet stays pure
  }

  interface EdgeDataDefinition {
    edgeType?: GraphEdgeType; // mapped from upstream data.type (may be an unknown backend edge type)
    labels?: Record<string, string>;
  }

  // `events` is a real cytoscape node style key (toggles event capture) missing
  // from @types/cytoscape — declared here so getStylesheet can set it without a cast.
  namespace Css {
    interface Node {
      events?: 'yes' | 'no';
    }
  }

  // cytoscape-expand-collapse: Core augmentation (expandCollapse method) is the
  // panel's extension API surface. The module stub lives in cytoscape-extensions.d.ts.
  interface ExpandCollapseOptions {
    layoutBy: cytoscape.LayoutOptions | null;
    fisheye: boolean;
    animate: boolean;
    undoable: boolean;
    cueEnabled: boolean;
  }

  interface ExpandCollapseApi {
    collapse(nodes: cytoscape.NodeCollection): void;
    expand(nodes: cytoscape.NodeCollection): void;
    collapseAll(): void;
    expandAll(): void;
    isExpandable(node: cytoscape.NodeSingular): boolean;
    isCollapsible(node: cytoscape.NodeSingular): boolean;
    getCollapsedChildren(node: cytoscape.NodeSingular): cytoscape.NodeCollection;
    getCollapsedChildrenRecursively(node: cytoscape.NodeSingular): cytoscape.NodeCollection;
  }

  interface Core {
    // 'get' returns the already-initialised api WITHOUT re-running the extension's
    // full init (which would stack an extra cue canvas + duplicate listeners).
    expandCollapse(options: Partial<ExpandCollapseOptions> | 'get'): ExpandCollapseApi;
  }
}
