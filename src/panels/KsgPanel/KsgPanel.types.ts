import { isFilterableKind } from '../../features/element-filter';
import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import { ICON_SVG_BY_KIND } from '../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';

export interface KsgPanelOptions {
  layout: 'fcose' | 'dagre';
  showLegend: boolean;
  visibleKinds: NodeKind[];
  visibleEdgeTypes: EdgeType[];
  // Override for the base the node-detail URL lookups append their fixed
  // segments (/config_changes + /code_changes) to. Empty (default) DERIVES the
  // base from the dashboard query so the detail endpoints resolve as SIBLINGS of
  // the graph query: the datasource's Grafana proxy path
  // /api/datasources/proxy/uid/<uid> plus the graph query's own directory (a
  // query at …/api/v1/graph/service_graph → …/api/v1/graph/config_changes). When
  // neither an option nor a derivable datasource resolves, the lookups are
  // disabled: the Application/Containers URL buttons stay inert and no query is
  // ever issued.
  detailEndpoint: string;
  // Name of an EXISTING dashboard variable to export the graph's pod names
  // into (multi-value, via var-<name> URL sync) — e.g. for an ES logs panel
  // consuming ${pod_list:lucene}. Empty (default) disables the export. The
  // panel can only set values; it cannot create the variable or its options.
  podListVariable: string;
  // Name of an EXISTING dashboard variable to write the LEFT-clicked pod's name
  // into, but ONLY when that pod's status is non-normal (warning/critical), so a
  // sibling panel can query that one pod via $selected_pod. Cleared ($__empty) on
  // deselect / a normal pod / a non-pod. Empty (default) disables
  // it. Use a TEXTBOX (or custom + allowCustomValue) variable — a query/options
  // variable would drop the externally-written value — and do NOT reference it in
  // this panel's own query (self-filter loop). Independent of podListVariable.
  selectedPodVariable: string;
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
  selectedPodVariable: '',
};
