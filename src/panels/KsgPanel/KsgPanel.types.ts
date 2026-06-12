import { isFilterableKind } from '../../features/element-filter';
import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import { ICON_SVG_BY_KIND } from '../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';

export interface KsgPanelOptions {
  layout: 'fcose' | 'dagre';
  showLegend: boolean;
  visibleKinds: NodeKind[];
  visibleEdgeTypes: EdgeType[];
  // Override for the base path of the graph API backend serving the node-detail
  // URL lookups. Both queries share it under fixed sub-paths
  // (/api/v1/config_changes + /api/v1/code_changes). Empty (default) derives the
  // endpoint from the dashboard query's datasource instead — its Grafana proxy
  // path /api/datasources/proxy/uid/<uid>; when neither resolves, the lookups
  // are disabled: the Application/Containers URL buttons stay inert and no
  // query is ever issued.
  detailEndpoint: string;
  // Name of an EXISTING dashboard variable to export the graph's pod names
  // into (multi-value, via var-<name> URL sync) — e.g. for an ES logs panel
  // consuming ${pod_list:lucene}. Empty (default) disables the export. The
  // panel can only set values; it cannot create the variable or its options.
  podListVariable: string;
}

// The filterable-kind universe, derived from the element-filter's single
// predicate (which is what exempts the `network` virtual wrapper — see
// isFilterableKind for the why) over the canonical icon map.
export const ALL_KINDS = Object.keys(ICON_SVG_BY_KIND).filter(isFilterableKind);
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
  podListVariable: '',
};
