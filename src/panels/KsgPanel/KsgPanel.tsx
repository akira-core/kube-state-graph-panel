import { css } from '@emotion/css';
import { LoadingState, type PanelProps } from '@grafana/data';
import { Alert, useStyles2 } from '@grafana/ui';
import React from 'react';

import {
  EmptyState,
  GraphCanvas,
  LoadingOverlay,
} from '../../features/graph-canvas';
import { useGraphData } from '../../features/graph-data';
import { EdgeLegend, NodeLegend } from '../../features/legend';
import { useGraphTheme } from '../../features/theme';

import { defaultOptions, type KsgPanelOptions } from './KsgPanel.types';

export type KsgPanelProps = PanelProps<KsgPanelOptions>;

function getStyles(): { root: string; canvasArea: string; legendArea: string } {
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
    legendArea: css({
      width: 200,
      flexShrink: 0,
      padding: '0 8px',
      overflowY: 'auto',
    }),
  };
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

  if (seriesError !== undefined) {
    return <Alert severity="error" title="Graph data error">{seriesError}</Alert>;
  }
  if (isLoading) {
    return <LoadingOverlay />;
  }
  if (normalizeError !== undefined) {
    return <Alert severity="error" title="Graph data malformed">{normalizeError}</Alert>;
  }

  const emptyMessage = elements.length === 0
    ? 'No graph data'
    : visibleKinds.length === 0
      ? 'All node types filtered'
      : null;

  return (
    <div className={styles.root}>
      <div className={styles.canvasArea}>
        {emptyMessage !== null ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <GraphCanvas
            elements={elements}
            stylesheet={stylesheet}
            layout={options.layout}
            visibleKinds={visibleKinds}
            visibleEdgeTypes={visibleEdgeTypes}
          />
        )}
      </div>
      {options.showLegend && (
        <aside className={styles.legendArea}>
          <NodeLegend />
          <EdgeLegend />
        </aside>
      )}
    </div>
  );
}
