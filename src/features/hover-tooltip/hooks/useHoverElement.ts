import type cytoscape from 'cytoscape';
import { useEffect, useState } from 'react';

export interface HoveredElement {
  id: string;
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
  sourceLabel?: string;
  targetLabel?: string;
}

export interface UseHoverElementProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
}

function resolveLabel(cy: cytoscape.Core, id: string): string {
  const target = cy.getElementById(id);
  if (target.length === 0) {
    return id;
  }
  const lbl = target.data('label') as unknown;
  return typeof lbl === 'string' ? lbl : id;
}

export function useHoverElement({ cyRef }: UseHoverElementProps): HoveredElement | null {
  const [hovered, setHovered] = useState<HoveredElement | null>(null);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }

    const handleOver = (evt: cytoscape.EventObject): void => {
      const target = evt.target as cytoscape.NodeSingular | cytoscape.EdgeSingular;
      if (typeof target.id !== 'function') {
        return;
      }
      const isNode = target.isNode();
      const data = target.data() as Record<string, unknown>;
      const next: HoveredElement = {
        id: target.id(),
        group: isNode ? 'nodes' : 'edges',
        data,
      };
      if (!isNode) {
        const source = typeof data.source === 'string' ? data.source : '';
        const target2 = typeof data.target === 'string' ? data.target : '';
        next.sourceLabel = resolveLabel(cy, source);
        next.targetLabel = resolveLabel(cy, target2);
      }
      setHovered(next);
    };
    const handleOut = (): void => {
      setHovered(null);
    };
    const handleRemove = (evt: cytoscape.EventObject): void => {
      const target = evt.target as cytoscape.NodeSingular | cytoscape.EdgeSingular;
      if (typeof target.id === 'function') {
        setHovered((current) => (current !== null && current.id === target.id() ? null : current));
      }
    };

    cy.on('mouseover', 'node, edge', handleOver);
    cy.on('mouseout', 'node, edge', handleOut);
    cy.on('remove', 'node, edge', handleRemove);

    return (): void => {
      cy.off('mouseover', 'node, edge', handleOver);
      cy.off('mouseout', 'node, edge', handleOut);
      cy.off('remove', 'node, edge', handleRemove);
    };
  }, [cyRef]);

  return hovered;
}
