import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import type cytoscape from 'cytoscape';
import React, { useEffect, useMemo, useRef } from 'react';

import { useElementFilter } from '../../../element-filter';
import { HoverTooltip } from '../../../hover-tooltip';
import { buildSwitchConstraints, readNodeFabricTier, readSwitchLevels } from '../../../switch-topology';
import { useCytoscape } from '../../hooks/useCytoscape';
import { useExpandCollapse } from '../../hooks/useExpandCollapse';
import { useGraphLayout } from '../../hooks/useGraphLayout';
import { useGraphResize } from '../../hooks/useGraphResize';
import { useLayoutRunToken } from '../../hooks/useLayoutRunToken';
import { useSelectionFocus } from '../../hooks/useSelectionFocus';

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

  // contentToken bumps only when a layout-affecting input changes content (the
  // collapsed-id set or pod-parent mode); layoutToken bumps on that OR an imperative
  // requestRelayout(). requestRelayout covers the two cases content changes do NOT —
  // both of which would otherwise leave collapsed parents stacked at the origin:
  //   1. the mount-time default-collapse (controller / storageclass folding), which
  //      useExpandCollapse applies AFTER useGraphLayout's pass; and
  //   2. a refresh that adds a wholly-new compound family with no anchor to seed to.
  // Calling it bumps layoutToken so useGraphLayout (the single cy.layout() source,
  // rule 2) reruns ON the collapsed/patched graph (idempotent: an extra bump — e.g.
  // StrictMode double-mount — only causes one more convergent pass, never stacking).
  const { contentToken, layoutToken, requestRelayout } = useLayoutRunToken({ collapsedIds, podParentMode });

  // Derive switch-fabric tier constraints from the current graph. Applied by
  // useGraphLayout only when the active layout is fcose; null (no-op) when there
  // are no switches. useGraphLayout reads the latest value at layout-run time, so
  // a refresh-driven identity change here does not by itself rerun the layout.
  const switchConstraints = useMemo(
    () => buildSwitchConstraints(readNodeFabricTier(elements, podParentMode ?? 'node', readSwitchLevels(elements))),
    [elements, podParentMode]
  );

  const collapseEnabled = onCollapsedChange !== undefined;

  const { containerRef, cyRef, isReady } = useCytoscape({
    elements,
    stylesheet,
    podParentMode,
    // collapseKey is contentToken (collapsed-set CONTENT), NOT layoutToken: it gates
    // the diff-patch/re-collapse cycle, which must not re-run on a bare relayout
    // request. onStructuralRelayout relayouts once when a new unanchorable family is
    // added on refresh (anchored pod-under-existing-parent adds skip it → D7 kept).
    ...(collapseEnabled
      ? { apiRef, collapsedIdsRef, suppressRef, onCollapsedChange, collapseKey: contentToken, onStructuralRelayout: requestRelayout }
      : {}),
  });

  useGraphLayout({ cyRef, name: layout, runToken: layoutToken, switchConstraints });
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
    // Relayout once after the mount-time default-collapse lands (no-op on the
    // no-collapse path, where the init block early-returns and never collapses).
    onMountCollapseApplied: requestRelayout,
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

  // Dim everything outside the selected node's focus set so the selection reads
  // clearly (colour alone is too subtle on a dense graph). Re-applies after a
  // rebuild (mode/data change) since that drops the imperative classes.
  useSelectionFocus({ cyRef, selectedId: selectedId ?? null, isReady, elements });

  return (
    <div className={styles.root} data-testid="graph-canvas-root">
      <div ref={containerRef} className={styles.canvas} data-testid="graph-canvas" />
      <HoverTooltip cyRef={cyRef} ready={isReady} />
    </div>
  );
}
