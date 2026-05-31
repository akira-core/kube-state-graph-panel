import type cytoscape from 'cytoscape';

import type { EdgeType, NodeKind } from '../../../../shared/constants/types';
import type { CyStylesheet } from '../../hooks/useCytoscape';
import type { LayoutName } from '../../hooks/useGraphLayout';

export interface GraphCanvasProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  layout: LayoutName;
  visibleKinds: NodeKind[];
  visibleEdgeTypes: EdgeType[];
  onSelect?: (nodeId: string | null) => void;
  // Controlled selection: keeps cytoscape's single selection in sync (blue
  // highlight) with the detail panel. null/undefined clears the selection.
  selectedId?: string | null;
  // Compound-collapse integration. Optional → when omitted, GraphCanvas runs
  // without expand-collapse (backward compatible). collapsedIds is the set of
  // collapsed parent container ids; onCollapsedChange always receives the full
  // next Set (not a delta).
  collapsedIds?: Set<string>;
  onCollapsedChange?: (next: Set<string>) => void;
}
