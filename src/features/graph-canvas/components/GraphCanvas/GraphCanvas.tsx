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
  // collapsed-change sink for the no-collapse path
}

export function GraphCanvas(props: Readonly<GraphCanvasProps>): React.JSX.Element {
  const {
    elements,
    stylesheet,
    layout,
    visibility,
    onSelect,
    selectedId,
    collapsedIds,
    onCollapsedChange,
    podParentMode,
    pinned,
  } = props;
  const styles = useStyles2(getStyles);

  // Owns the expand-collapse refs so useExpandCollapse (writer) and useCytoscape's
  // diff-patch (reader) share one api/guard/desired-set.
  const apiRef = useRef<cytoscape.ExpandCollapseApi | null>(null);
  const suppressRef = useRef(false);
  const collapsedIdsRef = useRef<ReadonlySet<string>>(collapsedIds ?? new Set());
  useEffect(() => {
    collapsedIdsRef.current = collapsedIds ?? new Set();
  }, [collapsedIds]);

  // collapseApplyToken gates the diff-patch re-collapse (fold/unfold applied in place,
  // no global relayout); layoutToken gates layout (pod-parent flip or requestRelayout).
  // requestRelayout covers fresh-layout cases that change neither mode nor collapsed set
  // (mount-time default-collapse, refresh adding an unanchorable family); idempotent
  // under StrictMode double-mount. See switch-tier-layout / expand-collapse specs.
  const { collapseApplyToken, layoutToken, requestRelayout } = useLayoutRunToken({ collapsedIds, podParentMode });

  // Switch-fabric tier constraints; null when no switches. Applied by useGraphLayout
  // only for fcose, read at layout-run time (a refresh identity change here alone
  // won't rerun layout). Only levelled switches are pinned — K8s nodes stay free so
  // a fabric-tier pin can't drag cluster compounds into overlap. See switch-tier-layout spec.
  const switchConstraints = useMemo(() => buildSwitchConstraints(readSwitchLevels(elements)), [elements]);

  const collapseEnabled = onCollapsedChange !== undefined;

  const { containerRef, cyRef, isReady } = useCytoscape({
    elements,
    stylesheet,
    podParentMode,
    // collapseKey applies fold/unfold in place (no layoutToken bump → no relayout).
    // onStructuralRelayout relayouts once for a new unanchorable family on refresh;
    // anchored pod-under-existing-parent adds skip it (D7 kept).
    ...(collapseEnabled
      ? {
          apiRef,
          collapsedIdsRef,
          suppressRef,
          onCollapsedChange,
          collapseKey: collapseApplyToken,
          onStructuralRelayout: requestRelayout,
        }
      : {}),
  });

  useGraphLayout({ cyRef, name: layout, runToken: layoutToken, switchConstraints });
  useGraphResize({ cyRef, containerRef });
  useElementFilter({ cyRef, sets: visibility });
  useExpandCollapse({
    cyRef,
    // false on the no-collapse path → effect early-returns, never calls the
    // (potentially unregistered) cy.expandCollapse.
    enabled: collapseEnabled,
    isReady,
    apiRef,
    collapsedIdsRef,
    suppressRef,
    onCollapsedChange: onCollapsedChange ?? noop,
    // Relayout once after the mount-time default-collapse lands.
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
        // Cluster backplates (selectable:false) are decorative: tap deselects like a
        // background tap, never opening the detail panel. Still grabbable; a drag fires
        // no 'tap' so dragging a cluster is unaffected.
        if (!single.selectable()) {
          onSelect(null);
          return;
        }
        onSelect(single.id());
        return;
      }
      // Edge taps deselect, like background taps.
      onSelect(null);
    };
    cy.on('tap', handleTap);
    return (): void => {
      cy.off('tap', handleTap);
    };
    // isReady gates binding until the instance exists.
  }, [cyRef, onSelect, isReady]);

  // Mirror selectedId into cytoscape's single selection so the highlight tracks the
  // detail panel. `elements` is a dep: a rebuild/re-add brings the node back UNSELECTED
  // without firing an event, so the mirror must re-apply on any element-set change.
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    selectSingle(cy, selectedId ?? null);
  }, [cyRef, selectedId, isReady, elements]);

  // Dim everything outside the selected node's focus set (colour alone is too subtle
  // on a dense graph). `elements` re-applies after a rebuild, which drops the imperative classes.
  useSelectionFocus({ cyRef, selectedId: selectedId ?? null, isReady, elements });

  return (
    <div className={styles.root} data-testid="graph-canvas-root">
      <div ref={containerRef} className={styles.canvas} data-testid="graph-canvas" />
      <HoverTooltip cyRef={cyRef} ready={isReady} pinned={pinned ?? null} />
    </div>
  );
}
