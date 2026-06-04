import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import type cytoscape from 'cytoscape';
import React, { useEffect, useMemo, useRef } from 'react';

import { useElementFilter } from '../../../element-filter';
import { HoverTooltip } from '../../../hover-tooltip';
import { buildSwitchConstraints, computeSwitchTiers } from '../../../switch-topology';
import { useCytoscape } from '../../hooks/useCytoscape';
import { useExpandCollapse } from '../../hooks/useExpandCollapse';
import { useGraphLayout } from '../../hooks/useGraphLayout';
import { useGraphResize } from '../../hooks/useGraphResize';
import { useLayoutRunToken } from '../../hooks/useLayoutRunToken';

import type { GraphCanvasProps } from './GraphCanvas.types';
import { selectSingle } from './selectSingle';

function getStyles(): { root: string; canvas: string } {
  return {
    root: css({
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }),
    canvas: css({
      position: 'absolute',
      inset: 0,
    }),
  };
}

function noop(): void {
  // No-op collapsed-change sink for the backward-compatible (no-collapse) path.
}

export function GraphCanvas(props: Readonly<GraphCanvasProps>): React.JSX.Element {
  const {
    elements,
    stylesheet,
    layout,
    visibleKinds,
    visibleEdgeTypes,
    onSelect,
    selectedId,
    collapsedIds,
    onCollapsedChange,
    podParentMode,
  } = props;
  const styles = useStyles2(getStyles);

  // GraphCanvas owns the expand-collapse refs so useExpandCollapse (writer) and
  // useCytoscape's diff-patch (reader) share one api/guard/desired-set.
  const apiRef = useRef<cytoscape.ExpandCollapseApi | null>(null);
  const suppressRef = useRef(false);
  const collapsedIdsRef = useRef<ReadonlySet<string>>(collapsedIds ?? new Set());
  useEffect(() => {
    collapsedIdsRef.current = collapsedIds ?? new Set();
  }, [collapsedIds]);

  // runToken bumps only when a layout-affecting input changes content — the
  // collapsed-id set or the pod-parent mode (which re-parents pods + swaps
  // edges) — so layout reruns once per real structural change, not per render.
  const runToken = useLayoutRunToken({ collapsedIds, podParentMode });

  // Derive switch-fabric tier constraints from the current graph. Applied by
  // useGraphLayout only when the active layout is fcose; null (no-op) when there
  // are no switches. useGraphLayout reads the latest value at layout-run time, so
  // a refresh-driven identity change here does not by itself rerun the layout.
  const switchConstraints = useMemo(() => buildSwitchConstraints(computeSwitchTiers(elements)), [elements]);

  const collapseEnabled = onCollapsedChange !== undefined;

  const { containerRef, cyRef, isReady } = useCytoscape({
    elements,
    stylesheet,
    podParentMode,
    ...(collapseEnabled ? { apiRef, collapsedIdsRef, suppressRef, onCollapsedChange, collapseKey: runToken } : {}),
  });

  useGraphLayout({ cyRef, name: layout, runToken, switchConstraints });
  useGraphResize({ cyRef, containerRef });
  useElementFilter({ cyRef, elements, visibleKinds, visibleEdgeTypes });
  useExpandCollapse({
    cyRef,
    // Gate: only init the extension when collapse is wired. On the no-collapse
    // path this stays false so the effect early-returns and never calls the
    // (potentially unregistered) cy.expandCollapse.
    enabled: collapseEnabled,
    isReady,
    apiRef,
    collapsedIdsRef,
    suppressRef,
    onCollapsedChange: onCollapsedChange ?? noop,
  });

  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null || onSelect === undefined) {
      return;
    }
    const handleTap = (evt: cytoscape.EventObject): void => {
      if (evt.target === cy) {
        onSelect(null);
        return;
      }
      const single = evt.target as cytoscape.NodeSingular;
      if (single.isNode()) {
        onSelect(single.id());
        return;
      }
      // Edge taps act as deselect to keep the callback contract consistent
      // with background taps; consumers receive null when no node is active.
      onSelect(null);
    };
    cy.on('tap', handleTap);
    return (): void => {
      cy.off('tap', handleTap);
    };
    // isReady gates binding until the instance exists (see useCytoscape).
  }, [cyRef, onSelect, isReady]);

  // Controlled selection sync: mirror selectedId into cytoscape's single
  // selection so the blue highlight tracks the detail panel (tap / X / background).
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    selectSingle(cy, selectedId ?? null);
    // isReady re-runs this once the instance exists (cyRef is a stable ref).
  }, [cyRef, selectedId, isReady]);

  return (
    <div className={styles.root} data-testid="graph-canvas-root">
      <div ref={containerRef} className={styles.canvas} data-testid="graph-canvas" />
      <HoverTooltip cyRef={cyRef} ready={isReady} />
    </div>
  );
}
