import 'cytoscape';

import type { NodeKind, EdgeType, NodeStatus, NodeAlert, AlertSeverity } from '../constants/types';

declare module 'cytoscape' {
  interface NodeDataDefinition {
    kind?: NodeKind; // mapped from upstream data.type
    status?: NodeStatus; // mapped from upstream data.status; normalize defaults to 'normal'
    namespace?: string; // extracted from upstream data.labels.namespace
    ipAddress?: string[]; // mapped from upstream data.ipaddress (moved out of labels in 524057b)
    alerts?: NodeAlert[]; // mapped from upstream data.alerts (omitted when absent/empty)
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
    // Worst alert severity among a synthesized controller's child pods (info/warning/
    // critical; unknown labels rank as critical). Aggregated in normalize; drives the
    // COLLAPSED-controller border tint in getStylesheet. Omitted when no child pod has
    // an alert (so the folded box stays neutral).
    worstAlertSeverity?: AlertSeverity;
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
  }

  interface EdgeDataDefinition {
    edgeType?: EdgeType; // mapped from upstream data.type
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
    expandCollapse(options: Partial<ExpandCollapseOptions>): ExpandCollapseApi;
  }
}
