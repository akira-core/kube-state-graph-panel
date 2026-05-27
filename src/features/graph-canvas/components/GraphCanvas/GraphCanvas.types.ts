import type cytoscape from 'cytoscape';

import type { EdgeType, K8sResourceKind } from '../../../../shared/constants/types';
import type { CyStylesheet } from '../../hooks/useCytoscape';
import type { LayoutName } from '../../hooks/useGraphLayout';

export interface GraphCanvasProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  layout: LayoutName;
  visibleKinds: K8sResourceKind[];
  visibleEdgeTypes: EdgeType[];
  onSelect?: (nodeId: string | null) => void;
}
