import 'cytoscape';

import type { NodeKind, EdgeType, NodeStatus } from '../constants/types';

declare module 'cytoscape' {
  interface NodeDataDefinition {
    kind?: NodeKind; // mapped from upstream data.type
    status?: NodeStatus; // mapped from upstream data.status; normalize defaults to 'normal'
    namespace?: string; // extracted from upstream data.labels.namespace
    ipAddress?: string[]; // mapped from upstream data.ipaddress (moved out of labels in 524057b)
    labels?: Record<string, string>;
    // Compound (cluster) container nodes — see normalize.ts. The grouping
    // structure (the native `parent` field) comes from the backend untouched;
    // the panel only tags `type: "cluster"` containers and assigns their colour.
    isCluster?: boolean; // true only on a backend-provided cluster container node
    cluster?: string; // cluster name carried on the container node
    clusterColor?: string; // accent colour assigned in normalize so the stylesheet stays pure
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
}
