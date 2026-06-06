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
