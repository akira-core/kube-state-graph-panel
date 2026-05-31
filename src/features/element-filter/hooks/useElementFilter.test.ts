import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { useElementFilter } from './useElementFilter';

describe('useElementFilter', () => {
  it('applies visibility hidden to filtered nodes without calling layout', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'service' } },
        { group: 'edges', data: { id: 'e', source: 'a', target: 'b', edgeType: 'service-selects-pod' } },
      ],
    });
    const layoutSpy = jest.spyOn(cy, 'layout');
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() =>
      useElementFilter({
        cyRef,
        elements: cy.elements().jsons() as cytoscape.ElementDefinition[],
        visibleKinds: ['pod'],
        visibleEdgeTypes: ['service-selects-pod'],
      })
    );

    expect(cy.getElementById('a').style('visibility')).toBe('visible');
    expect(cy.getElementById('b').style('visibility')).toBe('hidden');
    // Edge auto-hides because endpoint 'b' is hidden
    expect(cy.getElementById('e').style('visibility')).toBe('hidden');
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('keeps a meta-edge visible by endpoint visibility, exempt from edge-type filter', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'pod' } },
        { group: 'nodes', data: { id: 'c', kind: 'service' } },
        // meta-edge has no edgeType and is NOT in `elements` → must not be hidden
        // by the edge-type pass; visibility follows its endpoints.
        { group: 'edges', data: { id: 'meta', source: 'a', target: 'b' } },
        { group: 'edges', data: { id: 'meta2', source: 'a', target: 'c' } },
      ],
    });
    cy.getElementById('meta').addClass('cy-expand-collapse-meta-edge');
    cy.getElementById('meta2').addClass('cy-expand-collapse-meta-edge');
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() =>
      useElementFilter({
        cyRef,
        // Only the real (non-meta) elements are passed in, as in production.
        elements: [
          { group: 'nodes', data: { id: 'a', kind: 'pod' } },
          { group: 'nodes', data: { id: 'b', kind: 'pod' } },
          { group: 'nodes', data: { id: 'c', kind: 'service' } },
        ] as cytoscape.ElementDefinition[],
        visibleKinds: ['pod'],
        visibleEdgeTypes: [],
      })
    );

    // a,b are pods → visible; c is service → hidden.
    expect(cy.getElementById('meta').style('visibility')).toBe('visible');
    // meta2 has a hidden endpoint (c) → hidden.
    expect(cy.getElementById('meta2').style('visibility')).toBe('hidden');
  });
});
