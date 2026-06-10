import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import { ICON_SVG_BY_KIND } from '../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';

export interface KsgPanelOptions {
  layout: 'fcose' | 'dagre';
  showLegend: boolean;
  visibleKinds: NodeKind[];
  visibleEdgeTypes: EdgeType[];
  // Base path (Grafana proxy route) of the graph API backend serving the
  // node-detail URL lookups. Both queries share it under fixed sub-paths
  // (/api/v1/config_changes + /api/v1/code_changes). Empty (default) disables
  // the lookups: the Application/Containers URL buttons stay inert and no
  // query is ever issued.
  detailEndpoint: string;
}

export const ALL_KINDS = Object.keys(ICON_SVG_BY_KIND) as NodeKind[];
// All wire edge types: pod-runs-on-node is drawn only in `controller` pod-parent
// mode, so it is a filterable type and a default-visible type (both modes' edges
// stay visible by default; the type that has no edges in a given mode is inert).
export const ALL_EDGE_TYPES = Object.keys(EDGE_STYLE_BY_TYPE) as EdgeType[];

export const defaultOptions: KsgPanelOptions = {
  layout: 'fcose',
  showLegend: true,
  visibleKinds: ALL_KINDS,
  visibleEdgeTypes: ALL_EDGE_TYPES,
  detailEndpoint: '',
};
