import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import type cytoscape from 'cytoscape';
import React, { useEffect, useMemo, useRef } from 'react';

import { useElementFilter } from '../../../element-filter';
import { HoverTooltip } from '../../../hover-tooltip';
import { buildSwitchConstraints, readSwitchLevels } from '../../../switch-topology';
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
    onContextSelect,
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

  // collapseApplyToken bumps on a collapsed-set CONTENT change → gates the diff-patch
  // re-collapse cycle so a fold/unfold is APPLIED. layoutToken bumps on a pod-parent
  // mode flip OR requestRelayout() → gates the layout. A fold/unfold bumps ONLY
  // collapseApplyToken, so the extension toggles it in place and the rest of the
  // graph keeps its positions (no global relayout). requestRelayout covers the two
  // cases that DO need a fresh layout but change neither the mode nor the collapsed
  // set: the mount-time default-collapse (applied after the layout pass) and a
  // refresh adding a wholly-new, unanchorable family (idempotent: an extra bump —
  // e.g. StrictMode double-mount — only causes one more convergent pass).
  const { collapseApplyToken, layoutToken, requestRelayout } = useLayoutRunToken({ collapsedIds, podParentMode });

  // Derive switch-fabric tier constraints from the current graph. Applied by
  // useGraphLayout only when the active layout is fcose; null (no-op) when there
  // are no switches. useGraphLayout reads the latest value at layout-run time, so
  // a refresh-driven identity change here does not by itself rerun the layout.
  // Only levelled switches are pinned. K8s nodes stay free in both pod-parent
  // modes — their node-to-switch uplink edges alone pull them toward the fabric
  // (a former min-1 fabric-tier pin dragged whole cluster compounds onto the
  // fabric and caused compound overlap; see switch-tier-layout spec).
  const switchConstraints = useMemo(() => buildSwitchConstraints(readSwitchLevels(elements)), [elements]);

  const collapseEnabled = onCollapsedChange !== undefined;

  const { containerRef, cyRef, isReady } = useCytoscape({
    elements,
    stylesheet,
    podParentMode,
    // collapseKey is collapseApplyToken (collapsed-set CONTENT): it applies a
    // fold/unfold via the diff-patch re-collapse cycle WITHOUT bumping layoutToken,
    // so the extension toggles in place and no global relayout runs. onStructuralRelayout
    // relayouts once when a new unanchorable family is added on refresh (anchored
    // pod-under-existing-parent adds skip it → D7 kept).
    ...(collapseEnabled
      ? { apiRef, collapsedIdsRef, suppressRef, onCollapsedChange, collapseKey: collapseApplyToken, onStructuralRelayout: requestRelayout }
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
        // Non-selectable nodes (cluster backplates — selectable:false in normalize)
        // are decorative: a tap deselects, like a background tap, so they never open
        // the detail panel. They stay grabbable, and a drag fires no 'tap', so
        // dragging a cluster is unaffected.
        if (!single.selectable()) {
          onSelect(null);
          return;
        }
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

  // Right-click (cxttap) → report the node for the detail-URL flow. KsgPanel
  // routes it through the SAME controlled selectedId as tap, so the blue
  // highlight and the detail panel stay in sync (D1). cytoscape's cxttap does
  // NOT preventDefault the DOM contextmenu, so the native menu is suppressed at
  // the container level — only while a consumer actually wires onContextSelect.
  useEffect(() => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (cy === null || container === null || onContextSelect === undefined) {
      return;
    }
    const handleCxtTap = (evt: cytoscape.EventObject): void => {
      if (evt.target === cy) {
        return; // background right-click: keep the current selection
      }
      const single = evt.target as cytoscape.NodeSingular;
      // Same selectability rule as tap: cluster backplates (selectable:false)
      // are decorative and never open the detail panel. Edges are ignored too.
      if (single.isNode() && single.selectable()) {
        onContextSelect(single.id());
      }
    };
    const suppressNativeMenu = (e: Event): void => {
      e.preventDefault();
    };
    cy.on('cxttap', handleCxtTap);
    container.addEventListener('contextmenu', suppressNativeMenu);
    return (): void => {
      cy.off('cxttap', handleCxtTap);
      container.removeEventListener('contextmenu', suppressNativeMenu);
    };
    // isReady gates binding until the instance exists (see useCytoscape).
  }, [cyRef, containerRef, onContextSelect, isReady]);

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
