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
}
