import { css } from '@emotion/css';
import { LoadingState, type GrafanaTheme2, type PanelProps } from '@grafana/data';
import { Alert, useStyles2 } from '@grafana/ui';
import type cytoscape from 'cytoscape';
import React, { useCallback, useMemo, useState } from 'react';

import { EmptyState, GraphCanvas, LoadingOverlay } from '../../features/graph-canvas';
import { useGraphData } from '../../features/graph-data';
import { ClusterLegend, EdgeLegend, NodeLegend, StatusLegend, type ClusterLegendEntry } from '../../features/legend';
import { NodeDetailPanel, type NodeDetailData } from '../../features/node-detail';
import { useGraphTheme } from '../../features/theme';

import { defaultOptions, type KsgPanelOptions } from './KsgPanel.types';

export type KsgPanelProps = PanelProps<KsgPanelOptions>;

function getStyles(theme: GrafanaTheme2): { root: string; canvasArea: string; legendArea: string } {
  const borderWeak = (theme.colors as unknown as { border: { weak: string } }).border.weak;
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
function resolveSelectedNode(
  elements: cytoscape.ElementDefinition[],
  selectedNodeId: string | null
): NodeDetailData | null {
  if (selectedNodeId === null) {
    return null;
  }
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.id === selectedNodeId && d.isCluster !== true) {
      return {
        id: selectedNodeId,
        label: typeof d.label === 'string' ? d.label : selectedNodeId,
        ...(d.kind !== undefined ? { kind: d.kind } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
      };
    }
  }
  return null;
}

export function KsgPanel(props: Readonly<KsgPanelProps>): React.JSX.Element {
  const { options, data } = props;
  const styles = useStyles2(getStyles);
  const stylesheet = useGraphTheme();

  // Backwards-compatible options read — older dashboards may lack new fields
  const visibleKinds = options.visibleKinds ?? defaultOptions.visibleKinds;
  const visibleEdgeTypes = options.visibleEdgeTypes ?? defaultOptions.visibleEdgeTypes;

  const isLoading = data.state === LoadingState.Loading;
  const seriesError = data.errors?.[0]?.message;
  const { elements, error: normalizeError } = useGraphData(data);

  // Selected node id drives both the detail panel and (controlled) the cy
  // selection highlight. GraphCanvas reports taps via onSelect.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Resolve the selected node's display data from elements via a pure helper, so
  // the React Compiler memoizes it (a manual useMemo with a loop + early returns
  // trips react-hooks/preserve-manual-memoization). Cluster containers are
  // excluded; a missing id (data refresh removed it) closes the panel.
  const selectedNode = resolveSelectedNode(elements, selectedNodeId);

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

  // Collapsed parent-container ids. Lives here so the legend toggles (siblings of
  // GraphCanvas) and the canvas share one source. GraphCanvas reports the full
  // next Set via onCollapsedChange (cue events / data-refresh prune).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

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

  // K8s node container ids = node-kind nodes that are a parent of some node.
  const k8sNodeContainerIds = useMemo<string[]>(() => {
    const parentIds = new Set<string>();
    for (const el of elements) {
      if (el.group === 'nodes') {
        const p = (el.data as cytoscape.NodeDataDefinition).parent;
        if (typeof p === 'string') {
          parentIds.add(p);
        }
      }
    }
    const ids: string[] = [];
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.kind === 'node' && typeof d.id === 'string' && parentIds.has(d.id)) {
        ids.push(d.id);
      }
    }
    return ids;
  }, [elements]);

  const allClustersCollapsed =
    clusterContainerIds.length > 0 && clusterContainerIds.every((id) => collapsedIds.has(id));
  const allNodesCollapsed = k8sNodeContainerIds.length > 0 && k8sNodeContainerIds.every((id) => collapsedIds.has(id));

  const toggleClusters = useCallback(() => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      const collapseThem = !clusterContainerIds.every((id) => prev.has(id));
      for (const id of clusterContainerIds) {
        if (collapseThem) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, [clusterContainerIds]);

  const toggleNodes = useCallback(() => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      const collapseThem = !k8sNodeContainerIds.every((id) => prev.has(id));
      for (const id of k8sNodeContainerIds) {
        if (collapseThem) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, [k8sNodeContainerIds]);

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
          <ClusterLegend
            clusters={clusterEntries}
            onToggleCollapseAll={toggleClusters}
            allCollapsed={allClustersCollapsed}
          />
          <NodeLegend
            onToggleCollapseAll={toggleNodes}
            allCollapsed={allNodesCollapsed}
            showCollapseToggle={k8sNodeContainerIds.length > 0}
          />
          <EdgeLegend />
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
            />
            <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
          </>
        )}
      </div>
    </div>
  );
}
