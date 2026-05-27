import 'cytoscape';

import type { K8sResourceKind, EdgeType } from '../constants/types';

declare module 'cytoscape' {
  interface NodeDataDefinition {
    kind?: K8sResourceKind;
    namespace?: string;
    labels?: Record<string, string>;
  }

  interface EdgeDataDefinition {
    edgeType?: EdgeType;
    weight?: number;
  }
}
