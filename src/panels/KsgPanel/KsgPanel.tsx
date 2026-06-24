import { css } from '@emotion/css';
import { LoadingState, type GrafanaTheme2, type PanelProps } from '@grafana/data';
import { Alert, useStyles2, useTheme2 } from '@grafana/ui';
import type cytoscape from 'cytoscape';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { computeVisibility, isFilterableKind } from '../../features/element-filter';
import { EmptyState, GraphCanvas, LoadingOverlay } from '../../features/graph-canvas';
import { applyNamespaceGrouping, useGraphData, wrapSwitchFabric } from '../../features/graph-data';
import {
  ClusterLegend,
  EdgeLegend,
  LayoutModeControl,
  NamespaceLegend,
  NodeContainerLegend,
  NodeLegend,
  StatusLegend,
  StorageClassLegend,
  type ClusterLegendEntry,
  type NamespaceLegendEntry,
} from '../../features/legend';
import {
  assembleDashboardParams,
  DETAIL_URL_KINDS,
  isDashboardEligible,
  NodeDetailPanel,
  resolveDetailEndpoint,
  useNodeDashboardUrl,
  useNodeDetailUrls,
  type NodeDetailData,
  type NodeDetailQueryInput,
} from '../../features/node-detail';
import { applyPodParentMode } from '../../features/pod-parent-mode';
import { useGraphTheme } from '../../features/theme';
import { useSelectedPodExport, useVariableExport } from '../../features/variable-export';
import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import type { EdgeType, NodeKind, PodParentMode } from '../../shared/constants/types';
import { themeColors } from '../../shared/theme/themeColors';

import { deriveLegendEntries } from './deriveLegendEntries';
import { deriveContainers } from './deriveNodeContainers';
import { deriveStorageClassContainers } from './deriveStorageClassContainers';
import { ALL_KINDS, defaultOptions, type KsgPanelOptions } from './KsgPanel.types';
import { useCollapseGroup } from './useCollapseGroup';

export type KsgPanelProps = PanelProps<KsgPanelOptions>;

// Clicking an alert's time rewinds the dashboard to a fixed ±5-minute window
// centred on that alert (alert time is Unix seconds; AbsoluteTimeRange is ms).
const ALERT_REWIND_HALF_WINDOW_SEC = 300;

function getStyles(theme: GrafanaTheme2): {
  root: string;
  canvasArea: string;
  legendArea: string;
  emptyOverlay: string;
  partialWarning: string;
} {
  const borderWeak = themeColors(theme).border.weak;
  return {
    root: css({
      display: 'flex',
      width: '100%',
      height: '100%',
    }),
    canvasArea: css({
      flex: 1,
      minWidth: 0,
      position: 'relative',
    }),
    // EmptyState floats ABOVE the canvas instead of replacing it: the cytoscape
    // instance (positions, zoom/pan, collapse geometry) must survive a transient
    // all-kinds-filtered state (panel-rendering spec: canvas 本身保留，不重建 instance).
    emptyOverlay: css({
      position: 'absolute',
      inset: 0,
      zIndex: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }),
    // Non-blocking partial-parse warning: invalid entries were skipped but the
    // remaining graph renders normally (graph-data-integration spec).
    partialWarning: css({
      position: 'absolute',
      top: 8,
      left: 8,
      right: 8,
      zIndex: 3,
      pointerEvents: 'none',
    }),
    // Legend sits to the LEFT of the canvas (rendered before it in the DOM).
    // Order: Layout toggle, then the reference sections (Node Kinds / Edge Types /
    // Status), then the swatch sections (Clusters / Nodes|Controllers / Storage
    // Classes). A hairline divider separates each stacked section: a top border on
    // every section after the first.
    legendArea: css({
      width: 200,
      flexShrink: 0,
      padding: '0 8px',
      overflowY: 'auto',
      borderRight: `1px solid ${borderWeak}`,
      // Shrink every section heading one step (h4 → h5) so long titles like
      // "Storage Classes (N)" fit on one line in the 200px rail. The fold-toggle
      // button inherits this via `font: inherit`.
      '& h4': {
        fontSize: theme.typography.h5.fontSize,
      },
      '& > div + div': {
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${borderWeak}`,
      },
    }),
  };
}

// True when any ancestor (via data.parent) of `id` is a collapsed container —
// such a node is folded off the canvas even though it stays in `elements`.
function hasCollapsedAncestor(
  elements: cytoscape.ElementDefinition[],
  id: string,
  collapsedIds: ReadonlySet<string>
): boolean {
  const parentById = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string' && typeof d.parent === 'string') {
      parentById.set(d.id, d.parent);
    }
  }
  let ancestor = parentById.get(id);
  let hops = 0;
  while (ancestor !== undefined && hops < parentById.size + 1) {
    if (collapsedIds.has(ancestor)) {
      return true;
    }
    ancestor = parentById.get(ancestor);
    hops += 1;
  }
  return false;
}

// Pure resolution of the selected node's detail data from the element list.
// Exported for unit testing. A node that is not in `visibleNodeIds` (hidden by
// kind/edge filtering or orphan cascade) or folded inside a collapsed container
// resolves to null so the detail panel never describes a node that is not on
// the canvas. (A collapsed container ITSELF is still on canvas as a box.)
export function resolveSelectedNode(
  elements: cytoscape.ElementDefinition[],
  selectedNodeId: string | null,
  visibleNodeIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string> = new Set()
): NodeDetailData | null {
  if (selectedNodeId === null || !visibleNodeIds.has(selectedNodeId)) {
    return null;
  }
  if (collapsedIds.size > 0 && hasCollapsedAncestor(elements, selectedNodeId, collapsedIds)) {
    return null;
  }
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.id === selectedNodeId && isDashboardEligible(d)) {
      const label = typeof d.label === 'string' ? d.label : selectedNodeId;
      // Controller identity the detail-URL queries use (D4), resolved only for the
      // kinds they may fire for: a pod from its owner (kind lowercased to match the
      // synthesized-controller convention), a controller from itself, an owner-less
      // standalone pod from its own kind/name.
      let queryTarget: { kind: string; name: string } | undefined;
      if (d.kind !== undefined && DETAIL_URL_KINDS.has(d.kind)) {
        if (d.kind === 'pod') {
          // The owner kind is validated against the detail-URL contract too: a pod
          // owned by anything else (a static pod's Node, an operator CRD like
          // Rollout) falls back to the standalone-pod identity instead of firing
          // queries with an out-of-contract kind.
          const ownerKind = d.owner !== undefined ? d.owner.kind.toLowerCase() : undefined;
          queryTarget =
            d.owner !== undefined && ownerKind !== undefined && DETAIL_URL_KINDS.has(ownerKind as NodeKind)
              ? { kind: ownerKind, name: d.owner.name }
              : { kind: 'pod', name: label };
        } else {
          queryTarget = { kind: d.kind, name: label };
        }
      }
      return {
        id: selectedNodeId,
        label,
        ...(d.kind !== undefined ? { kind: d.kind } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.alerts !== undefined ? { alerts: d.alerts } : {}),
        ...(d.application !== undefined ? { application: d.application } : {}),
        ...(d.containers !== undefined ? { containers: d.containers } : {}),
        ...(queryTarget !== undefined ? { queryTarget } : {}),
      };
    }
  }
  return null;
}

export function KsgPanel(props: Readonly<KsgPanelProps>): React.JSX.Element {
  const { options, data, onChangeTimeRange, onOptionsChange, timeZone } = props;
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const stylesheet = useGraphTheme();

  // Backwards-compatible options read — older dashboards may lack new fields
  const visibleKinds = options.visibleKinds ?? defaultOptions.visibleKinds;
  const visibleEdgeTypes = options.visibleEdgeTypes ?? defaultOptions.visibleEdgeTypes;

  const isLoading = data.state === LoadingState.Loading;
  // DataQueryError.message is optional — fall back through statusText/status, and
  // treat state === Error with no errors[] entry as a failure too, so a
  // message-less failure is never rendered as an empty-but-successful graph.
  const firstQueryError = data.errors?.[0] ?? (data.state === LoadingState.Error ? {} : undefined);
  const seriesError =
    firstQueryError !== undefined
      ? (firstQueryError.message ??
        firstQueryError.statusText ??
        `Query failed (status ${String(firstQueryError.status ?? 'unknown')})`)
      : undefined;
  const { elements: baseElements, error: normalizeError, hasPayload } = useGraphData(data);

  // Whole-payload normalize failure (nothing parsed) — shared verbatim by the
  // variable-export gate below and the fatal early return so the two can't drift.
  const isFatalNormalizeError = normalizeError !== undefined && baseElements.length === 0;

  // Export every pod name into the dashboard variable named by the option (for
  // consumers like an ES logs panel). Reads baseElements — the data-layer truth,
  // before the pod-parent-mode/switch-fabric view transforms. Gated off in every
  // "not a successful graph load" state: no recognizable payload (hasPayload
  // false — this also covers the first load, where the series is still empty),
  // query error, and whole-payload normalize failure — none of those may be
  // written out as "no pods"; only a loaded graph that truly has zero pods
  // clears the variable ($__empty).
  const podListVariable = options.podListVariable ?? defaultOptions.podListVariable;
  const variableExportEnabled = hasPayload && seriesError === undefined && !isFatalNormalizeError;
  useVariableExport(baseElements, podListVariable, variableExportEnabled);

  // Pod-parent view mode — deliberately ephemeral per-session view state,
  // toggled from the legend and NOT persisted to panel options (unlike the
  // visibleKinds eye toggles, which write through onOptionsChange — see
  // handleToggleKind): a mode flip is a transient way of looking at the same
  // data, not a dashboard-authoring decision. 'controller' re-parents pods
  // under their owning controller and swaps the pod↔node / pod↔controller
  // relationships between nesting and drawn edge. Default 'controller'
  // aggregates pods under their owning controller; 'node' is the
  // infrastructure view (clean cluster > node > pod backend topology).
  const [podParentMode, setPodParentMode] = useState<PodParentMode>('controller');
  // View-transform pipeline (each a pure pass, mode-threaded): applyPodParentMode
  // re-shapes pod nesting; applyNamespaceGrouping inserts the virtual namespace
  // compounds in CONTROLLER mode (no-op in node mode — namespace-grouping spec);
  // wrapSwitchFabric synthesizes the virtual `network > switch` compound when the
  // data ships parent-less switches without its own network group (switch-tier-layout).
  const elements = useMemo(
    () => wrapSwitchFabric(applyNamespaceGrouping(applyPodParentMode(baseElements, podParentMode), podParentMode)),
    [baseElements, podParentMode]
  );

  // Selected node id drives both the detail panel and (controlled) the cy
  // selection highlight. GraphCanvas reports taps via onSelect.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Right-click intent: which node the detail-URL queries were requested for, and
  // WHEN (Unix seconds, captured once at the click so re-renders never refetch).
  // Left-click / background tap / close all clear it — only an explicit right-click
  // (onContextSelect) ever queries (D1).
  const [detailRequest, setDetailRequest] = useState<{ nodeId: string; time: number } | null>(null);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setDetailRequest(null);
  }, []);

  const handleContextSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
    setDetailRequest({ nodeId: id, time: Math.floor(Date.now() / 1000) });
  }, []);

  // Rewind the dashboard time range to a fixed ±5m window around the clicked
  // alert's time (seconds → ms for AbsoluteTimeRange).
  const handleAlertTimeClick = useCallback(
    (timeSec: number) => {
      onChangeTimeRange({
        from: (timeSec - ALERT_REWIND_HALF_WINDOW_SEC) * 1000,
        to: (timeSec + ALERT_REWIND_HALF_WINDOW_SEC) * 1000,
      });
    },
    [onChangeTimeRange]
  );

  // Collapsed parent-container ids. Lives here so the legend toggles (siblings of
  // GraphCanvas) and the canvas share one source. GraphCanvas reports the full
  // next Set via onCollapsedChange (cue events / data-refresh prune).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // The ONE visibility computation (kind/edge filter + orphan cascade) over the
  // mode-transformed elements. GraphCanvas applies it to the live graph verbatim
  // (useElementFilter) and the detail panel gates on it below — computing it once
  // keeps the two in lockstep and halves the most expensive pure pass.
  const visibility = useMemo(
    () => computeVisibility(elements, visibleKinds, visibleEdgeTypes),
    [elements, visibleKinds, visibleEdgeTypes]
  );
  const { visibleNodeIds } = visibility;

  // Resolve the selected node's display data from elements. Cluster containers,
  // hidden nodes and nodes folded inside a collapsed container are excluded; a
  // missing id (data refresh removed it) closes the panel.
  const selectedNode = useMemo(
    () => resolveSelectedNode(elements, selectedNodeId, visibleNodeIds, collapsedIds),
    [elements, selectedNodeId, visibleNodeIds, collapsedIds]
  );

  // The detail-URL query input: defined ONLY when the current selection came from a
  // right-click on that same node AND it resolves an application + query target
  // (pod/controller kinds only — queryTarget gates the rest). The endpoint resolves
  // option-overrides-derivation (D7): an explicit option wins, otherwise the
  // dashboard query's datasource proxy path; '' idles the hook (no query ever).
  const detailEndpointOption = options.detailEndpoint ?? defaultOptions.detailEndpoint;
  const detailEndpoint = useMemo(
    () => resolveDetailEndpoint({ option: detailEndpointOption, request: data.request }),
    [detailEndpointOption, data.request]
  );
  // Memoized so its identity is stable across re-renders of the same selection:
  // useNodeDetailUrls now EAGER-prefetches in an effect keyed by this input, so an
  // unstable (re-created-every-render) object would re-fire and re-abort the
  // prefetch on every render (D7). `time` is captured once at right-click, so the
  // memo is stable for a given (selectedNode, detailRequest).
  const detailQueryInput = useMemo<NodeDetailQueryInput | undefined>(
    () =>
      detailRequest !== null &&
      selectedNode !== null &&
      detailRequest.nodeId === selectedNode.id &&
      selectedNode.application !== undefined &&
      selectedNode.queryTarget !== undefined
        ? {
            application: selectedNode.application,
            kind: selectedNode.queryTarget.kind,
            name: selectedNode.queryTarget.name,
            time: detailRequest.time,
          }
        : undefined,
    [detailRequest, selectedNode]
  );
  const detailLookups = useNodeDetailUrls(detailQueryInput, detailEndpoint);

  // Per-node Dashboard URL prefetch. Driven by the panel OPENING (selectedNodeId) — left
  // OR right click — NOT the right-click-only detailRequest above: the button appears in
  // both views. The param map is assembled from the selected node's data + its children
  // (compound merge); undefined for no selection / an ineligible compound, which idles
  // the hook. Shares the same resolved endpoint as the Change Report queries.
  // The dashboard's current time range rides the param map as from_time/to_time (Unix
  // seconds), so the time-windowed URL matches what the operator is viewing; the bounds
  // join the memo deps so a range change rebuilds the params (the hook then refetches).
  const dashboardParams = useMemo(
    () => assembleDashboardParams(elements, selectedNodeId, data.timeRange),
    [elements, selectedNodeId, data.timeRange]
  );
  const dashboardLookup = useNodeDashboardUrl(dashboardParams, detailEndpoint);

  // Export the LEFT-clicked, non-normal pod's name into the configured variable so a
  // sibling panel can query that one pod (cleared on deselect / normal / non-pod /
  // right-click). Left-click = the alerts-view selection (detailRequest === null);
  // a right-click drives the detail/Change Report flow, not this export.
  const selectedPodVariable = options.selectedPodVariable ?? defaultOptions.selectedPodVariable;
  useSelectedPodExport(selectedNode, detailRequest === null, selectedPodVariable, selectedPodVariable.trim() !== '');

  // Cluster swatches are derived from the backend's compound (cluster) container
  // nodes, so the legend colours always match the on-canvas backplates (single
  // source: data.clusterColor, assigned in normalize). Deduped by name so two
  // cluster nodes that share a display name yield one stable legend row/key.
  const clusterEntries = useMemo<ClusterLegendEntry[]>(() => {
    const byName = new Map<string, string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isCluster === true && typeof d.cluster === 'string' && typeof d.clusterColor === 'string') {
        // Map keys dedupe; the colour is deterministic per name, so set freely.
        byName.set(d.cluster, d.clusterColor);
      }
    }
    return [...byName].map(([name, color]) => ({ name, color }));
  }, [elements]);

  // Namespace swatches (CONTROLLER mode only) from the synthesized namespace boxes
  // (data.namespaceColor, assigned in applyNamespaceGrouping) so the legend matches the
  // on-canvas backplates. Deduped by name (same name → same hashed colour → one row);
  // SINGLE SOURCE with namespaceContainerIds below (both filter isNamespace === true).
  // Empty in node mode (no namespace boxes).
  const namespaceEntries = useMemo<NamespaceLegendEntry[]>(() => {
    const byName = new Map<string, string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isNamespace === true && typeof d.namespace === 'string' && typeof d.namespaceColor === 'string') {
        byName.set(d.namespace, d.namespaceColor);
      }
    }
    return [...byName].map(([name, color]) => ({ name, color }));
  }, [elements]);

  // All namespace box ids (every cluster's), for the namespace collapse-all group.
  // Same isNamespace filter as namespaceEntries (single source) — so the toggle and the
  // swatch section can never reference different sets (cf. clusterContainerIds).
  const namespaceContainerIds = useMemo<string[]>(() => {
    const ids: string[] = [];
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isNamespace === true && typeof d.id === 'string') {
        ids.push(d.id);
      }
    }
    return ids;
  }, [elements]);

  // Edge types present in the graph, ordered by the canonical edge-style map for
  // a stable legend. `elements` is already mode-transformed (applyPodParentMode),
  // so this is exactly the set of drawn edges currently on screen.
  const presentEdgeTypes = useMemo<EdgeType[]>(() => {
    const present = new Set<string>();
    for (const el of elements) {
      if (el.group !== 'edges') {
        continue;
      }
      const t = (el.data as cytoscape.EdgeDataDefinition).edgeType;
      if (typeof t === 'string') {
        present.add(t);
      }
    }
    return (Object.keys(EDGE_STYLE_BY_TYPE) as EdgeType[]).filter((t) => present.has(t));
  }, [elements]);

  // Default-aggregate: the first render where controllers are present while in
  // controller mode (initial load OR re-entry) collapses them all so pods start
  // aggregated. The ref prevents re-collapsing on a later data refresh (a
  // user-expanded controller stays open) and resets when leaving controller mode
  // so the next entry re-collapses. Reading `elements` here (a dep) is required to
  // catch the async first data load.
  const collapsedForEntryRef = useRef(false);
  useEffect(() => {
    if (podParentMode !== 'controller') {
      collapsedForEntryRef.current = false;
      return;
    }
    if (collapsedForEntryRef.current) {
      return;
    }
    const controllerIds = elements
      .filter((el) => el.group === 'nodes' && (el.data as cytoscape.NodeDataDefinition).isController === true)
      .map((el) => (el.data as cytoscape.NodeDataDefinition).id)
      .filter((id): id is string => typeof id === 'string');
    if (controllerIds.length === 0) {
      return;
    }
    collapsedForEntryRef.current = true;
    // Synchronous setState in an effect is intentional and one-shot here: the
    // collapsed-set is React-owned UI state seeded from the (async) graph data on
    // the first controller-mode entry, and the ref guard makes it fire at most
    // once per entry — no cascading-render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot, ref-guarded default-collapse seeded from async data
    setCollapsedIds((prev) => new Set([...prev, ...controllerIds]));
  }, [podParentMode, elements]);

  // Mode-aware compound containers (swatched by their cluster) for the "Nodes" /
  // "Controllers" section. In node mode these are the K8s `node` boxes; in controller
  // mode the synthesized controllers. Childless candidates are drawn leaves, not
  // containers. Whether a kind ALSO shows in the icon Node-kinds legend is decided by
  // deriveLegendEntries (below), not here.
  const {
    containerEntries,
    containerIds,
    title: containerTitle,
    collapseNoun,
  } = useMemo(
    () => deriveContainers(elements, themeColors(theme).border.weak, podParentMode),
    [elements, theme, podParentMode]
  );

  // StorageClass compound groups (cluster > storageclass > pvc). Mode-INDEPENDENT
  // (unlike the node/controller containers above): a StorageClass always boxes its
  // PVCs in both pod-parent modes, so it gets its own swatch section + collapse group.
  const { containerEntries: storageClassEntries, containerIds: storageClassIds } = useMemo(
    () => deriveStorageClassContainers(elements, themeColors(theme).border.weak),
    [elements, theme]
  );

  // Default-fold storage classes: a storageclass compound group starts collapsed on the
  // first load it appears. Mode-INDEPENDENT (unlike the controller default-collapse
  // above) since a storageclass boxes its PVCs in both pod-parent modes. Ref-guarded so
  // it fires once per mount — a user-expanded storageclass survives a later data refresh.
  const storageClassesFoldedRef = useRef(false);
  useEffect(() => {
    if (storageClassesFoldedRef.current || storageClassIds.length === 0) {
      return;
    }
    storageClassesFoldedRef.current = true;
    setCollapsedIds((prev) => new Set([...prev, ...storageClassIds]));
  }, [storageClassIds]);

  // The rows of the icon Node-kinds legend — collapse- + container-aware (drawn
  // leaves + collapsed containers; expanded containers and collapse-hidden
  // children drop out, so collapsing a storageclass swaps `pvc` → `storageclass`,
  // node⇄pod / controller⇄pod likewise), UNIONED with kinds the visibleKinds
  // filter currently hides so their eye-slash rows stay restorable (D11).
  const nodeLegendEntries = useMemo(
    () => deriveLegendEntries(elements, collapsedIds, visibleKinds),
    [elements, collapsedIds, visibleKinds]
  );

  // Legend eye toggle writes the panel option — the options editor multi-select
  // and the legend buttons are two faces of the same visibleKinds state, so they
  // stay in sync for free and the choice persists with the dashboard. Collapse
  // state (collapsedIds) is an independent layer and is deliberately untouched.
  const handleToggleKind = useCallback(
    (kind: string) => {
      if (!isFilterableKind(kind)) {
        return; // non-togglable rows render no button; guard the narrowing anyway
      }
      // Rebuilt in ALL_KINDS order so the persisted array stays canonical — a
      // hide/show round-trip must not reorder the dashboard JSON or the
      // options-editor pills.
      const hide = visibleKinds.includes(kind);
      const next = ALL_KINDS.filter((k) => (k === kind ? !hide : visibleKinds.includes(k)));
      onOptionsChange({ ...options, visibleKinds: next });
    },
    [visibleKinds, options, onOptionsChange]
  );

  // Cluster container ids = backend cluster containers (isCluster).
  const clusterContainerIds = useMemo<string[]>(() => {
    const ids: string[] = [];
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isCluster === true && typeof d.id === 'string') {
        ids.push(d.id);
      }
    }
    return ids;
  }, [elements]);

  // Container ids come from deriveContainers (single source for "which boxes are
  // collapsible" in the current mode), so the collapse toggle and the swatch
  // section can never reference different sets.
  const { allCollapsed: allClustersCollapsed, toggle: toggleClusters } = useCollapseGroup(
    clusterContainerIds,
    collapsedIds,
    setCollapsedIds
  );
  const { allCollapsed: allNodesCollapsed, toggle: toggleNodes } = useCollapseGroup(
    containerIds,
    collapsedIds,
    setCollapsedIds
  );
  const { allCollapsed: allStorageClassesCollapsed, toggle: toggleStorageClasses } = useCollapseGroup(
    storageClassIds,
    collapsedIds,
    setCollapsedIds
  );
  // Namespace collapse-all (controller mode). Namespace boxes are NOT default-collapsed
  // (no seeding effect), so allNamespacesCollapsed starts false.
  const { allCollapsed: allNamespacesCollapsed, toggle: toggleNamespaces } = useCollapseGroup(
    namespaceContainerIds,
    collapsedIds,
    setCollapsedIds
  );

  if (seriesError !== undefined) {
    return (
      <Alert severity="error" title="Graph data error">
        {seriesError}
      </Alert>
    );
  }
  // Full-screen overlay ONLY while there is nothing to show yet (first load).
  // During a routine refresh Grafana re-emits state=Loading with the previous
  // series attached — unmounting GraphCanvas then would destroy the cytoscape
  // instance (positions, zoom/pan, collapse geometry) on every tick and defeat
  // the diff-and-patch design; the canvas keeps rendering the previous data.
  if (isLoading && baseElements.length === 0) {
    return <LoadingOverlay />;
  }
  // A whole-payload failure (nothing parsed) is fatal; per the partial-parse
  // contract, anything less renders the surviving elements with a non-blocking
  // warning (below) instead of blanking the panel for one bad entry.
  if (isFatalNormalizeError) {
    return (
      <Alert severity="error" title="Graph data malformed">
        {normalizeError}
      </Alert>
    );
  }

  // Keyed off the computed visibility, not visibleKinds.length: hiding just the
  // kinds actually present (e.g. via the legend eye toggles) must surface the
  // filtered-out message even while absent kinds remain checked. The orphan
  // cascade can also empty the canvas through EDGE-type filtering alone (all
  // edges hidden → leaves orphan → containers empty out) with every kind still
  // on — blame node types only when every togglable legend row is hidden.
  const allTogglableKindsHidden =
    nodeLegendEntries.some((e) => e.togglable) && nodeLegendEntries.every((e) => !e.togglable || e.hidden);
  const emptyMessage =
    elements.length === 0
      ? 'No graph data'
      : visibleNodeIds.size === 0
        ? allTogglableKindsHidden
          ? 'All node types filtered'
          : 'All elements filtered out'
        : null;

  return (
    <div className={styles.root}>
      {options.showLegend && (
        <aside className={styles.legendArea}>
          <LayoutModeControl mode={podParentMode} onChange={setPodParentMode} />
          <NodeLegend entries={nodeLegendEntries} onToggleKind={handleToggleKind} />
          <EdgeLegend edgeTypes={presentEdgeTypes} />
          <StatusLegend />
          <ClusterLegend
            clusters={clusterEntries}
            onToggleCollapseAll={toggleClusters}
            allCollapsed={allClustersCollapsed}
          />
          {podParentMode === 'controller' && (
            <NamespaceLegend
              namespaces={namespaceEntries}
              onToggleCollapseAll={toggleNamespaces}
              allCollapsed={allNamespacesCollapsed}
            />
          )}
          <NodeContainerLegend
            nodes={containerEntries}
            onToggleCollapseAll={toggleNodes}
            allCollapsed={allNodesCollapsed}
            title={containerTitle}
            collapseNoun={collapseNoun}
          />
          <StorageClassLegend
            storageClasses={storageClassEntries}
            onToggleCollapseAll={toggleStorageClasses}
            allCollapsed={allStorageClassesCollapsed}
          />
        </aside>
      )}
      <div className={styles.canvasArea}>
        {normalizeError !== undefined && (
          <div className={styles.partialWarning}>
            <Alert severity="warning" title="Some graph entries were skipped">
              {normalizeError}
            </Alert>
          </div>
        )}
        {emptyMessage !== null && (
          <div className={styles.emptyOverlay}>
            <EmptyState message={emptyMessage} />
          </div>
        )}
        <GraphCanvas
          elements={elements}
          stylesheet={stylesheet}
          layout={options.layout}
          visibility={visibility}
          onSelect={handleSelect}
          onContextSelect={handleContextSelect}
          selectedId={selectedNodeId}
          collapsedIds={collapsedIds}
          onCollapsedChange={setCollapsedIds}
          podParentMode={podParentMode}
        />
        <NodeDetailPanel
          node={selectedNode}
          onClose={() => handleSelect(null)}
          onAlertTimeClick={handleAlertTimeClick}
          timeZone={timeZone}
          lookups={detailLookups}
          dashboard={dashboardLookup}
          view={detailRequest !== null ? 'detail' : 'alerts'}
        />
      </div>
    </div>
  );
}
