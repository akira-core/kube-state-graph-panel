import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { computeVisibility } from '../computeVisibility';

import { useElementFilter } from './useElementFilter';

describe('useElementFilter', () => {
  it('applies visibility hidden to filtered nodes without calling layout', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'pod' } },
        { group: 'nodes', data: { id: 'c', kind: 'service' } },
        // a↔b keeps both pods connected (so they survive the orphan pass); a→c is
        // hidden because endpoint c (a filtered service kind) is hidden.
        { group: 'edges', data: { id: 'ab', source: 'a', target: 'b', edgeType: 'pod-calls-pod' } },
        { group: 'edges', data: { id: 'ac', source: 'a', target: 'c', edgeType: 'service-selects-pod' } },
      ],
    });
    const layoutSpy = jest.spyOn(cy, 'layout');
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() =>
      useElementFilter({
        cyRef,
        sets: computeVisibility(
          cy.elements().jsons() as cytoscape.ElementDefinition[],
          ['pod'],
          ['pod-calls-pod', 'service-selects-pod']
        ),
      })
    );

    expect(cy.getElementById('a').style('visibility')).toBe('visible');
    expect(cy.getElementById('b').style('visibility')).toBe('visible');
    expect(cy.getElementById('c').style('visibility')).toBe('hidden');
    // Edge auto-hides because endpoint 'c' is hidden
    expect(cy.getElementById('ac').style('visibility')).toBe('hidden');
    expect(cy.getElementById('ab').style('visibility')).toBe('visible');
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('keeps a meta-edge visible by endpoint visibility, exempt from edge-type filter', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'pod' } },
        { group: 'nodes', data: { id: 'anchor', kind: 'pod' } },
        { group: 'nodes', data: { id: 'c', kind: 'service' } },
        // Real edges keep a & b connected (as in production, where a collapsed
        // container's real edges remain in `elements` and the meta-edge merely
        // aggregates them visually).
        { group: 'edges', data: { id: 'ra', source: 'a', target: 'anchor', edgeType: 'pod-calls-pod' } },
        { group: 'edges', data: { id: 'rb', source: 'b', target: 'anchor', edgeType: 'pod-calls-pod' } },
        // meta-edges have no edgeType and are NOT in `elements` → must not be
        // hidden by the edge-type pass; visibility follows their endpoints.
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
        // Only the real (non-meta) elements feed the visibility sets, as in production.
        sets: computeVisibility(
          [
            { group: 'nodes', data: { id: 'a', kind: 'pod' } },
            { group: 'nodes', data: { id: 'b', kind: 'pod' } },
            { group: 'nodes', data: { id: 'anchor', kind: 'pod' } },
            { group: 'nodes', data: { id: 'c', kind: 'service' } },
            { group: 'edges', data: { id: 'ra', source: 'a', target: 'anchor', edgeType: 'pod-calls-pod' } },
            { group: 'edges', data: { id: 'rb', source: 'b', target: 'anchor', edgeType: 'pod-calls-pod' } },
          ] as cytoscape.ElementDefinition[],
          ['pod'],
          ['pod-calls-pod']
        ),
      })
    );

    // a,b,anchor are pods (connected) → visible; c is a service → hidden.
    // meta (a→b): both endpoints visible → visible, despite having no edgeType.
    expect(cy.getElementById('meta').style('visibility')).toBe('visible');
    // meta2 (a→c): endpoint c hidden → hidden.
    expect(cy.getElementById('meta2').style('visibility')).toBe('hidden');
  });
});
