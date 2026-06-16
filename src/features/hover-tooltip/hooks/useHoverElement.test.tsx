import { act, renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';

import { useHoverElement } from './useHoverElement';

function headlessCy(elements: cytoscape.ElementDefinition[]): cytoscape.Core {
  return cytoscape({ headless: true, styleEnabled: true, elements });
}

describe('useHoverElement', () => {
  it('binds only after the instance is ready, then surfaces the hovered node', () => {
    // Reproduces the original bug: the bind effect first runs while cyRef.current
    // is still null (child effect fires before the parent creates the instance).
    const cyRef = { current: null as cytoscape.Core | null };
    const { result, rerender } = renderHook(({ ready }) => useHoverElement({ cyRef, ready }), {
      initialProps: { ready: false },
    });
    expect(result.current).toBeNull();

    // The instance now exists and readiness flips — the effect must re-bind.
    const cy = headlessCy([{ group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod' } }]);
    cyRef.current = cy;
    rerender({ ready: true });

    act(() => {
      cy.getElementById('p1').emit('mouseover');
    });
    expect(result.current?.id).toBe('p1');

    act(() => {
      cy.getElementById('p1').emit('mouseout');
    });
    expect(result.current).toBeNull();
    cy.destroy();
  });

  it('gathers cluster + grouped PVC labels for a storageclass compound group', () => {
    const cy = headlessCy([
      { group: 'nodes', data: { id: 'cluster/prod', label: 'prod', isCluster: true, cluster: 'prod' } },
      {
        group: 'nodes',
        data: { id: 'prod/storageclass/fast-ssd', label: 'fast-ssd', isStorageClass: true, parent: 'cluster/prod' },
      },
      // Added out of order: the gathered list must be sorted (deterministic tooltip).
      {
        group: 'nodes',
        data: { id: 'pvc/b', label: 'data-mongo-1', kind: 'pvc', parent: 'prod/storageclass/fast-ssd' },
      },
      {
        group: 'nodes',
        data: { id: 'pvc/a', label: 'data-mongo-0', kind: 'pvc', parent: 'prod/storageclass/fast-ssd' },
      },
    ]);
    const cyRef = { current: cy };
    const { result } = renderHook(() => useHoverElement({ cyRef, ready: true }));
    act(() => {
      cy.getElementById('prod/storageclass/fast-ssd').emit('mouseover');
    });
    expect(result.current?.id).toBe('prod/storageclass/fast-ssd');
    expect(result.current?.storageClass).toEqual({ cluster: 'prod', pvcLabels: ['data-mongo-0', 'data-mongo-1'] });
    cy.destroy();
  });

  it('snapshots an element whose data carries a live cytoscape collection without overflowing', () => {
    // Reproduces the production hover crash: cytoscape-expand-collapse parks live
    // collections on element data (`collapsedChildren` on collapsed parents,
    // `originalEnds` on rerouted edges). Those collections reference cy, so they are
    // cyclic — a naive deep clone of `target.data()` recursed forever and threw
    // "Maximum call stack size exceeded" on every hover.
    const cy = headlessCy([
      { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod' } },
      { group: 'nodes', data: { id: 'p2', label: 'db', kind: 'pod' } },
    ]);
    // Park a live (cyclic) collection on the node, exactly as the extension does.
    cy.getElementById('p1').data('collapsedChildren', cy.nodes());
    const cyRef = { current: cy };
    const { result } = renderHook(() => useHoverElement({ cyRef, ready: true }));

    expect(() => {
      act(() => {
        cy.getElementById('p1').emit('mouseover');
      });
    }).not.toThrow();
    expect(result.current?.id).toBe('p1');
    expect(result.current?.data.label).toBe('web');
    cy.destroy();
  });

  it('never surfaces a tooltip for a cluster container node', () => {
    const cy = headlessCy([{ group: 'nodes', data: { id: 'cluster:demo', label: 'demo', isCluster: true } }]);
    const cyRef = { current: cy };
    const { result } = renderHook(() => useHoverElement({ cyRef, ready: true }));

    act(() => {
      cy.getElementById('cluster:demo').emit('mouseover');
    });
    expect(result.current).toBeNull();
    cy.destroy();
  });
});
