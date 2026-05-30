import { COLOR_BY_EDGE_TYPE } from '../../shared/constants/colorByEdgeType';
import { SHAPE_BY_KIND } from '../../shared/constants/shapeByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';

export interface KsgPanelOptions {
  layout: 'fcose' | 'dagre';
  showLegend: boolean;
  visibleKinds: NodeKind[];
  visibleEdgeTypes: EdgeType[];
}

export const ALL_KINDS = Object.keys(SHAPE_BY_KIND) as NodeKind[];
export const ALL_EDGE_TYPES = Object.keys(COLOR_BY_EDGE_TYPE) as EdgeType[];

export const defaultOptions: KsgPanelOptions = {
  layout: 'fcose',
  showLegend: true,
  visibleKinds: ALL_KINDS,
  visibleEdgeTypes: ALL_EDGE_TYPES,
};
