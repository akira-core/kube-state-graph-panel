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

// Alert-time click rewinds to a ±5min window. Alert time is Unix seconds; AbsoluteTimeRange is ms.
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
    // EmptyState floats ABOVE the canvas, never replaces it: the cy instance must
    // survive a transient all-kinds-filtered state — panel-rendering spec.
    emptyOverlay: css({
      position: 'absolute',
      inset: 0,
      zIndex: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }),
    // Non-blocking partial-parse warning — graph-data-integration spec.
    partialWarning: css({
      position: 'absolute',
      top: 8,
      left: 8,
      right: 8,
      zIndex: 3,
      pointerEvents: 'none',
    }),
    // Legend sits LEFT of the canvas. A top border on every section after the first
    // gives the hairline dividers between stacked sections.
    legendArea: css({
      width: 200,
      flexShrink: 0,
      padding: '0 8px',
      overflowY: 'auto',
      borderRight: `1px solid ${borderWeak}`,
      // Shrink headings h4 → h5 so long titles fit on one line in the 200px rail.
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

// True when any ancestor (via data.parent) of `id` is collapsed — such a node is
// folded off the canvas even though it stays in `elements`.
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

// Resolves the selected node's detail data (exported for unit testing). A node
// not in `visibleNodeIds` or folded inside a collapsed container resolves to null
// so the panel never describes an off-canvas node (a collapsed container itself
// stays on canvas as a box, so it resolves).
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
      // Controller identity the detail-URL queries fire for (D4): pod → its owner
      // (kind lowercased per synthesized-controller convention), controller → itself,
      // owner-less standalone pod → its own kind/name.
      let queryTarget: { kind: string; name: string } | undefined;
      if (d.kind !== undefined && DETAIL_URL_KINDS.has(d.kind)) {
        if (d.kind === 'pod') {
          // Owner kind must be in the detail-URL contract too; otherwise (static
          // pod's Node, operator CRD like Rollout) fall back to standalone-pod identity.
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

  // Back-compat read — older dashboards may lack new fields.
  const visibleKinds = options.visibleKinds ?? defaultOptions.visibleKinds;
  const visibleEdgeTypes = options.visibleEdgeTypes ?? defaultOptions.visibleEdgeTypes;

  const isLoading = data.state === LoadingState.Loading;
  // DataQueryError.message is optional — fall back through statusText/status; treat
  // state===Error with no errors[] as a failure too, so a message-less error never
  // renders as an empty-but-successful graph.
  const firstQueryError = data.errors?.[0] ?? (data.state === LoadingState.Error ? {} : undefined);
  const seriesError =
    firstQueryError !== undefined
      ? (firstQueryError.message ??
        firstQueryError.statusText ??
        `Query failed (status ${String(firstQueryError.status ?? 'unknown')})`)
      : undefined;
  const { elements: baseElements, error: normalizeError, hasPayload } = useGraphData(data);

  // Whole-payload normalize failure (nothing parsed) — shared by the variable-export
  // gate and the fatal early return so the two can't drift.
  const isFatalNormalizeError = normalizeError !== undefined && baseElements.length === 0;

  // Export every pod name into the dashboard variable. Reads baseElements (pre-view-
  // transform data-layer truth). Gated off in every non-successful load state (no
  // payload — also first load, query error, fatal normalize) so it can't write "no
  // pods"; only a loaded graph with zero pods clears the variable — pod-list-variable-export spec.
  const podListVariable = options.podListVariable ?? defaultOptions.podListVariable;
  const variableExportEnabled = hasPayload && seriesError === undefined && !isFatalNormalizeError;
  useVariableExport(baseElements, podListVariable, variableExportEnabled);

  // Pod-parent view mode — ephemeral per-session view state, NOT persisted (unlike
  // visibleKinds toggles): a mode flip is a transient view, not a dashboard-authoring
  // decision. 'controller' aggregates pods under their owning controller (default);
  // 'node' is the infrastructure view (cluster > node > pod).
  const [podParentMode, setPodParentMode] = useState<PodParentMode>('controller');
  // View-transform pipeline (pure, mode-threaded): applyPodParentMode reshapes pod
  // nesting; applyNamespaceGrouping inserts namespace compounds in CONTROLLER mode
  // (no-op in node mode — namespace-grouping spec); wrapSwitchFabric synthesizes the
  // virtual `network > switch` compound for parent-less switches (switch-tier-layout).
  const elements = useMemo(
    () => wrapSwitchFabric(applyNamespaceGrouping(applyPodParentMode(baseElements, podParentMode), podParentMode)),
    [baseElements, podParentMode]
  );

  // Selected node id drives the detail panel and the (controlled) cy selection
  // highlight. GraphCanvas reports taps via onSelect.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Right-click intent: which node the detail-URL queries were requested for, and when
  // (Unix seconds, captured once at click so re-renders never refetch). Only an explicit
  // right-click queries (D1); left-click / background tap / close clear it.
  const [detailRequest, setDetailRequest] = useState<{ nodeId: string; time: number } | null>(null);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setDetailRequest(null);
  }, []);

  const handleContextSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
    setDetailRequest({ nodeId: id, time: Math.floor(Date.now() / 1000) });
  }, []);

  // Rewind to a ±5m window around the clicked alert (seconds → ms for AbsoluteTimeRange).
  const handleAlertTimeClick = useCallback(
    (timeSec: number) => {
      onChangeTimeRange({
        from: (timeSec - ALERT_REWIND_HALF_WINDOW_SEC) * 1000,
        to: (timeSec + ALERT_REWIND_HALF_WINDOW_SEC) * 1000,
      });
    },
    [onChangeTimeRange]
  );

  // Collapsed parent-container ids. Lives here so legend toggles and the canvas share
  // one source; GraphCanvas reports the next Set via onCollapsedChange.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // The ONE visibility computation (kind/edge filter + orphan cascade). Both GraphCanvas
  // (useElementFilter) and the detail-panel gate below consume it — computed once to keep
  // them in lockstep and halve the most expensive pure pass.
  const visibility = useMemo(
    () => computeVisibility(elements, visibleKinds, visibleEdgeTypes),
    [elements, visibleKinds, visibleEdgeTypes]
  );
  const { visibleNodeIds } = visibility;

  // Resolve the selected node's display data; a missing id (data refresh) closes the panel.
  const selectedNode = useMemo(
    () => resolveSelectedNode(elements, selectedNodeId, visibleNodeIds, collapsedIds),
    [elements, selectedNodeId, visibleNodeIds, collapsedIds]
  );

  // detailQueryInput is defined ONLY when the selection is a right-click on that same
  // node resolving an application + query target. Endpoint: explicit option wins, else
  // the dashboard query's datasource proxy path; '' idles the hook (D7).
  const detailEndpointOption = options.detailEndpoint ?? defaultOptions.detailEndpoint;
  const detailEndpoint = useMemo(
    () => resolveDetailEndpoint({ option: detailEndpointOption, request: data.request }),
    [detailEndpointOption, data.request]
  );
  // Memoized for stable identity: useNodeDetailUrls eager-prefetches in an effect keyed
  // by this input, so an unstable object would re-fire and re-abort every render (D7).
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

  // Per-node Dashboard URL prefetch. Driven by the panel OPENING (selectedNodeId, left OR
  // right click) — the button appears in both views — not the right-click-only
  // detailRequest. Params = selected node + children (compound merge); undefined idles the
  // hook. The dashboard time range rides as from_time/to_time (Unix seconds) and is a memo
  // dep, so a range change rebuilds params and the hook refetches.
  const dashboardParams = useMemo(
    () => assembleDashboardParams(elements, selectedNodeId, data.timeRange),
    [elements, selectedNodeId, data.timeRange]
  );
  const dashboardLookup = useNodeDashboardUrl(dashboardParams, detailEndpoint);

  // Export the LEFT-clicked, non-normal pod's name into the configured variable for a
  // sibling panel (cleared on deselect / normal / non-pod / right-click). Left-click is
  // the alerts-view selection (detailRequest === null); right-click drives the detail flow.
  const selectedPodVariable = options.selectedPodVariable ?? defaultOptions.selectedPodVariable;
  useSelectedPodExport(selectedNode, detailRequest === null, selectedPodVariable, selectedPodVariable.trim() !== '');

  // Cluster swatches from the backend cluster containers (single source: data.clusterColor
  // assigned in normalize) so legend colours match the on-canvas backplates. Deduped by name.
  const clusterEntries = useMemo<ClusterLegendEntry[]>(() => {
    const byName = new Map<string, string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isCluster === true && typeof d.cluster === 'string' && typeof d.clusterColor === 'string') {
        // Colour is deterministic per name, so the dedupe set is safe.
        byName.set(d.cluster, d.clusterColor);
      }
    }
    return [...byName].map(([name, color]) => ({ name, color }));
  }, [elements]);

  // Namespace swatches (CONTROLLER mode only) from synthesized namespace boxes
  // (data.namespaceColor from applyNamespaceGrouping). Deduped by name; SINGLE SOURCE
  // with namespaceContainerIds below (both filter isNamespace === true).
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

  // Namespace box ids for the collapse-all group. Same isNamespace filter as
  // namespaceEntries (single source) so toggle and swatch section can't diverge.
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

  // Edge types present, ordered by the canonical edge-style map for a stable legend.
  // `elements` is mode-transformed, so this is exactly the drawn edges on screen.
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

  // Default-aggregate: the first render with controllers present in controller mode
  // (load or re-entry) collapses them all. The ref blocks re-collapsing on later data
  // refresh (user-expanded controller stays open) and resets on leaving the mode.
  // `elements` is a dep to catch the async first data load.
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
    // Intentional one-shot setState: collapsed-set seeded from async graph data on first
    // controller-mode entry; ref guard makes it fire at most once per entry (no loop).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot, ref-guarded default-collapse seeded from async data
    setCollapsedIds((prev) => new Set([...prev, ...controllerIds]));
  }, [podParentMode, elements]);

  // Mode-aware compound containers for the "Nodes" / "Controllers" section: K8s `node`
  // boxes in node mode, synthesized controllers in controller mode. Childless candidates
  // are drawn leaves, not containers.
  const {
    containerEntries,
    containerIds,
    title: containerTitle,
    collapseNoun,
  } = useMemo(
    () => deriveContainers(elements, themeColors(theme).border.weak, podParentMode),
    [elements, theme, podParentMode]
  );

  // StorageClass compound groups (cluster > storageclass > pvc). Mode-INDEPENDENT: a
  // StorageClass boxes its PVCs in both modes, so it gets its own swatch + collapse group.
  const { containerEntries: storageClassEntries, containerIds: storageClassIds } = useMemo(
    () => deriveStorageClassContainers(elements, themeColors(theme).border.weak),
    [elements, theme]
  );

  // Default-fold storage classes on first load. Mode-INDEPENDENT; ref-guarded to fire once
  // per mount so a user-expanded storageclass survives a later data refresh.
  const storageClassesFoldedRef = useRef(false);
  useEffect(() => {
    if (storageClassesFoldedRef.current || storageClassIds.length === 0) {
      return;
    }
    storageClassesFoldedRef.current = true;
    setCollapsedIds((prev) => new Set([...prev, ...storageClassIds]));
  }, [storageClassIds]);

  // Icon Node-kinds legend rows — collapse-/container-aware (collapsing a storageclass
  // swaps pvc → storageclass; node⇄pod / controller⇄pod likewise), UNIONED with kinds
  // visibleKinds currently hides so their eye-slash rows stay restorable (D11).
  const nodeLegendEntries = useMemo(
    () => deriveLegendEntries(elements, collapsedIds, visibleKinds),
    [elements, collapsedIds, visibleKinds]
  );

  // Legend eye toggle writes the panel option: the options-editor multi-select and the
  // legend buttons are two faces of the same visibleKinds state. Collapse state is
  // independent and untouched.
  const handleToggleKind = useCallback(
    (kind: string) => {
      if (!isFilterableKind(kind)) {
        return; // non-togglable rows render no button; guard the narrowing anyway
      }
      // Rebuilt in ALL_KINDS order so a hide/show round-trip keeps the persisted array
      // canonical (no reorder of dashboard JSON or options-editor pills).
      const hide = visibleKinds.includes(kind);
      const next = ALL_KINDS.filter((k) => (k === kind ? !hide : visibleKinds.includes(k)));
      onOptionsChange({ ...options, visibleKinds: next });
    },
    [visibleKinds, options, onOptionsChange]
  );

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

  // containerIds come from deriveContainers (single source for collapsible boxes in the
  // current mode), so toggle and swatch section can't reference different sets.
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
  // Namespace collapse-all (controller mode). Namespace boxes are NOT default-collapsed,
  // so allNamespacesCollapsed starts false.
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
  // Overlay ONLY on first load (nothing yet). On routine refresh Grafana re-emits
  // state=Loading with the previous series — unmounting GraphCanvas would destroy the cy
  // instance every tick and defeat diff-and-patch; the canvas keeps the previous data.
  if (isLoading && baseElements.length === 0) {
    return <LoadingOverlay />;
  }
  // Whole-payload failure is fatal; anything less renders survivors with a non-blocking
  // warning (partial-parse contract) instead of blanking the panel for one bad entry.
  if (isFatalNormalizeError) {
    return (
      <Alert severity="error" title="Graph data malformed">
        {normalizeError}
      </Alert>
    );
  }

  // Keyed off computed visibility, not visibleKinds.length: hiding only the kinds present
  // must still surface the message, and the orphan cascade can empty the canvas via
  // EDGE-type filtering alone — so blame node types only when every togglable row is hidden.
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
