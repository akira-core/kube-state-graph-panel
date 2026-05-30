import 'cytoscape';

import type { NodeKind, EdgeType } from '../constants/types';

declare module 'cytoscape' {
  interface NodeDataDefinition {
    kind?: NodeKind; // mapped from upstream data.type
    namespace?: string; // extracted from upstream data.labels.namespace
    ipAddress?: string[]; // mapped from upstream data.ipaddress (moved out of labels in 524057b)
    labels?: Record<string, string>;
  }

  interface EdgeDataDefinition {
    edgeType?: EdgeType; // mapped from upstream data.type
    labels?: Record<string, string>;
  }
}
