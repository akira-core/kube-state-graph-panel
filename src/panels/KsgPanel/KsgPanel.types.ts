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
  // Name of an EXISTING dashboard variable to write the LEFT-clicked node's pod
  // name(s) into: a single-element write for a pod click, or the FULL list of
  // direct child pod names (multi-value) for a controller compound click. Status
  // (normal/warning/critical/missing) does NOT gate the export — any pod/
  // controller click exports. Cleared ($__empty) on deselect or a click on any
  // other node kind. Empty (default) disables it. A pod click writes a single
  // value (TEXTBOX, or custom + allowCustomValue, works); a controller click can
  // write MANY values, so the target variable MUST be type Custom with
  // Multi-value AND "Allow custom values" enabled (a plain textbox only holds one
  // value, and query/options variables would drop values outside their option
  // set). Do NOT reference it in this panel's own query (self-filter loop).
  // Independent of podListVariable and of clusterVariable.
  selectedPodVariable: string;
  // Name of an EXISTING dashboard variable to write the cluster name of the
  // LEFT-clicked pod/controller into (single value), resolved via the nearest
  // cluster-group ancestor (fallback: the node's own `cluster` label). Cleared
  // ($__empty) on deselect, a click on any other node kind, or when cluster
  // resolution fails. Empty (default) disables it. Gated independently of
  // selectedPodVariable — either can be set without the other. Use a TEXTBOX (or
  // custom + allowCustomValue) variable, and do NOT reference it in this panel's
  // own query (self-filter loop).
  clusterVariable: string;
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
  clusterVariable: '',
};
