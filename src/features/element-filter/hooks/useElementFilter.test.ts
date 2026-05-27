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
        { group: 'nodes', data: { id: 'a', kind: 'Pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'Service' } },
        { group: 'edges', data: { id: 'e', source: 'a', target: 'b', edgeType: 'serviceSelector' } },
      ],
    });
    const layoutSpy = jest.spyOn(cy, 'layout');
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() =>
      useElementFilter({
        cyRef,
        elements: cy.elements().jsons() as cytoscape.ElementDefinition[],
        visibleKinds: ['Pod'],
        visibleEdgeTypes: ['serviceSelector'],
      }),
    );

    expect(cy.getElementById('a').style('visibility')).toBe('visible');
    expect(cy.getElementById('b').style('visibility')).toBe('hidden');
    // Edge auto-hides because endpoint 'b' is hidden
    expect(cy.getElementById('e').style('visibility')).toBe('hidden');
    expect(layoutSpy).not.toHaveBeenCalled();
  });
});
