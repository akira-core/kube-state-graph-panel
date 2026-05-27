import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import type cytoscape from 'cytoscape';
import React, { useEffect } from 'react';

import { useElementFilter } from '../../../element-filter';
import { HoverTooltip } from '../../../hover-tooltip';
import { useCytoscape } from '../../hooks/useCytoscape';
import { useGraphLayout } from '../../hooks/useGraphLayout';
import { useGraphResize } from '../../hooks/useGraphResize';

import type { GraphCanvasProps } from './GraphCanvas.types';

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

export function GraphCanvas(props: Readonly<GraphCanvasProps>): React.JSX.Element {
  const { elements, stylesheet, layout, visibleKinds, visibleEdgeTypes, onSelect } = props;
  const styles = useStyles2(getStyles);

  const { containerRef, cyRef } = useCytoscape({
    elements,
    stylesheet,
  });

  useGraphLayout({ cyRef, name: layout });
  useGraphResize({ cyRef, containerRef });
  useElementFilter({ cyRef, elements, visibleKinds, visibleEdgeTypes });

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
  }, [cyRef, onSelect]);

  return (
    <div className={styles.root} data-testid="graph-canvas-root">
      <div ref={containerRef} className={styles.canvas} data-testid="graph-canvas" />
      <HoverTooltip cyRef={cyRef} />
    </div>
  );
}
