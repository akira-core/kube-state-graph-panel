import { css } from '@emotion/css';
import { LoadingState, type GrafanaTheme2, type PanelProps } from '@grafana/data';
import { Alert, useStyles2, useTheme2 } from '@grafana/ui';
import type cytoscape from 'cytoscape';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { computeVisibility } from '../../features/element-filter';
import { EmptyState, GraphCanvas, LoadingOverlay } from '../../features/graph-canvas';
import { useGraphData } from '../../features/graph-data';
import {
  ClusterLegend,
  EdgeLegend,
  LayoutModeControl,
  NodeContainerLegend,
  NodeLegend,
  StatusLegend,
  StorageClassLegend,
  type ClusterLegendEntry,
} from '../../features/legend';
import { NodeDetailPanel, type NodeDetailData } from '../../features/node-detail';
import { applyPodParentMode } from '../../features/pod-parent-mode';
import { useGraphTheme } from '../../features/theme';
import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import type { EdgeType, PodParentMode } from '../../shared/constants/types';
import { themeColors } from '../../shared/theme/themeColors';

import { deriveLegendKinds } from './deriveLegendKinds';
import { deriveContainers } from './deriveNodeContainers';
import { deriveStorageClassContainers } from './deriveStorageClassContainers';
import { defaultOptions, type KsgPanelOptions } from './KsgPanel.types';
import { useCollapseGroup } from './useCollapseGroup';

export type KsgPanelProps = PanelProps<KsgPanelOptions>;

// Clicking an alert's time rewinds the dashboard to a fixed ±5-minute window
// centred on that alert (alert time is Unix seconds; AbsoluteTimeRange is ms).
const ALERT_REWIND_HALF_WINDOW_SEC = 300;

function getStyles(theme: GrafanaTheme2): { root: string; canvasArea: string; legendArea: string } {
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
    // Legend sits to the LEFT of the canvas (rendered before it in the DOM).
    // A hairline divider separates each stacked section (Node kinds / Edge
    // types / Clusters): a top border on every section after the first.
    legendArea: css({
      width: 200,
      flexShrink: 0,
      padding: '0 8px',
      overflowY: 'auto',
      borderRight: `1px solid ${borderWeak}`,
      '& > div + div': {
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${borderWeak}`,
      },
    }),
  };
}

// Pure resolution of the selected node's detail data from the element list.
// Module-level so the panel can call it inline (React Compiler memoizes).
// Exported for unit testing. A node that is not in `visibleNodeIds` (hidden by
// kind/edge filtering or orphan cascade) resolves to null so the detail panel
// never describes a node that is not on the canvas.
export function resolveSelectedNode(
  elements: cytoscape.ElementDefinition[],
  selectedNodeId: string | null,
  visibleNodeIds: ReadonlySet<string>
): NodeDetailData | null {
  if (selectedNodeId === null || !visibleNodeIds.has(selectedNodeId)) {
    return null;
  }
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.id === selectedNodeId && d.isCluster !== true && d.isStorageClass !== true) {
      return {
        id: selectedNodeId,
        label: typeof d.label === 'string' ? d.label : selectedNodeId,
        ...(d.kind !== undefined ? { kind: d.kind } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.alerts !== undefined ? { alerts: d.alerts } : {}),
      };
    }
  }
  return null;
}

export function KsgPanel(props: Readonly<KsgPanelProps>): React.JSX.Element {
  const { options, data, onChangeTimeRange, timeZone } = props;
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const stylesheet = useGraphTheme();

  // Backwards-compatible options read — older dashboards may lack new fields
  const visibleKinds = options.visibleKinds ?? defaultOptions.visibleKinds;
  const visibleEdgeTypes = options.visibleEdgeTypes ?? defaultOptions.visibleEdgeTypes;

  const isLoading = data.state === LoadingState.Loading;
  const seriesError = data.errors?.[0]?.message;
  const { elements: baseElements, error: normalizeError } = useGraphData(data);

  // Pod-parent view mode — local state, toggled from the legend (Grafana panel
  // options are read-only at runtime, so this cannot be an option). 'controller'
  // re-parents pods under their owning controller and swaps the pod↔node /
  // pod↔controller relationships between nesting and drawn edge. Default
  // 'controller' aggregates pods under their owning controller; 'node' is the
  // infrastructure view (clean cluster > node > pod backend topology).
  const [podParentMode, setPodParentMode] = useState<PodParentMode>('controller');
  const elements = useMemo(() => applyPodParentMode(baseElements, podParentMode), [baseElements, podParentMode]);

  // Selected node id drives both the detail panel and (controlled) the cy
  // selection highlight. GraphCanvas reports taps via onSelect.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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

  // Same visibility set the canvas applies (kind/edge filter + orphan cascade),
  // computed from the mode-transformed elements. Used to keep the detail panel in
  // step with the canvas: a selected node that gets hidden closes the panel.
  const { visibleNodeIds } = useMemo(
    () => computeVisibility(elements, visibleKinds, visibleEdgeTypes),
    [elements, visibleKinds, visibleEdgeTypes]
  );

  // Resolve the selected node's display data from elements via a pure helper, so
  // the React Compiler memoizes it (a manual useMemo with a loop + early returns
  // trips react-hooks/preserve-manual-memoization). Cluster containers and hidden
  // nodes are excluded; a missing id (data refresh removed it) closes the panel.
  const selectedNode = resolveSelectedNode(elements, selectedNodeId, visibleNodeIds);

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

  // Collapsed parent-container ids. Lives here so the legend toggles (siblings of
  // GraphCanvas) and the canvas share one source. GraphCanvas reports the full
  // next Set via onCollapsedChange (cue events / data-refresh prune).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

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
  // deriveLegendKinds (below), not here.
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

  // The kinds shown in the icon Node-kinds legend — collapse- + container-aware, so
  // the legend lists exactly what renders as a glyph: drawn leaves + collapsed
  // containers; expanded containers (Nodes / Controllers / Storage classes) and
  // collapse-hidden children drop out. This is why collapsing a storageclass swaps
  // `pvc` → `storageclass` (and node⇄pod, controller⇄pod likewise).
  const nodeLegendKinds = useMemo(() => deriveLegendKinds(elements, collapsedIds), [elements, collapsedIds]);

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

  if (seriesError !== undefined) {
    return (
      <Alert severity="error" title="Graph data error">
        {seriesError}
      </Alert>
    );
  }
  if (isLoading) {
    return <LoadingOverlay />;
  }
  if (normalizeError !== undefined) {
    return (
      <Alert severity="error" title="Graph data malformed">
        {normalizeError}
      </Alert>
    );
  }

  const emptyMessage =
    elements.length === 0 ? 'No graph data' : visibleKinds.length === 0 ? 'All node types filtered' : null;

  return (
    <div className={styles.root}>
      {options.showLegend && (
        <aside className={styles.legendArea}>
          <LayoutModeControl mode={podParentMode} onChange={setPodParentMode} />
          <ClusterLegend
            clusters={clusterEntries}
            onToggleCollapseAll={toggleClusters}
            allCollapsed={allClustersCollapsed}
          />
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
          <NodeLegend kinds={nodeLegendKinds} />
          <EdgeLegend edgeTypes={presentEdgeTypes} />
          <StatusLegend />
        </aside>
      )}
      <div className={styles.canvasArea}>
        {emptyMessage !== null ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <>
            <GraphCanvas
              elements={elements}
              stylesheet={stylesheet}
              layout={options.layout}
              visibleKinds={visibleKinds}
              visibleEdgeTypes={visibleEdgeTypes}
              onSelect={setSelectedNodeId}
              selectedId={selectedNodeId}
              collapsedIds={collapsedIds}
              onCollapsedChange={setCollapsedIds}
              podParentMode={podParentMode}
            />
            <NodeDetailPanel
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
              onAlertTimeClick={handleAlertTimeClick}
              timeZone={timeZone}
            />
          </>
        )}
      </div>
    </div>
  );
}
